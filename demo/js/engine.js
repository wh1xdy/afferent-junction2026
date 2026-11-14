(() => {
  const { clamp, lerp, ema, median, hex, uuid } = A;
  const { r1, r3, isoLocal } = A.Record;
  const Au = A.Audio, Eyes = A.Eyes, Sim = A.Sim, R = Math.random;

  const MODES = A.MODES = {
    calm: { biome: 'sauna', colour: '#F2B544', light: ['#FFC98A', 8], tempo: 54, density: 0.3, speed: 0.6 },
    flow: { biome: 'forest', colour: '#B9CAD6', light: ['#FFD9A0', 8], tempo: 66, density: 0.55, speed: 1 },
    wake: { biome: 'lake', colour: '#7FC8E8', light: ['#DDEBFF', 20], tempo: 76, density: 0.8, speed: 1.35 },
    fatigue: { biome: 'shore', colour: '#FFF3DC', light: ['#F4F7FF', 40], tempo: 84, density: 0.8, speed: 1.2 },
    rest: { biome: 'harbour', colour: '#5E6873', light: ['#000000', 0], tempo: 50, density: 0.2, speed: 0.4 },
  };
  const BLOOM_ORDER = ['yellow', 'blue', 'green'];
  const VIS = ['fog', 'stars', 'warm', 'aurora', 'exposure', 'lanternGain'];
  const REST_S = 6, CHECKIN_S = 10, RT_WINDOW = 1.5, END_IDLE_S = 20, DIM_AT = 4, DIM_S = 2.5, QUIET_CAP = 25;
  const PLAY_S = 76, PLAY_MIN_S = 60, SESSION_PLAY_END_S = 106, NIGHT_MODE_CAP = 8, MEASURE_EST_S = 18, FAT_ENTER = 0.45, FAT_EXIT = 0.3;
  const plausible = bpm => bpm != null && bpm >= 40 && bpm <= 150;

  A.makeVisual = (profile = 'live') => {
    const V = {
      t: 0, worldX: 0, walking: false, stride: 1,
      chunks: [{ type: 'harbour', x0: -700, x1: 420, seed: 1 }],
      sat: { yellow: 0.05, blue: 0.05, green: 0.05, dawn: 0 }, sweep: 0,
      aurora: 0.05, fog: 0.45, fogDrift: 1, stars: 120, warm: 0.04, sparkle: 0, daylight: 0,
      flame: 1, lanternRadius: 70, lanternBright: 1, sparks: [], iceGlow: 0, stove: 0, beam: 0,
      orb: { b: 0, hold: 0, sync: 0, alpha: 0 }, tapHint: 0, flash: 0, exposure: 1, sunP: 0,
      border: 0.1, borderColor: hex('#FFD9A0'), black: 1, profile,
    };
    A.applyProfileVisual(V, profile);
    return V;
  };

  A.applyProfileVisual = (V, profile, tween) => {
    const p = A.PROFILES[profile]?.visual || A.LIVE_VISUAL, to = {};
    for (const k of VIS) to[k] = p[k];
    V.profile = profile;
    if (!tween) { Object.assign(V, to); for (const g of ['yellow', 'blue', 'green']) V.sat[g] = Math.max(V.sat[g] > 0.2 ? V.sat[g] : 0, p.sat); return; }
    for (const k of VIS) tween(V, k, V[k], to[k], 2.5);
    for (const g of ['yellow', 'blue', 'green']) if (V.sat[g] < 0.3) tween(V.sat, g, V.sat[g], p.sat, 2.5);
  };

  A.startSession = opts => {
    const t0 = A.now(), night = opts.clock === 'night', profile = opts.profile || 'live';
    const cfg = A.Hub?.config;
    const baseline = cfg?.baseline_pulse_bpm ?? A.config.baselinePulse;
    Sim.reset(profile, t0); Eyes.reset();
    Sim.rest = baseline;
    const auto = opts.input === 'auto';
    if (auto && profile === 'live') Sim.offset = 20;
    const V = opts.visual || A.makeVisual(profile);
    const fromIdle = !!opts.visual && V.black < 0.5;

    const s = {
      t0, night, auto, stage: !!opts.stage, profile, V, fromIdle, phase: 'fadein', phaseAt: t0, done: false, pw: 1,
      targetX: 0, rest: baseline, a: 0, fat: 0, reading: 'flow', mode: 'flow', candidate: null, candidateAt: 0,
      game: null, gameMode: null, panel: null, lastGame: null, tasks: [], slot: 0, bloomIdx: 0, flameKick: 0, beatPhase: 0, orb: null, daylightBoost: 0,
      slots: { fork: cfg?.measurement_slots?.fork ?? 1, lanterns: cfg?.measurement_slots?.lanterns ?? 3 },
      weights: cfg?.task_weights ?? null, configReceived: !!cfg, eyesSource: A.Sensors.eyesSource(),
      core: { trials: [], trial: null, nextTrialAt: 0, pulse: [], pulseQ: [], closed: [], open: [], pitch: [], ambient: [], frames: 0, tracked: 0 },
      coreRec: null, moodEnd: undefined, pauses: 0, inputs: 0, lastLightLevel: null,
      sig: { pulse: [], pulseQ: [], pulseSources: {}, frames: 0, tracked: 0, ambient: [] },
      modeSeconds: { calm: 0, flow: 0, wake: 0, fatigue: 0, rest: 0 }, transitions: [], perclosSum: 0, perclosN: 0, closedRun: 0, played: new Set(),
      playSamples: [], tweens: [], playS: opts.stage ? 60 : PLAY_S,

      rec: {
        schema: 'afferent.session/3', session_id: uuid(), patient_id: A.config.patientId, device_id: A.config.deviceId, app_version: A.config.appVersion,
        started_iso: isoLocal(new Date()), local_hour: r1(new Date().getHours() + new Date().getMinutes() / 60), clock: night ? 'night' : 'morning', day_index: null,
        sharing: A.config.sharing, sensors: { ...A.config.sensors },
      },

      tm(now) { return Math.round((now - this.t0) * 1000); },
      ws(msg) { A.bus.emit('ws', { session_id: this.rec.session_id, ...msg }); },
      setPhase(p) { this.phase = p; this.phaseAt = A.now(); A.bus.emit('segment', p); },
      light(rgbHex, level, fade_ms, reason) {
        if (this.night && A.config.quietNight !== false) level = Math.min(level, QUIET_CAP);
        this.lastLightLevel = level;
        A.bus.emit('light', { rgb: rgbHex, level, fade_ms, reason });
        if (A.config.sensors.bedside_light) A.bus.emit('ws', { type: 'light', rgb: rgbHex, level, fade_ms, reason });
      },
      haptic() { navigator.vibrate?.(15); A.bus.emit('haptic'); },
      kick(x) { this.flameKick = Math.max(this.flameKick, x); },
      playLeft(now) { return this.playS - (now - (this.firstPlayAt ?? now)); },
      tween(obj, key, from, to, dur) { this.tweens = this.tweens.filter(x => !(x.obj === obj && x.key === key)); this.tweens.push({ obj, key, from, to, start: A.now(), dur }); },
      bloom(group, dur) { this.tween(V.sat, group, V.sat[group], 1, dur); },

      setProfile(p, now) {
        if (!A.PROFILES[p] || this.done) return;
        this.profile = p; this.pw = 1;
        Sim.applyProfile(p, now);
        A.applyProfileVisual(V, p, (o, k, a, b, d) => this.tween(o, k, a, b, d));
        A.bus.emit('profile', p);
      },

      startRest() { this.setPhase('rest'); },

      updateRest(now, dt, p, f) {
        const c = this.core;
        c.frames++;
        if (plausible(p.bpm)) { c.pulse.push(p.bpm); c.pulseQ.push(p.quality); }
        if (f?.tracked) {
          c.tracked++;
          if (f.eye_openness != null) { c.open.push(f.eye_openness); c.closed.push(1 - f.eye_openness); }
          if (f.head_pitch_deg != null) c.pitch.push(f.head_pitch_deg);
        }
        if (f?.ambient_light != null) c.ambient.push(f.ambient_light);
        if (now - this.phaseAt >= REST_S) {
          c.restEnd = now;
          c.blinks = Eyes.blinks.filter(t => t >= this.phaseAt && t <= now).length;
          if (c.closed.length) Eyes.setBaseline(median(c.closed));
          this.panel = A.makeCheckin(); this.panel.startAt = now;
          this.setPhase('checkin');
        }
      },

      updateCheckin(now, dt) {
        const g = this.panel;
        g.t += dt; g.update(dt, now);
        if (this.auto && !g.done) g.auto(dt, now);
        if (!g.done && g.t >= CHECKIN_S) { g.done = true; g.finishedAt = now; }
        if (g.done && now - g.finishedAt >= 0.5) {
          this.moodStart = g.choice; this.moodStartMs = g.decisionMs;
          A.bus.emit('mood', { which: 'start', value: g.choice });
          this.ws({ type: 'mood', which: 'start', value: g.choice });
          this.panel = null;
          this.core.nextTrialAt = now + 0.6;
          this.setPhase('rt');
        }
      },

      autoRt(n) {
        if (this.profile === 'bad_day') return n === 3 ? 1.3 : 0.62 + R() * 0.24;
        return this.profile === 'good_day' ? 0.29 + R() * 0.12 : 0.32 + R() * 0.14;
      },

      updateRt(now, dt) {
        const c = this.core, t = now - this.phaseAt;
        V.tapHint = t < 3 && !c.trials.length ? 1 : ema(V.tapHint, 0, dt, 0.3);
        let tr = c.trial;
        if (!tr && c.trials.length < 5 && now >= c.nextTrialAt) tr = c.trial = { fp: 1 + R() * 1.5, start: now, onset: null, autoAt: null };
        if (tr) {
          if (tr.onset === null && now - tr.start >= tr.fp) {
            tr.onset = now; V.flash = A.config.reducedMotion ? 0.35 : 1; this.kick(0.9); Au.piano(7, 0.16);
            if (this.auto) tr.autoAt = now + this.autoRt(c.trials.length + 1);
          } else if (tr.onset !== null && now - tr.onset > RT_WINDOW) this.resolveTrial(now, null);
          if (tr.autoAt && now >= tr.autoAt && c.trial === tr) this.coreTap(now);
        }
        if ((c.trials.length >= 5 && !c.trial) || t >= 24) this.finishCore(now);
      },

      coreTap(at) {
        const tr = this.core.trial;
        if (this.phase !== 'rt' || !tr) return;
        if (tr.onset === null) { if (at - tr.start >= 0.25) this.resolveTrial(at, (at - tr.start - tr.fp) * 1000); return; }
        this.resolveTrial(at, (at - tr.onset) * 1000);
      },

      resolveTrial(now, rt) {
        const c = this.core, outcome = rt === null ? 'miss' : rt < 150 ? 'anticipation' : rt <= 1000 ? 'hit' : 'lapse';
        const trial = { trial: c.trials.length + 1, foreperiod_ms: Math.round(c.trial.fp * 1000), rt_ms: rt === null ? null : Math.round(rt), outcome, modality: 'touch' };
        c.trials.push(trial);
        this.ws({ type: 'core_trial', ...trial });
        if (outcome === 'hit') { this.kick(0.5); V.sparkle = 0.6; }
        c.trial = null; c.nextTrialAt = now + 0.35;
      },

      buildCore(now) {
        if (this.stage) return { source: 'stored', baseline_pulse_bpm: this.rest };
        const c = this.core, q = (n, d) => d ? r3(n / d) : null, med = xs => xs.length ? median(xs) : null;
        const trackedRatio = q(c.tracked, c.frames), restS = Math.max(0.5, (c.restEnd ?? now) - (c.restStart ?? now));
        const pq = c.pulseQ.length ? c.pulseQ.reduce((a, b) => a + b, 0) / c.pulseQ.length : null;
        return {
          source: 'measured', duration_ms: Math.round((now - (c.restStart ?? now)) * 1000), baseline_pulse_bpm: this.rest,
          rest: {
            duration_ms: Math.round(restS * 1000), pulse_bpm: r1(med(c.pulse)), pulse_quality: pq === null ? null : r3(pq),
            blink_rate_per_min: c.open.length ? r1(c.blinks / restS * 60) : null, blink_count: c.open.length ? c.blinks : null,
            blink_quality: c.open.length ? r3(0.6 * trackedRatio) : null,
            eye_openness: c.open.length ? r3(med(c.open)) : null, eye_quality: c.open.length ? trackedRatio : null, eyes_tracked_ratio: trackedRatio,
            head_pitch_deg: r1(med(c.pitch)), head_pitch_quality: c.pitch.length ? q(c.pitch.length, c.frames) : null,
            ambient_light: c.ambient.length ? r3(med(c.ambient)) : null,
          },
          mood_start: this.moodStart ?? null, mood_start_ms: this.moodStartMs ?? null,
          rt: A.Record.rtStats(c.trials),
        };
      },

      finishCore(now) {
        const c = this.core;
        this.coreRec = this.buildCore(now);
        this.restPitch = this.coreRec.rest?.head_pitch_deg ?? null;
        const live = A.Sensors.pulse(now).bpm, startPulse = this.coreRec.rest?.pulse_bpm ?? (plausible(live) ? live : null);
        this.a = startPulse == null ? 0 : (startPulse - this.rest) / 10;
        this.fat = this.fatigueInput();
        if (!this.stage) this.playS = clamp(SESSION_PLAY_END_S - (now - this.t0), PLAY_MIN_S, PLAY_S);
        this.setMode(now, this.classify());
        c.trial = null;
        this.setPhase('walk');
        this.planWalk(now);
      },

      fatigueInput() { return clamp(Eyes.perclos() * 2 + Eyes.longClosures() * 0.12, 0, 1); },

      classify() {
        const tired = this.mode === 'rest' || this.mode === 'fatigue' ? FAT_EXIT : FAT_ENTER;
        if (this.fat >= tired) return this.night ? 'rest' : 'fatigue';
        if (this.a >= 0.8) return 'calm';
        if (this.a <= -0.3) return this.night ? 'flow' : 'wake';
        return 'flow';
      },

      modeLight(mode) {
        const [c, l] = MODES[mode].light;
        if (!this.night) return [c, l];
        if (mode === 'rest' || mode === 'fatigue') return ['#000000', 0];
        return [mode === 'calm' ? c : MODES.flow.light[0], Math.min(l, NIGHT_MODE_CAP)];
      },

      setMode(now, mode) {
        const from = this.transitions.length ? this.mode : null;
        this.transitions.push({ t_ms: this.tm(now), from, to: mode, arousal: r3(this.a), fatigue: r3(this.fat) });
        this.mode = mode; this.reading = mode; this.candidate = null;
        const [c, l] = this.modeLight(mode);
        this.light(c, l, 2000, 'mode');
        A.bus.emit('mode', mode);
        this.ws({ type: 'mode', mode, arousal: r3(this.a), fatigue: r3(this.fat), t_ms: this.tm(now) });
      },

      intensity(mode) {
        const prev = [...this.tasks].reverse().find(t => t.kind === 'adaptive'), adj = prev ? (prev.errors > 2 ? -0.15 : prev.errors === 0 ? 0.1 : 0) : 0;
        const k = { calm: (this.a - 0.5) / 1.5, wake: -this.a, fatigue: this.fat, flow: 0.4, rest: 0.5 }[mode];
        return clamp(k + adj, 0, 1);
      },

      planWalk(now) {
        const last = V.chunks[V.chunks.length - 1];
        const c = { type: MODES[this.mode].biome, x0: last.x1, x1: last.x1 + 560, seed: Math.floor(R() * 1e6) };
        V.chunks.push(c);
        if (V.chunks.length > 6) V.chunks.shift();
        this.targetX = c.x0 + 240;
        const next = this.measureAt(this.slot + 1), calmPace = this.mode === 'calm' || this.mode === 'rest';
        this.walkSpeed = (this.targetX - V.worldX) / (next ? 2 : calmPace ? 3 : 2.5);
      },

      measuresPending(slot) { return [this.slots.fork, this.slots.lanterns].filter(x => x > slot).length; },

      pick(mode) {
        const ids = Object.keys(A.MINIGAMES).filter(id => A.MINIGAMES[id].modes.includes(mode));
        const w = this.weights?.[mode], wt = id => w ? Math.max(0, w[id] ?? 0) : 1;
        const fresh = ids.filter(id => !this.played.has(id) && wt(id) > 0);
        if (!fresh.length) return A.pickGame(mode, this.lastGame, w);
        const { id } = A.pickGame(mode, this.lastGame, Object.fromEntries(ids.map(x => [x, fresh.includes(x) ? wt(x) : 0])));
        return { id, weight: w ? w[id] ?? null : null };
      },

      measureAt(slot) { return slot === this.slots.fork ? 'fork' : slot === this.slots.lanterns ? 'lanterns' : null; },

      startGame(now) {
        let slot = ++this.slot;
        if (this.night && this.mode !== 'rest' && this.classify() === 'rest') this.setMode(now, 'rest');
        const mode = this.mode;
        this.story('start', slot, now);
        while (this.measureAt(slot) && mode === 'rest') {
          const rec = A.Record.skipped(this.measureAt(slot), slot, mode, this.tm(now), 'rest_mode');
          this.tasks.push(rec);
          this.ws({ type: 'task_end', task: rec });
          slot = ++this.slot;
        }
        const measure = this.measureAt(slot);
        let id, g, k = null, weight = null;
        if (measure) { id = measure; g = A.MEASURES[id].make(); }
        else {
          const w = this.weights?.[mode];
          if (mode === 'rest') { id = 'breath'; weight = w?.breath ?? null; }
          else ({ id, weight } = this.pick(mode));
          k = this.intensity(mode);
          g = A.MINIGAMES[id].make(k, { endless: mode === 'rest' });
          g.world = !!A.MINIGAMES[id].world;
          if (id === 'breath' && mode !== 'rest' && this.playLeft(now) - MEASURE_EST_S * this.measuresPending(slot) < 40) { g.cycles = 1; g.max = Math.min(g.max, 12); }
          if (mode !== 'rest') g.max = Math.min(g.max, Math.max(8, this.playLeft(now) + 3));
          this.lastGame = id;
          if (mode !== 'rest') this.played.add(id);
        }
        const kind = measure ? 'measurement' : 'adaptive', taskMode = measure ? 'measure' : mode;
        Object.assign(g, { mode: taskMode, k: k ?? 0, startAt: now, slot, kind });
        this.game = g; this.gameMode = taskMode;
        this.track = A.Record.track({ id, slot, kind, mode: taskMode, director_mode: mode, intensity: k === null ? null : r3(k), weight_used: weight === null ? null : r3(weight) }, now);
        if (taskMode === 'calm' || taskMode === 'rest') Au.pad(true);
        if (MODES[mode].biome === 'sauna' && !measure) Au.crackle(true);
        this.setPhase('game');
        A.bus.emit('game', { id, mode: taskMode, k: k ?? 0, slot, kind });
        this.ws({ type: 'game', id, slot, kind, mode: taskMode, intensity: k === null ? null : r3(k), weight_used: weight === null ? null : r3(weight), t_ms: this.tm(now) });
      },

      closeTask(now, by) {
        const g = this.game, p = A.Sensors.pulse(now);
        const out = { completed_by: by, completed: g.done, items: g.items, errors: g.errors, sessionT0: this.t0 };
        if (g.id === 'breath') out.breath_sync = g.sync;
        if (g.id === 'fork') { this.forkRec = A.Record.fork(g); out.extra = { glows: g.glows, hard_sides: g.choices.map(c => c.hard_side) }; out.completed = g.done && this.forkRec.choices.every(c => c.completed); }
        if (g.id === 'lanterns') { this.lanternRec = A.Record.lanterns(g); out.extra = { rewards_rich: g.rewards.rich, rewards_lean: g.rewards.lean }; }
        const rec = this.track.finish(now, out, p);
        this.tasks.push(rec); this.track = null;
        this.ws({ type: 'task_end', task: rec });
        Au.pad(false); Au.crackle(false);
        this.game = null; this.gameMode = null; this.daylightBoost = 0;
        return g;
      },

      endGame(now, by) {
        const g = this.closeTask(now, by);
        if (g.mode === 'fatigue') Sim.drowsy *= 0.45;
        this.story('end', g.slot, now);
        if (this.bloomIdx < BLOOM_ORDER.length) this.bloom(BLOOM_ORDER[this.bloomIdx++], by === 'auto' ? 5 : 1.5);
        if (g.mode === 'wake') this.tween(V, 'iceGlow', V.iceGlow, 1, 2);
        if (g.id === 'breath' || g.mode === 'calm' || g.id === 'lanterns') this.tween(V, 'aurora', V.aurora, Math.min(1, V.aurora + 0.3), 2);
        this.outroUntil = now + 0.6;
        if (this.playLeft(now) <= 6 || g.mode === 'rest') { this.startDawn(now); return; }
        this.setPhase('walk');
        this.planWalk(now);
      },

      startDawn(now) {
        this.dawnAt = now;
        this.setPhase('dawn');
        Au.dawnPhrase();
        const hexc = this.night ? '#FFC98A' : '#FFF3DC', level = this.night ? A.config.dawnLevel : 60;
        V.borderColor = hex(hexc);
        this.light(hexc, level, 4000, 'dawn');
      },

      fallAsleep(now) {
        if (this.game) this.closeTask(now, 'auto');
        Au.fadeOut(4);
        this.tween(V, 'black', V.black, 1, 3);
        this.light('#000000', 0, 3000, 'asleep');
        this.setPhase('asleep');
        setTimeout(() => this.finish('fell_asleep'), 3200);
      },

      story(ev, slot, now) {
        if (!this.auto || this.profile !== 'live') return;
        const lanterns = this.slots.lanterns, calmSlot = this.slots.fork + 1;
        if (ev === 'start' && slot === 1) this.played.add(this.night ? 'breath' : 'loyly');
        if (ev === 'end' && slot === calmSlot && slot !== lanterns && !this.night) Sim.offset = -10;
        const g = this.game?.slot === lanterns ? this.game : null;
        const due = ev === 'end' ? slot === lanterns : ev === 'tick' && g && (g.trials?.length ?? 0) >= 10;
        if (due && !this.drowsyDone) { this.drowsyDone = true; Sim.drowsy = 1; }
      },

      director(now, dt, p) {
        if (plausible(p.bpm)) this.a = ema(this.a, (p.bpm - this.rest) / 10, dt, 3);
        this.fat = ema(this.fat, this.fatigueInput(), dt, 2);
        this.reading = this.classify();
        if (this.reading !== this.mode) {
          if (this.candidate !== this.reading) { this.candidate = this.reading; this.candidateAt = now; }
          if (now - this.candidateAt >= 3) this.setMode(now, this.reading);
        } else this.candidate = null;
        this.modeSeconds[this.mode] += dt;
        this.perclosSum += Eyes.perclos(); this.perclosN++;
      },

      style(now, dt) {
        const m = this.mode, k = this.intensity(m), cfg = MODES[m], prof = A.PROFILES[this.profile]?.visual;
        const tgt = {
          calm: { warm: 0.15, fog: 0.6, stars: 60, beam: 0, daylight: 0, exposure: 0.92 },
          flow: { warm: 0.04, fog: 0.35, stars: 120, beam: 0.1, daylight: 0, exposure: 1 },
          wake: { warm: 0, fog: 0.15, stars: 200, beam: 0.6 + 0.4 * k, daylight: 0.05, exposure: 1 },
          fatigue: { warm: 0, fog: 0.1, stars: 40, beam: 1, daylight: 0.45 + 0.3 * k + 0.25 * this.daylightBoost, exposure: 1 },
          rest: { warm: 0.1, fog: 0.7, stars: 80, beam: 0, daylight: 0, exposure: 0.7 },
        }[m];
        this.pw = ema(this.pw, 0.3, dt, 40);
        if (prof) for (const key of ['warm', 'fog', 'stars', 'exposure']) tgt[key] = lerp(tgt[key], prof[key], this.pw);
        V.lanternGain = ema(V.lanternGain, lerp(1, prof?.lanternGain ?? 1, this.pw), dt, 2);
        for (const key of ['warm', 'fog', 'stars', 'beam', 'daylight', 'exposure']) V[key] = ema(V[key], tgt[key], dt, 2);
        V.fogDrift = m === 'calm' || m === 'rest' ? 0.5 : 1 + k;
        V.sparkle = ema(V.sparkle, m === 'wake' ? 0.3 + 0.5 * k : 0, dt, 1);
        V.border = ema(V.border, m === 'fatigue' && !this.night ? 0.25 : 0.1, dt, 1.5);
        this.speed = 150 * cfg.speed * (m === 'wake' ? 1 + 0.3 * k : 1);
        V.stride = cfg.speed;
        if (this.phase !== 'dawn' && this.phase !== 'end') Au.tick(cfg.tempo + (m === 'wake' ? 20 * k : 0), cfg.density, m !== 'calm' && m !== 'rest');
      },

      sample(now, dt, p, f) {
        const sig = this.sig;
        sig.frames++;
        if (f?.tracked) sig.tracked++;
        if (f?.ambient_light != null && sig.frames % 15 === 0) sig.ambient.push(f.ambient_light);
        if (p.bpm != null) {
          sig.pulseSources[p.source] = (sig.pulseSources[p.source] || 0) + 1;
          if (sig.frames % 6 === 0) { sig.pulse.push(p.bpm); sig.pulseQ.push(p.quality); }
        }
        if (this.phase === 'walk' || this.phase === 'game') {
          this.playSamples.push([now, p.bpm, f?.tracked ? f.head_pitch_deg : null, f?.tracked ? f.eye_openness : null]);
          while (this.playSamples.length && this.playSamples[0][0] < now - 6) this.playSamples.shift();
        }
        this.track?.frame(now, dt, f, p, Eyes.closed, this.restPitch);
      },

      endWindow() {
        const col = i => this.playSamples.map(x => x[i]).filter(x => x !== null && x !== undefined);
        const med = xs => xs.length ? median(xs) : null;
        return { pulse: med(col(1)), pitch: med(col(2)), open: med(col(3)) };
      },

      liveMetrics(now) {
        const p = A.Sensors.pulse(now), f = A.Sensors.last, phase = this.phase;
        return {
          type: 'live_metrics', session_id: this.rec.session_id, patient_id: A.config.patientId, t_ms: this.tm(now), phase,
          mode: ['walk', 'game', 'dawn'].includes(phase) ? this.mode : null, task_id: this.game?.id ?? null, slot: this.game?.slot ?? null,
          pulse_bpm: p.bpm == null ? null : r1(p.bpm), pulse_quality: p.bpm == null ? null : p.quality, pulse_source: p.source,
          eye_openness: f?.tracked ? r3(f.eye_openness) : null, perclos: r3(Eyes.perclos()), blink: Eyes.closed,
          head_pitch_deg: f?.tracked && f.head_pitch_deg != null ? r1(f.head_pitch_deg) : null, face_tracked: !!f?.tracked,
          arousal: r3(this.a), fatigue: r3(this.fat), ambient_light: f?.ambient_light == null ? null : r3(f.ambient_light),
          profile: this.profile, simulated: p.source === 'simulated' || this.eyesSource === 'simulated' || this.auto || this.profile !== 'live',
        };
      },

      update(now, dt) {
        V.t = now;
        for (const tw of this.tweens) tw.obj[tw.key] = lerp(tw.from, tw.to, A.ease((now - tw.start) / tw.dur));
        this.tweens = this.tweens.filter(tw => now - tw.start < tw.dur);
        if (this.phase === 'end' && this.night) this.dimEnd(now);
        if (this.done) return;
        const t = now - this.phaseAt;
        Sim.step(dt, this, now);
        const p = A.Sensors.pulse(now), f = A.Sensors.last;
        if (this.phase !== 'fadein') this.sample(now, dt, p, f);

        const dx = this.targetX - V.worldX;
        V.walking = Math.abs(dx) > 1;
        if (V.walking) V.worldX += Math.sign(dx) * Math.min(Math.abs(dx), Math.max(this.speed || 150, this.walkSpeed || 0) * dt);

        this.beatPhase += dt;
        if (this.beatPhase >= 1) {
          this.beatPhase -= 1; this.kick(0.03);
          const n = Math.round(5 * V.sparkle);
          for (let i = 0; i < n; i++) V.sparks.push({ born: now, dx: R() * 2 - 1, dy: -R() });
          if (V.sparks.length > 40) V.sparks.splice(0, V.sparks.length - 40);
        }
        this.flameKick = ema(this.flameKick, 0, dt, 0.2);
        V.flame = 1 + this.flameKick;
        V.flash = ema(V.flash, 0, dt, 0.25);
        V.lanternBright = (1 + 0.5 * this.flameKick) * V.lanternGain;
        V.lanternRadius = 70 * V.lanternGain;
        V.orb.alpha = ema(V.orb.alpha, this.game?.id === 'breath' ? 1 : 0, dt, 0.5);
        if (this.orb) { V.orb.b = this.orb.b; V.orb.hold = this.orb.hold; V.orb.sync = this.orb.sync; }
        V.stove = this.game?.id === 'breath' ? 0.3 + 0.4 * V.orb.b : ema(V.stove, MODES[this.mode]?.biome === 'sauna' ? 0.4 : 0, dt, 1);

        if (this.phase === 'fadein') {
          V.black = this.fromIdle ? 0.35 * Math.sin(Math.PI * clamp(t / 2, 0, 1)) : 1 - clamp(t / 2, 0, 1);
          if (t >= 2) { this.core.restStart = now; this.stage ? this.finishCore(now) : this.startRest(); }
          return;
        }
        if (this.phase === 'rest') { this.updateRest(now, dt, p, f); return; }
        if (this.phase === 'checkin') { this.updateCheckin(now, dt); return; }
        if (this.phase === 'rt') { this.updateRt(now, dt); return; }
        if (this.phase === 'asleep') return;

        if (this.phase === 'walk' || this.phase === 'game') {
          if (!this.firstPlayAt) this.firstPlayAt = now;
          this.story('tick', this.slot, now);
          this.director(now, dt, p);
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
          else if (g.id === 'breath' && g.mode === 'rest' && this.playLeft(now) <= 0) this.endGame(now, 'touch');
        }
        if (this.phase === 'dawn') {
          const t = now - this.phaseAt, k = clamp(t / 4, 0, 1);
          if (this.night) { for (const g of ['yellow', 'blue', 'green']) V.sat[g] = Math.max(V.sat[g], k); V.aurora = Math.max(V.aurora, k); }
          V.sweep = k; V.sunP = k; V.border = lerp(0.1, 0.22, k); V.daylight = ema(V.daylight, 0, dt, 1);
          if (t >= 4) { V.sat.dawn = 1; V.sweep = 0; this.setPhase('end'); A.bus.emit('endScreen'); }
        }
        if (this.phase === 'end') {
          const t = now - this.phaseAt;
          if (this.auto && this.moodEnd === undefined && t >= 2) this.setMood({ good_day: 5, bad_day: 2, live: 4 }[this.profile]);
          if (this.moodEnd !== undefined ? now - this.moodAt >= 1.2 : t >= END_IDLE_S) this.close();
        }
      },

      engaged() { return this.auto || this.inputs > 0; },

      close() { this.finish(this.phase === 'end' && this.engaged() ? 'completed' : 'partial'); },

      dimEnd(now) {
        const idleAt = this.night ? DIM_AT : END_IDLE_S, t = now - this.phaseAt, at = this.moodEnd !== undefined ? Math.min(idleAt, this.moodAt - this.phaseAt + 1.2) : idleAt;
        if (this.dimAt === undefined || at < this.dimAt) this.dimAt = Math.max(at, t);
        V.black = 0.8 * A.ease(clamp((t - this.dimAt) / DIM_S, 0, 1));
        if (t >= this.dimAt && !this.dimmed) { this.dimmed = true; A.bus.emit('endDim'); }
      },

      setMood(v) {
        if (this.done || this.phase !== 'end' || this.moodEnd !== undefined) return;
        this.moodEnd = v; this.moodAt = A.now();
        A.bus.emit('mood', { which: 'end', value: v });
        this.ws({ type: 'mood', which: 'end', value: v });
        if (v === 1 && this.coreRec?.mood_start === 1) A.bus.emit('crisisOffer', 'mood');
      },

      handle(type, d) {
        if (this.done) return;
        if (type === 'pdown' || type === 'key') this.inputs++;
        if (type === 'exit') { this.finish('partial'); return; }
        if (this.phase === 'rt' && (type === 'pdown' || type === 'key')) { this.coreTap(d.t); return; }
        const g = this.phase === 'checkin' ? this.panel : this.phase === 'game' ? this.game : null;
        if (!g || g.world || g.done || type === 'key') return;
        const b = this.box(), u = (d.x - b.x) / b.w, v = (d.y - b.y) / b.h;
        if (type === 'pdown') g.down?.(u, v, d.t);
        if (type === 'pmove') g.move?.(u, v, d.t);
        if (type === 'pup') g.up?.(u, v, d.t);
      },

      box() {
        const { W, H } = A.World.size();
        if (this.phase === 'checkin') return { x: W * 0.07, y: H * 0.2, w: W * 0.86, h: H * 0.24 };
        return { x: W * 0.07, y: H * 0.12, w: W * 0.86, h: H * 0.46 };
      },

      drawOverlay(ctx, now) {
        const g = this.panel || this.game;
        const show = g && !g.world ? (g.done ? clamp(1 - (now - g.finishedAt) / 0.5, 0, 1) : clamp((now - g.startAt) / 0.35, 0, 1)) : 0;
        if (show <= 0) return;
        const b = this.box(), measure = g.kind === 'measurement';
        ctx.save();
        ctx.globalAlpha = show;
        const sc = A.config.reducedMotion ? 1 : 0.94 + 0.06 * show;
        ctx.translate(b.x + b.w / 2, b.y + b.h / 2); ctx.scale(sc, sc); ctx.translate(-(b.x + b.w / 2), -(b.y + b.h / 2));
        if (A.World.panel) A.World.panel(ctx, b, { done: g.done, measure });
        else {
          ctx.fillStyle = 'rgba(10,12,17,0.86)';
          ctx.strokeStyle = g.done ? 'rgba(255,217,160,0.8)' : measure ? 'rgba(183,156,255,0.26)' : 'rgba(255,217,160,0.22)';
          ctx.lineWidth = g.done ? 2 : 1;
          ctx.beginPath(); ctx.roundRect(b.x, b.y, b.w, b.h, 22); ctx.fill(); ctx.stroke();
        }
        ctx.save(); ctx.beginPath(); ctx.roundRect(b.x, b.y, b.w, b.h, 22); ctx.clip();
        g.draw(ctx, b, now);
        const p = g.bar ? g.bar() : clamp(1 - g.t / g.max, 0, 1);
        if (p !== null) { ctx.fillStyle = measure ? 'rgba(183,156,255,0.3)' : 'rgba(255,217,160,0.25)'; ctx.fillRect(b.x, b.y + b.h - 3, b.w * clamp(p, 0, 1), 3); }
        ctx.restore(); ctx.restore();
      },

      finish(status) {
        if (this.done) return;
        if (this.game) this.closeTask(A.now(), 'auto');
        if (!this.coreRec && status !== 'declined') this.coreRec = this.phase === 'fadein' ? null : this.buildCore(A.now());
        this.done = true; this.panel = null;
        const doc = A.Record.session(this, status);
        if (status !== 'completed') Au.fadeOut(2);
        Au.pad(false); Au.crackle(false);
        this.ws({ type: 'session_end', session: doc });
        A.bus.emit('sessionEnd', doc);
      },
    };
    return s;
  };

  A.declinedRecord = profile => ({
    schema: 'afferent.session/3', session_id: uuid(), patient_id: A.config.patientId, device_id: A.config.deviceId, app_version: A.config.appVersion,
    started_iso: isoLocal(new Date()), local_hour: r1(new Date().getHours() + new Date().getMinutes() / 60), day_index: null,
    status: 'declined', profile, simulated: profile !== 'live', sharing: A.config.sharing,
  });
})();
