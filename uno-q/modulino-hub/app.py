"""Modulino-hub (Linux-sidan på UNO Q).

Tar emot Knob/Thermo-värden från sketchen via Arduino Bridge och publicerar dem
som HTTP-tjänst i Wendy Net (mDNS _http._tcp, TXT role=modulino-hub).

  GET  /state                      -> {"knob": {...}, "climate": {...}, "modulinos": {...}}
  POST /buzz?freq=880&ms=200       -> plays a tone on the Buzzer
  POST /heartbeat?on=0|1           -> mute / unmute the beep on every heartbeat
  POST /led?r=0&g=255&b=0&ms=500   -> KY-016 colour for ms (ms=0 holds; r=g=b=0 back to auto)
"""
import collections
import json
import math
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
state = {"knob": None, "climate": None, "beat": None, "modulinos": None, "bridge": "connecting"}


def _set(key, value):
    with lock:
        state[key] = {**value, "t": time.time()}


def on_knob(position, pressed):
    _set("knob", {"position": int(position), "pressed": bool(pressed)})
    print(f"knob {position} {'pressed' if pressed else ''}", flush=True)


def on_climate(celsius, humidity):
    _set("climate", {"celsius": round(float(celsius), 2), "humidity": round(float(humidity), 1)})


ppg = collections.deque(maxlen=1500)  # ~30 s at 50 Hz


def on_ppg(t_ms, value):
    ppg.append((int(t_ms), int(value)))


def pulse_summary(window_ms=10000):
    """Beat detection on the last 10 s of A1 samples.

    1 s moving-average detrend -> 5-sample smoothing -> peaks above 0.5*std with a
    0.33 s refractory period -> BPM from the median inter-beat interval.
    quality = autocorrelation at that interval (0..1); below ~0.2 treat as no signal.
    """
    pts = list(ppg)
    if len(pts) < 100:
        return {"samples": len(pts), "bpm": None}
    t_end = pts[-1][0]
    pts = [p for p in pts if p[0] >= t_end - window_ms]
    t = [p[0] for p in pts]
    v = [p[1] for p in pts]
    n = len(v)
    fs = (n - 1) / max((t[-1] - t[0]) / 1000, 1e-3)
    half = max(1, int(fs) // 2)
    hp = []
    for i in range(n):
        seg = v[max(0, i - half):i + half + 1]
        hp.append(v[i] - sum(seg) / len(seg))
    sm = []
    for i in range(n):
        seg = hp[max(0, i - 2):i + 3]
        sm.append(sum(seg) / len(seg))
    sd = math.sqrt(sum(x * x for x in sm) / n) or 1.0
    thr = 0.5 * sd
    refractory = int(0.33 * fs)
    beats = []
    for i in range(1, n - 1):
        if sm[i] > thr and sm[i] >= sm[i - 1] and sm[i] > sm[i + 1]:
            if beats and i - beats[-1] < refractory:
                if sm[i] > sm[beats[-1]]:
                    beats[-1] = i
                continue
            beats.append(i)
    ibis = [(t[b] - t[a]) / 1000 for a, b in zip(beats, beats[1:])]
    ibis = [x for x in ibis if 0.33 <= x <= 1.8]
    bpm = quality = None
    if len(ibis) >= 3:
        med = sorted(ibis)[len(ibis) // 2]
        bpm = round(60 / med)
        lag = int(round(med * fs))
        e = sum(x * x for x in sm) or 1.0
        quality = round(max(0.0, sum(sm[i] * sm[i + lag] for i in range(n - lag)) / e), 2)
    return {"samples": n, "fs": round(fs, 1), "raw_min": min(v), "raw_max": max(v),
            "beats": len(beats), "bpm": bpm, "quality": quality,
            "last_beat_age_s": round((t_end - t[beats[-1]]) / 1000, 2) if beats else None}


beats = collections.deque(maxlen=20)  # (t_ms, ibi_ms) from the sketch's live detector


def on_beat(t_ms, ibi_ms, peak, locked):
    if locked:
        beats.append((int(t_ms), int(ibi_ms)))
    ibis = [b for _, b in beats][-8:]
    bpm = round(60000 / sorted(ibis)[len(ibis) // 2]) if len(ibis) >= 3 else None
    _set("beat", {"bpm_live": bpm, "locked": bool(locked), "ibi_ms": int(ibi_ms),
                  "peak_slope": int(peak), "locked_count": len(beats)})


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
                bridge.provide("ppg", on_ppg)
                bridge.provide("beat", on_beat)
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
        path = urlparse(self.path).path
        if path in ("/", "/state"):
            with lock:
                out = dict(state)
            out["pulse"] = pulse_summary()
            self._json(200, out)
        elif path == "/ppg":
            self._json(200, {"samples": list(ppg)})
        else:
            self._json(404, {"error": "not found"})

    def do_POST(self):
        url = urlparse(self.path)
        q = parse_qs(url.query)
        if url.path == "/heartbeat":
            on = q.get("on", ["1"])[0] not in ("0", "false", "off")
            try:
                return self._json(200, {"heartbeat_sound": bool(bridge.call("heartbeat_sound", on, timeout=3))})
            except Exception as e:
                return self._json(503, {"error": str(e)})
        if url.path == "/led":
            try:
                r, g, b, ms = (int(q.get(k, [d])[0]) for k, d in (("r", "0"), ("g", "0"), ("b", "0"), ("ms", "500")))
                return self._json(200, {"ok": bool(bridge.call("led", r, g, b, ms, timeout=3)), "rgb": [r, g, b], "ms": ms})
            except Exception as e:
                return self._json(503, {"error": str(e)})
        if url.path != "/buzz":
            return self._json(404, {"error": "not found"})
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
