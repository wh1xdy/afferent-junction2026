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
"""
from __future__ import annotations

import re

SAMPLE = "sample"
INTERVAL = "interval"
KINDS = (SAMPLE, INTERVAL)

NAME_RE = re.compile(r"^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$")   # e.g. env.co2_ppm

BUILTIN: dict[str, dict] = {
    # ── environment (UNO Q Modulino Thermo, later a CO2 sensor) ──────────────
    "env.temperature_c": dict(kind=SAMPLE, unit="°C", min=-20, max=60,
                              description="Ambient temperature"),
    "env.humidity_pct": dict(kind=SAMPLE, unit="%RH", min=0, max=100,
                             description="Ambient relative humidity"),
    "env.co2_ppm": dict(kind=SAMPLE, unit="ppm", min=250, max=10000,
                        description="Indoor CO2 concentration (planned sensor)"),
    # ── vitals (finger PulseSensors, camera rPPG, phone) ─────────────────────
    "vitals.heart_rate_bpm": dict(kind=SAMPLE, unit="bpm", min=30, max=220,
                                  description="Heart rate. Use `source` to tell sensors apart "
                                              "(e.g. modulino-hub/finger1, afferent-vision/rppg)"),
    # ── posture (camera pose pipeline, posture-analysis geometry.py) ─────────
    # Same functions as the runtime; only measured standing / walking
    # (knee >= 120 deg, hip-ankle span only as fallback when knees are not visible).
    "posture.trunk_inclination_deg": dict(kind=SAMPLE, unit="deg", min=-90, max=90,
                                          description="Trunk vs vertical: mid-hip -> mid-shoulder "
                                                      "(0 = upright; relative to the upright "
                                                      "calibration when one exists)"),
    "posture.head_trunk_angle_deg": dict(kind=SAMPLE, unit="deg", min=0, max=180,
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
    return dict(kind=kind, unit=str(d.get("unit", "")), min=lo, max=hi,
                description=str(d.get("description", "")))
