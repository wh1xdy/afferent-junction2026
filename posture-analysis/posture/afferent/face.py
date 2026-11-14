"""Face analysis wrappers: InsightFace identity, MediaPipe blendshapes +
head pose, optional HSEmotion emotion.

All heavy imports are lazy so tests and the dashboard work without models.
"""
from __future__ import annotations

import os
import urllib.request
from dataclasses import dataclass, field
from typing import Any

import cv2
import numpy as np

from .identity import FaceObs

MEDIAPIPE_FACE_TASK_URL = (
    "https://storage.googleapis.com/mediapipe-models/face_landmarker/"
    "face_landmarker/float16/1/face_landmarker.task")

# Blendshapes retained for expressivity aggregates (sec. 5.3 / 16).
RETAINED_BLENDSHAPES = (
    "mouthSmileLeft", "mouthSmileRight",
    "browDownLeft", "browDownRight",
    "mouthFrownLeft", "mouthFrownRight",
    "eyeBlinkLeft", "eyeBlinkRight",
    "eyeWideLeft", "eyeWideRight",
    "browInnerUp", "jawOpen",
)

EMOTION_NAMES_8 = ("Anger", "Contempt", "Disgust", "Fear", "Happiness",
                   "Neutral", "Sadness", "Surprise")


@dataclass
class FaceMetrics:
    blendshapes: dict[str, float] = field(default_factory=dict)
    pitch_deg: float | None = None
    yaw_deg: float | None = None
    roll_deg: float | None = None
    emotion: str | None = None
    emotion_scores: dict[str, float] = field(default_factory=dict)
    valence: float | None = None
    arousal: float | None = None
    face_px: float = 0.0          # bbox short side, for usability checks
    t: float = 0.0


def smile_score(blendshapes: dict[str, float]) -> float | None:
    """Combined smile coefficient (mean of left/right mouthSmile)."""
    vals = [blendshapes.get(k) for k in
            ("mouthSmileLeft", "mouthSmileRight")]
    vals = [v for v in vals if v is not None]
    return float(np.mean(vals)) if vals else None


class InsightFaceDetector:
    """buffalo_l/buffalo_s detection + recognition (non-commercial models)."""

    def __init__(self, model_name: str = "buffalo_l",
                 root: str = "/models/insightface", ctx_id: int = 0):
        from insightface.app import FaceAnalysis
        self.app = FaceAnalysis(
            name=model_name, root=root,
            allowed_modules=["detection", "recognition"])
        self.app.prepare(ctx_id=ctx_id, det_size=(640, 640))

    def detect(self, frame_bgr: np.ndarray, t: float = 0.0
               ) -> list[FaceObs]:
        faces = self.app.get(frame_bgr)
        out = []
        for f in faces:
            emb = getattr(f, "normed_embedding", None)
            if emb is None:
                emb = getattr(f, "embedding", None)
            if emb is None:
                continue
            out.append(FaceObs(
                bbox=tuple(float(v) for v in f.bbox),
                embedding=np.asarray(emb, dtype=np.float64),
                score=float(getattr(f, "det_score", 1.0)),
                t=t))
        return out


class MediaPipeLandmarker:
    """Face Landmarker task: blendshapes + facial transformation matrix."""

    def __init__(self, model_path: str):
        try:
            from mediapipe.tasks.python import vision, BaseOptions
        except ImportError:  # older layout
            import mediapipe as mp
            vision = mp.tasks.vision
            BaseOptions = mp.tasks.BaseOptions
        self._vision = vision
        opts = vision.FaceLandmarkerOptions(
            base_options=BaseOptions(model_asset_path=model_path),
            output_face_blendshapes=True,
            output_facial_transformation_matrixes=True,
            num_faces=1,
            running_mode=vision.RunningMode.IMAGE,
        )
        self._landmarker = vision.FaceLandmarker.create_from_options(opts)

    def close(self) -> None:
        self._landmarker.close()

    def analyze(self, crop_bgr: np.ndarray, t: float = 0.0) -> FaceMetrics | None:
        rgb = cv2.cvtColor(crop_bgr, cv2.COLOR_BGR2RGB)
        import mediapipe as mp
        image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
        result = self._landmarker.detect(image)
        if not result.face_landmarks:
            return None
        m = FaceMetrics(t=t)
        h, w = crop_bgr.shape[:2]
        m.face_px = float(min(h, w))
        if result.face_blendshapes:
            cats = result.face_blendshapes[0]
            for c in cats:
                name = getattr(c, "category_name", None) or \
                    getattr(c, "name", None)
                if name in RETAINED_BLENDSHAPES:
                    m.blendshapes[name] = float(c.score)
        if result.facial_transformation_matrixes:
            mat = np.asarray(result.facial_transformation_matrixes[0],
                             dtype=np.float64)
            pitch, yaw, roll = _euler_from_matrix(mat)
            m.pitch_deg, m.yaw_deg, m.roll_deg = pitch, yaw, roll
        return m


def _euler_from_matrix(mat: np.ndarray) -> tuple[float | None, ...]:
    """Extract pitch/yaw/roll (deg) from a 4x4 facial transform matrix.

    MediaPipe's python binding returns the rotation as a row-major 3x3 in
    the upper-left block; the head looks down the camera's -Z axis, so the
    usual ZYX Euler decomposition applies (verified against live output in
    the container smoke test).
    """
    import math
    m = np.asarray(mat, dtype=np.float64)
    if m.size == 16:
        m = m.reshape(4, 4)
    if m.shape != (4, 4):
        return None, None, None
    R = m[:3, :3]
    sy = max(-1.0, min(1.0, -float(R[2, 0])))
    yaw = math.degrees(math.asin(sy))
    pitch = math.degrees(math.atan2(float(R[2, 1]), float(R[2, 2])))
    roll = math.degrees(math.atan2(float(R[1, 0]), float(R[0, 0])))
    return pitch, yaw, roll


class EmotionRecognizer:
    """HSEmotion ONNX: 8 emotions + valence/arousal on the face crop."""

    MODEL_NAME = "enet_b0_8_va_mtl"

    def __init__(self, models_dir: str = "/models"):
        # hsemotion-onnx caches under ~/.hsemotion; mirror it onto the
        # persistent models volume so downloads survive container rebuilds.
        self._ensure_cached(models_dir)
        from hsemotion_onnx.facial_emotions import HSEmotionRecognizer
        self._rec = HSEmotionRecognizer(model_name=self.MODEL_NAME)

    @staticmethod
    def _ensure_cached(models_dir: str) -> None:
        import shutil
        home_dir = os.path.join(os.path.expanduser("~"), ".hsemotion")
        model_file = f"{EmotionRecognizer.MODEL_NAME}.onnx"
        shared = os.path.join(models_dir, "hsemotion", model_file)
        home_file = os.path.join(home_dir, model_file)
        os.makedirs(home_dir, exist_ok=True)
        if not os.path.exists(home_file) and os.path.exists(shared):
            shutil.copyfile(shared, home_file)

    def persist(self, models_dir: str) -> None:
        """Copy the downloaded weights onto the models volume."""
        import shutil
        home_file = os.path.join(os.path.expanduser("~"), ".hsemotion",
                                 f"{self.MODEL_NAME}.onnx")
        dest_dir = os.path.join(models_dir, "hsemotion")
        os.makedirs(dest_dir, exist_ok=True)
        if os.path.exists(home_file):
            shutil.copyfile(home_file, os.path.join(dest_dir,
                                                    os.path.basename(home_file)))

    def predict(self, face_crop_bgr: np.ndarray
                ) -> tuple[str | None, dict[str, float],
                           float | None, float | None]:
        emotion, scores = self._rec.predict_emotions(face_crop_bgr,
                                                     logits=False)
        arr = np.asarray(scores, dtype=np.float64).ravel()
        # _mtl models append valence & arousal as the last two outputs.
        if arr.size >= len(EMOTION_NAMES_8) + 2:
            emo = arr[:len(EMOTION_NAMES_8)]
            valence, arousal = float(arr[-2]), float(arr[-1])
        else:
            emo = arr[:len(EMOTION_NAMES_8)] if arr.size else arr
            valence = arousal = None
        dist = {name: float(v) for name, v in zip(EMOTION_NAMES_8, emo)}
        return emotion, dist, valence, arousal


class FaceModule:
    """Orchestrates detection (full frame, every N frames) and per-target
    crop analysis (landmarker + optional emotion)."""

    def __init__(self, cfg, storage=None):
        self.cfg = cfg
        self.detector = InsightFaceDetector(
            model_name=cfg.insightface_model,
            root=os.path.join(cfg.models_dir, "insightface"),
            ctx_id=0 if cfg.device == "cuda" else -1)
        self.landmarker = MediaPipeLandmarker(
            os.path.join(cfg.models_dir, "face_landmarker.task"))
        self.emotion = EmotionRecognizer(cfg.models_dir) \
            if cfg.emotion_enabled else None
        if self.emotion is not None:
            self.emotion.persist(cfg.models_dir)
        self._frame_idx = 0

    def detect_faces(self, frame_bgr: np.ndarray, t: float
                     ) -> list[FaceObs] | None:
        """Full-frame detection, throttled by cfg.face_detect_every."""
        self._frame_idx += 1
        if self._frame_idx % max(1, self.cfg.face_detect_every) != 1:
            return None
        return self.detector.detect(frame_bgr, t=t)

    def analyze_target(self, frame_bgr: np.ndarray,
                       person_bbox: tuple[float, float, float, float],
                       t: float, with_emotion: bool = True
                       ) -> FaceMetrics | None:
        """Run landmarker (+optional emotion) on the target's face crop."""
        x1, y1, x2, y2 = [int(round(v)) for v in person_bbox]
        h, w = frame_bgr.shape[:2]
        x1, y1 = max(0, x1), max(0, y1)
        x2, y2 = min(w, x2), min(h, y2)
        if x2 - x1 < 32 or y2 - y1 < 32:
            return None
        bw, bh = x2 - x1, y2 - y1
        # face lives in the upper part of the person bbox; take top 45% + margin
        fy2 = min(h, y1 + int(bh * 0.5))
        fx1 = max(0, x1 - int(0.15 * bw))
        fx2 = min(w, x2 + int(0.15 * bw))
        crop = frame_bgr[y1:fy2, fx1:fx2]
        if crop.size == 0:
            return None
        metrics = self.landmarker.analyze(crop, t=t)
        if metrics is None:
            return None
        if with_emotion and self.emotion is not None:
            # tighter crop around the detected face for emotion
            emo_crop = self._face_crop(frame_bgr, person_bbox)
            if emo_crop is not None:
                emotion, dist, valence, arousal = self.emotion.predict(
                    emo_crop)
                metrics.emotion = emotion
                metrics.emotion_scores = dist
                metrics.valence = valence
                metrics.arousal = arousal
        return metrics

    @staticmethod
    def _face_crop(frame_bgr: np.ndarray,
                   person_bbox: tuple[float, float, float, float]
                   ) -> np.ndarray | None:
        x1, y1, x2, y2 = [int(round(v)) for v in person_bbox]
        h, w = frame_bgr.shape[:2]
        bw, bh = x2 - x1, y2 - y1
        # upper-center region of the person bbox ~ face
        fx1 = max(0, x1 + int(0.2 * bw))
        fx2 = min(w, x2 - int(0.2 * bw))
        fy1 = max(0, y1)
        fy2 = min(h, y1 + int(0.35 * bh))
        if fx2 - fx1 < 32 or fy2 - fy1 < 32:
            return None
        return frame_bgr[fy1:fy2, fx1:fx2]
