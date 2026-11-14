"""Shared synthetic-data helpers for afferent tests (no models/camera)."""
from __future__ import annotations

import numpy as np

from afferent import keypoints as kp


def make_kpts(facing: str = "front", conf: float = 0.9,
              lean_deg: float = 0.0, **overrides) -> np.ndarray:
    """Synthetic standing person, ~320px tall, centred at x=320.

    facing='front'  -> person's left on image right (left_* x > right_* x)
    facing='back'   -> mirrored
    facing='profile'-> shoulders overlap, one ear only
    lean_deg        -> trunk rotated forward (profile view) around mid-hip
    """
    k = np.full((kp.N_KEYPOINTS, 3), np.nan)
    k[:, 2] = conf

    # base layout (front view): head top -> ankles bottom, y down
    base = {
        kp.NOSE: (320, 100), kp.LEFT_EYE: (300, 95), kp.RIGHT_EYE: (340, 95),
        kp.LEFT_EAR: (280, 100), kp.RIGHT_EAR: (360, 100),
        # front: person's left on image RIGHT
        kp.LEFT_SHOULDER: (360, 160), kp.RIGHT_SHOULDER: (280, 160),
        kp.LEFT_ELBOW: (380, 230), kp.RIGHT_ELBOW: (260, 230),
        kp.LEFT_WRIST: (390, 300), kp.RIGHT_WRIST: (250, 300),
        kp.LEFT_HIP: (350, 260), kp.RIGHT_HIP: (290, 260),
        kp.LEFT_KNEE: (355, 340), kp.RIGHT_KNEE: (285, 340),
        kp.LEFT_ANKLE: (355, 420), kp.RIGHT_ANKLE: (285, 420),
        kp.HEAD: (320, 80), kp.NECK: (320, 140), kp.HIP: (320, 260),
        kp.LEFT_BIG_TOE: (360, 428), kp.RIGHT_BIG_TOE: (280, 428),
        kp.LEFT_SMALL_TOE: (352, 430), kp.RIGHT_SMALL_TOE: (288, 430),
        kp.LEFT_HEEL: (350, 425), kp.RIGHT_HEEL: (290, 425),
    }
    if facing == "back":
        # mirror the front layout: person's left ends up on image left,
        # and face keypoints (nose/eyes) are not visible from behind
        base = {i: (640 - x, y) for i, (x, y) in _front_layout().items()}
        for i in (kp.NOSE, kp.LEFT_EYE, kp.RIGHT_EYE):
            base[i] = (np.nan, np.nan)
    elif facing == "profile":
        base[kp.LEFT_SHOULDER] = (322, 160)
        base[kp.RIGHT_SHOULDER] = (318, 160)
        base[kp.LEFT_HIP] = (322, 260)
        base[kp.RIGHT_HIP] = (318, 260)
        base[kp.LEFT_ANKLE] = (322, 420)
        base[kp.RIGHT_ANKLE] = (318, 420)
        base[kp.LEFT_KNEE] = (322, 340)
        base[kp.RIGHT_KNEE] = (318, 340)
        # only right ear + nose visible (typical profile)
        for i in (kp.LEFT_EYE, kp.LEFT_EAR):
            base[i] = (np.nan, np.nan)
        base[kp.RIGHT_EYE] = (np.nan, np.nan)
        base[kp.NOSE] = (340, 100)
        base[kp.RIGHT_EAR] = (335, 100)
    elif facing == "three_quarter":
        base[kp.RIGHT_EYE] = (np.nan, np.nan)  # one eye hidden
        base[kp.RIGHT_EAR] = (np.nan, np.nan)

    for i, (x, y) in base.items():
        if np.isfinite(x) and np.isfinite(y):
            k[i] = (x, y, conf)
        else:
            k[i] = (np.nan, np.nan, 0.0)

    for idx, (x, y) in overrides.items():
        k[idx] = (x, y, conf)

    if lean_deg:
        k = _rotate_trunk(k, lean_deg)
    return k


def _front_layout():
    return {
        kp.NOSE: (320, 100), kp.LEFT_EYE: (300, 95), kp.RIGHT_EYE: (340, 95),
        kp.LEFT_EAR: (280, 100), kp.RIGHT_EAR: (360, 100),
        kp.LEFT_SHOULDER: (360, 160), kp.RIGHT_SHOULDER: (280, 160),
        kp.LEFT_ELBOW: (380, 230), kp.RIGHT_ELBOW: (260, 230),
        kp.LEFT_WRIST: (390, 300), kp.RIGHT_WRIST: (250, 300),
        kp.LEFT_HIP: (350, 260), kp.RIGHT_HIP: (290, 260),
        kp.LEFT_KNEE: (355, 340), kp.RIGHT_KNEE: (285, 340),
        kp.LEFT_ANKLE: (355, 420), kp.RIGHT_ANKLE: (285, 420),
        kp.HEAD: (320, 80), kp.NECK: (320, 140), kp.HIP: (320, 260),
        kp.LEFT_BIG_TOE: (360, 428), kp.RIGHT_BIG_TOE: (280, 428),
        kp.LEFT_SMALL_TOE: (352, 430), kp.RIGHT_SMALL_TOE: (288, 430),
        kp.LEFT_HEEL: (350, 425), kp.RIGHT_HEEL: (290, 425),
    }


def _rotate_trunk(k: np.ndarray, deg: float) -> np.ndarray:
    """Rotate upper-body keypoints around mid-hip by deg (image plane)."""
    import math
    mh = np.array([320.0, 260.0])
    a = math.radians(deg)
    R = np.array([[math.cos(a), -math.sin(a)], [math.sin(a), math.cos(a)]])
    upper = [kp.NOSE, kp.LEFT_EYE, kp.RIGHT_EYE, kp.LEFT_EAR, kp.RIGHT_EAR,
             kp.LEFT_SHOULDER, kp.RIGHT_SHOULDER, kp.LEFT_ELBOW,
             kp.RIGHT_ELBOW, kp.LEFT_WRIST, kp.RIGHT_WRIST, kp.HEAD, kp.NECK]
    for i in upper:
        if np.isfinite(k[i, 0]):
            p = R @ (k[i, :2] - mh) + mh
            k[i, :2] = p
    return k


def sitting_kpts(conf: float = 0.9) -> np.ndarray:
    """Seated person: knees bent ~90 deg, hips low."""
    k = make_kpts(conf=conf)
    # hips at seat height, knees forward, ankles under knees
    k[kp.LEFT_HIP] = (350, 300, conf)
    k[kp.RIGHT_HIP] = (290, 300, conf)
    k[kp.HIP] = (320, 300, conf)
    k[kp.LEFT_KNEE] = (390, 330, conf)
    k[kp.RIGHT_KNEE] = (250, 330, conf)
    k[kp.LEFT_ANKLE] = (390, 360, conf)
    k[kp.RIGHT_ANKLE] = (250, 360, conf)
    k[kp.LEFT_HEEL] = (392, 366, conf)
    k[kp.RIGHT_HEEL] = (248, 366, conf)
    k[kp.LEFT_BIG_TOE] = (398, 364, conf)
    k[kp.RIGHT_BIG_TOE] = (242, 364, conf)
    k[kp.LEFT_SMALL_TOE] = (394, 368, conf)
    k[kp.RIGHT_SMALL_TOE] = (246, 368, conf)
    return k
