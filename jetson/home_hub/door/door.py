"""The home hub's door on the Jetson's own Wi-Fi or Ethernet (Wendy app `afferent-home-hub-door`).

The hub (jetson/home_hub, Wendy app `afferent-home-hub`) runs on the Wendy Net mesh. Mesh networking
publishes its port to mesh peers only, never on the Jetson's LAN interfaces, so until now a phone on the
same Wi-Fi reached it only through a Mac (`wendy net forward` plus a relay). This app runs with host
networking and is that relay on the Jetson itself:

- It listens on 0.0.0.0:AFFERENT_DOOR_PORT (8800) and copies bytes both ways to the hub. It is a TCP
  pipe: HTTP, the pairing redirect and the app WebSocket pass unchanged, and the hub's own guard still
  wants the pairing token on every route but /api/health. The door never parses, keeps or logs what passes.
- It finds the hub (AFFERENT_DOOR_UPSTREAM=auto, the default): first 127.0.0.1:18000, the hub's mesh
  port as Wendy publishes it on the host; then the hub's own advert (`_http._tcp`, role=home-hub,
  hub/afferent_hub/advert.py) as seen on the host side of the Wendy app bridges. A candidate counts
  only when its /api/health answers like the hub. AFFERENT_DOOR_UPSTREAM=host:port[,host:port] pins it.
- It announces `_afferent-hub._tcp` on the LAN interfaces (Bonjour), so the phone app's "Find on this
  Wi-Fi" sees it. The TXT record says role and version only: no token, no patient, no name.
  AFFERENT_DOOR_INTERFACES=wlan0[,eth0] limits it to those interfaces; AFFERENT_DOOR_ADVERTISE=0 turns
  it off. A failing advert or browser is logged and the relay keeps working.

Standard library only, plus zeroconf (and its ifaddr) for the adverts.
"""
import asyncio
import contextlib
import ipaddress
import json
import logging
import os
import socket

log = logging.getLogger("afferent.door")

PORT = 8800
LOOPBACK = ("127.0.0.1", 18000)
LAN_SERVICE = "_afferent-hub._tcp.local."
MESH_SERVICE = "_http._tcp.local."
ROLE = "home-hub"
TXT = {"role": ROLE, "v": "1"}
MAX_CONNECTIONS = 64
PROBE_TIMEOUT_S = 5.0
CONNECT_TIMEOUT_S = 3.0
RESOLVE_TIMEOUT_MS = 1500
REFRESH_S = 30.0
SEARCH_S = 5.0
GRACE_S = 5.0
CHUNK = 65536
MAX_HEALTH_BYTES = 256 * 1024
# never the LAN: loopback, Wendy app bridges and the mesh radio, container and VPN plumbing
NOT_LAN = ("lo", "wendy-", "wlmesh", "wlmp", "docker", "veth", "br-", "cni", "flannel", "tailscale", "zt",
           "virbr", "tun", "wg")
MESH = ipaddress.ip_network("10.99.0.0/16")

UNAVAILABLE_BODY = json.dumps({
    "error": "hub_unreachable",
    "detail": "The home hub's LAN door is up but the hub does not answer; see the door's log",
}).encode()
UNAVAILABLE = (b"HTTP/1.1 503 Service Unavailable\r\nContent-Type: application/json\r\nCache-Control: no-store\r\n"
               b"Connection: close\r\nContent-Length: " + str(len(UNAVAILABLE_BODY)).encode() + b"\r\n\r\n"
               + UNAVAILABLE_BODY)


# ── settings ─────────────────────────────────────────────────────────────────────────────────────────
def parse_upstreams(text) -> list[tuple[str, int]]:
    """AFFERENT_DOOR_UPSTREAM: empty or `auto` is [], else `host:port[,host:port]`, IPv6 in brackets."""
    text = (text or "").strip()
    if not text or text.lower() == "auto":
        return []
    out = []
    for part in (p.strip() for p in text.split(",")):
        if not part:
            continue
        host, sep, port = part.rpartition(":")
        host = host.strip()
        if host.startswith("[") and host.endswith("]"):
            host = host[1:-1]
        if not sep or not host or not port.isdigit() or not 0 < int(port) < 65536:
            raise ValueError(f"AFFERENT_DOOR_UPSTREAM: {part!r} is not host:port")
        out.append((host, int(port)))
    return out


def names(text) -> tuple[str, ...]:
    return tuple(n.strip() for n in (text or "").split(",") if n.strip())


def label(text: str) -> str:
    """A DNS label from a host name: lower case letters, digits and dashes, at most 40 characters."""
    out = "".join(c if c.isalnum() else "-" for c in (text or "").lower()).strip("-")
    return out[:40].strip("-") or "hub"


# ── interfaces ───────────────────────────────────────────────────────────────────────────────────────
def adapters() -> list[tuple[str, list[str]]]:
    """(interface name, its IPv4 addresses) for every interface of the host."""
    import ifaddr

    return [(a.nice_name or a.name, [ip.ip for ip in a.ips if isinstance(ip.ip, str)]) for a in ifaddr.get_adapters()]


def _v4(text: str):
    try:
        return ipaddress.IPv4Address(text)
    except ValueError:
        return None


def lan_addresses(ifaces, only: tuple[str, ...] = ()) -> list[str]:
    """IPv4 addresses a phone on the same Wi-Fi or Ethernet can reach. `only` names the interfaces;
    otherwise every interface but loopback, the mesh and the container plumbing (NOT_LAN)."""
    out = []
    for name, ips in ifaces:
        if (name not in only) if only else name.startswith(NOT_LAN):
            continue
        for ip in ips:
            a = _v4(ip)
            if a is None or a.is_loopback or a.is_multicast or a.is_unspecified or a in MESH:
                continue
            if ip not in out:
                out.append(ip)
    return out


def bridge_addresses(ifaces) -> list[str]:
    """The host's own IPv4 addresses on the Wendy app bridges, where the hub's raw advert is heard."""
    return [ip for name, ips in ifaces if name.startswith("wendy-") for ip in ips if _v4(ip) is not None]


# ── is it the hub? ───────────────────────────────────────────────────────────────────────────────────
def _dechunk(body: bytes) -> bytes:
    out, rest = b"", body
    while rest:
        size, _, rest = rest.partition(b"\r\n")
        n = int(size.split(b";")[0] or b"0", 16)
        if n == 0:
            break
        out, rest = out + rest[:n], rest[n + 2:]
    return out


def looks_like_hub(raw: bytes) -> bool:
    """An HTTP answer to GET /api/health from the hub: 200 and a JSON object with ok true and bedside."""
    head, _, body = raw.partition(b"\r\n\r\n")
    lines = head.split(b"\r\n")
    parts = lines[0].split()
    if len(parts) < 2 or not parts[0].startswith(b"HTTP/") or parts[1] != b"200":
        return False
    if any(line.lower().replace(b" ", b"") == b"transfer-encoding:chunked" for line in lines[1:]):
        try:
            body = _dechunk(body)
        except ValueError:
            return False
    try:
        data = json.loads(body)
    except ValueError:
        return False
    return isinstance(data, dict) and data.get("ok") is True and "bedside" in data


async def probe(host: str, port: int, timeout: float = PROBE_TIMEOUT_S) -> bool:
    async def ask() -> bytes:
        reader, writer = await asyncio.open_connection(host, port)
        try:
            name = f"[{host}]" if ":" in host else host
            writer.write(f"GET /api/health HTTP/1.1\r\nHost: {name}:{port}\r\nAccept: application/json\r\n"
                         "Connection: close\r\n\r\n".encode())
            await writer.drain()
            raw = b""
            while len(raw) < MAX_HEALTH_BYTES:
                chunk = await reader.read(CHUNK)
                if not chunk:
                    break
                raw += chunk
            return raw
        finally:
            writer.close()
            with contextlib.suppress(Exception):
                await writer.wait_closed()

    try:
        return looks_like_hub(await asyncio.wait_for(ask(), timeout))
    except (OSError, asyncio.TimeoutError, ValueError):
        return False


# ── where the hub is ─────────────────────────────────────────────────────────────────────────────────
class Upstream:
    def __init__(self, pinned=(), browser=None, loopback=LOOPBACK, probe=probe):
        self.pinned = list(pinned)
        self.browser = browser
        self.loopback = loopback
        self.probe = probe
        self.current: tuple[str, int] | None = None
        self._lock = asyncio.Lock()
        self._missed: list | None = None

    async def candidates(self) -> list[tuple[str, int]]:
        if self.pinned:
            return list(self.pinned)
        out = [self.loopback]
        if self.browser is not None:
            try:
                found = await self.browser.addresses()
            except Exception as e:
                log.warning("door: the hub's advert could not be read (%s: %s)", type(e).__name__, e)
                found = []
            out += [c for c in found if c not in out]
        return out

    async def pick(self, force: bool = False) -> tuple[str, int] | None:
        async with self._lock:
            if self.current is not None and not force:
                return self.current
            tried = await self.candidates()
            for c in tried:
                if await self.probe(*c):
                    if c != self.current:
                        log.info("door: hub found at %s:%s%s", c[0], c[1],
                                 f", was {self.current[0]}:{self.current[1]}" if self.current else "")
                    self.current, self._missed = c, None
                    return c
            if self.current is not None or self._missed != tried:
                log.warning("door: no hub answers /api/health at %s; trying again", ", ".join(f"{h}:{p}" for h, p in tried))
            self.current, self._missed = None, tried
            return None

    async def check(self) -> None:
        """The hub still answers, or another is looked for."""
        if self.current is None or not await self.probe(*self.current):
            await self.pick(force=True)

    async def open(self):
        """(reader, writer) to the hub, or None when no hub answers."""
        for _ in range(2):
            c = self.current or await self.pick()
            if c is None:
                return None
            try:
                return await asyncio.wait_for(asyncio.open_connection(*c), CONNECT_TIMEOUT_S)
            except (OSError, asyncio.TimeoutError) as e:
                log.warning("door: hub at %s:%s did not take the connection (%s); looking again", c[0], c[1],
                            type(e).__name__)
                if self.current == c:
                    self.current = None
        return None


# ── the pipe ─────────────────────────────────────────────────────────────────────────────────────────
def keepalive(writer) -> None:
    sock = writer.get_extra_info("socket")
    if sock is None:
        return
    with contextlib.suppress(OSError, AttributeError):
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_KEEPALIVE, 1)
        sock.setsockopt(socket.IPPROTO_TCP, socket.TCP_KEEPIDLE, 60)
        sock.setsockopt(socket.IPPROTO_TCP, socket.TCP_KEEPINTVL, 15)
        sock.setsockopt(socket.IPPROTO_TCP, socket.TCP_KEEPCNT, 4)


async def pipe(reader, writer) -> None:
    try:
        while True:
            data = await reader.read(CHUNK)
            if not data:
                break
            writer.write(data)
            await writer.drain()
    except (OSError, asyncio.IncompleteReadError):
        pass
    finally:
        with contextlib.suppress(OSError, RuntimeError):
            if writer.can_write_eof():
                writer.write_eof()


async def close(writer) -> None:
    writer.close()
    with contextlib.suppress(Exception):
        await writer.wait_closed()


class Door:
    def __init__(self, upstream: Upstream, max_connections: int = MAX_CONNECTIONS, grace_s: float = GRACE_S):
        self.upstream = upstream
        self.max = max_connections
        self.grace_s = grace_s
        self.active = 0
        self.served = 0

    async def handle(self, reader, writer) -> None:
        if self.active >= self.max:
            await close(writer)
            return
        self.active += 1
        hub_writer = None
        try:
            hub = await self.upstream.open()
            if hub is None:
                writer.write(UNAVAILABLE)
                with contextlib.suppress(OSError):
                    await writer.drain()
                return
            hub_reader, hub_writer = hub
            keepalive(writer)
            keepalive(hub_writer)
            self.served += 1
            ways = [asyncio.ensure_future(pipe(reader, hub_writer)), asyncio.ensure_future(pipe(hub_reader, writer))]
            _, pending = await asyncio.wait(ways, return_when=asyncio.FIRST_COMPLETED)
            if pending:
                # one side is done: the other gets a moment to finish its answer, then both close
                _, pending = await asyncio.wait(pending, timeout=self.grace_s)
            for t in pending:
                t.cancel()
            await asyncio.gather(*ways, return_exceptions=True)
        finally:
            self.active -= 1
            if hub_writer is not None:
                await close(hub_writer)
            await close(writer)


# ── adverts ──────────────────────────────────────────────────────────────────────────────────────────
def lan_service_info(addresses: list[str], port: int, host: str | None = None):
    from zeroconf import ServiceInfo

    host = label(host if host is not None else socket.gethostname())
    return ServiceInfo(LAN_SERVICE, f"Afferent home hub {host}.{LAN_SERVICE}",
                       addresses=[socket.inet_aton(a) for a in addresses], port=port,
                       properties=dict(TXT), server=f"afferent-hub-{host}.local.")


class LanAdvert:
    """`_afferent-hub._tcp` on the LAN addresses; announced again when they change (DHCP, another Wi-Fi)."""

    def __init__(self, port: int):
        self.port = port
        self.addresses: list[str] = []
        self.info = None
        self._azc = None

    async def update(self, addresses: list[str]) -> None:
        if addresses == self.addresses and (self._azc is not None or not addresses):
            return
        await self.stop()
        self.addresses = list(addresses)
        if not addresses:
            log.warning("door: no LAN address (Wi-Fi or Ethernet) yet; the hub is not announced")
            return
        from zeroconf import IPVersion
        from zeroconf.asyncio import AsyncZeroconf

        self._azc = AsyncZeroconf(ip_version=IPVersion.V4Only, interfaces=list(addresses))
        self.info = lan_service_info(addresses, self.port)
        await self._azc.async_register_service(self.info, allow_name_change=True)
        log.info("door: announced %s on %s port %s", self.info.name, ", ".join(addresses), self.port)

    async def stop(self) -> None:
        azc, self._azc = self._azc, None
        if azc is None:
            return
        try:
            if self.info is not None:
                await azc.async_unregister_service(self.info)
        finally:
            await azc.async_close()


class HubBrowser:
    """The hub's own advert (role=home-hub), heard on the host side of the Wendy app bridges."""

    def __init__(self):
        self.interfaces: list[str] = []
        self._azc = None
        self._browser = None
        self._names: dict[str, None] = {}

    async def update(self, interfaces: list[str]) -> None:
        if interfaces == self.interfaces and (self._azc is not None or not interfaces):
            return
        await self.stop()
        self.interfaces = list(interfaces)
        if not interfaces:
            return
        from zeroconf import IPVersion
        from zeroconf.asyncio import AsyncServiceBrowser, AsyncZeroconf

        self._azc = AsyncZeroconf(ip_version=IPVersion.V4Only, interfaces=list(interfaces))
        self._browser = AsyncServiceBrowser(self._azc.zeroconf, MESH_SERVICE, handlers=[self._on_change])

    def _on_change(self, zeroconf=None, service_type=None, name=None, state_change=None, **_):
        self._names.pop(name, None)
        if getattr(state_change, "name", "") != "Removed":
            self._names[name] = None    # newest last

    async def addresses(self) -> list[tuple[str, int]]:
        if self._azc is None:
            return []
        out = []
        for name in reversed(list(self._names)):
            info = await self._azc.async_get_service_info(MESH_SERVICE, name, timeout=RESOLVE_TIMEOUT_MS)
            if info is None or (info.properties or {}).get(b"role") != ROLE.encode() or not info.port:
                continue
            out += [(a, info.port) for a in info.parsed_addresses() if _v4(a) is not None and (a, info.port) not in out]
        return out

    async def stop(self) -> None:
        browser, azc = self._browser, self._azc
        self._browser = self._azc = None
        self._names.clear()
        if browser is not None:
            await browser.async_cancel()
        if azc is not None:
            await azc.async_close()


# ── main ─────────────────────────────────────────────────────────────────────────────────────────────
async def _quietly(what: str, step, errors: dict) -> None:
    """Runs one advert step; a failure is logged once per kind and never stops the door."""
    try:
        await step
        errors.pop(what, None)
    except Exception as e:
        text = f"{type(e).__name__}: {e}"
        if errors.get(what) != text:
            errors[what] = text
            log.warning("door: %s failed (%s); the relay keeps working", what, text)


async def _read_adapters(into: list) -> None:
    into[:] = adapters()


async def serve(env=None) -> None:
    env = os.environ if env is None else env
    port = int(env.get("AFFERENT_DOOR_PORT") or PORT)
    pinned = parse_upstreams(env.get("AFFERENT_DOOR_UPSTREAM"))
    only = names(env.get("AFFERENT_DOOR_INTERFACES"))
    advertise = (env.get("AFFERENT_DOOR_ADVERTISE") or "1").strip() != "0"
    browser = None if pinned else HubBrowser()
    upstream = Upstream(pinned, browser)
    door = Door(upstream)
    server = await asyncio.start_server(door.handle, host="0.0.0.0", port=port, reuse_address=True)
    log.info("door: listening on 0.0.0.0:%s; hub %s", port,
             ", ".join(f"{h}:{p}" for h, p in pinned) if pinned else
             f"auto ({LOOPBACK[0]}:{LOOPBACK[1]}, then its role={ROLE} advert)")
    lan = LanAdvert(port) if advertise else None
    errors: dict = {}
    try:
        while True:
            ifaces: list = []
            await _quietly("reading the interfaces", _read_adapters(ifaces), errors)
            if browser is not None:
                await _quietly("browsing for the hub's advert", browser.update(bridge_addresses(ifaces)), errors)
            if lan is not None:
                await _quietly("announcing on the LAN", lan.update(lan_addresses(ifaces, only)), errors)
            await upstream.check()
            await asyncio.sleep(REFRESH_S if upstream.current else SEARCH_S)
    finally:
        server.close()
        await server.wait_closed()
        if lan is not None:
            await _quietly("withdrawing the LAN advert", lan.stop(), errors)
        if browser is not None:
            await _quietly("stopping the browser", browser.stop(), errors)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
    with contextlib.suppress(KeyboardInterrupt):
        asyncio.run(serve())
