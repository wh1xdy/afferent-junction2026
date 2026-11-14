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
const VKEYS = QR.VITALS.map(v => v[0]);
const frozen = () => JSON.parse(fs.readFileSync(path.join(ROOT, 'contracts', 'fixtures', 'qr_code_before_vitals.json'), 'utf8'));
const per = v => Object.fromEntries(VKEYS.map((k, i) => [k, typeof v === 'function' ? v(k, i) : v]));
const measured = () => ({
  weekly: { pulse_bpm: [null, null, 71.2, 69.8, null, 72.4, 70.1, 68.9], breathing_per_min: [null, null, 12.4, 11.9, null, 13.1, 12.2, 11.6], rmssd_ms: [null, null, 41.5, 38.2, null, null, 44.9, 47.3] },
  days: { pulse_bpm: 21, breathing_per_min: 21, rmssd_ms: 17 }, simulated: per(false),
});
function largest() {
  let x = 12345;
  const next = () => { x = (x * 1103515245 + 12345) % 2147483648; return 2600 + (x % 39535) / 10; };
  return { weekly: per(() => Array.from({ length: 8 }, next)), days: per(56), simulated: per(true) };
}
const OLD_KEYS = [0, 1, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16];
const OLD_LENGTHS = { 3: 3, 4: 5, 5: 8, 6: 3, 8: 2, 9: 10, 10: 18, 11: 5, 14: 14 };

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
  j.vitals = largest();
  j.room = roomLargest();
  return j;
}
// The bedroom at night (map key 19) at its largest: three-digit tenths and full humidity every week.
const roomLargest = () => ({ weekly: { temp_c_night: [-9.9, 49.9, -9.8, 49.8, 23.4, -7.7, 45.6, 31.1], humidity_pct: [100, 99, 100, 98, 100, 97, 100, 96] }, nights: 56, simulated: true });
const roomMeasured = () => ({ weekly: { temp_c_night: [null, 19.4, 21.6, 22.1, null, 18.7, 20.3, 23.5], humidity_pct: [null, 41, 38, 35, null, 44, 40, 29] }, nights: 31, simulated: false });
const NO_ROOM = { weekly: { temp_c_night: Array(8).fill(null), humidity_pct: Array(8).fill(null) }, nights: 0, simulated: false };

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
  assert.deepStrictEqual(b.vitals, j.vitals);
});

test('finger sensor numbers: round trip with gaps, days and the simulated mark', () => {
  const j = { ...fixture(), vitals: measured() };
  const d = QR.decode(QR.encode(j, { key, now: NOW }).text, { now: NOW });
  assert.strictEqual(d.status, 'ok');
  assert.deepStrictEqual(d.body.vitals, j.vitals);
  assert.deepStrictEqual(Object.keys(d.body.vitals.weekly), ['pulse_bpm', 'breathing_per_min', 'rmssd_ms']);
  assert.ok(VKEYS.every(k => d.body.vitals.weekly[k].length === 8));
  const v = measured();
  v.simulated.rmssd_ms = true;
  const s = QR.decode(QR.encode({ ...fixture(), vitals: v }, { key, now: NOW }).text, { now: NOW }).body.vitals;
  assert.deepStrictEqual(s.simulated, { pulse_bpm: false, breathing_per_min: false, rmssd_ms: true });
  const big = QR.decode(QR.encode({ ...fixture(), vitals: largest() }, { key, now: NOW }).text, { now: NOW }).body.vitals;
  const want = largest();
  for (const k of VKEYS) big.weekly[k].forEach((x, i) => near(x, want.weekly[k][i], 10, `${k}[${i}]`));
  assert.deepStrictEqual(big.simulated, per(true));
  assert.deepStrictEqual(big.days, per(56));
});

test('finger sensor numbers: missing stays missing, never 0', () => {
  const none = fixture();
  delete none.vitals;
  const a = QR.decode(QR.encode(none, { key, now: NOW }).text, { now: NOW });
  assert.strictEqual(a.packed.has(18), false);
  assert.strictEqual('vitals' in a.body, false);
  const empty = { weekly: per(() => Array(8).fill(null)), days: per(0), simulated: per(false) };
  for (const vit of [empty, {}, { weekly: {} }, { weekly: per(() => []), days: per(9), simulated: per(true) }]) {
    const e = QR.decode(QR.encode({ ...fixture(), vitals: vit }, { key, now: NOW }).text, { now: NOW });
    assert.deepStrictEqual(e.packed.get(18), []);
    assert.deepStrictEqual(e.body.vitals, empty);
  }
  const odd = measured();
  odd.weekly.pulse_bpm = [0, -3, NaN, Infinity, '72', undefined, 6553.6, 71.24];
  odd.weekly.breathing_per_min = [0, 0, 0, 0, 0, 0, 0, 0];
  odd.weekly.rmssd_ms = [41.5];
  odd.days.breathing_per_min = 30;
  odd.simulated.breathing_per_min = true;
  const o = QR.decode(QR.encode({ ...fixture(), vitals: odd }, { key, now: NOW }).text, { now: NOW }).body.vitals;
  assert.deepStrictEqual(o.weekly.pulse_bpm, [null, null, null, null, null, null, null, 71.2]);
  assert.deepStrictEqual(o.weekly.breathing_per_min, Array(8).fill(null));
  assert.deepStrictEqual(o.weekly.rmssd_ms, [41.5, null, null, null, null, null, null, null]);
  assert.deepStrictEqual([o.days.breathing_per_min, o.simulated.breathing_per_min], [0, false]);
  assert.ok(VKEYS.every(k => o.weekly[k].every(x => x === null || x > 0)));
});

test('bedroom at night: round trip with gaps, nights and the simulated mark', () => {
  const j = { ...fixture(), room: roomMeasured() };
  const d = QR.decode(QR.encode(j, { key, now: NOW }).text, { now: NOW });
  assert.strictEqual(d.status, 'ok');
  assert.deepStrictEqual(d.body.room, j.room);
  assert.deepStrictEqual(QR.ROOM.map(r => r[0]), ['temp_c_night', 'humidity_pct']);
  assert.deepStrictEqual(QR.decode(QR.encode(fixture(), { key, now: NOW }).text, { now: NOW }).body.room, fixture().room, 'the anna fixture');
  const big = QR.decode(QR.encode({ ...fixture(), room: roomLargest() }, { key, now: NOW }).text, { now: NOW }).body.room;
  assert.deepStrictEqual(big, roomLargest());
  const sim = { ...roomMeasured(), simulated: true };
  assert.strictEqual(QR.decode(QR.encode({ ...fixture(), room: sim }, { key, now: NOW }).text, { now: NOW }).body.room.simulated, true);
});

test('bedroom at night: missing stays missing, a fault is no reading, never 0', () => {
  const none = fixture();
  delete none.room;
  const a = QR.decode(QR.encode(none, { key, now: NOW }).text, { now: NOW });
  assert.strictEqual(a.packed.has(19), false);
  assert.strictEqual('room' in a.body, false);
  for (const r of [NO_ROOM, {}, { weekly: {} }, { weekly: { temp_c_night: [] }, nights: 9, simulated: true }]) {
    const e = QR.decode(QR.encode({ ...fixture(), room: r }, { key, now: NOW }).text, { now: NOW });
    assert.deepStrictEqual(e.packed.get(19), []);
    assert.deepStrictEqual(e.body.room, NO_ROOM);
  }
  const odd = { weekly: { temp_c_night: [-10.01, 50.01, NaN, '20', undefined, 0, -3.25, 19.96], humidity_pct: [-1, 101, 0, 55.5, null, 30, 100, 'x'] }, nights: 99, simulated: false };
  const o = QR.decode(QR.encode({ ...fixture(), room: odd }, { key, now: NOW }).text, { now: NOW }).body.room;
  assert.deepStrictEqual(o.weekly.temp_c_night, [null, null, null, null, null, 0, -3.2, 20]);
  assert.deepStrictEqual(o.weekly.humidity_pct, [null, null, 0, 56, null, 30, 100, null]);
  assert.strictEqual(o.nights, 56);
});

test('bedroom at night: a code from another encoder cannot carry a value out of range', () => {
  const body = QR.pack(fixture());
  body.set(19, [1, 300, [-101, 501, 196, 'x', null, true, 1.5, -100], [101, -1, 31, 0, 100, null, null, null]]);
  const r = QR.unpack(body).room;
  assert.deepStrictEqual(r.weekly.temp_c_night, [null, null, 19.6, null, null, null, null, -10]);
  assert.deepStrictEqual(r.weekly.humidity_pct, [null, null, 31, 0, 100, null, null, null]);
  assert.deepStrictEqual([r.nights, r.simulated], [56, true]);
  for (const bad of [[2, 3, Array(8).fill(null), Array(8).fill(null)], [1, 3, Array(8).fill(null)], [0, 1, [1], Array(8).fill(null)]]) {
    body.set(19, bad);
    assert.throws(() => QR.unpack(body), /body_shape/, JSON.stringify(bad));
  }
});

test('a code with the bedroom at night decodes in a reader from before it', () => {
  const j = { ...fixture(), room: roomMeasured() };
  const p = QR.decode(QR.encode(j, { key, now: NOW }).text, { now: NOW }).packed;
  assert.ok(p.has(19));
  const old = new Map([...p].filter(([k]) => k !== 19));
  const plain = fixture();
  delete plain.room;
  assert.deepStrictEqual(QR.cbor.encode(old), QR.cbor.encode(QR.pack(plain)), 'key 19 is the only addition');
  const { room, ...rest } = QR.unpack(p);
  assert.deepStrictEqual(QR.unpack(old), rest);
  assert.deepStrictEqual(room, j.room);
});

test('codes made before the finger sensor numbers still decode', () => {
  const f = frozen();
  assert.ok(!f.packed_keys.includes(18));
  const d = QR.decode(f.text, { now: f.now_ms });
  assert.strictEqual(d.status, 'ok');
  assert.strictEqual(d.verified, true);
  assert.strictEqual(d.fingerprint, f.fingerprint);
  assert.deepStrictEqual(d.body, f.body);
  assert.strictEqual('vitals' in d.body, false);
  assert.deepStrictEqual([...d.packed.keys()].sort((a, b) => a - b), f.packed_keys);
  const parts = QR.decode([...f.parts].reverse(), { now: f.now_ms });
  assert.strictEqual(parts.status, 'ok');
  assert.strictEqual(parts.fingerprint, f.fingerprint);
  assert.strictEqual('vitals' in parts.body, false);
  for (const k of ['period', 'state', 'safety', 'talk', 'weekly', 'baseline', 'complete', 'sensors']) assert.deepStrictEqual(parts.body[k], f.body[k], k);
  assert.strictEqual(QR.decode(f.text, { now: f.now_ms + 11 * 60e3 }).status, 'expired');
});

test('a code with finger sensor numbers decodes in a reader from before them', () => {
  assert.strictEqual(QR.VERSION, 1);
  assert.strictEqual(QR.FEATURES.length, 9);
  const j = { ...fixture(), vitals: measured() };
  const d = QR.decode(QR.encode(j, { key, now: NOW }).text, { now: NOW });
  const p = d.packed;
  assert.strictEqual(p.get(0), 1);
  assert.ok(p.has(18));
  for (const k of OLD_KEYS) assert.ok(p.has(k), `key ${k}`);
  for (const [k, n] of Object.entries(OLD_LENGTHS)) assert.strictEqual(p.get(+k).length, n, `key ${k}`);
  assert.deepStrictEqual(frozen().packed_keys.filter(k => k !== 2), OLD_KEYS);
  const old = new Map([...p].filter(([k]) => k !== 18));
  const plain = fixture();
  delete plain.vitals;
  assert.deepStrictEqual(QR.cbor.encode(old), QR.cbor.encode(QR.pack(plain)));
  const { vitals, ...rest } = d.body;
  assert.deepStrictEqual(QR.unpack(old), rest);
  assert.deepStrictEqual(vitals, j.vitals);
});

test('byte budget: anna at version 20 or lower, worst case at 22 or lower, both at M in one code', () => {
  const a = QR.encode(fixture(), { key, now: NOW });
  const m = QR.encode({ ...fixture(), vitals: measured() }, { key, now: NOW });
  const w = QR.encode(worstCase(), { key, now: NOW, initial: 'ABC' });
  const bare = worstCase();
  delete bare.vitals;
  const b = QR.encode(bare, { key, now: NOW, initial: 'ABC' });
  const noRoom = worstCase();
  delete noRoom.room;
  const n = QR.encode(noRoom, { key, now: NOW, initial: 'ABC' });
  console.log(`  anna: ${a.chars} chars, version ${a.versions[0]} ${a.ecl}; with finger sensor numbers: ${m.chars} chars, version ${m.versions[0]}; worst case: ${w.chars} chars, version ${w.versions[0]} ${w.ecl}, shrink ${w.shrink}; of these ${w.chars - b.chars} chars are the finger sensor numbers and ${w.chars - n.chars} the bedroom at night, both at their largest`);
  assert.ok(m.versions[0] <= 20 && m.chars <= 970, `anna with finger sensor numbers: version ${m.versions[0]}`);
  assert.ok(w.chars - b.chars <= 150, `finger sensor numbers take ${w.chars - b.chars} chars`);
  assert.ok(w.chars - n.chars <= 75, `the bedroom at night takes ${w.chars - n.chars} chars`);
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
  assert.ok(VKEYS.every(k => d.body.vitals.weekly[k].every(x => x !== null)));
  assert.deepStrictEqual(d.body.room, roomLargest());
});

test('over the cap: talk then PHQ shrink, safety never dropped, then chunks', () => {
  const full = QR.encode(worstCase(), { key, now: NOW });
  const r = QR.encode(worstCase(), { key, now: NOW, maxChars: full.chars - 20 });
  assert.ok(r.shrink >= 1 && r.parts.length === 1);
  const d = QR.decode(r.text, { now: NOW });
  assert.strictEqual(d.body.talk.length, 5);
  assert.strictEqual(d.body.safety.length, 8);
  assert.strictEqual(d.body.omitted.talk_requests, 12);
  assert.ok(VKEYS.every(k => d.body.vitals.weekly[k].every(x => x !== null)));
  const tight = QR.unpack(QR.pack(worstCase(), { caps: { talk: 5, phq: 4 } }));
  assert.deepStrictEqual([tight.talk.length, tight.phq.history.length, tight.safety.length], [5, 4, 8]);
  assert.deepStrictEqual(tight.vitals, d.body.vitals);
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

test('multi-part codes: no part ends in a space, wherever the cut falls', () => {
  // base45 has a space in its alphabet and a scanner may trim what it read, so a part cut after a space can lose a character.
  // A base45 group of 3 characters never ends in a space (its last character is at most 32 of 45), so parts are cut on group borders.
  // The bytes 06 54 encode to "0 0" and 00 24 to " 00": with them any cut that is not on a group border ends in a space.
  for (let groups = 60; groups < 100; groups++) {
    const bytes = Uint8Array.from({ length: 2 * groups }, (_, i) => ((i >> 1) % 2 ? [0x00, 0x24] : [0x06, 0x54])[i % 2]);
    const data = QR.base45.encode(bytes);
    assert.strictEqual(data.length, 3 * groups);
    for (const cap of [15 + Math.ceil(data.length / 2), 16 + Math.ceil(data.length / 2), 15 + Math.ceil(data.length / 3), 17 + Math.ceil(data.length / 3)]) {
      const parts = QR.chunk(data, cap);
      assert.ok(parts.length >= 2 && parts.length <= 3 && parts.every(p => p.length <= cap), `groups ${groups}, cap ${cap}`);
      assert.ok(parts.every(p => !p.endsWith(' ')), `groups ${groups}, cap ${cap}: a part ends in a space`);
      const col = new QR.Collector();
      let r;
      for (const p of parts) r = col.add(`\t${p}\r\n`);
      assert.strictEqual(r.status, 'complete');
      assert.strictEqual(r.text, 'AF1:' + data, `groups ${groups}, cap ${cap}`);
      assert.deepStrictEqual(QR.base45.decode(r.text.slice(4)), bytes);
    }
  }
  for (let i = 0; i < 40; i++) {
    const c = QR.encode(worstCase(), { key, now: NOW + i * 1000, maxChars: 400 });
    assert.ok(c.parts.length === 3 && c.parts.every(p => !p.endsWith(' ')));
    assert.strictEqual(QR.decode(c.parts, { now: NOW + i * 1000 }).status, 'ok', `encode ${i}`);
  }
});

function forged(vitals18) {
  const { zlibSync } = require('../vendor/qr/fflate.js');
  const body = QR.pack(fixture());
  body.set(18, vitals18);
  const iat = Math.floor(NOW / 1000);
  const cose = QR.sign(body, key, iat, iat + 600, new Uint8Array(8));
  return QR.decode('AF1:' + QR.base45.encode(zlibSync(cose, { level: 9 })), { now: NOW });
}

test('finger sensor numbers: a code from another encoder cannot carry 0, a negative or junk as a value', () => {
  const row = x => Array(8).fill(x);
  const ok = forged([5, [21, 20, 17], row(712), row(124), row(415)]);
  assert.strictEqual(ok.status, 'ok');
  assert.deepStrictEqual(ok.body.vitals, { weekly: { pulse_bpm: row(71.2), breathing_per_min: row(12.4), rmssd_ms: row(41.5) },
    days: { pulse_bpm: 21, breathing_per_min: 20, rmssd_ms: 17 }, simulated: { pulse_bpm: true, breathing_per_min: false, rmssd_ms: true } });

  const d = forged([7, [1, 2, 3], row('a'), row(-5), row(0)]);
  assert.strictEqual(d.status, 'ok');
  assert.deepStrictEqual(d.body.vitals, { weekly: per(() => row(null)), days: per(0), simulated: per(false) });

  const mixed = forged([0, [-4, 57, 'x'], [0, -1, 65536, 65535, true, null, 'x', 700], [120, 0, 0, 0, 0, 0, 0, 0], row(null)]).body.vitals;
  assert.deepStrictEqual(mixed.weekly.pulse_bpm, [null, null, null, 6553.5, null, null, null, 70]);
  assert.deepStrictEqual(mixed.weekly.breathing_per_min, [12, null, null, null, null, null, null, null]);
  assert.deepStrictEqual(mixed.days, { pulse_bpm: 0, breathing_per_min: 56, rmssd_ms: 0 });
  for (const v of [d.body.vitals, mixed]) assert.ok(VKEYS.every(k => v.weekly[k].every(x => x === null || (Number.isFinite(x) && x > 0))));

  for (const bad of [['x', [1, 1, 1], row(700), row(120), row(400)], [-1, [1, 1, 1], row(700), row(120), row(400)], [0, [1, 1, 1], row(700), row(120)],
    [0, [1, 1], row(700), row(120), row(400)], [0, [1, 1, 1], row(700), [120], row(400)], 7]) {
    const r = forged(bad);
    assert.deepStrictEqual([r.status, r.reason, 'body' in r], ['damaged', 'body_shape', false], JSON.stringify(bad));
  }
});

test('a part ending in a space survives, only line breaks and tabs are stripped', () => {
  let r;
  do r = QR.encode(worstCase(), { key, now: NOW }); while (!r.text.slice(4, -1).includes(' '));
  const data = r.text.slice(4);
  const cut = data.indexOf(' ') + 1;
  const parts = [`AF1/1/2/SPCE:${data.slice(0, cut)}`, `AF1/2/2/SPCE:${data.slice(cut)}`];
  assert.ok(parts[0].endsWith(' '));
  assert.strictEqual(QR.decode(parts, { now: NOW }).status, 'ok');
  assert.strictEqual(QR.decode(parts.map(p => `\t${p}\r\n`), { now: NOW }).status, 'ok');
  assert.strictEqual(QR.parse('AF1/1/2/SPCE:AB \r\n').data, 'AB ');
  assert.strictEqual(QR.parse('\nAF1:AB \t').data, 'AB ');
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
  assert.ok([...d.packed.keys()].every(k => Number.isInteger(k) && k >= 0 && k <= 19));
});

test('matrix: a link or a wi-fi join string with lowercase and non-ascii letters still draws and scans back', () => {
  for (const text of ['http://192.168.1.20:8000/api/export/dashboard', 'WIFI:T:WPA;S:Mökki;P:pa55;;']) {
    const m = QR.matrix(text, 'M'), px = 3, quiet = 4, side = (m.size + 2 * quiet) * px;
    const data = new Uint8ClampedArray(side * side * 4).fill(255);
    for (let y = 0; y < side; y++) for (let x = 0; x < side; x++) {
      const r0 = Math.floor(y / px) - quiet, c0 = Math.floor(x / px) - quiet;
      if (r0 >= 0 && c0 >= 0 && r0 < m.size && c0 < m.size && m.isDark(r0, c0)) data.fill(0, (y * side + x) * 4, (y * side + x) * 4 + 3);
    }
    assert.strictEqual(jsQR(data, side, side)?.data, text);
  }
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
