(() => {
  const { clamp, lerp, ease, rgb, mixc } = A;
  const { C, glow, ring, disc, dist, unit, finger, tapCue, dragCue, line, dots, base, finish, idle } = A.J;
  const Au = A.Audio, R = Math.random, calm = A.J.rm;
  const WOOD = C.wood, WOOD_D = C.woodD, WOOD_L = C.woodL, BRONZE_D = C.bronzeD, STONE = C.stone, STONE_D = C.stoneD;

  A.defineTask('bells', {
    modes: ['wake', 'fatigue'], role: 'Among Us: Start Reactor',
    make(k) {
      const notes = [3, 5, 8];
      const g = base('bells', 16, {
        area: [1.2, 0.33],
        len: 3 + Math.round(k), seq: [], phase: 'show', step: 0, showT: 0, input: [], lit: [0, 0, 0], rung: [-9, -9, -9], gap: lerp(0.6, 0.42, k), nextAuto: 0.6, round: -1, playAt: 0,
        reset() { this.seq = Array.from({ length: this.len }, () => Math.floor(R() * 3)); this.phase = 'show'; this.step = 0; this.showT = -0.6; this.input = []; this.round++; },
        ring(i, now = A.now()) { this.lit[i] = 1; this.rung[i] = now; Au.piano(notes[i], 0.18); },
        update(dt, now) {
          this.lit = this.lit.map(l => Math.max(0, l - dt * 3));
          if (this.phase === 'show') {
            this.showT += dt;
            if (this.showT >= this.gap) { this.showT = 0; if (this.step < this.seq.length) this.ring(this.seq[this.step++], now); else { this.phase = 'play'; this.playAt = this.t; } }
          }
        },
        down(u, v, now) {
          this.lastIn = this.t;
          if (this.done || this.phase !== 'play' || v < 0.1 || v > 0.95) return;
          const i = clamp(Math.floor(u * 3), 0, 2);
          this.ring(i, now); this.input.push(i);
          const n = this.input.length - 1;
          if (this.input[n] !== this.seq[n]) {
            this.errors++;
            if (this.errors % 2 === 0 && this.len > 2) this.len--;
            this.reset();
          } else if (this.input.length === this.seq.length) { this.items = this.seq.length; finish(this, now); }
        },
        auto(dt, now) {
          if (this.phase !== 'play') return;
          this.nextAuto -= dt;
          if (this.nextAuto > 0) return;
          this.nextAuto = 0.45 + R() * 0.2;
          this.down((this.seq[this.input.length] + 0.5) / 3, 0.5, now);
        },
        draw(ctx, b, now) {
          const U = unit(b), s = Math.min(b.w * 0.105, 40 * U), yb = b.y + b.h * 0.5 - s * 1.25;
          ctx.fillStyle = rgb(WOOD_D);
          ctx.beginPath(); ctx.roundRect(b.x + b.w * 0.08, yb - 9 * U, b.w * 0.84, 10 * U, 3 * U); ctx.fill();
          ctx.fillStyle = rgb(WOOD_L, 0.55); ctx.fillRect(b.x + b.w * 0.08 + 3 * U, yb - 9 * U, b.w * 0.84 - 6 * U, 2 * U);
          const watching = this.phase === 'show' ? 0.72 : 1;
          for (let i = 0; i < 3; i++) {
            const x = b.x + b.w * (i + 0.5) / 3, py = yb + 12 * U, age = now - this.rung[i];
            const swing = calm() ? 0 : 0.3 * Math.exp(-2.6 * age) * Math.sin(age * 10);
            glow(ctx, x, py + s * 0.9, s * 3.2, C.amber, 0.08 + 0.7 * this.lit[i]);
            ctx.strokeStyle = rgb(WOOD_L, 0.9); ctx.lineWidth = 2.2 * U;
            ctx.beginPath(); ctx.moveTo(x, yb); ctx.lineTo(x, py); ctx.stroke();
            ctx.save(); ctx.translate(x, py); ctx.rotate(swing); ctx.globalAlpha *= watching;
            ctx.strokeStyle = rgb(BRONZE_D); ctx.lineWidth = 3 * U; ctx.beginPath(); ctx.arc(0, -1 * U, 4 * U, Math.PI, 0); ctx.stroke();
            const cl = Math.sin(-swing * 2) * s * 0.25;
            ctx.strokeStyle = rgb(C.night950, 0.9); ctx.lineWidth = 1.6 * U; ctx.beginPath(); ctx.moveTo(0, s * 0.6); ctx.lineTo(cl, s * 1.42); ctx.stroke();
            disc(ctx, cl, s * 1.48, s * 0.13, BRONZE_D);
            ctx.beginPath();
            ctx.moveTo(-s * 0.3, 0); ctx.quadraticCurveTo(-s * 0.48, s * 0.02, -s * 0.52, s * 0.35);
            ctx.quadraticCurveTo(-s * 0.58, s * 0.95, -s * 0.98, s * 1.28);
            ctx.quadraticCurveTo(0, s * 1.42, s * 0.98, s * 1.28);
            ctx.quadraticCurveTo(s * 0.58, s * 0.95, s * 0.52, s * 0.35);
            ctx.quadraticCurveTo(s * 0.48, s * 0.02, s * 0.3, 0); ctx.closePath();
            const bg = ctx.createLinearGradient(-s, 0, s, 0), L = this.lit[i];
            bg.addColorStop(0, rgb(mixc(BRONZE_D, C.amber, 0.25 + 0.5 * L))); bg.addColorStop(0.3, rgb(mixc(C.amber, C.glow, 0.2 + 0.6 * L)));
            bg.addColorStop(0.55, rgb(mixc(C.amberDeep, C.amber, 0.3 + 0.6 * L))); bg.addColorStop(1, rgb(mixc(BRONZE_D, C.night950, 0.35 - 0.3 * L)));
            ctx.fillStyle = bg; ctx.fill();
            ctx.strokeStyle = rgb(C.glow, 0.25 + 0.5 * L); ctx.lineWidth = 2 * U; ctx.lineCap = 'round';
            ctx.beginPath(); ctx.moveTo(-s * 0.36, s * 0.22); ctx.quadraticCurveTo(-s * 0.44, s * 0.8, -s * 0.66, s * 1.12); ctx.stroke();
            ctx.fillStyle = rgb(mixc(C.amberDeep, C.glow, 0.15 + 0.5 * L)); ctx.beginPath(); ctx.ellipse(0, s * 1.3, s * 1.0, s * 0.11, 0, 0, 6.283); ctx.fill();
            ctx.fillStyle = rgb(C.night950, 0.75); ctx.beginPath(); ctx.ellipse(0, s * 1.33, s * 0.86, s * 0.06, 0, 0, 6.283); ctx.fill();
            ctx.strokeStyle = rgb(BRONZE_D, 0.8); ctx.lineWidth = 1.4 * U;
            ctx.beginPath(); ctx.moveTo(-s * 0.55, s * 0.5); ctx.quadraticCurveTo(0, s * 0.56, s * 0.55, s * 0.5); ctx.stroke();
            ctx.restore();
            if (L > 0.05 && !calm()) ring(ctx, x, py + s * 0.8, s * (1.2 + 1.2 * (1 - L)), C.glow, 0.35 * L, 2 * U);
          }
          dots(ctx, b.x + b.w / 2, b.y + b.h * 0.5 + s * 2.1, this.seq.length, this.input.length, U, C.glow);
          if (this.phase === 'play' && this.round === 0 && !this.input.length && this.t - this.playAt > 1.6) {
            const x = b.x + b.w * (this.seq[0] + 0.5) / 3;
            tapCue(ctx, x, yb + 12 * U + s * 0.9, U, now, clamp((this.t - this.playAt - 1.6) / 0.4, 0, 1));
          }
        },
      });
      g.reset();
      return g;
    },
  });
})();
