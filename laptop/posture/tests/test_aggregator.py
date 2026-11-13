"""Minute/visage aggregation + daily aggregate tests."""
import json

import numpy as np
import pytest

from afferent.aggregator import (MinuteAggregator, VisageAggregator,
                                 daily_aggregate)
from afferent.storage import Storage


def _storage(tmp_path):
    return Storage(str(tmp_path / "agg.db"))


def test_minute_threshold(tmp_path):
    st = _storage(tmp_path)
    agg = MinuteAggregator(st, min_valid_frames=10,
                           extractor_version="t", model_version="m")
    base = 1_700_000_000.0
    angles = {"neck_flexion": 10.0, "trunk_inclination": 5.0,
              "shoulder_asymmetry": 2.0, "head_lateral_tilt": 1.0,
              "slump_index": 0.9}
    # profile orientation: neck/trunk/slump valid, asymmetry/tilt excluded
    for i in range(9):   # below threshold -> no row
        agg.add(base + i * 0.1, "sitting", "profile", angles, 0.9)
    agg.flush()
    assert st.query("SELECT * FROM minute") == []
    # cross into next minute with enough samples
    for i in range(12):
        agg.add(base + 60 + i * 0.1, "sitting", "profile", angles, 0.9)
    agg.flush()
    rows = st.query("SELECT * FROM minute")
    assert len(rows) == 1
    a = json.loads(rows[0]["angles"])
    assert a["neck_flexion"]["med"] == 10.0
    assert a["neck_flexion"]["n"] == 12
    # shoulder asymmetry is invalid for profile -> excluded entirely
    assert a["shoulder_asymmetry"] is None
    assert rows[0]["activity"] == "sitting"
    assert rows[0]["slump"] == 0.9
    st.close()


def test_minute_percentiles_and_orientation_filter(tmp_path):
    st = _storage(tmp_path)
    agg = MinuteAggregator(st, min_valid_frames=5)
    base = 1_700_000_000.0
    # profile frames: neck valid, shoulder_asymmetry invalid -> excluded
    for i in range(5):
        angles = {"neck_flexion": 10.0 + i, "trunk_inclination": 8.0,
                  "shoulder_asymmetry": 3.0, "head_lateral_tilt": 1.0,
                  "slump_index": 0.9}
        agg.add(base + i * 0.1, "standing", "profile", angles, 0.9)
    agg.flush()
    row = st.query_one("SELECT * FROM minute")
    a = json.loads(row["angles"])
    assert a["neck_flexion"]["med"] == 12.0
    # np.percentile linear interpolation on [10..14]
    assert a["neck_flexion"]["p10"] == pytest.approx(10.4)
    assert a["neck_flexion"]["p90"] == pytest.approx(13.6)
    # shoulder asymmetry invalid for profile -> no stats
    assert a["shoulder_asymmetry"] is None
    st.close()


def test_visage_aggregation(tmp_path):
    st = _storage(tmp_path)
    v = VisageAggregator(st, min_valid=4)
    base = 1_700_000_000.0
    for i in range(4):
        v.add(base + i, {"mouthSmileLeft": 0.2 + i * 0.1,
                         "browDownLeft": 0.1},
              pitch_deg=5.0, emotion="Happiness" if i < 3 else "Neutral",
              valence=0.5, arousal=0.3, smile=0.6 if i == 0 else 0.1)
    v.flush()
    row = st.query_one("SELECT * FROM visage_minute")
    import json
    em = json.loads(row["expr_mean"])
    assert em["mouthSmileLeft"] == 0.35  # mean of 0.2,0.3,0.4,0.5
    assert row["pitch_mean"] == 5.0
    assert row["smile_episodes"] == 1    # only first sample above 0.5
    emo = json.loads(row["emotions"])
    assert emo["Happiness"] == 0.75 and emo["Neutral"] == 0.25
    assert row["valence_mean"] == 0.5
    st.close()


def test_daily_aggregate():
    rows = [
        {"activity": "sitting", "orientation": "face", "slump": 0.9,
         "angles": '{"neck_flexion": null, "trunk_inclination": null,'
                   ' "shoulder_asymmetry": {"med": 3.0},'
                   ' "head_lateral_tilt": {"med": 2.0},'
                   ' "slump_index": {"med": 0.9}}'},
        {"activity": "standing", "orientation": "profile", "slump": 0.8,
         "angles": '{"neck_flexion": {"med": 12.0},'
                   ' "trunk_inclination": {"med": 6.0},'
                   ' "shoulder_asymmetry": null, "head_lateral_tilt": null,'
                   ' "slump_index": {"med": 0.8}}'},
    ]
    agg = daily_aggregate(rows)
    assert agg["minutes"] == 2
    assert agg["coverage"] == round(2 / 1440, 4)
    assert agg["slump_median"] == pytest.approx(0.85)
    assert agg["angle_medians"]["neck_flexion"] == 12.0
    assert agg["angle_medians"]["trunk_inclination"] == 6.0
    assert agg["activity_shares"]["sitting"] == 0.5
