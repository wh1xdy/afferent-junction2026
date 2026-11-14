(() => {
  const { clamp, lerp, ema, median, hex, uuid } = A;
  const Au = A.Audio, Eyes = A.Eyes, R = Math.random;

  const MODES = A.MODES = {
    calm: { biome: 'sauna', colour: '#F2B544', light: ['#FFC98A', 8], tempo: 54, density: 0.3, speed: 0.6 },
    flow: { biome: 'forest', colour: '#B9CAD6', light: ['#FFD9A0', 8], tempo: 66, density: 0.55, speed: 1 },
    wake: { biome: 'lake', colour: '#7FC8E8', light: ['#DDEBFF', 20], tempo: 76, density: 0.8, speed: 1.35 },
    fatigue: { biome: 'shore', colour: '#FFF3DC', light: ['#F4F7FF', 40], tempo: 84, density: 0.8, speed: 1.2 },
    rest: { biome: 'harbour', colour: '#5E6873', light: ['#000000', 0], tempo: 50, density: 0.2, speed: 0.4 },
  };
  const BLOOM_ORDER = ['yellow', 'blue', 'green'];

  const Sim = A.Sim = {
    reset() { Object.assign(this, { rest: 68, offset: 0, drowsy: 0, live: false, liveBpm: null, nextBlink: 0, closeUntil: 0 }); },
    pulse(now) { return this.live && this.liveBpm ? this.liveBpm : this.rest + this.offset + 2.5 * Math.sin(now * Math.PI / 5); },
    step(dt, s) {
      if (this.live) return;
      const g = s?.game, mode = s?.gameMode;
      let tau = 90;
      if (mode === 'calm' || mode === 'rest') tau = g?.id === 'breath' && g.sync > 0.5 ? 9 : 14;
      this.offset += (0 - this.offset) * (1 - Math.exp(-dt / tau));
      if (mode === 'wake' && g && this.offset < 9) this.offset += 0.25 * dt;
    },
    eyes(now, dt) {
      if (now >= this.closeUntil) {
        if (R() < this.drowsy * 0.5 * dt) this.closeUntil = now + 0.7 + R() * 1.6;
        else if (now > this.nextBlink) { this.closeUntil = now + 0.14; this.nextBlink = now + 2.5 + R() * 3; }
      }
      Eyes.feed(now, now < this.closeUntil ? 0.9 : 0.08, true);
    },
  };
  Sim.reset();

  const r1 = x => Math.round(x * 10) / 10, r3 = x => Math.round(x * 1000) / 1000;

  function isoLocal(d) {
    const off = -d.getTimezoneOffset(), sign = off >= 0 ? '+' : '-', p = n => String(Math.floor(Math.abs(n))).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}${sign}${p(off / 60)}:${p(off % 60)}`;
  }

  A.makeVisual = () => ({
    t: 0, worldX: 0, walking: false, stride: 1,
    chunks: [{ type: 'harbour', x0: -700, x1: 420, seed: 1 }],
    sat: { yellow: 0.05, blue: 0.05, green: 0.05, dawn: 0 }, sweep: 0,
    aurora: 0.05, fog: 0.45, fogDrift: 1, stars: 120, warm: 0.04, sparkle: 0, daylight: 0,
    flame: 1, lanternRadius: 70, lanternBright: 1, sparks: [], iceGlow: 0, stove: 0, beam: 0,
    orb: { b: 0, hold: 0, sync: 0, alpha: 0 }, tapHint: 0, flash: 0, exposure: 1, sunP: 0,
    border: 0.1, borderColor: hex('#FFD9A0'), black: 1,
  });

  A.startSession = opts => {
    const t0 = A.now(), night = opts.clock === 'night';
    Sim.reset(); Eyes.reset();
    Sim.rest = A.config.baselinePulse;
    if (opts.input === 'auto') Sim.offset = 20;
    const playSeconds = opts.stage ? 60 : 85;
    const V = A.makeVisual();

    const s = {
      t0, night, auto: opts.input === 'auto', stage: !!opts.stage, mood: undefined, V, phase: 'fadein', phaseAt: t0, done: false,
      targetX: 0, rest: null, a: 0, fat: 0, reading: 'flow', mode: 'flow', candidate: null, candidateAt: 0, modeAt: null,
      game: null, gameMode: null, lastGame: null, games: [], bloomIdx: 0, flameKick: 0, beatPhase: 0, orb: null, daylightBoost: 0,
      core: { trials: [], trial: null, pulse: [], open: [] }, modeSeconds: { calm: 0, flow: 0, wake: 0, fatigue: 0, rest: 0 },
      transitions: [], pulses: [], modePulse: {}, perclosSum: 0, perclosN: 0, closedRun: 0, storyDone: new Set(),

      rec: {
        schema: 'afferent.session/2', session_id: uuid(), device_id: A.config.deviceId, app_version: 'demo-0.2.0',
        started_iso: isoLocal(new Date()), local_hour: r1(new Date().getHours() + new Date().getMinutes() / 60), clock: night ? 'night' : 'morning',
        status: 'partial', demo_input: opts.input, input_backend: opts.input === 'camera' ? A.Camera.backend : 'none', duration_ms: 0,
        sensors: { phone_camera: opts.input === 'camera', pulse_stone: true, bedside_camera: true, bedside_light: true, presence: false }, sharing: 'summary',
      },

      setPhase(p) { this.phase = p; this.phaseAt = A.now(); A.bus.emit('segment', p); },
      light(rgbHex, level, fade_ms) { A.bus.emit('light', { rgb: rgbHex, level, fade_ms }); A.bus.emit('ws', { type: 'light', rgb: rgbHex, level, fade_ms }); },
      haptic() { navigator.vibrate?.(15); A.bus.emit('haptic'); },
      tm(now) { return Math.round((now - this.t0) * 1000); },

      startCore(now) {
        this.setPhase('core');
        this.core.next = now + 7;
      },

      updateCore(now, dt) {
        const t = now - this.phaseAt, c = this.core;
        if (t < 7) { c.pulse.push(Sim.pulse(now)); if (!Eyes.closed) c.open.push(Eyes.raw); }
        V.tapHint = t > 5 && t < 9 ? 1 : ema(V.tapHint, 0, dt, 0.3);
        const tr = c.trial;
        if (t >= 7) {
          if (!tr && c.trials.length < 5) c.trial = { fp: 1 + R() * 1, start: now, onset: null };
          else if (tr && tr.onset === null && now - tr.start >= tr.fp) { tr.onset = now; V.flash = 1; this.flameKick = 0.9; Au.piano(7, 0.16); if (this.auto) tr.autoAt = now + 0.28 + R() * 0.14; }
          else if (tr && tr.onset !== null && now - tr.onset > 1) this.resolveTrial(now, null);
          if (tr && tr.autoAt && now >= tr.autoAt) this.coreTap(now);
        }
        if (t >= 22 || (t >= 7 && c.trials.length >= 5 && !c.trial)) this.finishCore(now);
      },

      coreTap(at) {
        const tr = this.core.trial;
        if (this.phase !== 'core' || !tr || tr.onset === null) return;
        this.resolveTrial(at, (at - tr.onset) * 1000);
      },

      resolveTrial(now, rt) {
        const outcome = rt === null ? 'miss' : rt < 150 ? 'anticipation' : 'hit';
        this.core.trials.push({ foreperiod_ms: Math.round(this.core.trial.fp * 1000), rt_ms: rt === null ? null : Math.round(rt), outcome, modality: 'touch' });
        A.bus.emit('ws', { type: 'core_trial', session_id: this.rec.session_id, trial: this.core.trials.length, rt_ms: rt === null ? null : Math.round(rt), outcome });
        if (outcome === 'hit') { this.flameKick = 0.5; V.sparkle = 0.6; }
        this.core.trial = null;
      },

      finishCore(now) {
        const c = this.core, hits = c.trials.filter(x => x.outcome === 'hit');
        this.rest = A.config.baselinePulse;
        Eyes.setBaseline(median(c.open) ?? 0.1);
        this.a = ((median(c.pulse) ?? this.rest) - this.rest) / 10;
        this.mode = this.classify();
        this.transitions.push({ t_ms: this.tm(now), from: null, to: this.mode, arousal: r3(this.a), fatigue: r3(this.fat) });
        A.bus.emit('mode', this.mode);
        this.rec.core = this.stage ? { source: 'stored', baseline_pulse_bpm: this.rest } : {
          start_pulse_bpm: r1(median(c.pulse) ?? this.rest), baseline_pulse_bpm: this.rest, pulse_source: Sim.live ? 'ky039' : 'simulated', eye_open_baseline: r3(Eyes.baseline),
          rt_trials: c.trials, rt_median_ms: hits.length ? Math.round(median(hits.map(x => x.rt_ms))) : null,
          valid: c.trials.length === 5 && hits.length >= 3,
        };
        this.modeAt = now;
        this.setPhase('walk');
        this.planWalk(now);
      },

      classify() {
        if (this.fat >= 0.45) return this.night ? 'rest' : 'fatigue';
        if (this.a >= 0.8) return 'calm';
        if (this.a <= -0.3) return 'wake';
        return 'flow';
      },

      intensity(mode) {
        const prev = this.games[this.games.length - 1], adj = prev ? (prev.errors > 2 ? -0.15 : prev.errors === 0 ? 0.1 : 0) : 0;
        const k = { calm: (this.a - 0.5) / 1.5, wake: -this.a, fatigue: this.fat, flow: 0.4, rest: 0.5 }[mode];
        return clamp(k + adj, 0, 1);
      },

      planWalk(now) {
        const mode = this.mode, last = V.chunks[V.chunks.length - 1];
        const c = { type: MODES[mode].biome, x0: last.x1, x1: last.x1 + 560, seed: Math.floor(R() * 1e6) };
        V.chunks.push(c);
        if (V.chunks.length > 6) V.chunks.shift();
        this.targetX = c.x0 + 240;
        this.nextMode = mode;
      },

      startGame(now) {
        const mode = this.mode, id = mode === 'rest' ? 'breath' : A.pickGame(mode, this.lastGame), k = this.intensity(mode);
        this.game = A.MINIGAMES[id].make(k, { endless: mode === 'rest' });
        this.game.mode = mode; this.game.k = k; this.game.startAt = now; this.game.world = !!A.MINIGAMES[id].world;
        this.gameMode = mode; this.lastGame = id;
        this.pulseAtGame = Sim.pulse(now);
        if (mode === 'calm' || mode === 'rest') Au.pad(true);
        if (MODES[mode].biome === 'sauna') Au.crackle(true);
        this.setPhase('game');
        A.bus.emit('game', { id, mode, k });
        A.bus.emit('ws', { type: 'game', session_id: this.rec.session_id, id, mode, intensity: r3(k), t_ms: this.tm(now) });
      },

      endGame(now, by) {
        const g = this.game;
        const rec = { id: g.id, mode: g.mode, intensity: r3(g.k), t_start_ms: this.tm(g.startAt), duration_ms: Math.round((now - g.startAt) * 1000), completed_by: by, items: g.items, errors: g.errors, pulse_delta_bpm: r1(Sim.pulse(now) - this.pulseAtGame) };
        if (g.id === 'breath') rec.breath_sync = r3(g.sync);
        this.games.push(rec);
        if (g.mode === 'fatigue') Sim.drowsy *= 0.45;
        if (this.bloomIdx < BLOOM_ORDER.length) this.bloom(BLOOM_ORDER[this.bloomIdx++], by === 'auto' ? 5 : 1.5);
        if (g.mode === 'wake') this.tween(V, 'iceGlow', V.iceGlow, 1, 2);
        if (g.id === 'breath' || g.mode === 'calm') this.tween(V, 'aurora', V.aurora, Math.min(1, V.aurora + 0.35), 2);
        Au.pad(false); Au.crackle(false);
        this.game = null; this.gameMode = null; this.daylightBoost = 0;
        this.outroUntil = now + 0.6;
        if (now - this.firstPlayAt >= playSeconds) { this.startDawn(now); return; }
        this.setPhase('walk');
        this.planWalk(now);
      },

      tweens: [],
      tween(obj, key, from, to, dur) { this.tweens = this.tweens.filter(x => !(x.obj === obj && x.key === key)); this.tweens.push({ obj, key, from, to, start: A.now(), dur }); },
      bloom(group, dur) { this.tween(V.sat, group, V.sat[group], 1, dur); },

      startDawn(now) {
        this.setPhase('dawn');
        Au.dawnPhrase();
        const hexc = this.night ? '#FFC98A' : '#FFF3DC', level = this.night ? Math.min(25, A.config.dawnLevel) : 60;
        V.borderColor = hex(hexc);
        this.light(hexc, level, 4000);
      },

      fallAsleep(now) {
        if (this.game) this.endGame(now, 'auto');
        Au.fadeOut(4);
        this.tween(V, 'black', V.black, 1, 3);
        this.light('#000000', 0, 3000);
        this.setPhase('asleep');
        setTimeout(() => this.finish('fell_asleep'), 3200);
      },

      story(tp) {
        if (!this.auto) return;
        const at = (k, f) => { if (tp >= k && !this.storyDone.has(k)) { this.storyDone.add(k); f(); } };
        at(22, () => { Sim.drowsy = 0.85; });
        at(42, () => { Sim.drowsy = 0; });
        at(46, () => { Sim.offset = -9; });
      },

      director(now, dt) {
        const pulse = Sim.pulse(now), rest = this.rest ?? Sim.rest;
        this.a = ema(this.a, (pulse - rest) / 10, dt, 3);
        this.fat = ema(this.fat, clamp(Eyes.perclos() * 2 + Eyes.longClosures() * 0.12, 0, 1), dt, 2);
        this.reading = this.classify();
        if (this.reading !== this.mode) {
          if (this.candidate !== this.reading) { this.candidate = this.reading; this.candidateAt = now; }
          if (now - this.candidateAt >= 3) {
            this.transitions.push({ t_ms: this.tm(now), from: this.mode, to: this.reading, arousal: r3(this.a), fatigue: r3(this.fat) });
            this.mode = this.reading; this.candidate = null;
            const [c, l] = MODES[this.mode].light;
            this.light(c, this.night && this.mode === 'fatigue' ? 0 : l, 2000);
            A.bus.emit('mode', this.mode);
            A.bus.emit('ws', { type: 'mode', session_id: this.rec.session_id, mode: this.mode, arousal: r3(this.a), fatigue: r3(this.fat), t_ms: this.tm(now) });
          }
        } else this.candidate = null;
        this.modeSeconds[this.mode] += dt;
        (this.modePulse[this.mode] = this.modePulse[this.mode] || []).push(pulse);
        this.perclosSum += Eyes.perclos(); this.perclosN++;
      },

      style(now, dt) {
        const m = this.mode, k = this.intensity(m), cfg = MODES[m];
        const tgt = {
          calm: { warm: 0.15, fog: 0.6, stars: 60, beam: 0, daylight: 0, exposure: 0.92 },
          flow: { warm: 0.04, fog: 0.35, stars: 120, beam: 0.1, daylight: 0, exposure: 1 },
          wake: { warm: 0, fog: 0.15, stars: 200, beam: 0.6 + 0.4 * k, daylight: 0.05, exposure: 1 },
          fatigue: { warm: 0, fog: 0.1, stars: 40, beam: 1, daylight: 0.45 + 0.3 * k + 0.25 * this.daylightBoost, exposure: 1 },
          rest: { warm: 0.1, fog: 0.7, stars: 80, beam: 0, daylight: 0, exposure: 0.7 },
        }[m];
        for (const key of ['warm', 'fog', 'stars', 'beam', 'daylight', 'exposure']) V[key] = ema(V[key], tgt[key], dt, 2);
        V.fogDrift = m === 'calm' || m === 'rest' ? 0.5 : 1 + k;
        V.sparkle = ema(V.sparkle, m === 'wake' ? 0.3 + 0.5 * k : 0, dt, 1);
        V.border = ema(V.border, m === 'fatigue' && !this.night ? 0.25 : 0.1, dt, 1.5);
        this.speed = 150 * cfg.speed * (m === 'wake' ? 1 + 0.3 * k : 1);
        V.stride = cfg.speed;
        if (this.phase !== 'dawn' && this.phase !== 'end') Au.tick(cfg.tempo + (m === 'wake' ? 20 * k : 0), cfg.density, m !== 'calm' && m !== 'rest');
      },

      update(now, dt) {
        V.t = now;
        for (const tw of this.tweens) tw.obj[tw.key] = lerp(tw.from, tw.to, A.ease((now - tw.start) / tw.dur));
        this.tweens = this.tweens.filter(tw => now - tw.start < tw.dur);
        if (this.done) return;
        const t = now - this.phaseAt;
        Sim.step(dt, this);
        const pulse = Sim.pulse(now);
        if (this.phase !== 'fadein') this.pulses.push(pulse);

        const dx = this.targetX - V.worldX;
        V.walking = Math.abs(dx) > 1;
        if (V.walking) V.worldX += Math.sign(dx) * Math.min(Math.abs(dx), (this.speed || 150) * dt);

        this.beatPhase += 60 / 60 * dt;
        if (this.beatPhase >= 1) {
          this.beatPhase -= 1; this.flameKick = Math.max(this.flameKick, 0.03);
          const n = Math.round(5 * V.sparkle);
          for (let i = 0; i < n; i++) V.sparks.push({ born: now, dx: R() * 2 - 1, dy: -R() });
          if (V.sparks.length > 40) V.sparks.splice(0, V.sparks.length - 40);
        }
        this.flameKick = ema(this.flameKick, 0, dt, 0.2);
        V.flame = 1 + this.flameKick;
        V.flash = ema(V.flash, 0, dt, 0.25);
        V.lanternBright = 1 + 0.5 * this.flameKick;
        V.orb.alpha = ema(V.orb.alpha, this.game?.id === 'breath' ? 1 : 0, dt, 0.5);
        if (this.orb) { V.orb.b = this.orb.b; V.orb.hold = this.orb.hold; V.orb.sync = this.orb.sync; }
        V.stove = this.game?.id === 'breath' ? 0.3 + 0.4 * V.orb.b : ema(V.stove, MODES[this.mode]?.biome === 'sauna' ? 0.4 : 0, dt, 1);

        if (this.phase === 'fadein') { V.black = 1 - clamp(t / 2, 0, 1); if (t >= 2) (this.stage ? this.finishCore(now) : this.startCore(now)); return; }
        if (this.phase === 'core') { this.updateCore(now, dt); return; }
        if (this.phase === 'asleep') return;

        if (this.phase === 'walk' || this.phase === 'game') {
          if (!this.firstPlayAt) this.firstPlayAt = now;
          this.story(now - this.firstPlayAt);
          this.director(now, dt);
          this.style(now, dt);
          this.closedRun = Eyes.closed ? this.closedRun + dt : 0;
          if (this.night && this.closedRun >= 30) { this.fallAsleep(now); return; }
        }
        if (this.phase === 'walk' && !V.walking && now > (this.outroUntil || 0)) this.startGame(now);
        if (this.phase === 'game') {
          const g = this.game;
          g.t += dt;
          g.update(dt, now);
          if (this.auto && !g.done) g.auto?.(dt, now);
          if (g.done && now - g.finishedAt > 0.7) this.endGame(now, 'touch');
          else if (!g.done && g.t >= g.max) this.endGame(now, 'auto');
          else if (g.id === 'breath' && g.mode === 'rest' && now - this.firstPlayAt >= playSeconds) this.endGame(now, 'touch');
        }
        if (this.phase === 'dawn') {
          V.sweep = clamp(t / 4, 0, 1); V.sunP = V.sweep; V.border = lerp(0.1, 0.22, V.sweep); V.daylight = ema(V.daylight, 0, dt, 1);
          if (t >= 4) { V.sat.dawn = 1; V.sweep = 0; this.setPhase('end'); A.bus.emit('endScreen'); }
        }
        if (this.phase === 'end') {
          if (this.auto && this.mood === undefined && t >= 2) this.setMood(3);
          if (t >= 4) V.black = ema(V.black, 0.8, dt, 1);
          if (this.mood !== undefined ? now - this.moodAt >= 1.2 : t >= 10) this.finish('completed');
        }
      },

      setMood(v) { if (this.phase === 'end' && this.mood === undefined) { this.mood = v; this.moodAt = A.now(); A.bus.emit('mood', v); } },

      handle(type, d) {
        if (this.done) return;
        if (type === 'exit') { this.finish('partial'); return; }
        if (this.phase === 'core' && (type === 'pdown' || type === 'key')) { this.coreTap(d.t); return; }
        const g = this.game;
        if (this.phase !== 'game' || !g || g.world || g.done) return;
        if (type === 'key') return;
        const b = this.box(), u = (d.x - b.x) / b.w, v = (d.y - b.y) / b.h;
        if (type === 'pdown') g.down?.(u, v, d.t);
        if (type === 'pmove') g.move?.(u, v, d.t);
        if (type === 'pup') g.up?.(u, v, d.t);
      },

      box() { const { W, H } = A.World.size(); return { x: W * 0.07, y: H * 0.12, w: W * 0.86, h: H * 0.46 }; },

      drawOverlay(ctx, now) {
        const g = this.game;
        const show = g && !g.world ? (g.done ? clamp(1 - (now - g.finishedAt) / 0.7, 0, 1) : clamp((now - g.startAt) / 0.3, 0, 1)) : 0;
        if (show <= 0) return;
        const b = this.box();
        ctx.save();
        ctx.globalAlpha = show;
        ctx.translate(b.x + b.w / 2, b.y + b.h / 2); ctx.scale(0.94 + 0.06 * show, 0.94 + 0.06 * show); ctx.translate(-(b.x + b.w / 2), -(b.y + b.h / 2));
        ctx.fillStyle = 'rgba(10,12,17,0.86)'; ctx.strokeStyle = g.done ? 'rgba(255,217,160,0.8)' : 'rgba(255,217,160,0.22)'; ctx.lineWidth = g.done ? 2 : 1;
        ctx.beginPath(); ctx.roundRect(b.x, b.y, b.w, b.h, 22); ctx.fill(); ctx.stroke();
        ctx.save(); ctx.beginPath(); ctx.roundRect(b.x, b.y, b.w, b.h, 22); ctx.clip();
        g.draw(ctx, b, now);
        const p = clamp(1 - g.t / g.max, 0, 1);
        ctx.fillStyle = 'rgba(255,217,160,0.25)'; ctx.fillRect(b.x, b.y + b.h - 3, b.w * p, 3);
        ctx.restore(); ctx.restore();
      },

      finish(status) {
        if (this.done) return;
        this.done = true;
        const r = this.rec, now = A.now(), ps = this.pulses, mean = xs => xs.reduce((a, b) => a + b, 0) / xs.length;
        r.status = status;
        r.duration_ms = this.tm(now);
        r.core = r.core || null;
        r.mood_vas = this.mood ?? null;
        const calmGames = this.games.filter(g => g.mode === 'calm' || g.mode === 'rest'), wakeGames = this.games.filter(g => g.mode === 'wake');
        r.adaptive = {
          mode_seconds: Object.fromEntries(Object.entries(this.modeSeconds).map(([k, v]) => [k, r1(v)])),
          transitions: this.transitions,
          minigames: this.games,
          calm_pulse_delta_bpm: calmGames.length ? r1(calmGames.reduce((a, g) => a + g.pulse_delta_bpm, 0)) : null,
          wake_pulse_delta_bpm: wakeGames.length ? r1(wakeGames.reduce((a, g) => a + g.pulse_delta_bpm, 0)) : null,
          perclos_mean: this.perclosN ? r3(this.perclosSum / this.perclosN) : null,
          touch_errors: this.games.reduce((a, g) => a + g.errors, 0),
        };
        r.vitals = ps.length ? { pulse_mean_bpm: r1(mean(ps)), pulse_min_bpm: r1(Math.min(...ps)), pulse_max_bpm: r1(Math.max(...ps)), pulse_source: Sim.live ? 'ky039' : 'simulated' } : null;
        if (status !== 'completed') Au.fadeOut(2);
        Au.pad(false); Au.crackle(false);
        A.bus.emit('ws', { type: 'session_end', ...r });
        A.bus.emit('sessionEnd', r);
      },
    };
    return s;
  };

  A.declinedRecord = () => ({
    schema: 'afferent.session/2', session_id: uuid(), device_id: A.config.deviceId, started_iso: isoLocal(new Date()),
    local_hour: r1(new Date().getHours() + new Date().getMinutes() / 60), status: 'declined', sharing: 'summary',
  });
})();
