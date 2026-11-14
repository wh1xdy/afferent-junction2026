(() => {
  const Au = A.Audio;
  const DB = d => Math.pow(10, d / 20);
  const R = Math.random, rnd = (a, b) => a + R() * (b - a);
  const safe = f => (...a) => { try { return f(...a); } catch (e) { console.warn('ambience', e); } };
  const CORE = new Set(['fadein', 'rest', 'checkin', 'rt']);
  const MAX_BEDS = 5, LOUD_AFTER = 30;

  const MODE = {
    calm: { lp: 6000, shelf: -3, width: 1, density: 0.5 },
    flow: { lp: 12000, shelf: 0, width: 1, density: 1 },
    wake: { lp: 16000, shelf: 2, width: 1.1, density: 1.5 },
    fatigue: { lp: 16000, shelf: 3, width: 1.1, density: 1, birds: 2 },
    rest: { lp: 2500, shelf: -6, width: 0.8, density: 0 },
  };
  const EXTRA = { calm: ['amb_sauna_stove', -14], wake: ['amb_wind_fell', -14], fatigue: ['amb_dawn_woodland', -14] };
  const BIOME = { calm: 'sauna', flow: 'forest', wake: 'lake', fatigue: 'shore', rest: 'drift' };
  const WIDTH = { amb_lake_lapping: 0.6, amb_ride_ski: 0.5 };
  const POINT = { amb_harbour_rope: [-35, -5, 3], amb_boat_far: [50, 0, 8, true], amb_fire_crackle: [-15, -15, 1.5] };
  const WATER = ['amb_lake_lapping', 'amb_shore_waves', 'amb_lake_ice_night'];
  const HARBOUR = { beds: { amb_night_air: -2, amb_lake_lapping: -10, amb_snowfall: -8 }, points: { amb_harbour_rope: -14, amb_boat_far: -20 }, events: ['foghorn', 'chime', 'ping'] };
  const SCENES = {
    harbour: HARBOUR,
    fell: { beds: { amb_wind_fell: -10, amb_night_air: -4 }, events: ['crack', 'icicle'] },
    shore: { beds: { amb_shore_waves: -5, amb_night_air: -8 }, events: ['ping'] },
    sauna: { beds: { amb_snowfall: -8, amb_forest_birch: -6 }, points: { amb_fire_crackle: -16 } },
    stove: { beds: { amb_sauna_stove: -3, amb_snowfall: -20, amb_forest_birch: -18 }, points: { amb_fire_crackle: -10 }, events: [] },
    forest: { beds: { amb_forest_birch: -4, amb_night_air: -6 }, events: ['twinkle'] },
    stars: { beds: { amb_forest_birch: -8, amb_night_air: -2 }, events: [] },
    lake: { beds: { amb_lake_ice_night: -6, amb_lake_under_ice: -9 }, events: ['ping', 'crack', 'boom'] },
    fireflies: { beds: { amb_lake_ice_night: -6, amb_night_air: -6 }, events: ['ping'] },
    bells: { beds: { amb_wind_fell: -14, amb_night_air: -2 }, events: [] },
    shutters: { ...HARBOUR, beds: { ...HARBOUR.beds, amb_wind_chimes: -20 } },
    drift: { beds: { amb_lake_ice_night: -6, amb_shore_waves: -14, amb_night_air: -6 }, events: [], bare: true },
    dawn: { beds: { amb_dawn_woodland: -3, amb_night_air: -12, amb_shore_waves: -12 }, events: [], bare: true, fade: 8 },
    nightEnd: { beds: { amb_lake_ice_night: -8, amb_shore_waves: -16, amb_night_air: -8 }, events: [], bare: true, fade: 6 },
  };
  const TASK_SCENE = { loyly: 'stove', threads: 'forest', stars: 'stars', fireflies: 'fireflies', beacon: 'harbour', bells: 'bells', shutters: 'shutters', fork: 'fell', lanterns: 'harbour', windows: 'shutters', vihta: 'stove', birds: 'forest', swans: 'harbour', faces: 'stove', owls: 'forest', seals: 'harbour', reindeer: 'fell', ferry: 'harbour', drips: 'stove', buoys: 'harbour', steps: 'fell', glance: 'harbour', signpost: 'forest', runes: 'stars', fog: 'harbour' };
  const EV = {
    foghorn: { f: 'sfx_foghorn_far', every: [70, 140], loud: true, once: true, far: true, az: [-60, -40], el: [0, 5] },
    chime: { f: 'sfx_chime_single', every: [25, 50], dB: -18, far: true, az: [25, 55], el: [5, 20] },
    ping: { f: 'sfx_ice_ping', every: [12, 25], sharp: true, far: true, az: [-60, 60], el: [-15, -5] },
    crack: { f: 'sfx_ice_crack', every: [20, 40], sharp: true, far: true, az: [-60, 60], el: [-15, -5] },
    icicle: { f: 'sfx_icicle_tinkle', every: [18, 35], dB: -14, az: [-50, 50], el: [10, 25] },
    boom: { f: 'sfx_ice_boom', every: [45, 90], loud: true, far: true, az: [-60, 60], el: [-15, -10] },
    twinkle: { f: 'sfx_mote_twinkle', every: [20, 40], stage: 3, dB: -16, az: [-50, 50], el: [15, 30] },
  };
  const BIRDS = {
    1: [['sfx_bird_great_tit'], [20, 40]],
    3: [['sfx_bird_great_tit', 'sfx_bird_chaffinch', 'sfx_bird_blackbird'], [10, 20]],
    dawn: [['sfx_bird_great_tit', 'sfx_bird_chaffinch', 'sfx_bird_blackbird', 'sfx_bird_redstart', 'sfx_bird_willow_warbler'], [4, 8]],
  };
  const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21];

  const Amb = A.Ambience = {
    ctx: null, man: null, files: {}, fam: {}, buf: {}, bag: {}, voices: {}, s: null, log: [],
    touch: null, ready: null,

    init() {
      if (this.ctx) return this.ctx;
      const ctx = this.ctx = A.Music ? A.Music.init() : (Au.init(), Au.ctx);
      const g = v => { const n = ctx.createGain(); n.gain.value = v; return n; };
      this.bed = g(1); this.point = g(1); this.ev = g(1); this.ui = g(1);
      this.bus = g(1);
      this.lp = ctx.createBiquadFilter(); this.lp.type = 'lowpass'; this.lp.frequency.value = 12000; this.lp.Q.value = 0.5;
      this.shelf = ctx.createBiquadFilter(); this.shelf.type = 'highshelf'; this.shelf.frequency.value = 8000; this.shelf.gain.value = 0;
      this.dip = ctx.createBiquadFilter(); this.dip.type = 'peaking'; this.dip.frequency.value = 780; this.dip.Q.value = 0.55; this.dip.gain.value = 0;
      this.hush = g(1); this.out = g(0);
      this.verb = Au.makeReverb.call({ ctx }); this.wet = g(0.5);
      this.lfo = ctx.createOscillator(); this.lfo.frequency.value = 0.1; this.depth = g(0);
      this.lfo.connect(this.depth); this.depth.connect(this.bed.gain); this.lfo.start();
      [this.bed, this.point, this.ev].forEach(n => n.connect(this.bus));
      this.verb.connect(this.wet); this.wet.connect(this.bus);
      this.bus.connect(this.lp); this.lp.connect(this.shelf); this.shelf.connect(this.dip); this.dip.connect(this.hush); this.hush.connect(this.out);
      this.out.connect(A.Music ? A.Music.bus.ambience : ctx.destination);
      this.ui.connect(A.Music ? A.Music.bus.sfx : ctx.destination);
      A.Music?.onRoute(() => this.reroute());
      return ctx;
    },

    load() {
      if (this.ready || Au.on === false) return this.ready;
      this.init();
      this.ready = (async () => {
        try {
          const r = await fetch('audio/manifest.json', { cache: 'no-cache' });
          if (r.ok) this.man = await r.json();
        } catch {}
        this.files = this.man?.files || {};
        this.fam = {};
        for (const k of Object.keys(this.files)) (this.fam[k.replace(/_\d+$/, '')] ||= []).push(k);
      })();
      return this.ready;
    },

    async get(key) {
      await this.load();
      const m = this.files[key];
      if (!m || !this.ctx) return null;
      if (this.buf[key]) return this.buf[key];
      m.p ||= (async () => {
        try {
          const data = await A.fetchBytes(`audio/${m.path}.m4a`);
          if (!data) return null;
          return this.buf[key] = await new Promise((ok, no) => this.ctx.decodeAudioData(data, ok, no));
        } catch { return null; }
      })();
      const b = await m.p;
      m.p = null;
      return b;
    },

    evict(keep) {
      const loops = Object.keys(this.buf).filter(k => this.files[k]?.kind === 'loop' && !keep.has(k) && !this.voices[k]);
      const count = Object.keys(this.buf).filter(k => this.files[k]?.kind === 'loop').length;
      loops.slice(0, Math.max(0, count - MAX_BEDS)).forEach(k => delete this.buf[k]);
    },

    pick(name, idx) {
      const list = this.files[name] ? [name] : this.fam[name] || [];
      if (!list.length) return null;
      if (idx != null) return list[idx % list.length];
      const last = this.bag[name], pool = list.length > 1 ? list.filter(k => k !== last) : list;
      return this.bag[name] = pool[Math.floor(R() * pool.length)];
    },

    async play(name, o = {}) {
      if (!this.ctx || Au.on === false) return;
      const s = this.s, fixed = o.fixed || !!s?.frozen;
      const key = this.pick(name, fixed ? o.index ?? 0 : o.index);
      if (!key) return;
      const asked = this.ctx.currentTime, buf = await this.get(key);
      if (!buf || this.s !== s) return;
      const ctx = this.ctx, now = ctx.currentTime;
      if (o.timely && now - asked > 0.25) return;
      const src = ctx.createBufferSource(), g = ctx.createGain();
      src.buffer = buf;
      src.playbackRate.value = (o.rate ?? 1) * (fixed ? 1 : rnd(0.94, 1.06));
      const db = (o.dB ?? this.files[key].gainDb ?? -12) + (fixed ? 0 : rnd(-1.5, 1.5));
      g.gain.value = DB(db);
      src.connect(g);
      let pan = null;
      if (o.ui) g.connect(this.ui);
      else {
        let tail = g;
        if (o.far) {
          const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = o.lp || 2500;
          g.connect(lp); tail = lp;
        }
        if (o.az != null || o.el != null) {
          const az = Math.max(-70, Math.min(70, o.az || 0));
          if (A.Music?.route === 'headphones') {
            pan = A.Music.panner('event');
            A.Music.place(pan, az, o.el || 0, o.far ? 4 : 1.5, 0.005);
          } else { pan = ctx.createStereoPanner(); pan.pan.value = az / 90 * 0.6; }
          tail.connect(pan); tail = pan;
        }
        tail.connect(this.ev);
        const send = ctx.createGain(); send.gain.value = o.far ? 0.55 : 0.06;
        tail.connect(send); send.connect(this.verb);
      }
      src.onended = () => { pan?.done?.(); try { g.disconnect(); } catch {} };
      src.start(now + (o.delay || 0));
      if (!o.ui) this.log.push({ t: A.now?.() ?? now, file: key, dB: Math.round(db * 10) / 10, loud: !!o.loud });
      if (this.log.length > 400) this.log.splice(0, this.log.length - 400);
    },

    voice(name, db, fade, fixedStart) {
      const ctx = this.ctx, now = ctx.currentTime, m = this.files[name];
      if (!m) return;
      let v = this.voices[name];
      if (v) { v.target = db; this.level(v, fade); return; }
      v = this.voices[name] = { name, target: db };
      this.get(name).then(safe(buf => {
        if (this.voices[name] !== v) return;
        if (!buf) { delete this.voices[name]; return; }
        const t = ctx.currentTime, src = ctx.createBufferSource(), lp = ctx.createBiquadFilter(), lvl = ctx.createGain();
        src.buffer = buf; src.loop = true;
        const a = m.loopStart ?? 0, b = m.loopEnd ?? buf.duration;
        src.loopStart = a; src.loopEnd = b;
        lp.type = 'lowpass'; lp.frequency.value = 20000;
        lvl.gain.value = 0;
        src.connect(lp); lp.connect(lvl);
        if (POINT[name]) {
          const [az, el, d, far] = POINT[name];
          if (far) lp.frequency.value = 3000;
          v.pan = A.Music && A.Music.route === 'headphones' && this.hrtf() < 2 ? A.Music.panner('ambience') : null;
          if (v.pan) A.Music.place(v.pan, az, el, d, 0.005);
          else { v.pan = ctx.createStereoPanner(); v.pan.pan.value = az / 90 * 0.6; }
          lvl.connect(v.pan); v.pan.connect(this.point);
          const send = ctx.createGain(); send.gain.value = far ? 0.55 : 0.08;
          v.pan.connect(send); send.connect(this.verb);
        } else if (buf.numberOfChannels === 2 && A.Music) {
          v.w = A.Music.widthNode();
          lvl.connect(v.w.input); v.w.output.connect(this.bed);
        } else lvl.connect(this.bed);
        src.start(t, fixedStart ? a : rnd(a, b - 0.1));
        Object.assign(v, { src, lp, lvl });
        this.width(v);
        this.level(v, fade);
      }));
    },
    hrtf() { return Object.values(this.voices).filter(v => v.pan?._hrtf).length; },
    level(v, fade) {
      if (!v.lvl) return;
      const t = this.ctx.currentTime, p = v.lvl.gain;
      if (p.cancelAndHoldAtTime) p.cancelAndHoldAtTime(t); else { const x = p.value; p.cancelScheduledValues(t); p.setValueAtTime(x, t); }
      p.linearRampToValueAtTime(v.dead ? 0 : DB(v.target + (v.boost || 0)), t + Math.max(0.05, fade));
    },
    drop(name, fade) {
      const v = this.voices[name];
      if (!v) return;
      delete this.voices[name];
      v.dead = true;
      if (!v.lvl) return;
      this.level(v, fade);
      try { v.src.stop(this.ctx.currentTime + fade + 0.1); } catch {}
      setTimeout(safe(() => { v.pan?.done?.(); try { v.lvl.disconnect(); } catch {} }), (fade + 0.3) * 1000);
    },
    width(v) {
      if (!v.w) return;
      const route = A.Music?.route === 'headphones' ? 1 : 0.4, mode = MODE[this.s?.mode]?.width ?? 1;
      const w = Math.min(1.3, (WIDTH[v.name] ?? 1) * mode * route);
      v.w.side.gain.setTargetAtTime(w, this.ctx.currentTime, 0.5);
    },
    reroute() {
      if (!this.ctx) return;
      for (const v of Object.values(this.voices)) {
        this.width(v);
        if (v.pan?.panningModel && A.Music) A.Music.model(v.pan, A.Music.route === 'headphones');
      }
    },

    sceneKey() {
      const s = this.s;
      if (s.dawn) return s.night ? 'nightEnd' : 'dawn';
      const g = s.game;
      if (g) {
        if (g.id === 'breath') return g.mode === 'rest' ? 'drift' : 'stove';
        if (TASK_SCENE[g.id]) return TASK_SCENE[g.id];
      }
      if (CORE.has(s.phase) || !s.mode) return 'harbour';
      return BIOME[s.mode] || 'harbour';
    },

    compose() {
      const s = this.s, key = this.sceneKey(), sc = SCENES[key];
      const beds = { ...sc.beds }, add = [];
      if (!sc.bare) {
        if (!beds.amb_snowfall) add.push(['amb_snowfall', -10]);
        if (s.stage >= 2 && !WATER.some(w => beds[w] != null)) add.push(['amb_lake_lapping', -8]);
        if (s.stage >= 3 && beds.amb_forest_birch == null) add.push(['amb_forest_birch', -10]);
        const ex = EXTRA[s.mode];
        if (ex && !(s.night && s.mode === 'fatigue') && beds[ex[0]] == null && !s.game?.kind?.startsWith('measure')) add.push(ex);
        if (key === 'stove' && s.stoveUp) beds.amb_sauna_stove += s.stoveUp;
      }
      if (s.phase === 'walk' && !s.dawn) add.unshift(['amb_ride_ski', this.rideDb()]);
      for (const [k, d] of add) if (Object.keys(beds).length < MAX_BEDS) beds[k] = d;
      return { key, beds, points: { ...(sc.points || {}) }, fade: sc.fade || 3 };
    },
    rideDb() { return Math.max(-18, Math.min(-6, -20 + 8 * (A.MODES?.[this.s.mode]?.speed ?? 1))); },

    apply(fade, fixed) {
      const s = this.s;
      if (!s || !this.ctx) return;
      if (!this.man) { this.load().then(safe(() => { if (this.man && this.s === s) this.apply(fade, fixed); })); return; }
      if (s.frozen && !fixed) { s.stale = true; return; }
      s.stale = false;
      const sc = this.compose(), want = { ...sc.beds, ...sc.points };
      s.scene = sc.key;
      const f = fade ?? sc.fade;
      for (const name of Object.keys(this.voices)) if (name !== 'amb_lantern' && want[name] == null) this.drop(name, f);
      for (const [name, db] of Object.entries(want)) this.voice(name, db, f, fixed);
      this.evict(new Set(Object.keys(want)));
      if (!s.events || s.eventsKey !== sc.key) this.schedule(sc.key);
    },

    async lantern() {
      await this.load();
      const ctx = this.ctx, s = this.s;
      if (!s || !this.files.amb_fire_crackle || this.lanternV) return;
      const v = this.lanternV = { name: 'amb_lantern' };
      this.get('amb_fire_crackle').then(safe(buf => {
        if (!buf || this.s !== s || this.lanternV !== v) return;
        const m = this.files.amb_fire_crackle, src = ctx.createBufferSource(), lp = ctx.createBiquadFilter(), lvl = ctx.createGain(), t = ctx.currentTime;
        src.buffer = buf; src.loop = true; src.loopStart = m.loopStart; src.loopEnd = m.loopEnd;
        lp.type = 'lowpass'; lp.frequency.value = 900; lvl.gain.value = 0;
        src.connect(lp); lp.connect(lvl); lvl.connect(this.point);
        src.start(t, m.loopStart);
        lvl.gain.linearRampToValueAtTime(DB(-22), t + 1.5);
        Object.assign(v, { src, lvl });
      }));
    },
    unlantern(fade) {
      const v = this.lanternV;
      this.lanternV = null;
      if (!v?.lvl) return;
      const t = this.ctx.currentTime;
      v.lvl.gain.cancelScheduledValues(t); v.lvl.gain.setValueAtTime(v.lvl.gain.value, t); v.lvl.gain.linearRampToValueAtTime(0, t + fade);
      try { v.src.stop(t + fade + 0.1); } catch {}
    },

    filter(sec = 6) {
      const s = this.s, m = MODE[s.mode] || MODE.flow, t = this.ctx.currentTime;
      if (s.frozen) { s.filterStale = true; return; }
      s.filterStale = false;
      this.lp.frequency.setTargetAtTime(m.lp, t, sec / 3);
      this.shelf.gain.setTargetAtTime(m.shelf, t, sec / 3);
      this.depth.gain.setTargetAtTime(s.mode === 'calm' && !s.dawn ? 0.16 : 0, t, 1.5);
      Object.values(this.voices).forEach(v => this.width(v));
    },

    freeze(on) {
      const s = this.s;
      if (!s || s.frozen === on) return;
      s.frozen = on;
      const t = this.ctx.currentTime;
      if (on) { this.depth.gain.setTargetAtTime(0, t, 0.3); return; }
      if (s.stale) this.apply();
      if (s.filterStale || s.mode === 'calm') this.filter();
      this.schedule(s.scene, true);
    },

    schedule(key, reset) {
      const s = this.s, now = this.ctx.currentTime;
      s.eventsKey = key;
      const keep = s.events || {};
      s.events = {};
      for (const id of SCENES[key]?.events || []) s.events[id] = !reset && keep[id] || now + this.gap(EV[id].every);
      s.birdAt = reset || !s.birdAt ? now + this.gap(this.birdPool()?.[1] || [10, 20]) : s.birdAt;
    },
    gap([a, b], mult = 1) {
      const d = (MODE[this.s.mode]?.density ?? 1) * mult;
      return d > 0 ? rnd(a, b) / d : 1e9;
    },
    birdPool() {
      const s = this.s;
      if (s.night || s.mode === 'rest') return null;
      if (s.dawn) return BIRDS.dawn;
      if (s.stage >= 3) return BIRDS[3];
      if (s.stage >= 1) return BIRDS[1];
      return null;
    },

    events(now) {
      const s = this.s;
      if (!s || s.frozen || s.ended || s.mode === 'rest' && !s.dawn) return;
      const since = now - s.t0;
      for (const [id, at] of Object.entries(s.events || {})) {
        if (now < at) continue;
        const e = EV[id];
        s.events[id] = now + this.gap(e.every);
        if (e.stage && s.stage < e.stage) continue;
        if (s.dawn) continue;
        if (e.loud && (s.mode === 'calm' || since < LOUD_AFTER || (e.once && s.once?.[id]))) continue;
        if (e.sharp && s.mode === 'calm') continue;
        if (e.once) (s.once ||= {})[id] = true;
        const near = s.mode === 'wake' && (id === 'ping' || id === 'chime');
        this.play(e.f, { dB: e.dB != null ? e.dB + (near ? 3 : 0) : undefined, far: e.far && !near, az: rnd(...e.az) * this.side(), el: rnd(...e.el), loud: e.loud });
      }
      const pool = this.birdPool();
      if (pool && now >= s.birdAt) {
        const mult = s.dawn ? 1 : MODE[s.mode]?.birds ?? 1;
        s.birdAt = now + (s.dawn ? rnd(...pool[1]) : this.gap(pool[1], mult));
        this.bird(pool[0][Math.floor(R() * pool[0].length)]);
      }
    },
    side() { this.s.lastSide = -(this.s.lastSide || 1); return this.s.lastSide; },
    bird(name, az) {
      const s = this.s;
      if (!s || s.night) return;
      const far = s.mode === 'calm' || !s.dawn && s.stage < 3;
      this.play(name, { az: az ?? this.side() * rnd(20, 50), el: rnd(15, 35), far, lp: far ? 4000 : undefined });
    },

    breathe(name, db, open) {
      const v = this.voices[name];
      if (!v?.lvl) return;
      const t = this.ctx.currentTime, base = DB(v.target + (v.boost || 0)), p = v.lvl.gain, f = v.lp.frequency;
      p.cancelScheduledValues(t); p.setValueAtTime(p.value, t);
      p.linearRampToValueAtTime(base * DB(-db), t + 6); p.linearRampToValueAtTime(base, t + 10);
      if (open) { f.cancelScheduledValues(t); f.setValueAtTime(f.value, t); f.linearRampToValueAtTime(2200, t + 6); f.linearRampToValueAtTime(open, t + 10); }
    },

    at() {
      const p = this.touch;
      if (!p || A.now() - p.t > 1.2) return {};
      const el = document.getElementById('game'), W = el?.clientWidth || innerWidth, H = el?.clientHeight || innerHeight;
      return { az: (p.x / W * 2 - 1) * 45, el: (1 - p.y / H) * 35 - 10 };
    },

    home({ night = false } = {}) {
      this.atHome = true; this.homeNight = night;
      if (this.s?.home) { this.s.night = night; return; }
      this.stop(1);
      if (Au.on === false) return;
      this.init();
      this.load();
      const t = this.ctx.currentTime, p = this.out.gain;
      this.s = { home: true, night, t0: t, phase: 'fadein', mode: null, stage: 0, frozen: false, game: null, dawn: false, ended: false };
      this.log = [];
      p.cancelScheduledValues(t); p.setValueAtTime(p.value, t); p.linearRampToValueAtTime(1, t + 3);
      this.hush.gain.cancelScheduledValues(t); this.hush.gain.setTargetAtTime(1, t, 0.5);
      this.lp.frequency.setTargetAtTime(12000, t, 0.5); this.shelf.gain.setTargetAtTime(0, t, 0.5); this.depth.gain.setTargetAtTime(0, t, 0.5);
      this.apply(3, true);
      this.s.frozen = true;
    },

    start({ night }) {
      this.atHome = false;
      const warm = !!this.s?.home && Au.on !== false;
      if (!warm) this.stop(0.05);
      if (Au.on === false) return;
      this.init();
      this.load();
      const t = this.ctx.currentTime;
      this.s = { night, t0: t, phase: 'fadein', mode: null, stage: 0, frozen: false, game: null, dawn: false, ended: false };
      this.log = [];
      if (!warm) { this.out.gain.cancelScheduledValues(t); this.out.gain.setValueAtTime(0, t); this.out.gain.linearRampToValueAtTime(1, t + 3); }
      this.hush.gain.cancelScheduledValues(t); this.hush.gain.setValueAtTime(1, t);
      this.lp.frequency.setValueAtTime(12000, t); this.shelf.gain.setValueAtTime(0, t); this.depth.gain.setValueAtTime(0, t);
      this.apply(3, true);
      this.s.frozen = true;
      this.preload(['sfx_flame_whoosh', 'sfx_mote_gleam', 'sfx_ui_tap_wood', 'sfx_ui_tap_soft', 'sfx_step_snow', 'sfx_ski_swish', 'sfx_land_snow']);
      setTimeout(safe(() => { if (this.s?.t0 === t) { this.play('sfx_flame_whoosh', { dB: -12, fixed: true }); this.lantern(); } }), 600);
      setTimeout(safe(() => this.preload(Object.keys(this.fam).filter(k => k.startsWith('sfx_')))), 4000);
    },
    async preload(names) {
      await this.load();
      for (const n of names) for (const k of this.files[n] ? [n] : this.fam[n] || []) await this.get(k);
    },

    stop(fade = 1) {
      if (!this.ctx) return;
      for (const name of Object.keys(this.voices)) this.drop(name, fade);
      this.unlantern(fade);
      this.s = null;
    },

    end(fade, after = 0) {
      const s = this.s;
      if (!s || s.ended) return;
      s.ended = true;
      setTimeout(safe(() => {
        if (this.s !== s) return;
        const t = this.ctx.currentTime, p = this.out.gain;
        p.cancelScheduledValues(t); p.setValueAtTime(p.value, t); p.linearRampToValueAtTime(0, t + fade);
        setTimeout(safe(() => { if (this.s === s) this.stop(0.1); }), (fade + 0.3) * 1000);
      }), after * 1000);
    },

    tick() {
      if (!this.s && this.atHome && Au.on !== false) this.home({ night: this.homeNight });
      const s = this.s;
      if (!s || !this.ctx) return;
      const now = this.ctx.currentTime;
      this.events(now);
      const dip = A.Music?.owns?.(s.mode) && !s.frozen ? -2 : 0;
      if (dip !== s.dip) { s.dip = dip; this.dip.gain.setTargetAtTime(dip, now, 1); }
    },

    status() {
      const s = this.s, beds = {};
      for (const [k, v] of Object.entries(this.voices)) beds[k] = v.target;
      return { scene: s?.scene ?? null, mode: s?.mode ?? null, frozen: !!s?.frozen, stage: s?.stage ?? 0, beds, decoded: Object.keys(this.buf).length, events: this.log.length };
    },
  };

  const hook = {
    bite_plunk: () => Amb.play('sfx_ui_tap_wood_02', { dB: -8, ui: true, fixed: true }),
    bite_swell: () => Amb.play('sfx_flame_whoosh', { dB: -8, fixed: true }),
    ride_launch: () => { Amb.play('sfx_step_snow', { dB: -10, el: -20 }); Amb.play('sfx_step_snow', { dB: -11, el: -20, delay: 0.34 }); },
    ride_kick: () => Amb.play('sfx_ski_swish', { dB: -10 }),
    ride_silk: () => Amb.play('sfx_ski_swish', { dB: -16 }),
    ride_land: e => Amb.play('sfx_land_snow', { dB: e.grade === 'perfect' ? -2 : -5 }),
    ride_mote: e => Amb.play('sfx_mote_twinkle', { dB: -18, rate: Math.pow(2, PENTA[(e.step || 0) % PENTA.length] / 12), az: 20, el: 10 }),
    ride_press: () => Amb.ride(4),
    ride_release: () => Amb.ride(0),
    fork_choose: () => Amb.play('sfx_ui_tap_soft', { dB: -14, ui: true, fixed: true }),
    fork_step: e => Amb.play('sfx_ui_tap_wood', { dB: -10, ui: true, fixed: true, index: e.i || 0 }),
    fork_bowl: () => Amb.play('sfx_mote_gleam', { dB: -12, fixed: true }),
    lantern_release: () => Amb.play('sfx_ui_tap_wood_01', { dB: -8, ui: true, fixed: true }),
    lanterns_constellation: () => Amb.play('sfx_mote_twinkle_02', { dB: -10, fixed: true }),
    breath_top: () => { const g = Amb.s?.game; if (g?.mode === 'rest') Amb.breathe('amb_lake_ice_night', 2); else Amb.breathe('amb_sauna_stove', 3, 5000); },
    breath_chime: () => Amb.play('sfx_chime_single', { dB: -12, ...Amb.at() }),
    loyly_hiss: () => Amb.play('sfx_loyly_hiss', { dB: -6, ...Amb.at() }),
    loyly_bloom: () => Amb.play('sfx_loyly_hiss_long', { dB: -6 }),
    loyly_puff: () => Amb.play('sfx_loyly_hiss', { dB: -12, ...Amb.at() }),
    threads_join: () => Amb.play('sfx_mote_twinkle', { dB: -14, ...Amb.at() }),
    threads_chord: () => Amb.once('threads', 'sfx_colour_swell', { dB: -12 }),
    stars_link: e => Amb.play('sfx_icicle_tinkle', { dB: -14, rate: Math.pow(2, PENTA[Math.max(0, e.i || 0) % PENTA.length] / 12), ...Amb.at() }),
    stars_done: () => Amb.play('sfx_mote_twinkle_02', { dB: -10 }),
    ff_catch: () => Amb.play('sfx_mote_twinkle_01', { dB: -10, ...Amb.at() }),
    ff_payoff: () => Amb.play('sfx_colour_swell', { dB: -10 }),
    beacon_hit: e => { Amb.play('sfx_ice_ping', { dB: -10, timely: true, ...Amb.at() }); if (e.grade === 'perfect') Amb.play('sfx_chime_single', { dB: -16 }); },
    beacon_payoff: () => Amb.once('beacon', 'sfx_foghorn_far', { dB: -16, far: true, az: -50, el: 2, loud: true }),
    bells_ring: e => Amb.bell(e.bell, -6),
    bells_show: e => Amb.bell(e.bell, -9),
    bells_chord: () => Amb.once('bells', 'sfx_colour_swell', { dB: -12 }),
    'shutters.open': () => { const p = Amb.at(); Amb.play('sfx_ui_tap_wood_03', { dB: -8, ...p }); Amb.bird(['sfx_bird_great_tit', 'sfx_bird_chaffinch', 'sfx_bird_blackbird', 'sfx_bird_redstart'][Math.floor(R() * 4)], p.az); },
    'shutters.finale': () => Amb.play('sfx_colour_swell', { dB: -10 }),
  };
  Amb.ride = boost => {
    const v = Amb.voices.amb_ride_ski;
    if (!v || Amb.s?.frozen) return;
    v.boost = boost; Amb.level(v, boost ? 0.4 : 0.8);
  };
  Amb.bell = (i = 0, db) => {
    const n = Math.max(0, Math.min(2, i | 0));
    Amb.play('sfx_bell_hand_' + (n + 1), { dB: db, az: [-30, 0, 30][n], el: 5, timely: true });
  };
  Amb.once = (tag, name, o) => {
    const s = Amb.s;
    if (!s || s.onceTask?.[tag] === s.gameN) return;
    (s.onceTask ||= {})[tag] = s.gameN;
    Amb.play(name, o);
  };
  Amb.window = az => Amb.play('sfx_mote_gleam', { dB: -18, az: az ?? Amb.side() * rnd(15, 45), el: 5, far: true });
  Amb.measure = (on, id) => {
    const s = Amb.s;
    if (!s) return;
    if (on) { s.game = { id, kind: 'measurement' }; Amb.apply(3, true); setTimeout(safe(() => { if (Amb.s === s) Amb.freeze(true); }), 3000); }
    else Amb.freeze(false);
  };

  const on = (ev, f) => A.bus.on(ev, safe(f));
  on('ws', m => { if (m?.type === 'session_start') Amb.start({ night: m.clock === 'night' }); });
  on('pdown', p => { if (p && Number.isFinite(p.x)) Amb.touch = { x: p.x, y: p.y, t: A.now() }; });
  on('segment', p => {
    const s = Amb.s;
    if (!s || s.ended) return;
    const prev = s.phase, wasGame = s.game;
    s.phase = p;
    if (p === 'checkin' && prev === 'rest') Amb.play('sfx_mote_gleam', { dB: -16, fixed: true });
    if (wasGame && p !== 'game') {
      s.game = null;
      if (wasGame.id === 'loyly') s.stoveUp = 2;
      if (p !== 'asleep') {
        s.stage = Math.min(3, s.stage + 1);
        Amb.play('sfx_mote_gleam', { dB: -12 });
        Amb.play('sfx_colour_swell', { dB: -12, delay: 0.2 });
      }
      if (wasGame.kind === 'measurement') { Amb.freeze(false); Amb.apply(); }
    }
    if (p === 'walk' && CORE.has(prev)) { Amb.freeze(false); Amb.filter(); }
    if (p === 'walk') Amb.apply();
    if (p === 'dawn') {
      s.dawn = true;
      Amb.freeze(false);
      Amb.apply();
      Amb.filter(4);
      Amb.lp.frequency.setTargetAtTime(s.night ? 2500 : 16000, Amb.ctx.currentTime, 1.5);
      if (!s.night) {
        Amb.schedule('dawn', true);
        Amb.play('sfx_colour_swell', { dB: -6, delay: 5 });
        Amb.play('sfx_crane_call', { dB: -12, far: true, az: 35, el: 30, delay: 7 });
      }
    }
    if (p === 'asleep') Amb.end(8);
  });
  on('mode', m => {
    const s = Amb.s;
    if (!s || !MODE[m]) return;
    s.mode = m;
    Object.entries(SCENES[BIOME[m]].beds).forEach(([k]) => Amb.get(k));
    if (!s.frozen) { Amb.filter(); Amb.apply(); Amb.schedule(s.scene, true); }
    else s.filterStale = s.stale = true;
  });
  on('game', g => {
    const s = Amb.s;
    if (!s || !g) return;
    s.game = g; s.gameN = (s.gameN || 0) + 1;
    if (g.kind === 'measurement') { Amb.freeze(true); return; }
    if (g.id === 'breath' && g.mode !== 'rest') Amb.play('sfx_stove_door', { dB: -16 });
    if (g.id === 'loyly') Amb.play('sfx_stove_door', { dB: -12 });
    if (g.id === 'bells') Amb.play('sfx_bell_church_far', { dB: -10, far: true, az: 40, el: 10 });
    Amb.apply();
  });
  on('sfx', e => { if (e && hook[e.name] && Amb.s) hook[e.name](e); });
  on('endScreen', () => {
    const s = Amb.s;
    if (!s || s.home) return;
    const t = Amb.ctx.currentTime;
    Amb.hush.gain.setTargetAtTime(DB(-6), t, 1);
    if (s.night) Amb.end(8);
  });
  on('sessionEnd', r => {
    if (!Amb.s || Amb.s.home || !r) return;
    if (r.status === 'fell_asleep') Amb.end(8);
    else if (r.status === 'completed') Amb.end(3, 1.2);
    else Amb.end(2);
  });
  on('home', () => Amb.home({ night: !!A.night?.() }));

  const unlock = safe(() => { if (Au.on !== false) { Amb.init(); Amb.load(); } });
  document.addEventListener('pointerdown', unlock, { capture: true, passive: true, once: true });
  setInterval(safe(() => Amb.tick()), 250);
})();
