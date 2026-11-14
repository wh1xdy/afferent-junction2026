def _num(v, d):
    if v is None:
        return None
    s = f"{v:.{d}f}"
    if float(s) == 0:
        return "0"
    return s

def _signed(v, d):
    s = _num(v, d)
    if s is None or s == "0" or s.startswith("-"):
        return s
    return "+" + s

def _pct(v):
    return f"{round(v * 100)}%"

def _lc(label):
    label = str(label or "")
    if len(label) > 1 and label[1].islower():
        return label[0].lower() + label[1:]
    return label

def _join(parts):
    if len(parts) <= 1:
        return "".join(parts)
    return ", ".join(parts[:-1]) + " and " + parts[-1]

def _lead(n):
    name = n["display_name"] + (" (simulated)" if n.get("simulated") else "")
    return f"{name}, week {n['week_since_tms']} after TMS, days {n['week_start_day']} to {n['week_end_day']}."

def _status(n):
    status = f"Status: {_lc(n.get('state_label') or 'Stable')}"
    if n.get("state_since_day") is not None:
        status += f" since day {n['state_since_day']}"
    comp = n.get("composite")
    completeness = n.get("completeness")
    tail = []
    if completeness is not None:
        tail.append(f"{_pct(completeness)} of features available")
    if n.get("confidence"):
        tail.append(f"{n['confidence']} confidence")
    if comp is None:
        detail = "the early-warning index is not available yet"
        if tail:
            detail += " (" + _join(tail) + ")"
        return f"{status}; {detail}."
    index = f"an early-warning index of {_signed(comp, 2)}"
    trend = n.get("composite_trend_7d")
    if trend is not None:
        if abs(trend) < 0.005:
            index += " (unchanged over 7 days)"
        else:
            index += f" ({'up' if trend > 0 else 'down'} {_num(abs(trend), 2)} over 7 days)"
    return f"{status}, with {_join([index] + tail)}."

def _contributors(n):
    top = n.get("top_contributors") or []
    if not top:
        return "No feature is above the personal baseline this week."
    parts = [f"{_lc(c['label'])} ({_signed(c['signed_z'], 1)})" for c in top if c.get("signed_z") is not None]
    return f"Largest contributors, in z against the personal baseline: {_join(parts)}."

def _everyday(n):
    parts = []
    if n.get("sleep_regularity_week") is not None and n.get("sleep_regularity_baseline") is not None:
        parts.append(f"sleep regularity {_num(n['sleep_regularity_week'], 2)} (baseline {_num(n['sleep_regularity_baseline'], 2)})")
    if n.get("time_in_bed_h_week") is not None:
        parts.append(f"time in bed {_num(n['time_in_bed_h_week'], 1)} h a night (baseline {_num(n['time_in_bed_h_baseline'], 1)} h)")
    if n.get("steps_week_mean") is not None:
        parts.append(f"{n['steps_week_mean']} steps a day (baseline {n['steps_baseline_mean']})")
    if n.get("home_only_days_7d") is not None and n.get("home_only_days_baseline") is not None:
        parts.append(f"{n['home_only_days_7d']} home-only days (baseline {n['home_only_days_baseline']})")
    if not parts:
        return None
    label = "Everyday signals"
    if n.get("daily_simulated") and not n.get("simulated"):
        label += " (simulated)"
    return f"{label}: {_join(parts)}."

def _sessions(n):
    played, missed = n.get("sessions_7d"), n.get("missed_7d")
    if played is None:
        head = "No session data for the last 7 days"
    else:
        head = f"Played on {played} of the last 7 days"
        if missed:
            head += f", {missed} missed"
    parts = []
    if n.get("pre_post_pulse_delta_median") is not None:
        parts.append(f"the median start-to-end pulse change was {_signed(n['pre_post_pulse_delta_median'], 1)} bpm")
    if n.get("pre_post_settled_share") is not None:
        parts.append(f"{_pct(n['pre_post_settled_share'])} settled by at least 2 bpm")
    if n.get("pre_post_mood_delta_median") is not None:
        parts.append(f"the median mood change was {_signed(n['pre_post_mood_delta_median'], 1)}")
    if not parts:
        return head + "."
    count = n.get("pre_post_n")
    scope = f"across the last {count} played sessions" if count else "across recent sessions"
    return f"{head}; {scope} {_join(parts)}."

def _bandit(n):
    task = n.get("best_calm_task")
    if not task:
        return None
    detail = []
    if n.get("best_calm_helped") is not None and n.get("best_calm_n"):
        detail.append(f"{n['best_calm_helped']} of {n['best_calm_n']}")
    if n.get("best_calm_p_best") is not None:
        detail.append(f"P(best) {_num(n['best_calm_p_best'], 2)}")
    tail = f" ({', '.join(detail)})" if detail else ""
    return f"In calm sessions, {task} was most often followed by a settling pulse{tail}."

def render(numbers: dict) -> str:
    parts = [_lead(numbers), _status(numbers), _contributors(numbers), _everyday(numbers),
             _sessions(numbers), _bandit(numbers)]
    return " ".join(p for p in parts if p)
