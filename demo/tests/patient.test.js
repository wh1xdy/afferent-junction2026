// Run: node demo/tests/patient.test.js
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const DEMO = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(DEMO, 'patient.html'), 'utf8');
const js = fs.readFileSync(path.join(DEMO, 'js', 'patient.js'), 'utf8');
const css = fs.readFileSync(path.join(DEMO, 'css', 'patient.css'), 'utf8');

const tests = {
  'every nav tab opens its own panel'() {
    const nav = html.slice(html.indexOf('<nav id="nav"'), html.indexOf('</nav>'));
    const tabs = [...nav.matchAll(/data-tab="(\w+)"/g)].map(m => m[1]);
    const panels = [...html.matchAll(/data-panel="(\w+)"/g)].map(m => m[1]);
    const known = JSON.parse(js.match(/const TABS = (\[[^\]]*\])/)[1].replace(/'/g, '"'));
    assert.ok(tabs.length >= 4, tabs.join());
    for (const t of tabs) {
      assert.ok(panels.includes(t), `no panel for ${t}`);
      assert.ok(known.includes(t), `patient.js falls back to today for ${t}`);
    }
  },

  'the nav puts every tab in one row'() {
    const rule = css.match(/#nav \{[^}]*\}/)[0];
    assert.strictEqual(/grid-template-columns:\s*repeat\(\d/.test(rule), false, 'a fixed column count wraps the tabs past it');
  },
};

let failed = 0;
for (const [name, fn] of Object.entries(tests)) {
  try { fn(); console.log('ok  ', name); } catch (e) { failed++; console.log('FAIL', name, '\n     ', e.message); }
}
console.log(`${Object.keys(tests).length - failed} ok, ${failed} failed`);
process.exit(failed ? 1 : 0);
