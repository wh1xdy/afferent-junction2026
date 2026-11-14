(() => {
  const q = new URLSearchParams(location.search);
  const DAY = 864e5, CADENCE = 14, OVERDUE = 17, EARLIEST = 7, ADVANCE = 600, SNOOZE = DAY, ANCHOR_VERSION = 1;
  const DASH = '\u2014';
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
    del(k) { try { localStorage.removeItem(k); } catch {} },
  };

  const STEM = 'Over the last 2 weeks, how often have you been bothered by any of the following problems?';
  const PHQ_OPTS = ['Not at all', 'Several days', 'More than half the days', 'Nearly every day'];
  const PHQ = [
    'Little interest or pleasure in doing things',
    'Feeling down, depressed, or hopeless',
    'Trouble falling or staying asleep, or sleeping too much',
    'Feeling tired or having little energy',
    'Poor appetite or overeating',
    `Feeling bad about yourself ${DASH} or that you are a failure or have let yourself or your family down`,
    'Trouble concentrating on things, such as reading the newspaper or watching television',
    `Moving or speaking so slowly that other people could have noticed? Or the opposite ${DASH} being so fidgety or restless that you have been moving around a lot more than usual`,
    'Thoughts that you would be better off dead or of hurting yourself in some way',
  ];
  const PHQ_KEYS = PHQ.map((_, i) => 'phq9_' + (i + 1));
  const MONTH = 'In the past month:';
  const CSSRS = {
    c1: [MONTH, 'Have you wished you were dead or wished you could go to sleep and not wake up?'],
    c2: [MONTH, 'Have you actually had any thoughts of killing yourself?'],
    c3: [MONTH, 'Have you thought about how you might do this? (For example, “I thought about taking an overdose but I never worked out the details about when, where, and how I would do that and I would never act on these thoughts.”)'],
    c4: [MONTH, 'Have you had any intention of acting on these thoughts of killing yourself, as opposed to you have the thoughts, but you definitely would not act on them? (For example, “I had the thought of killing myself by taking an overdose and am not sure whether I would do it or not.”)'],
    c5: [MONTH, 'Have you started to work out, or actually worked out, the specific details of how to kill yourself and did you actually intend to carry out the details of your plan? (For example, “I am planning to take 3 bottles of my sleep medication this Saturday when no one is around to stop me.”)'],
    c6: [null, 'Have you ever done anything, started to do anything, or prepared to do anything to end your life? (For example: Took pills, tried to shoot yourself, cut yourself, tried to hang yourself, took out pills but didn’t swallow any, held a gun but changed your mind about hurting yourself or it was grabbed from your hand, went to the roof to jump but didn’t, collected pills, obtained a gun, gave away valuables, wrote a will or suicide note; etc.)'],
    c6b: [null, 'If YES, did this occur in the past 3 months?'],
  };
  const CSSRS_KEYS = Object.keys(CSSRS);
  const YES_NO = [['Yes', true], ['No', false]];
  const INSTRUMENTS = { phq9: 'PHQ-9 English, phqscreeners.com manual', cssrs: 'C-SSRS Screener Self-Report Recent 2026' };
  const ANCHOR = 'Each time you play, you will see five lanterns. Tap the one that matches how you feel right now. The dimmest, coolest lantern is the lowest you feel. The brightest, warmest lantern is the best you feel. There is no right answer, and you can skip by waiting.';
  const FOOTER = 'Afferent is not an emergency service and is not watched around the clock.';
  const BANDS = [[20, 'severe'], [15, 'moderately_severe'], [10, 'moderate'], [5, 'mild'], [0, 'minimal']];

  const hubCfg = () => A.Hub?.config?.checkin || {};
  const cfg = () => {
    const h = hubCfg();
    return {
      enabled: A.config.checkin !== false && h.enabled !== false,
      cadence: h.cadence_days || CADENCE,
      always: h.always_ask_cssrs === true,
      licensed: h.cssrs_licensed === true || q.get('cssrs') === '1',
      demoLicence: h.cssrs_licensed !== true && q.get('cssrs') === '1',
      protocol: h.protocol_signed === true,
      early: h.early_request === true,
      clinic: A.Hub?.config?.clinic_contact || null,
    };
  };

  const pid = () => A.config.patientId;
  const stateKey = () => 'afferent.checkin.' + pid();
  const draftKey = () => 'afferent.checkin.draft.' + pid();
  const OUTBOX = 'afferent.checkin.outbox';
  const state = () => store.get(stateKey()) || {};
  const patch = p => store.set(stateKey(), { ...state(), ...p });

  const status = (now = Date.now()) => {
    const s = state(), c = cfg();
    const since = s.last ? (now - s.last) / DAY : Infinity;
    const early = c.early && since >= EARLIEST && since < c.cadence;
    return {
      due: c.enabled && (since >= c.cadence || early) && now >= (s.snooze || 0),
      early, trigger: early ? 'clinician_early' : 'schedule',
      overdue: since >= OVERDUE, overdue_days: Number.isFinite(since) ? Math.max(0, Math.floor(since) - c.cadence) : null,
      due_ms: s.due ?? null,
    };
  };

  const outbox = () => store.get(OUTBOX) || [];
  const flush = () => outbox().forEach(doc => A.bus.emit('ws', { type: 'checkin', patient_id: doc.patient_id, checkin: doc }));
  const send = doc => { store.set(OUTBOX, [...outbox().filter(d => d.checkin_id !== doc.checkin_id), doc].slice(-20)); flush(); };

  const askCssrs = a => cfg().licensed && a.phq9_9 != null && (a.phq9_9 >= 1 || cfg().always);
  const nextOf = (k, a) => {
    const i = PHQ_KEYS.indexOf(k);
    if (i >= 0 && i < 8) return PHQ_KEYS[i + 1];
    if (k === 'phq9_9') return askCssrs(a) ? 'cssrs_intro' : null;
    return { cssrs_intro: 'c1', c1: 'c2', c2: a.c2 ? 'c3' : 'c6', c3: 'c4', c4: 'c5', c5: 'c6', c6: a.c6 ? 'c6b' : null }[k] ?? null;
  };
  const cssrsPath = a => { const p = []; for (let k = 'c1'; k; k = a[k] == null ? null : nextOf(k, a)) p.push(k); return p; };
  const cssrsTier = c => c.c4 === true || c.c5 === true || c.c6b === true ? 'high'
    : c.c3 === true || c.c6 === true ? 'moderate'
    : c.c1 === true || c.c2 === true ? 'low' : 'none';
  const sum = ks => ks.reduce((t, k) => t + k, 0);
  const only = (o, ks) => Object.fromEntries(Object.entries(o).filter(([k]) => ks.includes(k)));

  let opts = { night: () => false, busy: () => false, log: () => {} };
  let root, sheet, run = null, timer = null, current = null, gesture = null;
  const iso = () => A.Record?.isoLocal ? A.Record.isoLocal(new Date()) : new Date().toISOString();

  const build = (how) => {
    const a = run.answers, c = cfg();
    const items = Object.fromEntries(PHQ_KEYS.map(k => [k, a[k] ?? null]));
    const vals = PHQ_KEYS.map(k => items[k]);
    const total = vals.every(v => v != null) ? sum(vals) : null;
    const phq8 = vals.slice(0, 8).every(v => v != null) ? sum(vals.slice(0, 8)) : null;
    const item9 = items.phq9_9;
    const asked = askCssrs(a);
    const path = asked ? cssrsPath(a) : [];
    const cItems = Object.fromEntries(CSSRS_KEYS.map(k => [k, path.includes(k) ? a[k] ?? null : 'not_asked']));
    const cDone = asked && nextOf(path[path.length - 1], a) === null && a[path[path.length - 1]] != null;
    const cTier = asked ? cssrsTier(cItems) : null;
    const prev = state().prev_c6;
    const repeat = cItems.c6 === true && cItems.c6b === false && prev?.c6 === true && prev?.c6b === false;
    const positive = item9 != null && (item9 >= 1 || c.always);
    const reason = asked ? (item9 >= 1 ? 'item9_positive' : 'always_ask') : positive && !c.licensed ? 'not_licensed' : null;

    let tier, source, screen;
    if (item9 == null) { tier = 'not_answered'; source = null; screen = 'saved'; }
    else if (asked) {
      source = 'cssrs';
      tier = cDone ? cTier : cTier === 'high' ? 'high' : 'incomplete';
      screen = tier === 'high' ? 'crisis' : tier === 'none' ? 'thank_you' : 'support';
    } else {
      source = 'item9_fallback';
      tier = item9 >= 2 ? 'moderate' : item9 === 1 ? 'low' : 'none';
      screen = item9 >= 2 ? 'crisis' : item9 === 1 ? 'support' : 'thank_you';
    }
    if (how === 'killed') screen = null;
    const complete = total != null && (!asked || cDone);
    return {
      schema: 'afferent.checkin/1', checkin_id: run.id, patient_id: pid(), device_id: A.config.deviceId, app_version: A.config.appVersion,
      started_iso: run.started_iso, completed_iso: complete ? iso() : null, ...(complete ? {} : { stopped_iso: iso() }),
      status: complete ? 'completed' : 'incomplete', trigger: run.trigger, early: run.early,
      language: 'en', instrument_versions: INSTRUMENTS, anchor_version: state().anchor ?? null,
      ...(asked && c.demoLicence ? { simulated: true } : {}),
      sharing: A.config.sharing,
      phq9: { items, item_ms: only(run.ms, PHQ_KEYS), changed: only(run.changed, PHQ_KEYS), total, phq8_total: phq8, band: total == null ? null : BANDS.find(([m]) => total >= m)[1] },
      cssrs: { asked, reason, items: cItems, tier: cTier, c6_repeat: repeat, item_ms: only(run.ms, path), changed: only(run.changed, path) },
      safety: { tier, item9, source, screen, shared: true },
    };
  };

  const finish = how => {
    clearTimeout(timer);
    if (!run) return;
    const doc = build(how);
    const now = Date.now();
    if (doc.phq9.total != null) patch({ last: now, due: now + cfg().cadence * DAY, snooze: 0, ...(doc.cssrs.asked ? { prev_c6: { c6: doc.cssrs.items.c6, c6b: doc.cssrs.items.c6b } } : {}) });
    else patch({ snooze: now + SNOOZE });
    send(doc);
    store.del(draftKey());
    run = null;
    opts.log(`check-in ${doc.status}${doc.phq9.total != null ? ', PHQ-9 ' + doc.phq9.total : ''}, safety ${doc.safety.tier}${doc.cssrs.asked ? ', C-SSRS ' + doc.cssrs.tier : ''} (${how})`);
    refresh();
    if (doc.safety.screen) render(doc.safety.screen);
  };

  const saveDraft = () => run && store.set(draftKey(), run);

  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const btn = (cls, text, fn) => { const b = el('button', cls, text); b.type = 'button'; b.onclick = e => { if (!gesture?.moved) fn(e); }; return b; };
  const talkIcon = () => {
    const b = btn('icon ci-talk', null, talk);
    b.setAttribute('aria-label', 'Talk to someone');
    b.innerHTML = '<svg viewBox="0 0 24 24"><path d="M4 5h16v10H9l-5 4z"/></svg>';
    return b;
  };
  const bar = () => { const b = el('div', 'ci-bar'); b.append(el('span', 'spacer'), talkIcon()); return b; };

  const contacts = (crisis) => {
    const c = cfg().clinic;
    const list = [
      ['Emergency', '112', '112'],
      ['MIELI Crisis Helpline, in Finnish, 24 h', '09 2525 0111', '0925250111'],
      ['Medical Helpline, 24 h', '116117', '116117'],
      [c?.name ? `${c.name}, ${c.hours || 'office hours'}` : 'Your clinic, office hours', c?.number || '09 000 0000 (demo placeholder)', (c?.number || '0900000000').replace(/[^\d+]/g, '')],
    ];
    const box = el('div', 'ci-contacts');
    list.forEach(([label, shown, tel], i) => {
      const a = el('a', 'ci-contact' + (crisis && i === 0 ? ' main' : ''));
      a.href = 'tel:' + tel;
      a.append(el('span', null, label), el('small', null, shown));
      box.append(a);
    });
    return box;
  };

  const screen = (kind, gestures) => {
    sheet.replaceChildren();
    sheet.className = 'ci-sheet ' + kind;
    root.dataset.gestures = gestures ? '1' : '';
    current = kind;
    return sheet;
  };
  const focusFirst = () => requestAnimationFrame(() => sheet.querySelector('[data-focus]')?.focus({ preventScroll: true }));

  const info = (kind, { title, lines = [], buttons = [], body, gestures = false, pre } = {}) => {
    const s = screen('ci-info ci-' + kind, gestures);
    s.append(bar());
    const main = el('div', 'ci-body');
    if (pre) main.append(el('p', 'ci-pre', pre));
    if (title) { const h = el('h2', 'ci-title', title); h.tabIndex = -1; h.dataset.focus = ''; main.append(h); }
    lines.forEach(l => main.append(el('p', 'ci-line', l)));
    if (body) main.append(body);
    s.append(main);
    const row = el('div', 'ci-actions' + (buttons.length > 1 ? ' two' : ''));
    buttons.forEach(([text, fn, quiet]) => row.append(btn('primary' + (quiet ? ' quiet' : ''), text, fn)));
    s.append(row);
    focusFirst();
  };

  const question = k => {
    const phq = PHQ_KEYS.includes(k);
    const [header, text] = phq ? [STEM, PHQ[PHQ_KEYS.indexOf(k)]] : CSSRS[k];
    const s = screen('ci-question', true);
    const head = el('div', 'ci-head');
    if (header) head.append(el('p', 'ci-stem', header));
    const m = text.match(/^(.*?) (\(For example.*\))$/s);
    const lead = m ? m[1] : text;
    const h = el('h2', 'ci-item' + (lead.length > 120 ? ' long' : ''), lead);
    h.id = 'ciItem'; h.tabIndex = -1; h.dataset.focus = '';
    head.append(h);
    if (m) head.append(el('p', 'ci-example', m[2]));
    const group = el('div', 'ci-opts');
    group.setAttribute('role', 'radiogroup');
    group.setAttribute('aria-labelledby', 'ciItem');
    const options = phq ? PHQ_OPTS.map((o, i) => [o, i]) : YES_NO;
    options.forEach(([label, v]) => {
      const b = btn('ci-opt', label, () => pick(k, v));
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String(run.answers[k] === v));
      b.dataset.v = String(v);
      group.append(b);
    });
    const stop = btn('ci-sr', 'Stop check-in', () => finish('stop'));
    s.append(head, group, stop);
    run.shownAt = performance.now();
    focusFirst();
  };

  const go = k => {
    clearTimeout(timer);
    if (!k) return finish('end');
    if (run.stack[run.stack.length - 1] !== k) run.stack.push(k);
    saveDraft();
    if (k === 'cssrs_intro') return info('cssrs-intro', { lines: ['A few more questions, so your clinic can understand. Answer yes or no.'], buttons: [['Continue', () => go('c1')]], gestures: true });
    question(k);
  };

  const pick = (k, v) => {
    if (!run || current !== 'ci-question') return;
    const had = run.answers[k];
    if (had === v && timer) return;
    if (had !== undefined && had !== v) run.changed[k] = (run.changed[k] || 0) + 1;
    run.answers[k] = v;
    run.ms[k] = Math.round(performance.now() - run.shownAt);
    sheet.querySelectorAll('.ci-opt').forEach(b => b.setAttribute('aria-checked', String(b.dataset.v === String(v))));
    saveDraft();
    clearTimeout(timer);
    timer = setTimeout(() => { timer = null; go(nextOf(k, run.answers)); }, ADVANCE);
  };

  const back = () => {
    if (!run || run.stack.length < 2) return;
    clearTimeout(timer); timer = null;
    run.stack.pop();
    const k = run.stack[run.stack.length - 1];
    if (k !== 'cssrs_intro') run.changed[k] = (run.changed[k] || 0) + 1;
    go(k);
  };

  const begin = () => {
    const st = status();
    run = { id: A.uuid(), started_iso: iso(), trigger: st.trigger, early: st.early, answers: {}, ms: {}, changed: {}, stack: [] };
    opts.log('check-in started');
    go('phq9_1');
  };

  const intro = () => {
    const c = cfg();
    const lines = ['Nine short questions about the last 2 weeks.', c.protocol ? 'Your clinic sees your answers on the next working day.' : 'Your clinic will see your answers.', 'This is not watched around the clock.', 'You can stop at any time by swiping down.'];
    if (A.config.sharing === 'paused') lines.push('Sharing is paused, but answers about your safety still reach your clinic.');
    info('intro', { title: 'Check-in', lines, buttons: [['Later', later, true], ['Start', begin]] });
  };

  const later = () => { patch({ snooze: Date.now() + SNOOZE }); opts.log('check-in snoozed 24 h'); close(); };

  const render = kind => {
    const c = cfg();
    const support = (c.protocol ? 'Your clinic will see your answers on the next working day.' : 'Your clinic will see your answers.') + ' If you need someone now, call 112 or a helpline below.';
    const fixed = crisis => {
      const body = el('div');
      body.append(contacts(crisis), el('p', 'ci-footer', FOOTER));
      info(crisis ? 'crisis' : 'support', { pre: crisis ? 'If you might act on these thoughts, call 112 now.' : null, title: 'If today is heavy, you do not have to carry it alone.', lines: [support], body, buttons: [['Close', close, true]] });
    };
    if (kind === 'thank_you') info('thanks', { title: 'Thank you.', buttons: [['Close', close, true]] });
    else if (kind === 'saved') info('saved', { title: 'Saved.', buttons: [['Close', close, true]] });
    else if (kind === 'support') fixed(false);
    else if (kind === 'crisis') fixed(true);
    else if (kind === 'anchor') info('anchor', { lines: [ANCHOR], buttons: [['Got it', () => { patch({ anchor: ANCHOR_VERSION }); opts.log('lantern anchor seen'); close(); }]] });
    else if (kind === 'intro') intro();
  };

  const siblings = () => [...root.parentElement.children].filter(n => n !== root);
  const openRoot = () => {
    if (!root.classList.contains('hidden')) return;
    root.classList.remove('hidden', 'leaving');
    siblings().forEach(n => { n.inert = true; });
  };
  const close = () => {
    clearTimeout(timer);
    root.classList.add('hidden');
    sheet.style.transform = '';
    current = null;
    siblings().forEach(n => { n.inert = false; });
    refresh();
  };
  const show = kind => { openRoot(); render(kind); };

  const talk = () => {
    if (run) return finish('stop');
    close();
    A.bus.emit('talk');
  };

  const stopGesture = () => {
    if (run) return finish('stop');
    close();
  };

  const bindGestures = () => {
    const EDGE = 28;
    root.addEventListener('pointerdown', e => {
      if (!root.dataset.gestures) return;
      const r = root.getBoundingClientRect();
      gesture = { id: e.pointerId, x: e.clientX, y: e.clientY, edge: e.clientX - r.left < EDGE, moved: false, dx: 0, dy: 0 };
    });
    root.addEventListener('pointermove', e => {
      if (!gesture || e.pointerId !== gesture.id) return;
      gesture.dx = e.clientX - gesture.x; gesture.dy = e.clientY - gesture.y;
      if (!gesture.moved && Math.hypot(gesture.dx, gesture.dy) > 12) gesture.moved = true;
      if (!gesture.moved) return;
      if (gesture.edge && gesture.dx > Math.abs(gesture.dy)) sheet.style.transform = `translateX(${Math.max(0, gesture.dx) * 0.6}px)`;
      else if (gesture.dy > Math.abs(gesture.dx)) sheet.style.transform = `translateY(${Math.max(0, gesture.dy)}px)`;
    });
    const end = e => {
      if (!gesture || e.pointerId !== gesture.id) return;
      const g = gesture;
      setTimeout(() => { if (gesture === g) gesture = null; }, 0);
      if (!g.moved) return;
      sheet.style.transition = 'transform 220ms var(--af-ease-out-soft, ease-out)';
      requestAnimationFrame(() => { sheet.style.transform = ''; setTimeout(() => { sheet.style.transition = ''; }, 240); });
      if (e.type === 'pointercancel') return;
      if (g.edge && g.dx > 70 && g.dx > Math.abs(g.dy)) back();
      else if (g.dy > 110 && g.dy > Math.abs(g.dx) * 1.3) stopGesture();
    };
    root.addEventListener('pointerup', end);
    root.addEventListener('pointercancel', end);
    addEventListener('keydown', e => {
      if (root.classList.contains('hidden')) return;
      if (e.key === 'Escape') { e.preventDefault(); root.dataset.gestures ? stopGesture() : close(); }
      else if (e.key === 'ArrowLeft' && e.altKey) { e.preventDefault(); back(); }
    });
    window.Capacitor?.Plugins?.App?.addListener?.('backButton', () => {
      if (root.classList.contains('hidden')) return;
      if (run && run.stack.length > 1) back();
      else stopGesture();
    });
    addEventListener('pagehide', () => { if (run) finish('killed'); });
  };

  const pill = () => document.getElementById('checkinBtn');
  const forced = q.get('checkin') === '1';
  const refresh = () => {
    const p = pill();
    if (!p) return;
    const st = status();
    const on = root?.classList.contains('hidden') && !opts.busy() && (forced || st.due && !opts.night());
    p.classList.toggle('hidden', !on);
    p.classList.toggle('overdue', st.overdue);
  };

  A.Checkin = {
    anchorVersion: ANCHOR_VERSION,
    status, refresh,
    open: () => show('intro'),
    anchor: () => show('anchor'),
    init(o = {}) {
      opts = { ...opts, ...o };
      root = el('div', 'ci hidden');
      root.id = 'checkin';
      root.setAttribute('role', 'dialog');
      root.setAttribute('aria-modal', 'true');
      root.setAttribute('aria-label', 'Check-in');
      sheet = el('div', 'ci-sheet');
      root.append(sheet);
      (document.getElementById('phone') || document.body).append(root);
      bindGestures();
      pill()?.addEventListener('click', () => show('intro'));
      document.getElementById('anchorBtn')?.addEventListener('click', () => show('anchor'));
      A.bus.on('hubConfig', refresh);
      A.Hub?.on?.('connected', on => { if (on) flush(); });
      A.Hub?.on?.('ack', d => { if (d?.checkin_id) store.set(OUTBOX, outbox().filter(x => x.checkin_id !== d.checkin_id)); });
      const draft = store.get(draftKey());
      if (draft?.id) { run = draft; finish('killed'); }
      if (forced) show('intro');
      else if (state().anchor !== ANCHOR_VERSION) show('anchor');
      refresh();
    },
  };
})();
