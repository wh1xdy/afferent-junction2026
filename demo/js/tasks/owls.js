(() => {
  // M12 Owl Search: visual search. A grove of sleeping owls; tap the one with open eyes.
  const { clamp, lerp, rgb, mixc } = A;
  const J = A.J, { C, sprite, glow, disc, unit, tapCue, base, finish, fx, hap, sfx, rm } = J;
  const K = A.TaskKit, R = Math.random, ID = 'owls', LIMIT = 5, ITI = 0.55, SIZES = [4, 8, 12];
  const GRID = [4, 4];

  const owl = (ctx, x, y, s, open, a, look) => {
    ctx.save(); ctx.globalAlpha *= a; ctx.translate(x, y);
    const body = mixc(C.silver500, C.woodL, 0.45);
    ctx.fillStyle = rgb(body); ctx.beginPath(); ctx.ellipse(0, s * 0.15, s * 0.8, s, 0, 0, 6.283); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-s * 0.7, -s * 0.55); ctx.lineTo(-s * 0.55, -s * 1.05); ctx.lineTo(-s * 0.25, -s * 0.7); ctx.lineTo(s * 0.25, -s * 0.7); ctx.lineTo(s * 0.55, -s * 1.05); ctx.lineTo(s * 0.7, -s * 0.55); ctx.fill();
    ctx.fillStyle = rgb(mixc(body, C.silver050, 0.45)); ctx.beginPath(); ctx.ellipse(0, s * 0.4, s * 0.48, s * 0.55, 0, 0, 6.283); ctx.fill();
    for (const d of [-1, 1]) {
      disc(ctx, d * s * 0.32, -s * 0.3, s * 0.27, mixc(body, C.silver050, 0.6));
      if (open) { disc(ctx, d * s * 0.32, -s * 0.3, s * 0.2, C.gold); disc(ctx, d * s * 0.32 + look * s * 0.04, -s * 0.3, s * 0.1, C.night950); }
      else { ctx.strokeStyle = rgb(C.night900, 0.85); ctx.lineWidth = s * 0.08; ctx.lineCap = 'round'; ctx.beginPath(); ctx.arc(d * s * 0.32, -s * 0.36, s * 0.15, 0.3, Math.PI - 0.3); ctx.stroke(); }
    }
    ctx.fillStyle = rgb(C.amberDeep); ctx.beginPath(); ctx.moveTo(-s * 0.08, -s * 0.15); ctx.lineTo(s * 0.08, -s * 0.15); ctx.lineTo(0, s * 0.05); ctx.fill();
    ctx.restore();
  };

  A.defineTask(ID, {
    modes: ['wake', 'flow', 'fatigue'], role: 'Visual search (owl in a birch grove)', minS: 14,
    make() {
      const order = K.shuffle([...SIZES, ...SIZES]);
      const searches = order.map(n => {
        const cells = K.shuffle([...Array(GRID[0] * GRID[1]).keys()]).slice(0, n);
        return { n, cells, target: Math.floor(R() * n), jit: cells.map(() => [(R() - 0.5) * 0.4, (R() - 0.5) * 0.3]), on: null, rt: null, wrong: 0, found: false };
      });
      return base(ID, searches.length * (2.2 + ITI) + 4, {
        searches, i: -1, state: 'gap', stateAt: 0, b: null, bot: null, foundAt: -9, wrongAt: -9, wrongCell: -1, outro: 1.3,
        extra: { v: 1, n_searches: searches.length, set_sizes: SIZES },

        pos(s, j, b) {
          const U = unit(b), c = s.cells[j], col = c % GRID[0], row = Math.floor(c / GRID[0]);
          const gw = b.w * 0.86, gh = b.h * 0.66, x0 = b.x + (b.w - gw) / 2, y0 = b.y + b.h * 0.18;
          return { x: x0 + (col + 0.5 + s.jit[j][0]) * gw / GRID[0], y: y0 + (row + 0.5 + s.jit[j][1]) * gh / GRID[1], s: Math.min(gw / GRID[0], gh / GRID[1]) * 0.27, U };
        },

        sync() {
          const d = this.searches.filter(s => s.found || s.timedOut), by = {};
          for (const n of SIZES) by[n] = K.median(d.filter(s => s.n === n && s.found).map(s => s.rt));
          const pts = d.filter(s => s.found).map(s => [s.n, s.rt]);
          const sl = K.slope(pts);
          Object.assign(this.extra, {
            rt_by_set_ms: Object.fromEntries(SIZES.map(n => [n, K.ms(by[n])])), search_rt_median_ms: K.ms(K.median(pts.map(p => p[1]))),
            search_slope_ms_per_item: sl === null ? null : Math.round(sl * 1000), wrong_taps: this.searches.reduce((a, s) => a + s.wrong, 0),
            timeouts: d.filter(s => s.timedOut).length,
          });
          this.items = d.filter(s => s.found).length; this.errors = this.extra.wrong_taps + this.extra.timeouts;
        },

        update(dt, now) {
          if (this.done) return;
          const T = this.t - this.stateAt;
          if (this.state === 'gap' && T >= ITI) {
            if (this.i + 1 >= this.searches.length) { this.sync(); finish(this, now); hap('success'); sfx('owls_done'); J.border(1); J.spill(0.35); return; }
            this.i++; this.state = 'search'; this.stateAt = this.t;
            const s = this.searches[this.i]; s.on = now; s.onAt = J.at;
            sfx('owls_rustle');
          } else if (this.state === 'search' && T >= LIMIT) {
            const s = this.searches[this.i]; s.timedOut = true; this.state = 'gap'; this.stateAt = this.t; this.sync();
          }
        },

        down(u, v, t) {
          if (this.done) return;
          this.lastIn = this.t;
          if (this.state !== 'search' || !this.b) return;
          const b = this.b, s = this.searches[this.i], x = b.x + u * b.w, y = b.y + v * b.h;
          let best = -1, bd = Infinity;
          for (let j = 0; j < s.n; j++) { const P = this.pos(s, j, b), d = Math.hypot(x - P.x, y - P.y); if (d < bd) { bd = d; best = j; } }
          const P = best >= 0 ? this.pos(s, best, b) : null;
          if (!P || bd > P.s * 1.8) return;
          if (best === s.target) {
            s.found = true; s.rt = Math.max(0, t - s.on); this.foundAt = J.at;
            fx.burst(P.x, P.y, 12, C.gold, 150 * P.U, { kind: 'spark', size: [4 * P.U, 1] }); J.bloom(P.x, P.y, P.s * 4, C.glow, 0.4, 0.12, 0.4);
            hap('light'); sfx('owls_hoot', { piano: [4 + (this.items % 4), 0.12] });
            this.state = 'gap'; this.stateAt = this.t;
            J.border((this.i + 1) / this.searches.length);
          } else {
            s.wrong++; this.wrongAt = J.at; this.wrongCell = best;
            fx.snow(P.x, P.y - P.s, 5); hap('tick'); sfx('owls_shuffle');
          }
          this.sync();
        },

        auto(dt, now) {
          if (this.state !== 'search' || !this.b) return;
          const s = this.searches[this.i], B = this.bot || (this.bot = { for: null });
          if (B.for !== s) { B.for = s; B.at = now + 0.45 + s.n * 0.035 + 0.2 * R(); }
          if (now < B.at) return;
          const j = R() < 0.92 ? s.target : (s.target + 1) % s.n, P = this.pos(s, j, this.b);
          this.down((P.x - this.b.x) / this.b.w, (P.y - this.b.y) / this.b.h, now);
          B.at = now + 0.4;
        },

        draw(ctx, b, at) {
          this.b = b;
          const U = unit(b);
          K.card(ctx, b, mixc(C.night700, C.greenDeep, 0.12), C.night900);
          K.clip(ctx, b);
          K.star(ctx, b, 11, U, at, 16, 0.4);
          // Birch trunks behind the owls.
          for (let i = 0; i < 6; i++) {
            const x = b.x + b.w * (0.06 + i * 0.18), w = (7 + (i % 3) * 3) * U;
            ctx.fillStyle = rgb(mixc(C.silver200, C.night800, 0.55)); ctx.fillRect(x, b.y, w, b.h);
            ctx.fillStyle = rgb(C.night900, 0.6);
            for (let y = b.y + 8 * U + i * 5 * U; y < b.y + b.h; y += 22 * U) ctx.fillRect(x + 1 * U, y, w * 0.6, 2 * U);
          }
          ctx.fillStyle = rgb(mixc(C.silver200, C.night800, 0.6)); ctx.fillRect(b.x, b.y + b.h * 0.9, b.w, b.h * 0.1);
          const s = this.searches[this.i];
          if (s && (this.state === 'search' || at - this.foundAt < ITI)) {
            const app = rm() ? 1 : clamp((at - s.onAt) / 0.2, 0, 1), out = this.state === 'gap' ? clamp((at - this.foundAt) / ITI, 0, 1) : 0;
            for (let j = 0; j < s.n; j++) {
              const P = this.pos(s, j, b), wob = j === this.wrongCell && at - this.wrongAt < 0.3 && !rm() ? Math.sin((at - this.wrongAt) * 60) * 2 * U : 0;
              ctx.strokeStyle = rgb(C.woodD); ctx.lineWidth = 3 * U; ctx.beginPath(); ctx.moveTo(P.x - P.s * 1.3, P.y + P.s * 1.15); ctx.lineTo(P.x + P.s * 1.3, P.y + P.s * 1.15); ctx.stroke();
              const open = j === s.target;
              if (open && s.found) glow(ctx, P.x, P.y, P.s * 3, C.gold, 0.5 * (1 - out));
              owl(ctx, P.x + wob, P.y, P.s, open, app * (1 - out), Math.sin(at * 2));
            }
            if (this.i === 0 && this.state === 'search' && at - s.onAt > 2.5 && !rm()) { const P = this.pos(s, s.target, b); tapCue(ctx, P.x, P.y, U, at, 0.8); }
          }
          K.progress(ctx, b, this.searches.length, Math.max(0, this.i + (this.state === 'gap' ? 1 : 0)), U);
          ctx.restore();
        },
      });
    },
  });
})();
