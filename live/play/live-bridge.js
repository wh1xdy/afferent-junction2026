// Afferent Live bridge, published copy of the game only (live/publish.sh adds it to play/index.html just before main.js;
// demo/ itself never loads it). It reads the demo table's sanitized live snapshot, the same one the live page shows,
// and while someone at the table wears the clips with a pulse the box lets out (locked, quality 0.3 or more), it hands
// that pulse to the game as a finger-clip source, exactly as the phone gets it over Bluetooth
// (A.Sensors.setFingerLink + feedFingerBle hrm/aff1). A banner says whose pulse it is: the table's, never the visitor's.
// Without such a pulse it feeds nothing: the game runs on its own simulator, labelled SIMULATED as always.
// It only reads (GET endpoint.json and /live.json); nothing goes back to the table.
(() => {
  'use strict';
  const S = A.Sensors;
  if (!S || typeof S.feedFingerBle !== 'function') return;
  const NAME = 'Demo table, Espoo';
  const OK_BASE = /^(https:\/\/[a-z0-9-]+\.trycloudflare\.com|http:\/\/(127\.0\.0\.1|localhost)(:\d{2,5})?)$/;
  const EVERY_MS = 1000, IDLE_MS = 3000, FAIL_MS = 10000;

  let base = null, feeding = false, failSince = null, timer = 0;

  // While the table's pulse comes in, the web build's own finger check (no Bluetooth plugin here: "unavailable")
  // must not cut the link between two readings; it applies again as soon as the table's pulse stops.
  const setLink = S.setFingerLink.bind(S);
  S.setFingerLink = (state, name) => { if (feeding && state !== 'connected') return; setLink(state, name); };

  // The clip check before a session ("Your pulse is coming through") speaks to the person wearing the clips. The
  // visitor is not that person, so while the table's pulse comes in a session starts without it.
  if (A.ClipCheck) {
    let real = A.ClipCheck.beforeSession;
    Object.defineProperty(A.ClipCheck, 'beforeSession', {
      configurable: true, enumerable: true,
      get: () => (feeding ? go => { go(); return false; } : real),
      set: v => { real = v; },
    });
  }

  // ── the banner ──────────────────────────────────────────────────────────
  const el = document.createElement('div');
  el.id = 'liveBridge';
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');
  Object.assign(el.style, {
    position: 'absolute', left: '50%', top: 'calc(env(safe-area-inset-top, 0px) + 74px)', transform: 'translateX(-50%)',
    zIndex: '30', width: 'max-content', maxWidth: 'calc(100% - 32px)', padding: '7px 16px 8px 14px', borderRadius: '18px',
    pointerEvents: 'none', font: '500 13px/1.3 "Google Sans Flex", system-ui, sans-serif', letterSpacing: '0.01em',
    backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', transition: 'opacity 400ms ease', opacity: '0',
    display: 'flex', alignItems: 'center', gap: '10px', boxSizing: 'border-box',
  });
  const dot = document.createElement('span');
  Object.assign(dot.style, { width: '8px', height: '8px', borderRadius: '50%', flex: 'none' });
  const text = document.createElement('span');
  const line1 = document.createElement('span'), line2 = document.createElement('span');
  Object.assign(line1.style, { display: 'block', fontWeight: '600' });
  Object.assign(line2.style, { display: 'block', fontWeight: '400', opacity: '0.85', fontSize: '12px' });
  text.append(line1, line2);
  el.append(dot, text);
  // In a session the banner is one line under the SIMULATED badge, clear of the task's instruction, and steps aside
  // while the game's own chip (a new reading, 5 s) is on that spot.
  const playing = () => !!(A.session && !A.session.done);
  const chipOn = () => !!document.getElementById('lvChip')?.classList.contains('on');
  const place = () => {
    const p = playing();
    el.style.top = `calc(env(safe-area-inset-top, 0px) + ${p ? 54 : 74}px)`;
    el.style.opacity = el.dataset.kind && !(p && chipOn()) ? '1' : '0';
  };
  const chip = document.getElementById('lvChip');
  if (chip && 'MutationObserver' in window) new MutationObserver(place).observe(chip, { attributes: true, attributeFilter: ['class'] });

  const show = (kind, msg, sub = '') => {
    if (!el.isConnected) (document.getElementById('phone') || document.body).appendChild(el);
    const live = kind === 'live';
    // in play without the table's pulse the game's own SIMULATED badge says it all
    el.dataset.kind = live || !playing() ? kind : '';
    if (playing()) sub = '';          // one line in play; the start screen said whose pulse it is
    line1.style.fontSize = playing() ? '12px' : '';
    Object.assign(el.style, {
      background: live ? 'rgba(247, 189, 86, 0.94)' : 'rgba(13, 24, 42, 0.78)',
      color: live ? '#3D2800' : '#D7DBF7',
      border: live ? '1px solid rgba(255, 222, 171, 0.9)' : '1px solid rgba(126, 140, 169, 0.45)',
    });
    dot.style.background = live ? '#3D2800' : '#DEB8F7';
    if (line1.textContent !== msg) line1.textContent = msg;
    if (line2.textContent !== sub) line2.textContent = sub;
    line2.hidden = !sub;
    place();
  };

  // ── the table's pulse into the game ─────────────────────────────────────
  const stop = () => {
    if (!feeding) return;
    feeding = false;
    setLink('unavailable');               // what the web build says without a finger sensor
  };

  const feed = s => {
    const p = s && s.pulse, clips = (s && s.clips) || [];
    const ok = !!p && Number.isFinite(p.bpm) && !p.two_people && Number.isFinite(p.quality) && p.quality >= 0.3;
    if (!ok) {
      stop();
      show('sim', 'Pulse: simulated', s && s.box && s.box.online ? 'Nobody is wearing the clips at our table right now'
        : 'The demo table is offline right now');
      return;
    }
    if (!feeding || S.fingerLink.state !== 'connected' || S.fingerLink.name !== NAME) { feeding = true; setLink('connected', NAME); }
    const now = Date.now(), n = x => (Number.isFinite(x) && x > 0 ? x : null);
    S.feedFingerBle({ kind: 'hrm', bpm: p.bpm, t_ms: now });
    S.feedFingerBle({ kind: 'aff1', finger_bpm: [n(clips[0] && clips[0].bpm), n(clips[1] && clips[1].bpm)],
      breathing_per_min: n(p.breaths_per_min), rmssd_ms: n(p.hrv_ms), quality: p.quality, presence: 'active', payload_len: 6, t_ms: now });
    show('live', 'Pulse: live from the demo table in Espoo', `${p.bpm} bpm · someone at our table, not you`);
  };

  const discover = async () => {
    try {
      const r = await fetch(`../endpoint.json?t=${Date.now()}`, { cache: 'no-store' });
      const cfg = r.ok ? await r.json() : null;
      const v = cfg && typeof cfg.live === 'string' ? cfg.live.trim().replace(/\/+$/, '') : null;
      base = v && OK_BASE.test(v) ? v : null;
    } catch { base = null; }
    return base;
  };

  const tick = async () => {
    clearTimeout(timer);
    let next = EVERY_MS;
    if (!base && !(await discover())) {
      feed(null);
      timer = setTimeout(tick, 30000);
      return;
    }
    try {
      const r = await fetch(`${base}/live.json`, { cache: 'no-store' });
      if (!r.ok) throw new Error(String(r.status));
      const s = await r.json();
      failSince = null;
      feed(s);
      if (!feeding) next = IDLE_MS;
    } catch {
      failSince = failSince || Date.now();
      if (Date.now() - failSince > 3000) feed(null);   // 3 s: the game's own freshness limit for a finger reading
      if (Date.now() - failSince > FAIL_MS) { base = null; failSince = Date.now(); }   // the tunnel may have moved
      next = 2000;
    }
    timer = setTimeout(tick, document.hidden ? Math.max(next, 5000) : next);
  };
  document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
  tick();
})();
