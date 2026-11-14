"""Cross-track contract check (Decisions I53): the session document the real JS recorder builds from
finger_ppg frames must validate against contracts/session.v3.schema.json.

The phone track ships demo/tests/emit_session.js, which prints one JSON object
{signal, vitals, simulated, simulated_fields} produced by demo/js/record.js fed with finger_ppg frames.
Until that file exists (or when node is missing) this test skips.

With the argument `face` the emitter also feeds the face half of a fake AfferentPulse plugin, so the optional vitals.face block
(face measures from the phone's TrueDepth camera) is checked the same way.
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


def emitted(*args):
    if not EMITTER.exists():
        pytest.skip("demo/tests/emit_session.js is not in this tree (phone track)")
    if shutil.which("node") is None:
        pytest.skip("node is not installed")
    run = subprocess.run(["node", "demo/tests/emit_session.js", *args], cwd=ROOT, capture_output=True, text=True, timeout=60)
    assert run.returncode == 0, run.stderr[-2000:]
    out = json.loads(run.stdout)
    assert isinstance(out, dict)
    missing = [k for k in KEYS if k not in out]
    assert not missing, f"emit_session.js output lacks {missing}"
    return out


def validated(out):
    doc = json.loads((CONTRACTS / "fixtures" / "session_example.json").read_text())
    for key in KEYS:
        doc[key] = out[key]
    schema = json.loads((CONTRACTS / "session.v3.schema.json").read_text())
    validator = Draft202012Validator(schema)
    assert [f"{e.json_path}: {e.message}" for e in validator.iter_errors(doc)] == []
    return doc


def test_js_recorder_session_matches_schema():
    doc = validated(emitted())
    assert "face" not in doc["vitals"]

    assert doc["signal"]["pulse_source"] == "finger_ppg"
    finger = doc["vitals"]["finger"]
    assert finger is not None and finger["source"] == "finger_ppg"
    assert finger["transport"] in ("ble", "hub_http")
    # A real finger pulse is never listed as simulated, in any spelling.
    for name in doc["simulated_fields"]:
        assert not name.startswith("vitals"), name
        assert "pulse" not in name.lower(), name


def test_js_recorder_face_block_matches_schema():
    doc = validated(emitted("face"))
    face = doc["vitals"]["face"]
    assert face["source"] == "arkit_truedepth"
    assert set(face) == {"source", "seconds_tracked", "smile_share", "movement", "blinks_per_min", "gaze_away_share", "micro",
                         "breathing_depth"}
    # 60 one-second readings, every tenth without a tracked face: shares and rates are over the 54 tracked seconds.
    assert face["seconds_tracked"] == 54
    assert face["movement"]["samples"] == 54
    assert 0 < face["smile_share"] < 1 and 0 < face["gaze_away_share"] < 1 and face["blinks_per_min"] > 0
    micro = face["micro"]
    assert set(micro["by_region"]) == {"brow", "eye", "cheek", "nose", "mouth", "jaw"}
    assert sum(micro["by_region"].values()) == micro["count"] == 4
    assert 40 <= micro["median_duration_ms"] <= 500
    depth = face["breathing_depth"]
    assert depth["seconds"] == depth["rate_per_min"]["samples"] > 0
    # Camera breathing never replaces or blends into the finger-derived breathing block.
    assert doc["vitals"]["breathing"]["method"] == "pulse_rhythm"
    assert doc["vitals"]["breathing"]["rate_per_min"]["mean"] != depth["rate_per_min"]["mean"]
    # The face block is measured by the phone or absent; it is never listed as simulated.
    assert not any(name.startswith("vitals") for name in doc["simulated_fields"])
    # The rest of the document is what the recorder writes without the camera.
    plain = validated(emitted())
    assert {k: v for k, v in doc["vitals"].items() if k != "face"} == plain["vitals"]
    assert doc["signal"] == plain["signal"] and doc["simulated_fields"] == plain["simulated_fields"]
