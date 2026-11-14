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

    [c, x] = mk(512, 64); g = x.createLinearGradient(0, 0, 512, 0);
    g.addColorStop(0, 'rgba(255,255,255,0.9)'); g.addColorStop(0.3, 'rgba(255,255,255,0.35)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.beginPath(); x.moveTo(0, 30); x.lineTo(512, 0); x.lineTo(512, 64); x.lineTo(0, 34); x.closePath(); x.fill(); SPR.beam = c;

    [c, x] = mk(128, 128);
    const id = x.createImageData(128, 128), rg = rng(3);
    for (let i = 0; i < id.data.length; i += 4) { const v = rg() * 255; id.data[i] = id.data[i + 1] = id.data[i + 2] = v; id.data[i + 3] = 255; }
    x.putImageData(id, 0, 0); SPR.grain = c;

    [c, x] = mk(96, 96);
    x.fillStyle = '#fff'; x.beginPath(); x.arc(48, 48, 40, 0, 6.283); x.fill();
    x.globalCompositeOperation = 'destination-out'; x.beginPath(); x.arc(64, 38, 36, 0, 6.283); x.fill(); SPR.moon = c;
  })();

  const tints = new Map();
  function tint(name, c, q = 3) {
    const r = c[0] >> q, g = c[1] >> q, b = c[2] >> q, k = name + r + ':' + g + ':' + b;
    let t = tints.get(k);
    if (!t) {
      const src = SPR[name], [cv, x] = mk(src.width, src.height);
      x.drawImage(src, 0, 0); x.globalCompositeOperation = 'source-in';
      x.fillStyle = `rgb(${r << q},${g << q},${b << q})`; x.fillRect(0, 0, src.width, src.height);
      if (tints.size > 160) tints.delete(tints.keys().next().value);
      tints.set(k, t = cv);
    }
    return t;
  }

  const STARS = Array.from({ length: 16 }, () => ({ x: r0(), y: 0.03 + r0() * 0.4, s: 0.8 + r0() * 1.2, p: r0() * 6.28, f: 0.6 + r0() * 1.4 }));
  const ISLANDS = Array.from({ length: 6 }, (_, i) => ({ x: i * 520 + r0() * 200, w: 120 + r0() * 160, h: 10 + r0() * 14, trees: 2 + Math.floor(r0() * 5), seed: r0() * 99 }));
  const RIPPLES = Array.from({ length: 46 }, () => ({ x: r0(), y: r0(), w: 6 + r0() * 26, p: r0() * 6.28 }));
  const GLINTS = Array.from({ length: 70 }, () => ({ x: r0() * 1400, y: Math.pow(r0(), 0.8), p: r0() * 6.28, f: 0.8 + r0() * 2 }));
  const TUFTS = Array.from({ length: 22 }, (_, i) => ({ x: i * 160 + r0() * 90, h: 16 + r0() * 30, rock: r0() < 0.35, w: 30 + r0() * 50, s: r0() * 9 }));

  let S = null, W = 0, H = 0, gy = 0, hy = 0, fx = 0, u = 1, ctxRef = null, rm = false, pm = 1, st = null;
  const states = new WeakMap();
  const MQ = window.matchMedia ? matchMedia('(prefers-reduced-motion: reduce)') : null;
  let sized = { W: 0, H: 0 }, vign = null, darkC = null, darkX = null, grainPat = null, borderC = null;
  const n0 = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);

  function newState() {
    const N = 120;
    const rs = rng(17);
    return {
      last: null, dt: 0, sun: 0, ds: { yellow: 0.05, blue: 0.05, green: 0.05, dawn: 0 }, prev: { yellow: 0, blue: 0, green: 0, dawn: 0 }, swept: false,
      phase: 0, walk: 0, swing: 0, lx: 0, ly: 0, lastX: null, rings: [], steps: [], lastStep: 0,
      snow: Array.from({ length: N }, () => ({ x: rs(), y: rs(), z: 0.35 + rs() * 1.15, p: rs() * 6.28 })),
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
    [borderC, x] = mk(W / 2, H / 2);
    const b = 18;
    for (const [x0, y0, x1, y1, rx, ry, rw, rh] of [[0, 0, b, 0, 0, 0, b, H / 2], [W / 2, 0, W / 2 - b, 0, W / 2 - b, 0, b, H / 2], [0, 0, 0, b, 0, 0, W / 2, b], [0, H / 2, 0, H / 2 - b, 0, H / 2 - b, W / 2, b]]) {
      const gg = x.createLinearGradient(x0, y0, x1, y1); gg.addColorStop(0, 'rgba(255,255,255,1)'); gg.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = gg; x.fillRect(rx, ry, rw, rh);
    }
    SPR.border = borderC;
    for (const k of [...tints.keys()]) if (k.startsWith('border')) tints.delete(k);
  }

  const satOf = g => {
    const d = st.ds;
    if (g === 'base') return Math.max(0.05, d.dawn, 0.12 * (d.yellow + d.blue + d.green));
    return Math.max(0.05, d[g] || 0, d.dawn);
  };
  const lightOf = g => Math.min(1.05, lerp(0.6, 1, st.ds.dawn) + 0.12 * (g === 'base' ? 0 : st.ds[g] || 0) + 0.35 * n0(S.daylight, 0));
  let HAZE = [40, 46, 60];
  const ROSE = mixc(P.peach, P.coralSoft, 0.45);
  function grade(c, g = 'base', haze = 0) {
    const s = satOf(g), L = lightOf(g), l = 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2];
    let r = lerp(l * COOL[0], c[0], s) * L, gg = lerp(l * COOL[1], c[1], s) * L, b = lerp(l * COOL[2], c[2], s) * L;
    if (g === 'green') haze *= 1 - 0.6 * st.ds.dawn;
    if (haze) { r = lerp(r, HAZE[0], haze); gg = lerp(gg, HAZE[1], haze); b = lerp(b, HAZE[2], haze); }
    const dw = st.ds.dawn * (0.14 + 0.4 * haze) * (g === 'green' ? 0.35 : 1);
    if (dw > 0.002) { r = lerp(r, ROSE[0], dw); gg = lerp(gg, ROSE[1], dw); b = lerp(b, ROSE[2], dw); }
    return [clamp(r, 0, 255), clamp(gg, 0, 255), clamp(b, 0, 255)];
  }
  const col = (c, g, a = 1, haze = 0) => rgb(grade(c, g, haze), a);
  const off = f => S.worldX * f * (f === 1 ? 1 : pm);
  const sx = wx => fx + wx - S.worldX;
  const ART = A.Art;
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
    if ((sw > 0.02 || n0(sat.dawn, 0) > 0.5) && !st.swept) { st.swept = true; haptic(); ring(1); }
    st.sun = dt ? ema(st.sun, n0(S.sunP, 0) > 0 || n0(sat.dawn, 0) > 0.5 ? Math.max(n0(S.sunP, 0), n0(sat.dawn, 0)) : 0, dt, 1.1) : n0(S.sunP, 0);
    for (const g of GROUPS) {
      const target = Math.max(n0(sat[g], 0), g === 'dawn' ? ease(sw) : ease(sw) * 0.9);
      if (st.prev[g] < 0.5 && n0(sat[g], 0) >= 0.5 && g !== 'dawn' && st.last > 0.5) { haptic(); ring(0.7); }
      st.prev[g] = n0(sat[g], 0);
      st.ds[g] = dt ? ema(st.ds[g], target, dt, g === 'dawn' ? 1.4 : 0.8) : target;
    }
    const wx = n0(S.worldX, 0);
    st.dx = st.lastX === null ? 0 : wx - st.lastX;
    st.lastX = wx;
    st.walk = ema(st.walk, S.walking ? 1 : 0, dt || 0.016, 0.18);
    st.phase += dt * 8.5 * n0(S.stride, 1) * (0.3 + 0.7 * st.walk) * (S.walking ? 1 : 0.0);
    st.rings = st.rings.filter(r => t - r.t < 3);
    if (S.walking && Math.floor(st.phase / Math.PI) !== st.lastStep) {
      st.lastStep = Math.floor(st.phase / Math.PI);
      st.steps.push({ x: wx - 2, side: st.lastStep % 2, t });
      if (st.steps.length > 60) st.steps.shift();
    }
  }
  function ring(a) { st.rings.push({ t: n0(S.t, 0), a }); }

  const CLOUDS = [['sky_dawn_cloud_1', 0.07, 1.5, 1, 0.3, 0.72], ['sky_dawn_cloud_2', 0.24, 1.0, 0.7, 0.75, 0.55], ['sky_dawn_cloud_3', 0.42, 0.7, 0.5, 0.45, 0.4]];
  let skyTop, skyMid, skyBot;
  function sky(ctx) {
    const d = st.ds, dl = n0(S.daylight, 0), dawn = d.dawn;
    let top = mixc(P.night900, P.night700, 0.5), mid = mixc(P.violet700, P.night600, 0.5), bot = mixc(P.night500, P.violet500, 0.35);
    top = mixc(top, P.blueTop, d.blue * 0.8); mid = mixc(mid, mixc(P.blueTop, P.blueBot, 0.5), d.blue * 0.6); bot = mixc(bot, P.blueBot, d.blue * 0.7);
    top = mixc(top, P.greenTop, d.green * 0.35); mid = mixc(mid, P.greenBot, d.green * 0.3);
    mid = mixc(mid, P.violet600, d.yellow * 0.25); bot = mixc(bot, mixc(P.violet500, P.amber2, 0.3), d.yellow * 0.25);
    top = mixc(top, P.blueBot, dl * 0.5); mid = mixc(mid, P.dawnSky, dl * 0.45); bot = mixc(bot, P.daylight, dl * 0.4);
    top = mixc(top, mixc(P.blueBot, P.dawnSky, 0.75), dawn); mid = mixc(mid, mixc(P.dawnSky, P.peach, 0.35), dawn); bot = mixc(bot, mixc(P.peach, P.gold, 0.5), dawn);
    const s = 0.18 + 0.82 * Math.max((d.blue + d.green + d.yellow) / 3, dawn, dl * 0.6);
    const des = c => { const l = 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2]; return [lerp(l * COOL[0], c[0], s), lerp(l * COOL[1], c[1], s), lerp(l * COOL[2], c[2], s)]; };
    skyTop = des(top); skyMid = des(mid); skyBot = des(bot);
    HAZE = mixc(skyBot, skyMid, 0.35);
    const a = rgb(skyTop.map(Math.round)), b = rgb(skyMid.map(Math.round)), c = rgb(skyBot.map(Math.round));
    ctx.fillStyle = vgrad(ctx, 'sky' + a + b + c + H, 0, hy + 4, [[0, a], [0.55, b], [1, c]]);
    ctx.fillRect(0, 0, W, hy + 6);
    if (dawn > 0.02) {
      const o = off(LAYER.aurora) + n0(S.t, 0) * 2 * u;
      for (const [n, yk, wk, sp, ph, al] of CLOUDS) {
        if (!ART.has(n)) continue;
        const w = W * wk, span = W + w * 1.6, x = ((ph * span - o * sp) % span + span) % span - w * 0.8;
        art(n, x, hy * yk, w, w / ART.aspect(n), 'dawn', dawn * al, 1);
      }
    }
    if (dawn > 0.01 || st.sun > 0.01) {
      const p = Math.max(dawn, st.sun);
      sprite(ctx, 'soft', P.coralSoft, W * 0.72 - W * 1.1, hy - W * 0.7, W * 2.2, W * 1.4, 0.5 * p, false);
      sprite(ctx, 'soft', P.gold, W * 0.72 - W * 0.55, hy - W * 0.4, W * 1.1, W * 0.8, 0.35 * p, false);
    }
  }

  function stars(ctx) {
    const nightA = (1 - st.ds.dawn) * (1 - n0(S.daylight, 0)) * (1 - 0.8 * st.sun);
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

  function moon(ctx) {
    const a = (1 - st.ds.dawn) * (1 - n0(S.daylight, 0)) * (1 - st.sun);
    if (a < 0.02) return;
    const x = W * 0.2 - off(LAYER.stars) * 0.5 % W, y = H * 0.09, r = H * 0.022;
    glow(ctx, x, y, r * 16, grade(P.silver300, 'blue'), 0.16 * a, 'soft'); glow(ctx, x, y, r * 5, grade(P.silver100, 'blue'), 0.22 * a, 'soft');
    sprite(ctx, 'moon', grade(P.silver050, 'blue'), x - r * 1.2, y - r * 1.2, r * 2.4, r * 2.4, 0.9 * a, false);
  }

  function aurora(ctx) {
    const a = clamp(0.12 + 0.88 * n0(S.aurora, 0), 0, 1) * (1 - 0.85 * st.ds.dawn) * (1 - n0(S.daylight, 0));
    if (a < 0.02) return;
    const t = n0(S.t, 0) * (rm ? 0.4 : 1), o = off(LAYER.aurora), sg = Math.max(0.22, st.ds.green), step = Math.max(4, Math.round(W / 64));
    ctx.globalCompositeOperation = 'lighter';
    for (let k = 0; k < 2; k++) {
      const base = H * (0.2 + k * 0.1), amp = H * (0.035 + k * 0.012), hgt = H * (0.13 - k * 0.03), alpha = a * (k ? 0.55 : 0.85);
      for (let x = -step; x < W + step; x += step) {
        const wx = x + o, e = Math.sin(clamp((x + step) / (W + 2 * step), 0, 1) * Math.PI);
        const y = base + amp * Math.sin(wx * 0.006 + t * (0.18 + k * 0.07) + k * 2.4) + H * 0.02 * (noise(wx * 0.01 + t * 0.25 + k * 5) - 0.5);
        const h = hgt * (0.65 + 0.5 * noise(wx * 0.004 + t * 0.12 + k * 3));
        const u0 = ((wx * 0.35 + t * 5 + k * 90) % 249 + 249) % 249;
        const fa = alpha * e * (0.75 + 0.25 * Math.sin(t * 0.9 + wx * 0.02));
        if (sg < 0.98) { ctx.globalAlpha = fa * (1 - sg) * 0.9; ctx.drawImage(SPR.auroraGrey, u0, 0, 6, 128, x, y - h, step, h * 1.08); }
        if (sg > 0.02) { ctx.globalAlpha = fa * sg; ctx.drawImage(SPR.aurora, u0, 0, 6, 128, x, y - h, step, h * 1.08); }
      }
    }
    ctx.globalAlpha = 1;
    if (ART.has('sky_aurora')) {
      const w = W * 1.9, h = w / ART.aspect('sky_aurora'), span = w * 1.25;
      for (let x = -((((o + t * 4) % span) + span) % span) - w * 0.2; x < W; x += span) ART.draw(ctx, 'sky_aurora', x, H * 0.08 + Math.sin(t * 0.07) * H * 0.01, w, h, sg, 1, 0.42 * a * (0.2 + 0.8 * sg) * (0.85 + 0.15 * Math.sin(t * 0.5)));
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }

  function sun(ctx) {
    const p = st.sun;
    if (p <= 0.005) return;
    const x = W * 0.72, y = lerp(hy + H * 0.03, hy - H * 0.12, ease(p)), t = n0(S.t, 0);
    sprite(ctx, 'soft', P.gold, x - H * 0.2, y - H * 0.2, H * 0.4, H * 0.4, 0.4 * p, false);
    glow(ctx, x, y, H * 0.07, P.sun, 0.22 * p, 'soft');
    sprite(ctx, 'dot', P.sun, x - H * 0.024, y - H * 0.024, H * 0.048, H * 0.048, p, false);
    if (!rm) {
      ctx.save(); ctx.translate(x, y); ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 7; i++) {
        ctx.save(); ctx.rotate(Math.PI * (0.55 + i * 0.13) + Math.sin(t * 0.1 + i) * 0.03);
        ctx.globalAlpha = 0.045 * p * (0.6 + 0.4 * Math.sin(t * 0.3 + i * 1.7));
        ctx.drawImage(tint('beam', P.sun), 0, -H * 0.05, H * 0.9, H * 0.1);
        ctx.restore();
      }
      ctx.restore();
    }
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
    if (strip('far_mountains', LAYER.far, hy + 3 * u, H * 0.085, 'blue', 0.62, 0.72)) return;
    const top = col(P.silver100, 'blue', 1, 0.35), mid = col(P.mountain, 'blue', 1, 0.5), bot = col(P.mountain2, 'blue', 1, 0.6);
    ridge(ctx, hy + 2, H * 0.15, LAYER.far, 3, true, 6 * u, vgrad(ctx, 'mt' + top + mid + bot + H, hy - H * 0.13, hy, [[0, top], [0.35, mid], [1, bot]]));
    const t2 = col(P.mountain2, 'blue', 1, 0.42), b2 = col(P.night600, 'blue', 1, 0.45);
    ridge(ctx, hy + 2, H * 0.07, LAYER.far * 1.6, 8, false, 8 * u, vgrad(ctx, 'mt2' + t2 + b2 + H, hy - H * 0.07, hy, [[0, t2], [1, b2]]));
  }

  function islands(ctx) {
    if (strip('far_islands', LAYER.islands, hy + H * 0.008, H * 0.05, 'blue', 0.92, 0.9)) { lighthouse(ctx); return; }
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
    let lampY = base - h - h * 0.05;
    if (ART.has('lighthouse')) {
      const lh = H * 0.075, lw = lh * ART.aspect('lighthouse');
      art('lighthouse', x - lw * 0.495, base + lh * 0.04 - lh, lw, lh, 'yellow', 0.9, 0.85);
      lampY = base + lh * 0.04 - lh * 0.87;
    } else {
    ctx.fillStyle = col(P.spruce, 'green', 1, 0.4);
    ctx.beginPath(); ctx.moveTo(x - h * 0.9, base); ctx.bezierCurveTo(x - h * 0.4, base - h * 0.3, x + h * 0.4, base - h * 0.32, x + h * 1.1, base); ctx.fill();
    ctx.fillStyle = col(P.silver100, 'base', 1, 0.2);
    ctx.beginPath(); ctx.moveTo(x - wb / 2, base - h * 0.15); ctx.lineTo(x - wt / 2, base - h); ctx.lineTo(x + wt / 2, base - h); ctx.lineTo(x + wb / 2, base - h * 0.15); ctx.fill();
    ctx.fillStyle = col(P.slate, 'blue', 1, 0.2);
    for (let i = 0; i < 2; i++) ctx.fillRect(x - wb * 0.47 + i * h * 0.02, base - h * (0.38 + i * 0.3), wb * 0.94 - i * h * 0.04, h * 0.09);
    ctx.fillRect(x - wt * 0.7, base - h - h * 0.12, wt * 1.4, h * 0.04);
    }
    const beam = n0(S.beam, 0) * (1 - 0.9 * st.ds.dawn) * (1 - 0.7 * st.sun), lamp = clamp(0.35 + beam + st.ds.dawn * 0.3, 0, 1);
    glow(ctx, x, lampY, h * 0.5 * (0.6 + lamp), P.flame, 0.7 * lamp);
    if (beam > 0.02) {
      ctx.save(); ctx.translate(x, lampY); ctx.globalCompositeOperation = 'lighter';
      const ang = Math.PI + Math.sin(t * (rm ? 0.4 : 0.8)) * 0.5;
      ctx.rotate(ang); ctx.globalAlpha = 0.5 * beam;
      ctx.drawImage(tint('beam', P.flame), 0, -H * 0.04, W * 1.2, H * 0.08);
      ctx.restore();
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
    const sunP = st.sun, nightA = (1 - st.ds.dawn) * (1 - n0(S.daylight, 0)) * (1 - sunP);
    if (nightA > 0.05) sprite(ctx, 'soft', grade(P.silver300, 'blue'), W * 0.2 - W * 0.03, hy, W * 0.06, (gy - hy) * 0.8, 0.25 * nightA, true);
    if (sunP > 0.02) sprite(ctx, 'soft', P.gold, W * 0.72 - W * 0.09, hy - 4, W * 0.18, (gy - hy) * 1.1, 0.35 * sunP, true);
  }

  function midHills(ctx) {
    if (strip('mid_hills_spruce', LAYER.mid, gy + 8 * u, H * 0.13, 'green', 1, 0.82)) return;
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
    const d = clamp(n0(S.fog, 0.4), 0, 1.4) * (1 - 0.6 * st.ds.dawn);
    if (d <= 0.01) return;
    const t = n0(S.t, 0), drift = n0(S.fogDrift, 1) * (rm ? 0.4 : 1), f = near ? LAYER.fogNear : LAYER.fogFar;
    const c = grade(mixc(P.silver300, P.glow, 0.15 * st.ds.yellow), 'blue');
    const bw = W * 1.5, bh = H * (near ? 0.12 : 0.08), span = bw * 2;
    for (let k = 0; k < 3; k++) {
      const y = near ? lerp(gy - H * 0.06, gy + H * 0.04, k / 2) : lerp(hy - H * 0.03, hy + H * 0.05, k / 2);
      const x = ((k * 397 * u + t * 8 * u * drift * (k % 2 ? 1 : -0.7) - off(f) * (1 + k * 0.1)) % span + span) % span - bw;
      const breath = 0.8 + 0.2 * Math.sin(t * (rm ? 0.15 : 0.35) + k * 2.1);
      const a = (near ? 0.5 : 0.7) * d * breath;
      const im = k % 2 ? 'fog_band_b' : 'fog_band';
      if (A.Art.has(im)) {
        const ih = bw / A.Art.aspect(im);
        for (const xx of [x, x + bw * 0.98]) A.Art.draw(ctx, im, xx, y - ih / 2, bw, ih, satOf('blue') * 0.6, Math.min(1, lightOf('blue')), a * 0.62);
        continue;
      }
      sprite(ctx, 'fog', c, x, y - bh / 2, bw, bh, a, false);
      sprite(ctx, 'fog', c, x + bw * 0.98, y - bh / 2, bw, bh, a, false);
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
    const cOf = c => cache[c.type] || (cache[c.type] = grade(groundAt(c.type)[0](), groundAt(c.type)[1]));
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
    const painted = new Set();
    for (const c of vs) if (groundArt(ctx, c)) painted.add(c);
    ctx.fillStyle = vgrad(ctx, 'gshade' + H, gy, H, [[0, 'rgba(10,16,40,0)'], [0.2, 'rgba(10,16,40,0.18)'], [1, 'rgba(6,8,20,0.62)']]);
    ctx.fillRect(0, gy - 4 * u, W, H - gy + 4 * u);
    const o = S.worldX, dc = grade(P.silver050, 'base'), sh = grade(P.night600, 'blue');
    if (painted.size < vs.length) for (let i = 0; i < 5; i++) {
      const y = gy + (H - gy) * (0.16 + i * 0.17), amp = (3 + i * 2) * u, f = 1 + i * 0.12;
      ctx.beginPath();
      for (let x = -step; x <= W + step; x += step * 2) { const q = (x + o * f) / u; const yy = y - amp * noise(q * 0.008 + i * 13); x === -step ? ctx.moveTo(x, yy) : ctx.lineTo(x, yy); }
      ctx.strokeStyle = rgb(dc, 0.07); ctx.lineWidth = 1.2 * u; ctx.stroke();
      ctx.lineTo(W + step, y + 14 * u); ctx.lineTo(-step, y + 14 * u); ctx.closePath();
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
    const bx = sx(c.x1 - 100), by = gy + 18 * u + Math.sin(t * (rm ? 0.4 : 1.1)) * 1.6 * u, rock = Math.sin(t * (rm ? 0.4 : 1.1) + 1) * 0.03;
    if (bx > -80 && bx < W + 80) {
      ctx.save(); ctx.translate(bx, by); ctx.rotate(rock);
      ctx.fillStyle = col(P.wood, 'yellow', 1);
      ctx.beginPath(); ctx.moveTo(-34 * u, -6 * u); ctx.quadraticCurveTo(-30 * u, 8 * u, 0, 9 * u); ctx.quadraticCurveTo(30 * u, 8 * u, 38 * u, -8 * u); ctx.lineTo(-34 * u, -6 * u); ctx.fill();
      ctx.fillStyle = col(P.snow, 'base', 0.85); ctx.fillRect(-28 * u, -7 * u, 58 * u, 2 * u);
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
    let smx = x + w * 0.26, smy = y - 34 * u;
    glow(ctx, x - w * 0.22, y + h * 0.42, 90 * u * (0.8 + 0.4 * stove), P.amber, 0.22 * lit * flick, 'soft');
    if (A.Art.has('sauna_hut')) {
      const ww = 175 * u, hh = ww / A.Art.aspect('sauna_hut'), y0 = gy - hh + 10 * u;
      A.Art.draw(ctx, 'sauna_hut', x - ww / 2, y0, ww, hh, satOf('yellow'), Math.min(1, lightOf('yellow')), 1);
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
    const breath = (1 - walk) * Math.sin(t * 1.6);
    const swing = walk * 0.22 * Math.sin(ph + 0.9) + (1 - walk) * 0.05 * Math.sin(t * 0.9) * (rm ? 0.4 : 1);
    const hx = 11 + walk * 1.5 * Math.sin(ph), hy2 = -25 + breath * 0.3;
    st.fig = { k, walk, ph, bob, breath, swing, hx, hy: hy2 };
    st.lx = fx + k * (hx + Math.sin(swing) * 8);
    st.ly = gy + 1 + k * (-bob + hy2 + Math.cos(swing) * 8);
    const sp = figSprite();
    if (sp) {
      const [n, ax, , lx, ly] = sp, fh = H * FIG_H, fw = fh * ART.aspect(n), x0 = fx - fw * ax, y0 = gy + 3 * u - fh - bob * k;
      st.fig.sp = { n, x0, y0, fw, fh };
      st.lx = x0 + fw * lx + Math.sin(swing) * 1.5 * u;
      st.ly = y0 + fh * ly;
    }
  }
  const FIG_H = 0.1, FIGS = { walk: ['figure_walk', 0.48, 0, 0.93, 0.44], stand: ['figure_stand', 0.33, 0, 0.9, 0.4] };
  const figSprite = () => { const s = st.walk > 0.5 ? FIGS.walk : FIGS.stand; return ART.has(s[0]) ? s : null; };

  function figure(ctx) {
    const F = st.fig, { k, walk, ph, bob, breath } = F, t = n0(S.t, 0), sway = rm ? 0.3 : 1;
    const bright = n0(S.lanternBright, 1), warm = mixc(P.glow, P.amber, 0.3);
    sprite(ctx, 'soft', P.night950, fx - 16 * k, gy - 2 * k, 32 * k, 7 * k, 0.6, false);
    if (F.sp) {
      const { n, x0, y0, fw, fh } = F.sp, lean = walk * 0.025 * Math.sin(ph * 2) * sway, sq = 1 + 0.012 * breath;
      ctx.save(); ctx.translate(fx, y0 + fh); ctx.rotate(lean); ctx.scale(1, sq); ctx.translate(-fx, -(y0 + fh));
      ART.draw(ctx, n, x0, y0, fw, fh, Math.max(0.3, satOf('yellow')), Math.min(1, lerp(0.62, 1, Math.max(st.ds.dawn, 0.5 * n0(S.daylight, 0))) + 0.1 * bright), 1);
      ctx.restore();
      return;
    }
    ctx.save(); ctx.translate(fx, gy + 1); ctx.scale(k, k); ctx.translate(0, -bob);
    const body = rgb(mixc(grade(P.cloak, 'base'), P.violet700, 0.6)), rim = rgb(mixc(warm, P.flame, 0.3), Math.min(1, 0.55 * bright));
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
    ctx.save(); ctx.beginPath(); ctx.rect(-30, -47, 60, 50); ctx.clip(); ctx.fillStyle = rim; cloak(); ctx.fill(); ctx.restore();
    ctx.save(); ctx.translate(-1.1, 0.5); ctx.fillStyle = body; cloak(); ctx.fill(); ctx.restore();
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
  }

  function lantern(ctx) {
    const F = st.fig, k = F.k, t = n0(S.t, 0), x = st.lx, y = st.ly;
    const fl = (0.88 + 0.12 * noise(t * (rm ? 2 : 7)) + 0.05 * noise(t * 19)) * n0(S.flame, 1), br = n0(S.lanternBright, 1);
    const hx = fx + k * F.hx, hy2 = gy + 1 + k * (F.hy - F.bob);
    if (F.sp) {
      glow(ctx, x, y, 5 * k * fl, P.daylight, 0.85 * br);
      glow(ctx, x, y, 22 * k * fl, P.glow, 0.55 * br);
      for (const sp of S.sparks || []) { const age = t - sp.born; if (age >= 0 && age <= 1) glow(ctx, x + sp.dx * age * 34, y + sp.dy * age * 40 - age * 10, 2.4 * k, P.flame, 1 - age); }
      return;
    }
    ctx.strokeStyle = rgb(P.night950, 0.9); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(hx, hy2); ctx.lineTo(x, y - 3.5 * k); ctx.stroke();
    ctx.save(); ctx.translate(x, y); ctx.rotate(F.swing);
    ctx.fillStyle = rgb(P.night950); ctx.fillRect(-2.6 * k, -3.6 * k, 5.2 * k, 1.4 * k); ctx.fillRect(-2.1 * k, 3.4 * k, 4.2 * k, 1.2 * k);
    ctx.fillStyle = rgb(mixc(P.glow, P.daylight, 0.4)); ctx.fillRect(-2 * k, -2.2 * k, 4 * k, 5.6 * k);
    ctx.restore();
    glow(ctx, x, y, 7 * k * fl, P.daylight, 0.9 * br);
    glow(ctx, x, y, 22 * k * fl, P.glow, 0.55 * br);
    for (const sp of S.sparks || []) {
      const age = t - sp.born;
      if (age > 1 || age < 0) continue;
      glow(ctx, x + sp.dx * age * 34, y + sp.dy * age * 40 - age * 10, 2.4 * k, P.flame, 1 - age);
    }
  }

  function lanternLight(ctx) {
    const R = n0(S.lanternRadius, 70) * u, br = n0(S.lanternBright, 1), t = n0(S.t, 0), x = st.lx, y = st.ly;
    const fl = 0.93 + 0.07 * noise(t * (rm ? 1.5 : 5)), warm = mixc(P.amber, P.glow, 0.4);
    glow(ctx, x, y, R * 3.2 * fl, warm, 0.17 * br, 'soft');
    sprite(ctx, 'soft', warm, x - R * 2.2, gy - R * 0.35, R * 4.4, R * 0.75, 0.28 * br * fl, true);
    const under = chunkAtX(S.worldX)?.type;
    if (under === 'harbour' || under === 'lake') sprite(ctx, 'soft', P.glow, x - R * 0.25, gy, R * 0.5, R * 1.6, 0.25 * br * fl, true);
  }
  const chunkAtX = wx => chunks().find(c => wx >= c.x0 && wx < c.x1);

  function darkness(ctx) {
    const a = 0.72 * (1 - st.ds.dawn) * (1 - 0.85 * n0(S.daylight, 0)) * (1 - 0.6 * st.sun);
    if (a <= 0.01) return;
    const R = n0(S.lanternRadius, 70) * u * 3 / 6, w = W / 6, h = H / 6, dx = darkX;
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
    const x = st.lx, y = st.ly - 48 * u, p = (n0(S.t, 0) * 1.2) % 1;
    ctx.strokeStyle = rgb(P.flame, 0.5 * th * (1 - p)); ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(x, y, (6 + p * 14) * u, 0, 6.283); ctx.stroke();
    glow(ctx, x, y, 10 * u, P.flame, 0.7 * th);
  }

  function rings(ctx) {
    const t = n0(S.t, 0);
    for (const r of st.rings) {
      const p = clamp((t - r.t) / 2.6, 0, 1), e = ease(p);
      if (rm) { glow(ctx, st.lx, st.ly, H * 0.4, P.glow, 0.25 * r.a * Math.sin(p * Math.PI), 'soft'); continue; }
      const rr = 10 * u + e * H * 0.55;
      for (const [lw, al] of [[18, 0.05], [8, 0.08], [2.5, 0.18]]) { ctx.strokeStyle = rgb(P.glow, al * r.a * (1 - p) * (1 - p)); ctx.lineWidth = lw * u * (1 - 0.5 * p); ctx.beginPath(); ctx.arc(st.lx, st.ly, rr, 0, 6.283); ctx.stroke(); }
      glow(ctx, st.lx, st.ly, H * 0.3 * (0.4 + e), P.glow, 0.22 * r.a * (1 - p), 'soft');
    }
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
    const warm = n0(S.warm, 0), flash = rm ? 0 : n0(S.flash, 0), exp = n0(S.exposure, 1), border = n0(S.border, 0), black = n0(S.black, 0);
    if (warm > 0.001) { ctx.globalCompositeOperation = 'soft-light'; ctx.globalAlpha = Math.min(1, warm * 1.8); ctx.fillStyle = vgrad(ctx, 'warm' + H, 0, H, [[0, 'rgba(255,217,160,0)'], [0.55, 'rgba(255,201,138,0.3)'], [1, 'rgba(242,181,68,0.55)']]); ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; }
    ctx.drawImage(vign, 0, 0, W, H);
    if (grainPat && !rm) {
      ctx.save(); ctx.globalAlpha = 0.035; const ox = (Math.random() * 128) | 0, oy = (Math.random() * 128) | 0;
      ctx.translate(-ox, -oy); ctx.fillStyle = grainPat; ctx.fillRect(0, 0, W + 128, H + 128); ctx.restore();
    }
    if (flash > 0.01) { ctx.fillStyle = rgb(P.glow, 0.12 * flash); ctx.fillRect(0, 0, W, H); }
    if (exp < 1) { ctx.fillStyle = rgb(P.night950, 1 - exp); ctx.fillRect(0, 0, W, H); }
    if (border > 0.005 && S.borderColor) { ctx.globalAlpha = Math.min(1, border * 0.7); ctx.drawImage(tint('border', S.borderColor), 0, 0, W, H); ctx.globalAlpha = 1; }
    if (black > 0) { ctx.fillStyle = `rgba(0,0,0,${Math.min(1, black)})`; ctx.fillRect(0, 0, W, H); }
  }

  function scene(ctx) {
    sky(ctx); stars(ctx); moon(ctx); aurora(ctx); sun(ctx);
    mountains(ctx);
    sea(ctx);
    islands(ctx);
    fog(ctx, false);
    midHills(ctx);
    props(ctx, true);
    ground(ctx);
    footprints(ctx);
    props(ctx, false);
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
    ctx.strokeStyle = rgb(accent, done ? 0.75 : 0.2); ctx.stroke();
    if (done) glow(ctx, b.x + b.w / 2, b.y + b.h, b.w * 0.5, accent, 0.25, 'soft');
    ctx.restore();
  }

  A.World = {
    panel,
    lanternPos: () => [st ? st.lx : fx + 20, st ? st.ly : gy - 30],
    size: () => ({ W, H, gy, fx }),
    draw(ctx, w, h, state) {
      S = state; W = w; H = h; ctxRef = ctx;
      gy = H * 0.8; hy = H * 0.6; fx = W * 0.35; u = H / 844;
      rm = !!(A.config && A.config.reducedMotion) || !!(MQ && MQ.matches);
      pm = rm ? 0.5 : 1;
      st = states.get(S); if (!st) { st = newState(); states.set(S, st); }
      if (sized.W !== W || sized.H !== H || !vign) resize();
      step(); rig();
      ctx.save();
      scene(ctx);
      overlays(ctx);
      ctx.restore();
    },
  };
})();
