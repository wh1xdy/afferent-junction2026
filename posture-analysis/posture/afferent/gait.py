"""Gait variables from a walking episode (plan section 15).

Input is a buffer of per-frame samples collected while walking. Speed uses
floor-plane positions when calibrated (m/s); cadence comes from the
detrended vertical mid-hip signal in image space (band 1.2-3 Hz).
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field

import numpy as np

from . import keypoints as kp
from . import geometry as geo

CADENCE_BAND_HZ = (1.2, 3.0)


@dataclass
class GaitSample:
    t: float                     # seconds (monotonic)
    mid_hip_img: tuple[float, float]    # image px
    head_img: tuple[float, float] | None
    trunk_len: float | None            # px
    trunk_inclination: float | None    # deg
    arm_angles: tuple[float | None, float | None]  # L/R shoulder->wrist vs trunk
    floor_pos: tuple[float, float] | None          # metres, if calibrated
    orientation: str = "unknown"       # body orientation for filtering


@dataclass
class GaitResult:
    n_samples: int = 0
    duration_s: float = 0.0
    distance_m: float | None = None
    speed_m_s: float | None = None
    cadence_hz: float | None = None
    cadence_steps_min: float | None = None
    step_length_m: float | None = None
    bounce_mid_hip: float | None = None       # median p2p / trunk length
    bounce_head: float | None = None
    bounce_over_step: float | None = None
    mean_trunk_inclination_deg: float | None = None
    arm_swing_amp_deg: float | None = None    # median p2p per side, mean of L/R
    calibrated: bool = False
    effective_fps: float | None = None        # n_samples / duration
    undersampled: bool = False                # effective_fps < min_fps
    extras: dict = field(default_factory=dict)


def _resample_uniform(t: np.ndarray, y: np.ndarray, fps: float = 30.0
                      ) -> tuple[np.ndarray, np.ndarray]:
    """Linear resample onto a uniform grid at `fps`."""
    if len(t) < 4:
        return t, y
    t0, t1 = t[0], t[-1]
    if t1 <= t0:
        return t, y
    tu = np.arange(t0, t1, 1.0 / fps)
    yu = np.interp(tu, t, y)
    return tu, yu


def _detrend(y: np.ndarray) -> np.ndarray:
    """Remove best-fit line (cheap detrend, no scipy needed)."""
    if len(y) < 3:
        return y - np.mean(y)
    x = np.arange(len(y), dtype=np.float64)
    A = np.vstack([x, np.ones_like(x)]).T
    coef, *_ = np.linalg.lstsq(A, y, rcond=None)
    return y - (A @ coef)


def dominant_frequency_hz(t: np.ndarray, y: np.ndarray,
                          band: tuple[float, float] = CADENCE_BAND_HZ,
                          fps: float = 30.0) -> float | None:
    """Dominant frequency of a detrended signal within `band` (Hz)."""
    y = np.asarray(y, dtype=np.float64)
    t = np.asarray(t, dtype=np.float64)
    ok = np.isfinite(y) & np.isfinite(t)
    t, y = t[ok], y[ok]
    if len(t) < 8:
        return None
    tu, yu = _resample_uniform(t, y, fps)
    yu = _detrend(yu)
    yu = yu * np.hanning(len(yu))
    n = len(yu)
    spec = np.abs(np.fft.rfft(yu))
    freqs = np.fft.rfftfreq(n, d=1.0 / fps)
    mask = (freqs >= band[0]) & (freqs <= band[1])
    if not mask.any() or spec[mask].max() <= 0:
        return None
    idx = np.argmax(np.where(mask, spec, 0.0))
    # Parabolic interpolation around the peak for sub-bin accuracy.
    if 0 < idx < len(spec) - 1:
        a, b, c = spec[idx - 1], spec[idx], spec[idx + 1]
        denom = (a - 2 * b + c)
        shift = 0.5 * (a - c) / denom if abs(denom) > 1e-12 else 0.0
        shift = max(-0.5, min(0.5, shift))
    else:
        shift = 0.0
    df = freqs[1] - freqs[0] if len(freqs) > 1 else 0.0
    return float(freqs[idx] + shift * df)


def _peak_to_peak_per_cycle(yu: np.ndarray, fps: float,
                            freq_hz: float) -> list[float]:
    """Peak-to-peak amplitudes, one per estimated step cycle."""
    if freq_hz is None or freq_hz <= 0 or len(yu) < 8:
        return []
    yd = _detrend(yu)
    period = max(int(round(fps / freq_hz)), 2)
    # light smoothing only: a kernel wider than ~period/6 attenuates the
    # gait-band signal itself (boxcar sinc rolloff) and biases p2p low.
    kernel = max(3, period // 6 | 1)
    smooth = np.convolve(yd, np.ones(kernel) / kernel, mode="same")
    amps = []
    i = 0
    n = len(smooth)
    # walk through cycles: alternate min/max search within each period window
    # simpler robust approach: split signal into windows of one period and take
    # (max-min) per window, dropping edge windows.
    nwin = int(n / period)
    for w in range(1, nwin):
        seg = smooth[w * period:(w + 1) * period]
        if len(seg) < period // 2:
            continue
        amps.append(float(seg.max() - seg.min()))
    return amps


def _central_mask(t: np.ndarray, frac: float = 0.2) -> np.ndarray:
    """Keep the central (1 - 2*frac) of the time range: drops starts/turns."""
    t0, t1 = t.min(), t.max()
    span = t1 - t0
    return (t >= t0 + frac * span) & (t <= t1 - frac * span)


def arm_swing_angle(kpts: np.ndarray) -> tuple[float | None, float | None]:
    """Signed angle shoulder->wrist vs the trunk axis (shoulder->hip), deg.

    0 = arm hanging along the trunk; sign comes from the 2D cross product
    (consistent convention, walking direction unknown in 2D). Unsigned acos
    would fold forward/back swing through 0 and halve the measured amplitude.
    """
    ms, mh = geo.mid_shoulder(kpts), geo.mid_hip(kpts)
    if ms is None or mh is None:
        return None, None
    trunk = mh - ms          # shoulder -> hip (down the body)
    tn = np.linalg.norm(trunk)
    if tn < 1e-6:
        return None, None
    out = []
    for sh, wr in ((kp.LEFT_SHOULDER, kp.LEFT_WRIST),
                   (kp.RIGHT_SHOULDER, kp.RIGHT_WRIST)):
        s, w = geo._pt(kpts, sh), geo._pt(kpts, wr)
        if s is None or w is None:
            out.append(None)
            continue
        v = w - s
        vn = np.linalg.norm(v)
        if vn < 1e-6:
            out.append(None)
            continue
        cross = trunk[0] * v[1] - trunk[1] * v[0]
        dot = float(np.dot(trunk, v))
        out.append(math.degrees(math.atan2(cross, dot)))
    return out[0], out[1]


def analyze_gait(samples: list[GaitSample],
                 min_fps: float = 8.0) -> GaitResult:
    """Compute all gait variables for one walking episode.

    `min_fps` is the minimum effective sample rate (n_samples/duration)
    for the episode to be trustworthy — on a slow CPU the pose rate can
    drop below what cadence/bounce estimation needs. Below it the result
    is flagged `undersampled` but all variables are still computed.
    """
    res = GaitResult(n_samples=len(samples))
    if len(samples) >= 2:
        span = float(samples[-1].t - samples[0].t)
        res.duration_s = span
        res.effective_fps = len(samples) / span if span > 0 else 0.0
        res.undersampled = res.effective_fps < min_fps
    if len(samples) < 10:
        return res
    t = np.array([s.t for s in samples])
    res.duration_s = float(t[-1] - t[0])

    floor = [s.floor_pos for s in samples]
    calibrated = all(p is not None for p in floor)
    res.calibrated = calibrated

    hip_img_y = np.array([s.mid_hip_img[1] for s in samples])
    trunk_len = np.array([s.trunk_len if s.trunk_len else np.nan
                          for s in samples])

    # --- cadence: dominant freq of detrended vertical hip signal -----------
    freq = dominant_frequency_hz(t, hip_img_y)
    res.cadence_hz = freq
    if freq:
        res.cadence_steps_min = freq * 60.0

    # --- bounce: median peak-to-peak per cycle / trunk length ---------------
    tu, yu = _resample_uniform(t, hip_img_y)
    y_norm = yu / np.nanmedian(trunk_len[np.isfinite(trunk_len)]) \
        if np.isfinite(trunk_len).any() else yu
    p2p = _peak_to_peak_per_cycle(y_norm, 30.0, freq)
    if p2p:
        res.bounce_mid_hip = float(np.median(p2p))

    head_y = np.array([s.head_img[1] if s.head_img else np.nan
                       for s in samples])
    ok = np.isfinite(head_y)
    if ok.sum() >= 10:
        th, yh = _resample_uniform(t[ok], head_y[ok])
        yhn = yh / np.nanmedian(trunk_len[np.isfinite(trunk_len)]) \
            if np.isfinite(trunk_len).any() else yh
        p2p_h = _peak_to_peak_per_cycle(yhn, 30.0, freq)
        if p2p_h:
            res.bounce_head = float(np.median(p2p_h))

    # --- speed / distance on floor plane, central part only ----------------
    if calibrated:
        pos = np.array(floor, dtype=np.float64)
        seg = np.linalg.norm(np.diff(pos, axis=0), axis=1)
        dt = np.diff(t)
        valid = dt > 1e-6
        inst_speed = seg[valid] / dt[valid]
        central = _central_mask(t[:-1][valid]) if len(t) > 4 else \
            np.ones(len(inst_speed), bool)
        # distance over the whole path, speed over central portion
        res.distance_m = float(seg.sum())
        if central.any() and inst_speed[central].size:
            res.speed_m_s = float(np.median(inst_speed[central]))
        elif inst_speed.size:
            res.speed_m_s = float(np.median(inst_speed))

    # --- derived ------------------------------------------------------------
    if res.speed_m_s and res.cadence_hz and res.cadence_hz > 0:
        res.step_length_m = res.speed_m_s / res.cadence_hz
    if (res.bounce_mid_hip is not None and res.step_length_m
            and res.step_length_m > 0):
        res.bounce_over_step = res.bounce_mid_hip / res.step_length_m

    # Only use profile/three_quarter orientations for trunk inclination
    # (face/back views cannot measure anteroposterior lean); use median.
    _valid_ori = ("profile", "three_quarter")
    incl = [s.trunk_inclination for s in samples
            if s.trunk_inclination is not None
            and s.orientation in _valid_ori]
    if not incl:
        # Fallback: use all orientations if none match the filter
        incl = [s.trunk_inclination for s in samples
                if s.trunk_inclination is not None]
    if incl:
        res.mean_trunk_inclination_deg = float(np.median(incl))

    # --- arm swing: per-stride peak-to-peak of the signed shoulder->wrist
    # angle. Arm swing period = one stride = 2 steps, so windows use freq/2.
    stride_hz = freq / 2.0 if freq else None
    amps = []
    for side in range(2):
        series = np.array([s.arm_angles[side] if s.arm_angles[side]
                           is not None else np.nan for s in samples])
        ok = np.isfinite(series)
        if ok.sum() < 10 or stride_hz is None:
            continue
        tu2, yu2 = _resample_uniform(t[ok], series[ok])
        p2p_a = _peak_to_peak_per_cycle(_detrend(yu2), 30.0, stride_hz)
        if p2p_a:
            amps.append(float(np.median(p2p_a)))
    if amps:
        res.arm_swing_amp_deg = float(np.mean(amps))

    return res
