// The on-screen keyboard. The text fields are short (a name, a place, an address), so on a phone:
//  - Return closes the keyboard. A field on its own saves on change, which closing it fires; in a form, Return sends the
//    form and then closes. The key says what it does (enterkeyhint): "done" unless the markup says "next" or "go".
//  - A tap anywhere outside the field closes the keyboard too.
//  - The field stays in view above the keyboard. Only the scroller it sits in moves (a settings page body), never the
//    page, so a header stays under the status bar. The web view itself shrinks above the keyboard on iOS
//    (capacitor.config.json, Keyboard.resize "native") and on Android (adjustResize; Capacitor's SystemBars pads it).
//  - iOS: no form accessory bar (the ⌃ ⌄ ✓ row above the keys), switched off once at start through @capacitor/keyboard.
// iOS also zooms the whole page into a field whose text is under 16 px; every field is 16 px or more in the CSS
// (tests/keyboard.test.js checks them all).
(() => {
  const C = window.Capacitor;
  const native = !!C?.isNativePlatform?.();
  const ios = native && C.getPlatform?.() === 'ios';
  const plugin = () => C?.Plugins?.Keyboard ?? C?.registerPlugin?.('Keyboard');
  const quiet = p => { try { Promise.resolve(p).catch(() => {}); } catch {} };

  // Fields that bring up the keyboard (date and time open a picker instead).
  const TYPED = /^(text|search|url|tel|email|password|number)$/;
  const typed = el => !!el && ((el.tagName === 'INPUT' && TYPED.test(el.getAttribute('type') || 'text')) || el.tagName === 'TEXTAREA');
  const FIELDS = 'input, textarea, select, [contenteditable]';

  if (ios) quiet(plugin()?.setAccessoryBarVisible?.({ isVisible: false }));

  // The keyboard: its height from the plugin, and the window height without it. Its top edge is at full - kb in the
  // page's coordinates both before and after the web view shrinks (the web view keeps its top at the top of the screen).
  // The plugin shrinks the web view about 0.2 s after the keyboard is up, and the page's 100dvh follows a little after
  // innerHeight does. Until the scroller is short enough to scroll by itself it gets extra room at its end, so the
  // field moves up with the keyboard instead of after it.
  let kb = 0, full = window.innerHeight, pad = null;
  const GAP = 16;
  const scroller = el => {
    for (let n = el.parentElement; n && n !== document.body && n !== document.documentElement; n = n.parentElement) {
      const o = getComputedStyle(n).overflowY;
      if (o === 'auto' || o === 'scroll') return n;
    }
    return null;
  };
  const unpad = () => {
    if (!pad) return;
    watch?.unobserve(pad.box);
    pad.box.style.paddingBottom = pad.was;
    pad = null;
  };
  // the extra room comes off once the scroller would keep its place without it: when it has shrunk with the web view
  const settle = () => { if (pad && pad.box.scrollHeight - pad.extra - pad.box.clientHeight >= pad.box.scrollTop) unpad(); };
  const watch = window.ResizeObserver ? new ResizeObserver(settle) : null;
  const reveal = () => {
    settle();
    const el = document.activeElement;
    if (!typed(el)) return 0;
    const box = scroller(el);
    if (!box) return 0;
    const row = el.closest('.li, .field, .qf') || el;
    const r = row.getBoundingClientRect(), b = box.getBoundingClientRect();
    const vv = window.visualViewport;
    const seen = Math.min(window.innerHeight, kb ? full - kb : Infinity, vv ? vv.offsetTop + vv.height : Infinity);
    const top = b.top + GAP, bottom = Math.min(b.bottom, seen) - GAP;
    let dy = r.bottom > bottom ? r.bottom - bottom : 0;
    if (r.top - dy < top) dy = r.top - top;   // a row taller than the space left: its top, where the label is
    if (Math.abs(dy) < 1) return 0;
    const short = dy - (box.scrollHeight - box.clientHeight - box.scrollTop);
    if (short > 0) {
      if (pad && pad.box !== box) unpad();
      if (!pad) { pad = { box, was: box.style.paddingBottom, extra: 0 }; watch?.observe(box); }
      pad.extra += Math.ceil(short);
      box.style.paddingBottom = `${(parseFloat(getComputedStyle(box).paddingBottom) || 0) + Math.ceil(short)}px`;
    }
    // At once, not smooth: iOS drops a smooth scroll when the web view resizes under it.
    box.scrollTop += dy;
    return dy;
  };
  const later = () => requestAnimationFrame(() => reveal());
  const hidden = () => { kb = 0; unpad(); };

  addEventListener('keyboardWillShow', e => { kb = Number(e.keyboardHeight) || 0; later(); });
  addEventListener('keyboardDidShow', e => { kb = Number(e.keyboardHeight) || kb; later(); });
  addEventListener('keyboardWillHide', hidden);
  addEventListener('keyboardDidHide', () => { hidden(); full = window.innerHeight; });
  addEventListener('resize', () => { if (!kb && !typed(document.activeElement)) full = window.innerHeight; later(); });
  window.visualViewport?.addEventListener('resize', later);

  document.addEventListener('focusin', e => {
    const el = e.target;
    if (!typed(el)) return;
    if (!el.hasAttribute('enterkeyhint') && el.tagName !== 'TEXTAREA') el.setAttribute('enterkeyhint', 'done');
    later();
  });

  // Return: on to the next field, send the form, or close. Closing fires change, which saves the field.
  const close = () => { const a = document.activeElement; if (a && a.matches?.(FIELDS)) a.blur(); };
  const sends = form => !!form?.querySelector('button:not([type]), button[type="submit"], input[type="submit"]');
  const next = el => {
    const all = [...(el.form || document).querySelectorAll(FIELDS)].filter(f => typed(f) && !f.disabled && f.getClientRects().length);
    return all[all.indexOf(el) + 1] || null;
  };
  document.addEventListener('keydown', e => {
    const el = e.target;
    if (e.key !== 'Enter' || e.isComposing || e.keyCode === 229 || !typed(el) || el.tagName === 'TEXTAREA') return;
    if (el.getAttribute('enterkeyhint') === 'next') { const n = next(el); if (n) { e.preventDefault(); n.focus(); return; } }
    if (sends(el.form)) return;   // the form sends itself; 'submit' below closes the keyboard
    e.preventDefault();
    el.blur();
  });
  document.addEventListener('submit', close, true);

  // A tap outside the field closes the keyboard. A tap on another field moves to it, and one on the field's own row
  // (its label) keeps it open.
  document.addEventListener('pointerdown', e => {
    const a = document.activeElement, t = e.target;
    if (!typed(a) || !t?.closest) return;
    const label = t.closest('label');
    if (t.closest(FIELDS) || (label && (label.contains(a) || label.control === a))) return;
    a.blur();
  }, true);

  if (window.A) A.Keyboard = { ios, reveal, close };
})();
