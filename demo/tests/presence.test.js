// Run: node demo/tests/presence.test.js
// 1. Vlad's scenario tests (jetson/presence/tests/test_core.py, test_improvements.py), same
//    numbers, against the JS port in demo/js/presence-core.js.
// 2. Differential: random traces replayed through jetson/presence/core.py (python3) and the
//    port; every tick's events, presence status, guest status and device list must match.
// 3. The phone adapters (bedside unit over BLE, home Wi-Fi fingerprint, hub, session context).
const assert = require('assert');
const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');
const P = require(path.join(__dirname, '..', 'js', 'presence-core.js'));
const { HOME, AWAY, UNKNOWN } = P;

const T0 = 10 * 86400 + 8 * 3600; // day 10, 08:00 "local" (UTC in these tests)
const STEP = 30;
const midnight = t => t - t % 86400;
const hour = t => Math.trunc(t % 86400 / 3600);
const tracker = (kw = {}) => new P.PresenceTracker(P.presenceConfig(kw), hour, midnight);
const gtracker = (kw = {}) => new P.GuestTracker(P.guestConfig(kw), ['aa:aa:aa:aa:aa:aa'], midnight);
const near = (a, b, delta) => assert.ok(Math.abs(a - b) <= delta, `${a} not within ${delta} of ${b}`);

// test_core.run: one tick every STEP seconds; returns [t, events]
const run = (p, t, seconds, wifi, ble = null) => {
  const events = [];
  const end = t + seconds;
  while (t < end) {
    t += STEP;
    events.push(...p.update(t, { wifi: typeof wifi === 'function' ? wifi(t) : wifi, ble }));
  }
  return [t, events];
};
// test_core.feed
const feed = (g, t, seconds, make, home = true) => {
  const events = [];
  const end = t + seconds;
  while (t < end) {
    t += STEP;
    g.observe(make(t));
    events.push(...g.update(t, home));
  }
  return [t, events];
};
const hex2 = n => (n % 256).toString(16).padStart(2, '0');
const phones = (n, t, rssi = -60, rotateS = 900, tag = 0) => {
  const rot = Math.trunc(t / rotateS);
  return Array.from({ length: n }, (_, i) => ({ addr: `02:${hex2(tag)}:00:00:${hex2(i)}:${hex2(rot)}`, rssi, ts: t }));
};
const tagged = (n, t, kind, rssi = -50, tag = 0, company = 76) =>
  Array.from({ length: n }, (_, i) => ({ addr: `02:${hex2(tag)}:00:00:${hex2(i)}:00`, rssi, ts: t, company, kind }));

const tests = {
  // ── test_core.py: Presence ────────────────────────────────────────────
  'core: home on first sighting'() {
    const p = tracker();
    p.update(T0, { wifi: true });
    assert.strictEqual(p.state, HOME);
  },
  'core: phone wifi sleep does not flap'() {
    const p = tracker();
    const [, ev] = run(p, T0, 4 * 3600, t => Math.trunc(t) / STEP % 12 === 0);
    assert.strictEqual(p.state, HOME);
    assert.ok(!ev.includes('left_home'));
  },
  'core: outing detected and backdated'() {
    const p = tracker();
    let [t] = run(p, T0, 600, true);
    const leftAt = t;
    let ev;
    [t, ev] = run(p, t, 3600, false);
    assert.ok(ev.includes('left_home'));
    assert.strictEqual(p.state, AWAY);
    near(p.outings.at(-1).start, leftAt, STEP);
    [t, ev] = run(p, t, 300, true);
    assert.ok(ev.includes('returned_home'));
    near(p.outings.at(-1).end - p.outings.at(-1).start, 3600 + STEP, 2 * STEP);
    assert.strictEqual(p.metrics(t).outings_today, 1);
  },
  'core: short absence below threshold is ignored'() {
    const p = tracker();
    let [t] = run(p, T0, 300, true);
    let ev, ev2;
    [t, ev] = run(p, t, 9 * 60, false);
    [t, ev2] = run(p, t, 60, true);
    assert.strictEqual(p.state, HOME);
    assert.deepStrictEqual([...ev, ...ev2], []);
  },
  'core: night threshold is longer'() {
    const p = tracker();
    let t = 10 * 86400 + 1 * 3600; // 01:00
    [t] = run(p, t, 300, true);
    [t] = run(p, t, 30 * 60, false);
    assert.strictEqual(p.state, HOME);
    [t] = run(p, t, 20 * 60, false);
    assert.strictEqual(p.state, AWAY);
  },
  'core: router down is unknown, not away'() {
    const p = tracker();
    let [t] = run(p, T0, 300, true);
    let ev;
    [t, ev] = run(p, t, 2 * 3600, null);
    assert.strictEqual(p.state, UNKNOWN);
    assert.ok(!ev.includes('left_home'));
    assert.ok(p.metrics(t).coverage_today < 0.2);
  },
  'core: outing not backdated into blind window'() {
    const p = tracker();
    let [t] = run(p, T0, 300, true);
    [t] = run(p, t, 3600, null);
    const blindEnd = t;
    [t] = run(p, t, 1200, false);
    assert.strictEqual(p.state, AWAY);
    assert.ok(p.outings.at(-1).start >= blindEnd - STEP);
  },
  'core: dead phone but activity at home'() {
    const p = tracker();
    let [t] = run(p, T0, 300, true);
    for (let i = 0; i < 6; i++) {
      p.activity(t);
      [t] = run(p, t, 1200, false);
      assert.strictEqual(p.state, HOME, p.reason);
    }
    [t] = run(p, t, 3600, false);
    assert.strictEqual(p.state, AWAY);
  },
  'core: second token (ble) covers wifi'() {
    const p = tracker();
    run(p, T0, 3 * 3600, false, true);
    assert.strictEqual(p.state, HOME);
  },
  'core: restart gap not counted as absence'() {
    const p = tracker();
    let [t] = run(p, T0, 300, true);
    t += 3 * 3600;
    const ev = p.update(t, { wifi: false });
    assert.strictEqual(p.state, HOME);
    assert.deepStrictEqual(ev, []);
  },
  'core: persistence roundtrip (through JSON)'() {
    const p = tracker();
    let [t] = run(p, T0, 300, true);
    [t] = run(p, t, 3600, false);
    const q = tracker();
    q.load(JSON.parse(JSON.stringify(p.to_dict())));
    assert.strictEqual(q.state, AWAY);
    assert.ok(q.update(t + STEP, { wifi: true }).includes('returned_home'));
  },
  'core: isolation alert'() {
    const p = tracker({ isolation_days: 2 });
    let [t] = run(p, T0, 3 * 86400, true);
    assert.strictEqual(p.metrics(t).isolation_alert, true);
    [t] = run(p, t, 3600, false);
    assert.strictEqual(p.metrics(t).isolation_alert, false);
  },
  'core: short outing does not reset isolation'() {
    const p = tracker({ isolation_days: 2, min_outing_s: 900, away_after_s: 120 });
    let [t] = run(p, T0, 3 * 86400, true);
    [t] = run(p, t, 300, false);
    [t] = run(p, t, 300, true);
    assert.strictEqual(p.metrics(t).isolation_alert, true);
  },

  // ── test_core.py: Guests ──────────────────────────────────────────────
  'core: guest visit with MAC rotation counts once'() {
    const g = gtracker();
    let [t, ev] = feed(g, T0, 3600, t => phones(1, t, -60, 900));
    assert.strictEqual(ev.filter(e => e === 'guest_arrived').length, 1);
    [t, ev] = feed(g, t, 1800, () => []);
    assert.ok(ev.includes('guest_left'));
    assert.strictEqual(g.metrics(t).visits_today, 1);
    near(g.visits.at(-1).end - g.visits.at(-1).start, 3600, 300);
  },
  'core: passer-by ignored'() {
    const g = gtracker();
    let [t, ev] = feed(g, T0, 240, t => phones(1, t));
    let ev2;
    [t, ev2] = feed(g, t, 1800, () => []);
    assert.deepStrictEqual([...ev, ...ev2], []);
  },
  'core: neighbours below RSSI floor ignored'() {
    const g = gtracker();
    const [, ev] = feed(g, T0, 3600, t => phones(6, t, -90));
    assert.deepStrictEqual(ev, []);
  },
  'core: calibration learns household and background'() {
    const g = gtracker();
    const tv = t => [{ addr: '11:22:33:44:55:66', rssi: -50, ts: t }];
    const bg = t => phones(2, t, -70, 900, 9);
    g.start_calibration(T0, 3600);
    let [t, ev] = feed(g, T0, 3600 + STEP, t => [...tv(t), ...bg(t)]);
    assert.ok(ev.includes('calibrated'));
    assert.ok(g.household.has('11:22:33:44:55:66'));
    assert.strictEqual(g.baseline, 2);
    [t, ev] = feed(g, t, 3600, t => [...tv(t), ...bg(t)]);
    assert.deepStrictEqual(ev, []);
    [t, ev] = feed(g, t, 1800, t => [...tv(t), ...bg(t), ...phones(2, t, -60, 900, 5)]);
    assert.ok(ev.includes('guest_arrived'));
    assert.strictEqual(g.visits.at(-1).peak_guests, 2);
  },
  'core: staggered background rotation is not a visit'() {
    const bg = t => Array.from({ length: 4 }, (_, i) => ({ addr: `02:0b:00:00:${hex2(i)}:${hex2(Math.trunc((t + i * 225) / 900))}`, rssi: -70, ts: t }));
    const g = gtracker();
    g.start_calibration(T0, 2 * 3600);
    let [t] = feed(g, T0, 2 * 3600 + STEP, bg);
    let ev;
    [t, ev] = feed(g, t, 12 * 3600, bg);
    assert.deepStrictEqual(ev, []);
  },
  "core: patient's own device is not a guest"() {
    const g = gtracker();
    const [, ev] = feed(g, T0, 3600, t => [{ addr: 'AA:AA:AA:AA:AA:AA', rssi: -40, ts: t }]);
    assert.deepStrictEqual(ev, []);
  },
  'core: no guests counted while patient away'() {
    const g = gtracker();
    const [, ev] = feed(g, T0, 3600, t => phones(2, t), false);
    assert.deepStrictEqual(ev, []);
  },
  'core: intermittent (locked phone) advertising is one visit'() {
    const g = gtracker();
    const [, ev] = feed(g, T0, 7200, t => Math.trunc(t) % 360 < 120 ? phones(1, t) : []);
    assert.strictEqual(ev.filter(e => e === 'guest_arrived').length, 1);
  },

  // ── test_improvements.py ──────────────────────────────────────────────
  'improvements: classify phones'() {
    assert.deepStrictEqual(P.classify({ 76: [0x10, 0x05, 0x01] }), [76, 'phone']);
    assert.deepStrictEqual(P.classify({ 117: [0x42, 0x04] }), [117, 'phone']);
    assert.deepStrictEqual(P.classify({}, ['0000fef3-0000-1000-8000-00805f9b34fb']), [null, 'phone']);
  },
  'improvements: classify non-phones'() {
    for (const md of [{ 76: [0x07, 0x19, 0x01] }, { 76: [0x12, 0x19] }, { 301: [0x00] }, { 6: [0x01, 0x09] }]) {
      assert.strictEqual(P.classify(md)[1], 'other', JSON.stringify(md));
    }
  },
  'improvements: classify unknown'() {
    assert.deepStrictEqual(P.classify({}), [null, null]);
    assert.deepStrictEqual(P.classify({ 76: [] }), [76, null]);
  },
  'improvements: gadgets are not guests when phones only'() {
    const g = new P.GuestTracker(P.guestConfig({ phones_only: true }), [], midnight);
    const [t, ev] = feed(g, T0, 3600, t => [...tagged(4, t, 'other', -50, 1), ...tagged(3, t, null, -50, 2)]);
    assert.deepStrictEqual(ev, []);
    assert.strictEqual(g.nearby_unknown(t).length, 0);
  },
  'improvements: same gadgets count in classic mode'() {
    const g = new P.GuestTracker(P.guestConfig({ phones_only: false }), [], midnight);
    const [, ev] = feed(g, T0, 3600, t => tagged(4, t, 'other', -50, 1));
    assert.ok(ev.includes('guest_arrived'));
  },
  'improvements: one guest with phone, earbuds and watch counts once'() {
    const g = new P.GuestTracker(P.guestConfig({ phones_only: true }), [], midnight);
    const [, ev] = feed(g, T0, 1800, t => [...tagged(1, t, 'phone', -50, 1), ...tagged(1, t, 'other', -50, 2), ...tagged(1, t, null, -50, 3)]);
    assert.ok(ev.includes('guest_arrived'));
    assert.strictEqual(g.visits.at(-1).peak_guests, 1);
  },
  'improvements: table range ignores the room'() {
    const g = new P.GuestTracker(P.guestConfig({ rssi_min: -55, phones_only: true }), [], midnight);
    const room = t => tagged(10, t, 'phone', -68, 1);
    let [t, ev] = feed(g, T0, 1800, room);
    assert.deepStrictEqual(ev, []);
    [t, ev] = feed(g, t, 1800, t => [...room(t), ...tagged(1, t, 'phone', -45, 9)]);
    assert.ok(ev.includes('guest_arrived'));
  },
  'improvements: device list explains what is counted'() {
    const g = new P.GuestTracker(P.guestConfig({ rssi_min: -55, phones_only: true }), ['02:09:00:00:00:00'], midnight);
    g.observe([...tagged(1, T0, 'phone', -45, 9), ...tagged(1, T0, 'phone', -48, 1), ...tagged(1, T0, 'other', -40, 2, 301), ...tagged(1, T0, 'phone', -80, 3)]);
    const rows = Object.fromEntries(g.nearby_devices(T0).map(r => [r.addr, r]));
    assert.strictEqual(g.nearby_devices(T0)[0].addr, '02:02:00:00:00:00');
    assert.strictEqual(rows['02:02:00:00:00:00'].counted, false);
    assert.strictEqual(rows['02:02:00:00:00:00'].maker, 'Sony');
    assert.strictEqual(rows['02:01:00:00:00:00'].counted, true);
    assert.strictEqual(rows['02:03:00:00:00:00'].counted, false);
    assert.strictEqual(rows['02:09:00:00:00:00'].note, 'patient');
  },
  'improvements: outage is recorded and closed'() {
    const p = tracker();
    let [t] = run(p, T0, 300, true);
    let ev;
    [t, ev] = run(p, t, 120, null);
    assert.ok(ev.includes('network_lost'));
    [t, ev] = run(p, t, 60, true);
    assert.ok(ev.includes('network_restored'));
    const o = p.outages.at(-1);
    near(o.end - o.start, 120 + STEP, STEP);
    near(p.metrics(t).network_outage_min_today, 2.5, 0.6);
    assert.strictEqual(p.state, HOME);
    assert.deepStrictEqual(p.outings, []);
  },
  'improvements: outage survives restart'() {
    const p = tracker();
    let [t] = run(p, T0, 300, true);
    run(p, t, 120, null);
    const q = tracker();
    q.load(JSON.parse(JSON.stringify(p.to_dict())));
    assert.strictEqual(q.outages.at(-1).end, null);
  },
  'improvements: no outage when healthy'() {
    const p = tracker();
    const [, ev] = run(p, T0, 3600, t => Math.trunc(t) / STEP % 2 === 0);
    assert.ok(!ev.includes('network_lost'));
    assert.deepStrictEqual(p.outages, []);
  },
  'improvements: profiles (app.py) switch live'() {
    const pcfg = P.presenceConfig(), gcfg = P.guestConfig();
    let prof = P.applyProfile('home', pcfg, gcfg);
    assert.strictEqual(prof.name, 'home');
    assert.strictEqual(gcfg.rssi_min, -65);
    assert.strictEqual(gcfg.phones_only, true);
    const p = new P.PresenceTracker(pcfg, hour, midnight);
    P.applyProfile('demo', pcfg, gcfg);
    assert.strictEqual(pcfg.away_after_s, 120);
    assert.strictEqual(gcfg.rssi_min, -65);
    assert.strictEqual(p.cfg, pcfg); // trackers see the change live
    let t = T0;
    p.update(t, { wifi: true });
    for (let i = 0; i < 5; i++) { t += 30; p.update(t, { wifi: false }); }
    assert.strictEqual(p.state, AWAY); // 2.5 min > 2 min demo limit
    P.applyProfile('classic', pcfg, gcfg);
    assert.strictEqual(gcfg.rssi_min, -75);
    assert.strictEqual(gcfg.phones_only, false);
  },

  // ── port details ──────────────────────────────────────────────────────
  'port: Python rounding (ties to even)'() {
    assert.strictEqual(P.pyRound(0.25, 1), 0.2);
    assert.strictEqual(P.pyRound(0.35, 1), 0.3);  // 0.35 is 0.34999... as a double, like Python
    assert.strictEqual(P.pyRound(2.5), 2);
    assert.strictEqual(P.pyRound(3.5), 4);
    assert.strictEqual(P.pyRound(-60.5), -60);
    assert.strictEqual(P.pyRound(1.005, 2), 1);
    assert.strictEqual(P.pyRound(0.125, 2), 0.12);
    assert.strictEqual(P.pyRound(2 / 3, 3), 0.667);
  },
  'phone: restored open visit closes once (core.py would repeat guest_left forever)'() {
    const g = gtracker();
    let [t] = feed(g, T0, 1800, t => phones(1, t));
    assert.strictEqual(g.visits.at(-1).end, null);
    const h = gtracker();
    h.load(JSON.parse(JSON.stringify(g.to_dict())));
    let ev;
    [t, ev] = feed(h, t, 120, () => []);
    assert.strictEqual(ev.filter(e => e === 'guest_left').length, 1);
    assert.notStrictEqual(h.visits.at(-1).end, null);
  },
  'phone: a visit open when the app closed ends where watching stopped'() {
    const g = gtracker();
    let [t] = feed(g, T0, 1800, t => phones(1, t));
    const closedAt = t;
    const ev = g.close_for_gap(closedAt);
    assert.deepStrictEqual(ev, ['guest_left']);
    assert.ok(g.visits.at(-1).end <= closedAt);
    t += 4 * 3600; // reopened hours later, nobody around
    let ev2;
    [t, ev2] = feed(g, t, 600, () => []);
    assert.deepStrictEqual(ev2, []);
    assert.strictEqual(g.metrics(t).visits_today, 1);
  },

  // ── phone adapters ────────────────────────────────────────────────────
  'adapter: bedside unit over BLE follows probes.py patient_seen'() {
    const now = 1000;
    assert.strictEqual(P.bleSighting({ known: false, ok: true, lastAt: 990, now }), null);  // never paired
    assert.strictEqual(P.bleSighting({ known: true, ok: false, lastAt: 990, now }), null);  // Bluetooth off
    assert.strictEqual(P.bleSighting({ known: true, ok: true, lastAt: 990, now }), true);
    assert.strictEqual(P.bleSighting({ known: true, ok: true, lastAt: now - 121, now }), false); // 120 s window
    assert.strictEqual(P.bleSighting({ known: true, ok: true, lastAt: null, now }), false);
  },
  'adapter: home Wi-Fi fingerprint'() {
    const learned = ['a', 'b', 'c'];
    assert.strictEqual(P.wifiSighting({ learned: [], visible: ['a'], onWifi: true, browse: 'ready' }), null);
    assert.strictEqual(P.wifiSighting({ learned, visible: ['a', 'b'], onWifi: true, browse: 'denied' }), null);
    assert.strictEqual(P.wifiSighting({ learned, visible: [], onWifi: false, browse: 'off' }), false);
    assert.strictEqual(P.wifiSighting({ learned, visible: ['a'], onWifi: true, browse: 'starting' }), null);
    assert.strictEqual(P.wifiSighting({ learned, visible: ['a'], onWifi: true, browse: 'ready' }), false); // 3 learned: needs 2
    assert.strictEqual(P.wifiSighting({ learned, visible: ['a', 'c', 'x'], onWifi: true, browse: 'ready' }), true);
    assert.strictEqual(P.wifiSighting({ learned: ['tv'], visible: ['tv'], onWifi: true, browse: 'ready' }), true);
  },
  'adapter: hub counts only when reached on the local network'() {
    assert.strictEqual(P.hubSighting({ connected: true, url: 'ws://192.168.1.20:8000/ws/app' }), true);
    assert.strictEqual(P.hubSighting({ connected: true, url: 'ws://10.0.0.5:8000/ws/app' }), true);
    assert.strictEqual(P.hubSighting({ connected: true, url: 'ws://mac.local:8000/ws/app' }), true);
    assert.strictEqual(P.hubSighting({ connected: true, url: 'wss://hub.example.com/ws/app' }), null);
    assert.strictEqual(P.hubSighting({ connected: true, url: 'ws://172.32.0.1:8000/ws/app' }), null);
    assert.strictEqual(P.hubSighting({ connected: false, url: 'ws://192.168.1.20:8000/ws/app' }), null); // silence proves nothing
  },
  'adapter: CoreBluetooth manufacturer data -> classify'() {
    assert.deepStrictEqual(P.classify(P.manufacturerFromHex('4c00100501')), [76, 'phone']);   // Apple Nearby Info
    assert.deepStrictEqual(P.classify(P.manufacturerFromHex('4c000719')), [76, 'other']);     // AirPods
    assert.deepStrictEqual(P.classify(P.manufacturerFromHex('75004204')), [117, 'phone']);    // Samsung
    assert.deepStrictEqual(P.classify(null, ['FEF3']), [null, 'phone']);                       // 16-bit UUID as iOS prints it
    assert.strictEqual(P.manufacturerFromHex('4c'), null);
  },
  'adapter: session context needs a sighting in this open stretch'() {
    const p = tracker(), g = gtracker();
    let [t] = run(p, T0, 300, true);
    // Seen before the app was closed: stale after reopening.
    const reopened = t + 6 * 3600;
    assert.deepStrictEqual(P.sessionContext(p, g, reopened, { stretchStart: reopened }), { home: null, visitors_present: null });
    p.update(reopened, { wifi: true });
    assert.strictEqual(P.sessionContext(p, g, reopened, { stretchStart: reopened }).home, true);
    // Away only when decided while watching.
    const q = tracker();
    let [t2, ev] = run(q, T0, 300, true);
    [t2, ev] = run(q, t2, 900, false);
    assert.ok(ev.includes('left_home'));
    assert.strictEqual(P.sessionContext(q, g, t2, { stretchStart: T0, awayDecidedAt: t2 - 300 }).home, false);
    assert.strictEqual(P.sessionContext(q, g, t2 + 7200, { stretchStart: t2 + 7200, awayDecidedAt: t2 - 300 }).home, null);
  },
  'adapter: visitors in the session need calibration and a full dwell window'() {
    const p = tracker(), g = gtracker({ dwell_s: 120, end_after_s: 120, window_s: 60 });
    let t = T0;
    const step = (ads, n = 1) => { for (let i = 0; i < n; i++) { t += STEP; P.tick(p, g, t, { ble: true }, ads(t)); } };
    step(() => [], 2);
    assert.strictEqual(P.sessionContext(p, g, t, { stretchStart: T0, calibrated: false }).visitors_present, null);
    assert.strictEqual(P.sessionContext(p, g, t, { stretchStart: T0, calibrated: true }).visitors_present, null); // watched < dwell
    step(() => [], 4);
    assert.strictEqual(P.sessionContext(p, g, t, { stretchStart: T0, calibrated: true }).visitors_present, 0);
    step(t => phones(1, t), 1); // a phone sits down: candidate, not yet a visit
    assert.strictEqual(P.sessionContext(p, g, t, { stretchStart: T0, calibrated: true }).visitors_present, null);
    step(t => phones(1, t), 8); // min-filter span (75 s) then the 120 s dwell
    assert.strictEqual(g.visits.length, 1);
    assert.strictEqual(P.sessionContext(p, g, t, { stretchStart: T0, calibrated: true }).visitors_present, 1);
  },
  'adapter: phone tick log is read by tools/score.py unchanged'() {
    const py = python();
    if (!py) return console.log('      (skipped: python3 not found)');
    const p = tracker({ away_after_s: 120 }), g = gtracker();
    const rows = [];
    let t = T0, truth = 'home';
    const say = (n, sig) => { for (let i = 0; i < n; i++) { t += STEP; const ev = P.tick(p, g, t, sig, []); rows.push(P.tickRow(t, p.state, sig, 0, g.current, ev, truth)); } };
    say(20, { ble: true });
    truth = 'away'; say(20, { ble: false });
    truth = 'home'; say(20, { ble: true });
    const dir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'presence-'));
    const file = path.join(dir, 'ticks.jsonl');
    fs.writeFileSync(file, rows.map(r => JSON.stringify(r)).join('\n') + '\n');
    const r = spawnSync(py, ['-I', path.join(CORE_DIR, 'tools', 'score.py'), file, '--lag-min', '2'], { encoding: 'utf8' });
    fs.rmSync(dir, { recursive: true, force: true });
    assert.strictEqual(r.status, 0, r.stderr);
    assert.match(r.stdout, /tick accuracy\s+100\.0%/);
    assert.match(r.stdout, /outing recall\s+100%\s+precision 100%/);
  },
};

// ── differential test against jetson/presence/core.py ─────────────────────
const CORE_DIR = path.join(__dirname, '..', '..', 'jetson', 'presence');
let pyBin;
function python() {
  if (pyBin !== undefined) return pyBin;
  pyBin = null;
  if (!fs.existsSync(path.join(CORE_DIR, 'core.py'))) return pyBin;
  for (const bin of ['python3', 'python']) {
    const r = spawnSync(bin, ['-c', 'import sys; print(sys.version_info[0])'], { encoding: 'utf8' });
    if (r.status === 0 && r.stdout.trim() === '3') return (pyBin = bin);
  }
  return pyBin;
}

const DRIVER = `
import json, sys
sys.path.insert(0, sys.argv[1])
from core import Advert, GuestConfig, GuestTracker, HOME, PresenceConfig, PresenceTracker
sc = json.load(sys.stdin)
mid = lambda t: t - t % 86400
hr = lambda t: int(t % 86400 // 3600)
p = PresenceTracker(PresenceConfig(**sc["pcfg"]), hour_fn=hr, midnight_fn=mid)
g = GuestTracker(GuestConfig(**sc["gcfg"]), ignore=sc["ignore"], midnight_fn=mid)
out = []
for st in sc["steps"]:
    now = st["t"]
    if st.get("activity"):
        p.activity(now)
    if st.get("calibrate"):
        g.start_calibration(now, st["calibrate"])
    ev = p.update(now, st["sig"])
    g.observe([Advert(**a) for a in st["ads"]])
    ev += g.update(now, patient_home=p.state == HOME)
    # status() hands out live dicts (last_seen_by): snapshot each tick.
    out.append(json.loads(json.dumps({"ev": ev, "p": p.status(now), "g": g.status(now), "n": g.nearby_devices(now)})))
print(json.dumps({"out": out, "p": p.to_dict(), "g": g.to_dict()}))
`;

const mulberry = seed => () => {
  seed |= 0; seed = seed + 0x6D2B79F5 | 0;
  let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
  t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
  return ((t ^ t >>> 14) >>> 0) / 4294967296;
};

function scenario(seed) {
  const r = mulberry(seed), pick = xs => xs[Math.floor(r() * xs.length)], chance = x => r() < x;
  const prof = pick(Object.keys(P.PROFILES)), pcfg = P.presenceConfig({ isolation_days: pick([0.05, 0.5, 2]) }), gcfg = P.guestConfig();
  P.applyProfile(prof, pcfg, gcfg);
  if (chance(0.3)) gcfg.dwell_s = 60;
  const steps = [];
  let t = 10 * 86400 + Math.floor(r() * 86400), regime = 'home', guests = 0, neighbours = 0, gadgets = 0, household = chance(0.5);
  for (let i = 0; i < 700; i++) {
    t += chance(0.03) ? 200 + Math.floor(r() * 4000) : 20 + Math.floor(r() * 21) + (chance(0.2) ? 0.5 : 0);
    if (chance(0.06)) regime = pick(['home', 'home', 'away', 'outage', 'flaky', 'mixed']);
    if (chance(0.05)) guests = pick([0, 0, 1, 2, 3]);
    if (chance(0.03)) neighbours = pick([0, 2, 6]);
    if (chance(0.03)) gadgets = pick([0, 1, 3]);
    const v = () => regime === 'home' ? (chance(0.9) ? true : false)
      : regime === 'away' ? false
      : regime === 'outage' ? null
      : regime === 'flaky' ? pick([true, false, false, null])
      : pick([true, false, null]);
    const sig = { wifi: v(), ble: regime === 'outage' ? null : pick([v(), null]) };
    if (chance(0.3)) sig.hub = pick([true, null]);
    const rot = Math.floor(t / 900);
    const ads = [];
    for (let k = 0; k < guests; k++) if (chance(0.8)) ads.push({ addr: `02:00:00:00:${hex2(k)}:${hex2(rot)}`, rssi: -50 - Math.floor(r() * 25), ts: t, company: 76, kind: 'phone' });
    for (let k = 0; k < neighbours; k++) if (chance(0.7)) ads.push({ addr: `02:00:00:01:${hex2(k)}:${hex2(rot + k)}`, rssi: -70 - Math.floor(r() * 25), ts: t, company: 117, kind: 'phone' });
    for (let k = 0; k < gadgets; k++) ads.push({ addr: `02:00:00:02:${hex2(k)}:00`, rssi: -45 - Math.floor(r() * 10), ts: t, company: pick([301, 6, null]), kind: pick(['other', null]) });
    if (household) ads.push({ addr: '11:22:33:44:55:66', rssi: -55, ts: t, company: null, kind: pick([null, 'phone']) });
    if (chance(0.1)) ads.push({ addr: 'AA:AA:AA:AA:AA:AA', rssi: -40, ts: t, company: 76, kind: 'phone' }); // patient's own
    const st = { t, sig, ads };
    if (chance(0.02)) st.activity = true;
    if (chance(0.01)) st.calibrate = pick([300, 1800]);
    steps.push(st);
  }
  return { seed, pcfg, gcfg, ignore: ['aa:aa:aa:aa:aa:aa'], steps };
}

function replayJs(sc) {
  const p = new P.PresenceTracker({ ...sc.pcfg }, hour, midnight);
  const g = new P.GuestTracker({ ...sc.gcfg }, sc.ignore, midnight);
  const out = [];
  for (const st of sc.steps) {
    const now = st.t;
    if (st.activity) p.activity(now);
    if (st.calibrate) g.start_calibration(now, st.calibrate);
    const ev = P.tick(p, g, now, st.sig, st.ads);
    out.push({ ev, p: p.status(now), g: g.status(now), n: g.nearby_devices(now) });
  }
  return { out, p: p.to_dict(), g: g.to_dict() };
}

const norm = x => JSON.parse(JSON.stringify(x, (k, v) => Object.is(v, -0) ? 0 : v));

const SEEDS = Number(process.env.PRESENCE_SEEDS) || 12;   // PRESENCE_SEEDS=200 for a deeper run
tests[`differential: ${SEEDS} random traces match jetson/presence/core.py tick by tick`] = () => {
  const py = python();
  if (!py) return console.log('      (skipped: python3 or jetson/presence/core.py not found)');
  let ticks = 0, events = 0;
  for (let seed = 1; seed <= SEEDS; seed++) {
    const sc = scenario(seed);
    const r = spawnSync(py, ['-I', '-c', DRIVER, CORE_DIR], { input: JSON.stringify(sc), encoding: 'utf8', maxBuffer: 1 << 28 });
    assert.strictEqual(r.status, 0, r.stderr);
    const want = norm(JSON.parse(r.stdout)), got = norm(replayJs(sc));
    for (let i = 0; i < want.out.length; i++) {
      assert.deepStrictEqual(got.out[i], want.out[i], `seed ${seed} tick ${i} (t=${sc.steps[i].t}) differs`);
      events += want.out[i].ev.length;
    }
    assert.deepStrictEqual(got.p, want.p, `seed ${seed}: presence state differs`);
    assert.deepStrictEqual(got.g, want.g, `seed ${seed}: guest state differs`);
    ticks += want.out.length;
  }
  assert.ok(events > 100, `traces too quiet (${events} events)`);
  console.log(`      (${ticks} ticks, ${events} events compared)`);
};

let failed = 0;
for (const [name, fn] of Object.entries(tests)) {
  try { fn(); console.log('ok  ', name); } catch (e) { failed++; console.log('FAIL', name, '\n     ', e.message); }
}
console.log(`${Object.keys(tests).length - failed}/${Object.keys(tests).length} passed`);
process.exit(failed ? 1 : 0);
