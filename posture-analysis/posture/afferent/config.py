"""Runtime configuration, read once from the environment."""
from __future__ import annotations

import os
from dataclasses import dataclass, field


def _env(name: str, default: str) -> str:
    v = os.environ.get(name)
    return v if v not in (None, "") else default


def _env_int(name: str, default: int) -> int:
    try:
        return int(_env(name, str(default)))
    except ValueError:
        return default


def _env_float(name: str, default: float) -> float:
    try:
        return float(_env(name, str(default)))
    except ValueError:
        return default


def _env_bool(name: str, default: bool) -> bool:
    v = _env(name, "1" if default else "0").strip().lower()
    return v in ("1", "true", "yes", "on")


@dataclass
class Config:
    # Capture
    camera: str = "0"               # index, /dev/videoN path, or video file
    width: int = 1920
    height: int = 1080
    fps: int = 30                   # requested camera fps
    continuous_fps: float = 10.0    # pose rate, normal operation
    burst_fps: float = 30.0         # pose rate while walking / session active

    # Inference
    device: str = "cpu"             # cpu | cuda
    pose_mode: str = ""             # rtmlib mode; "" -> lightweight on cpu,
                                    # balanced on cuda (see from_env)
    pose_model_path: str = ""       # custom pose ONNX (POSE_MODEL_PATH)
    det_every: int = 0              # detector skip interval; 0 -> auto
    models_dir: str = "/models"
    insightface_model: str = "buffalo_l"   # buffalo_l | buffalo_s
    face_detect_every: int = 3      # run face detection every N processed frames
    face_every: int = 1             # MediaPipe landmarker every N processed frames
    emotion_enabled: bool = True
    emotion_every: int = 10         # HSEmotion cadence on target crop

    # Identity
    face_match_threshold: float = 0.45    # cosine similarity
    lost_after_s: float = 3.0
    mismatch_unlock_s: float = 5.0  # cumulative wrong-face time -> de-lock
    face_max_age_s: float = 0.5     # drop face obs older than this
    enroll_min: int = 10
    enroll_max: int = 20
    enroll_dedupe_cosine: float = 0.985   # reject near-duplicate embeddings
    gallery_adapt: bool = True            # allow type='adaptative' updates

    # Gait
    gait_min_fps: float = 8.0       # below -> episode flagged undersampled

    # Aggregation
    db_path: str = "/data/afferent.db"
    site: str = "default"           # room/site id: per-site calibration + rows
    min_valid_frames: int = 30      # per minute row
    recordings_dir: str = "/recordings"
    recording_enabled: bool = False
    # Optional push of minute aggregates to afferent-data-manager ("" = off)
    data_manager_url: str = ""
    data_manager_token: str = ""

    # Filtering
    one_euro_min_cutoff: float = 1.0
    one_euro_beta: float = 0.5
    kpt_conf_threshold: float = 0.3

    # Version tags written on every DB row
    extractor_version: str = field(default="afferent-0.1.0")
    model_version: str = field(default="rtmlib-halpe26+buffalo+mp-face-landmarker+hsemotion")

    @classmethod
    def from_env(cls) -> "Config":
        device = _env("DEVICE", "cpu")
        # pose mode: explicit POSE_MODE wins; otherwise lightweight on CPU
        # (measured ~4 fps vs ~1.1 fps balanced at 1080p) and balanced on GPU.
        pose_mode = _env("POSE_MODE", "") or (
            "balanced" if device == "cuda" else "lightweight")
        det_every = _env_int("DET_EVERY", 0) or (1 if device == "cuda" else 5)
        pose_model_path = _env("POSE_MODEL_PATH", "")
        model_version = (
            f"rtmlib-{pose_mode}-halpe26+buffalo+mp-face-landmarker+hsemotion")
        if pose_model_path:
            model_version += f"+pose:{os.path.basename(pose_model_path)}"
        return cls(
            camera=_env("CAMERA", "0"),
            width=_env_int("WIDTH", 1920),
            height=_env_int("HEIGHT", 1080),
            fps=_env_int("FPS", 30),
            continuous_fps=_env_float("CONTINUOUS_FPS", 10.0),
            burst_fps=_env_float("BURST_FPS", 30.0),
            device=device,
            pose_mode=pose_mode,
            pose_model_path=pose_model_path,
            det_every=det_every,
            models_dir=_env("MODELS_DIR", "/models"),
            insightface_model=_env("INSIGHTFACE_MODEL", "buffalo_l"),
            face_detect_every=_env_int("FACE_DETECT_EVERY", 3),
            face_every=_env_int("FACE_EVERY", 1),
            emotion_enabled=_env_bool("EMOTION_ENABLED", True),
            emotion_every=_env_int("EMOTION_EVERY", 10),
            face_match_threshold=_env_float("FACE_MATCH_THRESHOLD", 0.45),
            lost_after_s=_env_float("LOST_AFTER_S", 3.0),
            mismatch_unlock_s=_env_float("MISMATCH_UNLOCK_S", 5.0),
            face_max_age_s=_env_float("FACE_MAX_AGE_S", 0.5),
            gait_min_fps=_env_float("GAIT_MIN_FPS", 8.0),
            enroll_min=_env_int("ENROLL_MIN", 10),
            enroll_max=_env_int("ENROLL_MAX", 20),
            enroll_dedupe_cosine=_env_float("ENROLL_DEDUPE_COSINE", 0.985),
            gallery_adapt=_env_bool("GALLERY_ADAPT", True),
            db_path=_env("DB_PATH", "/data/afferent.db"),
            site=_env("SITE", "default"),
            min_valid_frames=_env_int("MIN_VALID_FRAMES", 30),
            recordings_dir=_env("RECORDINGS_DIR", "/recordings"),
            recording_enabled=_env_bool("RECORDING_ENABLED", False),
            data_manager_url=_env("DATA_MANAGER_URL", ""),
            data_manager_token=_env("DATA_MANAGER_TOKEN", ""),
            one_euro_min_cutoff=_env_float("ONE_EURO_MIN_CUTOFF", 1.0),
            one_euro_beta=_env_float("ONE_EURO_BETA", 0.5),
            kpt_conf_threshold=_env_float("KPT_CONF_THRESHOLD", 0.3),
            model_version=model_version,
        )
