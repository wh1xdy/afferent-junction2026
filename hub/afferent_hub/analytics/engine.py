import datetime as dt

from . import bandit, stats
from .features import FEATURES, PLAYED, context_series, extract, get

PARAMS = {
    "baseline_days": 14,
    "min_baseline_obs": 7,
    "ewma_lambda": 0.3,
    "z_clip": 3.0,
    "stale_days": 3,
    "cusum_k": 0.35,
    "cusum_start_day": 14,
    "thresholds": {"watch": 1.5, "check_in": 3.0, "booster": 8.0},
    "helped_threshold_bpm": 2.0,
    "bandit_prior": list(bandit.PRIOR),
    "weight_floor": bandit.WEIGHT_FLOOR,
}
STATE_LABELS = {"stable": "Stable", "watch": "Watch", "check_in": "Consider a check-in call",
                "booster": "Consider discussing a booster session"}
SUGGESTIONS = {
    "stable": "No change suggested. Keep the usual follow-up.",
    "watch": "Some measures drift from the personal baseline. Keep watching; no action suggested yet.",
    "check_in": "Consider a check-in call this week. The clinician decides.",
    "booster": "Consider discussing a booster session at the next contact. The clinician decides.",
}
SEVERITY = {"stable": 0, "watch": 1, "check_in": 2, "booster": 3}
DEFAULT_PULSE = 68.0


def score(sessions: list[dict], daily: list[dict], now_day: int, params: dict = PARAMS) -> dict:
    now_day = max(int(now_day), 0)
    n = now_day + 1
    ex = extract(sessions, daily, now_day)
    feats = []
    for spec in FEATURES:
        values = ex["values"][spec["key"]]
        base = stats.baseline(values, spec["floor"], days=params["baseline_days"],
                              min_obs=params["min_baseline_obs"], now_day=now_day)
        sign = 1.0 if spec["worse"] == "high" else -1.0
        usable = base["n"] >= 3
        z = [stats.robust_z(v, base["median"], base["scale"]) if usable else None for v in values]
        signed = [None if v is None else sign * v for v in z]
        e = stats.ewma(signed, params["ewma_lambda"], params["stale_days"])
        feats.append({"spec": spec, "values": values, "baseline": base, "z": z, "signed": signed, "ewma": e})

    total_w = sum(f["weight"] for f in FEATURES)
    clip = params["z_clip"]
    composite: list[float | None] = [None] * n
    completeness = [0.0] * n
    contrib = [[None] * n for _ in feats]
    for d in range(n):
        avail = [(i, f) for i, f in enumerate(feats) if f["ewma"][d] is not None]
        w_av = sum(f["spec"]["weight"] for _, f in avail)
        completeness[d] = w_av / total_w
        if not avail:
            continue
        for i, f in avail:
            contrib[i][d] = f["spec"]["weight"] * max(-clip, min(clip, f["ewma"][d])) / w_av
        composite[d] = sum(contrib[i][d] for i, _ in avail)

    cus = stats.cusum(composite, params["cusum_k"], params["cusum_start_day"])
    states = ["stable" if d < params["cusum_start_day"] else stats.state_for(cus[d], params["thresholds"])
              for d in range(n)]
    return {"now_day": now_day, "extract": ex, "features": feats, "composite": composite,
            "completeness": completeness, "contrib": contrib, "cusum": cus, "states": states}


def infer_day0(sessions: list[dict], daily: list[dict]) -> dt.date | None:
    for r in daily:
        if r.get("date") and r.get("day_index") is not None:
            return dt.date.fromisoformat(r["date"]) - dt.timedelta(days=r["day_index"])
    for s in sessions:
        if s.get("started_iso") and s.get("day_index") is not None:
            try:
                return dt.date.fromisoformat(s["started_iso"][:10]) - dt.timedelta(days=s["day_index"])
            except ValueError:
                continue
    return None


def day_date(day0, d):
    return (day0 + dt.timedelta(days=d)).isoformat() if day0 else None


def director(sessions: list[dict], now_day: int) -> dict:
    ordered = sorted((s for s in sessions if s.get("status") in PLAYED and (s.get("day_index") or 0) <= now_day),
                     key=lambda s: (s.get("day_index") or 0, s.get("started_iso") or ""))
    valid = [s for s in ordered if get(s, "core", "rest", "pulse_bpm") is not None
             and (get(s, "core", "rest", "pulse_quality") or 0) >= 0.5]
    if not valid:
        pulse = DEFAULT_PULSE
    elif len(valid) <= 7:
        pulse = stats.median([get(s, "core", "rest", "pulse_bpm") for s in valid])
    else:
        recent = [get(s, "core", "rest", "pulse_bpm") for s in valid if (s.get("day_index") or 0) > now_day - 14]
        pulse = stats.median(recent or [get(s, "core", "rest", "pulse_bpm") for s in valid[-7:]])
    last = ordered[-14:]
    rest = {k: stats.rnd(stats.median([get(s, "core", "rest", k) for s in last]), 2)
            for k in ("eye_openness", "head_pitch_deg", "blink_rate_per_min")}
    return {"baseline_pulse_bpm": stats.rnd(pulse, 1), "rest_baseline": rest}


def pp_pair(pp: dict | None, key: str, nd: int) -> dict:
    p = (pp or {}).get(key) or {}
    return {k: stats.rnd(p.get(k), nd) for k in ("start", "end", "delta")}


def pre_post(sessions: list[dict], now_day: int, day0) -> tuple[list, dict]:
    ordered = sorted((s for s in sessions if s.get("status") in PLAYED and s.get("day_index") is not None
                      and s["day_index"] <= now_day and s.get("pre_post")),
                     key=lambda s: (s["day_index"], s.get("started_iso") or ""))[-7:]
    rows = []
    for s in ordered:
        pp = s["pre_post"]
        mood = pp_pair(pp, "mood", 0)
        mood = {k: None if v is None else int(v) for k, v in mood.items()}
        rows.append({"session_id": s["session_id"], "day": s["day_index"], "date": day_date(day0, s["day_index"]),
                     "profile": s.get("profile"), "simulated": bool(s.get("simulated")), "status": s["status"],
                     "pulse": pp_pair(pp, "pulse", 1), "head_pitch": pp_pair(pp, "head_pitch", 1),
                     "eye_openness": pp_pair(pp, "eye_openness", 2), "mood": mood})
    pulse = stats.clean([r["pulse"]["delta"] for r in rows])
    summary = {"n": len(rows), "pulse_delta_median": stats.rnd(stats.median(pulse), 1),
               "mood_delta_median": stats.rnd(stats.median([r["mood"]["delta"] for r in rows]), 1),
               "settled_share": stats.rnd(sum(1 for p in pulse if p <= -2) / len(pulse), 2) if pulse else None}
    return rows, summary


def cusum_block(sc: dict, day0, params: dict) -> dict:
    states, cus = sc["states"], sc["cusum"]
    now = sc["now_day"]
    history = []
    for d, s in enumerate(states):
        if d == 0 or s != states[d - 1]:
            history.append({"day": d, "date": day_date(day0, d), "state": s, "cusum": stats.rnd(cus[d], 2)})
    first = {}
    for key in ("watch", "check_in", "booster"):
        first[key] = next((d for d, s in enumerate(states) if SEVERITY[s] >= SEVERITY[key]),
                          None)
    return {"value": stats.rnd(cus[now], 2), "k": params["cusum_k"], "thresholds": dict(params["thresholds"]),
            "state": states[now], "state_label": STATE_LABELS[states[now]], "since_day": history[-1]["day"],
            "first_watch_day": first["watch"], "first_check_in_day": first["check_in"],
            "first_booster_day": first["booster"], "history": history}


def feature_blocks(sc: dict, now_day: int) -> list[dict]:
    out = []
    for i, f in enumerate(sc["features"]):
        spec, base = f["spec"], f["baseline"]
        obs = [d for d in range(now_day + 1) if f["values"][d] is not None]
        last = obs[-1] if obs else None
        week = f["values"][max(0, now_day - 6): now_day + 1]
        nd = 1 if spec["key"] in ("rt_median",) else 3
        out.append({
            "key": spec["key"], "label": spec["label"], "unit": spec["unit"], "source": spec["source"],
            "worse": spec["worse"], "weight": spec["weight"], "evidence": spec["evidence"],
            "baseline": {k: stats.rnd(v, 3) if isinstance(v, float) else v for k, v in base.items()},
            "latest": {"day": last, "value": stats.rnd(f["values"][last], nd) if last is not None else None,
                       "z": stats.rnd(f["z"][last], 2) if last is not None else None,
                       "ewma_z": stats.rnd(f["ewma"][now_day], 2),
                       "contribution": stats.rnd(sc["contrib"][i][now_day], 3),
                       "stale": f["ewma"][now_day] is None},
            "completeness_7d": stats.rnd(sum(1 for v in week if v is not None) / 7, 2),
            "series": {"value": [stats.rnd(v, 3) for v in f["values"]], "z": [stats.rnd(v, 2) for v in f["z"]],
                       "ewma_z": [stats.rnd(v, 2) for v in f["ewma"]],
                       "rolling_7d": [stats.rnd(v, 3) for v in stats.rolling(f["values"], 7, 3)]},
        })
    return out


def composite_block(sc: dict, now_day: int, params: dict) -> dict:
    comp = sc["composite"]
    value = comp[now_day]
    ago = comp[now_day - 7] if now_day >= 7 else None
    rows = []
    for i, f in enumerate(sc["features"]):
        c = sc["contrib"][i][now_day]
        e = f["ewma"][now_day]
        rows.append({"key": f["spec"]["key"], "label": f["spec"]["label"], "weight": f["spec"]["weight"],
                     "signed_z": stats.rnd(e, 2), "contribution": stats.rnd(c, 3), "share": None})
    total_abs = sum(abs(r["contribution"]) for r in rows if r["contribution"] is not None)
    for r in rows:
        if r["contribution"] is not None and total_abs > 0:
            r["share"] = stats.rnd(abs(r["contribution"]) / total_abs, 3)
    rows.sort(key=lambda r: (r["contribution"] is None, -(r["contribution"] or 0)))
    ready = sum(1 for f in sc["features"] if f["baseline"]["ready"])
    compl = sc["completeness"][now_day]
    confidence = "high" if compl >= 0.75 and ready >= 7 else "medium" if compl >= 0.5 else "low"
    return {"value": stats.rnd(value, 3), "value_7d_ago": stats.rnd(ago, 3),
            "trend_7d": stats.rnd(value - ago, 3) if value is not None and ago is not None else None,
            "weights": {f["key"]: f["weight"] for f in FEATURES}, "contributions": rows,
            "completeness": stats.rnd(compl, 2), "confidence": confidence,
            "n_features": sum(1 for r in rows if r["contribution"] is not None), "n_features_total": len(FEATURES)}


def completeness_block(sc: dict, now_day: int) -> dict:
    ex = sc["extract"]
    lo = max(0, now_day - 6)
    sessions_7d = sum(1 for d in range(lo, now_day + 1) for s in ex["by_day"].get(d, []) if s.get("status") in PLAYED)
    days_7d = sum(1 for d in range(lo, now_day + 1) if d in ex["daily"])
    missed_7d = sum(1 for d in range(lo, now_day + 1) if ex["missed"][d])
    by_feature = {f["spec"]["key"]: stats.rnd(sum(1 for v in f["values"][lo:now_day + 1] if v is not None) / 7, 2)
                  for f in sc["features"]}
    return {"overall": stats.rnd(sc["completeness"][now_day], 2), "sessions_7d": sessions_7d, "days_7d": days_7d,
            "missed_7d": missed_7d, "by_feature": by_feature}


def timeline_block(sc: dict, now_day: int, day0) -> dict:
    ex = sc["extract"]
    n = now_day + 1
    played = [bool(ex["main"][d]) or bool(get(ex["daily"].get(d), "played")) for d in range(n)]
    ctx = context_series(ex, now_day)
    live_days = sorted({d for d, ss in ex["by_day"].items() for s in ss
                        if s.get("status") in PLAYED and "*" not in (s.get("simulated_fields") or [])})
    vals = {f["spec"]["key"]: f["values"] for f in sc["features"]}
    return {
        "days": list(range(n)), "dates": [day_date(day0, d) for d in range(n)],
        "composite": [stats.rnd(v, 3) for v in sc["composite"]],
        "composite_7d": [stats.rnd(v, 3) for v in stats.rolling(sc["composite"], 7, 3, stats.mean)],
        "cusum": [stats.rnd(v, 2) for v in sc["cusum"]], "state": sc["states"],
        "completeness": [stats.rnd(v, 2) for v in sc["completeness"]],
        "played": played, "missed": [bool(m) for m in ex["missed"]],
        "mood": [stats.rnd(v, 1) for v in vals["mood"]],
        "rt_median": [None if v is None else float(round(v)) for v in vals["rt_median"]],
        "sleep_regularity": [stats.rnd(v, 3) for v in vals["sleep_regularity"]],
        **{k: [stats.rnd(v, 3) for v in series] for k, series in ctx.items()},
        "live_days": live_days,
    }


def analyze_patient(sessions: list[dict], daily: list[dict], now_day: int, *, patient_id: str | None = None,
                    tms_end_date: str | None = None, generated_iso: str | None = None) -> dict:
    sessions = [s for s in sessions or [] if isinstance(s, dict)]
    daily = [r for r in daily or [] if isinstance(r, dict)]
    params = PARAMS
    sc = score(sessions, daily, now_day, params)
    now_day = sc["now_day"]
    day0 = dt.date.fromisoformat(tms_end_date) if tms_end_date else infer_day0(sessions, daily)
    pid = patient_id or next((x.get("patient_id") for x in sessions + daily if x.get("patient_id")), None)
    cus = cusum_block(sc, day0, params)
    comp = composite_block(sc, now_day, params)
    reasons = [r["label"] for r in comp["contributions"] if (r["contribution"] or 0) > 0][:3]
    rows, summary = pre_post(sessions, now_day, day0)
    state = cus["state"]
    return {
        "schema": "afferent.analytics/1",
        "patient_id": pid,
        "now_day": now_day,
        "date": day_date(day0, now_day),
        "generated_iso": generated_iso,
        "simulated": any(bool(x.get("simulated")) for x in sessions + daily),
        "params": {**params, "thresholds": dict(params["thresholds"])},
        "state": state,
        "state_label": STATE_LABELS[state],
        "director": director(sessions, now_day),
        "suggestion": {"state": state, "text": SUGGESTIONS[state], "reasons": reasons},
        "features": feature_blocks(sc, now_day),
        "composite": comp,
        "cusum": cus,
        "bandit": bandit.build(sessions, sc["extract"]["main"], sc["extract"]["daily"], sc["composite"], now_day),
        "pre_post": rows,
        "pre_post_summary": summary,
        "completeness": completeness_block(sc, now_day),
        "timeline": timeline_block(sc, now_day, day0),
    }
