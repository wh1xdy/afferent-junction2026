"""One-Euro filter (Casiez et al. 2012) for jittery keypoint streams.

Per-coordinate, timestamp-aware. Low-confidence points are reported as NaN
and never fed into the filter state, so a re-appearing point restarts clean.
"""
from __future__ import annotations

import numpy as np


def _alpha(cutoff: float, dt: float) -> float:
    tau = 1.0 / (2.0 * np.pi * cutoff)
    return 1.0 / (1.0 + tau / max(dt, 1e-6))


class LowPass:
    def __init__(self, cutoff: float = 1.0):
        self.cutoff = cutoff
        self._x: float | None = None
        self._dx: float | None = None
        self._last_t: float | None = None

    def __call__(self, x: float, t: float) -> float:
        if self._x is None or self._last_t is None:
            self._x = x
            self._dx = 0.0
            self._last_t = t
            return x
        dt = max(t - self._last_t, 1e-4)
        dx = (x - self._x) / dt
        a_d = _alpha(1.0, dt)
        self._dx += a_d * (dx - self._dx)
        a = _alpha(self.cutoff, dt)
        self._x += a * (x - self._x)
        self._last_t = t
        return self._x


class OneEuroAxis:
    """Stateful One-Euro axis: call with (value, timestamp)."""

    def __init__(self, min_cutoff: float = 1.0, beta: float = 0.0,
                 d_cutoff: float = 1.0):
        self.min_cutoff = min_cutoff
        self.beta = beta
        self.d_cutoff = d_cutoff
        self._x = LowPass(min_cutoff)
        self._dx = LowPass(d_cutoff)
        self._last_t: float | None = None
        self._last_raw: float | None = None

    def __call__(self, value: float, t: float) -> float:
        if self._last_t is None:
            self._last_t = t
            self._last_raw = value
            self._x.cutoff = self.min_cutoff
            return self._x(value, t)
        dt = max(t - self._last_t, 1e-4)
        # derivative estimate from raw samples
        dx_raw = (value - self._last_raw) / dt
        edx = self._dx(dx_raw, t)
        cutoff = self.min_cutoff + self.beta * abs(edx)
        self._x.cutoff = cutoff
        out = self._x(value, t)
        self._last_t = t
        self._last_raw = value
        return out

    def reset(self):
        self._x = LowPass(self.min_cutoff)
        self._dx = LowPass(self.d_cutoff)
        self._last_t = None
        self._last_raw = None


class KeypointSmoother:
    """One OneEuroAxis per (keypoint, coordinate) of a (26,3) array.

    Points below the confidence threshold come out as NaN and are not
    filtered, per the project convention.
    """

    def __init__(self, n_keypoints: int = 26, min_cutoff: float = 1.0,
                 beta: float = 0.5, conf_threshold: float = 0.3):
        self.n = n_keypoints
        self.conf_threshold = conf_threshold
        self.axes = [
            [OneEuroAxis(min_cutoff, beta) for _ in range(2)]
            for _ in range(n_keypoints)
        ]

    def update(self, kpts: np.ndarray, t: float) -> np.ndarray:
        """kpts: (n,3) x,y,conf. Returns smoothed (n,3) with NaN for invalid."""
        kpts = np.asarray(kpts, dtype=np.float64)
        out = np.full((self.n, 3), np.nan)
        for i in range(min(self.n, kpts.shape[0])):
            x, y, c = kpts[i]
            if not np.isfinite(c) or c < self.conf_threshold or not (
                    np.isfinite(x) and np.isfinite(y)):
                continue
            out[i, 0] = self.axes[i][0](float(x), t)
            out[i, 1] = self.axes[i][1](float(y), t)
            out[i, 2] = c
        return out

    def reset(self):
        for row in self.axes:
            for ax in row:
                ax.reset()
