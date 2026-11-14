// Run: node demo/tests/swipe.test.js
// Swipe gestures (demo/js/gui/swipe.js): the thresholds, scrolling before dragging, and that every sheet with a handle
// closes on a swipe down, on the real markup of index.html with the real clip check, check-in and code sheet on top.
// Touches here are test input on a fake DOM; the clock is a manual one.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
const { load, JS } = require('./harness');
const { makeDocument, El } = require('./fakedom');

const DEMO = path.join(JS, '..');
const read = f => fs.readFileSync(path.join(DEMO, f), 'utf8');

// What the fake DOM needs on top for gestures: sizes, focus, parentElement, listeners that come off again.
Object.assign(El.prototype, {
  getBoundingClientRect() { return { left: 0, top: 0, width: 402, height: 874 }; },
  removeEventListener(t, f) { this.listeners[t] = (this.listeners[t] || []).filter(x => x !== f); },
  focus() { if (this.ownerDocument) this.ownerDocument.activeElement = this; },
  contains(n) { for (; n; n = n.parentNode) if (n === this) return true; return false; },
});
Object.defineProperties(El.prototype, {
  isConnected: { get() { let n = this; while (n.parentNode) n = n.parentNode; return n === this.ownerDocument?.documentElement; }, configurable: true },
  offsetHeight: { get() { return this.h ?? 560; }, configurable: true },
  offsetWidth: { get() { return 402; }, configurable: true },
  parentElement: { get() { return this.parentNode?.nodeType === 1 ? this.parentNode : null; }, configurable: true },
});

// index.html's phone markup into the fake DOM: tags, attributes and text, no scripts.
const parse = (doc, src) => {
  const root = doc.createElement('div'), stack = [root], VOID = new Set(['INPUT', 'BR', 'IMG', 'HR']);
  for (const m of src.matchAll(/<!--[\s\S]*?-->|<\/([\w-]+)\s*>|<([\w-]+)((?:\s+[\w:-]+(?:="[^"]*")?)*)\s*\/?>|([^<]+)/g)) {
    if (m[1]) { while (stack.length > 1 && stack.pop().tagName !== m[1].toUpperCase()); continue; }
    if (m[2]) {
      const e = doc.createElement(m[2]);
      for (const a of m[3].matchAll(/([\w:-]+)(?:="([^"]*)")?/g)) e.setAttribute(a[1], a[2] ?? '');
      stack[stack.length - 1].append(e);
      if (!VOID.has(e.tagName)) stack.push(e);
    } else if (m[4]?.trim()) stack[stack.length - 1].append(m[4].trim());
  }
  return root.children[0];
};
const html = read('index.html');
const phoneHtml = html.slice(html.indexOf('<section id="phone">'), html.indexOf('<aside id="panel">'));

// The app as far as sheets go: index.html's #phone, main.js's [data-close] buttons, the clip check, the check-in and swipe.js.
// motion: false is reduced motion, so a sheet closes the moment the finger lifts.
const app = ({ motion = false } = {}) => {
  const storage = new Map([['afferent.checkin.test', JSON.stringify({ anchor: 1 })]]);
  const h = load({ finger: true, camera: true, storage });
  const { ctx } = h, doc = makeDocument(), timers = [], frames = [];
  let clock = 0;
  doc.body.replaceChildren(parse(doc, phoneHtml));
  if (!motion) doc.documentElement.dataset.motion = 'reduced';
  doc.activeElement = null;
  Object.assign(ctx, {
    document: doc, clearInterval: () => {}, Event: class { constructor(type) { this.type = type; } }, performance: { now: () => clock },
    setTimeout: f => { const t = { f }; timers.push(t); return t; }, clearTimeout: t => { if (t) t.f = null; },
    requestAnimationFrame: f => { frames.push(f); return frames.length; }, cancelAnimationFrame: id => { frames[id - 1] = null; },
  });
  for (const f of ['clipcheck.js', 'checkin.js', 'gui/swipe.js']) vm.runInContext(fs.readFileSync(path.join(JS, f), 'utf8'), ctx, { filename: f });
  // main.js's own show() (cut out of main.js as it is), on its [data-open] and [data-close] buttons
  const showSrc = read('js/main.js').match(/\n  const FADES = [\s\S]*?\n    set\(\);\n  \};\n/)[0];
  const show = vm.runInContext(`(() => { const $ = id => document.getElementById(id); ${showSrc} return show; })()`, ctx);
  doc.querySelectorAll('[data-open]').forEach(b => { b.onclick = () => show(b.dataset.open, true); });
  doc.querySelectorAll('[data-close]').forEach(b => { b.onclick = () => show(b.dataset.close, false); });
  ctx.A.Checkin.init({});
  const $ = id => doc.getElementById(id);
  const runTimers = () => { for (const t of timers.splice(0)) t.f?.(); };
  const runFrames = () => { for (const f of frames.splice(0)) f?.(); };
  return { ...h, doc, $, show, runTimers, runFrames, frames, tick: ms => { clock += ms; }, A: ctx.A, ctx };
};

// A touch as WebKit sends it: to the element it started on, then up through its parents (if it still has any).
const fire = (target, type, x, y) => {
  const t = { identifier: 1, clientX: x, clientY: y };
  const e = { type, target, touches: type === 'touchstart' || type === 'touchmove' ? [t] : [], changedTouches: [t], cancelable: true,
    defaultPrevented: false, stopped: false, preventDefault() { this.defaultPrevented = true; }, stopPropagation() { this.stopped = true; } };
  for (let n = target; n && !e.stopped; n = n.parentNode) for (const f of [...(n.listeners?.[type] || [])]) f(e);
  return e;
};
// A swipe from (x, y) by (dx, dy) over ms milliseconds, in 10 moves. Returns whether any move was taken from the page.
const swipe = (p, target, { x = 200, y = 300, dx = 0, dy = 0, ms = 200, steps = 10, lift = true } = {}) => {
  fire(target, 'touchstart', x, y);
  let taken = false;
  for (let i = 1; i <= steps; i++) { p.tick(ms / steps); taken = fire(target, 'touchmove', x + dx * i / steps, y + dy * i / steps).defaultPrevented || taken; p.runFrames?.(); }
  if (lift) fire(target, 'touchend', x + dx, y + dy);
  return taken;
};
const shown = (p, id) => !p.$(id).classList.contains('hidden');
const open = (p, id) => p.$(id).classList.remove('hidden');
const sheetOf = (p, id) => p.$(id).children.find(c => c.classList.contains('sheet'));
const handleOf = sheet => sheet.children.find(c => c.classList.contains('handle'));
const text = n => n.textContent;

const tests = {
  'thresholds: a sheet closes past a quarter of its height (80 to 160 px) or on a flick, and springs back otherwise'() {
    const { A } = app(), S = A.Swipe;
    assert.deepStrictEqual([S.threshold(200), S.threshold(560), S.threshold(874)], [80, 140, 160]);
    assert.deepStrictEqual([S.threshold(402, 'x'), S.threshold(200, 'x')], [120.6, 72]);
    assert.strictEqual(S.release({ d: 139, v: 0, size: 560 }), 'stay');
    assert.strictEqual(S.release({ d: 140, v: 0, size: 560 }), 'close');
    assert.strictEqual(S.release({ d: 30, v: 0.6, size: 560 }), 'close', 'a flick closes from 24 px');
    assert.strictEqual(S.release({ d: 20, v: 2, size: 560 }), 'stay', 'a twitch is not a flick');
    assert.strictEqual(S.release({ d: 300, v: -0.4, size: 560 }), 'stay', 'thrown back up after a long pull');
    assert.strictEqual(S.release({ d: 125, v: 0, size: 402, axis: 'x' }), 'close');
    assert.ok(S.rubber(300, 560) < 150 && S.rubber(300, 560) > 0 && S.rubber(-20, 560) === 0, 'a sheet that cannot close only gives');
  },

  'scroll before drag: the sheet drags only from the top of its content or from the handle; up, sideways and scrolled are the page\'s'() {
    const { A } = app(), d = A.Swipe.decide;
    assert.strictEqual(d({ dx: 0, dy: 3 }), null, 'under 4 px nothing is decided');
    assert.strictEqual(d({ dx: 1, dy: 6, top: true }), 'down');
    assert.strictEqual(d({ dx: 1, dy: 6, top: false }), 'none', 'scrolled content scrolls back up first');
    assert.strictEqual(d({ dx: 1, dy: 6, top: false, handle: true }), 'down', 'the handle always moves the sheet');
    assert.strictEqual(d({ dx: 0, dy: -6, top: true }), 'none', 'up is a scroll');
    assert.strictEqual(d({ dx: 8, dy: 3, top: true }), 'none', 'sideways is not a close');
    assert.strictEqual(d({ dx: 8, dy: 3, edge: true, back: true }), 'back');
    assert.strictEqual(d({ dx: 8, dy: 3, edge: false, back: true }), 'none', 'back only from the left edge');
    assert.strictEqual(d({ dx: 8, dy: 3, edge: true, back: false }), 'none');
  },

  'every sheet with a handle closes on a swipe down: How it works, Your signals and the clip check'() {
    const p = app();
    p.A.ClipCheck.open('settings');
    const sheets = p.doc.querySelectorAll('.sheet').filter(handleOf);
    assert.deepStrictEqual(sheets.map(s => s.parentNode.id).sort(), ['clipcheck', 'info', 'signals'], 'the sheets with a handle in the app');
    for (const s of sheets) {
      const id = s.parentNode.id;
      if (id !== 'clipcheck') open(p, id);
      assert.ok(shown(p, id), id);
      assert.ok(swipe(p, handleOf(s), { dy: 220 }), `${id}: the moves are the sheet's, not the page's`);
      assert.ok(!shown(p, id), `${id} closed`);
      assert.strictEqual(s.style.translate, '', `${id} put back for the next time`);
    }
  },

  'the sheet follows the finger, the scrim fades with it, and a short pull springs back'() {
    const p = app(), s = sheetOf(p, 'info'), scrim = p.$('info').children.find(c => c.classList.contains('scrim'));
    open(p, 'info');
    swipe(p, handleOf(s), { dy: 100, ms: 1000, lift: false });
    assert.strictEqual(s.style.translate, '0 100.0px');
    assert.ok(Number(scrim.style.opacity) < 1 && Number(scrim.style.opacity) > 0.8, scrim.style.opacity);
    fire(handleOf(s), 'touchend', 200, 400);
    assert.ok(shown(p, 'info'), '100 px of 560 springs back');
    assert.deepStrictEqual([s.style.translate, scrim.style.opacity], ['', '']);
  },

  'a flick closes from a short distance, a slow pull of the same distance does not'() {
    const p = app(), s = sheetOf(p, 'signals');
    open(p, 'signals');
    swipe(p, handleOf(s), { dy: 60, ms: 1000 });
    assert.ok(shown(p, 'signals'), 'slow');
    swipe(p, handleOf(s), { dy: 60, ms: 60 });
    assert.ok(!shown(p, 'signals'), 'flick');
  },

  'scrolled content scrolls back first; from the handle the sheet still moves'() {
    const p = app(), s = sheetOf(p, 'info'), row = s.querySelector('.how li');
    open(p, 'info');
    s.scrollTop = 120;
    assert.ok(!swipe(p, row, { y: 500, dy: 300 }), 'the moves stay with the scroll');
    assert.ok(shown(p, 'info') && !s.style.translate, 'not moved, not closed');
    assert.ok(swipe(p, handleOf(s), { dy: 300 }));
    assert.ok(!shown(p, 'info'));
    open(p, 'info');
    s.scrollTop = 0;
    swipe(p, row, { y: 500, dy: 300 });
    assert.ok(!shown(p, 'info'), 'at the top the content drags the sheet');
  },

  'a drag up or sideways leaves the sheet alone'() {
    const p = app(), s = sheetOf(p, 'info');
    open(p, 'info');
    assert.ok(!swipe(p, handleOf(s), { dy: -200 }) && shown(p, 'info'));
    assert.ok(!swipe(p, s.querySelector('.how li'), { dx: 200, dy: 20 }) && shown(p, 'info'));
  },

  'a row redrawn under the finger (Your signals redraws every second) does not lose the swipe'() {
    const p = app(), s = sheetOf(p, 'signals'), body = p.$('signalsBody'), row = p.doc.createElement('div');
    open(p, 'signals');
    body.append(row);
    fire(row, 'touchstart', 200, 400);
    body.replaceChildren(p.doc.createElement('div'));
    for (let i = 1; i <= 10; i++) { p.tick(20); fire(row, 'touchmove', 200, 400 + 25 * i); p.runFrames(); }
    fire(row, 'touchend', 200, 650);
    assert.ok(!shown(p, 'signals'));
  },

  'with motion the sheet slides out first and closes when it is gone'() {
    const p = app({ motion: true }), s = sheetOf(p, 'info');
    open(p, 'info');
    swipe(p, handleOf(s), { dy: 200 });
    assert.ok(shown(p, 'info'), 'still sliding');
    assert.strictEqual(s.style.translate, `0 ${560 + 24}px`);
    assert.ok(/^translate \d+ms/.test(s.style.transition), s.style.transition);
    p.runTimers();
    assert.ok(!shown(p, 'info'));
    assert.deepStrictEqual([s.style.translate, s.style.transition], ['', '']);
  },

  async 'the clip check before a session closes on a swipe like Not now: no session, the kindle goes out'() {
    const p = app(), C = p.A.ClipCheck;
    await p.A.Finger.arm();
    p.plugin.emit('state', { state: 'connected', name: 'Afferent Finger' });
    let unkindled = 0, went = 0;
    p.A.bus.on('unkindle', () => unkindled++);
    assert.strictEqual(C.beforeSession(() => went++), true, 'clips connected, no pulse yet: it asks');
    assert.ok(shown(p, 'clipcheck'));
    swipe(p, handleOf(sheetOf(p, 'clipcheck')), { dy: 220 });
    assert.deepStrictEqual([shown(p, 'clipcheck'), went, unkindled], [false, 0, 1]);
  },

  'the onboarding sheet has to be answered: it gives a little and springs back'() {
    const p = app(), card = p.doc.createElement('div'), s = p.doc.createElement('div'), h = p.doc.createElement('div');
    card.id = 'onboard'; card.className = 'onboard'; s.className = 'sheet onboard-sheet'; h.className = 'handle';
    s.append(h); card.append(s); p.$('phone').append(card);
    swipe(p, h, { dy: 300, lift: false });
    const moved = parseFloat(s.style.translate.split(' ')[1]);
    assert.ok(moved > 0 && moved < 150, `rubber band, ${moved} px for 300`);
    fire(h, 'touchend', 200, 600);
    assert.ok(card.parentNode && s.style.translate === '', 'still there, back in place');
  },

  'Settings, Talk and Heart Duel go back on a swipe from the left edge, not from the middle'() {
    const p = app();
    for (const id of ['settings', 'voice']) {
      open(p, id);
      const row = p.$(id).querySelector('.top-bar');
      swipe(p, row, { x: 100, dx: 200 });
      assert.ok(shown(p, id), `${id}: from the middle nothing happens`);
      swipe(p, row, { x: 6, dx: 200 });
      assert.ok(!shown(p, id), `${id}: back from the edge`);
    }
    const duel = p.doc.createElement('div'), back = p.doc.createElement('button');
    duel.id = 'duel'; duel.className = 'screen duel'; back.setAttribute('data-duel-close', '');
    back.onclick = () => duel.classList.add('hidden');
    duel.append(back); p.$('phone').append(duel);
    swipe(p, duel, { x: 6, dx: 200 });
    assert.ok(duel.classList.contains('hidden'), 'Heart Duel');
  },

  'check-in: the intro closes on the swipe it tells you about, a question stops and keeps the answers so far'() {
    const p = app(), root = () => p.$('checkin'), card = () => root().children[0];
    p.A.Checkin.open();
    assert.ok(!root().classList.contains('hidden'));
    assert.ok(/swiping down/.test(text(card())), 'the intro promises it');
    swipe(p, card(), { dy: 300 });
    assert.ok(root().classList.contains('hidden'), 'the intro closed');

    p.A.Checkin.open();
    card().querySelectorAll('.ci-btn').find(b => text(b) === 'Start').click();
    assert.ok(card().classList.contains('ci-question'));
    card().querySelectorAll('.ci-opt')[1].click();
    swipe(p, card().querySelector('.ci-item'), { dy: 300, lift: false });
    assert.strictEqual(root().style.translate, '0 300.0px', 'the card follows the finger');
    fire(card().querySelector('.ci-item'), 'touchend', 200, 600);
    assert.ok(/Saved\./.test(text(card())), 'stopped: Saved.');
    assert.strictEqual(root().style.translate, '');
    const doc = JSON.parse(p.ctx.localStorage.getItem('afferent.checkin.outbox')).pop();
    assert.deepStrictEqual([doc.status, doc.phq9.items.phq9_1], ['incomplete', 1], 'the answer given is kept');
  },

  'check-in: a swipe from the left edge goes back a question, the answer still marked'() {
    const p = app(), card = () => p.$('checkin').children[0];
    p.A.Checkin.open();
    card().querySelectorAll('.ci-btn').find(b => text(b) === 'Start').click();
    card().querySelectorAll('.ci-opt')[2].click();
    // pick() moves on after a beat; here that beat is the next timer
    p.runTimers();
    assert.ok(/depressed/.test(text(card())), 'on question 2');
    swipe(p, card().querySelector('.ci-item'), { x: 6, dx: 200 });
    assert.ok(/Little interest/.test(text(card())), 'back on question 1');
    assert.strictEqual(card().querySelectorAll('.ci-opt')[2].getAttribute('aria-checked'), 'true');
  },

  'the code sheet (Show to my doctor) closes on a swipe down from its handle, and on Cancel and the scrim after a quick fade'() {
    const doc = makeDocument(), timers = [], ctx = {
      console: { error() {}, log() {}, warn() {} }, Math, Date, JSON, Object, Array, Number, String, Promise, Error, Map, Set, URLSearchParams,
      document: doc, matchMedia: () => ({ matches: true }), localStorage: { getItem: () => null, setItem() {} },
      requestAnimationFrame: () => 0, setTimeout: f => { timers.push(f); return timers.length; }, clearTimeout() {}, setInterval: () => 0, clearInterval() {}, performance: { now: () => 0 },
      addEventListener() {}, removeEventListener() {}, innerWidth: 402, innerHeight: 874, devicePixelRatio: 2,
      fetch: async () => ({ ok: false, status: 404, json: async () => null }), location: { search: '', hash: '' },
    };
    ctx.window = ctx;
    vm.createContext(ctx);
    vm.runInContext('window.A = { QR: {} };', ctx);
    for (const f of ['gui/swipe.js', 'qrshow.js']) vm.runInContext(fs.readFileSync(path.join(JS, f), 'utf8'), ctx, { filename: f });
    ctx.A.QRShow.init({ pid: 'anna', hub: null });
    ctx.A.QRShow.open();
    const root = doc.getElementById('qrSheet'), handle = doc.querySelector('.qs-handle');
    assert.ok(root && handle, 'the sheet is up');
    swipe({ tick() {} }, handle, { dy: 260 });
    assert.ok(root.parentNode && root.classList.contains('out'), 'leaving (reduced motion here: a quick fade, qrshow.css .still.out)');
    for (const f of timers.splice(0)) f();
    assert.ok(!root.parentNode, 'closed and gone');
    const css = read('css/qrshow.css');
    assert.ok(/\.qs-root\.out \.qs \{ transform: translateY\(100%\); transition: transform 280ms cubic-bezier\(0\.2, 0, 0, 1\)/.test(css), 'with motion it slides down like a swipe');
    assert.ok(/\.qx\.still\.out \{ opacity: 0; transition: opacity 150ms linear/.test(css), 'reduced motion: a quick fade');
    for (const closer of ['#qsCancel', '.qs-scrim']) {
      const opener = doc.createElement('button');
      doc.body.append(opener); opener.focus();
      ctx.A.QRShow.open();
      const r = doc.getElementById('qrSheet');
      doc.querySelector(closer).click();
      assert.ok(r.parentNode && r.classList.contains('out'), `${closer}: leaving, not gone at once`);
      for (const f of timers.splice(0)) f();
      assert.ok(!r.parentNode && doc.activeElement === opener, `${closer}: gone, focus back on what opened it`);
    }
  },

  'the drag writes its styles at most once per frame, however many touchmoves arrive'() {
    const p = app(), s = sheetOf(p, 'info'), h = handleOf(s);
    open(p, 'info');
    let writes = 0, value = '';
    Object.defineProperty(s.style, 'translate', { get: () => value, set: v => { writes++; value = v; }, configurable: true });
    fire(h, 'touchstart', 200, 300);
    for (let i = 1; i <= 12; i++) { p.tick(4); fire(h, 'touchmove', 200, 300 + 10 * i); }
    assert.strictEqual(writes, 0, 'nothing written between frames');
    p.runFrames();
    assert.deepStrictEqual([writes, value], [1, '0 120.0px'], 'one write, at the latest position');
    for (let i = 13; i <= 15; i++) { p.tick(4); fire(h, 'touchmove', 200, 300 + 10 * i); }
    p.runFrames(); p.runFrames();
    assert.deepStrictEqual([writes, value], [2, '0 150.0px']);
    assert.strictEqual(s.style.willChange, 'transform', 'on its own layer while it moves');
    fire(h, 'touchend', 200, 450);
    assert.strictEqual(p.frames.filter(Boolean).length, 0, 'no frame left over after the finger lifts');
  },

  'every close path of a sheet goes through the slide-out: button, scrim and Escape, How it works, Your signals, the hub, the clip check, the check-in'() {
    const p = app({ motion: true }), A = p.A;
    for (const [id, closer] of [['info', '.sheet-actions [data-close]'], ['info', '.scrim'], ['signals', '.sheet-actions [data-close]'], ['signals', '.scrim'], ['hubDialog', '.actions [data-close]'], ['hubDialog', '.scrim']]) {
      open(p, id);
      p.$(id).querySelector(closer).click();
      assert.ok(shown(p, id) && A.Swipe.leaving(p.$(id)), `${id} ${closer}: still there, leaving`);
      const sheet = sheetOf(p, id);
      if (sheet) assert.ok(/^translate 280ms cubic-bezier\(0\.2, 0, 0, 1\)$/.test(sheet.style.transition) && /^0 \d+px$/.test(sheet.style.translate), `${id}: slides down`);
      else assert.ok(p.$(id).style.opacity === '0', `${id}: the dialog fades`);
      p.runTimers();
      assert.ok(!shown(p, id) && !A.Swipe.leaving(p.$(id)), `${id} ${closer}: gone`);
      assert.deepStrictEqual([sheet?.style.translate || '', p.$(id).style.opacity || ''], ['', ''], `${id}: put back for next time`);
    }
    // Escape (shell.js) clicks the layer's [data-close], the same path as the button
    assert.ok(/open\.querySelector\('\[data-close\]'\)\?\.click\(\)/.test(read('js/gui/shell.js')), 'Escape goes through [data-close]');
    assert.ok(/A\.Swipe\?\.out\?\.\(el, set\)/.test(read('js/main.js')), 'main.js show() lets a sheet leave through A.Swipe.out');

    // the clip check: Done, and the scrim
    for (const how of ['Done', 'scrim']) {
      A.ClipCheck.open('settings');
      if (how === 'Done') p.$('clipActions').children.find(b => b.textContent === 'Done').click();
      else p.$('clipcheck').children.find(c => c.classList.contains('scrim')).click();
      assert.ok(shown(p, 'clipcheck') && A.Swipe.leaving(p.$('clipcheck')), `clip check ${how}: leaving`);
      p.runTimers();
      assert.ok(!shown(p, 'clipcheck'), `clip check ${how}: gone`);
    }
    // the check-in: Later on the intro slides the card down
    A.Checkin.open();
    p.$('checkin').children[0].querySelectorAll('.ci-btn').find(b => text(b) === 'Later').click();
    assert.ok(A.Swipe.leaving(p.$('checkin')) && /^0 \d+px$/.test(p.$('checkin').style.translate), 'check-in: slides down');
    p.runTimers();
    assert.ok(p.$('checkin').classList.contains('hidden'));
  },

  'every card closes animated and hands focus back to what opened it: sheets slide down, Settings and Talk slide right, the crisis card slides down'() {
    const p = app({ motion: true }), opener = p.doc.querySelector('[data-open="info"]');
    for (const [id, closer, way] of [['info', '.sheet-actions [data-close]', 'down'], ['signals', '.scrim', 'down'], ['settings', '[data-close]', 'right'], ['voice', '[data-close]', 'right'], ['crisis', '[data-close]', 'down']]) {
      opener.focus();
      p.show(id, true);
      p.doc.body.querySelector('#' + id + ' .handle')?.focus();
      if (id === 'settings') p.$(id).querySelector('[data-close]').focus();
      p.$(id).querySelector(closer).click();
      const moving = id === 'info' || id === 'signals' ? sheetOf(p, id) : p.$(id);
      assert.ok(shown(p, id) && p.A.Swipe.leaving(p.$(id)), `${id}: leaving, not gone at once`);
      assert.ok((way === 'right' ? /^402px 0$/ : /^0 \d+px$/).test(moving.style.translate), `${id}: slides ${way}, ${moving.style.translate}`);
      assert.strictEqual(moving.style.transition, 'translate 280ms cubic-bezier(0.2, 0, 0, 1)', `${id}: like a finished swipe`);
      p.runTimers();
      assert.ok(!shown(p, id), `${id}: gone`);
      assert.strictEqual(p.doc.activeElement, opener, `${id}: focus back on what opened it`);
      assert.deepStrictEqual([moving.style.translate, moving.style.transition, moving.style.willChange], ['', '', ''], `${id}: put back for next time`);
    }
    // the clip check gives focus back too
    const row = p.doc.createElement('button');
    p.$('phone').append(row); row.focus();
    p.A.ClipCheck.open('settings');
    p.$('clipActions').children.find(b => b.textContent === 'Done').click();
    p.runTimers();
    assert.ok(!shown(p, 'clipcheck') && p.doc.activeElement === row, 'clip check: gone, focus back on the row');
  },

  'the world under a sheet waits while the sheet moves: dragged, sliding up, leaving, springing back'() {
    const p = app({ motion: true }), S = p.A.Swipe, s = sheetOf(p, 'info');
    assert.ok(!S.moving, 'nothing open');
    p.show('info', true);
    assert.ok(S.moving, 'sliding up');
    p.tick(400);
    assert.ok(!S.moving, 'up and still');
    swipe(p, handleOf(s), { dy: 60, ms: 1000, lift: false });
    assert.ok(S.moving && S.dragging, 'under the finger');
    fire(handleOf(s), 'touchend', 200, 360);
    assert.ok(S.moving && !S.dragging, 'springing back');
    p.tick(400); p.runTimers();
    assert.ok(!S.moving && shown(p, 'info'), 'back in place');
    p.$('info').querySelector('.scrim').click();
    assert.ok(S.moving, 'leaving');
    p.tick(400); p.runTimers();
    assert.ok(!S.moving && !shown(p, 'info'));
    const main = read('js/main.js');
    assert.ok(/if \(!A\.session && \(A\.Swipe\?\.moving \|\| /.test(main), 'main.js skips the world frame while a sheet moves (not in a session)');
    assert.ok(/1000 \/ 30/.test(main) && /1000 \/ 15/.test(main), 'and paces it under an open sheet or a page');
  },

  'reduced motion: a closed sheet fades quickly instead of sliding; opened again while leaving, it stays'() {
    const p = app();
    open(p, 'info');
    p.$('info').querySelector('.scrim').click();
    assert.deepStrictEqual([p.$('info').style.opacity, p.$('info').style.transition], ['0', 'opacity 150ms linear']);
    assert.strictEqual(sheetOf(p, 'info').style.translate || '', '', 'no slide');
    p.A.Swipe.stay(p.$('info'));
    p.runTimers();
    assert.ok(shown(p, 'info') && p.$('info').style.opacity === '', 'kept open');
  },

  'no other sheet has a handle: a new one needs its swipe here too'() {
    const files = ['index.html', 'patient.html', ...fs.readdirSync(JS, { recursive: true }).filter(f => f.endsWith('.js') && f !== path.join('gui', 'swipe.js')).map(f => 'js/' + f)];
    const withHandle = files.filter(f => /class="(qs-)?handle"|'handle'\)|'qs-handle'/.test(read(f))).sort();
    assert.deepStrictEqual(withHandle, ['index.html', 'js/clipcheck.js', 'js/onboard.js', 'js/qrshow.js']);
  },
};

(async () => {
  let failed = 0;
  for (const [name, fn] of Object.entries(tests)) {
    try { await fn(); console.log('ok  ', name); } catch (e) { failed++; console.log('FAIL', name, '\n     ', e.stack.split('\n').slice(0, 3).join('\n      ').slice(0, 900)); }
  }
  console.log(`${Object.keys(tests).length - failed} ok, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
