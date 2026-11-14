"""afferent-hub: local health-data hub on the Jetson.

Collects the finger-sensor readings from the UNO Q (modulino-hub, found over Wendy Net mDNS),
takes expression sessions and PHQ-9 check-ins from the phone app, stores everything in SQLite
on the Jetson (persistent volume), and serves clinician / patient reports.

  GET  /health
  GET  /summary?days=14                 all report numbers as JSON (also the LLM's only source)
  GET  /report/clinician?days=14        printable HTML for the doctor
  GET  /report/patient?days=7           plain-language HTML for the patient
  POST /sessions                        body: exported expression session JSON (from the app)
  POST /phq9                            body: {"answers": [9 ints 0-3], "ts": optional unix time}
"""
import json
import os
import socket
import threading
import time
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

import report
from store import Store

PORT = int(os.environ.get("PORT", "8090"))
DB = os.environ.get("AFFERENT_DB", "/data/afferent.db")
POLL_S = 5.0
store = Store(DB)
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


# ── HTTP ─────────────────────────────────────────────────────────────────
class Handler(BaseHTTPRequestHandler):
    def _send(self, code, body, ctype="application/json"):
        data = body if isinstance(body, bytes) else (json.dumps(body) if ctype == "application/json" else body).encode()
        self.send_response(code)
        self.send_header("Content-Type", ctype + "; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _days(self, default):
        q = parse_qs(urlparse(self.path).query)
        return max(1, min(90, int(q.get("days", [default])[0])))

    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/health":
            return self._send(200, {"ok": True, "collector": collector})
        if path == "/summary":
            return self._send(200, store.summary(self._days(14)))
        if path == "/report/clinician":
            return self._send(200, report.clinician(store.summary(self._days(14))), "text/html")
        if path == "/report/patient":
            return self._send(200, report.patient(store.summary(self._days(7))), "text/html")
        self._send(404, {"error": "not found"})

    def do_POST(self):
        path = urlparse(self.path).path
        try:
            body = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))) or b"{}")
        except json.JSONDecodeError:
            return self._send(400, {"error": "invalid JSON"})
        try:
            if path == "/sessions":
                return self._send(201, {"id": store.add_session(body, body.get("ts"))})
            if path == "/phq9":
                return self._send(201, {"id": store.add_phq9(body.get("answers", []), body.get("ts"))})
        except ValueError as e:
            return self._send(400, {"error": str(e)})
        self._send(404, {"error": "not found"})

    def log_message(self, *_):
        pass


def main():
    stopped = threading.Event()
    threading.Thread(target=discover, args=(stopped,), daemon=True).start()
    threading.Thread(target=collect, args=(stopped,), daemon=True).start()
    print(f"afferent-hub on :{PORT}, db {DB}", flush=True)
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()


if __name__ == "__main__":
    main()
