"""The home hub announces itself on its own network: `_http._tcp` with TXT role=home-hub.

    AFFERENT_HUB_ADVERTISE=1      (set in jetson/home_hub/wendy.json; off everywhere else)

On the Jetson the hub runs on the Wendy Net mesh, so this advert is what lets the LAN door
(jetson/home_hub/door) and other mesh apps find the hub's address, the same way the hub itself finds
the UNO Q (role=modulino-hub) and the data manager (role=data-manager). Wendy Net projects it with the
hub's mesh service address and the published port; the raw advert names the container address.

It names an address and a port, never the pairing token: the TXT record is readable by anything on the
network. A failing advert is logged and leaves the hub running.

zeroconf is imported only here and only when the advert starts, so the laptop hub does not need it.
"""
import logging
import os
import socket

from .bedside.unoq_auto import SERVICE, mesh_ipv4

log = logging.getLogger("afferent.home")

ROLE = "home-hub"
PORT = 8000                 # the container port; Wendy translates it to the published one (18000)


def enabled(env=None) -> bool:
    env = os.environ if env is None else env
    return str(env.get("AFFERENT_HUB_ADVERTISE", "")).strip().lower() in ("1", "true", "yes", "on")


def label(text: str) -> str:
    """A DNS label from a host name: lower case letters, digits and dashes, at most 40 characters."""
    out = "".join(c if c.isalnum() else "-" for c in (text or "").lower()).strip("-")
    return out[:40].strip("-") or "hub"


def service_info(address: str, port: int = PORT, host: str | None = None):
    from zeroconf import ServiceInfo

    host = label(host if host is not None else socket.gethostname())
    return ServiceInfo(SERVICE, f"afferent-home-hub-{host}.{SERVICE}",
                       addresses=[socket.inet_aton(address)], port=port,
                       properties={"role": ROLE, "v": "1"}, server=f"afferent-home-hub-{host}.local.")


class HubAdvert:
    def __init__(self, port: int = PORT, address: str | None = None):
        self.port = port
        self.address = address
        self.info = None
        self._azc = None

    async def start(self) -> bool:
        from zeroconf import IPVersion
        from zeroconf.asyncio import AsyncZeroconf

        address = self.address or mesh_ipv4()
        if not address:
            log.warning("hub advert: no IPv4 address on the mesh interface; the hub is not announced")
            return False
        self._azc = AsyncZeroconf(ip_version=IPVersion.V4Only, interfaces=[address])
        self.info = service_info(address, self.port)
        await self._azc.async_register_service(self.info, allow_name_change=True)
        log.info("hub advert: %s on %s:%s (role=%s)", self.info.name, address, self.port, ROLE)
        return True

    async def stop(self) -> None:
        azc, self._azc = self._azc, None
        if azc is None:
            return
        try:
            if self.info is not None:
                await azc.async_unregister_service(self.info)
        finally:
            await azc.async_close()


async def start_advert(advert) -> object | None:
    """Starts it, logs a failure and returns None instead of raising: the hub works without it."""
    try:
        return advert if await advert.start() else None
    except Exception as e:
        log.warning("hub advert could not start (%s: %s); the LAN door finds the hub by its published port only",
                    type(e).__name__, e)
        return None


async def stop_advert(advert) -> None:
    if advert is None:
        return
    try:
        await advert.stop()
    except Exception as e:
        log.warning("hub advert did not stop cleanly (%s: %s)", type(e).__name__, e)
