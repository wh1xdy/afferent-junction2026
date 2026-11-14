(() => {
  const q = new URLSearchParams(location.search);
  const $ = id => document.getElementById(id);
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  };
  const speed = Math.max(0.1, Number(q.get('speed')) || 1);
  const t0 = performance.now();
  A.now = () => (performance.now() - t0) / 1000 * speed;

  const saved = store.get('afferent.settings') || {};
  const deviceId = store.get('afferent.device') || 'inst-' + Math.random().toString(16).slice(2, 8);
  store.set('afferent.device', deviceId);
  const prefersCalm = !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  A.config = {
    deviceId, appVersion: '0.3.0', patientId: q.get('patient') || 'anna', dawnLevel: 15, baselinePulse: 68,
    reducedMotion: saved.reducedMotion ?? prefersCalm,
    sensors: { phone_camera: true, pulse_stone: true, bedside_camera: false, bedside_light: true, presence: true, phone_motion: false, ...saved.sensors },
    sharing: saved.sharing || 'summary',
    simulator: saved.simulator ?? true,
    quietNight: saved.quietNight ?? true,
    checkin: saved.checkin ?? true,
    signalsOverlay: saved.signalsOverlay ?? false,
  };
  const S = A.Sensors;
  const syncSensors = () => Object.assign(S.enabled, { phone_camera: A.config.sensors.phone_camera, pulse_stone: A.config.sensors.pulse_stone, simulator: A.config.simulator });
  syncSensors();

  const PROFILES = ['live', 'good_day', 'bad_day'];
  const hour = new Date().getHours();
  const ui = {
    input: ['auto', 'touch', 'camera'].includes(q.get('input')) ? q.get('input') : 'touch',
    clock: q.get('clock') === 'night' || (!q.get('clock') && (hour >= 21 || hour < 6)) ? 'night' : 'morning',
    stage: q.get('stage') === '1',
    profile: PROFILES.includes(q.get('profile')) ? q.get('profile') : 'live',
    sound: saved.sound ?? true,
  };
  A.Audio.on = ui.sound;

  const canvas = $('game'), ctx = canvas.getContext('2d');
  let W = 0, H = 0, dpr = 1;
  const resize = () => { dpr = Math.min(devicePixelRatio || 1, A.Perf ? A.Perf.cap : 2); W = canvas.clientWidth; H = canvas.clientHeight; canvas.width = W * dpr; canvas.height = H * dpr; };
  addEventListener('resize', resize); resize();

  A.Input.init(canvas);
  let idle = A.makeVisual(ui.profile); idle.black = 0;
  let idleTweens = [];
  const idleTween = (obj, key, from, to, dur) => { idleTweens = idleTweens.filter(x => !(x.obj === obj && x.key === key)); idleTweens.push({ obj, key, from, to, start: A.now(), dur }); };

  const log = msg => {
    const li = document.createElement('li');
    li.textContent = `${A.now().toFixed(1).padStart(6)}  ${msg}`;
    $('events').prepend(li);
    while ($('events').children.length > 16) $('events').lastChild.remove();
  };

  const LABEL = { live: 'Today', good_day: 'Good day', bad_day: 'Bad day' };
  const DEV = {
    input: ['Input', () => ({ auto: 'Autoplay story', touch: 'Touch', camera: 'Touch and camera' }[ui.input])],
    clock: ['Clock', () => ui.clock === 'night' ? 'Night' : 'Morning'],
    stage: ['Session', () => ui.stage ? 'Short' : 'Full'],
    profile: ['Day profile', () => LABEL[ui.profile]],
  };
  const devChips = $('devChips');
  Object.keys(DEV).forEach(k => { const b = document.createElement('button'); b.className = 'chip'; b.type = 'button'; b.dataset.dev = k; devChips.append(b); });
  const chips = () => {
    document.querySelectorAll('[data-dev]').forEach(el => {
      const [label, val] = DEV[el.dataset.dev];
      const v = el.querySelector('.val');
      if (v) v.textContent = val(); else el.textContent = `${label.toLowerCase()}: ${val().toLowerCase()}`;
      el.classList.toggle('sim', el.dataset.dev === 'profile' && ui.profile !== 'live');
    });
    $('profileTag').textContent = LABEL[ui.profile].toLowerCase();
    camGlyph();
  };
  const camGlyph = () => {
    const on = A.config.sensors.phone_camera && (ui.input === 'camera' || S.camera());
    $('camBtn').hidden = !on;
  };
  const setProfile = (p, from) => {
    if (!PROFILES.includes(p)) return;
    ui.profile = p; chips();
    if (A.session && !A.session.done) A.session.setProfile(p, A.now());
    else { A.applyProfileVisual(idle, p, idleTween); A.bus.emit('profile', p); }
    log(`profile ${p}${from ? ' from ' + from : ''}`);
  };
  const DEV_ACT = {
    input: () => {
      const order = A.config.sensors.phone_camera ? { auto: 'touch', touch: 'camera', camera: 'auto' } : { auto: 'touch', touch: 'auto', camera: 'auto' };
      ui.input = order[ui.input]; chips();
    },
    clock: () => { ui.clock = ui.clock === 'night' ? 'morning' : 'night'; chips(); morningText(); },
    stage: () => { ui.stage = !ui.stage; chips(); },
    profile: () => setProfile(PROFILES[(PROFILES.indexOf(ui.profile) + 1) % PROFILES.length]),
  };
  document.querySelectorAll('[data-dev]').forEach(el => el.onclick = () => DEV_ACT[el.dataset.dev]());
  const setSound = on => { ui.sound = on; A.Audio.on = on; $('soundSw').checked = on; saveSettings(); };
  chips();

  $('weekBtn').href = 'patient.html' + location.search;

  const hubKey = 'afferent.hub';
  const normHub = v => {
    v = (v || '').trim().replace(/\/+$/, '');
    if (!v) return '';
    if (!/^(https?|wss?):\/\//.test(v)) v = 'http://' + v;
    if (!/:\d+$/.test(v.replace(/^[a-z]+:\/\//, ''))) v += ':8000';
    return v;
  };
  try { $('hubAddr').value = localStorage.getItem(hubKey) || ''; } catch {}
  $('hubForm').onsubmit = e => {
    e.preventDefault();
    show('hubDialog', false);
    const v = normHub($('hubAddr').value);
    try { v ? localStorage.setItem(hubKey, v) : localStorage.removeItem(hubKey); } catch {}
    location.reload();
  };

  const night = () => ui.clock === 'night';
  A.night = night;
  const morningText = () => {
    $('endText').textContent = night() ? 'Rest well.' : 'Good morning.';
    $('decline').textContent = night() ? 'Not tonight' : 'Not today';
    $('end').classList.toggle('night', night());
    A.Theme.sync();
    A.Checkin.refresh();
    A.bus.emit('home');
  };

  const FADES = new Set(['start', 'end']), CARDS = ['crisis', 'info', 'signals', 'settings', 'hubDialog'];
  const show = (id, on) => {
    $(id).classList.toggle(FADES.has(id) ? 'off' : 'hidden', !on);
    if (CARDS.includes(id)) {
      $('phone').classList.toggle('card-open', CARDS.some(c => !$(c).classList.contains('hidden')));
    }
  };
  const crisis = source => {
    if (window.AfferentSupport?.open) window.AfferentSupport.open('talk');
    else show('crisis', true);
    A.bus.emit('ws', { type: 'crisis', patient_id: A.config.patientId, ...(A.session?.rec?.session_id ? { session_id: A.session.rec.session_id } : {}), source, t_iso: A.Record.isoLocal(new Date()) });
    log('crisis card opened (' + source + ')');
  };
  document.querySelectorAll('[data-open]').forEach(b => b.onclick = () => b.dataset.open === 'crisis' ? crisis('talk_button') : show(b.dataset.open, true));
  document.querySelectorAll('[data-close]').forEach(b => b.onclick = () => show(b.dataset.close, false));
  A.bus.on('crisisOffer', () => { show('offer', true); log('talk offer shown (lowest lantern twice)'); });
  $('offerYes').onclick = () => { show('offer', false); crisis('mood'); };
  $('offerNo').onclick = () => { show('offer', false); log('talk offer declined'); };

  A.Checkin.init({ night: () => night(), busy: () => !!A.session, log: m => log(m) });
  A.bus.on('talk', () => crisis('talk_button'));

  const saveSettings = () => store.set('afferent.settings', { sensors: A.config.sensors, sharing: A.config.sharing, simulator: A.config.simulator, reducedMotion: A.config.reducedMotion, quietNight: A.config.quietNight, checkin: A.config.checkin, signalsOverlay: A.config.signalsOverlay, sound: ui.sound });
  const sharingSeg = () => {
    const bs = [...document.querySelectorAll('#sharingSeg button')];
    bs.forEach(b => b.setAttribute('aria-checked', String(b.dataset.v === A.config.sharing)));
    $('sharingSeg').style.setProperty('--idx', Math.max(0, bs.findIndex(b => b.dataset.v === A.config.sharing)));
  };
  const toggles = () => {
    document.querySelectorAll('[data-sensor]').forEach(el => { el.checked = !!A.config.sensors[el.dataset.sensor]; });
    sharingSeg();
    $('simSw').checked = A.config.simulator;
    $('motionSw').checked = A.config.reducedMotion;
    $('soundSw').checked = ui.sound;
    $('quietSw').checked = A.config.quietNight;
    $('checkinSw').checked = A.config.checkin;
    $('sigSw').checked = A.config.signalsOverlay;
    camGlyph();
  };
  document.querySelectorAll('[data-sensor]').forEach(el => el.onchange = () => {
    const sensor = el.dataset.sensor;
    A.config.sensors[sensor] = el.checked;
    if (sensor === 'phone_camera' && !el.checked) { if (ui.input === 'camera') { ui.input = 'touch'; chips(); } if (S.camera()) S.stop(); }
    syncSensors(); saveSettings(); camGlyph();
    if (sensor === 'pulse_stone') { A.Finger.sync(); if (!el.checked) S.feedPulse({ bpm: null, source: 'finger_ppg' }); }
    A.bus.emit('ws', { type: 'privacy', patient_id: A.config.patientId, sensor, on: el.checked });
  });
  document.querySelectorAll('#sharingSeg button').forEach(b => b.onclick = () => {
    if (A.config.sharing === b.dataset.v) return;
    A.config.sharing = b.dataset.v; sharingSeg(); saveSettings();
    A.bus.emit('ws', { type: 'privacy', patient_id: A.config.patientId, sharing: A.config.sharing });
  });
  $('simSw').onchange = e => { A.config.simulator = e.target.checked; syncSensors(); saveSettings(); camGlyph(); };
  $('motionSw').onchange = e => { A.config.reducedMotion = e.target.checked; A.Theme.motion(); saveSettings(); };
  $('soundSw').onchange = e => setSound(e.target.checked);
  $('quietSw').onchange = e => { A.config.quietNight = e.target.checked; A.Theme.room(); setDawn(A.config.dawnLevel); saveSettings(); };
  $('checkinSw').onchange = e => { A.config.checkin = e.target.checked; saveSettings(); A.Checkin.refresh(); };
  $('sigSw').onchange = e => { A.config.signalsOverlay = e.target.checked; saveSettings(); };

  const applyPrivacy = pv => {
    if (!pv) return;
    if (pv.sensors) Object.assign(A.config.sensors, pv.sensors);
    if (pv.sharing) A.config.sharing = pv.sharing;
    syncSensors(); toggles(); saveSettings();
    A.Finger.sync();
    if (!A.config.sensors.pulse_stone) S.feedPulse({ bpm: null, source: 'finger_ppg' });
  };
  morningText(); toggles();
  A.Finger.sync();

  let timeline = [];

  document.querySelectorAll('#moodEnd .mood-lantern').forEach(b => b.onclick = () => A.session?.setMood(Number(b.dataset.v)));

  const begin = async () => {
    A.Audio.on = ui.sound;
    A.Audio.start(0.25);
    A.Input.mode = ui.input;
    if (ui.input === 'camera' && !S.camera()) {
      $('begin').disabled = true;
      log('starting camera');
      try { log(`camera on (${await S.startCamera()}), only eye openness and head tilt are read`); }
      catch (e) { log('camera unavailable, eyes come from the simulator'); S.stop(); A.Input.mode = ui.input = 'touch'; chips(); }
      $('begin').disabled = false;
    } else if (ui.input !== 'camera' && S.camera()) S.stop();
    show('start', false); show('end', false); show('closeBtn', true); show('checkinBtn', false);
    CARDS.forEach(c => show(c, false));
    resetEnd();
    $('json').textContent = '';
    timeline = [];
    A.session = A.startSession({ input: A.Input.mode, clock: ui.clock, stage: ui.stage, profile: ui.profile, visual: idle });
    camGlyph();
    const s = A.session;
    A.bus.emit('ws', { type: 'session_start', session_id: s.rec.session_id, patient_id: A.config.patientId, clock: ui.clock, profile: ui.profile, simulated: s.liveMetrics(A.now()).simulated, sensors: s.rec.sensors, t_iso: s.rec.started_iso });
    log(`session start, ${A.Input.mode}, ${ui.clock}, ${ui.profile}`);
  };
  $('begin').addEventListener('kindle', begin);

  $('decline').onclick = () => {
    const r = A.declinedRecord(ui.profile);
    $('json').textContent = JSON.stringify(r, null, 2);
    A.bus.emit('ws', { type: 'session_end', session: r });
    A.bus.emit('sessionEnd', r);
    log('not tonight, logged as declined');
    resetEnd(); $('end').classList.add('declined');
    $('endText').textContent = night() ? 'Rest well.' : 'See you tomorrow.';
    A.Shell.phase('declined');
    show('start', false); show('end', true);
  };

  let curtain = null, curtainV = 0, leaving = false, endShown = false;
  const fadeCurtain = (to, dur, then) => { curtain = { from: curtainV, to, start: A.now(), dur, then }; };
  const resetEnd = () => {
    endShown = false;
    $('end').classList.remove('declined', 'dim', 'closed');
    $('endText').textContent = night() ? 'Rest well.' : 'Good morning.';
    show('offer', false);
  };
  const goHome = () => {
    if (leaving) return;
    leaving = true;
    const s = A.session;
    if (s && !s.done) s.close();
    show('end', false); show('wakeBtn', false); show('offer', false); CARDS.forEach(c => show(c, false));
    fadeCurtain(1, 1.2, () => {
      A.session = null;
      idle = A.makeVisual(ui.profile); idle.black = 0;
      resetEnd(); camGlyph(); A.Checkin.refresh();
      show('start', true); A.bus.emit('home');
      fadeCurtain(0, 1.8, () => { leaving = false; });
    });
  };
  $('again').onclick = goHome;
  $('wakeBtn').onclick = goHome;
  $('closeBtn').onclick = () => A.bus.emit('exit');
  const cue = text => { if (text) $('cue').textContent = text; $('cue').classList.toggle('on', !!text); };

  $('download').onclick = () => {
    const text = $('json').textContent;
    if (!text) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    a.download = `afferent-session-${Date.now()}.json`;
    a.click();
  };

  document.addEventListener('visibilitychange', () => { if (document.hidden && A.session && !A.session.done) A.session.pauses++; });

  ['pdown', 'pmove', 'pup', 'key', 'exit'].forEach(type => A.bus.on(type, d => A.session?.handle(type, d)));
  A.bus.on('segment', id => {
    if (id !== 'walk') log('phase ' + id);
    cue(id === 'checkin' ? (night() ? 'How are you tonight?' : 'How are you this morning?') : '');
  });
  A.bus.on('mode', m => log('mode ' + m));
  A.bus.on('game', g => log(`task ${g.id} slot ${g.slot} (${g.mode}${g.kind === 'adaptive' ? ', intensity ' + g.k.toFixed(2) : ''})`));
  A.bus.on('haptic', () => { $('haptic').classList.remove('pulse'); void $('haptic').offsetWidth; $('haptic').classList.add('pulse'); });
  A.bus.on('mood', m => {
    log(`lantern check-in ${m.which} ${m.value ?? 'skipped'}`);
    if (m.which === 'start') cue('');
  });
  A.bus.on('endScreen', () => { endShown = true; show('end', true); show('closeBtn', false); });
  A.bus.on('endDim', () => $('end').classList.add('dim'));
  A.bus.on('sessionEnd', r => {
    $('json').textContent = JSON.stringify(r, null, 2);
    log(`session ${r.status}, ${((r.duration_ms || 0) / 1000).toFixed(1)} s`);
    show('closeBtn', false); show('simBadge', false); show('liveChip', false); cue('');
    if (r.vitals?.finger?.source === 'finger_ppg' || r.vitals?.camera_pulse) { A.lastVitals = r.vitals; A.lastVitalsAt = Date.now(); }
    if (S.camera()) S.stop();
    camGlyph();
    if (leaving || r.status === 'declined') return;
    if (r.status === 'fell_asleep') { $('phone').addEventListener('pointerdown', () => show('wakeBtn', true), { once: true }); return; }
    if (endShown) { $('end').classList.add('closed'); return; }
    $('end').classList.add('declined'); A.Shell.phase('declined'); show('end', true);
  });

  const led = $('led');
  let ledTimer = null;
  const setLed = (rgb, level, fade) => {
    led.style.transition = `background-color ${fade}ms linear, box-shadow ${fade}ms linear, opacity ${fade}ms linear`;
    led.style.backgroundColor = rgb === '#000000' ? '#222' : rgb;
    led.style.opacity = 0.15 + 0.85 * level / 100;
    led.style.boxShadow = level ? `0 0 ${10 + level * 1.2}px ${level * 0.4}px ${rgb}` : 'none';
    $('ledLevel').textContent = `${level}%`;
  };
  A.bus.on('light', ({ rgb, level, fade_ms }) => {
    clearTimeout(ledTimer);
    setLed(rgb, level, fade_ms);
    if (rgb === '#FFC98A' || rgb === '#FFF3DC') ledTimer = setTimeout(() => setLed(rgb, 0, 10000), fade_ms + 30000);
  });
  setLed('#FFD9A0', 5, 0);
  const setDawn = v => {
    const cap = A.config.quietNight ? 25 : 60;
    v = Math.min(cap, v); A.config.dawnLevel = v;
    $('knob').max = cap; $('knob').value = v; $('knobVal').textContent = v + '%';
  };
  $('knob').oninput = e => setDawn(Number(e.target.value));

  const sliders = { pulseSlider: 'offset', drowsySlider: 'drowsy' };
  for (const [id, key] of Object.entries(sliders)) {
    const el = $(id);
    el.addEventListener('pointerdown', () => el.dataset.active = '1');
    el.addEventListener('pointerup', () => delete el.dataset.active);
    el.oninput = () => { A.Sim[key] = Number(el.value); A.Sim.holdUntil = 0; };
  }
  const presets = { stressBtn: { offset: 22 }, flatBtn: { offset: -9 }, tiredBtn: { drowsy: 0.85 }, shutBtn: { eyesShut: true }, normalBtn: { offset: 0, drowsy: 0, eyesShut: false } };
  for (const [id, p] of Object.entries(presets)) $(id).onclick = () => { Object.assign(A.Sim, p, { holdUntil: 0 }); log('simulate ' + $(id).textContent); };

  const Hub = A.Hub;
  Hub.on('connected', on => { $('hubTag').textContent = on ? 'connected' : 'offline'; $('hubTag').classList.toggle('on', on); $('hubState').textContent = (on ? 'Connected' : 'Offline') + (Hub.url ? ' · ' + Hub.httpBase().replace(/^https?:\/\//, '') : ''); log(on ? 'hub connected' : 'hub disconnected'); });
  Hub.on('config', c => {
    if (c.baseline_pulse_bpm) A.config.baselinePulse = c.baseline_pulse_bpm;
    if (Number.isFinite(c.dawn_level)) setDawn(c.dawn_level);
    applyPrivacy(c.privacy);
    log(`config: baseline ${c.baseline_pulse_bpm ?? '-'} bpm, weights for ${Object.keys(c.task_weights || {}).length} modes`);
  });
  Hub.on('ack', d => log(`hub stored session${d.duplicate ? ' (duplicate)' : ''}${d.error ? ' error ' + d.error : ''}`));
  Hub.on('pulse', d => S.feedPulse(d));
  Hub.on('physio', d => S.feedFingerHub(d));
  Hub.on('knob', d => { if (Number.isFinite(d.level)) setDawn(d.level); if (d.press) log('knob press'); });
  Hub.on('profile', d => setProfile(d.profile, 'hub'));
  Hub.on('privacy', d => applyPrivacy(d.privacy));
  Hub.on('demo_reset', () => log('hub demo reset'));
  if (!Hub.connect({ patientId: A.config.patientId, hello: { profile: ui.profile } })) { log('no hub, offline mode'); $('hubState').textContent = 'Not set'; }
  else { log('hub ' + Hub.url); $('hubState').textContent = 'Connecting to ' + Hub.httpBase().replace(/^https?:\/\//, ''); }

  const MODE_COL = { ...Object.fromEntries(Object.entries(A.MODES).map(([k, v]) => [k, v.colour])), measure: '#B4A6CE' };
  const tl = $('timeline'), tctx = tl.getContext('2d');

  function drawTimeline() {
    const w = tl.width = tl.clientWidth * dpr, h = tl.height = tl.clientHeight * dpr;
    tctx.clearRect(0, 0, w, h);
    const span = 125, x = t => t / span * w, mid = h * 0.45, y = d => mid - d / 30 * h * 0.4;
    tctx.strokeStyle = 'rgba(255,255,255,0.08)'; tctx.beginPath(); tctx.moveTo(0, mid); tctx.lineTo(w, mid); tctx.stroke();
    for (let i = 1; i < timeline.length; i++) {
      const a = timeline[i - 1], b = timeline[i];
      if (b.mode) { tctx.fillStyle = MODE_COL[b.mode]; tctx.globalAlpha = 0.55; tctx.fillRect(x(a.t), h - 8 * dpr, x(b.t) - x(a.t) + 1, 8 * dpr); tctx.globalAlpha = 1; }
    }
    const line = (key, color, f) => {
      tctx.strokeStyle = color; tctx.lineWidth = 1.5 * dpr; tctx.beginPath();
      timeline.forEach((p, i) => { if (p[key] === null) return; const yy = f(p[key]); i ? tctx.lineTo(x(p.t), yy) : tctx.moveTo(x(p.t), yy); });
      tctx.stroke();
    };
    line('d', '#F2B544', y);
    tctx.setLineDash([3 * dpr, 3 * dpr]); line('f', '#9fb7ff', f => h - 10 * dpr - f * h * 0.35); tctx.setLineDash([]);
  }

  function panel(s, now) {
    const p = S.pulse(now);
    $('pulseVal').textContent = s && p.bpm != null ? p.bpm.toFixed(0) : '--';
    $('pulseSrc').textContent = { finger_ppg: 'finger sensor', ky039: 'pulse stone', rppg: 'face (rPPG)', simulated: 'SIMULATED' }[p.source] || 'none';
    for (const [id, key] of Object.entries(sliders)) { const el = $(id); if (!el.dataset.active) el.value = A.Sim[key]; }
    $('pulseSliderVal').textContent = (A.Sim.offset >= 0 ? '+' : '') + A.Sim.offset.toFixed(0) + ' bpm';
    $('drowsySliderVal').textContent = A.Sim.drowsy.toFixed(2);
    const mode = s?.mode && ['walk', 'game', 'dawn'].includes(s.phase) ? (s.gameMode === 'measure' ? 'measure' : s.mode) : null;
    $('modePill').textContent = mode ? (mode === 'measure' ? `measure (director ${s.mode})` : mode) : (s ? s.phase : 'idle');
    $('modePill').style.borderColor = mode ? MODE_COL[mode] : '';
    $('modePill').style.color = mode ? MODE_COL[mode] : '';
    $('arousalBar').style.width = `${A.clamp(50 + (s?.a ?? 0) * 25, 0, 100)}%`;
    $('fatigueBar').style.width = `${(s?.fat ?? 0) * 100}%`;
    $('gameVal').textContent = s?.game ? `${s.game.id} slot ${s.game.slot}  k=${s.game.k.toFixed(2)}  items ${s.game.items}  errors ${s.game.errors}` : '-';
    const f = S.last;
    $('eyesVal').textContent = `eyes ${S.eyesSource() || 'off'}  ${A.Eyes.closed ? 'closed' : 'open'}  open ${f?.eye_openness?.toFixed(2) ?? '-'}  perclos ${A.Eyes.perclos().toFixed(2)}  pitch ${f?.head_pitch_deg?.toFixed(0) ?? '-'}`;
    if (s && !s.done) timeline.push({ t: now - s.t0, d: p.bpm == null ? null : p.bpm - s.rest, f: s.fat, mode });
    drawTimeline();
    const sim = !!s && !s.done && (p.source === 'simulated' || S.eyesSource() === 'simulated' || s.auto || s.profile !== 'live');
    show('simBadge', sim);
    const chip = A.config.signalsOverlay ? A.Vitals.chip(s, p) : null;
    if (chip) $('liveChip').textContent = chip;
    show('liveChip', !!chip);
  }

  let last = A.now(), frame = 0, lastLive = 0;
  const loop = () => {
    const now = A.now(), dt = Math.min(0.05 * speed, now - last); last = now;
    A.Input.update(now, dt);
    const s = A.session;
    if (s) s.update(now, dt);
    if (s && !s.done && now - lastLive >= 0.5) { lastLive = now; A.bus.emit('ws', s.liveMetrics(now)); }
    const V = s ? s.V : idle;
    if (!s) {
      V.t = now; V.lanternBright = V.lanternGain; V.lanternRadius = 70 * V.lanternGain;
      for (const tw of idleTweens) tw.obj[tw.key] = A.lerp(tw.from, tw.to, A.ease((now - tw.start) / tw.dur));
      idleTweens = idleTweens.filter(tw => now - tw.start < tw.dur);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    A.World.draw(ctx, W, H, V);
    A.Theme.frame(canvas);
    A.FXGL?.present(canvas, V, s);
    s?.drawOverlay(ctx, now);
    if (curtain) {
      const k = A.clamp((now - curtain.start) / curtain.dur, 0, 1);
      curtainV = A.lerp(curtain.from, curtain.to, A.ease(k));
      if (k >= 1) { const then = curtain.then; curtain = null; then?.(); }
    }
    if (curtainV > 0.001) { ctx.fillStyle = `rgba(0,0,0,${curtainV})`; ctx.fillRect(0, 0, W, H); }
    if (++frame % 8 === 0) panel(s, now);
    requestAnimationFrame(loop);
  };
  A.bus.on('artLoaded', names => log(`art layers: ${names.length ? names.join(', ') : 'none, procedural only'}`));
  A.Art.load();
  loop();
})();
