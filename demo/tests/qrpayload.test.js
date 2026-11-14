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
const FKEYS = QR.FACE.map(f => f[0]);
const perFace = (v, keys = FKEYS) => Object.fromEntries(keys.map((k, i) => [k, typeof v === 'function' ? v(k, i) : v]));
const faceMeasured = () => ({
  weekly: { smile_share: [null, 0.12, 0.18, 0, null, 0.21, 0.15, 0.09], blinks_per_min: [null, 14, 17, 12, null, 19, 16, 0],
    gaze_away_share: [null, 0.08, 0.11, 0.05, null, null, 0.07, 1] },
  days: { smile_share: 19, blinks_per_min: 19, gaze_away_share: 16 },
  simulated: perFace(false),
});
const carried = f => ({ weekly: perFace(k => f.weekly[k]), days: perFace(k => f.days[k]), simulated: perFace(k => f.simulated[k]) });
function faceLargest() {
  let x = 54321;
  const next = (q, max) => { x = (x * 1103515245 + 12345) % 2147483648; return (x % (Math.round(max * q) + 1)) / q; };
  return { weekly: Object.fromEntries(QR.FACE.map(([k, q, max]) => [k, Array.from({ length: 8 }, () => next(q, max))])), days: perFace(56), simulated: perFace(true) };
}
// Every list at its cap and every field varied (seeded): weekly, baseline and contribution values across their range,
// the entries of every list, and finger and face numbers in their real range.
function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const SPAN = { composite: [-8, 8], rt_median: [300, 3000], mood: [0, 10], sleep_regularity: [0, 1], missed_sessions: [0, 7], effort_hard_prop: [0, 1], morning_pulse: [40, 180], home_only_days: [0, 7], upright_frac: [0, 1], reward_bias: [-3, 3] };
const VSPAN = { pulse_bpm: [40, 180], breathing_per_min: [4, 40], rmssd_ms: [5, 250] };
const FSPAN = { smile_share: [0, 1], blinks_per_min: [0, 60], gaze_away_share: [0, 1] };
function varied(seed, randomLists) {
  const r = rng(seed), u = ([lo, hi]) => lo + (hi - lo) * r(), eight = s => Array.from({ length: 8 }, () => u(s));
  const int = (lo, hi) => Math.floor(lo + (hi - lo + 1) * r()), pick = a => a[Math.floor(r() * a.length)];
  const j = fullLists();
  j.weekly = Object.fromEntries(Object.entries(SPAN).map(([k, s]) => [k, eight(s)]));
  j.baseline = Object.fromEntries(QR.FEATURES.map(([k]) => [k, { median: u(SPAN[k]), scale: u([0.02, 0.3]) * (SPAN[k][1] - SPAN[k][0]) }]));
  j.contrib = QR.FEATURES.map(([k]) => ({ key: k, contribution: u([0, 5]) }));
  j.composite = { value: u(SPAN.composite), trend_7d: u([-0.5, 0.5]), completeness: u([0, 1]) };
  j.cusum.value = u([0, 60]);
  j.complete.by_feature = Object.fromEntries(QR.FEATURES.map(([k]) => [k, u([0, 1])]));
  if (randomLists) {
    j.phq.history = Array.from({ length: 12 }, () => ({ day: int(-200, 56), total: int(0, 27), phq8_total: int(0, 24), band: pick(['minimal', 'mild', 'moderate', 'moderately_severe', 'severe']), early: r() < 0.5 })).sort((a, b) => a.day - b.day);
    j.safety = Array.from({ length: 8 }, () => ({ day: int(1, 56), minute: int(0, 1439), tier: pick(['high', 'moderate', 'incomplete', 'low', 'not_answered']), source: pick(['cssrs', 'item9_fallback']), screen: pick(['crisis', 'support', 'saved', 'thank_you']), c6_repeat: r() < 0.5 })).sort((a, b) => b.day - a.day);
    j.talk = Array.from({ length: 10 }, () => ({ day: int(1, 56), minute: int(0, 1439) })).sort((a, b) => b.day - a.day);
    j.cusum.history = Array.from({ length: 10 }, () => ({ day: int(0, 56), state: pick(QR.STATES) })).sort((a, b) => a.day - b.day);
  }
  j.vitals = { weekly: Object.fromEntries(Object.entries(VSPAN).map(([k, s]) => [k, eight(s)])), days: per(56), simulated: per(true) };
  j.face = { weekly: Object.fromEntries(Object.entries(FSPAN).map(([k, s]) => [k, eight(s)])), days: perFace(56), simulated: perFace(true) };
  return j;
}
// demo/js/qrpayload.js as it was before key 18 (79b4d17) and before key 19 (main at c9a319f), frozen byte for byte.
function frozenReader(file) {
  const mod = { exports: {} };
  const req = p => require(p.startsWith('../vendor/') ? path.join(__dirname, '..', p.slice(3)) : p);
  new Function('module', 'require', fs.readFileSync(path.join(__dirname, 'fixtures', file), 'utf8'))(mod, req);
  return mod.exports;
}
const OLD_KEYS = [0, 1, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16];
const OLD_LENGTHS = { 3: 3, 4: 5, 5: 8, 6: 3, 8: 2, 9: 10, 10: 18, 11: 5, 14: 14 };

// Every list at its cap, anna's weekly, baseline and contribution values, finger and face numbers at their largest.
function fullLists() {
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
  j.face = faceLargest();
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
  assert.deepStrictEqual(b.vitals, j.vitals);
  assert.deepStrictEqual(b.face, carried(j.face));
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

test('codes made before the finger sensor numbers still decode', () => {
  const f = frozen();
  assert.ok(!f.packed_keys.includes(18));
  const d = QR.decode(f.text, { now: f.now_ms });
  assert.strictEqual(d.status, 'ok');
  assert.strictEqual(d.verified, true);
  assert.strictEqual(d.fingerprint, f.fingerprint);
  assert.deepStrictEqual(d.body, f.body);
  assert.strictEqual('vitals' in d.body, false);
  assert.strictEqual('face' in d.body, false);
  assert.deepStrictEqual([...d.packed.keys()].sort((a, b) => a - b), f.packed_keys);
  const parts = QR.decode([...f.parts].reverse(), { now: f.now_ms });
  assert.strictEqual(parts.status, 'ok');
  assert.strictEqual(parts.fingerprint, f.fingerprint);
  assert.strictEqual('vitals' in parts.body, false);
  assert.strictEqual('face' in parts.body, false);
  for (const k of ['period', 'state', 'safety', 'talk', 'weekly', 'baseline', 'complete', 'sensors']) assert.deepStrictEqual(parts.body[k], f.body[k], k);
  assert.strictEqual(QR.decode(f.text, { now: f.now_ms + 11 * 60e3 }).status, 'expired');
});

test('a code with finger sensor and face numbers keeps the layout that older readers check', () => {
  assert.strictEqual(QR.VERSION, 1);
  assert.strictEqual(QR.FEATURES.length, 9);
  const j = { ...fixture(), vitals: measured(), face: faceMeasured() };
  const d = QR.decode(QR.encode(j, { key, now: NOW }).text, { now: NOW });
  const p = d.packed;
  assert.strictEqual(p.get(0), 1);
  assert.ok(p.has(18) && p.has(19));
  for (const k of OLD_KEYS) assert.ok(p.has(k), `key ${k}`);
  for (const [k, n] of Object.entries(OLD_LENGTHS)) assert.strictEqual(p.get(+k).length, n, `key ${k}`);
  assert.deepStrictEqual(frozen().packed_keys.filter(k => k !== 2), OLD_KEYS);
  const old = new Map([...p].filter(([k]) => k !== 18 && k !== 19));
  const plain = fixture();
  delete plain.vitals;
  delete plain.face;
  assert.deepStrictEqual(QR.cbor.encode(old), QR.cbor.encode(QR.pack(plain)));
  const { vitals, face, ...rest } = d.body;
  assert.deepStrictEqual(QR.unpack(old), rest);
  assert.deepStrictEqual(vitals, j.vitals);
  assert.deepStrictEqual(face, carried(j.face));
  const noFace = new Map([...p].filter(([k]) => k !== 19));
  assert.deepStrictEqual(QR.unpack(noFace).vitals, j.vitals);
  assert.strictEqual('face' in QR.unpack(noFace), false);
});

test('a code with finger sensor and face numbers decodes in the readers from before them', () => {
  const BEFORE_VITALS = frozenReader('qrpayload_before_vitals.js');
  const BEFORE_FACE = frozenReader('qrpayload_before_face.js');
  assert.ok(!BEFORE_VITALS.VITALS && BEFORE_FACE.VITALS && !BEFORE_FACE.FACE && BEFORE_VITALS.VERSION === 1 && BEFORE_FACE.VERSION === 1);
  const j = { ...fixture(), vitals: measured(), face: faceMeasured() };
  const whole = QR.encode(j, { key, now: NOW });
  const now = QR.decode(whole.text, { now: NOW });
  assert.ok(now.packed.has(18) && now.packed.has(19) && now.body.face);
  assert.deepStrictEqual(now.body.face, carried(j.face));
  const parts = QR.encode(j, { key, now: NOW, maxChars: 400 });
  assert.ok(parts.parts.length >= 2);
  const full = QR.encode(j, { key, now: NOW, maxChars: whole.chars - 20 });
  assert.deepStrictEqual([full.faceLeftOut, full.parts.length, full.shrink], [true, 1, 1]);
  assert.strictEqual(QR.decode(full.text, { now: NOW }).packed.get(19), false);
  for (const [name, OLD, knows18] of [['before key 18', BEFORE_VITALS, false], ['before key 19', BEFORE_FACE, true]]) {
    for (const [what, input] of [['whole', whole.text], ['in parts', parts.parts], ['in parts, last first', [...parts.parts].reverse()], ['face left out', full.text]]) {
      const { vitals, face, ...rest } = QR.decode(input, { now: NOW }).body;
      assert.deepStrictEqual(vitals, j.vitals, what);
      const d = OLD.decode(input, { now: NOW });
      assert.deepStrictEqual([d.status, d.verified, d.fingerprint], ['ok', true, whole.fingerprint], `${name}, ${what}`);
      assert.deepStrictEqual(d.body, knows18 ? { ...rest, vitals } : rest, `${name}, ${what}`);
      assert.ok(!('face' in d.body), `${name}, ${what}`);
    }
  }
});

test('byte budget: anna at version 20 or lower, every list at its cap at 22 or lower, both at M in one code', () => {
  const a = QR.encode(fixture(), { key, now: NOW });
  const m = QR.encode({ ...fixture(), vitals: measured(), face: faceMeasured() }, { key, now: NOW });
  const w = QR.encode(fullLists(), { key, now: NOW, initial: 'ABC' });
  const noFace = fullLists();
  delete noFace.face;
  const f = QR.encode(noFace, { key, now: NOW, initial: 'ABC' });
  const bare = fullLists();
  delete bare.vitals;
  delete bare.face;
  const b = QR.encode(bare, { key, now: NOW, initial: 'ABC' });
  console.log(`  anna: ${a.chars} chars, version ${a.versions[0]} ${a.ecl}; with finger sensor and face numbers: ${m.chars} chars, version ${m.versions[0]}; every list at its cap (anna's values): ${w.chars} chars, version ${w.versions[0]} ${w.ecl}, shrink ${w.shrink}; of these ${f.chars - b.chars} chars are the finger sensor numbers and ${w.chars - f.chars} the face numbers at their largest`);
  assert.ok(m.versions[0] <= 20 && m.chars <= 970, `anna with finger sensor and face numbers: version ${m.versions[0]}`);
  assert.ok(f.chars - b.chars <= 150, `finger sensor numbers take ${f.chars - b.chars} chars`);
  assert.ok(w.chars - f.chars <= 70, `face numbers take ${w.chars - f.chars} chars`);
  assert.strictEqual(w.faceLeftOut, false);
  for (let i = 0; i < 25; i++) {
    const again = QR.encode(fullLists(), { key: QR.newKey(), now: NOW + i * 1000, initial: 'ABC' });
    assert.deepStrictEqual([again.shrink, again.parts.length, again.faceLeftOut], [0, 1, false], `every list at its cap with key ${i}: ${again.chars} chars`);
  }
  assert.strictEqual(a.ecl, 'M');
  assert.ok(a.versions[0] <= 20, `anna version ${a.versions[0]}`);
  assert.ok(a.chars <= 970);
  assert.strictEqual(w.parts.length, 1);
  assert.strictEqual(w.shrink, 0);
  assert.ok(w.versions[0] <= 22 && w.chars <= QR.CAP_CHARS, `every list at its cap: version ${w.versions[0]}`);
  const d = QR.decode(w.text, { now: NOW });
  assert.strictEqual(d.body.safety.length, 8);
  assert.strictEqual(d.body.talk.length, 10);
  assert.strictEqual(d.body.phq.history.length, 8);
  assert.deepStrictEqual(d.body.phq.history.map(h => h.day), fullLists().phq.history.slice(-8).map(h => h.day));
  assert.deepStrictEqual(d.body.omitted, { safety_entries: 3, talk_requests: 7, phq_totals: 8 });
  assert.ok(VKEYS.every(k => d.body.vitals.weekly[k].every(x => x !== null)));
  assert.ok(FKEYS.every(k => d.body.face.weekly[k].every(x => x !== null)));
  assert.deepStrictEqual(Object.keys(d.body.face.weekly), FKEYS);
});

test('every list at its cap and every field varied: one code; over the cap only the face numbers go', () => {
  const sizes = [];
  let left = 0;
  for (let seed = 0; seed < 60; seed++) {
    const j = varied(seed, seed % 2 === 1);
    const r = QR.encode(j, { key, now: NOW, initial: 'ABC' });
    sizes.push(r.chars);
    assert.deepStrictEqual([r.parts.length, r.ecl], [1, 'M'], `seed ${seed}: ${r.chars} chars`);
    assert.ok(r.versions[0] <= 22 && r.chars <= QR.CAP_CHARS, `seed ${seed}: version ${r.versions[0]}`);
    assert.ok(r.shrink <= 1 && r.faceLeftOut === (r.shrink === 1), `seed ${seed}: shrink ${r.shrink}`);
    left += r.faceLeftOut;
    const d = QR.decode(r.text, { now: NOW });
    assert.strictEqual(d.status, 'ok');
    assert.deepStrictEqual([d.body.safety.length, d.body.talk.length, d.body.phq.history.length], [8, 10, 8], `seed ${seed}`);
    assert.ok(VKEYS.every(k => d.body.vitals.weekly[k].every(x => x !== null)), `seed ${seed}: finger sensor numbers kept`);
    if (r.faceLeftOut) assert.strictEqual(d.body.face, null);
    else assert.ok(FKEYS.every(k => d.body.face.weekly[k].every(x => x !== null)), `seed ${seed}: face numbers kept`);
  }
  console.log(`  every list at its cap, every field varied: ${Math.min(...sizes)} to ${Math.max(...sizes)} of ${QR.CAP_CHARS} chars; the face numbers were left out in ${left} of ${sizes.length}`);
});

test('over the cap: face numbers go first, then talk, then PHQ; safety never dropped, then chunks', () => {
  const full = QR.encode(fullLists(), { key, now: NOW });
  const r = QR.encode(fullLists(), { key, now: NOW, maxChars: full.chars - 20 });
  assert.deepStrictEqual([r.shrink, r.parts.length, r.faceLeftOut], [1, 1, true]);
  const d = QR.decode(r.text, { now: NOW });
  assert.strictEqual(d.body.face, null);
  assert.strictEqual(d.packed.get(19), false);
  assert.deepStrictEqual([d.body.talk.length, d.body.safety.length, d.body.phq.history.length], [10, 8, 8]);
  assert.strictEqual(d.body.omitted.talk_requests, 7);
  assert.ok(VKEYS.every(k => d.body.vitals.weekly[k].every(x => x !== null)));
  const t = QR.encode(fullLists(), { key, now: NOW, maxChars: r.chars - 20 });
  assert.deepStrictEqual([t.shrink, t.parts.length, t.faceLeftOut], [2, 1, true]);
  const dt = QR.decode(t.text, { now: NOW });
  assert.strictEqual(dt.body.face, null);
  assert.strictEqual(dt.body.talk.length, 5);
  assert.strictEqual(dt.body.safety.length, 8);
  assert.strictEqual(dt.body.omitted.talk_requests, 12);
  assert.ok(VKEYS.every(k => dt.body.vitals.weekly[k].every(x => x !== null)));
  const tight = QR.unpack(QR.pack(fullLists(), { caps: { face: 0, talk: 5, phq: 4 } }));
  assert.deepStrictEqual([tight.talk.length, tight.phq.history.length, tight.safety.length, tight.face], [5, 4, 8, null]);
  assert.deepStrictEqual(tight.vitals, dt.body.vitals);
  const empty = { ...fullLists(), face: { weekly: {}, days: {}, simulated: {} } };
  assert.deepStrictEqual(QR.pack(empty, { caps: { face: 0 } }).get(19), []);
  const c = QR.encode(fullLists(), { key, now: NOW, maxChars: 400 });
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
  assert.deepStrictEqual(back.body.safety, fullLists().safety);
  assert.strictEqual(QR.decode(rev, { now: NOW }).status, 'ok');
  assert.throws(() => QR.encode(fullLists(), { key, now: NOW, maxChars: 150 }), /too_large/);
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
    const c = QR.encode(fullLists(), { key, now: NOW + i * 1000, maxChars: 400 });
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

test('face numbers: three weekly numbers, round trip with gaps, a real 0, days and the simulated mark', () => {
  assert.deepStrictEqual(FKEYS, ['smile_share', 'blinks_per_min', 'gaze_away_share']);
  const j = { ...fixture(), face: faceMeasured() };
  const EXTRA = ['micro_per_min', 'breathing_per_min'];
  for (const k of EXTRA) { j.face.weekly[k] = Array(8).fill(12.5); j.face.days[k] = 19; j.face.simulated[k] = false; }
  const d = QR.decode(QR.encode(j, { key, now: NOW }).text, { now: NOW });
  assert.strictEqual(d.status, 'ok');
  assert.deepStrictEqual(d.body.face, carried(j.face));
  assert.deepStrictEqual(Object.keys(d.body.face.weekly), FKEYS);
  for (const k of EXTRA) assert.ok(!(k in d.body.face.weekly) && !(k in d.body.face.days), `${k} is not in the code`);
  assert.strictEqual(d.body.face.weekly.smile_share[3], 0);
  assert.strictEqual(d.body.face.weekly.blinks_per_min[7], 0);
  assert.strictEqual(d.body.face.weekly.gaze_away_share[7], 1);
  assert.strictEqual(d.body.face.weekly.smile_share[0], null);
  const v = faceMeasured();
  v.simulated.blinks_per_min = true;
  const s = QR.decode(QR.encode({ ...fixture(), face: v }, { key, now: NOW }).text, { now: NOW }).body.face;
  assert.deepStrictEqual(s.simulated, { smile_share: false, blinks_per_min: true, gaze_away_share: false });
  const odd = faceMeasured();
  odd.weekly.smile_share = [0.123, 0.004, 0.005, 0.996, null, null, null, null];
  odd.weekly.blinks_per_min = [14.4, 14.6, 253.6, 0.4, null, null, null, null];
  const o = QR.decode(QR.encode({ ...fixture(), face: odd }, { key, now: NOW }).text, { now: NOW }).body.face;
  assert.deepStrictEqual(o.weekly.smile_share.slice(0, 4), [0.12, 0, 0.01, 1]);
  assert.deepStrictEqual(o.weekly.blinks_per_min.slice(0, 4), [14, 15, 254, 0]);
  const big = QR.decode(QR.encode(fullLists(), { key, now: NOW }).text, { now: NOW }).body.face;
  const want = faceLargest();
  for (const [k, q] of QR.FACE) big.weekly[k].forEach((x, i) => near(x, want.weekly[k][i], q, `${k}[${i}]`));
  assert.deepStrictEqual([big.days, big.simulated], [perFace(56), perFace(true)]);
});

test('face numbers: a week without face data has no value, never 0', () => {
  const none = fixture();
  delete none.face;
  const a = QR.decode(QR.encode(none, { key, now: NOW }).text, { now: NOW });
  assert.strictEqual(a.packed.has(19), false);
  assert.strictEqual('face' in a.body, false);
  const empty = { weekly: perFace(() => Array(8).fill(null)), days: perFace(0), simulated: perFace(false) };
  for (const f of [fixture().face, empty, {}, { weekly: {} }, { weekly: perFace(() => []), days: perFace(9), simulated: perFace(true) }]) {
    const e = QR.decode(QR.encode({ ...fixture(), face: f }, { key, now: NOW }).text, { now: NOW });
    assert.deepStrictEqual(e.packed.get(19), []);
    assert.deepStrictEqual(e.body.face, empty);
  }
  const odd = faceMeasured();
  odd.weekly.smile_share = [-0.1, 1.01, NaN, Infinity, '0.2', undefined, true, 0.25];
  odd.weekly.blinks_per_min = [-1, 254.6, 300, '14', null, NaN, false, 15];
  odd.weekly.gaze_away_share = [2, 2, 2, 2, 2, 2, 2, 2];
  odd.days.gaze_away_share = 30;
  odd.simulated.gaze_away_share = true;
  const o = QR.decode(QR.encode({ ...fixture(), face: odd }, { key, now: NOW }).text, { now: NOW }).body.face;
  assert.deepStrictEqual(o.weekly.smile_share, [null, null, null, null, null, null, null, 0.25]);
  assert.deepStrictEqual(o.weekly.blinks_per_min, [null, null, null, null, null, null, null, 15]);
  assert.deepStrictEqual(o.weekly.gaze_away_share, Array(8).fill(null));
  assert.deepStrictEqual([o.days.gaze_away_share, o.simulated.gaze_away_share], [0, false]);
});

function forgedFace(face19) {
  const { zlibSync } = require('../vendor/qr/fflate.js');
  const body = QR.pack(fixture());
  body.set(19, face19);
  const iat = Math.floor(NOW / 1000);
  const cose = QR.sign(body, key, iat, iat + 600, new Uint8Array(8));
  return QR.decode('AF1:' + QR.base45.encode(zlibSync(cose, { level: 9 })), { now: NOW });
}

test('face numbers: a code from another encoder cannot carry a share above 1, a value past the range or a bad shape', () => {
  const row = x => Uint8Array.from(Array(8).fill(x));
  const ok = forgedFace([2, Uint8Array.from([19, 18, 16]), row(13), row(15), row(9)]);
  assert.strictEqual(ok.status, 'ok');
  assert.deepStrictEqual(ok.body.face, { weekly: { smile_share: Array(8).fill(0.12), blinks_per_min: Array(8).fill(14), gaze_away_share: Array(8).fill(0.08) },
    days: { smile_share: 19, blinks_per_min: 18, gaze_away_share: 16 }, simulated: { smile_share: false, blinks_per_min: true, gaze_away_share: false } });
  const past = forgedFace([7, Uint8Array.from([200, 57, 3]), Uint8Array.from([102, 255, 0, 101, 1, 0, 0, 0]), row(255), row(0)]).body.face;
  assert.deepStrictEqual(past.weekly.smile_share, [null, null, null, 1, 0, null, null, null]);
  assert.deepStrictEqual(past.weekly.blinks_per_min, Array(8).fill(254));
  assert.deepStrictEqual(past.weekly.gaze_away_share, Array(8).fill(null));
  assert.deepStrictEqual(past.days, { smile_share: 56, blinks_per_min: 56, gaze_away_share: 0 });
  assert.deepStrictEqual(past.simulated, { smile_share: true, blinks_per_min: true, gaze_away_share: false });
  const out = forgedFace(false);
  assert.strictEqual(out.status, 'ok');
  assert.strictEqual(out.body.face, null);
  for (const bad of [[0, Uint8Array.from([1, 1, 1]), row(10), row(10)], [0, [1, 1, 1], row(10), row(10), row(10)], [-1, Uint8Array.from([1, 1, 1]), row(10), row(10), row(10)],
    [0, Uint8Array.from([1, 1, 1]), row(10), [10, 10, 10, 10, 10, 10, 10, 10], row(10)], [0, Uint8Array.from([1, 1, 1]), row(10), Uint8Array.from([10]), row(10)], true, 7, 'x']) {
    const r = forgedFace(bad);
    assert.deepStrictEqual([r.status, r.reason, 'body' in r], ['damaged', 'body_shape', false], String(bad));
  }
});

test('a part ending in a space survives, only line breaks and tabs are stripped', () => {
  let r;
  do r = QR.encode(fullLists(), { key, now: NOW }); while (!r.text.slice(4, -1).includes(' '));
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
  const w = QR.encode(fullLists(), { key, now: NOW, paper: true });
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

test('scan: jsQR reads the drawn matrix at 3 px per module', () => {
  for (const [j, ecl] of [[fixture(), 'M'], [fullLists(), 'M'], [fixture(), 'Q']]) {
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
