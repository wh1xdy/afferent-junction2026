const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { load } = require('./harness');

const DEMO = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(DEMO, f), 'utf8');

const node = () => {
  const ls = {}, cls = new Set(), vars = {};
  const n = {
    connected: true, vars,
    classList: { add: c => cls.add(c), remove: c => cls.delete(c), contains: c => cls.has(c) },
    style: { setProperty: (k, v) => { vars[k] = v; } },
    addEventListener: (t, f) => { (ls[t] ||= []).push(f); },
    removeEventListener: (t, f) => { ls[t] = (ls[t] || []).filter(g => g !== f); },
    listeners: t => (ls[t] || []).length,
    remove: () => { n.connected = false; },
    fire: (t, props = {}) => {
      const e = { type: t, defaultPrevented: false, stopped: false, preventDefault() { this.defaultPrevented = true; }, stopPropagation() { this.stopped = true; }, ...props };
      (ls[t] || []).slice().forEach(f => f(e));
      return e;
    },
  };
  return n;
};

const launch = ({ reduced = false, motion = '' } = {}) => {
  const { A } = load();
  let now = 0, id = 0, pending = [];
  const clock = {
    setTimeout: (f, ms) => { pending.push({ id: ++id, at: now + ms, f }); return id; },
    clearTimeout: i => { pending = pending.filter(t => t.id !== i); },
    advance: ms => {
      const end = now + ms;
      for (;;) {
        const next = pending.filter(t => t.at <= end).sort((a, b) => a.at - b.at)[0];
        if (!next) break;
        pending = pending.filter(t => t !== next);
        now = next.at;
        next.f();
      }
      now = end;
    },
  };
  const splash = node(), start = node(), begin = node(), doc = node();
  doc.documentElement = { dataset: { motion } };
  doc.getElementById = i => ({ splash, start, begin }[i] || null);
  const ctx = { document: doc, setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout, matchMedia: q => ({ matches: reduced && /prefers-reduced-motion/.test(q) }) };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(read('js/splash.js'), ctx, { filename: 'splash.js' });

  const started = [], games = [];
  const startSession = A.startSession;
  A.startSession = (...a) => { started.push(a); return startSession(...a); };
  A.bus.on('game', g => games.push(g.id));
  begin.addEventListener('click', () => A.startSession({ clock: 'morning', input: 'touch', stage: false, profile: 'live' }));
  const tap = () => (splash.connected ? splash : begin).fire('click');
  const key = k => doc.fire('keydown', { key: k });
  return { A, clock, splash, start, begin, doc, tap, key, started, games };
};

const tests = [];
const test = (name, f) => tests.push([name, f]);

test('the splash is up at launch, waiting for a tap or the timer', () => {
  const { A, splash, doc, started } = launch();
  assert.strictEqual(splash.connected, true);
  assert.strictEqual(splash.classList.contains('out'), false);
  assert.strictEqual(splash.listeners('click'), 1);
  assert.strictEqual(doc.listeners('keydown'), 1);
  assert.strictEqual(A.session, undefined);
  assert.deepStrictEqual(started, []);
});

test('it holds for 2.5 s after the fade-in, then fades out and is gone', () => {
  const { clock, splash, doc } = launch();
  clock.advance(3199);
  assert.strictEqual(splash.classList.contains('out'), false);
  clock.advance(1);
  assert.strictEqual(splash.classList.contains('out'), true);
  assert.strictEqual(splash.vars['--splash-out'], '600ms');
  assert.strictEqual(splash.connected, true);
  clock.advance(599);
  assert.strictEqual(splash.connected, true);
  clock.advance(1);
  assert.strictEqual(splash.connected, false);
  assert.strictEqual(doc.listeners('keydown'), 0);
});

test('afterwards the game is on the start screen and nothing has been started', () => {
  const { A, clock, start, begin, started, games } = launch();
  clock.advance(60000);
  assert.deepStrictEqual(started, []);
  assert.deepStrictEqual(games, []);
  assert.strictEqual(A.session, undefined);
  assert.strictEqual(start.classList.contains('off'), false);
  assert.strictEqual(start.classList.contains('hidden'), false);
  assert.strictEqual(begin.listeners('click'), 1);
});

test('a tap skips the splash and does not reach the start screen', () => {
  const { clock, splash, tap, started, games } = launch();
  clock.advance(1000);
  const e = tap();
  assert.strictEqual(e.defaultPrevented, true);
  assert.strictEqual(e.stopped, true);
  assert.strictEqual(splash.classList.contains('out'), true);
  assert.strictEqual(splash.vars['--splash-out'], '250ms');
  assert.strictEqual(splash.connected, true);
  clock.advance(250);
  assert.strictEqual(splash.connected, false);
  clock.advance(60000);
  assert.deepStrictEqual(started, []);
  assert.deepStrictEqual(games, []);
});

test('taps during the fade-out are swallowed and do not extend it', () => {
  const { clock, splash, tap, started } = launch();
  tap();
  clock.advance(100);
  const e = tap();
  assert.strictEqual(e.defaultPrevented, true);
  assert.strictEqual(splash.connected, true);
  clock.advance(150);
  assert.strictEqual(splash.connected, false);
  assert.deepStrictEqual(started, []);
});

test('only enter, space and escape skip it from the keyboard', () => {
  for (const k of ['Enter', ' ', 'Escape']) {
    const { clock, splash, key, started } = launch();
    key('a');
    key('Tab');
    assert.strictEqual(splash.classList.contains('out'), false);
    const e = key(k);
    assert.strictEqual(e.defaultPrevented, true);
    assert.strictEqual(splash.classList.contains('out'), true);
    clock.advance(250);
    assert.strictEqual(splash.connected, false);
    assert.deepStrictEqual(started, []);
  }
});

test('with reduced motion there is no fade: shown for 2.5 s, then switched', () => {
  for (const opts of [{ reduced: true }, { motion: 'reduced' }]) {
    const { clock, splash } = launch(opts);
    clock.advance(2499);
    assert.strictEqual(splash.connected, true);
    clock.advance(1);
    assert.strictEqual(splash.connected, false);
    assert.strictEqual(splash.classList.contains('out'), false);
  }
});

test('with reduced motion a tap switches at once and still does not start anything', () => {
  const { clock, splash, tap, started } = launch({ reduced: true });
  clock.advance(500);
  tap();
  assert.strictEqual(splash.connected, false);
  assert.strictEqual(splash.classList.contains('out'), false);
  clock.advance(60000);
  assert.deepStrictEqual(started, []);
});

test('the splash script never touches the session or the audio', () => {
  const src = read('js/splash.js');
  assert.ok(!/\bA\b|Audio|Session|kindle|begin|music|Music/.test(src));
});

test('index.html shows the splash before the app, with the icon inline and the script after main.js', () => {
  const html = read('index.html');
  assert.ok(html.includes('<link rel="stylesheet" href="css/splash.css">'));
  const at = s => { const i = html.indexOf(s); assert.ok(i >= 0, s); return i; };
  assert.ok(at('id="splash"') < at('<main id="app">'));
  assert.ok(html.slice(at('id="splash"'), at('<main id="app">')).includes('<svg class="splash-icon"'));
  assert.ok(html.includes('Best experienced with headphones'));
  assert.ok(at('js/main.js') < at('js/splash.js'));
});

test('the stylesheet respects reduced motion and the safe areas', () => {
  const css = read('css/splash.css');
  assert.ok(css.includes('prefers-reduced-motion: reduce'));
  assert.ok(css.includes('[data-motion="reduced"]'));
  for (const side of ['top', 'right', 'bottom', 'left']) assert.ok(css.includes(`env(safe-area-inset-${side})`), side);
});

let failed = 0;
for (const [name, f] of tests) {
  try { f(); console.log('ok  ', name); } catch (e) { failed++; console.log('FAIL', name, '\n     ', e.message); }
}
process.exit(failed ? 1 : 0);
