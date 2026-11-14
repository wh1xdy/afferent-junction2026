(() => {
  const { clamp, lerp, rgb, mixc } = A;
  const J = A.J, { C, sprite, disc, unit, touch, dots, base, finish, fx, hap, sfx } = J;
  const E = J.ease, rm = J.rm, R = Math.random, TAU = Math.PI * 2;
  const ID = 'loyly', SLOW = 2.0, GRACE = 1.05, CARRY = 0.5, TILT = 0.3, HOME = 1.3, STALL = 0.6;
  const ART = { ladle: 'task_loyly_ladle', bucket: 'task_loyly_bucket', kiuas: 'task_loyly_kiuas', fog: 'task_loyly_panel_fog' };
  const has = n => !!A.Art?.has?.(n);
  const LD = { w: 768, h: 228, end: [735, 28], bowl: [128, 118], lip: [18, 76], mouth: [128, 72, 104, 34] };
  const L_ROT = Math.atan2(LD.bowl[1] - LD.end[1], LD.end[0] - LD.bowl[0]);
  const L_LEN = Math.hypot(LD.end[0] - LD.bowl[0], LD.bowl[1] - LD.end[1]);
  const HOT = mixc(C.amber, C.amberDeep, 0.5);

  A.Skill?.define(ID, {
    tiers: [1, 2],
    bloom: { v0: 2.6, v1: 4.5, geo: true, cat: 'patience' },
    water: { v0: 1.6, v1: 1.05, geo: true, cat: 'patience' },
    even: { v0: 0.6, v1: 0.25, geo: true, cat: 'precision' },
    tol: { v0: 40, v1: 16, geo: true, cat: 'precision' },
    stones: { v0: 8, v1: 12, int: true, cat: 'load' },
    pours: { steps: [[0, 2], [0.6, 3]], cat: 'load' },
  });
  const ax = (n, fb) => (A.Skill ? A.Skill.axis(ID, n, fb) : fb);

  const toLocal = (G, th, s, p) => {
    const a = th - L_ROT, x = -(p[0] - LD.end[0]) * s, y = (p[1] - LD.end[1]) * s;
    return [G[0] + x * Math.cos(a) - y * Math.sin(a), G[1] + x * Math.sin(a) + y * Math.cos(a)];
  };
  const between = (a, b, x) => (a - x) * (b - x) <= 0 && a !== b;

  const stoneCache = new Map();
  const stoneSpr = (r, kind) => {
    const S = Math.max(4, Math.round(r)), key = S + kind;
    let c = stoneCache.get(key);
    if (c) return c;
    c = document.createElement('canvas'); c.width = c.height = 2 * S + 4;
    const x = c.getContext('2d'), m = S + 2, g = x.createRadialGradient(m - S * 0.35, m - S * 0.45, S * 0.08, m, m, S);
    const stops = {
      d: [[0, mixc(C.stone, C.silver400, 0.3)], [0.55, C.stone], [1, C.stoneD]],
      f: [[0, C.stone], [0.6, C.stoneD], [1, mixc(C.stoneD, C.night950, 0.6)]],
      l: [[0, mixc(C.sun, C.glow, 0.3)], [0.25, C.amber], [0.65, C.amberDeep], [1, mixc(C.amberDeep, C.night950, 0.55)]],
    }[kind];
    for (const [t, col] of stops) g.addColorStop(t, rgb(col));
    x.fillStyle = g; x.beginPath(); x.ellipse(m, m, S, S * 0.8, 0, 0, TAU); x.fill();
    stoneCache.set(key, c);
    return c;
  };
  const stone = (ctx, x, y, r, kind, a = 1) => {
    if (a <= 0.01) return;
    const c = stoneSpr(r, kind), k = r / (c.width / 2 - 2), ga = ctx.globalAlpha;
    ctx.globalAlpha = ga * a;
    ctx.drawImage(c, x - c.width / 2 * k, y - c.height / 2 * k, c.width * k, c.height * k);
    ctx.globalAlpha = ga;
  };

  const roomCache = { key: '', c: null };
  const room = (b, gy, bare) => {
    const dpr = Math.min(2, devicePixelRatio || 1), key = `${b.w | 0}x${b.h | 0}x${gy - b.y | 0}x${bare}x${dpr}`;
    if (roomCache.key === key) return roomCache.c;
    const c = document.createElement('canvas'), w = b.w, h = b.h, fy = gy - b.y, U = unit(b);
    c.width = w * dpr; c.height = h * dpr;
    const x = c.getContext('2d');
    x.scale(dpr, dpr);
    const wall = x.createLinearGradient(0, 0, 0, fy);
    wall.addColorStop(0, rgb(C.night950, 0)); wall.addColorStop(0.45, rgb(C.woodD, 0.28)); wall.addColorStop(1, rgb(C.wood, 0.42));
    x.fillStyle = wall; x.fillRect(0, 0, w, fy);
    for (let y = fy - 20 * U; y > 0 && !bare; y -= 20 * U) {
      const a = clamp(y / fy, 0, 1);
      x.fillStyle = rgb(C.night950, 0.4 * a); x.fillRect(0, y, w, 1.2 * U);
      x.fillStyle = rgb(C.woodL, 0.07 * a); x.fillRect(0, y + 1.2 * U, w, 1 * U);
    }
    const fl = x.createLinearGradient(0, fy, 0, h);
    fl.addColorStop(0, rgb(C.woodD, 0.95)); fl.addColorStop(0.3, rgb(C.night950, 0.8)); fl.addColorStop(1, rgb(C.night950, 0.35));
    x.fillStyle = fl; x.fillRect(0, fy, w, h - fy);
    x.fillStyle = rgb(C.woodL, 0.3); x.fillRect(0, fy, w, 1.2 * U);
    const by = h * 0.36;
    if (!bare) {
      x.fillStyle = rgb(C.wood, 0.5); x.fillRect(0, by, w, 7 * U);
      x.fillStyle = rgb(C.woodL, 0.18); x.fillRect(0, by, w, 1.2 * U);
      x.fillStyle = rgb(C.night950, 0.35); x.fillRect(0, by + 7 * U, w, 14 * U);
      for (const sx of [0.08, 0.5, 0.92]) { x.fillStyle = rgb(C.woodD, 0.45); x.fillRect(w * sx - 4 * U, by + 7 * U, 8 * U, fy - by - 7 * U); }
    } else {
      x.globalCompositeOperation = 'destination-in';
      x.setTransform(dpr * w / h, 0, 0, dpr, 0, 0);
      const m = x.createRadialGradient(h / 2, h / 2, h * 0.3, h / 2, h / 2, h * 0.56);
      m.addColorStop(0, '#000'); m.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = m; x.fillRect(0, 0, h, h);
    }
    return Object.assign(roomCache, { key, c }).c;
  };

  const kCache = { key: '', c: null };
  const kiuasImg = (w, h) => {
    if (!has(ART.kiuas)) return null;
    const dpr = Math.min(2, devicePixelRatio || 1), key = `${w | 0}x${h | 0}x${dpr}`;
    if (kCache.key === key) return kCache.c;
    const c = document.createElement('canvas'), x = c.getContext('2d');
    c.width = w * dpr; c.height = h * dpr;
    x.scale(dpr, dpr);
    A.Art.draw(x, ART.kiuas, 0, 0, w, h, 0.8, 0.62, 1);
    x.globalCompositeOperation = 'source-atop';
    const g = x.createLinearGradient(0, h * 0.7, 0, h);
    g.addColorStop(0, rgb(C.night950, 0)); g.addColorStop(0.45, rgb(C.night950, 0.75)); g.addColorStop(1, rgb(C.night950, 0.95));
    x.fillStyle = g; x.fillRect(0, h * 0.7, w, h * 0.3);
    return Object.assign(kCache, { key, c }).c;
  };

  const procBucket = (ctx, x, y, w, h) => {
    const cx = x + w / 2, bw = w / 2, top = y + h * 0.18, U = h / 86;
    ctx.save();
    ctx.beginPath(); ctx.moveTo(cx - bw, top); ctx.lineTo(cx + bw, top); ctx.lineTo(cx + bw * 0.82, y + h); ctx.lineTo(cx - bw * 0.82, y + h); ctx.closePath();
    const g = ctx.createLinearGradient(cx - bw, 0, cx + bw, 0);
    g.addColorStop(0, rgb(C.woodD)); g.addColorStop(0.35, rgb(C.woodL)); g.addColorStop(1, rgb(C.woodD));
    ctx.fillStyle = g; ctx.fill(); ctx.clip();
    ctx.strokeStyle = rgb(C.night950, 0.5); ctx.lineWidth = 1.2 * U;
    for (let i = -3; i <= 3; i++) { ctx.beginPath(); ctx.moveTo(cx + i * bw / 3.5, top); ctx.lineTo(cx + i * bw / 4.2, y + h); ctx.stroke(); }
    ctx.fillStyle = rgb(C.silver700, 0.95);
    ctx.fillRect(cx - bw, top + h * 0.22, 2 * bw, 5 * U); ctx.fillRect(cx - bw, top + h * 0.6, 2 * bw, 5 * U);
    ctx.restore();
    ctx.fillStyle = rgb(C.tealDeep, 0.8); ctx.beginPath(); ctx.ellipse(cx, top + 1 * U, bw * 0.9, 7 * U, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = rgb(C.woodD); ctx.lineWidth = 3 * U; ctx.beginPath(); ctx.ellipse(cx, top, bw, 8 * U, 0, 0, TAU); ctx.stroke();
  };

  const procKiuas = (ctx, x, y, w, h) => {
    const U = h / 146;
    ctx.fillStyle = rgb(C.night700); ctx.beginPath(); ctx.roundRect(x + w * 0.08, y + h * 0.16, w * 0.84, h * 0.72, 5 * U); ctx.fill();
    ctx.strokeStyle = rgb(C.silver700, 0.9); ctx.lineWidth = 2 * U; ctx.stroke();
    ctx.fillStyle = rgb(C.silver700); ctx.fillRect(x + w * 0.04, y + h * 0.12, w * 0.92, h * 0.07);
    ctx.fillStyle = rgb(C.night950); ctx.fillRect(x + w * 0.2, y + h * 0.48, w * 0.28, h * 0.22);
    ctx.fillStyle = rgb(C.night800); ctx.fillRect(x + w * 0.12, y + h * 0.88, w * 0.1, h * 0.12); ctx.fillRect(x + w * 0.78, y + h * 0.88, w * 0.1, h * 0.12);
    ctx.strokeStyle = rgb(C.silver600, 0.7); ctx.lineWidth = 1.6 * U;
    ctx.beginPath(); ctx.moveTo(x + w * 0.1, y + h * 0.12); ctx.lineTo(x + w * 0.1, y); ctx.lineTo(x + w * 0.9, y); ctx.lineTo(x + w * 0.9, y + h * 0.12); ctx.stroke();
  };

  const procLadle = ctx => {
    ctx.strokeStyle = rgb(C.woodL); ctx.lineWidth = 30; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(735, 28); ctx.lineTo(250, 92); ctx.stroke();
    ctx.fillStyle = rgb(C.woodL); ctx.beginPath(); ctx.ellipse(128, 76, 120, 110, 0, 0, Math.PI); ctx.closePath(); ctx.fill();
    ctx.fillStyle = rgb(C.woodD); ctx.beginPath(); ctx.ellipse(128, 74, 118, 40, 0, 0, TAU); ctx.fill();
  };

  A.defineTask(ID, {
    modes: ['calm'], role: 'Cooking Mama pour, Flower',
    make(k) {
      A.Skill?.progress(ID, 0, 2);
      const need = Math.round(ax('pours', 2));
      A.Skill?.progress(ID, 0, need);
      const g = base(ID, 6 + need * 8, {
        need, k, outro: 1.5, lag: lerp(0.08, 0.16, k), decay: lerp(0.25, 0.15, k), nStones: Math.round(ax('stones', 9)),
        extra: { v: 2, bloom_s: null, pour_s: [], stones_warmed: [], stones_total: 0, finger_speed_cv: [], water_left: [], start: [], cancels: 0 },
        state: 'home', pour: null, water: 1, hist: [], prevLx: null, stones: [], filler: [], arc: null, L: null,
        steam: 0, cloud: null, fog: null, ember: 0.5, nextBloom: ax('bloom', 3.1),
        vis: { gx: {}, gy: {}, th: { x: HOME }, grabAt: -9, rippleAt: -9, pokeAt: -9, swingAt: -9, wispAt: 0, dripAt: 0, hissAt: 0, water: 1 },
        bot: null, doneAt: null,

        lay(b) {
          const key = `${b.x}|${b.y}|${b.w}|${b.h}`;
          if (this.L?.key === key) return this.L;
          const U = unit(b), gy = b.y + b.h * 0.86;
          const bh = 98 * U, bw = bh * (has(ART.bucket) ? A.Art.aspect(ART.bucket) : 0.88), bx = b.x + b.w * 0.16;
          const kw = b.w * 0.7, kh = kw / (has(ART.kiuas) ? A.Art.aspect(ART.kiuas) : 1.51), kx = b.x + b.w * 0.66, ky = gy - kh * 0.97;
          const bed = Math.min(b.w * 0.45, kw * 0.7), Lh = 84 * U;
          this.L = {
            key, b, U, gy, Lh, s: Lh / L_LEN,
            bucket: [bx - bw / 2, gy - bh, bw, bh], water: [bx, gy - bh * 0.67, bw * 0.4],
            kiuas: [kx - kw / 2, ky, kw, kh], fire: [kx - kw / 2 + kw * 0.33, ky + kh * 0.6, kw * 0.14],
            x0: kx - bed / 2, x1: kx + bed / 2, tray: ky + kh * 0.17, pourH: 40 * U,
          };
          this.L.lipOff = this.lipAt([0, 0], CARRY + TILT);
          if (!this.stones.length) this.shuffle(false);
          this.extra.stones_total = this.stones.length;
          return this.L;
        },
        lipAt(G, th) { return toLocal(G, th, this.L.s, LD.lip); },
        bowlAt(G, th) { return toLocal(G, th, this.L.s, LD.bowl); },
        homeGrip() { const L = this.L, [x, y] = L.water; return [x - L.Lh * Math.cos(HOME), y + 6 * L.U - L.Lh * Math.sin(HOME)]; },
        surface(x) { const L = this.L, a = this.arc, q = clamp((x - L.x0) / (L.x1 - L.x0), 0, 1); return L.tray - a.h * Math.sin(Math.PI * q) + a.tilt * (q - 0.5) - a.r * 1.25; },
        lineY(x) { return this.surface(x) - this.L.pourH; },

        shuffle(anim = true) {
          const L = this.L, N = this.nStones, sp = (L.x1 - L.x0) / N, U = L.U;
          this.arc = { h: (10 + 14 * R()) * U, tilt: (R() - 0.5) * 22 * U, r: sp * 0.8 };
          const at = J.at, prev = this.stones;
          this.stones = Array.from({ length: N }, (_, i) => {
            const q = (i + 0.5) / N, r = sp * 0.8 * (0.86 + 0.26 * R()), x = L.x0 + (i + 0.5) * sp + (R() - 0.5) * sp * 0.2;
            const y = L.tray - this.arc.h * Math.sin(Math.PI * q) + this.arc.tilt * (q - 0.5) - r * 0.45;
            const o = prev[i];
            return { i, x, y, r, ox: o ? o.x : x, oy: o ? o.y : y, mat: anim ? at : -9, w0: o ? o.w1 : 0, w1: o ? o.w1 : 0, wat: -9 };
          });
          this.filler = [];
          for (let i = 0; i <= N; i++) {
            const x = L.x0 + i * sp + (R() - 0.5) * sp * 0.3, q = clamp(i / N, 0, 1);
            this.filler.push({ x, y: L.tray - this.arc.h * Math.sin(Math.PI * q) * 0.45 + this.arc.tilt * (q - 0.5) * 0.5 + sp * 0.12, r: sp * 0.66 });
          }
          if (anim) hap('tick');
        },

        fill(t, how) {
          const L = this.L, bloom = ax('bloom', 3.1), water = ax('water', 1.4), even = ax('even', 0.45), tol = ax('tol', 30);
          if (this.extra.bloom_s === null) this.extra.bloom_s = Math.round(bloom * 1000) / 1000;
          this.pour = { t0: t, how, water: 1, entry: 0, seen: [], warmed: 0, spits: 0, spd: [], thr: (L.x1 - L.x0) / bloom, tolPx: tol * L.U, even, bloom, drain: 1 / (water * bloom), dry: false, stallI: -1, stallT: 0 };
          this.water = 1; this.nextBloom = bloom;
          if (how === 'dip') { this.shuffle(true); this.vis.rippleAt = J.at; hap('light'); sfx('loyly_dip'); }
        },

        rawLip() { const f = this.finger; return f ? [f[0] + this.L.lipOff[0], f[1] + this.L.lipOff[1]] : null; },
        speed(t) {
          const h = this.hist;
          if (h.length < 2) return 0;
          const T = t - 0.15, last = h[h.length - 1];
          let x0 = h[0][1];
          for (let i = h.length - 1; i > 0; i--) {
            if (h[i - 1][0] <= T) { const a = h[i - 1], c = h[i]; x0 = c[0] === a[0] ? c[1] : lerp(a[1], c[1], clamp((T - a[0]) / (c[0] - a[0]), 0, 1)); break; }
          }
          return Math.abs(last[1] - x0) / 0.15;
        },
        pouring() {
          const P = this.pour, lip = this.rawLip();
          if (!P || !lip || P.water <= 0 || this.state !== 'carry') return false;
          const L = this.L;
          return lip[0] >= L.x0 && lip[0] <= L.x1 && lip[1] > this.lineY(lip[0]) - 3 * P.tolPx;
        },

        press(x, y, t) {
          this.lastIn = this.t;
          const L = this.L;
          if (this.done || !L) return;
          this.finger = [x, y]; this.hist = [[t, x, y]];
          const G = [this.vis.gx.x ?? 0, this.vis.gy.x ?? 0], bowl = this.bowlAt(G, this.vis.th.x);
          const near = Math.hypot(x - G[0], y - G[1]) < 70 * L.U || Math.hypot(x - bowl[0], y - bowl[1]) < 70 * L.U || x < L.x0 - 8 * L.U;
          if (this.state === 'carry' || !near) { this.vis.pokeAt = J.at; this.poke = [x, y]; return; }
          this.state = 'carry';
          this.fill(t, 'grab');
          this.prevLx = this.rawLip()[0];
          this.vis.grabAt = J.at; this.vis.rippleAt = J.at;
          hap('light'); sfx('loyly_grab');
        },
        drag(x, y, t) {
          if (!this.finger || this.done) return;
          this.lastIn = this.t;
          this.finger = [x, y];
          this.hist.push([t, x, y]);
          while (this.hist.length > 2 && t - this.hist[1][0] > 0.4) this.hist.shift();
          if (this.state !== 'carry') return;
          const L = this.L, [lx, ly] = this.rawLip(), P = this.pour;
          if (!P) {
            const [wx, wy, wr] = L.water, bowl = this.bowlAt(this.finger, CARRY);
            if (Math.abs(bowl[0] - wx) < wr * 1.4 && bowl[1] > wy - 30 * L.U) this.fill(t, 'dip');
            this.prevLx = lx;
            return;
          }
          if (!P.entry && this.pouring()) P.entry = lx - L.x0 < L.x1 - lx ? 1 : -1;
          if (P.entry && this.prevLx !== null) {
            const spd = this.speed(t);
            for (const s of this.stones) if (!P.seen[s.i] && between(this.prevLx, lx, s.x)) { P.seen[s.i] = 1; this.cross(s, spd, ly); }
            if ((P.entry > 0 && lx >= L.x1) || (P.entry < 0 && lx <= L.x0)) this.complete(t);
          }
          this.prevLx = lx;
        },
        release(t) {
          if (!this.finger) return;
          this.finger = null; this.hist = [];
          if (this.state !== 'carry') return;
          if (this.pour) this.extra.cancels++;
          this.pour = null;
          this.state = 'swing'; this.vis.swingAt = J.at;
        },

        cross(s, spd, ly) {
          const P = this.pour, L = this.L;
          if (P.water <= 0) return;
          const onLine = Math.abs(ly - this.lineY(s.x)) <= P.tolPx;
          if (spd <= P.thr * GRACE && onLine) {
            P.warmed++;
            const at = J.at, cur = this.warmth(s, at);
            Object.assign(s, { w0: cur, w1: Math.min(1, s.w1 + 1 / this.need), wat: at });
            fx.rise(s.x, s.y + s.r * 0.3, 4, C.amber, { life: 0.6 });
            for (let i = 0; i < fx.n(3); i++) this.puff(s.x + (R() - 0.5) * s.r, s.y - s.r * 0.6, 0.42);
            J.bloom(s.x, s.y, 34 * L.U, C.amber, 0.35, 0.15, 0.5);
            hap('tick'); sfx('loyly_hiss', { step: P.warmed });
          } else {
            P.spits++;
            if (!rm()) for (let i = 0; i < 3; i++) fx.add({ x: s.x + (R() - 0.5) * 4, y: s.y - s.r - 18 * L.U * R(), vx: 0, vy: 70, g: 420, life: 0.4, size: [1.6, 1.3], alpha: [0.7, 0.2], kind: 'mote', add: false, c: C.silver400 });
            sfx('loyly_tsk');
          }
        },
        puff(x, y, k = 1, o = {}) {
          const U = this.L.U;
          const lum = { add: true, alpha: q => 0.13 * Math.sin(Math.PI * Math.min(1, q * 1.1)), ...o };
          if (rm()) fx.puff(x, y, C.silver200, U * k, { vx: 0, vy: 0, size: [70 * U * k, 85 * U * k], sway: null, ...lum });
          else fx.puff(x, y, C.silver200, U * k, lum);
        },
        warmth(s, at) { return lerp(s.w0, s.w1, E.outSoft((at - s.wat) / 0.35)); },

        complete(t) {
          const P = this.pour, N = this.stones.length, f = P.warmed / N, dur = t - P.t0;
          const m = P.spd.length ? P.spd.reduce((a, b) => a + b, 0) / P.spd.length : 0;
          const cv = m > 0 ? Math.sqrt(P.spd.reduce((a, b) => a + (b - m) ** 2, 0) / P.spd.length) / m : 1;
          const grade = f >= 1 && !P.dry && cv <= P.even ? 'perfect' : f >= 0.75 ? 'good' : f >= 0.4 ? 'barely' : 'miss';
          const slow = dur >= SLOW, r3 = x => Math.round(x * 1000) / 1000;
          if (slow) this.items++; else this.errors++;
          const X = this.extra;
          X.pour_s.push(r3(dur)); X.stones_warmed.push(P.warmed); X.finger_speed_cv.push(r3(cv)); X.water_left.push(r3(P.water)); X.start.push(P.how);
          const tr = A.Skill?.trial(ID, grade);
          this.pour = null;
          this.payoff(slow, grade, Math.min(1, dur / P.bloom), f, tr);
          if (slow && A.Skill?.progress(ID, this.items, this.need)) J.stinger();
          if (this.items >= this.need) { finish(this, t); this.doneAt = J.at; this.release(t); }
        },

        payoff(slow, grade, q, f, tr) {
          const L = this.L, at = J.at, cx = (L.x0 + L.x1) / 2, cy = L.tray - 20 * L.U, fever = !!tr?.fever;
          if (!slow) {
            this.puff(cx, cy, 0.5, { life: 1.4 });
            this.steam = Math.max(this.steam, 0.25);
            sfx('loyly_puff');
            return;
          }
          const size = Math.max(this.items >= this.need ? 0.65 : 0.3, clamp(q * (0.45 + 0.55 * f), 0, 1)) * (fever ? 1.15 : 1);
          this.steam = 1;
          this.cloud = { at, size, puffs: Array.from({ length: 7 }, (_, i) => ({ dx: (i / 3 - 1) * (0.85 + 0.2 * R()), dy: R(), r: 60 + 50 * R(), d: Math.abs(i - 3) * 0.07 + 0.05 * R() })) };
          const gate = J.flash.request(0.4, 0.22 * size);
          if (gate.ok) this.fog = { at, peak: Math.min(0.22 * size, gate.peak), hold: fever ? 1.6 : 1 };
          for (let i = 0; i < fx.n(6); i++) this.puff(lerp(L.x0, L.x1, R()), cy - R() * 20 * L.U, 0.9 * size, { life: 2.6 });
          J.bloom(cx, cy, 120 * L.U, C.glow, 0.3 + 0.25 * size, 0.6, 1);
          if (grade === 'perfect') { J.bloom(cx, cy - 30 * L.U, 22 * L.U, C.sun, 0.8, 0.12, 0.5); fx.burst(cx, cy - 10 * L.U, 8, C.sun, 90, { kind: 'spark', size: [5, 1] }); }
          this.ember = Math.min(1, this.ember + 0.12 + (tr?.up ? 0.1 : 0));
          hap.seq([['medium', 0], ['light', 140], ['tick', 200], ['tick', 280]]);
          if (grade === 'perfect') hap.seq([['tick', 40]]);
          sfx('loyly_bloom', { piano: [this.items > 1 ? -2 : 0, 0.12] });
          A.session?.kick?.(0.5);
          const H = A.World?.hooks, mark = H?.landmarks?.().find(m => m.kind === 'sauna');
          if (mark) H.lightLandmark(mark.id, Math.min(1, 0.35 * this.items));
        },

        anim(dt) {
          const v = this.vis, L = this.L, at = J.at;
          if (!L) return;
          this.steam = Math.max(0, this.steam - dt * this.decay * (this.done ? 0.3 : 1));
          const carry = this.state === 'carry' && this.finger, home = this.homeGrip();
          let tx, ty, th;
          if (carry) { [tx, ty] = this.finger; th = CARRY + (this.pouring() ? TILT : 0); }
          else { [tx, ty] = home; th = HOME; ty -= 6 * L.U * Math.sin(Math.PI * clamp((at - v.pokeAt) / 0.35, 0, 1)); }
          const f = carry ? 1 / (Math.PI * this.lag) : 1.25;
          if (rm() && carry) { v.gx = { x: tx, v: 0 }; v.gy = { x: ty, v: 0 }; }
          else { J.spring(v.gx, tx, f, 1, dt); J.spring(v.gy, ty, f, 1, dt); }
          const lean = clamp(-(v.gx.v || 0) / L.U * 0.0016, -0.15, 0.15);
          J.spring(v.th, th + (carry ? lean : 0), carry ? 3 : 1.4, 0.8, dt);
          if (this.state === 'swing' && at - v.swingAt > 0.8) { this.state = 'home'; this.water = 1; }
          v.water = lerp(v.water, this.pour ? this.pour.water : this.state === 'carry' ? this.water : 1, 1 - Math.exp(-dt * 10));
          if (this.pour && this.pouring()) {
            const P = this.pour, lip = this.rawLip(), s = this.stones.find(s => Math.abs(s.x - lip[0]) < s.r);
            P.spd.push(this.speed(A.now()));
            if (s && s.i === P.stallI) P.stallT += dt; else { P.stallI = s ? s.i : -1; P.stallT = 0; }
            const stall = P.stallT > STALL;
            P.water = Math.max(0, P.water - dt * P.drain * (stall ? 2 : 1));
            this.water = P.water;
            if (P.water <= 0) P.dry = true;
            if (stall && at - v.hissAt > 0.25) { v.hissAt = at; this.puff(s.x, s.y - s.r, 0.5); this.puff(s.x + s.r * 0.5, s.y - s.r, 0.4); sfx('loyly_hiss2'); }
          }
          if (!rm() && carry && v.water > 0.05 && !this.pouring() && at - v.dripAt > 0.4) {
            v.dripAt = at;
            const lip = this.lipAt([v.gx.x, v.gy.x], v.th.x);
            fx.drip(lip[0], lip[1], C.ice, { life: 0.5 });
          }
          if (at - v.wispAt > 1.6) { v.wispAt = at; const s = this.stones[(R() * this.stones.length) | 0]; if (s) this.puff(s.x, s.y - s.r, 0.3 + 0.2 * s.w1, { life: 2 }); }
        },

        update(dt, now) {
          this.lay(this.L?.b || A.session.box());
          this.anim(dt);
          J.border(this.items / this.need);
        },
        outroUpdate(dt) { this.anim(dt); },

        down(u, v, t, d) { const b = this.L?.b; if (b) this.press(b.x + u * b.w, b.y + v * b.h, d?.ts ?? t); },
        move(u, v, t, d) { const b = this.L?.b; if (b) this.drag(b.x + u * b.w, b.y + v * b.h, d?.ts ?? t); },
        up(u, v, t, d) { this.release(d?.ts ?? t); },

        plan() {
          const L = this.L, U = L.U, bloom = this.nextBloom, q = R();
          const grade = q < 0.15 ? 'perfect' : q < 0.7 ? 'good' : q < 0.8 ? 'barely' : 'miss';
          const burst = { perfect: null, good: [0.35, 0.58], barely: [0.15, 0.72], miss: [0, 1] }[grade];
          const water = ax('water', 1.4), T = Math.min(bloom + 0.4, bloom * water * 0.95), v0 = (L.x1 - L.x0) / T;
          const off = L.lipOff, at = x => [x - off[0], this.lineY(clamp(x, L.x0, L.x1)) - off[1]];
          const pts = [[0, ...this.homeGrip()], [0.45, ...at(L.x0 - 10 * U)]];
          let t = 0.45, xPrev = L.x0 - 10 * U;
          for (let i = 1; i <= 48; i++) {
            const x = lerp(L.x0 - 10 * U, L.x1 + 16 * U, i / 48), qx = (x - L.x0) / (L.x1 - L.x0);
            const fast = burst && qx >= burst[0] && qx <= burst[1];
            t += (x - xPrev) / (v0 * (fast ? (grade === 'miss' ? 6 : 3.5) : 0.97)); xPrev = x;
            pts.push([t, ...at(x)]);
          }
          return { t: 0, pts, end: t + 0.05 };
        },
        auto(dt, now) {
          if (!this.L || this.done) return;
          if (!this.bot) {
            if (this.state === 'carry' || (this.state === 'swing' && J.at - this.vis.swingAt < 0.45)) return;
            this.bot = this.plan();
            const p = this.bot.pts[0];
            this.press(p[1], p[2], now);
            return;
          }
          const B = this.bot, P = B.pts;
          B.t += dt;
          let i = 1;
          while (i < P.length - 1 && P[i][0] < B.t) i++;
          const a = P[i - 1], c = P[i], q = clamp((B.t - a[0]) / Math.max(1e-6, c[0] - a[0]), 0, 1);
          this.drag(lerp(a[1], c[1], q), lerp(a[2], c[2], q), now);
          if (B.t >= B.end && !this.done) { this.release(now); this.bot = null; }
          if (this.done) this.bot = null;
        },

        draw(ctx, b, at) {
          const L = this.lay(b), U = L.U, v = this.vis;
          const bg = room(b, L.gy, !!this.bare);
          ctx.drawImage(bg, b.x, b.y, b.w, b.h);
          const ember = this.ember * (rm() ? 1 : 0.86 + 0.14 * Math.sin(at * 1.3)) + 0.25 * this.steam;
          const [fx0, fy0, fr] = L.fire;
          sprite(ctx, 'soft', C.amberDeep, fx0, L.gy, b.w * 0.42, 0.18 + 0.22 * ember, true, 1.2, 0.5);
          sprite(ctx, 'soft', C.amberDeep, L.kiuas[0] + L.kiuas[2] / 2, L.tray, b.w * 0.36, 0.08 + 0.2 * ember, true);

          const G = [v.gx.x ?? this.homeGrip()[0], v.gy.x ?? this.homeGrip()[1]], th = v.th.x;
          const behind = this.state === 'home' || (this.state === 'swing' && J.at - v.swingAt > 0.45);
          if (behind) this.drawLadle(ctx, G, th, 1, v.water, at);
          const [bx, by, bw, bh] = L.bucket;
          if (!(has(ART.bucket) && A.Art.draw(ctx, ART.bucket, bx, by, bw, bh, 0.85, 0.6, 1))) procBucket(ctx, bx, by, bw, bh);
          const [wx, wy, wr] = L.water;
          const gl = rm() ? 0.5 : 0.5 + 0.5 * Math.sin(at * 0.7);
          sprite(ctx, 'streak', C.ice, wx + wr * (gl - 0.5) * 0.9, wy - 2 * U, wr * 0.55, 0.22 + 0.1 * gl, true);
          if (this.state === 'carry' && !this.pour && !rm()) { const ph = (at % 1.2) / 1.2; ctx.strokeStyle = rgb(C.ice, 0.35 * (1 - ph)); ctx.lineWidth = 1.2 * U; ctx.beginPath(); ctx.ellipse(wx, wy, wr * (0.3 + 0.7 * ph), wr * 0.28 * (0.3 + 0.7 * ph), 0, 0, TAU); ctx.stroke(); }
          const rp = (at - v.rippleAt) / 0.7;
          if (rp >= 0 && rp < 1) {
            ctx.strokeStyle = rgb(C.ice, 0.45 * (1 - rp)); ctx.lineWidth = 1.4 * U;
            ctx.beginPath(); ctx.ellipse(wx, wy, wr * (rm() ? 0.9 : 0.3 + 0.7 * E.outSoft(rp)), wr * 0.28 * (rm() ? 0.9 : 0.3 + 0.7 * E.outSoft(rp)), 0, 0, TAU); ctx.stroke();
          }

          const [kx, ky, kw, kh] = L.kiuas;
          const kimg = kiuasImg(kw, kh);
          if (kimg) ctx.drawImage(kimg, kx, ky, kw, kh); else procKiuas(ctx, kx, ky, kw, kh);
          sprite(ctx, 'soft', C.amber, fx0, fy0, fr * 1.6, 0.25 + 0.45 * ember, true);
          sprite(ctx, 'glow', C.glow, fx0, fy0, fr * 0.8, 0.2 + 0.4 * ember, true);

          this.drawBed(ctx, at);
          if (!behind) this.drawLadle(ctx, G, th, 1, v.water, at);
          this.drawGhost(ctx, at);
          this.drawSteam(ctx, b, at);
          if (!this.bare) dots(ctx, b.x + b.w / 2, L.gy + (b.y + b.h - L.gy) * 0.5, this.need, this.items, U);
          if (this.poke && at - v.pokeAt < 0.5) sprite(ctx, 'soft', C.flame, this.poke[0], this.poke[1], 26 * U, 0.25 * (1 - (at - v.pokeAt) / 0.5), true);
        },

        drawBed(ctx, at) {
          const L = this.L, U = L.U, outro = this.done ? clamp((at - this.doneAt) / 0.6, 0, 1) : 0;
          const carry = this.state === 'carry' && this.pour, tolPx = this.pour?.tolPx ?? 30 * U;
          const lip = carry ? this.rawLip() : null;
          for (let i = 0; i <= 12; i++) {
            const x = lerp(L.x0, L.x1, i / 12), y = this.lineY(x), near = lip ? Math.exp(-(((x - lip[0]) / (40 * U)) ** 2)) : 0;
            const sh = rm() ? 0 : Math.sin(at * 2.1 + i * 1.3) * 2 * U;
            sprite(ctx, 'soft', C.flame, x, y + sh, tolPx * 1.1, (carry ? 0.05 : 0.025) + 0.08 * near, true, 1.2, 0.55);
          }
          for (const f of this.filler) stone(ctx, f.x, f.y, f.r, 'f');
          for (const s of this.stones) {
            const m = s.mat > 0 ? E.outBack((at - s.mat) / 0.4, 1.2) : 1, x = lerp(s.ox, s.x, m), y = lerp(s.oy, s.y, m) - (rm() ? 0 : 4 * U * Math.sin(Math.PI * clamp((at - s.mat) / 0.4, 0, 1)));
            const w = this.warmth(s, at), flare = clamp(1 - (at - s.wat) / 0.6, 0, 1);
            stone(ctx, x, y, s.r, 'd');
            stone(ctx, x, y, s.r, 'l', clamp(Math.sqrt(w) * 1.15 * (0.8 + 0.2 * this.ember) + outro * Math.min(1, w * 3), 0, 1));
            if (w > 0.02) sprite(ctx, 'soft', HOT, x, y, s.r * 2.6, 0.3 * Math.sqrt(w) + 0.45 * flare + 0.3 * outro * Math.min(1, w * 3), true);
          }
          this.drawStream(ctx, at);
        },

        drawStream(ctx, at) {
          const L = this.L, U = L.U, v = this.vis, P = this.pour;
          if (!P || !this.pouring()) return;
          const lip = this.lipAt([v.gx.x, v.gy.x], v.th.x), raw = this.rawLip();
          const ground = this.surface(lip[0]) + 2 * U, len = ground - lip[1];
          if (len < 2) return;
          const spd = this.speed(A.now()), slow = spd <= P.thr * GRACE, onLine = Math.abs(raw[1] - this.lineY(raw[0])) <= P.tolPx;
          const silk = slow && onLine, wq = clamp(P.water * 3, 0.25, 1), sq = clamp((P.thr * GRACE - spd) / (0.35 * P.thr), 0.3, 1);
          if (silk) {
            const w = (1.4 + 3 * wq * sq) * U;
            ctx.save(); ctx.lineCap = 'round';
            ctx.strokeStyle = rgb(C.ice, 0.5 + 0.3 * sq); ctx.lineWidth = w;
            ctx.beginPath(); ctx.moveTo(lip[0], lip[1]); ctx.quadraticCurveTo(lip[0] + 3 * U, lip[1] + len * 0.4, lip[0] + 2 * U, ground); ctx.stroke();
            ctx.globalCompositeOperation = 'lighter';
            ctx.strokeStyle = rgb(C.silver050, 0.55); ctx.lineWidth = w * 0.4;
            if (!rm()) { ctx.setLineDash([5 * U, 7 * U]); ctx.lineDashOffset = -at * 60 * U; }
            ctx.stroke();
            ctx.restore();
            sprite(ctx, 'soft', C.amber, lip[0] + 2 * U, ground, 16 * U, 0.25 + 0.35 * sq, true);
            sprite(ctx, 'glow', C.silver050, lip[0] + 2 * U, ground - 2 * U, 6 * U, 0.6, true);
            if (at - v.hissAt > 0.16) { v.hissAt = at; this.puff(lip[0], ground - 4 * U, 0.28, { life: 1.1 }); }
          } else {
            ctx.strokeStyle = rgb(C.silver400, 0.25); ctx.lineWidth = 0.8 * U;
            ctx.beginPath(); ctx.moveTo(lip[0], lip[1]); ctx.lineTo(lip[0] + 1.5 * U, lip[1] + len * 0.6); ctx.stroke();
            for (let i = 0; i < 5; i++) {
              const q = rm() ? (i + 0.5) / 5 : ((at * 3.2 + i / 5) % 1);
              disc(ctx, lip[0] + 1.5 * U, lip[1] + q * len, 1.8 * U, C.silver300, 0.85 * (1 - q * 0.5));
            }
          }
        },

        drawLadle(ctx, G, th, alpha, water, at) {
          const L = this.L, v = this.vis, s = L.s, sq = J.squash(at - v.grabAt, 0.92, 0.18);
          const lift = rm() ? 0 : 6 * L.U * Math.sin(Math.PI * clamp((at - v.grabAt) / 0.3, 0, 1));
          const slosh = rm() ? 0 : Math.sin((at - v.grabAt) * TAU * 2.4) * Math.exp(-(at - v.grabAt) * 4.5);
          ctx.save();
          ctx.globalAlpha *= alpha;
          ctx.translate(G[0], G[1] - lift); ctx.rotate(th - L_ROT); ctx.scale(-s * sq[0], s * sq[1]); ctx.translate(-LD.end[0], -LD.end[1]);
          if (!(has(ART.ladle) && A.Art.draw(ctx, ART.ladle, 0, 0, LD.w, LD.w / A.Art.aspect(ART.ladle), 0.9, 0.72, 1))) procLadle(ctx);
          if (water > 0.03) {
            const [mx, my, rx, ry] = LD.mouth, k = 0.55 + 0.45 * water;
            ctx.fillStyle = rgb(C.tealDeep, 0.9);
            ctx.beginPath(); ctx.ellipse(mx + slosh * 14, my + (1 - water) * 26, rx * k, ry * k, slosh * 0.12, 0, TAU); ctx.fill();
            ctx.fillStyle = rgb(C.ice, 0.35);
            ctx.beginPath(); ctx.ellipse(mx - 30 + slosh * 24, my - 8 + (1 - water) * 26, rx * k * 0.35, ry * k * 0.25, 0, 0, TAU); ctx.fill();
          }
          ctx.restore();
        },

        drawGhost(ctx, at) {
          const L = this.L, U = L.U, idle = this.items + this.errors ? 3 : 0.6;
          if (this.state !== 'home' || this.done || this.t - this.lastIn < idle || this.bot) return;
          const bloom = this.nextBloom * 1.1, cyc = 0.7 + bloom + 0.9, p = ((this.t - this.lastIn - idle) % cyc);
          const vis = clamp(p / 0.25, 0, 1) * (1 - clamp((p - 0.7 - bloom - 0.3) / 0.4, 0, 1));
          const off = L.lipOff, home = this.homeGrip(), gp = x => [x - off[0], this.lineY(x) - off[1]];
          const start = gp(L.x0 - 8 * U);
          let G, sweep = 0;
          if (p < 0.7) { const q = E.inOut(p / 0.7); G = [lerp(home[0], start[0], q), lerp(home[1], start[1], q)]; }
          else { sweep = clamp((p - 0.7) / bloom, 0, 1); G = gp(lerp(L.x0 - 8 * U, L.x1, sweep)); }
          ctx.save();
          ctx.setLineDash([0.1, 7 * U]); ctx.lineCap = 'round'; ctx.strokeStyle = rgb(C.flame, 0.5 * vis); ctx.lineWidth = 3 * U;
          ctx.beginPath();
          for (let i = 0; i <= 20; i++) { const x = lerp(L.x0, L.x1, i / 20), y = this.lineY(x); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
          ctx.stroke(); ctx.restore();
          this.drawLadle(ctx, G, CARRY + (sweep > 0 ? TILT : 0), 0.35 * vis, 1, -9);
          touch(ctx, G[0], G[1], U, 0.85 * vis, 1);
        },

        drawSteam(ctx, b, at) {
          const L = this.L, U = L.U;
          if (this.cloud && this.steam > 0.01) {
            const c = this.cloud, cx = (L.x0 + L.x1) / 2, cy = L.tray - 24 * U;
            for (const p of c.puffs) {
              const q = clamp((at - c.at - p.d) / 1.4, 0, 1), m = rm() ? 1 : q;
              const tx = b.x + b.w * (0.5 + p.dx * 0.4), ty = b.y + b.h * (0.1 + p.dy * 0.14);
              const x = lerp(cx + p.dx * 20 * U, tx, E.inOut(m)), y = lerp(cy, ty, E.outSoft(Math.min(1, m * 1.25)));
              const r = (rm() ? 1 : 0.35 + 0.65 * E.outSoft(q)) * p.r * U * c.size, sw = rm() ? 0 : Math.sin(at * 0.5 + p.d * 9) * 8 * U;
              const a = this.steam * c.size * (rm() ? E.outSoft(q) : Math.min(1, q * 4));
              sprite(ctx, 'glow', C.silver100, x + sw, y, r, 0.1 * a, true);
              sprite(ctx, 'soft', C.flame, x + sw, y + r * 0.3, r * 0.9, 0.1 * a, true);
            }
            const q = E.outSoft((at - c.at) / 1.6);
            sprite(ctx, 'soft', C.glow, cx, lerp(cy, b.y + b.h * 0.3, rm() ? 1 : q), b.w * 0.45 * c.size, 0.14 * this.steam * c.size, true, 1.3, 0.8);
          }
          const f = this.fog;
          if (!f) return;
          const rise = E.outSoft((at - f.at) / 1.2), hold = this.done ? 1 : clamp(this.steam / 0.6, 0, 1) ** f.hold;
          let a = f.peak * rise * hold;
          let top = b.y, bottom = b.y + b.h;
          if (this.done) {
            const lift = E.inOut((at - this.doneAt - 0.6) / 0.7);
            bottom = lerp(b.y + b.h, b.y, rm() ? 0 : lift);
            if (rm()) a *= 1 - lift;
          }
          if (a <= 0.004 || bottom <= top) return;
          const off = rm() ? 0 : (1 - rise) * b.h * 0.3;
          if (this.bare) {
            const k = (bottom - b.y) / b.h;
            sprite(ctx, 'soft', C.flame, b.x + b.w / 2, b.y + b.h * 0.3 + off, b.w * 0.6, a * 1.6 * k, true, 1, 0.75);
            return;
          }
          ctx.save();
          ctx.beginPath(); ctx.rect(b.x, top, b.w, bottom - top); ctx.clip();
          ctx.globalAlpha *= a / 0.22; ctx.globalCompositeOperation = 'lighter';
          if (!(has(ART.fog) && A.Art.draw(ctx, ART.fog, b.x, b.y + off, b.w, b.h, 1, 1, 0.22))) {
            const g = ctx.createLinearGradient(0, b.y + off, 0, b.y + b.h + off);
            g.addColorStop(0, rgb(C.flame, 0.22)); g.addColorStop(0.7, rgb(C.flame, 0.08)); g.addColorStop(1, rgb(C.flame, 0));
            ctx.fillStyle = g; ctx.fillRect(b.x, b.y, b.w, b.h);
          }
          ctx.restore();
        },
      });
      g.lay(A.session?.box?.() || { x: 27, y: 101, w: 335, h: 388 });
      const [hx, hy] = g.homeGrip();
      Object.assign(g.vis, { gx: { x: hx, v: 0 }, gy: { x: hy, v: 0 } });
      return g;
    },
  });
})();
