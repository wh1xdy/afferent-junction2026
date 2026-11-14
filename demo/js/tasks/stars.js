(() => {
  const { clamp, lerp, ease, rgb, mixc } = A;
  const { C, glow, ring, disc, dist, unit, finger, tapCue, dragCue, line, dots, base, finish, idle } = A.J;
  const Au = A.Audio, R = Math.random, calm = A.J.rm;
  const WOOD = C.wood, WOOD_D = C.woodD, WOOD_L = C.woodL, BRONZE_D = C.bronzeD, STONE = C.stone, STONE_D = C.stoneD;

  const SKY = [
    { pts: [[0.1, 0.36], [0.3, 0.7], [0.5, 0.44], [0.7, 0.72], [0.9, 0.32]] },
    { pts: [[0.32, 0.84], [0.3, 0.46], [0.5, 0.14], [0.7, 0.46], [0.68, 0.84]], close: 0 },
    { pts: [[0.1, 0.78], [0.38, 0.56], [0.58, 0.2], [0.86, 0.42], [0.66, 0.78]], close: 1 },
  ];
  const STAR_R = [3, 5, 8, 11, 15];

  A.defineTask('stars', {
    modes: ['flow', 'calm'], role: 'Among Us: Unlock Manifolds',
    make() {
      const shape = SKY[Math.floor(R() * SKY.length)], flip = R() < 0.5, rev = shape.close === undefined && R() < 0.5;
      let pts = shape.pts.map(([u, v]) => [flip ? 1 - u : u, v]);
      if (rev) pts = pts.reverse();
      return base('stars', 12, {
        area: [1.2, 0.33],
        stars: pts.map((p, i) => ({ u: p[0], v: p[1], size: STAR_R[i], on: null, flick: 0, tw: R() * 6 })), close: shape.close, next: 0, nextAuto: 0.7, missAt: -9,
        update(dt, now) { this.stars.forEach(s => s.flick = Math.max(0, s.flick - dt * 2.5)); if (this.next >= this.stars.length) finish(this, now); },
        lay(b) { const sp = Math.min(b.w, b.h * 1.25); return { b, sp, ox: b.x + (b.w - sp) / 2, oy: b.y + (b.h - sp * 0.78) / 2 }; },
        px(s) { const L = this.lb; return L ? [L.ox + s.u * L.sp, L.oy + s.v * L.sp * 0.78] : [s.u, s.v]; },
        down(u, v, now) {
          this.lastIn = this.t;
          const L = this.lb, x = L ? L.b.x + u * L.b.w : u, y = L ? L.b.y + v * L.b.h : v, d = s => { const [sx, sy] = this.px(s); return dist(sx, sy, x, y); };
          const s = this.stars.filter(s => !s.on).sort((a, b) => d(a) - d(b))[0];
          if (!s || d(s) > (L ? 0.12 * L.sp : 0.12)) return;
          if (s === this.stars[this.next]) { s.on = now; this.next++; this.items++; Au.piano(4 + this.next, 0.15); }
          else { s.flick = 1; this.errors++; this.missAt = this.t; }
        },
        auto(dt, now) { this.nextAuto -= dt; if (this.nextAuto > 0) return; this.nextAuto = 0.5 + R() * 0.3; const s = this.stars[this.next], L = this.lb; if (!s) return; const [x, y] = this.px(s); this.down(L ? (x - L.b.x) / L.b.w : x, L ? (y - L.b.y) / L.b.h : y, now); },
        draw(ctx, b, now) {
          const U = unit(b);
          this.lb = this.lay(b);
          const P = s => this.px(s);
          const done = this.done ? ease((now - this.finishedAt) / 0.6) : 0;
          const lit = this.stars.filter(s => s.on);
          const link = (a, c, al) => {
            const [x0, y0] = P(a), [x1, y1] = P(c);
            ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
            for (const [w, k] of [[9, 0.1], [4, 0.22], [1.6, 0.85]]) { ctx.strokeStyle = rgb(k > 0.5 ? C.flame : C.amber, al * k); ctx.lineWidth = w * U; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); }
            ctx.restore();
          };
          for (let i = 1; i < lit.length; i++) link(lit[i - 1], lit[i], Math.min(1, (now - lit[i].on) * 3));
          if (this.close !== undefined && done > 0) link(this.stars[this.stars.length - 1], this.stars[this.close], done);
          const cue = !this.done && (idle(this, 2.6) || this.t - this.missAt < 2) ? clamp(Math.max((this.t - this.lastIn - 2.6) / 0.5, this.t - this.missAt < 2 ? 1 : 0), 0, 1) : 0;
          this.stars.forEach((s, i) => {
            const [x, y] = P(s), r = s.size * U;
            const shake = s.flick > 0 && !calm() ? Math.sin(now * 60) * 2.5 * U * s.flick : 0;
            if (s.on) {
              const p = ease((now - s.on) / 0.4);
              glow(ctx, x, y, r * (4 + 2 * done) + 10 * U, C.amber, 0.55 + 0.3 * done);
              glow(ctx, x, y, r * 1.8, C.glow, 0.9);
              disc(ctx, x, y, r * (0.8 + 0.2 * p), C.daylight);
              if (p < 1 && !calm()) ring(ctx, x, y, r * (1.5 + 3 * p), C.glow, 0.7 * (1 - p), 2 * U);
              return;
            }
            const tw = calm() ? 0.85 : 0.75 + 0.25 * Math.sin(now * 2.2 + s.tw), a = (0.7 + 0.3 * tw) * (1 - 0.5 * s.flick), sx = x + shake;
            glow(ctx, sx, y, r * 1.7 + 3 * U, C.silver200, 0.18 * a);
            const sg = ctx.createRadialGradient(sx, y, 0, sx, y, r);
            sg.addColorStop(0, rgb(C.silver050, a)); sg.addColorStop(0.55, rgb(C.silver100, a * 0.85)); sg.addColorStop(1, rgb(C.silver300, a * 0.55));
            ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(sx, y, r, 0, 6.283); ctx.fill();
            if (s.size >= 8) {
              const L = r * (1.5 + 0.2 * tw);
              ctx.strokeStyle = rgb(C.silver050, 0.45 * a); ctx.lineWidth = 1.1 * U; ctx.lineCap = 'round';
              ctx.beginPath(); ctx.moveTo(sx - L, y); ctx.lineTo(sx + L, y); ctx.moveTo(sx, y - L); ctx.lineTo(sx, y + L); ctx.stroke();
            }
            if (i === this.next && cue > 0) {
              const p = calm() ? 0.5 : (now * 0.8) % 1;
              glow(ctx, x, y, r * 3 + 14 * U, C.glow, 0.35 * cue);
              ring(ctx, x, y, r + (6 + 18 * p) * U, C.flame, 0.7 * cue * (1 - p), 2 * U);
            }
          });
          if (this.items === 0 && this.t > 1.4) { const [x, y] = P(this.stars[0]); tapCue(ctx, x, y, U, now, clamp((this.t - 1.4) / 0.4, 0, 1)); }
        },
      });
    },
  });
})();
