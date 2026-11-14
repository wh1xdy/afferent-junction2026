const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
const { recorder } = require('./harness');

const JS = path.join(__dirname, '..', 'js');
const DT = 1 / 60, B = { x: 27, y: 101, w: 335, h: 388 };

const load = (seed = 7) => {
  const mem = {};
  let clock = 0, s = seed;
  const R = () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
  const math = Object.create(Math);
  math.random = R;
  const ctx = { console, Math: math, Date, JSON, Set, Map, Object, Array, Number, String, URLSearchParams, setTimeout: () => 0 };
  ctx.window = ctx;
  ctx.location = { search: '' };
  ctx.navigator = {};
  ctx.localStorage = { getItem: k => mem[k] ?? null, setItem: (k, v) => { mem[k] = String(v); } };
  ctx.performance = { now: () => clock * 1000 };
  ctx.document = { addEventListener: () => {}, getElementById: () => null, createElement: () => ({ width: 0, height: 0, getContext: () => recorder([]) }) };
  vm.createContext(ctx);
  for (const f of ['util.js', 'juice.js', 'minigames.js', 'tasks/lanterns.js', 'measures.js']) vm.runInContext(fs.readFileSync(path.join(JS, f), 'utf8'), ctx, { filename: f });
  const A = ctx.A;
  A.now = () => clock;
  A.config = { reducedMotion: false };
  const make = () => { A.J.reset(clock); return A.MEASURES.lanterns.make(); };
  const frame = (g, { auto = true } = {}) => {
    clock += DT;
    A.J.step(DT, clock, g);
    g.t += DT;
    g.update(DT, clock);
    if (auto && !g.done) g.auto(DT, clock);
    g.draw(recorder([]), B, A.J.at);
    return A.PRESENT.lanterns.pair(g, B, A.J.at);
  };
  return { A, make, frame, now: () => clock };
};

const tests = [];
const test = (name, f) => tests.push([name, f]);

test('nothing of the pair is drawn before the intro ends, and a new task starts with an empty sky', () => {
  const { make, frame } = load();
  for (let k = 0; k < 2; k++) {
    const g = make();
    assert.strictEqual(g.L.sky.length, 0);
    while (g.L.rt < 0.4 - 1e-9) assert.deepStrictEqual([...frame(g)], [], `lantern drawn at rt ${g.L.rt.toFixed(3)}`);
    while (!g.done) frame(g);
  }
});

test('the practice pair arrives with its size difference: no lantern changes scale while it hangs', () => {
  const { make, frame } = load();
  const g = make();
  assert.ok(g.L.prac, 'a first session shows the practice pair');
  const seen = {};
  while (g.L.prac && !g.L.prac.done) {
    for (const l of frame(g)) {
      if (!(l.side in seen)) { seen[l.side] = l.sc; assert.ok(l.a < 0.5, `${l.side} lantern appears at alpha ${l.a.toFixed(2)}`); }
      assert.strictEqual(l.sc, seen[l.side], `${l.side} lantern popped from ${seen[l.side]} to ${l.sc} at practice t ${(g.L.rt - 0.4).toFixed(3)}`);
    }
  }
  assert.strictEqual(seen[g.L.prac.big], 1.3);
  assert.strictEqual(seen[g.L.prac.big === 'left' ? 'right' : 'left'], 1);
});

test('a released lantern leaves the rope where and as large as it was last drawn', () => {
  const { A, make, frame, now } = load();
  const g = make();
  let last = null;
  while (g.L.rt - 0.4 < 0.5) last = frame(g, { auto: false });
  const big = g.L.prac.big, before = last.find(l => l.side === big), pre = A.PRESENT.lanterns.pair(g, B, A.J.at).find(l => l.side === big);
  g.down(big === 'left' ? 0.3 : 0.7, 0.5, now());
  const s = g.L.sky[g.L.sky.length - 1];
  assert.ok(s, 'the tap releases the bigger practice lantern');
  assert.strictEqual(s.sc0, before.sc);
  assert.ok(Math.abs(s.x0 - pre.x) < 1e-6 && Math.abs(s.y0 - pre.y) < 1e-6, `released at ${s.x0.toFixed(1)},${s.y0.toFixed(1)}, drawn at ${pre.x.toFixed(1)},${pre.y.toFixed(1)}`);
  while (g.L.prac && !g.L.prac.done) frame(g, { auto: false });
  let tr = null;
  while (!(g.tr && g.tr.phase === 'cue' && g.tr.t - g.tr.cueT > 0.1)) last = frame(g, { auto: false });
  tr = g.tr;
  const side = tr.L === 'rich' ? tr.richSide : tr.richSide === 'left' ? 'right' : 'left';
  const drawn = A.PRESENT.lanterns.pair(g, B, A.J.at).find(l => l.side === side);
  g.down(side === 'left' ? 0.3 : 0.7, 0.5, now());
  const s2 = g.L.sky[g.L.sky.length - 1];
  assert.strictEqual(s2.sc0, drawn.sc);
  assert.strictEqual(s2.sc0, 1.08);
  assert.ok(Math.abs(s2.y0 - drawn.y) < 1e-6);
});

test('measured trials: no carry-over between trials, and the size cue is visible exactly from cue onset', () => {
  const { A, make, frame } = load(11);
  const first = make();
  while (!first.done) frame(first);
  A.PRESENT.lanterns.extra(first);
  const g = make();
  assert.ok(!g.L.prac, 'the second session skips the practice');
  let i = -1, onset = null, n = 0, seen = null;
  while (!g.done) {
    const pair = frame(g), tr = g.tr;
    if (!tr) { assert.deepStrictEqual([...pair], []); continue; }
    if (g.i !== i) { i = g.i; onset = null; n++; seen = new Set(); assert.strictEqual(tr.phase, 'ready'); }
    for (const l of pair) if (!seen.has(l.side)) {
      seen.add(l.side);
      assert.ok(tr.phase === 'ready' && l.sc === 1 && l.a < 0.5, `trial ${i} ${l.side}: ${tr.phase}, sc ${l.sc}, alpha ${l.a.toFixed(2)} on its first frame`);
    }
    if (tr.phase === 'cue') assert.strictEqual(pair.length, 2);
    const big = pair.find(l => l.sc > 1);
    if (tr.phase === 'ready') assert.ok(!big, `trial ${i}: a lantern is larger before the cue`);
    if (tr.phase === 'cue' && onset === null) { onset = tr.cueT; assert.ok(Math.abs(tr.t - tr.cueT) < 1e-9); assert.ok(big && big.sc === 1.08, `trial ${i}: cue not visible on its onset frame`); }
    if (tr.phase === 'cue') assert.strictEqual(!!big, tr.t - tr.cueT < 0.4);
  }
  assert.ok(n >= 10, `${n} trials ran`);
  for (const t of g.trials.filter(t => t.response !== null)) assert.ok(t.rt_ms >= 0, `rt ${t.rt_ms}`);
});

let failed = 0;
for (const [name, f] of tests) {
  try { f(); console.log('ok  ', name); } catch (e) { failed++; console.log('FAIL', name, '\n     ', e.message); }
}
process.exit(failed ? 1 : 0);
