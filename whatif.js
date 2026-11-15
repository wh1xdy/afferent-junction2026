// "What would it do?": the game's own decision code, run on readings set with sliders.
// Loads the app's scripts (the same files the phone runs: demo/js, published as play/js) the way the node tests do
// (demo/tests/harness.js): util and the sensors, then engine.js, then livevitals.js for its words. A staged session
// is started once and, for every slider change, given the numbers the director would have settled on:
//   - pulse: the arousal a steady pulse settles at ((pulse - rest) / 10, engine.js director), rest = the app's 68 bpm
//     until a rest pulse is measured;
//   - HRV and breathing as one finger-clip reading, and five equal own values before it (BASE_N);
//   - the face: the smiling share and movement of the last 20 s against twenty own seconds (FACE_N);
//   - eyes: PERCLOS through the app's own fatigueInput().
// Then session.assess() reads the state, prefer() which games come first, modeLight() the bedside light, and
// LiveVitals.model() the label and the reasons line, exactly as the phone shows them. No threshold lives here.
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const BASE = 'play/js/';
  const TASKS = ['birds', 'beacon', 'bells', 'breath', 'faces', 'ferry', 'buoys', 'drips', 'fog', 'glance', 'fireflies', 'owls',
    'loyly', 'seals', 'reindeer', 'runes', 'signpost', 'steps', 'stars', 'windows', 'shutters', 'swans', 'vihta', 'threads'];
  const BEFORE = ['util.js', 'haptics.js'];
  const AFTER = ['sensors.js', 'hrv.js', 'finger.js', 'campulse.js', 'face.js', 'input.js', 'watch.js', 'health.js', 'music.js',
    'juice.js', 'skill.js', 'breathing.js', 'heartbeat.js', 'minigames.js', 'tasks/kit.js', ...TASKS.map(t => `tasks/${t}.js`),
    'record.js', 'traverse.js', 'engine.js', 'livevitals.js'];
  const NAMES = { breath: 'Breathing', loyly: 'Löyly', vihta: 'Vihta', fog: 'Faces in the fog', faces: 'Frosted windows', stars: 'Stars' };
  const name = id => NAMES[id] || id[0].toUpperCase() + id.slice(1);
  const OWN = { rmssd: 45, breathing: 12, smile: 0.15, movement: 0.1 };   // this player's own values for the sliders
  const VOICE = { calm: 'calm', bright: 'bright', lift: 'lifting', drone: 'drone' };

  let A = null, s = null, failed = false, touched = false, liveSnap = null;

  const load = src => new Promise((ok, no) => {
    const el = document.createElement('script');
    el.src = BASE + src; el.async = false;
    el.onload = ok; el.onerror = () => no(new Error(src));
    document.head.appendChild(el);
  });

  const boot = async () => {
    const errors = [];
    const onErr = e => { if (String(e.filename || '').includes(BASE)) errors.push(e.message); };
    window.addEventListener('error', onErr);
    try {
      for (const f of BEFORE) await load(f);
      A = window.A;
      const t0 = performance.now(), noop = () => {};
      A.now = () => (performance.now() - t0) / 1000;
      A.config = { baselinePulse: 68, sensors: { bedside_light: false, pulse_stone: true, phone_camera: true }, patientId: 'whatif',
        deviceId: 'whatif', appVersion: 'live', sharing: 'summary', dawnLevel: 15, liveVitals: true, quietNight: true, reducedMotion: true };
      A.Audio = new Proxy({}, { get: (_, k) => (k === 'on' ? false : noop) });
      for (const f of AFTER) await load(f);
      if (errors.length) throw new Error(errors[0]);
      s = A.startSession({ clock: 'morning', input: 'touch', stage: true, profile: 'live' });
      s.phase = 'walk';
    } finally {
      window.removeEventListener('error', onErr);
    }
  };

  // ── the readings from the sliders ───────────────────────────────────────
  const val = id => Number($(id).value);
  const readings = () => ({
    pulse: val('wiPulse'), hrv: val('wiHrv'), breath: val('wiBreath'), smile: val('wiSmile'),
    move: val('wiMove'), eyes: val('wiEyes'), night: $('wiNight').checked, noPulse: $('wiNoPulse').checked, noFace: $('wiNoFace').checked,
  });
  const signed = (x, unit, d = 0) => `${x > 0 ? '+' : x < 0 ? '−' : '±'}${Math.abs(x).toFixed(d)} ${unit}`;
  const labels = v => {
    const rest = A?.config?.baselinePulse ?? 68;
    $('wiPulseV').value = v.noPulse ? 'no reading' : `${signed(v.pulse, 'bpm')} (${rest + v.pulse})`;
    $('wiHrvV').value = `${v.hrv} %`;
    $('wiBreathV').value = signed(v.breath, '/min', v.breath % 1 ? 1 : 0);
    $('wiSmileV').value = v.noFace ? 'camera off' : signed(v.smile, 'points');
    $('wiMoveV').value = v.noFace ? 'camera off' : `${v.move} %`;
    $('wiEyesV').value = `${v.eyes} %`;
  };

  const decide = v => {
    const S = A.Sensors, rest = A.config.baselinePulse, own = OWN;
    s.night = v.night; s.rest = rest; s.state = null; s.mode = 'flow'; s.transitions = []; s.phase = 'walk';
    const pulse = v.noPulse ? null : rest + v.pulse;
    s.pulseNow = pulse;
    s.a = pulse == null ? 0 : (pulse - rest) / 10;
    A.Eyes.perclos = () => v.eyes / 100;
    A.Eyes.longClosures = () => 0;
    s.fat = s.fatigueInput();
    s.phys = { rmssd: own.rmssd * v.hrv / 100, breathing: own.breathing + v.breath, source: 'finger_ppg' };
    s.base = { rmssd: Array(5).fill(own.rmssd), breathing: Array(5).fill(own.breathing) };
    const ones = Math.round(own.smile * 20);
    s.faceBase = { smile: Array.from({ length: 20 }, (_, i) => (i < ones ? 1 : 0)), movement: Array(20).fill(own.movement) };
    const smileNow = Math.max(0, Math.min(1, own.smile + v.smile / 100)), moveNow = own.movement * v.move / 100;
    S.faceOn = () => !v.noFace;
    S.faceNow = () => ({ smile: smileNow, movement: moveNow });

    const r = s.assess();
    s.state = r.state; s.mode = r.mode;
    s.transitions = [{ t_ms: 0, from: null, to: r.mode, state: r.state, basis: r.basis, reasons: [...r.reasons], signals: r.signals }];
    const shown = A.LiveVitals.model(s, A.now());
    const prefer = s.prefer(r.mode);
    const pool = Object.keys(A.MINIGAMES).filter(id => A.MINIGAMES[id].modes.includes(r.mode));
    const liked = prefer?.length ? pool.filter(id => prefer.includes(id)) : [];
    const [rgb, level] = s.modeLight(r.mode);
    const drift = r.mode === 'rest' && s.planNext(A.now())?.kind === 'drift';
    const aim = pulse == null ? null : A.Music.bioAim(r.mode, s.night, pulse, rest);
    return { r, shown, pool, liked, prefer, rgb, level, pulse, aim, drift, voice: A.Music.bioVoice(r.mode, s.night), mode: A.MODES[r.mode] };
  };

  const show = () => {
    const v = readings();
    labels(v);
    if (!s) return;
    let d;
    try { d = decide(v); } catch (e) { fail(e); return; }
    const { r, shown } = d;
    $('wiState').textContent = shown?.state?.label || r.state;
    $('wiMode').textContent = `${r.mode} mode${d.mode?.biome ? ` · ${d.mode.biome}` : ''}`;
    $('wiDot').style.setProperty('background', d.mode?.colour || '');
    $('wiWhy').textContent = shown?.why || '–';
    const games = d.liked.length ? d.liked : d.pool;
    const first = d.liked.length ? (d.prefer === A.PUZZLES ? 'Puzzles first: ' : 'First: ') : '';
    $('wiGames').textContent = d.drift ? 'none: it drifts toward sleep' : games.length ? first + games.map(name).join(', ') : '–';
    $('wiSwatch').style.setProperty('background', d.rgb);
    $('wiLight').textContent = d.level === 0 || d.rgb === '#000000' ? 'off' : `${d.rgb} at ${d.level} %`;
    $('wiMusic').textContent = d.aim == null ? `no pulse to follow; the ${r.mode} music plays`
      : `following the heart ${d.pulse} → ${Math.round(d.aim)} bpm, ${VOICE[d.voice] || d.voice} voice`;
  };

  const fail = e => {
    failed = true;
    $('wiLoading').hidden = false;
    $('wiResult').hidden = true;
    $('wiLoading').textContent = 'The game’s decision code could not be loaded here. It runs on the published page.';
    console.warn('whatif', e);
  };

  // ── live readings into the sliders ──────────────────────────────────────
  const fromLive = snap => {
    const p = snap?.pulse;
    if (!p || p.bpm == null) return false;
    const rest = A?.config?.baselinePulse ?? 68, clamp = (x, a, b) => Math.max(a, Math.min(b, x));
    $('wiPulse').value = String(clamp(Math.round(p.bpm - rest), -20, 40));
    $('wiNoPulse').checked = false;
    if (p.hrv_ms != null && p.hrv_own_ms) $('wiHrv').value = String(clamp(Math.round(100 * p.hrv_ms / p.hrv_own_ms), 40, 140));
    return true;
  };
  window.addEventListener('afferent:snapshot', e => {
    liveSnap = e.detail;
    const has = liveSnap?.pulse?.bpm != null;
    $('wiLive').disabled = !has;
    $('wiTag').textContent = has ? `live pulse ${liveSnap.pulse.bpm} bpm` : 'the app’s own code';
    if (has && !touched && fromLive(liveSnap)) show();
  });
  $('wiLive').addEventListener('click', () => { if (fromLive(liveSnap)) { touched = true; show(); } });
  $('wiReset').addEventListener('click', () => {
    $('wiForm').reset();
    touched = true;
    show();
  });
  $('wiForm').addEventListener('input', () => { touched = true; show(); });
  $('wiForm').addEventListener('change', show);
  $('wiForm').addEventListener('submit', e => e.preventDefault());

  // Loaded when the section comes near (about 1.5 MB of the game's code); the sliders work from the start.
  let started = false;
  const go = () => {
    if (started) return;
    started = true;
    boot().then(() => {
      if (failed) return;
      $('wiLoading').hidden = true;
      $('wiResult').hidden = false;
      if (liveSnap && !touched) fromLive(liveSnap);
      show();
    }, fail);
  };
  labels(readings());
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(es => { if (es.some(x => x.isIntersecting)) { io.disconnect(); go(); } }, { rootMargin: '600px 0px' });
    io.observe($('whatif'));
  } else go();
  $('wiForm').addEventListener('focusin', go, { once: true });
})();
