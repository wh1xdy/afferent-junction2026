// The painted trees of the walk (world.js trees(); the six trees are one atlas, demo/assets/trees.webp, made by
// art/finalize_trees.py from art/plan.json): world.js draws them in a vm with a canvas that only records, and an A.Art
// stub whose loaded set the test chooses. Each slice of the atlas world.js draws is turned back into the tree's box.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const DEMO = path.join(__dirname, '..');
const MANIFEST = JSON.parse(fs.readFileSync(path.join(DEMO, 'assets', 'manifest.json'), 'utf8')).map(e => (typeof e === 'string' ? { name: e } : e));
const TREES = ['tree_birch_a', 'tree_birch_b', 'tree_birch_c', 'tree_spruce_a', 'tree_spruce_b', 'tree_spruce_c'];
const ATLAS = MANIFEST.find(e => e.name === 'trees') || {};
const WEBP = fs.existsSync(path.join(DEMO, 'assets', 'trees.webp')) ? fs.readFileSync(path.join(DEMO, 'assets', 'trees.webp')) : Buffer.alloc(32);
const ATLAS_SIZE = { w: 1 + WEBP.readUIntLE(24, 3), h: 1 + WEBP.readUIntLE(27, 3) };

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
const world = (loaded, entry = ATLAS) => {
  const draws = [];
  const ctx = { console, Math, Date, JSON, Set, Map, WeakMap, Object, Array, Number, String, Uint8ClampedArray, Float32Array, URLSearchParams, Proxy, Promise };
  ctx.window = ctx;
  ctx.location = { search: '' };
  ctx.performance = { now: () => 0 };
  ctx.document = { createElement: () => ({ width: 0, height: 0, getContext: () => context() }) };
  vm.createContext(ctx);
  const run = f => vm.runInContext(fs.readFileSync(path.join(DEMO, 'js', f), 'utf8'), ctx, { filename: f });
  run('util.js');
  const size = n => (n === 'trees' ? ATLAS_SIZE : { w: 300, h: 300 });
  ctx.A.Art = {
    has: n => loaded.has(n), aspect: n => size(n).w / size(n).h, size: n => (loaded.has(n) ? size(n) : null), meta: n => (n === 'trees' ? entry : {}),
    draw: (c, n, x, y, w, h) => { if (!loaded.has(n)) return false; draws.push({ n, x, y, w, h }); return true; },
    slice: (c, n, s0, s1, x, y, w, h) => {
      if (!loaded.has(n)) return false;
      if (n.startsWith('ground_')) draws.push({ n: 'ground' });
      if (n !== 'trees') return true;
      const name = Object.keys(entry.frames).find(k => Math.abs(entry.frames[k].s[0] - s0) < 1e-9 && Math.abs(entry.frames[k].s[1] - s1) < 1e-9);
      assert.ok(name, `slice ${s0}..${s1} is a tree's slice`);
      const [u0, u1, v0, v1] = entry.frames[name].b;
      draws.push({ n: name, x: x + u0 * w, y: y + v0 * h, w: (u1 - u0) * w, h: (v1 - v0) * h });
      return true;
    },
    bake: () => false, drop() {}, feather() {},
  };
  run('layers.js');
  run('world.js');
  const chunks = [];
  ['shore', 'forest', 'forest', 'forest', 'lake', 'forest', 'sauna', 'sauna', 'forest'].forEach((type, i, a) => {
    const prev = chunks[i - 1];
    chunks.push({ type, x0: -700 + i * 560, x1: -140 + i * 560, seed: 40 + i * 9, n: prev && prev.type === type ? prev.n + 1 : 0, from: prev && prev.type !== type ? prev.type : null });
  });
  const V = { t: 30, worldX: 0, sat: { yellow: 0.3, blue: 0.3, green: 0.3, dawn: 0 }, chunks, night: true, fog: 0.3, aurora: 0.2, terrain: null, cam: { x: 0, y: 0, z: 1 } };
  // the trees drawn, or with all = true everything recorded in drawing order (the ground's art as { n: 'ground' })
  const frame = (worldX, W = 390, H = 844, terrain = null, cam = { x: 0, y: 0, z: 1 }, all = false) => {
    draws.length = 0;
    Object.assign(V, { worldX, terrain, cam, t: 30 + worldX / 60 });
    ctx.A.World.draw(context(), W, H, V);
    return draws.filter(d => all || d.n.startsWith('tree_')).map(d => ({ ...d }));
  };
  return { frame, chunks };
};

const tests = [];
const test = (name, f) => tests.push([name, f]);
const ALL = new Set([...MANIFEST.map(e => e.name)]);

test('every image in the art manifest is a file in demo/assets', () => {
  for (const e of MANIFEST) assert.ok(fs.existsSync(path.join(DEMO, 'assets', `${e.name}.${e.ext || 'png'}`)), `${e.name}.${e.ext || 'png'} is missing`);
});

// art.js prepares every image's pixels at startup (alpha scan, grey and shade copies), so the six trees together stay
// under the pixels of the two images they replaced: birch_cluster 289x578 and mid_birch_grove 1341x533.
const OLD_PIXELS = 289 * 578 + 1341 * 533;

test('the six trees ship as one small WebP atlas with alpha, no more pixels than the old birch art, which is gone', () => {
  assert.strictEqual(ATLAS.ext, 'webp');
  const b = WEBP;
  assert.strictEqual(b.toString('ascii', 0, 4) + b.toString('ascii', 8, 12), 'RIFFWEBP');
  assert.strictEqual(b.toString('ascii', 12, 16), 'VP8X', 'an extended WebP');
  assert.ok(b[20] & 0x10, 'with an alpha channel');
  assert.ok(ATLAS_SIZE.h <= 560, `${ATLAS_SIZE.w}x${ATLAS_SIZE.h}`);
  assert.ok(ATLAS_SIZE.w * ATLAS_SIZE.h <= OLD_PIXELS, `${ATLAS_SIZE.w * ATLAS_SIZE.h} px against ${OLD_PIXELS} before`);
  assert.ok(b.length < 200 * 1024, `${Math.round(b.length / 1024)} KB`);
  assert.deepStrictEqual(Object.keys(ATLAS.frames).sort(), TREES, 'a frame for each tree');
  let last = 0;
  for (const n of TREES) {
    const { s: [s0, s1], b: [u0, u1, v0, v1], f: [f0, f1] = [] } = ATLAS.frames[n];
    assert.ok(s0 >= last - 1e-9 && s0 <= u0 && u0 < u1 && u1 <= s1 && s1 <= 1 && v0 >= 0 && v0 < v1 && v1 === 1, `${n} frame ${JSON.stringify(ATLAS.frames[n])}`);
    // f: the snow drift at the tree's foot (art/finalize_trees.py --feet), a good part of the box width
    assert.ok(f0 >= 0 && f1 <= 1 && f1 - f0 >= 0.3, `${n} drift ${JSON.stringify(ATLAS.frames[n].f)}`);
    last = s1;
  }
  for (const n of ['birch_cluster', 'mid_birch_grove', ...TREES]) assert.ok(!ALL.has(n), `${n} is not an image of its own in the manifest`);
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

test('an atlas entry without frames draws no painted trees, the procedural birches instead', () => {
  const w = world(ALL, { name: 'trees', ext: 'webp' });
  for (let x = -400; x <= 4400; x += 200) assert.deepStrictEqual(w.frame(x), []);
  assert.ok(w.chunks.filter(c => c.type === 'forest').every(c => Array.isArray(c._birch)), 'the forest chunks drew procedural birches');
});

// Each tree stands in a snow drift that is flat in the art. It is planted at the lowest point of the ground under its
// drift, so on a slope the drift's downhill end never hangs over the falling ground like a shelf (it did: Alex's
// screenshot of a ride at night, a spruce on a 0.35 descent), and what sinks into the rise is under the ground's edge.
const SLOPES = [null, wx => 26 * Math.sin(wx * 0.004) + 12 * Math.sin(wx * 0.011 + 1), wx => 140 * Math.sin(wx * 0.0025)];

test('trees stand in the snow on the ground line, even on a slope, stay below the top fifth of the screen and keep their place while scrolling', () => {
  for (const [W, H] of [[390, 844], [430, 932], [1024, 768]]) for (const terrain of SLOPES) {
    const w = world(ALL), u = H / 844, gy = H * 0.82;
    let prev = null, n = 0, steep = 0;
    for (let x = -400; x <= 4400; x += 6) {
      const ds = w.frame(x, W, H, terrain);
      for (const d of ds) {
        n++;
        assert.ok(d.y >= H * 0.2 - 0.5, `top ${d.y.toFixed(1)} of ${d.n} under ${(H * 0.2).toFixed(1)}`);
        // the ground line is gy minus the terrain, plus up to 1 px of noise and minus up to 2 px (world.js gyAt)
        const foot = d.y + d.h, [f0, f1] = ATLAS.frames[d.n].f, ground = sx => gy - (terrain ? terrain(x + sx - W * 0.35) * u : 0);
        const under = [0, 1, 2, 3, 4].map(i => ground(d.x + d.w * (f0 + (f1 - f0) * i / 4))), low = Math.max(...under, ground(d.x + d.w / 2));
        // nowhere under the drift is the ground lower than the tree's foot: no end of it hangs in the air
        for (const g of under) assert.ok(foot >= g - 2.5 * u, `${d.n} foot ${foot.toFixed(1)} over the ground at ${g.toFixed(1)}`);
        // and the foot sinks no more than a few px and 3 % of the height under the lowest point
        assert.ok(foot <= low + 1 * u + 5 * u + 0.03 * d.h + 0.5, `${d.n} foot ${foot.toFixed(1)} vs lowest ground ${low.toFixed(1)}`);
        if (Math.max(...under) - Math.min(...under) > 0.15 * d.w * (f1 - f0)) steep++;
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
    if (terrain === SLOPES[2]) assert.ok(steep > n / 4, `${steep} of ${n} trees on a slope`);
  }
});

test('every painted tree is drawn before the ground, whose edge hides the foot sunk into the snow', () => {
  for (const terrain of SLOPES) {
    const w = world(ALL);
    let n = 0;
    for (let x = -400; x <= 4400; x += 40) {
      const seq = w.frame(x, 390, 844, terrain, undefined, true).map(d => d.n), g = seq.indexOf('ground');
      const last = seq.reduce((k, s, i) => (s.startsWith('tree_') ? i : k), -1);
      if (last < 0) continue;
      n++;
      assert.ok(g > last, `at ${x}: a tree drawn after the ground (${seq.join(' ')})`);
    }
    assert.ok(n > 50, `${n} frames with trees`);
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
