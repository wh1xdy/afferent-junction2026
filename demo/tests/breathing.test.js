// Run: node demo/tests/breathing.test.js
// Measured breathing next to the breathing guide: closeness, freshness, averaging, and the real breath task in the engine.
// All numbers are test inputs, not measurements.
const assert = require('assert');
const { load, run, plain } = require('./harness');

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
// The sensors and the tasks draw from Math.random; a fixed sequence makes a whole task record comparable.
const seeded = fn => {
  const random = Math.random;
  let seed = 12345;
  Math.random = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
  try { return fn(); } finally { Math.random = random; }
};
// The record of the first breathing task of breathSession() without any sensor, as commit 01fc956 (the app before
// the measured breathing) writes it with the seeded sequence above.
const BEFORE = {
  id: 'breath', slot: 1, kind: 'adaptive', mode: 'flow', director_mode: 'flow', intensity: 0.4, weight_used: null, t_start_ms: 4550, duration_ms: 19950,
  completed_by: 'auto', completed: false, items: 0, errors: 0, intended_direction: 'none',
  pulse: { start_bpm: 68.7, min_bpm: 65.4, max_bpm: 70.8, end_bpm: 68.5, delta_bpm: -0.2, time_to_target_s: null, recovery_slope_bpm_per_min: null, quality: 0.9 },
  pulse_samples: 21, helped: null, head_pitch_start_deg: -5.5, head_pitch_delta_deg: 2.8, upright_s: 20, eye_openness_mean: 0.73, perclos: 0.05,
  long_closures: 0, skip_reason: null, breath_sync: 0.5, eyes_closed_s: 1,
};

// A session whose every task is the real breathing task (minigames.js) at its full two cycles, stopped at the first frame of the first one.
const breathSession = ({ overlay = false } = {}) => {
  const { A, tick } = load({ games: true, vitals: true }), S = A.Sensors;
  A.config.signalsOverlay = overlay;
  const s = A.session = A.startSession({ clock: 'morning', input: 'touch', stage: true, profile: 'live' });
  s.slots = { fork: -1, lanterns: -1 }; s.pick = () => ({ id: 'breath', weight: null });
  for (let i = 0; i < 400 && s.game?.id !== 'breath'; i++) { tick(0.05); A.Input.update(A.now(), 0.05); s.update(A.now(), 0.05); }
  assert.strictEqual(s.game?.id, 'breath', 'the breathing task did not start');
  return { A, tick, s, S, g: s.game };
};
// Runs until the first breathing task has closed; `second(i)` is called once per second of that task.
const playOut = ({ A, tick, s }, second) => {
  for (let i = 0; i < 40 && !s.tasks.length; i++) run(A, tick, s, 1, null, () => second?.(i));
  assert.strictEqual(s.tasks[0]?.id, 'breath', 'the breathing task did not close');
  return plain(s.tasks[0]);
};

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
    assert.strictEqual(read(), null, 'the sensor calls this signal unreliable (A7)');
    ble(A, { quality: 0.3 });
    assert.deepStrictEqual(plain(read()), { rate: 9, pulse: 72 });
    ble(A, { quality: null, presence: null, payload_len: 4 });
    assert.strictEqual(read(), null, 'a signal quality that is not reported never drives the game (I53), as for the game pulse');
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

  'f: without a real reading the task runs as before: no ring, no words, the record of the app before this feature'() {
    let shown = 0;
    const [quiet, rec] = seeded(() => {
      const t = breathSession({ overlay: true });
      assert.strictEqual(t.S.pulse(t.A.now()).source, 'simulated', 'the simulated pulse runs here');
      return [t, playOut(t, () => { if (t.s.orb?.ring || t.s.V.orb.ring || t.A.Vitals.breath(t.s, t.A.now())) shown++; })];
    });
    assert.strictEqual(shown, 0, 'a simulated pulse never stands in for measured breathing');
    assert.deepStrictEqual(rec, BEFORE, 'the record differs from the one commit 01fc956 writes');
    assert.strictEqual(quiet.s.breathResult, undefined);

    const hubSim = breathSession({ overlay: true });
    const rec2 = playOut(hubSim, () => {
      hubSim.S.feedFingerHub(hubFrame({ source: 'simulated', simulated: true }));
      if (hubSim.s.orb?.ring || hubSim.A.Vitals.breath(hubSim.s, hubSim.A.now())) shown++;
    });
    assert.strictEqual(shown, 0, 'neither does the hub simulator');
    assert.ok(!('extra' in rec2));

    const live = breathSession({ overlay: true });
    connect(live.A);
    const rec3 = playOut(live, () => ble(live.A));
    for (const k of ['completed_by', 'completed', 'items', 'errors', 'breath_sync', 'duration_ms']) assert.strictEqual(rec3[k], rec[k], `${k} changed with a sensor attached`);
  },

  'g: with the clips on, the task shows the measured pace, records the average, and says the truth about waiting'() {
    const t = breathSession({ overlay: true }), { A, tick, s, g } = t, V = A.Vitals, texts = [];
    connect(A);
    const rec = playOut(t, i => {
      if (i < 4) ble(A, { breathing_per_min: 0 }); else ble(A, { breathing_per_min: i < 12 ? 12 : 8 }, i < 12 ? 74 : 70);
      if (s.game) texts.push(V.breath(s, A.now()));
    });
    assert.deepStrictEqual(plain(texts[1]), ['You: measuring… · Guide: 6 breaths a minute', 'Finger sensor. Takes about half a minute of steady signal']);
    assert.deepStrictEqual(plain(texts[6]), ['You: 12 breaths a minute · Guide: 6', 'Finger sensor. From your heart rhythm, about half a minute behind']);
    assert.deepStrictEqual(plain(texts[texts.length - 1])[0], 'You: 8 breaths a minute · Guide: 6');
    assert.ok(g.ringSolid && g.ringA > 0.9, 'the ring is drawn');
    assert.ok(g.ringNear > A.Breathing.closeness(12, 6) && g.ringNear < A.Breathing.closeness(8, 6), `the ring settles slowly, got ${g.ringNear}`);
    assert.deepStrictEqual(plain(s.V.orb.ring), plain(s.orb.ring), 'the world gets the ring');

    const b = rec.extra.breathing;
    assert.deepStrictEqual(Object.keys(b).sort(), ['guide_per_min', 'method', 'pulse_bpm', 'pulse_end_bpm', 'pulse_start_bpm', 'rate_per_min', 'seconds', 'source']);
    assert.deepStrictEqual([b.pulse_start_bpm, b.pulse_end_bpm], [72, 70], 'the pulse within 3 s of each end of the task');
    assert.deepStrictEqual([b.source, b.method, b.guide_per_min], ['finger_ppg', 'pulse_rhythm', 6]);
    assert.ok(b.seconds >= 19 && b.seconds <= 21, `seconds ${b.seconds}`);
    assert.deepStrictEqual([b.rate_per_min.first, b.rate_per_min.last, b.rate_per_min.min, b.rate_per_min.max, b.rate_per_min.samples], [12, 8, 8, 12, b.seconds - 4]);
    assert.deepStrictEqual([b.pulse_bpm.first, b.pulse_bpm.last, b.pulse_bpm.samples], [72, 70, b.seconds - 1], 'the first tick came before the first reading');
    assert.ok(b.rate_per_min.mean > 8 && b.rate_per_min.mean < 12);

    const mean = Math.round(b.rate_per_min.mean);
    const result = [`Measured: ${mean} breaths a minute on average`, `${LAG}. Pulse 72 at the start, 70 at the end`];
    assert.strictEqual(s.phase, 'walk');
    assert.deepStrictEqual(plain(V.breath(s, A.now())), result, 'the result says how the number was measured and that it runs behind');
    assert.strictEqual(V.breath({ ...s, gameMode: 'measure' }, A.now()), null, 'nothing over a measurement task');
    assert.strictEqual(V.breath(s, s.breathResult.until), null, 'the result line goes away by itself');
    A.Sensors.setFingerLink('scanning');
    let walked = 0;
    for (let i = 0; i < 200 && s.phase === 'walk'; i++) { run(A, tick, s, 0.05); if (s.phase === 'walk') { walked++; assert.deepStrictEqual(plain(V.breath(s, A.now())), result); } }
    assert.ok(walked > 20 && s.phase === 'game' && A.now() < s.breathResult.until, `walked ${walked}, phase ${s.phase}`);
    assert.strictEqual(V.breath(s, A.now()), null, 'the result line ends when the next task starts');
    for (const [line, small] of texts.filter(Boolean)) {
      assert.ok(small.startsWith('Finger sensor'), 'every line names its source');
      assert.ok(!/wrong|fail|bad|good|too |should|must|stress|score|[!]/i.test(line + small), line + small);
    }
  },

  'h: readings that stop mid-task disappear from the screen within 3 s and still give an honest average'() {
    const t = breathSession({ overlay: true }), { A, s, g } = t, seen = [];
    connect(A);
    const rec = playOut(t, i => {
      if (i < 9) ble(A, { breathing_per_min: 10 }); else if (i === 9) A.Sensors.setFingerLink('scanning');
      if (s.game) seen.push(g.fb.view()?.state ?? null);
    });
    assert.deepStrictEqual(seen.slice(1, 9), Array(8).fill('reading'));
    assert.ok(seen.slice(10).every(x => x === null), JSON.stringify(seen));
    assert.ok(g.ringA < 0.05, 'the ring fades out');
    const b = rec.extra.breathing;
    assert.deepStrictEqual([b.rate_per_min.mean, b.rate_per_min.samples], [10, 9]);
    assert.deepStrictEqual([b.pulse_bpm.last, b.pulse_start_bpm, b.pulse_end_bpm], [72, 72, null], 'the last pulse sample is 11 s before the end: not the pulse at the end');
    assert.deepStrictEqual(plain(A.Vitals.breath(s, A.now())), ['Measured: 10 breaths a minute on average', LAG], 'so the line states no pulse');

    // The link stays up and the notifications just stop: the 3 s rule ends the reading, in the real task.
    const quiet = breathSession({ overlay: true }), states = [], lines = [];
    connect(quiet.A);
    playOut(quiet, i => {
      if (i < 5) ble(quiet.A, { breathing_per_min: 10 });
      if (quiet.s.game) { states.push(quiet.g.fb.view()?.state ?? null); lines.push(quiet.A.Vitals.breath(quiet.s, quiet.A.now())?.[0] ?? null); }
    });
    assert.strictEqual(quiet.S.fingerLink.state, 'connected');
    assert.deepStrictEqual(states.slice(1, 7), Array(6).fill('reading'), JSON.stringify(states));
    assert.ok(states.length > 15 && states.slice(8).every(x => x === null), `still shown as current after 3 s: ${JSON.stringify(states)}`);
    assert.deepStrictEqual(lines.map(x => !!x), states.map(x => !!x), 'the line follows');
    assert.ok(quiet.g.ringA < 0.05, 'the ring fades out');

    const late = breathSession({ overlay: true });
    connect(late.A);
    const rec2 = playOut(late, i => { if (i >= 17) ble(late.A); });
    assert.ok(!('extra' in rec2), 'three seconds at the very end are not a result');
    assert.strictEqual(late.A.Vitals.breath(late.s, late.A.now()), null);
  },

  'i: the "Signals during play" switch hides ring and words, never the recording'() {
    const t = breathSession({ overlay: false }), { A, s } = t;
    connect(A);
    let ring = 0;
    const rec = playOut(t, () => { ble(A); if (s.orb?.ring || s.V.orb.ring) ring++; });
    assert.strictEqual(ring, 0);
    assert.strictEqual(rec.extra.breathing.rate_per_min.mean, 9);
    assert.strictEqual(rec.extra.breathing.source, 'finger_ppg');
  },

  'j: the Your signals sheet (outside play) states the last breathing task of today'() {
    const { A } = load({ vitals: true }), V = A.Vitals, stat = (first, last, samples) => ({ mean: (first + last) / 2, min: last, max: first, first, last, samples });
    A.lastVitalsAt = Date.now();
    A.lastVitals = { finger: { source: 'finger_ppg', pulse_bpm: { mean: 71.6 } }, breathing: null, hrv: null, camera_pulse: null };
    const rows = () => plain(V.model(A.now()).earlier.rows), row = () => rows().find(r => r.label === 'Breathing around the breathing task');
    assert.strictEqual(row(), undefined);
    A.lastBreath = { source: 'finger_ppg', method: 'pulse_rhythm', guide_per_min: 6, seconds: 20, rate_per_min: stat(12, 8, 16), pulse_bpm: stat(74, 70, 20), pulse_start_bpm: 74, pulse_end_bpm: 70 };
    const behind = 'From your heart rhythm, about half a minute behind';
    assert.deepStrictEqual([row().value, row().lines], ['10', ['breaths per minute, average', behind, 'Pulse 74 at the start, 70 at the end']]);
    assert.ok(!rows().some(r => /with the guide|Guide:/.test(r.label + r.lines.join(' '))), 'a 20 s task is shorter than the 40 s the sensor looks back: no comparison with the guide');
    A.lastBreath.seconds = 60;
    assert.deepStrictEqual(row().lines, ['breaths per minute, average', behind, 'Guide: 6', 'Pulse 74 at the start, 70 at the end'], 'the long task of rest mode');
    A.lastBreath.seconds = 20;
    for (const gone of [{ pulse_end_bpm: null }, { pulse_start_bpm: null }, { pulse_start_bpm: undefined, pulse_end_bpm: undefined }]) {
      Object.assign(A.lastBreath, { pulse_start_bpm: 74, pulse_end_bpm: 70 }, gone);
      assert.deepStrictEqual(row().lines, ['breaths per minute, average', behind], `first and last sample are not a start and an end: ${JSON.stringify(gone)}`);
      const after = { done: false, phase: 'walk', gameMode: null, game: null, breathResult: { ...A.lastBreath, until: 8 } };
      assert.deepStrictEqual(plain(V.breath(after, 0)), ['Measured: 10 breaths a minute on average', LAG], 'and the line after the task leaves the pulse out too');
    }
    const after = { done: false, phase: 'walk', gameMode: null, game: null, breathResult: { ...A.lastBreath, pulse_start_bpm: 74, pulse_end_bpm: 70, until: 8 } };
    assert.strictEqual(plain(V.breath(after, 0))[1], `${LAG}. Pulse 74 at the start, 70 at the end`);
    assert.strictEqual(plain(V.breath({ ...after, phase: 'dawn' }, 0))[1], `${LAG}. Pulse 74 at the start, 70 at the end`);
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
    assert.deepStrictEqual(task(i => 90 - i), [90, 71, 90, 71, `${LAG}. Pulse 90 at the start, 71 at the end`]);
    assert.deepStrictEqual(task(i => i <= 8 ? 89 - i * 7 / 8 : null), [89, null, 89, 82, LAG], 'readings stopped after 8 s: 82 is not the pulse at the end');
    assert.deepStrictEqual(task(i => i >= 8 ? 60 + i : null), [null, 79, 68, 79, LAG], 'readings began after 8 s: 68 is not the pulse at the start');
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
