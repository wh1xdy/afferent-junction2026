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
  const SOURCE = { finger_ppg: 'Finger sensor', ky039: 'Pulse stone', simulated: SIM };
  const TRUST = { reliable: 'steady', uncertain: 'uncertain', unreliable: 'weak' };
  const CAMERA = 'Pulse, camera estimate', UNSTEADY = 'No steady reading right now';
  const CAM_LINK = {
    starting: 'Starting the camera', on: 'Starting the camera', off: 'Switched off',
    unauthorized: 'Camera is off for Afferent in Settings', unsupported: 'Not available on this phone',
  };
  const CAM_HINT = { 'head moving': 'Hold the phone still', 'face too dark': 'More light on your face helps', 'face overexposed': 'Too much light on your face' };
  const NO_QUALITY = 'This sensor version does not report signal quality yet, so the game does not use this pulse.';
  const CHIP = { finger_ppg: 'finger sensor', ky039: 'pulse stone' };

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
      ph.breathing_per_min == null ? row('air', 'Breathing', null, [wait('Takes about half a minute of steady signal')])
        : row('air', 'Breathing', int(ph.breathing_per_min), ['breaths per minute', sim]),
      ph.rmssd_ms == null ? row('vital_signs', 'Beat-to-beat variation', null, [wait('Takes about a minute')])
        : row('vital_signs', 'Beat-to-beat variation', int(ph.rmssd_ms), ['ms (RMSSD)', sim]),
    ];
  };

  const signalQuality = (score, label) => [`Signal quality ${int(score)} of 100`, TRUST[label]].filter(Boolean).join(' · ');

  const cameraRow = (cam, st) => {
    if (cam) return [row('videocam', CAMERA, int(cam.bpm), [cam.bpm == null ? UNSTEADY : BPM, signalQuality(cam.trust_score, cam.trust_label), CAM_HINT[st.reason]])];
    if (st.link === 'unavailable') return [];
    const waiting = st.face === false ? 'No face in view' : st.face ? 'Hold still. Takes about ten seconds' : null;
    return [row('videocam', CAMERA, null, [st.link === 'on' && waiting ? waiting : CAM_LINK[st.link] || NONE])];
  };

  const earlier = () => {
    const v = A.lastVitals, at = A.lastVitalsAt;
    if (!v || !at || new Date(at).toDateString() !== new Date().toDateString()) return null;
    const f = v.finger?.source === 'finger_ppg' ? v.finger : null, cam = v.camera_pulse, rows = [];
    const over = unit => `${unit}, average`;
    if (f?.pulse_bpm?.mean != null) rows.push(row('ecg_heart', 'Pulse', int(f.pulse_bpm.mean), [over(BPM), SOURCE.finger_ppg]));
    if (f && v.breathing?.rate_per_min?.mean != null) rows.push(row('air', 'Breathing', int(v.breathing.rate_per_min.mean), [over('breaths per minute')]));
    if (f && v.hrv?.rmssd_ms?.mean != null) rows.push(row('vital_signs', 'Beat-to-beat variation', int(v.hrv.rmssd_ms.mean), [over('ms (RMSSD)')]));
    if (cam?.source === 'rppg' && cam.pulse_bpm?.mean != null) rows.push(row('videocam', CAMERA, int(cam.pulse_bpm.mean), [over(BPM), cam.trust_score?.mean == null ? null : `${signalQuality(cam.trust_score.mean)}, average`]));
    return rows.length ? { title: new Date(at).getHours() < 12 ? 'This morning' : 'Earlier today', rows } : null;
  };

  const model = now => {
    const ph = S.livePhysio(now), cam = S.cameraPulse(now), p = S.pulse(now);
    const rows = [pulseRow(ph, p, now), ...fingerRows(ph), row('sensors', 'Sensor', null, sensorLines(ph)), ...cameraRow(cam, S.cameraState(now))];
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

  if (typeof document !== 'undefined') {
    document.addEventListener('click', e => { if (e.target.closest?.('[data-open="signals"]')) render(); }, true);
    setInterval(tick, 1000);
    addEventListener('load', tick);
  }

  A.Vitals = { model, render, chip, sensorLines };
})();
