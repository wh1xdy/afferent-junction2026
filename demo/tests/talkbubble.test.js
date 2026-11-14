const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
const { load, JS } = require('./harness');
const { makeDocument } = require('./fakedom');

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

  'the bubble hides under sheets and keeps still for reduced motion': () => {
    assert.match(css, /#phone\.card-open \.talk-bubble \{[^}]*visibility: hidden/);
    assert.match(css, /:root\[data-motion="reduced"\] \.talk-bubble \{ animation: fadeIn/);
    assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{\s*\.talk-bubble \{ animation: fadeIn/);
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
