#!/usr/bin/env python3
"""Final-variable criteria (plan phase 4, item 53): compare models on the
*derived* variables, not only on keypoints.

Input: a long-format CSV produced by running the posture-analysis/posture pipeline
once per pose model on the person-disjoint test sequences that have an
external ground truth (stopwatch over marked distance, goniometer, manual
step count...):

    sequence_id,person_id,variable,ground_truth,model,value
    walk_P07_01,P07,walking_speed_mps,1.12,baseline,1.05
    walk_P07_01,P07,walking_speed_mps,1.12,ft,1.10
    ...

Output per (variable, model): n, MAE, mean relative error, bias and
Bland-Altman 95% limits of agreement, and the fraction of sequences within
--tol (relative, default 5% -- the plan's distance criterion). A model
passes when it is at least as good as the baseline on every variable.

Wiring this to the posture pipeline (re-run with a custom pose ONNX and
dump the per-episode variables) is left to posture-analysis/posture; this script only
does the statistics.

Usage:
    python scripts/eval_variables.py --csv work_dirs/eval/variables.csv --baseline baseline
"""
from __future__ import annotations

import argparse
import csv
import json
import sys
from collections import defaultdict

import numpy as np


def agreement(gt: np.ndarray, pred: np.ndarray, tol: float) -> dict:
    gt, pred = np.asarray(gt, float), np.asarray(pred, float)
    d = pred - gt
    rel = np.abs(d) / np.maximum(np.abs(gt), 1e-9)
    sd = float(d.std(ddof=1)) if d.size > 1 else float("nan")
    return {
        "n": int(d.size),
        "mae": float(np.abs(d).mean()),
        "mean_rel_err": float(rel.mean()),
        "bias": float(d.mean()),
        "loa_low": float(d.mean() - 1.96 * sd),
        "loa_high": float(d.mean() + 1.96 * sd),
        "within_tol": float((rel <= tol).mean()),
    }


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--csv", required=True)
    ap.add_argument("--baseline", default="baseline")
    ap.add_argument("--tol", type=float, default=0.05)
    ap.add_argument("--out", default=None)
    args = ap.parse_args(argv)

    data = defaultdict(lambda: ([], []))
    with open(args.csv, newline="") as f:
        for r in csv.DictReader(f):
            g, p = data[(r["variable"], r["model"])]
            g.append(float(r["ground_truth"]))
            p.append(float(r["value"]))
    res = {f"{v}|{m}": agreement(np.array(g), np.array(p), args.tol)
           for (v, m), (g, p) in sorted(data.items())}
    verdict = {}
    for (v, m) in data:
        if m == args.baseline:
            continue
        b = res.get(f"{v}|{args.baseline}")
        if b:
            verdict.setdefault(m, True)
            verdict[m] &= res[f"{v}|{m}"]["mae"] <= b["mae"]
    for k, r in res.items():
        print(f"{k:40s} n={r['n']:3d} MAE={r['mae']:.4f} rel={r['mean_rel_err']:.3f} "
              f"bias={r['bias']:+.4f} LoA=[{r['loa_low']:+.4f},{r['loa_high']:+.4f}] "
              f"within{args.tol:.0%}={r['within_tol']:.2f}")
    for m, ok in verdict.items():
        print(f"{m}: {'PASS' if ok else 'FAIL'} (MAE <= {args.baseline} on every variable)")
    if args.out:
        with open(args.out, "w") as f:
            json.dump({"results": res, "verdict": verdict}, f, indent=2)
    return 0 if all(verdict.values()) else 1


if __name__ == "__main__":
    sys.exit(main())
