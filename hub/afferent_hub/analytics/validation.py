import datetime as dt

import numpy as np

from . import bandit, stats
from .engine import PARAMS, SEVERITY, analyze_patient, score

DISCLAIMER = ("Synthetic data from our own generator. Untuned on any real patient data (parameters were set on "
              "this synthetic data only), not clinically validated.")
ONSET = 28
DAYS = 56
FIRST_DAY = 14
START = dt.date(2026, 9, 21)
MOOD_INDEX = 1


def summary(values) -> dict:
    xs = [v for v in values if v is not None]
    if not xs:
        return {"median": None, "iqr": None, "n": 0}
    q1, med, q3 = np.percentile(xs, [25, 50, 75])
    return {"median": stats.rnd(med, 1), "iqr": [stats.rnd(q1, 1), stats.rnd(q3, 1)], "n": len(xs)}


def daily_states(p: dict) -> tuple[list[str], dict]:
    states = ["stable"] * DAYS
    last = None
    for d in range(FIRST_DAY, DAYS):
        last = score(p["sessions"], p["daily"], d)
        states[d] = last["states"][d]
    return states, last


def first_at_least(states, level, start=0):
    return next((d for d in range(start, len(states)) if SEVERITY[states[d]] >= SEVERITY[level]), None)


def episodes(states, level, start=FIRST_DAY):
    n, inside = 0, False
    for d in range(start, len(states)):
        on = SEVERITY[states[d]] >= SEVERITY[level]
        if on and not inside:
            n += 1
        inside = on
    return n


def cusum_states(series, k, thresholds, start=FIRST_DAY):
    cus = stats.cusum(series, k, start)
    return ["stable" if d < start else stats.state_for(cus[d], thresholds) for d in range(len(series))]


def mood_only_series(sc: dict, clip: float) -> list:
    e = sc["features"][MOOD_INDEX]["ewma"]
    return [None if v is None else max(-clip, min(clip, v)) for v in e]


def p_best_trace(sessions: list[dict], mode: str, arm: str) -> list[float]:
    return p_best_traces(sessions, mode)[arm]


def p_best_traces(sessions: list[dict], mode: str) -> dict[str, list[float]]:
    ids = bandit.MODE_ARMS[mode]
    c = {a: [0, 0] for a in ids}
    out = []
    played = sorted((s for s in sessions if s.get("status") in bandit.PLAYED),
                    key=lambda s: (s.get("day_index") or 0, s.get("started_iso") or ""))
    for s in played:
        for t in s.get("tasks") or []:
            if t.get("kind") == "adaptive" and t.get("mode") == mode and t.get("id") in c and t.get("helped") is not None:
                c[t["id"]][0 if t["helped"] else 1] += 1
        p, _ = bandit.p_best_from_counts([1 + c[a][0] for a in ids], [1 + c[a][1] for a in ids], draws=2000)
        out.append([float(x) for x in p])
    return {a: [row[i] for row in out] for i, a in enumerate(ids)}


def first_crossing(trace: list[float], target: float) -> int | None:
    return next((i + 1 for i, v in enumerate(trace) if v >= target), None)


def stays_from(trace: list[float], target: float) -> int | None:
    if not trace or trace[-1] < target:
        return None
    i = len(trace)
    while i > 0 and trace[i - 1] >= target:
        i -= 1
    return i + 1


def arm_choice_share(sessions: list[dict], mode: str, arm: str, lo: int, hi: int) -> float | None:
    picks = [t["id"] == arm for s in sessions if lo <= (s.get("day_index") or 0) < hi and s.get("status") in bandit.PLAYED
             for t in s.get("tasks") or [] if t.get("kind") == "adaptive" and t.get("mode") == mode]
    return sum(picks) / len(picks) if picks else None


def run_patients(n_seeds: int):
    from ..synthetic import generate_patient
    rows = []
    for i in range(n_seeds):
        start = START + dt.timedelta(days=i % 7)
        for kind, base in (("relapse", 10_000), ("stable", 20_000)):
            p = generate_patient(kind, DAYS, base + i, patient_id=f"{kind}-{i}", onset_day=ONSET, start_date=start)
            states, sc = daily_states(p)
            rows.append({"kind": kind, "seed": base + i, "p": p, "states": states, "score": sc})
    return rows


def detection(rows) -> dict:
    rel = [r for r in rows if r["kind"] == "relapse"]
    out = {}
    for level in ("watch", "check_in", "booster"):
        days = [first_at_least(r["states"], level, ONSET) for r in rel]
        out[f"days_onset_to_{level}"] = summary([None if d is None else d - ONSET for d in days])
    detected = [first_at_least(r["states"], "check_in", ONSET) for r in rel]
    mood_days = []
    for r in rel:
        ms = cusum_states(mood_only_series(r["score"], PARAMS["z_clip"]), PARAMS["cusum_k"], PARAMS["thresholds"])
        mood_days.append(first_at_least(ms, "check_in", ONSET))
    leads = [m - d for d, m in zip(detected, mood_days) if d is not None and m is not None]
    pre = [first_at_least(r["states"][:ONSET], "check_in", FIRST_DAY) is not None for r in rel]
    out.update({
        "onset_day": ONSET, "ramp_days": 21, "horizon_day": DAYS - 1,
        "detected_share": stats.rnd(sum(d is not None for d in detected) / len(rel), 2),
        "mood_only_rule": "same CUSUM (k, thresholds) on the mood check-in feature alone",
        "mood_only_rule_days_onset_to_flag": summary([None if m is None else m - ONSET for m in mood_days]),
        "mood_only_detected_share": stats.rnd(sum(m is not None for m in mood_days) / len(rel), 2),
        "lead_time_vs_mood_only_days": summary(leads),
        "lead_time_vs_mood_only_note": "only seeds where both rules flagged by day 55",
        "pre_onset_check_in_share": stats.rnd(sum(pre) / len(rel), 2),
        "per_seed_days_onset_to_check_in": [None if d is None else d - ONSET for d in detected],
        "per_seed_mood_only_days_onset_to_flag": [None if m is None else m - ONSET for m in mood_days],
    })
    return out


def false_alarms(rows) -> dict:
    st = [r for r in rows if r["kind"] == "stable"]
    patient_days = len(st) * (DAYS - FIRST_DAY)
    ci = sum(episodes(r["states"], "check_in") for r in st)
    mood_ci = 0
    for r in st:
        ms = cusum_states(mood_only_series(r["score"], PARAMS["z_clip"]), PARAMS["cusum_k"], PARAMS["thresholds"])
        mood_ci += episodes(ms, "check_in")
    return {"patients": len(st), "patient_days": patient_days, "false_check_in_episodes": ci,
            "false_alarms_per_patient_month": stats.rnd(ci / (patient_days / 30), 3),
            "false_watch_episodes": sum(episodes(r["states"], "watch") for r in st),
            "false_booster_episodes": sum(episodes(r["states"], "booster") for r in st),
            "patients_with_any_check_in_share": stats.rnd(
                sum(first_at_least(r["states"], "check_in", FIRST_DAY) is not None for r in st) / len(st), 2),
            "mood_only_false_check_in_episodes": mood_ci,
            "rough_patch_note": "about half of the stable controls get a short simulated rough patch (4 to 8 days)"}


def bandit_metrics(rows) -> dict:
    out = {"true_best": {"mode": "calm", "task_id": "breath"}, "target_p_best": bandit.BEST_TARGET}
    by_mode = {}
    target = bandit.BEST_TARGET
    for mode in ("calm", "wake", "fatigue"):
        firsts, stays, found, wrong_first, dropped = [], [], 0, 0, 0
        early, late = [], []
        for r in rows:
            best = r["p"]["truth"]["best_arm"][mode]
            traces = p_best_traces(r["p"]["sessions"], mode)
            first = first_crossing(traces[best], target)
            stay = stays_from(traces[best], target)
            firsts.append(first)
            stays.append(stay)
            found += stay is not None
            dropped += first is not None and stay != first
            others = [first_crossing(t, target) for a, t in traces.items() if a != best]
            wrong = [k for k in others if k is not None]
            wrong_first += bool(wrong) and (first is None or min(wrong) < first)
            early.append(arm_choice_share(r["p"]["sessions"], mode, best, 0, 14))
            late.append(arm_choice_share(r["p"]["sessions"], mode, best, DAYS - 14, DAYS))
        by_mode[mode] = {"sessions_to_p_best_0_8": summary(stays),
                         "sessions_to_first_p_best_0_8": summary(firsts),
                         "found_share_by_day_56": stats.rnd(found / len(rows), 2),
                         "dropped_back_after_first_crossing_share": stats.rnd(dropped / len(rows), 2),
                         "wrong_arm_crossed_first_share": stats.rnd(wrong_first / len(rows), 2),
                         "best_arm_pick_share_days_0_13": stats.rnd(stats.mean(early), 2),
                         "best_arm_pick_share_days_42_55": stats.rnd(stats.mean(late), 2)}
    calm = by_mode["calm"]
    out["sessions_to_p_best_0_8"] = calm["sessions_to_p_best_0_8"]
    out["sessions_to_p_best_0_8_rule"] = "first session from which P(best) stays at or above 0.8 to day 55"
    out["sessions_to_first_p_best_0_8"] = calm["sessions_to_first_p_best_0_8"]
    out["wrong_arm_crossed_first_share"] = calm["wrong_arm_crossed_first_share"]
    out["found_share_by_day_56"] = calm["found_share_by_day_56"]
    out["by_mode"] = by_mode
    out["patients"] = len(rows)
    return out


MOOD_K_SWEEP = (0.25, 0.35, 0.5, 0.75, 1.0)


def matched_mood_only_at(series, target_episodes: int, k: float) -> dict:
    for h in np.arange(1.0, 30.01, 0.5):
        th = {**PARAMS["thresholds"], "watch": min(PARAMS["thresholds"]["watch"], float(h)), "check_in": float(h)}
        fa = sum(episodes(cusum_states(s, k, th), "check_in") for kind, s in series if kind == "stable")
        if fa <= target_episodes:
            days = [first_at_least(cusum_states(s, k, th), "check_in", ONSET) for kind, s in series if kind == "relapse"]
            return {"k": k, "check_in_threshold": float(h), "false_check_in_episodes": fa,
                    "days_onset_to_flag": summary([None if d is None else d - ONSET for d in days]),
                    "detected_share": stats.rnd(sum(d is not None for d in days) / len(days), 2)}
    return {"k": k, "check_in_threshold": None, "false_check_in_episodes": None, "days_onset_to_flag": summary([]),
            "detected_share": 0.0}


def matched_mood_only(rows, target_episodes: int) -> dict:
    series = [(r["kind"], mood_only_series(r["score"], PARAMS["z_clip"])) for r in rows]
    sweep = [matched_mood_only_at(series, target_episodes, k) for k in MOOD_K_SWEEP]
    same = next(x for x in sweep if x["k"] == PARAMS["cusum_k"])
    reached = [x for x in sweep if x["days_onset_to_flag"]["median"] is not None]
    best = min(reached, key=lambda x: (x["days_onset_to_flag"]["median"], -x["detected_share"])) if reached else same
    return {**same, "rule": "mood feature alone, composite k, threshold raised until false alarms match",
            "best_k": best, "k_sweep": sweep}


def sensitivity(rows) -> list[dict]:
    table = []
    for k in (0.25, 0.35, 0.5):
        for check_in in (2.0, 3.0, 4.0):
            th = {**PARAMS["thresholds"], "check_in": check_in, "watch": min(PARAMS["thresholds"]["watch"], check_in)}
            leads, fa, days = [], 0, 0
            for r in rows:
                states = cusum_states(r["score"]["composite"][:DAYS], k, th)
                if r["kind"] == "relapse":
                    d = first_at_least(states, "check_in", ONSET)
                    leads.append(None if d is None else d - ONSET)
                else:
                    fa += episodes(states, "check_in")
                    days += DAYS - FIRST_DAY
            n_rel = sum(r["kind"] == "relapse" for r in rows)
            table.append({"k": k, "check_in": check_in, "days_onset_to_check_in": summary(leads),
                          "detected_share": stats.rnd(sum(x is not None for x in leads) / n_rel, 2),
                          "false_alarms_per_patient_month": stats.rnd(fa / (days / 30), 3) if days else None,
                          "current": k == PARAMS["cusum_k"] and check_in == PARAMS["thresholds"]["check_in"]})
    return table


def example(roster_seed: int, today: dt.date | None) -> dict:
    from ..synthetic import demo_roster
    roster = {p["patient"]["id"]: p for p in demo_roster(roster_seed, today)}
    out = {}
    for pid in ("anna", "mikko", "juha"):
        p = roster[pid]
        a = analyze_patient(p["sessions"], p["daily"], p["patient"]["now_day"])
        tl = a["timeline"]
        out[pid] = {"days": tl["days"], "composite": [stats.rnd(v, 2) for v in tl["composite"]], "cusum": tl["cusum"],
                    "state": tl["state"], "onset_day": p["truth"]["onset_day"],
                    "first_check_in_day": a["cusum"]["first_check_in_day"], "simulated": True}
    trace = p_best_trace(roster["anna"]["sessions"], "calm", "breath")
    out["bandit_p_best"] = {"patient": "anna", "mode": "calm", "sessions": list(range(1, len(trace) + 1)),
                            "breath": [stats.rnd(v, 2) for v in trace]}
    return out


def curves(rows) -> dict:
    rel = [r for r in rows if r["kind"] == "relapse"]
    st = [r for r in rows if r["kind"] == "stable"]

    def band(group, key):
        m = np.array([[np.nan if v is None else v for v in r["score"][key][:DAYS]] for r in group], dtype=float)
        q = np.nanpercentile(m, [25, 50, 75], axis=0)
        return {n: [stats.rnd(v, 2) for v in q[i]] for i, n in enumerate(("p25", "median", "p75"))}

    traces = [p_best_trace(r["p"]["sessions"], "calm", r["p"]["truth"]["best_arm"]["calm"]) for r in rows]
    n = min(40, max(len(t) for t in traces))
    m = np.array([[t[i] if i < len(t) else np.nan for i in range(n)] for t in traces], dtype=float)
    q = np.nanpercentile(m, [25, 50, 75], axis=0)
    return {"days": list(range(DAYS)), "relapse_composite": band(rel, "composite"), "stable_composite": band(st, "composite"),
            "relapse_cusum": band(rel, "cusum"), "stable_cusum": band(st, "cusum"),
            "bandit_sessions": list(range(1, n + 1)),
            "bandit_p_best": {k: [stats.rnd(v, 2) for v in q[i]] for i, k in enumerate(("p25", "median", "p75"))}}


def run_validation(n_seeds: int = 50, *, roster_seed: int = 7, today: dt.date | None = None,
                   generated_iso: str | None = None, include_curves: bool = False) -> dict:
    rows = run_patients(n_seeds)
    result = {
        "schema": "afferent.validation/1", "simulated": True, "untuned": True, "disclaimer": DISCLAIMER,
        "generated_iso": generated_iso, "n_seeds": n_seeds,
        "params": {"cusum_k": PARAMS["cusum_k"], "thresholds": dict(PARAMS["thresholds"]),
                   "ewma_lambda": PARAMS["ewma_lambda"], "cusum_start_day": PARAMS["cusum_start_day"]},
        "relapse": detection(rows), "stable": false_alarms(rows), "bandit": bandit_metrics(rows),
        "sensitivity": sensitivity(rows), "example": example(roster_seed, today),
    }
    result["relapse"]["mood_only_at_matched_false_alarms"] = matched_mood_only(
        rows, result["stable"]["false_check_in_episodes"])
    if include_curves:
        result["curves"] = curves(rows)
    return result
