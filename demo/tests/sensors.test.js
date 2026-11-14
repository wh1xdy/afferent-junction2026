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

  'd: BLE merge: a 6-byte AFF1 gives a full frame; the pulse of a 4-byte AFF1 (no quality) is neither shown nor used'() {
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
    tick(2); S.feedFingerBle(aff6()); tick(1.5);
    const old = plain(S.fingerFrame(A.now()));
    assert.deepStrictEqual([old.pulse_bpm, old.quality, old.finger_bpm, old.presence, old.contact, old.age_s], [null, 0.6, [71, 73], 'active', true, 1.5],
      'the pulse is 3.5 s old and gone; age_s is the age of the newest value, the AFF1 keepalive');
    tick(1.6);
    assert.strictEqual(S.fingerFrame(A.now()), null, 'no notification for 3 s: presence and contact expire with everything else');
    const silent = plain(S.livePhysio(A.now()));
    assert.deepStrictEqual([silent.source, silent.presence, silent.contact, silent.pulse_bpm, silent.link], [null, null, null, null, 'connected']);

    ({ A, tick } = load()); S = A.Sensors;
    S.enabled.simulator = false;
    connect(A); ble(A, aff4()); tick(1); S.feedFingerBle(hrm());
    const f = plain(S.livePhysio(A.now()));
    assert.deepStrictEqual([f.quality_reported, f.quality, f.presence, f.pulse_bpm, f.finger_bpm, f.contact], [false, null, null, null, [71, 73], true],
      'a pulse without reported quality is not a reading');
    assert.strictEqual(S.pulse(A.now()).bpm, null);
    assert.strictEqual(S.lockPulse(A.now()), 'real');
    assert.strictEqual(S.pulse(A.now()).bpm, null);
    S.enabled.simulator = true;
    assert.strictEqual(S.pulse(A.now()).bpm, null, 'the simulator does not fill in for a connected finger sensor');
  },

  'e: presence idle takes the pulse away; zero readings arrive as null'() {
    const { A, tick } = load(), S = A.Sensors;
    connect(A); ble(A); tick(1); S.feedFingerBle(hrm());
    assert.strictEqual(S.blePulse(A.now()).bpm, 72);
    S.feedFingerBle(aff6({ presence: 'idle', finger_bpm: [0, 73], breathing_per_min: 0, rmssd_ms: 0 }));
    assert.strictEqual(S.blePulse(A.now()), null);
    const f = plain(S.fingerFrame(A.now()));
    assert.deepStrictEqual([f.finger_bpm, f.breathing_per_min, f.rmssd_ms, f.presence, f.contact], [[null, 73], null, null, 'idle', false]);
    S.feedFingerBle(hrm(72));
    assert.strictEqual(S.blePulse(A.now()), null, 'a pulse while the sensor says idle is not used');
    assert.strictEqual(S.fingerFrame(A.now()).pulse_bpm, null);
    S.feedFingerBle(aff6()); S.feedFingerBle(hrm(0));
    assert.strictEqual(S.blePulse(A.now()), null);
    assert.strictEqual(S.fingerFrame(A.now()).pulse_bpm, null);
    assert.strictEqual(S.pulse(A.now()).source, 'simulated');
  },

  async 'f: Finger drops a reading that is 4 s old, follows the plugin state and stops with the switch'() {
    const { A, plugin } = load({ finger: true }), S = A.Sensors, F = A.Finger;
    assert.ok(F.available());
    await F.arm();
    assert.deepStrictEqual([plugin.running, plugin.count('state'), plugin.count('reading'), S.fingerLink.state], [true, 1, 1, 'scanning']);
    await F.sync(); await F.arm();
    assert.strictEqual(plugin.starts, 1, 'sync and arm are idempotent');
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

  async 'f2: Bluetooth is not started (no permission prompt) before the patient reaches Settings, Your signals or a session'() {
    const storage = new Map();
    let { A, plugin } = load({ finger: true, storage }), S = A.Sensors, F = A.Finger;
    assert.strictEqual(F.armed, false);
    await F.sync();                                    // app launch, and a privacy message from the hub
    assert.deepStrictEqual([plugin.starts, plugin.count('state'), S.fingerLink.state], [0, 0, 'off'], 'the switch is on by default, yet nothing starts at launch');
    A.config.sensors.pulse_stone = false;
    await F.arm();                                     // Settings opened with the switch off
    assert.deepStrictEqual([plugin.starts, F.armed, storage.get('afferent.finger.asked')], [0, true, '1']);
    A.config.sensors.pulse_stone = true;
    await F.sync();
    assert.deepStrictEqual([plugin.starts, plugin.running, S.fingerLink.state], [1, true, 'scanning']);

    ({ A, plugin } = load({ finger: true, storage })); F = A.Finger;
    assert.strictEqual(F.armed, true, 'a later launch remembers that the patient has been asked');
    await F.sync();
    assert.strictEqual(plugin.starts, 1, 'so the sensor is connected before the session starts');

    const main = fs.readFileSync(path.join(JS, 'main.js'), 'utf8');
    const arms = main.split('\n').filter(l => l.includes('A.Finger.arm()')).map(l => l.trim());
    assert.strictEqual(arms.length, 3, arms.join('\n'));
    assert.ok(arms[0].includes(`[data-open="settings"], [data-open="signals"]`) && arms[0].includes(`addEventListener('click'`), arms[0]);
    assert.ok(arms[1].includes(`sensor === 'pulse_stone'`) && arms[1].includes('if (el.checked) A.Finger.arm()'), arms[1]);
    assert.ok(/const begin = async \(\) => \{\n\s+A\.Finger\.arm\(\);/.test(main), 'a session start arms it');
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
    assert.strictEqual(S.blePulse(A.now()).source, 'finger_ppg');
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

  'k: the camera pulse keeps its trust score, live and in the session document'() {
    const { A, tick } = load(), S = A.Sensors;
    const cam = (bpm = 80, label = 'reliable', score = 82) => S.feedNativePulse({ source: 'rppg', bpm, quality: 0.7, trust: { score, label, reasons: [] }, light: { lux: 12 } });
    cam();
    assert.deepStrictEqual(plain(S.cameraPulse(A.now())), { source: 'rppg', bpm: 80, trust_score: 82, trust_label: 'reliable', age_s: 0 });
    assert.deepStrictEqual(plain(S.light), { lux: 12 });
    assert.strictEqual(S.pulse(A.now()).source, 'rppg');
    const s = start(A);
    assert.strictEqual(S.pulseMode, 'real');
    run(A, tick, s, 8, null, i => cam(80, i < 6 ? 'reliable' : 'uncertain', i < 6 ? 82 : 55));
    S.feedNativePulse({ source: 'rppg', bpm: null, quality: 0, trust: { score: 10, label: 'unreliable', reasons: ['dark'] } });
    assert.deepStrictEqual(plain(S.cameraPulse(A.now())), { source: 'rppg', bpm: null, trust_score: 10, trust_label: 'unreliable', age_s: 0 });
    tick(3.1);
    assert.strictEqual(S.cameraPulse(A.now()), null);
    const c = finish(A, s).vitals.camera_pulse;
    assert.deepStrictEqual(keys(c), ['pulse_bpm', 'source', 'trust_label_s', 'trust_score']);
    isStat(c.pulse_bpm, 'camera_pulse.pulse_bpm'); isStat(c.trust_score, 'camera_pulse.trust_score');
    assert.deepStrictEqual(keys(c.trust_label_s), ['reliable', 'uncertain', 'unreliable']);
    assert.deepStrictEqual([c.source, c.pulse_bpm.mean, c.trust_score.max, c.trust_score.min], ['rppg', 80, 82, 55]);
    assert.ok(c.trust_label_s.reliable >= 3 && c.trust_label_s.uncertain >= 1, JSON.stringify(c.trust_label_s));
  },

  'l: liveMetrics carries physio and camera_pulse'() {
    const { A, tick } = load(), S = A.Sensors;
    let s = start(A), m = s.liveMetrics(A.now());
    assert.deepStrictEqual([m.physio, m.camera_pulse], [null, null]);
    s.finish('partial');
    connect(A);
    s = start(A);
    m = plain(s.liveMetrics(A.now()));
    assert.deepStrictEqual(keys(m.physio), PHYSIO);
    assert.deepStrictEqual([m.physio.source, m.physio.link, m.physio.pulse_bpm, m.pulse_bpm, m.pulse_source], [null, 'connected', null, null, null]);
    ble(A); tick(1); S.feedFingerBle(hrm());
    S.feedNativePulse({ source: 'rppg', bpm: 80, quality: 0.7, trust: { score: 82, label: 'reliable', reasons: [] } });
    m = plain(s.liveMetrics(A.now()));
    assert.deepStrictEqual(keys(m.physio), PHYSIO);
    assert.deepStrictEqual([m.physio.source, m.physio.transport, m.physio.pulse_bpm, m.physio.rmssd_ms, m.pulse_source, m.pulse_bpm], ['finger_ppg', 'ble', 72, 46, 'finger_ppg', 72]);
    assert.deepStrictEqual(keys(m.camera_pulse), ['age_s', 'bpm', 'source', 'trust_label', 'trust_score']);
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
    assert.deepStrictEqual(lines(m)[0], ['Pulse', null, 'No reading right now']);
    assert.deepStrictEqual(lines(m)[1], ['Finger 1 and finger 2', '71 · 73', 'beats per minute']);
    assert.deepStrictEqual(lines(m).pop(), ['Sensor', null, 'Measuring']);
    assert.strictEqual(m.note, 'This sensor version does not report signal quality, so its pulse is not shown or used.');

    ({ A, tick } = load({ vitals: true })); S = A.Sensors; V = A.Vitals;
    S.feedFingerHub(hubFrame({ source: 'simulated', simulated: true }));
    S.feedNativePulse({ source: 'rppg', bpm: 80, quality: 0.7, trust: { score: 82, label: 'reliable', reasons: [] } });
    m = V.model(A.now());
    const rows = lines(m);
    for (const r of rows.slice(0, 4)) assert.ok(r.includes('Simulated'), r.join(' | '));
    assert.deepStrictEqual(rows[4], ['Sensor', null, 'Simulated. Measuring', 'Connected through the home hub']);
    assert.deepStrictEqual(rows[5], ['Pulse (camera)', '80', 'beats per minute', 'Signal steady · 82 of 100']);
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
    assert.strictEqual(V.chip(s, { bpm: 80, source: 'rppg' }), '80 bpm · camera');
    assert.strictEqual(V.chip(s, { bpm: 68, source: 'simulated' }), 'SIMULATED');
    assert.strictEqual(V.chip(s, { bpm: null, source: null }), 'no reading');
    assert.strictEqual(V.chip({ ...s, gameMode: 'measure' }, { bpm: 72, source: 'finger_ppg' }), null);
    for (const phase of ['rest', 'checkin', 'rt', 'end']) assert.strictEqual(V.chip({ ...s, phase }, { bpm: 72, source: 'finger_ppg' }), null);
  },

  'p: Bluetooth: a fused pulse with quality below 0.3, or without reported quality, is not recorded and not a current reading'() {
    let { A, tick } = load(), S = A.Sensors;
    S.enabled.simulator = false;
    connect(A); ble(A);
    let s = start(A);
    run(A, tick, s, 10, null, () => { S.feedFingerBle(hrm(72)); S.feedFingerBle(aff6({ quality: 0.6 })); });
    run(A, tick, s, 10, null, () => { S.feedFingerBle(hrm(143)); S.feedFingerBle(aff6({ quality: 0.12 })); });
    const live = plain(S.livePhysio(A.now()));
    assert.deepStrictEqual([live.pulse_bpm, live.quality, live.quality_reported, live.finger_bpm], [null, 0.12, true, [71, 73]], 'the quality is still told, the pulse is not');
    assert.strictEqual(S.pulse(A.now()).bpm, null);
    let v = finish(A, s).vitals;
    assert.deepStrictEqual([v.finger.pulse_bpm.min, v.finger.pulse_bpm.max, v.finger.pulse_bpm.last], [72, 72, 72]);
    assert.ok(v.finger.pulse_bpm.samples >= 7 && v.finger.pulse_bpm.samples <= 10, `samples ${v.finger.pulse_bpm.samples}`);
    assert.ok(v.finger.seconds - v.finger.pulse_bpm.samples >= 9, 'the seconds with weak signal have no pulse sample');
    assert.deepStrictEqual([...new Set(v.series.pulse_bpm)], [72, null]);
    assert.deepStrictEqual([v.pulse_max_bpm, v.finger.quality.min], [72, 0.6], 'quality is that of the kept readings');

    ({ A, tick } = load()); S = A.Sensors;
    S.enabled.simulator = false;
    connect(A); ble(A, aff4());
    s = start(A);
    run(A, tick, s, 10, null, () => ble(A, aff4()));
    v = finish(A, s).vitals;
    assert.deepStrictEqual([v.finger.quality_reported, v.finger.pulse_bpm.samples, v.finger.finger_1_bpm.mean, v.pulse_mean_bpm], [false, 0, null, null]);
    assert.ok(v.series.pulse_bpm.every(x => x === null), v.series.pulse_bpm.join());

    ({ A, tick } = load()); S = A.Sensors;
    connect(A); S.feedFingerBle(aff6({ quality: null })); S.feedFingerBle(hrm());
    assert.strictEqual(S.fingerFrame(A.now()).pulse_bpm, null, 'quality byte 255 (not available) is no quality');
    S.feedFingerBle(aff6()); tick(3.1); S.feedFingerBle(hrm());
    assert.strictEqual(S.fingerFrame(A.now()).pulse_bpm, null, 'a quality older than 3 s does not vouch for a new pulse');
  },

  'q: Bluetooth and hub: a usable pulse wins, Bluetooth first; a Bluetooth reading without usable quality never hides the hub pulse'() {
    let { A, tick } = load(), S = A.Sensors;
    S.enabled.simulator = false;
    connect(A);
    assert.strictEqual(S.lockPulse(A.now()), 'real');
    let got = 0;
    const frames = new Set();
    for (let i = 0; i < 100; i++) {                    // 4-byte firmware over Bluetooth, hub once a second, half a second apart
      if (i % 2 === 0) { S.feedPulse({ bpm: 72, quality: 0.7, contact: true, source: 'finger_ppg' }); S.feedFingerHub(hubFrame()); }
      else ble(A, aff4());
      const p = S.pulse(A.now()), f = S.fingerFrame(A.now());
      if (p.bpm === 72 && p.source === 'finger_ppg') got++;
      frames.add(`${f.transport}:${f.pulse_bpm}`);
      tick(0.5);
    }
    assert.strictEqual(got, 100, 'the hub pulse is there in every sample');
    assert.deepStrictEqual([...frames], ['hub_http:72'], 'and the recorder takes the frame that has the pulse');

    S.feedFingerHub(hubFrame());
    S.feedFingerBle(hrm(75)); S.feedFingerBle(aff6());
    assert.deepStrictEqual(plain(S.pulse(A.now())), { bpm: 75, quality: 0.6, source: 'finger_ppg', at: A.now() }, 'both usable: Bluetooth, straight from the sensor');
    assert.deepStrictEqual([S.fingerFrame(A.now()).transport, S.fingerFrame(A.now()).pulse_bpm], ['ble', 75]);
    S.feedFingerBle(aff6({ quality: 0.1 }));
    assert.strictEqual(S.pulse(A.now()).bpm, 72, 'Bluetooth quality dropped: the hub pulse is used');
    assert.strictEqual(S.fingerFrame(A.now()).transport, 'hub_http');
    S.setFingerLink('scanning');
    assert.strictEqual(S.pulse(A.now()).bpm, 72, 'losing the Bluetooth link does not clear the hub pulse');
    S.feedFingerHub(hubFrame({ pulse_bpm: 72, quality: 0.2 }));
    assert.deepStrictEqual([S.pulse(A.now()).bpm, S.fingerFrame(A.now()).pulse_bpm, S.fingerFrame(A.now()).quality], [null, null, 0.2], 'the phone applies the 0.3 rule to the hub path too');
    S.feedFingerHub(hubFrame({ quality: null, quality_reported: false }));
    assert.deepStrictEqual([S.pulse(A.now()).bpm, S.fingerFrame(A.now()).pulse_bpm], [null, null]);

    ({ A, tick } = load()); S = A.Sensors;
    S.enabled.simulator = false;
    connect(A); ble(A);
    const s = start(A);
    run(A, tick, s, 4, null, () => ble(A));
    run(A, tick, s, 12, null, () => { ble(A, aff6({ quality: 0.1 })); S.feedFingerHub(hubFrame()); });
    const v = finish(A, s).vitals;
    assert.deepStrictEqual([v.finger.source, v.finger.transport, v.finger.pulse_bpm.mean], ['finger_ppg', 'hub_http', 72], 'the transport label is the path most of the readings came over');

    ({ A, tick } = load()); S = A.Sensors;
    connect(A); ble(A, aff6({ quality: 0.1 }));
    S.feedFingerHub(hubFrame({ source: 'simulated', simulated: true }));
    assert.deepStrictEqual([S.fingerFrame(A.now()).source, S.fingerFrame(A.now()).transport], ['finger_ppg', 'ble'], 'a simulated hub frame never takes the place of the real sensor');
  },

  'r: hub path: 3 s is counted from the age of the value, not from when the message arrived'() {
    const { A, tick } = load(), S = A.Sensors;
    S.enabled.simulator = false;
    S.feedFingerHub(hubFrame({ pulse_bpm: 70, age_s: 2.9 }));
    assert.deepStrictEqual([S.pulse(A.now()).bpm, S.fingerFrame(A.now()).pulse_bpm, S.fingerFrame(A.now()).age_s], [70, 70, 2.9]);
    tick(0.2);
    const f = plain(S.fingerFrame(A.now()));
    assert.deepStrictEqual([f.pulse_bpm, f.age_s, f.finger_bpm, f.presence], [null, 3.1, [71, 73], 'active'], 'the rest of the frame stands for 3 s after it arrived');
    assert.strictEqual(S.pulse(A.now()).bpm, null);
    S.feedFingerHub(hubFrame({ pulse_bpm: 70, age_s: 3 }));
    assert.deepStrictEqual([S.fingerFrame(A.now()).pulse_bpm, S.pulse(A.now()).bpm], [null, null]);
    S.feedFingerHub(hubFrame({ age_s: null }));
    tick(2.9);
    assert.strictEqual(S.fingerFrame(A.now()).pulse_bpm, 72);
    tick(0.2);
    assert.strictEqual(S.fingerFrame(A.now()), null);
  },

  's: a hub frame flagged simulated is simulated on the phone whatever its source says'() {
    const { A, tick } = load(), S = A.Sensors;
    S.feedFingerHub(hubFrame({ source: 'finger_ppg', simulated: true }));
    const f = plain(S.fingerFrame(A.now()));
    assert.deepStrictEqual([f.source, f.simulated], ['simulated', true]);
    assert.strictEqual(S.fingerAttached(A.now()), false);
    assert.strictEqual(S.lockPulse(A.now()), 'simulated');
    assert.strictEqual(S.pulse(A.now()).source, 'simulated');
    S.unlockPulse();
    const s = start(A);
    run(A, tick, s, 6, null, () => S.feedFingerHub(hubFrame({ source: 'finger_ppg', simulated: true })));
    const doc = finish(A, s);
    assert.deepStrictEqual([doc.vitals.finger.source, doc.signal.pulse_source], ['simulated', 'simulated']);
    for (const k of ['vitals', 'vitals.finger', 'vitals.breathing', 'vitals.hrv', 'vitals.series', 'signal.pulse_source']) assert.ok(doc.simulated_fields.includes(k), k);
  },

  't: Bluetooth RMSSD 255 means above the range of the byte, not 255 ms'() {
    const { A } = load(), S = A.Sensors;
    connect(A); S.feedFingerBle(hrm()); S.feedFingerBle(aff6({ rmssd_ms: 254 }));
    assert.strictEqual(S.fingerFrame(A.now()).rmssd_ms, 254);
    S.feedFingerBle(aff6({ rmssd_ms: 255 }));
    assert.strictEqual(S.fingerFrame(A.now()).rmssd_ms, null);
    S.feedFingerBle(aff6({ rmssd_ms: null }));
    assert.strictEqual(S.fingerFrame(A.now()).rmssd_ms, null);
  },

  'u: the session takes home and visitors from Home and visitors and marks a simulated one'() {
    let { A, tick } = load();
    let s = start(A);
    run(A, tick, s, 2);
    assert.deepStrictEqual([finish(A, s).context.home, A.Presence], [null, undefined], 'not loaded: null, never a guess');
    ({ A, tick } = load());
    A.Presence = { sessionContext: () => ({ home: true, visitors_present: 2, simulated: false }) };
    s = start(A);
    run(A, tick, s, 2);
    let doc = finish(A, s);
    assert.deepStrictEqual([doc.context.home, doc.context.visitors_present], [true, 2]);
    assert.ok(!doc.simulated_fields.some(f => f.startsWith('context.')));
    ({ A, tick } = load());
    A.Presence = { sessionContext: () => ({ home: true, visitors_present: 0, simulated: true }) };
    s = start(A);
    run(A, tick, s, 2);
    doc = finish(A, s);
    assert.deepStrictEqual([doc.context.home, doc.context.visitors_present], [true, 0]);
    for (const f of ['context.home', 'context.visitors_present']) assert.ok(doc.simulated_fields.includes(f), f);
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

  'p: a finger reading below quality 0.3, or without a reported quality, is not recorded as a measurement'() {
    let { A, tick } = load(), S = A.Sensors;
    const good = () => S.feedFingerHub(hubFrame({ pulse_bpm: 62, quality: 0.9, finger_bpm: [61, 63] }));
    const weak = () => S.feedFingerHub(hubFrame({ pulse_bpm: 170, quality: 0.05, finger_bpm: [168, 172], breathing_per_min: 30, rmssd_ms: 250, sdnn_ms: 200, rmssd_vs_baseline: 3 }));
    good();
    let s = start(A);
    run(A, tick, s, 30, null, good);
    run(A, tick, s, 15, null, weak);
    let doc = finish(A, s), v = doc.vitals, f = v.finger;
    assert.ok(f.seconds >= 42, `seconds ${f.seconds}`);
    assert.ok(f.pulse_bpm.samples >= 27 && f.pulse_bpm.samples <= f.seconds - 13, `kept ${f.pulse_bpm.samples} of ${f.seconds}`);
    assert.deepStrictEqual([f.pulse_bpm.mean, f.pulse_bpm.max, f.finger_1_bpm.max, f.finger_2_bpm.max], [62, 62, 61, 63]);
    assert.deepStrictEqual([f.quality.mean, f.quality.min, f.quality.samples], [0.9, 0.9, f.pulse_bpm.samples], 'quality is that of the kept readings');
    assert.deepStrictEqual([f.quality_reported, f.fingers_abs_diff_bpm], [true, 2]);
    assert.deepStrictEqual([v.breathing.rate_per_min.max, v.breathing.rate_per_min.samples], [6, f.pulse_bpm.samples]);
    assert.deepStrictEqual([v.hrv.rmssd_ms.max, v.hrv.sdnn_ms.max, v.hrv.rmssd_vs_baseline.max], [46, 40, -0.1]);
    assert.deepStrictEqual([v.pulse_max_bpm, v.pulse_mean_bpm], [62, 62], 'the game never saw the weak readings either');
    const n = v.series.t_s.length;
    assert.ok(n >= 8, `series length ${n}`);
    for (const [k, kept] of [['pulse_bpm', 62], ['breathing_per_min', 6], ['rmssd_ms', 46]]) {
      assert.ok(v.series[k].every(x => x === null || x === kept), `${k}: ${v.series[k].join()}`);
      assert.deepStrictEqual(v.series[k].slice(-2), [null, null], `${k}: a weak stretch is a gap`);
      assert.strictEqual(v.series[k][0], kept);
    }
    assert.ok(f.presence_s.active >= 42, 'how long a finger was detected does not depend on quality');

    // quality 0.3 itself is kept
    ({ A, tick } = load()); S = A.Sensors;
    const edge = () => S.feedFingerHub(hubFrame({ quality: 0.3 }));
    edge(); s = start(A);
    run(A, tick, s, 12, null, edge);
    v = finish(A, s).vitals;
    assert.deepStrictEqual([v.finger.pulse_bpm.mean, v.finger.quality.min, v.finger.pulse_bpm.samples], [72, 0.3, v.finger.seconds]);

    // a sensor version that does not report quality (4-byte AFF1): the clips were on, nothing is a measurement
    ({ A, tick } = load()); S = A.Sensors;
    connect(A); ble(A, aff4());
    s = start(A);
    run(A, tick, s, 12, null, () => ble(A, aff4()));
    doc = finish(A, s); v = doc.vitals; f = v.finger;
    assert.deepStrictEqual([f.source, f.transport, f.quality_reported], ['finger_ppg', 'ble', false]);
    assert.ok(f.seconds >= 10);
    for (const k of ['pulse_bpm', 'quality', 'finger_1_bpm', 'finger_2_bpm']) assert.deepStrictEqual(f[k], { mean: null, min: null, max: null, first: null, last: null, samples: 0 }, k);
    assert.deepStrictEqual([f.fingers_abs_diff_bpm, v.breathing, v.hrv, v.pulse_mean_bpm], [null, null, null, null]);
    for (const k of ['pulse_bpm', 'breathing_per_min', 'rmssd_ms']) assert.ok(v.series[k].length && v.series[k].every(x => x === null), k);

    // quality reported once but missing on a later reading: that reading is not kept
    ({ A, tick } = load()); S = A.Sensors;
    const unknown = () => S.feedFingerHub(hubFrame({ pulse_bpm: 170, quality: null, quality_reported: true }));
    good();
    s = start(A);
    run(A, tick, s, 6, null, good);
    run(A, tick, s, 6, null, unknown);
    v = finish(A, s).vitals;
    assert.deepStrictEqual([v.finger.pulse_bpm.max, v.finger.quality.min], [62, 0.9]);
    assert.ok(v.finger.seconds - v.finger.pulse_bpm.samples >= 4);
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
