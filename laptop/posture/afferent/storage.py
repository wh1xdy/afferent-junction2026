"""SQLite persistence: derived aggregates only (plan section 16).

No images, no video, no raw keypoints are written. Every row carries
extractor_version / model_version and a `site` tag (room): the same
camera can move between rooms, and aggregates from different sites
never mix. Single writer guarded by a lock; WAL mode for concurrent
reads from the API.
"""
from __future__ import annotations

import json
import os
import sqlite3
import threading
import time
from typing import Any

SCHEMA_VERSION = 2

# Config keys that live per-site (room): the same camera moves between
# rooms, each with its own floor homography and upright references. They
# are stored internally as "site:<site>:<key>"; all other keys are global.
SITE_SCOPED_KEYS = frozenset({
    "floor_homography", "ref_shoulder_hip_px", "ref_trunk_len_px"})

SCHEMA = """
CREATE TABLE IF NOT EXISTS schema_version (
    version INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS minute (
    ts INTEGER NOT NULL,               -- epoch ms, start of minute
    site TEXT NOT NULL DEFAULT 'default',
    activity TEXT,
    orientation TEXT,
    n_valid_frames INTEGER,
    angles TEXT,                       -- JSON: name -> {med,p10,p90}
    slump REAL,
    extractor_version TEXT,
    model_version TEXT,
    PRIMARY KEY (ts, site)
);
CREATE TABLE IF NOT EXISTS visage_minute (
    ts INTEGER NOT NULL,
    site TEXT NOT NULL DEFAULT 'default',
    n_valid INTEGER,
    expr_mean TEXT,                    -- JSON blendshape -> mean
    expr_std TEXT,                     -- JSON blendshape -> std
    pitch_mean REAL,
    smile_episodes INTEGER,
    emotions TEXT,                     -- JSON emotion -> time share
    valence_mean REAL,
    arousal_mean REAL,
    extractor_version TEXT,
    model_version TEXT,
    PRIMARY KEY (ts, site)
);
CREATE TABLE IF NOT EXISTS galerie (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    embedding BLOB NOT NULL,           -- float32 vector
    created REAL NOT NULL,
    type TEXT NOT NULL                 -- 'enrolement' | 'adaptative'
);
CREATE TABLE IF NOT EXISTS identite (
    ts INTEGER NOT NULL,
    state TEXT NOT NULL,               -- 'recherche' | 'verrouille' | 'perdu'
    score REAL
);
CREATE TABLE IF NOT EXISTS episode (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    start REAL NOT NULL,
    end REAL NOT NULL,
    type TEXT NOT NULL,
    site TEXT,
    orientation TEXT,
    duration_s REAL,
    distance_m REAL,
    n_steps INTEGER,
    valid INTEGER,
    variables TEXT,                    -- JSON gait/posture vars when available
    extractor_version TEXT,
    model_version TEXT
);
CREATE TABLE IF NOT EXISTS session (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    start REAL NOT NULL,
    end REAL,
    site TEXT,
    simulated INTEGER NOT NULL DEFAULT 0,
    quality_ok INTEGER,
    variables TEXT,                    -- JSON: gait vars + references
    extractor_version TEXT,
    model_version TEXT
);
CREATE TABLE IF NOT EXISTS jour (
    day TEXT NOT NULL,                 -- YYYY-MM-DD
    site TEXT NOT NULL DEFAULT 'default',
    aggregates TEXT,                   -- JSON daily aggregates
    coverage REAL,
    recalibrated INTEGER DEFAULT 0,
    extractor_version TEXT,
    model_version TEXT,
    PRIMARY KEY (day, site)
);
CREATE TABLE IF NOT EXISTS config (
    key TEXT PRIMARY KEY,
    value TEXT
);
CREATE INDEX IF NOT EXISTS idx_episode_start ON episode(start);
CREATE INDEX IF NOT EXISTS idx_minute_ts ON minute(ts);
"""


def _now_ms() -> int:
    return int(time.time() * 1000)


class Storage:
    """Thin sqlite wrapper. All writes serialized on one lock.

    `site` is the active room id: per-site config keys are transparently
    stored as "site:<site>:<key>" and every aggregate row is tagged with
    (and read back for) this site — aggregates from different sites never
    mix. `set_site()` switches site and persists it in `active_site`.
    """

    def __init__(self, path: str, site: str = "default"):
        self.path = path
        self.site = site or "default"
        if path != ":memory:":
            os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
        self._wlock = threading.Lock()
        self._conn = sqlite3.connect(path, check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        self._conn.execute("PRAGMA journal_mode=WAL")
        self._conn.execute("PRAGMA synchronous=NORMAL")
        with self._wlock:
            prev = self._schema_version()
            if prev is not None and prev < SCHEMA_VERSION:
                self._pre_migrate_v2()
            self._conn.executescript(SCHEMA)
            # A previous POST /api/site/<id> wins over the env default so a
            # restart keeps the last selected site.
            prow = self._conn.execute(
                "SELECT value FROM config WHERE key='active_site'"
            ).fetchone()
            if prow is not None:
                try:
                    persisted = json.loads(prow["value"])
                except (json.JSONDecodeError, TypeError):
                    persisted = None
                if persisted:
                    self.site = str(persisted)
            if prev is None:
                self._conn.execute(
                    "INSERT INTO schema_version(version) VALUES (?)",
                    (SCHEMA_VERSION,))
                self._conn.commit()
            elif prev < SCHEMA_VERSION:
                self._post_migrate_v2()
                self._conn.execute("DELETE FROM schema_version")
                self._conn.execute(
                    "INSERT INTO schema_version(version) VALUES (?)",
                    (SCHEMA_VERSION,))
                self._conn.commit()
            self._migrate_scoped_config()

    # -- schema migration -----------------------------------------------------
    def _schema_version(self) -> int | None:
        """None when the DB is fresh (no schema_version table). Caller holds
        the write lock; uses the raw connection (query() would deadlock)."""
        t = self._conn.execute(
            "SELECT 1 FROM sqlite_master WHERE type='table'"
            " AND name='schema_version'").fetchone()
        if t is None:
            return None
        row = self._conn.execute(
            "SELECT version FROM schema_version").fetchone()
        return int(row["version"]) if row else 0

    def _table_exists(self, name: str) -> bool:
        return self._conn.execute(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?",
            (name,)).fetchone() is not None

    def _pre_migrate_v2(self) -> None:
        """v1 -> v2, part 1 (before SCHEMA recreates tables): `site` joins
        the PK of minute/visage_minute/jour, which ALTER cannot do — rename
        the old tables aside; rows are copied back in _post_migrate_v2."""
        # the v1 index follows the renamed table; drop it so SCHEMA can
        # recreate it on the new minute table
        self._conn.execute("DROP INDEX IF EXISTS idx_minute_ts")
        for t in ("minute", "visage_minute", "jour"):
            if self._table_exists(t):
                self._conn.execute(f"ALTER TABLE {t} RENAME TO {t}_v1")
        self._conn.commit()

    def _post_migrate_v2(self) -> None:
        """v1 -> v2, part 2: tag existing rows with the active site."""
        for t in ("episode", "session"):
            cols = {r["name"] for r in self._conn.execute(
                f"PRAGMA table_info({t})")}
            if "site" not in cols:
                self._conn.execute(f"ALTER TABLE {t} ADD COLUMN site TEXT")
            self._conn.execute(
                f"UPDATE {t} SET site=? WHERE site IS NULL", (self.site,))
        copies = {
            "minute": ("ts, activity, orientation, n_valid_frames, angles,"
                       " slump, extractor_version, model_version"),
            "visage_minute": ("ts, n_valid, expr_mean, expr_std, pitch_mean,"
                              " smile_episodes, emotions, valence_mean,"
                              " arousal_mean, extractor_version,"
                              " model_version"),
            "jour": ("day, aggregates, coverage, recalibrated,"
                     " extractor_version, model_version"),
        }
        for t, cols in copies.items():
            old = f"{t}_v1"
            if not self._table_exists(old):
                continue
            self._conn.execute(
                f"INSERT OR REPLACE INTO {t}({cols}, site)"
                f" SELECT {cols}, ? FROM {old}", (self.site,))
            self._conn.execute(f"DROP TABLE {old}")
        self._conn.commit()

    def _migrate_scoped_config(self) -> None:
        """Pre-site DBs stored calibration keys unscoped. Copy each one to
        `site:default:<key>` when that scoped key is absent (the unscoped
        row is kept harmlessly). Idempotent, runs on every open."""
        for key in SITE_SCOPED_KEYS:
            row = self._conn.execute(
                "SELECT value FROM config WHERE key=?", (key,)).fetchone()
            if row is None:
                continue
            scoped = f"site:default:{key}"
            exists = self._conn.execute(
                "SELECT 1 FROM config WHERE key=?", (scoped,)).fetchone()
            if exists is None:
                self._conn.execute(
                    "INSERT INTO config(key, value) VALUES (?, ?)",
                    (scoped, row["value"]))
        self._conn.commit()

    # -- generic helpers ------------------------------------------------------
    def _write(self, sql: str, params: tuple = ()) -> None:
        with self._wlock:
            self._conn.execute(sql, params)
            self._conn.commit()

    def query(self, sql: str, params: tuple = ()) -> list[dict[str, Any]]:
        with self._wlock:
            cur = self._conn.execute(sql, params)
            return [dict(r) for r in cur.fetchall()]

    def query_one(self, sql: str, params: tuple = ()) -> dict[str, Any] | None:
        rows = self.query(sql, params)
        return rows[0] if rows else None

    # -- config kv ------------------------------------------------------------
    def _scoped_key(self, key: str) -> str:
        """Per-site keys (floor homography, upright refs) live under
        "site:<site>:<key>"; everything else is global (e.g. active_site)."""
        if key in SITE_SCOPED_KEYS:
            return f"site:{self.site}:{key}"
        return key

    def set_site(self, site: str) -> None:
        """Switch the active site; persisted so a restart keeps it."""
        site = (site or "").strip()
        if not site:
            raise ValueError("empty site id")
        self.site = site
        self.set_config("active_site", site)

    def set_config(self, key: str, value: Any) -> None:
        self._write(
            "INSERT INTO config(key, value) VALUES (?, ?) "
            "ON CONFLICT(key) DO UPDATE SET value=excluded.value",
            (self._scoped_key(key), json.dumps(value)))

    def get_config(self, key: str, default: Any = None) -> Any:
        row = self.query_one("SELECT value FROM config WHERE key=?",
                             (self._scoped_key(key),))
        if row is None:
            return default
        try:
            return json.loads(row["value"])
        except (json.JSONDecodeError, TypeError):
            return row["value"]

    # -- gallery ---------------------------------------------------------------
    def gallery_embeddings(self) -> list[bytes]:
        rows = self.query("SELECT embedding FROM galerie ORDER BY id")
        return [r["embedding"] for r in rows]

    def gallery_count(self) -> int:
        row = self.query_one("SELECT COUNT(*) AS n FROM galerie")
        return int(row["n"]) if row else 0

    def add_gallery(self, embedding: "np.ndarray", gtype: str = "enrolement",
                    created: float | None = None) -> int:
        import numpy as np
        blob = np.asarray(embedding, dtype=np.float32).tobytes()
        with self._wlock:
            cur = self._conn.execute(
                "INSERT INTO galerie(embedding, created, type) VALUES (?,?,?)",
                (blob, created if created is not None else time.time(), gtype))
            self._conn.commit()
            return int(cur.lastrowid)

    def clear_gallery(self) -> int:
        with self._wlock:
            cur = self._conn.execute("DELETE FROM galerie")
            self._conn.commit()
            return cur.rowcount

    # -- rows ------------------------------------------------------------------
    def add_minute(self, ts_ms: int, activity: str | None, orientation: str | None,
                   n_valid: int, angles: dict, slump: float | None,
                   extractor_version: str, model_version: str) -> None:
        self._write(
            "INSERT OR REPLACE INTO minute(ts, site, activity, orientation,"
            " n_valid_frames, angles, slump, extractor_version, model_version)"
            " VALUES (?,?,?,?,?,?,?,?,?)",
            (ts_ms, self.site, activity, orientation, n_valid,
             json.dumps(angles), slump, extractor_version, model_version))

    def add_visage_minute(self, ts_ms: int, n_valid: int, expr_mean: dict,
                          expr_std: dict, pitch_mean: float | None,
                          smile_episodes: int, emotions: dict,
                          valence_mean: float | None, arousal_mean: float | None,
                          extractor_version: str, model_version: str) -> None:
        self._write(
            "INSERT OR REPLACE INTO visage_minute(ts, site, n_valid,"
            " expr_mean, expr_std, pitch_mean, smile_episodes, emotions,"
            " valence_mean, arousal_mean, extractor_version, model_version)"
            " VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
            (ts_ms, self.site, n_valid, json.dumps(expr_mean),
             json.dumps(expr_std), pitch_mean, smile_episodes,
             json.dumps(emotions), valence_mean, arousal_mean,
             extractor_version, model_version))

    def add_identite(self, state: str, score: float | None = None) -> None:
        self._write("INSERT INTO identite(ts, state, score) VALUES (?,?,?)",
                    (_now_ms(), state, score))

    def add_episode(self, ep: dict, variables: dict | None = None,
                    extractor_version: str = "", model_version: str = "") -> int:
        with self._wlock:
            cur = self._conn.execute(
                "INSERT INTO episode(start, end, type, site, orientation,"
                " duration_s, distance_m, n_steps, valid, variables,"
                " extractor_version, model_version)"
                " VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
                (ep["start"], ep["end"], ep["type"], self.site,
                 ep.get("orientation"),
                 ep.get("duration_s"), ep.get("distance_m"), ep.get("n_steps"),
                 int(bool(ep.get("valid", True))),
                 json.dumps(variables or {}), extractor_version, model_version))
            self._conn.commit()
            return int(cur.lastrowid)

    def update_episode_variables(self, episode_id: int,
                                 variables: dict) -> None:
        self._write("UPDATE episode SET variables=? WHERE id=?",
                    (json.dumps(variables), episode_id))

    def start_session(self, simulated: bool, extractor_version: str,
                      model_version: str) -> int:
        with self._wlock:
            cur = self._conn.execute(
                "INSERT INTO session(start, site, simulated,"
                " extractor_version, model_version) VALUES (?,?,?,?,?)",
                (time.time(), self.site, int(simulated), extractor_version,
                 model_version))
            self._conn.commit()
            return int(cur.lastrowid)

    def end_session(self, session_id: int, variables: dict,
                    quality_ok: bool) -> None:
        self._write(
            "UPDATE session SET end=?, variables=?, quality_ok=? WHERE id=?",
            (time.time(), json.dumps(variables), int(quality_ok), session_id))

    def add_day(self, day: str, aggregates: dict, coverage: float,
                recalibrated: bool = False, extractor_version: str = "",
                model_version: str = "") -> None:
        self._write(
            "INSERT OR REPLACE INTO jour(day, site, aggregates, coverage,"
            " recalibrated, extractor_version, model_version)"
            " VALUES (?,?,?,?,?,?,?)",
            (day, self.site, json.dumps(aggregates), coverage,
             int(recalibrated), extractor_version, model_version))

    # -- reads (scoped to the active site) --------------------------------------
    def minutes_since(self, since_ms: int = 0, limit: int = 1440) -> list[dict]:
        return self.query(
            "SELECT * FROM minute WHERE ts>=? AND site=?"
            " ORDER BY ts DESC LIMIT ?",
            (since_ms, self.site, limit))[::-1]

    def visage_minutes_since(self, since_ms: int = 0,
                             limit: int = 1440) -> list[dict]:
        return self.query(
            "SELECT * FROM visage_minute WHERE ts>=? AND site=?"
            " ORDER BY ts DESC LIMIT ?",
            (since_ms, self.site, limit))[::-1]

    def sessions(self) -> list[dict]:
        return self.query(
            "SELECT * FROM session WHERE site=? ORDER BY start DESC",
            (self.site,))

    def episodes(self, since: float = 0.0, limit: int = 500) -> list[dict]:
        return self.query(
            "SELECT * FROM episode WHERE start>=? AND site=?"
            " ORDER BY start DESC LIMIT ?",
            (since, self.site, limit))

    def days(self) -> list[dict]:
        return self.query(
            "SELECT * FROM jour WHERE site=? ORDER BY day DESC",
            (self.site,))

    def identite_log(self, limit: int = 100) -> list[dict]:
        return self.query("SELECT * FROM identite ORDER BY ts DESC LIMIT ?",
                          (limit,))[::-1]

    def stats(self) -> dict[str, Any]:
        g = self.gallery_count()
        m = self.query_one("SELECT COUNT(*) AS n FROM minute WHERE site=?",
                           (self.site,))
        s = self.query_one("SELECT COUNT(*) AS n FROM session WHERE site=?",
                           (self.site,))
        e = self.query_one("SELECT COUNT(*) AS n FROM episode WHERE site=?",
                           (self.site,))
        return {"site": self.site, "gallery_size": g,
                "minute_rows": m["n"] if m else 0,
                "sessions": s["n"] if s else 0, "episodes": e["n"] if e else 0}

    def close(self) -> None:
        with self._wlock:
            self._conn.close()
