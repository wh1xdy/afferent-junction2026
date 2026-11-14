from itertools import combinations
from numbers import Real

from . import stats
from .features import get

SECONDARY = [
    {"key": "game_rt_norm", "label": "In-game reaction time, normalised", "unit": "z vs own usual per task kind",
     "source": "session", "worse": "high", "weight": 0.0, "in_composite": False, "floor": 0.5,
     "evidence": "exploratory"},
    {"key": "game_rt_median", "label": "In-game reaction time", "unit": "ms", "source": "session", "worse": "high",
     "weight": 0.0, "in_composite": False, "floor": 20.0, "evidence": "exploratory"},
]
MIN_CELL_N = 3
CELL_FLOOR_MS = 20.0
MIN_COVARIATE_OBS = 5
MIN_COVARIATE_RANGE = 0.1


def number(v) -> float | None:
    return float(v) if isinstance(v, Real) and not isinstance(v, bool) else None


def usable(median, n) -> bool:
    m, k = number(median), number(n)
    return m is not None and m > 0 and k is not None and k >= MIN_CELL_N


def task_cells(task: dict) -> list[tuple[str, float, float]]:
    rt = get(task, "extra", "rt")
    if not isinstance(rt, dict):
        return []
    tid = task.get("id") or "unknown"
    kinds = rt.get("by_kind") if isinstance(rt.get("by_kind"), dict) else {}
    cells = [(f"{tid}:{k}", float(v["median_ms"]), float(v["n"])) for k, v in kinds.items()
             if isinstance(v, dict) and usable(v.get("median_ms"), v.get("n"))]
    if cells:
        return cells
    if usable(rt.get("median_ms"), rt.get("n")):
        return [(f"{tid}:all", float(rt["median_ms"]), float(rt["n"]))]
    return []


def difficulty(task: dict) -> float | None:
    return number(get(task, "extra", "dda", "d_mean"))


def day_tasks(session: dict | None) -> list[dict]:
    if session is None:
        return []
    return [t for t in session.get("tasks") or [] if isinstance(t, dict) and isinstance(get(t, "extra", "rt"), dict)]


def weighted(runs: list[tuple], i: int) -> float | None:
    pairs = [(r[i], r[1]) for r in runs if r[i] is not None]
    total = sum(k for _, k in pairs)
    return sum(v * k for v, k in pairs) / total if total else None


def theil_sen(xs: list[float], ys: list[float]) -> float | None:
    slopes = [(ys[j] - ys[i]) / (xs[j] - xs[i]) for i, j in combinations(range(len(xs)), 2) if abs(xs[j] - xs[i]) > 1e-9]
    return stats.median(slopes)


def adjust(x: list, c: list, last_day: int) -> tuple[list, float | None]:
    base = [d for d in range(last_day + 1) if x[d] is not None and c[d] is not None]
    cs = [c[d] for d in base]
    if len(base) < MIN_COVARIATE_OBS or max(cs) - min(cs) < MIN_COVARIATE_RANGE:
        return x, None
    slope = theil_sen(cs, [x[d] for d in base])
    if slope is None:
        return x, None
    c0 = stats.median(cs)
    return [None if v is None else v - slope * ((c[d] if c[d] is not None else c0) - c0) for d, v in enumerate(x)], slope


def extract(main: list, now_day: int, params: dict) -> dict:
    n = now_day + 1
    raw: list[float | None] = [None] * n
    n_tasks: list[int | None] = [None] * n
    n_trials: list[float | None] = [None] * n
    dda: list[float | None] = [None] * n
    runs: dict[str, list[list]] = {}
    for d in range(n):
        medians, trials, diffs = [], 0.0, []
        for t in day_tasks(main[d]):
            rt, c = t["extra"]["rt"], difficulty(t)
            if usable(rt.get("median_ms"), rt.get("n")):
                medians.append(float(rt["median_ms"]))
                trials += float(rt["n"])
                if c is not None:
                    diffs.append(c)
            for key, med, k in task_cells(t):
                runs.setdefault(key, [[] for _ in range(n)])[d].append((med, k, c))
        if medians:
            raw[d], n_tasks[d], n_trials[d] = stats.median(medians), len(medians), trials
        dda[d] = stats.mean(diffs)
    cells = {key: {"x": [weighted(r, 0) for r in days], "c": [weighted(r, 2) for r in days]}
             for key, days in runs.items()}

    zs: list[list] = [[] for _ in range(n)]
    summary = []
    for key in sorted(cells):
        x, c = cells[key]["x"], cells[key]["c"]
        first = stats.baseline(x, CELL_FLOOR_MS, days=params["baseline_days"], min_obs=params["min_baseline_obs"],
                               now_day=now_day)
        adj, slope = adjust(x, c, first["last_day"] if first["last_day"] is not None else -1)
        base = stats.baseline(adj, CELL_FLOOR_MS, days=params["baseline_days"], min_obs=params["min_baseline_obs"],
                              now_day=now_day)
        if base["n"] >= 3:
            for d in range(n):
                z = stats.robust_z(adj[d], base["median"], base["scale"])
                if z is not None:
                    zs[d].append(z)
        summary.append({"cell": key, "n_days": sum(1 for v in x if v is not None), "baseline_n": base["n"],
                        "baseline_median_ms": stats.rnd(base["median"], 1), "baseline_scale_ms": stats.rnd(base["scale"], 1),
                        "difficulty_slope_ms": stats.rnd(slope, 1)})
    norm = [stats.median(z) if z else None for z in zs]
    n_cells = [len(z) if z else None for z in zs]
    return {"values": {"game_rt_norm": norm, "game_rt_median": raw}, "n_cells": n_cells, "n_tasks": n_tasks,
            "n_trials": n_trials, "dda_d_mean": dda, "cells": summary}


def blocks(main: list, now_day: int, params: dict) -> list[dict]:
    ex = extract(main, now_day, params)
    extras = {"game_rt_norm": {"n_cells": ex["n_cells"]},
              "game_rt_median": {"n_tasks": ex["n_tasks"], "n_trials": ex["n_trials"],
                                 "dda_d_mean": [stats.rnd(v, 3) for v in ex["dda_d_mean"]]}}
    out = []
    for spec in SECONDARY:
        values = ex["values"][spec["key"]]
        base = stats.baseline(values, spec["floor"], days=params["baseline_days"],
                              min_obs=params["min_baseline_obs"], now_day=now_day)
        e = stats.ewma(values, params["ewma_lambda"], params["stale_days"])
        obs = [d for d in range(now_day + 1) if values[d] is not None]
        last = obs[-1] if obs else None
        nd = 1 if spec["unit"] == "ms" else 2
        week = values[max(0, now_day - 6): now_day + 1]
        out.append({
            **{k: spec[k] for k in ("key", "label", "unit", "source", "worse", "weight", "in_composite", "evidence")},
            "covariate": "extra.dda.d_mean",
            "baseline": {k: stats.rnd(v, 3) if isinstance(v, float) else v for k, v in base.items()},
            "latest": {"day": last, "value": stats.rnd(values[last], nd) if last is not None else None,
                       "ewma": stats.rnd(e[now_day], nd), "stale": e[now_day] is None},
            "completeness_7d": stats.rnd(sum(1 for v in week if v is not None) / 7, 2),
            "series": {"value": [stats.rnd(v, nd) for v in values], "ewma": [stats.rnd(v, nd) for v in e],
                       "rolling_7d": [stats.rnd(v, nd) for v in stats.rolling(values, 7, 3)],
                       **extras[spec["key"]]},
            **({"cells": ex["cells"]} if spec["key"] == "game_rt_norm" else {}),
        })
    return out
