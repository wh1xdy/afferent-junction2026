// Run: node demo/tests/livevitals.test.js
// The Live vitals panel and its reason chip (js/livevitals.js): real readings only, "no reading" otherwise, a simulated
// pulse labelled as such, and the reason of each change of games. All numbers are test inputs, not measurements.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
const { load, run, plain, JS } = require('./harness');

const hrm = bpm => ({ kind: 'hrm', bpm, t_ms: Date.now() });
const aff = (bpm, o = {}) => ({ kind: 'aff1', finger_bpm: [bpm, bpm + 1], breathing_per_min: 12, rmssd_ms: 45, quality: 0.8, presence: 'active', payload_len: 6, t_ms: Date.now(), ...o });
const clips = (A, bpm, o) => { A.Sensors.feedFingerBle(hrm(bpm)); A.Sensors.feedFingerBle(aff(bpm, o)); };

// A tiny page: the panel's elements by selector, each with text, classes and style, enough for render().
const page = () => {
  const el = () => { const c = new Set(); return { textContent: '', style: {}, classList: { toggle: (k, on) => { on ? c.add(k) : c.delete(k); }, contains: k => c.has(k) }, has: k => c.has(k) }; };
  const parts = {}, part = sel => (parts[sel] = parts[sel] || el());
  const box = Object.assign(el(), { querySelector: part }), chip = el(), cue = el();
  return { document: { getElementById: id => ({ liveVitals: box, lvChip: chip, cue })[id] ?? null }, box, chip, cue, part };
};

const setup = ({ connect = true, doc = false } = {}) => {
  const t = load(), { A, ctx, tick } = t, p = doc ? page() : null;
  if (p) ctx.document = p.document;
  vm.runInContext(fs.readFileSync(path.join(JS, 'livevitals.js'), 'utf8'), ctx, { filename: 'livevitals.js' });
  if (connect) A.Sensors.setFingerLink('connected', 'Afferent Finger');
  const s = A.startSession({ clock: 'morning', input: 'touch', stage: true, profile: 'live' });
  s.slots = { fork: -1, lanterns: -1 };
  // watch: the chip is read every frame, as the page does, so its 5 s run from when the change happened.
  const t2 = { watch: false };
  const play = (seconds, bpm, o) => run(A, tick, s, seconds, () => { A.Sim.drowsy = 0; if (t2.watch) A.LiveVitals.chip(s, A.now()); }, bpm == null ? null : () => clips(A, bpm, o));
  return Object.assign(t2, { A, s, tick, play, p, L: A.LiveVitals, m: () => plain(A.LiveVitals.model(s, A.now())) });
};

const tests = {
  'real readings show as numbers; missing ones and ones below the quality gate say "no reading"'() {
    const t = setup();
    t.play(4, 72, { rmssd_ms: 46, breathing_per_min: 11 });
    let m = t.m();
    assert.deepStrictEqual([m.pulse.text, m.hrv.text, m.breathing.text, m.pulse.sim], ['72 bpm', '46 ms', '11 /min', false]);
    t.play(2, 72, { rmssd_ms: 0, breathing_per_min: 0 });
    m = t.m();
    assert.deepStrictEqual([m.pulse.text, m.hrv.text, m.breathing.text], ['72 bpm', 'no reading', 'no reading'], 'zeros are no reading');
    t.play(2, 72, { quality: 0.2 });
    m = t.m();
    assert.deepStrictEqual([m.pulse.text, m.hrv.text, m.breathing.text], ['no reading', 'no reading', 'no reading'], 'below the 0.3 gate');
    t.play(4);
    m = t.m();
    assert.deepStrictEqual([m.pulse.text, m.hrv.text, m.breathing.text], ['no reading', 'no reading', 'no reading'], 'nothing new for 4 s');
  },

  'a simulated pulse is labelled simulated; simulated HRV and breathing are no reading, as they are for the game'() {
    const t = setup({ connect: false }), S = t.A.Sensors;
    assert.strictEqual(S.pulseMode, 'simulated');
    S.feedFingerHub({ source: 'finger_ppg', simulated: true, pulse_bpm: 80, quality: 0.9, quality_reported: true, contact: true, finger_bpm: [80, 81], breathing_per_min: 12, rmssd_ms: 47, presence: 'active', age_s: 0.2 });
    t.play(4);
    const m = t.m();
    assert.strictEqual(m.pulse.sim, true);
    assert.ok(/^\d+ bpm$/.test(m.pulse.text), m.pulse.text);
    assert.deepStrictEqual([m.hrv.text, m.breathing.text], ['no reading', 'no reading']);
  },

  'the state and the reason after a mode change, and the chip shows that reason for 5 s'() {
    const t = setup(), { A, s, L } = t;
    t.watch = true;
    t.play(12, 68, { rmssd_ms: 45, breathing_per_min: 12 });
    assert.deepStrictEqual([t.m().state.label, L.chip(s, A.now())], ['Steady', null], 'the first chip has been and gone');
    t.play(5, 90, { rmssd_ms: 24, breathing_per_min: 17 });
    const m = t.m(), why = 'Pulse up, HRV down, breathing fast → calmer breathing game';
    assert.deepStrictEqual([s.mode, m.state.label, m.state.mode, m.why], ['calm', 'Stressed', 'calm', why]);
    assert.strictEqual(L.chip(s, A.now()), why);
    t.play(6, 90, { rmssd_ms: 24, breathing_per_min: 17 });
    assert.strictEqual(L.chip(s, A.now()), null, 'faded after 5 s');
  },

  'energised, tired and missing HRV read in plain words'() {
    const e = setup();
    e.play(12, 68, { rmssd_ms: 45, breathing_per_min: 12 });
    e.play(5, 90, { rmssd_ms: 47, breathing_per_min: 13 });
    assert.deepStrictEqual([e.m().state.label, e.m().why], ['Energised', 'Pulse up, steady HRV, calm breathing → puzzles']);
    const n = setup();
    n.play(10, 90, { rmssd_ms: 0, breathing_per_min: 0 });
    assert.deepStrictEqual([n.m().state.label, n.m().why], ['Pulse up', 'Pulse up, no HRV to compare → calmer games']);
    const L = n.L, tr = (state, to, reasons) => L.reason({ state, to, reasons });
    assert.strictEqual(tr('tired', 'fatigue', ['eyes_tired']), 'Eyes heavy → gentle wake-up games, brighter light');
    assert.strictEqual(tr('tired', 'rest', ['eyes_tired']), 'Eyes heavy → wind-down for sleep');
    assert.strictEqual(tr('unknown', 'flow', ['no_pulse']), 'No pulse reading → the usual mix of games');
  },

  'the chip waits while a task instruction holds the top line, then shows in full'() {
    const t = setup(), { A, s, L } = t;
    t.play(12, 68);
    t.play(5, 90, { rmssd_ms: 24, breathing_per_min: 17 });
    const n = s.transitions.length;
    t.play(12, 68, { rmssd_ms: 45, breathing_per_min: 12 });
    assert.ok(s.transitions.length > n);
    // a fresh session object reads the chip from its start: the newest transition is still to be shown
    const s2 = Object.assign(Object.create(Object.getPrototypeOf(s)), s);
    assert.strictEqual(L.chip(s2, A.now(), true), null, 'held');
    assert.ok(L.chip(s2, A.now() + 3, false), 'shown once the line is free');
    assert.ok(L.chip(s2, A.now() + 7.9, true), 'and kept for its 5 s');
    assert.strictEqual(L.chip(s2, A.now() + 8.1, false), null);
  },

  'switched off in Settings, or no session in play: nothing shows'() {
    const t = setup(), { A, s, L } = t;
    t.play(4, 72);
    assert.ok(L.model(s, A.now()));
    A.config.liveVitals = false;
    assert.deepStrictEqual([L.model(s, A.now()), L.chip(s, A.now())], [null, null]);
    A.config.liveVitals = true;
    s.finish('partial');
    assert.strictEqual(L.model(s, A.now()), null);
    assert.strictEqual(L.model(null, A.now()), null);
  },

  'rows from other parts show only when that part is there: calm response, music, room'() {
    const t = setup(), { A } = t;
    t.play(4, 72);
    assert.deepStrictEqual([t.m().calm, t.m().music, t.m().room], [null, null, null]);
    A.Biofeedback = { level: 0.4, beat: false };
    A.MusicBio = { following: true, bpm: 72.4, target: 64 };
    A.Sensors.room = () => ({ celsius: 21.46, humidity: 40.2, source: 'modulino', at: 0 });
    assert.deepStrictEqual([t.m().calm, t.m().music, t.m().room], [0.4, 'Music: following your heart 72 → 64 bpm', 'Room 21.5 °C · 40 %']);
    A.Biofeedback = { level: null, beat: false };
    A.MusicBio = { following: false, bpm: 72, target: 64 };
    A.Sensors.room = () => null;
    assert.deepStrictEqual([t.m().calm, t.m().music, t.m().room], [null, null, null]);
    A.Sensors.room = () => { throw new Error('no sensor'); };
    assert.strictEqual(t.m().room, null);
  },

  'render writes the panel and the chip, and leaves hidden rows hidden'() {
    const t = setup({ doc: true }), { A, s, L, p } = t;
    t.play(12, 68, { rmssd_ms: 45, breathing_per_min: 12 });
    t.play(5, 90, { rmssd_ms: 24, breathing_per_min: 17 });
    L.render(s, A.now());
    const part = p.part;
    assert.ok(p.box.has('on'));
    assert.deepStrictEqual([part('[data-k="pulse"]').textContent, part('[data-k="hrv"]').textContent, part('[data-k="breathing"]').textContent], ['90 bpm', '24 ms', '17 /min']);
    assert.strictEqual(part('.lv-label').textContent, 'Stressed');
    assert.strictEqual(part('.lv-why').textContent, 'Pulse up, HRV down, breathing fast → calmer breathing game');
    assert.deepStrictEqual([p.chip.has('on'), p.chip.textContent, L.chipOn], [true, part('.lv-why').textContent, true]);
    assert.deepStrictEqual([part('.lv-heart').has('on'), part('.lv-heart').style.animationDuration], [true, '0.67s'], 'beats at 90 a minute');
    assert.deepStrictEqual([part('.lv-calm').has('on'), part('.lv-music').has('on'), part('.lv-room').has('on'), part('.lv-sim').has('on')], [false, false, false, false]);
    A.config.liveVitals = false;
    L.render(s, A.now());
    assert.deepStrictEqual([p.box.has('on'), p.chip.has('on')], [false, false]);
  },
};

let failed = 0;
for (const [name, fn] of Object.entries(tests)) {
  try { fn(); console.log('ok  ', name); } catch (e) { failed++; console.log('FAIL', name, '\n     ', e.message); }
}
process.exit(failed ? 1 : 0);
