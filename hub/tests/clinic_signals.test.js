// Run: node hub/tests/clinic_signals.test.js
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

function loadSignals() {
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const ctx = { Math, JSON, Number, String, Array, Object };
  ctx.window = ctx;
  ctx.C = { esc };
  vm.createContext(ctx);
  vm.runInContext(read(WEB, 'signals.js'), ctx);
  return ctx.C.signals;
}
const Sg = loadSignals();
const byKey = (rows) => Object.fromEntries(rows.map((r) => [r.key, r]));

const NOW = 1_800_000_000_000;

same(Object.keys(Sg).sort(), ['weeklyHtml', 'weeklyRows']);

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

// 2. The numbers of a patient code: weekly medians, one row each, with unit, source and the Simulated badge.
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
  same(rows.map((x) => [x.key, x.label, x.unit]), [['pulse_bpm', 'Pulse', 'bpm'], ['breathing_per_min', 'Breathing', 'per min'], ['rmssd_ms', 'HRV (RMSSD)', 'ms']]);
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
    assert.ok(e.every((x) => x.missing && x.value === '-' && x.week === null && x.days === null && x.simulated === false && x.weeks.every((w) => w === null)));
  }

  // the badge follows the row, not the code
  const sim = measured();
  sim.simulated.rmssd_ms = true;
  const sr = byKey(Sg.weeklyRows(sim));
  same([sr.pulse_bpm.simulated, sr.rmssd_ms.simulated, sr.rmssd_ms.source, sr.pulse_bpm.source], [false, true, 'simulator', 'finger sensor (PPG)']);

  const labels = [];
  const html = Sg.weeklyHtml(measured(), (i) => { labels.push(i); return `W${i}`; });
  for (const s of ['Pulse', '68.9<small> bpm</small>', 'Breathing', '11.6<small> per min</small>', 'HRV (RMSSD)', '44.9<small> ms</small>',
    'finger sensor (PPG)', 'W7 · 21 d', 'W5 · 1 d', '21 days with a reading', '1 day with a reading', 'session mean',
    'id="sig-pulse_bpm"', 'id="sig-breathing_per_min"', 'id="sig-rmssd_ms"']) assert.ok(html.includes(s), s);
  assert.ok(!html.includes('sig-foot') && !html.includes('<p'), 'no footnote under the numbers');
  same(labels, [7, 7, 5]);
  assert.ok(!html.includes('sim-badge') && !html.includes('none"'));
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
  assert.ok(partHtml.includes('<span class="mm-v num">-</span>') && !partHtml.includes('id="sig-rmssd_ms"') && partHtml.includes('id="sig-pulse_bpm"'));
  assert.strictEqual(count(partHtml, 'class="mm sig-mm none"'), 1);

  const notCarried = Sg.weeklyHtml(undefined);
  assert.ok(notCarried.includes('Not in export'));
  const noWeeks = Sg.weeklyHtml(NO_VITALS);
  assert.ok(noWeeks.includes('No readings'));
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
  const show = (imp) => { imports.set(imp.cti, imp); return V.exportDetail({}, imp.cti); };
  const section = (page) => { const m = /<section class="signals"[\s\S]*?<\/section>/.exec(page); assert.ok(m, 'Signals section'); return m[0]; };
  const visible = (s) => s.replace(/aria-label="[^"]*"/g, '').replace(/data-tip="[^"]*"/g, '');

  const imp = scan(measured());
  const page = show(imp);
  const sig = section(page);
  for (const s of ['<h2>Signals</h2>', 'Finger sensor, during play', 'Pulse', '68.9<small> bpm</small>', 'Breathing', '11.6<small> per min</small>',
    'HRV (RMSSD)', '44.9<small> ms</small>', 'finger sensor (PPG)', '21 days with a reading', 'id="sig-pulse_bpm"']) assert.ok(sig.includes(s), s);
  assert.ok(!sig.includes('sim-badge'), 'measured rows carry no badge, though the demo code as a whole is simulated');
  assert.ok(page.includes('Simulated'), 'the code of a simulated patient stays marked');
  checkWording(visible(sig), 'imported, measured');
  assert.ok(sig.includes('Not in index'));
  for (const w of ['sitting', 'lying', 'at the patient', 'resting pulse from']) assert.ok(!sig.toLowerCase().includes(w), w);
  const iMeasures = page.indexOf('<h2>Measures</h2>'), iSig = page.indexOf('<section class="signals"'), iFacts = page.indexOf('Mornings lit');
  assert.ok(iMeasures > 0 && iSig > iMeasures && iFacts > iSig, 'Signals sits between the measures and the facts');
  assert.ok(page.includes('Received via QR') && page.includes('15 Nov 10:12'));
  for (const gone of ['Not live data', 'Research prototype', 'The clinician decides', 'Ask the patient about the answers', 'Follow your clinic protocol', 'dp-foot']) assert.ok(!page.includes(gone), gone);
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
  assert.ok(drawn['sig-pulse_bpm'].tip(7).includes('68.9 bpm') && drawn['sig-pulse_bpm'].tip(0).includes('<b>-</b>'));
  assert.ok(drawn['sig-rmssd_ms'].tip(5).includes('44.9 ms') && drawn['sig-breathing_per_min'].tip(7).includes('11.6 per min'));

  const sim = measured();
  sim.simulated = { pulse_bpm: true, breathing_per_min: true, rmssd_ms: true };
  assert.strictEqual(count(section(show(scan(sim))), '<span class="sim-badge small">Simulated</span>'), 3);

  const empty = section(show(scan(NO_VITALS)));
  assert.ok(empty.includes('No readings') && !empty.includes('chart-wrap'));

  const before = section(show(scan(null, true)));
  assert.ok(before.includes('Not in export'));

  // a code from the encoder before this change (frozen fixture) is shown the same way
  const frozen = json('qr_code_before_vitals.json');
  const old = QR.decode(frozen.text, { now: frozen.now_ms });
  assert.strictEqual(old.status, 'ok');
  const oldPage = show({ cti: old.cti, fp: old.fingerprint, iat: old.iat, exp: old.exp, scanned_iso: new Date(NOW).toISOString(), body: old.body });
  assert.ok(section(oldPage).includes('Not in export') && oldPage.includes('<h2>Measures</h2>'));
}

{
  const EXPLAINING = ['Each person is compared only with their own first two weeks after TMS', 'Afferent suggests', 'the clinician decides', 'All patients on this hub are simulated',
    'Not live data', 'Research prototype', 'Not for clinical use', 'Sorted by need', 'Light suits office daylight', 'Back to the seeded patients', 'run day by day through the same engine',
    'Kept in this browser only', 'One export a day', 'This code carries no', 'Support for monitoring and follow-up', 'Ask the patient about the answers', 'Follow your clinic protocol',
    'Consider discussing a booster session', 'Steady across all signals', 'Small drift across several signals', 'No session was recorded in these weeks', 'than usual',
    'from discharge', 'residual symptoms at discharge', 'entered by the clinic', 'Discharge baseline', 'severity bands', 'weekly medians</span>', '8 weeks, weekly',
    'C-SSRS not asked', 'check-in stopped before the safety item', 'known lifetime behaviour', 'Crisis screen shown', 'older not in this export', '<b>Safety answer',
    'Weighted mean of personal z-scores', 'Amber up, teal down', 'Totals only', 'in these weeks', 'kept by a pause', 'this week', 'with a reading</', 'week from',
    'Received ${', 'via QR</', 'Scan patient QR</', 'Use a scanner', 'Open image', 'Ready for the scanner', 'Camera needs localhost', 'of ${c.n} scanned',
    'Not an Afferent code', 'The code reader did not load', 'Made by a newer Afferent version', 'Ask for a new one', 'phone clock looks wrong', 'could not be checked',
    'No code found in this image', 'Export received', 'Export deleted', 'Forgot the phone', 'Demo data reset', 'Delete this export', 'Forget this phone', 'Download as JSON',
    'from relapse onset to a check-in suggestion', 'of simulated relapses reached', 'false check-in suggestions per', 'for the mood lantern alone', 'is reliably found as most helpful',
    'one example', 'Days from onset to each suggestion', 'Probability that', 'Check-in suggested', 'Stable control', 'Not in this browser', 'Not in this export', 'No reading in these 8 weeks'];
  for (const f of fs.readdirSync(WEB).filter((x) => /\.(js|html)$/.test(x))) {
    const text = read(WEB, f).toLowerCase();
    for (const e of EXPLAINING) assert.ok(!text.includes(e.toLowerCase()), `${f}: ${e}`);
  }
}

console.log('clinic_signals: ok');
