// Run: node demo/tests/breathing.test.js
// Measured breathing next to the breathing guide: closeness, freshness, averaging, and the real breath task in the engine.
// All numbers are test inputs, not measurements.
const assert = require('assert');
const { load, run, plain, recorder } = require('./harness');

const hrm = (bpm = 72) => ({ kind: 'hrm', bpm, t_ms: Date.now() });
const aff = (o = {}) => ({ kind: 'aff1', finger_bpm: [71, 73], breathing_per_min: 9, rmssd_ms: 46, quality: 0.6, presence: 'active', payload_len: 6, t_ms: Date.now(), ...o });
const hubFrame = (o = {}) => ({
  type: 'physio', source: 'finger_ppg', transport: 'hub_http', simulated: false, pulse_bpm: 72, quality: 0.7, quality_reported: true, contact: true,
  finger_bpm: [71, 73], breathing_per_min: 9, rmssd_ms: 46, sdnn_ms: 40, rmssd_vs_baseline: -0.1, presence: 'active', age_s: 0.4, ...o,
});
const connect = A => A.Sensors.setFingerLink('connected', 'Afferent Finger');
const ble = (A, o = {}, bpm = 72) => { A.Sensors.feedFingerBle(hrm(bpm)); A.Sensors.feedFingerBle(aff(o)); };
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, `${msg || ''} ${a} != ${b}`);
const LAG = 'Finger sensor. From your heart rhythm, about half a minute behind';
const SPAN = 'Covers the task and the 40 seconds before it', AFTER = `Finger sensor. ${SPAN}`;
// The sensors and the tasks draw from Math.random; a fixed sequence makes two runs of a task comparable frame by frame.
const seeded = fn => {
  const random = Math.random;
  let seed = 12345;
  Math.random = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
  try { return fn(); } finally { Math.random = random; }
};

// A session whose every task is the real breathing task (tasks/breath.js) at its full two cycles, stopped at the first frame of the first one.
// The rider waits for a tap before the ride starts (no autoplay without input), so the helper taps once there.
// clips: the finger clips are connected before the session starts, so the session runs on real readings only.
// hub: the same, with the clips reaching the phone through the home hub.
// breathing: false loads the app without breathing.js. overlay: the Developer switch "Signals during play".
// heartbeat: false loads it without heartbeat.js, whose beat and calm glow are drawn into the task with real readings.
const breathSession = ({ clips = false, hub = false, overlay = false, breathing = true, heartbeat = true, config = {} } = {}) => {
  const { A, tick } = load({ games: true, vitals: breathing, breathing, heartbeat }), S = A.Sensors;
  Object.assign(A.config, { signalsOverlay: overlay }, config);
  if (clips) connect(A);
  if (hub) S.feedFingerHub(hubFrame());
  const s = A.session = A.startSession({ clock: 'morning', input: 'touch', stage: true, profile: 'live' });
  s.slots = { fork: -1, lanterns: -1 }; s.pick = () => ({ id: 'breath', weight: null });
  for (let i = 0; i < 400 && s.game?.id !== 'breath'; i++) {
    if (s.T?.state === 'ready') s.handle('pdown', { x: 0, y: 0, t: A.now() });
    tick(0.05); A.Input.update(A.now(), 0.05); s.update(A.now(), 0.05);
  }
  assert.strictEqual(s.game?.id, 'breath', 'the breathing task did not start');
  assert.strictEqual(S.pulseMode, clips || hub ? 'real' : 'simulated');
  return { A, tick, s, S, g: s.game };
};
// Runs until the first breathing task has closed; `second(i)` is called once per second of that task, `each` before every frame.
const playOut = ({ A, tick, s }, second, each) => {
  for (let i = 0; i < 40 && !s.tasks.length; i++) run(A, tick, s, 1, each, () => second?.(i));
  assert.strictEqual(s.tasks[0]?.id, 'breath', 'the breathing task did not close');
  return plain(s.tasks[0]);
};
// Plays the first breathing task with a fixed random sequence and keeps what it left behind: the task record, the
// state and every canvas call of every frame (frames), the words of every frame, and whether the pace ring was drawn.
// The task itself never sets a line dash, the pace ring always does.
const film = (opts, feed) => seeded(() => {
  const t = breathSession(opts), { A, s } = t, log = [], ctx = recorder(log), words = [];
  const rec = playOut(t, i => feed?.(t, i), () => {
    log.push(['frame', JSON.stringify(s.orb)]);
    s.game?.drawWorld(ctx, A.J.at);
    words.push(A.Vitals ? A.Vitals.breath(s, A.now()) : null);
  });
  return { ...t, rec, words, frames: JSON.stringify(log), calls: log.length, ring: log.some(c => c[0] === 'setLineDash') };
});

const tests = {
  'a: closeness is 1 at the guide, falls off evenly on both sides, and is null without a rate'() {
    const { A } = load(), c = A.Breathing.closeness;
    assert.strictEqual(c(6, 6), 1);
    assert.strictEqual(c(7, 6), 1, 'within one breath a minute counts as there');
    assert.strictEqual(c(5, 6), 1);
    near(c(9, 6), 2 / 3); near(c(3, 6), 2 / 3, 'slower than the guide is treated like faster');
    near(c(10, 6), 0.5);
    assert.strictEqual(c(13, 6), 0);
    assert.strictEqual(c(30, 6), 0, 'never below 0');
    for (const r of [null, undefined, 0, -3, NaN, Infinity]) assert.strictEqual(c(r, 6), null, `rate ${r}`);
    assert.strictEqual(c(9, 0), null);
    for (let r = 6; r < 20; r++) assert.ok(c(r + 1, 6) <= c(r, 6), 'monotonic');
  },

  'b: no sensor, a simulated frame, zeros, no finger in the clip and an unsteady signal give no reading'() {
    const { A } = load(), S = A.Sensors, read = () => A.Breathing.reading(S.fingerFrame(A.now()));
    assert.strictEqual(A.Breathing.reading(null), null);
    assert.strictEqual(read(), null, 'no clips at all');
    S.feedFingerHub(hubFrame({ source: 'simulated', simulated: true }));
    assert.strictEqual(S.fingerFrame(A.now()).breathing_per_min, 9, 'the hub simulator does deliver a frame');
    assert.strictEqual(read(), null, 'a simulated frame never counts');
    assert.strictEqual(A.Breathing.reading({ source: 'finger_ppg', simulated: true, breathing_per_min: 9, pulse_bpm: 72 }), null);
    assert.strictEqual(A.Breathing.reading({ source: 'ky039', simulated: false, breathing_per_min: 9, pulse_bpm: 72 }), null);

    connect(A);
    assert.strictEqual(read(), null, 'connected, nothing received yet');
    ble(A, { breathing_per_min: 0 }, 0);
    assert.strictEqual(read(), null, 'zeros are not a reading');
    ble(A, { breathing_per_min: 0 });
    assert.deepStrictEqual(plain(read()), { rate: null, pulse: 72 }, 'a pulse without a breathing rate yet');
    ble(A);
    assert.deepStrictEqual(plain(read()), { rate: 9, pulse: 72 });
    ble(A, { presence: 'idle' });
    assert.strictEqual(read(), null, 'no finger in the clip');
    ble(A, { presence: 'probing' });
    assert.strictEqual(read(), null);
    ble(A, { quality: 0.29 });
    assert.strictEqual(read(), null, 'the sensor calls this signal unreliable');
    ble(A, { quality: 0.3 });
    assert.deepStrictEqual(plain(read()), { rate: 9, pulse: 72 });
    ble(A, { quality: null, presence: null, payload_len: 4 });
    assert.strictEqual(read(), null, 'a signal quality that is not reported is not a measurement here, as for the game pulse');
    assert.strictEqual(S.fingerFrame(A.now()).breathing_per_min, 9, 'the Your signals sheet still gets the number');
    const hub = { source: 'finger_ppg', transport: 'hub_http', simulated: false, presence: 'active', quality_reported: true, quality: 0.7, breathing_per_min: 9, pulse_bpm: 72, age_s: 0.4 };
    assert.deepStrictEqual(plain(A.Breathing.reading(hub)), { rate: 9, pulse: 72 });
    assert.strictEqual(A.Breathing.reading({ ...hub, quality: null }), null, 'the hub says quality is reported but sends none');
    assert.strictEqual(A.Breathing.reading({ ...hub, quality_reported: false }), null);
    S.enabled.pulse_stone = false;
    assert.strictEqual(read(), null, 'the pulse stone switch covers this too');
  },

  'c: freshness follows the integration: a breathing rate counts while its notification is under 3 s old'() {
    let { A, tick } = load(), S = A.Sensors;
    const read = () => A.Breathing.reading(S.fingerFrame(A.now()));
    connect(A); ble(A);
    tick(2.9);
    assert.deepStrictEqual(plain(read()), { rate: 9, pulse: 72 });
    tick(0.2);
    assert.strictEqual(read(), null, 'older than 3 s: stale, not shown as current');
    S.feedFingerBle(aff({ breathing_per_min: 8 }));
    assert.deepStrictEqual(plain(read()), { rate: 8, pulse: null }, 'the rate is fresh again, the pulse notification is still old');
    S.setFingerLink('scanning');
    assert.strictEqual(read(), null, 'the link dropped');

    ({ A, tick } = load()); S = A.Sensors;
    S.feedFingerHub(hubFrame({ age_s: 0 }));
    tick(2.9);
    assert.deepStrictEqual(plain(A.Breathing.reading(S.fingerFrame(A.now()))), { rate: 9, pulse: 72 });
    tick(0.2);
    assert.strictEqual(A.Breathing.reading(S.fingerFrame(A.now())), null, 'the hub path uses the same 3 s');

    // The hub sends a breathing rate for as long as the finger is detected, also when the heartbeats behind it are old.
    S.feedFingerHub(hubFrame({ age_s: 45 }));
    assert.deepStrictEqual([S.fingerFrame(A.now()).breathing_per_min, S.fingerFrame(A.now()).age_s], [9, 45], 'such a frame does arrive');
    assert.strictEqual(A.Breathing.reading(S.fingerFrame(A.now())), null, 'heartbeats 45 s old are not a current reading');
    S.feedFingerHub(hubFrame({ age_s: 2.5 }));
    assert.deepStrictEqual(plain(A.Breathing.reading(S.fingerFrame(A.now()))), { rate: 9, pulse: 72 });
    tick(0.6);
    assert.strictEqual(A.Breathing.reading(S.fingerFrame(A.now())), null, 'the same frame once its heartbeats are over 3 s old');
  },

  'd: the tracker: nothing, measuring, reading; samples once a second; zeros never enter the average'() {
    const { A } = load(), B = A.Breathing, t = B.track(6);
    const f = (rate, pulse) => ({ source: 'finger_ppg', simulated: false, presence: 'active', quality_reported: true, quality: 0.7, breathing_per_min: rate, pulse_bpm: pulse });
    assert.strictEqual(t.view(), null);
    assert.strictEqual(t.result(), null);
    let k = 0, now = 100;
    const step = (frame, seconds) => { for (let i = 0; i < seconds * 20; i++) { t.frame(now, frame); now = 100 + ++k * 0.05; } };
    step(null, 4);
    assert.strictEqual(t.view(), null, 'no data: nothing to say');
    step(f(0, 70), 3);
    assert.deepStrictEqual(plain(t.view()), { state: 'measuring', rate: null, guide: 6, near: null }, 'data arrived mid-task, no rate yet');
    assert.strictEqual(t.result(), null);
    step(f(10, 70), 2); step(f(8, 68), 2);
    assert.deepStrictEqual(plain(t.view()), { state: 'reading', rate: 8, guide: 6, near: 1 - 1 / 6 });
    assert.strictEqual(t.result(), null, '4 s of a rate out of 11 is not a meaningful part yet');
    step(f(6, 66), 2);
    t.frame(now, null);
    assert.strictEqual(t.view(), null, 'the reading disappeared mid-task: the live state follows at once');
    assert.deepStrictEqual([t.seconds, t.rates.length, t.pulses.length], [14, 14, 14], 'one sample a second, also across the gap');
    assert.deepStrictEqual(plain(t.result()), {
      source: 'finger_ppg', method: 'pulse_rhythm', guide_per_min: 6, seconds: 14,
      rate_per_min: { mean: 8, min: 6, max: 10, first: 10, last: 6, samples: 6 },
      pulse_bpm: { mean: 68.7, min: 66, max: 70, first: 70, last: 66, samples: 9 },
      pulse_start_bpm: null, pulse_end_bpm: 66,
    }, 'the pulse arrived 4 s into the task: its first sample is not the pulse at the start');
    step(null, 30);
    assert.strictEqual(t.result(), null, 'the same 6 s out of 44 no longer cover a meaningful part');
  },

  'e: a result needs at least 5 s with a rate and a third of the task'() {
    const { A } = load(), enough = A.Breathing.enough;
    assert.deepStrictEqual([enough(0, 0), enough(4, 10), enough(5, 10), enough(5, 15), enough(5, 16), enough(7, 21), enough(6, 21)], [false, false, true, true, false, true, false]);
  },

  'f: without a real reading the task is the task without this feature: same record, same frames, same canvas calls'() {
    const real = t => ble(t.A);
    const cases = {
      'no sensor at all': [{}, null],
      'the hub simulator': [{}, t => t.S.feedFingerHub(hubFrame({ source: 'simulated', simulated: true }))],
      'clips on, nothing received': [{ clips: true }, null],
      'clips on, no finger in them': [{ clips: true }, t => ble(t.A, { presence: 'idle' }, 0)],
      'clips on, zeros only': [{ clips: true }, t => ble(t.A, { breathing_per_min: 0 }, 0)],
      'clips on, signal quality below 0.3': [{ clips: true }, t => ble(t.A, { quality: 0.29 })],
      'clips on, no signal quality reported': [{ clips: true }, t => ble(t.A, { quality: null, presence: null, payload_len: 4 })],
      'the hub relays a frame without a quality value': [{ hub: true }, t => t.S.feedFingerHub(hubFrame({ quality: null }))],
      'the hub relays heartbeats that are 45 s old': [{ hub: true }, t => t.S.feedFingerHub(hubFrame({ age_s: 45 }))],
      'pulse stone switched off': [{ clips: true, config: { sensors: { bedside_light: false, pulse_stone: false, phone_camera: true } } }, t => { t.S.enabled.pulse_stone = false; real(t); }],
      'clips connected after the session started on the simulator': [{}, (t, i) => { if (i === 0) connect(t.A); real(t); }],
    };
    for (const [name, [opts, feed]] of Object.entries(cases)) {
      const without = film({ ...opts, overlay: true, breathing: false }, feed), now = film({ ...opts, overlay: true }, feed);
      assert.strictEqual(without.g.fb, null, 'the comparison run has no measured breathing at all');
      assert.ok(without.calls > 20000, `${name}: the task was not drawn (${without.calls} canvas calls)`);
      assert.ok(now.frames === without.frames, `${name}: a frame or a canvas call differs from the task without this feature`);
      assert.deepStrictEqual(now.rec, without.rec, `${name}: the record differs`);
      assert.ok(!now.ring && now.words.every(w => w === null), `${name}: something was shown`);
      assert.ok(!('breathing' in (now.rec.extra || {})) && now.s.breathResult === undefined, `${name}: something was recorded`);
    }
    const sim = film({ overlay: true }, null);
    assert.strictEqual(sim.S.pulse(sim.A.now()).source, 'simulated', 'the simulated pulse runs in such a session and never stands in for measured breathing');
  },

  'g: with the clips on, the task shows the measured pace without any switch, records the average, and says what the number covers'() {
    const feed = (t, i) => { if (i < 4) ble(t.A, { breathing_per_min: 0 }); else ble(t.A, { breathing_per_min: i < 12 ? 12 : 8 }, i < 12 ? 74 : 70); };
    const t = film({ clips: true }, feed), { A, tick, s, g, rec } = t, V = A.Vitals, B = A.Breathing;
    const texts = t.words.filter((_, i) => i % 20 === 10);
    assert.deepStrictEqual([A.config.signalsOverlay, A.config.breathFeedback], [false, undefined], 'no switch was touched');
    assert.strictEqual(texts[1], null, 'a pulse without a breathing rate yet: nothing is added to the task');
    assert.deepStrictEqual(plain(texts[6]), ['You: 12 breaths a minute · Guide: 6', LAG]);
    assert.deepStrictEqual(plain(texts[texts.length - 1])[0], 'You: 8 breaths a minute · Guide: 6');
    assert.ok(t.ring && g.fb.ring.solid && g.fb.ring.a > 0.9, 'the ring is drawn');
    assert.ok(g.fb.ring.near > B.closeness(12, 6) && g.fb.ring.near < B.closeness(8, 6), `the ring settles slowly, got ${g.fb.ring.near}`);

    const without = film({ clips: true, breathing: false }, feed);
    for (const k of ['completed_by', 'completed', 'items', 'errors', 'breath_sync', 'duration_ms', 'pulse']) assert.deepStrictEqual(rec[k], without.rec[k], `${k} changed with the measured breathing`);
    const { breathing: b, ...rest } = rec.extra;
    assert.deepStrictEqual(rest, without.rec.extra, 'the numbers of the task itself are untouched');
    assert.ok(t.calls > without.calls && t.frames !== without.frames, 'only the ring is added to the drawing');

    assert.deepStrictEqual(Object.keys(b).sort(), ['guide_per_min', 'method', 'pulse_bpm', 'pulse_end_bpm', 'pulse_start_bpm', 'rate_per_min', 'seconds', 'source']);
    assert.deepStrictEqual([b.pulse_start_bpm, b.pulse_end_bpm], [72, 70], 'the pulse within 3 s of each end of the task');
    assert.deepStrictEqual([b.source, b.method, b.guide_per_min], ['finger_ppg', 'pulse_rhythm', 6]);
    assert.ok(b.seconds >= 19 && b.seconds <= 21, `seconds ${b.seconds}`);
    assert.deepStrictEqual([b.rate_per_min.first, b.rate_per_min.last, b.rate_per_min.min, b.rate_per_min.max], [12, 8, 8, 12]);
    assert.ok([4, 5].includes(b.seconds - b.rate_per_min.samples), `the four seconds without a rate are not in the average: ${b.rate_per_min.samples} of ${b.seconds}`);
    assert.deepStrictEqual([b.pulse_bpm.first, b.pulse_bpm.last, b.pulse_bpm.samples], [72, 70, b.seconds - 1], 'the first tick came before the first reading');
    assert.ok(b.rate_per_min.mean > 8 && b.rate_per_min.mean < 12);

    const result = [`Measured: ${Math.round(b.rate_per_min.mean)} breaths a minute on average`, `${AFTER}. Pulse 72 at the start, 70 at the end`];
    assert.strictEqual(s.phase, 'walk');
    assert.deepStrictEqual(plain(V.breath(s, A.now())), result, 'the result names its source and the period the number covers');
    assert.strictEqual(V.breath({ ...s, gameMode: 'measure' }, A.now()), null, 'nothing over a measurement task');
    assert.strictEqual(V.breath(s, s.breathResult.until), null, 'the result line goes away by itself');
    s.breathResult.until += 60;
    let walked = 0, over = 0;
    for (let i = 0; i < 400 && s.tasks.length < 2 && !s.done; i++) {
      if (s.T?.state === 'exit') s.handle('pdown', { x: 0, y: 0, t: A.now() });
      run(A, tick, s, 0.05, null, null);
      const line = V.breath(s, A.now());
      if (s.phase === 'walk') { walked++; assert.deepStrictEqual(plain(line), result); }
      else { over++; assert.strictEqual(s.phase, 'game'); assert.strictEqual(line, null, 'the result line is never on top of the next task, also when its time is not up'); }
    }
    assert.ok(walked > 20 && over > 20 && A.now() < s.breathResult.until, `walked ${walked}, next task ${over}`);
    for (const [line, small] of [...t.words.filter(Boolean), result]) {
      assert.ok(small.startsWith('Finger sensor'), 'every line names its source');
      assert.ok(!/wrong|fail|bad|good|too |should|must|stress|strain|score|[!]/i.test(line + small), line + small);
    }

    const dev = film({ clips: true, overlay: true }, feed);
    assert.deepStrictEqual(plain(dev.words[30]), ['You: measuring… · Guide: 6 breaths a minute', 'Finger sensor. Takes about half a minute of steady signal'], 'the wait for a first rate shows with the Developer switch only');
  },

  'h: readings that stop mid-task disappear from the screen within 3 s and still give an honest average'() {
    const dropped = film({ clips: true }, (t, i) => { if (i < 9) ble(t.A, { breathing_per_min: 10 }); else if (i === 9) t.S.setFingerLink('scanning'); });
    const seen = dropped.words.filter((_, i) => i % 20 === 10).map(w => !!w);
    assert.deepStrictEqual(seen.slice(0, 9), Array(9).fill(true));
    assert.ok(seen.slice(10).every(x => !x), JSON.stringify(seen));
    assert.ok(dropped.g.fb.ring.a < 0.05, 'the ring fades out');
    const b = dropped.rec.extra.breathing;
    assert.deepStrictEqual([b.rate_per_min.mean, b.rate_per_min.samples], [10, 9]);
    assert.deepStrictEqual([b.pulse_bpm.last, b.pulse_start_bpm, b.pulse_end_bpm], [72, 72, null], 'the last pulse sample is 11 s before the end: not the pulse at the end');
    assert.deepStrictEqual(plain(dropped.A.Vitals.breath(dropped.s, dropped.A.now())), ['Measured: 10 breaths a minute on average', AFTER], 'so the line states no pulse');

    const quiet = film({ clips: true }, (t, i) => { if (i < 5) ble(t.A, { breathing_per_min: 10 }); });
    assert.strictEqual(quiet.S.fingerLink.state, 'connected', 'the link stays up, the notifications just stop');
    const at = quiet.words.map(w => !!w), lastFed = 4 * 20, gone = at.indexOf(false, lastFed);
    assert.ok(at.slice(1, lastFed + 50).every(Boolean), 'shown while the last notification is under 3 s old');
    assert.ok(gone > lastFed + 50 && gone <= lastFed + 61, `the line left ${(gone - lastFed) / 20} s after the last notification`);
    assert.ok(at.length > 300 && at.slice(gone).every(x => !x), 'and stays away');
    assert.strictEqual(quiet.g.fb.view(), null);
    assert.ok(quiet.g.fb.ring.a < 0.05, 'the ring fades out');
    const counted = quiet.g.fb.rates.filter(x => x != null).length;
    assert.ok(counted >= 6 && counted <= 8 && quiet.g.fb.rates.slice(9).every(x => x == null), `only the seconds with a current reading are counted: ${JSON.stringify(quiet.g.fb.rates)}`);

    const late = film({ clips: true }, (t, i) => { if (i >= 17) ble(t.A); });
    assert.ok(!('breathing' in late.rec.extra), 'three seconds at the very end are not a result');
    assert.strictEqual(late.A.Vitals.breath(late.s, late.A.now()), null);
  },

  'i: the setting "Breathing pace" turns ring and words off, never the recording'() {
    const feed = t => ble(t.A);
    // The live heartbeat (heartbeat.js) is a feature of its own that beats with the clips on; it is left out of both runs here.
    const off = film({ clips: true, heartbeat: false, config: { breathFeedback: false } }, feed), without = film({ clips: true, breathing: false, heartbeat: false }, feed);
    assert.ok(off.frames === without.frames, 'switched off, the task is drawn as without this feature');
    assert.ok(!off.ring && off.words.every(w => w === null));
    assert.strictEqual(off.A.Vitals.breath(off.s, off.A.now()), null, 'no result line either');
    assert.strictEqual(off.rec.extra.breathing.rate_per_min.mean, 9);
    assert.strictEqual(off.rec.extra.breathing.source, 'finger_ppg');
    const on = film({ clips: true }, feed);
    assert.ok(on.ring && on.words.filter(Boolean).length > 300, 'on by default');
    assert.deepStrictEqual(on.rec.extra.breathing, off.rec.extra.breathing);
  },

  'j: the Your signals sheet (outside play) states the last breathing task of today'() {
    const { A } = load({ vitals: true }), V = A.Vitals, stat = (first, last, samples) => ({ mean: (first + last) / 2, min: last, max: first, first, last, samples });
    A.lastVitalsAt = Date.now();
    A.lastVitals = { finger: { source: 'finger_ppg', pulse_bpm: { mean: 71.6 } }, breathing: null, hrv: null, camera_pulse: null };
    const rows = () => plain(V.model(A.now()).earlier.rows), row = () => rows().find(r => r.label === 'Breathing around the breathing task');
    assert.strictEqual(row(), undefined);
    A.lastBreath = { source: 'finger_ppg', method: 'pulse_rhythm', guide_per_min: 6, seconds: 20, rate_per_min: stat(12, 8, 16), pulse_bpm: stat(74, 70, 20), pulse_start_bpm: 74, pulse_end_bpm: 70 };
    const behind = SPAN;
    assert.deepStrictEqual([row().value, row().lines], ['10', ['breaths per minute, average', behind, 'Pulse 74 at the start, 70 at the end']]);
    assert.ok(!rows().some(r => /with the guide|Guide:/.test(r.label + r.lines.join(' '))), 'a 20 s task is shorter than the 40 s the sensor looks back: no comparison with the guide');
    A.lastBreath.seconds = 60;
    assert.deepStrictEqual(row().lines, ['breaths per minute, average', behind, 'Guide: 6', 'Pulse 74 at the start, 70 at the end'], 'the long task of rest mode');
    A.lastBreath.seconds = 20;
    for (const gone of [{ pulse_end_bpm: null }, { pulse_start_bpm: null }, { pulse_start_bpm: undefined, pulse_end_bpm: undefined }]) {
      Object.assign(A.lastBreath, { pulse_start_bpm: 74, pulse_end_bpm: 70 }, gone);
      assert.deepStrictEqual(row().lines, ['breaths per minute, average', behind], `first and last sample are not a start and an end: ${JSON.stringify(gone)}`);
      const after = { done: false, phase: 'walk', gameMode: null, game: null, breathResult: { ...A.lastBreath, until: 8 } };
      assert.deepStrictEqual(plain(V.breath(after, 0)), ['Measured: 10 breaths a minute on average', AFTER], 'and the line after the task leaves the pulse out too');
    }
    const after = { done: false, phase: 'walk', gameMode: null, game: null, breathResult: { ...A.lastBreath, pulse_start_bpm: 74, pulse_end_bpm: 70, until: 8 } };
    assert.strictEqual(plain(V.breath(after, 0))[1], `${AFTER}. Pulse 74 at the start, 70 at the end`);
    assert.strictEqual(plain(V.breath({ ...after, phase: 'dawn' }, 0))[1], `${AFTER}. Pulse 74 at the start, 70 at the end`);
    assert.strictEqual(V.breath({ ...after, phase: 'game', game: { id: 'fireflies' } }, 0), null, 'never over the next task');
    assert.strictEqual(V.breath({ ...after, phase: 'end' }, 0), null, 'nothing on the end screen');
    A.lastVitals.finger.source = 'simulated';
    assert.strictEqual(V.model(A.now()).earlier, null);
  },

  'k: the pulse at the start and at the end is stated only when a reading exists within 3 s of that end'() {
    const { A } = load({ vitals: true }), B = A.Breathing;
    const f = pulse => ({ source: 'finger_ppg', simulated: false, presence: 'active', quality_reported: true, quality: 0.7, breathing_per_min: 9, pulse_bpm: pulse });
    // 20 one-second ticks; pulseAt(i) is the pulse of tick i, or null for no reading at all in that second.
    const task = pulseAt => {
      const t = B.track(6);
      for (let i = 0; i < 20; i++) { const p = pulseAt(i); t.frame(100 + i, p == null ? null : f(p)); }
      const r = plain(t.result()), after = { done: false, phase: 'walk', gameMode: null, game: null, breathResult: { ...r, until: 999 } };
      return [r.pulse_start_bpm, r.pulse_end_bpm, r.pulse_bpm.first, r.pulse_bpm.last, plain(A.Vitals.breath(after, 0))[1]];
    };
    assert.deepStrictEqual(task(i => 90 - i), [90, 71, 90, 71, `${AFTER}. Pulse 90 at the start, 71 at the end`]);
    assert.deepStrictEqual(task(i => i <= 8 ? 89 - i * 7 / 8 : null), [89, null, 89, 82, AFTER], 'readings stopped after 8 s: 82 is not the pulse at the end');
    assert.deepStrictEqual(task(i => i >= 8 ? 60 + i : null), [null, 79, 68, 79, AFTER], 'readings began after 8 s: 68 is not the pulse at the start');
    assert.deepStrictEqual(task(i => i < 2 || i > 17 ? null : 70 + i).slice(0, 2), [72, 87], 'the third second and the third last still count');
    assert.deepStrictEqual(task(i => i < 3 || i > 16 ? null : 70 + i).slice(0, 2), [null, null], 'the fourth does not');

    const short = B.track(6);
    for (let i = 0; i < 5; i++) short.frame(100 + i, f(i === 2 ? 75 : 0));
    assert.deepStrictEqual([short.result().pulse_start_bpm, short.result().pulse_end_bpm], [75, null], 'one sample is never both ends');
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
