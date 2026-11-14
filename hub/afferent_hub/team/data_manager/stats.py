"""Statistics, pure stdlib (no numpy/scipy: the container stays small and boots fast).

All functions take plain lists and tolerate empty / tiny inputs by returning
None fields rather than raising, so an API call on a quiet sensor still answers.

  describe        n, mean, std, min/max, percentiles
  mann_kendall    monotonic trend test (non-parametric, robust to outliers and
                  non-normal data; standard for environmental / physiological
                  series), with tie correction and a normal approximation
  sen_slope       Theil–Sen slope: median of pairwise slopes (robust trend size)
  robust_z        deviation of a value from a personal baseline, using
                  median and MAD instead of mean and SD
  pearson / spearman  correlation with a Fisher-z p-value

These are exploratory descriptors of one person's data relative to their own
history. They are not a diagnosis and have not been clinically validated.
"""
from __future__ import annotations

import math
from typing import Sequence

MAD_TO_SD = 1.4826   # MAD of a normal distribution * 1.4826 = SD


def _norm_sf(z: float) -> float:
    """Survival function of the standard normal, P(Z > z)."""
    return 0.5 * math.erfc(z / math.sqrt(2))


def percentile(sorted_vals: Sequence[float], q: float) -> float | None:
    """Linear interpolation between closest ranks (numpy's default)."""
    n = len(sorted_vals)
    if n == 0:
        return None
    if n == 1:
        return float(sorted_vals[0])
    pos = (n - 1) * q
    lo = math.floor(pos)
    hi = min(lo + 1, n - 1)
    frac = pos - lo
    return float(sorted_vals[lo] + (sorted_vals[hi] - sorted_vals[lo]) * frac)


def median(vals: Sequence[float]) -> float | None:
    return percentile(sorted(vals), 0.5)


def _r(x, nd=3):
    return None if x is None else round(x, nd)


def describe(vals: Sequence[float], nd: int = 3) -> dict:
    n = len(vals)
    if n == 0:
        return {"n": 0, "mean": None, "std": None, "min": None, "p10": None, "p25": None,
                "median": None, "p75": None, "p90": None, "max": None, "iqr": None}
    s = sorted(vals)
    mean = sum(s) / n
    std = math.sqrt(sum((v - mean) ** 2 for v in s) / (n - 1)) if n > 1 else None
    p25, p75 = percentile(s, 0.25), percentile(s, 0.75)
    return {"n": n, "mean": _r(mean, nd), "std": _r(std, nd), "min": _r(s[0], nd),
            "p10": _r(percentile(s, 0.10), nd), "p25": _r(p25, nd),
            "median": _r(percentile(s, 0.5), nd), "p75": _r(p75, nd),
            "p90": _r(percentile(s, 0.90), nd), "max": _r(s[-1], nd),
            "iqr": _r(p75 - p25, nd)}


def mann_kendall(vals: Sequence[float], alpha: float = 0.05) -> dict:
    """Mann–Kendall trend test. Needs >= 4 points for a meaningful answer.

    Returns S, tau, z, two-sided p and trend in {"increasing", "decreasing", "no trend"}.
    O(n^2): call it on daily values (n = days), not on raw samples.
    """
    x = list(vals)
    n = len(x)
    if n < 4:
        return {"n": n, "s": None, "tau": None, "z": None, "p": None, "trend": "insufficient data"}
    s = 0
    for i in range(n - 1):
        xi = x[i]
        for j in range(i + 1, n):
            d = x[j] - xi
            s += (d > 0) - (d < 0)
    # tie correction
    counts: dict[float, int] = {}
    for v in x:
        counts[v] = counts.get(v, 0) + 1
    ties = sum(t * (t - 1) * (2 * t + 5) for t in counts.values() if t > 1)
    var = (n * (n - 1) * (2 * n + 5) - ties) / 18
    if var <= 0:
        return {"n": n, "s": s, "tau": 0.0, "z": 0.0, "p": 1.0, "trend": "no trend"}
    z = (s - 1) / math.sqrt(var) if s > 0 else (s + 1) / math.sqrt(var) if s < 0 else 0.0
    p = 2 * _norm_sf(abs(z))
    tau = s / (n * (n - 1) / 2)
    trend = "no trend" if p >= alpha else ("increasing" if z > 0 else "decreasing")
    return {"n": n, "s": s, "tau": round(tau, 3), "z": round(z, 3), "p": round(p, 4), "trend": trend}


def sen_slope(xs: Sequence[float], ys: Sequence[float]) -> float | None:
    """Theil–Sen estimator: median of slopes over all pairs with distinct x."""
    slopes = []
    n = len(xs)
    for i in range(n - 1):
        for j in range(i + 1, n):
            dx = xs[j] - xs[i]
            if dx:
                slopes.append((ys[j] - ys[i]) / dx)
    return median(slopes) if slopes else None


def robust_z(value: float, history: Sequence[float]) -> dict:
    """How unusual is `value` compared with `history` (the personal baseline)?

    z = (value - median) / (1.4826 * MAD). Falls back to the SD if MAD is 0
    (very flat history); None if the history is too short (< 5 points).
    """
    h = list(history)
    if len(h) < 5 or value is None:
        return {"baseline_n": len(h), "baseline_median": _r(median(h)) if h else None,
                "baseline_spread": None, "z": None}
    med = median(h)
    mad = median([abs(v - med) for v in h])
    spread = mad * MAD_TO_SD
    if not spread:
        d = describe(h)
        spread = d["std"] or 0.0
    z = (value - med) / spread if spread else None
    return {"baseline_n": len(h), "baseline_median": _r(med), "baseline_spread": _r(spread),
            "z": _r(z, 2)}


def pearson(xs: Sequence[float], ys: Sequence[float]) -> float | None:
    n = len(xs)
    if n < 3:
        return None
    mx, my = sum(xs) / n, sum(ys) / n
    sxy = sum((a - mx) * (b - my) for a, b in zip(xs, ys))
    sxx = sum((a - mx) ** 2 for a in xs)
    syy = sum((b - my) ** 2 for b in ys)
    if sxx == 0 or syy == 0:
        return None
    return sxy / math.sqrt(sxx * syy)


def _ranks(vals: Sequence[float]) -> list[float]:
    order = sorted(range(len(vals)), key=lambda i: vals[i])
    ranks = [0.0] * len(vals)
    i = 0
    while i < len(order):
        j = i
        while j + 1 < len(order) and vals[order[j + 1]] == vals[order[i]]:
            j += 1
        avg = (i + j) / 2 + 1
        for k in range(i, j + 1):
            ranks[order[k]] = avg
        i = j + 1
    return ranks


def spearman(xs: Sequence[float], ys: Sequence[float]) -> float | None:
    if len(xs) < 3:
        return None
    return pearson(_ranks(xs), _ranks(ys))


def corr_p(r: float | None, n: int) -> float | None:
    """Two-sided p-value for H0: rho = 0, Fisher z approximation (fine for n >= 10)."""
    if r is None or n < 4:
        return None
    r = max(min(r, 0.999999), -0.999999)
    z = math.atanh(r) * math.sqrt(n - 3)
    return 2 * _norm_sf(abs(z))


def correlation(xs: Sequence[float], ys: Sequence[float]) -> dict:
    n = len(xs)
    rp, rs = pearson(xs, ys), spearman(xs, ys)
    return {"n": n, "pearson_r": _r(rp), "pearson_p": _r(corr_p(rp, n), 4),
            "spearman_rho": _r(rs), "spearman_p": _r(corr_p(rs, n), 4)}
