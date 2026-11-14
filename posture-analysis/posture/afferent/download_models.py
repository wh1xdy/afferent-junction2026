"""Download all model weights into MODELS_DIR so runtime is offline.

Run:  docker compose run --rm posture python -m afferent.download_models
Also invoked automatically at pipeline startup when files are missing.
"""
from __future__ import annotations

import os
import sys
import urllib.request
from typing import Any

from .config import Config

MEDIAPIPE_FACE_TASK_URL = (
    "https://storage.googleapis.com/mediapipe-models/face_landmarker/"
    "face_landmarker/float16/1/face_landmarker.task")

# rtmlib modes worth pre-fetching: the configured one plus lightweight
# (cheap CPU fallback). 'performance' is large; opt in via POSE_MODE.
RTMLIB_MODES = ("balanced", "lightweight")


def _human(n: int) -> str:
    for unit in ("B", "KB", "MB", "GB"):
        if n < 1024 or unit == "GB":
            return f"{n:.1f} {unit}" if unit != "B" else f"{n} B"
        n /= 1024
    return f"{n} B"


def _dir_size(path: str) -> int:
    total = 0
    for root, _, files in os.walk(path):
        for f in files:
            try:
                total += os.path.getsize(os.path.join(root, f))
            except OSError:
                pass
    return total


def ensure_rtmlib(models_dir: str, modes: tuple[str, ...]) -> dict[str, Any]:
    """Instantiate rtmlib solutions once -> checkpoints cached under
    $TORCH_HOME/rtmlib/hub/checkpoints (= <models_dir>/rtmlib)."""
    os.environ["TORCH_HOME"] = os.path.join(models_dir, "rtmlib")
    from rtmlib import BodyWithFeet
    out = {}
    for mode in modes:
        BodyWithFeet(mode=mode, backend="onnxruntime", device="cpu")
        out[f"rtmlib_{mode}"] = "ok"
    return out


def ensure_insightface(models_dir: str, model_name: str) -> dict[str, Any]:
    import glob
    root = os.path.join(models_dir, "insightface")
    from insightface.app import FaceAnalysis
    app = FaceAnalysis(name=model_name, root=root,
                       allowed_modules=["detection", "recognition"])
    app.prepare(ctx_id=-1, det_size=(640, 640))
    # insightface leaves the downloaded bundle zip next to the extracted
    # models (~300 MB); the runtime only needs the extracted .onnx files.
    model_dir = os.path.join(root, "models", model_name)
    if os.path.isdir(model_dir):
        for z in glob.glob(os.path.join(root, "models", "*.zip")):
            os.remove(z)
    return {"insightface": model_name}


def ensure_mediapipe(models_dir: str) -> dict[str, Any]:
    dest = os.path.join(models_dir, "face_landmarker.task")
    if not (os.path.exists(dest) and os.path.getsize(dest) > 1_000_000):
        os.makedirs(models_dir, exist_ok=True)
        tmp = dest + ".part"
        print(f"[models] downloading face_landmarker.task -> {dest}")
        urllib.request.urlretrieve(MEDIAPIPE_FACE_TASK_URL, tmp)
        os.replace(tmp, dest)
    return {"mediapipe_face_landmarker": _human(os.path.getsize(dest))}


def ensure_hsemotion(models_dir: str, enabled: bool = True) -> dict[str, Any]:
    if not enabled:
        return {"hsemotion": "disabled"}
    from .face import EmotionRecognizer
    rec = EmotionRecognizer(models_dir)
    rec.persist(models_dir)
    return {"hsemotion": EmotionRecognizer.MODEL_NAME}


def models_status(models_dir: str) -> dict[str, Any]:
    """Report what is present under the models dir."""
    status: dict[str, Any] = {}
    for sub in ("rtmlib", "insightface", "hsemotion"):
        p = os.path.join(models_dir, sub)
        status[sub] = _human(_dir_size(p)) if os.path.isdir(p) else "missing"
    fl = os.path.join(models_dir, "face_landmarker.task")
    status["face_landmarker.task"] = (
        _human(os.path.getsize(fl)) if os.path.exists(fl) else "missing")
    return status


def ensure_models(cfg: Config) -> dict[str, Any]:
    """Download whatever is missing; safe to call on every startup."""
    os.makedirs(cfg.models_dir, exist_ok=True)
    results: dict[str, Any] = {}
    status = models_status(cfg.models_dir)
    print(f"[models] dir={cfg.models_dir} status={status}", flush=True)

    modes = set(RTMLIB_MODES)
    if cfg.pose_mode in ("performance", "balanced", "lightweight"):
        modes.add(cfg.pose_mode)
    results.update(ensure_rtmlib(cfg.models_dir, tuple(sorted(modes))))

    results.update(ensure_insightface(cfg.models_dir, cfg.insightface_model))
    results.update(ensure_mediapipe(cfg.models_dir))
    results.update(ensure_hsemotion(cfg.models_dir, cfg.emotion_enabled))

    print(f"[models] done: {results}", flush=True)
    print(f"[models] status={models_status(cfg.models_dir)}", flush=True)
    return results


def main() -> int:
    cfg = Config.from_env()
    ensure_models(cfg)
    return 0


if __name__ == "__main__":
    sys.exit(main())
