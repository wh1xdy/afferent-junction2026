// Measured breathing next to the breathing guide. Logic only: no drawing and no words.
// The finger sensor derives the rate from the heart rhythm of its last 40 s (uno-q/modulino-hub/app.py, rsa_breathing),
// so a value describes that window and runs behind the breathing: a pace, never a single breath.
// A simulated frame never counts here.
(() => {
  const { clamp, ema } = A;
  const MIN_QUALITY = 0.3, FRESH_S = 3, WINDOW_S = 40, NEAR_BAND = 1, FAR_SPAN = 6, MIN_S = 5, MIN_SHARE = 1 / 3, EDGE_S = 3;
  const pos = x => Number.isFinite(x) && x > 0 ? x : null;

  // What the finger clips give right now, read from a frame of A.Sensors.fingerFrame, which already drops every
  // value whose notification is older than 3 s. null means no real reading: no sensor, stale, simulated, no finger
  // in the clip, zeros only, or a signal quality that is below 0.3 or not reported (the rule of the game pulse).
  // Over the hub the frame also says how old the heartbeats behind it are; older than 3 s is not a current reading.
  const reading = f => {
    if (!f || f.source !== 'finger_ppg' || f.simulated) return null;
    if (f.presence != null && f.presence !== 'active') return null;
    if (!f.quality_reported || f.quality == null || f.quality < MIN_QUALITY) return null;
    if (f.transport === 'hub_http' && f.age_s >= FRESH_S) return null;
    const rate = pos(f.breathing_per_min), pulse = pos(f.pulse_bpm);
    return rate == null && pulse == null ? null : { rate, pulse };
  };

  // 1 when the measured pace is within one breath a minute of the guide, 0 when it is seven or more away.
  const closeness = (rate, guide) => pos(rate) == null || pos(guide) == null ? null
    : 1 - clamp((Math.abs(rate - guide) - NEAR_BAND) / FAR_SPAN, 0, 1);

  // A result is only stated when readings covered a meaningful part of the task.
  const enough = (samples, seconds) => samples >= MIN_S && samples >= seconds * MIN_SHARE;

  // The pulse at the start and at the end of a task, from its 1 Hz samples: the first reading within the first 3 s
  // and the last one within the last 3 s. null where there was none, so a late first sample or an early last one is
  // never taken for the start or the end.
  const ends = pulses => {
    const n = pulses.length, r1 = A.Record.r1, has = x => x != null;
    return { start: r1(pulses.slice(0, EDGE_S).find(has)), end: r1(pulses.slice(Math.max(EDGE_S, n - EDGE_S)).reverse().find(has)) };
  };

  // The finger frame a session may use. A session whose pulse is locked to the simulator stays simulated to its
  // end, so real breathing is not mixed into it.
  const current = now => A.Sensors.pulseMode === 'simulated' ? null : A.Sensors.fingerFrame(now);

  // One per breathing task. tick() runs every game frame while the task is live: the live state follows the frame
  // at once, the samples for the average are taken once a second, the ring settles slowly.
  const track = guide => ({
    guide, next: null, seconds: 0, rates: [], pulses: [], live: null, ring: { a: 0, near: null, solid: false },
    tick(now, dt) { this.frame(now, current(now), dt); },
    frame(now, f, dt = 0) {
      const r = this.live = reading(f);
      this.settle(dt);
      if (this.next != null && now < this.next) return;
      this.next = this.next == null || now - this.next >= 1 ? now + 1 : this.next + 1;
      this.seconds++; this.rates.push(r?.rate ?? null); this.pulses.push(r?.pulse ?? null);
    },
    // null: no real reading. measuring: the clips read a pulse but have no breathing rate yet. reading: a current rate.
    view() {
      const r = this.live;
      return r ? { state: r.rate == null ? 'measuring' : 'reading', rate: r.rate, guide: this.guide, near: closeness(r.rate, this.guide) } : null;
    },
    // What the task may draw and say. A current rate shows unless the setting "Breathing pace" is off; the wait for
    // a first rate only shows where body numbers are asked for during play (Developer, "Signals during play").
    shown() {
      const v = this.view();
      return v && A.config?.breathFeedback !== false && (v.state === 'reading' || !!A.config?.signalsOverlay) ? v : null;
    },
    settle(dt) {
      const v = this.shown(), g = this.ring;
      g.a = ema(g.a, v ? 1 : 0, dt, 0.8);
      if (!v) return;
      g.solid = v.state === 'reading';
      if (v.near != null) g.near = g.near == null ? v.near : ema(g.near, v.near, dt, 3);
    },
    result() {
      if (!enough(this.rates.filter(x => x != null).length, this.seconds)) return null;
      const stat = A.Record.stat, pulse = ends(this.pulses);
      return {
        source: 'finger_ppg', method: 'pulse_rhythm', guide_per_min: this.guide, seconds: this.seconds, rate_per_min: stat(this.rates),
        pulse_bpm: stat(this.pulses), pulse_start_bpm: pulse.start, pulse_end_bpm: pulse.end,
      };
    },
  });

  A.Breathing = { WINDOW_S, reading, current, closeness, enough, ends, track };
})();
