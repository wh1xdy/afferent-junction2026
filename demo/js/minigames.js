(() => {
  const { clamp, lerp, ease, ema, rgb, hex, mixc } = A;
  const Au = A.Audio;
  const R = Math.random;
  const C = Object.fromEntries(Object.entries({
    night950: '#05070F', night900: '#070A14', night850: '#0A0E1C', night800: '#0D1326', night700: '#131B36', night600: '#1C2548', night500: '#28335E',
    violet500: '#5B4B8A', violet300: '#9C8AD6', violet200: '#B79CFF',
    silver050: '#F3F6FA', silver100: '#E8EEF5', silver200: '#CBD6E2', silver300: '#B9CAD6', silver400: '#93A3B8', silver500: '#7D8DA0', silver600: '#5D6B80', silver700: '#46546A',
    green: '#5FE3A1', greenDeep: '#2FA37A', teal: '#4FC3D9', tealDeep: '#2A8FA6', ice: '#7FC8E8',
    amber: '#F2B544', amberDeep: '#D98E2B', glow: '#FFD9A0', warm: '#FFC98A', flame: '#F2E6C9',
    gold: '#FFD27A', sun: '#FFE8B8', sky: '#9FC3E0', peach: '#F7C59F', coralSoft: '#F49D6E', daylight: '#FFF3DC',
  }).map(([k, v]) => [k, hex(v)]));
  const WOOD = mixc(C.amberDeep, C.night900, 0.62), WOOD_D = mixc(C.amberDeep, C.night950, 0.8), WOOD_L = mixc(C.amberDeep, C.night900, 0.4);
  const BRONZE_D = mixc(C.amberDeep, C.night900, 0.5), STONE = mixc(C.silver600, C.night900, 0.35), STONE_D = mixc(C.silver700, C.night950, 0.55);
  const calm = () => !!A.config?.reducedMotion;

  const glow = (ctx, x, y, r, c, a) => {
    if (a <= 0.003 || r <= 0) return;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rgb(c, a)); g.addColorStop(0.35, rgb(c, a * 0.45)); g.addColorStop(1, rgb(c, 0));
    ctx.fillStyle = g; ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
  };
  const dist = (a, b, c, d) => Math.hypot(a - c, b - d);
  const unit = b => Math.min(b.w / 1.15, b.h) / 300;
  const ring = (ctx, x, y, r, c, a, lw) => {
    if (a <= 0.003) return;
    ctx.strokeStyle = rgb(c, a); ctx.lineWidth = lw; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.283); ctx.stroke();
  };
  const disc = (ctx, x, y, r, c, a = 1) => { ctx.fillStyle = rgb(c, a); ctx.beginPath(); ctx.arc(x, y, r, 0, 6.283); ctx.fill(); };

  const finger = (ctx, x, y, s, a) => {
    if (a <= 0.01) return;
    const k = s / 30;
    ctx.save();
    ctx.translate(x, y); ctx.rotate(-0.4); ctx.scale(k, k);
    ctx.globalAlpha *= a;
    ctx.shadowColor = rgb(C.night950, 0.7); ctx.shadowBlur = 10;
    ctx.fillStyle = rgb(C.silver100, 0.95);
    ctx.beginPath();
    ctx.roundRect(-4.8, 0, 9.6, 27, 4.8);
    ctx.roundRect(-6.5, 17, 25, 25, 9);
    ctx.roundRect(-13, 23, 10, 15, 5);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = rgb(C.silver400, 0.7); ctx.lineWidth = 1.3; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(6, 25); ctx.lineTo(16, 25); ctx.moveTo(6, 31); ctx.lineTo(16, 31); ctx.stroke();
    ctx.restore();
  };

  const tapCue = (ctx, x, y, U, now, a = 1) => {
    if (a <= 0.01) return;
    const p = (now / 1.3) % 1;
    const press = calm() ? 1 : ease((p - 0.2) / 0.15) * (1 - ease((p - 0.55) / 0.2));
    const rp = clamp((p - 0.35) / 0.65, 0, 1);
    if (rp > 0 && !calm()) ring(ctx, x, y, (8 + 30 * ease(rp)) * U, C.flame, 0.75 * a * (1 - rp), 2.4 * U);
    glow(ctx, x, y, 22 * U, C.flame, 0.45 * a * press);
    finger(ctx, x + 2 * U, y + (2 + 12 * (1 - press)) * U, 32 * U, a);
  };

  const dragCue = (ctx, path, U, now, a = 1, dur = 2.6) => {
    if (a <= 0.01) return;
    const p = (now / dur) % 1, m = ease((p - 0.15) / 0.6), vis = clamp(p / 0.1, 0, 1) * (1 - clamp((p - 0.84) / 0.16, 0, 1));
    const [x, y] = path(m);
    ctx.save();
    ctx.strokeStyle = rgb(C.flame, 0.4 * a * vis); ctx.lineWidth = 3 * U; ctx.lineCap = 'round'; ctx.setLineDash([0.1, 8 * U]);
    ctx.beginPath();
    for (let i = 0; i <= 24; i++) { const [px, py] = path(m * i / 24); i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }
    ctx.stroke(); ctx.restore();
    glow(ctx, x, y, 18 * U, C.flame, 0.45 * a * vis);
    finger(ctx, x + 2 * U, y + 2 * U, 32 * U, a * vis);
  };
  const line = (x0, y0, x1, y1) => m => [lerp(x0, x1, m), lerp(y0, y1, m)];

  const dots = (ctx, cx, y, n, done, U, c = C.amber) => {
    for (let i = 0; i < n; i++) {
      const x = cx + (i - (n - 1) / 2) * 18 * U;
      if (i < done) { glow(ctx, x, y, 16 * U, c, 0.6); disc(ctx, x, y, 4 * U, mixc(c, C.silver050, 0.5)); }
      else ring(ctx, x, y, 4 * U, C.silver300, 0.35, 1.4 * U);
    }
  };

  const base = (id, max, extra) => ({ id, max, t: 0, done: false, items: 0, errors: 0, extra: {}, finishedAt: null, lastIn: 0, bar: () => null, ...extra });
  const finish = (g, now) => { if (!g.done) { g.done = true; g.finishedAt = now; } };
  const idle = (g, s) => g.t - g.lastIn > s;

  const GAMES = A.MINIGAMES = {};

  GAMES.fireflies = {
    modes: ['wake'], role: 'Among Us: Clear Asteroids',
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
  };

  GAMES.beacon = {
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
  };

  GAMES.bells = {
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
  };

  GAMES.shutters = {
    modes: ['fatigue'], role: 'Among Us: Swipe Card',
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
  };

  GAMES.threads = {
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
  };

  const SKY = [
    { pts: [[0.1, 0.36], [0.3, 0.7], [0.5, 0.44], [0.7, 0.72], [0.9, 0.32]] },
    { pts: [[0.32, 0.84], [0.3, 0.46], [0.5, 0.14], [0.7, 0.46], [0.68, 0.84]], close: 0 },
    { pts: [[0.1, 0.78], [0.38, 0.56], [0.58, 0.2], [0.86, 0.42], [0.66, 0.78]], close: 1 },
  ];
  const STAR_R = [3, 5, 8, 11, 15];

  GAMES.stars = {
    modes: ['flow'], role: 'Among Us: Unlock Manifolds',
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
  };

  GAMES.loyly = {
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
  };

  const BREATH_IN = 4, BREATH_CYCLE = 10, BREATH_ENGAGED = 0.35, BREATH_GUIDE = 60 / BREATH_CYCLE;
  const playLeft = () => A.session?.playLeft ? A.session.playLeft(A.now()) : Infinity;

  GAMES.breath = {
    modes: ['calm', 'rest'], role: 'Apple Watch Breathe, Celeste feather', world: true,
    minS: BREATH_CYCLE + 0.6,
    make(k, opts) {
      const endless = !!opts?.endless;
      const cycles = endless ? Infinity : clamp(Math.floor((playLeft() + 3 - 0.6) / BREATH_CYCLE), 1, 2);
      return base('breath', endless ? 999 : cycles * BREATH_CYCLE + 0.6, {
        cycles, b: 0, sync: 0, inF: 0, inH: 0, exF: 0, exR: 0, cyc: 0, cIn: 0, cHeld: 0,
        fb: A.Breathing.track(BREATH_GUIDE), ringA: 0, ringNear: null, ringSolid: false,
        // Ring around the guide: drawn only for a real, current reading from the finger clips, and only where body
        // numbers may show during play (the "Signals during play" switch). It settles slowly and never follows a breath.
        ring(dt) {
          const v = A.config?.signalsOverlay ? this.fb.view() : null;
          this.ringA = ema(this.ringA, v ? 1 : 0, dt, 0.8);
          if (v) { this.ringSolid = v.state === 'reading'; if (v.near != null) this.ringNear = this.ringNear == null ? v.near : ema(this.ringNear, v.near, dt, 3); }
          return this.ringA > 0.01 ? { a: this.ringA, near: this.ringNear ?? 0, solid: this.ringSolid } : null;
        },
        engaged() { return this.inF > 0 && this.inH / this.inF >= BREATH_ENGAGED; },
        close(now) { if (this.engaged()) finish(this, now); else this.max = this.t; },
        update(dt, now) {
          if (this.done) return;
          const ct = this.t % BREATH_CYCLE, inhale = ct < BREATH_IN;
          this.b = inhale ? ease(ct / BREATH_IN) : 1 - ease((ct - BREATH_IN) / (BREATH_CYCLE - BREATH_IN));
          const holding = !!(this.autoHold ?? A.Input.holding());
          if (holding) this.lastIn = this.t;
          if (inhale) { this.inF++; this.cIn++; if (holding) { this.inH++; this.cHeld++; } }
          else { this.exF++; if (!holding) this.exR++; }
          this.sync = 0.5 * ((this.inF ? this.inH / this.inF : 0) + (this.exF ? this.exR / this.exF : 0));
          const c = Math.floor(this.t / BREATH_CYCLE);
          if (c !== this.cyc) {
            if (this.cIn && this.cHeld / this.cIn >= BREATH_ENGAGED) this.items++;
            this.cyc = c; this.cIn = 0; this.cHeld = 0;
            A.session?.haptic();
            if (c >= this.cycles || (endless && playLeft() < BREATH_CYCLE + 0.2)) this.close(now);
          }
          if (endless && !this.done && playLeft() <= 0.3) this.close(now);
          Au.padLevel(this.b);
          this.fb.frame(now, A.Sensors.fingerFrame(now));
          const ring = this.ring(dt);
          A.session && (A.session.orb = { b: this.b, hold: holding ? 1 : 0, sync: this.sync, alpha: 1, inhale, cycle: c, cycles: this.cycles, phase: ct / BREATH_CYCLE, guide: c === 0 && inhale && !this.inH ? 1 : 0, ring });
        },
        auto() { const ct = (this.t - 0.3 + BREATH_CYCLE) % BREATH_CYCLE; this.autoHold = ct < BREATH_IN; },
        draw() {},
      });
    },
  };

  A.pickGame = (mode, last, weights) => {
    const left = playLeft() + 3;
    const all = Object.keys(GAMES).filter(id => GAMES[id].modes.includes(mode));
    const fits = all.filter(id => (GAMES[id].minS ?? 0) <= left);
    const w = id => weights ? Math.max(0, weights[id] ?? 0) : 1;
    let pool = fits.filter(id => id !== last && w(id) > 0);
    if (!pool.length) pool = fits.filter(id => w(id) > 0);
    if (!pool.length) pool = fits.length ? fits : all;
    const total = pool.reduce((a, id) => a + (w(id) || 1), 0);
    let x = R() * total;
    for (const id of pool) { x -= w(id) || 1; if (x <= 0) return { id, weight: weights ? weights[id] ?? null : null }; }
    const id = pool[pool.length - 1] || 'breath';
    return { id, weight: weights ? weights[id] ?? null : null };
  };

  A.MINI = { glow, dist, base, finish, unit, ring, disc, finger, tapCue, dragCue, line, dots, idle, C };
})();
