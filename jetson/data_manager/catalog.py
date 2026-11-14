"""Built-in catalog of what the data manager accepts.

Two kinds of data:

  sample    a point measurement: (ts, value) — temperature, heart rate, CO2, angles…
  interval  something with a start and an end: (start, end, value) — the patient
            being home, an outing, a guest visit (value = number of guests).

Every metric has a unit and a plausible range. Values outside the range are
rejected at ingestion (a 300 BPM pulse or a 900 °C room is a sensor fault, not a
measurement), so statistics are never polluted by glitches.

New metrics (e.g. a CO2 sensor that is not listed yet) are registered at runtime
with `POST /api/v1/metrics`; they are stored in the DB and survive restarts.
Unknown metric names are rejected so a typo in a producer never silently
creates a new series.

`baseline_min_hours`: how many distinct observed hours a day needs before it counts in
GET /baseline (default 4). Spot-check metrics (heart rate from a finger clip) use 0,
posture (only measured while standing in view) uses 1.
"""
from __future__ import annotations

import re

SAMPLE = "sample"
INTERVAL = "interval"
KINDS = (SAMPLE, INTERVAL)

DEFAULT_BASELINE_MIN_HOURS = 4   # a day needs this many observed hours to enter a baseline

NAME_RE = re.compile(r"^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$")   # e.g. env.co2_ppm

BUILTIN: dict[str, dict] = {
    # ── environment (UNO Q Modulino Thermo, later a CO2 sensor) ──────────────
    "env.temperature_c": dict(kind=SAMPLE, unit="°C", min=-20, max=60,
                              description="Ambient temperature"),
    "env.humidity_pct": dict(kind=SAMPLE, unit="%RH", min=0, max=100,
                             description="Ambient relative humidity"),
    "env.co2_ppm": dict(kind=SAMPLE, unit="ppm", min=250, max=10000,
                        description="Indoor CO2 concentration (planned sensor)"),
    # ── vitals ───────────────────────────────────────────────────────────────
    # Contact sensors and the camera estimate are separate metrics: their error
    # profiles differ, so pooling them would make daily stats and baselines
    # meaningless. Spot measurements (a finger on the clip for a few minutes) are
    # normal, so a day counts for the baseline with any coverage.
    "vitals.heart_rate_bpm": dict(kind=SAMPLE, unit="bpm", min=30, max=220, baseline_min_hours=0,
                                  description="Heart rate from a contact sensor (finger PulseSensor, "
                                              "strap, watch); use `source` per device"),
    "vitals.heart_rate_camera_bpm": dict(kind=SAMPLE, unit="bpm", min=30, max=220, baseline_min_hours=0,
                                         description="Heart rate estimated contact-free from a camera "
                                                     "(rPPG); quality = trust score / 100"),
    "vitals.hrv_rmssd_ms": dict(kind=SAMPLE, unit="ms", min=1, max=300, baseline_min_hours=0,
                                description="Heart-rate variability, RMSSD of successive beat intervals"),
    "vitals.breathing_rate_per_min": dict(kind=SAMPLE, unit="/min", min=3, max=60, baseline_min_hours=0,
                                          description="Breathing rate"),
    # ── posture (camera pose pipeline, posture-analysis geometry.py) ─────────
    # Same functions as the runtime; only measured standing / walking
    # (knee >= 120 deg, hip-ankle span only as fallback when knees are not visible).
    "posture.trunk_inclination_deg": dict(kind=SAMPLE, unit="deg", min=-90, max=90, baseline_min_hours=1,
                                          description="Trunk vs vertical: mid-hip -> mid-shoulder "
                                                      "(0 = upright; relative to the upright "
                                                      "calibration when one exists)"),
    "posture.head_trunk_angle_deg": dict(kind=SAMPLE, unit="deg", min=0, max=180, baseline_min_hours=1,
                                         description="Head vs trunk: angle between hip->shoulder "
                                                     "and shoulder->ear (0 = head stacked on the trunk)"),
    # ── presence (Wi-Fi / BLE presence app) ──────────────────────────────────
    "presence.home": dict(kind=INTERVAL, unit="", min=None, max=None,
                          description="Patient at home (start = arrived, end = left; open while home)"),
    "presence.outing": dict(kind=INTERVAL, unit="", min=None, max=None,
                            description="Patient away from home"),
    "presence.guest_visit": dict(kind=INTERVAL, unit="guests", min=0, max=50,
                                 description="Other people at home; value = peak number of guests"),
}


def validate_definition(name: str, d: dict) -> dict:
    """Normalise a user-supplied metric definition; raises ValueError."""
    if not NAME_RE.match(name or ""):
        raise ValueError("name must look like 'group.metric_name' (lowercase, dot-separated)")
    kind = d.get("kind", SAMPLE)
    if kind not in KINDS:
        raise ValueError(f"kind must be one of {KINDS}")
    lo, hi = d.get("min"), d.get("max")
    for v in (lo, hi):
        if v is not None and not isinstance(v, (int, float)):
            raise ValueError("min/max must be numbers or null")
    if lo is not None and hi is not None and lo >= hi:
        raise ValueError("min must be < max")
    mh = d.get("baseline_min_hours", DEFAULT_BASELINE_MIN_HOURS)
    if not isinstance(mh, (int, float)) or isinstance(mh, bool) or not 0 <= mh <= 24:
        raise ValueError("baseline_min_hours must be a number between 0 and 24")
    return dict(kind=kind, unit=str(d.get("unit", "")), min=lo, max=hi,
                description=str(d.get("description", "")), baseline_min_hours=mh)


def baseline_min_hours(d: dict) -> float:
    v = d.get("baseline_min_hours")
    return DEFAULT_BASELINE_MIN_HOURS if v is None else v
