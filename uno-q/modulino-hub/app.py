"""Modulino-hub (Linux-sidan på UNO Q).

Tar emot Knob/Thermo-värden från sketchen via Arduino Bridge och publicerar dem
som HTTP-tjänst i Wendy Net (mDNS _http._tcp, TXT role=modulino-hub).

  GET  /state                      -> knob, climate, modulinos, finger (fused reading of both sensors),
                                      beat (= fused, for the Jetson), fingers[0..1], pulses[0..1]
  GET  /ppg?ch=0|1                 -> raw 30 s of finger 1 (A1) / finger 2 (A2)
  POST /presence?auto=0|1          -> sensor LEDs off until a finger is detected (default on)
  POST /sensor?ch=0|1&on=0|1       -> manual sensor power (D2 / D3)
  POST /buzz?freq=880&ms=200       -> plays a tone on the Buzzer
  POST /heartbeat?on=0|1           -> mute / unmute the beep on every heartbeat
  POST /led?r=0&g=255&b=0&ms=500   -> KY-016 colour for ms (ms=0 holds; r=g=b=0 back to auto)
  POST /led/beat?on=0|1            -> red flash on every heartbeat (default off: it fakes camera rPPG)
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
from ble import HeartRateBroadcaster

PORT = 8080
lock = threading.Lock()
state = {"knob": None, "climate": None, "beat": None, "fingers": [None, None],
         "modulinos": None, "bridge": "connecting"}
CHANNELS = 2   # finger 1 = A1, finger 2 = A2


def _set(key, value):
    with lock:
        state[key] = {**value, "t": time.time()}


def on_knob(position, pressed):
    _set("knob", {"position": int(position), "pressed": bool(pressed)})
    print(f"knob {position} {'pressed' if pressed else ''}", flush=True)


def on_climate(celsius, humidity):
    _set("climate", {"celsius": round(float(celsius), 2), "humidity": round(float(humidity), 1)})


ppgs = [collections.deque(maxlen=1500) for _ in range(CHANNELS)]  # ~30 s at 45 Hz each
ppg = ppgs[0]


def on_ppg(t_ms, *values):
    for c, v in enumerate(values[:CHANNELS]):
        ppgs[c].append((int(t_ms), int(v)))


def pulse_summary(window_ms=10000, ch=0):
    """Beat detection on the last 10 s of A1 samples.

    1 s moving-average detrend -> 5-sample smoothing -> peaks above 0.5*std with a
    0.33 s refractory period -> BPM from the median inter-beat interval.
    quality = autocorrelation at that interval (0..1); below ~0.2 treat as no signal.
    """
    pts = list(ppgs[ch])
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


beats = [collections.deque(maxlen=20) for _ in range(CHANNELS)]  # (t_ms, ibi_ms), locked beats


ble = HeartRateBroadcaster()


def on_beat(c, t_ms, ibi_ms, peak, locked):
    c = int(c)
    if locked:
        beats[c].append((int(t_ms), int(ibi_ms)))
    ibis = [b for _, b in beats[c]][-8:]
    # drop intervals that disagree with the autocorrelation period (double/missed beats)
    per, q = period_state[c].get("period_ms"), period_state[c].get("quality") or 0
    if per and q >= 0.3:
        ibis = [b for b in ibis if 0.75 * per <= b <= 1.35 * per]
    bpm = round(60000 / sorted(ibis)[len(ibis) // 2]) if len(ibis) >= 3 else None
    info = {"bpm_live": bpm, "locked": bool(locked), "ibi_ms": int(ibi_ms),
            "peak_slope": int(peak), "locked_count": len(beats[c]), "t": time.time()}
    with lock:
        state["fingers"][c] = info
    if locked and bpm:
        ble.update_finger(c, bpm)


period_state = [{"period_ms": None, "quality": None} for _ in range(CHANNELS)]


def autocorr(ch=0, window_ms=6000):
    """Normalised autocorrelation of the last 6 s of one finger -> (lags_ms, r) or None."""
    pts = list(ppgs[ch])
    if len(pts) < 150:
        return None
    t_end = pts[-1][0]
    v = [p[1] for p in pts if p[0] >= t_end - window_ms]
    n = len(v)
    fs = (n - 1) / (window_ms / 1000)
    m = sum(v) / n
    x = [a - m for a in v]
    e = sum(a * a for a in x) or 1.0
    lags = range(int(0.33 * fs), int(1.6 * fs))
    return [lag / fs * 1000 for lag in lags], [sum(x[i] * x[i + lag] for i in range(n - lag)) / e for lag in lags]


def pulse_period(ch=0, window_ms=6000):
    """Dominant period 0.33-1.6 s of one finger and its strength."""
    ac = autocorr(ch, window_ms)
    if not ac:
        return None, 0.0
    lags, r = ac
    k = max(range(len(r)), key=r.__getitem__)
    return (round(lags[k]) if r[k] > 0 else None), max(r[k], 0.0)


def fused_period(curves, qualities):
    """Both fingers see the same heart: add their autocorrelation curves, weighted by quality."""
    acc = {}
    for (lags, r), q in zip(curves, qualities):
        if q <= 0:
            continue
        for lag, val in zip(lags, r):
            key = round(lag / 10) * 10           # 10 ms bins, channels sample at slightly different times
            acc[key] = acc.get(key, 0.0) + q * val
    if not acc:
        return None, 0.0
    lag = max(acc, key=acc.get)
    wsum = sum(q for q in qualities if q > 0) or 1.0
    return lag, max(acc[lag] / wsum, 0.0)


fused = {"bpm": None, "period_ms": None, "quality": None, "sources": [], "fingers": [None, None]}


def fuse():
    """One finger reading from both sensors.
    Agree within 10 % -> quality-weighted mean; disagree -> the one closest to the fused period;
    one valid -> that one; none -> fused period itself if it is strong."""
    with lock:
        f = [dict(state["fingers"][c] or {}) for c in range(CHANNELS)]
        per = [dict(period_state[c]) for c in range(CHANNELS)]
        fp, fq = fused["period_ms"], fused["quality"] or 0
    now = time.time()
    cands = []
    for c in range(CHANNELS):
        bpm = f[c].get("bpm_live")
        fresh = f[c].get("t") and now - f[c]["t"] < 5
        q = per[c].get("quality") or 0
        if bpm and fresh and q >= 0.2:
            cands.append((c, bpm, q))
    period_bpm = 60000 / fp if fp and fq >= 0.3 else None
    if len(cands) == 2 and abs(cands[0][1] - cands[1][1]) <= 0.1 * max(cands[0][1], cands[1][1]):
        bpm = sum(b * q for _, b, q in cands) / sum(q for _, _, q in cands)
        sources = [0, 1]
    elif cands:
        best = min(cands, key=lambda c: abs(c[1] - period_bpm)) if period_bpm else max(cands, key=lambda c: c[2])
        bpm, sources = best[1], [best[0]]
    elif period_bpm and fq >= 0.5:
        bpm, sources = period_bpm, []
    else:
        bpm, sources = None, []
    with lock:
        fused.update(bpm=round(bpm) if bpm else None, sources=sources,
                     fingers=[c[1] if c else None for c in
                              [next((x for x in cands if x[0] == ch), None) for ch in range(CHANNELS)]])
        state["beat"] = {**(state["beat"] or {}), "bpm_live": fused["bpm"], "fused": True, "t": time.time()}
    return fused["bpm"]


def period_loop(stopped):
    while not stopped.wait(1.0):
        curves, quals = [], []
        for c in range(CHANNELS):
            try:
                ac = autocorr(c)
                if ac:
                    lags, r = ac
                    k = max(range(len(r)), key=r.__getitem__)
                    ms, q = (round(lags[k]) if r[k] > 0 else None), max(r[k], 0.0)
                    curves.append(ac); quals.append(q)
                else:
                    ms, q = None, 0.0
                with lock:
                    period_state[c].update(period_ms=ms, quality=round(q, 2))
            except Exception as e:
                print(f"period failed (ch {c}): {e}", flush=True)
        fp, fq = fused_period(curves, quals) if curves else (None, 0.0)
        with lock:
            fused.update(period_ms=fp, quality=round(fq, 2))
        if state.get("bridge") == "connected":
            for c in range(CHANNELS):
                try:
                    # each detector gets the fused period when it's stronger than its own
                    own = period_state[c]
                    ms, q = (fp, fq) if fq >= (own.get("quality") or 0) else (own.get("period_ms"), own.get("quality") or 0)
                    if not sensing():
                        ms, q = 0, 0.0                 # sensors off or settling: never lock/beep
                    bridge.call("pulse_period", c, int(ms or 0), int(q * 100), timeout=2)
                except Exception as e:
                    print(f"period update failed (ch {c}): {e}", flush=True)
        bpm = fuse() if sensing() else None
        if not sensing():
            with lock:
                fused.update(bpm=None, sources=[])
                state["beat"] = {**(state["beat"] or {}), "bpm_live": None, "t": time.time()}
        if bpm:
            ble.update(0, bpm)        # standard Heart Rate Measurement = the fused finger reading


# ── finger presence: LEDs off until a hand is in the holders ─────────────────────────
# Sensor + is wired to D2/D3, so the sketch can power them (call "sensor_power").
# Measured: after power-on a sensor needs ~1.5 s to settle; finger 1 then varies < ~130
# (14-bit, per 250 ms) without a finger and swings ~2500-3000 with one. Finger 2's lead
# picks up spikes of 800-4000 even without a finger, so finger 1 decides for both.
PROBE_OFF_S, PROBE_SETTLE_MS, PROBE_LOOK_MS = 4.0, 1250, 1000   # flash = 2.25 s (amp settles ~1.25 s)
WARMUP_S = 4.0               # after switching on: no readings until the pulse has re-locked
PRESENCE_RANGE = 800          # max 250 ms range in the look window above this = finger
                              # (measured: no finger 90-445, finger ~1600-3000)
LEAVE_AFTER_S = 5.0           # pulse quality below 0.3 this long = hand gone
presence = {"auto": True, "mode": "active", "since": time.time(), "last_probe_range": None}


def _sensor_power(on):
    for c in range(CHANNELS):
        try:
            bridge.call("sensor_power", c, on, timeout=2)
        except Exception as e:
            print(f"sensor_power failed (ch {c}): {e}", flush=True)


def _last_t(ch=0):
    return ppgs[ch][-1][0] if ppgs[ch] else None


def _probe_range(t_on):
    w = [(t, v) for t, v in list(ppgs[0]) if t_on + PROBE_SETTLE_MS <= t < t_on + PROBE_SETTLE_MS + PROBE_LOOK_MS]
    if len(w) < 20:
        return None
    if any(v < 200 or v > 13500 for _, v in w):
        return 0                            # railed = power-on transient, never seen with a finger
    best, i = 0, 0
    while i < len(w):                       # 250 ms windows
        seg = [v for t, v in w if w[i][0] <= t < w[i][0] + 250]
        best = max(best, max(seg) - min(seg))
        i += max(1, len(seg))
    return best


def sensing():
    """True while the sensors are on, settled and warmed up (readings count)."""
    return presence["mode"] == "active" and time.time() - presence["since"] >= WARMUP_S


def _forget_beats():
    with lock:
        for c in range(CHANNELS):
            beats[c].clear()
            state["fingers"][c] = None


def presence_loop(stopped):
    weak_since = None
    while not stopped.wait(0.5):
        if state.get("bridge") != "connected":
            continue
        if not presence["auto"]:
            if presence["mode"] != "active":
                _sensor_power(True)
                presence.update(mode="active", since=time.time())
            continue
        if presence["mode"] == "active":
            if time.time() - presence["since"] < WARMUP_S:
                continue
            q = max([period_state[c].get("quality") or 0 for c in range(CHANNELS)] + [fused.get("quality") or 0])
            if q >= 0.3:
                weak_since = None
            elif weak_since is None:
                weak_since = time.time()
            elif time.time() - weak_since > LEAVE_AFTER_S:
                _sensor_power(False)
                _forget_beats()
                presence.update(mode="idle", since=time.time())
                weak_since = None
                print("presence: no finger -> sensors off", flush=True)
        elif presence["mode"] == "idle" and time.time() - presence["since"] >= PROBE_OFF_S:
            _sensor_power(True)
            presence.update(mode="probing", since=time.time(), t_on=_last_t())
        elif presence["mode"] == "probing":
            t_on = presence.get("t_on") or 0
            if (_last_t() or 0) < t_on + PROBE_SETTLE_MS + PROBE_LOOK_MS:
                continue
            r = _probe_range(t_on)
            presence["last_probe_range"] = r
            if r is not None and r > PRESENCE_RANGE:
                _forget_beats()
                presence.update(mode="active", since=time.time())
                weak_since = time.time()       # give the pulse a few seconds to lock
                print(f"presence: finger detected (range {r}) -> sensors on", flush=True)
            else:
                _sensor_power(False)
                presence.update(mode="idle", since=time.time())


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
            out["pulse"] = pulse_summary(ch=0)
            out["pulse"]["period"] = dict(period_state[0])
            out["pulses"] = []
            for c in range(CHANNELS):
                ps = pulse_summary(ch=c)
                ps["period"] = dict(period_state[c])
                out["pulses"].append(ps)
            out["finger"] = dict(fused)     # the one combined finger reading
            out["presence"] = {k: v for k, v in presence.items() if k != "t_on"}
            out["ble"] = ble.status
            self._json(200, out)
        elif path == "/ppg":
            c = int(parse_qs(urlparse(self.path).query).get("ch", ["0"])[0])
            self._json(200, {"samples": list(ppgs[c % CHANNELS])})
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
        if url.path == "/presence":
            presence["auto"] = q.get("auto", ["1"])[0] not in ("0", "false", "off")
            return self._json(200, {"auto": presence["auto"]})
        if url.path == "/sensor":
            c = int(q.get("ch", ["0"])[0]) % CHANNELS
            on = q.get("on", ["1"])[0] not in ("0", "false", "off")
            try:
                return self._json(200, {"ch": c, "on": bool(bridge.call("sensor_power", c, on, timeout=3))})
            except Exception as e:
                return self._json(503, {"error": str(e)})
        if url.path == "/led/beat":
            on = q.get("on", ["1"])[0] not in ("0", "false", "off")
            try:
                return self._json(200, {"led_beat": bool(bridge.call("led_beat", on, timeout=3))})
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
    threading.Thread(target=period_loop, args=(stopped,), daemon=True).start()
    threading.Thread(target=presence_loop, args=(stopped,), daemon=True).start()

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
