(() => {
  // M23 Swan Line: flanker. Five swans in a row; swipe the way the middle one swims.
  const { clamp, lerp, rgb, mixc } = A;
  const J = A.J, { C, sprite, glow, disc, unit, dragCue, base, finish, fx, hap, sfx, rm } = J;
  const K = A.TaskKit, R = Math.random, ID = 'swans', FIX = 0.45, LIMIT = 2.2, ITI = 0.4, SWIPE = 0.07;

  const swan = (ctx, x, y, s, dir, a, centre) => {
    ctx.save(); ctx.globalAlpha *= a; ctx.translate(x, y); ctx.scale(dir, 1);
    ctx.fillStyle = rgb(centre ? C.silver050 : C.silver200);
    ctx.beginPath(); ctx.moveTo(-s * 1.1, -s * 0.1); ctx.quadraticCurveTo(-s * 0.9, -s * 0.75, s * 0.15, -s * 0.45); ctx.quadraticCurveTo(s * 0.8, -s * 0.2, s * 0.75, 0); ctx.quadraticCurveTo(0, s * 0.3, -s * 1.1, -s * 0.1); ctx.fill();
    ctx.strokeStyle = rgb(centre ? C.silver050 : C.silver200); ctx.lineWidth = s * 0.2; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(s * 0.45, -s * 0.3); ctx.quadraticCurveTo(s * 0.35, -s * 1.1, s * 0.7, -s * 1.35); ctx.stroke();
    disc(ctx, s * 0.75, -s * 1.38, s * 0.16, centre ? C.silver050 : C.silver200);
    ctx.fillStyle = rgb(C.amberDeep); ctx.beginPath(); ctx.moveTo(s * 0.86, -s * 1.44); ctx.lineTo(s * 1.18, -s * 1.3); ctx.lineTo(s * 0.86, -s * 1.28); ctx.fill();
    disc(ctx, s * 0.78, -s * 1.42, s * 0.05, C.night950);
    ctx.restore();
  };

  A.defineTask(ID, {
    modes: ['flow', 'wake'], role: 'Flanker (swans in a line)', minS: 16,
    make() {
      const n = 12;
      const trials = K.shuffle(Array.from({ length: n }, (_, i) => ({ dir: i % 2 ? 1 : -1, cong: Math.floor(i / 2) % 2 === 0 })))
        .map(t => ({ ...t, on: null, resp: null, rt: null, ok: null }));
      return base(ID, n * (FIX + 1.1 + ITI) + 3, {
        trials, i: -1, state: 'gap', stateAt: 0, b: null, bot: null, ptr: null, tilt: 0, flashAt: -9, flashOk: true, outro: 1.3,
        extra: { v: 1, n_trials: n },

        sync() {
          const d = this.trials.filter(t => t.resp !== null || t.ok === false);
          const rt = c => K.median(d.filter(t => t.cong === c && t.ok).map(t => t.rt));
          const rc = rt(true), ri = rt(false);
          Object.assign(this.extra, {
            rt_congruent_ms: K.ms(rc), rt_incongruent_ms: K.ms(ri), flanker_effect_ms: rc !== null && ri !== null ? K.ms(ri - rc) : null,
            errors: d.filter(t => t.ok === false && t.resp !== null).length, errors_incongruent: d.filter(t => t.ok === false && t.resp !== null && !t.cong).length,
            timeouts: d.filter(t => t.resp === null).length,
            accuracy: d.length ? K.r3(d.filter(t => t.ok).length / d.length) : null,
          });
          this.items = d.filter(t => t.ok).length; this.errors = d.length - this.items;
        },

        cur() { return this.state === 'show' ? this.trials[this.i] : null; },

        respond(dir, t) {
          const c = this.cur();
          if (!c || c.resp !== null) return;
          c.resp = dir; c.rt = Math.max(0, t - c.on); c.ok = dir === c.dir;
          this.flashAt = J.at; this.flashOk = c.ok;
          const b = this.b;
          if (c.ok) {
            if (b) { const U = unit(b); fx.burst(b.x + b.w / 2 + dir * 40 * U, b.y + b.h * 0.55, 10, C.glow, 140 * U, { kind: 'spark', size: [4 * U, 1] }); }
            hap('hit'); sfx('swans_glide', { piano: [3 + (this.items % 5), 0.12] });
          } else { hap('miss'); sfx('swans_splash'); }
          this.state = 'gap'; this.stateAt = this.t;
          J.border((this.i + 1) / this.trials.length);
          this.sync();
        },

        update(dt, now) {
          this.tilt *= Math.exp(-dt * 6);
          if (this.done) return;
          if (this.state === 'gap' && this.t - this.stateAt >= ITI) {
            if (this.i + 1 >= this.trials.length) { this.sync(); finish(this, now); hap('complete'); sfx('swans_done'); J.border(1); J.spill(0.35); return; }
            this.i++; this.state = 'fix'; this.stateAt = this.t;
          }
          if (this.state === 'fix' && this.t - this.stateAt >= FIX) { this.state = 'show'; this.stateAt = this.t; this.trials[this.i].on = now; this.trials[this.i].onAt = J.at; }
          if (this.state === 'show' && this.t - this.stateAt >= LIMIT) { const c = this.trials[this.i]; c.ok = false; this.state = 'gap'; this.stateAt = this.t; this.sync(); }
        },

        down(u, v, t) { if (this.done) return; this.lastIn = this.t; this.ptr = { u, v, t, fired: false }; },
        move(u, v, t) {
          const p = this.ptr;
          if (!p || p.fired) return;
          const dx = u - p.u;
          this.tilt = clamp(dx / SWIPE, -1, 1);
          if (Math.abs(dx) >= SWIPE) { p.fired = true; this.respond(dx > 0 ? 1 : -1, t); }
        },
        up(u, v, t) {
          const p = this.ptr;
          this.ptr = null;
          if (!p || p.fired || this.done) return;
          const dx = u - p.u;
          // A plain tap counts by side, so a half-awake tap still answers.
          this.respond(Math.abs(dx) >= SWIPE * 0.5 ? (dx > 0 ? 1 : -1) : u >= 0.5 ? 1 : -1, t);
        },

        auto(dt, now) {
          const c = this.cur(), B = this.bot || (this.bot = { for: null });
          if (!c || c.resp !== null) return;
          if (B.for !== c) { B.for = c; B.at = now + (c.cong ? 0.48 : 0.56) + 0.15 * R(); B.dir = R() < (c.cong ? 0.97 : 0.88) ? c.dir : -c.dir; }
          if (now >= B.at) { this.down(0.5, 0.6, now); this.move(0.5 + B.dir * 0.1, 0.6, now); this.up(0.5 + B.dir * 0.1, 0.6, now); }
        },

        draw(ctx, b, at) {
          this.b = b;
          const U = unit(b), cx = b.x + b.w / 2, wy = b.y + b.h * 0.58;
          K.card(ctx, b, mixc(C.night700, C.violet500, 0.2), mixc(C.tealDeep, C.night900, 0.7));
          K.clip(ctx, b);
          K.star(ctx, b, 3, U, at, 18, 0.5);
          // Far shore and water lines.
          ctx.fillStyle = rgb(mixc(C.night800, C.silver600, 0.25)); ctx.beginPath(); ctx.moveTo(b.x, b.y + b.h * 0.44);
          ctx.quadraticCurveTo(b.x + b.w * 0.3, b.y + b.h * 0.38, b.x + b.w * 0.55, b.y + b.h * 0.43); ctx.quadraticCurveTo(b.x + b.w * 0.8, b.y + b.h * 0.4, b.x + b.w, b.y + b.h * 0.44);
          ctx.lineTo(b.x + b.w, b.y + b.h * 0.46); ctx.lineTo(b.x, b.y + b.h * 0.46); ctx.fill();
          ctx.strokeStyle = rgb(C.silver300, 0.12); ctx.lineWidth = 1 * U;
          for (let i = 0; i < 7; i++) { const y = b.y + b.h * (0.5 + i * 0.06), o = rm() ? 0 : Math.sin(at * 0.6 + i) * 10 * U; ctx.beginPath(); ctx.moveTo(b.x + 20 * U + o, y); ctx.lineTo(b.x + b.w - 20 * U + o, y); ctx.stroke(); }
          const c = this.state === 'show' ? this.trials[this.i] : null, gap = 50 * U;
          if (this.state === 'fix') { disc(ctx, cx, wy - 12 * U, 2.5 * U, C.silver200, 0.8); glow(ctx, cx, wy - 12 * U, 10 * U, C.silver200, 0.3); }
          if (c) {
            const p = rm() ? 1 : J.ease.outSoft(clamp((at - c.onAt) / 0.15, 0, 1)), bob = k => (rm() ? 0 : Math.sin(at * 2 + k) * 1.5 * U);
            for (let k = -2; k <= 2; k++) {
              const dir = k === 0 ? c.dir : c.cong ? c.dir : -c.dir;
              if (k === 0) glow(ctx, cx, wy - 10 * U, 34 * U, C.glow, 0.18 * p);
              swan(ctx, cx + k * gap + (k === 0 ? this.tilt * 8 * U : 0), wy + bob(k), 17 * U, dir, p, k === 0);
              sprite(ctx, 'soft', C.silver200, cx + k * gap, wy + 6 * U, 22 * U, 0.12 * p, false, 1.4, 0.25);
            }
          }
          const fa = clamp(1 - (at - this.flashAt) / 0.5, 0, 1);
          if (fa > 0 && this.flashOk) glow(ctx, cx, wy - 10 * U, 70 * U, C.glow, 0.4 * fa);
          if (fa > 0 && !this.flashOk) sprite(ctx, 'ring', C.ice, cx, wy, 40 * U * (1.5 - fa * 0.5), 0.4 * fa);
          K.progress(ctx, b, this.trials.length, Math.max(0, this.i + (this.state === 'gap' ? 1 : 0)), U);
          if (c && this.i === 0 && c.resp === null && at - c.onAt > 1.1 && !rm()) dragCue(ctx, J.line(cx, wy + 50 * U, cx + c.dir * 70 * U, wy + 50 * U), U, at, 0.85, 1.6);
          ctx.restore();
        },
      });
    },
  });
})();
