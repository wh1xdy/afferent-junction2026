(() => {
  const KEY = 'afferent.streak', MAX_FREEZES = 2, EARN_EVERY = 7, KEEP_DAYS = 120;
  const COUNTS = new Set(['completed', 'fell_asleep']);
  const KEEPS = new Set(['done', 'frozen', 'declined', 'paused']);

  const pad = n => String(n).padStart(2, '0');
  const keyOf = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const dateOf = k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
  const shift = (k, n) => { const d = dateOf(k); d.setDate(d.getDate() + n); return keyOf(d); };
  const today = () => keyOf(new Date());

  const load = () => {
    try {
      const s = JSON.parse(localStorage.getItem(KEY));
      if (s && typeof s.days === 'object') return { days: s.days, freezes: s.freezes | 0, pauses: Array.isArray(s.pauses) ? s.pauses : [] };
    } catch {}
    return { days: {}, freezes: 0, pauses: [] };
  };
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch {} };
  let st = load(), extended = null;

  const paused = k => st.pauses.some(p => k >= p.from && k <= p.to);

  const reconcile = () => {
    const t = today(), keys = Object.keys(st.days).sort();
    const cut = shift(t, -KEEP_DAYS);
    keys.filter(k => k < cut).forEach(k => delete st.days[k]);
    st.pauses = st.pauses.filter(p => p.to >= cut);
    const last = keys[keys.length - 1];
    if (!last) return;
    for (let d = shift(last, 1), i = 0; d < t && i < KEEP_DAYS; d = shift(d, 1), i++) {
      if (paused(d)) st.days[d] = 'paused';
      else if (st.freezes > 0) { st.days[d] = 'frozen'; st.freezes--; }
      else { st.days[shift(t, -1)] = 'missed'; break; }
    }
  };

  const count = () => {
    let k = st.days[today()] ? today() : shift(today(), -1), n = 0;
    for (let i = 0; i < KEEP_DAYS && KEEPS.has(st.days[k]); i++, k = shift(k, -1)) if (st.days[k] === 'done') n++;
    return n;
  };

  const land = status => {
    reconcile();
    extended = null;
    const t = today();
    if (COUNTS.has(status) && st.days[t] !== 'done') {
      const from = count();
      st.days[t] = 'done';
      const to = count();
      if (to % EARN_EVERY === 0) st.freezes = Math.min(MAX_FREEZES, st.freezes + 1);
      extended = { from, to };
    } else if (status === 'declined' && !st.days[t]) st.days[t] = 'declined';
    save(); render();
  };

  const setPause = sharing => {
    const t = today(), open = st.pauses.find(p => t >= p.from && t <= p.to);
    if (sharing === 'paused' && !open) st.pauses.push({ from: t, to: shift(t, 6) });
    if (sharing !== 'paused' && open) open.to = shift(t, -1);
    st.pauses = st.pauses.filter(p => p.to >= p.from);
    save();
  };

  const seed = n => {
    st = { days: {}, freezes: Math.min(MAX_FREEZES, Math.floor(n / EARN_EVERY)), pauses: [] };
    for (let i = 1; i <= n; i++) st.days[shift(today(), -i)] = 'done';
    save();
  };

  const FLAME = '<svg class="fl" viewBox="0 0 24 32" aria-hidden="true"><path class="fo" d="M12 1.5c.6 3.4 2.6 5.6 4.6 7.9C19 12.1 21 14.8 21 19.6 21 25.2 17 29.5 12 29.5S3 25.2 3 19.6c0-3.6 1.6-6.2 3.4-8.3.3 2 1.2 3.4 2.6 4.2C8.6 10 9.9 5.4 12 1.5z"/><path class="fi" d="M12 15.2c1.7 2.3 4 4.4 4 7.6a4 4 0 0 1-8 0c0-1.6.7-2.9 1.6-3.9.3 1 .9 1.7 1.6 2 0-2.1.2-4 .8-5.7z"/></svg>';
  const CRYSTAL = '<svg class="cr" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5v19M3.8 7.25l16.4 9.5M3.8 16.75l16.4-9.5M9.6 4.2 12 6.2l2.4-2M9.6 19.8l2.4-2 2.4 2"/></svg>';
  const WEEK = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

  const $ = id => document.getElementById(id);
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html) e.innerHTML = html; return e; };
  let btn, sheet, ext;

  const weekCells = () => {
    const t = today(), d = dateOf(t), monday = shift(t, -((d.getDay() + 6) % 7));
    return WEEK.map((letter, i) => {
      const k = shift(monday, i), s = st.days[k];
      const state = s === 'done' ? 'done' : s === 'frozen' ? 'frozen' : s === 'declined' || s === 'paused' ? 'rest' : k === t ? 'today' : k > t ? 'future' : 'empty';
      const glyph = state === 'done' ? FLAME : state === 'frozen' ? CRYSTAL : '';
      return `<span class="sd s-${state}"><i>${glyph}</i><b>${letter}</b></span>`;
    }).join('');
  };

  const render = () => {
    if (!btn) return;
    const n = count(), lit = st.days[today()] === 'done';
    btn.classList.toggle('lit', lit);
    btn.querySelector('.n').textContent = n;
    btn.setAttribute('aria-label', `Streak: ${n} ${n === 1 ? 'day' : 'days'}`);
    sheet.classList.toggle('lit', lit);
    sheet.querySelector('.big .n').textContent = n;
    sheet.querySelector('.week').innerHTML = weekCells();
    const fz = sheet.querySelector('.freezes');
    fz.innerHTML = Array.from({ length: MAX_FREEZES }, (_, i) => `<span class="${i < st.freezes ? 'have' : ''}">${CRYSTAL}</span>`).join('');
    fz.setAttribute('aria-label', `Streak freezes: ${st.freezes} of ${MAX_FREEZES}`);
  };

  const openSheet = on => { reconcile(); render(); sheet.classList.toggle('hidden', !on); };

  const playExtend = () => {
    if (!extended) return;
    const { from, to } = extended;
    extended = null;
    ext.querySelector('.old').textContent = from;
    ext.querySelector('.new').textContent = to;
    ext.setAttribute('aria-label', `Streak: ${to} ${to === 1 ? 'day' : 'days'}`);
    ext.classList.toggle('calm', !!A.config?.reducedMotion);
    ext.classList.remove('play'); void ext.offsetWidth; ext.classList.add('play');
  };

  const mount = () => {
    const q = new URLSearchParams(location.search);
    if (q.has('streak')) seed(Math.max(0, Number(q.get('streak')) | 0));
    if (A.config?.sharing) setPause(A.config.sharing);
    reconcile(); save();

    btn = el('button', 'streak', `${FLAME}<span class="n"></span>`);
    btn.id = 'streakBtn'; btn.type = 'button';
    $('start').querySelector('.bar').after(btn);

    sheet = el('div', 'card streak-sheet hidden', `<div class="big">${FLAME}<span class="n"></span></div><div class="week"></div><div class="freezes" role="img"></div><button class="primary quiet" type="button">Close</button>`);
    sheet.id = 'streakSheet';
    sheet.setAttribute('role', 'dialog'); sheet.setAttribute('aria-label', 'Streak');
    $('phone').append(sheet);

    ext = el('div', 'streak-extend', `<span class="glow"></span><span class="flames2">${FLAME.replace('class="fl"', 'class="fl off"')}${FLAME}</span><span class="nums"><span class="old"></span><span class="new"></span></span>`);
    ext.id = 'streakExtend'; ext.setAttribute('role', 'img');
    $('end').append(ext);

    btn.onclick = () => openSheet(sheet.classList.contains('hidden'));
    sheet.querySelector('button').onclick = () => openSheet(false);
    $('begin').addEventListener('click', () => openSheet(false));
    render();
  };

  A.bus.on('ws', msg => {
    if (msg?.type === 'privacy' && msg.sharing) setPause(msg.sharing);
    if (msg?.type !== 'session_end' || !msg.session) return;
    land(msg.session.status);
    msg.session.extra = { ...msg.session.extra, streak: count(), freezes: st.freezes };
  });
  A.bus.on('endScreen', () => ext?.classList.remove('play'));
  A.bus.on('quoteDone', playExtend);

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();

  A.Streak = { count, freezes: () => st.freezes, land, state: () => st };
})();
