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
  const ANCHOR = 'Each time you play, you will see five lanterns. Tap the one that matches how you feel right now. The dimmest, coolest lantern is the lowest you feel. The brightest, warmest lantern is the best you feel. There is no wrong answer, and you can skip by waiting.';
  const FOOTER = 'Afferent is not an emergency service and is not watched around the clock.';
  const BANDS = [[20, 'severe'], [15, 'moderately_severe'], [10, 'moderate'], [5, 'mild'], [0, 'minimal']];

  const hubCfg = () => A.Hub?.config?.checkin || {};
  const cfg = () => {
    const h = hubCfg();
    return {
      enabled: A.config?.checkin !== false && h.enabled !== false,
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
  const ICON = {
    support: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3.6"/><path d="M6 6l3.45 3.45M18 6l-3.45 3.45M6 18l3.45-3.45M18 18l-3.45-3.45"/>',
    schedule: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    doc: '<path d="M7 3.5h6.5L18 8v11.5a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-15a1 1 0 0 1 1-1z"/><path d="M13.5 3.5V8H18M9 12.5h6M9 16h4"/>',
    swipe: '<path d="M12 4v11M7.5 10.5L12 15l4.5-4.5M6 19.5h12"/>',
    shield: '<path d="M12 3.5l7 2.8v5.2c0 4.3-3 7.6-7 9-4-1.4-7-4.7-7-9V6.3z"/><path d="M9 12l2.2 2.2L15.5 10"/>',
    checklist: '<path d="M4.5 7.5l1.8 1.8 3.2-3.3M4.5 15.5l1.8 1.8 3.2-3.3M13 8h6.5M13 16h6.5"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  };
  const CALL = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19.95 21q-3.12 0-6.17-1.36t-5.55-3.86q-2.5-2.5-3.86-5.55T3 4.05q0-.45.3-.75t.75-.3H8.1q.35 0 .62.24t.33.56l.65 3.5q.05.4-.02.68T9.4 8.45L6.98 10.9q.5.93 1.19 1.79t1.51 1.66q.78.78 1.63 1.44T13.1 17l2.35-2.35q.23-.23.59-.34t.71-.06l3.45.7q.35.1.58.36T21 15.9v4.05q0 .45-.3.75t-.75.3z"/></svg>';
  const LANTERN = '<svg class="lantern" viewBox="0 0 26 40" aria-hidden="true"><circle cx="13" cy="3.6" r="2.2" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M8 10.5h10l-2-4.2h-6z" fill="currentColor"/><rect x="6.5" y="10.5" width="13" height="20" rx="4.5" fill="color-mix(in srgb, currentColor 22%, transparent)" stroke="currentColor" stroke-width="1.5"/><ellipse cx="13" cy="21.5" rx="2.7" ry="4.3" fill="currentColor"/><rect x="8.5" y="30.5" width="9" height="3.2" rx="1.2" fill="currentColor"/></svg>';
  const icon = (name, cls = 'g') => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICON[name]}</svg>`;
  const html = (tag, cls, markup) => { const e = el(tag, cls); e.innerHTML = markup; return e; };
  const tile = markup => html('div', 'ci-tile', markup);
  const talkIcon = () => {
    const b = btn('ci-talk', null, talk);
    b.setAttribute('aria-label', 'Talk to someone');
    b.innerHTML = icon('support');
    return b;
  };
  const bar = () => { const b = el('div', 'ci-bar'); b.append(talkIcon()); return b; };

  const contacts = (kind) => {
    const c = cfg().clinic;
    const clinicTel = typeof c?.number === 'string' ? c.number.replace(/[^\d+]/g, '') : '';
    const list = [
      ['Emergency', '112', null, '112'],
      ['MIELI Crisis Helpline', '09 2525 0111', 'in Finnish, 24 h', '0925250111'],
      ['Medical Helpline', '116117', '24 h', '116117'],
      clinicTel ? [c.name || 'Your clinic', c.number, c.hours || 'office hours', clinicTel] : ['Your clinic', 'Number added by your care team', null, null],
    ];
    const main = kind === 'crisis' ? 0 : 1;
    const box = el('div', 'ci-contacts');
    list.forEach(([label, number, hours, tel], i) => {
      const a = el(tel ? 'a' : 'div', 'ci-contact' + (i === main ? ' main' : '') + (tel ? '' : ' plain'));
      const t = el('span', 'ci-ct');
      t.append(el('span', 'ci-cl', label), el('span', 'ci-cn', hours ? `${number} · ${hours}` : number));
      if (tel) {
        a.href = 'tel:' + tel;
        a.setAttribute('aria-label', `Call ${i === 3 && !c?.name ? 'your clinic' : label}, ${number}${hours ? ', ' + hours : ''}`);
        a.append(t, html('span', 'ci-call', CALL));
      } else a.append(t);
      box.append(a);
    });
    return box;
  };

  const scheme = () => {
    const d = document.documentElement.dataset;
    return forcedScheme || (d.scheme === 'kevat' || d.sky === 'day' || d.sky === 'dawn' ? 'kevat' : 'kaamos');
  };
  const screen = (kind, gestures) => {
    sheet.replaceChildren();
    sheet.className = 'ci-sheet ' + kind;
    root.classList.toggle('kevat', scheme() === 'kevat');
    root.dataset.gestures = gestures ? '1' : '';
    current = kind;
    return sheet;
  };
  const focusFirst = () => requestAnimationFrame(() => sheet.querySelector('[data-focus]')?.focus({ preventScroll: true }));

  const info = (kind, { title, sub, lines = [], items = [], buttons = [], body, lead, gestures = false, pre, talkBar = true } = {}) => {
    const s = screen('ci-info ci-' + kind, gestures);
    if (talkBar) s.append(bar());
    const main = el('div', 'ci-body');
    if (lead) main.append(lead);
    if (pre) main.append(html('p', 'ci-pre', CALL.replace('<svg', '<svg class="call"') + `<span>${pre}</span>`));
    if (title) { const h = el('h2', 'ci-title', title); h.tabIndex = -1; h.dataset.focus = ''; main.append(h); }
    if (sub) main.append(el('p', 'ci-sub', sub));
    if (lines.length) { const box = el('div', 'ci-lines'); lines.forEach(l => box.append(el('p', 'ci-line', l))); main.append(box); }
    if (items.length) {
      const box = el('div', 'ci-lines');
      items.forEach(([ic, text]) => { const r = el('div', 'ci-li'); r.innerHTML = icon(ic); r.append(el('p', null, text)); box.append(r); });
      main.append(box);
    }
    if (body) main.append(body);
    s.append(main);
    const row = el('div', 'ci-actions');
    buttons.forEach(([text, fn, style = 'filled']) => row.append(btn('ci-btn ' + style, text, fn)));
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
    const h = el('h2', 'ci-item' + (lead.length > 230 ? ' xlong' : lead.length > 120 || m ? ' long' : ''), lead);
    h.id = 'ciItem'; h.tabIndex = -1; h.dataset.focus = '';
    head.append(h);
    if (m) head.append(el('p', 'ci-example', m[2]));
    const group = el('div', 'ci-opts');
    group.setAttribute('role', 'radiogroup');
    group.setAttribute('aria-labelledby', 'ciItem');
    const options = phq ? PHQ_OPTS.map((o, i) => [o, i]) : YES_NO;
    options.forEach(([label, v], i) => {
      const b = btn('ci-opt', null, () => pick(k, v));
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String(run.answers[k] === v));
      b.setAttribute('aria-label', phq ? `${label}, ${i} of 3` : label);
      b.dataset.v = String(v);
      if (phq) b.append(html('span', 'ci-dots', [0, 1, 2].map(d => `<i class="${d < i ? 'on' : ''}"></i>`).join('')));
      b.append(el('span', 'lb', label), html('span', 'ci-check', icon('check')));
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
    if (k === 'cssrs_intro') {
      const [t, sub] = sentences('A few more questions, so your clinic can understand. Answer yes or no.');
      return info('cssrs-intro', { title: t, sub, buttons: [['Continue', () => go('c1')]], gestures: true });
    }
    question(k);
  };
  const sentences = s => s.match(/[^.]+\.(\s|$)/g).map(x => x.trim());

  const pick = (k, v) => {
    if (!run || current !== 'ci-question') return;
    const had = run.answers[k];
    if (had === v && timer) return;
    if (had !== undefined && had !== v) run.changed[k] = (run.changed[k] || 0) + 1;
    if (had !== v) A.J?.hap('tick');
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
    const items = [
      ['schedule', 'Nine short questions about the last 2 weeks.'],
      ['doc', (c.protocol ? 'Your clinic sees your answers on the next working day.' : 'Your clinic will see your answers.') + ' This is not watched around the clock.'],
      ['swipe', 'You can stop at any time by swiping down.'],
    ];
    if (A.config?.sharing === 'paused') items.push(['shield', 'Sharing is paused, but answers about your safety still reach your clinic.']);
    info('intro', { lead: tile(icon('checklist')), title: 'Check-in', items, buttons: [['Start', begin], ['Later', later, 'text']] });
  };

  const later = () => { patch({ snooze: Date.now() + SNOOZE }); opts.log('check-in snoozed 24 h'); close(); };

  const render = kind => {
    const c = cfg();
    const support = (c.protocol ? 'Your clinic will see your answers on the next working day.' : 'Your clinic will see your answers.') + ' If you need someone now, call 112 or a helpline below.';
    const fixed = variant => {
      const body = el('div');
      body.append(contacts(variant), el('p', 'ci-footer', FOOTER));
      info(variant === 'talk' ? 'talk-screen' : variant, {
        lead: variant === 'crisis' ? null : tile(LANTERN),
        pre: variant === 'crisis' ? 'If you might act on these thoughts, call 112 now.' : null,
        title: 'If today is heavy, you do not have to carry it alone.',
        sub: variant === 'talk' ? null : support,
        body, buttons: [['Close', close, 'tonal']], talkBar: false,
      });
    };
    const done = title => info(title === 'Thank you.' ? 'thanks' : 'saved', { lead: html('div', 'ci-glow', LANTERN), title, buttons: [['Close', close, 'tonal']] });
    if (kind === 'thank_you') done('Thank you.');
    else if (kind === 'saved') done('Saved.');
    else if (kind === 'support' || kind === 'crisis' || kind === 'talk') fixed(kind);
    else if (kind === 'anchor') {
      const [t, ...rest] = sentences(ANCHOR);
      info('anchor', { title: t, lines: [rest[0], rest[1] + ' ' + rest[2], rest[3]], buttons: [['Got it', () => { patch({ anchor: ANCHOR_VERSION }); opts.log('lantern anchor seen'); close(); }, 'tonal']] });
    }
    else if (kind === 'intro') intro();
  };

  let lastFocus = null, forcedScheme = null;
  const siblings = () => [...root.parentElement.children].filter(n => n !== root && n.tagName !== 'SCRIPT');
  const openRoot = () => {
    if (!root.classList.contains('hidden')) return;
    lastFocus = document.activeElement;
    root.classList.remove('hidden', 'leaving');
    siblings().forEach(n => { n.inert = true; });
  };
  const close = () => {
    clearTimeout(timer);
    root.classList.add('hidden');
    sheet.style.transform = '';
    current = null;
    forcedScheme = null;
    siblings().forEach(n => { n.inert = false; });
    lastFocus?.focus?.({ preventScroll: true });
    refresh();
  };
  const show = kind => { openRoot(); render(kind); };

  const talk = () => {
    if (run) {
      finish('stop');
      if (current === 'ci-info ci-support' || current === 'ci-info ci-crisis') return;
    }
    close();
    A.bus.emit('talk');
  };

  const openSupport = (kind = 'talk', o = {}) => {
    ensureRoot();
    if (o.scheme) forcedScheme = o.scheme;
    if (o.source) {
      A.bus?.emit('ws', { type: 'crisis', patient_id: A.config?.patientId, ...(A.session?.rec?.session_id ? { session_id: A.session.rec.session_id } : {}), source: o.source, t_iso: iso() });
      opts.log(`talk screen opened (${o.source})`);
    }
    show(kind === 'support' || kind === 'crisis' ? kind : 'talk');
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

  const ensureRoot = mount => {
    if (root) return;
    root = el('div', 'ci hidden');
    root.id = 'checkin';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', 'Check-in');
    root.setAttribute('aria-live', 'polite');
    sheet = el('div', 'ci-sheet');
    root.append(sheet);
    (mount || document.body).append(root);
    bindGestures();
  };

  A.Support = { open: openSupport, close: () => root && close() };
  A.Checkin = {
    anchorVersion: ANCHOR_VERSION,
    status, refresh,
    open: () => show('intro'),
    anchor: () => show('anchor'),
    init(o = {}) {
      opts = { ...opts, ...o };
      ensureRoot(document.getElementById('phone'));
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
