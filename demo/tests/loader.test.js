// Run: node demo/tests/loader.test.js
// The loading screen (#loader in index.html, demo/js/loader.js): it leaves on the first world frame drawn once the art
// and the fonts are in, with no minimum time on screen; it never holds the app longer than its cap; reduced motion gives
// a still glow and plain fades; and it starts on the same navy as the native launch screen.
// loader.js runs on the fake DOM (fakedom.js) with a manual clock and manual timers.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { JS } = require('./harness');
const { makeDocument } = require('./fakedom');

const ROOT = path.join(JS, '..', '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const html = read('demo/index.html');
const style = html.match(/<style>([\s\S]*?)<\/style>/)[1];

const boot = ({ search = '', at = 0 } = {}) => {
  const doc = makeDocument(), timers = [], marks = [];
  const loader = doc.createElement('div');
  loader.id = 'loader';
  doc.getElementById('phone').prepend(loader);
  let clock = at;
  const ctx = {
    console, URLSearchParams, document: doc, location: { search },
    performance: { now: () => clock, mark: n => marks.push([n, clock]) },
    setTimeout: (f, ms = 0) => { timers.push({ at: clock + ms, f }); return timers.length; },
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(JS, 'util.js'), 'utf8'), ctx);
  vm.runInContext(fs.readFileSync(path.join(JS, 'loader.js'), 'utf8'), ctx, { filename: 'loader.js' });
  const advance = ms => {
    const until = clock + ms;
    for (;;) {
      const due = timers.filter(t => t.at <= until && !t.done).sort((a, b) => a.at - b.at)[0];
      if (!due) break;
      clock = due.at; due.done = true; due.f();
    }
    clock = until;
  };
  const settle = () => new Promise(r => setImmediate(r));
  const deferred = () => { let resolve, reject; const p = new Promise((a, b) => { resolve = a; reject = b; }); return { p, resolve, reject }; };
  const shown = () => !!doc.getElementById('loader');
  return { A: ctx.A, L: ctx.A.Loader, doc, loader, timers, marks, advance, settle, deferred, shown, now: () => clock };
};

const tests = [];
const test = (name, f) => tests.push([name, f]);

test('it stays while the art loads and leaves on the first world frame drawn after it', async () => {
  const { L, loader, advance, settle, deferred, shown, marks } = boot();
  const art = deferred();
  L.when(art.p, Promise.resolve());
  for (let i = 0; i < 30; i++) { advance(16); L.frame(); }
  await settle();
  assert.strictEqual(L.state, 'loading');
  assert.ok(!loader.classList.contains('out'));
  art.resolve();
  await settle();
  // everything is in, but nothing of it is on screen yet: the loading screen waits for the frame that draws it
  assert.strictEqual(L.state, 'loading');
  assert.ok(shown());
  advance(16);
  L.frame();
  assert.strictEqual(L.state, 'leaving');
  assert.strictEqual(L.why, 'ready');
  assert.ok(loader.classList.contains('out'), 'the crossfade starts on that frame');
  assert.deepStrictEqual(marks.map(m => m[0]), ['af-loader-out']);
  loader.dispatchEvent({ type: 'transitionend', target: loader });
  assert.strictEqual(L.state, 'gone');
  assert.ok(!shown(), 'removed once faded');
  assert.deepStrictEqual(marks.map(m => m[0]), ['af-loader-out', 'af-loader-gone']);
});

test('no minimum hold: ready after 100 ms means it starts to leave on the frame at 100 ms', async () => {
  const { L, loader, advance, settle, shown, timers, now } = boot({ at: 60 });
  L.when(Promise.resolve(['far_mountains']), Promise.resolve());
  await settle();
  // the only timer before it leaves is the cap, which can only end it early, never hold it
  assert.deepStrictEqual(timers.map(t => t.at), [8000]);
  advance(40);
  L.frame();
  assert.strictEqual(now(), 100);
  assert.strictEqual(L.state, 'leaving');
  assert.ok(loader.classList.contains('out'));
  // gone after the 520 ms crossfade even if no transitionend arrives (a hidden tab, an interrupted transition)
  advance(719);
  assert.ok(shown());
  advance(1);
  assert.ok(!shown());
  assert.strictEqual(L.state, 'gone');
});

test('the crossfade is about half a second, and only the loading screen fades', () => {
  const rule = style.match(/#loader \{([^}]*)\}/)[1];
  const t = rule.match(/transition:\s*opacity (\d+)ms/);
  assert.ok(t, 'the loading screen fades by opacity');
  assert.ok(+t[1] >= 400 && +t[1] <= 600, `fade ${t[1]} ms`);
  assert.match(style, /#loader\.out \{ opacity: 0; pointer-events: none; \}/, 'touches reach the app as soon as it starts to fade');
  assert.strictEqual(read('demo/js/loader.js').match(/FADE_MS = (\d+)/)[1], t[1], 'loader.js removes it after the same fade');
});

test('art that fails to load still lets it go, into the procedural world', async () => {
  const { L, settle } = boot();
  L.when(Promise.reject(new Error('manifest')), Promise.resolve());
  await settle();
  L.frame();
  assert.strictEqual(L.state, 'leaving');
});

test('it never holds the app: it goes after 8 s even if the art never arrives', async () => {
  const { L, advance, settle, deferred, shown } = boot();
  L.when(deferred().p);
  await settle();
  advance(7999);
  L.frame();
  assert.strictEqual(L.state, 'loading');
  advance(1);
  assert.strictEqual(L.state, 'leaving');
  assert.strictEqual(L.why, 'cap');
  advance(720);
  assert.ok(!shown());
});

test('the cap counts from the start of the page, not from when loader.js ran', () => {
  const { timers } = boot({ at: 3000 });
  assert.deepStrictEqual(timers.map(t => t.at), [8000]);
});

test('before main.js asks it to wait, a frame does not end it', async () => {
  const { L, settle } = boot();
  await settle();
  L.frame();
  assert.strictEqual(L.state, 'loading');
});

test('?loader=0 starts without it, ?loader=30 waits up to 30 s', () => {
  const off = boot({ search: '?loader=0' });
  assert.ok(!off.shown());
  assert.strictEqual(off.L.state, 'gone');
  const long = boot({ search: '?loader=30' });
  assert.deepStrictEqual(long.timers.map(t => t.at), [30000]);
});

test('main.js waits for the art and the fonts, and reports every world frame after the WebGL pass', () => {
  const main = read('demo/js/main.js');
  assert.match(main, /A\.Loader\?\.when\(A\.Art\.load\(\), document\.fonts\?\.ready\);\n  loop\(\);/);
  const loop = main.slice(main.indexOf('const loop = () => {'), main.indexOf('requestAnimationFrame(loop);\n  };'));
  const present = loop.indexOf('A.FXGL?.present('), frame = loop.indexOf('A.Loader?.frame();');
  assert.ok(present > 0 && frame > present, 'frame() comes after the world is drawn and presented');
  const at = f => html.indexOf(`<script src="js/${f}"></script>`);
  assert.ok(at('util.js') > 0 && at('loader.js') > at('util.js') && at('loader.js') < at('main.js'), 'loader.js runs after util.js made A, before main.js');
});

// The head script of index.html that decides, before the first paint, whether the loading screen may move.
const headScript = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const still = ({ system, saved }) => {
  const classes = new Set();
  const ctx = {
    document: { documentElement: { classList: { add: c => classes.add(c) } } },
    matchMedia: q => ({ matches: q === '(prefers-reduced-motion: reduce)' && system }),
    localStorage: { getItem: k => (k === 'afferent.settings' && saved !== undefined ? JSON.stringify(saved) : null) },
  };
  ctx.window = ctx;
  vm.runInNewContext(headScript, ctx);
  return classes.has('af-still');
};

test('reduced motion follows the app setting, else the system, the same rule as main.js', () => {
  assert.strictEqual(still({ system: false }), false);
  assert.strictEqual(still({ system: true }), true);
  assert.strictEqual(still({ system: false, saved: { reducedMotion: true } }), true);
  assert.strictEqual(still({ system: true, saved: { reducedMotion: false } }), false);
  assert.strictEqual(still({ system: true, saved: { sound: true } }), true);
  assert.match(read('demo/js/main.js'), /reducedMotion: saved\.reducedMotion \?\? prefersCalm/);
  assert.ok(html.indexOf(headScript) < html.indexOf('<body>'), 'decided in the head, before anything is painted');
});

test('reduced motion: nothing breathes, twinkles or drifts, and the exit is a plain fade', () => {
  const moving = [...style.matchAll(/([^{}]+)\{[^}]*animation(?:-name)?:\s*(ld(?:Breath|Ember|Twinkle|Drift))/g)]
    .flatMap(m => m[1].split(',').map(s => s.trim().match(/\.ld-[\w-]+/)[0]));
  assert.deepStrictEqual([...new Set(moving)].sort(), ['.ld-aurora', '.ld-core', '.ld-glow', '.ld-stars']);
  const stillRule = style.match(/([^{}]*\.af-still[^{}]*)\{\s*animation: none;\s*\}/);
  assert.ok(stillRule, 'an .af-still rule stops the animations');
  for (const c of new Set(moving)) assert.ok(stillRule[1].includes(`.af-still #loader ${c}`), `${c} stops under reduced motion`);
  // the only motion left is opacity: the fade-in (ldIn) and the fade-out; the ember does not grow as it leaves
  assert.match(style, /@keyframes ldIn \{ from \{ opacity: 0; \} \}/);
  assert.match(style, /\.af-still #loader\.out \.ld-fire \{ transform: none; \}/);
});

test('it starts on the launch navy: the same colour as the launch screen, the window and the web view', () => {
  const navy = '#0D182A';
  assert.match(style, /#loader \{[^}]*background: var\(--af-kaamos-surface, #0D182A\)/);
  assert.match(read('design/tokens.css'), /--af-kaamos-surface: #0D182A;/);
  assert.match(html, /<style>html, body \{ background: #0D182A; \}/);
  const cap = JSON.parse(read('capacitor.config.json'));
  assert.strictEqual(cap.backgroundColor, navy);
  assert.strictEqual(cap.ios.backgroundColor, navy);
  const [r, g, b] = read('ios/App/App/Base.lproj/LaunchScreen.storyboard').match(/<color key="backgroundColor" red="([\d.]+)" green="([\d.]+)" blue="([\d.]+)"/).slice(1).map(Number);
  assert.strictEqual('#' + [r, g, b].map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join('').toUpperCase(), navy);
});

test('it sits over the whole phone, above the check-in, and its ember is where the fire is', () => {
  const body = html.slice(html.indexOf('<section id="phone">'));
  assert.match(body, /^<section id="phone">\s*<div id="loader" aria-hidden="true">/, 'the first thing in #phone, painted before the scripts');
  const z = +style.match(/#loader \{[^}]*z-index: (\d+)/)[1], ci = +read('demo/css/checkin.css').match(/inset: 0; z-index: (\d+)/)[1];
  assert.ok(z > ci, `z-index ${z} over the check-in's ${ci}`);
  // the kindle's centre: the dock's bottom padding (safe area + 25 px), "Not today" (56), 10, the label (16), 16, half the kindle (42)
  assert.match(style, /\.ld-fire \{[^}]*bottom: calc\(env\(safe-area-inset-bottom, 0px\) \+ 165px\)/);
  assert.match(read('demo/css/gui/shell.css'), /\.dock \{[^}]*calc\(var\(--safe-bottom\) \+ 25px\)/);
});

(async () => {
  let failed = 0;
  for (const [name, f] of tests) {
    try { await f(); console.log('ok   ' + name); }
    catch (e) { failed++; console.log('FAIL ' + name + '\n     ' + (e.stack || e.message).split('\n').slice(0, 4).join('\n     ')); }
  }
  console.log(`\n${tests.length - failed}/${tests.length} passed`);
  process.exit(failed ? 1 : 0);
})();
