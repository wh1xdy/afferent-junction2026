"""Pure presence / guest logic. No I/O, the clock is passed in — fully unit-testable.

PresenceTracker  fuses "is the patient's phone (or wearable) here?" signals into
                 HOME / AWAY / UNKNOWN, with outings and isolation metrics.
GuestTracker     turns a stream of BLE advertisements into "guest visits",
                 robust to MAC randomisation, neighbours and passers-by.

Edge cases handled (see README "Edge cases"):
  * phone Wi-Fi power-save / doze      -> AWAY only after a sustained absence
  * longer sleep at night              -> separate, longer night threshold
  * dead battery / phone switched off  -> in-home activity (knob, check-in) holds HOME
  * router / Wi-Fi / Bluetooth down    -> absence is not counted, state becomes UNKNOWN
  * device reboot / app restart        -> long tick gaps are not counted as absence
  * flapping at the edge of coverage   -> hysteresis (one sighting = home, long absence = away)
  * outing start detected late         -> outing is back-dated to the last sighting
  * BLE MAC rotation (~15 min)         -> guests counted as concurrent devices in a short window
  * neighbours / devices behind walls  -> RSSI floor + learned baseline of "unknown" devices
  * delivery driver / passer-by        -> a visit needs a minimum dwell time
  * household devices (TV, speaker)    -> learned during calibration and ignored
  * guests while patient is out        -> not counted as social contact
"""
from __future__ import annotations

import time
from collections import deque
from dataclasses import asdict, dataclass
from typing import Callable, Iterable

HOME, AWAY, UNKNOWN = "home", "away", "unknown"
DAY = 86400.0


def _local_hour(ts: float) -> int:
    return time.localtime(ts).tm_hour


def _local_midnight(ts: float) -> float:
    lt = time.localtime(ts)
    return ts - (lt.tm_hour * 3600 + lt.tm_min * 60 + lt.tm_sec)


# ─────────────────────────────────────────────────────────────────────────────
# Presence
# ─────────────────────────────────────────────────────────────────────────────
@dataclass
class PresenceConfig:
    away_after_s: float = 600.0          # daytime: 10 min with no sighting -> away
    night_away_after_s: float = 2700.0   # night: phones sleep harder -> 45 min
    night_start_hour: int = 0
    night_end_hour: int = 6
    activity_hold_s: float = 1800.0      # in-home interaction keeps HOME for 30 min
    max_tick_gap_s: float = 180.0        # bigger gap = we were down, don't count it
    unknown_after_s: float = 600.0       # probes broken this long -> UNKNOWN
    min_outing_s: float = 900.0          # outings shorter than this don't reset isolation
    isolation_days: float = 2.0          # no qualifying outing for this long -> alert


@dataclass
class Outing:
    start: float
    end: float | None = None

    def duration(self, now: float) -> float:
        return (self.end if self.end is not None else now) - self.start


class PresenceTracker:
    def __init__(self, cfg: PresenceConfig | None = None, hour_fn: Callable[[float], int] = _local_hour,
                 midnight_fn: Callable[[float], float] = _local_midnight):
        self.cfg = cfg or PresenceConfig()
        self._hour = hour_fn
        self._midnight = midnight_fn
        self.state = UNKNOWN
        self.since: float | None = None
        self.reason = "starting"
        self.last_seen: float | None = None
        self.last_seen_by: dict[str, float] = {}
        self.last_activity: float | None = None
        self.absence_s = 0.0          # healthy, monitored time without any sighting
        self.unhealthy_s = 0.0        # time the probes could not answer
        self.last_tick: float | None = None
        self.started: float | None = None
        self.outings: list[Outing] = []
        self.outages: list[Outing] = []   # windows where the probes could not look
        self.monitored: list[tuple[float, float]] = []  # (day_midnight, healthy seconds)

    # ── input ────────────────────────────────────────────────────────────
    def activity(self, now: float):
        """Proof the patient is physically home: knob turned, heart check-in, ..."""
        self.last_activity = now

    def update(self, now: float, signals: dict[str, bool | None]) -> list[str]:
        """signals: source -> True (seen) / False (looked, not seen) / None (could not look).

        Returns the transitions that happened ("left_home", "returned_home", ...).
        """
        events: list[str] = []
        if self.started is None:
            self.started = now
        dt = 0.0 if self.last_tick is None else max(0.0, now - self.last_tick)
        gap = dt > self.cfg.max_tick_gap_s
        self.last_tick = now

        seen = [k for k, v in signals.items() if v]
        healthy = any(v is not None for v in signals.values())
        activity_recent = (self.last_activity is not None
                           and now - self.last_activity < self.cfg.activity_hold_s)
        if activity_recent and self.last_activity >= now - max(dt, 1.0):
            seen.append("activity")  # fresh interaction this tick counts as a sighting

        if healthy and not gap:
            self._add_monitored(now, dt)
        if not healthy and not (self.outages and self.outages[-1].end is None):
            self.outages.append(Outing(start=now - (0.0 if gap else dt)))
            events.append("network_lost")
        elif healthy and self.outages and self.outages[-1].end is None:
            self.outages[-1].end = now
            events.append("network_restored")

        if seen:
            for k in seen:
                self.last_seen_by[k] = now
            self.last_seen = now
            self.absence_s = 0.0
            self.unhealthy_s = 0.0
            if self.state == AWAY:
                self._close_outing(now)
                events.append("returned_home")
            self._set(HOME, now, "seen: " + ", ".join(sorted(set(seen))))
            return events

        if gap:
            # We were not running. Don't pretend we watched the door.
            return events

        if healthy:
            self.absence_s += dt
            self.unhealthy_s = 0.0
        else:
            self.unhealthy_s += dt
            if self.unhealthy_s >= self.cfg.unknown_after_s and self.state == HOME:
                self._set(UNKNOWN, now, "probes unavailable (network / bluetooth down)")
                events.append("unknown")
            return events

        if activity_recent:
            if self.state != HOME:
                self._set(HOME, now, "recent in-home activity (phone not visible)")
            else:
                self.reason = "recent in-home activity (phone not visible)"
            return events

        if self.state != AWAY and self.absence_s >= self._threshold(now):
            # Back-date to the last sighting, but never into a window we could not observe
            # (absence_s only counts healthy, monitored time).
            start = now - self.absence_s
            if self.last_seen is not None:
                start = max(start, self.last_seen)
            if self.last_activity is not None:
                start = max(start, self.last_activity)
            self.outings.append(Outing(start=start))
            self._set(AWAY, start, f"not seen for {int(self.absence_s // 60)} min")
            events.append("left_home")
        return events

    # ── helpers ──────────────────────────────────────────────────────────
    def _threshold(self, now: float) -> float:
        h = self._hour(now)
        s, e = self.cfg.night_start_hour, self.cfg.night_end_hour
        night = (s <= h < e) if s <= e else (h >= s or h < e)
        return self.cfg.night_away_after_s if night else self.cfg.away_after_s

    def _set(self, state: str, at: float, reason: str):
        if state != self.state:
            self.state, self.since = state, at
        self.reason = reason

    def _close_outing(self, now: float):
        if self.outings and self.outings[-1].end is None:
            self.outings[-1].end = now

    def _add_monitored(self, now: float, dt: float):
        day = self._midnight(now)
        if self.monitored and self.monitored[-1][0] == day:
            self.monitored[-1] = (day, self.monitored[-1][1] + dt)
        else:
            self.monitored.append((day, dt))
            self.monitored = self.monitored[-60:]

    # ── output ───────────────────────────────────────────────────────────
    def metrics(self, now: float) -> dict:
        day0 = self._midnight(now)
        away_today = sum(max(0.0, min(o.end or now, now) - max(o.start, day0))
                         for o in self.outings if (o.end or now) > day0)
        qualifying = [o for o in self.outings if o.duration(now) >= self.cfg.min_outing_s]
        outings_today = sum(1 for o in qualifying if (o.end or now) > day0)
        if self.state == AWAY and qualifying and qualifying[-1].end is None:
            since_out = 0.0
        elif qualifying:
            since_out = now - qualifying[-1].end
        else:
            since_out = now - (self.started or now)
        monitored_today = next((s for d, s in self.monitored if d == day0), 0.0)
        blind_today = sum(max(0.0, min(o.end or now, now) - max(o.start, day0))
                          for o in self.outages if (o.end or now) > day0)
        elapsed_today = max(1.0, now - max(day0, self.started or now))
        return {
            "away_today_min": round(away_today / 60, 1),
            "outings_today": outings_today,
            "days_since_last_outing": round(since_out / DAY, 2),
            "isolation_alert": since_out >= self.cfg.isolation_days * DAY,
            "coverage_today": round(min(1.0, monitored_today / elapsed_today), 3),
            "network_outage_min_today": round(blind_today / 60, 1),
        }

    def status(self, now: float) -> dict:
        return {
            "state": self.state,
            "since": self.since,
            "reason": self.reason,
            "last_seen": self.last_seen,
            "last_seen_by": self.last_seen_by,
            "absence_min": round(self.absence_s / 60, 1),
            "away_threshold_min": round(self._threshold(now) / 60, 1),
            **self.metrics(now),
            "recent_outings": [asdict(o) for o in self.outings[-10:]],
            "recent_network_outages": [asdict(o) for o in self.outages[-10:]],
        }

    def to_dict(self) -> dict:
        return {
            "state": self.state, "since": self.since, "reason": self.reason,
            "last_seen": self.last_seen, "last_seen_by": self.last_seen_by,
            "last_activity": self.last_activity, "absence_s": self.absence_s,
            "last_tick": self.last_tick, "started": self.started,
            "outings": [asdict(o) for o in self.outings[-500:]],
            "outages": [asdict(o) for o in self.outages[-500:]],
            "monitored": self.monitored,
        }

    def load(self, d: dict):
        for k in ("state", "since", "reason", "last_seen", "last_activity",
                  "absence_s", "last_tick", "started"):
            if k in d:
                setattr(self, k, d[k])
        self.last_seen_by = dict(d.get("last_seen_by", {}))
        self.outings = [Outing(**o) for o in d.get("outings", [])]
        self.outages = [Outing(**o) for o in d.get("outages", [])]
        self.monitored = [tuple(m) for m in d.get("monitored", [])]


# ─────────────────────────────────────────────────────────────────────────────
# Guests (BLE)
# ─────────────────────────────────────────────────────────────────────────────
@dataclass
class Advert:
    addr: str
    rssi: int
    ts: float
    name: str | None = None
    company: int | None = None   # Bluetooth SIG company id from manufacturer data
    kind: str | None = None      # "phone" / "other" / None (unknown) — see classify()


# Bluetooth SIG company ids of phone makers (manufacturer-specific data).
PHONE_MAKERS = {
    117: "Samsung", 224: "Google", 911: "Xiaomi", 637: "Huawei",
    0x0A93: "OnePlus?", 0x079A: "Oppo?",
}
OTHER_MAKERS = {6: "Microsoft", 301: "Sony", 87: "Garmin", 0x0157: "Huami", 0x0499: "Ruuvi"}
# Apple "Continuity" message types (first byte of Apple manufacturer data).
APPLE_PHONE_TYPES = {0x10, 0x0C, 0x0F, 0x05}        # Nearby Info, Handoff, Nearby Action, AirDrop
APPLE_OTHER_TYPES = {0x07, 0x12, 0x09, 0x02, 0x0B}  # AirPods, Find My/AirTag, AirPlay, iBeacon, Watch
# Service UUIDs (16-bit) typical of Android phones (Google Nearby / Fast Pair / exposure).
ANDROID_PHONE_UUIDS = {"0000fef3", "0000fe9f", "0000fe2c"}


def maker_name(company: int | None) -> str | None:
    if company is None:
        return None
    if company == 76:
        return "Apple"
    return PHONE_MAKERS.get(company) or OTHER_MAKERS.get(company) or f"id {company}"


def classify(manufacturer_data: dict | None, service_uuids=()) -> tuple[int | None, str | None]:
    """Best-effort: is this advert from a phone? Returns (company, "phone"|"other"|None).

    Phones are what guests reliably carry; earbuds, laptops, watches, trackers and
    beacons would otherwise inflate the guest count. Heuristic, not a guarantee:
    Apple watches/iPads share message types with iPhones, and some Android phones
    advertise nothing identifying (-> None, counted only when phones_only is off).
    """
    company = None
    if manufacturer_data:
        company = next(iter(manufacturer_data))
        data = manufacturer_data[company] or b""
        if company == 76:
            t = data[0] if data else None
            if t in APPLE_PHONE_TYPES:
                return company, "phone"
            if t in APPLE_OTHER_TYPES:
                return company, "other"
            return company, None
        if company in PHONE_MAKERS:
            return company, "phone"
        if company in OTHER_MAKERS:
            return company, "other"
    uu = {str(u).lower()[:8] for u in (service_uuids or ())}
    if uu & ANDROID_PHONE_UUIDS:
        return company, "phone"
    return company, ("other" if company is not None else None)


@dataclass
class GuestConfig:
    rssi_min: int = -75          # weaker than this = outside the flat / next door
    window_s: float = 300.0      # device counts as nearby for 5 min after its last advert
                                 # (locked phones advertise in bursts; < MAC rotation period)
    rotation_guard: float = 1.25 # min-filter span (x window_s) that hides rotation double-counts
    dwell_s: float = 600.0       # a visit needs >= 10 min of extra devices
    end_after_s: float = 600.0   # visit ends after 10 min without extra devices
    margin: int = 1              # extra devices over baseline needed
    rssi_alpha: float = 0.3      # EWMA smoothing for RSSI
    forget_s: float = 900.0
    phones_only: bool = False    # count only adverts classify() calls "phone"


@dataclass
class Visit:
    start: float
    end: float | None = None
    peak_guests: int = 1


class GuestTracker:
    def __init__(self, cfg: GuestConfig | None = None, ignore: Iterable[str] = (),
                 midnight_fn: Callable[[float], float] = _local_midnight):
        self.cfg = cfg or GuestConfig()
        self._midnight = midnight_fn
        self.ignore = {a.lower() for a in ignore}      # patient's own devices
        self.household: set[str] = set()               # static devices learned in calibration
        self.baseline = 0.0                            # typical unknown devices when alone
        self._dev: dict[str, list] = {}  # addr -> [first_ts, last_ts, rssi_ewma, kind, company]
        self._cal: dict | None = None
        self._cand_start: float | None = None
        self._last_excess: float | None = None
        self._hist: deque[tuple[float, int]] = deque()   # (t, raw unknown count)
        self.visits: list[Visit] = []
        self.current = 0
        self.started: float | None = None

    def _filtered(self, now: float, raw: int) -> int:
        """Min over the last ~window: when an address rotates, old + new both look
        'nearby' for window_s — a transient +1 that the min removes. A real extra
        device stays for longer than the span and passes through."""
        span = self.cfg.window_s * self.cfg.rotation_guard
        self._hist.append((now, raw))
        while self._hist and now - self._hist[0][0] > span:
            self._hist.popleft()
        return min(c for _, c in self._hist)

    def observe(self, adverts: Iterable[Advert]):
        a = self.cfg.rssi_alpha
        for ad in adverts:
            k = ad.addr.lower()
            d = self._dev.get(k)
            if d is None:
                self._dev[k] = [ad.ts, ad.ts, float(ad.rssi), ad.kind, ad.company]
            else:
                d[1], d[2] = ad.ts, (1 - a) * d[2] + a * ad.rssi
                d[3] = ad.kind or d[3]
                d[4] = ad.company if ad.company is not None else d[4]

    def _near(self, now: float, d: list) -> bool:
        if now - d[1] > self.cfg.window_s or d[2] < self.cfg.rssi_min:
            return False
        return not self.cfg.phones_only or d[3] == "phone"

    def nearby_unknown(self, now: float) -> list[str]:
        return [k for k, d in self._dev.items()
                if self._near(now, d) and k not in self.ignore and k not in self.household]

    def nearby_devices(self, now: float, limit: int = 15) -> list[dict]:
        """Strongest devices in range — what the counter is looking at (for debugging/demo)."""
        rows = []
        for k, d in self._dev.items():
            if now - d[1] > self.cfg.window_s:
                continue
            rows.append({
                "addr": k, "rssi": round(d[2]), "maker": maker_name(d[4]), "kind": d[3] or "unknown",
                "present_min": round((d[1] - d[0]) / 60, 1),
                "counted": self._near(now, d) and k not in self.ignore and k not in self.household,
                "note": "patient" if k in self.ignore else "household" if k in self.household else None,
            })
        rows.sort(key=lambda r: -r["rssi"])
        return rows[:limit]

    # ── calibration: patient alone at home, normal day ───────────────────
    def start_calibration(self, now: float, duration_s: float):
        self._cal = {"until": now + duration_s, "snapshots": []}

    def calibrating(self) -> bool:
        return self._cal is not None

    def _calibrate_tick(self, now: float):
        c = self._cal
        c["snapshots"].append((now, {k for k, d in self._dev.items()
                                     if self._near(now, d) and k not in self.ignore}))
        if now < c["until"]:
            return
        snaps = c["snapshots"]
        seen: dict[str, int] = {}
        for _, s in snaps:
            for k in s:
                seen[k] = seen.get(k, 0) + 1
        # Present most of the time with the same address -> household device (TV, speaker, laptop).
        self.household = {k for k, n in seen.items() if n / len(snaps) >= 0.6}
        # Everything else is background churn (neighbours, rotating MACs): learn its usual level.
        self._hist.clear()
        counts = sorted(self._filtered(t, len(s - self.household)) for t, s in snaps)
        self.baseline = float(counts[min(len(counts) - 1, int(0.9 * len(counts)))])
        self._hist.clear()
        self._cal = None

    # ── main tick ────────────────────────────────────────────────────────
    def update(self, now: float, patient_home: bool) -> list[str]:
        events: list[str] = []
        if self.started is None:
            self.started = now
        for k in [k for k, d in self._dev.items() if now - d[1] > self.cfg.forget_s]:
            del self._dev[k]

        if self._cal is not None:
            self._calibrate_tick(now)
            if self._cal is None:
                events.append("calibrated")
            self.current = 0
            return events

        count = self._filtered(now, len(self.nearby_unknown(now)))
        excess = int(count - self.baseline)
        active = bool(self.visits) and self.visits[-1].end is None

        if not patient_home:
            # Devices in an empty flat (or a guest while the patient is out) are not social contact.
            if active:
                self.visits[-1].end = self._last_excess or now
                events.append("guest_left")
            self._cand_start = None
            self.current = 0
            return events

        if excess >= self.cfg.margin:
            self._last_excess = now
            if self._cand_start is None:
                self._cand_start = now
            if active:
                self.visits[-1].peak_guests = max(self.visits[-1].peak_guests, excess)
            elif now - self._cand_start >= self.cfg.dwell_s:
                self.visits.append(Visit(start=self._cand_start, peak_guests=excess))
                events.append("guest_arrived")
            self.current = max(0, excess)
            return events

        self.current = 0
        if not active:
            self._cand_start = None  # dwell must be continuous: passer-by / short blip
        elif self._last_excess is None or now - self._last_excess >= self.cfg.end_after_s:
            self.visits[-1].end = self._last_excess
            events.append("guest_left")
            self._cand_start = None
        return events

    def metrics(self, now: float) -> dict:
        day0 = self._midnight(now)
        today = [v for v in self.visits if (v.end or now) > day0]
        minutes = sum(max(0.0, (v.end or now) - max(v.start, day0)) for v in today) / 60
        if self.visits and self.visits[-1].end is None:
            since = 0.0
        elif self.visits:
            since = now - self.visits[-1].end
        else:
            since = now - (self.started or now)
        return {
            "guests_now": self.current,
            "visits_today": len(today),
            "guest_minutes_today": round(minutes, 1),
            "days_since_last_visit": round(since / DAY, 2),
        }

    def status(self, now: float) -> dict:
        return {
            **self.metrics(now),
            "nearby_unknown_devices": len(self.nearby_unknown(now)),
            "baseline": self.baseline,
            "rssi_min": self.cfg.rssi_min,
            "phones_only": self.cfg.phones_only,
            "household_devices": len(self.household),
            "calibrating": self.calibrating(),
            "recent_visits": [asdict(v) for v in self.visits[-10:]],
        }

    def to_dict(self) -> dict:
        return {"household": sorted(self.household), "baseline": self.baseline,
                "visits": [asdict(v) for v in self.visits[-500:]], "started": self.started}

    def load(self, d: dict):
        self.household = set(d.get("household", []))
        self.baseline = float(d.get("baseline", 0.0))
        self.visits = [Visit(**v) for v in d.get("visits", [])]
        self.started = d.get("started")
