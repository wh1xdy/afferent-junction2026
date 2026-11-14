(() => {
  // M24 Signpost: spatial Stroop / Simon. A trail sign stands left or right of the path; swipe the way its arrow points.
  const { clamp, rgb, mixc } = A;
  const J = A.J, { C, sprite, glow, disc, unit, dragCue, base, finish, fx, hap, sfx, rm } = J;
  const K = A.TaskKit, R = Math.random, ID = 'signpost', FIX = 0.4, LIMIT = 2.2, ITI = 0.4, SWIPE = 0.07;

  const pine = (ctx, x, y, s, a = 1) => {
    ctx.save(); ctx.globalAlpha *= a;
    ctx.fillStyle = rgb(C.woodD); ctx.fillRect(x - s * 0.08, y - s * 0.25, s * 0.16, s * 0.3);
    for (let k = 0; k < 3; k++) {
      const w = s * (0.55 - k * 0.13), ty = y - s * (0.2 + k * 0.32), h = s * 0.5;
      ctx.fillStyle = rgb(mixc(C.night700, C.greenDeep, 0.22 - k * 0.03));
      ctx.beginPath(); ctx.moveTo(x - w, ty); ctx.lineTo(x, ty - h); ctx.lineTo(x + w, ty); ctx.closePath(); ctx.fill();
      ctx.fillStyle = rgb(C.silver100, 0.75);
      ctx.beginPath(); ctx.moveTo(x - w * 0.55, ty - h * 0.45); ctx.lineTo(x, ty - h); ctx.lineTo(x + w * 0.55, ty - h * 0.45); ctx.quadraticCurveTo(x, ty - h * 0.35, x - w * 0.55, ty - h * 0.45); ctx.fill();
    }
    ctx.restore();
  };

  // Wooden sign: post at x, arrow board pointing dir (-1 left, 1 right).
  const sign = (ctx, x, y, s, dir, a, lift) => {
    ctx.save(); ctx.globalAlpha *= a; ctx.translate(x, y);
    sprite(ctx, 'soft', C.night950, 0, 0, s * 1.1, 0.35, false, 2.4, 0.3);
    ctx.fillStyle = rgb(C.wood); ctx.fillRect(-s * 0.09, -s * 1.9, s * 0.18, s * 1.9);
    ctx.fillStyle = rgb(C.woodD, 0.7); ctx.fillRect(s * 0.03, -s * 1.9, s * 0.06, s * 1.9);
    ctx.fillStyle = rgb(C.silver100, 0.9); ctx.beginPath(); ctx.ellipse(0, 0, s * 0.32, s * 0.08, 0, 0, Math.PI * 2); ctx.fill();
    ctx.translate(0, -s * 1.55 - lift); ctx.scale(dir, 1);
    const L = s * 1.15, H = s * 0.44;
    ctx.fillStyle = rgb(C.woodL);
    ctx.beginPath(); ctx.moveTo(-L * 0.6, -H / 2); ctx.lineTo(L * 0.62, -H / 2); ctx.lineTo(L, 0); ctx.lineTo(L * 0.62, H / 2); ctx.lineTo(-L * 0.6, H / 2); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = rgb(C.woodD, 0.8); ctx.lineWidth = s * 0.05; ctx.stroke();
    ctx.strokeStyle = rgb(C.wood, 0.6); ctx.lineWidth = s * 0.03;
    for (const f of [-0.15, 0.15]) { ctx.beginPath(); ctx.moveTo(-L * 0.5, H * f); ctx.lineTo(L * 0.55, H * f); ctx.stroke(); }
    // Painted arrow on the board and a snow cap on top.
    ctx.strokeStyle = rgb(C.glow, 0.9); ctx.lineWidth = s * 0.08; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(-L * 0.35, 0); ctx.lineTo(L * 0.5, 0); ctx.moveTo(L * 0.3, -H * 0.24); ctx.lineTo(L * 0.5, 0); ctx.lineTo(L * 0.3, H * 0.24); ctx.stroke();
    ctx.fillStyle = rgb(C.silver050, 0.92);
    ctx.beginPath(); ctx.moveTo(-L * 0.62, -H / 2); ctx.quadraticCurveTo(0, -H * 0.85, L * 0.64, -H / 2); ctx.lineTo(L * 0.4, -H * 0.42); ctx.quadraticCurveTo(0, -H * 0.5, -L * 0.62, -H / 2); ctx.fill();
    disc(ctx, -L * 0.45, 0, s * 0.045, C.woodD);
    ctx.restore();
  };

  A.defineTask(ID, {
    modes: ['wake', 'flow'], role: 'Spatial Stroop (trail sign)', minS: 16,
    make() {
      const n = 12;
      // side x direction, 3 of each: half congruent (side == direction).
      const trials = K.shuffle(Array.from({ length: n }, (_, i) => ({ side: i % 2 ? 1 : -1, dir: Math.floor(i / 2) % 2 ? 1 : -1 })))
        .map(t => ({ ...t, cong: t.side === t.dir, on: null, resp: null, rt: null, ok: null }));
      return base(ID, n * (FIX + 1.1 + ITI) + 3, {
        trials, i: -1, state: 'gap', stateAt: 0, b: null, bot: null, ptr: null, tilt: 0, flashAt: -9, flashOk: true, outro: 1.3,
        extra: { v: 1, n_trials: n },

        sync() {
          const d = this.trials.filter(t => t.resp !== null || t.ok === false);
          const rt = c => K.median(d.filter(t => t.cong === c && t.ok).map(t => t.rt));
          const rc = rt(true), ri = rt(false);
          Object.assign(this.extra, {
            rt_congruent_ms: K.ms(rc), rt_incongruent_ms: K.ms(ri), interference_ms: rc !== null && ri !== null ? K.ms(ri - rc) : null,
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
          this.flashAt = J.at; this.flashOk = c.ok; this.flashSide = c.side;
          const b = this.b;
          if (c.ok) {
            if (b) { const U = unit(b), sx = b.x + b.w / 2 + c.side * b.w * 0.27; fx.burst(sx + dir * 30 * U, b.y + b.h * 0.42, 10, C.glow, 130 * U, { kind: 'spark', size: [4 * U, 1] }); }
            hap('hit'); sfx('signpost_ok', { piano: [3 + (this.items % 5), 0.12] });
          } else { hap('miss'); sfx('signpost_miss'); }
          this.state = 'gap'; this.stateAt = this.t;
          J.border((this.i + 1) / this.trials.length);
          this.sync();
        },

        update(dt, now) {
          this.tilt *= Math.exp(-dt * 6);
          if (this.done) return;
          if (this.state === 'gap' && this.t - this.stateAt >= ITI) {
            if (this.i + 1 >= this.trials.length) { this.sync(); finish(this, now); hap('complete'); sfx('signpost_done'); J.border(1); J.spill(0.35); return; }
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
          // A plain tap counts by screen half, so a half-awake tap still answers.
          this.respond(Math.abs(dx) >= SWIPE * 0.5 ? (dx > 0 ? 1 : -1) : u >= 0.5 ? 1 : -1, t);
        },

        auto(dt, now) {
          const c = this.cur(), B = this.bot || (this.bot = { for: null });
          if (!c || c.resp !== null) return;
          if (B.for !== c) { B.for = c; B.at = now + (c.cong ? 0.46 : 0.55) + 0.15 * R(); B.dir = R() < (c.cong ? 0.97 : 0.88) ? c.dir : -c.dir; }
          if (now >= B.at) { this.down(0.5, 0.6, now); this.move(0.5 + B.dir * 0.1, 0.6, now); this.up(0.5 + B.dir * 0.1, 0.6, now); }
        },

        draw(ctx, b, at) {
          this.b = b;
          const U = unit(b), cx = b.x + b.w / 2, hz = b.y + b.h * 0.3, gy = b.y + b.h * 0.62;
          K.card(ctx, b, mixc(C.night700, C.violet500, 0.28), mixc(C.night800, C.silver600, 0.35));
          K.clip(ctx, b);
          K.star(ctx, b, 24, U, at, 16, 0.45);
          glow(ctx, cx, hz, b.w * 0.5, C.peach, 0.12);
          // Snowfield and the trail running up the middle.
          ctx.fillStyle = rgb(mixc(C.silver300, C.night700, 0.45)); ctx.fillRect(b.x, hz, b.w, b.h);
          ctx.fillStyle = rgb(mixc(C.silver200, C.violet300, 0.15), 0.85);
          ctx.beginPath(); ctx.moveTo(cx - b.w * 0.02, hz); ctx.lineTo(cx + b.w * 0.02, hz); ctx.lineTo(cx + b.w * 0.17, b.y + b.h); ctx.lineTo(cx - b.w * 0.17, b.y + b.h); ctx.closePath(); ctx.fill();
          ctx.strokeStyle = rgb(C.silver500, 0.25); ctx.lineWidth = 1.2 * U;
          for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(cx + s * b.w * 0.005, hz); ctx.lineTo(cx + s * b.w * 0.07, b.y + b.h); ctx.stroke(); }
          // Pines along both edges, small in the distance.
          const rng = A.rng(41);
          for (let k = 0; k < 14; k++) {
            const d = k / 13, s = (14 + 34 * d * d) * U, y = hz + (b.h * 0.7) * d * d + 4 * U, side = k % 2 ? 1 : -1;
            const x = cx + side * (b.w * (0.06 + 0.42 * d * d) + (12 + rng() * 18) * U * (0.4 + d));
            if (Math.abs(x - cx) < b.w * 0.36 && d > 0.55) continue;
            pine(ctx, x, y, s, 0.55 + 0.45 * d);
          }
          const c = this.state === 'show' ? this.trials[this.i] : null;
          if (this.state === 'fix') { disc(ctx, cx, gy - 30 * U, 2.5 * U, C.silver050, 0.85); glow(ctx, cx, gy - 30 * U, 10 * U, C.glow, 0.3); }
          if (c) {
            const p = rm() ? 1 : J.ease.outSoft(clamp((at - c.onAt) / 0.15, 0, 1)), sx = cx + c.side * b.w * 0.27;
            glow(ctx, sx, gy - 60 * U, 46 * U, C.glow, 0.14 * p);
            sign(ctx, sx + this.tilt * 4 * U, gy, 34 * U, c.dir, p, rm() ? 0 : (1 - p) * 8 * U);
          }
          const fa = clamp(1 - (at - this.flashAt) / 0.5, 0, 1), fx0 = cx + (this.flashSide || 0) * b.w * 0.27;
          if (fa > 0 && this.flashOk) glow(ctx, fx0, gy - 55 * U, 70 * U, C.glow, 0.35 * fa);
          if (fa > 0 && !this.flashOk) sprite(ctx, 'ring', C.ice, fx0, gy - 50 * U, 40 * U * (1.5 - fa * 0.5), 0.4 * fa);
          if (!rm()) {
            const fr = A.rng(7);
            for (let k = 0; k < 18; k++) { const x = b.x + ((fr() * b.w + at * 6 * U * (0.5 + fr())) % b.w), y = b.y + ((fr() * b.h + at * 14 * U * (0.6 + fr())) % b.h); disc(ctx, x, y, (0.8 + fr()) * U, C.silver050, 0.5); }
          }
          K.progress(ctx, b, this.trials.length, Math.max(0, this.i + (this.state === 'gap' ? 1 : 0)), U);
          if (c && this.i === 0 && c.resp === null && at - c.onAt > 1.1 && !rm()) dragCue(ctx, J.line(cx, gy + 40 * U, cx + c.dir * 70 * U, gy + 40 * U), U, at, 0.85, 1.6);
          ctx.restore();
        },
      });
    },
  });
})();
