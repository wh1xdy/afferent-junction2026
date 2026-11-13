"""Per-minute and per-day aggregation of derived variables (sec. 16).

A minute row is written only when it contains enough valid frames; each
angle keeps median / p10 / p90 and is only populated for orientations where
it is valid (see geometry.valid_angles).
"""
from __future__ import annotations

import time
from collections import defaultdict
from typing import Any

import numpy as np

from . import geometry as geo

ANGLE_NAMES = geo.ANGLE_NAMES


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
    """Buffers per-frame samples, flushes one `minute` row per wall minute."""

    def __init__(self, storage, min_valid_frames: int = 30,
                 extractor_version: str = "", model_version: str = ""):
        self.storage = storage
        self.min_valid = min_valid_frames
        self.extractor_version = extractor_version
        self.model_version = model_version
        self._cur_minute: int | None = None
        self._samples: list[dict[str, Any]] = []
        self._orientation_votes: dict[str, int] = defaultdict(int)
        self._activity_votes: dict[str, int] = defaultdict(int)

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
        self._samples.append({"angles": kept, "slump": slump})
        self._orientation_votes[orientation] += 1
        self._activity_votes[activity] += 1

    def flush(self) -> None:
        if self._cur_minute is None:
            return
        n = len(self._samples)
        if n >= self.min_valid:
            orient = self._majority(self._orientation_votes)
            activity = self._majority(self._activity_votes)
            # Aggregate each angle only over frames where it was valid.
            agg: dict[str, dict | None] = {}
            for name in ANGLE_NAMES:
                vals = [s["angles"].get(name) for s in self._samples]
                vals = [v for v in vals if v is not None]
                agg[name] = _percentiles(vals)
            slumps = [s["slump"] for s in self._samples
                      if s["slump"] is not None]
            slump_med = float(np.median(slumps)) if slumps else None
            self.storage.add_minute(
                ts_ms=int(self._cur_minute * 1000),
                activity=activity, orientation=orient,
                n_valid=n, angles=agg, slump=slump_med,
                extractor_version=self.extractor_version,
                model_version=self.model_version)
        self._samples = []
        self._orientation_votes = defaultdict(int)
        self._activity_votes = defaultdict(int)
        self._cur_minute = None

    @staticmethod
    def _majority(votes: dict[str, int]) -> str:
        if not votes:
            return "unknown"
        return max(votes.items(), key=lambda kv: kv[1])[0]


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


def daily_aggregate(day_rows: list[dict]) -> dict[str, Any]:
    """Aggregate one day's `minute` rows into `jour` aggregates + coverage.

    day_rows: list of minute dicts (as returned by storage.minutes_since).
    """
    if not day_rows:
        return {"coverage": 0.0, "minutes": 0}
    n = len(day_rows)
    coverage = n / 1440.0

    def _med(key_path):
        vals = []
        for r in day_rows:
            angles = r.get("angles")
            if isinstance(angles, str):
                import json as _j
                angles = _j.loads(angles)
            node = angles
            for k in key_path:
                node = (node or {}).get(k)
                if node is None:
                    break
            if isinstance(node, dict) and "med" in node:
                vals.append(node["med"])
        return float(np.median(vals)) if vals else None

    agg = {
        "minutes": n,
        "coverage": round(coverage, 4),
        "activity_shares": {},
        "orientation_shares": {},
        "angle_medians": {name: _med((name,)) for name in ANGLE_NAMES},
    }
    # slump is a scalar column, not inside angles JSON
    slumps = [r.get("slump") for r in day_rows
              if r.get("slump") is not None]
    agg["slump_median"] = float(np.median(slumps)) if slumps else None

    for field_name in ("activity", "orientation"):
        votes: dict[str, int] = defaultdict(int)
        for r in day_rows:
            votes[r.get(field_name) or "unknown"] += 1
        agg[f"{field_name}_shares"] = {
            k: round(v / n, 4) for k, v in votes.items()}
    return agg
