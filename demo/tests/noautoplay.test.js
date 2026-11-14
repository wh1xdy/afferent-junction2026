const assert = require('assert');
const { load, run } = require('./harness');

const session = (opts = {}) => {
  const { A, tick } = load();
  const s = A.startSession({ clock: 'morning', input: 'touch', stage: false, profile: 'live', ...opts });
  const games = [];
  A.bus.on('game', g => games.push(g.id));
  const tap = () => { s.handle('pdown', { x: 0, y: 0, t: A.now() }); s.handle('pup', { x: 0, y: 0, t: A.now() }); };
  return { A, tick, s, games, tap, go: secs => run(A, tick, s, secs) };
};

const tests = [];
const test = (name, f) => tests.push([name, f]);

test('a default session with no input starts no minigame and scores nothing', () => {
  const { s, games, go } = session();
  go(60);
  assert.deepStrictEqual(games, []);
  assert.strictEqual(s.tasks.length, 0);
  assert.strictEqual(s.core.trials.length, 0);
  go(120);
  assert.deepStrictEqual(games, []);
  assert.strictEqual(s.core.trials.length, 0);
  assert.strictEqual(s.phase, 'rt');
  assert.strictEqual(s.done, false);
});

test('the reaction trials start on a tap after a skipped check-in', () => {
  const { s, tap, go } = session();
  go(40);
  assert.strictEqual(s.phase, 'rt');
  tap();
  go(30);
  assert.strictEqual(s.core.trials.length, 5);
  assert.strictEqual(s.phase, 'walk');
  assert.strictEqual(s.T.state, 'ready');
});

test('a short session with no input waits at the start of the ride', () => {
  const { s, games, go } = session({ stage: true });
  go(120);
  assert.deepStrictEqual(games, []);
  assert.strictEqual(s.T.state, 'ready');
});

test('a timed-out task ends, then the rider waits for a tap before travelling on', () => {
  const { s, games, tap, go } = session({ stage: true });
  go(3);
  tap();
  go(120);
  assert.strictEqual(games.length, 1);
  assert.strictEqual(s.tasks.length, 1);
  assert.strictEqual(s.tasks[0].completed_by, 'auto');
  assert.strictEqual(s.T.state, 'exit');
  tap();
  go(40);
  assert.strictEqual(games.length, 2);
});

test('a task that finishes itself without a tap is logged as auto, with a tap as touch', () => {
  for (const tapped of [false, true]) {
    const { A, s, tap, go } = session({ stage: true });
    const make = A.MEASURES.fork.make;
    A.MEASURES.fork.make = () => Object.assign(make(), { update(dt, now) { if (!this.done && this.t >= 3) { this.done = true; this.finishedAt = now; } } });
    go(3);
    tap();
    for (let i = 0; i < 60 && s.phase !== 'game'; i++) go(1);
    assert.strictEqual(s.game.id, 'fork');
    if (tapped) s.handle('key', { t: A.now() });
    go(6);
    assert.strictEqual(s.tasks[0].completed_by, tapped ? 'touch' : 'auto');
  }
});

test('the default input mode is touch, never auto', () => {
  const { A } = session();
  assert.strictEqual(A.Input.mode, 'touch');
});

test('only an explicit input=auto query selects auto mode', () => {
  const { A } = session();
  const parse = v => A.Input.parse(new URLSearchParams(v).get('input'));
  assert.strictEqual(parse(''), 'touch');
  assert.strictEqual(parse('clock=morning'), 'touch');
  assert.strictEqual(parse('input='), 'touch');
  assert.strictEqual(parse('input=touch'), 'touch');
  assert.strictEqual(parse('input=camera'), 'camera');
  for (const junk of ['AUTO', 'autoplay', 'true', '1', ' auto']) assert.strictEqual(parse('input=' + junk), 'touch', junk);
  assert.strictEqual(parse('input=auto'), 'auto');
});

test('a session started from the default mode or any non-auto query never runs in auto mode', () => {
  for (const q of ['', 'input=touch', 'input=camera', 'input=junk']) {
    const { A, tick } = load();
    const s = A.startSession({ clock: 'morning', input: A.Input.parse(new URLSearchParams(q).get('input')), stage: true, profile: 'live' });
    const games = [];
    A.bus.on('game', g => games.push(g.id));
    run(A, tick, s, 120);
    assert.strictEqual(s.auto, false, q);
    assert.deepStrictEqual(games, [], q);
    assert.strictEqual(s.T.state, 'ready', q);
  }
  const { A, tick } = load();
  const s = A.startSession({ clock: 'morning', input: A.Input.mode, stage: true, profile: 'live' });
  assert.strictEqual(s.auto, false);
  run(A, tick, s, 120);
  assert.strictEqual(s.tasks.length, 0);
});

test('autoplay still runs only when asked for explicitly', () => {
  const { s, games, go } = session({ stage: true, input: 'auto' });
  go(60);
  assert.ok(games.length >= 2, JSON.stringify(games));
  assert.ok(s.tasks.length >= 1);
});

let failed = 0;
for (const [name, f] of tests) {
  try { f(); console.log('ok  ', name); } catch (e) { failed++; console.log('FAIL', name, '\n     ', e.message); }
}
process.exit(failed ? 1 : 0);
