(() => {
  const Au = A.Audio;
  const DB = d => Math.pow(10, d / 20);
  const R = Math.random;
  const TEMPO = { kaamos: [70, 4], calm: [54, 3], flow: [100, 4], wake: [76, 4], fatigue: [84, 4], rest: [50, 4], dawn: [90, 4] };
  const BEAT_MODES = new Set(['flow', 'wake', 'fatigue']);
  const CORE = new Set(['fadein', 'rest', 'checkin', 'rt']);
  const LIGHT = [5500, 7500, 9500, 11000], DAWN_LIGHT = 16000;
  const COLOUR_FADE = { calm: 3.5, wake: 1.8 };
  const COLOUR_POS = { yellow: [-15, -10, 1], blue: [0, 20, 3], green: [60, 0, 2.5] };
  const COLOUR_DB = { yellow: -8, blue: -11, green: -9 };
  const ANSWER_STINGER = { wake: 'st_clear', fatigue: 'countin' };
  const MAX_HRTF = 6, STINGER_BUDGET = 4, MIN_GAP = 8;
  const ROUTE_KEY = 'afferent.audio.route';
  const safe = f => (...a) => { try { return f(...a); } catch (e) { console.warn('music', e); } };

  const hold = (p, t) => {
    if (p.cancelAndHoldAtTime) p.cancelAndHoldAtTime(t);
    else { const v = p.value; p.cancelScheduledValues(t); p.setValueAtTime(v, t); }
  };
  const glide = (p, v, sec, t) => { hold(p, t); p.linearRampToValueAtTime(v, t + Math.max(0.02, sec)); };
  const ease = (p, v, tau, t) => { hold(p, t); p.setTargetAtTime(v, t, Math.max(0.005, tau)); };
  const eq = (up, n = 32) => Float32Array.from({ length: n }, (_, i) => up ? Math.sin(i / (n - 1) * Math.PI / 2) : Math.cos(i / (n - 1) * Math.PI / 2));

  const M = A.Music = {
    ctx: null, bus: {}, tracks: {}, buf: {}, missing: [], ready: false, manifest: null,
    route: 'speaker', latency: 0, hrtfUsed: 0, routeFns: [],
    s: null, bed: null, want: null, gen: 0, colours: {}, pending: null, lastSwap: -99, swayAt: 0,

    init() {
      if (this.ctx) return this.ctx;
      Au.init();
      const ctx = this.ctx = Au.ctx;
      const g = v => { const n = ctx.createGain(); n.gain.value = v; return n; };
      const f = (type, freq, q, gain) => { const n = ctx.createBiquadFilter(); n.type = type; n.frequency.value = freq; if (q != null) n.Q.value = q; if (gain != null) n.gain.value = gain; return n; };
      const b = this.bus;
      b.beds = g(1); b.fb = g(1); b.colour = g(1); b.stinger = g(1);
      b.musicHP = f('highpass', 20, 0.7); b.music = g(1);
      b.ambience = g(DB(-6)); b.ambDuck = g(1);
      b.sfx = g(1);
      b.mix = g(1); b.curve = g(0);
      b.light = f('lowpass', LIGHT[0], 0.5);
      b.shelf = f('highshelf', 7000, null, -4);
      const L = b.limiter = ctx.createDynamicsCompressor();
      L.threshold.value = -12; L.knee.value = 12; L.ratio.value = 4; L.attack.value = 0.01; L.release.value = 0.25;
      b.out = g(1);
      b.beds.connect(b.fb); b.fb.connect(b.musicHP);
      b.colour.connect(b.musicHP); b.stinger.connect(b.musicHP);
      b.musicHP.connect(b.music); b.music.connect(b.mix);
      b.ambience.connect(b.ambDuck); b.ambDuck.connect(b.mix);
      b.sfx.connect(b.mix);
      b.mix.connect(b.curve); b.curve.connect(b.light); b.light.connect(b.shelf);
      b.shelf.connect(L); L.connect(b.out); b.out.connect(ctx.destination);
      try { Au.master.disconnect(); } catch {}
      Au.master.connect(b.sfx);
      let saved = null;
      try { saved = localStorage.getItem(ROUTE_KEY); } catch {}
      this.setRoute(saved === 'headphones' ? 'headphones' : 'speaker', undefined, true);
      this.native();
      return ctx;
    },

    native() {
      const P = window.Capacitor?.Plugins?.AudioRoute;
      if (!P) return;
      const use = safe(r => { if (r?.kind) this.setRoute(r.kind, r.latency, true); });
      P.current?.().then(use).catch(() => {});
      P.addListener?.('change', use);
    },

    load() {
      if (this.loading || Au.on === false) return this.loading;
      this.init();
      this.listed = (async () => {
        let man = null;
        try {
          const r = await fetch('audio/music/manifest.json', { cache: 'no-cache' });
          if (r.ok) man = await r.json();
        } catch {}
        this.manifest = man;
        this.tracks = man?.tracks || {};
        this.ready = true;
      })();
      this.loading = this.listed.then(async () => {
        const lowMem = (navigator.deviceMemory || 8) <= 2;
        const want = Object.keys(this.tracks).filter(k => {
          const t = this.tracks[k];
          if (lowMem && t.layer && t.layer !== 'pad') return false;
          return t.mode === 'kaamos' || t.mode === 'flow' || t.role === 'colour' || t.role === 'stinger';
        });
        for (const k of want) await this.decode(k);
      });
      return this.loading;
    },

    async decode(key) {
      const t = key && this.tracks[key];
      if (!t || !this.ctx) return null;
      if (this.buf[key]) return this.buf[key];
      if (t.failed) return null;
      t.p ||= (async () => {
        const file = t.files?.m4a;
        if (file) try {
          const r = await fetch('audio/music/' + file);
          if (r.ok) {
            const data = await r.arrayBuffer();
            const buf = await new Promise((ok, no) => this.ctx.decodeAudioData(data, ok, no));
            this.buf[key] = buf;
            this.missing = this.missing.filter(x => x !== key);
            return buf;
          }
        } catch {}
        t.failed = true;
        if (!this.missing.includes(key)) this.missing.push(key);
        return null;
      })();
      const out = await t.p;
      t.p = null;
      return out;
    },

    keep() {
      const s = this.s, dawn = s?.dawnAt != null && !s.bloomed && this.bloomKey();
      const live = new Set([this.bed?.padK, this.bed?.motionK, this.padKey(s?.mode), this.motionKey(s?.mode), dawn].filter(Boolean));
      const resident = t => t.mode === 'flow' || t.role === 'colour' || t.role === 'stinger' || (t.mode === 'kaamos' && !s?.kaamosDone);
      for (const k of Object.keys(this.buf)) if (!live.has(k) && !resident(this.tracks[k] || {})) delete this.buf[k];
    },

    find(pred) { return Object.keys(this.tracks).find(k => pred(this.tracks[k])); },
    padKey(mode) { return mode && this.find(t => t.role === 'bed' && t.mode === mode && (t.layer || 'pad') === 'pad'); },
    motionKey(mode) { return mode && this.find(t => t.role === 'bed' && t.mode === mode && t.layer && t.layer !== 'pad'); },
    owns(mode) {
      const k = this.padKey(this.s?.measuring ? 'kaamos' : mode);
      return !!(k && this.buf[k]);
    },

    unlock() {
      const ctx = this.init();
      try { if (navigator.audioSession && navigator.audioSession.type !== 'ambient') navigator.audioSession.type = 'ambient'; } catch {}
      if (ctx.state !== 'running' && !document.hidden) ctx.resume?.().catch(() => {});
      if (this.unlocked) return;
      this.unlocked = true;
      const s = ctx.createBufferSource();
      s.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
      s.connect(ctx.destination); s.start();
      this.load();
    },

    panner(kind = 'point') {
      const ctx = this.init(), p = ctx.createPanner();
      p.distanceModel = 'inverse'; p.refDistance = 1; p.rolloffFactor = 0.6;
      p._kind = kind; p._hrtf = false;
      this.model(p, this.route === 'headphones');
      p.done = () => { if (p._hrtf) { this.hrtfUsed = Math.max(0, this.hrtfUsed - 1); p._hrtf = false; } };
      return p;
    },
    model(p, want) {
      if (p._hrtf === want) return;
      if (p._hrtf) { this.hrtfUsed--; p._hrtf = false; }
      const hrtf = want && this.hrtfUsed < MAX_HRTF;
      p.panningModel = hrtf ? 'HRTF' : 'equalpower';
      if (hrtf) { this.hrtfUsed++; p._hrtf = true; }
    },
    place(p, az, el, dist, tau = 0.1) {
      if (!p || !this.ctx) return;
      const a = az * Math.PI / 180, e = el * Math.PI / 180, t = this.ctx.currentTime;
      const x = dist * Math.sin(a) * Math.cos(e), y = dist * Math.sin(e), z = -dist * Math.cos(a) * Math.cos(e);
      if (p.positionX) { ease(p.positionX, x, tau, t); ease(p.positionY, y, tau, t); ease(p.positionZ, z, tau, t); }
      else p.setPosition(x, y, z);
    },

    onRoute(fn) { this.routeFns.push(fn); },
    setRoute(kind, latency, quiet) {
      this.route = kind === 'headphones' ? 'headphones' : 'speaker';
      if (Number.isFinite(latency)) this.latency = latency;
      if (!quiet) { try { localStorage.setItem(ROUTE_KEY, this.route); } catch {} }
      if (!this.ctx) return;
      const t = this.ctx.currentTime, sp = this.route === 'speaker', b = this.bus;
      ease(b.musicHP.frequency, sp ? 150 : 20, 0.3, t);
      ease(b.out.gain, sp ? DB(3) : 1, 0.3, t);
      for (const c of Object.values(this.colours)) if (c.pan) this.model(c.pan, !sp);
      this.width();
      this.motion(0.3);
      this.routeFns.forEach(fn => safe(fn)(this.route));
    },

    grid() {
      const b = this.bed, s = this.s, mode = s?.measuring ? 'kaamos' : s?.mode || 'flow';
      const [bpm, beatsPerBar] = b?.grid ? [b.grid.bpm, b.grid.beatsPerBar] : TEMPO[mode] || TEMPO.flow;
      const t0 = b?.grid?.t0 ?? s?.t0 ?? 0, beat = 60 / bpm, bar = beat * beatsPerBar;
      const up = (t, step) => t0 + Math.ceil((t - t0) / step - 1e-6) * step;
      const lat = (this.ctx?.outputLatency || this.ctx?.baseLatency || 0) + this.latency;
      return { bpm, beatsPerBar, t0, nextBeat: t => up(t, beat), nextBar: t => up(t, bar), latency: lat };
    },

    start({ night = false, route } = {}) {
      this.s = null;
      if (Au.on === false) return;
      this.init();
      if (route) this.setRoute(route);
      this.load();
      this.stopAll(0.05);
      const t = this.ctx.currentTime;
      this.s = {
        night, t0: t, phase: 'fadein', mode: null, measuring: true, colours: 0, stingers: 0, opened: false,
        panel: false, breath: false, stingerUntil: 0, tier: 0, k: 0, modeAt: t, restCycles: 0, dawnAt: null, ended: false, kaamosDone: false,
      };
      this.lastSwap = -99; this.pending = null;
      const b = this.bus;
      hold(b.light.frequency, t); b.light.frequency.setValueAtTime(LIGHT[0], t);
      hold(b.curve.gain, t); b.curve.gain.setValueAtTime(0, t);
      b.curve.gain.linearRampToValueAtTime(DB(night ? -21 : -18), t + 2);
      this.levels();
      this.target('measure');
    },

    curve(db, sec) { if (this.ctx) glide(this.bus.curve.gain, db === -Infinity ? 0 : DB(db), Math.max(1.5, sec), this.ctx.currentTime); },
    playDb() { return this.s.night ? -12 : Math.min(-6, -9 + this.s.colours); },

    phase(p) {
      const s = this.s;
      if (!s || s.ended) return;
      const prev = s.phase;
      s.phase = p;
      if (p === 'rest') { this.curve(s.night ? -15 : -12, 6); this.bedLevel(this.levelFor('kaamos', 'pad'), 6); }
      if (p === 'walk' && CORE.has(prev)) {
        s.measuring = false; s.opened = true;
        this.curve(s.night ? -12 : -9, 1.5);
        this.levels();
        this.target('answer');
        this.stinger('st_open');
      }
      if (p === 'dawn') this.dawn();
      if (p === 'asleep') this.end({ asleep: true });
    },

    setMode(mode, { answer } = {}) {
      const s = this.s;
      if (!s || s.ended || !TEMPO[mode]) return;
      if (s.mode !== mode) { s.mode = mode; s.modeAt = this.ctx.currentTime; s.restCycles = 0; s.motionFloor = false; }
      this.candidate(mode);
      if (s.measuring || !s.opened) return;
      const isAnswer = answer ?? !!ANSWER_STINGER[mode];
      this.target(isAnswer ? 'answer' : 'drift');
      if (isAnswer) this.stinger(ANSWER_STINGER[mode]);
    },

    candidate(mode) { this.decode(this.padKey(mode)); this.decode(this.motionKey(mode)); },

    target(kind) {
      const s = this.s;
      if (!s || s.ended || s.phase === 'dawn' || s.dawnAt != null) return;
      const key = s.measuring ? 'kaamos' : s.mode;
      if (!key || (this.want === key && !this.pending)) return;
      this.pending = { key, kind };
      this.flush();
    },

    flush() {
      const p = this.pending;
      if (!p || !this.ctx) return;
      if (p.kind !== 'measure' && this.ctx.currentTime - this.lastSwap < MIN_GAP) return;
      this.pending = null;
      if (this.want !== p.key) this.swap(p.key, p.kind);
    },

    async swap(key, kind, opt = {}) {
      const s = this.s;
      if (!s || s.ended) return;
      const gen = ++this.gen;
      this.want = key;
      await this.listed;
      const padK = this.padKey(key), pad = padK && await this.decode(padK);
      const motK = this.motionKey(key), mot = pad && motK && await this.decode(motK);
      if (this.s !== s || this.gen !== gen || s.ended) return;
      const ctx = this.ctx, now = ctx.currentTime, old = this.bed;
      this.lastSwap = now;
      if (!pad) {
        if (old && !old.procedural) this.fadeBed(old, now, 2);
        this.bed = { key, procedural: true, grid: { bpm: TEMPO[key]?.[0] || 60, beatsPerBar: TEMPO[key]?.[1] || 4, t0: now } };
        this.keep();
        return;
      }
      const t = this.tracks[padK], g = this.grid();
      const bpm = t.bpm || TEMPO[key]?.[0] || 60, meter = t.meter || TEMPO[key]?.[1] || 4;
      const bar = 60 / bpm * meter, pad0 = this.manifest?.pad_s ?? 0.5;
      const len = t.len_s || (t.bars ? t.bars * bar : pad.duration - 2 * pad0);
      let when = now + 0.05, xf = 2, off = 0;
      if (old && !old.procedural) {
        if (kind === 'answer') { when = Math.max(when, g.nextBeat(now)); xf = bar; }
        else if (kind === 'drift') { when = Math.max(when, g.nextBar(now)); xf = Math.max(2 * bar, 8); }
        else if (kind === 'dawn') { when = Math.max(when, g.nextBeat(now)); xf = 3; }
        else { when = Math.max(when, g.nextBar(now)); xf = 4; }
      }
      if (kind === 'drift' || kind === 'dawn') {
        const blocks = Math.max(1, Math.floor(len / (4 * bar)));
        off = Math.floor(R() * blocks) * 4 * bar;
      }
      const v = { key, padK, len, fadeEnd: when + xf, grid: { bpm, beatsPerBar: meter, t0: when - off }, srcs: [], fades: [] };
      const mk = (buf, level, mono) => {
        const src = ctx.createBufferSource(), lp = ctx.createBiquadFilter(), lvl = ctx.createGain(), fade = ctx.createGain();
        src.buffer = buf; src.loop = true; src.loopStart = pad0; src.loopEnd = pad0 + len;
        lp.type = 'lowpass'; lp.frequency.value = 20000; lp.Q.value = 0.5;
        lvl.gain.value = level; fade.gain.value = 0;
        src.connect(lp); lp.connect(lvl); lvl.connect(fade);
        if (mono) { const sp = ctx.createStereoPanner(); fade.connect(sp); sp.connect(this.bus.beds); v.sway = sp; }
        else { const w = this.widthNode(); fade.connect(w.input); w.output.connect(this.bus.beds); v.w = w; }
        src.start(when, pad0 + off);
        fade.gain.setValueCurveAtTime(eq(true), when, xf);
        v.srcs.push(src); v.fades.push(fade);
        return { lvl, lp };
      };
      const p = mk(pad, opt.level ?? (key === 'kaamos' && s.phase === 'fadein' ? 0 : this.levelFor(key, 'pad')), false);
      v.pad = p.lvl; v.lp = p.lp;
      if (mot) { v.motion = mk(mot, this.levelFor(key, 'motion'), true).lvl; v.motionK = motK; }
      if (old && !old.procedural) this.fadeBed(old, when, xf);
      this.bed = v;
      if (key !== 'kaamos' && !s.measuring) s.kaamosDone = s.kaamosDone || s.lanternsDone;
      this.width();
      this.keep();
    },

    fadeBed(v, when, xf, cut = false) {
      const now = this.ctx.currentTime, hard = cut || v.out != null;
      const at = hard ? Math.max(when, now) : Math.max(when, v.fadeEnd || 0), end = at + xf;
      if (v.out != null && end >= v.out) return;
      v.out = end;
      const out = f => hard ? glide(f.gain, 0, xf, at) : f.gain.setValueCurveAtTime(eq(false), at, xf);
      v.fades.forEach(f => { try { out(f); } catch { try { glide(f.gain, 0, xf, at); } catch {} } });
      v.srcs.forEach(src => { try { src.stop(end + 0.1); } catch {} });
      clearTimeout(v.unplug);
      v.unplug = setTimeout(() => [...v.srcs, ...v.fades].forEach(n => { try { n.disconnect(); } catch {} }), (end - now + 0.3) * 1000);
    },

    widthNode() {
      const ctx = this.ctx, sp = ctx.createChannelSplitter(2), mg = ctx.createChannelMerger(2);
      const input = ctx.createGain(), output = ctx.createGain();
      input.channelCount = 2; input.channelCountMode = 'explicit';
      const mid = ctx.createGain(), sL = ctx.createGain(), sR = ctx.createGain(), side = ctx.createGain(), inv = ctx.createGain();
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 120;
      mid.gain.value = 0.5; sL.gain.value = 0.5; sR.gain.value = -0.5; inv.gain.value = -1;
      input.connect(sp);
      sp.connect(mid, 0); sp.connect(mid, 1); sp.connect(sL, 0); sp.connect(sR, 1);
      sL.connect(hp); sR.connect(hp); hp.connect(side);
      mid.connect(mg, 0, 0); mid.connect(mg, 0, 1);
      side.connect(mg, 0, 0); side.connect(inv); inv.connect(mg, 0, 1);
      mg.connect(output);
      return { input, output, side };
    },
    width() {
      if (!this.ctx || !this.bed?.w) return;
      ease(this.bed.w.side.gain, this.route === 'speaker' ? 0.4 : 1.1, 0.3, this.ctx.currentTime);
    },

    levelFor(key, layer) {
      const s = this.s, t = this.tracks[layer === 'motion' ? this.motionKey(key) : this.padKey(key)] || {};
      const base = t.gain_db ?? 0;
      if (layer === 'pad') {
        if (key === 'kaamos') return DB(t.gain_db ?? -4);
        if (key === 'calm') return DB(base + Math.min(2, s?.tier || 0));
        if (key === 'rest') return DB(base - 2 - Math.min(6, 0.5 * (s?.restCycles || 0)));
        return DB(base);
      }
      if (!s || s.measuring) return 0;
      const sp = this.route === 'speaker' ? 2 : 0, k = s.k || 0, tier = s.tier || 0;
      let db = null;
      if (key === 'flow') db = tier >= 1 ? 0 : s.motionFloor ? -6 : null;
      if (key === 'wake') db = Math.min(0, -12 + 12 * k + (tier >= 1 ? 3 : 0));
      if (key === 'fatigue') db = Math.min(0, -9 + 9 * k + (tier >= 1 ? 3 : 0));
      return db === null ? 0 : DB(base + db + sp);
    },

    bedLevel(v, sec) {
      if (!this.bed?.pad || !this.ctx) return;
      glide(this.bed.pad.gain, v, sec, this.ctx.currentTime);
    },
    motion(tau) {
      const v = this.bed;
      if (!v?.motion || !this.s || v.key !== this.s.mode) return;
      ease(v.motion.gain, this.levelFor(v.key, 'motion'), tau, this.ctx.currentTime);
    },

    levels() {
      const s = this.s;
      if (!this.ctx || !s) return;
      const t = this.ctx.currentTime, b = this.bus;
      let beds = 0, col = 0, amb = 0;
      if (s.measuring) { beds = -3; col = -3; amb = -4; }
      else {
        if (s.panel && !s.breath) { beds -= 3; col -= 1; amb -= 4; }
        if (s.breath) amb -= 2;
        if (t < s.stingerUntil) { beds -= 3; amb -= 2; }
        if (s.dawnHush) amb -= 4;
        if (s.tier >= 3) col += 2;
        if (s.dawnAt != null && !s.night) col += 2;
      }
      s.bedDuck = Math.max(-6, beds);
      ease(b.beds.gain, DB(s.bedDuck), 0.15, t);
      ease(b.colour.gain, DB(col), 0.15, t);
      ease(b.ambDuck.gain, DB(amb), 0.3, t);
    },

    duck() {
      const s = this.s;
      if (!s || s.measuring || CORE.has(s.phase) || s.breath || !this.ctx) return;
      const t = this.ctx.currentTime, d = Math.max(-2, -6 - (s.bedDuck || 0));
      if (d >= 0) return;
      const p = this.bus.fb.gain;
      hold(p, t); p.setTargetAtTime(DB(d), t, 0.007); p.setTargetAtTime(1, t + 0.35, 0.12);
    },

    panel(open, { breath = false } = {}) {
      const s = this.s;
      if (!s) return;
      s.panel = open; s.breath = open && breath;
      this.levels();
    },

    measure(on, id) {
      const s = this.s;
      if (!s) return;
      if (!on && id === 'lanterns') s.lanternsDone = true;
      if (s.measuring === on) return;
      s.measuring = on;
      this.levels();
      this.target(on ? 'measure' : 'drift');
    },

    intensity(k) {
      const s = this.s;
      if (!s || s.measuring || !Number.isFinite(k)) return;
      s.k = Math.max(0, Math.min(1, k));
      this.motion(1.5);
    },
    tier(n) {
      const s = this.s;
      if (!s || s.measuring || s.mode === 'rest') return;
      s.tier = Math.max(0, Math.min(3, n | 0));
      this.motion(0.4);
      if (this.bed?.key === 'calm') ease(this.bed.pad.gain, this.levelFor('calm', 'pad'), 0.4, this.ctx.currentTime);
      this.levels();
    },

    colour(group) {
      const s = this.s;
      if (!s || !this.ctx || !COLOUR_POS[group] || this.colours[group]) return;
      s.colours = Math.min(3, s.colours + 1);
      const ctx = this.ctx, now = ctx.currentTime;
      const at = BEAT_MODES.has(s.mode) && !s.measuring ? this.grid().nextBeat(now) : now;
      this.chime(group, Math.max(0, at - now));
      if (!s.measuring) {
        ease(this.bus.light.frequency, LIGHT[s.colours], 0.7, now);
        if (!CORE.has(s.phase) && s.dawnAt == null) this.curve(this.playDb(), 2);
      }
      const key = this.find(t => t.role === 'colour' && t.group === group), buf = key && this.buf[key];
      if (!buf) {
        this.colours[group] = { fallback: true };
        if (group === 'blue') Au.bell();
        if (group === 'green') Au.cello(true);
        return;
      }
      const src = ctx.createBufferSource(), gn = ctx.createGain(), pan = this.panner('colour');
      src.buffer = buf; src.loop = true; gn.gain.value = 0;
      src.connect(gn); gn.connect(pan); pan.connect(this.bus.colour);
      const [az, el, d] = COLOUR_POS[group];
      this.place(pan, az, el, d, 0.01);
      src.start(now, R() * buf.duration);
      gn.gain.setValueAtTime(0, now);
      gn.gain.linearRampToValueAtTime(DB(this.tracks[key].gain_db ?? COLOUR_DB[group]), now + (COLOUR_FADE[s.mode] || 2.4));
      this.colours[group] = { src, gn, pan, t0: now };
    },

    chime(group, when) {
      if (group === 'yellow') { Au.piano(6, 0.12, when); Au.piano(2, 0.08, when + 0.02); }
      else if (group === 'blue') { Au.piano(5, 0.1, when); Au.piano(7, 0.08, when + 0.18); }
      else [146.83, 196.0, 220.0].forEach((f, i) => Au.tone(f, 2.6, 0.1, 'triangle', when + i * 0.42));
    },

    sway(now) {
      const b = this.colours.blue, g = this.colours.green, s = this.s;
      if (b?.pan) {
        const rise = s?.dawnAt != null && !s.night ? Math.min(1, (now - s.dawnAt) / 5) : null;
        this.place(b.pan, 50 * Math.sin((now - b.t0) * 2 * Math.PI / 41), rise == null ? 20 : 10 + 25 * rise, 3);
      }
      if (g?.pan) this.place(g.pan, 60 + 10 * Math.sin((now - g.t0) * 2 * Math.PI / 53), 0, 2.5);
      if (this.bed?.sway) ease(this.bed.sway.pan, 0.3 * Math.sin(now * 2 * Math.PI / 30), 0.2, now);
    },

    stinger(id) {
      const s = this.s;
      if (!s || !id || s.measuring || CORE.has(s.phase) || s.stingers >= STINGER_BUDGET || s.ended) return;
      s.stingers++;
      const now = this.ctx.currentTime, g = this.grid();
      const when = BEAT_MODES.has(s.mode) && this.bed && !this.bed.procedural ? g.nextBeat(now) : now + 0.05;
      if (id === 'countin') {
        const beat = 60 / TEMPO.fatigue[0];
        [3, 3, 4].forEach((n, i) => Au.piano(n, 0.1, when - now + i * beat));
        return;
      }
      const buf = this.tracks[id] && this.buf[id];
      let len = 2;
      if (buf) {
        const src = this.ctx.createBufferSource(), gn = this.ctx.createGain();
        src.buffer = buf; gn.gain.value = DB(this.tracks[id].gain_db ?? -6);
        src.connect(gn); gn.connect(this.bus.stinger); src.start(when);
        len = buf.duration;
      } else if (id === 'st_open') Au.bell();
      else (id === 'st_settle' ? [7, 6, 5, 4] : [4, 6, 7, 8]).forEach((n, i) => Au.piano(n, 0.1, when - now + i * 0.32));
      s.stingerUntil = when + len;
      this.levels();
    },

    dawn() {
      const s = this.s;
      if (!s || s.dawnAt != null) return;
      const now = this.ctx.currentTime;
      s.dawnAt = now; s.measuring = false; this.pending = null;
      if (s.night) { this.levels(); this.curve(-15, 2); Au.dawnPhrase(); return; }
      s.dawnHush = true;
      this.levels();
      this.curve(0, 5);
      ease(this.bus.light.frequency, DAWN_LIGHT, 1.7, now);
      this.swap('dawn', 'dawn', { level: DB(-9) }).then(safe(() => {
        const v = this.bed;
        if (this.s !== s || v?.key !== 'dawn') return;
        if (v.procedural) Au.dawnPhrase();
        else this.bedLevel(DB(this.tracks[v.padK].gain_db ?? 0), 5);
      }));
      this.decode(this.bloomKey());
    },
    dawnT(t) { if (this.s && Number.isFinite(t)) this.s.dawnExt = t; },
    bloomKey() { return this.tracks.dawn_bloom ? 'dawn_bloom' : this.find(t => t.role === 'oneshot' && t.hit_s != null); },
    bloom() {
      const s = this.s;
      if (!s || s.night || s.bloomed) return;
      s.bloomed = true; s.dawnHush = false;
      this.levels();
      const key = this.bloomKey(), buf = key && this.buf[key];
      if (!buf) return;
      const now = this.ctx.currentTime, src = this.ctx.createBufferSource(), gn = this.ctx.createGain();
      src.buffer = buf; gn.gain.value = DB(this.tracks[key].gain_db ?? 0);
      src.connect(gn); gn.connect(this.bus.stinger); src.start(now);
      const hit = this.tracks[key].hit_s ?? 0.5;
      if (this.bed?.key === 'dawn' && !this.bed.procedural) this.fadeBed(this.bed, now + hit, 4);
    },

    end({ night, asleep, after = 0, sec } = {}) {
      const s = this.s;
      if (!s || !this.ctx || s.ended) return;
      s.ended = true;
      const fade = sec ?? (asleep ? 6 : (night ?? s.night) ? 8 : 6);
      setTimeout(safe(() => {
        if (this.s !== s) return;
        this.curve(-Infinity, fade);
        setTimeout(safe(() => { if (this.s === s) this.stopAll(0.1); }), (fade + 0.5) * 1000);
      }), after * 1000);
    },

    stopAll(sec = 1) {
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      this.gen++;
      if (this.bed && !this.bed.procedural) this.fadeBed(this.bed, now, sec, true);
      this.bed = null; this.want = null;
      for (const c of Object.values(this.colours)) {
        if (!c.src) continue;
        glide(c.gn.gain, 0, sec, now);
        try { c.src.stop(now + sec + 0.05); } catch {}
        c.pan.done();
      }
      if (this.colours.green?.fallback) Au.cello(false);
      this.colours = {};
      this.pending = null;
    },

    tick() {
      if (!this.ctx) return;
      const s = this.s, now = this.ctx.currentTime, on = Au.on !== false;
      if (on !== this.lastOn) { this.lastOn = on; ease(this.bus.mix.gain, on ? 1 : 0, 0.1, now); }
      if (!s) return;
      this.flush();
      if (now - this.swayAt >= 0.1) { this.swayAt = now; this.sway(now); }
      if (s.mode === 'flow' && !s.measuring && !s.motionFloor && now - s.modeAt >= 20) { s.motionFloor = true; this.motion(1.5); }
      if (s.mode === 'rest' && !s.measuring && !s.ended && s.dawnAt == null) {
        const cyc = Math.floor((now - s.modeAt) / 10);
        if (cyc > s.restCycles) {
          s.restCycles = cyc;
          this.curve(Math.max(-20, (s.night ? -12 : -9) - 0.5 * cyc), 2);
          if (this.bed?.key === 'rest') this.bedLevel(this.levelFor('rest', 'pad'), 2);
        }
      }
      if (this.bed?.key === 'calm' && this.bed.lp && !s.measuring) {
        const ph = ((now - this.bed.grid.t0) % 10 + 10) % 10, up = ph < 4;
        if (up !== this.bed.inhale) { this.bed.inhale = up; ease(this.bed.lp.frequency, up ? 2200 : 900, up ? 1.3 : 2, now); }
      }
      if (s.dawnAt != null && !s.night && !s.bloomed) {
        const key = this.bloomKey(), hit = (key && this.tracks[key]?.hit_s) ?? 0.5;
        if ((s.dawnExt ?? now - s.dawnAt) >= 5 - hit) this.bloom();
      }
      if (s.stingerUntil && now > s.stingerUntil) { s.stingerUntil = 0; this.levels(); }
    },

    status() {
      const modes = ['kaamos', 'calm', 'flow', 'wake', 'fatigue', 'rest'];
      const owned = modes.filter(m => { const k = this.padKey(m); return k && this.buf[k]; });
      const mem = Object.values(this.buf).reduce((a, b) => a + b.length * b.numberOfChannels * 4, 0) / 1048576;
      return {
        source: !owned.length ? 'procedural' : owned.length === modes.length ? 'files' : 'mixed',
        mode: this.s?.mode ?? null, measuring: !!this.s?.measuring, bed: this.bed?.key ?? null, procedural: !this.bed || !!this.bed.procedural,
        loaded: Object.keys(this.buf), missing: this.manifest ? this.missing : ['manifest'], memMB: Math.round(mem * 10) / 10,
        route: this.route, state: this.ctx?.state ?? 'none', colours: this.s?.colours ?? 0,
      };
    },
  };

  let inGame = null;
  const on = (ev, f) => A.bus.on(ev, safe(f));
  on('ws', m => { if (m?.type === 'session_start') { inGame = null; M.start({ night: m.clock === 'night' }); } });
  on('segment', p => {
    if (!M.s) return;
    if (inGame && p !== 'game') {
      const g = inGame;
      inGame = null;
      M.panel(false);
      if (g.kind === 'measurement') M.measure(false, g.id);
      if (p !== 'asleep' && M.s.colours < 3) M.colour(['yellow', 'blue', 'green'][M.s.colours]);
    }
    M.phase(p);
  });
  on('mode', m => M.setMode(m));
  on('game', g => {
    if (!M.s || !g) return;
    inGame = g;
    if (g.kind === 'measurement') M.measure(true, g.id);
    else M.intensity(g.k);
    M.panel(true, { breath: g.id === 'breath' });
  });
  on('sfx', e => { if (e && e.name !== 'stinger') M.duck(); });
  on('endScreen', () => { if (M.s?.night) M.end({ night: true }); });
  on('sessionEnd', r => {
    if (!M.s || !r) return;
    if (r.status === 'fell_asleep') M.end({ asleep: true });
    else if (r.status === 'completed') M.end({ after: 1.2 });
    else M.end({ sec: 2 });
  });
  on('home', () => { if (M.ctx) { M.stopAll(1); M.s = null; } });

  const unlock = safe(() => M.unlock());
  ['pointerdown', 'touchend', 'keydown'].forEach(t => document.addEventListener(t, unlock, { capture: true, passive: true }));
  document.addEventListener('visibilitychange', safe(() => {
    if (!M.ctx) return;
    if (document.hidden) M.ctx.suspend?.().catch(() => {});
    else if (M.unlocked) M.ctx.resume?.().catch(() => {});
  }));
  setInterval(safe(() => M.tick()), 25);
})();
