"""Bluetooth LE Heart Rate Service for the finger sensor.

Advertises as "Afferent Finger" with the standard Heart Rate Service (0x180D), so the
iPhone app (and any app/watch that understands heart-rate straps) can read the finger
pulse live:
  0x2A37 Heart Rate Measurement  notify/read  [flags=0x00 (uint8 BPM, no contact bits), bpm]
  0x2A38 Body Sensor Location    read         0x03 = finger
The standard service carries the fused reading of both sensors. Each sensor is on a custom service:
  AFF0 / AFF1  notify/read  [bpm finger 1, bpm finger 2, breaths/min]  (0 = no reading)
  breaths/min comes from the heart-rate rhythm (respiratory sinus arrhythmia)
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


class HeartRateBroadcaster:
    def __init__(self):
        self.status = "starting"
        self._loop = asyncio.new_event_loop()
        self._server = None
        self._bpm = [0, 0]
        self._breath = 0
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
                                            bytearray([0, 0, 0]), GATTAttributePermissions.readable)
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

    def _notify(self, hrm=None):
        if self._server is None:
            return
        both = bytearray(self._bpm + [self._breath])

        def _push():
            try:
                if hrm is not None:
                    self._server.get_characteristic(HRM).value = bytearray([0x00, hrm])
                    self._server.update_value(HRS, HRM)
                self._server.get_characteristic(AFF_BOTH).value = both
                self._server.update_value(AFF_SVC, AFF_BOTH)
            except Exception as e:
                log.warning("BLE update failed: %s", e)
        self._loop.call_soon_threadsafe(_push)
