// Renders the music that follows the heart to WAV files, to listen to and to measure. Not a test of the suite.
//   node demo/tests/render_music.js <out dir>
// Runs the app's own util.js, sensors.js, audio.js, music.js and biomusic.js in headless Chrome on an
// OfflineAudioContext. The pulse goes in as the finger sensor gives it over Bluetooth (sensors.js feedFingerBle:
// an hrm frame and an aff1 frame, quality 0.9, finger present). The ticks music.js runs every 25 ms are driven by
// suspend() every 2432 samples (51 ms), so the render is exact and faster than real time.
// Each WAV is the music bus, where the recorded beds play at their mastered level (-20 LUFS); the app then lowers
// all of it by its play curve (-9 dB by day) and the volume of the phone. Next to each WAV a .json has the tempo
// second by second as A.MusicBio gave it. CHROME=<path> picks another Chrome.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const DEMO = path.join(__dirname, '..'), JS = path.join(DEMO, 'js');
const OUT = path.resolve(process.argv[2] || 'music-renders');
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const SR = 48000;

// t: seconds into the render. pulse(t): the bpm the sensor reads, or null for none. trim: start the WAV where the
// generated music starts. beds: the recorded beds and their manifest are there (otherwise the generated music plays alone).
const SCENES = [
  { name: 'stressed_95_gliding_down', clock: 'morning', mode: 'calm', seconds: 90, pulse: () => 95, trim: true },
  { name: 'energised_100', clock: 'morning', mode: 'flow', seconds: 45, pulse: () => 100, trim: true },
  { name: 'tired_night_64_drone', clock: 'night', mode: 'rest', seconds: 45, pulse: () => 64, trim: true },
  { name: 'tired_day_60_lifting', clock: 'morning', mode: 'wake', seconds: 45, pulse: () => 60, trim: true },
  // The handover with the recorded beds: the start bed through the core, the generated music in its place once the
  // flow answer comes, the recorded flow bed back 6 s after the pulse is lost at 45 s, the generated music again
  // once it returns at 75 s.
  { name: 'handover_with_recorded_beds', clock: 'morning', mode: 'flow', seconds: 110, beds: true, pulse: t => t < 45 ? 100 : t < 75 ? null : 92 },
];

// Runs in the page. Loads the app's scripts into an offline context, plays one scene, returns the WAV and the tempo log.
const PAGE = async (scene, files, sources, sr) => {
  const pulseAt = new Function('return ' + scene.pulse)();
  const lead = 8.5, total = (scene.trim ? lead : 0) + scene.seconds + 0.5;
  let seed = 20261114;
  Math.random = () => { seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  window.setInterval = () => 0;
  window.__warn = [];
  console.warn = (...a) => window.__warn.push(a.map(String).join(' '));
  let ctx = null;
  window.AudioContext = function () { return ctx || (ctx = new OfflineAudioContext(2, Math.ceil(total * sr), sr)); };
  const bytes = b64 => Uint8Array.from(atob(b64), c => c.charCodeAt(0)).buffer;
  window.fetch = async url => {
    const name = String(url).split('/').pop(), f = files[name];
    if (!f) return { ok: false, status: 404, json: async () => null, arrayBuffer: async () => new ArrayBuffer(0) };
    return { ok: true, status: 200, json: async () => JSON.parse(f), arrayBuffer: async () => bytes(f) };
  };
  for (const [name, code] of sources) {
    try { (0, eval)(code + '\n//# sourceURL=' + name); } catch (e) { throw new Error(name + ': ' + e.message); }
    if (name === 'util.js') {
      A.now = () => (ctx ? ctx.currentTime : 0);
      A.config = { baselinePulse: 68, reducedMotion: false, sensors: { pulse_stone: true, phone_camera: true } };
    }
  }
  const M = A.Music, S = A.Sensors, B = A.MusicBio;
  M.init();
  M.setRoute('headphones');
  M.bus.out.disconnect();
  M.bus.music.connect(ctx.destination);
  if (scene.beds) await M.load();
  const STEP = 2432 / sr, log = [];
  let fed = -1, logged = -1, on = null, phase = 0;
  const script = [
    [0.1, () => A.bus.emit('ws', { type: 'session_start', clock: scene.clock })],
    [0.2, () => A.bus.emit('segment', 'fadein')],
    [2, () => A.bus.emit('segment', 'checkin')],
    [4, () => A.bus.emit('segment', 'rt')],
    [6, () => { A.bus.emit('mode', scene.mode); A.bus.emit('segment', 'walk'); }],
  ];
  if (!scene.beds) script.forEach(x => { x[0] = Math.min(x[0], 0.3); });
  const tick = () => {
    const t = ctx.currentTime;
    while (phase < script.length && script[phase][0] <= t) script[phase++][1]();
    if (t - fed >= 0.5) {
      fed = t;
      const bpm = pulseAt(t);
      if (bpm != null) {
        if (S.fingerLink.state !== 'connected') S.setFingerLink('connected', 'render');
        S.feedFingerBle({ kind: 'hrm', bpm });
        S.feedFingerBle({ kind: 'aff1', quality: 0.9, presence: 'active', payload_len: 5, finger_bpm: [bpm, bpm], breathing_per_min: 14, rmssd_ms: 32 });
      }
    }
    M.tick();
    if (on == null && M.bed?.bio) on = M.bed.synth.t0;
    if (t - logged >= 1) {
      logged = t;
      log.push({ t: Math.round(t * 10) / 10, pulse: pulseAt(t), following: B.following, bpm: B.bpm, target: B.target, bed: M.bed?.key ?? null, voice: M.bed?.bio ? M.bed.synth.voice : null });
    }
  };
  const next = t => { if (t < total) ctx.suspend(t).then(() => { tick(); next(t + STEP); ctx.resume(); }); };
  next(STEP);
  const buf = await ctx.startRendering();
  const from = scene.trim ? Math.max(0, Math.floor((on ?? 0) * sr)) : 0, n = Math.min(buf.length - from, Math.round(scene.seconds * sr));
  const L = buf.getChannelData(0).subarray(from, from + n), R = buf.getChannelData(1).subarray(from, from + n);
  const wav = new DataView(new ArrayBuffer(44 + n * 6)), str = (o, s) => [...s].forEach((c, i) => wav.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF'); wav.setUint32(4, 36 + n * 6, true); str(8, 'WAVE'); str(12, 'fmt ');
  wav.setUint32(16, 16, true); wav.setUint16(20, 1, true); wav.setUint16(22, 2, true); wav.setUint32(24, sr, true);
  wav.setUint32(28, sr * 6, true); wav.setUint16(32, 6, true); wav.setUint16(34, 24, true); str(36, 'data'); wav.setUint32(40, n * 6, true);
  let o = 44, clipped = 0;
  for (let i = 0; i < n; i++) for (const ch of [L, R]) {
    const x = ch[i]; if (Math.abs(x) >= 1) clipped++;
    const v = Math.max(-8388608, Math.min(8388607, Math.round(x * 8388607)));
    wav.setUint8(o, v & 255); wav.setUint8(o + 1, (v >> 8) & 255); wav.setUint8(o + 2, (v >> 16) & 255); o += 3;
  }
  window.__wav = new Uint8Array(wav.buffer);
  return { log: log.map(x => ({ ...x, t: Math.round((x.t - from / sr) * 10) / 10 })).filter(x => x.t >= 0), startedAt: on, clipped, frames: n, warnings: window.__warn || [] };
};

const cdp = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'render-music-'));
  const proc = spawn(CHROME, ['--headless=new', '--remote-debugging-pipe', '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--mute-audio', `--user-data-dir=${dir}`, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe'] });
  let id = 0, buf = '', err = '';
  const wait = new Map();
  proc.stdio[2].on('data', d => { err = (err + d).slice(-2000); });
  proc.on('exit', code => { for (const w of wait.values()) w.no(new Error(`Chrome exited (${code}): ${err.trim().split('\n').slice(-3).join(' | ')}`)); wait.clear(); });
  proc.stdio[4].on('data', d => {
    buf += d.toString();
    let i;
    while ((i = buf.indexOf('\0')) >= 0) {
      const msg = JSON.parse(buf.slice(0, i)); buf = buf.slice(i + 1);
      const w = msg.id != null && wait.get(msg.id);
      if (w) { wait.delete(msg.id); msg.error ? w.no(new Error(msg.error.message)) : w.ok(msg.result); }
    }
  });
  const send = (method, params = {}, sessionId) => new Promise((ok, no) => {
    const m = { id: ++id, method, params, ...(sessionId ? { sessionId } : {}) };
    wait.set(m.id, { ok, no });
    proc.stdio[3].write(JSON.stringify(m) + '\0');
  });
  const close = async () => {
    const gone = new Promise(r => proc.exitCode != null ? r() : proc.once('exit', r));
    try { proc.kill(); } catch {}
    await gone;
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
  };
  return { send, close };
};

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const sources = ['util.js', 'sensors.js', 'audio.js', 'music.js', 'biomusic.js'].map(f => [f, fs.readFileSync(path.join(JS, f), 'utf8')]);
  const music = path.join(DEMO, 'audio/music');
  const beds = { 'manifest.json': fs.readFileSync(path.join(music, 'manifest.json'), 'utf8') };
  for (const t of Object.values(JSON.parse(beds['manifest.json']).tracks)) beds[t.files.m4a] = fs.readFileSync(path.join(music, t.files.m4a)).toString('base64');
  const { send, close } = cdp();
  try {
    let page = null;
    for (let i = 0; i < 50 && !page; i++) {
      page = (await send('Target.getTargets')).targetInfos.find(t => t.type === 'page');
      if (!page) await new Promise(r => setTimeout(r, 100));
    }
    const { sessionId } = await send('Target.attachToTarget', { targetId: page.targetId, flatten: true });
    const run = async expression => {
      const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId);
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
      return r.result.value;
    };
    for (const scene of SCENES) {
      await send('Page.navigate', { url: 'about:blank' }, sessionId).catch(() => {});
      await new Promise(r => setTimeout(r, 200));
      const sc = { ...scene, pulse: scene.pulse.toString() };
      const res = await run(`(${PAGE})(${JSON.stringify(sc)}, ${JSON.stringify(scene.beds ? beds : {})}, ${JSON.stringify(sources)}, ${SR})`);
      const size = await run('window.__wav.length'), parts = [];
      for (let o = 0; o < size; o += 6e6) parts.push(Buffer.from(await run(`(() => { let s = ''; const b = window.__wav.subarray(${o}, ${o + 6e6}); for (let i = 0; i < b.length; i += 32768) s += String.fromCharCode.apply(null, b.subarray(i, i + 32768)); return btoa(s); })()`), 'base64'));
      const file = path.join(OUT, scene.name + '.wav');
      fs.writeFileSync(file, Buffer.concat(parts));
      fs.writeFileSync(path.join(OUT, scene.name + '.json'), JSON.stringify({ scene: { ...scene, pulse: scene.pulse.toString() }, startedAt: res.startedAt, clipped: res.clipped, tempo: res.log }, null, 1));
      const first = res.log.find(x => x.following), last = [...res.log].reverse().find(x => x.bpm != null);
      console.log(`${scene.name}.wav  ${(res.frames / SR).toFixed(1)} s  clipped samples ${res.clipped}  tempo ${first?.bpm} -> ${last?.bpm} bpm, target ${last?.target}  warnings ${res.warnings.length}`);
      for (const w of res.warnings.slice(0, 3)) console.log('  warning: ' + w);
    }
  } finally { await close(); }
})().catch(e => { console.error(e); process.exit(1); });
