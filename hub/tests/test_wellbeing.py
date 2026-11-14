import datetime as dt
import uuid

from fastapi.testclient import TestClient

from afferent_hub import wellbeing
from afferent_hub.main import create_app
from afferent_hub.settings import Settings


def recv_until(ws, mtype, limit=200):
    for _ in range(limit):
        msg = ws.receive_json()
        if msg.get("type") == mtype:
            return msg
    raise AssertionError(f"{mtype} not received")


def ws_hub(tmp_path):
    return TestClient(create_app(Settings(db=str(tmp_path / "t.db"), bedside="ws", validation=False)))


def checkin(total, band):
    today = dt.date.today().isoformat()
    items = {f"phq9_{i}": 0 for i in range(1, 10)}
    return {"schema": "afferent.checkin/1", "checkin_id": str(uuid.uuid4()), "patient_id": "anna",
            "device_id": "inst-1", "app_version": "0.3.0",
            "started_iso": f"{today}T12:00:00+02:00", "completed_iso": f"{today}T12:02:00+02:00",
            "status": "completed", "trigger": "schedule", "early": False, "language": "en",
            "phq9": {"items": items, "total": total, "phq8_total": 0, "band": band},
            "cssrs": {"asked": False, "reason": "not_licensed", "items": {}, "tier": None, "c6_repeat": False},
            "safety": {"tier": "none", "item9": 0, "source": "item9_fallback", "screen": "thank_you",
                       "shared": True}}


def dm(rows):
    """A fake SensorSource.get: {(endpoint, metric-or-kind): response}; anything else fails."""
    def get(name, params):
        key = params.get("metric") or params.get("kind")
        if (name, key) in rows:
            return rows[(name, key)]
        raise RuntimeError(f"unexpected read {name} {params}")
    return get


def test_indicator_levels():
    assert wellbeing.indicator({}, {}) == "ok"
    assert wellbeing.indicator({"state": "stable"}, {"band": "minimal"}) == "ok"
    assert wellbeing.indicator({"state": "watch"}, {}) == "watch"
    assert wellbeing.indicator({}, {"band": "mild"}) == "watch"
    assert wellbeing.indicator({}, {"overdue": True}) == "watch"
    assert wellbeing.indicator({"state": "check_in"}, {}) == "bad"
    assert wellbeing.indicator({"state": "booster"}, {}) == "bad"
    assert wellbeing.indicator({}, {"band": "moderate"}) == "bad"
    assert wellbeing.indicator({}, {"band": "severe"}) == "bad"


def test_hub_facts():
    assert wellbeing.hub_facts({"completeness": {"missed_7d": 1}}, {}) == []
    assert wellbeing.hub_facts({"completeness": {"missed_7d": 4}}, {}) == \
        ["skipped the morning practice on 4 of the last 7 days"]
    assert wellbeing.hub_facts({}, {"band": "moderate"}) == \
        ["their last check-in questionnaire suggested they have been having a harder time lately"]


def test_sensor_facts_quiet_days_at_home():
    get = dm({
        ("daily", "presence.outing"): {"days": [{"occurrences": 0, "partial_day": False}] * 5},
        ("trend", "presence.outing"): {"mann_kendall": {"trend": "decreasing"}},
        ("daily", "presence.home"): {"days": [{"share_of_day": 0.99, "partial_day": False}] * 5},
        ("events", "presence.guest_visit"): {"events": []},
    })
    assert wellbeing.sensor_facts(get) == [
        "went outside on 0 of the last 5 days",
        "outings have been getting shorter over the last two weeks",
        "stayed home nearly all day on 5 of the last 5 days",
        "no visitors recorded in the last two weeks",
    ]


def test_sensor_facts_best_effort():
    assert wellbeing.sensor_facts(dm({})) == []       # every read fails: no facts, no crash
    get = dm({("daily", "presence.outing"): {"days": [{"occurrences": 2, "partial_day": False}] * 5}})
    assert wellbeing.sensor_facts(get) == []           # the person goes out: nothing to say


def test_voice_context_over_ws_and_http(tmp_path):
    with ws_hub(tmp_path) as c:
        with c.websocket_connect("/ws/app?patient=anna") as app:
            app.send_json({"type": "voice_context", "patient_id": "anna"})
            res = recv_until(app, "voice_context")
            assert res["patient_id"] == "anna" and res["indicator"] in ("ok", "watch", "bad")
            assert res["date"] and isinstance(res["facts"], list)
            assert res["suggest_doctor"] == (res["indicator"] == "bad")
        http = c.get("/api/patients/anna/wellbeing").json()
        assert http["indicator"] == res["indicator"] and http["facts"] == res["facts"]
        assert c.get("/api/patients/nobody/wellbeing").status_code == 404


def test_bad_indicator_brings_facts_and_doctor_suggestion(tmp_path):
    with ws_hub(tmp_path) as c:
        sensors = type("S", (), {"enabled": True})()
        sensors.get = dm({                                # instance attr: not a bound method
            ("daily", "presence.outing"): {"days": [{"occurrences": 0, "partial_day": False}] * 5},
            ("trend", "presence.outing"): {"mann_kendall": {"trend": "decreasing"}},
            ("daily", "presence.home"): {"days": [{"share_of_day": 0.99, "partial_day": False}] * 5},
            ("events", "presence.guest_visit"): {"events": []},
        })
        c.app.state.hub.sensors = sensors
        assert c.post("/api/checkins", json=checkin(12, "moderate")).status_code == 200
        res = c.get("/api/patients/anna/wellbeing").json()
        assert res["indicator"] == "bad" and res["suggest_doctor"] is True
        assert "their last check-in questionnaire suggested they have been having a harder time lately" in res["facts"]
        assert "went outside on 0 of the last 5 days" in res["facts"]
        assert "no visitors recorded in the last two weeks" in res["facts"]
