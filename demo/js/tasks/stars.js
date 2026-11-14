(() => {
  const { clamp, lerp, rgb, mixc } = A;
  const J = A.J, { C, sprite, disc, unit, dragCue, base, finish, fx, hap, sfx, rm } = J;
  const E = J.ease, R = Math.random, ID = 'stars', PI = Math.PI;
  const IW = 835, IH = 387, SWAN = 'task_stars_swan_line', STAR = 'task_stars_star', SKY = 'task_stars_sky';
  const ANCH = [[44, 230], [752, 14], [772, 362], [440, 252], [210, 248], [800, 150], [560, 378]].map(([x, y]) => [x / IW, y / IH]);
  const LINES = [
    [[5, 236], [60, 208], [95, 205], [180, 228], [280, 252], [340, 266], [400, 246], [460, 238]],
    [[400, 268], [500, 215], [590, 148], [690, 105], [735, 55], [752, 12]],
    [[752, 12], [800, 20], [828, 60], [810, 120], [790, 180], [760, 230], [700, 270], [620, 290], [580, 322]],
    [[5, 236], [90, 246], [200, 262], [300, 297], [400, 332], [520, 376], [640, 378], [720, 356], [775, 365]],
    [[650, 300], [720, 325], [775, 365]],
  ].map(l => l.map(([x, y]) => [x / IW, y / IH]));
  const TIER = [C.amber, C.glow, C.gold, C.daylight];
  const BODY = 0.62, REVEAL = 0.45, BEAT0 = 0.36, BEAT = 0.26, FLY0 = 0.5;
  const r3 = x => Math.round(x * 1000) / 1000;
  const has = n => !!A.Art?.has(n);
  const segDist = (x0, y0, x1, y1, cx, cy) => {
    const dx = x1 - x0, dy = y1 - y0, l2 = dx * dx + dy * dy, t = l2 > 0 ? clamp(((cx - x0) * dx + (cy - y0) * dy) / l2, 0, 1) : 0;
    return Math.hypot(x0 + dx * t - cx, y0 + dy * t - cy);
  };
  const CACHE = {}, SWAN_PAD = 14;
  const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

  A.Skill?.define(ID, {
    n: { v0: 6, v1: 10, int: true, cat: 'load' },
    ratio: { v0: 1.4, v1: 1.12, cat: 'load' },
    magnet: { v0: 1.5, v1: 1.1, cat: 'precision' },
    jitter: { v0: 0.1 / 3, v1: 0.3, cat: 'load' },
    twinkle: { steps: [[0, 0], [0.7, 1]], cat: 'load' },
    window: { v0: 0.9, v1: 0.55, geo: true, cat: 'tempo' },
    tiers: [2, 4, 6],
  });
  const ax = (name, fb) => (A.Skill ? A.Skill.axis(ID, name, fb) : fb);

  const glowLine = (ctx, pts, U, c, a, w) => {
    if (a <= 0.01 || !pts.some(s => s.length > 1)) return;
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = ctx.lineJoin = 'round';
    for (const [lw, k, cc] of [[9, 0.14, c], [4, 0.3, c], [w, 0.9, mixc(c, C.daylight, 0.4)]]) {
      ctx.strokeStyle = rgb(cc, a * k); ctx.lineWidth = lw * U; ctx.beginPath();
      for (const s of pts) for (let i = 0; i < s.length; i++) i ? ctx.lineTo(s[i][0], s[i][1]) : ctx.moveTo(s[i][0], s[i][1]);
      ctx.stroke();
    }
    ctx.restore();
  };

  A.defineTask(ID, {
    modes: ['flow', 'calm'], role: 'Two Dots; Okami constellations; Threes intro',
    make(k) {
      const mode = A.Skill?.active(ID)?.mode || 'flow', calm = mode === 'calm';
      const n = calm ? 5 : clamp(ax('n', 7), 5, ANCH.length);
      const ratio = calm ? 1.5 : ax('ratio', 1.31), jr = ax('jitter', 0.1), jit = calm || jr < 0.099 ? 0 : jr;
      const ranks = shuffle([...Array(n).keys()]);
      const stars = ANCH.slice(0, n).map(([u, v], i) => ({
        u, v, rank: ranks[i], e: ranks[i] - (n - 1) / 2, pop: 0.08 + ranks[i] * 0.09, bright: 1 + jit * (2 * R() - 1), tw: R() * 6.283, tf: 1.1 + 1.3 * R(),
        on: null, wob: -9, breathe: -9, inside: false, counted: false, dwell: 0, snap: null, x: 0, y: 0, r: 4, hit: 22, mag: 30,
      }));
      const order = [...stars].sort((a, b) => a.rank - b.rank);
      const dust = Array.from({ length: 30 }, () => ({ u: R(), v: R(), r: 0.5 + 0.7 * R(), tw: R() * 6.283, tf: 0.6 + R() }));

      return base(ID, 12, {
        n, ratio, calm, stars, order, dust, magnet: ax('magnet', 1.38), twinkle: !calm && ax('twinkle', 0) > 0, win: ax('window', 0.78),
        a0: J.at, next: 0, fp: null, end: null, rest: null, touching: false, touched: false, prevT: null, flags: {}, inputs: new Set(),
        linkMs: [], firstMs: null, lifts: 0, passes: 0, gaps: [], hints: 0, hintAt: -9, recoil: null, haloAt: -9, moteAcc: 0, tier: 0, feverUntil: -9,
        light: 1, wave: null, doneAt: null, marked: false, spilled: false, trailAcc: 0, b: null, L: null, bot: null, timeoutDone: false, rtId: null,
        outro: calm ? 2.0 : 1.8,
        extra: { v: 2, figure: 'swan', n_stars: n, size_ratio: r3(ratio), input: null, link_ms: [], first_touch_ms: null, lifts: 0, passes: 0, wrong_rank_gap: [], hints: 0 },

        box() { return this.b || A.session?.box?.() || { x: 27, y: 101, w: 335, h: 388 }; },
        px(u, v) { const b = this.box(); return [b.x + u * b.w, b.y + v * b.h]; },
        uv(x, y) { const b = this.box(); return [(x - b.x) / b.w, (y - b.y) / b.h]; },

        lay() {
          const b = this.box(), key = `${b.x},${b.y},${b.w},${b.h}`;
          if (this.L?.key === key) return this.L;
          const { W } = J.size(), U = unit(b), w = Math.min(W * 0.86, b.w), h = w * IH / IW;
          const ox = b.x + (b.w - w) / 2, oy = b.y + b.h * 0.46 - h / 2;
          for (const s of this.stars) { s.x = ox + s.u * w; s.y = oy + s.v * h; s.r = clamp(9.5 * U * Math.pow(this.ratio, s.e), 2.6 * U, 30 * U); }
          for (const s of this.stars) {
            const dmin = Math.min(...this.stars.filter(o => o !== s).map(o => Math.hypot(o.x - s.x, o.y - s.y)));
            s.hit = Math.max(22, Math.min(s.r + 12, dmin * 0.5)); s.mag = s.hit * this.magnet;
          }
          return (this.L = { key, b, U, w, h, ox, oy, cx: ox + w / 2, py: oy + h * BODY });
        },

        arm(t) { this.rt?.drop(this.rtId); this.rtId = (this.rtId ?? -1) + 1; this.rt?.cue(this.rtId, 'choice', t); },
        target() { return this.order[this.next] || null; },
        lastLit() { return this.next > 0 ? this.order[this.next - 1] : null; },
        starAt(x, y) {
          let best = null, bd = Infinity;
          for (const s of this.stars) { if (s.on !== null) continue; const d = Math.hypot(x - s.x, y - s.y); if (d < s.hit && d < bd) { bd = d; best = s; } }
          return best;
        },

        sync() {
          const ins = [...this.inputs];
          Object.assign(this.extra, {
            input: ins.length > 1 ? 'mixed' : ins[0] || null, link_ms: [...this.linkMs], first_touch_ms: this.firstMs,
            lifts: this.lifts, passes: this.passes, wrong_rank_gap: [...this.gaps], hints: this.hints,
          });
        },

        down(u, v, t) {
          if (this.done) return;
          this.lay();
          const [x, y] = this.px(u, v), last = this.lastLit();
          this.lastIn = this.t; this.touching = true; this.touched = true; this.fp = [x, y]; this.rest = { x, y, t }; this.haloAt = this.at ?? J.at; this.recoil = null;
          this.end = last && this.calm ? [last.x, last.y] : [x, y];
          if (this.firstMs === null) this.firstMs = Math.max(0, Math.round((t - (this.startAt ?? t)) * 1000));
          if (this.rtId === null) this.arm(this.startAt ?? t);
          this.rt?.hit(this.rtId, t);
          const s = this.starAt(x, y);
          if (s) { s.inside = true; s === this.target() ? this.commit(s, t, 'tap') : this.wrong(s, t); }
          if (this.next > 0 && !this.done) sfx('stars_hum', { on: true, tier: this.tier });
          this.sync();
        },

        move(u, v, t) {
          if (this.done || !this.touching || !this.fp) return;
          const [x, y] = this.px(u, v), [x0, y0] = this.fp;
          this.lastIn = this.t; this.fp = [x, y];
          const ll = this.lastLit();
          if (ll && this.rt?.pending(this.rtId) && Math.hypot(x - ll.x, y - ll.y) > ll.hit) this.rt.drop(this.rtId);
          if (Math.hypot(x - this.rest.x, y - this.rest.y) > 6) { this.rest = { x, y, t }; for (const s of this.stars) s.dwell = 0; }
          const tg = this.target();
          if (tg && segDist(x0, y0, x, y, tg.x, tg.y) < tg.hit) { tg.snap = [x, y]; this.commit(tg, t, 'drag'); this.sync(); return; }
          for (const s of this.stars) {
            if (s.on !== null || s === tg) continue;
            const inn = Math.hypot(x - s.x, y - s.y) < s.hit;
            if (inn && !s.inside) s.inside = true;
            else if (!inn && s.inside) { s.inside = false; if (!s.counted) this.pass(); s.counted = false; }
            else if (!inn && segDist(x0, y0, x, y, s.x, s.y) < s.hit) this.pass();
          }
          this.sync();
        },

        up(u, v, t) {
          if (!this.touching) return;
          this.touching = false;
          if (this.done) return;
          const [x, y] = this.px(u, v), s = this.starAt(x, y), last = this.lastLit();
          if (s && s !== this.target() && !s.counted) this.wrong(s, t);
          for (const o of this.stars) { o.inside = false; o.counted = false; }
          if (last && Math.hypot(x - last.x, y - last.y) > last.hit) { this.lifts++; this.flags.lift = true; sfx('stars_pluck'); }
          if (last) { this.recoil = { from: [...(this.end || [x, y])], at: this.at ?? J.at }; sfx('stars_hum', { on: false }); }
          this.fp = null;
          this.sync();
        },

        pass() { if (this.next > 0) { this.passes++; this.flags.pass = true; } },

        wrong(s, t) {
          const tg = this.target();
          this.errors++; s.counted = true; s.wob = this.at ?? J.at;
          if (tg) tg.breathe = this.at ?? J.at;
          this.gaps.push(s.rank - (tg ? tg.rank : this.n));
          this.flags.wrong = true;
          sfx('stars_wrong');
        },

        commit(s, t, how) {
          const at = this.at ?? J.at, i = this.items, prev = this.lastLit(), U = this.lay().U;
          s.on = at; s.inside = false; s.counted = false;
          if (how === 'tap') s.snap = null;
          this.items++; this.next++; if (i > 0) this.inputs.add(how); this.lastIn = this.t; this.hintAt = this.t;
          let grade = null;
          if (i > 0) {
            const gap = t - this.prevT, f = this.flags;
            this.linkMs.push(Math.round(gap * 1000));
            grade = f.wrong ? 'miss' : f.lift || f.pass || f.hint ? 'barely' : gap <= this.win ? 'perfect' : 'good';
            const res = A.Skill?.trial(ID, grade);
            if (res) { this.tier = res.tier; this.light = clamp(res.light, 0, 1); if (res.fever) this.feverUntil = at + 2.5; }
          }
          this.flags = {}; this.prevT = t;
          if (A.Skill?.progress(ID, this.items, this.n)) J.stinger();
          this.win = ax('window', this.win);
          this.wave = prev ? { a: prev, b: s, at } : null;
          const fever = at < this.feverUntil, soft = grade === 'barely', col = TIER[Math.min(3, this.tier + (fever ? 1 : 0))];
          const ns = (8 + 2 * i) * (this.calm ? 0.5 : 1) * (soft ? 0.5 : 1) * (fever ? 1.4 : 1);
          fx.burst(s.x, s.y, ns, col, this.calm ? 90 : 170, { kind: 'spark', size: [5 * U, 1], drag: this.calm ? 2.5 : 3.5, life: this.calm ? 0.8 : 0.55 });
          if (grade === 'perfect') fx.burst(s.x, s.y, 3, C.daylight, 50, { kind: 'spark', size: [10 * U, 2], life: 0.4 });
          J.bloom(s.x, s.y, s.r * (fever ? 5 : 3.5) + 24 * U, C.glow, grade === 'perfect' || fever ? 0.55 : 0.4, 0.12, 0.35);
          J.border(this.items / this.n);
          if (this.items < this.n) {
            const h = this.calm || i < 3 ? 'light' : 'medium';
            grade === 'perfect' ? hap.seq([[h, 0], ['tick', 40]]) : hap(h);
          }
          sfx('stars_link', { i, grade, piano: [soft ? 2 + i : 3 + i, soft ? 0.09 : 0.15] });
          if (this.items >= this.n) this.complete(t, at);
          else this.arm(t);
        },

        complete(t, at) {
          finish(this, t);
          this.doneAt = at; this.touching = false; this.fp = null;
          J.hitstop(this, 120);
          hap(this.calm ? 'light' : 'success');
          sfx('stars_done', { chord: true });
          J.border(1);
          const L = this.lay();
          J.bloom(L.cx, L.oy + L.h / 2, L.w * 0.62, C.glow, 0.32 + 0.18 * this.light, 0.3, 0.9);
          this.sync();
        },

        dest() {
          const { W, H } = J.size(), L = this.lay();
          return { dx: W * 0.68, dy: H * 0.15, sf: W * 0.42 / L.w };
        },

        payState(at) {
          const a = at - this.doneAt, still = rm(), fd = this.calm ? 1.0 : 0.85;
          const rev = still ? clamp(a / 0.3, 0, 1) : E.outSoft(clamp(a / REVEAL, 0, 1));
          const bp = (a - BEAT0) / BEAT, sy = still || bp <= 0 || bp >= 1 ? 1 : 1 - 0.16 * Math.sin(PI * bp);
          const fly = still ? 0 : clamp((a - FLY0) / fd, 0, 1);
          const fade = still ? 1 - clamp((a - 0.8) / 0.6, 0, 1) : 1 - clamp((fly - 0.82) / 0.18, 0, 1);
          return { a, rev, sy, fly, fade, ...this.dest() };
        },

        pivot(P) {
          const L = this.lay(), p = E.inOut(P.fly);
          return [lerp(L.cx, P.dx, p), lerp(L.py, P.dy, p) - Math.sin(PI * p) * 40 * L.U, lerp(1, P.sf, p)];
        },

        marks(kind) {
          const add = A.World?.hooks?.addSkyMark, { W, H } = J.size(), L = this.lay(), P = this.dest();
          if (!add || this.marked) return;
          this.marked = true;
          for (const s of this.order) add(kind, (P.dx + (s.x - L.cx) * P.sf) / W, (P.dy + (s.y - L.py) * P.sf) / H);
        },

        pay(dt) {
          if (!this.done || this.doneAt === null) return;
          const P = this.payState(this.at ?? J.at);
          if (rm() ? P.a > 0.6 : P.fly > 0.4) this.marks('star');
          if (P.fly > 0 && P.fly < 1) {
            this.trailAcc += dt * 20 / (this.calm ? 1.0 : 0.85);
            const [x, y] = this.pivot(P);
            for (; this.trailAcc >= 1; this.trailAcc--) fx.trailMote(x + (R() - 0.5) * 30, y + (R() - 0.5) * 12, C.glow);
          }
          if (!this.spilled && (rm() ? P.a > 0.8 : P.fly >= 1)) { this.spilled = true; J.spill(0.3 + 0.4 * this.light); }
        },

        update(dt, now) {
          this.lay();
          if (!this.done) {
            if (this.rtId === null) this.arm(this.startAt ?? now);
            if (this.touching && this.fp) {
              const thr = this.calm ? 0.4 : 0.18;
              for (const s of this.stars) {
                if (!s.inside || s.counted || s.on !== null) continue;
                if (Math.hypot(this.fp[0] - s.x, this.fp[1] - s.y) < s.hit * 0.85) s.dwell += Math.min(dt, 0.05);
                if (s.dwell >= thr) this.wrong(s, now);
              }
              const lag = this.calm ? 0.18 * clamp(this.k ?? 0, 0, 1) : 0;
              if (!this.end || lag < 0.01) this.end = [...this.fp];
              else { const a = 1 - Math.exp(-dt / lag); this.end[0] += (this.fp[0] - this.end[0]) * a; this.end[1] += (this.fp[1] - this.end[1]) * a; }
              const last = this.lastLit();
              if (last) {
                this.moteAcc += dt * 15;
                for (; this.moteAcc >= 1; this.moteAcc--) { const p = R(); fx.trailMote(lerp(last.x, this.end[0], p), lerp(last.y, this.end[1], p), C.flame); }
              }
            }
            const tg = this.target();
            if (tg && this.touched && !this.touching && this.t - this.lastIn > 3 && this.t - this.hintAt > 3) {
              this.hintAt = this.t; tg.breathe = this.at ?? J.at;
              if (this.items > 0) { this.flags.hint = true; this.hints++; this.sync(); }
            }
            if (!this.timeoutDone && this.t >= this.max) { this.timeoutDone = true; this.marks('cool'); if (!this.touching) this.rt?.lapse(this.rtId); }
          }
          this.pay(dt);
        },

        outroUpdate(dt) { this.pay(dt); },

        auto(dt, now) {
          const B = this.bot || (this.bot = { at: now + 0.7 + 0.5 * R(), path: null });
          if (this.done || now < B.at) return;
          const tg = this.target();
          if (!tg) return;
          if (B.path && !this.touching) B.path = null;
          if (B.path) {
            const p = clamp((now - B.path.t0) / B.path.dur, 0, 1), q = B.path.ease ? E.inOut(p) : p;
            this.move(...this.uv(lerp(B.path.x0, B.path.x1, q), lerp(B.path.y0, B.path.y1, q)), now);
            if (p >= 1) { const lift = B.path.lift; B.path = null; if (lift && this.fp) { this.up(...this.uv(...this.fp), now); B.at = now + 0.3; } }
            return;
          }
          if (!this.touching) { const [u, v] = this.uv(tg.x + (R() - 0.5) * 10, tg.y + (R() - 0.5) * 10); this.down(u, v, now); B.at = now + 0.06; return; }
          const roll = R(), [x0, y0] = this.fp;
          const drag = (dur, lift = false, f = 1) => { B.path = { t0: now, dur, x0, y0, x1: lerp(x0, tg.x, f), y1: lerp(y0, tg.y, f), lift, ease: true }; };
          if (roll < 0.17) drag(this.win * 0.55);
          else if (roll < 0.72) drag(this.win * (1.15 + 0.5 * R()));
          else if (roll < 0.82) drag(0.35, true, 0.62);
          else {
            const w = this.stars.filter(s => s.on === null && s !== tg);
            this.up(...this.uv(x0, y0), now);
            if (w.length) { const s = w[Math.floor(R() * w.length)], [u, v] = this.uv(s.x, s.y); this.down(u, v, now); this.up(u, v, now); }
            B.at = now + 0.45;
          }
        },

        drawSky(ctx, L) {
          const b = L.b, pad = 26, key = `${Math.round(b.w)}x${Math.round(b.h)}|${has(SKY)}`;
          if (CACHE.skyKey !== key) {
            CACHE.skyKey = key;
            const c = document.createElement('canvas'), w = Math.round(b.w + 2 * pad), h = Math.round(b.h + 2 * pad), x = c.getContext('2d');
            c.width = w; c.height = h;
            if (has(SKY)) {
              const dh = h / 0.56, dw = dh * A.Art.aspect(SKY);
              A.Art.draw(x, SKY, (w - dw) / 2, 0, dw, dh);
              x.fillStyle = rgb(C.night900, 0.3); x.fillRect(0, 0, w, h);
            } else {
              const g = x.createLinearGradient(0, 0, w, h);
              g.addColorStop(0, rgb(mixc(C.violet500, C.night800, 0.55))); g.addColorStop(0.5, rgb(mixc(C.violet500, C.night700, 0.75))); g.addColorStop(1, rgb(C.night850));
              x.fillStyle = g; x.fillRect(0, 0, w, h);
            }
            x.globalCompositeOperation = 'destination-in';
            x.save(); x.translate(w / 2, h / 2); x.scale(1, h / w);
            const m = x.createRadialGradient(0, 0, 0, 0, 0, w / 2);
            m.addColorStop(0, 'rgba(0,0,0,1)'); m.addColorStop(0.62, 'rgba(0,0,0,0.85)'); m.addColorStop(1, 'rgba(0,0,0,0)');
            x.fillStyle = m; x.fillRect(-w / 2, -w / 2, w, w); x.restore();
            CACHE.sky = c;
          }
          const ga = ctx.globalAlpha;
          ctx.globalAlpha = ga * 0.72; ctx.drawImage(CACHE.sky, b.x - pad, b.y - pad); ctx.globalAlpha = ga;
        },

        drawDust(ctx, L, at) {
          const b = L.b, notch = this.next + this.tier + (this.done ? 3 : 0), base = Math.min(0.75, 0.16 + 0.07 * notch);
          for (const d of this.dust) {
            const x = b.x + d.u * b.w, y = b.y + d.v * b.h, a = base * (rm() ? 0.85 : 0.7 + 0.3 * Math.sin(at * d.tf + d.tw));
            sprite(ctx, 'glow', C.silver200, x, y, 4 * d.r * L.U, 0.35 * a, true);
            disc(ctx, x, y, d.r * L.U, C.silver050, a);
          }
        },

        swanSprite(L) {
          const key = `${Math.round(L.w)}|${has(SWAN)}`;
          if (CACHE.swanKey === key) return CACHE.swan;
          const pad = SWAN_PAD, c = document.createElement('canvas'), w = Math.round(L.w + 2 * pad), h = Math.round(L.h + 2 * pad), x = c.getContext('2d');
          c.width = w; c.height = h;
          const paint = (dx, dy, a) => {
            if (has(SWAN)) A.Art.draw(x, SWAN, pad + dx, pad + dy, L.w, L.h, 1, 1, a);
            else glowLine(x, LINES.map(l => l.map(([u, v]) => [pad + dx + u * L.w, pad + dy + v * L.h])), L.U * 0.8, C.gold, a, 1.6);
          };
          x.globalCompositeOperation = 'lighter';
          for (const [rr, a] of [[7, 0.05], [3.5, 0.09]]) for (let i = 0; i < 10; i++) paint(Math.cos(i * 0.628) * rr, Math.sin(i * 0.628) * rr, a);
          paint(0, 0, 1);
          CACHE.swanKey = key;
          return (CACHE.swan = c);
        },

        drawSwan(ctx, L, at, P) {
          const ghost = 0.09 + 0.03 * this.next, full = 0.6 + 0.4 * this.light, a = P ? lerp(ghost, full, P.rev) : ghost;
          const img = this.swanSprite(L), pad = SWAN_PAD, ga = ctx.globalAlpha;
          const draw = alpha => { ctx.globalAlpha = ga * clamp(alpha, 0, 1); ctx.drawImage(img, L.ox - pad, L.oy - pad); };
          ctx.save(); ctx.globalCompositeOperation = 'lighter';
          if (!P || P.rev >= 1) draw(a);
          else {
            draw(ghost);
            const fx0 = L.ox - 16, fxw = (L.w + 32) * P.rev;
            ctx.save(); ctx.beginPath(); ctx.rect(fx0, L.oy - 30, fxw, L.h + 60); ctx.clip(); draw(a); ctx.restore();
            ctx.globalAlpha = ga;
            if (!rm()) sprite(ctx, 'soft', C.glow, fx0 + fxw, L.py - 10 * L.U, 70 * L.U, 0.55 * (1 - P.rev), true, 0.45, 1.5);
          }
          ctx.restore();
        },

        drawLinks(ctx, L, at, P) {
          const lit = this.order.slice(0, this.next), U = L.U;
          if (lit.length > 1) {
            const pts = lit.map((s, i) => {
              if (i === lit.length - 1 && s.snap && at - s.on < 0.06) { const p = E.outSoft((at - s.on) / 0.06); return [lerp(s.snap[0], s.x, p), lerp(s.snap[1], s.y, p)]; }
              return [s.x, s.y];
            });
            const w = P ? lerp(1.6, 3, E.outSoft(P.rev)) : 1.6 + 0.3 * this.tier, c = P ? C.gold : TIER[Math.min(3, this.tier + (at < this.feverUntil ? 1 : 0))];
            glowLine(ctx, [pts], U, c, P ? 0.9 - 0.45 * P.rev : 0.85, w);
          }
          const wv = this.wave;
          if (wv && at - wv.at < 0.2) {
            const p = (at - wv.at) / 0.2;
            sprite(ctx, 'glow', C.daylight, lerp(wv.a.x, wv.b.x, p), lerp(wv.a.y, wv.b.y, p), 16 * U, 0.9 * (1 - 0.4 * p), true);
          }
          const p = this.tailP();
          if (p > 0) {
            const seq = this.order.slice(Math.max(0, this.next - 1));
            const pts = [];
            for (let i = 0; i < seq.length - 1 && i < p; i++) {
              const f = clamp(p - i, 0, 1), a = seq[i], c = seq[i + 1];
              pts.push([[a.x, a.y], [lerp(a.x, c.x, f), lerp(a.y, c.y, f)]]);
            }
            glowLine(ctx, pts, U, C.silver300, 0.35, 1.2);
          }
        },

        tailP() {
          const t0 = this.max - (0.4 * (this.n - this.next) + 0.3);
          return !this.done && !this.touching && this.t > t0 && this.t - this.lastIn > 1.2 ? (this.t - t0) / 0.4 : 0;
        },

        drawBand(ctx, L, at) {
          const last = this.lastLit();
          if (this.done || !last) return;
          let end = null;
          if (this.touching && this.end) end = this.end;
          else if (this.recoil) {
            const p = (at - this.recoil.at) / 0.28;
            if (p >= 1) this.recoil = null;
            else { const q = rm() ? E.outSoft(p) : E.outBack(p, 1.7), f = this.recoil.from; end = [lerp(f[0], last.x, q), lerp(f[1], last.y, q)]; }
          }
          if (!end) return;
          let [ex, ey] = end;
          if (this.touching) {
            let lean = null, ld = Infinity;
            for (const s of this.stars) { if (s.on !== null) continue; const d = Math.hypot(ex - s.x, ey - s.y); if (d < s.mag && d < ld) { ld = d; lean = s; } }
            if (lean) { const f = 0.35 * (1 - ld / lean.mag); ex = lerp(ex, lean.x, f); ey = lerp(ey, lean.y, f); }
          }
          const st = clamp(Math.hypot(ex - last.x, ey - last.y) / (170 * L.U), 0, 1), c = TIER[Math.min(3, this.tier)];
          glowLine(ctx, [[[last.x, last.y], [ex, ey]]], L.U * lerp(1, 0.62, st), c, lerp(0.7, 1, st), 1.6);
          sprite(ctx, 'glow', C.flame, ex, ey, 12 * L.U, 0.7, true);
        },

        drawStars(ctx, L, at) {
          const U = L.U, T = at - this.a0, fever = at < this.feverUntil;
          for (const s of this.stars) {
            const pp = (T - s.pop) / 0.22;
            if (pp <= 0) continue;
            const app = rm() ? clamp(pp, 0, 1) : 1, sc = rm() ? 1 : pp < 1 ? Math.max(0.01, E.outBack(pp, 2.2)) : 1;
            if (s.on !== null) {
              const dt = at - s.on, [sx, sy] = J.squash(dt, 0.8, 0.25), gp = E.outSoft(clamp(dt / 0.3, 0, 1)), r = s.r * (fever ? 1.15 : 1);
              sprite(ctx, 'glow', C.amber, s.x, s.y, r * (2.6 + 1.8 * gp) + 10 * U, 0.5 * app, true);
              sprite(ctx, 'glow', C.glow, s.x, s.y, r * 1.9, 0.9 * app, true);
              ctx.save(); ctx.translate(s.x, s.y); ctx.scale(sx, sy);
              disc(ctx, 0, 0, r, C.glow, 0.55 * app); disc(ctx, 0, 0, r * 0.62, C.daylight, app);
              sprite(ctx, 'spark', C.daylight, 0, 0, r * 2.4 + 6 * U, 0.75 * app, true);
              ctx.restore();
              if (dt < 0.4 && !rm()) J.ring(ctx, s.x, s.y, r * (1.5 + 2.5 * E.outSoft(dt / 0.4)), C.glow, 0.7 * (1 - dt / 0.4), 2 * U);
              continue;
            }
            const wt = at - s.wob, [wx] = J.wobble(wt), dim = wt >= 0 && wt < 0.4 ? 0.7 : 1;
            const tw = this.twinkle && !rm() ? 1 + 0.15 * Math.sin(at * s.tf + s.tw) : 1;
            const a = clamp(0.72 * s.bright * tw * dim, 0.15, 1) * app, x = s.x + wx * U, y = s.y, r = s.r * sc;
            sprite(ctx, 'glow', C.silver200, x, y, r * 2.8 + 4 * U, 0.3 * a, true);
            if (has(STAR)) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; A.Art.draw(ctx, STAR, x - r * 2.6, y - r * 2.3, r * 5.2, r * 4.6, 1, 1, 0.5 * a); ctx.restore(); }
            else {
              ctx.strokeStyle = rgb(C.silver050, 0.45 * a); ctx.lineWidth = Math.max(0.8, 0.12 * r); ctx.lineCap = 'round';
              ctx.beginPath(); ctx.moveTo(x - 2.2 * r, y); ctx.lineTo(x + 2.2 * r, y); ctx.moveTo(x, y - 2.2 * r); ctx.lineTo(x, y + 2.2 * r); ctx.stroke();
            }
            disc(ctx, x, y, r, C.silver200, 0.62 * a);
            disc(ctx, x, y, r * 0.84, C.silver100, 0.85 * a);
            disc(ctx, x, y, r * 0.5, C.silver050, a);
            const bt = at - s.breathe;
            if (bt >= 0 && bt < 0.8) sprite(ctx, 'glow', C.glow, s.x, s.y, r * 3 + 16 * U, 0.35 * Math.sin(PI * bt / 0.8), true);
          }
        },

        draw(ctx, b, at) {
          this.b = b;
          const L = this.lay(), U = L.U, T = at - this.a0, P = this.done && this.doneAt !== null ? this.payState(at) : null;
          this.drawSky(ctx, L);
          this.drawDust(ctx, L, at);
          ctx.save();
          if (P && (P.fly > 0 || P.sy !== 1 || P.fade < 1)) {
            const [cx, cy, sc] = this.pivot(P);
            if (P.fly > 0) ctx.globalAlpha = P.fade;
            else ctx.globalAlpha *= P.fade;
            ctx.translate(cx, cy); ctx.scale(sc, sc * P.sy); ctx.translate(-L.cx, -L.py);
          }
          this.drawSwan(ctx, L, at, P);
          this.drawLinks(ctx, L, at, P);
          this.drawStars(ctx, L, at);
          ctx.restore();
          this.drawBand(ctx, L, at);
          if (this.touching && this.fp) {
            const p = E.outSoft(clamp((at - this.haloAt) / 0.15, 0, 1));
            sprite(ctx, 'soft', C.flame, this.fp[0], this.fp[1], (16 + 10 * p) * U, 0.32, true);
          }
          if (!this.done && !this.touched && T > 1.0 && this.order.length >= 3 && !this.tailP()) {
            const pts = this.order.slice(0, 3).map(s => [s.x, s.y]), l1 = Math.hypot(pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]), l2 = Math.hypot(pts[2][0] - pts[1][0], pts[2][1] - pts[1][1]);
            const path = m => { const d = m * (l1 + l2); if (d <= l1) { const f = l1 ? d / l1 : 0; return [lerp(pts[0][0], pts[1][0], f), lerp(pts[0][1], pts[1][1], f)]; } const f = l2 ? (d - l1) / l2 : 0; return [lerp(pts[1][0], pts[2][0], f), lerp(pts[1][1], pts[2][1], f)]; };
            dragCue(ctx, path, U, at - this.a0 - 1.0, clamp((T - 1.0) / 0.4, 0, 1), 2.6);
          }
        },
      });
    },
  });
})();
