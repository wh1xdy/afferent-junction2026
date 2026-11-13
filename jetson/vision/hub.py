"""Länken till modulino-hub på UNO Q, över Wendy Net.

- Hittar tjänsten via mDNS (_http._tcp, TXT role=modulino-hub).
- Läser /state några gånger per sekund:
    knob-position -> YOLO-konfidens, knob-tryck -> armerad på/av (bekräftas med pip).
- När armerad och en person dyker upp i bild: POST /buzz.
"""
import json
import logging
import threading
import time
import urllib.request

from zeroconf import IPVersion, ServiceBrowser, Zeroconf

from network import interface_ipv4

logger = logging.getLogger("hub")

SERVICE_TYPE = "_http._tcp.local."
ROLE = b"modulino-hub"
TRIGGER_CLASS = "person"
COOLDOWN_S = 3.0
POLL_S = 0.25


class Hub:
    def __init__(self, set_confidence):
        self._set_confidence = set_confidence
        self._lock = threading.Lock()
        self._url: str | None = None
        self._state: dict | None = None
        self._armed = True
        self._last_pressed = False
        self._last_knob: int | None = None
        self._person_present = False
        self._last_buzz = 0.0
        self._error: str | None = None
        self._zc: Zeroconf | None = None

    # ── discovery ──────────────────────────────────────────────────────
    def start(self):
        threading.Thread(target=self._discover, daemon=True).start()
        threading.Thread(target=self._poll, daemon=True).start()

    def _discover(self):
        try:
            address = interface_ipv4()
            self._zc = Zeroconf(interfaces=[address], ip_version=IPVersion.V4Only)
            ServiceBrowser(self._zc, SERVICE_TYPE, handlers=[self._on_service])
            logger.info("browsing %s from %s", SERVICE_TYPE, address)
        except Exception as e:
            self._error = f"mDNS: {e}"
            logger.error("mDNS browse failed: %s", e)

    def _on_service(self, zeroconf, service_type, name, state_change):
        threading.Thread(target=self._resolve, args=(service_type, name), daemon=True).start()

    def _resolve(self, service_type, name):
        info = self._zc.get_service_info(service_type, name, timeout=3000)
        if not info or info.properties.get(b"role") != ROLE:
            return
        addrs = info.parsed_addresses(IPVersion.V4Only)
        if not addrs:
            return
        url = f"http://{addrs[0]}:{info.port}"
        with self._lock:
            changed = url != self._url
            self._url = url
        if changed:
            logger.info("modulino-hub found at %s (%s)", url, name)

    # ── HTTP ───────────────────────────────────────────────────────────
    def _request(self, path, method="GET", timeout=2.0):
        with self._lock:
            url = self._url
        if not url:
            raise RuntimeError("modulino-hub not discovered yet")
        req = urllib.request.Request(url + path, method=method)
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.loads(r.read().decode())

    def buzz(self, freq: int, ms: int):
        try:
            return self._request(f"/buzz?freq={int(freq)}&ms={int(ms)}", method="POST", timeout=3.0)
        except Exception as e:
            logger.warning("buzz failed: %s", e)
            return {"ok": False, "error": str(e)}

    def _poll(self):
        while True:
            time.sleep(POLL_S)
            try:
                st = self._request("/state")
            except Exception as e:
                with self._lock:
                    self._error = str(e)
                continue
            with self._lock:
                self._state = st
                self._error = None
            knob = st.get("knob") or {}
            if "position" in knob:
                pos = int(knob["position"])
                if pos != self._last_knob:
                    self._last_knob = pos
                    # 0 -> 0.40, varje klick ±0.01
                    self._set_confidence(0.40 + pos * 0.01)
                pressed = bool(knob.get("pressed"))
                if pressed and not self._last_pressed:
                    self._armed = not self._armed
                    logger.info("armed=%s (knob press)", self._armed)
                    self.buzz(1500, 60) if self._armed else self.buzz(400, 120)
                self._last_pressed = pressed

    # ── detections from the YOLO loop ──────────────────────────────────
    def on_detections(self, meta: dict):
        present = meta.get("classes", {}).get(TRIGGER_CLASS, 0) > 0
        entered = present and not self._person_present
        self._person_present = present
        now = time.monotonic()
        if entered and self._armed and now - self._last_buzz > COOLDOWN_S:
            self._last_buzz = now
            logger.info("%s detected -> buzz", TRIGGER_CLASS)
            threading.Thread(target=self.buzz, args=(988, 150), daemon=True).start()

    def status(self) -> dict:
        with self._lock:
            return {
                "hub_url": self._url,
                "armed": self._armed,
                "person_present": self._person_present,
                "trigger": TRIGGER_CLASS,
                "state": self._state,
                "error": self._error,
            }
