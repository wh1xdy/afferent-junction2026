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
import json
import logging
import subprocess
import threading
import time
from collections import deque
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
        from llama_cpp import LlamaGrammar
        grammar = LlamaGrammar.from_json_schema(json.dumps(SCORE_SCHEMA))
        out = self._llm.create_completion(
            prompt=render_qwen3(messages),
            grammar=grammar,
            temperature=self.cfg.temperature,
            max_tokens=self.cfg.max_tokens,
            stop=["<|im_end|>"],
        )
        return out["choices"][0]["text"]


def render_qwen3(messages: list[dict[str, str]]) -> str:
    """Render the training chat template, including its empty final think block."""
    prompt = "".join(
        f"<|im_start|>{message['role']}\n{message['content']}<|im_end|>\n"
        for message in messages)
    # This reproduces the Qwen3 chat template used for training: an empty
    # think block precedes the final assistant response.
    return prompt + "<|im_start|>assistant\n<think>\n\n</think>\n\n"


class LlamaServerBackend:
    name = "llamaserver"

    def __init__(self, cfg: ModelCfg):
        self.cfg = cfg
        self._process: subprocess.Popen | None = None
        self._stderr: deque[str] = deque(maxlen=40)
        self._stderr_thread: threading.Thread | None = None

    def command(self) -> list[str]:
        cmd = [
            self.cfg.server_bin, "-m", self.cfg.path,
        ]
        if self.cfg.lora_path:
            cmd.extend(["--lora", self.cfg.lora_path])
        cmd.extend([
            "-c", str(self.cfg.n_ctx),
            "-ngl", "99" if self.cfg.n_gpu_layers < 0
            else str(self.cfg.n_gpu_layers),
            "--host", "127.0.0.1",
            "--port", str(self.cfg.server_port),
            *self.cfg.server_args,
        ])
        return cmd

    def _read_stderr(self, stream) -> None:
        try:
            for line in iter(stream.readline, ""):
                line = line.rstrip()
                self._stderr.append(line)
                if "lora" in line.lower():
                    logger.info("llama-server: %s", line)
        finally:
            stream.close()

    def _stop_process(self) -> None:
        process = self._process
        self._process = None
        if process is None or process.poll() is not None:
            return
        process.terminate()
        try:
            process.wait(timeout=20)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait()

    def load(self) -> None:
        if self._process is not None and self._process.poll() is None:
            return
        self._stderr.clear()
        try:
            self._process = subprocess.Popen(
                self.command(), stdout=subprocess.DEVNULL,
                stderr=subprocess.PIPE, text=True, bufsize=1)
        except Exception as exc:
            raise RuntimeError(f"could not start llama-server: {exc}") from exc
        self._stderr_thread = threading.Thread(
            target=self._read_stderr, args=(self._process.stderr,),
            daemon=True)
        self._stderr_thread.start()
        health_url = f"http://127.0.0.1:{self.cfg.server_port}/health"
        deadline = time.monotonic() + self.cfg.startup_timeout_s
        last_error = "health check timed out"
        while time.monotonic() < deadline:
            if self._process.poll() is not None:
                last_error = f"llama-server exited with code {self._process.returncode}"
                break
            try:
                response = httpx.get(health_url, timeout=2.0)
                if response.status_code == 200:
                    return
                last_error = f"health returned HTTP {response.status_code}"
            except Exception as exc:
                last_error = str(exc)
            time.sleep(1)
        self._stop_process()
        if self._stderr_thread is not None:
            self._stderr_thread.join(timeout=2)
        stderr = "\n".join(self._stderr)
        detail = f"; stderr: {stderr}" if stderr else ""
        raise RuntimeError(f"llama-server startup failed: {last_error}{detail}")

    def unload(self) -> None:
        self._stop_process()

    def complete_json(self, messages: list[dict[str, str]]) -> str:
        response = httpx.post(
            f"http://127.0.0.1:{self.cfg.server_port}/completion",
            json={
                "prompt": render_qwen3(messages),
                "json_schema": SCORE_SCHEMA,
                "temperature": self.cfg.temperature,
                "n_predict": self.cfg.max_tokens,
                "stop": ["<|im_end|>"],
                "cache_prompt": True,
            },
            timeout=300.0,
        )
        response.raise_for_status()
        return response.json()["content"]


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
            "chat_template_kwargs": {"enable_thinking": False},
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
    if cfg.backend == "llamaserver":
        return LlamaServerBackend(cfg)
    if cfg.backend == "openai":
        return OpenAIBackend(cfg)
    if cfg.backend == "mock":
        return MockBackend()
    raise ValueError(
        f"unknown backend {cfg.backend!r} (llamacpp|llamaserver|openai|mock)")
