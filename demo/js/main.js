(() => {
  const q = new URLSearchParams(location.search);
  const $ = id => document.getElementById(id);
  const t0 = performance.now();
  A.now = () => (performance.now() - t0) / 1000;

  A.config = {
    deviceId: 'inst-' + Math.random().toString(16).slice(2, 8),
    showHeartbeat: q.get('heartbeat') !== '0',
    dawnLevel: 15,
    pitchSign: Number(q.get('pitchSign') || 1),
  };

  const ui = {
    profile: q.get('profile') === 'good_day' ? 'good_day' : 'bad_day',
    input: ['auto', 'keys', 'camera'].includes(q.get('input')) ? q.get('input') : 'auto',
    stage: q.get('stage') === '1',
    sound: true,
  };

  const canvas = $('game'), ctx = canvas.getContext('2d');
  let W = 0, H = 0, dpr = 1;
  const resize = () => {
    dpr = Math.min(devicePixelRatio || 1, 2);
    W = canvas.clientWidth; H = canvas.clientHeight;
    canvas.width = W * dpr; canvas.height = H * dpr;
  };
  addEventListener('resize', resize); resize();

  A.Input.init(canvas);
  A.Input.mode = ui.input;

  let idle = A.makeVisual(A.PROFILES[ui.profile], false);
  idle.black = 0;

  const chips = () => {
    $('profileChip').textContent = 'demo profile: ' + (ui.profile === 'good_day' ? 'good day' : 'bad day');
    $('inputChip').textContent = { auto: 'input: autoplay', keys: 'input: keyboard / touch', camera: 'input: camera' }[ui.input];
    $('stageChip').textContent = ui.stage ? 'stage demo (45 s)' : 'full session';
    $('soundBtn').classList.toggle('off', !ui.sound);
    idle = A.makeVisual(A.PROFILES[ui.profile], false); idle.black = 0;
  };
  $('profileChip').onclick = () => { ui.profile = ui.profile === 'good_day' ? 'bad_day' : 'good_day'; chips(); };
  $('inputChip').onclick = () => { ui.input = { auto: 'keys', keys: 'camera', camera: 'auto' }[ui.input]; chips(); };
  $('stageChip').onclick = () => { ui.stage = !ui.stage; chips(); };
  $('soundBtn').onclick = () => { ui.sound = !ui.sound; A.Audio.on = ui.sound; chips(); };
  chips();

  const show = (id, on) => $(id).classList.toggle('hidden', !on);
  document.querySelectorAll('[data-open]').forEach(b => b.onclick = () => show(b.dataset.open, true));
  document.querySelectorAll('[data-close]').forEach(b => b.onclick = () => show(b.dataset.close, false));

  const log = msg => {
    const li = document.createElement('li');
    li.textContent = `${A.now().toFixed(1).padStart(6)}  ${msg}`;
    $('events').prepend(li);
    while ($('events').children.length > 14) $('events').lastChild.remove();
  };

  $('begin').onclick = async () => {
    A.Audio.on = ui.sound;
    A.Audio.start(0.25);
    A.Input.mode = ui.input;
    if (ui.input === 'camera' && !A.Camera.ready) {
      $('begin').disabled = true;
      log('loading camera model');
      try { await A.Camera.start(); log('camera on, frames stay in this tab'); }
      catch (e) { log('camera unavailable, using keyboard / touch'); A.Input.mode = 'keys'; ui.input = 'keys'; chips(); }
      $('begin').disabled = false;
    }
    show('start', false); show('end', false);
    $('json').textContent = '';
    A.session = A.startSession(ui.profile, { stage: ui.stage, mode: A.Input.mode });
    A.bus.emit('ws', { type: 'hello', device_id: A.config.deviceId, app_version: 'demo-0.1.0' });
    A.bus.emit('ws', { type: 'session_start', session_id: A.session.rec.session_id, profile: ui.profile, sensors: A.session.rec.sensors });
    log(`session start, ${ui.profile}, ${A.Input.mode}${ui.stage ? ', stage' : ''}`);
  };

  $('decline').onclick = () => {
    const r = A.declinedRecord();
    $('json').textContent = JSON.stringify(r, null, 2);
    A.bus.emit('ws', { type: 'session_end', ...r });
    log('not tonight, logged as declined');
    show('start', false); show('end', true);
    $('endText').textContent = 'Rest well.';
    $('endText').style.color = 'var(--ink)';
  };

  $('again').onclick = () => { A.session = null; show('end', false); show('start', true); };

  $('download').onclick = () => {
    const text = $('json').textContent;
    if (!text) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    a.download = `afferent-session-${Date.now()}.json`;
    a.click();
  };

  ['blink', 'longBlink', 'blinkOnset', 'tap', 'step', 'confirm', 'skip', 'exit', 'pulseBoost'].forEach(type =>
    A.bus.on(type, d => {
      A.session?.handle(type, d);
      if (type === 'longBlink') log('long blink');
      if (type === 'tap') log('tap ' + d.zone);
      if (type === 'skip') log('skip station');
      if (type === 'pulseBoost') log('pulse raised (simulated)');
    }));

  A.bus.on('segment', id => log('segment ' + id));
  A.bus.on('haptic', () => { $('haptic').classList.remove('pulse'); void $('haptic').offsetWidth; $('haptic').classList.add('pulse'); });
  A.bus.on('endScreen', () => { $('endText').textContent = 'Rest well.'; $('endText').style.color = ''; show('end', true); });
  A.bus.on('sessionEnd', r => {
    $('json').textContent = JSON.stringify(r, null, 2);
    log(`session ${r.status}, ${(r.duration_ms / 1000).toFixed(1)} s`);
    if (r.status !== 'completed') { $('endText').textContent = r.status === 'fell_asleep' ? '' : 'Rest well.'; show('end', true); }
    if (A.Camera.ready) A.Camera.stop();
  });

  const led = $('led');
  let ledTimer = null;
  A.bus.on('light', ({ rgb, level, fade_ms }) => {
    clearTimeout(ledTimer);
    setLed(rgb, level, fade_ms);
    if (rgb === '#FFC98A' || rgb === '#FFF3DC') ledTimer = setTimeout(() => setLed(rgb, 0, 10000), fade_ms + 30000);
  });
  function setLed(rgb, level, fade) {
    led.style.transition = `background-color ${fade}ms linear, box-shadow ${fade}ms linear, opacity ${fade}ms linear`;
    led.style.backgroundColor = rgb;
    led.style.opacity = 0.15 + 0.85 * level / 100;
    led.style.boxShadow = `0 0 ${10 + level * 1.2}px ${level * 0.4}px ${rgb}`;
    $('ledLevel').textContent = `${level}%`;
  }
  setLed('#FFD9A0', 5, 0);
  $('knob').oninput = e => { A.config.dawnLevel = Number(e.target.value); $('knobVal').textContent = e.target.value + '%'; };

  let ws = null;
  if (q.get('ws')) {
    const connect = () => {
      ws = new WebSocket(q.get('ws'));
      ws.onopen = () => log('bedside socket connected');
      ws.onclose = () => setTimeout(connect, 2000);
      ws.onmessage = m => {
        const d = JSON.parse(m.data);
        if (d.type === 'pulse') { A.Vitals.live = true; A.Vitals.liveBpm = d.bpm; A.Vitals.quality = d.quality; A.Vitals.contact = d.contact; }
        if (d.type === 'knob' && d.level !== undefined) { A.config.dawnLevel = d.level; $('knob').value = d.level; }
      };
    };
    connect();
  }
  A.bus.on('ws', msg => { if (ws?.readyState === 1) ws.send(JSON.stringify(msg)); });

  let last = A.now(), frame = 0;
  const loop = () => {
    const now = A.now(), dt = Math.min(0.05, now - last); last = now;
    A.Input.update(now, dt);
    const s = A.session;
    if (s) s.update(now, dt);
    const V = s ? s.V : idle;
    if (!s) { V.t = now; V.worldX = -60; }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    A.World.draw(ctx, W, H, V);
    if (++frame % 6 === 0) panel(s, now);
    requestAnimationFrame(loop);
  };

  function panel(s, now) {
    const F = A.Face, Vt = A.Vitals;
    $('pulseVal').textContent = s ? Vt.value(now).toFixed(0) : '--';
    $('pulseSrc').textContent = Vt.live ? 'bedside stone' : 'simulated';
    const lines = [
      `segment     ${s?.seg?.id ?? 'start screen'}${s ? '  ' + (now - s.t0).toFixed(1) + ' s' : ''}`,
      `eyes n      L ${F.n[0].toFixed(2)}  R ${F.n[1].toFixed(2)}  ${F.closed ? 'closed' : 'open'}`,
      `eyes wide   ${F.w.toFixed(2)}`,
      `head        pitch ${F.pitchRel.toFixed(1)}  yaw ${F.yaw.toFixed(1)}`,
      `tracked     ${F.tracked ? 'yes' : 'no'}${F.rangeLow && F.calibrated ? '  (raw defaults)' : ''}`,
      `vitals      ${s?.held > 0 ? 'held ' + s.held.toFixed(2) : 'calm'}  sparkle ${(s?.V.sparkle ?? 0).toFixed(2)}`,
    ];
    if (s?.ck) lines.push(`mood        ${s.ck.mood ?? 'none'}`);
    if (s?.lake) lines.push(`lake        ${s.lake.trials.map(x => x.rt_ms === null ? x.outcome : x.rt_ms + 'ms').join(' ')}`);
    $('signals').textContent = lines.join('\n');
  }

  loop();
})();
