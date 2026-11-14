(() => {
  const SCREEN_TTL = 600, PAPER_TTL = 2592000, CYCLE_MS = 2500, LOG_MAX = 10;
  const FJORD = '#0E1A2E';
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const WEEKDAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const ICON = {
    close: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
    talk: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3.6"/><path d="M6 6l3.45 3.45M18 6l-3.45 3.45M6 18l3.45-3.45M18 18l-3.45-3.45"/>',
    qr: '<rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><path d="M14 14h2.5v2.5M20 14v.01M14 20h.01M17 20h3v-3M17 17h.01"/>',
    twilight: '<path d="M3.5 18.5h17"/><path d="M7 18.5a5 5 0 0 1 10 0"/><path d="M12 7v2.4M5.9 10.2l1.6 1.6M18.1 10.2l-1.6 1.6"/>',
    checklist: '<path d="M4 7l1.8 1.8L9 5.6M4 15l1.8 1.8L9 13.6"/><path d="M12.5 7.5h7.5M12.5 15.5h7.5"/>',
    taskAlt: '<path d="M20 11.2V12a8 8 0 1 1-4.7-7.3"/><path d="M8.5 11.5l3 3L20 6"/>',
    visOff: '<path d="M3.5 12s3-6 8.5-6c1.6 0 3 .5 4.2 1.2M20.5 12s-3 6-8.5 6c-1.6 0-3-.5-4.2-1.2"/><path d="M10 10a2.8 2.8 0 0 0 4 4"/><path d="M4.5 4.5l15 15"/>',
    sun: '<circle cx="12" cy="12" r="3.8"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4"/>',
    prev: '<path d="M14.5 6l-6 6 6 6"/>',
    next: '<path d="M9.5 6l6 6-6 6"/>',
    chev: '<path d="M9.5 6l6 6-6 6"/>',
    pulse: '<path d="M3 12.5h4l2.2-6 4 12 2.3-6H21"/>',
    thermo: '<path d="M10 14.2V5.5a2 2 0 0 1 4 0v8.7a4 4 0 1 1-4 0z"/><path d="M12 11v5"/>',
  };
  const VITALS = [['pulse_bpm', 'pulse', 'Pulse, finger sensor', 'bpm'], ['breathing_per_min', 'breathing rate', 'Breathing rate', 'per minute'], ['rmssd_ms', 'HRV (RMSSD)', 'HRV (RMSSD)', 'ms']];
  // The bedroom at night (map key 19, hub/afferent_hub/room.py): [key, label, unit, decimals].
  const ROOM = [['temp_c_night', 'Temperature at night', '°C', 1], ['humidity_pct', 'Humidity at night', '%', 0]];
  const DASH = '–';
  const svg = (p, cls = '') => `<svg viewBox="0 0 24 24" class="${cls}" aria-hidden="true">${p}</svg>`;
  const h = (tag, attrs = {}, kids = []) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'text') n.textContent = v;
      else if (k === 'html') n.innerHTML = v;
      else if (v !== null && v !== undefined && v !== false) n.setAttribute(k, v);
    }
    for (const c of [].concat(kids)) if (c) n.append(c);
    return n;
  };
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.dataset.motion === 'reduced';
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  };

  let cfg = { pid: 'anna', hub: null, talk: () => {} };
  const logKey = () => 'afferent.qrshown.' + cfg.pid;

  const codec = () => A.QR || null;

  async function fetchJSON(url, ms = 2500) {
    const ac = new AbortController(), t = setTimeout(() => ac.abort(), ms);
    try {
      const r = await fetch(url, { signal: ac.signal, cache: 'no-store' });
      if (!r.ok) throw new Error(r.status);
      return await r.json();
    } finally { clearTimeout(t); }
  }

  const record = body => body && typeof body === 'object' && body.period ? { body, saved_iso: body.cached_iso || null } : null;

  async function sync() {
    const Q = codec();
    if (!cfg.hub || !Q) return null;
    try {
      const body = await fetchJSON(`${cfg.hub}/api/patients/${encodeURIComponent(cfg.pid)}/qr-body`);
      if (!record(body)) return null;
      await Q.cacheBody(body);
      return { body, saved_iso: new Date().toISOString() };
    } catch { return null; }
  }

  async function source() {
    const Q = codec();
    if (!Q) return null;
    try { const rec = record(await Q.cachedBody()); if (rec) return rec; } catch {}
    if (cfg.pid === 'anna') try { return record(await fetchJSON('js/qr_body_fallback.json')); } catch {}
    return null;
  }

  const parseDay = s => { const [y, m, d] = String(s || '').slice(0, 10).split('-').map(Number); return y ? new Date(y, m - 1, d) : null; };
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const longDay = d => `${d.getDate()} ${MONTHS[d.getMonth()]}`;
  const fullDay = d => `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  const hm = d => `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
  const stamp = d => `${WD[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)} ${hm(d)}`;

  function period(body) {
    const p = body?.period || {};
    const end = parseDay(p.tms_end_date) || new Date();
    const from = Number.isFinite(p.from_day) ? p.from_day : 0, to = Number.isFinite(p.to_day) ? p.to_day : 0;
    return { from: addDays(end, Math.max(from, 0)), to: addDays(end, to), a: Math.max(1, Math.ceil(Math.max(from, 1) / 7)), b: Math.max(1, Math.ceil(to / 7)) };
  }

  const crockford = s => String(s || '').toUpperCase().replace(/[^0-9A-Z]/g, '');
  const fpGroups = s => { const c = crockford(s); return c ? c.match(/.{1,4}/g).join(' ') : ''; };
  const fpSpoken = s => crockford(s).split('').join(', ');

  function vitalRows(body) {
    const Q = codec();
    let v = null;
    try { v = Q.unpack(Q.pack(body)).vitals || null; } catch {}
    return VITALS.map(([k, name, label, unit]) => ({ name, label, unit, weeks: v?.weekly?.[k] || [], sim: !!v?.simulated?.[k] })).filter(r => r.weeks.some(x => x !== null));
  }

  function vitalsLine(body) {
    const rows = vitalRows(body);
    if (!rows.length) return 'No finger sensor numbers: no reading in these weeks';
    const names = rows.map(r => r.name);
    const list = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0];
    return `Weekly ${list} from the finger sensor${rows.some(r => r.sim) ? ' (simulated)' : ''}`;
  }

  function roomRows(body) {
    const Q = codec();
    let r = null;
    try { r = Q.unpack(Q.pack(body)).room || null; } catch {}
    return ROOM.map(([k, label, unit, dp]) => ({ label, unit, dp, weeks: r?.weekly?.[k] || [], sim: !!r?.simulated })).filter(x => x.weeks.some(v => v !== null));
  }

  function roomLine(body) {
    const rows = roomRows(body);
    if (!rows.length) return 'No bedside temperature: no reading in these weeks';
    return `Weekly ${rows.length > 1 ? 'temperature and humidity' : 'temperature'} at your bedside at night${rows[0].sim ? ' (simulated)' : ''}`;
  }

  async function key(Q) {
    try { return await Q.deviceKey(); } catch { return Q.newKey(); }
  }

  async function build(rec, paper, initial) {
    const Q = codec();
    const r = Q.encode(rec.body, { key: await key(Q), paper, initial: initial || undefined, ttl: paper ? PAPER_TTL : SCREEN_TTL });
    return { parts: r.parts, ecl: r.ecl, iat: r.iat, exp: r.exp, fp: fpGroups(r.fingerprint), sim: !!rec.body.sim, period: period(rec.body), vitals: vitalRows(rec.body), room: roomRows(rec.body) };
  }

  function matrix(text, ecl) {
    const m = codec().matrix(text, ecl);
    return Array.from({ length: m.size }, (_, r) => Array.from({ length: m.size }, (_, c) => m.isDark(r, c)));
  }

  function draw(canvas, rows, avail) {
    const n = rows.length, total = n + 8, dpr = window.devicePixelRatio || 1;
    const per = Math.max(1, Math.floor(avail * dpr / total));
    const px = per * total;
    canvas.width = px; canvas.height = px;
    canvas.style.width = canvas.style.height = px / dpr + 'px';
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, px, px);
    ctx.fillStyle = FJORD;
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (rows[r][c]) ctx.fillRect((c + 4) * per, (r + 4) * per, per, per);
    canvas.dataset.modules = n;
    canvas.dataset.ppm = per;
  }

  function svgCode(rows) {
    const n = rows.length, t = n + 8;
    let d = '';
    for (let r = 0; r < n; r++) {
      let c = 0;
      while (c < n) {
        if (!rows[r][c]) { c++; continue; }
        const s = c;
        while (c < n && rows[r][c]) c++;
        d += `M${s + 4} ${r + 4}h${c - s}v1h${s - c}z`;
      }
    }
    return `<svg viewBox="0 0 ${t} ${t}" shape-rendering="crispEdges" role="img" aria-label="Code for your clinic"><rect width="${t}" height="${t}" fill="#FFFFFF"/><path d="${d}" fill="#000000"/></svg>`;
  }

  const device = (() => {
    let saved = null, lock = null, theme = null;
    const P = () => window.Capacitor?.Plugins || {};
    const meta = () => document.querySelector('meta[name="theme-color"]');
    return {
      native: () => !!P().ScreenBrightness,
      async on() {
        const m = meta();
        if (m && theme === null) { theme = m.content; m.content = '#FFFFFF'; }
        const p = P();
        try { p.StatusBar?.setStyle?.({ style: 'LIGHT' }); } catch {}
        try {
          if (p.ScreenBrightness) {
            if (saved === null) saved = (await p.ScreenBrightness.getBrightness())?.brightness ?? null;
            await p.ScreenBrightness.setBrightness({ brightness: 1 });
          }
        } catch {}
        try {
          if (p.KeepAwake) await p.KeepAwake.keepAwake();
          else if (navigator.wakeLock && !lock) { lock = await navigator.wakeLock.request('screen'); lock.addEventListener?.('release', () => { lock = null; }); }
        } catch {}
      },
      async off() {
        const m = meta();
        if (m && theme !== null) { m.content = theme; theme = null; }
        const p = P();
        try {
          if (p.ScreenBrightness && saved !== null) await p.ScreenBrightness.setBrightness({ brightness: saved });
        } catch {}
        saved = null;
        try { if (p.KeepAwake) await p.KeepAwake.allowSleep(); } catch {}
        try { await lock?.release(); } catch {}
        lock = null;
      },
    };
  })();

  const BACKGROUND = ['hero', 'bar', 'page', 'nav'];
  const setInert = on => BACKGROUND.forEach(id => { const n = document.getElementById(id); if (n) n.inert = on; });
  const supportOpen = () => !!document.querySelector('.ci:not(.hidden)');

  let sheet = null, view = null, opener = null;

  function iconBtn(label, icon, cls, onclick) {
    const b = h('button', { type: 'button', class: `qx-ib ${cls || ''}`, 'aria-label': label, html: svg(icon) });
    b.onclick = onclick;
    return b;
  }

  function dragToClose(handle, target, close, horizontal) {
    let g = null;
    handle.addEventListener('pointerdown', e => {
      if (e.button || e.target.closest('button, input, a')) return;
      g = { id: e.pointerId, x: e.clientX, y: e.clientY, dx: 0, dy: 0 };
    });
    handle.addEventListener('pointermove', e => {
      if (!g || e.pointerId !== g.id) return;
      g.dx = e.clientX - g.x; g.dy = e.clientY - g.y;
      if (g.dy > 8 && g.dy > Math.abs(g.dx)) target.style.transform = `translateY(${g.dy}px)`;
    });
    const end = e => {
      if (!g || e.pointerId !== g.id) return;
      const { dx, dy } = g; g = null;
      target.style.transform = '';
      if (e.type === 'pointercancel') return;
      if (dy > 100 && dy > Math.abs(dx) * 1.3) close();
      else if (horizontal && Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.3) horizontal(dx < 0 ? 1 : -1);
    };
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
  }

  function openSheet() {
    if (sheet || view) return;
    opener = document.activeElement;
    let rec;

    const scrim = h('div', { class: 'qs-scrim' });
    const title = h('h2', { class: 'qs-title', id: 'qsTitle', tabindex: '-1', text: 'Show to my doctor' });
    const periodLine = h('p', { class: 'qs-period' });
    const stale = h('p', { class: 'qs-stale', hidden: true });
    const ini = h('input', { id: 'qsIni', class: 'qf-in', type: 'text', inputmode: 'text', autocapitalize: 'characters', autocomplete: 'off', spellcheck: 'false', maxlength: '3', placeholder: ' ', 'aria-describedby': 'qsIniHelp' });
    ini.oninput = () => { const v = ini.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3); if (v !== ini.value) ini.value = v; };
    const show = h('button', { type: 'button', class: 'qx-btn filled', id: 'qsShow', text: 'Show code' });
    const print = h('button', { type: 'button', class: 'qx-btn text', id: 'qsPrint', html: 'Print or save as PDF' });
    const cancel = h('button', { type: 'button', class: 'qx-btn text', id: 'qsCancel', text: 'Cancel' });
    const item = (icon, text) => h('li', {}, [h('span', { class: 'qs-li', html: svg(icon) }), h('span', { text })]);
    const vitalsItem = item(ICON.pulse, ''), roomItem = item(ICON.thermo, '');
    const content = h('div', { class: 'qs-content' }, [
      h('p', { class: 'qs-sub', text: 'This code holds' }),
      h('ul', { class: 'qs-list' }, [
        item(ICON.twilight, '8 weeks of mornings: lanterns, play and the measures from play'),
        vitalsItem,
        roomItem,
        item(ICON.checklist, 'Check-in totals, and safety answers as levels'),
        item(ICON.taskAlt, 'How complete the data is'),
        item(ICON.visOff, 'No name. No camera images. No pulse traces, only weekly numbers.'),
      ]),
      h('p', { class: 'qs-note', text: 'Anyone who scans this code can read it. It is not sent anywhere: you show it or hand it over yourself.' }),
      h('div', { class: 'qf' }, [ini, h('label', { for: 'qsIni', class: 'qf-label', text: 'Add an initial' }), h('p', { class: 'qf-help', id: 'qsIniHelp', text: 'Optional. Up to 3 letters.' })]),
    ]);
    const empty = h('p', { class: 'qs-empty', text: 'Open Afferent at home once, so there is something to show.', hidden: true });
    const err = h('p', { class: 'qs-err', role: 'alert', hidden: true, text: 'The code could not be made. Try again.' });
    const actions = h('div', { class: 'qs-actions' }, [show, h('div', { class: 'qs-row' }, [print, cancel])]);
    const panel = h('div', { class: 'qs', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'qsTitle' }, [
      h('div', { class: 'qs-handle', 'aria-hidden': 'true' }),
      h('div', { class: 'qs-head' }, [title, iconBtn('Talk to someone', ICON.talk, 'tonal', () => cfg.talk())]),
      periodLine, stale, content, empty, err, actions,
      h('p', { class: 'qs-foot', text: 'Research prototype. Not a CE-marked medical device. Not for clinical use.' }),
    ]);
    const root = h('div', { class: 'qx qs-root' + (reduced() ? ' still' : ''), id: 'qrSheet' }, [scrim, panel]);
    document.body.append(root);
    setInert(true);

    const update = r => {
      show.disabled = print.disabled = r === undefined;
      if (r === undefined) return;
      const has = !!r;
      content.hidden = !has; show.hidden = !has; print.hidden = !has; empty.hidden = has;
      if (!has) { periodLine.textContent = ''; stale.hidden = true; return; }
      const p = period(r.body);
      periodLine.textContent = `Data from ${longDay(p.from)} to ${longDay(p.to)}`;
      vitalsItem.lastChild.textContent = vitalsLine(r.body);
      roomItem.lastChild.textContent = roomLine(r.body);
      const t = Date.parse(r.saved_iso || r.body.generated_iso || '');
      const old = Number.isFinite(t) && Date.now() - t > 864e5;
      stale.hidden = !old;
      if (old) { const d = new Date(t); stale.textContent = `Last updated ${WEEKDAY[d.getDay()]} ${hm(d)}. Open Afferent at home to update.`; }
    };
    update(rec);

    let busy = false;
    const close = (keepFocus) => {
      if (!sheet) return;
      sheet = null;
      ini.value = '';
      root.classList.add('out');
      const done = () => { root.remove(); if (!view) setInert(false); if (!keepFocus) opener?.focus?.(); };
      reduced() ? done() : setTimeout(done, 200);
    };
    const go = async paper => {
      if (busy || !rec) return;
      busy = true;
      err.hidden = true;
      const initial = ini.value;
      try {
        const enc = await build(rec, paper, initial);
        if (paper) { printCode(enc); return; }
        close(true);
        await openView(rec, enc, initial);
      } catch (e) {
        console.error('qr build failed', e);
        err.hidden = false;
      } finally { busy = false; }
    };
    show.onclick = () => go(false);
    print.onclick = () => go(true);
    cancel.onclick = () => close();
    scrim.onclick = () => close();
    dragToClose(panel, panel, () => close());
    sheet = { close: () => close() };
    requestAnimationFrame(() => { root.classList.add('in'); title.focus({ preventScroll: true }); });
    const mine = sheet;
    source().then(r => {
      if (sheet !== mine) return;
      rec = r; update(rec);
      sync().then(f => { if (f && sheet === mine) { rec = f; update(rec); } });
    });
  }

  async function openView(rec, enc, initial) {
    const canvas = h('canvas', { class: 'qv-canvas', 'aria-hidden': 'true' });
    const codeBox = h('div', { class: 'qv-code', role: 'img', 'aria-label': 'Code for your doctor. Valid for 10 minutes.' }, [canvas]);
    const pill = h('span', { class: 'qv-pill', id: 'qvPill' });
    const prev = iconBtn('Previous code', ICON.prev, 'plain', () => step(-1, true));
    const next = iconBtn('Next code', ICON.next, 'plain', () => step(1, true));
    const chunk = h('div', { class: 'qv-chunk', hidden: true }, [prev, pill, next]);
    const bright = h('p', { class: 'qv-bright', html: svg(ICON.sun) + '<span>Turn brightness up</span>', hidden: device.native() });
    const fp = h('p', { class: 'qv-fp', id: 'qvFp' });
    const ring = h('span', { class: 'qv-ring', html: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle class="trk" cx="12" cy="12" r="9"/><circle class="arc" cx="12" cy="12" r="9" pathLength="100"/></svg>' });
    const countText = h('span', { id: 'qvCount' });
    const count = h('p', { class: 'qv-count' }, [ring, countText]);
    const weeks = h('p', { class: 'qv-weeks' });
    const again = h('button', { type: 'button', class: 'qx-btn filled', id: 'qvAgain', text: 'Show again', hidden: true });
    const live = h('p', { class: 'qx-sr', 'aria-live': 'polite' });
    const sim = h('span', { class: 'qv-sim', text: 'Simulated', hidden: true });
    const closeBtn = iconBtn('Close', ICON.close, 'plain', () => close());
    const root = h('div', { class: 'qx qv' + (reduced() ? ' still' : ''), id: 'qrView', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Show to my doctor' }, [
      h('div', { class: 'qv-bar' }, [closeBtn, sim, iconBtn('Talk to someone', ICON.talk, 'plain', () => cfg.talk())]),
      h('div', { class: 'qv-main' }, [codeBox, chunk, bright, fp, count, weeks, again]),
      live,
    ]);
    document.body.append(root);
    setInert(true);

    let i = 0, mats = [], cycle = 0, tick = 0, manual = false, expired = false;
    const avail = () => Math.max(120, Math.min(innerWidth - 32, innerHeight - 260, 640));
    const paint = () => { if (mats[i]) draw(canvas, mats[i], avail()); };
    const step = (d, byHand) => {
      if (mats.length < 2) return;
      if (byHand) { manual = true; clearInterval(cycle); pill.setAttribute('aria-live', 'polite'); }
      i = (i + d + mats.length) % mats.length;
      pill.textContent = `${i + 1} of ${mats.length}`;
      paint();
    };
    const fmt = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    const update = () => {
      const left = Math.max(0, Math.ceil(enc.exp - Date.now() / 1000));
      const ttl = Math.max(1, enc.exp - enc.iat);
      ring.querySelector('.arc').style.strokeDashoffset = String(100 - 100 * Math.min(1, left / ttl));
      if (left > 0) { countText.textContent = `Valid for ${fmt(left)}`; return; }
      if (expired) return;
      expired = true;
      clearTimeout(tick); clearInterval(cycle);
      root.classList.add('expired');
      countText.textContent = 'Expired';
      again.hidden = false;
      live.textContent = 'Expired';
    };
    const run = () => {
      clearTimeout(tick);
      update();
      if (!expired) tick = setTimeout(run, 1000 - Date.now() % 1000 + 20);
    };
    const load = async e => {
      enc = e;
      expired = false; manual = false; i = 0;
      root.classList.remove('expired');
      again.hidden = true;
      sim.hidden = !enc.sim;
      fp.textContent = enc.fp;
      fp.hidden = !enc.fp;
      fp.setAttribute('aria-label', `Fingerprint ${fpSpoken(enc.fp)}`);
      const p = enc.period;
      weeks.textContent = p.a ? `Weeks ${p.a} to ${p.b} after TMS` : `${longDay(p.from)} to ${longDay(p.to)}`;
      mats = enc.parts.map(pt => matrix(pt, enc.ecl));
      chunk.hidden = mats.length < 2;
      pill.textContent = `1 of ${mats.length}`;
      pill.removeAttribute('aria-live');
      root.dataset.parts = mats.length;
      paint();
      clearInterval(cycle); clearTimeout(tick);
      if (mats.length > 1) cycle = setInterval(() => { if (!manual) step(1); }, CYCLE_MS);
      run();
      log(enc);
    };
    const onResize = () => paint();
    const onVis = () => {
      if (document.hidden) { device.off(); return; }
      run();
      if (!expired) device.on();
    };
    const close = () => {
      if (!view) return;
      view = null;
      clearInterval(cycle); clearTimeout(tick);
      removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVis);
      device.off();
      root.classList.add('out');
      const done = () => { root.remove(); setInert(false); opener?.focus?.(); renderLog(); };
      reduced() ? done() : setTimeout(done, 200);
    };
    again.onclick = async () => {
      again.disabled = true;
      try { await load(await build(rec, false, initial)); await device.on(); closeBtn.focus(); } finally { again.disabled = false; }
    };
    dragToClose(root, codeBox, close, d => step(d, true));
    addEventListener('resize', onResize);
    document.addEventListener('visibilitychange', onVis);
    view = { close, step };
    await load(enc);
    device.on();
    requestAnimationFrame(() => { root.classList.add('in'); closeBtn.focus({ preventScroll: true }); });
  }

  function log(enc) {
    const list = store.get(logKey()) || [];
    list.unshift({ t: new Date().toISOString(), from: isoDay(enc.period.from), to: isoDay(enc.period.to) });
    store.set(logKey(), list.slice(0, LOG_MAX));
  }
  const isoDay = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  function renderLog() {
    const ul = document.getElementById('qrLog');
    if (!ul) return;
    const list = (store.get(logKey()) || []).slice(0, 3);
    ul.replaceChildren(...list.map(e => h('li', { text: `Shown to your doctor · ${stamp(new Date(e.t))}` })));
    ul.hidden = !list.length;
  }

  function printCode(enc) {
    const sec = document.getElementById('qrPrint');
    if (!sec) return;
    const n = enc.parts.length;
    const codes = enc.parts.map((t, i) => h('figure', { class: 'qp-code' }, [h('div', { html: svgCode(matrix(t, enc.ecl)) }), n > 1 ? h('figcaption', { text: `${i + 1} of ${n}` }) : null]));
    const p = enc.period, made = new Date(enc.iat * 1000), until = new Date(enc.exp * 1000);
    const shortDay = d => `${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}`;
    const cells = (tag, list) => list.map(text => h(tag, { text }));
    const weekFrom = k => { const d = addDays(p.to, 7 * k - 55); return shortDay(d < p.from ? p.from : d); };
    const vitals = enc.vitals?.length ? h('table', { class: 'qp-vit' }, [
      h('caption', { text: 'Finger sensor, weekly medians. A dash is a week without a reading.' }),
      h('tr', {}, cells('th', ['Week from', ...Array.from({ length: 8 }, (_, k) => weekFrom(k))])),
      ...enc.vitals.map(r => h('tr', {}, [h('th', { text: `${r.label}, ${r.unit}${r.sim ? ', simulated' : ''}` }), ...cells('td', r.weeks.map(x => (x === null ? DASH : x.toFixed(1))))])),
    ]) : null;
    const room = enc.room?.length ? h('table', { class: 'qp-room' }, [
      h('caption', { text: `At your bedside at night, 23:00 to 07:00, weekly medians${enc.room[0].sim ? ', simulated' : ''}. A dash is a week without a reading.` }),
      h('tr', {}, cells('th', ['Week from', ...Array.from({ length: 8 }, (_, k) => weekFrom(k))])),
      ...enc.room.map(r => h('tr', {}, [h('th', { text: `${r.label}, ${r.unit}` }), ...cells('td', r.weeks.map(x => (x === null ? DASH : x.toFixed(r.dp))))])),
    ]) : null;
    sec.replaceChildren(
      h('p', { class: 'qp-mark', text: 'afferent' }),
      enc.sim ? h('p', { class: 'qp-sim', text: 'SIMULATED DATA' }) : null,
      h('h1', { class: 'qp-title', text: 'Summary code for your clinic' }),
      h('div', { class: 'qp-codes' + (n > 2 ? ' three' : '') }, codes),
      enc.fp ? h('p', { class: 'qp-fp', text: enc.fp }) : null,
      h('p', { text: `Data from ${fullDay(p.from)} to ${fullDay(p.to)}` }),
      vitals,
      room,
      h('p', { text: `Made ${fullDay(made)} · valid until ${fullDay(until)}` }),
      h('p', { text: 'Scan it in the Afferent clinic dashboard with Scan patient code.' }),
      h('p', { class: 'qp-foot', text: 'Research prototype. Not a CE-marked medical device. Not for clinical use.' }),
    );
    sec.dataset.parts = n;
    window.print();
  }

  addEventListener('keydown', e => {
    if (supportOpen()) return;
    if (e.key === 'Escape' && (view || sheet)) { e.preventDefault(); (view || sheet).close(); }
    else if (view && (e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !e.target.closest?.('input')) view.step(e.key === 'ArrowRight' ? 1 : -1, true);
  });
  window.Capacitor?.Plugins?.App?.addListener?.('backButton', () => {
    if (supportOpen()) return;
    (view || sheet)?.close();
  });

  A.QRShow = {
    init(o) {
      cfg = { ...cfg, ...o };
      for (const id of ['qrTop', 'qrRow']) { const b = document.getElementById(id); if (b) b.onclick = openSheet; }
      renderLog();
    },
    open: openSheet,
    close: () => { view?.close(); sheet?.close(); },
    sync,
    icon: ICON.qr,
  };
})();
