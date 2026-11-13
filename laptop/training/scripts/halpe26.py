"""Halpe-26 layout + small pure-numpy helpers shared by the training scripts.

Keypoint order is the mmpose `halpe26` definition used by rtmlib BodyWithFeet
(and by laptop/posture/afferent/keypoints.py):

    0-16  COCO-17 body (nose, eyes, ears, shoulders, elbows, wrists, hips,
          knees, ankles)
    17 head  18 neck  19 hip (pelvis centre)
    20 left_big_toe  21 right_big_toe  22 left_small_toe  23 right_small_toe
    24 left_heel     25 right_heel

Only numpy is imported at module level so tests run without torch/cv2.
"""
from __future__ import annotations

from typing import Iterable

import numpy as np

KP_NAMES: tuple[str, ...] = (
    "nose", "left_eye", "right_eye", "left_ear", "right_ear",
    "left_shoulder", "right_shoulder", "left_elbow", "right_elbow",
    "left_wrist", "right_wrist",
    "left_hip", "right_hip", "left_knee", "right_knee",
    "left_ankle", "right_ankle",
    "head", "neck", "hip",
    "left_big_toe", "right_big_toe", "left_small_toe", "right_small_toe",
    "left_heel", "right_heel",
)
N_KPTS = len(KP_NAMES)
FEET = tuple(range(20, 26))
LEFT_SHOULDER, RIGHT_SHOULDER, LEFT_HIP, RIGHT_HIP = 5, 6, 11, 12
NECK, HIP = 18, 19

# 0-indexed links (mmpose halpe26 skeleton_info).
SKELETON_0: tuple[tuple[int, int], ...] = (
    (15, 13), (13, 11), (11, 19), (16, 14), (14, 12), (12, 19),
    (17, 18), (18, 19), (18, 5), (5, 7), (7, 9), (18, 6), (6, 8), (8, 10),
    (1, 2), (0, 1), (0, 2), (1, 3), (2, 4), (3, 5), (4, 6),
    (15, 20), (15, 22), (15, 24), (16, 21), (16, 23), (16, 25),
)

# OKS sigmas from mmpose configs/_base_/datasets/halpe26.py (for AP).
SIGMAS = np.array([
    0.026, 0.025, 0.025, 0.035, 0.035, 0.079, 0.079, 0.072, 0.072, 0.062,
    0.062, 0.107, 0.107, 0.087, 0.087, 0.089, 0.089, 0.026, 0.026, 0.066,
    0.079, 0.079, 0.079, 0.079, 0.079, 0.079,
])

# rtmlib RTMPose defaults (rtmlib/tools/pose_estimation/rtmpose.py).
RTM_INPUT_WH = (192, 256)
RTM_MEAN = (123.675, 116.28, 103.53)
RTM_STD = (58.395, 57.12, 57.375)
SIMCC_SPLIT_RATIO = 2.0


def coco_category() -> dict:
    """COCO 'person' category carrying the Halpe-26 keypoints (1-indexed skeleton)."""
    return {
        "id": 1,
        "name": "person",
        "supercategory": "person",
        "keypoints": list(KP_NAMES),
        "skeleton": [[a + 1, b + 1] for a, b in SKELETON_0],
    }


# --------------------------------------------------------------------------
# Metrics
# --------------------------------------------------------------------------

def torso_size(gt: np.ndarray, vis: np.ndarray) -> float:
    """Torso length (pixels) = |mid-shoulder - mid-hip| from GT.

    Falls back to Halpe neck(18)-hip(19). Returns NaN if neither is visible.
    gt: (K, 2); vis: (K,) bool.
    """
    if vis[[LEFT_SHOULDER, RIGHT_SHOULDER, LEFT_HIP, RIGHT_HIP]].all():
        sh = gt[[LEFT_SHOULDER, RIGHT_SHOULDER]].mean(axis=0)
        hp = gt[[LEFT_HIP, RIGHT_HIP]].mean(axis=0)
        d = float(np.linalg.norm(sh - hp))
        if d > 0:
            return d
    if vis[NECK] and vis[HIP]:
        d = float(np.linalg.norm(gt[NECK] - gt[HIP]))
        if d > 0:
            return d
    return float("nan")


def pck(pred: np.ndarray, gt: np.ndarray, vis: np.ndarray,
        thr: float = 0.05) -> dict:
    """PCK@thr normalised by torso size.

    pred, gt: (N, K, 2); vis: (N, K) bool (GT labelled & visible).
    Instances without a measurable torso are skipped (counted in `skipped`).

    Returns dict with:
      per_kpt   (K,) PCK per keypoint (NaN where no visible GT)
      overall   PCK over all visible keypoints of kept instances
      body17 / feet  PCK restricted to COCO-17 / the 6 foot points
      nme       mean torso-normalised error over visible keypoints
      n_inst, skipped
    """
    pred = np.asarray(pred, float)
    gt = np.asarray(gt, float)
    vis = np.asarray(vis, bool)
    n, k = vis.shape
    norms = np.array([torso_size(gt[i], vis[i]) for i in range(n)])
    keep = np.isfinite(norms)
    if not keep.any():
        nan = float("nan")
        return {"per_kpt": np.full(k, nan), "overall": nan, "body17": nan,
                "feet": nan, "nme": nan, "n_inst": 0, "skipped": int(n)}
    err = np.linalg.norm(pred[keep] - gt[keep], axis=-1) / norms[keep, None]
    v = vis[keep]
    hit = (err <= thr) & v
    cnt = v.sum(axis=0)
    with np.errstate(invalid="ignore", divide="ignore"):
        per_kpt = np.where(cnt > 0, hit.sum(axis=0) / np.maximum(cnt, 1),
                           np.nan)

    def _sub(idx: Iterable[int]) -> float:
        idx = [i for i in idx if i < k]
        c = v[:, idx].sum()
        return float(hit[:, idx].sum() / c) if c else float("nan")

    return {
        "per_kpt": per_kpt,
        "overall": float(hit.sum() / v.sum()) if v.sum() else float("nan"),
        "body17": _sub(range(17)),
        "feet": _sub(FEET),
        "nme": float(err[v].mean()) if v.any() else float("nan"),
        "n_inst": int(keep.sum()),
        "skipped": int((~keep).sum()),
    }


def oks(pred: np.ndarray, gt: np.ndarray, vis: np.ndarray, area: float,
        sigmas: np.ndarray = SIGMAS) -> float:
    """COCO Object Keypoint Similarity for one instance (pred/gt (K,2))."""
    if not vis.any():
        return float("nan")
    var = (2 * sigmas) ** 2
    d2 = ((pred - gt) ** 2).sum(-1)
    e = d2 / var / (area + np.spacing(1)) / 2
    return float(np.exp(-e[vis]).mean())


def oks_ap(oks_values: np.ndarray,
           thrs: np.ndarray = np.arange(0.5, 0.96, 0.05)) -> float:
    """Simplified AP for top-down eval with GT boxes (1 pred per GT):
    mean over OKS thresholds of the fraction of instances above threshold.
    Equals COCO AP when there are no false positives / duplicates, which is
    the case when evaluating with ground-truth boxes."""
    o = np.asarray(oks_values, float)
    o = o[np.isfinite(o)]
    if o.size == 0:
        return float("nan")
    return float(np.mean([(o >= t).mean() for t in thrs]))
