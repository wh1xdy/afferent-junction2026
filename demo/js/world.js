(() => {
  const { clamp, lerp, ease, hex, rgb, mixc, desat, noise, rng } = A;

  const P = {
    nightTop: hex('#14161B'), nightBot: hex('#2A2E36'),
    blueTop: hex('#10304D'), blueBot: hex('#2A5C80'),
    greenTop: hex('#0F2233'), greenBot: hex('#1E3A44'),
    dawnTop: hex('#9FC3E0'), dawnBot: hex('#F7C59F'),
    bark: hex('#E8E1D2'), warm: hex('#F2B544'), warm2: hex('#D98E2B'),
    ice: hex('#7FC8E8'), blue: hex('#3A7CA5'), blue2: hex('#1E4E79'),
    aurora: hex('#5FE3A1'), aurora2: hex('#2FA37A'), sea: hex('#4F86A8'),
    sun: hex('#FFE8B8'), sun2: hex('#F49D6E'), lantern: hex('#F2E6C9'), day: hex('#F4F7FF'),
    cloak: hex('#2E2B3F'), mountain: hex('#3D5F80'), mountain2: hex('#2C4A66'), snow: hex('#DDE6EE'),
    wood: hex('#7A5638'), moss: hex('#4A6B3F'), rock: hex('#5E6873'), red: hex('#B5483B'), white: hex('#EEF0F2'),
    fog: hex('#B9CAD6'), hut: hex('#6B4630'),
  };
  A.P = P;

  const r = rng(7);
  const STARS = Array.from({ length: 260 }, () => ({ x: r(), y: r() * 0.58, s: 0.5 + r() * 1.3, p: r() * 6.28 }));
  const REEDS = Array.from({ length: 40 }, (_, i) => ({ x: i * 90 + r() * 60, h: 18 + r() * 34, rock: r() < 0.25 }));
  const GROUND = { harbour: [P.blue2, 'blue'], forest: [P.moss, 'yellow'], lake: [P.ice, 'blue'], sauna: [P.snow, 'base'], shore: [P.snow, 'base'] };

  let S = null, W = 0, H = 0, gy = 0, hy = 0, fx = 0;

  const satOf = g => {
    const d = S.sat.dawn;
    if (g === 'base') return Math.max(0.05, d, 0.12 * (S.sat.yellow + S.sat.blue + S.sat.green));
    return Math.max(0.05, S.sat[g] || 0, d);
  };
  const lightOf = g => lerp(0.55, 1, S.sat.dawn) + 0.12 * (g === 'base' ? 0 : S.sat[g] || 0) + 0.35 * S.daylight;
  const col = (c, g = 'base', a = 1) => {
    const d = desat(c, satOf(g)), l = Math.min(1, lightOf(g));
    return rgb([d[0] * l, d[1] * l, d[2] * l], a);
  };
  const sx = wx => fx + wx - S.worldX;
  const chunkAt = wx => S.chunks.find(c => wx >= c.x0 && wx < c.x1) || S.chunks[S.chunks.length - 1];
  const visible = () => S.chunks.filter(c => sx(c.x1) > -120 && sx(c.x0) < W + 120);

  function sky(ctx) {
    let top = P.nightTop, bot = P.nightBot;
    top = mixc(top, P.blueTop, S.sat.blue * 0.8); bot = mixc(bot, P.blueBot, S.sat.blue * 0.7);
    top = mixc(top, P.greenTop, S.sat.green * 0.5); bot = mixc(bot, P.greenBot, S.sat.green * 0.4);
    top = mixc(top, P.blueBot, S.daylight * 0.5); bot = mixc(bot, P.day, S.daylight * 0.35);
    top = mixc(top, P.dawnTop, S.sat.dawn); bot = mixc(bot, P.dawnBot, S.sat.dawn);
    const g = ctx.createLinearGradient(0, 0, 0, gy);
    g.addColorStop(0, rgb(top)); g.addColorStop(0.75, rgb(mixc(top, bot, 0.7))); g.addColorStop(1, rgb(bot));
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, gy + 2);
  }

  function stars(ctx) {
    const n = Math.round(S.stars + 40 * S.sparkle);
    const a = (1 - S.sat.dawn) * (1 - S.daylight) * 0.7;
    if (a <= 0.01) return;
    for (let i = 0; i < n && i < STARS.length; i++) {
      const st = STARS[i], tw = 0.6 + 0.4 * Math.sin(S.t * 1.3 + st.p);
      ctx.fillStyle = `rgba(235,240,255,${a * tw})`;
      const x = ((st.x * W - S.worldX * 0.03) % W + W) % W;
      ctx.fillRect(x, st.y * H, st.s, st.s);
    }
  }

  function aurora(ctx) {
    const a = clamp(S.aurora, 0, 1);
    if (a < 0.01) return;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (let k = 0; k < 3; k++) {
      const base = H * (0.12 + k * 0.07), amp = 22 + k * 8, ph = S.t * (0.15 + k * 0.05) + k * 2, h = H * (0.16 - k * 0.03);
      ctx.beginPath();
      for (let x = -10; x <= W + 10; x += 12) {
        const y = base + amp * Math.sin(x * 0.012 + ph) + 10 * noise(x * 0.02 + S.t * 0.3 + k * 9);
        x === -10 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      for (let x = W + 10; x >= -10; x -= 12) ctx.lineTo(x, base + h + amp * Math.sin(x * 0.012 + ph + 0.4));
      ctx.closePath();
      const g = ctx.createLinearGradient(0, base - amp, 0, base + h + amp);
      const s = Math.max(0.2, S.sat.green, S.sat.dawn), c1 = desat(P.aurora, s), c2 = desat(P.aurora2, s);
      g.addColorStop(0, rgb(c1, 0)); g.addColorStop(0.35, rgb(c1, 0.34 * a)); g.addColorStop(1, rgb(c2, 0));
      ctx.fillStyle = g; ctx.fill();
    }
    ctx.restore();
  }

  function ridge(ctx, base, amp, factor, seed, c, g) {
    ctx.beginPath(); ctx.moveTo(0, gy);
    for (let x = 0; x <= W + 8; x += 8) {
      const u = x + S.worldX * factor;
      ctx.lineTo(x, base - amp * (0.6 * noise(u * 0.005 + seed) + 0.4 * noise(u * 0.013 + seed * 3)));
    }
    ctx.lineTo(W, gy); ctx.closePath();
    ctx.fillStyle = col(c, g); ctx.fill();
  }

  function sun(ctx) {
    if (S.sunP <= 0) return;
    const x = W * 0.72, y = lerp(hy + 30, hy - H * 0.14, ease(S.sunP));
    const g = ctx.createRadialGradient(x, y, 0, x, y, H * 0.35);
    g.addColorStop(0, rgb(P.sun, 0.95 * S.sunP)); g.addColorStop(0.12, rgb(P.sun, 0.8 * S.sunP));
    g.addColorStop(0.35, rgb(P.sun2, 0.3 * S.sunP)); g.addColorStop(1, rgb(P.sun2, 0));
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, gy);
  }

  function sea(ctx) {
    const g = ctx.createLinearGradient(0, hy, 0, gy);
    g.addColorStop(0, col(P.sea, 'blue')); g.addColorStop(1, col(P.blue2, 'blue'));
    ctx.fillStyle = g; ctx.fillRect(0, hy, W, gy - hy + 2);
  }

  function lighthouse(ctx) {
    const x = W * 0.86, base = hy + 6, s = 0.3, h = H * 0.42 * s, wB = 34 * s, wT = 22 * s;
    ctx.save(); ctx.translate(x, base);
    ctx.fillStyle = col(P.white, 'base');
    ctx.beginPath(); ctx.moveTo(-wB / 2, 0); ctx.lineTo(-wT / 2, -h); ctx.lineTo(wT / 2, -h); ctx.lineTo(wB / 2, 0); ctx.fill();
    ctx.fillStyle = col(P.red, 'yellow');
    for (let i = 0; i < 3; i++) { const y0 = -h * (0.2 + i * 0.27); ctx.fillRect(-wB / 2 + 1, y0 - h * 0.1, wB - 2, h * 0.1); }
    const lamp = clamp(S.beam + S.sat.dawn + 0.25, 0, 1);
    ctx.fillStyle = rgb(mixc([60, 60, 66], P.lantern, lamp)); ctx.fillRect(-wT / 2, -h - 5, wT, 5);
    if (S.beam > 0.02) {
      ctx.globalCompositeOperation = 'lighter';
      const ang = S.t * 1.1;
      ctx.translate(0, -h - 2); ctx.rotate(Math.PI + Math.sin(ang) * 0.35);
      const g = ctx.createLinearGradient(0, 0, W, 0);
      g.addColorStop(0, rgb(P.lantern, 0.45 * S.beam)); g.addColorStop(1, rgb(P.lantern, 0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(0, -2); ctx.lineTo(W, -70); ctx.lineTo(W, 70); ctx.lineTo(0, 2); ctx.fill();
    }
    ctx.restore();
  }

  function fog(ctx) {
    const d = clamp(S.fog, 0, 1.4);
    if (d <= 0.01) return;
    for (let k = 0; k < 5; k++) {
      const y = lerp(hy - 10, gy + 10, k / 4), w = W * 0.9;
      const x = ((k * 173 + S.t * 9 * S.fogDrift * (k % 2 ? 1 : -0.6) - S.worldX * 0.25) % (W * 1.6) + W * 1.6) % (W * 1.6) - W * 0.3;
      ctx.save(); ctx.translate(x, y); ctx.scale(1, 0.18);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, w);
      g.addColorStop(0, col(P.fog, 'blue', 0.28 * d)); g.addColorStop(1, col(P.fog, 'blue', 0));
      ctx.fillStyle = g; ctx.fillRect(-w, -w, 2 * w, 2 * w);
      ctx.restore();
    }
  }

  function ground(ctx) {
    const step = 6;
    for (let x = 0; x < W + step; x += step) {
      const wx = S.worldX + x - fx, [c, g] = GROUND[chunkAt(wx).type];
      const y = gy + 3 * noise(wx * 0.02);
      ctx.fillStyle = col(c, g);
      ctx.fillRect(x, y, step + 1, H - y);
    }
    for (const c of visible()) {
      if (c.type !== 'lake' || S.iceGlow <= 0) continue;
      const g = ctx.createLinearGradient(0, gy, 0, H);
      g.addColorStop(0, rgb(P.ice, 0.3 * S.iceGlow)); g.addColorStop(1, rgb(P.blue, 0));
      ctx.fillStyle = g; ctx.fillRect(sx(c.x0), gy, c.x1 - c.x0, H - gy);
    }
  }

  function props(ctx, back) {
    for (const c of visible()) {
      if (c.type === 'forest') birches(ctx, c, back);
      if (back) continue;
      if (c.type === 'harbour') pier(ctx, c);
      if (c.type === 'sauna') hut(ctx, c);
    }
  }

  function pier(ctx, c) {
    const a = sx(c.x0 + 60), b = sx(c.x0 + 420);
    ctx.fillStyle = col(P.wood, 'yellow');
    ctx.fillRect(a, gy - 4, b - a, 6);
    for (let wx = c.x0 + 70; wx < c.x0 + 420; wx += 55) ctx.fillRect(sx(wx), gy, 4, 26);
    const bx = sx(c.x0 + 520), by = gy + 14;
    ctx.beginPath(); ctx.moveTo(bx - 34, by); ctx.quadraticCurveTo(bx, by + 16, bx + 34, by); ctx.lineTo(bx + 28, by - 4); ctx.lineTo(bx - 28, by - 4); ctx.fill();
  }

  function birches(ctx, c, back) {
    if (!c.trees) {
      const rr = rng(c.seed);
      c.trees = Array.from({ length: 14 }, (_, i) => ({ x: c.x0 + 30 + i * ((c.x1 - c.x0 - 60) / 14) + rr() * 20, h: 0.3 + rr() * 0.14, w: 5 + rr() * 4, back: i % 3 === 1, seed: rr() * 100 }));
    }
    for (const b of c.trees) {
      if (b.back !== back) continue;
      const f = back ? 0.82 : 1, x = fx + (b.x - S.worldX) * f;
      if (x < -40 || x > W + 40) continue;
      const h = H * b.h * (back ? 0.85 : 1), w = b.w * (back ? 0.8 : 1), top = gy - h;
      ctx.fillStyle = col(P.bark, 'yellow', back ? 0.6 : 1);
      ctx.fillRect(x, top, w, h + 4);
      ctx.fillStyle = `rgba(20,20,24,${back ? 0.35 : 0.6})`;
      for (let i = 0; i < 7; i++) ctx.fillRect(x + (i % 2 ? w * 0.4 : 0), top + h * (0.1 + 0.12 * i + 0.04 * noise(b.seed + i)), w * 0.6, 2);
      ctx.strokeStyle = col(P.bark, 'yellow', back ? 0.35 : 0.6); ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i < 4; i++) {
        const yy = top + 8 + i * 9, dir = i % 2 ? 1 : -1;
        ctx.moveTo(x + w / 2, yy); ctx.lineTo(x + w / 2 + dir * (12 + 6 * noise(b.seed + i * 3)), yy - 10);
      }
      ctx.stroke();
    }
  }

  function hut(ctx, c) {
    const x = sx(c.x0 + (c.x1 - c.x0) * 0.45), w = 92, h = 58, y = gy - h;
    if (x < -150 || x > W + 150) return;
    ctx.fillStyle = col(P.hut, 'yellow'); ctx.fillRect(x, y, w, h);
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    for (let i = 1; i < 6; i++) ctx.fillRect(x, y + i * (h / 6), w, 1.5);
    ctx.fillStyle = col(P.snow, 'base');
    ctx.beginPath(); ctx.moveTo(x - 10, y + 2); ctx.lineTo(x + w / 2, y - 30); ctx.lineTo(x + w + 10, y + 2); ctx.closePath(); ctx.fill();
    ctx.fillStyle = col(P.rock, 'base'); ctx.fillRect(x + w * 0.7, y - 34, 10, 20);
    ctx.fillStyle = rgb(mixc([40, 34, 30], P.warm, 0.7)); ctx.fillRect(x + 14, y + 18, 16, 14);
    const g = ctx.createRadialGradient(x + 22, y + 25, 0, x + 22, y + 25, 70 + 40 * S.stove);
    g.addColorStop(0, rgb(P.warm, 0.25 + 0.25 * S.stove)); g.addColorStop(1, rgb(P.warm, 0));
    ctx.fillStyle = g; ctx.fillRect(x - 60, y - 60, 170, 170);
    for (let i = 0; i < 4; i++) {
      const p = (S.t * 0.25 + i / 4) % 1;
      ctx.fillStyle = `rgba(200,205,215,${0.18 * (1 - p)})`;
      ctx.beginPath(); ctx.arc(x + w * 0.7 + 5 + p * 18, y - 36 - p * 50, 5 + p * 10, 0, 6.28); ctx.fill();
    }
  }

  function figure(ctx) {
    const y = gy, bob = S.walking ? Math.sin(S.t * 9 * S.stride) * 1.5 : 0, step = S.walking ? Math.sin(S.t * 9 * S.stride) * 3 : 0;
    ctx.save(); ctx.translate(fx, y + bob);
    ctx.fillStyle = rgb(P.cloak);
    ctx.fillRect(-4 + step, -8, 3, 8); ctx.fillRect(2 - step, -8, 3, 8);
    ctx.beginPath(); ctx.moveTo(-10, -6); ctx.quadraticCurveTo(-11, -30, 0, -38); ctx.quadraticCurveTo(10, -30, 10, -6); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.arc(1, -42, 7.5, 0, 6.28); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-6, -46); ctx.quadraticCurveTo(-2, -54, 4, -48); ctx.fill();
    ctx.strokeStyle = rgb(P.wood); ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(6, -26); ctx.lineTo(20, -36); ctx.stroke();
    ctx.fillStyle = 'rgba(10,10,14,0.85)'; ctx.beginPath(); ctx.arc(3, -42, 4, 0, 6.28); ctx.fill();
    ctx.restore();
  }

  const lanternPos = () => [fx + 20, gy - 30 + (S.walking ? Math.sin(S.t * 9 * S.stride) * 1.5 : 0)];
  A.World = { lanternPos: () => lanternPos() };

  function lantern(ctx) {
    const [x, y] = lanternPos(), f = S.flame;
    ctx.fillStyle = rgb([40, 36, 34]); ctx.fillRect(x - 4, y - 2, 8, 12);
    const g = ctx.createRadialGradient(x, y + 4, 0, x, y + 4, 9 * f);
    g.addColorStop(0, rgb([255, 248, 225], S.lanternBright)); g.addColorStop(0.5, rgb(P.warm, 0.9 * S.lanternBright)); g.addColorStop(1, rgb(P.warm2, 0));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y + 4, 9 * f, 0, 6.28); ctx.fill();
    for (const sp of S.sparks) {
      const age = S.t - sp.born;
      if (age > 0.8) continue;
      ctx.fillStyle = rgb(P.lantern, 1 - age / 0.8);
      ctx.fillRect(x + sp.dx * age * 40, y + sp.dy * age * 40, 2, 2);
    }
  }

  function darkness(ctx) {
    const [x, y] = lanternPos(), R = S.lanternRadius;
    const a = 0.62 * (1 - S.sat.dawn) * (1 - 0.8 * S.daylight);
    if (a <= 0.01) return;
    const g = ctx.createRadialGradient(x, y, R * 0.15, x, y, R * 2.6);
    g.addColorStop(0, 'rgba(6,7,10,0)'); g.addColorStop(0.45, `rgba(6,7,10,${a * 0.35})`); g.addColorStop(1, `rgba(6,7,10,${a})`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    const w = ctx.createRadialGradient(x, y, 0, x, y, R);
    w.addColorStop(0, rgb(P.warm, 0.22 * S.lanternBright)); w.addColorStop(1, rgb(P.warm, 0));
    ctx.fillStyle = w; ctx.fillRect(x - R, y - R, 2 * R, 2 * R);
  }

  function orb(ctx) {
    const o = S.orb;
    if (o.alpha <= 0.01) return;
    const [lx] = lanternPos(), x = lx - 20, y = H * 0.42, R = lerp(26, 70, ease(o.b));
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(x, y, 0, x, y, R * 1.6);
    const c = mixc(P.warm, P.aurora, 0.5 * S.sat.green);
    g.addColorStop(0, rgb(c, (0.12 + 0.25 * o.hold) * o.alpha)); g.addColorStop(0.6, rgb(c, 0.08 * o.alpha)); g.addColorStop(1, rgb(c, 0));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, R * 1.6, 0, 6.28); ctx.fill();
    ctx.strokeStyle = rgb(c, (0.3 + 0.4 * o.sync) * o.alpha); ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(x, y, R, 0, 6.28); ctx.stroke();
    ctx.restore();
  }

  function tapHint(ctx) {
    if (S.tapHint <= 0.01) return;
    const [x, y] = lanternPos(), p = (S.t * 1.2) % 1;
    ctx.strokeStyle = `rgba(235,232,222,${0.5 * S.tapHint * (1 - p)})`; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(x, y - 52, 6 + p * 14, 0, 6.28); ctx.stroke();
    ctx.fillStyle = `rgba(235,232,222,${0.6 * S.tapHint})`; ctx.beginPath(); ctx.arc(x, y - 52, 4, 0, 6.28); ctx.fill();
  }

  function foreground(ctx) {
    for (const rd of REEDS) {
      const x = ((rd.x - S.worldX * 1.5) % 3600 + 3600) % 3600 - 200;
      if (x < -40 || x > W + 40) continue;
      ctx.fillStyle = 'rgba(8,9,12,0.88)'; ctx.strokeStyle = 'rgba(8,9,12,0.88)'; ctx.lineWidth = 2;
      if (rd.rock) { ctx.beginPath(); ctx.ellipse(x, H - 4, 26, 16, 0, Math.PI, 0); ctx.fill(); continue; }
      ctx.beginPath();
      for (let i = 0; i < 4; i++) { ctx.moveTo(x + i * 4, H); ctx.quadraticCurveTo(x + i * 4 + 4, H - rd.h * 0.6, x + i * 4 + 8 * Math.sin(S.t + i), H - rd.h - i * 4); }
      ctx.stroke();
    }
  }

  function overlays(ctx) {
    if (S.warm > 0.001) { ctx.fillStyle = rgb(P.warm2, S.warm * 0.55); ctx.fillRect(0, 0, W, H); }
    if (S.flash > 0.01) { ctx.fillStyle = `rgba(255,236,200,${0.12 * S.flash})`; ctx.fillRect(0, 0, W, H); }
    if (S.exposure < 1) { ctx.fillStyle = `rgba(0,0,0,${1 - S.exposure})`; ctx.fillRect(0, 0, W, H); }
    if (S.border > 0.005) {
      const c = S.borderColor, b = 28;
      for (const [x0, y0, x1, y1, rx, ry, rw, rh] of [[0, 0, b, 0, 0, 0, b, H], [W, 0, W - b, 0, W - b, 0, b, H], [0, 0, 0, b, 0, 0, W, b], [0, H, 0, H - b, 0, H - b, W, b]]) {
        const g = ctx.createLinearGradient(x0, y0, x1, y1);
        g.addColorStop(0, rgb(c, S.border)); g.addColorStop(1, rgb(c, 0));
        ctx.fillStyle = g; ctx.fillRect(rx, ry, rw, rh);
      }
    }
    if (S.black > 0) { ctx.fillStyle = `rgba(0,0,0,${S.black})`; ctx.fillRect(0, 0, W, H); }
  }

  function scene(ctx) {
    sky(ctx); sun(ctx); stars(ctx); aurora(ctx);
    ridge(ctx, hy - 4, H * 0.12, 0.12, 3, P.mountain, 'blue');
    sea(ctx);
    ridge(ctx, hy + 6, H * 0.06, 0.2, 11, P.mountain2, 'blue');
    lighthouse(ctx);
    fog(ctx);
    props(ctx, true);
    ground(ctx);
    props(ctx, false);
    darkness(ctx);
    orb(ctx);
    figure(ctx); lantern(ctx); tapHint(ctx);
    foreground(ctx);
  }

  A.World.draw = (ctx, w, h, state) => {
    S = state; W = w; H = h; gy = H * 0.8; hy = H * 0.62; fx = W * 0.35;
    scene(ctx);
    if (S.sweep > 0 && S.sweep < 1) {
      const saved = S.sat;
      S.sat = { yellow: 1, blue: 1, green: 1, dawn: 1 };
      ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W * S.sweep, H); ctx.clip();
      scene(ctx);
      ctx.restore();
      S.sat = saved;
    }
    overlays(ctx);
  };
  A.World.size = () => ({ W, H, gy, fx });
})();
