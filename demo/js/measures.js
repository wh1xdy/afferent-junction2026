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
      const v = { good_day: 4, bad_day: 1, live: 3 }[profile()];
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
            A.present('fork', this, 'round', { i }, A.now());
          },
          choose(path, now) {
            const r = this.round, hard = path === 'hard';
            r.path = path; r.spec = hard ? FORK_HARD : FORK_EASY; r.phase = 'path'; r.decisionMs = path === 'none' ? null : Math.round(r.t * 1000); r.pathAt = r.t;
            const pts = pathPts(hard ? r.hardSide : -r.hardSide, hard);
            r.lights = path === 'none' ? [] : Array.from({ length: r.spec.lights }, (_, k) => ({ p: along(pts, (k + 1) / r.spec.lights), on: null, born: null, gone: false }));
            r.nextAt = r.t + 0.35;
            A.present('fork', this, 'choose', { path, hard }, now);
          },
          update(dt, now) {
            if (!this.round) this.start(0);
            const r = this.round;
            r.t += dt;
            if (r.phase === 'choose' && r.t >= 6) this.choose('none', now);
            if (r.phase === 'path') {
              const L = r.lights, c = L[r.cur];
              if (c && !c.on && !c.gone && r.t - c.born > r.spec.life) { c.gone = true; this.errors++; r.nextAt = r.t + r.spec.gap; A.present('fork', this, 'expire', { light: c }, now); }
              if ((!c || c.on || c.gone) && r.t >= r.nextAt) {
                if (r.cur < L.length - 1) { r.cur++; L[r.cur].born = r.t; A.present('fork', this, 'light', { light: L[r.cur], i: r.cur + 1, n: L.length }, now); r.autoTap = r.t + (profile() === 'bad_day' ? 0.5 + R() * 0.3 : 0.32 + R() * 0.2); }
                else this.reward(now);
              }
            }
            if (r.phase === 'reward' && r.t - r.rewardAt > 1.1) {
              if (r.i === 0 && r.path !== 'none') this.start(1); else finish(this, now);
            }
          },
          reward(now) {
            const r = this.round, got = r.path === 'hard' ? r.reward : 1, done = r.lights.every(l => l.on);
            r.phase = 'reward'; r.rewardAt = r.t;
            this.choices.push({ choice: r.i + 1, path: r.path, reward: r.reward, decision_ms: r.decisionMs, completed: done, task_ms: Math.round((r.t - r.pathAt) * 1000), hard_side: r.hardSide < 0 ? 'left' : 'right' });
            this.glows += got;
            A.present('fork', this, 'reward', { got, done }, now);
          },
          down(u, v, now) {
            const r = this.round;
            if (!r) return;
            if (r.phase === 'choose') { this.choose((u < 0.5 ? -1 : 1) === r.hardSide ? 'hard' : 'easy', now); return; }
            if (r.phase !== 'path') return;
            const c = r.lights[r.cur];
            if (c && !c.on && !c.gone && dist(c.p[0], c.p[1], u, v) < r.spec.hit) { c.on = r.t; this.items++; r.nextAt = r.t + r.spec.gap; A.present('fork', this, 'hit', { light: c, i: r.cur + 1, n: r.lights.length }, now); }
            else { this.errors++; A.present('fork', this, 'miss', { u, v }, now); }
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
          draw(ctx, b, now) { A.PRESENT.fork?.draw?.(this, ctx, b, now); },
        });
        A.present('fork', g, 'init');
        return g;
      },
    },

    lanterns: {
      make() {
        const larger = [...Array(6).fill('rich'), ...Array(6).fill('lean')].sort(() => R() - 0.5);
        const pick = (type, n) => { const idx = larger.map((x, i) => x === type ? i : -1).filter(i => i >= 0).sort(() => R() - 0.5); return new Set(idx.slice(0, n)); };
        const sched = { rich: pick('rich', 3), lean: pick('lean', 1) };
        const bias = { good_day: 0.15, live: 0.08, bad_day: -0.15 }[profile()] ?? 0.08;
        const g = base('lanterns', 60, {
          kind: 'measurement', larger, sched, pending: { rich: 0, lean: 0 }, trials: [], i: -1, tr: null, rewards: { rich: 0, lean: 0 }, sparks: [], bar: () => null, missedRun: 0,
          next(now) {
            this.i++;
            if (this.i >= 12 || this.missedRun >= 3) { finish(this, now); this.tr = null; this.i = 12; return; }
            const L = this.larger[this.i];
            if (this.sched[L].has(this.i)) this.pending[L]++;
            this.tr = { L, richSide: R() < 0.5 ? 'left' : 'right', t: 0, phase: 'ready', resp: null, autoAt: null };
            A.present('lanterns', this, 'trial', { i: this.i }, now);
          },
          update(dt, now) {
            if (!this.tr && this.i < 12) this.next(now);
            const tr = this.tr;
            if (!tr) return;
            tr.t += dt;
            if (tr.phase === 'ready' && tr.t >= 0.32) { tr.phase = 'cue'; tr.cueT = tr.t; tr.autoAt = tr.t + (profile() === 'bad_day' ? 0.75 + R() * 0.45 : 0.55 + R() * 0.4); A.present('lanterns', this, 'cue', { tr }, now); }
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
            this.missedRun = resp === null ? this.missedRun + 1 : 0;
            Object.assign(tr, { phase: 'fb', fbT: tr.t, resp: side, rewarded });
            A.present('lanterns', this, 'respond', { side, resp, rewarded }, now);
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
          draw(ctx, b, now) { A.PRESENT.lanterns?.draw?.(this, ctx, b, now); },
        });
        A.present('lanterns', g, 'init');
        return g;
      },
    },
  };

  A.FORK = { FORK_EASY, FORK_HARD, pathPts, along };
})();
