#!/usr/bin/env python3
"""build_dataset.py — transcripts JSONL -> SFT chat dataset.

Each record (schema: README §5.3) becomes one or more training examples:
the prompt is exactly what the analyzer sends at inference (metrics + window),
the completion is the label rendered into the runtime output contract
({dim: {score, confidence, evidence}, drift_flag, notes}).

Splits are by persona_id — all windows of a persona land in the same split
so the model cannot memorise speakers across the boundary.

Usage:
    python3 scripts/build_dataset.py \
        --input-dir ../data/transcripts --out-dir data/sft \
        [--val-frac 0.1 --test-frac 0.1 --seed 42]

The analyzer package is imported from ../analyzer — run from the repo root
or anywhere inside it; no install needed.
"""
from __future__ import annotations

import argparse
import json
import random
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
                    rec, args.max_window_turns, args.overlap):
                m = metrics.extract(win, args.target)
                messages = scoring.build_messages(win, m, args.target)
                messages.append({
                    "role": "assistant",
                    "content": json.dumps(
                        labels_to_contract(win.labels), ensure_ascii=False),
                })
                examples.append({
                    "messages": messages,
                    "persona_id": rec.persona_id,
                    "day": rec.day,
                    "trajectory": rec.trajectory,
                    "file": path.stem,
                })
                per_state[rec.trajectory] += 1

    personas = sorted({e["persona_id"] for e in examples})
    split_by = args.split_by
    if split_by == "auto":
        split_by = "persona" if len(personas) >= 2 else "file"

    if split_by == "file":
        by_state: dict[str, set[str]] = {}
        for e in examples:
            by_state.setdefault(e["trajectory"], set()).add(e["file"])
        n_files = sum(len(v) for v in by_state.values())
        splits = _stratified_file_split(
            by_state,
            max(1, round(n_files * args.test_frac)),
            max(1, round(n_files * args.val_frac)),
            rng)
        unit_key = "file"
    else:
        rng.shuffle(personas)
        n_test = int(len(personas) * args.test_frac)
        n_val = int(len(personas) * args.val_frac)
        splits = {
            "test": set(personas[:n_test]),
            "val": set(personas[n_test:n_test + n_val]),
            "train": set(personas[n_test + n_val:]),
        }
        unit_key = "persona_id"

    args.out_dir.mkdir(parents=True, exist_ok=True)
    counts: Counter = Counter()
    for name in ("train", "val", "test"):
        rows = [e for e in examples if e[unit_key] in splits[name]]
        rng.shuffle(rows)
        with (args.out_dir / f"{name}.jsonl").open("w") as f:
            for e in rows:
                f.write(json.dumps({"messages": e["messages"],
                                    "persona_id": e["persona_id"],
                                    "day": e["day"],
                                    "trajectory": e["trajectory"],
                                    "file": e["file"]},
                                   ensure_ascii=False) + "\n")
        counts[name] = len(rows)

    print(json.dumps({
        "examples": len(examples),
        "records_without_labels": skipped,
        "personas": len(personas),
        "split_by": split_by,
        "split_units": {n: sorted(s) for n, s in splits.items()},
        "splits": dict(counts),
        "per_state": dict(per_state),
        "out_dir": str(args.out_dir),
    }, indent=2))


if __name__ == "__main__":
    main()
