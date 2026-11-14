const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const JS = path.join(__dirname, '..', 'js');
const load = () => {
  const ctx = { console, Math, Date, JSON, Set, Map, Object, Array, Number, String, setTimeout: () => 0, URLSearchParams };
  ctx.window = ctx; ctx.navigator = {}; ctx.location = { search: '' }; ctx.addEventListener = () => {};
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(JS, 'util.js'), 'utf8'), ctx);
  vm.runInContext(fs.readFileSync(path.join(JS, 'minigames.js'), 'utf8'), ctx);
  const A = ctx.A;
  for (const [id, modes] of [['fireflies', ['wake', 'fatigue']], ['beacon', ['wake', 'fatigue']], ['bells', ['wake', 'fatigue']], ['shutters', ['fatigue', 'wake']], ['breath', ['calm', 'rest']]]) A.defineTask(id, { modes, make: () => ({}) });
  return A;
};

const tests = {
  'rotation: uniform draw among fresh eligible tasks, probability logged'() {
    const A = load(), n = {}, N = 8000;
    for (let i = 0; i < N; i++) {
      const { id, p } = A.pickGame('wake', null, new Set());
      assert.strictEqual(p, 1 / 4);
      n[id] = (n[id] || 0) + 1;
    }
    for (const id of ['fireflies', 'beacon', 'bells', 'shutters']) assert.ok(Math.abs(n[id] / N - 0.25) < 0.03, `${id} ${n[id]}`);
  },
  'rotation: played and last tasks are left out while fresh ones exist'() {
    const A = load();
    for (let i = 0; i < 200; i++) {
      const { id, p } = A.pickGame('wake', 'beacon', new Set(['fireflies']));
      assert.ok(id === 'bells' || id === 'shutters', id);
      assert.strictEqual(p, 0.5);
    }
  },
  'rotation: falls back to any task but the last once all were played'() {
    const A = load();
    const { id, p } = A.pickGame('wake', 'bells', new Set(['fireflies', 'beacon', 'bells', 'shutters']));
    assert.notStrictEqual(id, 'bells');
    assert.strictEqual(p, 1 / 3);
  },
  'instruction lines: one short line per task, no success or failure words'() {
    const A = load();
    for (const [id, line] of Object.entries(A.LINES)) {
      assert.ok(line.length <= 44, id);
      assert.ok(!/\b(good|bad|wrong|right|fail|win|lose|deep)\b/i.test(line), `${id}: ${line}`);
    }
  },
};

let failed = 0;
for (const [name, fn] of Object.entries(tests)) {
  try { fn(); console.log('ok  ', name); } catch (e) { failed++; console.log('FAIL', name, '\n     ', e.message); }
}
process.exit(failed ? 1 : 0);
