// Run: node demo/tests/presence-app.test.js
// The app side of Home and visitors (demo/js/presence.js) against a fake AfferentPresence
// native plugin that returns drain() batches in the same shape as AfferentPresence.swift.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const JS = path.join(__dirname, '..', 'js');
const T0 = Date.UTC(2026, 10, 14, 9, 0, 0) / 1000;

// bridge: 'core' = @capacitor/core is loaded (registerPlugin exists); 'ios' = the bridge the app really
// has (plain scripts, no @capacitor/core): no registerPlugin, plugins at Capacitor.Plugins; 'none' = native
// build without the plugin.
function load({ native = true, search = '', savedSettings = null, bridge = 'core' } = {}) {
  let clock = T0;
  const timers = [];
  const storage = new Map();
  if (savedSettings) storage.set('afferent.presence', JSON.stringify(savedSettings));
  const docListeners = {}, winListeners = {};
  const calls = [];
  const radio = { devices: [], status: { bluetooth: 'poweredOn', authorization: 'allowedAlways', scanning: true, wifi: true, lan: 'ready', lanDevices: [] } };
  const plugin = {
    start: async opts => { calls.push(['start', opts]); return radio.status; },
    stop: async () => { calls.push(['stop']); },
    drain: async () => { calls.push(['drain']); if (radio.fail) throw new Error('radio failed'); const devices = radio.devices.map(d => ({ ...d, first: clock - 5, last: clock })); return { devices, status: radio.status, dropped: 0 }; },
  };
  class FakeDate extends Date {
    constructor(...a) { super(...(a.length ? a : [clock * 1000])); }
    static now() { return clock * 1000; }
  }
  const ctx = {
    console, Math, JSON, Set, Map, Object, Array, Number, String, Promise, URL, URLSearchParams, Date: FakeDate,
    setTimeout: (fn, ms = 0) => { timers.push({ fn, due: clock + ms / 1000 }); return timers.length; },
    clearTimeout: id => { if (timers[id - 1]) timers[id - 1].fn = null; },
    localStorage: { getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, String(v)), removeItem: k => storage.delete(k) },
    location: { search, protocol: 'capacitor:', pathname: '/' },
    navigator: {},
    document: { hidden: false, getElementById: () => null, addEventListener: (t, f) => (docListeners[t] = docListeners[t] || []).push(f) },
    addEventListener: (t, f) => (winListeners[t] = winListeners[t] || []).push(f),
    crypto: { randomUUID: () => 'x' },
  };
  if (native) {
    ctx.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'ios' };
    if (bridge === 'core') ctx.Capacitor.registerPlugin = () => plugin;
    else ctx.Capacitor.Plugins = bridge === 'ios' ? { AfferentPresence: plugin } : {};
  }
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(JS, 'util.js'), 'utf8'), ctx);
  vm.runInContext('A.config = { sensors: {} }; A.Hub = { connected: false, url: null, on() {} };', ctx);
  for (const f of ['presence-core.js', 'presence.js']) vm.runInContext(fs.readFileSync(path.join(JS, f), 'utf8'), ctx);
  // Run the next timer due, moving the clock to its due time (one radio interval per tick).
  const step = async () => {
    const live = timers.filter(x => x.fn);
    if (!live.length) return false;
    const t = live.reduce((a, b) => (b.due < a.due ? b : a));
    const fn = t.fn; t.fn = null;
    clock = Math.max(clock, t.due);
    await fn();
    return true;
  };
  const steps = async n => { for (let i = 0; i < n; i++) assert.ok(await step(), 'no timer scheduled'); };
  return {
    A: ctx.A, ctx, radio, calls, storage, steps,
    advance: s => { clock += s; },
    fire: (t, w = false) => ((w ? winListeners : docListeners)[t] || []).forEach(f => f()),
  };
}

const UNIT = { id: 'C0FFEE00-0000-4000-8000-000000000001', name: 'Afferent Finger', uuids: ['180D'], rssi: [-61, -60] };
const GUEST = { id: 'A1A1A1A1-0000-4000-8000-000000000002', name: null, uuids: [], mfg: '4c00100501', rssi: [-50, -51, -49] };

const tests = {
  async 'off by default: nothing runs, the session context is null'() {
    const t = load();
    assert.strictEqual(t.A.Presence.available, true);
    assert.strictEqual(t.A.Presence.on, false);
    assert.strictEqual(JSON.stringify(t.A.Presence.sessionContext()), '{"home":null,"visitors_present":null,"simulated":false}');
    assert.strictEqual(t.calls.length, 0);
  },

  async 'browser without the plugin: unavailable and never starts'() {
    const t = load({ native: false });
    assert.strictEqual(t.A.Presence.available, false);
    await t.A.Presence.enable();
    assert.strictEqual(t.A.Presence.on, false);
  },

  async 'iOS bridge without registerPlugin: the plugin is found at Capacitor.Plugins and starts'() {
    const t = load({ bridge: 'ios' });
    assert.strictEqual(t.A.Presence.available, true);
    t.radio.devices = [UNIT];
    await t.A.Presence.enable();
    assert.strictEqual(JSON.stringify(t.calls[0]), '["start",{"lan":true}]');
    await t.steps(1);
    assert.strictEqual(t.A.Presence.status().presence.state, 'home');
  },

  async 'native build without the plugin: unavailable, loads without an error and never starts'() {
    const t = load({ bridge: 'none' });
    assert.strictEqual(t.A.Presence.available, false);
    await t.A.Presence.enable();
    assert.strictEqual(t.A.Presence.on, false);
    assert.strictEqual(t.calls.length, 0);
  },

  async 'bedside unit in range -> home in the session; calibrated; a guest phone becomes 1 visitor'() {
    const t = load();
    t.radio.devices = [UNIT];
    await t.A.Presence.enable();
    assert.strictEqual(JSON.stringify(t.calls[0]), '["start",{"lan":true}]');
    await t.steps(1);
    let s = t.A.Presence.status();
    assert.strictEqual(s.presence.state, 'home', s.presence.reason);
    assert.strictEqual(s.presence.reason, 'seen: ble');
    assert.strictEqual(t.A.Presence.sessionContext().home, true);
    assert.strictEqual(t.A.Presence.sessionContext().visitors_present, null); // not calibrated
    // The unit itself is never a guest.
    assert.ok(!s.guests.nearby_devices.some(d => d.addr === UNIT.id.toLowerCase()));

    t.A.Presence.setProfile('demo');   // 5 min calibration, 2 min dwell
    t.A.Presence.calibrate();
    await t.steps(11);
    s = t.A.Presence.status();
    assert.strictEqual(s.guests.calibrating, false);
    assert.strictEqual(t.A.Presence.sessionContext().visitors_present, 0);

    t.radio.devices = [UNIT, GUEST];
    await t.steps(8);
    s = t.A.Presence.status();
    assert.strictEqual(s.guests.visits_today, 1, JSON.stringify(s.guests));
    assert.strictEqual(t.A.Presence.sessionContext().visitors_present, 1);
    assert.strictEqual(t.A.Presence.sessionContext().simulated, false);

    // Every tick is logged in the Jetson's ticks.jsonl shape.
    const rows = t.A.Presence.ticksJsonl().split('\n').map(l => JSON.parse(l));
    assert.ok(rows.length >= 20);
    assert.deepStrictEqual(Object.keys(rows[0]).sort(), ['ble_n', 'events', 'guests', 'sig', 'state', 't', 'truth']);
    assert.ok(rows.some(r => r.events.includes('guest_arrived')));
  },

  async 'unit and home Wi-Fi both gone while watching -> away after the threshold, home again when back'() {
    const t = load();
    t.radio.devices = [UNIT];
    t.radio.status = { ...t.radio.status, lanDevices: ['aa11', 'bb22', 'cc33'] };
    await t.A.Presence.enable();
    t.A.Presence.setProfile('demo'); // 2 min away limit
    await t.steps(1);
    t.A.Presence.rememberWifi();
    await t.steps(1);
    t.radio.devices = [];
    t.radio.status = { ...t.radio.status, lanDevices: [] };   // another Wi-Fi: the home devices do not answer
    await t.steps(10);
    assert.strictEqual(t.A.Presence.status().presence.state, 'away');
    assert.strictEqual(t.A.Presence.sessionContext().home, false);
    assert.strictEqual(t.A.Presence.status().text, 'Away');
    t.radio.devices = [UNIT];
    await t.steps(1);
    assert.strictEqual(t.A.Presence.status().presence.state, 'home');
    assert.ok(t.A.Presence.status().events.includes('returned_home'));
  },

  async 'silence from the bedside unit is could-not-look: never away, and after ten minutes not home either'() {
    const t = load();
    t.radio.devices = [UNIT];
    await t.A.Presence.enable();
    t.A.Presence.setProfile('demo'); // 2 min away limit
    await t.steps(2);
    t.radio.devices = [];            // e.g. another phone connected to the unit: it stops advertising
    await t.steps(24);               // 12 min with the app open
    const s = t.A.Presence.status();
    assert.strictEqual(s.presence.state, 'unknown', s.presence.reason);
    assert.strictEqual(JSON.stringify(t.A.Presence.sessionContext()), '{"home":null,"visitors_present":null,"simulated":false}');
    assert.strictEqual(s.text, 'Not sure yet');
    const rows = t.A.Presence.ticksJsonl().split('\n').map(l => JSON.parse(l));
    assert.ok(!rows.some(r => r.state === 'away' || r.events.includes('left_home')), 'no outing was written');
    assert.ok(rows.slice(-10).every(r => r.sig.ble === null), 'silence is logged as could-not-look');
  },

  async 'Bluetooth switched off for longer than the away limit: not away, the source could not look'() {
    const t = load();
    t.radio.devices = [UNIT];
    await t.A.Presence.enable();
    t.A.Presence.setProfile('demo');
    await t.steps(2);
    t.radio.devices = [];
    t.radio.status = { ...t.radio.status, bluetooth: 'poweredOff', scanning: false };
    await t.steps(10);
    assert.notStrictEqual(t.A.Presence.status().presence.state, 'away');
    assert.strictEqual(t.A.Presence.status().text, 'Bluetooth is off');
    const rows = t.A.Presence.ticksJsonl().split('\n').map(l => JSON.parse(l));
    assert.ok(rows.slice(-10).every(r => r.sig.ble === null));
  },

  async 'learning counts watched time only: a locked phone does not finish it'() {
    const t = load();
    t.radio.devices = [UNIT, GUEST];
    await t.A.Presence.enable();
    await t.steps(1);
    t.A.Presence.calibrate();          // home profile: 60 min = 120 watched ticks
    await t.steps(2);
    t.ctx.document.hidden = true;
    t.fire('visibilitychange');
    t.advance(3660);                   // locked for longer than the whole learning time
    t.ctx.document.hidden = false;
    t.fire('visibilitychange');
    await t.steps(1);
    let s = t.A.Presence.status();
    assert.strictEqual(s.guests.calibrating, true, 'three snapshots are not an hour of learning');
    assert.strictEqual(s.guests.household_devices, 0);
    assert.strictEqual(t.A.Presence.sessionContext().visitors_present, null);
    assert.ok(s.text.endsWith('· learning'), s.text);
    await t.steps(116);
    assert.strictEqual(t.A.Presence.status().guests.calibrating, true, '119 of 120');
    await t.steps(1);
    s = t.A.Presence.status();
    assert.strictEqual(s.guests.calibrating, false);
    assert.strictEqual(s.guests.household_devices, 1, 'the phone that was there the whole time is household');
  },

  async 'learning: ticks while Bluetooth cannot look are not counted'() {
    const t = load();
    t.radio.devices = [UNIT];
    await t.A.Presence.enable();
    t.A.Presence.setProfile('demo');   // 5 min = 10 watched ticks
    await t.steps(1);
    t.A.Presence.calibrate();
    const on = t.radio.status;
    t.radio.status = { ...on, bluetooth: 'poweredOff', scanning: false };
    await t.steps(14);
    assert.strictEqual(t.A.Presence.status().guests.calibrating, true);
    t.radio.status = on;
    await t.steps(9);
    assert.strictEqual(t.A.Presence.status().guests.calibrating, true);
    await t.steps(1);
    assert.strictEqual(t.A.Presence.status().guests.calibrating, false);
  },

  async 'not calibrated: watched longer than the dwell window, visitors stay unknown'() {
    const t = load();
    t.radio.devices = [UNIT];
    await t.A.Presence.enable();
    t.A.Presence.setProfile('demo');   // 2 min dwell
    await t.steps(8);
    assert.deepStrictEqual([t.A.Presence.sessionContext().home, t.A.Presence.sessionContext().visitors_present], [true, null]);
  },

  async 'a short look away (under 3 min) adds no absence; a radio that stops answering makes the context unknown'() {
    const t = load();
    t.radio.devices = [UNIT];
    t.radio.status = { ...t.radio.status, lanDevices: ['aa11', 'bb22'] };
    await t.A.Presence.enable();
    t.A.Presence.setProfile('demo');
    await t.steps(1);
    t.A.Presence.rememberWifi();
    await t.steps(1);
    t.radio.devices = [];
    t.radio.status = { ...t.radio.status, lanDevices: [] };
    await t.steps(2);
    const before = t.A.Presence.status().presence.absence_min;
    t.ctx.document.hidden = true;
    t.fire('visibilitychange');
    t.advance(170);
    t.ctx.document.hidden = false;
    t.fire('visibilitychange');
    await t.steps(1);
    assert.strictEqual(t.A.Presence.status().presence.absence_min, before, 'the hidden time was not watched');
    assert.strictEqual(t.A.Presence.sessionContext().home, true);

    t.radio.fail = true;               // visible, but drain() keeps failing: nothing new is known
    await t.steps(3);
    assert.strictEqual(t.A.Presence.sessionContext().home, null);
    assert.ok(t.A.Presence.status().text.startsWith('Not working'), t.A.Presence.status().text);
  },

  async 'reopened somewhere else: the status row does not show the old Home'() {
    const t = load();
    t.radio.devices = [UNIT];
    await t.A.Presence.enable();
    await t.steps(2);
    assert.strictEqual(t.A.Presence.status().text, 'Home · bedside unit nearby');
    t.ctx.document.hidden = true;
    t.fire('visibilitychange');
    t.advance(6 * 3600);
    t.radio.devices = [];
    t.ctx.document.hidden = false;
    t.fire('visibilitychange');
    assert.strictEqual(t.A.Presence.status().text, 'Not sure yet', 'before the first new look');
    await t.steps(3);
    const s = t.A.Presence.status();
    assert.strictEqual(s.presence.state, 'home', 'the tracker keeps its last decision');
    assert.strictEqual(s.text, 'Not sure yet', 'the patient is not told it as current');
  },

  async 'one home device is not enough to remember a Wi-Fi'() {
    const t = load(), toasts = [];
    t.A.Shell = { toast: m => toasts.push(m) };
    t.radio.status = { ...t.radio.status, lanDevices: ['aa11'] };
    await t.A.Presence.enable();
    await t.steps(1);
    t.A.Presence.rememberWifi();
    await t.steps(1);
    assert.strictEqual(JSON.parse(t.storage.get('afferent.presence')).wifiLearned.length, 0);
    assert.match(toasts.join('|'), /Two are needed/);
    assert.notStrictEqual(t.A.Presence.status().presence.state, 'home');
  },

  async 'app closed for an hour: not counted as absence, the old state is stale'() {
    const t = load();
    t.radio.devices = [UNIT];
    await t.A.Presence.enable();
    t.A.Presence.setProfile('demo');
    await t.steps(2);
    t.ctx.document.hidden = true;
    t.fire('visibilitychange');
    t.advance(3600);
    t.radio.devices = [];                     // reopened somewhere without the unit
    t.ctx.document.hidden = false;
    t.fire('visibilitychange');
    assert.strictEqual(t.A.Presence.sessionContext().home, null); // stale until a fresh tick
    await t.steps(1);
    const p = t.A.Presence.status().presence;
    assert.strictEqual(p.state, 'home');      // core.py: an unwatched gap is never an outing
    assert.strictEqual(p.absence_min, 0);     // the closed hour was not counted
    assert.strictEqual(t.A.Presence.sessionContext().home, null);
  },

  async 'finger plugin hook: a connected unit that stops advertising still counts as in range'() {
    const t = load();
    t.radio.devices = [UNIT];
    await t.A.Presence.enable();
    t.A.Presence.setProfile('demo');
    await t.steps(1);
    t.radio.devices = [];                       // connected: no more adverts
    for (let i = 0; i < 10; i++) { t.A.Presence.unitSeen(); await t.steps(1); }
    assert.strictEqual(t.A.Presence.status().presence.state, 'home');
    assert.strictEqual(t.A.Presence.status().presence.reason, 'seen: ble');
  },

  async 'finger sensor connected but silent (no finger on the clip, no adverts): the unit still counts as in range'() {
    const t = load();
    t.radio.devices = [UNIT];
    await t.A.Presence.enable();
    t.A.Presence.setProfile('demo');
    await t.steps(1);
    t.radio.devices = [];
    t.A.Sensors = { fingerLink: { state: 'connected', name: 'Afferent Finger' } };
    await t.steps(10);
    assert.strictEqual(t.A.Presence.status().presence.state, 'home');
    t.A.Sensors.fingerLink = { state: 'scanning', name: null };   // link lost and no advert: could not look
    await t.steps(10);
    assert.strictEqual(t.A.Presence.status().presence.state, 'home');
    await t.steps(15);
    assert.strictEqual(t.A.Presence.status().presence.state, 'unknown');
    assert.strictEqual(t.A.Presence.sessionContext().home, null);
  },

  async 'home Wi-Fi fingerprint: remembered devices visible -> home without the unit'() {
    const t = load();
    t.radio.status = { ...t.radio.status, lanDevices: ['aa11', 'bb22', 'cc33'] };
    await t.A.Presence.enable();
    await t.steps(1);
    t.A.Presence.rememberWifi();
    await t.steps(1);
    const s = t.A.Presence.status();
    assert.strictEqual(s.presence.state, 'home');
    assert.ok(s.presence.reason.includes('wifi'), s.presence.reason);
  },

  async 'hub privacy switch phone_presence=false stops the radios; it can never switch them on'() {
    const t = load();
    t.radio.devices = [UNIT];
    await t.A.Presence.enable();
    await t.steps(1);
    t.A.config.sensors.phone_presence = false;
    t.A.bus.emit('hubConfig', {});
    await t.steps(1);                          // the deferred sync
    await new Promise(r => setImmediate(r));
    assert.ok(t.calls.some(c => c[0] === 'stop'));
    assert.strictEqual(JSON.stringify(t.A.Presence.sessionContext()), '{"home":null,"visitors_present":null,"simulated":false}');

    const u = load();
    u.A.config.sensors.phone_presence = true; // the hub default
    u.A.bus.emit('hubConfig', {});
    await u.steps(1);
    assert.strictEqual(u.calls.length, 0);     // still off: only the patient's switch starts it
  },

  async 'turning it off forgets everything'() {
    const t = load();
    t.radio.devices = [UNIT];
    await t.A.Presence.enable();
    await t.steps(3);
    assert.ok(t.storage.has('afferent.presence'));
    await t.A.Presence.disable();
    assert.ok(!t.storage.has('afferent.presence') && !t.storage.has('afferent.presence.ticks'));
    assert.strictEqual(t.A.Presence.status().presence.state, 'unknown');
    assert.strictEqual(t.A.Presence.ticksJsonl(), '');
  },

  async 'simulator (?presence=sim in a browser) labels its values SIMULATED'() {
    const t = load({ native: false, search: '?presence=sim' });
    assert.strictEqual(t.A.Presence.available, true);
    await t.A.Presence.enable();
    await t.steps(1);
    const c = t.A.Presence.sessionContext();
    assert.strictEqual(c.home, true);
    assert.strictEqual(c.simulated, true);
  },

  async 'record.js puts the context into the session and marks simulated presence'() {
    const src = fs.readFileSync(path.join(JS, 'record.js'), 'utf8');
    assert.match(src, /home: pres\.home, visitors_present: pres\.visitors_present/);
    assert.match(src, /if \(pres\.simulated\) simFields\.push\('context\.home', 'context\.visitors_present'\)/);
  },
};

(async () => {
  let failed = 0;
  for (const [name, fn] of Object.entries(tests)) {
    try { await fn(); console.log('ok  ', name); } catch (e) { failed++; console.log('FAIL', name, '\n     ', e.message); }
  }
  console.log(`${Object.keys(tests).length - failed}/${Object.keys(tests).length} passed`);
  process.exit(failed ? 1 : 0);
})();
