(() => {
  // M26 Frost Faces: dot-probe. A sad and a neutral face flash in two frosted panes,
  // then a small light appears where one of them was. Tap the light.
  const { clamp, lerp, rgb, mixc } = A;
  const J = A.J, { C, sprite, glow, disc, unit, tapCue, base, finish, fx, hap, sfx, rm } = J;
  const K = A.TaskKit, R = Math.random, ID = 'faces', FIX = 0.5, FACE = 0.5, LIMIT = 2, ITI = 0.45;

  const face = (ctx, x, y, s, sad, tint, a) => {
    ctx.save(); ctx.globalAlpha *= a; ctx.translate(x, y);
    disc(ctx, 0, 0, s, mixc(C.peach, tint, 0.25));
    ctx.fillStyle = rgb(mixc(C.woodD, tint, 0.2)); ctx.beginPath(); ctx.arc(0, -s * 0.15, s * 1.02, Math.PI * 1.08, Math.PI * 1.92); ctx.fill();
    ctx.strokeStyle = rgb(C.night900, 0.85); ctx.lineWidth = s * 0.08; ctx.lineCap = 'round';
    for (const d of [-1, 1]) {
      disc(ctx, d * s * 0.36, -s * 0.08, s * 0.09, C.night900, 0.9);
      ctx.beginPath();
      if (sad) { ctx.moveTo(d * s * 0.18, -s * 0.36); ctx.lineTo(d * s * 0.52, -s * 0.28); }
      else { ctx.moveTo(d * s * 0.2, -s * 0.3); ctx.lineTo(d * s * 0.52, -s * 0.3); }
      ctx.stroke();
    }
    ctx.beginPath();
    if (sad) { ctx.moveTo(-s * 0.32, s * 0.48); ctx.quadraticCurveTo(0, s * 0.22, s * 0.32, s * 0.48); }
    else { ctx.moveTo(-s * 0.3, s * 0.4); ctx.lineTo(s * 0.3, s * 0.4); }
    ctx.stroke();
    ctx.restore();
  };

  A.defineTask(ID, {
    modes: ['calm', 'flow'], role: 'Dot-probe (sad vs neutral faces)', minS: 18,
    make() {
      const n = 12;
      // Balanced: sad face left/right x probe at sad/neutral, 3 of each cell.
      const trials = K.shuffle(Array.from({ length: n }, (_, i) => ({ sadSide: i % 2 ? 1 : -1, atSad: Math.floor(i / 2) % 2 === 0, tint: [C.sky, C.coralSoft, C.violet300][i % 3] })))
        .map(t => ({ ...t, probeSide: t.atSad ? t.sadSide : -t.sadSide, on: null, resp: null, rt: null, ok: null }));
      return base(ID, n * (FIX + FACE + 0.9 + ITI) + 3, {
        trials, i: -1, state: 'gap', stateAt: 0, b: null, bot: null, hitAt: -9, missAt: -9, outro: 1.3,
        extra: { v: 1, n_trials: n, face_ms: K.ms(FACE) },

        sync() {
          const d = this.trials.filter(t => t.ok !== null), ok = d.filter(t => t.ok);
          const rs = K.median(ok.filter(t => t.atSad).map(t => t.rt)), rn = K.median(ok.filter(t => !t.atSad).map(t => t.rt));
          Object.assign(this.extra, {
            rt_probe_sad_ms: K.ms(rs), rt_probe_neutral_ms: K.ms(rn),
            bias_ms: rs !== null && rn !== null ? K.ms(rn - rs) : null,
            errors: d.filter(t => t.ok === false && t.resp !== null).length, misses: d.filter(t => t.resp === null).length,
          });
          this.items = ok.length; this.errors = d.length - ok.length;
        },

        pane(side, b) {
          const U = unit(b), w = b.w * 0.36, h = b.h * 0.5;
          return { x: b.x + b.w / 2 + side * b.w * 0.22 - w / 2, y: b.y + b.h * 0.2, w, h, U, cx: b.x + b.w / 2 + side * b.w * 0.22, cy: b.y + b.h * 0.2 + h / 2 };
        },

        update(dt, now) {
          if (this.done) return;
          const T = this.t - this.stateAt;
          if (this.state === 'gap' && T >= ITI) {
            if (this.i + 1 >= this.trials.length) { this.sync(); finish(this, now); hap('complete'); sfx('faces_done'); J.border(1); J.spill(0.3); return; }
            this.i++; this.state = 'fix'; this.stateAt = this.t;
          } else if (this.state === 'fix' && T >= FIX) { this.state = 'face'; this.stateAt = this.t; this.trials[this.i].faceAt = J.at; }
          else if (this.state === 'face' && T >= FACE) { this.state = 'probe'; this.stateAt = this.t; const c = this.trials[this.i]; c.on = now; c.onAt = J.at; sfx('faces_light'); }
          else if (this.state === 'probe' && T >= LIMIT) { this.trials[this.i].ok = false; this.state = 'gap'; this.stateAt = this.t; this.sync(); }
        },

        down(u, v, t) {
          if (this.done) return;
          this.lastIn = this.t;
          if (this.state !== 'probe') return;
          const c = this.trials[this.i], side = u >= 0.5 ? 1 : -1;
          c.resp = side; c.rt = Math.max(0, t - c.on); c.ok = side === c.probeSide;
          const b = this.b;
          if (c.ok) {
            this.hitAt = J.at;
            if (b) { const P = this.pane(c.probeSide, b); fx.burst(P.cx, P.cy, 10, C.glow, 130 * P.U, { kind: 'spark', size: [4 * P.U, 1] }); J.bloom(P.cx, P.cy, P.w * 0.9, C.warm, 0.3, 0.12, 0.4); }
            hap('hit'); sfx('faces_hit', { piano: [3 + (this.items % 5), 0.1] });
          } else { this.missAt = J.at; hap('miss'); sfx('faces_frost'); }
          this.state = 'gap'; this.stateAt = this.t;
          J.border((this.i + 1) / this.trials.length);
          this.sync();
        },

        auto(dt, now) {
          const B = this.bot || (this.bot = { for: null });
          if (this.state !== 'probe') return;
          const c = this.trials[this.i];
          if (B.for !== c) { B.for = c; B.at = now + (c.atSad ? 0.36 : 0.41) + 0.12 * R(); B.side = R() < 0.96 ? c.probeSide : -c.probeSide; }
          if (now >= B.at) this.down(B.side > 0 ? 0.75 : 0.25, 0.5, now);
        },

        draw(ctx, b, at) {
          this.b = b;
          const U = unit(b);
          K.card(ctx, b, mixc(C.woodL, C.night900, 0.5), mixc(C.woodD, C.night950, 0.5));
          K.clip(ctx, b);
          ctx.strokeStyle = rgb(C.woodD, 0.5); ctx.lineWidth = 1.2 * U;
          for (let y = b.y + 10 * U; y < b.y + b.h; y += 14 * U) { ctx.beginPath(); ctx.moveTo(b.x, y); ctx.lineTo(b.x + b.w, y); ctx.stroke(); }
          const c = this.trials[this.i];
          for (const side of [-1, 1]) {
            const P = this.pane(side, b);
            ctx.fillStyle = rgb(C.woodD); ctx.fillRect(P.x - 6 * U, P.y - 6 * U, P.w + 12 * U, P.h + 12 * U);
            const g = ctx.createLinearGradient(0, P.y, 0, P.y + P.h);
            g.addColorStop(0, rgb(mixc(C.sky, C.night700, 0.35))); g.addColorStop(1, rgb(mixc(C.silver300, C.night800, 0.3)));
            ctx.fillStyle = g; ctx.fillRect(P.x, P.y, P.w, P.h);
            if (this.state === 'face' && c) {
              const a = rm() ? 1 : clamp((at - c.faceAt) / 0.06, 0, 1);
              face(ctx, P.cx, P.cy, P.w * 0.3, side === c.sadSide, c.tint, a);
            }
            // Frost veil keeps the faces soft.
            sprite(ctx, 'soft', C.silver050, P.cx, P.cy, P.w * 0.7, 0.22, false, 1, P.h / P.w);
            ctx.strokeStyle = rgb(C.silver050, 0.3); ctx.lineWidth = 0.9 * U;
            const rng = A.rng(side + 9);
            for (let s = 0; s < 9; s++) { const x0 = P.x + rng() * P.w, y0 = P.y + rng() * P.h; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0 + (rng() - 0.5) * 30 * U, y0 + (rng() - 0.5) * 30 * U); ctx.stroke(); }
            if (this.state === 'probe' && c && side === c.probeSide) {
              const p = rm() ? 1 : J.ease.outBack(clamp((at - c.onAt) / 0.12, 0, 1));
              glow(ctx, P.cx, P.cy, 26 * U * p, C.glow, 0.8); disc(ctx, P.cx, P.cy, 5 * U * p, C.daylight);
            }
            ctx.fillStyle = rgb(C.woodD); ctx.fillRect(P.cx - 2 * U, P.y, 4 * U, P.h); ctx.fillRect(P.x, P.cy - 2 * U, P.w, 4 * U);
          }
          if (this.state === 'fix') { disc(ctx, b.x + b.w / 2, b.y + b.h * 0.45, 2.6 * U, C.silver100, 0.85); }
          K.progress(ctx, b, this.trials.length, Math.max(0, this.i + (this.state === 'gap' ? 1 : 0)), U);
          if (this.state === 'probe' && c && this.i === 0 && at - c.onAt > 0.9 && !rm()) { const P = this.pane(c.probeSide, b); tapCue(ctx, P.cx, P.cy, U, at, 0.9); }
          ctx.restore();
        },
      });
    },
  });
})();
