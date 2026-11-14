"""Per-minute and per-day aggregation of derived variables (sec. 16).

A minute row is written only when it contains enough valid frames; each
angle keeps median / p10 / p90 and is only populated for orientations where
it is valid (see geometry.valid_angles).
"""
from __future__ import annotations

import logging
import time
from collections import defaultdict
from typing import Any, Callable

import numpy as np

from . import geometry as geo

ANGLE_NAMES = geo.ANGLE_NAMES
_log = logging.getLogger("afferent.aggregator")


def _percentiles(values: list[float]) -> dict[str, float] | None:
    vals = [v for v in values if v is not None and np.isfinite(v)]
    if not vals:
        return None
    a = np.asarray(vals, dtype=np.float64)
    return {
        "med": float(np.median(a)),
        "p10": float(np.percentile(a, 10)),
        "p90": float(np.percentile(a, 90)),
        "n": int(a.size),
    }


class MinuteAggregator:
    """Buffers per-frame samples, flushes `minute` rows per wall minute.

    Samples are bucketed by (activity, orientation): a minute that mixes
    contexts (e.g. profile sitting then front walking) produces one row
    per context, so a variable is only ever aggregated/compared within
    the same situation (plan §16-17). The min_valid threshold applies
    per context: a context row is only written when it holds enough
    valid frames on its own.
    """

    def __init__(self, storage, min_valid_frames: int = 30,
                 extractor_version: str = "", model_version: str = "",
                 on_flush: Callable[[int, str, str, int, dict], Any] | None = None):
        self.storage = storage
        self.on_flush = on_flush      # e.g. DataSink.on_minute (data manager push)
        self.min_valid = min_valid_frames
        self.extractor_version = extractor_version
        self.model_version = model_version
        self._cur_minute: int | None = None
        # (activity, orientation) -> {"samples": [angle dict], "slumps": []}
        self._buckets: dict[tuple[str, str], dict[str, Any]] = {}

    @staticmethod
    def _minute_key(t: float) -> int:
        return int(t // 60) * 60

    def add(self, t: float, activity: str, orientation: str,
            angles: dict[str, float | None], slump: float | None) -> None:
        mk = self._minute_key(t)
        if self._cur_minute is None:
            self._cur_minute = mk
        elif mk != self._cur_minute:
            self.flush()
            self._cur_minute = mk
        # Only keep angles that are valid for this frame's orientation.
        validity = geo.valid_angles(orientation)
        kept = {n: v for n, v in angles.items()
                if v is not None and validity.get(n) in ("yes", "approx")}
        key = (activity or "unknown", orientation or "unknown")
        b = self._buckets.setdefault(key, {"samples": [], "slumps": []})
        b["samples"].append(kept)
        if slump is not None:
            b["slumps"].append(slump)

    def flush(self) -> None:
        if self._cur_minute is None:
            return
        ts_ms = int(self._cur_minute * 1000)
        for (activity, orient), b in self._buckets.items():
            n = len(b["samples"])
            if n < self.min_valid:
                continue
            # Aggregate each angle only over frames where it was valid.
            agg: dict[str, dict | None] = {}
            for name in ANGLE_NAMES:
                agg[name] = _percentiles(
                    [s.get(name) for s in b["samples"]])
            slumps = b["slumps"]
            slump_med = float(np.median(slumps)) if slumps else None
            self.storage.add_minute(
                ts_ms=ts_ms,
                activity=activity, orientation=orient,
                n_valid=n, angles=agg, slump=slump_med,
                extractor_version=self.extractor_version,
                model_version=self.model_version)
            if self.on_flush is not None:
                try:
                    self.on_flush(ts_ms, activity, orient, n, agg)
                except Exception as e:   # never lose the local row for a push
                    _log.warning("minute push failed: %s", e)
        self._buckets = {}
        self._cur_minute = None


class VisageAggregator:
    """Per-minute aggregation of facial-expression samples (sec. 16)."""

    # Blendshapes retained for the minute aggregates.
    RETAINED = (
        "mouthSmileLeft", "mouthSmileRight",
        "browDownLeft", "browDownRight",
        "mouthFrownLeft", "mouthFrownRight",
        "eyeBlinkLeft", "eyeBlinkRight",
        "eyeWideLeft", "eyeWideRight",
        "browInnerUp", "jawOpen",
    )

    def __init__(self, storage, min_valid: int = 5,
                 extractor_version: str = "", model_version: str = ""):
        self.storage = storage
        self.min_valid = min_valid
        self.extractor_version = extractor_version
        self.model_version = model_version
        self._cur_minute: int | None = None
        self._expr: dict[str, list[float]] = defaultdict(list)
        self._pitch: list[float] = []
        self._emotions: dict[str, int] = defaultdict(int)
        self._n = 0
        self._smile_on = False
        self._smile_episodes = 0
        self._valence: list[float] = []
        self._arousal: list[float] = []

    def add(self, t: float, blendshapes: dict[str, float] | None,
            pitch_deg: float | None, emotion: str | None,
            valence: float | None = None, arousal: float | None = None,
            smile: float | None = None) -> None:
        mk = int(t // 60) * 60
        if self._cur_minute is None:
            self._cur_minute = mk
        elif mk != self._cur_minute:
            self.flush()
            self._cur_minute = mk
        self._n += 1
        if blendshapes:
            for name in self.RETAINED:
                v = blendshapes.get(name)
                if v is not None:
                    self._expr[name].append(float(v))
        if pitch_deg is not None:
            self._pitch.append(float(pitch_deg))
        if emotion:
            self._emotions[emotion] += 1
        if valence is not None:
            self._valence.append(float(valence))
        if arousal is not None:
            self._arousal.append(float(arousal))
        # smile episode: coefficient crosses threshold upward
        if smile is not None:
            on = smile > 0.5
            if on and not self._smile_on:
                self._smile_episodes += 1
            self._smile_on = on

    def flush(self) -> None:
        if self._cur_minute is None:
            return
        if self._n >= self.min_valid:
            expr_mean = {k: float(np.mean(v)) for k, v in self._expr.items()}
            expr_std = {k: float(np.std(v)) for k, v in self._expr.items()}
            # shares are over frames where an emotion was actually predicted
            emo_total = sum(self._emotions.values()) or 1
            emotions = {k: v / emo_total for k, v in self._emotions.items()}
            self.storage.add_visage_minute(
                ts_ms=int(self._cur_minute * 1000), n_valid=self._n,
                expr_mean=expr_mean, expr_std=expr_std,
                pitch_mean=float(np.mean(self._pitch)) if self._pitch else None,
                smile_episodes=self._smile_episodes, emotions=emotions,
                valence_mean=float(np.mean(self._valence)) if self._valence else None,
                arousal_mean=float(np.mean(self._arousal)) if self._arousal else None,
                extractor_version=self.extractor_version,
                model_version=self.model_version)
        self._reset()

    def _reset(self) -> None:
        self._cur_minute = None
        self._expr = defaultdict(list)
        self._pitch = []
        self._emotions = defaultdict(int)
        self._n = 0
        self._smile_on = False
        self._smile_episodes = 0
        self._valence = []
        self._arousal = []


def _angle_med(rows: list[dict], name: str) -> float | None:
    """Median of the per-minute medians of one angle over `rows`."""
    vals = []
    for r in rows:
        angles = r.get("angles")
        if isinstance(angles, str):
            import json as _j
            try:
                angles = _j.loads(angles)
            except _j.JSONDecodeError:
                angles = None
        node = (angles or {}).get(name)
        if isinstance(node, dict) and "med" in node:
            vals.append(node["med"])
    return float(np.median(vals)) if vals else None


def _slump_med(rows: list[dict]) -> float | None:
    # slump is a scalar column, not inside angles JSON
    vals = [r.get("slump") for r in rows if r.get("slump") is not None]
    return float(np.median(vals)) if vals else None


def daily_aggregate(day_rows: list[dict]) -> dict[str, Any]:
    """Aggregate one day's `minute` rows into `jour` aggregates + coverage.

    day_rows: list of minute dicts (as returned by storage.minutes_since);
    several rows may share one ts — one per (activity, orientation)
    context. Aggregates are grouped by context so a variable is only
    compared to itself in the same situation; `coverage` counts the
    distinct minutes that hold at least one valid context row.
    """
    if not day_rows:
        return {"coverage": 0.0, "minutes": 0}
    n_rows = len(day_rows)
    n_minutes = len({r.get("ts") for r in day_rows})
    coverage = n_minutes / 1440.0

    # --- per-context aggregates -----------------------------------------
    ctx_rows: dict[tuple[str, str], list[dict]] = defaultdict(list)
    for r in day_rows:
        ctx_rows[(r.get("activity") or "unknown",
                  r.get("orientation") or "unknown")].append(r)
    contexts = {
        f"{act}|{orient}": {
            "minutes": len(rows),
            "share": round(len(rows) / n_rows, 4),
            "angle_medians": {name: _angle_med(rows, name)
                              for name in ANGLE_NAMES},
            "slump_median": _slump_med(rows),
        }
        for (act, orient), rows in sorted(ctx_rows.items())
    }

    # --- shares of tracked context-minutes (sum to 1) --------------------
    shares: dict[str, dict[str, int]] = {"activity": defaultdict(int),
                                       "orientation": defaultdict(int)}
    for (act, orient), rows in ctx_rows.items():
        shares["activity"][act] += len(rows)
        shares["orientation"][orient] += len(rows)

    agg = {
        "minutes": n_minutes,
        "context_rows": n_rows,
        "coverage": round(coverage, 4),
        "contexts": contexts,
        "activity_shares": {
            k: round(v / n_rows, 4) for k, v in shares["activity"].items()},
        "orientation_shares": {
            k: round(v / n_rows, 4)
            for k, v in shares["orientation"].items()},
        "angle_medians": {name: _angle_med(day_rows, name)
                          for name in ANGLE_NAMES},
        "slump_median": _slump_med(day_rows),
    }
    return agg
