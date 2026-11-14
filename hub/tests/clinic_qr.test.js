const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const ROOT = path.join(__dirname, '..', '..');
const QR = require(path.join(ROOT, 'demo', 'js', 'qrpayload.js'));
const ctx = { Math, JSON, Number, String, Array, Object, Date };
ctx.window = ctx;
ctx.A = { QR };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'hub', 'afferent_hub', 'web', 'clinic', 'qrdecode.js'), 'utf8'), ctx);

const body = JSON.parse(fs.readFileSync(path.join(ROOT, 'contracts', 'fixtures', 'qr_body_anna.json'), 'utf8'));
const NOW = Date.parse('2026-11-15T10:12:00+02:00');
const key = QR.newKey();
let r;
do r = QR.encode(body, { key, now: NOW }); while (!r.text.slice(4, -1).includes(' '));
const now = NOW / 1000;
assert.strictEqual(ctx.C.qr.decode(r.text + '\r\n', now).status, 'ok');
const data = r.text.slice(4), cut = data.indexOf(' ') + 1;
const c = ctx.C.qr.collector();
assert.strictEqual(c.add(`AF1/1/2/SPCE:${data.slice(0, cut)}`).status, 'part');
const done = c.add(`AF1/2/2/SPCE:${data.slice(cut)}\n`);
assert.strictEqual(done.status, 'complete');
assert.strictEqual(ctx.C.qr.decode(done.text, now).status, 'ok');
const scan = fs.readFileSync(path.join(ROOT, 'hub', 'afferent_hub', 'web', 'clinic', 'scan.js'), 'utf8');
assert.ok(!/parts\.add\([^)]*\.trim\(\)/.test(scan) && !/replace\(\/\[\\r\\n\]\+\/g, ''\)\.trim\(\)/.test(scan), 'scan.js trims scanned text');
console.log('ok clinic scan keeps a part that ends in a space');
