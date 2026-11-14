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
            store.aggregate_day(day)
        store.record_window(record_id="x", seq=0, source="t", persona_id="p",
                            day="2026-11-01", trajectory="depressed",
                            n_turns=10, metrics={}, scores=scores(30))
        store.aggregate_day("2026-11-01")
        idx = store.drift_index("2026-11-01")
        assert idx["composite_z"] < -1.5
        assert idx["warning"] == "elevated"
        assert idx["baseline"]["responsiveness"]["mean"] == 70.0
