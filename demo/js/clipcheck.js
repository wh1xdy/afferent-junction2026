// Clip check: before a session the app asks for a finger in each clip, shows a live check with a clear OK, and
// falls back to the phone camera's pulse when the clips give nothing, so a test or a demo never starts on a bad clip.
//
// Opened three ways, always before a session and never inside one:
//  - once on first run, as an offer on the start screen
//  - when the patient kindles and the clips give no pulse yet (main.js asks A.ClipCheck.beforeSession); they can
//    begin anyway, step back, or switch the question off in Settings
//  - from Settings › Before a session › Check the finger clips
//
// Rules kept here:
//  - OK only on a real reading through the app's own gate: A.Breathing.reading of A.Sensors.fingerFrame (finger_ppg,
//    not simulated, finger detected, quality reported and at least 0.3, fresh within 3 s) with a pulse, or a trusted
//    camera pulse from A.Sensors.cameraPulse (fresh within 3 s). A simulated frame never passes; no reading is not OK.
//  - The only numbers shown are those readings.
//  - Nothing is sent: no hub message, no network. This phone keeps only the outcome (OK or not, clips or camera,
//    when) for the line in Settings. Camera frames stay in the native plugin; this file sees numbers only.
//
// Logic (clips, camera, model, beforeSession) runs without a page for the node tests (demo/tests/clipcheck.test.js);
// the sheet is built only when a document with #phone exists.
(() => {
  const S = A.Sensors;
  const KEY = 'afferent.clipcheck';
  // BT_WAIT_S: Bluetooth may say 'off' for a moment while it starts. BOX_S: how long to look for the box before the
  // camera is offered. NOTHING_S: no reading at all from the clips. NOT_OK_S: something, but never a steady pulse.
  const T = { BT_WAIT_S: 4, BOX_S: 10, NOTHING_S: 12, NOT_OK_S: 25, OFFER_MS: 1500, PAINT_MS: 400 };

  const store = {
    get() { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } },
    set(o) { try { localStorage.setItem(KEY, JSON.stringify({ ...store.get(), ...o })); } catch {} },
  };
  const asks = () => store.get().ask !== false;
  const int = x => Number.isFinite(x) ? Math.round(x) : null;
  const quiet = x => { try { Promise.resolve(x).catch(() => {}); } catch {} };
  const reading = f => A.Breathing ? A.Breathing.reading(f) : null;

  // What the patient reads. head is the one line that matters; sub says what to do or what happens next.
  const MSG = {
    off: { head: 'The finger clips are switched off.', sub: 'Switch them on to check them.' },
    none: { head: 'No finger clips on this phone.', sub: 'They work with the Afferent app on the iPhone.' },
    bt_denied: { head: 'Afferent may not use Bluetooth yet.', sub: 'You can allow it in the iPhone Settings, under Afferent.' },
    bt_none: { head: 'This phone cannot connect to the clips.', sub: 'The clips need Bluetooth.' },
    starting: { head: 'Getting ready…', sub: 'If the phone asks about Bluetooth, allow it.' },
    bt_off: { head: 'Bluetooth seems to be off.', sub: 'You can switch it on in Control Centre.' },
    looking: { head: 'Looking for the clip box…', sub: 'Check that it is plugged in and close by.' },
    place: { head: 'Put a finger in each clip.', sub: 'All the way in, then rest your hand on something.' },
    probing: { head: 'Found you. Keep your hand still.', sub: 'Your pulse comes through in a few seconds.' },
    weak: { head: 'Almost there.', sub: 'Push your fingers in a little further and keep still. Warm hands help.' },
    one: { head: 'Almost there.', sub: a => `Clip ${a.n} needs a finger too, all the way in.` },
    finding: { head: 'Finding your pulse…', sub: 'Keep still a moment longer.' },
    old_box: { head: 'These clips cannot show your pulse yet.', sub: 'The clip box needs an update.' },
    sim: { head: 'These are practice numbers, not your pulse.', sub: 'They do not count here.' },
    ok: { head: 'Your pulse is coming through.', sub: 'You can keep your fingers in the clips.' },

    c_off: { head: 'The phone camera is switched off.', sub: 'You can switch it on in Settings, under Sensors.' },
    c_denied: { head: 'Afferent may not use the camera yet.', sub: 'You can allow it in the iPhone Settings, under Afferent.' },
    c_start: { head: 'Starting the camera…', sub: 'Look at the screen.' },
    c_face: { head: 'Look at the screen.', sub: 'Hold the phone so your whole face is in view.' },
    c_settle: { head: 'Getting used to the light…', sub: a => a.left ? `Hold still, about ${a.left} seconds.` : 'Hold still.' },
    c_dark: { head: 'A little more light on your face would help.', sub: 'Face a window or a light.' },
    c_bright: { head: 'A little less light on your face would help.', sub: 'Turn a bit away from the brightest light.' },
    c_moving: { head: 'Hold the phone and your head still.', sub: 'Resting your elbows helps.' },
    c_warm: { head: 'Finding your pulse…', sub: a => a.left ? `Hold still, about ${a.left} seconds.` : 'Hold still.' },
    c_weak: { head: 'Still looking…', sub: 'Hold still, with even light on your face.' },
    c_ok: { head: 'Your pulse is coming through the camera.', sub: 'Keep looking at the screen.' },
  };
  const say = (code, part, args = {}) => { const m = MSG[code]?.[part]; return typeof m === 'function' ? m(args) : m ?? ''; };

  const card = (tone, code, o = {}) => ({ tone, code, args: {}, bpm: null, chips: null, signal: null, dead: false, nothing: false, action: null, ...o });

  // ── the clips ──────────────────────────────────────────────────────────
  // tone: ok (a pulse through the gate), act (the patient can do something), wait (it is on its way),
  // rest (nothing will come from the clips now; the camera is offered at once).
  // nothing: the clips give no reading at all (no box, no finger), as opposed to a weak or settling one.
  const clips = (now, st) => {
    const link = S.fingerLink.state;
    if (st.link.state !== link) st.link = { state: link, at: now };
    if (!S.enabled.pulse_stone) return card('rest', 'off', { dead: true, nothing: true, action: 'clips_on' });
    const f = S.fingerFrame(now);
    if (f) {
      if (f.simulated || f.source !== 'finger_ppg') return card('rest', 'sim', { dead: true, nothing: true });
      const ble = f.transport === 'ble';
      // a box that has only sent a pulse so far has not said yet whether it reports quality
      if (ble && S.fingerBle?.affAt == null) return card('act', 'place', { nothing: true, chips: [false, false], signal: 0 });
      if (!f.quality_reported) return card('rest', 'old_box', { dead: true });
      const idle = f.presence === 'idle', fingers = f.finger_bpm || [null, null];
      const chips = idle ? [false, false] : [fingers[0] != null, fingers[1] != null];
      const signal = idle || f.quality == null ? 0 : f.quality;
      const r = reading(f);
      if (r?.pulse != null) return card('ok', 'ok', { bpm: int(r.pulse), chips, signal });
      if (idle) return card('act', 'place', { nothing: true, chips, signal });
      if (f.presence === 'probing') return card('wait', 'probing', { chips, signal });
      if (chips[0] !== chips[1]) return card('wait', 'one', { chips, signal, args: { n: chips[0] ? 2 : 1 } });
      if (f.quality == null || f.quality < 0.3) return card('wait', 'weak', { chips, signal });
      return card('wait', 'finding', { chips, signal });
    }
    if (!A.Finger?.available?.()) return card('rest', 'none', { dead: true, nothing: true });
    if (link === 'unauthorized') return card('rest', 'bt_denied', { dead: true, nothing: true });
    if (link === 'unsupported') return card('rest', 'bt_none', { dead: true, nothing: true });
    if (link === 'scanning' || link === 'connecting') return card('wait', 'looking', { nothing: true });
    if (link === 'connected') return card('act', 'place', { nothing: true, chips: [false, false], signal: 0 });
    return now - st.link.at < T.BT_WAIT_S ? card('wait', 'starting', { nothing: true }) : card('rest', 'bt_off', { dead: true, nothing: true });
  };

  // ── the phone camera, once the clips give nothing ──────────────────────
  // null when this phone has no camera pulse at all (a browser, or no TrueDepth camera): then it is not mentioned.
  const camera = now => {
    if (!A.CamPulse?.available?.()) return null;
    const link = S.cameraState(now).link;
    if (link === 'unavailable' || link === 'unsupported') return null;
    if (!S.enabled.phone_camera) return card('rest', 'c_off');
    if (link === 'unauthorized') return card('rest', 'c_denied');
    const p = S.cameraPulse(now);
    if (p?.bpm != null) return card('ok', 'c_ok', { bpm: int(p.bpm) });
    const why = S.cameraWhy(now), left = why?.warmup_s_left > 0 ? Math.ceil(why.warmup_s_left) : null;
    if (link !== 'on' || !why) return card('wait', 'c_start');
    const code = { no_face: 'c_face', exposure_not_locked: 'c_settle', too_dark: 'c_dark', too_bright: 'c_bright', moving: 'c_moving', warming_up: 'c_warm' }[why.reason] || 'c_weak';
    return card(['c_face', 'c_dark', 'c_bright', 'c_moving'].includes(code) ? 'act' : 'wait', code, { args: { left } });
  };

  // True only on a real finger pulse through the gate, right now.
  const clipsOk = now => S.enabled.pulse_stone && reading(S.fingerFrame(now))?.pulse != null;

  // One open of the sheet. The waits for the camera count from the moment it opens.
  const fresh = (mode, go, now) => ({ mode, go, openedAt: now, link: { state: S.fingerLink.state, at: now }, nothingSince: now, notOkSince: now, fallback: false, via: null, ok: false });

  // Everything the sheet shows, from what the sensors give now. Moves the run on: the fallback, the first OK.
  const model = (now, st) => {
    const cl = clips(now, st);
    if (cl.tone === 'ok') st.nothingSince = st.notOkSince = null;
    else {
      if (st.notOkSince == null) st.notOkSince = now;
      if (!cl.nothing) st.nothingSince = null;
      else if (st.nothingSince == null) st.nothingSince = now;
    }
    const waited = (since, s) => since != null && now - since >= s;
    const boxLost = cl.code === 'looking' && waited(st.link.at, T.BOX_S);
    if (!st.fallback && cl.tone !== 'ok' && (cl.dead || boxLost || waited(st.nothingSince, T.NOTHING_S) || waited(st.notOkSince, T.NOT_OK_S))) {
      st.fallback = true;
      quiet(A.CamPulse?.sync?.());
    }
    const cam = st.fallback ? camera(now) : null;
    const via = cl.tone === 'ok' ? 'clips' : cam?.tone === 'ok' ? 'camera' : null;
    const became = !!via && !st.ok;
    st.ok = !!via;
    if (via && st.via !== 'clips') st.via = via;
    const session = st.mode === 'session';
    // the camera gave the OK: the clips are still asked for, but no longer as the thing to do now
    const shown = via === 'camera' && cl.tone !== 'rest' ? { ...cl, tone: 'rest' } : cl;
    const none = !via && st.fallback && (!cam || cam.tone === 'rest');
    return {
      mode: st.mode, ok: !!via, via, became,
      title: session ? 'Before we begin' : 'Check the finger clips',
      lede: 'A quick check that your pulse comes through.',
      clips: { ...shown, head: say(cl.code, 'head', cl.args), sub: say(cl.code, 'sub', cl.args) },
      camera: cam && { ...cam, head: say(cam.code, 'head', cam.args), sub: say(cam.code, 'sub', cam.args) },
      note: none ? (session ? 'You can still begin. Everything works without it, too.' : 'Everything works without it, too.') : null,
      actions: session
        ? [['text', 'Not now', 'cancel'], [via ? 'filled' : 'tonal', via ? 'Begin' : 'Begin anyway', 'begin']]
        : [[via ? 'filled' : 'tonal', 'Done', 'close']],
    };
  };

  // ── the outcome, kept on this phone for the Settings line ──────────────
  const clock = ms => new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const when = (ms, nowMs = Date.now()) => {
    const d = new Date(ms), n = new Date(nowMs), y = new Date(nowMs - 864e5);
    if (d.toDateString() === n.toDateString()) return `today ${clock(ms)}`;
    if (d.toDateString() === y.toDateString()) return `yesterday ${clock(ms)}`;
    return `${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}, ${clock(ms)}`;
  };
  const remember = (ok, via) => store.set({ last: { at_ms: Date.now(), ok: !!ok, via: ok ? via : null } });
  const line = (nowMs = Date.now()) => {
    const l = store.get().last;
    if (!l || !Number.isFinite(l.at_ms)) return 'Not checked yet';
    return `${!l.ok ? 'No pulse came through' : l.via === 'camera' ? 'Worked with the camera' : 'Worked'}, ${when(l.at_ms, nowMs)}`;
  };

  // Whether kindling asks first: the patient uses the clips (switch on, clips on this phone or through the hub),
  // has not switched the question off, and the clips give no pulse right now.
  const wouldAsk = now => asks() && !!S.enabled.pulse_stone && (!!A.Finger?.available?.() || S.fingerAttached(now)) && !clipsOk(now);

  A.ClipCheck = { T, KEY, MSG, clips, camera, clipsOk, model, fresh, line, when, wouldAsk, asks, store };

  // Without a page (node tests of the logic) there is no sheet; kindling goes straight on.
  if (typeof document === 'undefined' || typeof document.getElementById !== 'function') {
    A.ClipCheck.beforeSession = go => { go(); return false; };
    return;
  }

  // ── the sheet ─────────────────────────────────────────────────────────
  const $ = id => document.getElementById(id);
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const icon = (name, cls = '') => { const e = el('span', `ms ${cls}`.trim(), name); e.setAttribute('aria-hidden', 'true'); return e; };
  const btn = (cls, text, fn, ic) => { const b = el('button', `btn ${cls} state`); b.type = 'button'; if (ic) b.append(icon(ic)); b.append(document.createTextNode(text)); b.onclick = fn; return b; };
  const TAG = { ok: 'OK', act: 'Your turn', wait: 'Checking' };

  let st = null, timer = 0, drawn = '', told = '', opener = null;

  const buzz = () => { A.Haptics?.play('success'); };

  const sensorSwitch = name => {
    const sw = document.querySelector(`[data-sensor="${name}"]`);
    if (!sw || sw.checked) return;
    sw.checked = true;
    sw.dispatchEvent(new Event('change'));
  };

  const bars = level => {
    const box = el('span', 'clip-bars'), n = level > 0 ? Math.max(1, Math.min(5, Math.round(level * 5))) : 0;
    for (let i = 0; i < 5; i++) box.append(el('i', i < n ? 'on' : null));
    return { box, n };
  };

  const number = bpm => {
    const num = el('div', 'clip-num'), beat = icon('favorite', 'fill clip-beat');
    beat.style.setProperty('--beat', `${(60 / Math.max(30, Math.min(220, bpm))).toFixed(3)}s`);
    num.append(beat, el('span', 'num', String(bpm)), el('span', 'unit', 'beats per minute'));
    return num;
  };

  const cardEl = (c, name, ic) => {
    const box = el('section', `clip-card tone-${c.tone}`);
    const top = el('div', 'clip-top'), tile = el('span', 'tile clip-tile');
    tile.append(icon(c.tone === 'ok' ? 'check' : ic));
    top.append(tile, el('span', 'clip-name', name));
    if (TAG[c.tone]) top.append(el('span', 'clip-tag', TAG[c.tone]));
    box.append(top);
    if (c.bpm != null) box.append(number(c.bpm));
    box.append(el('p', 'clip-head', c.head));
    if (c.sub) box.append(el('p', 'clip-sub', c.sub));
    if (c.chips) {
      const row = el('div', 'clip-row');
      c.chips.forEach((on, i) => {
        const chip = el('span', `clip-chip${on ? ' on' : ''}`);
        chip.append(icon(on ? 'check' : 'radio_button_unchecked'), document.createTextNode(`Clip ${i + 1}`));
        chip.setAttribute('aria-label', `Clip ${i + 1}: ${on ? 'reading' : 'no reading yet'}`);
        row.append(chip);
      });
      const sig = el('span', 'clip-signal'), b = bars(c.signal);
      sig.setAttribute('aria-label', `Signal ${b.n} of 5`);
      sig.append(el('span', 'k', 'Signal'), b.box);
      row.append(sig);
      box.append(row);
    }
    if (c.action === 'clips_on') box.append(btn('text small clip-inline', 'Switch on', () => { sensorSwitch('pulse_stone'); quiet(A.Finger?.arm?.()); paint(true); }));
    return box;
  };

  const act = what => {
    if (what === 'begin') finish('begin');
    else if (what === 'cancel') finish('cancel');
    else finish('close');
  };

  const paint = force => {
    if (!st) return;
    const v = model(A.now(), st);
    if (v.became) buzz();
    const key = JSON.stringify(v, (k, x) => k === 'became' ? undefined : x);
    if (!force && key === drawn) return;
    drawn = key;
    $('clipTitle').textContent = v.title;
    $('clipLede').textContent = v.lede;
    const nodes = [cardEl(v.clips, 'Finger clips', 'back_hand')];
    if (v.camera) {
      const cam = cardEl(v.camera, v.ok && v.via === 'clips' ? 'Phone camera' : 'Or the phone camera', 'videocam');
      cam.classList.add('clip-cam');
      cam.append(el('p', 'clip-privacy', 'The camera picture stays on this phone.'));
      nodes.push(cam);
    }
    if (v.note) nodes.push(el('p', 'clip-note', v.note));
    $('clipBody').replaceChildren(...nodes);
    $('clipActions').replaceChildren(...v.actions.map(([cls, text, what]) => btn(cls, text, () => act(what), cls === 'filled' && what !== 'close' ? 'check' : null)));
    const main = v.via === 'camera' ? v.camera : v.clips, tell = v.ok ? `OK. ${main.head}` : `${main.head} ${main.sub}`;
    if (tell !== told) { told = tell; $('clipTell').textContent = tell; }
  };

  const scheme = layer => {
    if (A.Theme?.scheme === 'kaamos' && A.Theme.local?.() === 'kevat') layer.dataset.scheme = 'kevat';
    else delete layer.dataset.scheme;
  };

  const open = (mode = 'settings', go = null) => {
    const layer = $('clipcheck');
    if (!layer) { go?.(); return; }
    if (st) finish('close');
    hideOffer();
    st = fresh(mode, go, A.now());
    drawn = ''; told = '';
    quiet(A.Finger?.arm?.());
    scheme(layer);
    A.Swipe?.stay?.(layer);
    if (layer.classList.contains('hidden')) { opener = document.activeElement; A.Swipe?.hold?.(320); }
    layer.classList.remove('hidden');
    $('phone')?.classList.add('card-open');
    clearInterval(timer);
    timer = setInterval(() => paint(false), T.PAINT_MS);
    paint(true);
    layer.querySelector('.sheet')?.focus?.();
  };

  // begin: start the session. cancel: back to the start screen, the lantern unlit. close: from Settings or first run.
  const finish = how => {
    if (!st) return;
    const s = st;
    st = null;
    clearInterval(timer); timer = 0;
    remember(s.via != null, s.via);
    const layer = $('clipcheck');
    const hide = () => {
      layer?.classList.add('hidden');
      const phone = $('phone');
      if (phone && !phone.querySelector('.screen.settings:not(.hidden), .layer:not(.hidden), .talk:not(.hidden), .onboard')) phone.classList.remove('card-open');
      // focus goes back to what opened it (the Settings row, the kindle)
      const f = opener; opener = null;
      if (f?.isConnected && !layer?.contains?.(f)) f.focus?.({ preventScroll: true });
    };
    // slides out like a swipe when it is closed with a button, the scrim or Escape (gui/swipe.js)
    if (!A.Swipe?.out?.(layer, hide)) hide();
    refreshLine();
    if (s.mode !== 'session') return;
    if (how === 'begin') s.go?.();
    else A.bus.emit('unkindle');
  };

  // From main.js when the lantern is kindled. Goes straight on when the clips already give a pulse.
  const beforeSession = go => {
    hideOffer();
    const now = A.now();
    if (!wouldAsk(now) || !$('clipcheck')) {
      if (clipsOk(now)) remember(true, 'clips');
      go();
      return false;
    }
    open('session', go);
    return true;
  };

  const refreshLine = () => { const s = $('clipState'); if (s) s.textContent = line(); };

  // ── first run: offered once on the start screen ───────────────────────
  const hideOffer = () => $('clipOffer')?.remove();
  const offer = () => {
    const s = store.get(), q = new URLSearchParams(location.search);
    if (s.offered_ms || s.last || !(A.Finger?.available?.() || q.get('clipcheck') === '1')) return false;
    const dock = document.querySelector('#start .dock');
    if (!dock || $('clipOffer') || A.session) return false;
    store.set({ offered_ms: Date.now() });
    const box = el('div', 'offer clip-offer');
    box.id = 'clipOffer';
    box.setAttribute('role', 'region'); box.setAttribute('aria-label', 'Try the finger clips');
    box.append(el('p', 't-title', 'Try the finger clips?'), el('p', 't-body-s muted', 'A quick check that your pulse comes through. Under a minute.'));
    const bs = el('div', 'offer-btns');
    bs.append(btn('text small', 'Not now', hideOffer), btn('tonal small', 'Try it', () => open('first')));
    box.append(bs);
    dock.prepend(box);
    return true;
  };

  const mount = () => {
    const phone = $('phone');
    if (!phone || $('clipcheck')) return;
    const layer = el('div', 'layer clip-layer hidden');
    layer.id = 'clipcheck';
    layer.setAttribute('role', 'dialog'); layer.setAttribute('aria-modal', 'true'); layer.setAttribute('aria-labelledby', 'clipTitle');
    const scrim = el('div', 'scrim'), sheet = el('div', 'sheet clip-sheet'), handle = el('div', 'handle');
    sheet.setAttribute('tabindex', '-1');
    handle.setAttribute('aria-hidden', 'true');
    const head = el('div', 'sheet-head'), title = el('h2', 't-headline', 'Check the finger clips'), talk = el('button', 'icon-btn state');
    title.id = 'clipTitle';
    talk.type = 'button'; talk.setAttribute('aria-label', 'Talk to someone'); talk.append(el('span', 'ms', 'support'));
    // main.js binds [data-open] buttons when it runs, before this sheet exists
    talk.onclick = () => A.bus.emit('talk');
    head.append(title, talk);
    const lede = el('p', 't-body-m clip-lede'), tell = el('p', 'clip-sr'), body = el('div', 'clip-body'), acts = el('div', 'sheet-actions clip-actions');
    lede.id = 'clipLede'; tell.id = 'clipTell'; tell.setAttribute('aria-live', 'polite'); body.id = 'clipBody'; acts.id = 'clipActions';
    sheet.append(handle, head, lede, tell, body, acts);
    layer.append(scrim, sheet);
    phone.append(layer);
    scrim.onclick = () => finish(st?.mode === 'session' ? 'cancel' : 'close');

    const row = $('clipCheckRow'), ask = $('clipAskSw');
    if (row) row.onclick = () => open('settings');
    if (ask) { ask.checked = asks(); ask.onchange = () => store.set({ ask: !!ask.checked }); }
    refreshLine();
    document.querySelectorAll('[data-open="settings"]').forEach(b => b.addEventListener('click', () => { refreshLine(); if (ask) ask.checked = asks(); }));
    document.addEventListener('keydown', e => {
      if (e.key !== 'Escape' || !st) return;
      if ($('crisis') && !$('crisis').classList.contains('hidden')) return;
      e.preventDefault(); e.stopPropagation?.();
      finish(st.mode === 'session' ? 'cancel' : 'close');
    }, true);

    // offered once the first-run cards (onboarding, the lantern explainer, a check-in) and any session are out of the way
    const busy = () => phone.classList.contains('onboarding') || phone.classList.contains('card-open') || !!phone.querySelector('.ci:not(.hidden)') || !!A.session || !!st;
    let tries = 0;
    const later = () => setTimeout(() => { if (++tries > 40) return; if (busy()) later(); else offer(); }, T.OFFER_MS);
    later();
  };

  Object.assign(A.ClipCheck, { open, finish, beforeSession, paint: () => paint(false), offer, mount, current: () => st });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})();
