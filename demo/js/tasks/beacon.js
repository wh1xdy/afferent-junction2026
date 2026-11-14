(() => {
  const { clamp, lerp, ease, rgb, mixc } = A;
  const { C, glow, ring, disc, dist, unit, finger, tapCue, dragCue, line, dots, base, finish, idle } = A.J;
  const Au = A.Audio, R = Math.random, calm = A.J.rm;
  const WOOD = C.wood, WOOD_D = C.woodD, WOOD_L = C.woodL, BRONZE_D = C.bronzeD, STONE = C.stone, STONE_D = C.stoneD;

  A.defineTask('beacon', {
    modes: ['wake', 'fatigue'], role: 'Among Us: Calibrate Distributor',
    make(k) {
      const speed = 1.15 + 1.2 * k, need = 3, WIN = 0.17;
      const pickTarget = prev => { const side = prev === undefined ? (R() < 0.5 ? -1 : 1) : -Math.sign(prev); return side * (0.5 + R() * 0.38); };
      return base('beacon', 13, {
        area: [1.25, 0.34],
        a: Math.PI / 2 + R() * 0.6, target: pickTarget(), dim: 0, lit: [],
        spot() { return Math.cos(this.a); },
        near() { return Math.abs(this.spot() - this.target); },
        update(dt, now) {
          this.a = (this.a + speed * dt) % (Math.PI * 2);
          this.dim = Math.max(0, this.dim - dt * 2);
          this.lit = this.lit.filter(l => now - l.at < 2.2);
          if (this.items >= need && !this.done) finish(this, now);
        },
        down(u, v, now) {
          this.lastIn = this.t;
          if (this.done) return;
          if (this.near() < WIN) {
            this.items++; this.lit.push({ x: this.target, at: now }); this.target = pickTarget(this.target); Au.bell();
            A.session?.kick(0.4);
          } else { this.errors++; this.dim = 1; }
        },
        auto(dt, now) { if (this.near() < 0.05 && R() < 0.6) this.down(0, 0, now); },
        draw(ctx, b, now) {
          const U = unit(b), cx = b.x + b.w / 2, Rx = b.w * 0.42;
          const towerH = Math.min(130 * U, b.h * 0.42), wy = Math.min(b.y + b.h * 0.72, b.y + (b.h - towerH - 90 * U) / 2 + towerH + 34 * U), ly = wy - towerH - 6 * U;
          const sea = ctx.createLinearGradient(0, wy, 0, b.y + b.h);
          sea.addColorStop(0, rgb(C.night600, 0.9)); sea.addColorStop(1, rgb(C.night900, 0.95));
          ctx.fillStyle = sea; ctx.fillRect(b.x, wy, b.w, b.y + b.h - wy);
          ctx.strokeStyle = rgb(C.silver300, 0.22); ctx.lineWidth = 1.2 * U;
          ctx.beginPath(); ctx.moveTo(b.x, wy); ctx.lineTo(b.x + b.w, wy); ctx.stroke();
          for (let i = 0; i < 7; i++) {
            const yy = wy + (8 + i * i * 2.4) * U, ph = (now * (calm() ? 4 : 12) + i * 37) % b.w;
            ctx.strokeStyle = rgb(C.silver300, 0.07 + 0.012 * i); ctx.lineWidth = 1 * U;
            ctx.beginPath(); ctx.moveTo(b.x + ph - 20 * U, yy); ctx.lineTo(b.x + ph + 16 * U, yy); ctx.moveTo(b.x + (ph + b.w * 0.5) % b.w - 14 * U, yy); ctx.lineTo(b.x + (ph + b.w * 0.5) % b.w + 12 * U, yy); ctx.stroke();
          }

          const s = this.spot(), facing = Math.sin(this.a) < 0, beamA = (0.5 + 0.5 * Math.abs(s)) * (1 - 0.65 * this.dim);
          const ex = cx + s * Rx * 1.1, ey = wy - 2 * U, half = (6 + 22 * Math.abs(s)) * U;
          ctx.save(); ctx.globalCompositeOperation = 'lighter';
          const gb = ctx.createLinearGradient(cx, ly, ex, ey);
          gb.addColorStop(0, rgb(C.glow, 0.55 * beamA)); gb.addColorStop(0.55, rgb(C.glow, 0.16 * beamA)); gb.addColorStop(0.82, rgb(C.glow, 0));
          ctx.fillStyle = gb;
          ctx.beginPath(); ctx.moveTo(cx, ly - 3 * U); ctx.lineTo(ex, ey - half); ctx.lineTo(ex, ey + half * 0.4); ctx.lineTo(cx, ly + 3 * U); ctx.closePath(); ctx.fill();
          ctx.save(); ctx.translate(ex, wy + 3 * U); ctx.scale(1, 0.22); glow(ctx, 0, 0, 40 * U, C.glow, 0.35 * beamA); ctx.restore();
          glow(ctx, cx, ly, (facing ? 26 + 30 * (1 - Math.abs(s)) : 20) * U, C.glow, facing ? 0.9 : 0.6);
          ctx.restore();

          const rx = cx, rockW = 32 * U;
          ctx.fillStyle = rgb(C.night950);
          ctx.beginPath(); ctx.moveTo(rx - rockW, wy + 4 * U); ctx.quadraticCurveTo(rx - rockW * 0.7, wy - 12 * U, rx - rockW * 0.2, wy - 9 * U); ctx.quadraticCurveTo(rx + rockW * 0.4, wy - 16 * U, rx + rockW, wy + 4 * U); ctx.closePath(); ctx.fill();
          const bw = 15 * U, tw = 10 * U, tb = wy - 8 * U, tt = ly + 10 * U;
          const tg = ctx.createLinearGradient(rx - bw, 0, rx + bw, 0);
          tg.addColorStop(0, rgb(C.silver300)); tg.addColorStop(0.55, rgb(C.silver500)); tg.addColorStop(1, rgb(C.silver700));
          ctx.fillStyle = tg;
          ctx.beginPath(); ctx.moveTo(rx - bw, tb); ctx.lineTo(rx - tw, tt); ctx.lineTo(rx + tw, tt); ctx.lineTo(rx + bw, tb); ctx.closePath(); ctx.fill();
          ctx.save(); ctx.clip();
          ctx.fillStyle = rgb(C.night600, 0.9);
          for (const f of [0.28, 0.62]) ctx.fillRect(rx - bw, lerp(tb, tt, f), 2 * bw, (tb - tt) * 0.12);
          ctx.restore();
          ctx.fillStyle = rgb(C.night800); ctx.fillRect(rx - tw - 4 * U, tt - 2 * U, 2 * tw + 8 * U, 3 * U);
          ctx.fillStyle = rgb(C.glow, 0.95); ctx.fillRect(rx - tw * 0.7, ly - 5 * U, tw * 1.4, 12 * U);
          ctx.fillStyle = rgb(C.night800);
          ctx.beginPath(); ctx.moveTo(rx - tw - 1 * U, ly - 5 * U); ctx.quadraticCurveTo(rx, ly - 20 * U, rx + tw + 1 * U, ly - 5 * U); ctx.closePath(); ctx.fill();
          ctx.fillRect(rx - 0.8 * U, ly - 24 * U, 1.6 * U, 6 * U);

          const boat = (bx, a, lamp, rim) => {
            const L = 38 * U, by = wy + 1 * U, bob = calm() ? 0 : Math.sin(now * 1.6 + bx) * 1.6 * U;
            ctx.save(); ctx.translate(bx, by + bob); ctx.globalAlpha *= a;
            if (lamp > 0) {
              ctx.save(); ctx.scale(1, 0.25); glow(ctx, 0, 20 * U, 46 * U, C.amber, 0.5 * lamp); ctx.restore();
            }
            ctx.fillStyle = rgb(C.night950);
            ctx.beginPath(); ctx.moveTo(-L, -9 * U); ctx.lineTo(L, -9 * U); ctx.quadraticCurveTo(L * 0.8, 3 * U, L * 0.55, 4 * U); ctx.lineTo(-L * 0.6, 4 * U); ctx.quadraticCurveTo(-L * 0.9, 2 * U, -L, -9 * U); ctx.fill();
            ctx.fillRect(-L * 0.35, -19 * U, L * 0.55, 10 * U);
            ctx.fillStyle = rgb(lamp > 0 ? C.glow : C.silver600, lamp > 0 ? 0.9 : 0.5); ctx.fillRect(-L * 0.25, -16 * U, L * 0.14, 4 * U); ctx.fillRect(-L * 0.02, -16 * U, L * 0.14, 4 * U);
            ctx.strokeStyle = rgb(C.night950); ctx.lineWidth = 1.6 * U; ctx.beginPath(); ctx.moveTo(L * 0.05, -19 * U); ctx.lineTo(L * 0.05, -38 * U); ctx.stroke();
            if (rim > 0) {
              ctx.strokeStyle = rgb(C.silver100, 0.8 * rim); ctx.lineWidth = 1.4 * U;
              ctx.beginPath(); ctx.moveTo(-L, -9 * U); ctx.lineTo(L, -9 * U); ctx.moveTo(-L * 0.35, -19 * U); ctx.lineTo(L * 0.2, -19 * U); ctx.stroke();
            }
            glow(ctx, L * 0.05, -40 * U, (lamp > 0 ? 26 : 8) * U, lamp > 0 ? C.amber : C.silver400, lamp > 0 ? 0.95 * lamp : 0.5);
            disc(ctx, L * 0.05, -40 * U, 2.2 * U, lamp > 0 ? C.daylight : C.silver300, 0.9);
            ctx.restore();
          };
          for (const l of this.lit) {
            const p = (now - l.at) / 2.2, bx = cx + l.x * Rx;
            for (let i = 0; i < 3; i++) {
              const rp = clamp(p * 1.6 - i * 0.18, 0, 1);
              if (rp <= 0 || rp >= 1) continue;
              ctx.save(); ctx.translate(bx, wy + 3 * U); ctx.scale(1, 0.25); ring(ctx, 0, 0, (16 + 70 * rp) * U, C.glow, 0.5 * (1 - rp), 2.2 * U); ctx.restore();
            }
            boat(bx + Math.sign(l.x) * p * 30 * U, 1 - ease((p - 0.55) / 0.45), 1, 0);
          }
          if (!this.done) {
            const nr = this.near(), rim = clamp(1 - nr / 0.32, 0, 1);
            boat(cx + this.target * Rx, clamp(this.t / 0.4, 0, 1), 0, rim);
            if (this.items === 0 && this.t > 1.5 && nr < 0.3) tapCue(ctx, cx + this.target * Rx, wy - 30 * U, U, now, rim);
          }
          dots(ctx, cx, Math.min(b.y + b.h * 0.92, wy + 56 * U), need, this.items, U);
        },
      });
    },
  });
})();
