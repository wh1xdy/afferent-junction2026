// Run: node demo/tests/ui-haptics.test.js
// The feel of the app's own controls (demo/js/gui/feel.js, gui/swipe.js): every control in index.html and patient.html,
// with the rows Settings, the end screen and the check-in build, answers a tap with exactly one haptic of the router
// (haptics.js); switches tick on and off; a swipe ticks once at the distance that closes; scrolling and typing are not
// felt; the Vibration switch silences all of it. The pages run on the fake DOM (fakedom.js) with their markup parsed,
// the real router behind a fake AfferentHaptics plugin, a manual clock and manual timers. Taps here are test input.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
const { makeDocument, El } = require('./fakedom');

const DEMO = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(DEMO, f), 'utf8');

// Markup into the fake DOM: tags, attributes and text; a tag closed with /> (an SVG path) has no children.
const VOID = new Set(['INPUT', 'BR', 'IMG', 'HR', 'META', 'LINK']);
const parseInto = (doc, parent, src) => {
  const stack = [parent];
  for (const m of src.matchAll(/<!--[\s\S]*?-->|<\/([\w-]+)\s*>|<([\w-]+)((?:\s+[\w:-]+(?:="[^"]*")?)*)\s*(\/?)>|([^<]+)/g)) {
    if (m[1]) { while (stack.length > 1 && stack.pop().tagName !== m[1].toUpperCase()); continue; }
    if (m[2]) {
      const e = doc.createElement(m[2]);
      for (const a of m[3].matchAll(/([\w:-]+)(?:="([^"]*)")?/g)) e.setAttribute(a[1], a[2] ?? '');
      stack[stack.length - 1].append(e);
      if (!VOID.has(e.tagName) && !m[4]) stack.push(e);
    } else if (m[5]?.trim()) stack[stack.length - 1].append(m[5].trim());
  }
  return parent;
};

// What the fake DOM needs on top: parsed templates, focus, sizes, parentElement, a form for a field, and listeners
// that come off again.
const extend = doc => {
  Object.defineProperty(El.prototype, 'content', { configurable: true, get() { return parseInto(doc, doc.createDocumentFragment(), this.html); } });
  Object.assign(El.prototype, {
    focus() { if (this.ownerDocument) this.ownerDocument.activeElement = this; },
    blur() {},
    contains(n) { for (; n; n = n.parentNode) if (n === this) return true; return false; },
    removeEventListener(t, f) { this.listeners[t] = (this.listeners[t] || []).filter(x => x !== f); },
    getBoundingClientRect() { return { left: 0, top: 0, width: 402, height: 874, right: 402, bottom: 874 }; },
    getClientRects() { return [1]; },
    setPointerCapture() {},
  });
  Object.defineProperties(El.prototype, {
    isConnected: { configurable: true, get() { let n = this; while (n.parentNode) n = n.parentNode; return n === this.ownerDocument?.documentElement; } },
    offsetHeight: { configurable: true, get() { return this.h ?? 560; } },
    offsetWidth: { configurable: true, get() { return 402; } },
    parentElement: { configurable: true, get() { return this.parentNode?.nodeType === 1 ? this.parentNode : null; } },
    form: { configurable: true, get() { return this.tagName === 'INPUT' || this.tagName === 'BUTTON' ? this.closest('form') : undefined; } },
  });
};

// An event as a browser sends it: the document's capture listeners, then the target and up through its parents
// (each node's listeners and its on<type>), then the document's bubble listeners. Taps are trusted, clicks the code
// sends itself (el.click()) are not.
const dispatch = (doc, target, type, extra = {}) => {
  const e = { type, target, isTrusted: true, cancelBubble: false, defaultPrevented: false, cancelable: true, touches: [], changedTouches: [],
    preventDefault() { this.defaultPrevented = true; }, stopPropagation() { this.cancelBubble = true; }, ...extra };
  e.currentTarget = doc;
  for (const l of [...(doc.listeners[type] || [])]) if (l.capture) l.f(e);
  for (let n = target; n && n.nodeType === 1 && !e.cancelBubble; n = n.parentNode) {
    e.currentTarget = n;
    for (const f of [...(n.listeners[type] || [])]) f(e);
    n['on' + type]?.(e);
  }
  e.currentTarget = doc;
  if (!e.cancelBubble) for (const l of [...(doc.listeners[type] || [])]) if (!l.capture) l.f(e);
  return e;
};

// The app's own haptics plugin as the native side exports it, recording every pattern it is asked to play.
const fakeOwn = () => {
  const played = [];
  const ok = () => Promise.resolve({ played: true });
  return { played, play: o => { played.push(o.name); return ok(); }, success: () => { played.push('success'); return ok(); },
    available: () => Promise.resolve({ haptics: true, continuous: true }), warm: ok, stopAll: ok, dragStop: ok, holdStop: ok, beat: ok };
};

// A page with its scripts: 'index' (the phone of index.html with Settings, the end screen and the check-in) or
// 'patient' (patient.html). Reduced motion, so a swipe that closes closes the moment the finger lifts.
const page = which => {
  const doc = makeDocument();
  extend(doc);
  doc.listeners = {};
  doc.addEventListener = (t, f, o) => { (doc.listeners[t] = doc.listeners[t] || []).push({ f, capture: o === true || !!o?.capture }); };
  doc.removeEventListener = () => {};
  doc.documentElement.dataset.motion = 'reduced';
  doc.activeElement = null;
  const html = read(which === 'patient' ? 'patient.html' : 'index.html');
  if (which === 'patient') {
    const body = html.slice(html.indexOf('>', html.indexOf('<body')) + 1, html.indexOf('<script'));
    doc.body.replaceChildren(...parseInto(doc, doc.createElement('div'), body).childNodes);
  } else {
    doc.body.replaceChildren(parseInto(doc, doc.createElement('div'), html.slice(html.indexOf('<section id="phone">'), html.indexOf('<aside id="panel">'))).children[0]);
  }
  El.prototype.click = function () { dispatch(doc, this, 'click', { isTrusted: false }); };

  let clock = 0, timers = [], frames = [];
  const storage = new Map([['afferent.checkin.test', JSON.stringify({ anchor: 1 })]]);
  const own = fakeOwn();
  const ctx = {
    console, URLSearchParams, Promise, location: { search: '', hash: '', pathname: '/' }, navigator: {}, document: doc,
    performance: { now: () => clock }, matchMedia: () => ({ matches: false }), crypto: { randomUUID: () => 'test-id' },
    localStorage: { getItem: k => storage.get(k) ?? null, setItem: (k, v) => { storage.set(k, String(v)); }, removeItem: k => { storage.delete(k); } },
    addEventListener() {}, removeEventListener() {}, setInterval: () => 0, clearInterval() {},
    setTimeout: (f, ms) => { const t = { f, at: clock + (ms || 0) }; timers.push(t); return t; }, clearTimeout: t => { if (t) t.f = null; },
    requestAnimationFrame: f => { frames.push(f); return frames.length; }, cancelAnimationFrame: id => { frames[id - 1] = null; },
    Capacitor: { isNativePlatform: () => true, getPlatform: () => 'ios', Plugins: { AfferentHaptics: own } },
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  const run = f => vm.runInContext(read('js/' + f), ctx, { filename: f });
  run('util.js');
  vm.runInContext(`A.now = () => __ms() / 1000; A.config = { patientId: 'test', deviceId: 'test', appVersion: 'test', sharing: 'summary' };`, Object.assign(ctx, { __ms: () => clock }));
  run('haptics.js');
  if (which === 'patient') ['gui/swipe.js', 'gui/feel.js'].forEach(run);
  else {
    run('gui/lantern.js');
    ctx.A.Theme = { scheme: 'kaamos', local: () => 'kaamos', set() {}, sync() {}, room() {} };
    ['gui/shell.js', 'gui/swipe.js', 'gui/feel.js', 'checkin.js'].forEach(run);
    ctx.A.Checkin.init({});
    // main.js's own show() (cut out of main.js as it is), on its [data-open] and [data-close] buttons
    const showSrc = read('js/main.js').match(/\n  const FADES = [\s\S]*?\n    set\(\);\n  \};\n/)[0];
    const show = vm.runInContext(`(() => { const $ = id => document.getElementById(id); ${showSrc} return show; })()`, ctx);
    doc.querySelectorAll('[data-open]').forEach(b => { b.onclick = () => show(b.dataset.open, true); });
    doc.querySelectorAll('[data-close]').forEach(b => { b.onclick = () => show(b.dataset.close, false); });
  }
  const A = ctx.A, heard = [];
  A.bus.on('haptic', w => heard.push(w));
  // Timers and frames that are due, until none are.
  const settle = () => {
    for (let i = 0; i < 20; i++) {
      const due = timers.filter(t => t.at <= clock);
      const fr = frames.splice(0);
      if (!due.length && !fr.some(Boolean)) break;
      timers = timers.filter(t => t.at > clock);
      due.forEach(t => t.f?.());
      fr.forEach(f => f?.(clock));
    }
  };
  // What one action is felt as: the action, everything it sets off, and a pause long enough for every lane and hush.
  const felt = act => { settle(); clock += 2000; settle(); const from = heard.length; act(); settle(); clock += 2000; settle(); return heard.slice(from); };
  const $ = id => doc.getElementById(id);
  return { doc, $, A, H: A.Haptics, ctx, own, heard, felt, settle, tick: ms => { clock += ms; }, fire: (el, type, extra) => dispatch(doc, el, type, extra) };
};

// The interactive parts of a page, and what a tap on each should be felt as.
const INTERACTIVE = 'button, a[href], [role="button"], [role="switch"], [role="radio"], [role="tab"], [role="menuitem"], [data-close], .scrim, .li, label, input, select, textarea';
const FIELDS = new Set(['INPUT', 'SELECT', 'TEXTAREA']);
const PICKED = /^(checkbox|radio|time|date|range)$/;
const typeOf = el => (el.type || el.getAttribute('type') || 'text');
const is = (el, sel) => el.closest(sel) === el;
const expected = el => {
  if (el.closest('#begin')) return [];                              // the kindle plays its own swell
  if (FIELDS.has(el.tagName) || (el.tagName === 'LABEL' && el.querySelector('input, select, textarea'))) return [];  // felt on change
  if (el.classList.contains('li') && el.classList.contains('static')) return null;   // not a control
  if (el.tagName === 'LABEL') return null;
  const tick = ['switch', 'radio', 'tab', 'menuitem'].includes(el.getAttribute('role')) || !!el.closest('.seg') || is(el, '#nav [data-tab]') || !!el.querySelector('[role="switch"]');
  return [tick ? 'tick' : 'touch'];
};
const name = el => `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${el.className ? '.' + el.className.split(/\s+/).join('.') : ''}${el.getAttribute('role') ? `[role=${el.getAttribute('role')}]` : ''}`;
const kind = el => `${el.tagName.toLowerCase()}${el.getAttribute('role') ? `[role=${el.getAttribute('role')}]` : ''}.${(el.className.split(/\s+/)[0] || '')}`;

// Tap every control of the page once; returns the kinds of control that were tapped.
const sweep = p => {
  const kinds = new Set(), all = p.doc.querySelectorAll(INTERACTIVE);
  for (const el of all) {
    const want = expected(el);
    if (want === null) continue;
    const got = p.felt(() => p.fire(el, 'click'));
    assert.deepStrictEqual(got, want, `${name(el)}: a tap is felt as ${JSON.stringify(want)}, was ${JSON.stringify(got)}`);
    if (FIELDS.has(el.tagName)) {
      const picked = el.tagName === 'SELECT' || PICKED.test(typeOf(el));
      const changed = p.felt(() => { if (typeOf(el) === 'checkbox') el.checked = !el.checked; else el.value = '07:30'; p.fire(el, 'change'); });
      assert.deepStrictEqual(changed, picked ? ['tick'] : [], `${name(el)}: its change is felt as ${picked ? 'a tick' : 'nothing (typed)'}`);
    }
    kinds.add(kind(el));
  }
  return { kinds, count: all.length };
};

const tests = {
  'the pages load the feel after the router and the swipe'() {
    for (const f of ['index.html', 'patient.html']) {
      const html = read(f), at = s => html.indexOf(`<script src="js/${s}"></script>`);
      assert.ok(at('haptics.js') > at('util.js') && at('gui/feel.js') > at('haptics.js') && at('gui/feel.js') > at('gui/swipe.js'), `${f}: util, haptics, swipe, then feel`);
    }
  },

  'index.html: every control is felt exactly once per tap: touch for buttons, rows and links, tick for switches, segments and choices'() {
    const p = page('index');
    p.A.Checkin.open();   // the check-in's intro on top, with its buttons
    p.settle();
    const { kinds, count } = sweep(p);
    assert.ok(count > 80, `only ${count} controls were found; the page has lost its markup`);
    for (const k of ['button.icon-btn', 'button.li', 'button.btn', 'label.li', 'a.li', 'button[role=radio].state', 'button[role=radio].mood-lantern', 'div.scrim', 'input.', 'button.dev-toggle', 'button.ci-btn'])
      assert.ok(kinds.has(k), `${k} was tapped (${[...kinds].join(', ')})`);
    assert.ok(p.doc.querySelectorAll('.set-cat').length >= 5, 'the Settings categories are there');
  },

  'patient.html: tabs and segments tick, Share, Settings rows and the code button touch, a sensor row ticks'() {
    const p = page('patient');
    // a sensor row as patient.js draws it: the row and its switch both flip it
    parseInto(p.doc, p.$('sensors'), '<ul class="group"><li class="li sensor"><span class="lic"></span><div class="stext"><p class="lt">Phone camera</p></div><button type="button" role="switch" class="switch" aria-checked="true"><span class="thumb"></span></button></li></ul>');
    const { kinds, count } = sweep(p);
    assert.ok(count > 15, `only ${count} controls were found`);
    for (const k of ['a.', 'button.li', 'button[role=radio].', 'li.li', 'button[role=switch].switch', 'button.qe-btn', 'a.qe-btn', 'button.ib', 'a.ib'])
      assert.ok(kinds.has(k), `${k} was tapped (${[...kinds].join(', ')})`);
    assert.deepStrictEqual(p.felt(() => p.fire(p.doc.querySelector('#nav [data-tab="share"] .nl'), 'click')), ['tick'], 'a tab, tapped on its label');
  },

  'switches tick both ways, and a picker ticks once it has changed'() {
    const p = page('index'), sw = p.$('soundSw');
    sw.checked = true;
    assert.deepStrictEqual(p.felt(() => { p.fire(sw.closest('label'), 'click'); p.fire(sw, 'click'); p.fire(sw, 'change'); }), ['tick'], 'on: the row, the box and the change are one tick');
    sw.checked = false;
    assert.deepStrictEqual(p.felt(() => { p.fire(sw.closest('label'), 'click'); p.fire(sw, 'click'); p.fire(sw, 'change'); }), ['tick'], 'off: one tick too');
    const seg = p.$('beatSeg').querySelectorAll('button');
    assert.deepStrictEqual(seg.map(b => p.felt(() => p.fire(b, 'click'))), [['tick'], ['tick'], ['tick'], ['tick']], 'each Heartbeat touch level');
    // a select and a time field (the Mornings page and the onboarding sheet use them)
    parseInto(p.doc, p.$('settingsBody'), '<select id="pick"><option>a</option></select><label class="li state"><input type="time" id="when"></label>');
    assert.deepStrictEqual(p.felt(() => p.fire(p.$('when'), 'click')), [], 'opening the time picker is not felt');
    assert.deepStrictEqual(p.felt(() => p.fire(p.$('when'), 'change')), ['tick'], 'a time picked');
    assert.deepStrictEqual(p.felt(() => p.fire(p.$('pick'), 'change')), ['tick'], 'a select changed');
  },

  'one per tap: a control that plays its own is left to it, and a click stopped on its way is still felt'() {
    const p = page('index'), [a, b, c] = p.doc.querySelectorAll('#moodEnd .mood-lantern');
    a.onclick = () => p.H.play('tick');
    assert.deepStrictEqual(p.felt(() => p.fire(a, 'click')), ['tick'], 'the end mood ticks itself (engine.js), once');
    b.onclick = () => p.H.play('success');
    assert.deepStrictEqual(p.felt(() => p.fire(b, 'click')), ['success'], 'a confirmation played by the handler is the only one');
    c.onclick = e => e.stopPropagation();
    assert.deepStrictEqual(p.felt(() => p.fire(c, 'click')), ['tick'], 'stopped in its handler (ba.js), still felt');
    // the kindle's hold is its own, and so is a click the code sends itself (a swipe that closes through the scrim)
    assert.deepStrictEqual(p.felt(() => p.fire(p.$('begin'), 'click')), []);
    assert.deepStrictEqual(p.felt(() => p.doc.querySelector('#info .scrim').click()), [], 'el.click() from code is not a tap');
    // the click a drag ends with, swallowed by swipe.js, is not felt either
    p.$('info').classList.remove('hidden');
    const handle = p.doc.querySelector('#info .handle'), at = y => ({ touches: [{ identifier: 1, clientX: 200, clientY: y }], changedTouches: [{ identifier: 1, clientX: 200, clientY: y }] });
    const swallowed = p.felt(() => {
      p.fire(handle, 'touchstart', at(300));
      for (let y = 310; y <= 360; y += 10) { p.tick(60); p.fire(handle, 'touchmove', at(y)); }
      p.tick(300); p.fire(handle, 'touchmove', at(360)); p.fire(handle, 'touchend', at(360));
      p.tick(50); p.fire(p.doc.querySelector('#info [data-close="info"].btn'), 'click');
    });
    assert.deepStrictEqual(swallowed, [], 'a short slow pull springs back, and the click it ends with is swallowed');
    assert.ok(!p.$('info').classList.contains('hidden'), 'still open');
  },

  'the check-in: an answer ticks once (its own tick), a repeat tap on it ticks once, Start and the cross touch'() {
    const p = page('index');
    p.A.Checkin.open(); p.settle();
    const start = p.doc.querySelectorAll('.ci-btn').find(b => b.textContent === 'Start');
    assert.deepStrictEqual(p.felt(() => p.fire(start, 'click')), ['touch'], 'Start');
    const opt = () => p.doc.querySelectorAll('.ci-opt')[1];
    let o = opt();
    // answered, then tapped again before it moves on: the second tap is the feel's own tick, still one each
    assert.deepStrictEqual(p.felt(() => { p.fire(o, 'click'); }), ['tick'], 'an answer');
    o = opt();
    const twice = (() => { p.settle(); p.tick(2000); p.settle(); const from = p.heard.length; p.fire(o, 'click'); p.settle(); p.tick(100); p.fire(o, 'click'); p.settle(); return p.heard.slice(from); })();
    assert.deepStrictEqual(twice, ['tick', 'tick'], 'two taps, two ticks, never two for one');
    p.tick(2000); p.settle();
    const stop = p.doc.querySelector('.ci-stop');
    const got = p.felt(() => p.fire(stop, 'click'));
    assert.deepStrictEqual(got, ['success'], 'the cross stops and keeps the answers: "Saved." is the one felt');
  },

  'swipe: a pull ticks once as it passes the distance that closes, a soft touch when it closes, nothing when it springs back'() {
    const p = page('index'), info = p.$('info'), handle = p.doc.querySelector('#info .handle');
    const touch = (el, type, x, y) => p.fire(el, type, { touches: type === 'touchend' ? [] : [{ identifier: 1, clientX: x, clientY: y }], changedTouches: [{ identifier: 1, clientX: x, clientY: y }] });
    const pull = (el, path, x0 = 200, y0 = 300, axis = 'y') => p.felt(() => {
      touch(el, 'touchstart', x0, y0);
      let last = [x0, y0];
      for (const d of path) { p.tick(20); last = axis === 'y' ? [x0, y0 + d] : [x0 + d, y0]; touch(el, 'touchmove', ...last); p.settle(); }
      p.tick(400);   // held still before letting go: the distance decides, not a flick
      touch(el, 'touchmove', ...last);
      touch(el, 'touchend', ...last);
    });
    info.classList.remove('hidden');
    // the sheet is 560 px: it closes past 140 px
    assert.deepStrictEqual(pull(handle, [10, 40, 80, 120, 150, 180, 220]), ['tick', 'touch'], 'past the line: one tick, then a touch as it closes');
    info.classList.remove('hidden');
    assert.deepStrictEqual(pull(handle, [10, 60, 145, 125, 150, 128, 160]), ['tick', 'touch'], 'a finger resting on the line ticks once');
    info.classList.remove('hidden');
    assert.deepStrictEqual(pull(handle, [10, 60, 145, 60, 30]), ['tick'], 'pulled past and back: the tick, no close, no touch on the spring back');
    assert.deepStrictEqual(pull(handle, [10, 40, 80, 100]), [], 'a short pull springs back: nothing');
    // a Settings page from its left edge: a 402 px page goes back past 120.6 px
    const settings = p.$('settings');
    settings.classList.remove('hidden');
    assert.deepStrictEqual(pull(p.$('settingsTitle'), [10, 40, 80, 110, 125, 160, 200], 5, 300, 'x'), ['tick', 'touch'], 'the edge swipe back');
  },

  'nothing on scroll: a scrolled sheet, a vertical drag on a page, wheel and scroll events'() {
    const p = page('index'), body = p.$('signalsBody');
    p.$('signals').classList.remove('hidden');
    p.$('settings').classList.remove('hidden');
    body.scrollTop = 80;
    const touch = (el, type, x, y) => p.fire(el, type, { touches: type === 'touchend' ? [] : [{ identifier: 1, clientX: x, clientY: y }], changedTouches: [{ identifier: 1, clientX: x, clientY: y }] });
    const got = p.felt(() => {
      for (const [el, x] of [[body, 200], [p.$('settingsBody'), 200], [p.$('settingsBody'), 5]]) {
        touch(el, 'touchstart', x, 400);
        for (let i = 1; i <= 12; i++) { p.tick(16); touch(el, 'touchmove', x, 400 - i * 30); p.fire(el, 'scroll'); p.fire(el, 'wheel'); p.fire(el, 'pointermove'); }
        touch(el, 'touchend', x, 40);
      }
    });
    assert.deepStrictEqual(got, []);
    assert.deepStrictEqual(p.own.played, [], 'and nothing reached the plugin');
  },

  'typing is not felt; Return is, once: as the tap on the button that sends the form, or as a touch'() {
    const p = page('index'), addr = p.$('hubAddr'), connect = p.doc.querySelector('#hubForm button[type="submit"]');
    assert.deepStrictEqual(p.felt(() => { for (const key of 'abc./:') p.fire(addr, 'keydown', { key }); p.fire(addr, 'input'); }), [], 'keys');
    assert.deepStrictEqual(p.felt(() => { p.fire(addr, 'keydown', { key: 'Enter' }); p.fire(connect, 'click'); }), ['touch'], 'Return sends the hub form: the tap on Connect');
    parseInto(p.doc, p.$('settingsBody'), '<label class="li state step-row"><input type="text" id="step" enterkeyhint="done"></label>');
    assert.deepStrictEqual(p.felt(() => p.fire(p.$('step'), 'keydown', { key: 'Enter' })), ['touch'], 'Return closes the keyboard on a field of its own');
    assert.deepStrictEqual(p.felt(() => p.fire(p.$('step'), 'keydown', { key: 'Enter', isComposing: true })), [], 'not while composing');
    assert.deepStrictEqual(p.felt(() => p.fire(p.$('step'), 'change')), [], 'a typed field saving on change is not felt');
  },

  'the Vibration switch silences all of it, and turned back on it ticks'() {
    const p = page('index'), sw = p.$('hapticSw');
    // main.js's own handler for the switch, as it is
    const line = read('js/main.js').match(/\n  \$\('hapticSw'\)\.onchange = [^\n]+/)[0];
    vm.runInContext(`(() => { const $ = id => document.getElementById(id); ${line} })()`, p.ctx);
    sw.checked = false;
    assert.deepStrictEqual(p.felt(() => p.fire(sw, 'change')), [], 'turned off: silent at once');
    p.A.Checkin.open(); p.settle();
    const before = p.own.played.length;
    for (const el of p.doc.querySelectorAll(INTERACTIVE)) p.felt(() => { p.fire(el, 'click'); p.fire(el, 'change'); });
    const handle = p.doc.querySelector('#info .handle');
    p.$('info').classList.remove('hidden');
    p.felt(() => {
      p.fire(handle, 'touchstart', { touches: [{ identifier: 1, clientX: 200, clientY: 300 }], changedTouches: [{ identifier: 1, clientX: 200, clientY: 300 }] });
      for (let i = 1; i <= 10; i++) { p.tick(20); p.fire(handle, 'touchmove', { touches: [{ identifier: 1, clientX: 200, clientY: 300 + i * 25 }], changedTouches: [{ identifier: 1, clientX: 200, clientY: 300 + i * 25 }] }); }
      p.fire(handle, 'touchend', { changedTouches: [{ identifier: 1, clientX: 200, clientY: 550 }] });
    });
    assert.strictEqual(p.$('info').classList.contains('hidden'), true, 'the swipe still closed the sheet');
    assert.deepStrictEqual(p.heard.filter(w => w !== 'heart'), [], 'no control, swipe or confirmation is felt');
    assert.strictEqual(p.own.played.length, before, 'and nothing reached the plugin');
    sw.checked = true;
    assert.deepStrictEqual(p.felt(() => p.fire(sw, 'change')), ['tick'], 'turned on: it ticks like every switch');
    assert.deepStrictEqual(p.own.played.slice(-1), ['tick']);
  },
};

let failed = 0;
for (const [n, fn] of Object.entries(tests)) {
  try { fn(); console.log('ok  ', n); } catch (e) { failed++; console.log("FAIL", n, "\n     ", process.env.STACK ? e.stack : e.message); }
}
process.exit(failed ? 1 : 0);
