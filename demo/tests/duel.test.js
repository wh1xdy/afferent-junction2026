// Run: node demo/tests/duel.test.js
// Heart Duel in the app (Settings, Together): two people, one finger clip each, outside the therapy session.
// Checks the two-people flag, the app's own two-people rule, honest per-clip readings, the round, and that nothing from a duel is stored.
// All numbers are test inputs, not measurements.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
const { load, run, plain, JS } = require('./harness');

const ROOT = path.join(JS, '..', '..');
const read = (...p) => fs.readFileSync(path.join(...p), 'utf8');

// The app with the duel loaded next to the sensors, as index.html loads it (duel.js itself is the DOM and is checked in Chrome).
const duel = (opts = {}) => {
  const env = load({ finger: true, ...opts });
  for (const f of ['heartduel-game.js', 'duel-core.js']) vm.runInContext(read(JS, f), env.ctx, { filename: f });
  const { A } = env, S = A.Sensors, D = A.DuelCore;
  const m = D.create();
  A.bus.on('fingerAff1', d => D.packet(m, d, A.now() * 1000));
  const linked = () => S.enabled.pulse_stone && S.fingerLink.state === 'connected';
  const frame = () => D.step(m, A.now() * 1000, linked());
  const screen = () => plain(D.screen({ enabled: S.enabled.pulse_stone, link: S.fingerLink.state, views: frame(), people: m.people, round: m.round }));
  return { ...env, S, D, m, frame, screen };
};

const connect = S => S.setFingerLink('connected', 'Afferent Finger');
// AFF1 as the plugin reports it. v3 = 7 bytes with two_hearts, v2 = 6 bytes without.
const aff = (f, o = {}) => ({ kind: 'aff1', finger_bpm: f, breathing_per_min: null, rmssd_ms: null, quality: 0.6, presence: 'active', two_hearts: false, payload_len: 7, t_ms: Date.now(), ...o });
const v2 = (f, o = {}) => aff(f, { two_hearts: null, payload_len: 6, ...o });

// Feed a packet every `every` s for `seconds`, stepping the screen at 20 frames a second. fn(t) gives the packet at time t.
const play = (env, seconds, fn, every = 1) => {
  const { S, tick, frame } = env;
  for (let i = 0; i < seconds * 20; i++) {
    if (i % Math.round(every * 20) === 0) { const d = fn(i / 20); if (d) S.feedFingerBle(d); }
    tick(0.05); frame();
  }
};

const tests = {
  'a: the app copy of the game logic is fun/heart-duel/game.js, unchanged (fun/heart-duel/build.sh copies it)'() {
    assert.strictEqual(read(JS, 'heartduel-game.js'), read(ROOT, 'fun', 'heart-duel', 'game.js'));
    const page = read(JS, '..', 'index.html'), at = s => { const i = page.indexOf(s); assert.ok(i > 0, s); return i; };
    assert.ok(at('js/sensors.js') < at('js/heartduel-game.js') && at('js/heartduel-game.js') < at('js/duel-core.js') && at('js/duel-core.js') < at('js/duel.js') && at('js/duel.js') < at('js/main.js'),
      'the duel loads after the sensors and before main.js, which wires the support button of its app bar');
    assert.ok(page.includes('<link rel="stylesheet" href="css/duel.css">'));
  },

  'b: the plugin flag reaches the app: a v3 packet with two_hearts says two people at once, without it the sensors do not claim it'() {
    const env = duel(), { S, screen } = env;
    connect(S);
    S.feedFingerBle(aff([64, 92], { two_hearts: true }));
    assert.strictEqual(S.twoPeople(), true);
    assert.strictEqual(screen().two, 'box');
    S.feedFingerBle(aff([64, 92], { two_hearts: false }));
    assert.strictEqual(S.twoPeople(), false);
    assert.strictEqual(screen().two, null, 'the box said one person: the app does not overrule it');
    for (const two of [null, undefined, 'yes', 1]) {
      S.feedFingerBle(aff([64, 92], { two_hearts: two }));
      assert.strictEqual(S.twoPeople(), false, String(two));
    }
    S.feedFingerBle(aff([64, 92], { two_hearts: true }));
    S.setFingerLink('scanning');
    assert.strictEqual(S.twoPeople(), false, 'a lost link forgets the flag');
  },

  'c: without the flag (v1/v2 box), two clearly different rhythms for 3 s mean two people; close, half/double or one clip do not'() {
    const two = (f, seconds) => {
      const env = duel(), { S, screen } = env;
      connect(S);
      play(env, seconds, () => v2(f));
      return screen().two;
    };
    assert.strictEqual(two([64, 92], 2), null, 'not yet: 3 s apart first');
    assert.strictEqual(two([64, 92], 6), 'app');
    assert.strictEqual(two([70, 76], 8), null, '8 % apart: could be one person');
    assert.strictEqual(two([60, 121], 8), null, 'double: one heart counted twice');
    assert.strictEqual(two([64, 0], 8), null, 'one clip only');
    const { apart } = duel().D;
    assert.deepStrictEqual([apart(64, 92), apart(70, 78), apart(70, 79), apart(60, 120), apart(60, null)], [true, false, true, false, null]);

    const env = duel(), { S, screen } = env;
    connect(S);
    play(env, 6, () => v2([64, 92]));
    assert.strictEqual(screen().two, 'app');
    play(env, 4, () => v2([70, 71]));
    assert.strictEqual(screen().two, null, 'the same rhythm for 3 s: not two people any more');
  },

  'd: a number only while a heartbeat confirms it: a removed clip, a lost link and the 20 s frozen value of an old box show none'() {
    let env = duel(), { S, screen } = env;
    const nums = s => s.players.map(p => p.bpm);
    assert.deepStrictEqual(nums(screen()), [null, null]);
    assert.strictEqual(screen().link.text, 'No finger sensor on this device');
    connect(S);
    S.feedFingerBle(aff([64, 92]));
    assert.deepStrictEqual(nums(screen()), [null, null], 'the first packet alone is not yet a confirmed beat');
    play(env, 3, () => aff([64, 92]));
    assert.deepStrictEqual(nums(screen()), [64, 92]);
    assert.deepStrictEqual(screen().players.map(p => p.line), ['beats per minute', 'beats per minute']);

    play(env, 1, () => aff([64, 0]));                       // v3: the box zeroes a clip that came off
    let s = screen();
    assert.deepStrictEqual(nums(s), [64, null]);
    assert.strictEqual(s.players[1].line, 'Put on clip 2');

    play(env, 6, () => null);                               // no packets: the link is quiet
    s = screen();
    assert.deepStrictEqual(nums(s), [null, null]);
    assert.deepStrictEqual(s.players.map(p => p.line), ['No reading right now', 'Then clip 2'], 'clip 1 wakes the box, so clip 2 waits for it');

    S.setFingerLink('scanning');
    s = screen();
    assert.deepStrictEqual([nums(s), s.players[0].state, s.link.text], [[null, null], 'off', 'Looking for the finger sensor']);

    // an old box keeps a removed clip's last number: after 20 s without a change it is not shown
    ({ S } = env = duel());
    connect(S);
    // (clip 1 moves every 3 s; a packet in which neither clip moved confirms both, so clip 2 stays confirmed at a steady 92)
    const p1 = t => 64 + Math.floor(t / 3) % 2;
    play(env, 19, t => v2([p1(t), 92]));
    assert.strictEqual(env.screen().players[1].bpm, 92, 'a steady 92 is shown while it can still be a heart');
    play(env, 6, t => v2([p1(t + 19), 92]));
    s = env.screen();
    assert.deepStrictEqual([s.players[0].bpm, s.players[1].bpm, s.players[1].line], [64, null, 'Is the clip still on?']);
    // a v3 box vouches for its numbers: a steady 92 stays
    ({ S } = env = duel());
    connect(S);
    play(env, 25, t => aff([64 + Math.floor(t / 3) % 2, 92]));
    assert.strictEqual(env.screen().players[1].bpm, 92);

    // the pulse stone switched off
    ({ S } = env = duel());
    connect(S);
    play(env, 3, () => aff([64, 92]));
    S.enabled.pulse_stone = false;
    s = env.screen();
    assert.deepStrictEqual([nums(s), s.link.text, s.button.enabled], [[null, null], 'The pulse stone is switched off in Settings', false]);
  },

  'e: a simulated frame never counts: the simulator and simulated hub frames give the duel nothing'() {
    const env = duel(), { A, S, screen, tick } = env;
    S.enabled.simulator = true;
    assert.strictEqual(S.pulse(A.now()).source, 'simulated', 'the simulator is running');
    for (let i = 0; i < 5; i++) {
      S.feedFingerHub({ type: 'physio', source: 'finger_ppg', simulated: true, pulse_bpm: 72, quality: 0.9, quality_reported: true, contact: true, finger_bpm: [64, 92], presence: 'active', age_s: 0 });
      S.feedFingerHub({ type: 'physio', source: 'finger_ppg', transport: 'hub_http', simulated: false, pulse_bpm: 72, quality: 0.9, quality_reported: true, contact: true, finger_bpm: [64, 92], presence: 'active', age_s: 0 });
      tick(1);
    }
    const s = screen();
    assert.deepStrictEqual(s.players.map(p => p.bpm), [null, null], 'the duel reads the clips over Bluetooth only');
    assert.strictEqual(s.button.enabled, false);
  },

  'f: the round: settle 10 s, then the first to stay 4 below their own start for 5 s wins'() {
    const env = duel(), { S, D, m, screen } = env;
    connect(S);
    play(env, 3, () => aff([70, 84]));
    let s = screen();
    assert.deepStrictEqual(s.button, { label: 'Start', enabled: true });
    D.start(m);
    play(env, 10, () => aff([70, 84]));
    s = screen();
    assert.strictEqual(m.round.step, 'race');
    assert.deepStrictEqual(plain(m.round.start), [70, 84]);
    assert.deepStrictEqual(s.players.map(p => p.goal), ['Start 70 · goal 66', 'Start 84 · goal 80']);
    assert.deepStrictEqual(s.players.map(p => p.line), ['At your start', 'At your start']);
    play(env, 2, () => aff([71, 81]));
    assert.deepStrictEqual(screen().players.map(p => p.line), ['1 above your start', '3 below your start']);
    // player 1 comes down 2, player 2 comes down 5 and holds it
    play(env, 4, () => aff([68, 84]));
    play(env, 6, () => aff([68, 79]));
    s = screen();
    assert.strictEqual(m.round.step, 'done');
    assert.deepStrictEqual(plain(m.round.result).outcome, 'first');
    assert.strictEqual(m.round.result.winner, 1);
    assert.strictEqual(s.result.title, 'Player 2 calmed down first');
    assert.ok(/^5 below their start after (11|12) seconds, and stayed there\. Nicely done, both of you\.$/.test(s.result.text), s.result.text);
    assert.deepStrictEqual(s.button, { label: 'Play again', enabled: true });

    // fair between a resting 58 and a resting 84: the start is each player's own
    const { roundBegin, roundStep } = D;
    let r = roundBegin();
    for (let t = 0; t < 10000; t += 50) r = roundStep(r, [58, 84], 50);
    for (let t = 0; t < 6000; t += 50) r = roundStep(r, [57, 79], 50);
    assert.deepStrictEqual([r.step, r.result.winner], ['done', 1], 'the lower pulse does not win by itself');
  },

  'g: nobody there in 30 s: the bigger drop wins; a tie; a clip without readings cannot win; a clip lost while settling'() {
    const { D } = duel(), { roundBegin, roundStep, ROUND } = D;
    const go = (startBpm, raceBpm) => {
      let r = roundBegin();
      for (let t = 0; t < ROUND.SETTLE_MS; t += 50) r = roundStep(r, startBpm, 50);
      for (let t = 0; t < ROUND.RACE_MS + 100 && r.step === 'race'; t += 50) r = roundStep(r, raceBpm(t), 50);
      return r;
    };
    let r = go([72, 80], () => [70, 77]);
    assert.deepStrictEqual(plain(r.result), { outcome: 'most', winner: 1, drops: [2, 3], coverage: [1, 1] });
    assert.strictEqual(D.screen({ enabled: true, link: 'connected', views: [{ state: 'live', bpm: 70 }, { state: 'live', bpm: 77 }], people: D.peopleCreate(), round: r }).result.title, 'Player 2 calmed down the most');
    r = go([72, 80], () => [70, 78]);
    assert.deepStrictEqual([r.result.outcome, r.result.winner], ['tie', null]);
    r = go([72, 80], t => [t < 10000 ? 72 : null, 79]);
    assert.deepStrictEqual([r.result.outcome, r.result.winner], ['no-contest', 1], 'a third of the round is not enough to be counted');
    r = go([72, 80], () => [null, null]);
    assert.strictEqual(r.result.outcome, 'no-data');
    // a clip lost while the start is measured: back to the start screen, saying which
    r = roundBegin();
    for (let t = 0; t < ROUND.SETTLE_MS; t += 50) r = roundStep(r, [t < 3000 ? 72 : null, 80], 50);
    assert.deepStrictEqual([r.step, plain(r.lost)], ['ready', [true, false]]);
    const s = D.screen({ enabled: true, link: 'connected', views: [{ state: 'none', bpm: null }, { state: 'live', bpm: 80 }], people: D.peopleCreate(), round: r });
    assert.ok(s.phase.text.startsWith('Clip 1 lost the reading while measuring the start.'), s.phase.text);
    assert.deepStrictEqual(plain(s.button), { label: 'Waiting for the other heart', enabled: false });
  },

  'h: nothing from a duel is stored: no session, no hub message, no browser storage, no vitals for the Signals sheet'() {
    const storage = new Map([['afferent.settings', '{"sound":true}']]);
    const env = duel({ storage }), { A, S, D, m } = env;
    const sent = [];
    A.bus.on('ws', x => sent.push(x));
    const before = [...storage.entries()];
    connect(S);
    play(env, 3, () => aff([70, 84], { two_hearts: true }));
    D.start(m);
    play(env, 30, t => aff([70, t < 12 ? 84 : 78], { two_hearts: true }));
    assert.strictEqual(m.round.step, 'done');
    assert.deepStrictEqual([...storage.entries()], before, 'nothing written to the browser storage');
    assert.deepStrictEqual(sent, [], 'nothing sent to the hub');
    assert.deepStrictEqual([A.session ?? null, A.lastVitals ?? null], [null, null]);
    for (const f of ['duel-core.js', 'duel.js']) {
      const src = read(JS, f);
      for (const w of ['localStorage', 'sessionStorage', 'indexedDB', "emit('ws'", 'A.Hub', 'A.Record', 'fetch(', 'WebSocket', 'lastVitals', 'feedPulse', 'startSession']) {
        assert.ok(!src.includes(w), `${f} uses ${w}`);
      }
    }
  },

  'i: two people on the clips during a session: the finger data stays out of the session record, as in the hub'() {
    const { A, S, tick } = duel();
    S.enabled.simulator = false;
    connect(S);
    const feed = () => { S.feedFingerBle({ kind: 'hrm', bpm: 77, t_ms: Date.now() }); S.feedFingerBle(aff([64, 92], { two_hearts: true })); };
    feed();
    assert.deepStrictEqual([S.fingerFrame(A.now()), plain(S.pulse(A.now()))], [null, { bpm: null, quality: null, source: null }]);
    const s = A.startSession({ clock: 'morning', input: 'touch', stage: true, profile: 'live' });
    run(A, tick, s, 8, null, feed);
    let doc = null;
    A.bus.on('sessionEnd', d => { doc = d; });
    s.finish('partial');
    doc = plain(doc);
    const v = doc.vitals || {};
    assert.deepStrictEqual([v.finger ?? null, v.pulse_mean_bpm ?? null, v.breathing ?? null, v.hrv ?? null], [null, null, null, null], 'no finger rows, no pulse');
    // the same packets from one person are used as before
    const one = duel();
    one.S.enabled.simulator = false;
    connect(one.S);
    one.S.feedFingerBle({ kind: 'hrm', bpm: 77, t_ms: Date.now() });
    one.S.feedFingerBle(aff([76, 78], { two_hearts: false }));
    assert.strictEqual(one.S.pulse(one.A.now()).bpm, 77);
    assert.strictEqual(one.S.fingerFrame(one.A.now()).finger_bpm[1], 78);
  },

  'j: never inside a session'() {
    const { A, D } = duel();
    assert.strictEqual(D.allowed(), true);
    const s = A.startSession({ clock: 'morning', input: 'touch', stage: true, profile: 'live' });
    A.session = s;
    assert.strictEqual(D.allowed(), false);
    s.finish('partial');
    assert.strictEqual(D.allowed(), true, 'a finished session does not block it');
    const shell = read(JS, 'gui', 'shell.js'), duelJs = read(JS, 'duel.js');
    assert.ok(/title: 'Together'[^\n]*\n[^\n]*label: 'Heart Duel'[^\n]*data-duel/.test(shell), 'Settings has the Heart Duel row');
    assert.ok(duelJs.includes("type === 'session_start'"), 'a session that starts closes the duel');
    assert.ok(duelJs.includes('D.allowed()'), 'the duel does not open during a session');
  },

  'k: kind and honest words'() {
    const text = ['duel-core.js', 'duel.js'].map(f => (read(JS, f).match(/'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`/g) || []).join('\n')).join('\n');
    const unkind = text.match(/\b(stress\w*|diagnos\w*|loser|loses?|lost the game|fail\w*|wrong|bad|normal|abnormal|healthy|unhealthy|patient)\b/gi);
    assert.strictEqual(unkind, null, `the duel says: ${unkind}`);
    const duelJs = read(JS, 'duel.js');
    assert.ok(duelJs.includes('A party game, not a measurement.') && duelJs.includes('Nothing from the duel is saved or sent'), 'the screen says the duel is not stored');
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
