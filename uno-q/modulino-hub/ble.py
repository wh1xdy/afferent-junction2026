"""Bluetooth LE Heart Rate Service for the finger sensor.

Advertises as "Afferent Finger" with the standard Heart Rate Service (0x180D), so the
iPhone app (and any app/watch that understands heart-rate straps) can read the finger
pulse live:
  0x2A37 Heart Rate Measurement  notify/read  [flags=0x00 (uint8 BPM, no contact bits), bpm]
  0x2A38 Body Sensor Location    read         0x03 = finger
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


class HeartRateBroadcaster:
    def __init__(self):
        self.status = "starting"
        self._loop = asyncio.new_event_loop()
        self._server = None
        self._bpm = 0
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
        await server.start()
        self._server = server
        self.status = "advertising"
        print(f"BLE: advertising '{NAME}' with Heart Rate Service", flush=True)

    def _read(self, characteristic, **kwargs):
        return characteristic.value

    def update(self, bpm: int):
        """Thread-safe: push a new BPM to subscribers (called on every locked beat)."""
        bpm = max(0, min(255, int(bpm)))
        self._bpm = bpm
        if self._server is None:
            return

        def _push():
            try:
                ch = self._server.get_characteristic(HRM)
                ch.value = bytearray([0x00, bpm])
                self._server.update_value(HRS, HRM)
            except Exception as e:
                log.warning("BLE update failed: %s", e)
        self._loop.call_soon_threadsafe(_push)
