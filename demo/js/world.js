(() => {
  const { clamp, lerp, ease, hex, rgb, mixc, noise, rng, ema } = A;

  const P = {
    night950: hex('#060B17'), night900: hex('#0A1324'), night800: hex('#0E1A2E'), night700: hex('#15243F'), night600: hex('#1E3150'), night500: hex('#2C4166'),
    violet800: hex('#1E2442'), violet700: hex('#2E3560'), violet600: hex('#4E4F80'), violet500: hex('#6E6590'), violet300: hex('#B4A6CE'),
    silver050: hex('#F2EEE6'), silver100: hex('#E6ECF2'), silver200: hex('#C4D3DF'), silver300: hex('#9DB9CC'), silver400: hex('#8FA2BA'), silver600: hex('#5A6E93'), silver700: hex('#3E5478'),
    aurora: hex('#5FE3A1'), aurora2: hex('#2FA37A'), teal: hex('#8FC6E0'), teal2: hex('#4A8FB0'), ice: hex('#8FC6E0'),
    amber: hex('#FFB54A'), amber2: hex('#E0A040'), glow: hex('#FFD58A'), warmLight: hex('#FFC98A'), flame: hex('#FFE3A6'),
    coral: hex('#F3A57A'), coralSoft: hex('#F6B98A'), gold: hex('#FFD58A'), sun: hex('#FFE3A6'), dawnSky: hex('#8FA8D8'), peach: hex('#F5C9A0'), daylight: hex('#FFF0D2'),
    nightTop: hex('#0E1A2E'), nightBot: hex('#1E3150'), blueTop: hex('#22375A'), blueBot: hex('#4A6A9A'), greenTop: hex('#1B2F52'), greenBot: hex('#2F4A48'),
    sea: hex('#3A6A96'), seaDeep: hex('#172A4A'), mountain: hex('#5A6E93'), mountain2: hex('#3E5478'), spruce: hex('#2F4A48'), moss: hex('#6E8F5E'),
    snow: hex('#F2EEE6'), bark: hex('#F2EEE6'), wood: hex('#9C7448'), hut: hex('#6A4A30'), rock: hex('#8A8F9C'), cloak: hex('#E2C79C'), slate: hex('#3E5478'),
    ply: hex('#E2C79C'), plyEdge: hex('#B48E5C'), frost: hex('#9DB9CC'), lilac: hex('#B4A6CE'), kaamos: hex('#1E3150'), fjord: hex('#0E1A2E'), dusk: hex('#3E5478'),
    honey: hex('#FFD58A'), apricot: hex('#F3A57A'), ember: hex('#FFB54A'), ceiling: hex('#C8D6BE'), spring: hex('#9DBE8C'),
  };
  A.P = P;

  const LAYER = { stars: 0.02, aurora: 0.04, far: 0.1, islands: 0.2, fogFar: 0.3, mid: 0.5, fogNear: 0.7, ground: 1, fore: 1.35 };
  const GROUPS = ['yellow', 'blue', 'green', 'dawn'];

  const mk = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, w | 0); c.height = Math.max(1, h | 0); return [c, c.getContext('2d')]; };
  const r0 = rng(11);

  const SPR = {};
  (() => {
    let [c, x] = mk(128, 128), g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.2, 'rgba(255,255,255,0.6)'); g.addColorStop(0.5, 'rgba(255,255,255,0.18)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 128, 128); SPR.glow = c;

    [c, x] = mk(128, 128); g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    for (let i = 0; i <= 10; i++) { const t = i / 10; g.addColorStop(t, `rgba(255,255,255,${Math.exp(-t * t * 5.5) * (1 - t)})`); }
    x.fillStyle = g; x.fillRect(0, 0, 128, 128); SPR.soft = c;

    [c, x] = mk(32, 32); g = x.createRadialGradient(16, 16, 0, 16, 16, 16);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,255,255,0.8)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 32, 32); SPR.dot = c;

    [c, x] = mk(64, 64);
    x.translate(32, 32); x.fillStyle = '#fff';
    for (const [w, h] of [[1.2, 30], [30, 1.2]]) { const gg = x.createRadialGradient(0, 0, 0, 0, 0, 30); gg.addColorStop(0, 'rgba(255,255,255,0.9)'); gg.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = gg; x.fillRect(-w, -h, 2 * w, 2 * h); }
    x.drawImage(SPR.dot, -6, -6, 12, 12); SPR.glint = c;

    [c, x] = mk(128, 128); g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(0.3, 'rgba(0,0,0,0.92)'); g.addColorStop(0.6, 'rgba(0,0,0,0.5)'); g.addColorStop(0.85, 'rgba(0,0,0,0.12)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.fillRect(0, 0, 128, 128); SPR.lamp = c;

    [c, x] = mk(512, 96);
    const rf = rng(5);
    for (let i = 0; i < 46; i++) {
      const cx = 30 + rf() * 452, cy = 48 + (rf() - 0.5) * 30, rx = 40 + rf() * 90, a = 0.14 + rf() * 0.18;
      x.save(); x.translate(cx, cy); x.scale(1, 0.28 + rf() * 0.12); x.globalAlpha = a; x.drawImage(SPR.soft, -rx, -rx, 2 * rx, 2 * rx); x.restore();
    }
    x.globalCompositeOperation = 'destination-in';
    g = x.createLinearGradient(0, 0, 512, 0); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.2, 'rgba(0,0,0,1)'); g.addColorStop(0.8, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.fillRect(0, 0, 512, 96); SPR.fog = c;

    const curtain = (cols, grey) => {
      const [cc, cx] = mk(256, 128), ra = rng(23);
      for (let i = 0; i < 256; i++) {
        const ray = 0.45 + 0.55 * Math.pow(noise(i * 0.05 + 3) * 0.7 + noise(i * 0.17 + 9) * 0.3, 1.4) * (0.9 + 0.1 * ra());
        const gg = cx.createLinearGradient(0, 128, 0, 0);
        const c0 = grey ? [176, 202, 218] : cols[0], c1 = grey ? [143, 176, 214] : cols[1], c2 = grey ? [160, 150, 200] : cols[2];
        gg.addColorStop(0, `rgba(${c0},0)`); gg.addColorStop(0.08, `rgba(${c0},${0.9 * ray})`); gg.addColorStop(0.3, `rgba(${c1},${0.45 * ray})`);
        gg.addColorStop(0.7, `rgba(${c2},${0.14 * ray})`); gg.addColorStop(1, `rgba(${c2},0)`);
        cx.fillStyle = gg; cx.fillRect(i, 0, 1, 128);
      }
      return cc;
    };
    SPR.aurora = curtain([[95, 227, 161], [79, 195, 217], [156, 138, 214]], false);
    SPR.auroraGrey = curtain(null, true);

    [c, x] = mk(512, 128);
    for (let i = 0; i < 512; i++) {
      const q = i / 511, hw = 2 + 60 * q, a = Math.pow(1 - q, 1.7) * Math.min(1, i / 10);
      g = x.createLinearGradient(0, 64 - hw, 0, 64 + hw);
      g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, `rgba(255,255,255,${a})`); g.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = g; x.fillRect(i, 64 - hw, 1, 2 * hw);
    }
    SPR.beam = c;

    [c, x] = mk(256, 256); g = x.createRadialGradient(128, 128, 0, 128, 128, 128);
    for (const [t, a] of [[0, 0], [0.45, 0], [0.62, 0.22], [0.78, 0.8], [0.84, 1], [0.9, 0.7], [1, 0]]) g.addColorStop(t, `rgba(255,255,255,${a})`);
    x.fillStyle = g; x.fillRect(0, 0, 256, 256); SPR.halo = c;

    [c, x] = mk(128, 128);
    const id = x.createImageData(128, 128), rg = rng(3);
    for (let i = 0; i < id.data.length; i += 4) { const v = rg() * 255; id.data[i] = id.data[i + 1] = id.data[i + 2] = v; id.data[i + 3] = 255; }
    x.putImageData(id, 0, 0); SPR.grain = c;

    [c, x] = mk(96, 96);
    x.fillStyle = '#fff'; x.beginPath(); x.arc(48, 48, 40, 0, 6.283); x.fill();
    x.globalCompositeOperation = 'destination-out'; x.beginPath(); x.arc(64, 38, 36, 0, 6.283); x.fill(); SPR.moon = c;
  })();

  const tints = new Map(), spare = new Map(), TINT_MAX = 192, tintStats = { misses: 0, made: 0 };
  function tint(name, c, q = 3) {
    const r = c[0] >> q, g = c[1] >> q, b = c[2] >> q, k = name + r + ':' + g + ':' + b;
    let t = tints.get(k);
    if (t) { tints.delete(k); tints.set(k, t); return t; }
    tintStats.misses++;
    const src = SPR[name], w = src.width, h = src.height;
    if (tints.size >= TINT_MAX) {
      const [ok, old] = tints.entries().next().value, pk = old.width + 'x' + old.height, pool = spare.get(pk) || [];
      tints.delete(ok);
      if (pool.length < 8) { pool.push(old); spare.set(pk, pool); }
    }
    t = spare.get(w + 'x' + h)?.pop();
    if (!t) { [t] = mk(w, h); tintStats.made++; }
    const x = t.getContext('2d');
    x.globalCompositeOperation = 'source-over'; x.clearRect(0, 0, w, h); x.drawImage(src, 0, 0);
    x.globalCompositeOperation = 'source-in'; x.fillStyle = `rgb(${r << q},${g << q},${b << q})`; x.fillRect(0, 0, w, h);
    tints.set(k, t);
    return t;
  }

  const STARS = Array.from({ length: 16 }, () => ({ x: r0(), y: 0.03 + r0() * 0.4, s: 0.8 + r0() * 1.2, p: r0() * 6.28, f: 0.6 + r0() * 1.4 }));
  const ISLANDS = Array.from({ length: 6 }, (_, i) => ({ x: i * 520 + r0() * 200, w: 120 + r0() * 160, h: 10 + r0() * 14, trees: 2 + Math.floor(r0() * 5), seed: r0() * 99 }));
  const RIPPLES = Array.from({ length: 46 }, () => ({ x: r0(), y: r0(), w: 6 + r0() * 26, p: r0() * 6.28 }));
  const GLINTS = Array.from({ length: 70 }, () => ({ x: r0() * 1400, y: Math.pow(r0(), 0.8), p: r0() * 6.28, f: 0.8 + r0() * 2 }));

  let S = null, W = 0, H = 0, gy = 0, hy = 0, fx = 0, u = 1, ctxRef = null, rm = false, pm = 1, st = null, I = {};
  const states = new WeakMap();
  const MQ = window.matchMedia ? matchMedia('(prefers-reduced-motion: reduce)') : null;
  let sized = { W: 0, H: 0 }, vign = null, darkC = null, darkX = null, grainPat = null, borderC = null, auroraC = null, auroraX = null;
  const n0 = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);

  function newState() {
    const N = 120;
    const rs = rng(17);
    return {
      last: null, dt: 0, sun: 0, ds: { yellow: 0.05, blue: 0.05, green: 0.05, dawn: 0 }, prev: { yellow: 0, blue: 0, green: 0, dawn: 0 }, swept: false,
      phase: 0, walk: 0, swing: 0, lx: 0, ly: 0, lastX: null, rings: [], steps: [], lastStep: 0,
      flashPrev: 0, flashAt: -9, flare: 0, frame: 0, panelFrame: -9, panelA: 0, focus: 0, heavy: 0,
      snow: Array.from({ length: N }, () => ({ x: rs(), y: rs(), z: 0.35 + rs() * 1.15, p: rs() * 6.28 })),
      hk: { breath: null, pose: null, poseS: 0, flare: 0, lamp: 0, marks: [], lit: {} },
    };
  }

  function resize() {
    sized = { W, H };
    let x;
    [vign, x] = mk(W / 2, H / 2);
    const g = x.createRadialGradient(W / 4, H * 0.22, Math.min(W, H) * 0.18, W / 4, H * 0.25, Math.max(W, H) * 0.42);
    g.addColorStop(0, 'rgba(6,14,40,0)'); g.addColorStop(1, 'rgba(6,14,40,0.5)');
    x.fillStyle = g; x.fillRect(0, 0, W / 2, H / 2);
    [darkC, darkX] = mk(W / 6, H / 6);
    const [gc, gx] = mk(128, 128); gx.drawImage(SPR.grain, 0, 0); grainPat = ctxRef.createPattern(gc, 'repeat');
    [borderC, x] = mk(W / 4, H / 4);
    x.translate(W / 8, H / 8); x.scale(W / 8, H / 8);
    const eg = x.createRadialGradient(0, 0, 0, 0, 0, 1.12);
    for (let i = 0; i <= 16; i++) { const q = i / 16, v = clamp((q * 1.12 - 0.45) / 0.8, 0, 1), s = v * v * (3 - 2 * v); eg.addColorStop(q, `rgba(255,255,255,${(s * s).toFixed(4)})`); }
    x.fillStyle = eg; x.fillRect(-1.5, -1.5, 3, 3);
    SPR.border = borderC;
    for (const k of [...tints.keys()]) if (k.startsWith('border')) tints.delete(k);
  }

  const lift = () => st.ds.yellow + st.ds.blue + st.ds.green;
  const satOf = g => {
    const d = st.ds;
    if (g === 'base') return Math.max(0.05, d.dawn, 0.2 * lift());
    return Math.max(0.05, d[g] || 0, d.dawn);
  };
  const lightOf = g => {
    const own = g === 'base' ? 0 : st.ds[g] || 0;
    if (I.night) return Math.min(0.8, 0.6 + 0.025 * lift() + 0.07 * own + 0.35 * n0(S.daylight, 0));
    return Math.min(1.05, lerp(0.6, 1, st.ds.dawn) + 0.04 * lift() + 0.12 * own + 0.35 * n0(S.daylight, 0));
  };
  let HAZE = [40, 46, 60];
  const ROSE = mixc(P.lilac, P.apricot, 0.5);
  const CYANO = [[0, P.fjord], [0.16, hex('#1E3160')], [0.36, hex('#34508E')], [0.66, hex('#8DA8D4')], [1, P.silver050]];
  function cyano(l) {
    if (l <= 0) return CYANO[0][1];
    for (let i = 1; i < CYANO.length; i++) {
      const [b, cb] = CYANO[i];
      if (l <= b) { const [a, ca] = CYANO[i - 1]; return mixc(ca, cb, (l - a) / (b - a)); }
    }
    return CYANO[CYANO.length - 1][1];
  }
  function grade(c, g = 'base', haze = 0) {
    const s = satOf(g), L = lightOf(g), l = 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2], cy = cyano(l * L / 255);
    let r = lerp(cy[0], c[0] * L, s), gg = lerp(cy[1], c[1] * L, s), b = lerp(cy[2], c[2] * L, s);
    if (g === 'green') haze *= 1 - 0.6 * st.ds.dawn;
    if (haze) { r = lerp(r, HAZE[0], haze); gg = lerp(gg, HAZE[1], haze); b = lerp(b, HAZE[2], haze); }
    const dw = st.ds.dawn * (I.night ? 0.6 : 1) * (0.14 + 0.4 * haze) * (g === 'green' ? 0.35 : 1);
    if (dw > 0.002) { r = lerp(r, ROSE[0], dw); gg = lerp(gg, ROSE[1], dw); b = lerp(b, ROSE[2], dw); }
    return [clamp(r, 0, 255), clamp(gg, 0, 255), clamp(b, 0, 255)];
  }
  const col = (c, g, a = 1, haze = 0) => rgb(grade(c, g, haze), a);
  const off = f => S.worldX * f * (f === 1 ? 1 : pm);
  const sx = wx => fx + wx - S.worldX;
  const ART_V3 = new URLSearchParams(location.search).get('art') === 'v3';
  const ART = { ...A.Art, has: n => A.Art.has(n) && (ART_V3 || n === 'sky_aurora' || A.Art.has('figure_ride')) };
  const art = (n, x, y, w, h, g, a = 1, lt = 1) => ART.draw(ctxRef, n, x, y, w, h, satOf(g), Math.min(1, lightOf(g) * lt), a);
  function strip(n, f, bottom, h, g, a = 1, lt = 1, gap = 0.985) {
    if (!ART.has(n)) return false;
    const w = h * ART.aspect(n), span = w * gap, o = off(f);
    for (let x = -(((o % span) + span) % span); x < W; x += span) art(n, x, bottom - h, w, h, g, a, lt);
    return true;
  }
  const at = (wx, f = 1) => fx + (wx - S.worldX) * f;

  function sprite(ctx, name, c, x, y, w, h, a, add) {
    if (a <= 0.003) return;
    const g = ctx.globalAlpha;
    if (add) ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = g * Math.min(1, a);
    ctx.drawImage(c ? tint(name, c) : SPR[name], x, y, w, h);
    ctx.globalAlpha = g;
    if (add) ctx.globalCompositeOperation = 'source-over';
  }
  const glow = (ctx, x, y, r, c, a, name = 'glow') => sprite(ctx, name, c, x - r, y - r, 2 * r, 2 * r, a, true);

  const gcache = new Map();
  function vgrad(ctx, key, y0, y1, stops) {
    let g = gcache.get(key);
    if (!g) {
      g = ctx.createLinearGradient(0, y0, 0, y1);
      for (const [t, c] of stops) g.addColorStop(t, c);
      if (gcache.size > 64) gcache.delete(gcache.keys().next().value);
      gcache.set(key, g);
    }
    return g;
  }

  const haptic = () => {
    if (A.J) { A.J.hap.seq([['light', 0], ['light', 140]]); return; }
    try {
      const Hp = window.Capacitor?.Plugins?.Haptics;
      if (Hp?.impact) { Hp.impact({ style: 'LIGHT' }); setTimeout(() => Hp.impact({ style: 'LIGHT' }), 140); return; }
      navigator.vibrate?.([12, 110, 18]);
    } catch {}
  };

  function step() {
    const t = n0(S.t, 0);
    st.dt = st.last === null ? 0 : clamp(t - st.last, 0, 0.05);
    st.last = t;
    const dt = st.dt, sw = n0(S.sweep, 0), sat = S.sat || {};
    st.frame++;
    st.focus = st.panelFrame === st.frame - 1 ? st.panelA : 0;
    const fl = n0(S.flash, 0);
    if (fl > st.flashPrev + 0.2) st.flashAt = t;
    st.flashPrev = fl;
    st.flare = fl * (0.4 + 0.6 * clamp((t - st.flashAt) / 0.07, 0, 1));
    st.heavy = clamp((n0(S.fog, 0.4) - 0.55) / 0.25, 0, 1);
    if ((sw > 0.02 || n0(sat.dawn, 0) > 0.5) && !st.swept) { st.swept = true; haptic(); ring(I.night ? 0.4 : 1, 'dawn'); }
    const sunT = I.night ? 0 : n0(S.sunP, 0) > 0 || n0(sat.dawn, 0) > 0.5 ? Math.max(n0(S.sunP, 0), n0(sat.dawn, 0)) : 0;
    st.sun = dt ? ema(st.sun, sunT, dt, 1.1) : sunT;
    for (const g of GROUPS) {
      const target = Math.max(n0(sat[g], 0), g === 'dawn' ? ease(sw) : ease(sw) * 0.9);
      if (st.prev[g] < 0.5 && n0(sat[g], 0) >= 0.5 && g !== 'dawn' && st.last > 0.5) { haptic(); ring(0.8, g); }
      st.prev[g] = n0(sat[g], 0);
      st.ds[g] = dt ? ema(st.ds[g], target, dt, g === 'dawn' ? 1.4 : 0.8) : target;
    }
    const wx = n0(S.worldX, 0);
    st.dx = st.lastX === null ? 0 : wx - st.lastX;
    st.lastX = wx;
    st.walk = ema(st.walk, S.walking ? 1 : 0, dt || 0.016, 0.18);
    st.phase += dt * 8.5 * n0(S.stride, 1) * (0.3 + 0.7 * st.walk) * (S.walking ? 1 : 0.0);
    st.rings = st.rings.filter(r => t - r.t < r.dur + 0.4);
    st.hk.flare = dt ? ema(st.hk.flare, 0, dt, 0.7) : st.hk.flare;
    st.hk.poseS = dt ? ema(st.hk.poseS, st.hk.pose === null ? 0 : 1, dt, rm ? 0.05 : 0.18) : st.hk.poseS;
    if (S.walking && Math.floor(st.phase / Math.PI) !== st.lastStep) {
      st.lastStep = Math.floor(st.phase / Math.PI);
      st.steps.push({ x: wx - 2, side: st.lastStep % 2, t });
      if (st.steps.length > 60) st.steps.shift();
    }
  }
  const RINGC = { yellow: mixc(P.gold, P.amber, 0.5), blue: P.ice, green: P.aurora, dawn: P.glow };
  const WAVE_S = { calm: 3.5, rest: 3.5, wake: 1.8 };
  function ring(a, g) { st.rings.push({ t: n0(S.t, 0), a, g, c: RINGC[g] || P.glow, dur: WAVE_S[I.mode] || 2.4 }); }

  const CLOUDS = [['sky_dawn_cloud_1', 0.07, 1.5, 1, 0.3, 0.72], ['sky_dawn_cloud_2', 0.24, 1.0, 0.7, 0.75, 0.55], ['sky_dawn_cloud_3', 0.42, 0.7, 0.5, 0.45, 0.4]];
  let skyTop, skyMid, skyBot;
  const SKY_AT = [0, 0.5, 0.84, 1], SKY_BANDS = [0, 0.16, 0.32, 0.48, 0.62, 0.76, 0.88, 1];
  const SKY = {
    kaamos: ['#122858', '#27498A', '#4F74B8', '#86A4DA'], yellow: ['#1B3260', '#2C4680', '#4E62A0', '#8A88B0'],
    blue: ['#1F3A6E', '#33558F', '#7A86C0', '#B4A6CE'], green: ['#1A3262', '#2A4C86', '#5A7AB8', '#8EA4D2'],
    dawn: ['#6F86D6', '#B0A6E6', '#F3A57A', '#FFD58A'], nightEnd: ['#121A33', '#28294E', '#4A4470', '#6E6590'],
    daylight: ['#5C7FB8', '#9FB6DA', '#E8DCCB', '#FFF0D2'],
  };
  for (const k in SKY) SKY[k] = SKY[k].map(hex);
  const skyAt = (pal, p) => { let i = 1; while (i < 3 && p > SKY_AT[i]) i++; return mixc(pal[i - 1], pal[i], clamp((p - SKY_AT[i - 1]) / (SKY_AT[i] - SKY_AT[i - 1]), 0, 1)); };
  function skyInk() {
    const t = n0(S.t, 0), dt = st.dt, sw = n0(S.sweep, 0), sat = S.sat || {};
    if (!st.ink) st.ink = { at: {}, goal: {}, bands: SKY_BANDS.map(() => ({ yellow: st.ds.yellow, blue: st.ds.blue, green: st.ds.green })) };
    const k = st.ink, stagger = rm ? 0 : 0.09, tau = rm ? 0.6 : 0.2;
    for (const g of ['yellow', 'blue', 'green']) {
      const goal = Math.max(n0(sat[g], 0), ease(sw) * 0.9);
      if (Math.abs(goal - (k.goal[g] ?? goal)) > 0.02) k.at[g] = t;
      k.goal[g] = goal;
      k.bands.forEach((b, i) => { if (t - (k.at[g] ?? -9) >= i * stagger) b[g] = dt ? ema(b[g], goal, dt, tau) : goal; });
    }
    return k.bands;
  }
  function skyBand(p, b) {
    const d = st.ds, dl = n0(S.daylight, 0), md = I.night ? 0 : d.dawn, nd = I.night ? d.dawn : 0;
    let c = skyAt(SKY.kaamos, p);
    c = mixc(c, skyAt(SKY.yellow, p), b.yellow);
    c = mixc(c, skyAt(SKY.blue, p), b.blue);
    c = mixc(c, skyAt(SKY.green, p), b.green);
    c = mixc(c, skyAt(SKY.daylight, p), dl * 0.55);
    c = mixc(c, skyAt(SKY.dawn, p), ease(clamp(md * 1.4 - (1 - p) * 0.4, 0, 1)));
    return mixc(c, skyAt(SKY.nightEnd, p), 0.6 * nd);
  }
  function sky(ctx) {
    const d = st.ds, dawn = d.dawn, nd = I.night ? dawn : 0, md = I.night ? 0 : dawn;
    const bands = skyInk(), cols = SKY_BANDS.map((p, i) => skyBand(p, bands[i]));
    skyTop = cols[0]; skyMid = cols[3]; skyBot = cols[cols.length - 1];
    HAZE = mixc(skyBot, cols[cols.length - 3], 0.5);
    const stops = SKY_BANDS.map((p, i) => [p, rgb(cols[i].map(Math.round))]);
    ctx.fillStyle = vgrad(ctx, 'sky' + stops.map(x => x[1]).join('') + H, 0, hy + 4, stops);
    ctx.fillRect(0, 0, W, hy + 6);
    const ex = n0(S.exposure, 1);
    if (ex < 1 && md < 0.99) { ctx.fillStyle = rgb(P.night950, Math.min(0.5, (1 - ex) * 1.6) * (1 - md)); ctx.fillRect(0, 0, W, hy + 6); }
    if (d.yellow > 0.06 && dawn < 0.99) sprite(ctx, 'soft', P.amber2, -W * 0.5, hy - H * 0.13, W * 2, H * 0.26, 0.2 * d.yellow * (1 - dawn) * (1 - 0.7 * st.heavy), true);
    if (md > 0.02) {
      const o = off(LAYER.aurora) + n0(S.t, 0) * 2 * u;
      for (const [n, yk, wk, sp, ph, al] of CLOUDS) {
        if (!ART.has(n)) continue;
        const w = W * wk, span = W + w * 1.6, x = ((ph * span - o * sp) % span + span) % span - w * 0.8;
        art(n, x, hy * yk, w, w / ART.aspect(n), 'dawn', md * al, 1);
      }
    }
    if (md > 0.01 || st.sun > 0.01) {
      const p = Math.max(md, st.sun);
      glow(ctx, W * 0.72, hy, W * 0.9, P.coralSoft, 0.3 * p, 'soft');
      glow(ctx, W * 0.72, hy, W * 0.45, P.gold, 0.24 * p, 'soft');
    }
    if (nd > 0.01) {
      const ca = rgb(mixc(P.lilac, P.apricot, 0.35), 0).slice(0, -2);
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = nd;
      ctx.fillStyle = vgrad(ctx, 'firstlight' + H, hy - H * 0.22, hy + 4, [[0, ca + '0)'], [0.6, ca + '0.07)'], [1, ca + '0.16)']]);
      ctx.fillRect(0, hy - H * 0.22, W, H * 0.22 + 6);
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      sprite(ctx, 'soft', P.violet500, W * 0.72 - W * 1.1, hy - H * 0.27, W * 2.2, H * 0.36, 0.12 * nd, true);
      sprite(ctx, 'soft', mixc(P.lilac, P.apricot, 0.4), W * 0.72 - W * 0.6, hy - H * 0.2, W * 1.2, H * 0.22, 0.1 * nd, true);
    }
  }

  function stars(ctx) {
    const nightA = nightLeft(0.45) * (1 - n0(S.daylight, 0)) * (1 - 0.8 * st.sun) * (1 - 0.55 * st.heavy);
    if (nightA < 0.02) return;
    const dens = clamp(n0(S.stars, 120) / 160 + 0.3 * n0(S.sparkle, 0), 0.2, 1.4), t = n0(S.t, 0);
    const o = off(LAYER.stars), tw = rm ? 0.15 : 1;
    if (!SPR.starfield || SPR.starfield.width !== Math.round(W) || SPR.starfield.height !== Math.round(hy)) buildStars();
    for (let k = 0; k < 3; k++) {
      const a = nightA * Math.min(1, dens) * (0.55 + 0.45 * Math.sin(t * (0.7 + k * 0.45) * tw + k * 2.1)) * (k === 2 ? Math.max(0, dens - 0.4) : 1);
      if (a < 0.01) continue;
      ctx.globalAlpha = a;
      const x = -(((o * (1 + k * 0.3)) % W) + W) % W;
      ctx.drawImage(SPR.starfield[k], x, 0); ctx.drawImage(SPR.starfield[k], x + W, 0);
    }
    ctx.globalAlpha = 1;
    const c = grade(P.silver100, 'blue');
    for (const s of STARS) {
      const x = ((s.x * W - o) % W + W) % W, y = s.y * hy, a = nightA * Math.min(1, dens) * (0.45 + 0.55 * Math.sin(t * s.f * tw + s.p));
      sprite(ctx, 'glint', c, x - 7 * s.s, y - 7 * s.s, 14 * s.s, 14 * s.s, a * 0.85, true);
    }
  }
  function buildStars() {
    const rs = rng(31);
    SPR.starfield = [0, 1, 2].map(k => {
      const [c, x] = mk(W, hy);
      if (k === 0) {
        x.save(); x.translate(W * 0.55, hy * 0.3); x.rotate(-0.95);
        for (let i = 0; i < 26; i++) { const r = (40 + rs() * 70) * W / 390; x.save(); x.translate((rs() - 0.5) * hy * 1.4, (rs() - 0.5) * 30); x.scale(1, 0.35); x.globalAlpha = 0.05 + rs() * 0.05; x.drawImage(SPR.soft, -r, -r, 2 * r, 2 * r); x.restore(); }
        x.fillStyle = 'rgba(235,240,255,0.7)';
        for (let i = 0; i < 420; i++) { const v = (rs() - 0.5) * hy * 1.5, w2 = (rs() + rs() + rs() - 1.5) * 26; x.globalAlpha = 0.2 + rs() * 0.5; x.fillRect(v, w2, 0.7, 0.7); }
        x.restore(); x.globalAlpha = 1;
      }
      for (let i = 0; i < 110; i++) {
        const sx2 = rs() * W, sy = Math.pow(rs(), 1.3) * hy * 0.95, s = 0.5 + rs() * (k === 1 ? 1.3 : 0.9);
        const tc = rs() < 0.15 ? '255,236,210' : rs() < 0.3 ? '200,214,255' : '235,240,255';
        x.fillStyle = `rgba(${tc},${0.35 + rs() * 0.6})`; x.fillRect(sx2, sy, s, s);
      }
      return c;
    });
    SPR.starfield.width = Math.round(W); SPR.starfield.height = Math.round(hy);
  }

  const nightLeft = k => 1 - st.ds.dawn * (I.night ? k : 1);
  const moonX = () => Math.max(W * 0.25, W * 0.34 - off(LAYER.stars) * 0.25);

  function moon(ctx) {
    const a = nightLeft(0.3) * (1 - n0(S.daylight, 0)) * (1 - st.sun) * (1 - 0.4 * st.heavy);
    if (a < 0.02) return;
    const x = moonX(), y = H * 0.09, r = H * 0.022;
    glow(ctx, x, y, r * 16, grade(P.silver300, 'blue'), 0.16 * a, 'soft'); glow(ctx, x, y, r * 5, grade(P.silver100, 'blue'), 0.22 * a, 'soft');
    sprite(ctx, 'moon', grade(P.silver050, 'blue'), x - r * 1.2, y - r * 1.2, r * 2.4, r * 2.4, 0.9 * a, false);
  }

  function aurora(ctx) {
    const a = clamp(0.2 * (1 - st.heavy) + 1.1 * n0(S.aurora, 0) + 0.55 * st.ds.green, 0, 1) * (I.night ? 1 - 0.4 * st.ds.dawn : Math.pow(1 - Math.max(st.ds.dawn, st.sun), 2)) * (1 - n0(S.daylight, 0)) * (1 - 0.9 * st.heavy);
    if (a < 0.02) return;
    const q = 4, w = Math.ceil(W / q) + 2, h = Math.ceil(H * 0.42 / q);
    if (!auroraC || auroraC.width !== w || auroraC.height !== h) [auroraC, auroraX] = mk(w, h);
    const x = auroraX, t = n0(S.t, 0) * (rm ? 0.4 : 1), o = off(LAYER.aurora), sg = Math.max(0.22, st.ds.green);
    x.globalCompositeOperation = 'source-over'; x.globalAlpha = 1; x.clearRect(0, 0, w, h);
    x.globalCompositeOperation = 'lighter';
    for (let k = 0; k < 2; k++) {
      const base = H * (0.2 + k * 0.1), amp = H * (0.035 + k * 0.012), hgt = H * (0.13 - k * 0.03), alpha = a * (k ? 0.55 : 0.85);
      for (let i = 0; i < w; i++) {
        const px = (i - 1) * q, wx = px + o, e = Math.sin(clamp((px + q) / (W + 2 * q), 0, 1) * Math.PI);
        const y = base + amp * Math.sin(wx * 0.006 + t * (0.18 + k * 0.07) + k * 2.4) + H * 0.02 * (noise(wx * 0.01 + t * 0.25 + k * 5) - 0.5);
        const hh = hgt * (0.65 + 0.5 * noise(wx * 0.004 + t * 0.12 + k * 3));
        const u0 = ((wx * 0.35 + t * 5 + k * 90) % 253 + 253) % 253;
        const fa = alpha * e * (0.75 + 0.25 * Math.sin(t * 0.9 + wx * 0.02));
        if (sg < 0.98) { x.globalAlpha = fa * (1 - sg) * 0.9; x.drawImage(SPR.auroraGrey, u0, 0, 3, 128, i, (y - hh) / q, 1, hh * 1.08 / q); }
        if (sg > 0.02) { x.globalAlpha = fa * sg; x.drawImage(SPR.aurora, u0, 0, 3, 128, i, (y - hh) / q, 1, hh * 1.08 / q); }
      }
    }
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(auroraC, -q, 0, w * q, h * q);
    veneer(ctx, a, t, o, sg);
    if (ART.has('sky_aurora')) {
      const aw = W * 1.9, ah = aw / ART.aspect('sky_aurora'), span = aw * 1.25;
      for (let ax = -((((o + t * 4) % span) + span) % span) - aw * 0.2; ax < W; ax += span) ART.draw(ctx, 'sky_aurora', ax, H * 0.08 + Math.sin(t * 0.07) * H * 0.01, aw, ah, sg, 1, 0.42 * a * (0.2 + 0.8 * sg) * (0.85 + 0.15 * Math.sin(t * 0.5)));
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }

  function veneer(ctx, a, t, o, sg) {
    const gap = W / 22, i0 = Math.floor(o / gap) - 1, base = H * 0.2, amp = H * 0.035, hgt = H * 0.13;
    for (let i = i0; i < i0 + 25; i++) {
      const wx = i * gap + (noise(i * 3.7) - 0.5) * gap * 0.8, px = wx - o;
      if (px < -4 || px > W + 4) continue;
      const e = Math.sin(clamp(px / W, 0, 1) * Math.PI), y = base + amp * Math.sin(wx * 0.006 + t * 0.18) + H * 0.02 * (noise(wx * 0.01 + t * 0.25) - 0.5);
      const hh = hgt * (0.65 + 0.5 * noise(wx * 0.004 + t * 0.12)) * (0.7 + 0.4 * noise(i * 1.3)), u0 = ((wx * 0.35 + t * 5) % 253 + 253) % 253;
      const fa = 0.38 * a * e * (0.6 + 0.4 * Math.sin(t * 0.7 + i * 1.9));
      if (sg < 0.98) { ctx.globalAlpha = fa * (1 - sg); ctx.drawImage(SPR.auroraGrey, u0, 0, 1, 128, px, y - hh, 1.1 * u, hh * 1.08); }
      if (sg > 0.02) { ctx.globalAlpha = fa * sg; ctx.drawImage(SPR.aurora, u0, 0, 1, 128, px, y - hh, 1.1 * u, hh * 1.08); }
    }
    ctx.globalAlpha = 1;
  }

  function sun(ctx) {
    const p = st.sun;
    if (p <= 0.005) return;
    const x = W * 0.72, y = lerp(hy + H * 0.03, hy - H * 0.1, ease(p)), r = H * 0.03;
    glow(ctx, x, y, H * 0.4, P.coralSoft, 0.28 * p, 'soft');
    glow(ctx, x, y, H * 0.15, P.gold, 0.3 * p, 'soft');
    glow(ctx, x, y, r * 2.8, P.gold, 0.26 * p, 'soft');
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, W, hy + 1); ctx.clip();
    ctx.fillStyle = rgb(P.sun, Math.min(1, p * 1.4));
    ctx.beginPath(); ctx.arc(x, y, r, 0, 6.283); ctx.fill();
    glow(ctx, x, y, r * 1.3, P.sun, 0.16 * p);
    ctx.restore();
  }

  function ridge(ctx, base, amp, f, seed, sharp, step, fill) {
    const o = off(f), sc = 1 / u, pts = [];
    ctx.beginPath(); ctx.moveTo(-step, H);
    for (let x = -step; x <= W + step; x += step) {
      const q = (x + o) * sc;
      let n = 0.55 * noise(q * 0.004 + seed) + 0.3 * noise(q * 0.011 + seed * 3) + 0.15 * noise(q * 0.033 + seed * 7);
      if (sharp === 'fell') n = 0.15 + 0.85 * ease(clamp((0.75 * noise(q * 0.0072 + seed) + 0.25 * noise(q * 0.019 + seed * 3) - 0.2) / 0.6, 0, 1));
      else if (sharp) n = Math.pow(1 - Math.abs(2 * noise(q * 0.0045 + seed) - 1), 1.7) * 0.8 + 0.2 * noise(q * 0.02 + seed * 5);
      const y = base - amp * n;
      ctx.lineTo(x, y); pts.push([x, y]);
    }
    ctx.lineTo(W + step, H); ctx.closePath();
    ctx.fillStyle = fill; ctx.fill();
    return pts;
  }

  function mountains(ctx) {
    if (strip('far_mountains', LAYER.far, hy + 3 * u, H * 0.085, 'blue', 0.62, 0.72)) return;
    const FELLS = [[H * 0.1, LAYER.far, 3, P.silver100, P.silver300, 0.62], [H * 0.07, LAYER.far * 1.6, 8, P.silver300, P.mountain, 0.42], [H * 0.04, LAYER.far * 2.3, 13, P.mountain, P.mountain2, 0.26]];
    const rim = I.night ? 0 : 0.8 * st.sun;
    FELLS.forEach(([amp, f, seed, c0, c1, hz], i) => {
      const t0 = col(c0, 'blue', 1, hz), b0 = col(c1, 'blue', 1, hz + 0.1);
      const pts = ridge(ctx, hy + 2, amp, f, seed, 'fell', 6 * u, vgrad(ctx, 'fell' + seed + t0 + b0 + H, hy - amp, hy, [[0, t0], [1, b0]]));
      laminate(ctx, pts, hz, 0.8, 0.8);
      if (i === 0 && rim > 0.02) {
        ctx.strokeStyle = rgb(P.honey, rim); ctx.lineWidth = 1.5 * u; ctx.beginPath();
        pts.forEach(([x, y], j) => (j ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
      }
    });
  }

  const PLY = [[2.5, 'silver050', 0.55], [5, 'ply', 0.45], [7.5, 'plyEdge', 0.35]];
  function laminate(ctx, pts, haze = 0, w = 1, a = 1, g = 'yellow') {
    if (pts.length < 2 || a < 0.02) return;
    const n = pts.length - 1;
    ctx.save();
    ctx.beginPath(); ctx.moveTo(pts[0][0], H);
    for (const [x, y] of pts) ctx.lineTo(x, y);
    ctx.lineTo(pts[n][0], H); ctx.closePath(); ctx.clip();
    ctx.lineWidth = w * u; ctx.lineJoin = 'round';
    for (const [k, c, al] of PLY) {
      const dy = k * u * Math.max(0.6, w);
      ctx.strokeStyle = col(P[c], g, al * a, haze);
      ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1] + dy);
      for (let i = 1; i <= n; i++) ctx.lineTo(pts[i][0], pts[i][1] + dy);
      ctx.stroke();
    }
    ctx.restore();
  }

  function islands(ctx) {
    if (strip('far_islands', LAYER.islands, hy + H * 0.008, H * 0.05, 'blue', 0.92, 0.9)) { lighthouse(ctx); return; }
    const o = off(LAYER.islands), span = 3120 * u, fill = col(P.spruce, 'green', 1, 0.45), humps = [];
    ctx.fillStyle = fill; ctx.beginPath();
    for (const is of ISLANDS) {
      const x = ((is.x * u - o) % span + span) % span - 200 * u, w = is.w * u, h = is.h * u;
      if (x > W + 20 || x + w < -20) continue;
      ctx.moveTo(x, hy + 1);
      ctx.bezierCurveTo(x + w * 0.2, hy - h, x + w * 0.7, hy - h * 1.1, x + w, hy + 1);
      humps.push([x, w, h]);
      const rr = rng(is.seed | 0);
      for (let i = 0; i < is.trees; i++) {
        const tx = x + w * (0.25 + 0.5 * rr()), th = h * (0.9 + rr() * 1.1), tb = hy - h * 0.7;
        ctx.moveTo(tx - th * 0.22, tb); ctx.lineTo(tx, tb - th); ctx.lineTo(tx + th * 0.22, tb);
      }
    }
    ctx.fill();
    for (const [x, w, h] of humps) laminate(ctx, bez(x, hy + 1, x + w * 0.2, hy - h, x + w * 0.7, hy - h * 1.1, x + w, hy + 1, 10), 0.45, 0.6, 0.7);
    lighthouse(ctx);
  }
  const bez = (x0, y0, x1, y1, x2, y2, x3, y3, n) => Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n, m = 1 - t;
    return [m * m * m * x0 + 3 * m * m * t * x1 + 3 * m * t * t * x2 + t * t * t * x3, m * m * m * y0 + 3 * m * m * t * y1 + 3 * m * t * t * y2 + t * t * t * y3];
  });

  function lighthouse(ctx) {
    const x = W * 0.84 - off(LAYER.islands) * 0.08, base = hy + 1, h = H * 0.06, wb = h * 0.2, wt = h * 0.13, t = n0(S.t, 0);
    const vis = 1 - st.focus, ga = ctx.globalAlpha;
    let lampY = base - h - h * 0.05;
    if (ART.has('lighthouse')) {
      if (vis <= 0.01) return;
      const lh = H * 0.075, lw = lh * ART.aspect('lighthouse');
      art('lighthouse', x - lw * 0.495, base + lh * 0.04 - lh, lw, lh, 'yellow', 0.9 * vis, 0.85);
      lampY = base + lh * 0.04 - lh * 0.87;
      ctx.globalAlpha = ga * vis;
    } else {
    ctx.fillStyle = col(P.spruce, 'green', 1, 0.4);
    ctx.beginPath(); ctx.moveTo(x - h * 0.9, base); ctx.bezierCurveTo(x - h * 0.4, base - h * 0.3, x + h * 0.4, base - h * 0.32, x + h * 1.1, base); ctx.fill();
    if (vis <= 0.01) return;
    ctx.globalAlpha = ga * vis;
    ctx.fillStyle = col(P.silver100, 'base', 1, 0.2);
    ctx.beginPath(); ctx.moveTo(x - wb / 2, base - h * 0.15); ctx.lineTo(x - wt / 2, base - h); ctx.lineTo(x + wt / 2, base - h); ctx.lineTo(x + wb / 2, base - h * 0.15); ctx.fill();
    tower(ctx, x, base, h, wb, wt);
    }
    const day = Math.max(st.ds.dawn, st.sun, ease(n0(S.sweep, 0))), beam = n0(S.beam, 0) * (1 - day), fl = st.hk.flare, lamp = clamp(0.35 + beam + st.hk.lamp + fl, 0, 1) * (1 - 0.7 * day);
    st.hk.lh = [x, lampY];
    glow(ctx, x, lampY, h * 0.5 * (0.6 + lamp + 2.5 * fl), P.flame, 0.7 * lamp);
    if (fl > 0.01) glow(ctx, x, lampY, h * (1.5 + 3 * fl), P.glow, 0.35 * fl, 'soft');
    if (beam > 0.02) {
      ctx.save(); ctx.translate(x, lampY); ctx.globalCompositeOperation = 'lighter';
      const ang = Math.PI + Math.sin(t * (rm ? 0.4 : 0.8)) * 0.5;
      ctx.rotate(ang); ctx.globalAlpha = ga * vis * 0.55 * beam;
      ctx.drawImage(tint('beam', P.flame), 0, -H * 0.07, W * 1.1, H * 0.14);
      ctx.restore();
    }
    ctx.globalAlpha = ga;
  }

  function tower(ctx, x, base, h, wb, wt) {
    ctx.fillStyle = col(P.dusk, 'blue', 0.35, 0.2);
    ctx.beginPath(); ctx.moveTo(x - wb / 2, base - h * 0.15); ctx.lineTo(x - wt / 2, base - h); ctx.lineTo(x - wt * 0.1, base - h); ctx.lineTo(x - wb * 0.1, base - h * 0.15); ctx.fill();
    ctx.fillStyle = col(P.rock, 'base', 1, 0.2);
    ctx.fillRect(x - wt * 0.75, base - h - h * 0.05, wt * 1.5, h * 0.05);
    ctx.fillStyle = col(P.silver100, 'base', 1, 0.2);
    ctx.beginPath(); ctx.ellipse(x, base - h - h * 0.12, wt * 0.42, h * 0.08, 0, Math.PI, 0); ctx.fill();
  }

  const VQ = Number(new URLSearchParams(location.search).get('village'));
  const village = { n: Number.isFinite(VQ) && VQ > 0 ? VQ : 0, at: -9, forced: VQ > 0 };
  A.bus?.on?.('villageLight', e => { if (!village.forced) village.n = Math.max(village.n, n0(e?.morningsLit, 0)); });
  const SHORE = Array.from({ length: 60 }, (_, i) => { const r = rng(1000 + i); return { x: r(), y: r(), p: r() * 6.28, s: 0.8 + r() * 0.5 }; });
  function shoreLights(ctx) {
    const now = performance.now();
    if (!village.forced && now - village.at > 3000) { village.at = now; try { village.n = Math.max(village.n, n0(A.Streak?.summary?.().morningsLit, 0)); } catch {} }
    const n = Math.min(60, village.n | 0);
    if (!n) return;
    const t = n0(S.t, 0), span = W * 1.2, o = off(LAYER.islands), a = (1 - 0.4 * Math.max(st.ds.dawn, st.sun)) * (1 - 0.6 * st.focus);
    const core = tint('dot', P.flame), bloom = tint('glow', P.ember), refl = tint('soft', P.ember);
    for (let i = 0; i < n; i++) {
      const L = SHORE[i], x = ((L.x * span - o) % span + span) % span - W * 0.1, y = hy - (0.4 + L.y * 1.8) * u;
      if (x < -10 || x > W + 10) continue;
      const tw = a * (0.85 + 0.15 * Math.sin(t * (rm ? 0.3 : 0.94) + L.p)), r = 1.7 * u * L.s;
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.35 * tw; ctx.drawImage(bloom, x - 7 * u, y - 7 * u, 14 * u, 14 * u);
      ctx.globalAlpha = 0.22 * tw; ctx.drawImage(refl, x - 1.8 * u, hy + 1, 3.6 * u, (12 + 10 * L.y) * u);
      ctx.globalAlpha = tw; ctx.drawImage(core, x - r, y - r, 2 * r, 2 * r);
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }

  const WAY = Array.from({ length: 40 }, (_, i) => { const r = rng(2000 + i); return { j: r() - 0.5, s: 0.8 + 0.4 * r(), lean: (r() - 0.5) * 0.25 }; });
  function waymarks(ctx) {
    if (A.session) return;
    const n = Math.min(40, n0(A.BA?.marks?.(), 0) | 0);
    if (!n) return;
    const dark = col(mixc(P.dusk, P.night700, 0.5), 'base'), lit = col(mixc(P.silver050, P.silver200, 0.3), 'base', 0.95), glow = tint('glow', P.ember);
    for (let i = 0; i < n; i++) {
      const w = WAY[i], k = i / 39, x = W * (0.56 + 0.42 * k) + w.j * 6 * u, y = gy - (12 + 34 * Math.pow(k, 1.15) + (i % 2 ? 3 : 0)) * u, s = 1.5 * w.s * u * (1 - 0.3 * k);
      ctx.save(); ctx.translate(x, y); ctx.rotate(w.lean);
      for (const [dy, rx, ry] of [[0, 4.2, 1.9], [-3.1, 3.2, 1.6], [-5.7, 2.1, 1.3]]) {
        ctx.fillStyle = dark; ctx.beginPath(); ctx.ellipse(0, dy * s, rx * s, ry * s, 0, 0, 6.283); ctx.fill();
        ctx.fillStyle = lit; ctx.beginPath(); ctx.ellipse(-0.4 * s, (dy - 0.6) * s, rx * 0.7 * s, ry * 0.45 * s, 0, 0, 6.283); ctx.fill();
      }
      ctx.restore();
      if (i === n - 1) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.35; ctx.drawImage(glow, x - 9 * s, y - 15 * s, 18 * s, 18 * s); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; }
    }
  }

  function sea(ctx) {
    const top = col(mixc(mixc(HAZE, P.sea, 0.5), P.dawnSky, 0.5 * st.ds.dawn), 'blue', 1, 0.15), bot = col(mixc(P.seaDeep, P.sea, 0.5 * st.ds.dawn), 'blue');
    ctx.fillStyle = vgrad(ctx, 'sea' + top + bot + H, hy, gy, [[0, top], [1, bot]]);
    ctx.fillRect(0, hy, W, gy - hy + 2);
    const t = n0(S.t, 0), o = off(LAYER.islands), c = grade(P.silver200, 'blue');
    ctx.fillStyle = rgb(c);
    for (const r of RIPPLES) {
      const y = hy + 3 + Math.pow(r.y, 1.6) * (gy - hy) * 0.9, k = (y - hy) / (gy - hy);
      const x = ((r.x * W * 1.4 - o * (0.5 + k)) % (W * 1.4) + W * 1.4) % (W * 1.4) - W * 0.2;
      ctx.globalAlpha = 0.07 + 0.08 * Math.sin(t * (rm ? 0.3 : 0.9) + r.p);
      ctx.fillRect(x, y, r.w * u * (0.5 + k), 1);
    }
    ctx.globalAlpha = 1;
    const sunP = st.sun, nightA = nightLeft(0.3) * (1 - n0(S.daylight, 0)) * (1 - sunP) * (1 - 0.4 * st.heavy), mx = moonX(), nd = I.night ? st.ds.dawn : 0;
    if (nightA > 0.05) sprite(ctx, 'soft', grade(P.silver300, 'blue'), mx - W * 0.03, hy, W * 0.06, (gy - hy) * 0.8, 0.25 * nightA, true);
    if (sunP > 0.02) sprite(ctx, 'soft', P.gold, W * 0.72 - W * 0.09, hy - 4, W * 0.18, (gy - hy) * 1.1, 0.5 * sunP, true);
    if (nd > 0.02) sprite(ctx, 'soft', P.coral, W * 0.72 - W * 0.25, hy - 2, W * 0.5, (gy - hy) * 0.7, 0.22 * nd, true);
  }

  function midHills(ctx) {
    if (strip('mid_hills_spruce', LAYER.mid, gy + 8 * u, H * 0.13, 'green', 1, 0.82)) return;
    const c1 = col(mixc(P.snow, P.frost, 0.4), 'blue', 1, 0.22), c2 = col(mixc(P.dusk, P.kaamos, 0.4), 'blue', 1, 0.3), tc = col(mixc(P.spruce, P.night800, 0.35), 'green', 1, 0.28);
    const base = hy + H * 0.1, f = LAYER.mid, o = off(f), sc = 1 / u, step = 6 * u;
    const yAt = x => { const q = (x + o) * sc; return base - H * 0.05 * (0.25 + 0.75 * noise(q * 0.006 + 41)) - H * 0.02 * noise(q * 0.02 + 7); };
    ctx.beginPath(); ctx.moveTo(-step, gy);
    const pts = [];
    for (let x = -step; x <= W + step; x += step) { pts.push([x, yAt(x)]); ctx.lineTo(x, yAt(x)); }
    ctx.lineTo(W + step, gy); ctx.closePath();
    ctx.fillStyle = vgrad(ctx, 'mh' + c1 + c2 + H, base - H * 0.07, gy, [[0, c1], [0.3, c1], [0.75, c2], [1, c2]]); ctx.fill();
    laminate(ctx, pts, 0.3, 1, 0.85);
    const gapU = 22 * u, i0 = Math.floor((o - 40 * u) / gapU), i1 = Math.ceil((o + W + 40 * u) / gapU);
    ctx.beginPath();
    for (let i = i0; i <= i1; i++) {
      const hsh = noise(i * 7.31 + 0.5), dens = noise(i * 0.09 + 3);
      if (dens < 0.42 || hsh < 0.25) continue;
      const x = i * gapU - o + (hsh - 0.5) * gapU, yb = yAt(x) + 3 * u, th = (14 + 30 * hsh * dens) * u, tw = th * 0.24;
      ctx.moveTo(x, yb - th);
      for (let k = 0; k < 4; k++) { const yy = yb - th + th * (k + 1) / 4; ctx.lineTo(x + tw * (0.35 + k * 0.22), yy); ctx.lineTo(x + tw * 0.12, yy - th * 0.04); }
      ctx.lineTo(x, yb);
      for (let k = 3; k >= 0; k--) { const yy = yb - th + th * (k + 1) / 4; ctx.lineTo(x - tw * 0.12, yy - th * 0.04); ctx.lineTo(x - tw * (0.35 + k * 0.22), yy); }
      ctx.closePath();
    }
    ctx.fillStyle = tc; ctx.fill();
  }

  function fog(ctx, near) {
    const d = clamp(n0(S.fog, 0.4), 0, 1.4) * (1 - 0.6 * st.ds.dawn);
    if (d <= 0.01) return;
    const t = n0(S.t, 0), drift = n0(S.fogDrift, 1) * (rm ? 0.4 : 1), f = near ? LAYER.fogNear : LAYER.fogFar;
    const c = grade(mixc(P.silver300, P.glow, 0.15 * st.ds.yellow), 'blue');
    const bw = W * 1.5, bh = H * (near ? 0.12 : 0.08), span = bw * 2;
    for (let k = 0; k < 3; k++) {
      const y = near ? lerp(gy - H * 0.06, gy + H * 0.04, k / 2) : lerp(hy - H * 0.03, hy + H * 0.05, k / 2);
      const x = ((k * 397 * u + t * 8 * u * drift * (k % 2 ? 1 : -0.7) - off(f) * (1 + k * 0.1)) % span + span) % span - bw;
      const breath = 0.8 + 0.2 * Math.sin(t * (rm ? 0.15 : 0.35) + k * 2.1);
      const a = (near ? 0.5 : 0.7) * d * breath * (1 - 0.45 * st.ds.dawn);
      const im = k % 2 ? 'fog_band_b' : 'fog_band';
      if (ART.has(im)) {
        const ih = bw / ART.aspect(im);
        for (const xx of [x, x + bw * 0.98]) ART.draw(ctx, im, xx, y - ih / 2, bw, ih, satOf('blue') * 0.6, Math.min(1, lightOf('blue')), a * 0.62);
        continue;
      }
      sprite(ctx, 'fog', c, x, y - bh / 2, bw, bh, a, false);
      sprite(ctx, 'fog', c, x + bw * 0.98, y - bh / 2, bw, bh, a, false);
    }
    fogBank(ctx, near, c, t, drift);
  }

  function fogBank(ctx, near, c, t, drift) {
    const hv = st.heavy * (1 - 0.5 * st.ds.dawn);
    if (hv <= 0.01) return;
    const y0 = near ? gy - H * 0.05 : hy - H * 0.02, y1 = near ? H : gy, peak = near ? 0.35 : 0.3, k = rgb(c.map(Math.round), 1).slice(0, -2);
    ctx.globalAlpha = hv;
    ctx.fillStyle = vgrad(ctx, 'bank' + near + k + H, y0, y1, [[0, k + '0)'], [peak, k + (near ? '0.42)' : '0.5)')], [1, k + (near ? '0.18)' : '0.32)')]]);
    ctx.fillRect(0, y0, W, y1 - y0);
    ctx.globalAlpha = 1;
    const bw = W * 1.4, bh = H * (near ? 0.1 : 0.07), span = bw * 2;
    for (let i = 0; i < 2; i++) {
      const y = near ? gy + H * (0.02 + i * 0.07) : hy + H * (0.05 + i * 0.07);
      const x = ((i * 523 * u + t * 6 * u * drift * (i ? -1 : 0.8) - off(near ? LAYER.fogNear : LAYER.fogFar)) % span + span) % span - bw;
      for (const xx of [x, x + bw * 0.98]) sprite(ctx, 'fog', c, xx, y - bh / 2, bw, bh, 0.85 * hv, false);
    }
  }

  const chunks = () => (Array.isArray(S.chunks) && S.chunks.length ? S.chunks : [{ type: 'harbour', x0: -700, x1: 420, seed: 1 }]);
  const visible = () => chunks().filter(c => sx(c.x1) > -160 && sx(c.x0) < W + 160);
  const GROUND = {
    harbour: [() => mixc(P.seaDeep, P.sea, 0.35), 'blue'], forest: [() => mixc(P.snow, P.moss, 0.12), 'green'],
    lake: [() => mixc(P.ice, P.silver200, 0.35), 'blue'], sauna: [() => mixc(P.snow, P.bark, 0.5), 'yellow'], shore: [() => mixc(P.snow, P.peach, 0.45 * st.ds.dawn), 'base'],
  };
  const groundAt = type => GROUND[type] || GROUND.shore;
  const terr = wx => (typeof S.terrain === 'function' ? S.terrain(wx) * u : 0);
  const gyAt = wx => gy - terr(wx) + 3 * u * noise(wx * 0.012) - 2 * u;

  const GTOP = { forest: 0.36, shore: 0.16, sauna: 0.06, harbour: 0.03, lake: 0.03 }, GF = 60, PW = 560;
  function groundArt(ctx, c) {
    const n = 'ground_' + c.type;
    if (!ART.has(n)) return false;
    const dpr = Math.min(1.5, Math.abs(ctx.getTransform().a) || 1), top = GTOP[c.type] || 0;
    const gh = (H - gy + 8 * u) / (1 - top), f = GF, key = `g:${c.type}:${Math.round(gh)}:${dpr}`;
    if (!ART.has(key)) {
      ART.drop(`g:${c.type}:`);
      const cw = (PW + 2 * GF) * dpr, th = gh * dpr;
      ART.bake(key, n, cw, th, (x, src, w, h) => {
        const tw = th * w / h;
        for (let xx = -tw * 0.13; xx < cw; xx += tw * 0.985) x.drawImage(src, xx, 0, tw, th);
        ART.feather(x, cw, th, GF / (PW + 2 * GF));
      });
    }
    const k = Math.max(1, Math.round((c.x1 - c.x0) / PW)), pw = (c.x1 - c.x0) / k, y = gy - 3 * u - gh * top;
    for (let i = 0; i < k; i++) {
      const x = sx(c.x0 + i * pw) - f, w = pw + 2 * f;
      if (x > W || x + w < 0) continue;
      if ((c.seed + i) % 2) { ctx.save(); ctx.translate(2 * x + w, 0); ctx.scale(-1, 1); art(key, x, y, w, gh, groundAt(c.type)[1], 1, 0.8); ctx.restore(); }
      else art(key, x, y, w, gh, groundAt(c.type)[1], 1, 0.8);
    }
    return true;
  }

  function ground(ctx) {
    const vs = visible(), step = 8 * u, cs = chunks();
    const g = ctx.createLinearGradient(0, 0, W, 0), cache = {};
    const dk = 0.42 * (1 - st.ds.dawn * (I.night ? 0.4 : 1)) * (1 - 0.7 * n0(S.daylight, 0)), shade = grade(P.night700, 'blue'), warmS = grade(P.peach, 'yellow');
    const cOf = c => cache[c.type] || (cache[c.type] = mixc(mixc(grade(groundAt(c.type)[0](), groundAt(c.type)[1]), warmS, 0.12 * st.ds.yellow * (1 - st.ds.dawn)), shade, c.type === 'harbour' ? dk * 0.3 : dk));
    for (let i = 0; i <= 16; i++) {
      const x = i / 16 * W, wx = S.worldX + x - fx;
      let k = cs.findIndex(c => wx >= c.x0 && wx < c.x1);
      if (k < 0) k = wx < cs[0].x0 ? 0 : cs.length - 1;
      const c = cs[k], blend = 70;
      let cc = cOf(c);
      if (wx - c.x0 < blend && k > 0) cc = mixc(cOf(cs[k - 1]), cc, 0.5 + 0.5 * (wx - c.x0) / blend);
      else if (c.x1 - wx < blend && k < cs.length - 1) cc = mixc(cOf(cs[k + 1]), cc, 0.5 + 0.5 * (c.x1 - wx) / blend);
      g.addColorStop(i / 16, rgb(cc));
    }
    ctx.beginPath(); ctx.moveTo(-step, H + 2);
    for (let x = -step; x <= W + step; x += step) ctx.lineTo(x, gyAt(S.worldX + x - fx));
    ctx.lineTo(W + step, H + 2); ctx.closePath();
    ctx.fillStyle = g; ctx.fill();
    const gpath = () => { ctx.beginPath(); ctx.moveTo(-step, H + 2); for (let x = -step; x <= W + step; x += step) ctx.lineTo(x, gyAt(S.worldX + x - fx)); ctx.lineTo(W + step, H + 2); ctx.closePath(); };
    const painted = new Set();
    ctx.save(); gpath(); ctx.clip();
    for (const c of vs) if (groundArt(ctx, c)) painted.add(c);
    groundPly(ctx, vs.filter(c => !painted.has(c)));
    ctx.globalAlpha = 1 - 0.6 * st.ds.dawn;
    ctx.fillStyle = vgrad(ctx, 'gshade' + H + ':' + Math.round(gy), gy - H * 0.2, H + H * 0.3, [[0, 'rgba(14,26,62,0)'], [0.3, 'rgba(14,26,62,0.16)'], [1, 'rgba(10,18,44,0.55)']]);
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
    ctx.restore();
    const o = S.worldX, dc = grade(P.silver050, 'base'), sh = grade(P.night600, 'blue');
    if (painted.size < vs.length) for (let i = 0; i < 5; i++) {
      const y = gy + (H - gy) * (0.16 + i * 0.17), amp = (3 + i * 2) * u, f = 1 + i * 0.12;
      ctx.beginPath();
      const pts = [];
      for (let x = -step; x <= W + step; x += step * 2) { const q = (x + o * f) / u; const yy = y - terr(S.worldX + x - fx) - amp * noise(q * 0.008 + i * 13); pts.push(x, yy); x === -step ? ctx.moveTo(x, yy) : ctx.lineTo(x, yy); }
      ctx.strokeStyle = rgb(dc, 0.07); ctx.lineWidth = 1.2 * u; ctx.stroke();
      for (let j = pts.length - 2; j >= 0; j -= 2) ctx.lineTo(pts[j], pts[j + 1] + 14 * u);
      ctx.closePath();
      ctx.fillStyle = rgb(sh, 0.07); ctx.fill();
    }
    if (!painted.size) {
      ctx.strokeStyle = col(P.silver050, 'base', 0.22); ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = -step; x <= W + step; x += step) { const y = gyAt(S.worldX + x - fx); x === -step ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
      ctx.stroke();
    }
    const t = n0(S.t, 0);
    for (const c of vs) {
      const x0 = Math.max(0, sx(c.x0)), x1 = Math.min(W, sx(c.x1));
      if (x1 <= x0) continue;
      if (painted.has(c)) {
        const ig = c.type === 'lake' ? n0(S.iceGlow, 0) : 0, w = x1 - x0;
        if (ig > 0.01) sprite(ctx, 'soft', P.ice, x0 - w * 0.1, gy - (H - gy) * 0.2, w * 1.2, (H - gy) * 1.4, 0.35 * ig, true);
        continue;
      }
      if (c.type === 'harbour' || c.type === 'lake') {
        const cl = grade(c.type === 'lake' ? P.silver050 : P.silver200, 'blue');
        ctx.fillStyle = rgb(cl);
        for (let i = 0; i < 18; i++) {
          const wx = c.x0 + (i * 131) % (c.x1 - c.x0), y = gyAt(wx) + 6 * u + (i * 37 % 100) / 100 * (H - gy) * 0.8, x = sx(wx);
          if (x < x0 - 30 || x > x1) continue;
          ctx.globalAlpha = c.type === 'lake' ? 0.18 : 0.1 + 0.08 * Math.sin(t * (rm ? 0.3 : 1.1) + i);
          ctx.fillRect(x, y, (12 + (i * 53) % 40) * u * (0.6 + (y - gy) / (H - gy)), 1);
        }
        ctx.globalAlpha = 1;
      }
      if (c.type === 'lake') {
        const ig = n0(S.iceGlow, 0);
        ctx.strokeStyle = col(P.silver050, 'blue', 0.22); ctx.lineWidth = 1; ctx.beginPath();
        const rr = rng(c.seed | 0);
        for (let i = 0; i < 6; i++) {
          let x = sx(c.x0 + rr() * (c.x1 - c.x0)), y = gy + (0.2 + rr() * 0.6) * (H - gy);
          ctx.moveTo(x, y);
          for (let k = 0; k < 4; k++) { x += (rr() - 0.3) * 30 * u; y += (rr() - 0.5) * 10 * u; ctx.lineTo(x, y); }
        }
        ctx.stroke();
        if (ig > 0.01) { const w = x1 - x0; sprite(ctx, 'soft', P.ice, x0 - w * 0.1, gy - (H - gy) * 0.2, w * 1.2, (H - gy) * 1.4, 0.35 * ig, true); }
      }
    }
  }

  function groundPly(ctx, cs) {
    const step = 8 * u;
    for (const c of cs) {
      if (c.type === 'harbour' || c.type === 'lake') continue;
      const x0 = Math.max(-step, sx(c.x0)), x1 = Math.min(W + step, sx(c.x1)), pts = [];
      for (let x = x0; x <= x1 + 0.1; x += Math.min(step, Math.max(1, x1 - x))) { pts.push([x, gyAt(S.worldX + x - fx)]); if (x >= x1) break; }
      laminate(ctx, pts, 0, 1.5, 0.9);
    }
  }

  function glints(ctx) {
    const t = n0(S.t, 0), span = 1400 * u, c = mixc(P.silver050, P.glow, 0.25), lx = st.lx, ly = st.ly, R = n0(S.lanternRadius, 70) * u * 2.6;
    const img = tint('glint', c), night = 1 - 0.6 * n0(S.daylight, 0);
    for (const g of GLINTS) {
      const x = ((g.x * u - S.worldX) % span + span) % span - 40 * u, y = gyAt(S.worldX + x - fx) + 6 * u + g.y * Math.max(10 * u, H - gy - 10 * u);
      if (x < -10 || x > W + 10) continue;
      const ty = chunkAtX(S.worldX + x - fx)?.type;
      if (ty === 'harbour') continue;
      const d = Math.hypot(x - lx, (y - ly) * 1.8), near = clamp(1 - d / R, 0, 1);
      const tw = Math.pow(Math.max(0, Math.sin(t * g.f * (rm ? 0.3 : 1) + g.p)), 3);
      const a = (0.25 + 0.75 * near) * tw * night, s2 = (3 + 5 * near) * u * (0.5 + 0.5 * (y - gy) / (H - gy));
      if (a < 0.03) continue;
      ctx.globalAlpha = a; ctx.drawImage(img, x - s2, y - s2, 2 * s2, 2 * s2);
    }
    ctx.globalAlpha = 1;
  }

  function footprints(ctx) {
    const t = n0(S.t, 0), c = grade(P.night600, 'blue');
    ctx.fillStyle = rgb(c);
    for (const p of st.steps) {
      const ty = chunkAtX(p.x)?.type;
      if (ty === 'harbour' || ty === 'lake') continue;
      const x = sx(p.x), a = 0.32 * clamp(1 - (t - p.t) / 40, 0, 1);
      if (x < -10 || x > W + 10 || a <= 0.01) continue;
      ctx.globalAlpha = a; ctx.beginPath(); ctx.ellipse(x, gyAt(p.x) + (p.side ? 3.5 : 6) * u, 3.2 * u, 1.1 * u, 0, 0, 6.283); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function prop(n, wx, f, h, g, lt = 1, sink = 0.04) {
    if (!ART.has(n)) return false;
    const w = h * ART.aspect(n), x = at(wx, f) - w / 2;
    if (x > W + 20 || x + w < -20) return true;
    return art(n, x, gy + h * sink - h, w, h, g, 1, lt);
  }
  function backProps(c) {
    const m = (c.x0 + c.x1) / 2, cw = c.x1 - c.x0;
    if (c.type === 'harbour') prop('boathouse', c.x1 - 600, 0.94, 92 * u, 'yellow', 0.85, 0.1);
    if (c.type === 'shore' && prop('lighthouse', c.x0 + cw * 0.76, 0.9, H * 0.3, 'yellow', 0.9, 0.06)) {
      const lh = H * 0.3, lx = at(c.x0 + cw * 0.76, 0.9), ly = gy + lh * 0.06 - lh * 0.87, on = clamp(0.35 + n0(S.beam, 0) + 0.3 * st.ds.dawn, 0, 1);
      glow(ctxRef, lx, ly, lh * 0.12, P.flame, 0.6 * on); glow(ctxRef, lx, ly, lh * 0.035, P.daylight, 0.8 * on);
    }
    if (c.type === 'sauna') prop('birch_cluster', c.x0 + cw * 0.28, 0.95, H * 0.27, 'yellow', 0.85, 0.05);
    if (c.type === 'forest' && ART.has('mid_birch_grove')) prop('mid_birch_grove', m, 0.9, 300 * u, 'yellow', 0.82, 0.05);
  }

  function props(ctx, back) {
    for (const c of visible()) {
      if (c.type === 'forest') {
        if (!ART.has('mid_birch_grove')) birches(ctx, c, back);
        else if (!back) prop('birch_cluster', c.x0 + 70, 1, H * 0.31, 'yellow', 0.95, 0.05);
      }
      if (back) { if (c.type === 'lake') lakeShore(ctx, c); backProps(c); continue; }
      if (c.type === 'harbour') pier(ctx, c);
      if (c.type === 'sauna') hut(ctx, c);
      if (c.type === 'shore') shore(ctx, c);
    }
  }

  function lakeShore(ctx, c) {
    const rr = rng((c.seed | 0) + 3), base = gy - 2 * u;
    ctx.strokeStyle = col(P.spruce, 'green', 0.8, 0.1); ctx.lineWidth = 1.2; ctx.beginPath();
    for (let i = 0; i < 26; i++) {
      const wx = c.x0 + rr() * (c.x1 - c.x0), x = fx + (wx - S.worldX) * 0.9, h = (8 + rr() * 16) * u, by = base - terr(wx) * 0.9;
      if (x < -20 || x > W + 20) continue;
      ctx.moveTo(x, by); ctx.quadraticCurveTo(x + 2 * u, by - h * 0.6, x + (rr() - 0.5) * 8 * u, by - h);
    }
    ctx.stroke();
  }

  function pier(ctx, c) {
    if (ART.has('pier_boat')) {
      const w = 300 * u, h = w / ART.aspect('pier_boat'), x = sx(c.x1 - 300);
      ART.draw(ctx, 'pier_boat', x - w / 2, gy - h * 0.62, w, h, satOf('yellow'), Math.min(1, lightOf('yellow')), 1);
      return;
    }
    const p1 = c.pierEnd ?? c.x1 - 190, p0 = p1 - 370, a = sx(p0), b = sx(p1), t = n0(S.t, 0), y = gyAt(p1) - 3 * u - 2 * u * noise(p1 * 0.012) + 2 * u;
    ctx.fillStyle = col(mixc(P.wood, P.night700, 0.3), 'yellow', 1);
    for (let wx = p0 + 10; wx < p1; wx += 48) { const x = sx(wx); if (x > -10 && x < W + 10) ctx.fillRect(x, y, 4 * u, 34 * u); }
    ctx.fillStyle = col(P.wood, 'yellow', 1);
    ctx.fillRect(a, y - 4 * u, b - a, 7 * u);
    ctx.fillStyle = col(mixc(P.wood, P.night900, 0.5), 'yellow', 1); ctx.fillRect(a, y + 3 * u, b - a, 2 * u);
    ctx.fillStyle = col(P.snow, 'base', 0.9); ctx.fillRect(a, y - 5.5 * u, b - a, 2.2 * u);
    for (const px of [a, b - 5 * u]) {
      if (px < -20 || px > W + 20) continue;
      ctx.fillStyle = col(mixc(P.wood, P.night700, 0.35), 'yellow', 1); ctx.fillRect(px, y - 16 * u, 5 * u, 50 * u);
      ctx.fillStyle = col(P.snow, 'base', 0.9); ctx.beginPath(); ctx.ellipse(px + 2.5 * u, y - 16 * u, 3.6 * u, 1.8 * u, 0, Math.PI, 0); ctx.fill();
    }
    const bx = sx(c.boatX ?? c.x1 - 100), by = gy + 18 * u + Math.sin(t * (rm ? 0.4 : 1.1)) * 1.6 * u, rock = Math.sin(t * (rm ? 0.4 : 1.1) + 1) * 0.03;
    if (bx > -80 && bx < W + 80) {
      ctx.save(); ctx.translate(bx, by); ctx.rotate(rock);
      ctx.fillStyle = col(mixc(P.wood, P.night900, 0.55), 'yellow', 1);
      ctx.beginPath(); ctx.moveTo(-36 * u, -11 * u); ctx.quadraticCurveTo(0, -4 * u, 40 * u, -13 * u); ctx.lineTo(38 * u, -8 * u); ctx.quadraticCurveTo(0, -1 * u, -34 * u, -6 * u); ctx.closePath(); ctx.fill();
      ctx.fillStyle = col(P.wood, 'yellow', 1);
      ctx.beginPath(); ctx.moveTo(-34 * u, -6 * u); ctx.quadraticCurveTo(-30 * u, 8 * u, 0, 9 * u); ctx.quadraticCurveTo(30 * u, 8 * u, 38 * u, -8 * u); ctx.quadraticCurveTo(0, -1 * u, -34 * u, -6 * u); ctx.fill();
      ctx.fillStyle = col(mixc(P.wood, P.night900, 0.4), 'yellow', 1); ctx.fillRect(-22 * u, -4 * u, 3 * u, 8 * u); ctx.fillRect(16 * u, -5 * u, 3 * u, 9 * u);
      ctx.fillStyle = col(P.snow, 'base', 0.85); ctx.beginPath(); ctx.moveTo(-36 * u, -11 * u); ctx.quadraticCurveTo(0, -4 * u, 40 * u, -13 * u); ctx.quadraticCurveTo(0, -6 * u, -36 * u, -11 * u); ctx.fill();
      ctx.restore();
      ctx.strokeStyle = col(P.silver300, 'blue', 0.25); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(bx - 30 * u, by + 12 * u); ctx.lineTo(bx + 32 * u, by + 12 * u); ctx.stroke();
      ctx.strokeStyle = col(P.wood, 'yellow', 0.6); ctx.beginPath(); ctx.moveTo(sx(p1), y); ctx.quadraticCurveTo(bx - 40 * u, by + 4 * u, bx - 30 * u, by - 4 * u); ctx.stroke();
    }
  }

  function birches(ctx, c, back) {
    if (!c._birch) {
      const rr = rng((c.seed | 0) + 101);
      c._birch = Array.from({ length: 12 }, (_, i) => {
        const br = Array.from({ length: 16 }, () => ({ k: 0.42 + rr() * 0.55, d: rr() < 0.5 ? -1 : 1, l: 0.5 + rr() * 0.6, s: rr() * 9, leaf: rr() }));
        return { x: c.x0 + 20 + i * ((c.x1 - c.x0 - 40) / 12) + rr() * 26, h: 0.24 + rr() * 0.14, w: 5 + rr() * 4, back: i % 3 === 1 || i % 4 === 0, seed: rr() * 100, lean: (rr() - 0.5) * 0.08, br };
      });
    }
    const t = n0(S.t, 0), sway = rm ? 0.2 : 1, leafA = clamp((st.ds.yellow - 0.15) / 0.6, 0, 1);
    const leafC = grade(mixc(P.gold, P.amber, 0.4), 'yellow');
    for (const b of c._birch) {
      if (b.back !== back) continue;
      const f = back ? 0.82 : 1, x = fx + (b.x - S.worldX) * f;
      if (x < -70 || x > W + 70) continue;
      const h = H * b.h * (back ? 0.82 : 1), w = b.w * u * (back ? 0.75 : 1), base = gy - terr(b.x) * f + (back ? -3 : 3) * u, top = base - h, haze = back ? 0.4 : 0;
      const lean = b.lean + Math.sin(t * 0.5 + b.seed) * 0.006 * sway, tx = x + lean * h;
      ctx.fillStyle = col(P.bark, 'yellow', 1, haze);
      ctx.beginPath(); ctx.moveTo(x - w / 2, base); ctx.quadraticCurveTo(x - w * 0.4, base - h * 0.5, tx - w * 0.12, top); ctx.lineTo(tx + w * 0.12, top); ctx.quadraticCurveTo(x + w * 0.4, base - h * 0.5, x + w / 2, base); ctx.fill();
      ctx.fillStyle = col(P.night900, 'base', back ? 0.4 : 0.75, haze);
      for (let i = 0; i < 11; i++) {
        const k = 0.05 + 0.075 * i + 0.03 * noise(b.seed + i), yy = base - h * k, xx = lerp(x, tx, k), ww = w * (1 - k * 0.7);
        ctx.fillRect(xx - ww / 2 + (i % 2 ? ww * 0.45 : 0), yy, ww * (0.3 + 0.35 * noise(b.seed * 3 + i)), (1.2 + noise(b.seed + i * 5)) * u);
      }
      ctx.fillStyle = col(P.night900, 'base', back ? 0.25 : 0.5, haze); ctx.fillRect(x + w * 0.1, base - h * 0.5, w * 0.35, h * 0.5);
      ctx.strokeStyle = col(mixc(P.bark, P.night600, 0.45), 'yellow', back ? 0.4 : 0.75, haze); ctx.lineWidth = Math.max(0.8, u * (back ? 0.8 : 1.1));
      ctx.beginPath();
      const tips = [];
      for (const br of b.br) {
        const yy = base - h * br.k, xx = lerp(x, tx, br.k), len = h * 0.16 * br.l * (1.15 - br.k * 0.5);
        const sw = Math.sin(t * 0.9 + br.s) * 2.5 * u * sway, ex = xx + br.d * len, ey = yy + len * 0.55 + sw * 0.4;
        ctx.moveTo(xx, yy); ctx.bezierCurveTo(xx + br.d * len * 0.4, yy - len * 0.35, ex - br.d * len * 0.1 + sw, ey - len * 0.5, ex + sw, ey);
        if (br.leaf < 0.75) tips.push(ex + sw, ey, br.leaf);
      }
      ctx.moveTo(tx, top); ctx.quadraticCurveTo(tx + 3 * u, top - 10 * u, tx + 1 * u + Math.sin(t * 0.7 + b.seed) * 2 * u * sway, top - 18 * u);
      ctx.stroke();
      if (leafA > 0.01) {
        ctx.fillStyle = rgb(leafC, (back ? 0.55 : 0.9) * leafA);
        for (let i = 0; i < tips.length; i += 3) for (let j = 0; j < 3; j++) {
          const lx = tips[i] + (noise(tips[i + 2] * 50 + j) - 0.5) * 9 * u, ly = tips[i + 1] - j * 3.2 * u + Math.sin(t * 1.3 + j + tips[i + 2] * 9) * u * sway;
          ctx.beginPath(); ctx.ellipse(lx, ly, 1.8 * u, 1.2 * u, 0.6, 0, 6.283); ctx.fill();
        }
      }
      ctx.fillStyle = col(P.snow, 'base', back ? 0.5 : 0.9, haze);
      ctx.beginPath(); ctx.ellipse(x, base - 1, w * 2.4, 2.6 * u, 0, Math.PI, 0); ctx.fill();
    }
  }

  function hut(ctx, c) {
    const hx = c.x0 + (c.x1 - c.x0) * 0.74, x = sx(hx), w = 96 * u, h = 52 * u, t = n0(S.t, 0), stove = n0(S.stove, 0);
    if (x < -160 || x > W + 160) return;
    if (Math.abs(terr(hx + 40 * u) - terr(hx - 40 * u)) > 6 * u) return;
    const gy = gyAt(hx) + 2 * u, y = gy - h;
    const lit = 0.55 + 0.45 * stove, flick = 0.9 + 0.1 * noise(t * 4.5);
    let smx = x + w * 0.26, smy = y - 34 * u;
    glow(ctx, x - w * 0.22, y + h * 0.42, 90 * u * (0.8 + 0.4 * stove), P.amber, 0.22 * lit * flick, 'soft');
    if (ART.has('sauna_hut')) {
      const ww = 175 * u, hh = ww / ART.aspect('sauna_hut'), y0 = gy - hh + 10 * u;
      ART.draw(ctx, 'sauna_hut', x - ww / 2, y0, ww, hh, satOf('yellow'), Math.min(1, lightOf('yellow')), 1);
      const wx = x - ww / 2 + ww * 0.68, wy = y0 + hh * 0.45;
      smx = x - ww / 2 + ww * 0.295; smy = y0 + hh * 0.04;
      glow(ctx, wx, wy, 26 * u, P.glow, 0.55 * lit * flick);
      glow(ctx, wx, wy, 7 * u, P.daylight, 0.6 * lit * flick);
    } else {
      ctx.fillStyle = col(P.hut, 'yellow'); ctx.fillRect(x - w / 2, y, w, h);
      ctx.fillStyle = col(P.night900, 'base', 0.28);
      for (let i = 1; i < 7; i++) ctx.fillRect(x - w / 2, y + i * (h / 7), w, 1.4 * u);
      for (let i = 0; i < 7; i++) { ctx.fillStyle = col(mixc(P.hut, P.bark, 0.25), 'yellow'); ctx.beginPath(); ctx.arc(x - w / 2 - 1, y + (i + 0.5) * (h / 7), h / 15, 0, 6.283); ctx.fill(); }
      ctx.fillStyle = col(P.rock, 'base'); ctx.fillRect(x + w * 0.22, y - 34 * u, 9 * u, 24 * u);
      ctx.fillStyle = col(P.snow, 'base');
      ctx.beginPath(); ctx.moveTo(x - w / 2 - 12 * u, y + 3 * u); ctx.quadraticCurveTo(x - w * 0.2, y - 22 * u, x, y - 28 * u); ctx.quadraticCurveTo(x + w * 0.2, y - 22 * u, x + w / 2 + 12 * u, y + 3 * u); ctx.closePath(); ctx.fill();
      ctx.fillStyle = col(P.silver300, 'base', 0.5); ctx.fillRect(x - w / 2 - 12 * u, y + 1 * u, w + 24 * u, 2.5 * u);
      ctx.fillStyle = col(P.night900, 'base'); ctx.fillRect(x + w * 0.12, y + h * 0.3, w * 0.2, h * 0.7);
      const wc = mixc([60, 52, 46], P.amber, lit * flick);
      ctx.fillStyle = rgb(mixc(grade(P.night700, 'base'), wc, Math.max(satOf('yellow'), 0.5))); ctx.fillRect(x - w * 0.32, y + h * 0.3, w * 0.2, h * 0.24);
      ctx.fillStyle = col(P.hut, 'yellow'); ctx.fillRect(x - w * 0.225, y + h * 0.3, 1.5 * u, h * 0.24);
      glow(ctx, x - w * 0.22, y + h * 0.42, 34 * u, P.glow, 0.5 * lit * flick);
      ctx.fillStyle = col(P.wood, 'yellow');
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3 - i; j++) { ctx.beginPath(); ctx.arc(x + w / 2 + 14 * u + j * 9 * u + i * 4.5 * u, gy - 4 * u - i * 8 * u, 4.2 * u, 0, 6.283); ctx.fill(); }
    }
    const sc = grade(P.silver300, 'base');
    for (let i = 0; i < 6; i++) {
      const p = ((t * (rm ? 0.08 : 0.16) + i / 6) % 1);
      sprite(ctx, 'soft', sc, smx + p * 26 * u + Math.sin(t * 0.7 + i) * 4 * u - (6 + p * 18) * u, smy - p * 70 * u - (6 + p * 18) * u, 2 * (6 + p * 18) * u, 2 * (6 + p * 18) * u, 0.32 * (1 - p) * Math.min(1, p * 5), false);
    }
  }

  function shore(ctx, c) {
    const rr = rng((c.seed | 0) + 7);
    for (let i = 0; i < 5; i++) {
      const wx = c.x0 + 60 + rr() * (c.x1 - c.x0 - 120), x = sx(wx), w = (24 + rr() * 40) * u, h = (10 + rr() * 16) * u;
      if (x < -60 || x > W + 60) continue;
      ctx.fillStyle = col(P.rock, 'base');
      const gy = gyAt(wx) + 4 * u;
      ctx.beginPath(); ctx.ellipse(x, gy + 2 * u, w, h, 0, Math.PI, 0); ctx.fill();
      ctx.fillStyle = col(P.snow, 'base', 0.95);
      ctx.beginPath(); ctx.ellipse(x - w * 0.1, gy + 2 * u - h * 0.72, w * 0.62, h * 0.32, 0, Math.PI, 0); ctx.fill();
    }
    const cwx = c.x0 + (c.x1 - c.x0) * 0.62, cx = sx(cwx), gy = gyAt(cwx) + 2 * u;
    if (cx > -40 && cx < W + 40 && Math.abs(terr(cwx + 20 * u) - terr(cwx - 20 * u)) < 5 * u) {
      ctx.fillStyle = col(P.rock, 'base');
      for (let i = 0; i < 4; i++) { const r = (9 - i * 1.8) * u; ctx.beginPath(); ctx.ellipse(cx + (i % 2 ? 1 : -1) * u, gy - 2 * u - i * 7 * u - r * 0.3, r * 1.2, r * 0.7, 0, 0, 6.283); ctx.fill(); }
    }
  }

  function rig() {
    const k = H * 0.086 / 60, walk = st.walk, ph = st.phase, t = n0(S.t, 0);
    const bob = walk * Math.abs(Math.sin(ph)) * 1.8;
    const breath = st.hk.breath !== null ? st.hk.breath * 2 - 1 : (1 - walk) * Math.sin(t * 1.6);
    const swing = walk * 0.22 * Math.sin(ph + 0.9) + (1 - walk) * 0.05 * Math.sin(t * 0.9) * (rm ? 0.4 : 1);
    const hx = 13 + walk * 1.5 * Math.sin(ph), hy2 = -24 + breath * 0.3;
    const pa = st.hk.pose ?? st.hk.lastPose ?? 0, pp = st.hk.poseS, tx = hx + pp * 24 * Math.cos(pa), ty = hy2 - pp * 24 * Math.sin(pa);
    if (st.hk.pose !== null) st.hk.lastPose = st.hk.pose;
    const Rd = S.ride, air = Rd ? n0(Rd.air, 0) * u : 0, sq = Rd?.squash || [1, 1];
    const a = Rd ? -n0(Rd.angle, 0) * 0.6 : 0, sxk = k * (rm ? 1 : sq[0]), syk = k * (rm ? 1 : sq[1]) * (1 - 0.12 * n0(Rd?.crouch, 0)) * (1 - 0.3 * n0(Rd?.sit, 0));
    const ox = fx, oy = gyAt(S.worldX) + 1 - air, ca = Math.cos(a), sa = Math.sin(a);
    const map = (px, py) => { const X = sxk * px, Y = syk * (py - bob); return [ox + ca * X - sa * Y, oy + sa * X + ca * Y]; };
    const swing2 = swing + (Rd ? -0.5 * n0(Rd.speed01, 0) * (rm ? 0.3 : 1) : 0);
    st.fig = { k, walk, ph, bob, breath, swing: swing2, hx, hy: hy2, tx, ty, pole: pp, a, sxk, syk, ox, oy, air, map, spread: n0(Rd?.spread, 0), speed: n0(Rd?.speed01, 0) };
    st.hand = map(hx, hy2); st.tip = map(tx, ty);
    st.lx = st.tip[0] + k * Math.sin(swing2) * 5;
    st.ly = st.tip[1] + k * Math.cos(swing2) * 5;
    const sp = figSprite();
    if (sp) {
      const [n, ax, , lx, ly] = sp, fh = H * FIG_H, fw = fh * ART.aspect(n), x0 = fx - fw * ax, y0 = oy + 2 * u - fh - bob * k;
      st.fig.sp = { n, x0, y0, fw, fh };
      const qx = (x0 + fw * lx - ox) * sxk / k, qy = (y0 + fh * ly - oy) * syk / k;
      st.hand = [ox + ca * qx - sa * qy, oy + sa * qx + ca * qy];
      st.tip = [st.hand[0] + pp * 24 * k * Math.cos(pa), st.hand[1] - pp * 24 * k * Math.sin(pa)];
      st.lx = st.tip[0] + Math.sin(swing2) * 1.5 * u;
      st.ly = st.tip[1];
    }
  }
  const FIG_H = 0.1, FIGS = { walk: ['figure_walk', 0.48, 0, 0.93, 0.44], stand: ['figure_stand', 0.33, 0, 0.9, 0.4] };
  const figSprite = () => { const s = st.walk > 0.5 ? FIGS.walk : FIGS.stand; return ART.has(s[0]) ? s : null; };

  function figure(ctx) {
    const F = st.fig, { k, walk, ph, bob, breath } = F, t = n0(S.t, 0), sway = rm ? 0.3 : 1;
    const bright = n0(S.lanternBright, 1), warm = mixc(P.glow, P.amber, 0.3);
    const sh = clamp(1 - F.air / (160 * u), 0.25, 1), gyF = gyAt(S.worldX);
    sprite(ctx, 'soft', P.night950, fx - 16 * k * sh, gyF - 2 * k, 32 * k * sh, 7 * k, 0.6 * sh, false);
    if (F.sp) {
      const { n, x0, y0, fw, fh } = F.sp, lean = walk * 0.025 * Math.sin(ph * 2) * sway, sq = 1 + 0.012 * breath;
      ctx.save(); ctx.translate(F.ox, F.oy); ctx.rotate(lean + F.a); ctx.scale(F.sxk / k, sq * F.syk / k); ctx.translate(-F.ox, -F.oy);
      ART.draw(ctx, n, x0, y0, fw, fh, Math.max(0.3, satOf('yellow')), Math.min(1, lerp(0.62, 1, Math.max(st.ds.dawn, 0.5 * n0(S.daylight, 0))) + 0.1 * bright), 1);
      ctx.restore();
      return;
    }
    keeper(ctx, F, t, sway, bright, warm);
  }

  const WOOL_LIT = mixc(P.ply, P.plyEdge, 0.4).map(v => v * 0.9);
  function keeper(ctx, F, t, sway, bright, warm) {
    const { k, walk, ph, bob, breath } = F, by = 1 + breath * 0.012;
    const fl = (Math.sin(t * 1.4) * 0.6 * sway + walk * Math.sin(ph * 2) * 1.1), wind = (noise(t * 0.6) - 0.5) * 1.2 * sway;
    const pool = 0.75 * (1 - satOf('yellow')) * Math.min(1, bright), wool = mixc(grade(P.cloak, 'yellow'), WOOL_LIT, pool), shade = mixc(wool, grade(P.kaamos, 'base'), 0.6), lit = Math.min(1, 0.8 * bright);
    ctx.save(); ctx.translate(F.ox, F.oy); ctx.rotate(F.a); ctx.scale(F.sxk, F.syk); ctx.translate(0, -bob);
    ctx.fillStyle = rgb(grade(P.night800, 'base'));
    for (const s of [-1, 1]) {
      const step = walk * Math.sin(ph + (s > 0 ? 0 : Math.PI)), lift = Math.max(0, step) * 2.2;
      ctx.beginPath(); ctx.ellipse(s * 4 + step * 3.5, -1.4 - lift, 3.4, 1.8, 0, 0, 6.283); ctx.fill();
    }
    ctx.save(); ctx.scale(1, by);
    const bell = () => {
      ctx.beginPath();
      ctx.moveTo(-15 - fl - wind, -2.2);
      ctx.bezierCurveTo(-12.5 - wind * 0.5, -12, -9.5, -24, -8.6, -33);
      ctx.bezierCurveTo(-11.2, -37, -11.6, -42, -10.2, -46);
      ctx.bezierCurveTo(-8.4, -51.5, -3.5, -54, 1, -54);
      ctx.bezierCurveTo(6.5, -54, 11.2, -49.5, 11.2, -43);
      ctx.bezierCurveTo(11.2, -38.5, 10, -35.5, 8.6, -33.5);
      ctx.bezierCurveTo(9.6, -24, 11.6, -12, 14 + fl * 0.4, -2.2);
      ctx.quadraticCurveTo(0, 0.8 + fl * 0.2, -15 - fl - wind, -2.2);
      ctx.closePath();
    };
    ctx.save(); ctx.translate(1.2, -0.4); ctx.fillStyle = rgb(mixc(warm, P.flame, 0.35), lit * 0.9); bell(); ctx.fill(); ctx.restore();
    ctx.fillStyle = rgb(wool); bell(); ctx.fill();
    ctx.save(); bell(); ctx.clip();
    const sg = ctx.createLinearGradient(-15, 0, 10, 0);
    sg.addColorStop(0, rgb(shade, 0.95)); sg.addColorStop(0.5, rgb(shade, 0.45)); sg.addColorStop(1, rgb(shade, 0));
    ctx.fillStyle = sg; ctx.fillRect(-20, -60, 40, 64);
    ctx.strokeStyle = rgb(mixc(grade(P.plyEdge, 'yellow'), P.plyEdge, pool)); ctx.lineWidth = 1;
    for (const y of [-7.6, -4.8]) { ctx.beginPath(); ctx.moveTo(-17 - fl, y - 0.4); ctx.quadraticCurveTo(0, y + 2.2, 16, y - 0.6); ctx.stroke(); }
    ctx.fillStyle = rgb(mixc(shade, P.night900, 0.3), 0.55);
    ctx.beginPath(); ctx.moveTo(-9.4, -34); ctx.bezierCurveTo(-4, -30.4, 4, -30.4, 9.4, -34); ctx.bezierCurveTo(4, -32.2, -4, -32.2, -9.4, -34); ctx.fill();
    ctx.restore();
    ctx.restore();
    ctx.strokeStyle = rgb(mixc(wool, shade, 0.3)); ctx.lineWidth = 3.4; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(6, -29 * by); ctx.quadraticCurveTo(10, -26, F.hx, F.hy); ctx.stroke();
    ctx.restore();
    const gp = F.map(7, -24);
    glow(ctx, gp[0], gp[1], 22 * k, warm, Math.min(0.3, 0.16 * bright), 'soft');
  }

  function lantern(ctx) {
    const F = st.fig, k = F.k, t = n0(S.t, 0), x = st.lx, y = st.ly;
    const f = st.flare, fl = (0.88 + 0.12 * noise(t * (rm ? 2 : 7)) + 0.05 * noise(t * 19)) * n0(S.flame, 1) * (1 + 1.4 * f), br = n0(S.lanternBright, 1);
    const [hx, hy2] = st.hand, [px, py] = st.tip;
    if (F.pole > 0.02) { ctx.strokeStyle = col(P.wood, 'yellow', F.pole); ctx.lineWidth = 1.6 * k; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(hx, hy2); ctx.lineTo(px, py); ctx.stroke(); }
    if (F.sp) {
      glow(ctx, x, y, 5 * k * fl, P.daylight, 0.85 * br);
      glow(ctx, x, y, 22 * k * fl, P.glow, 0.55 * br);
      for (const sp of S.sparks || []) { const age = t - sp.born; if (age >= 0 && age <= 1) glow(ctx, x + sp.dx * age * 34, y + sp.dy * age * 40 - age * 10, 2.4 * k, P.flame, 1 - age); }
      return;
    }
    ctx.strokeStyle = rgb(P.night950, 0.9); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(x, y - 3.5 * k); ctx.stroke();
    ctx.save(); ctx.translate(x, y); ctx.rotate(F.swing);
    ctx.fillStyle = rgb(P.night900); ctx.beginPath(); ctx.ellipse(0, -3.2 * k, 2.4 * k, 1.3 * k, 0, Math.PI, 0); ctx.fill(); ctx.fillRect(-2.2 * k, 3 * k, 4.4 * k, 1.2 * k);
    ctx.fillStyle = rgb(mixc(P.glow, P.flame, 0.5)); ctx.beginPath(); ctx.ellipse(0, 0.4 * k, 2.4 * k, 2.9 * k, 0, 0, 6.283); ctx.fill();
    ctx.restore();
    glow(ctx, x, y, 7 * k * fl / (1 + 0.8 * f), P.flame, 0.9 * br);
    glow(ctx, x, y, 22 * k * fl, mixc(P.glow, P.ember, 0.35 + 0.25 * f), Math.min(1, 0.6 * br + 0.25 * f));
    for (const sp of S.sparks || []) {
      const age = t - sp.born;
      if (age > 1 || age < 0) continue;
      glow(ctx, x + sp.dx * age * 34, y + sp.dy * age * 40 - age * 10, 2.4 * k, P.flame, 1 - age);
    }
  }

  function lanternLight(ctx) {
    const R = n0(S.lanternRadius, 70) * u, br = n0(S.lanternBright, 1), t = n0(S.t, 0), x = st.lx, y = st.ly, f = st.flare;
    const fl = 0.93 + 0.07 * noise(t * (rm ? 1.5 : 5)), warm = mixc(mixc(P.amber, P.glow, 0.4), P.amber2, clamp(n0(S.warm, 0) * 2, 0, 0.35));
    glow(ctx, x, y, R * 3.2 * fl * (1 + 0.5 * f), warm, 0.17 * br, 'soft');
    const pr = R * 2.4 * (1 + 0.25 * f);
    const gyL = gyAt(S.worldX), airK = clamp(1 - (gyL - y) / (180 * u), 0, 1);
    sprite(ctx, 'soft', warm, x - pr, gyL - pr * 0.17, 2 * pr, pr * 0.44, 0.42 * br * fl * airK, true);
    if (f > 0.01) glow(ctx, x, y, H * 0.2, mixc(P.glow, P.amber, 0.3), 0.34 * f, 'soft');
    const under = chunkAtX(S.worldX)?.type;
    if (under === 'harbour' || under === 'lake') sprite(ctx, 'soft', P.glow, x - R * 0.25, gyL, R * 0.5, R * 1.6, 0.25 * br * fl * airK, true);
  }
  const chunkAtX = wx => chunks().find(c => wx >= c.x0 && wx < c.x1);

  const NIGHT_INK = hex('#0A1838');
  function darkness(ctx) {
    const a = 0.72 * nightLeft(0.1) * (1 - 0.85 * n0(S.daylight, 0)) * (1 - 0.6 * st.sun) * (1 - (I.night ? 0.07 : 0.13) * lift());
    if (a <= 0.01) return;
    const R = n0(S.lanternRadius, 70) * u * (1 + 0.4 * st.flare) * 3 / 6, w = W / 6, h = H / 6, dx = darkX;
    dx.globalCompositeOperation = 'source-over'; dx.clearRect(0, 0, w + 1, h + 1);
    dx.fillStyle = rgb(NIGHT_INK); dx.fillRect(0, 0, w + 1, h + 1);
    dx.globalCompositeOperation = 'destination-out';
    dx.fillStyle = vgrad(dx, 'skyfade' + h, 0, h, [[0, 'rgba(0,0,0,0.94)'], [hy / H * 0.8, 'rgba(0,0,0,0.8)'], [(hy / H + gy / H) / 2, 'rgba(0,0,0,0.44)'], [1, 'rgba(0,0,0,0.26)']]);
    dx.fillRect(0, 0, w + 1, h + 1);
    dx.drawImage(SPR.lamp, st.lx / 6 - R, st.ly / 6 - R, 2 * R, 2 * R);
    dx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = a; ctx.drawImage(darkC, 0, 0, W, H); ctx.globalAlpha = 1;
  }

  function orb(ctx) {
    const o = S.orb;
    if (!o || n0(o.alpha, 0) <= 0.01) return;
    const x = st.lx - 20 * u, y = H * 0.42, R = lerp(26, 70, ease(n0(o.b, 0))) * u;
    const c = mixc(P.amber, P.aurora, 0.5 * st.ds.green);
    glow(ctx, x, y, R * 1.7, c, (0.25 + 0.35 * n0(o.hold, 0)) * o.alpha, 'soft');
    sprite(ctx, 'halo', c, x - R * 1.2, y - R * 1.2, R * 2.4, R * 2.4, (0.12 + 0.1 * n0(o.sync, 0)) * o.alpha, true);
  }

  function tapHint(ctx) {
    const th = n0(S.tapHint, 0);
    if (th <= 0.01) return;
    const x = st.lx, y = st.ly - 54 * u, t = n0(S.t, 0) * (rm ? 0.5 : 1);
    ctx.lineWidth = 2 * u;
    for (let i = 0; i < 2; i++) {
      const p = (t * 0.8 + i * 0.5) % 1;
      ctx.strokeStyle = rgb(P.flame, 0.6 * th * Math.sin(p * Math.PI));
      ctx.beginPath(); ctx.arc(x, y, (12 + p * 14) * u, 0, 6.283); ctx.stroke();
    }
    glow(ctx, x, y, 14 * u, P.flame, 0.8 * th);
    glow(ctx, x, y, 40 * u, P.glow, 0.18 * th, 'soft');
  }

  function waveAt(r) {
    const t = n0(S.t, 0), p = clamp((t - r.t) / r.dur, 0, 1), e = 1 - Math.pow(1 - p, 2.2);
    const [x, y] = r.g === 'dawn' ? [W * 0.72, hy] : [st.lx, st.ly];
    return { p, x, y, R: 30 * u + e * Math.hypot(W, H) * 1.05 };
  }
  function rings(ctx) {
    for (const r of st.rings) {
      const { p, x, y, R } = waveAt(r);
      if (rm) { glow(ctx, x, y, H * 0.4, r.c, 0.18 * r.a * Math.sin(p * Math.PI), 'soft'); continue; }
      const fade = Math.pow(1 - p, 1.2) * Math.min(1, p * 8), Rb = Math.max(R, H * 0.4);
      sprite(ctx, 'halo', r.c, x - Rb, y - Rb, 2 * Rb, 2 * Rb, 0.1 * r.a * fade, true);
    }
  }
  function wave() {
    if (!st || rm) return null;
    const r = st.rings[st.rings.length - 1];
    if (!r || r.g === 'dawn') return null;
    const { p, x, y, R } = waveAt(r);
    return p >= 1 ? null : { x: x / W, y: y / H, r: R / H, k: 0.8 * r.a * (1 - ease(clamp((p - 0.7) / 0.3, 0, 1))) };
  }

  function foreArt() {
    if (!ART.has('fg_reeds') && !ART.has('fg_rocks')) return false;
    const o = off(LAYER.fore), span = 1500 * u, t = n0(S.t, 0), sw = rm ? 0.3 : 1;
    const items = [['fg_reeds', 0, 300, 0.1, 'green'], ['fg_rocks', 520, 230, 0.12, 'blue'], ['fg_reeds', 900, 240, 0.12, 'green'], ['fg_rocks', 1180, 170, 0.18, 'blue']];
    for (const [n, px, pw, sink, g] of items) {
      if (!ART.has(n)) continue;
      const w = pw * u, h = w / ART.aspect(n), x = ((px * u - o) % span + span) % span - 300 * u;
      if (x > W || x + w < 0) continue;
      art(n, x + (n === 'fg_reeds' ? Math.sin(t * 0.6 + px) * 2 * u * sw : 0), H - h * (1 - sink), w, h, g, 1, 0.42);
    }
    if (ART.has('fg_branch')) for (const c of visible()) {
      if (c.type !== 'forest' && c.type !== 'sauna') continue;
      const w = 150 * u, h = w / ART.aspect('fg_branch'), x = at(c.x0 + 140, LAYER.fore);
      if (x > W + w || x < -w) continue;
      ctxRef.save(); ctxRef.translate(x, -14 * u); ctxRef.rotate(Math.sin(t * 0.45 + c.seed) * 0.025 * sw);
      art('fg_branch', -w * 0.1, 0, w, h, 'green', 0.9, 0.5);
      ctxRef.restore();
    }
    return true;
  }

  function foreground(ctx) {
    if (foreArt()) return;
    foreWave(ctx);
  }

  function foreWave(ctx) {
    const o = off(LAYER.fore), span = W * 2.4, step = 6 * u, pts = [], base = H * 0.935, amp = 15 * u;
    for (let x = -step; x <= W + step; x += step) {
      const p = ((x + o) / span) * 2 * Math.PI;
      pts.push([x, base - amp * (0.55 * Math.sin(p + 2.2) + 0.3 * Math.sin(2 * p + 0.6) + 0.15 * Math.sin(3 * p + 1.9))]);
    }
    const top = col(P.snow, 'base'), bot = col(mixc(P.snow, P.frost, 0.6), 'blue');
    ctx.beginPath(); ctx.moveTo(-step, H);
    for (const [x, y] of pts) ctx.lineTo(x, y);
    ctx.lineTo(W + step, H); ctx.closePath();
    ctx.fillStyle = vgrad(ctx, 'fw' + top + bot + H, base - amp, H, [[0, top], [1, bot]]); ctx.fill();
    laminate(ctx, pts, 0, 2, 1);
  }

  function snow(ctx) {
    const dt = st.dt, t = n0(S.t, 0), N = rm ? 40 : st.snow.length, sp = rm ? 0.45 : 1;
    const c = grade(P.silver100, 'base'), wind = (noise(t * 0.1) - 0.35) * 18 * sp, dx = st.dx;
    const img = tint('dot', c), a0 = 0.75 * (1 - 0.4 * n0(S.daylight, 0)) * (1 - 0.5 * st.ds.dawn);
    for (let i = 0; i < N; i++) {
      const p = st.snow[i], z = p.z;
      p.y += (10 + 16 * z) * u * sp * dt / H;
      p.x += ((wind * z + Math.sin(t * 0.8 + p.p) * 6 * sp) * u * dt - dx * 0.45 * z * pm) / W;
      if (p.y > 1.02) { p.y -= 1.04; p.x = Math.random(); }
      p.x = ((p.x % 1) + 1) % 1;
      const r = (0.8 + 1.7 * z) * u * (z > 1.25 ? 1.8 : 1), a = a0 * (z > 1.25 ? 0.35 : 0.35 + 0.4 * z);
      ctx.globalAlpha = a; ctx.drawImage(img, p.x * W - r, p.y * H - r, 2 * r, 2 * r);
    }
    ctx.globalAlpha = 1;
  }

  function overlays(ctx) {
    const md = I.night ? 0 : Math.max(st.ds.dawn, st.sun), nd = I.night ? st.ds.dawn : 0, black = n0(S.black, 0);
    const warm = n0(S.warm, 0), exp = Math.min(lerp(n0(S.exposure, 1), 1, md), 1 - 0.25 * nd) * (1 - 0.12 * nd), dawning = Math.max(st.ds.dawn, ease(n0(S.sweep, 0)));
    const edge = clamp((n0(S.border, 0) - 0.1) / 0.15, 0, 1) * (1 - dawning);
    if (warm > 0.001) { ctx.globalCompositeOperation = 'soft-light'; ctx.globalAlpha = Math.min(1, warm * 1.8); ctx.fillStyle = vgrad(ctx, 'warm' + H, 0, H, [[0, 'rgba(255,217,160,0)'], [0.55, 'rgba(255,201,138,0.3)'], [1, 'rgba(242,181,68,0.55)']]); ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; }
    ctx.globalAlpha = 1 - 0.65 * md; ctx.drawImage(vign, 0, 0, W, H); ctx.globalAlpha = 1;
    if (grainPat && !rm) {
      ctx.save(); ctx.globalAlpha = 0.035 * (1 - 0.6 * md); const ox = (Math.random() * 128) | 0, oy = (Math.random() * 128) | 0;
      ctx.translate(-ox, -oy); ctx.fillStyle = grainPat; ctx.fillRect(0, 0, W + 128, H + 128); ctx.restore();
    }
    if (exp < 1) { ctx.fillStyle = rgb(P.night950, 1 - exp); ctx.fillRect(0, 0, W, H); }
    if (edge > 0.01) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.24 * edge; ctx.drawImage(tint('border', S.borderColor || P.daylight), 0, 0, W, H); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; }
    if (black > 0) { ctx.fillStyle = `rgba(0,0,0,${Math.min(1, black)})`; ctx.fillRect(0, 0, W, H); }
  }

  function scene(ctx) {
    sky(ctx); stars(ctx); skyMarks(ctx); moon(ctx); aurora(ctx); sun(ctx);
    mountains(ctx);
    sea(ctx);
    islands(ctx);
    fog(ctx, false);
    shoreLights(ctx);
    midHills(ctx);
    props(ctx, true);
    const env = travEnv(ctx);
    if (env) A.Traverse.cur?.drawBack?.(ctx, env);
    ground(ctx);
    waymarks(ctx);
    footprints(ctx);
    props(ctx, false);
    landmarkLights(ctx);
    fog(ctx, true);
    darkness(ctx);
    lanternLight(ctx);
    glints(ctx);
    orb(ctx);
    figure(ctx); lantern(ctx);
    if (env) A.Traverse.cur?.drawFront?.(ctx, env);
    tapHint(ctx); rings(ctx);
    snow(ctx);
    foreground(ctx);
  }

  function travEnv(ctx) {
    if (!A.Traverse?.cur || A.session?.V !== S) return null;
    return {
      ctx, u, W, H, gy, hy, fx, night: !!I.night, t: n0(S.t, 0),
      col: (c, g = 'base', a = 1) => col(typeof c === 'string' ? hex(c) : c, g, a),
      glow: (cx, x, y, r, c, a, name) => glow(cx, x, y, r, typeof c === 'string' ? hex(c) : c, a, name),
      soft: (cx, x, y, r, c, a) => sprite(cx, 'soft', typeof c === 'string' ? hex(c) : c, x - r, y - r, 2 * r, 2 * r, a, false),
      art: (name, x, y, w, h) => A.Art.draw(ctx, name, x, y, w, h, satOf('yellow'), Math.min(1, lightOf('yellow')), 1),
      rgb: (c, a = 1) => rgb(c, a), mix: (a, b, t) => mixc(a, b, t),
    };
  }

  function panel(ctx, b, o = {}) {
    const r = o.radius ?? 22 * Math.min(1, u * 1.1), accent = o.measure ? P.violet300 : P.glow, done = !!o.done, t = n0(S && S.t, 0);
    if (st) { st.panelFrame = st.frame; st.panelA = clamp(ctx.globalAlpha, 0, 1); }
    ctx.save();
    sprite(ctx, 'soft', P.night950, b.x - b.w * 0.12, b.y - b.h * 0.08, b.w * 1.24, b.h * 1.3, 0.75, false);
    ctx.beginPath(); ctx.roundRect(b.x, b.y, b.w, b.h, r);
    ctx.fillStyle = vgrad(ctx, 'panel' + b.y + b.h, b.y, b.y + b.h, [[0, 'rgba(19,27,54,0.84)'], [0.55, 'rgba(10,14,28,0.88)'], [1, 'rgba(7,10,20,0.92)']]);
    ctx.fill();
    ctx.save(); ctx.clip();
    glow(ctx, b.x + b.w / 2, b.y, b.w * 0.55, accent, 0.07 + 0.03 * Math.sin(t * 0.6), 'soft');
    ctx.fillStyle = vgrad(ctx, 'panelhi' + b.y, b.y, b.y + 28, [[0, 'rgba(232,238,245,0.07)'], [1, 'rgba(232,238,245,0)']]);
    ctx.fillRect(b.x, b.y, b.w, 28);
    ctx.restore();
    ctx.lineWidth = done ? 1.8 : 1;
    ctx.strokeStyle = rgb(accent, done ? 0.75 : lerp(0.2, 0.75, clamp(o.warmth || 0, 0, 1))); ctx.stroke();
    if (done) glow(ctx, b.x + b.w / 2, b.y + b.h, b.w * 0.5, accent, 0.25, 'soft');
    ctx.restore();
  }

  function landmarkList() {
    if (!st) return [];
    const out = [], len = c => c.x1 - c.x0;
    if (st.hk.lh) out.push({ id: 'lighthouse', kind: 'lighthouse', x: st.hk.lh[0], y: st.hk.lh[1] });
    for (const c of visible()) {
      const at = {
        sauna: [sx(c.x0 + len(c) * 0.74) - 21 * u, gy - 30 * u], harbour: [sx(c.x1 - 190), gy - 20 * u], forest: [sx(c.x0 + len(c) * 0.5), gy - H * 0.2],
        lake: [sx(c.x0 + len(c) * 0.5), gy - 6 * u], shore: [sx(c.x0 + len(c) * 0.5), gy - 4 * u],
      }[c.type];
      if (at && at[0] > -40 && at[0] < W + 40) out.push({ id: c.type + ':' + c.seed, kind: c.type, x: at[0], y: at[1] });
    }
    return out;
  }

  function landmarkLights(ctx) {
    const lit = st.hk.lit, ids = Object.keys(lit);
    if (!ids.length) return;
    for (const m of landmarkList()) {
      const a = lit[m.id];
      if (!a || m.kind === 'lighthouse') continue;
      glow(ctx, m.x, m.y, 70 * u, P.amber, 0.28 * a, 'soft');
      glow(ctx, m.x, m.y, 18 * u, P.glow, 0.7 * a);
      sprite(ctx, 'soft', P.glow, m.x - 60 * u, gy - 4 * u, 120 * u, 14 * u, 0.3 * a, true);
    }
  }

  function skyMarks(ctx) {
    const t = n0(S.t, 0), nightA = 1 - 0.8 * st.sun;
    for (const m of st.hk.marks) {
      const a = Math.min(1, (t - m.born) / 0.8) * nightA, x = m.x * W, y = m.y * H;
      if (a <= 0.01) continue;
      const c = m.kind === 'cool' ? P.silver100 : m.kind === 'aurora' ? P.aurora : P.glow;
      glow(ctx, x, y, 14 * u, c, 0.45 * a, 'soft');
      glow(ctx, x, y, 4 * u, P.daylight, 0.95 * a);
      if (m.kind === 'star' || !m.kind) glow(ctx, x, y, 10 * u, c, 0.6 * a, 'glint');
    }
  }

  const hooks = {
    setBreath(b) { if (st) st.hk.breath = b == null ? null : clamp(b, 0, 1); },
    landmarks: () => landmarkList(),
    lightLandmark(i, a = 1) {
      if (!st) return;
      const id = typeof i === 'number' ? landmarkList()[i]?.id : i;
      if (id) st.hk.lit[id] = clamp(a, 0, 1);
    },
    addSkyMark(kind, x, y) {
      if (!st) return;
      st.hk.marks.push({ kind, x: clamp(x, 0, 1), y: clamp(y, 0, 1), born: n0(S.t, 0) });
      if (st.hk.marks.length > 24) st.hk.marks.shift();
    },
    flareLighthouse(a = 1) { if (st) { st.hk.flare = Math.max(st.hk.flare, clamp(a, 0, 1)); st.hk.lamp = Math.max(st.hk.lamp, 0.4 * clamp(a, 0, 1)); } },
    lanternPose(angle) { if (st) st.hk.pose = angle == null ? null : angle; },
  };

  A.World = {
    hooks,
    panel,
    lanternPos: () => [st ? st.lx : fx + 20, st ? st.ly : gy - 30],
    wave,
    size: () => ({ W, H, gy, fx }),
    tintStats: () => ({ ...tintStats, size: tints.size }),
    draw(ctx, w, h, state) {
      S = state; W = w; H = h; ctxRef = ctx;
      u = H / 844;
      rm = !!(A.config && A.config.reducedMotion) || !!(MQ && MQ.matches);
      const cam = !rm && S.cam ? S.cam : null;
      gy = H * 0.82 + n0(cam?.y, 0); hy = H * 0.6; fx = W * 0.35 + n0(cam?.x, 0);
      pm = rm ? 0.5 : 1;
      st = states.get(S); if (!st) { st = newState(); states.set(S, st); }
      const sess = A.session && A.session.V === S ? A.session : null;
      I = { night: S.night ?? !!sess?.night, mode: S.mode ?? sess?.mode ?? null, phase: S.phase ?? sess?.phase ?? null };
      if (sized.W !== W || sized.H !== H || !vign) resize();
      step(); rig();
      ctx.save();
      scene(ctx);
      overlays(ctx);
      ctx.restore();
    },
  };
})();
