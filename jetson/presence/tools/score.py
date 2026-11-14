"""Score a field test: compare ticks.jsonl (what the system said) to ground truth.

Ground truth comes from either
  * POST /truth?state=home|away markers sent while testing (stored in every tick), or
  * a CSV diary:  start,end,state   (ISO "2026-11-14T09:00" or unix seconds)
                  2026-11-14T09:12,2026-11-14T10:05,away

Usage:
  wendy device ... copy /data/ticks.jsonl  (or curl it off the volume), then
  python tools/score.py ticks.jsonl [diary.csv] [--lag-min 10]

Reports
  * tick accuracy (home/away), excluding a grace window after each true transition
    equal to the configured away delay (the system is *designed* to wait that long)
  * outing recall / precision (an outing matches if they overlap)
  * start/end timing error per matched outing
  * coverage: share of ticks where the state was UNKNOWN
"""
from __future__ import annotations

import csv
import json
import sys
from datetime import datetime


def ts(x: str) -> float:
    try:
        return float(x)
    except ValueError:
        return datetime.fromisoformat(x).timestamp()


def intervals(points, value):
    """[(t, state)] -> [(start, end)] where state == value."""
    out, start = [], None
    for t, s in points:
        if s == value and start is None:
            start = t
        elif s != value and start is not None:
            out.append((start, t))
            start = None
    if start is not None:
        out.append((start, points[-1][0]))
    return out


def main(argv):
    lag = 10.0
    if "--lag-min" in argv:
        i = argv.index("--lag-min")
        lag = float(argv[i + 1])
        argv = argv[:i] + argv[i + 2:]
    args = [a for a in argv if not a.startswith("--")]
    ticks = [json.loads(line) for line in open(args[0]) if line.strip()]
    ticks.sort(key=lambda r: r["t"])

    truth_iv = []
    if len(args) > 1:
        for row in csv.DictReader(open(args[1])):
            truth_iv.append((ts(row["start"]), ts(row["end"]), row["state"].strip()))

    def truth_at(t, rec):
        for a, b, s in truth_iv:
            if a <= t < b:
                return s
        return rec.get("truth")

    pred_pts, true_pts, transitions = [], [], []
    prev = None
    for r in ticks:
        tr = truth_at(r["t"], r)
        if tr is None:
            continue
        if prev is not None and tr != prev:
            transitions.append(r["t"])
        prev = tr
        pred_pts.append((r["t"], r["state"]))
        true_pts.append((r["t"], tr))
    if not pred_pts:
        print("no ticks with ground truth — send POST /truth markers or pass a diary CSV")
        return 1

    grace = lag * 60
    ok = n = unknown = 0
    for (t, p), (_, tr) in zip(pred_pts, true_pts):
        if any(0 <= t - x < grace for x in transitions):
            continue
        n += 1
        if p == "unknown":
            unknown += 1
        ok += p == tr

    true_out = intervals(true_pts, "away")
    pred_out = intervals(pred_pts, "away")
    matched = [(a, b) for a in true_out for b in pred_out if a[0] < b[1] and b[0] < a[1]]
    recall = len({a for a, _ in matched}) / len(true_out) if true_out else float("nan")
    precision = len({b for _, b in matched}) / len(pred_out) if pred_out else float("nan")

    print(f"ticks scored          {n}  (grace {lag:.0f} min after each real transition)")
    print(f"tick accuracy         {ok / max(1, n):.1%}")
    print(f"unknown share         {unknown / max(1, n):.1%}")
    print(f"real outings          {len(true_out)}   detected {len(pred_out)}")
    print(f"outing recall         {recall:.0%}   precision {precision:.0%}")
    for a, b in matched:
        print(f"  outing {datetime.fromtimestamp(a[0]):%m-%d %H:%M}  "
              f"start err {(b[0] - a[0]) / 60:+.1f} min  end err {(b[1] - a[1]) / 60:+.1f} min")
    missed = [a for a in true_out if not any(a == m[0] for m in matched)]
    for a in missed:
        print(f"  MISSED {datetime.fromtimestamp(a[0]):%m-%d %H:%M}  ({(a[1] - a[0]) / 60:.0f} min)")
    false = [b for b in pred_out if not any(b == m[1] for m in matched)]
    for b in false:
        print(f"  FALSE  {datetime.fromtimestamp(b[0]):%m-%d %H:%M}  ({(b[1] - b[0]) / 60:.0f} min)")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
