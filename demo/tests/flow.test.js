// The session flow a play tester walked through: what comes after the fishing when the player takes their time,
// and the words on screen (guide.js) that say what to do now and greet by the real time of day.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
const { load, run, plain, JS } = require('./harness');

const LINES = { fork: 'Pick a path, then tap its lights', lanterns: 'Tap the bigger lantern', threads: 'Draw a thread between matching lights', constellation: 'Join the stars', breath: 'Gentle breaths' };

// A session whose tasks last as long as real ones: each finishes by itself `secs` seconds in.
const session = (opts = {}, secs = {}) => {
  const { A, tick, ctx } = load();
  vm.runInContext(fs.readFileSync(path.join(JS, 'guide.js'), 'utf8'), ctx, { filename: 'guide.js' });
  A.LINES = LINES;
  const lasts = id => secs[id] ?? secs.game ?? 20;
  for (const [id, def] of [...Object.entries(A.MEASURES), ...Object.entries(A.MINIGAMES)]) {
    const make = def.make;
    def.make = (...a) => Object.assign(make(...a), { max: 90, update(dt, now) { if (!this.done && this.t >= lasts(id)) { this.done = true; this.finishedAt = now; } } });
  }
  const s = A.startSession({ clock: 'morning', input: 'touch', stage: false, profile: 'live', ...opts });
  const games = [];
  A.bus.on('game', g => games.push(g));
  const down = () => { A.Pointer.down = true; s.handle('pdown', { x: 0, y: 0, t: A.now() }); };
  const up = () => { A.Pointer.down = false; s.handle('pup', { x: 0, y: 0, t: A.now() }); };
  const tap = () => { down(); up(); };
  return { A, tick, s, games, tap, go: (secs, each) => run(A, tick, s, secs, each) };
};

// A player who takes their time everywhere: answers the start lantern late, waits before the fishing and between its
// bites, and sits `dawdle` seconds at every dot before tapping on.
const dawdler = ({ A, s, tap }, dawdle) => {
  let key = null, since = 0;
  return () => {
    const now = A.now(), st = s.T.state;
    if (s.phase === 'checkin' && s.panel && !s.panel.done && s.panel.t > 9) Object.assign(s.panel, { choice: 2, decisionMs: 9000, done: true, finishedAt: now });
    if (s.phase === 'rt') {
      if (!s.rtArmed) { if (now - s.phaseAt > 10) tap(); }
      else if (s.core.trial?.onset != null && now - s.core.trial.onset > 0.8) tap();
    }
    const waiting = s.phase === 'walk' && (st === 'ready' || (st === 'exit' && !s.T.st.exitTap));
    if (waiting) {
      if (key !== st + s.slot) { key = st + s.slot; since = now; }
      if (now - since >= dawdle) tap();
    }
    if (s.phase === 'end' && s.moodEnd === undefined) s.setMood(3);
  };
};

const tests = [];
const test = (name, f) => tests.push([name, f]);

test('a player who dawdles everywhere still gets the Fork, an adaptive game, then the Lanterns', () => {
  for (const dawdle of [1, 12, 30]) {
    const S = session({}, { fork: 22, lanterns: 25, game: 20 });
    S.go(500, dawdler(S, dawdle));
    const order = plain(S.s.tasks).map(t => `${t.kind === 'adaptive' ? 'adaptive' : t.id}@${t.slot}`);
    assert.deepStrictEqual(order.slice(0, 3), ['fork@1', 'adaptive@2', 'lanterns@3'], `dawdle ${dawdle}: ${order}`);
    assert.ok(S.s.done || S.s.phase === 'end', `dawdle ${dawdle}: the session reaches the dawn, phase ${S.s.phase}`);
  }
});

test('the first adaptive game comes even when the core and the Fork used up the play clock', () => {
  const S = session({ stage: true }, { fork: 60, game: 10 });
  S.go(3); S.tap();
  for (let i = 0; i < 300 && !S.s.tasks.length; i++) S.go(1);
  assert.strictEqual(S.s.tasks[0].id, 'fork');
  assert.ok(S.s.playLeft(S.A.now()) < 0, 'the Fork alone used up the play time');
  S.tap();
  for (let i = 0; i < 120 && S.s.tasks.length < 2; i++) S.go(1);
  assert.strictEqual(S.s.tasks[1].kind, 'adaptive', JSON.stringify(S.s.tasks.map(t => t.id)));
});

test('waiting at the dot after a task does not use up play time', () => {
  const S = session({ stage: true }, { game: 8 });
  S.go(3); S.tap();
  for (let i = 0; i < 200 && S.s.T.state !== 'exit'; i++) S.go(0.5);
  S.go(2);
  assert.strictEqual(S.s.T.state, 'exit');
  const before = S.s.playLeft(S.A.now());
  S.go(25);
  assert.strictEqual(S.s.T.state, 'exit', 'the rider still waits for a tap');
  assert.ok(Math.abs(S.s.playLeft(S.A.now()) - before) < 0.1, `play time went from ${before} to ${S.s.playLeft(S.A.now())}`);
  S.tap(); S.go(5);
  assert.ok(S.s.playLeft(S.A.now()) < before - 4, 'riding on uses the clock again');
});

test('the dots say what to do: a line comes up after a moment of waiting and goes once the rider moves on', () => {
  const S = session();
  S.go(2.5); S.go(6);
  Object.assign(S.s.panel, { choice: 3, decisionMs: 900, done: true, finishedAt: S.A.now() });
  S.go(1); S.tap();
  for (let i = 0; i < 400 && S.s.phase !== 'walk'; i++) { if (S.s.core.trial?.onset != null) S.tap(); S.go(0.1); }
  assert.strictEqual(S.s.T.state, 'ready');
  S.go(3);
  assert.deepStrictEqual(plain(S.A.Guide.line(S.s, S.A.now())), { text: 'Tap the light to go on', kind: 'line' });
  S.tap(); S.go(1);
  assert.strictEqual(S.A.Guide.line(S.s, S.A.now()), null);
  for (let i = 0; i < 200 && S.s.T.state !== 'exit'; i++) S.go(0.5);
  S.go(0.5);
  assert.strictEqual(S.A.Guide.line(S.s, S.A.now()), null, 'not at once');
  S.go(2);
  assert.strictEqual(S.A.Guide.line(S.s, S.A.now())?.text, 'Tap the light to go on');
});

test('the autoplay story shows no dot line', () => {
  const S = session({ input: 'auto', stage: true });
  const seen = new Set();
  S.go(90, () => { const l = S.A.Guide.line(S.s, S.A.now()); if (l) seen.add(l.text); });
  assert.ok(!seen.has('Tap the light to go on'), [...seen].join(' | '));
});

// guide.js on its own, with hand-made sessions
const guide = () => {
  const ctx = { console, Math, Date, JSON, Object, Array, Number, String };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(JS, 'util.js'), 'utf8'), ctx);
  vm.runInContext(fs.readFileSync(path.join(JS, 'guide.js'), 'utf8'), ctx);
  ctx.A.LINES = LINES;
  return ctx.A;
};
const at = (h, m = 0) => new Date(2026, 10, 14, h, m);
const playing = (id, { game, ...o } = {}) => ({ phase: 'game', inputs: 0, T: { st: { lastTouch: -9 } }, ...o, game: { id, startAt: 0, inputs0: 0, done: false, ...game } });

test('greetings and the check-in question follow the real time of day', () => {
  const A = guide(), G = A.Guide;
  assert.deepStrictEqual(plain([5, 11, 12, 17, 18, 20, 21, 23, 0, 4].map(h => G.partOfDay(at(h)))),
    ['morning', 'morning', 'afternoon', 'afternoon', 'evening', 'evening', 'night', 'night', 'night', 'night']);
  assert.strictEqual(G.partOfDay(at(19, 10)), 'evening');
  assert.strictEqual(G.ask('evening'), 'How are you this evening?');
  assert.strictEqual(G.hello('evening'), 'Good evening.');
  assert.strictEqual(G.ask('afternoon'), 'How are you this afternoon?');
  assert.strictEqual(G.hello('morning'), 'Good morning.');
  assert.strictEqual(G.ask('night'), 'How are you tonight?');
  assert.deepStrictEqual(plain(G.line({ phase: 'checkin' }, 0, { part: 'evening' })), { text: 'How are you this evening?' });
  for (const p of ['afternoon', 'evening', 'night']) assert.ok(!/morning/i.test(G.ask(p) + G.hello(p) + G.note(p)), p);
});

test('the rest moment does not ask for a hold it does not wait for', () => {
  const A = guide();
  const l = A.Guide.line({ phase: 'rest' }, 0);
  assert.strictEqual(l.text, 'Rest a moment with the lantern');
  assert.ok(!/hold/i.test(l.text));
});

test('a task line stays until the first touch and comes back after a while without one', () => {
  const A = guide(), line = (s, now) => A.Guide.line(s, now)?.text ?? null;
  const s = playing('fork');
  assert.strictEqual(line(s, 0.1), LINES.fork);
  assert.strictEqual(line(s, 10), LINES.fork, 'no touch yet, still there after 10 s');
  Object.assign(s, { inputs: 1, T: { st: { lastTouch: 10 } } });
  assert.strictEqual(line(s, 10.2), null, 'gone after the first touch');
  assert.strictEqual(line(s, 15), null);
  assert.strictEqual(line(s, 16.5), LINES.fork, 'back after 6 s without a touch');
  s.T.st.lastTouch = 16.6;
  assert.strictEqual(line(s, 17), null);
  s.game.done = true;
  assert.strictEqual(line(s, 30), null, 'never over a finished task');
});

test('the Lanterns keep their line for the whole task, and three unanswered ones end it with a kind word', () => {
  const A = guide(), mem = {}, line = (s, now) => A.Guide.line(s, now, mem)?.text ?? null;
  const s = playing('lanterns', { inputs: 4, T: { st: { lastTouch: 2 }, waiting: () => 3 } });
  assert.strictEqual(line(s, 1), LINES.lanterns);
  assert.strictEqual(line(s, 30), LINES.lanterns, 'readable whenever the size cue comes');
  Object.assign(s.game, { done: true, missedRun: 3 });
  const note = line(s, 31);
  assert.ok(note && /lanterns/.test(note), note);
  assert.ok(!/miss|wrong|fail|bad|again/i.test(note), `no blame: ${note}`);
  Object.assign(s, { phase: 'walk', game: null });
  assert.strictEqual(line(s, 33), note, 'the word stays while the rider waits');
  assert.strictEqual(line(s, 37), 'Tap the light to go on', 'then the dot line');
  const done = playing('lanterns', { game: { done: true, missedRun: 0 } });
  assert.strictEqual(A.Guide.line(done, 31, {}), null, 'a Lanterns task answered to the end gets no note');
});

test('the app takes its greetings and play lines from guide.js, with no morning words of its own', () => {
  const main = fs.readFileSync(path.join(JS, 'main.js'), 'utf8'), quote = fs.readFileSync(path.join(JS, 'quote.js'), 'utf8');
  for (const words of ['Good morning', 'this morning', 'Hold the lantern']) assert.ok(!main.includes(words), `main.js still says "${words}"`);
  assert.ok(!quote.includes('Morning note'), 'quote.js still signs a note "Morning note"');
  assert.ok(main.includes('A.Guide.line(') && main.includes('A.Guide.hello('));
});

let failed = 0;
for (const [name, f] of tests) {
  try { f(); console.log('ok  ', name); } catch (e) { failed++; console.log('FAIL', name, '\n     ', e.message); }
}
process.exit(failed ? 1 : 0);
