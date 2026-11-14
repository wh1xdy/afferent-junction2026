(() => {
  const { clamp, lerp, ease, rgb, mixc } = A;
  const { C, glow, ring, disc, dist, unit, finger, tapCue, dragCue, line, dots, base, finish, idle } = A.J;
  const Au = A.Audio, R = Math.random, calm = A.J.rm;
  const WOOD = C.wood, WOOD_D = C.woodD, WOOD_L = C.woodL, BRONZE_D = C.bronzeD, STONE = C.stone, STONE_D = C.stoneD;

  const BREATH_IN = 4, BREATH_CYCLE = 10, BREATH_ENGAGED = 0.35;
  const playLeft = () => A.session?.playLeft ? A.session.playLeft(A.now()) : Infinity;

  A.defineTask('breath', {
    modes: ['calm', 'rest'], role: 'Apple Watch Breathe, Celeste feather', world: true,
    minS: BREATH_CYCLE + 0.6,
    make(k, opts) {
      const endless = !!opts?.endless;
      const cycles = endless ? Infinity : clamp(Math.floor((playLeft() + 3 - 0.6) / BREATH_CYCLE), 1, 2);
      return base('breath', endless ? 999 : cycles * BREATH_CYCLE + 0.6, {
        cycles, b: 0, sync: 0, inF: 0, inH: 0, exF: 0, exR: 0, cyc: 0, cIn: 0, cHeld: 0,
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
          A.session && (A.session.orb = { b: this.b, hold: holding ? 1 : 0, sync: this.sync, alpha: 1, inhale, cycle: c, cycles: this.cycles, phase: ct / BREATH_CYCLE, guide: c === 0 && inhale && !this.inH ? 1 : 0 });
        },
        auto() { const ct = (this.t - 0.3 + BREATH_CYCLE) % BREATH_CYCLE; this.autoHold = ct < BREATH_IN; },
        draw() {},
      });
    },
  });
})();
