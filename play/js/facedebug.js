// Face debug view, for the team only: Settings › Help and about › Developer › Face debug view (hidden from patients, see
// docs/app.md). It shows live what the face measures see: tracked or not, the face's distance, smile, facial movement,
// blinks, looking away, gaze and head angles, breathing from the camera and which breathing rate the app shows, the
// screen light, and the brief facial movements of the last minute by region. A drawing of the face in mirror view has an
// arrow out of each eye towards where it looks, relative to the lens, and a thinner one for where the head points
// (the reference app's EyeArrows, ios/Afferent/ExpressionView.swift, drawn flat: no camera picture reaches the web layer).
//
// Rules kept here:
//  - It describes what the face did, never a feeling (the FaceMeasures.swift rule).
//  - The gaze stream (event "faceDebug" of AfferentPulse, 15 a second, angles and a blink value only) runs only while
//    this view is open: faceDebug({ on: true }) when it opens, { on: false } when it closes or the app is hidden.
//  - Nothing is recorded or sent.
// Logic (arrow, model) runs without a page for the node tests (demo/tests/camera-extras.test.js).
(() => {
  const S = A.Sensors;
  const DASH = '–', WINDOW_S = 60, FRESH_S = 3, RECENT_N = 5, ARROW_PX = 110, DOT_DEG = 2;
  const num = x => Number.isFinite(x) ? x : null;
  const fixed = (x, d) => x == null ? DASH : x.toFixed(d);
  const deg = x => x == null ? DASH : `${x > 0 ? '+' : ''}${Math.round(x)}°`;
  const pct = x => x == null ? DASH : `${Math.round(x * 100)}%`;
  const ago = s => s < 1 ? 'now' : `${Math.round(s)} s ago`;

  // A gaze or head direction as a flat arrow in mirror view: yaw towards the face's own left (+) points left on the
  // screen, pitch up (+) points up. Its length grows with the angle (sin), ARROW_PX at 90°. Within DOT_DEG of the lens it
  // is a dot (null). Angles in degrees, null when missing.
  const arrow = (yaw, pitch, k = ARROW_PX) => {
    if (num(yaw) == null || num(pitch) == null) return null;
    if (Math.hypot(yaw, pitch) < DOT_DEG) return { dx: 0, dy: 0, dot: true };
    const r = Math.PI / 180;
    return { dx: -Math.sin(yaw * r) * k, dy: -Math.sin(pitch * r) * k, dot: false };
  };

  const D = A.FaceDebug = { DOT_DEG, ARROW_PX, open: false, frame: null, frameAt: null, listener: null, arrow };

  // The last debug frame while fresh, or null.
  const live = now => D.frame && D.frameAt != null && now - D.frameAt < 1 ? D.frame : null;

  // Everything the view says, as rows of [label, value, note]. now: A.now().
  D.model = now => {
    const state = S.faceState, rows = S.faceLog || [], last = rows[rows.length - 1];
    const fresh = !!last && now - last.at < FRESH_S, sec = fresh ? last : null, f = live(now), L = S.faceLive?.(now);
    const d = sec?.tracked ? sec.distance_cm : null, side = d != null && A.Coach ? A.Coach.side(d) : null;
    const range = A.Coach ? `${A.Coach.RANGE_CM[0]} to ${A.Coach.RANGE_CM[1]} cm` : '';
    const cam = A.Breathing?.cameraCandidate?.(now) ?? null, pick = A.Breathing?.clearest?.(now) ?? null;
    const light = S.camPulse?.light, asked = A.ScreenLight?.asked ? JSON.parse(A.ScreenLight.asked) : null;
    const micros = (S.faceMicros || []).filter(m => now - m.at < WINDOW_S);
    const regions = (S.FACE?.REGIONS || []).map(r => [r, micros.filter(m => m.region === r).length]);
    const out = [
      ['Face measures', state, state === 'unavailable' ? 'Needs the iPhone app and a TrueDepth camera' : null],
      ['Face tracked', sec ? (sec.tracked ? 'yes' : 'no') : DASH, sec ? null : 'no second from the face measures in the last 3 s'],
      ['Distance', d == null ? DASH : `${Math.round(d)} cm`, d == null ? null : side ? `${A.Coach.WORDS[side]} (outside ${range})` : `inside ${range}`],
      ['Smile', fixed(sec?.smile ?? null, 2), 'this second, above the person\'s own start value'],
      ['Facial movement', fixed(sec?.movement ?? null, 3), 'this second'],
      ['Blinks', sec?.blinks == null ? DASH : String(sec.blinks), L?.blinks_per_min == null ? 'this second' : `this second · ${Math.round(L.blinks_per_min)} per minute`],
      ['Looking away', pct(sec?.gaze_away ?? null), 'share of this second'],
      ['Gaze', f?.tracked ? `${deg(f.gaze_yaw_deg)} ${deg(f.gaze_pitch_deg)}` : DASH, f ? `left/right, up/down from the lens${f.calibrated ? ', calibrated' : ', not calibrated'}` : 'no gaze stream'],
      ['Head', f?.tracked ? `${deg(f.head_yaw_deg)} ${deg(f.head_pitch_deg)}` : DASH, 'where the face points, from the lens'],
      ['Breathing, camera', cam ? `${Math.round(cam.rate)}/min` : DASH, sec?.breathing_snr != null ? `${sec.breathing_snr.toFixed(1)} dB · clarity ${cam ? cam.clarity.toFixed(2) : 'under 0.30'}` : 'no clear rate yet'],
      ['Breathing shown', pick ? `${Math.round(pick.rate)}/min` : DASH, pick ? `${pick.source === A.Breathing.CAMERA ? 'camera' : 'finger sensor'}, clarity ${pick.clarity.toFixed(2)}${pick.other ? ', clearer of the two' : ''}` : 'neither source is clear'],
      ['Screen light', A.ScreenLight?.level != null ? pct(A.ScreenLight.level) : asked?.on ? 'asked' : 'off', asked?.on && asked.max != null ? `at most ${pct(asked.max)} (night)` : A.config?.screenLight === false ? 'switched off in Settings' : null],
      ['Skin brightness', light?.face_luma == null ? DASH : `${Math.round(light.face_luma * 255)} of 255`, light?.level ?? null],
      ['Brief movements', String(micros.length), regions.filter(([, n]) => n).map(([r, n]) => `${r} ${n}`).join(' · ') || 'none in the last minute'],
    ];
    const recent = micros.slice(-RECENT_N).reverse().map(m => [m.region, `${Math.round(m.duration_ms)} ms`, ago(now - m.at)]);
    return { rows: out, recent, frame: f };
  };

  // ── the gaze stream ─────────────────────────────────────────────────────────────────────────────────────────────
  const plugin = () => A.Face?.available?.() && typeof A.Face.plugin.faceDebug === 'function' ? A.Face.plugin : null;
  D.stream = async on => {
    const p = plugin();
    if (!p) return false;
    try {
      if (on && !D.listener) D.listener = await p.addListener('faceDebug', d => { if (d) { D.frame = d; D.frameAt = A.now(); D.draw?.(); } });
      await p.faceDebug({ on: !!on });
    } catch (e) { console.warn('face debug: stream failed', e); }
    if (!on && D.listener) { try { D.listener.remove?.(); } catch {} D.listener = null; D.frame = null; }
    return true;
  };

  if (typeof document === 'undefined' || typeof document.getElementById !== 'function') return;

  // ── the view ────────────────────────────────────────────────────────────────────────────────────────────────────
  const $ = id => document.getElementById(id);
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  let timer = 0, drawn = '', opener = null;

  const css = name => getComputedStyle($('faceDebug')).getPropertyValue(name).trim() || '#888';
  D.draw = () => {
    const c = $('fdFace');
    if (!c || !D.open || !c.getContext) return;
    const dpr = Math.min(devicePixelRatio || 1, 3), w = c.clientWidth || 300, h = c.clientHeight || 220;
    if (c.width !== Math.round(w * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
    const g = c.getContext('2d'), f = live(A.now()), ink = css('--fd-ink'), gaze = [css('--fd-left'), css('--fd-right')], dim = css('--fd-dim');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    const cx = w / 2, cy = h / 2 + 18, rx = 62, ry = 80, eyeY = cy - 14, eyeDX = 26;
    // the lens, at the top
    g.strokeStyle = dim; g.lineWidth = 1.5;
    g.beginPath(); g.arc(cx, 10, 5, 0, Math.PI * 2); g.stroke();
    g.fillStyle = dim; g.font = '11px system-ui, sans-serif'; g.textAlign = 'left'; g.fillText('lens', cx + 10, 14);
    // the face, mirror view
    g.globalAlpha = f?.tracked ? 1 : 0.35;
    g.strokeStyle = ink; g.lineWidth = 2;
    g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); g.stroke();
    const shut = num(f?.blink) ?? 0;
    const eyes = [[cx - eyeDX, f?.left_yaw_deg, f?.left_pitch_deg], [cx + eyeDX, f?.right_yaw_deg, f?.right_pitch_deg]];
    eyes.forEach(([x], i) => {
      g.beginPath(); g.ellipse(x, eyeY, 11, Math.max(1.5, 7 * (1 - shut)), 0, 0, Math.PI * 2); g.stroke();
      g.fillStyle = gaze[i]; g.beginPath(); g.arc(x, eyeY, 3, 0, Math.PI * 2); g.fill();
    });
    const draw = (x, y, a, color, width) => {
      if (!a) return;
      g.strokeStyle = color; g.fillStyle = color; g.lineWidth = width;
      if (a.dot) { g.beginPath(); g.arc(x, y, width + 3, 0, Math.PI * 2); g.stroke(); return; }
      const tx = x + a.dx, ty = y + a.dy, ang = Math.atan2(a.dy, a.dx), head = 7 + width;
      g.beginPath(); g.moveTo(x, y); g.lineTo(tx, ty); g.stroke();
      g.beginPath(); g.moveTo(tx, ty);
      g.lineTo(tx - head * Math.cos(ang - 0.45), ty - head * Math.sin(ang - 0.45));
      g.lineTo(tx - head * Math.cos(ang + 0.45), ty - head * Math.sin(ang + 0.45));
      g.closePath(); g.fill();
    };
    if (f?.tracked) {
      draw(cx, cy + 10, arrow(f.head_yaw_deg, f.head_pitch_deg, ARROW_PX * 0.8), dim, 1.5);
      eyes.forEach(([x, yaw, pitch], i) => draw(x, eyeY, arrow(yaw ?? f.gaze_yaw_deg, pitch ?? f.gaze_pitch_deg), gaze[i], 2.5));
    }
    g.globalAlpha = 1;
  };

  const rowEl = ([label, value, note]) => {
    const li = el('div', 'fd-row'), txt = el('span', 'fd-txt');
    txt.append(el('span', 'fd-k', label));
    if (note) txt.append(el('span', 'fd-note', note));
    li.append(txt, el('span', 'fd-v', value));
    return li;
  };

  const paint = () => {
    if (!D.open) return;
    const m = D.model(A.now()), key = JSON.stringify([m.rows, m.recent]);
    if (key !== drawn) {
      drawn = key;
      const list = [...m.rows.map(rowEl)];
      if (m.recent.length) {
        list.push(el('h3', 'fd-sub t-label', 'Last brief movements'));
        list.push(...m.recent.map(([where, how, when]) => rowEl([where, how, when])));
      }
      $('fdRows').replaceChildren(...list);
    }
    D.draw();
  };

  D.show = () => {
    const layer = $('faceDebug');
    if (!layer) return;
    opener = document.activeElement;
    D.open = true; drawn = '';
    A.Swipe?.stay?.(layer);
    layer.classList.remove('hidden');
    $('phone')?.classList.add('card-open');
    D.stream(true);
    clearInterval(timer);
    timer = setInterval(paint, 500);
    paint();
    layer.querySelector('.sheet')?.focus?.();
  };

  D.hide = () => {
    if (!D.open) return;
    D.open = false;
    clearInterval(timer); timer = 0;
    D.stream(false);
    const layer = $('faceDebug');
    const gone = () => {
      layer?.classList.add('hidden');
      const phone = $('phone');
      if (phone && !phone.querySelector('.screen.settings:not(.hidden), .layer:not(.hidden), .talk:not(.hidden), .onboard')) phone.classList.remove('card-open');
      const f = opener; opener = null;
      if (f?.isConnected) f.focus?.({ preventScroll: true });
    };
    // slides out like a swipe when it is closed with its button, the scrim or Escape (gui/swipe.js)
    if (!A.Swipe?.out?.(layer, gone)) gone();
  };

  const mount = () => {
    const phone = $('phone');
    if (!phone || $('faceDebug')) return;
    const layer = el('div', 'layer fd-layer hidden');
    layer.id = 'faceDebug';
    layer.setAttribute('role', 'dialog'); layer.setAttribute('aria-modal', 'true'); layer.setAttribute('aria-labelledby', 'fdTitle');
    const scrim = el('div', 'scrim'), sheet = el('div', 'sheet fd-sheet'), handle = el('div', 'handle');
    sheet.setAttribute('tabindex', '-1');
    handle.setAttribute('aria-hidden', 'true');
    const head = el('div', 'sheet-head'), title = el('h2', 't-headline', 'Face debug');
    title.id = 'fdTitle';
    head.append(title);
    const lede = el('p', 't-body-s muted fd-lede', 'Developer view. What the face measures see right now; nothing here is recorded or sent.');
    const canvas = el('canvas', 'fd-face');
    canvas.id = 'fdFace';
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', 'The face in mirror view, with an arrow out of each eye towards where it looks and a thin one for where the head points');
    const rows = el('div', 'fd-rows'), acts = el('div', 'sheet-actions');
    rows.id = 'fdRows';
    const close = el('button', 'btn tonal state', 'Close');
    close.type = 'button';
    close.onclick = () => D.hide();
    acts.append(close);
    sheet.append(handle, head, lede, canvas, rows, acts);
    layer.append(scrim, sheet);
    phone.append(layer);
    scrim.onclick = () => D.hide();
    const row = $('faceDebugRow');
    if (row) row.onclick = () => D.show();
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && D.open) { e.preventDefault(); e.stopPropagation?.(); D.hide(); } }, true);
    document.addEventListener('visibilitychange', () => { if (D.open) D.stream(!document.hidden); });
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})();
