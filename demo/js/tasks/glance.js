(() => {
  // M21 Harbour Glance: change detection (locate version). Boats with coloured sails, fog rolls over,
  // the boats return with exactly one sail recoloured; tap that boat.
  const { clamp, lerp, rgb, mixc, hex } = A;
  const J = A.J, { C, sprite, glow, disc, unit, tapCue, base, finish, fx, hap, sfx, rm } = J;
  const K = A.TaskKit, R = Math.random, ID = 'glance';
  const MEM = 1.0, FOG = 0.9, LIMIT = 4, ITI = 0.6, SIZES = [3, 5];
  // Six easily told sail colours.
  const SAILS = ['#EF5B4C', '#F2B544', '#5FE3A1', '#5AA9F0', '#B79CFF', '#F3F6FA'].map(hex);
  // Fixed spread positions on the water (u, v of the box).
  const SLOTS = [[0.2, 0.5], [0.5, 0.44], [0.8, 0.5], [0.33, 0.72], [0.67, 0.72]];

  const boat = (ctx, x, y, s, sail, a, bob) => {
    if (a <= 0.003) return;
    ctx.save(); ctx.globalAlpha *= a; ctx.translate(x, y + bob);
    // Reflection.
    ctx.fillStyle = rgb(sail, 0.14); ctx.beginPath(); ctx.moveTo(0, s * 0.35); ctx.lineTo(s * 0.55, s * 0.4); ctx.lineTo(0, s * 1.3); ctx.fill();
    // Hull.
    ctx.fillStyle = rgb(C.woodL); ctx.beginPath();
    ctx.moveTo(-s * 0.95, 0); ctx.lineTo(s * 0.95, 0); ctx.lineTo(s * 0.65, s * 0.34); ctx.lineTo(-s * 0.65, s * 0.34); ctx.closePath(); ctx.fill();
    ctx.fillStyle = rgb(C.woodD); ctx.fillRect(-s * 0.85, -s * 0.03, s * 1.7, s * 0.08);
    // Mast and sail.
    ctx.strokeStyle = rgb(C.silver300, 0.9); ctx.lineWidth = Math.max(1, s * 0.06); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -s * 1.5); ctx.stroke();
    ctx.fillStyle = rgb(sail); ctx.beginPath(); ctx.moveTo(s * 0.06, -s * 1.42); ctx.lineTo(s * 0.06, -s * 0.12); ctx.lineTo(s * 0.85, -s * 0.12); ctx.closePath(); ctx.fill();
    ctx.fillStyle = rgb(mixc(sail, C.night900, 0.3)); ctx.beginPath(); ctx.moveTo(-s * 0.06, -s * 1.1); ctx.lineTo(-s * 0.06, -s * 0.12); ctx.lineTo(-s * 0.55, -s * 0.12); ctx.closePath(); ctx.fill();
    ctx.restore();
  };

  A.defineTask(ID, {
    modes: ['flow', 'wake'], role: 'Change detection (which sail changed colour)', minS: 20,
    make() {
      const order = K.shuffle([...SIZES, ...SIZES, ...SIZES, ...SIZES]);
      const trials = order.map(n => {
        const slots = K.shuffle([...SLOTS.keys()]).slice(0, n).sort((a, b) => a - b);
        const before = K.shuffle([...SAILS.keys()]).slice(0, n);
        const target = Math.floor(R() * n), after = [...before];
        const free = [...SAILS.keys()].filter(c => !before.includes(c));
        after[target] = free[Math.floor(R() * free.length)];
        return { n, slots, before, after, target, ph: slots.map(() => R() * 6.283), on: null, rt: null, correct: null, pick: -1, timedOut: false };
      });
      return base(ID, trials.length * (MEM + FOG + LIMIT + ITI) + 4, {
        trials, i: -1, state: 'gap', stateAt: 0, b: null, bot: null, answerAt: -9, outro: 1.3,
        extra: { v: 1, n_trials: trials.length, set_sizes: SIZES },

        pos(s, j, b) {
          const U = unit(b), [u, v] = SLOTS[s.slots[j]];
          return { x: b.x + u * b.w, y: b.y + v * b.h, s: Math.min(b.w * 0.09, b.h * 0.075), U };
        },

        sync() {
          const d = this.trials.filter(s => s.correct !== null), acc = {};
          let kMax = null;
          for (const n of SIZES) {
            const ds = d.filter(s => s.n === n);
            acc[n] = ds.length ? ds.filter(s => s.correct).length / ds.length : null;
            if (acc[n] !== null) { const k = Math.max(0, n * (2 * acc[n] - 1)); kMax = kMax === null ? k : Math.max(kMax, k); }
          }
          const ok = d.filter(s => s.correct);
          Object.assign(this.extra, {
            accuracy_by_set: Object.fromEntries(SIZES.map(n => [n, K.r3(acc[n])])),
            accuracy: d.length ? K.r3(ok.length / d.length) : null,
            capacity_k: K.r3(kMax),
            rt_median_ms: K.ms(K.median(ok.map(s => s.rt))),
            timeouts: d.filter(s => s.timedOut).length,
          });
          this.items = ok.length; this.errors = d.length - ok.length;
        },

        update(dt, now) {
          if (this.done) return;
          const T = this.t - this.stateAt, s = this.trials[this.i];
          if (this.state === 'gap' && T >= ITI) {
            if (this.i + 1 >= this.trials.length) { this.sync(); finish(this, now); hap('success'); sfx('glance_done'); J.border(1); J.spill(0.35); return; }
            this.i++; this.state = 'mem'; this.stateAt = this.t; this.trials[this.i].memAt = J.at; sfx('glance_show');
          } else if (this.state === 'mem' && T >= MEM) {
            this.state = 'fog'; this.stateAt = this.t; this.fogAt = J.at; sfx('glance_fog');
          } else if (this.state === 'fog' && T >= FOG) {
            this.state = 'test'; this.stateAt = this.t; s.on = now; s.onAt = J.at;
          } else if (this.state === 'test' && T >= LIMIT) {
            s.timedOut = true; s.correct = false; this.answerAt = J.at; this.state = 'gap'; this.stateAt = this.t; this.sync();
          }
        },

        down(u, v, t) {
          if (this.done) return;
          this.lastIn = this.t;
          if (this.state !== 'test' || !this.b) return;
          const b = this.b, s = this.trials[this.i], x = b.x + u * b.w, y = b.y + v * b.h;
          let best = -1, bd = Infinity;
          for (let j = 0; j < s.n; j++) { const P = this.pos(s, j, b), d = Math.hypot(x - P.x, y - (P.y - P.s * 0.5)); if (d < bd) { bd = d; best = j; } }
          const P = best >= 0 ? this.pos(s, best, b) : null;
          if (!P || bd > P.s * 2.2) return;
          s.pick = best; s.rt = Math.max(0, t - s.on); s.correct = best === s.target; this.answerAt = J.at;
          if (s.correct) {
            fx.burst(P.x, P.y - P.s * 0.7, 12, C.gold, 140 * P.U, { kind: 'spark', size: [4 * P.U, 1] }); J.bloom(P.x, P.y - P.s * 0.6, P.s * 4, C.glow, 0.4, 0.12, 0.4);
            hap('light'); sfx('glance_hit', { piano: [3 + (this.items % 5), 0.12] });
          } else { fx.snow(P.x, P.y - P.s, 5); hap('tick'); sfx('glance_miss'); }
          this.state = 'gap'; this.stateAt = this.t;
          J.border((this.i + 1) / this.trials.length);
          this.sync();
        },

        auto(dt, now) {
          if (this.state !== 'test' || !this.b) return;
          const s = this.trials[this.i], B = this.bot || (this.bot = { for: null });
          if (B.for !== s) { B.for = s; B.at = now + 0.75 + 0.3 * R(); }
          if (now < B.at) return;
          const p = s.n === 3 ? 0.85 : 0.65, j = R() < p ? s.target : (s.target + 1 + Math.floor(R() * (s.n - 1))) % s.n, P = this.pos(s, j, this.b);
          this.down((P.x - this.b.x) / this.b.w, (P.y - P.s * 0.5 - this.b.y) / this.b.h, now);
          B.at = now + 0.4;
        },

        draw(ctx, b, at) {
          this.b = b;
          const U = unit(b), still = rm();
          K.card(ctx, b, mixc(C.night700, C.violet500, 0.12), C.night900);
          K.clip(ctx, b);
          K.star(ctx, b, 21, U, at, 20, 0.45);
          // Far shore with a few lit windows.
          const hy = b.y + b.h * 0.33;
          ctx.fillStyle = rgb(C.night850); ctx.beginPath(); ctx.moveTo(b.x, hy);
          for (let i = 0; i <= 8; i++) ctx.lineTo(b.x + b.w * i / 8, hy - (10 + 8 * Math.sin(i * 1.7)) * U);
          ctx.lineTo(b.x + b.w, hy); ctx.closePath(); ctx.fill();
          for (let i = 0; i < 5; i++) glow(ctx, b.x + b.w * (0.12 + i * 0.19), hy - 6 * U, 5 * U, C.warm, 0.6);
          // Water.
          const wg = ctx.createLinearGradient(0, hy, 0, b.y + b.h);
          wg.addColorStop(0, rgb(mixc(C.tealDeep, C.night800, 0.7))); wg.addColorStop(1, rgb(C.night950));
          ctx.fillStyle = wg; ctx.fillRect(b.x, hy, b.w, b.h);
          ctx.strokeStyle = rgb(C.silver300, 0.08); ctx.lineWidth = 1.5 * U;
          for (let i = 0; i < 7; i++) {
            const y = hy + (i + 1) * b.h * 0.085, off = still ? 0 : Math.sin(at * 0.5 + i) * 8 * U;
            ctx.beginPath(); ctx.moveTo(b.x + b.w * 0.1 + off, y); ctx.lineTo(b.x + b.w * 0.9 + off, y); ctx.stroke();
          }
          const s = this.trials[this.i];
          if (s) {
            const T = this.t - this.stateAt, st = this.state;
            let cols = null, a = 0;
            if (st === 'mem') { cols = s.before; a = still ? 1 : clamp((at - s.memAt) / 0.15, 0, 1); }
            else if (st === 'fog') { cols = T < FOG * 0.5 ? s.before : s.after; a = clamp(Math.abs(T / FOG - 0.5) * 5 - 1.5, 0, 1); }
            else if (st === 'test') { cols = s.after; a = 1; }
            else if (st === 'gap' && s.correct !== null) { cols = s.after; a = clamp(1 - (at - this.answerAt) / ITI, 0, 1); }
            if (cols) {
              for (let j = 0; j < s.n; j++) {
                const P = this.pos(s, j, b), bob = still ? 0 : Math.sin(at * 1.3 + s.ph[j]) * 1.5 * U;
                if (st === 'gap' && j === s.target) glow(ctx, P.x, P.y - P.s * 0.6, P.s * 2.6, s.correct ? C.gold : C.silver300, (s.correct ? 0.5 : 0.3) * a);
                boat(ctx, P.x, P.y, P.s, SAILS[cols[j]], a, bob);
              }
              if (this.i === 0 && st === 'test' && at - s.onAt > 2.5 && !still) { const P = this.pos(s, s.target, b); tapCue(ctx, P.x, P.y - P.s * 0.6, U, at, 0.8); }
            }
            // Fog wipe: soft puffs sweeping left to right across the harbour.
            if (st === 'fog') {
              const p = T / FOG, cover = Math.sin(clamp(p, 0, 1) * Math.PI);
              ctx.fillStyle = rgb(mixc(C.silver400, C.night700, 0.55), 0.55 * cover); ctx.fillRect(b.x, b.y, b.w, b.h);
              for (let k = 0; k < 18; k++) {
                const row = k % 6, lane = Math.floor(k / 6);
                const fx0 = still ? 0.5 : lerp(-0.4, 1.4, p) + (lane - 1) * 0.28 + Math.sin(k * 2.3) * 0.08;
                const x = b.x + fx0 * b.w, y = b.y + b.h * (0.25 + row * 0.13);
                sprite(ctx, 'soft', mixc(C.silver200, C.night600, 0.35), x, y, b.w * 0.32, 0.75 * cover, false, 1.4, 0.8);
              }
            }
          }
          K.progress(ctx, b, this.trials.length, Math.max(0, this.i + (this.state === 'gap' ? 1 : 0)), U);
          ctx.restore();
        },
      });
    },
  });
})();
