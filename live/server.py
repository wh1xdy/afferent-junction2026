#!/usr/bin/env python3
"""Afferent Live: a public, read-only window on the demo table.

    python3 live/server.py            (BIND=127.0.0.1 PORT=8787 by default)

The server polls the real system on this machine, through the Wendy Net forwards:
  - the UNO Q sensor box, GET http://127.0.0.1:18081/state, every second;
  - the home hub on the Jetson, GET /api/bedside/state every 2 s and the demo patient's record
    (/api/patients/<id>) every 30 s, with the hub token as a Bearer header (never in a URL).
From that it builds ONE sanitized snapshot: a short list of facts (see snapshot()), nothing else.
Visitors only ever read that cached snapshot; no visitor request reaches the box or the hub.

Routes (GET only, everything else 404 / 405):
  /             the page (live/index.html)
  /live.json    the snapshot (no-store, CORS *)
  /stream       Server-Sent Events: `snapshot` once a second, `beat` as soon as a new heartbeat is seen
  /health       {"ok": true, "box": bool, "hub": bool}
  /endpoint.json  where the page finds this server: here, the same origin
  static files from the explicit list STATIC below (the page, its fonts, and the app's own scripts
  that the "What would it do?" panel runs, under /play/js/ as on the published site).

The hub token is read from AFFERENT_HUB_TOKEN_FILE (default ~/.afferent/home-hub.token) for each hub
request. It is never logged, never put in a URL, never part of a response.
"""
import collections
import datetime as dt
import json
import math
import os
import re
import sys
import threading
import time
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parent

BIND = os.environ.get("BIND", "127.0.0.1")
PORT = int(os.environ.get("PORT", "8787"))
BOX_URL = os.environ.get("AFFERENT_BOX_URL", "http://127.0.0.1:18081").rstrip("/")
HUB_URL = os.environ.get("AFFERENT_HUB_URL", "http://127.0.0.1:18000").rstrip("/")
TOKEN_FILE = os.environ.get("AFFERENT_HUB_TOKEN_FILE", "~/.afferent/home-hub.token")
SSE_MAX = int(os.environ.get("SSE_MAX", "150"))   # a Cloudflare quick tunnel carries at most 200 requests in flight

BOX_EVERY_S, BEDSIDE_EVERY_S, PATIENT_EVERY_S, SNAPSHOT_EVERY_S = 1.0, 2.0, 30.0, 1.0
TIMEOUT_S = 3.0
OFFLINE_S = 10.0              # a source older than this is shown offline
MAX_BODY = 4_000_000

# The sensor box's own rules (uno-q/modulino-hub/app.py and data_manager_push.py), applied again here.
MIN_QUALITY = 0.3             # data_manager_push.MIN_QUALITY: below this the pulse is not a measurement
LIVE_S = 3.0                  # data_manager_push.LIVE_S: a clip counts as live this long after a locked beat
WARMUP_S = 4.0                # app.WARMUP_S: no readings until the sensors have been on this long
SIGNAL_ON = 0.3               # app.presence_loop: signal or quality >= 0.3 = something is on the sensor
CLIMATE_FRESH_S = 150         # demo/js/sensors.js ROOM.FRESH_S: an older room reading is not shown
SAME_BEAT_S = 0.25            # both clips on one hand see the same beat within this (the box's refractory is 0.33 s)
FIRST_BEAT_S = 1.0            # the first beat seen after a start counts only when this fresh
PLAYED = ("completed", "partial", "fell_asleep")   # hub analytics/features.py PLAYED
SESSION_REASONS = ("mode", "dawn")                 # light reasons that only a running session sends (demo/js/engine.js)
REASONS = ("mode", "dawn", "asleep", "idle", "knob", "camera")
SENSORS = {"active": "on", "probing": "checking", "idle": "off"}

# engine.js MODES: the bedside light of each game mode. Read from demo/js/engine.js when it is there, so the
# page names the mode exactly as the game sets it; this copy is the fallback (test_server checks they agree).
MODE_LIGHTS_FALLBACK = [("calm", "#FFC98A"), ("flow", "#FFD9A0"), ("wake", "#DDEBFF"), ("fatigue", "#F4F7FF"),
                        ("rest", "#000000")]
MODE_RE = re.compile(r"(\w+):\s*\{\s*biome:\s*'[^']*',\s*colour:\s*'#[0-9A-Fa-f]{6}',\s*light:\s*\['(#[0-9A-Fa-f]{6})'")


def mode_lights(engine=REPO / "demo" / "js" / "engine.js"):
    try:
        found = [(m.group(1), m.group(2).upper()) for m in MODE_RE.finditer(Path(engine).read_text(encoding="utf-8"))]
    except OSError:
        found = []
    return found if len(found) >= 5 else list(MODE_LIGHTS_FALLBACK)


def log(msg):
    print(f"{time.strftime('%H:%M:%S')} {msg}", file=sys.stderr, flush=True)


# ── small, strict readers ──────────────────────────────────────────────────────────────

def num(x, lo=None, hi=None):
    """x as a float when it is a finite number (not a bool) inside [lo, hi], else None."""
    if isinstance(x, bool) or not isinstance(x, (int, float)) or not math.isfinite(x):
        return None
    if (lo is not None and x < lo) or (hi is not None and x > hi):
        return None
    return float(x)


def get(d, *path):
    for k in path:
        if isinstance(d, dict):
            d = d.get(k)
        elif isinstance(d, list) and isinstance(k, int) and -len(d) <= k < len(d):
            d = d[k]
        else:
            return None
    return d


def fresh(t, now, max_age):
    """t (seconds, the same clock as now) is at most max_age old; a little clock skew forward is allowed."""
    t = num(t)
    return t is not None and -1.0 <= now - t <= max_age


def iso(wall):
    return dt.datetime.fromtimestamp(wall).astimezone().isoformat(timespec="seconds") if wall else None


def minute_iso(s):
    """An ISO time from the hub, normalised to the minute, or None when it is not one."""
    if not isinstance(s, str) or len(s) > 40:
        return None
    try:
        t = dt.datetime.fromisoformat(s)
    except ValueError:
        return None
    return (t if t.tzinfo else t.astimezone()).isoformat(timespec="minutes")


# ── the sensor box ─────────────────────────────────────────────────────────────────────

class Box:
    """What the box's /state says, by the box's own rules. Keeps each clip's newest locked beat (device clock),
    as the box's fingers_live does, and finds new heartbeats between two polls."""

    def __init__(self):
        self.locked_at = [None, None]    # device time of each clip's newest locked beat
        self.seen_beat = [None, None]    # device time of the newest beat already looked at, per clip
        self.last_beat = None            # device time of the newest beat sent out
        self.beat_seq = 0

    def view(self, doc):
        """(facts, new_beats): facts for the snapshot, new_beats = ages in seconds of beats not seen before."""
        now = num(doc.get("now")) or time.time()
        presence = doc.get("presence") if isinstance(doc.get("presence"), dict) else {}
        mode = presence.get("mode") if presence.get("mode") in SENSORS else None
        since = num(presence.get("since"))
        sensing = mode == "active" and since is not None and now - since >= WARMUP_S
        finger = doc.get("finger") if isinstance(doc.get("finger"), dict) else {}
        fingers = doc.get("fingers") if isinstance(doc.get("fingers"), list) else []
        pulses = doc.get("pulses") if isinstance(doc.get("pulses"), list) else []
        fused_q = num(finger.get("quality"), 0, 1) or 0.0
        two = finger.get("two_hearts") is True

        for c in (0, 1):
            f = get(fingers, c)
            if isinstance(f, dict) and f.get("locked") is True and num(f.get("t")) is not None:
                if self.locked_at[c] is None or f["t"] > self.locked_at[c]:
                    self.locked_at[c] = float(f["t"])
            if not sensing:
                self.locked_at[c] = None
        live_lock = [sensing and fresh(self.locked_at[c], now, LIVE_S) for c in (0, 1)]

        clips, trusted = [], []
        for c in (0, 1):
            per = get(pulses, c, "period") or {}
            q = num(per.get("quality"), 0, 1) or 0.0
            sig = num(per.get("signal"), 0, 1) or 0.0
            trusted.append(get(finger, "clips", c, "trusted") is not False)
            # the clip's own number as the box lets it out (finger.fingers, after its PulseGuard), only while the
            # clip is locked, trusted and the app's quality rule passes (app.on_beat: max(own, fused) >= 0.3)
            bpm = num(get(finger, "fingers", c) if isinstance(finger.get("fingers"), list)
                      else get(fingers, c, "bpm_live"), 30, 220)
            ok = bpm is not None and live_lock[c] and trusted[c] and max(q, fused_q) >= MIN_QUALITY
            on = sensing and (ok or sig >= SIGNAL_ON or q >= SIGNAL_ON)
            clips.append({"on": bool(on), "bpm": round(bpm) if ok else None})

        # the fused pulse as it leaves the box (finger.bpm = beat.bpm_live, after PulseGuard): quality at least
        # 0.3, a clip locked within LIVE_S behind it, one person on the clips
        bpm = num(finger.get("bpm") if "bpm" in finger else get(doc, "beat", "bpm_live"), 30, 220)
        sources = [c for c in finger.get("sources") or [] if c in (0, 1)] if isinstance(finger.get("sources"), list) else []
        behind = all(live_lock[c] for c in sources) if sources else any(live_lock)
        pulse_ok = bpm is not None and sensing and not two and fused_q >= MIN_QUALITY and behind
        if pulse_ok and not fresh(get(doc, "beat", "t"), now, LIVE_S):
            pulse_ok = False

        def per_clip(block, key, lo, hi):
            ch = block.get("channel") if isinstance(block, dict) else None
            chans = [0, 1] if ch == "both" else [ch] if ch in (0, 1) else []
            v = num(block.get(key), lo, hi) if isinstance(block, dict) else None
            return v if pulse_ok and chans and all(live_lock[c] for c in chans) else None

        hrv = doc.get("hrv") if isinstance(doc.get("hrv"), dict) else {}
        rmssd = per_clip(hrv, "rmssd_ms", 1, 250)
        own = num(hrv.get("baseline_rmssd_ms"), 1, 250) if rmssd is not None else None
        breaths = per_clip(doc.get("breathing"), "per_minute", 3, 40)

        eligible = [clips[c]["bpm"] is not None or (pulse_ok and live_lock[c] and trusted[c]) for c in (0, 1)]
        beats = [] if two else self._beats(doc, now, eligible)

        climate = doc.get("climate") if isinstance(doc.get("climate"), dict) else {}
        room = None
        if fresh(climate.get("t"), now, CLIMATE_FRESH_S):
            c, h = num(climate.get("celsius"), -10, 50), num(climate.get("humidity"), 0, 100)
            if c is not None:
                room = {"celsius": round(c, 1), "humidity": round(h) if h is not None else None}
        mods = doc.get("modulinos") if isinstance(doc.get("modulinos"), dict) else None
        modulinos = [k for k in ("knob", "thermo", "buzzer") if mods and mods.get(k) is True] if mods else None

        facts = {
            "sensors": SENSORS.get(mode) if doc.get("bridge") == "connected" else "starting",
            "room": room,
            "clips": clips,
            "pulse": {"bpm": round(bpm) if pulse_ok else None, "quality": round(fused_q, 2) if pulse_ok else None,
                      "two_people": bool(two and sensing),
                      "hrv_ms": round(rmssd) if rmssd is not None else None,
                      "hrv_own_ms": round(own) if own is not None else None,
                      "breaths_per_min": round(breaths, 1) if breaths is not None else None},
            "modulinos": modulinos,
        }
        return facts, beats

    def _beats(self, doc, now, eligible):
        """Ages (s) of heartbeats seen for the first time in this /state. Each clip's newest locked beat
        (fingers[c].t, set by the box when its detector fires); when a box gives no per-clip beats, the newest
        beat of the box's own analysis (pulses[c].last_beat_age_s). Both clips on one hand: one beat."""
        found, per_clip = [], isinstance(doc.get("fingers"), list)
        for c in (0, 1):
            f = get(doc, "fingers", c)
            if per_clip:
                t = float(f["t"]) if isinstance(f, dict) and f.get("locked") is True and num(f.get("t")) is not None else None
            else:
                age = num(get(doc, "pulses", c, "last_beat_age_s"), 0, 30)
                t = now - age if age is not None else None
            if t is None:
                continue
            seen = self.seen_beat[c]
            new = (t > seen + 1e-6) if seen is not None else (now - t <= FIRST_BEAT_S)
            if seen is None or t > seen:
                self.seen_beat[c] = t
            if new and eligible[c] and now - t <= LIVE_S:
                found.append(t)
        out = []
        for t in sorted(found):          # oldest first; a beat counts only when clearly after the last one sent
            if self.last_beat is not None and t < self.last_beat + SAME_BEAT_S:
                continue
            self.last_beat = t
            self.beat_seq += 1
            out.append(max(0.0, now - t))
        return out


# ── the home hub ───────────────────────────────────────────────────────────────────────

HEX = re.compile(r"^#[0-9A-Fa-f]{6}$")
PID = re.compile(r"^[A-Za-z0-9_-]{1,64}$")


def light_view(bedside, lights):
    """The bedside light as the hub set it: colour, level, why, and the game mode when a session set it."""
    light = bedside.get("light") if isinstance(bedside.get("light"), dict) else {}
    rgb = light.get("rgb") if isinstance(light.get("rgb"), str) and HEX.match(light["rgb"]) else None
    if rgb is None:
        return None
    rgb = rgb.upper()
    level = num(light.get("level"), 0, 100)
    reason = light.get("reason") if light.get("reason") in REASONS else "other"
    mode = next((m for m, c in lights if c == rgb), None) if reason == "mode" else None
    return {"rgb": rgb, "level": round(level) if level is not None else 0, "reason": reason, "mode": mode}


def view_key(view):
    """What changes in the patient's own view (/patient-view) when the hub records a new played session."""
    if not isinstance(view, dict):
        return None
    return (view.get("date"), get(view, "today", "session_id"), view.get("mornings_lit"))


def patient_view(view, detail):
    """The demo patient's mornings, as the patient's own view counts them (mornings_lit: days with a session that
    reached dawn or fell asleep), and when the last played session (completed, partial, fell asleep; never a
    simulated one) started, from the hub's record. None when the patient or today's session is simulated."""
    if not isinstance(view, dict) or view.get("simulated") is not False:
        return None
    mornings = num(view.get("mornings_lit"), 0, 1e6)
    if mornings is None or not isinstance(detail, dict) or get(detail, "patient", "simulated") is not False:
        return None
    sessions = detail.get("sessions") if isinstance(detail.get("sessions"), list) else []
    played = [s for s in sessions if isinstance(s, dict) and s.get("status") in PLAYED and not s.get("simulated")]
    times = [t for t in (minute_iso(s.get("started_iso")) for s in played) if t]
    last = max(times, key=lambda t: dt.datetime.fromisoformat(t)) if times else None
    return {"mornings": int(mornings), "last_morning": last, "sessions_total": len(sessions)}


def read_token(path=None):
    try:
        t = Path(os.path.expanduser(path or TOKEN_FILE)).read_text(encoding="utf-8").strip()
    except OSError:
        return None
    return t or None


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None                      # a redirect is an error here: the Bearer header goes nowhere else


_OPENER = urllib.request.build_opener(urllib.request.ProxyHandler({}), _NoRedirect())


def fetch_json(url, headers=None, timeout=TIMEOUT_S):
    req = urllib.request.Request(url, headers={"Accept": "application/json", "User-Agent": "afferent-live/1",
                                               **(headers or {})})
    with _OPENER.open(req, timeout=timeout) as r:
        body = r.read(MAX_BODY + 1)
    if len(body) > MAX_BODY:
        raise ValueError("response too large")
    return json.loads(body)


# ── the snapshot ───────────────────────────────────────────────────────────────────────

class Live:
    def __init__(self, fetch=fetch_json, token=read_token, clock=time.time, mono=time.monotonic, lights=None,
                 box_url=BOX_URL, hub_url=HUB_URL):
        self.fetch, self.token, self.clock, self.mono = fetch, token, clock, mono
        self.lights = lights if lights is not None else mode_lights()
        self.box_url, self.hub_url = box_url, hub_url
        self.lock = threading.Lock()
        self.box = Box()
        self.box_facts = self.box_ok = self.box_wall = None
        self.bed = self.bed_ok = self.bed_wall = None
        self.pid = None
        self.pat = self.pat_ok = None
        self.pat_key = self.pat_detail = None
        self.beat_wall = None            # wall time of the newest heartbeat
        self.session = {"key": None, "total_at": None, "ended": False}
        self.failing = {}

    def _problem(self, source, e):
        """Logged once a source has failed for OFFLINE_S (it shows offline then); a slow answer now and then is not."""
        what = f"HTTP {e.code}" if hasattr(e, "code") else type(e).__name__
        f = self.failing.setdefault(source, {"since": self.mono(), "logged": False})
        if not f["logged"] and self.mono() - f["since"] >= OFFLINE_S:
            f["logged"] = True
            log(f"{source}: not answering for {OFFLINE_S:.0f} s ({what})")

    def _fine(self, source):
        f = self.failing.pop(source, None)
        if f and f["logged"]:
            log(f"{source}: answering again")

    def poll_box(self):
        """One /state from the box. Returns the new heartbeats as SSE `beat` payloads."""
        try:
            doc = self.fetch(self.box_url + "/state")
            if not isinstance(doc, dict):
                raise ValueError("not an object")
            got = self.mono()
            with self.lock:
                facts, ages = self.box.view(doc)
                self.box_facts, self.box_ok, self.box_wall = facts, got, self.clock()
                out = []
                for age in ages:
                    self.beat_wall = self.clock() - age
                    out.append({"seq": self.box.beat_seq, "age_ms": round(age * 1000), "bpm": facts["pulse"]["bpm"]})
            self._fine("box")
            return out
        except Exception as e:  # noqa: BLE001 - any failure is "the box does not answer"
            self._problem("box", e)
            return []

    def _hub(self, path):
        token = self.token()
        if not token:
            raise PermissionError("no hub token")
        return self.fetch(self.hub_url + path, {"Authorization": "Bearer " + token})

    def poll_bedside(self):
        try:
            doc = self._hub("/api/bedside/state")
            if not isinstance(doc, dict):
                raise ValueError("not an object")
            pid = doc.get("patient_id") if isinstance(doc.get("patient_id"), str) and PID.match(doc["patient_id"]) else None
            with self.lock:
                self.bed, self.bed_ok, self.bed_wall = doc, self.mono(), self.clock()
                self.pid = pid
                self._track_session()
            self._fine("hub")
        except Exception as e:  # noqa: BLE001
            self._problem("hub", e)

    def poll_patient(self):
        """The demo patient's record. Returns a shorter wait while the hub has not yet said who that is."""
        with self.lock:
            pid = self.pid
        if not pid:
            return 2.0
        base = "/api/patients/" + urllib.parse.quote(pid, safe="")
        try:
            # the patient's own view is light for the hub (~0.5 s); the full record (~2 s of the hub's time) only
            # when that view shows a new session, or the first time
            view = self._hub(base + "/patient-view")
            key = view_key(view)
            if key is None or key != self.pat_key or self.pat_detail is None:
                detail = self._hub(base)
                self.pat_detail = {"patient": {"simulated": get(detail, "patient", "simulated")},
                                   "sessions": [{k: s.get(k) for k in ("status", "simulated", "started_iso")}
                                                for s in (detail.get("sessions") or []) if isinstance(s, dict)]}
                self.pat_key = key
            pat = patient_view(view, self.pat_detail)
            with self.lock:
                self.pat, self.pat_ok = pat, self.mono()
                self._track_session()
            self._fine("hub record")
        except Exception as e:  # noqa: BLE001
            self._problem("hub record", e)

    def _track_session(self):
        """A session runs while the phone holds the light in a mode or dawn colour (only a session sends those).
        When the hub records a new session after that, the session has ended even if the light still shows it."""
        light = light_view(self.bed or {}, self.lights) if self.bed else None
        key = (light["reason"], light["rgb"]) if light and light["reason"] in SESSION_REASONS else None
        total = self.pat["sessions_total"] if self.pat else None
        s = self.session
        if key != s["key"]:
            s.update(key=key, total_at=total, ended=False)
        elif key and total is not None:
            if s["total_at"] is None:
                s["total_at"] = total
            elif total > s["total_at"]:
                s["ended"] = True

    def online(self, ok):
        return ok is not None and self.mono() - ok <= OFFLINE_S

    def snapshot(self):
        with self.lock:
            now = self.clock()
            box_on, hub_on = self.online(self.box_ok), self.online(self.bed_ok)
            f = self.box_facts if box_on else None
            pulse = dict(f["pulse"]) if f else {"bpm": None, "quality": None, "two_people": False, "hrv_ms": None,
                                                "hrv_own_ms": None, "breaths_per_min": None}
            beat_age = now - self.beat_wall if self.beat_wall and pulse["bpm"] is not None else None
            pulse["beat_seq"] = self.box.beat_seq
            pulse["beat_age_ms"] = round(beat_age * 1000) if beat_age is not None and 0 <= beat_age <= OFFLINE_S else None
            bed = self.bed if hub_on else None
            light = light_view(bed, self.lights) if bed else None
            simulated = bool(bed and bed.get("simulated") is not False)
            if simulated:
                light = None             # the hub's bedside is its simulator: nothing about it is real
            in_bed = get(bed, "presence", "in_bed") if bed else None
            running = bool(light and light["reason"] in SESSION_REASONS and not self.session["ended"])
            pat_fresh = self.pat_ok is not None and self.mono() - self.pat_ok <= PATIENT_EVERY_S + OFFLINE_S
            pat = self.pat if hub_on and pat_fresh else None
            return {
                "v": 1,
                "t": round(now * 1000),
                "time": iso(now),
                "box": {"online": box_on, "last_seen": iso(self.box_wall), "sensors": f["sensors"] if f else None},
                "room": f["room"] if f else None,
                "clips": f["clips"] if f else [{"on": False, "bpm": None}, {"on": False, "bpm": None}],
                "pulse": pulse,
                "modulinos": f["modulinos"] if f else None,
                "hub": {"online": hub_on, "last_seen": iso(self.bed_wall),
                        "box_linked": bool(bed.get("connected")) if bed else None,
                        "simulated": simulated if bed else None},
                "light": light,
                "presence": {"in_bed": in_bed if isinstance(in_bed, bool) else None},
                "session": {"running": running,
                            "mode": light["mode"] if running and light["reason"] == "mode" else None,
                            "phase": ("dawn" if light["reason"] == "dawn" else "play") if running else None},
                "patient": {"mornings": pat["mornings"], "last_morning": pat["last_morning"]} if pat else None,
            }

    def health(self):
        with self.lock:
            return {"ok": True, "box": self.online(self.box_ok), "hub": self.online(self.bed_ok)}


# ── Server-Sent Events ─────────────────────────────────────────────────────────────────

def sse_frame(event, data):
    """One SSE event. Compact JSON never holds a raw newline, so one data line carries it."""
    body = json.dumps(data, separators=(",", ":"), ensure_ascii=True)
    return f"event: {event}\ndata: {body}\n\n".encode("ascii")


class Broadcast:
    """Many SSE clients, one serialised frame each time: every client waits on one condition and writes the
    frames it has not sent yet from a short ring. A client that falls behind skips to what is in the ring."""

    def __init__(self, cap=SSE_MAX, ring=32):
        self.cond = threading.Condition()
        self.seq, self.ring, self.clients, self.cap, self.closed = 0, collections.deque(maxlen=ring), 0, cap, False

    def join(self):
        with self.cond:
            if self.clients >= self.cap or self.closed:
                return False
            self.clients += 1
            return True

    def leave(self):
        with self.cond:
            self.clients -= 1

    def publish(self, frame):
        with self.cond:
            self.seq += 1
            self.ring.append((self.seq, frame))
            self.cond.notify_all()

    def wait(self, after, timeout=15.0):
        with self.cond:
            self.cond.wait_for(lambda: self.seq > after or self.closed, timeout)
            return [f for s, f in self.ring if s > after], self.seq

    def close(self):
        with self.cond:
            self.closed = True
            self.cond.notify_all()


# ── HTTP ───────────────────────────────────────────────────────────────────────────────

# Exact paths only; nothing is looked up from the request path itself.
STATIC = {
    "/": ("index.html", "text/html; charset=utf-8"),
    "/index.html": ("index.html", "text/html; charset=utf-8"),
    "/live.css": ("live.css", "text/css; charset=utf-8"),
    "/live.js": ("live.js", "text/javascript; charset=utf-8"),
    "/whatif.js": ("whatif.js", "text/javascript; charset=utf-8"),
    "/favicon.svg": ("favicon.svg", "image/svg+xml"),
    "/fonts/Jost-latin.woff2": ("fonts/Jost-latin.woff2", "font/woff2"),
    "/fonts/GoogleSansFlex-latin-rond.woff2": ("fonts/GoogleSansFlex-latin-rond.woff2", "font/woff2"),
}
# The app's own decision code for "What would it do?" (whatif.js), served from demo/js as /play/js/<file>, the
# path it has on the published site. Only these files.
ENGINE_JS = ["util.js", "haptics.js", "sensors.js", "hrv.js", "finger.js", "campulse.js", "face.js", "input.js",
             "watch.js", "health.js", "music.js", "juice.js", "skill.js", "breathing.js", "heartbeat.js", "record.js",
             "traverse.js", "minigames.js", "tasks/kit.js", "engine.js", "livevitals.js"] + [
    f"tasks/{t}.js" for t in ("birds", "beacon", "bells", "breath", "faces", "ferry", "buoys", "drips", "fog", "glance",
                              "fireflies", "owls", "loyly", "seals", "reindeer", "runes", "signpost", "steps", "stars",
                              "windows", "shutters", "swans", "vihta", "threads")]
for _f in ENGINE_JS:
    STATIC["/play/js/" + _f] = (REPO / "demo" / "js" / _f, "text/javascript; charset=utf-8")

CSP = ("default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; "
       "connect-src 'self' https://*.trycloudflare.com; media-src 'none'; object-src 'none'; base-uri 'none'; "
       "form-action 'none'; frame-ancestors 'none'")
COMMON = {"X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer",
          "Permissions-Policy": "camera=(), microphone=(), geolocation=(), interest-cohort=()"}
API = {"Access-Control-Allow-Origin": "*", "Cross-Origin-Resource-Policy": "cross-origin", "Cache-Control": "no-store"}


class Handler(BaseHTTPRequestHandler):
    server_version = "afferent-live"
    sys_version = ""
    timeout = 20                          # a blocked write to a dead client ends after this
    live: Live = None
    cast: Broadcast = None
    static_root = HERE

    def log_message(self, *_):            # no visitor log
        pass

    def _send(self, code, body, ctype, extra=None, head=False):
        self.send_response(code)
        for k, v in {**COMMON, **(extra or {})}.items():
            self.send_header(k, v)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        if not head:
            self.wfile.write(body)

    def _json(self, code, obj, head=False, extra=None):
        self._send(code, json.dumps(obj, separators=(",", ":")).encode(), "application/json", {**API, **(extra or {})}, head)

    def _not_found(self, head=False):
        self._send(404, b"Not found\n", "text/plain; charset=utf-8", {"Cache-Control": "no-store"}, head)

    def do_HEAD(self):
        self.do_GET(head=True)

    def do_GET(self, head=False):
        path = urllib.parse.urlsplit(self.path).path
        if path == "/live.json":
            # built from the cached facts for each request, so beat_age_ms is right at the moment it leaves
            return self._json(200, self.live.snapshot(), head)
        if path == "/stream":
            return self._not_found(head) if head else self._stream()
        if path == "/health":
            return self._json(200, self.live.health(), head)
        if path == "/endpoint.json":
            return self._json(200, {"live": "", "sse": True}, head)
        hit = STATIC.get(path)
        if hit is None:
            return self._not_found(head)
        name, ctype = hit
        try:
            body = (Path(name) if isinstance(name, Path) else self.static_root / name).read_bytes()
        except OSError:
            return self._not_found(head)
        extra = {"Cache-Control": "public, max-age=86400" if ctype == "font/woff2" else "no-cache",
                 "Cross-Origin-Resource-Policy": "same-origin"}
        if ctype.startswith("text/html"):
            extra.update({"Content-Security-Policy": CSP, "X-Frame-Options": "DENY"})
        self._send(200, body, ctype, extra, head)

    def _refuse(self):
        self._send(405, b"Method not allowed\n", "text/plain; charset=utf-8", {"Allow": "GET, HEAD"})

    do_POST = do_PUT = do_DELETE = do_PATCH = do_OPTIONS = _refuse

    def _stream(self):
        if not self.cast.join():
            return self._send(503, b"Too many listeners, poll /live.json\n", "text/plain; charset=utf-8",
                              {**API, "Retry-After": "10"})
        try:
            self.send_response(200)
            for k, v in {**COMMON, **API, "Content-Type": "text/event-stream", "Cache-Control": "no-store, no-transform",
                         "X-Accel-Buffering": "no", "Connection": "close"}.items():
                self.send_header(k, v)
            self.end_headers()
            seq = self.cast.seq
            self.wfile.write(b"retry: 3000\n\n" + sse_frame("snapshot", self.live.snapshot()))
            self.wfile.flush()
            while not self.cast.closed:
                frames, seq = self.cast.wait(seq)
                self.wfile.write(b"".join(frames) or b": keepalive\n\n")
                self.wfile.flush()
        except OSError:
            pass                           # the visitor left
        finally:
            self.cast.leave()
            self.close_connection = True


# ── running ────────────────────────────────────────────────────────────────────────────

def every(stop, seconds, fn):
    def loop():
        while not stop.is_set():
            t0, wait = time.monotonic(), None
            try:
                wait = fn()
            except Exception as e:  # noqa: BLE001 - a poller never dies
                log(f"{fn.__name__}: {type(e).__name__}")
            wait = wait if isinstance(wait, (int, float)) and not isinstance(wait, bool) else seconds
            stop.wait(max(0.05, wait - (time.monotonic() - t0)))
    th = threading.Thread(target=loop, name=getattr(fn, "__name__", "poll"), daemon=True)
    th.start()
    return th


def start(live, cast, stop):
    def box():
        for b in live.poll_box():
            cast.publish(sse_frame("beat", b))
        return None

    def snapshot():
        cast.publish(sse_frame("snapshot", live.snapshot()))

    every(stop, BOX_EVERY_S, box)
    every(stop, BEDSIDE_EVERY_S, live.poll_bedside)
    every(stop, PATIENT_EVERY_S, live.poll_patient)
    every(stop, SNAPSHOT_EVERY_S, snapshot)


def main():
    live, cast, stop = Live(), Broadcast(), threading.Event()
    Handler.live, Handler.cast = live, cast
    if read_token() is None:
        log(f"no hub token in {TOKEN_FILE}: the hub will show offline")
    start(live, cast, stop)
    httpd = ThreadingHTTPServer((BIND, PORT), Handler)
    httpd.daemon_threads = True
    log(f"Afferent Live on http://{BIND}:{PORT}/ (box {BOX_URL}, hub {HUB_URL})")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        stop.set()
        cast.close()
        httpd.server_close()


if __name__ == "__main__":
    main()
