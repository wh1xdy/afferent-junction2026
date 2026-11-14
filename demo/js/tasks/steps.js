(() => {
  // M19 Snow Steps: Corsi block spatial span. Footprints appear on snow patches one at a time; echo the path.
  const { clamp, rgb, mixc } = A;
  const J = A.J, { C, glow, disc, unit, tapCue, base, finish, fx, hap, sfx, rm } = J;
  const K = A.TaskKit, R = Math.random, ID = 'steps';
  const N = 9, ON = 0.7, GAP = 0.25, STEP = ON + GAP, LEAD = 0.9, ROUNDS = 3, SPAN0 = 3, SPANMAX = 5, IDLE = 9;

  const makeSeq = span => {
    const s = [];
    let last = -1;
    for (let i = 0; i < span; i++) { let p; do p = Math.floor(R() * N); while (p === last); s.push(p); last = p; }
    return s;
  };

  A.defineTask(ID, {
    modes: ['flow', 'calm'], role: 'Spatial span (Corsi footprints on snow)', minS: 18,
    make() {
      return base(ID, 60, {
        rounds: [], cur: null, phase: 'idle', nextAt: 0.6, span: SPAN0, order: 0, b: null, bot: null,
        marks: {}, outro: 1.2,
        extra: { v: 1, n_rounds: ROUNDS, grid: N },

        patch(i, b) {
          const U = unit(b), side = Math.min(b.w * 0.86, b.h * 0.7), cell = side / 3;
          const x0 = b.x + (b.w - side) / 2, y0 = b.y + b.h * 0.46 - side / 2;
          const c = i % 3, r = Math.floor(i / 3);
          return { x: x0 + cell * (c + 0.5), y: y0 + cell * (r + 0.5), rx: cell * 0.4, ry: cell * 0.33, U };
        },

        sync() {
          const rs = this.rounds.filter(r => r.ok !== null);
          const ok = rs.filter(r => r.ok);
          const echo = rs.filter(r => r.times.length).map(r => r.times[0] - r.presEnd);
          const inter = [];
          for (const r of rs) for (let i = 1; i < r.times.length; i++) inter.push(r.times[i] - r.times[i - 1]);
          Object.assign(this.extra, {
            corsi_span: ok.length ? Math.max(...ok.map(r => r.seq.length)) : 0,
            rounds_correct: ok.length,
            order_errors: this.order,
            echo_ms_median: K.ms(K.median(echo)),
            intertap_ms_median: K.ms(K.median(inter)),
          });
          this.items = this.rounds.reduce((a, r) => a + r.good, 0);
          this.errors = this.order;
        },

        startRound() {
          const r = { span: this.span, seq: makeSeq(this.span), showAt: this.t + LEAD, showAtA: J.at + LEAD, presEnd: null, taps: [], times: [], good: 0, ok: null, endAt: null, lastJ: -1 };
          this.rounds.push(r); this.cur = r; this.phase = 'show';
        },

        endRound(ok, now) {
          const r = this.cur;
          r.ok = ok; r.endAt = this.t; r.endAtA = J.at;
          this.phase = ok ? 'pause' : 'review';
          this.nextAt = this.t + (ok ? 1.0 : 0.8 + r.seq.length * 0.42);
          if (ok) {
            hap('success'); sfx('steps_round', { piano: [5, 0.14] });
            const b = this.b;
            if (b) { const P = this.patch(r.seq[r.seq.length - 1], b); J.bloom(P.x, P.y, P.rx * 2.4, C.glow, 0.35, 0.12, 0.5); }
            this.span = Math.min(SPANMAX, this.span + 1);
          } else { hap('miss'); sfx('steps_miss'); }
          J.border(this.rounds.length / ROUNDS);
          this.sync();
        },

        update(dt, now) {
          if (this.done) return;
          const T = this.t, r = this.cur;
          if (this.phase === 'idle' || this.phase === 'pause' || this.phase === 'review') {
            if (T < this.nextAt) return;
            if (this.rounds.length >= ROUNDS) { this.sync(); finish(this, now); hap('complete'); sfx('steps_done'); J.border(1); J.spill(0.35); return; }
            this.startRound();
            return;
          }
          if (this.phase === 'show') {
            const e = T - r.showAt, j = Math.floor(e / STEP);
            if (e >= 0 && j < r.seq.length && j !== r.lastJ && e - j * STEP < ON) { r.lastJ = j; sfx('steps_show', { piano: [1 + j, 0.07] }); }
            if (e >= r.seq.length * STEP - GAP) { this.phase = 'echo'; r.presEnd = now; r.echoT = T; r.lastTapT = T; }
            return;
          }
          if (this.phase === 'echo' && T - r.lastTapT > IDLE) this.endRound(false, now);
        },

        down(u, v, t) {
          if (this.done || !this.b) return;
          this.lastIn = this.t;
          const r = this.cur;
          if (this.phase !== 'echo' || !r) return;
          const b = this.b, x = b.x + u * b.w, y = b.y + v * b.h;
          let best = -1, bd = Infinity;
          for (let i = 0; i < N; i++) { const P = this.patch(i, b), d = Math.hypot((x - P.x) / P.rx, (y - P.y) / P.ry); if (d < bd) { bd = d; best = i; } }
          if (bd > 1.5) return;
          const i = r.taps.length, want = r.seq[i];
          r.taps.push(best); r.times.push(t); r.lastTapT = this.t;
          const P = this.patch(best, b);
          this.marks[best] = { at: J.at, good: best === want };
          if (best === want) {
            r.good++;
            if (r.taps.length < r.seq.length) hap('tick');
            sfx('steps_tap', { piano: [3 + i, 0.12] });
            fx.snow(P.x, P.y, 4);
            if (r.taps.length >= r.seq.length) this.endRound(true, t);
            else this.sync();
          } else {
            this.order++;
            fx.snow(P.x, P.y - P.ry * 0.3, 6);
            this.endRound(false, t);
          }
        },

        auto(dt, now) {
          const r = this.cur, B = this.bot || (this.bot = { for: null, at: 0 });
          if (this.phase !== 'echo' || !r || !this.b) return;
          if (B.for !== r) { B.for = r; B.at = now + 0.55 + 0.25 * R(); B.ok = R() < 0.85; B.slip = Math.floor(R() * r.seq.length); }
          if (now < B.at) return;
          const i = r.taps.length;
          let p = r.seq[i];
          if (!B.ok && i === B.slip) { do p = Math.floor(R() * N); while (p === r.seq[i]); }
          const P = this.patch(p, this.b);
          this.down((P.x - this.b.x) / this.b.w, (P.y - this.b.y) / this.b.h, now);
          B.at = now + 0.38 + 0.14 * R();
        },

        prints(ctx, P, a, seed) {
          if (a <= 0) return;
          const s = P.rx * 0.2, tilt = ((seed * 37) % 7 - 3) * 0.06, col = mixc(C.silver400, C.night700, 0.35);
          ctx.save(); ctx.translate(P.x, P.y); ctx.rotate(tilt);
          for (const d of [-1, 1]) {
            const ox = d * s * 0.85, oy = d * s * 0.45;
            ctx.fillStyle = rgb(col, 0.8 * a);
            ctx.beginPath(); ctx.ellipse(ox, oy, s * 0.42, s * 0.9, d * 0.08, 0, 6.283); ctx.fill();
            ctx.beginPath(); ctx.ellipse(ox, oy - s * 1.25, s * 0.32, s * 0.36, 0, 0, 6.283); ctx.fill();
            ctx.fillStyle = rgb(C.silver050, 0.35 * a);
            ctx.beginPath(); ctx.ellipse(ox - s * 0.12, oy - s * 0.2, s * 0.14, s * 0.45, 0, 0, 6.283); ctx.fill();
          }
          ctx.restore();
        },

        draw(ctx, b, at) {
          this.b = b;
          const U = unit(b), r = this.cur, T = this.t;
          K.card(ctx, b, mixc(C.night700, C.violet500, 0.2), mixc(C.silver300, C.night800, 0.45));
          K.clip(ctx, b);
          K.star(ctx, b, 19, U, at, 16, 0.45);
          // Snowfield.
          const g = ctx.createLinearGradient(0, b.y + b.h * 0.12, 0, b.y + b.h);
          g.addColorStop(0, rgb(mixc(C.silver200, C.night700, 0.45), 0.9)); g.addColorStop(1, rgb(mixc(C.silver100, C.ice, 0.25), 0.95));
          ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(b.x, b.y + b.h * 0.16);
          ctx.quadraticCurveTo(b.x + b.w * 0.5, b.y + b.h * 0.08, b.x + b.w, b.y + b.h * 0.16);
          ctx.lineTo(b.x + b.w, b.y + b.h); ctx.lineTo(b.x, b.y + b.h); ctx.closePath(); ctx.fill();

          const echo = this.phase === 'echo';
          if (echo) { const P = this.patch(4, b); glow(ctx, P.x, P.y, P.rx * 4.2, C.warm, 0.12 + (rm() ? 0 : 0.04 * Math.sin(at * 2))); }

          // Active presentation step.
          let showI = -1, showA = 0;
          if (r && this.phase === 'show') {
            const e = T - r.showAt, j = Math.floor(e / STEP), w = e - j * STEP;
            if (e >= 0 && j < r.seq.length && w < ON) { showI = r.seq[j]; showA = rm() ? 1 : clamp(Math.min(w / 0.12, (ON - w) / 0.15), 0, 1); }
          }
          // Faint replay of the right path after a slip.
          let revI = -1, revA = 0, revK = -1;
          if (r && this.phase === 'review') {
            const e = T - r.endAt - 0.3, j = Math.floor(e / 0.42), w = e - j * 0.42;
            if (e >= 0 && j < r.seq.length) { revK = j; revI = r.seq[j]; revA = rm() ? 0.5 : 0.5 * clamp(Math.min(w / 0.1, (0.42 - w) / 0.12), 0, 1); }
          }

          for (let i = 0; i < N; i++) {
            const P = this.patch(i, b);
            ctx.fillStyle = rgb(mixc(C.silver300, C.night700, 0.3), 0.35);
            ctx.beginPath(); ctx.ellipse(P.x, P.y + P.ry * 0.12, P.rx, P.ry, 0, 0, 6.283); ctx.fill();
            ctx.fillStyle = rgb(mixc(C.silver050, C.ice, 0.15), 0.95);
            ctx.beginPath(); ctx.ellipse(P.x, P.y, P.rx * 0.96, P.ry * 0.92, 0, 0, 6.283); ctx.fill();
            disc(ctx, P.x - P.rx * 0.3, P.y - P.ry * 0.35, P.rx * 0.18, C.silver050, 0.6);
            if (i === showI) { glow(ctx, P.x, P.y, P.rx * 1.5, C.glow, 0.3 * showA); this.prints(ctx, P, showA, r.seq.length * 3 + i); }
            if (i === revI) this.prints(ctx, P, revA, revK + i);
            const m = this.marks[i];
            if (m) {
              const f = clamp(1 - (at - m.at) / 0.7, 0, 1);
              if (f > 0) {
                if (m.good) { glow(ctx, P.x, P.y, P.rx * 1.4, C.warm, 0.3 * f); this.prints(ctx, P, Math.min(1, f * 1.6), i); }
                else if (!rm()) { ctx.strokeStyle = rgb(C.ice, 0.7 * f); ctx.lineWidth = 2 * U; ctx.beginPath(); ctx.ellipse(P.x + Math.sin(at * 50) * 1.5 * U * f, P.y, P.rx, P.ry, 0, 0, 6.283); ctx.stroke(); }
                else { ctx.strokeStyle = rgb(C.ice, 0.7 * f); ctx.lineWidth = 2 * U; ctx.beginPath(); ctx.ellipse(P.x, P.y, P.rx, P.ry, 0, 0, 6.283); ctx.stroke(); }
              }
            }
          }

          // Echo progress: small pebbles under the grid, one per step of the current span.
          if (r && (echo || this.phase === 'pause' || this.phase === 'review')) {
            const n = r.seq.length, gap = 12 * U, x0 = b.x + b.w / 2 - (n - 1) * gap / 2, y = this.patch(7, b).y + this.patch(7, b).ry + 14 * U;
            for (let i = 0; i < n; i++) disc(ctx, x0 + i * gap, y, 2.6 * U, i < r.good ? C.amber : C.silver600, i < r.good ? 0.9 : 0.45);
          }

          K.progress(ctx, b, ROUNDS, this.rounds.filter(x => x.ok !== null).length, U);
          if (echo && this.rounds.length === 1 && r.taps.length === 0 && T - r.echoT > 1.4 && !rm()) {
            const P = this.patch(r.seq[0], b); tapCue(ctx, P.x, P.y, U, at, 0.8);
          }
          ctx.restore();
        },
      });
    },
  });
})();
