const fs = require('fs');
const path = require('path');
const assert = require('assert');
const QR = require('../js/qrpayload.js');
const jsQR = require('../vendor/qr/jsQR.js');

const ROOT = path.join(__dirname, '..', '..');
const fixture = () => JSON.parse(fs.readFileSync(path.join(ROOT, 'contracts', 'fixtures', 'qr_body_anna.json'), 'utf8'));
const NOW = Date.parse('2026-11-15T10:12:00+02:00');
const key = QR.newKey();
const results = [];
const test = (name, fn) => {
  try { fn(); results.push(['ok', name]); } catch (e) { results.push(['FAIL', name, e]); }
};
const Q = Object.fromEntries([['composite', 100], ...QR.FEATURES]);

function worstCase() {
  const j = fixture();
  j.phq.history = Array.from({ length: 12 }, (_, i) => ({ day: i * 14 - 100, total: 20 + (i % 7), phq8_total: 18 + (i % 6), band: 'severe', early: i % 2 === 0 }));
  j.phq.overdue = true;
  j.phq.last_status = 'stopped';
  j.safety = Array.from({ length: 8 }, (_, i) => ({ day: 56 - i * 20, minute: 1000 + i * 37, tier: ['high', 'moderate', 'incomplete', 'low', 'not_answered'][i % 5], source: i % 2 ? 'cssrs' : 'item9_fallback', screen: ['crisis', 'support', 'saved', 'thank_you'][i % 4], c6_repeat: i % 3 === 0 }));
  j.talk = Array.from({ length: 10 }, (_, i) => ({ day: 56 - i * 5, minute: 1200 + i * 13 }));
  j.pauses = [{ from_day: 3, until_day: 9, source: 'patient' }, { from_day: 20, until_day: 33, source: 'clinician' }, { from_day: 50, until_day: 51, source: 'patient' }];
  j.cusum.history = Array.from({ length: 10 }, (_, i) => ({ day: i * 5 + 1, state: QR.STATES[i % 4] }));
  j.omitted = { safety_entries: 3, talk_requests: 7, phq_totals: 4 };
  return j;
}

function near(actual, expected, q, where) {
  if (expected === null || expected === undefined) return assert.strictEqual(actual, null, where);
  assert.ok(Math.abs(actual - expected) <= 0.5 / q + 1e-9, `${where}: ${actual} vs ${expected}`);
}

test('base45 matches the RFC 9285 vectors', () => {
  const t = s => QR.base45.encode(new TextEncoder().encode(s));
  assert.strictEqual(t('AB'), 'BB8');
  assert.strictEqual(t('Hello!!'), '%69 VD92EX0');
  assert.strictEqual(t('base-45'), 'UJCLQE7W581');
  assert.strictEqual(new TextDecoder().decode(QR.base45.decode('QED8WEX0')), 'ietf!');
  assert.throws(() => QR.base45.decode('GGW'));
  assert.throws(() => QR.base45.decode('ab'));
  assert.throws(() => QR.base45.decode('BB8B'));
});

test('cbor is deterministic and strict', () => {
  const { encode, decode, Tag } = QR.cbor;
  const pub = new Uint8Array(33).fill(2);
  const h = encode(new Map([[-65537, pub], [1, -7]]));
  assert.deepStrictEqual([...h.slice(0, 10)], [0xa2, 0x01, 0x26, 0x3a, 0x00, 0x01, 0x00, 0x00, 0x58, 0x21]);
  assert.deepStrictEqual([...encode(new Tag(18, [1]))], [0xd2, 0x81, 0x01]);
  assert.deepStrictEqual([...encode(new Map([[-65601, 1]]))], [0xa1, 0x3a, 0x00, 0x01, 0x00, 0x40, 0x01]);
  const big = 2 ** 40 + 5;
  assert.strictEqual(decode(encode(big)), big);
  assert.strictEqual(decode(encode(-big)), -big);
  assert.strictEqual(decode(encode('lantern ä')), 'lantern ä');
  assert.throws(() => encode(1.5));
  for (const bad of [[0xf9, 0x3c, 0x00], [0x18, 0x05], [0x9f, 0x01, 0xff], [0xa2, 0x02, 0x00, 0x01, 0x00], [0x01, 0x01],
    [0xa2, 0x01, 0x00, 0x01, 0x00], [0xc1, 0x01], [0x62, 0xff, 0xfe], [0x81, 0x81, 0x81, 0x81, 0x81, 0x01]]) {
    assert.throws(() => decode(Uint8Array.from(bad), 4), `${bad}`);
  }
});

test('round trip: encode, decode, verify, same body', () => {
  const j = fixture();
  const r = QR.encode(j, { key, now: NOW, initial: 'a.' });
  assert.ok(r.text && r.text.startsWith('AF1:') && r.parts.length === 1);
  assert.strictEqual(r.exp - r.iat, 600);
  assert.match(r.fingerprint, /^[0-9A-HJKMNP-TV-Z]{4} [0-9A-HJKMNP-TV-Z]{4} [0-9A-HJKMNP-TV-Z]{4}$/);
  const d = QR.decode(r.text, { now: NOW + 60e3 });
  assert.strictEqual(d.status, 'ok');
  assert.strictEqual(d.verified, true);
  assert.strictEqual(d.fingerprint, r.fingerprint);
  assert.strictEqual(d.fingerprint, QR.fingerprint(key.public));
  assert.strictEqual(d.cti, r.cti);
  const b = d.body;
  assert.strictEqual(b.ini, 'A');
  assert.strictEqual(b.sim, true);
  assert.deepStrictEqual(b.period, j.period);
  assert.deepStrictEqual(b.mornings, j.mornings);
  assert.deepStrictEqual(b.state, j.state);
  assert.deepStrictEqual(b.phq, j.phq);
  assert.deepStrictEqual(b.safety, j.safety);
  assert.deepStrictEqual(b.talk, j.talk);
  assert.deepStrictEqual(b.pauses, j.pauses);
  assert.deepStrictEqual(b.sensors, j.sensors);
  assert.deepStrictEqual(b.cusum.history, j.cusum.history);
  near(b.cusum.value, j.cusum.value, 100, 'cusum');
  for (const k of ['value', 'trend_7d', 'completeness']) near(b.composite[k], j.composite[k], 100, k);
  assert.deepStrictEqual(b.contrib.map(c => c.key), j.contrib.map(c => c.key));
  b.contrib.forEach((c, i) => near(c.contribution, j.contrib[i].contribution, 1000, c.key));
  for (const [k, q] of Object.entries(Q)) b.weekly[k].forEach((v, i) => near(v, j.weekly[k][i], q, `weekly.${k}[${i}]`));
  for (const [k, q] of QR.FEATURES) {
    if (!j.baseline[k]) assert.strictEqual(b.baseline[k], null);
    else { near(b.baseline[k].median, j.baseline[k].median, q, k); near(b.baseline[k].scale, j.baseline[k].scale, q, k); }
    near(b.complete.by_feature[k], j.complete.by_feature[k], 100, k);
  }
  for (const k of ['played_days', 'sessions_7d', 'days_7d', 'missed_7d', 'paused_days']) assert.strictEqual(b.complete[k], j.complete[k]);
  assert.strictEqual(b.omitted, undefined);
});

test('byte budget: anna at version 20 or lower, worst case at 22 or lower, both at M in one code', () => {
  const a = QR.encode(fixture(), { key, now: NOW });
  const w = QR.encode(worstCase(), { key, now: NOW, initial: 'ABC' });
  console.log(`  anna: ${a.chars} chars, version ${a.versions[0]} ${a.ecl}; worst case: ${w.chars} chars, version ${w.versions[0]} ${w.ecl}, shrink ${w.shrink}`);
  assert.strictEqual(a.ecl, 'M');
  assert.ok(a.versions[0] <= 20, `anna version ${a.versions[0]}`);
  assert.ok(a.chars <= 970);
  assert.strictEqual(w.parts.length, 1);
  assert.strictEqual(w.shrink, 0);
  assert.ok(w.versions[0] <= 22 && w.chars <= QR.CAP_CHARS, `worst case version ${w.versions[0]}`);
  const d = QR.decode(w.text, { now: NOW });
  assert.strictEqual(d.body.safety.length, 8);
  assert.strictEqual(d.body.talk.length, 10);
  assert.strictEqual(d.body.phq.history.length, 8);
  assert.deepStrictEqual(d.body.phq.history.map(h => h.day), worstCase().phq.history.slice(-8).map(h => h.day));
  assert.deepStrictEqual(d.body.omitted, { safety_entries: 3, talk_requests: 7, phq_totals: 8 });
});

test('over the cap: talk then PHQ shrink, safety never dropped, then chunks', () => {
  const full = QR.encode(worstCase(), { key, now: NOW });
  const r = QR.encode(worstCase(), { key, now: NOW, maxChars: full.chars - 20 });
  assert.ok(r.shrink >= 1 && r.parts.length === 1);
  const d = QR.decode(r.text, { now: NOW });
  assert.strictEqual(d.body.talk.length, 5);
  assert.strictEqual(d.body.safety.length, 8);
  assert.strictEqual(d.body.omitted.talk_requests, 12);
  const c = QR.encode(worstCase(), { key, now: NOW, maxChars: 400 });
  assert.ok(c.text === null && c.parts.length >= 2 && c.parts.length <= 3);
  assert.ok(c.parts.every(p => p.length <= 400 && /^AF1\/[1-3]\/[23]\/[0-9A-Z]{4}:/.test(p)));
  const col = new QR.Collector();
  const rev = [...c.parts].reverse();
  const steps = rev.map(p => col.add(p));
  assert.deepStrictEqual(steps.slice(0, -1).map(s => s.status), Array(rev.length - 1).fill('part'));
  assert.strictEqual(steps[0].have, 1);
  const last = steps[steps.length - 1];
  assert.strictEqual(last.status, 'complete');
  const back = QR.decode(last.text, { now: NOW });
  assert.strictEqual(back.status, 'ok');
  assert.deepStrictEqual(back.body.safety, worstCase().safety);
  assert.strictEqual(QR.decode(rev, { now: NOW }).status, 'ok');
  assert.throws(() => QR.encode(worstCase(), { key, now: NOW, maxChars: 150 }), /too_large/);
});

test('tamper: a changed character never yields a different verified body', () => {
  const r = QR.encode(fixture(), { key, now: NOW });
  const original = JSON.stringify(QR.decode(r.text, { now: NOW }).body);
  const B45 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';
  let damaged = 0, same = 0;
  for (let i = 4; i < r.text.length; i++) {
    for (const step of [1, 12, 30]) {
      const t = r.text.slice(0, i) + B45[(B45.indexOf(r.text[i]) + step) % 45] + r.text.slice(i + 1);
      const d = QR.decode(t, { now: NOW });
      if (d.status === 'damaged') {
        assert.strictEqual(d.verified, false);
        assert.strictEqual(d.body, undefined);
        damaged++;
      } else {
        assert.strictEqual(d.status, 'ok', `index ${i}: ${d.status}`);
        assert.strictEqual(JSON.stringify(d.body), original);
        same++;
      }
    }
  }
  console.log(`  tamper: ${damaged} damaged, ${same} inflate to the same signed bytes`);
  assert.ok(same / (damaged + same) < 0.005);
  assert.strictEqual(QR.decode('HC1:NCFOXN', { now: NOW }).status, 'not_ours');
  assert.strictEqual(QR.decode('https://example.org', { now: NOW }).status, 'not_ours');
  assert.strictEqual(QR.decode(r.text.slice(0, -3), { now: NOW }).status, 'damaged');
  const other = QR.newKey();
  const forged = QR.encode(fixture(), { key: { secret: other.secret, public: key.public }, now: NOW });
  assert.strictEqual(QR.decode(forged.text, { now: NOW }).reason, 'signature');
});

test('freshness: expired, future clock, paper validity', () => {
  const r = QR.encode(fixture(), { key, now: NOW });
  const late = QR.decode(r.text, { now: NOW + 11 * 60e3 });
  assert.strictEqual(late.status, 'expired');
  assert.ok(late.verified && late.body.safety.length);
  const early = QR.decode(r.text, { now: NOW - 11 * 60e3 });
  assert.strictEqual(early.status, 'future');
  assert.strictEqual(QR.decode(r.text, { now: NOW - 9 * 60e3 }).status, 'ok');
  const p = QR.encode(fixture(), { key, now: NOW, paper: true });
  assert.strictEqual(p.exp - p.iat, 30 * 86400);
  assert.strictEqual(p.ecl, 'Q');
  assert.ok(p.versions[0] <= 22);
  assert.strictEqual(QR.decode(p.text, { now: NOW + 29 * 86400e3 }).status, 'ok');
  const w = QR.encode(worstCase(), { key, now: NOW, paper: true });
  assert.strictEqual(w.ecl, 'M');
  const a = QR.encode(fixture(), { key, now: NOW });
  assert.notStrictEqual(a.cti, r.cti);
});

test('nothing raw travels: forbidden keys and names never reach the code', () => {
  const j = fixture();
  Object.assign(j, { patient_id: 'anna', display_name: 'Anna', phq9_9: 3, cssrs: { items: { c4: 'yes' } }, checkins: [{ x: 1 }] });
  j.safety[0] = { ...j.safety[0], item9: 3, phq9_9: 3, cssrs: { c6: 'yes' } };
  j.phq.history[0] = { ...j.phq.history[0], items: { phq9_9: 3 } };
  const r = QR.encode(j, { key, now: NOW });
  const d = QR.decode(r.text, { now: NOW });
  const text = JSON.stringify(d.body);
  for (const k of QR.FORBIDDEN) assert.ok(!text.includes(`"${k}"`), k);
  assert.ok(!text.includes('Anna') && !text.includes('anna') && !text.includes('yes'));
  const bin = Buffer.from(QR.cbor.encode(d.packed)).toString('latin1');
  assert.ok(!bin.includes('Anna') && !bin.includes('anna') && !bin.includes('phq9'));
  assert.ok([...d.packed.keys()].every(k => Number.isInteger(k) && k >= 0 && k <= 17));
});

test('scan: jsQR reads the drawn matrix at 3 px per module', () => {
  for (const [j, ecl] of [[fixture(), 'M'], [worstCase(), 'M'], [fixture(), 'Q']]) {
    const r = QR.encode(j, { key, now: NOW, paper: ecl === 'Q' });
    const m = QR.matrix(r.text, r.ecl);
    const px = 3, quiet = 4, side = (m.size + 2 * quiet) * px;
    const data = new Uint8ClampedArray(side * side * 4).fill(255);
    for (let y = 0; y < side; y++) {
      for (let x = 0; x < side; x++) {
        const r0 = Math.floor(y / px) - quiet, c0 = Math.floor(x / px) - quiet;
        if (r0 >= 0 && c0 >= 0 && r0 < m.size && c0 < m.size && m.isDark(r0, c0)) {
          const o = (y * side + x) * 4;
          data[o] = 14; data[o + 1] = 26; data[o + 2] = 46;
        }
      }
    }
    const got = jsQR(data, side, side);
    assert.ok(got, `no decode for version ${m.version} ${m.ecl}`);
    assert.strictEqual(got.data, r.text);
    assert.strictEqual(QR.decode(got.data, { now: NOW }).status, 'ok');
  }
});

test('initial accepts only up to 3 letters', () => {
  assert.strictEqual(QR.cleanInitial('a.b-c d'), 'ABC');
  assert.strictEqual(QR.cleanInitial('12'), null);
  const d = QR.decode(QR.encode(fixture(), { key, now: NOW, initial: '' }).text, { now: NOW });
  assert.strictEqual(d.body.ini, undefined);
});

for (const [s, name, e] of results) console.log(`${s} ${name}${e ? '\n  ' + (e.stack || e) : ''}`);
const failed = results.filter(r => r[0] === 'FAIL').length;
console.log(`${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
