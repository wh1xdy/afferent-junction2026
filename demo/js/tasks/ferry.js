(() => {
  // M16 Ferry Dock: coincidence anticipation. A ferry glides toward the pier, slips behind an island, and the player
  // taps the moment they think its bow touches the pier. A ghost then shows where the ferry really was.
  const { clamp, lerp, rgb, mixc } = A;
  const J = A.J, { C, glow, disc, unit, tapCue, base, finish, fx, hap, sfx, rm } = J;
  const K = A.TaskKit, R = Math.random, ID = 'ferry';
  const N = 6, LATE = 1.2, REVEAL = 1.15, GAP = 0.45, GOOD = 0.2;
  const XO = 0.47, XP = 0.86, LANE = 0.63; // island left edge, pier (bow arrival), ferry waterline (fractions of the box)

  const gauss = () => { let u = 0, v = 0; while (!u) u = R(); while (!v) v = R(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(6.283 * v); };

  A.defineTask(ID, {
    modes: ['wake', 'fatigue', 'flow'], role: 'Coincidence anticipation (ferry behind an island)', minS: 16,
    make() {
      const T = K.shuffle([1.6, 1.8, 2.0, 2.2, 2.4, 2.6]);
      // Occluded fraction of the path 0.40..0.50: the island is fixed, so the start point varies.
      const trials = T.map(dur => { const f = 0.4 + 0.1 * R(); return { dur, f, xs: XP - (XP - XO) / f, on: null, arrive: null, tap: null, err: null, miss: false, end: null }; });
      return base(ID, N * (2.6 + LATE + REVEAL + GAP + 0.6) + 3, {
        trials, i: -1, cur: null, phase: 'wait', nextAt: 0.8, revealAt: -9, revealT: null, empty: 0, b: null, bot: null, outro: 1.2,
        extra: { v: 1, n_crossings: N, occluded_frac_mean: null, good_window_ms: K.ms(GOOD) },

        // Bow position (fraction of box width) for trial c at time t (A.now seconds).
        bow(c, t) { return c.xs + (XP - c.xs) * (t - c.on) / c.dur; },

        sync() {
          const d = this.trials.filter(c => c.end !== null), errs = d.filter(c => c.err !== null).map(c => c.err), abs = errs.map(Math.abs);
          Object.assign(this.extra, {
            signed_error_median_ms: K.ms(K.median(errs)), abs_error_median_ms: K.ms(K.median(abs)), abs_error_iqr_ms: K.ms(K.iqr(abs)),
            early_count: errs.filter(e => e < 0).length, late_count: errs.filter(e => e > 0).length, misses: d.filter(c => c.miss).length,
            empty_taps: this.empty, occluded_frac_mean: K.r3(K.mean(this.trials.map(c => c.f))),
          });
          this.items = abs.filter(e => e <= GOOD).length;
          this.errors = this.extra.misses;
        },

        settle(c, now) {
          c.end = now; this.phase = 'reveal'; this.revealAt = J.at; this.revealT = now;
          const b = this.b, U = b ? unit(b) : 1;
          if (c.miss) { sfx('ferry_miss'); hap('miss'); }
          else {
            const q = clamp(1 - Math.abs(c.err) / 0.35, 0, 1);
            if (b) {
              const px = b.x + XP * b.w, py = b.y + LANE * b.h - 22 * U;
              J.bloom(px, py, (40 + 50 * q) * U, C.warm, 0.2 + 0.35 * q, 0.15, 0.6);
              if (q > 0.3) fx.burst(px, py, Math.round(4 + 10 * q), C.glow, (80 + 90 * q) * U, { kind: 'spark', size: [3.5 * U, 1] });
              else fx.snow(px, py - 10 * U, 5);
            }
            if (Math.abs(c.err) <= GOOD) { hap('hit'); sfx('ferry_good', { piano: [3 + (this.items % 5), 0.12] }); }
            else { hap('touch'); sfx('ferry_near'); }
          }
          J.border((this.i + 1) / N);
          this.sync();
        },

        update(dt, now) {
          if (this.done) return;
          const c = this.cur;
          if (this.phase === 'run' && c && now >= c.arrive + LATE) { c.miss = true; this.settle(c, now); }
          if (this.phase === 'reveal' && now - this.revealT >= REVEAL) { this.phase = 'wait'; this.nextAt = this.t + GAP; }
          if (this.phase === 'wait' && this.t >= this.nextAt) {
            if (this.i + 1 >= N) { this.cur = null; this.sync(); finish(this, now); hap('complete'); sfx('ferry_done'); J.border(1); J.spill(0.35); return; }
            const n = this.trials[++this.i];
            n.on = now; n.onAt = J.at; n.arrive = now + n.dur; this.cur = n; this.phase = 'run';
            sfx('ferry_horn');
          }
        },

        down(u, v, t) {
          if (this.done) return;
          this.lastIn = this.t;
          const c = this.cur;
          if (this.phase !== 'run' || !c || c.tap !== null) { this.empty++; this.sync(); return; }
          c.tap = t; c.err = t - c.arrive;
          sfx('ferry_tap');
          this.settle(c, t);
        },

        auto(dt, now) {
          const c = this.cur, B = this.bot || (this.bot = { for: null, at: 0 });
          if (this.phase !== 'run' || !c || c.tap !== null) return;
          if (B.for !== c) { B.for = c; B.at = c.arrive + clamp(gauss() * 0.12, -0.35, 0.35); }
          if (now >= B.at) this.down(0.5, 0.6, now);
        },

        // Procedural ferry: bow at (x, y waterline), length L, pointing right.
        ferry(ctx, x, y, L, U, a, at, ghost) {
          const bob = rm() || ghost ? 0 : Math.sin(at * 2.2) * 1.2 * U, h = L * 0.16, yy = y + bob;
          ctx.save(); ctx.globalAlpha *= a;
          if (ghost) {
            ctx.strokeStyle = rgb(C.ice, 0.9); ctx.fillStyle = rgb(C.ice, 0.18); ctx.lineWidth = 1.6 * U; ctx.setLineDash([4 * U, 3 * U]);
          } else ctx.fillStyle = rgb(mixc(C.silver600, C.night800, 0.35));
          // Hull.
          ctx.beginPath(); ctx.moveTo(x - L, yy - h); ctx.lineTo(x, yy - h); ctx.lineTo(x - L * 0.1, yy + h * 0.6); ctx.lineTo(x - L * 0.94, yy + h * 0.6); ctx.closePath();
          ctx.fill(); if (ghost) ctx.stroke();
          if (!ghost) { ctx.fillStyle = rgb(mixc(C.coralSoft, C.night800, 0.45)); ctx.fillRect(x - L * 0.98, yy - h * 0.15, L * 0.9, h * 0.22); }
          // Cabin and funnel.
          const cx = x - L * 0.78, cw = L * 0.52, ch = h * 1.5;
          ctx.beginPath(); ctx.roundRect(cx, yy - h - ch, cw, ch, 2 * U); ctx.fillStyle = ghost ? rgb(C.ice, 0.14) : rgb(mixc(C.silver200, C.night700, 0.35)); ctx.fill(); if (ghost) ctx.stroke();
          ctx.beginPath(); ctx.rect(cx + cw * 0.22, yy - h - ch - h * 1.1, cw * 0.16, h * 1.1); ctx.fillStyle = ghost ? rgb(C.ice, 0.14) : rgb(mixc(C.amberDeep, C.night800, 0.4)); ctx.fill(); if (ghost) ctx.stroke();
          if (!ghost) {
            for (let k = 0; k < 4; k++) { ctx.fillStyle = rgb(C.warm, 0.9); ctx.fillRect(cx + cw * (0.1 + k * 0.22), yy - h - ch * 0.72, cw * 0.12, ch * 0.36); }
            glow(ctx, cx + cw / 2, yy - h - ch * 0.55, cw * 0.7, C.warm, 0.25);
            disc(ctx, x - L * 0.06, yy - h - 2 * U, 1.8 * U, C.gold); glow(ctx, x - L * 0.06, yy - h - 2 * U, 9 * U, C.glow, 0.5);
          }
          ctx.restore();
        },

        draw(ctx, b, at) {
          this.b = b;
          const U = unit(b), W = b.w, H = b.h, X = f => b.x + f * W, Y = f => b.y + f * H;
          const hz = Y(0.42), lane = Y(LANE), L = W * 0.15, xo = X(XO), xp = X(XP);
          K.card(ctx, b, mixc(C.night700, C.violet500, 0.2), C.night900);
          K.clip(ctx, b);
          K.star(ctx, b, 16, U, at, 22, 0.55);
          // Moon and far hills.
          disc(ctx, X(0.2), Y(0.14), 12 * U, C.silver100, 0.9); glow(ctx, X(0.2), Y(0.14), 46 * U, C.sky, 0.25);
          ctx.fillStyle = rgb(mixc(C.night600, C.night900, 0.4));
          ctx.beginPath(); ctx.moveTo(b.x, hz);
          for (let i = 0; i <= 12; i++) ctx.lineTo(b.x + W * i / 12, hz - (10 + 9 * Math.sin(i * 1.7) + 6 * Math.sin(i * 0.6)) * U);
          ctx.lineTo(b.x + W, hz); ctx.closePath(); ctx.fill();
          // Water.
          const wg = ctx.createLinearGradient(0, hz, 0, b.y + H);
          wg.addColorStop(0, rgb(mixc(C.night600, C.tealDeep, 0.25))); wg.addColorStop(1, rgb(C.night850));
          ctx.fillStyle = wg; ctx.fillRect(b.x, hz, W, H);
          glow(ctx, X(0.2), hz + 30 * U, 60 * U, C.sky, 0.12);
          ctx.strokeStyle = rgb(C.silver300, 0.12); ctx.lineWidth = 1 * U;
          for (let r = 0; r < 9; r++) {
            const y = hz + (8 + r * r * 3.2) * U, sh = rm() ? 0 : at * (12 + r * 4) * U;
            for (let s = 0; s < 4; s++) { const x0 = b.x + ((s * 0.29 + r * 0.17) * W + sh) % (W + 40 * U) - 20 * U; ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x0 + (14 + r * 3) * U, y); ctx.stroke(); }
          }

          // Pier (right shore): planks, posts, lantern at the arrival point.
          const deck = lane - 6 * U;
          ctx.fillStyle = rgb(C.woodD); for (let p = 0; p < 4; p++) ctx.fillRect(xp + (4 + p * 13) * U, deck, 3 * U, 16 * U);
          ctx.fillStyle = rgb(C.wood); ctx.fillRect(xp, deck - 4 * U, b.x + W - xp, 5 * U);
          ctx.fillStyle = rgb(C.silver100, 0.8); ctx.fillRect(xp, deck - 5.5 * U, b.x + W - xp, 1.6 * U);
          ctx.fillStyle = rgb(mixc(C.silver200, C.night800, 0.5)); ctx.beginPath(); ctx.moveTo(b.x + W, Y(0.5)); ctx.lineTo(xp + 50 * U, deck - 4 * U); ctx.lineTo(b.x + W, deck - 4 * U); ctx.closePath(); ctx.fill();
          const lx = xp + 3 * U, ly = deck - 28 * U;
          ctx.fillStyle = rgb(C.woodD); ctx.fillRect(lx - 1.5 * U, ly, 3 * U, 24 * U);
          const c = this.cur, rv = this.phase === 'reveal' && c ? clamp((at - this.revealAt) / 0.25, 0, 1) * clamp((REVEAL - (at - this.revealAt)) / 0.3, 0, 1) : 0;
          const q = c && c.err !== null ? clamp(1 - Math.abs(c.err) / 0.35, 0, 1) : 0;
          const breathe = rm() ? 0.5 : 0.5 + 0.5 * Math.sin(at * 2);
          disc(ctx, lx, ly - 2 * U, 3.4 * U, C.gold); glow(ctx, lx, ly - 2 * U, (16 + 4 * breathe) * U, C.glow, 0.45 + rv * 0.5 * q);
          ctx.fillStyle = rgb(C.glow, 0.12 + 0.2 * rv * q); ctx.fillRect(lx - 6 * U, lane + 2 * U, 12 * U, 30 * U); // lantern reflection

          // Running ferry, visible only left of the island.
          if (c && this.phase === 'run') {
            const now = A.now(), bx = X(this.bow(c, now));
            ctx.save(); ctx.beginPath(); ctx.rect(b.x, b.y, xo - b.x, H); ctx.clip();
            ctx.strokeStyle = rgb(C.silver100, 0.25); ctx.lineWidth = 1.2 * U;
            for (let k = 1; k <= 3; k++) { ctx.beginPath(); ctx.moveTo(bx - L, lane + 2 * U * k); ctx.lineTo(bx - L - 26 * U * k, lane + 5 * U * k); ctx.stroke(); }
            this.ferry(ctx, bx, lane, L, U, clamp((at - c.onAt) / 0.2, 0, 1), at, false);
            ctx.restore();
          }

          // Island: snowy hill with spruces, always in front of the ferry lane.
          ctx.fillStyle = rgb(mixc(C.night700, C.night900, 0.3));
          ctx.beginPath();
          ctx.moveTo(xo - 0.06 * W, lane + 12 * U); ctx.lineTo(xo - 0.012 * W, Y(0.49)); ctx.lineTo(xo + 0.04 * W, Y(0.39));
          ctx.quadraticCurveTo(X(0.6), Y(0.3), X(0.68), Y(0.34)); ctx.quadraticCurveTo(X(0.76), Y(0.31), X(0.82), Y(0.4));
          ctx.lineTo(xp - 0.004 * W, Y(0.5)); ctx.lineTo(xp, lane + 12 * U); ctx.closePath(); ctx.fill();
          ctx.fillStyle = rgb(C.silver100, 0.75);
          ctx.beginPath(); ctx.moveTo(xo + 0.03 * W, Y(0.405)); ctx.quadraticCurveTo(X(0.6), Y(0.3), X(0.68), Y(0.34)); ctx.quadraticCurveTo(X(0.76), Y(0.31), X(0.81), Y(0.39));
          ctx.quadraticCurveTo(X(0.7), Y(0.37), X(0.64), Y(0.36)); ctx.quadraticCurveTo(X(0.56), Y(0.36), xo + 0.03 * W, Y(0.405)); ctx.fill();
          for (let s = 0; s < 6; s++) {
            const sx = X(0.53 + s * 0.05), sy = Y(0.42 + (s % 2) * 0.03), sh = (18 + (s * 7) % 10) * U;
            ctx.fillStyle = rgb(mixc(C.greenDeep, C.night900, 0.72));
            ctx.beginPath(); ctx.moveTo(sx, sy - sh); ctx.lineTo(sx + sh * 0.32, sy); ctx.lineTo(sx - sh * 0.32, sy); ctx.closePath(); ctx.fill();
            ctx.fillStyle = rgb(C.silver050, 0.55); ctx.beginPath(); ctx.moveTo(sx, sy - sh); ctx.lineTo(sx + sh * 0.12, sy - sh * 0.62); ctx.lineTo(sx - sh * 0.12, sy - sh * 0.62); ctx.closePath(); ctx.fill();
          }
          ctx.fillStyle = rgb(C.night900, 0.35); ctx.fillRect(xo - 0.05 * W, lane + 12 * U, xp - xo + 0.05 * W, 8 * U); // reflection band

          // Ghost reveal: where the ferry really was at the tap (or docked, if missed), plus a soft gap marker.
          if (c && this.phase === 'reveal' && rv > 0) {
            const tt = c.miss ? c.arrive : c.tap, gx = X(clamp(this.bow(c, tt), XO - 0.1, XP + 0.1));
            this.ferry(ctx, gx, lane, L, U, rv * 0.9, at, true);
            if (!c.miss && Math.abs(gx - xp) > 3 * U) {
              ctx.strokeStyle = rgb(mixc(C.ice, C.warm, q), 0.6 * rv); ctx.lineWidth = 1.6 * U; ctx.setLineDash([3 * U, 3 * U]);
              ctx.beginPath(); ctx.moveTo(gx, lane + 18 * U); ctx.quadraticCurveTo((gx + xp) / 2, lane + 28 * U, xp, lane + 18 * U); ctx.stroke(); ctx.setLineDash([]);
            }
            glow(ctx, xp, lane - 10 * U, (24 + 30 * q) * U, c.miss ? C.ice : C.warm, rv * (c.miss ? 0.2 : 0.25 + 0.45 * q));
          }

          K.progress(ctx, b, N, this.i + (this.phase === 'run' || this.i < 0 ? 0 : 1), U);
          if (c && this.i === 0 && this.phase === 'run' && c.tap === null && !rm() && A.now() - c.on > Math.max(0.9, c.dur * 0.55)) tapCue(ctx, xp, lane - 34 * U, U, at, 0.85);
          ctx.restore();
        },
      });
    },
  });
})();
