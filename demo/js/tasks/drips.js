(() => {
  // M17 Drip Rhythm: synchronisation-continuation tapping. Drips fall from an icicle on a steady beat;
  // tap with each landing, then the icicle freezes and the beat is kept alone.
  const { clamp, lerp, rgb, mixc } = A;
  const J = A.J, { C, sprite, glow, ring, disc, unit, tapCue, base, finish, fx, hap, sfx, rm } = J;
  const K = A.TaskKit, R = Math.random, ID = 'drips';
  const P = 0.75, LEAD = 1.0, NSYNC = 8, NCONT = 8, CONT_MAX = 9, FALL = 0.42;

  A.defineTask(ID, {
    modes: ['calm', 'flow'], role: 'Synchronisation-continuation tapping (icicle drips)', minS: 15,
    make() {
      return base(ID, LEAD + NSYNC * P + CONT_MAX + 2, {
        s0: null, beat: 0, phase: 'sync', contAt: null, frozeAt: -9,
        syncTaps: [], asyn: [], contTaps: [], waves: [], fall: -1, form: 0,
        b: null, bot: null, outro: 1.4,
        extra: { v: 1, period_ms: Math.round(P * 1000), n_sync_beats: NSYNC, n_cont_taps: NCONT },

        beatAt(i) { return this.s0 + LEAD + i * P; },

        sync() {
          const ct = this.contTaps, iti = ct.slice(1).map((t, i) => t - ct[i]), med = K.median(iti);
          Object.assign(this.extra, {
            sync_asynchrony_median_ms: K.ms(K.median(this.asyn)),
            sync_asynchrony_iqr_ms: K.ms(K.iqr(this.asyn)),
            continuation_intertap_median_ms: K.ms(med),
            tempo_drift_pct: med === null ? null : K.r3((med / P - 1) * 100),
            continuation_cv: K.r3(K.cv(iti)),
            sync_taps: this.asyn.length, continuation_taps: ct.length,
          });
          this.items = this.asyn.length + ct.length;
          this.errors = Math.max(0, NSYNC - this.asyn.length);
        },

        pool() {
          const b = this.b;
          return b ? { x: b.x + b.w * 0.5, y: b.y + b.h * 0.8, rx: b.w * 0.24, ry: b.h * 0.045 } : null;
        },

        wave(kind) {
          this.waves.push({ at: J.at, kind });
          if (this.waves.length > 12) this.waves.shift();
        },

        end(now) {
          this.sync(); finish(this, now);
          hap('success'); sfx('drips_done'); J.border(1); J.spill(0.35);
        },

        update(dt, now) {
          if (this.s0 === null) this.s0 = now - this.t;
          if (this.done) return;
          if (this.phase === 'sync') {
            // Land each drip on its beat.
            while (this.beat < NSYNC && now >= this.beatAt(this.beat)) {
              this.beat++; this.wave('drop'); sfx('drips_drop', { i: this.beat }); hap('tick');
              const p = this.pool(); if (p) fx.drip(p.x, p.y - p.ry * 0.5, C.ice);
              J.border(this.beat / (NSYNC + NCONT));
            }
            const nb = this.beatAt(this.beat);
            this.fall = this.beat < NSYNC ? clamp(1 - (nb - now) / FALL, -1, 1) : -1;
            this.form = this.beat < NSYNC ? clamp(1 - (nb - FALL - now) / (P - FALL), 0, 1) : 0;
            if (this.beat >= NSYNC && now >= this.beatAt(NSYNC - 1) + P / 2) {
              this.phase = 'cont'; this.contAt = now; this.frozeAt = J.at; sfx('drips_freeze'); this.sync();
            }
          } else if (now - this.contAt >= CONT_MAX) this.end(now);
        },

        down(u, v, t) {
          if (this.done || this.s0 === null) return;
          this.lastIn = this.t;
          if (this.phase === 'sync') {
            if (t < this.beatAt(0) - P / 2) return;
            const i = clamp(Math.round((t - this.beatAt(0)) / P), 0, NSYNC - 1);
            this.syncTaps.push(t);
            if (!this.syncTaps.some((x, k) => k < this.syncTaps.length - 1 && Math.round((x - this.beatAt(0)) / P) === i)) this.asyn.push(t - this.beatAt(i));
            this.wave('tap'); hap('light'); sfx('drips_tap');
          } else {
            this.contTaps.push(t);
            this.wave('tap'); hap('light'); sfx('drips_tap', { i: this.contTaps.length });
            J.border((NSYNC + this.contTaps.length) / (NSYNC + NCONT));
            this.sync();
            if (this.contTaps.length >= NCONT) { this.end(t); return; }
          }
          this.sync();
        },

        auto(dt, now) {
          if (this.done || this.s0 === null) return;
          const B = this.bot || (this.bot = { i: 0, at: null, gap: P });
          if (this.phase === 'sync') {
            if (B.at === null || B.i < NSYNC && B.at < this.beatAt(B.i) - P / 2) B.at = this.beatAt(B.i) - 0.03 + (R() - 0.5) * 0.04;
            if (B.i < NSYNC && now >= B.at) { this.down(0.5, 0.8, now); B.i++; B.at = B.i < NSYNC ? this.beatAt(B.i) - 0.03 + (R() - 0.5) * 0.04 : null; B.last = now; }
          } else {
            if (B.cat == null) B.cat = (B.last ?? now) + P;
            if (now >= B.cat) { this.down(0.5, 0.8, now); B.gap *= 0.985; B.cat = now + B.gap * (0.97 + 0.06 * R()); }
          }
        },

        draw(ctx, b, at) {
          this.b = b;
          const U = unit(b), cx = b.x + b.w / 2, frozen = this.phase === 'cont';
          K.card(ctx, b, mixc(C.night700, C.night900, 0.3), mixc(C.night800, C.night950, 0.5));
          K.clip(ctx, b);
          K.star(ctx, b, 17, U, at, 22, 0.5);
          // Snow ground.
          const gy = b.y + b.h * 0.72;
          ctx.fillStyle = rgb(mixc(C.silver300, C.night700, 0.45));
          ctx.beginPath(); ctx.moveTo(b.x, gy + 8 * U);
          ctx.quadraticCurveTo(b.x + b.w * 0.3, gy - 6 * U, cx, gy); ctx.quadraticCurveTo(b.x + b.w * 0.75, gy + 5 * U, b.x + b.w, gy - 4 * U);
          ctx.lineTo(b.x + b.w, b.y + b.h); ctx.lineTo(b.x, b.y + b.h); ctx.closePath(); ctx.fill();
          // Meltwater pool.
          const p = this.pool();
          ctx.fillStyle = rgb(mixc(C.tealDeep, C.night900, 0.6)); ctx.beginPath(); ctx.ellipse(p.x, p.y, p.rx, p.ry, 0, 0, 6.283); ctx.fill();
          ctx.strokeStyle = rgb(C.silver100, 0.35); ctx.lineWidth = 1.4 * U; ctx.stroke();
          glow(ctx, p.x, p.y, p.rx * 0.9, C.ice, 0.08);
          // Ripples: drops in ice blue, taps in warm light.
          for (const w of this.waves) {
            const k = (at - w.at) / 1.1;
            if (k < 0 || k > 1) continue;
            const s = rm() ? 0.5 : J.ease.outSoft(k), a = (1 - k) * (w.kind === 'tap' ? 0.75 : 0.6);
            ctx.strokeStyle = rgb(w.kind === 'tap' ? C.glow : C.ice, a); ctx.lineWidth = 1.6 * U;
            ctx.beginPath(); ctx.ellipse(p.x, p.y, p.rx * (0.12 + 0.8 * s), p.ry * (0.12 + 0.8 * s), 0, 0, 6.283); ctx.stroke();
          }
          // Roof eave with snow cap.
          const ry = b.y + b.h * 0.14;
          ctx.fillStyle = rgb(C.woodD); ctx.fillRect(b.x, b.y, b.w, ry - b.y);
          ctx.fillStyle = rgb(C.wood); ctx.fillRect(b.x, ry - 7 * U, b.w, 7 * U);
          ctx.fillStyle = rgb(C.silver100);
          ctx.beginPath(); ctx.moveTo(b.x, ry - 7 * U);
          for (let x = 0; x <= 10; x++) ctx.lineTo(b.x + b.w * x / 10, ry - 9 * U - (x % 2 ? 4 : 1) * U);
          ctx.lineTo(b.x + b.w, b.y + 4 * U); ctx.lineTo(b.x, b.y + 4 * U); ctx.closePath(); ctx.fill();
          // Icicles; the middle one drips.
          const fz = frozen ? clamp((at - this.frozeAt) / 0.6, 0, 1) : 0;
          const tipY = ry + b.h * 0.2;
          const cols = [[-0.3, 0.45], [-0.17, 0.7], [0, 1], [0.15, 0.6], [0.28, 0.4]];
          for (const [dx, len] of cols) {
            const x = cx + dx * b.w, y1 = ry + b.h * 0.2 * len, wd = (dx === 0 ? 9 : 6) * U;
            const ic = dx === 0 ? mixc(C.ice, C.silver050, 0.25 + 0.6 * fz) : mixc(C.ice, C.silver200, 0.5);
            ctx.fillStyle = rgb(ic, 0.85);
            ctx.beginPath(); ctx.moveTo(x - wd, ry); ctx.lineTo(x + wd, ry); ctx.lineTo(x + 1 * U, y1); ctx.lineTo(x - 1 * U, y1); ctx.closePath(); ctx.fill();
            ctx.strokeStyle = rgb(C.silver050, 0.5); ctx.lineWidth = 1 * U;
            ctx.beginPath(); ctx.moveTo(x - wd * 0.4, ry + 2 * U); ctx.lineTo(x - 0.5 * U, y1 - 4 * U); ctx.stroke();
          }
          if (frozen) {
            // Frost glints: the drips have stopped.
            glow(ctx, cx, tipY - b.h * 0.08, 30 * U, C.silver050, 0.25 * fz);
            for (let i = 0; i < 4; i++) {
              const tw = rm() ? 0.7 : 0.5 + 0.5 * Math.sin(at * 2.2 + i * 1.7);
              disc(ctx, cx + (i - 1.5) * 5 * U, ry + b.h * 0.05 * (i + 1), 1.4 * U, C.silver050, 0.8 * fz * tw);
            }
          } else {
            // Forming drop at the tip, then falling.
            if (this.form > 0 && this.fall < 0) disc(ctx, cx, tipY + 2 * U * this.form, 2.5 * U * (0.4 + 0.6 * this.form), C.ice, 0.9);
            if (this.fall >= 0 && this.fall <= 1) {
              const k = this.fall * this.fall, dy = rm() ? p.y - 6 * U : lerp(tipY + 2 * U, p.y - 2 * U, k);
              glow(ctx, cx, dy, 10 * U, C.ice, 0.35);
              ctx.fillStyle = rgb(mixc(C.ice, C.silver050, 0.3));
              ctx.beginPath(); ctx.ellipse(cx, dy, 2.6 * U, (3 + 2 * k) * U, 0, 0, 6.283); ctx.fill();
            }
          }
          K.progress(ctx, b, NSYNC + NCONT, this.beat + this.contTaps.length, U);
          if (!frozen && this.asyn.length === 0 && this.beat >= 1 && !this.done)
            tapCue(ctx, p.x, p.y, U, at, clamp((this.beat - 0.5) / 1.5, 0, 1));
          ctx.restore();
        },
      });
    },
  });
})();
