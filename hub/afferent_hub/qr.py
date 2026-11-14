import datetime as dt

from . import views
from .analytics import stats
from .analytics.features import FEATURES, index_sessions

VERSION = 1
PERIOD_DAYS = 56
WEEKS = 8
SAFETY_DAYS = 26 * 7
CAPS = {"phq": 8, "safety": 8, "talk": 10}
STATES = ("stable", "watch", "check_in", "booster")
SHOWN_TIERS = ("low", "moderate", "high", "incomplete", "not_answered")
FEATURE_KEYS = [f["key"] for f in FEATURES]
VITALS = (("pulse_bpm", "finger", "pulse_bpm"), ("breathing_per_min", "breathing", "rate_per_min"),
          ("rmssd_ms", "hrv", "rmssd_ms"))
VITAL_KEYS = [v[0] for v in VITALS]
VITAL_SOURCES = ("finger_ppg", "simulated")
MIN_VITAL_QUALITY = 0.3
MIN_VITAL_SAMPLES = 10

def _minute(iso: str | None) -> int | None:
    try:
        t = dt.datetime.fromisoformat(iso)
    except (TypeError, ValueError):
        return None
    return t.hour * 60 + t.minute

def _named(session: dict, block: str) -> bool:
    name = f"vitals.{block}"
    fields = session.get("simulated_fields") or []
    return any(f in ("*", "vitals", name) or str(f).startswith(name + ".") for f in fields)

def session_vital(session: dict, block: str, stat: str) -> tuple[float, bool] | None:
    v = session.get("vitals") if isinstance(session.get("vitals"), dict) else {}
    finger, b = v.get("finger") or {}, v.get(block) or {}
    if finger.get("source") not in VITAL_SOURCES or b.get("source") not in VITAL_SOURCES:
        return None
    quality = finger.get("quality") or {}
    q, q_min = quality.get("mean"), quality.get("min")
    if (finger.get("quality_reported") is not True or q is None or q < MIN_VITAL_QUALITY
            or q_min is None or q_min < MIN_VITAL_QUALITY):
        return None
    st = b.get(stat) or {}
    if st.get("mean") is None or (st.get("samples") or 0) < MIN_VITAL_SAMPLES:
        return None
    sim = "simulated" in (finger["source"], b["source"]) or _named(session, "finger") or _named(session, block)
    return float(st["mean"]), sim

def vitals_block(sessions: list[dict], nd: int) -> dict:
    by_day = index_sessions(sessions, nd)
    lo = nd - PERIOD_DAYS + 1
    out = {"weekly": {}, "days": {}, "simulated": {}}
    for key, block, stat in VITALS:
        real, sim = {}, {}
        for d in range(max(lo, 0), nd + 1):
            for s in by_day.get(d, []):
                v = session_vital(s, block, stat) if s.get("status") in views.PLAYED else None
                if v is not None:
                    (sim if v[1] else real)[d] = v[0]
        use = real or sim
        weeks = []
        for k in range(WEEKS):
            m = stats.median([use.get(d) for d in range(lo + 7 * k, lo + 7 * k + 7)])
            weeks.append(None if m is None else round(m, 1))
        out["weekly"][key] = weeks
        out["days"][key] = len(use)
        out["simulated"][key] = bool(use) and not real
    return out

def phq_baseline(patient: dict, history: list[dict]) -> tuple[int | None, str, list[dict]]:
    pb = patient.get("phq_baseline") if isinstance(patient.get("phq_baseline"), dict) else {}
    if pb.get("value") is not None:
        return pb["value"], "clinic_import" if pb.get("source") == "clinic_import" else "app", history
    if not history:
        return None, "app", history
    return history[0]["total"], "app", history[1:]

def phq_state(base: int | None, totals: list[int]) -> str | None:
    if base is None or not totals:
        return None
    t = totals[-1]
    prev = totals[-2] if len(totals) > 1 else base
    up = lambda x: x >= 10 and x >= base + 5
    if t >= 20 or (up(t) and len(totals) > 1 and up(prev)):
        return "booster"
    if up(t) or t >= 15:
        return "check_in"
    if t >= base + 5 or (prev < 10 <= t):
        return "watch"
    return "stable"

def _rank(state: str | None) -> int:
    return STATES.index(state) if state in STATES else -1

def _phq(patient: dict, checkins: list[dict], nd: int) -> tuple[dict, str | None, int | None, int]:
    block = views.phq_block(patient, checkins, nd)
    full = [{"day": h["day_index"], "total": h["total"], "phq8_total": h["phq8_total"], "band": h["band"],
             "early": h["early"]} for h in block["history"]]
    base, source, follow = phq_baseline(patient, full)
    state = phq_state(base, [h["total"] for h in follow])
    state_day = follow[-1]["day"] if follow else None
    history = full[-CAPS["phq"]:]
    last = block["last_attempt"] or {}
    status = None
    if last.get("status") == "incomplete":
        doc = next((c for c in checkins if c.get("checkin_id") == last.get("checkin_id")), {})
        status = "stopped" if doc.get("stopped_iso") else "incomplete"
    return ({"baseline": base, "baseline_source": source, "history": history, "overdue": block["overdue"],
             "last_status": status}, state, state_day, len(full) - len(history))

def _safety(checkins: list[dict], nd: int) -> tuple[list[dict], int]:
    out = []
    for c in checkins:
        s = c.get("safety") or {}
        day = c.get("day_index")
        if s.get("tier") not in SHOWN_TIERS or day is None or day < nd - SAFETY_DAYS + 1:
            continue
        iso = c.get("completed_iso") or c.get("stopped_iso") or c.get("started_iso")
        out.append({"day": day, "minute": _minute(iso), "tier": s["tier"], "source": s.get("source"),
                    "screen": s.get("screen"), "c6_repeat": bool((c.get("cssrs") or {}).get("c6_repeat")),
                    "_t": iso or ""})
    out.sort(key=lambda e: (e["day"], e["_t"]), reverse=True)
    kept = [{k: v for k, v in e.items() if k != "_t"} for e in out[:CAPS["safety"]]]
    return kept, len(out) - len(kept)

def _talk(patient: dict, flags: list[dict], lo: int, hi: int) -> tuple[list[dict], int]:
    out = []
    for f in flags:
        if f.get("type") != "talk_request" or not f.get("t_iso"):
            continue
        try:
            day = views.day_index(patient, f["t_iso"][:10])
        except ValueError:
            continue
        if lo <= day <= hi:
            out.append({"day": day, "minute": _minute(f["t_iso"]), "_t": f["t_iso"]})
    out.sort(key=lambda e: e["_t"], reverse=True)
    kept = [{"day": e["day"], "minute": e["minute"]} for e in out[:CAPS["talk"]]]
    return kept, len(out) - len(kept)

def build(patient: dict, privacy: dict, sessions: list[dict], daily: list[dict], analytics: dict,
          checkins: list[dict], flags: list[dict]) -> dict:
    nd = analytics.get("now_day", views.now_day(patient))
    lo = nd - PERIOD_DAYS + 1
    period_days = [d for d in range(max(lo, 0), nd + 1)]
    pauses = patient.get("pauses") or []
    st = views.streak(sessions, daily, nd, pauses)
    states = [st["states"].get(d) for d in period_days]

    comp = analytics.get("composite") or {}
    cus = analytics.get("cusum") or {}
    compl = analytics.get("completeness") or {}
    tl = analytics.get("timeline") or {}
    tl_days = tl.get("days") or []
    idx = {d: i for i, d in enumerate(tl_days)}
    features = {f["key"]: f for f in analytics.get("features") or []}

    def weekly(series: list) -> list:
        out = []
        for k in range(WEEKS):
            start = nd - PERIOD_DAYS + 1 + 7 * k
            days = [d for d in range(start, start + 7) if d >= 0 and d in idx and idx[d] < len(series)]
            m = stats.median([series[idx[d]] for d in days]) if days else None
            out.append(None if m is None else round(m, 4))
        return out

    def share(series: list) -> float | None:
        if not period_days:
            return None
        hits = sum(1 for d in period_days if d in idx and idx[d] < len(series) and series[idx[d]] is not None)
        return round(hits / len(period_days), 2)

    phq, phq_st, phq_day, phq_omitted = _phq(patient, checkins, nd)
    cus_state = cus.get("state") or analytics.get("state") or "stable"
    shown = max(analytics.get("state") or "stable", cus_state, phq_st or "stable", key=_rank)
    since = cus.get("since_day")
    if _rank(phq_st) > _rank(cus_state) and phq_st == shown:
        since = phq_day
    safety, safety_omitted = _safety(checkins, nd)
    talk, talk_omitted = _talk(patient, flags, lo, nd)

    vitals = vitals_block(sessions, nd)
    sim = bool(patient.get("simulated", True) or analytics.get("simulated") or any(vitals["simulated"].values())
               or any(s.get("simulated") for s in sessions if (s.get("day_index") or 0) >= lo))
    played = {s["day_index"] for s in sessions if s.get("day_index") in period_days and s.get("status") in views.PLAYED}
    played |= {d["day_index"] for d in daily if d.get("day_index") in period_days and d.get("played")}
    sensors = (privacy or {}).get("sensors") or {}

    body = {
        "v": VERSION, "sim": sim, "generated_iso": views.now_iso(),
        "period": {"tms_end_date": patient["tms_end_date"], "from_day": lo, "to_day": nd},
        "mornings": {"lit_total": st["mornings_lit"], "lit": states.count("lit"), "rest": states.count("rest"),
                     "missed": states.count("missed"), "frozen": states.count("frozen")},
        "state": {"shown": shown, "cusum": cus_state, "phq_state": phq_st, "since_day": since,
                  "first_watch_day": cus.get("first_watch_day"), "first_check_in_day": cus.get("first_check_in_day"),
                  "first_booster_day": cus.get("first_booster_day"), "confidence": comp.get("confidence") or "low"},
        "composite": {"value": comp.get("value"), "trend_7d": comp.get("trend_7d"),
                      "completeness": comp.get("completeness", compl.get("overall"))},
        "contrib": sorted(({"key": c["key"], "contribution": c["contribution"]}
                           for c in comp.get("contributions") or []
                           if c.get("key") in FEATURE_KEYS and c.get("contribution") is not None),
                          key=lambda c: -abs(c["contribution"])),
        "cusum": {"value": cus.get("value"),
                  "history": [{"day": h["day"], "state": h["state"]} for h in cus.get("history") or []
                              if h.get("state") in STATES and h.get("day") is not None]},
        "weekly": {"composite": weekly(tl.get("composite") or []),
                   **{k: weekly(((features.get(k) or {}).get("series") or {}).get("value") or []) for k in FEATURE_KEYS}},
        "baseline": {k: ({"median": b.get("median"), "scale": b.get("scale")} if b.get("ready") else None)
                     for k in FEATURE_KEYS for b in [(features.get(k) or {}).get("baseline") or {}]},
        "phq": phq,
        "safety": safety,
        "talk": talk,
        "complete": {"played_days": len(played), "sessions_7d": compl.get("sessions_7d"), "days_7d": compl.get("days_7d"),
                     "missed_7d": compl.get("missed_7d"),
                     "paused_days": sum(1 for d in period_days if views.pause_on(pauses, d)),
                     "by_feature": {k: share(((features.get(k) or {}).get("series") or {}).get("value") or [])
                                    for k in FEATURE_KEYS}},
        "pauses": [{"from_day": p["from_day"], "until_day": p["until_day"], "source": p["source"]}
                   for p in pauses if p["until_day"] >= lo and p["from_day"] <= nd],
        "sensors": {k: bool(sensors.get(k, False)) for k in views.DEFAULT_PRIVACY["sensors"]},
        "vitals": vitals,
    }
    omitted = {"safety_entries": safety_omitted, "talk_requests": talk_omitted, "phq_totals": phq_omitted}
    if any(omitted.values()):
        body["omitted"] = omitted
    return body
