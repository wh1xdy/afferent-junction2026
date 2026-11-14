import io

from analyzer import backend
from analyzer.config import ModelCfg


def test_render_qwen3_matches_training_template():
    assert backend.render_qwen3([
        {"role": "system", "content": "rules"},
        {"role": "user", "content": "hello"},
    ]) == (
        "<|im_start|>system\nrules<|im_end|>\n"
        "<|im_start|>user\nhello<|im_end|>\n"
        "<|im_start|>assistant\n<think>\n\n</think>\n\n"
    )


def test_llama_server_command():
    cfg = ModelCfg(
        path="/models/base.gguf", lora_path="/models/adapter.gguf",
        n_ctx=6144, n_gpu_layers=-1, server_port=9001,
        server_args=["-fa", "-ctk", "q8_0"],
    )
    assert backend.LlamaServerBackend(cfg).command() == [
        "llama-server", "-m", "/models/base.gguf",
        "--lora", "/models/adapter.gguf",
        "-c", "6144", "-ngl", "99", "--host", "127.0.0.1",
        "--port", "9001", "-fa", "-ctk", "q8_0",
    ]


def test_llama_server_load_uses_mock_process_and_health(monkeypatch):
    calls = []

    class Process:
        stderr = io.StringIO("")
        returncode = None

        def poll(self):
            return None

        def terminate(self):
            calls.append("terminate")

        def wait(self, timeout=None):
            calls.append(("wait", timeout))
            self.returncode = 0

    def popen(command, **kwargs):
        calls.append(command)
        return Process()

    class Response:
        status_code = 200

    monkeypatch.setattr(backend.subprocess, "Popen", popen)
    monkeypatch.setattr(backend.httpx, "get", lambda *a, **k: Response())
    cfg = ModelCfg(server_bin="/tmp/llama-server", path="/models/base.gguf")
    server = backend.LlamaServerBackend(cfg)
    server.load()
    assert calls[0][0] == "/tmp/llama-server"
    server.unload()
    assert calls[-2:] == ["terminate", ("wait", 20)]
