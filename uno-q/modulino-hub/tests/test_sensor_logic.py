"""Offline tests for the UNO Q sensor logic (no board, no Bridge, no Bluetooth).

    cd uno-q/modulino-hub && python3 -m unittest discover tests -v

app.py is imported with its hardware dependencies stubbed, then the pure functions are fed
synthetic pulse signals with known answers.
"""
import collections
import math
import os
import random
import sys
import time
import types
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))


def _stub_modules():
    rb = types.ModuleType("arduino.router_bridge")

    class Bridge:
        def __init__(self, *a, **k): pass
        def call(self, *a, **k): return True
        def provide(self, *a, **k): pass
        def connect(self, *a, **k): return True
        def disconnect(self): pass
    rb.Bridge = Bridge
    arduino = types.ModuleType("arduino")
    arduino.router_bridge = rb
    sys.modules.update({"arduino": arduino, "arduino.router_bridge": rb})

    zc = types.ModuleType("zeroconf")
    zc.IPVersion = types.SimpleNamespace(V4Only=4)
    zc.ServiceInfo = zc.Zeroconf = object
    sys.modules["zeroconf"] = zc

    net = types.ModuleType("network")
    net.interface_ipv4 = lambda: "127.0.0.1"
    sys.modules["network"] = net

    ble = types.ModuleType("ble")

    class HeartRateBroadcaster:
        status = "stub"
        def update(self, *a): pass
        def update_finger(self, *a): pass
        def update_breathing(self, *a): pass
        def update_hrv(self, *a): pass
        def update_status(self, *a, **k): pass
        def clear_readings(self): pass
    ble.HeartRateBroadcaster = HeartRateBroadcaster
    sys.modules["ble"] = ble
    os.environ.setdefault("APP_SOCKET", "/tmp/none")


_stub_modules()
import app  # noqa: E402


def reset():
    for c in range(app.CHANNELS):
        app.ppgs[c].clear()
        app.beats[c].clear()
        app.state["fingers"][c] = None
        app.period_state[c].update(period_ms=None, quality=None, signal=None)
    app.fused.update(bpm=None, period_ms=None, quality=None, sources=[], two_hearts=False)
    app.reset_two_hearts()
    for c in range(app.CHANNELS):
        app.last_locked[c] = 0.0
        app.sent_bpm[c] = 0
    app.last_ppg = 0.0
    app.reset_guards()
    app.reset_clips()


def beats_with_breathing(rate_per_min, base_bpm=72, swing_bpm=8, n=70):
    """locked beats whose heart rate swings with breathing (respiratory sinus arrhythmia)"""
    out, t = [], 1.0
    for _ in range(n):
        hr = base_bpm + swing_bpm * math.sin(2 * math.pi * rate_per_min / 60 * t)
        ibi = 60000 / hr
        t += ibi / 1000
        out.append((int(t * 1000), int(ibi)))
    return out


def ppg_for_beats(beat_times_ms, dt=22.2, noise=8, seed=1):
    """PulseSensor-like signal sampled at ~45 Hz: a steep upstroke at each beat, slow decay"""
    rnd = random.Random(seed)
    samples, t = [], 0.0
    end = beat_times_ms[-1] + 300
    while t < end:
        t += dt + rnd.uniform(-1.5, 1.5)
        v = 8000.0
        for b in beat_times_ms:
            x = t - b
            if -200 < x < 700:
                v += 1500 / (1 + math.exp(-x / 25)) * math.exp(-max(x, 0) / 400)
        samples.append((int(t), int(v + rnd.gauss(0, noise))))
    return samples


class Breathing(unittest.TestCase):
    def setUp(self):
        reset()
        app.period_state[0]["period_ms"] = 833

    def test_recovers_paced_breathing_rates(self):
        for rate in (6, 10, 18):
            app.beats[0].clear()
            app.beats[0].extend(beats_with_breathing(rate))
            r = app.rsa_breathing(0)
            self.assertIsNotNone(r, rate)
            self.assertEqual(r[0], rate)
            self.assertGreater(r[1], 3, f"{rate}/min should be a clear peak")

    def test_no_rhythm_gives_no_clear_reading(self):
        rnd = random.Random(7)
        t, out = 1.0, []
        for _ in range(70):
            ibi = 833 + rnd.gauss(0, 25)
            t += ibi / 1000
            out.append((int(t * 1000), int(ibi)))
        app.beats[0].extend(out)
        r = app.rsa_breathing(0)
        self.assertTrue(r is None or r[1] < 3, r)

    def test_needs_25_seconds(self):
        app.beats[0].extend(beats_with_breathing(10, n=25))     # ~21 s
        self.assertIsNone(app.rsa_breathing(0))


class HRV(unittest.TestCase):
    def setUp(self):
        reset()
        app.period_state[0]["period_ms"] = 800

    def _run(self, sd, seed):
        rnd = random.Random(seed)
        ibis = [800 + rnd.gauss(0, sd / math.sqrt(2)) for _ in range(90)]
        times = [1000.0]
        for i in ibis:
            times.append(times[-1] + i)
        true = math.sqrt(sum((b - a) ** 2 for a, b in zip(ibis, ibis[1:])) / (len(ibis) - 1))
        ppg = ppg_for_beats(times)
        app.ppgs[0].extend(ppg)
        # detections like the sketch: first sample whose rise exceeds a threshold
        det, prev, last = [], ppg[0][1], -1e9
        for t, v in ppg[1:]:
            if v - prev > 80 and t - last > 400:
                det.append(t)
                last = t
            prev = v
        for a, b in zip(det, det[1:]):
            app.beats[0].append((b, b - a))
        # truth over the same last-60-s window that compute_hrv uses
        t_end = app.beats[0][-1][0]
        w = [b - a for a, b in zip(times, times[1:]) if b >= t_end - 60000]
        true = math.sqrt(sum((y - x) ** 2 for x, y in zip(w, w[1:])) / (len(w) - 1))
        return true, app.compute_hrv(0)

    def test_rmssd_close_to_truth(self):
        for sd, seed in ((40, 2), (70, 3)):
            reset()
            app.period_state[0]["period_ms"] = 800
            true, r = self._run(sd, seed)
            self.assertIsNotNone(r)
            # within 10 % or 8 ms (45 Hz sampling leaves a small positive bias)
            self.assertLess(abs(r["rmssd_ms"] - true), max(8, 0.1 * true), f"true {true:.1f}, got {r['rmssd_ms']}")
            self.assertAlmostEqual(r["mean_bpm"], 75, delta=2)      # random intervals average ~800 ms

    def test_artefacts_are_dropped(self):
        # steady 800 ms beats with one missed beat (1600) and one double beat (400)
        times, t = [], 1000
        for k in range(80):
            t += 800 + (5 if k % 2 else -5)
            times.append(t)
        times.remove(times[30])                   # missed beat
        times.insert(50, times[49] + 400)         # double beat
        app.ppgs[0].extend(ppg_for_beats(times))
        for a, b in zip(times, times[1:]):
            app.beats[0].append((b, b - a))
        r = app.compute_hrv(0)
        self.assertIsNotNone(r)
        self.assertLess(r["rmssd_ms"], 25, "artefacts must not inflate RMSSD")


class Fusion(unittest.TestCase):
    def setUp(self):
        reset()

    def _finger(self, c, bpm, q):
        app.state["fingers"][c] = {"bpm_live": bpm, "t": time.time()}
        app.period_state[c].update(period_ms=round(60000 / bpm), quality=q)

    def test_agreeing_fingers_average(self):
        self._finger(0, 80, 0.8)
        self._finger(1, 84, 0.4)
        self.assertEqual(app.fuse(), 81)            # weighted towards the better finger
        self.assertEqual(app.fused["sources"], [0, 1])

    def test_disagreeing_fingers_pick_the_one_matching_the_rhythm(self):
        self._finger(0, 120, 0.5)                   # double-counting finger
        self._finger(1, 75, 0.5)
        app.fused.update(period_ms=800, quality=0.7)   # combined rhythm says 75
        self.assertEqual(app.fuse(), 75)

    def test_weak_finger_is_ignored(self):
        self._finger(0, 90, 0.1)
        self._finger(1, 72, 0.6)
        self.assertEqual(app.fuse(), 72)


class RhythmPeak(unittest.TestCase):
    """Seen on the board: for the first seconds after the clips go on the signal drifts, the
    autocorrelation is highest at the shortest lag (317 ms) and that went out as 188 BPM."""

    def setUp(self):
        reset()

    @staticmethod
    def _drift(n=540, dt=22.2, seed=3):
        rnd = random.Random(seed)
        return [(1000 + i * dt, 8000 + 2500 * math.exp(-i / 200) + rnd.gauss(0, 6)) for i in range(n)]

    def test_a_settling_drift_is_not_a_heartbeat(self):
        app.ppgs[0].extend(self._drift())
        lags, r = app.autocorr(0)
        k = max(range(len(r)), key=r.__getitem__)
        self.assertEqual(k, 0)                                   # the artefact: best lag = edge of the range
        self.assertGreater(r[k], 0.3)                            # ...and strong enough to have counted before
        ms, q, signal = app.rhythm_peak(lags, r)
        self.assertIsNone(ms)
        self.assertEqual(q, 0.0)
        self.assertGreater(signal, 0.3)                          # still "something is on the sensor"
        self.assertEqual(app.pulse_period(0), (None, 0.0))
        self.assertEqual(app.fused_period([(lags, r)], [signal]), (None, 0.0))

    def test_a_real_pulse_is_unchanged(self):
        beats = [1000 + 800 * k for k in range(16)]              # 75 BPM
        app.ppgs[0].extend(ppg_for_beats(beats))
        ms, q = app.pulse_period(0)
        self.assertAlmostEqual(ms, 800, delta=25)
        self.assertGreater(q, 0.5)
        lags, r = app.autocorr(0)
        fp, fq = app.fused_period([(lags, r)], [q])
        self.assertAlmostEqual(fp, 800, delta=25)

    def test_no_pulse_from_the_fused_rhythm_alone_while_settling(self):
        for c in range(2):
            app.ppgs[c].extend(self._drift(seed=c + 1))
            app.period_state[c].update(period_ms=None, quality=0.0, signal=0.6)
        curves = [app.autocorr(c) for c in range(2)]
        fp, fq = app.fused_period(curves, [0.6, 0.6])
        app.fused.update(period_ms=fp, quality=fq)
        self.assertIsNone(app.fuse())


class TwoHearts(unittest.TestCase):
    """Heart Duel: each clip on a different person. The fusion must not tie them together."""

    def setUp(self):
        reset()

    @staticmethod
    def _per(bpm0, q0, bpm1, q1):
        return [{"period_ms": round(60000 / b) if b else None, "quality": q} for b, q in ((bpm0, q0), (bpm1, q1))]

    def test_same_heart_is_not_two(self):
        self.assertIs(app.periods_apart(self._per(72, 0.8, 75, 0.6)), False)

    def test_different_rhythms_are_two(self):
        self.assertIs(app.periods_apart(self._per(62, 0.7, 88, 0.6)), True)

    def test_double_counting_sensor_is_one_heart(self):
        self.assertIs(app.periods_apart(self._per(70, 0.7, 140, 0.5)), False)

    def test_unclear_rhythm_is_unknown(self):
        self.assertIsNone(app.periods_apart(self._per(62, 0.7, 88, 0.2)))
        self.assertIsNone(app.periods_apart(self._per(62, 0.7, None, 0.9)))

    def test_switches_on_after_three_seconds_and_off_again(self):
        self.assertEqual([app.update_two_hearts(True) for _ in range(3)], [False, False, True])
        self.assertTrue(app.update_two_hearts(None))            # one second without a clear rhythm: stay
        self.assertEqual([app.update_two_hearts(False) for _ in range(3)], [True, True, False])

    def test_a_blip_does_not_switch_on(self):
        seq = [True, True, False, True, True, False]
        self.assertFalse(any(app.update_two_hearts(a) for a in seq))

    def test_switches_off_when_the_second_person_is_gone(self):
        for _ in range(3):
            app.update_two_hearts(True)
        res = [app.update_two_hearts(None) for _ in range(app.TWO_HEARTS_UNKNOWN_S)]
        self.assertEqual(res[-2:], [True, False])

    def test_detector_gets_the_combined_rhythm_for_one_person(self):
        own = {"period_ms": 400, "quality": 0.4}                 # this finger counts double
        self.assertEqual(app.detector_period(own, 800, 0.7, False), (800, 0.7))
        self.assertEqual(app.detector_period(own, 800, 0.3, False), (400, 0.4))

    def test_detector_keeps_its_own_rhythm_for_two_people(self):
        own = {"period_ms": 680, "quality": 0.4}
        self.assertEqual(app.detector_period(own, 970, 0.7, True), (680, 0.4))

    def test_a_removed_clip_leaves_the_packet_while_the_other_stays(self):
        now = time.time()
        app.sent_bpm[:] = [64, 88]
        app.last_locked[:] = [now - 0.5, now - 6.0]              # finger 2 came off 6 s ago
        self.assertEqual(app.stale_fingers(now), [1])
        app.sent_bpm[1] = 0
        self.assertEqual(app.stale_fingers(now), [])             # cleared once, not every second

    def test_a_beat_refreshes_only_its_own_finger(self):
        now = time.time()
        app.period_state[0].update(period_ms=940, quality=0.8)
        app.finger_guards[0].trusted, app.finger_guards[0].trusted_t = 64, now   # worn for a while
        for k in range(4):
            app.on_beat(0, 1000 + 940 * k, 940, 900, True)
        self.assertEqual(app.sent_bpm, [64, 0])
        self.assertGreaterEqual(app.last_locked[0], now)
        self.assertEqual(app.last_locked[1], 0.0)

    def test_state_says_two_hearts(self):
        self.assertIn("two_hearts", app.fused)


class Presence(unittest.TestCase):
    def setUp(self):
        reset()

    def test_no_finger_is_quiet_finger_is_not(self):
        t_on = 10000
        app.ppgs[0].extend((t_on + int(i * 22.2), 8150 + (i * 37 % 60)) for i in range(160))
        self.assertLess(app._probe_range(t_on), app.PRESENCE_RANGE)
        reset()
        beats = [t_on + 1300 + k * 800 for k in range(4)]
        app.ppgs[0].extend((t + t_on - t_on, v) for t, v in ppg_for_beats([b for b in beats]) if t >= t_on)
        self.assertGreater(app._probe_range(t_on), app.PRESENCE_RANGE)

    # one probe of each clip as recorded on the board on 2026-11-14 with no finger, every other
    # sample of the look window (1250-2250 ms after power-on), then what followed
    TAIL_DIP = [7738, 7919, 7830, 7464, 7072, 7212, 7294, 7333, 7373, 7316, 7366, 7375, 7481, 7481, 7451,
                7348, 7276, 7313, 7354, 7419, 7328, 7353, 7392]            # range 891: "finger"
    SPIKE = [8208, 8239, 8248, 8268, 8211, 8229, 8254, 8241, 8220, 8180, 8176, 8211, 8292, 8614, 9536, 9267,
             8661, 8307, 8236, 8036, 7960, 8023, 8153, 8256]               # clip 2's lead, range 1250

    @staticmethod
    def _probe(look, after, t_on=10000, dt=22.2):
        """a probe: look window from the record (every other sample), then `after` samples"""
        vals = [v for x in look for v in (x, x)] + after
        start = t_on + app.PROBE_SETTLE_MS
        return [(int(start + i * dt), v) for i, v in enumerate(vals)]

    def test_a_single_event_without_a_finger_is_not_a_finger(self):
        rnd = random.Random(4)
        for c, rec, dc in ((0, self.TAIL_DIP, 7400), (1, self.SPIKE, 8200)):
            reset()
            app.ppgs[c].extend(self._probe(rec, [dc + int(rnd.gauss(0, 40)) for _ in range(70)]))
            self.assertGreater(app._probe_range(10000, c), app.PRESENCE_RANGE, "the old check said finger")
            found, swings = app.probe_finger(10000)
            self.assertFalse(found, swings)

    def test_a_finger_in_either_clip_is_found(self):
        t_on = 10000
        beats = [t_on + 1300 + k * 800 for k in range(6)]
        for c in range(app.CHANNELS):
            reset()
            app.ppgs[c].extend((t, v) for t, v in ppg_for_beats(beats) if t >= t_on)
            found, swings = app.probe_finger(t_on)
            self.assertTrue(found, (c, swings))
            self.assertGreater(swings[c][0], app.PRESENCE_RANGE)

    def test_a_slow_or_fast_pulse_is_found(self):
        t_on = 10000
        for bpm in (48, 55, 60, 75, 100, 120, 140):        # a person at rest
            for offset in (900, 1100, 1300, 1500):            # where the first beat falls
                reset()
                per = 60000 / bpm
                beats = [t_on + offset + k * per for k in range(8)]
                app.ppgs[0].extend((t, v) for t, v in ppg_for_beats(beats) if t >= t_on)
                found, swings = app.probe_finger(t_on)
                if app._probe_range(t_on) > app.PRESENCE_RANGE:   # what the old single look found...
                    self.assertTrue(found, (bpm, offset, swings))  # ...is still found
                if 60 <= bpm <= 140:
                    self.assertTrue(found, (bpm, offset, swings))

    def test_railed_power_on_transient_is_not_a_finger(self):
        t_on = 10000
        vals = [13800 if i % 7 < 2 else 8000 for i in range(160)]
        app.ppgs[0].extend((t_on + int(i * 22.2), v) for i, v in enumerate(vals))
        self.assertEqual(app._probe_range(t_on), 0)


if __name__ == "__main__":
    unittest.main()
