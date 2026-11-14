"""Local health-data store (SQLite on the Jetson) and the aggregations behind the reports.

Nothing leaves the device. Three kinds of data:
  readings   time series from the UNO Q finger sensors (pulse, HRV, breathing) and room climate
  sessions   expression sessions from the phone app (summary metrics + raw JSON)
  phq9       PHQ-9 check-ins (answers, score, item 9)

Aggregations are deterministic and documented, so whoever reads a report (the patient, or a doctor
the patient hands it to) can see exactly where a number comes from.

A stored value must never be able to break a report. So what comes in is checked (timestamp(),
number(): refused, or kept as missing), and what is already stored is read defensively: rows with a
timestamp that cannot be read are left out of every list and counted (Store.unreadable()).
"""
import json
import sqlite3
import statistics as st
import threading
import time
from datetime import datetime, timedelta, timezone

SCHEMA = """
CREATE TABLE IF NOT EXISTS readings (ts REAL NOT NULL, metric TEXT NOT NULL, value REAL NOT NULL, source TEXT);
CREATE INDEX IF NOT EXISTS readings_metric_ts ON readings(metric, ts);
CREATE TABLE IF NOT EXISTS sessions (id INTEGER PRIMARY KEY, ts REAL NOT NULL, kind TEXT, metrics TEXT, raw TEXT);
CREATE TABLE IF NOT EXISTS phq9 (id INTEGER PRIMARY KEY, ts REAL NOT NULL, answers TEXT NOT NULL, score INTEGER, item9 INTEGER);
"""

PHQ9_BANDS = [(0, 4, "minimal"), (5, 9, "mild"), (10, 14, "moderate"), (15, 19, "moderately severe"), (20, 27, "severe")]

# what a reading is and how it is summarised per day (shown in the handover report). No interpretation:
# HRV is a number in ms, never "stress".
METRICS = {
    "finger_bpm": ("Resting pulse", "BPM", "10th percentile of finger-sensor pulse that day (a resting proxy)"),
    "hrv_rmssd": ("HRV (RMSSD)", "ms", "median of 60-s RMSSD windows that day"),
    "breathing": ("Breathing rate", "/min", "median rate from the heart-rate rhythm that day"),
}

MAX_TS = 4102444800       # 2100-01-01. A later "unix time" is milliseconds or nonsense; datetime also stops at year 9999
LIMIT = 1e6               # largest magnitude kept for a session metric (shares, rates, seconds, BPM)
READING_LIMIT = 1e9       # same for a sensor reading; keeps medians and percentages finite
# rows a report can place in time. The rest (TEXT, milliseconds, infinity) match every `ts>=?`
READABLE = f"typeof(ts) IN ('integer','real') AND ts < {MAX_TS}"


class Invalid(ValueError):
    """what a client sent cannot be stored; the message is safe to send back"""


def number(v, limit=LIMIT):
    """v if it is a usable measurement (int or float, not bool, finite, within +-limit), else None"""
    if isinstance(v, bool) or not isinstance(v, (int, float)):
        return None
    return v if -limit <= v <= limit else None          # NaN and +-infinity fail the comparison too


def timestamp(ts, latest=MAX_TS):
    """Unix time in seconds for a new entry; None means now. Anything else that is not a number
    between 1970 and min(`latest`, 2100) is refused: milliseconds, a string or a far-future time
    would otherwise be stored and then sit in every report window."""
    if ts is None:
        return time.time()
    if isinstance(ts, bool) or not isinstance(ts, (int, float)) or not 0 < ts < MAX_TS:
        raise Invalid("ts must be unix time in seconds")
    if ts > latest:
        raise Invalid("ts is ahead of the hub's clock; send unix time in seconds, or leave ts out")
    return ts


def _part(doc, key):
    """an optional object inside a session document: absent / null -> {}"""
    v = doc.get(key)
    if v is None:
        return {}
    if not isinstance(v, dict):
        raise Invalid(f"{key} must be an object")
    return v


def severity(score):
    for lo, hi, name in PHQ9_BANDS:
        if lo <= score <= hi:
            return name
    return "?"


def day(ts, tz=timezone.utc):
    return datetime.fromtimestamp(ts, tz).date().isoformat()


class Store:
    def __init__(self, path=":memory:"):
        self.db = sqlite3.connect(path, check_same_thread=False)
        self.db.executescript(SCHEMA)
        self.lock = threading.Lock()

    # ── ingest ────────────────────────────────────────────────────────
    def add_reading(self, metric, value, ts=None, source="uno-q"):
        """one sensor value; anything that is not a usable number is dropped, not stored"""
        try:
            value = float(value)
        except (TypeError, ValueError, OverflowError):
            return
        if not -READING_LIMIT < value < READING_LIMIT:      # also NaN and +-infinity
            return
        with self.lock:
            self.db.execute("INSERT INTO readings VALUES (?,?,?,?)", (ts or time.time(), metric, value, source))
            self.db.commit()

    def add_session(self, doc, ts=None):
        """phone expression session (export format afferent-expressions-v1, or just its summary).
        The shape must be right (Invalid otherwise); a single metric that is not a usable number is
        kept as missing, so one odd value does not cost the whole session."""
        if not isinstance(doc, dict):
            raise Invalid("a session must be an object")
        ts = timestamp(ts)
        s = _part(doc, "summary") if doc.get("summary") is not None else doc
        metrics = {k: number(s.get(k)) for k in ("smileShare", "expressivity", "blinksPerMinute", "gazeAwayShare",
                                                 "gazeShiftsPerMinute", "gazeDownShare", "seconds")}
        cp = _part(doc, "cameraPulse")
        metrics.update(camera_bpm=number(cp.get("bpm")), camera_trust=number(cp.get("trust")))
        br = _part(doc, "breathing")
        metrics["breathing_head"] = number(br.get("perMinute")) if (number(br.get("snr")) or -1) > 0 else None
        ev = doc.get("events")
        if ev is None:
            ev = []
        if not isinstance(ev, list) or not all(isinstance(e, dict) for e in ev):
            raise Invalid("events must be a list of objects")
        # an event without a duration never counted as a micro-expression; one with an unusable duration doesn't either
        durations = [number(e.get("duration", 1)) for e in ev]
        metrics["micro_expressions"] = sum(1 for d in durations if d is not None and d <= 0.5)
        with self.lock:
            cur = self.db.execute("INSERT INTO sessions (ts, kind, metrics, raw) VALUES (?,?,?,?)",
                                  (ts, "expressions", json.dumps(metrics),
                                   json.dumps({k: v for k, v in doc.items() if k != "frames"})))
            self.db.commit()
            return cur.lastrowid

    def add_phq9(self, answers, ts=None):
        # type(a) is int: True == 1 and 1.0 == 1 would pass a plain "in (0, 1, 2, 3)"
        if (not isinstance(answers, (list, tuple)) or len(answers) != 9
                or any(type(a) is not int or not 0 <= a <= 3 for a in answers)):
            raise Invalid("PHQ-9 needs 9 answers in 0..3")
        ts = timestamp(ts)
        answers = list(answers)
        score = sum(answers)
        with self.lock:
            cur = self.db.execute("INSERT INTO phq9 (ts, answers, score, item9) VALUES (?,?,?,?)",
                                  (ts, json.dumps(answers), score, answers[8]))
            self.db.commit()
            return cur.lastrowid

    # ── queries ───────────────────────────────────────────────────────
    def readings(self, metric, since=0, until=None):
        # the value bounds leave out an infinite reading an older hub may have stored
        q = "SELECT ts, value FROM readings WHERE metric=? AND ts>=? AND ts<? AND value>? AND value<?"
        with self.lock:
            return self.db.execute(q, (metric, since, until or 1e12, -READING_LIMIT, READING_LIMIT)).fetchall()

    def phq9_list(self, since=0):
        with self.lock:
            rows = self.db.execute(f"SELECT ts, answers, score, item9 FROM phq9 WHERE ts>=? AND {READABLE} ORDER BY ts",
                                   (since,)).fetchall()
        return [{"ts": ts, "date": day(ts), "answers": json.loads(a), "score": s, "severity": severity(s),
                 "item9": i9} for ts, a, s, i9 in rows]

    def sessions(self, since=0):
        with self.lock:
            rows = self.db.execute(f"SELECT id, ts, metrics FROM sessions WHERE ts>=? AND {READABLE} ORDER BY ts",
                                   (since,)).fetchall()
        return [{"id": i, "ts": ts, "date": day(ts), **json.loads(m)} for i, ts, m in rows]

    def unreadable(self):
        """Sessions and PHQ-9 entries whose timestamp cannot be read (stored before timestamps were
        checked), so they belong to no period and are in no list and no number. A report states
        these counts instead of failing - above all PHQ-9 entries with item 9 above 0, which must
        not disappear silently."""
        def count(table, extra=""):
            return self.db.execute(f"SELECT COUNT(*) FROM {table} WHERE NOT ({READABLE}){extra}").fetchone()[0]
        with self.lock:
            return {"sessions": count("sessions"), "phq9": count("phq9"), "phq9_item9": count("phq9", " AND item9 > 0")}

    # ── aggregation ───────────────────────────────────────────────────
    def daily(self, days=14, now=None):
        """per-day summary of every metric, oldest first; None where there was no data"""
        now = now or time.time()
        start = now - days * 86400
        out = []
        for d in range(days):
            d0 = start + d * 86400
            d1 = d0 + 86400
            row = {"date": day(d1 - 1)}
            bpm = [v for _, v in self.readings("finger_bpm", d0, d1)]
            row["finger_bpm"] = round(sorted(bpm)[max(0, len(bpm) // 10 - 1)]) if len(bpm) >= 12 else None
            hrv = [v for _, v in self.readings("hrv_rmssd", d0, d1)]
            row["hrv_rmssd"] = round(st.median(hrv), 1) if len(hrv) >= 6 else None
            br = [v for _, v in self.readings("breathing", d0, d1)]
            row["breathing"] = round(st.median(br), 1) if len(br) >= 6 else None
            row["minutes"] = round(len(bpm) * 5 / 60, 1)     # readings are sampled every 5 s
            out.append(row)
        return out

    def trend(self, metric, days=14, now=None):
        """last 7 days vs the 7 before: medians of the daily values (needs >= 3 days each).
        Always the final 14 days of the window, so "previous 7 / last 7" stays true for ?days=30;
        a window shorter than 14 days has no trend."""
        d = [r[metric] for r in self.daily(days, now)]
        if len(d) < 14:
            return None
        prev, last = [v for v in d[-14:-7] if v is not None], [v for v in d[-7:] if v is not None]
        if len(prev) < 3 or len(last) < 3:
            return None
        a, b = st.median(prev), st.median(last)
        return {"previous": round(a, 1), "recent": round(b, 1), "change": round(b - a, 1),
                "change_pct": round((b - a) / a * 100) if a else None, "days": (len(prev), len(last))}

    def summary(self, days=14, now=None):
        """everything a report needs, as plain data"""
        now = now or time.time()
        since = now - days * 86400
        phq = self.phq9_list(since)
        sess = self.sessions(since)
        daily = self.daily(days, now)

        def avg(key):
            # number(): metrics stored before they were checked may hold NaN, a string or a list
            v = [s[key] for s in sess if number(s.get(key)) is not None]
            return round(st.mean(v), 3) if v else None
        return {
            "period": {"from": day(since), "to": day(now), "days": days},
            "coverage": {"days_with_sensor_data": sum(1 for r in daily if r["minutes"] >= 5),
                         "sensor_minutes": round(sum(r["minutes"] for r in daily)),
                         "sessions": len(sess), "phq9_entries": len(phq)},
            "unreadable": self.unreadable(),          # entries without a usable date: in none of the numbers here
            "phq9": phq,
            "phq9_item9_flag": any(p["item9"] > 0 for p in phq),
            "daily": daily,
            "trends": {m: self.trend(m, days, now) for m in METRICS},
            "behaviour": {"smile_share": avg("smileShare"), "expressivity": avg("expressivity"),
                          "blinks_per_min": avg("blinksPerMinute"), "gaze_away_share": avg("gazeAwayShare"),
                          "micro_expressions_per_session": avg("micro_expressions")},
        }
