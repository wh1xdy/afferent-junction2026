"""SQLite storage + query layer.

Tables
  metric     catalog (built-ins + runtime registrations)
  sample     raw point measurements, PK (metric, source, ts): re-sending the same
             sample (producer retry after a timeout) overwrites instead of duplicating
  event      intervals (presence.home, presence.guest_visit …), upserted on
             (source, kind, ext_id) so a producer can open an interval and later
             re-send it with its end
  daily      per local day, per (metric, source) and per metric across all
             sources (source='*'): n, mean, std, percentiles, hours covered.
             Kept forever; raw samples are pruned after RAW_RETENTION_DAYS.
  dirty      (metric, day) pairs whose daily row must be recomputed

Single writer (one connection + lock), WAL mode, one read connection per thread.
"""
from __future__ import annotations

import json
import logging
import math
import os
import re
import sqlite3
import threading
import time
from typing import Any, Iterable

import catalog
import stats
import timeutil as tu

log = logging.getLogger("data_manager.store")

SCHEMA_VERSION = 1
SOURCE_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._/:-]{0,63}$")
EXT_ID_RE = re.compile(r"^[A-Za-z0-9._:/-]{1,128}$")
MAX_META_BYTES = 4096
MAX_RAW_ROWS = 100_000
MAX_STATS_ROWS = 1_000_000
READ_ROLLUP_MAX_AGE_S = 5.0   # daily rows of the running day may lag writes by this much

SCHEMA = """
CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS metric (
    name TEXT PRIMARY KEY,
    kind TEXT NOT NULL,                -- 'sample' | 'interval'
    unit TEXT,
    min REAL,
    max REAL,
    description TEXT,
    builtin INTEGER NOT NULL DEFAULT 0,
    created INTEGER NOT NULL,          -- epoch ms
    baseline_min_hours REAL            -- NULL = catalog.DEFAULT_BASELINE_MIN_HOURS
);
CREATE TABLE IF NOT EXISTS sample (
    metric TEXT NOT NULL,
    source TEXT NOT NULL,
    ts INTEGER NOT NULL,               -- epoch ms (measurement time)
    value REAL NOT NULL,
    quality REAL,                      -- optional, producer-defined (0..1, SNR dB …)
    meta TEXT,                         -- optional JSON object
    received INTEGER NOT NULL,         -- epoch ms (server time)
    PRIMARY KEY (metric, source, ts)
) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS idx_sample_metric_ts ON sample(metric, ts);
CREATE INDEX IF NOT EXISTS idx_sample_ts ON sample(ts);
CREATE TABLE IF NOT EXISTS event (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kind TEXT NOT NULL,
    source TEXT NOT NULL,
    ext_id TEXT NOT NULL,              -- producer's id; defaults to the start ms
    start INTEGER NOT NULL,            -- epoch ms
    end INTEGER,                       -- epoch ms, NULL = still ongoing
    value REAL,
    meta TEXT,
    received INTEGER NOT NULL,
    UNIQUE (source, kind, ext_id)
);
CREATE INDEX IF NOT EXISTS idx_event_kind_start ON event(kind, start);
CREATE TABLE IF NOT EXISTS daily (
    metric TEXT NOT NULL,
    source TEXT NOT NULL,              -- '*' = all sources pooled
    day TEXT NOT NULL,                 -- local YYYY-MM-DD
    n INTEGER, mean REAL, std REAL, min REAL, p10 REAL, p25 REAL, median REAL,
    p75 REAL, p90 REAL, max REAL,
    hours_covered INTEGER,             -- distinct local hours with >= 1 sample (0..24)
    first_ts INTEGER, last_ts INTEGER,
    updated INTEGER,
    PRIMARY KEY (metric, source, day)
);
CREATE TABLE IF NOT EXISTS dirty (
    metric TEXT NOT NULL,
    day TEXT NOT NULL,
    PRIMARY KEY (metric, day)
);
CREATE TABLE IF NOT EXISTS config (key TEXT PRIMARY KEY, value TEXT);
"""

DAILY_FIELDS = ("n", "mean", "std", "min", "p10", "p25", "median", "p75", "p90", "max")


class IngestError(ValueError):
    pass


def _echo(item, key):
    """The offending field, for the rejection report (short, JSON-safe)."""
    if not isinstance(item, dict):
        return None
    v = item.get(key)
    return v if v is None or isinstance(v, str) else repr(v)[:80]


def _reason(e: Exception) -> str:
    return str(e) if isinstance(e, IngestError) else f"invalid item: {type(e).__name__}: {e}"[:200]


def _finite(v) -> bool:
    return isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v)


class Store:
    def __init__(self, path: str, tz_name: str | None = None, retention_days: float = 180,
                 max_future_s: float = 300):
        self.path = path
        self.tz = tu.get_tz(tz_name)
        self.tz_name = tz_name or "UTC"
        self.retention_days = float(retention_days or 0)
        self.max_future_ms = int(max_future_s * 1000)
        if path != ":memory:":
            os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
        self._wlock = threading.RLock()
        self._w = self._connect()
        self._local = threading.local()
        with self._wlock:
            self._w.executescript(SCHEMA)
            if self._w.execute("SELECT 1 FROM schema_version").fetchone() is None:
                self._w.execute("INSERT INTO schema_version(version) VALUES (?)", (SCHEMA_VERSION,))
            now = tu.now_ms()
            cols = {r["name"] for r in self._w.execute("PRAGMA table_info(metric)")}
            if "baseline_min_hours" not in cols:          # DB created by v0.1.0
                self._w.execute("ALTER TABLE metric ADD COLUMN baseline_min_hours REAL")
            for name, d in catalog.BUILTIN.items():
                self._w.execute(
                    "INSERT INTO metric(name, kind, unit, min, max, description, builtin, created,"
                    " baseline_min_hours) VALUES (?,?,?,?,?,?,1,?,?) ON CONFLICT(name) DO UPDATE SET"
                    " kind=excluded.kind, unit=excluded.unit, min=excluded.min, max=excluded.max,"
                    " description=excluded.description, builtin=1,"
                    " baseline_min_hours=excluded.baseline_min_hours",
                    (name, d["kind"], d["unit"], d["min"], d["max"], d["description"], now,
                     d.get("baseline_min_hours")))
            # a metric dropped from the catalog keeps its data but becomes a regular one
            marks = ",".join("?" * len(catalog.BUILTIN))
            self._w.execute(f"UPDATE metric SET builtin=0 WHERE builtin=1 AND name NOT IN ({marks})",
                            tuple(catalog.BUILTIN))
            self._w.commit()
        self._metrics_cache: dict[str, dict] | None = None
        self._last_rollup = 0.0

    # ── connections ──────────────────────────────────────────────────────────
    def _connect(self) -> sqlite3.Connection:
        c = sqlite3.connect(self.path, check_same_thread=False, timeout=30)
        c.row_factory = sqlite3.Row
        if self.path != ":memory:":
            c.execute("PRAGMA journal_mode=WAL")
        c.execute("PRAGMA synchronous=NORMAL")
        return c

    def _r(self) -> sqlite3.Connection:
        if self.path == ":memory:":
            return self._w
        c = getattr(self._local, "conn", None)
        if c is None:
            c = self._local.conn = self._connect()
        return c

    def _q(self, sql: str, args: Iterable = ()) -> list[dict]:
        if self.path == ":memory:":
            with self._wlock:
                return [dict(r) for r in self._w.execute(sql, tuple(args))]
        return [dict(r) for r in self._r().execute(sql, tuple(args))]

    def close(self):
        with self._wlock:
            self._w.close()

    # ── catalog ──────────────────────────────────────────────────────────────
    def metrics(self) -> dict[str, dict]:
        if self._metrics_cache is None:
            rows = self._q("SELECT * FROM metric ORDER BY name")
            self._metrics_cache = {r["name"]: r for r in rows}
        return self._metrics_cache

    def metric(self, name: str, kind: str | None = None) -> dict:
        if not isinstance(name, str):
            raise IngestError("metric must be a string")
        m = self.metrics().get(name)
        if m is None:
            raise IngestError(f"unknown metric {name!r} (register it with POST /api/v1/metrics)")
        if kind and m["kind"] != kind:
            raise IngestError(f"metric {name!r} is a {m['kind']}, not a {kind}")
        return m

    def register_metric(self, name: str, definition: dict) -> dict:
        d = catalog.validate_definition(name, definition)
        with self._wlock:
            existing = self._w.execute("SELECT * FROM metric WHERE name=?", (name,)).fetchone()
            if existing and existing["builtin"]:
                raise IngestError(f"{name!r} is a built-in metric and cannot be redefined")
            if existing and existing["kind"] != d["kind"]:
                raise IngestError(f"{name!r} already exists as a {existing['kind']}")
            self._w.execute(
                "INSERT INTO metric(name, kind, unit, min, max, description, builtin, created,"
                " baseline_min_hours) VALUES (?,?,?,?,?,?,0,?,?) ON CONFLICT(name) DO UPDATE SET"
                " unit=excluded.unit, min=excluded.min, max=excluded.max,"
                " description=excluded.description, baseline_min_hours=excluded.baseline_min_hours",
                (name, d["kind"], d["unit"], d["min"], d["max"], d["description"], tu.now_ms(),
                 d["baseline_min_hours"]))
            self._w.commit()
            self._metrics_cache = None
        return self.metrics()[name]

    # ── validation helpers ───────────────────────────────────────────────────
    def _source(self, s) -> str:
        if not isinstance(s, str) or not SOURCE_RE.match(s):
            raise IngestError("source must be 1-64 chars [A-Za-z0-9._/:-], e.g. 'modulino-hub/finger1'")
        return s

    @staticmethod
    def _meta(m) -> str | None:
        if m is None:
            return None
        if not isinstance(m, dict):
            raise IngestError("meta must be a JSON object")
        s = json.dumps(m, separators=(",", ":"))
        if len(s) > MAX_META_BYTES:
            raise IngestError(f"meta larger than {MAX_META_BYTES} bytes")
        return s

    def _check_range(self, m: dict, value) -> float:
        if not _finite(value):
            raise IngestError("value must be a finite number")
        if m["min"] is not None and value < m["min"]:
            raise IngestError(f"value {value} below plausible minimum {m['min']} {m['unit']}")
        if m["max"] is not None and value > m["max"]:
            raise IngestError(f"value {value} above plausible maximum {m['max']} {m['unit']}")
        return float(value)

    def retention_cutoff(self, now: int | None = None) -> int | None:
        if self.retention_days <= 0:
            return None
        return (tu.now_ms() if now is None else now) - int(self.retention_days * 86_400_000)

    def _check_ts(self, ts, now: int) -> int:
        try:
            t = tu.parse_ts(ts)
        except ValueError as e:
            raise IngestError(str(e)) from None
        if t > now + self.max_future_ms:
            raise IngestError("timestamp is in the future (check the producer's clock)")
        cutoff = self.retention_cutoff(now)
        if cutoff is not None and t < cutoff:
            raise IngestError("timestamp older than the raw retention window")
        return t

    # ── ingestion ────────────────────────────────────────────────────────────
    def add_samples(self, items: list[dict], default_source: str | None = None) -> dict:
        """Validate and upsert samples. Invalid items are reported, valid ones kept.

        Two items of one batch with the same (metric, source, ts) are one sample: the
        later one wins and the earlier one is reported in `rejected`, so `accepted`
        is the number of rows actually stored. Items without `ts` all get the receipt
        time, which is why a batch should always carry timestamps.
        """
        now = tu.now_ms()
        by_key: dict[tuple, tuple[int, tuple, list]] = {}
        rejected = []
        for i, it in enumerate(items):
            try:
                if not isinstance(it, dict):
                    raise IngestError("each sample must be an object")
                m = self.metric(it.get("metric"), catalog.SAMPLE)
                src = self._source(it.get("source") or default_source)
                value = self._check_range(m, it.get("value"))
                ts = self._check_ts(it.get("ts", now), now)
                q = it.get("quality")
                if q is not None and not _finite(q):
                    raise IngestError("quality must be a number")
                row = (m["name"], src, ts, value, q, self._meta(it.get("meta")), now)
                key = (m["name"], src, ts)
                losers = by_key[key][2] + [by_key[key][0]] if key in by_key else []
                by_key[key] = (i, row, losers)
            except (IngestError, TypeError, ValueError, OverflowError) as e:
                rejected.append({"index": i, "metric": _echo(it, "metric"), "reason": _reason(e)})
        for winner, row, losers in by_key.values():
            for j in losers:
                rejected.append({"index": j, "metric": row[0],
                                 "reason": f"overwritten by item {winner}: same metric, source and ts "
                                           "(send a distinct ts per sample)"})
        rows = [r for _, r, _ in by_key.values()]
        dirty = {(r[0], tu.day_of(r[2], self.tz)) for r in rows}
        rejected.sort(key=lambda r: r["index"])
        if rows:
            with self._wlock:
                self._w.executemany(
                    "INSERT INTO sample(metric, source, ts, value, quality, meta, received)"
                    " VALUES (?,?,?,?,?,?,?) ON CONFLICT(metric, source, ts) DO UPDATE SET"
                    " value=excluded.value, quality=excluded.quality, meta=excluded.meta,"
                    " received=excluded.received", rows)
                self._w.executemany("INSERT OR IGNORE INTO dirty(metric, day) VALUES (?,?)", dirty)
                self._w.commit()
        return {"accepted": len(rows), "rejected": rejected, "server_time": now}

    def upsert_events(self, items: list[dict], default_source: str | None = None) -> dict:
        now = tu.now_ms()
        out, rejected = [], []
        with self._wlock:
            for i, it in enumerate(items):
                try:
                    if not isinstance(it, dict):
                        raise IngestError("each event must be an object")
                    m = self.metric(it.get("kind"), catalog.INTERVAL)
                    src = self._source(it.get("source") or default_source)
                    try:
                        start = tu.parse_ts(it.get("start"))
                        end = None if it.get("end") is None else tu.parse_ts(it.get("end"))
                    except ValueError as e:
                        raise IngestError(str(e)) from None
                    if start > now + self.max_future_ms or (end and end > now + self.max_future_ms):
                        raise IngestError("event in the future (check the producer's clock)")
                    if end is not None and end < start:
                        raise IngestError("end before start")
                    value = it.get("value")
                    if value is not None:
                        value = self._check_range(m, value)
                    ext = str(it.get("id") if it.get("id") is not None else start)
                    if not EXT_ID_RE.match(ext):
                        raise IngestError("id must be 1-128 chars [A-Za-z0-9._:/-]")
                    self._w.execute(
                        "INSERT INTO event(kind, source, ext_id, start, end, value, meta, received)"
                        " VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(source, kind, ext_id) DO UPDATE SET"
                        " start=excluded.start, end=excluded.end,"
                        " value=COALESCE(excluded.value, event.value),"
                        " meta=COALESCE(excluded.meta, event.meta), received=excluded.received",
                        (m["name"], src, ext, start, end, value, self._meta(it.get("meta")), now))
                    row = self._w.execute("SELECT id FROM event WHERE source=? AND kind=? AND ext_id=?",
                                          (src, m["name"], ext)).fetchone()
                    out.append({"index": i, "id": row["id"], "ext_id": ext})
                except (IngestError, TypeError, ValueError, OverflowError) as e:
                    rejected.append({"index": i, "kind": _echo(it, "kind"), "reason": _reason(e)})
            self._w.commit()
        return {"accepted": len(out), "events": out, "rejected": rejected, "server_time": now}

    def delete_event(self, event_id: int) -> bool:
        with self._wlock:
            n = self._w.execute("DELETE FROM event WHERE id=?", (event_id,)).rowcount
            self._w.commit()
        return n > 0

    # ── maintenance ──────────────────────────────────────────────────────────
    def rollup_dirty(self, max_age_s: float = 0) -> int:
        """Recompute daily rows for every (metric, day) touched since the last run.

        Read endpoints pass max_age_s so that, under a steady stream of writes, the
        running day is recomputed at most every few seconds instead of on every query.
        """
        if max_age_s and time.monotonic() - self._last_rollup < max_age_s:
            return 0
        with self._wlock:
            self._last_rollup = time.monotonic()
            pairs = [(r["metric"], r["day"]) for r in
                     self._w.execute("SELECT metric, day FROM dirty").fetchall()]
            for metric, day in pairs:
                self._rollup_day(metric, day)
                self._w.execute("DELETE FROM dirty WHERE metric=? AND day=?", (metric, day))
            if pairs:
                self._w.commit()
        return len(pairs)

    def _rollup_day(self, metric: str, day: str):
        lo, hi = tu.day_bounds(day, self.tz)
        rows = self._w.execute("SELECT source, ts, value FROM sample WHERE metric=? AND ts>=? AND ts<?"
                               " ORDER BY ts", (metric, lo, hi)).fetchall()
        self._w.execute("DELETE FROM daily WHERE metric=? AND day=?", (metric, day))
        if not rows:
            return
        groups: dict[str, list] = {"*": list(rows)}
        for r in rows:
            groups.setdefault(r["source"], []).append(r)
        now = tu.now_ms()
        for src, rs in groups.items():
            d = stats.describe([r["value"] for r in rs], nd=4)
            hours = len({tu.local_hour(r["ts"], self.tz) for r in rs})
            self._w.execute(
                "INSERT INTO daily(metric, source, day, n, mean, std, min, p10, p25, median, p75, p90,"
                " max, hours_covered, first_ts, last_ts, updated) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                (metric, src, day, *(d[f] for f in DAILY_FIELDS), hours, rs[0]["ts"], rs[-1]["ts"], now))

    def prune(self) -> int:
        """Drop raw samples older than the retention window (their daily rows stay)."""
        cutoff = self.retention_cutoff()
        if cutoff is None:
            return 0
        self.rollup_dirty()
        with self._wlock:
            n = self._w.execute("DELETE FROM sample WHERE ts < ?", (cutoff,)).rowcount
            self._w.commit()
        if n:
            log.info("pruned %d raw samples older than %.0f days", n, self.retention_days)
        return n

    # ── sample queries ───────────────────────────────────────────────────────
    @staticmethod
    def _where(metric, source, frm, to, min_quality=None):
        sql, args = ["metric=?"], [metric]
        if source:
            sql.append("source=?")
            args.append(source)
        if frm is not None:
            sql.append("ts>=?")
            args.append(frm)
        if to is not None:
            sql.append("ts<=?")
            args.append(to)
        if min_quality is not None:
            sql.append("quality>=?")
            args.append(min_quality)
        return " AND ".join(sql), args

    def samples(self, metric, source=None, frm=None, to=None, limit=1000, order="desc",
                min_quality=None) -> list[dict]:
        self.metric(metric, catalog.SAMPLE)
        w, a = self._where(metric, source, frm, to, min_quality)
        limit = max(1, min(int(limit), MAX_RAW_ROWS))
        o = "ASC" if order == "asc" else "DESC"
        rows = self._q(f"SELECT ts, source, value, quality, meta FROM sample WHERE {w}"
                       f" ORDER BY ts {o} LIMIT ?", (*a, limit))
        for r in rows:
            r["meta"] = json.loads(r["meta"]) if r["meta"] else None
        return rows

    def latest(self) -> list[dict]:
        rows = self._q("SELECT s.metric, s.source, s.ts, s.value, s.quality, s.received FROM sample s"
                       " JOIN (SELECT metric, source, MAX(ts) AS ts FROM sample GROUP BY metric, source) l"
                       " USING (metric, source, ts) ORDER BY s.metric, s.source")
        for r in rows:
            r["unit"] = self.metrics().get(r["metric"], {}).get("unit")
            # receipt - measurement time: a few seconds is normal (client batching);
            # a large, steady lag means the producer's clock is slow
            r["lag_s"] = round((r.pop("received") - r["ts"]) / 1000, 1)
        return rows

    def sources(self, metric, frm=None, to=None) -> list[str]:
        """Distinct sources of a sample metric in [frm, to] (for pooled-result warnings)."""
        w, a = self._where(metric, None, frm, to)
        return [r["source"] for r in self._q(f"SELECT DISTINCT source FROM sample WHERE {w}"
                                              " ORDER BY source", a)]

    def counts(self) -> dict[str, dict]:
        out = {}
        for r in self._q("SELECT metric, COUNT(*) n, MIN(ts) first, MAX(ts) last FROM sample GROUP BY metric"):
            out[r["metric"]] = {"n": r["n"], "first_ts": r["first"], "last_ts": r["last"]}
        for r in self._q("SELECT kind, COUNT(*) n, MIN(start) first, MAX(start) last FROM event GROUP BY kind"):
            out[r["kind"]] = {"n": r["n"], "first_ts": r["first"], "last_ts": r["last"]}
        return out

    def series(self, metric, source=None, frm=None, to=None, bucket_ms=3_600_000,
               min_quality=None) -> list[dict]:
        self.metric(metric, catalog.SAMPLE)
        w, a = self._where(metric, source, frm, to, min_quality)
        return self._q(f"SELECT (ts / ?) * ? AS ts, COUNT(*) AS n, AVG(value) AS mean,"
                       f" MIN(value) AS min, MAX(value) AS max FROM sample WHERE {w}"
                       f" GROUP BY ts / ? ORDER BY 1", (bucket_ms, bucket_ms, *a, bucket_ms))

    def values(self, metric, source=None, frm=None, to=None, min_quality=None) -> tuple[list[float], bool]:
        self.metric(metric, catalog.SAMPLE)
        w, a = self._where(metric, source, frm, to, min_quality)
        rows = self._q(f"SELECT value FROM sample WHERE {w} LIMIT ?", (*a, MAX_STATS_ROWS + 1))
        capped = len(rows) > MAX_STATS_ROWS
        return [r["value"] for r in rows[:MAX_STATS_ROWS]], capped

    def hour_profile(self, metric, source=None, frm=None, to=None) -> list[dict]:
        """Mean per local hour of day (circadian profile)."""
        self.metric(metric, catalog.SAMPLE)
        w, a = self._where(metric, source, frm, to)
        rows = self._q(f"SELECT ts / 3600000 AS h, COUNT(*) n, SUM(value) s, MIN(value) mn, MAX(value) mx"
                       f" FROM sample WHERE {w} GROUP BY ts / 3600000", a)
        acc = {h: {"n": 0, "s": 0.0, "min": None, "max": None, "hours": 0} for h in range(24)}
        for r in rows:
            b = acc[tu.local_hour(r["h"] * 3_600_000 + 1_800_000, self.tz)]
            b["n"] += r["n"]
            b["s"] += r["s"]
            b["hours"] += 1
            b["min"] = r["mn"] if b["min"] is None else min(b["min"], r["mn"])
            b["max"] = r["mx"] if b["max"] is None else max(b["max"], r["mx"])
        return [{"hour": h, "n": b["n"], "hours_observed": b["hours"],
                 "mean": round(b["s"] / b["n"], 3) if b["n"] else None,
                 "min": b["min"], "max": b["max"]} for h, b in acc.items()]

    def daily(self, metric, source=None, from_day=None, to_day=None) -> list[dict]:
        self.metric(metric, catalog.SAMPLE)
        self.rollup_dirty(max_age_s=READ_ROLLUP_MAX_AGE_S)
        sql, args = ["metric=?", "source=?"], [metric, source or "*"]
        if from_day:
            sql.append("day>=?")
            args.append(from_day)
        if to_day:
            sql.append("day<=?")
            args.append(to_day)
        rows = self._q(f"SELECT day, {', '.join(DAILY_FIELDS)}, hours_covered, first_ts, last_ts"
                       f" FROM daily WHERE {' AND '.join(sql)} ORDER BY day", args)
        for r in rows:
            for f in DAILY_FIELDS[1:]:
                if r[f] is not None:
                    r[f] = round(r[f], 3)
        return rows

    # ── event queries ────────────────────────────────────────────────────────
    def events(self, kind=None, source=None, frm=None, to=None, limit=1000) -> list[dict]:
        sql, args = [], []
        if kind:
            self.metric(kind, catalog.INTERVAL)
            sql.append("kind=?")
            args.append(kind)
        if source:
            sql.append("source=?")
            args.append(source)
        if to is not None:
            sql.append("start<=?")
            args.append(to)
        if frm is not None:
            sql.append("(end IS NULL OR end>=?)")
            args.append(frm)
        w = ("WHERE " + " AND ".join(sql)) if sql else ""
        rows = self._q(f"SELECT id, kind, source, ext_id, start, end, value, meta FROM event {w}"
                       f" ORDER BY start DESC LIMIT ?", (*args, max(1, min(int(limit), MAX_RAW_ROWS))))
        now = tu.now_ms()
        for r in rows:
            r["meta"] = json.loads(r["meta"]) if r["meta"] else None
            r["ongoing"] = r["end"] is None
            r["duration_min"] = round(((r["end"] or now) - r["start"]) / 60000, 1)
        return rows

    def events_daily(self, kind, source=None, from_day=None, to_day=None) -> list[dict]:
        """Per local day: occurrences (intervals starting that day), minutes covered
        (union of intervals clipped to the day — overlaps are not double counted;
        ongoing intervals run until now), mean/max value."""
        self.metric(kind, catalog.INTERVAL)
        now = tu.now_ms()
        today = tu.day_of(now, self.tz)
        to_day = min(to_day or today, today)
        from_day = from_day or to_day
        # Days before this kind was ever reported are "no data", not "0 minutes".
        fsql, fargs = "SELECT MIN(start) AS s FROM event WHERE kind=?", [kind]
        if source:
            fsql += " AND source=?"
            fargs.append(source)
        first = self._q(fsql, fargs)[0]["s"]
        if first is None:
            return []
        from_day = max(from_day, tu.day_of(first, self.tz))
        days = [d for d in tu.days_between(tu.day_bounds(from_day, self.tz)[0],
                                           tu.day_bounds(to_day, self.tz)[0], self.tz)]
        if not days:
            return []
        lo, _ = tu.day_bounds(days[0], self.tz)
        _, hi = tu.day_bounds(days[-1], self.tz)
        sql, args = "kind=? AND start<? AND (end IS NULL OR end>?)", [kind, hi, lo]
        if source:
            sql += " AND source=?"
            args.append(source)
        evs = self._q(f"SELECT start, end, value FROM event WHERE {sql} ORDER BY start", args)
        out = []
        for day in days:
            a, b = tu.day_bounds(day, self.tz)
            b_eff = min(b, now)
            spans, starting, vals = [], 0, []
            for e in evs:
                s, t = e["start"], e["end"] if e["end"] is not None else now
                if a <= s < b:
                    starting += 1
                    if e["value"] is not None:
                        vals.append(e["value"])
                s2, t2 = max(s, a), min(t, b_eff)
                if t2 > s2:
                    spans.append((s2, t2))
            covered = 0
            cur_s = cur_t = None
            for s, t in sorted(spans):
                if cur_t is None or s > cur_t:
                    if cur_t is not None:
                        covered += cur_t - cur_s
                    cur_s, cur_t = s, t
                else:
                    cur_t = max(cur_t, t)
            if cur_t is not None:
                covered += cur_t - cur_s
            day_len = max(b_eff - a, 0)
            out.append({"day": day, "occurrences": starting, "minutes": round(covered / 60000, 1),
                        "share_of_day": round(covered / day_len, 3) if day_len else None,
                        "partial_day": b_eff < b,
                        "mean_value": round(sum(vals) / len(vals), 2) if vals else None,
                        "max_value": max(vals) if vals else None})
        return out

    # ── analysis built on daily values (samples or intervals alike) ─────────
    def daily_values(self, metric, source=None, from_day=None, to_day=None, stat="median",
                     min_hours=0) -> list[tuple[str, float]]:
        """[(day, value)] — for a sample metric `stat` is a daily field (median, mean, p90 …);
        for an interval metric it is 'minutes' or 'occurrences'."""
        m = self.metric(metric)
        if m["kind"] == catalog.SAMPLE:
            if stat not in DAILY_FIELDS:
                raise IngestError(f"stat must be one of {DAILY_FIELDS} for a sample metric")
            return [(r["day"], r[stat]) for r in self.daily(metric, source, from_day, to_day)
                    if r[stat] is not None and (r["hours_covered"] or 0) >= min_hours]
        if stat not in ("minutes", "occurrences", "mean_value", "max_value"):
            stat = "minutes"
        return [(r["day"], r[stat]) for r in self.events_daily(metric, source, from_day, to_day)
                if r[stat] is not None and not r["partial_day"]]

    def trend(self, metric, source=None, from_day=None, to_day=None, stat=None, min_hours=0) -> dict:
        m = self.metric(metric)
        stat = stat or ("median" if m["kind"] == catalog.SAMPLE else "minutes")
        from datetime import date
        dv = self.daily_values(metric, source, from_day, to_day, stat, min_hours)
        # real day offsets, so missing days don't compress the slope
        d0 = date.fromisoformat(dv[0][0]) if dv else None
        xs = [(date.fromisoformat(d) - d0).days for d, _ in dv]
        ys = [v for _, v in dv]
        slope = stats.sen_slope(xs, ys)
        return {"metric": metric, "source": source or "*", "stat": stat, "days": len(dv),
                "mann_kendall": stats.mann_kendall(ys),
                "sen_slope_per_day": None if slope is None else round(slope, 4),
                "unit": m["unit"], "first_day": dv[0][0] if dv else None,
                "last_day": dv[-1][0] if dv else None,
                "daily": [{"day": d, "value": v} for d, v in dv]}

    def baseline(self, metric, source=None, day=None, days=14, stat=None, min_hours=None,
                 z_flag=2.0) -> dict:
        """Compare one day with the person's own previous `days` days."""
        from datetime import date, timedelta
        m = self.metric(metric)
        stat = stat or ("median" if m["kind"] == catalog.SAMPLE else "minutes")
        day = day or tu.day_of(tu.now_ms(), self.tz)
        d = date.fromisoformat(day)
        hist_from = (d - timedelta(days=int(days))).isoformat()
        hist_to = (d - timedelta(days=1)).isoformat()
        if min_hours is None:
            min_hours = catalog.baseline_min_hours(m)
        mh = min_hours if m["kind"] == catalog.SAMPLE else 0
        history = [v for _, v in self.daily_values(metric, source, hist_from, hist_to, stat, mh)]
        if m["kind"] == catalog.SAMPLE:
            cur = [v for dd, v in self.daily_values(metric, source, day, day, stat, 0)]
        else:  # a running day is partial: compare it anyway, but say so
            rows = self.events_daily(metric, source, day, day)
            cur = [rows[0][stat]] if rows and rows[0].get(stat) is not None else []
        value = cur[0] if cur else None
        rz = stats.robust_z(value, history) if value is not None else \
            {"baseline_n": len(history), "baseline_median": stats.median(history) if history else None,
             "baseline_spread": None, "z": None, "flat": False}
        z = rz["z"]
        if value is None:
            verdict = "no data for this day"
        elif rz["baseline_n"] < stats.MIN_BASELINE:
            verdict = f"baseline too short (needs >= {stats.MIN_BASELINE} days)"
        elif rz["flat"]:
            # no variation at all in the history: any change is outside it
            med = rz["baseline_median"]
            verdict = ("within usual range" if value == med else
                       "above usual range" if value > med else "below usual range")
        elif z >= z_flag:
            verdict = "above usual range"
        elif z <= -z_flag:
            verdict = "below usual range"
        else:
            verdict = "within usual range"
        return {"metric": metric, "source": source or "*", "stat": stat, "day": day,
                "value": value, "unit": m["unit"], "baseline_days": int(days),
                "min_hours": mh, **rz, "z_flag": z_flag, "verdict": verdict,
                "note": "exploratory, relative to this person's own history - not a diagnosis"}

    def correlate(self, a, b, source_a=None, source_b=None, frm=None, to=None,
                  bucket_ms=3_600_000) -> dict:
        sa = {r["ts"]: r["mean"] for r in self.series(a, source_a, frm, to, bucket_ms)}
        sb = {r["ts"]: r["mean"] for r in self.series(b, source_b, frm, to, bucket_ms)}
        common = sorted(set(sa) & set(sb))
        xs, ys = [sa[t] for t in common], [sb[t] for t in common]
        return {"a": a, "b": b, "bucket_ms": bucket_ms, **stats.correlation(xs, ys),
                "note": "correlation of bucket means; does not imply causation"}

    def day_summary(self, day: str) -> dict:
        self.rollup_dirty(max_age_s=READ_ROLLUP_MAX_AGE_S)
        out: dict[str, Any] = {"day": day, "tz": self.tz_name, "samples": {}, "intervals": {}}
        for r in self._q("SELECT * FROM daily WHERE day=? ORDER BY metric, source", (day,)):
            entry = {k: (round(r[k], 3) if isinstance(r[k], float) else r[k])
                     for k in (*DAILY_FIELDS, "hours_covered")}
            entry["unit"] = self.metrics().get(r["metric"], {}).get("unit")
            out["samples"].setdefault(r["metric"], {})[r["source"]] = entry
        for name, m in self.metrics().items():
            if m["kind"] == catalog.INTERVAL:
                rows = self.events_daily(name, None, day, day)
                if rows and (rows[0]["minutes"] or rows[0]["occurrences"]):
                    out["intervals"][name] = rows[0]
        return out

    def db_info(self) -> dict:
        info = {"path": self.path, "tz": self.tz_name, "raw_retention_days": self.retention_days}
        try:
            info["size_mb"] = round(os.path.getsize(self.path) / 1e6, 2)
        except OSError:
            info["size_mb"] = None
        r = self._q("SELECT COUNT(*) n FROM sample")[0]
        info["samples"] = r["n"]
        info["events"] = self._q("SELECT COUNT(*) n FROM event")[0]["n"]
        info["daily_rows"] = self._q("SELECT COUNT(*) n FROM daily")[0]["n"]
        return info
