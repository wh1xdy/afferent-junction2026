// Run: node hub/tests/clinic_imported_state.test.js [qr-body.json]
// A patient code that carries no state (the home hub before the first session, afferent_hub/home.py) must reach the
// clinic as "Not enough data yet": the phone's codec keeps the missing state missing, and the import page does not
// turn it into Stable. With a path, that QR body (from the hub) is used; without, the fixture with its state removed.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const ROOT = path.join(__dirname, '..', '..');
const WEB = path.join(ROOT, 'hub', 'afferent_hub', 'web', 'clinic');
const QR = require(path.join(ROOT, 'demo', 'js', 'qrpayload.js'));
const fixture = () => JSON.parse(fs.readFileSync(path.join(ROOT, 'contracts', 'fixtures', 'qr_body_anna.json'), 'utf8'));
const NOW = Date.parse('2026-11-15T10:12:00+02:00');
const key = QR.newKey();

const ctx = { Math, JSON, Number, String, Array, Object, Date, Set, Map, console };
ctx.window = ctx;
ctx.document = { documentElement: {}, getElementById: () => null };
ctx.getComputedStyle = () => ({ getPropertyValue: () => '#123456' });
vm.createContext(ctx);
for (const f of ['charts.js', 'signals.js', 'views.js', 'imported.js']) vm.runInContext(fs.readFileSync(path.join(WEB, f), 'utf8'), ctx);
const C = ctx.C, V = C.views;
C.qr = { FEATURES: QR.FEATURES.map((f) => f[0]) };
C.scanFmt = { day: () => '15 Nov', when: () => '15 Nov 10:13' };

function scan(body) {
  const r = QR.encode(body, { key, now: NOW });
  const d = QR.decode(r.text, { now: NOW + 60e3 });
  assert.strictEqual(d.status, 'ok');
  const imp = { cti: d.cti, fp: d.fingerprint, iat: Math.floor(NOW / 1000), scanned_iso: new Date(NOW).toISOString(), body: d.body };
  C.codes = { get: () => imp, all: () => [imp], key: () => null, label: () => 'A.' };
  const S = { ui: { q: '' } };
  return { body: d.body, page: V.exportDetail(S, imp.cti), list: V.exportList(S, imp.cti) };
}

const empty = process.argv[2] ? JSON.parse(fs.readFileSync(process.argv[2], 'utf8')) : (() => {
  const j = fixture();
  Object.assign(j.state, { shown: null, cusum: null, phq_state: null, since_day: null });
  j.cusum = { value: null, history: [] };
  j.safety = [];
  j.talk = [];
  j.contrib = [];
  j.phq = { ...j.phq, baseline: null, history: [] };
  return j;
})();
assert.strictEqual(empty.state.shown, null);
const none = scan(empty);
assert.strictEqual(none.body.state.shown, null, 'the code keeps a missing state missing');
assert.strictEqual(none.body.state.cusum, null);
assert.deepStrictEqual(JSON.parse(JSON.stringify(none.body.cusum.history)), []);
for (const html of [none.page, none.list]) {
  assert.ok(html.includes('Not enough data yet'), 'says there is not enough data');
  assert.ok(!html.includes('>Stable<') && !html.includes('All steady'), 'claims no state');
}
assert.ok(none.page.includes('No sessions'));

const full = scan(fixture());                           // a code with a state renders as before
assert.strictEqual(full.body.state.shown, fixture().state.shown);
assert.ok(full.page.includes('Booster review') && !full.page.includes('Not enough data yet'));
const stable = fixture();
Object.assign(stable.state, { shown: 'stable', cusum: 'stable', phq_state: null });
stable.contrib = [];
assert.ok(scan(stable).page.includes('All steady'));

console.log('clinic imported state: ok');
