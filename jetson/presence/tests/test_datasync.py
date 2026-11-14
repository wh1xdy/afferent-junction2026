"""PresenceSync: tracker state -> data-manager intervals. Run: python -m unittest discover -s tests -v"""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from core import GuestTracker, PresenceConfig, PresenceTracker, Visit  # noqa: E402
from datasync import PresenceSync  # noqa: E402

T0 = 10 * 86400 + 8 * 3600
STEP = 30


class FakeClient:
    def __init__(self):
        self.sent = []

    def interval(self, kind, start, end=None, value=None, id=None, meta=None, source=None):
        self.sent.append({"kind": kind, "start": start, "end": end, "value": value, "id": id})

    def last(self, kind, ident):
        return [s for s in self.sent if s["kind"] == kind and s["id"] == ident][-1]


def setup():
    p = PresenceTracker(PresenceConfig(away_after_s=600, night_away_after_s=600),
                        hour_fn=lambda t: 12, midnight_fn=lambda t: t - t % 86400)
    g = GuestTracker()
    c = FakeClient()
    return p, g, c, PresenceSync(c)


def tick(p, g, s, t, wifi):
    p.update(t, {"wifi": wifi})
    s.update(p, g, t)


class Sync(unittest.TestCase):
    def test_home_then_outing_then_home(self):
        p, g, c, s = setup()
        t = T0
        tick(p, g, s, t, True)
        home1 = f"home-{int(T0)}"
        self.assertIsNone(c.last("presence.home", home1)["end"])
        n = len(c.sent)
        for _ in range(5):                       # still home: nothing new to send
            t += STEP
            tick(p, g, s, t, True)
        self.assertEqual(len(c.sent), n)
        last_seen = t
        while p.state == "home":                 # phone gone -> AWAY after 10 min
            t += STEP
            tick(p, g, s, t, False)
        closed = c.last("presence.home", home1)
        self.assertEqual(closed["end"], last_seen)            # back-dated, like the outing
        outing = c.last("presence.outing", f"outing-{int(last_seen)}")
        self.assertIsNone(outing["end"])
        for _ in range(60):
            t += STEP
            tick(p, g, s, t, False)
        t += STEP
        tick(p, g, s, t, True)                   # back
        self.assertEqual(c.last("presence.outing", f"outing-{int(last_seen)}")["end"], t)
        self.assertIsNone(c.last("presence.home", f"home-{int(t)}")["end"])

    def test_unknown_closes_home_without_outing(self):
        p, g, c, s = setup()
        t = T0
        tick(p, g, s, t, True)
        while p.state == "home":
            t += STEP
            tick(p, g, s, t, None)               # probes cannot look
        self.assertEqual(p.state, "unknown")
        self.assertIsNotNone(c.last("presence.home", f"home-{int(T0)}")["end"])
        self.assertFalse([x for x in c.sent if x["kind"] == "presence.outing"])

    def test_visits_and_restore(self):
        p, g, c, s = setup()
        tick(p, g, s, T0, True)
        g.visits.append(Visit(start=T0 + 60, peak_guests=1))
        s.update(p, g, T0 + 90)
        g.visits[-1].peak_guests = 3
        g.visits[-1].end = T0 + 3600
        s.update(p, g, T0 + 3600)
        v = c.last("presence.guest_visit", f"visit-{int(T0 + 60)}")
        self.assertEqual((v["value"], v["end"]), (3, T0 + 3600))
        # restart: a fresh sync resumes the same open home interval id
        c2 = FakeClient()
        s2 = PresenceSync(c2)
        s2.restore(p)
        s2.update(p, g, T0 + 3700)
        self.assertTrue(any(x["id"] == f"home-{int(T0)}" and x["end"] is None for x in c2.sent))


if __name__ == "__main__":
    unittest.main()
