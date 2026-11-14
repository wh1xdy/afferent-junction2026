"""Time handling.

Storage convention: every timestamp is **epoch milliseconds (int, UTC)** — the
same convention as posture-analysis (schema v3). Days ("YYYY-MM-DD") are local
calendar days in the home's time zone (`TZ_NAME`, default UTC), because "time
at home today" must follow the patient's clock, not UTC.

Accepted input formats (body fields and query parameters):
  epoch seconds   1794642860 or 1794642860.25
  epoch ms        1794642860250            (any number > 1e11 is taken as ms)
  ISO 8601        2026-11-14T15:20:00Z, 2026-11-14T17:20:00+02:00, 2026-11-14
  relative        -24h, -7d, -30m, now      (query parameters only)
"""
from __future__ import annotations

import logging
import math
import re
import time
from datetime import date, datetime, timedelta, timezone

try:
    from zoneinfo import ZoneInfo
except ImportError:  # pragma: no cover
    ZoneInfo = None

log = logging.getLogger("data_manager.time")

TS_MIN_MS = 0                    # 1970-01-01
TS_MAX_MS = 4_102_444_800_000    # 2100-01-01
_REL = re.compile(r"^-(\d+(?:\.\d+)?)([smhd])$")
_UNIT_S = {"s": 1, "m": 60, "h": 3600, "d": 86400}


def now_ms() -> int:
    return int(time.time() * 1000)


def get_tz(name: str | None):
    if not name or name.upper() == "UTC" or ZoneInfo is None:
        return timezone.utc
    try:
        return ZoneInfo(name)
    except Exception:
        log.warning("unknown TZ_NAME %r, falling back to UTC", name)
        return timezone.utc


def parse_ts(v, *, allow_relative: bool = False, now: int | None = None) -> int:
    """Any supported timestamp -> epoch ms. Raises ValueError."""
    now = now_ms() if now is None else now
    if v is None:
        raise ValueError("missing timestamp")
    if isinstance(v, bool):
        raise ValueError("invalid timestamp")
    if isinstance(v, (int, float)):
        x = float(v)
        if not math.isfinite(x):
            raise ValueError("timestamp must be a finite number")
        ms = int(x) if abs(x) > 1e11 else int(round(x * 1000))
        if not TS_MIN_MS <= ms <= TS_MAX_MS:
            raise ValueError("timestamp outside 1970-2100")
        return ms
    s = str(v).strip()
    if allow_relative:
        if s == "now":
            return now
        m = _REL.match(s)
        if m:
            return parse_ts(now - int(float(m.group(1)) * _UNIT_S[m.group(2)] * 1000))
    try:
        x = float(s)
    except ValueError:
        x = None
    if x is not None:
        return parse_ts(x)
    try:
        dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
    except ValueError:
        raise ValueError(f"unparseable timestamp {s!r}") from None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return parse_ts(int(dt.timestamp() * 1000))


def day_of(ts_ms: int, tz) -> str:
    return datetime.fromtimestamp(ts_ms / 1000, tz).date().isoformat()


def day_bounds(day: str, tz) -> tuple[int, int]:
    """Local day 'YYYY-MM-DD' -> [start_ms, end_ms). Handles DST (23/25 h days)."""
    d = date.fromisoformat(day)
    start = datetime(d.year, d.month, d.day, tzinfo=tz)
    nxt = d + timedelta(days=1)
    end = datetime(nxt.year, nxt.month, nxt.day, tzinfo=tz)
    return int(start.timestamp() * 1000), int(end.timestamp() * 1000)


def days_between(from_ms: int, to_ms: int, tz) -> list[str]:
    """Local days touched by [from_ms, to_ms], oldest first."""
    if to_ms < from_ms:
        return []
    d = date.fromisoformat(day_of(from_ms, tz))
    last = date.fromisoformat(day_of(to_ms, tz))
    out = []
    while d <= last:
        out.append(d.isoformat())
        d += timedelta(days=1)
    return out


def local_hour(ts_ms: int, tz) -> int:
    return datetime.fromtimestamp(ts_ms / 1000, tz).hour


def iso(ts_ms: int | None, tz=timezone.utc) -> str | None:
    if ts_ms is None:
        return None
    return datetime.fromtimestamp(ts_ms / 1000, tz).isoformat(timespec="seconds")


BUCKETS = {"1m": 60_000, "5m": 300_000, "15m": 900_000, "30m": 1_800_000,
           "1h": 3_600_000, "3h": 10_800_000, "6h": 21_600_000, "1d": 86_400_000}
