(() => {
  const KEY = 'afferent.ba.v1', CAP = 40, SHOW_AT = 1600, ASK_S = 9, KEEP_DAYS = 3, ACK_MS = 1400;
  const KINDS = ['person', 'place', 'task'];
  const ICON = { person: 'chat_bubble', place: 'directions_walk', task: 'task_alt' };
  const $ = id => document.getElementById(id);
  const read = () => { try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; } };
  const write = v => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch {} };
  const blank = () => ({ v: 1, menu: { person: '', place: '', task: '' }, offeredOn: null, step: null, marks: 0, report: null });

  let st = (() => {
    const s = read();
    if (s?.v !== 1) return blank();
    return { ...blank(), ...s, menu: { ...blank().menu, ...s.menu }, marks: Math.max(0, Math.min(CAP, s.marks | 0)) };
  })();
  const save = () => write(st);

  const today = () => A.Streak?.today?.() ?? new Date().toISOString().slice(0, 10);
  const shift = (k, n) => A.Streak?.shift?.(k, n) ?? k;
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  const label = (kind, small) => {
    const t = (st.menu[kind] || '').trim();
    if (kind === 'person') return small ? `A short hello to ${t || 'someone'}` : t ? `Message ${t}` : 'Message someone';
    if (kind === 'place') return small ? 'A step outside the door' : t ? `Walk to ${t}` : 'A walk outside at midday';
    return small ? `Two minutes of ${t || 'one small task'}` : cap(t || 'one small task');
  };
  const order = () => {
    const d = Math.round(Date.parse(today()) / 864e5) || 0, k = ((d % 3) + 3) % 3;
    return [...KINDS.slice(k), ...KINDS.slice(0, k)];
  };

  const on = () => A.Prefs?.get('smallSteps') !== false;
  const night = () => typeof A.night === 'function' && A.night();
  const due = () => {
    if (!on() || night() || A.session?.stage) return false;
    const t = today();
    return st.offeredOn !== t && st.offeredOn !== shift(t, -1);
  };

  let moodEnd = null, timer = 0, card = null, ask = null, askTimer = 0, asked = null;

  const html = (tag, cls, inner) => { const e = document.createElement(tag); if (cls) e.className = cls; if (inner != null) e.innerHTML = inner; return e; };

  const hideCard = () => { clearTimeout(timer); card?.classList.remove('on'); };
  const showCard = () => {
    const slot = $('endQuote');
    if (!slot) return;
    const small = moodEnd != null && moodEnd <= 2, kinds = order();
    st.offeredOn = today();
    st.report = { date: st.offeredOn, shown: kinds, small, picked: null };
    save();
    card?.remove();
    card = html('div', 'ba-step');
    card.setAttribute('role', 'group'); card.setAttribute('aria-labelledby', 'baAsk');
    card.innerHTML = `<p id="baAsk" class="ba-ask">One small thing today?</p><div class="ba-opts"></div><button type="button" class="btn text small state ba-skip">Not today</button>`;
    const opts = card.querySelector('.ba-opts');
    for (const kind of kinds) {
      const b = html('button', 'ba-opt state', `<span class="ms" aria-hidden="true">${ICON[kind]}</span><span class="ba-l">${label(kind, small)}</span>`);
      b.type = 'button'; b.dataset.kind = kind;
      b.onclick = () => pick(kind, small, b);
      opts.append(b);
    }
    card.querySelector('.ba-skip').onclick = () => { st.report = { ...st.report, picked: 'skip' }; save(); hideCard(); };
    slot.append(card);
    void card.offsetWidth;
    card.classList.add('on');
  };

  const pick = (kind, small, btn) => {
    if (!card || card.classList.contains('picked')) return;
    st.step = { date: today(), kind, small, asked: false };
    st.report = { ...st.report, picked: kind };
    save();
    card.classList.add('picked');
    btn.classList.add('chosen');
    btn.setAttribute('aria-pressed', 'true');
    card.querySelector('.ba-ask').textContent = 'Saved for today.';
    navigator.vibrate?.(12);
  };

  const pending = () => {
    const s = st.step, t = today();
    if (!s || s.asked || s.date >= t || s.date < shift(t, -KEEP_DAYS)) return null;
    return s;
  };

  const closeAsk = () => { clearTimeout(askTimer); ask?.classList.remove('on'); };
  const answer = v => {
    if (!asked || asked.answer !== undefined) return;
    asked.answer = v;
    if (v === 'yes' || v === 'partly') { st.marks = Math.min(CAP, st.marks + 1); A.bus.emit('waymarker', { marks: st.marks }); }
    save();
    clearTimeout(askTimer);
    ask.classList.add('thanked');
    ask.querySelector('.ba-q').textContent = 'Thank you.';
    navigator.vibrate?.(12);
    askTimer = setTimeout(closeAsk, ACK_MS);
  };
  const showAsk = () => {
    const s = pending();
    if (!s) return;
    s.asked = true; save();
    asked = { date: s.date, kind: s.kind, small: s.small };
    ask?.remove();
    ask = html('div', 'ba-follow');
    ask.setAttribute('role', 'group'); ask.setAttribute('aria-label', 'Your small step');
    ask.innerHTML = `<span class="ms ba-icon" aria-hidden="true">${ICON[s.kind]}</span><p class="ba-q">${label(s.kind, s.small)}. Did you?</p>
      <div class="ba-ans"><button type="button" class="state" data-v="yes">Yes</button><button type="button" class="state" data-v="partly">Partly</button><button type="button" class="state" data-v="no">Not yet</button></div>`;
    ask.querySelectorAll('[data-v]').forEach(b => b.onclick = e => { e.stopPropagation(); answer(b.dataset.v); });
    $('phone')?.append(ask);
    void ask.offsetWidth;
    ask.classList.add('on');
    askTimer = setTimeout(closeAsk, ASK_S * 1000);
  };

  A.bus.on('segment', p => {
    const s = A.session;
    if (p === 'walk' && s && !s.night && !s.stage && !s.baAsked && s.coreRec) { s.baAsked = true; showAsk(); }
    if (p === 'game' || p === 'dawn' || p === 'asleep') closeAsk();
  });
  A.bus.on('mood', m => { if (m?.which === 'end') moodEnd = m.value ?? null; });
  A.bus.on('endScreen', () => { moodEnd = null; hideCard(); });
  A.bus.on('crisisOffer', hideCard);
  A.bus.on('home', () => { hideCard(); closeAsk(); asked = null; });
  A.bus.on('shine', ({ night: n }) => {
    hideCard();
    if (n || !due()) return;
    timer = setTimeout(showCard, SHOW_AT);
  });

  A.bus.on('ws', msg => {
    if (msg?.type !== 'session_end' || !msg.session || msg.session.status === 'declined') return;
    const ba = { followup: asked ? { step_date: asked.date, kind: asked.kind, small: asked.small, answer: asked.answer ?? null } : null, offer: st.report, marks: st.marks };
    if (!ba.followup && !ba.offer) return;
    msg.session.extra = { ...msg.session.extra, ba };
    st.report = null; asked = null; save();
  });

  A.BA = {
    takesSlot: n => !n && due(),
    marks: () => st.marks,
    menu: () => ({ ...st.menu }),
    setMenu(m) { st.menu = { ...st.menu, ...Object.fromEntries(KINDS.filter(k => typeof m?.[k] === 'string').map(k => [k, m[k].trim().slice(0, 40)])) }; save(); },
    label,
  };
})();
