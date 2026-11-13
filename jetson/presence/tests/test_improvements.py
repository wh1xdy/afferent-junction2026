"""Tests for the v0.2 improvements: phone-only BLE counting, range, device list,
network-outage tracking, strict ARP states and runtime profiles."""
import os
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from core import AWAY, HOME, Advert, GuestConfig, GuestTracker, classify  # noqa: E402
from probes import LIVE_STATES, parse_neigh  # noqa: E402
from test_core import STEP, T0, feed, midnight, phones, run, tracker  # noqa: E402

APPLE_PHONE = {76: bytes([0x10, 0x05, 0x01])}   # Continuity "Nearby Info"
AIRPODS = {76: bytes([0x07, 0x19, 0x01])}       # proximity pairing
AIRTAG = {76: bytes([0x12, 0x19])}              # Find My
SAMSUNG = {117: b"\x42\x04"}
SONY = {301: b"\x00"}
MICROSOFT = {6: b"\x01\x09"}


class Classify(unittest.TestCase):
    def test_phones(self):
        self.assertEqual(classify(APPLE_PHONE), (76, "phone"))
        self.assertEqual(classify(SAMSUNG), (117, "phone"))
        self.assertEqual(classify({}, ["0000fef3-0000-1000-8000-00805f9b34fb"]), (None, "phone"))

    def test_not_phones(self):
        for md in (AIRPODS, AIRTAG, SONY, MICROSOFT):
            self.assertEqual(classify(md)[1], "other", md)

    def test_unknown(self):
        self.assertEqual(classify({}), (None, None))
        self.assertEqual(classify({76: b""}), (76, None))


def tagged(n, t, kind, rssi=-50, tag=0, company=76):
    return [Advert(f"02:{tag:02x}:00:00:{i:02x}:00", rssi, t, company=company, kind=kind) for i in range(n)]


class PhonesOnly(unittest.TestCase):
    def test_gadgets_are_not_guests_when_phones_only(self):
        g = GuestTracker(GuestConfig(phones_only=True), midnight_fn=midnight)
        t, ev = feed(g, T0, 3600, lambda t: tagged(4, t, "other", tag=1) + tagged(3, t, None, tag=2))
        self.assertEqual(ev, [])
        self.assertEqual(len(g.nearby_unknown(t)), 0)

    def test_same_gadgets_count_in_classic_mode(self):
        g = GuestTracker(GuestConfig(phones_only=False), midnight_fn=midnight)
        t, ev = feed(g, T0, 3600, lambda t: tagged(4, t, "other", tag=1))
        self.assertIn("guest_arrived", ev)

    def test_one_guest_with_phone_earbuds_watch_counts_once(self):
        g = GuestTracker(GuestConfig(phones_only=True), midnight_fn=midnight)
        kit = lambda t: tagged(1, t, "phone", tag=1) + tagged(1, t, "other", tag=2) + tagged(1, t, None, tag=3)
        t, ev = feed(g, T0, 1800, kit)
        self.assertIn("guest_arrived", ev)
        self.assertEqual(g.visits[-1].peak_guests, 1)


class Range(unittest.TestCase):
    def test_table_range_ignores_the_room(self):
        g = GuestTracker(GuestConfig(rssi_min=-55, phones_only=True), midnight_fn=midnight)
        room = lambda t: tagged(10, t, "phone", rssi=-68, tag=1)        # rest of the hall
        t, ev = feed(g, T0, 1800, room)
        self.assertEqual(ev, [])
        t, ev = feed(g, t, 1800, lambda t: room(t) + tagged(1, t, "phone", rssi=-45, tag=9))  # sits down
        self.assertIn("guest_arrived", ev)

    def test_device_list_explains_what_is_counted(self):
        g = GuestTracker(GuestConfig(rssi_min=-55, phones_only=True), ignore=["02:09:00:00:00:00"],
                         midnight_fn=midnight)
        g.observe(tagged(1, T0, "phone", rssi=-45, tag=9) + tagged(1, T0, "phone", rssi=-48, tag=1)
                  + tagged(1, T0, "other", rssi=-40, tag=2, company=301)
                  + tagged(1, T0, "phone", rssi=-80, tag=3))
        rows = {r["addr"]: r for r in g.nearby_devices(T0)}
        self.assertEqual(list(rows)[0], "02:02:00:00:00:00")  # strongest first
        self.assertFalse(rows["02:02:00:00:00:00"]["counted"])  # Sony earbuds
        self.assertEqual(rows["02:02:00:00:00:00"]["maker"], "Sony")
        self.assertTrue(rows["02:01:00:00:00:00"]["counted"])
        self.assertFalse(rows["02:03:00:00:00:00"]["counted"])  # too far
        self.assertEqual(rows["02:09:00:00:00:00"]["note"], "patient")


class Outages(unittest.TestCase):
    def test_outage_is_recorded_and_closed(self):
        p = tracker()
        t, _ = run(p, T0, 300, True)
        t, ev = run(p, t, 120, None)
        self.assertIn("network_lost", ev)
        t, ev = run(p, t, 60, True)
        self.assertIn("network_restored", ev)
        o = p.outages[-1]
        self.assertAlmostEqual(o.end - o.start, 120 + STEP, delta=STEP)
        self.assertAlmostEqual(p.metrics(t)["network_outage_min_today"], 2.5, delta=0.6)
        self.assertEqual(p.state, HOME)
        self.assertEqual(p.outings, [])

    def test_outage_survives_restart(self):
        p = tracker()
        t, _ = run(p, T0, 300, True)
        t, _ = run(p, t, 120, None)
        q = tracker()
        q.load(p.to_dict())
        self.assertIsNone(q.outages[-1].end)

    def test_no_outage_when_healthy(self):
        p = tracker()
        t, ev = run(p, T0, 3600, lambda t: int(t) // STEP % 2 == 0)
        self.assertNotIn("network_lost", ev)
        self.assertEqual(p.outages, [])


class StrictArp(unittest.TestCase):
    def test_only_confirmed_answers_count(self):
        n = {e["ip"]: e["state"] for e in parse_neigh(
            "10.0.0.2 dev wlan0 lladdr 12:eb:81:fc:d3:98 DELAY\n"
            "10.0.0.3 dev wlan0 lladdr 12:eb:81:fc:d3:99 PROBE\n"
            "10.0.0.4 dev wlan0 lladdr 12:eb:81:fc:d3:9a REACHABLE\n")}
        self.assertNotIn(n["10.0.0.2"], LIVE_STATES)
        self.assertNotIn(n["10.0.0.3"], LIVE_STATES)
        self.assertIn(n["10.0.0.4"], LIVE_STATES)


class Profiles(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        os.environ.update(SIM="1", DATA_DIR=str(Path(__file__).parent / "_tmp"))
        for v in ("PROFILE", "AWAY_AFTER_MIN", "GUEST_RSSI_MIN"):
            os.environ.pop(v, None)
        import app
        cls.app = app

    def test_default_is_home(self):
        self.assertEqual(self.app.profile["name"], "home")
        self.assertEqual(self.app.gcfg.rssi_min, -65)
        self.assertTrue(self.app.gcfg.phones_only)

    def test_switch_to_demo_and_back(self):
        a = self.app
        a.apply_profile("demo")
        self.assertEqual(a.pcfg.away_after_s, 120)
        self.assertEqual(a.gcfg.rssi_min, -55)
        self.assertIs(a.presence.cfg, a.pcfg)      # trackers see the change live
        p = a.presence
        t = T0
        p.update(t, {"wifi": True})
        for _ in range(5):
            t += 30
            p.update(t, {"wifi": False})
        self.assertEqual(p.state, AWAY)            # 2.5 min > 2 min demo limit
        a.apply_profile("classic")
        self.assertEqual(a.gcfg.rssi_min, -75)
        self.assertFalse(a.gcfg.phones_only)
        a.apply_profile("home")


if __name__ == "__main__":
    unittest.main()
