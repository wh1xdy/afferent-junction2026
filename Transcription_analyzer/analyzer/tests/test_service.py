import json
import threading

from fastapi.testclient import TestClient

from analyzer import service
from analyzer.config import Config


def _app(monkeypatch, tmp_path, cfg):
    cfg.transcripts_dir = tmp_path / "transcripts"
    cfg.db_path = tmp_path / "analyzer.db"
    cfg.schedule.window = ""
    cfg.data_manager.url = "off"
    monkeypatch.setattr(service, "load", lambda _path=None: cfg)
    return service.create_app()


def test_analyze_preflight_returns_409(tmp_path, monkeypatch):
    cfg = Config()
    cfg.model.backend = "llamaserver"
    cfg.model.path = str(tmp_path / "missing.gguf")
    cfg.model.lora_path = ""
    cfg.model.min_free_gb = 0
    app = _app(monkeypatch, tmp_path, cfg)

    with TestClient(app) as client:
        response = client.post("/analyze", json={})
    assert response.status_code == 409
    assert response.json()["detail"] == "model not ready: missing"


def test_transcripts_endpoint_accepts_and_rejects_rows(tmp_path, monkeypatch):
    cfg = Config()
    cfg.model.backend = "mock"
    app = _app(monkeypatch, tmp_path, cfg)
    hub_row = {
        "transcript_id": "hub-1", "patient_id": "anna",
        "t_iso": "2026-11-14T15:30:00Z",
        "turns": [{"role": "user", "text": "Bonjour"},
                  {"role": "agent", "text": "Comment allez-vous?"}],
    }
    synthetic_row = {
        "persona_id": "anna", "day": "2026-11-13",
        "turns": [{"speaker": "target", "text": "Très bien"}],
    }
    body = "\n".join([
        json.dumps(hub_row, ensure_ascii=False),
        "{bad json",
        json.dumps(synthetic_row, ensure_ascii=False),
        json.dumps({"turns": []}),
    ])

    with TestClient(app) as client:
        response = client.post(
            "/transcripts", content=body,
            headers={"Content-Type": "application/x-ndjson"})

    assert response.status_code == 200
    data = response.json()
    assert data["accepted"] == 2
    assert [item["index"] for item in data["rejected"]] == [1, 3]
    written = list((tmp_path / "transcripts").glob("ingest-*.jsonl"))
    assert len(written) == 1
    assert "Bonjour" in written[0].read_text(encoding="utf-8")
    assert len(written[0].read_text(encoding="utf-8").splitlines()) == 2


def test_startup_starts_hub_inbox_thread(tmp_path, monkeypatch):
    cfg = Config()
    cfg.hub_transcripts_dir = str(tmp_path / "hub")
    cfg.model.backend = "mock"
    app = _app(monkeypatch, tmp_path, cfg)
    started = threading.Event()
    monkeypatch.setattr(service.Runner, "consume_inbox",
                        lambda _runner: started.set())

    with TestClient(app):
        assert started.wait(1)
        assert app.state.inbox_thread.daemon
