(() => {
  // M27 Fog Faces: interpretation bias. A face drifts out of the fog; most are ambiguous.
  // Swipe up if it looks happy, down if it looks sad. There is no right answer.
  const { clamp, lerp, rgb, mixc } = A;
  const J = A.J, { C, sprite, glow, disc, unit, dragCue, base, finish, fx, hap, sfx, rm } = J;
  const K = A.TaskKit, R = Math.random, ID = 'fog', FADE = 0.35, LIMIT = 3, ITI = 0.45, SWIPE = 0.07;
  const LEVELS = [-1, -0.6, -0.3, 0, 0.3, 0.6, 1, -0.15, 0.15, 0, -0.3, 0.3];

  // Face with a continuous expression m in [-1 sad .. +1 happy].
  const face = (ctx, x, y, s, m, a) => {
    ctx.save(); ctx.globalAlpha *= a; ctx.translate(x, y);
    disc(ctx, 0, 0, s, mixc(C.peach, C.silver100, 0.45));
    ctx.fillStyle = rgb(mixc(C.silver600, C.sky, 0.3)); ctx.beginPath(); ctx.arc(0, -s * 0.15, s * 1.02, Math.PI * 1.08, Math.PI * 1.92); ctx.fill();
    const ink = mixc(C.silver700, C.night800, 0.4);
    ctx.strokeStyle = rgb(ink, 0.85); ctx.lineWidth = s * 0.075; ctx.lineCap = 'round';
    const hp = Math.max(0, m);
    for (const d of [-1, 1]) {
      // Eyes: happy narrows into a soft crescent, sad droops at the outer corner.
      ctx.save(); ctx.translate(d * s * 0.36, -s * 0.06); ctx.rotate(d * Math.min(0, m) * -0.25);
      ctx.fillStyle = rgb(ink, 0.9); ctx.beginPath(); ctx.ellipse(0, 0, s * 0.1, s * 0.1 * (1 - 0.55 * hp), 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      // Brows: sad lifts the inner end, happy lifts the outer end a little.
      ctx.beginPath();
      ctx.moveTo(d * s * 0.18, -s * 0.32 + m * s * 0.06);
      ctx.lineTo(d * s * 0.52, -s * 0.32 - m * s * 0.03);
      ctx.stroke();
    }
    // Mouth: curvature follows m.
    const cy = s * 0.42, edge = cy - m * s * 0.07;
    ctx.beginPath(); ctx.moveTo(-s * 0.3, edge); ctx.quadraticCurveTo(0, cy + m * s * 0.22, s * 0.3, edge); ctx.stroke();
    ctx.restore();
  };

  // Estimated m where p(sad) crosses 0.5, by linear interpolation over sorted levels.
  const crossing = pts => {
    for (let i = 0; i < pts.length; i++) if (pts[i][1] === 0.5) return pts[i][0];
    for (let i = 0; i + 1 < pts.length; i++) {
      const [m0, p0] = pts[i], [m1, p1] = pts[i + 1];
      if ((p0 - 0.5) * (p1 - 0.5) < 0) return lerp(m0, m1, (0.5 - p0) / (p1 - p0));
    }
    return null;
  };

  A.defineTask(ID, {
    modes: ['calm', 'flow'], role: 'Interpretation bias (ambiguous faces in fog)', minS: 18,
    make() {
      const trials = K.shuffle(LEVELS.map(m => ({ m, on: null, onAt: null, resp: null, rt: null, timeout: false })));
      const n = trials.length;
      return base(ID, n * (LIMIT + ITI) + 3, {
        trials, i: -1, state: 'gap', stateAt: 0, b: null, bot: null, ptr: null, tilt: 0,
        flashAt: -9, last: null, lastDir: 0, outro: 1.3,
        extra: { v: 1, n_faces: n },

        sync() {
          const d = this.trials.filter(t => t.resp !== null);
          const amb = d.filter(t => Math.abs(t.m) <= 0.3 + 1e-9);
          const by = new Map();
          for (const t of d) { const e = by.get(t.m) || [0, 0]; e[0] += t.resp === 'sad' ? 1 : 0; e[1]++; by.set(t.m, e); }
          const pts = [...by.entries()].sort((a, b) => a[0] - b[0]).map(([m, [s, k]]) => [m, s / k]);
          Object.assign(this.extra, {
            sad_share_ambiguous: amb.length ? K.r3(amb.filter(t => t.resp === 'sad').length / amb.length) : null,
            balance_point: K.r3(crossing(pts)),
            rt_median_ms: K.ms(K.median(d.map(t => t.rt))),
            timeouts: this.trials.filter(t => t.timeout).length,
            n_faces: n,
          });
          this.items = d.length; this.errors = this.extra.timeouts;
        },

        cur() { return this.state === 'show' ? this.trials[this.i] : null; },

        respond(dir, t) {
          const c = this.cur();
          if (!c || c.resp !== null) return;
          c.resp = dir > 0 ? 'happy' : 'sad'; c.rt = Math.max(0, t - c.on);
          this.flashAt = J.at; this.last = c; this.lastDir = dir;
          const b = this.b;
          // Same soft glow for either answer: there is no right one.
          if (b) { const U = unit(b), cx = b.x + b.w / 2, cy = b.y + b.h * 0.47; fx.burst(cx, cy, 8, C.silver050, 90 * U, { kind: 'spark', size: [3.5 * U, 1] }); J.bloom(cx, cy, 90 * U, C.silver100, 0.22, 0.12, 0.45); }
          hap('light'); sfx('fog_drift', { piano: [3 + (this.items % 5), 0.1] });
          this.state = 'gap'; this.stateAt = this.t;
          J.border((this.i + 1) / this.trials.length);
          this.sync();
        },

        update(dt, now) {
          this.tilt *= Math.exp(-dt * 6);
          if (this.done) return;
          if (this.state === 'gap' && this.t - this.stateAt >= ITI) {
            if (this.i + 1 >= this.trials.length) { this.sync(); finish(this, now); hap('success'); sfx('fog_done'); J.border(1); J.spill(0.35); return; }
            this.i++; this.state = 'show'; this.stateAt = this.t;
            const c = this.trials[this.i]; c.on = now; c.onAt = J.at;
          }
          if (this.state === 'show' && this.t - this.stateAt >= LIMIT) {
            const c = this.trials[this.i]; c.timeout = true;
            this.last = c; this.lastDir = 0; this.flashAt = J.at;
            this.state = 'gap'; this.stateAt = this.t;
            J.border((this.i + 1) / this.trials.length);
            this.sync();
          }
        },

        down(u, v, t) { if (this.done) return; this.lastIn = this.t; this.ptr = { u, v, t, fired: false }; },
        move(u, v, t) {
          const p = this.ptr;
          if (!p || p.fired) return;
          const dy = v - p.v;
          this.tilt = clamp(dy / SWIPE, -1, 1);
          if (Math.abs(dy) >= SWIPE) { p.fired = true; this.respond(dy < 0 ? 1 : -1, t); }
        },
        up(u, v, t) {
          const p = this.ptr;
          this.ptr = null;
          if (!p || p.fired || this.done) return;
          const dy = v - p.v;
          // A plain tap counts by screen half: top half happy.
          this.respond(Math.abs(dy) >= SWIPE * 0.5 ? (dy < 0 ? 1 : -1) : v < 0.5 ? 1 : -1, t);
        },

        auto(dt, now) {
          const c = this.cur(), B = this.bot || (this.bot = { for: null });
          if (!c || c.resp !== null) return;
          if (B.for !== c) { B.for = c; B.at = now + 0.7 + 0.4 * R(); B.dir = R() < 1 / (1 + Math.exp(6 * (c.m - 0.05))) ? -1 : 1; }
          if (now >= B.at) { this.down(0.5, 0.5, now); this.move(0.5, 0.5 - B.dir * 0.1, now); this.up(0.5, 0.5 - B.dir * 0.1, now); }
        },

        draw(ctx, b, at) {
          this.b = b;
          const U = unit(b), cx = b.x + b.w / 2, cy = b.y + b.h * 0.47, still = rm();
          K.card(ctx, b, mixc(C.sky, C.silver100, 0.45), mixc(C.silver300, C.sky, 0.4));
          K.clip(ctx, b);
          // Back fog banks.
          const rng = A.rng(27);
          for (let k = 0; k < 9; k++) {
            const sp = 0.04 + rng() * 0.05, ph = rng() * 6.283;
            const x = b.x + ((rng() + (still ? 0 : at * sp * 0.1)) % 1.2 - 0.1) * b.w, y = b.y + (0.2 + rng() * 0.6) * b.h;
            sprite(ctx, 'soft', C.silver050, x, y + (still ? 0 : Math.sin(at * 0.3 + ph) * 6 * U), (60 + rng() * 60) * U, 0.35, false, 1.6, 0.7);
          }
          const c = this.cur(), s = Math.min(b.w, b.h) * 0.17;
          if (c) {
            const p = still ? 1 : J.ease.outSoft(clamp((at - c.onAt) / FADE, 0, 1));
            glow(ctx, cx, cy, s * 2.2, C.silver050, 0.25 * p);
            face(ctx, cx, cy + (1 - p) * 12 * U + this.tilt * 8 * U, s, c.m, p);
          } else if (this.last && this.state === 'gap') {
            // The last face drifts the way it was sent and melts back into the fog.
            const q = clamp((this.t - this.stateAt) / ITI, 0, 1), dy = still ? 0 : -this.lastDir * q * 26 * U;
            face(ctx, cx, cy + dy, s, this.last.m, 1 - q);
          }
          // Front fog veil keeps every face a little uncertain.
          for (let k = 0; k < 4; k++) {
            const o = still ? 0 : Math.sin(at * 0.25 + k * 1.7) * 18 * U;
            sprite(ctx, 'soft', C.silver050, cx + (k - 1.5) * s * 1.1 + o, cy + (k % 2 ? 0.4 : -0.3) * s, s * 1.3, 0.16, false, 1.5, 0.8);
          }
          const fa = clamp(1 - (at - this.flashAt) / 0.5, 0, 1);
          if (fa > 0 && this.lastDir !== 0) glow(ctx, cx, cy, s * 2.6, C.silver050, 0.35 * fa);
          ctx.font = `${Math.round(10 * U)}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillStyle = rgb(C.silver700, 0.4);
          ctx.fillText('Happy', cx, b.y + 16 * U);
          ctx.fillText('Sad', cx, b.y + b.h - 32 * U);
          K.progress(ctx, b, this.trials.length, Math.max(0, this.i + (this.state === 'gap' ? 1 : 0)), U);
          if (c && this.i === 0 && c.resp === null && at - c.onAt > 1.2 && !still) {
            const r = s * 1.25, len = 55 * U;
            dragCue(ctx, J.line(cx + r, cy - 10 * U, cx + r, cy - 10 * U - len), U, at, 0.8, 1.8);
            dragCue(ctx, J.line(cx - r, cy + 10 * U, cx - r, cy + 10 * U + len), U, at + 0.9, 0.8, 1.8);
          }
          ctx.restore();
        },
      });
    },
  });
})();
