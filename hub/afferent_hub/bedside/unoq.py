import asyncio
import logging
import threading
import time

from .protocol import format_line, parse_line
from .source import OnEvent

log = logging.getLogger("afferent.bedside")


class UnoQSerial:
    name = "unoq"

    def __init__(self, port: str, baud: int = 115200, reconnect_s: float = 2.0):
        self.port = port
        self.baud = baud
        self.reconnect_s = reconnect_s
        self.connected = False
        self._serial = None
        self._write_lock = threading.Lock()
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None
        self._loop: asyncio.AbstractEventLoop | None = None
        self._on_event: OnEvent | None = None

    async def start(self, on_event: OnEvent) -> None:
        self._on_event = on_event
        self._loop = asyncio.get_running_loop()
        self._stop.clear()
        self._thread = threading.Thread(target=self._reader, name="unoq-serial", daemon=True)
        self._thread.start()

    async def stop(self) -> None:
        self._stop.set()
        self._close()
        if self._thread:
            await asyncio.to_thread(self._thread.join, 3)

    async def send(self, msg: dict) -> None:
        line = format_line(msg)
        if line:
            await asyncio.to_thread(self._write, line)

    def _write(self, line: str) -> None:
        with self._write_lock:
            if self._serial is None:
                return
            try:
                self._serial.write((line + "\n").encode("ascii"))
            except Exception as e:
                log.warning("serial write failed: %s", e)
                self._close()

    def _close(self) -> None:
        s, self._serial = self._serial, None
        self.connected = False
        if s is not None:
            try:
                s.close()
            except Exception:
                pass

    def _dispatch(self, msg: dict) -> None:
        if self._loop and self._on_event:
            asyncio.run_coroutine_threadsafe(self._on_event(msg), self._loop)

    def _reader(self) -> None:
        import serial

        while not self._stop.is_set():
            try:
                self._serial = serial.Serial(self.port, self.baud, timeout=1)
                self.connected = True
                log.info("UNO Q connected on %s", self.port)
                self._dispatch({"type": "status", "connected": True})
                self._write("S")
                buf = b""
                while not self._stop.is_set():
                    chunk = self._serial.read(256)
                    if not chunk:
                        continue
                    buf += chunk
                    while b"\n" in buf:
                        raw, buf = buf.split(b"\n", 1)
                        msg = parse_line(raw.decode("ascii", "replace"))
                        if msg:
                            self._dispatch(msg)
            except Exception as e:
                if self.connected:
                    log.warning("UNO Q lost on %s: %s", self.port, e)
                    self._dispatch({"type": "status", "connected": False})
                self._close()
            if not self._stop.is_set():
                time.sleep(self.reconnect_s)
