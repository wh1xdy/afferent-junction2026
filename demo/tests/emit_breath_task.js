// Run: node demo/tests/emit_breath_task.js
// Prints {task}: the record of one breathing task made by the real code (minigames.js, breathing.js, engine.js, record.js)
// while finger_ppg readings arrive, so the contract tests can validate tasks[].extra.breathing as the phone writes it.
// Nothing else goes to stdout. The numbers fed here (pulse 72, breathing 9, quality 0.6) are test inputs, not measurements.
const { load, run } = require('./harness');

const { A, tick } = load({ uuid: true, games: true });
const feed = () => {
  A.Finger.onReading({ kind: 'hrm', bpm: 72, t_ms: Date.now() });
  A.Finger.onReading({ kind: 'aff1', finger_bpm: [71, 73], breathing_per_min: 9, rmssd_ms: 46, quality: 0.6, presence: 'active', payload_len: 6, t_ms: Date.now() });
};

A.Sensors.setFingerLink('connected', 'Afferent Finger');
feed(); tick(1); feed();
const s = A.session = A.startSession({ clock: 'morning', input: 'touch', stage: true, profile: 'live' });
s.slots = { fork: -1, lanterns: -1 }; s.classify = () => 'calm'; s.pick = () => ({ id: 'breath', weight: null });
for (let i = 0; i < 60 && !s.tasks.length; i++) run(A, tick, s, 1, null, feed);

process.stdout.write(JSON.stringify({ task: s.tasks[0] ?? null }) + '\n');
