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
  focus() {},
});
Object.defineProperties(El.prototype, {
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
  const { ctx } = h, doc = makeDocument(), timers = [];
  let clock = 0;
  doc.body.replaceChildren(parse(doc, phoneHtml));
  if (!motion) doc.documentElement.dataset.motion = 'reduced';
  doc.activeElement = null;
  Object.assign(ctx, {
    document: doc, clearInterval: () => {}, clearTimeout: () => {}, Event: class { constructor(type) { this.type = type; } },
    setTimeout: f => { timers.push(f); return timers.length; }, requestAnimationFrame: () => 0, performance: { now: () => clock },
  });
  doc.querySelectorAll('[data-close]').forEach(b => { b.onclick = () => doc.getElementById(b.dataset.close).classList.add('hidden'); });
  for (const f of ['clipcheck.js', 'checkin.js', 'gui/swipe.js']) vm.runInContext(fs.readFileSync(path.join(JS, f), 'utf8'), ctx, { filename: f });
  ctx.A.Checkin.init({});
  const $ = id => doc.getElementById(id);
  const runTimers = () => { for (const f of timers.splice(0)) f(); };
  return { ...h, doc, $, runTimers, tick: ms => { clock += ms; }, A: ctx.A, ctx };
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
  for (let i = 1; i <= steps; i++) { p.tick(ms / steps); taken = fire(target, 'touchmove', x + dx * i / steps, y + dy * i / steps).defaultPrevented || taken; }
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
    for (let i = 1; i <= 10; i++) { p.tick(20); fire(row, 'touchmove', 200, 400 + 25 * i); }
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

  'the code sheet (Show to my doctor) closes on a swipe down from its handle'() {
    const doc = makeDocument(), ctx = {
      console: { error() {}, log() {}, warn() {} }, Math, Date, JSON, Object, Array, Number, String, Promise, Error, Map, Set, URLSearchParams,
      document: doc, matchMedia: () => ({ matches: true }), localStorage: { getItem: () => null, setItem() {} },
      requestAnimationFrame: () => 0, setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {}, performance: { now: () => 0 },
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
    assert.ok(!root.parentNode, 'closed and gone');
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
