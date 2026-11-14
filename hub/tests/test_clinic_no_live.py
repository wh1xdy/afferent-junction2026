"""No sensor number reaches a clinic socket, neither a current one nor a stored one.

The hub gets current sensor values from two sides: the bedside source (finger clips on the UNO Q) and the
phone's live_metrics during a session. Both stay between the patient's devices. A clinic socket gets
events that say which stored document changed, and nothing of its content: the dashboard on the patient's
own hub then reads the stored documents over HTTP (GET /api/patients/:id and /api/patients/:id/analytics).

The streamed values below are chosen so that they occur nowhere in the stored data: if one of them shows
up in a clinic message, it was relayed. The stored session has its own values (STORED_VALUES): if one of
those shows up, the hub pushed the content of a session that ended a moment before.

The current reading the hub keeps for the phone (GET /api/bedside/state) is served to the hub's own
machine only.
"""
import json
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
FIX = ROOT / "contracts" / "fixtures"

CLINIC_TYPES = {"hello", "session_started", "session_interrupted", "session_added", "daily_added", "checkin_added",
                "analytics_updated", "crisis_flag", "privacy", "demo_reset", "pong", "error"}
LIVE_KEYS = {"physio", "camera_pulse", "live_metrics", "finger_bpm", "finger_sources", "breathing_snr_db",
             "rmssd_baseline_ms", "quality_reported", "pulse_quality", "trust_score"}
LIVE_VALUES = ("137.7", "138.3", "139.9", "23.7", "87.7", "91.3", "141.7", "0.1377", "-33.7", "0.6177")
STORED_KEYS = {"pre_post", "vitals", "analytics", "series", "finger", "hrv", "breathing", "pulse", "pulse_bpm",
               "rmssd_ms", "rt_median_ms", "mood_start", "mood_end", "core", "tasks", "signal"}
STORED_VALUES = ("79.4", "72.4", "73.9", "74.3", "73.2", "10.9", "41.4", "46.2", "75.1")
ROW_KEYS = {"id", "display_name", "kind", "simulated", "day_index", "weeks_since_tms", "state", "state_label",
            "state_since_day", "composite", "composite_trend_7d", "cusum", "top_contributors", "last_session_day",
            "last_session_iso", "live_now", "missed_7d", "sessions_7d", "completeness", "confidence", "sparkline",
            "flags", "need_rank"}

PHYSIO = {"type": "physio", "source": "finger_ppg", "transport": "hub_http", "simulated": False, "pulse_bpm": 137.7,
          "quality": 0.6177, "quality_reported": True, "contact": True, "finger_bpm": [138.3, 139.9],
          "finger_sources": [0, 1], "breathing_per_min": 23.7, "breathing_snr_db": 3.1, "rmssd_ms": 87.7,
          "sdnn_ms": 91.3, "rmssd_baseline_ms": 45, "rmssd_vs_baseline": -0.08, "presence": "active", "age_s": 0.4}


def keys(obj):
    if isinstance(obj, dict):
        for k, v in obj.items():
            yield k
            yield from keys(v)
    elif isinstance(obj, list):
        for v in obj:
            yield from keys(v)


def recv_until(ws, mtype, limit=200):
    seen = []
    for _ in range(limit):
        msg = ws.receive_json()
        seen.append(msg)
        if msg.get("type") == mtype:
            return seen
    raise AssertionError(f"{mtype} not received, got {[m.get('type') for m in seen]}")


def real_finger_session(session_id):
    doc = json.loads((FIX / "session_finger_example.json").read_text())
    doc.update(session_id=session_id, simulated=False, simulated_fields=[])
    doc["signal"]["pulse_source"] = doc["vitals"]["pulse_source"] = "finger_ppg"
    for block in ("finger", "breathing", "hrv"):
        doc["vitals"][block]["source"] = "finger_ppg"
    text = json.dumps(doc)
    assert not [v for v in LIVE_VALUES if v in text]
    assert doc["pre_post"]["pulse"] == {"start": 79.4, "end": 72.4, "delta": -7.0}
    assert not [v for v in STORED_VALUES if v not in text]
    return doc


def test_a_clinic_socket_sees_no_sensor_value_while_the_devices_stream(client):
    sid = str(uuid.uuid4())
    with client.websocket_connect("/ws/clinic") as clinic, \
            client.websocket_connect("/ws/bedside") as bedside, \
            client.websocket_connect("/ws/app?patient=anna") as app:
        seen = [clinic.receive_json()]
        assert seen[0]["type"] == "hello"

        bedside.send_json({"type": "hello", "device": "unoq", "fw": "test"})
        bedside.send_json({"type": "pulse", "bpm": 137.7, "quality": 0.6177, "contact": True, "source": "finger_ppg"})
        bedside.send_json({"type": "presence", "in_bed": True, "motion": True})
        bedside.send_json({"type": "knob", "level": 40})
        bedside.send_json(PHYSIO)
        got = recv_until(app, "physio")[-1]
        assert got["pulse_bpm"] == 137.7 and got["rmssd_ms"] == 87.7

        app.send_json({"type": "hello", "patient_id": "anna"})
        app.send_json({"type": "session_start", "session_id": sid, "patient_id": "anna", "profile": "live",
                       "simulated": False})
        for t_ms in (500, 1000, 1500):
            app.send_json({"type": "live_metrics", "session_id": sid, "patient_id": "anna", "t_ms": t_ms, "phase": "game",
                           "pulse_bpm": 137.7, "pulse_quality": 0.6177, "pulse_source": "finger_ppg",
                           "eye_openness": 0.1377, "perclos": 0.1377, "head_pitch_deg": -33.7, "simulated": False,
                           "physio": {k: v for k, v in PHYSIO.items() if k != "type"},
                           "camera_pulse": {"source": "rppg", "bpm": 141.7, "trust_score": 82, "trust_label": "reliable",
                                            "age_s": 0.9}})
        app.send_json({"type": "ping"})
        recv_until(app, "pong")
        app.send_json({"type": "session_end", "session": real_finger_session(sid)})
        ack = recv_until(app, "ack")[-1]
        assert ack["ok"] is True, ack

        assert client.post("/api/patients/anna/privacy", json={"sharing": "paused"}).status_code == 200
        seen += recv_until(clinic, "privacy")

    types = [m["type"] for m in seen]
    assert set(types) <= CLINIC_TYPES, types
    assert {"session_started", "session_added", "analytics_updated"} <= set(types), types
    for m in seen:
        assert not LIVE_KEYS & set(keys(m)), (m["type"], LIVE_KEYS & set(keys(m)))
        text = json.dumps(m)
        assert not [v for v in LIVE_VALUES if v in text], (m["type"], [v for v in LIVE_VALUES if v in text])

    # the stored session is there for the dashboard to read, with its numbers
    stored = client.get("/api/patients/anna").json()["sessions"][-1]
    assert stored["session_id"] == sid
    assert stored["vitals"]["finger"]["source"] == "finger_ppg"
    assert stored["vitals"]["hrv"]["rmssd_ms"]["mean"] == 41.4
    assert stored["pre_post"]["pulse"]["start"] == 79.4
    analytics = client.get("/api/patients/anna/analytics").json()
    assert any(v in json.dumps(analytics) for v in STORED_VALUES), "the analytics object does hold session numbers"

    # and no socket message carries any of it
    added = [m for m in seen if m["type"] == "session_added"]
    assert added == [{"type": "session_added", "patient_id": "anna", "session_id": sid,
                      "day_index": stored["day_index"], "status": stored["status"]}]
    updates = [m for m in seen if m["type"] == "analytics_updated"]
    assert updates
    for m in updates:
        assert set(m) == {"type", "patient_id", "row"}, sorted(m)
        assert set(m["row"]) == ROW_KEYS, sorted(set(m["row"]) ^ ROW_KEYS)
    for m in seen:
        assert not STORED_KEYS & set(keys(m)), (m["type"], STORED_KEYS & set(keys(m)))
        if m["type"] != "hello":
            text = json.dumps(m)
            assert not [v for v in STORED_VALUES if v in text], (m["type"], [v for v in STORED_VALUES if v in text])


def test_the_two_session_end_messages_are_built_without_session_content():
    import inspect

    from afferent_hub import views
    from afferent_hub.service import Hub
    doc = real_finger_session(str(uuid.uuid4()))
    assert views.session_added(doc) == {"type": "session_added", "patient_id": "anna", "session_id": doc["session_id"],
                                        "day_index": doc.get("day_index"), "status": "completed"}
    src = inspect.getsource(Hub.broadcast_analytics)
    assert '"row"' in src and '"analytics"' not in src and "sessions" not in src


def bedside_reading(client):
    with client.websocket_connect("/ws/bedside") as bedside:
        bedside.send_json({"type": "hello", "device": "unoq", "fw": "test"})
        bedside.send_json({"type": "pulse", "bpm": 137.7, "quality": 0.6177, "contact": True, "source": "finger_ppg"})
        bedside.send_json(PHYSIO)
        bedside.send_json({"type": "thermo", "temp_c": 20.5, "humidity_pct": 33})
        bedside.send_json({"type": "knob", "level": 40})
        bedside.send_json({"type": "ping"})
        recv_until(bedside, "pong")
    state = client.app.state.hub.bedside.state
    assert state["pulse"]["bpm"] == 137.7 and state["physio"]["rmssd_ms"] == 87.7


def test_the_current_reading_is_served_to_the_hubs_own_machine_only(client):
    from fastapi.testclient import TestClient
    bedside_reading(client)
    for host in ("testclient", "192.168.50.20", "10.0.0.7", "::ffff:192.168.50.20", "fe80::1", ""):
        r = TestClient(client.app, client=(host, 50000)).get("/api/bedside/state")
        assert r.status_code == 200
        state = r.json()
        assert "pulse" not in state and "physio" not in state, host
        assert not LIVE_KEYS & set(keys(state)), host
        assert not [v for v in LIVE_VALUES if v in r.text], host
        assert state["thermo"]["temp_c"] == 20.5 and state["knob"]["level"] == 40 and "light" in state, host
        assert "connected" in state and state["patient_id"] == "anna"
    for host in ("127.0.0.1", "::1", "::ffff:127.0.0.1"):
        state = TestClient(client.app, client=(host, 50000)).get("/api/bedside/state").json()
        assert state["pulse"]["bpm"] == 137.7 and state["physio"]["rmssd_ms"] == 87.7, host
        assert state["physio"]["finger_bpm"] == [138.3, 139.9]


def test_the_hub_has_no_handler_that_forwards_live_metrics():
    src = (ROOT / "hub" / "afferent_hub" / "service.py").read_text()
    assert "live_metrics" not in src
    for word in ('"physio"', '"pulse"', "'physio'", "'pulse'"):
        assert word not in src, word
    ws = (ROOT / "hub" / "afferent_hub" / "ws" / "routes.py").read_text()
    clinic = ws[ws.index('@router.websocket("/ws/clinic")'):ws.index('@router.websocket("/ws/bedside")')]
    assert "bedside" not in clinic and "physio" not in clinic
    controller = (ROOT / "hub" / "afferent_hub" / "bedside" / "controller.py").read_text()
    assert "to_clinic" not in controller and '"clinic"' not in controller
