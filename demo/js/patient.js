(() => {
  const $ = id => document.getElementById(id);
  const q = new URLSearchParams(location.search);
  const pid = q.get('patient') || 'anna';
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  };
  const svgNS = 'http://www.w3.org/2000/svg';
  const el = (tag, attrs = {}, kids = []) => {
    const n = /^(svg|path|circle|line|rect|defs|linearGradient|radialGradient|stop|g|filter|feGaussianBlur|ellipse|polyline)$/.test(tag) ? document.createElementNS(svgNS, tag) : document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'text') n.textContent = v;
      else if (k === 'html') n.innerHTML = v;
      else if (v !== null && v !== undefined && v !== false) n.setAttribute(k, v);
    }
    for (const c of [].concat(kids)) if (c) n.append(c);
    return n;
  };
  const token = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

  const CRISIS = {
    title: 'If today is heavy, you do not have to carry it alone.',
    text: 'Afferent is not an emergency service and is not watched around the clock. Your clinic sees a note on the next working day.',
    contacts: [
      { label: 'Emergency', number: '112', tel: '112' },
      { label: 'MIELI Crisis Helpline (24 h)', number: '09 2525 0111', tel: '+358925250111' },
      { label: 'Your clinic (demo placeholder)', number: '09 000 0000', tel: '+35890000000' },
    ],
  };

  const GLYPHS = {
    breath: '<circle cx="12" cy="12" r="2.6"/><circle cx="12" cy="12" r="6" opacity=".6"/><circle cx="12" cy="12" r="9.4" opacity=".3"/>',
    fireflies: '<circle cx="6.5" cy="8" r="1.4" class="f"/><circle cx="15.5" cy="5.5" r="1.1" class="f"/><circle cx="18" cy="13.5" r="1.6" class="f"/><circle cx="9.5" cy="16.5" r="1.2" class="f"/><circle cx="13" cy="11" r="1" class="f" opacity=".6"/>',
    sun: '<path d="M3 17.5h18"/><path d="M7 17.5a5 5 0 0 1 10 0"/><path d="M12 6.5v2.2M5.6 9.6l1.5 1.5M18.4 9.6l-1.5 1.5"/>',
    stars: '<path d="M12 4l1.6 5.4L19 11l-5.4 1.6L12 18l-1.6-5.4L5 11l5.4-1.6z"/>',
    bells: '<path d="M7 16.5V11a5 5 0 0 1 10 0v5.5l1.5 1.5h-13z"/><path d="M10.5 20.5h3"/>',
    beacon: '<path d="M10 20l1-11h2l1 11z"/><path d="M9.5 9h5"/><path d="M15 6.5l5-2M15 8.5l5 1"/>',
    shutters: '<rect x="5" y="4.5" width="14" height="15" rx="1.5"/><path d="M5 9.5h14M5 14.5h14"/>',
    threads: '<path d="M3.5 9c3-3 5 3 8.5 0s5.5-3 8.5 0"/><path d="M3.5 15c3-3 5 3 8.5 0s5.5-3 8.5 0" opacity=".55"/>',
    loyly: '<path d="M4 19.5h16"/><path d="M8.5 16c-1.5-2 1.5-3.5 0-5.5s1-3 0-5"/><path d="M15.5 16c-1.5-2 1.5-3.5 0-5.5s1-3 0-5" opacity=".6"/>',
    dot: '<circle cx="12" cy="12" r="4"/>',
  };
  const SENSOR_ICONS = {
    phone_camera: '<rect x="7" y="3" width="10" height="18" rx="2.5"/><circle cx="12" cy="7" r="1.3"/>',
    pulse_stone: '<path d="M4.5 13c0-4.5 3.5-7.5 7.5-7.5s7.5 2.7 7.5 7c0 3.7-3.4 6-7.5 6S4.5 16.7 4.5 13z"/><path d="M7.5 13h2l1.2-2.5 1.8 5 1.2-2.5h2.8"/>',
    bedside_camera: '<rect x="3.5" y="7" width="12" height="10" rx="2"/><path d="M15.5 10.5l5-3v9l-5-3"/>',
    bedside_light: '<path d="M8.5 15a5.5 5.5 0 1 1 7 0c-.8.6-1 1.4-1 2.5h-5c0-1.1-.2-1.9-1-2.5z"/><path d="M10 20.5h4"/>',
    presence: '<path d="M3.5 18.5v-9M3.5 15h17v3.5M20.5 15v-2.5a2.5 2.5 0 0 0-2.5-2.5h-7v5"/><circle cx="7" cy="12" r="1.6"/>',
    phone_presence: '<path d="M4.5 11L12 4.5l7.5 6.5"/><path d="M6.5 9.5v10h11v-10"/><path d="M10.5 19.5v-5h3v5"/>',
    phone_motion: '<path d="M8 4.5c1.7 0 2.5 1.8 2.5 4s-.8 4-2.5 4-2.5-1.8-2.5-4 .8-4 2.5-4z"/><path d="M6.5 15.5h3v1.5a1.5 1.5 0 0 1-3 0z"/><path d="M16 8.5c1.7 0 2.5 1.8 2.5 4s-.8 4-2.5 4-2.5-1.8-2.5-4 .8-4 2.5-4z"/><path d="M14.5 19.5h3V21a1.5 1.5 0 0 1-3 0z"/>',
  };
  const MODE_TINT = { calm: '--af-mode-calm', wake: '--af-mode-wake', fatigue: '--af-mode-fatigue', rest: '--af-mode-flow', flow: '--af-mode-flow' };
  const SHARING_NOTE = {
    nothing_tonight: ['Tonight stays on this phone.', 'Your clinic only sees that tonight was not shared.', 'Sharing returns tomorrow.'],
    paused: ['Nothing leaves this phone for 7 days.', 'Your clinic only sees that sharing is paused.'],
  };
  const OFF_NOTE = 'Off. Nothing is collected.';
  const NEVER = 'Never camera images, sound or messages';

  const hubBase = (() => {
    const norm = s => {
      if (!s) return null;
      try {
        const u = new URL(s);
        if (u.protocol === 'ws:' || u.protocol === 'wss:') return (u.protocol === 'wss:' ? 'https://' : 'http://') + u.host;
        return u.origin;
      } catch { return null; }
    };
    let ls = null;
    try { ls = localStorage.getItem('afferent.hub'); } catch {}
    return norm(q.get('hub')) || norm(q.get('ws')) || norm(ls) || (/^https?:$/.test(location.protocol) ? location.origin : null);
  })();

  let view = null, source = 'saved', privacy = { sharing: 'summary', sensors: {} }, socket = null;
  const pending = [];
  const privKey = 'afferent.privacy.' + pid, pauseKey = 'afferent.pausedUntil.' + pid;

  async function fetchJSON(url, ms = 2500) {
    const ac = new AbortController(), t = setTimeout(() => ac.abort(), ms);
    try {
      const r = await fetch(url, { signal: ac.signal, cache: 'no-store' });
      if (!r.ok) throw new Error(r.status);
      return await r.json();
    } finally { clearTimeout(t); }
  }

  async function load() {
    if (hubBase) {
      try {
        const v = await fetchJSON(`${hubBase}/api/patients/${encodeURIComponent(pid)}/patient-view`);
        if (v && v.week) return { v, src: 'hub' };
      } catch {}
    }
    if (pid === 'anna') try { return { v: await fetchJSON('data/patient_view_anna.json'), src: 'saved' }; } catch {}
    return { v: null, src: 'none' };
  }

  const fromView = v => ({
    sharing: v?.privacy?.sharing || 'summary',
    sensors: Object.fromEntries((v?.privacy?.sensors || []).map(s => [s.id, !!s.on])),
  });

  async function refresh() {
    const { v, src } = await load();
    view = v; source = src;
    privacy = fromView(v);
    if (src === 'hub') store.set(privKey, privacy);
    else {
      const saved = store.get(privKey);
      if (saved && saved.sensors) privacy = { sharing: saved.sharing || privacy.sharing, sensors: { ...privacy.sensors, ...saved.sensors } };
    }
    render();
    $('page').removeAttribute('aria-busy');
    if (src === 'hub') connect();
  }

  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const parseDate = s => { const [y, m, d] = (s || '').split('-').map(Number); return y ? new Date(y, m - 1, d) : new Date(); };
  const isoDay = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const longDate = d => `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
  const clock = h => { const m = Math.round(h * 60); return `${Math.floor(m / 60) % 24}:${String(m % 60).padStart(2, '0')}`; };
  const partOfDay = h => h < 5 ? 'Last night' : h < 12 ? 'This morning' : h < 18 ? 'This afternoon' : 'This evening';

  function render() {
    $('sim').hidden = !view?.simulated;
    if (!view) {
      $('date').textContent = longDate(new Date());
      $('headline').textContent = 'The lantern is waiting.';
      $('sub').textContent = '';
      drawArc(null);
      $('foot').textContent = 'Nothing saved on this phone yet.';
      return;
    }
    const t = view.today || {};
    $('date').textContent = source === 'hub' ? longDate(parseDate(view.date)) : 'Saved week';
    $('headline').textContent = !t.played ? 'Today is open.' : t.dawn_reached ? 'You reached dawn.' : 'You rested.';
    $('sub').textContent = !t.played ? 'The lantern is there whenever you want it.'
      : t.settled && t.lifted ? 'You settled, and the light came back a little.'
      : t.settled ? 'You settled.'
      : t.lifted ? 'The light came back a little.' : '';
    $('arcCap').replaceChildren(t.played
      ? (t.session_time_h != null ? `${partOfDay(t.session_time_h)} at ${clock(t.session_time_h)}` : '')
      : el('a', { class: 'begin', href: 'index.html' + location.search }, [el('span', { class: 'flame', 'aria-hidden': 'true' }), document.createTextNode('Light the lantern')]));
    drawArc(t);
    renderWeek(view.week || []);
    renderHelped(view.what_helped || []);
    renderSharing();
    renderSensors();
    $('foot').textContent = source === 'hub' ? 'Kept on your home hub. Nothing goes to the cloud.' : 'Saved copy on this phone.';
    world.setWarmth(t.played ? (t.arc?.[t.arc.length - 1] ?? 0.6) : 0.15, !!t.dawn_reached);
  }

  function smooth(pts) {
    let d = `M${pts[0][0]},${pts[0][1]}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
      const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
      const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
      d += ` C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
    }
    return d;
  }

  function drawArc(t) {
    const svg = $('arc');
    svg.replaceChildren();
    const W = 340, base = 150, x0 = 18, x1 = W - 18, top = 28;
    const horizon = el('line', { x1: 0, x2: W, y1: base, y2: base, class: 'horizon' });
    if (!t || !t.played || !Array.isArray(t.arc) || t.arc.length < 2) {
      svg.append(horizon, el('circle', { cx: x0, cy: base, r: 4.5, class: 'unlit' }));
      svg.setAttribute('aria-label', 'No session yet today');
      return;
    }
    const cs = t.colour_start || token('--af-mood-3'), ce = t.colour_end || cs;
    const arc = t.arc.map(v => Math.max(0, Math.min(1, +v || 0)));
    const pts = arc.map((v, i) => [x0 + i * (x1 - x0) / (arc.length - 1), base - v * (base - top)]);
    const line = smooth(pts), end = pts[pts.length - 1], warm = token('--af-lantern-glow');
    const defs = el('defs', {}, [
      el('linearGradient', { id: 'arcStroke', x1: 0, x2: 1, y1: 0, y2: 0 }, [el('stop', { offset: 0, 'stop-color': cs }), el('stop', { offset: 0.7, 'stop-color': ce }), el('stop', { offset: 1, 'stop-color': warm })]),
      el('radialGradient', { id: 'arcHalo' }, [el('stop', { offset: 0, 'stop-color': warm, 'stop-opacity': 0.75 }), el('stop', { offset: 0.35, 'stop-color': ce, 'stop-opacity': 0.28 }), el('stop', { offset: 1, 'stop-color': ce, 'stop-opacity': 0 })]),
      el('filter', { id: 'arcBlur', x: '-20%', y: '-60%', width: '140%', height: '220%' }, [el('feGaussianBlur', { stdDeviation: 5 })]),
    ]);
    const len = 600;
    svg.append(defs, horizon,
      el('path', { d: line, class: 'arcGlow', stroke: 'url(#arcStroke)', filter: 'url(#arcBlur)' }),
      el('path', { d: line, class: 'arcLine', stroke: 'url(#arcStroke)', 'stroke-dasharray': len, 'stroke-dashoffset': reduced ? 0 : len, style: `--len:${len}` }),
      el('circle', { cx: pts[0][0], cy: pts[0][1], r: 4.5, fill: cs, class: 'arcStart' }),
      el('circle', { cx: end[0], cy: end[1], r: 34, fill: 'url(#arcHalo)', class: 'arcHalo' }),
      el('circle', { cx: end[0], cy: end[1], r: 6, fill: ce, class: 'arcEnd' }),
      el('circle', { cx: end[0], cy: end[1], r: 2.4, fill: token('--af-lantern-flame'), class: 'arcEnd' }),
    );
    svg.setAttribute('aria-label', `Today's arc, lantern from ${t.mood_start ?? 'unset'} to ${t.mood_end ?? 'unset'} of 5`);
  }

  const LANTERN = '<svg viewBox="0 0 40 60" aria-hidden="true"><path class="lf" d="M16.5 11a3.5 3.5 0 0 1 7 0"/><path class="lb" d="M15 13.5h10l5.5 5h-21z"/><rect class="lg" x="11" y="18.5" width="18" height="24" rx="4"/><ellipse class="ll" cx="20" cy="32" rx="2.3" ry="5.2"/><rect class="lb" x="9.8" y="42" width="20.4" height="3.2" rx="1.2"/></svg>';

  function renderWeek(week) {
    const days = week.slice(-7), n = days.length || 7;
    const mood = d => d.played && d.mood >= 1 && d.mood <= 5 ? Math.round(d.mood) : null;
    const colourOf = d => token(`--af-mood-${mood(d)}`) || d.colour;
    const glowOf = d => parseFloat(token(`--af-mood-${mood(d)}-glow`)) || 0.6;
    const lit = d => !!(mood(d) && colourOf(d));
    const rgba = (hex, a) => { const [r, g, b] = A.hex(hex); return `rgba(${r},${g},${b},${a.toFixed(3)})`; };
    const stop = (d, at) => `${lit(d) ? rgba(colourOf(d), 0.25 + 0.6 * glowOf(d)) : 'rgba(0,0,0,0)'} ${at}%`;
    const glow = days.length ? `linear-gradient(90deg, ${stop({}, 0)}, ${days.map((d, i) => stop(d, ((i + 0.5) / n * 100).toFixed(2))).join(', ')}, ${stop({}, 100)})` : 'none';
    const cols = el('div', { class: 'days', style: `grid-template-columns:repeat(${n},1fr)` }, days.map(d => {
      const dd = parseDate(d.date);
      return el('div', {
        class: 'day' + (d.today ? ' today' : ''),
        role: 'img',
        'aria-label': `${DAYS[dd.getDay()]}${d.today ? ', today' : ''}, ${d.played ? (d.dawn_reached ? 'reached dawn' : 'played') : 'a quiet day'}`,
      }, [
        el('span', { class: 'lamp' + (lit(d) ? '' : ' gap'), style: lit(d) ? `--c:${colourOf(d)};--g:${glowOf(d)}` : null, html: LANTERN }),
        el('span', { class: 'wd', text: d.today ? 'Today' : (d.weekday || DAYS[dd.getDay()].slice(0, 3)) }),
      ]);
    }));
    $('week').replaceChildren(el('div', { class: 'ribbon', style: `background:${glow}`, 'aria-hidden': 'true' }), cols);
  }

  function renderHelped(items) {
    const ul = $('helped');
    ul.replaceChildren();
    if (!items.length) {
      ul.append(el('li', { class: 'row empty' }, [el('span', { class: 'glyph', html: `<svg viewBox="0 0 24 24">${GLYPHS.dot}</svg>` }), el('div', {}, [el('p', { class: 'tl', text: 'Still learning' }), el('p', { class: 'tx', text: 'A few more mornings will show what helps you.' })])]));
      return;
    }
    for (const it of items.slice(0, 4)) {
      const tint = token(MODE_TINT[it.mode] || '--af-dawn-gold');
      ul.append(el('li', { class: 'row', style: `--tint:${tint}` }, [
        el('span', { class: 'glyph', html: `<svg viewBox="0 0 24 24">${GLYPHS[it.glyph] || GLYPHS[it.task_id] || GLYPHS.dot}</svg>` }),
        el('div', {}, [
          el('p', { class: 'tl' }, [document.createTextNode(it.label || it.task_id), it.confidence === 'low' ? el('span', { class: 'learning', text: 'still learning' }) : null]),
          el('p', { class: 'tx', text: it.text || '' }),
        ]),
      ]));
    }
  }

  function pausedUntil() {
    let d = store.get(pauseKey);
    if (!d) { const x = parseDate(view?.date); x.setDate(x.getDate() + 7); d = isoDay(x); }
    return parseDate(d);
  }

  function renderSharing() {
    document.querySelectorAll('#sharing button').forEach(b => {
      const on = b.dataset.v === privacy.sharing;
      b.setAttribute('aria-checked', on);
      b.tabIndex = on ? 0 : -1;
    });
    const seg = $('sharing'), idx = ['summary', 'nothing_tonight', 'paused'].indexOf(privacy.sharing);
    seg.style.setProperty('--idx', Math.max(0, idx));
    const ul = $('sees');
    ul.replaceChildren();
    const item = (text, kind) => el('li', { class: kind }, [el('span', { class: 'bullet', 'aria-hidden': 'true' }), el('span', { text })]);
    if (privacy.sharing === 'summary') {
      const list = (view?.clinic_sees || []).filter(s => !/^Never/i.test(s));
      list.forEach(s => ul.append(item(s, 'yes')));
    } else {
      const note = [...SHARING_NOTE[privacy.sharing]];
      if (privacy.sharing === 'paused') note[0] = `Nothing leaves this phone until ${longDate(pausedUntil())}.`;
      note.forEach((s, i) => ul.append(item(s, i ? 'soft' : 'yes')));
    }
    const never = (view?.clinic_sees || []).find(s => /^Never/i.test(s)) || NEVER;
    ul.append(item(never, 'never'));
  }

  const PHONE = new Set(['phone_camera', 'phone_presence', 'phone_motion']);

  function renderSensors() {
    const wrap = $('sensors');
    wrap.replaceChildren();
    const all = view?.privacy?.sensors || [];
    for (const [title, list] of [['On your phone', all.filter(s => PHONE.has(s.id))], ['By your bed', all.filter(s => !PHONE.has(s.id))]]) {
      if (!list.length) continue;
      const ul = el('ul', { class: 'group', 'aria-label': title });
      for (const s of list) {
        const on = privacy.sensors[s.id] ?? s.on, id = 'sw-' + s.id;
        const sw = el('button', { type: 'button', role: 'switch', class: 'switch', id, 'aria-checked': on, 'aria-labelledby': id + '-l', 'aria-describedby': id + '-d' }, [el('span', { class: 'knob' })]);
        sw.onclick = () => setSensor(s.id, !(privacy.sensors[s.id] ?? s.on));
        ul.append(el('li', { class: 'sensor' + (on ? ' on' : '') }, [
          el('span', { class: 'sicon', html: `<svg viewBox="0 0 24 24">${SENSOR_ICONS[s.id] || GLYPHS.dot}</svg>` }),
          el('div', { class: 'stext' }, [el('p', { class: 'tl', id: id + '-l', text: s.label }), el('p', { class: 'tx', id: id + '-d', text: on ? s.shares : OFF_NOTE })]),
          sw,
        ]));
      }
      wrap.append(el('p', { class: 'sub', text: title }), ul);
    }
  }

  async function post(body) {
    if (socket && socket.readyState === 1) { send({ type: 'privacy', patient_id: pid, ...body }); return; }
    if (!hubBase || source !== 'hub') return;
    try {
      const r = await fetch(`${hubBase}/api/patients/${encodeURIComponent(pid)}/privacy`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (r.ok) applyPrivacy(await r.json());
    } catch {}
  }

  function applyPrivacy(p) {
    if (!p || typeof p !== 'object') return;
    privacy = { sharing: p.sharing || privacy.sharing, sensors: { ...privacy.sensors, ...(p.sensors || {}) } };
    store.set(privKey, privacy);
    renderSharing(); renderSensors();
  }

  function setSensor(id, on) {
    privacy.sensors[id] = on;
    store.set(privKey, privacy);
    renderSensors();
    document.getElementById('sw-' + id)?.focus();
    post({ sensor: id, on });
  }

  function setSharing(v) {
    if (v === privacy.sharing) return;
    privacy.sharing = v;
    if (v === 'paused') { const x = parseDate(view?.date); x.setDate(x.getDate() + 7); store.set(pauseKey, isoDay(x)); }
    store.set(privKey, privacy);
    renderSharing();
    post({ sharing: v });
  }

  const segs = [...document.querySelectorAll('#sharing button')];
  segs.forEach((b, i) => {
    b.onclick = () => setSharing(b.dataset.v);
    b.onkeydown = e => {
      const d = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
      if (!d) return;
      e.preventDefault();
      const n = segs[(i + d + segs.length) % segs.length];
      setSharing(n.dataset.v); n.focus();
    };
  });

  function send(msg) {
    if (socket && socket.readyState === 1) socket.send(JSON.stringify(msg));
    else if (msg.type === 'crisis') pending.push(msg);
  }

  function connect() {
    if (socket || !hubBase || typeof WebSocket === 'undefined') return;
    let wait = 1000, configs = 0;
    const open = () => {
      try { socket = new WebSocket(hubBase.replace(/^http/, 'ws') + '/ws/app'); } catch { return; }
      socket.onopen = () => {
        wait = 1000;
        socket.send(JSON.stringify({ type: 'hello', device_id: 'patient-view', app_version: 'patient-0.3.0', patient_id: pid, profile: 'live', role: 'patient_view' }));
        while (pending.length) socket.send(JSON.stringify(pending.shift()));
      };
      socket.onmessage = e => {
        let m; try { m = JSON.parse(e.data); } catch { return; }
        if (m.type === 'privacy') applyPrivacy(m.privacy || m);
        if (m.type === 'config' && configs++ > 0) refresh();
        if (m.type === 'demo_reset') refresh();
      };
      socket.onclose = () => { setTimeout(open, wait); wait = Math.min(wait * 2, 10000); };
    };
    open();
  }

  const sheet = $('sheet');
  let lastFocus = null;
  function openCrisis() {
    $('crisisTitle').textContent = CRISIS.title;
    $('crisisText').textContent = CRISIS.text;
    $('contacts').replaceChildren(...CRISIS.contacts.map((c, i) => el('a', { class: 'call' + (i === 0 ? ' first' : ''), href: 'tel:' + c.tel }, [
      el('span', { class: 'ct' }, [el('span', { class: 'cl', text: c.label }), el('span', { class: 'cn af-num', text: c.number })]),
      el('span', { class: 'phone', html: '<svg viewBox="0 0 24 24"><path d="M6.6 4.5h2.6l1.4 3.6-1.8 1.2a10 10 0 0 0 5.9 5.9l1.2-1.8 3.6 1.4v2.6a1.6 1.6 0 0 1-1.6 1.6A14.4 14.4 0 0 1 5 6.1a1.6 1.6 0 0 1 1.6-1.6z"/></svg>' }),
    ])));
    lastFocus = document.activeElement;
    sheet.hidden = false;
    requestAnimationFrame(() => sheet.classList.add('open'));
    sheet.querySelector('.sheetCard').focus?.();
    send({ type: 'crisis', patient_id: pid, source: 'talk_button', t_iso: new Date().toISOString() });
  }
  function closeCrisis() {
    sheet.classList.remove('open');
    setTimeout(() => { sheet.hidden = true; lastFocus?.focus?.(); }, reduced ? 0 : 320);
  }
  $('back').href = 'index.html' + location.search;
  $('talkTop').onclick = openCrisis;
  $('talkRow').onclick = openCrisis;
  sheet.querySelectorAll('[data-close]').forEach(b => b.onclick = closeCrisis);
  addEventListener('keydown', e => { if (e.key === 'Escape' && !sheet.hidden) closeCrisis(); });

  const world = (() => {
    const canvas = $('world'), ctx = canvas.getContext('2d');
    let W = 0, H = 0, dpr = 1, ok = !!(A.World && A.World.draw), warmth = 0.3, dawn = false, last = 0, scroll = 0, sx = 0;
    const V = {
      t: 0, worldX: 0, walking: false, stride: 1,
      chunks: [{ type: 'harbour', x0: -20000, x1: 20000, seed: 2 }],
      sat: { yellow: 0.3, blue: 0.3, green: 0.2, dawn: 0 }, sweep: 0,
      aurora: 0.3, fog: 0.4, fogDrift: 0.6, stars: 160, warm: 0.03, sparkle: 0, daylight: 0,
      flame: 1, lanternRadius: 80, lanternBright: 1, sparks: [], iceGlow: 0.2, stove: 0.4, beam: 0,
      orb: { b: 0, hold: 0, sync: 0, alpha: 0 }, tapHint: 0, flash: 0, exposure: 1, sunP: 0,
      border: 0, borderColor: [255, 217, 160], black: 0,
    };
    const resize = () => {
      dpr = Math.min(devicePixelRatio || 1, 2);
      W = innerWidth; H = innerHeight;
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      frame(true);
    };
    const fallback = () => {
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, token('--af-night-900') || '#070A14');
      g.addColorStop(0.62, token('--af-night-700') || '#131B36');
      g.addColorStop(0.8, token('--af-violet-700') || '#2A2350');
      g.addColorStop(1, token('--af-night-850') || '#0A0E1C');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      const h = ctx.createRadialGradient(W * 0.72, H * 0.62, 0, W * 0.72, H * 0.62, H * 0.4);
      h.addColorStop(0, `rgba(255,201,138,${0.12 + 0.25 * warmth})`); h.addColorStop(1, 'rgba(255,201,138,0)');
      ctx.fillStyle = h; ctx.fillRect(0, 0, W, H);
    };
    function frame(force) {
      if (!W) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      V.worldX = sx;
      if (ok) {
        try { A.World.draw(ctx, Math.round(W * 1.3), Math.round(H * 1.13), V); return; } catch { ok = false; }
      }
      fallback();
    }
    function loop(now) {
      requestAnimationFrame(loop);
      if (document.hidden || now - last < 33) return;
      const dt = Math.min(0.1, (now - last) / 1000); last = now;
      V.t += dt;
      const target = scroll * 0.3, before = sx;
      sx += (target - sx) * (1 - Math.exp(-dt / 0.35));
      V.walking = Math.abs(sx - before) > 0.6;
      V.flame = 1 + 0.06 * Math.sin(V.t * 7.3) + 0.04 * Math.sin(V.t * 11.1);
      frame();
    }
    addEventListener('resize', resize);
    addEventListener('scroll', () => { scroll = scrollY; if (reduced) { sx = scroll * 0.3; frame(); } }, { passive: true });
    resize();
    if (!reduced) requestAnimationFrame(loop);
    A.Art?.load?.('assets/').then(() => frame(true)).catch(() => {});
    return {
      setWarmth(w, reached) {
        warmth = w; dawn = reached;
        const k = Math.max(0, Math.min(1, w));
        Object.assign(V.sat, { yellow: 0.12 + 0.2 * k, blue: 0.3 + 0.15 * k, green: 0.3 + 0.15 * k, dawn: reached ? 0.15 + 0.2 * k : 0.05 });
        V.sunP = reached ? 0.25 + 0.3 * k : 0;
        V.aurora = 0.35 + 0.15 * k;
        V.stars = Math.round(180 - 60 * k);
        V.warm = 0.02 + 0.04 * k;
        frame(true);
      },
    };
  })();

  const scrim = $('scrim');
  const onScroll = () => {
    scrim.style.setProperty('--s', Math.min(1, scrollY / (innerHeight * 0.55)).toFixed(3));
    $('top').classList.toggle('scrolled', scrollY > 24);
  };
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  addEventListener('visibilitychange', () => { if (!document.hidden && source === 'hub') refresh(); });

  const ensureTokens = async () => {
    if (token('--af-night-900')) return;
    for (const href of ['../design/tokens.css', '/design/tokens.css']) {
      const ok = await new Promise(res => {
        const l = el('link', { rel: 'stylesheet', href });
        l.onload = () => res(!!token('--af-night-900')); l.onerror = () => { l.remove(); res(false); };
        document.head.append(l);
      });
      if (ok) return;
    }
  };

  ensureTokens().then(refresh);
})();
