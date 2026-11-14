(() => {
  const D = [146.83, 164.81, 185.0, 220.0, 246.94, 293.66, 329.63, 369.99, 440.0, 493.88, 587.33];

  const Au = A.Audio = {
    ctx: null, master: null, lp: null, on: true, voices: {}, nextBeat: 0, beat: 0,

    init() {
      if (this.ctx) return;
      const ctx = this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = ctx.createGain();
      this.master.gain.value = 0;
      this.lp = ctx.createBiquadFilter();
      this.lp.type = 'lowpass'; this.lp.frequency.value = 12000;
      this.verb = this.makeReverb();
      const wet = ctx.createGain(); wet.gain.value = 0.35;
      this.bus = ctx.createGain();
      this.bus.connect(this.lp);
      this.bus.connect(this.verb); this.verb.connect(wet); wet.connect(this.lp);
      this.lp.connect(this.master); this.master.connect(ctx.destination);
    },

    makeReverb() {
      const ctx = this.ctx, len = ctx.sampleRate * 3, buf = ctx.createBuffer(2, len, ctx.sampleRate);
      for (let c = 0; c < 2; c++) {
        const d = buf.getChannelData(c);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
      }
      const conv = ctx.createConvolver(); conv.buffer = buf; return conv;
    },

    start(level = 0.25) {
      this.init();
      this.ctx.resume();
      const g = this.master.gain, t = this.ctx.currentTime;
      g.cancelScheduledValues(t); g.setValueAtTime(0, t);
      g.linearRampToValueAtTime(this.on ? level : 0, t + 3);
      this.voices = {}; this.nextBeat = t + 0.5; this.beat = 0;
    },

    fadeOut(sec = 2) {
      if (!this.ctx) return;
      const g = this.master.gain, t = this.ctx.currentTime;
      g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(0, t + sec);
      this.pad(false);
      this.crackle(false);
    },

    tone(freq, dur, vel, type = 'sine', when = 0) {
      if (!Number.isFinite(freq) || !this.ctx) return;
      const ctx = this.ctx, t = ctx.currentTime + when;
      const o = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain();
      o.type = type; o.frequency.value = freq;
      o2.type = 'sine'; o2.frequency.value = freq * 2.001;
      const g2 = ctx.createGain(); g2.gain.value = 0.18;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(vel, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
      o.connect(g); o2.connect(g2); g2.connect(g); g.connect(this.bus);
      o.start(t); o2.start(t); o.stop(t + dur + 0.05); o2.stop(t + dur + 0.05);
    },

    piano(i, vel = 0.22, when = 0) { this.tone(D[(i + D.length) % D.length], 2.6, vel, 'triangle', when); },

    bell() {
      if (!this.ctx) return;
      [880, 1318.5, 1760].forEach((f, k) => this.tone(f * 0.5, 1.8 - k * 0.4, 0.06 / (k + 1), 'sine'));
    },

    cello(on) {
      if (!this.ctx || !!this.voices.cello === on) return;
      if (!on) { this.voices.cello.stop(); delete this.voices.cello; return; }
      this.voices.cello = this.drone([73.42, 110.0], 0.05, 380);
    },

    pad(on) {
      if (!this.ctx || !!this.voices.pad === on) return;
      if (!on) { this.voices.pad.stop(); delete this.voices.pad; return; }
      this.voices.pad = this.drone([146.83, 220.0, 293.66, 369.99], 0.0, 900);
    },

    padLevel(x) { this.voices.pad?.level(0.015 + 0.05 * x); },

    drone(freqs, level, cutoff) {
      const ctx = this.ctx, g = ctx.createGain(), f = ctx.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = cutoff;
      g.gain.value = 0;
      g.gain.setTargetAtTime(level || 0.02, ctx.currentTime, 1.2);
      const os = freqs.flatMap(fr => [-4, 4].map(det => {
        const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = fr; o.detune.value = det;
        o.connect(f); o.start(); return o;
      }));
      f.connect(g); g.connect(this.bus);
      return {
        level: v => g.gain.setTargetAtTime(v, ctx.currentTime, 0.5),
        stop: () => { g.gain.setTargetAtTime(0, ctx.currentTime, 0.8); os.forEach(o => o.stop(ctx.currentTime + 4)); },
      };
    },

    crackle(on) {
      if (!this.ctx) return;
      clearInterval(this.crackleTimer);
      if (!on) return;
      this.crackleTimer = setInterval(() => {
        if (Math.random() > 0.35) return;
        const ctx = this.ctx, len = ctx.sampleRate * 0.03, buf = ctx.createBuffer(1, len, ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
        const s = ctx.createBufferSource(), g = ctx.createGain(), f = ctx.createBiquadFilter();
        f.type = 'highpass'; f.frequency.value = 1800; g.gain.value = 0.05 * Math.random();
        s.buffer = buf; s.connect(f); f.connect(g); g.connect(this.bus); s.start();
      }, 90);
    },

    dawnPhrase() {
      if (!this.ctx) return;
      [5, 7, 8, 10, 9, 7, 8, 5].forEach((n, k) => this.piano(n, 0.2, k * 0.32));
      [0, 3, 5].forEach(n => this.piano(n, 0.12, 0));
      [2, 4, 7].forEach(n => this.piano(n, 0.12, 1.3));
    },

    tick(tempo, density, arps) {
      if (!this.ctx || !this.on) return;
      const t = this.ctx.currentTime;
      if (t < this.nextBeat) return;
      this.nextBeat = t + 60 / tempo;
      this.beat++;
      if (Math.random() < density) {
        const n = 5 + Math.floor(Math.random() * 5);
        this.piano(n, 0.16);
        if (arps && Math.random() < 0.6) this.piano(n + 2, 0.1, 60 / tempo / 2);
      }
      if (this.beat % 8 === 0) this.piano(Math.random() < 0.5 ? 0 : 3, 0.12);
    },
  };
})();
