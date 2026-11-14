(() => {
  const { clamp, lerp, rgb, mixc, median } = A;
  const J = A.J, { C, sprite, glow, unit, tapCue, base, finish, fx, hap, sfx, rm } = J;
  const E = J.ease, R = Math.random, ID = 'bells', ROUNDS = 3, COLS = 0.72, TAU = 6.283;
  const BELL = [
    { tint: C.amber, note: 3, hap: 'heavy', art: 0 },
    { tint: C.ice, note: 4, hap: 'medium', art: 1 },
    { tint: C.green, note: 7, hap: 'light', art: 2 },
  ];
  const DEEP = { tint: C.violet300, note: 0, hap: 'heavy', art: 0 };
  const TOWER = { lamp: 0.29, w0: 0.37, w1: 0.775, cx: 0.507, shaft: 0.16 };

  A.Skill?.define(ID, {
    tiers: [1, 2, 3],
    target: { v0: 4, v1: 7, int: true, cat: 'load' },
    gap: { v0: 0.5, v1: 0.26, geo: true, cat: 'tempo' },
    speedup: { steps: [[0, 0], [0.5, 0.08]], cat: 'tempo' },
    fourth: { steps: [[0, 0], [0.5, 1]], cat: 'load' },
    aid: { steps: [[0, 2], [0.25, 1], [0.6, 0]], cat: 'load' },
    judge: { steps: [[0, 0], [0.4, 1]], cat: 'load' },
  });
  const ax = (name, fb) => (A.Skill ? A.Skill.axis(ID, name, fb) : fb);

  const ART = (() => {
    let crops = null;
    const made = {};
    const scan = () => {
      if (crops !== null || !A.Art?.has('task_bells_trio')) return crops;
      const H = 240, W = Math.round(H * A.Art.aspect('task_bells_trio')), cv = document.createElement('canvas');
      cv.width = W; cv.height = H;
      const x = cv.getContext('2d', { willReadFrequently: true });
      A.Art.draw(x, 'task_bells_trio', 0, 0, W, H);
      const d = x.getImageData(0, 0, W, H).data, col = i => { let n = 0; for (let y = 0; y < H; y += 2) if (d[(y * W + i) * 4 + 3] > 24) n++; return n; };
      const runs = [];
      let s = -1;
      for (let i = 0; i <= W; i++) {
        const on = i < W && col(i) > 0;
        if (on && s < 0) s = i;
        if (!on && s >= 0) { if (i - s > W * 0.08) runs.push([s, i]); s = -1; }
      }
      if (runs.length !== 3) return (crops = false);
      crops = runs.map(([x0, x1]) => {
        let y0 = H, y1 = 0;
        for (let y = 0; y < H; y++) for (let i = x0; i < x1; i += 2) if (d[(y * W + i) * 4 + 3] > 24) { if (y < y0) y0 = y; if (y > y1) y1 = y; break; }
        const c = document.createElement('canvas');
        c.width = x1 - x0 + 4; c.height = y1 - y0 + 4;
        c.getContext('2d').drawImage(cv, x0 - 2, y0 - 2, c.width, c.height, 0, 0, c.width, c.height);
        return c;
      });
      return crops;
    };
    const proc = (tint, silver) => {
      const s = 60, W = Math.round(2.1 * s), H = Math.round(1.9 * s), c = document.createElement('canvas');
      c.width = W; c.height = H;
      const x = c.getContext('2d'), body = silver ? C.silver300 : tint;
      x.translate(W / 2, 0.36 * s);
      x.fillStyle = rgb(mixc(C.amberDeep, C.night950, 0.55)); x.beginPath(); x.roundRect(-0.12 * s, -0.36 * s, 0.24 * s, 0.34 * s, 0.06 * s); x.fill();
      x.strokeStyle = rgb(mixc(body, C.night900, 0.45)); x.lineWidth = 0.07 * s; x.beginPath(); x.arc(0, -0.02 * s, 0.13 * s, Math.PI, 0); x.stroke();
      x.beginPath();
      x.moveTo(-s * 0.3, 0); x.quadraticCurveTo(-s * 0.48, s * 0.02, -s * 0.52, s * 0.35);
      x.quadraticCurveTo(-s * 0.58, s * 0.95, -s * 0.98, s * 1.28);
      x.quadraticCurveTo(0, s * 1.42, s * 0.98, s * 1.28);
      x.quadraticCurveTo(s * 0.58, s * 0.95, s * 0.52, s * 0.35);
      x.quadraticCurveTo(s * 0.48, s * 0.02, s * 0.3, 0); x.closePath();
      const bg = x.createLinearGradient(-s, 0, s, 0);
      bg.addColorStop(0, rgb(mixc(body, C.night950, 0.55))); bg.addColorStop(0.3, rgb(mixc(body, C.silver050, 0.25)));
      bg.addColorStop(0.6, rgb(mixc(body, C.night900, 0.2))); bg.addColorStop(1, rgb(mixc(body, C.night950, 0.7)));
      x.fillStyle = bg; x.fill();
      x.strokeStyle = rgb(C.silver050, 0.35); x.lineWidth = 0.05 * s; x.lineCap = 'round';
      x.beginPath(); x.moveTo(-s * 0.36, s * 0.22); x.quadraticCurveTo(-s * 0.44, s * 0.8, -s * 0.66, s * 1.12); x.stroke();
      x.fillStyle = rgb(mixc(body, C.night950, 0.35)); x.beginPath(); x.ellipse(0, s * 1.3, s * 1.0, s * 0.11, 0, 0, TAU); x.fill();
      x.fillStyle = rgb(C.night950, 0.8); x.beginPath(); x.ellipse(0, s * 1.33, s * 0.84, s * 0.06, 0, 0, TAU); x.fill();
      x.fillStyle = rgb(mixc(body, C.night950, 0.6)); x.beginPath(); x.arc(0, s * 1.42, s * 0.13, 0, TAU); x.fill();
      return c;
    };
    const tinted = (src, tint, silver) => {
      const c = document.createElement('canvas');
      c.width = src.width; c.height = src.height;
      const x = c.getContext('2d');
      x.drawImage(src, 0, 0);
      x.globalCompositeOperation = 'color'; x.fillStyle = rgb(silver ? C.silver300 : tint, silver ? 1 : 0.85); x.fillRect(0, 0, c.width, c.height);
      x.globalCompositeOperation = 'destination-in'; x.drawImage(src, 0, 0);
      return c;
    };
    return {
      bell(spec, silver) {
        const cr = scan(), key = `${cr ? 'a' : 'p'}${spec.art}|${spec.tint.join()}|${silver ? 1 : 0}`;
        if (made[key]) return made[key];
        return (made[key] = cr ? tinted(cr[spec.art], spec.tint, silver) : proc(spec.tint, silver));
      },
    };
  })();

  const shuffleSeq = (n, nb) => {
    const out = [];
    let bag = [];
    while (out.length < n) {
      if (!bag.length) bag = Array.from({ length: nb }, (_, i) => i).sort(() => R() - 0.5);
      const pick = bag.pop(), m = out.length;
      if (m >= 2 && out[m - 1] === pick && out[m - 2] === pick) { bag.unshift(pick); continue; }
      out.push(pick);
    }
    return out;
  };

  A.defineTask(ID, {
    modes: ['wake', 'fatigue'], role: 'Simon; Peggle per-hit pitch build',
    make(k) {
      const target = clamp(ax('target', 4 + Math.round(3 * k)), 2, 7);
      const nb = ax('fourth', k > 0.5 ? 1 : 0) ? 4 : 3, specs = nb === 4 ? [DEEP, ...BELL] : BELL;
      const g = base(ID, Math.min(22, 12 + 1.4 * target), {
        outro: 1.9, nb, target, target0: target, seq: shuffleSeq(7, nb), round: 0, len: 2, phase: 'intro', touched: false,
        input: [], taps: [], noteI: 0, noteAt: 0, gapR: 0.5, echoAt: 0, nextAt: 0, attempt: 0, replayed: false, shortened: false, eyesRep: 0, bright: false,
        closedN: 0, showN: 0, aid: 1, judge: 0, tier: 0, light: 0, lightShare: 0, fever: false, lastGrade: null,
        bells: specs.map((s, i) => ({ ...s, i, rungAt: -9, swing: 0, litAt: -9, lit: 0, wrongAt: -9, glintAt: -9, colAt: -9, chordAt: -9 })),
        wins: Array.from({ length: 7 }, () => ({ v: 0, on: 0, peakAt: -9, frame: 0 })),
        comets: [], events: [], wash: { x: 0, v: 0 }, washTo: 0, lamp: 0, lampAt: -9, payAt: -9, beamAt: -9, roundAt: -9, zoom: null,
        log: { rounds: 0, echo_ms: [], iv: [], replays: 0, eyes: 0, gaps: [] }, bot: null, L: null,

        lay(b) {
          if (this.L && this.L.bw === b.w && this.L.bh === b.h && this.L.bx === b.x && this.L.by === b.y) return this.L;
          const art = !!A.Art?.has('task_bells_tower'), th = b.h * 0.97, tw = th * (art ? A.Art.aspect('task_bells_tower') : 0.5);
          const tcx = b.x + b.w * 0.86, tx = tcx - tw * TOWER.cx, ty = b.y + b.h * 0.02;
          const sx = tx + tw * TOWER.cx, cw = b.w * COLS / nb, U = unit(b);
          const SF = nb === 4 ? [1, 0.9, 0.78, 0.66] : [1, 0.84, 0.7], STRAP = nb === 4 ? [0.13, 0.1, 0.07, 0.04] : [0.11, 0.075, 0.04];
          const beamY = b.y + b.h * 0.25, bw0 = Math.min(cw * 1.08, b.h * 0.25);
          const bells = this.bells.map((bl, i) => {
            const img = ART.bell(bl, false), w = bw0 * SF[i], h = w * img.height / img.width, px = b.x + (i + 0.5) * cw, top = beamY + b.h * STRAP[i];
            return { px, py: beamY, top, w, h, cx: px, cy: top + h * 0.55, crown: top + h * 0.3, mouth: top + h * 0.86 };
          });
          const n = this.target0, y0 = ty + th * TOWER.w0, y1 = ty + th * TOWER.w1, pitch = (y1 - y0) / Math.max(n, 4);
          const ww = Math.min(tw * TOWER.shaft * 1.05, 30 * U), wh = Math.min(pitch * 0.62, 18 * U);
          const wins = Array.from({ length: 7 }, (_, i) => ({ x: sx, y: y1 - pitch * (i + 0.5) }));
          return (this.L = { bw: b.w, bh: b.h, bx: b.x, by: b.y, U, art, th, tw, tx, ty, sx, cw, beamY, ground: b.y + b.h * 0.86, bells, wins, ww, wh, pitch, y0, y1, lamp: [sx, ty + th * TOWER.lamp], post: b.x + b.w * 0.012, beamEnd: sx - tw * 0.09 });
        },
        box() { return A.session?.box?.() || { x: 27, y: 101, w: 335, h: 388 }; },

        lenFor(r) { return Math.max(2, this.items, Math.min(7, this.target - (ROUNDS - 1) + r)); },

        startRound(now, lead) {
          if (A.Skill?.progress(ID, this.round, ROUNDS)) J.stinger();
          this.len = this.lenFor(this.round);
          const su = ax('speedup', k > 0.5 ? 0.08 : 0);
          this.gapR = Math.min(ax('gap', lerp(0.5, 0.36, k)) * Math.pow(1 - su, this.round), 2.2 / this.len);
          this.aid = ax('aid', k < 0.25 ? 2 : k < 0.6 ? 1 : 0);
          this.judge = ax('judge', k >= 0.4 ? 1 : 0);
          this.attempt = 0; this.replayed = false; this.shortened = false; this.eyesRep = 0;
          this.log.gaps.push(Math.round(this.gapR * 1000));
          this.writeExtra();
          this.show(now, lead, false);
        },

        show(now, lead, bright) {
          this.phase = 'show'; this.attempt++; this.input = []; this.taps = []; this.noteI = 0; this.noteAt = now + lead; this.bright = bright;
          this.closedN = 0; this.showN = 0; this.bot = null;
          this.len = this.lenFor(this.round);
          for (const w of this.wins) w.on = 0;
          this.washTo = 0.1 * this.tier;
        },

        playNote(i) {
          const bl = this.bells[this.seq[i]], L = this.lay(this.box()), at = J.at;
          bl.rungAt = at; bl.litAt = at; bl.swing = 0.6;
          const dur = clamp(this.gapR * 0.75, 0.16, 0.3);
          this.comet(L.bells[bl.i], L.wins[i], bl.tint, dur, this.bright ? 1.5 : 1, () => { const w = this.wins[i]; w.on = this.phase === 'echo' ? this.floor : 0.62; w.peakAt = J.at; });
          if (this.bright) hap('heavy');
          sfx('bells_show', { bell: bl.i, pos: i, piano: [bl.note, 0.16] });
        },

        comet(from, to, c, dur, gain, arrive, final) {
          const ctrl = [lerp(from.cx, to.x, 0.35), Math.min(from.crown, to.y) - 40 * this.lay(this.box()).U];
          this.comets.push({ x0: from.cx, y0: from.crown, x1: to.x, y1: to.y, cx: ctrl[0], cy: ctrl[1], t0: J.at, dur: rm() ? Math.max(dur, 0.25) : dur, c, gain, arrive, final, done: false });
        },

        beginEcho(now) {
          if (this.showN > 10 && this.closedN / this.showN >= 0.8 && this.eyesRep < 1) {
            this.eyesRep++; this.log.eyes++;
            this.show(now, 0.5, true);
            return;
          }
          this.phase = 'echo'; this.echoAt = now;
          this.rt?.cue(`${this.round}.${this.attempt}`, 'choice', now);
          this.floor = [0, 0.1, 0.3][this.aid];
          for (let i = 0; i < 7; i++) this.wins[i].on = i < this.len ? this.floor : 0;
        },

        update(dt, now) {
          this.tick(dt);
          if (this.done) return;
          if (this.phase === 'intro') { this.startRound(now, 0.25); return; }
          if (this.phase === 'show') {
            this.showN++; if (A.Eyes?.closed) this.closedN++;
            while (this.noteI < this.len && now >= this.noteAt + this.noteI * this.gapR) this.playNote(this.noteI++);
            if (this.noteI >= this.len && now >= this.noteAt + (this.len - 1) * this.gapR + 0.12) this.beginEcho(now);
          } else if (this.phase === 'wait' && now >= this.nextAt) this.show(now, 0.3, false);
          else if (this.phase === 'between' && now >= this.nextAt) { this.round++; this.startRound(now, 0.2); }
        },

        outroUpdate(dt) { this.tick(dt); },

        tick(dt) {
          const at = J.at, ds = dt * (J.timeScale ?? 1);
          const down = [2.2, 1.6, 4.5][this.aid] * (this.phase === 'echo' ? 1 : 2);
          for (const w of this.wins) w.v = w.v < w.on ? Math.min(w.on, w.v + ds * 6) : Math.max(w.on, w.v - ds * down);
          for (const w of this.wins.slice(0, this.target)) w.frame = Math.min(1, w.frame + ds * 3);
          for (const w of this.wins.slice(this.target)) w.frame = Math.max(0, w.frame - ds * 2);
          for (const c of this.comets) if (!c.done && at - c.t0 >= c.dur) { c.done = true; c.arrive?.(); }
          this.comets = this.comets.filter(c => !c.done || at - c.t0 < c.dur + 0.15);
          for (const e of this.events) if (!e.fired && at >= e.at) { e.fired = true; e.fn(); }
          this.events = this.events.filter(e => !e.fired);
          J.spring(this.wash, this.washTo, 2.2, 0.9, ds);
          if (this.lampAt > 0) this.lamp = Math.min(1, this.lamp + ds * 1.6);
        },

        down(u, v, t, d) {
          this.lastIn = this.t; this.touched = true;
          if (this.done || v < -0.06 || v > 1.1 || u < -0.03 || u > COLS + 0.03) return;
          const i = clamp(Math.floor(u / COLS * this.nb), 0, this.nb - 1), bl = this.bells[i];
          bl.colAt = J.at;
          if (this.phase !== 'echo') { bl.glintAt = J.at; return; }
          this.strike(i, d?.ts ?? t, t);
        },

        strike(i, ts, now) {
          const pos = this.input.length, bl = this.bells[i], L = this.lay(this.box()), at = J.at;
          if (!pos) this.rt?.[i === this.seq[0] ? 'hit' : 'drop'](`${this.round}.${this.attempt}`, ts);
          if (i !== this.seq[pos]) {
            this.errors++; this.log.replays++; this.replayed = true;
            bl.wrongAt = at; bl.rungAt = at; bl.swing = 0.25;
            hap('tick'); sfx('bells_tok', { bell: i });
            if (this.errors % 2 === 0 && this.target > 2) { this.target--; this.shortened = true; }
            this.phase = 'wait'; this.nextAt = now + 0.6;
            return;
          }
          this.input.push(i);
          if (this.taps.length) this.log.iv.push(ts - this.taps[this.taps.length - 1]);
          this.taps.push(ts);
          const last = this.input.length === this.len, final = last && this.round >= ROUNDS - 1;
          const grade = last ? this.grade() : null, half = grade === 'barely' ? 0.5 : 1;
          bl.rungAt = at; bl.litAt = at; bl.swing = grade === 'barely' ? 0.5 : 1;
          const w = L.wins[pos], sparks = Math.round(Math.min(18, 6 + 3 * pos) * half);
          J.bloom(L.bells[i].cx, L.bells[i].cy, L.bells[i].w * (0.9 + 0.12 * pos), bl.tint, 0.35 + 0.05 * pos);
          fx.burst(L.bells[i].cx, L.bells[i].mouth, Math.round(sparks * 0.5), mixc(bl.tint, C.silver050, 0.3), 140, { kind: 'spark', size: [4, 1] });
          this.washTo = Math.max(this.washTo, (pos + 1) / Math.max(this.target0, 4) * 0.85 + 0.08 * this.tier);
          if (final) {
            this.payoff(now, i, pos, grade);
          } else {
            this.comet(L.bells[i], w, bl.tint, 0.22, 1 + 0.1 * pos, () => {
              const win = this.wins[pos];
              win.on = 0.92; win.peakAt = J.at;
              fx.burst(w.x, w.y, sparks, bl.tint, 110 + 10 * pos, { size: [3, 0.8] });
              if (grade === 'perfect') fx.add({ x: w.x, y: w.y, kind: 'spark', c: C.silver050, life: 0.45, size: [L.ww * 0.9, 2], alpha: [0.9, 0] });
            });
            hap.seq(pos >= 2 ? [[bl.hap, 0], ['tick', 45]] : [[bl.hap, 0]]);
          }
          sfx('bells_ring', { bell: i, pos, piano: [bl.note, grade === 'barely' ? 0.12 : 0.2] });
          if (pos >= 1) sfx('bells_harmony', { pos, piano: [bl.note + 2 + pos, 0.07 + 0.01 * pos] });
          if (last) this.roundDone(now, grade);
        },

        grade() {
          if (this.shortened) return 'miss';
          if (this.replayed) return 'barely';
          if (!this.judge) return 'perfect';
          const ivs = this.taps.slice(1).map((x, j) => x - this.taps[j]);
          return ivs.every(x => Math.abs(x - this.gapR) <= 0.3 * this.gapR) ? 'perfect' : 'good';
        },

        roundDone(now, grade) {
          this.items = Math.max(this.items, this.len);
          this.log.rounds++; this.log.echo_ms.push(Math.round((now - this.echoAt) * 1000));
          const r = A.Skill?.trial(ID, grade);
          this.lastGrade = grade;
          if (r) { this.tier = r.tier; this.lightShare = r.light; if (r.fever) this.fever = true; }
          else { this.tier = grade === 'perfect' || grade === 'good' ? this.tier + 1 : grade === 'miss' ? Math.max(0, this.tier - 1) : this.tier; this.lightShare = Math.min(1, this.items / this.target0); this.fever = this.tier >= 3; }
          if (grade === 'perfect') hap.seq([['tick', 40]]);
          J.border(this.items / Math.max(1, this.target0));
          this.writeExtra();
          if (this.round >= ROUNDS - 1) return;
          this.roundAt = J.at;
          const at0 = J.at + 0.26;
          this.events.push({ at: at0, fn: () => { for (let j = 0; j < this.len; j++) { this.wins[j].on = 1; this.wins[j].peakAt = J.at + j * 0.03; } this.washTo = Math.min(1, this.washTo + 0.12); } });
          this.phase = 'between'; this.nextAt = now + 0.75;
        },

        payoff(now, i, pos, grade) {
          const L = this.lay(this.box()), bl = this.bells[i], w = L.wins[pos], share = this.lightShare, size = share >= 0.8 ? 1 : share >= 0.5 ? 0.75 : 0.55;
          finish(this, now);
          this.phase = 'pay'; this.payAt = J.at;
          J.hitstop(this, 120); J.slowmo(this, 0.3, 420);
          hap.seq([['heavy', 0], ['success', 420]]);
          this.comet(L.bells[i], { x: L.lamp[0], y: L.lamp[1] }, bl.tint, 0.36, 1.5, () => this.ignite(size), true);
          const fc = this.comets[this.comets.length - 1];
          fc.cx = lerp(L.bells[i].cx, w.x, 0.8); fc.cy = Math.min(L.bells[i].crown, w.y) - 30 * L.U;
          this.events.push({ at: J.at + 0.17, fn: () => { const win = this.wins[pos]; win.on = 1; win.peakAt = J.at; fx.burst(w.x, w.y, 12, bl.tint, 130, { size: [3, 0.8] }); } });
          this.zoom = { at: J.at };
          const chase = this.bells.map((_, j) => j), step = 0.35, t0 = J.at + 0.001;
          if (rm()) this.events.push({ at: t0, fn: () => { for (const b of this.bells) b.chordAt = J.at; } });
          else {
            chase.forEach((j, n) => this.events.push({ at: t0 + n * step, fn: () => {
              const b = this.bells[j], lb = L.bells[j];
              b.rungAt = b.litAt = J.at; b.swing = 0.7;
              fx.burst(lb.cx, lb.mouth, 8, mixc(b.tint, C.silver050, 0.3), 120, { kind: 'spark', size: [4, 1] });
              fx.rise(lb.cx, lb.crown, 4, b.tint);
              sfx('bells_flourish', { bell: j, piano: [b.note, 0.14] });
            } }));
            this.events.push({ at: t0 + chase.length * step, fn: () => { for (const b of this.bells) b.chordAt = J.at; sfx('bells_chord', { full: this.fever }); } });
          }
          this.writeExtra();
        },

        ignite(size) {
          const L = this.lay(this.box());
          this.lampAt = J.at; this.beamAt = J.at; this.washTo = 1;
          for (let j = 0; j < this.len; j++) { this.wins[j].on = 1; this.wins[j].peakAt = J.at + j * 0.04; }
          const { W, H } = J.size(), r = L.tw * 0.66 * size, gate = J.flash.request(Math.PI * r * r / (W * H), 0.6 * size);
          this.lampPeak = gate.ok ? clamp(gate.peak / 0.6, 0.25, 1) : 0.35;
          fx.rise(L.lamp[0], L.lamp[1], Math.round(14 * size), C.gold, { life: 1.4, vy: -50 });
          for (let j = 0; j < Math.round(10 * size); j++) fx.add({ x: L.lamp[0] + (R() - 0.5) * L.tw * 0.5, y: L.lamp[1] + R() * 20, vx: (R() - 0.5) * 30, vy: -20 - 30 * R(), life: 1.6 + R(), size: [2.4, 0.6], c: R() < 0.5 ? C.gold : C.glow, sway: [10, 2] });
          J.spill(0.3 + 0.5 * this.lightShare);
          this.paySize = size;
        },

        writeExtra() {
          const iv = this.log.iv.map(x => x * 1000);
          this.extra = {
            v: 2, n_bells: this.nb, target_start: this.target0, target_end: this.target, rounds_completed: this.log.rounds,
            echo_ms: [...this.log.echo_ms], median_inter_tap_ms: iv.length ? Math.round(median(iv)) : null, show_gap_ms: [...this.log.gaps],
            replays: this.log.replays, eyes_closed_replays: this.log.eyes,
          };
        },

        auto(dt, now) {
          if (this.phase !== 'echo') return;
          if (!this.bot || this.bot.attempt !== this.attempt || this.bot.round !== this.round) {
            const first = this.attempt === 1 + this.eyesRep, err = R() < (first ? 0.3 : 0.4) ? Math.floor(R() * this.len) : -1;
            this.bot = { attempt: this.attempt, round: this.round, err, tempo: R() < 0.25, nextAt: now + 0.35 + 0.25 * R() };
          }
          const B = this.bot;
          if (now < B.nextAt) return;
          B.nextAt = now + (B.tempo ? this.gapR * (0.85 + 0.3 * R()) : 0.45 + 0.2 * R());
          const pos = this.input.length, want = this.seq[pos];
          const i = pos === B.err ? (want + 1 + Math.floor(R() * (this.nb - 1))) % this.nb : want;
          if (pos === B.err) B.err = -1;
          this.bells[i].colAt = J.at;
          this.strike(i, now, now);
        },

        draw(ctx, b, at) {
          const L = this.lay(b), U = L.U, calm = rm();
          let z = 1, zx = 0, zy = 0;
          const fc = this.comets.find(c => c.final && !c.done);
          if (this.zoom && !calm && at - this.zoom.at < 0.9) {
            z = 1 + 0.06 * Math.sin(Math.PI * clamp((at - this.zoom.at) / 0.9, 0, 1));
            const p = fc ? this.cpos(fc, at) : L.lamp;
            zx = p[0]; zy = p[1];
          }
          ctx.save();
          if (z !== 1) { ctx.translate(zx, zy); ctx.scale(z, z); ctx.translate(-zx, -zy); }
          this.drawGround(ctx, b, L, at);
          this.drawTower(ctx, L, at);
          this.drawFrame(ctx, L);
          this.drawColumns(ctx, b, L, at);
          for (const bl of this.bells) this.drawBell(ctx, bl, L.bells[bl.i], L, at);
          for (const c of this.comets) this.drawComet(ctx, c, L, at);
          this.drawBeams(ctx, b, L, at);
          ctx.restore();
          if (this.round === 0 && this.phase === 'echo' && !this.touched && this.input.length === 0) {
            const wait = this.t - (this.echoAt - this.startAt);
            const lb = L.bells[this.seq[0]];
            tapCue(ctx, lb.cx, lb.cy + lb.h * 0.1, U, at, clamp((wait - 0.45) / 0.35, 0, 1));
          }
        },

        cpos(c, at) {
          const p = clamp((at - c.t0) / c.dur, 0, 1), e = c.final ? E.inOut(p) : E.outSoft(p), q = 1 - e;
          return [q * q * c.x0 + 2 * q * e * c.cx + e * e * c.x1, q * q * c.y0 + 2 * q * e * c.cy + e * e * c.y1, p];
        },

        drawGround(ctx, b, L, at) {
          const U = L.U, y = L.ground, x0 = b.x - b.w * 0.05, x1 = L.tx + L.tw * 0.45, yb = b.y + b.h * 1.04;
          const top = s => y + (Math.sin(s * 5.2 + 0.6) * 4 - 6 * Math.sin(Math.PI * s)) * U;
          const gr = ctx.createLinearGradient(0, y - 10 * U, 0, yb);
          gr.addColorStop(0, rgb(mixc(C.silver300, C.night700, 0.45))); gr.addColorStop(0.5, rgb(mixc(C.silver500, C.night800, 0.6), 0.8)); gr.addColorStop(1, rgb(C.night900, 0));
          ctx.fillStyle = gr;
          ctx.beginPath(); ctx.moveTo(x0, yb);
          for (let i = 0; i <= 16; i++) ctx.lineTo(lerp(x0, x1, i / 16), top(i / 16));
          ctx.lineTo(x1, yb); ctx.closePath(); ctx.fill();
          ctx.strokeStyle = rgb(C.silver100, 0.5); ctx.lineWidth = 1.6 * U; ctx.lineCap = 'round';
          ctx.beginPath();
          for (let i = 0; i <= 16; i++) i ? ctx.lineTo(lerp(x0, x1, i / 16), top(i / 16) + 0.8 * U) : ctx.moveTo(x0, top(0) + 0.8 * U);
          ctx.stroke();
          for (const bl of this.bells) {
            const lb = L.bells[bl.i], a = 0.05 + 0.35 * this.litOf(bl, at);
            sprite(ctx, 'soft', bl.tint, lb.cx, y + 2 * L.U, lb.w * 0.9, a, true, 1, 0.22);
          }
        },

        drawFrame(ctx, L) {
          const U = L.U, y = L.beamY, wood = C.wood;
          ctx.fillStyle = rgb(C.woodD);
          ctx.fillRect(L.post - 4 * U, y - 2 * U, 8 * U, L.ground - y + 6 * U);
          ctx.fillStyle = rgb(wood);
          ctx.beginPath(); ctx.roundRect(L.post - 8 * U, y - 7 * U, L.beamEnd - L.post + 8 * U, 11 * U, 2 * U); ctx.fill();
          ctx.fillStyle = rgb(C.woodL, 0.6); ctx.fillRect(L.post - 6 * U, y - 7 * U, L.beamEnd - L.post + 4 * U, 2 * U);
          ctx.fillStyle = rgb(C.silver100, 0.75);
          ctx.beginPath(); ctx.roundRect(L.post - 9 * U, y - 10 * U, L.beamEnd - L.post + 10 * U, 3.4 * U, 1.7 * U); ctx.fill();
        },

        drawTower(ctx, L, at) {
          const U = L.U, lit = Math.max(this.lamp, 0.3 * this.wash.x);
          if (!(L.art && A.Art.draw(ctx, 'task_bells_tower', L.tx, L.ty, L.tw, L.th, 1, 0.62 + 0.3 * lit))) this.procTower(ctx, L);
          const sw = L.tw * TOWER.shaft, wy = clamp(this.wash.x, 0, 1.2);
          if (wy > 0.01) {
            const top = lerp(L.y1 + L.pitch * 0.3, L.y0 - L.pitch * 0.5, Math.min(1, wy)), mid = (L.y1 + top) / 2;
            sprite(ctx, 'soft', mixc(C.glow, C.amber, 0.4), L.sx, mid, sw * 1.6, 0.16 + 0.22 * Math.min(1, wy), true, 1, (L.y1 - top) / (sw * 2.4) + 0.3);
          }
          ctx.fillStyle = rgb(C.night950, 0.92);
          ctx.beginPath(); ctx.roundRect(L.sx - L.ww / 2 - 4 * U, L.y0 - 2 * U, L.ww + 8 * U, L.y1 - L.y0 + 4 * U, 4 * U); ctx.fill();
          ctx.strokeStyle = rgb(C.woodL, 0.55); ctx.lineWidth = 1.4 * U; ctx.stroke();
          for (let i = 0; i < 7; i++) {
            const w = this.wins[i], p = L.wins[i];
            if (w.frame < 0.01 && w.v < 0.01) continue;
            const tint = this.bells[this.seq[i]].tint, peak = Math.max(0, 1 - (at - w.peakAt) / 0.35), v = clamp(w.v + 0.6 * peak, 0, 1.4);
            ctx.fillStyle = rgb(mixc(C.night800, C.night600, 0.5), 0.9 * w.frame);
            ctx.fillRect(p.x - L.ww / 2, p.y - L.wh / 2, L.ww, L.wh);
            if (v > 0.01) {
              ctx.fillStyle = rgb(mixc(tint, C.silver050, 0.25 * Math.min(1, v)), Math.min(1, v));
              ctx.fillRect(p.x - L.ww / 2, p.y - L.wh / 2, L.ww, L.wh);
              sprite(ctx, 'glow', tint, p.x, p.y, L.ww * (0.9 + 0.5 * peak), 0.5 * Math.min(1, v), true);
            }
            ctx.strokeStyle = rgb(C.woodD, w.frame); ctx.lineWidth = 1.2 * U;
            ctx.beginPath(); ctx.moveTo(p.x, p.y - L.wh / 2); ctx.lineTo(p.x, p.y + L.wh / 2); ctx.stroke();
          }
          const [lx, ly] = L.lamp, lr = L.tw * 0.11;
          sprite(ctx, 'glow', C.amber, lx, ly, lr * 2.2, 0.12 + 0.1 * Math.sin(at * TAU * 0.25), true);
          if (this.lamp > 0.01) {
            const a = E.outSoft(this.lamp);
            const fl = 1 + 0.04 * Math.sin(at * TAU * 0.5), ar = lr * 2.4 * a * fl;
            const pk = this.lampPeak ?? 1;
            sprite(ctx, 'glow', C.gold, lx, ly, lr * 6 * a, 0.55 * a * pk, true);
            if (A.Art?.has('task_bells_lamp_glow')) {
              const op = ctx.globalCompositeOperation; ctx.globalCompositeOperation = 'lighter';
              A.Art.draw(ctx, 'task_bells_lamp_glow', lx - ar, ly - ar, ar * 2, ar * 2, 1, 1, 0.75 * a * Math.max(0.5, pk));
              ctx.globalCompositeOperation = op;
            }
            sprite(ctx, 'soft', C.sun, lx, ly, lr * 1.5, a, true);
          }
        },

        procTower(ctx, L) {
          const { tx, ty, tw, th, U } = L, cx = L.sx, sw = tw * 0.34;
          ctx.fillStyle = rgb(C.stoneD);
          ctx.beginPath(); ctx.ellipse(cx, ty + th * 0.93, tw * 0.48, th * 0.07, 0, Math.PI, 0); ctx.fill();
          ctx.fillStyle = rgb(C.silver200, 0.7);
          ctx.beginPath(); ctx.ellipse(cx - tw * 0.1, ty + th * 0.87, tw * 0.3, th * 0.025, 0, Math.PI, 0); ctx.fill();
          ctx.fillStyle = rgb(C.wood);
          ctx.beginPath(); ctx.moveTo(cx - sw * 0.6, ty + th * 0.85); ctx.lineTo(cx - sw * 0.5, ty + th * 0.33); ctx.lineTo(cx + sw * 0.5, ty + th * 0.33); ctx.lineTo(cx + sw * 0.6, ty + th * 0.85); ctx.closePath(); ctx.fill();
          ctx.strokeStyle = rgb(C.woodD, 0.8); ctx.lineWidth = 1 * U;
          for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(cx + i * sw * 0.2, ty + th * 0.34); ctx.lineTo(cx + i * sw * 0.23, ty + th * 0.84); ctx.stroke(); }
          ctx.fillStyle = rgb(C.woodL);
          ctx.fillRect(cx - sw * 0.62, ty + th * 0.32, sw * 1.24, th * 0.015);
          ctx.fillStyle = rgb(C.wood); ctx.fillRect(cx - sw * 0.5, ty + th * 0.24, sw, th * 0.08);
          ctx.fillStyle = rgb(C.night950); ctx.beginPath(); ctx.roundRect(cx - sw * 0.2, ty + th * 0.255, sw * 0.4, th * 0.06, [sw * 0.2, sw * 0.2, 0, 0]); ctx.fill();
          ctx.fillStyle = rgb(C.woodD);
          ctx.beginPath(); ctx.moveTo(cx - sw * 0.62, ty + th * 0.245); ctx.lineTo(cx, ty + th * 0.08); ctx.lineTo(cx + sw * 0.62, ty + th * 0.245); ctx.closePath(); ctx.fill();
          ctx.fillStyle = rgb(C.silver100, 0.85);
          ctx.beginPath(); ctx.moveTo(cx - sw * 0.62, ty + th * 0.245); ctx.lineTo(cx - sw * 0.25, ty + th * 0.17); ctx.lineTo(cx + sw * 0.1, ty + th * 0.22); ctx.lineTo(cx + sw * 0.62, ty + th * 0.245); ctx.closePath(); ctx.fill();
          ctx.strokeStyle = rgb(C.woodD); ctx.lineWidth = 2 * U; ctx.beginPath(); ctx.moveTo(cx, ty + th * 0.08); ctx.lineTo(cx, ty + th * 0.02); ctx.stroke();
        },

        litOf(bl, at) {
          const ring = Math.exp(-Math.max(0, at - bl.litAt) * (this.phase === 'show' ? 5 : 3.2));
          const chord = bl.chordAt > 0 ? E.outSoft((at - bl.chordAt) / (rm() ? 0.8 : 0.3)) * 0.8 : 0;
          return Math.max(ring, chord, this.lamp > 0 && rm() ? 0.6 * this.lamp : 0);
        },

        drawColumns(ctx, b, L, at) {
          for (const bl of this.bells) {
            const age = at - bl.colAt;
            if (age < 0 || age > 0.35) continue;
            const a = 0.16 * (1 - age / 0.35), lb = L.bells[bl.i];
            sprite(ctx, 'soft', bl.tint, lb.px, b.y + b.h * 0.55, L.cw * 0.55, a, true, 1, b.h * 0.5 / (L.cw * 0.55));
          }
        },

        drawBell(ctx, bl, lb, L, at) {
          const calm = rm(), U = L.U, age = at - bl.rungAt, lit = this.litOf(bl, at);
          const echo = this.phase === 'echo', breathe = echo ? 0.06 + 0.06 * Math.sin(at * TAU * 0.25 + bl.i) : 0;
          const watch = this.phase === 'show' || this.phase === 'wait' || this.phase === 'between' ? 0.62 + 0.38 * lit : 1;
          const wrong = Math.max(0, 1 - (at - bl.wrongAt) / 0.45);
          let ang = 0;
          if (!calm && age >= 0) ang = 0.2 * bl.swing * Math.exp(-3.2 * age) * Math.sin(age * 13);
          const glint = Math.max(0, 1 - (at - bl.glintAt) / 0.3);
          if (!calm && glint > 0) ang += 0.02 * glint * Math.sin((at - bl.glintAt) * 40);
          const [sx, sy] = J.squash(age, bl.swing >= 1 ? 0.86 : 0.93, 0.24);
          sprite(ctx, 'glow', bl.tint, lb.cx, lb.cy, lb.w * (1.05 + 0.5 * lit), (0.08 + breathe + 0.55 * lit) * (1 - 0.6 * wrong), true);
          ctx.save();
          ctx.translate(lb.px, lb.py); ctx.rotate(ang);
          ctx.strokeStyle = rgb(mixc(C.woodL, C.silver300, 0.3), 0.85); ctx.lineWidth = 2 * U;
          ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, lb.top - lb.py + lb.h * 0.06); ctx.stroke();
          ctx.translate(0, lb.top - lb.py); ctx.scale(sx, sy);
          ctx.globalAlpha *= watch;
          const img = ART.bell(bl, false);
          ctx.drawImage(img, -lb.w / 2, 0, lb.w, lb.h);
          if (wrong > 0) { ctx.globalAlpha *= wrong * 0.75; ctx.drawImage(ART.bell(bl, true), -lb.w / 2, 0, lb.w, lb.h); ctx.globalAlpha /= wrong * 0.75 || 1; }
          if (lit + breathe > 0.02 && wrong < 0.5) {
            const op = ctx.globalCompositeOperation;
            ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha *= Math.min(1, 0.55 * lit + breathe);
            ctx.drawImage(img, -lb.w / 2, 0, lb.w, lb.h);
            ctx.globalCompositeOperation = op;
          }
          ctx.restore();
          if (glint > 0) sprite(ctx, 'spark', C.silver050, lb.cx + lb.w * 0.22, lb.cy - lb.h * 0.05, 7 * U, 0.7 * glint, true);
          if (!calm && age >= 0 && age < 0.12 && bl.swing >= 0.5) sprite(ctx, 'spark', mixc(bl.tint, C.silver050, 0.5), lb.cx + Math.sin(ang) * lb.h * 0.5, lb.mouth, 10 * U * (1 - age / 0.12), 0.9, true);
        },

        drawComet(ctx, c, L, at) {
          const U = L.U;
          if (c.done) {
            const q = (at - c.t0 - c.dur) / 0.15;
            sprite(ctx, 'glow', c.c, c.x1, c.y1, (14 + 10 * q) * U * c.gain, 0.6 * (1 - q), true);
            return;
          }
          if (rm()) {
            const p = clamp((at - c.t0) / c.dur, 0, 1);
            sprite(ctx, 'glow', c.c, c.x1, c.y1, 16 * U * c.gain, 0.6 * p, true);
            return;
          }
          const [x, y] = this.cpos(c, at);
          for (let j = 8; j >= 1; j--) {
            const [tx, ty] = this.cpos(c, at - j * c.dur * 0.06);
            sprite(ctx, 'mote', c.c, tx, ty, (9 - 0.8 * j) * U * c.gain, 0.6 * (1 - j / 9), true);
          }
          const [px, py] = this.cpos(c, at - 0.03), dir = Math.atan2(y - py, x - px);
          if (A.Art?.has('task_bells_comet') && (x !== px || y !== py)) {
            const h = 34 * U * c.gain, w = h * A.Art.aspect('task_bells_comet');
            ctx.save(); ctx.translate(x, y); ctx.rotate(dir + Math.PI / 2);
            const op = ctx.globalCompositeOperation; ctx.globalCompositeOperation = 'lighter';
            A.Art.draw(ctx, 'task_bells_comet', -w / 2, -h * 0.12, w, h, 1, 1, 0.7);
            ctx.globalCompositeOperation = op; ctx.restore();
          }
          sprite(ctx, 'glow', c.c, x, y, 24 * U * c.gain, 0.8, true);
          sprite(ctx, 'spark', mixc(c.c, C.silver050, 0.6), x, y, 13 * U * c.gain, 1, true);
        },

        drawBeams(ctx, b, L, at) {
          if (this.beamAt < 0) return;
          const t = at - this.beamAt, a = E.outSoft(clamp(t / 0.6, 0, 1)) * (this.paySize || 0.6) * Math.max(0.5, this.lampPeak ?? 1), [lx, ly] = L.lamp;
          const { W } = J.size();
          const { H } = J.size();
          const beam = (tx, ty, k) => {
            const grow = rm() ? 1 : 0.5 + 0.5 * E.outSoft(clamp(t / 0.7, 0, 1)), len = Math.hypot(tx - lx, ty - ly) * grow;
            const ang = Math.atan2(ty - ly, tx - lx), ex = lx + Math.cos(ang) * len, ey = ly + Math.sin(ang) * len, spread = len * 0.13;
            const nx = -Math.sin(ang), ny = Math.cos(ang);
            const gr = ctx.createLinearGradient(lx, ly, ex, ey);
            gr.addColorStop(0, rgb(C.sun, 0.5 * a * k)); gr.addColorStop(1, rgb(C.gold, 0));
            const op = ctx.globalCompositeOperation; ctx.globalCompositeOperation = 'lighter';
            ctx.fillStyle = gr;
            ctx.beginPath(); ctx.moveTo(lx - nx * 4 * L.U, ly - ny * 4 * L.U); ctx.lineTo(ex - nx * spread, ey - ny * spread); ctx.lineTo(ex + nx * spread, ey + ny * spread); ctx.lineTo(lx + nx * 4 * L.U, ly + ny * 4 * L.U); ctx.closePath(); ctx.fill();
            ctx.globalCompositeOperation = op;
          };
          beam(W + 30, H * 0.74, 1);
          if (this.fever) beam(-30, H * 0.66, 0.7 * clamp((t - 0.25) / 0.5, 0, 1));
        },
      });
      g.writeExtra();
      return g;
    },
  });
})();
