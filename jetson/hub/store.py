"""Local health-data store (SQLite on the Jetson) and the aggregations behind the reports.

Nothing leaves the device. Three kinds of data:
  readings   time series from the UNO Q finger sensors (pulse, HRV, breathing) and room climate
  sessions   expression sessions from the phone app (summary metrics + raw JSON)
  phq9       PHQ-9 check-ins (answers, score, item 9)

Aggregations are deterministic and documented, so a clinician can see exactly where a number
comes from; the LLM layer only ever words these numbers.
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

# what a reading means and how it is summarised per day (shown in the clinician report)
METRICS = {
    "finger_bpm": ("Resting pulse", "BPM", "10th percentile of finger-sensor pulse that day (a resting proxy)"),
    "hrv_rmssd": ("HRV (RMSSD)", "ms", "median of 60-s RMSSD windows that day; lower = more physiological stress"),
    "breathing": ("Breathing rate", "/min", "median rate from the heart-rate rhythm that day"),
}


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
        if value is None:
            return
        with self.lock:
            self.db.execute("INSERT INTO readings VALUES (?,?,?,?)", (ts or time.time(), metric, float(value), source))
            self.db.commit()

    def add_session(self, doc, ts=None):
        """phone expression session (export format afferent-expressions-v1, or just its summary)"""
        s = doc.get("summary", doc)
        metrics = {k: s.get(k) for k in ("smileShare", "expressivity", "blinksPerMinute", "gazeAwayShare",
                                         "gazeShiftsPerMinute", "gazeDownShare", "seconds")}
        cp = doc.get("cameraPulse") or {}
        metrics.update(camera_bpm=cp.get("bpm"), camera_trust=cp.get("trust"))
        br = doc.get("breathing") or {}
        metrics["breathing_head"] = br.get("perMinute") if (br.get("snr") or -1) > 0 else None
        ev = doc.get("events") or []
        metrics["micro_expressions"] = sum(1 for e in ev if e.get("duration", 1) <= 0.5)
        with self.lock:
            cur = self.db.execute("INSERT INTO sessions (ts, kind, metrics, raw) VALUES (?,?,?,?)",
                                  (ts or time.time(), "expressions", json.dumps(metrics),
                                   json.dumps({k: v for k, v in doc.items() if k != "frames"})))
            self.db.commit()
            return cur.lastrowid

    def add_phq9(self, answers, ts=None):
        if len(answers) != 9 or any(a not in (0, 1, 2, 3) for a in answers):
            raise ValueError("PHQ-9 needs 9 answers in 0..3")
        score = sum(answers)
        with self.lock:
            cur = self.db.execute("INSERT INTO phq9 (ts, answers, score, item9) VALUES (?,?,?,?)",
                                  (ts or time.time(), json.dumps(answers), score, answers[8]))
            self.db.commit()
            return cur.lastrowid

    # ── queries ───────────────────────────────────────────────────────
    def readings(self, metric, since=0, until=None):
        q = "SELECT ts, value FROM readings WHERE metric=? AND ts>=? AND ts<?"
        with self.lock:
            return self.db.execute(q, (metric, since, until or 1e12)).fetchall()

    def phq9_list(self, since=0):
        with self.lock:
            rows = self.db.execute("SELECT ts, answers, score, item9 FROM phq9 WHERE ts>=? ORDER BY ts", (since,)).fetchall()
        return [{"ts": ts, "date": day(ts), "answers": json.loads(a), "score": s, "severity": severity(s),
                 "item9": i9} for ts, a, s, i9 in rows]

    def sessions(self, since=0):
        with self.lock:
            rows = self.db.execute("SELECT id, ts, metrics FROM sessions WHERE ts>=? ORDER BY ts", (since,)).fetchall()
        return [{"id": i, "ts": ts, "date": day(ts), **json.loads(m)} for i, ts, m in rows]

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
        """everything a report needs, as plain data (also the LLM's only source)"""
        now = now or time.time()
        since = now - days * 86400
        phq = self.phq9_list(since)
        sess = self.sessions(since)
        daily = self.daily(days, now)

        def avg(key):
            v = [s[key] for s in sess if s.get(key) is not None]
            return round(st.mean(v), 3) if v else None
        return {
            "period": {"from": day(since), "to": day(now), "days": days},
            "coverage": {"days_with_sensor_data": sum(1 for r in daily if r["minutes"] >= 5),
                         "sensor_minutes": round(sum(r["minutes"] for r in daily)),
                         "sessions": len(sess), "phq9_entries": len(phq)},
            "phq9": phq,
            "phq9_item9_flag": any(p["item9"] > 0 for p in phq),
            "daily": daily,
            "trends": {m: self.trend(m, days, now) for m in METRICS},
            "behaviour": {"smile_share": avg("smileShare"), "expressivity": avg("expressivity"),
                          "blinks_per_min": avg("blinksPerMinute"), "gaze_away_share": avg("gazeAwayShare"),
                          "micro_expressions_per_session": avg("micro_expressions")},
        }
