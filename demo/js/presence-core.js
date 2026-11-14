// Home presence and guest detection: the decision logic.
//
// Ported line by line from Vlad's jetson/presence/core.py (PresenceTracker, GuestTracker,
// classify) and the profiles in jetson/presence/app.py. The thresholds, edge cases and event
// names are his; the Python tests in jetson/presence/tests are re-run against this port in
// demo/tests/presence.test.js, which also replays random traces through core.py and compares.
// Field and method names stay in Python spelling (to_dict, away_after_s) so state and tick
// logs are interchangeable with the Jetson service and tools/score.py reads the phone's log.
//
// Pure: no I/O, the clock is passed in. Loaded by the app (A.PresenceCore) and by node tests.
//
// Deviations from core.py, each marked "phone:" below:
//   * GuestTracker: a visit restored after a restart closes at "now" instead of staying open
//     forever (core.py sets end = None there and repeats guest_left every tick).
//   * GuestTracker.close_for_gap: new. The phone only watches while the app is open, so a
//     visit open when the app closed ends at the last moment we actually watched.
//   * Everything under "Phone adapters" is new: it turns what iOS can see into the
//     True / False / None signals core.py expects.
((root) => {
  'use strict';

  const HOME = 'home', AWAY = 'away', UNKNOWN = 'unknown';
  const DAY = 86400;

  const localHour = ts => new Date(ts * 1000).getHours();
  const localMidnight = ts => {
    const d = new Date(ts * 1000);
    return ts - (d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds());
  };

  // Python round(): exact ties go to the even digit (round(0.25, 1) == 0.2).
  const pyRound = (x, n = 0) => {
    if (!Number.isFinite(x)) return x;
    const a = Math.abs(x);
    const up = Number(a.toFixed(n));                 // spec: exact ties pick the larger value
    const exact = a.toFixed(Math.min(100, n + 40));  // the double's exact decimal digits
    const [ip, fp = ''] = exact.split('.');
    let r = up;
    if (/^50*$/.test(fp.slice(n))) {
      const kept = n ? fp.slice(0, n) : ip;
      if (Number(kept[kept.length - 1]) % 2 === 0) r = Number(n ? `${ip}.${kept}` : ip);
    }
    return x < 0 ? -r : r;
  };
  const sum = xs => xs.reduce((a, b) => a + b, 0);
  const last = xs => xs[xs.length - 1];

  // ───────────────────────────────────────────────────────────────────────────
  // Presence
  // ───────────────────────────────────────────────────────────────────────────
  const presenceConfig = (over = {}) => ({
    away_after_s: 600.0,        // daytime: 10 min with no sighting -> away
    night_away_after_s: 2700.0, // night: phones sleep harder -> 45 min
    night_start_hour: 0,
    night_end_hour: 6,
    activity_hold_s: 1800.0,    // in-home interaction keeps HOME for 30 min
    max_tick_gap_s: 180.0,      // bigger gap = we were down, don't count it
    unknown_after_s: 600.0,     // probes broken this long -> UNKNOWN
    min_outing_s: 900.0,        // outings shorter than this don't reset isolation
    isolation_days: 2.0,        // no qualifying outing for this long -> alert
    ...over,
  });

  const duration = (o, now) => (o.end !== null ? o.end : now) - o.start;

  class PresenceTracker {
    constructor(cfg = null, hourFn = localHour, midnightFn = localMidnight) {
      this.cfg = cfg || presenceConfig();
      this._hour = hourFn;
      this._midnight = midnightFn;
      this.state = UNKNOWN;
      this.since = null;
      this.reason = 'starting';
      this.last_seen = null;
      this.last_seen_by = {};
      this.last_activity = null;
      this.absence_s = 0.0;     // healthy, monitored time without any sighting
      this.unhealthy_s = 0.0;   // time the probes could not answer
      this.last_tick = null;
      this.started = null;
      this.outings = [];
      this.outages = [];        // windows where the probes could not look
      this.monitored = [];      // [day_midnight, healthy seconds]
    }

    // Proof the patient is physically home: knob turned, heart check-in, ...
    activity(now) { this.last_activity = now; }

    // signals: source -> true (seen) / false (looked, not seen) / null (could not look).
    // Returns the transitions that happened ("left_home", "returned_home", ...).
    update(now, signals) {
      const events = [];
      if (this.started === null) this.started = now;
      const dt = this.last_tick === null ? 0.0 : Math.max(0.0, now - this.last_tick);
      const gap = dt > this.cfg.max_tick_gap_s;
      this.last_tick = now;

      const seen = Object.keys(signals).filter(k => signals[k]);
      const healthy = Object.values(signals).some(v => v !== null && v !== undefined);
      const activityRecent = this.last_activity !== null && now - this.last_activity < this.cfg.activity_hold_s;
      if (activityRecent && this.last_activity >= now - Math.max(dt, 1.0)) seen.push('activity');

      if (healthy && !gap) this._add_monitored(now, dt);
      const outageOpen = this.outages.length > 0 && last(this.outages).end === null;
      if (!healthy && !outageOpen) {
        this.outages.push({ start: now - (gap ? 0.0 : dt), end: null });
        events.push('network_lost');
      } else if (healthy && outageOpen) {
        last(this.outages).end = now;
        events.push('network_restored');
      }

      if (seen.length) {
        for (const k of seen) this.last_seen_by[k] = now;
        this.last_seen = now;
        this.absence_s = 0.0;
        this.unhealthy_s = 0.0;
        if (this.state === AWAY) {
          this._close_outing(now);
          events.push('returned_home');
        }
        this._set(HOME, now, 'seen: ' + [...new Set(seen)].sort().join(', '));
        return events;
      }

      if (gap) return events; // We were not running. Don't pretend we watched the door.

      if (healthy) {
        this.absence_s += dt;
        this.unhealthy_s = 0.0;
      } else {
        this.unhealthy_s += dt;
        if (this.unhealthy_s >= this.cfg.unknown_after_s && this.state === HOME) {
          this._set(UNKNOWN, now, 'probes unavailable (network / bluetooth down)');
          events.push('unknown');
        }
        return events;
      }

      if (activityRecent) {
        if (this.state !== HOME) this._set(HOME, now, 'recent in-home activity (phone not visible)');
        else this.reason = 'recent in-home activity (phone not visible)';
        return events;
      }

      if (this.state !== AWAY && this.absence_s >= this._threshold(now)) {
        // Back-date to the last sighting, but never into a window we could not observe
        // (absence_s only counts healthy, monitored time).
        let start = now - this.absence_s;
        if (this.last_seen !== null) start = Math.max(start, this.last_seen);
        if (this.last_activity !== null) start = Math.max(start, this.last_activity);
        this.outings.push({ start, end: null });
        this._set(AWAY, start, `not seen for ${Math.floor(this.absence_s / 60)} min`);
        events.push('left_home');
      }
      return events;
    }

    _threshold(now) {
      const h = this._hour(now), s = this.cfg.night_start_hour, e = this.cfg.night_end_hour;
      const night = s <= e ? (s <= h && h < e) : (h >= s || h < e);
      return night ? this.cfg.night_away_after_s : this.cfg.away_after_s;
    }

    _set(state, at, reason) {
      if (state !== this.state) { this.state = state; this.since = at; }
      this.reason = reason;
    }

    _close_outing(now) {
      if (this.outings.length && last(this.outings).end === null) last(this.outings).end = now;
    }

    _add_monitored(now, dt) {
      const day = this._midnight(now);
      if (this.monitored.length && last(this.monitored)[0] === day) {
        last(this.monitored)[1] += dt;
      } else {
        this.monitored.push([day, dt]);
        this.monitored = this.monitored.slice(-60);
      }
    }

    metrics(now) {
      const day0 = this._midnight(now);
      const today = spans => sum(spans.filter(o => (o.end || now) > day0)
        .map(o => Math.max(0.0, Math.min(o.end || now, now) - Math.max(o.start, day0))));
      const awayToday = today(this.outings);
      const qualifying = this.outings.filter(o => duration(o, now) >= this.cfg.min_outing_s);
      const outingsToday = qualifying.filter(o => (o.end || now) > day0).length;
      let sinceOut;
      if (this.state === AWAY && qualifying.length && last(qualifying).end === null) sinceOut = 0.0;
      else if (qualifying.length) sinceOut = now - (last(qualifying).end ?? now);
      else sinceOut = now - (this.started || now);
      const m = this.monitored.find(([d]) => d === day0);
      const monitoredToday = m ? m[1] : 0.0;
      const blindToday = today(this.outages);
      const elapsedToday = Math.max(1.0, now - Math.max(day0, this.started || now));
      return {
        away_today_min: pyRound(awayToday / 60, 1),
        outings_today: outingsToday,
        days_since_last_outing: pyRound(sinceOut / DAY, 2),
        isolation_alert: sinceOut >= this.cfg.isolation_days * DAY,
        coverage_today: pyRound(Math.min(1.0, monitoredToday / elapsedToday), 3),
        network_outage_min_today: pyRound(blindToday / 60, 1),
      };
    }

    status(now) {
      return {
        state: this.state,
        since: this.since,
        reason: this.reason,
        last_seen: this.last_seen,
        last_seen_by: { ...this.last_seen_by },
        absence_min: pyRound(this.absence_s / 60, 1),
        away_threshold_min: pyRound(this._threshold(now) / 60, 1),
        ...this.metrics(now),
        recent_outings: this.outings.slice(-10).map(o => ({ ...o })),
        recent_network_outages: this.outages.slice(-10).map(o => ({ ...o })),
      };
    }

    to_dict() {
      return {
        state: this.state, since: this.since, reason: this.reason,
        last_seen: this.last_seen, last_seen_by: { ...this.last_seen_by },
        last_activity: this.last_activity, absence_s: this.absence_s,
        last_tick: this.last_tick, started: this.started,
        outings: this.outings.slice(-500).map(o => ({ ...o })),
        outages: this.outages.slice(-500).map(o => ({ ...o })),
        monitored: this.monitored.map(m => [...m]),
      };
    }

    load(d) {
      for (const k of ['state', 'since', 'reason', 'last_seen', 'last_activity', 'absence_s', 'last_tick', 'started']) {
        if (k in d) this[k] = d[k];
      }
      this.last_seen_by = { ...(d.last_seen_by || {}) };
      this.outings = (d.outings || []).map(o => ({ start: o.start, end: o.end ?? null }));
      this.outages = (d.outages || []).map(o => ({ start: o.start, end: o.end ?? null }));
      this.monitored = (d.monitored || []).map(m => [m[0], m[1]]);
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Guests (BLE)
  // ───────────────────────────────────────────────────────────────────────────
  // Advert: { addr, rssi, ts, name?, company?, kind? }  kind: "phone" / "other" / null

  // Bluetooth SIG company ids of phone makers (manufacturer-specific data).
  const PHONE_MAKERS = { 117: 'Samsung', 224: 'Google', 911: 'Xiaomi', 637: 'Huawei', 0x0A93: 'OnePlus?', 0x079A: 'Oppo?' };
  const OTHER_MAKERS = { 6: 'Microsoft', 301: 'Sony', 87: 'Garmin', 0x0157: 'Huami', 0x0499: 'Ruuvi' };
  // Apple "Continuity" message types (first byte of Apple manufacturer data).
  const APPLE_PHONE_TYPES = new Set([0x10, 0x0C, 0x0F, 0x05]);       // Nearby Info, Handoff, Nearby Action, AirDrop
  const APPLE_OTHER_TYPES = new Set([0x07, 0x12, 0x09, 0x02, 0x0B]); // AirPods, Find My/AirTag, AirPlay, iBeacon, Watch
  // Service UUIDs (16-bit) typical of Android phones (Google Nearby / Fast Pair / exposure).
  const ANDROID_PHONE_UUIDS = new Set(['0000fef3', '0000fe9f', '0000fe2c']);

  const maker_name = company => {
    if (company === null || company === undefined) return null;
    if (company === 76) return 'Apple';
    return PHONE_MAKERS[company] || OTHER_MAKERS[company] || `id ${company}`;
  };

  // "FEF3" (CoreBluetooth) or "0000fef3-0000-1000-8000-00805f9b34fb" (BlueZ) -> "0000fef3".
  const uuidPrefix = u => {
    u = String(u).toLowerCase();
    return u.length === 4 ? '0000' + u : u.slice(0, 8);
  };

  // Best-effort: is this advert from a phone? Returns [company, "phone" | "other" | null].
  // manufacturerData: { [company]: bytes } like bleak's dict (one entry on iOS).
  const classify = (manufacturerData, serviceUuids = []) => {
    let company = null;
    const keys = manufacturerData ? Object.keys(manufacturerData) : [];
    if (keys.length) {
      company = Number(keys[0]);
      const data = manufacturerData[keys[0]] || [];
      if (company === 76) {
        const t = data.length ? data[0] : null;
        if (APPLE_PHONE_TYPES.has(t)) return [company, 'phone'];
        if (APPLE_OTHER_TYPES.has(t)) return [company, 'other'];
        return [company, null];
      }
      if (company in PHONE_MAKERS) return [company, 'phone'];
      if (company in OTHER_MAKERS) return [company, 'other'];
    }
    if ((serviceUuids || []).some(u => ANDROID_PHONE_UUIDS.has(uuidPrefix(u)))) return [company, 'phone'];
    return [company, company !== null ? 'other' : null];
  };

  const guestConfig = (over = {}) => ({
    rssi_min: -75,         // weaker than this = outside the flat / next door
    window_s: 300.0,       // device counts as nearby for 5 min after its last advert
    rotation_guard: 1.25,  // min-filter span (x window_s) that hides rotation double-counts
    dwell_s: 600.0,        // a visit needs >= 10 min of extra devices
    end_after_s: 600.0,    // visit ends after 10 min without extra devices
    margin: 1,             // extra devices over baseline needed
    rssi_alpha: 0.3,       // EWMA smoothing for RSSI
    forget_s: 900.0,
    phones_only: false,    // count only adverts classify() calls "phone"
    ...over,
  });

  class GuestTracker {
    constructor(cfg = null, ignore = [], midnightFn = localMidnight) {
      this.cfg = cfg || guestConfig();
      this._midnight = midnightFn;
      this.ignore = new Set([...ignore].map(a => a.toLowerCase())); // patient's own devices
      this.household = new Set();   // static devices learned in calibration
      this.baseline = 0.0;          // typical unknown devices when alone
      this._dev = new Map();        // addr -> [first_ts, last_ts, rssi_ewma, kind, company]
      this._cal = null;
      this._cand_start = null;
      this._last_excess = null;
      this._hist = [];              // [t, raw unknown count]
      this.visits = [];
      this.current = 0;
      this.started = null;
    }

    // Min over the last ~window: when an address rotates, old + new both look 'nearby' for
    // window_s, a transient +1 that the min removes. A real extra device stays for longer
    // than the span and passes through.
    _filtered(now, raw) {
      const span = this.cfg.window_s * this.cfg.rotation_guard;
      this._hist.push([now, raw]);
      while (this._hist.length && now - this._hist[0][0] > span) this._hist.shift();
      return Math.min(...this._hist.map(h => h[1]));
    }

    observe(adverts) {
      const a = this.cfg.rssi_alpha;
      for (const ad of adverts) {
        const k = ad.addr.toLowerCase();
        const d = this._dev.get(k);
        if (d === undefined) {
          this._dev.set(k, [ad.ts, ad.ts, Number(ad.rssi), ad.kind ?? null, ad.company ?? null]);
        } else {
          d[1] = ad.ts;
          d[2] = (1 - a) * d[2] + a * ad.rssi;
          d[3] = ad.kind || d[3];
          d[4] = ad.company !== null && ad.company !== undefined ? ad.company : d[4];
        }
      }
    }

    _near(now, d) {
      if (now - d[1] > this.cfg.window_s || d[2] < this.cfg.rssi_min) return false;
      return !this.cfg.phones_only || d[3] === 'phone';
    }

    nearby_unknown(now) {
      const out = [];
      for (const [k, d] of this._dev) if (this._near(now, d) && !this.ignore.has(k) && !this.household.has(k)) out.push(k);
      return out;
    }

    // Strongest devices in range: what the counter is looking at (for debugging / demo).
    nearby_devices(now, limit = 15) {
      const rows = [];
      for (const [k, d] of this._dev) {
        if (now - d[1] > this.cfg.window_s) continue;
        rows.push({
          addr: k, rssi: pyRound(d[2]), maker: maker_name(d[4]), kind: d[3] || 'unknown',
          present_min: pyRound((d[1] - d[0]) / 60, 1),
          counted: this._near(now, d) && !this.ignore.has(k) && !this.household.has(k),
          note: this.ignore.has(k) ? 'patient' : this.household.has(k) ? 'household' : null,
        });
      }
      rows.sort((a, b) => b.rssi - a.rssi);
      return rows.slice(0, limit);
    }

    // ── calibration: patient alone at home, normal day ──────────────────
    start_calibration(now, durationS) { this._cal = { until: now + durationS, snapshots: [] }; }

    calibrating() { return this._cal !== null; }

    _calibrate_tick(now) {
      const c = this._cal;
      const near = new Set();
      for (const [k, d] of this._dev) if (this._near(now, d) && !this.ignore.has(k)) near.add(k);
      c.snapshots.push([now, near]);
      if (now < c.until) return;
      const snaps = c.snapshots;
      const seen = new Map();
      for (const [, s] of snaps) for (const k of s) seen.set(k, (seen.get(k) || 0) + 1);
      // Present most of the time with the same address -> household device (TV, speaker, laptop).
      this.household = new Set([...seen].filter(([, n]) => n / snaps.length >= 0.6).map(([k]) => k));
      // Everything else is background churn (neighbours, rotating MACs): learn its usual level.
      this._hist = [];
      const counts = snaps.map(([t, s]) => this._filtered(t, [...s].filter(k => !this.household.has(k)).length)).sort((a, b) => a - b);
      this.baseline = counts[Math.min(counts.length - 1, Math.trunc(0.9 * counts.length))];
      this._hist = [];
      this._cal = null;
    }

    // ── main tick ────────────────────────────────────────────────────────
    update(now, patientHome) {
      const events = [];
      if (this.started === null) this.started = now;
      for (const [k, d] of [...this._dev]) if (now - d[1] > this.cfg.forget_s) this._dev.delete(k);

      if (this._cal !== null) {
        this._calibrate_tick(now);
        if (this._cal === null) events.push('calibrated');
        this.current = 0;
        return events;
      }

      const count = this._filtered(now, this.nearby_unknown(now).length);
      const excess = Math.trunc(count - this.baseline);
      const active = this.visits.length > 0 && last(this.visits).end === null;

      if (!patientHome) {
        // Devices in an empty flat (or a guest while the patient is out) are not social contact.
        if (active) {
          last(this.visits).end = this._last_excess || now;
          events.push('guest_left');
        }
        this._cand_start = null;
        this.current = 0;
        return events;
      }

      if (excess >= this.cfg.margin) {
        this._last_excess = now;
        if (this._cand_start === null) this._cand_start = now;
        if (active) {
          last(this.visits).peak_guests = Math.max(last(this.visits).peak_guests, excess);
        } else if (now - this._cand_start >= this.cfg.dwell_s) {
          this.visits.push({ start: this._cand_start, end: null, peak_guests: excess });
          events.push('guest_arrived');
        }
        this.current = Math.max(0, excess);
        return events;
      }

      this.current = 0;
      if (!active) {
        this._cand_start = null; // dwell must be continuous: passer-by / short blip
      } else if (this._last_excess === null || now - this._last_excess >= this.cfg.end_after_s) {
        // phone: core.py sets end = _last_excess, which is None for a visit restored after a
        // restart, so that visit never closed and guest_left repeated every tick.
        last(this.visits).end = this._last_excess ?? now;
        events.push('guest_left');
        this._cand_start = null;
      }
      return events;
    }

    // phone: new. The app stopped watching at `lastObserved` (closed, screen locked). A visit
    // still open then ends at its last extra device, never later than what we saw.
    close_for_gap(lastObserved) {
      const events = [];
      if (this.visits.length && last(this.visits).end === null) {
        last(this.visits).end = Math.min(this._last_excess ?? lastObserved, lastObserved);
        events.push('guest_left');
      }
      this._cand_start = null;
      this.current = 0;
      return events;
    }

    metrics(now) {
      const day0 = this._midnight(now);
      const today = this.visits.filter(v => (v.end || now) > day0);
      const minutes = sum(today.map(v => Math.max(0.0, (v.end || now) - Math.max(v.start, day0)))) / 60;
      let since;
      if (this.visits.length && last(this.visits).end === null) since = 0.0;
      else if (this.visits.length) since = now - last(this.visits).end;
      else since = now - (this.started || now);
      return {
        guests_now: this.current,
        visits_today: today.length,
        guest_minutes_today: pyRound(minutes, 1),
        days_since_last_visit: pyRound(since / DAY, 2),
      };
    }

    status(now) {
      return {
        ...this.metrics(now),
        nearby_unknown_devices: this.nearby_unknown(now).length,
        baseline: this.baseline,
        rssi_min: this.cfg.rssi_min,
        phones_only: this.cfg.phones_only,
        household_devices: this.household.size,
        calibrating: this.calibrating(),
        recent_visits: this.visits.slice(-10).map(v => ({ ...v })),
      };
    }

    to_dict() {
      return {
        household: [...this.household].sort(), baseline: this.baseline,
        visits: this.visits.slice(-500).map(v => ({ ...v })), started: this.started,
      };
    }

    load(d) {
      this.household = new Set(d.household || []);
      this.baseline = Number(d.baseline || 0.0);
      this.visits = (d.visits || []).map(v => ({ start: v.start, end: v.end ?? null, peak_guests: v.peak_guests ?? 1 }));
      this.started = d.started ?? null;
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Profiles (app.py PROFILES / apply_profile), switchable live
  // ───────────────────────────────────────────────────────────────────────────
  //   home     real flat: 10 min away limit, room-sized BLE range (-65 dBm), phones only
  //   demo     stage / testing: 2 min away limit, same-room BLE range, short dwell
  //   classic  the original v0.1 tuning, kept for comparison
  const PROFILES = {
    home: { away_min: 10, night_away_min: 45, rssi: -65, dwell_min: 10, end_min: 10, window_min: 5, phones_only: true, calibrate_min: 60 },
    demo: { away_min: 2, night_away_min: 2, rssi: -65, dwell_min: 2, end_min: 2, window_min: 1, phones_only: true, calibrate_min: 5 },
    classic: { away_min: 10, night_away_min: 45, rssi: -75, dwell_min: 10, end_min: 10, window_min: 5, phones_only: false, calibrate_min: 60 },
  };
  const SCAN_INTERVAL_S = 30;

  // Mutates the shared config objects, so trackers built on them see the change live.
  const applyProfile = (name, pcfg, gcfg) => {
    const p = PROFILES[name];
    if (!p) throw new Error(`unknown profile ${name}`);
    pcfg.away_after_s = p.away_min * 60;
    pcfg.night_away_after_s = p.night_away_min * 60;
    gcfg.rssi_min = Math.trunc(p.rssi);
    gcfg.dwell_s = p.dwell_min * 60;
    gcfg.end_after_s = p.end_min * 60;
    gcfg.window_s = p.window_min * 60;
    gcfg.phones_only = !!p.phones_only;
    return { name, ...p };
  };

  // app.py tick(): presence first, then guests (counted only while the patient is home).
  const tick = (presence, guests, now, signals, adverts) => {
    const events = presence.update(now, signals);
    guests.observe(adverts);
    return events.concat(guests.update(now, presence.state === HOME));
  };

  // ───────────────────────────────────────────────────────────────────────────
  // Phone adapters (new). On the Jetson the device sat at home and looked for the patient's
  // phone; here the phone looks for the home. Each returns true / false / null like a probe.
  // ───────────────────────────────────────────────────────────────────────────

  // The bedside unit (UNO Q "Afferent Finger") seen over BLE. Same rule as probes.py
  // BleProbe.patient_seen: unknown until the token exists, could-not-look while BLE is down,
  // otherwise seen = an advert within the window.
  const bleSighting = ({ known, ok, lastAt, now, windowS = Math.max(120, SCAN_INTERVAL_S * 3) }) => {
    if (!known || !ok) return null;
    return lastAt !== null && lastAt !== undefined && now - lastAt <= windowS;
  };

  // The home Wi-Fi, recognised by the devices that stay on it (TV, speakers, printer: Bonjour
  // names, stored only as hashes). iOS gives a free-team app no SSID, ARP table or Wi-Fi scan.
  // Logic from the stopped presence-ios work (HomeNetwork.sighting).
  const homeWifiMatchesNeeded = learnedCount => learnedCount >= 3 ? 2 : 1;
  const wifiSighting = ({ learned, visible, onWifi, browse }) => {
    if (!learned || !learned.length) return null;            // not set up (Jetson: PHONE_MACS unset)
    if (browse === 'denied' || browse === 'failed') return null; // Local Network permission off
    if (!onWifi) return false;                               // looked: not on any Wi-Fi
    if (browse !== 'ready') return null;
    const vis = new Set(visible || []);
    return learned.filter(k => vis.has(k)).length >= homeWifiMatchesNeeded(learned.length);
  };

  // Private, link-local or .local addresses only: a hub reached over the internet says nothing
  // about where the phone is.
  const isLanHost = host => {
    host = String(host || '').toLowerCase().replace(/^\[|\]$/g, '');
    if (/\.local$/.test(host)) return true;
    const m = host.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
    if (m) {
      const [a, b] = [Number(m[1]), Number(m[2])];
      return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254);
    }
    return /^(fe80|fc|fd)/.test(host);
  };
  const hostOf = url => { try { return new URL(String(url).replace(/^ws/, 'http')).hostname; } catch { return ''; } };

  // The app's home hub answering on the local network proves home; silence proves nothing
  // (the hub may be off), so this source is only ever seen or could-not-look.
  const hubSighting = ({ connected, url }) => connected && isLanHost(hostOf(url)) ? true : null;

  // CoreBluetooth manufacturer data: 2-byte little-endian company id, then the payload.
  const manufacturerFromHex = hex => {
    if (!hex || hex.length < 4) return null;
    const b = [];
    for (let i = 0; i + 1 < hex.length; i += 2) b.push(parseInt(hex.slice(i, i + 2), 16));
    return { [b[0] | (b[1] << 8)]: b.slice(2) };
  };

  // What goes into the session's context (session.v3 `context.home`, `context.visitors_present`).
  // The phone only watches while the app is open, so a state carried over from before the app
  // was closed is stale: home needs a sighting in this open stretch, away needs the AWAY
  // decision made in it, visitors need a calibrated baseline. 0 visitors needs a full dwell
  // window watched with no extra phone in range (a phone that just sat down is undecided,
  // not 0). Anything else is null.
  const sessionContext = (presence, guests, now, { stretchStart, awayDecidedAt = null, calibrated = false }) => {
    let home = null;
    if (presence.state === HOME && presence.last_seen !== null && presence.last_seen >= stretchStart) home = true;
    else if (presence.state === AWAY && awayDecidedAt !== null && awayDecidedAt >= stretchStart) home = false;
    let visitors = null;
    if (home === true && calibrated && !guests.calibrating()) {
      const active = guests.visits.length > 0 && last(guests.visits).end === null;
      const extraNow = guests.nearby_unknown(now).length - guests.baseline >= guests.cfg.margin;
      if (active) visitors = Math.max(1, guests.current);
      else if (guests._cand_start === null && !extraNow && now - stretchStart >= guests.cfg.dwell_s) visitors = 0;
    }
    return { home, visitors_present: visitors };
  };

  // One line of ticks.jsonl, same fields as app.py log_tick, so tools/score.py reads it.
  const tickRow = (now, state, sig, bleN, guestsNow, events, truth = null) =>
    ({ t: now, state, sig, ble_n: bleN, guests: guestsNow, events, truth });

  const api = {
    HOME, AWAY, UNKNOWN, DAY, SCAN_INTERVAL_S, PROFILES,
    pyRound, localHour, localMidnight,
    presenceConfig, guestConfig, PresenceTracker, GuestTracker, classify, maker_name, applyProfile, tick,
    uuidPrefix, bleSighting, wifiSighting, homeWifiMatchesNeeded, isLanHost, hostOf, hubSighting,
    manufacturerFromHex, sessionContext, tickRow,
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root && root.A) root.A.PresenceCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
