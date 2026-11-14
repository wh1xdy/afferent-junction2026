"""Offline tests for the BLE payload (AFF1 v2), the idle reset and GET /state (no board, no Bluetooth).

    cd uno-q/modulino-hub && python3 -m unittest discover tests -v

The hardware stubs come from test_sensor_logic.py (importing it installs them and imports app.py).
That module replaces `ble` with a stub, so the real ble.py is loaded here from its file under
another module name. HeartRateBroadcaster(start=False) starts no thread and no Bluetooth; its
_push (the hand-over to the BLE thread) is replaced by a recorder.
"""
import copy
import importlib.util
import json
import os
import sys
import time
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)

from test_sensor_logic import app, reset  # noqa: E402  (installs the stubs, imports app)

_spec = importlib.util.spec_from_file_location("afferent_ble_real", os.path.join(ROOT, "ble.py"))
ble = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(ble)


def recorder():
    """a real HeartRateBroadcaster whose pushes are recorded instead of sent"""
    b = ble.HeartRateBroadcaster(start=False)
    b.pushed = []
    b._push = lambda both, hrm=None, hrm_reset=False: b.pushed.append((bytes(both), hrm, hrm_reset))
    return b


class FakeStop:
    """stands in for the threading.Event of a loop: lets it run n rounds without waiting"""
    def __init__(self, rounds):
        self.rounds = rounds

    def wait(self, _timeout=None):
        self.rounds -= 1
        return self.rounds < 0


class PackAff1(unittest.TestCase):
    def test_golden_payload(self):
        self.assertEqual(ble.pack_aff1([71, 73], 6, 46, 0.62, 'active').hex(' '), "47 49 06 2e 3e 03")

    def test_always_six_bytes_and_a_bytearray(self):
        p = ble.pack_aff1([0, 0], 0, 0, None, None)
        self.assertIsInstance(p, bytearray)
        self.assertEqual(bytes(p), bytes([0, 0, 0, 0, 255, 0]))

    def test_quality_none_is_255(self):
        self.assertEqual(ble.pack_aff1([71, 73], 6, 46, None, 'active')[4], 255)

    def test_quality_zero_is_zero_not_missing(self):
        self.assertEqual(ble.pack_aff1([71, 73], 6, 46, 0.0, 'active')[4], 0)

    def test_quality_just_below_the_reliability_limit_stays_below(self):
        # A7: quality < 0.3 is unreliable; 0.29 must not round up to 30
        self.assertEqual(ble.pack_aff1([0, 0], 0, 0, 0.29, 'active')[4], 29)
        self.assertEqual(ble.pack_aff1([0, 0], 0, 0, 0.30, 'active')[4], 30)

    def test_presence_codes(self):
        self.assertEqual(ble.PRESENCE_CODE, {'idle': 1, 'probing': 2, 'active': 3})
        for mode, code in (('idle', 1), ('probing', 2), ('active', 3)):
            self.assertEqual(ble.pack_aff1([0, 0], 0, 0, None, mode)[5], code)

    def test_unknown_mode_is_zero(self):
        for mode in ('sleeping', '', None):
            self.assertEqual(ble.pack_aff1([71, 73], 6, 46, 0.62, mode)[5], 0)

    def test_clamping(self):
        p = ble.pack_aff1([300, 256], 999, 300.4, 1.7, 'active')
        self.assertEqual(list(p), [255, 255, 255, 255, 100, 3])
        p = ble.pack_aff1([-5, -1], -3, -0.4, -0.2, 'idle')
        self.assertEqual(list(p), [0, 0, 0, 0, 0, 1])

    def test_missing_readings_are_zero(self):
        self.assertEqual(list(ble.pack_aff1([None, 73], None, None, 0.5, 'active')), [0, 73, 0, 0, 50, 3])
        self.assertEqual(list(ble.pack_aff1(None, 0, 0, None, 'idle')), [0, 0, 0, 0, 255, 1])

    def test_rmssd_is_rounded(self):
        self.assertEqual(ble.pack_aff1([0, 0], 0, 45.6, None, None)[3], 46)

    def test_no_bless_import_at_module_level(self):
        # pack_aff1 must be usable without Bluetooth: bless is imported only inside _start
        self.assertNotIn("bless", sys.modules)

    def test_initial_characteristic_value_is_the_empty_v2_payload(self):
        with open(os.path.join(ROOT, "ble.py")) as f:
            self.assertIn("bytearray([0, 0, 0, 0, 255, 0])", f.read())


class Broadcaster(unittest.TestCase):
    def test_starts_without_quality_and_mode(self):
        b = recorder()
        self.assertIsNone(b._quality)
        self.assertIsNone(b._mode)

    def test_update_status_notifies_only_on_change_or_keepalive(self):
        b = recorder()
        b.update_status(0.62, 'active')
        self.assertEqual(len(b.pushed), 1)
        self.assertEqual(b.pushed[-1][0][4:], bytes([62, 3]))
        b.update_status(0.62, 'active')                      # same payload: silent
        b.update_status(0.624, 'active')                     # same byte after rounding: silent
        self.assertEqual(len(b.pushed), 1)
        b.update_status(0.62, 'active', keepalive=True)      # keepalive: always
        self.assertEqual(len(b.pushed), 2)
        b.update_status(0.40, 'active')                      # quality changed
        b.update_status(None, 'idle')                        # mode changed
        self.assertEqual(len(b.pushed), 4)
        self.assertEqual(b.pushed[-1][0], bytes([0, 0, 0, 0, 255, 1]))
        self.assertTrue(all(hrm is None for _, hrm, _ in b.pushed), "status never touches 2A37")

    def test_first_status_is_sent_even_when_it_equals_the_initial_value(self):
        b = recorder()
        b.update_status(None, None)          # 00 00 00 00 FF 00, nothing sent before
        self.assertEqual(len(b.pushed), 1)

    def test_status_bytes_travel_with_every_reading(self):
        b = recorder()
        b.update_status(0.62, 'active')
        b.update_finger(0, 71)
        b.update_finger(1, 73)
        b.update_breathing(6)
        b.update_hrv(46.2)
        self.assertEqual(b.pushed[-1][0].hex(' '), "47 49 06 2e 3e 03")
        b.update_status(0.62, 'active')      # nothing changed since the last notify
        self.assertEqual(len(b.pushed), 5)

    def test_fused_pulse_goes_to_2a37(self):
        b = recorder()
        b.update(0, 72)
        self.assertEqual(b.pushed[-1][1], 72)

    def test_clear_readings_zeroes_bytes_0_to_3_and_keeps_4_to_5(self):
        b = recorder()
        b.update_status(0.62, 'active')
        b.update_finger(0, 71)
        b.update_finger(1, 73)
        b.update_breathing(6)
        b.update_hrv(46)
        n = len(b.pushed)
        b.clear_readings()
        self.assertEqual(len(b.pushed), n + 1, "clear_readings notifies")
        payload, hrm, hrm_reset = b.pushed[-1]
        self.assertEqual(payload, bytes([0, 0, 0, 0, 62, 3]))
        self.assertIsNone(hrm, "no 2A37 notification without a pulse")
        self.assertTrue(hrm_reset, "the stored 2A37 value is reset for clients that read it")
        b.update_breathing(0)                # already 0: silent
        b.update_hrv(0)
        self.assertEqual(len(b.pushed), n + 1)

    def test_without_a_server_nothing_is_sent_and_nothing_raises(self):
        b = ble.HeartRateBroadcaster(start=False)       # real _push, no BLE server
        b.update_status(0.5, 'active', keepalive=True)
        b.update_finger(0, 70)
        b.clear_readings()
        self.assertEqual(b.status, "not started")


class AppWiring(unittest.TestCase):
    """app.py against a recording broadcaster"""

    def setUp(self):
        reset()
        self._saved = (app.ble, dict(app.presence), dict(app.breathing), dict(app.hrv),
                       list(app._hrv_history), app.state.get("bridge"), app.LEAVE_AFTER_S,
                       copy.deepcopy(app.fused))
        app.ble = recorder()

    def tearDown(self):
        (app.ble, presence, breathing, hrv, hist, bridge, app.LEAVE_AFTER_S, fused) = self._saved
        app.presence.clear(); app.presence.update(presence)
        app.breathing.update(breathing)
        app.hrv.update(hrv)
        app._hrv_history.clear(); app._hrv_history.extend(hist)
        app.state["bridge"] = bridge
        app.fused.clear(); app.fused.update(fused)
        reset()

    def _measuring(self):
        """a finger has been measured for a while: live breathing + HRV numbers and a baseline"""
        app.presence.update(auto=True, mode="active", since=time.time() - 60)
        app.breathing.update(per_minute=6, snr=7.5, channel=0)
        app.hrv.update(rmssd_ms=46.2, sdnn_ms=51.0, mean_bpm=72, pairs=58, channel="both",
                       baseline_rmssd_ms=42.0, vs_baseline=0.1)
        app._hrv_history.extend((time.time() - k, 42.0) for k in range(130))

    def _assert_live_metrics_cleared(self):
        self.assertEqual(app.breathing, {"per_minute": None, "snr": None, "channel": None})
        for k in ("rmssd_ms", "sdnn_ms", "mean_bpm", "channel", "vs_baseline"):
            self.assertIsNone(app.hrv[k], k)
        self.assertEqual(app.hrv["pairs"], 0)
        self.assertEqual(app.hrv["baseline_rmssd_ms"], 42.0, "the personal baseline is kept")
        self.assertEqual(len(app._hrv_history), 130, "and so is the history behind it")

    def test_ble_status_sends_quality_and_presence_while_sensing(self):
        app.presence.update(mode="active", since=time.time() - 60)
        app.fused.update(quality=0.62)
        app.ble_status(1)
        self.assertEqual(app.ble.pushed[-1][0][4:], bytes([62, 3]))
        app.ble_status(3)                                   # odd tick, unchanged: silent
        self.assertEqual(len(app.ble.pushed), 1)
        app.ble_status(4)                                   # even tick: keepalive
        self.assertEqual(len(app.ble.pushed), 2)

    def test_ble_status_reports_no_quality_while_not_sensing(self):
        app.fused.update(quality=0.62)                      # stale number from before
        app.presence.update(mode="idle", since=time.time())
        app.ble_status(1)
        self.assertEqual(app.ble.pushed[-1][0][4:], bytes([255, 1]))
        app.presence.update(mode="probing", since=time.time())
        app.ble_status(3)
        self.assertEqual(app.ble.pushed[-1][0][4:], bytes([255, 2]))
        app.presence.update(mode="active", since=time.time())    # warming up: readings do not count yet
        app.ble_status(5)
        self.assertEqual(app.ble.pushed[-1][0][4:], bytes([255, 3]))

    def test_keepalive_at_least_every_two_seconds_while_idle(self):
        app.presence.update(mode="idle", since=time.time())
        for tick in range(1, 11):
            app.ble_status(tick)
        # 1 change + keepalives on ticks 2, 4, 6, 8, 10
        self.assertEqual(len(app.ble.pushed), 6)

    def test_forget_beats_clears_the_ble_readings(self):
        app.ble.update_status(0.2, 'active')
        app.ble.update_finger(0, 71)
        app.ble.update_finger(1, 73)
        app.beats[0].append((1000, 800))
        app.state["fingers"][0] = {"bpm_live": 71, "t": time.time()}
        app._forget_beats()
        self.assertEqual(app.ble.pushed[-1][0], bytes([0, 0, 0, 0, 20, 3]))
        self.assertEqual(len(app.beats[0]), 0)
        self.assertIsNone(app.state["fingers"][0])

    def test_reset_live_metrics_keeps_the_baseline(self):
        self._measuring()
        app.reset_live_metrics()
        self._assert_live_metrics_cleared()

    def test_presence_loop_going_idle_resets_breathing_and_hrv(self):
        self._measuring()
        app.ble.update_finger(0, 71)
        app.ble.update_breathing(6)
        app.ble.update_hrv(46)
        app.state["bridge"] = "connected"
        app.LEAVE_AFTER_S = -1.0                 # the weak pulse has lasted long enough at once
        app.presence_loop(FakeStop(2))           # round 1 notes the weak pulse, round 2 leaves
        self.assertEqual(app.presence["mode"], "idle")
        self._assert_live_metrics_cleared()
        self.assertEqual(app.ble.pushed[-1][0][:4], bytes(4), "per-finger, breathing and RMSSD bytes are 0")
        snap = app.state_snapshot()
        self.assertIsNone(snap["breathing"]["per_minute"])
        self.assertIsNone(snap["hrv"]["rmssd_ms"])
        self.assertEqual(snap["hrv"]["baseline_rmssd_ms"], 42.0)
        self.assertEqual(snap["presence"]["mode"], "idle")

    def test_period_loop_while_idle_drops_late_results_and_reports_idle(self):
        # the finger left while update_breathing / update_hrv were running: their late result
        # (and the last per-finger numbers) must not stay in /state or on AFF1 while idle
        self._measuring()
        app.presence.update(mode="idle", since=time.time())
        app.fused.update(bpm=72, sources=[0, 1], fingers=[71, 73])
        app.ble.update_breathing(6)
        app.ble.update_hrv(46)
        app.period_loop(FakeStop(2))
        self._assert_live_metrics_cleared()
        self.assertIsNone(app.fused["bpm"])
        self.assertEqual(app.fused["fingers"], [None, None])
        self.assertEqual(app.ble.pushed[-1][0], bytes([0, 0, 0, 0, 255, 1]))
        self.assertTrue(all(hrm is None for _, hrm, _ in app.ble.pushed), "no 2A37 without a pulse")


class StateSnapshot(unittest.TestCase):
    def setUp(self):
        reset()

    def test_contains_now_and_the_physio_blocks(self):
        before = time.time()
        snap = app.state_snapshot()
        after = time.time()
        for key in ("now", "finger", "breathing", "hrv", "presence"):
            self.assertIn(key, snap)
        self.assertIsInstance(snap["now"], float)
        self.assertTrue(before <= snap["now"] <= after, "now is the device clock at the snapshot")
        self.assertIn("mode", snap["presence"])
        self.assertNotIn("t_on", snap["presence"])
        for key in ("bpm", "quality", "sources", "fingers"):
            self.assertIn(key, snap["finger"])
        for key in ("rmssd_ms", "sdnn_ms", "vs_baseline", "baseline_rmssd_ms"):
            self.assertIn(key, snap["hrv"])
        for key in ("per_minute", "snr"):
            self.assertIn(key, snap["breathing"])

    def test_is_what_get_state_serialises(self):
        json.dumps(app.state_snapshot())       # the handler sends exactly this as JSON

    def test_now_is_on_the_same_clock_as_the_reading_timestamps(self):
        app.state["fingers"][0] = {"bpm_live": 72, "t": time.time()}
        snap = app.state_snapshot()
        self.assertLess(abs(snap["now"] - snap["fingers"][0]["t"]), 1.0)


class SketchDefaults(unittest.TestCase):
    """guards the quiet bedside default (Alex A3); the sketch itself cannot run here"""

    def setUp(self):
        with open(os.path.join(ROOT, "sketch", "sketch.ino")) as f:
            self.src = f.read()

    def test_heartbeat_beep_is_off_by_default(self):
        self.assertIn("bool heartbeatSound = false;", self.src)
        self.assertNotIn("bool heartbeatSound = true;", self.src)

    def test_ui_sounds_are_off_and_gate_the_startup_beep_and_the_knob_click(self):
        self.assertIn("UI_SOUNDS = false", self.src)
        tones = [line for line in self.src.splitlines() if "buzzer.tone(" in line]
        startup = [line for line in tones if "1760" in line]
        click = [line for line in tones if "1200" in line]
        self.assertEqual(len(startup), 1)
        self.assertEqual(len(click), 1)
        self.assertIn("UI_SOUNDS &&", startup[0])
        self.assertIn("UI_SOUNDS &&", click[0])

    def test_heartbeat_beep_can_still_be_switched_on(self):
        self.assertIn('Bridge.provide_safe("heartbeat_sound", setHeartbeatSound);', self.src)
        self.assertIn("locked && heartbeatSound && buzzerOk", self.src)


if __name__ == "__main__":
    unittest.main()
