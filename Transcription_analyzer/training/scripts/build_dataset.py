#!/usr/bin/env python3
"""build_dataset.py — transcripts JSONL -> SFT chat dataset.

Each record (schema: README §5.3) becomes one or more training examples:
the prompt is exactly what the analyzer sends at inference (metrics + window),
the completion is the label rendered into the runtime output contract
({dim: {score, confidence, evidence}, drift_flag, notes}).

Splits are by persona when there are at least two personas, otherwise by
stratified file so single-persona corpora still have held-out examples.

Usage:
    python3 scripts/build_dataset.py \
        --input-dir ../data/transcripts --out-dir data/sft \
        [--max-window-chars 9000 --max-len 4096]

The analyzer package is imported from ../analyzer — run from the repo root
or anywhere inside it; no install needed.
"""
from __future__ import annotations

import argparse
import json
import random
import statistics
import sys
from collections import Counter
from pathlib import Path

_HERE = Path(__file__).resolve()


def _find_analyzer() -> Path:
    # Layouts: <root>/Transcription_analyzer/analyzer/analyzer/metrics.py
    # (worktree + Verda remote), or a bare mount <dir>/analyzer/metrics.py.
    # Returns the dir to put on sys.path so `import analyzer` works.
    for p in _HERE.parents:
        for cand in (p / "Transcription_analyzer" / "analyzer",
                     p, p / "analyzer"):
            if (cand / "analyzer" / "metrics.py").exists():
                return cand
    sys.exit("cannot locate the analyzer package "
             "(expected .../analyzer/analyzer/metrics.py)")


sys.path.insert(0, str(_find_analyzer()))

from analyzer import metrics, scoring, transcript  # noqa: E402

CONTRACT_DIMS = scoring.DIMENSIONS

# Deterministic ground truth for simulator records that carry no `labels`
# field: the injected state IS the label. Enabled with --derive-labels.
# Scores are absolute 0-100 (the contract's own scale); drift_flag marks
# "below a normal baseline", so joyful/recovery-noise stay interpretable.
STATE_LABELS: dict[str, dict] = {
    "normal":           {"responsiveness": 80, "engagement": 78,
                         "fluency": 82, "coherence": 85, "drift_flag": False},
    "stable":           {"responsiveness": 80, "engagement": 78,
                         "fluency": 82, "coherence": 85, "drift_flag": False},
    "joyful":           {"responsiveness": 88, "engagement": 92,
                         "fluency": 86, "coherence": 85, "drift_flag": False},
    "noisy":            {"responsiveness": 65, "engagement": 62,
                         "fluency": 70, "coherence": 76, "drift_flag": False},
    "sad":              {"responsiveness": 55, "engagement": 48,
                         "fluency": 65, "coherence": 78, "drift_flag": True},
    "depressed":        {"responsiveness": 30, "engagement": 25,
                         "fluency": 50, "coherence": 68, "drift_flag": True},
    "gradual_decline":  {"responsiveness": 45, "engagement": 40,
                         "fluency": 60, "coherence": 74, "drift_flag": True},
    "abrupt_drop":      {"responsiveness": 30, "engagement": 25,
                         "fluency": 50, "coherence": 68, "drift_flag": True},
    "recovery":         {"responsiveness": 62, "engagement": 58,
                         "fluency": 70, "coherence": 78, "drift_flag": True},
}


def _stratified_file_split(by_state: dict[str, set[str]],
                           n_test: int, n_val: int,
                           rng: random.Random) -> dict[str, set[str]]:
    """Hold out whole files per split, drawing one file per state per pass
    so the split stays state-stratified and every state keeps >=1 file in
    train. Used for single-persona corpora where persona-split is void."""
    test: set[str] = set()
    val: set[str] = set()
    states = sorted(by_state, key=lambda s: -len(by_state[s]))

    def take(target: set[str], n: int) -> None:
        progress = True
        while len(target) < n and progress:
            progress = False
            for s in states:
                if len(target) >= n:
                    break
                pool = sorted(by_state[s] - test - val)
                if len(pool) <= 1:            # keep >=1 file for train
                    continue
                rng.shuffle(pool)
                target.add(pool[0])
                progress = True

    take(test, n_test)
    take(val, n_val)
    all_files = set().union(*by_state.values()) if by_state else set()
    return {"test": test, "val": val, "train": all_files - test - val}


def labels_to_contract(labels: dict) -> dict:
    """Flat {dim: int, drift_flag} -> the runtime nested output contract."""
    out: dict = {}
    for d in CONTRACT_DIMS:
        v = labels.get(d, 0)
        out[d] = (v if isinstance(v, dict) else
                  {"score": int(v), "confidence": 1.0, "evidence": []})
    out["drift_flag"] = bool(labels.get("drift_flag", False))
    out["notes"] = str(labels.get("notes", ""))
    return out


def _tokenizer(path: Path):
    from transformers import AutoTokenizer

    tok = AutoTokenizer.from_pretrained(path, local_files_only=True)
    template_path = path / "chat_template.jinja"
    if not tok.chat_template and template_path.is_file():
        tok.chat_template = template_path.read_text(encoding="utf-8")
    if not tok.chat_template:
        raise RuntimeError(f"no chat template found in {path}")
    return tok


def _token_length(messages: list[dict], tok) -> int:
    ids = tok.apply_chat_template(
        messages, tokenize=True, enable_thinking=False)
    ids = ids["input_ids"] if hasattr(ids, "keys") else ids
    return int(ids.shape[-1]) if hasattr(ids, "shape") else len(ids)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--input-dir", required=True, type=Path,
                    help="directory of transcript *.jsonl files")
    ap.add_argument("--out-dir", required=True, type=Path)
    ap.add_argument("--val-frac", type=float, default=0.1)
    ap.add_argument("--test-frac", type=float, default=0.1)
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--max-window-turns", type=int, default=120)
    ap.add_argument("--overlap", type=int, default=20)
    ap.add_argument("--max-window-chars", type=int, default=9000)
    ap.add_argument("--max-len", type=int, default=4096)
    ap.add_argument("--tokenizer", type=Path,
                    default=_HERE.parents[2] / "models/qwen3-8b-lora-run1")
    ap.add_argument("--target", default="target")
    ap.add_argument("--derive-labels", action="store_true",
                    help="for records without `labels`: synthesise them from "
                         "the record's `trajectory` via STATE_LABELS")
    ap.add_argument("--split-by", choices=("auto", "persona", "file"),
                    default="auto",
                    help="split unit: persona (anti-leakage, needs >=2 "
                         "personas) or file (single-persona corpora; caveat: "
                         "eval sees unseen windows of a seen speaker). "
                         "'auto' = persona if >=2 personas else file.")
    args = ap.parse_args()

    tok = _tokenizer(args.tokenizer)
    rng = random.Random(args.seed)
    examples: list[dict] = []
    skipped = 0
    per_state: Counter = Counter()

    for path in sorted(args.input_dir.glob("*.jsonl")):
        for rec in transcript.load_jsonl(path, args.target):
            if not rec.labels:
                if not args.derive_labels:
                    skipped += 1
                    continue
                derived = STATE_LABELS.get(rec.trajectory or "")
                if derived is None:
                    skipped += 1
                    continue
                rec.labels = {**derived,
                              "notes": f"derived from injected state "
                                       f"'{rec.trajectory}'"}
            for win in transcript.expand_windows(
                    rec, args.max_window_turns, args.overlap,
                    args.max_window_chars):
                m = metrics.extract(win, args.target)
                messages = scoring.build_messages(win, m, args.target)
                messages.append({
                    "role": "assistant",
                    "content": json.dumps(
                        labels_to_contract(win.labels), ensure_ascii=False),
                })
                example = {
                    "messages": messages,
                    "persona_id": rec.persona_id,
                    "day": rec.day,
                    "trajectory": rec.trajectory,
                    "file": path.stem,
                    "example_id": f"{win.record_id}#{win.seq}",
                    "record_id": win.record_id,
                    "seq": win.seq,
                    "labels": labels_to_contract(win.labels),
                }
                example["token_count"] = _token_length(messages, tok)
                examples.append(example)
                per_state[rec.trajectory] += 1

    if not examples:
        raise SystemExit("no labeled examples found")
    offenders = [e for e in examples if e["token_count"] > args.max_len]
    if offenders:
        details = "\n".join(
            f"  {e['file']} {e['example_id']}: {e['token_count']} tokens"
            for e in offenders)
        raise SystemExit(
            f"{len(offenders)} examples exceed --max-len {args.max_len}:\n{details}")

    personas = sorted({e["persona_id"] for e in examples})
    split_by = args.split_by
    if len(personas) < 2:
        split_by = "file"
    elif split_by == "auto":
        split_by = "persona"

    if split_by == "file":
        by_state: dict[str, set[str]] = {}
        for e in examples:
            by_state.setdefault(e["trajectory"], set()).add(e["file"])
        n_files = len({e["file"] for e in examples})
        n_test = min(max(1, round(n_files * args.test_frac)), n_files - 1)
        n_val = (min(max(1, round(n_files * args.val_frac)), n_files - n_test - 1)
                 if n_files >= 3 else 0)
        splits = _stratified_file_split(
            by_state, n_test, n_val, rng)
        unit_key = "file"
    else:
        rng.shuffle(personas)
        n_test = min(max(1, round(len(personas) * args.test_frac)),
                     len(personas) - 1)
        n_val = (min(max(1, round(len(personas) * args.val_frac)),
                     len(personas) - n_test - 1)
                 if len(personas) >= 3 else 0)
        splits = {
            "test": set(personas[:n_test]),
            "val": set(personas[n_test:n_test + n_val]),
            "train": set(personas[n_test + n_val:]),
        }
        unit_key = "persona_id"

    args.out_dir.mkdir(parents=True, exist_ok=True)
    counts: Counter = Counter()
    token_stats: dict[str, dict] = {}
    state_splits: dict[str, dict[str, int]] = {}
    for name in ("train", "val", "test"):
        rows = [e for e in examples if e[unit_key] in splits[name]]
        rng.shuffle(rows)
        lengths = [e["token_count"] for e in rows]
        token_stats[name] = ({
            "min": min(lengths),
            "median": statistics.median(lengths),
            "max": max(lengths),
        } if lengths else {"min": None, "median": None, "max": None})
        state_splits[name] = dict(Counter(e["trajectory"] for e in rows))
        with (args.out_dir / f"{name}.jsonl").open("w") as f:
            for e in rows:
                f.write(json.dumps(
                    {k: v for k, v in e.items() if k != "token_count"},
                    ensure_ascii=False) + "\n")
        counts[name] = len(rows)

    if not counts["train"]:
        raise SystemExit("split produced an empty training set")
    print(json.dumps({
        "examples": len(examples),
        "records_without_labels": skipped,
        "personas": len(personas),
        "split_by": split_by,
        "split_units": {n: sorted(s) for n, s in splits.items()},
        "splits": dict(counts),
        "per_state": dict(per_state),
        "per_state_per_split": state_splits,
        "token_stats": token_stats,
        "max_window_chars": args.max_window_chars,
        "max_len": args.max_len,
        "tokenizer": str(args.tokenizer),
        "out_dir": str(args.out_dir),
    }, indent=2))


if __name__ == "__main__":
    main()
