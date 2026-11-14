"""Offline tests for the pulse guard (app.PulseGuard): a doubled or halved pulse while a finger
settles, or a jump to double / half, does not leave the box until it has stayed steady.

    cd uno-q/modulino-hub && python3 -m unittest discover tests -v

Two kinds of input:
  - what the data manager on the Jetson stored from this box on 2026-11-14 (pulse and quality,
    timestamps to the second): the 164 BPM incident and an ordinary wearing around it;
  - a synthetic finger run through the hub's own code end to end: samples -> a port of the
    STM32 beat detector (sketch.ino detectBeat) -> on_beat, and period_loop with its real
    autocorrelation, fusion, Bluetooth payloads and data manager hand-over, on a fake clock.
"""
import contextlib
import io
import math
import os
import random
import sys
import types
import unittest
from unittest import mock

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

from test_sensor_logic import app, reset  # noqa: E402  (installs the stubs, imports app)
from test_ble_payload import FakeStop, recorder  # noqa: E402  (the real ble.py, recording)
from test_data_manager_push import FakeClient, PULSE  # noqa: E402
import data_manager_push as dmp  # noqa: E402

HOLD = app.GUARD_HOLD_S


def hms(s):
    h, m, sec = (int(x) for x in s.split(":"))
    return h * 3600 + m * 60 + sec


# vitals.heart_rate_bpm from source modulino-hub as stored by the data manager (local time,
# value, quality). Everything it holds between 19:03:16 and 19:20:36 is the four 164s.
INCIDENT_164 = [("19:03:16", 90, 0.39),
                ("19:08:25", 164, 0.36), ("19:08:26", 164, 0.38), ("19:08:27", 164, 0.37),
                ("19:08:29", 164, 0.36)]
LONE_171 = [("19:20:36", 171, 0.6)]
# a finger put on at 18:46 after a pause, worn for two minutes
WEARING_1846 = [
    ("18:46:18", 87, 0.36), ("18:46:19", 83, 0.63), ("18:46:20", 80, 0.64), ("18:46:21", 80, 0.77),
    ("18:46:22", 80, 0.8), ("18:46:23", 80, 0.85), ("18:46:25", 79, 0.85), ("18:46:26", 79, 0.85),
    ("18:46:27", 80, 0.86), ("18:46:28", 80, 0.81), ("18:46:29", 79, 0.79), ("18:46:30", 79, 0.74),
    ("18:46:32", 75, 0.71), ("18:46:33", 75, 0.79), ("18:46:34", 75, 0.82), ("18:46:35", 77, 0.77),
    ("18:46:36", 77, 0.75), ("18:46:38", 77, 0.79), ("18:46:39", 77, 0.74), ("18:46:40", 77, 0.72),
    ("18:46:42", 75, 0.76), ("18:46:43", 73, 0.78), ("18:46:44", 73, 0.61), ("18:46:46", 77, 0.7),
    ("18:46:47", 77, 0.75), ("18:46:49", 77, 0.62), ("18:46:50", 70, 0.65), ("18:46:52", 70, 0.75),
    ("18:46:53", 70, 0.69), ("18:46:55", 77, 0.47), ("18:46:56", 84, 0.66), ("18:46:58", 84, 0.69),
    ("18:46:59", 78, 0.64), ("18:47:01", 73, 0.65), ("18:47:03", 73, 0.78), ("18:47:04", 74, 0.72),
    ("18:47:06", 76, 0.8), ("18:47:08", 77, 0.75), ("18:47:09", 80, 0.81), ("18:47:11", 79, 0.78),
    ("18:47:13", 77, 0.8), ("18:47:15", 77, 0.82), ("18:47:17", 77, 0.81), ("18:47:18", 77, 0.81),
    ("18:47:20", 77, 0.82), ("18:47:22", 76, 0.83), ("18:47:24", 79, 0.79), ("18:47:26", 78, 0.81),
    ("18:47:27", 77, 0.81), ("18:47:29", 77, 0.83), ("18:47:31", 77, 0.82), ("18:47:33", 77, 0.8),
    ("18:47:35", 77, 0.81), ("18:47:36", 78, 0.83), ("18:47:38", 77, 0.84), ("18:47:40", 77, 0.83),
    ("18:47:42", 77, 0.79), ("18:47:44", 75, 0.8), ("18:47:45", 75, 0.78), ("18:47:47", 77, 0.81),
    ("18:47:49", 80, 0.81), ("18:47:51", 80, 0.8), ("18:47:53", 80, 0.83), ("18:47:55", 80, 0.79),
    ("18:47:56", 78, 0.8), ("18:47:58", 79, 0.78), ("18:48:00", 80, 0.82), ("18:48:02", 80, 0.79),
    ("18:48:04", 80, 0.79), ("18:48:05", 79, 0.8), ("18:48:07", 77, 0.83), ("18:48:09", 77, 0.83),
    ("18:48:11", 79, 0.83), ("18:48:13", 79, 0.64), ("18:48:15", 84, 0.37)]


def replay(rows, guard=None, finger_on=True):
    """rows through one guard as the hub would offer them; returns [(t, bpm out or None)].
    finger_on: the rows start with a new wearing (the hub resets the guard on detection)."""
    g = guard or app.PulseGuard()
    if finger_on:
        g.reset()
    return [(hms(t), g.offer(bpm, hms(t), usable=q >= dmp.MIN_QUALITY)) for t, bpm, q in rows]


class Recorded(unittest.TestCase):
    """what the data manager stored on 2026-11-14, offered again"""

    def test_the_164_incident_goes_nowhere(self):
        out = replay(INCIDENT_164)
        self.assertEqual([v for _, v in out], [None] * 5)

    def test_a_lone_171_goes_nowhere(self):
        self.assertEqual(replay(LONE_171), [(hms("19:20:36"), None)])

    def test_an_ordinary_wearing_is_only_delayed_at_the_start(self):
        out = replay(WEARING_1846)
        first = next(t for t, v in out if v)
        self.assertGreaterEqual(first - hms("18:46:18"), HOLD)
        self.assertLessEqual(first - hms("18:46:18"), HOLD + 2, "a few seconds, not more")
        after = [(t, v) for t, v in out if t >= first]
        self.assertEqual([v for _, v in after], [b for t, b, _ in WEARING_1846 if hms(t) >= first],
                         "from then on every value goes out unchanged")

    def test_the_wearing_and_the_incident_in_one_day(self):
        # the guard is reset when a finger is detected; the 5 min pause in between would also
        # have made the last trusted value too old to be a reference
        g = app.PulseGuard()
        replay(WEARING_1846, g)
        out = replay(INCIDENT_164, g, finger_on=False)
        self.assertEqual([v for _, v in out], [None] * 5)


class Rules(unittest.TestCase):
    def setUp(self):
        self.g = app.PulseGuard()

    def feed(self, bpms, t0=0.0, step=1.0, usable=True):
        out = []
        for k, b in enumerate(bpms):
            out.append(self.g.offer(b, t0 + k * step, usable))
        return out

    def settled(self, bpm=82, t0=0.0):
        """a wearing whose pulse already went out; returns the next free time"""
        n = int(HOLD) + 2
        self.assertEqual(self.feed([bpm] * n, t0)[-1], bpm)
        return t0 + n

    def test_settling_needs_a_few_steady_seconds(self):
        out = self.feed([82] * 8)
        self.assertEqual(out[:int(HOLD)], [None] * int(HOLD))
        self.assertEqual(out[int(HOLD):], [82] * (8 - int(HOLD)))

    def test_settling_from_a_doubled_pulse_to_the_real_one(self):
        out = self.feed([111, 140, 165, 165, 166, 167, 160] + [84, 82, 82, 82, 82, 82, 82, 82])
        self.assertFalse(any(v and v > 100 for v in out), out)
        self.assertEqual(out[-1], 82)

    def test_a_flickering_pulse_never_settles(self):
        self.assertEqual(self.feed([82, 164] * 10), [None] * 20)

    def test_a_jump_to_double_is_held_and_a_return_goes_out_at_once(self):
        t = self.settled(82)
        out = self.feed([164, 164, 165, 82, 81], t0=t)
        self.assertEqual(out, [None, None, None, 82, 81])
        self.assertEqual(self.g.reason, None)

    def test_a_jump_to_half_is_held(self):
        t = self.settled(82)
        self.assertEqual(self.feed([41, 41, 42], t0=t), [None] * 3)
        self.assertEqual(self.g.held()["reason"], "half")

    def test_a_double_that_stays_steady_goes_out(self):
        # never block a real change: the held value goes out once it has stayed steady
        t = self.settled(70)
        out = self.feed([140] * 9, t0=t)
        self.assertEqual(out[:int(HOLD)], [None] * int(HOLD))
        self.assertEqual(out[int(HOLD):], [140] * (9 - int(HOLD)))
        self.assertEqual(self.feed([138, 141], t0=t + 9), [138, 141], "and is the reference from then on")

    def test_other_changes_go_out_at_once(self):
        t = self.settled(72)
        self.assertEqual(self.feed([95, 110, 80, 72], t0=t), [95, 110, 80, 72])

    def test_a_real_rise_to_double_is_never_held(self):
        # 70 -> 140 over a minute: each step is small against the value before it
        t = self.settled(70)
        rise = [round(70 + 70 * k / 60) for k in range(61)]
        self.assertEqual(self.feed(rise, t0=t), rise)

    def test_the_reference_is_forgotten(self):
        t = self.settled(82)
        later = t + app.GUARD_FORGET_S + 1                    # no value for longer than that
        self.assertIsNone(self.g.offer(82, later))
        self.assertEqual(self.g.held()["reason"], "settling")

    def test_a_clock_set_back_forgets_the_reference(self):
        t = self.settled(82)
        self.assertIsNone(self.g.offer(164, t - 3600))
        self.assertEqual(self.g.reason, "settling")

    def test_reset_starts_a_new_wearing(self):
        t = self.settled(82)
        self.g.reset()
        self.assertIsNone(self.g.offer(82, t))

    def test_values_that_are_no_measurement(self):
        # below the quality limit: cannot make a held value go out, nor become the reference
        self.assertEqual(self.feed([82] * 10, usable=False), [None] * 10)
        t = self.settled(82)
        self.assertEqual(self.feed([90], t0=t, usable=False), [90], "not a jump: passes as before")
        self.assertEqual(self.g.trusted, 82)
        self.assertEqual(self.feed([164], t0=t + 1, usable=False), [None])

    def test_a_gap_ends_a_held_run(self):
        out = self.feed([82, 82, 82], step=1.0) + [self.g.offer(82, 2 + app.GUARD_GAP_S + 1)]
        self.assertEqual(out, [None] * 4)
        self.assertEqual(self.g.held()["steady_s"], 0.0)

    def test_no_value_is_not_held_and_not_sent(self):
        for nothing in (None, 0, -5):
            self.assertIsNone(self.g.offer(nothing, 1.0))
        self.assertIsNone(self.g.held())

    def test_harmonic(self):
        self.assertTrue(app.harmonic(164, 82))
        self.assertTrue(app.harmonic(41, 82))
        self.assertTrue(app.harmonic(140, 82))                # ratio 1.71
        self.assertFalse(app.harmonic(130, 82))               # ratio 1.59
        self.assertFalse(app.harmonic(82, 82))
        self.assertFalse(app.harmonic(82, 0))


class FingerBytes(unittest.TestCase):
    """AFF1 bytes 0-1: each finger's own number goes through its own guard (app.on_beat)"""

    def setUp(self):
        reset()
        self.clock = [1_800_000_000.0]
        for name, value in (("time", types.SimpleNamespace(time=lambda: self.clock[0])), ("ble", recorder())):
            p = mock.patch.object(app, name, value)
            p.start()
            self.addCleanup(p.stop)
        self.addCleanup(reset)
        self.t_ms = 1000
        for c in range(app.CHANNELS):
            app.period_state[c].update(quality=0.8)             # a clear rhythm behind the beats

    def beats(self, c, ibi_ms, n):
        for _ in range(n):
            self.t_ms += ibi_ms
            self.clock[0] += ibi_ms / 1000
            app.on_beat(c, self.t_ms, ibi_ms, 900, True)

    def finger_bytes(self):
        return [p[0][:2] for p in app.ble.pushed]

    def test_a_new_finger_shows_its_number_after_a_few_steady_seconds(self):
        self.beats(0, 732, 4)
        self.assertEqual(app.ble.pushed, [], "nothing to say yet, not even 0")
        self.beats(0, 732, 8)
        self.assertEqual(self.finger_bytes()[-1], bytes([82, 0]))
        self.assertTrue(all(b[0] in (0, 82) for b in self.finger_bytes()))

    def test_a_finger_that_starts_counting_double_says_no_reading(self):
        self.beats(0, 732, 12)
        n = len(app.ble.pushed)
        self.beats(0, 366, 10)                                  # ~4 s of double counting
        after = self.finger_bytes()[n:]
        self.assertNotIn(164, [b[0] for b in after])
        self.assertEqual(after[-1], bytes([0, 0]))
        self.assertEqual(app.sent_bpm[0], 0)
        self.assertLessEqual(sum(1 for b in after if b == bytes([0, 0])), 1, "0 is said once")
        self.beats(0, 732, 8)                                   # counting right again
        self.assertEqual(self.finger_bytes()[-1], bytes([82, 0]))

    def test_beats_without_a_clear_rhythm_do_not_settle_a_finger(self):
        app.period_state[0].update(quality=0.25)                # locked (>= 0.2) but unclear
        self.beats(0, 732, 20)
        self.assertEqual(app.ble.pushed, [])

    def test_the_other_finger_is_not_affected(self):
        self.beats(0, 732, 12)
        self.beats(1, 940, 12)
        self.assertEqual(self.finger_bytes()[-1], bytes([82, 64]))

    def test_a_clip_that_came_off_settles_again_when_it_is_back(self):
        self.beats(0, 732, 12)
        app.finger_guards[0].trusted_t = self.clock[0]
        self.clock[0] += app.FINGER_STALE_S + 1                 # finger 1 off for a while
        self.assertEqual(app.stale_fingers(self.clock[0]), [0])
        with mock.patch.object(app, "sensing", lambda: False), contextlib.redirect_stdout(io.StringIO()):
            app.period_loop(FakeStop(1))
        self.assertIsNone(app.finger_guards[0].trusted)
        self.assertEqual(app.ble.pushed[-1][0][:2], bytes([0, 0]))


# ── the whole hub on a synthetic finger ──────────────────────────────────────────────

def beat_wave(x, period, second, width=180):
    """one beat seen by a PulseSensor: steep upstroke, decay, and the second (dicrotic) wave
    half a period later, `second` times as tall"""
    v = 1500 / (1 + math.exp(-x / 25)) * math.exp(-max(x, 0) / width)
    y = x - 0.5 * period
    return v + second * 1500 / (1 + math.exp(-y / 25)) * math.exp(-max(y, 0) / width)


def finger_ppg(bpm, seconds, settle_s=0.0, second=0.25, settling_second=0.95, dt=22.2, noise=8, seed=1):
    """~45 Hz samples (t_ms, raw). For the first settle_s seconds the second wave is about as
    tall as the first (a finger pressed into the clip), then it shrinks to `second`."""
    rnd = random.Random(seed)
    period = 60000 / bpm
    beats = [100 + k * period for k in range(int(seconds * 1000 / period) + 2)]
    out, t = [], 0.0
    while t < seconds * 1000:
        t += dt + rnd.uniform(-1.5, 1.5)
        s = settling_second if t < settle_s * 1000 else second
        v = 8000.0 + sum(beat_wave(t - b, period, s) for b in beats if -200 < t - b < 1200)
        out.append((int(t), int(v + rnd.gauss(0, noise))))
    return out


class Stm32Detector:
    """sketch.ino detectBeat, line by line: slope trigger, refractory max(300 ms, 0.65 x the
    period that Linux sends with pulse_period), locked = that period is usable"""

    def __init__(self):
        self.hist, self.peak, self.armed, self.last = [], 0.0, False, 0
        self.period_ms, self.q100 = 0, 0

    def feed(self, t, raw):
        self.hist = (self.hist + [raw])[-3:]
        if len(self.hist) < 3:
            return None
        d = float(self.hist[2] - self.hist[0]) if 200 < raw < 13500 else 0.0
        self.peak *= 0.995
        if d < 0.1 * self.peak:
            self.armed = True
        ok = 333 <= self.period_ms <= 1800 and self.q100 >= 20
        refractory = max(300, self.period_ms * 65 // 100) if ok else 300
        beat = None
        if self.armed and self.peak > 120 and d > 0.3 * self.peak and t - self.last > refractory:
            beat = (t, t - self.last if self.last else 0, int(self.peak), ok)
            self.last, self.armed = t, False
        if d > self.peak:
            self.peak = d if self.peak == 0 else self.peak + (d - self.peak) * 0.3
        return beat


class FakeBridge:
    def __init__(self, detectors):
        self.detectors = detectors

    def call(self, name, *args, **_):
        if name == "pulse_period":
            c, ms, q100 = args
            self.detectors[c].period_ms, self.detectors[c].q100 = ms, q100
        return True


class WholeHub(unittest.TestCase):
    """samples in, Bluetooth payloads and data manager values out, one second at a time"""
    T0 = 1_800_000_000.0

    def setUp(self):
        reset()
        self.clock = [self.T0]
        self.det = [Stm32Detector(), Stm32Detector()]
        self.client = FakeClient()
        saved = dict(presence=dict(app.presence), breathing=dict(app.breathing), hrv=dict(app.hrv),
                     bridge_state=app.state.get("bridge"))
        self.addCleanup(self._restore, saved)
        for name, value in (("time", types.SimpleNamespace(time=lambda: self.clock[0])),
                            ("ble", recorder()), ("bridge", FakeBridge(self.det)),
                            ("dm", dmp.Push(client=self.client, log=lambda _m: None))):
            p = mock.patch.object(app, name, value)
            p.start()
            self.addCleanup(p.stop)
        app.state["bridge"] = "connected"
        app._hrv_history.clear()
        # a finger was detected WARMUP_S ago (presence_loop does this, with _forget_beats)
        app._forget_beats()
        app.presence.update(auto=True, mode="active", since=self.T0 - app.WARMUP_S)

    def _restore(self, saved):
        app.presence.clear(); app.presence.update(saved["presence"])
        app.breathing.update(saved["breathing"]); app.hrv.update(saved["hrv"])
        app.state["bridge"] = saved["bridge_state"]
        app.fused.update(held=None)
        reset()

    def run_finger(self, samples, seconds):
        """per second: the samples of that second through both detectors, then one round of
        period_loop. Returns per second (raw fused pulse, what 2A37 got, AFF1 bytes 0-1)."""
        rows = []
        for sec in range(seconds):
            self.clock[0] = self.T0 + sec
            for t, v in [p for p in samples if sec * 1000 <= p[0] < (sec + 1) * 1000]:
                app.on_ppg(t, v, v)
                for c in range(2):
                    beat = self.det[c].feed(t, v)
                    if beat:
                        app.on_beat(c, *beat)
            self.clock[0] = self.T0 + sec + 0.5
            n = len(app.ble.pushed)
            with mock.patch.object(app, "fuse", self._spy_fuse):
                with contextlib.redirect_stdout(io.StringIO()):
                    app.period_loop(FakeStop(1))
            new = app.ble.pushed[n:]
            hrm = [h for _, h, _ in new if h is not None]
            last_aff1 = new[-1][0] if new else (app.ble.pushed[-1][0] if app.ble.pushed else None)
            rows.append((self.raw, hrm[-1] if hrm else None, tuple(last_aff1[:2]) if last_aff1 else None))
        return rows

    _real_fuse = staticmethod(app.fuse)

    def _spy_fuse(self):
        self.raw = WholeHub._real_fuse()
        return self.raw

    def test_a_finger_settling_with_a_doubled_pulse(self):
        # The fixture first: without the guard the hub would send ~165 BPM while the second wave
        # is as tall as the first, as on the board (164 BPM at 19:08:25-29), then the real 82.
        rows = self.run_finger(finger_ppg(82, 24, settle_s=8), 24)
        raw = [r for r, _, _ in rows]
        self.assertTrue(any(r and 150 <= r <= 175 for r in raw), raw)
        self.assertEqual(raw[-6:], [82] * 6)
        # what left the box
        sent_2a37 = [h for _, h, _ in rows if h]
        sent_aff1 = [b for _, _, a in rows if a for b in a if b]
        sent_dm = [s["value"] for s in self.client.of(PULSE)]
        for out in (sent_2a37, sent_aff1, sent_dm):
            self.assertTrue(out, "the real pulse does go out")
            self.assertTrue(all(75 <= v <= 90 for v in out), out)
        self.assertEqual(sent_dm[-1], 82)
        self.assertEqual(sent_2a37, sent_dm, "Bluetooth and the data manager get the same values")

    def test_a_doubled_pulse_steadier_than_the_hold_still_goes_out(self):
        # The limit of the rule, kept visible: from the first contact the box has no other
        # reference, so a doubled pulse that stays steady for longer than GUARD_HOLD_S is
        # sent like a real one (the same rule that never blocks a real change). The real value
        # after it is then the jump and waits GUARD_HOLD_S.
        rows = self.run_finger(finger_ppg(82, 30, settle_s=14), 30)
        sent = [h for _, h, _ in rows if h]
        self.assertTrue(any(h > 150 for h in sent), sent)
        k82 = next(k for k, (_, h, _) in enumerate(rows) if h == 82)
        k81 = next(k for k, (r, _, _) in enumerate(rows) if r and r < 90)
        self.assertGreaterEqual(k82 - k81, HOLD)

    def test_state_says_what_is_held(self):
        self.run_finger(finger_ppg(82, 8, settle_s=8), 8)
        snap = app.state_snapshot()
        self.assertIsNone(snap["finger"]["bpm"])
        self.assertEqual(snap["finger"]["held"]["reason"], "settling")
        self.assertGreater(snap["finger"]["held"]["bpm"], 150)
        self.assertIsNone(snap["beat"]["bpm_live"])
        self.assertEqual(snap["finger"]["fingers"], [None, None])

    def test_an_ordinary_finger_goes_out_after_a_few_seconds(self):
        rows = self.run_finger(finger_ppg(75, 20), 20)
        sent = [(k, h) for k, (_, h, _) in enumerate(rows) if h]
        first = sent[0][0]
        self.assertLessEqual(first, 4 + int(HOLD) + 1, "rhythm after ~4 s, then the hold")
        self.assertTrue(all(abs(h - 75) <= 2 for _, h in sent), sent)
        self.assertEqual([k for k, _ in sent], list(range(first, 20)), "every second from then on")
        self.assertEqual(len(self.client.of(PULSE)), len(sent))
        self.assertIsNone(app.fused["held"])
        self.assertTrue(all(abs(b - 75) <= 2 for b in rows[-1][2]), rows[-1])


if __name__ == "__main__":
    unittest.main()
