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
    persona_id TEXT NOT NULL,
    day        TEXT NOT NULL,
    n_windows  INTEGER NOT NULL,
    metrics    TEXT NOT NULL,   -- JSON: mean of the deterministic metrics
    scores     TEXT NOT NULL,   -- JSON: {dimension: mean score}
    updated    TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (persona_id, day)
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

    def aggregate_day(self, persona_id: str, day: str) -> None:
        """Rebuild one (persona, day) aggregate from its windows — per-person
        series are the unit of drift tracking, never a merged household day."""
        rows = self.db.execute(
            "SELECT metrics, scores FROM windows"
            " WHERE persona_id=? AND day=?", (persona_id, day)).fetchall()
        if not rows:
            return
        dim_means: dict[str, float] = {}
        for d in DIMENSIONS:
            vals = [json.loads(s)[d]["score"] for _, s in rows]
            dim_means[d] = round(statistics.fmean(vals), 2)
        metric_means = _mean_metrics([json.loads(m) for m, _ in rows])
        self.db.execute(
            "INSERT INTO days (persona_id, day, n_windows, metrics, scores,"
            " updated) VALUES (?,?,?,?,?,datetime('now'))"
            " ON CONFLICT(persona_id, day) DO UPDATE SET"
            " n_windows=excluded.n_windows, metrics=excluded.metrics,"
            " scores=excluded.scores, updated=excluded.updated",
            (persona_id, day, len(rows), json.dumps(metric_means),
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
    def _day_rows(self, day: str, persona: str | None) -> list[tuple]:
        if persona is None:
            return self.db.execute(
                "SELECT n_windows, metrics, scores FROM days WHERE day=?",
                (day,)).fetchall()
        return self.db.execute(
            "SELECT n_windows, metrics, scores FROM days"
            " WHERE day=? AND persona_id=?", (day, persona)).fetchall()

    def day_scores(self, day: str, persona: str | None = None) -> dict | None:
        """Mean scores + metrics for one day. persona=None merges all
        personas of that day weighted by window count — sensible only in a
        single-patient deployment."""
        rows = self._day_rows(day, persona)
        if not rows:
            return None
        return {"day": day, **(_merge_day_rows(rows) if len(rows) > 1 else
                {"n_windows": rows[0][0], "metrics": json.loads(rows[0][1]),
                 "scores": json.loads(rows[0][2])})}

    def days(self, persona: str | None = None, limit: int = 90) -> list[str]:
        if persona is None:
            rows = self.db.execute(
                "SELECT DISTINCT day FROM days ORDER BY day DESC LIMIT ?",
                (limit,)).fetchall()
        else:
            rows = self.db.execute(
                "SELECT day FROM days WHERE persona_id=?"
                " ORDER BY day DESC LIMIT ?", (persona, limit)).fetchall()
        return [r[0] for r in rows]

    def drift_index(self, day: str, persona: str | None = None,
                    baseline_days: int = 28) -> dict | None:
        """Deviation of `day` vs the rolling baseline of the baseline_days
        previous days — the product's actual output. z-scores per dimension,
        plus a composite. Positive z = above baseline (better); negative =
        drift downward. persona=None uses the merged day (single-patient
        deployments)."""
        today = self.day_scores(day, persona)
        if not today:
            return None
        today_scores = today["scores"]
        if persona is None:
            rows = self.db.execute(
                "SELECT day, n_windows, scores FROM days WHERE day < ?"
                " ORDER BY day DESC", (day,)).fetchall()
            by_day: dict[str, list[tuple]] = {}
            for d, n, s in rows:
                (by_day.setdefault(d, []).append((n, s)))
                if len(by_day) > baseline_days:
                    break
            base_scores = [json.loads(rs[0][1]) if len(rs) == 1 else
                           _merge_day_rows([(n, "{}", s) for n, s in rs])["scores"]
                           for rs in list(by_day.values())[:baseline_days]]
        else:
            rows = self.db.execute(
                "SELECT scores FROM days WHERE persona_id=? AND day < ?"
                " ORDER BY day DESC LIMIT ?", (persona, day,
                                              baseline_days)).fetchall()
            base_scores = [json.loads(s) for (s,) in rows]
        baseline: dict[str, dict[str, Any]] = {}
        out_z: dict[str, float | None] = {}
        for d in DIMENSIONS:
            vals = [s[d] for s in base_scores]
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
            "persona": persona,
            "scores": today_scores,
            "z": out_z,
            "composite_z": composite,
            "baseline": baseline,
            "baseline_days": baseline_days,
            "warning": warning,
        }


def _merge_day_rows(rows: list[tuple]) -> dict:
    """Merge (n_windows, metrics_json, scores_json) day rows of several
    personas into one — window-count weighted means."""
    total = sum(r[0] for r in rows) or 1
    scores = {
        d: round(sum(json.loads(s)[d] * n for n, _, s in rows) / total, 2)
        for d in DIMENSIONS}
    metrics = _mean_metrics([json.loads(m) for _, m, _ in rows])
    return {"n_windows": total, "metrics": metrics, "scores": scores}


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
