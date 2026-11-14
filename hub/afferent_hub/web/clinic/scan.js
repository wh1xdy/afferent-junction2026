(() => {
  const C = window.C, esc = C.esc;
  const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const MO = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const pad = (n) => String(n).padStart(2, '0');
  const asDate = (x) => (x instanceof Date ? x : typeof x === 'number' ? new Date(x * 1000) : new Date(x));
  const day = (x) => { const d = asDate(x); return `${WD[d.getDay()]} ${d.getDate()} ${MO[d.getMonth()]}`; };
  const when = (x) => { const d = asDate(x); return `${day(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  const icon = (n, cls = '') => `<span class="ms ${cls}" aria-hidden="true">${n}</span>`;
  const info = (t) => `<button class="info" type="button" aria-label="${esc(t)}" data-tip="${esc(t)}">${icon('info')}</button>`;
  const TRUST_INFO = 'Compare with the patient\'s screen. Checks the phone, not the person.';

  let db = null;
  const keys = new Map(), imports = new Map();
  const req = (r) => new Promise((res) => { r.onsuccess = () => res(r.result); r.onerror = () => res(null); });
  function openDb() {
    return new Promise((res) => {
      try {
        const r = indexedDB.open('afferent-clinic', 1);
        r.onupgradeneeded = () => { r.result.createObjectStore('keys', { keyPath: 'fp' }); r.result.createObjectStore('imports', { keyPath: 'cti' }); };
        r.onsuccess = () => res(r.result);
        r.onerror = () => res(null);
      } catch { res(null); }
    });
  }
  function write(store, fn) {
    if (!db) return Promise.resolve();
    return new Promise((res) => {
      try {
        const t = db.transaction(store, 'readwrite');
        fn(t.objectStore(store));
        t.oncomplete = t.onerror = t.onabort = () => res();
      } catch { res(); }
    });
  }

  const codes = (C.codes = {
    transient: null,
    ready: (async () => {
      db = await openDb();
      if (!db) return;
      try {
        const t = db.transaction(['keys', 'imports']);
        const [k, i] = await Promise.all([req(t.objectStore('keys').getAll()), req(t.objectStore('imports').getAll())]);
        (k || []).forEach((x) => keys.set(x.fp, x));
        (i || []).forEach((x) => imports.set(x.cti, x));
      } catch {}
    })(),
    all: () => [...imports.values()],
    get: (cti) => (cti === 'once' ? codes.transient : imports.get(cti)),
    key: (fp) => keys.get(fp),
    label(imp) {
      const ks = [...keys.values()].filter((k) => k.record_id === imp.record_id).sort((a, b) => b.first_seen_iso.localeCompare(a.first_seen_iso));
      return ks[0]?.label || imp.label || 'Patient';
    },
    records() {
      const seen = new Map();
      for (const k of keys.values()) if (!seen.has(k.record_id)) seen.set(k.record_id, codes.label({ record_id: k.record_id }));
      return [...seen].map(([id, label]) => ({ id, label }));
    },
    async trust(r, label, recordId, at) {
      const k = { fp: r.fp, pub: [...r.pub], label, first_seen_iso: at || new Date().toISOString(), record_id: recordId || r.fp };
      keys.set(k.fp, k);
      await write('keys', (s) => s.put(k));
      return k;
    },
    async add(r, k, extra = {}) {
      const imp = { cti: r.cti, record_id: k.record_id, fp: r.fp, label: k.label, scanned_iso: new Date().toISOString(), iat: r.iat, exp: r.exp, raw: r.raw, body: r.body, ...extra };
      imports.set(imp.cti, imp);
      await write('imports', (s) => s.put(imp));
      return imp;
    },
    async remove(cti) { imports.delete(cti); await write('imports', (s) => s.delete(cti)); },
    async forget(fp) { keys.delete(fp); await write('keys', (s) => s.delete(fp)); },
    async clear() { imports.clear(); keys.clear(); await write('imports', (s) => s.clear()); await write('keys', (s) => s.clear()); },
    download(cti) {
      const imp = codes.get(cti);
      if (!imp) return;
      const data = { schema: 'afferent.qr-import/1', label: codes.label(imp), fingerprint: imp.fp, scanned_iso: imp.scanned_iso, signed_iso: new Date(imp.iat * 1000).toISOString(), valid_until_iso: new Date(imp.exp * 1000).toISOString(), body: imp.body };
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
      a.download = `afferent-export-${codes.label(imp).replace(/[^A-Za-z0-9]+/g, '-')}-${imp.scanned_iso.slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    },
  });
  C.scanFmt = { day, when };

  const worker = (() => { try { return new Worker('scan-worker.js'); } catch { return null; } })();
  const pending = new Map();
  let wid = 0;
  if (worker) worker.onmessage = (e) => { const f = pending.get(e.data.id); pending.delete(e.data.id); f?.(e.data); };
  const jsqr = (img, invert) => new Promise((res) => {
    if (!worker) return res({ text: null });
    const id = ++wid;
    pending.set(id, res);
    worker.postMessage({ id, data: img.data.buffer, width: img.width, height: img.height, invert }, [img.data.buffer]);
  });

  let detector = null;
  const detectorReady = (async () => {
    try {
      if ('BarcodeDetector' in window && (await BarcodeDetector.getSupportedFormats()).includes('qr_code')) detector = new BarcodeDetector({ formats: ['qr_code'] });
    } catch {}
  })();

  const el = document.createElement('div');
  el.className = 'scan';
  el.id = 'scan';
  el.hidden = true;
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-labelledby', 'scan-title');
  el.innerHTML = `<div class="scan-top"><button class="icon-btn" data-qr="close" aria-label="Close">${icon('close')}</button><h2 id="scan-title">Scan patient QR</h2></div>
    <div class="scan-body">
      <div class="scan-stage">
        <div class="scan-mirror"><video playsinline muted></video><canvas class="scan-freeze" hidden></canvas><svg class="scan-outline" preserveAspectRatio="xMidYMid slice"></svg></div>
        <div class="scan-guide" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
        <div class="scan-nocam" hidden>${icon('photo_camera')}<p>Camera needs localhost or https</p></div>
        <span class="scan-pill num" hidden></span>
      </div>
      <div class="scan-card" hidden></div>
      <div class="scan-alt"><button class="btn text" data-qr="wedge">${icon('keyboard')}Use a scanner</button><button class="btn text" data-qr="image">${icon('image')}Open image</button><span class="scan-ready" hidden>Ready for the scanner</span></div>
    </div>
    <textarea class="scan-wedge" aria-label="Scanner input" autocomplete="off" spellcheck="false"></textarea>
    <input class="scan-file" type="file" accept="image/png,image/jpeg,image/webp" hidden>`;
  document.body.appendChild(el);
  const $ = (s) => el.querySelector(s);
  const video = $('video'), freeze = $('.scan-freeze'), outline = $('.scan-outline'), stage = $('.scan-stage'), card = $('.scan-card');
  const pill = $('.scan-pill'), nocam = $('.scan-nocam'), wedge = $('.scan-wedge'), file = $('.scan-file'), ready = $('.scan-ready');
  const work = document.createElement('canvas');

  let stream = null, live = false, timer = 0, busy = false, processing = false, lastText = '', lastAt = 0, returnFocus = null;
  let parts = C.qr.collector();

  async function startCamera() {
    nocam.hidden = true;
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) { nocam.hidden = false; return; }
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: 'user', width: { ideal: 1920 }, height: { ideal: 1080 } } });
      if (el.hidden) return stopCamera();
      video.srcObject = stream;
      await video.play().catch(() => {});
      resume();
    } catch { nocam.hidden = false; }
  }
  function stopCamera() {
    live = false;
    clearTimeout(timer);
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
    video.srcObject = null;
  }
  function resume() {
    freeze.hidden = true;
    outline.innerHTML = '';
    processing = false;
    if (!stream) return;
    live = true;
    clearTimeout(timer);
    timer = setTimeout(tick, 60);
  }

  async function tick() {
    if (!live || processing) return;
    if (video.readyState >= 2 && video.videoWidth) {
      if (detector) {
        try {
          const r = await detector.detect(video);
          if (r[0]?.rawValue) return found(r[0].rawValue, r[0].cornerPoints, video.videoWidth, video.videoHeight);
        } catch {}
      } else if (!busy) {
        busy = true;
        const s = Math.min(1, 960 / video.videoWidth);
        work.width = Math.round(video.videoWidth * s);
        work.height = Math.round(video.videoHeight * s);
        const g = work.getContext('2d', { willReadFrequently: true });
        g.drawImage(video, 0, 0, work.width, work.height);
        const vw = video.videoWidth, vh = video.videoHeight;
        jsqr(g.getImageData(0, 0, work.width, work.height), false).then((r) => {
          busy = false;
          if (r.text && live && !processing) {
            const l = r.loc;
            found(r.text, [l.topLeftCorner, l.topRightCorner, l.bottomRightCorner, l.bottomLeftCorner].map((p) => ({ x: p.x / s, y: p.y / s })), vw, vh);
          }
        });
      }
    }
    if (live && !processing) timer = setTimeout(tick, detector ? 100 : 200);
  }

  async function found(text, pts, w, h) {
    const now = performance.now();
    if (processing || (text === lastText && now - lastAt < 2500)) { if (live && !processing) timer = setTimeout(tick, 100); return; }
    lastText = text;
    lastAt = now;
    processing = true;
    live = false;
    freeze.width = w;
    freeze.height = h;
    freeze.getContext('2d').drawImage(video, 0, 0, w, h);
    freeze.hidden = false;
    outline.setAttribute('viewBox', `0 0 ${w} ${h}`);
    if (pts?.length === 4) outline.innerHTML = `<polygon points="${pts.map((p) => `${p.x.toFixed(0)},${p.y.toFixed(0)}`).join(' ')}"/>`;
    await new Promise((r) => setTimeout(r, 300));
    await handle(text);
  }

  function showCard(html) {
    live = false;
    clearTimeout(timer);
    stage.hidden = true;
    card.innerHTML = html;
    card.hidden = false;
    (card.querySelector('input') || card.querySelector('.btn.filled') || card.querySelector('button'))?.focus();
  }
  function hideCard() {
    card.hidden = true;
    card.innerHTML = '';
    stage.hidden = false;
  }
  const errorCard = (ic, text, buttons) => showCard(`<div class="scard" data-kind="error">${icon(ic)}<p class="scard-t">${esc(text)}</p><div class="dactions">${buttons}</div></div>`);
  const btnAgain = `<button class="btn filled" data-qr="again">${icon('qr_code_scanner')}Scan again</button>`;
  const btnClose = `<button class="btn filled" data-qr="close">Close</button>`;

  let held = null;
  async function handle(text) {
    const c = parts.add(C.qr.clean(text));
    if (c.status === 'part') {
      pill.textContent = `${c.have} of ${c.n} scanned`;
      pill.hidden = false;
      return resume();
    }
    pill.hidden = true;
    if (c.status !== 'complete') return errorCard('error', 'Not an Afferent code.', btnAgain);
    const r = C.qr.decode(c.text);
    r.raw = c.text;
    held = r;
    switch (r.status) {
      case 'foreign': return errorCard('error', 'Not an Afferent code.', btnAgain);
      case 'unavailable': return errorCard('error', 'The code reader did not load. Reload the dashboard.', btnClose);
      case 'newer': return errorCard('update', 'Made by a newer Afferent version. Update the dashboard.', btnClose);
      case 'expired': return errorCard('schedule', `This code expired on ${when(r.exp)}. Ask for a new one.`, `<button class="btn text" data-qr="once">View once</button>${btnAgain}`);
      case 'future': return errorCard('schedule', "The patient's phone clock looks wrong. The data are shown, but check the dates.", `<button class="btn text" data-qr="again">Scan again</button><button class="btn filled" data-qr="future-import">Import</button>`);
      case 'ok': return accept(r, {});
      default: return errorCard('error', 'This code could not be checked. Do not use it. Ask the patient to show it again.', btnAgain);
    }
  }

  async function accept(r, extra) {
    const prev = codes.get(r.cti);
    if (prev) { close(); go(prev.cti); return toast(`Already received ${when(prev.scanned_iso)}`); }
    const k = codes.key(r.fp);
    if (k) {
      const imp = await codes.add(r, k, extra);
      close();
      go(imp.cti);
      return toast('Export received', async () => { await codes.remove(imp.cti); if (location.hash === '#/e/' + imp.cti) location.hash = '#/'; else C.rerender?.(); });
    }
    held = { ...r, extra };
    const recs = codes.records();
    const pre = r.body?.ini ? r.body.ini.split('').join('.') + '.' : 'Patient ' + r.fp.slice(0, 4);
    showCard(`<div class="scard" data-kind="key">${icon('key')}
      <h3>New phone ${info(TRUST_INFO)}</h3>
      <div class="fp num" aria-label="${esc([...r.fp.replace(/ /g, '')].join(' '))}">${esc(r.fp)}</div>
      <label class="field"><span>Label</span><input id="scan-label" value="${esc(pre)}" maxlength="40" required autocomplete="off"></label>
      ${recs.length ? `<label class="field"><span>Same patient as</span><select id="scan-rec"><option value="">None</option>${recs.map((x) => `<option value="${esc(x.id)}">${esc(x.label)}</option>`).join('')}</select></label>` : ''}
      <div class="dactions"><button class="btn text" data-qr="again">Cancel</button><button class="btn filled" data-qr="trust">Import</button></div></div>`);
  }

  async function trust() {
    const label = card.querySelector('#scan-label')?.value.trim();
    if (!label) return card.querySelector('#scan-label')?.focus();
    const r = held;
    const k = await codes.trust(r, label, card.querySelector('#scan-rec')?.value || null);
    const imp = await codes.add(r, k, r.extra);
    close();
    go(imp.cti);
  }

  function viewOnce() {
    const r = held;
    codes.transient = { cti: 'once', once: true, expired: true, record_id: null, fp: r.fp, label: codes.key(r.fp)?.label || (r.body?.ini ? r.body.ini + '.' : 'Patient ' + r.fp.slice(0, 4)), scanned_iso: new Date().toISOString(), iat: r.iat, exp: r.exp, body: r.body };
    close();
    go('once');
  }

  function go(cti) {
    const h = '#/e/' + encodeURIComponent(cti);
    if (location.hash === h) C.rerender?.();
    else location.hash = h;
  }

  function toast(text, undo) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.innerHTML = `<span>${esc(text)}</span>${undo ? '<button class="btn text small toast-act">Undo</button>' : ''}`;
    document.getElementById('toasts').appendChild(t);
    requestAnimationFrame(() => t.classList.add('in'));
    const off = () => { t.classList.remove('in'); setTimeout(() => t.remove(), 400); };
    const tm = setTimeout(off, undo ? 8000 : 5200);
    t.querySelector('.toast-act')?.addEventListener('click', () => { clearTimeout(tm); off(); undo(); });
  }

  function open() {
    if (!el.hidden) return;
    returnFocus = document.activeElement;
    hideCard();
    pill.hidden = true;
    ready.hidden = true;
    parts = C.qr.collector();
    lastText = '';
    el.hidden = false;
    document.body.classList.add('scan-open');
    $('[data-qr="close"]').focus();
    detectorReady.then(startCamera);
  }
  function close() {
    if (el.hidden) return;
    stopCamera();
    el.hidden = true;
    document.body.classList.remove('scan-open');
    hideCard();
    processing = false;
    returnFocus?.focus?.();
  }

  async function fromImage(f) {
    if (!f) return;
    let text = null;
    try {
      const bmp = await createImageBitmap(f);
      await detectorReady;
      if (detector) { try { text = (await detector.detect(bmp))[0]?.rawValue || null; } catch {} }
      if (!text) {
        const m = Math.max(bmp.width, bmp.height);
        const s = m > 1600 ? 1600 / m : m < 800 ? Math.ceil(800 / m) : 1;
        work.width = Math.round(bmp.width * s);
        work.height = Math.round(bmp.height * s);
        const g = work.getContext('2d', { willReadFrequently: true });
        g.imageSmoothingEnabled = s < 1;
        g.fillStyle = '#fff';
        g.fillRect(0, 0, work.width, work.height);
        g.drawImage(bmp, 0, 0, work.width, work.height);
        text = (await jsqr(g.getImageData(0, 0, work.width, work.height), true)).text;
      }
    } catch {}
    open();
    if (!text) return errorCard('image', 'No code found in this image.', btnAgain);
    live = false;
    processing = true;
    await handle(text);
  }

  async function fromScanner(text) {
    text = String(text || '').replace(/[\r\n\t]+/g, '');
    if (!text) return;
    open();
    live = false;
    processing = true;
    await handle(text);
  }

  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-qr]');
    if (!b) return;
    const a = b.dataset.qr;
    if (a === 'close') close();
    else if (a === 'again') { hideCard(); resume(); }
    else if (a === 'image') file.click();
    else if (a === 'wedge') { wedge.value = ''; wedge.focus(); ready.hidden = false; }
    else if (a === 'trust') trust();
    else if (a === 'once') viewOnce();
    else if (a === 'future-import') accept(held, { future: true });
  });
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.stopPropagation(); close(); }
    if (e.key === 'Enter' && e.target.id === 'scan-label') trust();
  });
  card.addEventListener('change', (e) => {
    if (e.target.id !== 'scan-rec' || !e.target.value) return;
    const l = codes.records().find((x) => x.id === e.target.value);
    if (l) card.querySelector('#scan-label').value = l.label;
  });
  file.addEventListener('change', () => { const f = file.files[0]; file.value = ''; fromImage(f); });
  let wtm = 0;
  const wedgeDone = () => { const v = wedge.value; wedge.value = ''; ready.hidden = true; wedge.blur(); fromScanner(v); };
  wedge.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); clearTimeout(wtm); wedgeDone(); } });
  wedge.addEventListener('input', () => { clearTimeout(wtm); wtm = setTimeout(wedgeDone, 200); });
  wedge.addEventListener('blur', () => { ready.hidden = true; });

  let wb = '', wt = 0, wtimer = 0, wTarget = null;
  document.addEventListener('keydown', (e) => {
    if (e.target === wedge || e.metaKey || e.ctrlKey || e.altKey) return;
    const now = performance.now();
    if (e.key === 'Enter') {
      if (wb.startsWith('AF1') && wb.length > 8) { e.preventDefault(); clearTimeout(wtimer); const v = wb; wb = ''; fromScanner(v); }
      return;
    }
    if (e.key.length !== 1) return;
    if (now - wt > (wb.startsWith('AF1') ? 200 : 35)) wb = '';
    wt = now;
    wb += e.key;
    if (wb === 'AF1') {
      wTarget = e.target;
      if (wTarget && 'value' in wTarget && wTarget.value.endsWith('AF')) { wTarget.value = wTarget.value.slice(0, -2); wTarget.dispatchEvent(new Event('input', { bubbles: true })); }
    }
    if (wb.startsWith('AF1')) {
      e.preventDefault();
      clearTimeout(wtimer);
      wtimer = setTimeout(() => { const v = wb; wb = ''; if (v.length > 8) fromScanner(v); }, 250);
    }
  }, true);

  document.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-codes]');
    if (!b) { if (!e.target.closest('.xmenu-wrap')) document.querySelectorAll('.xmenu').forEach((m) => (m.hidden = true)); return; }
    const a = b.dataset.codes, cti = b.dataset.cti;
    const imp = cti && codes.get(cti);
    if (a === 'scan') return open();
    if (a === 'menu') {
      const m = b.parentElement.querySelector('.xmenu');
      const was = m.hidden;
      document.querySelectorAll('.xmenu').forEach((x) => (x.hidden = true));
      m.hidden = !was;
      b.setAttribute('aria-expanded', String(was));
      if (was) m.querySelector('button')?.focus();
      return;
    }
    document.querySelectorAll('.xmenu').forEach((x) => (x.hidden = true));
    if (a === 'download') return codes.download(cti);
    if (a === 'delete' && imp) { await codes.remove(cti); toast('Export deleted'); }
    else if (a === 'forget' && imp) { await codes.forget(imp.fp); toast(`Forgot the phone ${imp.fp}`); }
    if (location.hash.startsWith('#/e/') && !codes.get(decodeURIComponent(location.hash.slice(4)))) location.hash = '#/';
    else C.rerender?.();
  });

  C.scan = { open, close, fromImage, fromScanner, handle, trust };
})();
