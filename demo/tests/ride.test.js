const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { load, run, plain } = require('./harness');

const ROOT = path.join(__dirname, '..', '..');

const session = (opts = {}) => {
  const { A, tick, ctx } = load();
  require('vm').runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'rt.js'), 'utf8'), ctx);
  const s = A.startSession({ clock: 'morning', input: 'touch', stage: true, profile: 'live', ...opts });
  const games = [];
  let doc = null;
  A.bus.on('game', g => games.push(g.id));
  A.bus.on('sessionEnd', d => { doc = d; });
  const tap = () => { s.handle('pdown', { x: 0, y: 0, t: A.now(), ts: A.now() }); s.handle('pup', { x: 0, y: 0, t: A.now() }); };
  return { A, tick, s, games, tap, doc: () => doc, go: (secs, each) => run(A, tick, s, secs, each) };
};

const toRide = t => {
  t.go(3);
  t.tap();
  for (let i = 0; i < 200 && t.s.T.state !== 'ride'; i++) t.go(0.05);
  assert.strictEqual(t.s.T.state, 'ride');
};

const until = (t, f, secs = 60, each) => { for (let i = 0; i < secs * 20 && !f(); i++) t.go(0.05, each); return f(); };

const python = () => {
  for (const py of ['python3', path.join(ROOT, 'hub', '.venv', 'bin', 'python'), path.join(ROOT, '..', '..', '..', 'hub', '.venv', 'bin', 'python')]) {
    try { execFileSync(py, ['-c', 'import jsonschema'], { stdio: 'ignore' }); return py; } catch {}
  }
  return null;
};

const tests = [];
const test = (name, f) => tests.push([name, f]);

test('a tap during the ride makes the rider jump, once per tap', () => {
  const t = session();
  toRide(t);
  const { b, st } = t.s.T;
  until(t, () => !b.air);
  t.go(0.3);
  assert.strictEqual(b.air, false);
  const y0 = b.y;
  t.tap();
  t.go(0.05);
  assert.strictEqual(b.air, true, 'the tap lifted the rider');
  t.go(0.2);
  assert.ok(b.y - t.s.T.T.h(b.x) > 20, 'the jump rises clearly above the snow');
  t.tap();
  t.go(0.05);
  assert.strictEqual(st.rec.jumps, 1, 'no double jump in the air');
  assert.ok(y0 !== undefined);
});

test('a tap just before landing still jumps on landing', () => {
  const t = session();
  toRide(t);
  const { b, st, T } = t.s.T;
  until(t, () => !b.air);
  t.go(0.3);
  t.tap();
  until(t, () => b.air && b.vy < 0 && b.y - T.h(b.x) < 6, 3);
  const n = st.rec.jumps;
  t.tap();
  until(t, () => st.rec.jumps > n, 0.4);
  assert.strictEqual(st.rec.jumps, n + 1, 'the buffered tap became a jump');
});

test('hitting every obstacle never fails: the ride slows, then goes on to the next part', () => {
  const t = session();
  toRide(t);
  const T = t.s.T, phases = new Set();
  assert.ok(until(t, () => t.games.length >= 1, 60, () => phases.add(T.state)), 'the ride reached the first task');
  assert.ok(T.st.tally.n >= 2, `obstacles on the way: ${T.st.tally.n}`);
  assert.strictEqual(T.st.tally.hit, T.st.tally.n, 'every obstacle was hit');
  assert.strictEqual(T.st.tally.cleared, 0);
  for (const p of phases) assert.ok(['ride', 'arrive', 'stage'].includes(p), `no other state on the way: ${p}`);
  assert.ok(T.st.events.some(e => e.type === 'hit'));
});

test('the ride hands over to every task and to the summit, also when nothing is jumped', () => {
  const t = session();
  toRide(t);
  for (let i = 0; i < 400 && t.s.phase !== 'dawn' && !t.s.done; i++) {
    if (t.s.T.state === 'exit') t.tap();
    t.go(1);
  }
  assert.ok(t.games.length >= 2, JSON.stringify(t.games));
  assert.ok(['dawn', 'end'].includes(t.s.phase) || t.s.done, t.s.phase);
});

test('obstacles cleared with good jumps are logged as cleared', () => {
  const t = session({ input: 'auto' });
  t.A.config.forceRide = 'flow';
  until(t, () => t.games.length >= 2, 90);
  const k = t.s.T.st.tally;
  assert.ok(k.n >= 2 && k.cleared >= k.n - 1, JSON.stringify(k));
});

test('no coin lights: no motes on the terrain, no mote sound, no mote count in the record', () => {
  const t = session({ input: 'auto' });
  const sounds = [];
  const noop = () => {};
  t.A.J = new Proxy({}, { get: (_, k) => (k === 'sfx' ? n => sounds.push(n) : k === 'beat' ? { set: noop } : noop) });
  until(t, () => t.games.length >= 1, 60);
  for (const g of t.s.T.T.segs) assert.ok(!('motes' in g), 'a segment carries motes');
  assert.ok(!sounds.includes('ride_mote'));
  assert.ok(sounds.includes('ride_jump'));
  const r = t.s.T.record();
  assert.ok(!('motes' in r) && !('silk_landings' in r));
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'traverse.js'), 'utf8');
  assert.ok(!/mote/i.test(src), 'traverse.js still mentions motes');
});

test('jumps and obstacles are logged into the session record, which still validates', () => {
  const t = session();
  toRide(t);
  let k = 0;
  until(t, () => t.games.length >= 1, 60, () => { if (++k % 12 === 0) t.tap(); });
  t.s.finish('partial');
  const doc = plain(t.doc()), ride = doc.ride;
  assert.strictEqual(ride.v, 2);
  assert.ok(ride.jumps >= 1 && ride.presses >= ride.jumps);
  assert.ok(ride.obstacles.n >= 2 && ride.obstacles.n === ride.obstacles.cleared + ride.obstacles.hit);
  assert.ok(ride.events.some(e => e.type === 'jump') && ride.events.some(e => e.type === 'hit' || e.type === 'clear'));
  for (const e of ride.events) assert.ok(Number.isInteger(e.t_ms) && ['jump', 'clear', 'hit'].includes(e.type), JSON.stringify(e));
  assert.ok(ride.rt && ride.rt.n + ride.rt.lapses + ride.rt.anticipations >= 1, JSON.stringify(ride.rt));
  assert.deepStrictEqual(Object.keys(ride.rt).sort(), ['anticipations', 'by_kind', 'iqr_ms', 'lapses', 'median_ms', 'n']);
  const py = python();
  if (!py) { console.log('      (no python with jsonschema: schema check skipped)'); return; }
  const tmp = path.join(require('os').tmpdir(), `ride-${process.pid}.json`);
  fs.writeFileSync(tmp, JSON.stringify(doc));
  const out = execFileSync(py, ['-c', `
import json, sys
from jsonschema import Draft202012Validator
schema = json.load(open(sys.argv[1]))
doc = json.load(open(sys.argv[2]))
example = json.load(open(sys.argv[3]))
example["ride"] = doc["ride"]
errs = [f"{e.json_path}: {e.message}" for e in Draft202012Validator(schema).iter_errors(example)]
rt = Draft202012Validator({"$defs": schema["$defs"], "$ref": "#/$defs/task_rt"})
errs += [f"ride.rt {e.json_path}: {e.message}" for e in rt.iter_errors(doc["ride"]["rt"])]
print(json.dumps(errs))
`, path.join(ROOT, 'contracts', 'session.v3.schema.json'), tmp, path.join(ROOT, 'contracts', 'fixtures', 'session_example.json')], { encoding: 'utf8' });
  fs.unlinkSync(tmp);
  assert.deepStrictEqual(JSON.parse(out), []);
});

test('the ride never plays itself: no jumps without input, and it waits at the start', () => {
  const t = session();
  t.go(60);
  assert.strictEqual(t.s.T.state, 'ready');
  assert.deepStrictEqual(t.games, []);
  t.tap();
  until(t, () => t.games.length >= 1, 60);
  assert.strictEqual(t.s.T.st.rec.jumps, 0, 'a jump happened without a tap');
  assert.strictEqual(t.s.T.st.rec.presses, 0);
  const c = session({ input: 'camera' });
  c.go(3); c.tap();
  until(c, () => c.games.length >= 1, 60);
  assert.strictEqual(c.s.T.st.rec.jumps, 0, 'camera mode jumped on its own');
});

test('the physics give the same path at 60 and at 120 frames a second', () => {
  const path_ = fps => {
    const { A, tick } = load();
    const real = Math.random;
    let seed = 7;
    Math.random = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
    try {
      A.config.forceRide = 'flow';
      const s = A.startSession({ clock: 'morning', input: 'touch', stage: true, profile: 'live' });
      const dt = 1 / fps, step = () => { tick(dt); A.Input.update(A.now(), dt); s.update(A.now(), dt); };
      for (let i = 0; i < 3 * fps; i++) step();
      s.handle('pdown', { x: 0, y: 0, t: A.now() });
      while (s.T.state !== 'ride') step();
      s.T.st.obs = []; s.T.st.nextObsX = Infinity;
      for (let i = 0; i < 6 * fps; i++) step();
      return s.T.b.x;
    } finally { Math.random = real; }
  };
  const a = path_(60), b = path_(120);
  assert.ok(Math.abs(a - b) < 8, `${a} vs ${b}`);
});

test('the background layers cover the whole screen at every camera height, dip and zoom along a ride', () => {
  const Layers = require('../js/layers.js');
  const t = session({ input: 'auto' });
  t.A.config.forceRide = 'wake';
  const W = 390, H = 844, u = H / 844;
  let samples = 0, maxLow = 0, maxCy = 0;
  until(t, () => t.games.length >= 2, 120, () => {
    const V = t.s.V, cam = V.cam || { x: 0, y: 0, z: 1 };
    if (typeof V.terrain !== 'function') return;
    const fx = W * 0.35 + cam.x;
    let low = 0;
    for (let i = 0; i <= 12; i++) low = Math.max(low, -V.terrain(V.worldX + i / 12 * W - fx) * u);
    const L = Layers.layout(W, H, cam.y, low);
    samples++; maxLow = Math.max(maxLow, low); maxCy = Math.max(maxCy, cam.y);
    assert.ok(Layers.covered(H, L.layers), `uncovered rows at cam ${JSON.stringify(cam)} low ${low}`);
    for (const [name, , bottom] of L.layers.slice(1)) assert.ok(bottom >= H, `${name} stops above the bottom of the screen`);
    assert.ok(L.hy <= L.my && L.my <= L.gy + low, 'layers keep their depth order');
    assert.ok(cam.z >= 1, 'the zoom never shows the outside of the scene');
  });
  assert.ok(samples > 200 && maxLow > 20 && maxCy > 0, `the ride dipped and flew: ${samples} ${maxLow} ${maxCy}`);
  assert.ok(!Layers.covered(H, [['sky', 0, 300], ['mid', 400, H]]), 'the check finds a gap');
});

test('ground tiles never change once made, one ground look per leg, biome changes fade over a tile', () => {
  const t = session({ input: 'auto' });
  const seen = new Map();
  let changes = 0, fades = 0;
  until(t, () => t.games.length >= 2 || t.s.phase === 'dawn', 150, () => {
    const V = t.s.V;
    for (const c of V.chunks) {
      const k = seen.get(c);
      if (!k) { seen.set(c, `${c.x0}|${c.x1}|${c.type}|${c.from}`); if (c.from) fades++; continue; }
      if (k !== `${c.x0}|${c.x1}|${c.type}|${c.from}`) changes++;
    }
    for (let i = 1; i < V.chunks.length; i++) {
      const a = V.chunks[i - 1], c = V.chunks[i];
      assert.ok(Math.abs(c.x0 - a.x1) < 1, 'tiles are contiguous');
      if (c.type !== a.type && a.pierEnd == null) assert.strictEqual(c.from, a.type, 'a biome change starts with a crossfade tile');
    }
  });
  assert.strictEqual(changes, 0, 'a ground tile was resized or retyped after it was made');
  const types = [...seen.keys()].map(c => c.type);
  assert.ok(seen.size > 8, `tiles made: ${seen.size}`);
  assert.ok(new Set(types).size <= t.games.length + 2, `ground looks: ${[...new Set(types)].join()}`);
  assert.ok(fades >= 1, 'the ground changed look without a crossfade tile');
});

test('reduced motion keeps the camera still', () => {
  const t = session();
  t.A.config.reducedMotion = true;
  toRide(t);
  t.go(4, () => t.tap());
  assert.deepStrictEqual(plain(t.s.V.cam), { x: 0, y: 0, z: 1 });
});

let failed = 0;
for (const [name, f] of tests) {
  try { f(); console.log('ok  ', name); } catch (e) { failed++; console.log('FAIL', name, '\n     ', e.message); }
}
process.exit(failed ? 1 : 0);
