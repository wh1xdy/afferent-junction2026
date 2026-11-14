// Run: node demo/tests/sensors.test.js
// Sensor intake, pulse lock, physio recording and the wording guard. All numbers are test inputs, not measurements.
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { load, run, plain, JS } = require('./harness');

const STAT = ['first', 'last', 'max', 'mean', 'min', 'samples'];
const PHYSIO = ['age_s', 'breathing_per_min', 'contact', 'finger_bpm', 'link', 'presence', 'pulse_bpm', 'quality', 'quality_reported', 'rmssd_ms', 'rmssd_vs_baseline', 'sdnn_ms', 'simulated', 'source', 'transport'];
const keys = o => Object.keys(o).sort();
const isStat = (o, name) => assert.deepStrictEqual(keys(o), STAT, `${name} is not a stat block`);

const hrm = (bpm = 72) => ({ kind: 'hrm', bpm, t_ms: Date.now() });
const aff6 = (o = {}) => ({ kind: 'aff1', finger_bpm: [71, 73], breathing_per_min: 6, rmssd_ms: 46, quality: 0.6, presence: 'active', payload_len: 6, t_ms: Date.now(), ...o });
const aff4 = (o = {}) => aff6({ quality: null, presence: null, payload_len: 4, ...o });
const hubFrame = (o = {}) => ({
  type: 'physio', source: 'finger_ppg', transport: 'hub_http', simulated: false, pulse_bpm: 72, quality: 0.7, quality_reported: true, contact: true,
  finger_bpm: [71, 73], breathing_per_min: 6, rmssd_ms: 46, sdnn_ms: 40, rmssd_vs_baseline: -0.1, presence: 'active', age_s: 0.4, ...o,
});
const connect = A => A.Sensors.setFingerLink('connected', 'Afferent Finger');
const cam = (S, o = {}) => S.feedNativePulse({ source: 'rppg', bpm: 80, face: true, trust: { score: 82, label: 'reliable', reasons: [] }, ...o });
const ble = (A, aff = aff6()) => { A.Sensors.feedFingerBle(hrm()); A.Sensors.feedFingerBle(aff); };
const start = A => A.startSession({ clock: 'morning', input: 'touch', stage: true, profile: 'live' });
const finish = (A, s) => { let doc = null; A.bus.on('sessionEnd', d => { doc = d; }); s.finish('partial'); return plain(doc); };

const tests = {
  'a: the finger_ppg label is kept; a missing or unknown source is dropped and counted; null quality stays null and is never used'() {
    const { A } = load(), S = A.Sensors;
    S.enabled.simulator = false;
    S.feedPulse({ bpm: 72, quality: 0.8, contact: true, source: 'finger_ppg' });
    assert.strictEqual(S.stone.source, 'finger_ppg');
    assert.strictEqual(S.pulse(A.now()).source, 'finger_ppg');
    S.feedPulse({ bpm: 72, quality: 0.8, contact: true });
    assert.strictEqual(S.stone, null);
    S.feedPulse({ bpm: 72, quality: 0.8, contact: true, source: 'mystery' });
    assert.strictEqual(S.stone, null);
    assert.strictEqual(S.droppedPulse, 2);
    S.feedPulse({ bpm: 72, contact: true, source: 'finger_ppg' });
    assert.strictEqual(S.stone.quality, null);
    assert.strictEqual(S.pulse(A.now()).bpm, null);
    S.feedPulse({ bpm: 72, quality: 0.8, contact: true, source: 'ky039' });
    assert.strictEqual(S.pulse(A.now()).source, 'ky039');
  },

  'b: a value older than 3 s is not returned'() {
    const { A, tick } = load(), S = A.Sensors;
    S.enabled.simulator = false;
    S.feedPulse({ bpm: 72, quality: 0.8, contact: true, source: 'finger_ppg' });
    tick(2.9);
    assert.strictEqual(S.pulse(A.now()).bpm, 72);
    tick(0.2);
    assert.strictEqual(S.pulse(A.now()).bpm, null);
    S.enabled.simulator = true;
    assert.strictEqual(S.pulse(A.now()).source, 'simulated', 'outside a session the old order still applies');
  },

  'c: quality 0.29 is not used, 0.3 is (A7)'() {
    const { A } = load(), S = A.Sensors;
    S.enabled.simulator = false;
    S.feedPulse({ bpm: 72, quality: 0.29, contact: true, source: 'finger_ppg' });
    assert.strictEqual(S.pulse(A.now()).bpm, null);
    S.feedPulse({ bpm: 72, quality: 0.3, contact: true, source: 'finger_ppg' });
    assert.strictEqual(S.pulse(A.now()).bpm, 72);
  },

  'd: BLE merge: a 6-byte AFF1 gives a full frame; a 4-byte AFF1 is shown but never drives the game'() {
    let { A, tick } = load(), S = A.Sensors;
    connect(A); ble(A);
    assert.deepStrictEqual(plain(S.fingerFrame(A.now())), {
      source: 'finger_ppg', transport: 'ble', simulated: false, pulse_bpm: 72, quality: 0.6, quality_reported: true, contact: true,
      finger_bpm: [71, 73], breathing_per_min: 6, rmssd_ms: 46, sdnn_ms: null, rmssd_vs_baseline: null, presence: 'active', age_s: 0, link: 'connected',
    });
    assert.deepStrictEqual(plain(S.pulse(A.now())), { bpm: 72, quality: 0.6, source: 'finger_ppg', at: 0 }, 'the quality that follows a pulse applies to it');
    tick(2); S.feedFingerBle(aff6({ quality: 0.8 }));
    assert.deepStrictEqual(plain(S.pulse(A.now())), { bpm: 72, quality: 0.8, source: 'finger_ppg', at: 0 }, 'a later quality does not make the pulse younger');
    tick(1.1);
    assert.strictEqual(S.pulse(A.now()).source, 'simulated', 'the pulse itself is now older than 3 s');
    S.feedFingerBle(aff6());
    assert.strictEqual(S.pulse(A.now()).source, 'simulated');
    S.feedFingerBle(hrm(74));
    assert.deepStrictEqual(plain(S.pulse(A.now())), { bpm: 74, quality: 0.6, source: 'finger_ppg', at: 3.1 });
    tick(3.5);
    const old = plain(S.fingerFrame(A.now()));
    assert.deepStrictEqual([old.pulse_bpm, old.quality, old.finger_bpm, old.breathing_per_min, old.rmssd_ms, old.presence], [null, null, [null, null], null, null, 'active']);

    ({ A, tick } = load()); S = A.Sensors;
    S.enabled.simulator = false;
    connect(A); ble(A, aff4()); tick(1); S.feedFingerBle(hrm());
    const f = plain(S.livePhysio(A.now()));
    assert.deepStrictEqual([f.quality_reported, f.quality, f.presence, f.pulse_bpm, f.finger_bpm, f.contact], [false, null, null, 72, [71, 73], true]);
    assert.strictEqual(S.pulse(A.now()).bpm, null);
    assert.strictEqual(S.lockPulse(A.now()), 'real');
    assert.strictEqual(S.pulse(A.now()).bpm, null);
    S.enabled.simulator = true;
    assert.strictEqual(S.pulse(A.now()).bpm, null, 'the simulator does not fill in for a connected finger sensor');
  },

  'e: presence idle clears the stone; zero readings arrive as null'() {
    const { A, tick } = load(), S = A.Sensors;
    connect(A); ble(A); tick(1); S.feedFingerBle(hrm());
    assert.strictEqual(S.stone.bpm, 72);
    S.feedFingerBle(aff6({ presence: 'idle', finger_bpm: [0, 73], breathing_per_min: 0, rmssd_ms: 0 }));
    assert.strictEqual(S.stone, null);
    const f = plain(S.fingerFrame(A.now()));
    assert.deepStrictEqual([f.finger_bpm, f.breathing_per_min, f.rmssd_ms, f.presence, f.contact], [[null, 73], null, null, 'idle', false]);
    S.feedFingerBle(hrm(72));
    assert.strictEqual(S.stone, null, 'a pulse while the sensor says idle is not used');
    S.feedFingerBle(aff6()); S.feedFingerBle(hrm(0));
    assert.strictEqual(S.stone, null);
    assert.strictEqual(S.fingerFrame(A.now()).pulse_bpm, null);
  },

  async 'f: Finger drops a reading that is 4 s old, follows the plugin state and stops with the switch'() {
    const { A, plugin } = load({ finger: true }), S = A.Sensors, F = A.Finger;
    assert.ok(F.available());
    await F.sync();
    assert.deepStrictEqual([plugin.running, plugin.count('state'), plugin.count('reading'), S.fingerLink.state], [true, 1, 1, 'scanning']);
    await F.sync();
    assert.strictEqual(plugin.starts, 1, 'sync is idempotent');
    plugin.emit('reading', hrm());
    assert.strictEqual(S.fingerBle, null, 'no reading counts before the link is connected');
    plugin.emit('state', { state: 'connected', name: 'Afferent Finger' });
    plugin.emit('reading', { ...hrm(), t_ms: Date.now() - 4000 });
    assert.strictEqual(S.fingerBle, null);
    plugin.emit('reading', hrm());
    assert.strictEqual(S.fingerBle.pulse_bpm, 72);
    plugin.emit('state', { state: 'scanning', name: null });
    assert.deepStrictEqual([S.fingerBle, S.stone], [null, null]);
    A.config.sensors.pulse_stone = false; S.enabled.pulse_stone = false;
    await F.sync();
    assert.deepStrictEqual([plugin.running, plugin.count('reading'), S.fingerLink.state], [false, 0, 'off']);

    const web = load();
    assert.strictEqual(web.A.Finger.available(), false);
    await web.A.Finger.sync();
    assert.strictEqual(web.A.Sensors.fingerLink.state, 'unavailable');
    assert.strictEqual(web.A.Sensors.livePhysio(0), null);
  },

  'g: a session is locked to real or simulated pulse at its start'() {
    let { A, tick } = load(), S = A.Sensors;
    connect(A); ble(A); tick(1); S.feedFingerBle(hrm());
    let s = start(A);
    assert.strictEqual(S.pulseMode, 'real');
    run(A, tick, s, 5, null, () => ble(A));
    assert.strictEqual(S.pulse(A.now()).source, 'finger_ppg');
    run(A, tick, s, 6);
    assert.deepStrictEqual(plain(S.pulse(A.now())), { bpm: null, quality: 0, source: null });
    assert.deepStrictEqual(Object.keys(s.sig.pulseSources), ['finger_ppg']);
    let doc = finish(A, s);
    assert.strictEqual(S.pulseMode, null);
    assert.ok(!doc.simulated_fields.some(f => /pulse|vitals/.test(f)), doc.simulated_fields.join());

    ({ A, tick } = load()); S = A.Sensors;
    s = start(A);
    assert.strictEqual(S.pulseMode, 'simulated');
    run(A, tick, s, 3);
    connect(A);
    run(A, tick, s, 10, () => assert.strictEqual(S.pulse(A.now()).source, 'simulated'), () => ble(A));
    assert.strictEqual(S.stone.source, 'finger_ppg');
    doc = finish(A, s);
    assert.strictEqual(doc.signal.pulse_source, 'simulated');
    assert.strictEqual(doc.vitals.pulse_source, 'simulated');
    assert.strictEqual(doc.vitals.finger.source, 'finger_ppg');
    assert.strictEqual(doc.vitals.finger.pulse_bpm.mean, 72);
    for (const f of ['signal.pulse_source', 'tasks.pulse', 'pre_post.pulse', 'vitals.pulse_mean_bpm', 'vitals.pulse_source']) assert.ok(doc.simulated_fields.includes(f), f);
    assert.ok(!doc.simulated_fields.some(f => f === 'vitals' || /finger|breathing|hrv|series/.test(f)), doc.simulated_fields.join());
  },

  'g2: a hub pulse stone (ky039) locks the session to real; with the simulator off a session is real even without a producer'() {
    let { A, tick } = load(), S = A.Sensors;
    S.feedPulse({ bpm: null, quality: 0, contact: false, source: 'ky039' });
    assert.strictEqual(S.lockPulse(A.now()), 'real', 'a real stone without a finger on it is still a real producer');
    S.unlockPulse(); tick(11);
    assert.strictEqual(S.lockPulse(A.now()), 'simulated', 'a producer that went silent no longer counts');
    S.unlockPulse();
    S.feedPulse({ bpm: 70, quality: 0.9, contact: true, source: 'simulated' });
    assert.strictEqual(S.lockPulse(A.now()), 'simulated');
    assert.strictEqual(S.pulse(A.now()).source, 'simulated');
    S.feedPulse({ bpm: 71, quality: 0.9, contact: true, source: 'ky039' });
    S.feedPulse({ bpm: 90, quality: 0.9, contact: true, source: 'simulated' });
    assert.strictEqual(S.stone.source, 'ky039', 'a simulated frame never replaces a fresh real one');
    S.unlockPulse();
    S.enabled.simulator = false;
    assert.strictEqual(S.lockPulse(A.now() + 60), 'real');
  },

  'h: with pulse_stone off the receiver drops every finger frame'() {
    const { A } = load(), S = A.Sensors;
    connect(A);
    S.enabled.pulse_stone = false;
    ble(A); S.feedFingerHub(hubFrame());
    assert.deepStrictEqual([S.fingerBle, S.fingerHub, S.stone, S.fingerFrame(A.now())], [null, null, null, null]);
    assert.strictEqual(S.fingerAttached(A.now()), false);
    S.feedPulse({ bpm: 72, quality: 0.9, contact: true, source: 'finger_ppg' });
    assert.notStrictEqual(S.pulse(A.now()).source, 'finger_ppg');
  },

  'i: the session document records finger, breathing, variation and series with fixed keys'() {
    let { A, tick } = load(), S = A.Sensors;
    connect(A); ble(A); tick(1); S.feedFingerBle(hrm());
    let s = start(A);
    run(A, tick, s, 30, null, () => ble(A));
    let doc = finish(A, s), v = doc.vitals;
    assert.strictEqual(doc.signal.pulse_source, 'finger_ppg');
    assert.strictEqual(doc.signal.pulse_quality_mean, 0.6);
    assert.ok(!doc.simulated_fields.some(f => /pulse|vitals/.test(f)), doc.simulated_fields.join());
    assert.deepStrictEqual(keys(v), ['breathing', 'camera_pulse', 'finger', 'hrv', 'pulse_max_bpm', 'pulse_mean_bpm', 'pulse_min_bpm', 'pulse_source', 'series']);
    assert.deepStrictEqual([v.pulse_mean_bpm, v.pulse_source, v.camera_pulse], [72, 'finger_ppg', null]);
    assert.deepStrictEqual(keys(v.finger), ['finger_1_bpm', 'finger_2_bpm', 'fingers_abs_diff_bpm', 'presence_s', 'pulse_bpm', 'quality', 'quality_reported', 'seconds', 'source', 'transport']);
    for (const k of ['pulse_bpm', 'quality', 'finger_1_bpm', 'finger_2_bpm']) isStat(v.finger[k], 'finger.' + k);
    assert.deepStrictEqual([v.finger.source, v.finger.transport, v.finger.quality_reported, v.finger.fingers_abs_diff_bpm], ['finger_ppg', 'ble', true, 2]);
    assert.deepStrictEqual(v.finger.pulse_bpm, { mean: 72, min: 72, max: 72, first: 72, last: 72, samples: v.finger.seconds });
    assert.deepStrictEqual([v.finger.finger_1_bpm.mean, v.finger.finger_2_bpm.mean, v.finger.quality.mean], [71, 73, 0.6]);
    assert.ok(v.finger.seconds >= 27 && v.finger.seconds <= 29, `seconds ${v.finger.seconds}`);
    assert.deepStrictEqual(v.finger.presence_s, { idle: 0, probing: 0, active: v.finger.seconds });
    assert.deepStrictEqual(keys(v.breathing), ['method', 'rate_per_min', 'source']);
    isStat(v.breathing.rate_per_min, 'breathing.rate_per_min');
    assert.deepStrictEqual([v.breathing.source, v.breathing.method, v.breathing.rate_per_min.mean], ['finger_ppg', 'pulse_rhythm', 6]);
    assert.deepStrictEqual(keys(v.hrv), ['rmssd_ms', 'rmssd_vs_baseline', 'sdnn_ms', 'source', 'window_s']);
    isStat(v.hrv.rmssd_ms, 'hrv.rmssd_ms');
    assert.deepStrictEqual([v.hrv.source, v.hrv.window_s, v.hrv.rmssd_ms.mean, v.hrv.sdnn_ms, v.hrv.rmssd_vs_baseline], ['finger_ppg', 60, 46, null, null]);
    assert.deepStrictEqual(keys(v.series), ['breathing_per_min', 'pulse_bpm', 'rmssd_ms', 'step_s', 't_s']);
    const n = v.series.t_s.length;
    assert.ok(n >= 5 && n <= 240, `series length ${n}`);
    assert.deepStrictEqual([v.series.step_s, v.series.pulse_bpm.length, v.series.breathing_per_min.length, v.series.rmssd_ms.length], [5, n, n, n]);
    assert.ok(v.series.t_s.every((t, i) => Number.isInteger(t) && (i === 0 || t - v.series.t_s[i - 1] === 5)), v.series.t_s.join());

    ({ A, tick } = load()); S = A.Sensors;
    S.feedFingerHub(hubFrame());
    s = start(A);
    assert.strictEqual(S.pulseMode, 'real');
    run(A, tick, s, 12, null, () => S.feedFingerHub(hubFrame()));
    assert.deepStrictEqual(keys(S.fingerFrame(A.now())), PHYSIO);
    doc = finish(A, s); v = doc.vitals;
    assert.deepStrictEqual([v.finger.source, v.finger.transport, doc.signal.pulse_source], ['finger_ppg', 'hub_http', 'finger_ppg']);
    isStat(v.hrv.sdnn_ms, 'hrv.sdnn_ms'); isStat(v.hrv.rmssd_vs_baseline, 'hrv.rmssd_vs_baseline');
    assert.deepStrictEqual([v.hrv.sdnn_ms.mean, v.hrv.rmssd_vs_baseline.mean], [40, -0.1]);

    ({ A, tick } = load()); S = A.Sensors;
    S.feedFingerHub(hubFrame({ source: 'simulated', simulated: true }));
    s = start(A);
    assert.strictEqual(S.pulseMode, 'simulated');
    run(A, tick, s, 12, null, () => S.feedFingerHub(hubFrame({ source: 'simulated', simulated: true })));
    connect(A); ble(A);
    run(A, tick, s, 3, null, () => ble(A));
    doc = finish(A, s); v = doc.vitals;
    assert.deepStrictEqual([v.finger.source, v.breathing.source, v.hrv.source], ['simulated', 'simulated', 'simulated']);
    assert.ok(v.finger.seconds - v.finger.pulse_bpm.samples >= 3, 'frames from another source are not mixed into a simulated recording');
    for (const f of ['vitals', 'vitals.finger', 'vitals.breathing', 'vitals.hrv', 'vitals.series']) assert.ok(doc.simulated_fields.includes(f), f);

    ({ A, tick } = load());
    s = start(A);
    run(A, tick, s, 4);
    doc = finish(A, s); v = doc.vitals;
    assert.deepStrictEqual([v.finger, v.breathing, v.hrv, v.camera_pulse, v.series], [null, null, null, null, null]);
  },

  'j: one simulated pulse frame in a session puts the pulse fields into simulated_fields'() {
    const { A, tick } = load(), S = A.Sensors;
    connect(A); ble(A); tick(1); S.feedFingerBle(hrm());
    const s = start(A);
    run(A, tick, s, 5, null, () => ble(A));
    s.sample(A.now(), 0.05, { bpm: 70, quality: 0.9, source: 'simulated' }, null);
    const doc = finish(A, s);
    assert.strictEqual(doc.signal.pulse_source, 'finger_ppg', 'the label is still the majority source');
    for (const f of ['signal.pulse_source', 'core.rest.pulse_bpm', 'tasks.pulse', 'pre_post.pulse', 'vitals.pulse_mean_bpm']) assert.ok(doc.simulated_fields.includes(f), f);
    assert.strictEqual(doc.simulated, true);
  },

  'k: the camera pulse keeps its trust score and its own source, and is never the pulse the game uses'() {
    const { A } = load(), S = A.Sensors;
    S.enabled.simulator = false;
    cam(S);
    assert.deepStrictEqual(plain(S.cameraPulse(A.now())), { source: 'rppg', bpm: 80, trust_score: 82, trust_label: 'reliable', age_s: 0 });
    assert.deepStrictEqual(plain(S.pulse(A.now())), { bpm: null, quality: 0, source: null }, 'no finger and no simulator: the game has no pulse');
    assert.strictEqual(S.realProducer(A.now()), false, 'the camera is not a pulse producer for the game');
    assert.strictEqual(S.lockPulse(A.now()), 'real');
    assert.strictEqual(S.pulse(A.now()).bpm, null);
    S.unlockPulse();
    S.enabled.simulator = true;
    assert.strictEqual(S.pulse(A.now()).source, 'simulated');
    assert.strictEqual(S.lockPulse(A.now()), 'simulated', 'a camera pulse does not make a session a measured one');
    S.unlockPulse();

    connect(A); ble(A);
    cam(S, { bpm: 95 });
    assert.deepStrictEqual([S.pulse(A.now()).bpm, S.pulse(A.now()).source], [72, 'finger_ppg']);
    assert.deepStrictEqual([S.fingerFrame(A.now()).pulse_bpm, S.fingerFrame(A.now()).source], [72, 'finger_ppg']);
    assert.deepStrictEqual([S.cameraPulse(A.now()).bpm, S.cameraPulse(A.now()).source], [95, 'rppg'], 'two separate numbers');

    for (const source of ['finger_ppg', 'simulated', 'ky039', undefined]) S.feedNativePulse({ source, bpm: 60, face: true, trust: { score: 90, label: 'reliable', reasons: [] } });
    assert.strictEqual(S.droppedCam, 4);
    assert.strictEqual(S.cameraPulse(A.now()).bpm, 95, 'a reading under another label never lands in the camera slot');
    S.feedPulse({ bpm: 61, quality: 0.9, contact: true, source: 'rppg' });
    assert.strictEqual(S.stone, null, 'and rppg is not accepted as a finger or stone source');
  },

  'k2: a camera reading below the trust limit, without a trust score, or older than 3 s is not a measurement'() {
    const { A, tick } = load(), S = A.Sensors, at = () => plain(S.cameraPulse(A.now()));
    cam(S, { bpm: 77, trust: { score: 39, label: 'unreliable', reasons: ['head moving'] } });
    assert.deepStrictEqual(at(), { source: 'rppg', bpm: null, trust_score: 39, trust_label: 'unreliable', age_s: 0 });
    cam(S, { bpm: 77, trust: { score: 40, label: 'uncertain', reasons: [] } });
    assert.deepStrictEqual(at(), { source: 'rppg', bpm: 77, trust_score: 40, trust_label: 'uncertain', age_s: 0 });
    cam(S, { bpm: 77, trust: { score: 55, label: 'unreliable', reasons: [] } });
    assert.strictEqual(at().bpm, null, 'the unreliable label alone is enough');
    cam(S, { bpm: 77, trust: { score: 12.5, label: 'unreliable', reasons: [] } });
    assert.strictEqual(at().trust_score, 12.5, 'the score is passed on as it came');

    cam(S, { bpm: 77, trust: undefined });
    assert.strictEqual(at(), null, 'no trust score: nothing is shown and no score is made up');
    cam(S, { bpm: 77, trust: { label: 'reliable' } });
    assert.strictEqual(at(), null);
    cam(S, { bpm: null, face: false, trust: undefined });
    assert.strictEqual(at(), null);
    assert.deepStrictEqual(plain(S.cameraState(A.now())), { link: 'unavailable', face: false, reason: null });

    cam(S);
    assert.strictEqual(at().bpm, 80);
    cam(S, { bpm: null, trust: undefined });
    assert.strictEqual(at(), null, 'a second without a reading clears the last one at once, not after 3 s');

    cam(S);
    tick(2.9);
    assert.deepStrictEqual([at().bpm, at().age_s], [80, 2.9]);
    tick(0.2);
    assert.strictEqual(at(), null);
    cam(S, { t_ms: Date.now() - 2000 });
    assert.strictEqual(at().age_s, 2, 'the 3 s count from when the phone measured it');
    tick(1.1);
    assert.strictEqual(at(), null);

    cam(S);
    S.enabled.phone_camera = false;
    assert.strictEqual(at(), null);
    cam(S, { bpm: 99 });
    S.enabled.phone_camera = true;
    assert.strictEqual(at().bpm, 80, 'nothing is taken in while the camera is switched off');
  },

  'k3: the session records the camera pulse in its own block with source rppg; unreliable seconds add no bpm'() {
    let { A, tick } = load(), S = A.Sensors;
    let s = start(A);
    assert.strictEqual(S.pulseMode, 'simulated');
    run(A, tick, s, 12, null, i => i < 6 ? cam(S) : i < 8 ? cam(S, { bpm: 84, trust: { score: 55, label: 'uncertain', reasons: [] } })
      : cam(S, { bpm: 140, trust: { score: 10, label: 'unreliable', reasons: ['head moving'] } }));
    let doc = finish(A, s), c = doc.vitals.camera_pulse;
    assert.deepStrictEqual(keys(c), ['pulse_bpm', 'source', 'trust_label_s', 'trust_score']);
    isStat(c.pulse_bpm, 'camera_pulse.pulse_bpm'); isStat(c.trust_score, 'camera_pulse.trust_score');
    assert.deepStrictEqual(keys(c.trust_label_s), ['reliable', 'uncertain', 'unreliable']);
    assert.deepStrictEqual([c.source, c.pulse_bpm.min, c.pulse_bpm.max, c.trust_score.max, c.trust_score.min], ['rppg', 80, 84, 82, 10]);
    assert.ok(c.trust_label_s.reliable >= 3 && c.trust_label_s.uncertain >= 1 && c.trust_label_s.unreliable >= 2, JSON.stringify(c.trust_label_s));
    assert.strictEqual(c.pulse_bpm.samples, c.trust_label_s.reliable + c.trust_label_s.uncertain, 'only trusted seconds carry a bpm');
    assert.deepStrictEqual([doc.vitals.pulse_source, doc.signal.pulse_source, doc.vitals.finger], ['simulated', 'simulated', null]);
    assert.ok(doc.vitals.pulse_max_bpm < 100, 'the camera number never enters the pulse the game used');
    assert.ok(doc.simulated_fields.includes('vitals.pulse_source') && !doc.simulated_fields.includes('vitals') && !doc.simulated_fields.includes('vitals.camera_pulse'));

    ({ A, tick } = load()); S = A.Sensors;
    s = start(A);
    run(A, tick, s, 6, null, () => cam(S, { bpm: 140, trust: { score: 10, label: 'unreliable', reasons: [] } }));
    assert.strictEqual(finish(A, s).vitals.camera_pulse, null, 'only unreliable readings: no camera block');

    ({ A, tick } = load()); S = A.Sensors;
    connect(A); ble(A); tick(1); S.feedFingerBle(hrm());
    s = start(A);
    run(A, tick, s, 6, null, () => { ble(A); cam(S, { bpm: 95 }); });
    doc = finish(A, s);
    assert.deepStrictEqual([doc.vitals.pulse_source, doc.vitals.pulse_mean_bpm, doc.vitals.finger.source, doc.vitals.finger.pulse_bpm.mean], ['finger_ppg', 72, 'finger_ppg', 72]);
    assert.deepStrictEqual([doc.vitals.camera_pulse.source, doc.vitals.camera_pulse.pulse_bpm.mean], ['rppg', 95]);
  },

  'l: liveMetrics carries physio; the camera pulse stays on the phone'() {
    const { A, tick } = load(), S = A.Sensors;
    let s = start(A), m = s.liveMetrics(A.now());
    assert.deepStrictEqual([m.physio, 'camera_pulse' in m], [null, false]);
    s.finish('partial');
    connect(A);
    s = start(A);
    m = plain(s.liveMetrics(A.now()));
    assert.deepStrictEqual(keys(m.physio), PHYSIO);
    assert.deepStrictEqual([m.physio.source, m.physio.link, m.physio.pulse_bpm, m.pulse_bpm, m.pulse_source], [null, 'connected', null, null, null]);
    ble(A); tick(1); S.feedFingerBle(hrm());
    cam(S);
    m = plain(s.liveMetrics(A.now()));
    assert.deepStrictEqual(keys(m.physio), PHYSIO);
    assert.deepStrictEqual([m.physio.source, m.physio.transport, m.physio.pulse_bpm, m.physio.rmssd_ms, m.pulse_source, m.pulse_bpm], ['finger_ppg', 'ble', 72, 46, 'finger_ppg', 72]);
    assert.strictEqual(S.cameraPulse(A.now()).bpm, 80);
    assert.ok(!('camera_pulse' in m) && !/rppg|trust_score|trust_label/.test(JSON.stringify(m)), 'no camera bpm or trust score in what goes out live');
  },

  'm: wording guard for the Your signals sheet'() {
    const js = fs.readFileSync(path.join(JS, 'vitals.js'), 'utf8'), html = fs.readFileSync(path.join(JS, '..', 'index.html'), 'utf8');
    const a = html.indexOf('<div id="signals"'), b = html.indexOf('<div id="settings"');
    assert.ok(a > 0 && b > a, 'the #signals markup was not found');
    const sheet = html.slice(a, b);
    assert.ok(sheet.includes('Your signals') && sheet.includes('id="signalsBody"') && sheet.includes('data-close="signals"'));
    for (const [name, text] of [['vitals.js', js], ['#signals', sheet]]) {
      for (const w of ['stress', 'strain', 'screening', 'treat']) assert.ok(!text.toLowerCase().includes(w), `${name} contains "${w}"`);
      assert.ok(!text.includes('HRV'), `${name} contains "HRV"`);
      assert.strictEqual(text.replace(/not a diagnosis/g, '').toLowerCase().includes('diagnos'), false, `${name} uses "diagnos" outside "not a diagnosis"`);
    }
    const shown = (js.match(/'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`/g) || []).join('\n') + '\n' + sheet.replace(/<[^>]*>/g, ' ');
    const banned = shown.match(/\b(hrv|high|low|normal|abnormal|elevated|healthy|unhealthy|good|bad|poor|calm|anxious|tense|relaxed|happy|sad|worried|risk|alert|warning)\b/gi);
    assert.strictEqual(banned, null, `judgement or emotion word in patient text: ${banned}`);
    assert.strictEqual((sheet.match(/not a diagnosis/g) || []).length, 1);
  },

  'n: the sheet text is truthful about source, waiting and missing quality'() {
    let { A, tick } = load({ vitals: true }), S = A.Sensors, V = A.Vitals;
    const lines = m => plain(m).rows.map(r => [r.label, r.value, ...r.lines]);
    let m = V.model(A.now());
    assert.deepStrictEqual(lines(m), [['Pulse', '68', 'beats per minute', 'Simulated'], ['Sensor', null, 'No finger sensor on this device']]);
    S.enabled.simulator = false;
    assert.deepStrictEqual(lines(V.model(A.now()))[0], ['Pulse', null, 'No reading right now']);
    S.enabled.simulator = true;

    S.setFingerLink('scanning');
    assert.deepStrictEqual(lines(V.model(A.now())).pop(), ['Sensor', null, 'Looking for the finger sensor']);
    S.setFingerLink('unauthorized');
    assert.deepStrictEqual(lines(V.model(A.now())).pop(), ['Sensor', null, 'Bluetooth is off for Afferent in Settings']);
    connect(A);
    assert.deepStrictEqual(lines(V.model(A.now())), [['Pulse', null, 'No reading right now'], ['Sensor', null, 'Connected. Place a finger in the clip to start.']]);

    S.feedFingerBle(hrm()); S.feedFingerBle(aff6({ breathing_per_min: 0, rmssd_ms: 0 }));
    m = V.model(A.now());
    assert.deepStrictEqual(lines(m), [
      ['Pulse', '72', 'beats per minute', 'Finger sensor'], ['Finger 1 and finger 2', '71 · 73', 'beats per minute'],
      ['Breathing', null, 'Takes about half a minute of steady signal'], ['Beat-to-beat variation', null, 'Takes about a minute'], ['Sensor', null, 'Measuring'],
    ]);
    assert.strictEqual(m.note, null);
    S.feedFingerBle(aff6({ quality: 0.1 }));
    assert.deepStrictEqual(lines(V.model(A.now()))[0], ['Pulse', null, 'Finger sensor. Waiting for a steady signal']);
    S.feedFingerBle(aff6({ presence: 'probing', finger_bpm: [0, 0], breathing_per_min: 0, rmssd_ms: 0 }));
    tick(3.5);
    S.feedFingerBle(aff6({ presence: 'idle', finger_bpm: [0, 0], breathing_per_min: 0, rmssd_ms: 0 }));
    assert.deepStrictEqual(lines(V.model(A.now())), [
      ['Pulse', null, 'No reading right now'], ['Finger 1 and finger 2', null, 'No reading right now'], ['Breathing', null, 'No reading right now'],
      ['Beat-to-beat variation', null, 'No reading right now'], ['Sensor', null, 'Resting. Place a finger in the clip to start.'],
    ]);

    S.feedFingerBle(hrm()); S.feedFingerBle(aff4());
    m = V.model(A.now());
    assert.deepStrictEqual(lines(m)[0], ['Pulse', '72', 'beats per minute', 'Finger sensor']);
    assert.deepStrictEqual(lines(m).pop(), ['Sensor', null, 'Measuring']);
    assert.strictEqual(m.note, 'This sensor version does not report signal quality yet, so the game does not use this pulse.');

    ({ A, tick } = load({ vitals: true })); S = A.Sensors; V = A.Vitals;
    S.feedFingerHub(hubFrame({ source: 'simulated', simulated: true }));
    cam(S);
    m = V.model(A.now());
    const rows = lines(m);
    for (const r of rows.slice(0, 4)) assert.ok(r.includes('Simulated'), r.join(' | '));
    assert.deepStrictEqual(rows[4], ['Sensor', null, 'Simulated. Measuring', 'Connected through the home hub']);
    assert.deepStrictEqual(rows[5], ['Pulse, camera estimate', '80', 'beats per minute', 'Signal quality 82 of 100 · steady']);
    assert.ok(rows[0].includes('Simulated') && rows[0][1] !== '80', 'the Pulse row is not the camera');
    S.feedFingerHub(hubFrame({ presence: null, pulse_bpm: null, contact: false }));
    assert.deepStrictEqual(lines(V.model(A.now())).find(r => r[0] === 'Sensor'), ['Sensor', null, 'Connected through the home hub']);
    S.enabled.pulse_stone = false;
    assert.deepStrictEqual(lines(V.model(A.now())).find(r => r[0] === 'Sensor'), ['Sensor', null, 'Switched off']);

    assert.strictEqual(V.model(A.now()).earlier, null);
    A.lastVitalsAt = Date.now();
    A.lastVitals = { finger: { source: 'finger_ppg', pulse_bpm: { mean: 71.6 } }, breathing: { rate_per_min: { mean: 6.2 } }, hrv: { rmssd_ms: { mean: 46.4 } }, camera_pulse: null };
    const e = plain(V.model(A.now()).earlier);
    assert.ok(['This morning', 'Earlier today'].includes(e.title));
    assert.deepStrictEqual(e.rows.map(r => [r.label, r.value]), [['Pulse', '72'], ['Breathing', '6'], ['Beat-to-beat variation', '46']]);
    A.lastVitalsAt = Date.now() - 36 * 3600e3;
    assert.strictEqual(V.model(A.now()).earlier, null, 'yesterday is not "this morning"');

    const s = { done: false, gameMode: 'calm', phase: 'game' };
    assert.strictEqual(V.chip(s, { bpm: 72.4, source: 'finger_ppg' }), '72 bpm · finger sensor');
    assert.strictEqual(V.chip(s, { bpm: 68, source: 'simulated' }), 'SIMULATED');
    assert.strictEqual(V.chip(s, { bpm: null, source: null }), 'no reading');
    assert.strictEqual(V.chip({ ...s, gameMode: 'measure' }, { bpm: 72, source: 'finger_ppg' }), null);
    for (const phase of ['rest', 'checkin', 'rt', 'end']) assert.strictEqual(V.chip({ ...s, phase }, { bpm: 72, source: 'finger_ppg' }), null);
  },

  'o: a fresh finger notification tells Home and visitors the bedside unit is in range; a stale one does not'() {
    const { A } = load({ finger: true }), F = A.Finger;
    let seen = 0;
    A.Presence = { unitSeen: () => { seen++; } };
    connect(A);
    F.onReading(hrm());
    F.onReading(aff6());
    assert.strictEqual(seen, 2);
    F.onReading({ ...hrm(), t_ms: Date.now() - 5000 });
    assert.strictEqual(seen, 2, 'a notification older than 3 s is dropped before the hook');
    delete A.Presence;
    F.onReading(hrm());   // presence.js not loaded: no error
    assert.strictEqual(A.Sensors.fingerBle.pulse_bpm, 72);
  },

  'p: the camera row says what it is, shows its signal quality, and never fills the Pulse row'() {
    const { A, tick } = load({ vitals: true }), S = A.Sensors, V = A.Vitals;
    const row = () => plain(V.model(A.now())).rows.filter(r => r.label === 'Pulse, camera estimate').map(r => [r.value ?? null, ...r.lines]);
    const pulse = () => plain(V.model(A.now())).rows[0];
    S.enabled.simulator = false;
    assert.deepStrictEqual(row(), [], 'no camera pulse on this device: no row');
    S.setCameraLink('starting');
    assert.deepStrictEqual(row(), [[null, 'Starting the camera']]);
    S.setCameraLink('unauthorized');
    assert.deepStrictEqual(row(), [[null, 'Camera is off for Afferent in Settings']]);
    S.setCameraLink('unsupported');
    assert.deepStrictEqual(row(), [[null, 'Not available on this phone']]);
    S.setCameraLink('on');
    assert.deepStrictEqual(row(), [[null, 'Starting the camera']]);
    cam(S, { bpm: null, face: false, trust: undefined });
    assert.deepStrictEqual(row(), [[null, 'No face in view']]);
    cam(S, { bpm: null, trust: undefined });
    assert.deepStrictEqual(row(), [[null, 'Hold still. Takes about ten seconds']]);
    cam(S, { bpm: 91, trust: { score: 22, label: 'unreliable', reasons: ['head moving', 'weak pulse signal'] } });
    assert.deepStrictEqual(row(), [[null, 'No steady reading right now', 'Signal quality 22 of 100 · weak', 'Hold the phone still']]);
    cam(S, { bpm: 84, trust: { score: 55, label: 'uncertain', reasons: ['still settling'] } });
    assert.deepStrictEqual(row(), [['84', 'beats per minute', 'Signal quality 55 of 100 · uncertain']]);
    cam(S);
    assert.deepStrictEqual(row(), [['80', 'beats per minute', 'Signal quality 82 of 100 · steady']]);
    assert.deepStrictEqual([pulse().label, pulse().value ?? null, pulse().lines], ['Pulse', null, ['No reading right now']], 'the Pulse row stays empty without a finger');
    tick(3.1);
    assert.deepStrictEqual(row(), [[null, 'Starting the camera']], 'a reading older than 3 s is gone');
    cam(S);
    S.enabled.phone_camera = false;
    assert.deepStrictEqual(row(), [[null, 'Switched off']]);
    S.enabled.phone_camera = true;

    const stat = mean => ({ mean });
    A.lastVitalsAt = Date.now();
    A.lastVitals = { finger: { source: 'finger_ppg', pulse_bpm: stat(71.6) }, breathing: null, hrv: null, camera_pulse: { source: 'rppg', pulse_bpm: stat(78.2), trust_score: stat(74.4) } };
    assert.deepStrictEqual(plain(V.model(A.now()).earlier).rows.map(r => [r.label, r.value, ...r.lines]), [
      ['Pulse', '72', 'beats per minute, average', 'Finger sensor'], ['Pulse, camera estimate', '78', 'beats per minute, average', 'Signal quality 74 of 100, average'],
    ]);
    A.lastVitals = { finger: null, breathing: null, hrv: null, camera_pulse: { source: 'rppg', pulse_bpm: stat(78.2), trust_score: stat(74.4) } };
    assert.deepStrictEqual(plain(V.model(A.now()).earlier).rows.map(r => r.label), ['Pulse, camera estimate'], 'the camera average is never shown as "Pulse"');
  },

  async 'q: the camera pulse plugin starts and stops with the phone camera switch and the app visibility'() {
    const { A, cam: plugin, doc } = load({ camera: true }), S = A.Sensors, C = A.CamPulse;
    const event = (o = {}) => ({ source: 'rppg', bpm: 80, face: true, locked: true, trust: { score: 82, label: 'reliable', reasons: [] }, t_ms: Date.now(), ...o });
    const set = on => { A.config.sensors.phone_camera = on; S.enabled.phone_camera = on; };
    S.enabled.simulator = false;
    assert.strictEqual(C.available(), true);
    await C.sync();
    assert.deepStrictEqual([plugin.starts, plugin.running, plugin.count(), S.camLink.state], [1, true, 1, 'on']);
    await C.sync();
    assert.strictEqual(plugin.starts, 1, 'a second sync does not start it twice');
    plugin.emit(event());
    assert.deepStrictEqual([S.cameraPulse(A.now()).bpm, S.cameraPulse(A.now()).trust_score, S.cameraPulse(A.now()).source], [80, 82, 'rppg']);
    assert.strictEqual(S.pulse(A.now()).bpm, null, 'the plugin never feeds the pulse the game uses');
    plugin.emit(event({ bpm: 99, t_ms: Date.now() - 5000 }));
    assert.strictEqual(S.cameraPulse(A.now()).bpm, 80, 'an event older than 3 s is dropped');

    set(false);
    await C.sync();
    assert.deepStrictEqual([plugin.stops, plugin.running, plugin.count(), S.camLink.state, S.cameraPulse(A.now())], [1, false, 0, 'off', null]);
    plugin.emit(event());
    C.onReading(event());
    assert.strictEqual(S.camPulse, null, 'nothing is taken in after the switch is off');
    set(true);
    await C.sync();
    assert.deepStrictEqual([plugin.starts, plugin.running, S.camLink.state], [2, true, 'on']);

    plugin.emit(event());
    doc.hidden = true;
    await C.sync();
    assert.deepStrictEqual([plugin.stops, plugin.running, S.camLink.state, S.cameraPulse(A.now())], [2, false, 'off', null], 'the camera stops when the app is hidden');
    doc.hidden = false;
    await C.sync();
    assert.deepStrictEqual([plugin.starts, plugin.running], [3, true]);
    await C.stop();

    const starting = C.start();
    doc.hidden = true;
    const stopping = C.sync();
    await Promise.all([starting, stopping]);
    assert.deepStrictEqual([plugin.running, plugin.count(), S.camLink.state], [false, 0, 'off'], 'hiding the app during a start still ends with the camera off');
    doc.hidden = false;

    const warn = console.warn;
    console.warn = () => {};
    try {
      for (const code of ['unauthorized', 'unsupported']) {
        plugin.reject = code;
        await C.sync();
        assert.deepStrictEqual([plugin.running, plugin.count(), S.camLink.state], [false, 0, code]);
      }
      plugin.reject = 'boom';
      await C.sync();
      assert.strictEqual(S.camLink.state, 'unavailable');
    } finally { console.warn = warn; }

    const bare = load();
    await bare.A.CamPulse.sync();
    assert.deepStrictEqual([bare.A.CamPulse.available(), bare.A.Sensors.camLink.state], [false, 'unavailable'], 'no plugin in this build');
  },
};

(async () => {
  let failed = 0;
  for (const [name, fn] of Object.entries(tests)) {
    try { await fn(); console.log('ok  ', name); } catch (e) { failed++; console.log('FAIL', name, '\n     ', e.message); }
  }
  console.log(`${Object.keys(tests).length - failed} ok, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
