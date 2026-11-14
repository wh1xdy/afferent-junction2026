"""Compare recent sensor levels with each patient's own recent reference."""
import copy
import math
import random
import statistics
from datetime import date, timedelta


INDICATORS = {
    "outings": {"metric": "presence.outing", "field": "minutes", "better": "higher",
                "label": "time spent outside"},
    "visits": {"metric": "presence.guest_visit", "field": "minutes", "better": "higher",
               "label": "time with visitors"},
    "hrv": {"metric": "vitals.hrv_rmssd_ms", "field": "median", "better": "higher",
            "label": "heart-rate variability"},
    "posture": {"metric": "posture.head_trunk_angle_deg", "field": "median", "better": "lower",
                "label": "upright posture"},
}

THRESHOLD = 0.8
REF_DAYS = 14
RECENT_DAYS = 3
MIN_REF_DAYS = 5
DEMO_SCORES = {"outings": 0.55, "visits": 0.4}
BASES = {"outings": 120.0, "visits": 60.0, "hrv": 45.0, "posture": 12.0}
SCENARIOS: dict[str, dict] = {
    "stable": {"description": "Everything at the usual level", "ratios": {}},
    "withdrawal": {"description": "Social withdrawal: fewer outings and visits",
                   "ratios": {"outings": 0.5, "visits": 0.3}},
    "stress": {"description": "Lower heart-rate variability", "ratios": {"hrv": 0.7}},
    "slumped": {"description": "More slumped posture", "ratios": {"posture": 0.7}},
    "global_decline": {"description": "Every indicator down",
                       "ratios": {key: 0.6 for key in INDICATORS}},
    "borderline": {"description": "Slightly down but above the 80% threshold",
                   "ratios": {"outings": 0.88, "visits": 0.88}},
    "recovering": {"description": "Better than usual", "ratios": {key: 1.15 for key in INDICATORS}},
}


def empty_report(threshold=THRESHOLD, ref_days=REF_DAYS, recent_days=RECENT_DAYS) -> dict:
    return {
        "level": "ok",
        "threshold": threshold,
        "ref_days": ref_days,
        "recent_days": recent_days,
        "forced": False,
        "indicators": [
            {"key": key, "metric": indicator["metric"], "label": indicator["label"],
             "better": indicator["better"], "reference": None, "current": None, "score": None,
             "status": "no_data", "days_reference": 0, "days_recent": 0}
            for key, indicator in INDICATORS.items()
        ],
    }


def synthetic_get(name: str, ref_days=REF_DAYS, recent_days=RECENT_DAYS):
    if name not in SCENARIOS:
        raise ValueError(f"unknown decline scenario: {name}")
    ratios = SCENARIOS[name]["ratios"]
    today = date.today()

    def get(endpoint, params):
        if endpoint != "daily":
            raise ValueError(f"unsupported synthetic endpoint: {endpoint}")
        indicator = next((i for i in INDICATORS.values() if i["metric"] == params.get("metric")), None)
        if indicator is None:
            raise ValueError(f"unknown synthetic metric: {params.get('metric')}")
        key = next(key for key, value in INDICATORS.items() if value is indicator)
        rng = random.Random(f"{name}:{key}")
        ratio = ratios.get(key, 1.0)
        base = BASES[key]
        recent_value = base * ratio if indicator["better"] == "higher" else base / ratio
        rows = []
        days = ref_days + recent_days
        for offset in range(days, recent_days, -1):
            value = base * (1 + rng.uniform(-0.03, 0.03))
            rows.append({
                "day": (today - timedelta(days=offset)).isoformat(),
                indicator["field"]: value,
                "partial_day": False,
            })
        for offset in range(recent_days, 0, -1):
            value = recent_value * (1 + rng.uniform(-0.03, 0.03))
            rows.append({
                "day": (today - timedelta(days=offset)).isoformat(),
                indicator["field"]: value,
                "partial_day": False,
            })
        rows.append({
            "day": today.isoformat(),
            indicator["field"]: base * 1000,
            "partial_day": True,
        })
        return {"days": rows}

    return get


def _valid_value(value) -> bool:
    return (isinstance(value, (int, float)) and not isinstance(value, bool)
            and math.isfinite(value))


def analyze(get, threshold=THRESHOLD, ref_days=REF_DAYS, recent_days=RECENT_DAYS) -> dict:
    report = empty_report(threshold, ref_days, recent_days)
    for result, (key, indicator) in zip(report["indicators"], INDICATORS.items()):
        try:
            response = get("daily", {
                "metric": indicator["metric"],
                "from": f"-{ref_days + recent_days + 1}d",
            })
        except Exception:
            result["status"] = "no_data"
            continue

        rows = (response or {}).get("days") or []
        rows = [row for row in rows if not row.get("partial_day")
                and _valid_value(row.get(indicator["field"]))]
        rows.sort(key=lambda row: row.get("day") or row.get("date") or "")
        recent = rows[-recent_days:] if recent_days > 0 else []
        reference = rows[:-recent_days] if recent_days > 0 else rows
        reference = reference[-ref_days:] if ref_days > 0 else []
        result["days_reference"] = len(reference)
        result["days_recent"] = len(recent)

        if len(reference) < MIN_REF_DAYS or not recent:
            result["status"] = "not_enough_data"
            continue

        ref_value = statistics.median(row[indicator["field"]] for row in reference)
        current_value = statistics.mean(row[indicator["field"]] for row in recent)
        result["reference"] = ref_value
        result["current"] = current_value
        if ref_value <= 0:
            result["status"] = "not_enough_data"
            continue

        if indicator["better"] == "higher":
            score = current_value / ref_value
        elif current_value <= 0:
            score = 1.001
        else:
            score = ref_value / current_value
        result["score"] = round(score, 3)
        result["status"] = "low" if result["score"] < threshold else "ok"

    report["level"] = "low" if any(i["status"] == "low" for i in report["indicators"]) else "ok"
    return report


def apply_override(report: dict, scores: dict[str, float]) -> dict:
    if not isinstance(scores, dict):
        raise ValueError("scores must be an object")
    unknown = set(scores) - set(INDICATORS)
    if unknown:
        raise ValueError(f"unknown decline indicator: {sorted(unknown, key=str)[0]}")

    validated = {}
    for key, score in scores.items():
        if (not isinstance(score, (int, float)) or isinstance(score, bool)
                or not math.isfinite(score) or not 0 <= score <= 2):
            raise ValueError(f"score for {key} must be a finite number from 0 to 2")
        validated[key] = float(score)

    result = copy.deepcopy(report)
    result["forced"] = False
    for indicator in result["indicators"]:
        indicator["forced"] = False
        key = indicator["key"]
        if key not in validated:
            continue
        score = validated[key]
        indicator["score"] = round(score, 3)
        indicator["status"] = "low" if score < result["threshold"] else "ok"
        indicator["forced"] = True
        reference = indicator.get("reference")
        if reference is not None:
            if indicator["better"] == "higher":
                indicator["current"] = reference * score
            else:
                indicator["current"] = reference / score if score > 0 else None
        result["forced"] = True
    result["level"] = "low" if any(i["status"] == "low" for i in result["indicators"]) else "ok"
    return result


def facts(report: dict) -> list[str]:
    result = []
    for indicator in report["indicators"]:
        if indicator["status"] != "low" or indicator["score"] is None:
            continue
        percent = round(indicator["score"] * 100)
        fact = (f'{indicator["label"]} is at {percent}% of their usual level over the last '
                f'{report["recent_days"]} days')
        result.append(fact[:160])
    return result
