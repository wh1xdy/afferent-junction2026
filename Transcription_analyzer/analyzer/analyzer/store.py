"""SQLite aggregates — same pattern as posture-analysis: raw transcripts are
discarded upstream, only metrics + scores persist.
"""
from __future__ import annotations

import json
import sqlite3
import statistics
from pathlib import Path
from typing import Any

from .scoring import DIMENSIONS, WindowScore

_SCHEMA = """
CREATE TABLE IF NOT EXISTS windows (
    id          INTEGER PRIMARY KEY,
    record_id   TEXT NOT NULL,
    seq         INTEGER NOT NULL,
    source      TEXT NOT NULL,
    persona_id  TEXT,
    day         TEXT NOT NULL,
    trajectory  TEXT,
    n_turns     INTEGER,
    metrics     TEXT NOT NULL,
    scores      TEXT NOT NULL,
    created     TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(record_id, seq)
);
CREATE INDEX IF NOT EXISTS ix_windows_day ON windows(day);

CREATE TABLE IF NOT EXISTS days (
    day        TEXT PRIMARY KEY,
    n_windows  INTEGER NOT NULL,
    metrics    TEXT NOT NULL,   -- JSON: mean of the deterministic metrics
    scores     TEXT NOT NULL,   -- JSON: {dimension: mean score}
    updated    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS meta (
    k TEXT PRIMARY KEY,
    v TEXT
);
"""


class Store:
    def __init__(self, path: str | Path):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.db = sqlite3.connect(self.path)
        self.db.executescript(_SCHEMA)

    def close(self) -> None:
        self.db.close()

    def __enter__(self) -> "Store":
        return self

    def __exit__(self, *exc) -> bool:
        self.close()
        return False

    # ------------------------------------------------------------- writes
    def has_window(self, record_id: str, seq: int) -> bool:
        row = self.db.execute(
            "SELECT 1 FROM windows WHERE record_id=? AND seq=?",
            (record_id, seq)).fetchone()
        return row is not None

    def record_window(self, *, record_id: str, seq: int, source: str,
                      persona_id: str, day: str, trajectory: str,
                      n_turns: int, metrics: dict,
                      scores: WindowScore) -> None:
        self.db.execute(
            "INSERT OR IGNORE INTO windows"
            " (record_id, seq, source, persona_id, day, trajectory, n_turns,"
            "  metrics, scores) VALUES (?,?,?,?,?,?,?,?,?)",
            (record_id, seq, source, persona_id, day, trajectory, n_turns,
             json.dumps(metrics), scores.model_dump_json()))
        self.db.commit()

    def aggregate_day(self, day: str) -> None:
        rows = self.db.execute(
            "SELECT metrics, scores FROM windows WHERE day=?", (day,)).fetchall()
        if not rows:
            return
        dim_means: dict[str, float] = {}
        for d in DIMENSIONS:
            vals = [json.loads(s)[d]["score"] for _, s in rows]
            dim_means[d] = round(statistics.fmean(vals), 2)
        metric_means = _mean_metrics([json.loads(m) for m, _ in rows])
        self.db.execute(
            "INSERT INTO days (day, n_windows, metrics, scores, updated)"
            " VALUES (?,?,?,?,datetime('now'))"
            " ON CONFLICT(day) DO UPDATE SET n_windows=excluded.n_windows,"
            " metrics=excluded.metrics, scores=excluded.scores,"
            " updated=excluded.updated",
            (day, len(rows), json.dumps(metric_means),
             json.dumps(dim_means)))
        self.db.commit()

    def set_meta(self, k: str, v: str) -> None:
        self.db.execute(
            "INSERT INTO meta (k,v) VALUES (?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v",
            (k, v))
        self.db.commit()

    def get_meta(self, k: str) -> str | None:
        row = self.db.execute("SELECT v FROM meta WHERE k=?", (k,)).fetchone()
        return row[0] if row else None

    # -------------------------------------------------------------- reads
    def day_scores(self, day: str) -> dict | None:
        row = self.db.execute(
            "SELECT n_windows, metrics, scores FROM days WHERE day=?",
            (day,)).fetchone()
        if not row:
            return None
        return {"day": day, "n_windows": row[0],
                "metrics": json.loads(row[1]), "scores": json.loads(row[2])}

    def days(self, limit: int = 90) -> list[str]:
        rows = self.db.execute(
            "SELECT day FROM days ORDER BY day DESC LIMIT ?", (limit,)).fetchall()
        return [r[0] for r in rows]

    def drift_index(self, day: str, baseline_days: int = 28) -> dict | None:
        """Deviation of `day` vs the rolling baseline of the baseline_days
        previous days — the product's actual output. z-scores per dimension,
        plus a composite. Positive z = above baseline (better); negative =
        drift downward."""
        today = self.db.execute(
            "SELECT scores FROM days WHERE day=?", (day,)).fetchone()
        if not today:
            return None
        today_scores = json.loads(today[0])
        rows = self.db.execute(
            "SELECT scores FROM days WHERE day < ? ORDER BY day DESC LIMIT ?",
            (day, baseline_days)).fetchall()
        baseline: dict[str, dict[str, Any]] = {}
        out_z: dict[str, float | None] = {}
        for d in DIMENSIONS:
            vals = [json.loads(s)[d] for (s,) in rows]
            if len(vals) < 3:
                baseline[d] = {"n": len(vals)}
                out_z[d] = None
                continue
            mean = statistics.fmean(vals)
            std = statistics.stdev(vals) if len(vals) > 1 else 0.0
            baseline[d] = {"n": len(vals), "mean": round(mean, 2),
                           "std": round(std, 3)}
            delta = today_scores[d] - mean
            out_z[d] = round(delta / std, 2) if std > 1e-6 else \
                (0.0 if abs(delta) < 1e-6 else (-5.0 if delta < 0 else 5.0))
        zvals = [z for z in out_z.values() if z is not None]
        composite = round(statistics.fmean(zvals), 2) if zvals else None
        warning = ("insufficient_baseline" if composite is None
                   else "elevated" if composite < -1.5 else "ok")
        return {
            "day": day,
            "scores": today_scores,
            "z": out_z,
            "composite_z": composite,
            "baseline": baseline,
            "baseline_days": baseline_days,
            "warning": warning,
        }


def _mean_metrics(ms: list[dict]) -> dict:
    """Average the numeric metrics across windows; nested dicts recurse."""
    out: dict[str, Any] = {}
    if not ms:
        return out
    keys = ms[0].keys()
    for k in keys:
        vals = [m[k] for m in ms]
        if all(isinstance(v, dict) or v is None for v in vals):
            subs = [v for v in vals if isinstance(v, dict)]
            out[k] = _mean_metrics(subs) if subs else None
        else:
            nums = [v for v in vals if isinstance(v, (int, float))]
            out[k] = round(statistics.fmean(nums), 3) if nums else None
    return out
