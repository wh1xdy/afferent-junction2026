"""Synthetic 14-day patient for demos (?demo=1) - never written to the real database.
Week 2 worsens: resting pulse up, HRV down, breathing faster, PHQ-9 6 -> 11 with item 9 = 1."""
import random
import time

from store import Store

DAY = 86400


def demo_store(now=None, seed=2):
    now = now or time.time()
    rnd = random.Random(seed)
    s = Store()
    for d in range(14):
        t0 = now - (14 - d) * DAY + 3600 * 9
        second = d >= 7
        for k in range(120):
            ts = t0 + k * 5
            s.add_reading("finger_bpm", (72 if second else 64) + rnd.gauss(0, 4) + abs(rnd.gauss(0, 6)), ts, "simulated")
            s.add_reading("hrv_rmssd", (38 if second else 55) + rnd.gauss(0, 5), ts, "simulated")
            s.add_reading("breathing", (16 if second else 13) + rnd.gauss(0, 1), ts, "simulated")
    s.add_phq9([1, 1, 1, 1, 1, 0, 1, 0, 0], now - 12 * DAY)
    s.add_phq9([2, 2, 1, 2, 1, 1, 1, 0, 1], now - 1 * DAY)
    s.add_session({"summary": {"smileShare": 0.08, "expressivity": 0.05, "blinksPerMinute": 14,
                               "gazeAwayShare": 0.2, "seconds": 60},
                   "cameraPulse": {"bpm": 71, "trust": 78}, "events": [{"duration": 0.3}]}, now - DAY)
    return s
