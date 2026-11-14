// Run: node demo/tests/emit_session.js
// Prints {signal, vitals, simulated, simulated_fields} of a session document made by the real recorder (record.js through engine.js),
// so the contract tests can validate what the phone really writes. Nothing else goes to stdout.
// The numbers fed here (pulse 72, fingers 71 and 73, breathing 6, RMSSD 46, quality 0.6) are test inputs, not measurements.
const { load, run } = require('./harness');

const { A, tick } = load({ uuid: true });
const S = A.Sensors;
const feed = () => {
  A.Finger.onReading({ kind: 'hrm', bpm: 72, t_ms: Date.now() });
  A.Finger.onReading({ kind: 'aff1', finger_bpm: [71, 73], breathing_per_min: 6, rmssd_ms: 46, quality: 0.6, presence: 'active', payload_len: 6, t_ms: Date.now() });
};

S.setFingerLink('connected', 'Afferent Finger');
feed(); tick(1); feed();
const s = A.startSession({ clock: 'morning', input: 'touch', stage: true, profile: 'live' });
let doc = null;
A.bus.on('sessionEnd', d => { doc = d; });
run(A, tick, s, 60, null, feed);
s.finish('partial');

const { signal, vitals, simulated, simulated_fields } = doc;
process.stdout.write(JSON.stringify({ signal, vitals, simulated, simulated_fields }) + '\n');
