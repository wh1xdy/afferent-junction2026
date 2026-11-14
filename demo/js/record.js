(() => {
  const { median } = A;
  const r1 = x => x === null || x === undefined || Number.isNaN(x) ? null : Math.round(x * 10) / 10;
  const r2 = x => x === null || x === undefined || Number.isNaN(x) ? null : Math.round(x * 100) / 100;
  const r3 = x => x === null || x === undefined || Number.isNaN(x) ? null : Math.round(x * 1000) / 1000;
  const mean = xs => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
  const med = xs => xs.length ? median(xs) : null;
  const quantile = (xs, q) => {
    const s = [...xs].sort((a, b) => a - b), p = (s.length - 1) * q, i = Math.floor(p);
    return i + 1 < s.length ? s[i] + (s[i + 1] - s[i]) * (p - i) : s[i];
  };
  const DIRECTION = { calm: 'fall', rest: 'fall', wake: 'rise', fatigue: 'rise', flow: 'none', measure: 'none' };

  const isoLocal = d => {
    const off = -d.getTimezoneOffset(), sign = off >= 0 ? '+' : '-', p = n => String(Math.floor(Math.abs(n))).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}${sign}${p(off / 60)}:${p(off % 60)}`;
  };

  const slope = pts => {
    if (pts.length < 3) return null;
    const mx = mean(pts.map(p => p[0])), my = mean(pts.map(p => p[1]));
    let num = 0, den = 0;
    for (const [x, y] of pts) { num += (x - mx) * (y - my); den += (x - mx) ** 2; }
    return den ? num / den * 60 : null;
  };

  const rtStats = trials => {
    const taps = trials.filter(t => t.rt_ms !== null && t.rt_ms >= 150).map(t => t.rt_ms);
    return {
      trials,
      median_ms: taps.length ? Math.round(median(taps)) : null,
      iqr_ms: taps.length >= 2 ? Math.round(quantile(taps, 0.75) - quantile(taps, 0.25)) : null,
      lapses: trials.filter(t => t.outcome === 'lapse' || t.outcome === 'miss').length,
      anticipations: trials.filter(t => t.outcome === 'anticipation').length,
      hits: trials.filter(t => t.outcome === 'hit').length,
      valid: trials.length === 5 && taps.length >= 3,
    };
  };

  const prt = ({ rc, ri, lc, li }) => ({
    log_b: r3(0.5 * Math.log10(((rc + 0.5) * (li + 0.5)) / ((ri + 0.5) * (lc + 0.5)))),
    log_d: r3(0.5 * Math.log10(((rc + 0.5) * (lc + 0.5)) / ((ri + 0.5) * (li + 0.5)))),
  });

  const pulseResponse = (samples, dir, mode) => {
    const q = mean(samples.map(s => s[2]));
    if (!samples.length) return { pulse: { start_bpm: null, min_bpm: null, max_bpm: null, end_bpm: null, delta_bpm: null, time_to_target_s: null, recovery_slope_bpm_per_min: null, quality: null }, helped: null };
    const bpm = samples.map(s => s[1]), start = bpm[0], end = bpm[bpm.length - 1], delta = end - start;
    const hit = dir === 'none' ? null : samples.find(s => dir === 'fall' ? start - s[1] >= 2 : s[1] - start >= 2);
    return {
      pulse: {
        start_bpm: r1(start), min_bpm: r1(Math.min(...bpm)), max_bpm: r1(Math.max(...bpm)), end_bpm: r1(end), delta_bpm: r1(delta),
        time_to_target_s: hit ? r1(hit[0]) : null,
        recovery_slope_bpm_per_min: mode === 'calm' || mode === 'rest' ? r1(slope(samples)) : null,
        quality: r2(q),
      },
      helped: dir === 'none' || q < 0.5 ? null : dir === 'fall' ? delta <= -2 : delta >= 2,
    };
  };

  const track = (meta, now) => ({
    meta, t0: now, nextPulse: now, pulse: [], frames: 0, tracked: 0, closed: 0, open: [], upright: 0, pitched: 0, pitch0: null, pitch1: null, eyesClosedS: 0, lastPulseAt: -1,
    frame(now, dt, f, p, eyesClosed, restPitch) {
      if (now >= this.nextPulse) {
        if (p?.bpm != null) { this.pulse.push([now - this.t0, p.bpm, p.quality]); this.lastPulseAt = now; }
        this.nextPulse += 1;
      }
      this.frames++;
      if (f?.tracked) {
        this.tracked++;
        if (eyesClosed) { this.closed++; this.eyesClosedS += dt; }
        if (f.eye_openness != null) this.open.push(f.eye_openness);
      }
      if (f?.tracked && f.head_pitch_deg != null) {
        if (this.pitch0 === null) this.pitch0 = f.head_pitch_deg;
        this.pitch1 = f.head_pitch_deg; this.pitched += dt;
        const ref = restPitch ?? this.pitch0;
        if (f.head_pitch_deg >= ref - 5) this.upright += dt;
      }
    },
    finish(now, out, p) {
      if (p?.bpm != null && now - this.lastPulseAt > 0.3) this.pulse.push([now - this.t0, p.bpm, p.quality]);
      const m = this.meta, dir = DIRECTION[m.mode], pr = pulseResponse(this.pulse, dir, m.mode), tm = x => Math.round((x - out.sessionT0) * 1000);
      const longs = A.Eyes.log.filter(c => c.t >= this.t0 && c.t <= now + 0.01 && c.dur > 0.5).length;
      const rec = {
        id: m.id, slot: m.slot, kind: m.kind, mode: m.mode, director_mode: m.director_mode, intensity: m.intensity, weight_used: m.weight_used,
        t_start_ms: tm(this.t0), duration_ms: Math.round((now - this.t0) * 1000), completed_by: out.completed_by, completed: out.completed,
        items: out.items, errors: out.errors, intended_direction: dir, pulse: pr.pulse, pulse_samples: this.pulse.length, helped: pr.helped,
        head_pitch_start_deg: r1(this.pitch0), head_pitch_delta_deg: this.pitch0 === null ? null : r1(this.pitch1 - this.pitch0),
        upright_s: this.pitched ? r1(this.upright) : null,
        eye_openness_mean: this.open.length ? r2(mean(this.open)) : null,
        perclos: this.tracked ? r3(this.closed / this.tracked) : null,
        long_closures: this.tracked ? longs : null,
        skip_reason: null,
      };
      if (m.id === 'breath') { rec.breath_sync = r3(out.breath_sync); rec.eyes_closed_s = this.tracked ? r1(this.eyesClosedS) : null; }
      if (out.extra) rec.extra = out.extra;
      return rec;
    },
  });

  const skipped = (id, slot, directorMode, tMs, reason) => ({
    id, slot, kind: 'measurement', mode: 'measure', director_mode: directorMode, intensity: null, weight_used: null, t_start_ms: tMs, duration_ms: 0,
    completed_by: 'skipped', completed: false, items: 0, errors: 0, intended_direction: 'none',
    pulse: { start_bpm: null, min_bpm: null, max_bpm: null, end_bpm: null, delta_bpm: null, time_to_target_s: null, recovery_slope_bpm_per_min: null, quality: null },
    pulse_samples: 0, helped: null, head_pitch_start_deg: null, head_pitch_delta_deg: null, upright_s: null, eye_openness_mean: null, perclos: null, long_closures: null, skip_reason: reason,
  });

  const fork = g => {
    const choices = g.choices.map(({ hard_side, ...c }) => c);
    const valid = choices.filter(c => c.path !== 'none'), hard = valid.filter(c => c.path === 'hard').length;
    const at = rw => { const c = choices.find(c => c.reward === rw); return !c || c.path === 'none' ? null : c.path === 'hard' ? 1 : 0; };
    const h2 = at(2), h3 = at(3);
    return {
      choices, hard_prop: valid.length ? r3(hard / valid.length) : null, hard_by_reward: { 2: h2, 3: h3 },
      reward_slope: h2 === null || h3 === null ? null : h3 - h2, easy_task: { lights: 3 }, hard_task: { lights: 8 },
    };
  };

  const lanterns = g => {
    const c = g.counts(), answered = c.rc + c.ri + c.lc + c.li;
    return {
      rich_lantern: 'amber', size_diff: 0.08, trials: g.trials,
      rich_correct: c.rc, rich_incorrect: c.ri, lean_correct: c.lc, lean_incorrect: c.li, ...prt(c),
      rewards_rich: g.rewards.rich, rewards_lean: g.rewards.lean, valid: answered >= 10,
    };
  };

  const pair = (a, b, f = r1) => ({ start: f(a), end: f(b), delta: a === null || b === null || a === undefined || b === undefined ? null : f(b - a) });

  const session = (s, status) => {
    const now = A.now(), r = s.rec, sig = s.sig, core = s.coreRec;
    const pulseSrc = Object.entries(sig.pulseSources).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    const eyesSrc = s.eyesSource;
    const simFields = [];
    if (pulseSrc === 'simulated') simFields.push('signal.pulse_source', 'core.rest.pulse_bpm', 'tasks.pulse', 'pre_post.pulse', 'vitals');
    if (eyesSrc === 'simulated') simFields.push('signal.eyes_source', 'core.rest.eye_openness', 'core.rest.blink_rate_per_min', 'core.rest.head_pitch_deg', 'tasks.eye_openness_mean', 'tasks.perclos', 'tasks.head_pitch_delta_deg', 'pre_post.eye_openness', 'pre_post.head_pitch');
    if (s.auto) simFields.push('player', 'core.rt', 'core.mood_start', 'mood_end', 'fork', 'two_lanterns');
    const end = s.endWindow(), rest = core?.rest;
    const ps = sig.pulse, done = s.tasks.filter(t => t.completed_by !== 'skipped');
    const doc = {
      ...r, status, profile: s.profile, duration_ms: Math.round((now - s.t0) * 1000),
      simulated: simFields.length > 0 || s.profile !== 'live', simulated_fields: simFields,
      input_backend: eyesSrc ?? 'none',
      signal: {
        pulse_source: pulseSrc, pulse_quality_mean: sig.pulseQ.length ? r2(mean(sig.pulseQ)) : null, eyes_source: eyesSrc,
        face_tracked_ratio: sig.frames ? r2(sig.tracked / sig.frames) : null,
        ambient_light: sig.ambient.length ? r2(med(sig.ambient)) : null,
        dark_room: sig.ambient.length ? med(sig.ambient) < 0.15 : null,
        pulse_implausible: ps.length ? ps.some(x => x < 40 || x > 150) : null,
      },
      core: core ?? null,
      tasks: s.tasks,
      fork: s.forkRec ?? null,
      two_lanterns: s.lanternRec ?? null,
      adaptive: {
        mode_seconds: Object.fromEntries(Object.entries(s.modeSeconds).map(([k, v]) => [k, r1(v)])),
        transitions: s.transitions,
        perclos_mean: s.perclosN ? r3(s.perclosSum / s.perclosN) : null,
        touch_errors: s.tasks.reduce((a, t) => a + (t.errors || 0), 0),
        config_received: !!s.configReceived,
      },
      mood_end: s.moodEnd ?? null,
      pre_post: {
        pulse: pair(rest?.pulse_bpm ?? null, end.pulse),
        head_pitch: pair(rest?.head_pitch_deg ?? null, end.pitch),
        eye_openness: pair(rest?.eye_openness ?? null, end.open, r2),
        mood: { start: core?.mood_start ?? null, end: s.moodEnd ?? null, delta: core?.mood_start != null && s.moodEnd != null ? s.moodEnd - core.mood_start : null },
      },
      engagement: {
        completed: status === 'completed', duration_ms: Math.round((now - s.t0) * 1000), pauses: s.pauses, skipped_tasks: s.tasks.length - done.length,
        tasks_completed: done.filter(t => t.completed).length, tasks_total: s.tasks.length,
        reminder_iso: s.reminderIso ?? null, time_to_start_s: s.timeToStart ?? null,
      },
      vitals: ps.length ? { pulse_mean_bpm: r1(mean(ps)), pulse_min_bpm: r1(Math.min(...ps)), pulse_max_bpm: r1(Math.max(...ps)), pulse_source: pulseSrc } : null,
      context: { room_temp_c: null, home: null, visitors_present: null, bedside_light_level: s.lastLightLevel ?? null },
    };
    return doc;
  };

  A.Record = { r1, r2, r3, mean, med, quantile, isoLocal, rtStats, prt, pulseResponse, track, skipped, fork, lanterns, session, DIRECTION };
})();
