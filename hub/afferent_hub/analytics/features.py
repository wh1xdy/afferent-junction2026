from . import stats

PLAYED = {"completed", "partial", "fell_asleep"}

FEATURES = [
    {"key": "rt_median", "label": "Reaction time", "unit": "ms", "source": "session", "worse": "high",
     "weight": 1.5, "floor": 20.0, "evidence": "established"},
    {"key": "mood", "label": "Mood check-in", "unit": "lantern 1-5", "source": "session", "worse": "low",
     "weight": 1.5, "floor": 1.0, "evidence": "established"},
    {"key": "sleep_regularity", "label": "Sleep regularity", "unit": "IS 0-1", "source": "daily", "worse": "low",
     "weight": 1.0, "floor": 0.05, "evidence": "plausible"},
    {"key": "missed_sessions", "label": "Missed sessions (7 d)", "unit": "days", "source": "daily", "worse": "high",
     "weight": 1.0, "floor": 1.0, "evidence": "plausible"},
    {"key": "effort_hard_prop", "label": "Effort choice (7 sessions)", "unit": "share hard", "source": "session",
     "worse": "low", "weight": 1.0, "floor": 0.2, "evidence": "plausible"},
    {"key": "morning_pulse", "label": "Morning resting pulse", "unit": "bpm", "source": "daily", "worse": "high",
     "weight": 0.75, "floor": 2.0, "evidence": "plausible"},
    {"key": "home_only_days", "label": "Home-only days (7 d)", "unit": "days", "source": "daily", "worse": "high",
     "weight": 0.75, "floor": 1.0, "evidence": "plausible"},
    {"key": "upright_frac", "label": "Upright time in play", "unit": "share", "source": "session", "worse": "low",
     "weight": 0.5, "floor": 0.05, "evidence": "exploratory"},
    {"key": "reward_bias", "label": "Reward bias log b (7 sessions)", "unit": "log b", "source": "session",
     "worse": "low", "weight": 0.5, "floor": 0.15, "evidence": "exploratory"},
]

WINDOW = 7
MIN_WINDOW_DAYS = 4
MIN_POOLED_SESSIONS = 3
MIN_PULSE_QUALITY = 0.5


def get(doc, *path):
    for p in path:
        if not isinstance(doc, dict):
            return None
        doc = doc.get(p)
    return doc


def played(s: dict) -> bool:
    return s.get("status") in PLAYED


def index_sessions(sessions: list[dict], now_day: int) -> dict[int, list[dict]]:
    by_day: dict[int, list[dict]] = {}
    for s in sorted(sessions, key=lambda s: (s.get("day_index") or 0, s.get("started_iso") or "")):
        d = s.get("day_index")
        if d is None or d < 0 or d > now_day:
            continue
        by_day.setdefault(d, []).append(s)
    return by_day


def index_daily(daily: list[dict], now_day: int) -> dict[int, dict]:
    return {r["day_index"]: r for r in daily if r.get("day_index") is not None and 0 <= r["day_index"] <= now_day}


def day_session(day_sessions: list[dict], require=None) -> dict | None:
    for s in reversed(day_sessions):
        if played(s) and (require is None or require(s)):
            return s
    return None


def rt_valid(s: dict) -> bool:
    return bool(get(s, "core", "rt", "valid")) and get(s, "core", "rt", "median_ms") is not None


def upright_frac(s: dict) -> float | None:
    up = dur = 0.0
    for t in s.get("tasks") or []:
        if t.get("upright_s") is None or not t.get("duration_ms"):
            continue
        up += t["upright_s"]
        dur += t["duration_ms"] / 1000.0
    return min(up / dur, 1.0) if dur > 0 else None


def lantern_cells(s: dict):
    tl = s.get("two_lanterns")
    if not isinstance(tl, dict) or tl.get("valid") is False:
        return None
    try:
        return tuple(int(tl[k]) for k in ("rich_correct", "rich_incorrect", "lean_correct", "lean_incorrect"))
    except (KeyError, TypeError):
        return None


def morning_pulse_value(rec: dict | None) -> float | None:
    if rec and rec.get("morning_pulse_bpm") is not None:
        q = rec.get("morning_pulse_quality")
        if q is None or q >= MIN_PULSE_QUALITY:
            return float(rec["morning_pulse_bpm"])
    return None


def window_count(flags: list, d: int) -> float | None:
    vals = [f for f in flags[max(0, d - WINDOW + 1): d + 1] if f is not None]
    if len(vals) < MIN_WINDOW_DAYS:
        return None
    return sum(1 for f in vals if f) * WINDOW / len(vals)


def missed_flag(rec: dict | None):
    if not rec:
        return None
    if rec.get("played") or rec.get("declined"):
        return False
    if not rec.get("day_complete", True):
        return None
    return bool(rec.get("missed"))


def home_only_flag(rec: dict | None):
    return get(rec, "presence", "home_only") if rec else None


def hourly(rec: dict | None):
    h = get(rec, "sleep", "presence_hourly") if rec else None
    return h if isinstance(h, list) and len(h) == 24 else None


def extract(sessions: list[dict], daily: list[dict], now_day: int) -> dict:
    n = now_day + 1
    by_day = index_sessions(sessions, now_day)
    recs = index_daily(daily, now_day)
    main = [day_session(by_day.get(d, [])) for d in range(n)]
    rt_s = [day_session(by_day.get(d, []), rt_valid) for d in range(n)]

    values: dict[str, list] = {f["key"]: [None] * n for f in FEATURES}
    missed = [missed_flag(recs.get(d)) for d in range(n)]
    home = [home_only_flag(recs.get(d)) for d in range(n)]
    hours = [hourly(recs.get(d)) for d in range(n)]
    pooled_effort: list[float] = []
    pooled_cells: list[tuple] = []

    for d in range(n):
        s = main[d]
        if rt_s[d] is not None:
            values["rt_median"][d] = float(rt_s[d]["core"]["rt"]["median_ms"])
        if s is not None:
            m = get(s, "core", "mood_start")
            values["mood"][d] = float(m) if m is not None else None
            values["upright_frac"][d] = upright_frac(s)
            hp = get(s, "fork", "hard_prop")
            if hp is not None:
                pooled_effort.append(float(hp))
                recent = pooled_effort[-WINDOW:]
                if len(recent) >= MIN_POOLED_SESSIONS:
                    values["effort_hard_prop"][d] = sum(recent) / len(recent)
            cells = lantern_cells(s)
            if cells is not None:
                pooled_cells.append(cells)
                recent = pooled_cells[-WINDOW:]
                if len(recent) >= MIN_POOLED_SESSIONS:
                    values["reward_bias"][d] = stats.log_b(*[sum(c[i] for c in recent) for i in range(4)])
        values["morning_pulse"][d] = morning_pulse_value(recs.get(d))
        if d not in recs:
            continue
        values["missed_sessions"][d] = window_count(missed, d)
        values["home_only_days"][d] = window_count(home, d)
        window = [h for h in hours[max(0, d - WINDOW + 1): d + 1] if h is not None]
        if len(window) >= MIN_WINDOW_DAYS:
            values["sleep_regularity"][d] = stats.inter_daily_stability(window)

    fresh = [d in recs or main[d] is not None for d in range(n)]
    return {"values": values, "main": main, "rt_sessions": rt_s, "by_day": by_day, "daily": recs,
            "missed": missed, "home_only": home, "hourly": hours, "fresh": fresh}


def reward_slope(sessions_in_order: list[dict]) -> float | None:
    hard = {"2": [], "3": []}
    for s in sessions_in_order:
        hbr = get(s, "fork", "hard_by_reward") or {}
        for r in ("2", "3"):
            if hbr.get(r) is not None:
                hard[r].append(hbr[r])
    if len(hard["2"]) < 2 or len(hard["3"]) < 2:
        return None
    return sum(hard["3"]) / len(hard["3"]) - sum(hard["2"]) / len(hard["2"])


def context_series(ex: dict, now_day: int) -> dict:
    n = now_day + 1
    recs = ex["daily"]
    tib = [get(recs.get(d), "sleep", "time_in_bed_h") for d in range(n)]
    mid = [get(recs.get(d), "sleep", "sleep_midpoint_h") for d in range(n)]
    restless = [get(recs.get(d), "sleep", "restlessness_events") for d in range(n)]
    onset = [get(recs.get(d), "sleep", "sleep_onset_h") for d in range(n)]
    wake = [get(recs.get(d), "sleep", "wake_time_h") for d in range(n)]
    for d in range(n):
        if mid[d] is None and onset[d] is not None and wake[d] is not None:
            mid[d] = (onset[d] + wake[d]) / 2
    sd = [None] * n
    iv = [None] * n
    slope = [None] * n
    fork_sessions: list[dict] = []
    for d in range(n):
        vals = stats.clean(mid[max(0, d - WINDOW + 1): d + 1])
        if len(vals) >= MIN_WINDOW_DAYS:
            sd[d] = float(stats.np.std(vals, ddof=1))
        window = [h for h in ex["hourly"][max(0, d - WINDOW + 1): d + 1] if h is not None]
        if len(window) >= MIN_WINDOW_DAYS:
            iv[d] = stats.intradaily_variability(window)
        s = ex["main"][d]
        if s is not None and get(s, "fork", "hard_by_reward"):
            fork_sessions.append(s)
            slope[d] = reward_slope(fork_sessions[-WINDOW:])
    return {"time_in_bed_h": tib, "sleep_midpoint_h": mid, "sleep_midpoint_sd_7d": sd, "restlessness": restless,
            "sleep_iv_7d": iv, "effort_reward_slope": slope}
