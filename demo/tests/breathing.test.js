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
    assert.deepStrictEqual(plain(read()), { rate: 9, pulse: 72 }, 'a sensor version without a quality byte is still read, as on the Your signals sheet');
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
    S.feedFingerHub(hubFrame());
    tick(2.9);
    assert.deepStrictEqual(plain(A.Breathing.reading(S.fingerFrame(A.now()))), { rate: 9, pulse: 72 });
    tick(0.2);
    assert.strictEqual(A.Breathing.reading(S.fingerFrame(A.now())), null, 'the hub path uses the same 3 s');
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
    });
    step(null, 30);
    assert.strictEqual(t.result(), null, 'the same 6 s out of 44 no longer cover a meaningful part');
  },

  'e: a result needs at least 5 s with a rate and a third of the task'() {
    const { A } = load(), enough = A.Breathing.enough;
    assert.deepStrictEqual([enough(0, 0), enough(4, 10), enough(5, 10), enough(5, 15), enough(5, 16), enough(7, 21), enough(6, 21)], [false, false, true, true, false, true, false]);
  },

  'f: without a real reading the task runs as before: no ring, no words, no extra key in the record'() {
    const quiet = breathSession({ overlay: true });
    assert.strictEqual(quiet.S.pulse(quiet.A.now()).source, 'simulated', 'the simulated pulse runs here');
    let shown = 0;
    const rec = playOut(quiet, () => { if (quiet.s.orb?.ring || quiet.s.V.orb.ring || quiet.A.Vitals.breath(quiet.s, quiet.A.now())) shown++; });
    assert.strictEqual(shown, 0, 'a simulated pulse never stands in for measured breathing');
    assert.ok(!('extra' in rec), JSON.stringify(rec.extra));
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
    const t = breathSession({ overlay: true }), { A, s, g } = t, V = A.Vitals, texts = [];
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
    assert.deepStrictEqual(Object.keys(b).sort(), ['guide_per_min', 'method', 'pulse_bpm', 'rate_per_min', 'seconds', 'source']);
    assert.deepStrictEqual([b.source, b.method, b.guide_per_min], ['finger_ppg', 'pulse_rhythm', 6]);
    assert.ok(b.seconds >= 19 && b.seconds <= 21, `seconds ${b.seconds}`);
    assert.deepStrictEqual([b.rate_per_min.first, b.rate_per_min.last, b.rate_per_min.min, b.rate_per_min.max, b.rate_per_min.samples], [12, 8, 8, 12, b.seconds - 4]);
    assert.deepStrictEqual([b.pulse_bpm.first, b.pulse_bpm.last, b.pulse_bpm.samples], [72, 70, b.seconds - 1], 'the first tick came before the first reading');
    assert.ok(b.rate_per_min.mean > 8 && b.rate_per_min.mean < 12);

    const mean = Math.round(b.rate_per_min.mean);
    assert.deepStrictEqual(plain(V.breath(s, A.now())), [`Measured: ${mean} breaths a minute on average`, 'Finger sensor · pulse 72 at the start, 70 at the end']);
    assert.strictEqual(V.breath({ ...s, gameMode: 'measure' }, A.now()), null, 'nothing over a measurement task');
    assert.strictEqual(V.breath(s, s.breathResult.until), null, 'the result line goes away by itself');
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
    assert.deepStrictEqual(plain(A.Vitals.breath(s, A.now())), ['Measured: 10 breaths a minute on average', 'Finger sensor · pulse 72 at the start, 72 at the end']);

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
    const row = () => plain(V.model(A.now()).earlier.rows).find(r => r.label === 'Breathing with the guide');
    assert.strictEqual(row(), undefined);
    A.lastBreath = { source: 'finger_ppg', method: 'pulse_rhythm', guide_per_min: 6, seconds: 20, rate_per_min: stat(12, 8, 16), pulse_bpm: stat(74, 70, 20) };
    assert.deepStrictEqual([row().value, row().lines], ['10', ['breaths per minute, average', 'Guide: 6', 'Pulse 74 at the start, 70 at the end']]);
    A.lastBreath.pulse_bpm = stat(74, 70, 3);
    assert.deepStrictEqual(row().lines, ['breaths per minute, average', 'Guide: 6'], 'three pulse samples are not a start and an end');
    const after = { done: false, phase: 'walk', gameMode: null, game: null, breathResult: { ...A.lastBreath, until: 8 } };
    assert.deepStrictEqual(plain(V.breath(after, 0)), ['Measured: 10 breaths a minute on average', 'Finger sensor'], 'and the line after the task leaves the pulse out too');
    assert.strictEqual(V.breath({ ...after, phase: 'end' }, 0), null, 'nothing on the end screen');
    A.lastVitals.finger.source = 'simulated';
    assert.strictEqual(V.model(A.now()).earlier, null);
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
