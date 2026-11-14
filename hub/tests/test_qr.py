import datetime as dt
import json
import uuid
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from afferent_hub import qr
from afferent_hub.main import create_app
from afferent_hub.settings import Settings
from afferent_hub.views import SAFETY_KEYS

ROOT = Path(__file__).resolve().parents[2]
FIXTURE = ROOT / "contracts" / "fixtures" / "qr_body_anna.json"
FORBIDDEN = {"phq9", "phq9_9", "cssrs", "items", "item9", "display_name", "patient_id", "checkins", "name",
             "what_helped", "session_id", "checkin_id"}
TOP = {"v", "sim", "generated_iso", "period", "mornings", "state", "composite", "contrib", "cusum", "weekly",
       "baseline", "phq", "safety", "talk", "complete", "pauses", "sensors"}
SAFETY_FIELDS = {"day", "minute", "tier", "source", "screen", "c6_repeat"}


@pytest.fixture()
def client(tmp_path):
    app = create_app(Settings(db=str(tmp_path / "t.db"), bedside="ws", validation=False))
    with TestClient(app) as c:
        yield c


def keys(obj, top=True):
    if isinstance(obj, dict):
        for k, v in obj.items():
            yield k, top
            yield from keys(v, False)
    elif isinstance(obj, list):
        for v in obj:
            yield from keys(v, False)


def assert_clean(body):
    for k, top in keys(body):
        assert k not in FORBIDDEN, k
        assert top or k not in SAFETY_KEYS, k
    for e in body["safety"]:
        assert set(e) == SAFETY_FIELDS


def iso_on(patient, day, hh=12, mm=0):
    d = dt.date.fromisoformat(patient["tms_end_date"]) + dt.timedelta(days=day)
    return f"{d.isoformat()}T{hh:02d}:{mm:02d}:00+02:00"


def band(total):
    return next(b for cut, b in ((5, "minimal"), (10, "mild"), (15, "moderate"), (20, "moderately_severe"), (28, "severe"))
                if total < cut)


def checkin(patient, day, total, tier="none", source="item9_fallback", screen="thank_you", status="completed",
            item9=0, c6=False, mm=0):
    items = {f"phq9_{i}": 1 for i in range(1, 9)} | {"phq9_9": item9}
    doc = {"schema": "afferent.checkin/1", "checkin_id": str(uuid.uuid4()), "patient_id": patient["id"],
           "device_id": "inst-1", "app_version": "0.3.0", "started_iso": iso_on(patient, day, 12, mm),
           "status": status, "trigger": "schedule", "early": False, "language": "en",
           "phq9": {"items": items, "total": total if status == "completed" else None,
                    "phq8_total": total - item9 if status == "completed" else None,
                    "band": band(total) if status == "completed" else None},
           "cssrs": {"asked": source == "cssrs", "reason": None, "items": {"c1": "yes"}, "tier": None, "c6_repeat": c6},
           "safety": {"tier": tier, "item9": item9, "source": source, "screen": screen, "shared": True}}
    if status == "completed":
        doc["completed_iso"] = iso_on(patient, day, 12, mm + 2)
    else:
        doc["stopped_iso"] = iso_on(patient, day, 12, mm + 2)
    return doc


def test_roster_bodies_have_the_shape(client):
    ids = [p["id"] for p in client.get("/api/patients").json()["patients"]]
    for pid in ids:
        r = client.get(f"/api/patients/{pid}/qr-body")
        assert r.status_code == 200, r.text
        b = r.json()
        assert set(b) - {"omitted"} == TOP
        assert b["v"] == 1 and b["sim"] is True
        p = b["period"]
        assert p["to_day"] - p["from_day"] == 55
        assert set(b["weekly"]) == {"composite", *qr.FEATURE_KEYS}
        assert all(len(row) == 8 for row in b["weekly"].values())
        assert set(b["baseline"]) == set(qr.FEATURE_KEYS)
        assert {c["key"] for c in b["contrib"]} <= set(qr.FEATURE_KEYS)
        assert [abs(c["contribution"]) for c in b["contrib"]] == sorted((abs(c["contribution"]) for c in b["contrib"]), reverse=True)
        assert b["state"]["shown"] in qr.STATES and b["state"]["cusum"] in qr.STATES
        assert set(b["sensors"]) == {"phone_camera", "pulse_stone", "bedside_camera", "bedside_light", "presence",
                                     "phone_presence", "phone_motion"}
        assert len(b["phq"]["history"]) <= qr.CAPS["phq"] and len(b["safety"]) <= qr.CAPS["safety"]
        assert len(b["talk"]) <= qr.CAPS["talk"]
        assert_clean(b)
    assert client.get("/api/patients/nobody/qr-body").status_code == 404


def test_old_high_answer_and_todays_talk_request_travel(client):
    hub = client.app.state.hub
    p = hub.patient("anna")
    nd = client.get("/api/patients/anna").json()["patient"]["now_day"]
    old = checkin(p, nd - 140, 18, tier="high", source="cssrs", screen="crisis", item9=3, c6=True)
    assert client.post("/api/checkins", json=old).json()["safety_flag"] == "safety_high"
    hub.store.clear_flags("anna")
    hub.store.add_flag("anna", {"type": "talk_request", "t_iso": iso_on(p, nd, 7, 41), "source": "talk_button"})
    b = client.get("/api/patients/anna/qr-body").json()
    assert b["safety"] == [{"day": nd - 140, "minute": 722, "tier": "high", "source": "cssrs", "screen": "crisis",
                            "c6_repeat": True}]
    assert b["talk"] == [{"day": nd, "minute": 461}]
    assert_clean(b)
    text = json.dumps(b)
    assert '"yes"' not in text and "c1" not in text


def test_caps_and_omitted(client):
    hub = client.app.state.hub
    p = hub.patient("anna")
    nd = client.get("/api/patients/anna").json()["patient"]["now_day"]
    for i in range(11):
        doc = checkin(p, nd - 100 + 9 * i, 6 + i % 3, tier="low", item9=1, screen="support")
        assert client.post("/api/checkins", json=doc).status_code == 200
    client.post("/api/checkins", json=checkin(p, nd, 0, tier="not_answered", status="incomplete", screen=None))
    for i in range(13):
        hub.store.add_flag("anna", {"type": "talk_request", "t_iso": iso_on(p, nd - i, 8), "source": "talk_button"})
    b = client.get("/api/patients/anna/qr-body").json()
    assert len(b["safety"]) == 8 and b["safety"][0]["tier"] == "not_answered"
    assert [e["day"] for e in b["safety"]] == sorted((e["day"] for e in b["safety"]), reverse=True)
    assert len(b["phq"]["history"]) == 8 and b["phq"]["history"][-1]["day"] == nd - 10
    assert b["phq"]["baseline"] == 6 and b["phq"]["baseline_source"] == "app"
    assert b["phq"]["last_status"] == "stopped"
    assert len(b["talk"]) == 10 and b["talk"][0]["day"] == nd
    assert b["omitted"] == {"safety_entries": 4, "talk_requests": 3, "phq_totals": 3}
    assert_clean(b)


def test_phq_state_rules():
    assert qr.phq_state(None, [12]) is None
    assert qr.phq_state(6, []) is None
    assert qr.phq_state(6, [8]) == "stable"
    assert qr.phq_state(2, [7]) == "watch"
    assert qr.phq_state(6, [9, 10]) == "watch"
    assert qr.phq_state(4, [11]) == "check_in"
    assert qr.phq_state(12, [15]) == "check_in"
    assert qr.phq_state(4, [11, 12]) == "booster"
    assert qr.phq_state(18, [20]) == "booster"


def test_phq_raises_the_shown_state(client):
    hub = client.app.state.hub
    p = hub.patient("mikko")
    nd = client.get("/api/patients/mikko").json()["patient"]["now_day"]
    for day, total in ((0, 3), (nd - 14, 11), (nd, 12)):
        assert client.post("/api/checkins", json=checkin(p, day, total)).status_code == 200
    b = client.get("/api/patients/mikko/qr-body").json()
    assert b["state"]["phq_state"] == "booster" and b["state"]["shown"] == "booster"
    assert b["state"]["since_day"] == nd


def test_fixture_matches_the_live_shape(client):
    fx = json.loads(FIXTURE.read_text())
    live = client.get("/api/patients/anna/qr-body").json()
    assert set(fx) - {"omitted"} == set(live) - {"omitted"} == TOP
    for k in ("period", "mornings", "state", "composite", "cusum", "phq", "complete", "sensors", "weekly", "baseline"):
        assert set(fx[k]) == set(live[k]), k
    assert fx["sim"] is True and fx["safety"] and fx["talk"] and fx["phq"]["history"]
    assert_clean(fx)
    fallback = ROOT / "demo" / "js" / "qr_body_fallback.json"
    assert json.loads(fallback.read_text()) == fx
