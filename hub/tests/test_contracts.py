import json
import math
from pathlib import Path

import pytest
from jsonschema import Draft202012Validator

ROOT = Path(__file__).resolve().parents[2]
CONTRACTS = ROOT / "contracts"
FIX = CONTRACTS / "fixtures"

def load(path):
    return json.loads(Path(path).read_text())

@pytest.fixture(scope="module")
def session_schema():
    schema = load(CONTRACTS / "session.v3.schema.json")
    Draft202012Validator.check_schema(schema)
    return Draft202012Validator(schema)

@pytest.fixture(scope="module")
def daily_schema():
    schema = load(CONTRACTS / "daily.v1.schema.json")
    Draft202012Validator.check_schema(schema)
    return Draft202012Validator(schema)

def errors(validator, doc):
    return [f"{e.json_path}: {e.message}" for e in validator.iter_errors(doc)]

def test_session_example_valid(session_schema):
    assert errors(session_schema, load(FIX / "session_example.json")) == []

def test_daily_example_valid(daily_schema):
    assert errors(daily_schema, load(FIX / "daily_example.json")) == []

def test_declined_minimal_valid(session_schema):
    doc = {"schema": "afferent.session/3", "session_id": "0b3c9c52-1111-4c3e-9a1e-2f1e8b0c9d22", "patient_id": "anna",
           "device_id": "inst-1", "started_iso": "2026-11-15T22:10:00+02:00", "local_hour": 22.17, "status": "declined",
           "profile": "live", "simulated": False, "sharing": "summary"}
    assert errors(session_schema, doc) == []
    assert errors(session_schema, {**doc, "status": "completed"})

def test_wrong_schema_version_rejected(session_schema):
    doc = load(FIX / "session_example.json")
    doc["schema"] = "afferent.session/2"
    assert errors(session_schema, doc)

def test_stored_core_needs_no_rest(session_schema):
    doc = load(FIX / "session_example.json")
    doc["core"] = {"source": "stored", "baseline_pulse_bpm": 66.0}
    assert errors(session_schema, doc) == []
    doc["core"] = {"source": "measured", "baseline_pulse_bpm": 66.0}
    assert errors(session_schema, doc)

def test_example_derived_numbers_consistent():
    s = load(FIX / "session_example.json")
    taps = sorted(t["rt_ms"] for t in s["core"]["rt"]["trials"] if t["rt_ms"] is not None and t["rt_ms"] >= 150)
    n = len(taps)
    med = (taps[n // 2 - 1] + taps[n // 2]) / 2 if n % 2 == 0 else taps[n // 2]
    assert s["core"]["rt"]["median_ms"] == math.floor(med + 0.5)
    tl = s["two_lanterns"]
    rc, ri, lc, li = tl["rich_correct"], tl["rich_incorrect"], tl["lean_correct"], tl["lean_incorrect"]
    assert rc + ri + lc + li == sum(1 for t in tl["trials"] if t["response"] is not None)
    log_b = 0.5 * math.log10(((rc + 0.5) * (li + 0.5)) / ((ri + 0.5) * (lc + 0.5)))
    assert abs(tl["log_b"] - log_b) < 0.001
    for t in s["tasks"]:
        d, p = t["intended_direction"], t["pulse"]
        if d == "none":
            assert t["helped"] is None
        else:
            want = p["delta_bpm"] <= -2 if d == "fall" else p["delta_bpm"] >= 2
            assert t["helped"] == want
    assert [t["id"] for t in s["tasks"] if t["kind"] == "measurement"] == ["fork", "lanterns"]
    assert {t["slot"] for t in s["tasks"] if t["id"] == "fork"} == {1}
    assert {t["slot"] for t in s["tasks"] if t["id"] == "lanterns"} == {3}

def test_analytics_fixture_shape():
    a = load(FIX / "analytics_anna.json")
    for key in ["schema", "patient_id", "now_day", "simulated", "params", "state", "state_label", "suggestion", "director",
                "features", "composite", "cusum", "bandit", "pre_post", "pre_post_summary", "completeness", "timeline"]:
        assert key in a, key
    n = a["now_day"] + 1
    assert len(a["timeline"]["days"]) == n
    for f in a["features"]:
        assert len(f["series"]["value"]) == n
    total = sum(c["contribution"] or 0 for c in a["composite"]["contributions"])
    assert abs(total - a["composite"]["value"]) < 0.01
    assert a["state"] in {"stable", "watch", "check_in", "booster"}
    for mode, w in a["bandit"]["weights"].items():
        assert abs(sum(w.values()) - 1) < 0.01, mode

def test_patients_list_sorted_by_need():
    rank = {"booster": 3, "check_in": 2, "watch": 1, "stable": 0}
    rows = load(FIX / "patients_list.json")["patients"]
    keys = [(-rank[r["state"]], -(r["composite"] or 0)) for r in rows]
    assert keys == sorted(keys)
    assert all(r["simulated"] for r in rows)

def test_no_em_dash_in_contracts():
    for path in CONTRACTS.rglob("*.json"):
        assert "\u2014" not in path.read_text(), path
