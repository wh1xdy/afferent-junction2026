"""Room climate: the bedside unit's thermometer to the phone (a `room` message), and the bedroom at night
from the data manager's minute means into the patient view and the shared dashboard (never the QR code).
All numbers are test inputs."""
import datetime as dt
import json
import os
import subprocess
import sys
import time
import urllib.request
from zoneinfo import ZoneInfo

import pytest
from fastapi.testclient import TestClient

from afferent_hub import qr, room
from afferent_hub.main import create_app
from afferent_hub.settings import Settings

from test_api import recv_until
from test_home_hub import ROOT, TOKEN, _free_port, home_app, paired, restore_modules, settings  # noqa: F401

HKI = ZoneInfo("Europe/Helsinki")


def bucket(day: dt.date, hour: int, mean: float, n: int = 60) -> dict:
    t = dt.datetime.combine(day, dt.time(hour), HKI)
    return {"ts": int(t.timestamp() * 1000), "n": n, "mean": mean}


def night_buckets(date: dt.date, mean: float, hours=range(8), n: int = 60) -> list[dict]:
    """Buckets of the night that ends on the morning of `date`: 23:00 the evening before is hour 0."""
    out = []
    for h in hours:
        clock = (23 + h) % 24
        out.append(bucket(date - dt.timedelta(days=1) if clock == 23 else date, clock, mean, n))
    return out


def test_a_night_runs_from_23_to_07_and_needs_four_hours_with_a_reading():
    d = dt.date(2026, 11, 10)
    temp = night_buckets(d, 18.0, hours=range(7)) + [bucket(d, 6, 20.0, n=30)]
    temp += [bucket(d, 12, 25.0), bucket(d, 22, 25.0), bucket(d, 7, 25.0)]          # daytime and the evening: not the night
    temp += [bucket(d, 3, 80.0)]                                                     # a fault, not a room
    temp += night_buckets(d + dt.timedelta(days=1), 17.0, hours=range(3))           # three hours: not enough
    hum = night_buckets(d, 41.0, hours=range(3))
    out = room.nights(temp, hum, HKI)
    assert out == {"2026-11-10": {"temp_c_night": 18.1, "humidity_pct": None, "night_hours": 8}}
    assert room.night_date(bucket(d, 23, 0)["ts"], HKI) == d + dt.timedelta(days=1)
    assert room.night_date(bucket(d, 6, 0)["ts"], HKI) == d
    assert room.night_date(bucket(d, 7, 0)["ts"], HKI) is None
    assert room.nights([], [], HKI) == {}


def test_daily_records_say_whether_their_room_is_simulated():
    recs = [
        {"day_index": 1, "simulated": True, "simulated_fields": ["sleep", "room"], "room": {"temp_c_night": 19.62, "humidity_pct": 31.4}},
        {"day_index": 2, "simulated": False, "simulated_fields": [], "room": {"temp_c_night": 20.1, "humidity_pct": None}},
        {"day_index": 3, "simulated": True, "simulated_fields": ["session.*"], "room": {"temp_c_night": 21.0}},
        {"day_index": 4, "simulated": True, "simulated_fields": [], "room": {"temp_c_night": 21.0}},
        {"day_index": 5, "simulated": False, "room": {"temp_c_night": None, "humidity_pct": None}},
        {"day_index": 6, "simulated": False, "room": {"temp_c_night": 99.0, "humidity_pct": 140}},
        {"day_index": 7, "simulated": False},
    ]
    assert room.from_daily(recs) == {
        1: {"temp_c_night": 19.6, "humidity_pct": 31, "simulated": True},
        2: {"temp_c_night": 20.1, "humidity_pct": None, "simulated": False},
        3: {"temp_c_night": 21.0, "humidity_pct": None, "simulated": False},     # a simulated session, a measured room
        4: {"temp_c_night": 21.0, "humidity_pct": None, "simulated": True},      # the whole record simulated
    }


def test_measured_nights_win_and_simulated_ones_stay_marked():
    sim = {d: {"temp_c_night": 19.6, "humidity_pct": 31, "simulated": True} for d in range(1, 57)}
    w = room.weekly(sim, 56, qr.WEEKS, qr.PERIOD_DAYS)
    assert w["simulated"] is True and w["nights"] == 56
    assert w["weekly"] == {"temp_c_night": [19.6] * 8, "humidity_pct": [31] * 8}
    days = room.merge(sim, {50: {"temp_c_night": 22.4, "humidity_pct": 38}, 52: {"temp_c_night": 21.0, "humidity_pct": None}})
    w = room.weekly(days, 56, qr.WEEKS, qr.PERIOD_DAYS)
    assert w == {"weekly": {"temp_c_night": [None] * 7 + [21.7], "humidity_pct": [None] * 7 + [38]},
                 "nights": 2, "simulated": False}, "measured and simulated nights never mix"
    assert room.weekly({}, 56, qr.WEEKS, qr.PERIOD_DAYS) == {
        "weekly": {"temp_c_night": [None] * 8, "humidity_pct": [None] * 8}, "nights": 0, "simulated": False}
    view = room.week_view(days, [(d, f"2026-11-{d - 41:02d}") for d in range(50, 57)])
    assert view["nights"] == 2 and view["temp_c_night"] == 21.7 and view["simulated"] is False
    assert view["sleep_c"] == [16, 19] and len(view["days"]) == 7 and view["days"][1]["temp_c_night"] is None
    assert room.week_view({}, [(56, "2026-11-15")]) is None


@pytest.fixture()
def client(tmp_path):
    app = create_app(Settings(db=str(tmp_path / "t.db"), bedside="ws", validation=False))
    with TestClient(app) as c:
        yield c


def hello(ws, pid="anna"):
    ws.send_json({"type": "hello", "device_id": "t", "app_version": "0.3.0", "patient_id": pid, "profile": "live",
                  "role": "game"})
    recv_until(ws, "config")


def until_pong(ws) -> list[dict]:
    ws.send_json({"type": "ping"})
    seen = []
    while not seen or seen[-1].get("type") != "pong":
        seen.append(ws.receive_json())
    return seen


def test_the_phone_gets_the_room_from_the_bedside_unit_and_the_clinic_does_not(client):
    with client.websocket_connect("/ws/clinic") as clinic, client.websocket_connect("/ws/bedside") as bedside, \
            client.websocket_connect("/ws/app") as app, client.websocket_connect("/ws/app") as other:
        assert clinic.receive_json()["type"] == "hello"
        hello(app)
        hello(other, "mikko")
        assert not [m for m in until_pong(app) if m["type"] == "room"], "no reading yet: no room message"
        bedside.send_json({"type": "hello", "device": "unoq", "fw": "test"})
        bedside.send_json({"type": "thermo", "temp_c": 21.5, "humidity_pct": 40})
        m = recv_until(app, "room")
        assert {k: m[k] for k in ("temp_c", "humidity_pct", "source", "simulated")} == \
            {"temp_c": 21.5, "humidity_pct": 40, "source": "modulino_thermo", "simulated": False}
        assert 0 <= m["age_s"] < 5

        with client.websocket_connect("/ws/app") as late:
            hello(late)
            first = recv_until(late, "room")
            assert first["temp_c"] == 21.5 and first["age_s"] >= 0, "the last reading right after hello"

        bedside.send_json({"type": "thermo", "temp_c": None, "humidity_pct": None})
        gone = recv_until(app, "room")
        assert gone["temp_c"] is None and gone["source"] is None
        assert not [m for m in until_pong(other) if m["type"] == "room"], "only the patient the bedside unit belongs to"
        assert not [m for m in until_pong(clinic) if m["type"] == "room"], "nothing live reaches the clinic"


def test_the_simulator_room_is_marked_simulated(tmp_path):
    app = create_app(Settings(db=str(tmp_path / "s.db"), bedside="sim", validation=False))
    with TestClient(app) as c, c.websocket_connect("/ws/app") as ws:
        hello(ws)
        m = recv_until(ws, "room")
        assert m["simulated"] is True and m["source"] == "simulated" and 19 <= m["temp_c"] <= 22


@pytest.fixture()
def night_data_manager(tmp_path):
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
    tz = dt.datetime.now().astimezone().tzinfo                 # the hub groups nights in its own time zone
    today = dt.datetime.now(tz).date()
    last, before = today - dt.timedelta(days=1), today - dt.timedelta(days=2)

    def minutes(date, hours, value, metric):
        start = dt.datetime.combine(date - dt.timedelta(days=1), dt.time(23), tz)
        return [{"metric": metric, "value": value, "ts": (start + dt.timedelta(minutes=m)).timestamp()}
                for m in range(hours * 60)]

    real = minutes(last, 8, 18.5, room.TEMP) + minutes(last, 8, 45.0, room.HUMIDITY)
    real += minutes(before, 3, 23.0, room.TEMP)                                    # three hours: no night
    noon = dt.datetime.combine(last, dt.time(12), tz).timestamp()
    real += [{"metric": room.TEMP, "value": 26.0, "ts": noon + 60 * i} for i in range(60)]
    sim = minutes(last, 8, 30.0, room.TEMP)
    headers = {"Content-Type": "application/json", "Authorization": f"Bearer {TOKEN}"}
    for source, samples in (("modulino-hub", real), ("sim/modulino-hub", sim)):
        body = json.dumps({"source": source, "samples": samples}).encode()
        urllib.request.urlopen(urllib.request.Request(url + "/api/v1/samples", data=body, headers=headers))
    yield url, last
    proc.terminate()
    proc.wait(10)


def test_nights_from_the_data_manager_reach_the_week_and_the_dashboard(tmp_path, night_data_manager):
    url, last = night_data_manager
    start = (dt.date.today() - dt.timedelta(days=10)).isoformat()
    s = settings(tmp_path, data_manager_url=url, data_manager_token=TOKEN)
    with paired(home_app(s, {"AFFERENT_HOME_TMS_END": start, "AFFERENT_HOME_DEMO_ROSTER": "0"})) as c:
        assert "room" not in c.get("/api/patients/anna/qr-body").json(), "the QR code shares the dashboard, not the numbers"
        r = c.get("/api/patients/anna/room-nights").json()
        assert r["nights"] == 1 and r["simulated"] is False
        assert r["period"]["to_day"] - r["period"]["from_day"] == qr.PERIOD_DAYS - 1 and r["period"]["tms_end_date"] == start
        assert r["sleep_c"] == [16, 19] and r["night"] == "23:00 to 07:00"
        assert [x for x in r["weekly"]["temp_c_night"] if x is not None] == [18.5], "the sim source and the day are left out"
        assert [x for x in r["weekly"]["humidity_pct"] if x is not None] == [45]
        view = c.get("/api/patients/anna/patient-view").json()["room"]
        assert view["nights"] == 1 and view["temp_c_night"] == 18.5 and view["humidity_pct"] == 45
        assert next(d for d in view["days"] if d["date"] == last.isoformat())["temp_c_night"] == 18.5
        assert view["simulated"] is False and view["sleep_c"] == [16, 19]


def test_the_demo_roster_dashboard_nights_are_marked_simulated_and_stay_out_of_the_code(client):
    r = client.get("/api/patients/anna/room-nights").json()
    assert r["simulated"] is True and 0 < r["nights"] <= qr.PERIOD_DAYS
    assert set(r["weekly"]) == {"temp_c_night", "humidity_pct"} and all(len(v) == qr.WEEKS for v in r["weekly"].values())
    assert "room" not in client.get("/api/patients/anna/qr-body").json()
    assert client.get("/api/patients/nobody/room-nights").status_code == 404
