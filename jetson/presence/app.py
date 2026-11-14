"""afferent-presence: is the patient home, are they leaving the house, do they get visitors?

  GET  /presence            HOME / AWAY / UNKNOWN + outings + isolation metrics
  GET  /guests              BLE guest visits + social metrics
  GET  /summary             both, plus probe health
  POST /activity            in-home interaction (knob, heart check-in) -> proves "home"
  POST /calibrate[?minutes=N]  learn household BLE devices + background level (patient alone)
  GET  /profile / POST /profile?name=home|demo|classic   tuning bundle, switchable live
  POST /sim                 SIM=1 only: {"phone_wifi": true|false|null, "patient_ble": .., "guests": 2, "neighbours": 5, "gadgets": 3}
  POST /truth?state=home|away   ground-truth marker for reliability testing (logged only)

Config (env): PROFILE (home|demo|classic), PHONE_MACS, PATIENT_BLE_ADDRS, SCAN_INTERVAL_S,
AWAY_AFTER_MIN, NIGHT_AWAY_AFTER_MIN, ISOLATION_DAYS, GUEST_RSSI_MIN, GUEST_DWELL_MIN,
GUEST_PHONES_ONLY, HUB_URL, DATA_DIR, SIM, PORT, DATA_MANAGER_URL (default http://127.0.0.1:8100,
"off" to disable), DATA_MANAGER_TOKEN. Explicit env values override the profile.

Every home period, outing and guest visit is mirrored into afferent-data-manager
(jetson/data_manager) as presence.home / presence.outing / presence.guest_visit intervals.
"""
from __future__ import annotations

import json
import logging
import os
import threading
import time
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from core import AWAY, HOME, GuestConfig, GuestTracker, PresenceConfig, PresenceTracker
from data_manager_client import DataManagerClient
from datasync import PresenceSync
from probes import BleProbe, SimWorld, WifiProbe

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("presence")


def env_f(name, default):
    try:
        return float(os.environ.get(name, default))
    except ValueError:
        return float(default)


def env_list(name):
    return [x.strip() for x in os.environ.get(name, "").split(",") if x.strip()]


PORT = int(os.environ.get("PORT", "8090"))
INTERVAL = env_f("SCAN_INTERVAL_S", 30)
SIM = os.environ.get("SIM", "") in ("1", "true", "yes")
DATA = Path(os.environ.get("DATA_DIR", "/data"))
HUB_URL = os.environ.get("HUB_URL", "").rstrip("/")
# Same Jetson, host networking: the data manager's mesh port is published on the host.
DATA_MANAGER_URL = os.environ.get("DATA_MANAGER_URL", "").strip() or "http://127.0.0.1:8100"

# Profiles bundle the tuning. Switch at runtime with POST /profile?name=demo (no redeploy).
#   home     real flat: 10 min away limit, room-sized BLE range (-65 dBm), phones only
#   demo     stage / hackathon: 2 min away limit, "at the table" BLE range (-55 dBm)
#   classic  the original v0.1 tuning, kept for comparison
PROFILES = {
    "home":    dict(away_min=10, night_away_min=45, rssi=-65, dwell_min=10, end_min=10,
                    window_min=5, phones_only=True, calibrate_min=60),
    "demo":    dict(away_min=2, night_away_min=2, rssi=-55, dwell_min=2, end_min=2,
                    window_min=1, phones_only=True, calibrate_min=5),
    "classic": dict(away_min=10, night_away_min=45, rssi=-75, dwell_min=10, end_min=10,
                    window_min=5, phones_only=False, calibrate_min=60),
}
# Explicit env vars still win over the profile (only at startup).
ENV_OVERRIDES = {"away_min": "AWAY_AFTER_MIN", "night_away_min": "NIGHT_AWAY_AFTER_MIN",
                 "rssi": "GUEST_RSSI_MIN", "dwell_min": "GUEST_DWELL_MIN"}

pcfg = PresenceConfig(isolation_days=env_f("ISOLATION_DAYS", 2), max_tick_gap_s=max(180.0, INTERVAL * 6))
gcfg = GuestConfig()
profile: dict = {"name": None}


def apply_profile(name: str, use_env: bool = False) -> dict:
    p = dict(PROFILES[name])
    if use_env:
        for key, var in ENV_OVERRIDES.items():
            if os.environ.get(var, "").strip():
                p[key] = env_f(var, p[key])
        if os.environ.get("GUEST_PHONES_ONLY", "").strip():
            p["phones_only"] = os.environ["GUEST_PHONES_ONLY"].lower() in ("1", "true", "yes")
    pcfg.away_after_s = p["away_min"] * 60
    pcfg.night_away_after_s = p["night_away_min"] * 60
    gcfg.rssi_min = int(p["rssi"])
    gcfg.dwell_s = p["dwell_min"] * 60
    gcfg.end_after_s = p["end_min"] * 60
    gcfg.window_s = p["window_min"] * 60
    gcfg.phones_only = bool(p["phones_only"])
    profile.clear()
    profile.update(name=name, **p)
    return profile


_start_profile = os.environ.get("PROFILE", "").strip().lower() or "home"
apply_profile(_start_profile if _start_profile in PROFILES else "home", use_env=True)

patient_ble = env_list("PATIENT_BLE_ADDRS")
presence = PresenceTracker(pcfg)
guests = GuestTracker(gcfg, ignore=patient_ble)
sim = SimWorld()
wifi = None if SIM else WifiProbe(env_list("PHONE_MACS"))
ble = None if SIM else BleProbe(patient_ble)
dm = DataManagerClient(source="afferent-presence", url=DATA_MANAGER_URL)
dsync = PresenceSync(dm)
lock = threading.Lock()
health: dict = {}
truth: dict = {"state": None, "since": None}


# ── persistence ─────────────────────────────────────────────────────────────
def state_file() -> Path:
    return DATA / "presence_state.json"


def save():
    try:
        DATA.mkdir(parents=True, exist_ok=True)
        tmp = state_file().with_suffix(".tmp")
        tmp.write_text(json.dumps({"presence": presence.to_dict(), "guests": guests.to_dict()}))
        tmp.replace(state_file())  # atomic: a power cut never leaves half a file
    except Exception as e:
        log.warning("save failed: %s", e)


def load():
    try:
        d = json.loads(state_file().read_text())
        presence.load(d.get("presence", {}))
        guests.load(d.get("guests", {}))
        log.info("restored state: %s since %s, %d outings, %d visits",
                 presence.state, presence.since, len(presence.outings), len(guests.visits))
    except FileNotFoundError:
        pass
    except Exception as e:
        log.warning("state file unreadable, starting fresh: %s", e)


def log_tick(row: dict):
    """One JSON line per scan -> score.py compares it against ground truth."""
    try:
        f = DATA / "ticks.jsonl"
        if f.exists() and f.stat().st_size > 20_000_000:
            f.replace(DATA / "ticks.1.jsonl")
        with f.open("a") as fh:
            fh.write(json.dumps(row) + "\n")
    except Exception:
        pass


# ── hub (UNO Q) — optional ──────────────────────────────────────────────────
_hub_last_knob = None


def hub_call(path, method="GET"):
    req = urllib.request.Request(HUB_URL + path, method=method)
    with urllib.request.urlopen(req, timeout=2) as r:
        return json.loads(r.read().decode())


def hub_poll_activity():
    """A knob turn/press on the companion is proof of someone at home."""
    global _hub_last_knob
    if not HUB_URL:
        return
    try:
        knob = (hub_call("/state").get("knob") or {})
        sig = (knob.get("position"), knob.get("pressed"))
        if _hub_last_knob is not None and sig != _hub_last_knob:
            presence.activity(time.time())
        _hub_last_knob = sig
        health["hub"] = "ok"
    except Exception as e:
        health["hub"] = f"unreachable: {e}"


def hub_alert(kind):
    if not HUB_URL:
        return
    tones = {"isolation": (440, 600), "left_home": (660, 120), "returned_home": (990, 120)}
    f, ms = tones.get(kind, (880, 200))
    try:
        hub_call(f"/buzz?freq={f}&ms={ms}", method="POST")
    except Exception as e:
        log.warning("hub alert failed: %s", e)


# ── main loop ───────────────────────────────────────────────────────────────
_prev_isolation = None


def tick():
    global _prev_isolation
    now = time.time()
    hub_poll_activity()
    if SIM:
        sig = {"wifi": sim.phone_wifi, "ble": sim.patient_ble}
        ads = sim.adverts(now)
        health.update(wifi="sim", ble="sim")
    else:
        sig = {"wifi": wifi.scan(), "ble": ble.patient_seen(window_s=max(120.0, INTERVAL * 3))}
        ads = ble.drain()
        health.update(wifi=wifi.last_error or ("ok" if wifi.macs else "PHONE_MACS not set"),
                      ble=ble.last_error or ("ok" if ble.ok else "starting"))
    with lock:
        events = presence.update(now, sig)
        guests.observe(ads)
        events += guests.update(now, patient_home=presence.state == HOME)
        m = presence.metrics(now)
        try:
            dsync.update(presence, guests, now)     # non-blocking: the client queues
        except Exception as e:
            log.warning("data manager sync failed: %s", e)
    for ev in events:
        log.info("event: %s (%s)", ev, presence.reason)
        if ev in ("left_home", "returned_home"):
            hub_alert(ev)
    if m["isolation_alert"] and _prev_isolation is False:
        log.warning("isolation alert: %.1f days without leaving home", m["days_since_last_outing"])
        hub_alert("isolation")
    _prev_isolation = m["isolation_alert"]
    log_tick({"t": now, "state": presence.state, "sig": sig, "ble_n": len(ads),
              "guests": guests.current, "events": events, "truth": truth["state"]})
    save()


def loop():
    while True:
        started = time.time()
        try:
            tick()
        except Exception:
            log.exception("tick failed")
        time.sleep(max(1.0, INTERVAL - (time.time() - started)))


# ── HTTP ────────────────────────────────────────────────────────────────────
def summary():
    now = time.time()
    with lock:
        g = guests.status(now)
        g["nearby_devices"] = guests.nearby_devices(now)
        return {"presence": presence.status(now), "guests": g, "profile": dict(profile),
                "health": {**health, "data_manager": dm.status()}, "sim": SIM, "truth": truth}


class Handler(BaseHTTPRequestHandler):
    def _send(self, code, body):
        data = json.dumps(body, indent=2).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, *a):
        pass

    def do_GET(self):
        p = urlparse(self.path).path
        s = summary()
        if p in ("/", "/summary"):
            self._send(200, s)
        elif p == "/presence":
            self._send(200, s["presence"])
        elif p == "/guests":
            self._send(200, s["guests"])
        elif p == "/health":
            self._send(200, s["health"])
        elif p == "/profile":
            self._send(200, {"active": s["profile"], "available": PROFILES})
        else:
            self._send(404, {"error": "not found"})

    def do_POST(self):
        u = urlparse(self.path)
        q = {k: v[0] for k, v in parse_qs(u.query).items()}
        now = time.time()
        if u.path == "/activity":
            with lock:
                presence.activity(now)
            self._send(200, {"ok": True})
        elif u.path == "/profile":
            name = q.get("name", "")
            if name not in PROFILES:
                self._send(400, {"error": f"unknown profile {name!r}", "available": list(PROFILES)})
                return
            with lock:
                apply_profile(name)
                # A baseline learned at another BLE range is meaningless now.
                guests.baseline, guests.household = 0.0, set()
            log.info("profile -> %s (guest baseline reset; run /calibrate)", name)
            self._send(200, {"ok": True, "profile": dict(profile),
                             "note": "guest baseline reset - POST /calibrate to relearn"})
        elif u.path == "/calibrate":
            mins = float(q.get("minutes", profile.get("calibrate_min", 60)))
            with lock:
                guests.start_calibration(now, mins * 60)
            self._send(200, {"ok": True, "calibrating_until": now + mins * 60})
        elif u.path == "/truth":
            truth.update(state=q.get("state"), since=now)
            self._send(200, {"ok": True, **truth})
        elif u.path == "/sim" and SIM:
            n = int(self.headers.get("Content-Length") or 0)
            body = json.loads(self.rfile.read(n) or b"{}")
            for k in ("phone_wifi", "patient_ble", "guests", "neighbours", "gadgets"):
                if k in body:
                    setattr(sim, k, body[k])
            self._send(200, {"ok": True, "sim": vars(sim)})
        else:
            self._send(404, {"error": "not found"})


def main():
    load()
    dsync.restore(presence)
    if ble:
        ble.start()
    threading.Thread(target=loop, daemon=True).start()
    log.info("presence on :%d (sim=%s, interval=%ss, phone macs=%d, patient ble=%d, hub=%s)",
             PORT, SIM, INTERVAL, len(wifi.macs) if wifi else 0, len(patient_ble), HUB_URL or "-")
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()


if __name__ == "__main__":
    main()
