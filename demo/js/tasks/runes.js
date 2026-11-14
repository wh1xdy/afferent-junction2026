(() => {
  // M25 Rune Turn: mental rotation. Two ice tiles each hold a rune; the right one is the left turned,
  // and sometimes also flipped. Tap Same or Mirror.
  const { clamp, rgb, mixc } = A;
  const J = A.J, { C, sprite, glow, disc, unit, tapCue, base, finish, fx, hap, sfx, rm } = J;
  const K = A.TaskKit, R = Math.random, ID = 'runes', FIX = 0.35, LIMIT = 5, ITI = 0.5, BTN_V = 0.66;

  // Chiral runes as block cells on a small grid; none of them is mirror-symmetric.
  const RUNES = [
    [[1, 0], [2, 0], [0, 1], [1, 1], [1, 2]],          // F
    [[0, 0], [0, 1], [0, 2], [0, 3], [1, 3]],          // L
    [[0, 0], [1, 0], [0, 1], [1, 1], [0, 2]],          // P
    [[0, 0], [1, 0], [1, 1], [1, 2], [2, 2], [2, 3]],  // hook
  ].map(cells => {
    const mx = cells.reduce((a, c) => a + c[0], 0) / cells.length, my = cells.reduce((a, c) => a + c[1], 0) / cells.length;
    return cells.map(([x, y]) => [x - mx, y - my]);
  });

  const rune = (ctx, x, y, s, cells, ang, mirror, a, tint) => {
    ctx.save(); ctx.globalAlpha *= a; ctx.translate(x, y); ctx.rotate(ang * Math.PI / 180); ctx.scale(mirror ? -1 : 1, 1);
    const pad = s * 0.06;
    ctx.fillStyle = rgb(mixc(C.night900, tint, 0.15), 0.55);
    for (const [cx, cy] of cells) { ctx.beginPath(); ctx.roundRect(cx * s - s / 2 + pad + s * 0.06, cy * s - s / 2 + pad + s * 0.08, s - 2 * pad, s - 2 * pad, s * 0.18); ctx.fill(); }
    for (const [cx, cy] of cells) {
      const g = ctx.createLinearGradient(0, cy * s - s / 2, 0, cy * s + s / 2);
      g.addColorStop(0, rgb(mixc(C.silver050, tint, 0.25))); g.addColorStop(1, rgb(mixc(C.ice, tint, 0.35)));
      ctx.fillStyle = g; ctx.beginPath(); ctx.roundRect(cx * s - s / 2 + pad, cy * s - s / 2 + pad, s - 2 * pad, s - 2 * pad, s * 0.18); ctx.fill();
    }
    // Small notch marks the rune's head so turning is easier to track.
    const [hx, hy] = cells[0];
    disc(ctx, hx * s, hy * s, s * 0.13, C.night800, 0.55);
    ctx.restore();
  };

  A.defineTask(ID, {
    modes: ['flow'], role: 'Mental rotation (same vs mirror runes)', minS: 22,
    make() {
      const n = 8;
      // Angles balanced: 0 and 180 once each, 45/90/135 twice; each doubled angle gets one same and one mirror.
      const flip0 = R() < 0.5;
      const plan = [[0, flip0], [45, false], [45, true], [90, false], [90, true], [135, false], [135, true], [180, !flip0]];
      const trials = K.shuffle(plan.map(([angle, mirror], i) => ({
        angle, mirror, shape: i % RUNES.length, baseA: 90 * Math.floor(R() * 4), dir: R() < 0.5 ? -1 : 1,
        tint: [C.sky, C.violet300, C.teal, C.silver200][i % 4], on: null, resp: null, rt: null, ok: null,
      })));
      return base(ID, n * (FIX + 3 + ITI) + 4, {
        trials, i: -1, state: 'gap', stateAt: 0, b: null, bot: null, flashAt: -9, flashOk: true, flashSide: 0, outro: 1.3,
        extra: { v: 1, n_trials: n, limit_ms: K.ms(LIMIT) },

        sync() {
          const d = this.trials.filter(t => t.ok !== null), ok = d.filter(t => t.ok);
          const sl = K.slope(ok.map(t => [t.angle, t.rt]));
          Object.assign(this.extra, {
            accuracy: d.length ? K.r3(ok.length / d.length) : null,
            rt_median_ms: K.ms(K.median(ok.map(t => t.rt))),
            rt_slope_ms_per_deg: sl === null ? null : K.r3(sl * 1000),
            errors: d.filter(t => t.ok === false && t.resp !== null).length,
            timeouts: d.filter(t => t.resp === null).length,
          });
          this.items = ok.length; this.errors = d.length - ok.length;
        },

        cur() { return this.state === 'show' ? this.trials[this.i] : null; },

        layout(b) {
          const U = unit(b), tw = Math.min(b.w * 0.4, b.h * 0.5), ty = b.y + b.h * 0.1;
          const tiles = [-1, 1].map(s => ({ x: b.x + b.w / 2 + s * b.w * 0.23 - tw / 2, y: ty, w: tw, h: tw, cx: b.x + b.w / 2 + s * b.w * 0.23, cy: ty + tw / 2 }));
          const bw = b.w * 0.36, bh = Math.max(30 * U, b.h * 0.12), by = b.y + b.h * 0.72;
          const btns = [-1, 1].map(s => ({ x: b.x + b.w / 2 + s * b.w * 0.22 - bw / 2, y: by, w: bw, h: bh, cx: b.x + b.w / 2 + s * b.w * 0.22, cy: by + bh / 2 }));
          return { U, tiles, btns };
        },

        respond(mirror, t) {
          const c = this.cur();
          if (!c || c.resp !== null) return;
          c.resp = mirror; c.rt = Math.max(0, t - c.on); c.ok = mirror === c.mirror;
          this.flashAt = J.at; this.flashOk = c.ok; this.flashSide = mirror ? 1 : -1;
          const b = this.b;
          if (c.ok) {
            if (b) { const L = this.layout(b), P = L.tiles[1]; fx.burst(P.cx, P.cy, 10, C.glow, 130 * L.U, { kind: 'spark', size: [4 * L.U, 1] }); J.bloom(P.cx, P.cy, P.w * 0.8, C.warm, 0.3, 0.12, 0.4); }
            hap('light'); sfx('runes_hit', { piano: [3 + (this.items % 5), 0.1] });
          } else { hap('tick'); sfx('runes_frost'); }
          this.state = 'gap'; this.stateAt = this.t;
          J.border((this.i + 1) / this.trials.length);
          this.sync();
        },

        update(dt, now) {
          if (this.done) return;
          const T = this.t - this.stateAt;
          if (this.state === 'gap' && T >= ITI) {
            if (this.i + 1 >= this.trials.length) { this.sync(); finish(this, now); hap('success'); sfx('runes_done'); J.border(1); J.spill(0.35); return; }
            this.i++; this.state = 'fix'; this.stateAt = this.t;
          } else if (this.state === 'fix' && T >= FIX) { this.state = 'show'; this.stateAt = this.t; const c = this.trials[this.i]; c.on = now; c.onAt = J.at; }
          else if (this.state === 'show' && T >= LIMIT) { this.trials[this.i].ok = false; this.state = 'gap'; this.stateAt = this.t; this.sync(); }
        },

        down(u, v, t) {
          if (this.done) return;
          this.lastIn = this.t;
          if (v < BTN_V) return;
          this.respond(u >= 0.5, t);
        },

        auto(dt, now) {
          const c = this.cur(), B = this.bot || (this.bot = { for: null });
          if (!c || c.resp !== null) return;
          if (B.for !== c) { B.for = c; B.at = now + 0.9 + 0.004 * c.angle + (R() - 0.5) * 0.3; B.m = R() < 0.85 ? c.mirror : !c.mirror; }
          if (now >= B.at) this.down(B.m ? 0.75 : 0.25, 0.8, now);
        },

        draw(ctx, b, at) {
          this.b = b;
          const L = this.layout(b), U = L.U;
          K.card(ctx, b, mixc(C.night700, C.violet500, 0.18), mixc(C.night900, C.tealDeep, 0.25));
          K.clip(ctx, b);
          K.star(ctx, b, 25, U, at, 20, 0.45);
          const c = this.trials[this.i], showing = this.state === 'show' && c;
          const p = showing ? (rm() ? 1 : J.ease.outSoft(clamp((at - c.onAt) / 0.18, 0, 1))) : 0;
          L.tiles.forEach((P, k) => {
            // Ice tile.
            const g = ctx.createLinearGradient(0, P.y, 0, P.y + P.h);
            g.addColorStop(0, rgb(mixc(C.sky, C.night700, 0.55), 0.85)); g.addColorStop(1, rgb(mixc(C.ice, C.night800, 0.7), 0.85));
            ctx.fillStyle = g; ctx.beginPath(); ctx.roundRect(P.x, P.y, P.w, P.h, 14 * U); ctx.fill();
            ctx.strokeStyle = rgb(C.silver100, 0.28); ctx.lineWidth = 1.4 * U; ctx.stroke();
            ctx.strokeStyle = rgb(C.silver050, 0.14); ctx.lineWidth = 0.9 * U;
            const rng = A.rng(k + 31);
            for (let s = 0; s < 6; s++) { const x0 = P.x + rng() * P.w, y0 = P.y + rng() * P.h; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0 + (rng() - 0.5) * 26 * U, y0 + (rng() - 0.5) * 26 * U); ctx.stroke(); }
            sprite(ctx, 'soft', C.silver050, P.cx, P.y + P.h * 0.25, P.w * 0.45, 0.1, false, 1.2, 0.5);
            if (showing) {
              const cells = RUNES[c.shape], s = P.w * 0.17;
              glow(ctx, P.cx, P.cy, P.w * 0.45, c.tint, 0.14 * p);
              if (k === 0) rune(ctx, P.cx, P.cy, s, cells, c.baseA, false, p, c.tint);
              else rune(ctx, P.cx, P.cy, s, cells, c.baseA + c.dir * c.angle, c.mirror, p, c.tint);
            }
          });
          if (this.state === 'fix') { const y = L.tiles[0].cy; disc(ctx, b.x + b.w / 2, y, 2.6 * U, C.silver100, 0.85); glow(ctx, b.x + b.w / 2, y, 10 * U, C.silver200, 0.3); }
          // Buttons.
          const fa = clamp(1 - (at - this.flashAt) / 0.5, 0, 1);
          L.btns.forEach((Q, k) => {
            const side = k ? 1 : -1, lit = fa > 0 && this.flashSide === side;
            ctx.fillStyle = rgb(mixc(C.night600, C.ice, showing ? 0.18 : 0.08), 0.9);
            ctx.beginPath(); ctx.roundRect(Q.x, Q.y, Q.w, Q.h, Q.h / 2); ctx.fill();
            ctx.strokeStyle = rgb(lit ? (this.flashOk ? C.glow : C.ice) : C.silver300, lit ? 0.4 + 0.5 * fa : 0.3); ctx.lineWidth = 1.4 * U; ctx.stroke();
            if (lit && this.flashOk) glow(ctx, Q.cx, Q.cy, Q.w * 0.6, C.glow, 0.3 * fa);
            ctx.fillStyle = rgb(C.silver050, showing ? 0.95 : 0.55);
            ctx.font = '600 ' + Math.round(12 * U) + 'px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(k ? 'Mirror' : 'Same', Q.cx, Q.cy);
          });
          if (fa > 0 && !this.flashOk) { const P = L.tiles[1]; sprite(ctx, 'ring', C.ice, P.cx, P.cy, P.w * 0.5 * (1.4 - fa * 0.4), 0.35 * fa); }
          K.progress(ctx, b, this.trials.length, Math.max(0, this.i + (this.state === 'gap' ? 1 : 0)), U);
          if (showing && this.i === 0 && c.resp === null && at - c.onAt > 3 && !rm()) { const Q = L.btns[c.mirror ? 1 : 0]; tapCue(ctx, Q.cx, Q.cy, U, at, 0.9); }
          ctx.restore();
        },
      });
    },
  });
})();
