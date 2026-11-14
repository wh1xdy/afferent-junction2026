(() => {
  const C = window.C, V = C.views;
  const qs = new URLSearchParams(location.search);
  const THEME_KEY = 'afferent.clinic.theme';
  const readTheme = () => { try { return localStorage.getItem(THEME_KEY) || 'light'; } catch { return 'light'; } };
  const S = {
    base: (qs.get('hub') || (location.protocol.startsWith('http') ? location.origin : '')).replace(/\/$/, ''),
    fixtures: qs.has('fixtures'),
    list: null, analytics: {}, detail: {}, summary: {}, missing: {}, validation: null,
    ui: { feature: null, filter: 'all', q: '', theme: readTheme() }, route: null, ws: null, stamp: '',
  };
  C.state = S;
  const FX = '/contracts/fixtures/';
  const $ = (s, r = document) => r.querySelector(s);
  const view = $('#view');
  const touchStamp = () => { S.stamp = V.fmt.stampOf(new Date()); $('#stamp-t').textContent = 'Export of ' + S.stamp; };

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
      const p = { list: '/api/patients', analytics: `/api/patients/${id}/analytics`, detail: `/api/patients/${id}`, summary: `/api/patients/${id}/summary`, validation: '/api/validation' }[kind];
      return getJSON(p, kind === 'summary' ? 25000 : 6000);
    }
    if (kind === 'list') return getJSON(FX + 'patients_list.json');
    if (kind === 'validation') return getJSON(FX + 'validation_example.json');
    if (id !== 'anna') throw Object.assign(new Error('fixture'), { fixture: true });
    if (kind === 'analytics') return getJSON(FX + 'analytics_anna.json');
    if (kind === 'summary') return getJSON(FX + 'summary_example.json');
    if (kind === 'detail') {
      const d = await getJSON(FX + 'daily_example.json');
      return { patient: { id: 'anna', display_name: 'Anna', simulated: true, tms_end_date: '2026-09-20' }, privacy: null, sessions: [], daily: [d], checkins: [], phq: null };
    }
  }

  function toast(html) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML = html;
    $('#toasts').appendChild(el);
    requestAnimationFrame(() => el.classList.add('in'));
    setTimeout(() => { el.classList.remove('in'); setTimeout(() => el.remove(), 400); }, 5200);
  }

  function parseRoute() {
    const h = location.hash.replace(/^#\/?/, '');
    if (h.startsWith('p/')) return { name: 'patients', id: decodeURIComponent(h.slice(2)), explicit: true };
    if (h.startsWith('codes/')) return { name: 'code', id: decodeURIComponent(h.slice(6)) };
    for (const n of ['validation', 'exports', 'settings']) if (h.startsWith(n)) return { name: n };
    return { name: 'patients', id: null, explicit: false };
  }

  const selectedId = () => S.route.id || (S.list ? V.visible(S)[0]?.id || V.sorted(S.list)[0]?.id : null);

  function setNav() {
    document.querySelectorAll('.dest').forEach((a) => (a.dataset.tab === (S.route.name === 'code' ? 'exports' : S.route.name) ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
    document.body.dataset.route = S.route.name === 'patients' ? (S.route.explicit ? 'detail' : 'list') : S.route.name;
    if (S.list) $('#global-sim').hidden = !S.list.simulated;
    $('#search-wrap').hidden = S.route.name !== 'patients';
  }

  function renderList() {
    const pane = $('#list-pane');
    if (!pane) return;
    const y = pane.scrollTop;
    pane.innerHTML = V.list(S, selectedId());
    pane.scrollTop = y;
  }

  function renderDetail(keep = true) {
    const pane = $('#detail-pane');
    if (!pane) return;
    const y = pane.scrollTop;
    const id = selectedId();
    pane.innerHTML = V.detail(S, id);
    if (keep) pane.scrollTop = y;
    V.drawDetail(S, id);
  }

  function render() {
    setNav();
    const r = S.route;
    if (r.name === 'patients') {
      if (!$('#list-pane')) view.innerHTML = V.patients(S, selectedId());
      renderList();
      renderDetail();
    } else if (r.name === 'validation') { view.innerHTML = V.validation(S); V.drawValidation(S); }
    else if (r.name === 'exports') view.innerHTML = V.exports(S);
    else if (r.name === 'settings') view.innerHTML = V.settings(S);
    else if (r.name === 'code') { view.innerHTML = V.imported(S, r.id); V.drawImported(S, r.id); }
  }
  C.rerender = render;

  async function loadDetail(id) {
    if (!id) return;
    const tasks = [
      api('analytics', id).then((a) => (S.analytics[id] = a)),
      api('detail', id).then((d) => (S.detail[id] = d)).catch(() => {}),
    ];
    try {
      await Promise.all(tasks);
      delete S.missing[id];
    } catch (e) {
      S.missing[id] = e.fixture ? 'Fixture mode has data for Anna only. Start the hub for every patient.' : 'Could not load this patient from the hub.';
    }
  }

  let lastSel = null;
  async function navigate() {
    const prev = S.route;
    S.route = parseRoute();
    C.tipHide();
    closeDialog();
    if (prev?.name !== S.route.name) view.innerHTML = '';
    const id = S.route.name === 'patients' ? selectedId() : null;
    if (id !== lastSel) S.ui.feature = null;
    render();
    if (id !== lastSel) { const p = $('#detail-pane'); if (p) p.scrollTop = 0; }
    lastSel = id;
    if (S.route.name === 'patients' && id) {
      if (!S.analytics[id]) await loadDetail(id);
      else loadDetail(id).then(() => selectedId() === id && renderDetail());
      if (S.route.name === 'patients' && selectedId() === id) renderDetail();
    } else if (S.route.name === 'validation') {
      try { S.validation = await api('validation'); } catch { S.validation = await getJSON(FX + 'validation_example.json').catch(() => null); }
      if (S.route.name === 'validation') render();
      if (S.validation?.status === 'computing') setTimeout(() => S.route.name === 'validation' && navigate(), 4000);
    }
  }

  function refreshDetail(id) {
    if (S.fixtures || !S.detail[id]) return;
    api('detail', id).then((d) => {
      S.detail[id] = d;
      if (S.route.name === 'patients' && selectedId() === id) renderDetail();
    }).catch(() => {});
  }

  const flashRow = (id) => view.querySelector(`.prow[data-id="${CSS.escape(id)}"]`)?.classList.add('flash');

  function onAnalytics(m) {
    const id = m.patient_id;
    const prevRow = S.list?.patients.find((p) => p.id === id);
    const prevState = prevRow?.state ?? S.analytics[id]?.state;
    if (m.analytics) S.analytics[id] = m.analytics;
    if (m.row && S.list) {
      const i = S.list.patients.findIndex((p) => p.id === id);
      if (i >= 0) S.list.patients[i] = { ...m.row, flags: m.row.flags ?? S.list.patients[i].flags };
      else S.list.patients.push(m.row);
    }
    touchStamp();
    const row = m.row || prevRow;
    if (S.route.name === 'patients') {
      renderList();
      flashRow(id);
      if (selectedId() === id) renderDetail();
    }
    if (row && prevState && row.state !== prevState) toast(`<b>${C.esc(row.display_name)}</b>&nbsp;is now ${C.esc(V.chip(row.state))}`);
  }

  function onMessage(m) {
    switch (m.type) {
      case 'hello':
        if (m.patients && S.list) { S.list.patients = m.patients; if (m.now_day != null) S.list.now_day = m.now_day; touchStamp(); if (S.route.name === 'patients') renderList(); }
        break;
      case 'session_started': {
        const row = S.list?.patients.find((p) => p.id === m.patient_id);
        if (row) row.live_now = true;
        break;
      }
      case 'session_interrupted':
      case 'session_added': {
        const row = S.list?.patients.find((p) => p.id === m.patient_id);
        if (row) row.live_now = false;
        refreshDetail(m.patient_id);
        break;
      }
      case 'daily_added':
      case 'checkin_added':
        refreshDetail(m.patient_id);
        break;
      case 'analytics_updated':
        onAnalytics(m);
        break;
      case 'crisis_flag': {
        const row = S.list?.patients.find((p) => p.id === m.patient_id);
        if (!row) break;
        const type = m.flag_type || 'talk_request';
        row.flags = C.sortFlags([{ type, t_iso: m.t_iso, source: m.source, label: m.label, checkin_id: m.checkin_id, screen: m.screen }, ...(row.flags || [])]);
        if (S.route.name === 'patients') { renderList(); flashRow(row.id); if (selectedId() === row.id) renderDetail(); }
        toast(`<b>${C.esc(row.display_name)}</b>&nbsp;${C.esc(C.flagText(type, 'toast'))}`);
        if (C.isSafety(type)) refreshDetail(row.id);
        break;
      }
      case 'privacy':
        if (S.detail[m.patient_id]) { S.detail[m.patient_id].privacy = m.privacy; if (S.route.name === 'patients' && selectedId() === m.patient_id) renderDetail(); }
        break;
      case 'demo_reset':
        S.analytics = {}; S.detail = {}; S.summary = {};
        boot(true);
        break;
    }
  }

  let backoff = 1000, pingT;
  function connect() {
    if (S.fixtures || !S.base) return;
    let ws;
    try { ws = new WebSocket(S.base.replace(/^http/, 'ws') + '/ws/clinic'); } catch { return retry(); }
    S.ws = ws;
    ws.onopen = () => {
      backoff = 1000;
      clearInterval(pingT);
      pingT = setInterval(() => ws.readyState === 1 && ws.send('{"type":"ping"}'), 20000);
    };
    ws.onmessage = (e) => { try { onMessage(JSON.parse(e.data)); } catch (err) { console.error(err); } };
    ws.onclose = () => { clearInterval(pingT); retry(); };
  }
  function retry() { setTimeout(connect, backoff); backoff = Math.min(10000, backoff * 2); }

  const scrim = $('#scrim'), dialog = $('#dialog');
  let dialogFor = null, dialogReturn = null;
  function openDialog(html, forId) {
    dialogReturn = document.activeElement;
    dialogFor = forId;
    dialog.innerHTML = html;
    scrim.hidden = false;
    dialog.hidden = false;
    (dialog.querySelector('.btn.filled') || dialog.querySelector('button'))?.focus();
  }
  function closeDialog() {
    if (dialog.hidden) return;
    dialog.hidden = true;
    scrim.hidden = true;
    dialogFor = null;
    dialogReturn?.focus?.();
  }
  scrim.addEventListener('click', closeDialog);

  async function openSummary(id, refresh) {
    const name = S.list?.patients.find((p) => p.id === id)?.display_name || id;
    if (!refresh && S.summary[id]) return openDialog(V.summaryDialog(S.summary[id], name), id);
    openDialog(V.summaryDialog(null, name), id);
    try {
      S.summary[id] = S.fixtures ? await api('summary', id) : await getJSON(`/api/patients/${id}/summary${refresh ? '?refresh=1' : ''}`, 30000);
    } catch { S.summary[id] = S.summary[id] || { text: 'Could not write the summary. Try again.', numbers: {}, week_start_day: '-', week_end_day: '-' }; }
    if (dialogFor === id) dialog.innerHTML = V.summaryDialog(S.summary[id], name);
  }

  function setTheme(t) {
    S.ui.theme = t;
    try { localStorage.setItem(THEME_KEY, t); } catch {}
    const eff = t === 'system' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : t;
    document.documentElement.dataset.theme = eff;
    render();
  }
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => S.ui.theme === 'system' && setTheme('system'));

  async function sendProfile(profile, label) {
    closeMenu();
    if (S.fixtures) return toast('Fixture mode: no phone connected');
    try {
      const r = await post('/api/demo/profile', { profile, patient_id: 'anna' });
      toast(r.sent_to ? `Profile <b>&nbsp;${C.esc(label)}&nbsp;</b> sent to Anna's phone` : 'No phone connected for Anna');
    } catch { toast('Could not reach the hub'); }
  }

  document.addEventListener('click', async (e) => {
    const f = e.target.closest('[data-feature]');
    if (f && S.route.name === 'patients') {
      const k = f.dataset.feature || null;
      S.ui.feature = S.ui.feature === k ? null : k;
      renderDetail();
      return;
    }
    const fl = e.target.closest('[data-filter]');
    if (fl) {
      S.ui.filter = fl.dataset.filter;
      renderList();
      if (!S.route.explicit) { const id = selectedId(); if (id !== lastSel) { lastSel = id; S.ui.feature = null; if (!S.analytics[id]) await loadDetail(id); renderDetail(false); } }
      return;
    }
    const th = e.target.closest('[data-theme-set]');
    if (th) return setTheme(th.dataset.themeSet);
    const pr = e.target.closest('[data-profile]');
    if (pr) return sendProfile(pr.dataset.profile, pr.textContent.trim());
    const a = e.target.closest('[data-action]');
    if (!a) {
      if (!e.target.closest('.menu-wrap')) closeMenu();
      return;
    }
    const act = a.dataset.action;
    if (act === 'clear-flags') {
      const id = a.dataset.id;
      if (!S.fixtures) await post(`/api/patients/${id}/flags/clear`).catch(() => {});
      const row = S.list?.patients.find((p) => p.id === id);
      if (row) row.flags = [];
      render();
    } else if (act === 'summary') {
      openSummary(selectedId());
    } else if (act === 'refresh-summary' && dialogFor) {
      openSummary(dialogFor, true);
    } else if (act === 'close-dialog') {
      closeDialog();
    } else if (act === 'reset') {
      closeMenu();
      if (S.fixtures) return toast('Fixture mode: nothing to reset');
      if (!confirm('Reset all demo data to the seeded patients?')) return;
      await post('/api/demo/reset', {}).catch(() => toast('Reset failed'));
    }
  });

  const menuBtn = $('#menu-btn'), menu = $('#menu');
  function closeMenu() { menu.hidden = true; menuBtn.setAttribute('aria-expanded', 'false'); }
  menuBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    menu.hidden = !menu.hidden;
    menuBtn.setAttribute('aria-expanded', String(!menu.hidden));
    if (!menu.hidden) menu.querySelector('button')?.focus();
  });

  $('#search').addEventListener('input', (e) => {
    S.ui.q = e.target.value;
    if (S.route.name !== 'patients') return;
    renderList();
  });

  document.addEventListener('mouseover', (e) => {
    const t = e.target.closest('[data-tip]');
    if (!t) return;
    const r = t.getBoundingClientRect();
    C.tipShow(`<div>${C.esc(t.dataset.tip)}</div>`, r.right, r.top + r.height / 2);
    t.addEventListener('mouseleave', C.tipHide, { once: true });
  });
  document.addEventListener('focusin', (e) => {
    const t = e.target.closest?.('.info[data-tip]');
    if (!t) return;
    const r = t.getBoundingClientRect();
    C.tipShow(`<div>${C.esc(t.dataset.tip)}</div>`, r.right, r.top + r.height / 2);
    t.addEventListener('blur', C.tipHide, { once: true });
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (!dialog.hidden) return closeDialog();
      if (!menu.hidden) return closeMenu();
      C.tipHide();
    }
    if (S.route.name === 'patients' && (e.key === 'ArrowDown' || e.key === 'ArrowUp') && !e.target.closest('input, .dialog, .scan') && S.list) {
      const rows = V.visible(S);
      const i = rows.findIndex((r) => r.id === selectedId());
      const n = rows[Math.max(0, Math.min(rows.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))];
      if (n && n.id !== selectedId()) { e.preventDefault(); location.hash = '#/p/' + encodeURIComponent(n.id); }
    }
  });

  let rz;
  window.addEventListener('resize', () => {
    clearTimeout(rz);
    rz = setTimeout(() => {
      if (S.route.name === 'patients') V.drawDetail(S, selectedId());
      if (S.route.name === 'validation') V.drawValidation(S);
      if (S.route.name === 'code') V.drawImported(S, S.route.id);
    }, 120);
  });

  async function boot(reset) {
    S.route = parseRoute();
    await C.codes?.ready;
    if (!S.fixtures && S.base) {
      try { await getJSON('/api/health', 3000); } catch { S.fixtures = true; }
    } else if (!S.base) S.fixtures = true;
    try { S.list = await api('list'); } catch { S.fixtures = true; S.list = await getJSON(FX + 'patients_list.json').catch(() => null); }
    touchStamp();
    lastSel = null;
    view.innerHTML = '';
    await navigate();
    if (!reset) connect();
  }

  window.addEventListener('hashchange', navigate);
  boot();
})();
