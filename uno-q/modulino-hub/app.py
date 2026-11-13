"""Modulino-hub (Linux-sidan på UNO Q).

Tar emot Knob/Thermo-värden från sketchen via Arduino Bridge och publicerar dem
som HTTP-tjänst i Wendy Net (mDNS _http._tcp, TXT role=modulino-hub).

  GET  /state                      -> {"knob": {...}, "climate": {...}, "modulinos": {...}}
  POST /buzz?freq=880&ms=200       -> spelar ton på Buzzer
"""
import json
import os
import signal
import socket
import threading
import time
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

from arduino.router_bridge import Bridge
from zeroconf import IPVersion, ServiceInfo, Zeroconf

from network import interface_ipv4

PORT = 8080
lock = threading.Lock()
state = {"knob": None, "climate": None, "modulinos": None, "bridge": "connecting"}


def _set(key, value):
    with lock:
        state[key] = {**value, "t": time.time()}


def on_knob(position, pressed):
    _set("knob", {"position": int(position), "pressed": bool(pressed)})
    print(f"knob {position} {'pressed' if pressed else ''}", flush=True)


def on_climate(celsius, humidity):
    _set("climate", {"celsius": round(float(celsius), 2), "humidity": round(float(humidity), 1)})


def on_modulinos(knob_ok, thermo_ok, buzzer_ok):
    _set("modulinos", {"knob": bool(knob_ok), "thermo": bool(thermo_ok), "buzzer": bool(buzzer_ok)})


bridge = Bridge(os.environ["APP_SOCKET"])


def bridge_loop(stopped):
    while not stopped.is_set():
        try:
            if bridge.connect(timeout=5):
                bridge.provide("knob", on_knob)
                bridge.provide("climate", on_climate)
                bridge.provide("modulinos", on_modulinos)
                with lock:
                    state["bridge"] = "connected"
                print("bridge connected", flush=True)
                return
        except Exception as e:  # router not up yet
            print(f"bridge connect failed: {e}", flush=True)
        stopped.wait(2)


class Handler(BaseHTTPRequestHandler):
    def _json(self, code, obj):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if urlparse(self.path).path in ("/", "/state"):
            with lock:
                self._json(200, dict(state))
        else:
            self._json(404, {"error": "not found"})

    def do_POST(self):
        url = urlparse(self.path)
        if url.path != "/buzz":
            return self._json(404, {"error": "not found"})
        q = parse_qs(url.query)
        try:
            freq = int(q.get("freq", ["880"])[0])
            ms = int(q.get("ms", ["200"])[0])
            ok = bridge.call("buzz", freq, ms, timeout=3)
            self._json(200, {"ok": bool(ok), "freq": freq, "ms": ms})
        except Exception as e:
            self._json(503, {"ok": False, "error": str(e)})

    def log_message(self, *_):
        pass


def main():
    stopped = threading.Event()
    for sig in (signal.SIGINT, signal.SIGTERM):
        signal.signal(sig, lambda *_: stopped.set())

    threading.Thread(target=bridge_loop, args=(stopped,), daemon=True).start()

    server = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()

    zc = info = None
    try:
        address = interface_ipv4()
        zc = Zeroconf(interfaces=[address], ip_version=IPVersion.V4Only)
        info = ServiceInfo(
            "_http._tcp.local.",
            "modulino-hub._http._tcp.local.",
            addresses=[socket.inet_aton(address)],
            port=PORT,
            properties={"role": "modulino-hub", "path": "/state"},
            server=f"modulino-hub-{uuid.uuid4().hex[:6]}.local.",
        )
        zc.register_service(info, allow_name_change=True)
        print(f"advertising {info.name} at {address}:{PORT}", flush=True)
    except Exception as e:
        print(f"mDNS disabled: {e}", flush=True)

    try:
        stopped.wait()
    finally:
        if zc:
            if info:
                zc.unregister_service(info)
            zc.close()
        server.shutdown()
        bridge.disconnect()


if __name__ == "__main__":
    main()
