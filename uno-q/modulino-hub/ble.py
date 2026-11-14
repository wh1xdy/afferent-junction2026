"""Bluetooth LE Heart Rate Service for the finger sensor.

Advertises as "Afferent Finger" with the standard Heart Rate Service (0x180D), so the
iPhone app (and any app/watch that understands heart-rate straps) can read the finger
pulse live:
  0x2A37 Heart Rate Measurement  notify/read  [flags=0x00 (uint8 BPM, no contact bits), bpm]
  0x2A38 Body Sensor Location    read         0x03 = finger
The standard service carries the fused reading of both sensors. Each sensor is on a custom service:
  AFF0 / AFF1  notify/read  v2, 6 bytes:
      [bpm finger 1, bpm finger 2, breaths/min, RMSSD ms, quality %, presence code]
      bytes 0..3: 0 = no reading (unchanged from the 4-byte v1, so old clients keep working)
      byte 4:     fused rhythm quality * 100 (0..100), 255 = not available
      byte 5:     1 idle, 2 probing, 3 active, 0 unknown
  breaths/min comes from the heart-rate rhythm (respiratory sinus arrhythmia)
  AFF1 is notified at least every 2 s (keepalive), also while idle, so a client can tell
  "link alive, no finger" from "link lost". 2A37 is notified only while there is a fused pulse.
Runs its own asyncio loop in a thread; if Bluetooth isn't available the hub keeps working.
"""
import asyncio
import logging
import threading

log = logging.getLogger("ble")

HRS = "0000180d-0000-1000-8000-00805f9b34fb"
HRM = "00002a37-0000-1000-8000-00805f9b34fb"
LOCATION = "00002a38-0000-1000-8000-00805f9b34fb"
NAME = "Afferent Finger"
AFF_SVC = "0000aff0-0000-1000-8000-00805f9b34fb"
AFF_BOTH = "0000aff1-0000-1000-8000-00805f9b34fb"

PRESENCE_CODE = {'idle': 1, 'probing': 2, 'active': 3}      # AFF1 byte 5; 0 = unknown
QUALITY_NA = 255                                            # AFF1 byte 4 when there is no quality


def _u8(v):
    """reading -> one byte, 0 = no reading"""
    try:
        return max(0, min(255, int(round(float(v)))))
    except (TypeError, ValueError):
        return 0


def pack_aff1(bpm, breath, rmssd, quality, mode) -> bytearray:
    """AFF1 v2 payload. bpm = [finger 1, finger 2]; quality 0..1 or None; mode = presence mode."""
    fingers = list(bpm or [])[:2] + [0, 0]
    try:
        q = QUALITY_NA if quality is None else max(0, min(100, int(round(float(quality) * 100))))
    except (TypeError, ValueError):
        q = QUALITY_NA
    return bytearray([_u8(fingers[0]), _u8(fingers[1]), _u8(breath), _u8(rmssd),
                      q, PRESENCE_CODE.get(mode, 0)])


class HeartRateBroadcaster:
    def __init__(self, start=True):
        self.status = "starting" if start else "not started"
        self._loop = asyncio.new_event_loop() if start else None
        self._server = None
        self._bpm = [0, 0]
        self._breath = 0
        self._rmssd = 0
        self._quality = None          # fused rhythm quality 0..1, None = not available
        self._mode = None             # presence mode: idle / probing / active
        self._sent = None             # last AFF1 payload handed to _push
        if start:                     # start=False: offline tests (no thread, no Bluetooth)
            threading.Thread(target=self._run, daemon=True).start()

    def _run(self):
        asyncio.set_event_loop(self._loop)
        try:
            self._loop.run_until_complete(self._start())
            self._loop.run_forever()
        except Exception as e:
            self.status = f"error: {e}"
            print(f"BLE heart-rate service unavailable: {e}", flush=True)

    async def _start(self):
        from bless import (BlessServer, GATTAttributePermissions,
                           GATTCharacteristicProperties as P)
        server = BlessServer(name=NAME, loop=self._loop)
        server.read_request_func = self._read
        await server.add_new_service(HRS)
        await server.add_new_characteristic(HRS, HRM, P.notify | P.read,
                                            bytearray([0, 0]), GATTAttributePermissions.readable)
        await server.add_new_characteristic(HRS, LOCATION, P.read,
                                            bytearray([3]), GATTAttributePermissions.readable)
        await server.add_new_service(AFF_SVC)
        await server.add_new_characteristic(AFF_SVC, AFF_BOTH, P.notify | P.read,
                                            bytearray([0, 0, 0, 0, 255, 0]),
                                            GATTAttributePermissions.readable)
        # bless (BlueZ backend) marks only the first service primary; secondary services are not
        # returned by a normal service discovery, so iOS/macOS never saw AFF0 (verified with a
        # macOS probe: only Device Information + Heart Rate). BlueZ reads the flag at registration.
        for svc in getattr(getattr(server, "app", None), "services", []):
            if hasattr(svc, "_primary"):
                svc._primary = True
        await server.start()
        self._server = server
        self.status = "advertising"
        print(f"BLE: advertising '{NAME}' with Heart Rate Service", flush=True)

    def _read(self, characteristic, **kwargs):
        return characteristic.value

    def update(self, finger: int, bpm: int):
        """Fused reading -> standard Heart Rate Measurement (finger arg kept for compatibility)."""
        self._notify(hrm=max(0, min(255, int(bpm))))

    def update_finger(self, finger: int, bpm: int):
        """Per-sensor reading -> custom [finger 1, finger 2] characteristic."""
        self._bpm[finger] = max(0, min(255, int(bpm)))
        self._notify()

    def update_breathing(self, per_minute: int):
        v = max(0, min(255, int(per_minute)))
        if v != self._breath:
            self._breath = v
            self._notify()

    def update_hrv(self, rmssd_ms):
        v = max(0, min(255, int(round(rmssd_ms))))
        if v != self._rmssd:
            self._rmssd = v
            self._notify()

    def update_status(self, quality, mode, keepalive=False):
        """Fused quality (0..1 or None) and presence mode -> AFF1 bytes 4..5.
        Notifies when the packed payload changed, or always with keepalive=True (the hub sets it
        every other second, so a client sees a notification at least every 2 s, also while idle)."""
        self._quality, self._mode = quality, mode
        if keepalive or bytes(self._payload()) != self._sent:
            self._notify()

    def clear_readings(self):
        """Finger gone: zero finger 1, finger 2, breathing and RMSSD (quality and presence stay
        as they are) and notify. Before this, AFF1 kept the last per-finger numbers after the
        finger left."""
        self._bpm = [0, 0]
        self._breath = 0
        self._rmssd = 0
        self._notify(hrm_reset=True)

    def _payload(self) -> bytearray:
        return pack_aff1(self._bpm, self._breath, self._rmssd, self._quality, self._mode)

    def _notify(self, hrm=None, hrm_reset=False):
        both = self._payload()
        self._sent = bytes(both)
        self._push(both, hrm, hrm_reset)

    def _push(self, both, hrm=None, hrm_reset=False):
        """Hand the values to the BLE thread. hrm = fused BPM to notify on 2A37.
        hrm_reset: set the stored 2A37 value to "no reading" WITHOUT a notification, so a client
        that reads the characteristic after the finger left gets 0 and not the last pulse."""
        if self._server is None:
            return

        def _do():
            try:
                if hrm is not None:
                    self._server.get_characteristic(HRM).value = bytearray([0x00, hrm])
                    self._server.update_value(HRS, HRM)
                elif hrm_reset:
                    self._server.get_characteristic(HRM).value = bytearray([0x00, 0])
                self._server.get_characteristic(AFF_BOTH).value = both
                self._server.update_value(AFF_SVC, AFF_BOTH)
            except Exception as e:
                log.warning("BLE update failed: %s", e)
        self._loop.call_soon_threadsafe(_do)
