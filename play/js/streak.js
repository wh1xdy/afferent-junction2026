(() => {
  const KEY = 'afferent.days.v1', PREFS = 'afferent.prefs.v1';
  const FREEZES_START = 2, FREEZE_MAX = 2, EARN_EVERY = 7, REPAIR_DAYS = 3, SHOW_FROM = 2, PAUSE_CAP = 14, BOUNDARY_H = 4;
  const SHINE_MS = 5000, SEED_MOODS = [4, 3, 4, 5, 2, 4, 3];

  const pad = n => String(n).padStart(2, '0');
  const keyOf = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const dateOf = k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
  const shift = (k, n) => { const d = dateOf(k); d.setDate(d.getDate() + n); return keyOf(d); };
  const dayKey = (t = new Date()) => keyOf(new Date(+t - BOUNDARY_H * 3600e3));
  const today = () => dayKey();
  const nightAt = (t = new Date()) => { const h = t.getHours(); return h >= 21 || h < 6; };
  const night = () => typeof A.night === 'function' ? A.night() : nightAt();

  const read = (k, fb) => { try { return JSON.parse(localStorage.getItem(k)) ?? fb; } catch { return fb; } };
  const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

  const blank = () => ({ v: 1, days: {}, pauses: [] });
  let log = (() => {
    const s = read(KEY, null);
    return s && s.days && typeof s.days === 'object' ? { ...s, days: s.days, pauses: Array.isArray(s.pauses) ? s.pauses : [] } : blank();
  })();
  const save = () => write(KEY, log);

  const PREF_DEFAULT = { showCount: true, showLine: true, reminder: false, wake: '07:00', cue: '', aim: 7, onboarded: null };
  let prefs = { ...PREF_DEFAULT, ...read(PREFS, {}) };
  A.Prefs = {
    get: k => prefs[k],
    all: () => ({ ...prefs }),
    set(patch) { prefs = { ...prefs, ...patch }; write(PREFS, prefs); A.bus.emit('prefs', prefs); },
  };

  const pauseOn = k => log.pauses.find(p => k >= p.from && k <= p.to) || null;

  const replay = (days = log.days) => {
    const t = today(), keys = Object.keys(days).sort();
    const r = { streak: 0, freezes: FREEZES_START, lit: 0, gap: 0, first: keys[0] || null, states: {}, protection: {} };
    let gap = [];
    for (let d = r.first, i = 0; d && d <= t && i < 5000; d = shift(d, 1), i++) {
      const e = days[d];
      if (e?.s === 'lit') {
        gap.forEach(g => { r.protection[g] = 'repair'; });
        gap = [];
        r.lit++; r.streak++;
        if (r.lit % EARN_EVERY === 0) r.freezes = Math.min(FREEZE_MAX, r.freezes + 1);
        r.states[d] = 'lit';
      } else if (e?.s === 'declined' || pauseOn(d)) r.states[d] = 'rest';
      else if (d === t) r.states[d] = 'today';
      else if (r.streak > 0 && r.freezes > 0) { r.freezes--; r.states[d] = 'frozen'; r.protection[d] = 'freeze'; }
      else {
        r.states[d] = 'missed';
        if (r.streak > 0) { gap.push(d); if (gap.length > REPAIR_DAYS) { r.streak = 0; gap = []; } }
      }
    }
    r.gap = gap.length;
    return r;
  };

  const summary = (days = log.days) => {
    const r = replay(days);
    return {
      streak: r.streak, shown: r.streak >= SHOW_FROM ? r.streak : null, freezes: r.freezes, morningsLit: r.lit,
      repairActive: r.gap > 0, todayLit: days[today()]?.s === 'lit', states: r.states, protection: r.protection, first: r.first,
    };
  };
  const preview = () => {
    const t = today();
    return log.days[t]?.s === 'lit' ? summary() : summary({ ...log.days, [t]: { s: 'lit' } });
  };

  const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const week = () => {
    const s = summary(), t = today(), monday = shift(t, -((dateOf(t).getDay() + 6) % 7));
    return Array.from({ length: 7 }, (_, i) => {
      const k = shift(monday, i);
      const state = k > t ? 'future' : s.states[k] || (k === t ? 'today' : 'none');
      return { date: k, weekday: WEEKDAYS[dateOf(k).getDay()], state, mood: log.days[k]?.mood ?? null, today: k === t, protection: s.protection[k] || null };
    });
  };

  const isLit = rec => {
    const s = rec?.status;
    if (s === 'completed' || s === 'fell_asleep') return true;
    if (s !== 'partial' || !rec.core || rec.core.source === 'stored') return false;
    const trials = rec.core.rt?.trials || [];
    return trials.length >= 5 && trials.some(t => t.rt_ms != null);
  };

  const land = rec => {
    const at = new Date(rec?.started_iso || Date.now());
    const k = dayKey(isNaN(at) ? new Date() : at), prev = log.days[k];
    if (isLit(rec)) { if (prev?.s !== 'lit') log.days[k] = { s: 'lit', mood: rec.core?.mood_start ?? null }; }
    else if (rec?.status === 'declined' && !prev) log.days[k] = { s: 'declined' };
    else return summary();
    save();
    const after = summary();
    A.bus.emit('streak', after);
    return after;
  };

  const pausedUntil = () => pauseOn(today())?.to || null;
  const hubPause = (until, source = 'patient') => {
    const base = A.Hub?.httpBase?.();
    if (!base || !A.config?.patientId) return;
    fetch(`${base}/api/patients/${encodeURIComponent(A.config.patientId)}/pause`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source, from: today(), ...(until ? { until } : {}) }),
    }).catch(() => {});
  };
  const setPause = (until, source = 'patient', sync = true) => {
    const t = today();
    log.pauses = log.pauses.filter(p => p.to < t || p.from > t || p.source !== source)
      .concat(log.pauses.filter(p => p.source === source && p.from < t && p.to >= t).map(p => ({ ...p, to: shift(t, -1) })));
    if (until) {
      const cap = source === 'patient' ? shift(t, PAUSE_CAP - 1) : until;
      log.pauses.push({ from: t, to: until < t ? t : until > cap ? cap : until, source });
    }
    save();
    if (sync) hubPause(until, source);
    A.bus.emit('pause', pausedUntil());
    renderStart();
  };
  const pauseFor = kind => {
    const t = today(), d = dateOf(t);
    if (kind === 'today') return t;
    if (kind === 'monday') return shift(t, 6 - ((d.getDay() + 6) % 7));
    if (kind === 'month') return keyOf(new Date(d.getFullYear(), d.getMonth() + 1, 0));
    return null;
  };

  const seed = pattern => {
    if (log.seed === pattern) return;
    log = { ...blank(), seed: pattern };
    const t = today(), chars = [...pattern];
    chars.forEach((c, i) => {
      const k = shift(t, i - chars.length);
      if (c === 'L') log.days[k] = { s: 'lit', mood: SEED_MOODS[i % SEED_MOODS.length] };
      else if (c === 'D') log.days[k] = { s: 'declined' };
      else if (c === 'P') log.pauses.push({ from: k, to: k, source: 'patient' });
    });
    save();
  };

  const $ = id => document.getElementById(id);
  const div = (cls, html) => { const e = document.createElement('div'); e.className = cls; if (html) e.innerHTML = html; return e; };
  let mark = null, tickEl = null, moteEl = null, armed = false, shine = null, landed = null;

  const lanternAt = () => A.World?.lanternPos?.() || [$('phone').clientWidth * 0.35 + 20, $('phone').clientHeight * 0.82 - 30];
  function renderStart() {
    if (!mark) return;
    const s = summary(), n = !night() && prefs.showCount ? s.shown : null;
    mark.querySelector('.n').textContent = n ?? '';
    mark.querySelector('.chip').hidden = !n;
    mark.querySelector('.chip').setAttribute('aria-label', n ? `${n} mornings. Your mornings` : '');
    mark.querySelector('.bye').hidden = true;
    mark.hidden = !n;
  }

  const playTick = (from, to) => {
    const box = $('endCount');
    if (!box) return;
    tickEl?.remove();
    tickEl = document.createElement('span');
    tickEl.className = 'tick' + (from === to ? ' still' : from ? ' roll' : ' rise');
    tickEl.innerHTML = `<span class="old">${from ?? ''}</span><span class="new">${to}</span>`;
    const num = box.querySelector('.num');
    num.textContent = ''; num.append(tickEl);
    box.setAttribute('aria-label', `${to} mornings`);
    box.hidden = false;
  };

  const playMote = () => {
    moteEl?.remove();
    const phone = $('phone'), [x0, y0] = lanternAt(), W = phone.clientWidth, H = phone.clientHeight;
    const x1 = W * 0.72, y1 = H * 0.6 + 4;
    moteEl = div('mote');
    phone.append(moteEl);
    const at = (x, y, s) => `translate(${x}px, ${y}px) scale(${s})`;
    const calm = A.config?.reducedMotion;
    const frames = calm
      ? [{ transform: at(x1, y1, 0.5), opacity: 0 }, { transform: at(x1, y1, 0.5), opacity: 1 }]
      : [{ transform: at(x0, y0 - 6, 0.6), opacity: 0 }, { transform: at(x0, y0 - 24, 1), opacity: 1, offset: 0.18 },
        { transform: at((x0 + x1) / 2, Math.min(y0, y1) - H * 0.08, 0.85), opacity: 1, offset: 0.55 }, { transform: at(x1, y1, 0.5), opacity: 1 }];
    const anim = moteEl.animate?.(frames, { duration: calm ? 600 : 1700, delay: 200, easing: 'cubic-bezier(.33,.0,.2,1)', fill: 'both' });
    const settle = () => { moteEl?.classList.add('landed'); A.bus.emit('villageLight', { morningsLit: preview().morningsLit }); };
    if (anim) { anim.onfinish = settle; shine.anim = anim; } else settle();
  };

  const startShine = () => {
    if (shine || !armed) return;
    armed = false;
    const before = landed?.before ?? summary(), after = preview(), atNight = night();
    shine = { timers: [], night: atNight };
    $('end').classList.add('shining');
    if (!atNight && prefs.showCount && after.shown) playTick(before.shown, after.shown);
    playMote();
    A.bus.emit('shine', { night: atNight, morningsLit: after.morningsLit });
    shine.timers.push(setTimeout(() => endShine(false), SHINE_MS));
    setTimeout(() => $('phone').addEventListener('pointerdown', skip, { capture: true, once: true }), 0);
  };
  const skip = () => endShine(true);
  const endShine = skipped => {
    if (!shine || shine.over) return;
    shine.over = true;
    shine.timers.forEach(clearTimeout);
    $('phone').removeEventListener('pointerdown', skip, { capture: true });
    if (skipped) { shine.anim?.finish(); tickEl?.classList.add('done'); }
    $('end').classList.remove('shining'); $('end').classList.add('shone');
    A.bus.emit('shineEnd', { skipped });
  };
  const clearEnd = () => {
    if (shine && !shine.over) endShine(false);
    shine = null; armed = false;
    tickEl?.remove(); tickEl = null;
    if ($('endCount')) $('endCount').hidden = true;
    moteEl?.remove(); moteEl = null;
    $('end')?.classList.remove('shining', 'shone');
  };

  const mount = () => {
    const q = new URLSearchParams(location.search);
    if (!$('start')) return;
    if (q.has('days')) seed(q.get('days').toUpperCase());
    else if (q.has('streak')) seed('L'.repeat(Math.max(0, Math.min(400, Number(q.get('streak')) | 0))));
    mark = div('morning-mark', `<a class="chip state" href="patient.html${location.search}">${A.Glyph ? A.Glyph.laminate() : ''}<span class="n"></span><span class="u">mornings</span></a><p class="bye">See you tomorrow.</p>`);
    mark.setAttribute('role', 'status');
    const bar = $('start').querySelector('.top-bar');
    bar ? bar.after(mark) : $('start').append(mark);
    renderStart();
    setTimeout(renderStart, 400);

    A.bus.on('home', () => { clearEnd(); renderStart(); });
    A.bus.on('endScreen', () => { clearEnd(); landed = null; armed = true; });
    A.bus.on('mood', m => { if (m?.which === 'end') startShine(); });
    A.bus.on('sessionEnd', r => { if (armed && isLit(r) && !$('end').classList.contains('off')) startShine(); armed = false; renderStart(); });
    A.Hub?.on?.('pause', d => setPause(d?.pause?.until || null, d?.pause?.source || 'patient', false));
  };

  A.bus.on('ws', msg => {
    if (msg?.type !== 'session_end' || !msg.session) return;
    const before = summary(), s = land(msg.session);
    landed = { before, after: s };
    msg.session.extra = {
      ...msg.session.extra,
      streak: { streak_len: s.streak, freezes_held: s.freezes, repair_active: s.repairActive, mornings_lit: s.morningsLit, lit: isLit(msg.session), pause_until: pausedUntil() },
    };
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();

  A.Streak = {
    summary, preview, week, land, isLit, dayKey, today, shift, nightAt,
    hasData: () => Object.keys(log.days).length > 0,
    pausedUntil, setPause, pauseFor, PAUSE_CAP,
    refresh: () => renderStart(),
  };
})();
