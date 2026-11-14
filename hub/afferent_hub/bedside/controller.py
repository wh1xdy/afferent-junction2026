import asyncio
import datetime as dt
import json
import logging
import time
from pathlib import Path
from typing import Awaitable, Callable

log = logging.getLogger("afferent.bedside")

TOKENS = Path(__file__).resolve().parents[3] / "design" / "tokens.json"

DEFAULT_TOKENS = {
    "knob_feedback": {"rgb": "#F2B544", "hold_ms": 2000},
    "camera_toggle_blink": {"rgb": "#FFD9A0", "level": 30, "pulses": 2, "pulse_ms": 150},
    "day_schedule": [
        {"from_h": 6, "to_h": 9, "rgb": "#FFF3DC", "level": 30, "label": "morning"},
        {"from_h": 9, "to_h": 18, "rgb": "#000000", "level": 0, "label": "day"},
        {"from_h": 18, "to_h": 21, "rgb": "#FFD9A0", "level": 12, "label": "evening"},
        {"from_h": 21, "to_h": 23, "rgb": "#FFC98A", "level": 5, "label": "wind down"},
        {"from_h": 23, "to_h": 6, "rgb": "#000000", "level": 0, "label": "night"},
    ],
}

Send = Callable[[dict], Awaitable[None]]


def now_iso() -> str:
    return dt.datetime.now().astimezone().isoformat(timespec="seconds")


def load_tokens() -> dict:
    try:
        return {**DEFAULT_TOKENS, **json.loads(TOKENS.read_text())["bedside"]}
    except Exception:
        return DEFAULT_TOKENS


def schedule_light(schedule: list[dict], hour: float) -> dict:
    for slot in schedule:
        a, b = slot["from_h"], slot["to_h"]
        if (a <= hour < b) if a < b else (hour >= a or hour < b):
            return slot
    return {"rgb": "#000000", "level": 0, "label": "off"}


class Bedside:
    def __init__(self, source, to_app: Send, to_clinic: Send, to_devices: Send, clock=None):
        self.source = source
        self.to_app = to_app
        self.to_clinic = to_clinic
        self.to_devices = to_devices
        self.clock = clock or (lambda: dt.datetime.now().astimezone())
        self.tokens = load_tokens()
        self.ws_devices = 0
        self.device: str | None = None
        self.fw: str | None = None
        self.session_active = False
        self.asleep_until: dt.datetime | None = None
        self.dawn_level = 15
        self.counters = {"knob_uses": 0, "light_on_s": 0.0, "temps": []}
        self.state = {
            "source": source.name, "connected": False, "simulated": source.name == "simulator",
            "updated_iso": now_iso(),
            "light": {"rgb": "#000000", "level": 0, "fade_ms": 0, "reason": "idle"},
            "knob": {"level": self.dawn_level, "last_press_iso": None},
            "pulse": {"bpm": None, "quality": 0, "contact": False, "source": None},
            "presence": {"in_bed": None, "since_iso": None, "motion_events_tonight": 0},
            "thermo": {"temp_c": None, "humidity_pct": None},
            "camera_on": False,
        }
        self._resting_light = dict(self.state["light"])
        self._overlay: asyncio.Task | None = None
        self._last_push = 0.0
        self._push_pending = False
        self._loop_task: asyncio.Task | None = None
        self._last_light_t = time.monotonic()
        self._app_hold = 0.0

    def snapshot(self) -> dict:
        s = json.loads(json.dumps(self.state))
        s["connected"] = bool(getattr(self.source, "connected", False)) or self.ws_devices > 0
        return s

    async def start(self):
        await self.source.start(self.on_event)
        self.state["connected"] = bool(getattr(self.source, "connected", False))
        self._loop_task = asyncio.create_task(self._idle_loop())
        await self.apply_idle()

    async def stop(self):
        for t in (self._loop_task, self._overlay):
            if t:
                t.cancel()
        await self.source.stop()

    async def reset(self):
        self.session_active = False
        self.asleep_until = None
        self._app_hold = 0.0
        self.dawn_level = 15
        self.counters = {"knob_uses": 0, "light_on_s": 0.0, "temps": []}
        self.state["knob"] = {"level": self.dawn_level, "last_press_iso": None}
        self.state["presence"]["motion_events_tonight"] = 0
        await self.set_camera(False)
        await self.apply_idle()
        await self.push_state()

    async def replace_source(self, source):
        await self.source.stop()
        self.source = source
        self.state["source"] = source.name
        self.state["simulated"] = source.name == "simulator"
        await source.start(self.on_event)

    async def _send_device(self, msg: dict):
        try:
            await self.source.send(msg)
        except Exception as e:
            log.warning("bedside send failed: %s", e)
        await self.to_devices(msg)

    async def push_state(self):
        now = time.monotonic()
        if now - self._last_push >= 0.25:
            self._last_push = now
            await self.to_clinic({"type": "bedside_state", **self.snapshot()})
        elif not self._push_pending:
            self._push_pending = True

            async def later():
                await asyncio.sleep(0.25)
                self._push_pending = False
                self._last_push = time.monotonic()
                await self.to_clinic({"type": "bedside_state", **self.snapshot()})

            asyncio.create_task(later())

    async def on_event(self, msg: dict):
        t = msg.get("type")
        s = self.state
        s["updated_iso"] = now_iso()
        if t == "hello":
            self.device, self.fw = msg.get("device"), msg.get("fw")
            s["connected"] = True
        elif t == "status":
            s["connected"] = bool(msg.get("connected"))
        elif t == "pulse":
            s["pulse"] = {"bpm": msg.get("bpm"), "quality": msg.get("quality", 0), "contact": bool(msg.get("contact")),
                          "source": msg.get("source")}
            out = {"type": "pulse", **s["pulse"]}
            await self.to_app(out)
            await self.to_clinic(out)
        elif t == "knob":
            await self._knob(msg)
        elif t == "presence":
            p = s["presence"]
            in_bed = bool(msg.get("in_bed"))
            if in_bed != p["in_bed"]:
                p["since_iso"] = now_iso()
                if in_bed and self.clock().hour >= 18:
                    p["motion_events_tonight"] = 0
            p["in_bed"] = in_bed
            if msg.get("motion"):
                p["motion_events_tonight"] += 1
            out = {"type": "presence", "in_bed": in_bed, "motion": bool(msg.get("motion")),
                   "motion_events_tonight": p["motion_events_tonight"]}
            await self.to_app(out)
            await self.to_clinic(out)
            if not self.session_active:
                await self.apply_idle()
        elif t == "thermo":
            s["thermo"] = {"temp_c": msg.get("temp_c"), "humidity_pct": msg.get("humidity_pct")}
            if msg.get("temp_c") is not None:
                self.counters["temps"] = (self.counters["temps"] + [msg["temp_c"]])[-1440:]
            await self.to_app({"type": "thermo", **s["thermo"]})
            await self.to_clinic({"type": "thermo", **s["thermo"]})
        elif t == "pose":
            await self.to_clinic(msg)
            return
        else:
            return
        await self.push_state()

    async def _knob(self, msg: dict):
        s = self.state
        if msg.get("press"):
            s["knob"]["last_press_iso"] = now_iso()
            s["camera_on"] = not s["camera_on"]
            self.counters["knob_uses"] += 1
            await self._send_device({"type": "camera", "on": s["camera_on"]})
            await self.to_app({"type": "knob", "press": True})
            await self.to_clinic({"type": "knob", "press": True, "camera_on": s["camera_on"]})
            self._run_overlay(self._blink())
        elif msg.get("level") is not None:
            level = max(0, min(100, int(msg["level"])))
            if level == s["knob"]["level"]:
                return
            s["knob"]["level"] = level
            self.dawn_level = level
            self.counters["knob_uses"] += 1
            await self.to_app({"type": "knob", "level": level})
            await self.to_clinic({"type": "knob", "level": level})
            self._run_overlay(self._knob_feedback(level))

    def _run_overlay(self, coro):
        if self._overlay and not self._overlay.done():
            self._overlay.cancel()
        self._overlay = asyncio.create_task(coro)

    async def _flash(self, rgb, level, fade_ms, reason):
        light = {"rgb": rgb, "level": level, "fade_ms": fade_ms, "reason": reason}
        self.state["light"] = light
        await self._send_device({"type": "light", **light})
        await self.push_state()

    async def _restore(self):
        light = dict(self._resting_light)
        self.state["light"] = light
        await self._send_device({"type": "light", **{**light, "fade_ms": 600}})
        await self.push_state()

    async def _knob_feedback(self, level):
        fb = self.tokens["knob_feedback"]
        await self._flash(fb["rgb"], level, 150, "knob")
        await asyncio.sleep(fb.get("hold_ms", 2000) / 1000)
        await self._restore()

    async def _blink(self):
        b = self.tokens["camera_toggle_blink"]
        for _ in range(b.get("pulses", 2)):
            await self._flash(b["rgb"], b.get("level", 30), 0, "camera")
            await asyncio.sleep(b.get("pulse_ms", 150) / 1000)
            await self._flash("#000000", 0, 0, "camera")
            await asyncio.sleep(b.get("pulse_ms", 150) / 1000)
        await self._restore()

    async def set_light(self, rgb: str, level: int, fade_ms: int = 2000, reason: str = "manual", hold_s: float = 0):
        if hold_s:
            self._app_hold = time.monotonic() + hold_s
        light = {"rgb": rgb, "level": max(0, min(100, int(level))), "fade_ms": max(0, min(60000, int(fade_ms))),
                 "reason": reason}
        self._account_light()
        self._resting_light = light
        if self._overlay and not self._overlay.done():
            return light
        self.state["light"] = dict(light)
        self.state["updated_iso"] = now_iso()
        await self._send_device({"type": "light", **light})
        await self.push_state()
        return light

    def _account_light(self):
        now = time.monotonic()
        if (self.state["light"].get("level") or 0) > 0:
            self.counters["light_on_s"] += now - self._last_light_t
        self._last_light_t = now

    async def set_camera(self, on: bool):
        if self.state["camera_on"] != on:
            self.state["camera_on"] = on
            await self._send_device({"type": "camera", "on": on})
            await self.push_state()

    def set_session_active(self, active: bool):
        self.session_active = active
        if active:
            self.asleep_until = None
        if hasattr(self.source, "set_session_active"):
            self.source.set_session_active(active)

    async def session_ended(self, status: str):
        self.set_session_active(False)
        if status == "fell_asleep":
            now = self.clock()
            morning = now.replace(hour=6, minute=0, second=0, microsecond=0)
            if now >= morning:
                morning += dt.timedelta(days=1)
            self.asleep_until = morning
            self._app_hold = 0.0
            await self.set_light("#000000", 0, 8000, "asleep")

    async def apply_idle(self):
        if self.session_active or time.monotonic() < self._app_hold:
            return
        now = self.clock()
        if self.asleep_until and now < self.asleep_until:
            target = {"rgb": "#000000", "level": 0, "reason": "asleep"}
        elif self.state["presence"]["in_bed"]:
            slot = schedule_light(self.tokens["day_schedule"], now.hour + now.minute / 60)
            target = {"rgb": slot["rgb"], "level": slot["level"], "reason": "idle"}
        else:
            target = {"rgb": "#000000", "level": 0, "reason": "idle"}
        cur = self._resting_light
        if cur.get("rgb") != target["rgb"] or cur.get("level") != target["level"] or cur.get("reason") != target["reason"]:
            await self.set_light(target["rgb"], target["level"], 4000, target["reason"])

    async def _idle_loop(self):
        while True:
            await asyncio.sleep(30)
            try:
                self._account_light()
                await self.apply_idle()
            except asyncio.CancelledError:
                raise
            except Exception:
                log.exception("idle light update failed")
