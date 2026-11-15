// Run: node demo/tests/faceplay.test.js
// The game reads what the face did (engine.js byFace), as it reads the pulse, HRV and breathing: smiling clearly more
// than this person's own share in the session (bright: puzzles), or a face much stiller than its own (still: livelier
// games by day). Only where the body has not decided. Pulse and HRV come from the finger clips over Bluetooth, the face
// seconds from the face half of a fake AfferentPulse plugin, once a simulated second. All numbers are test inputs,
// not measurements.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
const { load, run, plain, JS } = require('./harness');

const hrm = bpm => ({ kind: 'hrm', bpm, t_ms: Date.now() });
const aff = (bpm, o = {}) => ({ kind: 'aff1', finger_bpm: [bpm, bpm + 1], breathing_per_min: 12, rmssd_ms: 45, quality: 0.8, presence: 'active', payload_len: 6, t_ms: Date.now(), ...o });
const clips = (A, bpm, o) => { A.Sensors.feedFingerBle(hrm(bpm)); A.Sensors.feedFingerBle(aff(bpm, o)); };
const REST = { rmssd_ms: 45, breathing_per_min: 12 };
const FACE_SIG = ['smile_share_now', 'smile_share_own', 'movement_now', 'movement_own'];
const OLD_SIG = ['breathing_delta', 'breathing_own_per_min', 'breathing_per_min', 'pulse_bpm', 'pulse_rest_bpm', 'rmssd_ms', 'rmssd_own_ms', 'rmssd_ratio'];
const bare = sig => Object.fromEntries(Object.entries(sig).filter(([k]) => !FACE_SIG.includes(k)));

// One face second. The usual face: no smile over the 0.04 threshold, facial movement 0.03.
const sec = (o = {}) => ({ t_ms: Date.now(), tracked: true, smile: 0.01, movement: 0.03, blinks: 0, gaze_away: 0, distance_cm: 32, breathing_per_min: null, breathing_snr: null, ...o });
const look = {
  usual: () => sec(),
  smiling: () => sec({ smile: 0.3 }),
  every: k => i => sec({ smile: i % k === 0 ? 0.3 : 0.01 }),
  some: (n, k) => i => sec({ smile: i % k < n ? 0.3 : 0.01 }),
  moving: movement => () => sec({ movement }),
};

// A staged session with the clips connected and, unless face is false, the face measures tracking. first: the plugin's
// start state ('unavailable': a phone without the TrueDepth camera). Without the plugin face seconds go to
// A.Sensors.feedFace, which drops them, as it does in a browser.
const session = async ({ clock = 'morning', face = true, first = null } = {}) => {
  const t = load(face ? { face: true } : {}), { A, tick } = t, G = A.MINIGAMES, breath = G.breath;
  delete G.breath; G.breath = breath;
  A.PUZZLES = ['constellation'];
  A.Sensors.setFingerLink('connected', 'Afferent Finger');
  if (face) {
    if (first) t.facePlugin.first = first;
    await A.Face.sync();
    if (!first) t.facePlugin.emit('faceState', { state: 'tracking' });
  }
  const s = A.startSession({ clock, input: 'touch', stage: true, profile: 'live' });
  s.slots = { fork: -1, lanterns: -1 };
  const ws = [], lights = [];
  A.bus.on('ws', m => { if (m.type === 'mode') ws.push(plain(m)); });
  A.bus.on('light', l => { if (l.reason === 'mode') lights.push(plain(l)); });
  const show = f => t.facePlugin ? t.facePlugin.emit('face', f) : A.Sensors.feedFace(f);
  // seconds of play: the clips at bpm (none when null) and a face second from face(i) (none when null)
  const play = (seconds, bpm, o, face, drowsy = 0) => run(A, tick, s, seconds, () => { A.Sim.drowsy = drowsy; }, i => {
    if (bpm != null) clips(A, bpm, o);
    if (face) show(face(i));
  });
  return { ...t, s, ws, lights, play, last: () => plain(s.transitions[s.transitions.length - 1]), states: () => s.transitions.map(x => x.state) };
};
// 25 s near the rest pulse (68 in the harness config): this session's own HRV and its own face (20 seconds needed).
const settle = (t, face = look.usual) => {
  t.play(25, 68, REST, face);
  assert.ok(t.s.base.rmssd.length >= 5, JSON.stringify(t.s.base));
  if (t.A.Sensors.faceOn()) assert.ok(t.s.faceBase.smile.length >= 20 && t.s.faceBase.movement.length >= 20, JSON.stringify(t.s.faceBase));
};
const finish = (A, s) => { let doc = null; A.bus.on('sessionEnd', d => { doc = plain(d); }); s.finish('partial'); return doc; };
const livevitals = t => { vm.runInContext(fs.readFileSync(path.join(JS, 'livevitals.js'), 'utf8'), t.ctx, { filename: 'livevitals.js' }); return t.A.LiveVitals; };

const tests = {
  async 'no face: without the plugin, without the TrueDepth camera or with too few tracked seconds the games follow the body as before'() {
    // 50 s near rest with the usual face, then one that would read as bright if it were measured.
    const script = async (o, face, usual = look.usual) => {
      const t = await session(o);
      t.play(50, 68, REST, usual);
      t.play(12, 74, REST, face);
      t.play(14, 90, { rmssd_ms: 24, breathing_per_min: 17 }, face);
      t.play(16, 62, REST, face);
      return t;
    };
    const smiling = () => sec({ smile: 0.3, movement: 0.01 });
    const none = await script({ face: false }, smiling);
    const S = none.A.Sensors;
    assert.deepStrictEqual([S.faceState, S.faceLog.length, none.s.faceBase.smile.length], ['unavailable', 0, 0]);
    assert.ok(none.states().includes('steady') && none.states().includes('stressed'), none.states().join());
    assert.deepStrictEqual([none.s.mode, none.s.state], ['wake', 'low']);
    for (const tr of none.s.transitions) assert.deepStrictEqual(Object.keys(tr.signals).sort(), OLD_SIG, 'the eight numbers of before, no face key');
    const doc = finish(none.A, none.s);
    assert.ok(!/smile|movement/.test(JSON.stringify(doc.adaptive)), 'no face number in the record');

    const noDepth = await script({ first: 'unavailable' }, smiling);
    // tracked only every other second: at most 11 of the last 20, under the 12 needed, yet own values from 50 s
    let k = 0;
    const blurry = await script({}, () => sec({ tracked: k++ % 2 === 0, smile: 0.3, movement: 0.01 }), () => sec({ tracked: k++ % 2 === 0 }));
    // the pulse never near rest: no own face values to compare with
    const noOwn = await session();
    noOwn.play(40, 74, REST, smiling);
    assert.deepStrictEqual([noOwn.s.state, noOwn.s.faceBase.smile.length, noOwn.last().signals.smile_share_own], ['steady', 0, null]);
    assert.strictEqual(plain(noOwn.s.signals()).smile_share_now, 1, 'the face is read, but there is nothing of its own to compare with');

    const view = t => plain(t.s.transitions).map(x => { const { fatigue, signals, ...rest } = plain(x); return { ...rest, signals: bare(signals) }; });
    const live = t => t.ws.map(({ fatigue, ...m }) => m);
    assert.deepStrictEqual(view(noDepth), view(none));
    assert.deepStrictEqual(view(blurry), view(none));
    assert.deepStrictEqual(live(noDepth), live(none));
    assert.deepStrictEqual(live(blurry), live(none), 'the live message is the same, the face numbers stay out of it');
    for (const tr of noDepth.s.transitions) assert.deepStrictEqual(Object.keys(tr.signals).sort(), OLD_SIG, 'no TrueDepth: no face key');
    const b = blurry.last().signals;
    assert.deepStrictEqual([b.smile_share_now, b.movement_now, b.smile_share_own, b.movement_own], [null, null, 0, 0.03], 'the face is on, so its numbers are there');
  },

  async 'bright: smiling clearly more than usual with the pulse steady prefers puzzles, and the change is kept with what the face did'() {
    const t = await session(), { s, A } = t;
    settle(t);
    t.play(8, 74, REST, look.usual);
    assert.deepStrictEqual([s.mode, s.state], ['flow', 'steady']);
    assert.strictEqual(s.pick('flow').id, 'threads', 'steady: no preference, the first flow game');
    const own = s.faceBase.smile.length;
    t.play(20, 74, REST, look.smiling);
    assert.strictEqual(s.faceBase.smile.length, own, 'own values are taken near the rest pulse only');
    assert.deepStrictEqual([s.mode, s.state], ['flow', 'bright']);
    const tr = t.last();
    assert.deepStrictEqual([tr.from, tr.to, tr.state, tr.basis, tr.reasons, tr.hrv_source], ['flow', 'flow', 'bright', 'face', ['smiling'], 'finger_ppg']);
    assert.deepStrictEqual([tr.signals.smile_share_own, tr.signals.movement_now, tr.signals.movement_own, tr.signals.pulse_bpm], [0, 0.03, 0.03, 74]);
    assert.ok(tr.signals.smile_share_now >= 0.25 && tr.signals.smile_share_now < 0.5, `taken soon after the smiling began: ${tr.signals.smile_share_now}`);
    assert.ok(Object.values(tr.signals).every(v => v === null || typeof v === 'number'), JSON.stringify(tr.signals));
    assert.strictEqual(plain(s.signals()).smile_share_now, 1);
    assert.strictEqual(s.pick('flow').id, 'constellation');
    assert.strictEqual(s.planTask(A.now()).id, 'constellation');

    const msg = t.ws[t.ws.length - 1];
    assert.deepStrictEqual([msg.mode, msg.state, msg.basis, msg.reasons], ['flow', 'bright', 'face', ['smiling']]);
    assert.deepStrictEqual(msg.signals, bare(tr.signals), 'the live message carries the reading without the face numbers');
    assert.ok(!/smile|movement/.test(JSON.stringify(t.ws)), 'no face number in any live message');
    const doc = finish(A, s);
    assert.deepStrictEqual(doc.adaptive.transitions[doc.adaptive.transitions.length - 1], tr, 'the session document has them');
  },

  async 'bright needs more than the own share: smiling as much as usual is not bright, whatever the share'() {
    const t = await session(), { s } = t;
    settle(t, look.every(3));
    const own = plain(s.signals()).smile_share_own;
    assert.ok(own > 0.3 && own < 0.4, `own share ${own}`);
    t.play(30, 74, REST, look.some(2, 5));
    const now = plain(s.signals()).smile_share_now;
    assert.ok(now >= 0.35 && now < own + 0.15, `${now}: over the 25% floor, under own + 15 points`);
    assert.strictEqual(s.state, 'steady');
    t.play(25, 74, REST, look.smiling);
    assert.deepStrictEqual([s.state, t.last().signals.smile_share_own], ['bright', own]);
  },

  async 'still in the morning: much less facial movement than usual gives livelier games and brighter light'() {
    const t = await session(), { s, A } = t;
    settle(t);
    t.play(20, 74, REST, look.moving(0.012));
    assert.deepStrictEqual([s.mode, s.state], ['wake', 'still']);
    const tr = t.last();
    assert.deepStrictEqual([tr.from, tr.to, tr.state, tr.basis, tr.reasons], ['flow', 'wake', 'still', 'face', ['face_still']]);
    assert.deepStrictEqual([tr.signals.movement_own, tr.signals.smile_share_now, tr.signals.smile_share_own], [0.03, 0, 0]);
    assert.ok(tr.signals.movement_now <= 0.018, tr.signals.movement_now);
    assert.deepStrictEqual(t.lights[t.lights.length - 1], { rgb: '#DDEBFF', level: 20, fade_ms: 2000, reason: 'mode' });
    const next = s.planTask(A.now());
    assert.ok(A.MINIGAMES[next.id].modes.includes('wake'), next.id);
  },

  async 'still at night: the usual flow games, never wake'() {
    const t = await session({ clock: 'night' }), { s } = t;
    settle(t);
    t.play(20, 74, REST, look.moving(0.012));
    assert.deepStrictEqual([s.mode, s.state], ['flow', 'still']);
    assert.deepStrictEqual([t.last().from, t.last().to, t.last().basis], ['flow', 'flow', 'face']);
    assert.ok(!s.transitions.some(x => x.to === 'wake'));
  },

  async 'still needs less smiling too: a still face that smiles as usual is not still'() {
    const t = await session(), { s } = t;
    settle(t, look.every(4));
    t.play(25, 74, REST, i => sec({ smile: i % 4 === 0 ? 0.3 : 0.01, movement: 0.012 }));
    assert.strictEqual(s.state, 'steady');
    t.play(25, 74, REST, look.moving(0.012));
    assert.strictEqual(s.state, 'still');
  },

  async 'the body first: stressed, energised and a raised pulse without HRV beat the face, and so does their reading held without a pulse'() {
    let t = await session();
    settle(t);
    t.play(15, 90, { rmssd_ms: 24, breathing_per_min: 17 }, look.smiling);
    assert.deepStrictEqual([t.s.mode, t.s.state, t.last().basis], ['calm', 'stressed', 'hrv']);
    assert.strictEqual(t.s.pick('calm').id, 'breath');
    const n = t.s.transitions.length;
    t.play(20, null, null, look.smiling);
    assert.strictEqual(t.s.pulseNow, null);
    assert.deepStrictEqual([t.s.mode, t.s.state, t.s.transitions.length], ['calm', 'stressed', n], 'no pulse: the stressed reading holds, the face does not take over');

    t = await session();
    settle(t);
    t.play(15, 90, { rmssd_ms: 47, breathing_per_min: 13 }, look.moving(0.01));
    assert.deepStrictEqual([t.s.mode, t.s.state, t.last().basis], ['flow', 'energised', 'hrv']);
    assert.ok(!t.states().includes('still'), t.states().join());

    t = await session();
    settle(t, look.usual);
    t.play(15, 90, { rmssd_ms: 0, breathing_per_min: 0 }, look.smiling);
    assert.deepStrictEqual([t.s.mode, t.s.state], ['calm', 'pulse_up']);
    assert.ok(!t.states().includes('bright'), t.states().join());
  },

  async 'tired eyes beat the face, by day and at night'() {
    for (const [clock, mode] of [['morning', 'fatigue'], ['night', 'rest']]) {
      const t = await session({ clock }), { s } = t;
      settle(t);
      t.play(20, 74, REST, look.smiling);
      assert.strictEqual(s.state, 'bright', clock);
      t.play(30, 74, REST, look.smiling, 1);
      assert.deepStrictEqual([s.mode, s.state, t.last().basis, t.last().reasons], [mode, 'tired', 'eyes', ['eyes_tired']], clock);
      assert.strictEqual(s.byFace(plain(s.signals()))?.state, 'bright', 'the face still reads bright; the eyes come first');
    }
  },

  async 'no pulse: the face decides, and a face reading is not held once the face stops showing it'() {
    const t = await session(), { s } = t;
    settle(t);
    t.play(20, null, null, look.smiling);
    assert.deepStrictEqual([s.pulseNow, s.mode, s.state, t.last().reasons], [null, 'flow', 'bright', ['smiling']]);
    t.play(30, null, null, look.usual);
    assert.deepStrictEqual([s.mode, s.state, t.last().basis, t.last().reasons], ['flow', 'unknown', 'none', ['no_pulse']]);
  },

  async 'hysteresis: a share at the threshold neither flips the games in nor out, and the state leaves once the face does'() {
    // The same face (smiling one second in five, about 20%) keeps the state it finds: under the 25% to enter, over
    // the 5% to stay. Own share 0.
    const t = await session(), { s } = t;
    settle(t);
    const n0 = s.transitions.length, shares = [];
    const fifth = i => { shares.push(plain(s.signals()).smile_share_now); return look.every(5)(i); };
    t.play(30, 74, REST, fifth);
    assert.deepStrictEqual([s.state, s.transitions.length], ['steady', n0], 'not in');
    t.play(15, 74, REST, look.smiling);
    assert.strictEqual(s.state, 'bright');
    const n = s.transitions.length;
    t.play(40, 74, REST, fifth);
    assert.deepStrictEqual([s.state, s.transitions.length], ['bright', n], 'not out');
    const late = shares.slice(-20);
    assert.ok(late.every(x => x >= 0.05 && x < 0.25), `between the bounds: ${late}`);
    t.play(30, 74, REST, look.usual);
    assert.deepStrictEqual([s.state, s.transitions.length, t.last().reasons], ['steady', n + 1, ['pulse_steady']]);

    // the same for a still face: in at 60% of the own movement, held up to 75%
    t.play(30, 74, REST, look.moving(0.02));
    assert.deepStrictEqual([s.state, s.transitions.length], ['steady', n + 1], '0.02 is 67% of 0.03: not in');
    t.play(20, 74, REST, look.moving(0.012));
    assert.strictEqual(s.state, 'still');
    const m = s.transitions.length;
    t.play(30, 74, REST, look.moving(0.02));
    assert.deepStrictEqual([s.state, s.transitions.length], ['still', m], 'held at 67%');
    t.play(30, 74, REST, look.usual);
    assert.deepStrictEqual([s.mode, s.state, s.transitions.length], ['flow', 'steady', m + 1]);
  },

  async 'live vitals say what the face did and what the game does about it, in words'() {
    const t = await session(), { s, A } = t, L = livevitals(t);
    settle(t);
    t.play(20, 74, REST, look.smiling);
    const m = plain(L.model(s, A.now()));
    assert.deepStrictEqual([m.state.id, m.state.label, m.why], ['bright', 'Smiling', 'Smiling more than usual → puzzles']);
    assert.ok(!/smile_share|movement/.test(JSON.stringify(m)), 'no face number on the pill');
    const tr = (state, to, reasons) => L.reason({ state, to, reasons });
    assert.strictEqual(tr('still', 'wake', ['face_still']), 'Face stiller than usual → livelier games, brighter light');
    assert.strictEqual(tr('still', 'flow', ['face_still']), 'Face stiller than usual → the usual mix of games');
    Object.assign(s, { state: 'still', mode: 'wake' });
    assert.strictEqual(L.model(s, A.now()).state.label, 'Face still');
  },

  async 'every face reading the engine records fits the session contract'() {
    const schema = JSON.parse(fs.readFileSync(path.join(JS, '..', '..', 'contracts', 'session.v3.schema.json'), 'utf8'));
    const T = schema.$defs.adaptive.properties.transitions.items.properties;
    const seen = [];
    for (const clock of ['morning', 'night']) {
      const t = await session({ clock });
      settle(t);
      t.play(20, 74, REST, look.smiling);
      t.play(30, 74, REST, look.moving(0.012));
      seen.push(...t.s.transitions.map(x => plain(x)));
    }
    assert.ok(['bright', 'still'].every(x => seen.some(tr => tr.state === x)), seen.map(x => x.state).join());
    for (const tr of seen) {
      assert.ok(T.state.enum.includes(tr.state) && T.basis.enum.includes(tr.basis), `${tr.state} ${tr.basis}`);
      assert.ok(tr.reasons.every(r => T.reasons.items.enum.includes(r)), tr.reasons.join());
      assert.ok(Object.keys(tr.signals).every(k => k in T.signals.properties), Object.keys(tr.signals).join());
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
