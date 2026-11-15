// Run: node demo/tests/camera-extras.test.js
// Four camera features from the reference app (ios/Afferent) in the phone app: distance coaching (coach.js, the clip
// check's camera step and a line during play), the screen light for the camera (screenlight.js, AfferentPulse.screenLight,
// ios/App/App/FaceLight.swift), the clearer of the two breathing rates (breathing.js, vitals.js) and the Developer face
// debug view (facedebug.js). Against the fake AfferentPulse plugin of the harness; every number is a test input.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
const { load, plain, JS } = require('./harness');

const read = f => fs.readFileSync(path.join(JS, f), 'utf8');
const IOS = path.join(JS, '..', '..', 'ios', 'App', 'App');
const swift = f => fs.readFileSync(path.join(IOS, f), 'utf8');
const LABELS = /\b(sad|sadness|angry|anger|contempt|disgust|disgusted|surprise|surprised|happy|happiness|fear|afraid|emotion|emotions|emotional|mood|moods|expression|expressions|diagnos\w*|depress\w*|anxi\w*)\b/i;

// The app with the camera pulse and the face measures, plus the files the harness does not load.
const app = ({ finger = false, extra = ['coach.js', 'screenlight.js', 'clipcheck.js', 'facedebug.js'] } = {}) => {
  const t = load({ camera: true, face: true, vitals: true, finger, storage: new Map() });
  for (const f of extra) vm.runInContext(read(f), t.ctx, { filename: f });
  return t;
};
const sec = (o = {}) => ({ t_ms: Date.now(), tracked: true, smile: 0.01, movement: 0.03, blinks: 0, gaze_away: 0, distance_cm: 32, breathing_per_min: null, breathing_snr: null, ...o });
const tracking = async t => { await t.A.Face.sync(); t.facePlugin.emit('faceState', { state: 'tracking' }); };
const camOk = (bpm = 74, score = 78) => ({ source: 'rppg', t_ms: Date.now(), face: true, locked: false, exposure: 'auto', with_eyes: false, reason: null, warmup_s_left: null, bpm, quality: score / 100, trust: { score, label: 'reliable', reasons: [] } });
const fingers = (S, o = {}) => {
  S.setFingerLink('connected', 'Afferent Finger');
  S.feedFingerBle({ kind: 'hrm', bpm: 72, t_ms: Date.now() });
  S.feedFingerBle({ kind: 'aff1', finger_bpm: [71, 73], breathing_per_min: 6, rmssd_ms: 46, quality: 0.6, presence: 'active', payload_len: 6, t_ms: Date.now(), ...o });
};
const lines = rows => plain(rows).map(r => [r.label, r.value, ...r.lines]);

const tests = {
  'a: distance coaching: the reference range, 2 s before a line, back by 2 cm before it goes'() {
    const { A } = app(), C = A.Coach;
    assert.deepStrictEqual(plain(C.RANGE_CM), [20, 45], 'ios/Afferent/ExpressionView.swift: under 20 cm and over 45 cm');
    assert.deepStrictEqual(plain(C.WORDS), { closer: 'Move a little closer', further: 'A little further back' });
    const c = C.coach();
    let now = 0;
    const at = (cm, s = 0) => { now += s; return c.step(now, cm); };
    assert.strictEqual(at(32), null, 'inside the range');
    assert.strictEqual(at(60), null, 'out of range: nothing yet');
    assert.strictEqual(at(60, 1.9), null, '1.9 s');
    assert.strictEqual(at(60, 0.1), 'closer', 'after 2 s too far: closer');
    assert.strictEqual(at(44, 0.5), 'closer', 'just inside: it stays (2 cm back)');
    assert.strictEqual(at(43.1, 0.5), 'closer');
    assert.strictEqual(at(43, 0.5), null, 'back by 2 cm: it goes');
    assert.strictEqual(at(46, 0.5), null, 'out again: the 2 s start over');
    assert.strictEqual(at(32, 1), null, 'a break in between');
    assert.strictEqual(at(46, 1), null);
    assert.strictEqual(at(46, 1.5), null, 'only 1.5 s since the break');
    assert.strictEqual(at(46, 0.5), 'closer');
    assert.strictEqual(at(null, 0.5), null, 'no face: gone at once');
    assert.strictEqual(at(46, 0.5), null, 'and the wait starts over');
    assert.strictEqual(at(15, 0.5), null, 'too close now');
    assert.strictEqual(at(15, 2), 'further', 'too close for 2 s: further');
    assert.strictEqual(at(21, 0.5), 'further', 'just inside: it stays');
    assert.strictEqual(at(22, 0.5), null, 'back by 2 cm');
    // crossing from one side to the other: the first line goes, the other comes after its own 2 s
    assert.strictEqual(at(50, 0.5), null); assert.strictEqual(at(50, 2), 'closer');
    assert.strictEqual(at(15, 0.5), null, 'the other side: not "closer" any more');
    assert.strictEqual(at(15, 2), 'further');
  },

  'b: during play the line shows at most 8 s, then rests a minute'() {
    const { A } = app(), c = A.Coach.coach(A.Coach.SESSION);
    assert.deepStrictEqual(plain(A.Coach.SESSION), { maxShowS: 8, restS: 60 });
    let now = 0;
    const at = (cm, s) => { now += s; return c.step(now, cm); };
    at(60, 0);
    assert.strictEqual(at(60, 2), 'closer');
    assert.strictEqual(at(60, 7.9), 'closer');
    assert.strictEqual(at(60, 0.1), null, '8 s: it stops asking');
    assert.strictEqual(at(60, 30), null, 'and keeps quiet');
    assert.strictEqual(at(60, 29.9), null);
    assert.strictEqual(at(60, 0.2), 'closer', 'a minute later it may say it once more');
  },

  async 'c: the clip check camera step coaches from the face measures, only while the camera is not OK yet'() {
    const t = app(), { A, tick, cam, facePlugin: p } = t, S = A.Sensors, C = A.ClipCheck;
    await A.CamPulse.sync();
    await tracking(t);
    const st = C.fresh('settings', null, A.now()), at = () => plain(C.model(A.now(), st));
    assert.strictEqual(at().camera.code, 'c_start', 'no clips on this phone: the camera is offered at once');
    p.emit('face', sec({ distance_cm: 62 }));
    assert.strictEqual(at().camera.coach, null, 'not at once');
    for (let i = 0; i < 4; i++) { tick(0.5); p.emit('face', sec({ distance_cm: 62 })); at(); }
    assert.strictEqual(at().camera.coach, 'Move a little closer', 'after 2 s at 62 cm');
    tick(0.5); p.emit('face', sec({ distance_cm: 30 }));
    assert.strictEqual(at().camera.coach, null, 'back in range');
    for (let i = 0; i < 5; i++) { tick(0.5); p.emit('face', sec({ distance_cm: 14 })); at(); }
    assert.strictEqual(at().camera.coach, 'A little further back');
    cam.emit(camOk());
    assert.deepStrictEqual([at().camera.code, at().camera.coach], ['c_ok', null], 'the pulse comes through: no more coaching');
    tick(3.1);
    p.emit('face', sec({ tracked: false, distance_cm: null }));
    assert.strictEqual(at().camera.coach, null, 'no face, no distance line');
    assert.strictEqual(A.Coach.distanceNow(A.now()), null);
    p.emit('face', sec({ distance_cm: 50 }));
    assert.strictEqual(A.Coach.distanceNow(A.now()), 50);
    tick(3);
    assert.strictEqual(A.Coach.distanceNow(A.now()), null, 'older than 3 s');
    // the sheet draws it under the camera card's line
    const js = read('clipcheck.js');
    assert.ok(/if \(c\.coach\) box\.append\(el\('p', 'clip-coach', c\.coach\)\)/.test(js));
    assert.ok(read('../css/clipcheck.css').includes('.clip-coach'));
  },

  'd: in a session the line sits at the top right and takes no tap'() {
    const html = read('../index.html'), css = read('../css/vitals.css');
    assert.ok(html.includes('<p id="camCoach" class="cam-coach" role="status"></p>'));
    const rule = css.slice(css.indexOf('.cam-coach {'), css.indexOf('}', css.indexOf('.cam-coach {')));
    assert.ok(/pointer-events: none/.test(rule) && /top: calc\(var\(--safe-top\)/.test(rule) && /right: calc\(var\(--af-safe-r\)/.test(rule), rule);
    assert.ok(!/bottom:|left: 50%/.test(rule), 'not over the play area or the bottom pill');
    const js = read('coach.js');
    assert.ok(/s\.phase === 'walk' \|\| s\.phase === 'game'/.test(js), 'only while playing');
  },

  async 'e: breathing: the clearer of the finger clips and the camera, labelled, never simulated'() {
    const t = app(), { A, tick, facePlugin: p } = t, S = A.Sensors, B = A.Breathing;
    const now = () => A.now();
    assert.strictEqual(B.clearest(now()), null, 'nothing reads');
    await tracking(t);
    p.emit('face', sec({ breathing_per_min: 12, breathing_snr: 2.9 }));
    assert.strictEqual(B.cameraCandidate(now()), null, 'under 3 dB the camera is not clear enough (clarity 0.29 < 0.3)');
    p.emit('face', sec({ breathing_per_min: 12, breathing_snr: 3 }));
    assert.deepStrictEqual(plain(B.clearest(now())), { rate: 12, source: 'arkit_truedepth', clarity: 0.3, other: null }, 'the camera alone');
    fingers(S, { quality: 0.6 });
    assert.deepStrictEqual(plain(B.clearest(now())), { rate: 6, source: 'finger_ppg', clarity: 0.6, other: 'arkit_truedepth' }, 'finger 0.6 against camera 0.30');
    p.emit('face', sec({ breathing_per_min: 12, breathing_snr: 6.5 }));
    assert.strictEqual(B.clearest(now()).source, 'finger_ppg', 'camera 0.65 is not clearer by more than 0.1: the finger stays');
    p.emit('face', sec({ breathing_per_min: 12, breathing_snr: 7.1 }));
    assert.deepStrictEqual(plain(B.clearest(now())), { rate: 12, source: 'arkit_truedepth', clarity: 0.71, other: 'finger_ppg' }, '0.71 against 0.6: the camera');
    p.emit('face', sec({ breathing_per_min: 12, breathing_snr: 6 }));
    assert.strictEqual(B.clearest(now()).source, 'arkit_truedepth', '0.6 each: the camera stays, the finger is not clearer by more than 0.1');
    fingers(S, { quality: 0.75 });
    assert.strictEqual(B.clearest(now()).source, 'finger_ppg', '0.75 against 0.6: back to the finger');
    p.emit('face', sec({ breathing_per_min: 12, breathing_snr: 20 }));
    assert.strictEqual(B.clearest(now()).clarity, 1, '10 dB and more is 1');

    // a tie with nothing shown before: the finger (the reference's order)
    const pick = B.chooser();
    const f = c => ({ rate: 6, clarity: c, source: 'finger_ppg' }), c = x => ({ rate: 12, clarity: x, source: 'arkit_truedepth' });
    assert.strictEqual(pick(f(0.5), c(0.5)).source, 'finger_ppg');
    assert.strictEqual(B.chooser()(f(0.5), c(0.51)).source, 'arkit_truedepth', 'nothing shown yet: the higher one, however close');
    assert.strictEqual(pick(null, null), null);

    // simulated never counts: a simulated hub frame is no finger candidate; the camera still is
    const t2 = app(), S2 = t2.A.Sensors;
    S2.feedFingerHub({ type: 'physio', source: 'simulated', simulated: true, transport: 'hub_http', pulse_bpm: 70, quality: 0.9, quality_reported: true, contact: true,
      finger_bpm: [70, 70], breathing_per_min: 9, rmssd_ms: 40, presence: 'active', age_s: 0.2 });
    assert.strictEqual(t2.A.Breathing.clearest(t2.A.now()), null, 'a simulated rate is never shown as the clearer one');
    await tracking(t2);
    t2.facePlugin.emit('face', sec({ breathing_per_min: 11, breathing_snr: 5 }));
    assert.strictEqual(t2.A.Breathing.clearest(t2.A.now()).source, 'arkit_truedepth');
    // a session locked to the simulator takes neither
    S2.pulseMode = 'simulated';
    assert.strictEqual(t2.A.Breathing.clearestInSession(t2.A.now(), S2.fingerFrame(t2.A.now())), null);
    S2.pulseMode = null;
    tick(0);
  },

  async 'f: Your signals has one Breathing row with its source; the breathing task line says where its rate comes from'() {
    const t = app(), { A, tick, facePlugin: p } = t, S = A.Sensors, V = A.Vitals;
    await tracking(t);
    p.emit('face', sec({ breathing_per_min: 12, breathing_snr: 8 }));
    let m = V.model(A.now());
    assert.deepStrictEqual(lines(m.face.rows).pop(), ['Breathing from the camera', '12', 'breaths per minute', 'Phone camera'], 'no finger sensor: the camera row in the Face group');
    fingers(S, { quality: 0.6 });
    m = V.model(A.now());
    assert.deepStrictEqual(lines(m.rows).find(r => r[0] === 'Breathing'), ['Breathing', '12', 'breaths per minute', 'Phone camera', 'Clearer than the finger sensor right now']);
    assert.strictEqual(lines(m.rows).filter(r => /Breathing/.test(r[0])).length + lines(m.face.rows).filter(r => /Breathing/.test(r[0])).length, 1, 'one row, never two numbers');
    fingers(S, { quality: 0.95 });
    assert.deepStrictEqual(lines(V.model(A.now()).rows).find(r => r[0] === 'Breathing'), ['Breathing', '6', 'breaths per minute', 'Finger sensor', 'Clearer than the camera right now']);
    tick(3.1);
    assert.deepStrictEqual(lines(V.model(A.now()).rows).find(r => r[0] === 'Breathing'), undefined, 'both gone stale: the clips have no frame, the Face group waits again');

    // the breathing task: the live line names the camera when its rate is shown; the recorded result stays the clips'
    const tr = A.Breathing.track(6);
    tick(0.1); p.emit('face', sec({ breathing_per_min: 7, breathing_snr: 9 }));
    tr.frame(A.now(), S.fingerFrame(A.now()), 0.05, true);
    assert.deepStrictEqual(plain(tr.view()), { state: 'reading', rate: 7, guide: 6, near: 1, source: 'arkit_truedepth' });
    const s = { done: false, phase: 'game', gameMode: 'calm', game: { id: 'breath', done: false, fb: { shown: () => tr.view() } } };
    A.config.breathFeedback = true;
    assert.deepStrictEqual(plain(V.breath(s, A.now())), ['You: 7 breaths a minute · Guide: 6', 'Phone camera. From small movements of your head, about half a minute behind']);
    for (let i = 0; i < 12; i++) { tick(1); p.emit('face', sec({ breathing_per_min: 7, breathing_snr: 9 })); tr.frame(A.now(), S.fingerFrame(A.now()), 1, true); }
    assert.strictEqual(tr.result(), null, 'camera seconds do not make a recorded finger result (contract: finger_ppg only)');
    assert.ok(tr.rates.every(x => x == null));
  },

  async 'g: the screen light is asked for only while the camera measures, and given back when it stops'() {
    const t = app(), { A, cam, fire } = t, L = A.ScreenLight, S = A.Sensors;
    const asks = () => cam.light.map(o => JSON.stringify(o));
    A.config.screenLight = true;
    await L.sync();
    assert.deepStrictEqual(asks(), ['{"on":false}'], 'the camera is not on yet: off (the first answer is always sent)');
    await A.CamPulse.sync();
    assert.strictEqual(S.camLink.state, 'on');
    await L.sync();
    assert.deepStrictEqual(asks(), ['{"on":false}'], 'camera on but no session and no clip check: still off, not asked again');
    A.session = { done: false };
    await L.sync();
    assert.deepStrictEqual(asks().pop(), '{"on":true}', 'a session: on');
    await L.sync();
    assert.strictEqual(cam.light.length, 2, 'asked once, not every second');
    A.night = () => true; A.config.quietNight = true;
    await L.sync();
    assert.deepStrictEqual(asks().pop(), '{"on":true,"max":0.35}', 'at night with Dim light: at most 35 %');
    A.night = () => false;
    await L.sync();
    A.session.done = true;
    A.bus.emit('sessionEnd', {});
    await new Promise(r => setImmediate(r));
    assert.deepStrictEqual(asks().pop(), '{"on":false}', 'the session ended: the own brightness back');
    // the clip check's camera step
    const st = A.ClipCheck.fresh('settings', null, A.now());
    A.ClipCheck.model(A.now(), st);
    A.ClipCheck.current = () => st;
    await L.sync();
    assert.deepStrictEqual(asks().pop(), '{"on":true}', 'the clip check shows its camera step: on');
    t.doc.hidden = true;
    await fire('visibilitychange');
    await L.sync();
    assert.deepStrictEqual(asks().pop(), '{"on":false}', 'the app is hidden: off');
    t.doc.hidden = false;
    await L.sync();
    assert.deepStrictEqual(asks().pop(), '{"on":true}');
    A.config.screenLight = false;
    await L.sync();
    assert.deepStrictEqual(asks().pop(), '{"on":false}', 'the setting off: off');
    A.config.screenLight = true;
    await L.sync();
    await A.CamPulse.stop();
    await L.sync();
    assert.deepStrictEqual(asks().pop(), '{"on":false}', 'the camera stopped: off');
    // the level the native side reports with each pulse event
    await A.CamPulse.sync();
    cam.emit({ ...camOk(), screen_light: 0.42 });
    assert.strictEqual(L.level, 0.42);
    cam.emit({ ...camOk(), screen_light: null });
    assert.strictEqual(L.level, null);
  },

  'h: the native light restores the own brightness when it is turned off, the camera stops or the app resigns active'() {
    const pulse = swift('AfferentPulse.swift'), light = swift('FaceLight.swift');
    assert.ok(/CAPPluginMethod\(name: "screenLight"/.test(pulse) && /@objc func screenLight\(_ call: CAPPluginCall\)/.test(pulse));
    const end = pulse.slice(pulse.indexOf('    private func end() {'), pulse.indexOf('    /// Exposure back to automatic'));
    assert.ok(/faceLight\.end\(\)/.test(end), 'stop(): the brightness back');
    assert.ok(/UIApplication\.willResignActiveNotification/.test(pulse) && /@objc private func lightResign\(\)[\s\S]*?self\.faceLight\.end\(\)/.test(pulse), 'the app leaves the foreground: back');
    const apply = pulse.slice(pulse.indexOf('    private func applyLight() {'), pulse.indexOf('    private func observeLifecycle()'));
    assert.ok(/guard lightWanted, !lightHeld, flags\(\)\.running, active else \{\s*if faceLight\.end\(\)/.test(apply), 'not wanted, held, no camera or not active: back');
    assert.ok(/func end\(\) -> Bool \{[\s\S]*?write\(own\)/.test(light), 'end writes the saved brightness');
    for (const [k, v] of [['minLevel', '0.12'], ['maxLevel', '0.85'], ['startLevel', '0.4'], ['maxRatePerSecond', '0.02'], ['targetLuma', '125.0'], ['deadbandLuma', '20.0']]) {
      assert.ok(new RegExp(`${k} = ${v.replace('.', '\\.')}`).test(light), `${k} = ${v}, the reference's value`);
    }
    const ref = fs.readFileSync(path.join(JS, '..', '..', 'ios', 'Afferent', 'ScreenLight.swift'), 'utf8');
    for (const v of ['0.12', '0.85', '0.02', '0.4', 'target = 125.0, deadband = 20.0', '0.15 + 0.45']) assert.ok(ref.includes(v), `the reference has ${v}`);
    assert.ok(fs.existsSync(path.join(IOS, '..', 'TeamTests', 'Sources', 'Afferent', 'FaceLight.swift')), 'FaceLight.swift runs in swift test (TeamTests)');
  },

  'i: Settings: "Screen light for the camera" under Sensors, on by default, saved like the other switches'() {
    const ctx = { console, URLSearchParams, setTimeout: () => 0, clearTimeout: () => {}, location: { search: '' }, navigator: {},
      document: { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], addEventListener: () => {} } };
    ctx.window = ctx;
    vm.createContext(ctx);
    for (const f of ['util.js', 'gui/lantern.js', 'gui/shell.js']) vm.runInContext(read(f), ctx, { filename: f });
    const sensors = ctx.A.Shell.groups.find(g => g.title === 'Sensors');
    const row = sensors.rows.find(r => r.sw === 'id="lightSw"');
    assert.ok(row, 'a switch in the Sensors group');
    assert.strictEqual(row.label, 'Screen light for the camera');
    assert.strictEqual(sensors.page, 'sensors');
    const main = read('main.js');
    assert.ok(/screenLight: saved\.screenLight \?\? true,/.test(main), 'on unless the patient switched it off');
    assert.ok(/store\.set\('afferent\.settings', \{[^}]*screenLight: A\.config\.screenLight/.test(main), 'saveSettings keeps it');
    assert.ok(/\$\('lightSw'\)\.checked = A\.config\.screenLight;/.test(main), 'the switch shows it');
    assert.ok(/\$\('lightSw'\)\.onchange = e => \{ A\.config\.screenLight = e\.target\.checked; saveSettings\(\); A\.ScreenLight\?\.sync\(\); \};/.test(main), 'a change is saved and applied');
    // the Developer row of the face debug view, and nowhere else
    const { pages } = ctx.A.Shell.settings.html(), dev = pages.slice(pages.indexOf('id="devGroup"'));
    assert.ok(dev.includes('id="faceDebugRow"') && pages.split('id="faceDebugRow"').length === 2, 'Face debug view is a Developer row, once');
    assert.ok(/class="set-group dev[^"]*" hidden id="devGroup"/.test(pages), 'the Developer section is hidden from patients by default');
  },

  async 'j: the face debug view: live numbers and eye arrows, the gaze stream only while it is open, no feeling named'() {
    const t = app(), { A, tick, facePlugin: p } = t, S = A.Sensors, D = A.FaceDebug;
    // arrows in mirror view: looking towards the face's own left points left on the screen, up points up
    assert.strictEqual(D.arrow(null, 3), null);
    assert.deepStrictEqual(plain(D.arrow(1, 1)), { dx: 0, dy: 0, dot: true }, 'within 2° of the lens: a dot');
    const left = D.arrow(30, 0), up = D.arrow(0, 20), k = D.ARROW_PX;
    assert.ok(Math.abs(left.dx + 0.5 * k) < 1e-9 && Math.abs(left.dy) < 1e-9, JSON.stringify(left));
    assert.ok(Math.abs(up.dy + Math.sin(20 * Math.PI / 180) * k) < 1e-9 && Math.abs(up.dx) < 1e-9);
    assert.ok(D.arrow(-10, -10).dx > 0 && D.arrow(-10, -10).dy > 0, 'to the right and down');

    await tracking(t);
    assert.strictEqual(await D.stream(true), true);
    assert.deepStrictEqual(p.debug, [true], 'opening asks for the stream');
    p.emit('faceDebug', { t_ms: Date.now(), tracked: true, calibrated: false, blink: 0.1, gaze_yaw_deg: -3, gaze_pitch_deg: -12, left_yaw_deg: -2, left_pitch_deg: -11,
      right_yaw_deg: -4, right_pitch_deg: -13, head_yaw_deg: 8, head_pitch_deg: 2 });
    p.emit('face', sec({ distance_cm: 58, smile: 0.06, blinks: 1, gaze_away: 0.25, breathing_per_min: 9, breathing_snr: 4 }));
    p.emit('micro', { t_ms: Date.now(), duration_ms: 180, region: 'brow', peak: 0.3 });
    p.emit('micro', { t_ms: Date.now(), duration_ms: 220, region: 'mouth', peak: 0.2 });
    tick(0.5);
    const m = plain(D.model(A.now())), row = k => m.rows.find(r => r[0] === k);
    assert.deepStrictEqual(row('Face tracked').slice(0, 2), ['Face tracked', 'yes']);
    assert.deepStrictEqual(row('Distance'), ['Distance', '58 cm', 'Move a little closer (outside 20 to 45 cm)']);
    assert.deepStrictEqual(row('Smile').slice(0, 2), ['Smile', '0.06']);
    assert.deepStrictEqual(row('Blinks').slice(0, 2), ['Blinks', '1']);
    assert.deepStrictEqual(row('Looking away').slice(0, 2), ['Looking away', '25%']);
    assert.deepStrictEqual(row('Gaze').slice(0, 2), ['Gaze', '-3° -12°']);
    assert.deepStrictEqual(row('Head').slice(0, 2), ['Head', '+8° +2°']);
    assert.deepStrictEqual(row('Breathing, camera').slice(0, 2), ['Breathing, camera', '9/min']);
    assert.deepStrictEqual(row('Breathing shown').slice(0, 2), ['Breathing shown', '9/min']);
    assert.deepStrictEqual(row('Brief movements'), ['Brief movements', '2', 'brow 1 · mouth 1']);
    assert.deepStrictEqual(m.recent.map(r => r[0]), ['mouth', 'brow'], 'the latest first');
    assert.strictEqual(m.frame.left_yaw_deg, -2);
    tick(1);
    assert.strictEqual(plain(D.model(A.now())).frame, null, 'a gaze frame older than 1 s is not drawn');
    await D.stream(false);
    assert.deepStrictEqual(p.debug, [true, false], 'closing stops it');
    assert.strictEqual(p.count('faceDebug'), 0, 'and drops the listener');

    const text = [...m.rows.flat(), ...m.recent.flat()].filter(x => x != null).join('\n');
    assert.strictEqual(text.match(LABELS), null, `the debug view names a feeling: ${text.match(LABELS)}`);
    for (const f of ['facedebug.js', 'coach.js', 'screenlight.js']) assert.strictEqual(read(f).match(LABELS), null, `${f}: ${read(f).match(LABELS)}`);
    const fm = swift('FaceMeasures.swift');
    assert.ok(/notifyListeners\("faceDebug"/.test(fm) && /guard on, f\.time - lastDebug >= Self\.debugEveryS/.test(fm), 'native: 15 a second, only while asked');
    assert.ok(!/blendShapes|shapes\[/.test(fm.slice(fm.indexOf('private func debugFrame'), fm.indexOf('/// If the session delegate stops'))
      .replace('let b = Double(f.shapes[l] + f.shapes[r]) / 2', '')), 'only the blink value of the 52 coefficients leaves, no blendshape stream');
  },

  'k: no new icon outside the font subset, and the new files are loaded by the app'() {
    const subset = new Set(fs.readFileSync(path.join(JS, '..', 'fonts', 'icon-names.txt'), 'utf8').split(',').map(x => x.trim()));
    for (const name of ['light_mode', 'bug_report']) assert.ok(subset.has(name), name);
    const html = read('../index.html'), at = f => html.indexOf(`<script src="js/${f}"></script>`);
    for (const f of ['coach.js', 'screenlight.js', 'facedebug.js']) assert.ok(at(f) > 0, `${f} in index.html`);
    assert.ok(at('face.js') < at('coach.js') && at('coach.js') < at('clipcheck.js') && at('clipcheck.js') < at('facedebug.js') && at('facedebug.js') < at('main.js'));
    assert.ok(html.includes('<link rel="stylesheet" href="css/facedebug.css">'));
  },
};

(async () => {
  let failed = 0;
  for (const [name, fn] of Object.entries(tests)) {
    try { await fn(); console.log('ok  ', name); } catch (e) { failed++; console.log('FAIL', name, '\n     ', (e.stack || e.message).split('\n').slice(0, 4).join('\n      ').slice(0, 1200)); }
  }
  console.log(`${Object.keys(tests).length - failed} ok, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
