"""Situation classification: activity x orientation per frame, and the
episode segmenter of plan section 17.

Activities: sitting / standing / walking / transition / unknown.
Episodes: walk (>=2 m or >=3 steps), stand-still (>=3 s), sit-stable
(>=30 s), transition (sit<->stand), usable face (front-ish, >=60 px,
|yaw|<35 deg).
"""
from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Callable

import numpy as np

from . import geometry as geo

ACTIVITIES = ("sitting", "standing", "walking", "transition", "unknown")

# Section 17 episode thresholds.
WALK_MIN_DIST_M = 2.0
WALK_MIN_STEPS = 3
STAND_STILL_S = 3.0
SIT_STABLE_S = 30.0
FACE_MIN_PX = 60.0
FACE_MAX_YAW_DEG = 35.0


@dataclass
class FrameSituation:
    t: float
    activity: str
    orientation: str
    floor_pos: tuple[float, float] | None = None   # metres, if calibrated
    speed: float | None = None                     # m/s or trunk-len/s
    knee_angle_deg: float | None = None
    trunk_len_px: float | None = None


class SituationTracker:
    """Hysteresis state machine over per-frame features."""

    def __init__(self, walk_speed_thr: float = 0.25,
                 sit_knee_thr: float = 120.0,
                 still_speed_thr: float = 0.05,
                 window_s: float = 1.0):
        self.walk_speed_thr = walk_speed_thr      # m/s, or trunk-len/s
        self.sit_knee_thr = sit_knee_thr          # deg: below -> sitting
        self.still_speed_thr = still_speed_thr
        self.window_s = window_s
        self._pos_hist: list[tuple[float, float]] = []   # normalised pos
        self._floor_hist: list[tuple[float, tuple[float, float]]] = []
        self._state = "unknown"
        self._state_since = 0.0
        self._pending: str | None = None
        self._pending_since = 0.0
        self._transition_until = 0.0

    # -- per-frame update -----------------------------------------------------
    def update(self, t: float, kpts: np.ndarray,
               floor_pos: tuple[float, float] | None = None,
               calibrated: bool = False) -> FrameSituation:
        orientation = geo.classify_orientation(kpts)
        tl = geo.trunk_length(kpts)
        knees = [a for a in (geo.knee_angle_deg(kpts, "left"),
                             geo.knee_angle_deg(kpts, "right"))
                 if a is not None]
        knee = min(knees) if knees else None

        speed = self._ground_speed(t, kpts, floor_pos, calibrated, tl)

        sitting = False
        if knee is not None and knee < self.sit_knee_thr:
            sitting = True
        elif tl:
            mh, ma = geo.mid_hip(kpts), geo.mid_ankle(kpts)
            if mh is not None and ma is not None:
                # hip-ankle vertical span vs trunk: compressed when seated
                span = abs(float(mh[1] - ma[1]))
                if span < 1.6 * tl:
                    sitting = True

        walking = speed is not None and speed > self.walk_speed_thr
        still = speed is not None and speed <= self.still_speed_thr

        if walking:
            raw = "walking"
        elif sitting:
            raw = "sitting"
        elif still:
            raw = "standing"
        else:
            raw = "unknown"

        activity = self._hysteresis(t, raw, sitting)
        return FrameSituation(
            t=t, activity=activity, orientation=orientation,
            floor_pos=floor_pos, speed=speed,
            knee_angle_deg=knee, trunk_len_px=tl,
        )

    # -- internals ------------------------------------------------------------
    def _ground_speed(self, t: float, kpts: np.ndarray,
                      floor_pos: tuple[float, float] | None,
                      calibrated: bool, tl: float | None) -> float | None:
        cutoff = t - self.window_s * 3
        if calibrated and floor_pos is not None:
            self._floor_hist = [h for h in self._floor_hist if h[0] > cutoff]
            self._floor_hist.append((t, floor_pos))
            past = [h for h in self._floor_hist if h[0] <= t - self.window_s]
            if not past:
                return 0.0
            p0 = past[-1][1]
            dt = t - past[-1][0]
            if dt <= 1e-6:
                return 0.0
            return math.hypot(floor_pos[0] - p0[0],
                              floor_pos[1] - p0[1]) / dt
        # uncalibrated: hip displacement in trunk-length units per second
        mh = geo.mid_hip(kpts)
        if mh is None or not tl:
            return None
        pos = (float(mh[0]) / tl, float(mh[1]) / tl)
        self._pos_hist = [h for h in self._pos_hist if h[0] > cutoff]
        self._pos_hist.append((t, pos))
        past = [h for h in self._pos_hist if h[0] <= t - self.window_s]
        if not past:
            return 0.0
        p0 = past[-1][1]
        dt = t - past[-1][0]
        if dt <= 1e-6:
            return 0.0
        return math.hypot(pos[0] - p0[0], pos[1] - p0[1]) / dt

    def _hysteresis(self, t: float, raw: str, sitting: bool) -> str:
        if raw == "unknown":
            return self._state if self._state != "unknown" else "unknown"
        if raw == self._state:
            self._pending = None
            if self._state == "transition" and t > self._transition_until:
                self._state = "sitting" if sitting else "standing"
                self._state_since = t
            return self._state
        # candidate change: require 0.5 s of agreement
        if self._pending == raw:
            if t - self._pending_since >= 0.5:
                prev = self._state
                if prev in ("sitting", "standing") and \
                        raw in ("sitting", "standing"):
                    self._state = "transition"
                    self._state_since = t
                    self._transition_until = t + 1.5
                else:
                    self._state = raw
                    self._state_since = t
                self._pending = None
        else:
            self._pending = raw
            self._pending_since = t
        if self._state == "transition" and t > self._transition_until:
            self._state = "sitting" if sitting else "standing"
            self._state_since = t
        return self._state


class EpisodeTracker:
    """Segments the FrameSituation stream into episodes (sec. 17).

    on_episode receives dicts:
      {type, start, end, duration_s, orientation, distance_m, n_steps,
       valid, activity}
    """

    def __init__(self, on_episode: Callable[[dict], None] | None = None):
        self.on_episode = on_episode
        self._cur: str | None = None
        self._start = 0.0
        self._samples: list[FrameSituation] = []
        self._walk_dist = 0.0
        self._walk_last: tuple[float, float] | None = None
        self._steps = 0
        self._closed_short = False

    # -- feed -----------------------------------------------------------------
    def update(self, fs: FrameSituation) -> None:
        etype = {"walking": "walk", "sitting": "sit",
                 "standing": "stand", "transition": "transition"}.get(
                     fs.activity)

        if etype == "walk" and fs.floor_pos is not None:
            if self._walk_last is not None:
                self._walk_dist += math.hypot(
                    fs.floor_pos[0] - self._walk_last[0],
                    fs.floor_pos[1] - self._walk_last[1])
            self._walk_last = fs.floor_pos
        elif etype != "walk":
            self._walk_last = None

        if etype != self._cur:
            self._close(fs.t)
            self._cur = etype
            self._start = fs.t
            self._samples = []
            self._walk_dist = 0.0
            self._steps = 0
            self._closed_short = False
        if etype is not None:
            self._samples.append(fs)
            self._check_duration(fs.t)

    def note_step(self) -> None:
        """Called by the pipeline when a gait step is detected."""
        if self._cur == "walk":
            self._steps += 1

    def finalize(self, end_t: float) -> None:
        self._close(end_t)

    # -- internals ------------------------------------------------------------
    _MIN_DUR = {"walk": 0.5, "stand": STAND_STILL_S, "sit": SIT_STABLE_S,
                "transition": 0.3}

    def _check_duration(self, t: float) -> None:
        if self._cur is None or self._closed_short:
            return
        if t - self._start < self._MIN_DUR.get(self._cur, 0.5):
            return
        # Emit once the episode reaches its minimum reportable duration;
        # the episode stays open until the activity changes (then _close
        # emits the final version). To avoid double-reporting we mark
        # _closed_short only for episodes we already emitted — instead we
        # emit on close only, so nothing to do here.
        pass

    def _close(self, end_t: float) -> None:
        if self._cur is None:
            return
        dur = end_t - self._start
        min_dur = self._MIN_DUR.get(self._cur, 0.5)
        if dur >= min_dur and self.on_episode:
            ep = {
                "type": self._cur,
                "start": self._start,
                "end": end_t,
                "duration_s": dur,
                "orientation": self._dominant_orientation(),
                "distance_m": self._walk_dist if self._cur == "walk" else None,
                "n_steps": self._steps,
            }
            if self._cur == "walk":
                ep["valid"] = ((ep["distance_m"] or 0.0) >= WALK_MIN_DIST_M
                               or ep["n_steps"] >= WALK_MIN_STEPS)
            else:
                ep["valid"] = True
            self.on_episode(ep)
        self._cur = None
        self._samples = []
        self._walk_dist = 0.0
        self._walk_last = None
        self._steps = 0

    def _dominant_orientation(self) -> str:
        counts: dict[str, int] = {}
        for s in self._samples:
            counts[s.orientation] = counts.get(s.orientation, 0) + 1
        if not counts:
            return "unknown"
        return max(counts.items(), key=lambda kv: kv[1])[0]
