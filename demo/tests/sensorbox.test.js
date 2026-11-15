// Run: node demo/tests/sensorbox.test.js
// The sensor box switch (Settings, Sensors: "Sensor box"): one switch for everything the UNO Q box gives, the finger
// clips, the room thermometer, the bedside light and its knob. On by default and kept on this phone; off, the app runs
// without the box: no Bluetooth for it, no clip check or its offer, no Heart Duel, no room rows, no light messages to the
// hub; on again, everything as before without a restart. main.js's own lines for the switch are cut out of main.js and
// run here on the harness (as settings.test.js does). All numbers are test inputs, not measurements.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
const { load, run, plain, JS } = require('./harness');
const { makeDocument } = require('./fakedom');

const read = f => fs.readFileSync(path.join(JS, f), 'utf8');
const MAIN = read('main.js');
const flush = () => new Promise(r => setImmediate(r));
const go = (env, f) => vm.runInContext(read(f), env.ctx, { filename: f });
const start = A => A.startSession({ clock: 'morning', input: 'touch', stage: true, profile: 'live' });
const finish = (A, s) => { let doc = null; A.bus.on('sessionEnd', d => { doc = d; }); s.finish('partial'); return plain(doc); };
const cut = (re, what) => { const m = MAIN.match(re); assert.ok(m, `main.js: ${what}`); return m[0]; };

// main.js as it handles the sensor switches: syncSensors, saveSettings, boxShown and the [data-sensor] change handler,
// on switches that start as A.config says (toggles). set(name, on) is the patient's tap. Saved settings land in `storage`.
const SENSOR_CODE = [
  cut(/\n  const syncSensors = .*\n/, 'syncSensors'),
  cut(/\n  const saveSettings = .*\n/, 'saveSettings'),
  cut(/\n  const boxShown = .*\n/, 'boxShown'),
  cut(/\n  document\.querySelectorAll\('\[data-sensor\]'\)\.forEach\(el => el\.onchange = \(\) => \{[\s\S]*?\n  \}\);\n/, 'the switch handler'),
].join('');
const wire = (env, storage = new Map()) => {
  const { A, ctx } = env, sent = [];
  A.bus.on('ws', m => sent.push(m));
  const els = ['phone_camera', 'sensor_box', 'pulse_stone', 'bedside_light'].map(k => ({ dataset: { sensor: k }, checked: !!A.config.sensors[k] }));
  const root = { dataset: {} }, doc = { documentElement: root, querySelectorAll: s => (s === '[data-sensor]' ? els : []) };
  Object.assign(ctx, {
    __doc: doc, ui: { input: 'touch', sound: true }, chips() {}, camGlyph() {}, syncCamPulse() {},
    store: { set: (k, v) => storage.set(k, JSON.stringify(v)) },
  });
  vm.runInContext(`((document) => { const S = A.Sensors; ${SENSOR_CODE} syncSensors(); boxShown(); })(__doc)`, ctx, { filename: 'main.js (cut)' });
  const el = k => els.find(e => e.dataset.sensor === k);
  return { sent, root, storage, el, set: async (k, on) => { el(k).checked = on; el(k).onchange(); await flush(); } };
};
// A first launch with these saved switches, as main.js builds A.config.sensors from them.
const launch = (env, saved) => { env.A.config.sensors = env.A.switches(saved); return env; };

const room = (o = {}) => ({ type: 'room', temp_c: 21.5, humidity_pct: 40, source: 'modulino_thermo', simulated: false, age_s: 0, ...o });
const hubFrame = (o = {}) => ({ type: 'physio', source: 'finger_ppg', transport: 'hub_http', simulated: false, pulse_bpm: 72, quality: 0.8, quality_reported: true,
  contact: true, finger_bpm: [71, 73], breathing_per_min: 6, rmssd_ms: 46, presence: 'active', age_s: 0.4, ...o });
const ble = S => { S.feedFingerBle({ kind: 'hrm', bpm: 72, t_ms: Date.now() }); S.feedFingerBle({ kind: 'aff1', finger_bpm: [71, 73], breathing_per_min: 6, rmssd_ms: 46, quality: 0.8, presence: 'active', payload_len: 7, t_ms: Date.now() }); };

const tests = {
  async 'a: the switch is on by default, saved with the other sensor switches, kept through the hub privacy, and never sent to the hub'() {
    const env = launch(load({ finger: true }), undefined), { A } = env;
    assert.strictEqual(A.config.sensors.sensor_box, true, 'on by default: today\'s app');
    assert.deepStrictEqual([A.boxOn(), A.sensorOn('pulse_stone'), A.sensorOn('bedside_light'), A.sensorOn('phone_camera')], [true, true, true, true]);
    const w = wire(env);
    assert.strictEqual(w.root.dataset.sensorBox, 'on');

    await w.set('sensor_box', false);
    const saved = JSON.parse(w.storage.get('afferent.settings'));
    assert.strictEqual(saved.sensors.sensor_box, false, 'saved under afferent.settings, sensors');
    assert.deepStrictEqual([saved.sensors.pulse_stone, saved.sensors.bedside_light], [true, true], 'the clips\' and the light\'s own switches keep their state');
    assert.deepStrictEqual([A.boxOn(), A.sensorOn('pulse_stone'), A.sensorOn('bedside_light'), A.sensorOn('phone_camera')], [false, false, false, true]);
    assert.strictEqual(A.Sensors.enabled.pulse_stone, false, 'the sensors see the clips as off');
    assert.strictEqual(w.root.dataset.sensorBox, 'off', 'the rows that need the box are hidden (css/gui/shell.css)');
    assert.deepStrictEqual(w.sent, [], 'a phone-only switch: no privacy message the hub would not know');

    const next = launch(load(), saved.sensors).A;
    assert.strictEqual(next.boxOn(), false, 'the next launch starts with the box off');
    next.config.sensors = next.switches(next.config.sensors, { phone_camera: true, pulse_stone: true, bedside_light: true, bedside_camera: false });
    assert.strictEqual(next.boxOn(), false, 'a privacy message from the hub leaves it alone');
    assert.ok(MAIN.includes('sensors: A.switches(saved.sensors),') && /store\.set\('afferent\.settings', \{ sensors: A\.config\.sensors,/.test(MAIN), 'main.js loads and saves it with the others');

    await w.set('pulse_stone', false);
    assert.deepStrictEqual(plain(w.sent), [{ type: 'privacy', patient_id: 'test', sensor: 'pulse_stone', on: false }], 'the other switches still tell the hub');

    const shell = read('gui/shell.js');
    assert.ok(/\{ icon: 'sensors', label: 'Sensor box', sup: 'Finger clips, room, bedside light', sw: 'data-sensor="sensor_box"' \},/.test(shell), 'the row in Settings, Sensors');
  },

  async 'b: off, the finger clips get no Bluetooth: not at launch, not from Settings or a session, and a running link stops'() {
    const storage = new Map();
    let env = launch(load({ finger: true, storage }), { sensor_box: false });
    let { A, plugin } = env, w = wire(env, storage);
    await A.Finger.arm();                          // Settings or Your signals opened, a session begins
    await A.Finger.sync();                         // launch, a privacy message from the hub
    assert.deepStrictEqual([plugin.starts, plugin.count('state'), plugin.count('reading'), A.Sensors.fingerLink.state], [0, 0, 0, 'off']);

    await w.set('sensor_box', true);
    assert.deepStrictEqual([plugin.starts, plugin.running, A.Sensors.fingerLink.state], [1, true, 'scanning'], 'on again: the clips start without a restart');
    plugin.emit('state', { state: 'connected', name: 'Afferent Finger' });
    ble(A.Sensors);
    assert.strictEqual(A.Sensors.fingerFrame(A.now()).pulse_bpm, 72);

    await w.set('sensor_box', false);
    assert.deepStrictEqual([plugin.stops, plugin.running, plugin.count('reading'), A.Sensors.fingerLink.state], [1, false, 0, 'off'], 'switched off: the link stops at once');
    ble(A.Sensors);
    A.Sensors.feedFingerHub(hubFrame());
    assert.deepStrictEqual([A.Sensors.fingerFrame(A.now()), A.Sensors.fingerAttached(A.now())], [null, false], 'nothing from the clips counts, from the phone or the hub');
    await A.Finger.arm();
    assert.strictEqual(plugin.starts, 1, 'and nothing starts it again while it is off');

    env = launch(load({ finger: true, storage }), { sensor_box: false }); ({ A, plugin } = env);
    assert.strictEqual(A.Finger.armed, true, 'a later launch, the patient asked before');
    await A.Finger.sync();
    assert.strictEqual(plugin.starts, 0, 'launched with the box off: no scan');
  },

  async 'c: off, no clip check and no first-run offer; kindling goes straight on, and both come back with the box'() {
    const page = box => {
      const env = launch(load({ finger: true, camera: true, storage: new Map() }), { sensor_box: box });
      Object.assign(env.ctx, { document: makeDocument(), clearInterval() {}, clearTimeout() {}, Event: class { constructor(type) { this.type = type; } } });
      go(env, 'clipcheck.js');
      return { ...env, w: wire(env), doc: env.ctx.document, C: env.A.ClipCheck };
    };
    const hidden = doc => doc.getElementById('clipcheck').classList.contains('hidden');
    let p = page(false), went = 0;
    assert.strictEqual(p.C.offer(), false, 'no "Try the finger clips?"');
    assert.deepStrictEqual([p.doc.getElementById('clipOffer'), p.C.store.get().offered_ms], [null, undefined], 'and it is not used up');
    assert.strictEqual(p.C.wouldAsk(p.A.now()), false);
    assert.strictEqual(p.C.beforeSession(() => went++), false);
    assert.deepStrictEqual([went, hidden(p.doc)], [1, true], 'the session begins at once');
    p.C.open('settings');
    assert.strictEqual(hidden(p.doc), true, 'not even from a stray Settings tap');
    await flush();
    assert.strictEqual(p.plugin.starts, 0, 'and no Bluetooth');

    await p.w.set('sensor_box', true);
    assert.strictEqual(p.C.offer(), true, 'on again: offered as today');
    assert.strictEqual(p.doc.getElementById('clipOffer').getAttribute('data-needs-box'), '', 'hidden if the box goes off before it is answered');
    assert.strictEqual(p.C.beforeSession(() => went++), true, 'the clips give no pulse yet: asked first, as today');
    assert.deepStrictEqual([went, hidden(p.doc)], [1, false]);

    p = page(true);
    assert.strictEqual(p.C.offer(), true, 'on by default: the offer as today');
    await p.w.set('sensor_box', false);
    assert.strictEqual(p.w.root.dataset.sensorBox, 'off');
    assert.ok(/\[data-sensor-box="off"\] \[data-needs-box\] \{ display: none !important; \}/.test(fs.readFileSync(path.join(JS, '..', 'css', 'gui', 'shell.css'), 'utf8')),
      'shell.css hides what needs the box');
  },

  async 'd: off, Heart Duel is not offered, and Settings hides what only works with the box'() {
    const env = launch(load({ finger: true }), undefined);
    go(env, 'heartduel-game.js'); go(env, 'duel-core.js');
    const { A } = env, D = A.DuelCore, w = wire(env);
    assert.strictEqual(D.allowed(), true);
    await w.set('sensor_box', false);
    assert.strictEqual(D.allowed(), false, 'the duel is the two clips');
    await w.set('sensor_box', true);
    assert.strictEqual(D.allowed(), true);
    assert.ok(read('duel.js').includes("'Heart Duel needs the sensor box, switched off in Settings'"), 'said if it is reached anyway');

    const ctx = { console, URLSearchParams, setTimeout: () => 0, clearTimeout: () => {}, location: { search: '' }, navigator: {},
      document: { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], addEventListener: () => {} } };
    ctx.window = ctx;
    vm.createContext(ctx);
    for (const f of ['util.js', 'gui/lantern.js', 'gui/shell.js']) vm.runInContext(read(f), ctx, { filename: f });
    const { top, pages } = ctx.A.Shell.settings.html();
    // the opening tag of the row an attribute is in (a switch sits in its row's label), and of the group around it
    const open = (html, from) => html.slice(from, html.indexOf('>', from) + 1);
    const needs = (html, attr) => {
      const at = html.indexOf(attr);
      assert.ok(at >= 0, attr);
      const li = html.lastIndexOf('<', html.lastIndexOf('class="li ', at)), sec = html.lastIndexOf('<section class="set-group"', at);
      return /data-needs-box/.test(open(html, li)) || /data-needs-box/.test(open(html, sec));
    };
    for (const a of ['data-sensor="pulse_stone"', 'data-sensor="bedside_light"', 'id="clipCheckRow"', 'id="clipAskSw"', 'data-duel']) assert.ok(needs(pages, a), `${a} needs the box`);
    for (const a of ['data-sensor="sensor_box"', 'data-sensor="phone_camera"', 'id="lightSw"', 'id="breathSw"', 'id="vitalsSw"', 'data-sensor="bedside_camera"']) assert.ok(!needs(pages, a), `${a} stays`);
    assert.ok(/data-page="session" data-needs-box/.test(top), 'the Sessions category, all clips, goes too');
    assert.ok(!/data-page="sensors" data-needs-box/.test(top));
  },

  'e: off, no room climate anywhere: no rows, no "no reading" line, no night hint, nothing in the session'() {
    const env = launch(load({ vitals: true }), undefined);
    go(env, 'hub.js'); go(env, 'room.js'); go(env, 'livevitals.js');
    const { A, tick } = env, S = A.Sensors, R = A.Room, w = wire(env);
    const play = { done: false, phase: 'game', transitions: [] };
    A.Hub.connected = true; A.night = () => true;
    assert.deepStrictEqual(plain(R.rows(A.now())).map(r => r.lines[0]), ['No reading from the bedside unit right now'], 'on: today\'s line');
    A.Hub.emit('room', room({ temp_c: 22 }));
    assert.deepStrictEqual([R.rows(A.now())[0].value, A.Vitals.model(A.now()).room.title, A.LiveVitals.model(play, A.now()).room, !!R.hint(A.now())],
      ['22.0', 'Your room', 'Room 22.0 °C · 40 %', true]);
    const sensorRow = () => A.Vitals.model(A.now()).rows.map(r => r.label).includes('Sensor');
    assert.strictEqual(sensorRow(), true, 'on: the finger sensor row in Your signals');

    return w.set('sensor_box', false).then(() => {
      assert.deepStrictEqual([plain(R.rows(A.now())), A.Vitals.model(A.now()).room, S.room(A.now()), S.roomFrame(A.now()), A.LiveVitals.model(play, A.now()).room, R.hint(A.now())],
        [[], null, null, null, null, null], 'the reading from before is gone too');
      A.Hub.emit('room', room());
      A.Hub.connected = false; assert.deepStrictEqual(plain(R.rows(A.now())), []);
      A.Hub.connected = true; assert.deepStrictEqual(plain(R.rows(A.now())), [], 'a hub still sending changes nothing');
      assert.strictEqual(sensorRow(), false, 'no finger sensor row');
      assert.ok(!A.Vitals.model(A.now()).rows.some(r => /finger/i.test(r.label + r.lines.join(' '))), 'no clip rows at all');
      const s = start(A);
      run(A, tick, s, 2);
      assert.strictEqual(finish(A, s).context.room_temp_c, null);
      return w.set('sensor_box', true);
    }).then(() => {
      A.Hub.emit('room', room({ temp_c: 20 }));
      assert.strictEqual(R.rows(A.now())[0].value, '20.0', 'on again: the room is back');
    });
  },

  async 'f: off, no bedside light, knob or clip messages; sessions and everything else the hub needs still go'() {
    const lights = async box => {
      const env = launch(load(), undefined), { A, tick } = env, w = wire(env);
      if (!box) await w.set('sensor_box', false);
      A.Hub = { connected: true };
      const s = start(A);
      run(A, tick, s, 2);
      s.light('#FFC98A', 15, 0, 'mode');
      const local = [];
      A.bus.on('light', d => local.push(d));
      s.light('#FFD9A0', 20, 0, 'mode');
      const doc = finish(A, s);
      return { types: [...new Set(w.sent.map(m => m.type))], level: doc.context.bedside_light_level, local: local.length };
    };
    const on = await lights(true), off = await lights(false);
    assert.ok(on.types.includes('light') && on.level === 20, `on: the light goes to the hub as today (${on.types})`);
    assert.ok(!off.types.includes('light'), `off: no light message (${off.types})`);
    assert.strictEqual(off.level, null, 'and no light level in the session');
    assert.ok(off.types.includes('session_end') && off.types.includes('mode'), 'the session still reaches the hub');
    assert.deepStrictEqual([on.local, off.local], [1, 1], 'the developer panel\'s own LED preview stays');

    // the knob on the box: main.js's handler, cut out and given a hub
    const handlers = {}, dawn = [];
    const knob = cut(/\n  Hub\.on\('knob', .*\n/, 'the knob handler');
    const ctx = { A: { boxOn: () => true }, Hub: { on: (t, f) => { handlers[t] = f; } }, setDawn: v => dawn.push(v), log() {} };
    vm.runInNewContext(knob, ctx);
    handlers.knob({ level: 30 });
    ctx.A.boxOn = () => false;
    handlers.knob({ level: 50, press: true });
    assert.deepStrictEqual(dawn, [30], 'a knob message is ignored with the box off');
  },

  async 'g: off, nothing waits for the clips: the session runs on the other sources, a simulated pulse labelled as such'() {
    const env = launch(load({ finger: true }), { sensor_box: false }), { A, tick } = env, S = A.Sensors;
    A.config.simulator = true;
    const w = wire(env);
    await A.Finger.arm();
    A.Sensors.feedFingerHub(hubFrame());
    let s = start(A);
    assert.strictEqual(S.pulseMode, 'simulated', 'a hub still relaying clips is no producer');
    run(A, tick, s, 3);
    assert.strictEqual(S.pulse(A.now()).source, 'simulated');
    let doc = finish(A, s);
    assert.strictEqual(doc.signal.pulse_source, 'simulated');
    assert.ok(doc.simulated_fields.includes('signal.pulse_source'), 'labelled simulated in the record');
    assert.strictEqual(doc.sensors.sensor_box, false, 'the record says the box was off');

    S.enabled.simulator = false;
    s = start(A);
    assert.strictEqual(S.pulseMode, 'real');
    run(A, tick, s, 3);
    assert.deepStrictEqual(plain(S.pulse(A.now())), { bpm: null, quality: null, source: null }, 'no simulator: no pulse, never a made-up one');
    doc = finish(A, s);
    assert.strictEqual(doc.status, 'partial');

    await w.set('sensor_box', true);
    env.plugin.emit('state', { state: 'connected', name: 'Afferent Finger' });
    ble(S);
    s = start(A);
    assert.strictEqual(S.pulseMode, 'real', 'on again: the clips lead as today');
    run(A, tick, s, 2, null, () => ble(S));
    assert.strictEqual(S.pulse(A.now()).source, 'finger_ppg');
    finish(A, s);
  },
};

(async () => {
  let failed = 0;
  for (const [name, fn] of Object.entries(tests)) {
    try { await fn(); console.log('ok  ', name); } catch (e) { failed++; console.log('FAIL', name, '\n     ', e.message.slice(0, 900)); }
  }
  console.log(`${Object.keys(tests).length - failed} ok, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
