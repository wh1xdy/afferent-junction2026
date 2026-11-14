import asyncio
import copy
import json
import uuid
from pathlib import Path

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
        assert added == {"type": "session_added", "patient_id": "anna", "session_id": s["session_id"],
                         "day_index": 56, "status": s["status"]}
        upd = recv_until(clinic, "analytics_updated")
        assert upd["patient_id"] == "anna" and upd["row"]["id"] == "anna"
        assert set(upd) == {"type", "patient_id", "row"}
    assert client.get("/api/patients/anna/analytics").json()["now_day"] == 56
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
    assert not any(f["type"] == "low_mood_twice" for f in row["flags"])
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

        app.send_json({"type": "light", "rgb": "#FFC98A", "level": 8, "fade_ms": 2000, "reason": "mode"})
        light = recv_until(bedside, "light")
        while light["rgb"] != "#FFC98A":
            light = recv_until(bedside, "light")
        assert light["level"] == 8
        assert client.get("/api/bedside/state").json()["light"]["rgb"] == "#FFC98A"

        bedside.send_json({"type": "pulse", "bpm": 71.5, "quality": 0.9, "contact": True, "source": "ky039"})
        assert recv_until(app, "pulse")["bpm"] == 71.5
        bedside.send_json({"type": "knob", "level": 40})
        assert recv_until(app, "knob")["level"] == 40
        bedside.send_json({"type": "presence", "in_bed": True, "motion": True})
        bedside.send_json({"type": "thermo", "temp_c": 20.5, "humidity_pct": 33})
        bedside.send_json({"type": "ping"})
        recv_until(bedside, "pong")
        state = client.get("/api/bedside/state").json()
        assert state["thermo"]["temp_c"] == 20.5 and state["knob"]["level"] == 40
        assert state["presence"]["in_bed"] is True
        assert "pulse" not in state and "physio" not in state
        assert client.app.state.hub.bedside.state["pulse"]["bpm"] == 71.5

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

        r = client.post("/api/demo/profile", json={"profile": "bad_day", "patient_id": "anna"})
        assert r.json()["sent_to"] == 1
        assert recv_until(app, "profile")["profile"] == "bad_day"

def checkin_doc(item9, tier, source, total, **over):
    items = {f"phq9_{i}": 1 for i in range(1, 9)} | {"phq9_9": item9}
    doc = {"schema": "afferent.checkin/1", "checkin_id": str(uuid.uuid4()), "patient_id": "anna",
           "device_id": "inst-1", "app_version": "0.3.0", "started_iso": "2026-11-15T12:00:00+02:00",
           "completed_iso": "2026-11-15T12:02:00+02:00", "status": "completed", "trigger": "schedule", "early": False,
           "language": "en", "phq9": {"items": items, "total": total, "phq8_total": 8, "band": "moderate"},
           "cssrs": {"asked": False, "reason": "not_licensed", "items": {}, "tier": None, "c6_repeat": False},
           "safety": {"tier": tier, "item9": item9, "source": source, "screen": "crisis", "shared": True}}
    return doc | over

def test_checkin_flags_ack_and_firewall(client, monkeypatch):
    first = checkin_doc(2, "moderate", "item9_fallback", 10)
    second = checkin_doc(0, "none", "item9_fallback", 8, started_iso="2026-11-16T12:00:00+02:00",
                         completed_iso="2026-11-16T12:02:00+02:00")
    with client.websocket_connect("/ws/clinic") as clinic, client.websocket_connect("/ws/app?patient=anna") as app:
        assert clinic.receive_json()["type"] == "hello"
        app.send_json({"type": "hello", "patient_id": "anna"})
        cfg = recv_until(app, "config")
        assert set(cfg["checkin"]) >= {"enabled", "cadence_days", "always_ask_cssrs", "cssrs_licensed",
                                       "protocol_signed", "early_request"}
        assert cfg["checkin"]["cadence_days"] == 14 and set(cfg["clinic_contact"]) == {"name", "number", "hours"}
        for doc in (first, first, second):
            app.send_json({"type": "checkin", "patient_id": "anna", "checkin": doc})
        acks = [recv_until(app, "ack") for _ in range(3)]
        assert [(a["checkin_id"], a["ok"], a["duplicate"]) for a in acks] == [
            (first["checkin_id"], True, False), (first["checkin_id"], True, True), (second["checkin_id"], True, False)]
        flag = recv_until(clinic, "crisis_flag")
        assert flag["flag_type"] == "safety_moderate" and flag["label"] == "C-SSRS not asked; tier from item 9"
        app.send_json({"type": "checkin", "checkin": {"checkin_id": "x"}})
        assert recv_until(app, "ack")["ok"] is False
        app.send_json({"type": "weekly_checkin", "patient_id": "anna", "answers": {"self_harm": 3}})
        app.send_json({"type": "ping"})
        recv_until(app, "pong")
    row = next(p for p in client.get("/api/patients").json()["patients"] if p["id"] == "anna")
    assert [f["type"] for f in row["flags"]] == ["safety_moderate"]
    d = client.get("/api/patients/anna").json()
    assert len(d["checkins"]) == 2
    assert (d["phq"]["total"], d["phq"]["phq8_total"], d["phq"]["band"]) == (8, 8, "moderate")
    assert [h["total"] for h in d["phq"]["history"]] == [10, 8]

    seen = []
    from afferent_hub import modules
    real = modules.fn["weekly_summary"]
    monkeypatch.setitem(modules.fn, "weekly_summary", lambda a, p, r: seen.append((a, p)) or real(a, p, r))
    client.get("/api/patients/anna/summary?refresh=1")
    text = json.dumps(seen)
    assert seen and not any(k in text for k in ('"phq9_9"', '"cssrs"', '"safety"'))

    import io, zipfile
    z = zipfile.ZipFile(io.BytesIO(client.get("/api/patients/anna/export").content))
    lines = z.read("checkins.ndjson").decode().splitlines()
    assert [json.loads(x)["checkin_id"] for x in lines] == [first["checkin_id"], second["checkin_id"]]
    assert "safety.tier" in z.read("checkins.csv").decode().splitlines()[0]

def run_streak(statuses, declined=(), pauses=None):
    from afferent_hub.views import streak

    sessions = [{"day_index": d, "status": s} for d, s in enumerate(statuses) if s]
    daily = [{"day_index": d, "declined": True} for d in declined]
    return streak(sessions, daily, len(statuses) - 1, pauses)

def test_streak_and_freezes():
    ok = "completed"
    st = run_streak([ok] * 6 + [None])
    assert (st["streak"], st["freezes"], st["mornings_lit"], st["frozen_days"]) == (6, 2, 6, [])
    assert run_streak([ok])["streak"] is None and run_streak([ok])["freezes"] == 2
    st = run_streak([ok] * 6 + [None, ok, None])
    assert (st["streak"], st["freezes"], st["frozen_days"]) == (7, 2, [6])
    assert run_streak([ok] * 2 + [None] * 6 + [ok, None])["streak"] is None
    assert run_streak(["fell_asleep"] * 21 + [None])["freezes"] == 2
    assert run_streak([ok] * 3 + ["declined", None, ok, None], declined=[4])["streak"] == 4
    assert run_streak([ok] * 3 + [None] * 5 + [ok, None])["streak"] == 4
    assert run_streak([ok] * 3 + [None] * 6 + [ok, ok, None])["streak"] == 2
    paused = run_streak([ok] * 3 + [None] * 10 + [ok, None], pauses=[{"source": "patient", "from_day": 3, "until_day": 12}])
    assert (paused["streak"], paused["freezes"], paused["states"][5]) == (4, 2, "rest")

def test_streak_worked_example():
    ok, no = "completed", None
    st = run_streak([ok, ok, "declined", no, ok, no, no, no, ok, ok, ok, ok] + [no] * 5 + [ok, no])
    assert st["frozen_days"] == [3, 5, 12] and st["repaired_days"] == [6, 7]
    assert [st["by_day"][d]["streak_len"] for d in (1, 2, 3, 4, 7, 8, 11, 16, 17)] == [2, 2, 2, 3, 3, 4, 7, 0, 1]
    assert st["by_day"][7]["repair_active"] and not st["by_day"][8]["repair_active"]
    assert (st["streak"], st["mornings_lit"], st["freezes"]) == (None, 8, 0)
    assert [st["states"][d] for d in (2, 3, 6, 8, 18)] == ["rest", "frozen", "missed", "lit", "today"]

def test_streak_firewall():
    import random
    from afferent_hub.views import annotate_daily, streak

    rng = random.Random(3)
    statuses = ["completed", "partial", None, "fell_asleep", "declined", None, None, "partial", "completed", None]

    def sessions(variant):
        out = []
        for d, status in enumerate(statuses):
            if not status:
                continue
            s = new_session(day_index=d, status=status)
            s["core"]["mood_start"] = rng.randint(1, 5)
            s["mood_end"] = rng.choice([None, 1, 3, 5])
            for t in s["core"]["rt"]["trials"]:
                t["rt_ms"] = rng.randint(90, 1400)
            s["core"]["rt"]["median_ms"] = rng.randint(250, 900)
            s["core"]["rt"]["valid"] = rng.random() < 0.5
            for c in s["fork"]["choices"]:
                c["path"] = rng.choice(["hard", "easy"])
            s["fork"]["hard_prop"] = rng.random()
            for t in s["two_lanterns"]["trials"]:
                t["response"], t["rewarded"] = rng.choice(["rich", "lean", None]), rng.random() < 0.5
            s["pre_post"] = {"variant": variant}
            out.append(s)
        return out

    def outcome(variant):
        st = streak(sessions(variant), [], len(statuses) - 1)
        return st, annotate_daily([{"day_index": d} for d in range(len(statuses))], st, [], {"tms_end_date": "2026-09-20"})

    first = outcome(0)
    assert first[0]["mornings_lit"] == 5
    for v in range(1, 6):
        assert outcome(v) == first

def test_pause_and_export(client):
    import io
    import zipfile

    pv = client.get("/api/patients/anna/patient-view").json()
    today = pv["date"]
    r = client.post("/api/patients/anna/pause", json={"source": "patient", "until": "2027-03-01"}).json()
    assert r["pause"]["source"] == "patient" and r["pause"]["until"] < "2026-12-01"
    pv = client.get("/api/patients/anna/patient-view").json()
    assert pv["week"][-1]["state"] in ("rest", "lit") and pv["pause"]["source"] == "patient"
    assert client.post("/api/patients/anna/pause", json={"until": None}).json()["pause"] is None
    assert client.post("/api/patients/anna/pause", json={"source": "nurse"}).status_code == 400
    r = client.post("/api/patients/anna/pause", json={"source": "clinician", "from": pv["week"][0]["date"],
                                                      "until": pv["week"][2]["date"]}).json()
    daily = {d["day_index"]: d for d in client.get("/api/patients/anna").json()["daily"]}
    assert daily[pv["week"][1]["day"]]["pause_source"] == "clinician"
    assert {d["state"] for d in client.get("/api/patients/anna/patient-view").json()["week"][:3]} <= {"rest", "lit"}
    assert all(set(d) >= {"streak_protection", "streak_len", "freezes_held", "repair_active"} for d in daily.values())

    r = client.get("/api/patients/anna/export")
    assert r.status_code == 200 and r.headers["content-type"] == "application/zip"
    assert "SIMULATED_afferent_anna_" in r.headers["content-disposition"] and today in r.headers["content-disposition"]
    z = zipfile.ZipFile(io.BytesIO(r.content))
    assert {"README.txt", "manifest.json", "sessions.ndjson", "daily.csv", "features.csv", "codebook.csv",
            "session.v3.schema.json", "checkin.v1.schema.json"} <= set(z.namelist())
    assert z.read("README.txt").decode().startswith("SIMULATED DATA.")
    header = z.read("daily.csv").decode().splitlines()[0].split(",")
    assert {"streak_protection", "pause_source", "pause_until", "simulated", "missed"} <= set(header)
    feat_header = z.read("features.csv").decode().splitlines()[0]
    assert "rt_median.z" in feat_header and "game_rt_norm.value" in feat_header
    first = json.loads(z.read("sessions.ndjson").decode().splitlines()[0])
    assert first["schema"] == "afferent.session/3" and "simulated" in first
    cols = {row.split(",")[1] for row in z.read("codebook.csv").decode().splitlines()[1:]}
    assert set(header) <= cols

def test_privacy(client):
    with client.websocket_connect("/ws/app?patient=anna") as app:
        r = client.post("/api/patients/anna/privacy", json={"sensor": "phone_camera", "on": False})
        assert r.status_code == 200 and r.json()["sensors"]["phone_camera"] is False
        assert recv_until(app, "privacy")["privacy"]["sensors"]["phone_camera"] is False
    r = client.post("/api/patients/anna/privacy", json={"sharing": "paused"})
    assert r.json()["sharing"] == "paused"
    assert client.get("/api/patients/anna").json()["privacy"]["sharing"] == "paused"
    assert client.post("/api/patients/anna/privacy", json={"sensor": "nope", "on": True}).status_code == 400

def test_no_bed_sensor_is_claimed(client):
    privacy = client.get("/api/patients/anna").json()["privacy"]
    assert privacy["sensors"]["presence"] is False
    assert client.post("/api/patients/anna/privacy", json={"sensor": "presence", "on": True}).status_code == 400
    assert client.get("/api/patients/anna").json()["privacy"]["sensors"]["presence"] is False
    view = client.get("/api/patients/anna/patient-view").json()
    rows = {s["id"]: s for s in view["privacy"]["sensors"]}
    assert "presence" not in rows
    assert rows["bedside_light"]["shares"] == "Nothing. It is one small LED on the bedside unit and only receives colours."
    shown = [t for s in rows.values() for t in (s["label"], s["shares"])] + view["clinic_sees"]
    for text in shown:
        low = text.lower().replace("no bed sensor", "")
        for claim in ("bed sensor", "bed presence", "time in bed", "lamp", "room"):
            assert claim not in low, text
    fixture = load("patient_view_anna.json")
    assert view["privacy"]["sensors"] == fixture["privacy"]["sensors"] and view["clinic_sees"] == fixture["clinic_sees"]

def test_bed_presence_stored_on_stays_off(tmp_path):
    settings = dict(db=str(tmp_path / "t.db"), bedside="ws", validation=False)
    with TestClient(create_app(Settings(**settings))) as c:
        old = copy.deepcopy(c.app.state.hub.store.privacy("anna"))
        old["sensors"]["presence"] = True
        c.app.state.hub.store.put_privacy("anna", old)
    with TestClient(create_app(Settings(**settings))) as c:
        assert c.app.state.hub.store.privacy("anna")["sensors"]["presence"] is True
        assert c.get("/api/patients/anna").json()["privacy"]["sensors"]["presence"] is False
        with c.websocket_connect("/ws/app?patient=anna") as app:
            app.send_json({"type": "hello", "device_id": "t", "app_version": "t", "patient_id": "anna", "role": "game"})
            assert recv_until(app, "config")["privacy"]["sensors"]["presence"] is False
            r = c.post("/api/patients/anna/privacy", json={"sensor": "phone_camera", "on": False})
            assert r.status_code == 200 and r.json()["sensors"]["presence"] is False
            assert recv_until(app, "privacy")["privacy"]["sensors"]["presence"] is False
        assert c.app.state.hub.store.privacy("anna")["sensors"]["presence"] is False, "the next change writes it back"
        assert c.post("/api/patients/anna/privacy", json={"sensor": "presence", "on": True}).status_code == 400
        assert c.get("/api/patients/anna").json()["privacy"]["sensors"]["presence"] is False

def test_no_example_or_seeded_session_has_bed_presence_on(client):
    for name in ("session_example.json", "session_finger_example.json"):
        assert load(name)["sensors"]["presence"] is False, name
    store = client.app.state.hub.store
    switches = [s["sensors"] for p in store.patients() for s in store.sessions(p["id"]) if "sensors" in s]
    assert switches and all(sw["presence"] is False for sw in switches)

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
    assert (pv["streak"] is None or pv["streak"] >= 2) and 0 <= pv["freezes"] <= 2
    assert isinstance(pv["mornings_lit"], int) and pv["mornings_lit"] > 0
    assert {d["state"] for d in pv["week"]} <= {"lit", "missed", "frozen", "rest", "today"}

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
    assert client.get("/contracts/session.v3.schema.json").status_code == 200

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

def test_bedside_camera(client):
    with client.websocket_connect("/ws/bedside") as bedside:
        bedside.send_json({"type": "hello", "device": "jetson_pose", "fw": "t"})
        assert recv_until(bedside, "camera")["on"] is False
        assert client.post("/api/bedside/camera", json={"on": True}).json()["camera_on"] is True
        assert recv_until(bedside, "camera")["on"] is True

def test_export_publish_roundtrip(client):
    assert client.get("/api/export/dashboard").status_code == 404
    html = "<!doctype html><title>anna</title><p>dashboard</p>"
    r = client.post("/api/export/publish", json={"patient_id": "anna", "html": html})
    assert r.status_code == 200 and r.json()["url"] == "/api/export/dashboard"
    page = client.get("/api/export/dashboard")
    assert page.status_code == 200 and "text/html" in page.headers["content-type"]
    assert page.text == html
    assert client.post("/api/export/publish", json={"patient_id": "anna"}).status_code == 400
    assert client.post("/api/export/publish", json=[]).status_code == 400
