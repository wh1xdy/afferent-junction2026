(() => {
  // M15 Vihta Tapping: finger tapping speed for 10 s, timed from the first tap.
  const { clamp, lerp, rgb, mixc } = A;
  const J = A.J, { C, sprite, glow, disc, unit, tapCue, base, finish, fx, hap, sfx, rm } = J;
  const K = A.TaskKit, R = Math.random, ID = 'vihta', RUN = 10, WAIT = 6;

  A.defineTask(ID, {
    modes: ['wake', 'fatigue'], role: 'Finger tapping (vihta whisk)', minS: 12,
    make() {
      return base(ID, RUN + WAIT + 1, {
        t0: null, taps: [], swing: -9, steam: 0, b: null, bot: null, outro: 1.4,
        extra: { v: 1, run_s: RUN },
        bar() { return this.t0 === null ? null : clamp(1 - (A.now() - this.t0) / RUN, 0, 1); },

        sync() {
          const ts = this.taps, iti = ts.slice(1).map((t, i) => t - ts[i]), half = this.t0 + RUN / 2;
          const n1 = ts.filter(t => t < half).length, n2 = ts.length - n1;
          Object.assign(this.extra, {
            taps: ts.length, taps_per_s: ts.length ? K.r3(ts.length / RUN) : 0,
            intertap_median_ms: K.ms(K.median(iti)), intertap_cv: K.r3(K.cv(iti)),
            slowdown: n1 >= 3 ? K.r3(n2 / n1) : null,
            first_tap_ms: this.t0 === null ? null : K.ms(this.t0 - this.startAt),
          });
          this.items = ts.length;
        },

        update(dt, now) {
          this.steam = Math.max(0, this.steam - dt * 0.05);
          if (this.done) return;
          if (this.t0 !== null && now - this.t0 >= RUN) {
            this.sync(); finish(this, now);
            hap('success'); sfx('vihta_done'); J.border(1); J.spill(0.3 + 0.4 * clamp(this.taps.length / 60, 0, 1));
            const b = this.b;
            if (b) { const U = unit(b); for (let i = 0; i < 4; i++) fx.puff(b.x + b.w * (0.3 + 0.13 * i), b.y + b.h * 0.55, C.silver100, U); }
          }
        },

        down(u, v, t) {
          if (this.done) return;
          this.lastIn = this.t;
          if (this.t0 === null) this.t0 = t;
          if (t - this.t0 > RUN) return;
          this.taps.push(t);
          this.swing = J.at; this.steam = Math.min(1, this.steam + 0.035);
          const b = this.b;
          if (b) {
            const U = unit(b);
            fx.rise(b.x + b.w * (0.4 + 0.2 * R()), b.y + b.h * 0.72, 2, C.silver100, { size: [3 * U, 7 * U], kind: 'soft', life: 1.1, add: false, alpha: [0.35, 0] });
            if (this.taps.length % 8 === 0) fx.puff(b.x + b.w * (0.35 + 0.3 * R()), b.y + b.h * 0.7, C.silver100, U);
          }
          hap(this.taps.length % 4 === 0 ? 'light' : 'tick');
          sfx('vihta_tap', { i: this.taps.length });
          J.border(clamp((t - this.t0) / RUN, 0, 1));
          this.sync();
        },

        auto(dt, now) {
          const B = this.bot || (this.bot = { at: now + 0.6 + 0.4 * R(), gap: 0.14 + 0.05 * R() });
          if (now < B.at || this.done) return;
          this.down(0.5, 0.6, now);
          B.gap *= 1.006; B.at = now + B.gap * (0.85 + 0.3 * R());
        },

        draw(ctx, b, at) {
          this.b = b;
          const U = unit(b), cx = b.x + b.w / 2;
          K.card(ctx, b, mixc(C.woodL, C.night900, 0.35), mixc(C.woodD, C.night950, 0.4));
          K.clip(ctx, b);
          // Wall planks.
          ctx.strokeStyle = rgb(C.woodD, 0.5); ctx.lineWidth = 1.2 * U;
          for (let x = b.x + 14 * U; x < b.x + b.w; x += 22 * U) { ctx.beginPath(); ctx.moveTo(x, b.y); ctx.lineTo(x, b.y + b.h * 0.7); ctx.stroke(); }
          // Bench and stones.
          ctx.fillStyle = rgb(C.wood); ctx.fillRect(b.x, b.y + b.h * 0.7, b.w, b.h * 0.06);
          const heat = clamp(this.steam * 1.3 + (this.done ? 0.5 : 0), 0, 1);
          for (let i = 0; i < 7; i++) {
            const sx = cx + (i - 3) * 22 * U, sy = b.y + b.h * 0.86 + (i % 2) * 6 * U, r = (11 + (i * 7 % 5)) * U;
            disc(ctx, sx, sy, r, mixc(C.stoneD, C.amberDeep, 0.5 * heat));
            if (heat > 0.05) glow(ctx, sx, sy, r * 2, C.amber, 0.35 * heat);
          }
          // Steam veil grows with the taps.
          sprite(ctx, 'soft', C.silver100, cx, b.y + b.h * 0.45, b.w * 0.7, 0.25 * this.steam, false, 1.2, 0.8);
          // The whisk: handle plus leaf cluster, swinging on each tap.
          const st = at - this.swing, sw = rm() ? 0 : Math.sin(clamp(st / 0.18, 0, 1) * Math.PI) * 0.5;
          const hx = cx + 30 * U, hy = b.y + b.h * 0.2;
          ctx.save(); ctx.translate(hx, hy); ctx.rotate(-0.35 + sw);
          ctx.strokeStyle = rgb(C.woodL); ctx.lineWidth = 5 * U; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-6 * U, 70 * U); ctx.stroke();
          const rng = A.rng(4);
          for (let i = 0; i < 26; i++) {
            const a = rng() * 6.283, d = rng() * 34 * U, lx = -8 * U + Math.cos(a) * d * 0.7, ly = 100 * U + Math.sin(a) * d;
            ctx.fillStyle = rgb(mixc(C.greenDeep, C.amber, 0.25 + 0.3 * rng()), 0.95);
            ctx.beginPath(); ctx.ellipse(lx, ly, 6 * U, 10 * U, a, 0, 6.283); ctx.fill();
          }
          ctx.restore();
          // Counter of taps as a ring of small lights.
          const lit = Math.min(30, Math.floor(this.taps.length / 2));
          for (let i = 0; i < 30; i++) {
            const a = -Math.PI / 2 + (i / 30) * 6.283, x = cx + Math.cos(a) * 26 * U - 70 * U, y = b.y + b.h * 0.32 + Math.sin(a) * 26 * U;
            i < lit ? (glow(ctx, x, y, 7 * U, C.amber, 0.6), disc(ctx, x, y, 2 * U, C.glow)) : disc(ctx, x, y, 1.6 * U, C.silver400, 0.4);
          }
          if (this.t0 === null && !this.done) tapCue(ctx, cx + 20 * U, b.y + b.h * 0.55, U, at, clamp((this.t - 0.4) / 0.4, 0, 1));
          ctx.restore();
        },
      });
    },
  });
})();
