"""Pure geometry on Halpe-26 keypoint arrays (n,3) = x, y, conf.

All angles are 2D image-plane estimates. Validity per body orientation
follows plan section 17; invalid angles are returned as None.
"""
from __future__ import annotations

import math

import numpy as np

from . import keypoints as kp

ANGLE_NAMES = (
    "neck_flexion",        # head forward: shoulder->ear vs vertical
    "trunk_inclination",   # mid-hip -> mid-shoulder vs vertical
    "shoulder_asymmetry",  # shoulder line tilt vs horizontal (deg)
    "head_lateral_tilt",   # eye line tilt vs horizontal (deg)
    "slump_index",         # shoulder-hip vertical distance / upright ref
)

# Section 17 validity table: angle -> 'yes' | 'approx' | 'no' per orientation.
_VALIDITY: dict[str, dict[str, str]] = {
    "face": {
        "neck_flexion": "no",
        "trunk_inclination": "no",
        "shoulder_asymmetry": "yes",
        "head_lateral_tilt": "yes",
        "slump_index": "yes",   # relative height, orientation-free
    },
    "three_quarter": {
        "neck_flexion": "approx",
        "trunk_inclination": "approx",
        "shoulder_asymmetry": "no",
        "head_lateral_tilt": "no",
        "slump_index": "yes",
    },
    "profile": {
        "neck_flexion": "yes",
        "trunk_inclination": "yes",
        "shoulder_asymmetry": "no",
        "head_lateral_tilt": "no",
        "slump_index": "yes",
    },
    "back": {
        "neck_flexion": "no",
        "trunk_inclination": "no",
        "shoulder_asymmetry": "yes",
        "head_lateral_tilt": "no",
        "slump_index": "yes",
    },
    "unknown": {a: "no" for a in ANGLE_NAMES},
}

ORIENTATIONS = ("face", "three_quarter", "profile", "back", "unknown")


def valid_angles(orientation: str) -> dict[str, str]:
    """Section 17 table: per-orientation validity of each angle."""
    return dict(_VALIDITY.get(orientation, _VALIDITY["unknown"]))


def _pt(kpts: np.ndarray, idx: int) -> np.ndarray | None:
    p = kpts[idx]
    if np.isfinite(p[0]) and np.isfinite(p[1]):
        return p[:2]
    return None


def _mean_pt(kpts: np.ndarray, idxs: tuple[int, ...]) -> np.ndarray | None:
    pts = [_pt(kpts, i) for i in idxs]
    pts = [p for p in pts if p is not None]
    if not pts:
        return None
    return np.mean(pts, axis=0)


def mid_shoulder(kpts: np.ndarray) -> np.ndarray | None:
    return _mean_pt(kpts, (kp.LEFT_SHOULDER, kp.RIGHT_SHOULDER))


def mid_hip(kpts: np.ndarray) -> np.ndarray | None:
    return _mean_pt(kpts, (kp.LEFT_HIP, kp.RIGHT_HIP))


def mid_ear(kpts: np.ndarray) -> np.ndarray | None:
    return _mean_pt(kpts, (kp.LEFT_EAR, kp.RIGHT_EAR))


def mid_eye(kpts: np.ndarray) -> np.ndarray | None:
    return _mean_pt(kpts, (kp.LEFT_EYE, kp.RIGHT_EYE))


def mid_ankle(kpts: np.ndarray) -> np.ndarray | None:
    return _mean_pt(kpts, (kp.LEFT_ANKLE, kp.RIGHT_ANKLE))


def trunk_length(kpts: np.ndarray) -> float | None:
    """Pixel distance mid-hip -> mid-shoulder (normalisation unit)."""
    ms, mh = mid_shoulder(kpts), mid_hip(kpts)
    if ms is None or mh is None:
        return None
    d = float(np.linalg.norm(ms - mh))
    return d if d > 1e-6 else None


def _angle_to_vertical_deg(vec: np.ndarray) -> float:
    """Angle between vec and image-up (0,-1), in [0, 180]."""
    up = np.array([0.0, -1.0])
    n = np.linalg.norm(vec)
    if n < 1e-9:
        return float("nan")
    cos = float(np.dot(vec, up) / n)
    cos = max(-1.0, min(1.0, cos))
    return math.degrees(math.acos(cos))


def _angle_to_horizontal_deg(vec: np.ndarray) -> float:
    """Signed angle of vec vs image-right (+x), wrapped to [-90, 90]."""
    if np.linalg.norm(vec) < 1e-9:
        return float("nan")
    return math.degrees(math.atan2(vec[1], vec[0]))


def shoulder_asymmetry_deg(kpts: np.ndarray) -> float | None:
    """Tilt of the shoulder line vs horizontal: 0 = level, + = left low."""
    l, r = _pt(kpts, kp.LEFT_SHOULDER), _pt(kpts, kp.RIGHT_SHOULDER)
    if l is None or r is None:
        return None
    a = _angle_to_horizontal_deg(r - l)
    # wrap to [-90, 90]: a shoulder line is near-horizontal
    if a > 90:
        a -= 180
    elif a < -90:
        a += 180
    return a


def head_lateral_tilt_deg(kpts: np.ndarray) -> float | None:
    """Eye-line roll vs horizontal (head lateral tilt)."""
    le, re = _pt(kpts, kp.LEFT_EYE), _pt(kpts, kp.RIGHT_EYE)
    if le is None or re is None:
        return None
    a = _angle_to_horizontal_deg(re - le)
    if a > 90:
        a -= 180
    elif a < -90:
        a += 180
    return a


def neck_flexion_deg(kpts: np.ndarray) -> float | None:
    """Head-forward angle: mid-shoulder -> mid-ear/eye vs vertical.

    ~0 when the head is stacked over the shoulders, grows as the head is
    thrust forward (profile view)."""
    ms = mid_shoulder(kpts)
    head = mid_ear(kpts)
    if head is None:
        head = mid_eye(kpts)
    if head is None:
        head = _pt(kpts, kp.HEAD)
    if ms is None or head is None:
        return None
    a = _angle_to_vertical_deg(head - ms)
    return None if not math.isfinite(a) else a


def trunk_inclination_deg(kpts: np.ndarray) -> float | None:
    """Angle of mid-hip -> mid-shoulder vs vertical: 0 = upright."""
    ms, mh = mid_shoulder(kpts), mid_hip(kpts)
    if ms is None or mh is None:
        return None
    a = _angle_to_vertical_deg(ms - mh)
    return None if not math.isfinite(a) else a


def knee_angle_deg(kpts: np.ndarray, side: str = "left") -> float | None:
    """Knee flexion angle at the knee (hip-knee-ankle), 180 = straight."""
    if side == "left":
        h, k, a = (kp.LEFT_HIP, kp.LEFT_KNEE, kp.LEFT_ANKLE)
    else:
        h, k, a = (kp.RIGHT_HIP, kp.RIGHT_KNEE, kp.RIGHT_ANKLE)
    ph, pk, pa = _pt(kpts, h), _pt(kpts, k), _pt(kpts, a)
    if ph is None or pk is None or pa is None:
        return None
    v1, v2 = ph - pk, pa - pk
    n1, n2 = np.linalg.norm(v1), np.linalg.norm(v2)
    if n1 < 1e-9 or n2 < 1e-9:
        return None
    cos = float(np.dot(v1, v2) / (n1 * n2))
    return math.degrees(math.acos(max(-1.0, min(1.0, cos))))


def slump_index(kpts: np.ndarray, ref_shoulder_hip_px: float | None) -> float | None:
    """Vertical shoulder-hip distance / upright reference distance.

    <1 means slumped relative to the calibration upright posture."""
    if not ref_shoulder_hip_px or ref_shoulder_hip_px <= 0:
        return None
    ms, mh = mid_shoulder(kpts), mid_hip(kpts)
    if ms is None or mh is None:
        return None
    d = abs(float(ms[1] - mh[1]))  # image y: shoulders above hips -> positive
    if d < 1e-6:
        return None
    return d / ref_shoulder_hip_px


def classify_orientation(kpts: np.ndarray, conf_thr: float = 0.3) -> str:
    """Body orientation from face keypoints + shoulder geometry (sec. 17).

    Returns one of ORIENTATIONS; 'unknown' when evidence is ambiguous.
    """
    k = np.asarray(kpts, dtype=np.float64)
    if k.ndim != 2 or k.shape[0] < kp.N_KEYPOINTS:
        return "unknown"
    vis = k[:, 2] >= conf_thr

    nose, le, re = vis[kp.NOSE], vis[kp.LEFT_EYE], vis[kp.RIGHT_EYE]
    lear, rear = vis[kp.LEFT_EAR], vis[kp.RIGHT_EAR]
    face_pts = int(nose) + int(le) + int(re)
    ear_pts = int(lear) + int(rear)

    # Shoulder geometry: order of L/R in image + width/trunk ratio.
    aspect = float("nan")
    order = 0
    lsh, rsh = _pt(k, kp.LEFT_SHOULDER), _pt(k, kp.RIGHT_SHOULDER)
    tl = trunk_length(k)
    if lsh is not None and rsh is not None and tl:
        dx = float(lsh[0] - rsh[0])
        aspect = abs(dx) / tl
        if dx > 1e-6:
            order = 1    # person's left on image right -> facing camera
        elif dx < -1e-6:
            order = -1   # facing away
    aspect_ok = math.isfinite(aspect)

    # --- face-keypoint driven base class -------------------------------------
    if face_pts == 3:
        base = "face"
    elif face_pts >= 1:
        base = "three_quarter"
    elif ear_pts == 2:
        base = "back"
    elif ear_pts == 1:
        base = "profile"
    else:
        base = "unknown"

    if base == "unknown":
        return "unknown"

    # --- shoulder-geometry cross-check ----------------------------------------
    if not aspect_ok:
        # No shoulder evidence: trust weak face evidence only partially.
        return base if base in ("face", "back") else "unknown"

    profile_like = aspect < 0.40
    front_like = order > 0 and aspect >= 0.40
    back_like = order < 0 and aspect >= 0.50

    if base == "face":
        return "face" if front_like or order == 0 else "unknown"
    if base == "three_quarter":
        if front_like:
            return "three_quarter"
        if profile_like:
            return "profile"
        return "unknown"
    if base == "profile":
        return "profile" if profile_like or order == 0 else "unknown"
    if base == "back":
        return "back" if back_like else ("profile" if profile_like else "unknown")
    return "unknown"


def compute_frame_angles(kpts: np.ndarray, orientation: str,
                         ref_shoulder_hip_px: float | None = None
                         ) -> dict[str, float | None]:
    """All posture angles for one frame; None where invalid for orientation."""
    validity = valid_angles(orientation)
    raw = {
        "neck_flexion": neck_flexion_deg(kpts),
        "trunk_inclination": trunk_inclination_deg(kpts),
        "shoulder_asymmetry": shoulder_asymmetry_deg(kpts),
        "head_lateral_tilt": head_lateral_tilt_deg(kpts),
        "slump_index": slump_index(kpts, ref_shoulder_hip_px),
    }
    out: dict[str, float | None] = {}
    for name in ANGLE_NAMES:
        v = validity.get(name, "no")
        out[name] = raw[name] if v in ("yes", "approx") else None
    return out
