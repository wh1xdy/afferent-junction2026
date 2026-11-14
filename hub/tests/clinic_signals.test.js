// Run: node hub/tests/clinic_signals.test.js
// The Signals sections of the clinic view. They have two inputs and no other:
//   1. the sensor blocks of a session document stored on the patient's own hub (patient detail)
//   2. the weekly finger sensor numbers of a code the patient handed over (imported view)
// Checked here: labels, units, source texts, the Simulated badge, the wording rules, and that nothing in the
// clinic web code takes a current sensor value. The objects below are test input, not measurements.
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
const count = (s, sub) => s.split(sub).length - 1;

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

// what a phone or the bedside source would send while measuring; the clinic view has no use for it any more
const BLE = { source: 'finger_ppg', transport: 'ble', simulated: false, pulse_bpm: 72, quality: null, quality_reported: false, contact: true,
  finger_bpm: [72, 74], breathing_per_min: 12, rmssd_ms: 41, sdnn_ms: null, rmssd_vs_baseline: null, presence: null, age_s: 0.6, link: 'connected' };
const HTTP = { source: 'finger_ppg', transport: 'hub_http', simulated: false, pulse_bpm: 71, quality: 0.62, quality_reported: true, contact: true,
  finger_bpm: [71, null], breathing_per_min: 11, rmssd_ms: 41.5, sdnn_ms: 46, rmssd_vs_baseline: -0.08, presence: 'active', age_s: 0.4 };
const CAM = { source: 'rppg', bpm: 74.5, trust_score: 82, trust_label: 'reliable', age_s: 0.9 };
const NOW = 1_800_000_000_000;

// the module offers the stored session and the handed-over code, and nothing for current readings
same(Object.keys(Sg).sort(), ['html', 'sessionRows', 'weeklyHtml', 'weeklyRows']);

// Wording rules for everything the sections print.
const INTERPRETING = /\b(stress\w*|strain\w*|screening|treat\w*|normal|abnormal|elevated|reduced|worse\w*|better|improv\w*|declin\w*|risk\w*|healthy|unhealthy|good|bad|poor|high|higher|low|lower|usual|anxi\w*|calm\w*|relax\w*|tense|depress\w*|mood|warning|alarm\w*|concern\w*)\b/;
function checkWording(html, what) {
  const text = html.replace(/<[^>]*>/g, ' ');
  const low = text.toLowerCase();
  const hit = INTERPRETING.exec(low);
  assert.ok(!hit, `${what}: "${hit && hit[0]}"`);
  assert.strictEqual(count(low, 'diagnos'), count(low, 'not a diagnosis'), `${what}: "diagnos" outside "not a diagnosis"`);
  for (const w of ['live', 'current', 'now', 'ago', 'streaming']) assert.ok(!new RegExp(`\\b${w}\\b`).test(low), `${what}: the word ${w}`);
  assert.ok(!html.includes(String.fromCharCode(0x2014)), `${what}: em dash`);
  assert.ok(!/undefined|NaN|\[object/.test(html), `${what}: unformatted value`);
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
  for (const x of rows) for (const k of ['age', 'ageText', 'stale']) assert.ok(!(k in x), `a stored row has no ${k}`);
}

// the same session as a real Bluetooth recording: no badge, true source, no SDNN or baseline
const NO_STAT = { mean: null, min: null, max: null, first: null, last: null, samples: 0 };
const real = JSON.parse(JSON.stringify(fixture));
real.simulated_fields = [];
Object.assign(real.vitals.finger, { source: 'finger_ppg', transport: 'ble', presence_s: null });
real.vitals.breathing.source = 'finger_ppg';
Object.assign(real.vitals.hrv, { source: 'finger_ppg', sdnn_ms: null, rmssd_vs_baseline: null });
// and as recorded from a sensor version that does not report its signal quality (AFF1 v1)
const noQuality = JSON.parse(JSON.stringify(real));
Object.assign(noQuality.vitals.finger, { quality_reported: false, quality: { ...NO_STAT } });
{
  const rows = Sg.sessionRows(real.vitals, real.simulated_fields);
  const r = byKey(rows);
  assert.ok(rows.every((x) => x.simulated === false));
  assert.ok(!r.sdnn && !r.vs_baseline && !r.presence);
  assert.strictEqual(r.pulse.note, '71 to 79, signal quality 0.62');
  same([r.pulse.value, r.finger_1.value, r.finger_2.value, r.breathing.value, r.rmssd.value], ['73.9', '74.3', '73.2', '10.9', '41.4']);
  for (const k of ['pulse', 'finger_1', 'finger_2', 'breathing', 'rmssd']) assert.strictEqual(r[k].source, 'finger sensor (PPG), Bluetooth via the phone');

  // The rule of the patient code (hub/afferent_hub/qr.py session_vital) holds here too: without a reported signal quality,
  // or with one below 0.3, the stored numbers are not shown as measurements. The rows stay and say why.
  const VITAL_ROWS = ['pulse', 'finger_1', 'finger_2', 'fingers_diff', 'breathing', 'rmssd'];
  const refused = (vitals, why) => {
    const x = byKey(Sg.sessionRows(vitals, []));
    for (const k of VITAL_ROWS) same([k, x[k].value, x[k].missing, x[k].note, x[k].series], [k, 'no reading', true, why, null]);
    assert.ok(!x.sdnn && !x.vs_baseline, 'no derived row either');
    const page = Sg.html({ session: { started_iso: '2026-11-15T07:41:00+02:00', vitals, simulated_fields: [] } });
    for (const n of ['73.9', '74.3', '73.2', '10.9', '41.4', '46.2', '71 to 79', '38 → 44']) assert.ok(!page.includes(n), `${why}: ${n} is shown`);
    assert.strictEqual(count(page, 'class="sig-row none"'), VITAL_ROWS.length);
    checkWording(page, why);
    return x;
  };
  refused(noQuality.vitals, 'signal quality not reported');
  const weak = JSON.parse(JSON.stringify(real));
  weak.vitals.hrv.sdnn_ms = fixture.vitals.hrv.sdnn_ms;
  Object.assign(weak.vitals.finger.quality, { mean: 0.12, min: 0.05, max: 0.2 });
  weak.vitals.finger.presence_s = { idle: 0, probing: 6, active: 104 };
  const w = refused(weak.vitals, 'signal quality below 0.3');
  same([w.presence.value, w.presence.missing], ['104', false], 'how long a finger was detected is not a reading and stays');
  same([w.camera.value, w.camera.missing], ['75.1', false], 'the camera pulse has its own trust score');
  const partly = JSON.parse(JSON.stringify(real));
  Object.assign(partly.vitals.finger.quality, { mean: 0.62, min: 0.05 });
  refused(partly.vitals, 'signal quality below 0.3 in part of the session');
  const never = JSON.parse(JSON.stringify(real));
  never.vitals.finger.quality = { ...NO_STAT };
  refused(never.vitals, 'no reading at signal quality 0.3 or more');
  const noFinger = JSON.parse(JSON.stringify(real));
  noFinger.vitals.finger = null;
  const nf = byKey(Sg.sessionRows(noFinger.vitals, []));
  same([nf.breathing.value, nf.rmssd.value, nf.breathing.note], ['no reading', 'no reading', 'signal quality not reported']);
  const edge = JSON.parse(JSON.stringify(real));
  Object.assign(edge.vitals.finger.quality, { mean: 0.3, min: 0.3 });
  assert.strictEqual(byKey(Sg.sessionRows(edge.vitals, [])).pulse.value, '73.9');
  // simulated_fields alone is enough for the badge, per block
  const some = byKey(Sg.sessionRows(real.vitals, ['vitals.hrv', 'vitals.camera_pulse']));
  same([some.pulse.simulated, some.breathing.simulated, some.rmssd.simulated, some.camera.simulated], [false, false, true, true]);
  assert.ok(Sg.sessionRows(real.vitals, ['*']).every((x) => x.simulated));
  same(Sg.sessionRows(null), []);
  same(Sg.sessionRows({ pulse_mean_bpm: 70, finger: null, hrv: null }), []);
  // a missing value stays missing: no reading, never 0
  const gap = JSON.parse(JSON.stringify(real));
  gap.vitals.finger.finger_2_bpm = { mean: null, min: null, max: null, first: null, last: null, samples: 0 };
  same([byKey(Sg.sessionRows(gap.vitals, [])).finger_2.value, byKey(Sg.sessionRows(gap.vitals, [])).finger_2.missing], ['no reading', true]);
}

// html of the stored session: wording, badge, sparklines, the empty cases
const SESSION_FOOT = 'Measured values with their source, from a stored session. Support for monitoring and follow-up, not a diagnosis. HRV is shown as a number and is not part of the index.';
{
  assert.strictEqual(Sg.html({ session: null }), '');
  assert.strictEqual(Sg.html({}), '');
  assert.strictEqual(Sg.html({ session: { session_id: 'x', vitals: { pulse_mean_bpm: 70 } } }), '');

  // objects that used to feed "Current readings" are not an input any more: with them and no stored session there is nothing
  const live = { physio: HTTP, camera: CAM, at: NOW - 400, cameraAt: NOW - 400, via: 'hub', bound: true, nowMs: NOW };
  assert.strictEqual(Sg.html({ ...live, session: null }), '');
  assert.strictEqual(Sg.html({ ...live, physio: BLE, via: 'phone', session: null }), '');

  sparkCalls.length = 0;
  const ses = Sg.html({ session: fixture, sessionLabel: 'Sun 15 Nov, 07:41' });
  assert.ok(ses.includes('Last session with sensor data') && ses.includes('Sun 15 Nov, 07:41') && ses.includes(SESSION_FOOT));
  for (const s of ['Pulse (fused)', 'Finger 1', 'Finger 2', 'Breathing rate', 'HRV (RMSSD)', 'Pulse (camera)', '<small>bpm</small>', '<small>per min</small>', '<small>ms</small>', '−8<small>%</small>']) assert.ok(ses.includes(s), s);
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

  // the stored session is all the section shows, whatever else is handed in
  const withLive = Sg.html({ ...live, session: fixture, sessionLabel: 'Sun 15 Nov, 07:41' });
  assert.strictEqual(withLive, ses);
  for (const gone of ['Current readings', 'relayed by the phone', 'from the bedside source', 'just now', 's ago', 'no current reading', 'No finger sensor reading yet', 'sensor connected']) {
    assert.ok(!withLive.includes(gone), gone);
  }

  sparkCalls.length = 0;
  const realHtml = Sg.html({ session: real });
  assert.ok(!realHtml.includes('not reported by this sensor version'));
  assert.ok(!realHtml.includes('sim-badge') && realHtml.includes('2026-11-15 07:41'));
  assert.ok(realHtml.includes('finger sensor (PPG), Bluetooth via the phone'));
  assert.strictEqual(sparkCalls.length, 3);
  checkWording(realHtml, 'session, real');

  sparkCalls.length = 0;
  const noQHtml = Sg.html({ session: noQuality });
  assert.ok(noQHtml.includes('signal quality not reported by this sensor version; not used by the game'));
  assert.strictEqual(sparkCalls.length, 0, 'no series is drawn for numbers that are not shown');
  checkWording(noQHtml, 'session, no quality');

  const flat = JSON.parse(JSON.stringify(real));
  flat.vitals.series = { step_s: 5, t_s: [0, 5, 10], pulse_bpm: [70, 70, 70], breathing_per_min: [null, 12, null], rmssd_ms: [null, null, null] };
  sparkCalls.length = 0;
  Sg.html({ session: flat });
  assert.strictEqual(sparkCalls.length, 1, 'a series needs two points to be drawn');
  assert.ok(sparkCalls[0].o.domain[0] < 70 && sparkCalls[0].o.domain[1] > 70);
  flat.vitals.series = null;
  assert.ok(Sg.html({ session: flat }).includes('Pulse (fused)'));

  // values from a stored document are escaped
  const evil = JSON.parse(JSON.stringify(real));
  const evilHtml = Sg.html({ session: evil, sessionLabel: '<img src=x onerror=1>' });
  assert.ok(!evilHtml.includes('<img') && evilHtml.includes('&lt;img'));
}

// 2. The numbers of a patient code: weekly medians, one row each, with unit, source and the Simulated badge.
const WEEKLY_FOOT = 'Handed over by the patient in this code: weekly medians with their source. Support for monitoring and follow-up, not a diagnosis. HRV is shown as a number and is not part of the index.';
const measured = () => ({
  weekly: { pulse_bpm: [null, null, 71.2, 69.8, null, 72.4, 70.1, 68.9], breathing_per_min: [null, null, 12.4, 11.9, null, 13.1, 12.2, 11.6], rmssd_ms: [null, null, 41.5, 38.2, null, 44.9, null, null] },
  days: { pulse_bpm: 21, breathing_per_min: 21, rmssd_ms: 1 },
  simulated: { pulse_bpm: false, breathing_per_min: false, rmssd_ms: false },
});
const NO_VITALS = { weekly: { pulse_bpm: Array(8).fill(null), breathing_per_min: Array(8).fill(null), rmssd_ms: Array(8).fill(null) },
  days: { pulse_bpm: 0, breathing_per_min: 0, rmssd_ms: 0 }, simulated: { pulse_bpm: false, breathing_per_min: false, rmssd_ms: false } };
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
  checkWording(html, 'weekly, measured');

  const simHtml = Sg.weeklyHtml(sim, (i) => `W${i}`);
  assert.strictEqual(count(simHtml, '<span class="sim-badge small">Simulated</span>'), 1);
  assert.ok(simHtml.includes('simulator'));
  checkWording(simHtml, 'weekly, simulated');

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
  for (const h of [notCarried, noWeeks]) { assert.ok(!h.includes('chart-wrap') && !h.includes('<small>')); checkWording(h, 'weekly, none'); }
}

// 3. The real page scripts together with a minimal browser stub.
function loadPage(extra = []) {
  const ctx = { Math, JSON, Number, String, Array, Object, Date, console };
  ctx.window = ctx;
  ctx.document = { documentElement: {}, getElementById: () => null };
  ctx.getComputedStyle = () => ({ getPropertyValue: () => '#123456' });
  vm.createContext(ctx);
  for (const f of ['charts.js', 'signals.js', 'views.js']) vm.runInContext(read(WEB, f), ctx);
  return ctx;
}

// patient detail: the newest stored session with sensor blocks, the hidden empty section, and where the section sits
{
  const C = loadPage().C;
  const V = C.views;
  // the state object of clinic.js: it has no place for a current reading
  const state = () => ({ fixtures: false, list: json('patients_list.json'), analytics: { anna: json('analytics_anna.json') }, detail: { anna: { sessions: [] } },
    summary: {}, missing: {}, validation: null, ui: { feature: null, filter: 'all', q: '', theme: 'light' }, route: null, ws: null, stamp: '' });

  let S = state();
  assert.strictEqual(V.signalsBody(S, 'anna'), '');
  assert.strictEqual(V.signalsBody(S, 'mikko'), '');
  assert.ok(/<section id="signals"[^>]* hidden>/.test(V.signals(S, 'anna')));
  same(V.signalsInput(S, 'anna'), { session: null, sessionLabel: '' });

  const older = { ...fixture, session_id: 'older', started_iso: '2026-11-14T07:30:00+02:00' };
  S.detail.anna.sessions = [older, fixture, { session_id: 'plain', started_iso: '2026-11-15T09:00:00+02:00', vitals: { pulse_mean_bpm: 70 } }, { session_id: 'none' }];
  let inp = V.signalsInput(S, 'anna');
  same(Object.keys(inp).sort(), ['session', 'sessionLabel']);
  assert.strictEqual(inp.session.session_id, fixture.session_id);
  assert.strictEqual(inp.sessionLabel, 'Sun 15 Nov, 07:41');
  const body = V.signalsBody(S, 'anna');
  assert.ok(body.includes('<h2>Signals</h2>') && body.includes('stored sessions') && body.includes('Last session with sensor data') && body.includes('<svg class="spark"'));
  assert.ok(!/ hidden>/.test(V.signals(S, 'anna')));
  checkWording(body.replace(/aria-label="[^"]*"/g, '').replace(/data-tip="[^"]*"/g, ''), 'page, stored session');
  assert.ok(body.includes('None of them is a current reading'), 'the tooltip says what the numbers are');

  // sensor objects pushed into the state, as the removed socket handlers did, change nothing on the page
  const pushed = state();
  pushed.detail.anna.sessions = S.detail.anna.sessions;
  pushed.live = { anna: { physio: BLE, camera: CAM, at: Date.now(), via: 'phone' } };
  pushed.bedside = { source: 'unoq_http', patient_id: 'anna', physio: HTTP };
  pushed.bedsideAt = Date.now();
  assert.strictEqual(V.signalsBody(pushed, 'anna'), body);
  pushed.detail.anna.sessions = [];
  assert.strictEqual(V.signalsBody(pushed, 'anna'), '');

  // fixture mode shows the same stored session rows
  S.fixtures = true;
  assert.strictEqual(V.signalsBody(S, 'anna'), body);

  // in the patient detail the section sits between "What moved" and the suggestion
  const detail = V.detail(S, 'anna');
  const iMoved = detail.indexOf('What moved'), iSig = detail.indexOf('<section id="signals"'), iSuggest = detail.indexOf('class="suggest"');
  assert.ok(iMoved > 0 && iSig > iMoved && iSuggest > iSig);
  assert.strictEqual(count(detail, 'id="signals"'), 1);
  // and the detail renders for a patient without any stored session, with the state clinic.js really has
  assert.ok(V.detail(state(), 'anna').includes('<section id="signals"'));

  // "Sensors on" does not count bed presence: no bed sensor exists,
  // whether the hub sends the key as false or, from a database seeded earlier, as true
  const sensors = { phone_camera: true, pulse_stone: true, bedside_camera: false, bedside_light: true, phone_presence: true, phone_motion: true };
  for (const presence of [false, true]) {
    S.detail.anna = { sessions: [], privacy: { sharing: 'summary', sensors: { ...sensors, presence } } };
    assert.ok(V.detail(S, 'anna').includes('<div class="k">Sensors on</div><div class="v"><span class="num">5 of 6</span></div>'), `presence ${presence}`);
  }
}

// imported view: a code is made by the phone codec, decoded like the dashboard does, and shown
{
  const QR = require(path.join(ROOT, 'demo', 'js', 'qrpayload.js'));
  const key = QR.newKey();
  const scan = (vitals, drop = false) => {
    const j = json('qr_body_anna.json');
    if (drop) delete j.vitals; else j.vitals = vitals;
    const d = QR.decode(QR.encode(j, { key, now: NOW }).text, { now: NOW });
    assert.strictEqual(d.status, 'ok');
    return { cti: d.cti, fp: d.fingerprint, iat: d.iat, exp: d.exp, scanned_iso: new Date(NOW).toISOString(), body: d.body };
  };
  const ctx = loadPage();
  const C = ctx.C;
  const imports = new Map();
  C.codes = { all: () => [...imports.values()], get: (cti) => imports.get(cti), label: () => 'Patient TEST', key: () => null };
  C.scanFmt = { day: () => '15 Nov', when: () => '15 Nov 10:12' };
  C.qr = { FEATURES: QR.FEATURES.map((f) => f[0]) };
  vm.runInContext(read(WEB, 'imported.js'), ctx);
  const V = C.views;
  const show = (imp) => { imports.set(imp.cti, imp); return V.imported({}, imp.cti); };
  const section = (page) => { const m = /<section class="signals"[\s\S]*?<\/section>/.exec(page); assert.ok(m, 'Signals section'); return m[0]; };
  const visible = (s) => s.replace(/aria-label="[^"]*"/g, '').replace(/data-tip="[^"]*"/g, '');

  const imp = scan(measured());
  const page = show(imp);
  const sig = section(page);
  for (const s of ['<h2>Signals, 8 weeks</h2>', 'finger sensor, weekly medians', 'Pulse, finger sensor', '68.9<small> bpm</small>', 'Breathing rate', '11.6<small> per min</small>',
    'HRV (RMSSD)', '44.9<small> ms</small>', 'finger sensor (PPG)', '21 days with a reading', 'id="sig-pulse_bpm"', WEEKLY_FOOT]) assert.ok(sig.includes(s), s);
  assert.ok(!sig.includes('sim-badge'), 'measured rows carry no badge, though the demo code as a whole is simulated');
  assert.ok(page.includes('Simulated'), 'the code of a simulated patient stays marked');
  checkWording(visible(sig), 'imported, measured');
  assert.ok(sig.includes('from the finger sensor during play sessions'));
  for (const w of ['sitting', 'lying', 'at the patient', 'resting pulse from']) assert.ok(!sig.toLowerCase().includes(w), w);
  const iMeasures = page.indexOf('Measures, 8 weeks'), iSig = page.indexOf('<section class="signals"'), iFacts = page.indexOf('Mornings lit');
  assert.ok(iMeasures > 0 && iSig > iMeasures && iFacts > iSig, 'Signals sits between the measures and the facts');
  assert.ok(page.includes('Not live data.'));
  // the numbers are not a tenth feature: no tile among the measures and no usual range
  assert.strictEqual(count(page, 'id="mm-'), 9);
  assert.ok(!/id="mm-(pulse_bpm|breathing_per_min|rmssd_ms)"/.test(page));

  const charts = [];
  ctx.document.getElementById = (id) => ({ id });
  C.seriesChart = (el, o) => charts.push({ id: el.id, o });
  V.drawImported({}, imp.cti);
  const drawn = Object.fromEntries(charts.filter((c) => c.id.startsWith('sig-')).map((c) => [c.id, c.o]));
  same(Object.keys(drawn), ['sig-pulse_bpm', 'sig-breathing_per_min', 'sig-rmssd_ms']);
  same(drawn['sig-pulse_bpm'].values, [null, null, 71.2, 69.8, null, 72.4, 70.1, 68.9]);
  same(drawn['sig-rmssd_ms'].values, [null, null, 41.5, 38.2, null, 44.9, null, null]);
  for (const o of Object.values(drawn)) assert.ok(o.band == null && o.mid == null && o.threshold == null && o.connect === false && o.dots === true, 'numbers only: no range, no line across a gap, a dot per week with a value');

  // the real chart: a week with a value between two gaps is still drawn (one dot per value), and no line crosses a gap
  {
    const real = loadPage().C;
    const el = { clientWidth: 400, innerHTML: '' };
    real.seriesChart(el, { values: [null, 70.5, null, 72, null, null, null, null], connect: false, dots: true, h: 104 });
    assert.strictEqual(count(el.innerHTML, 'r="2.5"'), 2, 'two values, two dots');
    const d = /<path d="([^"]*)"/.exec(el.innerHTML)[1];
    assert.ok(!d.includes('L'), 'no line between weeks that are not neighbours');
    const without = { clientWidth: 400, innerHTML: '' };
    real.seriesChart(without, { values: [null, 70.5, null, 72, null, null, null, null], connect: false, h: 104 });
    assert.strictEqual(count(without.innerHTML, 'r="2.5"'), 0, 'the measures keep their look');
  }
  assert.ok(drawn['sig-pulse_bpm'].tip(7).includes('68.9 bpm') && drawn['sig-pulse_bpm'].tip(0).includes('no value'));
  assert.ok(drawn['sig-rmssd_ms'].tip(5).includes('44.9 ms') && drawn['sig-breathing_per_min'].tip(7).includes('11.6 per min'));

  const sim = measured();
  sim.simulated = { pulse_bpm: true, breathing_per_min: true, rmssd_ms: true };
  assert.strictEqual(count(section(show(scan(sim))), '<span class="sim-badge small">Simulated</span>'), 3);

  const empty = section(show(scan(NO_VITALS)));
  assert.ok(empty.includes('No finger sensor reading in these 8 weeks.') && !empty.includes('chart-wrap'));

  const before = section(show(scan(null, true)));
  assert.ok(before.includes('This code carries no finger sensor numbers'));

  // a code from the encoder before this change (frozen fixture) is shown the same way
  const frozen = json('qr_code_before_vitals.json');
  const old = QR.decode(frozen.text, { now: frozen.now_ms });
  assert.strictEqual(old.status, 'ok');
  const oldPage = show({ cti: old.cti, fp: old.fingerprint, iat: old.iat, exp: old.exp, scanned_iso: new Date(NOW).toISOString(), body: old.body });
  assert.ok(section(oldPage).includes('This code carries no finger sensor numbers') && oldPage.includes('Measures, 8 weeks'));
}

// 4. No path for a current sensor value in the clinic web code.
{
  const files = fs.readdirSync(WEB).filter((f) => /\.(js|html)$/.test(f));
  assert.ok(files.includes('clinic.js') && files.includes('views.js') && files.includes('signals.js') && files.includes('index.html'));
  const src = Object.fromEntries(files.map((f) => [f, read(WEB, f)]));

  // the socket messages the dashboard acts on: events about stored documents, none of them a reading
  const cases = [...src['clinic.js'].matchAll(/case '([a-z_]+)':/g)].map((m) => m[1]).sort();
  same(cases, ['analytics_updated', 'checkin_added', 'crisis_flag', 'daily_added', 'demo_reset', 'hello', 'privacy', 'session_added', 'session_interrupted', 'session_started']);
  // what the page reads from a socket message: ids, the list row, flags and the privacy switch. The content of a session
  // and the analytics object are not pushed (hub/tests/test_clinic_no_live.py); the page reads them from the hub as stored documents.
  const fields = [...new Set([...src['clinic.js'].matchAll(/\bm\.([a-z_]+)/g)].map((x) => x[1]))].sort();
  same(fields, ['checkin_id', 'flag_type', 'label', 'now_day', 'patient_id', 'patients', 'privacy', 'row', 'screen', 'source', 't_iso', 'type']);
  assert.ok(/case 'analytics_updated':\s*onAnalytics\(m\)/.test(src['clinic.js']) && /function onAnalytics\(m\) \{[\s\S]*?refreshAnalytics\(id\);/.test(src['clinic.js']),
    'after analytics_updated the page reads the stored analytics itself');
  // one socket, the clinic one
  for (const [f, text] of Object.entries(src)) {
    for (const m of text.matchAll(/\/ws\/[a-z]+/g)) assert.strictEqual(m[0], '/ws/clinic', `${f}: ${m[0]}`);
  }
  assert.strictEqual(count(Object.values(src).join('\n'), 'new WebSocket('), 1);

  // nothing that names a current reading, its messages or the endpoints that hold one
  const BANNED = ['physio', 'live_metrics', 'bedside_state', 'bedside/state', 'S.live', 'S.bedside', 'bedsideAt', 'liveRows', 'refreshSignals', 'STALE_S',
    'camera_pulse:', 'Current readings', 'no current reading', '/api/sensors', '/api/config', 'EventSource', 'setInterval(refresh'];
  for (const [f, text] of Object.entries(src)) {
    for (const b of BANNED) assert.ok(!text.includes(b), `${f}: ${b}`);
  }
  // every request the dashboard makes to the hub, by path
  const paths = new Set();
  for (const text of Object.values(src)) for (const m of text.matchAll(/\/api\/[a-z]+(?:\/\$\{[^}]+\})?(?:\/[a-z/-]+)?/g)) paths.add(m[0].replace(/\$\{[^}]+\}/, ':id'));
  same([...paths].sort(), ['/api/demo/reset', '/api/health', '/api/patients', '/api/patients/:id', '/api/patients/:id/analytics', '/api/patients/:id/export',
    '/api/patients/:id/flags/clear', '/api/patients/:id/summary', '/api/validation']);
  // the only timer left in clinic.js is the socket keep-alive
  same([...src['clinic.js'].matchAll(/setInterval\(([^,]*),/g)].map((m) => m[1].includes('ping')), [true]);
}

// the page loads signals.js between charts.js and views.js, and before the imported view that uses it
{
  const page = read(WEB, 'index.html');
  const order = ['charts.js', 'signals.js', 'views.js', 'imported.js', 'clinic.js'].map((f) => page.indexOf(`<script src="${f}"></script>`));
  assert.ok(order.every((i) => i > 0) && order.join() === [...order].sort((a, b) => a - b).join(), 'script order');
}

console.log('clinic_signals: ok');
