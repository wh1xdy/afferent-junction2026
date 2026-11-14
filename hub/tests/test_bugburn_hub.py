"""Regression tests from the hub bug burn-down (docs/bugburn/hub.md)."""
import asyncio
import datetime as dt
import uuid

from fastapi.testclient import TestClient

from afferent_hub import qr, views
from afferent_hub.main import create_app
from afferent_hub.settings import Settings
from afferent_hub.ws.manager import Client, Rooms


def ws_hub(tmp_path):
    return TestClient(create_app(Settings(db=str(tmp_path / "t.db"), bedside="ws", validation=False,
                                          decline_interval_s=0)))


def checkin(pid, total, band):
    today = dt.date.today().isoformat()
    items = {f"phq9_{i}": 0 for i in range(1, 10)}
    return {"schema": "afferent.checkin/1", "checkin_id": str(uuid.uuid4()), "patient_id": pid,
            "device_id": "inst-1", "app_version": "0.3.0",
            "started_iso": f"{today}T12:00:00+02:00", "completed_iso": f"{today}T12:02:00+02:00",
            "status": "completed", "trigger": "schedule", "early": False, "language": "en",
            "phq9": {"items": items, "total": total, "phq8_total": 0, "band": band},
            "cssrs": {"asked": False, "reason": "not_licensed", "items": {}, "tier": None, "c6_repeat": False},
            "safety": {"tier": "none", "item9": 0, "source": "item9_fallback", "screen": "thank_you",
                       "shared": True}}


class FakeWs:
    def __init__(self):
        self.sent = []

    async def send_text(self, text):
        self.sent.append(text)


# BH-1: the data manager holds the bound patient's home only; its facts must not reach another patient
def test_sensor_facts_only_for_the_bound_patient(tmp_path):
    with ws_hub(tmp_path) as c:
        hub = c.app.state.hub
        reads = []
        sensors = type("S", (), {"enabled": True})()

        def get(name, params):
            reads.append((name, params.get("metric") or params.get("kind")))
            if name == "daily" and params.get("metric") == "presence.home":
                return {"days": [{"share_of_day": 0.99, "partial_day": False}] * 5}
            if name == "events":
                return {"events": []}
            raise RuntimeError("not served")

        sensors.get = get
        hub.sensors = sensors
        other = next(p["id"] for p in hub.store.patients() if p["id"] != hub.settings.bound_patient)
        assert c.post("/api/checkins", json=checkin(other, 12, "moderate")).status_code == 200
        res = c.get(f"/api/patients/{other}/wellbeing").json()
        assert res["indicator"] == "bad"
        assert not any("stayed home" in f or "visitors" in f for f in res["facts"]), res["facts"]
        assert not any(r[0] in ("events",) or r[1] == "presence.home" for r in reads)


# BH-2: an app socket that has not said which patient it is must not get other patients' messages
def test_broadcast_does_not_reach_unidentified_app_for_another_patient():
    async def run():
        rooms = Rooms()
        rooms.default_patient = "anna"
        anon, bob = Client(FakeWs(), "app"), Client(FakeWs(), "app", patient_id="bob")
        rooms.add(anon)
        rooms.add(bob)
        sent_bob = await rooms.broadcast("app", {"type": "voice_context", "patient_id": "bob"}, patient_id="bob")
        sent_anna = await rooms.broadcast("app", {"type": "pulse"}, patient_id="anna")
        sent_all = await rooms.broadcast("app", {"type": "demo_reset"})
        return anon, bob, sent_bob, sent_anna, sent_all

    anon, bob, sent_bob, sent_anna, sent_all = asyncio.run(run())
    assert sent_bob == 1 and len(bob.ws.sent) == 2           # bob's message and demo_reset
    assert all('"bob"' not in t for t in anon.ws.sent)
    assert sent_anna == 1 and sent_all == 2 and len(anon.ws.sent) == 2


def test_unidentified_app_socket_gets_no_privacy_of_another_patient(tmp_path):
    with ws_hub(tmp_path) as c:
        hub = c.app.state.hub
        other = next(p["id"] for p in hub.store.patients() if p["id"] != hub.settings.bound_patient)
        with c.websocket_connect("/ws/app") as anon, c.websocket_connect(f"/ws/app?patient={other}") as mine:
            r = c.post(f"/api/patients/{other}/privacy", json={"sensor": "phone_camera", "on": False})
            assert r.status_code == 200
            assert mine.receive_json()["type"] == "privacy"
            anon.send_json({"type": "ping"})
            assert anon.receive_json()["type"] == "pong"      # the privacy message never arrived first


# BH-3: a talk request stamped in UTC lands on the hub's local day and minute in the QR body
def test_qr_talk_request_uses_local_day_and_minute(monkeypatch):
    local = dt.timezone(dt.timedelta(hours=2))
    real = dt.datetime

    class Local(real):
        def astimezone(self, tz=None):
            return real.astimezone(self, tz or local)

    monkeypatch.setattr(qr.dt, "datetime", Local)
    patient = {"id": "x", "tms_end_date": "2026-11-01"}
    flags = [{"type": "talk_request", "t_iso": "2026-11-10T23:30:00.000Z"}]   # 01:30 on the 11th at +02:00
    talk, _ = qr._talk(patient, flags, 0, 30)
    assert talk == [{"day": 10, "minute": 90}]
    assert qr._minute("2026-11-10T23:30:00Z") == 90
    assert qr._minute("2026-11-11T01:30:00+02:00") == 90
    assert qr._minute("2026-07-11T01:30:00+03:00") == 90       # the app's own local stamp is kept as written
    assert qr._minute("2026-11-11T01:30:00") == 90            # no offset: already local
