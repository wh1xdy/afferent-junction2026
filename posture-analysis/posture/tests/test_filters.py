"""One-Euro filter tests on synthetic signals."""
import numpy as np

from afferent.filters import KeypointSmoother, OneEuroAxis


def _kpts_at(x: float, y: float, conf: float = 0.9):
    k = np.full((26, 3), np.nan)
    k[0] = (x, y, conf)
    return k


def test_one_euro_converges():
    ax = OneEuroAxis(min_cutoff=1.0, beta=0.0)
    # step input: should converge close to the new value quickly
    for i in range(30):
        ax(0.0, i / 30.0)
    for i in range(30, 90):
        out = ax(10.0, i / 30.0)
    assert abs(out - 10.0) < 1.0


def test_one_euro_attenuates_noise():
    rng = np.random.default_rng(0)
    ax = OneEuroAxis(min_cutoff=1.0, beta=0.0)
    raw, filt = [], []
    for i in range(300):
        v = 5.0 + rng.normal(0, 2.0)
        raw.append(v)
        filt.append(ax(v, i / 30.0))
    assert np.std(filt) < 0.6 * np.std(raw)


def test_smoother_nan_for_low_conf():
    s = KeypointSmoother(min_cutoff=1.0, beta=0.0, conf_threshold=0.3)
    k = _kpts_at(100.0, 200.0, conf=0.9)
    out = s.update(k, 0.0)
    assert np.isfinite(out[0, 0])
    k2 = _kpts_at(100.0, 200.0, conf=0.1)   # below threshold
    out2 = s.update(k2, 0.033)
    assert np.isnan(out2[0, 0]) and np.isnan(out2[0, 1])
    # high-conf again -> filtered value resumes (not stuck at NaN)
    out3 = s.update(k, 0.066)
    assert np.isfinite(out3[0, 0])


def test_smoother_tracks_motion():
    s = KeypointSmoother(min_cutoff=5.0, beta=1.0, conf_threshold=0.3)
    t = 0.0
    for i in range(60):
        out = s.update(_kpts_at(100.0 + i, 200.0), t)
        t += 1 / 30
    assert abs(out[0, 0] - 159.0) < 5.0
