"""The home hub's LAN door (jetson/home_hub/door/door.py), without a device.

    cd jetson/home_hub && python3 -m unittest discover tests

A fake hub (an asyncio server that answers /api/health like the hub and records what it was sent) stands
in for afferent-home-hub. The relay, the choice of upstream and the 503 run for real on 127.0.0.1. The
Bonjour parts need zeroconf (hub/requirements-dev.txt) and multicast on loopback (macOS has it); without
either they are skipped, and say why.
"""
import asyncio
import contextlib
import json
import re
import socket
import sys
import time
import unittest
import uuid
from pathlib import Path

HERE = Path(__file__).resolve().parents[1]
ROOT = HERE.parents[1]
sys.path.insert(0, str(HERE / "door"))

import door  # noqa: E402

try:
    import zeroconf  # noqa: F401
    from zeroconf import IPVersion
    from zeroconf.asyncio import AsyncZeroconf
except ImportError:
    zeroconf = None

HEALTH = {"ok": True, "version": "test", "now_iso": "2026-11-15T10:00:00+02:00", "patients": 1,
          "bedside": {"source": "unoq", "connected": True}, "gemma": {"available": False, "model": None}}


def http(status: str, body: bytes, extra: str = "") -> bytes:
    return (f"HTTP/1.1 {status}\r\nContent-Type: application/json\r\nContent-Length: {len(body)}\r\n{extra}"
            "Connection: close\r\n\r\n").encode() + body


class FakeHub:
    """Answers GET /api/health with `health` (the hub's by default); anything else is recorded and echoed:
    the request it got comes back as the body, then every later byte comes back as it is (a WebSocket)."""

    def __init__(self, health: dict | None = None, status: str = "200 OK"):
        self.health, self.status = (HEALTH if health is None else health), status
        self.got: list[bytes] = []
        self.server = None
        self.port = None

    async def start(self):
        self.server = await asyncio.start_server(self.handle, "127.0.0.1", 0)
        self.port = self.server.sockets[0].getsockname()[1]
        return self

    async def handle(self, reader, writer):
        try:
            head = await reader.readuntil(b"\r\n\r\n")
            if head.startswith(b"GET /api/health "):
                writer.write(http(self.status, json.dumps(self.health).encode()))
            else:
                self.got.append(head)
                writer.write(b"HTTP/1.1 101 Switching Protocols\r\n\r\n" + head)
                await writer.drain()
                while data := await reader.read(65536):
                    writer.write(data)
                    await writer.drain()
            await writer.drain()
        except (asyncio.IncompleteReadError, OSError):
            pass
        finally:
            writer.close()

    async def stop(self):
        self.server.close()
        await self.server.wait_closed()


def free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


async def start_door(upstream, **kw):
    d = door.Door(upstream, **kw)
    server = await asyncio.start_server(d.handle, "127.0.0.1", 0)
    return d, server, server.sockets[0].getsockname()[1]


async def read_all(reader, timeout=3.0) -> bytes:
    out = b""
    with contextlib.suppress(asyncio.TimeoutError):
        while chunk := await asyncio.wait_for(reader.read(65536), timeout):
            out += chunk
    return out


class Settings(unittest.TestCase):
    def test_upstreams_are_auto_or_host_port(self):
        self.assertEqual(door.parse_upstreams(""), [])
        self.assertEqual(door.parse_upstreams(" auto "), [])
        self.assertEqual(door.parse_upstreams("127.0.0.1:18000, [fd45::1]:18000"),
                         [("127.0.0.1", 18000), ("fd45::1", 18000)])
        for bad in ("127.0.0.1", "hub:", ":8000", "hub:http", "hub:70000"):
            with self.assertRaises(ValueError, msg=bad):
                door.parse_upstreams(bad)

    def test_only_lan_addresses_are_announced(self):
        ifaces = [("lo", ["127.0.0.1"]), ("wlan0", ["10.0.32.31"]), ("wendy-a8149441", ["10.168.20.209"]),
                  ("wlmesh0", []), ("wlmp1c", []), ("eth0", ["192.168.1.5", "192.168.1.5"]), ("docker0", ["172.17.0.1"]),
                  ("veth12", ["10.1.0.1"]), ("odd0", ["10.99.0.4"]), ("usb0", ["not-an-address"])]
        self.assertEqual(door.lan_addresses(ifaces), ["10.0.32.31", "192.168.1.5"])
        self.assertEqual(door.lan_addresses(ifaces, ("wlan0",)), ["10.0.32.31"])
        self.assertEqual(door.bridge_addresses(ifaces), ["10.168.20.209"])

    def test_labels_are_dns_safe(self):
        self.assertEqual(door.label("wendyos-hackathon-device-12"), "wendyos-hackathon-device-12")
        self.assertEqual(door.label("Alex's Jetson.local"), "alex-s-jetson-local")
        self.assertEqual(door.label(""), "hub")

    def test_only_the_hubs_health_answer_counts(self):
        body = json.dumps(HEALTH).encode()
        self.assertTrue(door.looks_like_hub(http("200 OK", body)))
        chunked = (b"HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n" + f"{len(body):x}".encode() + b"\r\n"
                   + body + b"\r\n0\r\n\r\n")
        self.assertTrue(door.looks_like_hub(chunked))
        self.assertFalse(door.looks_like_hub(http("401 Unauthorized", body)))
        self.assertFalse(door.looks_like_hub(http("200 OK", b"<html>hello</html>")))
        self.assertFalse(door.looks_like_hub(http("200 OK", json.dumps({"ok": True}).encode())), "another app's health")
        self.assertFalse(door.looks_like_hub(http("200 OK", b"[]")))
        self.assertFalse(door.looks_like_hub(b""))

    def test_the_door_holds_no_token(self):
        src = (HERE / "door" / "door.py").read_text()
        manifest = json.loads((HERE / "door" / "wendy.json").read_text())
        read = re.findall(r"env\.get\(\"([A-Z_]+)\"", src)
        self.assertEqual(sorted(set(read)), ["AFFERENT_DOOR_ADVERTISE", "AFFERENT_DOOR_INTERFACES",
                                             "AFFERENT_DOOR_PORT", "AFFERENT_DOOR_UPSTREAM"])
        self.assertNotIn("environ[", src)
        self.assertFalse([k for k in manifest["env"] if "TOKEN" in k.upper()])
        self.assertNotIn("TOKEN", (HERE / "door" / "deploy.sh").read_text().replace("No token", ""))
        self.assertEqual({e["type"]: e.get("mode") for e in manifest["entitlements"]}, {"network": "host", "http": None})
        self.assertEqual(door.TXT, {"role": "home-hub", "v": "1"})


class Relay(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.hub = await FakeHub().start()

    async def asyncTearDown(self):
        await self.hub.stop()

    async def test_bytes_pass_unchanged_both_ways_and_a_dead_candidate_is_skipped(self):
        up = door.Upstream([("127.0.0.1", free_port()), ("127.0.0.1", self.hub.port)])
        d, server, port = await start_door(up)
        try:
            reader, writer = await asyncio.open_connection("127.0.0.1", port)
            key = uuid.uuid4().hex
            req = (f"GET /k/{key}/ws/app HTTP/1.1\r\nHost: 10.0.32.31:8800\r\nOrigin: capacitor://localhost\r\n"
                   "Upgrade: websocket\r\nConnection: Upgrade\r\n\r\n").encode()
            writer.write(req)
            await writer.drain()
            first = await reader.readuntil(b"\r\n\r\n")
            self.assertEqual(first, b"HTTP/1.1 101 Switching Protocols\r\n\r\n")
            self.assertEqual(await reader.readexactly(len(req)), req, "the hub got the request as it was sent")
            for frame in (b"\x81\x05hello", bytes(range(256)) * 300):
                writer.write(frame)
                await writer.drain()
                self.assertEqual(await reader.readexactly(len(frame)), frame, "and the stream after it")
            self.assertEqual(self.hub.got, [req])
            self.assertEqual(up.current, ("127.0.0.1", self.hub.port))
            self.assertEqual((d.active, d.served), (1, 1))
            writer.close()
            deadline = time.monotonic() + 3
            while d.active and time.monotonic() < deadline:
                await asyncio.sleep(0.01)
            self.assertEqual(d.active, 0, "the hub side is closed when the phone goes")
        finally:
            server.close()
            await server.wait_closed()

    async def test_auto_tries_the_published_port_then_the_hubs_advert_and_skips_other_apps(self):
        other = await FakeHub(health={"ok": True, "service": "posture"}).start()

        class Browser:
            async def addresses(self_inner):
                return [("127.0.0.1", other.port), ("127.0.0.1", self.hub.port)]

        try:
            up = door.Upstream(browser=Browser(), loopback=("127.0.0.1", free_port()))
            self.assertEqual(await up.candidates(), [up.loopback, ("127.0.0.1", other.port), ("127.0.0.1", self.hub.port)])
            self.assertEqual(await up.pick(), ("127.0.0.1", self.hub.port))
            pinned = door.Upstream([("127.0.0.1", self.hub.port)], browser=Browser())
            self.assertEqual(await pinned.candidates(), [("127.0.0.1", self.hub.port)], "a pinned hub is the only one")
        finally:
            await other.stop()

    async def test_no_hub_is_a_503_that_says_so(self):
        up = door.Upstream([("127.0.0.1", free_port())])
        d, server, port = await start_door(up)
        try:
            with self.assertLogs("afferent.door", "WARNING") as logs:
                reader, writer = await asyncio.open_connection("127.0.0.1", port)
                writer.write(b"GET /api/health HTTP/1.1\r\nHost: 10.0.32.31:8800\r\n\r\n")
                await writer.drain()
                raw = await read_all(reader)
            self.assertTrue(raw.startswith(b"HTTP/1.1 503 "), raw[:40])
            self.assertEqual(json.loads(raw.partition(b"\r\n\r\n")[2])["error"], "hub_unreachable")
            self.assertIn("no hub answers", "\n".join(logs.output))
            writer.close()
        finally:
            server.close()
            await server.wait_closed()

    async def test_a_hub_that_moves_is_found_again(self):
        second = await FakeHub().start()
        try:
            up = door.Upstream([("127.0.0.1", self.hub.port), ("127.0.0.1", second.port)])
            self.assertEqual(await up.pick(), ("127.0.0.1", self.hub.port))
            await self.hub.stop()
            await up.check()
            self.assertEqual(up.current, ("127.0.0.1", second.port))
            self.hub = await FakeHub().start()     # for asyncTearDown
        finally:
            await second.stop()

    async def test_the_whole_door_serves_from_its_settings(self):
        port = free_port()
        env = {"AFFERENT_DOOR_PORT": str(port), "AFFERENT_DOOR_UPSTREAM": f"127.0.0.1:{self.hub.port}",
               "AFFERENT_DOOR_ADVERTISE": "0"}
        task = asyncio.create_task(door.serve(env))
        try:
            for _ in range(100):
                try:
                    reader, writer = await asyncio.open_connection("127.0.0.1", port)
                    break
                except OSError:
                    await asyncio.sleep(0.02)
            writer.write(b"GET /api/health HTTP/1.1\r\nHost: 10.0.32.31:8800\r\n\r\n")
            await writer.drain()
            self.assertTrue(door.looks_like_hub(await read_all(reader)), "the hub's own health, through the door")
            writer.close()
        finally:
            task.cancel()
            await asyncio.gather(task, return_exceptions=True)

    async def test_connections_are_capped(self):
        up = door.Upstream([("127.0.0.1", self.hub.port)])
        d, server, port = await start_door(up, max_connections=1)
        try:
            r1, w1 = await asyncio.open_connection("127.0.0.1", port)
            w1.write(b"GET /ws/app HTTP/1.1\r\nHost: x\r\n\r\n")
            await w1.drain()
            await r1.readuntil(b"\r\n\r\n")
            r2, w2 = await asyncio.open_connection("127.0.0.1", port)
            self.assertEqual(await read_all(r2), b"", "the second one is closed at once")
            self.assertEqual(d.served, 1)
            w1.close()
            w2.close()
        finally:
            server.close()
            await server.wait_closed()


@unittest.skipIf(zeroconf is None, "zeroconf is not installed (hub/requirements-dev.txt)")
class Adverts(unittest.IsolatedAsyncioTestCase):
    def test_the_lan_advert_names_an_address_and_a_port_only(self):
        info = door.lan_service_info(["10.0.32.31"], 8800, host="wendyos-hackathon-device-12")
        self.assertEqual(info.type, "_afferent-hub._tcp.local.")
        self.assertEqual(info.port, 8800)
        self.assertEqual(info.parsed_addresses(), ["10.0.32.31"])
        self.assertEqual(info.properties, {b"role": b"home-hub", b"v": b"1"})
        self.assertEqual(info.server, "afferent-hub-wendyos-hackathon-device-12.local.")

    async def test_a_phone_browsing_the_lan_sees_the_door_without_a_token(self):
        loop = "127.0.0.1"
        lan = door.LanAdvert(8800)
        try:
            await lan.update([loop])
        except OSError as e:
            self.skipTest(f"no mDNS socket on {loop}: {e}")
        try:
            phone = AsyncZeroconf(ip_version=IPVersion.V4Only, interfaces=[loop])
            try:
                info, end = None, time.monotonic() + 8
                while info is None and time.monotonic() < end:
                    info = await phone.async_get_service_info(door.LAN_SERVICE, lan.info.name, timeout=1500)
                if info is None:
                    self.skipTest(f"no mDNS answer came back over {loop} (multicast on loopback is off here)")
                self.assertEqual((info.parsed_addresses(), info.port), ([loop], 8800))
                self.assertEqual(info.properties, {b"role": b"home-hub", b"v": b"1"})
            finally:
                await phone.async_close()
            await lan.update([loop])
            self.assertIsNotNone(lan._azc, "the same addresses: announced once, left alone")
        finally:
            await lan.stop()
        self.assertIsNone(lan._azc)

    async def test_the_door_finds_the_hubs_own_advert_over_real_mdns(self):
        """hub/afferent_hub/advert.py publishes, door.HubBrowser reads it: the contract between the two."""
        sys.path.insert(0, str(ROOT / "hub"))
        try:
            from afferent_hub import advert
        except ImportError as e:
            self.skipTest(f"the hub package does not import here ({e})")
        loop = "127.0.0.1"
        try:
            pub = AsyncZeroconf(ip_version=IPVersion.V4Only, interfaces=[loop])
        except OSError as e:
            self.skipTest(f"no mDNS socket on {loop}: {e}")
        hub_info = advert.service_info(loop, 18000, host=f"test-{uuid.uuid4().hex[:8]}")
        browser = door.HubBrowser()
        try:
            await pub.async_register_service(hub_info)
            await browser.update([loop])
            found, end = [], time.monotonic() + 8
            while not found and time.monotonic() < end:
                found = await browser.addresses()
                await asyncio.sleep(0.2)
            if not browser._names:
                self.skipTest(f"no mDNS answer came back over {loop} (multicast on loopback is off here)")
            self.assertIn((loop, 18000), found)
        finally:
            await browser.stop()
            await pub.async_unregister_all_services()
            await pub.async_close()


if __name__ == "__main__":
    unittest.main()
