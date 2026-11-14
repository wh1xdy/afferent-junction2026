"""Offline tests for what the UNO Q hands to the data manager (no board, no network, no server).

    cd uno-q/modulino-hub && python3 -m unittest discover tests -v

The hardware stubs come from test_sensor_logic.py (importing it installs them and imports app.py).
A fake client records what would be queued; the real client file is only used where the test
says so, and never opens a connection.
"""
import json
import os
import sys
import threading
import time
import unittest
from unittest import mock

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)

from test_sensor_logic import app, ppg_for_beats, reset  # noqa: E402  (installs the stubs, imports app)
import data_manager_client  # noqa: E402
import data_manager_push as dmp  # noqa: E402

PULSE, HRV, BREATH = "vitals.heart_rate_bpm", "vitals.hrv_rmssd_ms", "vitals.breathing_rate_per_min"
TEMP, HUM = "env.temperature_c", "env.humidity_pct"
T0 = 1_800_000_000.0


class FakeClient:
    """records what the hub hands over; fail = the exception every call raises"""

    def __init__(self, fail=None):
        self.samples, self.calls, self.fail, self.closed = [], 0, fail, False

    def sample(self, metric, value, ts=None, quality=None, meta=None, source=None):
        self.calls += 1
        if self.fail:
            raise self.fail
        self.samples.append({"metric": metric, "value": value, "ts": ts, "quality": quality,
                             "meta": meta, "source": source})
        return True

    def status(self):
        if self.fail:
            raise self.fail
        return {"enabled": True, "url": "http://jetson:8100", "queued_samples": len(self.samples)}

    def close(self):
        if self.fail:
            raise self.fail
        self.closed = True

    def of(self, metric):
        return [s for s in self.samples if s["metric"] == metric]

    def metrics(self):
        return sorted({s["metric"] for s in self.samples})


class FakeStop:
    """stands in for the threading.Event of a loop: lets it run n rounds without waiting"""
    def __init__(self, rounds):
        self.rounds = rounds

    def wait(self, _timeout=None):
        self.rounds -= 1
        return self.rounds < 0


def push(fail=None):
    client, lines = FakeClient(fail), []
    return dmp.Push(client=client, log=lines.append), client, lines


ONE_PERSON = dict(sensing=True, two_hearts=False, bpm=71, quality=0.62, rmssd_ms=46.2, breaths_per_min=12)


class WhatIsSent(unittest.TestCase):
    """Push.tick() in each state of the hub"""

    def test_one_person_sends_pulse_with_quality_hrv_and_breathing(self):
        p, client, lines = push()
        p.tick(T0, **ONE_PERSON)
        self.assertEqual(client.metrics(), sorted([PULSE, HRV, BREATH]))
        pulse = client.of(PULSE)[0]
        self.assertEqual((pulse["value"], pulse["quality"], pulse["ts"]), (71, 0.62, T0))
        self.assertEqual(pulse["meta"], {"sensor": "finger_ppg"})
        self.assertIsNone(pulse["source"], "the client's own source (modulino-hub) applies")
        self.assertEqual(client.of(HRV)[0]["value"], 46.2)
        self.assertEqual(client.of(BREATH)[0]["value"], 12)
        self.assertIsNone(client.of(HRV)[0]["quality"], "HRV has no quality: none is invented")
        self.assertIsNone(client.of(BREATH)[0]["quality"])
        self.assertEqual(lines, [])

    def test_no_finger_sends_no_vitals(self):
        p, client, _ = push()
        p.tick(T0, **{**ONE_PERSON, "sensing": False})       # numbers left over from before
        self.assertEqual(client.samples, [])

    def test_missing_values_are_not_sent(self):
        for missing in (None, 0, 0.0, float("nan"), -1, False):
            p, client, _ = push()
            p.tick(T0, **{**ONE_PERSON, "rmssd_ms": missing})
            self.assertEqual(client.metrics(), sorted([PULSE, BREATH]), repr(missing))
            p, client, _ = push()
            p.tick(T0, **{**ONE_PERSON, "bpm": missing, "breaths_per_min": missing})
            self.assertEqual(client.metrics(), [HRV], repr(missing))

    def test_a_pulse_without_usable_quality_is_not_sent(self):
        # seen on the device: 110, 105, 48 BPM stored with quality 0.28, 0.21, 0.23
        for q in (None, 0.0, 0.29, "0.8", float("nan")):
            p, client, _ = push()
            p.tick(T0, **{**ONE_PERSON, "quality": q})
            self.assertEqual(client.of(PULSE), [], repr(q))
            self.assertEqual(client.metrics(), sorted([HRV, BREATH]), repr(q))
        p, client, _ = push()
        p.tick(T0, **{**ONE_PERSON, "quality": 0.3})
        self.assertEqual(client.of(PULSE)[0]["quality"], 0.3)

    def test_two_people_send_no_vitals(self):
        p, client, _ = push()
        p.tick(T0, **{**ONE_PERSON, "two_hearts": True})
        self.assertEqual(client.samples, [])

    def test_fingers_disagreeing_right_now_send_nothing_that_second(self):
        # two people look like this for 3 s before two_hearts is decided
        p, client, _ = push()
        p.tick(T0, rhythms_apart=True, **ONE_PERSON)
        self.assertEqual(client.samples, [])
        p.tick(T0 + 1, **ONE_PERSON)                          # a blip: everything is back at once
        self.assertEqual(client.metrics(), sorted([PULSE, HRV, BREATH]))

    def test_after_two_people_hrv_and_breathing_wait_for_a_clean_window(self):
        p, client, _ = push()
        p.tick(T0, **{**ONE_PERSON, "two_hearts": True})
        p.tick(T0 + 1, **ONE_PERSON)
        self.assertEqual(client.metrics(), [PULSE], "the windows still hold the other person's beats")
        p.tick(T0 + dmp.TWO_HEARTS_HOLD_S - 1, **ONE_PERSON)
        self.assertEqual(client.metrics(), [PULSE])
        p.tick(T0 + dmp.TWO_HEARTS_HOLD_S, **ONE_PERSON)
        self.assertEqual(client.metrics(), sorted([PULSE, HRV, BREATH]))

    def test_climate_is_sent_without_a_finger(self):
        p, client, _ = push()
        for k in range(62):
            p.tick(T0 + k, sensing=False, two_hearts=False,
                   climate={"celsius": 21.5, "humidity": 40.0, "t": T0 + k - k % 2})
        self.assertEqual(client.metrics(), sorted([TEMP, HUM]))


class RateLimits(unittest.TestCase):
    def test_pulse_every_second_hrv_and_breathing_every_ten(self):
        p, client, _ = push()
        for k in range(30):
            p.tick(T0 + k, **ONE_PERSON)
        self.assertEqual(len(client.of(PULSE)), 30)
        self.assertEqual([s["ts"] - T0 for s in client.of(HRV)], [0, 10, 20])
        self.assertEqual([s["ts"] - T0 for s in client.of(BREATH)], [0, 10, 20])

    def test_climate_at_most_once_a_minute_as_a_mean(self):
        p, client, _ = push()
        for k in range(190):
            t = T0 + k - k % 2                                # the Thermo reports every 2 s
            warm = 1.0 if (k - k % 2) % 4 else 0.0            # readings alternate 21.0 / 22.0
            p.tick(T0 + k, sensing=False, two_hearts=False,
                   climate={"celsius": 21.0 + warm, "humidity": 40.0 + warm, "t": t})
        temps, hums = client.of(TEMP), client.of(HUM)
        self.assertEqual(len(temps), 3)
        self.assertEqual(len(hums), 3)
        gaps = [b["ts"] - a["ts"] for a, b in zip(temps, temps[1:])]
        self.assertTrue(all(g >= dmp.CLIMATE_EVERY_S for g in gaps), gaps)
        self.assertAlmostEqual(temps[0]["value"], 21.5, delta=0.05)
        self.assertAlmostEqual(hums[0]["value"], 40.5, delta=0.05)
        self.assertEqual(temps[0]["meta"], {"n": 31}, "each Thermo reading is counted once")
        self.assertAlmostEqual(temps[0]["ts"], T0 + 30, delta=1, msg="stamped when it was measured")

    def test_old_climate_reading_is_never_sent(self):
        p, client, _ = push()
        stale = {"celsius": 21.5, "humidity": 40.0, "t": T0 - 30}     # the Thermo stopped reporting
        for k in range(200):
            p.tick(T0 + k, sensing=False, two_hearts=False, climate=stale)
        self.assertEqual(client.samples, [])

    def test_no_climate_reading_sends_nothing(self):
        p, client, _ = push()
        for k in range(200):
            p.tick(T0 + k, sensing=False, two_hearts=False, climate=None)
        self.assertEqual(client.samples, [])

    def test_a_clock_set_back_does_not_stop_the_sending(self):
        p, client, _ = push()
        p.tick(T0, **ONE_PERSON)
        p.tick(T0 - 3600, **ONE_PERSON)
        self.assertEqual(len(client.of(HRV)), 2)


class NothingBreaksTheHub(unittest.TestCase):
    def test_client_that_raises_never_raises_out_of_tick(self):
        p, client, lines = push(fail=OSError("boom"))
        for k in range(120):
            p.tick(T0 + k, climate={"celsius": 21.0, "humidity": 40.0, "t": T0 + k}, **ONE_PERSON)
        self.assertEqual(client.samples, [])
        self.assertIn("boom", p.error)
        self.assertEqual(len(lines), 1, "one log line, not one per second")
        # pulse once a second, HRV and breathing every 10 s, one climate pair: nothing is retried
        self.assertEqual(client.calls, 120 + 12 + 12 + 2)

    def test_same_problem_is_logged_once(self):
        p, _, lines = push()
        for _ in range(50):
            p.problem("server said no")
        self.assertEqual(len(lines), 1)
        self.assertIn("server said no", lines[0])

    def test_status_and_close_survive_a_broken_client(self):
        p, _, _ = push(fail=RuntimeError("gone"))
        st = p.status()
        self.assertFalse(st["enabled"])
        self.assertIn("gone", st["status_error"])
        p.close()
        json.dumps(p.status())

    def test_close_closes_the_client(self):
        p, client, _ = push()
        p.close()
        self.assertTrue(client.closed)

    def test_close_does_not_wait_for_a_client_that_cannot_send(self):
        # the real client's close() tries for 5 s to send what is still queued
        p, client, lines = push()
        release = threading.Event()
        client.close = lambda: release.wait(5)
        t = time.time()
        with mock.patch.object(dmp, "CLOSE_WAIT_S", 0.2):
            p.close()
        took = time.time() - t
        release.set()
        self.assertLess(took, 2.0, "stopping the hub must not wait for the data manager")
        self.assertLessEqual(dmp.CLOSE_WAIT_S, 1.0)
        self.assertEqual(lines, [])

    def test_without_a_client_tick_does_nothing(self):
        lines = []
        p = dmp.Push(log=lines.append)                        # never started
        p.tick(T0, **ONE_PERSON)
        p.close()
        self.assertEqual(p.status(), {"enabled": False, "push_error": None})
        self.assertEqual(lines, [])

    def test_missing_client_file_is_one_log_line(self):
        lines = []
        p = dmp.Push(log=lines.append)
        with mock.patch.object(dmp, "DataManagerClient", None), \
                mock.patch.object(dmp, "_import_error", "No module named 'data_manager_client'"):
            p.start()
        p.tick(T0, **ONE_PERSON)
        self.assertIsNone(p.client)
        self.assertEqual(len(lines), 1)
        self.assertIn("client not available", lines[0])
        self.assertFalse(p.status()["enabled"])

    def test_client_that_fails_to_start_is_one_log_line(self):
        lines = []
        p = dmp.Push(log=lines.append)
        with mock.patch.object(dmp, "DataManagerClient", mock.Mock(side_effect=OSError("no network"))):
            p.start()
        p.tick(T0, **ONE_PERSON)
        self.assertIsNone(p.client)
        self.assertEqual(len(lines), 1)
        self.assertIn("no network", lines[0])

    def test_start_names_the_source_and_the_mesh_interface(self):
        made = mock.Mock()
        p = dmp.Push(log=lambda _msg: None)
        with mock.patch.object(dmp, "DataManagerClient", made):
            p.start(mdns_interfaces=["10.99.0.7"])
        made.assert_called_once_with(source="modulino-hub", mdns_interfaces=["10.99.0.7"])
        self.assertIs(p.client, made.return_value)


class RealClient(unittest.TestCase):
    """the copied client file itself, without a server and without opening a connection"""

    def test_server_down_readings_wait_in_the_queue_and_tick_returns_at_once(self):
        # port 9 on this machine: nothing listens. flush_every_s is long, so the sender thread
        # does not even try during the test; tick() must not wait for it either way.
        client = data_manager_client.DataManagerClient(source="modulino-hub", url="http://127.0.0.1:9",
                                                       token="secret-token-123", flush_every_s=3600)
        try:
            p = dmp.Push(client=client, log=lambda _msg: None)
            t = time.time()
            for k in range(20):
                p.tick(t + k, **ONE_PERSON)
            self.assertLess(time.time() - t, 0.5)
            st = p.status()
            self.assertEqual(st["queued_samples"], 20 + 2 + 2)
            self.assertEqual(st["sent"]["samples"], 0)
            self.assertNotIn("secret-token-123", json.dumps(st), "no token in the status")
            queued = list(client._samples)
            self.assertEqual({s["source"] for s in queued}, {"modulino-hub"})
            self.assertTrue(all(s["value"] > 0 for s in queued))
        finally:
            client._stop.set()
            client._wake.set()                               # stop the thread without a flush

    def test_close_with_a_queued_value_and_no_server_returns_soon(self):
        # no DATA_MANAGER_URL and nothing found over mDNS (zeroconf is a stub here): the client
        # has no address, so its own close() spends its whole 5 s trying
        client = data_manager_client.DataManagerClient(source="modulino-hub", url="",
                                                       flush_every_s=3600)
        p = dmp.Push(client=client, log=lambda _msg: None)
        p.tick(time.time(), **ONE_PERSON)
        self.assertIsNone(p.status()["url"])
        self.assertEqual(p.status()["queued_samples"], 3)
        t = time.time()
        with mock.patch.object(dmp, "CLOSE_WAIT_S", 0.2):
            p.close()
        self.assertLess(time.time() - t, 2.0)

    def test_switched_off_with_data_manager_url_off(self):
        with mock.patch.dict(os.environ, {"DATA_MANAGER_URL": "off"}):
            client = data_manager_client.DataManagerClient(source="modulino-hub")
        p = dmp.Push(client=client, log=lambda _msg: None)
        p.tick(T0, **ONE_PERSON)
        self.assertFalse(p.status()["enabled"])
        self.assertEqual(p.status()["queued_samples"], 0)
        p.close()

    def test_token_and_url_come_from_the_environment(self):
        env = {"DATA_MANAGER_URL": "off", "DATA_MANAGER_TOKEN": "from-the-environment"}
        with mock.patch.dict(os.environ, env):
            lines = []
            p = dmp.Push(log=lines.append)
            p.start()
        self.assertEqual(p.client.token, "from-the-environment")
        self.assertFalse(p.client.enabled)
        self.assertEqual(lines, [])

    def test_nothing_secret_in_the_app_files(self):
        with open(os.path.join(ROOT, "wendy.json")) as f:
            self.assertNotIn("DATA_MANAGER", f.read(), "token and URL are passed at deploy time")
        with open(os.path.join(ROOT, "Dockerfile")) as f:
            docker = f.read()
        self.assertNotIn("DATA_MANAGER_TOKEN", docker)
        for name in ("data_manager_client.py", "data_manager_push.py"):
            self.assertIn(name, docker, "the image must contain it")


class AppWiring(unittest.TestCase):
    """app.period_loop -> push_readings -> a fake client"""

    def setUp(self):
        reset()
        self._saved = (app.dm, dict(app.presence), dict(app.breathing), dict(app.hrv),
                       app.state.get("climate"), app.state.get("bridge"))
        self.lines = []
        self.client = FakeClient()
        app.dm = dmp.Push(client=self.client, log=self.lines.append)
        app.state["bridge"] = "connecting"                    # no Bridge calls in these tests
        self._patches = []

    def tearDown(self):
        for p in reversed(self._patches):
            p.stop()
        (app.dm, presence, breathing, hrv, app.state["climate"], app.state["bridge"]) = self._saved
        app.presence.clear(); app.presence.update(presence)
        app.breathing.update(breathing)
        app.hrv.update(hrv)
        reset()

    def _patch(self, name, value):
        p = mock.patch.object(app, name, value)
        p.start()
        self._patches.append(p)

    def _wearing(self, bpm=71, rmssd=46.2, breaths=12, since=60, quality=0.62):
        """one person has worn both clips for a while; the three updates give these numbers"""
        now = time.time()
        app.presence.update(auto=True, mode="active", since=now - since)
        app.last_locked[:] = [now, now]
        app.last_ppg = now                                    # samples are arriving

        def fuse():
            app.fused.update(bpm=bpm, sources=[0, 1] if bpm else [], quality=quality)
            return bpm

        def update_hrv():
            app.hrv.update(rmssd_ms=rmssd, channel="both" if rmssd else None)
            return rmssd

        def update_breathing():
            app.breathing.update(per_minute=breaths, channel=0 if breaths else None)
            return breaths

        self._patch("fuse", fuse)
        self._patch("update_hrv", update_hrv)
        self._patch("update_breathing", update_breathing)

    def test_one_person_three_seconds(self):
        self._wearing()
        app.period_loop(FakeStop(3))
        self.assertEqual(len(self.client.of(PULSE)), 3)
        self.assertEqual(len(self.client.of(HRV)), 1, "HRV at most every 10 s")
        self.assertEqual(len(self.client.of(BREATH)), 1)
        self.assertEqual(self.client.of(PULSE)[0]["value"], 71)
        self.assertEqual(self.client.of(PULSE)[0]["quality"], app.fused["quality"])
        self.assertLess(abs(self.client.of(PULSE)[0]["ts"] - time.time()), 2)
        self.assertEqual(self.lines, [])

    def test_no_finger_sends_nothing(self):
        self._wearing()
        app.presence.update(mode="idle", since=time.time())
        app.period_loop(FakeStop(3))
        self.assertEqual(self.client.samples, [])

    def test_warming_up_sends_nothing(self):
        self._wearing(since=1.0)                              # sensors on for 1 s of WARMUP_S
        app.period_loop(FakeStop(3))
        self.assertEqual(self.client.samples, [])

    def test_missing_hrv_sends_the_rest(self):
        self._wearing(rmssd=None)                             # under a minute of beats
        app.period_loop(FakeStop(2))
        self.assertEqual(self.client.metrics(), sorted([PULSE, BREATH]))

    def test_no_pulse_yet_sends_no_pulse(self):
        self._wearing(bpm=None, rmssd=None, breaths=None)
        app.period_loop(FakeStop(2))
        self.assertEqual(self.client.samples, [])

    def test_two_people_send_nothing_from_the_first_second(self):
        self._wearing()
        self._patch("periods_apart", lambda per: True)        # two clear, different rhythms
        app.period_loop(FakeStop(app.TWO_HEARTS_ON_S + 2))
        self.assertTrue(app.fused["two_hearts"])
        self.assertEqual(self.client.samples, [], "also not in the 3 s before two_hearts is decided")

    def test_hrv_from_a_clip_that_came_off_is_not_sent(self):
        # finger 2 came off 30 s ago; its stored beats still give an HRV and a breathing number
        self._wearing()
        app.last_locked[1] = time.time() - 30

        def update_hrv():
            app.hrv.update(rmssd_ms=46.2, channel=1)
            return 46.2

        def update_breathing():
            app.breathing.update(per_minute=12, channel=1)
            return 12

        def fuse():
            app.fused.update(bpm=71, sources=[0], quality=0.62)
            return 71

        self._patch("update_hrv", update_hrv)
        self._patch("update_breathing", update_breathing)
        self._patch("fuse", fuse)
        app.period_loop(FakeStop(2))
        self.assertEqual(self.client.metrics(), [PULSE], "the finger that is still worn")

    def test_fingers_live(self):
        now = time.time()
        app.last_ppg = now                                    # samples are arriving
        app.last_locked[:] = [now - 1, now - 10]
        self.assertTrue(app.fingers_live(0, now))
        self.assertFalse(app.fingers_live(1, now))
        self.assertFalse(app.fingers_live("both", now))
        self.assertFalse(app.fingers_live(None, now), "no finger named: not a live reading")
        self.assertFalse(app.fingers_live([0, 1], now))
        # no single finger (the fused rhythm of both buffers): live while samples arrive
        app.last_ppg = now - 1
        self.assertTrue(app.fingers_live([], now))
        app.last_ppg = now - 10
        self.assertFalse(app.fingers_live([], now), "nothing measured in the last 3 s")
        app.last_locked[:] = [now - 1, now - 1]
        self.assertFalse(app.fingers_live("both", now), "beats without samples cannot be live")

    def test_on_ppg_records_when_samples_arrive(self):
        now = time.time()
        self.assertFalse(app.stream_live(now), "no sample yet")
        app.on_ppg(1000, 8000, 8000)
        self.assertTrue(app.stream_live(time.time()))
        self.assertFalse(app.stream_live(time.time() + dmp.LIVE_S + 1))

    def _clean_signal(self, bpm=75, seconds=12):
        """both fingers: `seconds` of a clean pulse, handed in the way the STM32 does"""
        beat_times = [int(k * 60000 / bpm) for k in range(1, int(seconds * bpm / 60))]
        for t, v in ppg_for_beats(beat_times):
            app.on_ppg(t, v, v)
        app.presence.update(auto=True, mode="active", since=time.time() - 60)

    def test_stopped_sample_stream_sends_no_pulse(self):
        # the STM32 stopped delivering samples 30 s ago (hang, sketch reflash, router restart).
        # The buffers keep their last seconds, so the hub still sees a clear 75 BPM rhythm in
        # them; with the real fuse() that became a pulse with a fresh timestamp every second
        self._clean_signal()
        old = time.time() - 30
        app.last_ppg = old
        app.last_locked[:] = [old, old]
        for c in range(app.CHANNELS):
            app.state["fingers"][c] = {"bpm_live": 75, "locked": True, "t": old}
        app.period_loop(FakeStop(5))
        self.assertGreaterEqual(app.fused["quality"], 0.5, "the old buffer still looks like a clear rhythm")
        self.assertEqual(app.fused["sources"], [])
        self.assertEqual(self.client.samples, [], "nothing was measured in these seconds")
        self.assertEqual(self.lines, [])

    def test_running_sample_stream_sends_the_fused_rhythm(self):
        # the same signal while samples arrive: no finger has a beat-locked BPM, the pulse is
        # the rhythm of both buffers and it is of this second
        self._clean_signal()
        app.period_loop(FakeStop(2))
        self.assertEqual(app.fused["sources"], [])
        self.assertEqual([s["value"] for s in self.client.of(PULSE)], [75, 75])

    def test_climate_reaches_the_client_once_a_minute(self):
        app.presence.update(mode="idle", since=time.time())
        app.on_climate(21.5, 40.0)
        app.period_loop(FakeStop(3))
        self.assertEqual(self.client.samples, [], "the minute is not over")
        app.dm._climate[0] = (app.dm._climate[0][0] - 61,) + app.dm._climate[0][1:]    # a minute later
        app.period_loop(FakeStop(1))
        self.assertEqual(self.client.metrics(), sorted([TEMP, HUM]))
        self.assertEqual(self.client.of(TEMP)[0]["value"], 21.5)

    def test_client_exception_never_reaches_period_loop(self):
        self._wearing()
        app.on_climate(21.5, 40.0)
        self.client.fail = RuntimeError("client broke")
        app.period_loop(FakeStop(5))                          # must simply return
        self.assertGreaterEqual(self.client.calls, 5)
        self.assertEqual(app.fused["bpm"], 71, "the hub's own reading is untouched")
        self.assertEqual(len(self.lines), 1, "logged once")

    def test_broken_push_never_reaches_period_loop(self):
        self._wearing()
        app.dm.tick = mock.Mock(side_effect=RuntimeError("push broke"))
        app.period_loop(FakeStop(5))
        self.assertEqual(app.dm.tick.call_count, 5)
        self.assertEqual(len(self.lines), 1, "logged once")

    def test_hub_without_a_started_client_runs_as_before(self):
        app.dm = dmp.Push(log=self.lines.append)              # as when the client file is missing
        self._wearing()
        app.period_loop(FakeStop(3))
        self.assertEqual(app.fused["bpm"], 71)
        self.assertEqual(self.lines, [])

    def test_state_shows_the_data_manager(self):
        snap = app.state_snapshot()
        self.assertEqual(snap["data_manager"]["url"], "http://jetson:8100")
        self.assertIn("push_error", snap["data_manager"])
        json.dumps(snap)


if __name__ == "__main__":
    unittest.main()
