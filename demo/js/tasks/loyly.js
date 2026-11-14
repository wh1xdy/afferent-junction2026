(() => {
  const { clamp, lerp, ease, rgb, mixc } = A;
  const { C, glow, ring, disc, dist, unit, finger, tapCue, dragCue, line, dots, base, finish, idle } = A.J;
  const Au = A.Audio, R = Math.random, calm = A.J.rm;
  const WOOD = C.wood, WOOD_D = C.woodD, WOOD_L = C.woodL, BRONZE_D = C.bronzeD, STONE = C.stone, STONE_D = C.stoneD;

  A.defineTask('loyly', {
    modes: ['calm'], role: 'Among Us: Swipe Card (slow swipe)',
    make() {
      const SLOW = 2.0;
      return base('loyly', 20, {
        area: [1.2, 0.34],
        need: 2, ladle: 0, drag: null, steam: 0, steamAt: -9, splash: 0, autoT: null, trail: [], lb: null,
        prog() { return this.ladle; },
        toP(u) { const L = this.lb; return L ? clamp((L.b.x + u * L.b.w - L.x0) / (L.x1 - L.x0), 0, 1) : clamp((u - 0.15) / 0.71, 0, 1); },
        update(dt, now) {
          this.steam = Math.max(0, this.steam - dt * 0.25); this.splash = Math.max(0, this.splash - dt * 1.5);
          if (!this.drag && this.ladle > 0) this.ladle = Math.max(0, this.ladle - dt * 1.1);
          if (this.autoT !== null) { this.autoT += dt; this.setP(clamp(this.autoT / 3.2, 0, 1), now); if (this.autoT >= 3.2) { this.up(1, 0.5, now); this.autoT = null; } }
          if (this.items >= this.need && this.steam < 0.6) finish(this, now);
        },
        grab(u, v) {
          if (!this.lb) return Math.abs(this.toP(u) - this.ladle) < 0.2;
          const [x, y] = this.lb.ladle, b = this.lb.b, px = b.x + u * b.w;
          return dist(px, b.y + v * b.h, x, y) < 70 * this.lb.U || (this.ladle <= 0.02 && px < this.lb.x0 + 60 * this.lb.U);
        },
        down(u, v, now) { this.lastIn = this.t; if (this.done || this.steam > 0.75) return; if (this.grab(u, v)) { this.drag = { t0: now }; this.trail = []; } },
        move(u, v, now = A.now()) { this.setP(this.toP(u), now); },
        setP(p, now) {
          if (!this.drag) return;
          this.ladle = p;
          const el = now - this.drag.t0;
          this.trail.push({ p, ok: p <= el / SLOW + 0.12 });
          if (this.trail.length > 120) this.trail.shift();
        },
        up(u, v, now = A.now()) {
          if (!this.drag) return;
          const dur = now - this.drag.t0; this.drag = null;
          if (this.ladle < 0.97) { this.trail = []; return; }
          if (dur >= SLOW) { this.items++; this.steam = 1; this.steamAt = now; Au.piano(0, 0.12); Au.piano(3, 0.1); A.session?.kick(0.5); }
          else { this.errors++; this.splash = 1; }
          this.trail = [];
        },
        auto(dt, now) { if (this.autoT === null && !this.drag && this.ladle <= 0.01 && this.steam < 0.3) { this.lastIn = this.t; this.drag = { t0: now }; this.trail = []; this.autoT = 0; } },
        draw(ctx, b, now) {
          const U = unit(b) * 1.12, X = u => b.x + u * b.w, gy = Math.min(b.y + b.h * 0.86, b.y + (b.h - 190 * U) / 2 + 150 * U);
          const bx = X(0.25), bw = 34 * U, bh = 50 * U, bt = gy - bh;
          const sx = X(0.78), sw = 50 * U, sh = 46 * U, st = gy - sh, stoneTop = st - 26 * U;
          const path = p => { const x0 = bx + 4 * U, y0 = bt - 10 * U, x1 = sx - 10 * U, y1 = stoneTop - 30 * U; return [lerp(x0, x1, p), lerp(y0, y1, p) - Math.sin(p * Math.PI) * 34 * U]; };
          const ember = 0.55 + 0.2 * (calm() ? 0 : Math.sin(now * 2.3) * Math.sin(now * 1.1));

          glow(ctx, sx, st, 110 * U, C.amberDeep, 0.22 + 0.25 * this.steam);
          const fl = ctx.createLinearGradient(0, gy, 0, b.y + b.h);
          fl.addColorStop(0, rgb(WOOD_D, 0.9)); fl.addColorStop(0.25, rgb(C.night950, 0.75)); fl.addColorStop(1, rgb(C.night950, 0.2));
          ctx.fillStyle = fl; ctx.fillRect(b.x, gy, b.w, b.y + b.h - gy);
          ctx.strokeStyle = rgb(WOOD_L, 0.35); ctx.lineWidth = 1.2 * U; ctx.beginPath(); ctx.moveTo(b.x, gy); ctx.lineTo(b.x + b.w, gy); ctx.stroke();

          ctx.fillStyle = rgb(C.night800);
          ctx.beginPath(); ctx.roundRect(sx - sw, st, 2 * sw, sh, 4 * U); ctx.fill();
          ctx.strokeStyle = rgb(C.silver700, 0.9); ctx.lineWidth = 2 * U; ctx.stroke();
          ctx.fillStyle = rgb(C.night950); ctx.fillRect(sx - sw * 0.5, st + sh * 0.36, sw, sh * 0.4);
          ctx.fillStyle = rgb(C.amber, ember); ctx.fillRect(sx - sw * 0.42, st + sh * 0.6, sw * 0.84, sh * 0.1);
          glow(ctx, sx, st + sh * 0.62, 34 * U, C.amberDeep, ember);
          ctx.fillStyle = rgb(C.silver700); ctx.fillRect(sx - sw - 3 * U, st - 3 * U, 2 * sw + 6 * U, 4 * U);
          const stones = [[-38, 0, 15], [-12, 2, 17], [16, 0, 16], [40, 1, 13], [-26, -14, 14], [2, -16, 16], [28, -13, 13], [-10, -28, 13], [14, -27, 12]];
          for (const [dx, dy, r] of stones) {
            const x = sx + dx * U, y = st - 8 * U + dy * U, rr = r * U;
            const g = ctx.createRadialGradient(x - rr * 0.35, y - rr * 0.4, rr * 0.1, x, y, rr);
            g.addColorStop(0, rgb(mixc(STONE, C.silver400, 0.25))); g.addColorStop(0.6, rgb(STONE)); g.addColorStop(1, rgb(STONE_D));
            ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(x, y, rr, rr * 0.78, 0, 0, 6.283); ctx.fill();
          }
          glow(ctx, sx, st - 18 * U, 44 * U, C.amberDeep, 0.25 * ember + 0.4 * this.steam);

          ctx.save();
          ctx.beginPath(); ctx.moveTo(bx - bw, bt); ctx.lineTo(bx + bw, bt); ctx.lineTo(bx + bw * 0.8, gy); ctx.lineTo(bx - bw * 0.8, gy); ctx.closePath();
          const bg = ctx.createLinearGradient(bx - bw, 0, bx + bw, 0);
          bg.addColorStop(0, rgb(WOOD_D)); bg.addColorStop(0.35, rgb(WOOD_L)); bg.addColorStop(1, rgb(WOOD_D));
          ctx.fillStyle = bg; ctx.fill(); ctx.clip();
          ctx.strokeStyle = rgb(C.night950, 0.5); ctx.lineWidth = 1.2 * U;
          for (let i = -3; i <= 3; i++) { ctx.beginPath(); ctx.moveTo(bx + i * bw / 3.5, bt); ctx.lineTo(bx + i * bw / 4.4, gy); ctx.stroke(); }
          ctx.fillStyle = rgb(C.silver600, 0.9);
          ctx.fillRect(bx - bw, bt + bh * 0.2, 2 * bw, 3.5 * U); ctx.fillRect(bx - bw, bt + bh * 0.72, 2 * bw, 3.5 * U);
          ctx.restore();
          ctx.fillStyle = rgb(C.tealDeep, 0.75); ctx.beginPath(); ctx.ellipse(bx, bt + 2 * U, bw * 0.92, 5 * U, 0, 0, 6.283); ctx.fill();
          ctx.strokeStyle = rgb(C.ice, 0.4); ctx.lineWidth = 1 * U; ctx.beginPath(); ctx.ellipse(bx, bt + 2 * U, bw * 0.6, 2.5 * U, 0, 0, 6.283); ctx.stroke();
          ctx.strokeStyle = rgb(WOOD_D); ctx.lineWidth = 2.5 * U; ctx.beginPath(); ctx.ellipse(bx, bt + 1 * U, bw, 6 * U, 0, 0, 6.283); ctx.stroke();

          if (this.trail.length > 1) {
            ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
            for (let i = 1; i < this.trail.length; i++) {
              const a = this.trail[i - 1], c = this.trail[i], [x0, y0] = path(a.p), [x1, y1] = path(c.p), col = c.ok ? C.amber : C.ice;
              ctx.strokeStyle = rgb(col, 0.25 + 0.5 * i / this.trail.length); ctx.lineWidth = 6 * U;
              ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
            }
            ctx.restore();
          }

          const ladle = (p, a, tilt) => {
            const [x, y] = path(p);
            ctx.save(); ctx.translate(x, y); ctx.rotate(tilt); ctx.globalAlpha *= a;
            ctx.strokeStyle = rgb(WOOD_L); ctx.lineWidth = 6 * U; ctx.lineCap = 'round';
            ctx.beginPath(); ctx.moveTo(-6 * U, -6 * U); ctx.lineTo(-52 * U, -42 * U); ctx.stroke();
            ctx.strokeStyle = rgb(WOOD_D); ctx.lineWidth = 2 * U; ctx.beginPath(); ctx.moveTo(-20 * U, -17 * U); ctx.lineTo(-50 * U, -41 * U); ctx.stroke();
            ctx.fillStyle = rgb(WOOD_L); ctx.beginPath(); ctx.arc(0, 0, 14 * U, 0, Math.PI); ctx.closePath(); ctx.fill();
            ctx.fillStyle = rgb(WOOD_D); ctx.fillRect(-15 * U, -2 * U, 30 * U, 4 * U);
            ctx.fillStyle = rgb(C.ice, 0.7); ctx.beginPath(); ctx.ellipse(0, -1 * U, 12 * U, 2.5 * U, 0, 0, 6.283); ctx.fill();
            ctx.restore();
            return [x, y];
          };
          const p = this.prog(), pour = this.drag ? ease((p - 0.9) / 0.1) : 0;
          if (this.items === 0 && !this.drag && this.autoT === null && this.t > 0.6) {
            const gp = ((this.t - 0.6) % 4.6) / 3.4, vis = clamp(gp / 0.08, 0, 1) * (1 - clamp((gp - 0.95) / 0.1, 0, 1));
            if (gp <= 1.05) {
              const q = clamp(gp, 0, 1);
              ladle(q, 0.4 * vis, -0.9 * ease((q - 0.9) / 0.1));
              const [x, y] = path(q);
              finger(ctx, x - 30 * U, y - 22 * U, 30 * U, 0.85 * vis);
              ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = rgb(C.amber, 0.35 * vis); ctx.lineWidth = 5 * U; ctx.lineCap = 'round';
              ctx.beginPath(); for (let i = 0; i <= 20; i++) { const [px, py] = path(q * i / 20); i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); } ctx.stroke(); ctx.restore();
            }
          }
          const [lx, ly] = ladle(p, 1, -0.9 * pour);
          this.lb = { b, U, ladle: [lx - 20 * U, ly - 14 * U], x0: path(0)[0], x1: path(1)[0] };
          if (this.drag) {
            const el = clamp((now - this.drag.t0) / SLOW, 0, 1);
            ring(ctx, lx, ly - 2 * U, 22 * U, C.silver400, 0.25, 3 * U);
            ctx.strokeStyle = rgb(el >= 1 ? C.amber : C.glow, el >= 1 ? 0.95 : 0.7); ctx.lineWidth = 3 * U; ctx.lineCap = 'round';
            ctx.beginPath(); ctx.arc(lx, ly - 2 * U, 22 * U, -Math.PI / 2, -Math.PI / 2 + el * 6.283); ctx.stroke();
            if (el >= 1) glow(ctx, lx, ly, 34 * U, C.amber, 0.3);
            if (pour > 0.5) for (let i = 0; i < 4; i++) { const q = ((now * 2.4 + i / 4) % 1); disc(ctx, lx + 6 * U + q * 4 * U, ly + 6 * U + q * 34 * U, 2 * U, C.ice, 0.8 * (1 - q)); }
          }
          if (this.splash > 0) {
            for (let i = 0; i < 7; i++) {
              const a = -Math.PI / 2 + (i - 3) * 0.35, q = 1 - this.splash, r = q * 40 * U;
              disc(ctx, sx - 6 * U + Math.cos(a) * r, stoneTop + Math.sin(a) * r + q * q * 40 * U, 2.6 * U, C.ice, this.splash);
            }
            glow(ctx, sx, stoneTop - 10 * U, 40 * U, C.silver200, 0.25 * this.splash);
          }
          if (this.steam > 0) {
            const age = now - this.steamAt, top = b.y + b.h * 0.12;
            ctx.save(); ctx.globalCompositeOperation = 'lighter';
            glow(ctx, b.x + b.w * 0.55, lerp(stoneTop, top, 0.45), b.w * 0.8, C.flame, 0.22 * this.steam * ease(age / 0.8));
            ctx.restore();
            for (let i = 0; i < 16; i++) {
              const q = clamp(age * 0.3 + 0.08 + (i % 5) * 0.04, 0, 1), dir = ((i * 7) % 11) / 10 - 0.6, sway = calm() ? 0 : Math.sin(now * 0.6 + i * 1.9) * 14 * U;
              const x = sx - 8 * U + dir * b.w * 0.95 * ease(q) + sway, y = lerp(stoneTop - 10 * U, top + (i % 4) * 26 * U, ease(q));
              glow(ctx, x, y, (40 + 90 * q) * U, C.silver100, 0.2 * this.steam * Math.sin(Math.PI * clamp(0.1 + q * 0.9, 0, 1)));
            }
          }
          dots(ctx, b.x + b.w / 2, Math.min(b.y + b.h * 0.94, gy + 26 * U), this.need, this.items, U);
        },
      });
    },
  });
})();
