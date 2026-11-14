"""Geometry tests: known tilts, orientation classes, angle validity."""
import math

import numpy as np
import pytest

from afferent import geometry as geo
from afferent import keypoints as kp

from conftest import make_kpts, sitting_kpts


def test_trunk_inclination_upright():
    k = make_kpts()
    assert geo.trunk_inclination_deg(k) == pytest.approx(0.0, abs=1.0)


def test_trunk_inclination_lean():
    # rotate the whole upper body 20 deg forward around mid-hip
    k = make_kpts(lean_deg=20.0)
    ang = geo.trunk_inclination_deg(k)
    assert ang == pytest.approx(20.0, abs=3.0)


def test_neck_flexion_head_forward():
    k = make_kpts(facing="profile")
    # move ears forward (+x) relative to shoulders -> head thrust forward
    k[kp.LEFT_EAR] = (380, 100, 0.9)
    k[kp.RIGHT_EAR] = (380, 100, 0.9)
    k[kp.LEFT_EYE] = (370, 95, 0.9)
    k[kp.RIGHT_EYE] = (370, 95, 0.9)
    ang = geo.neck_flexion_deg(k)
    assert ang is not None and ang > 15.0


def test_shoulder_asymmetry_tilt():
    k = make_kpts()
    # left shoulder 20 px lower than right -> tilted shoulder line
    k[kp.LEFT_SHOULDER] = (360, 180, 0.9)
    a = geo.shoulder_asymmetry_deg(k)
    # dy=20 over dx=80 -> atan2(20,80) ~ 14 deg (sign depends on convention)
    assert a == pytest.approx(14.0, abs=2.0)


def test_head_lateral_tilt():
    k = make_kpts()
    k[kp.LEFT_EYE] = (300, 115, 0.9)   # left eye 20px lower
    a = geo.head_lateral_tilt_deg(k)
    assert a is not None and abs(a) > 5.0


def test_slump_index():
    k = make_kpts()
    # upright: shoulder y=160, hip y=260 -> vertical distance 100
    ref = 100.0
    s = geo.slump_index(k, ref)
    assert s == pytest.approx(1.0, abs=0.05)
    # slumped: shoulders drop to y=220 -> distance 40 -> index 0.4
    k2 = make_kpts()
    for i in (kp.LEFT_SHOULDER, kp.RIGHT_SHOULDER, kp.LEFT_ELBOW,
              kp.RIGHT_ELBOW, kp.LEFT_WRIST, kp.RIGHT_WRIST, kp.HEAD,
              kp.NECK, kp.NOSE, kp.LEFT_EYE, kp.RIGHT_EYE, kp.LEFT_EAR,
              kp.RIGHT_EAR):
        k2[i, 1] += 60.0
    s2 = geo.slump_index(k2, ref)
    assert s2 == pytest.approx(0.4, abs=0.08)
    assert geo.slump_index(k, None) is None


def test_trunk_length():
    k = make_kpts()
    tl = geo.trunk_length(k)
    assert tl == pytest.approx(100.0, abs=2.0)


@pytest.mark.parametrize("facing,expected", [
    ("front", "face"),
    ("three_quarter", "three_quarter"),
    ("profile", "profile"),
    ("back", "back"),
])
def test_orientation_classes(facing, expected):
    k = make_kpts(facing=facing)
    assert geo.classify_orientation(k) == expected


def test_orientation_unknown_low_conf():
    k = make_kpts()
    k[:, 2] = 0.0  # nothing visible
    assert geo.classify_orientation(k) == "unknown"


def test_orientation_contradiction():
    # face fully visible but shoulders ordered like a back view -> ambiguous
    k = make_kpts(facing="back")
    # restore face points
    k[kp.NOSE] = (320, 100, 0.9)
    k[kp.LEFT_EYE] = (300, 95, 0.9)
    k[kp.RIGHT_EYE] = (340, 95, 0.9)
    assert geo.classify_orientation(k) == "unknown"


def test_valid_angles_table():
    v = geo.valid_angles("face")
    assert v["neck_flexion"] == "no"
    assert v["shoulder_asymmetry"] == "yes"
    assert v["head_lateral_tilt"] == "yes"
    v = geo.valid_angles("profile")
    assert v["neck_flexion"] == "yes" and v["trunk_inclination"] == "yes"
    assert v["shoulder_asymmetry"] == "no"
    v = geo.valid_angles("back")
    assert v["neck_flexion"] == "no" and v["shoulder_asymmetry"] == "yes"
    # unknown orientation -> everything invalid
    assert all(x == "no" for x in geo.valid_angles("unknown").values())


def test_compute_frame_angles_respects_orientation():
    k = make_kpts(facing="front")
    angles = geo.compute_frame_angles(k, "face", ref_shoulder_hip_px=100.0)
    # face view: neck/trunk invalid -> None; asymmetry/tilt/slump computed
    assert angles["neck_flexion"] is None
    assert angles["trunk_inclination"] is None
    assert angles["shoulder_asymmetry"] is not None
    assert angles["head_lateral_tilt"] is not None
    assert angles["slump_index"] is not None
    angles_p = geo.compute_frame_angles(k, "profile",
                                        ref_shoulder_hip_px=100.0)
    assert angles_p["neck_flexion"] is not None
    assert angles_p["shoulder_asymmetry"] is None
