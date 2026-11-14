"""Pose estimation wrapper over rtmlib BodyWithFeet (Halpe-26 + feet).

Returns a list of {"bbox": (x1,y1,x2,y2), "kpts": (26,3) x,y,conf}.
Model files are cached under <models_dir>/rtmlib via TORCH_HOME so the
runtime is offline after `download_models` has run once.

CPU throughput: the YOLOX detector is the expensive half, so it runs every
`det_every` frames; between detections the last boxes (expanded 10 %) are
reused for the top-down pose model, like rtmlib's PoseTracker. Callers pass
force_detect=True whenever the target is lost or no person was found.

Custom fine-tuned pose ONNX (posture-analysis/training "install-model") can replace the
rtmpose body model via POSE_MODEL_PATH -> BodyWithFeet(pose=..., pose_input_size=(192,256)).
"""
from __future__ import annotations

import os
from typing import Any

import numpy as np


class PoseEstimator:
    def __init__(self, mode: str = "lightweight", device: str = "cpu",
                 models_dir: str = "/models", det_every: int = 5,
                 pose_model_path: str = ""):
        # rtmlib caches ONNX checkpoints under $TORCH_HOME/rtmlib/hub.
        os.environ.setdefault("TORCH_HOME", os.path.join(models_dir, "rtmlib"))
        from rtmlib import BodyWithFeet
        self.mode = mode
        self.device = device
        self.det_every = max(1, int(det_every))
        self.pose_model_path = pose_model_path or ""
        kwargs: dict[str, Any] = {}
        if self.pose_model_path:
            # custom rtmpose ONNX exported by posture-analysis/training export_onnx.py:
            # input (W,H)=(192,256), Halpe-26 simcc outputs
            kwargs["pose"] = self.pose_model_path
            kwargs["pose_input_size"] = (192, 256)
        self._model = BodyWithFeet(mode=mode, backend="onnxruntime",
                                   device=device, **kwargs)
        self._frame_idx = 0
        self._last_bboxes: list | None = None
        self.detector_runs = 0
        self.pose_runs = 0

    @staticmethod
    def _expand(bboxes: list, factor: float = 1.1) -> list:
        out = []
        for bb in bboxes:
            x1, y1, x2, y2 = (float(v) for v in bb)
            w, h = x2 - x1, y2 - y1
            cx, cy = (x1 + x2) / 2, (y1 + y2) / 2
            nw, nh = w * factor, h * factor
            out.append((cx - nw / 2, cy - nh / 2, cx + nw / 2, cy + nh / 2))
        return out

    def __call__(self, frame: np.ndarray,
                 force_detect: bool = False) -> list[dict[str, Any]]:
        """frame: BGR image. Returns person detections with Halpe-26 kpts."""
        self._frame_idx += 1
        fresh = (force_detect
                 or self._last_bboxes is None
                 or not self._last_bboxes
                 or (self._frame_idx - 1) % self.det_every == 0)
        if fresh:
            det = self._model.det_model(frame)
            self.detector_runs += 1
            self._last_bboxes = (
                [tuple(float(v) for v in bb) for bb in det]
                if det is not None and len(det) else [])
            bboxes = self._last_bboxes
        else:
            bboxes = self._expand(self._last_bboxes)
        if not bboxes:
            return []
        bbox_arr = np.asarray(bboxes, dtype=np.float64).reshape(-1, 4)
        keypoints, scores = self._model.pose_model(frame, bboxes=bbox_arr)
        self.pose_runs += 1
        persons = []
        n = min(keypoints.shape[0], len(bbox_arr))
        for i in range(n):
            kpts = np.concatenate(
                [keypoints[i], scores[i].reshape(-1, 1)], axis=1)
            persons.append({
                "bbox": tuple(float(v) for v in bbox_arr[i]),
                "kpts": kpts.astype(np.float64),
            })
        return persons
