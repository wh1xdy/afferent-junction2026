"""MdnsResolver (bedside/unoq_auto.py) against real zeroconf, on the loopback interface.

A second zeroconf instance publishes adverts on 127.0.0.1 the way the UNO Q and the data manager do
on the mesh; the resolver browses with MDNS_ADDRESS=127.0.0.1, so start(), the browser callback and
the lookups all run for real. Needs zeroconf (hub/requirements-dev.txt) and multicast on loopback
(macOS has it; most Linux loopbacks do not): without either the test is skipped, and says why.
"""
import asyncio
import socket
import time
import uuid

import pytest

from afferent_hub.bedside.unoq_auto import SERVICE, MdnsResolver

zeroconf = pytest.importorskip("zeroconf", reason="zeroconf is not installed (hub/requirements-dev.txt)")
from zeroconf import IPVersion, ServiceInfo  # noqa: E402
from zeroconf.asyncio import AsyncZeroconf  # noqa: E402

LOOP = "127.0.0.1"


def advert(role: str, server: str, port: int) -> ServiceInfo:
    name = f"{role}-test-{uuid.uuid4().hex[:8]}.{SERVICE}"
    return ServiceInfo(SERVICE, name, addresses=[socket.inet_aton(LOOP)], port=port,
                       properties={"role": role}, server=server)


def test_the_resolver_finds_real_adverts_and_keeps_to_the_role_and_the_mesh(monkeypatch):
    monkeypatch.setenv("MDNS_ADDRESS", LOOP)
    tag = uuid.uuid4().hex[:8]
    mesh = f"device-{tag}.mesh.local."
    published = [advert("modulino-hub", mesh, 18080), advert("data-manager", mesh, 8100),
                 advert("modulino-hub", f"laptop-{tag}.local.", 8080)]

    async def run():
        try:
            pub = AsyncZeroconf(ip_version=IPVersion.V4Only, interfaces=[LOOP])
        except OSError as e:
            pytest.skip(f"no mDNS socket on {LOOP}: {e}")
        unoq, dm = MdnsResolver("modulino-hub"), MdnsResolver("data-manager")
        try:
            for info in published:
                await pub.async_register_service(info)
            await unoq.start()
            await dm.start()
            end = time.monotonic() + 8
            while time.monotonic() < end:
                found = {a["server"]: a["url"] for a in await unoq.adverts()}
                if found and await dm.resolve():
                    break
                await asyncio.sleep(0.2)
            if not unoq._names:
                pytest.skip(f"no mDNS answer came back over {LOOP} (multicast on loopback is off here)")
            return found, await unoq.resolve(), await dm.adverts()
        finally:
            await unoq.stop()
            await dm.stop()
            await pub.async_unregister_all_services()
            await pub.async_close()

    found, url, dms = asyncio.run(run())
    assert found == {mesh: f"http://{LOOP}:18080"}          # the role, and only the mesh host name
    assert url == f"http://{LOOP}:18080"
    assert [(a["server"], a["url"]) for a in dms] == [(mesh, f"http://{LOOP}:8100")]
