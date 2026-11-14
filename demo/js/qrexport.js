(() => {
  const $ = id => document.getElementById(id);
  const q = new URLSearchParams(location.search);
  const FJORD = '#0E1A2E';
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  };
  const pid = q.get('patient') || 'anna';
  const norm = s => {
    if (!s) return null;
    try {
      const u = new URL(s);
      if (u.protocol === 'ws:' || u.protocol === 'wss:') return (u.protocol === 'wss:' ? 'https://' : 'http://') + u.host;
      return u.origin;
    } catch { return null; }
  };
  const hubBase = norm(q.get('hub')) || norm(q.get('ws')) || norm(store.get('afferent.hub'))
    || (/^https?:$/.test(location.protocol) ? location.origin : null);
  const record = body => (body && typeof body === 'object' && body.period) ? { body, saved_iso: body.cached_iso || null } : null;

  const codec = () => window.A?.QR || window.AfferentQR || null;

  async function fetchJSON(url, ms = 4000) {
    const ac = new AbortController(), t = setTimeout(() => ac.abort(), ms);
    try {
      const r = await fetch(url, { signal: ac.signal, cache: 'no-store' });
      if (!r.ok) throw new Error(r.status);
      return await r.json();
    } finally { clearTimeout(t); }
  }

  function draw(canvas, text, ecl) {
    const m = codec().matrix(text, ecl || 'M');
    const rows = Array.from({ length: m.size }, (_, r) => Array.from({ length: m.size }, (_, c) => m.isDark(r, c)));
    const n = rows.length, total = n + 8, avail = Math.min(canvas.parentElement.clientWidth || 260, 260);
    const dpr = window.devicePixelRatio || 1;
    const per = Math.max(1, Math.floor(avail * dpr / total));
    const px = per * total;
    canvas.width = canvas.height = px;
    canvas.style.width = canvas.style.height = px / dpr + 'px';
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, px, px);
    ctx.fillStyle = FJORD;
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (rows[r][c]) ctx.fillRect((c + 4) * per, (r + 4) * per, per, per);
  }

  const wifiText = w => {
    const esc = s => String(s).replace(/([\\;,:"'])/g, '\\$1');
    return `WIFI:T:${w.security || 'WPA'};S:${esc(w.ssid)};P:${esc(w.password)};;`;
  };

  let current = null, publishTried = false;

  const status = (id, txt) => { const n = $(id); if (n) n.textContent = txt; };

  function setHubState() {
    status('qeHub', hubBase ? hubBase : 'No hub — set ?hub= or pair on the patient page');
    $('qeHubRow').classList.toggle('warn', !hubBase);
  }

  function setStamp(savedIso) {
    const d = savedIso ? new Date(savedIso) : null;
    if (!d || isNaN(d)) return status('qeStamp', 'No data yet');
    const old = Date.now() - d > 864e5;
    status('qeStamp', `Data bumped ${d.toLocaleString()}${old ? ' — older than a day' : ''}`);
  }

  function renderFile(body, meta) {
    const html = A.DashGen.render(body, meta);
    const blob = new Blob([html], { type: 'text/html' });
    const a = $('qeSave');
    if (a.href && a.href.startsWith('blob:')) URL.revokeObjectURL(a.href);
    a.href = URL.createObjectURL(blob);
    a.download = `afferent-dashboard-${pid}.html`;
    return html;
  }

  async function publish(html) {
    const box = $('qeCode'), urlEl = $('qeUrl'), wifiBox = $('qeWifi');
    try {
      const res = await fetch(`${hubBase}/api/export/publish`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patient_id: pid, html }),
      });
      if (!res.ok) throw new Error(res.status);
      const out = await res.json();
      if (!out || !out.url) throw new Error('no url');
      const url = out.url.startsWith('http') ? out.url : hubBase + out.url;
      box.hidden = false;
      draw($('qeUrlQr'), url, 'M');
      urlEl.textContent = url;
      urlEl.href = url;
      const w = out.wifi || (out.wifi_ssid ? { ssid: out.wifi_ssid, password: out.wifi_password, security: out.wifi_security } : null);
      if (w && w.ssid) {
        wifiBox.hidden = false;
        draw($('qeWifiQr'), wifiText(w), 'M');
        status('qeWifiTxt', `${w.ssid}${w.password ? ' · ' + w.password : ''}`);
      } else {
        wifiBox.hidden = true;
      }
      status('qeState', 'Scan the code with the other device — it joins the hub and opens the dashboard.');
      publishTried = true;
    } catch (e) {
      box.hidden = true;
      status('qeState', publishTried
        ? 'Hub export endpoint not ready — use Save file or Share below.'
        : 'Could not reach the hub export endpoint — use Save file or Share below.');
      publishTried = true;
    }
  }

  async function bump(manual) {
    const btn = $('qeBump');
    if (btn) btn.disabled = true;
    try {
      const r = A.QRShow?.sync ? await A.QRShow.sync().catch(() => null) : null;
      if (r) return { body: r.body, saved_iso: r.saved_iso, src: 'hub' };
      if (hubBase) {
        const body = await fetchJSON(`${hubBase}/api/patients/${encodeURIComponent(pid)}/qr-body`);
        if (!body || !body.period) throw new Error('bad body');
        if (A.QR?.cacheBody) await A.QR.cacheBody(body).catch(() => {});
        return { body, saved_iso: new Date().toISOString(), src: 'hub' };
      }
      throw new Error('no hub');
    } catch {
      if (manual) status('qeState', 'Hub unreachable — showing the last data on this phone.');
      try { const rec = record(await A.QR?.cachedBody?.()); if (rec) return { ...rec, src: 'cache' }; } catch {}
      if (pid === 'anna') {
        try {
          const rec = record(await fetchJSON('js/qr_body_fallback.json'));
          if (rec) return { ...rec, src: 'saved' };
        } catch {}
      }
      return null;
    }
    finally { if (btn) btn.disabled = false; }
  }

  async function apply(rec) {
    if (!rec) { status('qeState', 'Nothing to show yet — open Afferent at home once.'); return; }
    current = rec;
    setStamp(rec.saved_iso || rec.body.generated_iso);
    const html = renderFile(rec.body, { source: rec.src, patient: pid, saved_iso: rec.saved_iso });
    const share = $('qeShare');
    try {
      if (share) share.hidden = !(navigator.canShare && navigator.canShare({ files: [new File([html], 'dashboard.html', { type: 'text/html' })] }));
    } catch { if (share) share.hidden = true; }
    if (hubBase) await publish(html);
    else status('qeState', 'No hub linked — use Save file or Share to move the dashboard.');
  }

  async function refresh(manual) {
    await apply(await bump(manual));
    const s = $('qeSim');
    if (s) s.hidden = !(current && current.body && current.body.sim);
  }

  function init() {
    setHubState();
    addEventListener('hashchange', () => { if (location.hash.slice(1) === 'share') refresh(false); });
    $('qeBump').onclick = () => refresh(true);
    $('qeSave').onclick = e => { if (!$('qeSave').download) e.preventDefault(); };
    $('qeShare').onclick = async () => {
      if (!current) return;
      const file = new File([A.DashGen.render(current.body, { source: current.src, patient: pid, saved_iso: current.saved_iso })],
        `afferent-dashboard-${pid}.html`, { type: 'text/html' });
      try { await navigator.share({ files: [file], title: 'Afferent dashboard' }); } catch {}
    };
    refresh(false);
    if (hubBase && typeof WebSocket !== 'undefined') {
      let last = 0;
      try {
        const ws = new WebSocket(hubBase.replace(/^http/, 'ws') + '/ws/clinic');
        ws.onmessage = e => {
          let d;
          try { d = JSON.parse(e.data); } catch { return; }
          if (d && d.type === 'analytics_updated' && Date.now() - last > 4000) { last = Date.now(); refresh(false); }
        };
      } catch {}
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
