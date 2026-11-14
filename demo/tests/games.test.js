// The minigames of demo/js/tasks, driven frame by frame the way engine.js runs them (g.t += dt; update; the
// session closes a game at g.max), with a manual clock and a seeded Math.random.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
const { recorder } = require('./harness');

const JS = path.join(__dirname, '..', 'js');
const DT = 1 / 60, B = { x: 27, y: 101, w: 335, h: 388 };

const load = (files, { seed = 7, skill = false } = {}) => {
  const mem = {};
  let clock = 0, s = seed;
  const R = () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
  const math = Object.create(Math);
  math.random = R;
  const ctx = { console, Math: math, Date, JSON, Set, Map, Object, Array, Number, String, URLSearchParams, Float32Array, setTimeout: () => 0 };
  ctx.window = ctx;
  ctx.devicePixelRatio = 1;
  ctx.location = { search: '' };
  ctx.navigator = {};
  ctx.localStorage = { getItem: k => mem[k] ?? null, setItem: (k, v) => { mem[k] = String(v); } };
  ctx.performance = { now: () => clock * 1000 };
  ctx.document = { addEventListener: () => {}, getElementById: () => null, createElement: () => ({ width: 0, height: 0, getContext: () => recorder([]) }) };
  vm.createContext(ctx);
  const base = ['util.js', 'juice.js', ...(skill ? ['skill.js'] : []), 'minigames.js'];
  const noop = () => {};
  for (const f of [...base, ...files]) {
    vm.runInContext(fs.readFileSync(path.join(JS, f), 'utf8'), ctx, { filename: f });
    if (f === 'util.js') ctx.A.Audio = new Proxy({}, { get: () => noop });
  }
  const A = ctx.A;
  A.now = () => clock;
  A.config = { reducedMotion: false };
  A.bus = A.bus || { emit() {}, on() {} };
  A.Input = A.Input || { holding: () => false };
  A.Pointer = A.Pointer || { down: false, x: 0, y: 0 };
  // One game as the session plays it: returns how it ended ('done', or 'max' when the session closed it at g.max).
  const play = (g, { seconds = 600, each } = {}) => {
    for (let n = 0; n < seconds / DT; n++) {
      clock += DT;
      A.J.step(DT, clock, g);
      g.t += DT;
      g.update(DT, clock);
      g.draw(recorder([]), B, A.J.at);
      each?.(g, clock);
      if (g.done) return 'done';
      if (g.t >= g.max) return 'max';
    }
    return 'running';
  };
  const make = (id, k = 0.5) => { A.J.reset(clock); const g = A.MINIGAMES[id].make(k, {}); g.startAt = clock; return g; };
  return { A, make, play, now: () => clock };
};

const tests = [];
const test = (name, f) => tests.push([name, f]);

test('vihta: a first tap after the wait still gets its whole 10 s run, and taps per second count that run', () => {
  const { make, play } = load(['tasks/kit.js', 'tasks/vihta.js']);
  const g = make('vihta');
  let next = 9;
  const end = play(g, { each: (g, now) => { if (now >= next) { g.down(0.5, 0.6, now); next = now + 0.25; } } });
  assert.strictEqual(end, 'done', `the run was cut at g.max ${g.max} s, ${g.extra.taps} taps in`);
  assert.ok(Math.abs(g.extra.taps_per_s - 4) < 0.15, `taps_per_s ${g.extra.taps_per_s} for one tap every 0.25 s`);
});

// A slow but valid player: every answer comes `after` seconds into the response window, inside the task's own limit.
const slow = {
  owls: [3.2, g => { const s = g.searches[g.i], P = g.pos(s, s.target, g.b); return g.state === 'search' && [(P.x - g.b.x) / g.b.w, (P.y - g.b.y) / g.b.h]; }],
  runes: [3.8, g => g.state === 'show' && (now => g.respond(g.trials[g.i].mirror, now))],
  faces: [1.8, g => g.state === 'probe' && [g.trials[g.i].probeSide > 0 ? 0.75 : 0.25, 0.5]],
  swans: [2.0, g => g.state === 'show' && (now => g.respond(g.trials[g.i].dir, now))],
  signpost: [2.0, g => g.state === 'show' && (now => g.respond(g.trials[g.i].dir, now))],
};
for (const [id, [after, answer]] of Object.entries(slow)) {
  test(`${id}: a player who answers every trial ${after} s in, inside the time limit, plays every trial`, () => {
    const { make, play } = load(['tasks/kit.js', `tasks/${id}.js`]);
    const g = make(id);
    let seen = null;
    const end = play(g, { each: (g, now) => {
      if (!g.b || seen === g.i || g.t - g.stateAt < after) return;
      const a = answer(g);
      if (!a) return;
      seen = g.i;
      if (typeof a === 'function') a(now); else g.down(a[0], a[1], now);
    } });
    const all = g.trials || g.searches, answered = all.filter(t => t.rt !== null).length;
    assert.strictEqual(end, 'done', `closed at g.max ${g.max.toFixed(1)} s with ${answered} of ${all.length} trials answered`);
    assert.strictEqual(answered, all.length);
  });
}

if (require.main !== module) module.exports = { load, DT, B };
else {
let failed = 0;
for (const [name, f] of tests) {
  try { f(); console.log('ok  ', name); } catch (e) { failed++; console.log('FAIL', name, '\n     ', e.message); }
}
process.exit(failed ? 1 : 0);
}
