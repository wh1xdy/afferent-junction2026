"""afferent-hub: the patient's own health-data hub on the Jetson.

Collects the finger-sensor readings from the UNO Q (modulino-hub, found over Wendy Net mDNS),
takes expression sessions and PHQ-9 check-ins from the phone app, stores everything in SQLite
on the Jetson (persistent volume), and shows it to the patient.

The hub never talks to a doctor: it sends nothing, and nobody but the patient can read it. What a
doctor gets is what the patient hands over: the printed handover report or the downloaded FHIR file.

  GET  /health                          {"ok": true}; collector details only with the patient token
  GET  /summary?days=14                 all report numbers as JSON
  GET  /report/handover?days=14         "Report for my doctor": the patient prints or saves it and hands it over
  GET  /report/patient?days=7           "Your week": plain-language HTML for the patient
  GET  /fhir?days=14                    FHIR R4 Bundle (LOINC-coded vitals + PHQ-9), as a file the patient downloads
  POST /sessions                        body: exported expression session JSON (from the app)
  POST /phq9                            body: {"answers": [9 ints 0-3], "ts": optional unix time}
  ?demo=1 on any read                   synthetic 14-day patient (in memory), marked as simulated; no token needed

Access (auth.py): `Authorization: Bearer <token>`, and there is one token: the patient's. The HTML
reports also take ?token=... once: the hub answers with an HttpOnly cookie and a redirect to the
same URL without the token.

Input (store.py): `ts` is unix time in seconds, at most a day ahead of the hub's clock; NaN / Infinity
are not accepted as JSON; a wrong shape is a 400. Should a request still fail inside the hub, the
answer is a 500 (never a dropped connection) and one line in the log without the request's contents.

No language model runs here: the summary in the handover report is a fixed template (grounding.summary_text).
"""
import json
import os
import threading
import time
import traceback
import urllib.request
from datetime import datetime, timezone
from http.cookies import CookieError, SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlencode, urlparse

import auth
import demo
import fhir
import report
from store import MAX_TS, Invalid, Store, day, number, timestamp

PORT = int(os.environ.get("PORT", "8090"))
DB = os.environ.get("AFFERENT_DB", "/data/afferent.db")
TOKEN_FILE = os.environ.get("AFFERENT_TOKEN_FILE") or os.path.join(os.path.dirname(DB) or ".", "hub-tokens.json")
POLL_S = 5.0
MIN_QUALITY = 0.3       # a finger pulse below this, or without a reported quality, is not a measurement
MAX_AGE_S = 3.0         # a live reading counts for 3 s
SETTLE_S = 6.0          # the UNO Q updates HRV and breathing 4 s after a finger is detected, once a second
ROOM_MAX_AGE_S = 30.0   # the thermometer reports every 2 s
FINGER, ROOM = "finger_ppg", "modulino_thermo"       # the `source` stored with a reading
store = None            # the real database; opened in main() (tests set their own)
token = ""              # the patient token, from auth.load_token() in main()
collector = {"hub_url": None, "last_ok": None, "stored": 0, "error": None}


# ── UNO Q discovery + collection ───────────────────────────────────────────
def discover(stopped):
    try:
        from zeroconf import IPVersion, ServiceBrowser, Zeroconf
        from network import interface_ipv4
        zc = Zeroconf(interfaces=[interface_ipv4()], ip_version=IPVersion.V4Only)

        def on_change(zeroconf, service_type, name, state_change):
            info = zeroconf.get_service_info(service_type, name, timeout=3000)
            if info and info.properties.get(b"role") == b"modulino-hub":
                addrs = info.parsed_addresses(IPVersion.V4Only)
                if addrs:
                    collector["hub_url"] = f"http://{addrs[0]}:{info.port}"
                    print(f"collector: modulino-hub at {collector['hub_url']}", flush=True)
        ServiceBrowser(zc, "_http._tcp.local.", handlers=[on_change])
    except Exception as e:
        collector["error"] = f"mDNS: {e}"
        print(collector["error"], flush=True)
    if os.environ.get("MODULINO_HUB_URL"):               # manual override for testing
        collector["hub_url"] = os.environ["MODULINO_HUB_URL"]
    stopped.wait()


def collect(stopped):
    while not stopped.wait(POLL_S):
        url = collector["hub_url"]
        if not url:
            continue
        try:
            with urllib.request.urlopen(url + "/state", timeout=3) as r:
                s = json.loads(r.read())
        except Exception as e:
            collector["error"] = str(e)
            continue
        collector.update(last_ok=time.time(), error=None)
        try:
            store_state(s, time.time())
        except Exception as e:                       # one odd document must not end the collection for good
            collector["error"] = f"store: {e.__class__.__name__}"


def _obj(v):
    return v if isinstance(v, dict) else {}


def _num(v):
    """v if it is a finite number (not a bool, not a string), else None"""
    return number(v, MAX_TS)


def _skip(why):
    collector[f"skipped_{why}"] = collector.get(f"skipped_{why}", 0) + 1


def _beat_age(s, finger, device_now):
    """seconds since the newest beat behind the fused pulse, on the UNO Q's clock; None if it cannot be told"""
    chans = s.get("fingers") if isinstance(s.get("fingers"), list) else []
    t = [_num(_obj(c).get("t")) for c in chans]
    sources = finger.get("sources") if isinstance(finger.get("sources"), list) else []
    sources = [c for c in sources if type(c) is int and 0 <= c < len(t)]
    seen = [t[c] for c in (sources or range(len(t))) if t[c] is not None]
    if device_now is None or not seen:
        return None
    return max(0.0, device_now - max(seen))


def store_state(s, now, store=None):
    """One /state document from the UNO Q -> readings in the store, under the hub's time `now`.

    Only what was measured on the patient just now is stored; everything else stays missing:
      two people on the clips   finger.two_hearts (Heart Duel): nothing from the fingers
      pulse                     presence active, finger.quality reported and at least MIN_QUALITY, and
                                the newest beat behind it at most MAX_AGE_S old
      HRV, breathing rate       presence active for SETTLE_S: the UNO Q keeps the last values in /state
                                while idle and while a new wearing warms up
      room temperature          at most ROOM_MAX_AGE_S old (older: the thermometer is unplugged)
    Ages compare the UNO Q's clock with itself (`now` / `beat.t` in the document), never with the hub's.
    """
    store = store or globals()["store"]
    s = _obj(s)
    f, p = _obj(s.get("finger")), _obj(s.get("presence"))
    device_now = _num(s.get("now")) or _num(_obj(s.get("beat")).get("t"))
    if f.get("two_hearts"):
        # the two clips are on two different people (Heart Duel): not the patient's data
        _skip("two_people")
    # only while a finger is actually being measured (sensors otherwise off / probing)
    elif p.get("mode") == "active":
        bpm, quality = _num(f.get("bpm")), _num(f.get("quality"))
        if bpm is not None and bpm > 0:                       # 0 / null = no reading
            age = _beat_age(s, f, device_now)
            if quality is None or quality < MIN_QUALITY:
                _skip("low_quality")
            elif age is not None and age > MAX_AGE_S:
                _skip("stale")
            else:
                store.add_reading("finger_bpm", bpm, now, FINGER)
                collector["stored"] += 1
        since = _num(p.get("since"))
        if device_now is not None and since is not None and device_now - since >= SETTLE_S:
            rmssd = _num(_obj(s.get("hrv")).get("rmssd_ms"))
            if rmssd is not None and rmssd > 0:
                store.add_reading("hrv_rmssd", rmssd, now, FINGER)
            breaths = _num(_obj(s.get("breathing")).get("per_minute"))
            if breaths is not None and breaths > 0:
                store.add_reading("breathing", breaths, now, FINGER)
    c = _obj(s.get("climate"))
    celsius, measured = _num(c.get("celsius")), _num(c.get("t"))
    if celsius is not None and not (device_now is not None and measured is not None
                                    and device_now - measured > ROOM_MAX_AGE_S):
        store.add_reading("room_celsius", celsius, now, ROOM)


# ── HTTP ─────────────────────────────────────────────────────────────────
READ, WRITE = "read", "write"            # every route needs the patient token; the demo patient can only be read
ROUTES = {("GET", "/summary"): READ, ("GET", "/report/handover"): READ, ("GET", "/report/patient"): READ,
          ("GET", "/fhir"): READ,
          ("POST", "/sessions"): WRITE, ("POST", "/phq9"): WRITE}
REPORTS = ("/report/handover", "/report/patient")       # HTML pages: ?token= and the cookie work here only
DRAIN_MAX = 8 << 20
AHEAD_S = 86400         # how far ahead of the hub's clock a client's `ts` may be (phone clocks drift a little)

DENIED_HTML = """<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Afferent</title></head>
<body style="font:15px/1.45 -apple-system,system-ui,sans-serif;max-width:520px;margin:48px auto;padding:0 16px">
<h1 style="font-size:20px">Access token needed</h1><p>{reason}. This report opens only for the patient:
use the link that includes your own access token.</p></body></html>"""
ERROR_HTML = """<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Afferent</title></head>
<body style="font:15px/1.45 -apple-system,system-ui,sans-serif;max-width:520px;margin:48px auto;padding:0 16px">
<h1 style="font-size:20px">The report could not be built</h1><p>The hub failed while reading the stored data.
Nothing was changed. This page is not a report and says nothing about the patient.
The device log names the place of the failure.</p></body></html>"""


def _not_json(name):
    raise ValueError(f"{name} is not JSON")


def _finite(text):
    v = float(text)
    if v != v or v in (float("inf"), float("-inf")):         # 1e999 parses to infinity
        raise ValueError("number out of range")
    return v


def parse_body(raw):
    """Strict JSON: Python's json.loads also takes NaN, Infinity and 1e999, which would be stored and
    then break arithmetic or be written back out as invalid JSON."""
    try:
        return json.loads(raw or b"{}", parse_constant=_not_json, parse_float=_finite)
    except RecursionError:                                   # thousands of nested brackets
        raise ValueError("JSON nested too deeply") from None


def window(value):
    """`days` from a query string, clamped to 1..90"""
    try:
        return max(1, min(90, int(value)))
    except (TypeError, ValueError, OverflowError):
        raise Invalid("days must be a number") from None


class Handler(BaseHTTPRequestHandler):
    server_version, sys_version = "afferent-hub", ""

    def _send(self, code, body, ctype="application/json", headers=()):
        data = body if isinstance(body, bytes) else (json.dumps(body) if ctype == "application/json" else body).encode()
        self._answered = True
        self.send_response(code)
        self.send_header("Content-Type", ctype + "; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")            # health data: never cached
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("X-Content-Type-Options", "nosniff")
        for k, v in headers:
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(data)

    def _deny(self, code, reason, html=False):
        self._drain()
        extra = [("WWW-Authenticate", "Bearer")] if code == 401 else []
        if html:
            return self._send(code, DENIED_HTML.format(reason=reason.capitalize()), "text/html", extra)
        self._send(code, {"error": reason}, headers=extra)

    def _drain(self):
        """read (and drop) the body of a request we refuse, so the client gets the answer, not a reset"""
        if self._consumed:
            return
        self._consumed = True
        try:
            left = min(int(self.headers.get("Content-Length") or 0), DRAIN_MAX)
        except ValueError:
            return
        while left > 0:
            chunk = self.rfile.read(min(left, 65536))
            if not chunk:
                break
            left -= len(chunk)

    def _credentials(self, cookie_ok):
        """(is this the patient, whether anything was presented). Bearer header on every route; the
        report cookie on the HTML reports only, so a browser can never be made to write with it."""
        header = self.headers.get("Authorization")
        if header:
            return auth.valid(auth.bearer(header), token), True
        if cookie_ok:
            try:
                morsel = SimpleCookie(self.headers.get("Cookie") or "").get(auth.COOKIE)
            except CookieError:
                morsel = None
            if morsel:
                return auth.valid_session(morsel.value, token), True
        return False, False

    def _handle(self, method):
        """One request. Whatever goes wrong inside the hub, the client gets an answer: a failure
        that is not a refused input becomes a 500 instead of a connection that just closes."""
        self._answered = self._consumed = False
        try:
            return self._route(method)
        except Exception as e:
            path = self.path.split("?", 1)[0]
            known = path if (method, path) in ROUTES else "(other)"
            # class and place only: the message, the query string and the body can hold a token or health data
            where = traceback.extract_tb(e.__traceback__)[-1]
            print(f"hub: {method} {known}: {e.__class__.__name__} at {os.path.basename(where.filename)}:{where.lineno}",
                  flush=True)
            if self._answered:                              # failed while sending (the client went away): nothing more to say
                self.close_connection = True
                return
            self._drain()
            if path in REPORTS:
                return self._send(500, ERROR_HTML, "text/html")
            self._send(500, {"error": "internal error"})

    def _route(self, method):
        try:
            url = urlparse(self.path)
        except ValueError:                                  # e.g. "http://[" as the request target
            return self._deny(400, "bad request")
        path, q = url.path, parse_qs(url.query, keep_blank_values=True)
        if method == "GET" and path == "/health":
            if self._credentials(False)[0]:
                return self._send(200, {"ok": True, "collector": collector})
            return self._send(200, {"ok": True})
        need = ROUTES.get((method, path))
        if need is None:
            return self._deny(404, "not found")
        html = path in REPORTS
        if html and "token" in q:
            # a link opened in a browser: swap the token for a cookie and drop it from the address bar
            if len(q["token"]) != 1 or not auth.valid(q["token"][0], token):
                return self._deny(401, "invalid token", html=True)
            rest = urlencode([(k, v) for k, vs in q.items() if k != "token" for v in vs])
            return self._send(303, b"", "text/plain", [("Location", path + ("?" + rest if rest else "")),
                                                        ("Set-Cookie", auth.set_cookie(token))])
        # One decision per request: a demo request gets the synthetic store and nothing else;
        # every other request needs the patient token before it gets the real one.
        if q.get("demo") == ["1"]:
            if need == WRITE:
                return self._deny(400, "demo mode is read-only")
            st = demo.demo_store()
        else:
            patient, presented = self._credentials(cookie_ok=html)
            if not patient:
                return self._deny(401, "invalid token" if presented else "token required", html)
            st = store
        try:
            return self._get(path, st, q) if method == "GET" else self._post(path, st)
        finally:
            if st is not store:
                st.db.close()                       # the in-memory demo patient lives for one request

    def _get(self, path, st, q):
        try:
            days = window(q.get("days", ["14"])[0])
        except Invalid as e:
            return self._send(400, {"error": str(e)})
        now = time.time()
        summ = st.summary(days, now)
        summ["simulated"] = st is not store             # the demo patient is marked wherever it is shown
        if path == "/summary":
            return self._send(200, summ)
        if path == "/report/handover":
            return self._send(200, report.handover(summ, now=now), "text/html")
        if path == "/report/patient":
            return self._send(200, report.patient(summ), "text/html")
        if path == "/fhir":
            # a file the patient downloads and hands over; the hub itself sends it nowhere
            name = f"afferent-fhir-{'SIMULATED-' if summ['simulated'] else ''}{day(now)}.json"
            bundle = fhir.bundle(summ, now=datetime.fromtimestamp(now, timezone.utc))
            return self._send(200, json.dumps(bundle, indent=1), "application/fhir+json",
                              [("Content-Disposition", f'attachment; filename="{name}"')])

    def _post(self, path, st):
        try:
            length = int(self.headers.get("Content-Length") or 0)
            if length < 0:                                   # read(-1) would wait until the client hangs up
                raise ValueError("negative Content-Length")
            self._consumed = True
            body = parse_body(self.rfile.read(length))
        except ValueError:                                   # bad Content-Length or invalid JSON
            return self._send(400, {"error": "invalid JSON"})
        if not isinstance(body, dict):
            return self._send(400, {"error": "a JSON object is required"})
        # Only a refused input (Invalid) is a 400 with its message. Any other exception is the hub's
        # own failure: it goes up to _handle() and becomes a 500 without the exception text.
        try:
            ts = timestamp(body.get("ts"), latest=time.time() + AHEAD_S)
            if path == "/sessions":
                return self._send(201, {"id": st.add_session(body, ts)})
            return self._send(201, {"id": st.add_phq9(body.get("answers"), ts)})
        except Invalid as e:
            return self._send(400, {"error": str(e)})

    def do_GET(self):
        self._handle("GET")

    def do_POST(self):
        self._handle("POST")

    def log_message(self, *_):            # no access log: a ?token= link must never end up in the device logs
        pass


def main():
    global store, token
    token = auth.load_token(TOKEN_FILE, log=lambda line: print(line, flush=True))
    store = Store(DB)
    stopped = threading.Event()
    threading.Thread(target=discover, args=(stopped,), daemon=True).start()
    threading.Thread(target=collect, args=(stopped,), daemon=True).start()
    print(f"afferent-hub on :{PORT}, db {DB}", flush=True)
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()


if __name__ == "__main__":
    main()
