"""Fill a data manager with realistic synthetic history (for demos and dashboard work).

    python tools/simulate.py --url http://localhost:8100 --days 21
    python tools/simulate.py --url http://localhost:8100 --days 21 --withdrawal 5

Generates, every 5 min: temperature, humidity, CO2, heart rate (finger + rPPG),
trunk inclination and head-vs-trunk angle while the patient is home and awake; plus
presence.home / presence.outing intervals and occasional guest visits.
`--withdrawal N` makes the last N days progressively more withdrawn (fewer, shorter
outings, fewer visits, more forward head/trunk) so /trend and /baseline have
something to find. Synthetic data, obviously — never mix it into a real patient DB.
"""
from __future__ import annotations

import argparse
import json
import math
import random
import sys
import time
import urllib.request
from datetime import datetime, timedelta, timezone

STEP_S = 300


def post(url, path, body, token=None):
    req = urllib.request.Request(url + path, data=json.dumps(body).encode(), method="POST",
                                 headers={"Content-Type": "application/json"})
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())


def day_plan(rng, withdrawn: float):
    """Outings as (start_h, end_h) local hours; withdrawn in [0, 1]."""
    outings = []
    if rng.random() > 0.15 + 0.6 * withdrawn:          # morning errand / work
        s = rng.uniform(8.5, 10.5)
        outings.append((s, s + rng.uniform(1.0, 6.0) * (1 - 0.7 * withdrawn)))
    if rng.random() > 0.45 + 0.5 * withdrawn:          # afternoon walk
        s = rng.uniform(15, 17.5)
        outings.append((s, s + rng.uniform(0.5, 1.5)))
    visit = None
    if rng.random() < 0.35 * (1 - withdrawn):
        s = rng.uniform(18, 20)
        visit = (s, s + rng.uniform(0.5, 2.5), rng.choice([1, 1, 2, 3]))
    return outings, visit


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default="http://localhost:8100")
    ap.add_argument("--token")
    ap.add_argument("--days", type=int, default=21)
    ap.add_argument("--withdrawal", type=int, default=0, help="last N days increasingly withdrawn")
    ap.add_argument("--tz-offset-h", type=float, default=1.0, help="local UTC offset used for the plan")
    ap.add_argument("--seed", type=int, default=7)
    a = ap.parse_args()
    rng = random.Random(a.seed)
    tz = timezone(timedelta(hours=a.tz_offset_h))
    url = a.url.rstrip("/")

    today = datetime.now(tz).replace(hour=0, minute=0, second=0, microsecond=0)
    now = time.time()
    samples, events = [], []
    for k in range(a.days, -1, -1):
        d0 = today - timedelta(days=k)
        w = 0.0
        if a.withdrawal and k < a.withdrawal:
            w = (a.withdrawal - k) / a.withdrawal
        outings, visit = day_plan(rng, w)
        t0 = d0.timestamp()
        # presence intervals: home = complement of outings within the day
        cursor = 0.0
        for i, (s, e) in enumerate(sorted(outings)):
            events.append({"kind": "presence.home", "start": t0 + cursor * 3600, "end": t0 + s * 3600,
                           "id": f"sim-home-{d0:%Y%m%d}-{i}", "source": "sim/presence"})
            events.append({"kind": "presence.outing", "start": t0 + s * 3600, "end": t0 + e * 3600,
                           "id": f"sim-out-{d0:%Y%m%d}-{i}", "source": "sim/presence"})
            cursor = e
        end_home = min(24.0, (now - t0) / 3600)
        if end_home > cursor:
            events.append({"kind": "presence.home", "start": t0 + cursor * 3600,
                           "end": t0 + end_home * 3600 if end_home < 24 else t0 + 24 * 3600,
                           "id": f"sim-home-{d0:%Y%m%d}-last", "source": "sim/presence"})
        if visit and t0 + visit[1] * 3600 < now:
            events.append({"kind": "presence.guest_visit", "start": t0 + visit[0] * 3600,
                           "end": t0 + visit[1] * 3600, "value": visit[2],
                           "id": f"sim-visit-{d0:%Y%m%d}", "source": "sim/presence"})

        for step in range(0, 86400, STEP_S):
            ts = t0 + step
            if ts > now:
                break
            h = step / 3600
            home = not any(s <= h < e for s, e in outings)
            guests = visit[2] if visit and visit[0] <= h < visit[1] else 0
            awake = 7.5 <= h < 23.5
            temp = 20.5 + 1.2 * math.sin((h - 9) / 24 * 2 * math.pi) + rng.gauss(0, 0.15)
            hum = 42 - 4 * math.sin((h - 9) / 24 * 2 * math.pi) + rng.gauss(0, 1.0)
            co2 = 450 + (350 if home else 0) + 250 * guests + (200 if home and not awake else 0) \
                + rng.gauss(0, 30)
            samples += [
                {"metric": "env.temperature_c", "value": round(temp, 2), "ts": ts, "source": "sim/modulino-hub"},
                {"metric": "env.humidity_pct", "value": round(hum, 1), "ts": ts, "source": "sim/modulino-hub"},
                {"metric": "env.co2_ppm", "value": round(max(co2, 400)), "ts": ts, "source": "sim/co2"},
            ]
            if home:
                hr = 62 + (10 if awake else 0) + 6 * math.sin((h - 15) / 24 * 2 * math.pi) \
                    + 4 * guests + rng.gauss(0, 3)
                samples.append({"metric": "vitals.heart_rate_bpm", "value": round(hr), "ts": ts,
                                "source": "sim/finger1", "quality": round(rng.uniform(0.3, 0.9), 2)})
                if awake and rng.random() < 0.5:
                    samples.append({"metric": "vitals.heart_rate_bpm", "value": round(hr + rng.gauss(0, 4)),
                                    "ts": ts + 1, "source": "sim/rppg", "quality": round(rng.uniform(-2, 8), 1)})
                if awake and rng.random() < 0.6:       # person seen by the camera
                    samples += [
                        {"metric": "posture.trunk_inclination_deg", "value": round(8 + 10 * w + rng.gauss(0, 4), 1),
                         "ts": ts, "source": "sim/posture"},
                        {"metric": "posture.head_trunk_angle_deg", "value": round(abs(12 + 12 * w + rng.gauss(0, 5)), 1),
                         "ts": ts, "source": "sim/posture"},
                    ]

    for i in range(0, len(events), 500):
        post(url, "/api/v1/events", {"events": events[i:i + 500]}, a.token)
    rejected = 0
    for i in range(0, len(samples), 5000):
        rejected += len(post(url, "/api/v1/samples", {"samples": samples[i:i + 5000]}, a.token)["rejected"])
    print(f"sent {len(samples)} samples ({rejected} rejected) and {len(events)} intervals "
          f"over {a.days + 1} days", file=sys.stderr)


if __name__ == "__main__":
    main()
