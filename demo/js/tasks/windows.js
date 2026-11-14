(() => {
  // M22 Cabin Windows: go/no-go. Warm windows light up (tap), frosted ones too (hold back).
  const { clamp, lerp, rgb, mixc } = A;
  const J = A.J, { C, sprite, glow, disc, unit, tapCue, base, finish, fx, hap, sfx, rm } = J;
  const K = A.TaskKit, R = Math.random, ID = 'windows';
  const COLS = 3, ROWS = 2, ON = 0.85, NOGO_P = 0.25;

  A.defineTask(ID, {
    modes: ['wake', 'fatigue'], role: 'Go/no-go (cabin windows)', minS: 14,
    make(k) {
      const n = 20, soa = lerp(1.05, 0.82, clamp(k ?? 0, 0, 1));
      // Shuffle with at most two frosted in a row and never frosted first.
      let kinds;
      do { kinds = K.shuffle(Array.from({ length: n }, (_, i) => (i < Math.round(n * NOGO_P) ? 'nogo' : 'go'))); }
      while (kinds[0] === 'nogo' || kinds.some((x, i) => x === 'nogo' && kinds[i + 1] === 'nogo' && kinds[i + 2] === 'nogo'));
      let last = -1;
      const trials = kinds.map(kind => {
        let w; do w = Math.floor(R() * COLS * ROWS); while (w === last); last = w;
        return { kind, w, on: null, off: null, tap: null, rt: null };
      });
      return base(ID, n * soa + 4, {
        trials, soa, i: -1, nextAt: 0.9, cur: null, taps: [], b: null, bot: null, frostAt: {}, warmAt: {}, outro: 1.2,
        extra: { v: 1, n_trials: n, n_go: kinds.filter(x => x === 'go').length, n_nogo: kinds.filter(x => x === 'nogo').length, soa_ms: K.ms(soa) },

        win(i, b) {
          const U = unit(b), fw = b.w * 0.74, fh = b.h * 0.5, fx0 = b.x + (b.w - fw) / 2, fy0 = b.y + b.h * 0.34;
          const cw = fw / COLS, ch = fh / ROWS, c = i % COLS, r = Math.floor(i / COLS);
          return { x: fx0 + c * cw + cw * 0.16, y: fy0 + r * ch + ch * 0.14, w: cw * 0.68, h: ch * 0.72, U };
        },

        sync() {
          const go = this.trials.filter(t => t.kind === 'go' && t.off !== null), nogo = this.trials.filter(t => t.kind === 'nogo' && t.off !== null);
          const rts = go.filter(t => t.rt !== null).map(t => t.rt);
          Object.assign(this.extra, {
            go_rt_median_ms: K.ms(K.median(rts)), go_rt_iqr_ms: K.ms(K.iqr(rts)),
            hits: rts.length, omissions: go.filter(t => t.rt === null).length,
            commissions: nogo.filter(t => t.tap !== null).length, correct_holds: nogo.filter(t => t.tap === null).length,
            commission_rate: nogo.length ? K.r3(nogo.filter(t => t.tap !== null).length / nogo.length) : null,
            empty_taps: this.taps.filter(x => x === 'empty').length,
          });
          this.items = rts.length + this.extra.correct_holds;
          this.errors = this.extra.commissions + this.extra.omissions;
        },

        close(now) {
          const t = this.cur;
          if (!t) return;
          t.off = now; this.cur = null;
          if (t.kind === 'go' && t.rt === null) sfx('windows_miss');
          this.sync();
        },

        update(dt, now) {
          if (this.done) return;
          const T = this.t;
          if (this.cur && now - this.cur.on >= ON) this.close(now);
          if (!this.cur && T >= this.nextAt) {
            if (this.i + 1 >= this.trials.length) { this.sync(); finish(this, now); hap('complete'); sfx('windows_done'); J.border(1); J.spill(0.4); return; }
            const t = this.trials[++this.i];
            t.on = now; this.cur = t; this.nextAt = T + this.soa * (0.9 + 0.2 * R());
            sfx('windows_on', { kind: t.kind });
          }
        },

        down(u, v, t) {
          if (this.done) return;
          this.lastIn = this.t;
          const c = this.cur;
          if (!c || c.tap !== null) { this.taps.push('empty'); this.sync(); return; }
          c.tap = t;
          const b = this.b || A.session?.box?.(), W = b && this.win(c.w, b);
          if (c.kind === 'go') {
            c.rt = Math.max(0, t - c.on);
            this.warmAt[c.w] = J.at;
            if (W) { fx.burst(W.x + W.w / 2, W.y + W.h / 2, 10, C.glow, 150 * W.U, { kind: 'spark', size: [4 * W.U, 1] }); J.bloom(W.x + W.w / 2, W.y + W.h / 2, W.w * 1.4, C.warm, 0.35, 0.12, 0.4); }
            hap('hit'); sfx('windows_hit', { piano: [3 + (this.items % 5), 0.12] });
            J.border(this.i / this.trials.length);
            this.close(t);
          } else {
            this.frostAt[c.w] = J.at;
            if (W) fx.snow(W.x + W.w / 2, W.y + W.h * 0.3, 8);
            hap('miss'); sfx('windows_frost');
          }
          this.taps.push(c.kind);
          this.sync();
        },

        auto(dt, now) {
          const B = this.bot || (this.bot = { for: null, at: 0 });
          const c = this.cur;
          if (!c || c.tap !== null) return;
          if (B.for !== c) { B.for = c; B.at = now + 0.32 + 0.18 * R(); B.go = c.kind === 'go' ? R() < 0.95 : R() < 0.12; }
          if (B.go && now >= B.at) this.down(0.5, 0.5, now);
        },

        draw(ctx, b, at) {
          this.b = b;
          const U = unit(b);
          K.card(ctx, b, mixc(C.night800, C.violet500, 0.25), C.night900);
          K.clip(ctx, b);
          K.star(ctx, b, 7, U, at);
          // Snow ground and cabin.
          ctx.fillStyle = rgb(mixc(C.silver200, C.night800, 0.55)); ctx.fillRect(b.x, b.y + b.h * 0.86, b.w, b.h * 0.14);
          const cx = b.x + b.w / 2, roofY = b.y + b.h * 0.2, wallY = b.y + b.h * 0.3, wallW = b.w * 0.84;
          ctx.fillStyle = rgb(C.wood); ctx.fillRect(cx - wallW / 2, wallY, wallW, b.h * 0.56);
          ctx.strokeStyle = rgb(C.woodD, 0.6); ctx.lineWidth = 1.2 * U;
          for (let y = wallY + 9 * U; y < b.y + b.h * 0.86; y += 11 * U) { ctx.beginPath(); ctx.moveTo(cx - wallW / 2, y); ctx.lineTo(cx + wallW / 2, y); ctx.stroke(); }
          ctx.fillStyle = rgb(C.woodD); ctx.beginPath(); ctx.moveTo(cx - wallW / 2 - 14 * U, wallY + 2 * U); ctx.lineTo(cx, roofY - 18 * U); ctx.lineTo(cx + wallW / 2 + 14 * U, wallY + 2 * U); ctx.closePath(); ctx.fill();
          ctx.fillStyle = rgb(C.silver100, 0.9); ctx.beginPath(); ctx.moveTo(cx - wallW / 2 - 14 * U, wallY + 2 * U); ctx.lineTo(cx, roofY - 18 * U); ctx.lineTo(cx + wallW / 2 + 14 * U, wallY + 2 * U); ctx.lineTo(cx + wallW / 2 + 4 * U, wallY - 4 * U); ctx.lineTo(cx, roofY - 10 * U); ctx.lineTo(cx - wallW / 2 - 4 * U, wallY - 4 * U); ctx.closePath(); ctx.fill();
          const c = this.cur;
          for (let i = 0; i < COLS * ROWS; i++) {
            const W = this.win(i, b), on = c && c.w === i, warmFade = clamp(1 - (at - (this.warmAt[i] ?? -9)) / 0.6, 0, 1), frostFade = clamp(1 - (at - (this.frostAt[i] ?? -9)) / 0.7, 0, 1);
            const kind = on ? c.kind : null, a = on ? 1 : 0;
            let fill = C.night850;
            if (kind === 'go') fill = mixc(C.amberDeep, C.warm, 0.6);
            if (kind === 'nogo') fill = mixc(C.silver200, C.ice, 0.4);
            ctx.fillStyle = rgb(C.woodD); ctx.fillRect(W.x - 3 * U, W.y - 3 * U, W.w + 6 * U, W.h + 6 * U);
            ctx.fillStyle = rgb(on ? fill : mixc(C.night850, C.amberDeep, 0.25 * warmFade)); ctx.fillRect(W.x, W.y, W.w, W.h);
            if (kind === 'go') glow(ctx, W.x + W.w / 2, W.y + W.h / 2, W.w * 1.1, C.warm, 0.55 * a);
            if (warmFade > 0) glow(ctx, W.x + W.w / 2, W.y + W.h / 2, W.w * 1.3, C.glow, 0.6 * warmFade);
            if (kind === 'nogo') {
              ctx.strokeStyle = rgb(C.silver050, 0.75); ctx.lineWidth = 1 * U;
              const rng = A.rng(i * 31 + this.i);
              for (let s = 0; s < 7; s++) {
                const x0 = W.x + rng() * W.w, y0 = W.y + rng() * W.h;
                ctx.beginPath(); ctx.moveTo(x0, y0);
                for (let q = 0; q < 3; q++) ctx.lineTo(x0 + (rng() - 0.5) * W.w * 0.5, y0 + (rng() - 0.5) * W.h * 0.5);
                ctx.stroke();
              }
            }
            if (frostFade > 0 && !rm()) { const dx = Math.sin(at * 60) * 2 * U * frostFade; ctx.strokeStyle = rgb(C.ice, 0.8 * frostFade); ctx.lineWidth = 2 * U; ctx.strokeRect(W.x + dx, W.y, W.w, W.h); }
            ctx.strokeStyle = rgb(C.woodD); ctx.lineWidth = 2.4 * U;
            ctx.beginPath(); ctx.moveTo(W.x + W.w / 2, W.y); ctx.lineTo(W.x + W.w / 2, W.y + W.h); ctx.moveTo(W.x, W.y + W.h / 2); ctx.lineTo(W.x + W.w, W.y + W.h / 2); ctx.stroke();
          }
          K.progress(ctx, b, this.trials.length, Math.max(0, this.i), U);
          if (!rm() && this.i < 3 && c && c.kind === 'go' && c.tap === null && this.items === 0) { const W = this.win(c.w, b); tapCue(ctx, W.x + W.w / 2, W.y + W.h / 2, U, at, 0.9); }
          ctx.restore();
        },
      });
    },
  });
})();
