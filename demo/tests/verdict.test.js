const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
const { recorder } = require('./harness');

const DT = 1 / 60, B = { x: 27, y: 101, w: 335, h: 388 };
const TASKS = ['fireflies', 'beacon', 'bells', 'shutters', 'threads', 'stars', 'loyly', 'breath', 'windows', 'vihta', 'birds', 'swans', 'faces', 'owls', 'seals', 'reindeer', 'ferry', 'drips', 'buoys', 'steps', 'glance', 'signpost', 'runes', 'fog'];
const MEASURES = ['fork', 'lanterns'];
const FILES = ['util.js', 'juice.js', 'minigames.js', 'tasks/kit.js', ...TASKS.map(t => `tasks/${t}.js`), 'measures.js', 'tasks/fork.js', 'tasks/lanterns.js'];

const load = (js, seed, extra = []) => {
  const mem = {};
  let clock = 0, s = seed;
  const R = () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
  const math = Object.create(Math);
  math.random = R;
  const ctx = { console, Math: math, Date, JSON, Set, Map, Object, Array, Number, String, URLSearchParams, setTimeout: () => 0, clearTimeout: () => {} };
  ctx.window = ctx;
  ctx.devicePixelRatio = 1;
  ctx.location = { search: '' };
  ctx.navigator = {};
  ctx.localStorage = { getItem: k => mem[k] ?? null, setItem: (k, v) => { mem[k] = String(v); } };
  ctx.performance = { now: () => clock * 1000 };
  ctx.document = { addEventListener: () => {}, getElementById: () => null, createElement: () => ({ width: 0, height: 0, getContext: () => recorder([]) }) };
  vm.createContext(ctx);
  const [first, ...rest] = FILES;
  vm.runInContext(fs.readFileSync(path.join(js, first), 'utf8'), ctx, { filename: first });
  const A = ctx.A;
  A.now = () => clock;
  A.config = { reducedMotion: false };
  A.Audio = new Proxy({}, { get: () => () => {} });
  A.Input = { holding: () => false };
  A.Pointer = { down: false };
  for (const f of [...rest, ...extra]) vm.runInContext(fs.readFileSync(path.join(js, f), 'utf8'), ctx, { filename: f });
  return { A, tick: () => { clock += DT; }, now: () => clock };
};

const INPUT = ['down', 'up', 'move', 'update'];
const simulate = (js, id, { seed = 11, noop = false, seconds = 150 } = {}) => {
  const { A, tick, now } = load(js, seed);
  const marks = [], calls = [];
  A.bus.on('verdict', m => marks.push(m));
  if (noop) A.J.verdict = () => {};
  A.J.reset(0);
  const def = A.MINIGAMES[id] || A.MEASURES[id];
  const g = def.make(0.5);
  if (typeof g.sync === 'function') g.sync();
  for (const k of INPUT) {
    const f = g[k];
    if (typeof f !== 'function') continue;
    g[k] = function (...a) {
      const n = marks.length, items = this.items, errors = this.errors;
      const r = f.apply(this, a);
      if (marks.length > n || this.items !== items || this.errors !== errors) calls.push({ k, t: now(), kinds: marks.slice(n).map(m => m.kind), di: this.items - items, de: this.errors - errors });
      return r;
    };
  }
  let steps = 0;
  while (!g.done && steps++ < seconds / DT) {
    tick();
    A.J.step(DT, now(), g);
    g.t += DT;
    g.update(DT, now());
    if (!g.done) g.auto?.(DT, now());
    g.draw(recorder([]), B, A.J.at);
  }
  const rec = JSON.parse(JSON.stringify({ items: g.items, errors: g.errors, extra: g.extra, choices: g.choices ?? null, trials: g.trials ?? null }));
  return { g, rec, marks, calls };
};

module.exports = { simulate, TASKS, MEASURES };

if (require.main === module) {
  const JS = path.join(__dirname, '..', 'js');
  const tests = [];
  const test = (name, f) => tests.push([name, f]);

  for (const id of [...TASKS, ...MEASURES]) {
    test(`${id}: the feedback never changes what is logged`, () => {
      for (const seed of [3, 11]) assert.deepStrictEqual(simulate(JS, id, { seed }).rec, simulate(JS, id, { seed, noop: true }).rec);
    });
    test(`${id}: every scored response shows its verdict, and only then`, () => {
      const { marks, calls } = simulate(JS, id);
      assert.ok(marks.length > 0, 'no feedback shown');
      for (const c of calls) {
        const has = k => c.kinds.includes(k);
        if (has('right')) assert.ok(c.di > 0 || c.de === 0, `right shown at ${c.t.toFixed(2)} in ${c.k} with ${c.de} new errors`);
        if (has('wrong') || has('miss')) assert.ok(c.de > 0 || c.di === 0, `${c.kinds} shown at ${c.t.toFixed(2)} in ${c.k} with ${c.di} new items and no error`);
        if (c.de > 0 && c.k !== 'update') assert.ok(has('wrong') || has('miss'), `${c.de} errors in ${c.k} at ${c.t.toFixed(2)} without a wrong or miss mark`);
        if (c.di > 0 && c.de === 0 && c.k !== 'update') assert.ok(has('right') || has('ok'), `${c.di} items in ${c.k} at ${c.t.toFixed(2)} without a right or ok mark`);
      }
    });
  }

  test('reaction: a caught fish is right, a false start wrong, a miss or lapse outlined at the bite, and the trial stays as logged', () => {
    const { A } = load(JS, 5, ['tasks/reaction.js']);
    const marks = [];
    A.bus.on('verdict', m => marks.push(m.kind));
    const P = A.PRESENT.reaction, s = { phase: 'rt', phaseAt: 0, core: { trial: null, trials: [] }, V: {} };
    for (const [outcome, rt, kind] of [['hit', 312, 'right'], ['miss', null, 'miss'], ['lapse', 1240, 'miss']]) {
      s.core.trial = { fp: 1.2, start: 0, onset: 1 };
      const trial = { trial: 1, foreperiod_ms: 1200, rt_ms: rt, outcome, modality: 'touch' }, before = JSON.stringify(trial);
      P.resolve(s, trial, 2);
      assert.strictEqual(marks.pop(), kind, outcome);
      assert.strictEqual(JSON.stringify(trial), before);
    }
    const tr = { fp: 1.2, start: 0, onset: null }, before = JSON.stringify(tr);
    P.early(s, tr, 0.6, false);
    assert.strictEqual(marks.pop(), 'wrong');
    P.early(s, tr, 0.7, true);
    assert.strictEqual(marks.length, 0, 'an ignored double tap shows nothing');
    assert.strictEqual(JSON.stringify(tr), before);
  });

  let fail = 0;
  for (const [name, f] of tests) {
    try { f(); console.log(`ok   ${name}`); } catch (e) { fail++; console.log(`FAIL ${name}\n     ${e.message.split('\n')[0]}`); }
  }
  console.log(`${tests.length - fail}/${tests.length} passed`);
  process.exit(fail ? 1 : 0);
}
