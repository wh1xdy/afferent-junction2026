"""Model artifact readiness and optional background fetching."""
from __future__ import annotations

import os
import threading
import time
from pathlib import Path
from typing import Any

from .config import ModelCfg


class ModelFetcher:
    def __init__(self, cfg: ModelCfg):
        self.cfg = cfg
        self.path = Path(cfg.path)
        self._lock = threading.Lock()
        self._state = "ready" if self.ready else "missing"
        self._bytes_done = 0
        self._bytes_total: int | None = None
        if self._state == "ready":
            self._bytes_done = self.path.stat().st_size
            self._bytes_total = self._bytes_done
        self._error: str | None = None
        self._thread: threading.Thread | None = None

    @property
    def ready(self) -> bool:
        return (self.path.is_file()
                and (not self.cfg.lora_path
                     or Path(self.cfg.lora_path).is_file()))

    def status(self) -> dict[str, Any]:
        with self._lock:
            state = "ready" if self.ready else self._state
            return {
                "state": state,
                "path": str(self.path),
                "bytes_done": self._bytes_done,
                "bytes_total": self._bytes_total,
                "error": self._error,
            }

    def fetch(self) -> bool:
        """Start a single background download; return False if already active."""
        with self._lock:
            if self._state == "downloading":
                return False
            if self.ready:
                self._state = "ready"
                return True
            self._state = "downloading"
            self._bytes_done = 0
            self._bytes_total = None
            self._error = None
            self._thread = threading.Thread(target=self._download, daemon=True)
            self._thread.start()
            threading.Thread(target=self._monitor_progress, daemon=True).start()
            return True

    def _download(self) -> None:
        destination = self.path
        local_dir = destination.parent
        try:
            local_dir.mkdir(parents=True, exist_ok=True)
            from huggingface_hub import hf_hub_download

            result: str | Path = hf_hub_download(
                repo_id=self.cfg.hf_repo,
                filename=self.cfg.hf_file,
                local_dir=str(local_dir),
            )
            downloaded = Path(result)
            if downloaded != destination:
                os.replace(downloaded, destination)
            if not self.ready:
                raise RuntimeError(
                    f"model download finished but adapter is missing: "
                    f"{self.cfg.lora_path}")
            with self._lock:
                self._bytes_done = destination.stat().st_size
                self._bytes_total = self._bytes_done
                self._state = "ready"
        except Exception as exc:
            with self._lock:
                self._state = "error"
                self._error = str(exc)
        finally:
            with self._lock:
                self._thread = None

    def update_progress(self) -> None:
        """Refresh best-effort progress from Hugging Face partial downloads."""
        incomplete = list(self.path.parent.rglob("*.incomplete"))
        try:
            done = sum(p.stat().st_size for p in incomplete)
        except OSError:
            done = 0
        with self._lock:
            if self._state == "downloading":
                self._bytes_done = done

    def _monitor_progress(self) -> None:
        while True:
            with self._lock:
                thread = self._thread
            if thread is None:
                return
            self.update_progress()
            time.sleep(0.5)
