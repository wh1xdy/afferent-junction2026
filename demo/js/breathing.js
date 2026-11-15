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
  // real(f) is that rule on its own, for the other numbers of the frame (the game's HRV, engine.js). A frame of a watch
  // or chest strap (watch_ble, A.Sensors.physioFrame) passes the same rule; it has no presence and no breathing rate.
  const MEASURED = ['finger_ppg', 'watch_ble'];
  const real = f => !!f && MEASURED.includes(f.source) && !f.simulated && (f.presence == null || f.presence === 'active')
    && !!f.quality_reported && f.quality != null && f.quality >= MIN_QUALITY && !(f.transport === 'hub_http' && f.age_s >= FRESH_S);
  const reading = f => {
    if (!real(f)) return null;
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
  // The same for the game's HRV (engine.js): the clips first, a watch or strap when the clips give no pulse.
  const physio = now => A.Sensors.pulseMode === 'simulated' ? null : A.Sensors.physioFrame(now);

  // ── The clearer of two breathing rates: the finger clips (heart rhythm) and the phone camera (head motion) ──
  // Each source gets a clarity from 0 to 1 and has to reach 0.3, the bar the finger clips already use:
  //  - finger: a rate through the gate above (reading), clarity = the frame's signal quality;
  //  - camera: the face measures' last second (A.Sensors.faceLog), at most 3 s old, a tracked face, a rate the native
  //    side sent (it sends one only above 3 dB, steady for 8 s; FaceTuning.swift), clarity = its breathing_snr in dB / 10,
  //    capped at 1. So 3 dB is 0.3, the camera's own bar meets the finger's, and 10 dB or more is 1.
  // The higher clarity is shown; a tie goes to the finger (the reference app always took the finger first,
  // ios/Afferent/Breathing.swift clearestBreathing). Once a source is shown it stays until the other is clearer by more
  // than 0.1 or has no reading, so two close sources do not swap every second. Nothing simulated is ever a candidate:
  // the finger gate refuses simulated frames, and the camera rate only ever comes from the phone.
  // Display only (the breathing task's line and ring, the calm glow, Your signals): the recorded task result stays the
  // finger's (contracts/session.v3.schema.json allows only finger_ppg in tasks[].extra.breathing).
  const CAMERA = 'arkit_truedepth', CAM_DB = 10, SWITCH_MARGIN = 0.1;
  const fingerCandidate = f => {
    const r = reading(f);
    return r?.rate != null ? { rate: r.rate, clarity: clamp(f.quality, 0, 1), source: f.source } : null;
  };
  const cameraCandidate = now => {
    const S = A.Sensors;
    if (!S?.faceOn?.()) return null;
    const last = S.faceLog?.[S.faceLog.length - 1];
    if (!last || !last.tracked || !(now - last.at < FRESH_S)) return null;
    const rate = pos(last.breathing_per_min), snr = last.breathing_snr;
    if (rate == null || !Number.isFinite(snr)) return null;
    const clarity = clamp(snr / CAM_DB, 0, 1);
    return clarity >= MIN_QUALITY ? { rate, clarity, source: CAMERA } : null;
  };
  // A picker that remembers which source it showed last. pick(finger, camera) -> { rate, source, clarity, other } | null,
  // other: the source that also had a reading and lost, or null.
  const chooser = () => {
    let shown = null;
    return (finger, camera) => {
      let win = finger || camera;
      if (finger && camera) {
        const lead = finger.clarity - camera.clarity;
        if (shown === CAMERA) win = lead > SWITCH_MARGIN ? finger : camera;
        else if (shown != null) win = -lead > SWITCH_MARGIN ? camera : finger;
        else win = lead >= 0 ? finger : camera;
      }
      shown = win ? (win === camera ? CAMERA : 'finger') : null;
      if (!win) return null;
      const lost = win === finger ? camera : finger;
      return { rate: win.rate, source: win.source, clarity: win.clarity, other: lost ? lost.source : null };
    };
  };
  const shared = chooser();
  // The clearer rate right now, for display. f: the finger frame to judge (default the one the live screens read).
  const clearest = (now, f = A.Sensors.fingerFrame(now)) => shared(fingerCandidate(f), cameraCandidate(now));
  // Inside a session: a session locked to the simulator takes neither source.
  const clearestInSession = (now, f) => A.Sensors.pulseMode === 'simulated' ? shared(null, null) : shared(fingerCandidate(f), cameraCandidate(now));

  // One per breathing task. tick() runs every game frame while the task is live: the live state follows the frame
  // at once, the samples for the average are taken once a second, the ring settles slowly.
  // The live state shows the clearer of the clips and the camera (clearestInSession); the samples for the average are the
  // clips' only. frame(now, f) without a camera argument judges the clips alone.
  const track = guide => ({
    guide, next: null, seconds: 0, rates: [], pulses: [], live: null, shownRate: null, ring: { a: 0, near: null, solid: false },
    tick(now, dt) { this.frame(now, current(now), dt, true); },
    frame(now, f, dt = 0, camera = false) {
      const r = this.live = reading(f);
      this.shownRate = camera ? clearestInSession(now, f) : fingerCandidate(f);
      this.settle(dt);
      if (this.next != null && now < this.next) return;
      this.next = this.next == null || now - this.next >= 1 ? now + 1 : this.next + 1;
      this.seconds++; this.rates.push(r?.rate ?? null); this.pulses.push(r?.pulse ?? null);
    },
    // null: no real reading. measuring: the clips read a pulse but have no breathing rate yet. reading: a current rate.
    // source: whose rate it is ('finger_ppg' or 'arkit_truedepth'); while measuring, the clips.
    view() {
      const r = this.live, c = this.shownRate;
      if (c) return { state: 'reading', rate: c.rate, guide: this.guide, near: closeness(c.rate, this.guide), source: c.source };
      return r ? { state: 'measuring', rate: null, guide: this.guide, near: null, source: 'finger_ppg' } : null;
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

  A.Breathing = {
    WINDOW_S, real, reading, current, physio, closeness, enough, ends, track,
    CAMERA, CAM_DB, SWITCH_MARGIN, fingerCandidate, cameraCandidate, chooser, clearest, clearestInSession,
  };
})();
