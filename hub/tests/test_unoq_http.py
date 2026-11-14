"""UNO Q over HTTP (hub BedsideSource), the physio relay and the pulse_stone gate.

Everything runs against httpx.MockTransport or in-process ASGI: no socket is connected and no
serial port is opened. Nothing here was run against the real UNO Q.
"""
import asyncio
import copy
import json
import socket
import time

import httpx
import pytest
from fastapi.testclient import TestClient

from afferent_hub import views
from afferent_hub.bedside.controller import PHYSIO_KEYS, Bedside
from afferent_hub.bedside.unoq_http import KNOB_STEP, UnoQHttp, empty_physio, map_state, new_mem
from afferent_hub.main import create_app
from afferent_hub.service import make_source
from afferent_hub.settings import Settings

# Real GET /state captured 2026-11-14 with nobody wearing the clip. Verbatim.
IDLE = json.loads("""
{"knob": null, "climate": {"celsius": 24.59, "humidity": 28.0, "t": 1794653090.20}, "beat": {"bpm_live": null, "t": 1794653091.86, "fused": true}, "fingers": [{"bpm_live": null, "locked": false, "ibi_ms": 541, "peak_slope": 2181, "locked_count": 0, "t": 1794653089.54}, {"bpm_live": null, "locked": false, "ibi_ms": 1195, "peak_slope": 145, "locked_count": 0, "t": 1794653090.11}], "modulinos": {"knob": true, "thermo": true, "buzzer": true, "t": 1794653091.17}, "bridge": "connected", "finger": {"bpm": null, "period_ms": 320, "quality": 0.55, "sources": [], "fingers": [null, null]}, "breathing": {"per_minute": null, "snr": null, "channel": null}, "hrv": {"rmssd_ms": null, "sdnn_ms": null, "mean_bpm": null, "pairs": 0, "channel": null, "baseline_rmssd_ms": 46.1, "vs_baseline": null}, "presence": {"auto": true, "mode": "idle", "since": 1794653091.32, "last_probe_range": 111}, "ble": "advertising"}
""")
T0 = IDLE["beat"]["t"]
MEASUREMENTS = ("pulse_bpm", "breathing_per_min", "breathing_snr_db", "rmssd_ms", "sdnn_ms", "rmssd_vs_baseline")
SHARED_PHYSIO_SHAPE = {"type", "source", "transport", "simulated", "pulse_bpm", "quality", "quality_reported",
                       "contact", "finger_bpm", "finger_sources", "breathing_per_min", "breathing_snr_db",
                       "rmssd_ms", "sdnn_ms", "rmssd_baseline_ms", "rmssd_vs_baseline", "presence", "age_s"}


def synthetic_active(**finger):
    """SYNTHETIC: no /state was captured with a finger on the clip. This is IDLE edited by hand
    into what app.py produces while measuring; the numbers are made up for the test."""
    s = copy.deepcopy(IDLE)
    s["presence"] = {"auto": True, "mode": "active", "since": T0 - 90, "last_probe_range": 2400}
    s["finger"] = {"bpm": 72, "period_ms": 833, "quality": 0.62, "sources": [0, 1], "fingers": [72, 73], **finger}
    s["fingers"][0].update(bpm_live=72, locked=True, ibi_ms=833, locked_count=60, t=T0 - 0.4)
    s["fingers"][1].update(bpm_live=73, locked=True, ibi_ms=822, locked_count=58, t=T0 - 0.7)
    s["beat"]["bpm_live"] = s["finger"]["bpm"]
    s["breathing"] = {"per_minute": 6, "snr": 4.2, "channel": 0}
    s["hrv"] = {"rmssd_ms": 51.3, "sdnn_ms": 47.9, "mean_bpm": 72, "pairs": 55, "channel": "both",
                "baseline_rmssd_ms": 46.1, "vs_baseline": 0.11}
    return s


def by_type(events, t):
    return [e for e in events if e["type"] == t]


def one(events, t):
    found = by_type(events, t)
    assert len(found) == 1, f"expected one {t}, got {[e['type'] for e in events]}"
    return found[0]


@pytest.fixture(autouse=True)
def no_network(monkeypatch):
    def refuse(self, *a, **k):
        raise AssertionError("a test tried to open a network connection")

    monkeypatch.setattr(socket.socket, "connect", refuse)
    monkeypatch.setattr(socket.socket, "connect_ex", refuse)


# ── map_state ────────────────────────────────────────────────────────────────────────


def test_idle_sample_reports_nothing_measured():
    mem = {}
    events = map_state(copy.deepcopy(IDLE), mem, 0.0)
    assert [e["type"] for e in events] == ["pulse", "physio", "thermo"]
    assert one(events, "pulse") == {"type": "pulse", "bpm": None, "quality": 0.55, "contact": False,
                                    "source": "finger_ppg"}
    p = one(events, "physio")
    assert set(p) == SHARED_PHYSIO_SHAPE
    assert p["presence"] == "idle" and p["contact"] is False
    assert p["quality"] == 0.55 and p["quality_reported"] is True
    assert all(p[k] is None for k in MEASUREMENTS)
    assert p["finger_bpm"] == [None, None] and p["finger_sources"] == []
    assert p["rmssd_baseline_ms"] == 46.1
    assert (p["source"], p["transport"], p["simulated"]) == ("finger_ppg", "hub_http", False)
    assert p["age_s"] == pytest.approx(1.75)
    assert one(events, "thermo") == {"type": "thermo", "temp_c": 24.59, "humidity_pct": 28.0}

    again = map_state(copy.deepcopy(IDLE), mem, 1.0)
    assert [e["type"] for e in again] == ["physio"]


def test_active_gives_labelled_pulse_and_full_physio():
    events = map_state(synthetic_active(), new_mem(), 0.0)
    assert one(events, "pulse") == {"type": "pulse", "bpm": 72, "quality": 0.62, "contact": True,
                                    "source": "finger_ppg"}
    p = one(events, "physio")
    assert p == {"type": "physio", "source": "finger_ppg", "transport": "hub_http", "simulated": False,
                 "pulse_bpm": 72, "quality": 0.62, "quality_reported": True, "contact": True,
                 "finger_bpm": [72, 73], "finger_sources": [0, 1],
                 "breathing_per_min": 6, "breathing_snr_db": 4.2,
                 "rmssd_ms": 51.3, "sdnn_ms": 47.9, "rmssd_baseline_ms": 46.1, "rmssd_vs_baseline": 0.11,
                 "presence": "active", "age_s": 0.4}
    assert set(p) == {"type", *PHYSIO_KEYS} == SHARED_PHYSIO_SHAPE == set(empty_physio())


def test_pulse_on_every_poll_while_valid_and_one_null_when_it_stops():
    mem = new_mem()
    for i in range(3):
        assert one(map_state(synthetic_active(), mem, float(i)), "pulse")["bpm"] == 72
    gone = map_state(copy.deepcopy(IDLE), mem, 3.0)
    assert one(gone, "pulse")["bpm"] is None and one(gone, "pulse")["contact"] is False
    assert by_type(map_state(copy.deepcopy(IDLE), mem, 4.0), "pulse") == []
    assert by_type(map_state(copy.deepcopy(IDLE), mem, 5.0), "pulse") == []


def test_a_wearing_from_probe_to_removal():
    """SYNTHETIC sequence following app.py's presence loop: idle, probe, warm-up, measuring, weak, idle."""
    mem = new_mem()
    stale_hrv = {"rmssd_ms": 38.0, "sdnn_ms": 35.0, "mean_bpm": 80, "pairs": 30, "channel": 0,
                 "baseline_rmssd_ms": 46.1, "vs_baseline": -0.18}      # left over from an earlier wearer

    def step(state, i):
        events = map_state(state, mem, float(i))
        return by_type(events, "pulse"), one(events, "physio")

    idle = copy.deepcopy(IDLE)
    idle["hrv"] = dict(stale_hrv)
    pulse, physio = step(idle, 0)
    assert [(p["bpm"], p["contact"]) for p in pulse] == [(None, False)] and physio["rmssd_ms"] is None

    probing = copy.deepcopy(idle)
    probing["presence"].update(mode="probing", since=T0 - 1)
    pulse, physio = step(probing, 1)
    assert pulse == [] and physio["presence"] == "probing" and physio["contact"] is False

    warm = copy.deepcopy(idle)                      # finger found: beats forgotten, nothing measured yet
    warm["presence"].update(mode="active", since=T0 - 2)
    warm["fingers"] = [None, None]
    warm["finger"].update(bpm=None, quality=0.41)
    pulse, physio = step(warm, 2)
    assert [(p["bpm"], p["contact"]) for p in pulse] == [(None, True)]
    assert physio["contact"] is True and all(physio[k] is None for k in MEASUREMENTS) and physio["age_s"] is None

    pulse, physio = step(synthetic_active(), 3)
    assert [(p["bpm"], p["contact"]) for p in pulse] == [(72, True)] and physio["rmssd_ms"] == 51.3

    pulse, physio = step(synthetic_active(quality=0.2), 4)
    assert [(p["bpm"], p["contact"]) for p in pulse] == [(None, True)] and physio["pulse_bpm"] is None
    assert step(synthetic_active(quality=0.2), 5)[0] == []

    pulse, physio = step(idle, 6)
    assert [(p["bpm"], p["contact"]) for p in pulse] == [(None, False)]
    assert physio["presence"] == "idle" and all(physio[k] is None for k in MEASUREMENTS)


def test_low_or_missing_quality_never_gives_a_pulse():
    low = map_state(synthetic_active(quality=0.2), new_mem(), 0.0)
    assert one(low, "pulse")["bpm"] is None and one(low, "pulse")["contact"] is True
    assert one(low, "physio")["quality"] == 0.2 and one(low, "physio")["pulse_bpm"] is None
    edge = map_state(synthetic_active(quality=0.3), new_mem(), 0.0)
    assert one(edge, "pulse")["bpm"] == 72
    unknown = map_state(synthetic_active(quality=None), new_mem(), 0.0)
    assert one(unknown, "pulse")["bpm"] is None and one(unknown, "pulse")["quality"] == 0
    assert one(unknown, "physio")["quality"] is None and one(unknown, "physio")["pulse_bpm"] is None


def test_probing_with_a_bpm_is_not_a_pulse():
    s = synthetic_active()
    s["presence"].update(mode="probing", since=T0 - 1)
    events = map_state(s, new_mem(), 0.0)
    assert one(events, "pulse")["bpm"] is None and one(events, "pulse")["contact"] is False
    p = one(events, "physio")
    assert p["presence"] == "probing" and all(p[k] is None for k in MEASUREMENTS)
    assert p["finger_bpm"] == [None, None] and p["finger_sources"] == []


def test_stale_breathing_and_hrv_left_in_state_come_out_none():
    # the device keeps its last breathing and HRV numbers while idle
    s = copy.deepcopy(IDLE)
    s["breathing"] = {"per_minute": 14, "snr": 3.1, "channel": 1}
    s["hrv"].update(rmssd_ms=42.0, sdnn_ms=39.5, mean_bpm=70, pairs=40, channel=0, vs_baseline=-0.09)
    p = one(map_state(s, new_mem(), 0.0), "physio")
    assert all(p[k] is None for k in MEASUREMENTS) and p["rmssd_baseline_ms"] == 46.1

    # ... and during the warm-up after a finger is detected (update_hrv has not run yet)
    warm = synthetic_active()
    warm["presence"]["since"] = T0 - 2
    p = one(map_state(warm, new_mem(), 0.0), "physio")
    assert p["presence"] == "active" and p["pulse_bpm"] == 72
    assert all(p[k] is None for k in MEASUREMENTS if k != "pulse_bpm")

    warm["presence"]["since"] = T0 - 6
    assert one(map_state(warm, new_mem(), 0.0), "physio")["rmssd_ms"] == 51.3
    del warm["presence"]["since"]
    assert one(map_state(warm, new_mem(), 0.0), "physio")["rmssd_ms"] is None


def test_beats_older_than_three_seconds_do_not_count():
    s = synthetic_active()
    s["fingers"][0]["t"] = s["fingers"][1]["t"] = T0 - 4
    events = map_state(s, new_mem(), 0.0)
    assert one(events, "pulse")["bpm"] is None
    p = one(events, "physio")
    assert p["pulse_bpm"] is None and p["age_s"] == 4.0 and p["finger_bpm"] == [None, None]

    # only the contributing channel decides; a stale second finger is dropped on its own
    s = synthetic_active(sources=[0], fingers=[72, 80])
    s["fingers"][1]["t"] = T0 - 4.5
    p = one(map_state(s, new_mem(), 0.0), "physio")
    assert p["pulse_bpm"] == 72 and p["finger_bpm"] == [72, None] and p["age_s"] == 0.4

    # a device `now` (firmware track) wins over beat.t; the hub clock is never used
    s = synthetic_active()
    s["now"] = T0 + 3.5
    events = map_state(s, new_mem(), 10_000_000.0)
    assert one(events, "pulse")["bpm"] is None and one(events, "physio")["age_s"] == 3.9


def test_knob_is_relative_clamped_and_never_a_press():
    def turn(mem, position, pressed=False):
        s = copy.deepcopy(IDLE)
        s["knob"] = {"position": position, "pressed": pressed, "t": T0}
        return by_type(map_state(s, mem, 0.0), "knob")

    mem = new_mem()
    assert by_type(map_state(copy.deepcopy(IDLE), mem, 0.0), "knob") == []      # knob is null after boot
    assert turn(mem, 10) == []                                                  # first observation
    assert turn(mem, 13) == [{"type": "knob", "level": 15 + 3 * KNOB_STEP}] == [{"type": "knob", "level": 21}]
    assert turn(mem, 13) == []
    assert turn(mem, 13, pressed=True) == []                                    # I15: no press
    assert turn(mem, 12, pressed=True) == [{"type": "knob", "level": 19}]
    assert turn(mem, -200) == [{"type": "knob", "level": 0}]
    assert turn(mem, -300) == []                                                # stays at 0
    assert turn(mem, 500) == [{"type": "knob", "level": 100}]
    assert turn(mem, 600) == []                                                 # stays at 100

    mem = new_mem()
    assert turn(mem, 32767) == []
    assert turn(mem, -32768) == [{"type": "knob", "level": 15 + KNOB_STEP}]      # int16 wrap is +1
    assert turn(mem, 32767) == [{"type": "knob", "level": 15}]                   # and back is -1


def test_thermo_at_connect_then_once_a_minute_and_null_when_gone():
    mem = new_mem()
    assert len(by_type(map_state(copy.deepcopy(IDLE), mem, 100.0), "thermo")) == 1
    assert by_type(map_state(copy.deepcopy(IDLE), mem, 159.0), "thermo") == []
    assert len(by_type(map_state(copy.deepcopy(IDLE), mem, 160.0), "thermo")) == 1
    s = copy.deepcopy(IDLE)
    s["climate"]["t"] = T0 - 45                         # the sketch sends climate every 2 s
    assert by_type(map_state(s, mem, 161.0), "thermo") == [{"type": "thermo", "temp_c": None, "humidity_pct": None}]
    assert by_type(map_state(s, mem, 162.0), "thermo") == []
    s["climate"] = None
    assert by_type(map_state(s, new_mem(), 0.0), "thermo") == []


def test_never_emits_bed_presence_or_unknown_types():
    seen = set()
    for state in (IDLE, synthetic_active(), {}, {"presence": "x", "finger": [], "fingers": None, "knob": 3}):
        mem = new_mem()
        for i in range(3):
            seen |= {e["type"] for e in map_state(copy.deepcopy(state), mem, float(i))}
    assert seen <= {"pulse", "physio", "thermo", "knob"}
    empty = one(map_state({}, new_mem(), 0.0), "physio")
    assert empty == {**empty_physio(), "presence": None}


# ── UnoQHttp against a fake device ───────────────────────────────────────────────────


class FakeUnoQ:
    """Stands in for the UNO Q HTTP API behind httpx.MockTransport."""

    def __init__(self, state=None):
        self.state = copy.deepcopy(IDLE if state is None else state)
        self.calls: list[tuple[str, str]] = []
        self.down = False
        self.post_status = 200

    def handler(self, request: httpx.Request) -> httpx.Response:
        query = request.url.query.decode()
        target = request.url.path + (f"?{query}" if query else "")
        self.calls.append((request.method, target))
        if self.down:
            raise httpx.ConnectError("connection refused", request=request)
        if request.method == "GET" and request.url.path == "/state":
            return httpx.Response(200, json=self.state)
        if request.method == "POST":
            return httpx.Response(self.post_status, json={"ok": True})
        return httpx.Response(404, json={"error": "not found"})

    @property
    def posts(self) -> list[str]:
        return [target for method, target in self.calls if method == "POST"]

    def led(self) -> list[str]:
        return [p for p in self.posts if p.startswith("/led?")]


async def until(cond, timeout=3.0):
    end = time.monotonic() + timeout
    while not cond():
        assert time.monotonic() < end, "condition not reached in time"
        await asyncio.sleep(0.005)


async def connect(fake: FakeUnoQ, poll_s=0.01):
    events: list[dict] = []

    async def on_event(msg):
        events.append(msg)

    dev = UnoQHttp("http://unoq.test", poll_s=poll_s, transport=httpx.MockTransport(fake.handler))
    dev.settle_s = 0.01
    await dev.start(on_event)
    await until(lambda: dev.connected and by_type(events, "physio"))
    return dev, events


def test_connect_says_hello_mutes_the_beep_and_never_forces_presence():
    async def run():
        fake = FakeUnoQ()
        dev, events = await connect(fake)
        await asyncio.sleep(0.08)
        first = list(fake.posts)
        dev.set_session_active(True)
        await until(lambda: len(fake.posts) > len(first))
        dev.set_session_active(False)
        await asyncio.sleep(0.05)
        await dev.stop()
        return fake, events, first

    fake, events, first = asyncio.run(run())
    assert events[0] == {"type": "hello", "device": "unoq", "fw": "modulino-hub/http"}
    assert first == ["/heartbeat?on=0"]                                # once, not on every poll
    assert fake.posts[:2] == ["/heartbeat?on=0", "/heartbeat?on=0"]     # again at session start
    assert not any("presence" in p or "sensor" in p for p in fake.posts)
    assert len(by_type(events, "hello")) == 1
    assert len(by_type(events, "pulse")) == 1 and by_type(events, "pulse")[0]["bpm"] is None
    assert len(by_type(events, "thermo")) == 1
    assert len(by_type(events, "physio")) >= 3 and not by_type(events, "presence")
    assert fake.posts[-1] == "/led?r=0&g=0&b=0&ms=0"                    # stop() hands the LED back


def test_mute_is_retried_until_the_device_accepts_it():
    async def run():
        fake = FakeUnoQ()
        fake.post_status = 503                         # bridge not up yet
        dev, _ = await connect(fake)
        assert dev._muted is False
        fake.post_status = 200
        dev._mute_retry_at = 0.0
        await until(lambda: dev._muted)
        await dev.stop()
        return fake

    fake = asyncio.run(run())
    assert fake.posts.count("/heartbeat?on=0") == 2


def test_light_scales_holds_and_coalesces():
    async def run():
        fake = FakeUnoQ()
        dev, _ = await connect(fake)
        await dev.send({"type": "light", "rgb": "#FFC98A", "level": 50, "fade_ms": 4000, "reason": "mode"})
        await until(lambda: len(fake.led()) == 1)
        await dev.send({"type": "camera", "on": True})
        await dev.send({"type": "light", "rgb": "#FFC98A", "level": 50, "fade_ms": 0})      # same value
        await dev.send({"type": "light", "rgb": "#FFC98A", "level": 0, "fade_ms": 600})
        await until(lambda: len(fake.led()) == 2)
        await dev.send({"type": "light", "rgb": "#000000", "level": 80})                    # still 0,0,0
        await asyncio.sleep(0.4)
        scaled = fake.led()

        t0 = time.monotonic()
        for level in (10, 20, 30, 40, 50):                 # controller bursts: 5 sends in a moment
            await dev.send({"type": "light", "rgb": "#FFFFFF", "level": level})
            await asyncio.sleep(0.02)
        assert time.monotonic() - t0 < 0.2
        await asyncio.sleep(0.6)
        burst = fake.led()[len(scaled):]
        posts = list(fake.posts)
        await dev.stop()
        return scaled, burst, posts

    scaled, burst, posts = asyncio.run(run())
    assert scaled == ["/led?r=128&g=101&b=69&ms=0", "/led?r=0&g=0&b=0&ms=0"]
    assert 1 <= len(burst) <= 2 and burst[-1] == "/led?r=128&g=128&b=128&ms=0"
    assert not any(p.startswith("/camera") for p in posts)


def test_light_sent_before_the_link_is_up_goes_out_at_connect():
    async def run():
        fake = FakeUnoQ()
        fake.down = True
        dev = UnoQHttp("http://unoq.test", poll_s=0.01, transport=httpx.MockTransport(fake.handler))
        await dev.start(lambda msg: asyncio.sleep(0))
        await dev.send({"type": "light", "rgb": "#FFD9A0", "level": 100})
        await asyncio.sleep(0.05)
        assert fake.led() == [] and not dev.connected
        fake.down = False
        await until(lambda: fake.led())
        await dev.stop()
        return fake

    assert asyncio.run(run()).led()[0] == "/led?r=255&g=217&b=160&ms=0"


def test_three_failures_take_the_readings_back_and_reconnect_greets_again():
    async def run():
        fake = FakeUnoQ(synthetic_active())
        dev, events = await connect(fake)
        await until(lambda: len(by_type(events, "pulse")) >= 2)
        assert by_type(events, "pulse")[-1]["bpm"] == 72
        events.clear()
        fake.down = True
        await until(lambda: by_type(events, "status"))
        await asyncio.sleep(0.08)
        lost, connected = list(events), dev.connected
        events.clear()
        fake.down = False
        await until(lambda: by_type(events, "physio"))
        back = list(events)
        await dev.stop()
        return fake, lost, connected, back

    fake, lost, connected, back = asyncio.run(run())
    assert connected is False
    tail = [e for e in lost if e["type"] in ("status", "pulse", "physio")][-3:]
    assert tail == [{"type": "status", "connected": False},
                    {"type": "pulse", "bpm": None, "quality": 0, "contact": False, "source": "finger_ppg"},
                    empty_physio()]
    assert len(by_type(lost, "status")) == 1                 # not once per failed poll
    assert all(tail[2][k] is None for k in MEASUREMENTS) and tail[2]["presence"] is None
    assert back[0]["type"] == "hello" and one(back[:4], "pulse")["bpm"] == 72
    assert fake.posts.count("/heartbeat?on=0") == 2


def test_slow_failures_blank_a_reading_older_than_three_seconds():
    async def run():
        fake = FakeUnoQ(synthetic_active())
        dev, events = await connect(fake, poll_s=30)
        events.clear()
        fake.down = True
        dev._last_ok = time.monotonic() - 3.5           # one request hung for longer than a reading may live
        await dev.poll_once()
        still_connected = dev.connected
        await dev.poll_once()
        await dev.stop()
        return events, still_connected

    events, still_connected = asyncio.run(run())
    assert still_connected is True
    assert [e["type"] for e in events] == ["pulse", "physio"]
    assert events[0]["bpm"] is None and events[1] == empty_physio()


def test_set_enabled_off_really_switches_the_sensors_off_and_stops_the_events():
    async def run():
        fake = FakeUnoQ(synthetic_active())
        dev, events = await connect(fake)
        before = len(fake.posts)
        await dev.set_enabled(False)
        off = fake.posts[before:]
        events.clear()
        await asyncio.sleep(0.1)
        while_off = list(events)

        dev.resume_hold_s = 0.05
        before = len(fake.posts)
        await dev.set_enabled(True)
        on = fake.posts[before:]
        await until(lambda: by_type(events, "pulse"))
        after = list(events)
        before = len(fake.posts)
        await dev.set_enabled(True)                     # already on: nothing to tell the device
        again = fake.posts[before:]
        await dev.stop()
        return fake, off, while_off, on, after, again

    fake, off, while_off, on, after, again = asyncio.run(run())
    assert off == ["/presence?auto=0", "/sensor?ch=0&on=0", "/sensor?ch=1&on=0"]
    assert not [e for e in while_off if e["type"] in ("pulse", "physio")]
    assert on == ["/sensor?ch=0&on=1", "/sensor?ch=1&on=1", "/presence?auto=1"]
    assert by_type(after, "pulse")[0]["bpm"] == 72 and by_type(after, "physio")
    assert again == []
    assert "/presence?auto=1" not in fake.posts[fake.posts.index("/presence?auto=1") + 1:]


def test_switching_back_on_reports_contact_again_even_without_a_valid_pulse():
    async def run():
        fake = FakeUnoQ(synthetic_active(quality=0.2))          # finger on, signal too weak to count
        dev, events = await connect(fake)
        assert by_type(events, "pulse") == [{"type": "pulse", "bpm": None, "quality": 0.2, "contact": True,
                                             "source": "finger_ppg"}]
        dev.resume_hold_s = 0.05
        await dev.set_enabled(False)
        await asyncio.sleep(0.05)
        events.clear()                                          # the controller has cleared its state here
        await dev.set_enabled(True)
        await until(lambda: by_type(events, "physio"))
        await asyncio.sleep(0.05)
        await dev.stop()
        return events

    events = asyncio.run(run())
    assert by_type(events, "pulse") == [{"type": "pulse", "bpm": None, "quality": 0.2, "contact": True,
                                         "source": "finger_ppg"}]


def test_overlapping_switches_end_in_the_state_asked_for_last():
    async def run():
        fake = FakeUnoQ(synthetic_active())
        dev, events = await connect(fake)
        dev.settle_s, dev.resume_hold_s = 0.05, 0.02
        before = len(fake.posts)
        await asyncio.gather(dev.set_enabled(False), dev.set_enabled(True))      # off, on again at once
        events.clear()
        await until(lambda: by_type(events, "pulse"))
        posts = fake.posts[before:]
        await dev.stop()
        return posts, dev

    posts, dev = asyncio.run(run())
    assert posts[-3:] == ["/sensor?ch=0&on=1", "/sensor?ch=1&on=1", "/presence?auto=1"]
    assert dev._enabled is True and dev._device_off is False


def test_switch_set_before_the_link_is_up_is_applied_at_connect_and_undone_at_stop():
    async def run():
        fake = FakeUnoQ(synthetic_active())
        events = []

        async def on_event(msg):
            events.append(msg)

        dev = UnoQHttp("http://unoq.test", poll_s=0.01, transport=httpx.MockTransport(fake.handler))
        dev.settle_s = 0.01
        await dev.set_enabled(False)                    # hub start with pulse_stone already off
        assert fake.calls == []
        await dev.start(on_event)
        await until(lambda: "/sensor?ch=1&on=0" in fake.posts)
        await asyncio.sleep(0.05)
        running = list(fake.posts)
        await dev.stop()
        return fake, events, running

    fake, events, running = asyncio.run(run())
    assert running == ["/heartbeat?on=0", "/presence?auto=0", "/sensor?ch=0&on=0", "/sensor?ch=1&on=0"]
    assert not [e for e in events if e["type"] in ("pulse", "physio")]
    assert by_type(events, "hello") and by_type(events, "thermo")
    assert fake.posts[len(running):] == ["/led?r=0&g=0&b=0&ms=0", "/sensor?ch=0&on=1", "/sensor?ch=1&on=1",
                                         "/presence?auto=1"]


# ── hub wiring: make_source, controller relay, pulse_stone gate, views ──────────────


class Sink:
    def __init__(self):
        self.app, self.clinic, self.devices = [], [], []

    async def to_app(self, msg):
        self.app.append(msg)

    async def to_clinic(self, msg):
        self.clinic.append(msg)

    async def to_devices(self, msg):
        self.devices.append(msg)

    def bedside(self, source, **kw):
        return Bedside(source, self.to_app, self.to_devices, **kw)


def test_make_source_and_true_labels():
    src = make_source(Settings(bedside="unoq:http://127.0.0.1:18081"))
    assert isinstance(src, UnoQHttp) and src.name == "unoq_http" and src.connected is False
    assert src.base_url == "http://127.0.0.1:18081"
    assert UnoQHttp("127.0.0.1:18081/").base_url == "http://127.0.0.1:18081"
    state = Sink().bedside(src).state
    assert state["source"] == "unoq_http" and state["simulated"] is False and state["physio"] is None


def test_controller_relays_physio_to_the_app_only():
    async def run():
        sink = Sink()
        b = sink.bedside(make_source(Settings(bedside="off")))
        events = map_state(synthetic_active(), new_mem(), 0.0)
        for e in events:
            await b.on_event({**e, "raw_ppg": [1, 2, 3]} if e["type"] == "physio" else e)
        await asyncio.sleep(0.3)
        return sink, b.snapshot(), one(events, "physio")

    sink, snap, physio = asyncio.run(run())
    assert one(sink.app, "physio") == physio                                     # extra keys are dropped
    assert sink.clinic == []                                # nothing live goes to the clinic
    assert snap["physio"] == {k: v for k, v in physio.items() if k != "type"}
    assert one(sink.app, "pulse") == {"type": "pulse", "bpm": 72, "quality": 0.62, "contact": True,
                                      "source": "finger_ppg"}
    assert snap["pulse"]["source"] == "finger_ppg" and snap["simulated"] is False
    assert snap["physio"]["rmssd_ms"] == 51.3


def test_simulator_can_never_relay_physio_as_measured():
    async def run():
        sink = Sink()
        b = sink.bedside(make_source(Settings(bedside="sim")))
        await b.on_event(one(map_state(synthetic_active(), new_mem(), 0.0), "physio"))
        return sink, b.state

    sink, state = asyncio.run(run())
    assert state["simulated"] is True and one(sink.app, "physio")["simulated"] is True


def test_pulse_stone_off_drops_pulse_and_physio():
    async def run():
        sink, allowed = Sink(), [True]
        b = sink.bedside(make_source(Settings(bedside="off")), pulse_allowed=lambda: allowed[0])
        events = map_state(synthetic_active(), new_mem(), 0.0)
        for e in events:
            await b.on_event(e)
        assert b.state["pulse"]["bpm"] == 72 and b.state["physio"] is not None
        await asyncio.sleep(0.3)
        sink.app.clear(), sink.clinic.clear()
        allowed[0] = False
        for e in events:
            await b.on_event(e)
        await asyncio.sleep(0.3)
        return sink, b.snapshot()

    sink, snap = asyncio.run(run())
    assert snap["pulse"] == {"bpm": None, "quality": 0, "contact": False, "source": None}
    assert snap["physio"] is None
    assert not [m for m in sink.app + sink.clinic if m["type"] in ("pulse", "physio")]
    assert snap["thermo"]["temp_c"] == 24.59                            # only the pulse sensor is gated


def test_adapter_and_controller_end_to_end():
    async def run():
        fake, sink = FakeUnoQ(synthetic_active()), Sink()
        dev = UnoQHttp("http://unoq.test", poll_s=0.01, transport=httpx.MockTransport(fake.handler))
        b = sink.bedside(dev)
        await b.start()
        await until(lambda: by_type(sink.app, "physio") and by_type(sink.app, "pulse"))
        fake.state["knob"] = {"position": 4, "pressed": False, "t": T0}
        await asyncio.sleep(0.05)
        fake.state["knob"] = {"position": 9, "pressed": True, "t": T0}
        await until(lambda: by_type(sink.app, "knob") and fake.led())
        snap = b.snapshot()
        knob_uses = b.counters["knob_uses"]
        await b.stop()
        return fake, sink, snap, knob_uses

    fake, sink, snap, knob_uses = asyncio.run(run())
    assert snap["connected"] is True and snap["source"] == "unoq_http" and snap["simulated"] is False
    assert snap["pulse"] == {"bpm": 72, "quality": 0.62, "contact": True, "source": "finger_ppg"}
    assert snap["physio"]["breathing_per_min"] == 6 and snap["thermo"]["temp_c"] == 24.59
    assert snap["presence"]["in_bed"] is None and snap["camera_on"] is False
    assert by_type(sink.app, "knob") == [{"type": "knob", "level": 25}] and knob_uses == 1
    assert fake.led()[0] == "/led?r=61&g=45&b=17&ms=0"           # knob feedback #F2B544 at level 25
    assert not any("camera" in p for p in fake.posts)


def test_compact_session_carries_vitals_and_source():
    vitals = {"finger": {"source": "finger_ppg", "pulse_bpm_median": 71}}
    s = {"session_id": "s1", "day_index": 3, "status": "completed", "simulated": False, "vitals": vitals,
         "signal": {"pulse_source": "finger_ppg"}, "simulated_fields": []}
    c = views.compact_session(s)
    assert c["vitals"] == vitals and c["pulse_source"] == "finger_ppg" and c["simulated_fields"] == []
    bare = views.compact_session({"session_id": "s2"})
    assert bare["vitals"] is None and bare["pulse_source"] is None and bare["simulated_fields"] is None


def test_pulse_stone_wording_is_plain_and_not_diagnostic():
    row = next(s for s in views.privacy_view(views.DEFAULT_PRIVACY)["sensors"] if s["id"] == "pulse_stone")
    assert row["label"] == "Pulse stone"
    assert row["shares"] == "Pulse, breathing rate and beat-to-beat variation as numbers from the finger sensor."
    for word in ("hrv", "stress", "diagnos", "—"):
        assert word not in row["shares"].lower()


@pytest.fixture()
def client(tmp_path):
    app = create_app(Settings(db=str(tmp_path / "t.db"), bedside="ws", validation=False))
    with TestClient(app) as c:
        yield c


def recv_until(ws, mtype, limit=200):
    seen = []
    for _ in range(limit):
        msg = ws.receive_json()
        seen.append(msg.get("type"))
        if msg.get("type") == mtype:
            return msg
    raise AssertionError(f"{mtype} not received, got {seen}")


def wait_for(cond, timeout=3.0):
    end = time.monotonic() + timeout
    while not cond():
        assert time.monotonic() < end, "condition not reached in time"
        time.sleep(0.01)


def test_physio_from_a_device_reaches_the_app_and_never_the_clinic(client):
    physio = one(map_state(synthetic_active(), new_mem(), 0.0), "physio")
    with client.websocket_connect("/ws/clinic") as clinic, \
            client.websocket_connect("/ws/bedside") as bedside, \
            client.websocket_connect("/ws/app?patient=anna") as app:
        assert clinic.receive_json()["type"] == "hello"
        bedside.send_json({"type": "hello", "device": "unoq", "fw": "test"})
        bedside.send_json(physio)
        assert recv_until(app, "physio") == physio
        state = client.get("/api/bedside/state").json()
        assert state["physio"]["rmssd_ms"] == 51.3 and state["physio"]["source"] == "finger_ppg"

        class Switch:
            name, connected, calls = "fake", True, []

            async def set_enabled(self, on):
                self.calls.append(on)

            async def send(self, msg):
                return None

            async def stop(self):
                return None

        hub = client.app.state.hub
        hub.bedside.source = Switch()
        r = client.post("/api/patients/anna/privacy", json={"sensor": "pulse_stone", "on": False})
        assert r.status_code == 200 and r.json()["sensors"]["pulse_stone"] is False
        wait_for(lambda: Switch.calls == [False])
        state = client.get("/api/bedside/state").json()
        assert state["physio"] is None and state["pulse"]["bpm"] is None

        bedside.send_json(physio)
        bedside.send_json({"type": "pulse", "bpm": 72, "quality": 0.62, "contact": True, "source": "finger_ppg"})
        bedside.send_json({"type": "thermo", "temp_c": 20.5, "humidity_pct": 33})
        wait_for(lambda: client.get("/api/bedside/state").json()["thermo"]["temp_c"] == 20.5)
        assert client.get("/api/bedside/state").json()["physio"] is None

        r = client.post("/api/patients/anna/privacy", json={"sensor": "pulse_stone", "on": True})
        assert r.json()["sensors"]["pulse_stone"] is True
        wait_for(lambda: Switch.calls == [False, True])
        bedside.send_json(physio)
        seen = []
        while not seen or seen[-1]["type"] != "physio":
            seen.append(app.receive_json())
        assert seen[-1]["pulse_bpm"] == 72
        # while the switch was off the app got neither of the two readings sent then
        assert not [m for m in seen[:-1] if m["type"] in ("physio", "pulse")], [m["type"] for m in seen]

        # the clinic socket saw both privacy changes and nothing from the sensors in between
        seen, switches = [], 0
        while switches < 2:
            msg = clinic.receive_json()
            seen.append(msg["type"])
            switches += msg["type"] == "privacy"
        assert not {"physio", "pulse", "thermo", "bedside_state"} & set(seen), seen


def test_other_patients_switch_does_not_touch_the_bound_device(client):
    class Switch:
        name, connected, calls = "fake", True, []

        async def set_enabled(self, on):
            self.calls.append(on)

        async def send(self, msg):
            return None

        async def stop(self):
            return None

    hub = client.app.state.hub
    hub.bedside.source = Switch()
    r = client.post("/api/patients/mikko/privacy", json={"sensor": "pulse_stone", "on": False})
    assert r.status_code == 200
    time.sleep(0.1)
    assert Switch.calls == []
    with client.websocket_connect("/ws/bedside") as bedside:
        bedside.send_json({"type": "pulse", "bpm": 70, "quality": 0.8, "contact": True, "source": "finger_ppg"})
        wait_for(lambda: client.get("/api/bedside/state").json()["pulse"]["bpm"] == 70)
