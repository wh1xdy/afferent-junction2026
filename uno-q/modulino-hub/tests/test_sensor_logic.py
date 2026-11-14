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
        app.period_state[c].update(period_ms=None, quality=None)
    app.fused.update(bpm=None, period_ms=None, quality=None, sources=[])


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

    def test_railed_power_on_transient_is_not_a_finger(self):
        t_on = 10000
        vals = [13800 if i % 7 < 2 else 8000 for i in range(160)]
        app.ppgs[0].extend((t_on + int(i * 22.2), v) for i, v in enumerate(vals))
        self.assertEqual(app._probe_range(t_on), 0)


if __name__ == "__main__":
    unittest.main()
