// Generated music that follows the body: the instruments and the beat clock. music.js decides when it plays (in the
// bed's place, while a real pulse is read) and sets its tempo through step(now, bpm); nothing here reads a sensor.
// Everything is in D, the key of the recorded beds, on the five notes D E G A B that the chimes, the stingers and the
// dawn phrase use as well, so no note of it can rub against them. Filtered sines and triangles with slow envelopes and
// the app's reverb impulse; every note starts and ends at silence, so nothing clicks.
(() => {
  const DB = d => Math.pow(10, d / 20);
  const hz = n => 146.83 * Math.pow(2, n / 12);
  const STEPS = [0, 2, 5, 7, 9];
  const deg = i => 12 * Math.floor(i / 5) + STEPS[((i % 5) + 5) % 5];
  const LOOK = 0.3, REL = 1.1, TAIL = 7;

  // Chords in semitones from D3: the bass note and the pad, all on D E G A B.
  const CHORDS = {
    I: { root: 0, bass: -12, pad: [0, 7, 12, 14] },
    IV: { root: 5, bass: -7, pad: [5, 9, 12, 14] },
    vi: { root: 2, bass: -10, pad: [2, 9, 12, 17] },
    V: { root: 7, bass: -5, pad: [7, 12, 14, 19] },
    Id: { root: 0, bass: null, pad: [-12, -5, 0, 14] },
    IVd: { root: 0, bass: null, pad: [-12, -7, 2, 9] },
  };

  // Stressed (calm): slow and low, a rocking pulse on the beat over a soft low root, a pad that opens over one bar and
  // closes over the next.
  // Energised (bright): an eighth-note arpeggio and a bass on the beat, brighter, not louder. Tired by day (lift): a rising
  // arpeggio and a pad that opens over the first minute. Tired at night (drone): three low notes, near silence.
  const VOICES = {
    calm: {
      db: 3, wet: 0.5, dip: -3, chords: ['I', 'IV', 'vi', 'V'], bars: 2,
      pad: { db: -27, lp: [800, 1900], attack: 3, bass: 1, air: 0.3 },
      pulse: { db: -22, lp: 1700, attack: 0.035, tau: 0.6, h2: 0.16, h3: 0.05, pattern: 'rock' },
      bass: { db: -21, lp: 320, attack: 0.06, tau: 0.9, h2: 0.25, wave: 'sine', half: true },
      melody: { db: -28, p: 0.5, lo: 6, hi: 11, attack: 0.1, tau: 1.4 },
    },
    bright: {
      db: 4.5, wet: 0.3, dip: -3, chords: ['I', 'V', 'vi', 'IV'], bars: 2,
      pad: { db: -30, lp: [1500, 2800], attack: 1.6, bass: 0.6, air: 0.3 },
      pulse: { db: -25, lp: 3600, attack: 0.008, tau: 0.34, h2: 0.2, h3: 0.05, pattern: 'arp' },
      bass: { db: -22, lp: 480, attack: 0.012, tau: 0.45, h2: 0.45 },
      melody: { db: -29, p: 0.35, lo: 9, hi: 14, attack: 0.03, tau: 0.9 },
    },
    lift: {
      db: 3, wet: 0.42, dip: -3, chords: ['I', 'vi', 'IV', 'V'], bars: 2, rise: 40,
      pad: { db: -28, lp: [1000, 2000], attack: 2.2, bass: 0.8, air: 0.3 },
      pulse: { db: -24, lp: 3800, attack: 0.012, tau: 0.6, h2: 0.16, h3: 0.04, pattern: 'rise' },
      bass: { db: -23, lp: 420, attack: 0.02, tau: 0.8, h2: 0.4, half: true },
      melody: { db: -28, p: 0.6, lo: 8, hi: 13, attack: 0.05, tau: 1.2, up: true },
    },
    drone: {
      db: -14.5, wet: 0.6, chords: ['Id', 'IVd'], bars: 4, swell: 0.3,
      pad: { db: -21, lp: [420, 650], attack: 6, bass: 0 },
    },
  };
  // At night everything is quieter and darker, with fewer high notes.
  const voice = (name, night) => {
    const v = VOICES[name] || VOICES.calm;
    if (!night || name === 'drone') return v;
    return { ...v, db: v.db - 3, dark: 0.8, melody: v.melody && { ...v.melody, p: v.melody.p / 2 } };
  };

  const hold = (p, t) => {
    if (p.cancelAndHoldAtTime) p.cancelAndHoldAtTime(t);
    else { p.cancelScheduledValues(t); p.setValueAtTime(p.value, t); }
  };
  const ease = (p, v, t, tau) => { hold(p, t); p.setTargetAtTime(v, t, tau); };

  // One playing piece. o: out (the node it plays into), at (its first beat), bpm, voice, night, seed.
  const create = (ctx, o) => {
    const rnd = A.rng ? A.rng(o.seed ?? 7) : Math.random;
    const g = v => { const n = ctx.createGain(); n.gain.value = v; return n; };
    const lp = f => { const n = ctx.createBiquadFilter(); n.type = 'lowpass'; n.frequency.value = f; n.Q.value = 0.5; return n; };
    const pan = (bus, x) => { const n = ctx.createStereoPanner(); n.pan.value = x; n.connect(bus); return n; };
    const vox = g(1), send = g(0), padBus = g(1), padLP = lp(800), padAmp = g(1), pluckLP = lp(1500), bassLP = lp(500);
    // A gentle dip where the low pulse and the pad pile up (about 280 Hz), so it does not sound boxy next to the beds.
    const dip = ctx.createBiquadFilter();
    dip.type = 'peaking'; dip.frequency.value = 280; dip.Q.value = 0.8; dip.gain.value = 0;
    padBus.connect(padLP); padLP.connect(padAmp); padAmp.connect(vox);
    pluckLP.connect(vox); bassLP.connect(vox);
    const padL = pan(padBus, -0.3), padR = pan(padBus, 0.3);
    vox.connect(dip); dip.connect(o.out);
    const verb = A.Audio?.makeReverb?.call({ ctx });
    if (verb) { dip.connect(send); send.connect(verb); verb.connect(o.out); }

    const S = {
      bpm: o.bpm, next: o.at, k: 0, t0: o.at, beats: [], srcs: [], pad: [], name: null, v: null, want: o.voice, night: !!o.night,
      chordBar: -99, chordIdx: -1, chord: null, mel: null, voiceAt: o.at, until: null, cut: false, breath: false, reduced: false, notes: 0,
    };

    const done = (os, at) => { os._end = at; S.srcs.push(os); };
    const prune = now => {
      const keep = S.srcs.filter(os => os._end == null || os._end > now);
      S.srcs.length = 0; S.srcs.push(...keep);
    };
    const stopAt = t => S.until == null ? t : Math.min(t, S.until + 0.1);

    // A plucked or sung note: rises from silence over `attack`, falls back to silence with time constant `tau`.
    const note = (t, n, vel, p, bus, x = 0) => {
      if (vel <= 0) return;
      const env = g(0), end = stopAt(t + p.attack + TAIL * p.tau);
      if (end <= t) return;
      env.gain.setValueAtTime(0, t);
      env.gain.linearRampToValueAtTime(vel, t + p.attack);
      env.gain.setTargetAtTime(0, t + p.attack, p.tau);
      const parts = [[p.wave || 'triangle', 1, 1]];
      if (p.h2) parts.push(['sine', 2, p.h2]);
      if (p.h3) parts.push(['sine', 3, p.h3]);
      let first = null;
      for (const [type, mul, amt] of parts) {
        const os = ctx.createOscillator();
        os.type = type; os.frequency.value = hz(n) * mul;
        if (amt === 1) os.connect(env); else { const a = g(amt); os.connect(a); a.connect(env); }
        os.start(t); os.stop(end);
        first ||= os;
      }
      const tail = x && !S.reduced ? pan(bus, x) : bus;
      env.connect(tail);
      first.onended = () => { try { env.disconnect(); if (tail !== bus) tail.disconnect(); } catch {} };
      S.notes++;
    };

    // The pad: each chord fades in over `attack` while the one before it fades out under it. Every tone is a triangle a
    // little left and a sine a little right, six cents apart, so the two beat slowly against each other; the upper
    // tones also have a soft sine an octave up (air), so the pad is not dull next to the recorded beds.
    const chordOn = (t, name, L) => {
      const v = S.v, c = CHORDS[name];
      for (const x of S.pad) {
        const end = stopAt(t + TAIL * REL);
        x.envs.forEach(e => ease(e.gain, 0, t, REL));
        x.oscs.forEach(os => { os.stop(end); os._end = end; });
      }
      S.pad = [];
      S.chord = c;
      const tones = [...(c.bass != null && v.pad.bass ? [[c.bass, v.pad.bass]] : []), ...c.pad.map(n => [n, n > 14 ? 0.7 : 1])];
      const attack = Math.max(v.pad.attack, 2 * L), end = S.until != null ? S.until + 0.1 : null;
      for (const [n, w] of tones) {
        const x = { envs: [], oscs: [] };
        for (const [type, det, side] of [['triangle', -6, padL], ['sine', 6, padR]]) {
          const os = ctx.createOscillator(), env = g(0);
          os.type = type; os.frequency.value = hz(n); os.detune.value = det;
          env.gain.setValueAtTime(0, t);
          env.gain.linearRampToValueAtTime(DB(v.pad.db) * w, t + attack);
          os.connect(env); env.connect(side);
          os.start(t);
          if (end != null) os.stop(end);
          os.onended = () => { try { env.disconnect(); } catch {} };
          done(os, end);
          x.envs.push(env); x.oscs.push(os);
        }
        if (v.pad.air && n >= 12) {
          const os = ctx.createOscillator(), env = g(0);
          os.type = 'sine'; os.frequency.value = hz(n + 12);
          env.gain.setValueAtTime(0, t);
          env.gain.linearRampToValueAtTime(DB(v.pad.db) * w * v.pad.air, t + attack);
          os.connect(env); env.connect(padBus);
          os.start(t);
          if (end != null) os.stop(end);
          os.onended = () => { try { env.disconnect(); } catch {} };
          done(os, end);
          x.envs.push(env); x.oscs.push(os);
        }
        S.pad.push(x);
      }
    };

    const setVoice = (t, name) => {
      const v = S.v = voice(name, S.night);
      S.name = name; S.voiceAt = t;
      const dark = v.dark || 1;
      ease(vox.gain, DB(v.db), t, 1.5);
      ease(send.gain, v.wet, t, 1.5);
      ease(dip.gain, v.dip ?? 0, t, 1.5);
      if (v.pulse) ease(pluckLP.frequency, v.pulse.lp * dark, t, 1);
      if (v.bass) ease(bassLP.frequency, v.bass.lp, t, 1);
      S.chordBar = -99;
      if (S.mel == null && v.melody) S.mel = Math.round((v.melody.lo + v.melody.hi) / 2);
    };

    // The pad opens over one bar and closes over the next: a slow breath tied to the tempo. Flat during the
    // breathing task, which has its own guide; shallower with reduced motion.
    const swell = (t, bar, L) => {
      const v = S.v, [lo, hi] = v.pad.lp, depth = S.breath ? 0 : S.reduced ? 0.4 : 1;
      const r = v.rise ? 1 + 0.6 * (1 - Math.exp(-(t - S.voiceAt) / v.rise)) : 1;
      const mid = (lo + hi) / 2 * r * (v.dark || 1), half = (hi - lo) / 2 * r * depth, up = bar % 2 === 0;
      ease(padLP.frequency, mid + (up ? half : -half), t, (up ? 1.2 : 1.8) * L);
      if (v.swell) ease(padAmp.gain, up ? 1 : 1 - v.swell * depth, t, 2 * L);
    };

    const melody = (t, L) => {
      const m = S.v.melody;
      if (!m || rnd() >= m.p) return;
      const moves = m.up ? [1, 1, 2, -1] : [-2, -1, 1, 2];
      let i = S.mel + moves[Math.floor(rnd() * moves.length)];
      if (i > m.hi) i = m.up ? m.lo : m.hi - 1;
      if (i < m.lo) i = m.lo + 1;
      S.mel = i;
      note(t, deg(i), DB(m.db) * (0.85 + 0.3 * rnd()), { attack: m.attack, tau: m.tau, wave: 'sine', h2: 0.08 }, pluckLP, (rnd() - 0.5) * 0.5);
      if (rnd() < m.p / 2) note(t + 2 * L, deg(i + (rnd() < 0.5 ? -1 : 1)), DB(m.db - 3), { attack: m.attack, tau: m.tau, wave: 'sine', h2: 0.08 }, pluckLP, (rnd() - 0.5) * 0.5);
    };

    const beat = (t, k, L) => {
      const b = k % 4, bar = Math.floor(k / 4);
      if (b === 0) {
        if (S.want !== S.name) setVoice(t, S.want);
        const v = S.v;
        if (bar - S.chordBar >= v.bars) {
          S.chordBar = bar;
          S.chordIdx = (S.chordIdx + 1) % v.chords.length;
          chordOn(t, v.chords[S.chordIdx], L);
        }
        swell(t, bar, L);
        if (bar % 2 === 0) melody(t, L);
      }
      const v = S.v, c = S.chord, p = v.pulse, hum = () => 0.92 + 0.16 * rnd();
      if (p) {
        const tones = [...c.pad].sort((a, z) => a - z).map(n => n + 12), pp = { ...p, tau: p.tau * L };
        if (p.pattern === 'rock') note(t, c.root + [0, 7, 12, 7][b], DB(p.db) * [1, 0.55, 0.8, 0.55][b] * hum(), pp, pluckLP, [-0.12, 0.12, -0.12, 0.12][b]);
        if (p.pattern === 'rise') note(t, tones[b], DB(p.db) * [0.9, 0.72, 0.8, 0.88][b] * hum(), pp, pluckLP, (rnd() - 0.5) * 0.6);
        if (p.pattern === 'arp') {
          const order = [0, 1, 2, 3, 2, 1, 2, 3];
          for (const e of S.reduced ? [0] : [0, 1]) {
            note(t + e * L / 2, tones[order[b * 2 + e]], DB(p.db) * (e ? 0.6 : b === 0 ? 1.1 : 1) * hum(), pp, pluckLP, (rnd() - 0.5) * 0.7);
          }
        }
      }
      const bs = v.bass;
      if (bs && c.bass != null && (!bs.half || b % 2 === 0)) {
        note(t, c.bass, DB(bs.db) * [1, 0.5, 0.78, 0.5][b] * hum(), { ...bs, tau: bs.tau * L }, bassLP);
      }
    };

    return {
      srcs: S.srcs, S,
      get bpm() { return S.bpm; },
      get t0() { return S.t0; },
      get voice() { return S.want; },
      get notes() { return S.notes; },
      get beats() { return S.beats.map(x => x.t); },
      // The voice changes on the next bar; the tempo carries on.
      setVoice(name) { if (VOICES[name]) S.want = name; },
      // Schedules the beats of the next LOOK seconds at `bpm`. until: no note after it (the bed has faded out by then).
      step(now, bpm, opt = {}) {
        if (Number.isFinite(bpm) && bpm > 0) S.bpm = bpm;
        S.breath = !!opt.breath; S.reduced = !!opt.reduced;
        if (opt.until != null && S.until == null) {
          S.until = opt.until;
          for (const x of S.pad) for (const os of x.oscs) { os.stop(S.until + 0.1); os._end = S.until + 0.1; }
        }
        const L = 60 / S.bpm;
        if (S.next < now - 0.02) { const skip = Math.ceil((now - S.next) / L); S.next += skip * L; S.k += skip; }
        while (S.next < now + LOOK && (S.until == null || S.next < S.until)) {
          beat(S.next, S.k, L);
          S.beats.push({ t: S.next, k: S.k });
          if (S.beats.length > 32) S.beats.shift();
          S.next += L; S.k++;
        }
        prune(now);
      },
      nextBeat(t) {
        const x = S.beats.find(x => x.t >= t - 1e-6);
        if (x) return x.t;
        const L = 60 / S.bpm;
        return S.next >= t ? S.next : S.next + Math.ceil((t - S.next) / L - 1e-6) * L;
      },
      nextBar(t) {
        const x = S.beats.find(x => x.t >= t - 1e-6 && x.k % 4 === 0);
        if (x) return x.t;
        const L = 60 / S.bpm;
        let b = S.next, k = S.k;
        if (b < t) { const n = Math.ceil((t - b) / L - 1e-6); b += n * L; k += n; }
        while (k % 4) { b += L; k++; }
        return b;
      },
    };
  };

  A.BioSynth = { VOICES, CHORDS, STEPS, create };
})();
