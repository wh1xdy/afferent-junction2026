#!/usr/bin/env python3
"""Analyse an exported Afferent expressions session (afferent-session-*.json).

Shows what the thresholds in Expressions.swift see on a real face, so they can be tuned:
per-expression baseline / spread / peaks, re-detected bursts with adjustable thresholds,
gaze (shifts, time away), blinks. Stdlib only.

  python3 analyze_session.py afferent-session-20261114-091500.json [--min-rise 0.12] [--mad-k 4]
"""
import argparse
import json
import math
import statistics as st


def surprise(v):
    bo = (v("browOuterUpLeft") + v("browOuterUpRight")) / 2
    raw = 0.6 * bo + 0.2 * (v("eyeWideLeft") + v("eyeWideRight")) / 2 + 0.2 * v("jawOpen")
    return raw if bo > 0.2 else 0.3 * raw


def running_away(yaw, pitch):
    """deviation from the running median gaze (10 Hz history, 60 s), like the app"""
    hy, hp, out, base = [], [], [], None
    for i, (y, p) in enumerate(zip(yaw, pitch)):
        if i % 6 == 0:
            hy.append(y); hp.append(p)
            hy, hp = hy[-600:], hp[-600:]
            base = (sorted(hy)[len(hy) // 2], sorted(hp)[len(hp) // 2])
        b = base or (y, p)
        out.append(math.hypot(y - b[0], p - b[1]))
    return out


def composites(row, col):
    v = lambda k: row[col[k]] if k in col else 0.0
    sl, sr = v("mouthSmileLeft"), v("mouthSmileRight")
    return {
        "happy": (sl + sr) / 2 * 0.8 + (v("cheekSquintLeft") + v("cheekSquintRight")) / 2 * 0.2,
        "sad": 0.5 * v("browInnerUp") + 0.5 * (v("mouthFrownLeft") + v("mouthFrownRight")) / 2,
        "anger": 0.6 * (v("browDownLeft") + v("browDownRight")) / 2 + 0.4 * (v("mouthPressLeft") + v("mouthPressRight")) / 2,
        "disgust": 0.6 * (v("noseSneerLeft") + v("noseSneerRight")) / 2 + 0.4 * (v("mouthUpperUpLeft") + v("mouthUpperUpRight")) / 2,
        "surprise": surprise(v),
        "contempt": abs(sl - sr),
    }


MIN_RISE = {"happy": 0.04, "contempt": 0.05}   # others: --min-rise (default 0.10)


def bursts(ts, xs, min_rise, mad_k, hist=300):
    """Same algorithm as BurstDetector in Expressions.swift."""
    out, h, active = [], [], None
    for t, x in zip(ts, xs):
        base = sorted(h)[len(h) // 2] if h else 0.0
        mad = sorted(abs(a - base) for a in h)[len(h) // 2] if h else 0.0
        h.append(x)
        h = h[-hist:]
        thr = max(min_rise, mad_k * mad)
        if active:
            active[1] = max(active[1], x)
            if x < base + thr / 2:
                d = t - active[0]
                if d >= 0.04:
                    out.append((active[0], d, active[1] - base))
                active = None
        elif len(h) >= 30 and x > base + thr:
            active = [t, x]
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("file")
    ap.add_argument("--min-rise", type=float, default=0.10)
    ap.add_argument("--mad-k", type=float, default=4.0)
    a = ap.parse_args()
    doc = json.load(open(a.file))
    norm = lambda k: k[:-2] + "Left" if k.endswith("_L") else k[:-2] + "Right" if k.endswith("_R") else k
    cols = [norm(c) for c in doc["columns"]]      # v1 exports used ARKit's "_L"/"_R" names
    col = {c: i for i, c in enumerate(cols)}
    rows = doc["frames"]
    ts = [r[0] for r in rows]
    dur = ts[-1] - ts[0] if len(ts) > 1 else 0
    fps = (len(ts) - 1) / dur if dur else 0
    print(f"{a.file}: {len(rows)} frames, {dur:.1f} s, {fps:.1f} fps")
    print(f"app summary: {json.dumps(doc.get('summary', {}))}\n")

    comp = [composites(r, col) for r in rows]
    yaw0 = [r[col["gaze_yaw_deg"]] for r in rows]
    pitch0 = [r[col["gaze_pitch_deg"]] for r in rows]
    awayd = running_away(yaw0, pitch0)
    far = [t for t, a_ in zip(ts, awayd) if a_ > 25]
    def started_far(t0):
        return any(t0 - 0.3 < t <= t0 for t in far)
    # all bursts, then resolve overlaps like ExpressionSession.add (strongest vs own threshold wins)
    allb = []
    for k in comp[0]:
        mr = MIN_RISE.get(k, a.min_rise)
        for st0, d, pk in bursts(ts, [c[k] for c in comp], mr, a.mad_k):
            if not started_far(st0):
                allb.append([k, st0, d, pk / mr])
    allb.sort(key=lambda x: x[1] + x[2])          # in order of ending, as the app sees them
    kept = []
    for e in allb:
        ov = [o for o in kept if o[0] != e[0] and min(e[1] + e[2], o[1] + o[2]) - max(e[1], o[1]) > 0.5 * min(e[2], o[2])]
        if any(o[3] >= e[3] for o in ov):
            continue
        kept = [o for o in kept if o not in ov] + [e]
    print("events:", ", ".join(f"{e[0]}@{e[1]:.1f}s/{int(e[2]*1000)}ms" for e in sorted(kept, key=lambda e: e[1])))
    print(f"{'expression':10s} {'median':>7s} {'p90':>6s} {'p99':>6s} {'max':>6s}   micro  macro   (min-rise {a.min_rise}, mad-k {a.mad_k})")
    for k in comp[0]:
        xs = [c[k] for c in comp]
        s = sorted(xs)
        b = [(e[1], e[2], e[3]) for e in kept if e[0] == k]
        micro = [x for x in b if x[1] <= 0.5]
        print(f"{k:10s} {s[len(s)//2]:7.3f} {s[int(len(s)*.9)]:6.3f} {s[int(len(s)*.99)]:6.3f} {s[-1]:6.3f}   {len(micro):5d}  {len(b)-len(micro):5d}"
              + ("   micro durations ms: " + ", ".join(str(int(x[1] * 1000)) for x in micro[:8]) if micro else ""))

    yaw = [r[col["gaze_yaw_deg"]] for r in rows]
    pitch = [r[col["gaze_pitch_deg"]] for r in rows]
    print(f"\ngaze yaw   median {st.median(yaw):+.1f}°  spread (p10..p90) {sorted(yaw)[len(yaw)//10]:+.1f}..{sorted(yaw)[len(yaw)*9//10]:+.1f}")
    print(f"gaze pitch median {st.median(pitch):+.1f}°  spread (p10..p90) {sorted(pitch)[len(pitch)//10]:+.1f}..{sorted(pitch)[len(pitch)*9//10]:+.1f}")
    speeds = []
    for i in range(1, len(rows)):
        dt = ts[i] - ts[i - 1]
        if dt > 0:
            speeds.append(math.hypot(yaw[i] - yaw[i - 1], pitch[i] - pitch[i - 1]) / dt)
    s = sorted(speeds)
    print(f"gaze speed deg/s  median {s[len(s)//2]:.0f}  p90 {s[int(len(s)*.9)]:.0f}  p99 {s[int(len(s)*.99)]:.0f}")
    cal = [i for i, t in enumerate(ts) if t - ts[0] < 10]
    away = sum(1 for x in awayd if x > 10) / len(awayd)
    print(f"looking > 10° from the running median gaze: {away*100:.0f} %;  far (> 25°, expressions ignored): {sum(1 for x in awayd if x > 25) / len(awayd) * 100:.0f} %")
    down = [(r[col["eyeLookDownLeft"]] + r[col["eyeLookDownRight"]]) / 2 for r in rows]
    bd = st.median(down[i] for i in cal)
    print(f"lookDown baseline {bd:.2f}; looking down (> baseline + 0.15): {sum(1 for x in down if x > bd + 0.15) / len(down) * 100:.0f} %")

    blink = [(r[col["eyeBlinkLeft"]] + r[col["eyeBlinkRight"]]) / 2 for r in rows]
    closed, n = False, 0
    for x in blink:
        if not closed and x > 0.6:
            closed, n = True, n + 1
        elif closed and x < 0.4:
            closed = False
    print(f"blinks: {n} ({n / max(dur / 60, 1e-6):.0f}/min)   eyeBlink p50 {st.median(blink):.2f} max {max(blink):.2f}")


if __name__ == "__main__":
    main()
