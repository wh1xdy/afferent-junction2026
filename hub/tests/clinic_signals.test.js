// Run: node hub/tests/clinic_signals.test.js
// The Signals section of the clinic view (Decisions I53, contracts/api.md section 3.5): labels, units, source texts,
// staleness, the Simulated badge and the wording rules. The physio and camera objects below are test input, not measurements.
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

console.log('clinic_signals: ok');
