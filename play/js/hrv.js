// Heart rate from a watch or a chest strap over Bluetooth (the standard Heart Rate Service, 180D / 2A37): the
// beat-to-beat intervals (RR) the device sends, cleaned of artifacts, RMSSD over a rolling window, and the signal
// quality the phone gives the device's pulse. Logic only: no Bluetooth, no drawing, no words.
// The native plugin (AfferentWatch) parses 2A37 and sends { bpm, contact, energy_kj, rr_ms, t_ms }; sensors.js keeps one
// track per connection and asks it for RMSSD and quality. Garmin watches in "Broadcast heart rate" mostly send no RR at
// all; Polar and Wahoo chest straps do. Without RR there is no RMSSD, never a made-up one.
(() => {
  const RR = { MIN_MS: 300, MAX_MS: 2000, DEV: 0.2, NEIGHBOURS: 5 };
  // RMSSD over the last 60 s (as the finger sensor's, vitals.hrv window_s 60), from at least 20 successive differences
  // over at least 30 s of clean beats. Less than that is "no reading yet", not a smaller number.
  const WINDOW_S = 60, MIN_DIFFS = 20, MIN_SPAN_MS = 30000;
  // The quality looks at the last 30 s of intervals. A notification more than 3 s after the one before means beats in
  // between were lost: no difference is taken across that gap.
  const QUALITY_S = 30, GAP_S = 3, MAX_BEATS = 400;
  // Quality, 0 to 1, the same scale and the same 0.3 limit as the finger sensor's:
  //   contact bit says no skin contact            0
  //   contact reported (bit 2 of the flags)        1    the device does not report contact      0.8
  //   times: share of the last 30 s of intervals that pass the artifact filter, or 0.75 when the device sends none
  // So a strap with clean RR and contact is 1, a watch that sends its pulse only, with contact, 0.75, and a device
  // whose intervals are half artifacts 0.5. Below 0.3 the pulse is not used, as for the finger sensor.
  const Q = { NO_CONTACT_BIT: 0.8, NO_RR: 0.75 };
  const BPM = [25, 240];

  const median = xs => { const s = [...xs].sort((a, b) => a - b), n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : null; };
  const inRange = rr => Number.isFinite(rr) && rr >= RR.MIN_MS && rr <= RR.MAX_MS;

  // Which intervals are beats: inside 300 to 2000 ms, and within 20 % of the median of the in-range intervals around
  // it (up to five on each side). A local median, so a pulse that climbs from 60 to 90 within the window is not taken
  // for artifacts. Returns one boolean per interval.
  const clean = rrs => {
    const idx = rrs.map((rr, i) => inRange(rr) ? i : -1).filter(i => i >= 0);
    const ok = rrs.map(() => false);
    idx.forEach((i, k) => {
      const near = idx.slice(Math.max(0, k - RR.NEIGHBOURS), k + RR.NEIGHBOURS + 1).map(j => rrs[j]), m = median(near);
      ok[i] = Math.abs(rrs[i] - m) <= RR.DEV * m;
    });
    return ok;
  };

  // RMSSD in ms of a run of intervals, or null when there are too few. chains[i] (optional) names the unbroken run an
  // interval belongs to; a difference is only taken between two clean intervals that follow each other in one run.
  const rmssd = (rrs, chains = null) => {
    const ok = clean(rrs), d = [];
    let span = 0;
    for (let i = 0; i < rrs.length; i++) {
      if (!ok[i]) continue;
      span += rrs[i];
      if (i > 0 && ok[i - 1] && (!chains || chains[i] === chains[i - 1])) d.push(rrs[i] - rrs[i - 1]);
    }
    if (d.length < MIN_DIFFS || span < MIN_SPAN_MS) return null;
    return Math.round(Math.sqrt(d.reduce((a, x) => a + x * x, 0) / d.length) * 10) / 10;
  };

  // The quality of the device's pulse right now. contact: true, false or null (not reported). share: the share of
  // clean intervals over the last 30 s, or null when the device sent none.
  const quality = (contact, share) => {
    if (contact === false) return 0;
    const c = contact === true ? 1 : Q.NO_CONTACT_BIT, t = Number.isFinite(share) ? share : Q.NO_RR;
    return Math.round(c * t * 100) / 100;
  };

  const plausible = bpm => Number.isFinite(bpm) && bpm >= BPM[0] && bpm <= BPM[1];

  // One per connection: the intervals of the last minute, each with the phone time it arrived (seconds, A.now()).
  const track = () => ({
    beats: [], chain: 0, lastAt: null,
    // rrMs: the intervals of one notification, oldest first, in ms. Called for every notification, also one without
    // intervals, so a silence is seen as a gap.
    push(rrMs, now) {
      if (this.lastAt != null && now - this.lastAt > GAP_S) this.chain++;
      this.lastAt = now;
      for (const rr of rrMs || []) if (Number.isFinite(rr) && rr > 0) this.beats.push({ rr, at: now, chain: this.chain });
      while (this.beats.length > MAX_BEATS || (this.beats.length && now - this.beats[0].at > WINDOW_S)) this.beats.shift();
    },
    within(now, s) { return this.beats.filter(b => now - b.at <= s); },
    // The share of clean intervals over the last 30 s, or null without any.
    share(now) {
      const w = this.within(now, QUALITY_S);
      if (!w.length) return null;
      const ok = clean(w.map(b => b.rr));
      return ok.filter(Boolean).length / w.length;
    },
    rmssd(now) {
      const w = this.within(now, WINDOW_S);
      return rmssd(w.map(b => b.rr), w.map(b => b.chain));
    },
    has(now) { return this.within(now, QUALITY_S).length > 0; },
  });

  A.HeartRate = { RR, WINDOW_S, MIN_DIFFS, MIN_SPAN_MS, QUALITY_S, GAP_S, Q, BPM, clean, rmssd, quality, plausible, track };
})();
