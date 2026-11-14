// Run: node demo/tests/checkin.test.js
// The check-in's question screens (demo/js/checkin.js): a visible way out and where you are on every question, and the
// safety flow behind them unchanged. A non-zero answer to item 9 must still end on the support screen with the
// helplines, whether the check-in ends by itself, by the stop button, by the talk button or by swiping down.
// Every answer here is a test input. Timers run by hand; the DOM is a small fake (enough for checkin.js).
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { JS } = require('./harness');

class Text {
  constructor(t) { this.data = String(t); }
  get textContent() { return this.data; }
}
class El {
  constructor(tag, doc) {
    Object.assign(this, { tagName: tag.toUpperCase(), ownerDocument: doc, parentElement: null, nodes: [], dataset: {}, attrs: {}, style: {}, listeners: {}, className: '', id: '', html: '', inert: false, tabIndex: 0 });
  }
  get children() { return this.nodes.filter(n => n instanceof El); }
  get classList() {
    const list = () => this.className.split(/\s+/).filter(Boolean), set = l => { this.className = l.join(' '); };
    return {
      add: (...c) => set([...new Set([...list(), ...c])]),
      remove: (...c) => set(list().filter(x => !c.includes(x))),
      toggle: (c, on) => { const want = on === undefined ? !list().includes(c) : !!on; set(want ? [...new Set([...list(), c])] : list().filter(x => x !== c)); return want; },
      contains: c => list().includes(c),
    };
  }
  append(...nodes) {
    for (const n of nodes) {
      if (n == null) continue;
      if (typeof n !== 'object') { this.nodes.push(new Text(n)); continue; }
      n.parentElement?.removeChild(n); n.parentElement = this; this.nodes.push(n);
    }
  }
  removeChild(n) { this.nodes = this.nodes.filter(c => c !== n); n.parentElement = null; }
  replaceChildren(...nodes) { for (const c of this.children) c.parentElement = null; this.nodes = []; this.html = ''; this.append(...nodes); }
  set textContent(v) { this.replaceChildren(); if (v != null && v !== '') this.append(String(v)); }
  get textContent() { return this.nodes.map(c => c.textContent).join(''); }
  set innerHTML(v) { this.replaceChildren(); this.html = String(v); }
  get innerHTML() { return this.html; }
  setAttribute(k, v) { if (k.startsWith('data-')) this.dataset[k.slice(5)] = String(v); else this.attrs[k] = String(v); }
  getAttribute(k) { return k.startsWith('data-') ? this.dataset[k.slice(5)] ?? null : this.attrs[k] ?? null; }
  addEventListener(t, f) { (this.listeners[t] ||= []).push(f); }
  emit(t, props = {}) { const e = { type: t, target: this, preventDefault() {}, ...props }; for (const f of this.listeners[t] || []) f(e); }
  click() { this.onclick?.({ type: 'click', target: this }); this.emit('click'); }
  focus() { this.ownerDocument.activeElement = this; }
  getBoundingClientRect() { return { left: 0, top: 0, width: 390, height: 844 }; }
  all() { return this.children.flatMap(c => [c, ...c.all()]); }
  match(sel) {
    if (sel.startsWith('.')) return this.classList.contains(sel.slice(1));
    if (sel.startsWith('#')) return this.id === sel.slice(1);
    const m = sel.match(/^\[([\w-]+)\]$/);
    if (m) return this.getAttribute(m[1]) != null;
    return this.tagName === sel.toUpperCase();
  }
  querySelectorAll(sel) { return this.all().filter(e => e.match(sel)); }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
}

const page = ({ storage = new Map(), hub = null } = {}) => {
  const timers = [], winListeners = {}, emitted = [];
  const doc = { activeElement: null, documentElement: new El('html'), createElement: tag => new El(tag, doc) };
  doc.documentElement.ownerDocument = doc;
  doc.body = new El('body', doc);
  doc.documentElement.append(doc.body);
  const phone = new El('section', doc); phone.id = 'phone';
  const pill = new El('button', doc); pill.id = 'checkinBtn'; pill.className = 'checkin-chip hidden';
  const canvas = new El('canvas', doc);
  phone.append(canvas, pill);
  doc.body.append(phone);
  doc.getElementById = id => doc.documentElement.all().find(e => e.id === id) || null;
  const ctx = {
    console, Math, Date, JSON, Set, Map, Object, Array, Number, String, URLSearchParams, document: doc, performance: { now: () => 0 },
    crypto: { randomUUID: () => 'test-id' }, location: { search: '' },
    localStorage: { getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, String(v)), removeItem: k => storage.delete(k) },
    setTimeout: (f, ms) => { timers.push(f); return timers.length; }, clearTimeout: id => { if (id) timers[id - 1] = null; },
    requestAnimationFrame: f => { f(); return 0; },
    addEventListener: (t, f) => (winListeners[t] ||= []).push(f),
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(JS, 'util.js'), 'utf8'), ctx, { filename: 'util.js' });
  vm.runInContext(`A.config = { patientId: 'test', deviceId: 'test', appVersion: 'test', sharing: 'summary', checkin: true };`, ctx);
  if (hub) ctx.A.Hub = hub;
  const { A } = ctx;
  A.bus.on('ws', m => emitted.push(m));
  const talks = [];
  A.bus.on('talk', () => talks.push(1));
  vm.runInContext(fs.readFileSync(path.join(JS, 'checkin.js'), 'utf8'), ctx, { filename: 'checkin.js' });
  A.Checkin.init({ night: () => false, busy: () => false, log: () => {} });
  const root = doc.getElementById('checkin');
  // run every pending timer (the 600 ms advance after an answer)
  const flush = () => { for (let i = 0; i < timers.length; i++) { const f = timers[i]; if (f) { timers[i] = null; f(); } } };
  const sheet = () => root.children[0];
  const q = sel => sheet().querySelector(sel);
  const opts = () => sheet().querySelectorAll('.ci-opt');
  const answer = v => { opts().find(b => b.dataset.v === String(v)).click(); flush(); };
  const begin = () => { A.Checkin.open(); sheet().querySelectorAll('.ci-btn').find(b => b.textContent === 'Start').click(); };
  const docs = () => emitted.filter(m => m.type === 'checkin').map(m => m.checkin);
  return { A, doc, root, sheet, q, opts, answer, begin, flush, docs, talks, storage, swipe: (dy, dx = 0) => {
    root.emit('pointerdown', { pointerId: 1, clientX: 100, clientY: 200 });
    root.emit('pointermove', { pointerId: 1, clientX: 100 + dx, clientY: 200 + dy });
    root.emit('pointerup', { pointerId: 1, clientX: 100 + dx, clientY: 200 + dy });
  } };
};

const kind = p => p.sheet().className.replace('ci-sheet ', '');
const progress = p => p.q('.ci-progress')?.textContent ?? null;
// the anchor (first launch) is seen already, so the app opens on its start screen
const seen = () => new Map([['afferent.checkin.test', JSON.stringify({ anchor: 1 })]]);

const tests = {
  'a: every question shows where you are, 1 of 9 to 9 of 9, quietly in the bar'() {
    const p = page({ storage: seen() });
    p.begin();
    for (let i = 1; i <= 9; i++) {
      assert.strictEqual(kind(p), 'ci-question', `question ${i}`);
      assert.strictEqual(progress(p), `Question ${i} of 9`, `question ${i}`);
      assert.strictEqual(p.q('.ci-progress').querySelector('.ci-sr').textContent, 'Question ', 'the word is for screen readers, the numbers are visible');
      p.answer(0);
    }
    assert.strictEqual(kind(p), 'ci-info ci-thanks');
  },

  'b: every question has a visible stop button and the talk button, the same bar as the other check-in screens'() {
    const p = page({ storage: seen() });
    p.begin();
    for (let i = 1; i <= 9; i++) {
      const bar = p.q('.ci-bar');
      assert.ok(bar, `question ${i}: no bar`);
      assert.strictEqual(p.sheet().children[0], bar, 'the bar comes first, at the top');
      const stop = bar.querySelector('.ci-stop'), talk = bar.querySelector('.ci-talk');
      assert.ok(stop && !stop.classList.contains('ci-sr'), `question ${i}: the stop button is visible`);
      assert.strictEqual(stop.getAttribute('aria-label'), 'Stop check-in');
      assert.ok(talk, `question ${i}: no talk button`);
      assert.strictEqual(talk.getAttribute('aria-label'), 'Talk to someone');
      if (i < 9) p.answer(1);
    }
    p.A.Checkin.open();
    assert.ok(p.q('.ci-bar') && p.q('.ci-talk'), 'the intro screen has the same talk button');
  },

  'c: stop on an early question keeps the answers so far and says so, without a safety screen'() {
    const p = page({ storage: seen() });
    p.begin(); p.answer(2); p.answer(1);
    assert.strictEqual(progress(p), 'Question 3 of 9');
    p.q('.ci-stop').click();
    assert.strictEqual(kind(p), 'ci-info ci-saved');
    const d = p.docs().at(-1);
    assert.deepStrictEqual([d.status, d.phq9.items.phq9_1, d.phq9.items.phq9_2, d.phq9.items.phq9_3, d.safety.tier], ['incomplete', 2, 1, null, 'not_answered']);
  },

  'd: item 9 above zero still ends on the support screen with the helplines, when the check-in ends by itself'() {
    const p = page({ storage: seen() });
    p.begin();
    for (let i = 1; i <= 8; i++) p.answer(0);
    assert.strictEqual(progress(p), 'Question 9 of 9');
    p.answer(1);
    assert.strictEqual(kind(p), 'ci-info ci-support');
    const calls = p.sheet().querySelectorAll('.ci-contact').map(c => c.href);
    assert.ok(calls.includes('tel:112') && calls.includes('tel:0925250111') && calls.includes('tel:116117'), calls.join());
    assert.deepStrictEqual([p.docs().at(-1).safety.tier, p.docs().at(-1).safety.screen], ['low', 'support']);
  },

  'e: item 9 answered and then the stop button, before it moves on: the support screen, not "Saved"'() {
    for (const v of [1, 2, 3]) {
      const p = page({ storage: seen() });
      p.begin();
      for (let i = 1; i <= 8; i++) p.answer(0);
      p.opts().find(b => b.dataset.v === String(v)).click(); // picked, the 600 ms advance has not run
      p.q('.ci-stop').click();
      const want = v >= 2 ? 'ci-info ci-crisis' : 'ci-info ci-support';
      assert.strictEqual(kind(p), want, `item 9 = ${v}`);
      assert.ok(p.sheet().querySelectorAll('.ci-contact').some(c => c.href === 'tel:112'), 'helplines shown');
      p.flush();
      assert.strictEqual(kind(p), want, 'the pending advance does not replace the safety screen');
    }
  },

  'f: the talk button on item 9 after a non-zero answer stays on the safety screen; on an unanswered question it opens the helplines card'() {
    let p = page({ storage: seen() });
    p.begin();
    for (let i = 1; i <= 8; i++) p.answer(0);
    p.opts().find(b => b.dataset.v === '2').click();
    p.q('.ci-talk').click();
    assert.strictEqual(kind(p), 'ci-info ci-crisis');
    assert.strictEqual(p.talks.length, 0, 'it does not jump past the safety screen');

    p = page({ storage: seen() });
    p.begin(); p.answer(0);
    p.q('.ci-talk').click();
    assert.ok(p.root.classList.contains('hidden'), 'the check-in closes');
    assert.strictEqual(p.talks.length, 1, 'and the talk card with the helplines opens');
    assert.strictEqual(p.docs().at(-1).status, 'incomplete');
  },

  'g: swiping down still stops, with the same safety rule'() {
    let p = page({ storage: seen() });
    p.begin(); p.answer(0);
    p.swipe(160);
    assert.strictEqual(kind(p), 'ci-info ci-saved');

    p = page({ storage: seen() });
    p.begin();
    for (let i = 1; i <= 8; i++) p.answer(0);
    p.opts().find(b => b.dataset.v === '1').click();
    p.swipe(160);
    assert.strictEqual(kind(p), 'ci-info ci-support');
  },

  'h: the intro names the stop button as a way out'() {
    const p = page({ storage: seen() });
    p.A.Checkin.open();
    const lines = p.sheet().querySelectorAll('p').map(e => e.textContent);
    assert.ok(lines.some(l => /stop at any time with the cross at the top, or by swiping down/.test(l)), lines.join(' | '));
  },
};

let failed = 0;
for (const [name, fn] of Object.entries(tests)) {
  try { fn(); console.log('ok  ', name); } catch (e) { failed++; console.log('FAIL', name, '\n     ', e.stack.split('\n').slice(0, 4).join('\n      ')); }
}
console.log(`${Object.keys(tests).length - failed} ok, ${failed} failed`);
process.exit(failed ? 1 : 0);
