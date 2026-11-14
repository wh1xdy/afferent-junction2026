import json

from analyzer.backend import MockBackend
from analyzer.config import Config
from analyzer.pipeline import Runner, run_batch
from analyzer.scoring import WindowScore
from analyzer.store import Store


def _cfg(tmp_path, transcript_file) -> Config:
    cfg = Config()
    cfg.transcripts_dir = transcript_file.parent
    cfg.db_path = tmp_path / "test.db"
    cfg.model.backend = "mock"
    return cfg


def test_batch_end_to_end(tmp_path, transcript_file):
    cfg = _cfg(tmp_path, transcript_file)
    backend = MockBackend({"responsiveness": 70})
    with Store(cfg.db_path) as store:
        result = run_batch(cfg, backend, store)
        assert result.files == 1
        assert result.windows_scored == 1
        assert store.day_scores("1")["scores"]["responsiveness"] == 70.0


def test_batch_is_idempotent(tmp_path, transcript_file):
    cfg = _cfg(tmp_path, transcript_file)
    backend = MockBackend()
    with Store(cfg.db_path) as store:
        run_batch(cfg, backend, store)
        again = run_batch(cfg, backend, store)
        assert again.windows_scored == 0
        assert again.windows_skipped == 1


def test_runner_loads_and_unloads(tmp_path, transcript_file):
    cfg = _cfg(tmp_path, transcript_file)
    cfg.data_manager.url = "off"             # no DM in tests — sink becomes a no-op
    backend = MockBackend()
    runner = Runner(cfg, backend)
    result = runner.run_batch_locked()
    assert result["windows_scored"] == 1
    assert backend.loaded is False          # model released after the batch
    assert runner.status()["last_error"] is None


def test_drift_index(tmp_path):
    cfg = Config()
    cfg.db_path = tmp_path / "t.db"
    with Store(cfg.db_path) as store:
        scores = lambda v: WindowScore.model_validate({
            **{d: {"score": v, "confidence": 1.0, "evidence": []}
               for d in ("responsiveness", "engagement", "fluency",
                          "coherence")},
            "drift_flag": False, "notes": ""})
        # 30 flat baseline days then one degraded day
        for day in [f"2026-10-{d:02d}" for d in range(1, 29)]:
            store.record_window(record_id=day, seq=0, source="t", persona_id="p",
                                day=day, trajectory="normal", n_turns=10,
                                metrics={}, scores=scores(70))
            store.aggregate_day("p", day)
        store.record_window(record_id="x", seq=0, source="t", persona_id="p",
                            day="2026-11-01", trajectory="depressed",
                            n_turns=10, metrics={}, scores=scores(30))
        store.aggregate_day("p", "2026-11-01")
        idx = store.drift_index("2026-11-01", "p")
        assert idx["composite_z"] < -1.5
        assert idx["warning"] == "elevated"
        assert idx["baseline"]["responsiveness"]["mean"] == 70.0


def test_personas_do_not_share_day_aggregates(tmp_path):
    """Two patients on the same day must keep separate day rows — the bug
    this guards against lumped every persona into one household day."""
    cfg = Config()
    cfg.db_path = tmp_path / "t.db"
    scores = lambda v: WindowScore.model_validate({
        **{d: {"score": v, "confidence": 1.0, "evidence": []}
           for d in ("responsiveness", "engagement", "fluency",
                      "coherence")},
        "drift_flag": False, "notes": ""})
    with Store(cfg.db_path) as store:
        store.record_window(record_id="a", seq=0, source="t", persona_id="anna",
                            day="2026-11-14", trajectory="real", n_turns=10,
                            metrics={}, scores=scores(80))
        store.record_window(record_id="b", seq=0, source="t", persona_id="bob",
                            day="2026-11-14", trajectory="real", n_turns=10,
                            metrics={}, scores=scores(30))
        store.aggregate_day("anna", "2026-11-14")
        store.aggregate_day("bob", "2026-11-14")
        assert store.day_scores("2026-11-14", "anna")["scores"]["responsiveness"] == 80
        assert store.day_scores("2026-11-14", "bob")["scores"]["responsiveness"] == 30
        merged = store.day_scores("2026-11-14")      # persona=None merges
        assert merged["scores"]["responsiveness"] == 55.0
        assert merged["n_windows"] == 2


def test_runner_preflight_checks_fetcher_and_available_memory(tmp_path, monkeypatch):
    cfg = Config()
    cfg.db_path = tmp_path / "preflight.db"
    cfg.model.min_free_gb = 5.8

    class Fetcher:
        ready = False

        def status(self):
            return {"state": "downloading"}

    runner = Runner(cfg, MockBackend(), fetcher=Fetcher())
    assert runner.preflight() == "model not ready: downloading"

    runner.fetcher = None
    monkeypatch.setattr(Runner, "_mem_available_gb", staticmethod(lambda: 1.25))
    assert runner.preflight() == (
        "only 1.2 GB free, need 5.8 — stop afferent-posture first")
    try:
        runner.run_batch_locked()
    except RuntimeError as exc:
        assert "stop afferent-posture first" in str(exc)
    else:
        raise AssertionError("low-memory run should fail preflight")


def test_run_batch_recurses_into_transcript_directories(tmp_path):
    cfg = Config()
    cfg.transcripts_dir = tmp_path
    cfg.db_path = tmp_path / "nested.db"
    cfg.model.backend = "mock"
    nested = tmp_path / "synthetic"
    nested.mkdir()
    (nested / "nested.jsonl").write_text(json.dumps({
        "persona_id": "anna", "day": 1, "trajectory": "normal",
        "turns": [
            {"t": 0, "speaker": "interlocutor", "text": "Hello"},
            {"t": 2, "speaker": "target", "text": "Hi there"},
        ],
    }) + "\n")

    with Store(cfg.db_path) as store:
        result = run_batch(cfg, MockBackend(), store)
    assert result.files == 1
    assert result.windows_scored == 1
