const assert = require('assert');
const RT = require('../js/rt.js');

const results = [];
const test = (name, fn) => {
  try { fn(); results.push(['ok', name]); } catch (e) { results.push(['FAIL', name, e]); }
};

test('nothing cued gives null', () => {
  assert.strictEqual(RT.log().summary(), null);
});

test('median, iqr, lapses and anticipations follow core.rt conventions', () => {
  const l = RT.log();
  [[1, 0.4], [2, 0.5], [3, 0.6], [4, 0.7]].forEach(([id, d], i) => { l.cue(id, 'catch', i); assert.strictEqual(l.hit(id, i + d), Math.round(d * 1000)); });
  l.cue(5, 'catch', 10); assert.strictEqual(l.hit(5, 10.1), null);
  l.cue(6, 'beat', 20); l.lapse(6); l.lapse(6);
  l.early();
  assert.strictEqual(l.hit(99, 3), null);
  assert.deepStrictEqual(l.summary(), {
    n: 4, median_ms: 550, iqr_ms: 150, lapses: 1, anticipations: 2,
    by_kind: { catch: { n: 4, median_ms: 550 } },
  });
});

test('first cue wins, a second hit on the same cue is ignored, by_kind splits', () => {
  const l = RT.log();
  l.cue('a', 'choice', 1); l.cue('a', 'choice', 2);
  assert.strictEqual(l.hit('a', 1.8), 800);
  assert.strictEqual(l.hit('a', 2.5), null);
  l.cue('b', 'tap_target', 5); l.drop('b'); l.lapse('b');
  l.cue('c', 'tap_target', 6); l.hit('c', 6.3);
  const s = l.summary();
  assert.deepStrictEqual(s.by_kind, { choice: { n: 1, median_ms: 800 }, tap_target: { n: 1, median_ms: 300 } });
  assert.strictEqual(s.lapses, 0);
  assert.strictEqual(s.iqr_ms, 250);
});

test('the fishing hole, bite glow and splash scale with the scene, not with the window width', () => {
  const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'js', 'tasks', 'reaction.js'), 'utf8');
  const sized = src.split('\n').filter(l => /\b(img|bloom|sprite)\(|fw = /.test(l) && /g\.W \*/.test(l));
  assert.deepStrictEqual(sized, []);
});

for (const [s, name, e] of results) console.log(`${s} ${name}${e ? '\n  ' + (e.stack || e) : ''}`);
const failed = results.filter(r => r[0] === 'FAIL').length;
console.log(`${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
