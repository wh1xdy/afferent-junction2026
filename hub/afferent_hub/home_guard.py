"""Who may talk to the home hub (afferent_hub.home): an ASGI layer in front of the laptop hub's app.

The laptop hub has no login and answers every origin. On the patient's home box that is not enough:
the port is reachable by every app on the Wendy Net mesh, by a browser page on a laptop that runs
`wendy net forward`, and by whatever a relay for the phone listens on. So here:

- /api/* and /ws/* need the hub token (AFFERENT_HUB_TOKEN). Only /api/health is open. The token comes
  as `Authorization: Bearer`, as the cookie a pairing link sets, or as a path prefix `/k/<token>/...`
  (the phone app's hub address, because a WebSocket cannot carry a header). A page opened through
  the prefix gets the cookie and is sent on to the plain address.
- A request that names an Origin is refused unless that origin is this hub itself, the phone app, or
  listed in AFFERENT_HUB_ORIGINS. A Host that is a DNS name is refused unless listed in
  AFFERENT_HUB_HOSTS (an address or localhost cannot be a DNS rebinding target).
- /ws/bedside is closed unless the bedside really is a WebSocket device (AFFERENT_BEDSIDE=ws):
  with the UNO Q linked, nothing else may push a pulse that would be shown as measured.
- /api/demo/reset and /api/demo/profile are refused: they act on the real patient.

Without a token the hub answers 503 on the protected paths; AFFERENT_HUB_TOKEN=open switches the
check off on purpose (logged as a warning).
"""
import hmac
import ipaddress
import json
import logging
from http.cookies import SimpleCookie

log = logging.getLogger("afferent.home")

OPEN = "open"
COOKIE = "afferent_hub"
PREFIX = "/k/"
COOKIE_MAX_AGE_S = 30 * 24 * 3600
APP_ORIGINS = ("capacitor://localhost", "ionic://localhost", "http://localhost", "https://localhost")
PUBLIC = ("/api/health",)
PROTECTED = ("/api/", "/ws/", "/docs", "/redoc", "/openapi.json")
REFUSED = {
    "/api/demo/reset": ("reset_disabled", "The home hub holds a real patient's data; the demo reset is off here"),
    "/api/demo/profile": ("profile_disabled", "The home hub does not push demo profiles into the patient's app"),
}
HOME_PAGE = "/app/patient.html"


def _list(value) -> tuple[str, ...]:
    return tuple(v.strip().rstrip("/").lower() for v in str(value or "").split(",") if v.strip())


def host_name(host: str) -> str:
    host = host.strip().lower()
    if host.startswith("["):
        return host[1:].split("]", 1)[0]
    return host.rsplit(":", 1)[0] if host.count(":") == 1 else host


def is_address(name: str) -> bool:
    try:
        ipaddress.ip_address(name)
        return True
    except ValueError:
        return False


class HomeGuard:
    def __init__(self, app, token: str | None, bedside: str, origins="", hosts=""):
        self.app = app
        token = (token or "").strip()
        self.open = token.lower() == OPEN
        self.token = "" if self.open else token
        self.bedside_ws = bedside == "ws"
        self.origins = set(APP_ORIGINS) | set(_list(origins))
        self.hosts = {"localhost"} | set(_list(hosts))
        if self.open:
            log.warning("AFFERENT_HUB_TOKEN=open: every app on the mesh and every forward or relay can read "
                        "and write the patient's data on this hub")
        elif not self.token:
            log.warning("no AFFERENT_HUB_TOKEN: /api and /ws answer 503 until the hub is deployed with one")

    def host_ok(self, host: str) -> bool:
        name = host_name(host)
        return not name or is_address(name) or name in self.hosts

    def origin_ok(self, origin: str, host: str) -> bool:
        origin = origin.strip().rstrip("/").lower()
        return origin in self.origins or (bool(host) and origin in (f"http://{host.lower()}", f"https://{host.lower()}"))

    def authorized(self, headers: dict) -> bool:
        if self.open:
            return True
        if not self.token:
            return False
        auth = headers.get("authorization", "")
        if auth[:7].lower() == "bearer " and self._same(auth[7:].strip()):
            return True
        try:
            morsel = SimpleCookie(headers.get("cookie", "")).get(COOKIE)
        except Exception:
            morsel = None
        return bool(morsel and self._same(morsel.value))

    def _same(self, given: str) -> bool:
        return bool(self.token) and hmac.compare_digest(given.encode(), self.token.encode())

    def cookie(self) -> str:
        return f"{COOKIE}={self.token}; Path=/; Max-Age={COOKIE_MAX_AGE_S}; HttpOnly; SameSite=Strict"

    async def __call__(self, scope, receive, send):
        if scope["type"] not in ("http", "websocket"):
            return await self.app(scope, receive, send)
        headers = {k.decode("latin-1").lower(): v.decode("latin-1") for k, v in scope.get("headers") or []}
        host, origin = headers.get("host", ""), headers.get("origin")
        if not self.host_ok(host):
            return await self._deny(scope, send, 403, "host_not_allowed",
                                    "This hub answers on its address or a name listed in AFFERENT_HUB_HOSTS")
        if origin is not None and not self.origin_ok(origin, host):
            return await self._deny(scope, send, 403, "origin_not_allowed",
                                    "This hub answers its own pages and the phone app only")

        path, keyed = scope["path"], False
        if path.startswith(PREFIX):
            given, _, rest = path[len(PREFIX):].partition("/")
            if not self.open and not self._same(given):
                return await self._deny(scope, send, 401, "unauthorized", "Wrong pairing token in the address")
            path, keyed = "/" + rest, True
            scope["path"] = path
            scope["raw_path"] = path.encode()

        protected = path.startswith(PROTECTED) and path.rstrip("/") not in PUBLIC
        if scope["type"] == "http":
            if origin is None and path.startswith("/api/") and headers.get("sec-fetch-site") in ("cross-site", "same-site"):
                return await self._deny(scope, send, 403, "origin_not_allowed",
                                        "This hub answers its own pages and the phone app only")
            if keyed and not protected and scope["method"] in ("GET", "HEAD"):
                target = HOME_PAGE if path == "/" else path
                if scope.get("query_string"):
                    target += "?" + scope["query_string"].decode("latin-1")
                paired = [] if self.open else [(b"set-cookie", self.cookie().encode())]
                return await self._respond(send, 303, b"", [(b"location", target.encode())] + paired)
            if path == "/":
                return await self._respond(send, 307, b"", [(b"location", HOME_PAGE.encode())])
        if path.rstrip("/") in REFUSED:
            code, detail = REFUSED[path.rstrip("/")]
            return await self._deny(scope, send, 403, code, detail)
        if path.rstrip("/") == "/ws/bedside" and not self.bedside_ws:
            return await self._deny(scope, send, 403, "bedside_ws_disabled",
                                    "The bedside here is not a WebSocket device (AFFERENT_BEDSIDE)")
        if protected and not keyed and not self.authorized(headers):
            if not self.token:
                return await self._deny(scope, send, 503, "hub_locked",
                                        "This hub was deployed without AFFERENT_HUB_TOKEN; it serves no data until it has one")
            return await self._deny(scope, send, 401, "unauthorized",
                                    "This hub needs its pairing token; see the home hub section of the README")
        return await self.app(scope, receive, send)

    async def _deny(self, scope, send, status: int, code: str, detail: str):
        if scope["type"] == "websocket":
            return await send({"type": "websocket.close", "code": 1008, "reason": code})
        await self._respond(send, status, json.dumps({"error": code, "detail": detail}).encode(),
                            [(b"content-type", b"application/json")])

    async def _respond(self, send, status: int, body: bytes, headers: list):
        headers = headers + [(b"content-length", str(len(body)).encode()), (b"cache-control", b"no-store")]
        await send({"type": "http.response.start", "status": status, "headers": headers})
        await send({"type": "http.response.body", "body": body})
