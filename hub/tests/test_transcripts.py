import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from afferent_hub.main import create_app
from afferent_hub.settings import Settings
from afferent_hub.transcripts import TranscriptLog

def recv_until(ws, mtype, limit=200):
    for _ in range(limit):
        msg = ws.receive_json()
        if msg.get("type") == mtype:
            return msg
    raise AssertionError(f"{mtype} not received")

def ws_hub(tmp_path):
    return TestClient(create_app(Settings(db=str(tmp_path / "t.db"), bedside="ws", validation=False,
                                          transcripts_dir=str(tmp_path / "tr"))))

def rows(dir):
    return [json.loads(l) for f in sorted(Path(dir).glob("transcript-*.jsonl"))
            for l in f.read_text().splitlines()]

def test_write_and_dedupe(tmp_path):
    log = TranscriptLog(tmp_path / "tr")
    rec = {"transcript_id": "t1", "patient_id": "anna", "turns": [{"role": "user", "text": "hi"}]}
    assert log.write(rec) is True
    assert log.write(rec) is False                       # resent after a lost ack
    files = log._files()
    assert len(files) == 1
    assert [json.loads(l) for l in files[0].read_text().splitlines()] == [rec]

def test_reuses_partial_file(tmp_path):
    d = tmp_path / "tr"
    TranscriptLog(d, file_max=1000).write({"transcript_id": "a", "turns": []})
    log = TranscriptLog(d, file_max=1000)                # reopened: keeps appending while under the cap
    log.write({"transcript_id": "b", "turns": []})
    assert len(log._files()) == 1
    log.file_max = 10
    log.write({"transcript_id": "c", "turns": []})       # past the cap: a new file starts
    assert len(log._files()) == 2

def test_rotation_and_prune(tmp_path):
    log = TranscriptLog(tmp_path / "tr", file_max=200, total_max=500)
    for i in range(10):
        assert log.write({"transcript_id": f"t{i}", "turns": [{"role": "agent", "text": "x" * 60}]})
    files = log._files()
    assert len(files) > 1
    assert sum(f.stat().st_size for f in files) <= 500
    assert files[-1].exists()                            # the newest file survives pruning

def test_prune_keeps_at_least_the_newest(tmp_path):
    log = TranscriptLog(tmp_path / "tr", file_max=100, total_max=1)
    for i in range(5):
        log.write({"transcript_id": f"t{i}", "turns": [{"role": "agent", "text": "x" * 60}]})
    files = log._files()
    assert len(files) == 1 and files[0].stat().st_size > 1

def test_too_large_rejected(tmp_path):
    log = TranscriptLog(tmp_path / "tr")
    with pytest.raises(ValueError):
        log.write({"turns": [{"role": "u", "text": "x" * (4 * 1024 * 1024 + 1)}]})
    assert not log._files()

def test_transcript_over_ws(tmp_path):
    with ws_hub(tmp_path) as c:
        with c.websocket_connect("/ws/app?patient=anna") as app:
            app.send_json({"type": "transcript", "transcript_id": "tr-1", "patient_id": "anna",
                           "t_iso": "2026-11-14T10:00:00Z",
                           "turns": [{"role": "user", "text": "hello"}, {"role": "agent", "text": "hi"}]})
            ack = recv_until(app, "ack")
            assert ack["transcript_id"] == "tr-1" and ack["ok"] and not ack["duplicate"]
            app.send_json({"type": "transcript", "transcript_id": "tr-1", "patient_id": "anna",
                           "turns": [{"role": "user", "text": "hello"}]})
            assert recv_until(app, "ack")["duplicate"] is True
            app.send_json({"type": "transcript", "transcript_id": "tr-bad", "patient_id": "anna", "turns": []})
            assert recv_until(app, "ack")["ok"] is False
    saved = rows(tmp_path / "tr")
    assert [r["transcript_id"] for r in saved] == ["tr-1"]
    assert saved[0]["patient_id"] == "anna" and saved[0]["received_iso"]
    assert saved[0]["turns"] == [{"role": "user", "text": "hello"}, {"role": "agent", "text": "hi"}]

def test_transcript_unknown_patient(tmp_path):
    with ws_hub(tmp_path) as c:
        with c.websocket_connect("/ws/app?patient=nobody") as app:
            app.send_json({"type": "transcript", "transcript_id": "tr-x", "patient_id": "nobody",
                           "turns": [{"role": "user", "text": "hi"}]})
            ack = recv_until(app, "ack")
            assert ack["ok"] is False and "unknown_patient" in ack["error"]
    assert not list((tmp_path / "tr").glob("transcript-*.jsonl"))
