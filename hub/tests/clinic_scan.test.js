const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const ROOT = path.join(__dirname, '..', '..');
const WEB = path.join(ROOT, 'hub', 'afferent_hub', 'web', 'clinic');
const QR = require(path.join(ROOT, 'demo', 'js', 'qrpayload.js'));
const read = (f) => fs.readFileSync(path.join(WEB, f), 'utf8');
const fixture = () => JSON.parse(fs.readFileSync(path.join(ROOT, 'contracts', 'fixtures', 'qr_body_anna.json'), 'utf8'));
const DEMO = JSON.parse(read('demo-exports.json'));
const key = QR.newKey();
const plain = (v) => JSON.parse(JSON.stringify(v ?? null));

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

function loadClinic({ files = ['charts.js', 'signals.js', 'views.js', 'qrdecode.js', 'imported.js', 'scan.js', 'demo.js'], fetchLog = [] } = {}) {
  const body = stubEl();
  const made = [];
  const createElement = () => { const e = stubEl(); made.push(e); return e; };
  const ctx = {
    Math, JSON, Number, String, Array, Object, Map, Set, Promise, Date, Error, Uint8Array, URL, URLSearchParams, console,
    setTimeout: () => 0, clearTimeout() {}, requestAnimationFrame() {}, performance: { now: () => Date.now() },
    navigator: {}, location: { hash: '' }, isSecureContext: false,
    document: { body, documentElement: {}, activeElement: null, createElement, getElementById: stubEl, addEventListener() {}, querySelectorAll: () => [] },
    getComputedStyle: () => ({ getPropertyValue: () => '#123456' }),
    fetch: async (url) => { fetchLog.push(String(url)); if (url === 'demo-exports.json') return { ok: true, json: async () => JSON.parse(JSON.stringify(DEMO)) }; throw new Error('offline'); },
    A: { QR },
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  for (const f of files) vm.runInContext(read(f), ctx);
  const scanEl = made.find((e) => e.id === 'scan');
  return { C: ctx.C, ctx, card: scanEl && scanEl.querySelector('.scan-card'), fetchLog };
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

async function scanNew(C, card, text, label) {
  await C.scan.handle(text);
  assert.match(card.innerHTML, /data-kind="key"/, card.innerHTML);
  card.querySelector('#scan-label').value = label;
  await C.scan.trust();
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

  await test('nothing scanned: empty state with one scan action and no rows', async () => {
    const { C } = loadClinic();
    const S = { ui: { q: '' } };
    const page = C.views.exportPanes(S, null);
    assert.ok(page.includes('data-codes="scan"') && page.includes('Scan QR'), page);
    assert.ok(!page.includes('class="erow"') && !page.includes('detail-pane'));
    assert.strictEqual(page.replace(/<[^>]*>/g, ' ').replace(/qr_code_scanner/g, '').trim(), 'Scan QR');
  });

  await test('a scanned export appears with its received time via QR', async () => {
    const { C, card, ctx } = loadClinic();
    const before = Date.now();
    await scanNew(C, card, QR.encode(fixture(), { key, initial: 'K' }).text, 'Katja');
    const all = C.codes.all();
    assert.strictEqual(all.length, 1);
    const imp = all[0];
    assert.ok(Date.parse(imp.scanned_iso) >= before - 1000);
    assert.strictEqual(ctx.location.hash, '#/e/' + imp.cti);
    const S = { ui: { q: '' } };
    const list = C.views.exportList(S, imp.cti);
    const when = C.scanFmt.when(imp.scanned_iso);
    assert.ok(!list.includes(when), list);
    assert.ok(list.includes('<b>Katja</b>') && list.includes('20 Sep–14 Nov'), list);
    const detail = C.views.exportDetail(S, imp.cti);
    assert.ok(detail.includes('Received via QR') && detail.includes(when) && detail.includes('Early-warning index'));
    for (const w of ['Playing now', 'live', 'Live', 'Last session', 'this morning']) assert.ok(!list.includes(w) && !detail.includes(w), w);
  });

  await test('a second scan of the same patient adds a second export and keeps the first unchanged', async () => {
    const { C, card } = loadClinic();
    const first = fixture();
    await scanNew(C, card, QR.encode(first, { key, initial: 'K' }).text, 'Katja');
    const a = C.codes.all()[0];
    const kept = plain(a.body);
    await new Promise((r) => setTimeout(r, 5));
    const second = fixture();
    second.composite.value = 0.42;
    await C.scan.handle(QR.encode(second, { key, initial: 'K' }).text);
    const all = C.views.exportsAll();
    assert.strictEqual(all.length, 2);
    assert.ok(all[0].scanned_iso >= all[1].scanned_iso, 'newest first');
    assert.strictEqual(all[0].body.composite.value, 0.42);
    assert.deepStrictEqual(plain(C.codes.get(a.cti).body), kept);
    assert.strictEqual(all[0].record_id, all[1].record_id);
    const S = { ui: { q: '' } };
    assert.strictEqual(C.views.exportList(S, all[0].cti).split('class="erow"').length - 1, 2);
    assert.strictEqual(C.views.exportDetail(S, all[0].cti).split('class="ehrow"').length - 1, 2);
  });

  await test('the same code scanned twice is one export', async () => {
    const { C, card } = loadClinic();
    const text = QR.encode(fixture(), { key }).text;
    await scanNew(C, card, text, 'Katja');
    await C.scan.handle(text);
    assert.strictEqual(C.codes.all().length, 1);
  });

  await test('seeded demo exports are genuine codes that go through the real decoder', async () => {
    assert.ok(DEMO.exports.length >= 5);
    for (const e of DEMO.exports) {
      const r = QR.decode(e.parts, { now: Date.parse(e.received_iso) });
      assert.strictEqual(r.status, 'ok', e.label);
      assert.ok(r.body.period && r.body.weekly && r.body.state);
      assert.ok(Date.parse(e.received_iso) >= r.iat * 1000 && Date.parse(e.received_iso) <= r.exp * 1000);
    }
    const { C } = loadClinic();
    let decoded = 0;
    const real = C.qr.decode;
    C.qr.decode = (...a) => { decoded++; return real(...a); };
    await C.demo.seed();
    assert.strictEqual(decoded, DEMO.exports.length);
    const all = C.views.exportsAll();
    assert.strictEqual(all.length, DEMO.exports.length);
    const want = [...DEMO.exports].sort((a, b) => b.received_iso.localeCompare(a.received_iso));
    assert.deepStrictEqual(plain(all.map((x) => [C.codes.label(x), x.scanned_iso])), want.map((e) => [e.label, e.received_iso]));
    for (const imp of all) assert.deepStrictEqual(plain(imp.body), plain(QR.decode(DEMO.exports.find((e) => e.received_iso === imp.scanned_iso).parts, { now: Date.parse(imp.scanned_iso) }).body));
    const names = new Set(all.map((x) => C.codes.label(x)));
    for (const n of ['Anna', 'Juha', 'Mikko', 'Leena', 'Sofia']) assert.ok(names.has(n), n);
    const anna = all.filter((x) => C.codes.label(x) === 'Anna');
    assert.strictEqual(anna.length, 2);
    assert.strictEqual(anna[0].record_id, anna[1].record_id);
    assert.strictEqual(anna[0].body.period.tms_end_date, anna[1].body.period.tms_end_date);
    const list = C.views.exportList({ ui: { q: '' } }, all[0].cti);
    for (const imp of all) assert.ok(list.includes(`data-cti="${imp.cti}"`) && C.views.exportDetail({ ui: { q: '' } }, imp.cti).includes(C.scanFmt.when(imp.scanned_iso)));
  });

  await test('reset demo data goes back to the seeded exports', async () => {
    const { C, card } = loadClinic();
    await C.demo.seed();
    await scanNew(C, card, QR.encode(fixture(), { key }).text, 'Katja');
    assert.strictEqual(C.codes.all().length, DEMO.exports.length + 1);
    await C.demo.reset();
    assert.strictEqual(C.codes.all().length, DEMO.exports.length);
    assert.ok(!C.codes.all().some((x) => C.codes.label(x) === 'Katja'));
  });

  await test('the clinic web opens no socket and asks the hub for no patient data', async () => {
    const files = fs.readdirSync(WEB).filter((f) => /\.(js|html)$/.test(f));
    assert.ok(files.includes('clinic.js') && files.includes('index.html'));
    const src = files.map((f) => [f, read(f)]);
    for (const [f, text] of src) {
      for (const b of ['WebSocket', '/ws/', 'EventSource', 'setInterval', '/api/patients', '/api/demo', '/api/export', '/api/bedside', '/api/sensors', 'Playing now', 'live_now']) {
        assert.ok(!text.includes(b), `${f}: ${b}`);
      }
      for (const m of text.matchAll(/\/api\/[a-z/_-]*/g)) assert.strictEqual(m[0], '/api/validation', `${f}: ${m[0]}`);
    }
    const page = read('index.html');
    const order = ['charts.js', 'signals.js', 'views.js', 'qrdecode.js', 'imported.js', 'scan.js', 'demo.js', 'clinic.js'].map((f) => page.indexOf(`<script src="${f}"></script>`));
    assert.ok(order.every((i) => i > 0) && order.join() === [...order].sort((a, b) => a - b).join(), 'script order');
  });

  await test('booting the dashboard requests only the seeded exports and the page itself', async () => {
    const fetchLog = [];
    const sockets = [];
    const { ctx } = loadClinic({ fetchLog });
    const el = () => Object.assign(stubEl(), { scrollTop: 0 });
    const els = new Map();
    ctx.document.querySelector = (s) => { if (!els.has(s)) els.set(s, el()); return els.get(s); };
    ctx.document.querySelectorAll = () => [];
    ctx.document.getElementById = (id) => (id === 'tip' ? stubEl() : null);
    ctx.matchMedia = () => ({ matches: false, addEventListener() {} });
    ctx.addEventListener = () => {};
    ctx.WebSocket = function () { sockets.push([...arguments]); };
    ctx.localStorage = { getItem: () => null, setItem() {} };
    ctx.AbortController = AbortController;
    ctx.location.search = '';
    ctx.location.protocol = 'http:';
    ctx.location.origin = 'http://hub';
    vm.runInContext(read('clinic.js'), ctx);
    for (let i = 0; i < 50; i++) await new Promise((r) => setImmediate(r));
    assert.strictEqual(sockets.length, 0);
    assert.deepStrictEqual(fetchLog, ['demo-exports.json']);
    const view = els.get('#view').innerHTML;
    assert.ok(view.includes('class="erow"') && view.includes('via QR'), view.slice(0, 400));
  });

  for (const [s, name, e] of results) console.log(`${s} ${name}${e ? `\n  ${e.stack}` : ''}`);
  const failed = results.filter((r) => r[0] === 'FAIL').length;
  console.log(`${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
})();
