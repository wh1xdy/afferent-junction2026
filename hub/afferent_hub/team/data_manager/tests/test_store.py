import os
import tempfile
import time
import unittest

import _path  # noqa: F401
import timeutil as tu
from store import IngestError, Store

H = 3_600_000
D = 24 * H


class Base(unittest.TestCase):
    tz = "Europe/Paris"

    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.s = Store(os.path.join(self.dir.name, "t.db"), tz_name=self.tz, retention_days=30)

    def tearDown(self):
        self.s.close()
        self.dir.cleanup()


class TestIngest(Base):
    def test_validation(self):
        now = time.time()
        r = self.s.add_samples([
            {"metric": "env.temperature_c", "value": 21.0, "source": "hub"},
            {"metric": "env.temperature_c", "value": 900, "source": "hub"},          # out of range
            {"metric": "env.temperature_c", "value": "x", "source": "hub"},          # not a number
            {"metric": "env.temperature_c", "value": float("nan"), "source": "hub"},
            {"metric": "nope.metric", "value": 1, "source": "hub"},                  # unknown
            {"metric": "presence.home", "value": 1, "source": "hub"},                # interval, not sample
            {"metric": "env.temperature_c", "value": 21, "source": "bad source!"},
            {"metric": "env.temperature_c", "value": 21, "source": "hub", "ts": now + 3600},   # future
            {"metric": "env.temperature_c", "value": 21, "source": "hub", "ts": now - 40 * 86400},  # too old
            "not an object",
        ])
        self.assertEqual(r["accepted"], 1)
        self.assertEqual(len(r["rejected"]), 9)

    def test_resend_is_idempotent(self):
        ts = time.time() - 60
        for v in (20.0, 20.5):
            self.s.add_samples([{"metric": "env.temperature_c", "value": v, "ts": ts}], "hub")
        rows = self.s.samples("env.temperature_c")
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["value"], 20.5)

    def test_timestamp_formats(self):
        now_ms = tu.now_ms()
        sec = now_ms / 1000 - 10
        self.s.add_samples([
            {"metric": "env.humidity_pct", "value": 40, "ts": sec},
            {"metric": "env.humidity_pct", "value": 41, "ts": int(sec * 1000) - 1000},
            {"metric": "env.humidity_pct", "value": 42, "ts": tu.iso(int(sec * 1000) - 2000)},
        ], "hub")
        self.assertEqual(len(self.s.samples("env.humidity_pct")), 3)

    def test_register_metric(self):
        self.assertEqual(self.s.add_samples([{"metric": "env.pm25_ugm3", "value": 12}], "air")["accepted"], 0)
        self.s.register_metric("env.pm25_ugm3", {"unit": "µg/m³", "min": 0, "max": 1000})
        self.assertEqual(self.s.add_samples([{"metric": "env.pm25_ugm3", "value": 12}], "air")["accepted"], 1)
        with self.assertRaises(IngestError):
            self.s.register_metric("env.temperature_c", {"unit": "K"})   # built-in
        with self.assertRaises(ValueError):
            self.s.register_metric("Bad Name", {})


class TestDaily(Base):
    def test_rollup_per_source_and_pooled(self):
        base = tu.now_ms() - 2 * D
        day = tu.day_of(base, self.s.tz)
        lo, _ = tu.day_bounds(day, self.s.tz)
        rows = [{"metric": "vitals.heart_rate_bpm", "value": 60 + i % 10, "ts": lo + i * 60_000,
                 "source": "finger1"} for i in range(120)]
        rows += [{"metric": "vitals.heart_rate_bpm", "value": 90, "ts": lo + i * 60_000 + 1,
                  "source": "rppg"} for i in range(10)]
        self.s.add_samples(rows)
        pooled = self.s.daily("vitals.heart_rate_bpm", None, day, day)[0]
        finger = self.s.daily("vitals.heart_rate_bpm", "finger1", day, day)[0]
        self.assertEqual(pooled["n"], 130)
        self.assertEqual(finger["n"], 120)
        self.assertEqual(finger["max"], 69)
        self.assertEqual(finger["hours_covered"], 2)

    def test_late_sample_marks_day_dirty(self):
        day = tu.day_of(tu.now_ms() - 3 * D, self.s.tz)
        lo, _ = tu.day_bounds(day, self.s.tz)
        self.s.add_samples([{"metric": "env.co2_ppm", "value": 500, "ts": lo + H}], "co2")
        self.assertEqual(self.s.daily("env.co2_ppm", None, day, day)[0]["n"], 1)
        self.s.add_samples([{"metric": "env.co2_ppm", "value": 900, "ts": lo + 2 * H}], "co2")
        self.s.rollup_dirty()            # reads alone may serve a row up to 5 s old
        d = self.s.daily("env.co2_ppm", None, day, day)[0]
        self.assertEqual((d["n"], d["max"]), (2, 900))

    def test_prune_keeps_daily(self):
        self.s.retention_days = 30
        old = tu.now_ms() - 10 * D
        self.s.add_samples([{"metric": "env.co2_ppm", "value": 600, "ts": old}], "co2")
        self.s.rollup_dirty()
        self.s.retention_days = 5
        self.assertEqual(self.s.prune(), 1)
        self.assertEqual(self.s.samples("env.co2_ppm", frm=0), [])
        self.assertEqual(len(self.s.daily("env.co2_ppm")), 1)


class TestIntervals(Base):
    def test_minutes_union_clipping_and_upsert(self):
        day = tu.day_of(tu.now_ms() - 2 * D, self.s.tz)
        lo, hi = tu.day_bounds(day, self.s.tz)
        self.s.upsert_events([
            {"kind": "presence.home", "start": lo - 2 * H, "end": lo + 1 * H, "id": "a"},   # spans midnight
            {"kind": "presence.home", "start": lo + 10 * H, "end": lo + 12 * H, "id": "b"},
            {"kind": "presence.home", "start": lo + 11 * H, "end": lo + 13 * H, "id": "c"},  # overlaps b
        ], "presence")
        r = self.s.events_daily("presence.home", None, day, day)[0]
        self.assertEqual(r["minutes"], 60 + 180)          # 1 h + union(10-13 h)
        self.assertEqual(r["occurrences"], 2)             # b and c start that day
        # re-send "b" with a different end: updated, not duplicated
        self.s.upsert_events([{"kind": "presence.home", "start": lo + 10 * H, "end": lo + 10.5 * H,
                               "id": "b"}], "presence")
        self.assertEqual(len(self.s.events("presence.home", frm=0)), 3)

    def test_open_interval_runs_until_now(self):
        start = tu.now_ms() - 30 * 60_000
        self.s.upsert_events([{"kind": "presence.guest_visit", "start": start, "value": 2}], "presence")
        today = tu.day_of(tu.now_ms(), self.s.tz)
        r = self.s.events_daily("presence.guest_visit", None, today, today)[0]
        self.assertTrue(r["partial_day"])
        # an interval started yesterday evening is split across days; accept either case
        self.assertGreater(r["minutes"], 0)
        self.assertLessEqual(r["minutes"], 31)

    def test_rejects_bad_intervals(self):
        now = tu.now_ms()
        r = self.s.upsert_events([
            {"kind": "presence.home", "start": now, "end": now - 1000},
            {"kind": "env.temperature_c", "start": now},
            {"kind": "presence.guest_visit", "start": now - 1000, "value": 500},
        ], "presence")
        self.assertEqual(r["accepted"], 0)
        self.assertEqual(len(r["rejected"]), 3)

    def test_days_before_first_event_are_not_zero(self):
        day = tu.day_of(tu.now_ms() - 2 * D, self.s.tz)
        lo, _ = tu.day_bounds(day, self.s.tz)
        self.s.upsert_events([{"kind": "presence.outing", "start": lo + H, "end": lo + 2 * H}], "p")
        rows = self.s.events_daily("presence.outing", None, "2020-01-01", day)
        self.assertEqual([r["day"] for r in rows], [day])


class TestDST(Base):
    def test_day_bounds_dst(self):
        lo, hi = tu.day_bounds("2026-03-29", self.s.tz)   # Europe/Paris springs forward
        self.assertEqual(hi - lo, 23 * H)
        lo, hi = tu.day_bounds("2026-10-25", self.s.tz)
        self.assertEqual(hi - lo, 25 * H)


class TestBaseline(Base):
    def test_baseline_flags_unusual_day(self):
        today = tu.day_of(tu.now_ms(), self.s.tz)
        rows = []
        for k in range(1, 15):
            lo, _ = tu.day_bounds(tu.day_of(tu.now_ms() - k * D, self.s.tz), self.s.tz)
            rows += [{"metric": "posture.head_trunk_angle_deg", "value": 10 + (k % 3) * 0.5, "ts": lo + h * H}
                     for h in range(8, 20)]
        lo, _ = tu.day_bounds(today, self.s.tz)
        rows += [{"metric": "posture.head_trunk_angle_deg", "value": 25, "ts": min(lo + h * 60_000, tu.now_ms())}
                 for h in range(5)]
        self.s.add_samples(rows, "posture")
        b = self.s.baseline("posture.head_trunk_angle_deg", day=today)
        self.assertEqual(b["baseline_n"], 14)
        self.assertEqual(b["verdict"], "above usual range")
        t = self.s.trend("posture.head_trunk_angle_deg", None, "2000-01-01", today)
        self.assertEqual(t["days"], 15)


if __name__ == "__main__":
    unittest.main()
