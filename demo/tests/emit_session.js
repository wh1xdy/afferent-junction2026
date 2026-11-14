// Run: node demo/tests/emit_session.js [face]
// Prints {signal, vitals, simulated, simulated_fields} of a session document made by the real recorder (record.js through engine.js),
// so the contract tests can validate what the phone really writes. Nothing else goes to stdout.
// The numbers fed here (pulse 72, fingers 71 and 73, breathing 6, RMSSD 46, quality 0.6) are test inputs, not measurements.
// With the argument `face` the face half of a fake AfferentPulse plugin also sends one reading per second and a few brief facial movements
// (smile 0.08 or 0.01, movement 0.03, a blink every fifth second, camera breathing 12): test inputs as well.
const { load, run } = require('./harness');

const face = process.argv[2] === 'face';
const { A, tick, facePlugin } = load({ uuid: true, face });
const S = A.Sensors;
const feed = i => {
  A.Finger.onReading({ kind: 'hrm', bpm: 72, t_ms: Date.now() });
  A.Finger.onReading({ kind: 'aff1', finger_bpm: [71, 73], breathing_per_min: 6, rmssd_ms: 46, quality: 0.6, presence: 'active', payload_len: 6, t_ms: Date.now() });
  if (!face || i == null) return;
  const tracked = i % 10 !== 9, clear = tracked && i >= 30;
  facePlugin.emit('face', {
    t_ms: Date.now(), tracked, smile: tracked ? (i % 4 === 0 ? 0.08 : 0.01) : null, movement: tracked ? 0.03 : null, blinks: tracked && i % 5 === 0 ? 1 : 0,
    gaze_away: tracked ? (i % 6 === 0 ? 0.5 : 0) : null, distance_cm: tracked ? 32 : null, breathing_per_min: clear ? 12 : null, breathing_snr: clear ? 3.1 : null,
  });
  if (i % 15 === 4) facePlugin.emit('micro', { t_ms: Date.now(), duration_ms: 120 + i * 4, region: ['brow', 'mouth', 'eye', 'cheek'][(i - 4) / 15], peak: 0.2 });
};

(async () => {
  if (face) { await A.Face.sync(); facePlugin.emit('faceState', { state: 'tracking' }); }
  S.setFingerLink('connected', 'Afferent Finger');
  feed(); tick(1); feed();
  const s = A.startSession({ clock: 'morning', input: 'touch', stage: true, profile: 'live' });
  let doc = null;
  A.bus.on('sessionEnd', d => { doc = d; });
  run(A, tick, s, 60, null, feed);
  s.finish('partial');

  const { signal, vitals, simulated, simulated_fields } = doc;
  process.stdout.write(JSON.stringify({ signal, vitals, simulated, simulated_fields }) + '\n');
})();
