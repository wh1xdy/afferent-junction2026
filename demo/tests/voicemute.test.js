// Run: node demo/tests/voicemute.test.js
// Talk: tapping the lantern turns the microphone off and on during a conversation (voice.js setMuted). Off stops the
// microphone tracks, sends no more audio and tells Gemini the audio has ended; on opens the microphone into the same
// conversation. The lantern is a real button with aria-pressed, only usable once the conversation is set up.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const DEMO = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(DEMO, 'js', 'voice.js'), 'utf8');

const track = () => ({ stopped: false, stop() { this.stopped = true; } });
const stream = () => { const t = [track()]; return { tracks: t, getTracks: () => t }; };

// voice.js without a document: A.Voice only, with a fake bus, microphone, audio graph and relay socket.
const setup = () => {
  const events = [], sent = [], streams = [];
  let pending = null;
  const gum = { calls: 0, hold: false, fail: null };
  const A = { bus: { emit: (type, d) => events.push({ type, d }), on() {} }, config: {}, uuid: () => 'id' };
  const navigator = {
    mediaDevices: {
      getUserMedia: () => {
        gum.calls++;
        if (gum.fail) return Promise.reject(Object.assign(new Error('denied'), { name: 'NotAllowedError' }));
        const s = stream(); streams.push(s);
        if (gum.hold) return new Promise(res => { pending = () => res(s); });
        return Promise.resolve(s);
      },
    },
  };
  const ctx = vm.createContext({ A, navigator, console, btoa, atob, TextDecoder, localStorage: undefined });
  vm.runInContext(SRC, ctx);
  const V = A.Voice;
  // A conversation that is set up and listening, as start() leaves it after setupComplete.
  const live = () => {
    const node = { connected: [], port: {} };
    const src = { to: null, disconnected: false, connect(n) { this.to = n; }, disconnect() { this.disconnected = true; } };
    const first = stream(); streams.push(first);
    V.s = {
      playing: new Set(), nextT: 0, ready: true, muted: false, stream: first, src, node,
      ctx: { createMediaStreamSource: s => ({ s, to: null, connect(n) { this.to = n; }, disconnect() {} }) },
      ws: { readyState: 1, send: m => sent.push(JSON.parse(m)) },
    };
    V.state = 'listening';
    return V.s;
  };
  const audio = () => sent.filter(m => m.realtimeInput?.audio).length;
  return { V, events, sent, streams, gum, live, audio, release: () => pending && pending() };
};

const frame = { level: 0.1, pcm: new Uint8Array([1, 2, 3, 4]).buffer };
let n = 0;
const test = async (name, fn) => { await fn(); n++; console.log('ok', name); };

(async () => {
  await test('microphone audio goes to the relay while the mic is on', () => {
    const t = setup(), s = t.live();
    t.V.frame(s, frame);
    assert.strictEqual(t.audio(), 1);
    assert.strictEqual(t.V.level, 0.1);
  });

  await test('the lantern turns the mic off: tracks stopped, audio ended for Gemini, nothing more sent', async () => {
    const t = setup(), s = t.live(), first = s.stream, src = s.src;
    assert.strictEqual(await t.V.toggleMute(), true);
    assert.strictEqual(t.V.muted, true);
    assert.strictEqual(s.muted, true);
    assert.ok(first.tracks.every(x => x.stopped), 'the microphone itself is stopped, so the phone shows it off');
    assert.ok(src.disconnected);
    assert.deepStrictEqual(t.sent.at(-1), { realtimeInput: { audioStreamEnd: true } });
    assert.deepStrictEqual(t.events.filter(e => e.type === 'voiceMute').map(e => e.d), [true]);
    t.V.frame(s, frame);
    assert.strictEqual(t.audio(), 0, 'no audio while the mic is off');
    assert.strictEqual(t.V.level, 0, 'the lantern does not glow with a mic that is off');
  });

  await test('a second tap opens the mic again into the same conversation', async () => {
    const t = setup(), s = t.live();
    await t.V.setMuted(true);
    assert.strictEqual(await t.V.toggleMute(), false);
    assert.strictEqual(t.gum.calls, 1);
    assert.strictEqual(s.stream, t.streams.at(-1));
    assert.strictEqual(s.src.to, s.node, 'the new microphone feeds the same capture node');
    assert.strictEqual(t.V.s, s, 'same conversation');
    t.V.frame(s, frame);
    assert.strictEqual(t.audio(), 1);
    assert.deepStrictEqual(t.events.filter(e => e.type === 'voiceMute').map(e => e.d), [true, false]);
  });

  await test('the mic cannot be turned off before the conversation is set up, or with none open', async () => {
    const t = setup(), s = t.live();
    s.ready = false;
    assert.strictEqual(await t.V.setMuted(true), false);
    assert.strictEqual(s.muted, false);
    t.V.s = null;
    assert.strictEqual(await t.V.setMuted(true), false);
    assert.strictEqual(t.sent.length, 0);
  });

  await test('ending the conversation while the mic reopens closes the new mic again', async () => {
    const t = setup(), s = t.live();
    await t.V.setMuted(true);
    t.gum.hold = true;
    const p = t.V.setMuted(false);
    t.V.stop();
    t.release();
    await p;
    assert.ok(t.streams.at(-1).tracks.every(x => x.stopped), 'no microphone left open after the conversation ended');
    assert.strictEqual(t.V.muted, false, 'a new conversation starts with the mic on');
    assert.strictEqual(s.src, null);
  });

  await test('off again while the mic reopens: the new mic is closed, the mic stays off', async () => {
    const t = setup(), s = t.live();
    await t.V.setMuted(true);
    t.gum.hold = true;
    const p = t.V.setMuted(false);
    await t.V.setMuted(true);
    t.release();
    await p;
    assert.strictEqual(s.muted, true);
    assert.ok(t.streams.at(-1).tracks.every(x => x.stopped));
  });

  await test('a blocked microphone on the way back ends the conversation with the mic message', async () => {
    const t = setup();
    t.live();
    await t.V.setMuted(true);
    t.gum.fail = true;
    await t.V.setMuted(false);
    assert.strictEqual(t.V.s, null);
    assert.strictEqual(t.V.state, 'error');
    assert.strictEqual(t.events.at(-1).d.detail.code, 'mic');
  });

  await test('the lantern is a button with aria-pressed and a mic-off mark, usable only in a conversation', () => {
    const html = fs.readFileSync(path.join(DEMO, 'index.html'), 'utf8');
    const m = html.match(/<button id="voiceOrb"[^>]*>/);
    assert.ok(m, 'the lantern is a <button>');
    assert.match(m[0], /type="button"/);
    assert.match(m[0], /aria-label="Mute microphone"/);
    assert.match(m[0], /aria-pressed="false"/);
    assert.match(m[0], /\bdisabled\b/, 'off until the conversation is set up');
    assert.match(html, /class="voice-mic"/);
    const css = fs.readFileSync(path.join(DEMO, 'css', 'voice.css'), 'utf8');
    assert.match(css, /\.voice\.muted \.voice-mic \{ opacity: 1/);
    assert.match(SRC, /orb\.disabled = state !== 'listening' && state !== 'speaking'/);
  });

  console.log(`${n} tests passed`);
})().catch(e => { console.error(e); process.exit(1); });
