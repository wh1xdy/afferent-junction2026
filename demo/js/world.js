(() => {
  const { clamp, lerp, ease, hex, rgb, mixc, noise, rng, ema } = A;

  const P = {
    night950: hex('#05070F'), night900: hex('#070A14'), night800: hex('#0D1326'), night700: hex('#131B36'), night600: hex('#1C2548'), night500: hex('#28335E'),
    violet800: hex('#1E1838'), violet700: hex('#2A2350'), violet600: hex('#3C3170'), violet500: hex('#5B4B8A'), violet300: hex('#9C8AD6'),
    silver050: hex('#F3F6FA'), silver100: hex('#E8EEF5'), silver200: hex('#CBD6E2'), silver300: hex('#B9CAD6'), silver400: hex('#93A3B8'), silver600: hex('#5D6B80'), silver700: hex('#46546A'),
    aurora: hex('#5FE3A1'), aurora2: hex('#2FA37A'), teal: hex('#4FC3D9'), teal2: hex('#2A8FA6'), ice: hex('#7FC8E8'),
    amber: hex('#F2B544'), amber2: hex('#D98E2B'), glow: hex('#FFD9A0'), warmLight: hex('#FFC98A'), flame: hex('#F2E6C9'),
    coral: hex('#FF8A70'), coralSoft: hex('#F49D6E'), gold: hex('#FFD27A'), sun: hex('#FFE8B8'), dawnSky: hex('#9FC3E0'), peach: hex('#F7C59F'), daylight: hex('#FFF3DC'),
    nightTop: hex('#14161B'), nightBot: hex('#2A2E36'), blueTop: hex('#10304D'), blueBot: hex('#2A5C80'), greenTop: hex('#0F2233'), greenBot: hex('#1E3A44'),
    sea: hex('#2A5C80'), seaDeep: hex('#10304D'), mountain: hex('#3D5F80'), mountain2: hex('#2C4A66'), spruce: hex('#16323A'), moss: hex('#4A6B3F'),
    snow: hex('#DDE6EE'), bark: hex('#E8E1D2'), wood: hex('#7A5638'), hut: hex('#5A3B28'), rock: hex('#5E6873'), cloak: hex('#2A2350'), slate: hex('#28335E'),
  };
  A.P = P;

  const COOL = [0.84, 0.93, 1.14];
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
        const c0 = grey ? [200, 214, 226] : cols[0], c1 = grey ? [170, 182, 204] : cols[1], c2 = grey ? [150, 150, 180] : cols[2];
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
  const TUFTS = Array.from({ length: 22 }, (_, i) => ({ x: i * 160 + r0() * 90, h: 16 + r0() * 30, rock: r0() < 0.35, w: 30 + r0() * 50, s: r0() * 9 }));

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
    g.addColorStop(0, 'rgba(3,4,10,0)'); g.addColorStop(1, 'rgba(3,4,10,0.55)');
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
  const ROSE = mixc(P.peach, P.coralSoft, 0.45);
  function grade(c, g = 'base', haze = 0) {
    const s = satOf(g), L = lightOf(g), l = 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2];
    let r = lerp(l * COOL[0], c[0], s) * L, gg = lerp(l * COOL[1], c[1], s) * L, b = lerp(l * COOL[2], c[2], s) * L;
    if (g === 'green') haze *= 1 - 0.6 * st.ds.dawn;
    if (haze) { r = lerp(r, HAZE[0], haze); gg = lerp(gg, HAZE[1], haze); b = lerp(b, HAZE[2], haze); }
    const dw = st.ds.dawn * (I.night ? 0.6 : 1) * (0.14 + 0.4 * haze) * (g === 'green' ? 0.35 : 1);
    if (dw > 0.002) { r = lerp(r, ROSE[0], dw); gg = lerp(gg, ROSE[1], dw); b = lerp(b, ROSE[2], dw); }
    return [clamp(r, 0, 255), clamp(gg, 0, 255), clamp(b, 0, 255)];
  }
  const col = (c, g, a = 1, haze = 0) => rgb(grade(c, g, haze), a);
  const off = f => S.worldX * f * (f === 1 ? 1 : pm);
  const sx = wx => fx + wx - S.worldX;

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
    st.rings = st.rings.filter(r => t - r.t < 3);
    st.hk.flare = dt ? ema(st.hk.flare, 0, dt, 0.7) : st.hk.flare;
    st.hk.poseS = dt ? ema(st.hk.poseS, st.hk.pose === null ? 0 : 1, dt, rm ? 0.05 : 0.18) : st.hk.poseS;
    if (S.walking && Math.floor(st.phase / Math.PI) !== st.lastStep) {
      st.lastStep = Math.floor(st.phase / Math.PI);
      st.steps.push({ x: wx - 2, side: st.lastStep % 2, t });
      if (st.steps.length > 60) st.steps.shift();
    }
  }
  const RINGC = { yellow: mixc(P.gold, P.amber, 0.5), blue: P.ice, green: P.aurora, dawn: P.glow };
  function ring(a, g) { st.rings.push({ t: n0(S.t, 0), a, c: RINGC[g] || P.glow }); }

  let skyTop, skyMid, skyBot;
  function sky(ctx) {
    const d = st.ds, dl = n0(S.daylight, 0), dawn = d.dawn, nd = I.night ? dawn : 0, md = I.night ? 0 : dawn;
    let top = mixc(P.night900, P.night700, 0.5), mid = mixc(P.violet700, P.night600, 0.5), bot = mixc(P.night500, P.violet500, 0.35);
    top = mixc(top, P.blueTop, d.blue * 0.85); mid = mixc(mid, mixc(P.blueTop, P.blueBot, 0.5), d.blue * 0.7); bot = mixc(bot, P.blueBot, d.blue * 0.6);
    top = mixc(top, P.greenTop, d.green * 0.35); mid = mixc(mid, P.greenBot, d.green * 0.3);
    mid = mixc(mid, P.violet600, d.yellow * 0.3); bot = mixc(bot, mixc(P.violet500, P.amber2, 0.45), d.yellow * 0.4);
    top = mixc(top, P.blueBot, dl * 0.5); mid = mixc(mid, P.dawnSky, dl * 0.45); bot = mixc(bot, P.daylight, dl * 0.4);
    let low = bot;
    top = mixc(top, mixc(P.dawnSky, P.violet300, 0.12), md); mid = mixc(mid, mixc(P.peach, P.dawnSky, 0.3), md);
    low = mixc(low, P.coralSoft, md); bot = mixc(bot, P.gold, md);
    mid = mixc(mid, P.violet600, 0.45 * nd); low = mixc(low, mixc(P.violet500, P.coralSoft, 0.5), 0.55 * nd); bot = mixc(bot, mixc(P.coral, P.peach, 0.5), 0.4 * nd);
    const s = 0.18 + 0.82 * Math.max(clamp(lift() / 2.4, 0, 1), dawn, dl * 0.6);
    const des = c => { const l = 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2]; return [lerp(l * COOL[0], c[0], s), lerp(l * COOL[1], c[1], s), lerp(l * COOL[2], c[2], s)]; };
    skyTop = des(top); skyMid = des(mid); skyBot = des(bot);
    const skyLow = des(low);
    HAZE = mixc(skyBot, skyMid, 0.35);
    const a = rgb(skyTop.map(Math.round)), b = rgb(skyMid.map(Math.round)), l = rgb(skyLow.map(Math.round)), c = rgb(skyBot.map(Math.round));
    ctx.fillStyle = vgrad(ctx, 'sky' + a + b + l + c + H, 0, hy + 4, [[0, a], [0.5, b], [0.84, l], [1, c]]);
    ctx.fillRect(0, 0, W, hy + 6);
    const ex = n0(S.exposure, 1);
    if (ex < 1 && md < 0.99) { ctx.fillStyle = rgb(P.night950, Math.min(0.5, (1 - ex) * 1.6) * (1 - md)); ctx.fillRect(0, 0, W, hy + 6); }
    if (d.yellow > 0.06 && dawn < 0.99) sprite(ctx, 'soft', P.amber2, -W * 0.5, hy - H * 0.13, W * 2, H * 0.26, 0.2 * d.yellow * (1 - dawn) * (1 - 0.7 * st.heavy), true);
    if (md > 0.01 || st.sun > 0.01) {
      const p = Math.max(md, st.sun);
      glow(ctx, W * 0.72, hy, W * 0.9, P.coralSoft, 0.3 * p, 'soft');
      glow(ctx, W * 0.72, hy, W * 0.45, P.gold, 0.24 * p, 'soft');
    }
    if (nd > 0.01) {
      const ca = rgb(P.coral, 0).slice(0, -2);
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = nd;
      ctx.fillStyle = vgrad(ctx, 'firstlight' + H, hy - H * 0.22, hy + 4, [[0, ca + '0)'], [0.6, ca + '0.07)'], [1, ca + '0.16)']]);
      ctx.fillRect(0, hy - H * 0.22, W, H * 0.22 + 6);
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      sprite(ctx, 'soft', P.coral, W * 0.72 - W * 1.1, hy - H * 0.27, W * 2.2, H * 0.36, 0.42 * nd, true);
      sprite(ctx, 'soft', mixc(P.peach, P.coralSoft, 0.4), W * 0.72 - W * 0.6, hy - H * 0.2, W * 1.2, H * 0.22, 0.36 * nd, true);
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
    const a = clamp(0.1 * (1 - st.heavy) + 1.1 * n0(S.aurora, 0) + 0.55 * st.ds.green, 0, 1) * (I.night ? 1 - 0.4 * st.ds.dawn : Math.pow(1 - Math.max(st.ds.dawn, st.sun), 2)) * (1 - n0(S.daylight, 0)) * (1 - 0.9 * st.heavy);
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
    ctx.globalCompositeOperation = 'source-over';
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
    const o = off(f), sc = 1 / u;
    ctx.beginPath(); ctx.moveTo(-step, H);
    for (let x = -step; x <= W + step; x += step) {
      const q = (x + o) * sc;
      let n = 0.55 * noise(q * 0.004 + seed) + 0.3 * noise(q * 0.011 + seed * 3) + 0.15 * noise(q * 0.033 + seed * 7);
      if (sharp) n = Math.pow(1 - Math.abs(2 * noise(q * 0.0045 + seed) - 1), 1.7) * 0.8 + 0.2 * noise(q * 0.02 + seed * 5);
      ctx.lineTo(x, base - amp * n);
    }
    ctx.lineTo(W + step, H); ctx.closePath();
    ctx.fillStyle = fill; ctx.fill();
  }

  function mountains(ctx) {
    const top = col(P.silver100, 'blue', 1, 0.35), mid = col(P.mountain, 'blue', 1, 0.5), bot = col(P.mountain2, 'blue', 1, 0.6);
    ridge(ctx, hy + 2, H * 0.15, LAYER.far, 3, true, 6 * u, vgrad(ctx, 'mt' + top + mid + bot + H, hy - H * 0.13, hy, [[0, top], [0.35, mid], [1, bot]]));
    const t2 = col(P.mountain2, 'blue', 1, 0.42), b2 = col(P.night600, 'blue', 1, 0.45);
    ridge(ctx, hy + 2, H * 0.07, LAYER.far * 1.6, 8, false, 8 * u, vgrad(ctx, 'mt2' + t2 + b2 + H, hy - H * 0.07, hy, [[0, t2], [1, b2]]));
  }

  function islands(ctx) {
    const o = off(LAYER.islands), span = 3120 * u, fill = col(P.spruce, 'green', 1, 0.45);
    ctx.fillStyle = fill; ctx.beginPath();
    for (const is of ISLANDS) {
      const x = ((is.x * u - o) % span + span) % span - 200 * u, w = is.w * u, h = is.h * u;
      if (x > W + 20 || x + w < -20) continue;
      ctx.moveTo(x, hy + 1);
      ctx.bezierCurveTo(x + w * 0.2, hy - h, x + w * 0.7, hy - h * 1.1, x + w, hy + 1);
      const rr = rng(is.seed | 0);
      for (let i = 0; i < is.trees; i++) {
        const tx = x + w * (0.25 + 0.5 * rr()), th = h * (0.9 + rr() * 1.1), tb = hy - h * 0.7;
        ctx.moveTo(tx - th * 0.22, tb); ctx.lineTo(tx, tb - th); ctx.lineTo(tx + th * 0.22, tb);
      }
    }
    ctx.fill();
    lighthouse(ctx);
  }

  function lighthouse(ctx) {
    const x = W * 0.84 - off(LAYER.islands) * 0.08, base = hy + 1, h = H * 0.06, wb = h * 0.2, wt = h * 0.13, t = n0(S.t, 0);
    ctx.fillStyle = col(P.spruce, 'green', 1, 0.4);
    ctx.beginPath(); ctx.moveTo(x - h * 0.9, base); ctx.bezierCurveTo(x - h * 0.4, base - h * 0.3, x + h * 0.4, base - h * 0.32, x + h * 1.1, base); ctx.fill();
    const vis = 1 - st.focus;
    if (vis <= 0.01) return;
    const ga = ctx.globalAlpha;
    ctx.globalAlpha = ga * vis;
    ctx.fillStyle = col(P.silver100, 'base', 1, 0.2);
    ctx.beginPath(); ctx.moveTo(x - wb / 2, base - h * 0.15); ctx.lineTo(x - wt / 2, base - h); ctx.lineTo(x + wt / 2, base - h); ctx.lineTo(x + wb / 2, base - h * 0.15); ctx.fill();
    ctx.fillStyle = col(P.slate, 'blue', 1, 0.2);
    for (let i = 0; i < 2; i++) ctx.fillRect(x - wb * 0.47 + i * h * 0.02, base - h * (0.38 + i * 0.3), wb * 0.94 - i * h * 0.04, h * 0.09);
    ctx.fillRect(x - wt * 0.7, base - h - h * 0.12, wt * 1.4, h * 0.04);
    const day = Math.max(st.ds.dawn, st.sun, ease(n0(S.sweep, 0))), beam = n0(S.beam, 0) * (1 - day), fl = st.hk.flare, lamp = clamp(0.35 + beam + st.hk.lamp + fl, 0, 1) * (1 - 0.7 * day);
    st.hk.lh = [x, base - h - h * 0.05];
    glow(ctx, x, base - h - h * 0.05, h * 0.5 * (0.6 + lamp + 2.5 * fl), P.flame, 0.7 * lamp);
    if (fl > 0.01) glow(ctx, x, base - h - h * 0.05, h * (1.5 + 3 * fl), P.glow, 0.35 * fl, 'soft');
    if (beam > 0.02) {
      ctx.save(); ctx.translate(x, base - h - h * 0.05); ctx.globalCompositeOperation = 'lighter';
      const ang = Math.PI + Math.sin(t * (rm ? 0.4 : 0.8)) * 0.5;
      ctx.rotate(ang); ctx.globalAlpha = ga * vis * 0.55 * beam;
      ctx.drawImage(tint('beam', P.flame), 0, -H * 0.07, W * 1.1, H * 0.14);
      ctx.restore();
    }
    ctx.globalAlpha = ga;
  }

  function sea(ctx) {
    const top = col(mixc(HAZE, P.sea, 0.5), 'blue', 1, 0.15), bot = col(P.seaDeep, 'blue');
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
    const c1 = col(P.spruce, 'green', 1, 0.3), c2 = col(P.night700, 'blue', 1, 0.55);
    const base = hy + H * 0.1, f = LAYER.mid, o = off(f), sc = 1 / u, step = 6 * u;
    const yAt = x => { const q = (x + o) * sc; return base - H * 0.05 * (0.25 + 0.75 * noise(q * 0.006 + 41)) - H * 0.02 * noise(q * 0.02 + 7); };
    ctx.beginPath(); ctx.moveTo(-step, gy);
    for (let x = -step; x <= W + step; x += step) ctx.lineTo(x, yAt(x));
    ctx.lineTo(W + step, gy); ctx.closePath();
    ctx.fillStyle = vgrad(ctx, 'mh' + c1 + c2 + H, base - H * 0.08, gy, [[0, c1], [1, c2]]); ctx.fill();
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
    ctx.fillStyle = c1; ctx.fill();
  }

  function fog(ctx, near) {
    const d = clamp(n0(S.fog, 0.4), 0, 1.4);
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
      if (A.Art.has(im)) {
        const ih = bw / A.Art.aspect(im);
        for (const xx of [x, x + bw * 0.98]) A.Art.draw(ctx, im, xx, y - ih / 2, bw, ih, satOf('blue') * 0.6, Math.min(1, lightOf('blue')), a * 0.62);
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
    harbour: [() => mixc(P.seaDeep, P.sea, 0.35), 'blue'], forest: [() => mixc(P.snow, P.moss, 0.25), 'green'],
    lake: [() => mixc(P.ice, P.silver200, 0.35), 'blue'], sauna: [() => mixc(P.snow, P.bark, 0.5), 'yellow'], shore: [() => mixc(P.snow, P.peach, 0.45 * st.ds.dawn), 'base'],
  };
  const groundAt = type => GROUND[type] || GROUND.shore;
  const gyAt = wx => gy + 3 * u * noise(wx * 0.012) - 2 * u;

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
    ctx.beginPath(); ctx.moveTo(-step, H);
    for (let x = -step; x <= W + step; x += step) ctx.lineTo(x, gyAt(S.worldX + x - fx));
    ctx.lineTo(W + step, H); ctx.closePath();
    ctx.fillStyle = g; ctx.fill();
    ctx.fillStyle = vgrad(ctx, 'gshade' + H, gy, H, [[0, 'rgba(10,16,40,0)'], [0.2, 'rgba(10,16,40,0.18)'], [1, 'rgba(6,8,20,0.62)']]);
    ctx.fillRect(0, gy - 4 * u, W, H - gy + 4 * u);
    const o = S.worldX, dc = grade(P.silver050, 'base'), sh = grade(P.night600, 'blue');
    for (let i = 0; i < 5; i++) {
      const y = gy + (H - gy) * (0.16 + i * 0.17), amp = (3 + i * 2) * u, f = 1 + i * 0.12;
      ctx.beginPath();
      for (let x = -step; x <= W + step; x += step * 2) { const q = (x + o * f) / u; const yy = y - amp * noise(q * 0.008 + i * 13); x === -step ? ctx.moveTo(x, yy) : ctx.lineTo(x, yy); }
      ctx.strokeStyle = rgb(dc, 0.07); ctx.lineWidth = 1.2 * u; ctx.stroke();
      ctx.lineTo(W + step, y + 14 * u); ctx.lineTo(-step, y + 14 * u); ctx.closePath();
      ctx.fillStyle = rgb(sh, 0.07); ctx.fill();
    }
    ctx.strokeStyle = col(P.silver050, 'base', 0.22); ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = -step; x <= W + step; x += step) { const y = gyAt(S.worldX + x - fx); x === -step ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
    ctx.stroke();
    const t = n0(S.t, 0);
    for (const c of vs) {
      const x0 = Math.max(0, sx(c.x0)), x1 = Math.min(W, sx(c.x1));
      if (x1 <= x0) continue;
      if (c.type === 'harbour' || c.type === 'lake') {
        const cl = grade(c.type === 'lake' ? P.silver050 : P.silver200, 'blue');
        ctx.fillStyle = rgb(cl);
        for (let i = 0; i < 18; i++) {
          const wx = c.x0 + (i * 131) % (c.x1 - c.x0), y = gy + 6 * u + (i * 37 % 100) / 100 * (H - gy) * 0.8, x = sx(wx);
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

  function glints(ctx) {
    const t = n0(S.t, 0), span = 1400 * u, c = mixc(P.silver050, P.glow, 0.25), lx = st.lx, ly = st.ly, R = n0(S.lanternRadius, 70) * u * 2.6;
    const img = tint('glint', c), night = 1 - 0.6 * n0(S.daylight, 0);
    for (const g of GLINTS) {
      const x = ((g.x * u - S.worldX) % span + span) % span - 40 * u, y = gy + 6 * u + g.y * (H - gy - 10 * u);
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
      ctx.globalAlpha = a; ctx.beginPath(); ctx.ellipse(x, gy + (p.side ? 3.5 : 6) * u, 3.2 * u, 1.1 * u, 0, 0, 6.283); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function props(ctx, back) {
    for (const c of visible()) {
      if (c.type === 'forest') birches(ctx, c, back);
      if (back) { if (c.type === 'lake') lakeShore(ctx, c); continue; }
      if (c.type === 'harbour') pier(ctx, c);
      if (c.type === 'sauna') hut(ctx, c);
      if (c.type === 'shore') shore(ctx, c);
    }
  }

  function lakeShore(ctx, c) {
    const rr = rng((c.seed | 0) + 3), base = gy - 2 * u;
    ctx.strokeStyle = col(P.spruce, 'green', 0.8, 0.1); ctx.lineWidth = 1.2; ctx.beginPath();
    for (let i = 0; i < 26; i++) {
      const x = fx + (c.x0 + rr() * (c.x1 - c.x0) - S.worldX) * 0.9, h = (8 + rr() * 16) * u;
      if (x < -20 || x > W + 20) continue;
      ctx.moveTo(x, base); ctx.quadraticCurveTo(x + 2 * u, base - h * 0.6, x + (rr() - 0.5) * 8 * u, base - h);
    }
    ctx.stroke();
  }

  function pier(ctx, c) {
    if (A.Art.has('pier_boat')) {
      const w = 300 * u, h = w / A.Art.aspect('pier_boat'), x = sx(c.x1 - 300);
      A.Art.draw(ctx, 'pier_boat', x - w / 2, gy - h * 0.62, w, h, satOf('yellow'), Math.min(1, lightOf('yellow')), 1);
      return;
    }
    const p0 = c.x1 - 560, p1 = c.x1 - 190, a = sx(p0), b = sx(p1), t = n0(S.t, 0), y = gy - 3 * u;
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
    const bx = sx(c.x1 - 100), by = gy + 18 * u + Math.sin(t * (rm ? 0.4 : 1.1)) * 1.6 * u, rock = Math.sin(t * (rm ? 0.4 : 1.1) + 1) * 0.03;
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
      const h = H * b.h * (back ? 0.82 : 1), w = b.w * u * (back ? 0.75 : 1), base = gy + (back ? -3 : 3) * u, top = base - h, haze = back ? 0.4 : 0;
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
    const x = sx(c.x0 + (c.x1 - c.x0) * 0.74), w = 96 * u, h = 52 * u, y = gy - h, t = n0(S.t, 0), stove = n0(S.stove, 0);
    if (x < -160 || x > W + 160) return;
    const lit = 0.55 + 0.45 * stove, flick = 0.9 + 0.1 * noise(t * 4.5);
    glow(ctx, x - w * 0.22, y + h * 0.42, 90 * u * (0.8 + 0.4 * stove), P.amber, 0.22 * lit * flick, 'soft');
    if (A.Art.has('sauna_hut')) {
      const ww = 140 * u, hh = ww / A.Art.aspect('sauna_hut');
      A.Art.draw(ctx, 'sauna_hut', x - ww / 2, gy - hh + 6 * u, ww, hh, satOf('yellow'), Math.min(1, lightOf('yellow')), 1);
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
      sprite(ctx, 'soft', sc, x + w * 0.26 + p * 26 * u + Math.sin(t * 0.7 + i) * 4 * u - (6 + p * 18) * u, y - 34 * u - p * 70 * u - (6 + p * 18) * u, 2 * (6 + p * 18) * u, 2 * (6 + p * 18) * u, 0.32 * (1 - p) * Math.min(1, p * 5), false);
    }
  }

  function shore(ctx, c) {
    const rr = rng((c.seed | 0) + 7);
    for (let i = 0; i < 5; i++) {
      const wx = c.x0 + 60 + rr() * (c.x1 - c.x0 - 120), x = sx(wx), w = (24 + rr() * 40) * u, h = (10 + rr() * 16) * u;
      if (x < -60 || x > W + 60) continue;
      ctx.fillStyle = col(P.rock, 'base');
      ctx.beginPath(); ctx.ellipse(x, gy + 2 * u, w, h, 0, Math.PI, 0); ctx.fill();
      ctx.fillStyle = col(P.snow, 'base', 0.95);
      ctx.beginPath(); ctx.ellipse(x - w * 0.1, gy + 2 * u - h * 0.72, w * 0.62, h * 0.32, 0, Math.PI, 0); ctx.fill();
    }
    const cx = sx(c.x0 + (c.x1 - c.x0) * 0.62);
    if (cx > -40 && cx < W + 40) {
      ctx.fillStyle = col(P.rock, 'base');
      for (let i = 0; i < 4; i++) { const r = (9 - i * 1.8) * u; ctx.beginPath(); ctx.ellipse(cx + (i % 2 ? 1 : -1) * u, gy - 2 * u - i * 7 * u - r * 0.3, r * 1.2, r * 0.7, 0, 0, 6.283); ctx.fill(); }
    }
  }

  function rig() {
    const k = H * 0.086 / 60, walk = st.walk, ph = st.phase, t = n0(S.t, 0);
    const bob = walk * Math.abs(Math.sin(ph)) * 1.8;
    const breath = st.hk.breath !== null ? st.hk.breath * 2 - 1 : (1 - walk) * Math.sin(t * 1.6);
    const swing = walk * 0.22 * Math.sin(ph + 0.9) + (1 - walk) * 0.05 * Math.sin(t * 0.9) * (rm ? 0.4 : 1);
    const hx = 11 + walk * 1.5 * Math.sin(ph), hy2 = -25 + breath * 0.3;
    const pa = st.hk.pose ?? st.hk.lastPose ?? 0, pp = st.hk.poseS, tx = hx + pp * 24 * Math.cos(pa), ty = hy2 - pp * 24 * Math.sin(pa);
    if (st.hk.pose !== null) st.hk.lastPose = st.hk.pose;
    st.fig = { k, walk, ph, bob, breath, swing, hx, hy: hy2, tx, ty, pole: pp };
    st.lx = fx + k * (tx + Math.sin(swing) * 8);
    st.ly = gy + 1 + k * (-bob + ty + Math.cos(swing) * 8);
  }

  function figure(ctx) {
    const F = st.fig, { k, walk, ph, bob, breath } = F, t = n0(S.t, 0), sway = rm ? 0.3 : 1;
    const bright = n0(S.lanternBright, 1), warm = mixc(P.glow, P.amber, 0.3);
    sprite(ctx, 'soft', P.night950, fx - 16 * k, gy - 2 * k, 32 * k, 7 * k, 0.6, false);
    ctx.save(); ctx.translate(fx, gy + 1); ctx.scale(k, k); ctx.translate(0, -bob);
    const body = rgb(mixc(grade(P.cloak, 'base'), P.violet700, 0.6)), rim = rgb(mixc(warm, P.flame, 0.3), Math.min(1, 0.75 * bright));
    const legA = Math.sin(ph) * 0.5 * walk;
    ctx.lineCap = 'round'; ctx.strokeStyle = body; ctx.lineWidth = 3.4;
    for (const s of [-1, 1]) {
      const a = legA * s;
      ctx.beginPath(); ctx.moveTo(s * 1.5, -15); ctx.lineTo(s * 1.5 + Math.sin(a) * 15, -15 + Math.cos(a) * 15 - Math.max(0, -Math.sin(ph * s)) * 2 * walk); ctx.stroke();
    }
    const fl = Math.sin(t * 2.2) * 1.2 * sway + walk * Math.sin(ph * 2) * 1.2, wind = (noise(t * 0.6) - 0.5) * 2 * sway;
    const by = 1 + breath * 0.012;
    ctx.save(); ctx.scale(1, by);
    const cloak = () => {
      ctx.beginPath();
      ctx.moveTo(-3, -46);
      ctx.bezierCurveTo(-9, -40, -11, -26, -14 - fl - wind - walk * 2, -11);
      ctx.quadraticCurveTo(-7, -8 + fl * 0.5, -1, -10);
      ctx.quadraticCurveTo(5, -8 - fl * 0.4, 11 + fl * 0.3, -12);
      ctx.bezierCurveTo(10, -24, 8, -36, 6, -44);
      ctx.bezierCurveTo(9.5, -50, 7, -58.5, 0.5, -58.5);
      ctx.bezierCurveTo(-5, -58.5, -8.5, -55, -9.5 - wind * 0.5, -50);
      ctx.quadraticCurveTo(-7, -48, -3, -46);
      ctx.closePath();
    };
    ctx.save(); ctx.beginPath(); ctx.rect(-30, -50, 60, 53); ctx.clip(); ctx.fillStyle = rim; cloak(); ctx.fill(); ctx.restore();
    ctx.save(); ctx.translate(-1.7, 0.4); ctx.fillStyle = body; cloak(); ctx.fill(); ctx.restore();
    ctx.fillStyle = rgb(P.night950, 0.5); ctx.beginPath(); ctx.moveTo(6.6, -54.2); ctx.bezierCurveTo(4.9, -53, 4.6, -49.8, 5.4, -47.6); ctx.quadraticCurveTo(6.5, -47, 7.3, -47.8); ctx.bezierCurveTo(8.1, -49.8, 8, -52.4, 6.6, -54.2); ctx.fill();
    const sc = grade(P.coral, 'yellow'), wv = rm ? 0.4 : 1;
    ctx.fillStyle = rgb(sc); ctx.beginPath();
    ctx.moveTo(-4, -47); ctx.quadraticCurveTo(1, -44.5, 6, -46.5); ctx.lineTo(6, -43.5); ctx.quadraticCurveTo(1, -41, -4, -43); ctx.closePath(); ctx.fill();
    const tail = [];
    for (let i = 0; i <= 6; i++) {
      const q = i / 6, lift = walk * 0.7 + 0.15 + 0.15 * (noise(t * 0.7) - 0.5);
      tail.push([-3 - q * (5 + 13 * lift) , -45 + q * (14 * (1 - lift)) + Math.sin(t * 3 * wv - i * 0.9) * q * (1 + 2 * lift) * sway]);
    }
    ctx.beginPath(); ctx.moveTo(tail[0][0], tail[0][1] - 1.6);
    for (let i = 1; i < tail.length; i++) ctx.lineTo(tail[i][0], tail[i][1] - 1.6 * (1 - i / 7));
    for (let i = tail.length - 1; i >= 0; i--) ctx.lineTo(tail[i][0] + 0.4, tail[i][1] + 1.6 * (1 - i / 7) + 0.3);
    ctx.closePath(); ctx.fill();
    ctx.restore();
    ctx.strokeStyle = body; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(3, -38 * by); ctx.quadraticCurveTo(9, -33, F.hx, F.hy); ctx.stroke();
    ctx.restore();
    glow(ctx, fx + 7 * k, gy - 24 * k, 22 * k, warm, Math.min(0.3, 0.16 * bright), 'soft');
  }

  function lantern(ctx) {
    const F = st.fig, k = F.k, t = n0(S.t, 0), x = st.lx, y = st.ly;
    const f = st.flare, fl = (0.88 + 0.12 * noise(t * (rm ? 2 : 7)) + 0.05 * noise(t * 19)) * n0(S.flame, 1) * (1 + 1.4 * f), br = n0(S.lanternBright, 1);
    const hx = fx + k * F.hx, hy2 = gy + 1 + k * (F.hy - F.bob), px = fx + k * F.tx, py = gy + 1 + k * (F.ty - F.bob);
    if (F.pole > 0.02) { ctx.strokeStyle = col(P.wood, 'yellow', F.pole); ctx.lineWidth = 1.6 * k; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(hx, hy2); ctx.lineTo(px, py); ctx.stroke(); }
    ctx.strokeStyle = rgb(P.night950, 0.9); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(x, y - 3.5 * k); ctx.stroke();
    ctx.save(); ctx.translate(x, y); ctx.rotate(F.swing);
    ctx.fillStyle = rgb(P.night950); ctx.fillRect(-2.6 * k, -3.6 * k, 5.2 * k, 1.4 * k); ctx.fillRect(-2.1 * k, 3.4 * k, 4.2 * k, 1.2 * k);
    ctx.fillStyle = rgb(mixc(P.glow, P.daylight, 0.4)); ctx.fillRect(-2 * k, -2.2 * k, 4 * k, 5.6 * k);
    ctx.restore();
    glow(ctx, x, y, 7 * k * fl / (1 + 0.8 * f), P.daylight, 0.9 * br);
    glow(ctx, x, y, 22 * k * fl, mixc(P.glow, P.amber, 0.25 * f), Math.min(1, 0.55 * br + 0.25 * f));
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
    sprite(ctx, 'soft', warm, x - pr, gy - pr * 0.17, 2 * pr, pr * 0.44, 0.42 * br * fl, true);
    if (f > 0.01) glow(ctx, x, y, H * 0.2, mixc(P.glow, P.amber, 0.3), 0.34 * f, 'soft');
    const under = chunkAtX(S.worldX)?.type;
    if (under === 'harbour' || under === 'lake') sprite(ctx, 'soft', P.glow, x - R * 0.25, gy, R * 0.5, R * 1.6, 0.25 * br * fl, true);
  }
  const chunkAtX = wx => chunks().find(c => wx >= c.x0 && wx < c.x1);

  function darkness(ctx) {
    const a = 0.72 * nightLeft(0.1) * (1 - 0.85 * n0(S.daylight, 0)) * (1 - 0.6 * st.sun) * (1 - (I.night ? 0.07 : 0.13) * lift());
    if (a <= 0.01) return;
    const R = n0(S.lanternRadius, 70) * u * (1 + 0.4 * st.flare) * 3 / 6, w = W / 6, h = H / 6, dx = darkX;
    dx.globalCompositeOperation = 'source-over'; dx.clearRect(0, 0, w + 1, h + 1);
    dx.fillStyle = rgb(P.night950); dx.fillRect(0, 0, w + 1, h + 1);
    dx.globalCompositeOperation = 'destination-out';
    dx.fillStyle = vgrad(dx, 'skyfade' + h, 0, h, [[0, 'rgba(0,0,0,0.92)'], [hy / H * 0.8, 'rgba(0,0,0,0.75)'], [(hy / H + gy / H) / 2, 'rgba(0,0,0,0.3)'], [1, 'rgba(0,0,0,0.1)']]);
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
    ctx.strokeStyle = rgb(c, (0.3 + 0.4 * n0(o.sync, 0)) * o.alpha); ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(x, y, R, 0, 6.283); ctx.stroke();
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

  function rings(ctx) {
    const t = n0(S.t, 0);
    for (const r of st.rings) {
      const p = clamp((t - r.t) / 2.4, 0, 1), e = 1 - Math.pow(1 - p, 2.2);
      if (rm) { glow(ctx, st.lx, st.ly, H * 0.4, r.c, 0.25 * r.a * Math.sin(p * Math.PI), 'soft'); continue; }
      const R = 30 * u + e * H * 0.8, fade = Math.pow(1 - p, 1.3) * Math.min(1, p * 8);
      sprite(ctx, 'halo', r.c, st.lx - R, st.ly - R, 2 * R, 2 * R, 0.3 * r.a * fade, true);
      glow(ctx, st.lx, st.ly, H * 0.28 * (0.4 + e), r.c, 0.2 * r.a * (1 - p), 'soft');
    }
  }

  function foreground(ctx) {
    const o = off(LAYER.fore), span = 3600 * u, t = n0(S.t, 0), c = col(mixc(P.night950, P.night800, 0.4), 'base', 1), rimc = col(P.silver200, 'base', 0.28);
    ctx.fillStyle = c; ctx.strokeStyle = c; ctx.lineCap = 'round';
    for (const td of TUFTS) {
      const x = ((td.x * u - o) % span + span) % span - 200 * u;
      if (x < -120 * u || x > W + 120 * u) continue;
      if (td.rock) {
        const w = td.w * u * 1.5, h = td.h * u * 1.6;
        ctx.beginPath(); ctx.moveTo(x - w, H + 2); ctx.bezierCurveTo(x - w * 0.8, H - h * 0.9, x + w * 0.3, H - h * 1.1, x + w, H + 2); ctx.fill();
        ctx.fillStyle = rimc; ctx.beginPath(); ctx.moveTo(x - w * 0.62, H - h * 0.52); ctx.bezierCurveTo(x - w * 0.4, H - h * 0.86, x + w * 0.2, H - h * 0.92, x + w * 0.5, H - h * 0.6); ctx.bezierCurveTo(x + w * 0.1, H - h * 0.76, x - w * 0.3, H - h * 0.72, x - w * 0.62, H - h * 0.52); ctx.fill();
        ctx.fillStyle = c;
        continue;
      }
      ctx.lineWidth = 2 * u;
      ctx.beginPath();
      for (let i = 0; i < 9; i++) {
        const bx = x + i * 3.5 * u, hh = td.h * u * 1.6 * (0.55 + 0.45 * noise(td.s + i)), sw = Math.sin(t * (rm ? 0.3 : 0.9) + i * 0.7 + td.s) * 5 * u * (rm ? 0.3 : 1) + (i - 4) * 2.5 * u;
        ctx.moveTo(bx, H + 2); ctx.quadraticCurveTo(bx + sw * 0.3, H - hh * 0.5, bx + sw, H - hh);
      }
      ctx.stroke();
      ctx.beginPath(); ctx.ellipse(x + 14 * u, H + 2, 26 * u, 9 * u, 0, Math.PI, 0); ctx.fill();
    }
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
    midHills(ctx);
    props(ctx, true);
    ground(ctx);
    footprints(ctx);
    props(ctx, false);
    landmarkLights(ctx);
    fog(ctx, true);
    darkness(ctx);
    lanternLight(ctx);
    glints(ctx);
    orb(ctx);
    figure(ctx); lantern(ctx); tapHint(ctx); rings(ctx);
    snow(ctx);
    foreground(ctx);
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
    size: () => ({ W, H, gy, fx }),
    tintStats: () => ({ ...tintStats, size: tints.size }),
    draw(ctx, w, h, state) {
      S = state; W = w; H = h; ctxRef = ctx;
      gy = H * 0.82; hy = H * 0.6; fx = W * 0.35; u = H / 844;
      rm = !!(A.config && A.config.reducedMotion) || !!(MQ && MQ.matches);
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
