(() => {
  const { clamp, lerp, ease, rgb, mixc } = A;
  const { C, glow, ring, disc, dist, unit, finger, tapCue, dragCue, line, dots, base, finish, idle } = A.J;
  const Au = A.Audio, R = Math.random, calm = A.J.rm;
  const WOOD = C.wood, WOOD_D = C.woodD, WOOD_L = C.woodL, BRONZE_D = C.bronzeD, STONE = C.stone, STONE_D = C.stoneD;

  A.defineTask('fireflies', {
    modes: ['wake', 'fatigue'], role: 'Among Us: Clear Asteroids',
    make(k) {
      const n = 5 + Math.round(3 * k), sp = 0.16 + 0.3 * k;
      return base('fireflies', 12, {
        area: [1.1, 0.36],
        flies: Array.from({ length: n }, () => ({ u: 0.15 + 0.7 * R(), v: 0.14 + 0.42 * R(), du: (R() - 0.5) * 2 * sp, dv: (R() - 0.5) * 2 * sp, c: null, seed: R() * 9, ju: R() - 0.5, jv: R() })),
        nextAuto: 0.8,
        update(dt, now) {
          for (const f of this.flies) {
            if (f.c !== null) continue;
            f.u += f.du * dt; f.v += f.dv * dt + 0.06 * Math.sin(now * 5 + f.seed) * dt;
            if (f.u < 0.08 || f.u > 0.92) f.du *= -1;
            if (f.v < 0.1 || f.v > 0.6) f.dv *= -1;
            f.u = clamp(f.u, 0.08, 0.92); f.v = clamp(f.v, 0.1, 0.6);
          }
          if (this.flies.every(f => f.c !== null)) finish(this, now);
        },
        down(u, v, now) {
          this.lastIn = this.t;
          const f = this.flies.filter(f => f.c === null).sort((a, b) => dist(a.u, a.v, u, v) - dist(b.u, b.v, u, v))[0];
          if (f && dist(f.u, f.v, u, v) < 0.11) { f.c = now; f.cu = f.u; f.cv = f.v; this.items++; Au.piano(5 + (this.items % 5), 0.14); }
          else this.errors++;
        },
        auto(dt, now) {
          this.nextAuto -= dt;
          if (this.nextAuto > 0) return;
          this.nextAuto = 0.55 + R() * 0.45;
          const f = this.flies.find(f => f.c === null);
          if (f) this.down(f.u + (R() - 0.5) * 0.03, f.v, now);
        },
        draw(ctx, b, now) {
          const U = unit(b), jx = b.x + b.w / 2, jb = b.y + b.h * 0.94, jw = 30 * U, jh = 74 * U, jt = jb - jh;
          const fill = this.items / this.flies.length;
          glow(ctx, jx, jb - jh * 0.45, 110 * U, C.green, 0.05 + 0.35 * fill);
          ctx.save();
          ctx.beginPath();
          ctx.moveTo(jx - jw * 0.6, jt); ctx.lineTo(jx - jw * 0.6, jt + 6 * U);
          ctx.quadraticCurveTo(jx - jw, jt + 10 * U, jx - jw, jt + 22 * U);
          ctx.lineTo(jx - jw, jb - 9 * U); ctx.quadraticCurveTo(jx - jw, jb, jx - jw + 9 * U, jb);
          ctx.lineTo(jx + jw - 9 * U, jb); ctx.quadraticCurveTo(jx + jw, jb, jx + jw, jb - 9 * U);
          ctx.lineTo(jx + jw, jt + 22 * U); ctx.quadraticCurveTo(jx + jw, jt + 10 * U, jx + jw * 0.6, jt + 6 * U);
          ctx.lineTo(jx + jw * 0.6, jt);
          const gl = ctx.createLinearGradient(jx - jw, 0, jx + jw, 0);
          gl.addColorStop(0, rgb(C.silver100, 0.1)); gl.addColorStop(0.5, rgb(C.silver100, 0.03)); gl.addColorStop(1, rgb(C.silver100, 0.08));
          ctx.fillStyle = gl; ctx.fill();
          ctx.strokeStyle = rgb(C.silver200, 0.55); ctx.lineWidth = 2 * U; ctx.stroke();
          ctx.strokeStyle = rgb(C.silver050, 0.28); ctx.lineWidth = 3 * U; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(jx - jw + 7 * U, jt + 26 * U); ctx.lineTo(jx - jw + 7 * U, jb - 16 * U); ctx.stroke();
          ctx.fillStyle = rgb(C.silver700); ctx.beginPath(); ctx.roundRect(jx - jw * 0.78, jt - 9 * U, jw * 1.56, 10 * U, 3 * U); ctx.fill();
          ctx.fillStyle = rgb(C.silver500, 0.6);
          for (let i = 1; i < 6; i++) ctx.fillRect(jx - jw * 0.78 + i * jw * 0.26, jt - 8 * U, 1.2 * U, 8 * U);
          ctx.restore();
          for (const f of this.flies) {
            const blink = 0.5 + 0.5 * Math.max(0, Math.sin(now * 2.4 + f.seed * 3));
            if (f.c !== null) {
              const p = ease((now - f.c) / 0.6);
              const ix = jx + f.ju * jw * 1.3 + Math.sin(now * 1.7 + f.seed) * 3 * U, iy = jb - 14 * U - f.jv * (jh - 34 * U) + Math.cos(now * 1.3 + f.seed) * 3 * U;
              const x = lerp(b.x + f.cu * b.w, ix, p), y = lerp(b.y + f.cv * b.h, iy, p) - Math.sin(p * Math.PI) * 30 * U;
              glow(ctx, x, y, 13 * U, C.green, 0.75); disc(ctx, x, y, 1.8 * U, C.silver050, 0.95);
              continue;
            }
            const x = b.x + f.u * b.w, y = b.y + f.v * b.h;
            glow(ctx, x, y, 22 * U, C.green, 0.3 + 0.55 * blink);
            disc(ctx, x, y, 2.6 * U, C.silver050, 0.6 + 0.4 * blink);
          }
          if (this.items === 0 && this.t > 1.2) {
            const f = this.flies.filter(f => f.c === null).sort((a, b) => dist(a.u, a.v, 0.5, 0.35) - dist(b.u, b.v, 0.5, 0.35))[0];
            if (f) tapCue(ctx, b.x + f.u * b.w, b.y + f.v * b.h, U, now, clamp((this.t - 1.2) / 0.4, 0, 1));
          }
        },
      });
    },
  });
})();
