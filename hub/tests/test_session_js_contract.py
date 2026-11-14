"""Cross-track contract check (Decisions I53): the session document the real JS recorder builds from
finger_ppg frames must validate against contracts/session.v3.schema.json.

The phone track ships demo/tests/emit_session.js, which prints one JSON object
{signal, vitals, simulated, simulated_fields} produced by demo/js/record.js fed with finger_ppg frames.
Until that file exists (or when node is missing) this test skips.
"""
import json
import shutil
import subprocess
from pathlib import Path

import pytest
from jsonschema import Draft202012Validator

ROOT = Path(__file__).resolve().parents[2]
CONTRACTS = ROOT / "contracts"
EMITTER = ROOT / "demo" / "tests" / "emit_session.js"
KEYS = ("signal", "vitals", "simulated", "simulated_fields")


def emitted():
    if not EMITTER.exists():
        pytest.skip("demo/tests/emit_session.js is not in this tree (phone track)")
    if shutil.which("node") is None:
        pytest.skip("node is not installed")
    run = subprocess.run(["node", "demo/tests/emit_session.js"], cwd=ROOT, capture_output=True, text=True, timeout=60)
    assert run.returncode == 0, run.stderr[-2000:]
    out = json.loads(run.stdout)
    assert isinstance(out, dict)
    missing = [k for k in KEYS if k not in out]
    assert not missing, f"emit_session.js output lacks {missing}"
    return out


def test_js_recorder_session_matches_schema():
    out = emitted()
    doc = json.loads((CONTRACTS / "fixtures" / "session_example.json").read_text())
    for key in KEYS:
        doc[key] = out[key]
    schema = json.loads((CONTRACTS / "session.v3.schema.json").read_text())
    validator = Draft202012Validator(schema)
    assert [f"{e.json_path}: {e.message}" for e in validator.iter_errors(doc)] == []

    assert doc["signal"]["pulse_source"] == "finger_ppg"
    finger = doc["vitals"]["finger"]
    assert finger is not None and finger["source"] == "finger_ppg"
    assert finger["transport"] in ("ble", "hub_http")
    # A real finger pulse is never listed as simulated, in any spelling.
    for name in doc["simulated_fields"]:
        assert not name.startswith("vitals"), name
        assert "pulse" not in name.lower(), name


def test_js_breath_task_matches_schema():
    """demo/tests/emit_breath_task.js prints {task}: one breathing task recorded by the real game code while
    finger_ppg readings arrive. Its tasks[].extra.breathing must validate and must be labelled finger_ppg."""
    emitter = ROOT / "demo" / "tests" / "emit_breath_task.js"
    if not emitter.exists():
        pytest.skip("demo/tests/emit_breath_task.js is not in this tree (phone track)")
    if shutil.which("node") is None:
        pytest.skip("node is not installed")
    run = subprocess.run(["node", "demo/tests/emit_breath_task.js"], cwd=ROOT, capture_output=True, text=True, timeout=60)
    assert run.returncode == 0, run.stderr[-2000:]
    task = json.loads(run.stdout)["task"]
    assert task is not None and task["id"] == "breath"

    doc = json.loads((CONTRACTS / "fixtures" / "session_example.json").read_text())
    doc["tasks"] = [task]
    schema = json.loads((CONTRACTS / "session.v3.schema.json").read_text())
    assert [f"{e.json_path}: {e.message}" for e in Draft202012Validator(schema).iter_errors(doc)] == []

    b = task["extra"]["breathing"]
    assert b["source"] == "finger_ppg" and b["method"] == "pulse_rhythm"
    assert b["guide_per_min"] == 6
    assert 5 <= b["rate_per_min"]["samples"] <= b["seconds"]
    assert b["rate_per_min"]["mean"] == 9
    # readings ran through the whole task, so both ends of it have a pulse
    assert (b["pulse_start_bpm"], b["pulse_end_bpm"]) == (72, 72)
