"""Regression tests for the PR #3 review (one class per point)."""
import json
import os
import tempfile
import threading
import time
import unittest
from decimal import Decimal
from http.server import ThreadingHTTPServer

import _path  # noqa: F401
import timeutil as tu
from app import App, auth_config_error, make_handler
from data_manager_client import DataManagerClient
from store import Store

H = 3_600_000
D = 24 * H


class Base(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.s = Store(os.path.join(self.dir.name, "t.db"), tz_name="Europe/Helsinki", retention_days=0)

    def tearDown(self):
        self.s.close()
        self.dir.cleanup()


class OpenByDefault(unittest.TestCase):
    """1. No API_TOKEN -> refuse to start unless ALLOW_NO_AUTH=1."""

    def test_refuses_without_token(self):
        self.assertIn("API_TOKEN is not set", auth_config_error(None, False))
        self.assertIsNone(auth_config_error(None, True))
        self.assertIsNone(auth_config_error("a-real-token", False))

    def test_writes_and_deletes_need_the_token(self):
        d = tempfile.TemporaryDirectory()
        st = Store(os.path.join(d.name, "t.db"))
        app = App(st, token="s3cret-s3cret-s3")
        body = json.dumps({"metric": "env.co2_ppm", "value": 600, "source": "x"}).encode()
        for hdr in ({}, {"Authorization": "Bearer nope"}, {"Authorization": "s3cret-s3cret-s3"}):
            self.assertEqual(app.dispatch("POST", "/api/v1/samples", "", hdr, body)[0], 401)
            self.assertEqual(app.dispatch("DELETE", "/api/v1/events/1", "", hdr, None)[0], 401)
        ok = {"Authorization": "Bearer s3cret-s3cret-s3"}
        self.assertEqual(app.dispatch("POST", "/api/v1/samples", "", ok, body)[1]["accepted"], 1)
        st.close()
        d.cleanup()


class FlatBaseline(Base):
    """2. A perfectly flat history is a baseline, and a jump off it is flagged."""

    def _fill(self, values_by_day_ago):
        rows = []
        for k, v in values_by_day_ago.items():
            lo, _ = tu.day_bounds(tu.day_of(tu.now_ms() - k * D, self.s.tz), self.s.tz)
            rows += [{"metric": "env.co2_ppm", "value": v, "ts": lo + h * H} for h in range(6, 12)]
        self.s.add_samples(rows, "co2")

    def test_jump_off_flat_history(self):
        self._fill({k: 500 for k in range(2, 16)} | {1: 900})
        b = self.s.baseline("env.co2_ppm", day=tu.day_of(tu.now_ms() - D, self.s.tz))
        self.assertTrue(b["flat"])
        self.assertEqual(b["baseline_n"], 14)
        self.assertEqual(b["verdict"], "above usual range")

    def test_same_value_on_flat_history(self):
        self._fill({k: 500 for k in range(1, 16)})
        b = self.s.baseline("env.co2_ppm", day=tu.day_of(tu.now_ms() - D, self.s.tz))
        self.assertEqual(b["verdict"], "within usual range")

    def test_short_history_still_reported(self):
        self._fill({k: 500 for k in range(1, 4)})
        b = self.s.baseline("env.co2_ppm", day=tu.day_of(tu.now_ms() - D, self.s.tz))
        self.assertTrue(b["verdict"].startswith("baseline too short"))


class PerItemRejection(Base):
    """3. Malformed items are rejected one by one; accepted counts stored rows."""

    def test_malformed_items_do_not_fail_the_batch(self):
        now = time.time()
        r = self.s.add_samples([
            {"metric": ["env.co2_ppm"], "value": 600},
            {"metric": {"x": 1}, "value": 600},
            {"metric": "env.co2_ppm", "value": 600, "ts": float("inf")},
            {"metric": "env.co2_ppm", "value": 600, "ts": "inf"},
            {"metric": "env.co2_ppm", "value": 600, "ts": 1e300},
            {"metric": "env.co2_ppm", "value": 600, "ts": -1e300},   # retention 0: no old-age check
            {"metric": "env.co2_ppm", "value": 600, "ts": [1, 2]},
            {"metric": "env.co2_ppm", "value": 600, "source": ["a"]},
            {"metric": "env.co2_ppm", "value": 600, "meta": "x"},
            {"metric": "env.co2_ppm", "value": 640, "ts": now},       # the only good one
        ], "co2")
        self.assertEqual(r["accepted"], 1)
        self.assertEqual([x["index"] for x in r["rejected"]], list(range(9)))
        self.assertIn("server_time", r)

    def test_events_malformed_items(self):
        r = self.s.upsert_events([
            {"kind": ["presence.home"], "start": time.time()},
            {"kind": "presence.home", "start": float("inf")},
            {"kind": "presence.home", "start": time.time() - 60, "end": 1e300},
            {"kind": "presence.home", "start": time.time() - 60},
        ], "p")
        self.assertEqual(r["accepted"], 1)
        self.assertEqual(len(r["rejected"]), 3)

    def test_batch_without_ts_is_reported_truthfully(self):
        r = self.s.add_samples([{"metric": "env.co2_ppm", "value": 600 + i} for i in range(5)], "co2")
        self.assertEqual(r["accepted"], 1)
        self.assertEqual(len(r["rejected"]), 4)
        self.assertTrue(all("overwritten by item 4" in x["reason"] for x in r["rejected"]))
        rows = self.s.samples("env.co2_ppm")
        self.assertEqual((len(rows), rows[0]["value"]), (1, 604.0))   # last one wins

    def test_api_never_500s_on_garbage(self):
        app = App(self.s)
        for body in ([{"metric": [1], "value": 1}], [{"metric": "env.co2_ppm", "value": 1, "ts": 1e308}],
                     [{"kind": {"a": 1}, "start": 1}], {"samples": [None, 3, "x", []]}):
            for path in ("/api/v1/samples", "/api/v1/events"):
                code, res = app.dispatch("POST", path, "", {}, json.dumps(body).encode())
                self.assertEqual(code, 200, (path, body, res))


class HeartRateSources(Base):
    """4. Camera rPPG has its own metric; pooling warns; spot sessions count."""

    def test_new_builtins(self):
        m = self.s.metrics()
        for name in ("vitals.heart_rate_camera_bpm", "vitals.hrv_rmssd_ms", "vitals.breathing_rate_per_min"):
            self.assertEqual(m[name]["kind"], "sample")
        self.assertEqual(m["vitals.heart_rate_bpm"]["baseline_min_hours"], 0)

    def test_short_finger_sessions_enter_the_baseline(self):
        rows = []
        for k in range(1, 9):                     # a 10-minute finger session per day
            lo, _ = tu.day_bounds(tu.day_of(tu.now_ms() - k * D, self.s.tz), self.s.tz)
            rows += [{"metric": "vitals.heart_rate_bpm", "value": 70 + (k % 3), "ts": lo + 9 * H + i * 60_000}
                     for i in range(10)]
        self.s.add_samples(rows, "modulino-hub")
        b = self.s.baseline("vitals.heart_rate_bpm", day=tu.day_of(tu.now_ms() - D, self.s.tz), days=7)
        self.assertEqual(b["min_hours"], 0)
        self.assertEqual(b["baseline_n"], 7)
        # explicit min_hours still wins
        b4 = self.s.baseline("vitals.heart_rate_bpm", day=tu.day_of(tu.now_ms() - D, self.s.tz),
                             days=7, min_hours=4)
        self.assertEqual(b4["baseline_n"], 0)

    def test_pooled_sources_warning(self):
        now = time.time()
        self.s.add_samples([{"metric": "vitals.heart_rate_bpm", "value": 70, "ts": now - 60, "source": "a"},
                            {"metric": "vitals.heart_rate_bpm", "value": 72, "ts": now - 30, "source": "b"}])
        app = App(self.s)
        for path in ("/api/v1/daily", "/api/v1/stats", "/api/v1/series", "/api/v1/trend", "/api/v1/baseline"):
            code, r = app.dispatch("GET", path, "metric=vitals.heart_rate_bpm", {}, None)
            self.assertEqual(code, 200)
            self.assertEqual(r["sources_pooled"], ["a", "b"], path)
            self.assertIn("2 sources pooled", r["warning"], path)
            code, r = app.dispatch("GET", path, "metric=vitals.heart_rate_bpm&source=a", {}, None)
            self.assertNotIn("warning", r, path)

    def test_v010_database_is_migrated(self):
        path = os.path.join(self.dir.name, "old.db")
        import sqlite3
        c = sqlite3.connect(path)
        c.executescript("CREATE TABLE metric (name TEXT PRIMARY KEY, kind TEXT NOT NULL, unit TEXT, min REAL,"
                        " max REAL, description TEXT, builtin INTEGER NOT NULL DEFAULT 0, created INTEGER NOT NULL);")
        c.close()
        st = Store(path)
        self.assertEqual(st.metrics()["posture.head_trunk_angle_deg"]["baseline_min_hours"], 1)
        st.close()


class Clocks(Base):
    """5. Clock problems are visible: server_time -> client skew, lag_s in /latest."""

    def test_lag_shows_a_slow_producer_clock(self):
        self.s.add_samples([{"metric": "env.co2_ppm", "value": 600, "ts": time.time() - 600}], "slow")
        self.s.add_samples([{"metric": "env.co2_ppm", "value": 600}], "ok")
        lag = {r["source"]: r["lag_s"] for r in self.s.latest()}
        self.assertGreater(lag["slow"], 590)
        self.assertLess(abs(lag["ok"]), 2)

    def test_fast_clock_rejected_with_a_reason(self):
        r = self.s.add_samples([{"metric": "env.co2_ppm", "value": 600, "ts": time.time() + 3600}], "fast")
        self.assertIn("future", r["rejected"][0]["reason"])


class ClientRobustness(unittest.TestCase):
    """Smaller notes: client queue, mDNS, clock skew."""

    def test_values_are_validated_at_enqueue(self):
        c = DataManagerClient("t", url="http://127.0.0.1:9", flush_every_s=3600)
        self.assertTrue(c.sample("env.co2_ppm", Decimal("612.5")))
        self.assertIsInstance(c._samples[-1]["value"], float)
        self.assertFalse(c.sample("env.co2_ppm", object()))
        self.assertFalse(c.sample("env.co2_ppm", float("nan")))
        self.assertFalse(c.sample("env.co2_ppm", True))
        self.assertFalse(c.sample("env.co2_ppm", 600, meta={"x": object()}))
        self.assertFalse(c.sample("env.co2_ppm", 600, ts=object()))
        self.assertFalse(c.interval("presence.home", start=object()))
        self.assertEqual(c.dropped, 6)
        self.assertEqual(len(c._samples), 1)
        json.dumps(list(c._samples))               # everything queued is sendable
        c.close()

    def test_mdns_first_advert_wins(self):
        c = DataManagerClient("t", url="", flush_every_s=3600)
        c._on_advert("a", "http://10.0.0.1:8100")
        c._on_advert("b", "http://10.0.0.66:8100")       # stray / spoofed advert
        self.assertEqual(c.url, "http://10.0.0.1:8100")
        for _ in range(3):
            c._note_connection(False)
        self.assertEqual(c.url, "http://10.0.0.66:8100")   # only after the first keeps failing
        c.close()

    def test_clock_skew_and_delivery(self):
        d = tempfile.TemporaryDirectory()
        st = Store(os.path.join(d.name, "t.db"))
        server = ThreadingHTTPServer(("127.0.0.1", 0), make_handler(App(st)))
        threading.Thread(target=server.serve_forever, daemon=True).start()
        try:
            c = DataManagerClient("t", url=f"http://127.0.0.1:{server.server_address[1]}", flush_every_s=0.2)
            c.sample("env.co2_ppm", 600, meta={"n": 3})
            self.assertTrue(c.flush(5))
            self.assertIsNotNone(c.clock_skew_s)
            self.assertLess(abs(c.clock_skew_s), 2)
            c.close()
        finally:
            server.shutdown()
            st.close()
            d.cleanup()


if __name__ == "__main__":
    unittest.main()
