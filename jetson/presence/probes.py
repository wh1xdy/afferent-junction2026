"""I/O side: Wi-Fi (ARP) and BLE probes, plus a simulator for demos and tests.

Wi-Fi probe
  The patient's phone is identified by its Wi-Fi MAC (set the phone's
  "private address" for the home network to *Fixed* / per-network, not rotating).
  Each scan:
    1. send one tiny UDP datagram to every address on the local /24 (or the
       phone's last known IP first). The kernel has to ARP for each target, so
       sleeping phones that ignore ping still answer at L2.
    2. read `ip neigh`: only REACHABLE entries count — STALE / DELAY / PROBE are
       what the cache *remembers* or is still checking, not what is there now.
    3. health = the default gateway answered too. If even the router does not
       answer we report None ("could not look"), never False ("not home").
  Needs host networking (wendy.json network mode "host"), no root / raw sockets.

BLE probe
  Continuous passive scan through BlueZ (bleak). Adverts feed the GuestTracker;
  a patient-owned BLE device with a fixed address (watch, band, key tag) can be
  listed in PATIENT_BLE_ADDRS as a second presence token for when the phone dies.
"""
from __future__ import annotations

import asyncio
import ipaddress
import logging
import re
import socket
import subprocess
import threading
import time

from core import Advert, classify

log = logging.getLogger("probes")

# Only a confirmed answer counts. DELAY / PROBE mean "the kernel is still asking":
# counting them kept a phone "home" for up to a minute after its Wi-Fi went off.
LIVE_STATES = {"REACHABLE", "PERMANENT"}
_NEIGH_RE = re.compile(r"^(?P<ip>\d+\.\d+\.\d+\.\d+)\s+dev\s+(?P<dev>\S+)"
                       r"(?:\s+lladdr\s+(?P<mac>[0-9a-fA-F:]{17}))?.*?\s(?P<state>[A-Z]+)\s*$")


def norm_mac(mac: str) -> str:
    return mac.strip().lower().replace("-", ":")


def parse_neigh(text: str) -> list[dict]:
    out = []
    for line in text.splitlines():
        m = _NEIGH_RE.match(line.strip())
        if m:
            out.append({"ip": m["ip"], "dev": m["dev"],
                        "mac": norm_mac(m["mac"]) if m["mac"] else None, "state": m["state"]})
    return out


def parse_default_route(text: str) -> tuple[str, str] | None:
    """/proc/net/route -> (interface, gateway ip)."""
    for line in text.splitlines()[1:]:
        f = line.split()
        if len(f) >= 3 and f[1] == "00000000":
            gw = socket.inet_ntoa(int(f[2], 16).to_bytes(4, "little"))
            return f[0], gw
    return None


def _iface_ipv4(iface: str) -> str | None:
    try:
        out = subprocess.check_output(["ip", "-4", "-o", "addr", "show", "dev", iface],
                                      text=True, timeout=2)
        m = re.search(r"inet (\d+\.\d+\.\d+\.\d+/\d+)", out)
        return m.group(1) if m else None
    except Exception:
        return None


class WifiProbe:
    def __init__(self, phone_macs: list[str], settle_s: float = 3.0):
        self.macs = {norm_mac(m) for m in phone_macs if m.strip()}
        self.settle_s = settle_s
        self.last_ip: str | None = None
        self.last_error: str | None = None

    def _neigh(self) -> list[dict]:
        return parse_neigh(subprocess.check_output(["ip", "-4", "neigh", "show"], text=True, timeout=3))

    @staticmethod
    def _poke(ips):
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.setblocking(False)
            for ip in ips:
                try:
                    s.sendto(b"\0", (str(ip), 9))  # discard port; the ARP is what we want
                except OSError:
                    pass

    def scan(self) -> bool | None:
        if not self.macs:
            return None
        try:
            with open("/proc/net/route") as f:
                route = parse_default_route(f.read())
            if not route:
                self.last_error = "no default route (Wi-Fi down?)"
                return None
            iface, gw = route
            cidr = _iface_ipv4(iface)
            net = ipaddress.ip_network(cidr, strict=False) if cidr else None
            if net is not None and net.prefixlen < 24:  # keep sweeps small on big networks
                net = ipaddress.ip_network(f"{cidr.split('/')[0]}/24", strict=False)
            targets = [gw] + ([self.last_ip] if self.last_ip else [])
            hosts = list(net.hosts()) if net is not None else []
            for _ in range(2):  # two rounds: phones in power-save miss single ARPs
                self._poke(targets)
                self._poke(hosts)
                time.sleep(self.settle_s / 2)
            neigh = self._neigh()
        except Exception as e:
            self.last_error = f"wifi probe: {e}"
            log.warning(self.last_error)
            return None

        gw_ok = any(n["ip"] == gw and n["state"] in LIVE_STATES for n in neigh)
        hit = next((n for n in neigh if n["mac"] in self.macs and n["state"] in LIVE_STATES), None)
        if hit:
            self.last_ip = hit["ip"]
            self.last_error = None
            return True
        if not gw_ok:
            self.last_error = f"gateway {gw} not reachable — cannot tell"
            return None
        self.last_error = None
        return False


class BleProbe:
    """Background BlueZ scanner. drain() returns adverts since the last call."""

    def __init__(self, patient_addrs: list[str]):
        self.patient = {norm_mac(a) for a in patient_addrs if a.strip()}
        self._buf: list[Advert] = []
        self._lock = threading.Lock()
        self.ok = False
        self.last_error: str | None = None
        self._last_patient: float | None = None

    def start(self):
        threading.Thread(target=self._run, daemon=True).start()

    def _run(self):
        while True:
            try:
                asyncio.run(self._scan_forever())
            except Exception as e:
                self.ok = False
                self.last_error = f"ble: {e}"
                log.warning("BLE scanner stopped: %s — retrying in 10 s", e)
                time.sleep(10)

    async def _scan_forever(self):
        from bleak import BleakScanner

        def cb(device, adv):
            company, kind = classify(adv.manufacturer_data, adv.service_uuids)
            ad = Advert(addr=device.address, rssi=adv.rssi, ts=time.time(), name=adv.local_name,
                        company=company, kind=kind)
            with self._lock:
                self._buf.append(ad)
                if len(self._buf) > 20000:
                    del self._buf[:10000]

        async with BleakScanner(detection_callback=cb):
            self.ok, self.last_error = True, None
            log.info("BLE scan running")
            while True:
                await asyncio.sleep(5)

    def drain(self) -> list[Advert]:
        with self._lock:
            buf, self._buf = self._buf, []
        for ad in buf:
            if norm_mac(ad.addr) in self.patient:
                self._last_patient = ad.ts
        return buf

    def patient_seen(self, window_s: float) -> bool | None:
        if not self.patient:
            return None
        if not self.ok:
            return None
        return self._last_patient is not None and time.time() - self._last_patient <= window_s


class SimWorld:
    """Stand-in for the radio world, driven over HTTP (POST /sim) or by tests."""

    def __init__(self):
        self.phone_wifi: bool | None = True
        self.patient_ble: bool | None = None
        self.guests = 0
        self.neighbours = 0
        self.gadgets = 0
        self._rot = 0

    def adverts(self, now: float) -> list[Advert]:
        self._rot += 1
        rot = self._rot // 30  # addresses change every ~30 ticks, like MAC rotation
        ads = [Advert(f"02:00:00:00:{i:02x}:{rot % 256:02x}", -50, now, company=76, kind="phone")
               for i in range(self.guests)]
        ads += [Advert(f"02:00:00:01:{i:02x}:{rot % 256:02x}", -88, now, company=117, kind="phone")
                for i in range(self.neighbours)]
        ads += [Advert(f"02:00:00:02:{i:02x}:00", -50, now, company=301, kind="other")
                for i in range(self.gadgets)]   # earbuds/laptops next to the Jetson
        return ads
