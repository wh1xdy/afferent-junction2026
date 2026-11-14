// Swipe gestures for sheets and pages. A sheet follows the finger down and closes past a distance or a flick, otherwise
// it springs back; a page follows the finger from its left edge and goes back the same way. Scrolling inside a sheet wins:
// it only drags when its content is scrolled to the top, or when the drag starts on the handle.
// Touch events, because WKWebView answers a pan with pointercancel and a pointer drag dies there; pointer events for a
// mouse or a pen. Used by the app shell (bottom of this file), checkin.js, qrshow.js and patient.js.
(() => {
  const T = {
    decide: 4,                                  // px of travel before the direction is read
    edge: 24,                                   // a page drag starts this close to the page's left edge
    down: { share: 0.25, min: 80, max: 160 },   // a sheet closes past a quarter of its height, 80 to 160 px
    back: { share: 0.3, min: 72, max: 140 },    // a page goes back past a third of its width, 72 to 140 px
    flick: 0.5,                                 // px per ms: a flick this fast closes from flickMin on
    flickMin: 24,
    window: 100,                                // ms of samples the release speed is read over
    spring: 300, slide: 280,                    // ms; a sheet closed by a button leaves in `slide` too
  };
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

  // How far a sheet (axis y) or a page (axis x) of this size has to travel to close.
  const threshold = (size, axis = 'y') => { const t = axis === 'y' ? T.down : T.back; return clamp(size * t.share, t.min, t.max); };

  // Which gesture this is once the finger has moved T.decide px: 'down' (drag the sheet), 'back' (drag the page from its
  // left edge) or 'none' (leave it to the page: scrolling, a sideways swipe, a drag up). null: not decided yet.
  // top: the content under the finger is scrolled to the top. handle: the drag started on the handle. edge: at the left edge.
  const decide = ({ dx, dy, top = true, handle = false, edge = false, down = true, back = false }) => {
    if (Math.abs(dx) < T.decide && Math.abs(dy) < T.decide) return null;
    if (back && edge && dx > 0 && dx >= Math.abs(dy)) return 'back';
    if (down && dy > 0 && dy >= Math.abs(dx) && (top || handle)) return 'down';
    return 'none';
  };

  // On release: 'close' past the distance or on a flick that way, 'stay' (spring back) otherwise or when thrown back.
  const release = ({ d, v = 0, size, axis = 'y' }) => {
    if (v <= -T.flick / 2) return 'stay';
    if (d >= threshold(size, axis)) return 'close';
    if (v >= T.flick && d >= T.flickMin) return 'close';
    return 'stay';
  };

  // A sheet that cannot close gives less the further it is pulled (UIScrollView's rubber band).
  const rubber = (d, size) => (d <= 0 || !size ? 0 : (1 - 1 / (d * 0.55 / size + 1)) * size);

  const EASE = 'cubic-bezier(0.2, 0, 0, 1)';
  // One style write per frame however many touchmoves arrive (iOS sends them at 120 Hz on ProMotion phones).
  const frame = f => (typeof requestAnimationFrame === 'function' ? requestAnimationFrame(f) : setTimeout(f, 16));
  const unframe = id => (typeof cancelAnimationFrame === 'function' ? cancelAnimationFrame(id) : clearTimeout(id));
  // Something is moving under a finger or on its way out: the world under it waits (main.js), so the phone spends the
  // frame on the sheet. hold(ms) covers an animation that runs without a finger (a sheet opening or leaving).
  let dragging = 0, still = 0;
  const hold = ms => { still = Math.max(still, now() + ms); };
  const reduced = () => document.documentElement?.dataset?.motion === 'reduced' || !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  // Swallow the click a mouse drag ends with (a touch drag does not make one), not the clicks this file sends itself.
  let quietUntil = 0;
  if (typeof document !== 'undefined') document.addEventListener('click', e => { if (e.isTrusted && now() < quietUntil) { e.preventDefault(); e.stopPropagation(); } }, true);

  // Content between the finger and the sheet that is scrolled down: then a drag down scrolls it back up instead.
  const atTop = (target, sheet) => {
    for (let n = target; n && n.nodeType === 1; n = n.parentNode) {
      if (n.scrollTop > 0) return false;
      if (n === sheet) break;
    }
    return true;
  };

  // bind(surface, resolve): resolve(target) is asked when a touch starts and gives the gesture's parts, or null:
  //   sheet   the element that moves down
  //   down    closes it on a swipe down; stiff: true instead lets it give a little and spring back (a sheet that has to be answered)
  //   back    goes back on a swipe from the left edge of `page` (default the sheet); `side` is what moves then (default the sheet)
  //   handle  selector: a drag that starts there moves the sheet even when its content is scrolled
  //   scrim   fades as the sheet goes
  //   leaves  'slide' (default: slide it out, then down()), 'self' (down() at once, the owner animates it out),
  //           'spring' (spring back and down() at once: the check-in, which changes screen in place)
  //   keep    leave it where it slid to (a page that navigates away)
  const bind = (surface, resolve) => {
    let g = null, raf = 0;
    const shown = d => (g.mode === 'back' || g.c.down ? Math.max(0, d) : rubber(d, g.size));
    const scrimOf = s => (s.mode === 'down' ? s.c.scrim : null);

    const paint = d => {
      g.el.style.translate = g.mode === 'down' ? `0 ${d.toFixed(1)}px` : `${d.toFixed(1)}px 0`;
      const scrim = scrimOf(g);
      if (scrim && g.c.down) scrim.style.opacity = String((g.fade * (1 - 0.8 * clamp(d / g.size, 0, 1))).toFixed(3));
    };
    const reset = s => {
      s.el.style.translate = ''; s.el.style.transition = ''; s.el.style.willChange = '';
      const scrim = scrimOf(s);
      if (scrim) { scrim.style.opacity = ''; scrim.style.transition = ''; scrim.style.willChange = ''; }
    };
    const spring = s => {
      if (reduced() || !s.d) { reset(s); return; }
      hold(T.spring + 40);
      const ease = `${T.spring}ms cubic-bezier(0.2, 0.9, 0.3, 1)`, scrim = scrimOf(s);
      s.el.style.transition = `translate ${ease}`;
      s.el.style.translate = '';
      if (scrim) { scrim.style.transition = `opacity ${ease}`; scrim.style.opacity = ''; }
      setTimeout(() => { if (!s.el.style.translate) reset(s); }, T.spring + 40);
    };

    const start = (x, y, target, id, kind) => {
      if (g || !target?.closest || target.closest('input, textarea, select')) return false;
      const c = resolve(target);
      if (!c?.sheet || !(c.down || c.stiff || c.back)) return false;
      const box = (c.page || c.sheet).getBoundingClientRect?.() || { left: 0 };
      g = { c, id, kind, x, y, dx: 0, dy: 0, mode: null, el: null, d: 0, samples: [],
        top: atTop(target, c.sheet), handle: !!(c.handle && target.closest(c.handle)), edge: x - box.left <= T.edge };
      return true;
    };
    const move = (x, y, e) => {
      g.dx = x - g.x; g.dy = y - g.y;
      if (!g.mode) {
        const m = decide({ dx: g.dx, dy: g.dy, top: g.top, handle: g.handle, edge: g.edge, down: !!(g.c.down || g.c.stiff), back: !!g.c.back });
        if (!m) { if (g.handle || (g.edge && g.c.back)) e.preventDefault?.(); return; }
        if (m === 'none') { drop(); return; }
        g.mode = m;
        g.el = m === 'back' ? g.c.side || g.c.sheet : g.c.sheet;
        const box = m === 'back' ? g.c.page || g.el : g.el;
        g.size = (m === 'down' ? box.offsetHeight : box.offsetWidth) || (m === 'down' ? window.innerHeight : window.innerWidth) || 1;
        const scrim = scrimOf(g);
        g.fade = scrim && typeof getComputedStyle === 'function' ? Number(getComputedStyle(scrim).opacity) || 1 : 1;
        // its own compositing layer for the drag, so a move is a translate on the GPU and not a repaint
        g.el.style.transition = 'none'; g.el.style.willChange = 'transform';
        if (scrim) { scrim.style.transition = 'none'; scrim.style.willChange = 'opacity'; }
        dragging++;
      }
      if (e.cancelable !== false) e.preventDefault?.();
      const d = g.mode === 'down' ? g.dy : g.dx, t = now();
      g.samples.push([t, d]);
      while (g.samples.length > 2 && t - g.samples[0][0] > T.window) g.samples.shift();
      g.d = shown(d);
      if (!raf) raf = frame(() => { raf = 0; if (g?.mode) paint(g.d); });
    };
    const end = cancelled => {
      const s = g; drop();
      if (raf) { unframe(raf); raf = 0; }
      if (!s?.mode) return;
      dragging = Math.max(0, dragging - 1);
      quietUntil = now() + 400;
      const { c, mode, size, samples, el } = s, scrim = scrimOf(s);
      const [t0, d0] = samples[0] || [0, 0], [t1, d1] = samples[samples.length - 1] || [0, 0];
      const v = t1 > t0 ? (d1 - d0) / (t1 - t0) : 0;
      const go = mode === 'down' ? c.down : c.back;
      const verdict = cancelled || !go ? 'stay' : release({ d: s.d, v, size, axis: mode === 'down' ? 'y' : 'x' });
      if (verdict === 'stay') { spring(s); return; }
      if (c.leaves === 'self') { el.style.transition = ''; if (scrim) { scrim.style.transition = ''; scrim.style.opacity = ''; } hold(T.slide + 40); go(); return; }
      if (c.leaves === 'spring') { spring(s); go(); return; }
      if (reduced()) { go(); if (!c.keep) reset(s); return; }
      const ms = Math.round(clamp((size - s.d) / Math.max(Math.abs(v), 1.2), 120, T.slide));
      const ease = `${ms}ms ${EASE}`;
      hold(ms + 40);
      el.style.transition = `translate ${ease}`;
      el.style.translate = mode === 'down' ? `0 ${size + 24}px` : `${size}px 0`;
      if (scrim) { scrim.style.transition = `opacity ${ease}`; scrim.style.opacity = '0'; }
      setTimeout(() => { go(); if (!c.keep) reset(s); }, ms);
    };

    // A touch's events all go to the element it started on, even after that element left the page (Your signals
    // redraws its rows every second), so they are heard there and not where they would bubble to.
    let off = null;
    const drop = () => { g = null; off?.(); off = null; };
    const touch = e => g && [...e.changedTouches].find(t => t.identifier === g.id);
    const tmove = e => { const t = g?.kind === 'touch' && touch(e); if (t) move(t.clientX, t.clientY, e); };
    const tend = e => { if (g?.kind === 'touch' && touch(e)) end(e.type === 'touchcancel'); };
    surface.addEventListener('touchstart', e => {
      if (e.touches.length > 1) { if (g?.kind === 'touch') end(true); return; }
      const t = e.changedTouches[0], el = e.target;
      if (!start(t.clientX, t.clientY, el, t.identifier, 'touch')) return;
      el.addEventListener('touchmove', tmove, { passive: false });
      el.addEventListener('touchend', tend);
      el.addEventListener('touchcancel', tend);
      off = () => { el.removeEventListener('touchmove', tmove, { passive: false }); el.removeEventListener('touchend', tend); el.removeEventListener('touchcancel', tend); };
    }, { passive: true });
    surface.addEventListener('pointerdown', e => { if (e.pointerType !== 'touch' && !e.button) start(e.clientX, e.clientY, e.target, e.pointerId, 'pointer'); });
    const mine = e => g?.kind === 'pointer' && e.pointerId === g.id;
    window.addEventListener?.('pointermove', e => { if (mine(e)) move(e.clientX, e.clientY, e); });
    window.addEventListener?.('pointerup', e => { if (mine(e)) end(false); });
    window.addEventListener?.('pointercancel', e => { if (mine(e)) end(true); });
    return { busy: () => !!g?.mode };
  };

  // The app shell: a sheet with a handle (How it works, Your signals, the clip check) closes through its scrim, the
  // onboarding sheet has to be answered so it only gives, and Settings, Talk and Heart Duel go back from the left edge.
  const PAGES = { settings: '[data-close="settings"]', voice: '[data-close="voice"]', duel: '[data-duel-close]' };
  const kid = (el, cls) => el && [...el.children].find(c => c.classList.contains(cls));
  const app = phone => bind(phone, target => {
    if (target.closest('.ci')) return null;
    const sheet = target.closest('.sheet');
    if (sheet && kid(sheet, 'handle')) {
      const scrim = kid(sheet.closest('.layer'), 'scrim');
      return scrim ? { sheet, scrim, handle: '.handle, .sheet-head', down: () => scrim.click() } : { sheet, handle: '.handle', stiff: true };
    }
    const page = target.closest('.screen');
    const back = page && PAGES[page.id] && !page.classList.contains('hidden') && page.querySelector(PAGES[page.id]);
    return back ? { sheet: page, back: () => back.click() } : null;
  });

  // A sheet closed any other way (its button, the scrim, Escape) leaves like a finished swipe: it slides down while the
  // scrim fades, then done() hides it. A page with a back arrow slides out to the right, a dialog fades. Reduced motion:
  // a quick fade. Returns false when there is nothing to animate (or it already slid out under the finger): the caller
  // hides it at once.
  const leaving = new Map();
  const out = (layer, done) => {
    if (!layer) return false;
    if (leaving.has(layer)) return true;
    const screen = layer.classList.contains('screen') || layer.classList.contains('ci');
    const sheet = screen ? layer : kid(layer, 'sheet'), dialog = !screen && kid(layer, 'dialog'), scrim = !screen && kid(layer, 'scrim');
    if (!sheet && !dialog) return false;
    if (sheet && sheet.style.translate) return false;
    const side = screen && !layer.classList.contains('talk') && !layer.classList.contains('ci');
    const still = reduced(), ms = still ? 150 : sheet ? T.slide : 200, ease = `${ms}ms ${still ? 'linear' : EASE}`, parts = [];
    if (still || !sheet) { layer.style.transition = `opacity ${ease}`; layer.style.opacity = '0'; parts.push(layer); }
    else {
      sheet.style.transition = `translate ${ease}`; sheet.style.willChange = 'transform';
      sheet.style.translate = side ? `${sheet.offsetWidth || window.innerWidth || 400}px 0` : `0 ${(sheet.offsetHeight || window.innerHeight || 800) + 24}px`;
      parts.push(sheet);
      if (scrim) { scrim.style.transition = `opacity ${ease}`; scrim.style.opacity = '0'; parts.push(scrim); }
    }
    const clear = () => parts.forEach(n => { n.style.transition = ''; n.style.translate = ''; n.style.opacity = ''; n.style.willChange = ''; });
    hold(ms + 40);
    leaving.set(layer, { timer: setTimeout(() => { leaving.delete(layer); done(); clear(); }, ms), clear });
    return true;
  };
  // Opened again while it was leaving: it stays.
  const stay = layer => { const l = leaving.get(layer); if (!l) return; clearTimeout(l.timer); leaving.delete(layer); l.clear(); };

  A.Swipe = { T, threshold, decide, release, rubber, bind, app, out, stay, hold, leaving: layer => leaving.has(layer),
    get dragging() { return dragging > 0; }, get moving() { return dragging > 0 || now() < still; } };
  const phone = typeof document !== 'undefined' && document.getElementById('phone');
  if (phone) app(phone);
})();
