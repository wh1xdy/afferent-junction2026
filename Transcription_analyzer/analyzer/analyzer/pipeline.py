"""Batch pipeline: transcripts dir -> windows -> metrics -> LLM scores -> store.

The `Runner` brackets every batch with backend.load()/unload() so the model
weights are only resident while analyzing — the point of the on-demand design.
"""
from __future__ import annotations

import json
import logging
import threading
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable

import httpx

from . import metrics, scoring, transcript
from .backend import Backend, make_backend
from .config import Config
from .dm_sink import DataManagerSink
from .inbox import claim, settle
from .store import Store

logger = logging.getLogger(__name__)


def _probe_exclusive_status(url: str) -> int | None:
    try:
        return httpx.get(url, timeout=3.0).status_code
    except Exception:
        return None


class BatchInterrupted(RuntimeError):
    pass


@dataclass
class BatchResult:
    files: int = 0
    windows_scored: int = 0
    windows_skipped: int = 0
    errors: int = 0
    file_errors: dict[str, int] = field(default_factory=dict)
    days: list[str] = field(default_factory=list)
    seconds: float = 0.0

    def as_dict(self) -> dict:
        return {"files": self.files, "windows_scored": self.windows_scored,
                "windows_skipped": self.windows_skipped, "errors": self.errors,
                "file_errors": self.file_errors, "days": self.days,
                "seconds": round(self.seconds, 1)}


def run_batch(cfg: Config, backend: Backend, store: Store,
              rescore: bool = False,
              sink: DataManagerSink | None = None,
              paths: list[Path] | None = None,
              should_stop: Callable[[], str | None] | None = None
              ) -> BatchResult:
    """Score every unprocessed transcript window under cfg.transcripts_dir."""
    result = BatchResult()
    t0 = time.monotonic()
    touched: set[tuple[str, str]] = set()   # (persona_id, day) pairs

    batch_paths = (sorted(Path(cfg.transcripts_dir).rglob("*.jsonl"))
                   if paths is None else sorted(Path(path) for path in paths))
    for path in batch_paths:
        result.files += 1
        try:
            records = transcript.load_jsonl(
                path, cfg.target_speaker, strict=paths is not None)
        except Exception:
            logger.exception("cannot parse %s — skipping", path)
            result.errors += 1
            result.file_errors[str(path)] = (
                result.file_errors.get(str(path), 0) + 1)
            continue
        for rec in records:
            for win in transcript.expand_windows(
                    rec, cfg.max_window_turns, cfg.window_overlap,
                    cfg.window_max_chars):
                if should_stop is not None:
                    reason = should_stop()
                    if reason:
                        raise BatchInterrupted(reason)
                if not rescore and store.has_window(win.record_id, win.seq):
                    result.windows_skipped += 1
                    continue
                try:
                    m = metrics.extract(win, cfg.target_speaker)
                    s = scoring.score_window(
                        backend, win, m,
                        target=cfg.target_speaker,
                        retries=cfg.score_retries)
                except Exception:
                    logger.exception("scoring failed for %s seq=%d",
                                     win.record_id, win.seq)
                    result.errors += 1
                    result.file_errors[str(path)] = (
                        result.file_errors.get(str(path), 0) + 1)
                    continue
                store.record_window(
                    record_id=win.record_id, seq=win.seq,
                    source=path.name, persona_id=win.persona_id,
                    day=win.day, trajectory=win.trajectory,
                    n_turns=win.n_turns, metrics=m, scores=s)
                if sink:
                    sink.push_window(win, s)
                result.windows_scored += 1
                touched.add((win.persona_id, win.day))

    for persona, day in sorted(touched):
        store.aggregate_day(persona, day)
        if sink:
            sink.push_day(
                store.drift_index(day, persona, cfg.baseline_days), persona)
    result.days = sorted({d for _, d in touched})
    result.seconds = time.monotonic() - t0
    return result


class Runner:
    """Serializes batch runs and brackets them with model load/unload."""

    def __init__(self, cfg: Config, backend: Backend | None = None,
                 fetcher=None):
        self.cfg = cfg
        self.backend = backend or make_backend(cfg.model)
        self.fetcher = fetcher
        self._lock = threading.Lock()
        self.last_result: dict | None = None
        self.last_run_at: str | None = None
        self.last_error: str | None = None
        self.last_dm_status: dict | None = None
        self._exclusive_probe_lock = threading.Lock()
        self._exclusive_probe_at = float("-inf")
        self._exclusive_probe_result: str | None = None
        enabled = bool(cfg.hub_transcripts_dir)
        self._inbox_lock = threading.Lock()
        self._inbox = {
            "enabled": enabled,
            "state": "waiting" if enabled else "disabled",
            "detail": "waiting for preflight" if enabled else "",
            "claimed": 0,
            "deleted": 0,
            "failed": 0,
            "finished_at": None,
        }

    @property
    def running(self) -> bool:
        return self._lock.locked()

    @staticmethod
    def _mem_available_gb() -> float | None:
        try:
            for line in Path("/proc/meminfo").read_text().splitlines():
                if line.startswith("MemAvailable:"):
                    return int(line.split()[1]) / (1024 * 1024)
        except (OSError, ValueError, IndexError):
            return None
        return None

    def preflight(self) -> str | None:
        if self.fetcher is not None and not self.fetcher.ready:
            state = self.fetcher.status()["state"]
            return f"model not ready: {state}"
        reason = self._exclusive_reason(force=True)
        if reason:
            return reason
        minimum = self.cfg.model.min_free_gb
        if minimum > 0:
            available = self._mem_available_gb()
            if available is not None and available < minimum:
                return (f"only {available:.1f} GB free, need {minimum:g} "
                        "— stop afferent-posture first")
        return None

    def _exclusive_reason(self, force: bool = False) -> str | None:
        if not self.cfg.exclusive_probe_urls:
            return None
        with self._exclusive_probe_lock:
            now = time.monotonic()
            if not force and now - self._exclusive_probe_at < 10.0:
                return self._exclusive_probe_result
            reason = None
            for url in self.cfg.exclusive_probe_urls:
                status = _probe_exclusive_status(url)
                if status is not None and status < 500:
                    reason = (
                        f"afferent-posture is running ({url}) — switch with "
                        "the posture controller")
                    break
            self._exclusive_probe_at = now
            self._exclusive_probe_result = reason
            return reason

    def _should_stop(self) -> str | None:
        return self._exclusive_reason()

    def run_batch_locked(self, rescore: bool = False,
                         paths: list[Path] | None = None) -> dict:
        if not self._lock.acquire(blocking=False):
            raise RuntimeError("a batch is already running")
        try:
            reason = self.preflight()
            if reason:
                raise RuntimeError(reason)
            self.backend.load()
            try:
                with Store(self.cfg.db_path) as store, \
                        DataManagerSink(self.cfg) as sink:
                    result = run_batch(self.cfg, self.backend, store,
                                       rescore, sink=sink, paths=paths,
                                       should_stop=self._should_stop)
                    store.set_meta("last_run_at",
                                   time.strftime("%Y-%m-%dT%H:%M:%S"))
                    store.set_meta("last_result",
                                   json.dumps(result.as_dict()))
                self.last_dm_status = sink.status()
            finally:
                self.backend.unload()
            self.last_result = result.as_dict()
            self.last_run_at = time.strftime("%Y-%m-%dT%H:%M:%S")
            self.last_error = None
            return self.last_result
        except Exception as e:
            self.last_error = str(e)
            raise
        finally:
            self._lock.release()

    def _set_inbox(self, **values) -> None:
        with self._inbox_lock:
            self._inbox.update(values)

    @staticmethod
    def _inbox_time() -> str:
        return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

    def consume_inbox(self) -> None:
        if not self.cfg.hub_transcripts_dir:
            return

        while True:
            reason = self.preflight()
            if reason:
                self._set_inbox(state="waiting", detail=reason)
                time.sleep(max(0.0, self.cfg.inbox_retry_s))
                continue
            if self.running:
                self._set_inbox(state="waiting",
                                detail="another batch is running")
                time.sleep(max(0.0, self.cfg.inbox_retry_s))
                continue

            try:
                paths = claim(self.cfg.hub_transcripts_dir)
                if not paths:
                    self._set_inbox(
                        state="done", detail="no transcript files",
                        claimed=0, deleted=0, failed=0,
                        finished_at=self._inbox_time())
                    return
                self._set_inbox(
                    state="running", detail=f"processing {len(paths)} file(s)",
                    claimed=len(paths), deleted=0, failed=0,
                    finished_at=None)
                time.sleep(max(0.0, self.cfg.inbox_settle_s))

                while True:
                    reason = self.preflight()
                    if reason:
                        self._set_inbox(state="waiting", detail=reason)
                        time.sleep(max(0.0, self.cfg.inbox_retry_s))
                        continue
                    self._set_inbox(
                        state="running", detail=f"processing {len(paths)} file(s)")
                    try:
                        result = self.run_batch_locked(paths=paths)
                        break
                    except BatchInterrupted as exc:
                        self._set_inbox(state="waiting", detail=str(exc))
                        time.sleep(max(0.0, self.cfg.inbox_retry_s))
                        continue
                    except RuntimeError as exc:
                        if str(exc) == "a batch is already running":
                            self._set_inbox(
                                state="waiting",
                                detail="another batch is running")
                            time.sleep(max(0.0, self.cfg.inbox_retry_s))
                            continue
                        reason = self.preflight()
                        if reason:
                            self._set_inbox(state="waiting", detail=reason)
                            time.sleep(max(0.0, self.cfg.inbox_retry_s))
                            continue
                        raise

                counts = settle(paths, result.get("file_errors", {}))
                self._set_inbox(
                    state="done", detail="inbox batch finished",
                    deleted=counts["deleted"], failed=counts["failed"],
                    finished_at=self._inbox_time())
                return
            except Exception as exc:
                logger.exception("hub inbox processing failed")
                self._set_inbox(state="error", detail=str(exc),
                                finished_at=self._inbox_time())
                return

    def _inbox_status(self) -> dict:
        with self._inbox_lock:
            return dict(self._inbox)

    def status(self) -> dict:
        return {
            "running": self.running,
            "backend": self.backend.name,
            "last_run_at": self.last_run_at,
            "last_result": self.last_result,
            "last_error": self.last_error,
            "data_manager": self.last_dm_status,
            "inbox": self._inbox_status(),
            "model": (self.fetcher.status() if self.fetcher is not None
                      else {"state": "ready"}),
        }
