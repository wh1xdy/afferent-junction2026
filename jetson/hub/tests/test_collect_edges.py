"""The collector's corner cases (test_collect.py has the main four): what is counted, what stays
missing, and which store is written to.

    cd jetson/hub && python3 -m unittest discover tests -v
"""
import os
import sys
import unittest

os.environ.setdefault("AFFERENT_DB", ":memory:")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import app  # noqa: E402
from test_collect import NOW, state  # noqa: E402

ROOM_ONLY = [("room_celsius", 21.5, NOW)]


class Recorder:
    """a store that only writes down what it is asked to keep, in order"""

    def __init__(self):
        self.rows = []

    def add_reading(self, metric, value, ts=None, *a):
        self.rows.append((metric, value, ts))


class Tripwire:
    """stands in for the hub's own database: store_state() must use the store it is given"""

    def __getattr__(self, name):
        raise AssertionError(f"the hub's database was touched ({name})")


class CollectEdges(unittest.TestCase):
    def setUp(self):
        self.saved = (app.store, dict(app.collector))
        app.store = Tripwire()
        app.collector.pop("skipped_two_people", None)

    def tearDown(self):
        app.store = self.saved[0]
        app.collector.clear()
        app.collector.update(self.saved[1])

    def stored(self, s):
        st = Recorder()
        app.store_state(s, NOW, st)
        return st.rows

    def test_one_person_every_reading_with_the_polls_time_and_counted_once(self):
        before = app.collector["stored"]
        self.assertEqual(self.stored(state()), [("finger_bpm", 71, NOW), ("hrv_rmssd", 42.5, NOW),
                                                ("breathing", 12, NOW), ("room_celsius", 21.5, NOW)])
        self.assertEqual(app.collector["stored"], before + 1)
        self.assertNotIn("skipped_two_people", app.collector)

    def test_two_people_every_poll_is_counted_and_none_is_counted_as_stored(self):
        before = app.collector["stored"]
        for n in (1, 2, 3):
            self.assertEqual(self.stored(state(two_hearts=True)), ROOM_ONLY)
            self.assertEqual(app.collector["skipped_two_people"], n)
        self.assertEqual(self.stored(state(two_hearts=True, mode="idle")), ROOM_ONLY)
        self.assertEqual(app.collector["skipped_two_people"], 4)
        self.assertEqual(app.collector["stored"], before)

    def test_missing_values_stay_missing(self):
        s = state()
        s["finger"]["bpm"] = None
        s["hrv"] = {}
        del s["breathing"], s["climate"]
        self.assertEqual(self.stored(s), [])
        self.assertEqual(self.stored({"presence": None, "finger": None, "climate": {"celsius": 21.5}}), ROOM_ONLY)
        self.assertEqual(self.stored({}), [])

    def test_without_a_store_argument_the_hubs_own_store_is_used(self):
        app.store = Recorder()
        app.store_state(state(), NOW)
        self.assertEqual([m for m, _, _ in app.store.rows], ["finger_bpm", "hrv_rmssd", "breathing", "room_celsius"])


if __name__ == "__main__":
    unittest.main()
