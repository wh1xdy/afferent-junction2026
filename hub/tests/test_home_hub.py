"""The home hub entry point (afferent_hub.home): a real patient next to the labelled demo roster,
the refused demo reset, and the data manager read with its bearer token.

The data manager here is jetson/data_manager/app.py from this repo, started with API_TOKEN set, the
same way it runs on the Jetson. No device is involved.
"""
import datetime as dt
import json
import os
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request
import uuid
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from afferent_hub import home, modules
from afferent_hub.main import create_app
from afferent_hub.settings import Settings

ROOT = Path(__file__).resolve().parents[2]
FIX = ROOT / "contracts" / "fixtures"
TOKEN = "test-token-" + uuid.uuid4().hex
DEMO = {"mikko", "juha", "leena", "sofia", "eero"}


@pytest.fixture(autouse=True)
def restore_roster(monkeypatch):
    monkeypatch.setitem(modules.fn, "demo_roster", modules.fn["demo_roster"])


def settings(tmp_path, **over):
    return Settings(db=str(tmp_path / "home.db"), bedside="ws", validation=False, **over)


def real_session(**over):
    s = json.loads((FIX / "session_example.json").read_text())
    s.update(session_id=str(uuid.uuid4()), simulated=False, simulated_fields=[], **over)
    return s


def test_real_patient_is_empty_and_real_and_the_roster_is_labelled(tmp_path):
    env = {"AFFERENT_HOME_PATIENT_NAME": "Test Person", "AFFERENT_HOME_TMS_END": "2026-11-01"}
    with TestClient(home.create_home_app(settings(tmp_path), env)) as c:
        lst = c.get("/api/patients").json()
        rows = {p["id"]: p for p in lst["patients"]}
        assert set(rows) == DEMO | {"anna"}
        assert rows["anna"]["simulated"] is False and rows["anna"]["display_name"] == "Test Person"
        assert rows["anna"]["last_session_day"] is None and rows["anna"]["composite"] is None
        assert all(rows[pid]["simulated"] is True for pid in DEMO)
        assert lst["simulated"] is True                     # some of the list is generated

        d = c.get("/api/patients/anna").json()
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
    with TestClient(home.create_home_app(s, {})) as c:
        assert c.post("/api/sessions", json=doc).json()["ok"] is True
        r = c.post("/api/demo/reset", json={})
        assert r.status_code == 403 and r.json()["error"] == "reset_disabled"
        assert c.post("/api/demo/reset/").status_code == 403
    with TestClient(home.create_home_app(s, {})) as c:
        d = c.get("/api/patients/anna").json()
        assert [x["session_id"] for x in d["sessions"]] == [doc["session_id"]]
        assert d["sessions"][0]["simulated"] is False and d["patient"]["simulated"] is False
        assert [day["simulated"] for day in d["daily"]] == [False]
        assert d["daily"][0]["simulated_fields"] == []
        assert c.get("/api/patients/anna/analytics").json()["simulated"] is False
        assert {p["id"] for p in c.get("/api/patients").json()["patients"]} == DEMO | {"anna"}


def test_real_patient_only(tmp_path):
    with TestClient(home.create_home_app(settings(tmp_path), {"AFFERENT_HOME_DEMO_ROSTER": "0"})) as c:
        lst = c.get("/api/patients").json()
        assert [p["id"] for p in lst["patients"]] == ["anna"] and lst["simulated"] is False
        assert c.get("/api/health").json()["patients"] == 1


def test_another_patient_id_keeps_the_whole_roster(tmp_path):
    with TestClient(home.create_home_app(settings(tmp_path, bound_patient="home"), {})) as c:
        rows = {p["id"]: p["simulated"] for p in c.get("/api/patients").json()["patients"]}
        assert rows == {"home": False, "anna": True, **{pid: True for pid in DEMO}}
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
    with TestClient(home.create_home_app(s, {})) as c:
        rows = {p["id"]: p["simulated"] for p in c.get("/api/patients").json()["patients"]}
        assert rows["home"] is False and rows["anna"] is True and len(rows) == 7


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
    with TestClient(home.create_home_app(s, {})) as c:
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
        with TestClient(home.create_home_app(bad, {})) as c:
            r = c.get("/api/sensors/latest")
            assert r.status_code == 502 and r.json()["error"] == "data_manager_error"
            assert "401" in r.json()["detail"] and TOKEN not in r.text


class FakeResolver:
    def __init__(self, url=None):
        self.url, self.asked, self.started, self.stopped = url, 0, False, False

    async def start(self):
        self.started = True

    async def resolve(self):
        self.asked += 1
        return self.url

    async def stop(self):
        self.stopped = True


def test_data_manager_auto_is_off_until_found_and_then_followed(tmp_path, data_manager, monkeypatch):
    monkeypatch.delenv("DATA_MANAGER_TOKEN", raising=False)
    monkeypatch.setattr(home, "DM_SEARCH_S", 0.02)
    monkeypatch.setattr(home, "DM_RECHECK_S", 0.02)
    resolver = FakeResolver()
    s = settings(tmp_path, data_manager_url="auto", data_manager_token=TOKEN)
    with TestClient(home.create_home_app(s, {}, dm_resolver=resolver)) as c:
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
    with TestClient(home.create_home_app(s, {}, dm_resolver=resolver)) as c:
        assert c.app.state.team.sensors.client.url == "http://127.0.0.1:9"
    assert not resolver.started and resolver.asked == 0


def test_token_comes_from_the_environment(monkeypatch):
    monkeypatch.setenv("AFFERENT_DATA_MANAGER_URL", "http://10.99.0.1:8100")
    monkeypatch.setenv("AFFERENT_DATA_MANAGER_TOKEN", TOKEN)
    s = Settings.from_env()
    assert (s.data_manager_url, s.data_manager_token) == ("http://10.99.0.1:8100", TOKEN)
    monkeypatch.setenv("AFFERENT_DATA_MANAGER_TOKEN", "")
    assert Settings.from_env().data_manager_token is None
