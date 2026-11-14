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
  const DAWN_S = 8, PLAY_S = 76, PLAY_MIN_S = 60, SESSION_PLAY_END_S = 102, NIGHT_MODE_CAP = 8, MEASURE_EST_S = 18, FAT_ENTER = 0.45, FAT_EXIT = 0.3;
  const MEASURE_RIDE_S = 20, BREATH_RESULT_S = 8, SPARK_S = 0.7, SPARK_C = hex('#FFD9A0');
  const SEC_HILL = { calm: 9.5, flow: 4.2, wake: 2.8, fatigue: 2.9 };
  const plausible = bpm => bpm != null && bpm >= 40 && bpm <= 150;
  const RP = () => A.PRESENT?.reaction || {};
  const hold = g => clamp(g.outro ?? 0.7, 0.7, 2.2);
  const forced = () => { const f = A.config?.forceTask; return f && (f === 'reaction' || A.MINIGAMES?.[f] || A.MEASURES?.[f]) ? f : null; };

  A.makeVisual = (profile = 'live') => {
    const V = {
      t: 0, worldX: 0, walking: false, stride: 1,
      chunks: [{ type: 'harbour', x0: -700, x1: 420, seed: 1 }],
      sat: { yellow: 0.05, blue: 0.05, green: 0.05, dawn: 0 }, sweep: 0,
      aurora: 0.05, fog: 0.45, fogDrift: 1, stars: 120, warm: 0.04, sparkle: 0, daylight: 0,
      flame: 1, lanternRadius: 70, lanternBright: 1, sparks: [], iceGlow: 0, stove: 0, beam: 0,
      orb: { b: 0, hold: 0, sync: 0, alpha: 0 }, tapHint: 0, flash: 0, exposure: 1, sunP: 0,
      border: 0.1, borderColor: hex('#FFD9A0'), black: 1, profile,
      ride: null, terrain: null, cam: { x: 0, y: 0, z: 1 }, daylightRide: 0, dawnT: 0,
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
    A.Sensors.lockPulse(t0);
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
      playSamples: [], tweens: [], playS: opts.stage ? 60 : PLAY_S, physio: A.Record.physioTrack(t0), face: A.Record.faceTrack(),

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
        if (A.config.sensors.bedside_light && A.Hub?.connected) this.lastLightLevel = level;
        A.bus.emit('light', { rgb: rgbHex, level, fade_ms, reason });
        if (A.config.sensors.bedside_light) A.bus.emit('ws', { type: 'light', rgb: rgbHex, level, fade_ms, reason });
      },
      haptic(name = 'light') { if (A.J) A.J.hap(name); else { navigator.vibrate?.(15); A.bus.emit('haptic'); } },
      kick(x) { this.flameKick = Math.max(this.flameKick, x); },
      kindleFrom(i, now) {
        const b = this.box();
        this.spark = { x0: b.x + b.w * (0.05 + 0.9 * (i + 0.5) / 5), y0: b.y + b.h * 0.5, at: now, lit: false };
      },
      updateSpark(now) {
        const sp = this.spark;
        if (!sp || sp.lit || now - sp.at < SPARK_S) return;
        sp.lit = true; this.kick(0.6); Au.piano(9, 0.1); this.haptic('light');
        for (let i = 0; i < 6; i++) V.sparks.push({ born: now, dx: R() * 2 - 1, dy: -R() });
      },
      drawSpark(ctx, now) {
        const sp = this.spark;
        if (!sp) return;
        const t = (now - sp.at) / SPARK_S;
        if (t >= 1.6) { this.spark = null; return; }
        if (t >= 1) return;
        const [x1, y1] = A.World.lanternPos(), e = A.ease(clamp(t, 0, 1)), cx = (sp.x0 + x1) / 2, cy = Math.min(sp.y0, y1) - 40;
        const at = k => [lerp(lerp(sp.x0, cx, k), lerp(cx, x1, k), k), lerp(lerp(sp.y0, cy, k), lerp(cy, y1, k), k)];
        for (let j = 4; j >= 0; j--) {
          const [x, y] = at(clamp(e - j * 0.05, 0, 1)), a = (1 - j / 5) * (A.config.reducedMotion ? 0.6 : 1);
          A.MINI.glow(ctx, x, y, 14 - 2 * j, SPARK_C, 0.55 * a);
        }
        const [x, y] = at(e);
        ctx.fillStyle = 'rgba(255,240,214,0.95)';
        ctx.beginPath(); ctx.arc(x, y, 2.6, 0, 6.29); ctx.fill();
      },
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
        this.T.coreKindle(now, dt);
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
          this.startRt(now);
        }
      },

      startRt(now) {
        this.core.nextTrialAt = now + 0.3 + (RP().leadIn || 0);
        this.rtArmed = this.auto || this.moodStart != null;
        this.setPhase('rt');
      },

      autoRt(n) {
        if (this.profile === 'bad_day') return n === 3 ? 1.3 : 0.62 + R() * 0.24;
        return this.profile === 'good_day' ? 0.29 + R() * 0.12 : 0.32 + R() * 0.14;
      },

      updateRt(now, dt) {
        const c = this.core, t = now - this.phaseAt;
        RP().update?.(this, now, dt);
        if (!this.rtArmed) { this.phaseAt = now; c.nextTrialAt = now + 0.3 + (RP().leadIn || 0); return; }
        let tr = c.trial;
        if (!tr && c.trials.length < 5 && now >= c.nextTrialAt) tr = c.trial = { fp: 1 + R() * 1.5, start: now, onset: null, autoAt: null };
        if (tr) {
          if (tr.onset === null && now - tr.start >= tr.fp) {
            tr.onset = now; RP().onset?.(this, tr, now);
            if (this.auto) tr.autoAt = now + this.autoRt(c.trials.length + 1);
          } else if (tr.onset !== null && now - tr.onset > RT_WINDOW) this.resolveTrial(now, null);
          if (tr.autoAt && now >= tr.autoAt && c.trial === tr) this.coreTap(now);
        }
        if ((c.trials.length >= 5 && !c.trial) || t >= 24) this.finishCore(now);
      },

      coreTap(at) {
        const tr = this.core.trial;
        if (this.phase !== 'rt' || !tr) return;
        if (tr.onset === null) { const ok = at - tr.start >= 0.25; RP().early?.(this, tr, at, !ok); if (ok) this.resolveTrial(at, (at - tr.start - tr.fp) * 1000); return; }
        this.resolveTrial(at, (at - tr.onset) * 1000);
      },

      resolveTrial(now, rt) {
        const c = this.core, outcome = rt === null ? 'miss' : rt < 150 ? 'anticipation' : rt <= 1000 ? 'hit' : 'lapse';
        const trial = { trial: c.trials.length + 1, foreperiod_ms: Math.round(c.trial.fp * 1000), rt_ms: rt === null ? null : Math.round(rt), outcome, modality: 'touch' };
        c.trials.push(trial);
        this.ws({ type: 'core_trial', ...trial });
        RP().resolve?.(this, trial, now);
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
            blink_quality: c.open.length ? trackedRatio : null,
            eye_openness: c.open.length ? r3(med(c.open)) : null, eye_quality: c.open.length ? trackedRatio : null, eyes_tracked_ratio: trackedRatio,
            head_pitch_deg: r1(med(c.pitch)), head_pitch_quality: c.pitch.length ? q(c.pitch.length, c.frames) : null,
            ambient_light: c.ambient.length ? r3(med(c.ambient)) : null,
          },
          mood_start: this.moodStart ?? null, mood_start_ms: this.moodStartMs ?? null,
          rt: { ...A.Record.rtStats(c.trials), stimulus: RP().stimulus ?? null },
        };
      },

      finishCore(now) {
        const c = this.core;
        this.coreRec = this.buildCore(now);
        A.Skill?.coreDone(this.coreRec);
        this.restPitch = this.coreRec.rest?.head_pitch_deg ?? null;
        const live = A.Sensors.pulse(now).bpm, startPulse = this.coreRec.rest?.pulse_bpm ?? (plausible(live) ? live : null);
        this.a = startPulse == null ? 0 : (startPulse - this.rest) / 10;
        this.fat = this.fatigueInput();
        if (!this.stage) this.playS = clamp(SESSION_PLAY_END_S - (now - this.t0), PLAY_MIN_S, PLAY_S);
        this.setMode(now, this.classify());
        c.trial = null;
        RP().done?.(this, now);
        this.coreHoldUntil = now + clamp(RP().outro || 0, 0, 2.2);
        this.holdUntil = this.coreHoldUntil;
        if (forced()) this.playS = 900;
        this.setPhase('walk');
        if (forced() !== 'reaction') this.T.launch(now);
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
        const k = { calm: (this.a - 0.5) / 1.5, wake: -this.a, fatigue: this.fat, flow: 0.4, rest: 0.5 }[mode];
        return clamp(k, 0, 1);
      },

      measuresPending(slot) { return [this.slots.fork, this.slots.lanterns].filter(x => x > slot).length; },

      pick(mode) {
        const { id, p } = A.pickGame(mode, this.lastGame, this.played);
        return { id, p: r3(p) };
      },

      measureAt(slot) { return slot === this.slots.fork ? 'fork' : slot === this.slots.lanterns ? 'lanterns' : null; },

      measureNext(slot) { return [this.slots.fork, this.slots.lanterns].filter(x => x > slot).sort((a, b) => a - b)[0] ?? null; },

      planNext(now) {
        const m = this.mode;
        if (m === 'rest') return { kind: 'drift' };
        const hills = { calm: 1, flow: 1, wake: 2, fatigue: 2 }[m] || 1;
        if (forced()) return { kind: 'task', hills };
        const left = this.playLeft(now), pend = this.measuresPending(this.slot), ride = (SEC_HILL[m] || 4) + 3;
        const short = left - ride * hills - (MEASURE_RIDE_S + ride) * pend < 12;
        if (this.measureAt(this.slot + 1)) return { kind: 'task', hills: short ? 1 : hills };
        if (left - ride - (MEASURE_RIDE_S + ride) * pend - 5 >= 10) return { kind: 'task', hills: short ? 1 : hills };
        if (pend > 0) { this.slot = this.measureNext(this.slot) - 1; return { kind: 'task', hills: 1 }; }
        return { kind: 'summit', seconds: clamp(left, 4, 12) };
      },

      planTask(now) {
        let slot = ++this.slot;
        if (this.night && this.mode !== 'rest' && this.classify() === 'rest') this.setMode(now, 'rest');
        const mode = this.mode;
        this.story('start', slot, now);
        const force = forced(), forceMeasure = force && A.MEASURES[force] ? force : null, forceGame = force && A.MINIGAMES[force] ? force : null;
        while (!force && this.measureAt(slot) && mode === 'rest') {
          const rec = A.Record.skipped(this.measureAt(slot), slot, mode, this.tm(now), 'rest_mode');
          this.tasks.push(rec);
          this.ws({ type: 'task_end', task: rec });
          slot = ++this.slot;
        }
        const measure = force ? forceMeasure : this.measureAt(slot);
        let id, k = null, weight = null, p = null, gameMode = mode;
        if (measure) id = measure;
        else {
          if (forceGame) { id = forceGame; if (!A.MINIGAMES[id].modes.includes(mode)) gameMode = A.MINIGAMES[id].modes[0]; }
          else if (mode === 'rest') { id = 'breath'; p = 1; }
          else ({ id, p } = this.pick(mode));
          k = Number.isFinite(A.config?.forceK) ? clamp(A.config.forceK, 0, 1) : this.intensity(gameMode);
          this.lastGame = id;
          if (gameMode !== 'rest') this.played.add(id);
        }
        this.next = { slot, id, measure, mode, gameMode, k, weight, p };
        return this.next;
      },

      startGame(now) {
        let n = this.next || this.planTask(now);
        if (this.night && n.mode !== 'rest' && (this.mode === 'rest' || this.classify() === 'rest')) {
          if (n.gameMode !== 'rest') this.played.delete(n.id);
          this.slot = n.slot - 1; this.next = null; n = this.planTask(now);
        }
        this.next = null;
        const { slot, id, measure, mode, gameMode } = n, k = n.k, weight = n.weight, assignP = n.p ?? null;
        let g;
        A.J?.reset(now);
        try { g = measure ? A.MEASURES[id].make() : (A.Skill?.start(id, gameMode, k), A.MINIGAMES[id].make(k, { endless: gameMode === 'rest' })); }
        catch (e) {
          console.error('task failed to start', id, e);
          if (A.Skill?.cur?.id === id) A.Skill.cur = null;
          this.played.add(id); this.slot = slot - 1;
          if (!measure && !this.retried) { this.retried = true; this.startGame(now); this.retried = false; return; }
          this.slot = slot; this.setPhase('walk'); this.T.resume(now, { done: false }, now);
          return;
        }
        if (!measure) {
          g.world = !!A.MINIGAMES[id].world;
          // Games always play to their end; the session clock only decides which game fits next, never cuts one short.
          if (id === 'breath' && gameMode !== 'rest' && this.playLeft(now) - MEASURE_EST_S * this.measuresPending(slot) < 40) g.cycles = 1;
        }
        g.bare ??= true;
        if (!measure) g.rt = A.RT?.log() ?? null;
        const kind = measure ? 'measurement' : 'adaptive', taskMode = measure ? 'measure' : gameMode, def = A.MINIGAMES[id];
        A.J?.beat.set(def?.bpm ? def.bpm(MODES[gameMode].tempo, k ?? 0) : MODES[gameMode].tempo, now);
        Object.assign(g, { mode: taskMode, k: k ?? 0, startAt: now, slot, kind, inputs0: this.inputs });
        this.game = g; this.gameMode = taskMode;
        if (this.T.taskStart(g, now) && A.Skill?.cur?.id === id) { const c = A.Skill.cur; c.c = c.tiers[0]; c.tier = 1; c.carry = true; }
        this.track = A.Record.track({ id, slot, kind, mode: taskMode, director_mode: mode, intensity: k === null ? null : r3(k), weight_used: weight === null ? null : r3(weight), assign_p: assignP }, now);
        if (taskMode === 'calm' || taskMode === 'rest') Au.pad(true);
        if (MODES[mode].biome === 'sauna' && !measure) Au.crackle(true);
        this.setPhase('game');
        A.bus.emit('game', { id, mode: taskMode, k: k ?? 0, slot, kind });
        this.ws({ type: 'game', id, slot, kind, mode: taskMode, intensity: k === null ? null : r3(k), weight_used: weight === null ? null : r3(weight), assign_p: assignP, t_ms: this.tm(now) });
      },

      closeTask(now, by) {
        const g = this.game, p = A.Sensors.pulse(now);
        const out = { completed_by: by, completed: g.done, items: g.items, errors: g.errors, sessionT0: this.t0 };
        if (g.id === 'breath') out.breath_sync = g.sync;
        if (g.kind !== 'measurement' && g.extra && Object.keys(g.extra).length) out.extra = { ...g.extra };
        const breathing = g.id === 'breath' ? g.fb?.result() ?? null : null;
        if (breathing) { out.extra = { ...out.extra, breathing }; this.breathResult = { ...breathing, until: now + BREATH_RESULT_S }; }
        const rt = g.kind === 'measurement' ? null : g.rt?.summary();
        if (rt) out.extra = { ...out.extra, rt };
        const dda = g.kind === 'measurement' ? null : A.Skill?.finish(g.id);
        if (dda) out.extra = { ...out.extra, dda };
        if (g.id === 'fork') { this.forkRec = A.Record.fork(g); out.extra = { glows: g.glows, hard_sides: g.choices.map(c => c.hard_side), ...A.PRESENT?.fork?.extra?.(g) }; out.completed = g.done && this.forkRec.choices.every(c => c.completed); }
        if (g.id === 'lanterns') { this.lanternRec = A.Record.lanterns(g); out.extra = { rewards_rich: g.rewards.rich, rewards_lean: g.rewards.lean, ...A.PRESENT?.lanterns?.extra?.(g) }; }
        const rec = this.track.finish(now, out, p);
        this.tasks.push(rec); this.track = null;
        this.ws({ type: 'task_end', task: rec });
        Au.pad(false); Au.crackle(false);
        this.game = null; this.gameMode = null; this.daylightBoost = 0;
        return g;
      },

      endGame(now, by) {
        const g = this.closeTask(now, by);
        if (g.done && hold(g) > 0.7) { this.outro = { g, until: g.finishedAt + hold(g) }; this.holdUntil = this.outro.until; }
        const foldAt = g.done ? Math.max(now, g.finishedAt + hold(g)) : now + 0.3;
        if (g.mode === 'fatigue') Sim.drowsy *= 0.45;
        this.story('end', g.slot, now);
        if (this.bloomIdx < BLOOM_ORDER.length) this.bloom(BLOOM_ORDER[this.bloomIdx++], by === 'auto' ? 5 : 1.5);
        if (g.mode === 'wake') this.tween(V, 'iceGlow', V.iceGlow, 1, 2);
        if (g.id === 'breath' || g.mode === 'calm' || g.id === 'lanterns') this.tween(V, 'aurora', V.aurora, Math.min(1, V.aurora + 0.3), 2);
        this.outroUntil = Math.max(now + 0.6, this.holdUntil || 0);
        if (g.mode === 'rest') { this.startDawn(now); return; }
        this.setPhase('walk');
        this.T.resume(now, g, foldAt);
      },

      startDawn(now) {
        this.dawnAt = now; V.dawnT = 0;
        this.setPhase('dawn');
        if (!A.Music) Au.dawnPhrase();
        const hexc = this.night ? '#FFC98A' : '#FFF3DC', level = this.night ? A.config.dawnLevel : 60;
        V.borderColor = hex(hexc);
        this.light(hexc, level, 4000, 'dawn');
      },

      fallAsleep(now) {
        if (this.game) this.closeTask(now, 'auto');
        Au.fadeOut(4);
        this.tween(V, 'black', V.black, 1, 3);
        this.light('#000000', 0, 3000, 'asleep');
        this.T.sleep();
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
        A.Skill?.tick(this.fat, dt);
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
          fatigue: { warm: 0, fog: 0.1, stars: 40, beam: 1, daylight: 0.45 + 0.3 * k + 0.25 * this.daylightBoost + (V.daylightRide || 0), exposure: 1 },
          rest: { warm: 0.1, fog: 0.7, stars: 80, beam: 0, daylight: 0, exposure: 0.7 },
        }[m];
        this.pw = ema(this.pw, 0.3, dt, 40);
        if (prof) for (const key of ['warm', 'fog', 'stars', 'exposure']) tgt[key] = lerp(tgt[key], prof[key], this.pw);
        V.lanternGain = ema(V.lanternGain, lerp(1, prof?.lanternGain ?? 1, this.pw), dt, 2);
        for (const key of ['warm', 'fog', 'stars', 'beam', 'daylight', 'exposure']) V[key] = ema(V[key], tgt[key], dt, 2);
        V.fogDrift = m === 'calm' || m === 'rest' ? 0.5 : 1 + k;
        V.sparkle = ema(V.sparkle, m === 'wake' ? 0.3 + 0.5 * k : 0, dt, 1);
        V.border = ema(V.border, m === 'fatigue' && !this.night ? 0.25 : 0.1, dt, 1.5);
        const fileBed = A.Music?.bed && !A.Music.bed.procedural;
        if (this.phase !== 'dawn' && this.phase !== 'end' && !fileBed) Au.tick(cfg.tempo + (m === 'wake' ? 20 * k : 0), cfg.density, m !== 'calm' && m !== 'rest');
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
        if (now >= this.physio.next) this.physio.frame(now, A.Sensors.fingerFrame(now), A.Sensors.cameraPulse(now));
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
          physio: A.Sensors.livePhysio(now),
        };
      },

      update(now, dt) {
        V.t = now;
        A.J?.step(dt, now, this.game || this.outro?.g);
        if (this.outro && now >= this.outro.until) this.outro = null;
        if (this.outro) this.outro.g.outroUpdate?.(dt, now);
        for (const tw of this.tweens) tw.obj[tw.key] = lerp(tw.from, tw.to, A.ease((now - tw.start) / tw.dur));
        this.tweens = this.tweens.filter(tw => now - tw.start < tw.dur);
        if (this.phase === 'end' && this.night) this.dimEnd(now);
        if (this.done) return;
        const t = now - this.phaseAt;
        Sim.step(dt, this, now);
        const p = A.Sensors.pulse(now), f = A.Sensors.last;
        if (this.phase !== 'fadein') this.sample(now, dt, p, f);
        if (this.auto) this.T.auto(dt);
        if (this.phase !== 'asleep') this.T.update(now, dt);

        // The flame beats only at a pulse (heartbeat.js); this clock only paces the sparks of wake mode.
        A.Heartbeat?.step(now, dt, this);
        this.beatPhase += dt;
        if (this.beatPhase >= 1) {
          this.beatPhase -= 1;
          const n = Math.round(5 * V.sparkle);
          for (let i = 0; i < n; i++) V.sparks.push({ born: now, dx: R() * 2 - 1, dy: -R() });
          if (V.sparks.length > 40) V.sparks.splice(0, V.sparks.length - 40);
        }
        this.updateSpark(now);
        this.flameKick = ema(this.flameKick, 0, dt, 0.2);
        V.flame = 1 + this.flameKick;
        V.flash = ema(V.flash, 0, dt, 0.25);
        V.lanternBright = (1 + 0.5 * this.flameKick) * V.lanternGain;
        V.lanternRadius = 70 * V.lanternGain;
        A.Heartbeat?.paint(V, V.flame);
        V.orb.alpha = ema(V.orb.alpha, this.game?.id === 'breath' ? 1 : 0, dt, 0.5);
        if (this.orb) { V.orb.b = this.orb.b; V.orb.hold = this.orb.hold; V.orb.sync = this.orb.sync; }
        V.stove = this.game?.id === 'breath' ? 0.3 + 0.4 * V.orb.b : ema(V.stove, MODES[this.mode]?.biome === 'sauna' ? 0.4 : 0, dt, 1);

        if (this.phase === 'fadein') {
          V.black = this.fromIdle ? 0.35 * Math.sin(Math.PI * clamp(t / 2, 0, 1)) : 1 - clamp(t / 2, 0, 1);
          if (t >= 2) { this.core.restStart = now; this.stage ? this.finishCore(now) : forced() === 'reaction' ? this.startRt(now) : this.startRest(); }
          return;
        }
        if (this.phase === 'rest') { this.updateRest(now, dt, p, f); return; }
        if (this.phase === 'checkin') { this.updateCheckin(now, dt); return; }
        if (this.phase === 'rt') { this.updateRt(now, dt); return; }
        if (this.phase === 'asleep') return;

        if (this.phase === 'walk' || this.phase === 'game') {
          this.story('tick', this.slot, now);
          this.director(now, dt, p);
          this.style(now, dt);
          this.closedRun = Eyes.closed ? this.closedRun + dt : 0;
          if (this.night && this.closedRun >= 30) { this.fallAsleep(now); return; }
        }
        if (forced() === 'reaction' && this.phase === 'walk' && now > (this.holdUntil || 0) + 1) { Object.assign(this.core, { trials: [], trial: null }); this.startRt(now); return; }
        if (this.phase === 'walk' && this.T.arrived()) this.startGame(now);
        if (this.phase === 'walk' && this.T.atSummit()) this.startDawn(now);
        if (this.phase === 'game') {
          const g = this.game;
          g.t += dt;
          g.update(dt, now);
          if (this.auto && !g.done) g.auto?.(dt, now);
          if (g.done && now - g.finishedAt > 0.7) this.endGame(now, this.auto || this.inputs > g.inputs0 ? 'touch' : 'auto');
          else if (!g.done && g.t >= g.max) this.endGame(now, 'auto');
          else if (g.id === 'breath' && g.mode === 'rest' && this.playLeft(now) <= 0) this.endGame(now, 'touch');
        }
        if (this.phase === 'dawn') {
          V.dawnT = this.T.dawn(now, dt);
          const k = clamp(V.dawnT / DAWN_S, 0, 1);
          if (this.night) { for (const g of ['yellow', 'blue', 'green']) V.sat[g] = Math.max(V.sat[g], k); V.aurora = Math.max(V.aurora, k); }
          V.sweep = k; V.sunP = k; V.border = lerp(0.1, 0.22, k); V.daylight = ema(V.daylight, 0, dt, 1);
          if (V.dawnT >= DAWN_S) { V.sat.dawn = 1; V.sweep = 0; this.setPhase('end'); A.bus.emit('endScreen'); }
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
        if (this.T.handle(type, d)) return;
        if (this.phase === 'rt' && (type === 'pdown' || type === 'key')) { if (this.rtArmed) this.coreTap(RP().tapTime ? RP().tapTime(d) : d.t); else this.rtArmed = true; return; }
        const g = this.phase === 'checkin' ? this.panel : this.phase === 'game' ? this.game : null;
        if (!g || g.world || g.done || type === 'key') return;
        const b = this.box(), u = (d.x - b.x) / b.w, v = (d.y - b.y) / b.h;
        if (type === 'pdown') g.down?.(u, v, d.t, d);
        if (type === 'pmove') g.move?.(u, v, d.t, d);
        if (type === 'pup') g.up?.(u, v, d.t, d);
      },

      box() {
        const { W, H } = A.World.size();
        if (this.phase === 'checkin') return { x: W * 0.07, y: H * 0.2, w: W * 0.86, h: H * 0.24 };
        return { x: W * 0.07, y: H * 0.12, w: W * 0.86, h: H * 0.46 };
      },

      drawOverlay(ctx, now) {
        this.drawLayers(ctx, now);
        this.drawSpark(ctx, now);
      },

      drawLayers(ctx, now) {
        const at = A.J ? A.J.at : now;
        if (this.phase === 'rt' || now < (this.coreHoldUntil || 0)) RP().draw?.(ctx, this, at);
        const g = this.panel || this.game || this.outro?.g;
        if (g?.world) g.drawWorld?.(ctx, at);
        const fadeAt = g?.done ? g.finishedAt + hold(g) - 0.7 : 0;
        const show = g && !g.world ? (g.done ? clamp(1 - (now - fadeAt) / 0.5, 0, 1) : clamp((now - g.startAt) / 0.35, 0, 1)) : 0;
        if (show <= 0) { A.J?.draw(ctx); this.T.drawOver(ctx, now); return; }
        const b = this.box(), measure = g.kind === 'measurement';
        ctx.save();
        ctx.globalAlpha = show;
        if (g.bare) {
          const o = !g.world && this.phase === 'game' ? this.T.stageOrigin() : null, open = A.config.reducedMotion ? 1 : clamp((now - g.startAt) / 0.45, 0, 1);
          if (o && open < 1) {
            const e = 1 - Math.pow(1 - open, 3), sc = 0.86 + 0.14 * e, cx = lerp(o[0], b.x + b.w / 2, e), cy = lerp(o[1], b.y + b.h / 2, e);
            ctx.translate(cx, cy); ctx.scale(sc, sc); ctx.translate(-(b.x + b.w / 2), -(b.y + b.h / 2));
            ctx.globalAlpha = show * open;
          }
          this.T.drawStage(ctx, b, g, show);
          g.draw(ctx, b, at); A.J?.draw(ctx); ctx.restore(); this.T.drawOver(ctx, now); return;
        }
        const sc = A.config.reducedMotion ? 1 : 0.94 + 0.06 * show, warmth = A.J?.borderWarmth() ?? 0;
        ctx.translate(b.x + b.w / 2, b.y + b.h / 2); ctx.scale(sc, sc); ctx.translate(-(b.x + b.w / 2), -(b.y + b.h / 2));
        if (A.World.panel) A.World.panel(ctx, b, { done: g.done, measure, warmth });
        else {
          ctx.fillStyle = 'rgba(10,12,17,0.86)';
          ctx.strokeStyle = g.done ? 'rgba(255,217,160,0.8)' : measure ? 'rgba(183,156,255,0.26)' : `rgba(255,217,160,${lerp(0.22, 0.8, warmth)})`;
          ctx.lineWidth = g.done ? 2 : 1;
          ctx.beginPath(); ctx.roundRect(b.x, b.y, b.w, b.h, 22); ctx.fill(); ctx.stroke();
        }
        ctx.save(); ctx.beginPath(); ctx.roundRect(b.x, b.y, b.w, b.h, 22); ctx.clip();
        g.draw(ctx, b, at);
        const p = g.bar ? g.bar() : clamp(1 - g.t / g.max, 0, 1);
        if (p !== null) { ctx.fillStyle = measure ? 'rgba(183,156,255,0.3)' : 'rgba(255,217,160,0.25)'; ctx.fillRect(b.x, b.y + b.h - 3, b.w * clamp(p, 0, 1), 3); }
        A.J?.draw(ctx);
        ctx.restore(); ctx.restore();
        this.T.drawOver(ctx, now);
      },

      finish(status) {
        if (this.done) return;
        if (this.game) this.closeTask(A.now(), 'auto');
        if (!this.coreRec && status !== 'declined') this.coreRec = this.phase === 'fadein' ? null : this.buildCore(A.now());
        this.done = true; this.panel = null;
        if (A.Sensors.faceTrack === this.face) A.Sensors.faceTrack = null;
        const doc = A.Record.session(this, status);
        const ride = this.T?.record();
        if (ride) doc.ride = ride;
        if (A.Skill?.sess) { doc.skill = A.Skill.record(); A.Skill.save(); }
        A.Sensors.unlockPulse();
        if (status !== 'completed') Au.fadeOut(2);
        Au.pad(false); Au.crackle(false);
        this.ws({ type: 'session_end', session: doc });
        A.bus.emit('sessionEnd', doc);
      },
    };
    A.Sensors.faceTrack = s.face;
    A.Skill?.begin(s);
    s.T = A.Traverse.create(s);
    return s;
  };

  A.declinedRecord = profile => ({
    schema: 'afferent.session/3', session_id: uuid(), patient_id: A.config.patientId, device_id: A.config.deviceId, app_version: A.config.appVersion,
    started_iso: isoLocal(new Date()), local_hour: r1(new Date().getHours() + new Date().getMinutes() / 60), day_index: null,
    status: 'declined', profile, simulated: profile !== 'live', sharing: A.config.sharing,
  });
})();
