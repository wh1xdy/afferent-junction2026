(() => {
  const { clamp, lerp, ema, median, hex, uuid } = A;
  const POS = A.POS, Face = A.Face, Touch = A.Touch, Au = A.Audio;

  const PROFILES = A.PROFILES = {
    good_day: { id: 'good_day', fog: 0.3, fogDrift: 1, stars: 180, auroraHint: 0.1, warm: 0, lantern: 1, speed: 250, tempo: 72, density: 0.7, arps: true, rest: 66 },
    bad_day: { id: 'bad_day', fog: 0.8, fogDrift: 0.6, stars: 0, auroraHint: 0, warm: 0.12, lantern: 1.3, speed: 175, tempo: 60, density: 0.35, arps: false, rest: 76 },
  };
  const COLOUR = { forest: '#F2B544', fork: '#F2B544', lake: '#3A7CA5', sauna: '#5FE3A1', lighthouse: '#FFC98A' };
  const ACTIVATING = new Set(['forest', 'fork', 'lake', 'lighthouse']);
  const STATIONS = new Set(['checkin', 'forest', 'fork', 'lake', 'sauna', 'lighthouse']);

  const Vitals = A.Vitals = {
    reset(rest) { Object.assign(this, { rest, bpm: rest + 2, boostUntil: 0, live: false, liveBpm: null, quality: 0.85, contact: true }); },
    boost(now) { this.boostUntil = now + 14; },
    update(now, dt, id, t) {
      if (this.live) { this.bpm = this.liveBpm ?? this.bpm; return; }
      let target = this.rest + 2;
      if (id === 'lake') target = this.rest + 6;
      else if (id === 'forest' || id === 'lighthouse' || id === 'fork') target = this.rest + 3;
      else if (id === 'sauna') target = this.rest + 2 - Math.min(6, t * 0.22);
      if (now < this.boostUntil) target += 20;
      this.bpm = ema(this.bpm, target, dt, now < this.boostUntil ? 2 : 5);
    },
    value(now) { return this.bpm + (this.live ? 0 : 2.5 * Math.sin(now * Math.PI / 5)); },
  };

  const SEG = {};

  SEG.fadein = {
    max: 2,
    enter(s) { s.V.black = 1; },
    update(s, now, dt, t) { s.V.black = 1 - clamp(t / 2, 0, 1); if (t >= 2) s.next(); },
  };

  SEG.calibration = {
    max: 20,
    enter(s, now) {
      s.cal = { openL: [], openR: [], closedL: [], closedR: [], wide0: [], wide: [], pitch: [], look: [], pulse: [], aperture: [], blinks: 0, tracked: 0, frames: 0 };
      s.calNotes = new Set();
    },
    update(s, now, dt, t) {
      const c = s.cal, raw = A.raw, V = s.V;
      c.frames++; if (raw.tracked) c.tracked++;
      const inBlinkWindow = t < 6 || t >= 12;
      if (t < 6) {
        V.glyph = 'open'; V.lanternBright = 1;
        if (!Face.closed) { c.openL.push(raw.blinkL); c.openR.push(raw.blinkR); c.wide0.push((raw.wideL + raw.wideR) / 2); c.pitch.push(raw.pitch); c.look.push(raw.lookY); }
      } else if (t < 9) {
        V.glyph = 'closed'; V.lanternBright = lerp(1, 0.25, clamp((t - 6) / 0.6, 0, 1));
        if (t > 7) { c.closedL.push(raw.blinkL); c.closedR.push(raw.blinkR); }
      } else if (t < 12) {
        V.glyph = 'wide'; V.lanternBright = 1.35;
        if (t > 9.5) c.wide.push((raw.wideL + raw.wideR) / 2);
      } else {
        V.glyph = null; V.lanternBright = ema(V.lanternBright, 1, dt, 0.5);
        c.pulse.push(Vitals.value(now));
      }
      if (inBlinkWindow) c.aperture.push(1 - Math.max(Face.n[0], Face.n[1]));
      for (const [at, notes] of [[0.2, [3]], [3, [5]], [6, [0]], [9, [5, 7]], [13, [3]], [17, [5]]]) {
        if (t >= at && !s.calNotes.has(at)) { s.calNotes.add(at); notes.forEach(n => Au.piano(n, 0.14)); if (at === 6) s.haptic(); }
      }
      if (t >= 20) this.finish(s);
    },
    onBlink(s, now) { const t = now - s.seg.start; if (t < 6 || t >= 12) s.cal.blinks++; },
    finish(s) {
      const c = s.cal, pct = (xs, q) => { const a = [...xs].sort((x, y) => x - y); return a.length ? a[Math.floor((a.length - 1) * q)] : null; };
      const O = [median(c.openL) ?? 0.05, median(c.openR) ?? 0.05];
      const C = [median(c.closedL) ?? O[0], median(c.closedR) ?? O[1]];
      const Ow = median(c.wide0) ?? 0, Wd = pct(c.wide, 0.8) ?? Ow;
      Face.setCalibration({ O, C, Ow, W: Wd, pitch0: median(c.pitch) ?? 0, lookY0: median(c.look) ?? 0 });
      const rest = median(c.pulse);
      s.rest = rest;
      s.rec.cal = {
        eye_open_O: O.map(r3), eye_closed_C: C[0] - O[0] < 0.25 ? null : C.map(r3), eye_wide_W: Wd - Ow < 0.15 ? null : [r3(Wd), r3(Wd)],
        head_pitch_neutral_deg: r1(median(c.pitch) ?? 0),
        blink_rate_per_min: r1(c.blinks / 14 * 60),
        eye_aperture_mean: r3(c.aperture.reduce((a, b) => a + b, 0) / Math.max(1, c.aperture.length)),
        resting_pulse_bpm: rest === null ? null : r1(rest), pulse_source: 'simulated', pulse_quality: Vitals.quality,
        source: 'live', ambient_luma: null, tracked_ratio: r3(c.tracked / Math.max(1, c.frames)),
      };
      s.rec.quality.eye_range_low = Face.rangeLow;
      s.V.glyph = null;
      s.next();
    },
  };

  SEG.checkin = {
    max: 7,
    enter(s) { s.ck = { mood: 3, armed: true, heldSince: null, confirmedAt: null, by: null }; s.V.checkin = { mood: 3 }; },
    update(s, now, dt, t) {
      const ck = s.ck;
      if (ck.confirmedAt !== null) { if (now - ck.confirmedAt > 0.8) this.finish(s); return; }
      const tilt = Math.abs(Face.roll) > Math.abs(Face.yaw) ? Face.roll : Face.yaw;
      if (Math.abs(tilt) >= 12) {
        if (ck.armed) {
          if (ck.heldSince === null) ck.heldSince = now;
          if (now - ck.heldSince >= 0.3) { this.step(s, Math.sign(tilt)); ck.armed = false; ck.heldSince = null; }
        }
      } else { ck.heldSince = null; if (Math.abs(tilt) < 6) ck.armed = true; }
      if (t >= 7) { ck.mood = null; ck.by = 'auto'; this.finish(s); }
    },
    step(s, d) { s.ck.mood = clamp(s.ck.mood + d, 1, 5); s.V.checkin.mood = s.ck.mood; s.V.flameBase = s.profile.lantern * (0.7 + 0.12 * s.ck.mood); },
    confirm(s, now, by) { if (s.ck.confirmedAt === null) { s.ck.confirmedAt = now; s.ck.by = by; s.flamePulse(now, 1.25); } },
    onLongBlink(s, now) { this.confirm(s, now, 'signal'); },
    onTap(s, now, d) { if (d.zone === 'center') this.confirm(s, now, 'tap'); else { this.step(s, d.zone === 'left' ? -1 : 1); } },
    onStep(s, now, d) { this.step(s, d); },
    onConfirm(s, now) { this.confirm(s, now, 'tap'); },
    finish(s) {
      s.rec.mood_vas = s.ck.mood;
      s.V.checkin = null;
      if (s.ck.mood) s.V.flameBase = s.profile.lantern * (0.7 + 0.12 * s.ck.mood);
      s.completedBy = s.ck.by;
      s.next();
    },
  };

  SEG.walk = { enter(s) { s.targetX = s.seg.to; }, update(s) { if (Math.abs(s.V.worldX - s.targetX) < 1) s.next(); } };

  SEG.forest = {
    max: 6,
    enter(s) { s.targetX = POS.forest; s.fo = { up: 0, tapUp: 0, maxPitch: 0, reached: null }; },
    update(s, now, dt, t) {
      const fo = s.fo, face = Face.gazeUp(), touch = Touch.hold;
      if (face || touch) { fo.up += dt; if (!face) fo.tapUp += dt; }
      fo.maxPitch = Math.max(fo.maxPitch, Face.pitchRel);
      s.V.forestP = fo.up / 3;
      if (fo.up >= 3 && fo.reached === null) {
        fo.reached = t;
        s.bloom('yellow', 1.5);
        Au.cello(true);
        s.station({ name: 'forest', completed_by: fo.tapUp > fo.up / 2 ? 'tap' : 'signal', gaze_up_seconds: r1(fo.up), max_pitch_up_deg: r1(fo.maxPitch), time_to_target_s: r1(t) });
        s.next();
      } else if (t >= 6) {
        s.bloom('yellow', 5); Au.cello(true);
        s.station({ name: 'forest', completed_by: 'auto', gaze_up_seconds: r1(fo.up), max_pitch_up_deg: r1(fo.maxPitch), time_to_target_s: null });
        s.next();
      }
    },
    skip(s) { s.bloom('yellow', 3); Au.cello(true); s.station({ name: 'forest', completed_by: 'skip' }); },
  };

  SEG.fork = {
    max: 7,
    enter(s) {
      s.targetX = POS.fork;
      s.fk = { phase: 'choose', reward: 1 + Math.floor(Math.random() * 3), hl: null, heldSince: null, choice: null, by: null, wide: 0, climbStart: null, effort: null };
      s.fork = s.fk;
      s.V.fork = { show: true, glints: s.fk.reward, highlight: null };
    },
    update(s, now, dt, t) {
      const fk = s.fk;
      if (fk.phase === 'choose') {
        if (Math.abs(Face.yaw) >= 12) {
          if (fk.heldSince === null) fk.heldSince = now;
          if (now - fk.heldSince >= 0.3) this.highlight(s, Face.yaw > 0 ? 'summit' : 'flat');
        } else fk.heldSince = null;
        if (t >= 3) this.choose(s, now, null, 'auto');
      } else if (fk.phase === 'climb') {
        const ct = now - fk.climbStart;
        if (Face.wide() || Touch.hold) fk.wide += dt;
        s.V.figLift = A.World.hill(s.V.worldX);
        if (fk.wide >= 3 && fk.effort === null) { fk.effort = true; s.bonus = fk.reward; s.flamePulse(now, 1.3); }
        if (ct >= 4) { if (fk.effort === null) fk.effort = false; this.finish(s); }
      } else if (fk.phase === 'flat') {
        if (Math.abs(s.V.worldX - s.targetX) < 1) this.finish(s);
      }
    },
    highlight(s, side) { s.fk.hl = side; s.V.fork.highlight = side; },
    choose(s, now, side, by) {
      const fk = s.fk;
      if (fk.phase !== 'choose') return;
      fk.choice = side || 'none'; fk.by = by;
      if (side === 'summit') { fk.phase = 'climb'; fk.climbStart = now; s.targetX = 900; s.speedOverride = 300 / 4; }
      else { fk.phase = 'flat'; s.targetX = 900; }
    },
    onLongBlink(s, now) { if (this.ok(s)) this.choose(s, now, s.fk.hl, 'signal'); },
    onTap(s, now, d) { if (d.zone !== 'center') { this.highlight(s, d.zone === 'right' ? 'summit' : 'flat'); this.choose(s, now, s.fk.hl, 'tap'); } },
    onStep(s, now, d) { this.highlight(s, d > 0 ? 'summit' : 'flat'); },
    onConfirm(s, now) { if (this.ok(s)) this.choose(s, now, s.fk.hl, 'tap'); },
    ok: s => s.fk.phase === 'choose' && s.fk.hl,
    finish(s) {
      const fk = s.fk;
      s.speedOverride = null; s.V.figLift = 0; s.V.fork.show = false;
      s.station({ name: 'fork', completed_by: fk.by, reward_level: fk.reward, choice: fk.choice, effort_completed: fk.choice === 'summit' ? fk.effort : null });
      s.next();
    },
    skip(s) { s.speedOverride = null; s.V.figLift = 0; s.V.fork.show = false; s.station({ name: 'fork', completed_by: 'skip', reward_level: s.fk.reward, choice: 'none', effort_completed: null }); },
  };

  SEG.lake = {
    max: 24,
    enter(s, now) {
      s.targetX = POS.lake;
      s.lake = { n: s.stage ? 3 : 6, trials: [], trial: null, startAt: now };
      this.newTrial(s, now);
      for (let i = 0; i < (s.bonus || 0); i++) s.V.shooting.push({ x: 0.1 + 0.2 * i, y: 0.08 + 0.05 * i, born: s.V.t + 2 + i * 2.5 });
    },
    newTrial(s, now) { s.lake.trial = { fp: 1 + Math.random() * 1.5, start: now, onset: null, done: false }; },
    update(s, now, dt, t) {
      const L = s.lake, tr = L.trial;
      if (tr && !tr.done) {
        if (tr.onset === null && now - tr.start >= tr.fp) { tr.onset = now; s.V.flash = 1; Au.bell(); }
        else if (tr.onset !== null && now - tr.onset > 1.5) this.resolve(s, now, null, 'blink');
      }
      if (L.trials.length >= L.n || t >= 24) this.finish(s, t >= 24 && L.trials.length < L.n);
    },
    respond(s, now, at, modality) {
      const tr = s.lake?.trial;
      if (!tr || tr.done || tr.onset === null) return;
      this.resolve(s, now, (at - tr.onset) * 1000, modality);
    },
    resolve(s, now, rt, modality) {
      const L = s.lake, tr = L.trial;
      tr.done = true;
      const outcome = rt === null ? 'miss' : rt < 150 ? 'anticipation' : rt <= 1500 ? 'hit' : 'miss';
      const rec = { foreperiod_ms: Math.round(tr.fp * 1000), rt_ms: rt === null ? null : Math.round(rt), outcome, modality };
      L.trials.push(rec);
      A.bus.emit('ws', { type: 'lake_trial', session_id: s.rec.session_id, trial: L.trials.length, rt_ms: rec.rt_ms, outcome });
      if (outcome === 'hit') { s.crack(1); s.V.iceGlow = Math.min(1, s.V.iceGlow + 0.18); }
      else s.tween(s.V, 'iceGlow', s.V.iceGlow, Math.min(1, s.V.iceGlow + 0.1), 5);
      if (L.trials.length < L.n) this.newTrial(s, now);
    },
    onBlinkOnset(s, now, d) { this.respond(s, now, d.t, 'blink'); },
    onTap(s, now, d) { this.respond(s, now, d.t, 'tap'); },
    onConfirm(s, now) { this.respond(s, now, now, 'tap'); },
    finish(s, truncated) {
      const L = s.lake, hits = L.trials.filter(x => x.outcome === 'hit');
      const mods = new Set(L.trials.map(x => x.modality));
      s.bloom('blue', hits.length >= 4 || (s.stage && hits.length >= 2) ? 1.5 : 5);
      s.tween(s.V, 'iceGlow', s.V.iceGlow, 1, 1.5);
      s.station({
        name: 'lake', completed_by: truncated || L.trials.every(x => x.rt_ms === null) ? 'auto' : mods.has('tap') ? 'tap' : 'signal', trials: L.trials, trials_completed: L.trials.length,
        rt_median_ms: hits.length ? Math.round(median(hits.map(x => x.rt_ms))) : null,
        misses: L.trials.filter(x => x.outcome === 'miss').length, anticipations: L.trials.filter(x => x.outcome === 'anticipation').length,
        modality: mods.size > 1 ? 'mixed' : [...mods][0] || 'blink', valid: L.trials.length === 6 && hits.length >= 4,
      });
      s.lake.trial = null;
      s.next();
    },
    skip(s) { s.bloom('blue', 3); s.tween(s.V, 'iceGlow', s.V.iceGlow, 1, 3); s.station({ name: 'lake', completed_by: 'skip', trials: s.lake.trials, trials_completed: s.lake.trials.length, valid: false }); s.lake.trial = null; },
  };

  SEG.sauna = {
    enter(s, now) {
      s.targetX = POS.sauna;
      s.sa = { cycles: s.stage ? 2 : 3, closed: 0, frames: 0, closedFrames: 0, startP: [], endP: [], revealed: null, holdStart: null, wasClosed: false, lastHaptic: -1, arrived: false };
      Au.pad(true); Au.crackle(true);
    },
    update(s, now, dt, t) {
      const sa = s.sa, V = s.V;
      if (!sa.arrived) {
        if (Math.abs(V.worldX - s.targetX) > 1) { s.seg.start = now; return; }
        sa.arrived = true; V.sitting = true; s.seg.start = now; t = 0;
      }
      const lead = 2, cycEnd = lead + 10 * sa.cycles;
      sa.frames++;
      if (Face.closed) { sa.closed += dt; sa.closedFrames++; sa.wasClosed = true; }
      const p = Vitals.value(now);
      if (t < lead + 10) sa.startP.push(p);
      if (t >= cycEnd - 10 && t < cycEnd) sa.endP.push(p);

      if (sa.revealed !== null) {
        V.exposure = ema(V.exposure, 1, dt, 0.3);
        if (now - sa.revealed > 1.6) this.finish(s);
        return;
      }
      if (t < lead) {
        V.stove = 0.5 + 0.5 * Math.sin(t / lead * Math.PI);
        return;
      }
      if (t < cycEnd) {
        const ct = (t - lead) % 10, inhale = ct < 4;
        const b = inhale ? ct / 4 : 1 - (ct - 4) / 6;
        V.exposure = ema(V.exposure, 0.1, dt, 0.8);
        V.stove = 0.15 + 0.35 * b;
        Au.muffle(0.85); Au.padLevel(b);
        const sec = Math.floor(ct);
        if (inhale && sec !== sa.lastHaptic) { sa.lastHaptic = sec; s.haptic(); }
        if (!inhale) sa.lastHaptic = -1;
        if (!inhale) {
          const fall = clamp((s.rest ?? p) - p + 2, 0, 8) / 8;
          V.aurora = Math.min(1, V.aurora + dt * (0.012 + 0.03 * fall));
        }
        if (t >= lead + 20 && sa.wasClosed && !Face.closed) this.reveal(s, now);
        return;
      }
      if (!sa.wasClosed || !Face.closed) { this.reveal(s, now); return; }
      if (sa.holdStart === null) sa.holdStart = now;
      Au.padLevel(0); V.stove = ema(V.stove, 0.1, dt, 2);
      if (sa.closed >= 60) s.fallAsleep(now);
    },
    reveal(s, now) {
      const sa = s.sa;
      sa.revealed = now;
      s.bloom('green', 1.5);
      s.tween(s.V, 'aurora', s.V.aurora, 1, 1.5);
      Au.muffle(0); Au.crackle(false); Au.padLevel(0.3);
      [0, 3, 5, 7].forEach(n => Au.piano(n, 0.12));
    },
    record(s, by) {
      const sa = s.sa, mean = xs => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
      const ps = mean(sa.startP), pe = mean(sa.endP), valid = Vitals.quality >= 0.7 && Vitals.contact;
      return {
        name: 'sauna', completed_by: by, eyes_closed_ratio: r3(sa.closedFrames / Math.max(1, sa.frames)),
        pulse_start_bpm: ps === null ? null : r1(ps), pulse_end_bpm: pe === null ? null : r1(pe),
        pulse_delta_bpm: ps === null || pe === null ? null : r1(pe - ps), pulse_source: Vitals.live ? 'ky039' : 'simulated',
        pulse_quality: Vitals.quality, pulse_valid: valid && pe !== null,
      };
    },
    finish(s) {
      s.V.sitting = false; s.V.stove = 0; Au.pad(false);
      s.station(this.record(s, s.sa.closedFrames / Math.max(1, s.sa.frames) > 0.3 ? 'signal' : 'auto'));
      s.next();
    },
    skip(s) { s.V.sitting = false; s.V.stove = 0; s.V.exposure = 1; Au.pad(false); Au.crackle(false); Au.muffle(0); s.bloom('green', 3); s.tween(s.V, 'aurora', s.V.aurora, 1, 3); s.station(this.record(s, 'skip')); },
  };

  SEG.lighthouse = {
    max: 6,
    enter(s) { s.targetX = POS.lighthouse; s.lh = { wide: 0, tap: 0 }; },
    update(s, now, dt, t) {
      const lh = s.lh, thr = t > 3 ? 0.3 : 0.6, face = Face.wide(thr);
      if (face || Touch.hold) { lh.wide += dt; if (!face) lh.tap += dt; }
      s.V.climb = clamp(lh.wide / 2, 0, 1);
      if (lh.wide >= 2 || t >= 6) {
        s.station({ name: 'lighthouse', completed_by: lh.wide >= 2 ? (lh.tap > lh.wide / 2 ? 'tap' : 'signal') : 'auto', time_to_target_s: lh.wide >= 2 ? r1(t) : null });
        s.next();
      }
    },
    skip(s) { s.station({ name: 'lighthouse', completed_by: 'skip', time_to_target_s: null }); },
  };

  SEG.dawn = {
    max: 4,
    enter(s) {
      const V = s.V;
      Au.dawnPhrase(); Au.cello(false);
      V.borderColor = hex(s.stageMode ? '#FFF3DC' : '#FFC98A');
      s.light(s.stageMode ? '#FFF3DC' : '#FFC98A', A.config.dawnLevel, 4000);
      s.tween(V, 'beamP', V.beamP, 1, 1);
    },
    update(s, now, dt, t) {
      const V = s.V;
      V.sweep = clamp(t / 4, 0, 1); V.sunP = clamp(t / 4, 0, 1); V.climb = 0;
      V.border = lerp(0.1, 0.25, V.sweep); V.fog = ema(V.fog, 0.15, dt, 1.5);
      if (t >= 4) { V.sat.dawn = 1; V.sweep = 0; s.next(); }
    },
  };

  SEG.end = {
    max: 4,
    enter(s) { s.V.figure = 'rest'; A.bus.emit('endScreen', { status: 'completed' }); },
    update(s, now, dt, t) { if (t >= 4) { s.V.black = ema(s.V.black, 0.85, dt, 1); if (t >= 7) s.finish('completed'); } },
  };

  function plan(stage) {
    if (stage) return [{ id: 'fadein' }, { id: 'lake' }, { id: 'walk', to: POS.sauna }, { id: 'sauna' }, { id: 'lighthouse' }, { id: 'dawn' }, { id: 'end' }];
    return [
      { id: 'fadein' }, { id: 'calibration' }, { id: 'checkin' }, { id: 'walk', to: POS.forest }, { id: 'forest' }, { id: 'fork' },
      { id: 'walk', to: POS.lake }, { id: 'lake' }, { id: 'walk', to: POS.sauna }, { id: 'sauna' }, { id: 'lighthouse' }, { id: 'dawn' }, { id: 'end' },
    ];
  }

  const r1 = x => Math.round(x * 10) / 10, r3 = x => Math.round(x * 1000) / 1000;

  A.makeVisual = (profile, stage) => ({
    t: 0, worldX: stage ? POS.fork + 300 : -60, figLift: 0, sitting: false, walking: false,
    sat: { yellow: 0.05, blue: 0.05, green: 0.05, dawn: 0 }, sweep: 0,
    aurora: 0, auroraHint: profile.auroraHint, fog: profile.fog, fogDrift: profile.fogDrift, stars: profile.stars, warm: profile.warm,
    sparkle: 0, lookUp: 0, flame: 1, flameBase: profile.lantern, lanternRadius: 70 * profile.lantern, lanternBright: 1, glyph: null, checkin: null,
    forestP: 0, fork: { show: false, glints: 0, highlight: null }, flash: 0, flashCap: 0.08, cracks: [], iceGlow: 0, shooting: [], sparks: [],
    stove: 0, exposure: 1, beamP: 0, sunP: 0, climb: 0, windowGlow: 0.15, border: 0.1, borderColor: hex('#FFD9A0'), touchGlow: false, fogHold: 0, black: 1,
  });

  A.startSession = (profileId, opts) => {
    const profile = PROFILES[profileId], now = A.now();
    Vitals.reset(profile.rest);
    A.Auto.reset();
    Face.calibrated = false; Face.O = [0.35, 0.35]; Face.C = [0.55, 0.55]; Face.Ow = 0; Face.W = 0.35; Face.pitch0 = 0; Face.lookY0 = 0; Face.lostEvents = 0;

    const s = {
      profile, stage: !!opts.stage, stageMode: !!opts.stage, t0: now, i: -1, seg: null, segs: plan(opts.stage), targetX: opts.stage ? POS.fork + 300 : 0,
      tweens: [], rest: null, bonus: 0, speedOverride: null, completedBy: null, done: false, beatPhase: 0, flameKick: 0,
      V: A.makeVisual(profile, opts.stage),
      rec: {
        schema: 'afferent.session/1', session_id: uuid(), device_id: A.config.deviceId, app_version: 'demo-0.1.0',
        input_backend: { camera: 'mediapipe', keys: 'touch_only', auto: 'touch_only' }[opts.mode], device_model: navigator.platform || 'browser',
        started_iso: isoLocal(new Date()), local_hour: r1(new Date().getHours() + new Date().getMinutes() / 60),
        status: 'partial', profile: profile.id, demo_input: opts.mode, duration_ms: 0,
        sensors: { phone_camera: opts.mode === 'camera', pulse_stone: true, bedside_camera: true, bedside_light: true, presence: false },
        sharing: 'summary', cal: null, mood_vas: null, stations: [], vitals: null,
        context: { room_temp_c: null, room_humidity_pct: null, home: true, visitors_present: 0 },
        quality: { eye_range_low: false, pulse_implausible: false, dark_room: true, face_lost_events: 0 }, keep_moment: false,
      },
      pulses: [],

      next() {
        if (this.seg && STATIONS.has(this.seg.id)) this.light(COLOUR[this.seg.id] || '#FFD9A0', 5, 1500);
        this.i++;
        const d = this.segs[this.i];
        if (!d) return;
        this.seg = { ...d, start: A.now() };
        SEG[d.id].enter?.(this, A.now());
        if (COLOUR[d.id]) {
          this.light(COLOUR[d.id], 8, 1500);
          A.bus.emit('ws', { type: 'station', session_id: this.rec.session_id, name: d.id, colour: COLOUR[d.id], t_ms: Math.round((A.now() - this.t0) * 1000) });
        }
        A.bus.emit('segment', d.id);
      },
      station(o) {
        const base = { t_start_ms: Math.round((this.seg.start - this.t0) * 1000), t_end_ms: Math.round((A.now() - this.t0) * 1000) };
        this.rec.stations.push({ name: o.name, ...base, ...o });
      },
      bloom(group, dur) { this.tween(this.V.sat, group, this.V.sat[group], 1, dur); if (group === 'yellow') this.tween(this.V, 'windowGlow', this.V.windowGlow, 1, dur); },
      tween(obj, key, from, to, dur) { this.tweens = this.tweens.filter(x => !(x.obj === obj && x.key === key)); this.tweens.push({ obj, key, from, to, start: A.now(), dur }); },
      crack(strength) {
        const branches = [], ox = this.V.worldX + 4;
        for (let b = 0; b < 4; b++) {
          const pts = [[ox, 2]]; let x = ox, y = 2, dir = b % 2 ? 1 : -1;
          for (let i = 0; i < 9; i++) { x += dir * (14 + Math.random() * 16); y += 2 + Math.random() * 7; pts.push([x, y]); }
          branches.push(pts);
        }
        this.V.cracks.push({ branches, born: this.V.t, life: 2.2, strength });
        if (this.V.cracks.length > 8) this.V.cracks.shift();
      },
      flamePulse(now, k) { this.flameKick = Math.max(this.flameKick, k - 1); },
      haptic() { navigator.vibrate?.(15); A.bus.emit('haptic'); },
      light(rgbHex, level, fade_ms) { A.bus.emit('light', { rgb: rgbHex, level, fade_ms }); A.bus.emit('ws', { type: 'light', rgb: rgbHex, level, fade_ms }); },

      handle(type, d) {
        if (this.done || !this.seg) return;
        const now = A.now(), h = SEG[this.seg.id];
        if (type === 'blink' && h.onBlink) h.onBlink(this, now, d);
        if (type === 'longBlink' && h.onLongBlink) h.onLongBlink(this, now, d);
        if (type === 'blinkOnset' && h.onBlinkOnset) h.onBlinkOnset(this, now, d);
        if (type === 'tap' && h.onTap) h.onTap(this, now, d);
        if (type === 'step' && h.onStep) h.onStep(this, now, d);
        if (type === 'confirm' && h.onConfirm) h.onConfirm(this, now, d);
        if (type === 'pulseBoost') Vitals.boost(now);
        if (type === 'skip' && h.skip) { h.skip(this); this.next(); }
        if (type === 'exit') this.finish('partial');
      },

      fallAsleep() {
        this.station(SEG.sauna.record(this, 'signal'));
        Au.fadeOut(4); Au.cello(false);
        this.tween(this.V, 'black', this.V.black, 1, 3);
        this.light('#000000', 0, 3000);
        setTimeout(() => this.finish('fell_asleep'), 3200);
        this.seg = { id: 'asleep', start: A.now() };
      },

      finish(status) {
        if (this.done) return;
        this.done = true;
        const r = this.rec, now = A.now();
        r.status = status;
        r.duration_ms = Math.round((now - this.t0) * 1000);
        const ps = this.pulses;
        r.vitals = ps.length ? {
          pulse_mean_bpm: r1(ps.reduce((a, b) => a + b, 0) / ps.length), pulse_min_bpm: r1(Math.min(...ps)), pulse_max_bpm: r1(Math.max(...ps)),
          pulse_valid_ratio: 1, tracked_ratio: r.cal?.tracked_ratio ?? null,
        } : null;
        r.quality.face_lost_events = Face.lostEvents;
        if (this.stage) r.cal = { source: 'stored' };
        if (status !== 'completed') Au.fadeOut(2);
        A.bus.emit('ws', { type: 'session_end', ...r });
        A.bus.emit('sessionEnd', r);
      },

      update(now, dt) {
        const V = this.V;
        V.t = now;
        for (const tw of this.tweens) tw.obj[tw.key] = lerp(tw.from, tw.to, A.ease((now - tw.start) / tw.dur));
        this.tweens = this.tweens.filter(tw => now - tw.start < tw.dur);
        if (this.done && this.seg?.id !== 'asleep') return;

        const id = this.seg?.id, t = this.seg ? now - this.seg.start : 0;
        const speed = this.speedOverride || this.profile.speed;
        const dx = this.targetX - V.worldX;
        V.walking = Math.abs(dx) > 1 && !V.sitting;
        if (V.walking) V.worldX += Math.sign(dx) * Math.min(Math.abs(dx), speed * dt);

        Vitals.update(now, dt, id, t);
        const pulse = Vitals.value(now);
        if (id !== 'fadein' && id !== 'calibration') this.pulses.push(pulse);
        const rest = this.rest ?? this.profile.rest, delta = pulse - rest;
        const after = this.rec.cal !== null || this.stage;
        const calming = id === 'walk' || id === 'checkin' || id === 'sauna';
        const held = after && calming ? clamp((delta - 10) / 10, 0, 1) : 0;
        const spark = after && ACTIVATING.has(id) ? clamp(delta / 15, 0, 1) : 0;
        V.warm = ema(V.warm, this.profile.warm + 0.15 * held, dt, 1.2);
        V.fogDrift = this.profile.fogDrift * (1 - 0.4 * held);
        V.sparkle = ema(V.sparkle, spark, dt, 0.8);
        this.held = held;

        const showBeat = A.config.showHeartbeat && delta <= 10;
        const rate = after ? (showBeat ? pulse : 60) : 60;
        this.beatPhase += rate / 60 * dt;
        if (this.beatPhase >= 1) {
          this.beatPhase -= 1;
          if (after && (showBeat || !A.config.showHeartbeat || delta > 10)) this.flameKick = Math.max(this.flameKick, showBeat ? 0.06 : 0.03);
          const n = Math.round(6 * V.sparkle);
          for (let k = 0; k < n; k++) V.sparks.push({ born: now, dx: Math.random() * 2 - 1, dy: -Math.random() });
          if (V.sparks.length > 40) V.sparks.splice(0, V.sparks.length - 40);
        }
        this.flameKick = ema(this.flameKick, 0, dt, 0.18);
        V.flame = V.flameBase * (1 + this.flameKick);

        if (after) {
          const eyes = clamp(Face.w, 0, 1.2), up = clamp(Face.pitchRel / 12, 0, 1);
          V.lanternRadius = ema(V.lanternRadius, 70 * V.flameBase * (0.85 + 0.45 * eyes) * (1 + 0.1 * held) * (id === 'forest' ? 1 + 0.4 * up : 1), dt, 0.2);
          V.lookUp = ema(V.lookUp, up, dt, 0.3);
        }

        const lost = Face.faceLostFor(now);
        V.fogHold = ema(V.fogHold, lost > 0.5 ? 1 : 0, dt, 0.6);
        V.touchGlow = lost > 3 && STATIONS.has(id);
        V.flash = ema(V.flash, 0, dt, 0.25);
        V.flashCap = this.rec.quality.dark_room ? 0.06 : 0.12;

        if (id === 'fadein' || id === 'calibration') Au.muffle(0);
        else if (id !== 'sauna' && id !== 'dawn' && id !== 'end' && id !== 'asleep') Au.tick(this.profile.tempo * (1 - 0.08 * held), this.profile.density, this.profile.arps);

        if (this.seg && SEG[this.seg.id]) SEG[this.seg.id].update(this, now, dt, t);
      },
    };
    s.next();
    return s;
  };

  A.declinedRecord = () => ({
    schema: 'afferent.session/1', session_id: uuid(), device_id: A.config.deviceId, started_iso: isoLocal(new Date()),
    local_hour: r1(new Date().getHours() + new Date().getMinutes() / 60), status: 'declined',
    sensors: { phone_camera: false, pulse_stone: true, bedside_camera: true, bedside_light: true, presence: false }, sharing: 'summary',
    context: { room_temp_c: null, room_humidity_pct: null, home: true, visitors_present: 0 },
  });

  function isoLocal(d) {
    const off = -d.getTimezoneOffset(), sign = off >= 0 ? '+' : '-', p = n => String(Math.floor(Math.abs(n))).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}${sign}${p(off / 60)}:${p(off % 60)}`;
  }
})();
