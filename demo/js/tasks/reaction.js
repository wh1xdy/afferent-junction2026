(() => {
  const { clamp, lerp, ema, rgb, mixc } = A;
  const J = A.J, C = J.C, E = J.ease, R = Math.random, TAU = Math.PI * 2;
  const POSE = 0.55, LIFT = 1.15;
  const DEMO = { bite: 0.8, press: 1.0, auto: 1.08 };
  const STEP = [5, 6, 7, 8, 9];
  const FISH = 'task_reaction_light_fish', SPLASH = 'task_reaction_splash_sheet';
  const CREAM = mixc(C.silver100, C.glow, 0.35), LINE = C.silver200, WOOD = C.woodD;

  const sheet = (r, stops) => {
    const c = document.createElement('canvas'); c.width = c.height = 2 * r;
    const x = c.getContext('2d'), g = x.createRadialGradient(r, r, 0, r, r, r);
    for (const [t, col] of stops) g.addColorStop(t, col);
    x.fillStyle = g; x.fillRect(0, 0, 2 * r, 2 * r);
    return c;
  };
  const PLATE = sheet(128, [[0, rgb(C.night950, 0.9)], [0.5, rgb(C.night950, 0.86)], [0.75, rgb(C.night950, 0.4)], [1, rgb(C.night950, 0)]]);
  const BITE = sheet(128, [[0, rgb(C.silver050)], [0.22, rgb(C.flame)], [0.45, rgb(C.flame, 0.92)], [0.7, rgb(C.flame, 0.32)], [1, rgb(C.flame, 0)]]);
  const img = (ctx, c, x, y, r, a = 1, sx = 1, sy = 1) => {
    if (a <= 0.003) return;
    const ga = ctx.globalAlpha; ctx.globalAlpha = ga * Math.min(1, a);
    ctx.drawImage(c, x - r * sx, y - r * sy, 2 * r * sx, 2 * r * sy);
    ctx.globalAlpha = ga;
  };

  const hooks = () => A.World?.hooks || {};
  const geo = () => {
    const { W, H, gy } = J.size(), U = H / 844, S = 390 * U, sp = hooks().biteSpot?.();
    const [x, y] = sp || [W * 0.56, (gy ?? H * 0.82) + H * 0.042];
    const [lx, ly] = A.World?.lanternPos?.() || [W * 0.42, H * 0.78];
    return { W, H, U, S, x, y, lx, ly };
  };
  const lighthouse = g => {
    const m = hooks().landmarks?.()?.find(l => l.kind === 'lighthouse');
    return m ? [m.x, m.y] : [g.W * 0.84, g.H * 0.55];
  };

  const state = s => {
    let B = s.bite;
    if (!B || (s.phase === 'rt' && B.key !== s.phaseAt)) {
      B = s.bite = {
        key: s.phaseAt, t0: J.at, last: J.at, tr: null, fl: { m: 'none', t: 0 }, hit: -9, yank: -9, whip: -9, twitch: -9, dip: -9,
        fish: [], rip: [], beads: [], demo: 0, ghostPress: -9, ghostA: 0, touched: false, catches: 0, ph: R() * TAU,
        doneAt: null, payAt: null, ignited: false, gathered: false, released: false,
      };
    }
    return B;
  };

  const ripple = (B, x, y, r0, r1, dur, a) => B.rip.push({ t: J.at, x, y, r0, r1, dur, a });

  const cast = B => { B.fl = { m: 'cast', t: J.at }; B.ph = R() * TAU; };

  const catchFish = (s, B, { demo = false, player = true } = {}) => {
    const g = geo(), at = J.at, rm = J.rm(), U = g.U;
    B.fl = { m: 'none', t: at };
    B.hit = at; B.yank = at; B.whip = at;
    J.hitstop(null, 50);
    J.bloom(g.x, g.y, g.S * 0.16, C.flame, 0.5, 0.12, 0.3);
    ripple(B, g.x, g.y, 10 * U, 46 * U, 0.6, 0.5);
    ripple(B, g.x, g.y, 6 * U, 30 * U, 0.7, 0.35);
    B.rip[B.rip.length - 1].t += 0.12;
    if (!rm) {
      for (let i = 0; i < 20; i++) {
        const a = -Math.PI / 2 + (R() - 0.5) * 1.7, sp = (150 + 230 * R()) * U;
        J.fx.add({ x: g.x + (R() - 0.5) * 12 * U, y: g.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: 950 * U, drag: 0.5, life: 0.5 + 0.35 * R(), size: [(2 + 1.4 * R()) * U, 1.1 * U], alpha: [1, 0.2], c: mixc(C.silver100, C.amber, R()), kind: 'mote', add: true });
      }
    }
    B.fish.push({ t: at, kind: 'catch', x0: g.x, y0: g.y, dur: rm ? 0.3 : 0.5, bead: demo ? -1 : s.core.trials.length, demo });
    if (!demo) B.catches++;
    if (player) J.hap.seq([['medium', 0], ['light', 450]]);
    J.sfx('bite_zip'); J.sfx('bite_plunk');
  };

  const sync = (s, B, now) => {
    const t = now - s.phaseAt, tr = s.core.trial;
    if (B.demo === 0) { cast(B); B.demo = 1; }
    if (B.demo === 1 && t >= DEMO.bite) { B.fl = { m: 'bite', t: J.at }; B.demo = 2; }
    if (B.demo === 2 && t >= DEMO.press && B.ghostPress < 0) B.ghostPress = J.at;
    if (B.demo === 2 && t >= DEMO.auto) { catchFish(s, B, { demo: true, player: false }); B.demo = 3; }
    if (tr && tr !== B.tr) { B.tr = tr; cast(B); }
  };

  const touch = (s, d) => {
    const B = state(s);
    B.touched = true;
    if (s.core.trial) return;
    if (B.demo === 2) { catchFish(s, B, { demo: true }); B.demo = 3; return; }
    const g = geo();
    if (d && d.x != null) J.fx.burst(d.x, d.y, 4, C.flame, 70 * g.U, { life: 0.35, size: [2 * g.U, 0.6 * g.U] });
    if (B.fl.m === 'water') { B.dip = J.at; ripple(B, g.x, g.y, 6 * g.U, 22 * g.U, 0.45, 0.3); }
  };

  const fishPos = (f, g, p) => {
    if (f.kind === 'catch') {
      const u = p + 0.6 / TAU * Math.sin(TAU * p), h = 0.1 * g.H;
      return [lerp(f.x0, g.lx, u), lerp(f.y0, g.ly, u) - h * 4 * u * (1 - u)];
    }
    if (p < 0.72) { const u = E.inOut(p / 0.72); return [lerp(f.x0, g.lx, u), f.y0 + 4 * g.U + Math.sin(p * 30) * 1.2 * g.U]; }
    const u = E.outSoft((p - 0.72) / 0.28);
    return [g.lx, lerp(f.y0 + 4 * g.U, g.ly, u)];
  };

  const tick = (s, B, g) => {
    const at = J.at, dt = clamp(at - B.last, 0, 0.1), rm = J.rm();
    B.last = at;
    if (B.fl.m === 'cast' && at - B.fl.t >= 0.3) { B.fl = { m: 'water', t: at }; ripple(B, g.x, g.y, 8 * g.U, 34 * g.U, 0.6, 0.45); }
    if (B.fl.m === 'reel' && at - B.fl.t >= 0.3) B.fl = { m: 'none', t: at };
    for (const f of B.fish) {
      const p = (at - f.t) / f.dur;
      if (p >= 1 && !f.arrived) {
        f.arrived = true;
        if (f.bead > 0) B.beads.push({ i: f.bead - 1, t: at, pop: f.kind === 'catch' });
        if (f.kind === 'catch') {
          s.kick(f.demo ? 0.4 : 0.6);
          J.fx.burst(g.lx, g.ly, 8, C.glow, 90 * g.U, { life: 0.45, size: [2.4 * g.U, 0.8 * g.U] });
          J.sfx('bite_catch', { step: f.bead, piano: [f.demo ? 4 : STEP[clamp(f.bead, 1, 5) - 1], f.demo ? 0.07 : 0.11] });
        } else { s.kick(0.3); J.bloom(g.lx, g.ly, g.S * 0.08, C.glow, 0.3, 0.2, 0.5); }
      }
      if (!rm && p > 0 && p < 1 && f.kind === 'catch' && (f.n = (f.n || 0) + 1) % 2 === 0) {
        const [x, y] = fishPos(f, g, p);
        J.fx.trailMote(x, y, C.amber, { vy: -12 * g.U, life: 0.5, size: [2.2 * g.U, 0.6 * g.U] });
      }
    }
    B.fish = B.fish.filter(f => !f.arrived);
    B.rip = B.rip.filter(r => at - r.t < r.dur);
    const ghostOn = !B.touched && B.catches === 0 && B.demo >= 1 && at - B.t0 > 0.35 && B.doneAt == null;
    B.ghostA = ema(B.ghostA, ghostOn ? 0.62 : 0, dt, ghostOn ? 0.18 : 0.08);

    let ang = POSE;
    if (!rm) {
      const w = (at - B.whip) / 0.35, tw = at - B.twitch;
      if (w >= 0 && w < 1) ang += 0.5 * Math.exp(-4 * w) * Math.sin(TAU * 1.25 * w);
      if (tw >= 0 && tw < 0.3) ang += 0.06 * Math.exp(-10 * tw) * Math.sin(tw * 40);
    }
    if (B.payAt != null) {
      const pt = at - B.payAt;
      ang = lerp(ang, LIFT, E.outSoft(clamp(pt / 0.3, 0, 1)));
      if (pt >= 0.25 && !B.gathered) {
        B.gathered = true; s.kick(0.8);
        J.bloom(g.lx, g.ly, g.S * 0.12, C.glow, 0.45, 0.2, 0.6);
      }
      if (pt >= 0.45 && !B.ignited) {
        B.ignited = true;
        const flare = hooks().flareLighthouse, [hx, hy] = lighthouse(g);
        if (flare) { flare(1); J.bloom(hx, hy, g.S * 0.1, C.glow, 0.5, 0.3, 0.9); }
        else J.bloom(g.lx, g.ly, g.S * 0.2, C.glow, 0.5, 0.3, 0.9);
        J.hap('success'); J.sfx('bite_swell', { piano: [0, 0.1] });
      }
      if (pt >= 0.8 && !B.released) { B.released = true; hooks().lanternPose?.(null); }
    }
    if (!B.released) hooks().lanternPose?.(ang);
  };

  const drawLine = (ctx, B, g, at, rm) => {
    const tip = [g.lx + (B.fl.m === 'bite' && !rm ? 1.6 * g.U * Math.sin(TAU * 2 * (at - B.fl.t)) : 0), g.ly - 7 * g.U];
    let end = null, sag = 14 * g.U, a = 0.5;
    const fp = floatPos(B, g, at, rm);
    if (B.fl.m === 'bite') { end = [g.x, g.y + 5 * g.U]; sag = 1.5 * g.U; a = 0.62; }
    else if (fp) { end = fp; if (B.fl.m === 'cast') sag *= clamp((at - B.fl.t) / 0.3, 0, 1); }
    else {
      const p = (at - B.yank) / 0.28;
      if (p >= 0 && p < 1) { const u = E.outSoft(p); end = [lerp(g.x, tip[0] + 6 * g.U, u), lerp(g.y, tip[1] + 10 * g.U, u)]; sag = -10 * g.U * (1 - u); a = 0.6 * (1 - u); }
    }
    if (!end) return;
    ctx.strokeStyle = rgb(LINE, a); ctx.lineWidth = Math.max(1, 0.9 * g.U); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(tip[0], tip[1]);
    ctx.quadraticCurveTo((tip[0] + end[0]) / 2, Math.max(tip[1], end[1]) + sag, end[0], end[1]);
    ctx.stroke();
  };

  const floatPos = (B, g, at, rm) => {
    const t = at - B.fl.t, tip = [g.lx, g.ly - 7 * g.U];
    if (B.fl.m === 'cast') {
      if (rm) return [g.x, g.y];
      const p = clamp(t / 0.3, 0, 1), u = E.outSoft(p);
      return [lerp(tip[0], g.x, u), lerp(tip[1], g.y, u) - Math.sin(Math.PI * p) * 34 * g.U];
    }
    if (B.fl.m === 'water') {
      const d = at - B.dip, dip = d >= 0 && d < 0.5 ? 4 * g.U * Math.exp(-7 * d) * Math.sin(d * 22) : 0;
      return [g.x, g.y + (rm ? 0 : 1.3 * g.U * Math.sin(TAU * 0.4 * (at - B.fl.t) + B.ph)) + dip];
    }
    if (B.fl.m === 'reel') {
      if (rm) return [g.x, g.y];
      const u = E.inOut(clamp(t / 0.3, 0, 1));
      return [lerp(g.x, tip[0], u), lerp(g.y, tip[1], u) - Math.sin(Math.PI * u) * 16 * g.U];
    }
    return null;
  };

  const drawFloat = (ctx, x, y, U, a) => {
    if (a <= 0.01) return;
    const r = 7.5 * U, wl = y + r * 0.35;
    ctx.save();
    ctx.globalAlpha *= a;
    ctx.beginPath(); ctx.rect(x - r * 2, y - r * 3, r * 4, r * 3 + (wl - y)); ctx.clip();
    ctx.fillStyle = rgb(CREAM); ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    ctx.fillStyle = rgb(WOOD); ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI); ctx.fill();
    ctx.fillStyle = rgb(C.night950, 0.25); ctx.beginPath(); ctx.arc(x + r * 0.25, y, r * 0.85, -1.2, 1.6); ctx.fill();
    ctx.restore();
    ctx.save(); ctx.globalAlpha *= a;
    J.sprite(ctx, 'glow', C.amber, x, y - r * 1.15, 9 * U, 0.55, true);
    J.disc(ctx, x, y - r * 1.15, 2.4 * U, C.gold);
    J.disc(ctx, x - 0.6 * U, y - r * 1.3, 0.9 * U, C.silver050, 0.9);
    ctx.strokeStyle = rgb(C.silver300, 0.4); ctx.lineWidth = Math.max(1, 0.9 * U);
    ctx.beginPath(); ctx.ellipse(x, wl, r * 1.5, r * 0.32, 0, 0, TAU); ctx.stroke();
    ctx.restore();
  };

  const drawFish = (ctx, x, y, ang, U, a, stretch) => {
    J.sprite(ctx, 'soft', C.amber, x, y, 22 * U, 0.45 * a, true);
    const L = 44 * U, h = A.Art?.has(FISH) ? L / A.Art.aspect(FISH) : L * 0.33;
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang); ctx.scale(stretch, 1 / Math.sqrt(stretch));
    if (!A.Art?.has(FISH) || !A.Art.draw(ctx, FISH, -L * 0.42, -h / 2, L, h, 1, 1, a)) {
      ctx.globalAlpha *= a;
      ctx.fillStyle = rgb(C.amber, 0.95);
      ctx.beginPath(); ctx.ellipse(-L * 0.1, 0, L * 0.3, h * 0.42, 0, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.moveTo(L * 0.14, 0); ctx.lineTo(L * 0.36, -h * 0.42); ctx.lineTo(L * 0.32, 0); ctx.lineTo(L * 0.36, h * 0.42); ctx.closePath(); ctx.fill();
      ctx.fillStyle = rgb(C.gold, 0.9); ctx.beginPath(); ctx.ellipse(-L * 0.16, -h * 0.08, L * 0.16, h * 0.2, 0, 0, TAU); ctx.fill();
    }
    ctx.restore();
    J.sprite(ctx, 'glow', C.glow, x - 6 * U * Math.cos(ang), y, 7 * U, 0.7 * a, true);
  };

  const drawSplash = (ctx, g, t, rm) => {
    if (t < 0 || t > 0.42) return;
    const U = g.U;
    const sq = rm ? 1 : 1 + 0.6 * E.outSoft(clamp(t / 0.25, 0, 1));
    const ga = rm ? 1 - t / 0.42 : 1 - clamp(t / 0.25, 0, 1);
    const [sx, sy] = J.squash(t, 0.85, 0.25);
    img(ctx, BITE, g.x, g.y, g.S * 0.09 * sq, ga, sx, sy);
    J.sprite(ctx, 'glow', C.silver050, g.x, g.y, g.S * 0.05, 0.9 * ga, true);
    if (rm) return;
    if (t > 0.28) return;
    const f = t < 0.1 ? 1 : 2, fa = t < 0.16 ? 1 : 1 - (t - 0.16) / 0.12;
    if (A.Art?.has(SPLASH)) {
      const fw = g.S * 0.26, fh = fw / (A.Art.aspect(SPLASH) / 4), y0 = g.y - fh * 0.82;
      ctx.save(); ctx.beginPath(); ctx.rect(g.x - fw / 2, y0, fw, fh); ctx.clip();
      ctx.globalCompositeOperation = 'lighter';
      A.Art.draw(ctx, SPLASH, g.x - fw / 2 - f * fw, y0, fw * 4, fh, 1, 1, 0.75 * fa);
      ctx.restore();
    } else {
      const k = E.outSoft(clamp(t / 0.2, 0, 1));
      ctx.strokeStyle = rgb(C.silver100, 0.7 * fa); ctx.lineWidth = 2 * U; ctx.lineCap = 'round';
      ctx.beginPath();
      for (let i = 0; i < 7; i++) { const dx = (i - 3) * 6 * U; ctx.moveTo(g.x + dx * 0.8, g.y); ctx.lineTo(g.x + dx * (1 + 0.6 * k), g.y - (14 + 10 * (1 - Math.abs(i - 3) / 3)) * U * k); }
      ctx.stroke();
    }
  };

  const drawBeads = (ctx, B, g, at, slots, gather) => {
    const U = g.U, cx = g.lx, cy = g.ly - 1 * U;
    for (let i = 0; i < 5; i++) {
      const ang = Math.PI * (1.08 + 0.84 * (i + 0.5) / 5), r = 15 * U * (1 - gather);
      const x = cx + Math.cos(ang) * r, y = cy + Math.sin(ang) * r;
      const b = B.beads.find(q => q.i === i);
      if (!b) { if (gather < 1) J.ring(ctx, x, y, 2 * U, C.silver300, 0.35 * slots * (1 - gather), Math.max(1, 0.8 * U)); continue; }
      const p = clamp((at - b.t) / (b.pop ? 0.32 : 0.45), 0, 1), k = b.pop && !J.rm() ? E.outBack(p, 2.2) : p, a = 1 - gather;
      J.sprite(ctx, 'glow', C.amber, x, y, 10 * U * Math.max(0.3, k), 0.8 * a * Math.min(1, k), true);
      J.disc(ctx, x, y, 2.7 * U * Math.max(0, k), mixc(C.gold, C.silver050, 0.3), a);
    }
  };

  const drawGhost = (ctx, B, g, at) => {
    if (B.ghostA <= 0.01) return;
    // On the float itself (or the bite spot while it is under), the thing the tap answers.
    const U = g.U, [x, y] = floatPos(B, g, at, J.rm()) || [g.x, g.y], p = (at - B.ghostPress) / 0.32;
    const press = p >= 0 && p < 1 && !J.rm() ? Math.sin(Math.PI * p) : 0;
    if (press > 0) J.sprite(ctx, 'glow', C.flame, x, y, 22 * U, 0.5 * press * B.ghostA / 0.62, true);
    J.touch(ctx, x, y, U, B.ghostA, press);
  };

  const drawPayoff = (ctx, B, g, at, rm) => {
    const pt = at - B.payAt;
    if (pt < 0.12 || pt > 1.3) return;
    const [hx, hy] = lighthouse(g), rise = clamp((pt - 0.12) / 0.32, 0, 1), fall = 1 - clamp((pt - 0.65) / 0.6, 0, 1);
    const a = E.outSoft(rise) * E.inOut(fall), dx = hx - g.lx, dy = hy - g.ly, len = Math.hypot(dx, dy), ang = Math.atan2(dy, dx);
    ctx.save();
    ctx.translate(g.lx, g.ly); ctx.rotate(ang);
    ctx.globalCompositeOperation = 'lighter';
    const grd = ctx.createLinearGradient(0, 0, len, 0);
    grd.addColorStop(0, rgb(C.glow, 0.3 * a)); grd.addColorStop(0.6, rgb(C.glow, 0.12 * a)); grd.addColorStop(1, rgb(C.glow, 0.05 * a));
    ctx.fillStyle = grd;
    const reach = rm ? len : len * E.outSoft(clamp((pt - 0.12) / 0.33, 0, 1)), w0 = 4 * g.U, w1 = 26 * g.U * (reach / len);
    for (const [k, al] of [[1.8, 0.35], [1, 0.6], [0.45, 1]]) {
      ctx.globalAlpha = al;
      ctx.beginPath(); ctx.moveTo(0, -w0 * k); ctx.lineTo(reach, -w1 * k); ctx.lineTo(reach, w1 * k); ctx.lineTo(0, w0 * k); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
    if (!rm && pt < 0.48) {
      const u = E.inOut(clamp((pt - 0.12) / 0.33, 0, 1));
      J.sprite(ctx, 'glow', C.glow, lerp(g.lx, hx, u), lerp(g.ly, hy, u), 12 * g.U, 0.9, true);
    }
  };

  A.definePresenter('reaction', {
    stimulus: 'bite/1',
    leadIn: 1.2,
    outro: 1.65,
    tapTime(d) {
      const s = A.session;
      if (s && s.phase === 'rt') touch(s, d);
      return d?.ts ?? d?.t ?? A.now();
    },
    update(s, now, dt) {
      const B = state(s);
      sync(s, B, now);
      s.V.tapHint = ema(s.V.tapHint || 0, 0, dt, 0.15);
    },
    onset(s, tr, now) { state(s).fl = { m: 'bite', t: J.at }; },
    early(s, tr, at, ignored) {
      if (ignored) return;
      const B = state(s), g = geo();
      B.dip = J.at; B.twitch = J.at;
      ripple(B, g.x, g.y, 6 * g.U, 24 * g.U, 0.5, 0.35);
      J.hap('tick'); J.sfx('bite_tap_water');
    },
    resolve(s, trial, now) {
      const B = state(s), tr = s.core.trial, g = geo(), at = J.at;
      if (trial.outcome === 'miss') {
        B.fl = { m: 'sink', t: at }; B.yank = at;
        B.fish.push({ t: at + (J.rm() ? 0.1 : 0), kind: 'swim', x0: g.x, y0: g.y, dur: J.rm() ? 0.4 : 0.8, bead: trial.trial });
        B.touched = false;
        return;
      }
      if (tr && tr.onset !== null) { catchFish(s, B); return; }
      B.fl = { m: 'reel', t: at + 0.05 };
      B.beads.push({ i: trial.trial - 1, t: at + 0.3, pop: false });
    },
    done(s, now) {
      const B = state(s), at = J.at;
      B.doneAt = at;
      if (B.fl.m === 'bite') B.fl = { m: 'sink', t: at };
      else if (B.fl.m === 'water' || B.fl.m === 'cast') B.fl = { m: 'reel', t: at };
      const land = B.fish.reduce((m, f) => Math.max(m, f.t + f.dur), at);
      B.payAt = Math.max(at, land - 0.08);
      this.outro = clamp(B.payAt - at + 1.25, 1.2, 2.2);
    },
    draw(ctx, s, at) {
      const B = s.bite;
      if (!B) return;
      if (s.phase === 'rt') sync(s, B, A.now());
      const g = geo(), rm = J.rm(), U = g.U;
      tick(s, B, g);
      const pt = B.payAt == null ? -1 : at - B.payAt;
      const plate = clamp((at - B.t0) / 0.4, 0, 1) * (pt < 0 ? 1 : 1 - clamp((pt - 0.4) / 0.5, 0, 1));
      img(ctx, PLATE, g.x, g.y, g.S * 0.15, plate, 1.3, 0.92);

      for (const r of B.rip) {
        const p = clamp((at - r.t) / r.dur, 0, 1);
        if (p <= 0) continue;
        const rr = rm ? r.r1 * 0.7 : lerp(r.r0, r.r1, E.outSoft(p));
        ctx.strokeStyle = rgb(C.silver200, r.a * (1 - p) * (rm ? Math.sin(Math.PI * p) : 1)); ctx.lineWidth = Math.max(1, 1.1 * U);
        ctx.beginPath(); ctx.ellipse(r.x, r.y + 2 * U, rr, rr * 0.3, 0, 0, TAU); ctx.stroke();
      }

      drawLine(ctx, B, g, at, rm);
      const fp = floatPos(B, g, at, rm);
      if (fp) {
        const t = at - B.fl.t;
        const a = B.fl.m === 'cast' && rm ? clamp(t / 0.25, 0, 1) : B.fl.m === 'reel' ? 1 - clamp((t - 0.15) / 0.15, 0, 1) * (rm ? 1 : 0.7) : 1;
        drawFloat(ctx, fp[0], fp[1], U, a * plate);
      }
      if (B.fl.m === 'bite') img(ctx, BITE, g.x, g.y, g.S * 0.09);
      if (B.fl.m === 'sink') {
        const p = clamp((at - B.fl.t) / 0.45, 0, 1);
        img(ctx, BITE, g.x, g.y + (rm ? 0 : 7 * U * E.inOut(p)), g.S * 0.09 * (1 - 0.3 * p), 1 - E.outSoft(p), 1, rm ? 1 : 1 - 0.4 * p);
      }
      drawSplash(ctx, g, at - B.hit, rm);

      for (const f of B.fish) {
        const p = (at - f.t) / f.dur;
        if (p < 0 || p >= 1) continue;
        if (rm) { if (f.kind === 'catch') J.sprite(ctx, 'soft', C.glow, g.lx, g.ly, 16 * U, 0.5 * Math.sin(Math.PI * p), true); continue; }
        const [x, y] = fishPos(f, g, p), [x2, y2] = fishPos(f, g, Math.min(1, p + 0.02));
        const ang = Math.atan2(y2 - y, x2 - x) - Math.PI;
        const a = f.kind === 'catch' ? clamp(p * 8, 0, 1) * (1 - clamp((p - 0.9) / 0.1, 0, 1)) : 0.5 * clamp(p * 5, 0, 1) * (1 - clamp((p - 0.85) / 0.15, 0, 1));
        const stretch = f.kind === 'catch' ? 1 + 0.3 * Math.max(0, 1 - p * 5) + 0.25 * Math.max(0, (p - 0.75) * 4) : 1;
        drawFish(ctx, x, y, ang, U * (f.kind === 'catch' ? 1 : 0.8), a, stretch);
      }

      const slots = clamp((at - B.t0 - 1.6) / 0.4, 0, 1);
      const gather = pt < 0 ? 0 : E.inQuad(clamp(pt / 0.25, 0, 1));
      if (pt < 0.3) drawBeads(ctx, B, g, at, slots, gather);
      drawGhost(ctx, B, g, at);
      if (pt >= 0) drawPayoff(ctx, B, g, at, rm);
    },
  });
})();
