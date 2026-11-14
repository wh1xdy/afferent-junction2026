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
    const n = /^(svg|path|circle|line|rect|defs|linearGradient|radialGradient|stop|g|filter|feGaussianBlur|ellipse|polyline|clipPath)$/.test(tag) ? document.createElementNS(svgNS, tag) : document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'text') n.textContent = v;
      else if (k === 'html') n.innerHTML = v;
      else if (v !== null && v !== undefined && v !== false) n.setAttribute(k, v);
    }
    for (const c of [].concat(kids)) if (c) n.append(c);
    return n;
  };
  const token = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const icon = (paths, cls = '') => `<svg viewBox="0 0 24 24" class="${cls}" aria-hidden="true">${paths}</svg>`;

  const GLYPHS = {
    breath: '<path d="M3.5 9h10a2.5 2.5 0 1 0-2.5-2.5"/><path d="M3.5 13h14a2.5 2.5 0 1 1-2.5 2.5"/><path d="M3.5 17h6"/>',
    fireflies: '<circle cx="6.5" cy="8" r="1.4"/><circle cx="15.5" cy="5.5" r="1.1"/><circle cx="18" cy="13.5" r="1.6"/><circle cx="9.5" cy="16.5" r="1.2"/><path d="M12 10.5v1M11.5 11h1"/>',
    sun: '<path d="M3 17.5h18"/><path d="M7 17.5a5 5 0 0 1 10 0"/><path d="M12 6.5v2.2M5.6 9.6l1.5 1.5M18.4 9.6l-1.5 1.5"/>',
    stars: '<path d="M12 4l1.6 5.4L19 11l-5.4 1.6L12 18l-1.6-5.4L5 11l5.4-1.6z"/>',
    bells: '<path d="M7 16.5V11a5 5 0 0 1 10 0v5.5l1.5 1.5h-13z"/><path d="M10.5 20.5h3"/>',
    beacon: '<path d="M10 20l1-11h2l1 11z"/><path d="M9.5 9h5"/><path d="M15 6.5l5-2M15 8.5l5 1"/>',
    shutters: '<rect x="5" y="4.5" width="14" height="15" rx="1.5"/><path d="M5 9.5h14M5 14.5h14"/>',
    threads: '<path d="M3.5 9c3-3 5 3 8.5 0s5.5-3 8.5 0"/><path d="M3.5 15c3-3 5 3 8.5 0s5.5-3 8.5 0"/>',
    windows: '<path d="M4 10.5L12 4l8 6.5"/><rect x="6" y="10.5" width="12" height="9.5"/><path d="M12 12.5v6M9 15.5h6"/>',
    vihta: '<path d="M15.5 3.5l-4 9"/><path d="M11.5 12.5c-3 0-5.5 2.5-5.5 5.5 3 0 6-1.5 7-4.5z"/><path d="M4 20.5h16"/>',
    birds: '<path d="M3.5 17.5h17"/><path d="M8 17.5c-2-1-2.5-4 0-5.5s5-1 6-3.5c1 1.5 1 3-.5 4.5 2 .5 3 2 3 4.5"/><circle cx="14.5" cy="9" r=".6"/>',
    swans: '<path d="M4 17.5h16"/><path d="M6 15.5c1 1.5 7 1.5 9 0 1-1 0-4-2-3.5s-2-5 1-5.5c1.5-.2 2 1 2.5 1.5"/>',
    faces: '<rect x="3.5" y="5" width="7.5" height="14" rx="1"/><rect x="13" y="5" width="7.5" height="14" rx="1"/><circle cx="16.75" cy="12" r="1.3"/>',
    owls: '<path d="M7 8l1.5-3 2 2h3l2-2L17 8v6a5 5 0 0 1-10 0z"/><circle cx="10" cy="10.5" r="1.3"/><circle cx="14" cy="10.5" r="1.3"/>',
    seals: '<ellipse cx="12" cy="18" rx="7" ry="2"/><path d="M9 17.5c0-5 1-9 3-9s3 4 3 9"/><circle cx="11" cy="11" r=".6"/><circle cx="13" cy="11" r=".6"/>',
    reindeer: '<path d="M8 11h8l1.5 3v5M8 11l-1.5 3v5M8 11V7l-2-3M8 7l2-2.5M16 11V7l2-3M16 7l-2-2.5"/>',
    ferry: '<path d="M3.5 15.5h15l-2 3h-11z"/><path d="M7 15.5v-4h7v4M10 11.5V8"/><path d="M20.5 9v9.5"/>',
    drips: '<path d="M4 4.5h16"/><path d="M7 4.5l1.5 6 1.5-6M14 4.5l1.5 8 1.5-8"/><path d="M15.5 16c-1 1.5-1 3 0 3s1-1.5 0-3z"/>',
    buoys: '<circle cx="6" cy="17" r="2"/><circle cx="12" cy="8" r="2"/><circle cx="18" cy="15" r="2"/><path d="M7.5 15.5l3-6M13.5 9.5l3 4"/>',
    steps: '<ellipse cx="9" cy="16" rx="1.6" ry="2.6"/><ellipse cx="14.5" cy="11" rx="1.6" ry="2.6"/><ellipse cx="10" cy="6" rx="1.6" ry="2.6"/>',
    glance: '<path d="M3.5 18h17"/><path d="M6 16h5l-1 2H7zM13 16h5l-1 2h-3z"/><path d="M8.5 16V9l3 7M15.5 16V8l3 8"/>',
    signpost: '<path d="M12 20.5v-14"/><path d="M6 6.5h10l2.5 2.5L16 11.5H6z"/>',
    runes: '<rect x="3.5" y="6" width="7.5" height="12" rx="1.5"/><rect x="13" y="6" width="7.5" height="12" rx="1.5"/><path d="M6 9v6h3M18 9v6h-3"/>',
    fog: '<circle cx="12" cy="11" r="5"/><path d="M10 13c1 .6 3 .6 4 0"/><path d="M3.5 17.5h17M5.5 20h13"/>',
    loyly: '<path d="M4 19.5h16"/><path d="M8.5 16c-1.5-2 1.5-3.5 0-5.5s1-3 0-5"/><path d="M15.5 16c-1.5-2 1.5-3.5 0-5.5s1-3 0-5"/>',
    dot: '<circle cx="12" cy="12" r="4"/>',
    hourglass: '<path d="M7 3.5h10M7 20.5h10M8 3.5c0 4.5 4 5.5 4 8.5s-4 4-4 8.5M16 3.5c0 4.5-4 5.5-4 8.5s4 4 4 8.5"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    lock: '<rect x="5.5" y="10.5" width="13" height="10" rx="2"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/>',
    pause: '<path d="M9.5 7v10M14.5 7v10"/>',
  };
  const SENSOR_ICONS = {
    phone_camera: '<rect x="3.5" y="6.5" width="12" height="11" rx="2"/><path d="M15.5 10.5l5-3v9l-5-3"/>',
    pulse_stone: '<path d="M12 19.5s-7.5-4.6-7.5-9.7A4.1 4.1 0 0 1 12 7.6a4.1 4.1 0 0 1 7.5 2.2c0 5.1-7.5 9.7-7.5 9.7z"/><path d="M7.5 12h2l1.2-2 1.8 4 1.2-2h2.8"/>',
    bedside_camera: '<circle cx="12" cy="5.5" r="2"/><path d="M5 9.5l7 1.5 7-1.5M12 11v4.5M9 20.5l3-5 3 5"/>',
    bedside_light: '<path d="M8.5 15a5.5 5.5 0 1 1 7 0c-.8.6-1 1.4-1 2.5h-5c0-1.1-.2-1.9-1-2.5z"/><path d="M10 20.5h4"/>',
    phone_presence: '<path d="M4.5 11L12 4.5l7.5 6.5"/><path d="M6.5 9.5v10h11v-10"/><path d="M10.5 19.5v-5h3v5"/>',
    phone_motion: '<path d="M8 4.5c1.7 0 2.5 1.8 2.5 4s-.8 4-2.5 4-2.5-1.8-2.5-4 .8-4 2.5-4z"/><path d="M6.5 15.5h3v1.5a1.5 1.5 0 0 1-3 0z"/><path d="M16 8.5c1.7 0 2.5 1.8 2.5 4s-.8 4-2.5 4-2.5-1.8-2.5-4 .8-4 2.5-4z"/><path d="M14.5 19.5h3V21a1.5 1.5 0 0 1-3 0z"/>',
  };
  const MODE_TONE = { calm: 'tertiary', wake: 'primary', fatigue: 'secondary', rest: 'primary', flow: 'primary' };
  const SHARING_NOTE = {
    nothing_tonight: ['Today stays on this phone.', 'Your clinic only gets a note that today was not shared.', 'Sharing returns tomorrow.'],
    paused: ['Nothing leaves this phone for 7 days.', 'Your clinic only gets a note that sharing is paused.', 'Safety answers from the check-in are still shared.'],
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
    if (src === 'hub') { connect(); A.QRShow?.sync(); }
  }

  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const parseDate = s => { const [y, m, d] = (s || '').split('-').map(Number); return y ? new Date(y, m - 1, d) : new Date(); };
  const isoDay = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const longDate = d => `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
  const clock = h => { const m = Math.round(h * 60); return `${Math.floor(m / 60) % 24}:${String(m % 60).padStart(2, '0')}`; };
  const partOfDay = h => h < 5 ? 'Last night' : h < 12 ? 'This morning' : h < 18 ? 'This afternoon' : 'This evening';
  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

  function render() {
    $('sim').hidden = !view?.simulated;
    const t = view?.today || {};
    renderLifetime();
    renderPause();
    renderWeek();
    renderStrata();
    renderToday(t);
    renderSharing();
    renderSensors();
    $('keptText').textContent = source === 'hub' ? 'Kept on your home hub. Nothing goes to the cloud.' : view ? 'Saved copy on this phone.' : 'Nothing saved on this phone yet.';
    world.set(t);
  }

  function lifetime() {
    const S = A.Streak;
    if (S?.hasData()) { const s = S.summary(); return { n: s.morningsLit, first: s.first }; }
    return { n: view?.mornings_lit ?? (view?.week || []).filter(d => (d.state || (d.played ? 'lit' : '')) === 'lit').length, first: view?.first_lit || view?.since || null };
  }

  function renderLifetime() {
    const { n, first } = lifetime();
    const d = first ? parseDate(first) : null;
    $('lifetime').textContent = !n ? 'Your first layer is waiting.' : `${plural(n, 'morning')} lit${d ? ` since ${d.getDate()} ${MONTHS[d.getMonth()]}` : ''}`;
  }

  function renderPause() {
    const until = A.Streak?.pausedUntil?.() || view?.pause?.until || null;
    $('pauseCard').hidden = !until;
    if (until) $('pauseUntil').textContent = `Until ${longDate(parseDate(until))}`;
  }

  function renderToday(t) {
    const played = !!t.played;
    $('date').textContent = view && source === 'hub' ? longDate(parseDate(view.date)) : view ? 'Saved week' : longDate(new Date());
    $('headline').textContent = !view ? 'The lantern is waiting.' : !played ? 'Today is open.' : t.dawn_reached ? 'You reached dawn.' : 'You rested.';
    $('sub').textContent = !played ? 'The lantern is there whenever you want it.'
      : t.settled && t.lifted ? 'You settled, and the light came back a little.'
      : t.settled ? 'You settled.'
      : t.lifted ? 'The light came back a little.' : '';
    $('sub').hidden = !$('sub').textContent;
    $('arcCap').replaceChildren(played
      ? (t.session_time_h != null ? `${partOfDay(t.session_time_h)} at ${clock(t.session_time_h)}` : '')
      : el('a', { class: 'begin', href: 'index.html' + location.search }, [document.createTextNode('Light the lantern')]));
    drawArc(t);
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
    const W = 340, base = 136, x0 = 14, x1 = W - 14, top = 22;
    const horizon = el('line', { x1: 0, x2: W, y1: base, y2: base, class: 'horizon' });
    if (!t || !t.played || !Array.isArray(t.arc) || t.arc.length < 2) {
      svg.append(horizon, el('circle', { cx: x0, cy: base, r: 5, class: 'unlit' }));
      svg.setAttribute('aria-label', 'No session yet today');
      return;
    }
    const cs = t.colour_start || token('--af-mood-2') || '#5A7CA6', ce = t.colour_end || cs, sun = '#F2C230';
    const arc = t.arc.map(v => Math.max(0, Math.min(1, +v || 0)));
    const pts = arc.map((v, i) => [x0 + i * (x1 - x0) / (arc.length - 1), base - v * (base - top)]);
    const line = smooth(pts), end = pts[pts.length - 1];
    const area = `${line} L${end[0]},${base} L${pts[0][0]},${base} Z`;
    const len = 600;
    svg.append(
      el('defs', {}, [
        el('linearGradient', { id: 'arcStroke', x1: 0, x2: 1, y1: 0, y2: 0 }, [el('stop', { offset: 0, 'stop-color': cs }), el('stop', { offset: 0.65, 'stop-color': ce }), el('stop', { offset: 1, 'stop-color': '#D9A520' })]),
        el('linearGradient', { id: 'arcFill', x1: 0, x2: 0, y1: 0, y2: 1 }, [el('stop', { offset: 0, 'stop-color': sun, 'stop-opacity': 0.22 }), el('stop', { offset: 1, 'stop-color': sun, 'stop-opacity': 0 })]),
        el('radialGradient', { id: 'arcHalo' }, [el('stop', { offset: 0, 'stop-color': sun, 'stop-opacity': 0.55 }), el('stop', { offset: 1, 'stop-color': sun, 'stop-opacity': 0 })]),
      ]),
      el('path', { d: area, fill: 'url(#arcFill)', class: 'arcArea' }),
      horizon,
      el('path', { d: line, class: 'arcLine', stroke: 'url(#arcStroke)', 'stroke-dasharray': len, 'stroke-dashoffset': reduced ? 0 : len, style: `--len:${len}` }),
      el('circle', { cx: pts[0][0], cy: pts[0][1], r: 5, fill: cs, class: 'arcStart' }),
      el('circle', { cx: end[0], cy: end[1], r: 20, fill: 'url(#arcHalo)', class: 'arcEnd' }),
      el('circle', { cx: end[0], cy: end[1], r: 7, fill: sun, class: 'arcEnd' }),
    );
    svg.setAttribute('aria-label', `Today's arc, the light rose from start to end`);
  }

  const STATE_LABEL = { lit: 'Lit', today: 'Open', missed: 'Unlit', frozen: 'Held by frost', rest: 'Rested', future: 'Still to come', none: 'Before your first morning' };
  const mondayOf = k => { const d = parseDate(k); d.setDate(d.getDate() - (d.getDay() + 6) % 7); return d; };
  const legacyState = d => d.state || (d.played ? 'lit' : d.frozen ? 'frozen' : d.today ? 'today' : 'missed');

  function weekData() {
    const S = A.Streak;
    if (S?.hasData()) return S.week();
    const src = view?.week || [];
    const todayKey = view?.date || src[src.length - 1]?.date || isoDay(new Date()), mon = mondayOf(todayKey), by = Object.fromEntries(src.map(d => [d.date, d]));
    return Array.from({ length: 7 }, (_, i) => {
      const dd = new Date(mon); dd.setDate(mon.getDate() + i);
      const k = isoDay(dd), d = by[k];
      if (d) return { ...d, state: legacyState(d), today: k === todayKey || !!d.today };
      return { date: k, state: k > todayKey ? 'future' : k === todayKey ? 'today' : 'none', mood: null, today: k === todayKey };
    });
  }

  const dayLight = d => {
    const fill = d.state === 'lit' ? (d.today ? '#F2C230' : '#FFD58A') : null;
    return el('span', { class: `light s-${d.state}${d.today ? ' today' : ''}`, style: fill ? `--fill:${fill}` : null, 'aria-hidden': 'true' });
  };

  function renderWeek() {
    const days = weekData();
    const lit = days.filter(d => d.state === 'lit').length;
    $('weekCount').textContent = lit ? `${lit} lit so far` : '';
    $('week').replaceChildren(...days.map(d => {
      const dd = parseDate(d.date);
      return el('li', { class: 'day' + (d.today ? ' is-today' : ''), 'aria-label': `${DAYS[dd.getDay()]}${d.today ? ', today' : ''}, ${(STATE_LABEL[d.state] || STATE_LABEL.missed).toLowerCase()}` }, [
        dayLight(d), el('span', { class: 'wd', 'aria-hidden': 'true', text: DAYS[dd.getDay()][0] }),
      ]);
    }));
    $('dayList').replaceChildren(...days.map(d => {
      const dd = parseDate(d.date);
      return el('li', { class: 'li day-row' + (d.today ? ' is-today' : '') }, [
        dayLight(d),
        el('span', { class: 'lt', text: d.today ? 'Today' : DAYS[dd.getDay()] }),
        el('span', { class: 'lv', text: STATE_LABEL[d.state] || STATE_LABEL.missed }),
      ]);
    }));
  }

  function renderStrata() {
    const svg = $('strata');
    const { n } = lifetime();
    const W = 300, A0 = 12, count = Math.min(n || 0, 90), gap = count > 1 ? Math.max(1.1, Math.min(4, 64 / count)) : 0;
    const stack = gap * Math.max(0, count - 1), H = Math.round(stack + A0 * 2 + 14), baseY = H - A0 - 4;
    const wave = y => `M0,${(y + A0 * 0.3).toFixed(1)} C${W * 0.2},${(y - A0 * 0.3).toFixed(1)} ${W * 0.36},${(y + A0 * 0.8).toFixed(1)} ${W * 0.56},${(y + A0 * 0.6).toFixed(1)} S${W * 0.86},${(y - A0 * 0.95).toFixed(1)} ${W},${(y - A0 * 0.8).toFixed(1)}`;
    svg.replaceChildren();
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.style.height = H + 'px';
    svg.setAttribute('aria-label', n ? `${plural(n, 'layer')}, one for each morning lit` : 'No layers yet');
    if (!count) {
      svg.append(el('path', { d: wave(baseY), class: 'ly empty' }));
      return;
    }
    const topY = baseY - stack;
    svg.append(
      el('defs', {}, [el('linearGradient', { id: 'plyFill', x1: 0, x2: 0, y1: 0, y2: 1 }, [el('stop', { offset: 0, 'stop-color': '#F7E9CF' }), el('stop', { offset: 1, 'stop-color': '#EBD3A6' })])]),
      el('path', { d: `${wave(topY)} L${W},${H} L0,${H} Z`, fill: 'url(#plyFill)' }),
      el('path', { d: `${wave(baseY)} L${W},${H + 2} L0,${H + 2} Z`, class: 'ly-cut' }),
    );
    for (let i = 0; i < count; i++) {
      const newest = i === count - 1;
      const cls = newest ? 'ly sun' : (i + 1) % 5 === 0 ? 'ly edge' : 'ly';
      svg.append(el('path', { d: wave(baseY - i * gap), class: cls, style: newest && !reduced ? 'animation: settle 900ms cubic-bezier(0.05,0.7,0.1,1) 300ms both' : null }));
    }
  }

  function renderHelped(items) {
    const ul = $('helped');
    ul.replaceChildren();
    if (!items.length) {
      ul.append(el('li', { class: 'help empty' }, [el('span', { class: 'av tone-secondary', html: icon(GLYPHS.hourglass) }), el('div', {}, [el('p', { class: 'tl', text: 'Still learning' }), el('p', { class: 'tx', text: 'A few more mornings will show what helps you.' })])]));
      return;
    }
    for (const it of items.slice(0, 3)) {
      ul.append(el('li', { class: 'help' }, [
        el('span', { class: `av tone-${MODE_TONE[it.mode] || 'secondary'}`, html: icon(GLYPHS[it.glyph] || GLYPHS[it.task_id] || GLYPHS.dot) }),
        el('div', { class: 'ht' }, [
          el('p', { class: 'tl', text: it.label || it.task_id }),
          el('p', { class: 'tx', text: (it.text || '').replace(/\s*\(still learning\)/i, '') }),
        ]),
        it.confidence === 'low' ? el('span', { class: 'learning', role: 'img', 'aria-label': 'Still learning', title: 'Still learning', html: icon(GLYPHS.hourglass) }) : null,
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
    const ul = $('sees');
    ul.replaceChildren();
    const item = (text, kind) => el('li', { class: kind }, [el('span', { class: 'si', html: icon(kind === 'never' ? GLYPHS.lock : kind === 'soft' ? GLYPHS.dot : GLYPHS.check) }), el('span', { text })]);
    if (privacy.sharing === 'summary') {
      (view?.clinic_sees || []).filter(s => !/^Never/i.test(s)).forEach(s => ul.append(item(s, 'yes')));
    } else {
      const note = [...SHARING_NOTE[privacy.sharing]];
      if (privacy.sharing === 'paused') note[0] = `Nothing leaves this phone until ${longDate(pausedUntil())}.`;
      note.forEach((s, i) => ul.append(item(s, i ? 'soft' : 'yes')));
    }
    ul.append(item((view?.clinic_sees || []).find(s => /^Never/i.test(s)) || NEVER, 'never'));
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
        const sw = el('button', { type: 'button', role: 'switch', class: 'switch', id, 'aria-checked': on, 'aria-labelledby': id + '-l', 'aria-describedby': id + '-d' }, [el('span', { class: 'thumb', html: icon(GLYPHS.check) })]);
        const row = el('li', { class: 'li sensor' + (on ? ' on' : '') }, [
          el('span', { class: 'lic', html: icon(SENSOR_ICONS[s.id] || GLYPHS.dot) }),
          el('div', { class: 'stext' }, [el('p', { class: 'lt', id: id + '-l', text: s.label }), el('p', { class: 'ls', id: id + '-d', text: on ? s.shares : OFF_NOTE })]),
          sw,
        ]);
        row.onclick = () => setSensor(s.id, !(privacy.sensors[s.id] ?? s.on));
        ul.append(row);
      }
      wrap.append(el('p', { class: 'grouplabel', text: title }), ul);
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
        socket.send(JSON.stringify({ type: 'hello', device_id: 'patient-view', app_version: 'patient-0.4.0', patient_id: pid, profile: 'live', role: 'patient_view' }));
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

  const openTalk = () => {
    A.Support.open('talk', { scheme: 'kevat' });
    send({ type: 'crisis', patient_id: pid, source: 'talk_button', t_iso: new Date().toISOString() });
  };
  $('back').href = 'index.html' + location.search;
  $('talkTop').onclick = openTalk;
  $('talkRow').onclick = openTalk;
  A.QRShow?.init({ pid, hub: hubBase, talk: openTalk });

  const TABS = ['today', 'week', 'settings'], TITLES = { today: 'Your mornings', week: 'This week', settings: 'Settings' };
  const setTab = (tab, focus) => {
    if (!TABS.includes(tab)) tab = 'today';
    document.body.dataset.tab = tab;
    document.querySelectorAll('[data-panel]').forEach(p => { p.hidden = p.dataset.panel !== tab; });
    document.querySelectorAll('#nav a').forEach(a => a.dataset.tab === tab ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current'));
    $('barTitle').textContent = TITLES[tab];
    document.title = TITLES[tab];
    scrollTo(0, 0);
    onScroll();
    if (focus) document.querySelector(`[data-panel="${tab}"] h1`)?.focus({ preventScroll: true });
    world.active(tab === 'today');
  };
  document.querySelectorAll('#nav a').forEach(a => a.onclick = e => {
    e.preventDefault();
    history.replaceState(null, '', '#' + a.dataset.tab);
    setTab(a.dataset.tab, true);
  });
  document.querySelectorAll('.panel h1').forEach(h => { h.tabIndex = -1; });

  const world = (() => {
    const canvas = $('world'), ctx = canvas.getContext('2d'), off = document.createElement('canvas'), octx = off.getContext('2d');
    let W = 0, H = 0, VH = 0, dpr = 1, ok = !!(A.World && A.World.draw), last = 0, on = true, raf = 0;
    const V = {
      t: 0, worldX: 0, walking: false, stride: 1,
      chunks: [{ type: 'harbour', x0: -20000, x1: 20000, seed: 2 }],
      sat: { yellow: 1, blue: 1, green: 1, dawn: 1 }, sweep: 1,
      aurora: 0, fog: 0.25, fogDrift: 0.4, stars: 0, warm: 0.04, sparkle: 0, daylight: 0.55,
      flame: 1, lanternRadius: 60, lanternBright: 0.6, sparks: [], iceGlow: 0.1, stove: 0.2, beam: 0,
      orb: { b: 0, hold: 0, sync: 0, alpha: 0 }, tapHint: 0, flash: 0, exposure: 1, sunP: 0.7,
      border: 0, borderColor: [255, 217, 160], black: 0, night: false,
    };
    const resize = () => {
      dpr = Math.min(devicePixelRatio || 1, 2);
      const r = canvas.getBoundingClientRect();
      W = Math.round(r.width); H = Math.round(r.height);
      if (!W || !H) return;
      VH = Math.round(H * 1.72);
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      off.width = canvas.width; off.height = Math.round(VH * dpr);
      frame();
    };
    const fallback = () => {
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#6E8FC4'); g.addColorStop(0.62, '#B4A6CE'); g.addColorStop(1, '#F3D2B4');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    };
    function frame() {
      if (!W) return;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      if (ok) {
        try {
          octx.setTransform(dpr, 0, 0, dpr, 0, 0);
          A.World.draw(octx, W, VH, V);
          const dy = Math.round((VH * 0.82 + 24 - H) * dpr);
          ctx.drawImage(off, 0, dy, off.width, canvas.height, 0, 0, canvas.width, canvas.height);
          return;
        } catch { ok = false; }
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      fallback();
    }
    function loop(now) {
      raf = 0;
      if (!on || reduced) return;
      raf = requestAnimationFrame(loop);
      if (document.hidden || now - last < 33) return;
      const dt = Math.min(0.1, (now - last) / 1000); last = now;
      V.t += dt;
      V.flame = 1 + 0.06 * Math.sin(V.t * 7.3) + 0.04 * Math.sin(V.t * 11.1);
      frame();
    }
    addEventListener('resize', resize);
    resize();
    A.Art?.load?.('assets/').then(() => frame()).catch(() => {});
    return {
      set(t) {
        const k = Math.max(0, Math.min(1, t?.played ? (t.arc?.[t.arc.length - 1] ?? 0.6) : 0.4));
        V.sunP = 0.5 + 0.35 * k;
        V.daylight = 0.45 + 0.25 * k;
        frame();
      },
      active(v) { on = v; if (v && !raf && !reduced) raf = requestAnimationFrame(loop); if (v) resize(); },
    };
  })();

  const onScroll = () => {
    const hero = document.body.dataset.tab === 'today';
    $('bar').classList.toggle('solid', !hero || scrollY > 170);
  };
  addEventListener('scroll', onScroll, { passive: true });

  addEventListener('visibilitychange', () => { if (!document.hidden && source === 'hub') refresh(); });
  addEventListener('hashchange', () => setTab(location.hash.slice(1)));

  setTab(location.hash.slice(1));
  refresh();
})();
