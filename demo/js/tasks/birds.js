(() => {
  // M20 Same Bird: 1-back. Tap when the bird on the branch matches the one before.
  const { clamp, lerp, rgb, mixc } = A;
  const J = A.J, { C, sprite, glow, disc, unit, tapCue, base, finish, fx, hap, sfx, rm } = J;
  const K = A.TaskKit, R = Math.random, ID = 'birds', SHOW = 1.1, GAP = 0.45;
  const H = A.hex;
  const KINDS = [
    { id: 'bullfinch', body: H('#4A4F5C'), breast: H('#E2685A'), cap: H('#14161C') },
    { id: 'bluetit', body: H('#7FA6C9'), breast: H('#F2D16B'), cap: H('#3D74B8') },
    { id: 'waxwing', body: H('#B79A82'), breast: H('#D8BFA4'), cap: H('#B79A82'), crest: true },
    { id: 'robin', body: H('#7A6A55'), breast: H('#E89A4F'), cap: H('#7A6A55') },
  ];

  const bird = (ctx, x, y, s, k, a, at, hop) => {
    ctx.save(); ctx.globalAlpha *= a; ctx.translate(x, y - hop * s * 0.5);
    ctx.fillStyle = rgb(mixc(k.body, C.night900, 0.25)); ctx.beginPath(); ctx.moveTo(-s * 0.9, -s * 0.2); ctx.lineTo(-s * 1.5, s * 0.05); ctx.lineTo(-s * 0.8, s * 0.15); ctx.fill();
    ctx.fillStyle = rgb(k.body); ctx.beginPath(); ctx.ellipse(0, -s * 0.25, s * 0.95, s * 0.7, -0.1, 0, 6.283); ctx.fill();
    ctx.fillStyle = rgb(k.breast); ctx.beginPath(); ctx.ellipse(s * 0.25, -s * 0.05, s * 0.55, s * 0.5, 0, 0, 6.283); ctx.fill();
    ctx.fillStyle = rgb(mixc(k.body, C.night900, 0.15)); ctx.beginPath(); ctx.ellipse(-s * 0.2, -s * 0.3, s * 0.55, s * 0.35, -0.3, 0, 6.283); ctx.fill();
    ctx.fillStyle = rgb(k.body); ctx.beginPath(); ctx.arc(s * 0.6, -s * 0.85, s * 0.45, 0, 6.283); ctx.fill();
    ctx.fillStyle = rgb(k.cap); ctx.beginPath(); ctx.arc(s * 0.6, -s * 0.9, s * 0.46, Math.PI * 1.05, Math.PI * 1.95); ctx.fill();
    if (k.crest) { ctx.beginPath(); ctx.moveTo(s * 0.35, -s * 1.2); ctx.lineTo(s * 0.1, -s * 1.7); ctx.lineTo(s * 0.7, -s * 1.3); ctx.fill(); }
    disc(ctx, s * 0.78, -s * 0.9, s * 0.09, C.night950);
    ctx.fillStyle = rgb(C.amberDeep); ctx.beginPath(); ctx.moveTo(s * 1.0, -s * 0.85); ctx.lineTo(s * 1.3, -s * 0.78); ctx.lineTo(s * 1.0, -s * 0.7); ctx.fill();
    ctx.strokeStyle = rgb(C.night950); ctx.lineWidth = s * 0.08;
    ctx.beginPath(); ctx.moveTo(-s * 0.1, s * 0.4); ctx.lineTo(-s * 0.1, s * 0.62); ctx.moveTo(s * 0.2, s * 0.4); ctx.lineTo(s * 0.2, s * 0.62); ctx.stroke();
    ctx.restore();
  };

  A.defineTask(ID, {
    modes: ['flow', 'calm'], role: '1-back (birds on a birch)', minS: 16,
    make() {
      const n = 14, nMatch = 4;
      // Choose match positions (never the first), then fill the rest with a different bird from the one before.
      let pos;
      do { pos = new Set(K.shuffle([...Array(n - 1).keys()].map(i => i + 1)).slice(0, nMatch)); } while ([...pos].some(i => pos.has(i + 1) && pos.has(i + 2)));
      const seq = [];
      for (let i = 0; i < n; i++) {
        if (pos.has(i)) seq.push(seq[i - 1]);
        else { let c; do c = Math.floor(R() * KINDS.length); while (i > 0 && c === seq[i - 1]); seq.push(c); }
      }
      const trials = seq.map((kind, i) => ({ kind, match: i > 0 && kind === seq[i - 1], on: null, off: null, tap: null, rt: null }));
      return base(ID, n * (SHOW + GAP) + 3, {
        trials, i: -1, cur: null, nextAt: 0.8, empty: 0, b: null, bot: null, okAt: -9, noAt: -9, outro: 1.3,
        extra: { v: 1, n_birds: n, n_match: nMatch },

        sync() {
          const done = this.trials.filter(t => t.off !== null), m = done.filter(t => t.match), nm = done.filter(t => !t.match);
          const hits = m.filter(t => t.tap !== null).length, misses = m.length - hits, fas = nm.filter(t => t.tap !== null).length, crs = nm.length - fas;
          const rts = m.filter(t => t.rt !== null).map(t => t.rt);
          Object.assign(this.extra, { hits, misses, false_alarms: fas, correct_rejections: crs, d_prime: K.r3(K.dprime(hits, misses, fas, crs)), hit_rt_median_ms: K.ms(K.median(rts)), empty_taps: this.empty });
          this.items = hits + crs; this.errors = misses + fas;
        },

        update(dt, now) {
          if (this.done) return;
          const c = this.cur;
          if (c && now - c.on >= SHOW) { c.off = now; this.cur = null; this.nextAt = this.t + GAP; this.sync(); }
          if (!this.cur && this.t >= this.nextAt) {
            if (this.i + 1 >= this.trials.length) { this.sync(); finish(this, now); hap('complete'); sfx('birds_done'); J.border(1); J.spill(0.35); return; }
            const t = this.trials[++this.i];
            t.on = now; t.onAt = J.at; this.cur = t;
            sfx('birds_land', { kind: KINDS[t.kind].id });
          }
        },

        down(u, v, t) {
          if (this.done) return;
          this.lastIn = this.t;
          const c = this.cur;
          if (!c || c.tap !== null) { this.empty++; this.sync(); return; }
          c.tap = t;
          const b = this.b, U = b ? unit(b) : 1, bx = b ? b.x + b.w / 2 : 0, by = b ? b.y + b.h * 0.52 : 0;
          if (c.match) {
            c.rt = Math.max(0, t - c.on); this.okAt = J.at;
            if (b) { fx.burst(bx, by - 20 * U, 12, C.glow, 150 * U, { kind: 'spark', size: [4 * U, 1] }); J.bloom(bx, by - 20 * U, 90 * U, C.warm, 0.35, 0.12, 0.4); }
            hap('hit'); sfx('birds_match', { piano: [4 + (this.items % 4), 0.12] });
          } else {
            this.noAt = J.at;
            if (b) fx.snow(bx, by - 30 * U, 6);
            hap('miss'); sfx('birds_flutter');
          }
          J.border((this.i + 1) / this.trials.length);
          this.sync();
        },

        auto(dt, now) {
          const B = this.bot || (this.bot = { for: null });
          const c = this.cur;
          if (!c || c.tap !== null) return;
          if (B.for !== c) { B.for = c; B.at = now + 0.45 + 0.25 * R(); B.go = c.match ? R() < 0.85 : R() < 0.08; }
          if (B.go && now >= B.at) this.down(0.5, 0.5, now);
        },

        draw(ctx, b, at) {
          this.b = b;
          const U = unit(b), cx = b.x + b.w / 2, by = b.y + b.h * 0.52;
          K.card(ctx, b, mixc(C.sky, C.night700, 0.55), mixc(C.night800, C.silver600, 0.15));
          K.clip(ctx, b);
          // Snowy birch trunk and branch.
          ctx.fillStyle = rgb(C.silver100); ctx.fillRect(b.x + b.w * 0.82, b.y, 18 * U, b.h);
          ctx.fillStyle = rgb(C.night900, 0.85);
          for (let y = b.y + 12 * U; y < b.y + b.h; y += 26 * U) ctx.fillRect(b.x + b.w * 0.82 + 2 * U, y, 9 * U, 3 * U);
          ctx.strokeStyle = rgb(mixc(C.silver200, C.woodD, 0.35)); ctx.lineWidth = 6 * U; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(b.x + b.w * 0.83, by + 4 * U); ctx.quadraticCurveTo(cx, by + 10 * U, b.x + b.w * 0.12, by - 6 * U); ctx.stroke();
          ctx.strokeStyle = rgb(C.silver050, 0.85); ctx.lineWidth = 2.5 * U;
          ctx.beginPath(); ctx.moveTo(b.x + b.w * 0.8, by + 1 * U); ctx.quadraticCurveTo(cx, by + 6 * U, b.x + b.w * 0.15, by - 9 * U); ctx.stroke();
          const c = this.cur;
          let onBird = null;
          if (c) {
            const p = clamp((at - c.onAt) / 0.22, 0, 1), out = clamp((at - c.onAt - (SHOW - 0.2)) / 0.2, 0, 1);
            const hop = rm() ? 0 : (1 - J.ease.outSoft(p)) * 3 - Math.sin(clamp((at - this.okAt) / 0.3, 0, 1) * Math.PI) * 0.6;
            const x = cx + (rm() ? 0 : (1 - J.ease.outSoft(p)) * 60 * U) + out * 80 * U, y = by - 2 * U - out * 40 * U;
            bird(ctx, x, y, 20 * U, KINDS[c.kind], p * (1 - out), at, hop);
            onBird = [x, y - 5 * U, p * (1 - out)]; // the body's centre, and how visible the bird is
            if (at - this.okAt < 0.6) glow(ctx, cx, by - 20 * U, 60 * U, C.glow, 0.5 * (1 - (at - this.okAt) / 0.6));
          }
          K.progress(ctx, b, this.trials.length, Math.max(0, this.i + (c ? 0 : 1)), U);
          const first = this.trials.find(t => t.match);
          if (c && c === first && c.tap === null && !rm()) tapCue(ctx, onBird[0], onBird[1], U, at, 0.85 * onBird[2]);
          ctx.restore();
        },
      });
    },
  });
})();
