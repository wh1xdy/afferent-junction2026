import json
import os
import socket
import subprocess
import sys
import time
import urllib.request
import uuid

import pytest
from fastapi.testclient import TestClient

from afferent_hub import summary
from afferent_hub.main import create_app
from afferent_hub.settings import Settings
from afferent_hub.team_adapters import alex as team_alex
from afferent_hub.team_adapters import loader, resync

TEAM = loader.TEAM


def checkin(items, **over):
    doc = {"schema": "afferent.checkin/1", "checkin_id": str(uuid.uuid4()), "patient_id": "anna",
           "started_iso": "2026-11-10T12:00:00+02:00", "completed_iso": "2026-11-10T12:02:00+02:00",
           "status": "completed", "phq9": {"items": {f"phq9_{i}": v for i, v in enumerate(items, 1)}},
           "safety": {"tier": "none", "item9": items[8], "source": "item9_fallback", "shared": True}}
    return doc | over


def make(tmp_path, **over):
    return TestClient(create_app(Settings(db=str(tmp_path / "t.db"), bedside="ws", validation=False, **over)))


def test_vendored_files_match_manifest():
    rows = resync.entries()
    listed = {r["path"] for r in rows}
    on_disk = {str(p.relative_to(TEAM)) for p in TEAM.rglob("*.py") if "__pycache__" not in p.parts}
    assert on_disk == listed
    for r in rows:
        assert resync.blob_id((TEAM / r["path"]).read_bytes()) == r["blob"], r["path"]
        assert r["branch"].startswith("junction/") and r["commit"] and r["source"]


@pytest.mark.parametrize("module", ["alex_hub", "data_manager"])
def test_their_tests_pass_on_copied_code(module):
    r = subprocess.run([sys.executable, "-m", "unittest", "discover", "tests"], cwd=TEAM / module,
                       capture_output=True, text=True, timeout=120)
    assert r.returncode == 0, r.stderr[-2000:]


def test_loader_leaves_no_bare_store_module():
    before = sys.modules.get("store")
    mods = loader.alex()
    assert sys.modules.get("store") is before
    assert mods["report"].METRICS is mods["store"].METRICS


def test_phq9_mapping():
    full = checkin([1, 2, 0, 1, 1, 0, 2, 1, 1])
    partial = checkin([1, 2, 0, 1, 1, 0, 2, 1, None], status="incomplete", completed_iso=None)
    assert team_alex.phq9_answers(full) == [1, 2, 0, 1, 1, 0, 2, 1, 1]
    assert team_alex.phq9_answers(partial) is None
    now = team_alex._ts(full) + 3600
    s = team_alex.team_summary([full, partial], 14, now)
    assert [(q["score"], q["item9"], q["severity"]) for q in s["phq9"]] == [(9, 1, "mild")]
    assert s["phq9_item9_flag"] and all(d["finger_bpm"] is None for d in s["daily"])


def test_fhir_endpoint_phq9_only(tmp_path):
    with make(tmp_path) as c:
        now = time.strftime("%Y-%m-%dT%H:%M:%S+00:00", time.gmtime())
        assert c.post("/api/checkins", json=checkin([2, 2, 1, 2, 1, 1, 1, 0, 1], completed_iso=now)).json()["ok"]
        r = c.get("/api/patients/anna/fhir")
        assert r.status_code == 200 and r.headers["content-type"].startswith("application/fhir+json")
        b = r.json()
        assert b["resourceType"] == "Bundle" and b["type"] == "collection"
        obs = [e["resource"] for e in b["entry"] if e["resource"]["resourceType"] == "Observation"]
        assert len(obs) == 1 and obs[0]["code"]["coding"][0]["code"] == "44261-6"
        assert obs[0]["valueInteger"] == 11 and len(obs[0]["component"]) == 9
        assert "assess risk" in obs[0]["note"][0]["text"]
        assert c.get("/api/patients/nobody/fhir").json()["error"] == "unknown_patient"
        assert c.get("/api/patients/anna/fhir?days=x").status_code == 400
    with make(tmp_path, team_fhir=False) as c:
        r = c.get("/api/patients/anna/fhir")
        assert r.status_code == 404 and r.json()["error"] == "module_disabled"


def test_report_off_by_default_and_on(tmp_path, monkeypatch):
    monkeypatch.setenv("AFFERENT_SUMMARY", "template")
    with make(tmp_path) as c:
        assert c.get("/api/patients/anna/report").json()["error"] == "module_disabled"
    with make(tmp_path, team_report=True) as c:
        now = time.strftime("%Y-%m-%dT%H:%M:%S+00:00", time.gmtime())
        c.post("/api/checkins", json=checkin([1] * 9, completed_iso=now))
        r = c.get("/api/patients/anna/report")
        assert r.status_code == 200 and r.headers["content-type"].startswith("text/html")
        assert "9/27" in r.text and "Anna" in r.text
        text = c.get("/api/patients/anna/summary").json()["text"]
        assert text and text[:40] in c.get("/api/patients/anna/report?narrative=1").text


def test_ask_off_by_default_and_grounded(tmp_path, monkeypatch):
    with make(tmp_path) as c:
        assert c.post("/api/patients/anna/ask", json={"question": "PHQ-9?"}).json()["error"] == "module_disabled"
    g = loader.alex()["grounding"]
    monkeypatch.setattr(g, "_chat", lambda url, system, msgs, timeout: "Score 9/27 on the latest check-in [Q1].")
    with make(tmp_path, team_ask_url="http://127.0.0.1:9/v1/chat/completions") as c:
        now = time.strftime("%Y-%m-%dT%H:%M:%S+00:00", time.gmtime())
        c.post("/api/checkins", json=checkin([1] * 9, completed_iso=now))
        assert c.post("/api/patients/anna/ask", json={}).status_code == 400
        r = c.post("/api/patients/anna/ask", json={"question": "What was the PHQ-9 score?"}).json()
        assert r["mode"] == "llm" and r["grounded"] and r["sources"][-1] == "Q1"
        assert r["safety"].startswith("Safety: PHQ-9 item 9")


def test_ask_unreachable_llm(tmp_path):
    with make(tmp_path, team_ask_url="http://127.0.0.1:9/v1/chat/completions") as c:
        r = c.post("/api/patients/anna/ask", json={"question": "What was the PHQ-9 score?"})
        assert r.status_code == 502 and r.json()["error"] == "llm_unreachable"


def test_guard_check():
    assert team_alex.guard_check("Pulse rose from 70 to 64 BPM this week. That is all.").startswith("direction")
    assert team_alex.guard_check("A significant week. Nothing else.") == "judgement words: significant"
    assert team_alex.guard_check("Pulse went from 70 to 64 BPM. Anna played 5 mornings.") is None


def test_guard_hook_wiring(tmp_path, monkeypatch):
    with make(tmp_path) as c:
        assert summary.checks == []
        assert {m["module"]: m["enabled"] for m in c.get("/api/team/modules").json()["modules"]} == {
            "fhir": True, "fhir_vitals": False, "clinician_report": False, "ask": False, "summary_guard": False,
            "sensors": False}
    with make(tmp_path, team_guard=True):
        assert summary.checks == [team_alex.guard_check]
    assert summary.checks == []
    monkeypatch.setattr(summary.ollama, "discover", lambda: "gemma3")
    monkeypatch.setattr(summary.ollama, "generate", lambda *a: "ok text")
    monkeypatch.setattr(summary.prompt, "build", lambda numbers: ("s", "u"))
    monkeypatch.setattr(summary.guard, "check", lambda text, numbers: None)
    monkeypatch.setattr(summary, "checks", [lambda text: "team says no"])
    monkeypatch.delenv("AFFERENT_SUMMARY", raising=False)
    assert summary._gemma({}) == (None, "gemma3", "rejected: team says no")


def test_our_template_passes_team_guard(tmp_path, monkeypatch):
    monkeypatch.setenv("AFFERENT_SUMMARY", "template")
    with make(tmp_path) as c:
        for pid in ("anna", "mikko"):
            s = c.get(f"/api/patients/{pid}/summary").json()
            assert s["source"] == "template"
            assert team_alex.guard_check(s["text"]) is None, s["text"]


def _free_port():
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


@pytest.fixture()
def data_manager(tmp_path):
    port = _free_port()
    env = {**os.environ, "PORT": str(port), "DATA_DIR": str(tmp_path), "MDNS": "0", "TZ_NAME": "UTC"}
    proc = subprocess.Popen([sys.executable, "app.py"], cwd=TEAM / "data_manager", env=env,
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    url = f"http://127.0.0.1:{port}"
    for _ in range(100):
        try:
            urllib.request.urlopen(url + "/health", timeout=0.5)
            break
        except OSError:
            time.sleep(0.1)
    now = time.time()
    samples = [{"metric": "env.temperature_c", "value": 21.0 + i % 2, "ts": now - 600 + i * 10} for i in range(10)]
    samples += [{"metric": "env.humidity_pct", "value": 40.0, "ts": now - 600 + i * 10} for i in range(10)]
    body = json.dumps({"source": "modulino-hub", "samples": samples}).encode()
    urllib.request.urlopen(urllib.request.Request(url + "/api/v1/samples", data=body,
                                                  headers={"Content-Type": "application/json"}))
    beats = [{"metric": "vitals.heart_rate_bpm", "value": 60 + i, "ts": now - 900 + i * 10} for i in range(20)]
    body = json.dumps({"source": "modulino-hub/finger1", "samples": beats}).encode()
    urllib.request.urlopen(urllib.request.Request(url + "/api/v1/samples", data=body,
                                                  headers={"Content-Type": "application/json"}))
    yield url
    proc.terminate()
    proc.wait(10)


def test_sensors_off_by_default(tmp_path):
    with make(tmp_path) as c:
        assert c.get("/api/sensors/latest").json()["error"] == "module_disabled"
        assert c.get("/api/patients/anna/sensors/room").json()["error"] == "module_disabled"


def test_sensors_via_data_manager(tmp_path, data_manager):
    with make(tmp_path, data_manager_url=data_manager, team_fhir_vitals=True) as c:
        latest = c.get("/api/sensors/latest").json()["latest"]
        assert {r["metric"] for r in latest} == {"env.temperature_c", "env.humidity_pct", "vitals.heart_rate_bpm"}
        assert c.get("/api/sensors/bogus").status_code == 404
        info = c.get("/api/sensors/info").json()
        assert info["version"] and "path" not in info
        r = c.get("/api/sensors/daily")
        assert r.status_code == 400 and r.json()["error"] == "data_manager_error"
        stats = c.get("/api/sensors/stats", params={"metric": "env.humidity_pct", "from": "-1d"}).json()
        assert stats["describe"]["n"] == 10
        room = c.get("/api/patients/anna/sensors/room?days=2").json()
        assert room["tz"] == "UTC" and room["days"][-1]["room"] == {"temp_c_mean": 21.5, "humidity_pct": 40.0}
        assert isinstance(room["days"][-1]["day_index"], int)
        assert c.get("/api/patients/mikko/sensors/room").json()["error"] == "not_bound"
        obs = [e["resource"] for e in c.get("/api/patients/anna/fhir").json()["entry"]
               if e["resource"]["resourceType"] == "Observation"]
        assert [o["code"]["coding"][0]["code"] for o in obs] == ["40443-4"]
        assert obs[0]["valueQuantity"]["value"] == 61
        c.post("/api/patients/anna/privacy", json={"sensor": "pulse_stone", "on": False})
        assert not [e for e in c.get("/api/patients/anna/fhir").json()["entry"]
                    if e["resource"]["resourceType"] == "Observation"]
        mods = {m["module"]: m["enabled"] for m in c.get("/api/team/modules").json()["modules"]}
        assert mods["sensors"] and mods["fhir_vitals"]
