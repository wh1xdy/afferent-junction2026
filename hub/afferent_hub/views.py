import datetime as dt

PLAYED = ("completed", "partial", "fell_asleep")
STATE_ORDER = {"booster": 0, "check_in": 1, "watch": 2, "stable": 3}
WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
MOOD_HEX = {1: "#34476E", 2: "#5A7CA6", 3: "#A9A79A", 4: "#E8B867", 5: "#FFCB5C"}

SENSORS = [
    ("phone_camera", "Phone camera", "Eye openness, blinks and head angle as numbers. Never images."),
    ("pulse_stone", "Pulse stone", "Pulse in beats per minute."),
    ("bedside_camera", "Bedside camera", "A stick figure while you play. Never images."),
    ("bedside_light", "Bedside light", "Nothing. It only receives light colours."),
    ("presence", "Bed presence", "Time in bed and restless moments."),
    ("phone_presence", "Home or away", "Hours at home and a count of nearby unknown devices. Nobody is identified."),
    ("phone_motion", "Steps", "A daily step count (simulated in this demo)."),
]

DEFAULT_PRIVACY = {
    "sharing": "summary",
    "sensors": {"phone_camera": True, "pulse_stone": True, "bedside_camera": False, "bedside_light": True,
                "presence": True, "phone_presence": True, "phone_motion": True},
}

HELPED_TEXT = {
    "breath": "Slow breathing often settles you.",
    "loyly": "The warm löyly often settles you.",
    "fireflies": "Fireflies often raise a low pulse.",
    "beacon": "The beacon often helps you wake gently.",
    "bells": "The bells often help a heavy morning feel lighter.",
    "shutters": "Opening the shutters often helps when your eyes feel heavy.",
    "threads": "The aurora threads often help you settle into the moment.",
    "stars": "Joining the stars often helps you settle into the moment.",
}
DAWN_TEXT = "Days with the dawn light are often followed by brighter check-ins (still learning)."

CLINIC_SEES = [
    "Numbers from your sessions compared with your own baseline",
    "Sleep and rest pattern from the bed sensor",
    "A weekly summary written from those numbers",
    "Never camera images, sound or messages",
]

CRISIS = {
    "title": "If today is heavy, you do not have to carry it alone.",
    "text": "Afferent is not an emergency service and is not watched around the clock. "
            "Your clinic sees a note on the next working day.",
    "contacts": [
        {"label": "Emergency", "number": "112", "tel": "112"},
        {"label": "MIELI Crisis Helpline (24 h)", "number": "09 2525 0111", "tel": "+358925250111"},
        {"label": "Your clinic (demo placeholder)", "number": "09 000 0000", "tel": "+35890000000"},
    ],
}


def now_iso() -> str:
    return dt.datetime.now().astimezone().isoformat(timespec="seconds")


def tms_end(patient: dict) -> dt.date:
    return dt.date.fromisoformat(patient["tms_end_date"])


def now_day(patient: dict, today: dt.date | None = None) -> int:
    today = today or dt.date.today()
    return max(0, (today - tms_end(patient)).days)


def day_date(patient: dict, day: int) -> dt.date:
    return tms_end(patient) + dt.timedelta(days=day)


def _get(d, *path, default=None):
    for k in path:
        if not isinstance(d, dict):
            return default
        d = d.get(k)
    return default if d is None else d


def compact_session(s: dict) -> dict:
    return {
        "session_id": s["session_id"], "day_index": s.get("day_index"), "started_iso": s.get("started_iso"),
        "status": s.get("status"), "profile": s.get("profile"), "simulated": s.get("simulated"),
        "duration_ms": s.get("duration_ms"), "rt_median_ms": _get(s, "core", "rt", "median_ms"),
        "mood_start": _get(s, "core", "mood_start"), "mood_end": s.get("mood_end"), "pre_post": s.get("pre_post"),
    }


def session_added(s: dict) -> dict:
    c = compact_session(s)
    return {"type": "session_added", "patient_id": s["patient_id"],
            **{k: c[k] for k in ("session_id", "day_index", "status", "profile", "simulated", "pre_post",
                                 "rt_median_ms", "mood_start", "mood_end")}}


def day_sessions(sessions: list[dict], day: int, played_only: bool = True) -> list[dict]:
    return [s for s in sessions if s.get("day_index") == day and (not played_only or s.get("status") in PLAYED)]


def patient_row(patient: dict, analytics: dict, sessions: list[dict], flags: list[dict], live: bool) -> dict:
    nd = analytics.get("now_day", now_day(patient))
    comp = analytics.get("composite") or {}
    cus = analytics.get("cusum") or {}
    contribs = sorted((c for c in comp.get("contributions") or [] if (c.get("contribution") or 0) > 0),
                      key=lambda c: -c["contribution"])[:3]
    last = max((s for s in sessions if s.get("status") in PLAYED), key=lambda s: (s.get("day_index") or 0, s.get("started_iso") or ""), default=None)
    spark = list((analytics.get("timeline") or {}).get("composite") or [])[-14:]
    return {
        "id": patient["id"], "display_name": patient.get("display_name"), "kind": patient.get("kind"),
        "simulated": patient.get("simulated", True), "day_index": nd, "weeks_since_tms": round(nd / 7, 1),
        "state": analytics.get("state", "stable"), "state_label": analytics.get("state_label", "Stable"),
        "state_since_day": cus.get("since_day"),
        "composite": comp.get("value"), "composite_trend_7d": comp.get("trend_7d"), "cusum": cus.get("value"),
        "top_contributors": [{"key": c["key"], "label": c["label"], "contribution": c["contribution"]} for c in contribs],
        "last_session_day": last.get("day_index") if last else None,
        "last_session_iso": last.get("started_iso") if last else None,
        "live_now": live,
        "missed_7d": (analytics.get("completeness") or {}).get("missed_7d"),
        "sessions_7d": (analytics.get("completeness") or {}).get("sessions_7d"),
        "completeness": comp.get("completeness", (analytics.get("completeness") or {}).get("overall")),
        "confidence": comp.get("confidence"),
        "sparkline": spark,
        "flags": flags,
        "need_rank": None,
    }


def sort_rows(rows: list[dict]) -> list[dict]:
    rows = sorted(rows, key=lambda r: (STATE_ORDER.get(r["state"], 9), -(r["composite"] or -99), r["id"]))
    for i, r in enumerate(rows, 1):
        r["need_rank"] = i
    return rows


def config_message(patient: dict, analytics: dict, task_weights: dict, privacy: dict, dawn_level: int) -> dict:
    director = analytics.get("director") or {}
    return {
        "type": "config", "patient_id": patient["id"], "display_name": patient.get("display_name"),
        "simulated_patient": patient.get("simulated", True), "now_day": now_day(patient),
        "baseline_pulse_bpm": director.get("baseline_pulse_bpm") or 68.0,
        "rest_baseline": director.get("rest_baseline") or {"eye_openness": None, "head_pitch_deg": None,
                                                          "blink_rate_per_min": None},
        "task_weights": task_weights,
        "measurement_slots": {"fork": 1, "lanterns": 3},
        "dawn_level": dawn_level, "night_hours": [21, 6],
        "privacy": privacy, "server_time_iso": now_iso(),
    }


def _confidence(p_best, n):
    if p_best is None:
        return "low"
    if p_best >= 0.95 and n >= 30:
        return "high"
    if p_best >= 0.8 and n >= 15:
        return "medium"
    return "low"


def what_helped(analytics: dict) -> list[dict]:
    bandit = analytics.get("bandit") or {}
    arms = {(a["mode"], a["task_id"]): a for a in bandit.get("arms") or []}
    picks, seen = [], set()
    by_mode = bandit.get("by_mode") or {}
    for mode, best in sorted(by_mode.items(), key=lambda kv: -(kv[1].get("p_best") or 0)):
        tid = best.get("best")
        if not tid or tid in seen or (best.get("p_best") or 0) < 0.5 or tid not in HELPED_TEXT:
            continue
        arm = arms.get((mode, tid), {})
        n = arm.get("n", best.get("n", 0)) or 0
        if n < 5 or sum(1 for m, _ in arms if m == mode) < 2:
            continue
        seen.add(tid)
        picks.append({"task_id": tid, "label": best.get("label") or arm.get("label") or tid, "glyph": tid,
                      "mode": mode, "text": HELPED_TEXT[tid], "p_best": best.get("p_best"), "n": n,
                      "confidence": _confidence(best.get("p_best"), n)})
    dawn = next((x for x in bandit.get("next_day") or [] if x.get("id") == "dawn_light"), None)
    has_dawn = dawn is not None and (dawn.get("mood_diff") or 0) > 0
    picks = picks[: 2 if has_dawn else 3]
    if has_dawn:
        picks.append({"task_id": "dawn_light", "label": "Dawn light", "glyph": "sun", "mode": None, "text": DAWN_TEXT,
                      "p_best": None, "n": dawn.get("n_with", 0), "confidence": "low"})
    return picks


def privacy_view(privacy: dict) -> dict:
    sensors = privacy.get("sensors") or {}
    return {"sharing": privacy.get("sharing", "summary"),
            "sensors": [{"id": i, "label": label, "on": bool(sensors.get(i, False)), "shares": shares}
                        for i, label, shares in SENSORS]}


def _arc(session: dict | None) -> list[float]:
    if not session:
        return []
    ms, me = _get(session, "core", "mood_start"), session.get("mood_end")
    start = 0.15 + 0.1 * ((ms or 2) - 1)
    end = 1.0 if session.get("status") == "completed" else 0.6
    if me is not None:
        end = max(end * 0.8, min(1.0, 0.4 + 0.15 * me))
    n = max(2, min(12, len(session.get("tasks") or []) + 3))
    return [round(start + (end - start) * (i / (n - 1)) ** 0.8, 2) for i in range(n)]


def patient_view(patient: dict, privacy: dict, sessions: list[dict], daily: list[dict], analytics: dict) -> dict:
    nd = now_day(patient)
    daily_by = {d["day_index"]: d for d in daily}
    week = []
    for day in range(nd - 6, nd + 1):
        if day < 0:
            continue
        played = day_sessions(sessions, day)
        s = played[-1] if played else None
        rec = daily_by.get(day) or {}
        mood = _get(s, "core", "mood_start") if s else None
        date = day_date(patient, day)
        week.append({
            "day": day, "date": date.isoformat(), "weekday": WEEKDAYS[date.weekday()],
            "played": bool(s) or bool(rec.get("played")),
            "missed": (not s) and bool(rec.get("missed")) and day != nd,
            "today": day == nd, "mood": mood, "colour": MOOD_HEX.get(mood),
            "dawn_reached": bool(s and s.get("status") == "completed"),
        })
    today_s = (day_sessions(sessions, nd) or [None])[-1]
    pp = (today_s or {}).get("pre_post") or {}
    ms = _get(today_s, "core", "mood_start") if today_s else None
    me = today_s.get("mood_end") if today_s else None
    pulse_delta = _get(pp, "pulse", "delta")
    today = {
        "played": today_s is not None,
        "session_id": today_s["session_id"] if today_s else None,
        "session_time_h": today_s.get("local_hour") if today_s else None,
        "dawn_reached": bool(today_s and today_s.get("status") == "completed"),
        "mood_start": ms, "mood_end": me, "colour_start": MOOD_HEX.get(ms), "colour_end": MOOD_HEX.get(me),
        "settled": pulse_delta is not None and pulse_delta <= -2,
        "lifted": ms is not None and me is not None and me > ms,
        "arc": _arc(today_s),
    }
    return {
        "patient": {"id": patient["id"], "display_name": patient.get("display_name")},
        "simulated": bool(patient.get("simulated", True) or (today_s or {}).get("simulated")),
        "date": day_date(patient, nd).isoformat(),
        "today": today, "week": week, "what_helped": what_helped(analytics),
        "privacy": privacy_view(privacy), "clinic_sees": CLINIC_SEES, "crisis": CRISIS,
    }
