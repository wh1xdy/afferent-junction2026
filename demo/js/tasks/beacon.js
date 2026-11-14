(() => {
  const { clamp, lerp, rgb, mixc, median } = A;
  const J = A.J, { C, sprite, unit, finger, base, finish, fx, hap, sfx, beat, rm } = J;
  const E = J.ease, R = Math.random, ID = 'beacon';
  const V_SEA = 0.565, V_LANE = 0.69, V_PIER = 0.858, V_MOOR = 0.9, CATCH = 0.56, GRACE = 0.04, LH_H = 0.44, EXIT = 1.0, CHART_S = 15;
  const PIER_LX = [0.047, 0.143, 0.251, 0.362, 0.479, 0.58, 0.686, 0.788, 0.901, 0.957], PIER_LY = 0.11, NL = PIER_LX.length;
  const has = n => !!A.Art?.has(n);
  const aspect = (n, fb) => (has(n) ? A.Art.aspect(n) : fb);
  const art = (ctx, n, x, y, w, h, sat = 1, light = 1, alpha = 1) => has(n) && A.Art.draw(ctx, n, x, y, w, h, sat, light, alpha);

  A.Skill?.define(ID, {
    bpm: { v0: 84, v1: 100, cat: 'tempo' },
    perfect: { v0: 0.06, v1: 0.032, geo: true, cat: 'precision' },
    good: { v0: 0.11, v1: 0.065, geo: true, cat: 'precision' },
    barely: { v0: 0.17, v1: 0.11, geo: true, cat: 'precision' },
    tele: { v0: 2, v1: 1, geo: true, cat: 'tempo' },
    n: { v0: 8, v1: 18, int: true, cat: 'load' },
    dens: { v0: 0, v1: 1, cat: 'load' },
    tiers: [4, 8, 12],
  });
  const ax = (name, fb) => (A.Skill ? A.Skill.axis(ID, name, fb) : fb);

  const MOTIFS = [
    { g: [2, 3], need: 0 }, { g: [1, 3], need: 0.25 },
    { g: [1, 2], need: 0.5 }, { g: [1, 1, 2], need: 0.5 }, { g: [1, 1, 1, 2], need: 0.5 },
    { g: [0.5, 1.5, 2], need: 0.6 }, { g: [0.5, 1.5, 1], need: 0.6 }, { g: [0.5, 0.5, 2], need: 0.6 },
    { g: [1.5, 0.5, 2], need: 0.8 }, { g: [1.5, 1.5, 1], need: 0.8 },
  ].map(m => ({ ...m, avg: m.g.reduce((a, b) => a + b, 0) / m.g.length }));
  const pickMotif = (d, want) => {
    const pool = MOTIFS.filter(m => m.need <= d);
    let best = pool[0], bs = Infinity;
    for (const m of pool) {
      const s = Math.abs(m.avg - want) - (d >= 0.5 ? 0.35 * m.need : 0) + 0.3 * R();
      if (s < bs) { bs = s; best = m; }
    }
    return best;
  };

  const quant = (a, p) => {
    if (!a.length) return null;
    const s = [...a].sort((x, y) => x - y), i = (s.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i);
    return s[lo] + (s[hi] - s[lo]) * (i - lo);
  };
  const r0 = x => (x == null ? null : Math.round(x));
  const seaCache = { key: '', cv: null, top: 0 };

  A.defineTask(ID, {
    modes: ['wake', 'fatigue'], role: 'Rhythm Heaven (Karate Man); osu! approach circle', minS: 12,
    bpm: (tempo, k) => Math.min(104, A.Skill ? ax('bpm', tempo + 20 * k) : Math.min(96, tempo + 20 * k)),
    make(k) {
      return base(ID, 20, {
        boats: null, n: 0, P: 0.7, t0: 0, bpm: 0, ci: 0, resolved: 0, fin: 0, missed: 0, returns: 0, unlit: 0, practice: 0, empty: 0, taps: 0, offs: [], wins: [], wc: null,
        tier: 0, feverUntil: -9, hitAt: -9, holdS: 0, holdT: -9, nearAt: -9, emptyAt: -9, tapAt: -9, payAt: null, light: 0,
        lan: new Array(NL).fill(0), lanAt: new Array(NL).fill(-9), b: null, outro: rm() ? 1.8 : 1.6, step: rm() ? 0.09 : 0.07,

        box() { return this.b || A.session?.box?.() || { x: 0, y: 0, w: 335, h: 388 }; },

        build(now) {
          const P = this.P = beat.period(), t0 = this.t0 = beat.t0 || now;
          this.bpm = 60 / P;
          let n = Math.max(5, Math.round(ax('n', 6 + Math.round(4 * k))));
          const d0 = ax('dens', k), F = Math.round(13.4 / P);
          const pos = [2];
          let p = 2, m = null, mi = 0, third = -1;
          for (let j = 1; j <= n - 2; j++) {
            const th = Math.floor(3 * j / n);
            if (th !== third) {
              third = th;
              m = pickMotif(d0 + [0, 0.06, 0.12][th], (F - 2 - p) / Math.max(1, n - 1 - j));
              mi = 0;
            }
            let gap = m.g[mi++ % m.g.length];
            if (p % 1 && gap % 1 === 0) gap = 0.5;
            p += gap; pos.push(p);
          }
          pos.push(p + (p % 1 ? 2.5 : 2));
          const limit = Math.max(6, Math.min(this.max, CHART_S) - 1);
          while (pos.length > 5 && pos[pos.length - 1] * P > limit) {
            pos.splice(pos.length - 2, 1);
            const last = pos[pos.length - 2];
            pos[pos.length - 1] = last + (last % 1 ? 2.5 : 2);
          }
          n = this.n = pos.length;
          A.Skill?.progress(ID, 0, n);
          this.boats = pos.map((bp, j) => {
            const bt = { j, ferry: j === n - 1, li: -1, moor: 0, passes: 0, state: 'wait', tele: 2, tA: 0, tR: 0, mt: -9, resT: 0, dockAt: 0, hitAt: -9, missAt: -9, grade: null, rs: 0, rv: V_LANE, face0: 1, ex: 1 };
            this.place(bt, bp);
            return bt;
          });
          fx.limit = 90;
          this.log();
        },

        place(bt, p) {
          bt.p = p; bt.tl = this.t0 + p * this.P; bt.side = p % 1 ? 0 : Math.round(p) % 2 ? -1 : 1;
          bt.plan = undefined; bt.botTapped = false;
        },

        limitAt(now) { return now - this.t + this.max - 0.6; },

        requeue(bt, now) {
          const cur = (now - this.t0) / this.P, minB = Math.ceil(cur + EXIT / this.P + 3.4), lim = this.limitAt(now);
          const ferry = this.boats.find(q => q.ferry);
          if (bt.j === 0 && !this.items && (this.taps === 0 || bt.passes < 3)) {
            let q = bt.p;
            while (q < minB) q += 2;
            const delta = q - bt.p;
            for (const o of this.boats) if (o === bt || o.state === 'wait') this.place(o, o.p + delta);
            while (this.t0 + ferry.p * this.P > lim) {
              const rest = this.boats.filter(o => o.state === 'wait' && !o.ferry);
              if (rest.length < 2) break;
              const drop = rest[rest.length - 1];
              this.boats.splice(this.boats.indexOf(drop), 1);
              const last = Math.max(bt.p, ...this.boats.filter(o => !o.ferry).map(o => o.p));
              this.place(ferry, last + (last % 1 ? 2.5 : 2));
            }
            this.n = this.boats.length;
            this.practice++;
            return true;
          }
          if (bt.ferry) {
            if (this.t0 + minB * this.P > lim) return false;
            this.place(bt, minB);
            return true;
          }
          if (ferry.state !== 'wait') return false;
          const last = Math.max(...this.boats.filter(o => !o.ferry && o !== bt && (o.state === 'wait' || o.state === 'in' || o.state === 'out')).map(o => o.p), -9);
          const q = Math.max(minB, Math.ceil(last + 1.5)), fp = q + 2;
          if (this.t0 + fp * this.P > lim) return false;
          this.place(bt, q); this.place(ferry, fp);
          return true;
        },

        settle(bt) {
          if (!bt.ferry) {
            const f = Math.min(this.fin, this.n - 2), m = Math.max(1, this.n - 2);
            bt.li = Math.round(f * (NL - 1) / m); bt.moor = lerp(-0.86, 0.86, this.n > 2 ? f / m : 0.5);
          }
          this.fin++;
          if (A.Skill?.progress(ID, this.fin, this.n)) J.stinger();
          J.border(0.15 + 0.6 * this.fin / this.n);
        },

        win() {
          if (this.wc && this.wc.i === this.resolved) return this.wc;
          const fb = 0.18 - 0.06 * k;
          return (this.wc = { i: this.resolved, perfect: ax('perfect', fb * 0.35), good: ax('good', fb * 0.65), barely: ax('barely', fb) });
        },

        show(bt) {
          bt.tele = bt.j === 0 || bt.ferry ? 2 : clamp(Math.round(ax('tele', 2 - k) * 2) / 2, 1, 2);
          bt.tR = bt.tl - bt.tele * this.P;
          bt.tA = bt.tl - (bt.tele + 1.1) * this.P;
          bt.state = 'in';
        },

        pose(bt, now) {
          if (bt.state === 'wait') return null;
          if (bt.state === 'in') {
            const p = clamp((now - bt.tA) / (bt.tl - bt.tA), 0, 1), late = Math.max(0, now - bt.tl) / this.P;
            if (bt.side === 0) return { s: 0.02 * late, v: lerp(V_SEA + 0.04, V_LANE + 0.035, E.outSoft(p)), sc: (bt.ferry ? 1 : lerp(0.55, 1, p)), face: 1, a: clamp(p * 3, 0, 1) };
            const s = lerp(bt.side * 1.22, bt.side * CATCH, 1 - (1 - p) ** 1.7) - bt.side * 0.05 * late;
            return { s, v: V_LANE, sc: 1, face: -bt.side, a: clamp(p * 4, 0, 1) };
          }
          const dur = bt.dockAt - bt.resT, q = clamp((now - bt.resT) / dur, 0, 1), hit = !!bt.grade;
          const e = hit ? E.inOut(q) : E.breath(q), dir = Math.sign(bt.moor - bt.rs) || bt.face0;
          const turn = rm() ? (q > 0.15 ? 1 : 0) : E.inOut(clamp((now - bt.resT) / 0.32, 0, 1));
          return {
            s: lerp(bt.rs, bt.moor, e), v: lerp(bt.rv, V_MOOR, e) - Math.sin(Math.PI * e) * 0.015,
            sc: lerp(1, bt.ferry ? 0.72 : 0.5, e), face: lerp(bt.face0, dir, turn), a: 1, q,
          };
        },

        resolve(bt, now) {
          const ps = this.pose(bt, now) || { s: bt.side * CATCH, v: V_LANE, face: -bt.side || 1 };
          bt.rs = ps.s; bt.rv = ps.v; bt.face0 = Math.sign(ps.face) || 1; bt.resT = now; bt.mt = bt.tl; bt.passes++;
          this.resolved++;
        },

        trial(grade, now) {
          const r = A.Skill?.trial(ID, grade);
          if (!r) { this.light = this.items / Math.max(1, this.n); return; }
          if (r.up) sfx('beacon_tier', { tier: r.tier });
          this.tier = r.tier; this.light = r.light;
          if (r.fever) { this.feverUntil = now + 2.6; hap.seq([['medium', 160]]); }
        },

        hit(bt, grade, now) {
          this.resolve(bt, now);
          this.settle(bt);
          bt.state = 'hit'; bt.grade = grade; bt.hitAt = J.at; bt.missAt = -9; bt.dockAt = now + (bt.ferry ? 1.0 : 1.15);
          this.items++;
          this.trial(grade, now);
          this.holdS = bt.side * CATCH; this.holdT = now; this.hitAt = J.at;
          const b = this.box(), U = unit(b), L = this.lamp(b), ps = this.pose(bt, now), x = b.x + b.w * (0.5 + 0.5 * ps.s), y = b.y + b.h * bt.rv;
          const fever = now < this.feverUntil, big = grade === 'perfect' || fever || bt.ferry;
          if (!rm()) {
            J.hitstop(this, bt.ferry ? 120 : grade === 'barely' ? 50 : 100);
            const dx = x - L[0], dy = y - L[1], dl = Math.hypot(dx, dy) || 1, ux = dx / dl, uy = dy / dl;
            const m = (grade === 'barely' ? 6 : 11 + Math.round(3 * R())) + (fever ? 4 : 0) + (bt.ferry ? 8 : 0);
            for (let i = 0; i < m; i++) {
              const sp = (140 + 160 * R()) * U, a = (R() - 0.5) * 0.9;
              fx.add({ x, y: y - 26 * U * (bt.ferry ? 0.6 : 1), vx: (ux * Math.cos(a) - uy * Math.sin(a)) * sp, vy: (uy * Math.cos(a) + ux * Math.sin(a)) * sp - 40 * U, g: 220 * U, drag: 3, life: 0.5, size: [(big ? 7 : 5.5) * U, 1 * U], kind: 'spark', c: grade === 'barely' ? C.warm : i % 3 ? C.amber : C.glow });
            }
          }
          J.bloom(x, y - 30 * U, (bt.ferry ? 80 : 46) * U * (big ? 1.3 : 1) * (1 + 0.12 * this.tier), C.amber, grade === 'barely' ? 0.35 : 0.6, 0.12, 0.5);
          if (bt.ferry) hap('medium');
          else if (grade === 'perfect') hap.seq([['light', 0], ['tick', 40]]);
          else hap('light');
          sfx('beacon_hit', { step: this.fin - 1, n: this.n, grade, tier: this.tier, ferry: bt.ferry });
          this.log();
          if (bt.ferry) this.end(now, true);
        },

        miss(bt, now) {
          this.resolve(bt, now);
          this.missed++;
          if (this.taps) this.trial('miss', now);
          if (this.requeue(bt, now)) {
            this.returns++;
            bt.state = 'out'; bt.ex = Math.sign(bt.rs) || 1; bt.outEnd = now + EXIT;
            sfx('beacon_turn');
            this.log();
            return;
          }
          this.settle(bt);
          this.unlit++;
          bt.state = 'miss'; bt.missAt = J.at; bt.dockAt = now + (bt.ferry ? 1.4 : 2.1);
          this.log();
          if (bt.ferry) this.end(now, false);
        },

        dock(bt, now) {
          bt.state = 'home';
          if (bt.ferry || bt.li < 0) return;
          const v = bt.grade ? 1 : 0.38;
          this.lan[bt.li] = Math.max(this.lan[bt.li], v); this.lanAt[bt.li] = J.at;
          if (bt.grade && now < this.feverUntil && bt.li + 1 < NL) { this.lan[bt.li + 1] = Math.max(this.lan[bt.li + 1], 0.8); this.lanAt[bt.li + 1] = J.at + 0.06; }
          sfx('beacon_dock', { lit: !!bt.grade });
        },

        end(now, hit) {
          if (!this.taps) { this.max = Math.min(this.max, this.t); return; }
          finish(this, now);
          this.payAt = J.at;
          const b = this.box(), L = this.lamp(b), size = this.light >= 0.8 ? 1 : this.light >= 0.5 ? 0.7 : 0.45;
          J.bloom(L[0], L[1], b.w * (0.22 + 0.16 * size), C.glow, 0.45 * (hit ? 1 : 0.7), 0.3, 0.9);
          hap.seq([['success', 200]]);
          J.spill(0.35 + 0.55 * size * (hit ? 1 : 0.8));
          J.border(1);
          sfx('beacon_payoff', { size, hit });
          this.log();
        },

        log() {
          const w = this.wins;
          this.extra = {
            v: 3, boats: this.n, missed: this.missed, returns: this.returns, unlit: this.unlit, practice: this.practice, bpm: Math.round(this.bpm * 10) / 10,
            window_ms: w.length ? r0(1000 * w.reduce((a, b) => a + b, 0) / w.length) : r0(1000 * this.win().barely),
            offset_median_ms: r0(median(this.offs)), offset_iqr_ms: this.offs.length >= 2 ? r0(quant(this.offs, 0.75) - quant(this.offs, 0.25)) : null,
            empty_taps: this.empty,
          };
        },

        update(dt, now) {
          if (!this.boats) this.build(now);
          while (this.ci < 2 && now >= this.t0 + this.ci * this.P - 0.01) { hap('light'); sfx('beacon_count', { i: this.ci }); this.ci++; }
          const late = this.win().barely + GRACE + 0.05, b = this.box(), U = unit(b);
          for (const bt of this.boats) {
            if (bt.state === 'wait' && now >= bt.tl - 3.3 * this.P) this.show(bt);
            if (bt.state === 'in' && !this.done && now > bt.tl + late) { this.wins.push(this.win().barely); this.miss(bt, now); }
            if ((bt.state === 'hit' || bt.state === 'miss') && now >= bt.dockAt) this.dock(bt, now);
            if (bt.state === 'out' && now >= bt.outEnd) bt.state = 'wait';
            if (bt.state === 'hit' && !rm() && R() < dt * 22) {
              const ps = this.pose(bt, now);
              fx.trailMote(b.x + b.w * (0.5 + 0.5 * ps.s) - Math.sign(ps.face) * 22 * U * ps.sc, b.y + b.h * ps.v - 2 * U, C.amber, { life: 0.7, size: [2.2 * U, 0.6 * U], vy: -6 * U, alpha: [0.7, 0], add: true });
            }
          }
        },

        down(u, v, t, d) {
          const ts = d?.ts ?? t;
          this.lastIn = this.t; this.taps++; this.tapAt = J.at;
          if (!this.boats || this.done) return;
          let best = null, bd = Infinity;
          for (const bt of this.boats) {
            const tm = bt.state === 'in' ? bt.tl : bt.mt;
            const x = Math.abs(ts - tm);
            if (x < bd) { bd = x; best = bt; }
          }
          const near = best && bd < this.P / 2 ? best : null, now = A.now();
          if (near && near.state !== 'hit' && near.state !== 'home') {
            const off = ts - (near.state === 'in' ? near.tl : near.mt), adj = off > 0 ? Math.max(0, off - GRACE) : off, w = this.win(), a = Math.abs(adj);
            this.offs.push(Math.round(off * 1000));
            if (near.state === 'in' && a <= w.barely) {
              this.wins.push(w.barely);
              this.hit(near, a <= w.perfect ? 'perfect' : a <= w.good ? 'good' : 'barely', now);
              return;
            }
            this.errors++; this.nearAt = J.at;
            sfx('beacon_near');
            this.log();
            return;
          }
          this.empty++; this.emptyAt = J.at;
          sfx('beacon_empty');
          this.log();
        },

        auto(dt, now) {
          if (!this.boats) return;
          for (const bt of this.boats) {
            if (bt.state !== 'in') continue;
            if (bt.plan === undefined) {
              const w = this.win(), r = R(), sg = R() < 0.5 ? -1 : 1, u = R();
              let off = null;
              if (r < 0.15) off = sg * w.perfect * 0.8 * u;
              else if (r < 0.7) off = sg * lerp(w.perfect, w.good, 0.1 + 0.85 * u);
              else if (r < 0.8) off = sg * lerp(w.good, w.barely, 0.1 + 0.85 * u);
              bt.plan = off === null ? null : off > 0 ? off + GRACE : off;
            }
            if (bt.plan !== null && !bt.botTapped && now >= bt.tl + bt.plan) { bt.botTapped = true; this.down(0.5, 0.5, now, { ts: bt.tl + bt.plan }); }
          }
        },

        lamp(b) {
          const H = b.h * LH_H, bot = b.y + b.h * (V_SEA + 0.035);
          return [b.x + b.w / 2, bot - H + 0.125 * H, H, bot];
        },

        beamS(now) {
          const x = (now - this.t0) / this.P, c = Math.cos(Math.PI * x);
          let s = c * (1.5 - 0.5 * c * c);
          const h = now - this.holdT;
          if (h >= 0 && h < 0.22 && !rm()) s = lerp(this.holdS / CATCH, s, E.inOut(clamp((h - 0.12) / 0.1, 0, 1)));
          return s;
        },

        sea(ctx, b, dark) {
          const key = `${Math.round(b.w)}x${Math.round(b.h)}|${dark}|${has('task_beacon_sea')}`;
          if (seaCache.key !== key) {
            const cv = seaCache.cv || document.createElement('canvas'), w = Math.ceil(b.w), top = Math.floor(b.h * (V_SEA - 0.02)), h = Math.ceil(b.h - top);
            cv.width = w; cv.height = h;
            const x = cv.getContext('2d');
            x.clearRect(0, 0, w, h);
            const t = dark ? 0 : 0.22, gr = x.createLinearGradient(0, 0, 0, h);
            gr.addColorStop(0, rgb(mixc(C.night600, C.silver600, t), 0.95)); gr.addColorStop(0.35, rgb(mixc(C.night800, C.silver700, t), 0.95)); gr.addColorStop(1, rgb(C.night900, 0.9));
            x.fillStyle = gr; x.fillRect(0, 0, w, h);
            if (has('task_beacon_sea')) {
              const sh = w / aspect('task_beacon_sea', 10);
              A.Art.draw(x, 'task_beacon_sea', 0, 0, w, sh, 0.9, dark ? 0.75 : 0.9, 0.9);
              A.Art.draw(x, 'task_beacon_sea', -w * 0.4, (V_LANE - V_SEA + 0.01) * b.h, w * 1.8, sh * 1.3, 0.8, 0.6, 0.45);
            }
            x.strokeStyle = rgb(C.silver300, 0.28); x.lineWidth = 1;
            x.beginPath(); x.moveTo(0, b.h * 0.02 + 0.5); x.lineTo(w, b.h * 0.02 + 0.5); x.stroke();
            x.globalCompositeOperation = 'destination-in';
            const fh = x.createLinearGradient(0, 0, w, 0);
            fh.addColorStop(0, 'rgba(0,0,0,0)'); fh.addColorStop(0.1, 'rgba(0,0,0,1)'); fh.addColorStop(0.9, 'rgba(0,0,0,1)'); fh.addColorStop(1, 'rgba(0,0,0,0)');
            x.fillStyle = fh; x.fillRect(0, 0, w, h);
            const fv = x.createLinearGradient(0, 0, 0, h);
            fv.addColorStop(0, 'rgba(0,0,0,0)'); fv.addColorStop(0.05, 'rgba(0,0,0,1)'); fv.addColorStop(0.85, 'rgba(0,0,0,1)'); fv.addColorStop(1, 'rgba(0,0,0,0)');
            x.fillStyle = fv; x.fillRect(0, 0, w, h);
            seaCache.key = key; seaCache.cv = cv; seaCache.top = top;
          }
          ctx.drawImage(seaCache.cv, b.x, b.y + seaCache.top);
        },

        lighthouse(ctx, b, L, glowA) {
          const [lx, ly, H, bot] = L, U = unit(b);
          const w = H * aspect('task_beacon_lighthouse', 0.61);
          if (!art(ctx, 'task_beacon_lighthouse', lx - w / 2, bot - H, w, H, 0.85, 0.72 + 0.2 * glowA)) {
            const bw = 15 * U, tw = 10 * U, tb = bot - 14 * U, tt = ly + 12 * U, rockW = 34 * U;
            ctx.fillStyle = rgb(C.night950);
            ctx.beginPath(); ctx.moveTo(lx - rockW, bot); ctx.quadraticCurveTo(lx - rockW * 0.7, bot - 18 * U, lx - rockW * 0.2, bot - 14 * U); ctx.quadraticCurveTo(lx + rockW * 0.4, bot - 22 * U, lx + rockW, bot); ctx.closePath(); ctx.fill();
            const tg = ctx.createLinearGradient(lx - bw, 0, lx + bw, 0);
            tg.addColorStop(0, rgb(C.silver300)); tg.addColorStop(0.55, rgb(C.silver500)); tg.addColorStop(1, rgb(C.silver700));
            ctx.fillStyle = tg;
            ctx.beginPath(); ctx.moveTo(lx - bw, tb); ctx.lineTo(lx - tw, tt); ctx.lineTo(lx + tw, tt); ctx.lineTo(lx + bw, tb); ctx.closePath(); ctx.fill();
            ctx.save(); ctx.clip();
            ctx.fillStyle = rgb(C.night500, 0.95);
            for (const f of [0.3, 0.62]) ctx.fillRect(lx - bw, lerp(tb, tt, f), 2 * bw, (tb - tt) * 0.12);
            ctx.restore();
            ctx.fillStyle = rgb(C.night800); ctx.fillRect(lx - tw - 4 * U, tt - 2 * U, 2 * tw + 8 * U, 3 * U);
            ctx.fillStyle = rgb(C.glow, 0.95); ctx.fillRect(lx - tw * 0.7, ly - 6 * U, tw * 1.4, 12 * U);
            ctx.fillStyle = rgb(C.night800);
            ctx.beginPath(); ctx.moveTo(lx - tw - 1 * U, ly - 6 * U); ctx.quadraticCurveTo(lx, ly - 21 * U, lx + tw + 1 * U, ly - 6 * U); ctx.closePath(); ctx.fill();
          }
        },

        boat(ctx, b, bt, ps, now, at) {
          const U = unit(b), L = b.w * (bt.ferry ? 0.34 : 0.2) * ps.sc, x = b.x + b.w * (0.5 + 0.5 * ps.s), y = b.y + b.h * ps.v;
          const name = bt.ferry ? 'task_beacon_ferry' : 'task_beacon_boat', asp = aspect(name, bt.ferry ? 2.55 : 1.8), H = L / asp;
          let lamp = 0, ign = 1;
          if (bt.grade) { const t = now - bt.resT; lamp = 1; ign = rm() ? clamp(t / 0.2, 0, 1) : clamp(0.35 + t / 0.06, 0, 1); }
          else if (bt.missAt > -9) lamp = 0.4 * clamp((at - bt.missAt) / 0.6, 0, 1);
          let flare = 0;
          if (this.payAt !== null && bt.li >= 0) {
            const ct = this.payAt + 0.15 + bt.li * this.step;
            if (at >= ct) { lamp = 1; ign = 1; flare = rm() ? 0 : clamp(1 - (at - ct) / 0.5, 0, 1); }
          }
          const bob = rm() ? 0 : Math.sin(now * 1.7 + bt.j * 1.3) * 1.4 * U;
          const ht = at - bt.hitAt, [sx, sy] = bt.grade && !rm() ? J.squash(ht, 0.88, 0.16) : [1, 1];
          const whip = bt.grade && !rm() && ht < 0.4 ? 0.07 * Math.sin(ht / 0.4 * Math.PI * 3) * (1 - ht / 0.4) * (bt.side || 1) : 0;
          const wob = bt.grade === 'barely' ? J.wobble(ht) : [0, 1];
          const lampLocal = bt.ferry ? [0.02, -0.62] : [0.18, -0.9];
          const lx = x + lampLocal[0] * L * ps.face, ly = y + bob + lampLocal[1] * H * sy;
          if (lamp > 0) {
            const tier = 1 + 0.1 * this.tier + (bt.grade === 'perfect' ? 0.15 : 0);
            sprite(ctx, 'soft', C.amber, x, y + 3 * U, L * 0.9, 0.22 * lamp * ign * ps.a, true, 1, 0.22);
            sprite(ctx, 'soft', C.amber, x, y + 12 * U, L * 0.25, 0.25 * lamp * ign, true, 0.35, 1.6);
            const ov = bt.grade && !rm() ? E.outBack(clamp((now - bt.resT) / 0.25, 0, 1), 2.2) : 1;
            sprite(ctx, 'glow', bt.grade ? C.amber : C.warm, lx, ly, (bt.ferry ? 40 : 26) * U * ps.sc * tier * ov * (1 + 0.8 * flare), 0.75 * lamp * ign, true);
          }
          ctx.save();
          ctx.globalAlpha *= ps.a * wob[1];
          ctx.translate(x + wob[0] * U, y + bob);
          ctx.rotate(whip);
          ctx.scale(ps.face * sx, sy);
          const light = 0.5 + 0.35 * lamp;
          if (!art(ctx, name, -L / 2, -H * 0.88, L, H, bt.ferry ? 0.15 : 0.7, light)) {
            ctx.fillStyle = rgb(mixc(C.night950, C.night700, 0.3 * lamp));
            ctx.beginPath(); ctx.moveTo(-L / 2, -H * 0.42); ctx.lineTo(L / 2, -H * 0.5); ctx.quadraticCurveTo(L * 0.42, H * 0.05, L * 0.3, H * 0.1); ctx.lineTo(-L * 0.36, H * 0.1); ctx.quadraticCurveTo(-L * 0.48, 0, -L / 2, -H * 0.42); ctx.fill();
            if (bt.ferry) {
              ctx.fillStyle = rgb(mixc(C.silver600, C.silver200, 0.4 * lamp));
              ctx.fillRect(-L * 0.36, -H * 0.82, L * 0.64, H * 0.36);
              ctx.fillStyle = rgb(C.night800); ctx.fillRect(L * 0.02, -H * 1.02, L * 0.08, H * 0.22);
            } else {
              ctx.fillRect(-L * 0.25, -H * 0.82, L * 0.26, H * 0.36);
              ctx.strokeStyle = rgb(C.night950); ctx.lineWidth = 1.6 * U;
              ctx.beginPath(); ctx.moveTo(L * 0.18, -H * 0.45); ctx.lineTo(L * 0.18, -H * 0.88); ctx.stroke();
            }
          }
          if (bt.ferry && lamp > 0) for (let i = 0; i < 5; i++) sprite(ctx, 'soft', C.glow, -L * 0.2 + i * L * 0.11, -H * 0.46, 5 * U * ps.sc, 0.7 * lamp * ign, true);
          ctx.restore();
          if (!bt.ferry) sprite(ctx, 'mote', lamp > 0 ? C.daylight : C.silver400, lx, ly, (lamp > 0 ? 4 : 3) * U * ps.sc, lamp > 0 ? 0.95 * ign + 0.3 : 0.55 * ps.a, lamp > 0);
          return [lx, ly, x, y];
        },

        draw(ctx, b, at) {
          this.b = b;
          if (!this.boats) return;
          const now = A.now(), U = unit(b), P = this.P, L = this.lamp(b), [lx, ly] = L, dark = this.mode !== 'fatigue';
          const prog = this.resolved / Math.max(1, this.n), fever = now < this.feverUntil, done = this.done ? clamp((now - this.finishedAt) / 0.7, 0, 1) : 0;
          const X = s => b.x + b.w * (0.5 + 0.5 * s), yl = b.y + b.h * V_LANE;

          this.sea(ctx, b, dark);
          if (!rm()) {
            ctx.lineWidth = 1 * U;
            for (let i = 0; i < 6; i++) {
              const yy = b.y + b.h * (V_SEA + 0.03 + 0.055 * i + 0.004 * i * i), sp = (now * (6 + 3 * i) + i * 53) % (b.w * 1.4) - b.w * 0.2;
              for (const off of [0, b.w * 0.7]) {
                const xx = ((sp + off) % (b.w * 1.4)) - b.w * 0.2 + b.x, fade = clamp(Math.min(xx - b.x, b.x + b.w - xx) / (b.w * 0.15), 0, 1);
                ctx.strokeStyle = rgb(C.silver300, (0.07 + 0.012 * i) * fade);
                ctx.beginPath(); ctx.moveTo(xx - (10 + 2 * i) * U, yy); ctx.lineTo(xx + (8 + 2 * i) * U, yy); ctx.stroke();
              }
            }
          }

          const x = (now - this.t0) / P, ib = Math.floor(x), lastR = ib - (((ib % 2) + 2) % 2), lastL = ib - ((((ib - 1) % 2) + 2) % 2);
          const dim = 1 - 0.2 * clamp(1 - (at - this.nearAt) / 0.2, 0, 1), em = 0.18 * clamp(1 - (at - this.emptyAt) / 0.3, 0, 1);
          for (const [side, last] of [[1, lastR], [-1, lastL]]) {
            const age = now - (this.t0 + last * P), a = (0.22 + 0.08 * prog) * Math.exp(-Math.max(0, age) / 0.55) * dim;
            sprite(ctx, 'soft', mixc(C.silver100, C.glow, 0.3 + 0.5 * prog), X(side * CATCH), yl + 4 * U, 44 * U, a, true, 1, 0.22);
          }


          let s = this.beamS(now) * CATCH, ty = yl + 2 * U;
          if (this.done) s = lerp(s, 0, E.inOut(done)), ty = lerp(ty, b.y + b.h * V_MOOR, E.inOut(done));
          const wob = J.wobble(at - this.nearAt), tx = X(s) + wob[0] * U;
          const warm = clamp(0.2 + 0.6 * prog + 0.06 * this.tier + (fever ? 0.2 : 0), 0, 1), bc = mixc(C.silver100, fever ? C.amber : C.glow, warm);
          const pulse = 1 + 0.15 * clamp(1 - (at - this.tapAt) / 0.15, 0, 1) + 0.6 * clamp(1 - (at - this.hitAt) / 0.3, 0, 1);
          const hw = (13 + 5 * this.tier + 8 * prog + (fever ? 6 : 0) + 34 * E.outSoft(done)) * U, ba = (0.34 + 0.12 * prog + 0.12 * done) * dim * pulse * wob[1];
          const dx = tx - lx, dy = ty - ly, dl = Math.hypot(dx, dy) || 1, nx = -dy / dl, ny = dx / dl;
          ctx.save(); ctx.globalCompositeOperation = 'lighter';
          const gb = ctx.createLinearGradient(lx, ly, tx, ty);
          gb.addColorStop(0, rgb(bc, ba)); gb.addColorStop(0.7, rgb(bc, ba * 0.4)); gb.addColorStop(1, rgb(bc, ba * 0.16));
          ctx.fillStyle = gb;
          for (const [k, w0] of [[0.35, 2.2], [1, 1]]) {
            const w = hw * w0;
            ctx.globalAlpha = k;
            ctx.beginPath(); ctx.moveTo(lx + nx * 2.5 * U * w0, ly + ny * 2.5 * U * w0); ctx.lineTo(tx + nx * w, ty + ny * w * 0.3); ctx.lineTo(tx - nx * w, ty - ny * w * 0.3); ctx.lineTo(lx - nx * 2.5 * U * w0, ly - ny * 2.5 * U * w0); ctx.closePath(); ctx.fill();
          }
          ctx.restore();
          sprite(ctx, 'soft', bc, tx, ty + 2 * U, hw * 2.4 * (1 + 0.3 * (pulse - 1)), (0.3 + 0.15 * prog + em) * dim * pulse, true, 1, 0.24);
          if (this.tier >= 2 && !rm()) {
            for (let i = 0; i < 7; i++) {
              const f = (i + 0.5) / 7, gx = lerp(lx, tx, 0.55 + 0.45 * f) + Math.sin(i * 2.3) * hw * 0.8, gy = Math.max(b.y + b.h * (V_SEA + 0.01), lerp(ly, ty, 0.55 + 0.45 * f)) + 6 * U * Math.sin(i * 1.7);
              sprite(ctx, 'spark', C.silver050, gx, gy, 3.2 * U, 0.45 * Math.max(0, Math.sin(now * 2.1 + i * 1.9)), true);
            }
          }

          this.lighthouse(ctx, b, L, prog);

          const moving = [], lane = [];
          for (const bt of this.boats) {
            if (bt.state === 'wait') continue;
            const ps = this.pose(bt, now);
            if (!ps || ps.a <= 0) continue;
            (bt.state === 'in' ? lane : moving).push([bt, ps]);
          }
          moving.sort((p, q) => p[1].v - q[1].v || (p[0].ferry ? 1 : -1));
          for (const [bt, ps] of moving) this.boat(ctx, b, bt, ps, now, at);
          this.pier(ctx, b, at, now);

          for (const [bt, ps] of lane) {
            const [blx, bly, bx] = this.boat(ctx, b, bt, ps, now, at);
            bt.burst = bt.ferry ? [bx, bly + 6 * U] : [blx, bly];
            const r1 = (bt.ferry ? 24 : 10) * U;
            ctx.save(); ctx.globalAlpha *= ps.a;
            J.ring(ctx, bt.ferry ? bx : blx, bt.ferry ? bly + 6 * U : bly, r1, C.silver100, 0.22, 1.2 * U);
            if (now >= bt.tR) {
              const p = clamp((now - bt.tR) / (bt.tl - bt.tR), 0, 1), after = Math.max(0, now - bt.tl);
              const r = r1 * (1 + 2.6 * (1 - p)), a = (rm() ? 0.45 : 0.85) * Math.min(1, p * 4) * (1 - clamp(after / 0.15, 0, 1));
              J.ring(ctx, bt.ferry ? bx : blx, bt.ferry ? bly + 6 * U : bly, r, C.silver050, a, (bt.ferry ? 2.2 : 1.6) * U);
            }
            ctx.restore();
          }
          for (const bt of this.boats) {
            if (!bt.grade) continue;
            const t = at - bt.hitAt;
            if (t > 1.1) continue;
            const wx = X(bt.rs), wy = b.y + b.h * bt.rv + 3 * U;
            if (bt.burst && t < 0.35) {
              const q = t / 0.35, r1 = (bt.ferry ? 24 : 10) * U;
              J.ring(ctx, bt.burst[0], bt.burst[1], rm() ? r1 : r1 * (1 + 1.6 * E.outSoft(q)), bt.grade === 'barely' ? C.warm : C.glow, 0.8 * (1 - q), (rm() ? 1.6 : 2.6 * (1 - q) + 0.6) * U);
            }
            for (let i = 0; i < (rm() ? 1 : 3); i++) {
              const rp = rm() ? clamp(t / 0.6, 0, 1) : clamp(t * 1.5 - i * 0.18, 0, 1);
              if (rp <= 0 || rp >= 1) continue;
              ctx.save(); ctx.translate(wx, wy); ctx.scale(1, 0.25);
              J.ring(ctx, 0, 0, (rm() ? 30 : 14 + 62 * E.outSoft(rp)) * U * (bt.ferry ? 1.5 : 1), C.glow, 0.5 * (1 - rp), 2.4 * U);
              ctx.restore();
            }
          }

          const bp = rm() ? 0 : Math.exp(-4 * (x - ib)) * (this.done ? 0 : 1);
          sprite(ctx, 'glow', mixc(C.glow, C.amber, prog), lx, ly, (26 + 16 * prog + 6 * this.tier + 24 * done) * U * (1 + 0.12 * bp), 0.72 + 0.12 * bp, true);
          sprite(ctx, 'mote', C.daylight, lx, ly, 6 * U, 0.9, true);

          if (this.taps === 0 && !this.done) {
            const idle = this.boats.filter(q => q.state !== 'wait' && q.state !== 'in').length >= 2;
            const nx2 = idle && lane.find(([q]) => now >= q.tR);
            if (nx2) {
              const [bt, ps] = nx2, d = (now - bt.tl) / P, press = clamp(1 - Math.abs(d) / 0.3, 0, 1);
              finger(ctx, X(ps.s) + 6 * U, yl - (64 - 12 * press) * U, 30 * U, 0.85 * ps.a);
            }
          }
        },

        pier(ctx, b, at, now) {
          const U = unit(b), pw = b.w * 0.98, ph = pw / aspect('task_beacon_pier_lanterns', 6.06), px = b.x + (b.w - pw) / 2, py = b.y + b.h * V_PIER;
          const pay = this.payAt === null ? 0 : clamp((at - this.payAt) / 0.6, 0, 1);
          if (!art(ctx, 'task_beacon_pier_lanterns', px, py, pw, ph, 0.75, 0.42 + 0.25 * pay)) {
            ctx.fillStyle = rgb(C.wood);
            ctx.fillRect(px, py + ph * 0.4, pw, ph * 0.14);
            ctx.fillStyle = rgb(C.woodD);
            for (const f of PIER_LX) ctx.fillRect(px + f * pw - 3 * U, py + ph * 0.06, 6 * U, ph * 0.66);
            for (const f of PIER_LX) { ctx.fillStyle = rgb(C.woodL); ctx.fillRect(px + f * pw - 4 * U, py + ph * PIER_LY - 5 * U, 8 * U, 10 * U); }
          }
          const step = this.step, size = this.light >= 0.8 ? 1 : this.light >= 0.5 ? 0.8 : 0.62;
          for (let i = 0; i < NL; i++) {
            let v = this.lan[i], t0 = this.lanAt[i];
            if (this.payAt !== null) { const ct = this.payAt + 0.15 + i * step; if (at >= ct) { v = Math.max(v, size); t0 = Math.max(t0, ct); } }
            if (v <= 0 || at < t0) continue;
            const lx = px + PIER_LX[i] * pw, ly = py + PIER_LY * ph, age = at - t0, fl = rm() ? 0 : clamp(1 - age / 0.6, 0, 1), on = rm() ? clamp(age / 0.25, 0, 1) : 1;
            const c = mixc(C.warm, C.amber, v), shim = rm() ? 1 : 0.85 + 0.15 * Math.sin(now * 1.3 + i * 2.1);
            sprite(ctx, 'glow', c, lx, ly, (14 + 10 * v + 18 * fl) * U, (0.45 + 0.4 * v) * on, true);
            sprite(ctx, 'mote', C.daylight, lx, ly, 3 * U, (0.5 + 0.5 * v) * on, true);
            sprite(ctx, 'soft', c, lx, py + ph * 0.95, 9 * U, 0.35 * v * on * shim, true, 0.4, 2.2);
            if (fl > 0.9 && !rm() && R() < 0.5) fx.rise(lx, ly - 4 * U, 1, C.amber, { life: 0.6 });
          }
        },
      });
    },
  });
})();
