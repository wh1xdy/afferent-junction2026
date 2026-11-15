(() => {
  const KEY = 'afferent.remind.v1', CHANNEL = 'morning', ACTIONS = 'morning';
  const OFFSET_MIN = 30, BOUNDARY_MS = 4 * 3600e3, KEEP_DAYS = 60, HORIZON = 21;
  const BACKOFF_AFTER = 3, THIN_BACK = 2, THIN_WINDOW = 10, THIN_UNPROMPTED = 7;
  const PAUSE_DAYS = 7;
  const LIT = new Set(['completed', 'fell_asleep']);

  const cap = window.Capacitor;
  const LN = cap?.isNativePlatform?.() ? (cap.Plugins?.LocalNotifications ?? cap.registerPlugin?.('LocalNotifications')) : null;
  if (!LN) {
    A.Remind = { native: false, set: async () => false, pause: () => {}, sync: () => {}, state: () => null };
    return;
  }

  const pad = n => String(n).padStart(2, '0');
  const keyOf = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const dateOf = k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
  const shift = (k, n) => { const d = dateOf(k); d.setDate(d.getDate() + n); return keyOf(d); };
  const today = () => keyOf(new Date(Date.now() - BOUNDARY_MS));
  const fireAt = (k, wake) => { const [h, m] = wake.split(':').map(Number); const d = dateOf(k); d.setHours(h, m + OFFSET_MIN, 0, 0); return d; };
  const daytime = d => d.getHours() >= 6 && d.getHours() < 21;

  const fresh = () => ({ on: false, asked: false, wake: '07:00', plan: [], sent: {}, answered: {}, lit: {}, used: {}, thinned: false, silent: false });
  const load = () => { try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && typeof s === 'object') return { ...fresh(), ...s }; } catch {} return fresh(); };
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch {} };
  let st = load();

  const pool = fetch('data/reminders.json', { cache: 'no-cache' }).then(r => r.ok ? r.json() : null).catch(() => null);
  const wake = () => A.config?.wake || st.wake;
  const isLit = r => LIT.has(r.status) || (r.status === 'partial' && !!r.core && !r.unengaged && !r.core.unengaged);
  const ignored = () => {
    const last = Object.keys(st.answered).sort().pop() || '';
    return Object.entries(st.sent).filter(([d, s]) => d > last && s.kind === 'line').length;
  };

  const reconcile = (now = Date.now()) => {
    st.plan.filter(p => p.at <= now).forEach(p => {
      st.sent[p.day] = { tpl: p.tpl, at: p.at, kind: p.kind };
      if (p.kind === 'line') st.used[p.tpl] = p.day;
      else st.silent = true;
    });
    st.plan = st.plan.filter(p => p.at > now);
    if (st.thinned && ignored() >= THIN_BACK) st.thinned = false;
    const cut = shift(today(), -KEEP_DAYS);
    [st.sent, st.answered, st.lit].forEach(m => Object.keys(m).forEach(k => { if (k < cut) delete m[k]; }));
  };

  const oldest = (lines, used) => lines.reduce((a, b) => ((used[b.id] || '') < (used[a.id] || '') ? b : a)).id;

  const build = (lines, now = Date.now()) => {
    const out = [], used = { ...st.used }, t = today(), w = wake();
    const pauseTo = A.Streak?.pausedUntil?.();
    let ign = ignored(), thin = st.thinned, last = Object.keys(st.sent).sort().pop() ?? null;
    for (let i = 0; i <= HORIZON; i++) {
      const d = shift(t, i), at = fireAt(d, w);
      if (!daytime(at)) break;
      if (+at <= now || st.answered[d] || st.sent[d]) continue;
      if (pauseTo && d <= pauseTo) continue;
      if (thin && last === shift(d, -1)) continue;
      if (ign >= BACKOFF_AFTER) { out.push({ day: d, at: +at, kind: 'backoff', tpl: 'backoff' }); break; }
      const tpl = oldest(lines, used);
      used[tpl] = d;
      out.push({ day: d, at: +at, kind: 'line', tpl });
      last = d; ign++;
      if (thin && ign >= THIN_BACK) thin = false;
    }
    return out;
  };

  const notification = data => p => ({
    id: Number(p.day.replace(/-/g, '')),
    title: '',
    body: p.kind === 'backoff' ? data.backoff.text : data.lines.find(l => l.id === p.tpl).text,
    schedule: { at: new Date(p.at), allowWhileIdle: true },
    channelId: CHANNEL,
    interruptionLevel: 'passive',
    ...(p.kind === 'line' ? { actionTypeId: ACTIONS } : {}),
    extra: { day: p.day, template_id: p.tpl },
  });

  let busy = Promise.resolve();
  const sync = () => (busy = busy.then(async () => {
    await setup;
    reconcile();
    const data = await pool;
    if (st.on && (await LN.checkPermissions()).display !== 'granted') st.on = false;
    st.plan = st.on && !st.silent && data?.lines?.length ? build(data.lines) : [];
    save();
    const pending = (await LN.getPending()).notifications;
    if (pending.length) await LN.cancel({ notifications: pending.map(n => ({ id: n.id })) });
    if (st.plan.length) await LN.schedule({ notifications: st.plan.map(notification(data)) });
  }).catch(() => {}));

  const pause = (days = PAUSE_DAYS) => A.Streak?.setPause(shift(today(), days - 1));

  const decline = day => {
    if (day !== today() || st.answered[day] || !A.declinedRecord) return;
    const r = A.declinedRecord('live');
    A.bus.emit('ws', { type: 'session_end', session: r });
    A.bus.emit('sessionEnd', r);
  };

  const setup = (async () => {
    if (cap.getPlatform?.() === 'android') await LN.createChannel({ id: CHANNEL, name: 'Morning reminder', importance: 2 });
    await LN.registerActionTypes({ types: [{ id: ACTIONS, actions: [{ id: 'decline', title: 'Not today' }, { id: 'pause', title: 'Pause 7 days' }] }] });
    await LN.addListener('localNotificationActionPerformed', e => {
      const day = e.notification?.extra?.day;
      if (e.actionId === 'pause') pause();
      if (e.actionId === 'decline') decline(day);
    });
  })().catch(() => {});

  const set = async o => {
    if (o.wake) st.wake = o.wake;
    if ('on' in o) {
      st.on = !!o.on && (await LN.requestPermissions().catch(() => null))?.display === 'granted';
      st.asked = true;
    }
    save();
    await sync();
    return st.on;
  };

  A.bus.on('prefs', p => { if (!!p.reminder !== st.on || p.wake !== st.wake) set({ on: !!p.reminder, wake: p.wake }).then(on => { if (!on && p.reminder) A.Prefs.set({ reminder: false }); }); });
  A.bus.on('pause', () => sync());

  A.bus.on('sessionEnd', r => {
    const d = today(), lit = isLit(r);
    if (!lit && r.status !== 'declined') return;
    reconcile();
    if (st.answered[d] !== 'lit') st.answered[d] = lit ? 'lit' : 'declined';
    if (lit) {
      const start = Date.parse(r.started_iso) || Date.now();
      st.lit[d] = !!st.sent[d] && st.sent[d].kind === 'line' && st.sent[d].at <= start;
      st.silent = false;
      const recent = Object.keys(st.lit).sort().slice(-THIN_WINDOW);
      if (recent.filter(k => !st.lit[k]).length >= THIN_UNPROMPTED) st.thinned = true;
    }
    sync();
  });

  A.bus.on('ws', msg => {
    if (msg?.type === 'session_start' && A.session) {
      reconcile();
      const s = st.sent[today()];
      if (s?.kind === 'line') {
        A.session.reminderIso = A.Record?.isoLocal?.(new Date(s.at)) ?? new Date(s.at).toISOString();
        A.session.timeToStart = Math.round((Date.now() - s.at) / 1000);
      }
    }
    if (msg?.type === 'session_end' && msg.session && (st.on || st.asked)) {
      const s = st.sent[today()];
      msg.session.extra = {
        ...msg.session.extra,
        reminder_sent_at: s ? (A.Record?.isoLocal?.(new Date(s.at)) ?? new Date(s.at).toISOString()) : null,
        template_id: s?.tpl ?? null, reminder_thinned: st.thinned, reminders_paused: st.silent,
      };
    }
  });

  document.addEventListener('visibilitychange', () => { if (!document.hidden) sync(); });
  sync();

  A.Remind = { native: true, set, pause, sync, state: () => st };
})();
