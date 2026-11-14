// Measured breathing next to the breathing guide (Decisions I53). Logic only: no drawing and no words.
// The rate is derived on the finger sensor from the heart rhythm, so it follows the breathing by tens of seconds:
// it can describe a pace, never a single breath. A simulated frame never counts here.
(() => {
  const { clamp } = A;
  const MIN_QUALITY = 0.3, NEAR_BAND = 1, FAR_SPAN = 6, MIN_S = 5, MIN_SHARE = 1 / 3;
  const pos = x => Number.isFinite(x) && x > 0 ? x : null;

  // What the finger clips give right now, read from a frame of A.Sensors.fingerFrame, which already drops every
  // value whose notification is older than 3 s. null means no real reading: no sensor, stale, simulated, no finger
  // in the clip, a signal the sensor itself calls unreliable, or zeros only.
  const reading = f => {
    if (!f || f.source !== 'finger_ppg' || f.simulated) return null;
    if (f.presence != null && f.presence !== 'active') return null;
    if (f.quality_reported && f.quality != null && f.quality < MIN_QUALITY) return null;
    const rate = pos(f.breathing_per_min), pulse = pos(f.pulse_bpm);
    return rate == null && pulse == null ? null : { rate, pulse };
  };

  // 1 when the measured pace is within one breath a minute of the guide, 0 when it is seven or more away.
  const closeness = (rate, guide) => pos(rate) == null || pos(guide) == null ? null
    : 1 - clamp((Math.abs(rate - guide) - NEAR_BAND) / FAR_SPAN, 0, 1);

  // A result is only stated when readings covered a meaningful part of the task.
  const enough = (samples, seconds) => samples >= MIN_S && samples >= seconds * MIN_SHARE;

  // One per breathing task. frame() runs every game frame: the live state follows the frame at once, the samples
  // for the average are taken once a second.
  const track = guide => ({
    guide, next: null, seconds: 0, rates: [], pulses: [], live: null,
    frame(now, f) {
      const r = this.live = reading(f);
      if (this.next != null && now < this.next) return;
      this.next = this.next == null || now - this.next >= 1 ? now + 1 : this.next + 1;
      this.seconds++; this.rates.push(r?.rate ?? null); this.pulses.push(r?.pulse ?? null);
    },
    // null: say nothing. measuring: the clips read a pulse but have no breathing rate yet. reading: a current rate.
    view() {
      const r = this.live;
      return r ? { state: r.rate == null ? 'measuring' : 'reading', rate: r.rate, guide: this.guide, near: closeness(r.rate, this.guide) } : null;
    },
    result() {
      if (!enough(this.rates.filter(x => x != null).length, this.seconds)) return null;
      const stat = A.Record.stat;
      return { source: 'finger_ppg', method: 'pulse_rhythm', guide_per_min: this.guide, seconds: this.seconds, rate_per_min: stat(this.rates), pulse_bpm: stat(this.pulses) };
    },
  });

  A.Breathing = { reading, closeness, enough, track };
})();
