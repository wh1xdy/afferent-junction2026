import sys
import time
from types import SimpleNamespace

from analyzer.config import ModelCfg
from analyzer.models import ModelFetcher


def test_fetcher_renames_download_to_configured_path(tmp_path, monkeypatch):
    model_dir = tmp_path / "models"
    model_dir.mkdir()
    adapter = model_dir / "adapter.gguf"
    adapter.write_bytes(b"adapter")
    cfg = ModelCfg(
        path=str(model_dir / "model.gguf"),
        lora_path=str(adapter),
        hf_repo="example/model",
        hf_file="remote-name.gguf",
    )

    def download(repo_id, filename, local_dir):
        assert repo_id == "example/model"
        downloaded = model_dir / filename
        downloaded.write_bytes(b"weights")
        return str(downloaded)

    monkeypatch.setitem(
        sys.modules, "huggingface_hub",
        SimpleNamespace(hf_hub_download=download))
    fetcher = ModelFetcher(cfg)
    assert fetcher.status()["state"] == "missing"
    assert fetcher.fetch() is True
    deadline = time.monotonic() + 5
    while fetcher.status()["state"] == "downloading" and time.monotonic() < deadline:
        time.sleep(0.01)

    assert fetcher.ready
    assert fetcher.status()["state"] == "ready"
    assert (model_dir / "model.gguf").read_bytes() == b"weights"
    assert not (model_dir / "remote-name.gguf").exists()
