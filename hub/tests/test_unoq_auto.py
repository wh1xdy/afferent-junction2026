"""AFFERENT_BEDSIDE=unoq:auto: the UNO Q address comes from a resolver instead of the setting.

The resolver here is a fake and the device is httpx.MockTransport: no socket is opened and no mDNS
packet is sent. The real lookup (zeroconf on the mesh interface) was checked on the Jetson, not here.
"""
import asyncio
import socket
from types import SimpleNamespace

import httpx
import pytest

from afferent_hub.bedside.unoq_auto import ROLE, SERVICE, MdnsResolver, UnoQAuto
from afferent_hub.bedside.unoq_http import UnoQHttp
from afferent_hub.service import make_source
from afferent_hub.settings import Settings

from test_unoq_http import FakeUnoQ, Sink, by_type, until


@pytest.fixture(autouse=True)
def no_network(monkeypatch):
    def refuse(self, *a, **k):
        raise AssertionError("a test tried to open a network connection")

    monkeypatch.setattr(socket.socket, "connect", refuse)
    monkeypatch.setattr(socket.socket, "connect_ex", refuse)


class FakeResolver:
    def __init__(self, url=None):
        self.url = url
        self.asked = 0
        self.started = self.stopped = False

    async def start(self):
        self.started = True

    async def resolve(self):
        self.asked += 1
        return self.url

    async def stop(self):
        self.stopped = True


class Mesh:
    """Two addresses behind one MockTransport: which host each request went to, and which one answers."""

    def __init__(self):
        self.devices = {"10.99.0.1:18080": FakeUnoQ(), "10.99.0.7:18080": FakeUnoQ()}
        self.hosts: list[str] = []

    def handler(self, request: httpx.Request) -> httpx.Response:
        host = f"{request.url.host}:{request.url.port}"
        self.hosts.append(host)
        return self.devices[host].handler(request)


async def start(resolver, handler):
    events: list[dict] = []

    async def on_event(msg):
        events.append(msg)

    dev = UnoQAuto(resolver, poll_s=0.01, transport=httpx.MockTransport(handler), resolve_every_s=0.02)
    dev.settle_s = 0.01
    await dev.start(on_event)
    return dev, events


def test_make_source_auto_next_to_the_pinned_address():
    auto = make_source(Settings(bedside="unoq:auto"))
    assert isinstance(auto, UnoQAuto) and isinstance(auto.resolver, MdnsResolver)
    assert auto.name == "unoq_http" and auto.base_url == "" and auto.connected is False
    state = Sink().bedside(auto).state
    assert state["source"] == "unoq_http" and state["simulated"] is False and state["physio"] is None
    pinned = make_source(Settings(bedside="unoq:http://127.0.0.1:18081"))
    assert type(pinned) is UnoQHttp and pinned.base_url == "http://127.0.0.1:18081"


def test_nothing_is_polled_until_an_advert_is_resolved():
    async def run():
        mesh, resolver = Mesh(), FakeResolver()
        dev, events = await start(resolver, mesh.handler)
        await until(lambda: resolver.asked >= 3)
        before = (dev.connected, list(mesh.hosts), list(events))
        resolver.url = "http://10.99.0.1:18080/"
        await until(lambda: dev.connected and by_type(events, "physio"))
        await dev.stop()
        return resolver, mesh, dev, events, before

    resolver, mesh, dev, events, before = asyncio.run(run())
    assert before == (False, [], [])                        # no request, no event, nothing invented
    assert resolver.started and resolver.stopped
    assert dev.base_url == "http://10.99.0.1:18080" and set(mesh.hosts) == {"10.99.0.1:18080"}
    assert events[0] == {"type": "hello", "device": "unoq", "fw": "modulino-hub/http"}
    assert "/heartbeat?on=0" in mesh.devices["10.99.0.1:18080"].posts
    physio = by_type(events, "physio")[0]
    assert physio["simulated"] is False and physio["pulse_bpm"] is None and physio["presence"] == "idle"


def test_a_working_link_is_not_replaced_and_a_lost_one_is_resolved_again():
    async def run():
        mesh, resolver = Mesh(), FakeResolver("http://10.99.0.1:18080")
        dev, events = await start(resolver, mesh.handler)
        await until(lambda: dev.connected)
        asked = resolver.asked
        resolver.url = "http://10.99.0.7:18080"             # another advert while the link works
        await asyncio.sleep(0.1)
        kept = (dev.base_url, resolver.asked == asked, set(mesh.hosts))

        mesh.devices["10.99.0.1:18080"].down = True         # the link is lost
        await until(lambda: dev.connected and dev.base_url == "http://10.99.0.7:18080")
        seen = list(events)
        n = len(mesh.hosts)
        await until(lambda: len(mesh.hosts) > n + 3)
        tail = set(mesh.hosts[n:])
        await dev.stop()
        return kept, seen, tail, mesh

    kept, seen, tail, mesh = asyncio.run(run())
    assert kept == ("http://10.99.0.1:18080", True, {"10.99.0.1:18080"})
    assert {"type": "status", "connected": False} in seen
    assert [e["type"] for e in seen].count("hello") == 2    # greeted again at the new address
    assert tail == {"10.99.0.7:18080"}
    assert "/heartbeat?on=0" in mesh.devices["10.99.0.7:18080"].posts
    lost = seen.index({"type": "status", "connected": False})
    blank = [e for e in seen[lost:] if e["type"] == "pulse"][0]
    assert blank["bpm"] is None and blank["contact"] is False


def test_resolver_trouble_never_stops_the_source():
    class Broken(FakeResolver):
        async def start(self):
            raise OSError("no such interface")

        async def resolve(self):
            self.asked += 1
            raise RuntimeError("mDNS socket closed")

    async def run():
        mesh, resolver = Mesh(), Broken()
        dev, events = await start(resolver, mesh.handler)
        await until(lambda: resolver.asked >= 2)
        out = (dev.connected, list(mesh.hosts), list(events))
        await dev.stop()
        return out

    assert asyncio.run(run()) == (False, [], [])


def info(role, addresses, port=18080, server="device-a933500b.mesh.local."):
    props = {b"role": role.encode()} if role else {}
    return SimpleNamespace(properties=props, port=port, server=server, parsed_addresses=lambda: list(addresses))


class FakeZeroconf:
    def __init__(self, table):
        self.table, self.asked = table, []

    async def async_get_service_info(self, service_type, name, timeout=None):
        self.asked.append((service_type, name))
        return self.table.get(name)


def test_mdns_resolver_picks_the_role_and_an_ipv4_address():
    async def run():
        r = MdnsResolver()
        assert await r.resolve() is None                    # not started: nothing known
        r._azc = FakeZeroconf({
            "data-manager._http._tcp.local.": info("data-manager", ["10.99.0.1"], 8100),
            "modulino-hub._http._tcp.local.": info(ROLE, ["fe80::1", "10.99.0.1"]),
            "printer._http._tcp.local.": info(None, ["10.99.0.9"], 80),
        })
        added, removed = SimpleNamespace(name="Added"), SimpleNamespace(name="Removed")
        for name in ("modulino-hub._http._tcp.local.", "data-manager._http._tcp.local.",
                     "printer._http._tcp.local.", "gone._http._tcp.local."):
            r._on_change(zeroconf=None, service_type=SERVICE, name=name, state_change=added)
        assert await r.resolve() == "http://10.99.0.1:18080"
        assert all(t == SERVICE for t, _ in r._azc.asked)
        r._on_change(zeroconf=None, service_type=SERVICE, name="modulino-hub._http._tcp.local.",
                     state_change=removed)
        assert await r.resolve() is None                    # the advert was withdrawn
        r._azc.table["modulino-hub-2._http._tcp.local."] = info(ROLE, ["10.99.0.7"])
        r._on_change(zeroconf=None, service_type=SERVICE, name="modulino-hub-2._http._tcp.local.",
                     state_change=added)
        assert await r.resolve() == "http://10.99.0.7:18080"
        r._azc = None

    asyncio.run(run())


def test_mdns_resolver_ignores_adverts_that_are_not_wendy_net_publications(caplog):
    async def run(**kw):
        r = MdnsResolver(**kw)
        r._azc = FakeZeroconf({
            "modulino-hub._http._tcp.local.": info(ROLE, ["10.99.0.1"]),
            "modulino-hub-2._http._tcp.local.": info(ROLE, ["192.168.1.50"], 8080, server="laptop.local."),
        })
        for name in r._azc.table:
            r._on_change(name=name, state_change=SimpleNamespace(name="Added"))
        first = await r.resolve()
        del r._azc.table["modulino-hub._http._tcp.local."]
        return first, await r.resolve(), await r.resolve()

    with caplog.at_level("WARNING", logger="afferent.bedside"):
        assert asyncio.run(run()) == ("http://10.99.0.1:18080", None, None)
    ignored = [m for m in caplog.messages if "not published through Wendy Net" in m]
    assert len(ignored) == 1 and "laptop.local." in ignored[0]              # said once, not on every lookup
    assert asyncio.run(run(mesh_only=False))[0] == "http://192.168.1.50:8080"
