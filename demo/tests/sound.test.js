// Run: node demo/tests/sound.test.js
// Room sound level (js/sound.js): the level math on synthetic buffers (A-weighting, RMS to dB, bands, the 1-minute
// level), the opt-in (switched off, no microphone is ever asked for), the pause for Talk, the phone's own sound kept out
// of the reading, the overlay and signals rows, the session record, the one soft line and the calm lean, and that no
// audio and no block levels reach the session record or any message to the hub. All numbers are test inputs.
// The music side (the web view's audio session left alone) is in music.test.js.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
const { load, run, plain, JS } = require('./harness');

const ROOT = path.join(JS, '..', '..');
const read = (...p) => fs.readFileSync(path.join(...p), 'utf8');
const go = (t, f) => vm.runInContext(read(JS, f), t.ctx, { filename: f });
const flush = () => new Promise(r => setImmediate(r));
const sine = (f, amp, n, fs = 48000) => Float32Array.from({ length: n }, (_, i) => amp * Math.sin(2 * Math.PI * f * i / fs));

// The native plugin as ios/App/App/AfferentSoundLevel.swift answers: status without the microphone; measure opens it only
// when Afferent is quiet, on headphones, or on the speaker with echo-cancelled input, else `skipped`; stop ends a window.
const fakePlugin = () => {
  const p = {
    calls: [], route: 'speaker', permission: 'granted', echo: false, pending: null, level: -60,
    async status() { p.calls.push('status'); return { permission: p.permission, route: p.route, measuring: !!p.pending }; },
    measure(opts) { p.calls.push('measure'); p.opts = opts; return new Promise(res => { p.pending = { res, opts }; }); },
    async stop() { p.calls.push('stop'); const x = p.pending; p.pending = null; x?.res({ aborted: true }); },
    finish(blocks) {
      const x = p.pending;
      assert.ok(x, 'no window open');
      p.pending = null;
      const shielded = p.route === 'headphones' || (p.route === 'speaker' && p.echo);
      if (!x.opts.quiet && !shielded) return x.res({ skipped: true, route: p.route, echo_cancelled: false });
      x.res({ blocks: blocks ?? Array(40).fill(p.level), route: p.route, echo_cancelled: p.route === 'speaker' && p.echo, interrupted: false, permission: 'granted' });
    },
  };
  return p;
};

// The app with sound.js on a phone (ios), its plugin faked; vitals and the overlay and the line at the top loaded too.
const phone = ({ on = true, native = true } = {}) => {
  const t = load({ vitals: true }), plugin = fakePlugin();
  if (native) t.ctx.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'ios', Plugins: { AfferentSoundLevel: plugin } };
  for (const f of ['sound.js', 'livevitals.js', 'guide.js']) go(t, f);
  const { A } = t, R = A.RoomSound, ws = [];
  A.bus.on('ws', m => ws.push(plain(m)));
  A.config.roomSound = on;
  R.sync();
  // one whole window: due, asked, open, answered with `blocks` (dBFS) or the plugin's own level
  const window = async (blocks, dt = 1) => {
    t.tick(dt);
    const pr = R.tick();
    await flush();
    if (plugin.pending) plugin.finish(blocks);
    return pr && pr.then ? await pr : pr;
  };
  return { ...t, plugin, R, ws, window };
};
const off = R => R.OFFSET.ios;

const tests = {
  'a: A-weighting on synthetic sines follows the IEC 61672 curve within 1 dB, 0 dB at 1 kHz'() {
    const { R } = phone({ on: false }), M = R.math;
    const curve = [[50, -30.2], [100, -19.1], [250, -8.6], [500, -3.2], [1000, 0], [2000, 1.2], [4000, 1.0], [8000, -1.1], [10000, -2.5]];
    for (const fs of [48000, 44100]) for (const [f, a] of curve) {
      const steady = M.blocks(sine(f, 1, fs, fs), fs).slice(5);
      assert.ok(Math.abs(M.leq(steady) + 3.0103 - a) < 1, `${f} Hz at ${fs}: ${M.leq(steady) + 3.0103} vs ${a}`);
      assert.ok(Math.abs(20 * Math.log10(M.response(M.aweight(fs).sections, f, fs) * M.aweight(fs).gain) - a) < 1, `${f} Hz response`);
    }
  },

  'b: RMS to dBFS, one level per 100 ms block, and a snapshot as the browser reads it'() {
    const { R } = phone({ on: false }), M = R.math;
    const b = M.blocks(sine(1000, 0.1, 48000), 48000);
    assert.strictEqual(b.length, 10, 'one second is ten blocks');
    assert.ok(Math.abs(b[9] - -23.0103) < 0.05, `0.1 of full scale is 20 log10(0.1/√2): ${b[9]}`);
    assert.ok(Math.abs(M.blocks(sine(1000, 0.01, 48000), 48000)[9] - b[9] + 20) < 0.05, 'ten times quieter is 20 dB down');
    assert.strictEqual(M.dbfs(0), -120);
    assert.strictEqual(M.dbfs(1), 0);
    assert.deepStrictEqual(plain(M.blocks(new Float32Array(9600), 48000)), [-120, -120], 'silence is the floor');
    assert.ok(Math.abs(M.snapshot(sine(1000, 0.1, 4096), 48000) - -23.0103) < 0.3, 'an analyser snapshot reads the same');
  },

  'c: the equivalent level is the mean energy, and the bands are quiet, normal, lively, loud'() {
    const { R } = phone({ on: false }), M = R.math;
    assert.strictEqual(M.leq([40, 40, 40]), 40);
    assert.ok(Math.abs(M.leq([30, 50]) - 47.0) < 0.05, 'a loud half dominates: 47, not the mean 40');
    assert.strictEqual(M.leq([]), null);
    assert.deepStrictEqual([39.9, 40, 54.9, 55, 64.9, 65, 90].map(M.band), ['quiet', 'normal', 'normal', 'lively', 'lively', 'loud', 'loud']);
    assert.strictEqual(M.share([50, 55, 60, 70], 55), 0.75);
  },

  async 'd: a window becomes approx. dB: offset added, silent blocks dropped, too few real blocks no reading'() {
    const t = phone(), { R, A } = t;
    const w = await t.window(Array(40).fill(-60));
    assert.strictEqual(w.db, -60 + off(R));
    assert.deepStrictEqual(plain(R.reading(A.now())), { db: 35, band: 'quiet', at: A.now() });
    assert.strictEqual(R.accept([...Array(19).fill(-50), ...Array(21).fill(-120)], A.now()), null, 'a muted input is no measurement');
    assert.strictEqual(R.accept(Array(40).fill(NaN), A.now()), null);
    t.ctx.localStorage = { getItem: k => k === R.OFFSET_KEY ? '100' : null };
    assert.strictEqual(R.accept(Array(40).fill(-60), A.now()).db, 40, 'a per-phone calibration replaces the offset');
  },

  async 'e: the 1-minute level: windows of the last minute before the newest, energy-averaged; stale readings go'() {
    const t = phone(), { R, A } = t;
    R.accept(Array(40).fill(-65), A.now());          // 30 dB
    t.tick(30);
    R.accept(Array(40).fill(-45), A.now());          // 50 dB, 30 s later: both count
    assert.strictEqual(R.reading(A.now()).db, 47);
    t.tick(61);
    R.accept(Array(40).fill(-65), A.now());          // more than a minute after the 50: alone
    assert.strictEqual(R.reading(A.now()).db, 30);
    t.tick(R.FRESH_S + 1);
    assert.strictEqual(R.reading(A.now()), null, 'older than ten minutes: no number');
  },

  async 'f: switched off, no microphone is ever asked for, natively or in a browser'() {
    const t = phone({ on: false }), { R, A, plugin } = t;
    for (let i = 0; i < 400; i++) { t.tick(5); R.tick(); A.bus.emit('segment', 'rest'); }
    A.bus.emit('voice', { state: 'idle' });
    R.sync();
    await flush();
    assert.deepStrictEqual(plugin.calls, []);
    assert.deepStrictEqual(plain(R.rows(A.now())), [], 'no row while off');
    assert.strictEqual(R.line(A.now()), null);

    const w = phone({ on: false, native: false });
    let asked = 0;
    w.ctx.navigator.mediaDevices = { getUserMedia: async () => { asked++; throw new Error('no'); } };
    for (let i = 0; i < 400; i++) { w.tick(5); w.R.tick(); w.A.bus.emit('segment', 'rest'); }
    await flush();
    assert.strictEqual(asked, 0);

    // on, then off again: the window that runs is stopped and every reading forgotten
    A.config.roomSound = true; R.sync();
    await t.window();
    assert.ok(R.reading(A.now()));
    t.tick(R.FRESH_S); R.nextAt = 0;
    t.tick(1); R.tick(); await flush();
    assert.ok(plugin.pending, 'a second window is open');
    A.config.roomSound = false; R.sync();
    assert.strictEqual(plugin.calls.at(-1), 'stop');
    assert.deepStrictEqual([R.windows.length, R.status, R.reading(A.now())], [0, 'off', null]);
  },

  async 'g: Talk takes the microphone: a running window stops at once, none starts until the conversation is over'() {
    const t = phone(), { R, A, plugin } = t;
    t.tick(1); const pr = R.tick(); await flush();
    assert.ok(plugin.pending);
    A.bus.emit('voice', { state: 'connecting' });
    assert.strictEqual(plugin.calls.at(-1), 'stop', 'stop is asked for in the same turn as Talk starts');
    await pr;
    assert.deepStrictEqual([R.status, R.windows.length], ['paused', 0], 'nothing of the cut window is kept');
    A.Voice = { s: {}, state: 'listening' };
    const n = plugin.calls.length;
    for (let i = 0; i < 60; i++) { t.tick(10); R.tick(); }
    await flush();
    assert.strictEqual(plugin.calls.length, n, 'no window during Talk');
    assert.deepStrictEqual(plain(R.rows(A.now())[0].lines), ['Paused while you talk']);
    A.Voice = { s: null, state: 'idle' };
    A.bus.emit('voice', { state: 'idle' });
    assert.strictEqual(R.status, 'waiting');
    t.tick(9); assert.strictEqual(R.tick(), null, 'a moment after Talk before the microphone is opened again');
    const w = await t.window(undefined, 2);
    assert.ok(w, 'measuring again after Talk');
  },

  async 'h: Afferent playing out of the speaker is not a room: no window unless headphones, echo-cancelled input or quiet'() {
    const t = phone(), { R, A, plugin } = t;
    const ctx = { state: 'running', ls: [], addEventListener(e, f) { this.ls.push(f); }, removeEventListener(e, f) { this.ls = this.ls.filter(x => x !== f); } };
    A.Audio = { on: true, ctx };
    assert.strictEqual(await t.window(), null);
    assert.deepStrictEqual([plugin.opts.quiet, R.status], [false, 'own_sound']);
    assert.deepStrictEqual(plain(R.rows(A.now())[0].lines), ['Measured when Afferent is quiet or with headphones']);
    plugin.route = 'external';
    R.nextAt = 0; const n = plugin.calls.length;
    assert.strictEqual(await t.window(), null);
    assert.deepStrictEqual(plugin.calls.slice(n), ['status'], 'AirPlay or HDMI with Afferent playing: the microphone is not even opened');
    plugin.route = 'speaker'; plugin.echo = true; R.nextAt = 0;
    assert.ok(await t.window(), 'echo-cancelled speaker input');
    plugin.echo = false; plugin.route = 'headphones'; R.nextAt = 0;
    assert.ok(await t.window(), 'headphones');
    plugin.route = 'speaker'; A.Audio.on = false; R.nextAt = 0;
    assert.ok(await t.window(), 'Sound off');
    A.Audio.on = true; ctx.state = 'suspended'; R.nextAt = 0;
    t.tick(1); const pr = R.tick(); await flush();
    ctx.state = 'running'; ctx.ls.forEach(f => f());       // a tap starts the audio during the window
    plugin.finish();
    assert.strictEqual(await pr, null, 'the audio began during the window: not kept');
    assert.strictEqual(R.status, 'own_sound');
  },

  async 'i: the overlay row, the signals row under Your room, both gone when off'() {
    const t = phone(), { R, A } = t;
    const s = A.startSession({ clock: 'morning', input: 'touch', stage: true, profile: 'live' });
    run(A, t.tick, s, 4);
    s.phase = 'walk';
    assert.strictEqual(A.LiveVitals.model(s, A.now()).sound, null, 'no reading: no row');
    await t.window(Array(40).fill(-57.4));
    assert.strictEqual(A.LiveVitals.model(s, A.now()).sound, 'Room sound approx. 38 dB · quiet');
    const room = plain(A.Vitals.model(A.now()).room);
    assert.deepStrictEqual(room, { title: 'Your room', rows: [{ icon: 'volume_up', label: 'Room sound', value: '38', lines: ['approx. dB · quiet', 'Phone microphone, nothing recorded'] }] });
    A.config.roomSound = false; R.sync();
    assert.strictEqual(A.LiveVitals.model(s, A.now()).sound, null);
    assert.strictEqual(A.Vitals.model(A.now()).room, null);
    const page = read(JS, '..', 'index.html');
    assert.ok(page.indexOf('class="lv-sound lv-extra"') > page.indexOf('class="lv-room lv-extra"'), 'next to the room climate row');
    assert.ok(page.indexOf('js/sound.js') < page.indexOf('js/livevitals.js'));
  },

  async 'j: the session records median dB and share loud, numbers only; nothing when off'() {
    const record = async on => {
      const t = phone({ on }), { A } = t;
      let doc = null;
      A.bus.on('sessionEnd', d => { doc = plain(d); });
      const s = A.startSession({ clock: 'morning', input: 'touch', stage: true, profile: 'live' });
      await t.window([...Array(30).fill(-60), ...Array(10).fill(-35)]);   // 35 dB, a quarter at 60
      run(A, t.tick, s, 3);
      t.R.nextAt = 0;
      await t.window(Array(40).fill(-58));                                // 37 dB
      s.finish('partial');
      return { doc, ws: t.ws };
    };
    const { doc, ws } = await record(true);
    // 80 blocks: 30 at 35 dB, 40 at 37, 10 at 60; the median is 37 and 10 of 80 are at 55 or more
    assert.deepStrictEqual(doc.context.room_sound, { median_db: 37, share_loud: 0.13, windows: 2 });
    assert.strictEqual((await record(false)).doc.context.room_sound, null);
    // the schema takes exactly these numbers
    const schema = JSON.parse(read(ROOT, 'contracts', 'session.v3.schema.json')).$defs.context.properties.room_sound;
    const obj = schema.oneOf.find(o => o.type === 'object');
    assert.deepStrictEqual(Object.keys(obj.properties).sort(), Object.keys(doc.context.room_sound).sort());
    assert.strictEqual(obj.additionalProperties, false);
    assert.deepStrictEqual([obj.properties.median_db.type, obj.properties.share_loud.type, obj.properties.windows.type], ['integer', 'number', 'integer']);
    for (const f of ['session_example.json', 'session_finger_example.json']) assert.ok('room_sound' in JSON.parse(read(ROOT, 'contracts', 'fixtures', f)).context, f);
    // no audio, and no block levels, anywhere in the record or in what went to the hub
    const end = ws.find(m => m.type === 'session_end');
    for (const [what, x] of [['record', doc], ['hub messages', ws]]) {
      const text = JSON.stringify(x);
      assert.ok(!/"(audio|pcm|samples|buffer|blocks|dbs|waveform|recording)"/i.test(text), `${what}: an audio key`);
      const arrays = [];
      JSON.parse(text, (k, v) => { if (Array.isArray(v) && v.length >= 20 && v.every(n => typeof n === 'number')) arrays.push(k); return v; });
      assert.deepStrictEqual(arrays.filter(k => !/^(series|pulse|rr|ibi|trials|samples_ms)$/.test(k)), [], `${what}: a long run of numbers`);
    }
    assert.ok(end && JSON.stringify(end).includes('"room_sound":{"median_db":37,"share_loud":0.13,"windows":2}'), 'the session_end message carries the same numbers');
    assert.ok(!ws.some(m => /sound/.test(m.type)), 'no live sound message to the hub');
  },

  'k: sound.js keeps nothing and sends nothing: no storage writes, no network, no logging, no hub'() {
    const src = read(JS, 'sound.js');
    for (const [re, what] of [[/localStorage\.setItem|sessionStorage|indexedDB/, 'storage'], [/\bfetch\(|XMLHttpRequest|WebSocket|sendBeacon/, 'network'],
      [/console\.|\blog\(/, 'logging'], [/A\.Hub|emit\('ws'/, 'the hub'], [/MediaRecorder|createScriptProcessor|audioSession\.type\s*=/, 'recording or the audio session']]) {
      assert.ok(!re.test(src), what);
    }
    for (const f of ['ios/App/App/AfferentSoundLevel.swift', 'android/app/src/main/java/fi/junction/afferent/AfferentSoundLevelPlugin.kt']) {
      const n = read(ROOT, f);
      assert.ok(!/AVAudioRecorder|MediaRecorder\(|FileOutputStream|write\(to|print\(|NSLog|Log\.[dviwe]\(|duckOthers|\.measurement|setVoiceProcessingEnabled|MODE_IN_COMMUNICATION|requestAudioFocus/.test(n), f);
    }
    const swift = read(ROOT, 'ios/App/App/AfferentSoundLevel.swift');
    for (const o of ['.mixWithOthers', '.defaultToSpeaker', '.allowBluetoothA2DP']) assert.ok(swift.includes(o), o);
    assert.ok(swift.includes('mode: .default'));
  },

  async 'l: one soft line as calm or wind-down games begin in a loud room, once a session'() {
    const t = phone(), { A, R } = t;
    const s = A.startSession({ clock: 'morning', input: 'touch', stage: true, profile: 'live' });
    s.phase = 'walk'; s.mode = 'flow';
    const mem = {};
    await t.window(Array(40).fill(-38));                  // 57 dB: lively
    assert.strictEqual(A.Guide.line(s, A.now(), mem), null, 'flow games: nothing');
    s.mode = 'calm';
    assert.deepStrictEqual(plain(A.Guide.line(s, A.now(), mem)), { text: 'It’s a bit loud around you. Headphones or a quieter spot can help.', kind: 'line' });
    t.tick(6.1);
    assert.strictEqual(A.Guide.line(s, A.now(), mem), null, 'gone after a few seconds');
    s.mode = 'flow'; A.Guide.line(s, A.now(), mem); s.mode = 'rest';
    assert.strictEqual(A.Guide.line(s, A.now(), mem), null, 'once a session');
    const quiet = phone(), s2 = quiet.A.startSession({ clock: 'night', input: 'touch', stage: true, profile: 'live' });
    await quiet.window(Array(40).fill(-50));             // 45 dB: normal
    s2.phase = 'walk'; s2.mode = 'rest';
    assert.strictEqual(quiet.A.Guide.line(s2, quiet.A.now(), {}), null, 'a normal room: nothing');
    assert.ok(!/must|should|warning|alarm|too loud/i.test(quiet.A.Guide.LINE.loud), 'kind words only');
    R.windows = [];
  },

  async 'm: a very loud room leans a steady state to calm games, and only that'() {
    const t = phone(), { A } = t;
    const s = A.startSession({ clock: 'morning', input: 'touch', stage: true, profile: 'live' });
    s.a = 0; s.fat = 0; s.pulseNow = 68;
    assert.deepStrictEqual(plain(s.assess()).mode, 'flow');
    await t.window(Array(40).fill(-35));                 // 60 dB: lively, not very loud
    assert.strictEqual(s.assess().mode, 'flow');
    t.R.nextAt = 0;
    await t.window(Array(40).fill(-25), 61);             // 70 dB
    const r = plain(s.assess());
    assert.deepStrictEqual([r.state, r.mode, r.basis, r.reasons], ['steady', 'calm', 'pulse', ['pulse_steady', 'room_loud']]);
    s.pulseNow = null;
    assert.deepStrictEqual(plain(s.assess()).reasons, ['no_pulse', 'room_loud'], 'no pulse yet: calm too');
    s.pulseNow = 68; s.fat = 0.9;
    assert.deepStrictEqual([s.assess().state, s.assess().mode], ['tired', 'fatigue'], 'tired eyes still win');
    s.fat = 0; s.a = -2;
    assert.strictEqual(s.assess().mode, 'wake', 'a low pulse by day still gets wake-up games');
    assert.strictEqual(A.LiveVitals.reason({ state: 'steady', to: 'calm', reasons: ['pulse_steady', 'room_loud'] }), 'Pulse near rest, loud room → calmer games');
    const enumR = JSON.stringify(JSON.parse(read(ROOT, 'contracts', 'session.v3.schema.json')));
    assert.ok(enumR.includes('"room_loud"'), 'the contract knows the reason');
    A.config.roomSound = false; t.R.sync();
    s.pulseNow = 68; s.a = 0;
    assert.strictEqual(s.assess().mode, 'flow', 'switched off: no lean');
  },

  async 'n: in a browser: no processing asked for, the microphone released after the window, Safari left alone while it plays'() {
    const t = phone({ native: false }), { A, R, ctx } = t;
    const timers = [];
    ctx.setInterval = f => { timers.push(f); return timers.length; };
    ctx.clearInterval = id => { timers[id - 1] = null; };
    const asked = [], tracks = [];
    ctx.navigator.mediaDevices = { getUserMedia: async c => { asked.push(c); const tr = { readyState: 'live', stop() { this.readyState = 'ended'; }, getSettings: () => ({ echoCancellation: true, noiseSuppression: false, autoGainControl: false }) }; tracks.push(tr); return { getTracks: () => [tr] }; } };
    const snap = sine(1000, 0.1, 4096);
    ctx.AudioContext = class { constructor() { this.sampleRate = 48000; this.closed = false; } resume() { return Promise.resolve(); } close() { this.closed = true; }
      createMediaStreamSource() { return { connect() {}, disconnect() {} }; } createAnalyser() { return { fftSize: 0, getFloatTimeDomainData: b => b.set(snap.subarray(0, b.length)) }; } };
    t.tick(1);
    const pr = R.tick();
    await flush(); await flush();
    for (let i = 0; i < 45; i++) timers.forEach(f => f?.());
    const w = await pr;
    assert.deepStrictEqual(plain(asked), [{ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: false, autoGainControl: false } }]);
    assert.ok(w && Math.abs(w.db - (-23 + R.OFFSET.web)) < 0.5, JSON.stringify(w));
    assert.ok(tracks.every(tr => tr.readyState === 'ended'), 'the microphone is released');
    // Safari: the page's music and microphone share one audio session; with Afferent playing the window waits
    ctx.navigator.audioSession = { type: 'ambient' };
    A.Audio = { on: true, ctx: { state: 'running' } };
    R.nextAt = 0; t.tick(1);
    assert.strictEqual(await R.tick(), null);
    assert.deepStrictEqual([asked.length, R.status, ctx.navigator.audioSession.type], [1, 'own_sound', 'ambient']);
  },

  'o: the switch is its own row under Sensors, off by default, and the microphone text covers it'() {
    const shell = read(JS, 'gui', 'shell.js'), main = read(JS, 'main.js');
    assert.ok(shell.includes(`{ icon: 'volume_up', label: 'Room sound level', sup: 'Measures how loud the room is, never records', sw: 'id="roomSoundSw"' }`));
    assert.ok(/roomSound: saved\.roomSound === true/.test(main), 'off unless chosen, on a phone and in the browser');
    assert.ok(/\$\('roomSoundSw'\)\.onchange = e => \{ A\.config\.roomSound = e\.target\.checked; saveSettings\(\); A\.RoomSound\?\.sync\(\); \}/.test(main));
    assert.ok(/store\.set\('afferent\.settings', \{[^}]*roomSound: A\.config\.roomSound/.test(main), 'saved');
    const plist = read(ROOT, 'ios', 'App', 'App', 'Info.plist'), mic = plist.match(/NSMicrophoneUsageDescription<\/key>\s*<string>([^<]*)</)[1];
    assert.ok(/voice companion/.test(mic) && /how loud the room is/.test(mic) && /Nothing is recorded/.test(mic), mic);
    assert.ok(read(ROOT, 'android', 'app', 'src', 'main', 'AndroidManifest.xml').includes('android.permission.RECORD_AUDIO'));
    const reg = read(ROOT, 'ios', 'App', 'App', 'AfferentEyes.swift'), proj = read(ROOT, 'ios', 'App', 'App.xcodeproj', 'project.pbxproj');
    assert.ok(reg.includes('registerPluginInstance(AfferentSoundLevelPlugin())'));
    for (const f of ['AfferentSoundLevel.swift in Sources', 'AfferentSoundLevelMeter.swift in Sources']) assert.strictEqual(proj.split(f).length - 1, 2, f);
    assert.ok(read(ROOT, 'android', 'app', 'src', 'main', 'java', 'fi', 'junction', 'afferent', 'AfferentPlugins.kt').includes('AfferentSoundLevelPlugin::class.java'));
  },
};

(async () => {
  let failed = 0;
  for (const [name, f] of Object.entries(tests)) {
    try { await f(); console.log('ok  ', name); } catch (e) { failed++; console.log('FAIL', name, '\n', e.stack || e); }
  }
  console.log(`${Object.keys(tests).length - failed} ok, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
