from statistics import mean

from ..analytics.stats import rnd


def _feature(analytics, key):
    for f in analytics.get("features") or []:
        if f.get("key") == key:
            return f
    return None


def _feature_pair(analytics, key, digits):
    f = _feature(analytics, key)
    if not f:
        return None, None
    latest = f.get("latest") or {}
    now = None if latest.get("stale") else rnd(latest.get("value"), digits)
    base = rnd((f.get("baseline") or {}).get("median"), digits)
    return now, base


def _delta(now, base, digits):
    if now is None or base is None:
        return None
    return round(now - base, digits)


def _unwrap_patient(patient):
    patient = patient or {}
    inner = patient.get("patient") if isinstance(patient.get("patient"), dict) else patient
    daily = patient.get("daily") or inner.get("daily") or []
    return inner, daily


def _daily_means(daily, lo, hi, getter):
    vals = []
    for d in daily:
        day = d.get("day_index")
        if day is None or not lo <= day <= hi:
            continue
        v = getter(d)
        if isinstance(v, (int, float)) and not isinstance(v, bool):
            vals.append(float(v))
    return mean(vals) if vals else None


def _activity(daily, week_start, week_end):
    steps_week = _daily_means(daily, week_start, week_end, lambda d: d.get("steps"))
    steps_base = _daily_means(daily, 0, 13, lambda d: d.get("steps"))
    bed_week = _daily_means(daily, week_start, week_end, lambda d: (d.get("sleep") or {}).get("time_in_bed_h"))
    bed_base = _daily_means(daily, 0, 13, lambda d: (d.get("sleep") or {}).get("time_in_bed_h"))
    simulated = any(
        d.get("simulated") or "steps" in (d.get("simulated_fields") or [])
        for d in daily
        if d.get("day_index") is not None and d["day_index"] <= week_end
    )
    out = {}
    if steps_week is not None and steps_base is not None:
        sw, sb = int(round(steps_week)), int(round(steps_base))
        out.update(steps_week_mean=sw, steps_baseline_mean=sb, steps_delta=sw - sb)
    if bed_week is not None and bed_base is not None:
        bw, bb = round(bed_week, 1), round(bed_base, 1)
        out.update(time_in_bed_h_week=bw, time_in_bed_h_baseline=bb, time_in_bed_h_delta=round(bw - bb, 1))
    if out:
        out["daily_simulated"] = bool(simulated)
    return out


def _top_contributors(composite):
    rows = [c for c in composite.get("contributions") or [] if (c.get("contribution") or 0) > 0]
    rows.sort(key=lambda c: c.get("contribution") or 0, reverse=True)
    return [
        {"key": c.get("key"), "label": c.get("label"), "signed_z": rnd(c.get("signed_z"), 2),
         "contribution": rnd(c.get("contribution"), 3)}
        for c in rows[:3]
    ]


def _best_calm(bandit):
    calm = (bandit.get("by_mode") or {}).get("calm") or {}
    best = calm.get("best")
    arm = next((a for a in bandit.get("arms") or [] if a.get("mode") == "calm" and a.get("task_id") == best), {})
    return {
        "best_calm_task": calm.get("label"),
        "best_calm_p_best": rnd(calm.get("p_best"), 3),
        "best_calm_helped": arm.get("helped"),
        "best_calm_n": arm.get("n"),
    }


def _pre_post(analytics):
    s = analytics.get("pre_post_summary") or {}
    return {
        "pre_post_n": s.get("n"),
        "pre_post_pulse_delta_median": rnd(s.get("pulse_delta_median"), 1),
        "pre_post_mood_delta_median": rnd(s.get("mood_delta_median"), 1),
        "pre_post_settled_share": rnd(s.get("settled_share"), 2),
    }


def summary_numbers(analytics: dict, patient: dict) -> dict:
    analytics = analytics or {}
    inner, daily = _unwrap_patient(patient)
    now_day = analytics.get("now_day")
    if now_day is None:
        now_day = inner.get("now_day") or 0
    week_end = int(now_day)
    week_start = max(0, week_end - 6)
    composite = analytics.get("composite") or {}
    cusum = analytics.get("cusum") or {}
    completeness = analytics.get("completeness") or {}
    state = analytics.get("state") or cusum.get("state") or "stable"
    since = cusum.get("since_day")
    if state == "stable":
        since = None

    sleep_now, sleep_base = _feature_pair(analytics, "sleep_regularity", 2)
    home_now, home_base = _feature_pair(analytics, "home_only_days", 0)

    numbers = {
        "week_start_day": week_start,
        "week_end_day": week_end,
        "week_since_tms": week_end // 7 + 1,
        "display_name": inner.get("display_name") or analytics.get("patient_id") or "Patient",
        "simulated": bool(analytics.get("simulated", inner.get("simulated", True))),
        "state": state,
        "state_label": analytics.get("state_label") or cusum.get("state_label") or "Stable",
        "state_since_day": since,
        "composite": rnd(composite.get("value"), 3),
        "composite_trend_7d": rnd(composite.get("trend_7d"), 3),
        "completeness": rnd(composite.get("completeness", completeness.get("overall")), 2),
        "confidence": composite.get("confidence"),
        "sessions_7d": completeness.get("sessions_7d"),
        "missed_7d": completeness.get("missed_7d"),
        "top_contributors": _top_contributors(composite),
    }
    numbers.update(_best_calm(analytics.get("bandit") or {}))
    numbers.update(_pre_post(analytics))
    numbers.update(
        sleep_regularity_week=sleep_now,
        sleep_regularity_baseline=sleep_base,
        sleep_regularity_delta=_delta(sleep_now, sleep_base, 2),
        home_only_days_7d=int(home_now) if home_now is not None else None,
        home_only_days_baseline=int(home_base) if home_base is not None else None,
    )
    numbers.update(_activity(daily, week_start, week_end))
    return numbers
