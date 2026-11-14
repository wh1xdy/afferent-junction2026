"""The home hub entry point (afferent_hub.home): a real patient next to the labelled demo roster,
kept out of the clinic view, behind the hub token, and the data manager read with its bearer token.

The data manager here is jetson/data_manager/app.py from this repo, started with API_TOKEN set, the
same way it runs on the Jetson. No device is involved.
"""
import asyncio
import datetime as dt
import json
import logging
import os
import shutil
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request
import uuid
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from afferent_hub import home, modules
from afferent_hub.main import create_app
from afferent_hub.settings import Settings

from test_api import checkin_doc

ROOT = Path(__file__).resolve().parents[2]
FIX = ROOT / "contracts" / "fixtures"
TOKEN = "test-token-" + uuid.uuid4().hex
HUB_TOKEN = "hub-" + uuid.uuid4().hex
BASE = "http://127.0.0.1:8000"
DEMO = {"mikko", "juha", "leena", "sofia", "eero"}
STATES = {"stable", "watch", "check_in", "booster"}


@pytest.fixture(autouse=True)
def restore_modules(monkeypatch):
    for name in ("demo_roster", "analyze_patient"):
        monkeypatch.setitem(modules.fn, name, modules.fn[name])


def settings(tmp_path, **over):
    return Settings(db=str(tmp_path / "home.db"), bedside="ws", validation=False, **over)


def home_app(s, env=None, **kw):
    # the test client opens WebSockets as ws://testserver, so that name is allowed here
    return home.create_home_app(s, {"AFFERENT_HUB_TOKEN": HUB_TOKEN, "AFFERENT_HUB_HOSTS": "testserver", **(env or {})},
                                **kw)


def paired(app, **kw):
    return TestClient(app, base_url=BASE, headers={"Authorization": f"Bearer {HUB_TOKEN}"}, **kw)


def stranger(app, **kw):
    return TestClient(app, base_url=BASE, **kw)


def real_session(**over):
    s = json.loads((FIX / "session_example.json").read_text())
    s.update(session_id=str(uuid.uuid4()), simulated=False, simulated_fields=[], **over)
    return s


def test_real_patient_is_empty_and_real_and_the_roster_is_labelled(tmp_path):
    env = {"AFFERENT_HOME_PATIENT_NAME": "Test Person", "AFFERENT_HOME_TMS_END": "2026-11-01"}
    with paired(home_app(settings(tmp_path), env)) as c:
        lst = c.get("/api/patients").json()
        rows = {p["id"]: p for p in lst["patients"]}
        assert set(rows) == DEMO                            # the clinic list never holds the real patient
        assert all(rows[pid]["simulated"] is True for pid in DEMO) and lst["simulated"] is True
        assert sorted(r["need_rank"] for r in rows.values()) == [1, 2, 3, 4, 5]
        assert lst["now_day"] == rows["mikko"]["day_index"] > 0     # the day of the listed patients, not anna's

        d = c.get("/api/patients/anna").json()
        assert d["patient"]["display_name"] == "Test Person"
        assert d["patient"]["tms_end_date"] == "2026-11-01" and d["patient"]["simulated"] is False
        assert d["sessions"] == [] and d["daily"] == [] and d["checkins"] == [] and d["latest_session"] is None
        assert c.get("/api/patients/anna/analytics").json()["simulated"] is False
        assert c.get("/api/patients/anna/patient-view").json()["simulated"] is False
        assert c.get("/api/config/anna").json()["simulated_patient"] is False

        for pid in DEMO:
            d = c.get(f"/api/patients/{pid}").json()
            assert d["patient"]["simulated"] is True and d["sessions"]
            assert all(s["simulated"] is True for s in d["sessions"])
            assert all(day["simulated"] is True for day in d["daily"])
            assert c.get(f"/api/patients/{pid}/patient-view").json()["simulated"] is True


def test_real_session_stays_real_survives_a_restart_and_the_reset_is_refused(tmp_path):
    s = settings(tmp_path)
    doc = real_session()
    with paired(home_app(s)) as c:
        assert c.post("/api/sessions", json=doc).json()["ok"] is True
        r = c.post("/api/demo/reset", json={})
        assert r.status_code == 403 and r.json()["error"] == "reset_disabled"
        assert c.post("/api/demo/reset/").status_code == 403
        r = c.post("/api/demo/profile", json={"patient_id": "anna", "profile": "bad_day"})
        assert r.status_code == 403 and r.json()["error"] == "profile_disabled"
    with paired(home_app(s)) as c:
        d = c.get("/api/patients/anna").json()
        assert [x["session_id"] for x in d["sessions"]] == [doc["session_id"]]
        assert d["sessions"][0]["simulated"] is False and d["patient"]["simulated"] is False
        assert [day["simulated"] for day in d["daily"]] == [False]
        assert d["daily"][0]["simulated_fields"] == []
        assert c.get("/api/patients/anna/analytics").json()["simulated"] is False
        assert {p["id"] for p in c.get("/api/patients").json()["patients"]} == DEMO


def test_real_patient_only(tmp_path):
    with paired(home_app(settings(tmp_path), {"AFFERENT_HOME_DEMO_ROSTER": "0"})) as c:
        lst = c.get("/api/patients").json()
        assert lst["patients"] == [] and lst["simulated"] is False and lst["date"] is None
        assert c.get("/api/health").json()["patients"] == 1
        assert c.get("/api/patients/anna").json()["patient"]["simulated"] is False


def test_switching_the_roster_off_removes_the_simulated_patients_and_keeps_the_real_data(tmp_path):
    s = settings(tmp_path)
    doc = real_session()
    with paired(home_app(s)) as c:
        assert c.get("/api/health").json()["patients"] == 6
        assert c.post("/api/sessions", json=doc).json()["ok"] is True
    with paired(home_app(s, {"AFFERENT_HOME_DEMO_ROSTER": "0"})) as c:
        assert c.get("/api/health").json()["patients"] == 1
        assert c.get("/api/patients").json()["patients"] == []
        assert c.get("/api/patients/mikko").status_code == 404
        d = c.get("/api/patients/anna").json()
        assert [x["session_id"] for x in d["sessions"]] == [doc["session_id"]] and len(d["daily"]) == 1
        store = c.app.state.hub.store
        assert {r[0] for t in ("sessions", "daily", "privacy", "analytics_cache")
                for r in store._db.execute(f"SELECT patient_id FROM {t}").fetchall()} == {"anna"}
    with paired(home_app(s)) as c:                          # switched on again: nothing is seeded over real data
        assert c.get("/api/health").json()["patients"] == 1


def test_another_patient_id_keeps_the_whole_roster(tmp_path):
    with paired(home_app(settings(tmp_path, bound_patient="home"))) as c:
        rows = {p["id"]: p["simulated"] for p in c.get("/api/patients").json()["patients"]}
        assert rows == {"anna": True, **{pid: True for pid in DEMO}}
        assert c.get("/api/patients/home").json()["patient"]["simulated"] is False
        assert c.get("/api/bedside/state").json()["patient_id"] == "home"
        assert c.get("/api/patients/home").json()["patient"]["tms_end_date"] == dt.date.today().isoformat()


def test_roster_never_generates_data_for_the_real_patient(tmp_path):
    s = settings(tmp_path)
    roster = home.home_roster(s, {})(seed=7)
    assert roster[0] == {"patient": home.real_patient(s, {}), "sessions": [], "daily": []}
    assert [r["patient"]["id"] for r in roster].count("anna") == 1
    assert all(r["patient"]["simulated"] is True for r in roster[1:])
    with pytest.raises(ValueError):
        home.real_patient(s, {"AFFERENT_HOME_TMS_END": "soon"})


def test_existing_database_gets_the_real_patient_added(tmp_path):
    s = settings(tmp_path, bound_patient="home")
    with TestClient(create_app(s)) as c:
        assert "home" not in {p["id"] for p in c.get("/api/patients").json()["patients"]}
    with paired(home_app(s)) as c:
        rows = {p["id"]: p["simulated"] for p in c.get("/api/patients").json()["patients"]}
        assert rows == {"anna": True, **{pid: True for pid in DEMO}}
        assert c.get("/api/patients/home").json()["patient"]["simulated"] is False
        assert c.get("/api/health").json()["patients"] == 7


def _free_port():
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


@pytest.fixture()
def data_manager(tmp_path):
    port = _free_port()
    env = {**os.environ, "PORT": str(port), "DATA_DIR": str(tmp_path / "dm"), "MDNS": "0", "TZ_NAME": "UTC",
           "API_TOKEN": TOKEN}
    env.pop("ALLOW_NO_AUTH", None)
    proc = subprocess.Popen([sys.executable, "app.py"], cwd=ROOT / "jetson" / "data_manager", env=env,
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
    headers = {"Content-Type": "application/json", "Authorization": f"Bearer {TOKEN}"}
    urllib.request.urlopen(urllib.request.Request(url + "/api/v1/samples", data=body, headers=headers))
    yield url
    proc.terminate()
    proc.wait(10)


def test_data_manager_is_read_with_the_bearer_token(tmp_path, data_manager, monkeypatch):
    monkeypatch.delenv("DATA_MANAGER_TOKEN", raising=False)
    with pytest.raises(urllib.error.HTTPError) as e:
        urllib.request.urlopen(data_manager + "/api/v1/latest")
    assert e.value.code == 401                              # the service really refuses without it

    s = settings(tmp_path, data_manager_url=data_manager, data_manager_token=TOKEN)
    with paired(home_app(s)) as c:
        latest = c.get("/api/sensors/latest").json()["latest"]
        assert {r["metric"] for r in latest} == {"env.temperature_c", "env.humidity_pct"}
        assert {r["source"] for r in latest} == {"modulino-hub"}
        room = c.get("/api/patients/anna/sensors/room?days=2").json()
        assert room["source"] == "data_manager"
        assert room["days"][-1]["room"] == {"temp_c_mean": 21.5, "humidity_pct": 40.0}
        assert c.get("/api/patients/mikko/sensors/room").json()["error"] == "not_bound"
        mods = {m["module"]: m["enabled"] for m in c.get("/api/team/modules").json()["modules"]}
        assert mods["sensors"] is True

    for wrong in (None, "not-the-token"):
        bad = Settings(db=str(tmp_path / f"bad-{wrong}.db"), bedside="ws", validation=False,
                       data_manager_url=data_manager, data_manager_token=wrong)
        with paired(home_app(bad)) as c:
            r = c.get("/api/sensors/latest")
            assert r.status_code == 502 and r.json()["error"] == "data_manager_error"
            assert "401" in r.json()["detail"] and TOKEN not in r.text


class FakeResolver:
    def __init__(self, url=None):
        self.url, self.asked, self.started, self.stopped = url, 0, False, False

    async def start(self):
        self.started = True

    async def adverts(self):
        self.asked += 1
        return [{"name": "dm", "server": "device-1.mesh.local.", "url": self.url}] if self.url else []

    async def stop(self):
        self.stopped = True


def test_data_manager_auto_is_off_until_found_and_then_followed(tmp_path, data_manager, monkeypatch):
    monkeypatch.delenv("DATA_MANAGER_TOKEN", raising=False)
    monkeypatch.setattr(home, "DM_SEARCH_S", 0.02)
    monkeypatch.setattr(home, "DM_RECHECK_S", 0.02)
    resolver = FakeResolver()
    s = settings(tmp_path, data_manager_url="auto", data_manager_token=TOKEN)
    with paired(home_app(s, dm_resolver=resolver)) as c:
        deadline = time.time() + 3
        while resolver.asked < 2 and time.time() < deadline:
            time.sleep(0.01)
        assert resolver.started and resolver.asked >= 2
        r = c.get("/api/sensors/latest")
        assert r.status_code == 404 and r.json()["error"] == "module_disabled"      # nothing found, nothing shown
        mods = {m["module"]: m["enabled"] for m in c.get("/api/team/modules").json()["modules"]}
        assert mods["sensors"] is False

        resolver.url = data_manager + "/"
        while c.get("/api/sensors/latest").status_code != 200 and time.time() < deadline:
            time.sleep(0.01)
        latest = c.get("/api/sensors/latest").json()["latest"]
        assert {r["metric"] for r in latest} == {"env.temperature_c", "env.humidity_pct"}
        assert c.app.state.team.sensors.client.url == data_manager
    assert resolver.stopped


def test_pinned_data_manager_url_starts_no_discovery(tmp_path):
    resolver = FakeResolver("http://10.99.0.9:8100")
    s = settings(tmp_path, data_manager_url="http://127.0.0.1:9", data_manager_token=TOKEN)
    with paired(home_app(s, dm_resolver=resolver)) as c:
        assert c.app.state.team.sensors.client.url == "http://127.0.0.1:9"
    assert not resolver.started and resolver.asked == 0


def test_token_comes_from_the_environment(monkeypatch):
    monkeypatch.setenv("AFFERENT_DATA_MANAGER_URL", "http://10.99.0.1:8100")
    monkeypatch.setenv("AFFERENT_DATA_MANAGER_TOKEN", TOKEN)
    s = Settings.from_env()
    assert (s.data_manager_url, s.data_manager_token) == ("http://10.99.0.1:8100", TOKEN)
    monkeypatch.setenv("AFFERENT_DATA_MANAGER_TOKEN", "")
    assert Settings.from_env().data_manager_token is None


def test_the_real_patient_never_reaches_the_clinic_channel(tmp_path):
    with paired(home_app(settings(tmp_path))) as c:
        with c.websocket_connect("/ws/clinic") as clinic:
            hello = clinic.receive_json()
            assert hello["type"] == "hello" and {p["id"] for p in hello["patients"]} == DEMO
            assert "anna" not in json.dumps(hello)

            with c.websocket_connect("/ws/app?patient=anna") as app:
                sid = str(uuid.uuid4())
                app.send_json({"type": "session_start", "patient_id": "anna", "session_id": sid})
                assert app.receive_json()["type"] == "config"
                assert c.post("/api/sessions", json=real_session()).json()["ok"] is True
                assert c.post("/api/checkins", json=checkin_doc(2, "moderate", "item9_fallback", 10)).json()["ok"] is True
                assert c.post("/api/patients/anna/privacy", json={"sharing": "paused"}).status_code == 200
                app.send_json({"type": "crisis", "patient_id": "anna"})
                assert c.post("/api/patients/anna/flags/clear").json() == {"ok": True}
            assert c.post("/api/patients/mikko/privacy", json={"sharing": "paused"}).status_code == 200

            msg = clinic.receive_json()                     # the first thing the clinic hears is about mikko
            assert (msg["type"], msg["patient_id"]) == ("privacy", "mikko")
        assert c.app.state.hub.store.flags("anna") == [] and len(c.app.state.hub.store.checkins("anna")) == 1
        assert c.get("/", follow_redirects=False).headers["location"] == "/app/patient.html"


def test_nothing_is_served_without_the_hub_token(tmp_path):
    app = home_app(settings(tmp_path))
    with stranger(app) as c:
        assert c.get("/api/health").json()["ok"] is True
        assert c.get("/app/patient.html").status_code == 200 and c.get("/clinic/").status_code == 200
        for path in ("/api/patients", "/api/patients/anna", "/api/patients/anna/analytics",
                     "/api/patients/anna/patient-view", "/api/patients/anna/qr-body", "/api/patients/anna/summary",
                     "/api/patients/anna/export", "/api/patients/anna/fhir", "/api/patients/anna/sensors/room",
                     "/api/config/anna", "/api/bedside/state", "/api/sensors/latest", "/api/validation",
                     "/api/team/modules", "/docs", "/openapi.json"):
            r = c.get(path)
            assert r.status_code == 401 and r.json()["error"] == "unauthorized", path
        for path, body in (("/api/sessions", real_session()), ("/api/patients/anna/flags/clear", None),
                           ("/api/patients/anna/privacy", {"sharing": "paused"}),
                           ("/api/patients/anna/pause", {"source": "clinician"}), ("/api/bedside/camera", {"on": True})):
            assert c.post(path, json=body).status_code == 401, path
        assert c.get("/api/patients", headers={"Authorization": "Bearer wrong"}).status_code == 401
        assert c.get("/k/wrong/api/patients").status_code == 401
        for path in ("/ws/app?patient=anna", "/ws/clinic", "/ws/bedside", "/k/wrong/ws/app"):
            with pytest.raises(WebSocketDisconnect):
                with c.websocket_connect(path):
                    pass
        assert c.app.state.hub.store.sessions("anna") == []

        r = c.get(f"/k/{HUB_TOKEN}/", follow_redirects=False)       # the pairing link
        assert r.status_code == 303 and r.headers["location"] == "/app/patient.html"
        cookie = r.headers["set-cookie"]
        assert "HttpOnly" in cookie and "SameSite=Strict" in cookie
        assert c.get("/api/patients/anna/patient-view").status_code == 200      # the cookie is enough now
        r = c.get(f"/k/{HUB_TOKEN}/clinic/?x=1", follow_redirects=False)
        assert r.status_code == 303 and r.headers["location"] == "/clinic/?x=1"

    with stranger(app) as c:                                # the phone app: the token is part of the hub address
        assert c.get(f"/k/{HUB_TOKEN}/api/patients/anna/qr-body").status_code == 200
        assert c.post(f"/k/{HUB_TOKEN}/api/patients/anna/privacy", json={"sharing": "summary"}).status_code == 200
        with c.websocket_connect(f"/k/{HUB_TOKEN}/ws/app") as ws:
            ws.send_json({"type": "hello", "patient_id": "anna"})
            assert ws.receive_json()["type"] == "config"


def test_no_token_locks_the_hub_and_open_is_a_choice(tmp_path, caplog):
    with stranger(home.create_home_app(settings(tmp_path), {})) as c:
        assert c.get("/api/health").status_code == 200
        r = c.get("/api/patients/anna")
        assert r.status_code == 503 and r.json()["error"] == "hub_locked"
        assert c.get("/k//api/patients/anna").status_code == 401
    with caplog.at_level(logging.WARNING, logger="afferent.home"):
        app = home.create_home_app(settings(tmp_path), {"AFFERENT_HUB_TOKEN": "open"})
        with stranger(app) as c:                            # builds the middleware, which says what open means
            assert c.get("/api/patients/anna").status_code == 200
            assert c.get("/k/anything/api/patients/anna").status_code == 200
    assert any("AFFERENT_HUB_TOKEN=open" in m for m in caplog.messages)


def test_other_origins_and_host_names_are_refused(tmp_path):
    app = home_app(settings(tmp_path), {"AFFERENT_HUB_ORIGINS": "https://clinic.example/",
                                             "AFFERENT_HUB_HOSTS": "Hub.Local, testserver"})
    evil = {"Origin": "https://evil.example"}
    with paired(app) as c:
        r = c.get("/api/patients/anna/export", headers=evil)
        assert r.status_code == 403 and r.json()["error"] == "origin_not_allowed"
        assert "access-control-allow-origin" not in r.headers
        pre = {**evil, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "content-type"}
        assert c.options("/api/sessions", headers=pre).status_code == 403
        assert c.post("/api/patients/anna/privacy", json={"sharing": "paused"}, headers=evil).status_code == 403
        assert c.get("/app/patient.html", headers=evil).status_code == 403
        assert c.get("/api/patients/anna", headers={"Origin": "null"}).status_code == 403
        assert c.get("/api/patients/anna", headers={"Sec-Fetch-Site": "cross-site"}).status_code == 403
        assert c.get("/api/patients/anna", headers={"Sec-Fetch-Site": "same-origin"}).status_code == 200
        for path in ("/ws/app?patient=anna", "/ws/clinic"):
            with pytest.raises(WebSocketDisconnect):
                with c.websocket_connect(path, headers=evil):
                    pass

        for origin in (BASE, "capacitor://localhost", "https://clinic.example"):
            r = c.get("/api/patients/anna/patient-view", headers={"Origin": origin})
            assert r.status_code == 200, origin
        pre = {"Origin": "capacitor://localhost", "Access-Control-Request-Method": "POST",
               "Access-Control-Request-Headers": "content-type"}
        assert c.options(f"/k/{HUB_TOKEN}/api/sessions", headers=pre).status_code == 200
        with c.websocket_connect("/ws/app?patient=anna", headers={"Origin": "capacitor://localhost"}) as ws:
            ws.send_json({"type": "ping"})
            assert ws.receive_json() == {"type": "pong"}

        for host, status in (("evil.example", 403), ("evil.example:8000", 403), ("hub.local:8000", 200),
                             ("localhost:18000", 200), ("10.99.0.2:18000", 200), ("[::1]:8000", 200)):
            r = c.get("/api/patients/anna/qr-body", headers={"Host": host})
            assert r.status_code == status, host
        assert c.get("/api/health", headers={"Host": "evil.example"}).json()["error"] == "host_not_allowed"


def test_bedside_websocket_is_closed_when_the_bedside_is_not_a_websocket_device(tmp_path):
    s = Settings(db=str(tmp_path / "home.db"), bedside="off", validation=False)
    with paired(home_app(s)) as c:
        with pytest.raises(WebSocketDisconnect):
            with c.websocket_connect("/ws/bedside") as ws:
                ws.send_json({"type": "pulse", "bpm": 142, "contact": True})
        state = c.get("/api/bedside/state").json()
        assert (state.get("pulse") or {}).get("bpm") is None and state["connected"] is False and state.get("physio") is None
    with paired(home_app(settings(tmp_path))) as c:         # AFFERENT_BEDSIDE=ws: the socket is the device
        with c.websocket_connect("/ws/bedside") as ws:
            ws.send_json({"type": "ping"})
            assert ws.receive_json() == {"type": "pong"}


def test_nothing_is_said_about_a_patient_before_the_first_session(tmp_path):
    with paired(home_app(settings(tmp_path))) as c:
        a = c.get("/api/patients/anna/analytics").json()
        assert (a["state"], a["state_label"]) == ("no_data", "Not enough data yet")
        assert a["suggestion"] == {"state": "no_data", "text": home.NO_DATA_TEXT, "reasons": []}
        assert a["director"]["baseline_pulse_bpm"] is None and a["cusum"]["since_day"] is None
        assert c.get("/api/config/anna").json()["baseline_pulse_bpm"] is None
        with c.websocket_connect("/ws/app?patient=anna") as ws:
            ws.send_json({"type": "hello", "patient_id": "anna"})
            assert ws.receive_json()["baseline_pulse_bpm"] is None
        text = c.get("/api/patients/anna/summary").json()["text"]
        assert "Status: not enough data yet;" in text and "since day" not in text
        assert "stable" not in text.lower() and "settling pulse" not in text and "No change suggested" not in text

        for pid in DEMO:                                    # generated patients have sessions: unchanged
            a = c.get(f"/api/patients/{pid}/analytics").json()
            assert a["state"] in STATES and a["director"]["baseline_pulse_bpm"] is not None
            assert c.get(f"/api/config/{pid}").json()["baseline_pulse_bpm"] is not None

        assert c.post("/api/sessions", json=real_session(status="declined")).json()["ok"] is True
        assert c.get("/api/patients/anna/analytics").json()["state"] == "no_data"      # declined is not played
        assert c.post("/api/sessions", json=real_session()).json()["ok"] is True
        a = c.get("/api/patients/anna/analytics").json()
        assert a["state"] in STATES and a["director"]["baseline_pulse_bpm"] == 79.4     # the measured rest pulse
        assert c.get("/api/config/anna").json()["baseline_pulse_bpm"] == 79.4


def test_no_baseline_pulse_without_a_usable_rest_pulse():
    def analyze(sessions, daily, now_day):
        return {"state": "stable", "state_label": "Stable", "director": {"baseline_pulse_bpm": 68.0}, "cusum": {}}

    honest = home.honest_analytics(analyze)
    assert home.honest_analytics(honest) is honest
    weak = {"status": "completed", "core": {"rest": {"pulse_bpm": 70.0, "pulse_quality": 0.2}}}
    good = {"status": "completed", "core": {"rest": {"pulse_bpm": 70.0, "pulse_quality": 0.8}}}
    assert honest([weak], [], 0)["director"]["baseline_pulse_bpm"] is None
    assert honest([weak], [], 0)["state"] == "stable"
    assert honest([weak, good], [], 0)["director"]["baseline_pulse_bpm"] == 68.0
    assert home.honest_analytics(analyze)([], [], 0)["state"] == "no_data"


def test_summary_leaves_out_the_calm_task_when_nothing_was_counted():
    from afferent_hub.summary import template

    n = {"best_calm_task": "Löyly", "best_calm_p_best": 0.34, "best_calm_helped": 0, "best_calm_n": 0}
    assert template._bandit(n) is None
    assert template._bandit({**n, "best_calm_n": None}) is None
    assert template._bandit({**n, "best_calm_helped": 3, "best_calm_n": 5}) == \
        "In calm sessions, Löyly was most often followed by a settling pulse (3 of 5, P(best) 0.34)."


def test_a_simulated_session_marks_the_row_and_names_what_is_simulated_in_the_day(tmp_path):
    sim = json.loads((FIX / "session_example.json").read_text())
    assert sim["simulated"] is True and sim["simulated_fields"] == ["signal.pulse_source"]
    s = Settings(db=str(tmp_path / "home.db"), bedside="off", validation=False)
    with paired(home_app(s)) as c:
        assert c.post("/api/sessions", json=real_session()).json()["ok"] is True
        day = c.get("/api/patients/anna").json()["daily"][0]
        assert day["simulated"] is False and day["simulated_fields"] == []
        assert c.app.state.hub.row("anna")["simulated"] is False

        sim["session_id"] = str(uuid.uuid4())
        assert c.post("/api/sessions", json=sim).json()["ok"] is True
        day = c.get("/api/patients/anna").json()["daily"][0]
        assert day["simulated"] is True and day["simulated_fields"] == ["session.signal.pulse_source"]
        assert c.app.state.hub.row("anna")["simulated"] is True
        assert c.get("/api/patients/anna/analytics").json()["simulated"] is True
        assert c.get("/api/patients/anna/qr-body").json()["sim"] is True
        assert all(r["simulated"] is True for r in c.app.state.hub.rows())     # the roster rows are unchanged


def test_a_code_shown_before_the_first_session_carries_no_state(tmp_path):
    with paired(home_app(settings(tmp_path))) as c:
        q = c.get("/api/patients/anna/qr-body").json()
        assert q["sim"] is False
        assert (q["state"]["shown"], q["state"]["cusum"], q["state"]["since_day"]) == (None, None, None)
        assert q["cusum"] == {"value": None, "history": []}
        assert "stable" not in json.dumps(q["state"]) + json.dumps(q["cusum"])
        body = tmp_path / "qr_body.json"
        body.write_text(json.dumps(q))
        node = shutil.which("node")
        if node:                                            # the same body through the phone's codec and the clinic page
            r = subprocess.run([node, str(ROOT / "hub" / "tests" / "clinic_imported_state.test.js"), str(body)],
                               capture_output=True, text=True, timeout=60)
            assert r.returncode == 0, r.stderr + r.stdout

        for pid in DEMO:                                    # the roster keeps its state in the code
            assert c.get(f"/api/patients/{pid}/qr-body").json()["state"]["shown"] in STATES
        assert c.post("/api/sessions", json=real_session()).json()["ok"] is True
        q = c.get("/api/patients/anna/qr-body").json()
        assert q["state"]["shown"] in STATES and q["state"]["cusum"] in STATES


class Adverts:
    def __init__(self, *adverts):
        self.list, self.started, self.stopped = list(adverts), False, False

    async def start(self):
        self.started = True

    async def adverts(self):
        return list(self.list)

    async def stop(self):
        self.stopped = True


def advert(url, device="device-149628ce"):
    return {"name": url, "server": f"{device}.mesh.local.", "url": url}


def follow(resolver, steps, device="", up=()):
    """Runs follow_data_manager while `steps` (a coroutine function) drives the scene; returns the client."""
    client, up = SimpleNamespace(url=None), set(up)

    async def alive(url):
        return url in up

    async def run():
        task = asyncio.create_task(home.follow_data_manager(client, resolver, device, alive))
        try:
            await steps(client, up)
        finally:
            task.cancel()
            await asyncio.gather(task, return_exceptions=True)

    asyncio.run(run())
    return client


async def reached(cond, timeout=3.0):
    end = time.monotonic() + timeout
    while not cond():
        assert time.monotonic() < end, "condition not reached in time"
        await asyncio.sleep(0.005)


@pytest.fixture()
def fast_dm(monkeypatch):
    monkeypatch.setattr(home, "DM_SEARCH_S", 0.01)
    monkeypatch.setattr(home, "DM_RECHECK_S", 0.01)


def test_a_second_data_manager_advert_never_replaces_one_that_answers(fast_dm, caplog):
    first, second = "http://10.99.0.2:8100", "http://192.168.1.50:9999"
    resolver = Adverts(advert(first))

    async def steps(client, up):
        await reached(lambda: client.url == first)
        resolver.list.append(advert(second, "anything"))    # appears later, answers too
        up.add(second)
        await asyncio.sleep(0.1)
        assert client.url == first
        up.discard(first)                                   # the first one is gone for good
        await reached(lambda: client.url == second)
        up.add(first)                                       # and back: the working link stays
        await asyncio.sleep(0.1)
        assert client.url == second

    with caplog.at_level(logging.WARNING, logger="afferent.home"):
        follow(resolver, steps, up={first})
    assert resolver.started and resolver.stopped
    several = [m for m in caplog.messages if "data manager adverts on the mesh" in m]
    assert len(several) == 1 and first in several[0] and second in several[0]      # said once, with both
    assert any("does not answer" in m for m in caplog.messages)


def test_a_pinned_device_is_the_only_data_manager_used(fast_dm):
    mine, other = "http://10.99.0.2:8100", "http://10.99.0.9:8100"
    resolver = Adverts(advert(other, "device-ffff0000"), advert(mine))

    async def steps(client, up):
        await reached(lambda: client.url == mine)
        up.discard(mine)
        await asyncio.sleep(0.1)
        assert client.url == mine                           # nothing else may take over

    follow(resolver, steps, device="device-149628ce", up={mine, other})

    async def never(client, up):
        await asyncio.sleep(0.1)
        assert client.url is None

    follow(Adverts(advert(other, "device-ffff0000")), never, device="device-149628ce", up={other})
    follow(Adverts(advert(mine)), never, up=())             # an advert that does not answer is not used


def test_the_device_pin_matches_the_whole_device_label():
    ad = advert("http://10.99.0.2:8100", "device-149628ce-6c13")
    assert home.on_device(ad, "") and home.on_device(ad, "device-149628ce-6c13") and home.on_device(ad, "149628CE-6c13")
    assert not home.on_device(ad, "device-149628ce")               # a prefix is not the device
    assert not home.on_device(advert("http://x", "device-149628ce-6c13-evil"), "device-149628ce-6c13")
    assert not home.on_device({"url": "http://x", "server": None}, "device-149628ce-6c13")
