"""Gait variable tests on synthetic walking signals."""
import numpy as np
import pytest

from afferent import gait
from afferent.floor import FloorMap


def _samples(n=300, fps=30.0, freq=1.8, speed=0.9, bounce_px=12.0,
             trunk=100.0, arm_amp=20.0, head_bounce_px=8.0):
    """Synthetic walk: constant speed on floor plane + sinusoidal bounce.

    Hip bounce oscillates at the step frequency `freq`; arm swing at the
    stride frequency freq/2 (one stride = two steps), signed around 0
    (hanging along the trunk)."""
    out = []
    for i in range(n):
        t = i / fps
        hip_y = 300.0 + bounce_px * np.sin(2 * np.pi * freq * t)
        head_y = 200.0 + head_bounce_px * np.sin(2 * np.pi * freq * t + 0.4)
        arm = arm_amp * np.sin(2 * np.pi * (freq / 2.0) * t)
        out.append(gait.GaitSample(
            t=t,
            mid_hip_img=(400.0, float(hip_y)),
            head_img=(400.0, float(head_y)),
            trunk_len=trunk,
            trunk_inclination=5.0,
            arm_angles=(float(arm), float(arm)),
            floor_pos=(speed * t, 0.0),
        ))
    return out


def test_cadence_synthetic():
    res = gait.analyze_gait(_samples(freq=1.8))
    assert res.cadence_hz == pytest.approx(1.8, abs=0.05)
    assert res.cadence_steps_min == pytest.approx(108.0, abs=3.0)


def test_speed_and_step_length():
    res = gait.analyze_gait(_samples(speed=0.9, freq=1.8))
    assert res.speed_m_s == pytest.approx(0.9, abs=0.15)
    assert res.step_length_m == pytest.approx(0.5, abs=0.1)


def test_bounce_amplitude():
    res = gait.analyze_gait(_samples(bounce_px=12.0, trunk=100.0))
    # p2p of sine amp 12px = 24px -> /100 trunk = 0.24 (windowed estimate)
    assert res.bounce_mid_hip == pytest.approx(0.24, abs=0.08)
    assert res.bounce_head == pytest.approx(0.16, abs=0.08)
    assert res.bounce_over_step is not None and res.bounce_over_step > 0


def test_arm_swing_amplitude():
    # arm swings +/-20 deg at stride freq (0.9 Hz for 1.8 Hz cadence)
    # -> signed p2p per stride ~ 40 deg
    res = gait.analyze_gait(_samples(arm_amp=20.0))
    assert res.arm_swing_amp_deg == pytest.approx(40.0, rel=0.10)


def test_mean_trunk_inclination():
    res = gait.analyze_gait(_samples())
    assert res.mean_trunk_inclination_deg == pytest.approx(5.0, abs=0.5)


def test_mean_trunk_inclination_filters_orientation():
    """Only profile/three_quarter samples should be used for trunk incl.
    Face-view samples where the angle is near 0 should be excluded."""
    samples = _samples()
    for i, s in enumerate(samples):
        if i % 2 == 0:
            s.orientation = "face"
            s.trunk_inclination = 0.0  # face view: near-zero artifact
        else:
            s.orientation = "profile"
            # keep original 5.0 deg
    res = gait.analyze_gait(samples)
    # Should use only the profile samples (5.0 deg), not average with face (0 deg)
    assert res.mean_trunk_inclination_deg == pytest.approx(5.0, abs=0.5)


def test_too_few_samples():
    res = gait.analyze_gait(_samples(n=5))
    assert res.n_samples == 5
    assert res.speed_m_s is None


def test_undersampled_flag():
    """Below GAIT_MIN_FPS the result is flagged but values still computed."""
    slow = _samples(n=120, fps=4.0)          # 4 fps < default 8 fps
    res = gait.analyze_gait(slow)
    assert res.undersampled is True
    assert res.effective_fps == pytest.approx(4.0, abs=0.1)
    # variables are still computed despite the flag
    assert res.cadence_hz == pytest.approx(1.8, abs=0.1)
    assert res.speed_m_s == pytest.approx(0.9, abs=0.15)
    # well-sampled episode: no flag
    res_ok = gait.analyze_gait(_samples())
    assert res_ok.undersampled is False
    assert res_ok.effective_fps == pytest.approx(30.0, abs=0.5)


def test_undersampled_respects_min_fps_param():
    res = gait.analyze_gait(_samples(fps=10.0), min_fps=12.0)
    assert res.effective_fps == pytest.approx(10.0, abs=0.1)
    assert res.undersampled is True


def test_uncalibrated_speed_none():
    samples = _samples()
    for s in samples:
        s.floor_pos = None
    res = gait.analyze_gait(samples)
    assert res.speed_m_s is None
    assert res.calibrated is False
    # cadence still works without floor calibration
    assert res.cadence_hz == pytest.approx(1.8, abs=0.05)


def test_floor_homography_roundtrip():
    # square floor 4x4 m seen as a trapezoid in image
    img_pts = [[100, 300], [500, 300], [550, 500], [50, 500]]
    floor_pts = [[0, 0], [4, 0], [4, 4], [0, 4]]
    fm = FloorMap(img_pts, floor_pts)
    assert fm.calibrated
    # image centre should map near floor centre (2,2)
    p = fm.image_to_floor([300, 400])
    assert p is not None
    assert p[0] == pytest.approx(2.0, abs=0.6)
    assert p[1] == pytest.approx(2.0, abs=0.6)
    # uncalibrated -> None
    assert FloorMap().image_to_floor([1, 2]) is None
