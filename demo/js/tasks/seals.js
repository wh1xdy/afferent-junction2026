(() => {
  // M13 Seal Holes: 4-choice reaction time. A seal pops up in one of four ice holes; tap it before it dives.
  const { clamp, lerp, rgb, mixc } = A;
  const J = A.J, { C, sprite, glow, disc, unit, tapCue, base, finish, fx, hap, sfx, rm } = J;
  const K = A.TaskKit, R = Math.random, ID = 'seals', UP = 1.2, HOLES = 4;

  A.defineTask(ID, {
    modes: ['wake', 'fatigue'], role: 'Choice reaction time (seal in four ice holes)', minS: 12,
    make() {
      const n = 12;
      let last = -1;
      const pops = Array.from({ length: n }, () => { let h; do h = Math.floor(R() * HOLES); while (h === last); last = h; return { h, gap: 0.45 + 0.6 * R(), on: null, rt: null, wrong: 0, off: null }; });
      return base(ID, n * (UP + 1.1) + 3, {
        pops, i: -1, cur: null, nextAt: 0.8, empty: 0, b: null, bot: null, hitAt: -9, hitHole: -1, outro: 1.2,
        extra: { v: 1, n_pops: n, holes: HOLES },

        hole(i, b) {
          const U = unit(b), c = i % 2, r = Math.floor(i / 2);
          return { x: b.x + b.w * (0.29 + 0.42 * c), y: b.y + b.h * (0.36 + 0.32 * r), rx: b.w * 0.15, ry: b.w * 0.055, U };
        },

        sync() {
          const d = this.pops.filter(p => p.off !== null), rts = d.filter(p => p.rt !== null).map(p => p.rt);
          const simple = A.session?.coreRec?.rt?.median_ms ?? null, med = K.ms(K.median(rts));
          Object.assign(this.extra, {
            choice_rt_median_ms: med, choice_rt_iqr_ms: K.ms(K.iqr(rts)), misses: d.filter(p => p.rt === null).length,
            wrong_hole_taps: this.pops.reduce((a, p) => a + p.wrong, 0), empty_taps: this.empty,
            choice_minus_simple_ms: med !== null && simple !== null ? Math.round(med - simple) : null,
          });
          this.items = rts.length; this.errors = this.extra.misses + this.extra.wrong_hole_taps;
        },

        update(dt, now) {
          if (this.done) return;
          const c = this.cur;
          if (c && now - c.on >= UP) { c.off = now; this.cur = null; this.nextAt = this.t + c.gap; sfx('seals_dive'); this.sync(); }
          if (!this.cur && this.t >= this.nextAt) {
            if (this.i + 1 >= this.pops.length) { this.sync(); finish(this, now); hap('complete'); sfx('seals_done'); J.border(1); J.spill(0.35); return; }
            const p = this.pops[++this.i]; p.on = now; p.onAt = J.at; this.cur = p; sfx('seals_pop');
          }
        },

        down(u, v, t) {
          if (this.done || !this.b) return;
          this.lastIn = this.t;
          const b = this.b, x = b.x + u * b.w, y = b.y + v * b.h;
          let best = -1, bd = Infinity;
          for (let i = 0; i < HOLES; i++) { const H = this.hole(i, b), d = Math.hypot((x - H.x) / H.rx, (y - H.y + H.ry * 2) / (H.ry * 4)); if (d < bd) { bd = d; best = i; } }
          const c = this.cur;
          if (!c) { this.empty++; this.sync(); return; }
          if (best === c.h && bd < 1.6) {
            c.rt = Math.max(0, t - c.on); c.off = t; this.cur = null; this.nextAt = this.t + c.gap;
            this.hitAt = J.at; this.hitHole = c.h;
            const H = this.hole(c.h, b);
            fx.burst(H.x, H.y - H.ry * 2, 10, C.glow, 140 * H.U, { kind: 'spark', size: [4 * H.U, 1] }); fx.drip(H.x, H.y);
            hap('hit'); sfx('seals_hit', { piano: [3 + (this.items % 5), 0.12] });
            J.border((this.i + 1) / this.pops.length);
          } else { c.wrong++; hap('miss'); sfx('seals_splash'); const H = this.hole(best, b); fx.snow(H.x, H.y - H.ry, 5); }
          this.sync();
        },

        auto(dt, now) {
          const c = this.cur, B = this.bot || (this.bot = { for: null });
          if (!c || !this.b) return;
          if (B.for !== c) { B.for = c; B.at = now + 0.42 + 0.2 * R(); }
          if (now < B.at) return;
          const H = this.hole(R() < 0.95 ? c.h : (c.h + 1) % HOLES, this.b);
          this.down((H.x - this.b.x) / this.b.w, (H.y - H.ry * 2 - this.b.y) / this.b.h, now);
          B.at = now + 0.3;
        },

        draw(ctx, b, at) {
          this.b = b;
          const U = unit(b);
          K.card(ctx, b, mixc(C.sky, C.night700, 0.6), mixc(C.silver300, C.night800, 0.35));
          K.clip(ctx, b);
          K.star(ctx, b, 5, U, at, 14, 0.4);
          ctx.fillStyle = rgb(mixc(C.silver100, C.ice, 0.2), 0.9); ctx.fillRect(b.x, b.y + b.h * 0.2, b.w, b.h * 0.8);
          const c = this.cur;
          for (let i = 0; i < HOLES; i++) {
            const H = this.hole(i, b);
            ctx.fillStyle = rgb(mixc(C.tealDeep, C.night900, 0.55)); ctx.beginPath(); ctx.ellipse(H.x, H.y, H.rx, H.ry, 0, 0, 6.283); ctx.fill();
            ctx.strokeStyle = rgb(C.silver050, 0.8); ctx.lineWidth = 2 * U; ctx.stroke();
            let up = 0;
            if (c && c.h === i) up = rm() ? 1 : J.ease.outBack(clamp((at - c.onAt) / 0.16, 0, 1));
            else if (this.hitHole === i && at - this.hitAt < 0.25) up = 1 - (at - this.hitAt) / 0.25;
            if (up > 0) {
              ctx.save(); ctx.beginPath(); ctx.rect(H.x - H.rx, H.y - H.ry * 8, H.rx * 2, H.ry * 8); ctx.clip();
              const sy = H.y + H.ry * 3 * (1 - up), s = H.rx * 0.55;
              ctx.fillStyle = rgb(mixc(C.silver500, C.night800, 0.25)); ctx.beginPath(); ctx.ellipse(H.x, sy - s * 0.5, s * 0.75, s * 1.2, 0, 0, 6.283); ctx.fill();
              for (const d of [-1, 1]) { disc(ctx, H.x + d * s * 0.3, sy - s * 0.95, s * 0.14, C.night950); disc(ctx, H.x + d * s * 0.27, sy - s * 0.99, s * 0.04, C.silver050); }
              disc(ctx, H.x, sy - s * 0.7, s * 0.1, C.night950);
              ctx.restore();
              if (c && c.h === i) glow(ctx, H.x, H.y - H.ry * 2, H.rx * 1.2, C.glow, 0.2 * up);
            }
          }
          K.progress(ctx, b, this.pops.length, Math.max(0, this.i), U);
          if (c && this.i === 0 && at - c.onAt > 0.5 && !rm()) { const H = this.hole(c.h, b); tapCue(ctx, H.x, H.y - H.ry * 2, U, at, 0.85); }
          ctx.restore();
        },
      });
    },
  });
})();
