(() => {
  const { clamp, lerp, ease, rgb, hex, mixc } = A;
  const R = Math.random;
  const tnow = () => (A.now ? A.now() : performance.now() / 1000);
  const rm = () => !!A.config?.reducedMotion;
  const size = () => A.World?.size?.() || { W: 390, H: 844 };

  const C = Object.fromEntries(Object.entries({
    night950: '#05070F', night900: '#070A14', night850: '#0A0E1C', night800: '#0D1326', night700: '#131B36', night600: '#1C2548', night500: '#28335E',
    violet500: '#5B4B8A', violet300: '#9C8AD6', violet200: '#B79CFF',
    silver050: '#F3F6FA', silver100: '#E8EEF5', silver200: '#CBD6E2', silver300: '#B9CAD6', silver400: '#93A3B8', silver500: '#7D8DA0', silver600: '#5D6B80', silver700: '#46546A',
    green: '#5FE3A1', greenDeep: '#2FA37A', teal: '#4FC3D9', tealDeep: '#2A8FA6', ice: '#7FC8E8',
    amber: '#F2B544', amberDeep: '#D98E2B', glow: '#FFD9A0', warm: '#FFC98A', flame: '#F2E6C9',
    gold: '#FFD27A', sun: '#FFE8B8', sky: '#9FC3E0', peach: '#F7C59F', coralSoft: '#F49D6E', daylight: '#FFF3DC',
  }).map(([k, v]) => [k, hex(v)]));
  C.wood = mixc(C.amberDeep, C.night900, 0.62); C.woodD = mixc(C.amberDeep, C.night950, 0.8); C.woodL = mixc(C.amberDeep, C.night900, 0.4);
  C.bronzeD = mixc(C.amberDeep, C.night900, 0.5); C.stone = mixc(C.silver600, C.night900, 0.35); C.stoneD = mixc(C.silver700, C.night950, 0.55);
  const col = c => (typeof c === 'string' ? hex(c) : c);

  const cache = new Map(), CAP = 320, stats = { made: 0, hits: 0 };
  const SHAPE = {
    glow: [[0, 1], [0.35, 0.45], [1, 0]],
    soft: Array.from({ length: 11 }, (_, i) => [i / 10, Math.exp(-((i / 10) ** 2) * 5.5) * (1 - i / 10)]),
    ring: [[0, 0], [0.6, 0], [0.8, 1], [0.97, 0], [1, 0]],
  };
  const paint = (x, kind, S) => {
    const radial = stops => {
      const g = x.createRadialGradient(S, S, 0, S, S, S);
      for (const [t, a] of stops) g.addColorStop(t, `rgba(255,255,255,${a})`);
      x.fillStyle = g; x.fillRect(0, 0, 2 * S, 2 * S);
    };
    if (SHAPE[kind]) return radial(SHAPE[kind]);
    if (kind === 'mote') {
      radial([[0, 0.5], [0.4, 0.16], [1, 0]]);
      x.fillStyle = '#fff'; x.beginPath(); x.arc(S, S, Math.max(1, S * 0.22), 0, 6.283); x.fill();
      return;
    }
    if (kind === 'spark') {
      radial([[0, 0.9], [0.18, 0.3], [0.5, 0]]);
      x.fillStyle = '#fff';
      for (const [w, h] of [[S * 0.07, S], [S, S * 0.07]]) { x.beginPath(); x.moveTo(S - w, S); x.lineTo(S, S - h); x.lineTo(S + w, S); x.lineTo(S, S + h); x.closePath(); x.fill(); }
      return;
    }
    if (kind === 'streak') {
      x.translate(S, S); x.scale(1, 0.16);
      const g = x.createRadialGradient(0, 0, 0, 0, 0, S);
      g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.4, 'rgba(255,255,255,0.4)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = g; x.beginPath(); x.arc(0, 0, S, 0, 6.283); x.fill();
      x.setTransform(1, 0, 0, 1, 0, 0);
    }
  };
  const spr = (kind, c, r) => {
    c = col(c);
    const S = clamp(Math.ceil(Math.min(r * 2, 128) / 8) * 8, 8, 128);
    const key = `${kind}|${c[0] >> 2},${c[1] >> 2},${c[2] >> 2}|${S}`;
    let img = cache.get(key);
    if (img) { stats.hits++; cache.delete(key); cache.set(key, img); return img; }
    img = document.createElement('canvas'); img.width = img.height = 2 * S;
    const x = img.getContext('2d');
    paint(x, kind, S);
    x.globalCompositeOperation = 'source-in'; x.fillStyle = rgb(c); x.fillRect(0, 0, 2 * S, 2 * S);
    cache.set(key, img); stats.made++;
    if (cache.size > CAP) cache.delete(cache.keys().next().value);
    return img;
  };
  const sprite = (ctx, kind, c, x, y, r, a = 1, add = false, sx = 1, sy = 1) => {
    if (a <= 0.003 || r <= 0) return;
    const img = spr(kind, c, r), ga = ctx.globalAlpha, op = ctx.globalCompositeOperation;
    ctx.globalAlpha = ga * Math.min(1, a);
    if (add) ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(img, x - r * sx, y - r * sy, 2 * r * sx, 2 * r * sy);
    ctx.globalAlpha = ga;
    if (add) ctx.globalCompositeOperation = op;
  };
  const glow = (ctx, x, y, r, c, a) => sprite(ctx, 'glow', c, x, y, r, a);

  const dist = (a, b, c, d) => Math.hypot(a - c, b - d);
  const unit = b => Math.min(b.w / 1.15, b.h) / 300;
  const ring = (ctx, x, y, r, c, a, lw) => {
    if (a <= 0.003) return;
    ctx.strokeStyle = rgb(c, a); ctx.lineWidth = lw; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.283); ctx.stroke();
  };
  const disc = (ctx, x, y, r, c, a = 1) => { ctx.fillStyle = rgb(c, a); ctx.beginPath(); ctx.arc(x, y, r, 0, 6.283); ctx.fill(); };

  const finger = (ctx, x, y, s, a) => {
    if (a <= 0.01) return;
    const k = s / 30;
    ctx.save();
    ctx.translate(x, y); ctx.rotate(-0.4); ctx.scale(k, k);
    ctx.globalAlpha *= a;
    ctx.shadowColor = rgb(C.night950, 0.7); ctx.shadowBlur = 10;
    ctx.fillStyle = rgb(C.silver100, 0.95);
    ctx.beginPath();
    ctx.roundRect(-4.8, 0, 9.6, 27, 4.8);
    ctx.roundRect(-6.5, 17, 25, 25, 9);
    ctx.roundRect(-13, 23, 10, 15, 5);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = rgb(C.silver400, 0.7); ctx.lineWidth = 1.3; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(6, 25); ctx.lineTo(16, 25); ctx.moveTo(6, 31); ctx.lineTo(16, 31); ctx.stroke();
    ctx.restore();
  };

  const tapCue = (ctx, x, y, U, now, a = 1) => {
    if (a <= 0.01) return;
    const p = (now / 1.3) % 1;
    const press = rm() ? 1 : ease((p - 0.2) / 0.15) * (1 - ease((p - 0.55) / 0.2));
    const rp = clamp((p - 0.35) / 0.65, 0, 1);
    if (rp > 0 && !rm()) ring(ctx, x, y, (8 + 30 * ease(rp)) * U, C.flame, 0.75 * a * (1 - rp), 2.4 * U);
    glow(ctx, x, y, 22 * U, C.flame, 0.45 * a * press);
    finger(ctx, x + 2 * U, y + (2 + 12 * (1 - press)) * U, 32 * U, a);
  };

  const dragCue = (ctx, path, U, now, a = 1, dur = 2.6) => {
    if (a <= 0.01) return;
    const p = (now / dur) % 1, m = ease((p - 0.15) / 0.6), vis = clamp(p / 0.1, 0, 1) * (1 - clamp((p - 0.84) / 0.16, 0, 1));
    const [x, y] = path(m);
    ctx.save();
    ctx.strokeStyle = rgb(C.flame, 0.4 * a * vis); ctx.lineWidth = 3 * U; ctx.lineCap = 'round'; ctx.setLineDash([0.1, 8 * U]);
    ctx.beginPath();
    for (let i = 0; i <= 24; i++) { const [px, py] = path(m * i / 24); i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }
    ctx.stroke(); ctx.restore();
    glow(ctx, x, y, 18 * U, C.flame, 0.45 * a * vis);
    finger(ctx, x + 2 * U, y + 2 * U, 32 * U, a * vis);
  };
  const line = (x0, y0, x1, y1) => m => [lerp(x0, x1, m), lerp(y0, y1, m)];

  const dots = (ctx, cx, y, n, done, U, c = C.amber) => {
    for (let i = 0; i < n; i++) {
      const x = cx + (i - (n - 1) / 2) * 18 * U;
      if (i < done) { glow(ctx, x, y, 16 * U, c, 0.6); disc(ctx, x, y, 4 * U, mixc(c, C.silver050, 0.5)); }
      else ring(ctx, x, y, 4 * U, C.silver300, 0.35, 1.4 * U);
    }
  };

  const base = (id, max, extra) => ({ id, max, t: 0, done: false, items: 0, errors: 0, extra: {}, finishedAt: null, lastIn: 0, bar: () => null, ...extra });
  const finish = (g, now) => { if (!g.done) { g.done = true; g.finishedAt = now; } };
  const idle = (g, s) => g.t - g.lastIn > s;

  const bezier = (x1, y1, x2, y2) => {
    const bx = t => 3 * x1 * t * (1 - t) ** 2 + 3 * x2 * t * t * (1 - t) + t ** 3;
    const by = t => 3 * y1 * t * (1 - t) ** 2 + 3 * y2 * t * t * (1 - t) + t ** 3;
    const N = 64, lut = new Float32Array(N + 1);
    for (let i = 0; i <= N; i++) {
      const x = i / N;
      let lo = 0, hi = 1;
      for (let k = 0; k < 24; k++) { const m = (lo + hi) / 2; if (bx(m) < x) lo = m; else hi = m; }
      lut[i] = by((lo + hi) / 2);
    }
    return t => { t = clamp(t, 0, 1); const f = t * N, i = Math.min(N - 1, f | 0); return lerp(lut[i], lut[i + 1], f - i); };
  };
  const EASE = {
    outSoft: bezier(0.22, 1, 0.36, 1),
    inOut: bezier(0.65, 0, 0.35, 1),
    breath: bezier(0.45, 0, 0.55, 1),
    outBack: (t, s = 1.4) => { t = clamp(t, 0, 1) - 1; return 1 + (s + 1) * t ** 3 + s * t ** 2; },
    outElastic: t => { t = clamp(t, 0, 1); return t >= 1 ? 1 : 1 - Math.exp(-6 * t) * Math.cos(t * Math.PI * 4); },
    inQuad: t => clamp(t, 0, 1) ** 2,
    smooth: ease,
  };

  const spring = (s, target, freq = 4, damping = 1, dt = 1 / 60) => {
    const w = 2 * Math.PI * freq, n = Math.max(1, Math.ceil(dt * w / 0.5)), h = dt / n;
    if (s.v === undefined) s.v = 0;
    if (s.x === undefined) s.x = target;
    for (let i = 0; i < n; i++) { s.v += (w * w * (target - s.x) - 2 * damping * w * s.v) * h; s.x += s.v * h; }
    return s.x;
  };

  const squash = (t, amount = 0.85, dur = 0.25) => {
    if (rm() || t < 0 || t >= dur) return [1, 1];
    const p = t / dur, sy = 1 - (1 - amount) * Math.cos(p * Math.PI * 1.5) * (1 - 0.3 * p);
    return [1 / Math.sqrt(sy), sy];
  };
  const wobble = t => {
    if (t < 0 || t >= 0.22) return [0, 1];
    if (rm()) return [0, t < 0.2 ? 0.7 : 1];
    return [3 * Math.sin(t / 0.22 * Math.PI * 4) * (1 - t / 0.22), 1];
  };

  const clock = { lag: 0, scale: 1, stopUntil: -9, slowUntil: -9, slowScale: 1 };
  const hitstop = (g, ms = 60) => { if (rm()) return; clock.stopUntil = Math.max(clock.stopUntil, tnow() + clamp(ms, 40, 120) / 1000); };
  const slowmo = (g, scale = 0.35, ms = 400) => { if (rm()) return; clock.slowScale = clamp(scale, 0.3, 1); clock.slowUntil = tnow() + Math.min(ms, 500) / 1000; };
  const RECOVER = 0.08;
  const scaleAt = t => {
    if (t < clock.stopUntil) return 0;
    if (t < clock.stopUntil + RECOVER) return EASE.outSoft((t - clock.stopUntil) / RECOVER) * (t < clock.slowUntil ? clock.slowScale : 1);
    return t < clock.slowUntil ? clock.slowScale : 1;
  };

  const flash = {
    last: -9, small: [],
    darkRoom() {
      const amb = A.Sensors?.last?.ambient_light;
      return amb != null ? amb < 0.15 : !!A.session?.night;
    },
    sceneLum() { const V = A.session?.V; return V ? 0.08 + 0.5 * (V.daylight || 0) + 0.3 * (V.sat?.dawn || 0) : 0.08; },
    request(area, delta = 1) {
      const t = tnow(), big = area > 0.1 || (delta > 0.3 && area > 0.05);
      if (!big) {
        this.small = this.small.filter(x => t - x < 1);
        if (this.small.length >= 3) return { ok: false, big };
        this.small.push(t);
        return { ok: true, big, rise: 0, peak: delta };
      }
      if (t - this.last < 1 / 3) return { ok: false, big };
      this.last = t;
      let peak = delta;
      if (this.darkRoom()) peak = Math.min(peak, 0.25 * this.sceneLum() / Math.max(0.02, area * 0.5));
      return { ok: true, big, rise: area > 0.25 ? 0.3 : 0.12, peak };
    },
  };

  const fx = {
    list: [], limit: 120,
    add(p) {
      const L = Math.min(this.limit, 120);
      while (this.list.length >= L) this.list.shift();
      const vmax = rm() ? 0.2 * size().H : Infinity, sp = Math.hypot(p.vx || 0, p.vy || 0);
      const k = sp > vmax ? vmax / sp : 1;
      this.list.push({ x: 0, y: 0, g: 0, drag: 0, life: 0.6, size: [3, 1], alpha: [1, 0], kind: 'mote', c: C.flame, add: true, ...p, vx: (p.vx || 0) * k, vy: (p.vy || 0) * k, g2: rm() ? 0 : p.g || 0, age: 0, seed: R() * 6.283 });
    },
    n: n => Math.max(n > 0 ? 1 : 0, Math.round(n * (rm() ? 0.4 : 1))),
    step(dt) {
      for (const p of this.list) {
        p.age += dt;
        if (p.drag) { const d = Math.exp(-p.drag * dt); p.vx *= d; p.vy *= d; }
        p.vy += p.g2 * dt; p.x += p.vx * dt; p.y += p.vy * dt;
        if (p.sway && !rm()) p.x += Math.sin(p.age * p.sway[1] + p.seed) * p.sway[0] * dt;
      }
      this.list = this.list.filter(p => p.age < p.life);
    },
    draw(ctx) {
      for (const p of this.list) {
        const q = p.age / p.life, r = typeof p.size === 'function' ? p.size(q) : lerp(p.size[0], p.size[1], q);
        const a = typeof p.alpha === 'function' ? p.alpha(q) : lerp(p.alpha[0], p.alpha[1], q) * Math.min(1, q * 12);
        sprite(ctx, p.kind, p.c, p.x, p.y, r, a, p.add);
      }
    },
    clear() { this.list.length = 0; this.limit = 120; },
    burst(x, y, n, c = C.glow, speed = 180, o = {}) {
      for (let i = 0, m = fx.n(n); i < m; i++) {
        const a = R() * 6.283, s = speed * (0.45 + 0.55 * R());
        fx.add({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, drag: 4, life: 0.5, size: [3, 1], c, ...o });
      }
    },
    rise(x, y, n, c = C.amber, o = {}) {
      for (let i = 0, m = fx.n(n); i < m; i++) fx.add({ x: x + (R() - 0.5) * 6, y, vx: (R() - 0.5) * 24, vy: -(38 + 24 * R()), drag: 1.2, life: 0.7, size: [2.4, 0.8], c, sway: [10, 5], ...o });
    },
    trailMote(x, y, c = C.flame, o = {}) { fx.add({ x, y, vx: (R() - 0.5) * 6, vy: -25, life: 0.8, size: [2, 0.8], alpha: [0.8, 0], c, ...o }); },
    drip(x, y, c = C.ice, o = {}) { fx.add({ x, y, vx: (R() - 0.5) * 10, vy: 20 * R(), g: 600, life: 0.6, size: [2, 2], alpha: [0.9, 0.5], kind: 'mote', add: false, c, ...o }); },
    puff(x, y, c = C.silver100, U = 1, o = {}) {
      fx.add({ x, y, vx: (R() - 0.5) * 8, vy: -0.12 * size().H, life: 2.4, size: [30 * U, 120 * U], alpha: q => 0.18 * Math.sin(Math.PI * Math.min(1, q * 1.1)), kind: 'soft', add: false, sway: [14, 1.3], c, ...o });
    },
    snow(x, y, n, c = C.silver050, o = {}) {
      for (let i = 0, m = fx.n(n); i < m; i++) fx.add({ x: x + (R() - 0.5) * 20, y, vx: (R() - 0.5) * 20, vy: 20 + 20 * R(), life: 1.2, size: [1.6, 1.2], alpha: [0.8, 0], c, sway: [8, 2], ...o });
    },
  };

  const st = { lights: [], blooms: [], warmth: 0, spilled: false, pulseAt: -9 };
  const light = (x, y, r, c, a = 1) => { if (a > 0.003 && r > 0) st.lights.push([x, y, r, c, a]); };
  const bloom = (x, y, rMax, c = C.glow, a = 0.6, rise = 0.25, fall = 0.6) => {
    const { W, H } = size(), area = Math.min(1, Math.PI * rMax * rMax / (W * H));
    const gate = flash.request(area, a);
    if (!gate.ok) {
      const last = [...st.blooms].reverse().find(b => b.big === gate.big);
      if (last) last.t0 = Math.max(last.t0, J.at - last.rise);
      return null;
    }
    const b = { x, y, r: rMax, c, a: gate.peak, rise: clamp(Math.max(rise, gate.rise), 0.12, 0.6), fall: clamp(fall, 0.3, 1), t0: J.at, big: gate.big };
    st.blooms.push(b);
    return b;
  };
  const drawBlooms = ctx => {
    st.blooms = st.blooms.filter(b => J.at - b.t0 < b.rise + b.fall);
    for (const b of st.blooms) {
      const t = J.at - b.t0, up = t < b.rise ? EASE.outSoft(t / b.rise) : 1, down = t < b.rise ? 1 : 1 - EASE.inOut((t - b.rise) / b.fall);
      const r = rm() ? b.r : b.r * (0.55 + 0.45 * up);
      sprite(ctx, 'soft', b.c, b.x, b.y, r, b.a * up * down, true);
    }
  };
  const border = w => { st.warmth = clamp(w, 0, 1); };
  const borderWarmth = () => clamp(st.warmth + (rm() ? 0.2 : 0.35) * Math.sin(Math.PI * clamp((J.at - st.pulseAt) / 0.7, 0, 1)), 0, 1);
  const stinger = () => { st.pulseAt = J.at; hap.seq([['light', 0], ['medium', 120]]); sfx('stinger'); };
  const spill = (a = 0.5) => {
    if (st.spilled) return;
    st.spilled = true;
    const s = A.session;
    s?.kick?.(a);
    const flare = A.World?.hooks?.flareLighthouse;
    if (flare) flare(a);
    else if (s?.V && s.tween) s.tween(s.V, 'aurora', s.V.aurora, Math.min(1, s.V.aurora + 0.15 * a), 2);
  };

  const HAP = { tick: ['sel', 6], light: ['LIGHT', 10], medium: ['MEDIUM', 16], heavy: ['HEAVY', 24], success: ['SUCCESS', [10, 70, 14, 70, 22]] };
  const hs = { tick: -9, impact: -9, sel: false };
  const plugin = () => { const Cap = window.Capacitor; return Cap?.isNativePlatform?.() ? Cap.Plugins?.Haptics : null; };
  const fire = name => {
    const spec = HAP[name];
    if (!spec) return false;
    const t = performance.now() / 1000, lane = name === 'tick' ? 'tick' : 'impact';
    if (t - hs[lane] < (lane === 'tick' ? 0.07 : 0.12)) return false;
    hs[lane] = t;
    A.bus.emit('haptic', name);
    try {
      const Hp = plugin();
      if (Hp) {
        if (name === 'tick') { if (!hs.sel) { hs.sel = true; Hp.selectionStart?.(); } Hp.selectionChanged?.(); }
        else if (name === 'success') Hp.notification?.({ type: 'SUCCESS' });
        else Hp.impact?.({ style: spec[0] });
      } else navigator.vibrate?.(spec[1]);
    } catch {}
    return true;
  };
  const hap = (name, ...args) => (name === 'seq' ? hap.seq(...args) : name === 'ladder' ? hap.ladder(...args) : fire(name));
  hap.seq = list => { for (const [n, ms] of list.slice(0, 5)) ms > 0 ? setTimeout(() => fire(n), ms) : fire(n); };
  hap.ladder = (i, n) => fire(i >= n ? 'heavy' : i / n <= 1 / 3 ? 'light' : 'medium');

  const beat = {
    bpm: 60, t0: 0, cbs: [], last: -1,
    set(bpm, t0 = tnow()) { this.bpm = clamp(bpm, 20, 240); this.t0 = t0; this.cbs = []; this.last = -1; return this; },
    period() { return 60 / this.bpm; },
    phase(t = tnow()) { const x = (t - this.t0) / this.period(); return x - Math.floor(x); },
    index(t = tnow()) { return Math.floor((t - this.t0) / this.period()); },
    timeOf(i) { return this.t0 + i * this.period(); },
    offset(t = tnow()) { const i = Math.round((t - this.t0) / this.period()); return { i, off: t - this.timeOf(i) }; },
    onBeat(cb) { this.cbs.push(cb); return () => { this.cbs = this.cbs.filter(f => f !== cb); }; },
    step(t) {
      const i = this.index(t);
      if (i === this.last || i < 0) return;
      this.last = i;
      for (const cb of this.cbs) cb(i, this.timeOf(i));
    },
  };

  const SFX = { piano: p => A.Audio?.piano?.(...p), bell: () => A.Audio?.bell?.() };
  const sfx = (name, params = {}) => {
    A.bus.emit('sfx', { name, ...params });
    if (params.piano) SFX.piano(params.piano);
    if (params.bell) SFX.bell();
  };

  const J = A.J = {
    C, spr, sprite, glow, ring, disc, dist, unit, finger, tapCue, dragCue, line, dots, base, finish, idle,
    fx, light, bloom, border, borderWarmth, stinger, spill, flash, hap, beat, sfx, rm, size, stats,
    ease: EASE, bezier, spring, squash, wobble, hitstop, slowmo,
    at: 0, timeScale: 1, st,
    tempo(mode) { return A.MODES?.[mode]?.tempo ?? 60; },
    reset(t = tnow()) {
      fx.clear(); st.lights.length = 0; st.blooms.length = 0; st.warmth = 0; st.spilled = false; st.pulseAt = -9;
      Object.assign(clock, { lag: 0, scale: 1, stopUntil: -9, slowUntil: -9, slowScale: 1 });
      J.at = t; J.timeScale = 1; beat.cbs = [];
    },
    step(dt, t, g) {
      const s = scaleAt(t);
      clock.lag += dt * (1 - s);
      J.timeScale = s; J.at = t - clock.lag;
      if (g) { g.at = J.at; g.timeScale = s; }
      beat.step(t);
      fx.step(dt * s);
    },
    draw(ctx) {
      drawBlooms(ctx);
      fx.draw(ctx);
      if (st.lights.length) {
        for (const [x, y, r, c, a] of st.lights) sprite(ctx, 'soft', c, x, y, r, a, true);
        st.lights.length = 0;
      }
    },
  };
  A.MINI = { glow, dist, base, finish, unit, ring, disc, finger, tapCue, dragCue, line, dots, idle, C };
})();
