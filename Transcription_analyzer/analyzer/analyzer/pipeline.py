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

from . import metrics, scoring, transcript
from .backend import Backend, make_backend
from .config import Config
from .dm_sink import DataManagerSink
from .store import Store

logger = logging.getLogger(__name__)


@dataclass
class BatchResult:
    files: int = 0
    windows_scored: int = 0
    windows_skipped: int = 0
    errors: int = 0
    days: list[str] = field(default_factory=list)
    seconds: float = 0.0

    def as_dict(self) -> dict:
        return {"files": self.files, "windows_scored": self.windows_scored,
                "windows_skipped": self.windows_skipped, "errors": self.errors,
                "days": self.days, "seconds": round(self.seconds, 1)}


def run_batch(cfg: Config, backend: Backend, store: Store,
              rescore: bool = False,
              sink: DataManagerSink | None = None) -> BatchResult:
    """Score every unprocessed transcript window under cfg.transcripts_dir."""
    result = BatchResult()
    t0 = time.monotonic()
    touched_days: set[str] = set()

    paths = sorted(Path(cfg.transcripts_dir).glob("*.jsonl"))
    for path in paths:
        result.files += 1
        try:
            records = transcript.load_jsonl(path, cfg.target_speaker)
        except Exception:
            logger.exception("cannot parse %s — skipping", path)
            result.errors += 1
            continue
        for rec in records:
            for win in transcript.expand_windows(
                    rec, cfg.max_window_turns, cfg.window_overlap):
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
                    continue
                store.record_window(
                    record_id=win.record_id, seq=win.seq,
                    source=path.name, persona_id=win.persona_id,
                    day=win.day, trajectory=win.trajectory,
                    n_turns=win.n_turns, metrics=m, scores=s)
                if sink:
                    sink.push_window(win, s)
                result.windows_scored += 1
                touched_days.add(win.day)

    for day in sorted(touched_days):
        store.aggregate_day(day)
        if sink:
            sink.push_day(store.drift_index(day, cfg.baseline_days))
    result.days = sorted(touched_days)
    result.seconds = time.monotonic() - t0
    return result


class Runner:
    """Serializes batch runs and brackets them with model load/unload."""

    def __init__(self, cfg: Config, backend: Backend | None = None):
        self.cfg = cfg
        self.backend = backend or make_backend(cfg.model)
        self._lock = threading.Lock()
        self.last_result: dict | None = None
        self.last_run_at: str | None = None
        self.last_error: str | None = None
        self.last_dm_status: dict | None = None

    @property
    def running(self) -> bool:
        return self._lock.locked()

    def run_batch_locked(self, rescore: bool = False) -> dict:
        if not self._lock.acquire(blocking=False):
            raise RuntimeError("a batch is already running")
        try:
            self.backend.load()
            try:
                with Store(self.cfg.db_path) as store, \
                        DataManagerSink(self.cfg) as sink:
                    result = run_batch(self.cfg, self.backend, store,
                                       rescore, sink=sink)
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

    def status(self) -> dict:
        return {
            "running": self.running,
            "backend": self.backend.name,
            "last_run_at": self.last_run_at,
            "last_result": self.last_result,
            "last_error": self.last_error,
            "data_manager": self.last_dm_status,
        }
