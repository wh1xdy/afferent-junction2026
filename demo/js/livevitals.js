// Live vitals: a small corner panel during play with the pulse, HRV and breathing as the sensors give them right now,
// the state the game reads from them and what it does because of it, and a short chip at the top each time that
// changes the games. It reads A.Sensors and the session (state, transitions); it never draws on the game canvas
// and takes no taps. Settings, "Live vitals", turns it off.
// Only real readings show as numbers. A missing one, or one below the quality gate, says "no reading". A simulated
// pulse shows labelled "simulated"; HRV and breathing count only from the finger clips, so a simulated frame of
// those is no reading, as it is for the game (engine.js, breathing.js).
(() => {
  const S = A.Sensors, { clamp } = A;
  const SHOWN = ['walk', 'game', 'dawn'], CHIP_S = 5, NONE = 'no reading', SIM = 'simulated';
  const pos = x => Number.isFinite(x) && x > 0 ? x : null;
  const int = x => String(Math.round(x));

  const STATE = {
    stressed: 'Stressed', energised: 'Energised', tired: 'Tired', steady: 'Steady',
    pulse_up: 'Pulse up', low: 'Pulse low', unknown: 'Waiting for a pulse',
  };
  const WORDS = {
    eyes_tired: 'eyes heavy', no_pulse: 'no pulse reading', pulse_low: 'pulse low', pulse_steady: 'pulse near rest',
    pulse_up: 'pulse up', no_hrv: 'no HRV to compare', rmssd_down: 'HRV down', breathing_fast: 'breathing fast',
    rmssd_steady: 'steady HRV', breathing_calm: 'calm breathing', hrv_partial: 'HRV or breathing missing', hrv_between: 'HRV in between',
  };
  // What the game does for a state in a mode (engine.js assess and prefer).
  const action = (state, mode) => ({
    stressed: 'calmer breathing game',
    energised: 'puzzles',
    tired: mode === 'rest' ? 'wind-down for sleep' : 'gentle wake-up games, brighter light',
    pulse_up: 'calmer games',
    low: mode === 'wake' ? 'livelier games, brighter light' : 'the usual mix of games',
  })[state] || (mode === 'calm' ? 'calmer games' : 'the usual mix of games');
  const cap = t => t ? t[0].toUpperCase() + t.slice(1) : t;

  // "Pulse up, HRV down, breathing fast → calmer breathing game" for a transition of the session.
  const reason = tr => tr ? `${cap((tr.reasons || []).map(r => WORDS[r]).filter(Boolean).join(', ')) || STATE[tr.state] || 'New reading'} → ${action(tr.state, tr.to)}` : null;

  // HRV and breathing as the game would take them: real clips, quality 0.3 or more, at most 3 s old.
  const physio = now => {
    const f = S.fingerFrame(now), ok = !!A.Breathing?.real(f);
    return { rmssd: ok ? pos(f.rmssd_ms) : null, breathing: ok ? pos(f.breathing_per_min) : null };
  };
  const value = (x, unit) => x == null ? { value: null, text: NONE } : { value: Math.round(x), text: `${int(x)} ${unit}` };
  const num = x => Number.isFinite(x) ? x : null;
  // Rows from other parts of the app, shown only when that part is there and has something to say.
  // Music that follows the heart (A.MusicBio), and the room climate from the bedside unit (A.Sensors.room).
  const music = () => {
    const m = A.MusicBio, bpm = num(m?.bpm), target = num(m?.target);
    return m?.following && bpm != null && target != null ? `Music: following your heart ${int(bpm)} → ${int(target)} bpm` : null;
  };
  const room = now => {
    let r = null;
    try { r = typeof S.room === 'function' ? S.room(now) : null; } catch { r = null; }
    const c = num(r?.celsius), h = num(r?.humidity);
    return c == null ? null : `Room ${c.toFixed(1)} °C${h == null ? '' : ` · ${Math.round(h)} %`}`;
  };

  // What the panel shows, or null when it is hidden (no session in play, or switched off).
  const model = (s, now) => {
    if (!s || s.done || !SHOWN.includes(s.phase) || A.config?.liveVitals === false) return null;
    const p = S.pulse(now), f = physio(now), tr = s.transitions?.[s.transitions.length - 1] ?? null;
    // The calm response (heartbeat.js): shown in calm moments with real readings, where it moves the scene.
    const bio = A.Biofeedback, level = bio && bio.calm !== false ? bio.level : null;
    return {
      pulse: { ...value(p.bpm, 'bpm'), sim: p.bpm != null && p.source === 'simulated', bpm: p.bpm ?? null },
      hrv: value(f.rmssd, 'ms'),
      breathing: value(f.breathing, '/min'),
      state: s.state ? { id: s.state, label: STATE[s.state] || s.state, mode: s.mode } : null,
      why: reason(tr),
      calm: Number.isFinite(level) ? clamp(level, 0, 1) : null,
      music: music(),
      room: room(now),
    };
  };

  // The chip: the reason of each new transition, shown for 5 s. hold() keeps it back while something else uses the
  // top line (a task's instruction), so it is seen in full once that is gone.
  let chipState = { s: null, seen: 0, text: null, at: null };
  const chip = (s, now, hold = false) => {
    if (!s || s.done || A.config?.liveVitals === false) return null;
    const c = chipState.s === s ? chipState : (chipState = { s, seen: 0, text: null, at: null });
    const n = s.transitions?.length ?? 0;
    if (n > c.seen) { c.seen = n; c.text = reason(s.transitions[n - 1]); c.at = null; }
    if (!c.text) return null;
    if (c.at == null) { if (hold) return null; c.at = now; }
    if (now - c.at >= CHIP_S) { c.text = null; return null; }
    return c.text;
  };

  // DOM: the panel #liveVitals and the chip #lvChip in index.html. Only changed text is written.
  const $ = id => typeof document === 'undefined' ? null : document.getElementById(id);
  const put = (el, text) => { if (el && el.textContent !== text) el.textContent = text; };
  let beat = null;
  const render = (s, now) => {
    const box = $('liveVitals'), chipEl = $('lvChip');
    if (!box) return;
    const m = model(s, now);
    box.classList.toggle('on', !!m);
    const c = chip(s, now, !!$('cue')?.classList.contains('on'));
    if (chipEl) { if (c) put(chipEl, c); chipEl.classList.toggle('on', !!c); }
    Lv.chipOn = !!c;
    if (!m) return;
    const q = sel => box.querySelector(sel);
    for (const k of ['pulse', 'hrv', 'breathing']) {
      const el = q(`[data-k="${k}"]`);
      put(el, m[k].text);
      el?.classList.toggle('none', m[k].value == null);
    }
    q('.lv-sim')?.classList.toggle('on', m.pulse.sim);
    const heart = q('.lv-heart'), bpm = m.pulse.bpm;
    if (heart) {
      heart.classList.toggle('on', bpm != null);
      const d = bpm == null ? null : (60 / clamp(bpm, 30, 200)).toFixed(2);
      if (d !== beat) { beat = d; heart.style.animationDuration = d ? `${d}s` : ''; }
    }
    put(q('.lv-label'), m.state ? m.state.label : 'Reading your signals');
    const dot = q('.lv-dot');
    if (dot) dot.style.background = m.state ? A.MODES?.[m.state.mode]?.colour || '' : '';
    put(q('.lv-why'), m.why || '');
    const calm = q('.lv-calm');
    calm?.classList.toggle('on', m.calm != null);
    if (m.calm != null) { const fill = q('.lv-fill'); if (fill) fill.style.transform = `scaleX(${m.calm.toFixed(2)})`; }
    for (const k of ['music', 'room']) {
      const el = q(`.lv-${k}`);
      el?.classList.toggle('on', !!m[k]);
      if (m[k]) put(el, m[k]);
    }
  };

  const Lv = A.LiveVitals = { model, chip, reason, render, chipOn: false, NONE, SIM, CHIP_S };
})();
