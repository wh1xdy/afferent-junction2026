(() => {
  const { clamp, lerp, ease, rgb, mixc } = A;
  const { C, glow, ring, disc, dist, unit, finger, tapCue, dragCue, line, dots, base, finish, idle } = A.J;
  const Au = A.Audio, R = Math.random, calm = A.J.rm;
  const WOOD = C.wood, WOOD_D = C.woodD, WOOD_L = C.woodL, BRONZE_D = C.bronzeD, STONE = C.stone, STONE_D = C.stoneD;

  A.defineTask('threads', {
    modes: ['flow'], role: 'Among Us: Fix Wiring',
    make() {
      const cols = [C.green, C.teal, C.violet200], order = [0, 1, 2].sort(() => R() - 0.5), L0 = 0.16, R0 = 0.84, V = [0.26, 0.5, 0.74];
      return base('threads', 14, {
        area: [1.15, 0.34],
        left: cols.map((c, i) => ({ c, v: V[i], done: false, at: 0 })), right: order.map((ci, j) => ({ ci, v: V[j] })),
        drag: null, nextAuto: 0.9, autoDrag: null,
        update(dt, now) {
          if (this.autoDrag) {
            const a = this.autoDrag; a.p += dt / 0.8;
            this.move(lerp(L0, R0, ease(a.p)), lerp(a.v0, a.v1, ease(a.p)));
            if (a.p >= 1) { this.up(R0, a.v1, now); this.autoDrag = null; }
          }
          if (this.left.every(l => l.done)) finish(this, now);
        },
        down(u, v) { this.lastIn = this.t; const i = this.left.findIndex(l => !l.done && dist(L0, l.v, u, v) < 0.13); this.drag = i >= 0 ? { i, u, v } : null; },
        move(u, v) { if (this.drag) { this.drag.u = u; this.drag.v = v; } },
        up(u, v, now = A.now()) {
          if (!this.drag) return;
          const j = this.right.findIndex(r => dist(R0, r.v, u, v) < 0.13);
          if (j >= 0 && this.right[j].ci === this.drag.i) { const l = this.left[this.drag.i]; l.done = true; l.at = now; this.items++; Au.piano(5 + this.items * 2, 0.15); }
          else this.errors++;
          this.drag = null;
        },
        auto(dt) {
          if (this.autoDrag) return;
          this.nextAuto -= dt;
          if (this.nextAuto > 0) return;
          this.nextAuto = 0.5;
          const i = this.left.findIndex(l => !l.done);
          if (i < 0) return;
          const j = this.right.findIndex(r => r.ci === i);
          this.down(L0, this.left[i].v); this.autoDrag = { p: 0, v0: this.left[i].v, v1: this.right[j].v };
        },
        draw(ctx, b, now) {
          const U = unit(b), X = u => b.x + u * b.w, Y = v => b.y + v * b.h;
          const wave = calm() ? 0 : 1;
          const ribbon = (u0, v0, u1, v1, c, a, w) => {
            const x0 = X(u0), y0 = Y(v0), x1 = X(u1), y1 = Y(v1), mx = (x0 + x1) / 2, sw = 16 * U * wave * Math.sin(now * 1.6 + v0 * 9);
            ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
            for (const [k, al, cc] of [[3.2, 0.12, c], [1.6, 0.28, c], [0.55, 0.85, mixc(c, C.silver050, 0.45)]]) {
              ctx.strokeStyle = rgb(cc, a * al); ctx.lineWidth = w * k;
              ctx.beginPath(); ctx.moveTo(x0, y0); ctx.bezierCurveTo(mx, y0 - sw, mx, y1 + sw, x1, y1); ctx.stroke();
            }
            ctx.restore();
          };
          this.left.forEach((l, i) => {
            const r = this.right.find(r => r.ci === i);
            if (l.done) ribbon(L0, l.v, R0, r.v, l.c, Math.min(1, 0.4 + (now - l.at) * 2), 6 * U);
            else ribbon(L0, l.v, R0, r.v, l.c, 0.1 + 0.05 * Math.sin(now * 2 + i), 4 * U);
          });
          if (this.drag) ribbon(L0, this.left[this.drag.i].v, this.drag.u, this.drag.v, this.left[this.drag.i].c, 0.95, 6 * U);
          this.left.forEach(l => {
            const x = X(L0), y = Y(l.v);
            glow(ctx, x, y, 30 * U, l.c, l.done ? 0.9 : 0.6 + 0.15 * Math.sin(now * 2.5 + l.v * 7));
            disc(ctx, x, y, 9 * U, l.c); disc(ctx, x, y, 4 * U, C.silver050, 0.9);
          });
          this.right.forEach(r => {
            const l = this.left[r.ci], x = X(R0), y = Y(r.v);
            glow(ctx, x, y, 28 * U, l.c, l.done ? 0.85 : 0.28);
            disc(ctx, x, y, 10 * U, C.night900, 0.85);
            ring(ctx, x, y, 10 * U, l.c, 0.9, 2.4 * U);
            if (l.done) disc(ctx, x, y, 5 * U, mixc(l.c, C.silver050, 0.4));
          });
          if (this.items === 0 && !this.drag && this.t > 1.2) {
            const i = 0, r = this.right.find(r => r.ci === i);
            dragCue(ctx, line(X(L0), Y(this.left[i].v), X(R0), Y(r.v)), U, now, clamp((this.t - 1.2) / 0.4, 0, 1));
          }
        },
      });
    },
  });
})();
