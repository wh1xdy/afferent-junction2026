const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const JS = path.join(__dirname, '..', 'js');
const load = () => {
  const mem = {};
  const ctx = { console, Math, Date, JSON, Set, Map, Object, Array, Number, String, URLSearchParams };
  ctx.window = ctx;
  ctx.location = { search: '' };
  ctx.localStorage = { getItem: k => mem[k] ?? null, setItem: (k, v) => { mem[k] = String(v); } };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(JS, 'util.js'), 'utf8'), ctx);
  vm.runInContext(fs.readFileSync(path.join(JS, 'skill.js'), 'utf8'), ctx);
  return { A: ctx.A, mem };
};

const rng = seed => () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const bot = (theta, R) => d => {
  const m = Math.max(0.05, Math.min(0.98, 0.78 + 1.5 * (theta - d)));
  if (m >= 0.8) return R() < (m - 0.8) / 0.2 ? 'perfect' : 'good';
  return R() < m / 0.8 ? 'good' : R() < 0.5 ? 'barely' : 'miss';
};

const tests = [];
const test = (name, f) => tests.push([name, f]);

test('a fixed-skill bot brings L within 0.05 of its level and o_mean into 0.75 to 0.80', () => {
  for (const theta of [0.25, 0.55, 0.8]) {
    const { A } = load(), R = rng(Math.round(theta * 1000)), play = bot(theta, R), late = [];
    A.Skill.define('beacon', { bpm: { v0: 84, v1: 100, cat: 'tempo' } });
    for (let day = 0; day < 30; day++) {
      A.Skill.begin({ auto: false, profile: 'live' });
      A.Skill.start('beacon', 'flow', 0.4);
      for (let i = 0; i < 12; i++) A.Skill.trial('beacon', play(A.Skill.base('beacon')));
      const dda = A.Skill.finish('beacon');
      A.Skill.save();
      if (day >= 20) late.push(dda.o_mean);
    }
    const L = A.Skill.task('beacon').L, o = late.reduce((a, b) => a + b, 0) / late.length;
    assert.ok(Math.abs(L - theta) < 0.05, `theta ${theta}: L ${L.toFixed(3)}`);
    assert.ok(o >= 0.75 && o <= 0.8, `theta ${theta}: o_mean ${o.toFixed(3)}`);
  }
});

test('autoplay and simulated profiles never move or store the persisted level', () => {
  for (const s of [{ auto: true, profile: 'live' }, { auto: false, profile: 'bad_day' }]) {
    const { A, mem } = load();
    A.Skill.begin(s);
    A.Skill.start('bells', 'wake', 0.5);
    for (let i = 0; i < 5; i++) A.Skill.trial('bells', 'perfect');
    const dda = A.Skill.finish('bells');
    assert.strictEqual(A.Skill.task('bells').L, A.Skill.L0);
    assert.strictEqual(dda.w, 0);
    assert.strictEqual(A.Skill.save(), false);
    assert.strictEqual(Object.keys(mem).length, 0);
  }
});

test('persisted level moves at most 0.12 per task per session', () => {
  const { A } = load();
  A.Skill.begin({ auto: false, profile: 'live' });
  A.Skill.start('stars', 'flow', 0.4);
  for (let i = 0; i < 60; i++) A.Skill.trial('stars', 'perfect');
  A.Skill.finish('stars');
  assert.ok(Math.abs(A.Skill.task('stars').L - (A.Skill.L0 + 0.12)) < 1e-9);
});

test('axes interpolate geometric and linear, calm pins tempo axes at d 0, unlocks step', () => {
  const { A } = load();
  A.Skill.define('loyly', { bloom: { v0: 2.6, v1: 4.5, geo: true, cat: 'patience' }, speed: { v0: 1, v1: 2, cat: 'tempo' }, stones: { v0: 8, v1: 12, int: true, cat: 'load' }, pours: { steps: [[0, 2], [0.6, 3]], cat: 'load' } });
  A.Skill.begin({ auto: false, profile: 'live' });
  A.Skill.start('loyly', 'calm', 0);
  const d = A.Skill.base('loyly');
  assert.ok(Math.abs(A.Skill.axis('loyly', 'bloom') - 2.6 * Math.pow(4.5 / 2.6, d)) < 1e-9);
  assert.strictEqual(A.Skill.axis('loyly', 'speed'), 1);
  assert.strictEqual(A.Skill.axis('loyly', 'stones'), Math.round(8 + 4 * d));
  assert.strictEqual(A.Skill.axis('loyly', 'pours'), d >= 0.6 ? 3 : 2);
  assert.strictEqual(A.Skill.axis('loyly', 'missing', 7), 7);
});

test('combo: a miss drops to the start of the tier, a second miss one tier more, fever once', () => {
  const { A } = load();
  A.Skill.begin({ auto: false, profile: 'live' });
  A.Skill.start('fireflies', 'wake', 0.5);
  const run = gs => gs.map(g => A.Skill.trial('fireflies', g));
  run(Array(7).fill('good'));
  assert.strictEqual(A.Skill.cur.c, 7);
  run(['miss']);
  assert.strictEqual(A.Skill.cur.c, 6);
  run(['miss']);
  assert.strictEqual(A.Skill.cur.c, 3);
  const r = run(Array(7).fill('perfect'));
  assert.strictEqual(r.filter(x => x.fever).length, 1);
  const dda = A.Skill.finish('fireflies');
  assert.strictEqual(dda.tier_max, 3);
  assert.ok(dda.fever && dda.light_share > 0 && dda.light_share <= 1);
});

test('assist: the start mood never switches it on, whatever the value', () => {
  for (const mood of [1, 2, 3, 4, 5, null]) {
    const { A } = load();
    A.Skill.begin({ auto: false, profile: 'live' });
    A.Skill.coreDone({ mood_start: mood, rt: { valid: true, median_ms: 400, lapses: 0 } });
    A.Skill.start('beacon', 'flow', 0.4);
    assert.ok(!A.Skill.assisted(), `mood ${mood}`);
    assert.strictEqual(JSON.stringify(A.Skill.record().assist_reasons), '[]');
  }
});

test('assist needs two behaviour signals, silently lowers d and freezes the credit', () => {
  const { A } = load();
  A.Skill.begin({ auto: false, profile: 'live' });
  A.Skill.coreDone({ mood_start: 1, rt: { valid: true, median_ms: 400, lapses: 2 } });
  A.Skill.start('bells', 'wake', 0.5);
  assert.ok(!A.Skill.assisted());
  A.Skill.finish('bells');
  A.Skill.tick(0.7, 21);
  A.Skill.start('beacon', 'flow', 0.4);
  assert.ok(A.Skill.assisted());
  assert.ok(Math.abs(A.Skill.base('beacon') - (A.Skill.L0 - 0.15 + A.Skill.sess.heatMax)) < 1e-9);
  A.Skill.trial('beacon', 'perfect');
  assert.strictEqual(A.Skill.task('beacon').L, A.Skill.L0);
  assert.strictEqual(JSON.stringify(A.Skill.record().assist_reasons), '["rt_lapses","fatigue"]');
});

test('ramp thirds, boss on the last item, heat across tasks', () => {
  const { A } = load();
  A.Skill.begin({ auto: false, profile: 'live' });
  A.Skill.start('shutters', 'flow', 0.4);
  A.Skill.finish('shutters');
  A.Skill.start('threads', 'flow', 0.4);
  const L = A.Skill.level('threads');
  const at = i => { A.Skill.progress('threads', i, 6); return A.Skill.base('threads') - L; };
  assert.ok(Math.abs(at(0) - 0.03) < 1e-9);
  assert.strictEqual(A.Skill.progress('threads', 2, 6), 1);
  assert.ok(Math.abs(at(3) - 0.09) < 1e-9);
  assert.ok(Math.abs(at(4) - 0.15) < 1e-9);
  assert.ok(Math.abs(at(5) - 0.35) < 1e-9);
});

let failed = 0;
for (const [name, f] of tests) {
  try { f(); console.log('ok  ', name); } catch (e) { failed++; console.log('FAIL', name, '\n     ', e.message); }
}
process.exit(failed ? 1 : 0);
