// Run: node demo/tests/screen.test.js
// The painted world keeps out of the phone's system bar and the play controls (js/layers.js): the moon sits under
// the safe top and clear of the ×, the SIMULATED badge, the wake button and a task's line on every phone size, and
// the forest bough reaches in from the right edge under that row. world.js draws both from these numbers.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const L = require('../js/layers.js');

// Portrait phones from the smallest supported to the largest: width, height, safe top (status bar or island).
const PHONES = [[375, 667, 20], [375, 812, 50], [390, 844, 47], [390, 844, 59], [393, 852, 59], [402, 874, 62], [414, 896, 48], [430, 932, 59], [440, 956, 62]];
const hit = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

const tests = {
  'the moon is under the safe top and clear of every top control, on every phone, walking or not'() {
    for (const [W, H, top] of PHONES) for (const drift of [0, 20, 200, 5000]) {
      const m = L.moon(W, H, top, drift), d = L.moonDisc(m), C = L.controls(W, top), at = `${W}x${H} top ${top} drift ${drift}`;
      assert.ok(d.y0 >= top + 4, `${at}: the moon reaches up to ${d.y0.toFixed(1)}, into the status bar (${top})`);
      assert.ok(m.y - 1.2 * m.r >= top - 2, `${at}: even its sprite's edge stays out of the bar`);
      for (const k of ['close', 'wake', 'badge']) assert.ok(!hit(d, C[k]), `${at}: the moon sits on the ${k}`);
      assert.ok(d.y1 <= C.line - 4, `${at}: the moon reaches down to a task's line`);
      assert.ok(d.x0 > W / 2 && d.x1 < W, `${at}: upper right`);
    }
  },

  'the moon drifts left a little while walking, and no further than the badge'() {
    const a = L.moon(390, 844, 59, 0), b = L.moon(390, 844, 59, 40), c = L.moon(390, 844, 59, 1e6);
    assert.ok(a.x > b.x && b.x >= c.x, `${a.x} ${b.x} ${c.x}`);
    assert.strictEqual(c.x, L.moon(390, 844, 59, 2e6).x, 'it stops');
  },

  'world.js places the moon and the bough by these numbers, under the safe top, at any zoom'() {
    const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'world.js'), 'utf8');
    assert.ok(/A\.Layers\.moon\(W, H, insetTop\(\)/.test(src), 'the moon comes from Layers.moon with the safe inset');
    assert.ok(/unzoom\(m\.x, m\.y\)/.test(src), 'and is placed through the zoom, so a ride zoom cannot lift it into the bar');
    assert.ok(/unzoom\(W \+ 0\.1 \* w, C\.line \+ 4 \* u\)/.test(src), 'the bough reaches in from off the right edge, under the row of the top controls');
    assert.ok(!/translate\(x, -14 \* u\)/.test(src), 'no bough hangs from above the screen, through the status bar, any more');
  },
};

let failed = 0;
for (const [name, fn] of Object.entries(tests)) {
  try { fn(); console.log('ok  ', name); } catch (e) { failed++; console.log('FAIL', name, '\n     ', e.message); }
}
process.exit(failed ? 1 : 0);
