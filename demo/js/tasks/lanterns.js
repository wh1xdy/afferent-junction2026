(() => {
  const { clamp, lerp, rgb, mixc } = A;
  const J = A.J, { C, sprite, fx, hap, touch } = J, E = J.ease, rm = J.rm, R = Math.random;
  const AMBER = C.amber, SILVER = C.silver200, GOLD = C.gold, WHITE = C.silver050;
  const POST = mixc(C.wood, C.night800, 0.45), POST_L = mixc(C.woodL, C.night800, 0.35), POST_D = mixc(C.woodD, C.night950, 0.3);
  const METAL = mixc(C.silver700, C.night900, 0.35), ROPE = mixc(C.amberDeep, C.night800, 0.5), ROPE_HI = mixc(C.warm, C.night800, 0.35);
  const ART = 'task_lanterns_', KEY = 'afferent.lanterns.v1', INTRO = 0.4, SKY_SC = 0.2;
  const NODES = [[0.5, 0.085], [0.6, 0.125], [0.69, 0.08], [0.79, 0.115], [0.89, 0.06]];
  const art = n => A.Art?.has?.(ART + n);

  const memo = {
    get() { try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; } },
    set(v) { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch {} },
  };
  const needPractice = () => {
    const m = memo.get();
    return !m || !(Date.now() - m.last <= 7 * 864e5) || (m.unanswered ?? 0) >= 3;
  };

  const geo = b => {
    const U = b.h / 388, LH = 0.34 * b.h, HG = 0.7 * LH, pw = 0.055 * b.w;
    const kx = [b.x + 0.035 * b.w, b.x + 0.965 * b.w], ky = b.y + 0.13 * b.h;
    const hx = [b.x + 0.3 * b.w, b.x + 0.7 * b.w], gy = b.y + 0.47 * b.h;
    const cx = (kx[0] + kx[1]) / 2, hw = (kx[1] - kx[0]) / 2, f = 1 - ((hx[0] - cx) / hw) ** 2;
    return { b, U, LH, HG, pw, kx, ky, hx, gy, cx, hw, S: (gy - HG - ky) / f, wy: b.y + 0.9 * b.h };
  };
  const ropeY = (G, x, dip) => G.ky + (G.S + dip) * (1 - ((x - G.cx) / G.hw) ** 2);

  const tints = new Map();
  const tinted = c => {
    if (!art('lantern')) return null;
    const key = c.join();
    if (tints.has(key)) return tints.get(key);
    const h = 384, w = Math.round(h * A.Art.aspect(ART + 'lantern')), T = document.createElement('canvas');
    T.width = w; T.height = h;
    const x = T.getContext('2d');
    A.Art.draw(x, ART + 'lantern', 0, 0, w, h);
    x.globalCompositeOperation = 'multiply'; x.fillStyle = rgb(mixc(c, WHITE, 0.12)); x.fillRect(0, 0, w, h);
    x.globalCompositeOperation = 'destination-in'; A.Art.draw(x, ART + 'lantern', 0, 0, w, h);
    x.globalCompositeOperation = 'source-atop'; x.fillStyle = rgb(C.night900, 0.3); x.fillRect(0, 0, w, h);
    tints.set(key, T);
    return T;
  };

  const flick = (at, k = 0) => rm() ? 1 : 0.92 + 0.08 * Math.sin(at * 7.3 + k) * Math.sin(at * 2.9 + k * 2);

  const body = (ctx, G, c, bright) => {
    const { LH, HG } = G, T = tinted(c);
    if (T) { const w = LH * T.width / T.height; ctx.drawImage(T, -w / 2, -HG, w, LH); return; }
    const y0 = -HG, lw = Math.max(1.2, LH * 0.022);
    ctx.lineWidth = lw; ctx.strokeStyle = rgb(METAL); ctx.fillStyle = rgb(METAL);
    ctx.beginPath(); ctx.arc(0, y0 + LH * 0.05, LH * 0.035, 0, 6.283); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, y0 + LH * 0.34, LH * 0.15, Math.PI, 0); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-LH * 0.08, y0 + LH * 0.33); ctx.lineTo(LH * 0.08, y0 + LH * 0.33); ctx.lineTo(LH * 0.2, y0 + LH * 0.5); ctx.lineTo(-LH * 0.2, y0 + LH * 0.5); ctx.closePath(); ctx.fill();
    ctx.fillStyle = rgb(mixc(c, WHITE, 0.15), 0.18 + 0.45 * bright);
    ctx.beginPath(); ctx.roundRect(-LH * 0.165, y0 + LH * 0.5, LH * 0.33, LH * 0.38, LH * 0.05); ctx.fill(); ctx.stroke();
    ctx.fillStyle = rgb(METAL);
    ctx.beginPath(); ctx.roundRect(-LH * 0.19, y0 + LH * 0.87, LH * 0.38, LH * 0.08, LH * 0.025); ctx.fill();
  };

  const lantern = (ctx, G, x, y, o) => {
    const { LH, HG } = G, sc = o.sc ?? 1, sx = o.sx ?? 1, sy = o.sy ?? 1, a = o.a ?? 1, br = o.bright ?? 1, fk = o.flame ?? 1, c = o.c;
    if (a <= 0.01) return;
    ctx.save();
    ctx.globalAlpha *= a;
    ctx.translate(x, y);
    if (o.rot) { if (o.hang) { ctx.translate(0, -HG * sc); ctx.rotate(o.rot); ctx.translate(0, HG * sc); } else ctx.rotate(o.rot); }
    ctx.scale(sc * sx, sc * sy);
    const fl = flick(o.at, o.seed ?? 0);
    sprite(ctx, 'glow', c, 0, 0, LH * 0.78, 0.3 * br * fl * Math.min(1.6, fk), true);
    body(ctx, G, c, br);
    sprite(ctx, 'soft', c, 0, LH * 0.01, LH * 0.3, 0.5 * br * fl, true, 0.6, 0.72);
    sprite(ctx, 'soft', mixc(c, WHITE, 0.35), 0, 0, LH * 0.2, 0.85 * br * fl, true);
    const fh = LH * 0.15 * fl * fk, fw = fh * 0.48;
    if (art('flame')) A.Art.draw(ctx, ART + 'flame', -fw / 2, LH * 0.09 - fh, fw, fh, 1, 1, Math.min(1, 0.5 + 0.5 * br));
    else { ctx.fillStyle = rgb(mixc(c, WHITE, 0.7), 0.9 * br); ctx.beginPath(); ctx.ellipse(0, LH * 0.09 - fh * 0.45, fw * 0.4, fh * 0.5, 0, 0, 6.283); ctx.fill(); }
    sprite(ctx, 'glow', C.flame, 0, LH * 0.09 - fh * 0.4, LH * 0.09 * fk, 0.9 * br, true);
    ctx.restore();
  };

  const pairState = (g, pre = false) => {
    const L = g.L, P = L.prac;
    if (P && !P.done) {
      if (L.rt < INTRO) return null;
      const t = L.rt - INTRO, resp = pre ? null : P.resp, phase = resp ? 'fb' : t < 0.32 ? 'ready' : 'cue';
      return { t, phase, ft: resp ? L.rt - P.respRt : 0, resp, rich: P.rich, big: P.big, scale: 1.3, cueOn: phase === 'cue', sized: phase !== 'fb', cueT: 0.32, practice: true };
    }
    const tr = g.tr;
    if (!tr) return null;
    const big = tr.L === 'rich' ? tr.richSide : tr.richSide === 'left' ? 'right' : 'left';
    const phase = pre && tr.phase === 'fb' ? 'cue' : tr.phase, t = pre && tr.phase === 'fb' ? tr.fbT : tr.t;
    const cueT = tr.cueT ?? 0.32, cueOn = phase === 'cue' && t - cueT < 0.4;
    return { t, phase, ft: phase === 'fb' ? tr.t - tr.fbT : 0, resp: pre ? null : tr.resp, rich: tr.richSide, big, scale: 1.08, cueOn, sized: cueOn, cueT };
  };

  const dipOf = (g, G, ps, at) => {
    if (rm() || !ps) return 0;
    const L = g.L, U = G.U;
    let d = 0;
    if (ps.phase === 'ready') d += 6 * U * E.inOut(clamp(ps.t / 0.2, 0, 1));
    else if (ps.phase === 'cue') d += 6 * U;
    else d += 3 * U * (ps.resp ? 1 - E.outSoft(clamp(ps.ft / 0.4, 0, 1)) : 2 * (1 - E.outSoft(clamp(ps.ft / 0.4, 0, 1))));
    if (ps.t >= 0.2) { const tau = ps.t - 0.2; d += 5 * U * Math.exp(-9 * tau) * Math.sin(20 * tau); }
    if (L.recoilAt != null) { const tau = at - L.recoilAt; if (tau < 1.2) d -= 6 * U * Math.exp(-5 * tau) * Math.sin(15 * tau); }
    return d;
  };

  const skyPos = (s, at) => {
    const age = at - s.born;
    if (rm()) {
      if (age < 0.3) { const p = age / 0.3; return { x: s.x0, y: s.y0 - 40 * p, sc: s.sc0, a: 1 - p, p: 0, age }; }
      return { x: s.tx, y: s.ty, sc: SKY_SC, a: clamp((age - 0.3) / 0.3, 0, 1), p: 1, age };
    }
    const p = E.outSoft(clamp(age / 1.2, 0, 1)), drift = Math.max(0, age - 1.2);
    const sway = Math.sin(age * 2.1 + s.seed) * 7 * Math.min(1, age * 2) * (1 - 0.7 * p);
    return { x: lerp(s.x0, s.tx, p) + sway + s.dir * 2.5 * drift, y: lerp(s.y0, s.ty, p) + Math.sin(at * 0.7 + s.seed) * 2 * p, sc: lerp(s.sc0, SKY_SC, p), a: 1, p, age };
  };

  const getB = g => g.L.b || A.session?.box?.() || { x: 27, y: 101, w: 335, h: 388 };

  const release = (g, side, rewarded, at) => {
    const L = g.L, G = geo(getB(g)), ps = pairState(g, true), i = side === 'left' ? 0 : 1, dir = i ? 1 : -1;
    const shown = ps && pairLayout(g, G, ps, at, dipOf(g, G, ps, at)).find(l => l.side === side);
    const c = (ps?.rich ?? 'left') === side ? AMBER : SILVER, x0 = shown?.x ?? G.hx[i], y0 = shown?.y ?? ropeY(G, x0, 0) + G.HG, sc0 = shown?.sc ?? 1;
    const { W, H } = J.size();
    const tx = rewarded ? clamp(G.hx[i] + dir * 0.05 * W, 0.4 * W, 0.6 * W) : clamp(G.hx[i] + dir * (0.04 + 0.14 * R()) * W, 0.08 * W, 0.92 * W), ty = (rewarded ? 0.1 : 0.06 + 0.1 * R()) * H;
    L.sky.push({ x0, y0, sc0, tx, ty, born: at, c, rewarded, seed: R() * 6.283, dir, fever: null });
    const live = L.sky.filter(s => s.fadeAt == null);
    if (live.length > 6) live[0].fadeAt = at;
    L.recoilAt = at;
    if (!rm()) fx.rise(x0, y0 - G.HG * sc0, 6, C.glow, { life: 0.8 });
    hap('touch');
    J.sfx('lantern_release', { piano: [2, 0.06] });
  };

  const fever = (g, s, at) => {
    const L = g.L, { W, H } = J.size(), b = getB(g), cy = Math.min(s.ty, b.y + 0.02 * b.h), cx = s.tx;
    s.fever = at;
    J.slowmo(g, 0.4, 250);
    const r = Math.min(0.3 * W, b.y + 0.3 * b.h - cy - 4);
    const bl = J.bloom(cx, cy, r, GOLD, 0.42, rm() ? 0.5 : 0.22, rm() ? 0.3 : 0.6);
    if (!rm()) {
      L.rings.push({ x: cx, y: cy, r, born: at, peak: Math.min(0.75, (bl?.a ?? 0.3) * 1.8), rot: R() * 6.283 });
      for (let k = 0; k < 24; k++) {
        const a = R() * 6.283, sp = 40 + 70 * R();
        fx.add({ x: cx + Math.cos(a) * 10, y: cy + Math.sin(a) * 8, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.55 - 10, g: 14, drag: 2.6, life: 1.4 + 0.8 * R(), size: k % 3 ? [3.2, 1.4] : [5, 2], kind: k % 3 ? 'mote' : 'spark', c: k % 2 ? GOLD : C.glow, sway: [12, 1.4], alpha: q => Math.min(1, q * 10) * (1 - q * q) });
      }
      L.ripple = { t0: at + 0.35, ok: null };
    }
    L.stars.push({ x: clamp(cx + s.dir * (18 + 16 * R()), 0.06 * W, 0.94 * W), y: clamp(cy - 22 - 18 * R(), 0.03 * H, b.y + 0.15 * b.h), born: at });
    hap.seq([['tick', 0], ['tick', 100], ['success', 220]]);
    J.sfx('lantern_reward', { piano: [8, 0.16] });
    A.session?.kick?.(0.6);
  };

  const payoff = (g, at) => {
    const L = g.L, live = L.sky.filter(s => s.fadeAt == null), objs = [...live.map(s => ({ s })), ...L.stars.map(st => ({ st }))];
    objs.forEach(o => { o.x = o.s ? skyPos(o.s, at).x : o.st.x; });
    objs.sort((p, q) => p.x - q.x).forEach((o, i, all) => { (o.s || o.st).node = Math.round(i * (NODES.length - 1) / Math.max(1, all.length - 1)); });
    L.payoff = at;
    J.spill(0.4);
    hap.seq([['tick', 250], ['tick', 380], ['tick', 510], ['complete', 640]]);
    J.sfx('lanterns_constellation');
  };

  const step = g => {
    const L = g.L, at = J.at, b = getB(g);
    for (const s of L.sky) if (s.rewarded && s.fever == null && (rm() ? at - s.born > 0.15 : skyPos(s, at).y < b.y + 0.3 * b.h)) fever(g, s, at);
    if (L.ripple && L.ripple.ok === null && at >= L.ripple.t0) L.ripple.ok = J.flash.request(0.12, 0.09).ok;
    L.sky = L.sky.filter(s => s.fadeAt == null || at - s.fadeAt < 0.8);
    L.rings = L.rings.filter(r => at - r.born < 0.9);
    if (g.done && L.payoff == null) payoff(g, at);
    if (L.payoff != null && !L.marked && at - L.payoff > 0.45) {
      L.marked = true;
      const add = A.World?.hooks?.addSkyMark;
      if (add) for (const [x, y] of NODES) add('star', x, y);
    }
  };

  const practiceStep = (g, at) => {
    const L = g.L, P = L.prac, t = L.rt - INTRO;
    if (!P.resp && t >= 1.3) { P.ghost = true; practiceTap(g, P.big, at); }
    if (P.resp && L.rt - P.respRt >= 0.55) P.done = true;
  };
  const practiceTap = (g, side, at) => {
    const L = g.L, P = L.prac;
    if (P.resp || L.rt - INTRO < 0.2) return;
    if (side !== P.big) { P.wrong = { side, at }; hap('miss', 0.8); return; }
    P.resp = side; P.respRt = L.rt;
    release(g, side, false, at);
  };

  const wrap = g => {
    const L = g.L, upd = g.update, down = g.down;
    g.update = function (dt, now) {
      L.rt += dt;
      if (L.rt < INTRO || (L.prac && !L.prac.done)) { if (L.prac && L.rt >= INTRO) practiceStep(g, J.at); step(g); return; }
      upd.call(this, dt, now);
      step(g);
    };
    g.outroUpdate = () => step(g);
    g.down = function (u, v, t, d) {
      if (L.rt < INTRO) return;
      if (L.prac && !L.prac.done) { if (v >= 0.12 && v <= 0.86) practiceTap(g, u < 0.5 ? 'left' : 'right', J.at); return; }
      return down.call(this, u, v, t, d);
    };
  };

  const drawScene = (ctx, G, at, dip) => {
    const { b, U, kx, ky, pw, wy } = G, top = ky - 0.11 * b.h, bot = b.y + 1.08 * b.h, pb = wy + 10 * U;
    if (!A.Traverse) sprite(ctx, 'soft', C.night950, b.x + b.w / 2, b.y + 0.5 * b.h, 0.78 * b.h, 0.6, false, 1.05, 1);
    const wg = ctx.createLinearGradient(0, wy - 6 * U, 0, bot + 8 * U);
    wg.addColorStop(0, rgb(C.night800, 0)); wg.addColorStop(0.2, rgb(C.night800, 0.72)); wg.addColorStop(0.6, rgb(C.night900, 0.6)); wg.addColorStop(1, rgb(C.night950, 0));
    ctx.fillStyle = wg; ctx.fillRect(b.x - 0.1 * b.w, wy - 6 * U, b.w * 1.2, bot - wy + 14 * U);
    ctx.lineWidth = U; ctx.lineCap = 'round';
    for (let k = 0; k < 4; k++) {
      const y = wy + (6 + 9 * k) * U, sh = rm() ? 0 : Math.sin(at * 0.6 + k * 1.7) * 14 * U;
      ctx.strokeStyle = rgb(C.silver300, 0.07 - 0.012 * k);
      ctx.beginPath(); ctx.moveTo(b.x + (0.12 + 0.1 * k) * b.w + sh, y); ctx.lineTo(b.x + (0.45 + 0.06 * k) * b.w + sh, y); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(b.x + (0.58 - 0.05 * k) * b.w - sh, y + 4 * U); ctx.lineTo(b.x + (0.86 - 0.08 * k) * b.w - sh, y + 4 * U); ctx.stroke();
    }
    for (let i = 0; i < 2; i++) {
      const x = kx[i] + (i ? 0.5 : -0.5) * pw * 0.2, x0 = x - pw / 2;
      const pg = ctx.createLinearGradient(x0, 0, x0 + pw, 0);
      pg.addColorStop(0, rgb(i ? POST_D : POST_L)); pg.addColorStop(0.5, rgb(POST)); pg.addColorStop(1, rgb(i ? POST_L : POST_D));
      ctx.fillStyle = pg;
      ctx.beginPath(); ctx.roundRect(x0, top, pw, pb - top, [pw * 0.35, pw * 0.35, pw * 0.1, pw * 0.1]); ctx.fill();
      sprite(ctx, 'soft', C.amber, x - (i ? 1 : -1) * pw * 0.45, ky + 0.12 * b.h, 0.16 * b.h, 0.1, true, 0.25, 1);
      ctx.strokeStyle = rgb(C.woodD, 0.55); ctx.lineWidth = Math.max(1, 0.8 * U);
      for (const f of [0.3, 0.62]) { ctx.beginPath(); ctx.moveTo(x0 + pw * f, top + 0.18 * b.h); ctx.lineTo(x0 + pw * f, pb - 0.12 * b.h); ctx.stroke(); }
      ctx.fillStyle = rgb(C.silver100, 0.82);
      ctx.beginPath(); ctx.ellipse(x, top + 2 * U, pw * 0.62, pw * 0.3, 0, Math.PI, 0); ctx.roundRect(x - pw * 0.62, top + 1 * U, pw * 1.24, 5 * U, 3 * U); ctx.fill();
      ctx.fillStyle = rgb(C.silver050, 0.5);
      ctx.beginPath(); ctx.ellipse(x - pw * 0.15, top - 2 * U, pw * 0.25, pw * 0.1, 0, 0, 6.283); ctx.fill();
      sprite(ctx, 'soft', POST_D, x, pb + 12 * U, pw * 0.9, 0.35, false, 0.5, 1.4);
      ctx.strokeStyle = rgb(ROPE); ctx.lineWidth = 3.2 * U;
      for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.moveTo(x0 - 1.5 * U, ky - 5 * U + k * 3.6 * U); ctx.lineTo(x0 + pw + 1.5 * U, ky - 3 * U + k * 3.6 * U); ctx.stroke(); }
    }
    const ix = [kx[0] + pw * 0.4, kx[1] - pw * 0.4], cy = 2 * ropeY(G, G.cx, dip) - ropeY(G, ix[0], dip);
    ctx.strokeStyle = rgb(ROPE); ctx.lineWidth = 3 * U;
    ctx.beginPath(); ctx.moveTo(ix[0], ropeY(G, ix[0], dip)); ctx.quadraticCurveTo(G.cx, cy, ix[1], ropeY(G, ix[1], dip)); ctx.stroke();
    ctx.save(); ctx.setLineDash([2.2 * U, 3.4 * U]); ctx.strokeStyle = rgb(ROPE_HI, 0.55); ctx.lineWidth = 1.3 * U;
    ctx.beginPath(); ctx.moveTo(ix[0], ropeY(G, ix[0], dip) - 0.6 * U); ctx.quadraticCurveTo(G.cx, cy - 0.6 * U, ix[1], ropeY(G, ix[1], dip) - 0.6 * U); ctx.stroke();
    ctx.restore();
  };

  const pairLayout = (g, G, ps, at, dip) => {
    const P = g.L.prac, out = [];
    for (let i = 0; i < 2; i++) {
      const side = i ? 'right' : 'left', dir = i ? 1 : -1;
      if (ps.phase === 'fb' && ps.resp === side) continue;
      const c = ps.rich === side ? AMBER : SILVER, knot = G.kx[i] - dir * G.pw * 0.4;
      let x = G.hx[i], a = 1, rot = 0, sx = 1, sy = 1, lift = 0;
      if (ps.phase === 'ready') {
        const p = clamp(ps.t / 0.2, 0, 1);
        if (rm()) a = clamp(ps.t / 0.2, 0, 1);
        else {
          x = lerp(knot, G.hx[i], E.inOut(p)); a = clamp(ps.t / 0.06, 0, 1);
          rot = -dir * 0.1 * Math.sin(Math.PI * p);
          if (ps.t >= 0.2) { [sx, sy] = J.squash(ps.t - 0.2, 0.94, 0.12); }
        }
      }
      if (!rm() && ps.t >= 0.2 && ps.phase !== 'fb') { const tau = ps.t - 0.2; rot += dir * 0.14 * Math.exp(-8 * tau) * Math.cos(12 * tau); }
      if (!rm() && ps.phase !== 'ready') rot += 0.018 * Math.sin(at * 1.3);
      if (ps.phase === 'fb') {
        const p = E.outSoft(clamp(ps.ft / (ps.resp ? 0.3 : 0.4), 0, 1));
        if (rm() || ps.resp) a = 1 - p;
        else { x = lerp(G.hx[i], knot, p); lift = 46 * G.U * p; a = 1 - clamp((p - 0.35) / 0.65, 0, 1); }
      }
      if (ps.practice && P?.wrong?.side === side) { const [dx, m] = J.wobble(at - P.wrong.at); x += dx; a *= m; }
      const sc = ps.sized && ps.big === side ? ps.scale : 1;
      const y = ropeY(G, x, dip) + G.HG * (ps.practice ? sc : 1) - lift;
      out.push({ side, c, x, y, sc, sx, sy, a, rot });
    }
    return out;
  };

  const drawPair = (ctx, g, G, ps, at, dip) => {
    if (!ps) return;
    const settle = ps.cueOn ? 1 : ps.phase === 'cue' ? lerp(1, 0.78, E.outSoft(clamp((ps.t - ps.cueT - 0.4) / 0.15, 0, 1))) : 0.45;
    for (const { c, x, y, sc, sx, sy, a, rot } of pairLayout(g, G, ps, at, dip)) {
      lantern(ctx, G, x, y, { c, sc, sx, sy, a, rot, hang: true, bright: settle, at, seed: 1.3 });
      sprite(ctx, 'soft', c, x, G.wy + 14 * G.U, 0.1 * G.b.h, 0.2 * settle * a, true, 0.22, 1);
    }
  };

  const drawSky = (ctx, g, G, at) => {
    const L = g.L, U = G.U, pay = L.payoff != null ? at - L.payoff : -1, q = pay < 0 ? 0 : (rm() ? clamp(pay / 0.5, 0, 1) : E.inOut(clamp(pay / 0.5, 0, 1)));
    const { W, H } = J.size();
    for (const s of L.sky) {
      const P = skyPos(s, at), fade = s.fadeAt == null ? 1 : 1 - clamp((at - s.fadeAt) / 0.8, 0, 1);
      let { x, y, sc } = P, a = P.a * fade;
      const fk = s.fever != null ? 1 + E.outSoft(clamp((at - s.fever) / 0.25, 0, 1)) : 1;
      const dim = s.rewarded ? 1 : lerp(1, 0.6, P.p);
      if (pay >= 0 && s.node != null && s.fadeAt == null) {
        const [nx, ny] = NODES[s.node];
        if (!rm()) { x = lerp(x, nx * W, q); y = lerp(y, ny * H, q); sc *= 1 - 0.5 * q; }
        a *= 1 - q;
      }
      if (a <= 0.01) continue;
      if (!rm() && P.age < 0.5) sprite(ctx, 'soft', C.flame, x, y + G.LH * 0.35 * sc, G.LH * 0.4 * sc, 0.45 * (1 - P.age / 0.5) * a, true, 0.18, 1);
      if (sc > 0.32) {
        let sx = 1, sy = 1;
        if (!rm() && P.age < 0.06) { sx = 1.06; sy = 0.9; }
        else if (!rm() && P.age < 0.22) { sy = 1 + 0.12 * Math.sin(Math.PI * (P.age - 0.06) / 0.16); sx = 1 / Math.sqrt(sy); }
        const rot = rm() ? 0 : Math.sin(P.age * 2.1 + s.seed + 1.2) * 0.07 * (1 - P.p);
        lantern(ctx, G, x, y, { c: s.c, sc, sx, sy, a, rot, bright: dim, flame: fk, at, seed: 1.3 });
      } else {
        const tw = rm() ? 1 : 0.85 + 0.15 * Math.sin(at * 1.7 + s.seed);
        const k = Math.max(sc / SKY_SC, 0.5);
        sprite(ctx, 'glow', s.c, x, y, (22 + 12 * (fk - 1)) * U * k, 0.45 * a * dim * tw, true);
        sprite(ctx, 'soft', mixc(s.c, WHITE, 0.3), x, y, 7 * U * k, 0.8 * a * dim, true, 0.7, 1);
        sprite(ctx, 'mote', mixc(s.c, WHITE, 0.6), x, y + U, (4.5 + 2 * (fk - 1)) * U, 0.95 * a * Math.max(dim, 0.75), true);
      }
    }
    for (const r of L.rings) drawFever(ctx, r, at, U);
    if (L.ripple?.ok) {
      const t = at - L.ripple.t0;
      if (t >= 0 && t < 1.3) {
        const front = -0.2 + 1.4 * t / 1.2;
        for (let k = 0; k < 18; k++) {
          const u = (k + 0.5) / 18, w = Math.exp(-(((u - front) / 0.13) ** 2));
          if (w < 0.03) continue;
          const yy = H * (0.1 + 0.025 * Math.sin(u * 7 + t * 2));
          sprite(ctx, 'soft', k % 3 ? C.green : C.teal, u * W, yy, 0.075 * H, 0.1 * w, true, 0.35, 1);
        }
      }
    }
    for (const st of L.stars) {
      const t = at - st.born, f = rm() ? clamp(t / 0.8, 0, 1) : E.outBack(clamp(t / 0.5, 0, 1)), tw = rm() ? 1 : 0.88 + 0.12 * Math.sin(at * 1.4 + st.x);
      let { x, y } = st, a = clamp(t / 0.3, 0, 1) * tw;
      if (pay >= 0 && st.node != null) { const [nx, ny] = NODES[st.node]; if (!rm()) { x = lerp(x, nx * W, q); y = lerp(y, ny * H, q); } a *= 1 - q; }
      if (a <= 0.01) continue;
      const r = 11 * U * f;
      sprite(ctx, 'glow', C.amber, x, y, 2.6 * r, 0.35 * a, true);
      sprite(ctx, 'spark', C.warm, x, y, r * 1.5, a, true);
      sprite(ctx, 'mote', C.sun, x, y, r * 0.45, a, true);
    }
    if (pay >= 0) drawConstellation(ctx, U, pay, W, H);
  };

  const lighter = (ctx, f) => { const op = ctx.globalCompositeOperation; ctx.globalCompositeOperation = 'lighter'; f(); ctx.globalCompositeOperation = op; };

  const drawFever = (ctx, r, at, U) => {
    const t = at - r.born, p = E.outSoft(clamp(t / 0.6, 0, 1)), fade = 1 - E.smooth(clamp(t / 0.85, 0, 1)), a = r.peak * fade;
    if (a <= 0.01) return;
    lighter(ctx, () => {
      const cr = r.r * (0.1 + 0.16 * p);
      sprite(ctx, 'soft', GOLD, r.x, r.y, r.r * (0.3 + 0.35 * p), 0.45 * a);
      if (art('sky_bloom')) A.Art.draw(ctx, ART + 'sky_bloom', r.x - cr, r.y - cr * 0.91, 2 * cr, 1.82 * cr, 1, 1, 0.7 * a);
      else sprite(ctx, 'soft', C.sun, r.x, r.y, cr, 0.7 * a);
      J.ring(ctx, r.x, r.y, r.r * (0.2 + 0.8 * p), C.glow, 0.75 * a * (1 - 0.5 * p), (2.6 - 2 * p) * U);
      J.ring(ctx, r.x, r.y, r.r * (0.1 + 0.55 * E.outSoft(clamp((t - 0.08) / 0.6, 0, 1))), GOLD, 0.4 * a, 1.2 * U);
      ctx.save(); ctx.translate(r.x, r.y); ctx.rotate(r.rot + t * 0.35);
      for (let k = 0; k < 8; k++) {
        const len = r.r * (k % 2 ? 0.5 : 0.85) * (0.45 + 0.55 * p);
        ctx.rotate(Math.PI / 4);
        sprite(ctx, 'streak', k % 2 ? C.glow : GOLD, len * 0.55, 0, len * 0.55, 0.5 * a, false, 1, 0.35);
      }
      ctx.restore();
    });
  };

  const drawConstellation = (ctx, U, t, W, H) => {
    const n = NODES.length, P = NODES.map(([x, y]) => [x * W, y * H]);
    const lit = i => rm() ? clamp((t - 0.2) / 0.4, 0, 1) : E.outBack(clamp((t - 0.2 - i * 0.09) / 0.22, 0, 1), 2.2);
    const swell = rm() ? 1 : 1 + 0.35 * Math.sin(Math.PI * clamp((t - 0.68) / 0.3, 0, 1));
    lighter(ctx, () => {
      ctx.lineCap = 'round';
      for (let i = 0; i < n - 1; i++) {
        const p = rm() ? lit(i) : E.inOut(clamp((t - 0.24 - i * 0.09) / 0.12, 0, 1));
        if (p <= 0) continue;
        const [x0, y0] = P[i], [x1, y1] = P[i + 1], ex = rm() ? 1 : p, hx = lerp(x0, x1, ex), hy = lerp(y0, y1, ex);
        ctx.strokeStyle = rgb(GOLD, 0.16 * (rm() ? p : 1)); ctx.lineWidth = 4 * U;
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(hx, hy); ctx.stroke();
        ctx.strokeStyle = rgb(C.sun, 0.55 * (rm() ? p : 1)); ctx.lineWidth = 1.1 * U;
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(hx, hy); ctx.stroke();
        if (!rm() && p < 1) sprite(ctx, 'glow', C.sun, hx, hy, 12 * U, 0.9, true);
      }
      for (let i = 0; i < n; i++) {
        const p = lit(i), [x, y] = P[i];
        if (p <= 0) continue;
        const rt = t - 0.2 - i * 0.09;
        if (!rm() && rt > 0 && rt < 0.45) J.ring(ctx, x, y, (4 + 14 * E.outSoft(rt / 0.45)) * U, C.glow, 0.45 * (1 - rt / 0.45), 1.2 * U);
        sprite(ctx, 'glow', GOLD, x, y, 24 * U * swell, 0.4 * Math.min(1, p), true);
        sprite(ctx, 'spark', C.sun, x, y, 12 * U * p * swell, 0.95 * Math.min(1, p), true);
        sprite(ctx, 'mote', WHITE, x, y, 3 * U, Math.min(1, p), true);
      }
    });
  };

  const drawGhost = (ctx, g, G, at) => {
    const L = g.L, P = L.prac;
    if (!P || P.done || L.rt < INTRO) return;
    const t = L.rt - INTRO, show = clamp((t - 0.7) / 0.2, 0, 1) * (P.resp && !P.ghost ? 0 : 1) * (P.resp ? 1 - clamp((L.rt - P.respRt) / 0.3, 0, 1) : 1);
    if (show <= 0) return;
    // On the bigger lantern where it hangs right now (it swings in and wobbles), not on a fixed point below it.
    const ps = pairState(g), l = ps && pairLayout(g, G, ps, at, dipOf(g, G, ps, at)).find(q => q.side === P.big);
    const x = l ? l.x : G.hx[P.big === 'left' ? 0 : 1], y = l ? l.y : G.gy, press = rm() ? 1 : E.inOut(clamp((t - 0.95) / 0.35, 0, 1));
    touch(ctx, x, y, G.U, show, press);
  };

  A.definePresenter('lanterns', {
    on(g, ev, d) {
      const at = J.at;
      if (ev === 'init') {
        g.bare = true; g.outro = 1.5;
        g.L = { rt: 0, sky: [], stars: [], rings: [], ripple: null, recoilAt: null, payoff: null, marked: false, b: null, prac: null, practiceShown: false };
        if (needPractice()) {
          g.L.prac = { big: R() < 0.5 ? 'left' : 'right', rich: g.richSide, resp: null, respRt: 0, wrong: null, ghost: false, done: false };
          g.L.practiceShown = true;
        }
        wrap(g);
        return;
      }
      if (ev === 'respond' && d.side != null) release(g, d.side, !!d.rewarded, at);
    },
    extra(g) {
      if (!A.session?.auto && g.trials) memo.set({ last: Date.now(), unanswered: g.trials.filter(t => t.response === null).length });
      return { presentation: 'release_v1', reduced_motion: rm(), practice_shown: !!g.L?.practiceShown };
    },
    pair(g, b, at) {
      const G = geo(b), ps = g.L && pairState(g);
      return ps ? pairLayout(g, G, ps, at, dipOf(g, G, ps, at)).filter(l => l.a > 0.01) : [];
    },
    draw(g, ctx, b, at) {
      if (!g.L) return;
      g.L.b = b;
      if (g.done) step(g);
      const G = geo(b), ps = pairState(g), dip = dipOf(g, G, ps, at);
      drawScene(ctx, G, at, dip);
      drawSky(ctx, g, G, at);
      drawPair(ctx, g, G, ps, at, dip);
      drawGhost(ctx, g, G, at);
    },
  });
})();
