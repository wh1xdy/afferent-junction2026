"""Offline tests: synthetic 14 days of data -> aggregations, trends, PHQ-9 flag, reports.

    cd jetson/hub && python3 -m unittest discover tests -v
"""
import os
import random
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from store import Store, severity  # noqa: E402
import report  # noqa: E402

NOW = 1_800_000_000.0     # fixed "now" so day boundaries are deterministic
DAY = 86400


def fill(store, rnd, hrv_first=55, hrv_second=38, bpm_first=64, bpm_second=72):
    """14 days, 10 minutes of readings (every 5 s) per day; physiology worsens in week 2"""
    for d in range(14):
        t0 = NOW - (14 - d) * DAY + 3600 * 9
        second = d >= 7
        for k in range(120):
            ts = t0 + k * 5
            store.add_reading("finger_bpm", (bpm_second if second else bpm_first) + rnd.gauss(0, 4) + abs(rnd.gauss(0, 6)), ts)
            store.add_reading("hrv_rmssd", (hrv_second if second else hrv_first) + rnd.gauss(0, 5), ts)
            store.add_reading("breathing", (16 if second else 13) + rnd.gauss(0, 1), ts)


class Aggregation(unittest.TestCase):
    def setUp(self):
        self.s = Store()
        fill(self.s, random.Random(1))

    def test_daily_has_every_day(self):
        d = self.s.daily(14, NOW)
        self.assertEqual(len(d), 14)
        self.assertTrue(all(r["minutes"] == 10 for r in d))

    def test_trend_detects_the_change(self):
        t = self.s.trend("hrv_rmssd", 14, NOW)
        self.assertAlmostEqual(t["previous"], 55, delta=2)
        self.assertAlmostEqual(t["recent"], 38, delta=2)
        self.assertLess(t["change_pct"], -25)
        bpm = self.s.trend("finger_bpm", 14, NOW)
        self.assertGreater(bpm["change"], 5)       # resting pulse up

    def test_trend_needs_three_days_each(self):
        s = Store()
        for d in (1, 2, 10, 11):                    # only 2 days per window
            for k in range(20):
                s.add_reading("hrv_rmssd", 40, NOW - (14 - d) * DAY + k * 5)
        self.assertIsNone(s.trend("hrv_rmssd", 14, NOW))


class PHQ9(unittest.TestCase):
    def test_scoring_and_item9_flag(self):
        s = Store()
        s.add_phq9([1, 1, 1, 1, 1, 0, 0, 0, 0], NOW - 10 * DAY)
        s.add_phq9([2, 2, 2, 2, 2, 1, 1, 1, 1], NOW - 2 * DAY)
        sm = s.summary(14, NOW)
        self.assertEqual([p["score"] for p in sm["phq9"]], [5, 14])
        self.assertEqual(sm["phq9"][1]["severity"], "moderate")
        self.assertTrue(sm["phq9_item9_flag"])
        self.assertEqual(severity(22), "severe")

    def test_rejects_bad_answers(self):
        with self.assertRaises(ValueError):
            Store().add_phq9([1, 2, 3])


class Reports(unittest.TestCase):
    def setUp(self):
        self.s = Store()
        fill(self.s, random.Random(2))
        self.s.add_phq9([2, 2, 1, 2, 1, 1, 1, 0, 1], NOW - 1 * DAY)
        self.s.add_session({"summary": {"smileShare": 0.08, "expressivity": 0.05, "blinksPerMinute": 14,
                                        "gazeAwayShare": 0.2, "seconds": 60},
                            "cameraPulse": {"bpm": 71, "trust": 78}, "events": [{"duration": 0.3}]}, NOW - DAY)

    def test_clinician_report_shows_flag_trends_and_coverage(self):
        h = report.clinician(self.s.summary(14, NOW), "Patient A")
        self.assertIn("item 9 answered above 0", h)
        self.assertIn("HRV (RMSSD)", h)
        self.assertIn("<svg", h)
        self.assertIn("14 / 14", h)                 # days with sensor data
        self.assertIn("not a diagnostic device", h)

    def test_patient_report_is_plain_and_has_support(self):
        h = report.patient(self.s.summary(14, NOW))
        self.assertIn("lower than the week before", h)
        self.assertIn("90101", h)


if __name__ == "__main__":
    unittest.main()
