"""Storage round-trip tests."""
import json

import numpy as np

from afferent.storage import SCHEMA_VERSION, Storage


def _st(tmp_path):
    return Storage(str(tmp_path / "s.db"))


def test_schema_and_config_roundtrip(tmp_path):
    st = _st(tmp_path)
    v = st.query_one("SELECT version FROM schema_version")
    assert v["version"] == SCHEMA_VERSION
    st.set_config("floor_homography", {"H": [[1, 0, 0], [0, 1, 0], [0, 0, 1]]})
    st.set_config("plain", "hello")
    assert st.get_config("floor_homography")["H"][0][0] == 1
    assert st.get_config("plain") == "hello"
    assert st.get_config("missing", "d") == "d"
    st.close()


def test_gallery_roundtrip_and_clear(tmp_path):
    st = _st(tmp_path)
    emb = np.random.default_rng(0).normal(size=128).astype(np.float32)
    st.add_gallery(emb, "enrolement")
    st.add_gallery(emb, "adaptative")
    assert st.gallery_count() == 2
    blobs = st.gallery_embeddings()
    assert len(blobs) == 2
    back = np.frombuffer(blobs[0], dtype=np.float32)
    assert back.shape == (128,)
    assert np.allclose(back, emb)
    assert st.clear_gallery() == 2
    assert st.gallery_count() == 0
    st.close()


def test_minute_episode_session_rows(tmp_path):
    st = _st(tmp_path)
    st.add_minute(ts_ms=1_700_000_000_000, activity="sitting",
                  orientation="face", n_valid=42,
                  angles={"neck_flexion": {"med": 5.0, "p10": 3.0,
                                          "p90": 8.0, "n": 42}},
                  slump=0.95, extractor_version="t", model_version="m")
    row = st.query_one("SELECT * FROM minute")
    assert row["activity"] == "sitting"
    assert json.loads(row["angles"])["neck_flexion"]["med"] == 5.0

    ep_id = st.add_episode(
        {"start": 1.0, "end": 5.0, "type": "walk", "orientation": "profile",
         "duration_s": 4.0, "distance_m": 3.2, "n_steps": 8, "valid": True},
        variables={"speed_m_s": 0.9}, extractor_version="t", model_version="m")
    assert ep_id > 0
    st.update_episode_variables(ep_id, {"cadence_steps_min": 108.0})
    ep = st.query_one("SELECT * FROM episode WHERE id=?", (ep_id,))
    assert json.loads(ep["variables"])["cadence_steps_min"] == 108.0

    sid = st.start_session(simulated=True, extractor_version="t",
                           model_version="m")
    st.end_session(sid, {"gait": {"speed_m_s": 0.8}}, quality_ok=True)
    sess = st.sessions()
    assert len(sess) == 1 and sess[0]["simulated"] == 1
    assert sess[0]["end"] is not None

    st.add_day("2026-11-13", {"minutes": 10, "coverage": 0.007}, 0.007)
    days = st.days()
    assert days[0]["day"] == "2026-11-13"

    st.add_identite("verrouille", 0.62)
    log = st.identite_log()
    assert log[-1]["state"] == "verrouille" and log[-1]["score"] == 0.62

    stats = st.stats()
    assert stats["minute_rows"] == 1 and stats["sessions"] == 1
    st.close()


def test_minutes_since_filter(tmp_path):
    st = _st(tmp_path)
    for i in range(3):
        st.add_minute(ts_ms=1_700_000_000_000 + i * 60_000,
                      activity="standing", orientation="face",
                      n_valid=30, angles={}, slump=None,
                      extractor_version="t", model_version="m")
    rows = st.minutes_since(1_700_000_060_000)
    assert len(rows) == 2
    st.close()
