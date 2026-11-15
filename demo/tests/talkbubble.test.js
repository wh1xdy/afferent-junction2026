const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
const { load, JS } = require('./harness');
const { makeDocument, El } = require('./fakedom');

const DEMO = path.join(JS, '..');
const html = fs.readFileSync(path.join(DEMO, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(DEMO, 'css', 'talk-bubble.css'), 'utf8');
const startHtml = html.slice(html.indexOf('<div id="start"'), html.indexOf('<div id="end"'));
const tag = (src, id) => src.match(new RegExp(`<button[^>]*id="${id}"[^>]*>([\\s\\S]*?)</button>`));
const attrs = s => Object.fromEntries([...s.matchAll(/([\w-]+)="([^"]*)"/g)].map(m => [m[1], m[2]]));

const page = () => {
  const h = load({ storage: new Map() });
  const { ctx, A } = h;
  const doc = makeDocument();
  const paint = () => new Proxy({}, { get: () => () => ({ addColorStop() {} }), set: () => true });
  const byId = doc.getElementById;
  const phone = byId('phone'), start = byId('start');
  doc.getElementById = id => {
    let e = byId(id);
    if (!e) {
      e = doc.createElement(id === 'game' ? 'canvas' : 'div');
      e.id = id;
      e.getContext = paint;
      if (['voice', 'info', 'signals', 'hubDialog', 'offer', 'closeBtn', 'wakeBtn'].includes(id)) e.className = 'hidden';
      if (id === 'end') e.className = 'screen end fade off';
      phone.append(e);
    }
    return e;
  };
  const [m, label] = tag(startHtml, 'talkBubble');
  const a = attrs(m.slice(0, m.indexOf('>')));
  const bubble = doc.createElement('button');
  for (const [k, v] of Object.entries(a)) bubble.setAttribute(k, v);
  bubble.append(label.replace(/<[^>]+>/g, ''));
  start.append(bubble);
  const voice = doc.getElementById('voice');
  voice.className = 'screen voice hidden';
  const back = doc.createElement('button'); back.setAttribute('data-close', 'voice'); voice.append(back);
  const canvas = doc.getElementById('game');
  Object.assign(canvas, { clientWidth: 390, clientHeight: 844 });
  phone.getBoundingClientRect = () => ({ left: 0, top: 0, width: 390, height: 844 });
  const noop = () => {};
  const stub = () => new Proxy(function () {}, { get: (t, k) => k === Symbol.toPrimitive ? () => 0 : stub(), apply: () => undefined });
  Object.assign(ctx, {
    document: doc, performance: { now: () => 0 }, devicePixelRatio: 1, requestAnimationFrame: noop, clearInterval: noop, clearTimeout: noop,
    matchMedia: () => ({ matches: false, addEventListener: noop }), WebSocket: undefined, fetch: () => new Promise(noop),
  });
  for (const k of ['Theme', 'Checkin', 'Shell', 'Sim', 'Heartbeat', 'Vitals', 'Perf', 'Eyes', 'World', 'Skill', 'FXGL', 'Art', 'Hub', 'Face']) if (!A[k]) A[k] = stub();
  A.ClipCheck = null;
  A.makeVisual = () => ({ black: 0 });
  A.applyProfileVisual = noop;
  const sent = [];
  A.bus.on('ws', m => sent.push(m.type));
  const started = [];
  const session = { rec: { session_id: 'test', sensors: {}, started_iso: '' }, liveMetrics: () => ({ simulated: true }), done: false };
  A.startSession = o => { started.push(o); return new Proxy(session, { get: (t, k) => k in t ? t[k] : noop }); };
  vm.runInContext(fs.readFileSync(path.join(JS, 'guide.js'), 'utf8'), ctx, { filename: 'guide.js' });
  vm.runInContext(fs.readFileSync(path.join(JS, 'main.js'), 'utf8'), ctx, { filename: 'main.js' });
  return { ...h, doc, phone, start, bubble, voice, sent, started };
};

// ── the bubble on index.html's own markup, with main.js's show(), shell.js's Escape, gui/swipe.js and talkbubble.js ──
const read = f => fs.readFileSync(path.join(DEMO, f), 'utf8');
// Class and hidden changes, and nodes taken out, reach a MutationObserver as they would in a browser (after the task).
const observers = [];
const notify = () => { if (!observers.length || notify.queued) return; notify.queued = true; Promise.resolve().then(() => { notify.queued = false; observers.forEach(f => f([])); }); };
Object.defineProperty(El.prototype, 'className', { get() { return this._cls ?? ''; }, set(v) { this._cls = String(v); notify(); }, configurable: true });
const rm = El.prototype.removeChild;
El.prototype.removeChild = function (n) { rm.call(this, n); notify(); };
Object.assign(El.prototype, {
  getBoundingClientRect() { return { left: 0, top: 0, width: 402, height: 874, bottom: 874, right: 402 }; },
  removeEventListener(t, f) { this.listeners[t] = (this.listeners[t] || []).filter(x => x !== f); },
  focus() { if (this.ownerDocument) this.ownerDocument.activeElement = this; },
  contains(n) { for (; n; n = n.parentNode) if (n === this) return true; return false; },
  before(...nodes) { const p = this.parentNode; if (!p) return; const add = p.adopt(nodes), i = p.childNodes.indexOf(this); p.childNodes.splice(i, 0, ...add); },
});
Object.defineProperties(El.prototype, {
  isConnected: { get() { let n = this; while (n.parentNode) n = n.parentNode; return n === this.ownerDocument?.documentElement; }, configurable: true },
  offsetHeight: { get() { return this.h ?? 560; }, configurable: true },
  offsetWidth: { get() { return 402; }, configurable: true },
  parentElement: { get() { return this.parentNode?.nodeType === 1 ? this.parentNode : null; }, configurable: true },
});
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
const phoneHtml = html.slice(html.indexOf('<section id="phone">'), html.indexOf('<aside id="panel">'));
// motion: false is reduced motion (a sheet closes the moment the finger lifts). loader: keep the loading screen up.
const shell = ({ motion = false, loader = false } = {}) => {
  const h = load({ finger: true, camera: true, storage: new Map([['afferent.checkin.test', JSON.stringify({ anchor: 1 })]]) });
  const { ctx } = h, doc = makeDocument(), timers = [], frames = [];
  let clock = 0;
  observers.length = 0;
  doc.body.replaceChildren(parse(doc, phoneHtml));
  if (!loader) doc.getElementById('loader')?.remove();
  if (!motion) doc.documentElement.dataset.motion = 'reduced';
  doc.activeElement = null;
  doc.createElementNS = (ns, tag) => doc.createElement(tag);
  Object.assign(ctx, {
    document: doc, clearInterval: () => {}, Event: class { constructor(type) { this.type = type; } }, performance: { now: () => clock },
    setTimeout: f => { const t = { f }; timers.push(t); return t; }, clearTimeout: t => { if (t) t.f = null; },
    requestAnimationFrame: f => { frames.push(f); return frames.length; }, cancelAnimationFrame: id => { frames[id - 1] = null; },
    MutationObserver: class { constructor(f) { this.f = f; } observe() { observers.push(this.f); } },
    listeners: {}, addEventListener: (t, f) => { (ctx.listeners[t] = ctx.listeners[t] || []).push(f); },
  });
  for (const f of ['clipcheck.js', 'checkin.js', 'gui/swipe.js']) vm.runInContext(fs.readFileSync(path.join(JS, f), 'utf8'), ctx, { filename: f });
  const showSrc = read('js/main.js').match(/\n  const FADES = [\s\S]*?\n    set\(\);\n  \};\n/)[0];
  const show = vm.runInContext(`(() => { const $ = id => document.getElementById(id); ${showSrc} return show; })()`, ctx);
  doc.querySelectorAll('[data-open]').forEach(b => { b.onclick = () => show(b.dataset.open, true); });
  doc.querySelectorAll('[data-close]').forEach(b => { b.onclick = () => show(b.dataset.close, false); });
  // shell.js's Escape, as it is
  const escSrc = read('js/gui/shell.js').match(/\n  const layers = \(\) => \{[\s\S]*?\n  \};\n/)[0];
  vm.runInContext(`(() => { const $ = id => document.getElementById(id), openPageOf = () => null; ${escSrc} layers(); })()`, ctx);
  ctx.A.Checkin.init({});
  vm.runInContext(read('js/talkbubble.js'), ctx, { filename: 'talkbubble.js' });
  const $ = id => doc.getElementById(id);
  const runTimers = () => { for (let i = 0; i < 4; i++) for (const t of timers.splice(0)) t.f?.(); };
  const runFrames = () => { for (const f of frames.splice(0)) f?.(); };
  const key = k => { const e = { key: k, preventDefault() {}, stopPropagation() {} }; for (const f of [...(doc.listeners.keydown || []), ...(ctx.listeners?.keydown || [])]) f(e); };
  return { ...h, doc, $, show, runTimers, runFrames, key, bubble: $('talkBubble'), tick: ms => { clock += ms; }, A: ctx.A, ctx };
};
const settle = async () => { for (let i = 0; i < 3; i++) await new Promise(r => setImmediate(r)); };
// Lets everything that was started finish: a sheet's slide or fade, then the bubble's own moment.
const finish = async p => { for (let i = 0; i < 3; i++) { p.runTimers(); await settle(p); } };
const away = p => p.bubble.classList.contains('away');
const shown = (p, id) => !p.$(id).classList.contains('hidden');
const sheetOf = (p, id) => p.$(id).children.find(c => c.classList.contains('sheet'));
const handleOf = sheet => sheet.children.find(c => c.classList.contains('handle'));
const fire = (target, type, x, y) => {
  const t = { identifier: 1, clientX: x, clientY: y };
  const e = { type, target, touches: type === 'touchstart' || type === 'touchmove' ? [t] : [], changedTouches: [t], cancelable: true,
    defaultPrevented: false, stopped: false, preventDefault() { this.defaultPrevented = true; }, stopPropagation() { this.stopped = true; } };
  for (let n = target; n && !e.stopped; n = n.parentNode) for (const f of [...(n.listeners?.[type] || [])]) f(e);
  return e;
};
const swipe = (p, target, { x = 200, y = 300, dx = 0, dy = 0, ms = 200, steps = 10 } = {}) => {
  fire(target, 'touchstart', x, y);
  for (let i = 1; i <= steps; i++) { p.tick(ms / steps); fire(target, 'touchmove', x + dx * i / steps, y + dy * i / steps); p.runFrames(); }
  fire(target, 'touchend', x + dx, y + dy);
};

const tests = {
  'the start screen has the bubble, a real button named by its text': () => {
    const [m, label] = tag(startHtml, 'talkBubble') || [];
    assert.ok(m, 'no #talkBubble inside #start');
    const a = attrs(m.slice(0, m.indexOf('>')));
    assert.strictEqual(a.type, 'button');
    assert.strictEqual(a['data-open'], 'voice');
    assert.strictEqual(a['aria-label'], undefined, 'the visible text is the name');
    assert.strictEqual(label.replace(/<[^>]+>/g, '').trim(), 'Hey, how are you feeling?');
  },

  'the bubble is the only way into Talk, the old top bar button is gone': () => {
    assert.strictEqual(html.match(/data-open="voice"/g).length, 1);
    assert.ok(!/<header class="top-bar">[\s\S]*?chat_bubble[\s\S]*?<\/header>/.test(startHtml));
  },

  'a tap on the bubble opens Talk and starts nothing': () => {
    const p = page();
    assert.ok(p.voice.classList.contains('hidden'));
    p.bubble.click();
    assert.ok(!p.voice.classList.contains('hidden'), 'Talk did not open');
    assert.ok(p.phone.classList.contains('card-open'));
    assert.ok(!p.A.session);
    assert.deepStrictEqual(p.started, []);
    assert.ok(!p.sent.includes('session_start'));
    p.voice.querySelector('[data-close="voice"]').click();
    assert.ok(p.voice.classList.contains('hidden'));
    assert.ok(!p.phone.classList.contains('card-open'));
  },

  'a session hides the start screen and the bubble with it': async () => {
    const p = page();
    assert.ok(!p.start.classList.contains('off'));
    p.doc.getElementById('begin').dispatchEvent({ type: 'kindle' });
    await new Promise(r => setImmediate(r));
    assert.strictEqual(p.started.length, 1);
    assert.ok(p.start.classList.contains('off'), 'the start screen stayed on');
    assert.strictEqual(p.bubble.parentNode, p.start);
  },

  'one shape: body and tail are one path, the glass is clipped to it, no separately coloured tail'() {
    const p = shell();
    const d = p.A.TalkBubble.path(240, 44, 30), T = p.A.TalkBubble.T;
    assert.strictEqual((d.match(/M/g) || []).length, 1, 'one subpath');
    assert.ok(d.endsWith('Z'));
    assert.ok(d.includes(`30 ${44 + T.tail}`), 'the tail ends at (p, body + tail)');
    const glass = p.bubble.querySelector('.tb-glass');
    assert.ok(glass, 'the glass layer');
    assert.ok(!/\.talk-bubble::(before|after)/.test(css), 'no tail drawn on its own');
    assert.match(css, /\.tb-glass \{[^}]*background-color: var\(--af-glass-strong\); background-image: var\(--af-sheen\)/);
    assert.match(css, /\.tb-glass \{[^}]*backdrop-filter: var\(--af-glass-blur\)/);
    assert.match(read('js/talkbubble.js'), /glass\.style\.clipPath = glass\.style\.webkitClipPath = `path\("\$\{d\}"\)`/);
    assert.match(read('js/talkbubble.js'), /<path class="tb-edge" d="\$\{d\}"\/>/, 'the edge is the same path');
  },

  'calm: it fades in a moment after the loading screen, then breathes now and then; reduced motion keeps it still'() {
    const p = shell({ loader: true });
    assert.ok(away(p), 'under the loading screen');
    p.$('loader').remove();
    return settle(p).then(() => {
      assert.ok(away(p), 'not at once');
      p.runTimers();
      assert.ok(!away(p), 'a moment later');
      assert.ok(p.A.TalkBubble.T.first >= 1000, 'a moment');
      assert.match(css, /\.talk-bubble \{[^}]*animation: tbBreathe 12s var\(--af-ease-breath\)/);
      assert.match(css, /\.talk-bubble\.away \{[^}]*opacity: 0;[^}]*pointer-events: none; animation: none/);
      assert.match(css, /:root\[data-motion="reduced"\] \.talk-bubble \{ animation: none; translate: none/);
      assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{\s*\.talk-bubble \{ animation: none; translate: none/);
    });
  },

  // Every way out of everything the bubble hides under, on index.html's markup with main.js's show(), shell.js's Escape and
  // gui/swipe.js's gestures (the same harness as swipe.test.js).
  'Your signals: closed by its button, the scrim, Escape, a swipe down (with and without motion), the bubble comes back'() {
    return (async () => {
      for (const motion of [false, true]) {
        const p = shell({ motion });
        await finish(p);
        assert.ok(!away(p), 'on the plain start screen');
        const ways = {
          button: () => p.$('signals').querySelector('.sheet-actions [data-close]').click(),
          scrim: () => p.$('signals').querySelector('.scrim').click(),
          Escape: () => p.key('Escape'),
          swipe: () => swipe(p, handleOf(sheetOf(p, 'signals')), { dy: 260 }),
        };
        for (const [way, close] of Object.entries(ways)) {
          p.$('signalsBtn').click();
          await settle(p);
          assert.ok(away(p), `${way}: hidden while Your signals is open`);
          close();
          await settle(p);
          if (p.A.Swipe.leaving(p.$('signals'))) assert.ok(away(p), `${way}: not while the sheet is still leaving`);
          await finish(p);
          assert.ok(!shown(p, 'signals'), `${way}: closed`);
          assert.ok(!away(p), `${way}${motion ? ' with motion' : ''}: the bubble is back`);
        }
      }
    })();
  },

  'Talk, Settings and How it works: back button, swipe back from the edge, swipe down, the bubble comes back'() {
    const p = shell();
    return (async () => {
      await finish(p);
      const ways = [
        ['voice', () => p.bubble.click(), () => p.$('voice').querySelector('[data-close="voice"]').click()],
        ['voice', () => p.bubble.click(), () => swipe(p, p.$('voice').querySelector('.top-bar'), { x: 6, dx: 220 })],
        ['settings', () => p.$('start').querySelector('[data-open="settings"]').click(), () => swipe(p, p.$('settings').querySelector('.top-bar'), { x: 6, dx: 220 })],
        ['info', () => p.$('start').querySelector('[data-open="info"]').click(), () => swipe(p, handleOf(sheetOf(p, 'info')), { dy: 260 })],
        ['info', () => p.$('start').querySelector('[data-open="info"]').click(), () => p.key('Escape')],
      ];
      for (const [id, openIt, close] of ways) {
        openIt(); await settle(p);
        assert.ok(shown(p, id) && away(p), `${id}: open, the bubble hidden`);
        close(); await finish(p);
        assert.ok(!shown(p, id), `${id}: closed`);
        assert.ok(!away(p), `${id}: the bubble is back`);
      }
    })();
  },

  'it stays hidden while anything is still open, during a session, the check-in, onboarding and the clip check'() {
    const p = shell();
    return (async () => {
      await finish(p);
      p.$('start').querySelector('[data-open="settings"]').click();
      p.$('settings').classList.remove('hidden');
      p.$('signals').classList.remove('hidden');
      await settle(p);
      p.$('signals').querySelector('.scrim').click(); await finish(p);
      assert.ok(!shown(p, 'signals') && away(p), 'Settings is still open under it');
      swipe(p, p.$('settings').querySelector('.top-bar'), { x: 6, dx: 220 }); await finish(p);
      assert.ok(!away(p), 'all closed');

      const covers = {
        session: [() => p.$('start').classList.add('off'), () => p.$('start').classList.remove('off')],
        'check-in': [() => p.A.Checkin.open(), () => p.key('Escape')],
        onboarding: [() => p.$('phone').classList.add('onboarding'), () => p.$('phone').classList.remove('onboarding')],
        'clip check': [() => p.A.ClipCheck.open('settings'), () => p.$('clipcheck').querySelector('.scrim').click()],
      };
      for (const [what, [on, off]] of Object.entries(covers)) {
        on(); await finish(p);
        assert.ok(away(p), `${what}: hidden, however long it lasts`);
        off(); await finish(p);
        assert.ok(!away(p), `${what}: back after it`);
      }
    })();
  },
};

(async () => {
  let failed = 0;
  for (const [name, fn] of Object.entries(tests)) {
    try { await fn(); console.log('ok  ', name); } catch (e) { failed++; console.log('FAIL', name, '\n     ', e.stack.slice(0, 900)); }
  }
  console.log(`${Object.keys(tests).length - failed} ok, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
