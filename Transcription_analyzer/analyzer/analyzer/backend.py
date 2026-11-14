"""LLM backends — the edge/cloud split lives here and nowhere else.

- `LlamaCppBackend`  : GGUF loaded in-process on the Jetson. `load()`/`unload()`
  bracket the nightly batch so the ~6 GB of unified memory is only held while
  analyzing — the vision app gets it back when we are done.
- `OpenAIBackend`    : any OpenAI-compatible endpoint (vLLM, NIM, llama-server,
  or a hosted cloud deployment). `load()`/`unload()` are no-ops; this is the
  "cloud version" of the service — same analyzer code, different config.

Both implement `complete_json(messages) -> str` returning raw JSON text;
schema enforcement is delegated to the engine (grammar / response_format)
and re-validated by scoring.parse_score regardless.
"""
from __future__ import annotations

import gc
import logging
from typing import Any, Protocol

import httpx

from .config import ModelCfg
from .scoring import SCORE_SCHEMA

logger = logging.getLogger(__name__)


class Backend(Protocol):
    name: str

    def load(self) -> None: ...
    def unload(self) -> None: ...
    def complete_json(self, messages: list[dict[str, str]]) -> str: ...


class LlamaCppBackend:
    name = "llamacpp"

    def __init__(self, cfg: ModelCfg):
        self.cfg = cfg
        self._llm: Any = None

    def load(self) -> None:
        if self._llm is not None:
            return
        from llama_cpp import Llama  # imported lazily: only needed on-device
        logger.info("loading GGUF %s (ctx=%d, gpu_layers=%d)",
                    self.cfg.path, self.cfg.n_ctx, self.cfg.n_gpu_layers)
        self._llm = Llama(model_path=self.cfg.path,
                          n_ctx=self.cfg.n_ctx,
                          n_gpu_layers=self.cfg.n_gpu_layers,
                          verbose=False)

    def unload(self) -> None:
        self._llm = None
        gc.collect()   # releases the context + weights back to the OS/driver

    def complete_json(self, messages: list[dict[str, str]]) -> str:
        if self._llm is None:
            raise RuntimeError("backend not loaded — call load() first")
        out = self._llm.create_chat_completion(
            messages=messages,
            response_format={"type": "json_object", "schema": SCORE_SCHEMA},
            temperature=self.cfg.temperature,
            max_tokens=self.cfg.max_tokens,
        )
        return out["choices"][0]["message"]["content"]


class OpenAIBackend:
    name = "openai"

    def __init__(self, cfg: ModelCfg):
        self.cfg = cfg
        self._client = httpx.Client(
            base_url=cfg.base_url.rstrip("/"),
            headers={"Authorization": f"Bearer {cfg.api_key}"} if cfg.api_key else {},
            timeout=httpx.Timeout(300.0, connect=10.0),
        )

    def load(self) -> None:   # model lives on the server — nothing to do
        pass

    def unload(self) -> None:
        pass

    def complete_json(self, messages: list[dict[str, str]]) -> str:
        r = self._client.post("/chat/completions", json={
            "model": self.cfg.name,
            "messages": messages,
            "temperature": self.cfg.temperature,
            "max_tokens": self.cfg.max_tokens,
            "response_format": {
                "type": "json_schema",
                "json_schema": {"name": "window_score",
                                "schema": SCORE_SCHEMA,
                                "strict": True},
            },
        })
        r.raise_for_status()
        return r.json()["choices"][0]["message"]["content"]


class MockBackend:
    """Deterministic backend for tests and dry-runs — no model required."""

    name = "mock"

    def __init__(self, scores: dict[str, int] | None = None):
        s = scores or {}
        self._scores = {d: s.get(d, 50) for d in
                        ("responsiveness", "engagement", "fluency", "coherence")}
        self.loaded = False
        self.calls = 0

    def load(self) -> None:
        self.loaded = True

    def unload(self) -> None:
        self.loaded = False

    def complete_json(self, messages: list[dict[str, str]]) -> str:
        import json
        self.calls += 1
        return json.dumps({
            **{d: {"score": self._scores[d], "confidence": 0.5,
                   "evidence": ["mock"]} for d in self._scores},
            "drift_flag": False,
            "notes": "mock backend",
        })


def make_backend(cfg: ModelCfg) -> Backend:
    if cfg.backend == "llamacpp":
        return LlamaCppBackend(cfg)
    if cfg.backend == "openai":
        return OpenAIBackend(cfg)
    if cfg.backend == "mock":
        return MockBackend()
    raise ValueError(f"unknown backend {cfg.backend!r} (llamacpp|openai|mock)")
