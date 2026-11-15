// The painted trees of the walk (world.js trees(), art in demo/assets/tree_*.webp, plan in art/plan.json): world.js
// draws them in a vm with a canvas that only records, and an A.Art stub whose loaded set the test chooses.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const DEMO = path.join(__dirname, '..');
const MANIFEST = JSON.parse(fs.readFileSync(path.join(DEMO, 'assets', 'manifest.json'), 'utf8')).map(e => (typeof e === 'string' ? { name: e } : e));
const TREES = ['tree_birch_a', 'tree_birch_b', 'tree_birch_c', 'tree_spruce_a', 'tree_spruce_b', 'tree_spruce_c'];

// A 2D context that draws nothing; the few calls whose result world.js reads give something of the right shape.
const context = () => new Proxy({ globalAlpha: 1, globalCompositeOperation: 'source-over', canvas: { width: 780, height: 1688 } }, {
  get: (t, k) => {
    if (k in t) return t[k];
    if (k === 'createImageData' || k === 'getImageData') return (...a) => { const w = a.length > 2 ? a[2] : a[0], h = a.length > 2 ? a[3] : a[1]; return { width: w, height: h, data: new Uint8ClampedArray(Math.max(1, w * h * 4)) }; };
    if (k === 'getTransform') return () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
    if (k === 'measureText') return () => ({ width: 0 });
    return () => ({ addColorStop() {} });
  },
  set: (t, k, v) => { t[k] = v; return true; },
});

// Loads util.js, layers.js and world.js with `loaded` as the art that has arrived, and returns a scroll renderer.
const world = loaded => {
  const draws = [];
  const ctx = { console, Math, Date, JSON, Set, Map, WeakMap, Object, Array, Number, String, Uint8ClampedArray, Float32Array, URLSearchParams, Proxy, Promise };
  ctx.window = ctx;
  ctx.location = { search: '' };
  ctx.performance = { now: () => 0 };
  ctx.document = { createElement: () => ({ width: 0, height: 0, getContext: () => context() }) };
  vm.createContext(ctx);
  const run = f => vm.runInContext(fs.readFileSync(path.join(DEMO, 'js', f), 'utf8'), ctx, { filename: f });
  run('util.js');
  const size = n => (n.startsWith('tree_spruce_c') ? { w: 402, h: 520 } : n.startsWith('tree_') ? { w: 360, h: 760 } : { w: 300, h: 300 });
  ctx.A.Art = {
    has: n => loaded.has(n), aspect: n => size(n).w / size(n).h, size: n => (loaded.has(n) ? size(n) : null), meta: () => ({}),
    draw: (c, n, x, y, w, h) => { if (!loaded.has(n)) return false; draws.push({ n, x, y, w, h }); return true; },
    slice: () => false, bake: () => false, drop() {}, feather() {},
  };
  run('layers.js');
  run('world.js');
  const chunks = [];
  ['shore', 'forest', 'forest', 'forest', 'lake', 'forest', 'sauna', 'sauna', 'forest'].forEach((type, i, a) => {
    const prev = chunks[i - 1];
    chunks.push({ type, x0: -700 + i * 560, x1: -140 + i * 560, seed: 40 + i * 9, n: prev && prev.type === type ? prev.n + 1 : 0, from: prev && prev.type !== type ? prev.type : null });
  });
  const V = { t: 30, worldX: 0, sat: { yellow: 0.3, blue: 0.3, green: 0.3, dawn: 0 }, chunks, night: true, fog: 0.3, aurora: 0.2, terrain: null, cam: { x: 0, y: 0, z: 1 } };
  const frame = (worldX, W = 390, H = 844, terrain = null, cam = { x: 0, y: 0, z: 1 }) => {
    draws.length = 0;
    Object.assign(V, { worldX, terrain, cam, t: 30 + worldX / 60 });
    ctx.A.World.draw(context(), W, H, V);
    return draws.filter(d => d.n.startsWith('tree_')).map(d => ({ ...d }));
  };
  return { frame, chunks };
};

const tests = [];
const test = (name, f) => tests.push([name, f]);
const ALL = new Set([...MANIFEST.map(e => e.name)]);

test('every image in the art manifest is a file in demo/assets', () => {
  for (const e of MANIFEST) assert.ok(fs.existsSync(path.join(DEMO, 'assets', `${e.name}.${e.ext || 'png'}`)), `${e.name}.${e.ext || 'png'} is missing`);
});

test('the six trees ship as small WebP files with alpha, and the old flat birch art is gone', () => {
  for (const n of TREES) {
    const e = MANIFEST.find(m => m.name === n);
    assert.ok(e && e.ext === 'webp', `${n} is a webp entry of the manifest`);
    const b = fs.readFileSync(path.join(DEMO, 'assets', `${n}.webp`));
    assert.strictEqual(b.toString('ascii', 0, 4) + b.toString('ascii', 8, 12), 'RIFFWEBP');
    assert.strictEqual(b.toString('ascii', 12, 16), 'VP8X', `${n} is an extended WebP`);
    assert.ok(b[20] & 0x10, `${n} has an alpha channel`);
    const w = 1 + b.readUIntLE(24, 3), h = 1 + b.readUIntLE(27, 3);
    assert.ok(Math.max(w, h) <= 760, `${n} is ${w}x${h}`);
    assert.ok(b.length < 120 * 1024, `${n} is ${Math.round(b.length / 1024)} KB`);
  }
  for (const n of ['birch_cluster', 'mid_birch_grove']) assert.ok(!ALL.has(n), `${n} left the manifest`);
});

test('with the art in, the forest and sauna stretches draw painted trees and not the procedural birches', () => {
  const w = world(ALL), seen = new Set();
  for (let x = -400; x <= 4400; x += 50) for (const d of w.frame(x)) seen.add(d.n);
  assert.deepStrictEqual([...seen].sort(), TREES, 'every tree sprite is used');
  assert.ok(w.chunks.every(c => !c._birch), 'no chunk laid out procedural birches');
  assert.ok(w.chunks.filter(c => c.type === 'forest').every(c => c._trees && c._trees.length >= 4), 'every forest chunk has its trees');
  for (const c of w.chunks) if (c._trees) for (const t of c._trees) if (!t.back) assert.notStrictEqual(t.name, 'tree_spruce_c', 'the small spruce stays in the back row');
});

test('before the art arrives the procedural birches draw', () => {
  const w = world(new Set(ALL.has('figure_ride') ? ['figure_ride'] : []));
  for (let x = -400; x <= 4400; x += 200) assert.deepStrictEqual(w.frame(x), []);
  assert.ok(w.chunks.filter(c => c.type === 'forest').every(c => Array.isArray(c._birch)), 'the forest chunks drew procedural birches');
});

test('with part of the art in, only the loaded trees draw', () => {
  const w = world(new Set([...ALL].filter(n => n !== 'tree_spruce_a' && n !== 'tree_birch_b')));
  for (let x = -400; x <= 4400; x += 50) for (const d of w.frame(x)) assert.ok(d.n !== 'tree_spruce_a' && d.n !== 'tree_birch_b');
});

test('trees stand on the ground line, stay below the top fifth of the screen and keep their place while scrolling', () => {
  for (const [W, H] of [[390, 844], [430, 932]]) for (const terrain of [null, wx => 26 * Math.sin(wx * 0.004) + 12 * Math.sin(wx * 0.011 + 1)]) {
    const w = world(ALL), u = H / 844, gy = H * 0.82;
    let prev = null, n = 0;
    for (let x = -400; x <= 4400; x += 6) {
      const ds = w.frame(x, W, H, terrain);
      for (const d of ds) {
        n++;
        assert.ok(d.y >= H * 0.2 - 0.5, `top ${d.y.toFixed(1)} of ${d.n} under ${(H * 0.2).toFixed(1)}`);
        const foot = d.y + d.h, xc = d.x + d.w / 2, ground = gy - (terrain ? terrain(x + xc - W * 0.35) * u : 0);
        // the ground line is gy minus the terrain, plus up to 3 px of noise and minus 2 px (world.js gyAt); the foot
        // sinks a few px and 3 % of the height into it so the snow drift sits in the snow
        assert.ok(foot >= ground - 2.5 * u && foot <= ground + 3 * u + 5 * u + 0.03 * d.h + 0.5, `${d.n} foot ${foot.toFixed(1)} vs ground ${ground.toFixed(1)}`);
      }
      if (prev) for (const d of ds) {
        if (d.x + d.w < 0 || d.x > W) continue;
        // an on-screen tree was there a step before, 6 px (near row) or about 5 px (back row) to the right
        const was = prev.find(p => p.n === d.n && Math.abs(p.x - d.x - 6 * 0.97) < 1.5 || p.n === d.n && Math.abs(p.x - d.x - 6 * 0.82) < 1.5);
        assert.ok(was || d.x > W - 8 || d.x + d.w < 8, `${d.n} popped in at x ${d.x.toFixed(1)}`);
      }
      prev = ds;
    }
    assert.ok(n > 500, `${n} tree draws`);
  }
});

test('at a ride\'s zoom and camera height, on a steep rise, tree tops stay under the top controls on the screen', () => {
  const steep = wx => 280 * Math.sin(wx * 0.003);
  for (const [W, H] of [[390, 844], [430, 932]]) for (const cam of [{ x: -60, y: -0.05 * H, z: 1.08 }, { x: 0, y: 0.18 * H, z: 1 }]) {
    const w = world(ALL), gy = H * 0.82 + cam.y, line = Math.max(H * 0.2, 56 + 12 * H / 844);
    let n = 0, clamped = 0;
    for (let x = -400; x <= 4400; x += 25) for (const d of w.frame(x, W, H, steep, cam)) {
      n++;
      const top = gy + (d.y - gy) * cam.z;
      if (top < line + 0.012 * H) clamped++;
      assert.ok(top >= line - 0.5, `${d.n} top ${top.toFixed(1)} above ${line.toFixed(1)} at zoom ${cam.z}`);
    }
    assert.ok(n > 100 && (cam.z > 1 ? clamped > 0 : true), `${n} draws, ${clamped} held under the line`);
  }
});

let failed = 0;
for (const [name, f] of tests) {
  try { f(); console.log('ok  ', name); } catch (e) { failed++; console.log('FAIL', name, '\n     ', e.message); }
}
process.exit(failed ? 1 : 0);
