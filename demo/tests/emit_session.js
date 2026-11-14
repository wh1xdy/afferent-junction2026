// Run: node demo/tests/emit_session.js [face|watch]
// Prints {signal, vitals, simulated, simulated_fields} of a session document made by the real recorder (record.js through engine.js),
// so the contract tests can validate what the phone really writes. Nothing else goes to stdout.
// The numbers fed here (pulse 72, fingers 71 and 73, breathing 6, RMSSD 46, quality 0.6) are test inputs, not measurements.
// With the argument `face` the face half of a fake AfferentPulse plugin also sends one reading per second and a few brief facial movements
// (smile 0.08 or 0.01, movement 0.03, a blink every fifth second, camera breathing 12): test inputs as well.
const { load, run } = require('./harness');

// With the argument `watch` there is no finger sensor: a chest strap over the Bluetooth Heart Rate Service sends pulse 66
// with beat-to-beat intervals of 1000 and 1040 ms in turn, and Apple Health has a heart rate from 4 minutes ago (test
// inputs). The output then also carries context and adaptive, for vitals.watch, context.health and hrv_source.
const face = process.argv[2] === 'face', watch = process.argv[2] === 'watch';
const { A, tick, facePlugin, healthPlugin } = load({ uuid: true, face, health: watch, storage: watch ? new Map() : null });
const S = A.Sensors;
let beat = 0;
const strap = () => S.feedWatch({ kind: 'hr', bpm: 66, contact: true, energy_kj: null, rr_ms: [beat++ % 2 ? 1040 : 1000], t_ms: Date.now() });
const feed = i => {
  if (watch) { strap(); return; }
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
  if (watch) {
    healthPlugin.data = { heart_rate: { bpm: 63, end_ms: Date.now() - 4 * 60e3, device: 'Watch' }, resting_hr: { bpm: 54, end_ms: Date.now() - 6 * 3600e3, device: 'Watch' } };
    await A.Health.enable();
    S.enabled.watch = true; S.setWatchLink('connected', 'Polar H10');
  } else S.setFingerLink('connected', 'Afferent Finger');
  feed(); tick(1); feed();
  const s = A.startSession({ clock: 'morning', input: 'touch', stage: true, profile: 'live' });
  let doc = null;
  A.bus.on('sessionEnd', d => { doc = d; });
  run(A, tick, s, 60, null, feed);
  s.finish('partial');

  const { signal, vitals, simulated, simulated_fields, context, adaptive } = doc;
  process.stdout.write(JSON.stringify({ signal, vitals, simulated, simulated_fields, ...(watch ? { context, adaptive } : {}) }) + '\n');
})();
