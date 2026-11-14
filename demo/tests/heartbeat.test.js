// Run: node demo/tests/heartbeat.test.js
// The live heartbeat and the calm response (heartbeat.js): the fire beats only at a real pulse, the calm glow follows real
// breathing and RMSSD relative to the session's own start, and nothing of it is recorded or sent. All numbers are test inputs.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { load, run, plain, JS } = require('./harness');

const hrm = (bpm = 72) => ({ kind: 'hrm', bpm, t_ms: Date.now() });
const aff = (o = {}) => ({ kind: 'aff1', finger_bpm: [71, 73], breathing_per_min: 6, rmssd_ms: 46, quality: 0.8, presence: 'active', payload_len: 6, t_ms: Date.now(), ...o });
const connect = A => A.Sensors.setFingerLink('connected', 'Afferent Finger');
const clips = (A, o = {}, bpm = 72) => { A.Sensors.feedFingerBle(hrm(bpm)); A.Sensors.feedFingerBle(aff(o)); };
const cam = (A, o = {}) => A.Sensors.feedNativePulse({ source: 'rppg', bpm: 66, quality: 0.6, face: true, trust: { score: 80, label: 'reliable', reasons: [] }, ...o });
const hubFrame = (o = {}) => ({
  type: 'physio', source: 'finger_ppg', transport: 'hub_http', simulated: false, pulse_bpm: 72, quality: 0.7, quality_reported: true, contact: true,
  finger_bpm: [71, 73], breathing_per_min: 6, rmssd_ms: 46, sdnn_ms: 40, rmssd_vs_baseline: 0, presence: 'active', age_s: 0.4, ...o,
});
const read = f => fs.readFileSync(path.join(JS, f), 'utf8');
const seeded = fn => {
  const random = Math.random;
  let seed = 4242;
  Math.random = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
  try { return fn(); } finally { Math.random = random; }
};

// Steps heartbeat.js on its own for `seconds` at 20 frames a second, as main.js does on the home screen (s = null) or as
// engine.js does in a session (s, here a plain object with the fields heartbeat.js reads). `second(i)` runs once a second
// before that second's frames; `each` gets the beat state and a painted visual state after every frame.
const steps = (t, seconds, { s = null, second, each } = {}) => {
  const { A, tick } = t, H = A.Heartbeat;
  for (let i = 0; i < seconds * 20; i++) {
    if (i % 20 === 0) second?.(i / 20);
    tick(0.05);
    const r = H.step(A.now(), 0.05, s), V = { lanternBright: 1, lanternRadius: 70 };
    H.paint(V, 1);
    each?.(r, V, i);
  }
};
const calm = (o = {}) => ({ profile: 'live', auto: false, done: false, phase: 'game', mode: 'calm', gameMode: 'calm', game: { id: 'stars' }, ...o });
const lubs = (t, seconds, opts = {}) => { let n = 0; steps(t, seconds, { ...opts, each: r => { if (r.lub) n++; } }); return n; };

const tests = {
  'a: no reading, no beat: the fire only breathes slowly, at home and in a session on the simulator'() {
    const t = load(), { A } = t, H = A.Heartbeat;
    const flames = [];
    steps(t, 20, { each: (r, V) => { assert.ok(!r.lub); assert.strictEqual(H.st.beat, 0); flames.push(V.flame); } });
    assert.deepStrictEqual(plain(A.Biofeedback), { level: null, beat: false, calm: false });
    const steepest = Math.max(...flames.slice(1).map((f, i) => Math.abs(f - flames[i])));
    assert.ok(Math.max(...flames) - Math.min(...flames) < 0.06 && steepest < 0.002, `a slow breath, never a beat (steepest ${steepest})`);

    // The simulator is on by default, so a live session without clips runs on a simulated pulse: it must not beat.
    const s = A.session = A.startSession({ clock: 'morning', input: 'touch', stage: true, profile: 'live' });
    const before = H.st.lubs;
    run(t.A, t.tick, s, 30, () => assert.strictEqual(H.st.beat, 0));
    assert.strictEqual(A.Sensors.pulse(A.now()).source, 'simulated');
    assert.strictEqual(H.st.lubs, before, 'no beat from a simulated pulse in a live session');
    assert.strictEqual(A.Biofeedback.beat, false);
    assert.ok(!/kick\(0\.03\)/.test(read('engine.js')), 'the fixed once-a-second beat is gone');
  },

  'b: the clips give a pulse: the fire takes it up at once, at that rate, with one wave of light and a few stronger first beats'() {
    const t = load(), { A, ctx } = t, H = A.Heartbeat, rings = [];
    ctx.A.World = { hooks: { heartRing: a => rings.push(a) } };
    connect(A);
    steps(t, 3);
    assert.strictEqual(H.st.lubs, 0, 'connected, no finger yet: nothing');
    let first = null, early = 0, late = 0;
    steps(t, 20, {
      second: () => clips(A, {}, 72),
      each: (r, V, i) => {
        if (r.lub && first === null) first = i;
        const k = V.lanternBright - 1 - 0.06 * H.st.breathe;
        if (i < 40) early = Math.max(early, k); else if (i > 200) late = Math.max(late, k);
      },
    });
    assert.strictEqual(first, 0, 'the first beat lands with the first reading');
    assert.ok(Math.abs(H.st.lubs - 24) <= 1, `72 a minute for 20 s, got ${H.st.lubs}`);
    assert.deepStrictEqual(rings, [1], 'one wave of light when the pulse first appears, not one per beat');
    assert.ok(late > 0.45 && late < 0.7, `a beat you see at a glance: ${late}`);
    assert.ok(early > 1.6 * late, `the first beats are stronger: ${early} vs ${late}`);
    assert.strictEqual(A.Biofeedback.beat, true);

    steps(t, 10, { second: () => clips(A, {}, 54) });
    assert.ok(Math.abs(H.st.bpm - 54) < 0.5, 'follows the reading');
    const n = lubs(t, 10, { second: () => clips(A, {}, 54) });
    assert.ok(Math.abs(n - 9) <= 1, `54 a minute, got ${n}`);
    assert.deepStrictEqual(rings, [1], 'still one wave: the pulse never went away');
  },

  'c: the gate of breathing.js: no finger, quality under 0.3 or not reported, a simulated hub frame, a stale frame, the switch off'() {
    const cases = {
      'no finger in the clip': A => { connect(A); clips(A, { presence: 'idle' }); },
      'probing': A => { connect(A); clips(A, { presence: 'probing' }); },
      'quality 0.29': A => { connect(A); clips(A, { quality: 0.29 }); },
      'quality not reported (4-byte firmware)': A => { connect(A); clips(A, { quality: null, presence: null, payload_len: 4 }); },
      'only the heart rate notification': A => { connect(A); A.Sensors.feedFingerBle(hrm(72)); },
      'the hub simulator': A => A.Sensors.feedFingerHub(hubFrame({ source: 'simulated', simulated: true })),
      'hub heartbeats 45 s old': A => A.Sensors.feedFingerHub(hubFrame({ age_s: 45 })),
      'an implausible rate': A => { connect(A); clips(A, {}, 220); },
      'pulse stone off': A => { A.Sensors.enabled.pulse_stone = false; connect(A); clips(A); },
    };
    for (const [name, feed] of Object.entries(cases)) {
      const t = load();
      assert.strictEqual(lubs(t, 6, { second: () => feed(t.A) }), 0, name);
      assert.strictEqual(t.A.Biofeedback.beat, false, name);
      if (name !== 'an implausible rate') assert.strictEqual(t.A.Biofeedback.level, null, name);
    }
    const t = load(), { A } = t, H = A.Heartbeat;
    connect(A); clips(A, { quality: 0.3 });
    steps(t, 2.5);
    assert.ok(H.st.lubs >= 3 && A.Biofeedback.beat, 'quality 0.3 counts, as in breathing.js');
    steps(t, 1);
    assert.strictEqual(A.Biofeedback.beat, false, 'older than 3 s: no longer a reading');
    steps(t, 8);
    assert.deepStrictEqual([H.st.bpm, H.st.beat], [null, 0], 'the beat fades out and stops; it is not carried on as a guess');
  },

  'd: a trusted camera pulse beats the fire too, with the same quality rule'() {
    const ok = load();
    assert.ok(lubs(ok, 10, { second: () => cam(ok.A) }) >= 10, 'rppg, trusted, quality 0.6');
    for (const [name, o] of Object.entries({ 'quality 0.2': { quality: 0.2 }, 'no quality': { quality: null }, 'low trust': { trust: { score: 30, label: 'uncertain', reasons: [] } }, 'unreliable': { trust: { score: 70, label: 'unreliable', reasons: [] } } })) {
      const t = load();
      assert.strictEqual(lubs(t, 6, { second: () => cam(t.A, o) }), 0, name);
    }
    const off = load();
    off.A.Sensors.enabled.phone_camera = false;
    assert.strictEqual(lubs(off, 6, { second: () => cam(off.A) }), 0, 'camera switched off');
  },

  'e: in a simulation the simulated pulse may move the fire, but it is never a reading and never felt'() {
    const t = load(), { A } = t, H = A.Heartbeat, calls = [];
    t.ctx.Capacitor = { isNativePlatform: () => true, Plugins: { AfferentHaptics: { beat: async o => calls.push(o) } } };
    for (const s of [calm({ profile: 'good_day' }), calm({ profile: 'bad_day' }), calm({ auto: true })]) {
      const n = lubs(t, 10, { s });
      assert.ok(n >= 9, `${s.profile}${s.auto ? ', autoplay' : ''}: the flame may follow the simulator (${n})`);
      assert.deepStrictEqual(plain(A.Biofeedback), { level: null, beat: false, calm: false });
    }
    assert.deepStrictEqual(calls, [], 'no vibration from a simulated pulse');
    const sim = load();
    assert.strictEqual(lubs(sim, 10, { s: calm() }), 0, 'the same calm moment in the live profile: no beat');
    assert.ok(/simulation = s => .*s\.profile !== 'live' \|\| !!s\.auto/.test(read('heartbeat.js')));
    assert.ok(H.st.sim);
  },

  'f: a session that started on the simulator: the fire takes up clips put on later, the record stays simulated'() {
    const t = load(), { A, tick, ctx } = t, H = A.Heartbeat, S = A.Sensors, rings = [];
    ctx.A.World = { hooks: { heartRing: a => rings.push(a) } };
    const s = A.session = A.startSession({ clock: 'morning', input: 'touch', stage: true, profile: 'live' });
    assert.strictEqual(S.pulseMode, 'simulated');
    run(A, tick, s, 6);
    assert.deepStrictEqual([H.st.lubs, A.Biofeedback.beat], [0, false], 'a simulated pulse in a live session: no beat');
    connect(A);
    let first = null, i = 0;
    run(A, tick, s, 10, () => { i++; if (first === null && H.st.lubs) first = i; }, () => clips(A));
    assert.ok(first <= 2 && H.st.lubs >= 11 && A.Biofeedback.beat, `clips put on mid-session: the fire takes them up at once (frame ${first}, ${H.st.lubs} beats)`);
    assert.deepStrictEqual(rings, [1], 'with the connect moment');
    run(A, tick, s, 4, () => assert.strictEqual(S.pulse(A.now()).source, 'simulated'), () => clips(A));
    let doc = null;
    A.bus.on('sessionEnd', d => { doc = d; });
    s.finish('partial');
    doc = plain(doc);
    assert.deepStrictEqual(Object.keys(s.sig.pulseSources), ['simulated'], 'the game pulse stays simulated to the end: never mixed');
    assert.deepStrictEqual([doc.signal.pulse_source, doc.signal.pulse_from_ms, doc.vitals.pulse_source, doc.simulated], ['simulated', null, 'simulated', true]);
    for (const f of ['signal.pulse_source', 'tasks.pulse', 'pre_post.pulse', 'vitals.pulse_mean_bpm']) assert.ok(doc.simulated_fields.includes(f), f);
    assert.strictEqual(doc.vitals.finger.source, 'finger_ppg', 'the finger block keeps what the clips measured, under its own source, as before');

    // The vibration follows the same rules there: a real pulse in a calm moment.
    const v = load(), calls = [];
    v.ctx.Capacitor = { isNativePlatform: () => true, Plugins: { AfferentHaptics: { beat: async o => calls.push(o) } } };
    v.A.Sensors.pulseMode = 'simulated';
    connect(v.A);
    steps(v, 6, { s: calm(), second: () => clips(v.A) });
    assert.ok(calls.length >= 6, `felt: ${calls.length}`);
  },

  'n: a session that started with no pulse at all takes up the clips when they come, and the record says from when'() {
    const t = load(), { A, tick, ctx } = t, H = A.Heartbeat, S = A.Sensors, rings = [];
    ctx.A.World = { hooks: { heartRing: a => rings.push(a) } };
    S.enabled.simulator = false;
    const s = A.session = A.startSession({ clock: 'morning', input: 'touch', stage: true, profile: 'live' });
    assert.strictEqual(S.pulseMode, 'real', 'the simulator is off: a session without a pulse source is a real one waiting for a reading');
    run(A, tick, s, 8);
    assert.deepStrictEqual([H.st.lubs, A.Biofeedback.beat, S.pulse(A.now()).bpm], [0, false, null], 'nothing to show, nothing guessed');
    connect(A);
    const at = A.now();
    run(A, tick, s, 12, null, () => clips(A, {}, 66));
    assert.ok(H.st.lubs >= 12 && A.Biofeedback.beat, 'the fire takes up the clips');
    assert.deepStrictEqual(rings, [1]);
    let doc = null;
    A.bus.on('sessionEnd', d => { doc = d; });
    s.finish('partial');
    doc = plain(doc);
    assert.deepStrictEqual(Object.keys(s.sig.pulseSources), ['finger_ppg'], 'the session pulse is the real one from then on');
    assert.strictEqual(doc.signal.pulse_source, 'finger_ppg');
    assert.ok(Math.abs(doc.signal.pulse_from_ms - (at - s.t0) * 1000) <= 100, `the record says when: ${doc.signal.pulse_from_ms} ms, clips at ${Math.round((at - s.t0) * 1000)}`);
    assert.strictEqual(doc.vitals.pulse_mean_bpm, 66);
    assert.ok(!doc.simulated_fields.some(f => /pulse/.test(f)), doc.simulated_fields.join());

    // Clips on from the start: the first reading is near the start of the session.
    const r = load();
    r.A.Sensors.enabled.simulator = false;
    connect(r.A); clips(r.A);
    const s2 = r.A.session = r.A.startSession({ clock: 'morning', input: 'touch', stage: true, profile: 'live' });
    run(r.A, r.tick, s2, 5, null, () => clips(r.A));
    assert.ok(s2.sig.pulseFromMs <= 2100, `from the end of the fade-in: ${s2.sig.pulseFromMs}`);
    const schema = JSON.parse(fs.readFileSync(path.join(JS, '..', '..', 'contracts', 'session.v3.schema.json'), 'utf8'));
    assert.deepStrictEqual(schema.$defs.signal.properties.pulse_from_ms.type, ['integer', 'null'], 'the contract knows the field');
  },

  'o: clips off and back on: no beat while they are off, the fire picks the pulse up again when they are back'() {
    const t = load(), { A, ctx } = t, H = A.Heartbeat, rings = [];
    ctx.A.World = { hooks: { heartRing: a => rings.push(a) } };
    connect(A);
    steps(t, 6, { second: () => clips(A) });
    assert.ok(A.Biofeedback.beat && rings.length === 1);
    // The finger leaves the clip: the sensor says so at once (presence idle).
    clips(A, { presence: 'idle' }, 0);
    let after = H.st.lubs, peak = 0;
    steps(t, 1, { second: () => clips(A, { presence: 'idle' }, 0) });
    assert.strictEqual(A.Biofeedback.beat, false);
    steps(t, 5, { second: () => clips(A, { presence: 'idle' }, 0), each: () => { peak = Math.max(peak, H.st.beat); } });
    assert.ok(H.st.lubs === after && peak < 0.005, `no beat while they are off (${H.st.lubs - after} beats, peak ${peak})`);
    assert.strictEqual(H.st.bpm, null);
    let first = null;
    steps(t, 5, { second: () => clips(A, {}, 64), each: (r, V, i) => { if (r.lub && first === null) first = i; } });
    assert.ok(first === 0 && Math.abs(H.st.lubs - after - 6) <= 1, `back on: at once, at the new pulse (${H.st.lubs - after} beats)`);
    assert.deepStrictEqual(rings, [1, 1], 'with the connect moment again');

    // The notifications stop (clips unplugged): the reading is stale after 3 s and the beat stops within a second.
    after = H.st.lubs;
    steps(t, 3.1);
    assert.strictEqual(A.Biofeedback.beat, false);
    const stale = H.st.lubs;
    steps(t, 4, { each: () => { peak = H.st.beat; } });
    assert.ok(H.st.lubs === stale && peak < 0.005, 'no beat while there is no reading');
    // A short gap of one or two missed notifications is not a new connection.
    steps(t, 4, { second: () => clips(A) });
    assert.deepStrictEqual(rings, [1, 1, 1]);
    steps(t, 2, { second: () => clips(A, { presence: 'idle' }, 0) });
    assert.strictEqual(A.Biofeedback.beat, false, 'a real two-second dropout');
    steps(t, 4, { second: () => clips(A) });
    assert.ok(A.Biofeedback.beat);
    assert.deepStrictEqual(rings, [1, 1, 1], 'a dropout under 3 s picks up again without replaying the connect moment');
  },

  'p: the camera pulse becoming trusted mid-session is taken up the same way'() {
    const t = load(), { A, tick, ctx } = t, H = A.Heartbeat, rings = [];
    ctx.A.World = { hooks: { heartRing: a => rings.push(a) } };
    const s = A.session = A.startSession({ clock: 'morning', input: 'touch', stage: true, profile: 'live' });
    run(A, tick, s, 5, null, () => cam(A, { trust: { score: 25, label: 'unreliable', reasons: [] } }));
    assert.deepStrictEqual([H.st.lubs, A.Biofeedback.beat], [0, false], 'not trusted yet');
    run(A, tick, s, 6, null, () => cam(A));
    assert.ok(H.st.lubs >= 6 && A.Biofeedback.beat && rings.length === 1);
  },

  'g: the calm glow follows the breathing pace and RMSSD relative to this session\'s own start, never a fixed number'() {
    // Fast shallow breathing, then slow steady breathing with RMSSD 30 % over the start value.
    const story = (rmssd0, rmssd1) => {
      const t = load(), { A } = t, s = calm({ game: { id: 'breath' } }), seen = {};
      connect(A);
      steps(t, 20, { s, second: () => clips(A, { breathing_per_min: 16, rmssd_ms: rmssd0 }) });
      seen.fast = A.Biofeedback.level; seen.fastGlow = A.Heartbeat.st.glow;
      steps(t, 40, { s, second: () => clips(A, { breathing_per_min: 6, rmssd_ms: rmssd1 }), each: (r, V) => { seen.V = V; } });
      seen.slow = A.Biofeedback.level;
      return { A, seen };
    };
    const { A, seen } = story(40, 52);
    assert.ok(seen.fast < 0.05, `16 a minute against a guide of 6, RMSSD at its start: no glow (${seen.fast})`);
    assert.ok(seen.slow > 0.9, `6 a minute and RMSSD up 30 %: full glow (${seen.slow})`);
    assert.ok(seen.V.bodyGlow > 0.9 && seen.V.lanternRadius > 70 * 1.35, 'the aurora and the lantern glow carry it');
    assert.deepStrictEqual([A.Heartbeat.st.rmssd0, A.Biofeedback.calm], [40, true]);
    const higher = story(60, 52).seen;
    assert.ok(Math.abs(higher.slow - 0.65) < 0.03, `the same RMSSD of 52 is below a start of 60: only the pace counts (${higher.slow})`);

    // The breathing value covers 40 s: one odd value moves the glow only a little.
    const t = load(), s = calm({ game: { id: 'breath' } });
    connect(t.A);
    steps(t, 40, { s, second: () => clips(t.A, { breathing_per_min: 6, rmssd_ms: 46 }) });
    const steady = t.A.Biofeedback.level;
    steps(t, 1, { s, second: () => clips(t.A, { breathing_per_min: 18, rmssd_ms: 46 }) });
    assert.ok(steady - t.A.Biofeedback.level < 0.1, `a pace, not a single breath: ${steady} -> ${t.A.Biofeedback.level}`);

    // No reading: nothing is shown, the glow fades back instead of keeping a guess.
    steps(t, 4, { s });
    assert.strictEqual(t.A.Biofeedback.level, null);
    steps(t, 10, { s });
    assert.ok(t.A.Heartbeat.st.glow < 0.05);
  },

  'h: the calm response shows only in calm moments, and the "Breathing pace" switch keeps breathing out of it'() {
    const level = (s, config = {}) => {
      const t = load();
      Object.assign(t.A.config, config);
      connect(t.A);
      steps(t, 30, { s, second: () => clips(t.A, { breathing_per_min: 6 }) });
      return [t.A.Biofeedback.level, t.A.Heartbeat.st.glow];
    };
    assert.ok(level(calm())[0] > 0.6, 'a calm game');
    assert.ok(level(calm({ phase: 'walk', game: null, gameMode: null }))[0] > 0.6, 'walking in calm mode');
    assert.ok(level(calm({ mode: 'rest', gameMode: 'rest', game: { id: 'breath' } }))[0] > 0.6, 'the breathing task at night');
    for (const s of [calm({ mode: 'flow', gameMode: 'flow', game: { id: 'threads' } }), calm({ gameMode: 'measure', game: { id: 'lanterns' } }), calm({ phase: 'rt' }), null]) {
      assert.deepStrictEqual(level(s), [0, 0], `not a calm moment: ${s ? s.gameMode ?? s.phase : 'home'}`);
    }
    assert.strictEqual(level(calm(), { breathFeedback: false })[0], 0, 'Breathing pace off, RMSSD flat: no response');
  },

  'i: the flame settles as the pulse falls below the session start, and only then'() {
    const settle = (from, to) => {
      const t = load(), s = calm();
      connect(t.A);
      steps(t, 10, { s, second: () => clips(t.A, {}, from) });
      let V = null;
      steps(t, 30, { s, second: () => clips(t.A, {}, to), each: (r, v) => { V = v; } });
      return V.settle;
    };
    assert.ok(settle(78, 70) > 0.9, 'eight beats a minute below the start');
    assert.ok(Math.abs(settle(78, 75) - 0.5) < 0.1, 'three below: half way');
    assert.strictEqual(settle(70, 78), 0, 'a rising pulse never shows as anything');
    assert.ok(/0\.085 \* calm \+ \(1 - calm\)/.test(read('world.js')), 'world.js steadies the flicker with it');
  },

  'j: the heartbeat touch: real pulse, calm moments, the exhale of the breathing task, the switch, and never over another vibration'() {
    const felt = (s, { config = {}, other = false, native = true } = {}) => {
      const t = load(), calls = [], vib = [];
      Object.assign(t.A.config, config);
      t.ctx.navigator.vibrate = ms => vib.push(ms);
      if (native) t.ctx.Capacitor = { isNativePlatform: () => true, Plugins: { AfferentHaptics: { beat: async o => calls.push(o) } } };
      connect(t.A);
      if (other) t.A.bus.emit('haptic', 'tick');
      steps(t, 10, { s, second: () => clips(t.A), each: () => { if (other) t.A.bus.emit('haptic', 'tick'); } });
      return { calls, vib, lubs: t.A.Heartbeat.st.lubs };
    };
    const on = felt(calm());
    assert.ok(on.calls.length >= 11 && on.calls.length === on.lubs, `one soft lub-dub per beat: ${on.calls.length}/${on.lubs}`);
    assert.ok(on.calls.every(c => c.strength > 0 && c.strength <= 0.6), 'soft');
    assert.strictEqual(felt(calm(), { config: { heartTouch: false } }).calls.length, 0, 'switched off');
    assert.strictEqual(felt(calm({ mode: 'flow', gameMode: 'flow', game: { id: 'threads' } })).calls.length, 0, 'not in other games');
    assert.strictEqual(felt(null).calls.length, 0, 'not on the home screen');
    assert.strictEqual(felt(calm({ game: { id: 'breath' }, orb: { inhale: true } })).calls.length, 0, 'not while the guide ticks the inhale');
    assert.ok(felt(calm({ game: { id: 'breath' }, orb: { inhale: false } })).calls.length >= 11, 'on the exhale');
    assert.strictEqual(felt(calm(), { other: true }).calls.length, 0, 'never on top of another vibration');
    const web = felt(calm(), { native: false });
    assert.ok(web.vib.length >= 11 && web.vib.every(ms => ms <= 6), 'without the native plugin: the lightest tick, as shell.js falls back');
    const swift = fs.readFileSync(path.join(JS, '..', '..', 'ios', 'App', 'App', 'AfferentHaptics.swift'), 'utf8');
    assert.ok(swift.includes('CAPPluginMethod(name: "beat"') && /@objc func beat\(/.test(swift), 'the iOS plugin has beat()');
    assert.ok(/hapticSharpness, value: 0\.12/.test(swift) && /hapticSharpness, value: 0\.06/.test(swift), 'low sharpness: a soft thud, never a buzz');
    assert.ok(!fs.readdirSync(path.join(JS, '..', '..', 'android', 'app', 'src', 'main', 'java', 'fi', 'junction', 'afferent')).some(f => /Haptic/.test(f)), 'Android has no haptics plugin, so it uses the fallback');
  },

  'k: Settings has a "Heartbeat touch" switch, on by default and saved'() {
    const ctx = { console, URLSearchParams, setTimeout: () => 0, clearTimeout: () => {}, location: { search: '' }, navigator: {},
      document: { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], addEventListener: () => {} } };
    ctx.window = ctx;
    vm.createContext(ctx);
    for (const f of ['util.js', 'gui/lantern.js', 'gui/shell.js']) vm.runInContext(read(f), ctx, { filename: f });
    const row = plain(ctx.A.Shell.groups).find(g => g.title === 'Sound and light').rows.find(r => r.sw === 'id="beatSw"');
    assert.strictEqual(row?.label, 'Heartbeat touch');
    const icons = fs.readFileSync(path.join(JS, '..', 'fonts', 'icon-names.txt'), 'utf8').split(',').map(x => x.trim());
    assert.ok(icons.includes(row.icon), `icon ${row.icon} is in the font subset`);
    const main = read('main.js');
    assert.ok(main.includes('heartTouch: saved.heartTouch ?? true') && main.includes('heartTouch: A.config.heartTouch'));
  },

  'l: nothing of it is recorded or sent: the session and every hub message are the same without heartbeat.js'() {
    const session = heartbeat => seeded(() => {
      const t = load({ heartbeat }), { A, tick } = t, sent = [];
      A.bus.on('ws', m => sent.push(JSON.stringify(m)));
      connect(A);
      const s = A.session = A.startSession({ clock: 'morning', input: 'touch', stage: true, profile: 'live' });
      s.slots = { fork: -1, lanterns: -1 };
      run(A, tick, s, 40, () => { if (s.T?.state === 'ready') s.handle('pdown', { x: 0, y: 0, t: A.now() }); }, i => { clips(A, { breathing_per_min: 6 + (i % 3) }, 70 - i % 4); cam(A); });
      let doc = null;
      A.bus.on('sessionEnd', d => { doc = d; });
      s.finish('partial');
      const strip = x => JSON.parse(JSON.stringify(x, (k, v) => k === 'started_iso' || k === 'local_hour' || k === 't_iso' ? undefined : v));
      return { doc: strip(doc), sent: sent.map(m => strip(JSON.parse(m))), lubs: A.Heartbeat?.st.lubs };
    });
    const with_ = session(true), without = session(false);
    assert.ok(with_.lubs > 30, 'the fire did beat in this session');
    assert.deepStrictEqual(with_.doc, without.doc);
    assert.deepStrictEqual(with_.sent, without.sent);
    const js = read('heartbeat.js');
    assert.strictEqual(/bus\.emit\('ws'|textContent|innerHTML|fetch\(|Hub\./.test(js), false, 'no words on screen, nothing sent');
  },

  'm: reduced motion: the light pool does not swell with the beat, the beat itself is half as strong'() {
    const peak = reduced => {
      const t = load();
      t.A.config.reducedMotion = reduced;
      connect(t.A);
      let r = 0, b = 0;
      steps(t, 20, { second: () => clips(t.A), each: (x, V, i) => { if (i > 200) { r = Math.max(r, V.lanternRadius / (70 * (1 + 0.04 * t.A.Heartbeat.st.breathe)) - 1); b = Math.max(b, V.lanternBright - 1); } } });
      return [r, b];
    };
    const [r0, b0] = peak(false), [r1, b1] = peak(true);
    assert.ok(r0 > 0.08 && r1 < 1e-9, `radius ${r0} / ${r1}`);
    assert.ok(Math.abs(b1 / b0 - 0.5) < 0.05, `brightness ${b0} / ${b1}`);
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
