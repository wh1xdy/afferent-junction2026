(() => {
  const { clamp, lerp, rgb, mixc } = A;
  const J = A.J, { C } = J, E = J.ease;
  const Au = A.Audio, R = Math.random, TAU = Math.PI * 2;
  const IN = 4, CYCLE = 10, ENGAGED = 0.35, LOG_WIN = 1, RING_S = 6, OUTRO = 1.2;
  const BOT = [['perfect', 0.15], ['good', 0.55], ['barely', 0.1], ['miss', 0.2]];
  const SKY = [[0.16, 0.2], [0.85, 0.15], [0.3, 0.08], [0.74, 0.47]];
  const playLeft = () => A.session?.playLeft ? A.session.playLeft(A.now()) : Infinity;
  const hooks = () => A.World?.hooks || null;
  const V = () => A.session?.V || null;

  A.Skill?.define('breath', {
    drift: { v0: 44, v1: 14, geo: true, cat: 'precision' },
    window: { v0: 0.7, v1: 0.2, geo: true, cat: 'precision' },
    share: { v0: 0.6, v1: 0.95, cat: 'patience' },
  });

  let cur = null;
  const unpose = () => { const h = hooks(); h?.setBreath?.(null); h?.lanternPose?.(null); };
  A.bus.on('pdown', d => cur?.onDown(d));
  A.bus.on('pup', d => cur?.onUp(d));
  A.bus.on('game', e => { if (e?.id !== 'breath') { cur = null; unpose(); } });
  A.bus.on('sessionEnd', () => { cur = null; unpose(); });

  const SPR = {};
  const canvas = (w, h, paint) => { const c = document.createElement('canvas'); c.width = w; c.height = h; paint(c.getContext('2d'), w, h); return c; };
  const petal = night => SPR[night ? 'pn' : 'pd'] || (SPR[night ? 'pn' : 'pd'] = canvas(128, 72, (x, w, h) => {
    const base = night ? C.ice : C.glow, tip = night ? C.night500 : C.teal;
    const g = x.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, rgb(base, 0.95)); g.addColorStop(0.45, rgb(mixc(base, tip, 0.45), 0.7)); g.addColorStop(1, rgb(tip, 0.5));
    x.fillStyle = g; x.beginPath(); x.ellipse(w / 2, h / 2, w / 2 - 3, h / 2 - 4, 0, 0, TAU); x.fill();
    x.globalCompositeOperation = 'destination-in';
    const m = x.createRadialGradient(w * 0.42, h / 2, 0, w * 0.42, h / 2, w * 0.6);
    m.addColorStop(0, 'rgba(0,0,0,1)'); m.addColorStop(0.7, 'rgba(0,0,0,0.85)'); m.addColorStop(1, 'rgba(0,0,0,0.25)');
    x.fillStyle = m; x.fillRect(0, 0, w, h);
    x.globalCompositeOperation = 'source-over';
    x.strokeStyle = rgb(mixc(base, C.silver050, 0.5), 0.55); x.lineWidth = 1.6;
    x.beginPath(); x.ellipse(w / 2, h / 2, w / 2 - 3.5, h / 2 - 4.5, 0, 0, TAU); x.stroke();
  }));
  const flame = () => SPR.f || (SPR.f = canvas(64, 96, (x, w, h) => {
    const g = x.createRadialGradient(w / 2, h * 0.68, 2, w / 2, h * 0.6, h * 0.55);
    g.addColorStop(0, 'rgba(255,250,236,1)'); g.addColorStop(0.35, rgb(C.glow, 0.95)); g.addColorStop(0.75, rgb(C.amber, 0.75)); g.addColorStop(1, rgb(C.amberDeep, 0));
    x.fillStyle = g; x.beginPath();
    x.moveTo(w / 2, 4); x.bezierCurveTo(w * 0.62, h * 0.3, w * 0.92, h * 0.5, w * 0.86, h * 0.72);
    x.bezierCurveTo(w * 0.8, h * 0.94, w * 0.2, h * 0.94, w * 0.14, h * 0.72);
    x.bezierCurveTo(w * 0.08, h * 0.5, w * 0.38, h * 0.3, w / 2, 4); x.fill();
  }));
  let vigKey = '', vigGrad = null;

  A.defineTask('breath', {
    modes: ['calm', 'rest'], role: 'Journey song, Apple Watch Breathe', world: true,
    minS: CYCLE + 0.6,
    make(k, opts) {
      const endless = !!opts?.endless, rm = J.rm();
      const cycles = endless ? Infinity : clamp(Math.floor((playLeft() + 3 - 0.6) / CYCLE), 1, 2);
      const nMotes = rm ? 8 : endless ? 16 : Math.round(16 + 8 * clamp(k ?? 0, 0, 1));
      const motes = Array.from({ length: nMotes }, (_, i) => ({ a: (i / nMotes) * TAU + R() * 0.3, ro: 0.85 + 0.3 * R(), ri: 0.8 + 0.4 * R(), s: 0.8 + 0.5 * R(), ph: R() * TAU }));
      J.fx.limit = 50;
      const g = J.base('breath', endless ? 999 : cycles * CYCLE + 0.6, {
        cycles, endless, b: 0, sync: 0, inF: 0, inH: 0, exF: 0, exR: 0, cyc: 0, cIn: 0, cHeld: 0,
        outro: OUTRO, motes, rings: [], marks: new Map(), lm: [],
        gather: 0, flare: 0, downAt: -9, topAt: -9, launchAt: -9, touched: false, wasHolding: false,
        anchor: null, drift: 0, loose: false, cy: null, perfRun: 0, ribbon: false, spilled: false,
        dim: 0, eyes: 1, vis: 0, waitA: 0, strengths: [], early: 0, late: 0, lit: 0, clear: 0, lastUpT: null, pendingUp: null,
        fb: A.Breathing?.track(60 / CYCLE) ?? null,

        geo() {
          const { W, H } = J.size(), u = H / 844;
          return { W, H, u, x: W * 0.5, y: H * 0.35 };
        },

        level() {
          if (this.endless) return { drift: 30, window: 0.5, share: 0.7 };
          return { drift: A.Skill?.axis('breath', 'drift', 31) ?? 31, window: A.Skill?.axis('breath', 'window', 0.48) ?? 0.48, share: A.Skill?.axis('breath', 'share', 0.71) ?? 0.71 };
        },

        newCycle(c, now, held) {
          if (!held) this.rt?.cue('in' + c, 'inhale_cue', now);
          if (!this.endless) A.Skill?.progress('breath', c, this.cycles);
          this.cy = { c, lv: this.level(), maxDrift: 0, ticks: 0, top: false, share: 0, launched: false, bot: null };
          this.loose = false;
        },

        onDown(d) {
          if (this.done) return;
          this.touchDown(d?.ts ?? d?.t ?? A.now());
          this.anchor = [d.x, d.y];
        },
        onUp(d) {
          if (this.done) return;
          this.pendingUp = this.t + ((d?.ts ?? d?.t ?? A.now()) - A.now());
        },
        touchDown(t) {
          this.rt?.hit('in' + this.cy?.c, t);
          this.touched = true; this.downAt = this.at ?? A.now(); this.drift = 0;
          J.hap('touch');
          const p = this.geo();
          J.bloom(p.x, p.y, 70 * p.u, this.endless ? C.ice : C.glow, 0.28, 0.15, 0.5);
          J.sfx('breath_wind', { on: true });
        },

        update(dt, now) {
          this.visual(dt, now);
          if (this.done) return;
          this.fb?.tick(now, dt);
          const ct = this.t % CYCLE, inhale = ct < IN;
          this.b = inhale ? E.breath(ct / IN) : 1 - E.breath((ct - IN) / (CYCLE - IN));
          const holding = !!(this.autoHold ?? A.Input.holding());
          if (holding) this.lastIn = this.t;
          if (holding && !this.touched) { this.touched = true; if (!this.anchor && A.Pointer.down) this.anchor = [A.Pointer.x, A.Pointer.y]; }
          if (!this.cy) this.newCycle(0, now, holding);
          if (holding && !this.wasHolding && this.autoHold !== undefined) this.touchDown(now);
          if (holding && !this.wasHolding && this.autoHold === undefined && !A.Pointer.down) this.touchDown(now);
          if (!holding && this.wasHolding) { this.lastUpT = this.pendingUp ?? this.t; this.pendingUp = null; this.release(now); }
          this.wasHolding = holding;
          if (holding) {
            const P = A.Pointer;
            this.drift = this.autoHold !== undefined ? (this.autoDrift || 0) : P.down && this.anchor ? Math.hypot(P.x - this.anchor[0], P.y - this.anchor[1]) : 0;
            if (inhale) this.cy.maxDrift = Math.max(this.cy.maxDrift, this.drift);
            this.loose = this.drift > this.cy.lv.drift;
          } else this.loose = false;

          if (inhale) { this.inF++; this.cIn++; if (holding) { this.inH++; this.cHeld++; } }
          else { this.exF++; if (!holding) this.exR++; }
          this.sync = 0.5 * ((this.inF ? this.inH / this.inF : 0) + (this.exF ? this.exR / this.exF : 0));

          if (inhale) {
            if (!this.cy.ticks) { this.cy.ticks = 4; if (this.feel()) J.hap.breath('in', IN - ct); }
          } else if (!this.cy.top) this.turn(holding, now);

          const c = Math.floor(this.t / CYCLE);
          if (c !== this.cyc) {
            if (!this.cy.launched) this.launch(now, true);
            if (this.cIn && this.cHeld / this.cIn >= ENGAGED) this.items++;
            this.cyc = c; this.cIn = 0; this.cHeld = 0;
            this.newCycle(c, now, holding);
            if (holding) this.anchor = A.Pointer.down ? [A.Pointer.x, A.Pointer.y] : this.anchor;
            if (c >= this.cycles || (this.endless && playLeft() < CYCLE + 0.2)) this.close(now);
          }
          if (this.endless && !this.done && playLeft() <= 0.3) this.close(now);
          Au.padLevel(this.b);
          hooks()?.setBreath?.(this.b);
          hooks()?.lanternPose?.(1.25);
          if (A.session) {
            A.session.orb = { b: this.b, hold: holding ? 1 : 0, sync: this.sync, alpha: 0, inhale, cycle: c, cycles: this.cycles, phase: ct / CYCLE, guide: 0 };
            if (A.session.V?.orb) A.session.V.orb.alpha = 0;
          }
          this.extra = {
            ring_strength_mean: this.strengths.length ? Math.round(1000 * this.strengths.reduce((a, b) => a + b, 0) / this.strengths.length) / 1000 : null,
            early_releases: this.early, late_releases: this.late, landmarks_lit: this.lit, clear_songs: this.clear,
          };
        },

        turn(holding, now) {
          const cy = this.cy;
          cy.top = true; cy.share = this.cIn ? this.cHeld / this.cIn : 0;
          this.rt?.lapse('in' + cy.c);
          this.topAt = this.at ?? now;
          if (this.feel()) J.hap.breath('out', CYCLE - IN);
          const p = this.geo();
          J.bloom(p.x, p.y, 95 * p.u, this.endless ? C.ice : C.glow, 0.32, 0.3, 0.7);
          J.sfx('breath_top');
          if (!holding) this.launch(now, false);
        },

        release(now) {
          const cy = this.cy;
          if (!cy || cy.launched) return;
          if (cy.top) this.launch(now, false);
        },

        launch(now, atEnd) {
          const cy = this.cy, lv = cy.lv;
          if (!cy.top) { cy.top = true; cy.share = this.cIn ? this.cHeld / this.cIn : 0; }
          cy.launched = true;
          const share = cy.share, held = share > 0;
          const relT = held ? (atEnd ? null : this.lastUpT != null ? this.lastUpT - cy.c * CYCLE : null) : null;
          if (held) {
            if (relT == null || relT > IN + LOG_WIN) this.late++;
            else if (relT < IN - LOG_WIN) this.early++;
          }
          const lateBy = relT == null ? (held ? CYCLE - IN : 0) : Math.max(0, relT - IN - 0.5);
          let strength = clamp(share / lv.share, 0.4, 1) * clamp(1 - lateBy / 8, 0.6, 1);
          const checks = held ? (cy.maxDrift <= lv.drift ? 1 : 0) + (share >= lv.share ? 1 : 0) + (relT != null && Math.abs(relT - IN) <= lv.window ? 1 : 0) : 0;
          const grade = ['miss', 'barely', 'good', 'perfect'][checks];
          const clear = !this.endless && grade === 'perfect';
          if (clear) { strength = 1; this.clear++; }
          this.strengths.push(strength);
          if (!this.endless) {
            A.Skill?.trial('breath', grade);
            this.perfRun = clear ? this.perfRun + 1 : 0;
          }
          const p = this.geo(), last = !this.endless && cy.c >= this.cycles - 1;
          const left = last ? (cy.c + 1) * CYCLE + OUTRO - this.t : RING_S;
          const dur = clamp(Math.min(RING_S, left), 1.4, RING_S);
          const Rmax = Math.hypot(Math.max(p.x, p.W - p.x), Math.max(p.y, p.H - p.y));
          const lm = this.lm;
          const unlit = lm.filter(m => !(this.marks.get(m.id)?.lit > 0)).sort((a, b) => a.d - b.d);
          const stay = this.endless ? [] : unlit.slice(0, clear ? 2 : 1).map(m => m.id);
          const need = stay.length ? Math.max(...stay.map(id => lm.find(m => m.id === id).d)) + 40 * p.u : 0;
          const reach = Math.max(need, clear ? Rmax * 1.05 : lerp(0.55, 0.85, strength) * Rmax);
          this.rings.push({ t0: this.at ?? now, dur, x: p.x, y: p.y, r0: 46 * p.u, reach, strength, clear, stay, crossed: new Set(), last, rest: this.endless });
          if (this.rings.length > 3) this.rings.shift();
          this.launchAt = this.at ?? now; this.launchC = cy.c;
          J.fx.burst(p.x, p.y, clear ? 14 : Math.round(4 + 6 * strength), clear ? C.gold : this.endless ? C.ice : C.glow, (clear ? 160 : 110) * p.u, { life: clear ? 0.9 : 0.7, kind: clear ? 'spark' : 'mote', size: [clear ? 7 * p.u : 4 * p.u, 1] });
          if (clear) J.bloom(p.x, p.y, 120 * p.u, C.gold, 0.4, 0.2, 0.8);
          if (clear && this.perfRun >= 2 && !this.ribbon) this.ribbonAt = (this.at ?? now) + 1.2;
          J.sfx('breath_song', { strength, clear });
        },

        landmarks() {
          const { W, H, u, x, y } = this.geo(), out = [];
          if (!this.endless) {
            const list = hooks()?.landmarks?.() || [];
            for (const m of list) {
              if (m.kind === 'lighthouse') continue;
              out.push({ id: m.id, kind: m.kind, x: m.x, y: m.y, world: true });
              if (m.kind === 'sauna') out.push({ id: m.id + ':chimney', kind: 'chimney', x: m.x + 46 * u, y: m.y - 58 * u });
            }
            const lh = list.find(m => m.kind === 'lighthouse');
            if (lh) out.push({ id: lh.id, kind: 'lighthouse', x: lh.x, y: lh.y, world: true });
            for (let i = 0; out.length < 4 && i < SKY.length; i++) out.push({ id: 'sky' + i, kind: 'sky', x: SKY[i][0] * W, y: SKY[i][1] * H });
          }
          for (const m of out) m.d = Math.hypot(m.x - x, m.y - y);
          return out;
        },

        ignite(m, ring) {
          const st = this.marks.get(m.id) || { lit: 0, litAt: null, flashAt: -9, a: 0 };
          this.marks.set(m.id, st);
          st.flashAt = this.at; st.a = ring.strength;
          J.sfx('breath_chime', { i: this.lm.indexOf(m) });
          if (ring.stay.includes(m.id) && !st.lit) {
            st.lit = 1; st.litAt = this.at; this.lit++;
            const h = hooks();
            if (m.kind === 'sky') h?.addSkyMark?.('star', m.x / this.geo().W, m.y / this.geo().H);
            if (m.kind === 'lighthouse') h?.flareLighthouse?.(0.6);
          } else if (m.kind === 'lighthouse') hooks()?.flareLighthouse?.(0.35 * ring.strength);
          if (m.kind === 'chimney' && !J.rm()) J.fx.rise(m.x, m.y, 5, C.amber);
        },

        visual(dt, now) {
          const at = this.at ?? now, p = this.geo();
          this.lm = this.landmarks();
          const live = !this.done;
          this.vis = live ? Math.min(1, this.vis + dt / 0.5) : Math.max(0, this.vis - dt / 0.9);
          if (this.endless) {
            const closed = A.Eyes?.closed && now - A.Eyes.closedAt > 2;
            this.eyes = A.ema(this.eyes, closed ? 0.15 : 1, dt, closed ? 1.5 : 0.4);
            this.dim = live ? Math.min(0.3, this.dim + dt * 0.08 / CYCLE) : Math.max(0, this.dim - dt / OUTRO * 0.3);
          }
          const ct = this.t % CYCLE, inhale = ct < IN && live;
          const holding = live && !!(this.autoHold ?? A.Input.holding());
          const demo = !this.touched && this.cyc === 0 && ct > 0.25 && ct < 1.45;
          if (inhale && ((holding && !this.loose) || demo)) this.gather = Math.min(1, this.gather + dt / IN);
          else if (inhale && holding && this.loose) this.gather = Math.max(0, this.gather - dt * 0.12);
          else if (!this.touched && this.cyc === 0 && ct >= 1.45) this.gather = Math.max(0, this.gather - dt * 0.2);
          if (this.launchAt > 0 && at - this.launchAt > 1.2 && at - this.launchAt < 1.4 && this.cyc === this.launchC) this.gather = 0;
          this.flare = A.ema(this.flare, holding ? 1 : 0, dt, 0.25);
          this.waitA = A.ema(this.waitA, live && this.cy?.top && !this.cy.launched ? 1 : 0, dt, 0.3);
          for (const r of this.rings) {
            const q = clamp((at - r.t0) / r.dur, 0, 1), rad = lerp(r.r0, r.reach, E.breath(q));
            for (const m of this.lm) if (!r.crossed.has(m.id) && m.d <= rad && !r.rest) { r.crossed.add(m.id); this.ignite(m, r); }
            if (r.last && !this.spilled && q >= 0.55) {
              this.spilled = true;
              J.spill(0.3 + 0.4 * (A.Skill?.cur?.id === 'breath' ? A.Skill.lightShare(A.Skill.cur) : r.strength));
              const v = V();
              if (v && A.session?.tween) A.session.tween(v, 'aurora', v.aurora, Math.min(1, v.aurora + 0.1), 1.6);
            }
          }
          this.rings = this.rings.filter(r => at - r.t0 < r.dur + 0.4);
          for (const m of this.lm) {
            const st = this.marks.get(m.id);
            if (st?.lit && m.world && m.kind !== 'lighthouse') hooks()?.lightLandmark?.(m.id, E.inQuad(clamp((at - st.litAt) / 0.6, 0, 1)));
          }
          if (this.ribbonAt && at >= this.ribbonAt && !this.ribbon) {
            this.ribbon = true;
            const v = V();
            if (v && A.session?.tween) A.session.tween(v, 'aurora', v.aurora, Math.min(1, v.aurora + 0.12), 1.6);
            hooks()?.addSkyMark?.('aurora', 0.5, 0.12);
          }
          if (holding && inhale && !J.rm() && R() < dt * 5) {
            const lp = A.World?.lanternPos?.();
            if (lp) J.fx.add({ x: lp[0], y: lp[1] - 6 * p.u, vx: (p.x - lp[0]) * 0.5, vy: (p.y - lp[1]) * 0.5, drag: 0, life: 1.6, size: [2.2 * p.u, 1 * p.u], alpha: [0.7, 0], c: C.glow });
          }
          if (this.done && at - this.finishedAt > OUTRO - 0.2) unpose();
          cur = this;
        },

        outroUpdate(dt, now) { this.visual(dt, now); },

        close(now) { if (this.engaged()) { J.finish(this, now); if (!this.endless) J.hap('complete'); } else this.max = this.t; },
        feel() { return !this.endless || this.cyc < 6; },
        engaged() { return this.inF > 0 && this.inH / this.inF >= ENGAGED; },

        auto() {
          if (this.done) return;
          const c = Math.floor(this.t / CYCLE), ct = this.t % CYCLE, cy = this.cy;
          if (!cy || cy.c !== c) { this.autoHold = ct > 0.3 && ct < IN; return; }
          if (!cy.bot) {
            let x = R(), grade = 'good';
            for (const [gname, w] of BOT) { if ((x -= w) <= 0) { grade = gname; break; } }
            const fails = { perfect: 0, good: 1, barely: 2, miss: 3 }[grade], order = ['steady', 'share', 'release'].sort(() => R() - 0.5).slice(0, fails);
            const lv = cy.lv, fs = order.includes('share'), fr = order.includes('release');
            const rel = fr ? (fs || R() < 0.5 ? IN + lv.window + 0.35 : IN - lv.window - 0.35) : IN + (R() - 0.5) * lv.window;
            cy.bot = { start: fs ? IN * (1 - lv.share) + 0.5 : 0.15 + 0.2 * R(), rel, drift: order.includes('steady') ? lv.drift * 1.6 : lv.drift * 0.3 };
          }
          this.autoDrift = cy.bot.drift;
          this.autoHold = ct >= cy.bot.start && ct < cy.bot.rel;
        },

        draw() {},

        drawWorld(ctx, at) {
          const p = this.geo(), { W, H, u, x, y } = p, rm = J.rm(), night = this.endless;
          const vis = this.vis * this.eyes;
          const ct = this.done ? CYCLE - 0.01 : this.t % CYCLE, inhale = !this.done && ct < IN;
          const col = night ? mixc(C.ice, C.night500, 0.35) : mixc(C.amber, C.green, 0.7 * clamp((V()?.aurora ?? 0) - 0.05, 0, 1));
          ctx.save();
          const key = `${W}|${H}`;
          if (key !== vigKey) {
            vigKey = key;
            vigGrad = ctx.createRadialGradient(x, y, 60 * u, x, y, Math.hypot(W, H) * 0.75);
            vigGrad.addColorStop(0, 'rgba(5,7,15,0)'); vigGrad.addColorStop(0.45, 'rgba(5,7,15,0.05)'); vigGrad.addColorStop(1, 'rgba(5,7,15,0.22)');
          }
          const vA = Math.max(this.vis, 0) * (0.5 + 0.5 * this.eyes);
          if (vA > 0.01) { ctx.globalAlpha = vA; ctx.fillStyle = vigGrad; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
          if (this.dim > 0.005) { ctx.fillStyle = rgb(C.night950, this.dim); ctx.fillRect(0, 0, W, H); }

          for (const r of this.rings) this.drawRing(ctx, r, at, col, u, rm);
          this.drawMarks(ctx, at, u);
          if (vis <= 0.01) { ctx.restore(); return; }
          ctx.globalAlpha = vis;

          const lp = A.World?.lanternPos?.();
          if (lp) {
            const ta = (0.06 + 0.22 * this.flare) * (inhale ? 1 : 0.5);
            const gr = ctx.createLinearGradient(lp[0], lp[1], x, y);
            gr.addColorStop(0, rgb(C.glow, ta)); gr.addColorStop(0.7, rgb(col, ta * 0.5)); gr.addColorStop(1, rgb(col, 0));
            ctx.strokeStyle = gr; ctx.lineWidth = (1.2 + 1.6 * this.flare) * u; ctx.lineCap = 'round';
            ctx.beginPath(); ctx.moveTo(lp[0], lp[1] - 8 * u); ctx.quadraticCurveTo(lerp(lp[0], x, 0.2), lerp(lp[1], y, 0.6), x, y + 30 * u); ctx.stroke();
          }

          const b = this.b, open = this.done ? Math.max(0, b * (1 - clamp((at - this.finishedAt) / 0.8, 0, 1))) : b;
          // The body (heartbeat.js): the glow grows with the calm response and beats with a real pulse; both are 0 without a reading.
          const hb = A.Heartbeat?.st, beat = hb?.beat ?? 0, calm = hb?.glow ?? 0;
          J.sprite(ctx, 'soft', col, x, y, (90 + 70 * this.gather + 90 * calm + 14 * beat) * u, (0.1 + 0.18 * this.gather + 0.1 * this.flare + 0.22 * calm + 0.08 * beat) * (0.6 + 0.4 * open), true);

          if (this.waitA > 0.01) J.sprite(ctx, 'ring', col, x, y, (112 + 8 * Math.sin(at * Math.PI)) * u, 0.3 * this.waitA * (0.6 + 0.4 * Math.sin(at * Math.PI)), true);
          this.drawArc(ctx, at, ct, inhale, u, col);
          this.drawPace(ctx, u, rm);
          this.drawMotes(ctx, at, u, rm);
          this.drawPetals(ctx, at, open, u, night);
          this.drawFlame(ctx, at, u, open, night, beat);
          ctx.globalAlpha = 1;
          this.drawGhost(ctx, at, ct, W, H, u);
          ctx.restore();
        },

        drawArc(ctx, at, ct, inhale, u, col) {
          const { x, y } = this.geo(), r = 104 * u, a0 = -Math.PI / 2;
          const fade = inhale ? Math.min(1, ct / 0.3) : Math.max(0, 1 - (ct - IN) / 0.8);
          if (fade <= 0.01) return;
          const prog = inhale ? ct / IN : 1, held = this.cIn ? this.cHeld / Math.max(1, this.cIn) * prog : 0;
          const ga = ctx.globalAlpha;
          ctx.lineCap = 'round';
          ctx.strokeStyle = rgb(C.silver300, 0.1 * fade); ctx.lineWidth = 1.2 * u;
          ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke();
          ctx.strokeStyle = rgb(C.silver100, 0.22 * fade); ctx.lineWidth = 1.4 * u;
          ctx.beginPath(); ctx.arc(x, y, r, a0, a0 + TAU * prog); ctx.stroke();
          if (held > 0.005) {
            ctx.strokeStyle = rgb(mixc(col, C.glow, 0.4), 0.85 * fade); ctx.lineWidth = 3 * u;
            ctx.beginPath(); ctx.arc(x, y, r, a0, a0 + TAU * held); ctx.stroke();
          }
          const ha = a0 + TAU * prog, hx = x + Math.cos(ha) * r, hy = y + Math.sin(ha) * r;
          J.sprite(ctx, 'glow', C.flame, hx, hy, 7 * u, 0.7 * fade * (inhale ? 1 : 0.5), true);
          const tp = clamp((at - this.topAt) / 0.5, 0, 1);
          if (tp < 1) J.sprite(ctx, 'glow', C.glow, x, y - r, (8 + 16 * tp) * u, 0.8 * (1 - tp), true);
          ctx.globalAlpha = ga;
        },

        drawPace(ctx, u, rm) {
          const f = this.fb?.ring;
          if (!f || f.a <= 0.01) return;
          const { x, y } = this.geo(), near = clamp(f.near ?? 0, 0, 1), gap = 9 * u * (1 - near);
          ctx.save();
          ctx.globalAlpha *= f.a;
          ctx.strokeStyle = rgb(mixc(C.silver300, C.glow, f.solid ? near : 0), f.solid ? 0.3 + 0.4 * near : 0.4);
          ctx.lineWidth = (f.solid ? 1.8 : 2) * u; ctx.lineCap = 'round';
          ctx.setLineDash(!f.solid ? [0.1, 7 * u] : gap > 0.5 ? [10 * u, gap] : []);
          ctx.beginPath(); ctx.arc(x, y, (128 + (rm ? 0 : 14 * (1 - near))) * u, 0, TAU); ctx.stroke();
          ctx.restore();
        },

        drawMotes(ctx, at, u, rm) {
          const { x, y } = this.geo(), G = this.gather, lt = at - this.launchAt;
          const out = this.launchAt > 0 && lt < 1.2 ? E.outSoft(lt / 1.2) : 0, fadeIn = this.launchAt > 0 && lt >= 1.2 ? clamp((lt - 1.2) / 1.5, 0, 1) : 1;
          const rOut = 150 * u, rIn = 30 * u, spin = rm ? 0.6 : 1.7;
          for (const m of this.motes) {
            const gi = clamp(G * m.ri, 0, 1);
            let r = lerp(rOut * m.ro, rIn * m.ri + 12 * u, E.inOut(gi)) + (this.loose ? 4 * u * Math.sin(at * 3 + m.ph) : 0);
            const ang = m.a + gi * spin * Math.PI + at * (rm ? 0.02 : 0.06) + (rm ? 0 : 0.05 * Math.sin(at * 0.7 + m.ph));
            let a = (0.55 + 0.45 * gi) * fadeIn;
            if (out > 0) { r += rm ? 0 : out * 240 * u; a *= 1 - out; }
            const mx = x + Math.cos(ang) * r, my = y + Math.sin(ang) * r * 0.92;
            if (a <= 0.01) continue;
            if (!rm && gi > 0.02 && gi < 0.98 && this.flare > 0.3 && !this.loose) {
              for (let k = 1; k <= 3; k++) {
                const g2 = Math.max(0, gi - k * 0.025), r2 = lerp(rOut * m.ro, rIn * m.ri + 12 * u, E.inOut(g2)), a2 = m.a + g2 * spin * Math.PI + at * 0.06;
                J.sprite(ctx, 'mote', C.flame, x + Math.cos(a2) * r2, y + Math.sin(a2) * r2 * 0.92, 2.6 * u * m.s, a * (0.4 - k * 0.1), true);
              }
            }
            J.sprite(ctx, 'mote', C.flame, mx, my, 5.5 * u * m.s, a, true);
          }
        },

        drawPetals(ctx, at, open, u, night) {
          const { x, y } = this.geo(), img = petal(night), tp = clamp((at - this.topAt) / 0.3, 0, 1), rim = tp < 1 ? Math.sin(Math.PI * tp) : 0;
          const ga = ctx.globalAlpha, op = ctx.globalCompositeOperation, spin = at * (J.rm() ? 0.01 : 0.03);
          ctx.globalCompositeOperation = 'lighter';
          for (const [k, rot0, al] of [[1, 0, 0.3], [0.62, Math.PI / 6, 0.34]]) {
            const L = lerp(24, 62, open) * u * k, wdt = lerp(18, 40, open) * u * k, off = lerp(3, 30, open) * u * k, rot = rot0 + open * Math.PI / 5 + spin * (k < 1 ? -1 : 1);
            ctx.globalAlpha = ga * (al + 0.1 * open + 0.25 * rim);
            for (let i = 0; i < 6; i++) {
              const a = rot + i * TAU / 6 - Math.PI / 2;
              ctx.save(); ctx.translate(x + Math.cos(a) * off, y + Math.sin(a) * off); ctx.rotate(a);
              ctx.drawImage(img, -L * 0.3, -wdt / 2, L * 1.25, wdt);
              ctx.restore();
            }
          }
          ctx.globalAlpha = ga; ctx.globalCompositeOperation = op;
          if (rim > 0) J.sprite(ctx, 'ring', C.glow, x, y, lerp(40, 100, open) * u, 0.35 * rim, true);
        },

        drawFlame(ctx, at, u, open, night, beat = 0) {
          const { x, y } = this.geo(), G = this.gather, [sx0, sy0] = J.squash(at - this.downAt, 0.92, 0.12);
          const flick = J.rm() ? 1 : 0.94 + 0.06 * Math.sin(at * 9.3) * Math.sin(at * 5.1);
          const sy = sy0 * lerp(1, 1.25, G * this.flare) * flick, sx = sx0 * lerp(1, 0.9, G * this.flare);
          const s = (11 + 7 * G) * u * (1 + 0.16 * beat);
          J.sprite(ctx, 'glow', night ? C.ice : C.amber, x, y, s * 4.5, 0.35 + 0.3 * G + 0.15 * this.flare + 0.3 * beat, true);
          const img = flame(), fw = s * 1.5 * sx, fh = s * 2.6 * sy;
          const sway = J.rm() ? 0 : (this.loose ? 2.5 : 0.6) * u * Math.sin(at * (this.loose ? 7 : 2));
          ctx.drawImage(img, x - fw / 2 + sway, y + s * 0.9 - fh, fw, fh);
          J.sprite(ctx, 'glow', C.daylight, x, y, s * 1.1, 0.75, true);
        },

        drawRing(ctx, r, at, col, u, rm) {
          const q = clamp((at - r.t0) / r.dur, 0, 1), rad = lerp(r.r0, r.reach, E.breath(q));
          const fade = Math.min(1, q * 6) * (1 - E.inQuad(clamp((q - 0.7) / 0.3, 0, 1))) * (0.35 + 0.65 * r.strength) * this.eyes;
          if (fade <= 0.01) return;
          const c = r.clear ? mixc(col, C.gold, 0.35) : col, ga = ctx.globalAlpha;
          if (rm) {
            J.sprite(ctx, 'soft', c, r.x, r.y, r.reach * 0.7, 0.14 * fade * Math.sin(Math.PI * q), true);
            return;
          }
          ctx.globalCompositeOperation = 'lighter';
          ctx.strokeStyle = rgb(c, 0.12 * fade); ctx.lineWidth = (10 + 18 * r.strength) * u;
          ctx.beginPath(); ctx.arc(r.x, r.y, rad, 0, TAU); ctx.stroke();
          ctx.strokeStyle = rgb(mixc(c, C.silver050, 0.3), 0.6 * fade); ctx.lineWidth = (1.4 + 1.4 * r.strength) * u;
          ctx.beginPath(); ctx.arc(r.x, r.y, rad, 0, TAU); ctx.stroke();
          if (r.clear) {
            for (let i = 0; i < 10; i++) {
              const a = i * TAU / 10 + q * 0.6;
              J.sprite(ctx, 'spark', C.gold, r.x + Math.cos(a) * rad, r.y + Math.sin(a) * rad, 9 * u, 0.7 * fade, true);
            }
          }
          ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = ga;
        },

        drawMarks(ctx, at, u) {
          for (const m of this.lm) {
            const st = this.marks.get(m.id);
            if (!st) continue;
            const ft = at - st.flashAt, flash = ft < 0.6 ? E.inQuad(ft / 0.6) : Math.max(0, 1 - (ft - 0.6) / 1.6);
            const keep = st.lit ? E.inQuad(clamp((at - st.litAt) / 0.6, 0, 1)) : 0;
            const a = Math.max(flash * (0.5 + 0.5 * st.a), keep * 0.6) * this.vis * this.eyes;
            if (a <= 0.01) continue;
            const big = m.kind === 'sky' ? 26 : m.kind === 'lighthouse' ? 40 : 60;
            J.sprite(ctx, 'soft', m.kind === 'sky' ? C.flame : C.amber, m.x, m.y, big * u, 0.35 * a, true);
            J.sprite(ctx, m.kind === 'sky' || m.kind === 'forest' ? 'spark' : 'glow', C.glow, m.x, m.y, (m.kind === 'sky' ? 12 : 14) * u, 0.85 * a, true);
          }
        },

        drawGhost(ctx, at, ct, W, H, u) {
          if (this.done) return;
          const gx = W * 0.62, gy = H * 0.8;
          let a = 0, press = 0;
          if (!this.touched && this.cyc === 0) {
            if (ct < 1.6) { a = Math.min(1, ct / 0.25) * (1 - clamp((ct - 1.45) / 0.15, 0, 1)); press = E.outSoft(clamp((ct - 0.25) / 0.15, 0, 1)) * (1 - clamp((ct - 1.45) / 0.15, 0, 1)); }
            else if (ct > 2 && ct < IN) { a = Math.min(1, (ct - 2) / 0.4); press = 1; }
          } else if (!this.endless && ct > 0.8 && ct < IN - 0.3 && !(this.autoHold ?? A.Input.holding()) && this.cHeld === 0) { a = Math.min(1, (ct - 0.8) / 0.4) * 0.8; press = 1; }
          if (a <= 0.01) return;
          const pulse = 0.75 + 0.25 * Math.sin(at * Math.PI);
          J.sprite(ctx, 'glow', C.flame, gx, gy, 26 * u, 0.4 * a * press * pulse, true);
          J.touch(ctx, gx, gy, u, a * 0.9, press);
        },
      });
      cur = g;
      return g;
    },
  });
})();
