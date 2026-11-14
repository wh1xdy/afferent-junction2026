// Run: node demo/tests/watch.test.js
// A watch or chest strap over the Bluetooth Heart Rate Service (hrv.js, sensors.js, watch.js) and Apple Watch through
// Apple Health (health.js): beat-to-beat intervals and RMSSD, quality, the source label, the finger box first,
// freshness, the device choice, the session record, and Health as context only. All numbers are test inputs.
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const vm = require('vm');
const { load, run, plain, JS } = require('./harness');

const hr = (o = {}) => ({ kind: 'hr', bpm: 64, contact: true, energy_kj: null, rr_ms: [], t_ms: Date.now(), ...o });
const hrm = (bpm = 72) => ({ kind: 'hrm', bpm, t_ms: Date.now() });
const aff6 = (o = {}) => ({ kind: 'aff1', finger_bpm: [71, 73], breathing_per_min: 6, rmssd_ms: 46, quality: 0.6, presence: 'active', payload_len: 6, t_ms: Date.now(), ...o });
const box = A => { A.Sensors.setFingerLink('connected', 'Afferent Finger'); A.Sensors.feedFingerBle(hrm()); A.Sensors.feedFingerBle(aff6()); };
const strap = (A, name = 'Polar H10 1A2B3C4D') => { A.Sensors.enabled.watch = true; A.Sensors.setWatchLink('connected', name); };
// One notification a second with one interval that alternates 1000 / 1040 ms: an RMSSD of exactly 40 ms.
const beats = i => [i % 2 ? 1040 : 1000];
const start = A => A.startSession({ clock: 'morning', input: 'touch', stage: true, profile: 'live' });
const finish = (A, s) => { let doc = null; A.bus.on('sessionEnd', d => { doc = d; }); s.finish('partial'); return plain(doc); };
const STAT0 = { mean: null, min: null, max: null, first: null, last: null, samples: 0 };

const tests = {
  // ── hrv.js: intervals, RMSSD, quality ─────────────────────────────────────────────────────────────────────────
  'hrv a: intervals outside 300 to 2000 ms, or more than 20 % from the median around them, are artifacts'() {
    const { A } = load(), H = A.HeartRate;
    assert.deepStrictEqual(plain(H.clean([1000, 1010, 250, 990, 1005, 2100, 1600, 1000, 995, 780])),
      [true, true, false, true, true, false, false, true, true, false]);
    assert.deepStrictEqual([299, 300, 2000, 2001].map(x => plain(H.clean([x, x, x]))[0]), [false, true, true, false], 'the limits themselves are allowed');
    // a pulse that climbs from 60 to 90 within the window: each interval is near its neighbours, none is an artifact
    const ramp = Array.from({ length: 40 }, (_, i) => Math.round(1000 - i * 8.5));
    assert.ok(H.clean(ramp).every(Boolean), 'a local median, not one median for the whole minute');
  },

  'hrv b: RMSSD over clean neighbours only, at least 20 differences over 30 s, never across a gap'() {
    const { A } = load(), H = A.HeartRate;
    const alt = n => Array.from({ length: n }, (_, i) => beats(i)[0]);
    assert.strictEqual(H.rmssd(alt(40)), 40);
    assert.strictEqual(H.rmssd(alt(20)), null, '19 differences over 20 s: not yet');
    const noisy = alt(40);
    noisy.splice(10, 0, 250); noisy.splice(25, 0, 1700);
    assert.strictEqual(H.rmssd(noisy), 40, 'an artifact and its two differences are left out, nothing is interpolated');
    // two runs of beats: the difference between the last of one and the first of the next is not taken
    const rrs = [...alt(20), ...alt(21).map(x => x + 400)], chains = rrs.map((_, i) => (i < 20 ? 0 : 1));
    assert.strictEqual(H.rmssd(rrs, chains), 40);
    assert.ok(H.rmssd(rrs) > 40, 'without the chains the jump between the runs would count');
  },

  'hrv c: quality from the contact bits and the share of clean intervals'() {
    const { A } = load(), H = A.HeartRate;
    assert.strictEqual(H.quality(false, 1), 0, 'no skin contact: nothing');
    assert.strictEqual(H.quality(true, null), 0.75, 'pulse only, with contact (a Garmin watch broadcasting)');
    assert.strictEqual(H.quality(null, null), 0.6, 'pulse only, contact not reported');
    assert.strictEqual(H.quality(true, 1), 1, 'clean intervals and contact (a chest strap)');
    assert.strictEqual(H.quality(null, 0.5), 0.4);
    assert.ok(H.quality(true, 0.25) < 0.3, 'mostly artifacts: below the 0.3 limit of the finger sensor');
  },

  // ── sensors.js: the source, the box first, freshness ──────────────────────────────────────────────────────────
  'source a: the watch pulse is labelled watch_ble; off, not connected or late, it is not taken'() {
    const { A, tick } = load(), S = A.Sensors;
    S.enabled.simulator = false;
    S.feedWatch(hr());
    assert.strictEqual(S.watchHr, null, 'switched off: ignored');
    S.enabled.watch = true;
    S.feedWatch(hr());
    assert.deepStrictEqual([S.watchHr, S.droppedWatch], [null, 1], 'not connected: dropped and counted');
    strap(A);
    S.feedWatch(hr({ t_ms: Date.now() - 3500 }));
    assert.deepStrictEqual([S.watchHr, S.droppedWatch], [null, 2], 'older than 3 s on arrival');
    S.feedWatch(hr());
    assert.deepStrictEqual(plain(S.pulse(A.now())), { bpm: 64, quality: 0.75, source: 'watch_ble', at: 0 });
    tick(2.9);
    assert.strictEqual(S.pulse(A.now()).source, 'watch_ble');
    tick(0.2);
    assert.strictEqual(S.pulse(A.now()).bpm, null, 'nothing for 3 s: no pulse, never a 0');
    assert.strictEqual(S.watchFrame(A.now()), null);
    S.feedWatch(hr());
    S.setWatchLink('connecting', 'Polar H10 1A2B3C4D');
    assert.deepStrictEqual([S.watchHr, S.pulse(A.now()).bpm], [null, null], 'a lost link takes the reading with it');
  },

  'source b: no contact, a pulse of 0 or out of range, or quality below 0.3 is not a pulse'() {
    const { A } = load(), S = A.Sensors;
    S.enabled.simulator = false;
    strap(A);
    for (const d of [hr({ contact: false }), hr({ bpm: 0 }), hr({ bpm: 300 }), hr({ bpm: null })]) {
      S.feedWatch(d);
      assert.strictEqual(S.pulse(A.now()).bpm, null, JSON.stringify(d));
    }
    S.feedWatch(hr({ contact: false }));
    const f = plain(S.watchFrame(A.now()));
    assert.deepStrictEqual([f.source, f.pulse_bpm, f.contact, f.quality, f.rmssd_ms], ['watch_ble', null, false, 0, null]);
    // intervals that are mostly artifacts pull the quality under 0.3
    const { A: B } = load(), T = B.Sensors;
    T.enabled.simulator = false;
    strap(B);
    T.feedWatch(hr({ rr_ms: [1000, 250, 2500, 3000, 100, 2400, 150, 1010] }));
    assert.ok(T.watchQuality(B.now()) < 0.3);
    assert.strictEqual(T.pulse(B.now()).bpm, null);
  },

  'source c: the finger box comes first whenever it gives a pulse; the watch fills in when it does not'() {
    const { A, tick } = load(), S = A.Sensors;
    S.enabled.simulator = false;
    strap(A); box(A); S.feedWatch(hr());
    assert.strictEqual(S.pulse(A.now()).source, 'finger_ppg');
    assert.strictEqual(S.physioFrame(A.now()).source, 'finger_ppg');
    assert.strictEqual(S.fingerFrame(A.now()).source, 'finger_ppg', 'fingerFrame stays the clips only');
    S.feedFingerBle(aff6({ presence: 'idle', finger_bpm: [0, 0], rmssd_ms: 0, breathing_per_min: 0 }));
    assert.deepStrictEqual([S.pulse(A.now()).source, S.physioFrame(A.now()).source], ['watch_ble', 'watch_ble'], 'no finger in the clips: the watch');
    assert.strictEqual(S.fingerFrame(A.now()).source, 'finger_ppg', 'the clip check still sees the clips, and only them');
    tick(1); S.feedFingerBle(hrm()); S.feedFingerBle(aff6()); S.feedWatch(hr());
    assert.strictEqual(S.pulse(A.now()).source, 'finger_ppg', 'the finger back in the clip: the box again');
    // a simulated hub frame never hides a measured watch pulse
    const { A: B } = load(), T = B.Sensors;
    T.feedFingerHub({ source: 'finger_ppg', simulated: true, pulse_bpm: 70, quality: 0.8, quality_reported: true, contact: true, finger_bpm: [70, 70], presence: 'active', age_s: 0 });
    strap(B); T.feedWatch(hr());
    assert.deepStrictEqual([T.pulse(B.now()).source, T.physioFrame(B.now()).source], ['watch_ble', 'watch_ble']);
  },

  'source d: a connected watch is a real producer; a session is locked real and the simulator never fills in'() {
    const { A } = load(), S = A.Sensors;
    assert.strictEqual(S.realProducer(A.now()), false);
    strap(A);
    assert.strictEqual(S.realProducer(A.now()), true, 'connected, even before a first pulse');
    assert.strictEqual(S.lockPulse(A.now()), 'real');
    assert.deepStrictEqual(plain(S.pulse(A.now())), { bpm: null, quality: null, source: null }, 'missing stays missing');
    S.unlockPulse();
    S.enabled.watch = false;
    assert.strictEqual(S.realProducer(A.now()), false, 'switched off: not a producer');
  },

  'source e: RMSSD from the strap intervals reaches the frame, the game and the heartbeat; HRV from the box has priority'() {
    const { A, tick } = load(), S = A.Sensors;
    S.enabled.simulator = false;
    strap(A);
    for (let i = 0; i < 45; i++) { S.feedWatch(hr({ bpm: 59, rr_ms: beats(i) })); tick(1); }
    S.feedWatch(hr({ bpm: 59, rr_ms: beats(45) }));
    const f = plain(S.watchFrame(A.now()));
    assert.deepStrictEqual([f.source, f.transport, f.pulse_bpm, f.quality, f.rr, f.rmssd_ms, f.breathing_per_min, f.presence],
      ['watch_ble', 'ble', 59, 1, true, 40, null, null]);
    assert.ok(A.Breathing.real(f), 'the game takes it as a real frame');
    assert.deepStrictEqual(plain(A.Breathing.reading(f)), { rate: null, pulse: 59 });
    // the heartbeat beats at the watch pulse
    A.Heartbeat.step(A.now(), 0.016, null);
    assert.strictEqual(A.Heartbeat.st.real, true);
    // without intervals (a Garmin watch broadcasting): a pulse, no RMSSD, and no number made up
    const { A: B } = load(), T = B.Sensors;
    strap(B, 'Forerunner 265');
    for (let i = 0; i < 3; i++) T.feedWatch(hr());
    const g = plain(T.watchFrame(B.now()));
    assert.deepStrictEqual([g.pulse_bpm, g.rr, g.rmssd_ms, g.quality], [64, false, null, 0.75]);
  },

  'source f: the game reads the watch RMSSD against its own values and says where it came from'() {
    const { A, tick } = load({ storage: new Map() }), S = A.Sensors;
    S.enabled.simulator = false;
    strap(A);
    S.feedWatch(hr({ bpm: 68, rr_ms: [1000] }));
    const s = start(A);
    let i = 0;
    run(A, tick, s, 50, null, () => S.feedWatch(hr({ bpm: 68, rr_ms: beats(i++) })));
    const r = plain(s.physioNow(A.now()));
    assert.deepStrictEqual([r.breathing, r.source], [null, 'watch_ble']);
    assert.ok(Math.abs(r.rmssd - 40) < 1, `RMSSD ${r.rmssd}: one difference of 0 ms where the session began`);
    assert.ok(s.baseOf('watch_ble').rmssd.length > 0 && s.base.rmssd.length === 0, 'the watch has its own values; the clips\' stay empty');
    const doc = finish(A, s);
    assert.strictEqual(doc.signal.pulse_source, 'watch_ble');
    assert.ok(doc.adaptive.transitions.every(t => t.hrv_source === null || t.hrv_source === 'watch_ble'));
  },

  // ── record.js: the session ────────────────────────────────────────────────────────────────────────────────────
  'record a: the watch has its own block vitals.watch, labelled, never in the finger, breathing, HRV or series blocks'() {
    const { A, tick } = load(), S = A.Sensors;
    S.enabled.simulator = false;
    strap(A);
    S.feedWatch(hr());
    const s = start(A);
    let i = 0;
    run(A, tick, s, 50, null, () => S.feedWatch(hr({ bpm: 66, rr_ms: beats(i++) })));
    const doc = finish(A, s), v = doc.vitals, w = v.watch;
    assert.deepStrictEqual([doc.signal.pulse_source, v.pulse_source, doc.simulated_fields], ['watch_ble', 'watch_ble', []]);
    assert.deepStrictEqual(Object.keys(w).sort(), ['contact_s', 'pulse_bpm', 'quality', 'rmssd_ms', 'rr_s', 'seconds', 'source', 'transport']);
    assert.deepStrictEqual([w.source, w.transport, w.pulse_bpm.mean, w.quality.max], ['watch_ble', 'ble', 66, 1]);
    assert.ok(w.rmssd_ms.samples > 0 && w.rmssd_ms.last === 40, JSON.stringify(w.rmssd_ms));
    assert.ok(w.seconds >= 45 && w.contact_s.on === w.seconds && w.contact_s.off === 0 && w.rr_s === w.seconds, JSON.stringify(w));
    assert.deepStrictEqual([v.finger, v.breathing, v.hrv, v.series], [null, null, null, null], 'the finger blocks stay the finger sensor\'s');
  },

  'record b: with the box and the watch both live, each keeps its own block and the game\'s pulse is the box'() {
    const { A, tick } = load(), S = A.Sensors;
    S.enabled.simulator = false;
    strap(A); box(A); S.feedWatch(hr());
    const s = start(A);
    run(A, tick, s, 20, null, () => { box(A); S.feedWatch(hr()); });
    const v = finish(A, s).vitals;
    assert.deepStrictEqual([v.pulse_source, v.finger.source, v.watch.source, v.watch.pulse_bpm.mean, v.finger.pulse_bpm.mean], ['finger_ppg', 'finger_ppg', 'watch_ble', 64, 72]);
    assert.strictEqual(v.watch.rmssd_ms, null, 'no intervals: no RMSSD block value');
  },

  'record c: seconds without contact or below quality 0.3 are counted but carry no numbers'() {
    const { A, tick } = load(), S = A.Sensors;
    S.enabled.simulator = false;
    strap(A); S.feedWatch(hr({ contact: false }));
    const s = start(A);
    run(A, tick, s, 12, null, () => S.feedWatch(hr({ contact: false })));
    const w = finish(A, s).vitals.watch;
    assert.deepStrictEqual([w.pulse_bpm, w.quality, w.rmssd_ms], [STAT0, STAT0, null]);
    assert.ok(w.seconds >= 9 && w.contact_s.off === w.seconds && w.contact_s.on === 0, JSON.stringify(w));
  },

  // ── watch.js: which device, and only that one ─────────────────────────────────────────────────────────────────
  'device a: the list leaves out the finger box and unnamed devices, strongest signal first'() {
    const { A } = load(), W = A.Watch;
    assert.strictEqual(W.pickable({ id: 'x', name: 'Afferent Finger' }), false, 'the box advertises 180D too');
    assert.strictEqual(W.pickable({ id: 'x', name: 'wendyos-uno-q' }), false);
    assert.strictEqual(W.pickable({ id: 'x', name: '  ' }), false);
    assert.strictEqual(W.pickable({ id: '', name: 'Forerunner 265' }), false);
    const list = plain(W.ranked([{ id: 'a', name: 'Wahoo TICKR', rssi: -80 }, { id: 'b', name: 'Forerunner 265', rssi: -55 }, { id: 'c', name: 'Afferent Finger', rssi: -40 },
      { id: 'd', name: 'Polar H10', rssi: null }], { id: 'a', name: 'Wahoo TICKR', on: true }));
    assert.deepStrictEqual(list.map(d => [d.name, d.chosen]), [['Forerunner 265', false], ['Wahoo TICKR', true], ['Polar H10', false]]);
    assert.deepStrictEqual([W.near(-55), W.near(-75), W.near(-90), W.near(null)], ['Close by', 'In the room', 'Further away', '']);
  },

  async 'device b: a scan never connects; choosing connects to that device only, remembered across a restart'() {
    const storage = new Map();
    let { A, watchPlugin: p } = load({ watch: true, storage });
    p.nearby = [{ id: 'gar-1', name: 'Forerunner 265', rssi: -60 }, { id: 'box', name: 'Afferent Finger', rssi: -40 }, { id: 'pol-1', name: 'Polar H10', rssi: -70 }];
    await A.Watch.scan();
    assert.deepStrictEqual(p.calls, ['scan'], 'listing nearby devices connects to none of them');
    assert.deepStrictEqual(plain(A.Watch.list().map(d => d.id)), ['gar-1', 'pol-1']);
    assert.strictEqual(A.Sensors.enabled.watch, false);
    assert.strictEqual(await A.Watch.choose({ id: 'box', name: 'Afferent Finger' }), false, 'the box cannot be chosen as a watch');
    await A.Watch.choose(A.Watch.list()[1]);
    assert.deepStrictEqual(plain(p.calls), ['scan', 'stopScan', 'connect pol-1']);
    assert.deepStrictEqual(JSON.parse(storage.get('afferent.watch')), { id: 'pol-1', name: 'Polar H10', on: true });
    assert.strictEqual(A.Sensors.enabled.watch, true);
    p.emit('state', { state: 'connected', name: 'Polar H10', id: 'pol-1' });
    p.emit('reading', hr({ bpm: 61 }));
    assert.strictEqual(A.Sensors.pulse(A.now()).source, 'watch_ble');
    // a restart: the remembered device, and only it, is connected again
    ({ A, watchPlugin: p } = load({ watch: true, storage }));
    assert.deepStrictEqual(plain(A.Watch.chosen()), { id: 'pol-1', name: 'Polar H10', on: true });
    await A.Watch.sync();
    assert.deepStrictEqual(p.calls, ['connect pol-1']);
    // a state from another device is not this one connected
    p.emit('state', { state: 'connected', name: 'Forerunner 265', id: 'gar-1' });
    assert.strictEqual(A.Sensors.watchLink.state, 'connecting');
  },

  async 'device c: switched off it lets go but remembers; forgotten it is gone; without a choice nothing connects'() {
    const storage = new Map();
    const { A, watchPlugin: p } = load({ watch: true, storage });
    await A.Watch.sync();
    assert.deepStrictEqual(p.calls, [], 'nothing chosen: no connect, no Bluetooth prompt');
    await A.Watch.choose({ id: 'w', name: 'Wahoo TICKR' });
    await A.Watch.setOn(false);
    assert.deepStrictEqual(p.calls.slice(-1), ['disconnect']);
    assert.deepStrictEqual([A.Sensors.enabled.watch, A.Watch.chosen().on], [false, false]);
    p.emit('reading', hr());
    assert.strictEqual(A.Sensors.watchHr, null, 'off: a late reading is ignored');
    await A.Watch.setOn(true);
    assert.deepStrictEqual(p.calls.slice(-1), ['connect w']);
    await A.Watch.forget();
    assert.deepStrictEqual([p.calls.slice(-1)[0], A.Watch.chosen(), storage.has('afferent.watch'), A.Sensors.enabled.watch], ['disconnect', null, false, false]);
  },

  'device d: without the plugin (a browser) it says so and does nothing'() {
    const { A } = load();
    assert.strictEqual(A.Watch.available(), false);
    assert.strictEqual(A.Watch.stateText(), 'Needs the Afferent app on a phone');
  },

  // ── vitals.js and livevitals.js ───────────────────────────────────────────────────────────────────────────────
  'sheet a: the watch has its own group under its own name; the Pulse row says where the pulse came from'() {
    const { A, tick } = load({ vitals: true }), S = A.Sensors, V = A.Vitals;
    S.enabled.simulator = false;
    strap(A, 'Polar H10');
    let m = plain(V.model(A.now()));
    assert.deepStrictEqual(m.watch, { title: 'Watch or strap', rows: [{ icon: 'devices', label: 'Polar H10', value: null, lines: ['No reading right now', 'Watch or strap'] }] });
    for (let i = 0; i < 45; i++) { S.feedWatch(hr({ bpm: 58, rr_ms: beats(i) })); tick(1); }
    S.feedWatch(hr({ bpm: 58, rr_ms: beats(45) }));
    m = plain(V.model(A.now()));
    assert.deepStrictEqual(m.rows[0], { icon: 'ecg_heart', label: 'Pulse', value: '58', lines: ['beats per minute', 'Watch or strap'] });
    assert.deepStrictEqual(m.watch.rows.map(r => [r.label, r.value, ...r.lines]), [['Polar H10', '58', 'beats per minute', 'Watch or strap'],
      ['Beat-to-beat variation', '40', 'ms (RMSSD)', 'Polar H10']]);
    S.enabled.watch = false;
    assert.strictEqual(plain(V.model(A.now())).watch, null);
  },

  'sheet b: the live vitals corner names the watch when its pulse is the one in use'() {
    const { A, ctx } = load(), S = A.Sensors;
    vm.runInContext(fs.readFileSync(path.join(JS, 'livevitals.js'), 'utf8'), ctx, { filename: 'livevitals.js' });
    S.enabled.simulator = false;
    strap(A, 'Forerunner 265'); S.feedWatch(hr());
    const s = { phase: 'game', done: false, transitions: [] };
    assert.strictEqual(A.LiveVitals.model(s, A.now()).source, 'Pulse from Forerunner 265');
    box(A);
    assert.strictEqual(A.LiveVitals.model(s, A.now()).source, null, 'the box in use: nothing to say');
  },

  // ── health.js: Apple Watch through Apple Health, context only ─────────────────────────────────────────────────
  async 'health a: samples come with their age, too old is not shown, and nothing becomes a live pulse'() {
    const { A, healthPlugin: p } = load({ health: true, storage: new Map(), vitals: true }), H = A.Health, now = Date.now();
    A.Sensors.enabled.simulator = false;
    p.data = {
      heart_rate: { bpm: 64, end_ms: now - 12 * 60e3, device: 'Watch' }, heart_rate_recent: [{ bpm: 66, end_ms: now - 20 * 60e3 }],
      resting_hr: { bpm: 55, end_ms: now - 5 * 3600e3, device: 'Watch' }, hrv_sdnn: { ms: 48.4, end_ms: now - 9 * 24 * 3600e3, device: 'Watch' },
      respiratory_rate: { per_min: 14.5, end_ms: now - 7 * 3600e3, device: 'Watch' },
      sleep: { asleep_min: 431, in_bed_min: 470, start_ms: now - 9 * 3600e3, end_ms: now - 2 * 3600e3, device: 'Watch' },
    };
    await H.enable();
    assert.deepStrictEqual(p.calls, ['status', 'request', 'read']);
    assert.strictEqual(H.stateText(), 'Apple Watch: 64 bpm, 12 min ago');
    assert.strictEqual(H.latest('hrv_sdnn'), null, 'nine days old: not shown');
    const c = plain(H.context(now));
    assert.deepStrictEqual(c, {
      source: 'healthkit', device: 'apple_watch', heart_rate_bpm: 64, heart_rate_age_s: 720, resting_heart_rate_bpm: 55, resting_heart_rate_age_s: 18000,
      hrv_sdnn_ms: null, hrv_sdnn_age_s: null, respiratory_rate_per_min: 14.5, respiratory_rate_age_s: 25200, sleep_asleep_min: 431, sleep_in_bed_min: 470, sleep_end_age_s: 7200,
    });
    assert.deepStrictEqual(plain(A.Sensors.pulse(A.now())), { bpm: null, quality: null, source: null }, 'never the game\'s pulse');
    assert.strictEqual(A.Sensors.realProducer(A.now()), false);
    const m = plain(A.Vitals.model(A.now())).health;
    assert.strictEqual(m.title, 'Apple Watch, saved samples');
    assert.deepStrictEqual(m.rows.map(r => [r.label, r.value, ...r.lines]), [
      ['Heart rate', '64', 'beats per minute', 'Apple Watch, 12 min ago'], ['Resting heart rate', '55', 'beats per minute', 'Apple Watch, 5 h ago'],
      ['Breathing', '15', 'breaths per minute', 'Apple Watch, 7 h ago'], ['Sleep', '7 h 11 min', 'asleep, the night before', 'Apple Watch, 2 h ago']]);
    H.disable();
    assert.deepStrictEqual([H.context(now), plain(A.Vitals.model(A.now())).health], [null, null]);
  },

  async 'health b: impossible values are no sample; a build without the HealthKit entitlement says so'() {
    const { A, healthPlugin: p } = load({ health: true, storage: new Map() }), H = A.Health, now = Date.now();
    p.data = { heart_rate: { bpm: 0, end_ms: now }, resting_hr: { bpm: 55 }, hrv_sdnn: { ms: 9000, end_ms: now }, respiratory_rate: null, sleep: { asleep_min: -5, end_ms: now } };
    await H.enable();
    assert.strictEqual(H.context(now), null);
    const { A: B, healthPlugin: q } = load({ health: true, storage: new Map() });
    q.available = false; q.reason = 'no_entitlement';
    assert.strictEqual(await B.Health.enable(), false);
    assert.strictEqual(B.Health.stateText(), 'This build of Afferent cannot read Apple Health yet');
    const { A: C } = load();
    assert.strictEqual(await C.Health.probe(), false, 'Android or a browser: no plugin');
  },

  async 'health c: the session record carries context.health, and only while it is on'() {
    const { A, tick, healthPlugin: p } = load({ health: true, storage: new Map() }), now = Date.now();
    p.data = { heart_rate: { bpm: 70, end_ms: now - 3 * 60e3, device: 'Watch' } };
    let s = start(A); run(A, tick, s, 3);
    assert.strictEqual(finish(A, s).context.health, undefined, 'off: no block at all');
    await A.Health.enable();
    s = start(A); run(A, tick, s, 3);
    const h = finish(A, s).context.health;
    assert.deepStrictEqual([h.source, h.device, h.heart_rate_bpm], ['healthkit', 'apple_watch', 70]);
    assert.ok(h.heart_rate_age_s >= 180 && h.heart_rate_age_s < 200);
  },

  // ── wiring ────────────────────────────────────────────────────────────────────────────────────────────────────
  'wiring: the scripts load in order, and the plugins exist on both platforms with the same methods'() {
    const html = fs.readFileSync(path.join(JS, '..', 'index.html'), 'utf8'), at = f => html.indexOf(`<script src="js/${f}"></script>`);
    for (const f of ['hrv.js', 'watch.js', 'health.js']) assert.ok(at(f) > 0, f);
    assert.ok(at('sensors.js') < at('hrv.js') && at('presence.js') < at('watch.js') && at('watch.js') < at('health.js') && at('health.js') < at('record.js'));
    const IOS = path.join(JS, '..', '..', 'ios', 'App', 'App'), AND = path.join(JS, '..', '..', 'android', 'app', 'src', 'main', 'java', 'fi', 'junction', 'afferent');
    const watchSwift = fs.readFileSync(path.join(IOS, 'AfferentWatch.swift'), 'utf8'), watchKt = fs.readFileSync(path.join(AND, 'AfferentWatchPlugin.kt'), 'utf8');
    const swiftMethods = [...watchSwift.matchAll(/CAPPluginMethod\(name: "(\w+)"/g)].map(m => m[1]).sort();
    const ktMethods = [...watchKt.matchAll(/@PluginMethod\s+fun (\w+)\(/g)].map(m => m[1]).sort();
    assert.deepStrictEqual(swiftMethods, ['connect', 'disconnect', 'scan', 'status', 'stopScan']);
    assert.deepStrictEqual(ktMethods, swiftMethods);
    const fake = load({ watch: true }).watchPlugin;
    for (const m of swiftMethods) assert.strictEqual(typeof fake[m], 'function', `the test fake lacks ${m}`);
    const health = fs.readFileSync(path.join(IOS, 'AfferentHealth.swift'), 'utf8');
    assert.deepStrictEqual([...health.matchAll(/CAPPluginMethod\(name: "(\w+)"/g)].map(m => m[1]).sort(), ['read', 'request', 'status']);
    assert.ok(!/HKObjectType\.\w+\([^)]*\)\s*\]\s*,\s*read|toShare:\s*\[[^\]]/.test(health) && /toShare: nil|toShare: \[\]/.test(health), 'read only: nothing is written to Health');
  },
};

(async () => {
  let failed = 0;
  for (const [name, fn] of Object.entries(tests)) {
    try { await fn(); console.log('ok  ', name); } catch (e) { failed++; console.log('FAIL', name, '\n     ', e.stack.split('\n').slice(0, 3).join('\n      ')); }
  }
  console.log(`${Object.keys(tests).length - failed} ok, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
