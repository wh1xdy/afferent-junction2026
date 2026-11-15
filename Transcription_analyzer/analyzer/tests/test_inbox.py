import json
import threading

from analyzer.backend import MockBackend
from analyzer.config import Config, load
from analyzer.inbox import claim, settle
from analyzer import pipeline
from analyzer.pipeline import Runner
from analyzer.store import Store


def _hub_row(transcript_id="hub-1"):
    return {
        "transcript_id": transcript_id,
        "patient_id": "anna",
        "t_iso": "2026-11-14T15:30:00Z",
        "received_iso": "2026-11-14T15:31:00Z",
        "turns": [
            {"role": "user", "text": "I went for a walk today."},
            {"role": "agent", "text": "Where did you go?"},
            {"role": "user", "text": "Along the river with my sister."},
        ],
    }


def _write_row(path, row=None):
    path.write_text(json.dumps(row or _hub_row()) + "\n", encoding="utf-8")


def _runner(tmp_path, hub_dir, backend=None):
    cfg = Config()
    cfg.hub_transcripts_dir = str(hub_dir)
    cfg.transcripts_dir = tmp_path / "regular-transcripts"
    cfg.db_path = tmp_path / "inbox.db"
    cfg.model.backend = "mock"
    cfg.data_manager.url = "off"
    return Runner(cfg, backend or MockBackend())


def test_claim_renames_only_hub_files_and_picks_up_stale(tmp_path):
    fresh = tmp_path / "transcript-000001.jsonl"
    unrelated = tmp_path / "other.jsonl"
    stale = tmp_path / "transcript-000002.jsonl.12345.analyzing"
    _write_row(fresh)
    _write_row(unrelated)
    _write_row(stale)

    claimed = claim(tmp_path)

    assert fresh.with_name("transcript-000001.jsonl").exists() is False
    assert unrelated.exists()
    assert {path.name for path in claimed} == {
        stale.name,
        next(path.name for path in claimed
             if path.name.startswith("transcript-000001.jsonl.")),
    }
    assert all(path.name.endswith(".analyzing") for path in claimed)


def test_settle_deletes_clean_file_and_preserves_failed_file(tmp_path):
    clean = tmp_path / "transcript-000001.jsonl.1.analyzing"
    failed = tmp_path / "transcript-000002.jsonl.2.analyzing"
    _write_row(clean)
    _write_row(failed)

    counts = settle([clean, failed], {str(failed): 1})

    assert counts == {"deleted": 1, "failed": 1}
    assert not clean.exists()
    assert not failed.exists()
    preserved = list(tmp_path.glob("transcript-000002.jsonl.*.failed"))
    assert len(preserved) == 1
    assert json.loads(preserved[0].read_text())["transcript_id"] == "hub-1"


def test_hub_write_after_claim_is_not_deleted(tmp_path):
    original = tmp_path / "transcript-000001.jsonl"
    _write_row(original)
    claimed = claim(tmp_path)

    assert not list(tmp_path.glob("transcript-*.jsonl"))
    next_write = tmp_path / "transcript-000001.jsonl"
    _write_row(next_write, _hub_row("hub-2"))
    settle(claimed, {})

    assert next_write.exists()
    assert json.loads(next_write.read_text())["transcript_id"] == "hub-2"


def test_consume_inbox_scores_and_deletes_hub_file(tmp_path):
    hub_dir = tmp_path / "hub"
    hub_dir.mkdir()
    source = hub_dir / "transcript-000001.jsonl"
    _write_row(source)
    runner = _runner(tmp_path, hub_dir)

    runner.consume_inbox()

    status = runner.status()["inbox"]
    assert status["enabled"] is True
    assert status["state"] == "done"
    assert status["claimed"] == 1
    assert status["deleted"] == 1
    assert status["failed"] == 0
    assert status["finished_at"]
    assert not source.exists()
    with Store(runner.cfg.db_path) as store:
        day = store.day_scores("2026-11-14", "anna")
    assert day["n_windows"] == 1


def test_scoring_error_moves_claim_to_failed(tmp_path):
    class BrokenBackend(MockBackend):
        def complete_json(self, messages):
            raise RuntimeError("mock scoring failure")

    hub_dir = tmp_path / "hub"
    hub_dir.mkdir()
    source = hub_dir / "transcript-000001.jsonl"
    _write_row(source)
    runner = _runner(tmp_path, hub_dir, BrokenBackend())

    runner.consume_inbox()

    status = runner.status()["inbox"]
    assert status["state"] == "done"
    assert status["deleted"] == 0
    assert status["failed"] == 1
    assert len(list(hub_dir.glob("transcript-000001.jsonl.*.failed"))) == 1


def test_file_parse_error_is_counted_and_marked_failed(tmp_path):
    hub_dir = tmp_path / "hub"
    hub_dir.mkdir()
    source = hub_dir / "transcript-000001.jsonl"
    source.write_text("{not json}\n", encoding="utf-8")
    runner = _runner(tmp_path, hub_dir)

    runner.consume_inbox()

    assert runner.last_result["errors"] == 1
    assert len(runner.last_result["file_errors"]) == 1
    assert runner.status()["inbox"]["failed"] == 1
    assert len(list(hub_dir.glob("transcript-000001.jsonl.*.failed"))) == 1


def test_preflight_waits_then_consumes_inbox(tmp_path):
    hub_dir = tmp_path / "hub"
    hub_dir.mkdir()
    _write_row(hub_dir / "transcript-000001.jsonl")
    runner = _runner(tmp_path, hub_dir)
    runner.cfg.inbox_retry_s = 0.001
    runner.cfg.inbox_settle_s = 0.0
    blocked = [True]
    waiting = threading.Event()

    def preflight():
        if blocked[0]:
            waiting.set()
            return "model not ready: downloading"
        return None

    runner.preflight = preflight
    worker = threading.Thread(target=runner.consume_inbox)
    worker.start()

    assert waiting.wait(1)
    assert runner.status()["inbox"]["state"] == "waiting"
    assert runner.status()["inbox"]["detail"] == "model not ready: downloading"
    blocked[0] = False
    worker.join(2)

    assert not worker.is_alive()
    assert runner.status()["inbox"]["state"] == "done"
    assert runner.status()["inbox"]["deleted"] == 1


def test_exclusive_probe_blocks_preflight_before_memory_check(tmp_path,
                                                              monkeypatch):
    cfg = Config()
    cfg.db_path = tmp_path / "probe.db"
    cfg.exclusive_probe_urls = ["http://posture.local/api/status"]
    cfg.model.min_free_gb = 999
    monkeypatch.setattr(pipeline, "_probe_exclusive_status",
                        lambda _url: 200)
    runner = Runner(cfg, MockBackend())

    assert runner.preflight() == (
        "afferent-posture is running (http://posture.local/api/status) — "
        "switch with the posture controller")


def test_exclusive_probe_connection_error_allows_preflight(tmp_path,
                                                           monkeypatch):
    cfg = Config()
    cfg.db_path = tmp_path / "probe.db"
    cfg.exclusive_probe_urls = ["http://posture.local/api/status"]

    def connection_error(*_args, **_kwargs):
        raise OSError("connection refused")

    monkeypatch.setattr(pipeline.httpx, "get", connection_error)
    runner = Runner(cfg, MockBackend())

    assert runner.preflight() is None


def test_exclusive_probe_environment_is_comma_separated(monkeypatch):
    monkeypatch.setenv(
        "ANALYZER_EXCLUSIVE_PROBES",
        "http://posture.local/status,http://other.local/status")

    cfg = load()

    assert cfg.exclusive_probe_urls == [
        "http://posture.local/status", "http://other.local/status"]


def test_batch_interruption_unloads_waits_and_retries_claim(tmp_path,
                                                            monkeypatch):
    class TrackingBackend(MockBackend):
        def __init__(self):
            super().__init__()
            self.unloads = 0

        def unload(self):
            self.unloads += 1
            super().unload()

    hub_dir = tmp_path / "hub"
    hub_dir.mkdir()
    source = hub_dir / "transcript-000001.jsonl"
    source.write_text(
        json.dumps(_hub_row("hub-1")) + "\n"
        + json.dumps(_hub_row("hub-2")) + "\n",
        encoding="utf-8")
    backend = TrackingBackend()
    runner = _runner(tmp_path, hub_dir, backend)
    runner.cfg.exclusive_probe_urls = ["http://posture.local/api/status"]
    runner.cfg.inbox_settle_s = 0
    runner.cfg.inbox_retry_s = 0.001
    posture_active = [False]
    reason = (
        "afferent-posture is running (http://posture.local/api/status) — "
        "switch with the posture controller")
    waiting = threading.Event()
    monkeypatch.setattr(
        pipeline, "_probe_exclusive_status",
        lambda _url: 200 if posture_active[0] else None)
    stop_calls = [0]

    def should_stop():
        stop_calls[0] += 1
        if stop_calls[0] == 2:
            posture_active[0] = True
            return reason
        return None

    runner._should_stop = should_stop
    original_set_inbox = runner._set_inbox

    def observe_inbox(**values):
        original_set_inbox(**values)
        if (values.get("state") == "waiting"
                and values.get("detail") == reason):
            waiting.set()

    runner._set_inbox = observe_inbox
    worker = threading.Thread(target=runner.consume_inbox)
    worker.start()

    assert waiting.wait(2)
    assert len(list(hub_dir.glob("*.analyzing"))) == 1
    assert backend.unloads == 1

    posture_active[0] = False
    worker.join(3)

    assert not worker.is_alive()
    assert runner.status()["inbox"]["state"] == "done"
    assert runner.status()["inbox"]["deleted"] == 1
    assert not list(hub_dir.glob("*.analyzing"))
    assert backend.unloads == 2
    assert runner.last_result["windows_skipped"] == 1
    assert runner.last_result["windows_scored"] == 1
