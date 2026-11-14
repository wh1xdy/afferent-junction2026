// Run with: node --test   (from fun/heart-duel)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const G = require('./game.js');
const { inline } = require('./inline.js');

// A tracker that has seen the connect-time read and then `packets` as notifications.
function tracked(packets, first = [0, 0, 0, 0]) {
  const tr = G.createTracker();
  G.trackerPacket(tr, first, 0, 'read');
  for (const [t, bytes] of packets) G.trackerPacket(tr, bytes, t, 'notify');
  return tr;
}

// ── staleness and honest states ─────────────────────────────────────────────────────

test('no link: offline, whatever was received before', () => {
  const tr = tracked([[1000, [72, 80, 0, 0]], [1500, [72, 80, 0, 0]]]);
  assert.deepEqual(G.playerView(tr, 0, 1600, false), { state: 'offline', bpm: null });
  assert.deepEqual(G.playerView(tr, 1, 1600, false), { state: 'offline', bpm: null });
});

test('zeros mean no reading: never a number', () => {
  const tr = tracked([[1000, [0, 0, 0, 0]], [2000, [0, 0, 0, 0]]]);
  for (const i of [0, 1]) assert.deepEqual(G.playerView(tr, i, 2100, true), { state: 'no-finger', bpm: null });
  assert.deepEqual(G.extrasView(tr, 2100, true), { breath: null, hrv: null });
});

test('a fresh tracker with a link asks for the clip', () => {
  assert.equal(G.playerView(G.createTracker(), 0, 0, true).state, 'no-finger');
});

test('a value held by the peripheral (read / snapshot) is not shown until a beat confirms it', () => {
  const tr = G.createTracker();
  G.trackerPacket(tr, [72, 80, 14, 40], 0, 'read');
  assert.equal(G.playerView(tr, 0, 100, true).state, 'no-finger');
  G.trackerPacket(tr, [72, 80, 14, 40], 200, 'snapshot');
  assert.equal(G.playerView(tr, 1, 300, true).state, 'no-finger');
  G.trackerPacket(tr, [72, 80, 14, 40], 900, 'notify');
  assert.equal(G.playerView(tr, 0, 1000, true).bpm, 72);
  assert.equal(G.playerView(tr, 1, 1000, true).bpm, 80);
});

test('the first notification without any earlier packet is only a baseline', () => {
  const tr = G.createTracker();
  G.trackerPacket(tr, [72, 0, 0, 0], 0, 'notify');
  assert.equal(G.playerView(tr, 0, 100, true).state, 'no-finger');
  G.trackerPacket(tr, [73, 0, 0, 0], 800, 'notify');
  assert.equal(G.playerView(tr, 0, 900, true).bpm, 73);
});

test('one player only: the other stays "put the clip on"', () => {
  const tr = tracked([[1000, [72, 0, 0, 0]], [1800, [73, 0, 0, 0]]]);
  assert.equal(G.playerView(tr, 0, 2000, true).bpm, 73);
  assert.deepEqual(G.playerView(tr, 1, 2000, true), { state: 'no-finger', bpm: null });
});

test('live up to 5 s after the last beat, stale after, forgotten after 30 s', () => {
  const tr = tracked([[1000, [72, 0, 0, 0]]]);
  assert.equal(G.playerView(tr, 0, 1000 + 5000, true).state, 'live');
  const stale = G.playerView(tr, 0, 1000 + 5001, true);
  assert.equal(stale.state, 'stale');
  assert.equal(stale.bpm, null, 'a stale value is not usable by the games');
  assert.equal(stale.lastBpm, 72);
  assert.equal(stale.ageMs, 5001);
  assert.equal(G.playerView(tr, 0, 1000 + 30000, true).state, 'stale');
  assert.deepEqual(G.playerView(tr, 0, 1000 + 30001, true), { state: 'no-finger', bpm: null });
});

test('a packet that only changes breathing or HRV does not refresh a pulse', () => {
  const tr = tracked([[1000, [72, 0, 0, 0]]]);
  G.trackerPacket(tr, [72, 0, 14, 0], 5500, 'notify');
  G.trackerPacket(tr, [72, 0, 14, 41], 5800, 'notify');
  G.trackerPacket(tr, [72, 0, 0, 0], 6500, 'notify');   // hub stopped sensing: old BPM still in the packet
  assert.equal(G.playerView(tr, 0, 6600, true).state, 'stale');
});

test("the other finger's beat does not refresh mine", () => {
  const tr = tracked([[1000, [72, 80, 0, 0]], [1100, [72, 80, 0, 0]]]);
  for (let t = 2000; t <= 9000; t += 1000) G.trackerPacket(tr, [72 + (t / 1000) % 2, 80, 0, 0], t, 'notify');
  assert.equal(G.playerView(tr, 0, 9100, true).state, 'live');
  assert.equal(G.playerView(tr, 1, 9100, true).state, 'stale');
});

test('a value going back to 0 clears the player', () => {
  const tr = tracked([[1000, [72, 80, 0, 0]], [1500, [0, 80, 0, 0]]]);
  assert.deepEqual(G.playerView(tr, 0, 1600, true), { state: 'no-finger', bpm: null });
});

test('an unchanged value gets the "clip still on?" hint after 20 s, and stays usable', () => {
  const tr = tracked([[1000, [72, 0, 0, 0]]]);
  for (let t = 2000; t <= 22000; t += 1000) G.trackerPacket(tr, [72, 0, 0, 0], t, 'notify');
  const early = G.playerView(tr, 0, 20999, true);
  assert.equal(early.frozen, false);
  const late = G.playerView(tr, 0, 22000, true);
  assert.deepEqual([late.state, late.bpm, late.frozen], ['live', 72, true]);
  G.trackerPacket(tr, [74, 0, 0, 0], 23000, 'notify');
  assert.equal(G.playerView(tr, 0, 23000, true).frozen, false);
});

test('breathing and HRV: shown only when non-zero and a pulse is live', () => {
  const tr = tracked([[1000, [72, 0, 0, 0]], [1200, [72, 0, 14, 0]], [1400, [72, 0, 14, 41]], [2000, [72, 0, 14, 41]]]);
  assert.deepEqual(G.extrasView(tr, 2100, true), { breath: 14, hrv: 41 });
  assert.deepEqual(G.extrasView(tr, 2100, false), { breath: null, hrv: null });
  assert.deepEqual(G.extrasView(tr, 9000, true), { breath: null, hrv: null }, 'pulse went stale');
  const partial = tracked([[1000, [72, 0, 0, 0]], [1200, [72, 0, 14, 0]], [2000, [72, 0, 14, 0]]]);
  assert.deepEqual(G.extrasView(partial, 2100, true), { breath: 14, hrv: null });
  const over = tracked([[1000, [72, 0, 0, 0]], [1200, [72, 0, 14, 255]], [2000, [72, 0, 14, 255]]]);
  assert.deepEqual(G.extrasView(over, 2100, true), { breath: 14, hrv: null }, 'byte 255 = above the range, not 255 ms');
});

test('malformed packets are ignored', () => {
  const tr = tracked([[1000, [72, 0, 0, 0]]]);
  for (const bad of [null, [72], [72, 0, 0], ['72', 0, 0, 0], [300, 0, 0, 0], [-1, 0, 0, 0], [72.5, 0, 0, 0]]) {
    G.trackerPacket(tr, bad, 1500, 'notify');
  }
  assert.deepEqual(tr.prev, [72, 0, 0, 0]);
  assert.equal(tr.packetAt, 1000);
});

// ── heart animation rate ────────────────────────────────────────────────────────────

test('the heart beats at the real rate: 72 BPM is 72 beats a minute, whatever the frame rate', () => {
  for (const frameMs of [4, 16, 33, 250]) {
    let phase = 0, beats = 0, t = 0;
    // 60 s and a bit, so the 72nd beat is not decided by float rounding at the last frame
    for (; t < 60400; t += frameMs) { const r = G.advanceBeat(phase, 72, frameMs); phase = r.phase; beats += r.beats; }
    assert.equal(beats, 72, `frame ${frameMs} ms`);
    assert.ok(Math.abs(phase - (72 * t) / 60000) < 1e-6);
  }
});

test('no reading: the heart does not move', () => {
  for (const bpm of [null, 0, undefined, NaN]) assert.deepEqual(G.advanceBeat(0.4, bpm, 16), { phase: 0.4, beats: 0 });
});

// ── SYNC ────────────────────────────────────────────────────────────────────────────

function runSync(s, bpm1, bpm2, ms, step = 100) {
  for (let t = 0; t < ms; t += step) s = G.syncStep(s, bpm1, bpm2, step);
  return s;
}

test('sync: the meter fills only within 3 BPM (3 counts, 4 does not)', () => {
  let s = runSync(G.syncCreate(), 70, 73, 2000);
  assert.deepEqual([s.progressMs, s.inSync, s.diff, s.won], [2000, true, 3, false]);
  s = runSync(G.syncCreate(), 70, 74, 2000);
  assert.deepEqual([s.progressMs, s.inSync, s.diff], [0, false, 4]);
});

test('sync: 10 s in sync wins, not a step earlier, and the win latches', () => {
  let s = runSync(G.syncCreate(), 71, 72, 9900);
  assert.equal(s.won, false);
  s = G.syncStep(s, 71, 72, 100);
  assert.deepEqual([s.progressMs, s.won], [10000, true]);
  const after = G.syncStep(s, 60, 120, 1000);
  assert.equal(after, s);
});

test('sync: leaving the window drains at twice the fill rate, never below 0', () => {
  let s = runSync(G.syncCreate(), 70, 70, 6000);
  s = runSync(s, 70, 80, 1000);
  assert.equal(s.progressMs, 4000);
  s = runSync(s, 70, 80, 5000);
  assert.equal(s.progressMs, 0);
});

test('sync: a missing player is not "in sync"', () => {
  let s = runSync(G.syncCreate(), 70, 70, 4000);
  s = runSync(s, 70, null, 1000);
  assert.deepEqual([s.progressMs, s.inSync, s.diff], [2000, false, null]);
  s = runSync(G.syncCreate(), null, null, 3000);
  assert.equal(s.progressMs, 0);
});

test('sync: a long frame (hidden tab) counts as at most 1 s', () => {
  const s = G.syncStep(G.syncCreate(), 70, 70, 60000);
  assert.deepEqual([s.progressMs, s.won], [1000, false]);
});

// ── CALM ────────────────────────────────────────────────────────────────────────────

// segments: [[ms, bpm1, bpm2], ...]
function runCalm(segments, step = 100) {
  let c = G.calmCreate();
  for (const [ms, a, b] of segments) for (let t = 0; t < ms; t += step) c = G.calmStep(c, a, b, step);
  return c;
}

test('calm: the round lasts exactly 30 s', () => {
  let c = runCalm([[29900, 60, 70]]);
  assert.equal(c.done, false);
  c = G.calmStep(c, 60, 70, 500);
  assert.deepEqual([c.elapsedMs, c.done], [30000, true]);
  assert.equal(G.calmStep(c, 200, 200, 1000), c, 'nothing is added after the end');
});

test('calm: lowest average pulse wins', () => {
  const r = G.calmResult(runCalm([[30000, 64, 71]]));
  assert.deepEqual([r.outcome, r.winner, r.averages], ['win', 0, [64, 71]]);
  const r2 = G.calmResult(runCalm([[30000, 80, 62]]));
  assert.deepEqual([r2.outcome, r2.winner], ['win', 1]);
});

test('calm: the average is time-weighted', () => {
  const c = runCalm([[10000, 60, 90], [20000, 90, 60]]);
  const r = G.calmResult(c);
  assert.deepEqual(r.averages, [80, 70]);
  assert.equal(r.winner, 1);
  assert.equal(G.calmAverage(c, 0), 80);
});

test('calm: equal averages at the shown decimal are a tie', () => {
  const r = G.calmResult(runCalm([[30000, 66, 66]]));
  assert.deepEqual([r.outcome, r.winner], ['tie', null]);
  // 66.02 vs 66.00 both show as 66.0
  const near = G.calmResult(runCalm([[29700, 66, 66], [300, 68, 66]]));
  assert.deepEqual([near.outcome, near.averages], ['tie', [66, 66]]);
});

test('calm: one player without enough data is no contest, not a win by default', () => {
  const r = G.calmResult(runCalm([[30000, 64, null]]));
  assert.deepEqual([r.outcome, r.winner, r.averages], ['no-contest', null, [64, null]]);
  // player 2 had a reading for 14.9 of 30 s: under half the round
  const short = G.calmResult(runCalm([[14900, 64, 50], [15100, 64, null]]));
  assert.deepEqual([short.outcome, short.averages[1]], ['no-contest', null]);
  assert.ok(Math.abs(short.coverage[1] - 14900 / 30000) < 1e-9);
});

test('calm: exactly half the round is enough, and gaps do not count as beats', () => {
  const r = G.calmResult(runCalm([[15000, 64, 58], [15000, 64, null]]));
  assert.deepEqual([r.outcome, r.winner, r.averages], ['win', 1, [64, 58]]);
});

test('calm: nobody had a reading', () => {
  const r = G.calmResult(runCalm([[30000, null, null]]));
  assert.deepEqual([r.outcome, r.winner, r.averages], ['no-data', null, [null, null]]);
  assert.equal(G.calmAverage(runCalm([[1000, null, null]]), 0), null);
});

// ── POKER FACE ──────────────────────────────────────────────────────────────────────

const trace = (bpms, stepMs = 1000) => bpms.map((bpm, i) => ({ t: i * stepMs, bpm }));

test('trace: keeps 30 s, stores no-reading as a gap', () => {
  const s = [];
  for (let t = 0; t <= 40000; t += 250) G.tracePush(s, t, t === 1000 ? 0 : 70);
  assert.ok(s[0].t >= 40000 - 31000 && s[0].t <= 40000 - 30000);
  const g = [];
  G.tracePush(g, 0, 0); G.tracePush(g, 250, null); G.tracePush(g, 500, 71);
  assert.deepEqual(g.map((x) => x.bpm), [null, null, 71]);
});

test('trace range: at least 20 BPM tall, null without data', () => {
  assert.deepEqual(G.traceRange(trace([70, 71, 72])), { min: 60, max: 85 });
  assert.deepEqual(G.traceRange(trace([60, 100])), { min: 55, max: 105 });
  assert.equal(G.traceRange(trace([null, null])), null);
  assert.equal(G.traceRange([]), null);
});

test('poker: finds the biggest rise within 5 s', () => {
  const j = G.biggestRise(trace([70, 70, 71, 70, 72, 76, 81, 82, 80, 79, 78]));
  assert.deepEqual(j, { rise: 12, fromMs: 3000, toMs: 7000, fromBpm: 70, toBpm: 82 });
});

test('poker: a slow drift or a flat trace is not a jump', () => {
  assert.equal(G.biggestRise(trace([70, 70, 71, 71, 72, 72, 73, 73, 74, 74, 75, 75, 76])), null);
  assert.equal(G.biggestRise(trace([70, 70, 70])), null);
  assert.equal(G.biggestRise([]), null);
});

test('poker: a rise across a gap in the data is not counted', () => {
  assert.equal(G.biggestRise(trace([70, null, 85, 85])), null);
});

test('poker: guess verdict', () => {
  const jump = { rise: 12, fromMs: 3000, toMs: 7000, fromBpm: 70, toBpm: 82 };
  assert.deepEqual(G.guessVerdict(5000, jump), { offMs: 0, hit: true });
  assert.deepEqual(G.guessVerdict(1000, jump), { offMs: 2000, hit: true });
  assert.deepEqual(G.guessVerdict(9500, jump), { offMs: 2500, hit: false });
  assert.equal(G.guessVerdict(5000, null), null);
  assert.equal(G.guessVerdict(null, jump), null);
});

// ── the page carries this exact logic ───────────────────────────────────────────────

test('index.html has the current game.js inlined (run ./build.sh if this fails)', () => {
  const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
  const js = fs.readFileSync(path.join(__dirname, 'game.js'), 'utf8');
  assert.ok(html.includes(js.trim()), 'game.js is not in index.html');
  assert.equal(inline(html, js), html);
});

test('index.html is self-contained: no external scripts, styles, fonts or images', () => {
  const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
  assert.equal(/\b(?:src|href)\s*=\s*["'](?!#|data:)/i.test(html), false);
  assert.equal(/url\(\s*["']?(?!data:)/i.test(html), false);
  assert.equal(/https?:\/\//i.test(html), false);
});
