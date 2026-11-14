// Run: node hub/tests/clinic_signals.test.js
// The Signals section of the clinic view (Decisions I53, contracts/api.md section 3.5): labels, units, source texts,
// staleness, the Simulated badge and the wording rules. The physio and camera objects below are test input, not measurements.
// Sections 3 and 4: the weekly finger sensor and face numbers of a code the patient handed over, in the imported view.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const ROOT = path.join(__dirname, '..', '..');
const WEB = path.join(ROOT, 'hub', 'afferent_hub', 'web', 'clinic');
const FIX = path.join(ROOT, 'contracts', 'fixtures');
const read = (dir, f) => fs.readFileSync(path.join(dir, f), 'utf8');
const json = (f) => JSON.parse(read(FIX, f));
// values built inside the vm belong to another realm, so compare them by value
const plain = (v) => JSON.parse(JSON.stringify(v ?? null));
const same = (actual, expected, msg) => assert.deepStrictEqual(plain(actual), plain(expected), msg);

// 1. signals.js alone, with a stub window.C (esc and sparkline only): it must not touch the DOM.
const sparkCalls = [];
function loadSignals() {
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const ctx = { Math, JSON, Number, String, Array, Object };
  ctx.window = ctx;
  ctx.C = { esc, sparkline: (vals, o) => { sparkCalls.push({ vals, o }); return '<svg class="spark"></svg>'; } };
  vm.createContext(ctx);
  vm.runInContext(read(WEB, 'signals.js'), ctx);
  return ctx.C.signals;
}
const Sg = loadSignals();
const byKey = (rows) => Object.fromEntries(rows.map((r) => [r.key, r]));

const BLE = { source: 'finger_ppg', transport: 'ble', simulated: false, pulse_bpm: 72, quality: null, quality_reported: false, contact: true,
  finger_bpm: [72, 74], breathing_per_min: 12, rmssd_ms: 41, sdnn_ms: null, rmssd_vs_baseline: null, presence: null, age_s: 0.6, link: 'connected' };
const HTTP = { source: 'finger_ppg', transport: 'hub_http', simulated: false, pulse_bpm: 71, quality: 0.62, quality_reported: true, contact: true,
  finger_bpm: [71, null], finger_sources: [0], breathing_per_min: 11, breathing_snr_db: 3.2, rmssd_ms: 41.5, sdnn_ms: 46, rmssd_vs_baseline: -0.08,
  rmssd_baseline_ms: 45.1, presence: 'active', age_s: 0.4 };
const CAM = { source: 'rppg', bpm: 74.5, trust_score: 82, trust_label: 'reliable', age_s: 0.9 };

// Bluetooth path, AFF1 v1: no quality, no finger-detection state, no SDNN, no baseline
{
  const rows = Sg.liveRows(BLE, null, 0.2);
  const r = byKey(rows);
  same(rows.map((x) => x.label), ['Pulse (fused)', 'Finger 1', 'Finger 2', 'Breathing rate', 'HRV (RMSSD)', 'Finger detection']);
  same([r.pulse.value, r.pulse.unit], ['72', 'bpm']);
  assert.strictEqual(r.pulse.note, 'signal quality not reported');
  same([r.finger_1.value, r.finger_1.unit, r.finger_2.value, r.finger_2.unit], ['72', 'bpm', '74', 'bpm']);
  same([r.breathing.value, r.breathing.unit], ['12', 'per min']);
  same([r.rmssd.value, r.rmssd.unit], ['41', 'ms']);
  assert.strictEqual(r.presence.value, 'not reported');
  for (const x of rows) {
    assert.strictEqual(x.source, 'finger sensor (PPG), Bluetooth via the phone');
    assert.strictEqual(x.simulated, false);
    assert.strictEqual(x.stale, false);
    assert.ok(Math.abs(x.age - 0.8) < 1e-9);
    assert.strictEqual(x.ageText, 'just now');
  }
}

// HTTP path: quality, SDNN, baseline as a signed percent, finger detection; a missing finger is "no reading"
{
  const rows = Sg.liveRows(HTTP, null, 1.6);
  const r = byKey(rows);
  same(rows.map((x) => x.label), ['Pulse (fused)', 'Finger 1', 'Finger 2', 'Breathing rate', 'HRV (RMSSD)', 'SDNN', 'vs recent median', 'Finger detection']);
  assert.strictEqual(r.pulse.note, 'signal quality 0.62');
  same([r.rmssd.value, r.rmssd.unit], ['41.5', 'ms']);
  same([r.sdnn.value, r.sdnn.unit], ['46', 'ms']);
  same([r.vs_baseline.value, r.vs_baseline.unit], ['−8', '%']);
  assert.strictEqual(byKey(Sg.liveRows({ ...HTTP, rmssd_vs_baseline: 0.12 }, null, 0)).vs_baseline.value, '+12');
  assert.strictEqual(r.presence.value, 'measuring');
  assert.strictEqual(byKey(Sg.liveRows({ ...HTTP, presence: 'idle' }, null, 0)).presence.value, 'no finger');
  assert.strictEqual(byKey(Sg.liveRows({ ...HTTP, presence: 'probing' }, null, 0)).presence.value, 'checking for a finger');
  same([r.finger_2.value, r.finger_2.missing], ['no reading', true]);
  for (const x of rows) {
    assert.strictEqual(x.source, 'finger sensor (PPG), hub HTTP');
    assert.strictEqual(x.ageText, '2 s ago');
  }
}

// staleness: older than 5 s (time since arrival plus the object's own age) shows no value
{
  assert.ok(Sg.liveRows(HTTP, null, 4.6).every((x) => !x.stale), '5.0 s is still current');
  for (const rows of [Sg.liveRows(HTTP, null, 4.7), Sg.liveRows(HTTP, null, 40), Sg.liveRows(HTTP, null, null), Sg.liveRows(HTTP, null, undefined)]) {
    for (const x of rows) {
      assert.strictEqual(x.value, 'no current reading');
      assert.strictEqual(x.stale, true);
      assert.strictEqual(x.note, '', 'a stale row shows no quality either');
    }
  }
  const cam = Sg.liveRows(null, CAM, 4.2)[0];
  same([cam.value, cam.stale, cam.note], ['no current reading', true, '']);
  assert.strictEqual(Sg.liveRows(HTTP, null, 200)[0].ageText, 'over a minute ago');
  assert.strictEqual(Sg.liveRows(HTTP, null, null)[0].ageText, 'age unknown');
}

// camera pulse with its trust score
{
  const rows = Sg.liveRows(null, CAM, 0.1);
  assert.strictEqual(rows.length, 1);
  const c = rows[0];
  same([c.label, c.value, c.unit, c.note, c.source, c.simulated], ['Pulse (camera)', '74.5', 'bpm', 'trust 82 of 100, reliable', 'phone camera (rPPG)', false]);
  assert.strictEqual(Sg.liveRows(null, { ...CAM, trust_score: null, trust_label: null }, 0)[0].note, 'trust not reported');
  assert.strictEqual(Sg.liveRows(BLE, CAM, 0).length, 7);
}

// simulated values carry the badge; a source the contract does not know is dropped, never relabelled
{
  for (const sim of [{ ...BLE, source: 'simulated', simulated: true }, { ...BLE, source: 'simulated' }, { ...BLE, simulated: true }]) {
    const rows = Sg.liveRows(sim, null, 0);
    assert.ok(rows.length && rows.every((x) => x.simulated === true && x.source === 'simulator'));
  }
  for (const src of [undefined, null, 'ky039', 'rppg', 'unoq_http']) same(Sg.liveRows({ ...BLE, source: src }, null, 0), []);
  same(Sg.liveRows(null, { ...CAM, source: 'finger_ppg' }, 0), []);
  same(Sg.liveRows(null, null, 0), []);
}

// stored session: the fixture has all five blocks, all labelled simulated
const fixture = json('session_finger_example.json');
{
  const rows = Sg.sessionRows(fixture.vitals, fixture.simulated_fields);
  const r = byKey(rows);
  same(rows.map((x) => x.label), ['Pulse (fused)', 'Finger 1', 'Finger 2', 'Between the fingers', 'Finger detection', 'Breathing rate', 'HRV (RMSSD)', 'SDNN', 'vs recent median', 'Pulse (camera)']);
  assert.ok(rows.every((x) => x.simulated === true), 'every block of the fixture is simulated');
  same([r.pulse.value, r.pulse.unit, r.pulse.note], ['73.9', 'bpm', '71 to 79, signal quality 0.62']);
  same([r.finger_1.value, r.finger_2.value, r.fingers_diff.value, r.fingers_diff.unit], ['74.3', '73.2', '2.1', 'bpm']);
  same([r.breathing.value, r.breathing.unit], ['10.9', 'per min']);
  same([r.rmssd.value, r.rmssd.unit, r.rmssd.note], ['41.4', 'ms', '38 → 44, first to last']);
  same([r.sdnn.value, r.sdnn.unit], ['46.2', 'ms']);
  same([r.vs_baseline.value, r.vs_baseline.unit], ['−8', '%']);
  same([r.presence.value, r.presence.unit], ['104', 's']);
  assert.ok(r.presence.note.includes('checking for a finger 6 s') && r.presence.note.includes('no finger 0 s'));
  same([r.camera.value, r.camera.unit, r.camera.source], ['75.1', 'bpm', 'phone camera (rPPG)']);
  assert.ok(r.camera.note.startsWith('mean trust 71 of 100'));
  same([r.pulse.series, r.breathing.series, r.rmssd.series], ['pulse_bpm', 'breathing_per_min', 'rmssd_ms']);
}

// the same session as a real Bluetooth recording (AFF1 v1): no badge, true source, no quality, no SDNN or baseline
const real = JSON.parse(JSON.stringify(fixture));
real.simulated_fields = [];
Object.assign(real.vitals.finger, { source: 'finger_ppg', transport: 'ble', quality_reported: false, presence_s: null,
  quality: { mean: null, min: null, max: null, first: null, last: null, samples: 0 } });
real.vitals.breathing.source = 'finger_ppg';
Object.assign(real.vitals.hrv, { source: 'finger_ppg', sdnn_ms: null, rmssd_vs_baseline: null });
{
  const rows = Sg.sessionRows(real.vitals, real.simulated_fields);
  const r = byKey(rows);
  assert.ok(rows.every((x) => x.simulated === false));
  assert.ok(!r.sdnn && !r.vs_baseline && !r.presence);
  assert.strictEqual(r.pulse.note, '71 to 79');
  for (const k of ['pulse', 'finger_1', 'finger_2', 'breathing', 'rmssd']) assert.strictEqual(r[k].source, 'finger sensor (PPG), Bluetooth via the phone');
  // simulated_fields alone is enough for the badge, per block
  const some = byKey(Sg.sessionRows(real.vitals, ['vitals.hrv', 'vitals.camera_pulse']));
  same([some.pulse.simulated, some.breathing.simulated, some.rmssd.simulated, some.camera.simulated], [false, false, true, true]);
  assert.ok(Sg.sessionRows(real.vitals, ['*']).every((x) => x.simulated));
  same(Sg.sessionRows(null), []);
  same(Sg.sessionRows({ pulse_mean_bpm: 70, finger: null, hrv: null }), []);
}

// html: wording, badge, sparklines, the empty cases
const FOOT = 'Measured values with their source. Support for monitoring and follow-up, not a diagnosis. HRV is shown as a number and is not part of the index.';
const count = (s, sub) => s.split(sub).length - 1;
function checkWording(html, what) {
  const low = html.toLowerCase();
  for (const w of ['stress', 'strain', 'screening', 'treat']) assert.ok(!low.includes(w), `${what}: "${w}"`);
  assert.strictEqual(count(low, 'diagnos'), count(low, 'not a diagnosis'), `${what}: "diagnos" outside "not a diagnosis"`);
  assert.ok(!/\blive\b/.test(low), `${what}: the word live`);
  assert.ok(!html.includes(String.fromCharCode(0x2014)), `${what}: em dash`);
  assert.ok(!/undefined|NaN|\[object/.test(html), `${what}: unformatted value`);
}
const NOW = 1_800_000_000_000;
{
  assert.strictEqual(Sg.html({ physio: null, camera: null, at: null, via: null, session: null, bound: false, nowMs: NOW }), '');
  assert.strictEqual(Sg.html({ physio: null, camera: null, session: { session_id: 'x', vitals: { pulse_mean_bpm: 70 } }, bound: false, nowMs: NOW }), '');

  const bound = Sg.html({ physio: null, camera: null, at: null, via: null, session: null, bound: true, nowMs: NOW });
  assert.ok(bound.includes('No finger sensor reading yet') && bound.includes(FOOT));
  checkWording(bound, 'bound, empty');

  const ble = Sg.html({ physio: BLE, camera: CAM, at: NOW - 400, via: 'phone', session: null, bound: false, nowMs: NOW });
  for (const s of ['Current readings', 'relayed by the phone', 'sensor connected', 'Pulse (fused)', 'Finger 1', 'Finger 2', 'Breathing rate', 'HRV (RMSSD)',
    'Finger detection', 'Pulse (camera)', '<small>bpm</small>', '<small>per min</small>', '<small>ms</small>', 'finger sensor (PPG), Bluetooth via the phone',
    'phone camera (rPPG)', 'signal quality not reported', 'trust 82 of 100, reliable', 'just now', FOOT]) assert.ok(ble.includes(s), s);
  assert.ok(!ble.includes('sim-badge') && !ble.includes('No finger sensor reading yet') && !ble.includes('Last session'));
  checkWording(ble, 'ble');

  // a hub frame that came back through the phone's live relay: the phone's Bluetooth link state does not describe it
  const relayed = Sg.html({ physio: { ...HTTP, link: 'unavailable' }, camera: null, at: NOW - 400, via: 'phone', session: null, bound: true, nowMs: NOW });
  assert.ok(relayed.includes('relayed by the phone') && relayed.includes('finger sensor (PPG), hub HTTP') && relayed.includes('signal quality 0.62'));
  for (const s of ['sensor not reachable', 'looking for the sensor', 'Bluetooth off']) assert.ok(!relayed.includes(s), s);
  assert.ok(!Sg.html({ physio: { ...HTTP, link: 'scanning' }, camera: null, at: NOW - 400, via: 'phone', session: null, bound: true, nowMs: NOW }).includes('looking for the sensor'));

  const http = Sg.html({ physio: HTTP, camera: null, at: NOW - 1000, via: 'hub', session: null, bound: true, nowMs: NOW });
  for (const s of ['from the bedside source on the hub', 'finger sensor (PPG), hub HTTP', 'signal quality 0.62', 'SDNN', 'vs recent median', '−8<small>%</small>', 'measuring']) assert.ok(http.includes(s), s);
  checkWording(http, 'http');

  const stale = Sg.html({ physio: HTTP, camera: null, at: NOW - 9000, via: 'hub', session: null, bound: true, nowMs: NOW });
  assert.strictEqual(count(stale, 'no current reading'), 8);
  assert.ok(!stale.includes('<small>bpm</small>') && !stale.includes('signal quality 0.62') && stale.includes('9 s ago'));
  checkWording(stale, 'stale');
  const unknownAge = Sg.html({ physio: HTTP, camera: null, at: null, via: 'hub', session: null, bound: true, nowMs: NOW });
  assert.strictEqual(count(unknownAge, 'no current reading'), 8);

  const sim = Sg.html({ physio: { ...BLE, source: 'simulated', simulated: true }, camera: null, at: NOW, via: 'phone', session: null, bound: false, nowMs: NOW });
  assert.strictEqual(count(sim, '<span class="sim-badge small">Simulated</span>'), 6, 'one badge per simulated row');
  assert.ok(!sim.includes('finger sensor (PPG)'));
  checkWording(sim, 'simulated');

  sparkCalls.length = 0;
  const ses = Sg.html({ physio: null, camera: null, session: fixture, sessionLabel: 'Sun 15 Nov, 07:41', bound: false, nowMs: NOW });
  assert.ok(ses.includes('Last session with sensor data') && ses.includes('Sun 15 Nov, 07:41') && !ses.includes('Current readings') && ses.includes(FOOT));
  assert.strictEqual(count(ses, 'sim-badge'), 10);
  assert.ok(!ses.includes('not reported by this sensor version'));
  assert.strictEqual(sparkCalls.length, 3, 'one sparkline per series');
  const s = fixture.vitals.series;
  ['pulse_bpm', 'breathing_per_min', 'rmssd_ms'].forEach((k, i) => {
    const { vals, o } = sparkCalls[i];
    const finite = s[k].filter((x) => x != null);
    same(Array.from(vals), s[k]);
    assert.ok(o.domain[0] < Math.min(...finite) && o.domain[1] > Math.max(...finite), `${k}: domain from the data`);
    assert.ok(o.band[1] < o.domain[0], `${k}: no baseline band inside the drawing`);
  });
  checkWording(ses, 'session, simulated');

  sparkCalls.length = 0;
  const realHtml = Sg.html({ physio: null, camera: null, session: real, bound: false, nowMs: NOW });
  assert.ok(realHtml.includes('signal quality not reported by this sensor version; not used by the game'));
  assert.ok(!realHtml.includes('sim-badge') && realHtml.includes('2026-11-15 07:41'));
  checkWording(realHtml, 'session, real');

  const flat = JSON.parse(JSON.stringify(real));
  flat.vitals.series = { step_s: 5, t_s: [0, 5, 10], pulse_bpm: [70, 70, 70], breathing_per_min: [null, 12, null], rmssd_ms: [null, null, null] };
  sparkCalls.length = 0;
  Sg.html({ physio: null, camera: null, session: flat, bound: false, nowMs: NOW });
  assert.strictEqual(sparkCalls.length, 1, 'a series needs two points to be drawn');
  assert.ok(sparkCalls[0].o.domain[0] < 70 && sparkCalls[0].o.domain[1] > 70);
  flat.vitals.series = null;
  assert.ok(Sg.html({ physio: null, camera: null, session: flat, bound: false, nowMs: NOW }).includes('Pulse (fused)'));

  // values from the wire are escaped
  const evil = Sg.html({ physio: null, camera: { ...CAM, trust_label: '<img src=x onerror=1>' }, at: NOW, via: 'phone', session: null, bound: false, nowMs: NOW });
  assert.ok(!evil.includes('<img') && evil.includes('&lt;img'));
}

// 2. The real page scripts together (charts.js, signals.js, views.js) with a minimal browser stub:
//    which source wins, the hidden empty section, and where the section sits in the patient detail.
function loadPage() {
  const ctx = { Math, JSON, Number, String, Array, Object, Date, console };
  ctx.window = ctx;
  ctx.document = { documentElement: {}, getElementById: () => null };
  ctx.getComputedStyle = () => ({ getPropertyValue: () => '#123456' });
  vm.createContext(ctx);
  for (const f of ['charts.js', 'signals.js', 'views.js']) vm.runInContext(read(WEB, f), ctx);
  return ctx.C;
}
{
  const C = loadPage();
  const V = C.views;
  const state = () => ({ fixtures: false, list: json('patients_list.json'), analytics: { anna: json('analytics_anna.json') }, detail: { anna: { sessions: [] } },
    live: {}, missing: {}, bedside: null, bedsideAt: null, ui: { feature: null } });

  // nothing for a patient without current data or session vitals
  let S = state();
  assert.strictEqual(V.signalsBody(S, 'anna'), '');
  assert.ok(/<section id="signals"[^>]* hidden>/.test(V.signals(S, 'anna')));

  // the bound patient gets the "not yet" line; another patient gets nothing
  S.bedside = { source: 'unoq_http', patient_id: 'anna', physio: null };
  assert.ok(V.signalsBody(S, 'anna').includes('No finger sensor reading yet'));
  assert.strictEqual(V.signalsBody(S, 'mikko'), '');
  assert.ok(!/ hidden>/.test(V.signals(S, 'anna')) && V.signals(S, 'anna').includes('<h2>Signals</h2>'));

  // hub data for the bound patient
  S.bedside.physio = HTTP;
  S.bedsideAt = NOW - 500;
  let inp = V.signalsInput(S, 'anna', NOW);
  same([inp.via, inp.physio, inp.at, inp.bound], ['hub', HTTP, NOW - 500, true]);
  assert.strictEqual(V.signalsInput(S, 'mikko', NOW).physio, null);

  // phone data newer than 5 s wins; after that the hub; phone data older than a minute is gone
  S.live.anna = { active: true, physio: BLE, camera: CAM, at: NOW - 1000, via: 'phone' };
  inp = V.signalsInput(S, 'anna', NOW);
  same([inp.via, inp.physio, inp.camera, inp.at, inp.cameraAt], ['phone', BLE, CAM, NOW - 1000, NOW - 1000]);
  S.live.anna.at = NOW - 6000;
  inp = V.signalsInput(S, 'anna', NOW);
  same([inp.via, inp.physio, inp.camera], ['hub', HTTP, CAM]);
  S.bedside = null;
  inp = V.signalsInput(S, 'anna', NOW);
  same([inp.via, inp.physio, inp.bound], ['phone', BLE, false]);
  assert.ok(C.signals.html(inp).includes('no current reading'));
  S.live.anna.at = NOW - 61000;
  inp = V.signalsInput(S, 'anna', NOW);
  same([inp.physio, inp.camera], [null, null]);
  assert.strictEqual(C.signals.html(inp), '');

  // a phone without a finger reading does not hide the hub's
  S = state();
  S.bedside = { patient_id: 'anna', physio: HTTP };
  S.bedsideAt = NOW;
  S.live.anna = { physio: null, camera: null, at: NOW };
  assert.strictEqual(V.signalsInput(S, 'anna', NOW).via, 'hub');

  // the newest session that has sensor blocks; fixture mode shows the session rows only
  S = state();
  const older = { ...fixture, session_id: 'older', started_iso: '2026-11-14T07:30:00+02:00' };
  S.detail.anna.sessions = [older, fixture, { session_id: 'plain', started_iso: '2026-11-15T09:00:00+02:00', vitals: { pulse_mean_bpm: 70 } }, { session_id: 'none' }];
  inp = V.signalsInput(S, 'anna', NOW);
  assert.strictEqual(inp.session.session_id, fixture.session_id);
  assert.strictEqual(inp.sessionLabel, 'Sun 15 Nov, 07:41');
  S.fixtures = true;
  S.live.anna = { physio: BLE, camera: CAM, at: NOW };
  S.bedside = { patient_id: 'anna', physio: HTTP };
  inp = V.signalsInput(S, 'anna', NOW);
  same([inp.physio, inp.camera, inp.bound, inp.session.session_id], [null, null, false, fixture.session_id]);
  const body = V.signalsBody(S, 'anna');
  assert.ok(body.includes('Last session with sensor data') && !body.includes('Current readings') && body.includes('<svg class="spark"'));
  checkWording(body, 'page, fixture mode');

  // in the patient detail the section sits between "What moved" and the suggestion
  const detail = V.detail(S, 'anna');
  const iMoved = detail.indexOf('What moved'), iSig = detail.indexOf('<section id="signals"'), iSuggest = detail.indexOf('class="suggest"');
  assert.ok(iMoved > 0 && iSig > iMoved && iSuggest > iSig);
  assert.strictEqual(count(detail, 'id="signals"'), 1);
}

// the page loads signals.js between charts.js and views.js
{
  const page = read(WEB, 'index.html');
  const order = ['charts.js', 'signals.js', 'views.js', 'clinic.js'].map((f) => page.indexOf(`<script src="${f}"></script>`));
  assert.ok(order.every((i) => i > 0) && order.join() === [...order].sort((a, b) => a - b).join(), 'script order');
}

// 3. The numbers of a patient code ("Show to my doctor"): weekly medians, one tile each, with unit, source and the
//    Simulated badge. Finger sensor numbers under Signals, face numbers under Face. A week without a reading is null.
const INTERPRETING = /\b(stress\w*|strain\w*|screening|treat\w*|normal|abnormal|elevated|reduced|worse\w*|better|improv\w*|declin\w*|risk\w*|healthy|unhealthy|good|bad|poor|high|higher|low|lower|usual|anxi\w*|calm\w*|relax\w*|tense|depress\w*|mood|warning|alarm\w*|concern\w*)\b/;
const FEELINGS = /\b(happ\w*|sad\w*|joy\w*|emotion\w*|affect\w*|nervous\w*|friendly|engag\w*|attenti\w*|bored\w*|tired\w*|express\w*|flat)\b/;
function checkCodeWording(html, what) {
  const low = html.replace(/<[^>]*>/g, ' ').toLowerCase();
  for (const re of [INTERPRETING, FEELINGS]) { const hit = re.exec(low); assert.ok(!hit, `${what}: "${hit && hit[0]}"`); }
  assert.strictEqual(count(low, 'diagnos'), count(low, 'not a diagnosis'), `${what}: "diagnos" outside "not a diagnosis"`);
  for (const w of ['live', 'current', 'now', 'ago', 'streaming']) assert.ok(!new RegExp(`\\b${w}\\b`).test(low), `${what}: the word ${w}`);
  assert.ok(!html.includes(String.fromCharCode(0x2014)), `${what}: em dash`);
  assert.ok(!/undefined|NaN|\[object/.test(html), `${what}: unformatted value`);
}
const WEEKLY_FOOT = 'Handed over by the patient in this code: weekly medians with their source. Support for monitoring and follow-up, not a diagnosis. HRV is shown as a number and is not part of the index.';
const FACE_FOOT = 'Handed over by the patient in this code: weekly medians from the phone camera, named by what the face did. Camera images and face meshes never leave the phone. Support for monitoring and follow-up, not a diagnosis. Not part of the index.';
const measured = () => ({
  weekly: { pulse_bpm: [null, null, 71.2, 69.8, null, 72.4, 70.1, 68.9], breathing_per_min: [null, null, 12.4, 11.9, null, 13.1, 12.2, 11.6], rmssd_ms: [null, null, 41.5, 38.2, null, 44.9, null, null] },
  days: { pulse_bpm: 21, breathing_per_min: 21, rmssd_ms: 1 },
  simulated: { pulse_bpm: false, breathing_per_min: false, rmssd_ms: false },
});
const NO_VITALS = { weekly: { pulse_bpm: Array(8).fill(null), breathing_per_min: Array(8).fill(null), rmssd_ms: Array(8).fill(null) },
  days: { pulse_bpm: 0, breathing_per_min: 0, rmssd_ms: 0 }, simulated: { pulse_bpm: false, breathing_per_min: false, rmssd_ms: false } };
const FKEYS = ['smile_share', 'blinks_per_min', 'gaze_away_share'];
const faceMeasured = () => ({
  weekly: { smile_share: [null, 0.12, 0.18, 0, null, 0.21, 0.15, 0.09], blinks_per_min: [null, 14, 17, 12, null, 19, 16, 15], gaze_away_share: [null, 0.08, 0.11, 0.05, null, 0.06, null, null],
    micro_per_min: [null, 2.4, 3.1, 1.8, null, 2.2, 2.9, 2.5], breathing_per_min: [null, 13.2, 12.8, 14.1, null, 12.5, 13.4, 12.9] },
  days: { smile_share: 19, blinks_per_min: 19, gaze_away_share: 1, micro_per_min: 19, breathing_per_min: 12 },
  simulated: { smile_share: false, blinks_per_min: false, gaze_away_share: false, micro_per_min: false, breathing_per_min: false },
});
const NO_FACE = { weekly: Object.fromEntries(FKEYS.map((k) => [k, Array(8).fill(null)])), days: Object.fromEntries(FKEYS.map((k) => [k, 0])), simulated: Object.fromEntries(FKEYS.map((k) => [k, false])) };
{
  const rows = Sg.weeklyRows(measured());
  const r = byKey(rows);
  same(rows.map((x) => [x.key, x.label, x.unit]), [['pulse_bpm', 'Pulse, finger sensor', 'bpm'], ['breathing_per_min', 'Breathing rate', 'per min'], ['rmssd_ms', 'HRV (RMSSD)', 'ms']]);
  same([r.pulse_bpm.value, r.pulse_bpm.week, r.pulse_bpm.days], ['68.9', 7, 21]);
  same([r.breathing_per_min.value, r.breathing_per_min.week], ['11.6', 7]);
  // the newest week that has a value, when the last weeks have none
  same([r.rmssd_ms.value, r.rmssd_ms.week, r.rmssd_ms.days], ['44.9', 5, 1]);
  same(r.rmssd_ms.weeks, [null, null, 41.5, 38.2, null, 44.9, null, null]);
  assert.ok(rows.every((x) => x.simulated === false && x.missing === false && x.source === 'finger sensor (PPG)'));

  // a code made before the block existed, and odd input: no rows
  for (const none of [undefined, null, 'x', 7]) same(Sg.weeklyRows(none), []);
  // a block without a reading: three rows, all missing; 0 and junk are missing too, never a value
  for (const empty of [NO_VITALS, {}, { weekly: {} }, { weekly: { pulse_bpm: [0, 0, 0, 0, 0, 0, 0, 0], breathing_per_min: ['12', NaN, -4], rmssd_ms: 'x' }, days: { pulse_bpm: 9 }, simulated: { pulse_bpm: true } }]) {
    const e = Sg.weeklyRows(empty);
    assert.strictEqual(e.length, 3);
    assert.ok(e.every((x) => x.missing && x.value === 'no reading' && x.week === null && x.days === null && x.simulated === false && x.weeks.every((w) => w === null)));
  }

  // the badge follows the row, not the code
  const sim = measured();
  sim.simulated.rmssd_ms = true;
  const sr = byKey(Sg.weeklyRows(sim));
  same([sr.pulse_bpm.simulated, sr.rmssd_ms.simulated, sr.rmssd_ms.source, sr.pulse_bpm.source], [false, true, 'simulator', 'finger sensor (PPG)']);

  const labels = [];
  const html = Sg.weeklyHtml(measured(), (i) => { labels.push(i); return `W${i}`; });
  for (const s of ['Pulse, finger sensor', '68.9<small> bpm</small>', 'Breathing rate', '11.6<small> per min</small>', 'HRV (RMSSD)', '44.9<small> ms</small>',
    'finger sensor (PPG)', 'week from W7', 'week from W5', '21 days with a reading', '1 day with a reading', 'session mean, clips on during play',
    'id="sig-pulse_bpm"', 'id="sig-breathing_per_min"', 'id="sig-rmssd_ms"', WEEKLY_FOOT]) assert.ok(html.includes(s), s);
  same(labels, [7, 7, 5]);
  assert.ok(!html.includes('sim-badge') && !html.includes('no reading'));
  // neither posture nor place is recorded with the clips, so neither is stated
  for (const w of ['sitting', 'lying', 'home', 'resting']) assert.ok(!html.toLowerCase().includes(w), w);
  checkCodeWording(html, 'weekly, measured');

  const simHtml = Sg.weeklyHtml(sim, (i) => `W${i}`);
  assert.strictEqual(count(simHtml, '<span class="sim-badge small">Simulated</span>'), 1);
  assert.ok(simHtml.includes('simulator'));
  checkCodeWording(simHtml, 'weekly, simulated');

  // one number without a reading next to two with: its tile says so and gets no chart
  const part = measured();
  part.weekly.rmssd_ms = Array(8).fill(null);
  const partHtml = Sg.weeklyHtml(part, (i) => `W${i}`);
  assert.ok(partHtml.includes('no reading') && !partHtml.includes('id="sig-rmssd_ms"') && partHtml.includes('id="sig-pulse_bpm"'));
  assert.strictEqual(count(partHtml, 'class="mm sig-mm none"'), 1);

  const notCarried = Sg.weeklyHtml(undefined);
  assert.ok(notCarried.includes('This code carries no finger sensor numbers'));
  const noWeeks = Sg.weeklyHtml(NO_VITALS);
  assert.ok(noWeeks.includes('No finger sensor reading in these 8 weeks.'));
  for (const h of [notCarried, noWeeks]) { assert.ok(!h.includes('chart-wrap') && !h.includes('<small>')); checkCodeWording(h, 'weekly, none'); }
}

// face numbers: plain names, a share in percent, 0 is a value, a week without a reading is null
{
  const rows = Sg.faceRows(faceMeasured());
  const r = byKey(rows);
  same(rows.map((x) => [x.key, x.label, x.unit]), [['smile_share', 'Smiling', '% of the time'], ['blinks_per_min', 'Blinks', 'per min'], ['gaze_away_share', 'Looking away', '% of the time']]);
  same([r.smile_share.value, r.smile_share.week, r.smile_share.days], ['9', 7, 19]);
  same([r.blinks_per_min.value, r.blinks_per_min.week], ['15', 7]);
  same([r.gaze_away_share.value, r.gaze_away_share.week, r.gaze_away_share.days], ['6', 5, 1]);
  same(r.smile_share.weeks, [null, 0.12, 0.18, 0, null, 0.21, 0.15, 0.09]);
  assert.strictEqual(r.smile_share.fmt(0), '0');
  assert.ok(rows.every((x) => x.simulated === false && x.missing === false && x.source === 'phone camera (TrueDepth face tracking)'));
  // only what the code carries: brief facial movements and the camera breathing rate stay on the hub
  assert.ok(!rows.some((x) => x.key === 'micro_per_min' || x.key === 'breathing_per_min'));

  const zero = byKey(Sg.faceRows({ weekly: { smile_share: Array(8).fill(0) }, days: { smile_share: 40 }, simulated: {} }));
  same([zero.smile_share.value, zero.smile_share.missing, zero.smile_share.week], ['0', false, 7]);

  for (const none of [undefined, 'x', 7]) same(Sg.faceRows(none), []);
  for (const empty of [NO_FACE, {}, { weekly: {} }, { weekly: { smile_share: [-0.1, 1.2, '0.2', NaN], blinks_per_min: [-1], gaze_away_share: 'x' }, days: { smile_share: 9 }, simulated: { smile_share: true } }]) {
    const e = Sg.faceRows(empty);
    assert.strictEqual(e.length, 3);
    assert.ok(e.every((x) => x.missing && x.value === 'no reading' && x.week === null && x.days === null && x.simulated === false && x.weeks.every((w) => w === null)));
  }

  const sim = faceMeasured();
  sim.simulated.blinks_per_min = true;
  const sr = byKey(Sg.faceRows(sim));
  same([sr.smile_share.simulated, sr.blinks_per_min.simulated, sr.blinks_per_min.source], [false, true, 'simulator']);

  const html = Sg.faceHtml(faceMeasured(), (i) => `W${i}`);
  for (const s of ['Smiling', '9<small> % of the time</small>', 'Blinks', '15<small> per min</small>', 'Looking away', '6<small> % of the time</small>',
    'phone camera (TrueDepth face tracking)', 'week from W7', 'week from W5', '19 days with a reading', '1 day with a reading', 'share of the seconds with the face in view',
    'gaze more than 25° off the screen', 'id="face-smile_share"', 'id="face-blinks_per_min"', 'id="face-gaze_away_share"', FACE_FOOT]) assert.ok(html.includes(s), s);
  assert.ok(!html.includes('sim-badge') && !html.includes('no reading') && !html.includes('id="sig-'));
  checkCodeWording(html, 'face, measured');
  const simHtml = Sg.faceHtml(sim, (i) => `W${i}`);
  assert.strictEqual(count(simHtml, '<span class="sim-badge small">Simulated</span>'), 1);
  checkCodeWording(simHtml, 'face, simulated');

  const notCarried = Sg.faceHtml(undefined);
  assert.ok(notCarried.includes('This code carries no face numbers. It was made before the app added them.'));
  const leftOut = Sg.faceHtml(null);
  assert.ok(leftOut.includes('This code was full, so the face numbers were left out. Everything else is in it.'));
  const noWeeks = Sg.faceHtml(NO_FACE);
  assert.ok(noWeeks.includes('No face reading in these 8 weeks.'));
  for (const h of [notCarried, leftOut, noWeeks]) { assert.ok(!h.includes('chart-wrap') && !h.includes('<small>')); checkCodeWording(h, 'face, none'); }
}

// 4. The imported view: a code made by the phone codec, decoded like the dashboard does, and shown.
{
  const QR = require(path.join(ROOT, 'demo', 'js', 'qrpayload.js'));
  const key = QR.newKey();
  const scan = (change, maxChars) => {
    const j = json('qr_body_anna.json');
    for (const [k, v] of Object.entries(change)) { if (v === undefined) delete j[k]; else j[k] = v; }
    const d = QR.decode(QR.encode(j, { key, now: NOW, maxChars }).text, { now: NOW });
    assert.strictEqual(d.status, 'ok');
    return { cti: d.cti, fp: d.fingerprint, iat: d.iat, exp: d.exp, scanned_iso: new Date(NOW).toISOString(), body: d.body };
  };
  const ctx = { Math, JSON, Number, String, Array, Object, Date, console };
  ctx.window = ctx;
  ctx.document = { documentElement: {}, getElementById: () => null };
  ctx.getComputedStyle = () => ({ getPropertyValue: () => '#123456' });
  vm.createContext(ctx);
  for (const f of ['charts.js', 'signals.js', 'views.js']) vm.runInContext(read(WEB, f), ctx);
  const C = ctx.C;
  const imports = new Map();
  C.codes = { all: () => [...imports.values()], get: (cti) => imports.get(cti), label: () => 'Patient TEST', key: () => null };
  C.scanFmt = { day: () => '15 Nov', when: () => '15 Nov 10:12' };
  C.qr = { FEATURES: QR.FEATURES.map((f) => f[0]) };
  vm.runInContext(read(WEB, 'imported.js'), ctx);
  const V = C.views;
  const show = (imp) => { imports.set(imp.cti, imp); return V.imported({}, imp.cti); };
  const section = (page, label) => { const m = new RegExp(`<section class="signals" aria-label="${label}">[\\s\\S]*?</section>`).exec(page); assert.ok(m, `${label} section`); return m[0]; };
  const visible = (s) => s.replace(/aria-label="[^"]*"/g, '').replace(/data-tip="[^"]*"/g, '');

  const imp = scan({ vitals: measured(), face: faceMeasured() });
  const page = show(imp);
  const sig = section(page, 'Signals');
  for (const s of ['<h2>Signals, 8 weeks</h2>', 'finger sensor, weekly medians', 'Pulse, finger sensor', '68.9<small> bpm</small>', 'Breathing rate', '11.6<small> per min</small>',
    'HRV (RMSSD)', '44.9<small> ms</small>', 'finger sensor (PPG)', '21 days with a reading', 'id="sig-pulse_bpm"', WEEKLY_FOOT]) assert.ok(sig.includes(s), s);
  assert.ok(!sig.includes('sim-badge'), 'measured rows carry no badge, though the demo code as a whole is simulated');
  checkCodeWording(visible(sig), 'imported, signals');
  const fc = section(page, 'Face');
  for (const s of ['<h2>Face, 8 weeks</h2>', 'phone camera, weekly medians', 'Smiling', '9<small> % of the time</small>', 'Blinks', '15<small> per min</small>',
    'Looking away', '6<small> % of the time</small>', 'phone camera (TrueDepth face tracking)', '19 days with a reading', 'id="face-smile_share"', FACE_FOOT]) assert.ok(fc.includes(s), s);
  assert.ok(!fc.includes('sim-badge'));
  checkCodeWording(visible(fc), 'imported, face');
  const tip = /data-tip="([^"]*)"/.exec(fc)[1].toLowerCase();
  assert.ok(tip.includes('named by what the face did') && !FEELINGS.test(tip) && !/\b(mood|anxi\w*|calm\w*|depress\w*|stress\w*)\b/.test(tip), tip);
  assert.ok(page.includes('Simulated'), 'the code of a simulated patient stays marked');
  const iMeasures = page.indexOf('Measures, 8 weeks'), iSig = page.indexOf('aria-label="Signals"'), iFace = page.indexOf('aria-label="Face"'), iFacts = page.indexOf('Mornings lit');
  assert.ok(iMeasures > 0 && iSig > iMeasures && iFace > iSig && iFacts > iFace, 'Signals and Face sit between the measures and the facts');
  assert.ok(page.includes('Not live data.'));
  // the numbers are not a tenth feature: no tile among the measures and no usual range
  assert.strictEqual(count(page, 'id="mm-'), 9);

  const charts = [];
  ctx.document.getElementById = (id) => ({ id });
  C.seriesChart = (el, o) => charts.push({ id: el.id, o });
  V.drawImported({}, imp.cti);
  const drawn = Object.fromEntries(charts.filter((c) => c.id.startsWith('sig-') || c.id.startsWith('face-')).map((c) => [c.id, c.o]));
  same(Object.keys(drawn), ['sig-pulse_bpm', 'sig-breathing_per_min', 'sig-rmssd_ms', 'face-smile_share', 'face-blinks_per_min', 'face-gaze_away_share']);
  same(drawn['sig-pulse_bpm'].values, [null, null, 71.2, 69.8, null, 72.4, 70.1, 68.9]);
  same(drawn['face-smile_share'].values, [null, 0.12, 0.18, 0, null, 0.21, 0.15, 0.09]);
  same(drawn['face-gaze_away_share'].values, [null, 0.08, 0.11, 0.05, null, 0.06, null, null]);
  for (const o of Object.values(drawn)) assert.ok(o.band == null && o.mid == null && o.threshold == null && o.connect === false && o.dots === true, 'numbers only: no range, no line across a gap, a dot per week with a value');
  assert.ok(drawn['sig-pulse_bpm'].tip(7).includes('68.9 bpm') && drawn['sig-pulse_bpm'].tip(0).includes('no value'));
  assert.ok(drawn['face-smile_share'].tip(7).includes('9 % of the time') && drawn['face-smile_share'].tip(3).includes('0 % of the time') && drawn['face-smile_share'].tip(0).includes('no value'));
  assert.ok(drawn['face-blinks_per_min'].tip(6).includes('16 per min'));

  const sim = faceMeasured();
  sim.simulated = Object.fromEntries(Object.keys(sim.simulated).map((k) => [k, true]));
  assert.strictEqual(count(section(show(scan({ face: sim })), 'Face'), '<span class="sim-badge small">Simulated</span>'), 3);
  const empty = section(show(scan({ vitals: NO_VITALS })), 'Face');
  assert.ok(empty.includes('No face reading in these 8 weeks.') && !empty.includes('chart-wrap'));
  const before = show(scan({ vitals: undefined, face: undefined }));
  assert.ok(section(before, 'Signals').includes('This code carries no finger sensor numbers') && section(before, 'Face').includes('This code carries no face numbers'));
  // a full code: the face numbers went first, everything else is there
  const full = scan({ vitals: measured(), face: faceMeasured() }, QR.encode({ ...json('qr_body_anna.json'), vitals: measured(), face: faceMeasured() }, { key, now: NOW }).chars - 20);
  assert.strictEqual(full.body.face, null);
  const fullPage = show(full);
  assert.ok(section(fullPage, 'Face').includes('This code was full, so the face numbers were left out.') && section(fullPage, 'Signals').includes('68.9<small> bpm</small>'));
  charts.length = 0;
  V.drawImported({}, full.cti);
  assert.ok(!charts.some((c) => c.id.startsWith('face-')));

  // a code from the encoder before this change (frozen fixture) is shown the same way
  const frozen = json('qr_code_before_vitals.json');
  const old = QR.decode(frozen.text, { now: frozen.now_ms });
  assert.strictEqual(old.status, 'ok');
  const oldPage = show({ cti: old.cti, fp: old.fingerprint, iat: old.iat, exp: old.exp, scanned_iso: new Date(NOW).toISOString(), body: old.body });
  assert.ok(section(oldPage, 'Signals').includes('This code carries no finger sensor numbers') && section(oldPage, 'Face').includes('This code carries no face numbers') && oldPage.includes('Measures, 8 weeks'));
}

console.log('clinic_signals: ok');
