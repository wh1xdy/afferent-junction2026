(() => {
  const S = A.Sensors;
  const $ = id => document.getElementById(id);
  const DASH = '–', MIN_QUALITY = 0.3;
  const int = x => x == null ? null : String(Math.round(x));

  const PRESENCE = { idle: 'Resting. Place a finger in the clip to start.', probing: 'Looking for your finger', active: 'Measuring' };
  const LINK = {
    scanning: 'Looking for the finger sensor', connecting: 'Looking for the finger sensor',
    unauthorized: 'Bluetooth is off for Afferent in Settings', off: 'Switched off',
  };
  const NO_SENSOR = 'No finger sensor on this device', VIA_HUB = 'Connected through the home hub', PLACE = 'Connected. Place a finger in the clip to start.';
  const NONE = 'No reading right now', SIM = 'Simulated', BPM = 'beats per minute';
  const SOURCE = { finger_ppg: 'Finger sensor', ky039: 'Pulse stone', rppg: 'Camera', simulated: SIM };
  const TRUST = { reliable: 'steady', uncertain: 'uncertain', unreliable: 'weak' };
  const NO_QUALITY = 'This sensor version does not report signal quality yet, so the game does not use this pulse.';
  const CHIP = { finger_ppg: 'finger sensor', ky039: 'pulse stone', rppg: 'camera' };
  const BREATH_WAIT = 'Takes about half a minute of steady signal', BREATH_LAG = 'From your heart rhythm, about half a minute behind';
  // The finger sensor derives the breathing rate from its last 40 s of heartbeats (uno-q/modulino-hub/app.py, rsa_breathing).
  const BREATH_WINDOW_S = 40;

  const sensorLines = ph => {
    if (!S.enabled.pulse_stone) return ['Switched off'];
    const link = S.fingerLink.state;
    if (ph?.source) {
      const hub = ph.transport === 'hub_http';
      const state = PRESENCE[ph.presence] || (hub ? VIA_HUB : ph.pulse_bpm != null ? PRESENCE.active : PLACE);
      return [ph.simulated ? `${SIM}. ${state}` : state, ...(hub && state !== VIA_HUB ? [VIA_HUB] : [])];
    }
    return [link === 'connected' ? PLACE : LINK[link] || NO_SENSOR];
  };

  const row = (icon, label, value, lines) => ({ icon, label, value, lines: lines.filter(Boolean) });

  const pulseRow = (ph, p, now) => {
    const unsteady = !!ph?.source && ph.quality_reported && ph.quality != null && ph.quality < MIN_QUALITY;
    if (ph?.pulse_bpm != null && !unsteady) return row('ecg_heart', 'Pulse', int(ph.pulse_bpm), [BPM, ph.simulated ? SIM : SOURCE.finger_ppg]);
    if (p.bpm != null && !(p.source === 'simulated' && S.realProducer(now))) return row('ecg_heart', 'Pulse', int(p.bpm), [BPM, SOURCE[p.source]]);
    return row('ecg_heart', 'Pulse', null, [unsteady ? 'Finger sensor. Waiting for a steady signal' : NONE]);
  };

  const fingerRows = ph => {
    if (!ph?.source) return [];
    const sim = ph.simulated ? SIM : null, measuring = ph.presence === 'active' || ph.pulse_bpm != null;
    const [a, b] = ph.finger_bpm, wait = text => measuring ? text : NONE;
    return [
      a == null && b == null ? row('back_hand', 'Finger 1 and finger 2', null, [NONE])
        : row('back_hand', 'Finger 1 and finger 2', `${int(a) ?? DASH} · ${int(b) ?? DASH}`, [BPM, sim]),
      ph.breathing_per_min == null ? row('air', 'Breathing', null, [wait(BREATH_WAIT)])
        : row('air', 'Breathing', int(ph.breathing_per_min), ['breaths per minute', sim]),
      ph.rmssd_ms == null ? row('vital_signs', 'Beat-to-beat variation', null, [wait('Takes about a minute')])
        : row('vital_signs', 'Beat-to-beat variation', int(ph.rmssd_ms), ['ms (RMSSD)', sim]),
    ];
  };

  // Pulse at the start and at the end of a breathing task, only when there was a reading at both ends of it.
  const pulseSpan = r => r.pulse_start_bpm != null && r.pulse_end_bpm != null ? `Pulse ${int(r.pulse_start_bpm)} at the start, ${int(r.pulse_end_bpm)} at the end` : null;

  const cameraRow = cam => {
    if (!cam) return [];
    const trust = TRUST[cam.trust_label] ? `Signal ${TRUST[cam.trust_label]}` : null, score = cam.trust_score == null ? null : `${int(cam.trust_score)} of 100`;
    return [row('videocam', 'Pulse (camera)', int(cam.bpm), [cam.bpm == null ? NONE : BPM, [trust, score].filter(Boolean).join(' · ')])];
  };

  const earlier = () => {
    const v = A.lastVitals, at = A.lastVitalsAt;
    if (!v || !at || new Date(at).toDateString() !== new Date().toDateString()) return null;
    const f = v.finger?.source === 'finger_ppg' ? v.finger : null, cam = v.camera_pulse, rows = [];
    const over = unit => `${unit}, average`;
    if (f?.pulse_bpm?.mean != null) rows.push(row('ecg_heart', 'Pulse', int(f.pulse_bpm.mean), [over(BPM), SOURCE.finger_ppg]));
    else if (cam?.pulse_bpm?.mean != null) rows.push(row('videocam', 'Pulse', int(cam.pulse_bpm.mean), [over(BPM), SOURCE.rppg]));
    if (f && v.breathing?.rate_per_min?.mean != null) rows.push(row('air', 'Breathing', int(v.breathing.rate_per_min.mean), [over('breaths per minute')]));
    if (f && v.hrv?.rmssd_ms?.mean != null) rows.push(row('vital_signs', 'Beat-to-beat variation', int(v.hrv.rmssd_ms.mean), [over('ms (RMSSD)')]));
    // The average of a breathing task mostly describes the breathing before it unless the task outlasts the sensor's window.
    const b = f ? A.lastBreath : null;
    if (b) rows.push(row('air', 'Breathing around the breathing task', int(b.rate_per_min.mean), [over('breaths per minute'), BREATH_LAG, b.seconds >= BREATH_WINDOW_S && `Guide: ${int(b.guide_per_min)}`, pulseSpan(b)]));
    return rows.length ? { title: new Date(at).getHours() < 12 ? 'This morning' : 'Earlier today', rows } : null;
  };

  const model = now => {
    const ph = S.livePhysio(now), cam = S.cameraPulse(now), p = S.pulse(now);
    const rows = [pulseRow(ph, p, now), ...fingerRows(ph), row('sensors', 'Sensor', null, sensorLines(ph)), ...cameraRow(cam)];
    const note = ph?.source === 'finger_ppg' && !ph.quality_reported ? NO_QUALITY : null;
    return { rows, note, earlier: earlier() };
  };

  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const rowEl = r => {
    const li = el('div', 'li static two sig-row'), icon = el('span', 'ms', r.icon), txt = el('span', 'txt');
    icon.setAttribute('aria-hidden', 'true');
    txt.append(el('span', 'hl', r.label), ...r.lines.map(t => el('span', t === SIM ? 'sup sig-sim' : 'sup', t)));
    li.append(icon, txt);
    if (r.value != null) li.append(el('span', 'sig-val', r.value));
    return li;
  };
  const groupEl = (rows, title) => {
    const sec = el('section', 'sig-group'), box = el('div', 'group');
    if (title) sec.append(el('h3', 'subhead t-label', title));
    box.append(...rows.map(rowEl));
    sec.append(box);
    return sec;
  };

  let drawn = '';
  const render = () => {
    const body = $('signalsBody');
    if (!body) return;
    const m = model(A.now()), key = JSON.stringify(m);
    if (key === drawn && body.childElementCount) return;
    drawn = key;
    const nodes = [groupEl(m.rows)];
    if (m.note) nodes.push(el('p', 't-body-s muted sig-note', m.note));
    if (m.earlier) nodes.push(groupEl(m.earlier.rows, m.earlier.title));
    body.replaceChildren(...nodes);
  };

  const tick = () => {
    if (typeof A.now !== 'function') return;
    const sheet = $('signals'), state = $('fingerState');
    if (sheet && !sheet.classList.contains('hidden')) render();
    if (state) { const t = sensorLines(S.livePhysio(A.now()))[0]; if (state.textContent !== t) state.textContent = t; }
  };

  const chip = (s, p) => {
    if (!s || s.done || s.gameMode === 'measure' || !['walk', 'game', 'dawn'].includes(s.phase)) return null;
    if (p.bpm == null) return 'no reading';
    return p.source === 'simulated' ? 'SIMULATED' : `${int(p.bpm)} bpm · ${CHIP[p.source] || 'sensor'}`;
  };

  // The breathing task, during play: [line, small print] while the finger clips give a real, current reading, then the
  // average of the task until the next task starts. null when there is nothing measured to say. The caller applies
  // the "Signals during play" switch, as it does for chip().
  const breaths = x => `${int(x)} ${int(x) === '1' ? 'breath' : 'breaths'} a minute`;
  const breath = (s, now) => {
    if (!s || s.done || s.gameMode === 'measure') return null;
    const v = s.phase === 'game' && s.game?.id === 'breath' ? s.game.fb?.view() : null, r = s.breathResult;
    if (v) {
      return v.state === 'reading' ? [`You: ${breaths(v.rate)} · Guide: ${int(v.guide)}`, `${SOURCE.finger_ppg}. ${BREATH_LAG}`]
        : [`You: measuring… · Guide: ${breaths(v.guide)}`, `${SOURCE.finger_ppg}. ${BREATH_WAIT}`];
    }
    if (!r || now >= r.until || !['walk', 'dawn'].includes(s.phase)) return null;
    return [`Measured: ${breaths(r.rate_per_min.mean)} on average`, [SOURCE.finger_ppg, BREATH_LAG, pulseSpan(r)].filter(Boolean).join('. ')];
  };

  if (typeof document !== 'undefined') {
    document.addEventListener('click', e => { if (e.target.closest?.('[data-open="signals"]')) render(); }, true);
    setInterval(tick, 1000);
    addEventListener('load', tick);
  }

  A.Vitals = { model, render, chip, breath, sensorLines };
})();
