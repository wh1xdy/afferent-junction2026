"""afferent-hub: local health-data hub on the Jetson.

Collects the finger-sensor readings from the UNO Q (modulino-hub, found over Wendy Net mDNS),
takes expression sessions and PHQ-9 check-ins from the phone app, stores everything in SQLite
on the Jetson (persistent volume), and serves clinician / patient reports.

  GET  /health                          {"ok": true}; collector / LLM details only with a valid token
  GET  /summary?days=14                 all report numbers as JSON (also the LLM's only source)
  GET  /report/clinician?days=14        printable HTML for the doctor, with the template summary
  GET  /report/patient?days=7           plain-language HTML for the patient
  GET  /fhir?days=14                    FHIR R4 Bundle (LOINC-coded vitals + PHQ-9) for a clinic record system
  POST /sessions                        body: exported expression session JSON (from the app)
  POST /phq9                            body: {"answers": [9 ints 0-3], "ts": optional unix time}
  POST /ask                             body: {"question": "...", "days": 14} -> grounded answer for the clinician
                                        (overview / summary requests: instant template, no LLM)
  ?demo=1 on any read or /ask           synthetic 14-day patient (in memory), for demos; no token needed

Access (auth.py): `Authorization: Bearer <token>`. The PATIENT token may do everything, the CLINICIAN
token only the reads (/summary, /report/*, /fhir, /ask). The HTML reports also take ?token=... once:
the hub answers with an HttpOnly cookie and a redirect to the same URL without the token.

The LLM (llama.cpp, Qwen2.5-3B, local) only ever sees facts computed here; see grounding.py.
"""
import json
import os
import threading
import time
import urllib.request
from http.cookies import CookieError, SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlencode, urlparse

import auth
import demo
import fhir
import grounding
import report
from store import Store

PORT = int(os.environ.get("PORT", "8090"))
DB = os.environ.get("AFFERENT_DB", "/data/afferent.db")
TOKEN_FILE = os.environ.get("AFFERENT_TOKEN_FILE") or os.path.join(os.path.dirname(DB) or ".", "hub-tokens.json")
POLL_S = 5.0
store = None            # the real database; opened in main() (tests set their own)
tokens = {}             # {role: token}, from auth.load_tokens() in main()
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
        now = time.time()
        # only while a finger is actually being measured (sensors otherwise off / probing)
        if (s.get("presence") or {}).get("mode") == "active":
            f = s.get("finger") or {}
            if f.get("bpm"):
                store.add_reading("finger_bpm", f["bpm"], now)
                collector["stored"] += 1
            h = s.get("hrv") or {}
            if h.get("rmssd_ms"):
                store.add_reading("hrv_rmssd", h["rmssd_ms"], now)
            b = s.get("breathing") or {}
            if b.get("per_minute"):
                store.add_reading("breathing", b["per_minute"], now)
        c = s.get("climate") or {}
        if c.get("celsius") is not None:
            store.add_reading("room_celsius", c["celsius"], now)


def llm_status():
    try:
        with urllib.request.urlopen("http://127.0.0.1:8081/health", timeout=2) as r:
            return json.loads(r.read()).get("status", "?")
    except Exception as e:
        return f"down ({e.__class__.__name__})"


# ── HTTP ─────────────────────────────────────────────────────────────────
READ, WRITE = "read", "write"
ROUTES = {("GET", "/summary"): READ, ("GET", "/report/clinician"): READ, ("GET", "/report/patient"): READ,
          ("GET", "/fhir"): READ, ("POST", "/ask"): READ,
          ("POST", "/sessions"): WRITE, ("POST", "/phq9"): WRITE}
REPORTS = ("/report/clinician", "/report/patient")      # HTML pages: ?token= and the cookie work here only
DRAIN_MAX = 8 << 20

DENIED_HTML = """<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Afferent</title></head>
<body style="font:15px/1.45 -apple-system,system-ui,sans-serif;max-width:520px;margin:48px auto;padding:0 16px">
<h1 style="font-size:20px">Access token needed</h1><p>{reason}. Open this report with the link that includes your
access token, or ask the owner of the device for one.</p></body></html>"""


class Handler(BaseHTTPRequestHandler):
    server_version, sys_version = "afferent-hub", ""

    def _send(self, code, body, ctype="application/json", headers=()):
        data = body if isinstance(body, bytes) else (json.dumps(body) if ctype == "application/json" else body).encode()
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
        """(role or None, whether anything was presented). Bearer header on every route; the report
        cookie on the HTML reports only, so a browser can never be made to write with it."""
        header = self.headers.get("Authorization")
        if header:
            return auth.role_for(auth.bearer(header), tokens), True
        if cookie_ok:
            try:
                morsel = SimpleCookie(self.headers.get("Cookie") or "").get(auth.COOKIE)
            except CookieError:
                morsel = None
            if morsel:
                return auth.role_for_session(morsel.value, tokens), True
        return None, False

    def _handle(self, method):
        url = urlparse(self.path)
        path, q = url.path, parse_qs(url.query, keep_blank_values=True)
        if method == "GET" and path == "/health":
            if self._credentials(False)[0]:
                return self._send(200, {"ok": True, "collector": collector, "llm": llm_status()})
            return self._send(200, {"ok": True})
        need = ROUTES.get((method, path))
        if need is None:
            return self._deny(404, "not found")
        html = path in REPORTS
        if html and "token" in q:
            # a link opened in a browser: swap the token for a cookie and drop it from the address bar
            role = auth.role_for(q["token"][0], tokens) if len(q["token"]) == 1 else None
            if not role:
                return self._deny(401, "invalid token", html=True)
            rest = urlencode([(k, v) for k, vs in q.items() if k != "token" for v in vs])
            return self._send(303, b"", "text/plain", [("Location", path + ("?" + rest if rest else "")),
                                                        ("Set-Cookie", auth.set_cookie(role, tokens))])
        # One decision per request: a demo request gets the synthetic store and nothing else;
        # every other request needs a valid token before it gets the real one.
        if q.get("demo") == ["1"]:
            if need == WRITE:
                return self._deny(400, "demo mode is read-only")
            st = demo.demo_store()
        else:
            role, presented = self._credentials(cookie_ok=html)
            if role is None:
                return self._deny(401, "invalid token" if presented else "token required", html)
            if need == WRITE and role != auth.PATIENT:
                return self._deny(403, "the clinician token is read-only")
            st = store
        try:
            return self._get(path, st, q) if method == "GET" else self._post(path, st)
        finally:
            if st is not store:
                st.db.close()                       # the in-memory demo patient lives for one request

    def _get(self, path, st, q):
        try:
            days = max(1, min(90, int(q.get("days", ["14"])[0])))
        except ValueError:
            return self._send(400, {"error": "days must be a number"})
        summ = st.summary(days)
        if path == "/summary":
            return self._send(200, summ)
        if path == "/report/clinician":
            return self._send(200, report.clinician(summ), "text/html")
        if path == "/report/patient":
            return self._send(200, report.patient(summ), "text/html")
        if path == "/fhir":
            return self._send(200, json.dumps(fhir.bundle(summ), indent=1), "application/fhir+json")

    def _post(self, path, st):
        try:
            body = json.loads(self.rfile.read(int(self.headers.get("Content-Length") or 0)) or b"{}")
        except ValueError:                                   # bad Content-Length or invalid JSON
            return self._send(400, {"error": "invalid JSON"})
        if not isinstance(body, dict):
            return self._send(400, {"error": "a JSON object is required"})
        try:
            if path == "/sessions":
                return self._send(201, {"id": st.add_session(body, body.get("ts"))})
            if path == "/phq9":
                return self._send(201, {"id": st.add_phq9(body.get("answers", []), body.get("ts"))})
            if path == "/ask":
                q = str(body.get("question", "")).strip()
                if not q:
                    return self._send(400, {"error": "question required"})
                days = max(1, min(90, int(body.get("days", 14))))
                try:
                    return self._send(200, grounding.ask(q[:500], st.summary(days)))
                except OSError as e:                         # the local LLM is not answering
                    return self._send(503, {"error": f"local LLM unavailable ({e.__class__.__name__})"})
        except (ValueError, TypeError) as e:
            return self._send(400, {"error": str(e)})

    def do_GET(self):
        self._handle("GET")

    def do_POST(self):
        self._handle("POST")

    def log_message(self, *_):            # no access log: a ?token= link must never end up in the device logs
        pass


def main():
    global store, tokens
    tokens = auth.load_tokens(TOKEN_FILE, log=lambda line: print(line, flush=True))
    store = Store(DB)
    stopped = threading.Event()
    threading.Thread(target=discover, args=(stopped,), daemon=True).start()
    threading.Thread(target=collect, args=(stopped,), daemon=True).start()
    print(f"afferent-hub on :{PORT}, db {DB}", flush=True)
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()


if __name__ == "__main__":
    main()
