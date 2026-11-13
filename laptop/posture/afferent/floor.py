"""Floor-plane homography: 4 image points <-> 4 floor points in metres.

Stores the 3x3 matrix in the `config` table; image_to_floor() maps image
points to floor coordinates. The ground reference point is mid-ankle.
"""
from __future__ import annotations

import json
from typing import Sequence

import cv2
import numpy as np


class FloorMap:
    def __init__(self, img_pts: Sequence[Sequence[float]] | None = None,
                 floor_pts: Sequence[Sequence[float]] | None = None,
                 matrix: np.ndarray | None = None):
        self.H: np.ndarray | None = None
        if matrix is not None:
            self.H = np.asarray(matrix, dtype=np.float64)
        elif img_pts is not None and floor_pts is not None:
            self.set(img_pts, floor_pts)

    def set(self, img_pts: Sequence[Sequence[float]],
            floor_pts: Sequence[Sequence[float]]) -> bool:
        src = np.asarray(img_pts, dtype=np.float64).reshape(4, 2)
        dst = np.asarray(floor_pts, dtype=np.float64).reshape(4, 2)
        H, _ = cv2.findHomography(src, dst, cv2.RANSAC, 5.0)
        if H is None:
            return False
        self.H = H
        return True

    @property
    def calibrated(self) -> bool:
        return self.H is not None

    def image_to_floor(self, pt: Sequence[float]) -> tuple[float, float] | None:
        """Image point (x, y) -> floor plane (x_m, y_m). None if uncalibrated."""
        if self.H is None:
            return None
        p = np.asarray([pt[0], pt[1], 1.0], dtype=np.float64)
        q = self.H @ p
        if abs(q[2]) < 1e-9:
            return None
        return float(q[0] / q[2]), float(q[1] / q[2])

    def to_json(self) -> str:
        return json.dumps({"H": self.H.tolist() if self.H is not None else None})

    @classmethod
    def from_json(cls, raw: str | None) -> "FloorMap":
        fm = cls()
        if not raw:
            return fm
        try:
            data = json.loads(raw)
            H = data.get("H")
            if H is not None:
                fm.H = np.asarray(H, dtype=np.float64)
        except (json.JSONDecodeError, TypeError, ValueError):
            pass
        return fm
