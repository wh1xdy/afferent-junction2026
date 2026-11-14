// "Show to my doctor": the code is a link to the patient's dashboard, not the numbers themselves.
// The dashboard is the one the Share tab makes (qrexport.js, dashboard_gen.js). handover.js locks it on this
// phone and puts it on the relay (link with the key after '#'), or on the paired home hub (home network only);
// with neither it offers the file. The patient shows the code; nothing goes to a clinician by itself.
(() => {
  const LOG_MAX = 10;
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
    chev: '<path d="M9.5 6l6 6-6 6"/>',
    pulse: '<path d="M3 12.5h4l2.2-6 4 12 2.3-6H21"/>',
    thermo: '<path d="M10 14.2V5.5a2 2 0 0 1 4 0v8.7a3.8 3.8 0 1 1-4 0z"/><path d="M12 9.5v6"/>',
    lock: '<rect x="5.5" y="10.5" width="13" height="10" rx="2"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/>',
    wifi: '<path d="M3.5 9.5a12 12 0 0 1 17 0M6.5 12.8a7.5 7.5 0 0 1 11 0M9.6 16a3 3 0 0 1 4.8 0"/><path d="M12 19.2v.01"/>',
  };
  const VITALS = [['pulse_bpm', 'pulse'], ['breathing_per_min', 'breathing rate'], ['rmssd_ms', 'HRV (RMSSD)']];
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

  const record = (body, src) => body && typeof body === 'object' && body.period ? { body, saved_iso: body.cached_iso || null, src } : null;

  // The summary the dashboard is made from: the hub's qr-body, cached on this phone (qrpayload.js keeps the cache).
  async function sync() {
    const Q = codec();
    if (!cfg.hub || !Q) return null;
    try {
      const body = await fetchJSON(`${cfg.hub}/api/patients/${encodeURIComponent(cfg.pid)}/qr-body`);
      if (!record(body)) return null;
      await Q.cacheBody(body);
      return { body, saved_iso: new Date().toISOString(), src: 'hub' };
    } catch { return null; }
  }

  async function source() {
    const Q = codec();
    if (!Q) return null;
    try { const rec = record(await Q.cachedBody(), 'cache'); if (rec) return rec; } catch {}
    if (cfg.pid === 'anna') try { return record(await fetchJSON('js/qr_body_fallback.json'), 'saved'); } catch {}
    return null;
  }

  const parseDay = s => { const [y, m, d] = String(s || '').slice(0, 10).split('-').map(Number); return y ? new Date(y, m - 1, d) : null; };
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const longDay = d => `${d.getDate()} ${MONTHS[d.getMonth()]}`;
  const fullDay = d => `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  const shortDay = d => `${WD[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}`;
  const hm = d => `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
  const stamp = d => `${shortDay(d)} ${hm(d)}`;

  function period(body) {
    const p = body?.period || {};
    const end = parseDay(p.tms_end_date) || new Date();
    const from = Number.isFinite(p.from_day) ? p.from_day : 0, to = Number.isFinite(p.to_day) ? p.to_day : 0;
    return { from: addDays(end, Math.max(from, 0)), to: addDays(end, to), a: Math.max(1, Math.ceil(Math.max(from, 1) / 7)), b: Math.max(1, Math.ceil(to / 7)) };
  }

  // Which finger sensor numbers the dashboard has: a week counts when it holds a reading (never 0).
  function vitalsLine(body) {
    const v = body?.vitals || {};
    const rows = VITALS.filter(([k]) => (v.weekly?.[k] || []).some(x => Number.isFinite(x) && x > 0));
    if (!rows.length) return 'No finger sensor numbers: no reading in these weeks';
    const names = rows.map(([, name]) => name);
    const list = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0];
    return `Weekly ${list} from the finger sensor${rows.some(([k]) => v.simulated?.[k]) ? ' (simulated)' : ''}`;
  }

  // What the patient is told before the code is made, by the way it will most likely travel.
  function route() {
    if (A.Handover?.relay?.() && globalThis.crypto?.subtle) return 'relay';
    if (cfg.hub) return 'hub';
    return 'file';
  }
  const NOTE = {
    relay: 'The code is a link to this dashboard. It is locked on this phone, and only the code holds the key. The link lasts 7 days, and you can take it back in Settings.',
    hub: 'The code is a link to this dashboard on your home hub. It opens on your home network only.',
    file: 'There is no link to make here yet. You can save the dashboard as a file and hand it over.',
  };

  async function dashboard(rec, initial) {
    const extra = initial ? { initial } : {};
    if (A.Dashboard?.make) return A.Dashboard.make(rec, extra);
    return { body: rec.body, html: A.DashGen.render(rec.body, { source: rec.src, patient: cfg.pid, saved_iso: rec.saved_iso, ...extra }) };
  }

  async function handOver(rec, initial) {
    const dash = await dashboard(rec, initial);
    const H = A.Handover;
    const sim = !!rec.body.sim;
    const out = H ? await H.share({ html: dash.html, envelope: H.envelope(dash.html, { sim }), pid: cfg.pid, hub: cfg.hub }) : { kind: 'file', tried: ['no handover'] };
    if (out.tried?.length) console.log('handover:', out.kind, out.tried.join('; '));
    return { ...out, html: dash.html, sim, period: period(rec.body) };
  }

  function matrix(text) {
    const m = codec().matrix(text, 'M');
    return Array.from({ length: m.size }, (_, r) => Array.from({ length: m.size }, (_, c) => m.isDark(r, c)));
  }

  function draw(canvas, rows, avail) {
    const n = rows.length, total = n + 8, dpr = window.devicePixelRatio || 1;
    const per = Math.max(1, Math.floor(avail * dpr / total));
    const px = per * total;
    canvas.width = px; canvas.height = px;
    canvas.style.width = canvas.style.height = px / dpr + 'px';
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
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
    return `<svg viewBox="0 0 ${t} ${t}" shape-rendering="crispEdges" role="img" aria-label="Link to the dashboard"><rect width="${t}" height="${t}" fill="#FFFFFF"/><path d="${d}" fill="#000000"/></svg>`;
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

  function dragToClose(handle, target, close) {
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
    };
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
  }

  function fileName() { return `afferent-dashboard-${cfg.pid}.html`; }

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
    const vitalsItem = item(ICON.pulse, '');
    const way = route();
    const note = h('p', { class: 'qs-note', id: 'qsNote', 'data-way': way, text: NOTE[way] });
    const content = h('div', { class: 'qs-content' }, [
      h('p', { class: 'qs-sub', text: 'The code opens a dashboard with' }),
      h('ul', { class: 'qs-list' }, [
        item(ICON.twilight, '8 weeks of mornings: lanterns, play and the measures from play'),
        vitalsItem,
        item(ICON.thermo, 'Bedroom temperature and humidity at night, when measured'),
        item(ICON.checklist, 'Check-in totals, and safety answers as levels'),
        item(ICON.taskAlt, 'How complete the data is'),
        item(ICON.visOff, 'No name. No camera images. No pulse traces, only weekly numbers.'),
      ]),
      note,
      h('div', { class: 'qf' }, [ini, h('label', { for: 'qsIni', class: 'qf-label', text: 'Add an initial' }), h('p', { class: 'qf-help', id: 'qsIniHelp', text: 'Optional. Up to 3 letters, shown on the dashboard.' })]),
    ]);
    const empty = h('p', { class: 'qs-empty', text: 'Open Afferent at home once, so there is something to show.', hidden: true });
    const err = h('p', { class: 'qs-err', role: 'alert', hidden: true, text: 'The dashboard could not be made. Try again.' });
    const save = h('a', { class: 'qx-btn text', id: 'qsSave', href: '#', text: 'Save file' });
    const shareFile = h('button', { type: 'button', class: 'qx-btn text', id: 'qsShareFile', text: 'Share', hidden: true });
    const fileBox = h('div', { class: 'qs-file', id: 'qsFile', role: 'status', hidden: true }, [
      h('p', { class: 'qs-file-t', text: 'No link could be made just now. Save the dashboard as a file, or share it from this phone, and hand it over yourself.' }),
      h('div', { class: 'qs-row' }, [save, shareFile]),
    ]);
    const actions = h('div', { class: 'qs-actions' }, [show, h('div', { class: 'qs-row' }, [print, cancel])]);
    const panel = h('div', { class: 'qs', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'qsTitle' }, [
      h('div', { class: 'qs-handle', 'aria-hidden': 'true' }),
      h('div', { class: 'qs-head' }, [title, iconBtn('Talk to someone', ICON.talk, 'tonal', () => cfg.talk())]),
      periodLine, stale, content, empty, err, fileBox, actions,
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
      const t = Date.parse(r.saved_iso || r.body.generated_iso || '');
      const old = Number.isFinite(t) && Date.now() - t > 864e5;
      stale.hidden = !old;
      if (old) { const d = new Date(t); stale.textContent = `Last updated ${WEEKDAY[d.getDay()]} ${hm(d)}. Open Afferent at home to update.`; }
    };
    update(rec);

    let busy = false, fileUrl = null;
    const close = (keepFocus) => {
      if (!sheet) return;
      sheet = null;
      ini.value = '';
      if (fileUrl) { try { URL.revokeObjectURL(fileUrl); } catch {} fileUrl = null; }
      root.classList.add('out');
      const done = () => { root.remove(); if (!view) setInert(false); if (!keepFocus) opener?.focus?.(); };
      // slides down like a finished swipe (qrshow.css .out), or fades quickly with reduced motion
      setTimeout(done, reduced() ? 150 : 280);
      A.Swipe?.hold?.(reduced() ? 190 : 320);
    };
    const offerFile = html => {
      fileBox.hidden = false;
      note.hidden = true;
      try {
        if (fileUrl) URL.revokeObjectURL(fileUrl);
        fileUrl = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
        save.setAttribute('href', fileUrl);
        save.setAttribute('download', fileName());
      } catch {}
      const file = typeof File === 'function' ? new File([html], fileName(), { type: 'text/html' }) : null;
      let can = false;
      try { can = !!(file && navigator.canShare && navigator.canShare({ files: [file] })); } catch {}
      shareFile.hidden = !can;
      shareFile.onclick = async () => { try { await navigator.share({ files: [file], title: 'Afferent dashboard' }); } catch {} };
    };
    const go = async paper => {
      if (busy || !rec) return;
      busy = true;
      err.hidden = true;
      fileBox.hidden = true;
      show.disabled = print.disabled = true;
      const label = show.textContent;
      show.textContent = 'Making the link…';
      const initial = ini.value;
      try {
        const out = await handOver(rec, initial);
        // the link (or the file) is ready: a success; it could not be made: a soft miss
        A.Haptics?.play('success');
        if (out.kind === 'file') { offerFile(out.html); return; }
        log(out);
        if (paper) { printCode(out); renderLog(); return; }
        close(true);
        openView(rec, out, initial);
      } catch (e) {
        console.error('handover failed', e);
        err.hidden = false;
        A.Haptics?.play('miss', 0.6);
      } finally {
        busy = false;
        show.textContent = label;
        show.disabled = print.disabled = false;
      }
    };
    show.onclick = () => go(false);
    print.onclick = () => go(true);
    cancel.onclick = () => close();
    scrim.onclick = () => close();
    // a swipe down closes it, from the handle or once the content is scrolled to the top (gui/swipe.js on the phone)
    if (A.Swipe) A.Swipe.bind(root, () => (sheet ? { sheet: panel, scrim, handle: '.qs-handle, .qs-head', down: () => close(), leaves: 'self' } : null));
    else dragToClose(panel, panel, () => close());
    sheet = { close: () => close() };
    requestAnimationFrame(() => { root.classList.add('in'); title.focus({ preventScroll: true }); });
    const mine = sheet;
    source().then(r => {
      if (sheet !== mine) return;
      rec = r; update(rec);
      sync().then(f => { if (f && sheet === mine) { rec = f; update(rec); } });
    });
  }

  function whereText(share) {
    if (share.kind === 'hub') return 'On this network only';
    const until = new Date(share.expires || '');
    return isNaN(until) ? 'Open for 7 days' : `Open until ${shortDay(until)}`;
  }

  function openView(rec, share, initial) {
    const canvas = h('canvas', { class: 'qv-canvas', 'aria-hidden': 'true' });
    const relay = share.kind === 'relay';
    const codeBox = h('div', { class: 'qv-code', role: 'img', 'aria-label': relay ? 'Code for your doctor: a link to your dashboard.' : 'Code for your doctor: a link to your dashboard on your home network.' }, [canvas]);
    const where = h('p', { class: 'qv-where' + (relay ? '' : ' local'), id: 'qvWhere', text: whereText(share) });
    const how = h('p', { class: 'qv-how', id: 'qvHow', html: svg(relay ? ICON.lock : ICON.wifi) + `<span>${relay ? 'Locked. Only this code holds the key.' : 'Opens on the same Wi-Fi as your hub.'}</span>` });
    const bright = h('p', { class: 'qv-bright', html: svg(ICON.sun) + '<span>Turn brightness up</span>', hidden: device.native() });
    const weeks = h('p', { class: 'qv-weeks' });
    const takeBack = h('button', { type: 'button', class: 'qx-btn text', id: 'qvRevoke', text: 'Take back', hidden: !relay });
    const again = h('button', { type: 'button', class: 'qx-btn filled', id: 'qvAgain', text: 'Make a new code', hidden: true });
    const live = h('p', { class: 'qx-sr', 'aria-live': 'polite' });
    const sim = h('span', { class: 'qv-sim', text: 'Simulated', hidden: !share.sim });
    const closeBtn = iconBtn('Close', ICON.close, 'plain', () => close());
    const root = h('div', { class: 'qx qv' + (reduced() ? ' still' : ''), id: 'qrView', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Show to my doctor', 'data-kind': share.kind }, [
      h('div', { class: 'qv-bar' }, [closeBtn, sim, iconBtn('Talk to someone', ICON.talk, 'plain', () => cfg.talk())]),
      h('div', { class: 'qv-main' }, [codeBox, where, how, bright, weeks, takeBack, again]),
      live,
    ]);
    document.body.append(root);
    setInert(true);

    let rows = null;
    const avail = () => Math.max(120, Math.min(innerWidth - 32, innerHeight - 300, 520));
    const paint = () => { if (rows) draw(canvas, rows, avail()); };
    const load = s => {
      share = s;
      root.classList.remove('expired');
      root.dataset.kind = s.kind;
      again.hidden = true;
      takeBack.hidden = s.kind !== 'relay';
      takeBack.disabled = false;
      takeBack.textContent = 'Take back';
      where.textContent = whereText(s);
      const p = s.period;
      weeks.textContent = p.a ? `Weeks ${p.a} to ${p.b} after TMS` : `${longDay(p.from)} to ${longDay(p.to)}`;
      rows = matrix(s.link);
      paint();
    };
    const onResize = () => paint();
    const onVis = () => { if (document.hidden) device.off(); else device.on(); };
    const close = () => {
      if (!view) return;
      view = null;
      removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVis);
      device.off();
      root.classList.add('out');
      const done = () => { root.remove(); setInert(false); opener?.focus?.(); renderLog(); };
      reduced() ? done() : setTimeout(done, 200);
    };
    takeBack.onclick = async () => {
      takeBack.disabled = true;
      const ok = await revoke(share);
      if (!view) return;
      A.Haptics?.play(ok ? 'success' : 'miss', ok ? 0.7 : 0.6);
      if (ok) {
        root.classList.add('expired');
        where.textContent = 'Taken back. The link no longer opens.';
        takeBack.hidden = true;
        again.hidden = false;
        live.textContent = 'Taken back';
        again.focus?.();
      } else {
        takeBack.disabled = false;
        takeBack.textContent = 'Try again';
        live.textContent = 'Could not reach the server to take it back';
      }
    };
    again.onclick = async () => {
      again.disabled = true;
      try {
        const out = await handOver(rec, initial);
        if (out.kind === 'file') { close(); openSheet(); return; }
        log(out);
        load(out);
        A.Haptics?.play('success');
        closeBtn.focus();
      } finally { again.disabled = false; }
    };
    dragToClose(root, codeBox, close);
    addEventListener('resize', onResize);
    document.addEventListener('visibilitychange', onVis);
    view = { close };
    load(share);
    device.on();
    requestAnimationFrame(() => { root.classList.add('in'); closeBtn.focus({ preventScroll: true }); });
  }

  // What was handed over, newest first. A relay share keeps its id and revoke token here so it can be taken back;
  // the key never is: it lives only in the code.
  function log(share) {
    const list = store.get(logKey()) || [];
    const e = { t: new Date().toISOString(), kind: share.kind, from: isoDay(share.period.from), to: isoDay(share.period.to) };
    if (share.kind === 'relay') Object.assign(e, { id: share.id, base: share.base, revoke: share.revoke, expires: share.expires });
    list.unshift(e);
    store.set(logKey(), list.slice(0, LOG_MAX));
  }
  const isoDay = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  async function revoke(share) {
    let ok = false;
    try { ok = await A.Handover.revoke(share); } catch {}
    if (ok) {
      const list = store.get(logKey()) || [];
      list.forEach(e => { if (e.kind === 'relay' && e.id === share.id) { e.revoked = true; delete e.revoke; } });
      store.set(logKey(), list);
    }
    return ok;
  }

  const active = e => e.kind === 'relay' && !e.revoked && e.revoke && !(Date.parse(e.expires) <= Date.now());

  function renderLog() {
    const ul = document.getElementById('qrLog');
    if (!ul) return;
    const list = (store.get(logKey()) || []).slice(0, 3);
    ul.replaceChildren(...list.map(e => {
      const when = stamp(new Date(e.t));
      if (e.kind === 'hub') return h('li', { text: `Shown on your home network · ${when}` });
      if (e.kind !== 'relay') return h('li', { text: `Shown to your doctor · ${when}` });
      const until = new Date(e.expires || '');
      const state = e.revoked ? 'taken back' : !active(e) ? 'ended' : isNaN(until) ? 'open' : `open until ${shortDay(until)}`;
      const li = h('li', { class: 'qr-log-share' }, [h('span', { text: `Shared with your doctor · ${when} · ${state}` })]);
      if (active(e)) {
        const b = h('button', { type: 'button', class: 'qr-take', text: 'Take back', 'aria-label': `Take back the link shared ${when}` });
        b.onclick = async () => {
          b.disabled = true;
          if (await revoke(e)) renderLog();
          else { b.disabled = false; b.textContent = 'Try again'; }
        };
        li.append(b);
      }
      return li;
    }));
    ul.hidden = !list.length;
  }

  function printCode(share) {
    const sec = document.getElementById('qrPrint');
    if (!sec) return;
    const p = share.period, made = new Date();
    const until = new Date(share.expires || '');
    sec.replaceChildren(
      h('p', { class: 'qp-mark', text: 'afferent' }),
      share.sim ? h('p', { class: 'qp-sim', text: 'SIMULATED DATA' }) : null,
      h('h1', { class: 'qp-title', text: 'Dashboard link for your clinic' }),
      h('div', { class: 'qp-codes' }, [h('figure', { class: 'qp-code' }, [h('div', { html: svgCode(matrix(share.link)) })])]),
      h('p', { text: 'Scan the code to open the dashboard in a browser.' }),
      h('p', { text: share.kind === 'hub' ? 'It opens on the patient’s home network only.' : `It is locked, and only this code holds the key. Open until ${isNaN(until) ? '7 days after it was made' : fullDay(until)}.` }),
      h('p', { text: `Data from ${fullDay(p.from)} to ${fullDay(p.to)} · made ${fullDay(made)}` }),
      h('p', { class: 'qp-foot', text: 'Research prototype. Not a CE-marked medical device. Not for clinical use.' }),
    );
    sec.dataset.kind = share.kind;
    window.print();
  }

  addEventListener('keydown', e => {
    if (supportOpen()) return;
    if (e.key === 'Escape' && (view || sheet)) { e.preventDefault(); (view || sheet).close(); }
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
