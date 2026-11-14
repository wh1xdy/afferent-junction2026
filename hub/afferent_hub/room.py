"""Room climate over the weeks: the bedroom at night, from the bedside unit's thermometer.

The UNO Q hands the data manager one mean of its Modulino Thermo per minute (env.temperature_c and
env.humidity_pct from source modulino-hub, uno-q/SENSORS.md). The hub reads them back as hourly
buckets and takes the night of date D, 23:00 the evening before to 07:00 on D: the same night the
daily record of D covers (contracts/daily.v1.schema.json). A night counts when at least
MIN_NIGHT_H of its eight hours have a reading; with fewer it stays null, never a guess.

Without the data manager (and for the demo roster) the daily records' own `room` fields are used,
labelled simulated when the record says so. Room climate is context, not a measure of the person:
it is not part of the index.
"""
import datetime as dt

from .analytics import stats

TEMP, HUMIDITY = "env.temperature_c", "env.humidity_pct"
SOURCE = "modulino-hub"
NIGHT_FROM_H, NIGHT_TO_H, NIGHT_H = 23, 7, 8
MIN_NIGHT_H = 4
SLEEP_C = (16, 19)           # the cool bedroom sleep research points to, roughly
KEYS = ("temp_c_night", "humidity_pct")
CELSIUS = (-10.0, 50.0)      # outside this a number is a sensor fault, not a room
HOUR_MS = 3_600_000


def night_date(ts_ms: float, tz) -> dt.date | None:
    """The date whose night holds this moment, or None in the daytime."""
    t = dt.datetime.fromtimestamp(ts_ms / 1000, tz)
    if t.hour >= NIGHT_FROM_H:
        return t.date() + dt.timedelta(days=1)
    if t.hour < NIGHT_TO_H:
        return t.date()
    return None


def _ok(key: str, v) -> bool:
    if isinstance(v, bool) or not isinstance(v, (int, float)):
        return False
    lo, hi = CELSIUS if key == "temp" else (0.0, 100.0)
    return lo <= v <= hi


def nights(temp_rows: list[dict], humidity_rows: list[dict], tz) -> dict[str, dict]:
    """Hourly buckets of /api/v1/series ({ts, n, mean}) -> {date: {temp_c_night, humidity_pct, night_hours}}.
    Each night is the mean of its minute means (the buckets weighted by their count)."""
    acc: dict[dt.date, dict] = {}
    for key, rows in (("temp", temp_rows), ("hum", humidity_rows)):
        for r in rows or []:
            ts, n, mean = r.get("ts"), r.get("n"), r.get("mean")
            if not isinstance(ts, (int, float)) or not isinstance(n, int) or n <= 0 or not _ok(key, mean):
                continue
            day = night_date(ts + HOUR_MS / 2, tz)
            if day is None:
                continue
            s = acc.setdefault(day, {"temp": [0.0, 0, 0], "hum": [0.0, 0, 0]})[key]
            s[0] += mean * n
            s[1] += n
            s[2] += 1
    out = {}
    for day in sorted(acc):
        t, h = acc[day]["temp"], acc[day]["hum"]
        if t[2] < MIN_NIGHT_H:
            continue
        out[day.isoformat()] = {"temp_c_night": round(t[0] / t[1], 1),
                                "humidity_pct": round(h[0] / h[1]) if h[2] >= MIN_NIGHT_H else None,
                                "night_hours": min(NIGHT_H, t[2])}
    return out


def from_daily(daily: list[dict]) -> dict[int, dict]:
    """day_index -> {temp_c_night, humidity_pct, simulated} from the daily records that have a room value."""
    out = {}
    for rec in daily or []:
        room = rec.get("room") if isinstance(rec.get("room"), dict) else {}
        vals = {"temp_c_night": room.get("temp_c_night"), "humidity_pct": room.get("humidity_pct")}
        vals["temp_c_night"] = round(vals["temp_c_night"], 1) if _ok("temp", vals["temp_c_night"]) else None
        vals["humidity_pct"] = round(vals["humidity_pct"]) if _ok("hum", vals["humidity_pct"]) else None
        if rec.get("day_index") is None or all(v is None for v in vals.values()):
            continue
        fields = rec.get("simulated_fields") or []
        sim = "room" in fields or "*" in fields or (bool(rec.get("simulated")) and not fields)
        out[rec["day_index"]] = {**vals, "simulated": sim}
    return out


def merge(daily_days: dict[int, dict], measured: dict[int, dict]) -> dict[int, dict]:
    """Nights from the data manager replace what a daily record says about the same day."""
    out = dict(daily_days)
    for day, v in measured.items():
        out[day] = {"temp_c_night": v.get("temp_c_night"), "humidity_pct": v.get("humidity_pct"), "simulated": False}
    return out


def _pick(days: dict[int, dict], lo: int, hi: int) -> tuple[dict[int, dict], bool]:
    """The days to use in [lo, hi]: the measured ones if there are any, else the simulated ones (then flagged)."""
    span = {d: v for d, v in days.items() if lo <= d <= hi}
    real = {d: v for d, v in span.items() if not v.get("simulated")}
    return (real, False) if real else (span, bool(span))


def weekly(days: dict[int, dict], nd: int, weeks: int, period: int) -> dict:
    """The QR block: weekly medians of the nights over the period, how many nights, and whether simulated."""
    lo = nd - period + 1
    use, sim = _pick(days, max(lo, 0), nd)
    out = {"weekly": {}, "nights": sum(1 for v in use.values() if v.get("temp_c_night") is not None), "simulated": False}
    for key in KEYS:
        row = []
        for k in range(weeks):
            m = stats.median([use[d][key] for d in range(lo + 7 * k, lo + 7 * k + 7) if d in use])
            row.append(None if m is None else round(m, 1) if key == "temp_c_night" else round(m))
        out["weekly"][key] = row
    out["simulated"] = sim and any(x is not None for row in out["weekly"].values() for x in row)
    return out


def week_view(days: dict[int, dict], patient_dates: list[tuple[int, str]]) -> dict | None:
    """The patient view: last night of each day of the week shown, the week's median, and the sleep range."""
    if not patient_dates:
        return None
    use, sim = _pick(days, patient_dates[0][0], patient_dates[-1][0])
    rows = [{"date": iso, "temp_c_night": (use.get(d) or {}).get("temp_c_night"),
             "humidity_pct": (use.get(d) or {}).get("humidity_pct")} for d, iso in patient_dates]
    temps = [r["temp_c_night"] for r in rows if r["temp_c_night"] is not None]
    if not temps:
        return None
    t, h = stats.median(temps), stats.median([r["humidity_pct"] for r in rows])
    return {"nights": len(temps), "temp_c_night": round(t, 1), "humidity_pct": None if h is None else round(h),
            "sleep_c": list(SLEEP_C), "simulated": sim, "days": rows}
