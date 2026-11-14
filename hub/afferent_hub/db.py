import json
import sqlite3
import threading
from pathlib import Path

SCHEMA = """
CREATE TABLE IF NOT EXISTS patients (id TEXT PRIMARY KEY, json TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions (session_id TEXT PRIMARY KEY, patient_id TEXT NOT NULL, day_index INTEGER, started_iso TEXT, json TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS sessions_patient ON sessions (patient_id, day_index);
CREATE TABLE IF NOT EXISTS daily (patient_id TEXT NOT NULL, day_index INTEGER NOT NULL, json TEXT NOT NULL, PRIMARY KEY (patient_id, day_index));
CREATE TABLE IF NOT EXISTS privacy (patient_id TEXT PRIMARY KEY, json TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS flags (id INTEGER PRIMARY KEY AUTOINCREMENT, patient_id TEXT NOT NULL, json TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS analytics_cache (patient_id TEXT PRIMARY KEY, json TEXT NOT NULL);
"""

TABLES = ("patients", "sessions", "daily", "privacy", "flags", "analytics_cache")


class Store:
    def __init__(self, path: str | Path):
        self.path = str(path)
        if self.path != ":memory:":
            Path(self.path).parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.RLock()
        self._db = sqlite3.connect(self.path, check_same_thread=False)
        self._db.execute("PRAGMA journal_mode=WAL")
        self._db.executescript(SCHEMA)
        self._db.commit()

    def close(self):
        with self._lock:
            self._db.close()

    def _rows(self, sql, args=()):
        with self._lock:
            return [json.loads(r[0]) for r in self._db.execute(sql, args).fetchall()]

    def _one(self, sql, args=()):
        rows = self._rows(sql, args)
        return rows[0] if rows else None

    def _write(self, sql, args=()):
        with self._lock:
            cur = self._db.execute(sql, args)
            self._db.commit()
            return cur

    def reset(self):
        with self._lock:
            for t in TABLES:
                self._db.execute(f"DELETE FROM {t}")
            self._db.commit()

    def bulk(self, patient: dict, sessions: list[dict], daily: list[dict], privacy: dict):
        pid = patient["id"]
        with self._lock:
            self._db.execute("INSERT OR REPLACE INTO patients VALUES (?, ?)", (pid, json.dumps(patient)))
            self._db.executemany(
                "INSERT OR REPLACE INTO sessions VALUES (?, ?, ?, ?, ?)",
                [(s["session_id"], pid, s.get("day_index"), s.get("started_iso"), json.dumps(s)) for s in sessions],
            )
            self._db.executemany(
                "INSERT OR REPLACE INTO daily VALUES (?, ?, ?)",
                [(pid, d["day_index"], json.dumps(d)) for d in daily],
            )
            self._db.execute("INSERT OR REPLACE INTO privacy VALUES (?, ?)", (pid, json.dumps(privacy)))
            self._db.commit()

    def patients(self) -> list[dict]:
        return self._rows("SELECT json FROM patients ORDER BY id")

    def patient(self, pid: str) -> dict | None:
        return self._one("SELECT json FROM patients WHERE id = ?", (pid,))

    def put_patient(self, patient: dict):
        self._write("INSERT OR REPLACE INTO patients VALUES (?, ?)", (patient["id"], json.dumps(patient)))

    def session(self, session_id: str) -> dict | None:
        return self._one("SELECT json FROM sessions WHERE session_id = ?", (session_id,))

    def sessions(self, pid: str) -> list[dict]:
        return self._rows(
            "SELECT json FROM sessions WHERE patient_id = ? ORDER BY day_index, started_iso, rowid", (pid,)
        )

    def add_session(self, doc: dict) -> bool:
        cur = self._write(
            "INSERT OR IGNORE INTO sessions VALUES (?, ?, ?, ?, ?)",
            (doc["session_id"], doc["patient_id"], doc.get("day_index"), doc.get("started_iso"), json.dumps(doc)),
        )
        return cur.rowcount == 1

    def daily(self, pid: str) -> list[dict]:
        return self._rows("SELECT json FROM daily WHERE patient_id = ? ORDER BY day_index", (pid,))

    def daily_day(self, pid: str, day: int) -> dict | None:
        return self._one("SELECT json FROM daily WHERE patient_id = ? AND day_index = ?", (pid, day))

    def put_daily(self, rec: dict):
        self._write(
            "INSERT OR REPLACE INTO daily VALUES (?, ?, ?)", (rec["patient_id"], rec["day_index"], json.dumps(rec))
        )

    def privacy(self, pid: str) -> dict | None:
        return self._one("SELECT json FROM privacy WHERE patient_id = ?", (pid,))

    def put_privacy(self, pid: str, privacy: dict):
        self._write("INSERT OR REPLACE INTO privacy VALUES (?, ?)", (pid, json.dumps(privacy)))

    def flags(self, pid: str) -> list[dict]:
        return self._rows("SELECT json FROM flags WHERE patient_id = ? ORDER BY id DESC", (pid,))

    def add_flag(self, pid: str, flag: dict):
        self._write("INSERT INTO flags (patient_id, json) VALUES (?, ?)", (pid, json.dumps(flag)))

    def clear_flags(self, pid: str):
        self._write("DELETE FROM flags WHERE patient_id = ?", (pid,))

    def analytics(self, pid: str) -> dict | None:
        return self._one("SELECT json FROM analytics_cache WHERE patient_id = ?", (pid,))

    def put_analytics(self, pid: str, analytics: dict):
        self._write("INSERT OR REPLACE INTO analytics_cache VALUES (?, ?)", (pid, json.dumps(analytics)))
