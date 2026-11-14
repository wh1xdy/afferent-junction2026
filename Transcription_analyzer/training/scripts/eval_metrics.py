#!/usr/bin/env python3
"""eval_metrics.py — compare model predictions against injected gold labels.

Pure stdlib. Inputs:
  --gold  JSONL with {"labels": {dim: int|{score}, "drift_flag": bool}, ...}
          (as produced by the simulator / build_dataset sources)
  --pred  JSONL with {"record_id"|"persona_id|day", "scores": {...}} aligned
          by the join key below — or {"labels"}-shaped rows for A/B files.

Join key: --join-on record_id|day|persona_id (default: day — both files list
the same windows in the same order when from the same generator run).

Metrics per README §7: Pearson r per dimension, AUROC + accuracy on
drift_flag.
"""
from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path

DIMS = ("responsiveness", "engagement", "fluency", "coherence")


def _dim_score(v) -> float:
    return float(v["score"] if isinstance(v, dict) else v)


def _load(path: Path, key: str, field: str) -> dict:
    out = {}
    for line in path.read_text().splitlines():
        if not line.strip():
            continue
        rec = json.loads(line)
        k = str(rec.get(key, rec.get("record_id", "")))
        out[k] = rec.get(field, rec.get("labels", {}))
    return out


def _pearson(xs: list[float], ys: list[float]) -> float | None:
    n = len(xs)
    if n < 3:
        return None
    mx, my = sum(xs) / n, sum(ys) / n
    num = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
    dx = math.sqrt(sum((x - mx) ** 2 for x in xs))
    dy = math.sqrt(sum((y - my) ** 2 for y in ys))
    return round(num / (dx * dy), 3) if dx > 0 and dy > 0 else None


def _auroc(scores: list[float], flags: list[bool]) -> float | None:
    """Rank-based AUROC of `scores` predicting `flags` (flag = degraded =
    LOW score expected, so we negate)."""
    pos = [s for s, f in zip(scores, flags) if f]
    neg = [s for s, f in zip(scores, flags) if not f]
    if not pos or not neg:
        return None
    wins = sum(1 if p < n else 0.5 if p == n else 0.0
               for p in pos for n in neg)
    return round(wins / (len(pos) * len(neg)), 3)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--gold", required=True, type=Path)
    ap.add_argument("--pred", required=True, type=Path)
    ap.add_argument("--join-on", default="day")
    ap.add_argument("--pred-field", default="scores",
                    help="field holding predicted scores in --pred rows")
    ap.add_argument("--gold-field", default="labels")
    ap.add_argument("--flag-threshold", type=float, default=50.0,
                    help="predicted composite below this = predicted drift")
    args = ap.parse_args()

    gold = _load(args.gold, args.join_on, args.gold_field)
    pred = _load(args.pred, args.join_on, args.pred_field)
    keys = sorted(set(gold) & set(pred))
    if not keys:
        sys.exit("no overlapping join keys between gold and pred")

    report: dict = {"n": len(keys), "pearson": {}, "drift_flag": {}}
    for d in DIMS:
        g = [_dim_score(gold[k][d]) for k in keys]
        p = [_dim_score(pred[k][d]) for k in keys]
        report["pearson"][d] = _pearson(g, p)

    g_flags = [bool(gold[k].get("drift_flag")) for k in keys]
    composites = [sum(_dim_score(pred[k][d]) for d in DIMS) / len(DIMS)
                  for k in keys]
    p_flags = [c < args.flag_threshold for c in composites]
    report["drift_flag"] = {
        "auroc": _auroc(composites, g_flags),
        "accuracy": round(sum(a == b for a, b in zip(p_flags, g_flags))
                          / len(keys), 3),
        "gold_positive_rate": round(sum(g_flags) / len(keys), 3),
    }
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
