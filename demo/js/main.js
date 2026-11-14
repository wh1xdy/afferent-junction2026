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
  A.fromPerf = ms => (ms - t0) / 1000 * speed;

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
    weeklyCheckin: saved.weeklyCheckin ?? true,
    forceTask: q.get('task') || null,
    forceK: q.has('k') ? Number(q.get('k')) : null,
    forceRide: q.get('ride') || null,
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

  const LABEL = { live: 'day: live', good_day: 'day: good day', bad_day: 'day: bad day' };
  const chips = () => {
    $('inputChip').textContent = { auto: 'input: autoplay story', touch: 'input: touch', camera: 'input: touch + camera' }[ui.input];
    $('clockChip').textContent = ui.clock === 'night' ? 'clock: night' : 'clock: morning';
    $('stageChip').textContent = ui.stage ? 'stage mode (60 s)' : 'full session';
    $('profileChip').textContent = LABEL[ui.profile];
    $('profileChip').classList.toggle('sim', ui.profile !== 'live');
    $('profileTag').textContent = ui.profile;
    $('soundBtn').classList.toggle('off', !ui.sound);
    camGlyph();
  };
  const camGlyph = () => {
    const st = !A.config.sensors.phone_camera ? 'off' : ui.input === 'camera' || S.camera() ? 'on' : A.config.simulator ? 'simulated' : 'off';
    $('camBtn').dataset.state = st;
    $('camBtn').setAttribute('aria-label', 'Camera: ' + st);
  };
  const setProfile = (p, from) => {
    if (!PROFILES.includes(p)) return;
    ui.profile = p; chips();
    if (A.session && !A.session.done) A.session.setProfile(p, A.now());
    else { A.applyProfileVisual(idle, p, idleTween); A.bus.emit('profile', p); }
    log(`profile ${p}${from ? ' from ' + from : ''}`);
  };
  $('inputChip').onclick = () => {
    const order = A.config.sensors.phone_camera ? { auto: 'touch', touch: 'camera', camera: 'auto' } : { auto: 'touch', touch: 'auto', camera: 'auto' };
    ui.input = order[ui.input]; chips();
  };
  $('clockChip').onclick = () => { ui.clock = ui.clock === 'night' ? 'morning' : 'night'; chips(); morningText(); };
  $('stageChip').onclick = () => { ui.stage = !ui.stage; chips(); };
  $('profileChip').onclick = () => setProfile(PROFILES[(PROFILES.indexOf(ui.profile) + 1) % PROFILES.length]);
  const setSound = on => { ui.sound = on; A.Audio.on = on; $('soundSw').checked = on; chips(); saveSettings(); };
  $('soundBtn').onclick = () => setSound(!ui.sound);
  chips();

  $('weekBtn').href = 'patient.html' + location.search;

  const phone = window.matchMedia?.('(max-width: 760px)').matches;
  if (phone && !q.has('dev')) $('demoBox').querySelector('summary').after(document.querySelector('#start .chips'));

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
    const v = normHub($('hubAddr').value);
    try { v ? localStorage.setItem(hubKey, v) : localStorage.removeItem(hubKey); } catch {}
    location.reload();
  };

  const night = () => ui.clock === 'night';
  const morningText = () => {
    $('endText').textContent = night() ? 'Rest well.' : 'Good morning.';
    $('decline').textContent = night() ? 'Not tonight' : 'Not today';
    $('crisisLead').textContent = `If ${night() ? 'tonight' : 'today'} is heavy, you do not have to carry it alone.`;
    $('end').classList.toggle('night', night());
    weeklyPill();
  };

  const FADES = new Set(['start', 'end']), CARDS = ['crisis', 'info', 'settings', 'weekly'];
  const show = (id, on) => {
    $(id).classList.toggle(FADES.has(id) ? 'off' : 'hidden', !on);
    if (CARDS.includes(id)) {
      if (on) CARDS.forEach(c => c !== id && $(c).classList.add('hidden'));
      $('phone').classList.toggle('card-open', CARDS.some(c => !$(c).classList.contains('hidden')));
    }
  };
  const crisis = source => {
    $('selfHarmNote').classList.toggle('hidden', source !== 'weekly_checkin');
    show('crisis', true);
    A.bus.emit('ws', { type: 'crisis', patient_id: A.config.patientId, ...(A.session?.rec?.session_id ? { session_id: A.session.rec.session_id } : {}), source, t_iso: A.Record.isoLocal(new Date()) });
    log('crisis card opened (' + source + ')');
  };
  document.querySelectorAll('[data-open]').forEach(b => b.onclick = () => b.dataset.open === 'crisis' ? crisis('talk_button') : b.dataset.open === 'weekly' ? openWeekly() : show(b.dataset.open, true));
  document.querySelectorAll('[data-close]').forEach(b => b.onclick = () => show(b.dataset.close, false));
  A.bus.on('crisisOffer', () => { show('offer', true); log('talk offer shown (lowest lantern twice)'); });
  $('offerYes').onclick = () => { show('offer', false); crisis('mood'); };
  $('offerNo').onclick = () => { show('offer', false); log('talk offer declined'); };

  const weeklyKey = 'afferent.weekly.' + A.config.patientId;
  const WEEKLY_ITEMS = [['interest', 'Little interest or pleasure in doing things'], ['down', 'Feeling down, depressed or hopeless'], ['self_harm', 'Thoughts that you would be better off dead, or of hurting yourself']];
  const WEEKLY_OPTS = ['Not at all', 'Several days', 'More than half the days', 'Nearly every day'];
  let weeklyAnswers = {};
  const weeklyDue = () => {
    if (!A.config.weeklyCheckin || night()) return false;
    if (q.get('weekly') === '1') return true;
    const w = store.get(weeklyKey);
    return !w || Date.now() - (w.done || 0) > 7 * 864e5 && Date.now() > (w.snooze || 0);
  };
  const weeklyPill = () => show('weeklyBtn', weeklyDue() && !A.session);
  WEEKLY_ITEMS.forEach(([key, text]) => {
    const f = document.createElement('fieldset');
    f.className = 'item';
    f.innerHTML = `<legend>${text}</legend><div class="opts" role="radiogroup">${WEEKLY_OPTS.map((o, i) => `<button type="button" role="radio" aria-checked="false" data-v="${i}">${o}</button>`).join('')}</div>`;
    f.querySelectorAll('button').forEach(b => b.onclick = () => {
      weeklyAnswers[key] = Number(b.dataset.v);
      f.querySelectorAll('button').forEach(x => x.setAttribute('aria-checked', String(x === b)));
      $('weeklyDone').disabled = Object.keys(weeklyAnswers).length < WEEKLY_ITEMS.length;
    });
    $('weeklyItems').append(f);
  });
  const openWeekly = () => {
    weeklyAnswers = {};
    document.querySelectorAll('#weeklyItems button').forEach(b => b.setAttribute('aria-checked', 'false'));
    $('weeklyDone').disabled = true;
    show('weekly', true);
  };
  $('weeklyLater').onclick = () => { store.set(weeklyKey, { ...store.get(weeklyKey), snooze: Date.now() + 864e5 }); show('weekly', false); weeklyPill(); };
  $('weeklyDone').onclick = () => {
    const a = { ...weeklyAnswers };
    store.set(weeklyKey, { done: Date.now() });
    A.bus.emit('ws', { type: 'weekly_checkin', patient_id: A.config.patientId, answers: a, phq2: a.interest + a.down, self_harm: a.self_harm, t_iso: A.Record.isoLocal(new Date()) });
    log(`weekly check-in sent (two items ${a.interest + a.down} of 6, third item ${a.self_harm})`);
    show('weekly', false); weeklyPill();
    if (a.self_harm > 0) crisis('weekly_checkin');
  };

  const saveSettings = () => store.set('afferent.settings', { sensors: A.config.sensors, sharing: A.config.sharing, simulator: A.config.simulator, reducedMotion: A.config.reducedMotion, quietNight: A.config.quietNight, weeklyCheckin: A.config.weeklyCheckin, sound: ui.sound });
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
    $('weeklySw').checked = A.config.weeklyCheckin;
    camGlyph();
  };
  document.querySelectorAll('[data-sensor]').forEach(el => el.onchange = () => {
    const sensor = el.dataset.sensor;
    A.config.sensors[sensor] = el.checked;
    if (sensor === 'phone_camera' && !el.checked) { if (ui.input === 'camera') { ui.input = 'touch'; chips(); } if (S.camera()) S.stop(); }
    syncSensors(); saveSettings(); camGlyph();
    A.bus.emit('ws', { type: 'privacy', patient_id: A.config.patientId, sensor, on: el.checked });
  });
  document.querySelectorAll('#sharingSeg button').forEach(b => b.onclick = () => {
    if (A.config.sharing === b.dataset.v) return;
    A.config.sharing = b.dataset.v; sharingSeg(); saveSettings();
    A.bus.emit('ws', { type: 'privacy', patient_id: A.config.patientId, sharing: A.config.sharing });
  });
  $('simSw').onchange = e => { A.config.simulator = e.target.checked; syncSensors(); saveSettings(); camGlyph(); };
  $('motionSw').onchange = e => { A.config.reducedMotion = e.target.checked; saveSettings(); };
  $('soundSw').onchange = e => setSound(e.target.checked);
  $('quietSw').onchange = e => { A.config.quietNight = e.target.checked; setDawn(A.config.dawnLevel); saveSettings(); };
  $('weeklySw').onchange = e => { A.config.weeklyCheckin = e.target.checked; saveSettings(); weeklyPill(); };

  const applyPrivacy = pv => {
    if (!pv) return;
    if (pv.sensors) Object.assign(A.config.sensors, pv.sensors);
    if (pv.sharing) A.config.sharing = pv.sharing;
    syncSensors(); toggles(); saveSettings();
  };
  morningText(); toggles();

  let timeline = [];

  const MOOD_HEX = ['#34476E', '#5A7CA6', '#A9A79A', '#E8B867', '#FFCB5C'], MOOD_GLOW = [0.35, 0.5, 0.65, 0.82, 1];
  const lanternSvg = '<svg viewBox="0 0 40 60" aria-hidden="true"><path class="lf" d="M16.5 11a3.5 3.5 0 0 1 7 0" fill="none"/><path class="lb" d="M15 13.5h10l5.5 5h-21z"/><rect class="lg" x="11" y="18.5" width="18" height="24" rx="4"/><ellipse class="ll" cx="20" cy="32" rx="2.3" ry="5.2"/><rect class="lb" x="9.8" y="42" width="20.4" height="3.2" rx="1.2"/></svg>';
  MOOD_HEX.forEach((c, i) => {
    const b = document.createElement('button');
    b.className = 'flame mood'; b.dataset.v = i + 1; b.setAttribute('aria-label', String(i + 1));
    b.style.setProperty('--c', c); b.style.setProperty('--g', MOOD_GLOW[i]);
    b.innerHTML = lanternSvg;
    b.onclick = () => A.session?.setMood(i + 1);
    $('moodEnd').append(b);
  });

  $('begin').onclick = async () => {
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
    show('start', false); show('end', false); show('closeBtn', true); show('weeklyBtn', false);
    resetEnd();
    $('json').textContent = '';
    timeline = [];
    A.session = A.startSession({ input: A.Input.mode, clock: ui.clock, stage: ui.stage, profile: ui.profile, visual: idle });
    camGlyph();
    const s = A.session;
    A.bus.emit('ws', { type: 'session_start', session_id: s.rec.session_id, patient_id: A.config.patientId, clock: ui.clock, profile: ui.profile, simulated: s.liveMetrics(A.now()).simulated, sensors: s.rec.sensors, t_iso: s.rec.started_iso });
    log(`session start, ${A.Input.mode}, ${ui.clock}, ${ui.profile}`);
  };

  $('decline').onclick = () => {
    const r = A.declinedRecord(ui.profile);
    $('json').textContent = JSON.stringify(r, null, 2);
    A.bus.emit('ws', { type: 'session_end', session: r });
    A.bus.emit('sessionEnd', r);
    log('not tonight, logged as declined');
    resetEnd(); $('end').classList.add('declined');
    show('start', false); show('end', true);
  };

  let curtain = null, curtainV = 0, leaving = false, endShown = false;
  const fadeCurtain = (to, dur, then) => { curtain = { from: curtainV, to, start: A.now(), dur, then }; };
  const resetEnd = () => {
    endShown = false;
    $('end').classList.remove('declined', 'dim', 'closed');
    show('offer', false);
    document.querySelectorAll('#moodEnd .flame').forEach(f => f.classList.remove('on'));
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
      resetEnd(); camGlyph(); weeklyPill();
      show('start', true);
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

  document.addEventListener('visibilitychange', () => { if (document.hidden && A.session && !A.session.done) { A.session.pauses++; A.Skill?.save(); } });

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
    if (m.which === 'end') document.querySelectorAll('#moodEnd .flame').forEach(f => f.classList.toggle('on', Number(f.dataset.v) === m.value));
  });
  A.bus.on('endScreen', () => { endShown = true; show('end', true); show('closeBtn', false); });
  A.bus.on('endDim', () => $('end').classList.add('dim'));
  A.bus.on('sessionEnd', r => {
    $('json').textContent = JSON.stringify(r, null, 2);
    log(`session ${r.status}, ${((r.duration_ms || 0) / 1000).toFixed(1)} s`);
    show('closeBtn', false); show('simBadge', false); cue('');
    if (S.camera()) S.stop();
    camGlyph();
    if (leaving || r.status === 'declined') return;
    if (r.status === 'fell_asleep') { $('phone').addEventListener('pointerdown', () => show('wakeBtn', true), { once: true }); return; }
    if (endShown) { $('end').classList.add('closed'); return; }
    $('end').classList.add('declined'); show('end', true);
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
  Hub.on('connected', on => { $('hubTag').textContent = on ? 'connected' : 'offline'; $('hubTag').classList.toggle('on', on); $('hubState').textContent = 'Hub: ' + (on ? 'connected' : 'offline') + (Hub.url ? ' (' + Hub.httpBase() + ')' : ''); log(on ? 'hub connected' : 'hub disconnected'); });
  Hub.on('config', c => {
    if (c.baseline_pulse_bpm) A.config.baselinePulse = c.baseline_pulse_bpm;
    if (Number.isFinite(c.dawn_level)) setDawn(c.dawn_level);
    applyPrivacy(c.privacy);
    log(`config: baseline ${c.baseline_pulse_bpm ?? '-'} bpm, weights for ${Object.keys(c.task_weights || {}).length} modes`);
  });
  Hub.on('ack', d => log(`hub stored session${d.duplicate ? ' (duplicate)' : ''}${d.error ? ' error ' + d.error : ''}`));
  Hub.on('pulse', d => S.feedPulse(d));
  Hub.on('knob', d => { if (Number.isFinite(d.level)) setDawn(d.level); if (d.press) log('knob press'); });
  Hub.on('profile', d => setProfile(d.profile, 'hub'));
  Hub.on('privacy', d => applyPrivacy(d.privacy));
  Hub.on('demo_reset', () => log('hub demo reset'));
  if (!Hub.connect({ patientId: A.config.patientId, hello: { profile: ui.profile } })) { log('no hub, offline mode'); $('hubState').textContent = 'Hub: not set. Enter the address shown by ./start.sh.'; }
  else { log('hub ' + Hub.url); $('hubState').textContent = 'Hub: connecting to ' + Hub.httpBase(); }

  const MODE_COL = { ...Object.fromEntries(Object.entries(A.MODES).map(([k, v]) => [k, v.colour])), measure: '#B79CFF' };
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
    $('pulseSrc').textContent = { ky039: 'pulse stone', rppg: 'face (rPPG)', simulated: 'SIMULATED' }[p.source] || 'none';
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
