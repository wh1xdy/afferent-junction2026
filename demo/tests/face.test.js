// Run: node demo/tests/face.test.js
// The face measures from the phone camera (demo/js/face.js, the face part of sensors.js, record.js and vitals.js) against a fake
// AfferentFace plugin with the contract's surface. All numbers are test inputs, not measurements.
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { load, run, plain, JS } = require('./harness');

const keys = o => Object.keys(o).sort();
const sec = (o = {}) => ({ t_ms: Date.now(), tracked: true, smile: 0.01, movement: 0.03, blinks: 0, gaze_away: 0, distance_cm: 32, breathing_per_min: null, breathing_snr: null, ...o });
const brief = (o = {}) => ({ t_ms: Date.now(), duration_ms: 180, region: 'mouth', peak: 0.2, ...o });
const start = A => A.startSession({ clock: 'morning', input: 'touch', stage: true, profile: 'live' });
const finish = (A, s) => { let doc = null; A.bus.on('sessionEnd', d => { doc = d; }); s.finish('partial'); return plain(doc); };
const lines = g => plain(g).rows.map(r => [r.label, r.value, ...r.lines]);
const tracking = async t => { await t.A.Face.sync(); t.facePlugin.emit('state', { state: 'tracking' }); };
const warnings = async fn => {
  const real = console.warn, seen = [];
  console.warn = (...a) => seen.push(a.join(' '));
  try { await fn(); } finally { console.warn = real; }
  return seen;
};

const LIVE_KEYS = ['ambient_light', 'arousal', 'blink', 'eye_openness', 'face_tracked', 'fatigue', 'head_pitch_deg', 'mode', 'patient_id', 'perclos', 'phase',
  'physio', 'profile', 'pulse_bpm', 'pulse_quality', 'pulse_source', 'session_id', 'simulated', 'slot', 't_ms', 'task_id', 'type'];
const TODAY_VITALS = ['breathing', 'camera_pulse', 'finger', 'hrv', 'pulse_max_bpm', 'pulse_mean_bpm', 'pulse_min_bpm', 'pulse_source', 'series'];
const FACE_DATA = /smile|gaze_away|movement|micro|blinks|breathing_depth|arkit_truedepth|"face"/;
const LABELS = /\b(sad|sadness|angry|anger|contempt|disgust|disgusted|surprise|surprised|happy|happiness|fear|afraid|emotion|emotions|emotional|mood|moods|expression|expressions|diagnos\w*|depress\w*|anxi\w*)\b/i;

// One simulated second of a 40 s session: 35 tracked seconds, 7 of them with a smile above the threshold.
const scripted = i => {
  const tracked = !(i >= 30 && i < 35), clear = i >= 28;
  return sec({
    tracked, smile: !tracked ? 0.9 : i < 7 ? 0.08 : 0.01, movement: i % 2 ? 0.04 : 0.02, blinks: i % 5 === 0 ? 1 : 0, gaze_away: i < 7 ? 0.5 : 0,
    breathing_per_min: clear ? 12 : i === 27 ? 14 : null, breathing_snr: clear ? 3.2 : i === 27 ? -1 : null,
  });
};

const tests = {
  async 'a: without the plugin (browser, or a build that does not have it yet) nothing changes'() {
    const t = load({ vitals: true }), { A, tick } = t, S = A.Sensors, F = A.Face;
    const warned = await warnings(async () => { await F.sync(); await F.start(); await F.stop(); });
    assert.deepStrictEqual(warned, []);
    assert.deepStrictEqual([F.available(), S.faceState, S.faceLive(A.now())], [false, 'unavailable', null]);
    S.feedFace(sec()); S.feedFaceMicro(brief());
    assert.deepStrictEqual([S.faceLog.length, S.faceMicros.length], [0, 0]);
    const m = A.Vitals.model(A.now());
    assert.strictEqual(m.face, null);
    assert.deepStrictEqual(lines(m), [['Pulse', '68', 'beats per minute', 'Simulated'], ['Sensor', null, 'No finger sensor on this device']]);
    const s = start(A);
    run(A, tick, s, 5, null, () => S.feedFace(sec()));
    const doc = finish(A, s);
    assert.deepStrictEqual(keys(doc.vitals), TODAY_VITALS);
    assert.ok(!JSON.stringify(doc).includes('arkit_truedepth'));
  },

  async 'a2: a registerPlugin proxy for a plugin the native side does not have is asked once, quietly'() {
    const t = load({ vitals: true, face: 'core' }), { A } = t, S = A.Sensors, F = A.Face;
    assert.strictEqual(F.available(), true);
    const warned = await warnings(async () => { await F.sync(); await F.sync(); await t.fire('visibilitychange'); });
    assert.deepStrictEqual(warned, []);
    assert.deepStrictEqual([t.facePlugin.calls, F.available(), F.listeners, S.faceState], [1, false, null, 'unavailable']);
    assert.strictEqual(A.Vitals.model(A.now()).face, null);
  },

  async 'b: the camera runs only while the phone_camera setting is on and the app is visible'() {
    const t = load({ face: true }), { A, facePlugin: p, ctx } = t, S = A.Sensors, F = A.Face;
    A.config.sensors.phone_camera = false; S.enabled.phone_camera = false;
    await F.sync();
    assert.deepStrictEqual([p.starts, p.count('face'), S.faceState], [0, 0, 'off']);
    A.config.sensors.phone_camera = true; S.enabled.phone_camera = true;
    await F.sync();
    assert.deepStrictEqual([p.running, p.count('state'), p.count('face'), p.count('micro'), S.faceState], [true, 1, 1, 1, 'starting']);
    await F.sync();
    assert.strictEqual(p.starts, 1, 'sync is idempotent');
    p.emit('state', { state: 'tracking' });
    assert.strictEqual(S.faceState, 'tracking');
    p.emit('face', sec());
    assert.strictEqual(S.faceLog.length, 1);

    ctx.document.hidden = true;
    await t.fire('visibilitychange');
    assert.deepStrictEqual([p.running, p.stops, p.count('state'), p.count('face'), p.count('micro'), S.faceState], [false, 1, 0, 0, 0, 'off']);
    assert.strictEqual(S.faceLog.length, 0, 'the live window is emptied when the camera stops');
    await F.sync();
    assert.strictEqual(p.starts, 1, 'a hidden app does not start the camera');
    ctx.document.hidden = false;
    await t.fire('visibilitychange');
    assert.deepStrictEqual([p.running, p.starts, S.faceState], [true, 2, 'starting']);

    for (const state of ['no_face', 'tracking', 'denied']) { p.emit('state', { state }); assert.strictEqual(S.faceState, state); }
    p.emit('state', { state: 'cheerful' });
    assert.strictEqual(S.faceState, 'unavailable', 'a state outside the contract is not shown as anything');
    p.emit('state', { state: 'tracking' });

    A.config.sensors.phone_camera = false; S.enabled.phone_camera = false;
    await F.sync();
    assert.deepStrictEqual([p.running, p.stops, p.count('face'), S.faceState], [false, 2, 0, 'off']);
  },

  async 'b2: a state told while starting is not overwritten by the start result; no TrueDepth camera is final'() {
    let t = load({ face: true }), p = t.facePlugin, S = t.A.Sensors, F = t.A.Face;
    p.start = async function () { this.running = true; this.starts++; this.emit('state', { state: 'tracking' }); return { state: 'starting' }; };
    await F.sync();
    assert.strictEqual(S.faceState, 'tracking');

    t = load({ face: true, vitals: true }); p = t.facePlugin; S = t.A.Sensors; F = t.A.Face;
    p.first = 'unavailable';
    await F.sync();
    assert.deepStrictEqual([S.faceState, F.available(), p.running, p.count('face'), p.stops], ['unavailable', false, false, 0, 1]);
    await F.sync(); await t.fire('visibilitychange');
    assert.strictEqual(p.starts, 1, 'a phone without the depth camera is not asked again');
    assert.strictEqual(t.A.Vitals.model(t.A.now()).face, null);

    t = load({ face: true }); p = t.facePlugin; S = t.A.Sensors; F = t.A.Face;
    p.first = 'denied';
    await F.sync();
    assert.deepStrictEqual([S.faceState, F.available()], ['denied', true]);
  },

  async 'c: an event older than 3 s is dropped; a value is current for 3 s'() {
    const t = load({ face: true }), { A, tick, facePlugin: p } = t, S = A.Sensors;
    await tracking(t);
    p.emit('face', sec({ t_ms: Date.now() - 4000 }));
    p.emit('micro', brief({ t_ms: Date.now() - 4000 }));
    assert.deepStrictEqual([S.faceLog.length, S.faceMicros.length], [0, 0]);
    p.emit('face', sec({ breathing_per_min: 12, breathing_snr: 2, distance_cm: 31 }));
    p.emit('micro', brief());
    assert.deepStrictEqual([S.faceLog.length, S.faceMicros.length], [1, 1]);
    let f = S.faceLive(A.now());
    assert.deepStrictEqual([f.fresh, f.tracked, f.breathing_per_min, f.distance_cm], [true, true, 12, 31]);
    tick(2.9);
    assert.strictEqual(S.faceLive(A.now()).fresh, true);
    tick(0.2);
    f = S.faceLive(A.now());
    assert.deepStrictEqual([f.fresh, f.tracked, f.breathing_per_min, f.distance_cm], [false, false, null, null]);
    tick(60);
    assert.strictEqual(S.faceLive(A.now()).seconds_tracked, 0, 'the live window is the last minute');
  },

  async 'd: intake keeps missing as null, takes values only from tracked seconds and drops what is outside the contract'() {
    const t = load({ face: true }), { A, facePlugin: p } = t, S = A.Sensors;
    await tracking(t);
    const last = () => { const { at, t_ms, ...f } = plain(S.faceLog[S.faceLog.length - 1]); return f; };
    const NONE = { tracked: true, smile: null, movement: null, blinks: null, gaze_away: null, distance_cm: null, breathing_per_min: null, breathing_snr: null };
    p.emit('face', { t_ms: Date.now(), tracked: true });
    assert.deepStrictEqual(last(), NONE, 'a missing value is null, never 0');
    p.emit('face', sec({ smile: 'wide', movement: -1, blinks: 1.5, gaze_away: NaN, distance_cm: 0 }));
    assert.deepStrictEqual(last(), NONE);
    p.emit('face', sec({ smile: 0, movement: 0, blinks: 0, gaze_away: 0 }));
    assert.deepStrictEqual(last(), { ...NONE, smile: 0, movement: 0, blinks: 0, gaze_away: 0, distance_cm: 32 }, 'a measured 0 stays 0');
    p.emit('face', sec({ smile: 1.4, gaze_away: 1.2, movement: 2.5 }));
    assert.deepStrictEqual([last().smile, last().gaze_away, last().movement], [1, 1, 2.5]);
    p.emit('face', sec({ tracked: false, smile: 0.9, movement: 0.5, blinks: 3, gaze_away: 1, breathing_per_min: 12, breathing_snr: 5 }));
    assert.deepStrictEqual(last(), { ...NONE, tracked: false }, 'nothing is taken from a second without a tracked face');

    const breath = (per, snr) => { p.emit('face', sec({ breathing_per_min: per, breathing_snr: snr })); return [last().breathing_per_min, last().breathing_snr]; };
    assert.deepStrictEqual(breath(12, 2.5), [12, 2.5]);
    assert.deepStrictEqual(breath(12, 0), [null, null], 'no clear signal');
    assert.deepStrictEqual(breath(12, -3), [null, null]);
    assert.deepStrictEqual(breath(12, null), [null, null]);
    assert.deepStrictEqual(breath(3, 6), [null, null], 'outside 4 to 36 per minute');
    assert.deepStrictEqual(breath(37, 6), [null, null]);
    assert.deepStrictEqual(breath(4, 6), [4, 6]);
    assert.deepStrictEqual(breath(36, 6), [36, 6]);

    const before = S.droppedFace;
    for (const bad of [{ region: 'forehead' }, { region: 'contempt' }, { region: null }, { duration_ms: 39 }, { duration_ms: 501 }, { duration_ms: null }]) p.emit('micro', brief(bad));
    assert.deepStrictEqual([S.faceMicros.length, S.droppedFace - before], [0, 6]);
    for (const region of S.FACE.REGIONS) p.emit('micro', brief({ region }));
    p.emit('micro', brief({ duration_ms: 40 })); p.emit('micro', brief({ duration_ms: 500, peak: 3 }));
    assert.deepStrictEqual(plain(S.FACE.REGIONS), ['brow', 'eye', 'cheek', 'nose', 'mouth', 'jaw']);
    assert.deepStrictEqual([S.faceMicros.length, S.faceMicros[7].peak], [8, 1]);

    S.enabled.phone_camera = false;
    const n = S.faceLog.length;
    p.emit('face', sec()); p.emit('micro', brief());
    assert.deepStrictEqual([S.faceLog.length, S.faceMicros.length], [n, 8], 'with the phone camera off nothing is taken in');
    assert.deepStrictEqual(plain(S.faceLive(A.now())), { state: 'off' });
  },

  async 'e: the session block is built from the events of the session, over tracked seconds only'() {
    const t = load({ face: true }), { A, tick, facePlugin: p } = t, S = A.Sensors;
    assert.deepStrictEqual([S.FACE.MIN_TRACKED_S, S.FACE.SMILE_RISE], [30, 0.04]);
    await tracking(t);
    for (let i = 0; i < 5; i++) { p.emit('face', sec({ smile: 0.5, blinks: 2 })); p.emit('micro', brief({ region: 'jaw' })); }
    const s = start(A);
    run(A, tick, s, 40, null, i => {
      p.emit('face', scripted(i));
      if (i === 3) p.emit('micro', brief({ duration_ms: 120 }));
      if (i === 12) p.emit('micro', brief({ region: 'brow', duration_ms: 200 }));
      if (i === 20) { p.emit('micro', brief({ duration_ms: 400 })); p.emit('micro', brief({ region: 'forehead' })); }
    });
    const doc = finish(A, s), v = doc.vitals;
    assert.deepStrictEqual(keys(v), [...TODAY_VITALS, 'face'].sort());
    assert.deepStrictEqual(v.face, {
      source: 'arkit_truedepth', seconds_tracked: 35, smile_share: 0.2,
      movement: { mean: 0.03, min: 0.02, max: 0.04, first: 0.02, last: 0.04, samples: 35 },
      blinks_per_min: 12, gaze_away_share: 0.1,
      micro: { count: 3, per_min: 5.1, median_duration_ms: 200, by_region: { brow: 1, eye: 0, cheek: 0, nose: 0, mouth: 2, jaw: 0 } },
      breathing_depth: { rate_per_min: { mean: 12, min: 12, max: 12, first: 12, last: 12, samples: 7 }, seconds: 7 },
    });
    assert.ok(!doc.simulated_fields.some(f => /face/.test(f)), doc.simulated_fields.join());
    assert.strictEqual(S.faceTrack, null);
    p.emit('face', sec());
    assert.strictEqual(s.face.rows.length, 40, 'an event after the session is not added to it');
    assert.deepStrictEqual([v.breathing, v.finger], [null, null], 'camera breathing is its own block, not the finger-derived one');
  },

  async 'e2: below 30 tracked seconds shares and rates are null; without a tracked second so are the counts'() {
    const block = async (seconds, each) => {
      const t = load({ face: true }), { A, tick, facePlugin: p } = t;
      t.A.Sensors.enabled.simulator = false;
      await tracking(t);
      const s = start(A);
      run(A, tick, s, seconds, null, i => each(p, i));
      return finish(A, s).vitals;
    };
    const some = (p, i) => { p.emit('face', sec({ smile: 0.2, blinks: 1, gaze_away: 0.25 })); if (i === 2) p.emit('micro', brief({ region: 'eye' })); };
    let v = await block(29, some);
    assert.deepStrictEqual(v.face, {
      source: 'arkit_truedepth', seconds_tracked: 29, smile_share: null, movement: null, blinks_per_min: null, gaze_away_share: null,
      micro: { count: 1, per_min: null, median_duration_ms: 180, by_region: { brow: 0, eye: 1, cheek: 0, nose: 0, mouth: 0, jaw: 0 } }, breathing_depth: null,
    });
    assert.deepStrictEqual([v.pulse_mean_bpm, v.pulse_source, v.finger], [null, null, null], 'a session with only face numbers still has a vitals block');

    v = await block(30, some);
    assert.deepStrictEqual([v.face.seconds_tracked, v.face.smile_share, v.face.blinks_per_min, v.face.gaze_away_share, v.face.micro.per_min, v.face.movement.samples], [30, 1, 60, 0.25, 2, 30]);

    v = await block(35, (p, i) => p.emit('face', sec({ smile: i < 20 ? 0.2 : null, blinks: 0 })));
    assert.deepStrictEqual([v.face.seconds_tracked, v.face.smile_share, v.face.blinks_per_min], [35, null, 0], 'each measure needs its own 30 seconds of values; no blinks in them is a measured 0');
    assert.deepStrictEqual(v.face.micro, { count: 0, per_min: 0, median_duration_ms: null, by_region: { brow: 0, eye: 0, cheek: 0, nose: 0, mouth: 0, jaw: 0 } });

    v = await block(35, p => p.emit('face', sec({ tracked: false })));
    assert.deepStrictEqual(v.face, {
      source: 'arkit_truedepth', seconds_tracked: 0, smile_share: null, movement: null, blinks_per_min: null, gaze_away_share: null, micro: null, breathing_depth: null,
    });

    v = await block(5, () => {});
    assert.strictEqual(v, null, 'no face event and no pulse: no vitals, as today');
  },

  async 'f: face numbers are in the session document only, never in a live message, and do not touch the game input'() {
    const t = load({ face: true }), { A, tick, facePlugin: p } = t, S = A.Sensors;
    await tracking(t);
    const sent = [];
    A.bus.on('ws', m => sent.push(plain(m)));
    const s = start(A);
    const pulse0 = plain(S.pulse(A.now())), eyes0 = S.eyesSource();
    run(A, tick, s, 40, () => A.bus.emit('ws', s.liveMetrics(A.now())), i => { p.emit('face', scripted(i)); p.emit('micro', brief()); });
    const live = plain(s.liveMetrics(A.now()));
    assert.deepStrictEqual(keys(live), LIVE_KEYS);
    assert.ok(!FACE_DATA.test(JSON.stringify(live)), JSON.stringify(live));
    assert.deepStrictEqual([S.pulse(A.now()).source, S.eyesSource(), s.eyesSource], [pulse0.source, eyes0, eyes0]);
    assert.strictEqual(S.livePhysio(A.now()), null, 'camera breathing does not appear as finger data');
    finish(A, s);
    const withFace = sent.filter(m => FACE_DATA.test(JSON.stringify(m)));
    assert.ok(sent.length > 700, `${sent.length} messages`);
    assert.deepStrictEqual(withFace.map(m => m.type), ['session_end']);
    assert.strictEqual(withFace[0].session.vitals.face.source, 'arkit_truedepth');
  },

  async 'g: the Face group on Your signals says where each number comes from and why one is missing'() {
    const t = load({ face: true, vitals: true }), { A, tick, facePlugin: p } = t, S = A.Sensors, V = A.Vitals;
    const group = () => V.model(A.now()).face, CAM = 'Phone camera';
    const LABEL = ['Smiling', 'Facial movement', 'Blinks per minute', 'Looking away', 'Brief facial movements', 'Breathing from the camera'];
    const all = text => LABEL.map(l => [l, null, text, CAM]);

    A.config.sensors.phone_camera = false; S.enabled.phone_camera = false;
    await A.Face.sync();
    assert.strictEqual(group().title, 'Face');
    assert.deepStrictEqual(lines(group()), [[CAM, null, 'Switched off']]);
    A.config.sensors.phone_camera = true; S.enabled.phone_camera = true;
    await A.Face.sync();
    assert.deepStrictEqual(lines(group()), all('Starting the camera'));
    p.emit('state', { state: 'denied' });
    assert.deepStrictEqual(lines(group()), [[CAM, null, 'Camera access is off for Afferent in Settings']]);
    p.emit('state', { state: 'no_face' });
    assert.deepStrictEqual(lines(group()), all('No reading right now'));
    p.emit('face', sec({ tracked: false }));
    assert.deepStrictEqual(lines(group()), all('The camera does not see your face right now'));

    p.emit('state', { state: 'tracking' });
    for (let i = 0; i < 10; i++) { p.emit('face', scripted(i)); tick(1); }
    p.emit('face', scripted(10));
    const waiting = all('Takes about half a minute with your face in view');
    waiting[5][2] = 'Takes about half a minute of sitting still';
    assert.deepStrictEqual(lines(group()), waiting);

    for (let i = 11; i < 40; i++) { tick(1); p.emit('face', scripted(i)); if (i === 12 || i === 20) p.emit('micro', brief({ region: i === 12 ? 'brow' : 'mouth' })); }
    assert.deepStrictEqual(lines(group()), [
      ['Smiling', '20%', 'of the time, last minute', CAM],
      ['Facial movement', '0.030', 'average change per second across the face', CAM],
      ['Blinks per minute', '12', 'in the last minute', CAM],
      ['Looking away', '10%', 'of the time, last minute', CAM],
      ['Brief facial movements', '2', 'in the last minute · 3.4 per minute', 'brow 1 · mouth 1', CAM],
      ['Breathing from the camera', '12', 'breaths per minute', CAM],
    ]);

    S.setFingerLink('connected', 'Afferent Finger');
    S.feedFingerBle({ kind: 'hrm', bpm: 72, t_ms: Date.now() });
    S.feedFingerBle({ kind: 'aff1', finger_bpm: [71, 73], breathing_per_min: 6, rmssd_ms: 46, quality: 0.6, presence: 'active', payload_len: 6, t_ms: Date.now() });
    const m = V.model(A.now());
    assert.deepStrictEqual(lines(m).find(r => r[0] === 'Breathing'), ['Breathing', '6', 'breaths per minute']);
    assert.deepStrictEqual(lines(m.face).pop(), ['Breathing from the camera', '12', 'breaths per minute', CAM], 'two rows, two sources, never one merged number');

    tick(1); p.emit('face', sec({ tracked: false }));
    assert.deepStrictEqual(lines(group()), all('The camera does not see your face right now'), 'no number is shown while no face is in view');
    tick(3.1);
    assert.deepStrictEqual(lines(group()), all('No reading right now'));

    const subset = fs.readFileSync(path.join(JS, '..', 'fonts', 'icon-names.txt'), 'utf8').split(',').map(x => x.trim());
    p.emit('face', sec());
    for (const r of plain(group()).rows) assert.ok(subset.includes(r.icon), `icon ${r.icon} is not in the font subset`);
  },

  async 'h: no label for a feeling anywhere in the face path'() {
    const read = f => fs.readFileSync(path.join(JS, f), 'utf8');
    for (const f of ['face.js', 'vitals.js']) assert.strictEqual(read(f).match(LABELS), null, `${f}: ${read(f).match(LABELS)}`);
    for (const f of ['sensors.js', 'record.js', 'engine.js', 'main.js']) {
      const near = read(f).split('\n').filter(l => /face|micro|smil|brief/i.test(l)).join('\n');
      assert.strictEqual(near.match(LABELS), null, `${f}: ${near.match(LABELS)}`);
    }
    const t = load({ face: true, vitals: true }), { A, tick, facePlugin: p } = t, S = A.Sensors, shown = [];
    const grab = () => { const g = A.Vitals.model(A.now()).face; if (g) shown.push(g.title, ...plain(g).rows.flatMap(r => [r.label, r.value, ...r.lines])); };
    A.config.sensors.phone_camera = false; S.enabled.phone_camera = false;
    await A.Face.sync(); grab();
    A.config.sensors.phone_camera = true; S.enabled.phone_camera = true;
    await A.Face.sync(); grab();
    for (const state of ['denied', 'no_face', 'tracking']) { p.emit('state', { state }); grab(); }
    for (let i = 0; i < 40; i++) { p.emit('face', scripted(i)); for (const region of S.FACE.REGIONS) p.emit('micro', brief({ region })); grab(); tick(1); }
    p.emit('face', sec({ tracked: false })); grab();
    tick(4); grab();
    const text = shown.filter(x => x != null).join('\n');
    assert.ok(shown.length > 200 && text.includes('20%') && text.includes('jaw'));
    assert.strictEqual(text.match(LABELS), null, `label in patient text: ${text.match(LABELS)}`);
    assert.strictEqual(text.match(/\b(hrv|high|low|normal|abnormal|elevated|healthy|unhealthy|good|bad|poor|calm|anxious|tense|relaxed|worried|risk|alert|warning|stress\w*|screen\w*)\b/gi), null);
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
