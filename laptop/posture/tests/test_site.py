"""Site (room) scoping: per-site calibration keys + site-tagged rows.

The same camera moves between rooms; each room is a site with its own
floor homography, upright references and aggregates — never mixed.
"""
import json
import sqlite3

import pytest

from afferent.config import Config
from afferent.pipeline import FrameProcessor
from afferent.storage import SCHEMA_VERSION, Storage

TS = 1_700_000_000_000


def _st(tmp_path, site="default"):
    return Storage(str(tmp_path / "s.db"), site=site)


def _write_everywhere(st, ts=TS):
    """One row in each site-tagged table at the same logical position."""
    st.add_minute(ts_ms=ts, activity="sitting", orientation="face",
                  n_valid=42, angles={}, slump=0.9,
                  extractor_version="t", model_version="m")
    st.add_episode({"start": 1.0, "end": 5.0, "type": "walk",
                    "orientation": "profile", "duration_s": 4.0,
                    "distance_m": 3.0, "n_steps": 8, "valid": True},
                   variables={"speed_m_s": 0.9},
                   extractor_version="t", model_version="m")
    st.start_session(simulated=False, extractor_version="t",
                     model_version="m")
    st.add_day("2026-11-13", {"minutes": 10}, 0.007)


def test_site_env_config(monkeypatch):
    monkeypatch.delenv("SITE", raising=False)
    assert Config.from_env().site == "default"
    monkeypatch.setenv("SITE", "kitchen")
    assert Config.from_env().site == "kitchen"


def test_scoped_config_isolated_between_sites(tmp_path):
    st = _st(tmp_path, site="living")
    st.set_config("floor_homography", {"H": [[1, 0, 0]]})
    st.set_config("ref_trunk_len_px", 100.0)
    st.set_config("ref_shoulder_hip_px", 42.0)

    st.set_site("bedroom")
    assert st.get_config("floor_homography") is None
    assert st.get_config("ref_trunk_len_px") is None
    assert st.get_config("ref_shoulder_hip_px") is None
    st.set_config("floor_homography", {"H": [[9, 9, 9]]})

    st.set_site("living")
    assert st.get_config("floor_homography") == {"H": [[1, 0, 0]]}
    assert st.get_config("ref_trunk_len_px") == 100.0
    keys = {r["key"] for r in st.query("SELECT key FROM config")}
    assert "site:living:floor_homography" in keys
    assert "site:bedroom:floor_homography" in keys
    # non-scoped keys stay global across sites
    st.set_config("plain", "hello")
    st.set_site("bedroom")
    assert st.get_config("plain") == "hello"
    st.close()


def test_unscoped_calibration_migrates_to_default(tmp_path):
    db = str(tmp_path / "s.db")
    st = Storage(db)
    # emulate a pre-site deployment: calibration stored unscoped
    st._write("INSERT INTO config(key, value)"
              " VALUES ('floor_homography', ?)",
              (json.dumps({"H": [[1]]}),))
    st.close()

    st = Storage(db)  # default site picks the migrated copy
    assert st.get_config("floor_homography") == {"H": [[1]]}
    assert st.query_one(
        "SELECT value FROM config"
        " WHERE key='site:default:floor_homography'") is not None
    st.set_site("other")  # other sites never inherit it
    assert st.get_config("floor_homography") is None
    st.close()


def test_site_column_on_rows_and_read_isolation(tmp_path):
    st = _st(tmp_path, site="kitchen")
    _write_everywhere(st)
    for table in ("minute", "episode", "session", "jour"):
        row = st.query_one(f"SELECT site FROM {table}")
        assert row["site"] == "kitchen", table

    st.set_site("bedroom")
    _write_everywhere(st)  # same ts/day — PK (ts|day, site) must coexist
    for table in ("minute", "episode", "session", "jour"):
        rows = st.query(f"SELECT DISTINCT site FROM {table}")
        assert {r["site"] for r in rows} == {"kitchen", "bedroom"}, table

    # reads only ever see the active site
    assert all(r["site"] == "bedroom" for r in st.minutes_since(0))
    assert all(r["site"] == "bedroom" for r in st.episodes())
    assert all(r["site"] == "bedroom" for r in st.sessions())
    assert all(r["site"] == "bedroom" for r in st.days())
    assert st.stats()["minute_rows"] == 1
    st.set_site("kitchen")
    assert all(r["site"] == "kitchen" for r in st.minutes_since(0))
    st.close()


def test_site_switch_persists_across_restart(tmp_path):
    db = str(tmp_path / "s.db")
    st = Storage(db, site="default")
    st.set_site("kitchen")
    st.set_config("ref_trunk_len_px", 77.0)
    st.close()

    st = Storage(db, site="default")  # env says default; persisted wins
    assert st.site == "kitchen"
    assert st.get_config("ref_trunk_len_px") == 77.0
    st.close()


def test_v1_db_migrates_tagging_existing_rows(tmp_path):
    db = str(tmp_path / "s.db")
    con = sqlite3.connect(db)
    con.executescript("""
        CREATE TABLE schema_version (version INTEGER NOT NULL);
        INSERT INTO schema_version VALUES (1);
        CREATE TABLE minute (
            ts INTEGER NOT NULL, activity TEXT, orientation TEXT,
            n_valid_frames INTEGER, angles TEXT, slump REAL,
            extractor_version TEXT, model_version TEXT,
            PRIMARY KEY (ts));
        INSERT INTO minute(ts, activity, angles)
            VALUES (123, 'sitting', '{}');
        CREATE TABLE visage_minute (
            ts INTEGER NOT NULL, n_valid INTEGER, expr_mean TEXT,
            expr_std TEXT, pitch_mean REAL, smile_episodes INTEGER,
            emotions TEXT, valence_mean REAL, arousal_mean REAL,
            extractor_version TEXT, model_version TEXT,
            PRIMARY KEY (ts));
        CREATE TABLE galerie (
            id INTEGER PRIMARY KEY AUTOINCREMENT, embedding BLOB NOT NULL,
            created REAL NOT NULL, type TEXT NOT NULL);
        CREATE TABLE identite (ts INTEGER NOT NULL, state TEXT NOT NULL,
                               score REAL);
        CREATE TABLE episode (
            id INTEGER PRIMARY KEY AUTOINCREMENT, start REAL NOT NULL,
            end REAL NOT NULL, type TEXT NOT NULL, orientation TEXT,
            duration_s REAL, distance_m REAL, n_steps INTEGER,
            valid INTEGER, variables TEXT, extractor_version TEXT,
            model_version TEXT);
        INSERT INTO episode(start, end, type) VALUES (1.0, 2.0, 'walk');
        CREATE TABLE session (
            id INTEGER PRIMARY KEY AUTOINCREMENT, start REAL NOT NULL,
            end REAL, simulated INTEGER NOT NULL DEFAULT 0,
            quality_ok INTEGER, variables TEXT, extractor_version TEXT,
            model_version TEXT);
        INSERT INTO session(start, simulated) VALUES (1.0, 0);
        CREATE TABLE jour (
            day TEXT PRIMARY KEY, aggregates TEXT, coverage REAL,
            recalibrated INTEGER DEFAULT 0, extractor_version TEXT,
            model_version TEXT);
        INSERT INTO jour(day, coverage) VALUES ('2026-01-01', 0.5);
        CREATE TABLE config (key TEXT PRIMARY KEY, value TEXT);
        INSERT INTO config VALUES ('floor_homography', '"H1"');
        CREATE INDEX idx_episode_start ON episode(start);
        CREATE INDEX idx_minute_ts ON minute(ts);
    """)
    con.close()

    st = Storage(db, site="default")
    v = st.query_one("SELECT version FROM schema_version")
    assert v["version"] == SCHEMA_VERSION
    row = st.query_one("SELECT * FROM minute WHERE ts=123")
    assert row["site"] == "default" and row["activity"] == "sitting"
    # v1 rows had NULL-able labels -> migrated as 'unknown'
    assert row["orientation"] == "unknown"
    ep = st.query_one("SELECT * FROM episode")
    assert ep["site"] == "default"
    # epoch-s -> epoch-ms conversion in the v1->v3 chain
    assert ep["start"] == 1000 and ep["end"] == 2000
    sess = st.query_one("SELECT * FROM session")
    assert sess["site"] == "default" and sess["start"] == 1000
    assert st.query_one("SELECT site FROM jour")["site"] == "default"
    # same-ts rows for another site must coexist (PK includes site)
    st.set_site("other")
    st.add_minute(ts_ms=123, activity="walking", orientation="profile",
                  n_valid=30, angles={}, slump=None,
                  extractor_version="t", model_version="m")
    assert len(st.query("SELECT * FROM minute WHERE ts=123")) == 2
    # legacy unscoped calibration was copied into site:default scope
    st.set_site("default")
    assert st.get_config("floor_homography") == "H1"
    st.close()


def test_v2_db_migrates_to_v3(tmp_path):
    """v2 -> v3: minute rebuilt with (activity, orientation) in the PK and
    site column kept; episode/session/galerie timestamps x1000."""
    db = str(tmp_path / "s.db")
    con = sqlite3.connect(db)
    con.executescript("""
        CREATE TABLE schema_version (version INTEGER NOT NULL);
        INSERT INTO schema_version VALUES (2);
        CREATE TABLE minute (
            ts INTEGER NOT NULL, site TEXT NOT NULL DEFAULT 'default',
            activity TEXT, orientation TEXT, n_valid_frames INTEGER,
            angles TEXT, slump REAL, extractor_version TEXT,
            model_version TEXT, PRIMARY KEY (ts, site));
        INSERT INTO minute(ts, site, activity, orientation, n_valid_frames,
            angles, slump) VALUES
            (1700000000000, 'kitchen', 'sitting', 'profile', 40, '{}', 0.9),
            (1700000060000, 'kitchen', NULL, NULL, 20, '{}', NULL);
        CREATE TABLE visage_minute (
            ts INTEGER NOT NULL, site TEXT NOT NULL DEFAULT 'default',
            n_valid INTEGER, expr_mean TEXT, expr_std TEXT, pitch_mean REAL,
            smile_episodes INTEGER, emotions TEXT, valence_mean REAL,
            arousal_mean REAL, extractor_version TEXT, model_version TEXT,
            PRIMARY KEY (ts, site));
        CREATE TABLE galerie (
            id INTEGER PRIMARY KEY AUTOINCREMENT, embedding BLOB NOT NULL,
            created REAL NOT NULL, type TEXT NOT NULL);
        INSERT INTO galerie(embedding, created, type)
            VALUES (x'0000', 1700000000.5, 'enrolement');
        CREATE TABLE identite (ts INTEGER NOT NULL, state TEXT NOT NULL,
                               score REAL);
        CREATE TABLE episode (
            id INTEGER PRIMARY KEY AUTOINCREMENT, start REAL NOT NULL,
            end REAL NOT NULL, type TEXT NOT NULL, site TEXT,
            orientation TEXT, duration_s REAL, distance_m REAL,
            n_steps INTEGER, valid INTEGER, variables TEXT,
            extractor_version TEXT, model_version TEXT);
        INSERT INTO episode(start, end, type, site, valid)
            VALUES (1700000000.5, 1700000005.25, 'walk', 'kitchen', 1);
        CREATE TABLE session (
            id INTEGER PRIMARY KEY AUTOINCREMENT, start REAL NOT NULL,
            end REAL, site TEXT, simulated INTEGER NOT NULL DEFAULT 0,
            quality_ok INTEGER, variables TEXT, extractor_version TEXT,
            model_version TEXT);
        INSERT INTO session(start, end, site, simulated)
            VALUES (1700000000.0, NULL, 'kitchen', 1);
        CREATE TABLE jour (
            day TEXT NOT NULL, site TEXT NOT NULL DEFAULT 'default',
            aggregates TEXT, coverage REAL, recalibrated INTEGER DEFAULT 0,
            extractor_version TEXT, model_version TEXT,
            PRIMARY KEY (day, site));
        INSERT INTO jour(day, site, coverage) VALUES
            ('2026-01-01', 'kitchen', 0.5);
        CREATE TABLE config (key TEXT PRIMARY KEY, value TEXT);
        CREATE INDEX idx_episode_start ON episode(start);
        CREATE INDEX idx_minute_ts ON minute(ts);
    """)
    con.close()

    st = Storage(db, site="kitchen")
    v = st.query_one("SELECT version FROM schema_version")
    assert v["version"] == SCHEMA_VERSION

    rows = st.query("SELECT * FROM minute ORDER BY activity")
    assert len(rows) == 2
    assert rows[0]["activity"] == "sitting"   # 's' < 'u'
    assert rows[0]["orientation"] == "profile"
    assert rows[0]["site"] == "kitchen"       # site column preserved
    assert rows[1]["activity"] == "unknown"   # NULL -> unknown
    assert rows[1]["orientation"] == "unknown"

    # migrated majority-label rows coexist with new per-context writes
    st.add_minute(ts_ms=1700000000000, activity="walking",
                  orientation="face", n_valid=10, angles={}, slump=None,
                  extractor_version="t", model_version="m")
    assert len(st.query("SELECT * FROM minute WHERE ts=1700000000000")) == 2

    ep = st.query_one("SELECT * FROM episode")
    assert ep["start"] == 1700000000500 and ep["end"] == 1700000005250
    assert isinstance(ep["start"], int)
    sess = st.query_one("SELECT * FROM session")
    assert sess["start"] == 1700000000000 and sess["end"] is None
    g = st.query_one("SELECT created FROM galerie")
    assert g["created"] == 1700000000500  # x1000
    st.close()


def test_processor_set_site_reloads_calibration(tmp_path):
    """Storage-level behaviour behind POST /api/site/<id>."""
    cfg = Config()
    cfg.min_valid_frames = 2
    st = _st(tmp_path, site="living")
    proc = FrameProcessor(cfg, st)

    img_pts = [[100, 500], [500, 500], [500, 800], [100, 800]]
    floor_pts = [[0, 0], [1, 0], [1, 1], [0, 1]]
    assert proc.set_floor(img_pts, floor_pts)
    st.set_config("ref_trunk_len_px", 111.0)

    # buffered minute samples flush under the OLD site on switch
    t = TS / 1000.0
    proc.minute_agg.add(t, "sitting", "face",
                        {"neck_flexion": 1.0}, 0.5)
    proc.minute_agg.add(t + 1, "sitting", "face",
                        {"neck_flexion": 2.0}, 0.5)

    proc.set_site("bedroom")
    assert st.site == "bedroom" and cfg.site == "bedroom"
    assert not proc.floor.calibrated
    assert proc.ref_trunk_len_px is None
    rows = st.query("SELECT ts, site FROM minute")
    assert [r["site"] for r in rows] == ["living"]

    # calibrate the second room independently, then switch back
    st.set_config("ref_trunk_len_px", 222.0)
    proc.set_site("living")
    assert proc.floor.calibrated
    assert proc.ref_trunk_len_px == 111.0
    assert st.site == "living"
    st.close()


def test_processor_set_site_rejects_empty(tmp_path):
    st = _st(tmp_path)
    proc = FrameProcessor(Config(), st)
    for bad in ("", "   "):
        with pytest.raises(ValueError):
            proc.set_site(bad)
    assert st.site == "default"
    st.close()
