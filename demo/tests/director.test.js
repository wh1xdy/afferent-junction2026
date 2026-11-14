// Run: node demo/tests/director.test.js
const assert = require('assert');
const { load } = require('./harness');

const lights = A => { const out = []; A.bus.on('light', d => out.push(d)); return out; };
const run = (A, tick, s, seconds, each) => { for (let i = 0; i < seconds * 20; i++) { each?.(); tick(0.05); A.Input.update(A.now(), 0.05); s.update(A.now(), 0.05); } };

const tests = {
  'night with a low pulse never enters wake mode and keeps the bedside light warm and dim'() {
    const { A, tick } = load();
    const L = lights(A);
    const s = A.startSession({ clock: 'night', input: 'touch', stage: true, profile: 'live' });
    run(A, tick, s, 40, () => { A.Sim.offset = -9; A.Sim.drowsy = 0; });
    assert.ok(s.a <= -0.3, `arousal should be low, got ${s.a}`);
    assert.ok(!s.transitions.some(t => t.to === 'wake'), JSON.stringify(s.transitions));
    assert.ok(L.filter(l => l.reason === 'mode').every(l => l.level <= 8 && l.rgb !== '#DDEBFF' && l.rgb !== '#F4F7FF'), JSON.stringify(L));
  },

  'morning with a low pulse still enters wake mode'() {
    const { A, tick } = load();
    const s = A.startSession({ clock: 'morning', input: 'touch', stage: true, profile: 'live' });
    run(A, tick, s, 20, () => { A.Sim.offset = -9; A.Sim.drowsy = 0; });
    assert.strictEqual(s.mode, 'wake');
  },

  'implausible pulse is ignored by the director'() {
    const { A, tick } = load();
    const feed = bpm => A.Sensors.feedPulse({ bpm, quality: 0.9, contact: true, source: 'finger_ppg' });
    feed(70);
    const s = A.startSession({ clock: 'morning', input: 'touch', stage: true, profile: 'live' });
    assert.strictEqual(A.Sensors.pulseMode, 'real');
    run(A, tick, s, 5, () => { A.Sim.drowsy = 0; feed(70); });
    const a0 = s.a;
    feed(190);
    run(A, tick, s, 2, () => feed(190));
    assert.strictEqual(A.Sensors.pulse(A.now()).bpm, 190);
    assert.ok(Math.abs(s.a - a0) < 0.3, `arousal moved from ${a0} to ${s.a}`);
  },

  'night: eyes closing during the core puts the director in rest at once, so the Fork is skipped'() {
    const { A, tick } = load();
    const s = A.startSession({ clock: 'night', input: 'auto', stage: false, profile: 'bad_day' });
    let first = null;
    A.bus.on('game', g => { if (!first) first = g; });
    run(A, tick, s, 60);
    assert.strictEqual(s.transitions[0].to, 'rest', JSON.stringify(s.transitions[0]));
    assert.ok(s.tasks.some(t => t.id === 'fork' && t.completed_by === 'skipped' && t.skip_reason === 'rest_mode'), JSON.stringify(s.tasks.map(t => [t.id, t.completed_by])));
    assert.notStrictEqual(first?.id, 'fork');
  },

  'fatigue and rest only end once fatigue drops well below the entry threshold'() {
    const { A } = load();
    const s = A.startSession({ clock: 'night', input: 'touch', stage: true, profile: 'live' });
    Object.assign(s, { a: 0, fat: 0.35, mode: 'rest' });
    assert.strictEqual(s.classify(), 'rest');
    s.mode = 'flow';
    assert.strictEqual(s.classify(), 'flow');
    Object.assign(s, { fat: 0.25, mode: 'rest' });
    assert.strictEqual(s.classify(), 'flow');
  },

  'adaptive tasks do not repeat within a session while fresh ones exist'() {
    const { A, tick } = load();
    const s = A.startSession({ clock: 'morning', input: 'touch', stage: true, profile: 'live' });
    run(A, tick, s, 3);
    const picks = [s.pick('wake').id];
    s.played.add(picks[0]);
    picks.push(s.pick('wake').id);
    s.played.add(picks[1]);
    picks.push(s.pick('wake').id);
    assert.strictEqual(new Set(picks).size, 3, picks.join(','));
  },
};

let failed = 0;
for (const [name, fn] of Object.entries(tests)) {
  try { fn(); console.log('ok  ', name); } catch (e) { failed++; console.log('FAIL', name, '\n     ', e.message); }
}
process.exit(failed ? 1 : 0);
