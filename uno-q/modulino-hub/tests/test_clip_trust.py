"""Offline tests for trusting each clip on its own (app.judge_clips, clip_clean, clip_trust):
one noisy clip must not drag a clean one down.

    cd uno-q/modulino-hub && python3 -m unittest discover tests -v

Seen on Alex's phone on 2026-11-14 (new printed case): clip 1 reported a false 131-139 BPM,
clip 2 a plausible 87-99, the fused quality fell to 0.08-0.35 (mostly below the app's 0.3) and
the app showed no pulse. Clip 2 alone gave 87 at 0.63. Replayed here through the whole hub
(the STM32 detector port, the real autocorrelation, fusion, PulseGuard, Bluetooth, data manager).
"""
import contextlib
import io
import math
import os
import random
import sys
import unittest
from unittest import mock

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

from test_sensor_logic import app, reset  # noqa: E402
from test_ble_payload import FakeStop  # noqa: E402
import test_pulse_guard as tpg  # noqa: E402  (a module import: its tests are not run twice)
from test_data_manager_push import PULSE  # noqa: E402
import test_ble_payload  # noqa: E402

real_ble = test_ble_payload.ble


def false_rhythm(bpm, seconds, amp=500, noise=400, dc=7400, dt=22.2, seed=5):
    """what clip 1 showed: a false rhythm (light into the clip, a bad seat) in noise. At 135 BPM
    its own rhythm quality is ~0.4: as clear as the 0.3 two people need, and averaged with a
    clean clip at another rhythm it drags the fused quality down."""
    rnd = random.Random(seed)
    out, t = [], 0.0
    while t < seconds * 1000:
        t += dt + rnd.uniform(-1.5, 1.5)
        out.append((int(t), int(dc + amp * math.sin(2 * math.pi * bpm / 60 * t / 1000) + rnd.gauss(0, noise))))
    return out


def empty_clip(seconds, dc=7400, noise=40, seed=9):
    """a clip with the LED on and nothing in it (measured on the board: ~7400, a few tens of noise)"""
    return false_rhythm(60, seconds, amp=0, noise=noise, dc=dc, seed=seed)


finger_ppg = tpg.finger_ppg


class TwoClips(unittest.TestCase):
    """test_pulse_guard.WholeHub (same set-up) with a different signal on each clip"""
    T0 = tpg.WholeHub.T0
    setUp = tpg.WholeHub.setUp
    _restore = tpg.WholeHub._restore

    def run_clips(self, s0, s1, seconds):
        """per second: both clips' samples through their own detector, then one round of
        period_loop. Returns per second (fused bpm out, fused quality, 2A37, AFF1 payload)."""
        rows = []
        pairs = [(a[0], a[1], b[1]) for a, b in zip(s0, s1)]
        for sec in range(seconds):
            self.clock[0] = self.T0 + sec
            for t, v0, v1 in [p for p in pairs if sec * 1000 <= p[0] < (sec + 1) * 1000]:
                app.on_ppg(t, v0, v1)
                for c, v in ((0, v0), (1, v1)):
                    beat = self.det[c].feed(t, v)
                    if beat:
                        app.on_beat(c, *beat)
            self.clock[0] = self.T0 + sec + 0.5
            n = len(app.ble.pushed)
            with contextlib.redirect_stdout(io.StringIO()):
                app.period_loop(FakeStop(1))
            new = app.ble.pushed[n:]
            hrm = [h for _, h, _ in new if h is not None]
            aff1 = app.ble.pushed[-1][0] if app.ble.pushed else None
            rows.append((app.fused["bpm"], app.fused["quality"], hrm[-1] if hrm else None, aff1))
        return rows


class OneNoisyClip(TwoClips):
    SECONDS = 24

    def run_live_case(self, good=88):
        return self.run_clips(false_rhythm(135, self.SECONDS), finger_ppg(good, self.SECONDS), self.SECONDS)

    def test_the_fixture_without_trust(self):
        # the bug first, with every clip trusted as before: the noisy clip is averaged into the
        # combined rhythm (quality dragged down from the clean clip's ~0.87), and with two rhythms
        # above 0.3 the box takes the noise for a second person, so the data manager gets nothing
        def old():
            for st in app.clip_state:
                st.update(clean=True, trusted=True)
            return [True] * app.CHANNELS
        with mock.patch.object(app, "judge_clips", old):
            rows = self.run_live_case()
        own_q = app.period_state[1]["quality"]
        self.assertGreater(own_q, 0.8)
        dragged = [q for _, q, _, _ in rows[8:] if q < own_q - 0.15]
        self.assertGreaterEqual(len(dragged), 5, [q for _, q, _, _ in rows])
        self.assertTrue(app.fused["two_hearts"], "the noise taken for a second person")
        self.assertTrue(rows[-1][3][6] & real_ble.FLAG_TWO_HEARTS)
        self.assertEqual(self.client.of(PULSE), [], "and nothing reaches the data manager")

    def test_the_good_clip_is_the_pulse_at_its_own_quality(self):
        rows = self.run_live_case(88)
        late = rows[14:]
        own_q = app.period_state[1]["quality"]
        self.assertGreater(own_q, 0.6)
        for bpm, q, hrm, aff1 in late:
            self.assertTrue(bpm and abs(bpm - 88) <= 3, rows)
            self.assertEqual(hrm, bpm, "2A37 carries it")
            self.assertGreater(q, 0.6, "the clean clip's own quality, not dragged down")
            self.assertEqual(aff1[0], 0, "clip 1's false number is not sent")
            self.assertTrue(abs(aff1[1] - 88) <= 3, aff1)
            self.assertGreaterEqual(aff1[4], 60, "AFF1 quality byte above the app's 30 %")
            self.assertEqual(aff1[6], real_ble.FLAG_UNTRUSTED[0], "flag: clip 1 left out, not two people")
        self.assertAlmostEqual(app.fused["quality"], own_q, delta=0.05)
        self.assertEqual(app.fused["sources"], [1])
        self.assertEqual(app.fused["untrusted"], [0])
        self.assertFalse(app.fused["two_hearts"])
        sent = [s["value"] for s in self.client.of(PULSE)]
        self.assertGreaterEqual(len(sent), 10, "the data manager gets the pulse")
        self.assertTrue(all(abs(v - 88) <= 3 for v in sent), sent)

    def test_state_says_which_clip_and_why(self):
        self.run_live_case()
        snap = app.state_snapshot()
        clips = snap["finger"]["clips"]
        self.assertEqual([c["trusted"] for c in clips], [False, True])
        self.assertEqual([c["clean"] for c in clips], [False, True])
        self.assertIn(clips[0]["reason"], ("weak rhythm", "no rhythm", "no beats", "beats off rhythm"))
        self.assertIsNone(clips[1]["reason"])
        self.assertEqual(snap["finger"]["untrusted"], [0])

    def test_the_noisy_clip_is_not_a_second_person(self):
        rows = self.run_live_case()
        self.assertFalse(any(a[6] & real_ble.FLAG_TWO_HEARTS for _, _, _, a in rows if a))
        self.assertEqual(app.two_hearts["apart"], 0)

    def test_the_good_clip_works_on_either_side(self):
        rows = self.run_clips(finger_ppg(72, self.SECONDS), false_rhythm(135, self.SECONDS, seed=8), self.SECONDS)
        self.assertTrue(all(b and abs(b - 72) <= 3 and q > 0.6 for b, q, _, _ in rows[14:]), rows)
        self.assertEqual(app.fused["untrusted"], [1])
        self.assertEqual(rows[-1][3][6], real_ble.FLAG_UNTRUSTED[1])

    def test_an_empty_clip_next_to_a_finger(self):
        rows = self.run_clips(empty_clip(self.SECONDS), finger_ppg(88, self.SECONDS), self.SECONDS)
        self.assertTrue(all(b and abs(b - 88) <= 3 and q > 0.6 for b, q, _, _ in rows[14:]), rows)
        self.assertFalse(app.clip_state[0]["clean"])

    def test_a_saturated_clip_next_to_a_finger(self):
        railed = [(t, 13900 if (t // 300) % 2 else 150) for t, _ in finger_ppg(88, self.SECONDS)]
        rows = self.run_clips(railed, finger_ppg(88, self.SECONDS), self.SECONDS)
        self.assertTrue(all(b and abs(b - 88) <= 3 and q > 0.6 for b, q, _, _ in rows[14:]), rows)
        self.assertEqual(app.clip_state[0]["reason"], "saturated")


class BothClean(TwoClips):
    SECONDS = 20

    def test_the_same_heart_is_fused_as_before(self):
        rows = self.run_clips(finger_ppg(75, self.SECONDS, seed=1), finger_ppg(75, self.SECONDS, seed=2), self.SECONDS)
        for bpm, q, hrm, aff1 in rows[14:]:
            self.assertTrue(bpm and abs(bpm - 75) <= 2, rows)
            self.assertGreater(q, 0.6)
            self.assertEqual(aff1[6], 0, "nobody left out, one person")
        self.assertEqual(app.fused["sources"], [0, 1])
        self.assertEqual(app.fused["untrusted"], [])
        self.assertTrue(all(c["clean"] and c["trusted"] for c in app.clip_state))

    def test_two_people_are_still_two_hearts(self):
        rows = self.run_clips(finger_ppg(62, self.SECONDS, seed=1), finger_ppg(88, self.SECONDS, seed=2), self.SECONDS)
        self.assertTrue(app.fused["two_hearts"])
        self.assertEqual(rows[-1][3][6], real_ble.FLAG_TWO_HEARTS, "two people, nobody left out")
        self.assertEqual(app.fused["untrusted"], [])
        self.assertTrue(all(c["clean"] for c in app.clip_state))


class Rules(unittest.TestCase):
    def setUp(self):
        reset()

    GOOD_SIG = {"amplitude": 900, "railed": 0.0, "dc": 8400}

    def test_clean(self):
        self.assertEqual(app.clip_clean({"period_ms": 690, "quality": 0.6}, self.GOOD_SIG, 0.9), (True, None))

    def test_not_clean(self):
        per = {"period_ms": 690, "quality": 0.6}
        for p, sig, on, why in (
                (per, None, 0.9, "no samples"),
                (per, {**self.GOOD_SIG, "railed": 0.2}, 0.9, "saturated"),
                (per, {**self.GOOD_SIG, "dc": 300}, 0.9, "off scale"),
                ({"period_ms": None, "quality": 0.0}, self.GOOD_SIG, 0.9, "no rhythm"),
                ({"period_ms": 444, "quality": 0.19}, self.GOOD_SIG, 0.9, "weak rhythm"),
                (per, {**self.GOOD_SIG, "amplitude": 120}, 0.9, "flat"),
                (per, self.GOOD_SIG, None, "no beats"),
                (per, self.GOOD_SIG, 0.4, "beats off rhythm")):
            self.assertEqual(app.clip_clean(p, sig, on), (False, why))

    def test_beats_on_rhythm(self):
        app.beats[0].extend((1000 + 690 * k, 690 + (40 if k % 3 else -30)) for k in range(10))
        self.assertEqual(app.clip_beats(0, 690), 1.0)
        app.beats[1].extend((1000 + 450 * k, i) for k, i in enumerate([300, 980, 450, 610, 1200, 333, 700, 520]))
        self.assertLess(app.clip_beats(1, 444), app.CLIP_BEATS_ON)
        self.assertIsNone(app.clip_beats(1, None))
        app.beats[1].clear()
        app.beats[1].extend([(1000, 690), (1690, 690)])
        self.assertIsNone(app.clip_beats(1, 690), "too few to say")

    def test_trust(self):
        self.assertEqual(app.clip_trust([True, False]), [True, False])
        self.assertEqual(app.clip_trust([False, True]), [False, True])
        self.assertEqual(app.clip_trust([True, True]), [True, True], "both clean: as before")
        self.assertEqual(app.clip_trust([False, False]), [True, True], "neither: as before, they may add up")

    def test_signal_of_a_finger_and_of_an_empty_clip(self):
        app.ppgs[0].extend(finger_ppg(80, 8))
        app.ppgs[1].extend(empty_clip(8))
        f, e = app.clip_signal(0), app.clip_signal(1)
        self.assertGreater(f["amplitude"], 3 * app.CLIP_MIN_AMP)
        self.assertLess(e["amplitude"], app.CLIP_MIN_AMP)
        self.assertEqual(f["railed"], 0.0)
        self.assertAlmostEqual(e["dc"], 7400, delta=20)

    def test_an_untrusted_finger_shows_no_number(self):
        app.clip_state[0]["trusted"] = False
        app.period_state[0].update(period_ms=444, quality=0.8)
        app.finger_guards[0].trusted, app.finger_guards[0].trusted_t = 135, app.time.time()
        for k in range(6):
            app.on_beat(0, 1000 + 444 * k, 444, 900, True)
        self.assertEqual(app.sent_bpm[0], 0)

    def test_aff1_flag_bits(self):
        self.assertEqual(real_ble.pack_aff1([0, 88], 0, 0, 0.63, 'active', False, [0])[6], 0x02)
        self.assertEqual(real_ble.pack_aff1([72, 0], 0, 0, 0.63, 'active', False, [1])[6], 0x04)
        self.assertEqual(real_ble.pack_aff1([72, 0], 0, 0, 0.63, 'active', True, [1])[6], 0x05)
        self.assertEqual(real_ble.pack_aff1([72, 88], 0, 0, 0.63, 'active')[6], 0)
        # clients read bit 0 with a mask (AfferentFingerParser.swift / .kt): two_hearts stays false
        self.assertEqual(real_ble.pack_aff1([0, 88], 0, 0, 0.63, 'active', False, [0])[6] & real_ble.FLAG_TWO_HEARTS, 0)


if __name__ == "__main__":
    unittest.main()
