import asyncio
import logging
import datetime as dt
import math
import random

from .protocol import format_line, hex_rgb, parse_line
from .source import OnEvent

FW = "afferent-sim-0.1"
log = logging.getLogger("afferent.bedside")


def _in_bed_hours(hour: float) -> bool:
    return hour >= 22.5 or hour < 7.5


class BedsideSimulator:
    name = "simulator"

    def __init__(self, seed: int = 0, speed: float = 1.0, pulse: bool = False, clock=None):
        self.rng = random.Random(seed)
        self.speed = max(0.01, speed)
        self.pulse = pulse
        self.clock = clock or (lambda: dt.datetime.now().astimezone())
        self.connected = False
        self._on_event: OnEvent | None = None
        self._task: asyncio.Task | None = None
        self.session_active = False
        self.in_bed: bool | None = None
        self.motion_until = 0
        self.knob = self.rng.choice([10, 15, 20])
        self.light = {"rgb": "#000000", "level": 0, "fade_ms": 0}
        self.temp = 20.6 + self.rng.uniform(-0.5, 0.5)
        self.humidity = 32 + self.rng.uniform(-3, 3)
        self.hr_base = 64 + self.rng.uniform(-2, 4)
        self.hr_drift = 0.0
        self.hr_light = 0.0
        self.contact = False
        self.morning_reading_day = None
        self._morning_left = 0
        self.tick = 0
        self.lines_out: list[str] = []

    async def start(self, on_event: OnEvent) -> None:
        self._on_event = on_event
        self.connected = True
        await self._line(f"V {FW}")
        await self._presence(force=True)
        await self._thermo()
        await self._line(f"K turn {self.knob}")
        self._task = asyncio.create_task(self._run())

    async def stop(self) -> None:
        self.connected = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except (asyncio.CancelledError, Exception):
                pass
            self._task = None

    async def send(self, msg: dict) -> None:
        line = format_line(msg)
        if line:
            self.lines_out = (self.lines_out + [line])[-50:]
        if msg.get("type") == "light":
            self.light = {k: msg.get(k) for k in ("rgb", "level", "fade_ms")}
            r, g, b = hex_rgb(msg.get("rgb"))
            warmth = (r - b) / 255.0
            level = (msg.get("level") or 0) / 100.0
            self.hr_light = -1.5 * warmth * min(1.0, level * 4) + 2.0 * max(0.0, -warmth) * level

    def set_session_active(self, active: bool) -> None:
        self.session_active = active

    async def _line(self, line: str) -> None:
        msg = parse_line(line)
        if msg is None or self._on_event is None:
            return
        if msg["type"] == "hello":
            msg["device"] = "simulator"
        if msg["type"] == "pulse":
            msg["source"] = "simulated"
        msg["simulated"] = True
        await self._on_event(msg)

    def _hour(self) -> float:
        now = self.clock()
        return now.hour + now.minute / 60

    def _want_in_bed(self) -> bool:
        return self.session_active or _in_bed_hours(self._hour())

    async def _presence(self, force: bool = False) -> None:
        in_bed = self._want_in_bed()
        motion = self.tick < self.motion_until
        if force or in_bed != self.in_bed:
            self.in_bed = in_bed
            await self._line(f"I {int(in_bed)} {int(motion)}")

    async def _thermo(self) -> None:
        night = _in_bed_hours(self._hour())
        target = 19.8 if night else 21.2
        self.temp += (target - self.temp) * 0.05 + self.rng.gauss(0, 0.05)
        self.temp = max(19.0, min(22.0, self.temp))
        self.humidity = max(25.0, min(45.0, self.humidity + self.rng.gauss(0, 0.3)))
        await self._line(f"T {self.temp:.1f} {self.humidity:.0f}")

    def _bpm(self) -> float:
        self.hr_drift += self.rng.gauss(0, 0.25) - 0.05 * self.hr_drift
        resp = 1.6 * math.sin(2 * math.pi * self.tick / 5.2)
        return self.hr_base + self.hr_drift + self.hr_light + resp + self.rng.gauss(0, 0.4)

    def _wants_contact(self) -> bool:
        if not self.pulse:
            return False
        if self.session_active:
            return True
        now = self.clock()
        if now.hour == 7 and now.minute == 0 and self.morning_reading_day != now.date():
            self.morning_reading_day = now.date()
            self._morning_left = 30
        if self._morning_left > 0:
            self._morning_left -= 1
            return True
        return False

    async def _pulse(self) -> None:
        contact = self._wants_contact()
        if contact:
            q = self.rng.uniform(0.85, 0.95)
            await self._line(f"P {self._bpm():.1f} {q:.2f} 1")
        elif self.contact:
            await self._line("P 0 0 0")
        self.contact = contact

    async def step(self) -> None:
        self.tick += 1
        if self.in_bed and not self.session_active and self.tick >= self.motion_until:
            if self.rng.random() < 1 / 600:
                self.motion_until = self.tick + 10
                await self._line("I 1 1")
            elif self.motion_until == self.tick:
                await self._line("I 1 0")
        if self.tick % 30 == 0:
            await self._presence(force=True)
        else:
            await self._presence()
        if self.tick % 60 == 0:
            await self._thermo()
        if self.rng.random() < 1 / 3600:
            self.knob = max(0, min(100, self.knob + self.rng.choice([-10, -5, 5, 10])))
            await self._line(f"K turn {self.knob}")
        await self._pulse()

    async def _run(self) -> None:
        while True:
            await asyncio.sleep(1 / self.speed)
            try:
                await self.step()
            except asyncio.CancelledError:
                raise
            except Exception:
                log.exception("simulator step failed")
