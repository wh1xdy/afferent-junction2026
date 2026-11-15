"""The home hub announces itself on its network (afferent_hub.advert, AFFERENT_HUB_ADVERTISE=1), so the LAN
door (jetson/home_hub/door) can find it; the advert names an address and a port, never the pairing token.
The door's side of the same contract runs over real mDNS in jetson/home_hub/tests/test_door.py."""
import uuid

import pytest
from fastapi.testclient import TestClient

from afferent_hub import advert, home
from afferent_hub.settings import Settings

TOKEN = "hub-" + uuid.uuid4().hex
BASE = "http://127.0.0.1:8000"


@pytest.fixture(autouse=True)
def restore_modules(monkeypatch):
    from afferent_hub import modules

    for name in ("demo_roster", "analyze_patient"):
        monkeypatch.setitem(modules.fn, name, modules.fn[name])


def settings(tmp_path):
    return Settings(db=str(tmp_path / "home.db"), bedside="ws", validation=False)


class FakeAdvert:
    def __init__(self, fail: bool = False):
        self.fail = fail
        self.started = self.stopped = False

    async def start(self):
        self.started = True
        if self.fail:
            raise OSError("no multicast here")
        return True

    async def stop(self):
        self.stopped = True


def test_it_is_on_only_when_asked():
    assert not advert.enabled({})
    assert not advert.enabled({"AFFERENT_HUB_ADVERTISE": "0"})
    assert advert.enabled({"AFFERENT_HUB_ADVERTISE": "1"}) and advert.enabled({"AFFERENT_HUB_ADVERTISE": " yes "})


def test_the_advert_names_the_role_an_address_and_a_port_and_no_token():
    pytest.importorskip("zeroconf", reason="zeroconf is not installed (hub/requirements-dev.txt)")
    info = advert.service_info("10.168.20.222", host="Hub Container 1")
    assert info.type == "_http._tcp.local."
    assert (info.parsed_addresses(), info.port) == (["10.168.20.222"], 8000)
    assert info.properties == {b"role": b"home-hub", b"v": b"1"}
    assert info.name == "afferent-home-hub-hub-container-1._http._tcp.local."
    assert info.server == "afferent-home-hub-hub-container-1.local."


def test_the_real_advert_is_found_by_role_and_withdrawn(monkeypatch):
    """HubAdvert against real zeroconf on loopback, read back with the hub's own MdnsResolver."""
    pytest.importorskip("zeroconf", reason="zeroconf is not installed (hub/requirements-dev.txt)")
    import asyncio
    import time

    from afferent_hub.bedside.unoq_auto import MdnsResolver

    monkeypatch.setenv("MDNS_ADDRESS", "127.0.0.1")

    async def run():
        a = advert.HubAdvert(port=18000, address="127.0.0.1")
        try:
            assert await a.start()
        except OSError as e:
            pytest.skip(f"no mDNS socket on 127.0.0.1: {e}")
        seen = MdnsResolver(advert.ROLE, mesh_only=False)
        try:
            await seen.start()
            url, end = None, time.monotonic() + 8
            while url is None and time.monotonic() < end:
                url = await seen.resolve()
                await asyncio.sleep(0.2)
            if not seen._names:
                pytest.skip("no mDNS answer came back over 127.0.0.1 (multicast on loopback is off here)")
            return url
        finally:
            await seen.stop()
            await a.stop()
            assert a._azc is None

    assert asyncio.run(run()) == "http://127.0.0.1:18000"


def test_the_hub_starts_and_withdraws_its_advert(tmp_path):
    a = FakeAdvert()
    app = home.create_home_app(settings(tmp_path), {"AFFERENT_HUB_TOKEN": TOKEN}, hub_advert=a)
    with TestClient(app, base_url=BASE) as c:
        assert a.started and not a.stopped
        assert c.get("/api/health").json()["ok"] is True
    assert a.stopped


def test_a_failing_advert_leaves_the_hub_running(tmp_path, caplog):
    a = FakeAdvert(fail=True)
    app = home.create_home_app(settings(tmp_path), {"AFFERENT_HUB_TOKEN": TOKEN}, hub_advert=a)
    with TestClient(app, base_url=BASE) as c:
        assert c.get("/api/health").status_code == 200
        assert c.get("/api/patients").status_code == 401, "and the token is still asked for"
    assert a.started and not a.stopped, "nothing to withdraw"
    assert "hub advert could not start" in caplog.text


def test_without_the_switch_nothing_is_announced(tmp_path, monkeypatch):
    def refuse(*a, **kw):
        raise AssertionError("no advert without AFFERENT_HUB_ADVERTISE=1")

    monkeypatch.setattr(advert, "HubAdvert", refuse)
    with TestClient(home.create_home_app(settings(tmp_path), {"AFFERENT_HUB_TOKEN": TOKEN}), base_url=BASE) as c:
        assert c.get("/api/health").status_code == 200


def test_the_jetson_manifest_turns_it_on():
    import json
    from pathlib import Path

    manifest = json.loads((Path(__file__).resolve().parents[2] / "jetson" / "home_hub" / "wendy.json").read_text())
    assert manifest["env"]["AFFERENT_HUB_ADVERTISE"] == "1"
    net = next(e for e in manifest["entitlements"] if e["type"] == "network")
    assert net["mode"] == "mesh" and {"host": 18000, "container": 8000, "protocol": "tcp"} in net["ports"], \
        "the hub stays on the mesh: the LAN door and wendy net forward both reach it on 18000"
