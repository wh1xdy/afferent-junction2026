"""Push analyzer scores to afferent-data-manager (jetson/data_manager).

The data manager is the house's shared store: it owns daily aggregates,
personal-baseline deviation (/baseline), trends and cross-signal
correlations. We push per-window speech scores so longitudinal questions
("is today unusual for this person?") and correlations against presence /
posture / vitals live next to the other signals — the whole point of the
central store.

What goes out per analyzed window (as `sample` metrics):
  speech.<dimension>_score   0-100, quality = contract confidence
  speech.drift_flag          0/1    window-level LLM flag
and per aggregated day:
  speech.drift_index         z-score of the day vs the person's baseline
                             (our composite; the manager keeps its own
                             /baseline machinery too — both are descriptors,
                             neither is a diagnosis)

Privacy: scores, flags and ids only. Evidence spans and transcript text
stay local — the shared store never sees verbatim speech.
"""
from __future__ import annotations

import json
import logging
import re
import urllib.request
import urllib.error

from .config import Config
from .data_manager_client import DataManagerClient
from .scoring import DIMENSIONS, WindowScore
from .transcript import Window

logger = logging.getLogger(__name__)

_SOURCE_RE = re.compile(r"^[A-Za-z0-9._/:-]{1,64}$")
_ISO_DAY_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")

# Catalog entries we register once per run (idempotent: re-posting a custom
# metric refreshes unit/range/description). Naming follows `group.name_unit`.
SPEECH_METRICS: dict[str, dict] = {
    **{f"speech.{d}_score": {
        "kind": "sample", "unit": "score", "min": 0, "max": 100,
        "description": f"Conversation {d} score, 0-100, per transcript window "
                       "(afferent-transcription-analyzer)"}
       for d in DIMENSIONS},
    "speech.drift_flag": {
        "kind": "sample", "unit": "bool", "min": 0, "max": 1,
        "description": "Window-level drift flag from the speech contract (0/1)"},
    "speech.drift_index": {
        "kind": "sample", "unit": "z", "min": None, "max": None,
        "description": "Daily composite z-score vs the person's own baseline; "
                       "negative = downward drift. Descriptor, not a diagnosis"},
}


def _source(source: str, persona_id: str) -> str:
    """One series per tracked person: `transcription-analyzer/<persona>`."""
    s = f"{source}/{persona_id or 'unknown'}"
    return s if _SOURCE_RE.match(s) else source


def _day_ts(day: str) -> str | None:
    """Noon UTC of an ISO day; synthetic int days fall back to receipt time."""
    return f"{day}T12:00:00Z" if _ISO_DAY_RE.match(str(day)) else None


class DataManagerSink:
    """Per-run sink: constructed inside the batch bracket, closed at the end
    (close() flushes). Disabled cleanly when url="off" or discovery fails —
    the analyzer keeps working regardless."""

    def __init__(self, cfg: Config):
        dmc = cfg.data_manager
        self.client = DataManagerClient(
            source=dmc.source,
            url=dmc.url or None,
            token=dmc.token or None)
        self.register = dmc.register_metrics
        self._source = dmc.source

    def __enter__(self) -> "DataManagerSink":
        if self.register and self.client.enabled:
            self._register_metrics()
        return self

    def __exit__(self, *exc) -> bool:
        self.close()
        return False

    def _register_metrics(self) -> None:
        deadline_ok = self._wait_url()
        if not deadline_ok:
            logger.warning("data manager: no URL — skipping metric registration")
            return
        for name, spec in SPEECH_METRICS.items():
            body = {"name": name, **{k: v for k, v in spec.items()
                                     if v is not None or k == "kind"}}
            try:
                self._post("/api/v1/metrics", body)
            except Exception as e:
                logger.warning("data manager: register %s failed: %s", name, e)

    def _wait_url(self, seconds: float = 5.0) -> bool:
        import time
        if not self.client.url and getattr(self.client, "_zc", None) is None:
            return False            # no URL and no discovery running — nothing to wait for
        end = time.time() + seconds
        while not self.client.url and time.time() < end:
            time.sleep(0.2)
        return bool(self.client.url)

    def _post(self, path: str, body: dict) -> dict:
        req = urllib.request.Request(
            self.client.url + path, method="POST",
            data=json.dumps(body).encode(),
            headers={"Content-Type": "application/json"})
        if self.client.token:
            req.add_header("Authorization", f"Bearer {self.client.token}")
        with urllib.request.urlopen(req, timeout=self.client.timeout_s) as r:
            return json.loads(r.read().decode())

    # --------------------------------------------------------------- pushes
    def push_window(self, win: Window, scores: WindowScore) -> None:
        """One sample per dimension (quality = confidence) + drift_flag.
        ts = noon of the window's day when it is a real ISO date; synthetic
        int-day corpora stamp at receipt time — fine, they're dev data."""
        if not self.client.enabled:
            return
        src = _source(self._source, win.persona_id)
        ts = _day_ts(win.day)
        meta = {"record_id": win.record_id, "seq": win.seq,
                "drift_flag": scores.drift_flag}
        for d in DIMENSIONS:
            dim = getattr(scores, d)
            self.client.sample(f"speech.{d}_score", dim.score, ts=ts,
                               quality=dim.confidence, meta=meta, source=src)
        self.client.sample("speech.drift_flag", 1.0 if scores.drift_flag else 0.0,
                           ts=ts, meta=meta, source=src)

    def push_day(self, index: dict | None) -> None:
        """The daily composite z-score (our drift index) once aggregate_day ran.
        Skipped while baseline is insufficient (composite_z=None) — the
        manager's own /baseline answers 'unusual day' from raw scores anyway."""
        if not self.client.enabled or not index:
            return
        if index.get("composite_z") is None:
            return
        src = self._source  # day rows are already per-persona in our corpus
        meta = {"day": index["day"], "warning": index.get("warning"),
                "baseline_days": index.get("baseline_days")}
        self.client.sample("speech.drift_index", index["composite_z"],
                           ts=_day_ts(index["day"]), meta=meta, source=src)

    def status(self) -> dict:
        return self.client.status()

    def close(self) -> None:
        try:
            self.client.close()
        except Exception:
            logger.exception("data manager client close failed")
