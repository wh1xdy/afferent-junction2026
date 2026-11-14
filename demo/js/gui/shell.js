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
  const head = g => `<h3 class="subhead t-label">${g.title}${g.hint ? `<button type="button" class="icon-btn state" aria-label="${g.hint}" title="${g.hint}" data-hint><span class="ms">info</span></button>` : ''}</h3>`;
  const group = g => `<section class="set-group"${g.id ? ` id="${g.id}"` : ''}>
    ${g.bare ? '' : head(g)}
    <div class="group">${g.rows.map(row).join('')}</div>
  </section>`;

  // The Developer section is for the team, not for the patient: hidden unless ?dev is in the address, or it was turned
  // on by tapping the version line 7 times (or holding it). The same again hides it. Kept on this phone only.
  const DEV_KEY = 'afferent.dev';
  // The levels of Heartbeat touch (A.config.heartLevel; main.js keeps it, heartbeat.js plays it). Off is one of them.
  const BEAT = [['off', 'Off'], ['soft', 'Soft'], ['medium', 'Medium'], ['strong', 'Strong']];
  const dev = q.has('dev');
  let devShown = dev || (() => { try { return localStorage.getItem(DEV_KEY) === '1'; } catch { return false; } })();
  // Settings opens on a short list of categories (PAGES); each opens its own page from the right with these groups on it.
  // Every row lives on exactly one page. presence.js adds its group after Sensors, onboard.js fills Mornings.
  const GROUPS = [
    { page: 'sound', title: 'Sound and light', rows: [
      { icon: 'volume_up', label: 'Sound', sw: 'id="soundSw"' },
      { icon: 'touch_app', label: 'Vibration', sup: 'Soft touches as you play', sw: 'id="hapticSw"' },
      { icon: 'favorite', label: 'Heartbeat touch', sup: 'A beat at your own pulse, on the start screen and in calm moments', static: true },
      { html: `<div class="seg-row"><div class="seg compact" id="beatSeg" role="radiogroup" aria-label="Heartbeat touch">${BEAT.map(([v, t]) =>
        `<button type="button" class="state" role="radio" aria-checked="false" data-v="${v}">${t}</button>`).join('')}</div></div>` },
      { icon: 'nightlight', label: 'Dim light', sup: 'At night: dimmer colours, bedside LED at most 25%', sw: 'id="quietSw"' },
      { icon: 'motion_photos_off', label: 'Reduced motion', sw: 'id="motionSw"' },
    ] },
    { page: 'sensors', id: 'sensorsGroup', title: 'Sensors', hint: 'From the sensors, only numbers leave the phone, never camera images.', rows: [
      { icon: 'videocam', label: 'Phone camera', sw: 'data-sensor="phone_camera"' },
      { icon: 'ecg_heart', label: 'Pulse stone', sup: 'Two finger clips', liveId: 'fingerState', sw: 'data-sensor="pulse_stone"' },
      { icon: 'air', label: 'Breathing pace', sup: 'Shown in the breathing task', sw: 'id="breathSw"' },
      { icon: 'lightbulb', label: 'Bedside light', sup: 'One small LED on the bedside unit, set through the home hub', sw: 'data-sensor="bedside_light"' },
      { icon: 'accessibility_new', label: 'Bedside camera', sw: 'data-sensor="bedside_camera"' },
      { icon: 'mobile_vibrate', label: 'Phone movement', sw: 'data-sensor="phone_motion"' },
    ] },
    { page: 'sensors', title: 'While you play', rows: [
      { icon: 'vital_signs', label: 'Live vitals', sup: 'Your pulse and breathing in a corner, and why the games change', sw: 'id="vitalsSw"' },
    ] },
    { page: 'session', title: 'Before a session', rows: [
      { icon: 'back_hand', label: 'Check the finger clips', sup: 'Not checked yet', supId: 'clipState', attrs: 'id="clipCheckRow"', chevron: true },
      { icon: 'checklist', label: 'Ask before each session', sup: 'Only when the clips give no pulse yet', sw: 'id="clipAskSw"' },
    ] },
    { page: 'session', title: 'Together', rows: [
      { icon: 'favorite', label: 'Heart Duel', sup: 'Two people, one clip each. A game outside your sessions, nothing is saved', attrs: 'data-duel', chevron: true },
    ] },
    { page: 'mornings', id: 'morningsGroup', title: 'Mornings', rows: [] },
    { page: 'mornings', title: 'Check-in', hint: 'Nine short questions every 14 days, in the daytime. Your clinic will see your answers.', rows: [
      { icon: 'checklist', label: 'Check-in', sup: 'Every 14 days', sw: 'id="checkinSw"' },
    ] },
    { page: 'clinic', title: 'Export to your clinic', hint: 'Only when you show the code. Nobody watches live.', rows: [
      { icon: 'ios_share', label: 'Show to my doctor', href: 'patient.html#settings', id: 'qrBtn' },
      { icon: 'insights', label: 'Clinic dashboard', sup: 'Wi-Fi + link', href: 'patient.html#share', id: 'exportBtn' },
      // Plain text, not a one-option control: a summary is the only kind of export there is.
      { icon: 'description', label: 'What is in an export', sup: 'A summary: lanterns, play times, sensor numbers', supId: 'sharingState', static: true },
    ] },
    // The address comes from the hub screen and is long (it carries the hub's key after /k/), so it can be pasted in one tap.
    { page: 'hub', title: 'Home hub', bare: true, rows: [{ html: `<form id="hubForm" class="hub-card">
      <div class="hub-row"><div class="field"><input id="hubAddr" type="text" inputmode="url" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="go" placeholder="192.168.1.20:8000/k/…"><label for="hubAddr">Hub address</label></div><button type="button" id="hubPaste" class="btn tonal small state">Paste</button></div>
      <p id="hubState" class="hub-state t-body-m" role="status" data-state="none">Not set</p>
      <p class="t-body-s muted hub-help">The address is on the hub screen. It ends in /k/ and a code.</p>
      <div class="hub-actions"><button class="btn filled small state" type="submit">Connect</button></div>
    </form>` }] },
    { page: 'about', title: 'Help', rows: [
      { icon: 'info', label: 'How it works', attrs: 'data-open="info"' },
      { icon: 'ecg_heart', label: 'Your signals', attrs: 'data-open="signals"' },
      { glyph: G.lantern(null), label: 'The lanterns', attrs: 'data-anchor' },
      { glyph: G.laminate(), label: 'Your mornings', href: 'patient.html', id: 'weekBtn' },
    ] },
  ];
  const PAGES = [
    { id: 'sound', icon: 'volume_up', title: 'Sound and feel' },
    { id: 'sensors', icon: 'sensors', title: 'Sensors' },
    { id: 'session', icon: 'back_hand', title: 'Sessions' },
    { id: 'mornings', icon: 'wb_twilight', title: 'Mornings and check-in' },
    { id: 'clinic', icon: 'ios_share', title: 'Share with your clinic' },
    { id: 'hub', icon: 'router', title: 'Home hub' },
    { id: 'about', icon: 'info', title: 'Help and about' },
  ];
  const DEV = { id: 'devGroup', title: 'Developer', rows: [
    { icon: 'code', label: 'Simulated sensors', sw: 'id="simSw"' },
    { icon: 'vital_signs', label: 'Signals during play', sw: 'id="sigSw"' },
    { icon: 'touch_app', label: 'Input', val: '', attrs: 'data-dev="input"' },
    { icon: 'schedule', label: 'Clock', val: '', attrs: 'data-dev="clock"' },
    { icon: 'routine', label: 'Session', val: '', attrs: 'data-dev="stage"' },
    { icon: 'insights', label: 'Day profile', val: '', attrs: 'data-dev="profile"' },
  ] };

  const showDev = on => {
    devShown = on;
    try { on ? localStorage.setItem(DEV_KEY, '1') : localStorage.removeItem(DEV_KEY); } catch {}
    const box = $('devGroup');
    if (box) box.hidden = !on;
    toast(on ? 'Developer settings are shown.' : 'Developer settings are hidden.');
  };
  const devUnlock = ver => {
    if (!ver) return;
    addEventListener('DOMContentLoaded', () => { ver.textContent = `Afferent ${A.config?.appVersion || ''}`.trim(); });
    let taps = 0, last = 0, hold = 0;
    ver.addEventListener('click', () => {
      const now = performance.now();
      taps = now - last < 1500 ? taps + 1 : 1; last = now;
      if (taps >= 7) { taps = 0; showDev(!devShown); }
    });
    ver.addEventListener('pointerdown', () => { clearTimeout(hold); hold = setTimeout(() => { taps = -1; showDev(!devShown); }, 800); });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(t => ver.addEventListener(t, () => clearTimeout(hold)));
    ver.addEventListener('contextmenu', e => e.preventDefault());
  };

  // The markup of Settings: the category list for #settingsBody and one page per category for #settings.
  const devGroup = () => group(DEV).replace('class="set-group"', `class="set-group dev${dev ? ' open' : ''}"${devShown ? '' : ' hidden'}`)
    .replace(/<h3 class="subhead t-label">Developer/, `<h3 class="subhead t-label"><button type="button" class="dev-toggle state" aria-expanded="${dev}"><span>Developer</span><span class="ms" aria-hidden="true">expand_more</span></button>`);
  const catRow = p => `<button type="button" class="li state two set-cat" data-page="${p.id}"><span class="ms" aria-hidden="true">${p.icon}</span>`
    + `<span class="txt"><span class="hl">${p.title}</span><span class="sup" id="setSum-${p.id}"></span></span><span class="ms trail" aria-hidden="true">chevron_right</span></button>`;
  const pageHtml = p => `<section id="setPage-${p.id}" class="screen set-page hidden" data-page="${p.id}" aria-labelledby="setTitle-${p.id}">
    <header class="top-bar app-bar"><button class="icon-btn state" data-page-back type="button" aria-label="Back to Settings"><span class="ms">arrow_back</span></button><h2 id="setTitle-${p.id}" class="title" tabindex="-1">${p.title}</h2></header>
    <div class="settings-body">${GROUPS.filter(g => g.page === p.id).map(group).join('')}${p.id === 'about' ? devGroup()
      + '<button type="button" class="app-version t-body-s muted" id="appVersion">Afferent</button>' : ''}</div>
  </section>`;
  const settingsHtml = () => ({
    top: `<nav class="group set-cats" aria-label="Settings">${PAGES.map(catRow).join('')}</nav>`
      + '<p class="t-body-s muted research">Research prototype. Not a CE-marked medical device. Not for clinical use.</p>',
    pages: PAGES.map(pageHtml).join(''),
  });

  // One line under each category: what is on in it now. Read from the rows themselves, so it follows every way they change.
  const on = id => !!$(id)?.checked;
  const said = id => ($(id)?.textContent || '').trim();
  const lower = t => (t ? t[0].toLowerCase() + t.slice(1) : t);
  const SUMMARY = {
    // With Vibration on, the Heartbeat touch level says it (one line fits a phone); with it off, that it is off.
    sound: () => {
      const beat = ($('beatSeg')?.querySelector('[aria-checked="true"]')?.textContent || '').trim();
      return `${on('soundSw') ? 'Sound on' : 'Sound off'} · ${!on('hapticSw') ? 'Vibration off' : beat ? `Heartbeat: ${beat}` : 'Vibration on'}`;
    },
    sensors: () => {
      const stone = document.querySelector('#setPage-sensors [data-sensor="pulse_stone"]');
      return !stone?.checked ? 'Finger clips off' : A.Sensors?.fingerLink?.state === 'connected' ? 'Finger clips connected' : 'Finger clips not connected';
    },
    session: () => `Clip check: ${lower(said('clipState')) || 'not checked yet'}`,
    mornings: () => {
      const pause = said('pauseVal');
      return [on('checkinSw') ? 'Check-in on' : 'Check-in off',
        pause && pause !== 'Off' ? `Paused ${lower(pause)}` : on('remindSw') ? `Reminder at ${$('wakeIn')?.value || '07:00'}` : 'No reminder'].join(' · ');
    },
    clinic: () => (/paused/i.test(said('sharingState')) ? 'Sharing is paused' : 'Only when you show it'),
    hub: () => said('hubState') || 'Not set',
    about: () => `How it works · Afferent ${A.config?.appVersion || ''}`.trim(),
  };
  const hooks = [];
  const refresh = () => {
    for (const f of hooks) { try { f(); } catch {} }
    for (const p of PAGES) {
      const el = $('setSum-' + p.id);
      if (!el) continue;
      let t = '';
      try { t = SUMMARY[p.id](); } catch {}
      if (el.textContent !== t) el.textContent = t;
    }
  };

  // A category slides its page in from the right; the back arrow, a swipe from the left edge (gui/swipe.js) or Escape
  // slides it out again. Settings always opens on the list (or on the page its button names in data-settings-page).
  let pageFrom = null;
  const openPage = (id, { instant = false } = {}) => {
    const page = $('setPage-' + id);
    if (!page) return false;
    A.Swipe?.stay?.(page);
    if (!instant) pageFrom = document.activeElement;
    page.classList.toggle('instant', !!instant);
    page.classList.remove('hidden');
    if (!instant) A.Swipe?.hold?.(320);
    const body = page.querySelector('.settings-body');
    if (body) body.scrollTop = 0;
    page.querySelector('.title')?.focus?.({ preventScroll: true });
    refresh();
    return true;
  };
  const closePage = page => {
    if (!page || page.classList.contains('hidden')) return;
    const done = () => page.classList.add('hidden');
    if (!A.Swipe?.out?.(page, done)) done();
    refresh();
    const f = pageFrom;
    pageFrom = null;
    if (f?.isConnected && !page.contains(f)) f.focus?.({ preventScroll: true });
  };
  const closePages = () => document.querySelectorAll('#settings .set-page').forEach(p => { A.Swipe?.stay?.(p); p.classList.add('hidden'); });
  const openPageOf = () => document.querySelector('#settings .set-page:not(.hidden)');

  const buildSettings = () => {
    const body = $('settingsBody'), root = $('settings');
    if (!body || !root) return;
    const { top, pages } = settingsHtml();
    body.append(frag(top));
    root.append(frag(pages));
    root.querySelector('.dev-toggle').onclick = e => {
      const box = e.currentTarget.closest('.set-group');
      box.classList.toggle('open');
      e.currentTarget.setAttribute('aria-expanded', String(box.classList.contains('open')));
    };
    devUnlock($('appVersion'));
    root.querySelectorAll('.set-cat').forEach(b => b.onclick = () => openPage(b.dataset.page));
    root.querySelectorAll('[data-page-back]').forEach(b => b.onclick = () => closePage(b.closest('.set-page')));
    root.querySelectorAll('[data-anchor]').forEach(b => b.onclick = () => A.Checkin?.anchor?.());
    root.querySelectorAll('[data-hint]').forEach(b => b.onclick = () => toast(b.getAttribute('aria-label')));
    // a switch or a field changed (its own handler ran first): the lines on the list follow
    root.addEventListener('change', refresh);
    root.addEventListener('input', refresh);
    // Settings opened: the list, fresh lines. Heard after the button's own handlers (main.js, clipcheck.js, onboard.js).
    document.addEventListener('click', e => {
      const b = e.target?.closest?.('[data-open="settings"]');
      if (!b) return;
      closePages();
      if (b.dataset.settingsPage) openPage(b.dataset.settingsPage, { instant: true });
      refresh();
    });
    // the finger clips and the hub connect and drop on their own
    setInterval(() => { if (!root.classList.contains('hidden')) refresh(); }, 1000);
  };

  let toastEl = null, toastT = 0;
  const toast = msg => {
    if (!toastEl) { toastEl = document.createElement('div'); toastEl.className = 'snackbar t-body-m'; toastEl.setAttribute('role', 'status'); $('phone').append(toastEl); }
    toastEl.textContent = msg; toastEl.classList.add('on');
    clearTimeout(toastT); toastT = setTimeout(() => toastEl.classList.remove('on'), 4000);
  };

  const HOLD_MS = 900;
  // The kindle flame beats with the live heartbeat (heartbeat.js) while the home screen shows; main.js calls this each frame.
  let kindleBeat = () => {};
  const buildGap = p => 170 - 125 * p;
  const smoothHap = () => !!A.Haptics?.smooth();
  const kindle = () => {
    const btn = $('begin');
    if (!btn) return;
    btn.innerHTML = `<span class="kindle-halo" aria-hidden="true"></span>${G.ring(46)}<span class="kindle-core" aria-hidden="true">${G.flame()}</span>`;
    const fill = btn.querySelector('.fill'), tip = btn.querySelector('.tip'), C = 2 * Math.PI * 46;
    let p = 0, t0 = 0, heldFrom = 0, raf = 0, holding = false, lit = false, buzzAt = 0, swell = false;
    const set = v => { p = v; fill.style.strokeDashoffset = (C * (1 - v)).toFixed(2); tip.style.opacity = v > 0 && v < 1 ? 1 : 0; tip.setAttribute('transform', `rotate(${(v * 360).toFixed(1)} 50 50)`); btn.style.setProperty('--p', v.toFixed(3)); };
    const buzz = (n, k) => A.Haptics?.play(n, k);
    const fire = () => { lit = true; btn.classList.add('lit'); A.Haptics?.lit(); btn.dispatchEvent(new CustomEvent('kindle')); };
    const tick = () => {
      if (!holding) return;
      set(Math.min(1, (performance.now() - t0) / HOLD_MS));
      if (p >= 1) { holding = false; fire(); return; }
      const now = performance.now();
      if (smoothHap()) { raf = requestAnimationFrame(tick); return; }
      if (p >= 0.75) { if (!swell) { swell = true; buzz('touch'); } }
      else if (now >= buzzAt) { buzz('tick'); buzzAt = now + Math.max(70, buildGap(p)); }
      raf = requestAnimationFrame(tick);
    };
    const drain = () => {
      const from = p, s = performance.now();
      const step = () => { if (holding || lit) return; const k = Math.min(1, (performance.now() - s) / 320); set(from * (1 - k)); if (k < 1) raf = requestAnimationFrame(step); };
      raf = requestAnimationFrame(step);
    };
    // When the finger really went down or up. A busy frame (as right after launch) can run the pointerdown handler late,
    // and the ring times the hold from the handler, so a 1.3 s hold could end with the ring barely started and drain.
    // On release the event times decide; the ring itself still counts from the handler, so a stall never fills it early.
    const at = e => { const n = performance.now(), t = e?.timeStamp; return t > 0 && t <= n + 1 && t > n - 5000 ? t : n; };
    btn.addEventListener('pointerdown', e => {
      if (btn.disabled || lit || e.button > 0) return;
      e.preventDefault();
      try { A.Audio?.init?.(); A.Audio?.ctx?.resume?.(); } catch {}
      try { btn.setPointerCapture(e.pointerId); } catch {}
      cancelAnimationFrame(raf);
      holding = true; btn.classList.add('holding'); buzzAt = performance.now() + buildGap(p); swell = p >= 0.75;
      if (!(smoothHap() && A.Haptics.hold((1 - p) * HOLD_MS, p))) buzz('tick');
      t0 = performance.now() - p * HOLD_MS; heldFrom = at(e) - p * HOLD_MS;
      raf = requestAnimationFrame(tick);
    });
    const release = e => {
      if (!holding) return;
      holding = false; btn.classList.remove('holding');
      if (lit) return;
      if ((at(e) - heldFrom) / HOLD_MS >= 1) { cancelAnimationFrame(raf); set(1); fire(); return; }
      A.Haptics?.release(); drain(); hint();
    };
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(t => btn.addEventListener(t, release));
    btn.addEventListener('contextmenu', e => e.preventDefault());
    btn.addEventListener('click', e => { if (e.detail === 0 && !lit && !btn.disabled) { set(1); fire(); } });
    let beatOn = false, beatV = -1;
    kindleBeat = h => {
      const on = !!h && h.k > 0.02, v = on ? Math.round((h.beat + 0.6 * h.swell) * 100) / 100 : 0;
      if (on !== beatOn) { beatOn = on; btn.classList.toggle('beating', on); }
      if (v !== beatV) { beatV = v; btn.style.setProperty('--beat', v); }
    };
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
      const open = ['info', 'signals', 'crisis', 'settings', 'voice'].map($).find(el => el && !el.classList.contains('hidden'));
      const page = open?.id === 'settings' && openPageOf();
      if (page && !A.Swipe?.leaving?.(page)) { e.preventDefault(); page.querySelector('[data-page-back]')?.click(); return; }
      if (open) { e.preventDefault(); open.querySelector('[data-close]')?.click(); }
    });
  };

  const talk = () => {
    const tile = document.querySelector('.talk-tile');
    if (tile) tile.innerHTML = G.lantern('var(--md-sys-color-sun)', 1);
  };

  const scoped = () => {
    const local = () => A.Theme.local();
    const follow = el => {
      if (A.Theme.scheme === 'kaamos' && local() === 'kevat') el.dataset.scheme = 'kevat';
      else delete el.dataset.scheme;
    };
    document.addEventListener('click', e => {
      const b = e.target.closest('[data-open]');
      if (!b) return;
      const id = b.dataset.open, el = $(id);
      if (!el || !['settings', 'info', 'signals', 'voice', 'crisis'].includes(id)) return;
      follow(el);
    }, true);
    // Talk to someone also opens from the check-in and the end screen's offer, without a button; it says so on the bus.
    A.bus.on('ws', m => { if (m?.type === 'crisis' && $('crisis')) follow($('crisis')); });
  };

  const sheet = document.querySelector('.end-sheet');
  if (sheet) sheet.prepend(frag(G.wave()));
  const noLoupe = () => ['begin', 'game'].forEach(id => $(id)?.addEventListener('touchstart', e => e.preventDefault(), { passive: false }));

  buildSettings(); kindle(); moodRow(); glyphs(); layers(); talk(); scoped(); noLoupe();
  A.Shell = { toast, week, phase, row, group, groups: GROUPS, kindleBeat: h => kindleBeat(h),
    settings: { pages: PAGES, html: settingsHtml, summary: SUMMARY, refresh, hook: f => hooks.push(f), open: openPage, close: closePage, closeAll: closePages } };
})();
