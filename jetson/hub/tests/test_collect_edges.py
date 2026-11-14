"""The collector's corner cases (test_collect.py has the main four): what is counted, what stays
missing, which store is written to, and what is not a measurement of the patient taken just now
(low or unreported signal quality, an old beat, values left over from the previous wearing).

    cd jetson/hub && python3 -m unittest discover tests -v
"""
import json
import os
import sys
import unittest

os.environ.setdefault("AFFERENT_DB", ":memory:")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import app  # noqa: E402
from test_collect import DEVICE, NOW, state  # noqa: E402

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


class Sourced:
    """a store that also writes down the source label of each reading"""

    def __init__(self):
        self.rows = []

    def add_reading(self, metric, value, ts=None, source="uno-q"):
        self.rows.append((metric, value, source))


class OnlyMeasurements(unittest.TestCase):
    """a pulse that the UNO Q itself does not vouch for is not recorded; missing stays missing"""

    def setUp(self):
        self.saved = (app.store, dict(app.collector))
        app.store = Tripwire()
        for k in [k for k in app.collector if k.startswith("skipped_")]:
            del app.collector[k]

    def tearDown(self):
        app.store = self.saved[0]
        app.collector.clear()
        app.collector.update(self.saved[1])

    def metrics(self, s):
        st = Recorder()
        app.store_state(s, NOW, st)
        return [m for m, _, _ in st.rows]

    def test_pulse_below_quality_0_3_is_not_recorded(self):
        before = app.collector["stored"]
        for n, q in enumerate((0.29, 0.2, 0.0, -1), 1):
            self.assertEqual(self.metrics(state(quality=q)), ["hrv_rmssd", "breathing", "room_celsius"], q)
            self.assertEqual(app.collector["skipped_low_quality"], n)
        self.assertEqual(app.collector["stored"], before)
        self.assertEqual(self.metrics(state(quality=0.3))[0], "finger_bpm")              # the limit itself counts
        self.assertEqual(app.collector["stored"], before + 1)

    def test_pulse_without_a_reported_quality_is_not_recorded(self):
        s = state()
        del s["finger"]["quality"]
        self.assertNotIn("finger_bpm", self.metrics(s))
        for q in (None, "0.9", True, [0.9], float("nan"), float("inf")):                 # not a number = not reported
            self.assertNotIn("finger_bpm", self.metrics(state(quality=q)), repr(q))
        self.assertEqual(app.collector["skipped_low_quality"], 7)

    def test_no_reading_is_not_counted_as_low_quality(self):
        for bpm in (None, 0, -5, "71", True):                                            # 0 / null = no reading
            s = state(quality=0.1)
            s["finger"]["bpm"] = bpm
            self.assertNotIn("finger_bpm", self.metrics(s), repr(bpm))
        self.assertNotIn("skipped_low_quality", app.collector)

    def test_a_beat_older_than_three_seconds_is_not_a_live_reading(self):
        self.assertIn("finger_bpm", self.metrics(state(beat_age=3.0)))
        self.assertNotIn("skipped_stale", app.collector)
        self.assertNotIn("finger_bpm", self.metrics(state(beat_age=3.5)))
        self.assertEqual(app.collector["skipped_stale"], 1)
        s = state(beat_age=10)
        s["fingers"][1]["t"] = DEVICE - 1                         # finger 2 is fresh, but the pulse comes from finger 1
        s["finger"]["sources"] = [0]
        self.assertNotIn("finger_bpm", self.metrics(s))
        s["finger"]["sources"] = [0, 1]
        self.assertIn("finger_bpm", self.metrics(s))

    def test_ages_use_the_unoq_clock_not_the_hubs(self):
        s = state()
        self.assertGreater(NOW - s["fingers"][0]["t"], 3)         # ten thousand seconds apart, and still live
        self.assertEqual(self.metrics(s), ["finger_bpm", "hrv_rmssd", "breathing", "room_celsius"])
        s["now"] = DEVICE + 2                                     # newer firmware sends its clock as `now`
        s["beat"]["t"] = DEVICE - 500
        self.assertEqual(self.metrics(s), ["finger_bpm", "hrv_rmssd", "breathing", "room_celsius"])
        s["now"] = DEVICE + 4.5
        self.assertNotIn("finger_bpm", self.metrics(s))

    def test_hrv_and_breathing_left_over_from_the_last_wearing_are_not_recorded(self):
        """the UNO Q keeps the last HRV and breathing in /state while idle and while a new wearing warms up"""
        for worn in (0, 3, 5.9):
            self.assertEqual(self.metrics(state(worn_s=worn)), ["finger_bpm", "room_celsius"], worn)
        self.assertEqual(self.metrics(state(worn_s=6)), ["finger_bpm", "hrv_rmssd", "breathing", "room_celsius"])
        s = state()
        del s["presence"]["since"]
        self.assertEqual(self.metrics(s), ["finger_bpm", "room_celsius"])

    def test_without_a_device_clock_only_what_needs_no_age_is_recorded(self):
        s = state()
        del s["beat"]
        self.assertEqual(self.metrics(s), ["finger_bpm", "room_celsius"])
        s["beat"] = {"t": "soon"}
        self.assertEqual(self.metrics(s), ["finger_bpm", "room_celsius"])

    def test_zero_hrv_or_breathing_is_no_reading(self):
        for v in (0, None, "12", True, -3):
            s = state()
            s["hrv"]["rmssd_ms"] = s["breathing"]["per_minute"] = v
            self.assertEqual(self.metrics(s), ["finger_bpm", "room_celsius"], repr(v))

    def test_an_old_room_temperature_is_not_recorded(self):
        s = state()
        s["climate"]["t"] = DEVICE - 31                           # the thermometer reports every 2 s: it is unplugged
        self.assertNotIn("room_celsius", self.metrics(s))
        s["climate"]["t"] = DEVICE - 29
        self.assertIn("room_celsius", self.metrics(s))
        s["climate"]["celsius"] = "21.5"
        self.assertNotIn("room_celsius", self.metrics(s))

    def test_finger_readings_are_labelled_finger_ppg(self):
        st = Sourced()
        app.store_state(state(), NOW, st)
        self.assertEqual(st.rows, [("finger_bpm", 71, "finger_ppg"), ("hrv_rmssd", 42.5, "finger_ppg"),
                                   ("breathing", 12, "finger_ppg"), ("room_celsius", 21.5, "modulino_thermo")])

    def test_the_demo_patient_is_labelled_simulated_in_its_own_store(self):
        import demo
        s = demo.demo_store(NOW)
        self.assertEqual(s.db.execute("SELECT DISTINCT source FROM readings").fetchall(), [("simulated",)])
        s.db.close()

    def test_a_document_of_the_wrong_shape_stores_nothing_and_does_not_raise(self):
        for doc in (None, [], "x", 5, {"finger": [1], "presence": "active", "climate": 21.5, "hrv": 3, "breathing": [],
                                       "fingers": {"t": 1}, "beat": 7, "now": "x"}):
            self.assertEqual(self.metrics(doc), [], repr(doc))
        s = state()
        s["fingers"], s["finger"]["sources"] = "oops", 5
        self.assertEqual(self.metrics(s), ["finger_bpm", "hrv_rmssd", "breathing", "room_celsius"])


class Loop(unittest.TestCase):
    """collect(): a poll that cannot be stored is reported, and the next poll still happens"""

    class Polls:
        def __init__(self, n):
            self.left = n

        def wait(self, _):
            self.left -= 1
            return self.left < 0

    class Reply:
        def __init__(self, doc):
            self.doc = doc

        def __enter__(self):
            return self

        def __exit__(self, *_):
            return False

        def read(self):
            return json.dumps(self.doc).encode()

    def setUp(self):
        self.saved = (app.store, dict(app.collector), app.urllib.request.urlopen)
        app.collector.update(hub_url="http://unoq.test:8080", error=None)

    def tearDown(self):
        app.store, _, app.urllib.request.urlopen = self.saved
        app.collector.clear()
        app.collector.update(self.saved[1])

    def test_a_failing_store_does_not_end_the_collection(self):
        class Store(Recorder):
            def add_reading(self, metric, value, ts=None, *a):
                if not self.rows and metric == "finger_bpm":
                    self.rows.append(("failed", None, None))
                    raise RuntimeError("database is locked: secret-detail")
                super().add_reading(metric, value, ts, *a)
        app.store = Store()
        asked = []
        app.urllib.request.urlopen = lambda url, timeout: asked.append(url) or self.Reply(state())
        app.collect(self.Polls(1))
        self.assertEqual(app.collector["error"], "store: RuntimeError")          # the class only, as in the request log
        app.collect(self.Polls(2))
        self.assertEqual(asked, ["http://unoq.test:8080/state"] * 3)
        self.assertEqual([m for m, _, _ in app.store.rows].count("finger_bpm"), 2)
        self.assertIsNone(app.collector["error"])

    def test_an_answer_that_is_not_a_state_document_is_survived(self):
        app.store = Recorder()
        docs = [[1, 2], "nope", state()]
        app.urllib.request.urlopen = lambda url, timeout: self.Reply(docs.pop(0))
        app.collect(self.Polls(3))
        self.assertEqual([m for m, _, _ in app.store.rows], ["finger_bpm", "hrv_rmssd", "breathing", "room_celsius"])


if __name__ == "__main__":
    unittest.main()
