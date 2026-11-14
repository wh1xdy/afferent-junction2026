"""PresenceSync: tracker state -> data-manager intervals. Run: python -m unittest discover -s tests -v"""
import json
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

    def test_restart_after_leaving_closes_the_home_interval_again(self):
        # the closed home interval sits in the client's memory queue until it is delivered; a
        # restart (power cut, redeploy, data manager down meanwhile) loses it. The data manager
        # then keeps home-<start> open for good and counts it as time at home every day.
        p, g, c, s = setup()
        t = T0
        tick(p, g, s, t, True)
        last_seen = t
        while p.state == "home":
            t += STEP
            tick(p, g, s, t, False)
        saved = json.loads(json.dumps(s.to_dict()))   # what app.save() stores next to the trackers
        c2 = FakeClient()                         # restart: the first client's queue is gone
        s2 = PresenceSync(c2)
        s2.restore(p, saved)
        s2.update(p, g, t + STEP)
        self.assertEqual(c2.last("presence.home", f"home-{int(T0)}")["end"], last_seen)

    def test_restart_after_unknown_then_away_keeps_the_end_the_close_had(self):
        # HOME, then the probes go dark (UNKNOWN closes home), then they come back and the phone is
        # not there (AWAY, since = when they came back). presence.since is now past the UNKNOWN
        # window: closing home there on restart would count that window as home.
        p, g, c, s = setup()
        t = T0
        tick(p, g, s, t, True)
        while p.state == "home":
            t += STEP
            tick(p, g, s, t, None)
        unknown_at = p.since
        self.assertEqual(c.last("presence.home", f"home-{int(T0)}")["end"], unknown_at)
        for _ in range(20):                       # still dark a while longer
            t += STEP
            tick(p, g, s, t, None)
        while p.state != "away":
            t += STEP
            tick(p, g, s, t, False)
        self.assertGreater(p.since, unknown_at + 60)
        saved = json.loads(json.dumps(s.to_dict()))
        c2 = FakeClient()
        s2 = PresenceSync(c2)
        s2.restore(p, saved)
        s2.update(p, g, t + STEP)
        home = [x for x in c2.sent if x["id"] == f"home-{int(T0)}"]
        self.assertTrue(home, "the close is sent again")
        self.assertTrue(all(x["end"] == unknown_at for x in home), home)

    def test_restart_back_home_still_closes_the_earlier_home_period(self):
        # home, out, home again; the first period's close is still queued when the app restarts.
        # The new home period must not take its place: both are sent after the restart.
        p, g, c, s = setup()
        t = T0
        tick(p, g, s, t, True)
        last_seen = t
        while p.state == "home":
            t += STEP
            tick(p, g, s, t, False)
        for _ in range(10):
            t += STEP
            tick(p, g, s, t, False)
        t += STEP
        tick(p, g, s, t, True)                    # back: a new home period
        back = t
        saved = json.loads(json.dumps(s.to_dict()))
        c2 = FakeClient()
        s2 = PresenceSync(c2)
        s2.restore(p, saved)
        s2.update(p, g, t + STEP)
        self.assertEqual(c2.last("presence.home", f"home-{int(T0)}")["end"], last_seen)
        self.assertIsNone(c2.last("presence.home", f"home-{int(back)}")["end"])
        # and once more: the restored sync keeps the close for a second restart
        c3 = FakeClient()
        s3 = PresenceSync(c3)
        s3.restore(p, json.loads(json.dumps(s2.to_dict())))
        self.assertEqual(c3.last("presence.home", f"home-{int(T0)}")["end"], last_seen)

    def test_only_the_last_few_closes_are_kept(self):
        p, g, c, s = setup()
        for k in range(8):
            s._close_home(T0 + k * 1000, T0 + k * 1000 + 500, "away")
        closes = s.to_dict()["home_closes"]
        self.assertEqual([x[0] for x in closes], [T0 + k * 1000 for k in range(3, 8)])
        s2 = PresenceSync(FakeClient())
        s2.restore(p, {"home_closes": [[1, 0, None], ["x", 2, None], [5, 9, 3], "junk"], "home_start": "x"})
        self.assertEqual(s2._closes, [(5.0, 9.0, None)])
        self.assertIsNone(s2._home_start)


if __name__ == "__main__":
    unittest.main()
