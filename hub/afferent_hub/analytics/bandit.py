import numpy as np

from . import stats
from .features import PLAYED, get

MODE_ARMS = {
    "calm": ["breath", "loyly", "stars"],
    "wake": ["fireflies", "beacon", "bells", "shutters"],
    "fatigue": ["shutters", "bells", "beacon", "fireflies"],
    "rest": ["breath"],
}
FLOW = ["threads", "stars"]
MODES = ["calm", "flow", "wake", "fatigue", "rest"]
LABELS = {"breath": "Breath", "loyly": "Löyly", "threads": "Aurora threads", "stars": "Constellation",
          "fireflies": "Fireflies", "beacon": "Beacon", "bells": "Bells", "shutters": "Shutters",
          "fork": "Fork", "lanterns": "Two lanterns"}
VERBS = {"calm": "settled the pulse", "rest": "settled the pulse", "wake": "lifted the pulse",
         "fatigue": "lifted the pulse"}
PRIOR = (1, 1)
DRAWS = 4000
SEED = 0
WEIGHT_FLOOR = 0.05
BEST_TARGET = 0.8


def task_instances(sessions: list[dict]):
    for s in sorted(sessions, key=lambda s: (s.get("day_index") or 0, s.get("started_iso") or "")):
        if s.get("status") not in PLAYED:
            continue
        for t in s.get("tasks") or []:
            if t.get("kind") == "adaptive" and t.get("id") in MODE_ARMS.get(t.get("mode"), []):
                yield s, t


def counts(sessions: list[dict]) -> dict[tuple[str, str], list[int]]:
    c = {(m, a): [0, 0] for m, arms in MODE_ARMS.items() for a in arms}
    for _, t in task_instances(sessions):
        if t.get("helped") is None or t.get("completed_by") == "skipped":
            continue
        c[(t["mode"], t["id"])][0 if t["helped"] else 1] += 1
    return c


def posterior_draws(alpha: list[float], beta: list[float], draws: int = DRAWS, seed: int = SEED) -> np.ndarray:
    rng = np.random.default_rng(seed)
    return np.stack([rng.beta(a, b, draws) for a, b in zip(alpha, beta)])


def p_best_from_counts(alpha: list[float], beta: list[float], draws: int = DRAWS, seed: int = SEED):
    x = posterior_draws(alpha, beta, draws, seed)
    best = np.argmax(x, axis=0)
    p = np.bincount(best, minlength=len(alpha)) / draws
    return p, x


def arms(sessions: list[dict]) -> list[dict]:
    c = counts(sessions)
    out = []
    for mode, ids in MODE_ARMS.items():
        alpha = [PRIOR[0] + c[(mode, a)][0] for a in ids]
        beta = [PRIOR[1] + c[(mode, a)][1] for a in ids]
        p, x = p_best_from_counts(alpha, beta)
        for i, a in enumerate(ids):
            helped, not_helped = c[(mode, a)]
            lo, hi = np.percentile(x[i], [5, 95])
            out.append({"mode": mode, "task_id": a, "label": LABELS[a], "alpha": alpha[i], "beta": beta[i],
                        "n": helped + not_helped, "helped": helped, "mean": stats.rnd(alpha[i] / (alpha[i] + beta[i])),
                        "ci90": [stats.rnd(lo), stats.rnd(hi)], "p_best": stats.rnd(p[i])})
    return out


def weights_from_arms(arm_list: list[dict]) -> dict[str, dict[str, float]]:
    w: dict[str, dict[str, float]] = {}
    for mode in MODES:
        if mode == "flow":
            w[mode] = {a: stats.rnd(1 / len(FLOW)) for a in FLOW}
            continue
        raw = {a["task_id"]: max(a["p_best"], WEIGHT_FLOOR) for a in arm_list if a["mode"] == mode}
        total = sum(raw.values())
        w[mode] = {k: stats.rnd(v / total) for k, v in raw.items()}
    return w


def task_weights(sessions: list[dict]) -> dict[str, dict[str, float]]:
    return weights_from_arms(arms(sessions))


def by_mode(arm_list: list[dict]) -> dict:
    out = {}
    for mode in MODE_ARMS:
        ms = [a for a in arm_list if a["mode"] == mode]
        best = max(ms, key=lambda a: (a["p_best"], a["mean"]))
        out[mode] = {"best": best["task_id"], "label": best["label"], "p_best": best["p_best"],
                     "n": sum(a["n"] for a in ms)}
    return out


def headline(arm_list: list[dict]) -> dict:
    multi = [a for a in arm_list if len(MODE_ARMS[a["mode"]]) > 1 and a["n"] > 0]
    if not multi:
        return {"mode": None, "task_id": None, "label": None, "p_best": None,
                "text": "Not enough sessions yet to say what helps."}
    best = max(multi, key=lambda a: (a["p_best"], a["n"]))
    text = (f"{best['label']} {VERBS[best['mode']]} by 2 bpm or more in {best['helped']} of {best['n']} "
            f"{best['mode']} runs (P(best) {best['p_best']:.2f}).")
    return {"mode": best["mode"], "task_id": best["task_id"], "label": best["label"], "p_best": best["p_best"],
            "text": text}


def immediate(sessions: list[dict]) -> list[dict]:
    rows: dict[tuple[str, str], dict[str, list]] = {}
    for _, t in task_instances(sessions):
        if t.get("completed_by") == "skipped":
            continue
        r = rows.setdefault((t["mode"], t["id"]), {"pulse": [], "pitch": [], "eyes": [], "slope": []})
        if (get(t, "pulse", "quality") or 0) >= 0.5:
            r["pulse"].append(get(t, "pulse", "delta_bpm"))
            r["slope"].append(get(t, "pulse", "recovery_slope_bpm_per_min"))
        r["pitch"].append(t.get("head_pitch_delta_deg"))
        r["eyes"].append(t.get("eye_openness_mean"))
    out = []
    for mode, ids in MODE_ARMS.items():
        for a in ids:
            r = rows.get((mode, a))
            if not r:
                continue
            iqr = stats.quantiles(r["pulse"])
            out.append({"mode": mode, "task_id": a, "label": LABELS[a], "n": len(stats.clean(r["pulse"])),
                        "pulse_delta_median": stats.rnd(stats.median(r["pulse"]), 2),
                        "pulse_delta_iqr": [stats.rnd(q, 2) for q in iqr] if iqr else None,
                        "recovery_slope_median": stats.rnd(stats.median(r["slope"]), 2),
                        "head_pitch_delta_median": stats.rnd(stats.median(r["pitch"]), 2),
                        "eye_openness_median": stats.rnd(stats.median(r["eyes"]), 3)})
    return out


def next_day(main_sessions: list, daily: dict, composite: list, now_day: int, min_n: int = 5, max_tasks: int = 4) -> list[dict]:
    n = now_day + 1
    mood_next = [get(main_sessions[d + 1], "core", "mood_start") if d + 1 < n and main_sessions[d + 1] else None
                 for d in range(n)]
    comp_delta = [composite[d + 1] - composite[d] if d + 1 < n and composite[d] is not None
                  and composite[d + 1] is not None else None for d in range(n)]

    def compare(kind, ident, label, has):
        with_m = [mood_next[d] for d in range(n) if has[d] is True]
        without_m = [mood_next[d] for d in range(n) if has[d] is False]
        with_c = [comp_delta[d] for d in range(n) if has[d] is True]
        without_c = [comp_delta[d] for d in range(n) if has[d] is False]
        nw, nwo = len(stats.clean(with_m)), len(stats.clean(without_m))
        if nw < min_n or nwo < min_n:
            return None
        mw, mwo = stats.mean(with_m), stats.mean(without_m)
        cw, cwo = stats.mean(with_c), stats.mean(without_c)
        return {"kind": kind, "id": ident, "label": label, "n_with": nw, "n_without": nwo,
                "next_mood_with": stats.rnd(mw, 1), "next_mood_without": stats.rnd(mwo, 1),
                "mood_diff": stats.rnd(mw - mwo, 1),
                "next_composite_delta_with": stats.rnd(cw, 2), "next_composite_delta_without": stats.rnd(cwo, 2),
                "composite_diff": stats.rnd(cw - cwo, 2) if cw is not None and cwo is not None else None,
                "note": "association, not causation"}

    tasks = []
    for a in sorted({a for ids in MODE_ARMS.values() for a in ids} | set(FLOW)):
        has = [None if main_sessions[d] is None else any(
            t.get("id") == a and t.get("completed_by") != "skipped" for t in main_sessions[d].get("tasks") or [])
            for d in range(n)]
        row = compare("task", a, LABELS[a], has)
        if row:
            tasks.append(row)
    tasks = sorted(sorted(tasks, key=lambda r: -r["n_with"])[:max_tasks], key=lambda r: -(r["mood_diff"] or 0))
    light = [None] * n
    for d in range(n):
        m = get(daily.get(d), "bedside_light", "morning_light_min")
        light[d] = None if m is None else m > 0
    row = compare("stimulus", "dawn_light", "Bedside dawn light", light)
    return tasks + ([row] if row else [])


def build(sessions: list[dict], main_sessions: list, daily: dict, composite: list, now_day: int) -> dict:
    arm_list = arms(sessions)
    return {"outcome": "helped", "prior": list(PRIOR), "method": "thompson_beta_bernoulli", "arms": arm_list,
            "by_mode": by_mode(arm_list), "weights": weights_from_arms(arm_list),
            "next_day": next_day(main_sessions, daily, composite, now_day), "headline": headline(arm_list),
            "immediate": immediate(sessions)}
