// Run: node hub/tests/clinic_expressiveness.test.js
// Expressiveness (smiling and facial movement against the patient's own first weeks) in an imported patient code:
// a Drivers row and a Measures tile when the code carries it; nothing when the patient has no face numbers or the
// code was made before map key 20.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const ROOT = path.join(__dirname, '..', '..');
const WEB = path.join(ROOT, 'hub', 'afferent_hub', 'web', 'clinic');
const FIX = path.join(ROOT, 'contracts', 'fixtures');
const QR = require(path.join(ROOT, 'demo', 'js', 'qrpayload.js'));
const json = (f) => JSON.parse(fs.readFileSync(path.join(FIX, f), 'utf8'));
const count = (s, sub) => s.split(sub).length - 1;
const NOW = Date.parse('2026-11-15T10:12:00+02:00');
const E = 'expressiveness';
const key = QR.newKey();
// names a feeling (demo/tests/face.test.js): the clinic says what the face did, never how the person feels
const FEELING = /\b(sad|sadness|angry|anger|contempt|disgust|disgusted|surprise|surprised|happy|happiness|fear|afraid|emotion|emotions|emotional|mood|moods|expression|expressions|diagnos\w*|depress\w*|anxi\w*)\b/i;

const ctx = { Math, JSON, Number, String, Array, Object, Date, Set, Map, console };
ctx.window = ctx;
ctx.AfferentQR = QR;
ctx.document = { documentElement: {}, getElementById: () => null };
ctx.getComputedStyle = () => ({ getPropertyValue: () => '#123456' });
vm.createContext(ctx);
for (const f of ['charts.js', 'signals.js', 'views.js', 'qrdecode.js', 'imported.js']) vm.runInContext(fs.readFileSync(path.join(WEB, f), 'utf8'), ctx);
const C = ctx.C, V = C.views;
C.scanFmt = { day: () => '15 Nov', when: () => '15 Nov 10:13' };
const imports = new Map();
C.codes = { all: () => [...imports.values()], get: (cti) => imports.get(cti), label: () => 'A.', key: () => null };

function show(d) {
  assert.strictEqual(d.status, 'ok', d.reason);
  const imp = { cti: d.cti, fp: d.fingerprint, iat: d.iat, exp: d.exp, scanned_iso: new Date(NOW).toISOString(), body: d.body };
  imports.clear();
  imports.set(imp.cti, imp);
  return { imp, page: V.exportDetail({ ui: { q: '' } }, imp.cti) };
}
const scan = (body) => show(QR.decode(QR.encode(body, { key, now: NOW }).text, { now: NOW }));
const section = (page, h2) => { const m = new RegExp(`<section><div class="sect-h"><h2>${h2}</h2>[\\s\\S]*?</section>`).exec(page); return m ? m[0] : ''; };
const driverRows = (page) => [...section(page, 'Drivers').matchAll(/<div class="mrow"><span>([^<]*)<\/span>[\s\S]*?<span class="mt num">([^<]*)<\/span><\/div>/g)].map((m) => [m[1], m[2]]);
const tiles = (page) => [...page.matchAll(/id="mm-([a-z_]+)"/g)].map((m) => m[1]);
const draw = (imp) => {
  const charts = [];
  ctx.document.getElementById = (id) => ({ id });
  C.seriesChart = (el, o) => charts.push({ id: el.id, o });
  V.drawImported({}, imp.cti);
  ctx.document.getElementById = () => null;
  return Object.fromEntries(charts.map((c) => [c.id, c.o]));
};

// the codec names the tenth driver for the clinic, after the nine first ones
assert.deepStrictEqual([...C.qr.FEATURES], [...QR.FEATURES.map((f) => f[0]), E]);

// 1. Anna's code carries it: a Drivers row with its contribution, a Measures tile with the usual band
{
  const j = json('qr_body_anna.json');
  const mine = j.contrib.find((c) => c.key === E);
  assert.ok(mine && j.weekly[E].some((v) => v != null) && j.baseline[E], 'the fixture carries expressiveness');
  const { imp, page } = scan(j);
  const rows = driverRows(page);
  assert.strictEqual(rows.length, j.contrib.length, 'every driver with a contribution has a row, the tenth included');
  const row = rows.find(([label]) => label === 'Expressiveness');
  assert.ok(row, 'Expressiveness row');
  assert.strictEqual(row[1], (mine.contribution > 0 ? '+' : '−') + Math.abs(mine.contribution).toFixed(2));
  const order = rows.map(([, v]) => Math.abs(parseFloat(v.replace('−', '-'))));
  assert.deepStrictEqual(order, [...order].sort((a, b) => b - a), 'largest first');
  assert.ok(section(page, 'Drivers').includes('<i class="" style="width:'), 'a driver that raises the index has the amber bar');
  assert.ok(tiles(page).includes(E) && tiles(page).length === 10);
  const tile = /<div class="mm"><div class="mm-h"><span>Expressiveness<\/span>[\s\S]*?<\/div><div class="chart-wrap" id="mm-expressiveness"><\/div><\/div>/.exec(page);
  assert.ok(tile, 'Expressiveness tile');
  const last = j.weekly[E].filter((v) => v != null).pop();
  assert.ok(tile[0].includes('<span class="xchip">exploratory</span>') && tile[0].includes(`${last.toFixed(2)}<small> × usual</small>`), tile[0]);
  assert.ok(/data-tip="[^"]*Expressiveness \d+%/.test(page), 'its share of days is in the Complete tip');
  const charts = draw(imp);
  const o = charts['mm-expressiveness'];
  assert.ok(o, 'its sparkline is drawn');
  assert.deepStrictEqual([...o.values], j.weekly[E].map((v) => (v == null ? null : Math.round(v * 100) / 100)));
  const b = imp.body.baseline[E];
  assert.ok(Math.abs(b.median - j.baseline[E].median) <= 0.005 && Math.abs(b.scale - j.baseline[E].scale) <= 0.005, 'usual level in hundredths');
  assert.deepStrictEqual([...o.band], [b.median - b.scale, b.median + b.scale]);
  assert.strictEqual(o.mid, b.median);
  assert.ok(o.aria.startsWith('Expressiveness'));
  for (const text of [row[0], tile[0].replace(/<[^>]*>/g, ' '), o.aria, o.tip(7)]) assert.ok(!FEELING.test(text), `names a feeling: ${text}`);
}

// 2. No face numbers (no TrueDepth camera, Phone camera off): no row, no tile, no share; the index is the other nine
{
  const j = json('qr_body_anna.json');
  j.weekly[E] = Array(8).fill(null);
  j.baseline[E] = null;
  j.complete.by_feature[E] = 0;
  j.contrib = j.contrib.filter((c) => c.key !== E);
  const { imp, page } = scan(j);
  assert.ok(!page.includes('Expressiveness'), 'nothing about it on the page');
  assert.strictEqual(driverRows(page).length, j.contrib.length);
  assert.deepStrictEqual(tiles(page).sort(), QR.FEATURES.map((f) => f[0]).sort());
  assert.ok(!('mm-expressiveness' in draw(imp)));
}

// 3. A code from before map key 20 renders as it did: nine tiles, nine rows, no Expressiveness
{
  const f = json('qr_code_before_expressiveness.json');
  const { imp, page } = show(QR.decode(f.text, { now: f.now_ms }));
  assert.ok(page.includes('Early-warning index') && page.includes('<h2>Measures</h2>'));
  assert.ok(!page.includes('Expressiveness'));
  assert.strictEqual(tiles(page).length, 9);
  assert.strictEqual(driverRows(page).length, f.body.contrib.length);
  assert.strictEqual(Object.keys(draw(imp)).filter((k) => k.startsWith('mm-')).length, 9);
}

// 4. The older code of all, before the finger sensor numbers, also still renders
{
  const f = json('qr_code_before_vitals.json');
  const { page } = show(QR.decode(f.text, { now: f.now_ms }));
  assert.ok(page.includes('<h2>Drivers</h2>') && !page.includes('Expressiveness') && tiles(page).length === 9);
}

assert.strictEqual(count(fs.readFileSync(path.join(WEB, 'imported.js'), 'utf8'), "'Expressiveness'"), 1);
console.log('clinic expressiveness: ok');
