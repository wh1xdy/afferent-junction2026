// Run: node demo/tests/hardware.test.js
// What the app says about sensors and devices, against the hardware that exists: two finger clips (PulseSensors) on a UNO Q,
// one KY-016 RGB LED, a knob, a thermometer and a buzzer Modulino, a Jetson with one camera. There is no bed sensor (Alex A9).
// All numbers are test inputs, not measurements.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
const { load, run, plain, JS } = require('./harness');

const DEMO = path.join(JS, '..'), ROOT = path.join(DEMO, '..');
const read = (...p) => fs.readFileSync(path.join(...p), 'utf8');
const hubFrame = (o = {}) => ({
  type: 'physio', source: 'finger_ppg', transport: 'hub_http', simulated: false, pulse_bpm: 72, contact: true,
  finger_bpm: [71, 73], breathing_per_min: 6, rmssd_ms: 46, presence: 'active', age_s: 0.4, ...o,
});
const start = A => A.startSession({ clock: 'morning', input: 'touch', stage: true, profile: 'live' });
const finish = (A, s) => { let doc = null; A.bus.on('sessionEnd', d => { doc = d; }); s.finish('partial'); return plain(doc); };

// The Settings rows are built by gui/shell.js; without a page it only defines them.
const settings = () => {
  const ctx = { console, URLSearchParams, setTimeout: () => 0, clearTimeout: () => {}, location: { search: '' }, navigator: {},
    document: { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], addEventListener: () => {} } };
  ctx.window = ctx;
  vm.createContext(ctx);
  for (const f of ['util.js', 'gui/lantern.js', 'gui/shell.js']) vm.runInContext(read(JS, f), ctx, { filename: f });
  return plain(ctx.A.Shell.groups);
};

// Text a person can read: string literals of a script, or the text of a page.
const literals = js => (js.match(/'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`|"(?:[^"\\\n]|\\.)*"/g) || []).join('\n');
const pageText = html => html.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<[^>]*>/g, ' ');
const CLAIMS = [
  [/presence sensor/i, 'a presence sensor'], [/bed presence/i, 'bed presence'], [/time in bed/i, 'time in bed'],
  [/\blamps?\b/i, 'a lamp'], [/(lights?|wakes?|fills?) (up )?(the|your) room|room (wakes|lights up)/i, 'a lit room'], [/light therapy/i, 'light therapy'],
];
const claims = text => {
  const t = text.replace(/no bed sensor/gi, '');
  return [...CLAIMS, [/bed sensor/i, 'a bed sensor']].filter(([re]) => re.test(t)).map(([, name]) => name);
};

const tests = {
  'a: bed presence has no sensor: off by default, and nothing saved or sent by the hub turns it on'() {
    const { A } = load();
    assert.deepStrictEqual(plain(A.switches()), { phone_camera: true, pulse_stone: true, bedside_camera: false, bedside_light: true, presence: false, phone_motion: false });
    assert.strictEqual(A.switches({ presence: true }).presence, false, 'a saved "on" does not come back');
    assert.deepStrictEqual(plain(A.switches({ presence: true, phone_camera: false }, { presence: true, bedside_light: false, phone_presence: false })),
      { phone_camera: false, pulse_stone: true, bedside_camera: false, bedside_light: false, presence: false, phone_motion: false, phone_presence: false },
      'the other switches and the hub\'s phone_presence veto pass through');

    const main = read(JS, 'main.js');
    assert.ok(main.includes('sensors: A.switches(saved.sensors),'), 'main.js does not build its defaults with A.switches');
    assert.ok(main.includes('A.switches(A.config.sensors, pv.sensors)'), 'main.js does not filter the hub privacy object with A.switches');
    assert.strictEqual(/presence:\s*true/.test(main), false);
  },

  'b: a session records the bed presence switch as off'() {
    const { A, tick } = load();
    A.config.sensors = A.switches({ presence: true });
    const s = start(A);
    run(A, tick, s, 2);
    assert.strictEqual(finish(A, s).sensors.presence, false);
  },

  'c: the session records a bedside light level only when one was sent to the hub'() {
    const level = (on, hub) => {
      const { A, tick } = load();
      A.config.sensors.bedside_light = on;
      if (hub) A.Hub = { connected: true };
      const s = start(A);
      run(A, tick, s, 2);
      s.light('#FFC98A', 15, 0, 'mode');
      return finish(A, s).context.bedside_light_level;
    };
    assert.deepStrictEqual([level(false, false), level(true, false), level(false, true), level(true, true)], [null, null, null, 15]);
  },

  'd: Settings has no bed presence row and says what the light and the pulse stone are'() {
    const groups = settings(), sensors = groups.find(g => g.title === 'Sensors');
    const id = r => /data-sensor="(\w+)"/.exec(r.sw)?.[1];
    assert.deepStrictEqual(sensors.rows.map(id), ['phone_camera', 'pulse_stone', 'bedside_light', 'bedside_camera', 'phone_motion']);
    const by = Object.fromEntries(sensors.rows.map(r => [id(r), r]));
    assert.deepStrictEqual([by.pulse_stone.label, by.pulse_stone.sup], ['Pulse stone', 'Two finger clips']);
    assert.deepStrictEqual([by.bedside_light.label, by.bedside_light.sup], ['Bedside light', 'One small LED on the bedside unit, set through the home hub']);
    const dim = groups.flatMap(g => g.rows).find(r => r.sw === 'id="quietSw"');
    assert.strictEqual(dim.sup, 'At night: dimmer colours, bedside LED at most 25%');
    const page = read(DEMO, 'index.html');
    assert.strictEqual(page.includes('data-sensor="presence"'), false);
  },

  'e: the finger sensor text tells the patient there are two clips'() {
    const { A } = load({ vitals: true }), S = A.Sensors, V = A.Vitals;
    S.setFingerLink('connected', 'Afferent Finger');
    assert.deepStrictEqual(plain(V.sensorLines(S.livePhysio(A.now()))), ['Connected. Place a finger in each of the two clips to start.']);
    S.feedFingerBle({ kind: 'aff1', finger_bpm: [0, 0], breathing_per_min: 0, rmssd_ms: 0, quality: null, presence: 'idle', payload_len: 6, t_ms: Date.now() });
    assert.deepStrictEqual(plain(V.sensorLines(S.livePhysio(A.now()))), ['Resting. Place a finger in each of the two clips to start.']);
    assert.strictEqual(/\b(hold|touch|rest on) the stone\b/i.test(literals(read(JS, 'vitals.js'))), false);
  },

  'f: the saved patient view and the contract fixture: no bed sensor row, one small LED, sleep labelled simulated'() {
    const saved = JSON.parse(read(DEMO, 'data', 'patient_view_anna.json')), fixture = JSON.parse(read(ROOT, 'contracts', 'fixtures', 'patient_view_anna.json'));
    assert.deepStrictEqual(saved.privacy, fixture.privacy);
    assert.deepStrictEqual(saved.clinic_sees, fixture.clinic_sees);
    const rows = saved.privacy.sensors, by = Object.fromEntries(rows.map(s => [s.id, s]));
    assert.deepStrictEqual(rows.map(s => s.id), ['phone_camera', 'pulse_stone', 'bedside_camera', 'bedside_light', 'phone_presence', 'phone_motion']);
    assert.strictEqual(by.bedside_light.shares, 'Nothing. It is one small LED on the bedside unit and only receives colours.');
    assert.deepStrictEqual([by.pulse_stone.label, /finger sensor/.test(by.pulse_stone.shares)], ['Pulse stone', true]);
    assert.ok(saved.clinic_sees.includes('Sleep and rest pattern, simulated in this demo (there is no bed sensor)'));
    for (const text of [...rows.flatMap(s => [s.label, s.shares]), ...saved.clinic_sees]) assert.deepStrictEqual(claims(text), [], text);
  },

  'g: sweep: no text in the app claims a bed sensor, a presence sensor, a lamp or a lit room'() {
    const scripts = ['main.js', 'gui/shell.js', 'vitals.js', 'patient.js', 'onboard.js', 'presence.js', 'checkin.js', 'remind.js', 'streak.js', 'finger.js'];
    for (const f of scripts) assert.deepStrictEqual(claims(literals(read(JS, f))), [], f);
    for (const f of ['index.html', 'patient.html']) assert.deepStrictEqual(claims(pageText(read(DEMO, f))), [], f);
    assert.deepStrictEqual(claims(read(DEMO, 'data', 'reminders.json')), [], 'reminders.json');
    assert.deepStrictEqual(claims('Bedside light'), []);
    assert.deepStrictEqual(claims('Time in bed and restless moments.'), ['time in bed'], 'the sweep itself finds the old row');
    assert.deepStrictEqual(claims('Sleep and rest pattern from the bed sensor'), ['a bed sensor']);

    const plist = read(ROOT, 'ios', 'App', 'App', 'Info.plist');
    assert.ok(plist.includes('Afferent talks to your Afferent hub on your home network.'), 'the network text names the hub (Decisions I28)');
    assert.strictEqual(plist.includes('bedside unit on your home network'), false, 'the bedside unit is reached over Bluetooth, not the network');
    assert.strictEqual(plist.includes('only whether your eyes are closed'), false, 'the camera also gives blinks, head tilt and brightness');
  },

  'h: missing quality stays missing: a pulse without one is shown and recorded, never given a number, never used by the game'() {
    const { A } = load(), S = A.Sensors;
    S.enabled.simulator = false;
    assert.deepStrictEqual(plain(S.pulse(A.now())), { bpm: null, quality: null, source: null }, 'no reading has no quality');

    S.feedNativePulse({ bpm: 80 });
    assert.strictEqual(S.rppg.quality, null, 'camera pulse without a quality');
    assert.strictEqual(S.pulse(A.now()).bpm, null);

    S.feedFingerHub(hubFrame());
    assert.deepStrictEqual([S.fingerHub.quality, S.fingerHub.quality_reported], [null, false]);
    assert.deepStrictEqual([S.stone.bpm, S.stone.quality, S.stone.source], [72, null, 'finger_ppg']);
    assert.strictEqual(S.pulse(A.now()).bpm, null, 'the game does not use a pulse of unknown quality');
    const f = plain(S.fingerFrame(A.now()));
    assert.deepStrictEqual([f.source, f.pulse_bpm, f.quality, f.quality_reported], ['finger_ppg', 72, null, false]);

    const ble = load().A.Sensors;
    ble.enabled.simulator = false;
    ble.setFingerLink('connected', 'Afferent Finger');
    ble.feedFingerBle({ kind: 'hrm', bpm: 72, t_ms: Date.now() });
    assert.deepStrictEqual([ble.stone.bpm, ble.stone.quality, ble.stone.source], [72, null, 'finger_ppg'], 'a 2A37 pulse before any AFF1');
    ble.feedFingerBle({ kind: 'aff1', finger_bpm: [71, 73], breathing_per_min: 6, rmssd_ms: 46, quality: null, presence: null, payload_len: 4, t_ms: Date.now() });
    assert.deepStrictEqual([ble.stone.quality, ble.fingerBle.quality, ble.fingerBle.quality_reported], [null, null, false], 'a 4-byte AFF1 carries no quality');
    assert.strictEqual(ble.pulse(0).bpm, null);
  },

  'i: missing quality stays missing in the session document'() {
    const { A, tick } = load(), S = A.Sensors;
    S.enabled.simulator = false;
    S.feedFingerHub(hubFrame());
    const s = start(A);
    run(A, tick, s, 8, null, () => S.feedFingerHub(hubFrame()));
    const doc = finish(A, s), finger = doc.vitals.finger;
    assert.deepStrictEqual([finger.source, finger.quality_reported, finger.pulse_bpm.mean], ['finger_ppg', false, 72]);
    assert.deepStrictEqual(finger.quality, { mean: null, min: null, max: null, first: null, last: null, samples: 0 });
    assert.deepStrictEqual([doc.signal.pulse_source, doc.signal.pulse_quality_mean, doc.vitals.pulse_source], [null, null, null], 'the game used no pulse');
    assert.ok(!doc.simulated_fields.some(x => /pulse|vitals/.test(x)), doc.simulated_fields.join());
  },

  'j: the camera gives no quality figure, so an eye frame carries none'() {
    const { A } = load(), S = A.Sensors;
    S.source = 'arkit';
    S.native = { blink_l: 0.1, blink_r: 0.1, openness: 0.9, tracked: true, pitch_deg: -5, ambient: 0.3 }; S.nativeAt = A.now();
    const frame = plain(S.read(A.now(), 0.05));
    assert.deepStrictEqual([frame.tracked, frame.eye_openness, frame.quality], [true, 0.9, null]);
    S.native = null;
    assert.strictEqual(S.read(A.now(), 0.05).quality, null);
  },

  'k: no script on the sensor path gives a missing quality a default number or forces a sensor name'() {
    for (const f of ['sensors.js', 'finger.js', 'record.js', 'engine.js', 'vitals.js']) {
      const js = read(JS, f);
      assert.strictEqual(/quality\s*(\?\?|\|\|)\s*[\d.]/.test(js), false, `${f} gives a missing quality a number`);
      assert.strictEqual(/source\s*[:=]\s*'ky039'/.test(js), false, `${f} forces the source to ky039`);
    }
    const sensors = read(JS, 'sensors.js'), simEnd = sensors.indexOf('Sim.reset();');
    assert.ok(simEnd > 0, 'the simulator object was not found');
    for (const m of sensors.matchAll(/quality: (\d[\d.]*)/g)) {
      const line = sensors.slice(sensors.lastIndexOf('\n', m.index) + 1, sensors.indexOf('\n', m.index));
      assert.ok(m.index < simEnd || line.includes('Sim.pulse('), `a fixed quality ${m[1]} outside the simulator: ${line.trim()}`);
    }
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
