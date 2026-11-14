(() => {
  const $ = id => document.getElementById(id);
  const q = new URLSearchParams(location.search);
  const G = A.Glyph;
  const frag = html => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content; };
  const sw = attrs => `<span class="switch"><input type="checkbox" role="switch" ${attrs}><span class="track"></span><span class="thumb"><span class="ms">check</span></span></span>`;

  const lead = r => r.glyph ? `<span class="lead-glyph" aria-hidden="true">${r.glyph}</span>` : r.icon ? `<span class="ms" aria-hidden="true">${r.icon}</span>` : '';
  const text = r => `<span class="txt"><span class="hl">${r.label}</span>${r.sup != null ? `<span class="sup"${r.supId ? ` id="${r.supId}"` : ''}>${r.sup}</span>` : ''}${r.liveId ? `<span class="sup" id="${r.liveId}"></span>` : ''}</span>`;
  const row = r => {
    if (r.html) return r.html;
    const two = r.sup != null ? ' two' : '';
    if (r.sw) return `<label class="li state${two}">${lead(r)}${text(r)}${sw(r.sw)}</label>`;
    if (r.href) return `<a class="li state${two}" href="${r.href}"${r.id ? ` id="${r.id}"` : ''}>${lead(r)}${text(r)}<span class="ms trail" aria-hidden="true">chevron_right</span></a>`;
    if (r.static) return `<div class="li static${two}">${lead(r)}${text(r)}${r.val != null ? `<span class="val"${r.valId ? ` id="${r.valId}"` : ''}>${r.val}</span>` : ''}</div>`;
    return `<button type="button" class="li state${two}" ${r.attrs || ''}>${lead(r)}${text(r)}${r.val != null ? `<span class="val">${r.val}</span>` : ''}${r.chevron ? '<span class="ms trail" aria-hidden="true">chevron_right</span>' : ''}</button>`;
  };
  const group = g => `<section class="set-group"${g.id ? ` id="${g.id}"` : ''}>
    <h3 class="subhead t-label">${g.title}${g.hint ? `<button type="button" class="icon-btn state" aria-label="${g.hint}" title="${g.hint}" data-hint><span class="ms">info</span></button>` : ''}</h3>
    <div class="group">${g.rows.map(row).join('')}</div>
  </section>`;

  const dev = q.has('dev');
  const GROUPS = [
    { title: 'Sensors', hint: 'From the sensors, only numbers leave the phone, never camera images.', rows: [
      { icon: 'videocam', label: 'Phone camera', sw: 'data-sensor="phone_camera"' },
      { icon: 'ecg_heart', label: 'Pulse stone', sup: 'Two finger clips', liveId: 'fingerState', sw: 'data-sensor="pulse_stone"' },
      { icon: 'air', label: 'Breathing pace', sup: 'Shown in the breathing task', sw: 'id="breathSw"' },
      { icon: 'lightbulb', label: 'Bedside light', sup: 'One small LED on the bedside unit, set through the home hub', sw: 'data-sensor="bedside_light"' },
      { icon: 'accessibility_new', label: 'Bedside camera', sw: 'data-sensor="bedside_camera"' },
      { icon: 'mobile_vibrate', label: 'Phone movement', sw: 'data-sensor="phone_motion"' },
    ] },
    { title: 'Before a session', rows: [
      { icon: 'back_hand', label: 'Check the finger clips', sup: 'Not checked yet', supId: 'clipState', attrs: 'id="clipCheckRow"', chevron: true },
      { icon: 'checklist', label: 'Ask before each session', sup: 'Only when the clips give no pulse yet', sw: 'id="clipAskSw"' },
    ] },
    { title: 'While you play', rows: [
      { icon: 'monitor_heart', label: 'Live vitals', sup: 'Pulse, HRV and breathing in a corner, and why the games change', sw: 'id="vitalsSw"' },
    ] },
    { title: 'Together', rows: [
      { icon: 'favorite', label: 'Heart Duel', sup: 'Two people, one clip each. A game outside your sessions, nothing is saved', attrs: 'data-duel', chevron: true },
    ] },
    { title: 'Export to your clinic', hint: 'Only when you show the code. Nobody watches live.', rows: [
      { html: `<div class="seg-row"><div class="seg" id="sharingSeg" role="radiogroup" aria-label="Export to your clinic">
        <button type="button" role="radio" data-v="summary">Summary</button></div></div>` },
      { icon: 'ios_share', label: 'Show to my doctor', href: 'patient.html#settings', id: 'qrBtn' },
      { icon: 'dashboard', label: 'Clinic dashboard', sup: 'Wi-Fi + link', href: 'patient.html#share', id: 'exportBtn' },
      { icon: 'router', label: 'Home hub', sup: 'Offline', supId: 'hubState', attrs: 'data-open="hubDialog"', chevron: true },
      { icon: 'description', label: 'What is in an export', sup: 'Lanterns, play times, sensor numbers', static: true },
    ] },
    { title: 'Check-in', hint: 'Nine short questions every 14 days, in the daytime. Your clinic will see your answers.', rows: [
      { icon: 'checklist', label: 'Check-in', sup: 'Every 14 days', sw: 'id="checkinSw"' },
    ] },
    { id: 'morningsGroup', title: 'Mornings', rows: [] },
    { title: 'Sound and light', rows: [
      { icon: 'volume_up', label: 'Sound', sw: 'id="soundSw"' },
      { icon: 'nightlight', label: 'Dim light', sup: 'At night: dimmer colours, bedside LED at most 25%', sw: 'id="quietSw"' },
      { icon: 'motion_photos_off', label: 'Reduced motion', sw: 'id="motionSw"' },
    ] },
    { title: 'Help', rows: [
      { icon: 'info', label: 'How it works', attrs: 'data-open="info"' },
      { icon: 'ecg_heart', label: 'Your signals', attrs: 'data-open="signals"' },
      { glyph: G.lantern(null), label: 'The lanterns', attrs: 'data-anchor' },
      { glyph: G.laminate(), label: 'Your mornings', href: 'patient.html', id: 'weekBtn' },
    ] },
  ];
  const DEV = { id: 'devGroup', title: 'Developer', rows: [
    { icon: 'code', label: 'Simulated sensors', sw: 'id="simSw"' },
    { icon: 'vital_signs', label: 'Signals during play', sw: 'id="sigSw"' },
    { icon: 'touch_app', label: 'Input', val: '', attrs: 'data-dev="input"' },
    { icon: 'schedule', label: 'Clock', val: '', attrs: 'data-dev="clock"' },
    { icon: 'routine', label: 'Session', val: '', attrs: 'data-dev="stage"' },
    { icon: 'insights', label: 'Day profile', val: '', attrs: 'data-dev="profile"' },
  ] };

  const buildSettings = () => {
    const body = $('settingsBody');
    if (!body) return;
    const html = GROUPS.map(group);
    const devHtml = group(DEV).replace('class="set-group"', `class="set-group dev${dev ? ' open' : ''}"`)
      .replace(/<h3 class="subhead t-label">Developer/, `<h3 class="subhead t-label"><button type="button" class="dev-toggle state" aria-expanded="${dev}"><span>Developer</span><span class="ms" aria-hidden="true">expand_more</span></button>`);
    body.append(frag(html.join('') + devHtml + '<p class="t-body-s muted research">Research prototype. Not a CE-marked medical device. Not for clinical use.</p>'));
    body.querySelector('.dev-toggle').onclick = e => {
      const box = e.currentTarget.closest('.set-group');
      box.classList.toggle('open');
      e.currentTarget.setAttribute('aria-expanded', String(box.classList.contains('open')));
    };
    body.querySelectorAll('[data-anchor]').forEach(b => b.onclick = () => A.Checkin?.anchor?.());
    body.querySelectorAll('[data-hint]').forEach(b => b.onclick = () => toast(b.getAttribute('aria-label')));
  };

  let toastEl = null, toastT = 0;
  const toast = msg => {
    if (!toastEl) { toastEl = document.createElement('div'); toastEl.className = 'snackbar t-body-m'; toastEl.setAttribute('role', 'status'); $('phone').append(toastEl); }
    toastEl.textContent = msg; toastEl.classList.add('on');
    clearTimeout(toastT); toastT = setTimeout(() => toastEl.classList.remove('on'), 4000);
  };

  const HOLD_MS = 900;
  const buildGap = p => 170 - 125 * p;
  const smoothHap = () => (window.Capacitor?.isNativePlatform?.() ? window.Capacitor.Plugins?.AfferentHaptics : null) || null;
  const kindle = () => {
    const btn = $('begin');
    if (!btn) return;
    btn.innerHTML = `<span class="kindle-halo" aria-hidden="true"></span>${G.ring(46)}<span class="kindle-core" aria-hidden="true">${G.flame()}</span>`;
    const fill = btn.querySelector('.fill'), tip = btn.querySelector('.tip'), C = 2 * Math.PI * 46;
    let p = 0, t0 = 0, raf = 0, holding = false, lit = false, buzzAt = 0, swell = false;
    const set = v => { p = v; fill.style.strokeDashoffset = (C * (1 - v)).toFixed(2); tip.style.opacity = v > 0 && v < 1 ? 1 : 0; tip.setAttribute('transform', `rotate(${(v * 360).toFixed(1)} 50 50)`); btn.style.setProperty('--p', v.toFixed(3)); };
    const buzz = n => (A.J ? A.J.hap(n) : navigator.vibrate?.(n === 'success' ? [12, 60, 22] : n === 'light' ? 6 : 3));
    const fire = () => { lit = true; btn.classList.add('lit'); const H = smoothHap(); if (H) H.success().catch(() => buzz('success')); else buzz('success'); btn.dispatchEvent(new CustomEvent('kindle')); };
    const tick = () => {
      if (!holding) return;
      set(Math.min(1, (performance.now() - t0) / HOLD_MS));
      if (p >= 1) { holding = false; fire(); return; }
      const now = performance.now();
      if (smoothHap()) { raf = requestAnimationFrame(tick); return; }
      if (p >= 0.75) { if (!swell) { swell = true; buzz('light'); } }
      else if (now >= buzzAt) { buzz('tick'); buzzAt = now + Math.max(70, buildGap(p)); }
      raf = requestAnimationFrame(tick);
    };
    const drain = () => {
      const from = p, s = performance.now();
      const step = () => { if (holding || lit) return; const k = Math.min(1, (performance.now() - s) / 320); set(from * (1 - k)); if (k < 1) raf = requestAnimationFrame(step); };
      raf = requestAnimationFrame(step);
    };
    btn.addEventListener('pointerdown', e => {
      if (btn.disabled || lit || e.button > 0) return;
      e.preventDefault();
      try { A.Audio?.init?.(); A.Audio?.ctx?.resume?.(); } catch {}
      try { btn.setPointerCapture(e.pointerId); } catch {}
      cancelAnimationFrame(raf);
      holding = true; btn.classList.add('holding'); buzzAt = performance.now() + buildGap(p); swell = p >= 0.75;
      const H = smoothHap();
      if (H) H.holdStart({ durationMs: (1 - p) * HOLD_MS, from: p }).catch(() => {}); else buzz('tick');
      t0 = performance.now() - p * HOLD_MS;
      raf = requestAnimationFrame(tick);
    });
    const release = () => { if (!holding) return; holding = false; btn.classList.remove('holding'); if (!lit) { smoothHap()?.holdStop().catch(() => {}); drain(); hint(); } };
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(t => btn.addEventListener(t, release));
    btn.addEventListener('contextmenu', e => e.preventDefault());
    btn.addEventListener('click', e => { if (e.detail === 0 && !lit && !btn.disabled) { set(1); fire(); } });
    const hint = () => { const l = $('beginLabel'); l.classList.remove('nudge'); void l.offsetWidth; l.classList.add('nudge'); };
    const unlit = () => { cancelAnimationFrame(raf); lit = false; holding = false; btn.classList.remove('lit', 'holding'); set(0); };
    A.bus.on('home', unlit);
    // the clip check (clipcheck.js) was closed without beginning
    A.bus.on('unkindle', unlit);
  };

  const MOODS = [['#34476E', 0.35], ['#5A7CA6', 0.5], ['#A9A79A', 0.65], ['#E8B867', 0.82], ['#FFCB5C', 1]];
  const moodRow = () => {
    const box = $('moodEnd');
    if (!box) return;
    MOODS.forEach(([c, g], i) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'mood-lantern state'; b.dataset.v = i + 1;
      b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', 'false');
      b.setAttribute('aria-label', `Lantern ${i + 1} of 5${i === 0 ? ', lowest' : i === 4 ? ', highest' : ''}`);
      b.style.setProperty('--c', c); b.style.setProperty('--g', g);
      b.innerHTML = G.lantern(c, g);
      box.append(b);
    });
  };

  const DAY = { Sun: 'S', Mon: 'M', Tue: 'T', Wed: 'W', Thu: 'T', Fri: 'F', Sat: 'S' };
  const NAME = { Sun: 'Sunday', Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday', Fri: 'Friday', Sat: 'Saturday' };
  const SAY = { lit: 'lit', rest: 'resting', frozen: 'kept', missed: 'not lit', today: 'today', future: '', none: '' };
  const week = () => {
    const ol = $('endWeek');
    if (!ol || !A.Streak) return;
    ol.innerHTML = '';
    A.Streak.week().forEach(d => {
      const li = document.createElement('li');
      const state = d.today && d.state === 'lit' ? 'sun' : d.state;
      li.className = 'day ' + state;
      li.innerHTML = `<span class="light" aria-hidden="true"></span><span class="d" aria-hidden="true">${DAY[d.weekday] || ''}</span>`;
      li.setAttribute('aria-label', [NAME[d.weekday], SAY[d.state]].filter(Boolean).join(', '));
      ol.append(li);
    });
  };

  const end = () => $('end');
  let handoff = 0, settle = 0;
  const phase = p => {
    const el = end();
    if (!el) return;
    el.dataset.phase = p;
    const act = el.querySelector('.end-actions');
    if (act) { if (p === 'sheet') act.dataset.scheme = 'kevat'; else delete act.dataset.scheme; }
    const quote = $('endQuote');
    quote?.classList.remove('settled');
    clearTimeout(settle);
    if (p === 'sheet') {
      week(); clearTimeout(handoff); A.Theme.set('kevat', { fade: 2000 });
      settle = setTimeout(() => quote?.classList.add('settled'), 3600);
    }
  };
  const isNight = () => typeof A.night === 'function' && A.night();
  A.bus.on('endScreen', () => {
    phase('mood');
    clearTimeout(handoff);
    if (!isNight()) handoff = setTimeout(() => A.Theme.set('kevat', { fade: 2000 }), 2000);
    else A.Theme.room();
  });
  A.bus.on('mood', m => {
    if (m?.which !== 'end') return;
    document.querySelectorAll('#moodEnd .mood-lantern').forEach(b => b.setAttribute('aria-checked', String(Number(b.dataset.v) === m.value)));
    setTimeout(() => { if (end()?.dataset.phase === 'mood') phase(isNight() ? 'rest' : 'sheet'); }, 900);
  });
  A.bus.on('sessionEnd', r => {
    const el = end();
    if (!el || el.classList.contains('off')) return;
    if (r.status === 'declined') { phase('declined'); return; }
    if (el.dataset.phase === 'mood' || !el.dataset.phase) phase(isNight() ? 'rest' : 'sheet');
  });
  A.bus.on('streak', () => { if (end()?.dataset.phase === 'sheet') week(); });
  A.bus.on('crisisOffer', () => {
    const offer = $('offer'), paper = document.querySelector('.end-paper');
    if (!offer || !paper) return;
    if (isNight()) end().append(offer);
    else paper.insertBefore(offer, paper.querySelector('.end-week'));
  });
  A.bus.on('home', () => {
    clearTimeout(handoff);
    phase('');
    document.querySelectorAll('#moodEnd .mood-lantern').forEach(b => b.setAttribute('aria-checked', 'false'));
    A.Theme.set('kaamos', { fade: 0 });
    A.Theme.sync();
  });

  const glyphs = () => document.querySelectorAll('[data-glyph="lantern"]').forEach(el => { el.innerHTML = G.lantern('var(--md-sys-color-sun)', 1); });

  const layers = () => {
    document.addEventListener('keydown', e => {
      if (e.key !== 'Escape') return;
      const open = ['hubDialog', 'info', 'signals', 'crisis', 'settings', 'voice'].map($).find(el => el && !el.classList.contains('hidden'));
      if (open) { e.preventDefault(); open.querySelector('[data-close]')?.click(); }
    });
  };

  const talk = () => {
    const tile = document.querySelector('.talk-tile');
    if (tile) tile.innerHTML = G.lantern('var(--md-sys-color-sun)', 1);
  };

  const scoped = () => {
    const local = () => A.Theme.local();
    document.addEventListener('click', e => {
      const b = e.target.closest('[data-open]');
      if (!b) return;
      const id = b.dataset.open, el = $(id);
      if (!el || !['settings', 'info', 'signals', 'voice'].includes(id)) return;
      if (A.Theme.scheme === 'kaamos' && local() === 'kevat') el.dataset.scheme = 'kevat';
      else delete el.dataset.scheme;
    }, true);
  };

  const sheet = document.querySelector('.end-sheet');
  if (sheet) sheet.prepend(frag(G.wave()));
  const noLoupe = () => ['begin', 'game'].forEach(id => $(id)?.addEventListener('touchstart', e => e.preventDefault(), { passive: false }));

  buildSettings(); kindle(); moodRow(); glyphs(); layers(); talk(); scoped(); noLoupe();
  A.Shell = { toast, week, phase, row, group, groups: GROUPS };
})();
