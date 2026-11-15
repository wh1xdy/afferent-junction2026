// Run: node demo/tests/support.test.js
// "Talk to someone": every button for it opens the help sheet with the helplines at once, on the phone itself, with no
// hub and no clinic in the way. The talk request that goes to the patient's own hub is a record for the handover, not
// an alert: nothing about it waits for an answer, and no copy in the app says a clinic has been told.
// The phone of index.html runs on the fake DOM (fakedom.js) with main.js's own show(), crisis() and button wiring,
// cut out of main.js as they are. Taps here are test input.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
const { makeDocument, El } = require('./fakedom');

const DEMO = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(DEMO, f), 'utf8');

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

const page = () => {
  const doc = makeDocument();
  Object.assign(El.prototype, {
    focus() { if (this.ownerDocument) this.ownerDocument.activeElement = this; },
    contains(n) { for (; n; n = n.parentNode) if (n === this) return true; return false; },
  });
  Object.defineProperty(El.prototype, 'isConnected', { configurable: true, get() { let n = this; while (n.parentNode) n = n.parentNode; return n === this.ownerDocument?.documentElement; } });
  const html = read('index.html');
  doc.body.replaceChildren(parseInto(doc, doc.createElement('div'), html.slice(html.indexOf('<section id="phone">'), html.indexOf('<aside id="panel">'))).children[0]);
  doc.activeElement = null;
  const ctx = { console, URLSearchParams, document: doc, location: { search: '' }, setTimeout: () => 0, clearTimeout() {} };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(read('js/util.js'), ctx, { filename: 'util.js' });
  vm.runInContext(`A.config = { patientId: 'test' }; A.Record = { isoLocal: d => d.toISOString() };`, ctx);
  const main = read('js/main.js');
  const cut = main.match(/\n  const FADES = [\s\S]*?\n  document\.querySelectorAll\('\[data-close\]'\)[^\n]*\n/);
  assert.ok(cut, 'main.js: show(), crisis() and the [data-open]/[data-close] wiring');
  const talk = main.match(/\n  A\.bus\.on\('talk', [^\n]*\n/);
  assert.ok(talk, "main.js: the check-in's talk button opens the same sheet");
  vm.runInContext(`(() => { const $ = id => document.getElementById(id); const log = () => {}; ${cut[0]} ${talk[0]} })();`, ctx);
  const sent = [];
  ctx.A.bus.on('ws', m => sent.push(m));
  const $ = id => doc.getElementById(id);
  return { doc, $, A: ctx.A, sent };
};

const open = el => !!el && !el.classList.contains('hidden');
const helplines = sheet => {
  const calls = sheet.querySelectorAll('a').map(a => a.getAttribute('href'));
  for (const tel of ['tel:112', 'tel:0925250111', 'tel:116117']) assert.ok(calls.includes(tel), `${tel} in ${calls.join(', ')}`);
  assert.ok(/not an emergency service/.test(sheet.textContent), 'the sheet says Afferent is not an emergency service');
};

const tests = {
  'every "Talk to someone" button opens the helplines at once, with no hub, and closes again'() {
    const p = page(), buttons = p.doc.querySelectorAll('[data-open="crisis"]');
    assert.ok(buttons.length >= 4, `talk buttons on the screens: ${buttons.length}`);
    for (const b of buttons) {
      assert.strictEqual(b.getAttribute('aria-label'), 'Talk to someone');
      assert.ok(!open(p.$('crisis')));
      p.sent.length = 0;
      b.onclick();
      assert.ok(open(p.$('crisis')), 'the help sheet is open');
      helplines(p.$('crisis'));
      assert.deepStrictEqual(p.sent.map(m => [m.type, m.source]), [['crisis', 'talk_button']], 'one talk request for the home hub');
      p.$('crisis').querySelector('[data-close="crisis"]').onclick();
      assert.ok(!open(p.$('crisis')), 'Close closes it');
    }
  },

  "the check-in's talk button opens the same sheet"() {
    const p = page();
    p.A.bus.emit('talk');
    assert.ok(open(p.$('crisis')));
    helplines(p.$('crisis'));
  },

  'no copy in the app says a clinic sees anything by itself'() {
    const told = /clinic (will see|sees your|gets|only gets|is told|can understand)|still (reach|shared)|next working day/i;
    const files = ['index.html', 'patient.html', 'data/patient_view_anna.json',
      ...fs.readdirSync(path.join(DEMO, 'js')).filter(f => f.endsWith('.js')).map(f => 'js/' + f),
      ...fs.readdirSync(path.join(DEMO, 'js', 'gui')).map(f => 'js/gui/' + f)];
    const found = [];
    for (const f of files) {
      // strings only: comments may describe the rule itself
      const src = read(f).split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n');
      for (const m of src.matchAll(/'[^'\n]*'|"[^"\n]*"|`[^`]*`|>[^<]+</g)) if (told.test(m[0])) found.push(`${f}: ${m[0].slice(0, 90)}`);
    }
    assert.deepStrictEqual(found, []);
  },
};

let failed = 0;
for (const [name, fn] of Object.entries(tests)) {
  try { fn(); console.log('ok  ', name); } catch (e) { failed++; console.log('FAIL', name, '\n     ', e.stack.split('\n').slice(0, 4).join('\n      ')); }
}
console.log(`${Object.keys(tests).length - failed} ok, ${failed} failed`);
process.exit(failed ? 1 : 0);
