// The feel of the app's own controls, outside the games: every tap on a button, a row, a switch or a picker answers with
// one word of the haptics router (haptics.js), heard once for the whole page, so a control added later feels the same.
//   touch  a button, a list or category row, an icon in a bar, Close and Back, a link; opening a sheet or a page is the
//          tap that opened it
//   tick   a switch (on and off), a segment, a tab, a radio choice (a mood lantern, a check-in answer), a menu choice,
//          and a picker or a select once its value has changed
// One haptic per tap at most: a control whose own handler already played something (a check-in answer, the end mood,
// Heart Duel's start, the breathing pause) is left to it, and the kindle plays its own swell (gui/shell.js).
// Only a finger is felt here: clicks the code sends itself (a swipe that closes through the scrim, Escape) are not, and
// the swipe plays its own (gui/swipe.js). Nothing while scrolling or typing; Return is felt once, as the tap on the button
// that sends the form, or as a touch where it only closes the keyboard.
// Confirmations and errors that arrive later (Connect, Talk, Show to my doctor) are played where they are known.
(() => {
  const CONTROL = 'button, a[href], [role="button"], [role="switch"], [role="radio"], [role="tab"], [role="menuitem"], .li:not(.static), [data-close], .scrim, .qs-scrim';
  const TICK = '[role="switch"], [role="radio"], [role="tab"], [role="menuitem"], .seg button, #nav [data-tab]';
  // Played by their own code (the kindle's hold), or not part of the phone (the developer panel beside it).
  const OWN = '#begin, #panel';
  const FIELD = 'input, textarea, select';
  // Fields that change by picking, not by typing: their change is the moment to feel.
  const PICKED = /^(checkbox|radio|time|date|datetime-local|month|week|range|color)$/;
  const TYPED = /^(text|search|url|tel|email|password|number)$/;
  const typeOf = el => (el.type || el.getAttribute?.('type') || 'text').toLowerCase();
  const typed = el => !!el && ((el.tagName === 'INPUT' && TYPED.test(typeOf(el))) || el.tagName === 'TEXTAREA');

  // The control a click lands on, or null when the click is not this file's to feel.
  const control = t => {
    if (!t?.closest || t.closest(OWN)) return null;
    // a field, or the row (label) around one: its change is felt, not the tap that focuses or flips it
    if (t.closest(FIELD)) return null;
    const label = t.closest('label');
    if (label && label.querySelector(FIELD)) return null;
    const c = t.closest(CONTROL);
    if (!c || c.disabled || c.getAttribute('aria-disabled') === 'true') return null;
    return c;
  };
  const wordOf = c => (c.closest(TICK) === c || c.querySelector('[role="switch"]') ? 'tick' : 'touch');

  // Whatever the control's own handlers play during the event counts; the heartbeat beating along does not.
  let played = 0;
  A.bus.on('haptic', w => { if (w !== 'heart') played++; });
  const after = (e, word) => {
    const mark = played;
    // after every handler of this event has run, wherever it stopped propagating
    setTimeout(() => { if (played === mark) A.Haptics?.play(word); }, 0);
  };
  const real = e => e.isTrusted !== false && !e.cancelBubble;

  if (typeof document !== 'undefined' && document.addEventListener) {
    // Capture, so a handler that stops the click (the small-step answers, ba.js) is still felt. swipe.js, loaded
    // before, swallows the click a mouse drag ends with; that one is cancelled by the time it gets here.
    document.addEventListener('click', e => {
      if (!real(e)) return;
      const c = control(e.target);
      if (c) after(e, wordOf(c));
    }, true);
    document.addEventListener('change', e => {
      const t = e.target;
      if (!real(e) || !t?.closest || t.closest(OWN)) return;
      if (t.tagName === 'SELECT' || (t.tagName === 'INPUT' && PICKED.test(typeOf(t)))) after(e, 'tick');
    }, true);
    // Return in a text field: the form's button is tapped for it when the form sends itself (that tap is felt above);
    // otherwise Return closes the keyboard or moves on (keyboard.js), and that is felt here.
    document.addEventListener('keydown', e => {
      const t = e.target;
      if (!real(e) || e.key !== 'Enter' || e.isComposing || e.keyCode === 229 || !typed(t) || t.tagName === 'TEXTAREA') return;
      const sends = !!t.form?.querySelector('button:not([type]), button[type="submit"], input[type="submit"]');
      if (sends && t.getAttribute('enterkeyhint') !== 'next') return;
      after(e, 'touch');
    }, true);
  }

  A.Feel = { CONTROL, TICK, OWN, control, wordOf };
})();
