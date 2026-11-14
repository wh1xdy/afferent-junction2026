import numpy as np

import halpe26 as H
from eval_variables import agreement


def _skeleton(n, rng):
    """Random upright people with torso length 100 px."""
    gt = rng.uniform(0, 300, size=(n, H.N_KPTS, 2))
    gt[:, [H.LEFT_SHOULDER, H.RIGHT_SHOULDER], 1] = 100.0
    gt[:, [H.LEFT_HIP, H.RIGHT_HIP], 1] = 200.0
    gt[:, H.LEFT_SHOULDER, 0] = gt[:, H.LEFT_HIP, 0] = 120.0
    gt[:, H.RIGHT_SHOULDER, 0] = gt[:, H.RIGHT_HIP, 0] = 80.0
    return gt


def test_torso_size():
    gt = _skeleton(1, np.random.default_rng(0))[0]
    vis = np.ones(H.N_KPTS, bool)
    assert H.torso_size(gt, vis) == 100.0
    vis[H.LEFT_HIP] = False
    gt[H.NECK] = (0, 0)
    gt[H.HIP] = (30, 40)
    assert H.torso_size(gt, vis) == 50.0  # neck-hip fallback
    vis[H.HIP] = False
    assert np.isnan(H.torso_size(gt, vis))


def test_pck_perfect_and_threshold():
    rng = np.random.default_rng(1)
    gt = _skeleton(10, rng)
    vis = np.ones(gt.shape[:2], bool)
    r = H.pck(gt.copy(), gt, vis)
    assert r["overall"] == 1.0 and r["feet"] == 1.0 and r["nme"] == 0.0
    # offset of 4 px = 0.04 torso -> hit at 0.05, miss at 0.03
    pred = gt + np.array([4.0, 0.0])
    assert H.pck(pred, gt, vis, 0.05)["overall"] == 1.0
    assert H.pck(pred, gt, vis, 0.03)["overall"] == 0.0
    assert np.isclose(H.pck(pred, gt, vis)["nme"], 0.04)


def test_pck_feet_only_error_and_visibility():
    rng = np.random.default_rng(2)
    gt = _skeleton(8, rng)
    vis = np.ones(gt.shape[:2], bool)
    pred = gt.copy()
    pred[:, list(H.FEET)] += 50.0  # 0.7 torso off
    r = H.pck(pred, gt, vis)
    assert r["body17"] == 1.0 and r["feet"] == 0.0
    assert np.allclose(r["per_kpt"][list(H.FEET)], 0.0)
    assert np.isclose(r["overall"], 20 / 26)
    # invisible GT feet are ignored entirely
    vis[:, list(H.FEET)] = False
    r = H.pck(pred, gt, vis)
    assert r["overall"] == 1.0 and np.isnan(r["feet"])
    assert np.isnan(r["per_kpt"][H.FEET[0]])


def test_pck_skips_instances_without_torso():
    rng = np.random.default_rng(3)
    gt = _skeleton(4, rng)
    vis = np.ones(gt.shape[:2], bool)
    vis[0, [H.LEFT_SHOULDER, H.NECK]] = False
    r = H.pck(gt, gt, vis)
    assert r["n_inst"] == 3 and r["skipped"] == 1


def test_oks_ap():
    rng = np.random.default_rng(4)
    gt = _skeleton(5, rng)
    vis = np.ones(gt.shape[:2], bool)
    o = [H.oks(gt[i], gt[i], vis[i], 1e4) for i in range(5)]
    assert np.allclose(o, 1.0) and H.oks_ap(o) == 1.0
    far = [H.oks(gt[i] + 500, gt[i], vis[i], 1e4) for i in range(5)]
    assert H.oks_ap(far) == 0.0


def test_agreement():
    gt = np.array([1.0, 1.2, 1.1, 0.9])
    r = agreement(gt, gt * 1.02, tol=0.05)
    assert r["within_tol"] == 1.0 and r["bias"] > 0
    assert np.isclose(r["mean_rel_err"], 0.02)
