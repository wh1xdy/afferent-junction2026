// Run: node demo/tests/qrshow.test.js
// "Show to my doctor" (demo/js/qrshow.js): the code is a link to the patient's dashboard, never the numbers.
// Runs the real handover.js and the real QR matrix (qrpayload.js) on a small fake page.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
const QR = require('../js/qrpayload.js');

const ROOT = path.join(__dirname, '..', '..');
const fixture = () => JSON.parse(fs.readFileSync(path.join(ROOT, 'contracts', 'fixtures', 'qr_body_anna.json'), 'utf8'));
const SRC = fs.readFileSync(path.join(__dirname, '..', 'js', 'qrshow.js'), 'utf8');
const HANDOVER = fs.readFileSync(path.join(__dirname, '..', 'js', 'handover.js'), 'utf8');
const RELAY = 'https://afferent-voice-test.a.run.app';
const HUB = 'http://192.168.1.20:8000/k/pairing-token-123';
const ID = 'AbCdEfGhIjKlMnOpQrStUv';
const results = [];
const test = async (name, fn) => {
  try { await fn(); results.push(['ok', name]); } catch (e) { results.push(['FAIL', name, e]); }
};

function node(tag) {
  const cls = new Set();
  const n = {
    tag, attrs: {}, children: [], textContent: '', innerHTML: '', style: {}, dataset: {}, hidden: false, disabled: false, value: '',
    classList: { add: c => cls.add(c), remove: c => cls.delete(c), contains: c => cls.has(c) },
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
const flush = async () => { for (let i = 0; i < 40; i++) await new Promise(r => setImmediate(r)); };

// routes: [regex, { status, reply, throws }]; every request is kept in `sent`.
function load({ body = fixture(), relay = { url: RELAY, code: 'relay-code' }, hub = HUB, routes = [], storage = new Map() } = {}) {
  const page = node('body'), printSec = node('section'), sent = [], printed = [], matrices = [];
  const qr = { ...QR, matrix: (t, e) => { matrices.push(t); return QR.matrix(t, e); }, encode: () => { throw new Error('no data code is made any more'); }, cachedBody: async () => null, cacheBody: async () => {} };
  const fetch = async (url, opts = {}) => {
    url = String(url);
    sent.push({ url, method: opts.method || 'GET', headers: opts.headers || {}, body: opts.body });
    if (url === 'js/qr_body_fallback.json') return { ok: body !== null, status: body === null ? 404 : 200, json: async () => JSON.parse(JSON.stringify(body)) };
    for (const [re, a] of routes) if (re.test(url)) {
      if (a.throws) throw new TypeError('Failed to fetch');
      return { ok: (a.status ?? 200) < 300, status: a.status ?? 200, json: async () => a.reply };
    }
    throw new TypeError('Failed to fetch');
  };
  const ctx = {
    console: { error() {}, log() {} }, Math, Date, JSON, Object, Array, Number, String, Promise, Error, TypeError, URL, Uint8Array,
    TextEncoder, TextDecoder, btoa, atob, crypto: globalThis.crypto,
    A: { QR: qr, Dashboard: { make: async (rec, extra) => ({ body: rec.body, html: `<!doctype html><p>dashboard ${extra.initial || ''}</p>` }) } },
    AFFERENT_VOICE: relay,
    document: {
      body: page, documentElement: { dataset: {} }, activeElement: null, hidden: false,
      createElement: node, getElementById: id => (id === 'qrPrint' ? printSec : find(page, id)),
      querySelector: () => null, addEventListener() {}, removeEventListener() {},
    },
    matchMedia: () => ({ matches: true }),
    localStorage: { getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v) },
    requestAnimationFrame: () => 0, setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {},
    addEventListener() {}, removeEventListener() {}, innerWidth: 390, innerHeight: 800, devicePixelRatio: 2,
    AbortController: class { constructor() { this.signal = {}; } abort() {} },
    fetch, print: () => printed.push(printSec.children.slice()),
  };
  ctx.window = ctx;
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(HANDOVER, ctx, { filename: 'handover.js' });
  vm.runInContext(SRC, ctx, { filename: 'qrshow.js' });
  ctx.A.QRShow.init({ pid: 'anna', hub });
  return { A: ctx.A, page, printSec, printed, sent, matrices, storage };
}

async function sheet(opts) {
  const env = load(opts);
  env.A.QRShow.open();
  await flush();
  env.items = byClass(env.page, 'qs-list')[0].children.map(li => text(li).trim());
  env.note = find(env.page, 'qsNote');
  return env;
}

async function tap(env, id) {
  find(env.page, id).onclick();
  await flush();
  return env;
}

const relayOk = [/\/share$/, { status: 201, reply: { id: ID, expires: '2026-11-21T20:00:00Z', revoke: 'revoke-token-xyz' } }];
const hubOk = [/\/api\/export\/publish$/, { reply: { ok: true, url: '/api/export/dashboard', share_url: '/shared/HubShareId1234567890ab' } }];
const measured = () => ({
  weekly: { pulse_bpm: [null, null, 71.2, 69.8, null, 72.4, 70.1, 68.9], breathing_per_min: [null, null, 12.4, 11.9, null, 13.1, 12.2, 11.6], rmssd_ms: [null, null, 41.5, 38.2, null, null, 44.9, 47.3] },
  days: { pulse_bpm: 21, breathing_per_min: 21, rmssd_ms: 17 },
  simulated: { pulse_bpm: false, breathing_per_min: false, rmssd_ms: false },
});
const WORDS = /\b(stress\w*|strain\w*|normal|abnormal|elevated|worse|better|risk\w*|healthy|good|bad|high|low|diagnos\w*|should|recommend\w*|live)\b/i;

(async () => {
  await test('sheet: lists what the dashboard behind the code holds', async () => {
    const s = await sheet({ body: { ...fixture(), vitals: measured() } });
    assert.strictEqual(text(byClass(s.page, 'qs-sub')[0]), 'The code opens a dashboard with');
    assert.deepStrictEqual(s.items, [
      '8 weeks of mornings: lanterns, play and the measures from play',
      'Weekly pulse, breathing rate and HRV (RMSSD) from the finger sensor',
      'Bedroom temperature and humidity at night, when measured',
      'Check-in totals, and safety answers as levels',
      'How complete the data is',
      'No name. No camera images. No pulse traces, only weekly numbers.',
    ]);
    for (const t of [...s.items, s.note.textContent]) assert.ok(!WORDS.test(t), t);
  });

  await test('sheet: the finger sensor line follows the weeks, and marks simulated numbers', async () => {
    assert.strictEqual((await sheet()).items[1], 'No finger sensor numbers: no reading in these weeks');
    const old = fixture();
    delete old.vitals;
    assert.strictEqual((await sheet({ body: old })).items[1], 'No finger sensor numbers: no reading in these weeks');
    const part = measured();
    part.weekly.breathing_per_min = Array(8).fill(null);
    part.weekly.rmssd_ms = Array(8).fill(0);
    assert.strictEqual((await sheet({ body: { ...fixture(), vitals: part } })).items[1], 'Weekly pulse from the finger sensor');
    const sim = measured();
    sim.simulated.rmssd_ms = true;
    assert.strictEqual((await sheet({ body: { ...fixture(), vitals: sim } })).items[1], 'Weekly pulse, breathing rate and HRV (RMSSD) from the finger sensor (simulated)');
  });

  await test('sheet: the note says how the link will travel', async () => {
    const relay = await sheet();
    assert.strictEqual(relay.note.attrs['data-way'], 'relay');
    assert.strictEqual(relay.note.textContent, 'The code is a link to this dashboard. It is locked on this phone, and only the code holds the key. The link lasts 7 days, and you can take it back in Settings.');
    const hub = await sheet({ relay: null });
    assert.strictEqual(hub.note.textContent, 'The code is a link to this dashboard on your home hub. It opens on your home network only.');
    const none = await sheet({ relay: null, hub: null });
    assert.strictEqual(none.note.attrs['data-way'], 'file');
  });

  await test('show code: the code is the relay link with the key after #, no data code is made', async () => {
    const s = await tap(await sheet({ routes: [relayOk] }), 'qsShow');
    const v = find(s.page, 'qrView');
    assert.ok(v, 'the code view is up');
    assert.strictEqual(v.attrs['data-kind'], 'relay');
    assert.strictEqual(s.matrices.length, 1);
    const [link] = s.matrices;
    assert.match(link, new RegExp(`^${RELAY}/d/${ID}#[A-Za-z0-9_-]{43}$`));
    assert.ok(!link.startsWith('AF1'), 'not a data code');
    assert.strictEqual(find(s.page, 'qvWhere').textContent, 'Open until Sat 21 Nov');
    assert.match(find(s.page, 'qvHow').innerHTML, /Only this code holds the key/);
    assert.strictEqual(find(s.page, 'qvRevoke').hidden, false);
    const up = s.sent.filter(r => r.url.endsWith('/share'));
    assert.strictEqual(up.length, 1);
    const key = link.split('#')[1];
    assert.ok(!Buffer.from(up[0].body).toString('latin1').includes('dashboard') && !up[0].url.includes(key), 'locked bytes up, key kept');
    const logged = JSON.parse(s.storage.get('afferent.qrshown.anna'))[0];
    assert.deepStrictEqual([logged.kind, logged.id, logged.revoke, logged.base], ['relay', ID, 'revoke-token-xyz', RELAY]);
    assert.ok(!JSON.stringify(logged).includes(key), 'the key is not kept on the phone either');
  });

  await test('relay away: the hub link, labelled for this network only, without the pairing token', async () => {
    const s = await tap(await sheet({ routes: [[/\/share$/, { throws: true }], hubOk] }), 'qsShow');
    const v = find(s.page, 'qrView');
    assert.strictEqual(v.attrs['data-kind'], 'hub');
    assert.deepStrictEqual(s.matrices, ['http://192.168.1.20:8000/shared/HubShareId1234567890ab']);
    assert.strictEqual(find(s.page, 'qvWhere').textContent, 'On this network only');
    assert.match(find(s.page, 'qvHow').innerHTML, /same Wi-Fi as your hub/);
    assert.strictEqual(find(s.page, 'qvRevoke').hidden, true);
    assert.strictEqual(JSON.parse(s.storage.get('afferent.qrshown.anna'))[0].kind, 'hub');
  });

  await test('no relay and no hub: no code; the dashboard is offered as a file', async () => {
    const s = await tap(await sheet({ relay: null, hub: null }), 'qsShow');
    assert.strictEqual(find(s.page, 'qrView'), null);
    assert.strictEqual(s.matrices.length, 0);
    const box = find(s.page, 'qsFile');
    assert.strictEqual(box.hidden, false);
    assert.match(text(box), /No link could be made just now/);
    assert.ok(find(s.page, 'qsSave'), 'Save file is there');
    assert.strictEqual(s.storage.get('afferent.qrshown.anna'), undefined, 'nothing logged as shown');
  });

  await test('take back from the code view: the link stops, the code fades, a new one can be made', async () => {
    const s = await tap(await sheet({ routes: [relayOk, [new RegExp(`/d/${ID}$`), { status: 204, reply: null }]] }), 'qsShow');
    await tap(s, 'qvRevoke');
    const del = s.sent.find(r => r.method === 'DELETE');
    assert.deepStrictEqual(JSON.parse(JSON.stringify([del.url, del.headers])), [`${RELAY}/d/${ID}`, { 'X-Revoke-Token': 'revoke-token-xyz' }]);
    assert.ok(find(s.page, 'qrView').classList.contains('expired'));
    assert.strictEqual(find(s.page, 'qvWhere').textContent, 'Taken back. The link no longer opens.');
    assert.strictEqual(find(s.page, 'qvAgain').hidden, false);
    const logged = JSON.parse(s.storage.get('afferent.qrshown.anna'))[0];
    assert.strictEqual(logged.revoked, true);
    assert.strictEqual(logged.revoke, undefined, 'the revoke token is dropped once used');
  });

  await test('Settings lists what was shared, with Take back while the link is open', async () => {
    const page = node('ul');
    page.attrs.id = 'qrLog';
    const storage = new Map([['afferent.qrshown.anna', JSON.stringify([
      { t: '2026-11-14T20:00:00Z', kind: 'relay', id: ID, base: RELAY, revoke: 'r1', expires: '2099-11-21T20:00:00Z', from: '2026-09-20', to: '2026-11-14' },
      { t: '2026-11-13T20:00:00Z', kind: 'hub', from: '2026-09-20', to: '2026-11-13' },
      { t: '2026-11-01T20:00:00Z', from: '2026-09-01', to: '2026-11-01' },
    ])]]);
    const env = load({ storage, routes: [[new RegExp(`/d/${ID}$`), { status: 204, reply: null }]] });
    env.page.append(page);
    env.A.QRShow.init({ pid: 'anna', hub: HUB });
    const rows = page.children.map(text);
    assert.match(rows[0], /^Shared with your doctor · .+ · open until \w{3} 21 Nov Take back$/);
    assert.match(rows[1], /^Shown on your home network · /);
    assert.match(rows[2], /^Shown to your doctor · /);
    const take = byClass(page, 'qr-take')[0];
    take.onclick();
    await flush();
    assert.match(text(page.children[0]), / · taken back$/);
    assert.strictEqual(byClass(page, 'qr-take').length, 0);
  });

  await test('print: the link code and when it ends, no table of numbers', async () => {
    const s = await tap(await sheet({ body: { ...fixture(), vitals: measured() }, routes: [relayOk] }), 'qsPrint');
    assert.strictEqual(s.printed.length, 1, 'printed once');
    const texts = s.printSec.children.map(text);
    assert.ok(texts.includes('Dashboard link for your clinic'));
    assert.ok(texts.includes('SIMULATED DATA'), 'the demo patient stays marked');
    assert.ok(texts.some(t => /^It is locked, and only this code holds the key\. Open until 21 November 2026\.$/.test(t)), texts.join('\n'));
    assert.ok(texts.some(t => t.startsWith('Data from')));
    assert.strictEqual(byClass(s.printSec, 'qp-vit').length, 0);
    assert.ok(!texts.join(' ').includes('71.2'), 'no numbers on paper');
    assert.match(s.matrices[0], /\/d\/AbCdEfGhIjKlMnOpQrStUv#/);
    for (const t of texts) assert.ok(!WORDS.test(t), t);
  });

  await test('the initial goes on the dashboard', async () => {
    const s = await sheet({ routes: [relayOk] });
    find(s.page, 'qsIni').value = 'AB';
    await tap(s, 'qsShow');
    const key = s.matrices[0].split('#')[1];
    const up = s.sent.find(r => r.url.endsWith('/share'));
    const back = await require('../js/handover.js').unseal(up.body, key);
    assert.strictEqual(back.html, '<!doctype html><p>dashboard AB</p>');
  });

  for (const [s, name, e] of results) console.log(`${s} ${name}${e ? '\n  ' + (e.stack || e) : ''}`);
  const failed = results.filter(r => r[0] === 'FAIL').length;
  console.log(`${results.length - failed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
