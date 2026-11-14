(() => {
  const q = new URLSearchParams(location.search);
  const $ = id => document.getElementById(id);
  const t0 = performance.now();
  A.now = () => (performance.now() - t0) / 1000;

  A.config = { deviceId: 'inst-' + Math.random().toString(16).slice(2, 8), dawnLevel: 15, baselinePulse: 68 };

  const ui = {
    input: ['auto', 'touch', 'camera'].includes(q.get('input')) ? q.get('input') : 'auto',
    clock: q.get('clock') === 'night' ? 'night' : 'morning',
    sound: true,
  };

  const canvas = $('game'), ctx = canvas.getContext('2d');
  let W = 0, H = 0, dpr = 1;
  const resize = () => { dpr = Math.min(devicePixelRatio || 1, 2); W = canvas.clientWidth; H = canvas.clientHeight; canvas.width = W * dpr; canvas.height = H * dpr; };
  addEventListener('resize', resize); resize();

  A.Input.init(canvas);
  const idle = A.makeVisual(); idle.black = 0;

  const chips = () => {
    $('inputChip').textContent = { auto: 'input: autoplay story', touch: 'input: touch', camera: 'input: touch + camera' }[ui.input];
    $('clockChip').textContent = ui.clock === 'night' ? 'clock: night' : 'clock: morning';
    $('soundBtn').classList.toggle('off', !ui.sound);
  };
  $('inputChip').onclick = () => { ui.input = { auto: 'touch', touch: 'camera', camera: 'auto' }[ui.input]; chips(); };
  $('clockChip').onclick = () => { ui.clock = ui.clock === 'night' ? 'morning' : 'night'; chips(); };
  $('soundBtn').onclick = () => { ui.sound = !ui.sound; A.Audio.on = ui.sound; chips(); };
  chips();

  const show = (id, on) => $(id).classList.toggle('hidden', !on);
  document.querySelectorAll('[data-open]').forEach(b => b.onclick = () => show(b.dataset.open, true));
  document.querySelectorAll('[data-close]').forEach(b => b.onclick = () => show(b.dataset.close, false));

  const log = msg => {
    const li = document.createElement('li');
    li.textContent = `${A.now().toFixed(1).padStart(6)}  ${msg}`;
    $('events').prepend(li);
    while ($('events').children.length > 16) $('events').lastChild.remove();
  };

  let timeline = [];

  $('begin').onclick = async () => {
    A.Audio.on = ui.sound;
    A.Audio.start(0.25);
    A.Input.mode = ui.input;
    if (ui.input === 'camera' && !A.Camera.ready) {
      $('begin').disabled = true;
      log('loading camera model');
      try { await A.Camera.start(); log('camera on, only eye closure is read'); }
      catch (e) { log('camera unavailable, eyes are simulated'); A.Input.mode = 'touch'; ui.input = 'touch'; chips(); }
      $('begin').disabled = false;
    }
    show('start', false); show('end', false); show('closeBtn', true);
    $('json').textContent = '';
    timeline = [];
    A.session = A.startSession({ input: A.Input.mode, clock: ui.clock });
    A.bus.emit('ws', { type: 'hello', device_id: A.config.deviceId, app_version: 'demo-0.2.0' });
    A.bus.emit('ws', { type: 'session_start', session_id: A.session.rec.session_id, clock: ui.clock });
    log(`session start, ${A.Input.mode}, ${ui.clock}`);
  };

  $('decline').onclick = () => {
    const r = A.declinedRecord();
    $('json').textContent = JSON.stringify(r, null, 2);
    A.bus.emit('ws', { type: 'session_end', ...r });
    log('not tonight, logged as declined');
    show('start', false); show('end', true);
    $('endText').style.color = 'var(--ink)';
  };
  $('again').onclick = () => { A.session = null; show('end', false); show('start', true); };
  $('closeBtn').onclick = () => A.bus.emit('exit');

  $('download').onclick = () => {
    const text = $('json').textContent;
    if (!text) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    a.download = `afferent-session-${Date.now()}.json`;
    a.click();
  };

  ['pdown', 'pmove', 'pup', 'key', 'exit'].forEach(type => A.bus.on(type, d => A.session?.handle(type, d)));
  A.bus.on('segment', id => { if (id !== 'walk') log('phase ' + id); });
  A.bus.on('mode', m => log('mode ' + m));
  A.bus.on('game', g => log(`minigame ${g.id} (${g.mode}, intensity ${g.k.toFixed(2)})`));
  A.bus.on('haptic', () => { $('haptic').classList.remove('pulse'); void $('haptic').offsetWidth; $('haptic').classList.add('pulse'); });
  A.bus.on('endScreen', () => { $('endText').style.color = ''; show('end', true); show('closeBtn', false); });
  A.bus.on('sessionEnd', r => {
    $('json').textContent = JSON.stringify(r, null, 2);
    log(`session ${r.status}, ${(r.duration_ms / 1000).toFixed(1)} s`);
    show('closeBtn', false);
    if (r.status !== 'completed') { $('endText').style.color = 'var(--ink)'; show('end', true); }
    if (A.Camera.ready) A.Camera.stop();
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
  $('knob').oninput = e => { A.config.dawnLevel = Number(e.target.value); $('knobVal').textContent = e.target.value + '%'; };

  const sliders = { pulseSlider: 'offset', drowsySlider: 'drowsy' };
  for (const [id, key] of Object.entries(sliders)) {
    const el = $(id);
    el.addEventListener('pointerdown', () => el.dataset.active = '1');
    el.addEventListener('pointerup', () => delete el.dataset.active);
    el.oninput = () => { A.Sim[key] = Number(el.value); };
  }
  const presets = { stressBtn: { offset: 22 }, flatBtn: { offset: -9 }, tiredBtn: { drowsy: 0.85 }, normalBtn: { offset: 0, drowsy: 0 } };
  for (const [id, p] of Object.entries(presets)) $(id).onclick = () => { Object.assign(A.Sim, p); log('simulate ' + id.replace('Btn', '')); };

  let ws = null;
  if (q.get('ws')) {
    const connect = () => {
      ws = new WebSocket(q.get('ws'));
      ws.onopen = () => log('bedside socket connected');
      ws.onclose = () => setTimeout(connect, 2000);
      ws.onmessage = m => {
        const d = JSON.parse(m.data);
        if (d.type === 'pulse') { A.Sim.live = true; A.Sim.liveBpm = d.bpm; }
        if (d.type === 'knob' && d.level !== undefined) { A.config.dawnLevel = d.level; $('knob').value = d.level; }
      };
    };
    connect();
  }
  A.bus.on('ws', msg => { if (ws?.readyState === 1) ws.send(JSON.stringify(msg)); });

  const MODE_COL = Object.fromEntries(Object.entries(A.MODES).map(([k, v]) => [k, v.colour]));
  const tl = $('timeline'), tctx = tl.getContext('2d');

  function drawTimeline() {
    const w = tl.width = tl.clientWidth * dpr, h = tl.height = tl.clientHeight * dpr;
    tctx.clearRect(0, 0, w, h);
    const span = 130, x = t => t / span * w, mid = h * 0.45, y = d => mid - d / 30 * h * 0.4;
    tctx.strokeStyle = 'rgba(255,255,255,0.08)'; tctx.beginPath(); tctx.moveTo(0, mid); tctx.lineTo(w, mid); tctx.stroke();
    for (let i = 1; i < timeline.length; i++) {
      const a = timeline[i - 1], b = timeline[i];
      if (b.mode) { tctx.fillStyle = MODE_COL[b.mode]; tctx.globalAlpha = 0.55; tctx.fillRect(x(a.t), h - 8 * dpr, x(b.t) - x(a.t) + 1, 8 * dpr); tctx.globalAlpha = 1; }
    }
    const line = (key, color, f) => {
      tctx.strokeStyle = color; tctx.lineWidth = 1.5 * dpr; tctx.beginPath();
      timeline.forEach((p, i) => { const yy = f(p[key]); i ? tctx.lineTo(x(p.t), yy) : tctx.moveTo(x(p.t), yy); });
      tctx.stroke();
    };
    line('d', '#F2B544', y);
    tctx.setLineDash([3 * dpr, 3 * dpr]); line('f', '#9fb7ff', f => h - 10 * dpr - f * h * 0.35); tctx.setLineDash([]);
  }

  function panel(s, now) {
    const Sim = A.Sim, p = Sim.pulse(now);
    $('pulseVal').textContent = s ? p.toFixed(0) : '--';
    $('pulseSrc').textContent = Sim.live ? 'bedside stone' : 'simulated';
    for (const [id, key] of Object.entries(sliders)) { const el = $(id); if (!el.dataset.active) el.value = Sim[key]; }
    $('pulseSliderVal').textContent = (Sim.offset >= 0 ? '+' : '') + Sim.offset.toFixed(0) + ' bpm';
    $('drowsySliderVal').textContent = Sim.drowsy.toFixed(2);
    const mode = s?.mode && s.phase !== 'core' && s.phase !== 'fadein' ? s.mode : null;
    $('modePill').textContent = mode || (s ? s.phase : 'idle');
    $('modePill').style.borderColor = mode ? MODE_COL[mode] : '';
    $('modePill').style.color = mode ? MODE_COL[mode] : '';
    $('arousalBar').style.width = `${A.clamp(50 + (s?.a ?? 0) * 25, 0, 100)}%`;
    $('fatigueBar').style.width = `${(s?.fat ?? 0) * 100}%`;
    $('gameVal').textContent = s?.game ? `${s.game.id}  k=${s.game.k.toFixed(2)}  items ${s.game.items}  errors ${s.game.errors}` : '-';
    $('eyesVal').textContent = `${A.Eyes.closed ? 'closed' : 'open'}  perclos ${A.Eyes.perclos().toFixed(2)}  long ${A.Eyes.longClosures()}`;
    if (s && !s.done) timeline.push({ t: now - s.t0, d: p - A.config.baselinePulse, f: s.fat, mode: mode });
    drawTimeline();
  }

  let last = A.now(), frame = 0;
  const loop = () => {
    const now = A.now(), dt = Math.min(0.05, now - last); last = now;
    A.Input.update(now, dt);
    const s = A.session;
    if (s) s.update(now, dt);
    const V = s ? s.V : idle;
    if (!s) V.t = now;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    A.World.draw(ctx, W, H, V);
    s?.drawOverlay(ctx, now);
    if (++frame % 8 === 0) panel(s, now);
    requestAnimationFrame(loop);
  };
  loop();
})();
