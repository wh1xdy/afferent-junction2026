"""Runtime configuration.

Resolution order (later wins): dataclass defaults -> YAML file -> ANALYZER_*
environment variables. The YAML file is optional; env alone is fine inside a
container.
"""
from __future__ import annotations

import os
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

try:
    import yaml
except ImportError:  # YAML config is optional
    yaml = None  # type: ignore


@dataclass
class ModelCfg:
    backend: str = "llamacpp"          # llamacpp | openai
    # llamacpp backend
    path: str = "/data/models/model.gguf"
    n_ctx: int = 8192
    n_gpu_layers: int = -1             # -1 = offload everything that fits
    # openai backend (cloud version / llama.cpp server / NIM / vLLM)
    base_url: str = "http://127.0.0.1:8080/v1"
    api_key: str = ""
    name: str = "analyzer-model"
    # shared generation params
    temperature: float = 0.2
    max_tokens: int = 800


@dataclass
class ScheduleCfg:
    # "HH:MM-HH:MM" local time; wraps midnight. Empty string disables the
    # nightly loop entirely (API-triggered runs only).
    window: str = "02:00-06:00"
    # HTTP endpoints probed before a scheduled run: if ANY is reachable and
    # reports active, the run defers to the next window. The vision app is the
    # expected entry; it is unreachable at night only if it is stopped.
    vision_probe_urls: list[str] = field(default_factory=list)
    once_per_day: bool = True
    poll_seconds: int = 60


@dataclass
class DataManagerCfg:
    # afferent-data-manager (jetson/data_manager). Empty url = env
    # DATA_MANAGER_URL or mDNS discovery (role=data-manager); "off" disables.
    url: str = ""
    token: str = ""                  # empty = env DATA_MANAGER_TOKEN
    source: str = "transcription-analyzer"
    register_metrics: bool = True


@dataclass
class Config:
    transcripts_dir: Path = Path("/data/transcripts")
    db_path: Path = Path("/data/analyzer.db")
    host: str = "127.0.0.1"
    port: int = 3080
    target_speaker: str = "target"     # speaker label of the tracked person
    max_window_turns: int = 120
    window_overlap: int = 20
    baseline_days: int = 28
    score_retries: int = 1
    model: ModelCfg = field(default_factory=ModelCfg)
    schedule: ScheduleCfg = field(default_factory=ScheduleCfg)
    data_manager: DataManagerCfg = field(default_factory=DataManagerCfg)


_ENV_MAP: dict[str, tuple[str, str]] = {
    "ANALYZER_TRANSCRIPTS_DIR": ("", "transcripts_dir"),
    "ANALYZER_DB_PATH": ("", "db_path"),
    "ANALYZER_HOST": ("", "host"),
    "ANALYZER_PORT": ("", "port"),
    "ANALYZER_TARGET_SPEAKER": ("", "target_speaker"),
    "ANALYZER_MODEL_BACKEND": ("model", "backend"),
    "ANALYZER_MODEL_PATH": ("model", "path"),
    "ANALYZER_MODEL_CTX": ("model", "n_ctx"),
    "ANALYZER_GPU_LAYERS": ("model", "n_gpu_layers"),
    "ANALYZER_BASE_URL": ("model", "base_url"),
    "ANALYZER_API_KEY": ("model", "api_key"),
    "ANALYZER_MODEL_NAME": ("model", "name"),
    "ANALYZER_SCHEDULE_WINDOW": ("schedule", "window"),
    "ANALYZER_VISION_PROBES": ("schedule", "vision_probe_urls"),
    "ANALYZER_DM_URL": ("data_manager", "url"),
    "ANALYZER_DM_TOKEN": ("data_manager", "token"),
    "ANALYZER_DM_SOURCE": ("data_manager", "source"),
}


def _coerce(current: Any, raw: str) -> Any:
    if isinstance(current, bool):
        return raw.strip().lower() in ("1", "true", "yes")
    if isinstance(current, int):
        return int(raw)
    if isinstance(current, float):
        return float(raw)
    if isinstance(current, Path):
        return Path(raw)
    if isinstance(current, list):
        return [s for s in raw.split(",") if s.strip()]
    return raw


def _merge(obj: Any, values: dict[str, Any]) -> None:
    for k, v in values.items():
        if not hasattr(obj, k):
            print(f"config: ignoring unknown key {k!r}", file=sys.stderr)
            continue
        cur = getattr(obj, k)
        if hasattr(cur, "__dataclass_fields__"):
            _merge(cur, v)
        else:
            setattr(obj, k, _coerce(cur, v) if not isinstance(v, type(cur)) else v)


def load(path: str | Path | None = None) -> Config:
    cfg = Config()
    if path:
        if yaml is None:
            raise RuntimeError("pyyaml not installed but a YAML config was given")
        data = yaml.safe_load(Path(path).read_text()) or {}
        for k, v in data.items():
            if hasattr(cfg, k) and hasattr(getattr(cfg, k), "__dataclass_fields__"):
                _merge(getattr(cfg, k), v)
            elif hasattr(cfg, k):
                setattr(cfg, k, _coerce(getattr(cfg, k), v) if isinstance(v, str) else v)
            else:
                print(f"config: ignoring unknown key {k!r}", file=sys.stderr)
    for env, (section, key) in _ENV_MAP.items():
        raw = os.environ.get(env)
        if raw is None:
            continue
        obj = getattr(cfg, section) if section else cfg
        setattr(obj, key, _coerce(getattr(obj, key), raw))
    return cfg
