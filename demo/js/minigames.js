(() => {
  const { clamp, lerp, ease, rgb, hex } = A;
  const Au = A.Audio;
  const WARM = hex('#F2B544'), PALE = hex('#F2E6C9'), GREEN = hex('#5FE3A1'), TEAL = hex('#4FC3D9'), VIOLET = hex('#B79CFF'), ICE = hex('#7FC8E8'), DAY = hex('#FFF3DC');
  const R = Math.random;

  const glow = (ctx, x, y, r, c, a) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rgb(c, a)); g.addColorStop(0.35, rgb(c, a * 0.45)); g.addColorStop(1, rgb(c, 0));
    ctx.fillStyle = g; ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
  };
  const dist = (a, b, c, d) => Math.hypot(a - c, b - d);

  const base = (id, max, extra) => ({ id, max, t: 0, done: false, items: 0, errors: 0, extra: {}, finishedAt: null, ...extra });
  const finish = (g, now) => { if (!g.done) { g.done = true; g.finishedAt = now; } };

  const GAMES = A.MINIGAMES = {};

  GAMES.fireflies = {
    modes: ['wake'], role: 'Among Us: Clear Asteroids',
    make(k) {
      const n = 5 + Math.round(3 * k), sp = 0.22 + 0.4 * k;
      return base('fireflies', 12, {
        flies: Array.from({ length: n }, () => ({ u: 0.15 + 0.7 * R(), v: 0.15 + 0.5 * R(), du: (R() - 0.5) * 2 * sp, dv: (R() - 0.5) * 2 * sp, c: null, seed: R() * 9 })),
        nextAuto: 0.8,
        update(dt, now) {
          for (const f of this.flies) {
            if (f.c !== null) continue;
            f.u += f.du * dt; f.v += f.dv * dt + 0.08 * Math.sin(now * 6 + f.seed) * dt;
            if (f.u < 0.08 || f.u > 0.92) f.du *= -1;
            if (f.v < 0.1 || f.v > 0.68) f.dv *= -1;
            f.u = clamp(f.u, 0.08, 0.92); f.v = clamp(f.v, 0.1, 0.68);
          }
          if (this.flies.every(f => f.c !== null)) finish(this, now);
        },
        down(u, v, now) {
          const f = this.flies.filter(f => f.c === null).sort((a, b) => dist(a.u, a.v, u, v) - dist(b.u, b.v, u, v))[0];
          if (f && dist(f.u, f.v, u, v) < 0.09) { f.c = now; this.items++; Au.piano(5 + (this.items % 5), 0.14); }
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
          const jx = b.x + b.w / 2, jy = b.y + b.h * 0.86;
          glow(ctx, jx, jy - 14, 70, hex('#BFFFAA'), 0.1 + 0.6 * this.items / this.flies.length);
          ctx.strokeStyle = 'rgba(235,232,222,0.5)'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(jx - 26, jy - 34); ctx.lineTo(jx - 26, jy + 6); ctx.quadraticCurveTo(jx, jy + 16, jx + 26, jy + 6); ctx.lineTo(jx + 26, jy - 34); ctx.stroke();
          for (const f of this.flies) {
            let x = b.x + f.u * b.w, y = b.y + f.v * b.h;
            if (f.c !== null) { const p = clamp((now - f.c) / 0.5, 0, 1); x = lerp(x, jx + (f.seed - 4.5) * 4, ease(p)); y = lerp(y, jy - 10, ease(p)); }
            glow(ctx, x, y, 16, hex('#C8FFB0'), 0.75 + 0.25 * Math.sin(now * 14 + f.seed));
          }
        },
      });
    },
  };

  GAMES.beacon = {
    modes: ['wake', 'fatigue'], role: 'Among Us: Calibrate Distributor',
    make(k) {
      const speed = 1.3 + 1.6 * k, need = 3;
      return base('beacon', 13, {
        a: 0, target: 0.6 + R() * 1.6, dim: 0, hitFx: 0,
        update(dt, now) { this.a = (this.a + speed * dt) % (Math.PI * 2); this.dim = Math.max(0, this.dim - dt * 2); this.hitFx = Math.max(0, this.hitFx - dt * 1.5); if (this.items >= need) finish(this, now); },
        delta() { let d = Math.abs(this.a - this.target) % (Math.PI * 2); return Math.min(d, Math.PI * 2 - d); },
        down(u, v, now) {
          if (this.delta() < 0.32) { this.items++; this.hitFx = 1; this.target = (this.target + 1.4 + R() * 2.2) % (Math.PI * 2); Au.bell(); }
          else { this.errors++; this.dim = 1; }
        },
        auto(dt, now) { if (this.delta() < 0.1 && R() < 0.6) this.down(0, 0, now); },
        draw(ctx, b, now) {
          const cx = b.x + b.w / 2, cy = b.y + b.h * 0.5, rr = Math.min(b.w, b.h) * 0.38;
          ctx.strokeStyle = 'rgba(235,232,222,0.12)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(cx, cy, rr, 0, 6.28); ctx.stroke();
          const tx = cx + Math.cos(this.target) * rr, ty = cy + Math.sin(this.target) * rr;
          ctx.fillStyle = rgb(PALE, 0.55 + 0.45 * this.hitFx);
          ctx.beginPath(); ctx.moveTo(tx - 12, ty); ctx.quadraticCurveTo(tx, ty + 8, tx + 12, ty); ctx.lineTo(tx + 9, ty - 3); ctx.lineTo(tx - 9, ty - 3); ctx.fill();
          ctx.fillRect(tx - 1, ty - 14, 2, 11);
          ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.translate(cx, cy); ctx.rotate(this.a);
          const g = ctx.createLinearGradient(0, 0, rr * 1.15, 0);
          g.addColorStop(0, rgb(PALE, 0.55 * (1 - 0.7 * this.dim))); g.addColorStop(1, rgb(PALE, 0));
          ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, rr * 1.15, -0.2, 0.2); ctx.fill();
          ctx.restore();
          glow(ctx, cx, cy, 26, WARM, 0.9);
          for (let i = 0; i < 3; i++) glow(ctx, b.x + b.w * (0.4 + i * 0.1), b.y + b.h * 0.92, 8, WARM, i < this.items ? 0.9 : 0.15);
        },
      });
    },
  };

  GAMES.bells = {
    modes: ['wake', 'fatigue'], role: 'Among Us: Start Reactor',
    make(k) {
      const notes = [3, 5, 8];
      const g = base('bells', 16, {
        len: 3 + Math.round(k), seq: [], phase: 'show', step: 0, showT: 0, input: [], lit: [0, 0, 0], gap: lerp(0.6, 0.42, k), nextAuto: 0.6,
        reset() { this.seq = Array.from({ length: this.len }, () => Math.floor(R() * 3)); this.phase = 'show'; this.step = 0; this.showT = -0.6; this.input = []; },
        ring(i) { this.lit[i] = 1; Au.piano(notes[i], 0.18); },
        update(dt, now) {
          this.lit = this.lit.map(l => Math.max(0, l - dt * 3));
          if (this.phase === 'show') {
            this.showT += dt;
            if (this.showT >= this.gap) { this.showT = 0; if (this.step < this.seq.length) this.ring(this.seq[this.step++]); else this.phase = 'play'; }
          }
        },
        down(u, v, now) {
          if (this.done || this.phase !== 'play' || v < 0.25 || v > 0.85) return;
          const i = clamp(Math.floor(u * 3), 0, 2);
          this.ring(i); this.input.push(i);
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
        draw(ctx, b) {
          for (let i = 0; i < 3; i++) {
            const x = b.x + b.w * (i + 0.5) / 3, y = b.y + b.h * 0.52, s = b.w * 0.09;
            glow(ctx, x, y, s * 3, WARM, 0.15 + 0.8 * this.lit[i]);
            ctx.fillStyle = rgb([200, 160, 90], 0.55 + 0.45 * this.lit[i]);
            ctx.beginPath(); ctx.moveTo(x - s, y + s); ctx.quadraticCurveTo(x - s * 0.9, y - s * 1.1, x, y - s * 1.2); ctx.quadraticCurveTo(x + s * 0.9, y - s * 1.1, x + s, y + s); ctx.closePath(); ctx.fill();
            ctx.fillRect(x - 1.5, y - s * 1.6, 3, s * 0.45);
          }
          for (let i = 0; i < this.seq.length; i++) glow(ctx, b.x + b.w * (0.5 + (i - (this.seq.length - 1) / 2) * 0.07), b.y + b.h * 0.9, 7, PALE, i < this.input.length ? 0.9 : 0.15);
        },
      });
      g.reset();
      return g;
    },
  };

  GAMES.shutters = {
    modes: ['fatigue'], role: 'Among Us: Swipe Card',
    make(k) {
      return base('shutters', 12, {
        wins: [0, 1, 2, 3].map(i => ({ u: 0.2 + (i % 2) * 0.6, v: 0.3 + Math.floor(i / 2) * 0.38, open: 0, start: null })), drag: null, nextAuto: 0.7,
        update(dt, now) {
          for (const w of this.wins) if (w.open > 0 && w.open < 1) w.open = Math.min(1, w.open + dt * 3);
          A.session && (A.session.daylightBoost = this.items / 4);
          if (this.wins.every(w => w.open >= 1)) finish(this, now);
        },
        hit(u, v) { return this.wins.find(w => w.open === 0 && Math.abs(u - w.u) < 0.17 && Math.abs(v - w.v) < 0.16); },
        down(u, v) { const w = this.hit(u, v); this.drag = w ? { w, v0: v } : null; },
        move(u, v) { if (this.drag && this.drag.v0 - v > 0.1) { this.drag.w.open = 0.01; this.items++; Au.piano(7 + this.items % 3, 0.14); this.drag = null; } },
        up() { if (this.drag) this.errors++; this.drag = null; },
        auto(dt) {
          this.nextAuto -= dt;
          if (this.nextAuto > 0) return;
          this.nextAuto = 0.6 + R() * 0.3;
          const w = this.wins.find(w => w.open === 0);
          if (w) { this.down(w.u, w.v + 0.05); this.move(w.u, w.v - 0.1); }
        },
        draw(ctx, b) {
          for (const w of this.wins) {
            const x = b.x + w.u * b.w, y = b.y + w.v * b.h, ww = b.w * 0.28, hh = b.h * 0.27;
            ctx.fillStyle = rgb(DAY, 0.15 + 0.75 * w.open); ctx.fillRect(x - ww / 2, y - hh / 2, ww, hh);
            if (w.open > 0) glow(ctx, x, y, ww, DAY, 0.35 * w.open);
            const sh = hh * (1 - ease(w.open));
            ctx.fillStyle = 'rgb(92,70,52)'; ctx.fillRect(x - ww / 2, y - hh / 2, ww, sh);
            ctx.fillStyle = 'rgba(0,0,0,0.25)';
            for (let yy = 6; yy < sh; yy += 7) ctx.fillRect(x - ww / 2, y - hh / 2 + yy, ww, 1.5);
            ctx.strokeStyle = 'rgba(235,232,222,0.35)'; ctx.lineWidth = 2; ctx.strokeRect(x - ww / 2, y - hh / 2, ww, hh);
            if (w.open === 0) { ctx.fillStyle = 'rgba(235,232,222,0.35)'; ctx.beginPath(); ctx.moveTo(x, y - 10); ctx.lineTo(x - 7, y); ctx.lineTo(x + 7, y); ctx.fill(); }
          }
        },
      });
    },
  };

  GAMES.threads = {
    modes: ['flow'], role: 'Among Us: Fix Wiring',
    make() {
      const cols = [GREEN, TEAL, VIOLET], order = [0, 1, 2].sort(() => R() - 0.5);
      return base('threads', 14, {
        left: cols.map((c, i) => ({ c, v: 0.25 + i * 0.25, done: false })), right: order.map((ci, j) => ({ ci, v: 0.25 + j * 0.25 })),
        drag: null, nextAuto: 0.9, autoDrag: null,
        update(dt, now) {
          if (this.autoDrag) {
            const a = this.autoDrag; a.p += dt / 0.8;
            this.move(lerp(0.15, 0.85, ease(a.p)), lerp(a.v0, a.v1, ease(a.p)));
            if (a.p >= 1) { this.up(0.85, a.v1); this.autoDrag = null; }
          }
          if (this.left.every(l => l.done)) finish(this, now);
        },
        down(u, v) { const i = this.left.findIndex(l => !l.done && dist(0.15, l.v, u, v) < 0.1); this.drag = i >= 0 ? { i, u, v } : null; },
        move(u, v) { if (this.drag) { this.drag.u = u; this.drag.v = v; } },
        up(u, v) {
          if (!this.drag) return;
          const j = this.right.findIndex(r => dist(0.85, r.v, u, v) < 0.1);
          if (j >= 0 && this.right[j].ci === this.drag.i) { this.left[this.drag.i].done = true; this.items++; Au.piano(5 + this.items * 2, 0.15); }
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
          this.down(0.15, this.left[i].v); this.autoDrag = { p: 0, v0: this.left[i].v, v1: this.right[j].v };
        },
        draw(ctx, b, now) {
          const X = u => b.x + u * b.w, Y = v => b.y + v * b.h;
          const curve = (u0, v0, u1, v1, c, a) => {
            ctx.strokeStyle = rgb(c, a); ctx.lineWidth = 5; ctx.lineCap = 'round';
            ctx.beginPath(); ctx.moveTo(X(u0), Y(v0)); ctx.bezierCurveTo(X((u0 + u1) / 2), Y(v0) - 20 * Math.sin(now * 2), X((u0 + u1) / 2), Y(v1) + 20 * Math.sin(now * 2), X(u1), Y(v1)); ctx.stroke();
          };
          this.left.forEach((l, i) => {
            if (l.done) { const r = this.right.find(r => r.ci === i); curve(0.15, l.v, 0.85, r.v, l.c, 0.7); }
            glow(ctx, X(0.15), Y(l.v), 22, l.c, 0.8); ctx.fillStyle = rgb(l.c); ctx.beginPath(); ctx.arc(X(0.15), Y(l.v), 7, 0, 6.28); ctx.fill();
          });
          this.right.forEach(r => { const c = this.left[r.ci].c; glow(ctx, X(0.85), Y(r.v), 22, c, 0.5); ctx.strokeStyle = rgb(c); ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(X(0.85), Y(r.v), 7, 0, 6.28); ctx.stroke(); });
          if (this.drag) curve(0.15, this.left[this.drag.i].v, this.drag.u, this.drag.v, this.left[this.drag.i].c, 0.85);
        },
      });
    },
  };

  GAMES.stars = {
    modes: ['flow'], role: 'Among Us: Unlock Manifolds',
    make() {
      const pts = [[0.18, 0.62], [0.34, 0.3], [0.52, 0.5], [0.7, 0.24], [0.84, 0.58]].sort(() => R() - 0.5);
      return base('stars', 12, {
        stars: pts.map((p, i) => ({ u: p[0], v: p[1], size: 3 + i * 1.6, on: false, flick: 0 })), next: 0, nextAuto: 0.7, path: [],
        update(dt, now) { this.stars.forEach(s => s.flick = Math.max(0, s.flick - dt * 3)); if (this.next >= this.stars.length) finish(this, now); },
        down(u, v) {
          const s = this.stars.filter(s => !s.on).sort((a, b) => dist(a.u, a.v, u, v) - dist(b.u, b.v, u, v))[0];
          if (!s || dist(s.u, s.v, u, v) > 0.1) return;
          if (s === this.stars[this.next]) { s.on = true; this.next++; this.items++; this.path.push(s); Au.piano(4 + this.next, 0.15); }
          else { s.flick = 1; this.errors++; }
        },
        auto(dt) { this.nextAuto -= dt; if (this.nextAuto > 0) return; this.nextAuto = 0.5 + R() * 0.3; const s = this.stars[this.next]; if (s) this.down(s.u, s.v); },
        draw(ctx, b, now) {
          const X = u => b.x + u * b.w, Y = v => b.y + v * b.h;
          ctx.strokeStyle = rgb(PALE, 0.5); ctx.lineWidth = 1.5; ctx.beginPath();
          this.path.forEach((s, i) => i ? ctx.lineTo(X(s.u), Y(s.v)) : ctx.moveTo(X(s.u), Y(s.v))); ctx.stroke();
          for (const s of this.stars) {
            const a = s.on ? 1 : 0.45 + 0.15 * Math.sin(now * 3 + s.size) - 0.3 * s.flick;
            glow(ctx, X(s.u), Y(s.v), s.size * 6, s.on ? WARM : PALE, a);
            ctx.fillStyle = rgb(PALE, a); ctx.beginPath(); ctx.arc(X(s.u), Y(s.v), s.size, 0, 6.28); ctx.fill();
          }
        },
      });
    },
  };

  GAMES.loyly = {
    modes: ['calm'], role: 'Among Us: Swipe Card (slow swipe)',
    make() {
      return base('loyly', 20, {
        need: 2, ladle: 0.15, drag: null, steam: 0, splash: 0, autoT: null,
        update(dt, now) {
          this.steam = Math.max(0, this.steam - dt * 0.25); this.splash = Math.max(0, this.splash - dt * 2);
          if (!this.drag && this.ladle > 0.15) this.ladle = Math.max(0.15, this.ladle - dt * 0.8);
          if (this.autoT !== null) { this.autoT += dt; this.move(lerp(0.15, 0.86, clamp(this.autoT / 3.2, 0, 1)), 0.5); if (this.autoT >= 3.2) { this.up(); this.autoT = null; } }
          if (this.items >= this.need && this.steam < 0.6) finish(this, now);
        },
        down(u, v, now) { if (Math.abs(u - this.ladle) < 0.12) this.drag = { t0: now }; },
        move(u) { if (this.drag) this.ladle = clamp(u, 0.15, 0.86); },
        up(u, v, now = A.now()) {
          if (!this.drag) return;
          const dur = now - this.drag.t0; this.drag = null;
          if (this.ladle < 0.84) return;
          if (dur >= 2.0) { this.items++; this.steam = 1; Au.piano(0, 0.12); Au.piano(3, 0.1); }
          else { this.errors++; this.splash = 1; }
        },
        auto(dt, now) { if (this.autoT === null && !this.drag && this.ladle <= 0.16 && this.steam < 0.3) { this.down(0.15, 0.5, now); this.autoT = 0; } },
        draw(ctx, b, now) {
          const X = u => b.x + u * b.w, sy = b.y + b.h * 0.72;
          ctx.fillStyle = 'rgb(70,64,62)';
          for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.ellipse(X(0.8) + (i % 3 - 1) * 16, sy - Math.floor(i / 3) * 10, 11, 8, 0, 0, 6.28); ctx.fill(); }
          glow(ctx, X(0.8), sy, 60, hex('#D98E2B'), 0.35 + 0.3 * Math.sin(now * 2) * 0.2);
          for (let i = 0; i < 6; i++) {
            const p = ((now * 0.25 + i / 6) % 1);
            glow(ctx, X(0.8) + Math.sin(now + i) * 20, sy - 20 - p * b.h * 0.6, 30 + 30 * p, PALE, this.steam * 0.35 * (1 - p));
          }
          if (this.splash > 0) for (let i = 0; i < 5; i++) glow(ctx, X(0.78) + (i - 2) * 9, sy - 18 - this.splash * 14 * (i % 2 + 1), 5, ICE, this.splash);
          const lx = X(this.ladle), ly = b.y + b.h * 0.42;
          ctx.strokeStyle = 'rgb(150,110,70)'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(lx - 40, ly - 22); ctx.lineTo(lx, ly); ctx.stroke();
          ctx.fillStyle = 'rgb(150,110,70)'; ctx.beginPath(); ctx.arc(lx + 6, ly + 4, 10, 0, Math.PI); ctx.fill();
          ctx.strokeStyle = 'rgba(235,232,222,0.12)'; ctx.setLineDash([2, 6]); ctx.beginPath(); ctx.moveTo(X(0.15), ly + 22); ctx.lineTo(X(0.86), ly + 22); ctx.stroke(); ctx.setLineDash([]);
          for (let i = 0; i < this.need; i++) glow(ctx, b.x + b.w * (0.45 + i * 0.1), b.y + b.h * 0.92, 8, WARM, i < this.items ? 0.9 : 0.15);
        },
      });
    },
  };

  GAMES.breath = {
    modes: ['calm', 'rest'], role: 'Apple Watch Breathe, Celeste feather', world: true,
    make(k, opts) {
      return base('breath', opts?.endless ? 999 : 20, {
        cycles: opts?.endless ? 999 : 2, b: 0, sync: 0.5, frames: 0, matched: 0, lastInhale: -1,
        update(dt, now) {
          const ct = this.t % 10, inhale = ct < 4;
          this.b = inhale ? ct / 4 : 1 - (ct - 4) / 6;
          const holding = this.autoHold ?? A.Input.holding();
          this.frames++; if (holding === inhale) this.matched++;
          this.sync = this.matched / this.frames;
          const c = Math.floor(this.t / 10);
          if (inhale && c !== this.lastInhale) { this.lastInhale = c; A.session?.haptic(); }
          Au.padLevel(this.b);
          if (this.t >= this.cycles * 10) { this.items = this.cycles; finish(this, now); }
          A.session && (A.session.orb = { b: this.b, hold: holding ? 1 : 0, sync: this.sync, alpha: 1 });
        },
        auto() { const ct = (this.t - 0.3 + 10) % 10; this.autoHold = ct < 4; },
        draw() {},
      });
    },
  };

  A.pickGame = (mode, last, weights) => {
    const all = Object.keys(GAMES).filter(id => GAMES[id].modes.includes(mode));
    const w = id => weights ? Math.max(0, weights[id] ?? 0) : 1;
    let pool = all.filter(id => id !== last && w(id) > 0);
    if (!pool.length) pool = all.filter(id => w(id) > 0);
    if (!pool.length) pool = all;
    const total = pool.reduce((a, id) => a + (w(id) || 1), 0);
    let x = R() * total;
    for (const id of pool) { x -= w(id) || 1; if (x <= 0) return { id, weight: weights ? weights[id] ?? null : null }; }
    const id = pool[pool.length - 1] || 'breath';
    return { id, weight: weights ? weights[id] ?? null : null };
  };

  A.MINI = { glow, dist, base, finish };
})();
