const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
const QR = require('../js/qrpayload.js');

const ROOT = path.join(__dirname, '..', '..');
const fixture = () => JSON.parse(fs.readFileSync(path.join(ROOT, 'contracts', 'fixtures', 'qr_body_anna.json'), 'utf8'));
const SRC = fs.readFileSync(path.join(__dirname, '..', 'js', 'qrshow.js'), 'utf8');
const DASH = '–';
const results = [];
const test = async (name, fn) => {
  try { await fn(); results.push(['ok', name]); } catch (e) { results.push(['FAIL', name, e]); }
};

function node(tag) {
  const n = {
    tag, attrs: {}, children: [], textContent: '', innerHTML: '', style: {}, dataset: {}, hidden: false, disabled: false, value: '',
    classList: { add() {}, remove() {} },
    setAttribute(k, v) { this.attrs[k] = v; if (k === 'hidden') this.hidden = true; },
    removeAttribute(k) { delete this.attrs[k]; },
    append(...kids) { this.children.push(...kids); },
    replaceChildren(...kids) { this.children = kids.filter(Boolean); },
    remove() {}, focus() {}, addEventListener() {}, querySelector() { return { style: {} }; }, getContext() { return null; },
    get lastChild() { return this.children[this.children.length - 1]; },
  };
  return n;
}
const walk = function* (n) { yield n; for (const c of n.children) if (c && typeof c === 'object') yield* walk(c); };
const find = (root, id) => [...walk(root)].find(n => n.attrs.id === id) || null;
const byClass = (root, cls) => [...walk(root)].filter(n => String(n.attrs.class || '').split(' ').includes(cls));
const text = n => (n.children.length ? n.children.map(text).join(' ') : n.textContent);
const flush = async () => { for (let i = 0; i < 20; i++) await new Promise(r => setImmediate(r)); };

function load(body) {
  const page = node('body'), printSec = node('section');
  const printed = [];
  const ctx = {
    console: { error() {}, log() {} }, Math, Date, JSON, Object, Array, Number, String, Promise, Error,
    A: { QR },
    document: {
      body: page, documentElement: { dataset: {} }, activeElement: null, hidden: false,
      createElement: node, getElementById: id => (id === 'qrPrint' ? printSec : find(page, id)),
      querySelector: () => null, addEventListener() {}, removeEventListener() {},
    },
    matchMedia: () => ({ matches: true }),
    localStorage: { getItem: () => null, setItem() {} },
    requestAnimationFrame: () => 0, setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {},
    addEventListener() {}, removeEventListener() {}, innerWidth: 390, innerHeight: 800, devicePixelRatio: 2,
    AbortController: class { constructor() { this.signal = {}; } abort() {} },
    fetch: async () => ({ ok: body !== null, status: body === null ? 404 : 200, json: async () => JSON.parse(JSON.stringify(body)) }),
    print: () => printed.push(printSec.children.slice()),
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx, { filename: 'qrshow.js' });
  return { A: ctx.A, page, printSec, printed };
}

async function sheet(body) {
  const env = load(body);
  env.A.QRShow.init({ pid: 'anna', hub: null });
  env.A.QRShow.open();
  await flush();
  env.items = byClass(env.page, 'qs-list')[0].children.map(li => text(li).trim());
  env.note = text(byClass(env.page, 'qs-note')[0]);
  return env;
}

async function printed(body) {
  const env = await sheet(body);
  find(env.page, 'qsPrint').onclick();
  await flush();
  assert.strictEqual(env.printed.length, 1, 'printed once');
  const tables = byClass(env.printSec, 'qp-vit');
  const rowsOf = t => (t ? t.children.filter(c => c.tag === 'tr').map(tr => tr.children.map(c => c.textContent)) : []);
  env.table = tables.find(t => text(t.children[0]).startsWith('Finger')) || null;
  env.rows = rowsOf(env.table);
  env.faceTable = tables.find(t => text(t.children[0]).startsWith('Phone camera')) || null;
  env.faceRows = rowsOf(env.faceTable);
  env.texts = env.printSec.children.map(text);
  return env;
}

const measured = () => ({
  weekly: { pulse_bpm: [null, null, 71.2, 69.8, null, 72.4, 70.1, 68.9], breathing_per_min: [null, null, 12.4, 11.9, null, 13.1, 12.2, 11.6], rmssd_ms: [null, null, 41.5, 38.2, null, null, 44.9, 47.3] },
  days: { pulse_bpm: 21, breathing_per_min: 21, rmssd_ms: 17 },
  simulated: { pulse_bpm: false, breathing_per_min: false, rmssd_ms: false },
});
const faceMeasured = () => ({
  weekly: { smile_share: [null, 0.12, 0.18, 0, null, 0.21, 0.15, 0.094], blinks_per_min: [null, 14, 17, 12, null, 19, 16.4, 15],
    gaze_away_share: [null, 0.08, 0.11, 0.05, null, null, 0.07, 0.1], micro_per_min: [null, 2.4, 3.1, 1.8, null, 2.2, 2.9, 2.5],
    breathing_per_min: [null, 13.2, 12.8, 14.1, null, 12.5, 13.4, 12.9] },
  days: { smile_share: 19, blinks_per_min: 19, gaze_away_share: 16, micro_per_min: 19, breathing_per_min: 12 },
  simulated: { smile_share: false, blinks_per_min: false, gaze_away_share: false, micro_per_min: false, breathing_per_min: false },
});
const WORDS = /\b(stress\w*|strain\w*|normal|abnormal|elevated|worse|better|risk\w*|healthy|good|bad|high|low|diagnos\w*|should|recommend\w*|live)\b/i;
const FEELINGS = /\b(happ\w*|sad\w*|joy\w*|emotion\w*|mood\w*|affect\w*|anxi\w*|calm\w*|nervous\w*|friendly|engag\w*|attention|bored\w*|tired\w*|express\w*)\b/i;

(async () => {
  await test('sheet: lists the finger sensor numbers the code holds', async () => {
    const s = await sheet({ ...fixture(), vitals: measured() });
    assert.strictEqual(s.items.length, 6);
    assert.strictEqual(s.items[1], 'Weekly pulse, breathing rate and HRV (RMSSD) from the finger sensor');
    assert.strictEqual(s.items[2], 'No face numbers: no reading in these weeks');
    assert.strictEqual(s.items[5], 'No name. No camera images. No pulse traces, only weekly numbers.');
    assert.strictEqual(s.note, 'Anyone who scans this code can read it. It is not sent anywhere: you show it or hand it over yourself.');
    for (const t of [...s.items, s.note]) assert.ok(!WORDS.test(t), t);
  });

  await test('sheet: says so when the weeks hold no finger sensor reading, and marks simulated numbers', async () => {
    const none = await sheet(fixture());
    assert.strictEqual(none.items[1], 'No finger sensor numbers: no reading in these weeks');
    const old = fixture();
    delete old.vitals;
    assert.strictEqual((await sheet(old)).items[1], 'No finger sensor numbers: no reading in these weeks');
    const part = measured();
    part.weekly.breathing_per_min = Array(8).fill(null);
    part.weekly.rmssd_ms = Array(8).fill(0);
    assert.strictEqual((await sheet({ ...fixture(), vitals: part })).items[1], 'Weekly pulse from the finger sensor');
    const sim = measured();
    sim.simulated.rmssd_ms = true;
    assert.strictEqual((await sheet({ ...fixture(), vitals: sim })).items[1], 'Weekly pulse, breathing rate and HRV (RMSSD) from the finger sensor (simulated)');
  });

  await test('printed page: the weekly numbers with unit, a dash for a week without a reading', async () => {
    const p = await printed({ ...fixture(), vitals: measured() });
    assert.ok(p.table, 'table on the page');
    assert.strictEqual(text(p.table.children[0]), 'Finger sensor, weekly medians. A dash is a week without a reading.');
    assert.strictEqual(p.rows.length, 4);
    assert.strictEqual(p.rows[0].length, 9);
    assert.strictEqual(p.rows[0][0], 'Week from');
    assert.deepStrictEqual([p.rows[0][1], p.rows[0][8]], ['20 Sep', '8 Nov']);
    assert.deepStrictEqual(p.rows[1], ['Pulse, finger sensor, bpm', DASH, DASH, '71.2', '69.8', DASH, '72.4', '70.1', '68.9']);
    assert.deepStrictEqual(p.rows[2], ['Breathing rate, per minute', DASH, DASH, '12.4', '11.9', DASH, '13.1', '12.2', '11.6']);
    assert.deepStrictEqual(p.rows[3], ['HRV (RMSSD), ms', DASH, DASH, '41.5', '38.2', DASH, DASH, '44.9', '47.3']);
    assert.ok(p.rows.flat().every(c => c !== '0.0' && c !== '0' && !/null|undefined|NaN/.test(c)));
    for (const t of p.texts) assert.ok(!WORDS.test(t), t);
    assert.ok(p.texts.includes('SIMULATED DATA'), 'the demo patient stays marked');
    const iData = p.texts.findIndex(t => t.startsWith('Data from')), iTable = p.printSec.children.indexOf(p.table), iMade = p.texts.findIndex(t => t.startsWith('Made'));
    assert.ok(iData >= 0 && iTable === iData + 1 && iMade === iTable + 1, 'the table sits under the dates');
  });

  await test('printed page: what is printed is what the code holds', async () => {
    const odd = measured();
    odd.weekly.pulse_bpm = [0, -1, 71.24, 6553.6, null, 72.4, 70.1, 68.96];
    odd.simulated.pulse_bpm = true;
    const p = await printed({ ...fixture(), vitals: odd });
    assert.deepStrictEqual(p.rows[1], ['Pulse, finger sensor, bpm, simulated', DASH, DASH, '71.2', DASH, DASH, '72.4', '70.1', '69.0']);
    const code = QR.unpack(QR.pack({ ...fixture(), vitals: odd })).vitals.weekly.pulse_bpm;
    assert.deepStrictEqual(p.rows[1].slice(1), code.map(x => (x === null ? DASH : x.toFixed(1))));
  });

  await test('sheet: lists the face numbers the code holds, plain names, simulated marked', async () => {
    const s = await sheet({ ...fixture(), face: faceMeasured() });
    assert.strictEqual(s.items[2], 'Weekly smiling, blinks and looking away from the phone camera, as numbers');
    assert.strictEqual(s.items[5], 'No name. No camera images. No pulse traces, only weekly numbers.');
    const old = fixture();
    delete old.face;
    assert.strictEqual((await sheet(old)).items[2], 'No face numbers: no reading in these weeks');
    const part = faceMeasured();
    part.weekly.smile_share = Array(8).fill(null);
    part.weekly.gaze_away_share = Array(8).fill(-1);
    part.simulated.blinks_per_min = true;
    assert.strictEqual((await sheet({ ...fixture(), face: part })).items[2], 'Weekly blinks from the phone camera, as numbers (simulated)');
    const zero = faceMeasured();
    zero.weekly = { smile_share: [0, 0, 0, 0, 0, 0, 0, 0] };
    assert.strictEqual((await sheet({ ...fixture(), face: zero })).items[2], 'Weekly smiling from the phone camera, as numbers');
    for (const t of [...s.items, s.note]) assert.ok(!WORDS.test(t) && !FEELINGS.test(t), t);
  });

  await test('printed page: the face numbers the code holds, in percent and per minute, a dash for a week without a reading', async () => {
    const p = await printed({ ...fixture(), vitals: measured(), face: faceMeasured() });
    assert.ok(p.table && p.faceTable, 'both tables');
    assert.strictEqual(text(p.faceTable.children[0]), 'Phone camera, weekly medians. A dash is a week without a reading.');
    assert.deepStrictEqual(p.faceRows.map(r => r[0]), ['Week from', 'Smiling, % of the time', 'Blinks, per minute', 'Looking away, % of the time']);
    assert.deepStrictEqual(p.faceRows[1].slice(1), [DASH, '12', '18', '0', DASH, '21', '15', '9']);
    assert.deepStrictEqual(p.faceRows[2].slice(1), [DASH, '14', '17', '12', DASH, '19', '16', '15']);
    assert.deepStrictEqual(p.faceRows[3].slice(1), [DASH, '8', '11', '5', DASH, DASH, '7', '10']);
    assert.ok(!JSON.stringify(p.faceRows).includes('13.2'), 'brief facial movements and camera breathing are not in the code');
    const iTable = p.printSec.children.indexOf(p.table), iFace = p.printSec.children.indexOf(p.faceTable);
    assert.ok(iFace === iTable + 1, 'the face table follows the finger sensor table');
    for (const t of p.texts) assert.ok(!WORDS.test(t) && !FEELINGS.test(t), t);
    const sim = faceMeasured();
    sim.simulated.smile_share = true;
    const q = await printed({ ...fixture(), face: sim });
    assert.strictEqual(q.faceRows[1][0], 'Smiling, % of the time, simulated');
    assert.strictEqual(q.faceRows[2][0], 'Blinks, per minute');
    const none = await printed(fixture());
    assert.strictEqual(none.faceTable, null);
  });

  await test('printed page: a full code says the face numbers were left out', async () => {
    const env = load({ ...fixture(), face: faceMeasured() });
    const real = QR.encode;
    env.A.QR = { ...QR, encode: (body, o) => real(body, { ...o, maxChars: real(body, o).chars - 20 }) };
    env.A.QRShow.init({ pid: 'anna', hub: null });
    env.A.QRShow.open();
    await flush();
    find(env.page, 'qsPrint').onclick();
    await flush();
    const texts = env.printed[0].map(text);
    assert.ok(texts.includes('This code was full, so the face numbers were left out.'), texts.join(' | '));
    assert.ok(!byClass(env.printSec, 'qp-vit').some(t => text(t.children[0]).startsWith('Phone camera')));
  });

  await test('printed page: no table without finger sensor numbers', async () => {
    const p = await printed(fixture());
    assert.strictEqual(p.table, null);
    assert.ok(p.texts.some(t => t.startsWith('Data from')) && p.texts.some(t => t.startsWith('Made')));
    const part = measured();
    part.weekly.rmssd_ms = Array(8).fill(null);
    const q = await printed({ ...fixture(), vitals: part });
    assert.deepStrictEqual(q.rows.map(r => r[0]), ['Week from', 'Pulse, finger sensor, bpm', 'Breathing rate, per minute']);
  });

  for (const [s, name, e] of results) console.log(`${s} ${name}${e ? '\n  ' + (e.stack || e) : ''}`);
  const failed = results.filter(r => r[0] === 'FAIL').length;
  console.log(`${results.length - failed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
