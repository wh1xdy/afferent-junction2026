"""Posture minute rows -> data-manager samples (no network: fake client)."""
from afferent.aggregator import MinuteAggregator
from afferent.config import Config
from afferent.datasink import DataSink
from afferent.storage import Storage


class FakeClient:
    def __init__(self):
        self.samples = []

    def sample(self, metric, value, ts=None, quality=None, meta=None, source=None):
        self.samples.append({"metric": metric, "value": value, "ts": ts, "meta": meta,
                             "source": source})

    def close(self):
        pass


def test_off_by_default():
    assert DataSink.from_config(Config(), lambda: "default") is None
    assert DataSink.from_config(Config(data_manager_url="off"), lambda: "x") is None


def _angles(trunk, head_trunk):
    # what geometry.compute_frame_angles returns (other angles irrelevant here)
    return {"trunk_inclination": trunk, "head_trunk_angle": head_trunk,
            "neck_flexion": 30.0, "head_lateral_tilt": 2.0, "slump_index": 0.9}


def test_minute_rows_are_pushed_per_context(tmp_path):
    st = Storage(str(tmp_path / "p.db"), site="living room")
    fake = FakeClient()
    sink = DataSink(fake, lambda: st.site, "afferent-0.1.0", "rtmlib")
    agg = MinuteAggregator(st, min_valid_frames=5, on_flush=sink.on_minute)
    base = 1_700_000_040.0           # minute boundary at ...000
    for i in range(6):               # standing, profile: trunk + head/trunk valid
        agg.add(base + i, "standing", "profile", _angles(10.0, 20.0 + i), 0.9)
    for i in range(6):               # standing, face: trunk invalid, head/trunk valid
        agg.add(base + 10 + i, "standing", "face", _angles(10.0, 8.0), 0.9)
    for i in range(6):               # walking counts as standing
        agg.add(base + 20 + i, "walking", "profile", _angles(6.0, 15.0), None)
    for i in range(6):               # sitting (knee < 120 deg): stays local only
        agg.add(base + 30 + i, "sitting", "profile", _angles(25.0, 30.0), 0.8)
    agg.add(base + 40, "transition", "profile", _angles(40.0, 30.0), None)
    agg.flush()
    by = {(s["source"], s["metric"]): s for s in fake.samples}
    prof = "posture/living-room/standing-profile"
    face = "posture/living-room/standing-face"
    walk = "posture/living-room/walking-profile"
    assert by[(prof, "posture.trunk_inclination_deg")]["value"] == 10.0
    assert by[(prof, "posture.head_trunk_angle_deg")]["value"] == 22.5
    assert by[(face, "posture.head_trunk_angle_deg")]["value"] == 8.0
    assert (face, "posture.trunk_inclination_deg") not in by  # invalid in face view
    assert by[(walk, "posture.trunk_inclination_deg")]["value"] == 6.0
    assert not any("sitting" in s["source"] or "transition" in s["source"] for s in fake.samples)
    assert {s["metric"] for s in fake.samples} == {"posture.trunk_inclination_deg",
                                                   "posture.head_trunk_angle_deg"}
    s = by[(prof, "posture.head_trunk_angle_deg")]
    assert s["ts"] == 1_700_000_040_000 + 30_000
    assert s["meta"]["n"] == 6 and s["meta"]["orientation"] == "profile"
    # the local SQLite keeps every context, sitting included (transition: too few frames)
    assert len(st.query("SELECT * FROM minute")) == 4
    st.close()


def test_pushed_values_equal_local_minute_rows(tmp_path):
    """Same numbers as the runtime's own minute table: no parallel computation."""
    import json
    st = Storage(str(tmp_path / "p.db"))
    fake = FakeClient()
    agg = MinuteAggregator(st, min_valid_frames=3,
                           on_flush=DataSink(fake, lambda: st.site).on_minute)
    for i, (t, h) in enumerate([(4.0, 11.0), (6.5, 14.0), (5.0, 12.5), (9.0, 13.0)]):
        agg.add(1_700_000_040.0 + i, "standing", "profile", _angles(t, h), None)
    agg.flush()
    row = json.loads(st.query_one("SELECT angles FROM minute")["angles"])
    by = {s["metric"]: s for s in fake.samples}
    assert by["posture.trunk_inclination_deg"]["value"] == round(row["trunk_inclination"]["med"], 2)
    assert by["posture.head_trunk_angle_deg"]["value"] == round(row["head_trunk_angle"]["med"], 2)
    assert by["posture.head_trunk_angle_deg"]["meta"]["p90"] == round(row["head_trunk_angle"]["p90"], 2)
    st.close()


def test_push_failure_never_breaks_local_storage(tmp_path):
    st = Storage(str(tmp_path / "p.db"))

    def boom(*a):
        raise RuntimeError("network down")

    agg = MinuteAggregator(st, min_valid_frames=2, on_flush=boom)
    for i in range(3):
        agg.add(1_700_000_040.0 + i, "standing", "profile", {"trunk_inclination": 7.0}, None)
    agg.flush()
    assert len(st.query("SELECT * FROM minute")) == 1
    st.close()
