import datetime as dt
from contextlib import contextmanager

import pytest
from fastapi.testclient import TestClient

from afferent_hub import decline
from afferent_hub.main import create_app
from afferent_hub.settings import Settings


def dm(rows):
    def get(name, params):
        key = params.get("metric") or params.get("kind")
        if (name, key) in rows:
            return rows[(name, key)]
        raise RuntimeError(f"unexpected read {name} {params}")
    return get


def daily(field, reference, current, *, reference_days=14, recent_days=3, partial=None):
    start = dt.date(2026, 1, 1)
    rows = [
        {"day": (start + dt.timedelta(days=i)).isoformat(), field: reference, "partial_day": False}
        for i in range(reference_days)
    ]
    rows += [
        {"day": (start + dt.timedelta(days=reference_days + i)).isoformat(),
         field: current, "partial_day": False}
        for i in range(recent_days)
    ]
    if partial:
        rows.extend(partial)
    return {"days": rows}


@contextmanager
def sensor_client(tmp_path):
    with TestClient(create_app(Settings(
        db=str(tmp_path / "decline.db"), bedside="ws", validation=False, decline_interval_s=0,
    ))) as client:
        sensors = type("Sensors", (), {"enabled": True})()
        sensors.get = dm({
            ("daily", "presence.outing"): daily("minutes", 100, 100),
        })
        client.app.state.hub.sensors = sensors
        yield client


def test_outings_decline_and_fact():
    report = decline.analyze(dm({
        ("daily", "presence.outing"): daily("minutes", 120, 60),
    }))
    outings = report["indicators"][0]
    assert report["level"] == "low"
    assert outings["score"] == 0.5 and outings["status"] == "low"
    assert decline.facts(report) == [
        "time spent outside is at 50% of their usual level over the last 3 days"
    ]


def test_steady_data_is_ok():
    report = decline.analyze(dm({
        ("daily", "presence.outing"): daily("minutes", 120, 120),
    }))
    assert report["level"] == "ok"
    assert report["indicators"][0]["status"] == "ok"


def test_lower_is_better_posture_decline():
    report = decline.analyze(dm({
        ("daily", "posture.head_trunk_angle_deg"): daily("median", 10, 14),
    }))
    posture = next(i for i in report["indicators"] if i["key"] == "posture")
    assert posture["score"] == 0.714 and posture["status"] == "low"


def test_partial_day_is_ignored():
    report = decline.analyze(dm({
        ("daily", "presence.outing"): daily(
            "minutes", 120, 120, partial=[{"day": "2026-01-20", "minutes": 0, "partial_day": True}],
        ),
    }))
    outings = report["indicators"][0]
    assert outings["score"] == 1
    assert outings["days_reference"] == 14 and outings["days_recent"] == 3


def test_too_few_reference_days():
    report = decline.analyze(dm({
        ("daily", "presence.outing"): daily("minutes", 120, 60, reference_days=4),
    }))
    outings = report["indicators"][0]
    assert outings["status"] == "not_enough_data" and outings["score"] is None


def test_get_failure_does_not_prevent_other_indicators():
    def get(name, params):
        metric = params["metric"]
        if metric == "vitals.hrv_rmssd_ms":
            raise RuntimeError("offline")
        if metric == "presence.outing":
            return daily("minutes", 120, 60)
        raise RuntimeError("no samples")

    report = decline.analyze(get)
    assert report["level"] == "low"
    assert report["indicators"][0]["status"] == "low"
    hrv = next(i for i in report["indicators"] if i["key"] == "hrv")
    assert hrv["status"] == "no_data"


def test_apply_override_validation_and_values():
    report = decline.analyze(dm({
        ("daily", "presence.outing"): daily("minutes", 100, 100),
        ("daily", "posture.head_trunk_angle_deg"): daily("median", 10, 10),
    }))
    forced = decline.apply_override(report, {"outings": 0.55, "posture": 1.25})
    outings = next(i for i in forced["indicators"] if i["key"] == "outings")
    posture = next(i for i in forced["indicators"] if i["key"] == "posture")
    assert forced["forced"] is True and forced["level"] == "low"
    assert outings["forced"] is True and outings["score"] == 0.55
    assert outings["current"] == pytest.approx(55) and outings["status"] == "low"
    assert posture["forced"] is True and posture["current"] == pytest.approx(8)
    assert posture["status"] == "ok"
    assert report["forced"] is False and report["indicators"][0].get("forced") is None
    with pytest.raises(ValueError):
        decline.apply_override(report, {"unknown": 0.5})
    with pytest.raises(ValueError):
        decline.apply_override(report, {"outings": 2.1})
    with pytest.raises(ValueError):
        decline.apply_override(report, {"outings": float("nan")})


@pytest.mark.parametrize("name,level,low_keys", [
    ("stable", "ok", set()),
    ("withdrawal", "low", {"outings", "visits"}),
    ("stress", "low", {"hrv"}),
    ("slumped", "low", {"posture"}),
    ("global_decline", "low", {"outings", "visits", "hrv", "posture"}),
    ("borderline", "ok", set()),
    ("recovering", "ok", set()),
])
def test_synthetic_scenarios(name, level, low_keys):
    report = decline.analyze(decline.synthetic_get(name))
    assert report["level"] == level
    assert {i["key"] for i in report["indicators"] if i["status"] == "low"} == low_keys
    assert all(i["days_reference"] == 14 and i["days_recent"] == 3 for i in report["indicators"])


def test_demo_api_force_clear_and_invalid_key(tmp_path):
    with sensor_client(tmp_path) as client:
        forced = client.post("/api/demo/decline")
        assert forced.status_code == 200, forced.text
        assert forced.json()["decline"]["forced"] is True
        report = client.get("/api/patients/anna/decline").json()
        assert report["level"] == "low"
        assert report["forced"] is True
        wellbeing = client.get("/api/patients/anna/wellbeing").json()
        assert wellbeing["indicator"] == "bad"
        assert wellbeing["facts"][0] == (
            "time spent outside is at 55% of their usual level over the last 3 days"
        )
        assert wellbeing["suggest_doctor"] is True
        assert client.post("/api/demo/decline", json={"scores": {"unknown": 0.5}}).status_code == 400
        cleared = client.delete("/api/demo/decline")
        assert cleared.status_code == 200 and cleared.json()["ok"] is True
        report = client.get("/api/patients/anna/decline").json()
        assert report["level"] == "ok" and report["forced"] is False


def test_scenario_demo_api(tmp_path):
    with sensor_client(tmp_path) as client:
        scenarios = client.get("/api/demo/decline/scenarios").json()["scenarios"]
        assert len(scenarios) == 7
        assert {scenario["name"] for scenario in scenarios} == set(decline.SCENARIOS)
        assert all(set(scenario["ratios"]) == set(decline.INDICATORS) for scenario in scenarios)

        response = client.post("/api/demo/decline", json={"scenario": "withdrawal"})
        assert response.status_code == 200 and response.json()["mode"] == "scenario"
        report = client.get("/api/patients/anna/decline").json()
        assert report["source"] == "synthetic" and report["scenario"] == "withdrawal"
        assert report["level"] == "low" and report["forced"] is True
        assert all(not i.get("forced", False) for i in report["indicators"])
        wellbeing = client.get("/api/patients/anna/wellbeing").json()
        assert wellbeing["indicator"] == "bad"
        assert wellbeing["facts"][0].startswith("time spent outside is at 50%")

        both = client.post("/api/demo/decline", json={"scenario": "withdrawal", "scores": {}})
        assert both.status_code == 400 and both.json()["error"] == "bad_request"
        unknown = client.post("/api/demo/decline", json={"scenario": "unknown"})
        assert unknown.status_code == 400 and unknown.json()["error"] == "unknown_scenario"

        response = client.post("/api/demo/decline", json={"scores": {"hrv": 0.7}})
        assert response.status_code == 200 and response.json()["mode"] == "scores"
        report = client.get("/api/patients/anna/decline").json()
        assert report["scenario"] is None and report["source"] == "data_manager"
        assert report["indicators"][2]["forced"] is True

        assert client.post("/api/demo/decline", json={"scenario": "stress"}).status_code == 200
        cleared = client.delete("/api/demo/decline")
        assert cleared.status_code == 200
        report = client.get("/api/patients/anna/decline").json()
        assert report["scenario"] is None and report["forced"] is False


def test_demo_force_is_pushed_to_connected_app(tmp_path):
    with sensor_client(tmp_path) as client:
        with client.websocket_connect("/ws/app?patient=anna") as app:
            response = client.post("/api/demo/decline")
            assert response.status_code == 200
            pushed = app.receive_json()
            assert pushed["type"] == "voice_context" and pushed["indicator"] == "bad"


def test_hello_receives_active_decline_context(tmp_path):
    with sensor_client(tmp_path) as client:
        assert client.post("/api/demo/decline").status_code == 200
        with client.websocket_connect("/ws/app?patient=anna") as app:
            app.send_json({"type": "hello", "patient_id": "anna"})
            assert app.receive_json()["type"] == "config"
            pushed = app.receive_json()
            assert pushed["type"] == "voice_context" and pushed["indicator"] == "bad"
