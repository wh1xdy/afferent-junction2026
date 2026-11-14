(() => {
  const { clamp, lerp, rgb, mixc, median } = A;
  const J = A.J, { C, sprite, glow, ring, unit, dragCue, base, finish, fx, hap, sfx, beat, rm } = J;
  const E = J.ease, R = Math.random, ID = 'shutters', TAU = Math.PI * 2;
  const HOLD = 0.22, PITCH = 1.5, RESIST = 0.85;
  const rubber = (x, k) => Math.sign(x) * k * (1 - Math.exp(-Math.abs(x) / k));
  const bump = (t, up, down) => (t < 0 ? 0 : t < up ? E.outSoft(t / up) : 1 - E.inOut((t - up) / down));

  A.Skill?.define(ID, {
    tiers: [2, 4, 6],
    windows: { v0: 6, v1: 9, int: true, cat: 'load' },
    transition: { v0: 0.5, v1: 0.22, geo: true, cat: 'tempo' },
    perfect: { v0: 8, v1: 2, geo: true, cat: 'tempo' },
    commit: { v0: 0.35, v1: 0.5, cat: 'precision', wider: false },
    cue: { v0: 0, v1: 1, cat: 'precision', wider: false },
    mirror: { steps: [[0, 0], [0.8, 1]], cat: 'load' },
  });
  const ax = (name, fb) => (A.Skill ? A.Skill.axis(ID, name, fb) : fb);

  const canvas = (w, h, paint) => { const c = document.createElement('canvas'); c.width = w; c.height = h; paint(c.getContext('2d'), w, h); return c; };
  let LINEN = null, RAYS = null;
  const linen = () => LINEN || (LINEN = canvas(256, 320, (x, w, h) => {
    for (let i = 0; i < h; i += 2) { x.fillStyle = `rgba(0,0,0,${0.04 + 0.08 * R()})`; x.fillRect(0, i, w, 1); }
    for (let i = 0; i < w; i += 3) { x.fillStyle = `rgba(255,255,255,${0.03 + 0.05 * R()})`; x.fillRect(i, 0, 1, h); }
    for (let k = 0; k < 50; k++) { x.fillStyle = `rgba(0,0,0,${0.08 * R()})`; x.fillRect(R() * w, R() * h, 20 + R() * 70, 1); }
  }));
  const rays = () => RAYS || (RAYS = canvas(512, 512, (x, w) => {
    const S = w / 2;
    x.translate(S, S);
    for (let i = 0; i < 14; i++) {
      x.rotate(TAU / 14);
      const g = x.createLinearGradient(0, 0, S, 0);
      g.addColorStop(0, 'rgba(255,236,200,0.9)'); g.addColorStop(0.5, 'rgba(255,220,160,0.35)'); g.addColorStop(1, 'rgba(255,220,160,0)');
      x.fillStyle = g; x.beginPath(); x.moveTo(0, 0); x.lineTo(S, -S * (i % 2 ? 0.07 : 0.12)); x.lineTo(S, S * (i % 2 ? 0.07 : 0.12)); x.closePath(); x.fill();
    }
  }));

  const lay = (b, m) => {
    const U = unit(b), pair = m === 'pair';
    const ow = b.w * (pair ? 0.56 : 0.7), oh = b.h * (pair ? 0.5 : 0.5);
    const ox = b.x + (b.w - ow) / 2, oy = b.y + b.h * (pair ? 0.19 : m === 'blind_up' ? 0.3 : 0.1);
    return { U, ox, oy, ow, oh, cx: ox + ow / 2, cy: oy + oh / 2, rest: oh * 0.8, travel: pair ? ow / 2 : oh * 0.55, ringX: ox + ow * 0.64, rr: 11 * U };
  };

  const plan = n => {
    const out = ['blind'];
    while (out.length < n - 1) for (const m of R() < 0.5 ? ['blind', 'pair'] : ['pair', 'blind']) if (out.length < n - 1) out.push(m);
    out.push('pair');
    return out.slice(-n);
  };
  const mkWin = (m, i) => ({ m, i, st: 'wait', arr: 0, tries: 0, wrongFirst: false, pull: 0, sep: 0, bx: 0, by: 0, sp: null, grabAt: -9, hintAt: -9, readyAt: -9, openAt: null, openT: null, auto: false, grade: null, from: 0, warm0: 0, warm: 0, seed: R() * 1000, frost: 0, wobAt: -9 });

  const TONE = [[0, [30, 42, 92]], [0.35, [92, 112, 178]], [0.7, [250, 206, 182]], [1, [255, 255, 255]]];
  const tone = w => { let i = 1; while (i < TONE.length - 1 && w > TONE[i][0]) i++; const [a, ca] = TONE[i - 1], [b, cb] = TONE[i]; return mixc(ca, cb, clamp((w - a) / (b - a), 0, 1)); };
  const VIEWS = new Map(), LAYER = {};
  const viewArt = (ow, oh, k) => {
    const w = Math.max(8, Math.round(ow * k)), h = Math.max(8, Math.round(oh * k)), key = w + 'x' + h;
    let v = VIEWS.get(key);
    if (v) return v;
    const asp = A.Art.aspect('task_shutters_dawn_view'), Wd = Math.max(w / 0.56, h * asp / 0.78), Hd = Wd / asp;
    const xi = -0.12 * Wd - (0.56 * Wd - w) / 2, yi = -0.08 * Hd - (0.78 * Hd - h) / 2;
    const c = canvas(w, h, x => A.Art.draw(x, 'task_shutters_dawn_view', xi, yi, Wd, Hd));
    v = { c, sx: (xi + 0.376 * Wd) / w, sy: (yi + 0.5 * Hd) / h };
    if (VIEWS.size > 6) VIEWS.clear();
    VIEWS.set(key, v);
    return v;
  };
  const FAC = new Map();
  const facadeArt = (span, Hd, Wd, k) => {
    const w = Math.round(span * k), h = Math.round(Hd * k), key = w + 'x' + h;
    let c = FAC.get(key);
    if (!c) { c = canvas(w, h, x => A.Art.draw(x, 'task_shutters_facade', 0, 0, Wd * k, h)); if (FAC.size > 4) FAC.clear(); FAC.set(key, c); }
    return c;
  };
  const view = (ctx, L, warm, at, final) => {
    const { ox, oy, ow, oh } = L;
    let sx, sy;
    const vc = A.Art?.has('task_shutters_dawn_view') && viewArt(ow, oh, ctx.getTransform().a || 1);
    if (vc) {
      ctx.drawImage(vc.c, ox, oy, ow, oh);
      sx = ox + vc.sx * ow; sy = oy + vc.sy * oh;
    } else {
      const hz = oy + oh * 0.6;
      const sk = ctx.createLinearGradient(0, oy, 0, hz);
      sk.addColorStop(0, rgb(C.sky)); sk.addColorStop(0.7, rgb(C.peach)); sk.addColorStop(1, rgb(C.sun));
      ctx.fillStyle = sk; ctx.fillRect(ox, oy, ow, hz - oy);
      const se = ctx.createLinearGradient(0, hz, 0, oy + oh);
      se.addColorStop(0, rgb(mixc(C.sky, C.sun, 0.4))); se.addColorStop(1, rgb(mixc(C.tealDeep, C.night700, 0.3)));
      ctx.fillStyle = se; ctx.fillRect(ox, hz, ow, oy + oh - hz);
      sx = ox + ow * 0.36; sy = hz;
      ctx.fillStyle = rgb(C.daylight); ctx.beginPath(); ctx.arc(sx, sy, ow * 0.07, Math.PI, 0); ctx.fill();
      const lx = ox + ow * 0.66, lw = ow * 0.035, lh = oh * 0.13;
      ctx.fillStyle = rgb(C.silver050); ctx.fillRect(lx - lw / 2, hz - lh, lw, lh);
      ctx.fillStyle = rgb(C.silver600); ctx.fillRect(lx - lw / 2, hz - lh * 0.66, lw, lh * 0.18); ctx.fillRect(lx - lw / 2, hz - lh * 0.3, lw, lh * 0.18);
      ctx.fillStyle = rgb(C.silver100);
      ctx.beginPath(); ctx.moveTo(ox, oy + oh); ctx.lineTo(ox, oy + oh * 0.8); ctx.quadraticCurveTo(ox + ow * 0.3, oy + oh * 0.72, ox + ow * 0.5, oy + oh * 0.86); ctx.quadraticCurveTo(ox + ow * 0.8, oy + oh * 0.8, ox + ow, oy + oh * 0.9); ctx.lineTo(ox + ow, oy + oh); ctx.fill();
    }
    if (warm < 0.999) {
      const op = ctx.globalCompositeOperation;
      ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = rgb(tone(warm)); ctx.fillRect(ox, oy, ow, oh);
      ctx.globalCompositeOperation = op;
    }
    glow(ctx, sx, sy, ow * (0.2 + 0.3 * warm), C.sun, (final ? 0.45 : 0.4) * warm * warm);
    return [sx, sy];
  };

  const glass = (ctx, L, casing, U) => {
    const { ox, oy, ow, oh, cx, cy } = L;
    ctx.fillStyle = rgb(casing); ctx.fillRect(cx - 2.5 * U, oy, 5 * U, oh); ctx.fillRect(ox, cy - 2.5 * U, ow, 5 * U);
    const g = ctx.createLinearGradient(ox, oy, ox + ow, oy + oh);
    g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.42, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,255,255,0.07)'); g.addColorStop(0.58, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(ox, oy, ow, oh);
  };

  const quad = (ctx, a, b, c, d) => { ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(c[0], c[1]); ctx.lineTo(d[0], d[1]); ctx.closePath(); };

  const leaf = (ctx, xh, dir, y0, y1, lw, s, o) => {
    const ss = clamp(s, -1.15, 1), e = rm() ? 0 : 0.09 * (y1 - y0) * Math.sqrt(Math.max(0, 1 - Math.min(1, ss * ss))) * (ss > 0 ? 1 : 0.6);
    const xf = xh + dir * lw * ss, H0 = [xh, y0], H1 = [xh, y1], F0 = [xf, y0 - e], F1 = [xf, y1 + e];
    const at = (f, k) => [lerp(xh, xf, k), lerp(lerp(y0, y1, f), lerp(y0 - e, y1 + e, f), k)];
    const back = ss < 0, face = back ? mixc(o.col, C.night900, 0.35) : o.col, edge = 1 - Math.abs(ss);
    ctx.fillStyle = rgb(mixc(face, C.night950, 0.45 * edge)); quad(ctx, H0, F0, F1, H1); ctx.fill();
    const fr = 0.1;
    ctx.strokeStyle = rgb(mixc(face, C.night950, 0.3 + 0.3 * edge)); ctx.lineWidth = 1.2 * o.U;
    quad(ctx, at(0.04, fr), at(0.04, 1 - fr), at(0.96, 1 - fr), at(0.96, fr)); ctx.stroke();
    const n = 10;
    for (let j = 0; j < n; j++) {
      const f = 0.08 + (0.84 * (j + 0.5)) / n, tilt = o.hist[Math.min(o.hist.length - 1, j)] || 0;
      const a = at(f, fr), b = at(f, 1 - fr), d = (2.2 + 1.2 * clamp(tilt, -1, 1) + o.gap) * o.U;
      if (!back && o.leak > 0.01) { ctx.strokeStyle = rgb(o.leakC, clamp(o.leak * (0.35 + 0.4 * o.gap), 0, 0.9)); ctx.lineWidth = 1.4 * o.U; ctx.beginPath(); ctx.moveTo(a[0], a[1] + d * 0.5); ctx.lineTo(b[0], b[1] + d * 0.5); ctx.stroke(); }
      ctx.strokeStyle = rgb(mixc(face, C.silver050, 0.35 - 0.25 * edge), 0.8); ctx.lineWidth = 1.2 * o.U;
      ctx.beginPath(); ctx.moveTo(a[0], a[1] - d * 0.5); ctx.lineTo(b[0], b[1] - d * 0.5); ctx.stroke();
      ctx.strokeStyle = rgb(mixc(face, C.night950, 0.55), 0.85); ctx.lineWidth = 1.6 * o.U;
      ctx.beginPath(); ctx.moveTo(a[0], a[1] + d * 0.3); ctx.lineTo(b[0], b[1] + d * 0.3); ctx.stroke();
    }
    if (!back) {
      const kp = at(0.5, 0.86);
      sprite(ctx, 'glow', C.glow, kp[0], kp[1], 9 * o.U, 0.25 * o.lit);
      ctx.fillStyle = rgb(mixc(C.amberDeep, C.night900, 0.55 - 0.35 * o.lit)); ctx.beginPath(); ctx.arc(kp[0], kp[1], 4.2 * o.U, 0, TAU); ctx.fill();
      ctx.fillStyle = rgb(C.glow, 0.55); ctx.beginPath(); ctx.arc(kp[0] - 1.2 * o.U, kp[1] - 1.2 * o.U, 1.4 * o.U, 0, TAU); ctx.fill();
    }
    ctx.fillStyle = rgb(C.night950, 0.85);
    for (const f of [0.16, 0.84]) { const p = at(f, 0); ctx.fillRect(p[0] - (dir > 0 ? 2 : 6) * o.U, p[1] - 3 * o.U, 8 * o.U, 6 * o.U); }
    return xf;
  };

  A.defineTask(ID, {
    modes: ['fatigue', 'wake'], role: 'WarioWare Touched!; Peggle last peg; Beat Saber direction cue (1:1 drag)',
    make(k) {
      const N0 = ax('windows', 6 + Math.round(2 * k));
      return base(ID, 15, {
        N: N0, plan: plan(N0), wins: [], i: 0, slide: null, slideP: 0, drag: null, b: null, inited: false,
        sun: 0, perfRun: 0, autoPhase: false, feverUntil: -9, breathAt: -9, finalAt: null, payBig: 1, washPeak: 0.3,
        times: [], learned: {}, bot: null, lastTouch: -9, touchMark: null, hist: new Array(12).fill(0), lastS: 1,

        init(now) {
          if (this.inited) return;
          this.inited = true;
          const fit = Math.max(3, Math.floor((this.max - 0.5) / 1.75));
          if (this.N > fit) { this.N = fit; this.plan = plan(fit); }
          this.wins = this.plan.map(mkWin);
          A.Skill?.progress(ID, 0, this.N);
          this.arrive(this.wins[0], this.startAt ?? now);
          this.syncExtra();
        },
        cur() { return this.wins[this.i]; },
        box() { return this.b || A.session?.box?.() || { x: 0, y: 0, w: 335, h: 388 }; },
        L(w) { return lay(this.box(), w.m); },
        px(u, v) { const b = this.box(); return [b.x + u * b.w, b.y + v * b.h]; },

        arrive(w, t) {
          const p = beat.period();
          w.st = 'ready'; w.arr = t; w.warm0 = this.warmNow();
          const perf = ax('perfect', 6) * (A.Skill?.assisted() ? 1.25 : 1);
          w.perfAt = t + perf * p; w.goodAt = t + 8 * p;
          w.commit = ax('commit', 0.4);
          const d = ax('cue', 0.3);
          w.cueS = d < 0.3 ? Infinity : 0.8 * Math.pow(0.3 / 0.8, (d - 0.3) / 0.7);
          w.arrAt = J.at;
          w.autoAt = this.autoPhase ? t + 0.6 + 0.3 * R() : Infinity;
          if (!this.autoPhase) this.rt?.cue(w.i, 'tap_target', t);
        },
        warmNow() { return clamp(this.sun / this.N, 0, 1); },

        startSlide(now) {
          const next = this.wins[this.i + 1];
          if (next.m === 'blind' && next.i < this.N - 1 && ax('mirror', 0) >= 1 && R() < 0.5) next.m = 'blind_up';
          next.st = 'enter';
          const tr = this.autoPhase ? 0.3 : ax('transition', 0.4), p = beat.period() / 2;
          let end = now + tr;
          if (!this.autoPhase) end = beat.t0 + Math.ceil((end - beat.t0) / p - 1e-6) * p;
          this.slide = { t0: now, end, dur: end - now };
          this.slideP = 0;
          A.Traverse?.nudge?.(140, end - now);
          sfx('shutters.slide');
          this.syncExtra();
        },

        need() { return this.wins.filter(w => w.st !== 'open' && w.i < this.N - 1).length * 1.25 + 2.6; },

        update(dt, now) {
          this.init(now);
          if (this.slide) {
            this.slideP = clamp((now - this.slide.t0) / this.slide.dur, 0, 1);
            if (now >= this.slide.end) { this.slide = null; this.slideP = 0; this.i++; this.arrive(this.cur(), now); }
          }
          const w = this.cur();
          if (w.st === 'open' && !this.slide && w.i < this.N - 1 && now - w.openT >= HOLD) this.startSlide(now);
          if (!this.done && !this.autoPhase && this.t >= this.max - this.need()) {
            this.autoPhase = true;
            if (w.st === 'ready') w.autoAt = now + 0.6 + 0.3 * R();
          }
          if (this.autoPhase && w.st === 'ready' && w.i < this.N - 1 && !this.drag && now >= w.autoAt) this.commit(w, now, true);
          for (const x of this.wins) {
            if (x.st !== 'ready' || (this.drag && this.drag.w === x) || !x.sp) continue;
            const damp = rm() ? 1 : 0.32;
            x.pull = J.spring(x.sp.p, 0, 4.5, damp, dt); x.sep = J.spring(x.sp.s, 0, 4.5, damp, dt);
            x.bx = J.spring(x.sp.x, 0, 6, rm() ? 1 : 0.45, dt); x.by = J.spring(x.sp.y, 0, 6, rm() ? 1 : 0.45, dt);
            if (Math.abs(x.pull) + Math.abs(x.sep) + Math.abs(x.bx) + Math.abs(x.by) < 0.05 && Math.abs(x.sp.p.v) + Math.abs(x.sp.s.v) < 0.5) { x.pull = x.sep = x.bx = x.by = 0; x.sp = null; }
          }
          const s = w.m === 'pair' ? 1 - w.sep / Math.max(1, this.L(w).travel) : 1;
          this.hist.pop(); this.hist.unshift(clamp((s - this.lastS) * 40, -1, 1)); this.lastS = s;
          this.tickShared();
        },
        outroUpdate() { this.tickShared(); },
        tickShared() {
          if (A.session) A.session.daylightBoost = this.done ? 1 : this.items / this.N;
          J.border(this.done ? 1 : 0.8 * this.wins.filter(w => w.st === 'open').length / this.N);
        },

        hit(w, P) {
          const L = this.L(w), U = L.U;
          let [x, y] = P;
          if (w.m === 'pair') return x > L.ox - 14 * U && x < L.ox + L.ow + 14 * U && y > L.oy - 10 * U && y < L.oy + L.oh + 10 * U;
          if (w.m === 'blind_up') y = 2 * L.cy - y;
          const fb = L.oy + L.rest + w.pull;
          return x > L.ox - 16 * U && x < L.ox + L.ow + 16 * U && y > L.oy - 10 * U && y < fb + 7 * U + 16 * U + 2 * L.rr + 18 * U;
        },

        down(u, v, t, d) {
          this.lastIn = this.t; this.lastTouch = this.t;
          const P = this.px(u, v), w = this.cur();
          this.touchMark = { x: P[0], y: P[1], at: J.at };
          if (!w || w.st !== 'ready' || this.drag || !this.hit(w, P)) { if (this.slide && !this.drag) this.rt?.early(); fx.burst(P[0], P[1], 3, C.flame, 50, { life: 0.35, size: [2, 0.5] }); return; }
          this.rt?.hit(w.i, d?.ts ?? t);
          this.drag = { w, x0: P[0], y0: P[1], ticks: 0, wrong: false, past: false, frostAt: 0 };
          w.tries++; w.grabAt = J.at; w.grabMs = performance.now(); w.sp = null;
          hap('light');
          sfx(w.m === 'pair' ? 'shutters.latch' : 'shutters.creak');
        },

        move(u, v, t) {
          const g = this.drag;
          if (!g) return;
          const w = g.w, L = this.L(w), U = L.U, P = this.px(u, v);
          if (w.st !== 'ready') return;
          let dx = P[0] - g.x0, dy = P[1] - g.y0;
          if (w.m === 'blind_up') dy = -dy;
          const pair = w.m === 'pair', fwd = pair ? Math.abs(dx) : dy, side = pair ? Math.abs(dy) : Math.abs(dx);
          const wrongMag = pair ? (side > fwd ? side : 0) : Math.max(-dy, side > Math.max(0, dy) ? side : 0);
          if (pair) {
            w.sep = clamp(Math.abs(dx), 0, L.travel);
            w.by = side > fwd ? rubber(dy, 10 * U) : 0; w.bx = 0;
            if (w.sep > g.frostAt + 12 * U && w.frost < 9) {
              g.frostAt = w.sep; w.frost++;
              const s = 1 - w.sep / L.travel;
              for (const dir of [-1, 1]) fx.snow(L.cx + dir * (L.ow / 2) * (1 - s), L.oy + R() * L.oh, 1, C.silver050, { vx: dir * 30, vy: 30 });
            }
            if (w.sep >= w.commit * L.travel) { this.commit(w, t, false); return; }
          } else {
            const raw = Math.max(0, dy) * RESIST;
            w.pull = raw > L.travel ? L.travel + rubber(raw - L.travel, 12 * U) : raw;
            w.by = dy < 0 && -dy > side ? rubber(dy, 12 * U) : 0;
            w.bx = side > Math.max(0, dy) ? rubber(dx, 10 * U) : 0;
            while (w.pull >= (g.ticks + 1) * 25 * U && g.ticks < 6) { g.ticks++; hap('tick'); sfx('shutters.ratchet', { i: g.ticks }); }
            const past = w.pull >= w.commit * L.travel;
            if (past && !g.past) { w.readyAt = J.at; fx.burst(L.cx, w.m === 'blind_up' ? L.oy + L.oh : L.oy, 4, C.sun, 70, { life: 0.4 }); }
            g.past = past;
          }
          if (!g.wrong && wrongMag > 14 * U && wrongMag > Math.max(0, fwd)) {
            g.wrong = true; w.hintAt = J.at;
            if (w.tries === 1) w.wrongFirst = true;
            hap('tick'); sfx('shutters.tock');
          }
        },

        up(u, v, t) {
          const g = this.drag;
          this.drag = null;
          if (!g) return;
          const w = g.w;
          if (w.st !== 'ready') return;
          if (w.m !== 'pair' && g.past && w.pull >= w.commit * this.L(w).travel) { this.commit(w, t, false); return; }
          this.errors++;
          w.sp = { p: { x: w.pull, v: 0 }, s: { x: w.sep, v: 0 }, x: { x: w.bx, v: 0 }, y: { x: w.by, v: 0 } };
          sfx('shutters.tock');
        },

        commit(w, t, auto) {
          if (w.st !== 'ready') return;
          const L = this.L(w), U = L.U, last = w.i === this.N - 1;
          w.st = 'open'; w.openAt = J.at; w.openT = t; w.auto = auto;
          if (auto) this.rt?.lapse(w.i);
          w.from = w.m === 'pair' ? 1 - w.sep / L.travel : w.pull;
          if (this.drag?.w === w) this.drag = null;
          let grade = 'miss';
          if (!auto) {
            this.items++;
            this.times.push({ m: w.m, ms: Math.round((t - w.arr) * 1000) });
            this.learned[w.m] = true;
            grade = w.wrongFirst ? 'barely' : t <= w.perfAt ? 'perfect' : t <= w.goodAt ? 'good' : 'barely';
          }
          w.grade = grade;
          this.perfRun = grade === 'perfect' ? this.perfRun + 1 : 0;
          const res = A.Skill?.trial(ID, grade);
          if (res?.fever) this.feverUntil = t + 2.5;
          const fever = t < this.feverUntil;
          this.sun = Math.min(this.N, this.sun + (auto ? 0.8 : 1) + (grade === 'perfect' && this.perfRun >= 2 ? 0.5 : 0) + (res?.up ? 0.25 : 0));
          if (last) this.sun = this.N;
          w.warm = this.warmNow();
          const cx = L.cx, cy = L.cy;
          if (!auto) {
            const sparks = (grade === 'barely' ? 6 : 12) * (fever ? 1.6 : 1);
            fx.burst(cx, w.m === 'pair' ? cy : L.oy, Math.round(sparks), mixc(C.gold, C.sun, 0.5), 200 * U);
            if (grade === 'barely') w.wobAt = J.at;
            if (!last) J.bloom(cx, cy, L.ow * (grade === 'perfect' ? 0.62 : 0.5) * (fever ? 1.2 : 1), C.glow, grade === 'perfect' ? 0.5 : 0.34, 0.25, 0.6);
            if (grade === 'perfect') { const gy = w.m === 'blind_up' ? L.oy + L.oh : L.oy; J.bloom(cx, gy, 30 * U, C.daylight, 0.6, 0.12, 0.4); fx.add({ x: cx + (R() - 0.5) * L.ow * 0.4, y: gy, kind: 'spark', c: C.daylight, life: 0.5, size: [14 * U, 2 * U], alpha: [1, 0] }); }
            if (w.m === 'pair') {
              const o = Math.max(0, 125 - (performance.now() - (w.grabMs || 0)));
              hap.seq([['tick', 0], ['medium', o], ['light', o + 140], ...(grade === 'perfect' ? [['tick', o + 75]] : [])]);
              for (let k = 0; k < fx.n(10); k++) fx.add({ x: L.ox - 8 * U + R() * (L.ow + 16 * U), y: L.oy - 14 * U, vx: (R() - 0.5) * 30, vy: 10 + 30 * R(), g: 260, life: 0.9, kind: 'mote', add: false, c: C.silver050, size: [2.2 * U, 1.4 * U], alpha: [0.9, 0] });
            } else {
              const o = Math.max(0, 125 - (performance.now() - (w.grabMs || 0)));
              hap.seq([['heavy', o], ...(grade === 'perfect' ? [['tick', o + 40]] : [])]);
            }
            J.hitstop(this, last ? 40 : 50);
            if (res?.up) J.stinger();
            sfx('shutters.open', { piano: [7 + [0, 2, 4, 5, 7, 9, 11, 12, 14][Math.min(8, this.items - 1)], grade === 'barely' ? 0.09 : 0.14] });
          } else {
            sfx('shutters.open_auto');
          }
          const third = A.Skill?.progress(ID, this.wins.filter(x => x.st === 'open').length, this.N);
          if (third) { J.stinger(); this.breathAt = J.at; }
          if (last) this.finale(w, t, auto, res);
          this.syncExtra();
        },

        finale(w, t, auto, res) {
          const L = this.L(w), U = L.U, share = res?.light ?? (this.items / this.N);
          this.payBig = share >= 0.8 ? 1 : share >= 0.5 ? 0.72 : 0.5;
          this.finalAt = J.at;
          if (auto) return;
          this.outro = 1.8;
          finish(this, t);
          J.slowmo(this, 0.3, 500);
          const gate = J.flash.request(0.45, 0.35);
          this.washPeak = gate.ok ? Math.min(0.12, gate.peak) : 0.06;
          hap.seq([['success', 420]]);
          J.border(1);
          J.spill(0.5 + 0.5 * share);
          sfx('shutters.finale', { piano: [14, 0.18] });
          setTimeout(() => {
            if (rm()) return;
            const [sx, sy] = this.sunPt || [L.cx, L.cy];
            for (let k = 0; k < Math.round(30 * this.payBig); k++) fx.add({ x: sx + (R() - 0.5) * 20 * U, y: sy, vx: (R() - 0.5) * 220 * U, vy: -(150 + 170 * R()) * U, g: 260 * U, drag: 0.7, life: 1.5 + 0.4 * R(), kind: 'mote', c: R() < 0.5 ? C.gold : C.sun, size: [3.2 * U, 1.4 * U], alpha: [1, 0] });
          }, 420);
        },

        syncExtra() {
          const by = {};
          for (const { m, ms } of this.times) (by[m] = by[m] || []).push(ms);
          this.extra = {
            v: 2, n_windows: this.N, mechanisms: this.wins.map(w => w.m),
            open_ms_median: this.times.length ? Math.round(median(this.times.map(x => x.ms))) : null,
            open_ms_by_mechanism: Object.fromEntries(Object.entries(by).map(([m, xs]) => [m, Math.round(median(xs))])),
            auto_opened: this.wins.filter(w => w.auto).length,
          };
        },

        gesture(w, kind, now) {
          const L = this.L(w), U = L.U, b = this.box();
          let x0, y0, x1, y1, dur = 0.32;
          if (w.m === 'pair') {
            const dir = R() < 0.5 ? -1 : 1;
            x0 = L.cx + dir * 12 * U; y0 = L.cy + (R() - 0.5) * 30 * U;
            if (kind === 'wrong') { x1 = x0; y1 = y0 + 50 * U; }
            else { x1 = x0 + dir * L.travel * (kind === 'short' ? 0.2 : 0.9); y1 = y0 + (R() - 0.5) * 10 * U; }
          } else {
            const sgn = w.m === 'blind_up' ? -1 : 1, ry = L.oy + L.rest + 7 * U + 16 * U + L.rr;
            x0 = L.ringX; y0 = w.m === 'blind_up' ? 2 * L.cy - ry : ry;
            x1 = x0; y1 = y0 + sgn * (kind === 'wrong' ? -50 * U : kind === 'short' ? 0.2 * L.travel : 0.8 * L.travel / RESIST);
            if (kind === 'go') dur = 0.38;
          }
          return { a: [(x0 - b.x) / b.w, (y0 - b.y) / b.h], z: [(x1 - b.x) / b.w, (y1 - b.y) / b.h], t0: now, dur, on: false };
        },

        auto(dt, now) {
          const w = this.cur();
          if (!this.b) return;
          const bt = this.bot;
          if (bt?.g) {
            const g = bt.g, p = clamp((now - g.t0) / g.dur, 0, 1), m = E.inOut(p);
            if (!g.on) { g.on = true; this.down(g.a[0], g.a[1], now); }
            this.move(lerp(g.a[0], g.z[0], m), lerp(g.a[1], g.z[1], m), now);
            if (p >= 1) { this.up(g.z[0], g.z[1], now); bt.g = null; bt.at = now + 0.28 + 0.2 * R(); }
            return;
          }
          if (w.st !== 'ready') { this.bot = null; return; }
          if (!bt || bt.w !== w) {
            const r = R(), perfS = w.perfAt - w.arr, goodS = w.goodAt - w.arr;
            const kind = r < 0.15 ? 'perfect' : r < 0.7 ? 'good' : r < 0.85 ? 'wrong' : 'short';
            const wait = kind === 'perfect' ? 0.2 + 0.35 * R() : kind === 'good' ? (perfS > 2.2 ? 0.9 + 0.8 * R() : perfS + 0.05 + R() * Math.min(0.6, Math.max(0, goodS - perfS - 0.5)) - 0.38) : 0.3 + 0.3 * R();
            this.bot = { w, at: w.arr + Math.max(0.15, wait), q: kind === 'wrong' || kind === 'short' ? [kind, 'go'] : ['go'] };
            return;
          }
          if (now < bt.at || !bt.q.length) return;
          bt.g = this.gesture(w, bt.q.shift(), now);
        },

        lit(w, at) { return w.openAt === null ? w.warm0 : lerp(w.warm0, w.warm, E.outSoft((at - w.openAt) / 0.6)); },

        leakA(w, at) {
          if (w.st === 'open') return 0;
          const since = at - (w.arrAt ?? at), cue = since < w.cueS ? 1 : Math.max(0.22, 1 - (since - w.cueS) / 0.4);
          const beatP = beat.phase(), breathe = 0.9 + 0.1 * Math.cos(TAU * beatP);
          const hint = Math.max(0, 1 - (at - w.hintAt) / 0.6) * 0.8, grab = w.grabAt > 0 && this.drag?.w === w ? 0.15 : 0;
          return clamp((cue + hint + grab) * breathe, 0, 1.4);
        },

        drawBlindCard(ctx, w, L, at) {
          const { U, ox, oy, ow, oh } = L, warm = this.lit(w, at), lit = 0.3 + 0.7 * warm;
          const b = this.box();
          const wall = warm < 0.5 ? mixc(mixc(C.night800, C.night600, 0.45), mixc(C.violet500, C.night700, 0.55), warm * 2) : mixc(mixc(C.violet500, C.night700, 0.55), mixc(C.peach, C.night700, 0.45), warm * 2 - 1);
          ctx.fillStyle = rgb(wall); ctx.fillRect(b.x, b.y, b.w, b.h);
          ctx.fillStyle = rgb(C.night950, 0.18);
          for (let x = b.x + 26 * U; x < b.x + b.w; x += 38 * U) ctx.fillRect(x, b.y, 1.5 * U, b.h);
          const casing = mixc(C.night800, C.silver200, 0.25 + 0.6 * warm);
          glow(ctx, L.cx, L.cy, ow * 1.1, mixc(C.ice, C.gold, w.warm0), 0.14 + 0.1 * warm);
          ctx.fillStyle = rgb(mixc(casing, C.night950, 0.25)); ctx.fillRect(ox - 13 * U, oy - 13 * U, ow + 26 * U, oh + 26 * U);
          ctx.fillStyle = rgb(casing); ctx.fillRect(ox - 10 * U, oy - 10 * U, ow + 20 * U, oh + 20 * U);
          ctx.save(); ctx.beginPath(); ctx.rect(ox, oy, ow, oh); ctx.clip();
          const sp = view(ctx, L, warm, at, false);
          glass(ctx, L, casing, U);
          ctx.restore();
          ctx.fillStyle = rgb(C.night950, 0.35); ctx.fillRect(ox - 20 * U, oy + oh + 10 * U, ow + 40 * U, 8 * U);
          ctx.fillStyle = rgb(mixc(casing, C.silver050, 0.15)); ctx.fillRect(ox - 20 * U, oy + oh, ow + 40 * U, 11 * U);
          this.drawWedge(ctx, w, L, at, sp, true);
          this.drawBlind(ctx, w, L, at, casing, lit);
        },

        drawBlind(ctx, w, L, at, casing, lit) {
          const { U, ox, oy, ow, oh, cx, cy, rest } = L, up = w.m === 'blind_up';
          const leak = this.leakA(w, at), leakC = mixc(C.ice, C.gold, w.warm0);
          let fb = oy + rest + w.pull + w.by, spin = 0;
          if (w.openAt !== null) {
            const dur = w.auto ? 0.6 : rm() ? 0.35 : 0.3, q = (at - w.openAt) / dur;
            const e = w.auto || rm() ? E.outSoft(q) : E.outBack(q, 1.1);
            const top = oy + 3 * U, start = oy + rest + w.from;
            fb = Math.max(top - 2 * U, lerp(start, top, e));
            spin = q < 1 && !rm() && !w.auto ? Math.sin(Math.PI * clamp(q, 0, 1)) : 0;
          }
          const len = Math.max(0, fb - oy), rolled = clamp(1 - len / (oh * 1.3), 0, 1), r = (5 + 4 * rolled) * U;
          ctx.save();
          if (up) { ctx.translate(0, 2 * cy); ctx.scale(1, -1); }
          if (leak > 0.01 && fb < oy + oh) {
            ctx.save(); ctx.globalCompositeOperation = 'lighter';
            const lg = ctx.createLinearGradient(0, fb, 0, fb + 14 * U);
            lg.addColorStop(0, rgb(leakC, 0.55 * leak)); lg.addColorStop(1, rgb(leakC, 0));
            ctx.fillStyle = lg; ctx.fillRect(ox, fb + 4 * U, ow, Math.min(14 * U, oy + oh - fb));
            ctx.fillStyle = rgb(leakC, 0.22 * leak); ctx.fillRect(ox - 1.5 * U, oy + r, 2.5 * U, Math.min(fb, oy + oh) - oy - r); ctx.fillRect(ox + ow - 1 * U, oy + r, 2.5 * U, Math.min(fb, oy + oh) - oy - r);
            ctx.restore();
          }
          const held = this.drag?.w === w, sq = J.squash(at - w.grabAt, 0.88, 0.22);
          const sag = rm() ? 0 : Math.min(7 * U, 0.05 * Math.max(0, w.pull) + (held ? 1.5 * U : 0));
          const base = mixc(C.flame, C.peach, 0.12), fab = mixc(mixc(mixc(C.night800, base, 0.42 + 0.5 * lit), C.ice, 0.05 * (1 - w.warm0)), C.gold, 0.12 * w.warm0);
          const wob = J.wobble(at - w.wobAt)[0] * U;
          const x0 = ox - 4 * U + w.bx * 0.4 + wob, fw = ow + 8 * U, ft = oy + r;
          if (fb > ft + 0.5) {
            ctx.save();
            ctx.beginPath(); ctx.moveTo(x0, ft); ctx.lineTo(x0 + fw, ft); ctx.lineTo(x0 + fw, fb); ctx.quadraticCurveTo(L.ringX, fb + 2 * sag, x0, fb); ctx.closePath();
            const fg = ctx.createLinearGradient(0, ft, 0, fb);
            fg.addColorStop(0, rgb(mixc(fab, C.night950, 0.25))); fg.addColorStop(0.15, rgb(fab)); fg.addColorStop(1, rgb(mixc(fab, C.silver050, 0.08)));
            ctx.fillStyle = fg; ctx.fill(); ctx.clip();
            const tex = linen();
            ctx.globalAlpha *= 0.5; ctx.drawImage(tex, x0, fb - tex.height * (fw / tex.width), fw, tex.height * (fw / tex.width)); ctx.globalAlpha /= 0.5;
            if (spin > 0) {
              ctx.fillStyle = rgb(C.night950, 0.18 * spin);
              for (let y = ft + ((at * 900) % (9 * U)); y < fb; y += 9 * U) ctx.fillRect(x0, y, fw, 2.5 * U);
              ctx.fillStyle = rgb(C.daylight, 0.08 * spin); ctx.fillRect(x0, ft, fw, fb - ft);
            }
            if (leak > 0.01) { ctx.globalCompositeOperation = 'lighter'; glow(ctx, cx, fb, ow * 0.55, leakC, 0.12 * leak); }
            ctx.restore();
            const by0 = fb - 3 * U;
            ctx.strokeStyle = rgb(mixc(C.woodL, C.amber, 0.25 * lit)); ctx.lineWidth = 7 * U; ctx.lineCap = 'round';
            ctx.beginPath(); ctx.moveTo(x0 - 2 * U, by0); ctx.quadraticCurveTo(L.ringX, by0 + 2 * sag, x0 + fw + 2 * U, by0); ctx.stroke();
            ctx.strokeStyle = rgb(C.glow, 0.25 * lit); ctx.lineWidth = 1.5 * U;
            ctx.beginPath(); ctx.moveTo(x0, by0 - 2 * U); ctx.quadraticCurveTo(L.ringX, by0 - 2 * U + 2 * sag, x0 + fw, by0 - 2 * U); ctx.stroke();
            if (w.st !== 'open' || at - w.openAt < 0.15) {
              const sway = held ? clamp(w.bx * 0.02, -0.4, 0.4) : rm() ? 0 : 0.09 * Math.sin(at * 1.9 + w.seed);
              const ay = fb + sag + 2 * U, cord = 16 * U, rx = L.ringX + w.bx * 0.4 + Math.sin(sway) * cord, ry = ay + Math.cos(sway) * cord + L.rr;
              ctx.strokeStyle = rgb(mixc(C.silver300, C.night800, 0.5 - 0.3 * lit)); ctx.lineWidth = 1.4 * U;
              ctx.beginPath(); ctx.moveTo(L.ringX, ay); ctx.lineTo(rx, ry - L.rr); ctx.stroke();
              const pulse = w.st === 'ready' && !held ? 0.5 + 0.5 * Math.cos(TAU * beat.phase()) : held ? 1 : 0;
              glow(ctx, rx, ry, 26 * U, C.glow, (0.16 + 0.12 * pulse) * (w.st === 'ready' ? 1 : 0));
              ctx.save(); ctx.translate(rx, ry); ctx.scale(sq[0], sq[1]);
              ring(ctx, 0, 0, L.rr, mixc(C.woodD, C.night950, 0.3), 0.6, 6 * U);
              ring(ctx, 0, 0, L.rr, mixc(C.woodL, C.amber, 0.45 + 0.3 * lit), 1, 4.4 * U);
              ring(ctx, -0.8 * U, -1 * U, L.rr, C.glow, 0.35, 1.2 * U);
              ctx.restore();
            }
            if (w.readyAt > 0 && held && this.drag?.past) glow(ctx, cx, oy + 4 * U, ow * 0.5, C.sun, 0.35 * (0.7 + 0.3 * Math.sin(at * 8)));
          }
          const rg = ctx.createLinearGradient(0, oy - r, 0, oy + r);
          rg.addColorStop(0, rgb(mixc(fab, C.night950, 0.45))); rg.addColorStop(0.45, rgb(mixc(fab, C.silver050, 0.12))); rg.addColorStop(1, rgb(mixc(fab, C.night950, 0.4)));
          ctx.fillStyle = rg; ctx.beginPath(); ctx.roundRect(ox - 9 * U, oy - r, ow + 18 * U, 2 * r, r); ctx.fill();
          if (spin > 0) {
            ctx.fillStyle = rgb(C.night950, 0.3 * spin);
            const ang = (oh + rest - (fb - oy)) / Math.max(r, 1);
            for (let k = 0; k < 4; k++) { const a = ang + k * TAU / 4, s = Math.sin(a); if (Math.cos(a) > 0) ctx.fillRect(ox - 9 * U, oy + s * r * 0.85 - U, ow + 18 * U, 2 * U); }
          }
          ctx.fillStyle = rgb(mixc(casing, C.night950, 0.4));
          ctx.fillRect(ox - 12 * U, oy - r - 1 * U, 5 * U, 2 * r + 2 * U); ctx.fillRect(ox + ow + 7 * U, oy - r - 1 * U, 5 * U, 2 * r + 2 * U);
          ctx.restore();
        },

        drawPairCard(ctx, w, L, at) {
          const { U, ox, oy, ow, oh, cx, cy } = L, warm = this.lit(w, at), b = this.box(), final = w.i === this.N - 1;
          const clad = mixc(mixc(C.night800, C.night600, 0.4), mixc(mixc(C.gold, C.amberDeep, 0.3), C.silver300, 0.4), 0.3 + 0.55 * warm);
          ctx.fillStyle = rgb(clad); ctx.fillRect(b.x, b.y, b.w, b.h);
          for (let y = b.y + 6 * U, j = 0; y < b.y + b.h; y += 15 * U, j++) {
            ctx.fillStyle = rgb(C.night950, 0.22); ctx.fillRect(b.x, y, b.w, 1.6 * U);
            ctx.fillStyle = rgb(C.silver050, 0.05 + 0.04 * warm); ctx.fillRect(b.x, y + 1.6 * U, b.w, 1.2 * U);
          }
          const shade = ctx.createLinearGradient(0, b.y, 0, b.y + b.h);
          shade.addColorStop(0, rgb(C.night950, 0.25)); shade.addColorStop(0.45, rgb(C.night950, 0)); shade.addColorStop(1, rgb(C.night950, 0.4));
          ctx.fillStyle = shade; ctx.fillRect(b.x, b.y, b.w, b.h);
          const casing = mixc(C.night800, C.silver100, 0.3 + 0.6 * warm), snow = mixc(C.night700, C.silver050, 0.55 + 0.45 * warm);
          this.drawWedge(ctx, w, L, at, null, false);
          ctx.fillStyle = rgb(casing); ctx.fillRect(ox - 9 * U, oy - 9 * U, ow + 18 * U, oh + 18 * U);
          ctx.save(); ctx.beginPath(); ctx.rect(ox, oy, ow, oh); ctx.clip();
          const sp = view(ctx, L, warm, at, final);
          if (final) this.sunPt = sp;
          if (!final) glass(ctx, L, casing, U);
          if (final && this.finalAt !== null) this.drawSun(ctx, L, at, sp, false);
          ctx.restore();
          const leak = this.leakA(w, at), leakC = mixc(C.ice, C.gold, w.warm0), held = this.drag?.w === w;
          let s = 1 - w.sep / L.travel;
          if (w.openAt !== null) {
            const dur = w.auto ? 0.6 : 0.45, q = (at - w.openAt) / dur;
            s = lerp(w.from, -1, w.auto || rm() ? E.outSoft(q) : E.outBack(q, 1.7));
          }
          const sq = held ? J.squash(at - w.grabAt, 0.96, 0.18) : [1, 1], lw = (ow / 2) * sq[1];
          const gap = held ? 0.8 : 0;
          ctx.save(); ctx.translate(J.wobble(at - w.wobAt)[0] * U, w.by);
          if (leak > 0.01 && s > 0.6) {
            ctx.save(); ctx.globalCompositeOperation = 'lighter';
            const sw = (1 - s) * ow / 2 + 2.5 * U;
            ctx.fillStyle = rgb(leakC, 0.6 * leak * (1 - 0.4 * w.warm0)); ctx.fillRect(cx - sw, oy, 2 * sw, oh);
            glow(ctx, cx, cy, oh * 0.45, leakC, 0.22 * leak * (1 - 0.6 * w.warm0));
            ctx.restore();
          }
          const o = { U, col: mixc(C.night800, mixc(C.silver300, C.sky, 0.45), 0.3 + 0.65 * warm), hist: this.cur() === w ? this.hist : [], gap, lit: 0.3 + 0.7 * warm, leak: leak * (held ? 1.15 : 1), leakC };
          leaf(ctx, ox, 1, oy, oy + oh, lw, s, o);
          leaf(ctx, ox + ow, -1, oy, oy + oh, lw, s, o);
          if (s > 0.2) {
            const lift = clamp((1 - s) * 3, 0, 1), xl = ox + lw * s, xr = ox + ow - lw * s;
            ctx.save(); ctx.translate(xl - 10 * U, cy); ctx.rotate(-1.2 * lift);
            ctx.strokeStyle = rgb(mixc(C.night950, C.silver600, 0.3)); ctx.lineWidth = 3.4 * U; ctx.lineCap = 'round';
            ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(24 * U, 0); ctx.lineTo(24 * U, -5 * U); ctx.stroke();
            ctx.restore();
            ring(ctx, xl - 10 * U, cy, 2.6 * U, C.night950, 0.9, 2.2 * U);
            ring(ctx, xr + 12 * U, cy - 1 * U, 3 * U, C.night950, 0.9, 2.2 * U);
          }
          ctx.restore();
          const slide = w.openAt !== null && !rm() ? E.outSoft((at - w.openAt) / 0.5) : 0;
          ctx.fillStyle = rgb(snow);
          for (const [y, wide, keep] of [[oy - 9 * U, 1, 1 - 0.55 * slide], [oy + oh + 9 * U, 1.08, 1]]) {
            const x0 = cx - (ow / 2 + 16 * U) * wide, x1 = cx + (ow / 2 + 16 * U) * wide, hgt = 12 * U * keep;
            ctx.fillStyle = rgb(mixc(casing, C.night950, 0.2)); ctx.fillRect(x0, y, x1 - x0, 7 * U);
            ctx.fillStyle = rgb(snow);
            ctx.beginPath(); ctx.moveTo(x0, y + 1 * U);
            for (let k = 0; k <= 8; k++) { const x = lerp(x0, x1, k / 8); ctx.lineTo(x, y - hgt * (0.65 + 0.35 * Math.sin(k * 1.7 + w.seed))); }
            ctx.lineTo(x1, y + 1 * U); ctx.closePath(); ctx.fill();
          }
        },

        drawWedge(ctx, w, L, at, sp, inside) {
          if (w.openAt === null) return;
          const { U, ox, oy, ow, oh, cx } = L, t = at - w.openAt, b = this.box();
          const fever = this.feverUntil > 0 && w.openT < this.feverUntil && w.openT >= this.feverUntil - 2.5;
          const a = (t < 0.25 ? E.outSoft(t / 0.25) : lerp(1, 0.4, E.inOut((t - 0.25) / 0.6))) * (w.auto ? 0.6 : 1) * (fever ? 1.3 : 1);
          ctx.save(); ctx.globalCompositeOperation = 'lighter';
          if (inside) {
            const y0 = oy + oh + 11 * U, y1 = b.y + b.h, spread = (y1 - y0) * 0.45;
            const g = ctx.createLinearGradient(0, y0, 0, y1);
            g.addColorStop(0, rgb(C.gold, 0.32 * a)); g.addColorStop(1, rgb(C.gold, 0));
            ctx.fillStyle = g; quad(ctx, [ox, y0], [ox + ow, y0], [ox + ow + spread, y1], [ox - spread * 0.4, y1]); ctx.fill();
            const px = ox + ow * 0.22, py = y0 + (y1 - y0) * 0.3, pw = ow * 0.52, ph = (y1 - y0) * 0.42;
            const P = [[px, py], [px + pw, py], [px + pw * 1.3, py + ph], [px + pw * 0.2, py + ph]];
            const bl = (u, v) => [lerp(lerp(P[0][0], P[1][0], u), lerp(P[3][0], P[2][0], u), v), lerp(lerp(P[0][1], P[1][1], u), lerp(P[3][1], P[2][1], u), v)];
            ctx.fillStyle = rgb(C.warm, 0.16 * a);
            for (const [u0, u1] of [[0, 0.47], [0.53, 1]]) for (const [v0, v1] of [[0, 0.46], [0.54, 1]]) { quad(ctx, bl(u0, v0), bl(u1, v0), bl(u1, v1), bl(u0, v1)); ctx.fill(); }
          } else {
            glow(ctx, cx, oy + oh * 0.5, ow * 1.1, C.gold, 0.28 * a);
            const g = ctx.createLinearGradient(0, oy + oh, 0, b.y + b.h);
            g.addColorStop(0, rgb(C.gold, 0.22 * a)); g.addColorStop(1, rgb(C.gold, 0));
            ctx.fillStyle = g; quad(ctx, [ox, oy + oh], [ox + ow, oy + oh], [ox + ow * 1.3, b.y + b.h], [ox - ow * 0.3, b.y + b.h]); ctx.fill();
          }
          const n = (w.auto ? 8 : 14) + (fever ? 8 : 0), rnd = A.rng(Math.floor(w.seed));
          for (let k = 0; k < n; k++) {
            const u = rnd(), v = rnd(), ph = rnd() * TAU, sp2 = 0.4 + rnd() * 0.6;
            const y0 = inside ? oy + oh + 14 * U : oy + oh * 0.2, y1 = b.y + b.h - 10 * U;
            const yy = lerp(y0, y1, v) - (rm() ? 0 : ((t * 12 * sp2 * U) % (40 * U))), xx = lerp(ox, ox + ow, u) + (inside ? (yy - y0) * 0.3 * u : 0) + (rm() ? 0 : Math.sin(t * sp2 * 2 + ph) * 6 * U);
            sprite(ctx, 'mote', C.gold, xx, yy, (2.2 + rnd() * 1.6) * U * (fever ? 1.3 : 1), (0.35 + 0.5 * rnd()) * Math.min(1, t * 3) * a, true);
          }
          ctx.restore();
        },

        drawSun(ctx, L, at, sp, outside) {
          const t = at - this.finalAt, { ow, U } = L, k = this.payBig;
          const a = E.outSoft(clamp((t - 0.2) / (rm() ? 1 : 0.6), 0, 1));
          if (a <= 0) return;
          ctx.save(); ctx.globalCompositeOperation = 'lighter';
          ctx.translate(sp[0], sp[1] - (rm() ? 0 : 8 * U * a));
          const R0 = ow * (outside ? 1.6 : 1.1) * (0.8 + 0.2 * k);
          ctx.rotate(rm() ? 0 : t * TAU * 0.05);
          ctx.globalAlpha *= a * (outside ? 0.1 : 0.28) * (0.6 + 0.4 * k);
          ctx.drawImage(rays(), -R0, -R0, 2 * R0, 2 * R0);
          ctx.restore();
          if (!outside) { sprite(ctx, 'soft', C.gold, sp[0], sp[1] - 8 * U * a, ow * 0.24, 0.35 * a, true); sprite(ctx, 'soft', C.daylight, sp[0], sp[1] - 8 * U * a, ow * 0.06, 0.7 * a, true); }
        },

        drawTransition(ctx, b, at, cam) {
          const U = unit(b), p = this.slideP, speed = Math.sin(Math.PI * p);
          if (A.Art?.has('task_shutters_facade')) {
            const asp = A.Art.aspect('task_shutters_facade'), Hd = b.h * 1.05, Wd = Hd * asp, span = Wd * 0.85;
            const off = (cam * 0.4) % span;
            const fc = facadeArt(span, Hd, Wd, ctx.getTransform().a || 1);
            for (let x = b.x - off; x < b.x + b.w; x += span) ctx.drawImage(fc, x, b.y - b.h * 0.05, span, Hd);
            ctx.fillStyle = rgb(C.night900, 0.35); ctx.fillRect(b.x, b.y, b.w, b.h);
          } else {
            ctx.fillStyle = rgb(C.night800); ctx.fillRect(b.x, b.y, b.w, b.h);
            for (let k = -1; k < 6; k++) {
              const hx = b.x + k * 120 * U - ((cam * 0.4) % (120 * U)), hy = b.y + b.h * 0.42;
              ctx.fillStyle = rgb(mixc(C.night700, k % 2 ? C.amberDeep : C.silver600, 0.25)); ctx.fillRect(hx, hy, 110 * U, b.h * 0.4);
              ctx.fillStyle = rgb(C.silver300, 0.5); quad(ctx, [hx - 6 * U, hy], [hx + 55 * U, hy - 40 * U], [hx + 116 * U, hy], [hx + 116 * U, hy + 2 * U]); ctx.fill();
              ctx.fillStyle = rgb(C.glow, 0.5); ctx.fillRect(hx + 20 * U, hy + 30 * U, 18 * U, 22 * U); ctx.fillRect(hx + 70 * U, hy + 30 * U, 18 * U, 22 * U);
            }
            ctx.fillStyle = rgb(C.silver200, 0.5); ctx.fillRect(b.x, b.y + b.h * 0.82, b.w, b.h * 0.18);
          }
          const pitch = b.w * PITCH;
          for (let k = this.i - 1; k <= this.i + 1; k++) {
            const xg = k * pitch + b.w + (pitch - b.w) / 2, sx = b.x + b.w / 2 + (xg - b.w / 2 - cam) * 1.7;
            if (sx < b.x - 40 * U || sx > b.x + b.w + 40 * U) continue;
            const tw = 16 * U;
            ctx.fillStyle = rgb(mixc(C.silver100, C.night800, 0.35)); ctx.fillRect(sx - tw / 2, b.y, tw, b.h);
            ctx.fillStyle = rgb(C.night950, 0.75);
            for (let j = 0; j < 9; j++) ctx.fillRect(sx - tw / 2 + ((j * 7) % 3) * 3 * U, b.y + ((j * 53 + k * 31) % 100) / 100 * b.h, (6 + (j % 3) * 3) * U, 2.5 * U);
          }
          if (speed > 0.05) {
            const rnd = A.rng(17);
            for (let k = 0; k < 16; k++) {
              const x = b.x + (((rnd() * 3 * b.w - cam * 1.3) % b.w) + b.w) % b.w, y = b.y + rnd() * b.h;
              ctx.strokeStyle = rgb(C.silver050, 0.35 * speed); ctx.lineWidth = 1.6 * U;
              ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 26 * U * speed, y); ctx.stroke();
            }
          }
        },

        drawCard(ctx, w, at) {
          const L = this.L(w);
          if (w.m === 'pair') this.drawPairCard(ctx, w, L, at); else this.drawBlindCard(ctx, w, L, at);
          const b = this.box(), U = L.U;
          for (const [x, dir] of [[b.x, 1], [b.x + b.w, -1]]) {
            const g = ctx.createLinearGradient(x, 0, x + dir * 22 * U, 0);
            g.addColorStop(0, rgb(C.night950, 0.55)); g.addColorStop(1, rgb(C.night950, 0));
            ctx.fillStyle = g; ctx.fillRect(dir > 0 ? x : x - 22 * U, b.y, 22 * U, b.h);
          }
        },

        draw(ctx, b, at) {
          this.b = b;
          if (!this.inited) return;
          const ga = ctx.globalAlpha;
          if (ga > 0.99) return this.paint(ctx, b, at);
          if (ga < 0.01) return;
          const c = ctx.canvas, off = LAYER.c || (LAYER.c = document.createElement('canvas'));
          if (off.width !== c.width || off.height !== c.height) { off.width = c.width; off.height = c.height; }
          const ox = off.getContext('2d');
          ox.setTransform(1, 0, 0, 1, 0, 0); ox.clearRect(0, 0, off.width, off.height);
          ox.setTransform(ctx.getTransform());
          this.paint(ox, b, at);
          ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = ga; ctx.drawImage(off, 0, 0); ctx.restore();
        },

        paint(ctx, b, at) {
          const U = unit(b), pitch = b.w * PITCH;
          ctx.save();
          ctx.beginPath(); ctx.roundRect(b.x, b.y, b.w, b.h, 22); ctx.clip();
          ctx.fillStyle = rgb(C.night900); ctx.fillRect(b.x, b.y, b.w, b.h);
          const sl = this.slide && this.slideP > 0 ? this.slideP : 0;
          const breathe = rm() ? 0 : 0.03 * Math.sin(Math.PI * clamp((at - this.breathAt) / beat.period(), 0, 1));
          let zoom = 1;
          if (this.finalAt !== null && !this.cur().auto && !rm()) zoom = 1 + 0.15 * bump(at - this.finalAt, 0.22, 0.6);
          const cur = this.cur(), L = this.L(cur);
          ctx.translate(L.cx, L.cy); ctx.scale(zoom * (1 + breathe), zoom * (1 + breathe)); ctx.translate(-L.cx, -L.cy);
          if (sl > 0 && rm()) {
            this.drawCard(ctx, cur, at);
            ctx.globalAlpha *= E.outSoft(sl); this.drawCard(ctx, this.wins[this.i + 1], at);
          } else if (sl > 0) {
            const cam = (this.i + E.inOut(sl)) * pitch;
            this.drawTransition(ctx, b, at, cam);
            for (const k of [this.i, this.i + 1]) {
              const dx = k * pitch - cam;
              if (dx > -b.w && dx < b.w) { ctx.save(); ctx.translate(dx, 0); this.drawCard(ctx, this.wins[k], at); ctx.restore(); }
            }
          } else this.drawCard(ctx, cur, at);
          if (this.done && this.sunPt) this.drawSun(ctx, L, at, this.sunPt, true);
          if (this.done) {
            const t = at - this.finalAt, wash = rm() ? E.inOut(clamp(t / 1, 0, 1)) : E.outSoft(clamp((t - 0.3) / 0.7, 0, 1));
            ctx.save(); ctx.globalCompositeOperation = 'lighter';
            ctx.fillStyle = rgb(C.daylight, this.washPeak * wash * (0.7 + 0.3 * this.payBig)); ctx.fillRect(b.x, b.y, b.w, b.h);
            ctx.restore();
          }
          this.drawCue(ctx, cur, at);
          const tm = this.touchMark;
          if (tm && at - tm.at < 0.35) ring(ctx, tm.x, tm.y, (10 + (rm() ? 8 : 18 * E.outSoft((at - tm.at) / 0.35))) * U, C.flame, 0.35 * (1 - (at - tm.at) / 0.35), 1.6 * U);
          ctx.restore();
        },

        drawCue(ctx, w, at) {
          if (w.st !== 'ready' || this.drag || this.slide) return;
          const idleS = this.autoPhase ? 0.9 : this.learned[w.m] ? 3.5 : 1.2, since = Math.min(this.t - this.lastTouch, at - w.arrAt);
          if (since < idleS) return;
          const L = this.L(w), U = L.U, a = clamp((since - idleS) / 0.4, 0, 1);
          if (w.m === 'pair') { dragCue(ctx, J.line(L.cx + 6 * U, L.cy, L.cx + L.travel * 0.95, L.cy), U, at, a, 1.6); return; }
          const ry = L.oy + L.rest + 7 * U + 16 * U + L.rr, y0 = w.m === 'blind_up' ? 2 * L.cy - ry : ry, dir = w.m === 'blind_up' ? -1 : 1;
          dragCue(ctx, J.line(L.ringX, y0, L.ringX, y0 + dir * L.travel * 0.9), U, at, a, 1.6);
        },
      });
    },
  });
})();
