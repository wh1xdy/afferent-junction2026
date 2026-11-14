(() => {
  const C = window.C, V = C.views;
  const qs = new URLSearchParams(location.search);
  const S = {
    base: (qs.get('hub') || (location.protocol.startsWith('http') ? location.origin : '')).replace(/\/$/, ''),
    fixtures: qs.has('fixtures'),
    list: null, analytics: {}, detail: {}, summary: {}, missing: {}, validation: null, bedside: null,
    live: {}, pose: {}, ui: { feature: null }, route: null, ws: null,
  };
  C.state = S;
  const FX = '/contracts/fixtures/';
  const $ = (s, r = document) => r.querySelector(s);
  const view = $('#view');

  async function getJSON(path, timeout = 6000) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), timeout);
    try {
      const r = await fetch(S.base + path, { signal: ctl.signal, cache: 'no-store' });
      if (r.status === 202) return { status: 'computing' };
      if (!r.ok) throw new Error(path + ' ' + r.status);
      return await r.json();
    } finally {
      clearTimeout(t);
    }
  }
  const post = (path, body) => fetch(S.base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) }).then((r) => r.json());

  async function api(kind, id) {
    if (!S.fixtures) {
      const p = { list: '/api/patients', analytics: `/api/patients/${id}/analytics`, detail: `/api/patients/${id}`, summary: `/api/patients/${id}/summary`, validation: '/api/validation', bedside: '/api/bedside/state' }[kind];
      return getJSON(p, kind === 'summary' ? 25000 : 6000);
    }
    if (kind === 'list') return getJSON(FX + 'patients_list.json');
    if (kind === 'validation') return getJSON(FX + 'validation_example.json');
    if (kind === 'bedside') return null;
    if (id !== 'anna') throw Object.assign(new Error('fixture'), { fixture: true });
    if (kind === 'analytics') return getJSON(FX + 'analytics_anna.json');
    if (kind === 'summary') return getJSON(FX + 'summary_example.json');
    if (kind === 'detail') {
      const d = await getJSON(FX + 'daily_example.json');
      return { patient: { id: 'anna', display_name: 'Anna', simulated: true, tms_end_date: '2026-09-20' }, privacy: null, sessions: [], daily: [d] };
    }
  }

  function setConn(state, label) {
    const el = $('#conn');
    el.dataset.state = state;
    el.lastChild.textContent = label;
  }

  function toast(html, state) {
    const el = document.createElement('div');
    el.className = 'toast';
    if (state) el.dataset.state = state;
    el.innerHTML = html;
    $('#toasts').appendChild(el);
    requestAnimationFrame(() => el.classList.add('in'));
    setTimeout(() => { el.classList.remove('in'); setTimeout(() => el.remove(), 500); }, 5200);
  }

  function parseRoute() {
    const h = location.hash.replace(/^#\/?/, '');
    if (h.startsWith('p/')) return { name: 'detail', id: decodeURIComponent(h.slice(2)) };
    if (h.startsWith('validation')) return { name: 'validation' };
    return { name: 'list' };
  }

  function render(opts = {}) {
    const r = S.route;
    document.querySelectorAll('.tabs a').forEach((a) => a.setAttribute('aria-current', String(a.dataset.tab === (r.name === 'validation' ? 'validation' : 'patients'))));
    if (S.list) {
      $('#today').textContent = V.fmt.dateShort(S.list.date) + ' · day ' + S.list.now_day;
      $('#global-sim').hidden = !S.list.simulated;
    }
    const y = window.scrollY;
    if (r.name === 'list') view.innerHTML = V.list(S);
    else if (r.name === 'validation') { view.innerHTML = V.validation(S); V.drawValidation(S); }
    else {
      view.innerHTML = V.detail(S, r.id);
      V.drawTimeline(S, r.id, { pulse: opts.pulse });
      renderLive(r.id);
    }
    if (opts.keepScroll) window.scrollTo(0, y);
  }

  function renderLive(id) {
    const body = $('#live-body');
    if (!body) return;
    const out = V.live(S, id);
    $('#live-status').innerHTML = out.status;
    body.innerHTML = out.body;
  }

  async function loadDetail(id) {
    const tasks = [
      api('analytics', id).then((a) => (S.analytics[id] = a)),
      api('detail', id).then((d) => (S.detail[id] = d)).catch(() => {}),
      api('summary', id).then((s) => { S.summary[id] = s; if (S.route.name === 'detail' && S.route.id === id) render({ keepScroll: true }); }).catch(() => {}),
    ];
    try {
      await Promise.all(tasks.slice(0, 2));
    } catch (e) {
      S.missing[id] = e.fixture ? 'Fixture mode has analytics for Anna only. Start the hub for every patient.' : 'Could not load this patient from the hub.';
    }
  }

  async function navigate() {
    S.route = parseRoute();
    C.tipHide();
    if (S.route.name !== 'detail') S.ui.feature = null;
    render();
    window.scrollTo(0, 0);
    if (S.route.name === 'detail') {
      await loadDetail(S.route.id);
      if (S.route.name === 'detail') render({ keepScroll: true });
    } else if (S.route.name === 'validation') {
      try { S.validation = await api('validation'); } catch { S.validation = await getJSON(FX + 'validation_example.json').catch(() => null); }
      if (S.route.name === 'validation') render();
      if (S.validation?.status === 'computing') setTimeout(() => S.route.name === 'validation' && navigate(), 4000);
    }
  }

  const LIVE_TYPES = new Set(['live', 'mode', 'game', 'task_end', 'core_trial', 'mood']);
  function onLiveMsg(m) {
    const id = m.patient_id;
    const L = (S.live[id] = S.live[id] || { trace: [] });
    L.active = true;
    L.at = Date.now();
    if (m.type === 'live') {
      Object.assign(L, {
        phase: m.phase, mode: m.mode ?? L.mode, task_id: m.task_id, pulse_bpm: m.pulse_bpm, pulse_source: m.pulse_source,
        eye_openness: m.eye_openness, perclos: m.perclos, head_pitch_deg: m.head_pitch_deg, face_tracked: m.face_tracked, simulated: m.simulated,
      });
      L.trace.push(m.pulse_bpm ?? null);
      if (L.trace.length > 120) L.trace.shift();
    } else if (m.type === 'mode') L.mode = m.mode;
    else if (m.type === 'game') L.task_id = m.id;
    const row = S.list?.patients.find((p) => p.id === id);
    if (row && !row.live_now) { row.live_now = true; if (S.route.name === 'list') patchRow(row); }
    if (S.route.name === 'detail' && S.route.id === id) renderLive(id);
  }

  function patchRow(row, flash) {
    const old = view.querySelector(`.prow[data-id="${CSS.escape(row.id)}"]`);
    if (!old) return;
    const fresh = document.createElement('div');
    fresh.innerHTML = V.row(row, S.list);
    const el = fresh.firstElementChild;
    if (flash) el.classList.add('flash');
    old.replaceWith(el);
  }

  function flipList(update) {
    const before = new Map([...view.querySelectorAll('.prow')].map((e) => [e.dataset.id, e.getBoundingClientRect().top]));
    update();
    view.querySelectorAll('.prow').forEach((e) => {
      const b = before.get(e.dataset.id);
      if (b == null) return;
      const dy = b - e.getBoundingClientRect().top;
      if (!dy) return;
      e.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], { duration: 800, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' });
    });
  }

  function refreshDetail(id) {
    if (S.fixtures || !S.detail[id]) return;
    api('detail', id).then((d) => {
      S.detail[id] = d;
      const wait = Math.max(0, 1700 - (Date.now() - (S.pulseAt || 0)));
      setTimeout(() => S.route.name === 'detail' && S.route.id === id && render({ keepScroll: true }), wait);
    }).catch(() => {});
  }

  function onAnalytics(m) {
    const id = m.patient_id;
    const prevA = S.analytics[id];
    const prevRow = S.list?.patients.find((p) => p.id === id);
    const prevState = prevRow?.state ?? prevA?.state;
    const prevComp = prevRow?.composite ?? prevA?.composite?.value;
    if (m.analytics) S.analytics[id] = m.analytics;
    if (m.row && S.list) {
      const i = S.list.patients.findIndex((p) => p.id === id);
      if (i >= 0) S.list.patients[i] = { ...m.row, flags: m.row.flags ?? S.list.patients[i].flags };
      else S.list.patients.push(m.row);
    }
    const row = m.row || prevRow;
    const changed = row && prevState && row.state !== prevState;
    if (S.route.name === 'list') {
      flipList(() => render({ keepScroll: true }));
      const el = view.querySelector(`.prow[data-id="${CSS.escape(id)}"]`);
      if (el) { el.classList.add('flash'); if (changed) el.classList.add('state-changed'); }
    } else if (S.route.name === 'detail' && S.route.id === id) {
      S.pulseAt = Date.now();
      render({ keepScroll: true, pulse: true });
      tween(view.querySelector('[data-k="composite"]'), prevComp, S.analytics[id]?.composite?.value, 2);
      if (changed) view.querySelector('.status')?.classList.add('state-changed');
      api('summary', id).then((s) => { S.summary[id] = s; }).catch(() => {});
    }
    if (row && prevComp != null && m.row && (changed || Math.abs((row.composite ?? 0) - prevComp) >= 0.005)) {
      toast(`<b>${C.esc(row.display_name)}</b> updated · index ${V.fmt.num(prevComp)} → ${V.fmt.num(row.composite)}${changed ? ` · now ${V.chip(row.state)}` : ''}`, row.state);
    }
  }

  function tween(el, from, to, d) {
    if (!el || from == null || to == null || from === to || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const t0 = performance.now(), dur = 800;
    el.classList.add('pulse-num');
    const step = (t) => {
      const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      el.textContent = V.fmt.num(from + (to - from) * e, d);
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  function onMessage(m) {
    switch (m.type) {
      case 'hello':
        if (m.patients && S.list) { S.list.patients = m.patients; if (m.now_day != null) S.list.now_day = m.now_day; if (S.route.name === 'list') render({ keepScroll: true }); }
        break;
      case 'session_started': {
        S.live[m.patient_id] = { active: true, trace: [], at: Date.now(), profile: m.profile, simulated: m.simulated, session_id: m.session_id };
        const row = S.list?.patients.find((p) => p.id === m.patient_id);
        if (row) { row.live_now = true; if (S.route.name === 'list') patchRow(row, true); }
        if (S.route.name === 'detail' && S.route.id === m.patient_id) renderLive(m.patient_id);
        toast(`<b>${C.esc(row?.display_name || m.patient_id)}</b> started a session${m.profile && m.profile !== 'live' ? ` · ${C.esc(m.profile.replace('_', ' '))}` : ''}`);
        break;
      }
      case 'session_interrupted':
      case 'session_added': {
        const L = S.live[m.patient_id];
        if (L) { L.active = false; L.endedAt = Date.now(); L.interrupted = m.type === 'session_interrupted'; }
        refreshDetail(m.patient_id);
        const row = S.list?.patients.find((p) => p.id === m.patient_id);
        if (row) row.live_now = false;
        if (S.route.name === 'detail' && S.route.id === m.patient_id) renderLive(m.patient_id);
        break;
      }
      case 'daily_added':
        refreshDetail(m.patient_id);
        break;
      case 'analytics_updated':
        onAnalytics(m);
        break;
      case 'bedside_state': {
        const { type, ...b } = m;
        S.bedside = b;
        if (S.route.name === 'detail') renderLive(S.route.id);
        break;
      }
      case 'pose':
        S.pose[m.patient_id] = { ...m, at: Date.now() };
        if (S.route.name === 'detail' && S.route.id === m.patient_id) renderLive(m.patient_id);
        break;
      case 'talk_request':
      case 'low_mood_twice':
      case 'crisis_flag': {
        const row = S.list?.patients.find((p) => p.id === m.patient_id);
        if (row) {
          const type = m.type !== 'crisis_flag' ? m.type : m.flag_type || (m.source === 'mood' ? 'low_mood_twice' : 'talk_request');
          row.flags = [{ type, t_iso: m.t_iso, source: m.source }, ...(row.flags || [])];
          render({ keepScroll: true });
          toast(`<b>${C.esc(row.display_name)}</b> ${type === 'low_mood_twice' ? 'chose the dimmest lantern twice' : 'tapped “Talk to someone”'}`, 'booster');
        }
        break;
      }
      case 'privacy':
        if (S.detail[m.patient_id]) { S.detail[m.patient_id].privacy = m.privacy; if (S.route.name === 'detail' && S.route.id === m.patient_id) render({ keepScroll: true }); }
        break;
      case 'demo_reset':
        S.analytics = {}; S.detail = {}; S.summary = {}; S.live = {}; S.pose = {};
        boot(true);
        break;
      default:
        if (LIVE_TYPES.has(m.type)) onLiveMsg(m);
    }
  }

  let backoff = 1000, pingT;
  function connect() {
    if (S.fixtures || !S.base) return;
    const url = S.base.replace(/^http/, 'ws') + '/ws/clinic';
    let ws;
    try { ws = new WebSocket(url); } catch { return retry(); }
    S.ws = ws;
    ws.onopen = () => {
      backoff = 1000;
      setConn('live', 'Live');
      clearInterval(pingT);
      pingT = setInterval(() => ws.readyState === 1 && ws.send('{"type":"ping"}'), 20000);
    };
    ws.onmessage = (e) => { try { onMessage(JSON.parse(e.data)); } catch (err) { console.error(err); } };
    ws.onclose = () => { clearInterval(pingT); setConn('reconnecting', 'Reconnecting'); retry(); };
  }
  function retry() { setTimeout(connect, backoff); backoff = Math.min(10000, backoff * 2); }

  setInterval(() => {
    for (const [id, L] of Object.entries(S.live)) {
      if (L.active && Date.now() - L.at > 15000) {
        L.active = false;
        const row = S.list?.patients.find((p) => p.id === id);
        if (row) row.live_now = false;
        if (S.route.name === 'detail' && S.route.id === id) renderLive(id);
      }
    }
  }, 3000);

  document.addEventListener('click', async (e) => {
    const f = e.target.closest('[data-feature]');
    if (f && S.route.name === 'detail') {
      const k = f.dataset.feature || null;
      S.ui.feature = S.ui.feature === k ? null : k;
      render({ keepScroll: true });
      return;
    }
    const a = e.target.closest('[data-action]');
    if (!a) {
      if (!e.target.closest('.demo-menu')) closeDemo();
      return;
    }
    const act = a.dataset.action;
    if (act === 'clear-flags') {
      const id = a.dataset.id;
      if (!S.fixtures) await post(`/api/patients/${id}/flags/clear`).catch(() => {});
      const row = S.list?.patients.find((p) => p.id === id);
      if (row) row.flags = [];
      render({ keepScroll: true });
    } else if (act === 'refresh-summary' && S.route.name === 'detail') {
      const id = S.route.id;
      a.disabled = true;
      a.textContent = 'Writing';
      try {
        S.summary[id] = S.fixtures ? S.summary[id] : await getJSON(`/api/patients/${id}/summary?refresh=1`, 30000);
      } catch {}
      render({ keepScroll: true });
    } else if (act === 'reset') {
      closeDemo();
      if (S.fixtures) return toast('Fixture mode: nothing to reset');
      if (!confirm('Reset all demo data to the seeded roster?')) return;
      await post('/api/demo/reset', {}).catch(() => toast('Reset failed'));
    }
  });

  const demoBtn = $('#demo-btn'), demoPop = $('#demo-pop');
  function closeDemo() { demoPop.hidden = true; demoBtn.setAttribute('aria-expanded', 'false'); }
  demoBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    demoPop.hidden = !demoPop.hidden;
    demoBtn.setAttribute('aria-expanded', String(!demoPop.hidden));
  });
  demoPop.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-profile]');
    if (!b) return;
    closeDemo();
    if (S.fixtures) return toast('Fixture mode: no phone connected');
    try {
      const r = await post('/api/demo/profile', { profile: b.dataset.profile, patient_id: 'anna' });
      toast(r.sent_to ? `Profile <b>${C.esc(b.textContent)}</b> sent to Anna's phone` : 'No phone connected for Anna');
    } catch { toast('Could not reach the hub'); }
  });

  document.addEventListener('mouseover', (e) => {
    const t = e.target.closest('[data-tip]');
    if (!t) return;
    const r = t.getBoundingClientRect();
    C.tipShow(`<div class="tip-text">${C.esc(t.dataset.tip)}</div>`, r.right, r.top + r.height / 2);
    t.addEventListener('mouseleave', C.tipHide, { once: true });
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { closeDemo(); if (S.route.name === 'detail') location.hash = '#/'; }
  });

  let rz;
  window.addEventListener('resize', () => {
    clearTimeout(rz);
    rz = setTimeout(() => {
      if (S.route.name === 'detail') V.drawTimeline(S, S.route.id);
      if (S.route.name === 'validation') V.drawValidation(S);
    }, 120);
  });

  async function boot(reset) {
    S.route = parseRoute();
    if (!S.fixtures && S.base) {
      try { await getJSON('/api/health', 3000); } catch { S.fixtures = true; }
    } else if (!S.base) S.fixtures = true;
    if (S.fixtures) setConn('offline', 'Fixtures, offline');
    try { S.list = await api('list'); } catch { S.fixtures = true; setConn('offline', 'Fixtures, offline'); S.list = await getJSON(FX + 'patients_list.json').catch(() => null); }
    try { S.bedside = await api('bedside'); } catch {}
    await navigate();
    if (!reset) connect();
  }

  window.addEventListener('hashchange', navigate);
  boot();
})();
