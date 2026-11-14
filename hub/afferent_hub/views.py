import datetime as dt

from .analytics.features import PLAYED

STATE_ORDER = {"booster": 0, "check_in": 1, "watch": 2, "stable": 3}
WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
MOOD_HEX = {1: "#34476E", 2: "#5A7CA6", 3: "#A9A79A", 4: "#E8B867", 5: "#FFCB5C"}

SENSORS = [
    ("phone_camera", "Phone camera", "Eye openness, blinks, head angle, a camera pulse estimate and how your face moves (smiling, how much it moves, looking away, brief movements by face region, breathing) as numbers. Never images."),
    ("pulse_stone", "Pulse stone",
     "Pulse, breathing rate and beat-to-beat variation as numbers from the finger sensor."),
    ("bedside_camera", "Bedside camera", "A stick figure while you play. Never images."),
    ("bedside_light", "Bedside light",
     "Nothing. It is one small LED on the bedside unit and only receives colours."),
    ("phone_presence", "Home or away", "Hours at home and a count of nearby unknown devices. Nobody is identified."),
    ("phone_motion", "Steps", "A daily step count (simulated in this demo)."),
]

DEFAULT_PRIVACY = {
    "sharing": "summary",
    "sensors": {"phone_camera": True, "pulse_stone": True, "bedside_camera": False, "bedside_light": True,
                "presence": False, "phone_presence": True, "phone_motion": True},
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
    "windows": "Lighting the cabin windows often helps you wake up.",
    "vihta": "A quick round with the vihta often wakes you up.",
    "birds": "Watching the birds often helps you settle into the moment.",
    "swans": "Following the swans often helps you focus.",
    "faces": "The frosted windows often help you settle into the moment.",
    "owls": "Finding the owl often helps you wake up.",
    "seals": "Catching the seals often helps you wake up.",
    "reindeer": "Watching the reindeer often helps you focus.",
    "ferry": "Timing the ferry often helps you wake up.",
    "drips": "Keeping the drip rhythm often helps you settle.",
    "buoys": "Roping the buoys often helps you focus.",
    "steps": "Following the snow steps often helps you settle into the moment.",
    "glance": "A glance at the harbour often helps you focus.",
    "signpost": "Reading the signposts often helps you wake up.",
    "runes": "Turning the runes often helps you focus.",
    "fog": "Reading the faces in the fog often helps you settle.",
}
DAWN_TEXT = "Days with the dawn light are often followed by brighter check-ins (still learning)."

CLINIC_SEES = [
    "Numbers from your sessions compared with your own baseline",
    "Sleep and rest pattern, simulated in this demo (there is no bed sensor)",
    "A weekly summary written from those numbers",
    "Never camera images, sound or messages",
]

CRISIS_FOOTER = "Afferent is not an emergency service and is not watched around the clock."
CLINIC_CONTACT = {"name": "Your clinic", "number": None, "hours": "office hours"}
CRISIS = {
    "title": "If today is heavy, you do not have to carry it alone.",
    "text": "If you need someone now, call 112 or a helpline below. " + CRISIS_FOOTER,
    "contacts": [
        {"label": "Emergency", "number": "112", "tel": "112"},
        {"label": "MIELI Crisis Helpline, in Finnish, 24 h", "number": "09 2525 0111", "tel": "+358925250111"},
        {"label": "Medical Helpline, 24 h", "number": "116117", "tel": "116117"},
        {"label": "Your clinic, number added by your care team", "number": None, "tel": None},
    ],
}

CHECKIN_DEFAULTS = {"enabled": True, "cadence_days": 14, "always_ask_cssrs": False, "cssrs_licensed": False,
                    "protocol_signed": False, "early_request": False, "reminder_local_time": "12:00",
                    "language": "en"}
CHECKIN_OVERDUE_DAYS = 17
SAFETY_FLAGS = {"high": "safety_high", "moderate": "safety_moderate", "incomplete": "safety_incomplete",
                "low": "safety_low"}
FLAG_RANK = {"safety_high": 0, "safety_moderate": 1, "safety_incomplete": 2, "safety_low": 3, "talk_request": 4}
SAFETY_KEYS = ("phq9_9", "cssrs", "safety", "checkins", "phq")

def now_iso() -> str:
    return dt.datetime.now().astimezone().isoformat(timespec="seconds")

def tms_end(patient: dict) -> dt.date:
    return dt.date.fromisoformat(patient["tms_end_date"])

def now_day(patient: dict) -> int:
    return max(0, (dt.date.today() - tms_end(patient)).days)

def day_date(patient: dict, day: int) -> dt.date:
    return tms_end(patient) + dt.timedelta(days=day)

def day_index(patient: dict, date: str) -> int:
    return (dt.date.fromisoformat(date) - tms_end(patient)).days

def _get(d, *path, default=None):
    for k in path:
        if not isinstance(d, dict):
            return default
        d = d.get(k)
    return default if d is None else d

def without_face(s: dict | None) -> dict | None:
    v = (s or {}).get("vitals")
    if not isinstance(v, dict) or "face" not in v:
        return s
    return {**s, "vitals": {k: x for k, x in v.items() if k != "face"}}

def compact_session(s: dict) -> dict:
    s = without_face(s)
    return {
        "session_id": s["session_id"], "day_index": s.get("day_index"), "started_iso": s.get("started_iso"),
        "status": s.get("status"), "profile": s.get("profile"), "simulated": s.get("simulated"),
        "duration_ms": s.get("duration_ms"), "rt_median_ms": _get(s, "core", "rt", "median_ms"),
        "mood_start": _get(s, "core", "mood_start"), "mood_end": s.get("mood_end"), "pre_post": s.get("pre_post"),
        "vitals": s.get("vitals"), "pulse_source": _get(s, "signal", "pulse_source"),
        "simulated_fields": s.get("simulated_fields"),
    }

def session_added(s: dict) -> dict:
    return {"type": "session_added", "patient_id": s["patient_id"], "session_id": s["session_id"],
            "day_index": s.get("day_index"), "status": s.get("status")}

def day_sessions(sessions: list[dict], day: int) -> list[dict]:
    return [s for s in sessions if s.get("day_index") == day and s.get("status") in PLAYED]

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
        "checkin": checkin_config(patient), "clinic_contact": clinic_contact(patient),
    }

def checkin_config(patient: dict) -> dict:
    over = patient.get("checkin") if isinstance(patient.get("checkin"), dict) else {}
    return {k: over.get(k, v) for k, v in CHECKIN_DEFAULTS.items()}

def clinic_contact(patient: dict) -> dict:
    over = patient.get("clinic_contact") if isinstance(patient.get("clinic_contact"), dict) else {}
    return {k: over.get(k) or v for k, v in CLINIC_CONTACT.items()}

def safety_flag(doc: dict) -> dict | None:
    safety = doc.get("safety") or {}
    ftype = SAFETY_FLAGS.get(safety.get("tier"))
    if not ftype:
        return None
    label = None
    if ftype == "safety_moderate":
        if safety.get("source") == "item9_fallback":
            label = "C-SSRS not asked; tier from item 9"
        elif (doc.get("cssrs") or {}).get("c6_repeat"):
            label = "known lifetime behaviour, unchanged since last check-in"
    t_iso = doc.get("completed_iso") or doc.get("stopped_iso") or doc.get("started_iso") or now_iso()
    return {"type": ftype, "t_iso": t_iso, "source": "checkin", "checkin_id": doc.get("checkin_id"),
            "screen": safety.get("screen"), **({"label": label} if label else {})}

def sort_flags(flags: list[dict]) -> list[dict]:
    newest = sorted(flags, key=lambda f: f.get("t_iso") or "", reverse=True)
    return sorted(newest, key=lambda f: FLAG_RANK.get(f.get("type"), 9))

def phq_block(patient: dict, checkins: list[dict], nd: int) -> dict:
    history = []
    for c in sorted(checkins, key=lambda c: c.get("started_iso") or ""):
        phq = c.get("phq9") or {}
        if phq.get("total") is None:
            continue
        iso = c.get("completed_iso") or c.get("started_iso")
        history.append({"checkin_id": c.get("checkin_id"), "date": (iso or "")[:10] or None, "completed_iso": iso,
                        "day_index": c.get("day_index"), "total": phq["total"], "phq8_total": phq.get("phq8_total"),
                        "band": phq.get("band"), "early": bool(c.get("early"))})
    last = history[-1] if history else None
    since = nd - last["day_index"] if last and last.get("day_index") is not None else None
    started = sorted(checkins, key=lambda c: c.get("started_iso") or "")
    latest = started[-1] if started else None
    return {
        "total": last["total"] if last else None, "phq8_total": last["phq8_total"] if last else None,
        "band": last["band"] if last else None, "date": last["date"] if last else None,
        "checkin_id": last["checkin_id"] if last else None, "history": history,
        "days_since": since, "overdue": since is not None and since >= CHECKIN_OVERDUE_DAYS,
        "last_attempt": {"checkin_id": latest.get("checkin_id"), "status": latest.get("status"),
                         "started_iso": latest.get("started_iso"),
                         "safety_tier": (latest.get("safety") or {}).get("tier")} if latest else None,
    }

def crisis_card(patient: dict) -> dict:
    cc = patient.get("clinic_contact") if isinstance(patient.get("clinic_contact"), dict) else {}
    if not cc.get("name") or not cc.get("number"):
        return CRISIS
    c = clinic_contact(patient)
    tel = "".join(ch for ch in c["number"] if ch.isdigit() or ch == "+")
    return {**CRISIS, "contacts": CRISIS["contacts"][:3] + [{"label": f"{c['name']}, {c['hours']}", "number": c["number"], "tel": tel}]}

def strip_safety(obj):
    if isinstance(obj, dict):
        return {k: strip_safety(v) for k, v in obj.items() if k not in SAFETY_KEYS}
    if isinstance(obj, list):
        return [strip_safety(v) for v in obj]
    return obj

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

LIT_STATUSES = ("completed", "fell_asleep")
FREEZE_START, FREEZE_EVERY, FREEZE_MAX, REPAIR_DAYS = 2, 7, 2, 3
PAUSE_SOURCES = ("patient", "clinician")
PATIENT_PAUSE_MAX_DAYS = 14

def lit(session: dict) -> bool:
    status = session.get("status")
    if status in LIT_STATUSES:
        return True
    core = session.get("core")
    if status != "partial" or not isinstance(core, dict):
        return False
    trials = _get(core, "rt", "trials", default=[])
    return len(trials) >= 5 and (core.get("mood_start") is not None or any(t.get("rt_ms") is not None for t in trials))

def pause_on(pauses: list[dict], day: int) -> dict | None:
    hits = [p for p in pauses or [] if p["from_day"] <= day <= p["until_day"]]
    return next((p for p in hits if p["source"] == "clinician"), hits[0] if hits else None)

def streak(sessions: list[dict], daily: list[dict], nd: int, pauses: list[dict] | None = None) -> dict:
    lit_days = {s["day_index"] for s in sessions if s.get("day_index") is not None and lit(s)}
    seen = {s["day_index"] for s in sessions if s.get("day_index") is not None}
    declined = {s["day_index"] for s in sessions if s.get("day_index") is not None and s.get("status") == "declined"}
    daily_by = {d["day_index"]: d for d in daily}
    first = min(seen | set(daily_by) | {p["from_day"] for p in pauses or []}, default=None)
    count, freezes, mornings, gap = 0, FREEZE_START, 0, []
    states, protection, by_day = {}, {}, {}
    for day in range(first, nd + 1) if first is not None else ():
        rec = daily_by.get(day) or {}
        if day in lit_days:
            mornings += 1
            if mornings % FREEZE_EVERY == 0:
                freezes = min(FREEZE_MAX, freezes + 1)
            for g in gap:
                protection[g] = "repair"
            count, gap, states[day] = count + 1, [], "lit"
        elif (pause_on(pauses, day) or rec.get("pause_source") or rec.get("declined") or day in declined
              or (day != nd and (day in seen or rec.get("played")))):
            states[day] = "rest"
        elif day == nd:
            states[day] = "today"
        elif count and freezes:
            freezes -= 1
            protection[day], states[day] = "freeze", "frozen"
        else:
            states[day] = "missed"
            if count:
                gap.append(day)
                if len(gap) > REPAIR_DAYS:
                    count, gap = 0, []
        by_day[day] = {"streak_len": count, "freezes_held": freezes, "repair_active": bool(gap)}
    return {"streak": count if count >= 2 else None, "streak_len": count, "freezes": freezes,
            "mornings_lit": mornings, "repair_active": bool(gap), "states": states, "protection": protection,
            "by_day": by_day,
            "frozen_days": sorted(d for d, v in protection.items() if v == "freeze"),
            "repaired_days": sorted(d for d, v in protection.items() if v == "repair")}

def annotate_daily(daily: list[dict], st: dict, pauses: list[dict], patient: dict) -> list[dict]:
    out = []
    for rec in daily:
        day = rec["day_index"]
        pause = pause_on(pauses, day)
        out.append({**rec, "streak_protection": st["protection"].get(day),
                    "pause_source": pause["source"] if pause else rec.get("pause_source"),
                    "pause_until": day_date(patient, pause["until_day"]).isoformat() if pause else rec.get("pause_until"),
                    **st["by_day"].get(day, {"streak_len": 0, "freezes_held": FREEZE_START, "repair_active": False})})
    return out

def current_pause(patient: dict, nd: int) -> dict | None:
    p = pause_on(patient.get("pauses") or [], nd)
    return {"source": p["source"], "until": day_date(patient, p["until_day"]).isoformat()} if p else None

def patient_view(patient: dict, privacy: dict, sessions: list[dict], daily: list[dict], analytics: dict) -> dict:
    nd = now_day(patient)
    daily_by = {d["day_index"]: d for d in daily}
    st = streak(sessions, daily, nd, patient.get("pauses") or [])
    week = []
    for day in range(nd - 6, nd + 1):
        if day < 0:
            continue
        played = day_sessions(sessions, day)
        s = played[-1] if played else None
        rec = daily_by.get(day) or {}
        mood = _get(s, "core", "mood_start") if s else None
        date = day_date(patient, day)
        state = st["states"].get(day, "today" if day == nd else "missed")
        week.append({
            "day": day, "date": date.isoformat(), "weekday": WEEKDAYS[date.weekday()], "state": state,
            "played": bool(s) or bool(rec.get("played")),
            "missed": state in ("missed", "frozen"),
            "today": day == nd, "mood": mood, "colour": MOOD_HEX.get(mood),
            "dawn_reached": bool(s and s.get("status") == "completed"),
            "frozen": state == "frozen",
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
        "today": today, "week": week, "mornings_lit": st["mornings_lit"], "streak": st["streak"],
        "freezes": st["freezes"], "pause": current_pause(patient, nd),
        "what_helped": what_helped(analytics),
        "privacy": privacy_view(privacy), "clinic_sees": CLINIC_SEES, "crisis": crisis_card(patient),
    }
