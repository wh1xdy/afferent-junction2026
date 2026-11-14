"""UNO Q `modulino-hub` over HTTP as a hub BedsideSource.

    AFFERENT_BEDSIDE=unoq:http://127.0.0.1:18081        (./start.sh --unoq http://127.0.0.1:18081)

The UNO Q publishes its HTTP API only on the Wendy Net mesh (port 18080), so the hub Mac needs a
forward first. On a Mac that has the wendy CLI and is logged in to Alex's Wendy org:

    wendy net forward 18081:18080 --device 169.254.3.42:50052

The hub polls GET /state once a second and turns it into the bedside events the controller already
knows (hello, status, pulse, knob, thermo) plus one `physio` event per poll. It drives the KY-016
through POST /led and keeps the heartbeat beep muted. Device API: uno-q/SENSORS.md and
uno-q/modulino-hub/app.py.

Rules (integration plan I12, I14, I15 and Alex's answers A3, A6, A7, A9, A12):
- the fused finger pulse counts only while the device reports presence `active`, quality is
  reported and at least 0.3, and the newest contributing beat is at most 3 s old on the device clock;
- breathing and HRV are taken only while the device is actually updating them: it keeps the last
  values in /state while idle and during the first seconds after a finger is detected;
- UNO Q presence is finger detection, not a bed sensor, so no `presence` (in_bed) event is emitted;
- the knob only turns the level; a press is never forwarded;
- device times are compared with device times only, never with the hub clock;
- nothing here is simulated and nothing is invented: a missing field stays None.
"""
import asyncio
import logging
import math
import time

import httpx

from .protocol import hex_rgb
from .source import OnEvent

log = logging.getLogger("afferent.bedside")
# httpx logs every request at INFO; with a 1 Hz poll that is one hub log line per second.
logging.getLogger("httpx").setLevel(logging.WARNING)

FW = "modulino-hub/http"
SOURCE = "finger_ppg"
TRANSPORT = "hub_http"
MODES = ("idle", "probing", "active")

MIN_QUALITY = 0.3            # Alex A7: below this the reading is unreliable even if bpm is not null
MAX_AGE_S = 3.0              # a value counts only if it is at most 3 s old
# The device runs update_breathing / update_hrv only while sensing (active and 4 s warm-up over,
# app.py:253-256, WARMUP_S), once per 1 s loop. 6 s after `presence.since` the values in /state are
# from this wearing; before that they can be left over from the previous one.
SETTLE_S = 6.0
THERMO_EVERY_S = 60.0        # controller.counters["temps"] assumes about one reading per minute
THERMO_MAX_AGE_S = 30.0      # the sketch sends climate every 2 s; older means the Modulino is gone
KNOB_START_LEVEL = 15        # same as Bedside.dawn_level
# Level change per encoder count. Counts per turn and the sign of a clockwise turn are unmeasured
# (A12), so 2 is a guess: 50 counts cover the whole 0..100 range.
KNOB_STEP = 2
FAILS_TO_DISCONNECT = 3
MUTE_RETRY_S = 10.0
LIGHT_MIN_GAP_S = 0.3        # A6: /led goes through the Arduino Bridge, a few calls per second at most
LIGHT_RETRY_S = 1.0          # a failed /led is sent again after this long
ENABLE_SETTLE_S = 0.7        # one presence loop tick (0.5 s) so the forced mode is in place
RESUME_HOLD_S = 8.0          # after re-enabling: LEAVE_AFTER_S (5 s) plus loop ticks on the device


def _num(v):
    if isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v):
        return None
    return v


def _obj(v) -> dict:
    return v if isinstance(v, dict) else {}


def new_mem() -> dict:
    return {"knob_last": None, "level": KNOB_START_LEVEL, "thermo_t": None, "thermo_live": False,
            "pulse_sig": None}


def null_pulse() -> dict:
    return {"type": "pulse", "bpm": None, "quality": 0, "contact": False, "source": SOURCE}


def empty_physio() -> dict:
    return {"type": "physio", "source": SOURCE, "transport": TRANSPORT, "simulated": False,
            "pulse_bpm": None, "quality": None, "quality_reported": True, "contact": False,
            "finger_bpm": [None, None], "finger_sources": [],
            "breathing_per_min": None, "breathing_snr_db": None,
            "rmssd_ms": None, "sdnn_ms": None, "rmssd_baseline_ms": None, "rmssd_vs_baseline": None,
            "presence": None, "age_s": None}


def map_state(state: dict, mem: dict, now_mono: float) -> list[dict]:
    """One GET /state document -> bedside events. No I/O.

    `mem` carries what has to survive between polls: the last knob position and the level, the time
    of the last thermo event and the last pulse validity. A fresh `new_mem()` (or `{}`) means
    "just connected": one pulse and one thermo event are emitted whatever the state is.
    """
    events: list[dict] = []
    presence = _obj(state.get("presence"))
    mode = presence.get("mode") if presence.get("mode") in MODES else None
    active = mode == "active"
    finger = _obj(state.get("finger"))
    bpm, q = _num(finger.get("bpm")), _num(finger.get("quality"))
    if bpm is not None and bpm <= 0:
        bpm = None

    # device clock only: `now` (added by the firmware track) or the 1 Hz stamp of the fusion loop
    device_now = _num(state.get("now")) or _num(_obj(state.get("beat")).get("t"))
    chans = state.get("fingers") if isinstance(state.get("fingers"), list) else []
    beat_t = [_num(_obj(c).get("t")) for c in chans]
    sources = [c for c in (finger.get("sources") or [])
               if isinstance(c, int) and not isinstance(c, bool) and 0 <= c < 2]
    seen = [beat_t[c] for c in (sources or range(len(beat_t))) if c < len(beat_t) and beat_t[c] is not None]
    newest = max(seen) if seen else None
    age_s = round(max(0.0, device_now - newest), 2) if device_now is not None and newest is not None else None

    valid = bool(active and bpm is not None and q is not None and q >= MIN_QUALITY
                 and (age_s is None or age_s <= MAX_AGE_S))

    # pulse: every poll while valid; one null when it stops being valid, when contact changes
    # while there is no valid value, and at connect
    sig = (valid, active)
    if valid:
        events.append({"type": "pulse", "bpm": bpm, "quality": q, "contact": True, "source": SOURCE})
    elif mem.get("pulse_sig") != sig:
        events.append({"type": "pulse", "bpm": None, "quality": q or 0, "contact": active, "source": SOURCE})
    mem["pulse_sig"] = sig

    per_finger = [None, None]
    raw = finger.get("fingers") if isinstance(finger.get("fingers"), list) else []
    if active:
        for c in range(2):
            v = _num(raw[c]) if c < len(raw) else None
            t = beat_t[c] if c < len(beat_t) else None
            stale = device_now is not None and t is not None and device_now - t > MAX_AGE_S
            # no beat time for this finger: the number is left over from an earlier wearing
            per_finger[c] = v if v and t is not None and not stale else None

    since = _num(presence.get("since"))
    settled = bool(active and device_now is not None and since is not None and device_now - since >= SETTLE_S)
    breathing, hrv = _obj(state.get("breathing")), _obj(state.get("hrv"))
    events.append({
        "type": "physio", "source": SOURCE, "transport": TRANSPORT, "simulated": False,
        "pulse_bpm": bpm if valid else None, "quality": q, "quality_reported": True, "contact": active,
        "finger_bpm": per_finger, "finger_sources": sources if active else [],
        "breathing_per_min": _num(breathing.get("per_minute")) if settled else None,
        "breathing_snr_db": _num(breathing.get("snr")) if settled else None,
        "rmssd_ms": _num(hrv.get("rmssd_ms")) if settled else None,
        "sdnn_ms": _num(hrv.get("sdnn_ms")) if settled else None,
        # the device's own running median of RMSSD since its app started (not per person)
        "rmssd_baseline_ms": _num(hrv.get("baseline_rmssd_ms")),
        "rmssd_vs_baseline": _num(hrv.get("vs_baseline")) if settled else None,
        "presence": mode, "age_s": age_s,
    })

    climate = _obj(state.get("climate"))
    temp, climate_t = _num(climate.get("celsius")), _num(climate.get("t"))
    gone = temp is None or (device_now is not None and climate_t is not None
                            and device_now - climate_t > THERMO_MAX_AGE_S)
    last = mem.get("thermo_t")
    if gone:
        if mem.get("thermo_live"):
            mem["thermo_live"] = False
            mem["thermo_t"] = None
            events.append({"type": "thermo", "temp_c": None, "humidity_pct": None})
    elif last is None or now_mono - last >= THERMO_EVERY_S:
        mem["thermo_t"], mem["thermo_live"] = now_mono, True
        events.append({"type": "thermo", "temp_c": temp, "humidity_pct": _num(climate.get("humidity"))})

    # knob: `state.knob` is None until the first turn after boot; position is a relative int16.
    # `pressed` is ignored on purpose (I15: the press toggles a camera this device does not have).
    pos = _num(_obj(state.get("knob")).get("position"))
    if pos is None:
        mem["knob_last"] = None
    else:
        pos, last_pos = int(pos), mem.get("knob_last")
        mem["knob_last"] = pos
        if last_pos is not None:
            delta = ((pos - last_pos + 32768) % 65536) - 32768
            level = mem.get("level", KNOB_START_LEVEL)
            new = max(0, min(100, level + delta * KNOB_STEP))
            if new != level:
                mem["level"] = new
                events.append({"type": "knob", "level": new})
    return events


class UnoQHttp:
    name = "unoq_http"
    settle_s = ENABLE_SETTLE_S
    light_gap_s = LIGHT_MIN_GAP_S
    light_retry_s = LIGHT_RETRY_S
    resume_hold_s = RESUME_HOLD_S

    def __init__(self, base_url: str, poll_s: float = 1.0, transport=None):
        base_url = (base_url or "").strip().rstrip("/")
        self.base_url = base_url if "://" in base_url else f"http://{base_url}"
        self.poll_s = poll_s
        self.connected = False
        self.fw = FW
        self._transport = transport
        self._client: httpx.AsyncClient | None = None
        self._on_event: OnEvent | None = None
        self._tasks: list[asyncio.Task] = []
        self._jobs: set[asyncio.Task] = set()
        self._mem = new_mem()
        self._failures = 0
        self._greet = True              # hello and mute are due on the next good poll
        self._muted = False
        self._mute_retry_at = 0.0
        self._last_ok: float | None = None
        self._blanked = True            # nothing was reported yet, so nothing to take back
        self._enabled = True            # pulse_stone switch as last requested
        self._device_off = False        # True while this process holds the sensors off
        self._switching = asyncio.Lock()
        self._hold_until = 0.0
        self._logged: set[str] = set()
        self._light_pending: tuple[int, int, int] | None = None
        self._light_sent: tuple[int, int, int] | None = None
        self._light_wake: asyncio.Event | None = None

    async def start(self, on_event: OnEvent) -> None:
        self._on_event = on_event
        self._client = httpx.AsyncClient(base_url=self.base_url, timeout=2.0, transport=self._transport)
        self._light_wake = asyncio.Event()
        self._tasks = [asyncio.create_task(self._poll_loop()), asyncio.create_task(self._light_loop())]

    async def stop(self) -> None:
        tasks = self._tasks + list(self._jobs)
        self._tasks = []
        for t in tasks:
            t.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        client = self._client
        if client is None:
            return
        try:
            if self.connected:
                await self._post("/led?r=0&g=0&b=0&ms=0")
                if self._device_off:
                    await self._resume_device()     # the hub no longer manages the device
        finally:
            self._client = None
            self.connected = False
            await client.aclose()

    async def send(self, msg: dict) -> None:
        if msg.get("type") != "light":
            return                      # `camera`: the UNO Q has no camera indicator
        level = max(0.0, min(100.0, float(_num(msg.get("level")) or 0)))
        # the device has no fade, so fade_ms is ignored; 0,0,0 hands the LED back to the sketch
        self._light_pending = tuple(int(c * level / 100 + 0.5) for c in hex_rgb(msg.get("rgb")))
        if self._light_wake is not None:
            self._light_wake.set()

    def set_session_active(self, active: bool) -> None:
        # Session start: mute again (the sketch forgets it when it restarts). The presence override
        # is deliberately not sent here: it forces the sensors on and removes the only contact signal.
        if active and self.connected:
            self._spawn(self._mute())

    async def set_enabled(self, on: bool) -> None:
        """The patient's `pulse_stone` switch (I14).

        Off: force the presence loop into manual mode, wait one loop tick so it has settled in
        `active`, then cut the power of both sensors. The loop then leaves them alone, where it
        would otherwise re-power them at the next probe. While off, no pulse or physio is emitted
        (the device keeps reporting `active` in this state, which says nothing about a finger).
        On: power both sensors again, hand control back to the presence loop, and stay quiet
        until the device has had time to notice that nobody is wearing the clip.
        Calls may overlap (a quick off and on): they run one at a time and each applies the
        latest request, so the device always ends in the state asked for last.
        """
        self._enabled = bool(on)
        async with self._switching:
            if not self.connected or self._client is None:
                return                  # applied at the next connect
            if not self._enabled:
                self._device_off = True
                await self._post("/presence?auto=0")
                await asyncio.sleep(self.settle_s)
                await self._post("/sensor?ch=0&on=0")
                await self._post("/sensor?ch=1&on=0")
            elif self._device_off:
                await self._resume_device()
                self._hold_until = time.monotonic() + self.resume_hold_s

    async def _resume_device(self) -> None:
        self._device_off = False
        await self._post("/sensor?ch=0&on=1")
        await self._post("/sensor?ch=1&on=1")
        await self._post("/presence?auto=1")

    async def _poll_loop(self) -> None:
        while True:
            try:
                await self.poll_once()
            except asyncio.CancelledError:
                raise
            except Exception:
                log.exception("UNO Q poll failed")
            await asyncio.sleep(self.poll_s)

    async def poll_once(self) -> None:
        try:
            r = await self._client.get("/state")
            r.raise_for_status()
            state = r.json()
            if not isinstance(state, dict):
                raise ValueError("GET /state did not return a JSON object")
        except asyncio.CancelledError:
            raise
        except Exception as e:
            await self._poll_failed(e)
            return
        now = time.monotonic()
        self._failures = 0
        self._last_ok = now
        self._blanked = False
        if not self.connected:
            self.connected = True
            self._logged.clear()
            self._mem = {**new_mem(), "level": self._mem.get("level", KNOB_START_LEVEL)}
            log.info("UNO Q reachable at %s", self.base_url)
        if self._greet:
            self._greet = False
            await self._emit({"type": "hello", "device": "unoq", "fw": FW})
            await self._mute()
            if not self._enabled:
                await self.set_enabled(False)
            self._light_sent = None     # the device may have restarted and lost its LED colour
            if self._light_pending is not None and self._light_wake is not None:
                self._light_wake.set()
        elif not self._muted and now >= self._mute_retry_at:
            await self._mute()
        quiet = not self._enabled or time.monotonic() < self._hold_until
        events = map_state(state, self._mem, now)
        if quiet:
            self._mem["pulse_sig"] = None
        for e in events:
            if not (quiet and e["type"] in ("pulse", "physio")):
                await self._emit(e)

    async def _poll_failed(self, e: Exception) -> None:
        self._failures += 1
        self._greet = True
        self._log_once("GET /state", e)
        if self.connected and self._failures >= FAILS_TO_DISCONNECT:
            self.connected = False
            log.warning("UNO Q lost at %s", self.base_url)
            await self._emit({"type": "status", "connected": False})
            await self._blank()
        elif self._last_ok is not None and time.monotonic() - self._last_ok > MAX_AGE_S:
            await self._blank()         # slow failures: the last reading is too old to stand

    async def _blank(self) -> None:
        if self._blanked:
            return
        self._blanked = True
        self._mem["pulse_sig"] = None
        if self._enabled:
            await self._emit(null_pulse())
            await self._emit(empty_physio())

    async def _mute(self) -> None:
        # The sketch beeps on every heartbeat by default (A3) until it is told not to.
        self._muted = await self._post("/heartbeat?on=0")
        if not self._muted:
            self._mute_retry_at = time.monotonic() + MUTE_RETRY_S

    async def _light_loop(self) -> None:
        while True:
            await self._light_wake.wait()
            self._light_wake.clear()
            rgb = self._light_pending
            if rgb is None or rgb == self._light_sent or not self.connected:
                continue                # kept pending; sent after the next connect
            r, g, b = rgb
            # ms <= 0 holds the colour until the next call
            ok = await self._post(f"/led?r={r}&g={g}&b={b}&ms=0")
            self._light_sent = rgb if ok else None
            await asyncio.sleep(self.light_gap_s if ok else self.light_retry_s)
            if not ok:
                self._light_wake.set()  # the colour is held until the next call, so a lost one is sent again

    async def _post(self, path: str) -> bool:
        if self._client is None:
            return False
        try:
            r = await self._client.post(path)
            r.raise_for_status()
            return True
        except asyncio.CancelledError:
            raise
        except Exception as e:
            self._log_once(f"POST {path.split('?')[0]}", e)
            return False

    async def _emit(self, msg: dict) -> None:
        if self._on_event is None:
            return
        try:
            await self._on_event(msg)
        except asyncio.CancelledError:
            raise
        except Exception:
            log.exception("bedside event handler failed")

    def _spawn(self, coro) -> None:
        try:
            task = asyncio.get_running_loop().create_task(coro)
        except RuntimeError:
            coro.close()
            return
        self._jobs.add(task)
        task.add_done_callback(self._jobs.discard)

    def _log_once(self, what: str, e: Exception) -> None:
        kind = type(e).__name__
        if isinstance(e, httpx.HTTPStatusError):
            kind = f"HTTP {e.response.status_code}"
        key = f"{what}: {kind}"
        if key not in self._logged:
            self._logged.add(key)
            log.warning("UNO Q %s failed (%s: %s); logged once until it is reachable again", what, kind, e)
