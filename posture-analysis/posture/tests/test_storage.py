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
    # epoch-ms convention: writers convert epoch-s -> ms
    assert ep["start"] == 1000 and ep["end"] == 5000

    sid = st.start_session(simulated=True, extractor_version="t",
                           model_version="m")
    st.end_session(sid, {"gait": {"speed_m_s": 0.8}}, quality_ok=True)
    sess = st.sessions()
    assert len(sess) == 1 and sess[0]["simulated"] == 1
    assert sess[0]["end"] is not None
    # epoch-ms: session timestamps sit at ~1e12
    assert sess[0]["start"] > 1e12 and sess[0]["end"] > 1e12

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


def test_minute_contexts_share_one_ts(tmp_path):
    """PK (ts, site, activity, orientation): several contexts coexist in
    one minute; the same context re-written replaces itself."""
    st = _st(tmp_path)
    ts = 1_700_000_000_000
    st.add_minute(ts_ms=ts, activity="sitting", orientation="profile",
                  n_valid=40, angles={}, slump=0.9,
                  extractor_version="t", model_version="m")
    st.add_minute(ts_ms=ts, activity="walking", orientation="face",
                  n_valid=20, angles={}, slump=0.7,
                  extractor_version="t", model_version="m")
    assert len(st.minutes_since(ts)) == 2
    # same ts+context replaces, does not duplicate
    st.add_minute(ts_ms=ts, activity="sitting", orientation="profile",
                  n_valid=55, angles={}, slump=0.8,
                  extractor_version="t", model_version="m")
    rows = st.minutes_since(ts)
    assert len(rows) == 2
    sit = next(r for r in rows if r["activity"] == "sitting")
    assert sit["n_valid_frames"] == 55 and sit["slump"] == 0.8
    st.close()


def test_episodes_since_ms_filter(tmp_path):
    st = _st(tmp_path)
    st.add_episode({"start": 1_700_000_000.0, "end": 1_700_000_005.0,
                    "type": "walk", "valid": True},
                   extractor_version="t", model_version="m")
    st.add_episode({"start": 1_700_000_100.0, "end": 1_700_000_103.0,
                    "type": "sit", "valid": True},
                   extractor_version="t", model_version="m")
    assert len(st.episodes(0)) == 2
    rows = st.episodes(1_700_000_050_000)   # epoch ms
    assert len(rows) == 1 and rows[0]["type"] == "sit"
    assert rows[0]["start"] == 1_700_000_100_000
    st.close()
