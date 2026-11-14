"""What the collector stores from one UNO Q /state document.

    cd jetson/hub && python3 -m unittest discover tests -v
"""
import os
import sys
import unittest

os.environ.setdefault("AFFERENT_DB", ":memory:")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import app  # noqa: E402

NOW = 1_800_000_000.0          # the hub's clock
DEVICE = 1_799_990_000.0       # the UNO Q's clock: not the hub's, and never compared with it


def state(two_hearts=False, mode="active", quality=0.8, worn_s=60.0, beat_age=1.0):
    """a /state document as modulino-hub sends it, cut down to what the collector reads"""
    return {"beat": {"bpm_live": 71, "fused": True, "t": DEVICE},
            "fingers": [{"bpm_live": 71, "t": DEVICE - beat_age}, {"bpm_live": 72, "t": DEVICE - beat_age - 0.4}],
            "presence": {"auto": True, "mode": mode, "since": DEVICE - worn_s},
            "finger": {"bpm": 71, "quality": quality, "sources": [0, 1], "fingers": [71, 72], "two_hearts": two_hearts},
            "hrv": {"rmssd_ms": 42.5}, "breathing": {"per_minute": 12},
            "climate": {"celsius": 21.5, "t": DEVICE - 1}}


class Recorder:
    def __init__(self):
        self.rows = {}

    def add_reading(self, metric, value, ts=None, *a):
        self.rows[metric] = value


def stored(s):
    st = Recorder()
    app.store_state(s, NOW, st)
    return {m: st.rows.get(m) for m in ("finger_bpm", "hrv_rmssd", "breathing", "room_celsius")}


class Collect(unittest.TestCase):
    def test_one_person_is_stored(self):
        self.assertEqual(stored(state()),
                         {"finger_bpm": 71, "hrv_rmssd": 42.5, "breathing": 12, "room_celsius": 21.5})

    def test_two_people_on_the_clips_are_not_the_patients_data(self):
        before = app.collector.get("skipped_two_people", 0)
        got = stored(state(two_hearts=True))
        self.assertEqual(got, {"finger_bpm": None, "hrv_rmssd": None, "breathing": None, "room_celsius": 21.5})
        self.assertEqual(app.collector["skipped_two_people"], before + 1)

    def test_sensors_off_stores_only_the_room(self):
        got = stored(state(mode="idle"))
        self.assertEqual(got, {"finger_bpm": None, "hrv_rmssd": None, "breathing": None, "room_celsius": 21.5})

    def test_older_firmware_without_the_flag_still_stores(self):
        s = state()
        del s["finger"]["two_hearts"]
        self.assertEqual(stored(s)["finger_bpm"], 71)


if __name__ == "__main__":
    unittest.main()
