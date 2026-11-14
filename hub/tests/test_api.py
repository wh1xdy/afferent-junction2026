import asyncio
import copy
import json
import uuid
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from jsonschema import Draft202012Validator

from afferent_hub.bedside.protocol import format_line, parse_line
from afferent_hub.bedside.simulator import BedsideSimulator
from afferent_hub.main import create_app
from afferent_hub.settings import Settings

ROOT = Path(__file__).resolve().parents[2]
FIX = ROOT / "contracts" / "fixtures"
FORBIDDEN = ("treats", "prevents relapse", "diagnoses", "detects emotions", "hrv", "measures alertness",
             "clinically validated", "\u2014")


def load(name):
    return json.loads((FIX / name).read_text())


def new_session(**over):
    s = load("session_example.json")
    s["session_id"] = str(uuid.uuid4())
    s.update(over)
    return s


def recv_until(ws, mtype, limit=200):
    seen = []
    for _ in range(limit):
        msg = ws.receive_json()
        seen.append(msg.get("type"))
        if msg.get("type") == mtype:
            return msg
    raise AssertionError(f"{mtype} not received, got {seen}")


@pytest.fixture()
def client(tmp_path):
    app = create_app(Settings(db=str(tmp_path / "t.db"), bedside="ws", validation=False))
    with TestClient(app) as c:
        yield c


def test_health_and_roster(client):
    h = client.get("/api/health").json()
    assert h["ok"] and h["patients"] >= 2
    lst = client.get("/api/patients").json()
    ids = [p["id"] for p in lst["patients"]]
    assert {"anna", "mikko"} <= set(ids)
    assert [p["need_rank"] for p in lst["patients"]] == list(range(1, len(ids) + 1))
    order = {"booster": 0, "check_in": 1, "watch": 2, "stable": 3}
    keys = [(order[p["state"]], -(p["composite"] or 0)) for p in lst["patients"]]
    assert keys == sorted(keys)
    assert all(p["simulated"] for p in lst["patients"])


def test_patient_detail_and_analytics(client):
    d = client.get("/api/patients/anna").json()
    assert d["patient"]["now_day"] == 56
    assert d["sessions"] and all("rt_median_ms" in s for s in d["sessions"])
    a = client.get("/api/patients/anna/analytics").json()
    assert a["schema"] == "afferent.analytics/1" and a["now_day"] == 56
    assert client.get("/api/patients/nobody").status_code == 404
    assert client.get("/api/patients/nobody").json()["error"] == "unknown_patient"


def test_schema_validation_rejects(client):
    bad = new_session()
    del bad["device_id"]
    r = client.post("/api/sessions", json=bad)
    assert r.status_code == 422 and r.json()["error"] == "schema_invalid"
    r = client.post("/api/sessions", json={**new_session(), "schema": "afferent.session/2"})
    assert r.status_code == 422
    r = client.post("/api/sessions", json=new_session(patient_id="nobody"))
    assert r.status_code == 404


def test_post_session_updates_analytics_and_daily(client):
    before = client.get("/api/patients/anna").json()
    with client.websocket_connect("/ws/clinic") as clinic:
        assert clinic.receive_json()["type"] == "hello"
        s = new_session(mood_end=1)
        s["core"]["mood_start"] = 1
        s["core"]["rt"]["median_ms"] = 620
        r = client.post("/api/sessions", json=s)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["ok"] and not body["duplicate"] and body["day_index"] == 56
        added = recv_until(clinic, "session_added")
        assert added["session_id"] == s["session_id"] and added["rt_median_ms"] == 620
        upd = recv_until(clinic, "analytics_updated")
        assert upd["patient_id"] == "anna" and upd["row"]["id"] == "anna"
        assert upd["analytics"]["now_day"] == 56
    again = client.post("/api/sessions", json=s).json()
    assert again["duplicate"] is True
    after = client.get("/api/patients/anna").json()
    assert len(after["sessions"]) == len(before["sessions"]) + 1
    assert after["latest_session"]["session_id"] == s["session_id"]
    today = [d for d in after["daily"] if d["day_index"] == 56]
    assert today and today[0]["played"] and s["session_id"] in today[0]["session_ids"]
    v = Draft202012Validator(json.loads((ROOT / "contracts" / "daily.v1.schema.json").read_text()))
    assert list(v.iter_errors(today[0])) == []
    row = next(p for p in client.get("/api/patients").json()["patients"] if p["id"] == "anna")
    assert row["last_session_day"] == 56
    assert any(f["type"] == "low_mood_twice" for f in row["flags"])
    assert client.post("/api/patients/anna/flags/clear").json() == {"ok": True}
    row = next(p for p in client.get("/api/patients").json()["patients"] if p["id"] == "anna")
    assert row["flags"] == []
    assert client.get(f"/api/sessions/{s['session_id']}").json()["day_index"] == 56


def test_declined_session(client):
    doc = {"schema": "afferent.session/3", "session_id": str(uuid.uuid4()), "patient_id": "mikko",
           "device_id": "inst-1", "started_iso": "2026-11-15T22:10:00+02:00", "local_hour": 22.17,
           "status": "declined", "profile": "live", "simulated": False, "sharing": "summary"}
    r = client.post("/api/sessions", json=doc)
    assert r.status_code == 200, r.text


def test_post_daily(client):
    rec = load("daily_example.json")
    rec["patient_id"] = "mikko"
    rec["day_index"] = 56
    assert client.post("/api/daily", json=rec).status_code == 200
    assert client.post("/api/daily", json={"schema": "afferent.daily/1"}).status_code == 422


def test_websocket_relay(client):
    with client.websocket_connect("/ws/clinic") as clinic, \
            client.websocket_connect("/ws/bedside") as bedside, \
            client.websocket_connect("/ws/app") as app:
        assert clinic.receive_json()["type"] == "hello"
        app.send_json({"type": "hello", "device_id": "t", "app_version": "0.3.0", "patient_id": "anna",
                       "profile": "live", "role": "game"})
        cfg = recv_until(app, "config")
        assert cfg["patient_id"] == "anna" and isinstance(cfg["baseline_pulse_bpm"], (int, float))
        assert set(cfg["task_weights"]) >= {"calm", "wake", "fatigue", "rest", "flow"}
        assert abs(sum(cfg["task_weights"]["calm"].values()) - 1) < 0.01

        bedside.send_json({"type": "hello", "device": "unoq", "fw": "test"})
        sid = str(uuid.uuid4())
        app.send_json({"type": "session_start", "session_id": sid, "patient_id": "anna", "clock": "morning",
                       "profile": "live", "simulated": True, "sensors": {}, "t_iso": "2026-11-15T07:41:00+02:00"})
        assert recv_until(clinic, "session_started")["session_id"] == sid
        assert recv_until(app, "config")["type"] == "config"
        rows = client.get("/api/patients").json()["patients"]
        assert next(p for p in rows if p["id"] == "anna")["live_now"] is True

        app.send_json({"type": "live_metrics", "session_id": sid, "patient_id": "anna", "t_ms": 1000,
                       "phase": "game", "pulse_bpm": 74.1, "head_pitch_deg": -8.4, "simulated": True})
        live = recv_until(clinic, "live")
        assert live["pulse_bpm"] == 74.1 and live["patient_id"] == "anna"

        app.send_json({"type": "mode", "session_id": sid, "mode": "calm", "arousal": 1.2, "fatigue": 0.1,
                       "t_ms": 1200})
        assert recv_until(clinic, "mode")["mode"] == "calm"

        app.send_json({"type": "light", "rgb": "#FFC98A", "level": 8, "fade_ms": 2000, "reason": "mode"})
        light = recv_until(bedside, "light")
        while light["rgb"] != "#FFC98A":
            light = recv_until(bedside, "light")
        assert light["level"] == 8
        assert client.get("/api/bedside/state").json()["light"]["rgb"] == "#FFC98A"

        bedside.send_json({"type": "pulse", "bpm": 71.5, "quality": 0.9, "contact": True, "source": "ky039"})
        assert recv_until(app, "pulse")["bpm"] == 71.5
        assert recv_until(clinic, "pulse")["bpm"] == 71.5
        bedside.send_json({"type": "knob", "level": 40})
        assert recv_until(app, "knob")["level"] == 40
        bedside.send_json({"type": "presence", "in_bed": True, "motion": True})
        assert recv_until(clinic, "presence")["in_bed"] is True
        bedside.send_json({"type": "thermo", "temp_c": 20.5, "humidity_pct": 33})
        assert recv_until(app, "thermo")["temp_c"] == 20.5
        state = client.get("/api/bedside/state").json()
        assert state["pulse"]["bpm"] == 71.5 and state["thermo"]["temp_c"] == 20.5 and state["knob"]["level"] == 40

        doc = new_session(session_id=sid)
        app.send_json({"type": "session_end", "session": doc})
        ack = recv_until(app, "ack")
        assert ack["ok"] and ack["session_id"] == sid and ack["day_index"] == 56
        assert recv_until(app, "config")["dawn_level"] == 40
        assert recv_until(clinic, "session_added")["session_id"] == sid
        assert recv_until(clinic, "analytics_updated")["patient_id"] == "anna"
        rows = client.get("/api/patients").json()["patients"]
        assert next(p for p in rows if p["id"] == "anna")["live_now"] is False

        app.send_json({"type": "session_end", **doc})
        assert recv_until(app, "ack")["duplicate"] is True

        app.send_json({"type": "crisis", "patient_id": "anna", "source": "talk_button",
                       "t_iso": "2026-11-15T07:50:00+02:00"})
        assert recv_until(clinic, "crisis_flag")["flag_type"] == "talk_request"

        app.send_json({"type": "crisis", "patient_id": "anna", "source": "weekly_checkin",
                       "t_iso": "2026-11-15T07:52:00+02:00"})
        assert recv_until(clinic, "crisis_flag")["flag_type"] == "weekly_checkin"

        r = client.post("/api/demo/profile", json={"profile": "bad_day", "patient_id": "anna"})
        assert r.json()["sent_to"] == 1
        assert recv_until(app, "profile")["profile"] == "bad_day"


def test_weekly_checkin_flag(client):
    with client.websocket_connect("/ws/clinic") as clinic, client.websocket_connect("/ws/app?patient=anna") as app:
        assert clinic.receive_json()["type"] == "hello"
        app.send_json({"type": "weekly_checkin", "patient_id": "anna", "answers": {"interest": 1, "down": 2, "self_harm": 0},
                       "phq2": 3, "self_harm": 0, "t_iso": "2026-11-15T14:00:00+02:00"})
        app.send_json({"type": "weekly_checkin", "patient_id": "anna", "answers": {"interest": 1, "down": 1, "self_harm": 1},
                       "phq2": 2, "self_harm": 1, "t_iso": "2026-11-15T14:05:00+02:00"})
        flag = recv_until(clinic, "crisis_flag")
        assert flag["flag_type"] == "weekly_checkin" and flag["source"] == "weekly_checkin"
        app.send_json({"type": "crisis", "patient_id": "anna", "source": "weekly_checkin",
                       "t_iso": "2026-11-15T14:05:01+02:00"})
        app.send_json({"type": "ping"})
        recv_until(app, "pong")
    rows = client.get("/api/patients").json()["patients"]
    assert [f["type"] for f in next(p for p in rows if p["id"] == "anna")["flags"]] == ["weekly_checkin"]
    checkins = client.get("/api/patients/anna").json()["checkins"]
    assert [c["phq2"] for c in checkins] == [2, 3] and checkins[0]["self_harm"] == 1


def test_streak_and_freezes():
    from afferent_hub.views import streak

    def run(statuses, declined=()):
        sessions = [{"day_index": d, "status": s} for d, s in enumerate(statuses) if s]
        daily = [{"day_index": d, "declined": True} for d in declined]
        return streak(sessions, daily, len(statuses) - 1)

    ok = "completed"
    assert run([ok] * 6 + [None]) == {"streak": 6, "freezes": 0, "frozen_days": []}
    assert run([ok] * 6 + [None, ok, None]) == {"streak": 1, "freezes": 0, "frozen_days": []}
    assert run([ok] * 7 + [None, "fell_asleep", None])["streak"] == 8
    assert run([ok] * 7 + [None, "fell_asleep", None])["frozen_days"] == [7]
    assert run([ok] * 21 + [None])["freezes"] == 2
    assert run([ok] * 3 + ["declined", None, ok, None], declined=[4])["streak"] == 4
    assert run([ok] * 3 + [None, None, ok, None])["streak"] == 1


def test_privacy(client):
    with client.websocket_connect("/ws/app?patient=anna") as app:
        r = client.post("/api/patients/anna/privacy", json={"sensor": "phone_camera", "on": False})
        assert r.status_code == 200 and r.json()["sensors"]["phone_camera"] is False
        assert recv_until(app, "privacy")["privacy"]["sensors"]["phone_camera"] is False
    r = client.post("/api/patients/anna/privacy", json={"sharing": "paused"})
    assert r.json()["sharing"] == "paused"
    assert client.get("/api/patients/anna").json()["privacy"]["sharing"] == "paused"
    assert client.post("/api/patients/anna/privacy", json={"sensor": "nope", "on": True}).status_code == 400


def test_patient_view_is_gentle(client):
    pv = client.get("/api/patients/anna/patient-view").json()
    assert pv["simulated"] is True and len(pv["week"]) == 7 and pv["week"][-1]["today"]
    text = json.dumps(pv)
    for key in ('"composite"', '"state_label"', '"pulse_bpm"', '"z"'):
        assert key not in text
    numbers = [c["number"] for c in pv["crisis"]["contacts"]]
    assert "112" in numbers and "09 2525 0111" in numbers
    for phrase in FORBIDDEN:
        assert phrase not in text.lower()
    assert len(pv["what_helped"]) <= 3
    assert isinstance(pv["streak"], int) and 0 <= pv["freezes"] <= 2


def test_summary_and_config(client):
    s = client.get("/api/patients/anna/summary").json()
    assert s["text"] and s["source"] in ("gemma", "template") and s["simulated"] is True
    assert "\u2014" not in s["text"]
    cfg = client.get("/api/config/mikko").json()
    assert cfg["type"] == "config" and cfg["measurement_slots"] == {"fork": 1, "lanterns": 3}


def test_demo_reset(client):
    client.post("/api/sessions", json=new_session())
    client.post("/api/bedside/camera", json={"on": True})
    with client.websocket_connect("/ws/clinic") as clinic:
        clinic.receive_json()
        r = client.post("/api/demo/reset", json={"seed": 7}).json()
        assert r["ok"] and "anna" in r["patients"] and r["now_day"] == 56
        recv_until(clinic, "demo_reset")
        recv_until(clinic, "analytics_updated")
    days = [s["day_index"] for s in client.get("/api/patients/anna").json()["sessions"]]
    assert max(days) <= 55
    state = client.get("/api/bedside/state").json()
    assert state["camera_on"] is False and state["knob"]["level"] == 15


def test_static_mounts(client):
    r = client.get("/", follow_redirects=False)
    assert r.status_code in (302, 307) and r.headers["location"] == "/clinic/"
    assert client.get("/app/").status_code == 200
    assert client.get("/app/design/tokens.css").status_code == 200
    assert client.get("/design/tokens.json").status_code == 200
    assert client.get("/contracts/api.md").status_code == 200


def test_protocol_roundtrip():
    assert parse_line("P 72.5 0.9 1") == {"type": "pulse", "bpm": 72.5, "quality": 0.9, "contact": True,
                                          "source": "ky039"}
    assert parse_line("P 0 0 0")["contact"] is False and parse_line("P 0 0 0")["bpm"] is None
    assert parse_line("K turn 42") == {"type": "knob", "level": 42}
    assert parse_line("K press") == {"type": "knob", "press": True}
    assert parse_line("I 1 0") == {"type": "presence", "in_bed": True, "motion": False}
    assert parse_line("T 20.8 31\r\n") == {"type": "thermo", "temp_c": 20.8, "humidity_pct": 31.0}
    assert parse_line("# log line") is None and parse_line("X what") is None and parse_line("P x y z") is None
    assert parse_line("V afferent-unoq-0.1")["fw"] == "afferent-unoq-0.1"
    assert format_line({"type": "light", "rgb": "#FFF3DC", "level": 60, "fade_ms": 4000}) == "L 255 243 220 60 4000"
    assert format_line({"type": "camera", "on": True}) == "C 1"
    assert format_line({"type": "pose"}) is None


def test_simulator_streams():
    async def run():
        events = []

        async def on_event(msg):
            events.append(msg)

        sim = BedsideSimulator(seed=1, pulse=True)
        sim._run = lambda: asyncio.sleep(0)
        await sim.start(on_event)
        sim.set_session_active(True)
        for _ in range(120):
            await sim.step()
        await sim.send({"type": "light", "rgb": "#FFC98A", "level": 15, "fade_ms": 2000})
        sim.set_session_active(False)
        await sim.step()
        await sim.stop()
        return events, sim

    events, sim = asyncio.run(run())
    types = {e["type"] for e in events}
    assert {"hello", "presence", "thermo", "knob", "pulse"} <= types
    pulses = [e for e in events if e["type"] == "pulse" and e["contact"]]
    assert len(pulses) >= 100
    assert all(50 < e["bpm"] < 90 and e["source"] == "simulated" for e in pulses)
    assert events[-1] == {"type": "pulse", "bpm": None, "quality": 0.0, "contact": False, "source": "simulated",
                          "simulated": True}
    assert sim.light["rgb"] == "#FFC98A" and sim.lines_out[-1] == "L 255 201 138 15 2000"
    assert all(19 <= e["temp_c"] <= 22 for e in events if e["type"] == "thermo")


def test_unoq_serial_over_pty():
    import os
    import select
    import termios
    import time
    import tty

    from afferent_hub.bedside.unoq import UnoQSerial

    master, slave = os.openpty()
    tty.setraw(slave, termios.TCSANOW)
    port = os.ttyname(slave)

    def read_master(timeout=3.0):
        buf, end = b"", time.monotonic() + timeout
        while b"\n" not in buf:
            r, _, _ = select.select([master], [], [], 0.1)
            if r:
                buf += os.read(master, 256)
            elif time.monotonic() > end:
                break
        return buf.decode()

    async def run():
        events = []

        async def on_event(msg):
            events.append(msg)

        dev = UnoQSerial(port, reconnect_s=0.2)
        await dev.start(on_event)
        for _ in range(50):
            if dev.connected:
                break
            await asyncio.sleep(0.05)
        assert dev.connected
        status = await asyncio.to_thread(read_master)
        os.write(master, b"V afferent-unoq-0.1\r\n# boot log\nP 72.5 0.9 1\nK press\nI 1 1\nT 20.4 35\n")
        for _ in range(60):
            if len(events) >= 6:
                break
            await asyncio.sleep(0.05)
        await dev.send({"type": "light", "rgb": "#FFC98A", "level": 15, "fade_ms": 4000})
        light = await asyncio.to_thread(read_master)
        await dev.stop()
        return events, status, light

    events, status, light = asyncio.run(run())
    os.close(master)
    os.close(slave)
    assert status.strip() == "S"
    assert light.strip() == "L 255 201 138 15 4000"
    types = [e["type"] for e in events if e["type"] != "status"]
    assert types == ["hello", "pulse", "knob", "presence", "thermo"]
    assert next(e for e in events if e["type"] == "pulse")["bpm"] == 72.5


def test_pose_only_with_camera_on(client):
    pose = {"type": "pose", "keypoints": {"head": [0.5, 0.2], "neck": [0.5, 0.3]}, "trunk_angle_deg": 12.0,
            "quality": 0.8, "simulated": True}
    with client.websocket_connect("/ws/clinic") as clinic, client.websocket_connect("/ws/bedside") as bedside:
        clinic.receive_json()
        bedside.send_json({"type": "hello", "device": "jetson_pose", "fw": "t"})
        assert recv_until(bedside, "camera")["on"] is False
        bedside.send_json(pose)
        assert client.post("/api/bedside/camera", json={"on": True}).json()["camera_on"] is True
        assert recv_until(bedside, "camera")["on"] is True
        bedside.send_json(pose)
        got = recv_until(clinic, "pose")
        assert got["patient_id"] == "anna" and got["trunk_angle_deg"] == 12.0
