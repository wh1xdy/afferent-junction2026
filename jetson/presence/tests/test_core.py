"""Scenario tests for every edge case in core.py. Run: python -m unittest discover -s tests -v"""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from core import AWAY, HOME, UNKNOWN, Advert, GuestConfig, GuestTracker, PresenceConfig, PresenceTracker  # noqa: E402

T0 = 10 * 86400 + 8 * 3600  # day 10, 08:00 "local" (UTC in these tests)
STEP = 30


def midnight(t):
    return t - t % 86400


def hour(t):
    return int(t % 86400 // 3600)


def tracker(**kw):
    return PresenceTracker(PresenceConfig(**kw), hour_fn=hour, midnight_fn=midnight)


def run(p, t, seconds, wifi, ble=None):
    """Feed one tick every STEP seconds; returns (new t, events)."""
    events = []
    end = t + seconds
    while t < end:
        t += STEP
        events += p.update(t, {"wifi": wifi(t) if callable(wifi) else wifi, "ble": ble})
    return t, events


class Presence(unittest.TestCase):
    def test_home_on_first_sighting(self):
        p = tracker()
        p.update(T0, {"wifi": True})
        self.assertEqual(p.state, HOME)

    def test_phone_wifi_sleep_does_not_flap(self):
        # Phone answers only 1 scan in 12 (power-save): must stay HOME.
        p = tracker()
        t, ev = run(p, T0, 4 * 3600, lambda t: int(t) // STEP % 12 == 0)
        self.assertEqual(p.state, HOME)
        self.assertNotIn("left_home", ev)

    def test_outing_detected_and_backdated(self):
        p = tracker()
        t, _ = run(p, T0, 600, True)
        left_at = t
        t, ev = run(p, t, 3600, False)
        self.assertIn("left_home", ev)
        self.assertEqual(p.state, AWAY)
        self.assertAlmostEqual(p.outings[-1].start, left_at, delta=STEP)
        t, ev = run(p, t, 300, True)
        self.assertIn("returned_home", ev)
        self.assertAlmostEqual(p.outings[-1].duration(t), 3600 + STEP, delta=2 * STEP)
        self.assertEqual(p.metrics(t)["outings_today"], 1)

    def test_short_absence_below_threshold_is_ignored(self):
        p = tracker()
        t, _ = run(p, T0, 300, True)
        t, ev = run(p, t, 9 * 60, False)
        t, ev2 = run(p, t, 60, True)
        self.assertEqual(p.state, HOME)
        self.assertEqual(ev + ev2, [])

    def test_night_threshold_is_longer(self):
        p = tracker()
        t = 10 * 86400 + 1 * 3600  # 01:00
        t, _ = run(p, t, 300, True)
        t, ev = run(p, t, 30 * 60, False)  # 30 min silence at night: still home
        self.assertEqual(p.state, HOME)
        t, ev = run(p, t, 20 * 60, False)  # 50 min total: away
        self.assertEqual(p.state, AWAY)

    def test_router_down_is_unknown_not_away(self):
        p = tracker()
        t, _ = run(p, T0, 300, True)
        t, ev = run(p, t, 2 * 3600, None)  # probe could not look
        self.assertEqual(p.state, UNKNOWN)
        self.assertNotIn("left_home", ev)
        self.assertLess(p.metrics(t)["coverage_today"], 0.2)

    def test_outing_not_backdated_into_blind_window(self):
        p = tracker()
        t, _ = run(p, T0, 300, True)
        t, _ = run(p, t, 3600, None)          # 1 h router outage
        blind_end = t
        t, _ = run(p, t, 1200, False)         # then 20 min of real "not seen"
        self.assertEqual(p.state, AWAY)
        self.assertGreaterEqual(p.outings[-1].start, blind_end - STEP)

    def test_dead_phone_but_activity_at_home(self):
        p = tracker()
        t, _ = run(p, T0, 300, True)
        for _ in range(6):                    # knob touched every 20 min, phone dead
            p.activity(t)
            t, ev = run(p, t, 1200, False)
            self.assertEqual(p.state, HOME, p.reason)
        t, ev = run(p, t, 3600, False)        # no more activity -> eventually away
        self.assertEqual(p.state, AWAY)

    def test_second_token_ble_covers_wifi(self):
        p = tracker()
        t, _ = run(p, T0, 3 * 3600, False, ble=True)  # phone off, watch visible
        self.assertEqual(p.state, HOME)

    def test_restart_gap_not_counted_as_absence(self):
        p = tracker()
        t, _ = run(p, T0, 300, True)
        t += 3 * 3600                          # app down for 3 h
        ev = p.update(t, {"wifi": False})
        self.assertEqual(p.state, HOME)
        self.assertEqual(ev, [])

    def test_persistence_roundtrip(self):
        p = tracker()
        t, _ = run(p, T0, 300, True)
        t, _ = run(p, t, 3600, False)
        q = tracker()
        q.load(p.to_dict())
        self.assertEqual(q.state, AWAY)
        ev = q.update(t + STEP, {"wifi": True})
        self.assertIn("returned_home", ev)

    def test_isolation_alert(self):
        p = tracker(isolation_days=2)
        t, _ = run(p, T0, 3 * 86400, True)
        self.assertTrue(p.metrics(t)["isolation_alert"])
        t, _ = run(p, t, 3600, False)
        self.assertFalse(p.metrics(t)["isolation_alert"])  # currently out

    def test_short_outing_does_not_reset_isolation(self):
        p = tracker(isolation_days=2, min_outing_s=900, away_after_s=120)
        t, _ = run(p, T0, 3 * 86400, True)
        t, _ = run(p, t, 300, False)           # 5 min: taking the bins out
        t, _ = run(p, t, 300, True)
        self.assertTrue(p.metrics(t)["isolation_alert"])


def gtracker(**kw):
    return GuestTracker(GuestConfig(**kw), ignore=["aa:aa:aa:aa:aa:aa"], midnight_fn=midnight)


def feed(g, t, seconds, make, home=True):
    events = []
    end = t + seconds
    while t < end:
        t += STEP
        g.observe(make(t))
        events += g.update(t, patient_home=home)
    return t, events


def phones(n, t, rssi=-60, rotate_s=900, tag=0):
    rot = int(t // rotate_s)
    return [Advert(f"02:{tag:02x}:00:00:{i:02x}:{rot % 256:02x}", rssi, t) for i in range(n)]


class Guests(unittest.TestCase):
    def test_guest_visit_with_mac_rotation(self):
        g = gtracker()
        t, ev = feed(g, T0, 3600, lambda t: phones(1, t, rotate_s=900))
        self.assertEqual(ev.count("guest_arrived"), 1)  # rotation did not make it 4 guests
        t, ev = feed(g, t, 1800, lambda t: [])
        self.assertIn("guest_left", ev)
        self.assertEqual(g.metrics(t)["visits_today"], 1)
        self.assertAlmostEqual(g.visits[-1].end - g.visits[-1].start, 3600, delta=300)

    def test_passer_by_ignored(self):
        g = gtracker()
        t, ev = feed(g, T0, 240, lambda t: phones(1, t))
        t, ev2 = feed(g, t, 1800, lambda t: [])
        self.assertEqual(ev + ev2, [])

    def test_neighbours_below_rssi_floor_ignored(self):
        g = gtracker()
        t, ev = feed(g, T0, 3600, lambda t: phones(6, t, rssi=-90))
        self.assertEqual(ev, [])

    def test_calibration_learns_household_and_background(self):
        g = gtracker()
        tv = lambda t: [Advert("11:22:33:44:55:66", -50, t)]
        bg = lambda t: phones(2, t, rssi=-70, tag=9)  # 2 neighbour phones always nearby
        g.start_calibration(T0, 3600)
        t, ev = feed(g, T0, 3600 + STEP, lambda t: tv(t) + bg(t))
        self.assertIn("calibrated", ev)
        self.assertIn("11:22:33:44:55:66", g.household)
        self.assertEqual(g.baseline, 2.0)
        t, ev = feed(g, t, 3600, lambda t: tv(t) + bg(t))
        self.assertEqual(ev, [])                    # normal background: no guests
        t, ev = feed(g, t, 1800, lambda t: tv(t) + bg(t) + phones(2, t, tag=5))
        self.assertIn("guest_arrived", ev)
        self.assertEqual(g.visits[-1].peak_guests, 2)

    def test_staggered_background_rotation_is_not_a_visit(self):
        # 4 background phones at in-flat RSSI, each rotating its address at a different
        # moment. Raw counts spike to 5 every few minutes; after calibration none of
        # those spikes may turn into a visit.
        def bg(t):
            return [Advert(f"02:0b:00:00:{i:02x}:{int((t + i * 225) // 900) % 256:02x}", -70, t)
                    for i in range(4)]
        g = gtracker()
        g.start_calibration(T0, 2 * 3600)
        t, _ = feed(g, T0, 2 * 3600 + STEP, bg)
        t, ev = feed(g, t, 12 * 3600, bg)
        self.assertEqual(ev, [])

    def test_patient_own_device_is_not_a_guest(self):
        g = gtracker()
        t, ev = feed(g, T0, 3600, lambda t: [Advert("AA:AA:AA:AA:AA:AA", -40, t)])
        self.assertEqual(ev, [])

    def test_no_guests_counted_while_patient_away(self):
        g = gtracker()
        t, ev = feed(g, T0, 3600, lambda t: phones(2, t), home=False)
        self.assertEqual(ev, [])

    def test_intermittent_guest_advertising_is_one_visit(self):
        # Locked phones advertise in bursts: seen 2 min, silent 4 min, repeat.
        g = gtracker()
        t, ev = feed(g, T0, 7200, lambda t: phones(1, t) if int(t) % 360 < 120 else [])
        self.assertEqual(ev.count("guest_arrived"), 1)


if __name__ == "__main__":
    unittest.main()
