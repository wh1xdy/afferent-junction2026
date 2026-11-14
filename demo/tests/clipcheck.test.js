// Run: node demo/tests/clipcheck.test.js
// The clip check (demo/js/clipcheck.js): OK only on a real reading through the app's own gate, the camera pulse when
// the clips give nothing, before the session and never inside it, nothing sent. Every frame here is a test input,
// not a measurement; the clock is the harness's manual clock.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
const { load, plain, JS } = require('./harness');
const { makeDocument } = require('./fakedom');

const read = f => fs.readFileSync(path.join(JS, f), 'utf8');
const flush = () => new Promise(r => setImmediate(r));

// The logic alone (no page), or the page with the sheet (dom). Plugins: the fake AfferentFinger and AfferentPulse.
const page = ({ dom = true, finger = true, camera = true, storage = new Map() } = {}) => {
  const h = load({ finger, camera, storage });
  const { ctx } = h;
  if (dom) Object.assign(ctx, { document: makeDocument(), clearInterval: () => {}, clearTimeout: () => {}, Event: class { constructor(type) { this.type = type; } } });
  vm.runInContext(read('clipcheck.js'), ctx, { filename: 'clipcheck.js' });
  return { ...h, storage, doc: ctx.document, C: ctx.A.ClipCheck, S: ctx.A.Sensors };
};

// Finger frames as the AfferentFinger plugin sends them (2A37 pulse and the AFF1 values).
const hrm = (S, bpm = 72) => S.feedFingerBle({ kind: 'hrm', bpm, t_ms: Date.now() });
const aff = (S, o = {}) => S.feedFingerBle({ kind: 'aff1', finger_bpm: [71, 73], breathing_per_min: 6, rmssd_ms: 46, quality: 0.8, presence: 'active', payload_len: 6, t_ms: Date.now(), ...o });
const fingers = (S, o = {}, bpm = 72) => { hrm(S, bpm); aff(S, o); };
const hubFrame = (o = {}) => ({
  type: 'physio', source: 'finger_ppg', transport: 'hub_http', simulated: false, pulse_bpm: 72, quality: 0.8, quality_reported: true, contact: true,
  finger_bpm: [71, 73], breathing_per_min: 6, rmssd_ms: 46, presence: 'active', age_s: 0.4, ...o,
});
// A camera pulse event as AfferentPulse sends it, through A.CamPulse like the app.
const camEvent = (o = {}) => ({ source: 'rppg', t_ms: Date.now(), face: true, locked: false, exposure: 'auto', with_eyes: false, reason: null, warmup_s_left: null, ...o });
const camOk = (bpm = 74, score = 78) => camEvent({ bpm, quality: score / 100, trust: { score, label: 'reliable', reasons: [] } });

const connect = async p => { await p.A.Finger.arm(); p.plugin.emit('state', { state: 'connected', name: 'Afferent Finger' }); };
const run = (p, mode = 'settings') => p.C.fresh(mode, null, p.A.now());
const at = (p, st) => plain(p.C.model(p.A.now(), st));

const text = node => node?.textContent ?? '';
const labels = doc => doc.getElementById('clipActions').children.map(b => b.childNodes.filter(n => n.nodeType === 3).map(n => n.data).join(''));
const press = (doc, label) => doc.getElementById('clipActions').children.find(b => b.childNodes.some(n => n.nodeType === 3 && n.data === label)).click();
const hidden = doc => doc.getElementById('clipcheck').classList.contains('hidden');

const tests = {
  async 'a: OK only on a real, fresh finger pulse at quality 0.3 or more; the same gate the game and the breathing use'() {
    const p = page({ dom: false }), { A, S, C, tick } = p;
    S.enabled.simulator = true;
    await connect(p);
    const st = run(p), code = () => at(p, st).clips.code, ok = () => [at(p, st).ok, C.clipsOk(A.now())];
    assert.strictEqual(S.pulse(A.now()).source, 'simulated', 'the simulator gives the game a pulse here');
    assert.deepStrictEqual([code(), ...ok()], ['place', false, false], 'a simulated pulse never makes the check pass');

    fingers(S);
    assert.deepStrictEqual([code(), ...ok(), at(p, st).clips.bpm, at(p, st).via], ['ok', true, true, 72, 'clips']);
    fingers(S, { quality: 0.3 });
    assert.deepStrictEqual([code(), ...ok()], ['ok', true, true], 'quality 0.3 itself passes');
    fingers(S, { quality: 0.29 });
    assert.deepStrictEqual([code(), ...ok()], ['weak', false, false]);
    fingers(S, { quality: null });
    assert.deepStrictEqual([code(), ...ok()], ['weak', false, false], 'no quality in a frame that can carry one is not OK');
    fingers(S, { presence: 'probing' });
    assert.deepStrictEqual([code(), ...ok()], ['probing', false, false]);
    fingers(S, { presence: 'idle', finger_bpm: [null, null] });
    assert.deepStrictEqual([code(), ...ok(), at(p, st).clips.chips], ['place', false, false, [false, false]]);
    fingers(S, { finger_bpm: [70, null], quality: 0.2 });
    assert.deepStrictEqual([code(), at(p, st).clips.args.n, at(p, st).clips.sub], ['one', 2, 'Clip 2 needs a finger too, all the way in.']);

    fingers(S);
    tick(2.9);
    assert.strictEqual(at(p, st).ok, true, 'still fresh at 2.9 s');
    tick(0.2);
    assert.deepStrictEqual([code(), ...ok()], ['place', false, false], 'older than 3 s: no reading, not OK');

    fingers(S, { payload_len: 4, quality: null, presence: null });
    assert.deepStrictEqual([code(), ...ok()], ['old_box', false, false], 'a box that does not report quality never passes');
  },

  'b: the clips through the home hub pass on a real frame only; a simulated or an old one never does'() {
    const p = page({ dom: false, finger: false }), { A, S, C } = p;
    const st = run(p), now = () => [at(p, st).clips.code, C.clipsOk(A.now())];
    assert.deepStrictEqual(now(), ['none', false], 'no clips on this phone');
    S.feedFingerHub(hubFrame());
    assert.deepStrictEqual(now(), ['ok', true]);
    S.feedFingerHub(hubFrame({ age_s: 3 }));
    assert.strictEqual(C.clipsOk(A.now()), false, 'heartbeats 3 s old are not a current reading');
    S.feedFingerHub(hubFrame({ simulated: true }));
    assert.deepStrictEqual(now(), ['sim', false], 'the hub simulator never passes, even saying finger_ppg');
    S.feedFingerHub(hubFrame({ quality: null, quality_reported: false }));
    assert.deepStrictEqual(now(), ['old_box', false]);
    S.feedPulse({ bpm: 70, quality: 0.9, contact: true, source: 'simulated' });
    assert.strictEqual(C.clipsOk(A.now()), false);
  },

  async 'c: each state of the link has its own sentence, and a dead end says so at once'() {
    let p = page({ dom: false }), { S, tick } = p;
    let st = run(p);
    const code = () => at(p, st).clips.code;
    assert.strictEqual(code(), 'starting', 'Bluetooth may say off for a moment while it starts');
    tick(4);
    assert.deepStrictEqual([code(), at(p, st).clips.dead], ['bt_off', true]);
    for (const [link, want] of [['scanning', 'looking'], ['connecting', 'looking'], ['unauthorized', 'bt_denied'], ['unsupported', 'bt_none'], ['connected', 'place']]) {
      S.setFingerLink(link);
      assert.strictEqual(code(), want, link);
    }
    S.enabled.pulse_stone = false;
    assert.deepStrictEqual([code(), at(p, st).clips.action], ['off', 'clips_on']);

    p = page({ dom: false, finger: false }); st = run(p);
    assert.deepStrictEqual([at(p, st).clips.code, at(p, st).clips.dead], ['none', true]);
    await flush();
  },

  async 'd: the camera pulse is offered when the clips give nothing, and passes only when trusted and fresh'() {
    let p = page({ dom: false }), { A, S, tick, cam } = p;
    await A.CamPulse.sync();
    S.setFingerLink('scanning');
    let st = run(p);
    tick(9.9);
    assert.strictEqual(at(p, st).camera, null, 'clips first');
    tick(0.1);
    assert.deepStrictEqual(at(p, st).camera.code, 'c_start', 'the box was not found in 10 s: the camera is offered');
    cam.emit(camEvent({ reason: 'warming_up', warmup_s_left: 4.2 }));
    assert.deepStrictEqual([at(p, st).camera.code, at(p, st).camera.sub, at(p, st).ok], ['c_warm', 'Hold still, about 5 seconds.', false]);
    for (const [reason, want] of [['no_face', 'c_face'], ['exposure_not_locked', 'c_settle'], ['too_dark', 'c_dark'], ['too_bright', 'c_bright'], ['moving', 'c_moving'], ['weak_signal', 'c_weak']]) {
      cam.emit(camEvent({ reason, face: reason !== 'no_face' }));
      assert.strictEqual(at(p, st).camera.code, want, reason);
    }
    cam.emit(camEvent({ bpm: 70, quality: 0.39, trust: { score: 39, label: 'unreliable', reasons: [] }, reason: 'weak_signal' }));
    assert.deepStrictEqual([at(p, st).camera.code, at(p, st).ok], ['c_weak', false], 'an untrusted camera estimate is not OK');
    cam.emit(camOk());
    let v = at(p, st);
    assert.deepStrictEqual([v.camera.code, v.camera.bpm, v.ok, v.via, v.clips.tone], ['c_ok', 74, true, 'camera', 'rest']);
    assert.deepStrictEqual(v.actions, [['filled', 'Done', 'close']], 'OK makes Done the main button');
    tick(3);
    assert.deepStrictEqual([at(p, st).camera.code, at(p, st).ok], ['c_start', false], 'older than 3 s: no reading, not OK');

    // the clips come back: they win, the camera stays shown as what it is
    S.setFingerLink('connected', 'Afferent Finger');
    fingers(S);
    cam.emit(camOk(90));
    v = at(p, st);
    assert.deepStrictEqual([v.via, v.clips.bpm, v.camera.bpm], ['clips', 72, 90], 'two numbers, never merged');

    // connected but no finger: the camera after 12 s; a weak signal: after 25 s
    p = page({ dom: false }); ({ A, S, tick } = p);
    await connect(p); st = run(p);
    tick(11.9); assert.strictEqual(at(p, st).camera, null);
    tick(0.1); assert.ok(at(p, st).camera, 'no reading from the clips for 12 s');
    p = page({ dom: false }); ({ A, S, tick } = p);
    await connect(p); st = run(p);
    for (let i = 0; i < 24; i++) { fingers(S, { quality: 0.2 }); tick(1); at(p, st); }
    assert.strictEqual(at(p, st).camera, null, 'a weak signal is something: the clips keep going');
    fingers(S, { quality: 0.2 }); tick(1);
    assert.ok(at(p, st).camera, 'but not for ever');

    // a dead end offers the camera at once; the phone camera switched off says so
    p = page({ dom: false }); ({ A, S } = p);
    S.setFingerLink('unauthorized'); st = run(p);
    S.enabled.phone_camera = false;
    assert.deepStrictEqual([at(p, st).camera.code, at(p, st).camera.tone], ['c_off', 'rest']);
    assert.strictEqual(at(p, st).note, 'Everything works without it, too.');
    // no camera pulse on this phone: it is not mentioned
    p = page({ dom: false, camera: false }); ({ S } = p);
    S.setFingerLink('unauthorized'); st = run(p, 'session');
    assert.deepStrictEqual([at(p, st).camera, at(p, st).note], [null, 'You can still begin. Everything works without it, too.']);
  },

  async 'e: kindling goes straight on when the clips give a pulse, and asks first when they do not'() {
    let p = page(), { A, S, C, doc } = p;
    await connect(p);
    fingers(S);
    let went = 0;
    assert.strictEqual(C.beforeSession(() => went++), false);
    assert.deepStrictEqual([went, hidden(doc)], [1, true], 'no question when the clips already give a pulse');
    assert.deepStrictEqual(plain(C.store.get().last).ok, true);

    p = page(); ({ A, S, C, doc } = p);
    await connect(p);
    went = 0;
    let unlit = 0;
    A.bus.on('unkindle', () => unlit++);
    assert.strictEqual(C.beforeSession(() => went++), true);
    assert.deepStrictEqual([went, hidden(doc), text(doc.getElementById('clipTitle')), labels(doc)], [0, false, 'Before we begin', ['Not now', 'Begin anyway']]);
    assert.ok(text(doc.getElementById('clipBody')).includes('Put a finger in each clip.'));
    fingers(S);
    C.paint();
    const body = text(doc.getElementById('clipBody'));
    assert.ok(body.includes('OK') && body.includes('72') && body.includes('Your pulse is coming through.'), body);
    assert.deepStrictEqual(labels(doc), ['Not now', 'Begin']);
    assert.strictEqual(text(doc.getElementById('clipTell')), 'OK. Your pulse is coming through.', 'said aloud too');
    press(doc, 'Begin');
    assert.deepStrictEqual([went, unlit, hidden(doc)], [1, 0, true]);
    assert.deepStrictEqual(plain(C.store.get().last).via, 'clips');

    // Not now: no session, the lantern goes out
    went = 0;
    S.setFingerLink('scanning');
    assert.strictEqual(C.beforeSession(() => went++), true);
    press(doc, 'Not now');
    assert.deepStrictEqual([went, unlit, hidden(doc)], [0, 1, true]);
    // Begin anyway starts without a reading; the scrim and Escape step back like Not now
    C.beforeSession(() => went++);
    press(doc, 'Begin anyway');
    assert.deepStrictEqual([went, plain(C.store.get().last).ok], [1, false]);
    C.beforeSession(() => went++);
    doc.querySelector('#clipcheck .scrim').click();
    assert.deepStrictEqual([went, unlit], [1, 2]);
    C.beforeSession(() => went++);
    doc.listeners.keydown.forEach(f => f({ key: 'Escape', preventDefault() {}, stopPropagation() {} }));
    assert.deepStrictEqual([went, unlit, hidden(doc)], [1, 3, true]);
  },

  async 'f: no question when the patient switched it off, does not use the clips, or has none'() {
    let p = page(), { S, C, doc } = p;
    await connect(p);
    const ask = doc.getElementById('clipAskSw');
    assert.strictEqual(ask.checked, true, 'on by default');
    ask.checked = false;
    ask.dispatchEvent({ type: 'change' });
    let went = 0;
    assert.strictEqual(C.beforeSession(() => went++), false);
    assert.deepStrictEqual([went, hidden(doc)], [1, true]);
    assert.strictEqual(page({ storage: p.storage }).doc.getElementById('clipAskSw').checked, false, 'kept on this phone');

    p = page(); ({ S, C, doc } = p);
    S.enabled.pulse_stone = false;
    assert.strictEqual(C.beforeSession(() => went++), false, 'pulse stone switched off');
    p = page({ finger: false }); ({ S, C, doc } = p);
    assert.strictEqual(C.beforeSession(() => went++), false, 'no clips on this phone');
    S.feedFingerHub(hubFrame({ quality: 0.1 }));
    assert.strictEqual(C.beforeSession(() => went++), true, 'clips through the hub with no steady pulse: asked');
    assert.strictEqual(went, 3);
  },

  async 'g: from Settings and once on first run; the Settings line says how the last check went'() {
    const storage = new Map();
    let p = page({ storage }), { A, S, C, doc } = p;
    assert.strictEqual(text(doc.getElementById('clipState')), 'Not checked yet');
    doc.getElementById('clipCheckRow').click();
    assert.deepStrictEqual([hidden(doc), text(doc.getElementById('clipTitle')), labels(doc)], [false, 'Check the finger clips', ['Done']]);
    await flush();
    p.plugin.emit('state', { state: 'connected', name: 'Afferent Finger' });
    fingers(S);
    C.paint();
    press(doc, 'Done');
    assert.strictEqual(hidden(doc), true);
    assert.match(text(doc.getElementById('clipState')), /^Worked, today \d\d:\d\d$/);
    assert.deepStrictEqual(Object.keys(plain(C.store.get().last)).sort(), ['at_ms', 'ok', 'via'], 'the outcome only, no numbers');

    // the clips are switched off: Switch on goes through the Settings switch, like the patient's own tap
    S.enabled.pulse_stone = false;
    const stone = doc.querySelector('[data-sensor="pulse_stone"]');
    stone.checked = false;
    let changed = 0;
    stone.addEventListener('change', () => { changed++; S.enabled.pulse_stone = stone.checked; });
    doc.getElementById('clipCheckRow').click();
    assert.ok(text(doc.getElementById('clipBody')).includes('The finger clips are switched off.'));
    doc.querySelector('.clip-inline').click();
    assert.deepStrictEqual([changed, stone.checked], [1, true]);

    // first run: offered once, and only where there are clips
    p = page(); ({ C, doc } = p);
    assert.strictEqual(C.offer(), true);
    assert.ok(text(doc.getElementById('clipOffer')).includes('Try the finger clips?'));
    doc.getElementById('clipOffer').querySelector('.btn.text').click();
    assert.strictEqual(doc.getElementById('clipOffer'), null);
    assert.strictEqual(page({ storage: p.storage }).C.offer(), false, 'once');
    p = page(); doc = p.doc;
    p.C.offer();
    doc.getElementById('clipOffer').querySelectorAll('.btn')[1].click();
    assert.deepStrictEqual([hidden(doc), doc.getElementById('clipOffer')], [false, null], 'Try it opens the check');
    assert.strictEqual(page({ storage }).C.offer(), false, 'not after a check');
    assert.strictEqual(page({ finger: false }).C.offer(), false, 'not without clips');
    await flush();
  },

  async 'h: nothing leaves the phone: no hub message, no network, only the outcome is kept'() {
    const p = page(), { A, S, C, doc, cam } = p, sent = [];
    const emit = A.bus.emit;
    A.bus.emit = (e, d) => { if (e === 'ws') sent.push(d); return emit(e, d); };
    await A.CamPulse.sync();
    S.setFingerLink('unauthorized');
    C.beforeSession(() => {});
    cam.emit(camOk());
    C.paint();
    assert.ok(text(doc.getElementById('clipBody')).includes('The camera picture stays on this phone.'));
    press(doc, 'Begin');
    assert.deepStrictEqual(sent, []);
    assert.deepStrictEqual([...p.storage.keys()].sort(), ['afferent.clipcheck', 'afferent.finger.asked']);
    assert.deepStrictEqual(Object.keys(JSON.parse(p.storage.get('afferent.clipcheck'))).sort(), ['last']);
    const js = read('clipcheck.js');
    for (const re of [/fetch\(/, /XMLHttpRequest/, /WebSocket/, /emit\('ws'/, /A\.Hub/, /sendBeacon/]) assert.ok(!re.test(js), `clipcheck.js uses ${re}`);
  },

  'i: before the session, never inside it; reads the sensors, never feeds them'() {
    const js = read('clipcheck.js'), main = read('main.js'), engine = read('engine.js');
    assert.ok(!/ClipCheck/.test(engine), 'engine.js does not know the check');
    assert.deepStrictEqual((main.match(/ClipCheck/g) || []).length, 2, 'main.js: one call, from the kindle');
    assert.ok(/addEventListener\('kindle', \(\) => A\.ClipCheck \? A\.ClipCheck\.beforeSession\(begin\) : begin\(\)\)/.test(main));
    for (const re of [/feed\w*\(/, /startSession/, /A\.session\.\w+\(/, /setFingerLink|setCameraLink|setFaceState/, /['"]AfferentPulse['"]/, /['"]AfferentFinger['"]/]) assert.ok(!re.test(js), `clipcheck.js: ${re}`);
  },

  'j: plain, warm words: no jargon, nothing alarming, no claims the hardware cannot back'() {
    const js = read('clipcheck.js'), shell = read('gui/shell.js');
    // string literals a person can read: not single words like class names, and not the code inside ${...}
    const shown = (js.match(/'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`/g) || []).filter(s => !/^'[\w.-]*'$/.test(s)).map(s => s.replace(/\$\{[^}]*\}/g, ' ')).join('\n');
    const rows = shell.slice(shell.indexOf("title: 'Before a session'"), shell.indexOf("title: 'Export to your clinic'"));
    for (const [name, t] of [['clipcheck.js', shown], ['Settings rows', rows]]) {
      const bad = t.match(/\b(hrv|rmssd|rppg|ppg|ble|quality|bpm|sensor fusion|error|fail\w*|invalid|warning|alert|problem|broken|abnormal|danger\w*|risk|wrong|stress|diagnos\w*|normal|bad|poor|lamp)\b/gi);
      assert.strictEqual(bad, null, `${name}: ${bad}`);
    }
    assert.ok(shown.includes('Put a finger in each clip.'));
    assert.ok(shown.includes('beats per minute'), 'units in words');
  },

  'k: every icon the check and its Settings rows use is in the bundled icon font'() {
    const names = new Set(fs.readFileSync(path.join(JS, '..', 'fonts', 'icon-names.txt'), 'utf8').trim().split(','));
    const js = read('clipcheck.js'), shell = read('gui/shell.js');
    const used = [...js.matchAll(/icon\((?:[^)]*\? )?'(\w+)'(?: : '(\w+)')?/g)].flatMap(m => [m[1], m[2]]).filter(Boolean);
    used.push(...[...js.matchAll(/cardEl\([^,]+, '[^']+', '(\w+)'\)/g)].map(m => m[1]), 'support');
    const rows = shell.slice(shell.indexOf("title: 'Before a session'"), shell.indexOf("title: 'Export to your clinic'"));
    used.push(...[...rows.matchAll(/icon: '(\w+)'/g)].map(m => m[1]));
    assert.ok(used.length >= 7, used.join());
    assert.deepStrictEqual(used.filter(n => !names.has(n)), [], 'not in demo/fonts/icon-names.txt');
  },
};

(async () => {
  let failed = 0;
  for (const [name, fn] of Object.entries(tests)) {
    try { await fn(); console.log('ok  ', name); } catch (e) { failed++; console.log('FAIL', name, '\n     ', e.message.slice(0, 900)); }
  }
  console.log(`${Object.keys(tests).length - failed} ok, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
