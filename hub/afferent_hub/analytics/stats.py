import math
from collections.abc import Sequence

import numpy as np

MAD_TO_SD = 1.4826


def clean(values: Sequence) -> list[float]:
    return [float(v) for v in values if v is not None and not (isinstance(v, float) and math.isnan(v))]


def median(values: Sequence) -> float | None:
    xs = clean(values)
    return float(np.median(xs)) if xs else None


def mad(values: Sequence) -> float | None:
    xs = clean(values)
    if not xs:
        return None
    m = np.median(xs)
    return float(np.median(np.abs(np.asarray(xs) - m)))


def quantiles(values: Sequence) -> list[float] | None:
    xs = clean(values)
    return [float(np.percentile(xs, q)) for q in (25, 75)] if xs else None


def baseline(series: Sequence, floor: float, *, days: int = 14, min_obs: int = 7, now_day: int | None = None) -> dict:
    last_allowed = len(series) - 1 if now_day is None else min(now_day, len(series) - 1)
    end = min(days - 1, last_allowed)
    picked = [(d, series[d]) for d in range(0, end + 1) if series[d] is not None]
    d = end
    while len(picked) < min_obs and d < last_allowed:
        d += 1
        if series[d] is not None:
            picked.append((d, series[d]))
    end = max(end, d) if picked else end
    if not picked:
        return {"median": None, "mad": None, "scale": None, "n": 0, "first_day": None, "last_day": None,
                "ready": False, "band_lo": None, "band_hi": None}
    vals = [v for _, v in picked]
    med = median(vals)
    raw_mad = mad(vals)
    scale = max(MAD_TO_SD * raw_mad, floor)
    return {"median": med, "mad": raw_mad, "scale": scale, "n": len(vals), "first_day": 0, "last_day": end,
            "ready": len(vals) >= min_obs, "band_lo": med - scale, "band_hi": med + scale}


def robust_z(x: float | None, med: float | None, scale: float | None) -> float | None:
    if x is None or med is None or not scale:
        return None
    return (x - med) / scale


def ewma(series: Sequence, lam: float = 0.3, stale_days: int = 3) -> list[float | None]:
    out: list[float | None] = []
    level = None
    last_obs = None
    for d, x in enumerate(series):
        if x is not None:
            level = x if level is None else lam * x + (1 - lam) * level
            last_obs = d
        out.append(level if last_obs is not None and d - last_obs <= stale_days else None)
    return out


def rolling(series: Sequence, window: int = 7, min_obs: int = 3, fn=median) -> list[float | None]:
    out = []
    for d in range(len(series)):
        vals = clean(series[max(0, d - window + 1): d + 1])
        out.append(fn(vals) if len(vals) >= min_obs else None)
    return out


def mean(values: Sequence) -> float | None:
    xs = clean(values)
    return float(np.mean(xs)) if xs else None


def cusum(series: Sequence, k: float = 0.5, start: int = 0) -> list[float]:
    s = 0.0
    out = []
    for d, x in enumerate(series):
        if d >= start and x is not None:
            s = max(0.0, s + x - k)
        out.append(s if d >= start else 0.0)
    return out


def state_for(value: float, thresholds: dict) -> str:
    if value >= thresholds["booster"]:
        return "booster"
    if value >= thresholds["check_in"]:
        return "check_in"
    if value >= thresholds["watch"]:
        return "watch"
    return "stable"


def inter_daily_stability(days: Sequence[Sequence[float]]) -> float | None:
    rows = [r for r in days if r is not None and len(r) > 0]
    if not rows:
        return None
    x = np.asarray(rows, dtype=float)
    total_var = np.sum((x - x.mean()) ** 2)
    if total_var <= 0:
        return None
    n, p = x.size, x.shape[1]
    hourly = x.mean(axis=0)
    return float(n * np.sum((hourly - x.mean()) ** 2) / (p * total_var))


def intradaily_variability(days: Sequence[Sequence[float]]) -> float | None:
    rows = [r for r in days if r is not None and len(r) > 0]
    if not rows:
        return None
    x = np.concatenate([np.asarray(r, dtype=float) for r in rows])
    total_var = np.sum((x - x.mean()) ** 2)
    if total_var <= 0 or x.size < 2:
        return None
    return float(x.size * np.sum(np.diff(x) ** 2) / ((x.size - 1) * total_var))


def log_b(rc: int, ri: int, lc: int, li: int) -> float:
    return 0.5 * math.log10(((rc + 0.5) * (li + 0.5)) / ((ri + 0.5) * (lc + 0.5)))


def log_d(rc: int, ri: int, lc: int, li: int) -> float:
    return 0.5 * math.log10(((rc + 0.5) * (lc + 0.5)) / ((ri + 0.5) * (li + 0.5)))


def rnd(x, nd: int = 3):
    if x is None:
        return None
    return round(float(x), nd) + 0.0
