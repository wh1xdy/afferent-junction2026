(() => {
  const { clamp, lerp, ease, rgb, mixc } = A;
  const { C, glow, ring, disc, dist, unit, finger, tapCue, dragCue, line, dots, base, finish, idle } = A.J;
  const Au = A.Audio, R = Math.random, calm = A.J.rm;
  const WOOD = C.wood, WOOD_D = C.woodD, WOOD_L = C.woodL, BRONZE_D = C.bronzeD, STONE = C.stone, STONE_D = C.stoneD;

  A.defineTask('shutters', {
    modes: ['fatigue', 'wake'], role: 'Among Us: Swipe Card',
    make(k) {
      return base('shutters', 12, {
        area: [1.1, 0.36],
        wins: [0, 1, 2, 3].map(i => ({ u: 0.29 + (i % 2) * 0.42, v: 0.3 + Math.floor(i / 2) * 0.42, open: 0 })), drag: null, nextAuto: 0.7, lay: null,
        update(dt, now) {
          for (const w of this.wins) if (w.open > 0 && w.open < 1) w.open = Math.min(1, w.open + dt * 2.6);
          A.session && (A.session.daylightBoost = this.items / 4);
          if (this.wins.every(w => w.open >= 1)) finish(this, now);
        },
        size() { return this.lay || { hw: 0.17, hh: 0.17 }; },
        hit(u, v) { const { hw, hh } = this.size(); return this.wins.find(w => w.open === 0 && Math.abs(u - w.u) < hw + 0.03 && Math.abs(v - w.v) < hh + 0.04); },
        down(u, v) { this.lastIn = this.t; const w = this.hit(u, v); this.drag = w ? { w, v0: v } : null; },
        move(u, v) { if (this.drag && this.drag.v0 - v > 0.08) { this.drag.w.open = 0.01; this.items++; Au.piano(7 + this.items % 3, 0.14); this.drag = null; } },
        up() { if (this.drag) this.errors++; this.drag = null; },
        auto(dt) {
          this.nextAuto -= dt;
          if (this.nextAuto > 0) return;
          this.nextAuto = 0.6 + R() * 0.3;
          const w = this.wins.find(w => w.open === 0);
          if (w) { this.down(w.u, w.v + 0.05); this.move(w.u, w.v - 0.1); }
        },
        draw(ctx, b, now) {
          const U = unit(b), ww = Math.min(b.w * 0.34, 112 * U), hh = Math.min(b.h * 0.34, ww * 0.95);
          this.lay = { hw: ww / 2 / b.w, hh: hh / 2 / b.h };
          const flood = this.done ? ease((now - this.finishedAt) / 0.5) : 0, opened = this.wins.reduce((a, w) => a + ease(w.open), 0) / 4;
          ctx.save();
          ctx.fillStyle = rgb(WOOD_D, 0.55); ctx.fillRect(b.x, b.y, b.w, b.h);
          for (let y = b.y + 14 * U, i = 0; y < b.y + b.h; y += 22 * U, i++) {
            ctx.fillStyle = rgb(i % 2 ? WOOD : WOOD_D, 0.5); ctx.fillRect(b.x, y, b.w, 20 * U);
            ctx.fillStyle = rgb(C.night950, 0.45); ctx.fillRect(b.x, y + 20 * U, b.w, 2 * U);
          }
          ctx.restore();
          glow(ctx, b.x + b.w / 2, b.y + b.h / 2, b.w * 0.8, C.warm, 0.18 * opened);
          for (const w of this.wins) {
            const x = b.x + w.u * b.w, y = b.y + w.v * b.h, x0 = x - ww / 2, y0 = y - hh / 2, o = ease(w.open);
            ctx.save();
            ctx.beginPath(); ctx.rect(x0, y0, ww, hh); ctx.clip();
            const sky = ctx.createLinearGradient(0, y0, 0, y0 + hh);
            sky.addColorStop(0, rgb(C.sky)); sky.addColorStop(0.55, rgb(C.peach)); sky.addColorStop(0.85, rgb(C.sun)); sky.addColorStop(1, rgb(C.gold));
            ctx.fillStyle = sky; ctx.fillRect(x0, y0, ww, hh);
            glow(ctx, x + (w.u - 0.5) * ww * 0.6, y0 + hh * 0.92, ww * 0.55, C.daylight, 0.95);
            disc(ctx, x + (w.u - 0.5) * ww * 0.6, y0 + hh * 0.95, ww * 0.12, C.daylight);
            ctx.fillStyle = rgb(C.silver600, 0.55);
            ctx.beginPath(); ctx.moveTo(x0, y0 + hh); ctx.lineTo(x0, y0 + hh * 0.86); ctx.quadraticCurveTo(x0 + ww * 0.3, y0 + hh * 0.76, x0 + ww * 0.55, y0 + hh * 0.88); ctx.quadraticCurveTo(x0 + ww * 0.8, y0 + hh * 0.8, x0 + ww, y0 + hh * 0.86); ctx.lineTo(x0 + ww, y0 + hh); ctx.fill();
            ctx.fillStyle = rgb(C.night900, 0.6 * (1 - o)); ctx.fillRect(x0, y0, ww, hh);
            const sh = hh * (1 - o);
            if (sh > 0.5) {
              for (let yy = 0, j = 0; yy < sh; yy += 9 * U, j++) {
                const g = ctx.createLinearGradient(0, y0 + yy, 0, y0 + yy + 9 * U);
                g.addColorStop(0, rgb(WOOD_L)); g.addColorStop(0.6, rgb(WOOD)); g.addColorStop(1, rgb(WOOD_D));
                ctx.fillStyle = g; ctx.fillRect(x0, y0 + yy, ww, Math.min(9 * U, sh - yy));
              }
              ctx.fillStyle = rgb(WOOD_D); ctx.fillRect(x0, y0 + sh - 5 * U, ww, 5 * U);
              ring(ctx, x, y0 + sh - 9 * U, 3.5 * U, C.silver400, 0.8, 1.6 * U);
            }
            ctx.restore();
            ctx.strokeStyle = rgb(WOOD_D); ctx.lineWidth = 6 * U; ctx.strokeRect(x0 - 3 * U, y0 - 3 * U, ww + 6 * U, hh + 6 * U);
            ctx.strokeStyle = rgb(WOOD_L, 0.6); ctx.lineWidth = 1.2 * U; ctx.strokeRect(x0 - 6 * U, y0 - 6 * U, ww + 12 * U, hh + 12 * U);
            if (o > 0) {
              ctx.fillStyle = rgb(WOOD_D); ctx.fillRect(x - 1.5 * U, y0, 3 * U, hh); ctx.fillRect(x0, y - 1.5 * U, ww, 3 * U);
              ctx.save(); ctx.globalCompositeOperation = 'lighter';
              const rays = ctx.createLinearGradient(0, y0 + hh, 0, y0 + hh + 60 * U);
              rays.addColorStop(0, rgb(C.daylight, 0.22 * o)); rays.addColorStop(1, rgb(C.daylight, 0));
              ctx.fillStyle = rays; ctx.beginPath(); ctx.moveTo(x0, y0 + hh + 6 * U); ctx.lineTo(x0 + ww, y0 + hh + 6 * U); ctx.lineTo(x0 + ww * 1.25, y0 + hh + 60 * U); ctx.lineTo(x0 - ww * 0.25, y0 + hh + 60 * U); ctx.fill();
              ctx.restore();
            }
            ctx.fillStyle = rgb(WOOD); ctx.fillRect(x0 - 10 * U, y0 + hh + 5 * U, ww + 20 * U, 6 * U);
            if (w.open === 0 && !calm()) {
              for (let c = 0; c < 2; c++) {
                const p = ((now * 0.9 + c * 0.5) % 1), cy = y + hh * 0.18 - p * hh * 0.42;
                ctx.strokeStyle = rgb(C.flame, 0.55 * Math.sin(p * Math.PI)); ctx.lineWidth = 2.6 * U; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
                ctx.beginPath(); ctx.moveTo(x - 9 * U, cy + 6 * U); ctx.lineTo(x, cy - 2 * U); ctx.lineTo(x + 9 * U, cy + 6 * U); ctx.stroke();
              }
            }
          }
          if (flood > 0) {
            ctx.save(); ctx.globalCompositeOperation = 'lighter';
            glow(ctx, b.x + b.w / 2, b.y + b.h * 0.45, b.w * 0.9, C.daylight, 0.45 * flood * (1 - 0.4 * clamp((now - this.finishedAt - 0.5) / 0.6, 0, 1)));
            ctx.restore();
          }
          if (this.items === 0 && this.t > 1.2) {
            const w = this.wins[0], x = b.x + w.u * b.w, y = b.y + w.v * b.h;
            dragCue(ctx, line(x, y + hh * 0.3, x, y - hh * 0.35), U, now, clamp((this.t - 1.2) / 0.4, 0, 1), 1.8);
          }
        },
      });
    },
  });
})();
