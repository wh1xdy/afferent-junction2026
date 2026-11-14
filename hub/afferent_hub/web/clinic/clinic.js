(() => {
  const C = window.C, V = C.views;
  const qs = new URLSearchParams(location.search);
  const THEME_KEY = 'afferent.clinic.theme';
  const readTheme = () => { try { return localStorage.getItem(THEME_KEY) || 'light'; } catch { return 'light'; } };
  const S = {
    base: (qs.get('hub') || (location.protocol.startsWith('http') ? location.origin : '')).replace(/\/$/, ''),
    validation: null,
    ui: { q: '', theme: readTheme() }, route: null,
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

  function parseRoute() {
    const h = location.hash.replace(/^#\/?/, '');
    if (h.startsWith('e/')) return { name: 'patients', id: decodeURIComponent(h.slice(2)), explicit: true };
    if (h.startsWith('codes/')) return { name: 'patients', id: decodeURIComponent(h.slice(6)), explicit: true };
    for (const n of ['validation', 'settings']) if (h.startsWith(n)) return { name: n };
    return { name: 'patients', id: null, explicit: false };
  }

  const selectedId = () => {
    if (S.route.id && C.codes.get(S.route.id)) return S.route.id;
    return V.exportsVisible(S)[0]?.cti || V.exportsAll()[0]?.cti || null;
  };

  function setNav() {
    document.querySelectorAll('.dest').forEach((a) => (a.dataset.tab === S.route.name ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
    document.body.dataset.route = S.route.name === 'patients' ? (S.route.explicit ? 'detail' : 'list') : S.route.name;
    $('#search-wrap').hidden = S.route.name !== 'patients' || !V.exportsAll().length;
  }

  function renderList() {
    const pane = $('#list-pane');
    if (!pane) return;
    const y = pane.scrollTop;
    pane.innerHTML = V.exportList(S, selectedId());
    pane.scrollTop = y;
  }

  function render() {
    setNav();
    const r = S.route;
    if (r.name === 'patients') {
      const id = selectedId();
      view.innerHTML = V.exportPanes(S, id);
      if (id) V.drawImported(S, id);
    } else if (r.name === 'validation') { view.innerHTML = V.validation(S); V.drawValidation(S); }
    else if (r.name === 'settings') view.innerHTML = V.settings(S);
  }
  C.rerender = render;

  let lastSel = null;
  async function navigate() {
    S.route = parseRoute();
    C.tipHide();
    render();
    const id = S.route.name === 'patients' ? selectedId() : null;
    if (id !== lastSel) { const p = $('#detail-pane'); if (p) p.scrollTop = 0; }
    lastSel = id;
    if (S.route.name === 'validation') {
      try { S.validation = await getJSON('/api/validation'); } catch { S.validation = await getJSON(FX + 'validation_example.json').catch(() => null); }
      if (S.route.name === 'validation') render();
      if (S.validation?.status === 'computing') setTimeout(() => S.route.name === 'validation' && navigate(), 4000);
    }
  }

  function toast(text) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = text;
    $('#toasts').appendChild(el);
    requestAnimationFrame(() => el.classList.add('in'));
    setTimeout(() => { el.classList.remove('in'); setTimeout(() => el.remove(), 400); }, 5200);
  }

  function setTheme(t) {
    S.ui.theme = t;
    try { localStorage.setItem(THEME_KEY, t); } catch {}
    const eff = t === 'system' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : t;
    document.documentElement.dataset.theme = eff;
    render();
  }
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => S.ui.theme === 'system' && setTheme('system'));

  document.addEventListener('click', async (e) => {
    const th = e.target.closest('[data-theme-set]');
    if (th) return setTheme(th.dataset.themeSet);
    const a = e.target.closest('[data-action]');
    if (!a) {
      if (!e.target.closest('.menu-wrap')) closeMenu();
      return;
    }
    if (a.dataset.action === 'reset') {
      closeMenu();
      if (!confirm('Reset demo data?')) return;
      await C.demo.reset();
      toast('Demo data reset');
      if (location.hash && location.hash !== '#/' && S.route.name === 'patients') location.hash = '#/';
      else render();
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
    if (S.route.name === 'patients') renderList();
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
      if (!menu.hidden) return closeMenu();
      C.tipHide();
    }
    if (S.route.name === 'patients' && (e.key === 'ArrowDown' || e.key === 'ArrowUp') && !e.target.closest('input, .scan')) {
      const rows = V.exportsVisible(S);
      const i = rows.findIndex((r) => r.cti === selectedId());
      const n = rows[Math.max(0, Math.min(rows.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))];
      if (n && n.cti !== selectedId()) { e.preventDefault(); location.hash = '#/e/' + encodeURIComponent(n.cti); }
    }
  });

  let rz;
  window.addEventListener('resize', () => {
    clearTimeout(rz);
    rz = setTimeout(() => {
      if (S.route.name === 'patients') { const id = selectedId(); if (id) V.drawImported(S, id); }
      if (S.route.name === 'validation') V.drawValidation(S);
    }, 120);
  });

  async function boot() {
    S.route = parseRoute();
    await C.codes.ready;
    await C.demo.seed();
    await navigate();
  }

  window.addEventListener('hashchange', navigate);
  boot();
})();
