(() => {
  // M14 Reindeer Watch: multiple-object tracking. Two reindeer ring their bells, all six wander, then tap the two bell carriers.
  const { clamp, lerp, rgb, mixc } = A;
  const J = A.J, { C, glow, disc, unit, tapCue, base, finish, fx, hap, sfx, rm } = J;
  const K = A.TaskKit, R = Math.random, ID = 'reindeer';
  const N = 6, TARGETS = 2, ROUNDS = 3, SHOW = 1.5, MOVE = 4, PICK_MAX = 10, REVEAL = 1.3, M = 0.08, SEP = 0.22, SPEED = 0.2;

  A.defineTask(ID, {
    modes: ['flow', 'wake'], role: 'Multiple-object tracking (reindeer with bells)', minS: 18,
    make() {
      return base(ID, ROUNDS * (0.6 + SHOW + MOVE + PICK_MAX + REVEAL) + 3, {
        r: -1, phase: 'intro', phaseAt: 0, deer: [], picks: [], rounds: [], stopNow: null, asp: 0.62, b: null, bot: null, outro: 1.2,
        extra: { v: 1, n_rounds: ROUNDS, n_deer: N, n_targets: TARGETS, move_s: MOVE },

        field(b) {
          const fw = b.w * 0.88, fh = b.h * 0.56;
          return { x: b.x + b.w * 0.06, y: b.y + b.h * 0.3, w: fw, h: fh, U: unit(b), s: fw * 0.055 };
        },
        px(d, F) { return { x: F.x + d.x * F.w, y: F.y + d.y * F.w }; },

        sync() {
          const ok = this.picks.filter(p => p.ok).length, ms = this.picks.map(p => p.rt);
          const done = this.rounds.filter(x => x !== null);
          Object.assign(this.extra, {
            round_correct: this.rounds.slice(),
            tracking_accuracy: this.picks.length ? K.r3(ok / this.picks.length) : null,
            capacity_estimate: done.length ? K.r3(K.mean(done)) : null,
            select_median_ms: K.ms(K.median(ms)), select_iqr_ms: K.ms(K.iqr(ms)),
            n_picks: this.picks.length,
          });
          this.items = ok; this.errors = this.picks.length - ok;
        },

        spawn() {
          const a = this.asp, pos = [];
          for (let i = 0; i < N; i++) {
            let x, y, tries = 0;
            do { x = M + R() * (1 - 2 * M); y = M * 0.8 + R() * (a - 1.6 * M); tries++; }
            while (tries < 200 && pos.some(p => Math.hypot(p.x - x, p.y - y) < SEP * 1.15));
            const h = R() * 6.283;
            pos.push({ x, y, vx: Math.cos(h) * SPEED, vy: Math.sin(h) * SPEED, face: R() < 0.5 ? -1 : 1, tgt: false, pick: null, shakeAt: -9, litAt: -9, step: R() * 6 });
          }
          K.shuffle(pos.map((_, i) => i)).slice(0, TARGETS).forEach(i => { pos[i].tgt = true; });
          this.deer = pos;
        },

        go(phase, now) { this.phase = phase; this.phaseAt = this.t; if (phase === 'pick') this.stopNow = now; },

        endRound(now) {
          const ps = this.picks.filter(p => p.round === this.r);
          this.rounds[this.r] = ps.filter(p => p.ok).length;
          this.go('reveal', now); this.sync();
          if (this.rounds[this.r] === TARGETS) { hap('light'); sfx('reindeer_round', { piano: [5, 0.14] }); }
          else sfx('reindeer_round_soft');
        },

        move(dt, env) {
          const a = this.asp, D = this.deer;
          for (const d of D) {
            // Wander: small random steering, then repulsion from neighbours.
            d.vx += (R() - 0.5) * 1.6 * dt; d.vy += (R() - 0.5) * 1.6 * dt;
            for (const o of D) {
              if (o === d) continue;
              const dx = d.x - o.x, dy = d.y - o.y, q = Math.hypot(dx, dy);
              if (q < SEP && q > 1e-4) { const f = (SEP - q) / SEP * 3; d.vx += dx / q * f * dt; d.vy += dy / q * f * dt; }
            }
            const sp = Math.hypot(d.vx, d.vy) || 1; d.vx = d.vx / sp * SPEED; d.vy = d.vy / sp * SPEED;
            d.x += d.vx * env * dt; d.y += d.vy * env * dt;
            if (d.x < M) { d.x = M; d.vx = Math.abs(d.vx); } else if (d.x > 1 - M) { d.x = 1 - M; d.vx = -Math.abs(d.vx); }
            if (d.y < M * 0.8) { d.y = M * 0.8; d.vy = Math.abs(d.vy); } else if (d.y > a - M * 0.8) { d.y = a - M * 0.8; d.vy = -Math.abs(d.vy); }
            if (Math.abs(d.vx) > 0.03) d.face = Math.sign(d.vx);
            d.step += env * dt * 9;
          }
        },

        update(dt, now) {
          if (this.done) return;
          const T = this.t - this.phaseAt;
          if (this.phase === 'intro' && T >= 0.6) {
            if (this.r + 1 >= ROUNDS) { this.sync(); finish(this, now); hap('success'); sfx('reindeer_done'); J.border(1); J.spill(0.35); return; }
            this.r++; this.spawn(); this.go('show', now); sfx('reindeer_bells');
          } else if (this.phase === 'show' && T >= SHOW) { this.go('move', now); sfx('reindeer_trot'); }
          else if (this.phase === 'move') {
            const env = clamp(T / 0.5, 0, 1) * clamp((MOVE - T) / 0.5, 0, 1);
            this.move(dt, A.ease(env));
            if (T >= MOVE) { this.go('pick', now); sfx('reindeer_stop'); }
          } else if (this.phase === 'pick' && T >= PICK_MAX) this.endRound(now);
          else if (this.phase === 'reveal' && T >= REVEAL) this.go('intro', now);
        },

        down(u, v, t) {
          if (this.done || !this.b) return;
          this.lastIn = this.t;
          if (this.phase !== 'pick') return;
          const F = this.field(this.b), x = this.b.x + u * this.b.w, y = this.b.y + v * this.b.h;
          let best = null, bd = Infinity;
          for (const d of this.deer) { if (d.pick !== null) continue; const p = this.px(d, F), q = Math.hypot(x - p.x, y - (p.y - F.s * 0.3)); if (q < bd) { bd = q; best = d; } }
          if (!best || bd > F.s * 1.9) return;
          const rt = Math.max(0, t - this.stopNow);
          best.pick = best.tgt; best.litAt = J.at;
          this.picks.push({ round: this.r, ok: best.tgt, rt });
          const p = this.px(best, F);
          if (best.tgt) {
            fx.burst(p.x, p.y - F.s * 0.6, 10, C.glow, 140 * F.U, { kind: 'spark', size: [4 * F.U, 1] });
            J.bloom(p.x, p.y, F.s * 3, C.warm, 0.35, 0.12, 0.4);
            hap('light'); sfx('reindeer_bell', { piano: [3 + (this.items % 5), 0.12] });
          } else { best.shakeAt = J.at; fx.snow(p.x, p.y + F.s * 0.5, 6); hap('tick'); sfx('reindeer_snort'); }
          this.sync();
          J.border((this.r + this.picks.filter(q => q.round === this.r).length / TARGETS) / ROUNDS);
          if (this.picks.filter(q => q.round === this.r).length >= TARGETS) this.endRound(t);
        },

        auto(dt, now) {
          if (this.phase !== 'pick' || !this.b) { if (this.bot) this.bot.at = null; return; }
          const B = this.bot || (this.bot = { at: null });
          if (B.at === null) B.at = now + 0.7 + 0.5 * R();
          if (now < B.at) return;
          const free = this.deer.filter(d => d.pick === null), tg = free.filter(d => d.tgt), ot = free.filter(d => !d.tgt);
          const d = (R() < 0.85 && tg.length) || !ot.length ? tg[0] : ot[Math.floor(R() * ot.length)];
          B.at = now + 0.45 + 0.35 * R();
          if (!d) return;
          const F = this.field(this.b), p = this.px(d, F);
          this.down((p.x - this.b.x) / this.b.w, (p.y - F.s * 0.3 - this.b.y) / this.b.h, now);
        },

        drawDeer(ctx, d, F, at) {
          const s = F.s, U = F.U, p = this.px(d, F), moving = this.phase === 'move';
          const shake = rm() ? 0 : Math.sin((at - d.shakeAt) * 38) * 2.5 * U * clamp(1 - (at - d.shakeAt) / 0.5, 0, 1);
          const ringing = d.tgt && (this.phase === 'show' || this.phase === 'reveal');
          const x = p.x + shake, y = p.y, f = d.face;
          // Shadow.
          ctx.fillStyle = rgb(C.night800, 0.25); ctx.beginPath(); ctx.ellipse(x, y + s * 0.95, s * 1.0, s * 0.18, 0, 0, 6.283); ctx.fill();
          if (d.pick === true || (this.phase === 'reveal' && d.tgt)) glow(ctx, x, y, s * 2.6, C.warm, d.pick === true ? 0.55 : 0.3);
          if (d.pick === false) glow(ctx, x, y, s * 2.2, C.ice, 0.25);
          const fur = d.pick === true ? mixc(C.wood, C.amber, 0.35) : C.wood, dark = C.woodD;
          // Legs.
          ctx.strokeStyle = rgb(dark); ctx.lineWidth = s * 0.16; ctx.lineCap = 'round';
          for (const [lx, ph] of [[-0.55, 0], [-0.3, Math.PI], [0.35, Math.PI], [0.6, 0]]) {
            const sw = moving && !rm() ? Math.sin(d.step + ph) * s * 0.18 : 0;
            ctx.beginPath(); ctx.moveTo(x + lx * s * f, y + s * 0.2); ctx.lineTo(x + lx * s * f + sw, y + s * 0.9); ctx.stroke();
          }
          // Body, belly, tail.
          ctx.fillStyle = rgb(fur); ctx.beginPath(); ctx.ellipse(x, y, s * 0.9, s * 0.45, 0, 0, 6.283); ctx.fill();
          ctx.fillStyle = rgb(C.silver100, 0.55); ctx.beginPath(); ctx.ellipse(x, y + s * 0.22, s * 0.6, s * 0.16, 0, 0, 6.283); ctx.fill();
          disc(ctx, x - f * s * 0.88, y - s * 0.12, s * 0.16, C.silver100, 0.85);
          // Neck and head.
          const nx = x + f * s * 0.7, hx = x + f * s * 1.05, hy = y - s * 0.75, bob = moving && !rm() ? Math.sin(d.step * 2) * s * 0.05 : 0;
          ctx.strokeStyle = rgb(fur); ctx.lineWidth = s * 0.34;
          ctx.beginPath(); ctx.moveTo(nx, y - s * 0.1); ctx.lineTo(hx - f * s * 0.05, hy + bob + s * 0.1); ctx.stroke();
          ctx.fillStyle = rgb(fur); ctx.beginPath(); ctx.ellipse(hx + f * s * 0.12, hy + bob, s * 0.32, s * 0.2, f * 0.3, 0, 6.283); ctx.fill();
          disc(ctx, hx + f * s * 0.4, hy + bob + s * 0.08, s * 0.07, C.night950);
          disc(ctx, hx + f * s * 0.08, hy + bob - s * 0.05, s * 0.045, C.night950);
          // Antlers.
          ctx.strokeStyle = rgb(mixc(C.silver300, C.wood, 0.4)); ctx.lineWidth = s * 0.07;
          const ax = hx - f * s * 0.05, ay = hy + bob - s * 0.15;
          for (const k of [0, 1]) {
            const o = (k ? -0.18 : 0.02) * s * f;
            ctx.beginPath(); ctx.moveTo(ax + o, ay); ctx.quadraticCurveTo(ax + o - f * s * 0.35, ay - s * 0.45, ax + o - f * s * 0.1, ay - s * 0.8); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(ax + o - f * s * 0.22, ay - s * 0.35); ctx.lineTo(ax + o + f * s * 0.1, ay - s * 0.5); ctx.stroke();
          }
          // Bell (only carriers show it while ringing and after reveal; everyone has a collar).
          const bx = nx + f * s * 0.08, by = y - s * 0.28;
          ctx.strokeStyle = rgb(C.night900, 0.6); ctx.lineWidth = s * 0.06;
          ctx.beginPath(); ctx.moveTo(nx - f * s * 0.08, y - s * 0.42); ctx.lineTo(nx + f * s * 0.22, y - s * 0.3); ctx.stroke();
          if (ringing || d.pick === true) {
            const sw = rm() ? 0 : Math.sin(at * 14) * s * 0.06 * (this.phase === 'show' ? 1 : 0.3);
            glow(ctx, bx + sw, by + s * 0.12, s * 1.3, C.glow, this.phase === 'show' ? 0.6 + 0.2 * Math.sin(at * 7) : 0.4);
            disc(ctx, bx + sw, by + s * 0.12, s * 0.13, C.gold);
            disc(ctx, bx + sw - s * 0.04, by + s * 0.08, s * 0.04, C.sun);
            if (this.phase === 'show' && !rm()) {
              const q = (at * 1.4) % 1;
              J.ring(ctx, bx, by + s * 0.12, s * (0.3 + 1.2 * q), C.glow, 0.5 * (1 - q), 1.6 * U);
            }
          }
        },

        draw(ctx, b, at) {
          this.b = b;
          const U = unit(b), F = this.field(b);
          this.asp = F.h / F.w;
          K.card(ctx, b, mixc(C.night800, C.violet500, 0.2), mixc(C.silver300, C.night800, 0.45));
          K.clip(ctx, b);
          K.star(ctx, b, 14, U, at, 22, 0.55);
          // Faint aurora ribbon.
          ctx.save(); ctx.globalAlpha = 0.18; ctx.strokeStyle = rgb(C.green); ctx.lineWidth = 14 * U; ctx.lineCap = 'round';
          ctx.beginPath();
          for (let i = 0; i <= 20; i++) { const xx = b.x + b.w * i / 20, yy = b.y + b.h * (0.12 + 0.03 * Math.sin(i * 0.6 + (rm() ? 0 : at * 0.3))); i ? ctx.lineTo(xx, yy) : ctx.moveTo(xx, yy); }
          ctx.stroke(); ctx.restore();
          // Snow field with distant spruces.
          const hz = b.y + b.h * 0.25;
          ctx.fillStyle = rgb(mixc(C.night700, C.night900, 0.4));
          for (let i = 0; i < 9; i++) { const tx = b.x + b.w * (i + 0.5) / 9, th = (14 + (i * 7) % 11) * U; ctx.beginPath(); ctx.moveTo(tx, hz - th); ctx.lineTo(tx - th * 0.38, hz + 2 * U); ctx.lineTo(tx + th * 0.38, hz + 2 * U); ctx.closePath(); ctx.fill(); }
          const g = ctx.createLinearGradient(0, hz, 0, b.y + b.h);
          g.addColorStop(0, rgb(mixc(C.silver300, C.night700, 0.45))); g.addColorStop(1, rgb(mixc(C.silver100, C.ice, 0.15), 0.9));
          ctx.fillStyle = g; ctx.fillRect(b.x, hz, b.w, b.h);
          if (this.r >= 0) {
            const D = [...this.deer].sort((p, q) => p.y - q.y);
            for (const d of D) this.drawDeer(ctx, d, F, at);
          }
          K.progress(ctx, b, ROUNDS, Math.max(0, this.rounds.filter(x => x != null).length), U);
          if (this.r === 0 && this.phase === 'pick' && !rm() && this.picks.length === 0 && this.t - this.phaseAt > 2) {
            // Neutral hint: point at the deer nearest the middle (not necessarily a bell carrier).
            let best = null, bd = Infinity;
            for (const d of this.deer) { const q = Math.hypot(d.x - 0.5, d.y - this.asp / 2); if (q < bd) { bd = q; best = d; } }
            if (best) { const p = this.px(best, F); tapCue(ctx, p.x, p.y, U, at, 0.8); }
          }
          ctx.restore();
        },
      });
    },
  });
})();
