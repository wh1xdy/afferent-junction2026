const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { load: loadEngine, JS } = require('./harness');

const DEMO = path.join(__dirname, '..');
const MUSIC = JSON.parse(fs.readFileSync(path.join(DEMO, 'audio/music/manifest.json'), 'utf8'));
const AMB = JSON.parse(fs.readFileSync(path.join(DEMO, 'audio/manifest.json'), 'utf8'));
const BED_FILES = new Map(Object.entries(MUSIC.tracks).filter(([, t]) => t.role === 'bed').map(([k, t]) => [t.files.m4a, k]));

const finite = (...ts) => ts.forEach(t => { if (!Number.isFinite(t)) throw new TypeError('The provided double value is non-finite.'); if (t < 0) throw new RangeError('negative time'); });

class Param {
  constructor(v) { this.value = v; }
  setValueAtTime(v, t) { finite(t); this.value = v; }
  linearRampToValueAtTime(v, t) { finite(t); this.value = v; }
  exponentialRampToValueAtTime(v, t) { finite(t); this.value = v; }
  setTargetAtTime(v, t, c) { finite(t, c); this.value = v; }
  setValueCurveAtTime(c, t, d) { finite(t, d); this.value = c[c.length - 1]; }
  cancelScheduledValues(t) { finite(t); }
  cancelAndHoldAtTime(t) { finite(t); }
}

const PARAMS = ['gain', 'frequency', 'Q', 'detune', 'playbackRate', 'pan', 'positionX', 'positionY', 'positionZ', 'threshold', 'knee', 'ratio', 'attack', 'release'];

const webAudio = () => {
  const sources = [], held = [], live = { contexts: [] };
  let hold = () => false;
  class Ctx {
    constructor() {
      this.currentTime = live.now ?? 0; this.sampleRate = 48000; this.state = live.suspended ? 'suspended' : 'running';
      this.destination = this.node('destination'); this.suspends = 0; this.resumes = 0;
      live.contexts.push(this);
    }
    node(kind, extra = {}) {
      const n = { kind, outs: new Set(), channelCount: 2, connect: to => { n.outs.add(to); return to; }, disconnect: () => { n.outs.clear(); }, ...extra };
      for (const p of PARAMS) n[p] = new Param(p === 'gain' || p === 'playbackRate' ? 1 : 0);
      return n;
    }
    scheduled(kind, extra) {
      const n = this.node(kind, extra);
      Object.assign(n, {
        startAt: null, stopAt: null,
        start(when = 0, offset = 0) { if (n.startAt !== null) throw new Error('InvalidStateError: started twice'); finite(when, offset); n.startAt = when; n.offset = offset; },
        stop(when = 0) { if (n.startAt === null) throw new Error('InvalidStateError: not started'); finite(when); n.stopAt = when; },
      });
      n.ctx = this;
      sources.push(n);
      return n;
    }
    createGain() { return this.node('gain'); }
    createBiquadFilter() { return this.node('biquad'); }
    createDynamicsCompressor() { return this.node('compressor'); }
    createStereoPanner() { return this.node('stereo'); }
    createPanner() { return this.node('panner', { setPosition() {} }); }
    createChannelSplitter() { return this.node('splitter'); }
    createChannelMerger() { return this.node('merger'); }
    createConvolver() { return this.node('convolver'); }
    createBufferSource() { return this.scheduled('buffer', { buffer: null, loop: false }); }
    createOscillator() { return this.scheduled('osc', { type: 'sine' }); }
    createBuffer(ch, len, sr) { return { numberOfChannels: ch, length: len, sampleRate: sr, duration: len / sr, getChannelData: () => new Float32Array(len) }; }
    decodeAudioData(data, ok) {
      const job = { file: data.file, done: () => ok(data.buffer) };
      if (hold(data.file)) held.push(job); else Promise.resolve().then(job.done);
    }
    resume() { this.resumes++; if (live.suspended) return new Promise(() => {}); this.state = 'running'; return Promise.resolve(); }
    suspend() { this.suspends++; this.state = 'suspended'; return Promise.resolve(); }
  }
  const release = file => {
    const i = held.findIndex(j => j.file === file);
    assert.ok(i >= 0, 'no held decode for ' + file);
    held.splice(i, 1)[0].done();
  };
  return { Ctx, sources, held, live, release, holdWith: f => { hold = f; } };
};

const bufferFor = file => {
  const bed = BED_FILES.get(file), t = bed && MUSIC.tracks[bed];
  const duration = t ? t.len_s + 2 * MUSIC.pad_s : file.includes('dawn_bloom') ? 8 : 12;
  return { file, duration, numberOfChannels: 2, length: Math.round(duration * 48000) };
};

const app = ({ music = MUSIC, suspended = false } = {}) => {
  const wa = webAudio();
  wa.live.suspended = suspended;
  let now = 0, timers = [], seq = 0;
  const intervals = [], docListeners = {}, calls = { dawnPhrase: 0 };
  const ctx = {
    console: { ...console, warn: (...a) => { calls.warnings = [...(calls.warnings || []), a.map(String).join(' ')]; } },
    Math, Date, JSON, Set, Map, Object, Array, Number, String, Promise, Float32Array, Error, TypeError, URLSearchParams,
    setTimeout: (f, ms = 0) => { timers.push({ id: ++seq, at: now + Math.max(0, ms) / 1000, f }); return seq; },
    clearTimeout: id => { timers = timers.filter(t => t.id !== id); },
    setInterval: (f, ms) => { intervals.push({ f, every: ms / 1000, next: ms / 1000 }); return intervals.length; },
    clearInterval: () => {},
    navigator: { audioSession: { type: 'auto' } },
    document: { hidden: false, addEventListener: (t, f) => { (docListeners[t] ||= []).push(f); } },
    fetch: async url => {
      if (url.endsWith('music/manifest.json')) return { ok: !!music, json: async () => JSON.parse(JSON.stringify(music)) };
      if (url.endsWith('audio/manifest.json')) return { ok: true, json: async () => JSON.parse(JSON.stringify(AMB)) };
      const file = url.split('/').pop();
      return { ok: true, arrayBuffer: async () => ({ file, buffer: bufferFor(file) }) };
    },
  };
  ctx.window = ctx;
  ctx.AudioContext = wa.Ctx;
  vm.createContext(ctx);
  for (const f of ['util.js', 'audio.js', 'music.js', 'ambience.js']) vm.runInContext(fs.readFileSync(path.join(JS, f), 'utf8'), ctx, { filename: f });
  const A = ctx.A, M = A.Music, Au = A.Audio;
  const phrase = Au.dawnPhrase;
  Au.dawnPhrase = (...a) => { calls.dawnPhrase++; return phrase.apply(Au, a); };
  const settle = () => new Promise(r => setImmediate(r));
  const advance = async sec => {
    const end = now + sec;
    while (now < end - 1e-9) {
      now = Math.min(end, now + 0.025);
      wa.live.now = now;
      wa.live.contexts.forEach(c => { c.currentTime = now; });
      for (;;) {
        const due = timers.filter(t => t.at <= now).sort((a, b) => a.at - b.at)[0];
        if (!due) break;
        timers = timers.filter(t => t !== due);
        due.f();
      }
      for (const iv of intervals) if (now >= iv.next - 1e-9) { iv.next += iv.every; iv.f(); }
      await settle();
    }
    await settle();
  };
  const emit = (e, d) => A.bus.emit(e, d);
  const fire = t => (docListeners[t] || []).forEach(f => f());
  const isLive = n => n.startAt !== null && (n.stopAt === null || n.stopAt > now);
  const bedSources = () => wa.sources.filter(n => n.kind === 'buffer' && n.buffer && BED_FILES.has(n.buffer.file));
  const bedsOf = key => bedSources().filter(n => BED_FILES.get(n.buffer.file).startsWith(key));
  const liveBeds = () => bedSources().filter(isLive);
  const unstoppedBeds = () => bedSources().filter(n => n.startAt !== null && n.stopAt === null);
  const drones = () => wa.sources.filter(n => n.kind === 'osc' && n.type === 'sawtooth' && isLive(n));
  const check = () => {
    const open = unstoppedBeds(), mine = new Set(M.bed?.srcs || []);
    assert.ok(open.length <= 1, `${open.length} beds play with no stop scheduled: ${open.map(n => n.buffer.file).join(', ')}`);
    for (const n of liveBeds()) assert.ok(mine.has(n) || n.stopAt !== null, `${n.buffer.file} plays but is not the current bed and never stops`);
  };
  const watch = async (sec, step = 0.25) => { for (let t = 0; t < sec; t += step) { await advance(step); check(); } };
  const tap = () => { wa.live.suspended = false; fire('pointerdown'); };
  const begin = ({ clock = 'morning' } = {}) => {
    Au.on = true; Au.start(0.25);
    emit('ws', { type: 'session_start', clock });
  };
  const core = async mode => {
    emit('segment', 'fadein'); await watch(2);
    emit('segment', 'checkin'); await watch(2);
    emit('segment', 'rt'); await watch(2);
    emit('mode', mode);
    emit('segment', 'walk');
  };
  const game = async (id, mode, kind = 'adaptive', sec = 12) => {
    emit('segment', 'game');
    emit('game', { id, mode, k: 0.5, slot: 0, kind });
    await watch(sec);
    emit('segment', 'walk');
  };
  return { A, M, Au, wa, ctx, calls, advance, watch, emit, fire, tap, begin, core, game, check, liveBeds, unstoppedBeds, bedsOf, drones, now: () => now };
};

const tests = [];
const test = (name, f) => tests.push([name, f]);

const ambLoops = a => a.wa.sources.filter(n => n.kind === 'buffer' && n.loop && n.buffer?.file?.startsWith('amb_') && n.startAt !== null && n !== a.A.Ambience.lanternV?.src);

test('the kaamos bed and the harbour ambience play from launch, before any tap', async () => {
  const a = app();
  a.emit('home');
  await a.watch(4);
  assert.strictEqual(a.M.bed?.key, 'kaamos');
  assert.strictEqual(a.liveBeds().length, 1);
  assert.ok(a.M.bed.pad.gain.value > 0, 'the start bed is silent');
  assert.ok(a.M.bus.curve.gain.value > 0, 'the start screen is muted');
  assert.ok(ambLoops(a).length > 0, 'no ambience on the start screen');
  assert.strictEqual(a.ctx.navigator.audioSession.type, 'ambient');
  assert.ok(!a.A.Ambience.lanternV, 'the lantern is lit before the session');
});

test('a suspended context resumes on the first tap, and the tap does nothing else', async () => {
  const a = app({ suspended: true });
  const ws = [];
  a.A.bus.on('ws', m => ws.push(m));
  a.emit('home');
  await a.watch(3);
  const ctx = a.M.ctx, beds = a.bedsOf('kaamos');
  assert.strictEqual(ctx.state, 'suspended');
  assert.strictEqual(a.M.want, 'kaamos');
  assert.ok(beds.length <= 1);
  a.tap();
  await a.watch(1);
  assert.strictEqual(ctx.state, 'running');
  a.tap(); a.fire('keydown');
  await a.watch(2);
  assert.deepStrictEqual(ws, [], 'the tap started something');
  assert.strictEqual(a.M.s.home, true);
  assert.strictEqual(a.A.session, undefined);
  if (beds.length) assert.deepStrictEqual(a.bedsOf('kaamos'), beds, 'the tap restarted the bed');
  assert.strictEqual(a.bedsOf('kaamos').length, 1);
  assert.strictEqual(a.liveBeds().length, 1);
});

test('starting a session carries the start bed on without a second source, then moves on as before', async () => {
  const a = app();
  a.emit('home');
  await a.watch(4);
  const bed = a.M.bed, src = bed.srcs[0], amb = ambLoops(a).length;
  a.begin();
  a.emit('segment', 'fadein');
  await a.watch(4);
  assert.strictEqual(a.M.bed, bed, 'the bed was replaced');
  assert.strictEqual(src.stopAt, null, 'the start bed was stopped');
  assert.strictEqual(a.bedsOf('kaamos').length, 1, 'a second kaamos bed started');
  assert.ok(bed.pad.gain.value > 0, 'the bed dropped out at the session start');
  assert.ok(a.M.bus.curve.gain.value > 0);
  assert.strictEqual(a.M.s.home, false);
  assert.strictEqual(ambLoops(a).length, amb, 'the ambience restarted');
  assert.strictEqual(a.A.Ambience.s.home, undefined);
  a.emit('segment', 'rest'); await a.watch(2);
  a.emit('segment', 'checkin'); await a.watch(2);
  a.emit('segment', 'rt'); await a.watch(2);
  a.emit('mode', 'flow');
  a.emit('segment', 'walk');
  await a.watch(12);
  assert.strictEqual(a.M.bed?.key, 'flow');
  assert.ok(src.stopAt !== null, 'kaamos never handed over');
  assert.strictEqual(a.liveBeds().filter(n => n.stopAt === null).length, 1);
});

test('back on the start screen after a session the calm bed plays again', async () => {
  for (const status of ['completed', 'closed', 'declined']) {
    const a = app();
    a.emit('home');
    await a.watch(2);
    a.begin();
    await a.core('flow');
    await a.watch(14);
    a.emit('segment', 'end');
    a.emit('sessionEnd', { status });
    await a.watch(10);
    assert.deepStrictEqual(a.liveBeds().map(n => n.buffer.file), [], status);
    a.emit('home');
    await a.watch(4);
    assert.strictEqual(a.M.bed?.key, 'kaamos', status);
    assert.strictEqual(a.M.s.home, true, status);
    assert.strictEqual(a.liveBeds().length, 1, status);
    assert.ok(a.M.bus.curve.gain.value > 0, 'the start screen is silent after ' + status);
    assert.strictEqual(a.A.Ambience.s?.home, true, status);
    assert.ok(a.A.Ambience.out.gain.value > 0, 'the ambience is silent after ' + status);
  }
});

test('a decline from a reminder leaves the start bed playing', async () => {
  const a = app();
  a.emit('home');
  await a.watch(3);
  a.emit('sessionEnd', { status: 'declined' });
  await a.watch(4);
  assert.strictEqual(a.M.bed?.key, 'kaamos');
  assert.ok(a.M.bus.curve.gain.value > 0);
  assert.strictEqual(a.liveBeds().length, 1);
});

test('sound off at launch plays nothing, and switching it on starts the start bed', async () => {
  const a = app();
  a.Au.on = false;
  a.emit('home');
  await a.watch(3);
  assert.deepStrictEqual(a.wa.sources.filter(n => n.kind === 'buffer' && n.buffer?.file?.startsWith('mu_')), []);
  assert.strictEqual(ambLoops(a).length, 0);
  a.Au.on = true;
  await a.watch(4);
  assert.strictEqual(a.M.bed?.key, 'kaamos');
  assert.strictEqual(a.liveBeds().length, 1);
  assert.ok(ambLoops(a).length > 0);
  a.Au.on = false;
  await a.watch(1);
  assert.strictEqual(a.M.bus.mix.gain.value, 0, 'sound off does not mute the start bed');
  a.Au.on = true;
  await a.watch(1);
  assert.strictEqual(a.M.bus.mix.gain.value, 1);
  assert.strictEqual(a.bedsOf('kaamos').length, 1);
});

test('a Talk conversation on the start screen quiets the start bed and brings it back after', async () => {
  const a = app();
  a.emit('home');
  await a.watch(4);
  const bed = a.M.bed;
  a.emit('voice', { state: 'connecting' });
  await a.watch(1);
  a.emit('voice', { state: 'listening' });
  await a.watch(3);
  assert.strictEqual(a.M.bus.curve.gain.value, 0, 'music plays under the conversation');
  a.emit('voice', { state: 'idle' });
  await a.watch(4);
  assert.ok(a.M.bus.curve.gain.value > 0);
  assert.strictEqual(a.M.bed, bed);
  assert.strictEqual(a.bedsOf('kaamos').length, 1);
});

test('a completed morning with dawn and bloom ends silent, and the next morning plays one kaamos bed', async () => {
  for (const bloomLate of [true, false]) await morning(bloomLate);
});

const morning = async bloomLate => {
  const a = app(), at = bloomLate ? 'bloom decoded after the rise' : 'bloom decoded first';
  a.wa.holdWith(f => bloomLate && f === 'mu_dawn_bloom.m4a');
  a.tap(); a.begin();
  await a.watch(1);
  await a.core('flow');
  await a.watch(20);
  await a.game('threads', 'flow');
  await a.watch(10);
  await a.game('fork', 'measure', 'measurement');
  await a.watch(10);
  await a.game('breath', 'rest');
  a.emit('mode', 'rest');
  await a.watch(10);
  a.emit('segment', 'dawn');
  await a.watch(1);
  if (bloomLate) a.wa.release('mu_dawn_bloom.m4a');
  await a.watch(11);
  assert.strictEqual(a.wa.sources.filter(n => n.buffer?.file === 'mu_dawn_bloom.m4a' && n.startAt !== null).length, 1, 'the bloom did not play, ' + at);
  a.emit('segment', 'end'); a.emit('endScreen');
  a.emit('sessionEnd', { status: 'completed' });
  await a.watch(12);
  assert.deepStrictEqual(a.liveBeds().map(n => n.buffer.file), [], at);
  assert.strictEqual(a.drones().length, 0, 'a synth drone outlives the session, ' + at);
  assert.deepStrictEqual(a.calls.warnings || [], [], at);
  a.emit('home');
  await a.watch(3);
  a.begin();
  a.emit('segment', 'fadein');
  await a.watch(6);
  assert.strictEqual(a.M.bed?.key, 'kaamos', at);
  assert.strictEqual(a.liveBeds().length, 1, at);
  assert.ok(a.M.bus.curve.gain.value > 0, 'the second session is muted, ' + at);
};

test('kaamos plays through the core while the other beds still decode', async () => {
  const a = app();
  a.wa.holdWith(f => f !== 'mu_kaamos_pad.m4a' && f.startsWith('mu_'));
  a.tap(); a.begin();
  a.emit('segment', 'fadein');
  await a.watch(4);
  assert.strictEqual(a.M.bed?.key, 'kaamos');
  assert.strictEqual(a.liveBeds().length, 1);
});

test('a bed whose decode finishes after a newer request never starts', async () => {
  const a = app();
  a.wa.holdWith(f => f === 'mu_flow_pad.m4a');
  a.tap(); a.begin();
  await a.core('flow');
  await a.watch(10);
  a.emit('mode', 'calm');
  await a.watch(10);
  assert.strictEqual(a.M.bed?.key, 'calm');
  a.wa.release('mu_flow_pad.m4a');
  await a.watch(20);
  assert.strictEqual(a.M.bed?.key, 'calm');
  assert.strictEqual(a.bedsOf('flow').length, 0, 'the stale flow bed started');
  assert.deepStrictEqual(a.liveBeds().map(n => n.buffer.file), []);
});

test('dawn wins over a flow bed still decoding, in either order', async () => {
  for (const first of ['mu_dawn_rise.m4a', 'mu_flow_pad.m4a']) {
    const a = app();
    a.wa.holdWith(f => f === 'mu_flow_pad.m4a' || f === 'mu_dawn_rise.m4a');
    a.tap(); a.begin();
    await a.core('flow');
    await a.watch(4);
    a.emit('segment', 'dawn');
    await a.watch(1);
    a.wa.release(first);
    await a.watch(1);
    a.wa.release(first === 'mu_flow_pad.m4a' ? 'mu_dawn_rise.m4a' : 'mu_flow_pad.m4a');
    await a.watch(3);
    assert.strictEqual(a.M.bed?.key, 'dawn', first);
    assert.strictEqual(a.bedsOf('flow').length, 0, 'flow started after dawn was asked for (' + first + ')');
    await a.watch(15);
  }
});

test('asking for the same bed again while it decodes starts it once', async () => {
  const a = app();
  a.wa.holdWith(f => f === 'mu_flow_pad.m4a');
  a.tap(); a.begin();
  await a.core('flow');
  await a.watch(9);
  a.emit('mode', 'wake');
  await a.watch(9);
  a.emit('mode', 'flow');
  await a.watch(9);
  a.wa.release('mu_flow_pad.m4a');
  await a.watch(20);
  assert.strictEqual(a.M.bed?.key, 'flow');
  assert.strictEqual(a.bedsOf('flow').length, 1, 'flow was started more than once');
});

test('the start-up bed and the first answer do not both start', async () => {
  const a = app();
  a.wa.holdWith(f => f === 'mu_kaamos_pad.m4a');
  a.tap(); a.begin();
  await a.core('flow');
  await a.watch(1);
  a.wa.release('mu_kaamos_pad.m4a');
  await a.watch(20);
  assert.strictEqual(a.M.bed?.key, 'flow');
  assert.strictEqual(a.bedsOf('kaamos').length, 0, 'kaamos started after flow was asked for');
});

test('ending, going home and starting again mid-decode leaves only the new session bed', async () => {
  for (const exit of ['home', 'again', 'declined']) {
    const a = app();
    a.wa.holdWith(f => f === 'mu_flow_pad.m4a');
    a.tap(); a.begin();
    await a.core('flow');
    await a.watch(2);
    if (exit === 'declined') a.emit('sessionEnd', { status: 'declined' });
    else a.emit('sessionEnd', { status: 'closed' });
    await a.watch(1);
    if (exit !== 'again') a.emit('home');
    a.begin();
    a.emit('segment', 'fadein');
    a.wa.release('mu_flow_pad.m4a');
    await a.watch(10);
    assert.strictEqual(a.bedsOf('flow').length, 0, exit);
    assert.deepStrictEqual(a.liveBeds().map(n => n.buffer.file), ['mu_kaamos_pad.m4a'], exit);
  }
});

test('rapid begin taps start one bed', async () => {
  const a = app();
  a.tap();
  for (let i = 0; i < 4; i++) { a.begin(); await a.advance(0.05); }
  await a.watch(0.5);
  assert.ok(a.liveBeds().length <= 1, a.liveBeds().length + ' beds still play after the last tap');
  a.emit('segment', 'fadein');
  await a.watch(8);
  assert.strictEqual(a.liveBeds().length, 1);
  assert.strictEqual(a.unstoppedBeds().length, 1);
});

test('backgrounding suspends and resumes without starting another bed', async () => {
  const a = app();
  a.tap(); a.begin();
  await a.core('flow');
  await a.watch(12);
  const music = () => a.wa.sources.filter(n => n.kind === 'buffer' && n.buffer && /^mu_/.test(n.buffer.file)).length;
  const made = music(), ctx = a.M.ctx;
  for (let i = 0; i < 3; i++) {
    a.ctx.document.hidden = true; a.fire('visibilitychange');
    await a.watch(2);
    a.ctx.document.hidden = false; a.fire('visibilitychange');
    await a.watch(2);
  }
  assert.strictEqual(ctx.suspends, 3);
  assert.ok(ctx.resumes >= 3);
  assert.strictEqual(a.bedsOf('flow').length, 1);
  assert.strictEqual(music(), made);
});

test('the synth dawn phrase plays only when there is no dawn file', async () => {
  const noDawn = JSON.parse(JSON.stringify(MUSIC));
  delete noDawn.tracks.dawn_rise;
  for (const [music, clock, want] of [[MUSIC, 'morning', 0], [noDawn, 'morning', 1], [MUSIC, 'night', 1]]) {
    const a = app({ music });
    a.tap(); a.begin({ clock });
    await a.core('flow');
    await a.watch(10);
    a.emit('segment', 'dawn');
    await a.watch(6);
    assert.strictEqual(a.calls.dawnPhrase, want, `${clock} ${music === MUSIC ? 'with' : 'without'} dawn file`);
  }
});

test('the engine leaves the dawn phrase to the music when music is loaded', () => {
  const spy = { phrases: 0 };
  const audio = new Proxy({}, { get: (t, k) => k === 'dawnPhrase' ? () => { spy.phrases++; } : () => {} });
  for (const [music, want] of [[true, 0], [false, 1]]) {
    spy.phrases = 0;
    const { A } = loadEngine({ audio, music: music ? {} : undefined });
    const s = A.startSession({ clock: 'morning', input: 'touch', stage: true, profile: 'live' });
    s.startDawn(A.now());
    assert.strictEqual(spy.phrases, want, music ? 'with music' : 'without music');
  }
});

test('ambience keeps one source per bed through rapid scene changes and restarts', async () => {
  const a = app();
  a.wa.holdWith(f => f.startsWith('amb_'));
  a.tap(); a.begin();
  await a.advance(1);
  a.emit('mode', 'flow'); a.emit('segment', 'walk');
  a.emit('mode', 'wake'); a.emit('mode', 'calm');
  a.emit('home'); a.begin();
  await a.advance(1);
  while (a.wa.held.length) { a.wa.held.splice(Math.floor(a.wa.held.length / 2), 1)[0].done(); await a.advance(0.05); }
  await a.advance(8);
  const loops = a.wa.sources.filter(n => n.kind === 'buffer' && n.loop && n.buffer?.file?.startsWith('amb_') && n.startAt !== null && n.stopAt === null && n !== a.A.Ambience.lanternV?.src);
  const names = loops.map(n => n.buffer.file);
  assert.strictEqual(new Set(names).size, names.length, names.join(', '));
  assert.deepStrictEqual(new Set(names), new Set(Object.keys(a.A.Ambience.voices).map(k => AMB.files[k].path.split('/').pop() + '.m4a')));
});

test('a Talk conversation ended while the microphone is still being asked for leaves the microphone off', async () => {
  const asks = [], tracks = [];
  class Ctx { constructor() { this.audioWorklet = { addModule: async () => {} }; } resume() {} close() {} }
  const ctx = { console, Math, Date, JSON, Set, Map, Object, Array, Number, String, Promise, Error, Uint8Array, DataView, Float32Array, TextDecoder, btoa, atob, AFFERENT_VOICE: { url: 'https://relay.test', code: 'c' } };
  ctx.window = ctx;
  ctx.AudioContext = Ctx;
  ctx.AudioWorkletNode = function () {};
  ctx.navigator = { mediaDevices: { getUserMedia: () => new Promise(ok => asks.push(ok)) } };
  vm.createContext(ctx);
  for (const f of ['util.js', 'voice.js']) vm.runInContext(fs.readFileSync(path.join(JS, f), 'utf8'), ctx, { filename: f });
  const V = ctx.A.Voice;
  V.start();
  V.stop();
  V.start();
  V.stop();
  for (const ok of asks) { const t = { live: true, stop() { this.live = false; } }; tracks.push(t); ok({ getTracks: () => [t] }); }
  await new Promise(r => setImmediate(r));
  assert.strictEqual(tracks.length, 2);
  assert.deepStrictEqual(tracks.map(t => t.live), [false, false]);
  assert.strictEqual(V.s, null);
});

(async () => {
  let failed = 0;
  for (const [name, f] of tests) {
    if (process.argv[2] && !name.includes(process.argv[2])) continue;
    try { await f(); console.log('ok  ', name); } catch (e) { failed++; console.log('FAIL', name, '\n     ', e.message); }
  }
  process.exit(failed ? 1 : 0);
})();
