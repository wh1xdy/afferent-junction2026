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
  env.table = byClass(env.printSec, 'qp-vit')[0] || null;
  env.rows = env.table ? env.table.children.filter(c => c.tag === 'tr').map(tr => tr.children.map(c => c.textContent)) : [];
  env.texts = env.printSec.children.map(text);
  env.room = byClass(env.printSec, 'qp-room')[0] || null;
  env.roomRows = env.room ? env.room.children.filter(c => c.tag === 'tr').map(tr => tr.children.map(c => c.textContent)) : [];
  return env;
}

const measured = () => ({
  weekly: { pulse_bpm: [null, null, 71.2, 69.8, null, 72.4, 70.1, 68.9], breathing_per_min: [null, null, 12.4, 11.9, null, 13.1, 12.2, 11.6], rmssd_ms: [null, null, 41.5, 38.2, null, null, 44.9, 47.3] },
  days: { pulse_bpm: 21, breathing_per_min: 21, rmssd_ms: 17 },
  simulated: { pulse_bpm: false, breathing_per_min: false, rmssd_ms: false },
});
const WORDS = /\b(stress\w*|strain\w*|normal|abnormal|elevated|worse|better|risk\w*|healthy|good|bad|high|low|diagnos\w*|should|recommend\w*|live)\b/i;

(async () => {
  await test('sheet: lists the finger sensor numbers the code holds', async () => {
    const s = await sheet({ ...fixture(), vitals: measured() });
    assert.strictEqual(s.items.length, 6);
    assert.strictEqual(s.items[1], 'Weekly pulse, breathing rate and HRV (RMSSD) from the finger sensor');
    assert.strictEqual(s.items[2], 'Weekly temperature and humidity at your bedside at night (simulated)');
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
    const iRoom = p.printSec.children.indexOf(p.room);
    assert.ok(iData >= 0 && iTable === iData + 1 && iRoom === iTable + 1 && iMade === iRoom + 1, 'the tables sit under the dates');
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

  await test('printed page: no table without finger sensor numbers', async () => {
    const p = await printed(fixture());
    assert.strictEqual(p.table, null);
    assert.ok(p.texts.some(t => t.startsWith('Data from')) && p.texts.some(t => t.startsWith('Made')));
    const part = measured();
    part.weekly.rmssd_ms = Array(8).fill(null);
    const q = await printed({ ...fixture(), vitals: part });
    assert.deepStrictEqual(q.rows.map(r => r[0]), ['Week from', 'Pulse, finger sensor, bpm', 'Breathing rate, per minute']);
  });

  const nights = () => ({ weekly: { temp_c_night: [null, 19.4, 21.6, 22.1, null, 18.7, 20.3, 23.5], humidity_pct: [null, 41, 38, 35, null, 44, 40, 29] }, nights: 31, simulated: false });

  await test('bedroom at night: the sheet says the code holds it, or that there is no reading', async () => {
    assert.strictEqual((await sheet({ ...fixture(), room: nights() })).items[2], 'Weekly temperature and humidity at your bedside at night');
    const old = fixture();
    delete old.room;
    assert.strictEqual((await sheet(old)).items[2], 'No bedside temperature: no reading in these weeks');
    const dry = nights();
    dry.weekly.humidity_pct = Array(8).fill(null);
    assert.strictEqual((await sheet({ ...fixture(), room: dry })).items[2], 'Weekly temperature at your bedside at night');
    for (const t of (await sheet({ ...fixture(), room: nights() })).items) assert.ok(!WORDS.test(t), t);
  });

  await test('bedroom at night: printed under the finger numbers, what the code holds', async () => {
    const p = await printed({ ...fixture(), room: nights() });
    assert.ok(p.room, 'room table on the page');
    assert.strictEqual(text(p.room.children[0]), 'At your bedside at night, 23:00 to 07:00, weekly medians. A dash is a week without a reading.');
    assert.deepStrictEqual(p.roomRows[1], ['Temperature at night, °C', DASH, '19.4', '21.6', '22.1', DASH, '18.7', '20.3', '23.5']);
    assert.deepStrictEqual(p.roomRows[2], ['Humidity at night, %', DASH, '41', '38', '35', DASH, '44', '40', '29']);
    assert.strictEqual(p.table, null, 'no finger table without finger numbers');
    for (const t of p.texts) assert.ok(!WORDS.test(t), t);
    const sim = await printed(fixture());
    assert.ok(text(sim.room.children[0]).includes('weekly medians, simulated.'));
    const old = fixture();
    delete old.room;
    assert.strictEqual((await printed(old)).room, null);
  });

  for (const [s, name, e] of results) console.log(`${s} ${name}${e ? '\n  ' + (e.stack || e) : ''}`);
  const failed = results.filter(r => r[0] === 'FAIL').length;
  console.log(`${results.length - failed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
