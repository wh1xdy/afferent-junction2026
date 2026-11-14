// Run: node demo/tests/state.test.js
// The state behind the game choice: stressed, energised, tired, or the pulse alone when HRV and breathing are missing.
// Readings come from the finger clips over Bluetooth (sensors.js feedFingerBle), fed once a simulated second.
// All numbers are test inputs, not measurements.
const assert = require('assert');
const { load, run, plain } = require('./harness');

const hrm = bpm => ({ kind: 'hrm', bpm, t_ms: Date.now() });
const aff = (bpm, o = {}) => ({ kind: 'aff1', finger_bpm: [bpm, bpm + 1], breathing_per_min: 12, rmssd_ms: 45, quality: 0.8, presence: 'active', payload_len: 6, t_ms: Date.now(), ...o });
const clips = (A, bpm, o) => { A.Sensors.feedFingerBle(hrm(bpm)); A.Sensors.feedFingerBle(aff(bpm, o)); };
const REST = { rmssd_ms: 45, breathing_per_min: 12 };

// A staged session (no rest moment or reaction taps) with the clips connected, so its pulse is locked to real readings.
// The calm games are listed breath last and the flow puzzles are set to the second flow game, so a preference shows:
// without one the stub draw takes the first game of the pool.
const session = ({ clock = 'morning', connect = true } = {}) => {
  const { A, tick } = load(), G = A.MINIGAMES, breath = G.breath;
  delete G.breath; G.breath = breath;
  A.PUZZLES = ['constellation'];
  if (connect) A.Sensors.setFingerLink('connected', 'Afferent Finger');
  const s = A.startSession({ clock, input: 'touch', stage: true, profile: 'live' });
  s.slots = { fork: -1, lanterns: -1 };
  const ws = [];
  A.bus.on('ws', m => { if (m.type === 'mode') ws.push(plain(m)); });
  const play = (seconds, bpm, o, each) => run(A, tick, s, seconds, () => { A.Sim.drowsy = 0; each?.(); }, bpm == null ? null : () => clips(A, bpm, o));
  return { A, tick, s, ws, play, last: () => plain(s.transitions[s.transitions.length - 1]) };
};
// Twelve seconds near the rest pulse (68 in the harness config) with the clips reading REST: this person's own values.
const settle = t => { t.play(12, 68, REST); assert.ok(t.s.base.rmssd.length >= 5 && t.s.base.breathing.length >= 5, JSON.stringify(t.s.base)); };

const tests = {
  'stressed: pulse up with HRV down and faster breathing puts the director in calm, and the breathing game comes first'() {
    const t = session(), { s, A } = t;
    settle(t);
    assert.deepStrictEqual([s.mode, s.state], ['flow', 'steady']);
    t.play(12, 90, { rmssd_ms: 24, breathing_per_min: 17 });
    assert.deepStrictEqual([s.mode, s.state], ['calm', 'stressed']);
    const tr = t.last();
    assert.deepStrictEqual([tr.from, tr.to, tr.state, tr.basis], ['flow', 'calm', 'stressed', 'hrv']);
    assert.deepStrictEqual(tr.reasons, ['pulse_up', 'rmssd_down', 'breathing_fast']);
    assert.deepStrictEqual([tr.signals.rmssd_ms, tr.signals.rmssd_own_ms, tr.signals.rmssd_ratio], [24, 45, 0.533]);
    assert.deepStrictEqual([tr.signals.breathing_per_min, tr.signals.breathing_own_per_min, tr.signals.breathing_delta], [17, 12, 5]);
    assert.strictEqual(tr.signals.pulse_bpm, 90);
    assert.strictEqual(s.pick('calm').id, 'breath', 'without the preference the stub draw would take loyly');
    const next = s.planTask(A.now());
    assert.deepStrictEqual([next.id, next.mode], ['breath', 'calm']);
  },

  'stressed on one sign: HRV down with breathing not measured yet is enough'() {
    const t = session(), { s } = t;
    t.play(12, 68, { rmssd_ms: 45, breathing_per_min: 0 });
    t.play(12, 90, { rmssd_ms: 30, breathing_per_min: 0 });
    assert.deepStrictEqual([s.mode, s.state, t.last().reasons], ['calm', 'stressed', ['pulse_up', 'rmssd_down']]);
  },

  'energised: pulse up with steady HRV and calm breathing stays in flow and prefers puzzles'() {
    const t = session(), { s, A } = t;
    settle(t);
    assert.strictEqual(s.pick('flow').id, 'threads', 'steady: no preference, the first flow game');
    t.play(12, 90, { rmssd_ms: 47, breathing_per_min: 13 });
    assert.deepStrictEqual([s.mode, s.state], ['flow', 'energised']);
    const tr = t.last();
    assert.deepStrictEqual([tr.from, tr.to, tr.state, tr.basis], ['flow', 'flow', 'energised', 'hrv'], 'a new state in the same mode is kept too');
    assert.deepStrictEqual(tr.reasons, ['pulse_up', 'rmssd_steady', 'breathing_calm']);
    assert.deepStrictEqual([tr.signals.rmssd_ratio, tr.signals.breathing_delta], [1.044, 1]);
    assert.strictEqual(s.pick('flow').id, 'constellation');
    assert.strictEqual(s.planTask(A.now()).id, 'constellation');
  },

  'energised holds between the bands and leaves on a stress sign held for 3 s, not on a short dip'() {
    const t = session(), { s } = t;
    settle(t);
    t.play(12, 90, { rmssd_ms: 47, breathing_per_min: 12 });
    assert.strictEqual(s.state, 'energised');
    t.play(12, 90, { rmssd_ms: 38.5, breathing_per_min: 14 });
    assert.deepStrictEqual([s.mode, s.state], ['flow', 'energised'], 'RMSSD at 86% and breathing +2: no stress sign, so energised holds');
    const n = s.transitions.length;
    t.play(2, 90, { rmssd_ms: 30, breathing_per_min: 12 });
    t.play(4, 90, { rmssd_ms: 47, breathing_per_min: 12 });
    assert.deepStrictEqual([s.mode, s.state, s.transitions.length], ['flow', 'energised', n], 'two seconds of a stress sign change nothing');
    t.play(6, 90, { rmssd_ms: 30, breathing_per_min: 12 });
    assert.deepStrictEqual([s.mode, s.state], ['calm', 'stressed']);
  },

  'entering energised needs both signs: RMSSD at 86% is between the bands, so the pulse alone decides (calm)'() {
    const t = session(), { s } = t;
    settle(t);
    t.play(12, 90, { rmssd_ms: 38.5, breathing_per_min: 12 });
    assert.deepStrictEqual([s.mode, s.state, t.last().basis, t.last().reasons], ['calm', 'pulse_up', 'hrv', ['pulse_up', 'hrv_between']]);
  },

  'tired by day: the eyes put the director in fatigue, ahead of a raised pulse'() {
    const t = session(), { s, A } = t;
    settle(t);
    run(A, t.tick, s, 20, () => { A.Sim.drowsy = 1; }, () => clips(A, 90, { rmssd_ms: 47, breathing_per_min: 12 }));
    assert.deepStrictEqual([s.mode, s.state, t.last().basis, t.last().reasons], ['fatigue', 'tired', 'eyes', ['eyes_tired']]);
    const next = s.planTask(A.now());
    assert.strictEqual(next.mode, 'fatigue');
    assert.ok(A.MINIGAMES[next.id].modes.includes('fatigue'), next.id);
  },

  'tired at night: rest, the wind-down breathing'() {
    const t = session({ clock: 'night' }), { s, A } = t;
    t.play(6, 68, REST);
    run(A, t.tick, s, 20, () => { A.Sim.drowsy = 1; }, () => clips(A, 68, REST));
    assert.deepStrictEqual([s.mode, s.state, t.last().reasons], ['rest', 'tired', ['eyes_tired']]);
    assert.strictEqual(s.planTask(A.now()).id, 'breath');
  },

  'missing HRV and breathing: the pulse alone decides, as before'() {
    const t = session(), { s } = t;
    t.play(12, 68, { rmssd_ms: 0, breathing_per_min: 0 });
    assert.deepStrictEqual([s.base.rmssd.length, s.base.breathing.length], [0, 0], 'zeros are no reading');
    t.play(12, 90, { rmssd_ms: 0, breathing_per_min: 0 });
    const tr = t.last();
    assert.deepStrictEqual([s.mode, s.state, tr.basis, tr.reasons], ['calm', 'pulse_up', 'pulse', ['pulse_up', 'no_hrv']]);
    assert.deepStrictEqual([tr.signals.rmssd_ms, tr.signals.breathing_per_min], [null, null]);
    assert.strictEqual(s.pick('calm').id, 'loyly', 'no stress sign was read, so no preference');
  },

  'HRV without own values to compare with is not used: a session that starts with the pulse up never takes them'() {
    const t = session(), { s } = t;
    t.play(20, 90, { rmssd_ms: 47, breathing_per_min: 12 });
    assert.deepStrictEqual([s.base.rmssd.length, s.mode, s.state], [0, 'calm', 'pulse_up']);
    assert.deepStrictEqual(t.last().reasons, ['pulse_up', 'no_hrv']);
  },

  'a reading below the quality gate, a stale one, a simulated one and one of a simulated session are no HRV'() {
    const t = session(), { s, A } = t, S = A.Sensors;
    settle(t);
    t.play(4, 68, { quality: 0.2 });
    assert.strictEqual(s.phys, null, 'quality below 0.3');
    S.feedFingerBle(aff(68));
    run(A, t.tick, s, 4);
    assert.strictEqual(s.phys, null, 'nothing new for 4 s');
    S.setFingerLink('off');
    S.feedFingerHub({ source: 'finger_ppg', transport: 'hub_http', simulated: true, pulse_bpm: 90, quality: 0.9, quality_reported: true, contact: true, finger_bpm: [90, 91], breathing_per_min: 12, rmssd_ms: 47, presence: 'active', age_s: 0.2 });
    run(A, t.tick, s, 1.2);
    assert.strictEqual(s.phys, null, 'a simulated hub frame');

    const sim = session({ connect: false });
    assert.strictEqual(sim.A.Sensors.pulseMode, 'simulated');
    sim.A.Sensors.setFingerLink('connected', 'Afferent Finger');
    sim.play(14, 90, { rmssd_ms: 24, breathing_per_min: 17 });
    assert.deepStrictEqual([sim.s.phys, sim.s.base.rmssd.length], [null, 0], 'a session locked to the simulator never mixes in the clips');
  },

  'no pulse at all: the defaults of before (flow), and a reading that stops holds its state instead of guessing'() {
    const t = session(), { s, A } = t;
    run(A, t.tick, s, 6);
    assert.deepStrictEqual([s.mode, s.state, t.last().basis, t.last().reasons], ['flow', 'unknown', 'none', ['no_pulse']]);
    settle(t);
    t.play(12, 90, { rmssd_ms: 24, breathing_per_min: 17 });
    assert.strictEqual(s.state, 'stressed');
    const n = s.transitions.length;
    run(A, t.tick, s, 10);
    assert.deepStrictEqual([s.mode, s.state, s.transitions.length], ['calm', 'stressed', n]);
  },

  'the transition record and the mode message carry the same reason, numbers only, and reach the session document'() {
    const t = session(), { s, A } = t;
    settle(t);
    t.play(12, 90, { rmssd_ms: 24, breathing_per_min: 17 });
    const tr = t.last(), msg = t.ws[t.ws.length - 1];
    assert.deepStrictEqual(Object.keys(tr.signals).sort(), ['breathing_delta', 'breathing_own_per_min', 'breathing_per_min', 'pulse_bpm', 'pulse_rest_bpm', 'rmssd_ms', 'rmssd_own_ms', 'rmssd_ratio']);
    assert.ok(Object.values(tr.signals).every(v => v === null || typeof v === 'number'), JSON.stringify(tr.signals));
    assert.deepStrictEqual([msg.mode, msg.state, msg.basis, msg.reasons, msg.signals], [tr.to, tr.state, tr.basis, tr.reasons, tr.signals]);
    let doc = null;
    A.bus.on('sessionEnd', d => { doc = plain(d); });
    s.finish('partial');
    assert.deepStrictEqual(doc.adaptive.transitions[doc.adaptive.transitions.length - 1], tr);
  },
};

let failed = 0;
for (const [name, fn] of Object.entries(tests)) {
  try { fn(); console.log('ok  ', name); } catch (e) { failed++; console.log('FAIL', name, '\n     ', e.message); }
}
process.exit(failed ? 1 : 0);
