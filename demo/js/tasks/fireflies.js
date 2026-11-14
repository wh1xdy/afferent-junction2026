(() => {
  const { clamp, lerp, rgb, mixc, median } = A;
  const J = A.J, { C, sprite, disc, unit, dragCue, base, finish, fx, hap, sfx, beat, rm } = J;
  const E = J.ease, R = Math.random, ID = 'fireflies';
  const REED = 0.86, CAP_AIR = 6, HEAD_CAP = 3.5, TRAIL_LIFE = 0.18, STICK = 0.08, FLY = 0.45;
  const smooth = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
  const art = (ctx, n, x, y, w, h, light = 1, alpha = 1) => !!A.Art?.has(n) && A.Art.draw(ctx, n, x, y, w, h, 1, light, alpha);

  A.Skill?.define(ID, {
    interval: { v0: 2, v1: 1, cat: 'tempo' },
    count: { v0: 2.5, v1: 4.5, cat: 'load' },
    hang: { v0: 0.6, v1: 0.3, geo: true, cat: 'tempo' },
    radius: { v0: 0.1, v1: 0.065, geo: true, cat: 'precision' },
    band: { v0: 0.3, v1: 0.55, cat: 'precision', wider: false },
    speed: { v0: 1, v1: 1.35, cat: 'tempo' },
    frost: { steps: [[0, 0], [0.4, 1], [0.8, 2]], cat: 'load' },
    n: { v0: 9, v1: 16, int: true, cat: 'load' },
    blitz: { v0: 0.8, v1: 0.45, geo: true, cat: 'tempo' },
  });
  const ax = (name, fb) => (A.Skill ? A.Skill.axis(ID, name, fb) : fb);

  const PAL = {
    wake: { fly: C.green, core: C.silver050, deep: C.greenDeep, warm: C.amber, dark: false },
    fatigue: { fly: C.gold, core: C.night800, deep: C.amberDeep, warm: C.amber, dark: true },
  };

  const tints = {};
  const tinted = (n, c) => {
    if (!A.Art?.has(n)) return null;
    const key = n + c.join();
    if (tints[key]) return tints[key];
    const cv = document.createElement('canvas'), h = 384, w = Math.round(h * A.Art.aspect(n));
    cv.width = w; cv.height = h;
    const x = cv.getContext('2d');
    A.Art.draw(x, n, 0, 0, w, h);
    x.globalCompositeOperation = 'source-atop'; x.fillStyle = rgb(c, 0.7); x.fillRect(0, 0, w, h);
    return (tints[key] = cv);
  };

  const BLADES = (() => {
    const rnd = A.rng(7), out = [];
    for (let i = 0; i < 26; i++) {
      const left = i % 2 === 0, s = left ? 0.01 + 0.3 * rnd() ** 1.4 : 0.99 - 0.3 * rnd() ** 1.4;
      out.push({ s, len: 16 + 40 * rnd() * (1 - Math.abs(s - (left ? 0 : 1)) * 1.6), w: 1.4 + 1.2 * rnd(), lean: (left ? 1 : -1) * (2 + 8 * rnd()), ph: rnd() * 6, frost: rnd() < 0.35, c: mixc(C.night950, C.night700, 0.2 + 0.3 * rnd()) });
    }
    return out.sort((a, c) => c.len - a.len);
  })();

  const segHit = (x0, y0, x1, y1, cx, cy) => {
    const dx = x1 - x0, dy = y1 - y0, l2 = dx * dx + dy * dy;
    const t = l2 > 0 ? clamp(((cx - x0) * dx + (cy - y0) * dy) / l2, 0, 1) : 0;
    return [Math.hypot(x0 + dx * t - cx, y0 + dy * t - cy), t];
  };

  const jarRect = b => {
    const h = b.h * 0.22, w = A.Art?.has('task_fireflies_jar') ? h * A.Art.aspect('task_fireflies_jar') : h * 0.72;
    const cx = b.x + b.w / 2, x = cx - w * (A.Art?.has('task_fireflies_jar') ? 0.6 : 0.5), y = b.y + b.h * 0.975 - h;
    return { x, y, w, h, cx, mx: cx, my: y + h * 0.1, by: y + h * 0.95 };
  };

  A.defineTask(ID, {
    modes: ['wake', 'fatigue'], role: 'Fruit Ninja Zen; Vampire Survivors pickup and vacuum',
    bpm: (tempo, k) => Math.min(96, tempo + 20 * k),
    make(k) {
      const n = ax('n', 5 + Math.round(3 * k));
      const g = base(ID, 15, {
        n, flies: [], trail: [], head: null, finger: null, stroke: null, rings: [], plan: null, bag: [], dir: -1,
        reserve: 0, swayAt: -9, swayDir: 1, jarAt: -9, lidAt: -9, chillAt: -9, feverUntil: -9, payAt: null, payLight: 1, payGain: 1,
        tier: 0, blitzLeft: 0, inJar: 0, marks: false, b: null, bot: null, botQ: [],
        log: { gestures: 0, multi_max: 0, lat: [], apex: [], relaunches: 0, volleys: 0, passes_dim: 0, frost_touches: 0 },
        outro: 1.5,

        box() { return this.b || A.session?.box?.() || { x: 0, y: 0, w: 335, h: 388 }; },
        pal() { return PAL[this.mode] || PAL.wake; },

        pos(f, t) {
          const tau = t - f.t0, smoothRm = f.rm;
          let h, s;
          if (tau < f.tr) { const p = clamp(tau / f.tr, 0, 1); h = smoothRm ? smooth(p) : 1 - (1 - p) ** 2; s = 0.42 * p; }
          else if (tau < f.tr + f.th) { const q = (tau - f.tr) / f.th; h = 1 + (smoothRm ? 0 : 0.03 * Math.sin(Math.PI * q)); s = 0.42 + 0.16 * q; }
          else { const p = (tau - f.tr - f.th) / f.tf; h = 1 - (smoothRm ? smooth(p) : p * p) - (p > 1 ? (p - 1) * 0.6 : 0); s = 0.58 + 0.42 * Math.min(p, 1.3); }
          return { u: lerp(f.u0, f.u1, s), v: REED - h * f.H, hf: h, phase: tau < f.tr ? 0 : tau < f.tr + f.th ? 1 : 2 };
        },

        planNext(now, first) {
          const period = beat.period(), iv = Math.max(1, Math.round(ax('interval', 2 - k) * 2) / 2);
          const speed = ax('speed', 1 + 0.35 * k), hang = first ? Math.max(0.8, ax('hang', 0.6 - 0.3 * k)) : ax('hang', 0.6 - 0.3 * k);
          const tr = (rm() ? 1.4 : 0.62) / speed, tf = (rm() ? 1.5 : 0.72) / speed;
          let apexAt;
          if (first) apexAt = now + 0.25 + tr + hang / 2;
          else {
            const want = Math.max(this.plan.apexAt + iv * period, now + tr + hang / 2 + 0.05), half = period / 2;
            apexAt = beat.t0 + Math.ceil((want - beat.t0) / half - 1e-6) * half;
          }
          const m = first ? 2 : clamp(Math.round(ax('count', 2 + 2 * k) + (R() - 0.5) * 0.9), 1, 5);
          this.plan = {
            first, apexAt, launchAt: apexAt - tr - hang / 2, m, tr, tf, th: hang, speed,
            r: ax('radius', 0.13 - 0.03 * k), band: ax('band', 0.3), frost: first ? 0 : ax('frost', 0),
          };
        },

        pattern() {
          if (!this.bag.length) this.bag = ['row', 'rise', 'arch', 'fall'].sort(() => R() - 0.5);
          return this.bag.pop();
        },

        launch(now) {
          const P = this.plan, air = this.flies.filter(f => f.state === 'air' && !f.frost).length;
          const m = Math.min(P.m, CAP_AIR - air);
          if (m <= 0) { this.plan.apexAt += beat.period() / 2; this.plan.launchAt += beat.period() / 2; return; }
          this.dir = -this.dir; this.log.volleys++;
          const dir = this.dir, pat = P.first ? 'cross' : this.pattern(), f0 = 0.58 + 0.12 * R(), half = rm() ? 0.5 : 1;
          const frac = s => pat === 'rise' ? lerp(0.52, 0.74, s) : pat === 'fall' ? lerp(0.74, 0.52, s) : pat === 'arch' ? 0.54 + 0.2 * Math.sin(Math.PI * s) : pat === 'cross' ? 0.62 : f0;
          const make = (ua, fr, i, frost, cross) => {
            const lean = cross ? 0.22 * (ua < 0.5 ? 1 : -1) : 0.09 * dir;
            const relaunch = !frost && this.reserve > 0;
            if (relaunch) { this.reserve--; this.log.relaunches++; }
            const f = {
              u0: clamp(ua - lean, 0.06, 0.94), u1: clamp(ua + lean, 0.06, 0.94), H: (fr - (1 - REED)) * half, rm: rm(),
              t0: P.launchAt + i * 0.08 / P.speed, tr: P.tr, th: P.th, tf: P.tf, r: P.r, band: P.band, frost,
              state: 'air', graded: false, seed: R() * 9, ju: R() - 0.5, jv: R(), cAt: 0, dim: false,
            };
            f.ta = f.t0 + f.tr + f.th / 2;
            if (!frost) this.rt?.cue(f, 'catch', f.t0 + f.tr * (f.rm ? 0.5 - Math.sin(Math.asin(1 - 2 * f.band) / 3) : 1 - Math.sqrt(1 - f.band)));
            this.flies.push(f);
            return f;
          };
          for (let i = 0; i < m; i++) {
            const kk = dir > 0 ? i : m - 1 - i, s = (kk + 0.5) / m;
            const ua = P.first ? (i ? 0.38 : 0.62) : lerp(0.2, 0.8, s) + (R() - 0.5) * 0.05;
            make(ua, frac(s) + (P.first ? (i ? -0.04 : 0.04) : 0), i, false, pat === 'cross');
          }
          for (let j = 0; j < P.frost; j++) {
            const s = m > 1 ? (Math.floor(R() * (m - 1)) + 1) / m : (R() < 0.5 ? 0.2 : 0.8), kk = dir > 0 ? s : 1 - s;
            make(lerp(0.2, 0.8, kk), frac(s) + (R() < 0.5 ? -1 : 1) * 0.08, s * m, true, false);
          }
          this.swayAt = J.at; this.swayDir = dir;
          const b = this.box();
          for (const f of this.flies.slice(-m - P.frost)) if (!f.frost) fx.rise(b.x + f.u0 * b.w, b.y + REED * b.h, 2, this.pal().deep, { life: 0.5 });
          sfx('ff_toss', { n: m });
          this.planNext(now, false);
        },

        update(dt, now) {
          if (!this.plan) { fx.limit = 80; this.planNext(now, true); }
          this.step(dt, now);
          if (this.done) return;
          if (now >= this.plan.launchAt) this.launch(now);
          if (this.finger && this.head) this.sweep(this.finger.x, this.finger.y, now, dt);
          let open = false;
          for (const f of this.flies) {
            if (f.state !== 'air' || now < f.t0) continue;
            const p = this.pos(f, now);
            if (!f.frost && !f.graded && p.phase === 2 && p.hf < f.band) { f.graded = true; this.rt?.lapse(f); this.grade(f, 'miss'); }
            if (!f.frost && p.hf >= f.band) { open = true; if (!f.graded && R() < dt * 9) { const b = this.box(); fx.trailMote(b.x + p.u * b.w, b.y + p.v * b.h, this.pal().fly, { life: 0.45, size: [1.8, 0.4], vy: -8 }); } }
            if (p.phase === 2 && p.hf < -0.15) { f.state = 'gone'; if (!f.frost) this.reserve++; }
          }
          if (this.tier > 0 && open && !this.stroke) {
            this.blitzLeft -= dt;
            if (this.blitzLeft < 0) { this.tier = A.Skill?.drop(ID) ?? Math.max(0, this.tier - 1); this.blitzLeft = this.blitzWin(); }
          }
          this.flies = this.flies.filter(f => f.state !== 'gone');
        },

        blitzWin() { return ax('blitz', 0.8) * (A.Skill?.assisted() ? 1.25 : 1); },

        step(dt, now) {
          const at = J.at, b = this.box(), jar = jarRect(b);
          for (const f of this.flies) {
            if (f.state === 'stick' && at - f.cAt >= (f.grade === 'barely' ? 0.22 : STICK)) {
              f.state = 'fly'; f.fAt = at; f.fx = f.x; f.fy = f.y;
            }
            if (f.state === 'fly' && at - f.fAt >= (f.rm ? 0.3 : FLY) + (f.delay || 0)) {
              f.state = 'jar'; this.inJar++; this.jarAt = at;
              f.jx = jar.cx + f.ju * jar.w * 0.42; f.jy = jar.by - jar.h * (0.12 + 0.55 * f.jv);
              sfx('ff_clink');
              J.border(clamp(this.inJar / this.n, 0, 1) * 0.8 + 0.07 * this.tier);
            }
          }
          if (this.payAt !== null && !this.marks && at - this.payAt > 0.7) {
            this.marks = true;
            const add = A.World?.hooks?.addSkyMark, { W, H } = J.size();
            if (add) for (let i = 0; i < 4; i++) add('aurora', (b.x + b.w * (0.3 + 0.4 * R())) / W, (b.y * 0.5 + R() * 0.12 * H) / H);
          }
          if (this.payAt !== null && at - this.payAt > 0.25 && at - this.payAt < 1.3 && R() < 0.5 && !rm()) {
            fx.add({ x: jar.mx + (R() - 0.5) * jar.w * 0.3, y: jar.my, vx: (R() - 0.5) * 16, vy: -(180 + 120 * R()) * unit(b), life: 1.1, size: [3, 1.2], c: R() < 0.5 ? this.pal().fly : C.flame, sway: [18, 4], kind: 'mote' });
          }
        },

        outroUpdate(dt, now) { this.step(dt, now); },

        down(u, v, t, d) {
          if (this.done) return;
          const b = this.box(), x = b.x + u * b.w, y = b.y + v * b.h, ts = d?.ts ?? t;
          this.lastIn = this.t;
          this.head = { x, y, t: ts }; this.finger = { x, y };
          this.stroke = { catches: 0, frost: false, dim: false, t0: ts, len: 0 };
          this.trail = [{ x, y, t: J.at, w: 1 }];
          this.hitSeg(x, y, x, y, ts);
        },

        move(u, v, t, d) {
          if (this.done || !this.stroke) return;
          const b = this.box();
          this.finger = { x: b.x + u * b.w, y: b.y + v * b.h };
          this.sweep(this.finger.x, this.finger.y, d?.ts ?? t, 0);
        },

        sweep(fx_, fy_, ts, dt) {
          const h = this.head, b = this.box(), step = Math.max(dt, ts - h.t, 0.004) * HEAD_CAP * b.w;
          const dx = fx_ - h.x, dy = fy_ - h.y, l = Math.hypot(dx, dy);
          if (l < 0.5) { h.t = Math.max(h.t, ts); return; }
          const k_ = Math.min(1, step / l), x0 = h.x, y0 = h.y;
          h.x += dx * k_; h.y += dy * k_; h.t = Math.max(h.t, ts);
          this.stroke.len += l * k_;
          this.trail.push({ x: h.x, y: h.y, t: J.at, w: clamp(k_ < 1 ? 0.35 + 0.65 * k_ : 1, 0.35, 1) });
          if (this.trail.length > 16) this.trail.shift();
          this.hitSeg(x0, y0, h.x, h.y, ts, k_ < 1 ? 0.7 : 1);
        },

        up(u, v, t, d) {
          if (!this.stroke) return;
          const s = this.stroke;
          this.log.gestures++;
          if (!s.catches) this.errors++;
          if (s.dim) this.log.passes_dim++;
          this.log.multi_max = Math.max(this.log.multi_max, s.catches);
          sfx('ff_whoosh', { len: s.len });
          this.stroke = null; this.finger = null;
        },

        hitSeg(x0, y0, x1, y1, t, lag = 1) {
          if (this.done) return;
          const b = this.box(), s = this.stroke, hw = (5 + 1.5 * s.catches) * unit(b), hits = [];
          for (const f of this.flies) {
            if (f.state !== 'air' || t < f.t0) continue;
            const p = this.pos(f, t), cx = b.x + p.u * b.w, cy = b.y + p.v * b.h;
            const [dd, tp] = segHit(x0, y0, x1, y1, cx, cy);
            if (dd > (f.r * b.w + hw) * (f.frost ? 0.6 : lag)) continue;
            if (f.frost) { this.frost(f, cx, cy); continue; }
            if (p.hf < f.band) { s.dim = true; continue; }
            hits.push([tp, f, p, cx, cy]);
          }
          hits.sort((a, c) => a[0] - c[0]);
          for (const [, f, p, cx, cy] of hits) if (!this.done) this.take(f, p, cx, cy, t);
        },

        frost(f, x, y) {
          f.state = 'gone';
          this.log.frost_touches++;
          this.chillAt = J.at;
          fx.snow(x, y, 8, C.silver100);
          fx.burst(x, y, 5, C.ice, 90, { kind: 'mote', life: 0.4, size: [2, 0.6] });
          if (!this.stroke.frost) { this.stroke.frost = true; this.tier = A.Skill?.drop(ID) ?? Math.max(0, this.tier - 1); hap('tick'); }
          sfx('ff_frost');
        },

        take(f, p, x, y, t) {
          const s = this.stroke, pal = this.pal(), U = unit(this.box());
          const late = p.phase === 2 && this.pos(f, t + 0.12).hf < f.band;
          const grade = t >= f.t0 + f.tr - 0.1 && t <= f.t0 + f.tr + f.th + 0.1 ? 'perfect' : late ? 'barely' : 'good';
          f.state = 'stick'; f.graded = true; f.cAt = J.at; f.x = x; f.y = y; f.grade = grade;
          s.catches++;
          this.items++;
          this.log.lat.push((t - f.t0) * 1000);
          this.rt?.hit(f, t);
          this.log.apex.push((t - f.ta) * 1000);
          if (s.catches === 3) this.bumpTier(grade);
          const res = this.grade(f, grade);
          const fever = J.at < this.feverUntil, big = (fever ? 1.3 : 1) * (grade === 'perfect' ? 1.25 : 1);
          const nSp = grade === 'barely' ? 5 : 10 + Math.min(2, s.catches - 1);
          const pf = pal.dark ? C.amberDeep : pal.fly;
          fx.burst(x, y, Math.ceil(nSp / 2), pf, 170 * U * big, { kind: 'spark', life: 0.35, size: [5 * U * big, 1] });
          fx.burst(x, y, Math.floor(nSp / 2), C.flame, 140 * U * big, { kind: 'spark', life: 0.35, size: [4 * U * big, 1] });
          if (grade === 'perfect') fx.add({ x, y, life: 0.3, size: q => (10 + 14 * Math.sin(Math.PI * q)) * U * big, alpha: q => 1 - q, kind: 'spark', c: C.daylight });
          J.bloom(x, y, Math.min(64, (24 + 10 * s.catches + (grade === 'perfect' ? 12 : 0)) * big) * U, pal.fly, grade === 'barely' ? 0.35 : 0.6, 0.12, 0.35);
          if (s.catches === 1) hap('light'); else hap.seq([['light', 50]]);
          if (grade === 'perfect') hap.seq([['tick', 40]]);
          const off = beat.period() / 4, ph = ((A.now() - beat.t0) / off) % 1, when = ph > 0.02 ? (1 - ph) * off : 0;
          sfx('ff_catch', { piano: [grade === 'barely' ? 2 + s.catches : Math.min(10, 4 + s.catches + this.tier), grade === 'barely' ? 0.08 : 0.14, when] });
          if (s.catches === 3) {
            hap('medium');
            this.lidAt = J.at;
            if (!rm() && J.flash.request(0.3, 0.15).ok) this.rings.push({ x, y, at: J.at });
            sfx('ff_bowl');
          }
          const step = A.Skill?.progress(ID, this.items, this.n);
          if (step) J.stinger();
          if (res?.fever) this.feverUntil = J.at + 2.5;
          if (this.items >= this.n) this.payoff(t);
        },

        bumpTier(grade) {
          const c = A.Skill?.active(ID);
          if (!c || c.tier >= c.tiers.length) return;
          const need = c.tiers[c.tier] - (grade === 'barely' ? 0 : 1);
          if (c.c < need) { c.c = need; c.pc = Math.max(c.pc, need); }
        },

        grade(f, grade) {
          const res = A.Skill?.trial(ID, grade);
          if (res) this.tier = res.tier;
          else if (grade === 'miss') this.tier = Math.max(0, this.tier - 1);
          if (grade === 'good' || grade === 'perfect') this.blitzLeft = this.blitzWin();
          return res;
        },

        payoff(t) {
          finish(this, t);
          const c = A.Skill?.active(ID);
          this.payLight = c ? A.Skill.lightShare(c) : 1;
          J.hitstop(this, 120);
          this.payAt = J.at;
          let i = 0;
          for (const f of this.flies) {
            if (f.state !== 'air') continue;
            this.rt?.drop(f);
            if (f.frost || J.at < f.t0) { f.state = 'gone'; continue; }
            const p = this.pos(f, J.at), b = this.box();
            Object.assign(f, { state: 'fly', fAt: J.at, fx: b.x + p.u * b.w, fy: b.y + p.v * b.h, delay: 0.12 + i * 0.07 });
            sfx('ff_vacuum', { piano: [Math.min(10, 6 + i), 0.12, 0.12 + i * 0.07] });
            i++;
          }
          this.flies = this.flies.filter(f => f.state !== 'gone');
          hap.seq([['tick', 0], ['tick', 60], ['tick', 120], ['tick', 180], ['medium', 260]]);
          const gate = J.flash.request(0.15, 0.4);
          this.payGain = gate.ok ? clamp(gate.peak / 0.4, 0.3, 1) : 0.5;
          J.border(1);
          J.spill(0.3 + 0.5 * this.payLight);
          if (this.stroke) this.up();
          this.trail = []; this.bot = null;
          sfx('ff_payoff', { light: this.payLight });
        },

        auto(dt, now) {
          if (this.done) return;
          for (const f of this.flies) {
            if (f.frost || f.state !== 'air' || f.bot) continue;
            const r = R(), gr = r < 0.15 ? 'perfect' : r < 0.62 ? 'good' : r < 0.74 ? 'barely' : 'miss';
            f.bot = gr;
            if (gr === 'miss') continue;
            let at;
            if (gr === 'perfect') at = f.ta + (R() - 0.5) * f.th * 0.6;
            else if (gr === 'good') { const bandT = f.tr * (1 - Math.sqrt(Math.max(0, 1 - f.band))); at = R() < 0.6 ? f.t0 + lerp(bandT + 0.06, f.tr - 0.14, R()) : f.t0 + f.tr + f.th + 0.14 + 0.06 * R(); }
            else { const exitT = f.t0 + f.tr + f.th + f.tf * Math.sqrt(Math.max(0, 1 - f.band)); at = exitT - 0.07; }
            this.botQ.push({ at, f });
          }
          if (!this.bot && R() < dt * 0.12) this.botQ.push({ at: now, f: null });
          this.botQ.sort((a, c) => a.at - c.at);
          if (!this.bot && this.botQ.length && now >= this.botQ[0].at - 0.05) {
            const { f } = this.botQ.shift();
            if (f && f.state !== 'air') return;
            const p = f ? this.pos(f, now + 0.05) : { u: 0.2 + 0.6 * R(), v: 0.25 + 0.3 * R() }, a = R() * Math.PI;
            const dx = Math.cos(a) * 0.14, dy = Math.sin(a) * 0.1;
            this.bot = { u0: p.u - dx, v0: p.v - dy, u1: p.u + dx, v1: p.v + dy, t0: now, dur: 0.1 };
            this.down(this.bot.u0, this.bot.v0, now, { ts: now });
            return;
          }
          if (this.bot) {
            const q = clamp((now - this.bot.t0) / this.bot.dur, 0, 1), B = this.bot;
            this.move(lerp(B.u0, B.u1, q), lerp(B.v0, B.v1, q), now, { ts: now });
            if (q >= 1) { this.up(B.u1, B.v1, now, { ts: now }); this.bot = null; }
          }
        },

        draw(ctx, b, at) {
          this.b = b;
          const U = unit(b), pal = this.pal(), jar = jarRect(b), fever = at < this.feverUntil;
          const fill = clamp(this.inJar / this.n, 0, 1), pay = this.payAt === null ? 0 : at - this.payAt;
          const lumBreath = 1 - 0.15 * (0.5 + 0.5 * Math.sin(2 * Math.PI * (at - beat.t0) / (2 * beat.period())));

          sprite(ctx, 'soft', pal.deep, b.x + b.w / 2, b.y + b.h * 0.95, b.w * 0.6, 0.16 + 0.12 * fill, true, 1, 0.45);
          this.drawReeds(ctx, b, at, U, true);
          this.drawColumn(ctx, b, jar, pay, U);

          for (const f of this.flies) if (f.state === 'air' && at >= f.t0) this.drawFly(ctx, b, f, at, U, pal, fever);

          const ja = 1 + (rm() ? 0 : 0.06 * Math.sin(Math.PI * clamp((at - this.jarAt) / 0.18, 0, 1)));
          sprite(ctx, 'soft', pal.fly, jar.cx, jar.by - jar.h * 0.4, jar.w * (0.9 + 0.5 * fill), (0.08 + 0.4 * fill + (pay > 0 ? 0.25 * Math.min(1, pay / 0.4) : 0)) * lumBreath, true);
          ctx.save();
          ctx.translate(jar.cx, jar.by); ctx.scale(1 / Math.sqrt(ja), ja); ctx.translate(-jar.cx, -jar.by);
          if (!art(ctx, 'task_fireflies_jar', jar.x, jar.y, jar.w, jar.h, this.mode === 'fatigue' ? 0.75 : 0.55, 0.92)) this.drawJar(ctx, jar, U);
          for (const f of this.flies) if (f.state === 'jar') {
            const x = f.jx + Math.sin(at * 1.7 + f.seed) * 3 * U, y = f.jy + Math.cos(at * 1.3 + f.seed) * 3 * U;
            sprite(ctx, 'glow', pal.fly, x, y, 11 * U, 0.75 * lumBreath, true);
            disc(ctx, x, y, 1.7 * U, pal.dark ? C.daylight : C.silver050, 0.95);
          }
          ctx.restore();
          const lid = clamp(1 - (at - this.lidAt) / 0.6, 0, 1);
          if (lid > 0) sprite(ctx, 'soft', C.flame, jar.x + jar.w * 0.18, jar.y + jar.h * 0.12, 30 * U, 0.55 * lid, true);
          if (pay > 0) sprite(ctx, 'soft', C.daylight, jar.mx, jar.my, 40 * U, 0.6 * Math.min(1, pay / 0.3) * clamp(1.6 - pay, 0, 1), true);

          this.drawReeds(ctx, b, at, U, false);

          for (const f of this.flies) {
            if (f.state === 'stick') {
              const e = (at - f.cAt) / 0.22, sx = rm() ? 1 : 1 + 0.4 * Math.cos(Math.PI * 1.5 * clamp(e, 0, 1)) * (1 - clamp(e, 0, 1));
              const pop = rm() ? 1.6 : 1.2, [wx, wa] = f.grade === 'barely' ? J.wobble(at - f.cAt) : [0, 1], x = f.x + wx * U;
              sprite(ctx, 'glow', pal.fly, x, f.y, 24 * U, 0.9 * wa, true, sx, 1 / sx);
              sprite(ctx, 'glow', C.flame, x, f.y, 9 * U * pop, 0.9 * wa, true, sx, 1 / sx);
            } else if (f.state === 'fly') {
              const dur = f.rm ? 0.3 : FLY, q = clamp((at - f.fAt - (f.delay || 0)) / dur, 0, 1);
              if (f.rm) {
                sprite(ctx, 'glow', pal.fly, f.fx, f.fy, 20 * U, 0.85 * (1 - q), true);
                sprite(ctx, 'glow', pal.fly, jar.mx, jar.my + 6 * U, 16 * U, 0.85 * q, true);
              } else {
                const m = E.inQuad(q), cx = lerp(f.fx, jar.mx, 0.3), cy = Math.min(f.fy, jar.my) - 40 * U;
                const x = (1 - m) ** 2 * f.fx + 2 * (1 - m) * m * cx + m * m * jar.mx, y = (1 - m) ** 2 * f.fy + 2 * (1 - m) * m * cy + m * m * jar.my;
                if (q > 0.05) fx.trailMote(x, y, pal.fly, { life: 0.35, size: [2.2 * U, 0.6] });
                sprite(ctx, 'glow', pal.fly, x, y, (18 - 6 * m) * U, 0.9, true);
                disc(ctx, x, y, 2 * U, C.silver050, 0.95);
              }
            }
          }

          this.drawTrail(ctx, at, U, pal, fever);
          for (const r of this.rings) {
            const q = (at - r.at) / 0.55;
            if (q >= 1) continue;
            const rr = (16 + b.w * 0.6 * E.outSoft(q)) * 1;
            ctx.strokeStyle = rgb(mixc(pal.fly, C.flame, 0.5), 0.32 * (1 - q)); ctx.lineWidth = 3 * U * (1 - q) + 0.5;
            ctx.beginPath(); ctx.arc(r.x, r.y, rr, 0, 6.283); ctx.stroke();
          }
          this.rings = this.rings.filter(r => at - r.at < 0.55);

          if (!this.log.gestures && !this.done && this.t > 1.2) {
            const live = this.flies.filter(f => f.state === 'air' && !f.frost && at >= f.t0).sort((a, c) => a.u0 - c.u0).slice(0, 2);
            if (live.length === 2) {
              const p = live.map(f => this.pos(f, f.ta)).map(p => [b.x + p.u * b.w, b.y + p.v * b.h]);
              const ex = (p[1][0] - p[0][0]) * 0.35, ey = (p[1][1] - p[0][1]) * 0.35;
              dragCue(ctx, m => [lerp(p[0][0] - ex, p[1][0] + ex, m), lerp(p[0][1] - ey, p[1][1] + ey, m)], U, at, clamp((this.t - 1.2) / 0.4, 0, 1), 1.6);
            }
          }
        },

        drawFly(ctx, b, f, at, U, pal, fever) {
          const p = this.pos(f, at), x = b.x + p.u * b.w, y = b.y + p.v * b.h;
          if (f.frost) {
            const a = clamp(p.hf * 3, 0, 1) * 0.85;
            sprite(ctx, 'soft', C.ice, x, y, 20 * U, 0.4 * a, true);
            ctx.save(); ctx.translate(x, y); ctx.rotate(at * 0.8 + f.seed);
            ctx.strokeStyle = rgb(C.silver100, 0.85 * a); ctx.lineWidth = 1.4 * U; ctx.lineCap = 'round';
            ctx.beginPath();
            for (let i = 0; i < 3; i++) { const an = i * Math.PI / 3, r = 8 * U; ctx.moveTo(-Math.cos(an) * r, -Math.sin(an) * r); ctx.lineTo(Math.cos(an) * r, Math.sin(an) * r); }
            ctx.stroke(); ctx.restore();
            disc(ctx, x, y, 1.8 * U, C.night700, a);
            return;
          }
          const inBand = p.hf >= f.band, apex = p.phase === 1 ? 1 : clamp((p.hf - f.band) / (1 - f.band), 0, 1);
          const missed = f.graded;
          const bright = missed ? 0.18 : inBand ? 0.55 + 0.45 * apex : 0.22;
          const sz = (fever ? 1.25 : 1) * (inBand && !missed ? 1 + 0.25 * apex : 0.85);
          if (inBand && !missed) sprite(ctx, 'soft', pal.fly, x, y, 38 * U * sz, 0.2 * bright, true);
          sprite(ctx, 'glow', pal.fly, x, y, 22 * U * sz, bright, true);
          if (A.Art?.has('task_fireflies_firefly_sheet') && !missed) {
            const fh = 9 * U * sz, fw = fh * A.Art.aspect('task_fireflies_firefly_sheet') / 4, fr = Math.floor(at * 18 + f.seed * 4) % 4;
            const face = f.u1 >= f.u0 ? 1 : -1;
            ctx.save(); ctx.translate(x, y); ctx.scale(face, 1);
            ctx.beginPath(); ctx.rect(-fw * 0.25, -fh * 0.6, fw, fh * 1.1); ctx.clip();
            A.Art.draw(ctx, 'task_fireflies_firefly_sheet', -fw * 0.25 - fr * fw, -fh * 0.55, fw * 4, fh, 1, 0.7, 0.55 + 0.45 * bright);
            ctx.restore();
          }
          if (pal.dark) disc(ctx, x, y, 2.4 * U * sz, pal.core, 0.8);
          else disc(ctx, x, y, 2.2 * U * sz, pal.core, 0.45 + 0.55 * bright);
        },

        drawTrail(ctx, at, U, pal, fever) {
          const pts = this.trail.filter(p => at - p.t < TRAIL_LIFE).slice(rm() ? -4 : -12);
          this.trail = pts;
          if (!pts.length) return;
          const s = this.stroke, chill = clamp(1 - (at - this.chillAt) / 0.35, 0, 1);
          const warm = clamp((s ? 0.22 * s.catches : 0) + 0.18 * this.tier + (fever ? 0.4 : 0), 0, 1);
          const c = mixc(mixc(C.silver050, C.amber, warm), C.ice, chill), extra = s ? 3 * Math.max(0, s.catches - 1) : 0;
          ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
          for (let i = 1; i < pts.length; i++) {
            const a = pts[i - 1], q = pts[i], k_ = i / (pts.length - 1 || 1), life = 1 - (at - q.t) / TRAIL_LIFE;
            ctx.strokeStyle = rgb(c, 0.75 * life);
            ctx.lineWidth = Math.max(0.5, (10 + extra) * U * k_ * q.w * life);
            ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(q.x, q.y); ctx.stroke();
          }
          ctx.restore();
          const h = pts[pts.length - 1], hl = 1 - (at - h.t) / TRAIL_LIFE;
          if (s) sprite(ctx, 'glow', C.flame, h.x, h.y, (12 + extra) * U, 0.8 * Math.max(hl, 0.4), true);
        },

        drawColumn(ctx, b, jar, pay, U) {
          if (pay <= 0) return;
          const size = this.payLight >= 0.8 ? 1 : this.payLight >= 0.5 ? 0.75 : 0.55;
          const rise = E.outSoft(clamp((pay - 0.12) / 0.5, 0, 1)), fade = clamp((1.7 - pay) / 0.5, 0, 1), a = 0.5 * size * rise * fade * this.payGain;
          if (a <= 0.01) return;
          const top = b.y - b.h * 0.15, hgt = (jar.my - top) * (rm() ? 1 : rise), w = jar.w * 0.75 * (0.6 + 0.4 * size);
          ctx.save(); ctx.globalCompositeOperation = 'lighter';
          const col = this.mode === 'fatigue' ? tinted('task_fireflies_light_column', C.gold) : 'task_fireflies_light_column';
          if (col && typeof col !== 'string') { ctx.globalAlpha *= a; ctx.drawImage(col, jar.mx - w / 2, jar.my - hgt, w, hgt); }
          else if (!col || !art(ctx, col, jar.mx - w / 2, jar.my - hgt, w, hgt, 1, a)) {
            const gr = ctx.createLinearGradient(0, jar.my, 0, jar.my - hgt);
            gr.addColorStop(0, rgb(C.flame, 0.5 * a)); gr.addColorStop(0.4, rgb(this.pal().fly, 0.3 * a)); gr.addColorStop(1, rgb(this.pal().fly, 0));
            ctx.fillStyle = gr; ctx.beginPath(); ctx.ellipse(jar.mx, jar.my - hgt / 2, w / 2, hgt / 2, 0, 0, 6.283); ctx.fill();
          }
          ctx.restore();
        },

        drawReeds(ctx, b, at, U, back) {
          const sway = rm() ? 0 : clamp(1 - (at - this.swayAt) / 0.6, 0, 1), has = A.Art?.has('task_fireflies_reeds');
          if (back) {
            const w = b.w * 1.1, h = w / (has ? A.Art.aspect('task_fireflies_reeds') : 4.6), y = b.y + b.h - h;
            if (!art(ctx, 'task_fireflies_reeds', b.x - (w - b.w) / 2, y, w, h, this.mode === 'fatigue' ? 0.8 : 0.55, 0.95)) {
              ctx.fillStyle = rgb(C.night800, 0.9); ctx.fillRect(b.x, b.y + b.h * 0.9, b.w, b.h * 0.1);
              ctx.fillStyle = rgb(C.ice, 0.12); ctx.fillRect(b.x, b.y + b.h * 0.9, b.w, 1.5 * U);
            }
            return;
          }
          ctx.save();
          for (const r of BLADES) {
            const x = b.x + b.w * r.s, y0 = b.y + b.h + 2 * U, len = r.len * U, wd = r.w * U;
            const wave = sway * 2.2 * U * Math.sin(Math.PI * 2 * clamp((at - this.swayAt) * 2.2 - (this.swayDir > 0 ? r.s : 1 - r.s) * 0.8, 0, 1));
            const tip = r.lean * U + Math.sin(at * 0.8 + r.ph) * 1.2 * U + wave * 3;
            ctx.fillStyle = rgb(r.c, 0.96);
            ctx.beginPath(); ctx.moveTo(x - wd, y0);
            ctx.quadraticCurveTo(x - wd * 0.3 + tip * 0.3, y0 - len * 0.6, x + tip, y0 - len);
            ctx.quadraticCurveTo(x + wd * 0.3 + tip * 0.3, y0 - len * 0.6, x + wd, y0);
            ctx.fill();
            if (r.frost) disc(ctx, x + tip * 0.96, y0 - len * 0.97, 1.3 * U, C.silver100, 0.5);
          }
          ctx.restore();
        },

        drawJar(ctx, jar, U) {
          const { x, y, w, h } = jar, cx = x + w / 2, jw = w / 2, jt = y + h * 0.1, jb = y + h;
          ctx.save();
          ctx.beginPath();
          ctx.moveTo(cx - jw * 0.6, jt); ctx.quadraticCurveTo(cx - jw, jt + 10 * U, cx - jw, jt + 22 * U);
          ctx.lineTo(cx - jw, jb - 9 * U); ctx.quadraticCurveTo(cx - jw, jb, cx - jw + 9 * U, jb);
          ctx.lineTo(cx + jw - 9 * U, jb); ctx.quadraticCurveTo(cx + jw, jb, cx + jw, jb - 9 * U);
          ctx.lineTo(cx + jw, jt + 22 * U); ctx.quadraticCurveTo(cx + jw, jt + 10 * U, cx + jw * 0.6, jt);
          ctx.fillStyle = rgb(C.silver100, 0.07); ctx.fill();
          ctx.strokeStyle = rgb(C.silver200, 0.5); ctx.lineWidth = 2 * U; ctx.stroke();
          ctx.strokeStyle = rgb(C.silver050, 0.25); ctx.lineWidth = 3 * U; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(cx - jw + 7 * U, jt + 26 * U); ctx.lineTo(cx - jw + 7 * U, jb - 16 * U); ctx.stroke();
          ctx.restore();
        },

        record() {
          const L = this.log, r = x => (x == null ? null : Math.round(x));
          return {
            v: 2, target: this.n, gestures: L.gestures, multi_max: L.multi_max,
            catch_latency_ms_median: r(median(L.lat)), apex_offset_ms_median: r(median(L.apex)),
            relaunches: L.relaunches, volleys: L.volleys, passes_dim: L.passes_dim, frost_touches: L.frost_touches,
          };
        },
      });
      Object.defineProperty(g, 'extra', { get() { return this.record(); }, enumerable: true, configurable: true });
      return g;
    },
  });
})();
