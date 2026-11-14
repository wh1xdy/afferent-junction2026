const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const ROOT = path.join(__dirname, '..', '..');
const WEB = path.join(ROOT, 'hub', 'afferent_hub', 'web', 'clinic');
const QR = require(path.join(ROOT, 'demo', 'js', 'qrpayload.js'));
const fixture = () => JSON.parse(fs.readFileSync(path.join(ROOT, 'contracts', 'fixtures', 'qr_body_anna.json'), 'utf8'));
const key = QR.newKey();

function stubEl() {
  const kids = new Map();
  const e = {
    hidden: false, innerHTML: '', textContent: '', className: '', id: '', value: '', dataset: {}, files: [],
    classList: { add() {}, remove() {} },
    setAttribute() {}, addEventListener() {}, appendChild() {}, focus() {}, blur() {}, click() {}, remove() {},
    closest: () => null, querySelectorAll: () => [], getContext: () => ({ drawImage() {} }), play: async () => {},
    querySelector(s) { if (!kids.has(s)) kids.set(s, stubEl()); return kids.get(s); },
  };
  return e;
}

function loadClinic() {
  const body = stubEl();
  const made = [];
  const createElement = () => { const e = stubEl(); made.push(e); return e; };
  const ctx = {
    Math, JSON, Number, String, Array, Object, Map, Promise, Date, Error, Uint8Array,
    setTimeout: () => 0, clearTimeout() {}, requestAnimationFrame() {}, performance: { now: () => Date.now() },
    navigator: {}, location: { hash: '' }, isSecureContext: false,
    document: { body, activeElement: null, createElement, getElementById: stubEl, addEventListener() {}, querySelectorAll: () => [] },
    A: { QR },
  };
  ctx.window = ctx;
  ctx.C = { esc: (s) => String(s ?? '') };
  vm.createContext(ctx);
  for (const f of ['qrdecode.js', 'scan.js']) vm.runInContext(fs.readFileSync(path.join(WEB, f), 'utf8'), ctx);
  return { C: ctx.C, card: made.find((e) => e.id === 'scan').querySelector('.scan-card') };
}

function spacedParts(set) {
  let r;
  do r = QR.encode(fixture(), { key }); while (!r.text.slice(4, -1).includes(' '));
  const data = r.text.slice(4);
  const cut = data.indexOf(' ') + 1;
  const parts = [`AF1/1/2/${set}:${data.slice(0, cut)}`, `AF1/2/2/${set}:${data.slice(cut)}`];
  assert.ok(parts[0].endsWith(' '));
  return parts;
}

const results = [];
const test = async (name, fn) => {
  try { await fn(); results.push(['ok', name]); } catch (e) { results.push(['FAIL', name, e]); }
};

(async () => {
  await test('a camera part ending in a space imports', async () => {
    const { C, card } = loadClinic();
    for (const p of spacedParts('SPCA')) await C.scan.handle(p);
    assert.match(card.innerHTML, /data-kind="key"/, card.innerHTML);
  });

  await test('a scanner part ending in a space imports, line breaks and tabs are dropped', async () => {
    const { C, card } = loadClinic();
    for (const p of spacedParts('SPCB')) await C.scan.fromScanner(`\t${p}\r\n`);
    assert.match(card.innerHTML, /data-kind="key"/, card.innerHTML);
  });

  await test('a whole code wrapped in line breaks and tabs decodes', async () => {
    const { C } = loadClinic();
    const r = QR.encode(fixture(), { key });
    assert.ok(r.text);
    assert.strictEqual(C.qr.decode(r.text).status, 'ok');
    assert.strictEqual(C.qr.decode(`\n${r.text}\t\r\n`).status, 'ok');
  });

  for (const [s, name, e] of results) console.log(`${s} ${name}${e ? `\n  ${e.message}` : ''}`);
  const failed = results.filter((r) => r[0] === 'FAIL').length;
  console.log(`${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
})();
