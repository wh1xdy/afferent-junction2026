(() => {
  const { clamp, lerp, ease, rgb, hex, mixc } = A;
  const { glow, dist, base, finish } = A.MINI;
  const Au = A.Audio, R = Math.random;
  const WARM = hex('#F2B544'), GLOW = hex('#FFD9A0'), FLAME = hex('#F2E6C9'), SILVER = hex('#CBD6E2'), FRAME = hex('#46546A');
  const VIOLET = hex('#5B4B8A'), DEEP = hex('#1E1838'), WHITE = hex('#F3F6FA');
  const MOOD = ['#34476E', '#5A7CA6', '#A9A79A', '#E8B867', '#FFCB5C'].map(hex), MOOD_A = [0.35, 0.5, 0.65, 0.82, 1];
  A.MOOD = { colours: MOOD, glow: MOOD_A };

  const calm = () => !!A.config?.reducedMotion;
  const profile = () => A.session?.profile || 'live';

  const lantern = A.drawLantern = (ctx, x, y, s, c, a, now, seed = 0) => {
    const fl = calm() ? 1 : 0.93 + 0.07 * Math.sin(now * 7.3 + seed) * Math.sin(now * 2.9 + seed * 2);
    glow(ctx, x, y, s * 2.3, c, 0.42 * a * fl);
    const gw = s * 0.6, gh = s * 0.8, top = y - gh / 2;
    ctx.lineWidth = Math.max(1.2, s * 0.045); ctx.strokeStyle = rgb(FRAME, 0.95);
    ctx.beginPath(); ctx.arc(x, top - s * 0.2, s * 0.1, Math.PI, 0); ctx.stroke();
    ctx.fillStyle = rgb(FRAME);
    ctx.beginPath(); ctx.moveTo(x - gw * 0.28, top - s * 0.13); ctx.lineTo(x + gw * 0.28, top - s * 0.13); ctx.lineTo(x + gw * 0.62, top); ctx.lineTo(x - gw * 0.62, top); ctx.closePath(); ctx.fill();
    ctx.fillStyle = rgb(mixc(c, WHITE, 0.12), 0.16 + 0.5 * a * fl);
    ctx.beginPath(); ctx.roundRect(x - gw / 2, top, gw, gh, s * 0.12); ctx.fill(); ctx.stroke();
    glow(ctx, x, y + gh * 0.06, s * 0.5, mixc(c, WHITE, 0.4), 0.85 * a * fl);
    ctx.fillStyle = rgb(mixc(c, WHITE, 0.65), 0.9 * a);
    ctx.beginPath(); ctx.ellipse(x, y + gh * 0.1, s * 0.065, s * 0.15 * fl, 0, 0, 6.28); ctx.fill();
    ctx.fillStyle = rgb(FRAME);
    ctx.beginPath(); ctx.roundRect(x - gw * 0.56, top + gh - s * 0.02, gw * 1.12, s * 0.09, s * 0.03); ctx.fill();
  };

  const tray = (ctx, b, n, c = WARM) => {
    for (let i = 0; i < n; i++) glow(ctx, b.x + b.w * (0.5 + (i - (n - 1) / 2) * 0.07), b.y + b.h * 0.93, 9, c, 0.9);
  };

  A.makeCheckin = () => base('checkin', 6, {
    kind: 'checkin', choice: null, pickedAt: null, decisionMs: null, autoAt: 1.3 + R() * 1.1, bar: () => null,
    update(dt, now) { if (this.choice !== null && now - this.pickedAt > 0.8) finish(this, now); },
    slot(u) { return clamp(Math.floor((u - 0.05) / 0.9 * 5), 0, 4); },
    down(u, v, now) {
      if (this.choice !== null || v < 0.15 || v > 0.88) return;
      this.choice = this.slot(u) + 1; this.pickedAt = now; this.decisionMs = Math.round(this.t * 1000);
      Au.piano(2 + this.choice, 0.14);
      A.session?.kick(0.25 + 0.1 * this.choice);
    },
    auto(dt, now) {
      if (this.t < this.autoAt || this.choice !== null) return;
      const v = { good_day: 4, bad_day: 2, live: 3 }[profile()];
      this.down(0.05 + 0.9 * (v - 0.5) / 5, 0.5, now);
    },
    draw(ctx, b, now) {
      const s = Math.min(b.w * 0.14, b.h * 0.36);
      for (let i = 0; i < 5; i++) {
        const x = b.x + b.w * (0.05 + 0.9 * (i + 0.5) / 5), y = b.y + b.h * 0.5 + (calm() ? 0 : 2.5 * Math.sin(now * 1.1 + i * 0.9));
        const picked = this.choice === i + 1, p = this.pickedAt ? ease((now - this.pickedAt) / 0.5) : 0;
        const a = MOOD_A[i] * (this.choice === null ? 1 : picked ? 1 + 0.25 * p : 1 - 0.7 * p);
        lantern(ctx, x, y, s * (picked ? 1 + 0.12 * p : 1), MOOD[i], a, now, i * 1.7);
      }
    },
  });

  const FORK_EASY = { lights: 3, gap: 0.55, life: 2.6, hit: 0.12 }, FORK_HARD = { lights: 8, gap: 0.12, life: 1.7, hit: 0.1 };
  const pathPts = (side, hard) => {
    const X = u => 0.5 + side * u;
    return hard
      ? [[0.5, 0.86], [X(0.1), 0.72], [X(0.24), 0.64], [X(0.37), 0.55], [X(0.22), 0.45], [X(0.12), 0.37], [X(0.27), 0.29], [X(0.36), 0.22], [X(0.28), 0.15]]
      : [[0.5, 0.86], [X(0.12), 0.8], [X(0.24), 0.74], [X(0.33), 0.67], [X(0.37), 0.6]];
  };
  const along = (pts, f) => {
    const seg = [];
    let L = 0;
    for (let i = 1; i < pts.length; i++) { const d = dist(...pts[i - 1], ...pts[i]); seg.push(d); L += d; }
    let x = f * L;
    for (let i = 0; i < seg.length; i++) { if (x <= seg[i] || i === seg.length - 1) { const t = clamp(x / seg[i], 0, 1); return [lerp(pts[i][0], pts[i + 1][0], t), lerp(pts[i][1], pts[i + 1][1], t)]; } x -= seg[i]; }
    return pts[pts.length - 1];
  };

  A.MEASURES = {
    fork: {
      make() {
        const rewards = R() < 0.5 ? [2, 3] : [3, 2];
        const g = base('fork', 60, {
          kind: 'measurement', rewards, choices: [], round: null, glows: 0, sparks: [],
          bar() { return this.round?.phase === 'choose' ? 1 - this.round.t / 6 : null; },
          start(i) {
            const hardSide = R() < 0.5 ? -1 : 1;
            this.round = { i, reward: rewards[i], hardSide, phase: 'choose', t: 0, path: null, spec: null, lights: [], cur: -1, nextAt: 0, autoAt: 1.1 + R() * 1.1 };
          },
          choose(path, now) {
            const r = this.round, hard = path === 'hard';
            r.path = path; r.spec = hard ? FORK_HARD : FORK_EASY; r.phase = 'path'; r.decisionMs = path === 'none' ? null : Math.round(r.t * 1000); r.pathAt = r.t;
            const pts = pathPts(hard ? r.hardSide : -r.hardSide, hard);
            r.lights = Array.from({ length: r.spec.lights }, (_, k) => ({ p: along(pts, (k + 1) / r.spec.lights), on: null, born: null, gone: false }));
            r.nextAt = r.t + 0.35;
            if (path !== 'none') Au.piano(hard ? 6 : 4, 0.14);
          },
          update(dt, now) {
            if (!this.round) this.start(0);
            const r = this.round;
            r.t += dt;
            this.sparks = this.sparks.filter(s => now - s.born < 1.1);
            if (r.phase === 'choose' && r.t >= 6) this.choose('none', now);
            if (r.phase === 'path') {
              const L = r.lights, c = L[r.cur];
              if (c && !c.on && !c.gone && r.t - c.born > r.spec.life) { c.gone = true; this.errors++; r.nextAt = r.t + r.spec.gap; }
              if ((!c || c.on || c.gone) && r.t >= r.nextAt) {
                if (r.cur < L.length - 1) { r.cur++; L[r.cur].born = r.t; r.autoTap = r.t + (profile() === 'bad_day' ? 0.5 + R() * 0.3 : 0.32 + R() * 0.2); }
                else this.reward(now);
              }
            }
            if (r.phase === 'reward' && r.t - r.rewardAt > 1.1) {
              if (r.i === 0) this.start(1); else finish(this, now);
            }
          },
          reward(now) {
            const r = this.round, got = r.path === 'hard' ? r.reward : 1, done = r.lights.every(l => l.on);
            r.phase = 'reward'; r.rewardAt = r.t;
            this.choices.push({ choice: r.i + 1, path: r.path, reward: r.reward, decision_ms: r.decisionMs, completed: done, task_ms: Math.round((r.t - r.pathAt) * 1000), hard_side: r.hardSide < 0 ? 'left' : 'right' });
            this.glows += got;
            for (let k = 0; k < got; k++) this.sparks.push({ born: now + k * 0.12, k, n: got });
            Au.piano(7 + got, 0.16);
            A.session?.kick(0.35 + 0.15 * got);
          },
          down(u, v, now) {
            const r = this.round;
            if (!r) return;
            if (r.phase === 'choose') { this.choose((u < 0.5 ? -1 : 1) === r.hardSide ? 'hard' : 'easy', now); return; }
            if (r.phase !== 'path') return;
            const c = r.lights[r.cur];
            if (c && !c.on && !c.gone && dist(c.p[0], c.p[1], u, v) < r.spec.hit) { c.on = r.t; this.items++; Au.piano(3 + (this.items % 6), 0.1); r.nextAt = r.t + r.spec.gap; }
            else this.errors++;
          },
          auto(dt, now) {
            const r = this.round;
            if (!r) return;
            if (r.phase === 'choose' && r.t >= r.autoAt) {
              const p = profile(), hard = p === 'good_day' ? true : p === 'bad_day' ? false : r.reward === 3;
              this.down(r.hardSide * (hard ? 1 : -1) * 0.3 + 0.5, 0.5, now);
            }
            const c = r.lights[r.cur];
            if (r.phase === 'path' && c && !c.on && !c.gone && r.t >= r.autoTap) this.down(c.p[0] + (R() - 0.5) * 0.02, c.p[1], now);
          },
          draw(ctx, b, now) {
            const r = this.round;
            if (!r) return;
            const X = u => b.x + u * b.w, Y = v => b.y + v * b.h, k = Math.min(b.w, b.h);
            const sel = side => r.phase === 'choose' ? 1 : (r.path === 'hard') === (side === r.hardSide) ? 1 : 0.25;
            for (const side of [-1, 1]) {
              const hard = side === r.hardSide, a = sel(side) * (r.phase === 'reward' && !(r.path === 'hard') === hard ? 0.6 : 1);
              const pts = pathPts(side, hard);
              ctx.save();
              const grd = ctx.createLinearGradient(0, Y(hard ? 0.1 : 0.55), 0, Y(0.95));
              grd.addColorStop(0, rgb(VIOLET, 0.75 * a)); grd.addColorStop(0.6, rgb(VIOLET, 0.32 * a)); grd.addColorStop(1, rgb(DEEP, 0.1 * a));
              ctx.fillStyle = grd;
              ctx.beginPath();
              if (hard) {
                ctx.moveTo(X(0.5 + side * 0.0), Y(0.97)); ctx.lineTo(X(0.5 + side * 0.17), Y(0.45)); ctx.lineTo(X(0.5 + side * 0.22), Y(0.38));
                ctx.lineTo(X(0.5 + side * 0.28), Y(0.07)); ctx.lineTo(X(0.5 + side * 0.36), Y(0.24)); ctx.lineTo(X(0.5 + side * 0.41), Y(0.3)); ctx.lineTo(X(0.5 + side * 0.56), Y(0.97));
              } else { ctx.moveTo(X(0.5 + side * 0.02), Y(0.97)); ctx.bezierCurveTo(X(0.5 + side * 0.2), Y(0.62), X(0.5 + side * 0.34), Y(0.52), X(0.5 + side * 0.56), Y(0.66)); ctx.lineTo(X(0.5 + side * 0.56), Y(0.97)); }
              ctx.closePath(); ctx.fill();
              if (hard) {
                ctx.fillStyle = rgb(SILVER, 0.55 * a);
                ctx.beginPath(); ctx.moveTo(X(0.5 + side * 0.28), Y(0.07)); ctx.lineTo(X(0.5 + side * 0.325), Y(0.165)); ctx.lineTo(X(0.5 + side * 0.3), Y(0.15)); ctx.lineTo(X(0.5 + side * 0.28), Y(0.18)); ctx.lineTo(X(0.5 + side * 0.255), Y(0.15)); ctx.lineTo(X(0.5 + side * 0.24), Y(0.16)); ctx.closePath(); ctx.fill();
              } else {
                ctx.strokeStyle = rgb(SILVER, 0.22 * a); ctx.lineWidth = 1.5;
                ctx.beginPath(); ctx.moveTo(X(0.5 + side * 0.12), Y(0.74)); ctx.bezierCurveTo(X(0.5 + side * 0.24), Y(0.6), X(0.5 + side * 0.36), Y(0.53), X(0.5 + side * 0.56), Y(0.66)); ctx.stroke();
              }
              ctx.strokeStyle = rgb(FLAME, 0.4 * a); ctx.lineWidth = 2; ctx.setLineDash([1.5, 7]); ctx.lineCap = 'round';
              ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(X(p[0]), Y(p[1])) : ctx.moveTo(X(p[0]), Y(p[1]))); ctx.stroke();
              ctx.setLineDash([]); ctx.restore();
              const n = hard ? FORK_HARD.lights : FORK_EASY.lights, active = r.phase !== 'choose' && (r.path === 'hard') === hard;
              if (!active) for (let i = 0; i < n; i++) { const p = along(pts, (i + 1) / n); glow(ctx, X(p[0]), Y(p[1]), 8, FLAME, 0.45 * a); ctx.fillStyle = rgb(FLAME, 0.6 * a); ctx.beginPath(); ctx.arc(X(p[0]), Y(p[1]), 1.6, 0, 6.28); ctx.fill(); }
              const end = pts[pts.length - 1], m = hard ? r.reward : 1, gone = r.phase === 'reward' && active;
              for (let i = 0; i < m && !gone; i++) {
                const ox = (i - (m - 1) / 2) * k * 0.075, bob = calm() ? 0 : 2 * Math.sin(now * 2 + i);
                const ox2 = X(end[0]) + ox, oy = Y(end[1]) - k * 0.075 + bob;
                glow(ctx, ox2, oy, k * 0.085, WARM, (0.7 + 0.2 * Math.sin(now * 3 + i)) * a);
                glow(ctx, ox2, oy, k * 0.03, GLOW, 0.9 * a);
                ctx.fillStyle = rgb(WHITE, 0.95 * a); ctx.beginPath(); ctx.arc(ox2, oy, k * 0.011, 0, 6.28); ctx.fill();
              }
            }
            lantern(ctx, X(0.5), Y(0.885), k * 0.075, WARM, 0.9, now, 3);
            if (r.phase === 'path' || r.phase === 'reward') {
              r.lights.forEach((l, i) => {
                const x = X(l.p[0]), y = Y(l.p[1]);
                if (l.on) glow(ctx, x, y, 12, WARM, 0.85);
                else if (l.gone) glow(ctx, x, y, 8, FLAME, 0.12);
                else if (i === r.cur) {
                  const age = r.t - l.born, pulse = calm() ? 0.9 : 0.75 + 0.25 * Math.sin(age * 9);
                  glow(ctx, x, y, k * r.spec.hit * 1.1 * ease(age / 0.2), GLOW, pulse);
                  ctx.fillStyle = rgb(WHITE, 0.9); ctx.beginPath(); ctx.arc(x, y, 4, 0, 6.28); ctx.fill();
                } else glow(ctx, x, y, 7, FLAME, 0.22);
              });
            }
            const landed = this.sparks.filter(s => now - s.born < 0.9).length;
            for (const s of this.sparks) {
              const p = clamp((now - s.born) / 0.9, 0, 1);
              if (p <= 0 || p >= 1) continue;
              const hard = r.path === 'hard', end = pathPts(hard ? r.hardSide : -r.hardSide, hard).pop();
              const tx = b.x + b.w * (0.5 + (this.glows - s.n + s.k - (this.glows - 1) / 2) * 0.07), ty = Y(0.93);
              const ox = (s.k - (s.n - 1) / 2) * k * 0.075, sx = X(end[0]) + ox, sy = Y(end[1]) - k * 0.07;
              glow(ctx, lerp(sx, tx, ease(p)), lerp(sy, ty, ease(p)) - Math.sin(p * Math.PI) * 30, 14, WARM, 1 - 0.3 * p);
            }
            tray(ctx, b, this.glows - landed);
          },
        });
        return g;
      },
    },

    lanterns: {
      make() {
        const larger = [...Array(6).fill('rich'), ...Array(6).fill('lean')].sort(() => R() - 0.5);
        const pick = (type, n) => { const idx = larger.map((x, i) => x === type ? i : -1).filter(i => i >= 0).sort(() => R() - 0.5); return new Set(idx.slice(0, n)); };
        const sched = { rich: pick('rich', 3), lean: pick('lean', 1) };
        const bias = { good_day: 0.15, live: 0.08, bad_day: 0 }[profile()] ?? 0.08;
        return base('lanterns', 60, {
          kind: 'measurement', larger, sched, pending: { rich: 0, lean: 0 }, trials: [], i: -1, tr: null, rewards: { rich: 0, lean: 0 }, sparks: [], bar: () => null,
          next(now) {
            this.i++;
            if (this.i >= 12) { finish(this, now); this.tr = null; return; }
            const L = this.larger[this.i];
            if (this.sched[L].has(this.i)) this.pending[L]++;
            this.tr = { L, richSide: R() < 0.5 ? 'left' : 'right', t: 0, phase: 'ready', resp: null, autoAt: null };
          },
          update(dt, now) {
            if (!this.tr && this.i < 12) this.next(now);
            const tr = this.tr;
            if (!tr) return;
            tr.t += dt;
            this.sparks = this.sparks.filter(s => now - s.born < 1);
            if (tr.phase === 'ready' && tr.t >= 0.32) { tr.phase = 'cue'; tr.cueT = tr.t; tr.autoAt = tr.t + (profile() === 'bad_day' ? 0.75 + R() * 0.45 : 0.55 + R() * 0.4); }
            if (tr.phase === 'cue' && tr.t - tr.cueT >= 2.6) this.respond(null, now);
            if (tr.phase === 'fb' && tr.t - tr.fbT >= (tr.rewarded ? 0.75 : 0.4)) this.next(now);
          },
          respond(side, now) {
            const tr = this.tr, resp = side === null ? null : side === tr.richSide ? 'rich' : 'lean';
            const correct = resp !== null && resp === tr.L;
            let rewarded = false;
            if (correct && this.pending[resp] > 0) { this.pending[resp]--; this.rewards[resp]++; rewarded = true; }
            this.trials.push({ trial: this.i + 1, larger: tr.L, rich_side: tr.richSide, response: resp, correct, rewarded, rt_ms: resp === null ? null : Math.round((tr.t - tr.cueT) * 1000) });
            if (resp !== null) this.items++;
            Object.assign(tr, { phase: 'fb', fbT: tr.t, resp: side, rewarded });
            if (rewarded) {
              this.sparks.push({ born: now, side });
              Au.piano(8, 0.16);
              A.session?.kick(0.6);
            } else if (resp !== null) Au.piano(2, 0.06);
          },
          down(u, v, now) {
            const tr = this.tr;
            if (!tr || tr.phase !== 'cue' || v < 0.12 || v > 0.86) return;
            this.respond(u < 0.5 ? 'left' : 'right', now);
          },
          auto(dt, now) {
            const tr = this.tr;
            if (!tr || tr.phase !== 'cue' || tr.t < tr.autoAt) return;
            const pc = tr.L === 'rich' ? 0.8 + bias : 0.8 - bias, resp = R() < pc ? tr.L : tr.L === 'rich' ? 'lean' : 'rich';
            this.down((resp === 'rich') === (tr.richSide === 'left') ? 0.3 : 0.7, 0.5, now);
          },
          counts() {
            const c = { rc: 0, ri: 0, lc: 0, li: 0 };
            for (const t of this.trials) {
              if (t.response === null) continue;
              if (t.larger === 'rich') t.correct ? c.rc++ : c.ri++;
              else t.correct ? c.lc++ : c.li++;
            }
            return c;
          },
          draw(ctx, b, now) {
            const tr = this.tr, X = u => b.x + u * b.w, Y = v => b.y + v * b.h, s0 = Math.min(b.w * 0.2, b.h * 0.3);
            for (const side of ['left', 'right']) {
              const rich = tr ? (tr.richSide === side) : side === 'left', c = rich ? WARM : SILVER;
              let scale = 1, a = 0.5;
              if (tr) {
                const isLarger = (tr.L === 'rich') === rich;
                if (tr.phase === 'ready') a = 0.4 + 0.15 * ease(tr.t / 0.32);
                if (tr.phase === 'cue') {
                  const ct = tr.t - tr.cueT, on = ct < 0.4;
                  a = on ? 1 : 0.6 + (calm() ? 0 : 0.08 * Math.sin(now * 3));
                  if (on && isLarger) scale = 1.08;
                }
                if (tr.phase === 'fb') {
                  const ft = tr.t - tr.fbT, chosen = tr.resp === side;
                  a = chosen ? (tr.rewarded ? 1.25 - 0.3 * ease(ft / 0.75) : 0.85 - 0.3 * ease(ft / 0.4)) : 0.35;
                }
              }
              lantern(ctx, X(side === 'left' ? 0.3 : 0.7), Y(0.47), s0 * scale, c, a, now, side === 'left' ? 1 : 4);
            }
            for (const sp of this.sparks) {
              const p = clamp((now - sp.born) / 0.85, 0, 1), sx = X(sp.side === 'left' ? 0.3 : 0.7);
              glow(ctx, sx, Y(0.47), s0 * (1.2 + 1.5 * ease(p)), WARM, 0.5 * (1 - p));
              for (let k = 0; k < 6; k++) glow(ctx, sx + Math.sin(k * 2.1) * s0 * 0.6 * p, Y(0.4) - p * s0 * (0.8 + 0.25 * k), 5, GLOW, 1 - p);
            }
            const done = this.trials.length;
            for (let i = 0; i < 12; i++) glow(ctx, b.x + b.w * (0.5 + (i - 5.5) * 0.045), b.y + b.h * 0.93, 5, FLAME, i < done ? 0.75 : 0.12);
          },
        });
      },
    },
  };
})();
