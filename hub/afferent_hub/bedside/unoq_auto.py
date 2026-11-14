"""UNO Q `modulino-hub` found over mDNS instead of a pinned address.

    AFFERENT_BEDSIDE=unoq:auto

For a hub that runs on the Wendy Net mesh itself (jetson/home_hub). The UNO Q app advertises
`_http._tcp` with TXT `role=modulino-hub`; the mesh hands out an address and port that are reachable
from this container. The address is looked up before the first poll and again whenever the link is
lost. A link that works is never replaced by another advert. Everything else is UnoQHttp.

Only adverts whose host name ends in `.mesh.local.` count: that is how Wendy Net names what it
publishes, and it keeps plain mDNS adverts from the local network out when LAN projection is enabled
on a device. It is a filter, not authentication: the advertiser chooses the name, so anything that
can advertise on the mesh can pose as the role.

zeroconf is imported only here and only when discovery starts, so the laptop hub does not need it.
"""
import asyncio
import logging
import os
import time

import httpx

from .unoq_http import UnoQHttp

log = logging.getLogger("afferent.bedside")

SERVICE = "_http._tcp.local."
ROLE = "modulino-hub"
MESH_SUFFIX = ".mesh.local."
RESOLVE_TIMEOUT_MS = 1500
RESOLVE_EVERY_S = 5.0        # while there is no link; mDNS answers come from the cache when fresh


def mesh_ipv4() -> str | None:
    """Address of the mesh interface (a Wendy app's private eth0), None to listen on all interfaces."""
    if os.environ.get("MDNS_ADDRESS"):
        return os.environ["MDNS_ADDRESS"]
    interface = os.environ.get("MDNS_INTERFACE", "eth0")
    try:
        import fcntl
        import socket
        import struct

        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
            packed = struct.pack("256s", interface.encode()[:15])
            return socket.inet_ntoa(fcntl.ioctl(sock.fileno(), 0x8915, packed)[20:24])  # Linux SIOCGIFADDR
    except (ImportError, OSError):
        return None


class MdnsResolver:
    def __init__(self, role: str = ROLE, mesh_only: bool = True):
        self.role = role.encode()
        self.mesh_only = mesh_only
        self._ignored: set[str] = set()
        self._azc = None
        self._browser = None
        self._names: dict[str, None] = {}

    async def start(self) -> None:
        from zeroconf import IPVersion
        from zeroconf.asyncio import AsyncServiceBrowser, AsyncZeroconf

        address = mesh_ipv4()
        kw = {"interfaces": [address]} if address else {}
        self._azc = AsyncZeroconf(ip_version=IPVersion.V4Only, **kw)
        self._browser = AsyncServiceBrowser(self._azc.zeroconf, SERVICE, handlers=[self._on_change])
        log.info("mDNS: browsing %s for role=%s on %s", SERVICE, self.role.decode(), address or "all interfaces")

    def _on_change(self, zeroconf=None, service_type=None, name=None, state_change=None, **_):
        self._names.pop(name, None)
        if getattr(state_change, "name", "") != "Removed":
            self._names[name] = None    # newest last

    async def adverts(self) -> list[dict]:
        """Every advert of the role that resolves, oldest first: name, server (host name) and url."""
        if self._azc is None:
            return []
        out = []
        for name in list(self._names):
            info = await self._azc.async_get_service_info(SERVICE, name, timeout=RESOLVE_TIMEOUT_MS)
            if info is None or (info.properties or {}).get(b"role") != self.role:
                continue
            server = str(getattr(info, "server", "") or "")
            if self.mesh_only and not server.lower().endswith(MESH_SUFFIX):
                if name not in self._ignored:
                    self._ignored.add(name)
                    log.warning("mDNS: ignoring %s advert %s from %s: host name is not a Wendy Net one (%s)",
                                self.role.decode(), name, server or "an unnamed host", MESH_SUFFIX)
                continue
            addrs = [a for a in info.parsed_addresses() if ":" not in a]
            if addrs and info.port:
                out.append({"name": name, "server": server, "url": f"http://{addrs[0]}:{info.port}"})
        return out

    async def resolve(self) -> str | None:
        found = await self.adverts()
        return found[-1]["url"] if found else None

    async def stop(self) -> None:
        browser, azc = self._browser, self._azc
        self._browser = self._azc = None
        if browser is not None:
            await browser.async_cancel()
        if azc is not None:
            await azc.async_close()


class UnoQAuto(UnoQHttp):
    def __init__(self, resolver=None, poll_s: float = 1.0, transport=None,
                 resolve_every_s: float = RESOLVE_EVERY_S):
        super().__init__("", poll_s=poll_s, transport=transport)
        self.base_url = ""              # unknown until the first advert is resolved
        self.resolver = resolver or MdnsResolver()
        self.resolve_every_s = resolve_every_s
        self._resolve_at = 0.0
        self._waiting_logged = False

    async def start(self, on_event) -> None:
        try:
            await self.resolver.start()
        except Exception as e:
            log.warning("UNO Q discovery could not start (%s: %s)", type(e).__name__, e)
        await super().start(on_event)

    async def stop(self) -> None:
        try:
            await super().stop()
        finally:
            try:
                await self.resolver.stop()
            except Exception as e:
                log.warning("UNO Q discovery did not stop cleanly (%s: %s)", type(e).__name__, e)

    async def poll_once(self) -> None:
        if not self.connected and time.monotonic() >= self._resolve_at:
            await self._locate()
            wait = self.resolve_every_s if self.base_url else min(1.0, self.resolve_every_s)
            self._resolve_at = time.monotonic() + wait
        if self.base_url:
            await super().poll_once()

    async def _locate(self) -> None:
        try:
            url = await self.resolver.resolve()
        except asyncio.CancelledError:
            raise
        except Exception as e:
            self._log_once("discovery", e)
            return
        if not url:
            if not self._waiting_logged:
                self._waiting_logged = True
                log.warning("UNO Q discovery: no %s advert seen yet; logged once until one is found", ROLE)
            return
        self._waiting_logged = False
        url = url.rstrip("/")
        if url == self.base_url:
            return
        old = self._client
        self._client = httpx.AsyncClient(base_url=url, timeout=2.0, transport=self._transport)
        log.info("UNO Q found at %s (mDNS role=%s)%s", url, ROLE, f", was {self.base_url}" if self.base_url else "")
        self.base_url = url
        if old is not None:
            await old.aclose()
