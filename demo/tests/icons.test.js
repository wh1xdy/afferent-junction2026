// Run: node demo/tests/icons.test.js
// Every Material Symbols name the app shows must be in the bundled subset font (demo/fonts/MaterialSymbolsRounded-subset.woff2,
// names listed in demo/fonts/icon-names.txt). A name that is not in the subset renders as its letters: Settings showed
// the word DASHBOARD instead of an icon. Same check as the clip check's test k (PR #46), over the whole UI.
// The subset is cut from the full Material Symbols Rounded font with the names in icon-names.txt (there is no script for
// it in the repo); a new icon means a new cut of the woff2 and its name added to the list, or an icon already in it.
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const DEMO = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(DEMO, f), 'utf8');
const SUBSET = new Set(read('fonts/icon-names.txt').trim().split(',').map(s => s.trim()));

const walk = dir => fs.readdirSync(path.join(DEMO, dir), { withFileTypes: true }).flatMap(d =>
  d.isDirectory() ? walk(path.join(dir, d.name)) : d.name.endsWith('.js') ? [path.join(dir, d.name)] : []);
const SOURCES = [...fs.readdirSync(DEMO).filter(f => f.endsWith('.html')), ...walk('js').filter(f => !/voice-config\.js$/.test(f))];

const NAME = '([a-z][a-z0-9_]*)';
// Where an icon name is written: an icon span (class "ms ...") with a literal name and a Settings row ({ icon: 'name' })
// anywhere; and in the files that build icon spans from data: the signals rows (vitals.js row('name', ...)), the
// onboarding toggles and step rows (onboard.js) and the behavioural activation icon map (ba.js).
const PATTERNS = [
  [/./, new RegExp(`class="ms( [^"]*)?"[^>]*>${NAME}<`, 'g'), m => ({ name: m[2], fill: /\bfill\b/.test(m[1] || '') })],
  [/./, new RegExp(`\\bicon: '${NAME}'`, 'g'), m => ({ name: m[1] })],
  [/vitals\.js$/, new RegExp(`\\brow\\('${NAME}',`, 'g'), m => ({ name: m[1] })],
  [/onboard\.js$/, new RegExp(`\\btoggle\\('\\w+', '[^']*', '${NAME}'\\)`, 'g'), m => ({ name: m[1] })],
  [/onboard\.js$/, /const STEPS = (\[.*\]);/g, m => JSON.parse(m[1].replace(/'/g, '"')).map(s => ({ name: s[2] }))],
  [/ba\.js$/, /const ICON = \{([^}]*)\}/g, m => [...m[1].matchAll(/: '([a-z][a-z0-9_]*)'/g)].map(x => ({ name: x[1] }))],
];

const used = () => {
  const out = [];
  for (const f of SOURCES) {
    const src = read(f);
    for (const [where, re, get] of PATTERNS) if (where.test(f)) for (const m of src.matchAll(re)) for (const u of [get(m)].flat()) out.push({ ...u, file: f });
  }
  return out;
};

const tests = {
  'the subset list is the one the font was cut from'() {
    assert.ok(SUBSET.size > 50, `only ${SUBSET.size} names in icon-names.txt`);
    for (const n of ['settings', 'support', 'arrow_back', 'insights']) assert.ok(SUBSET.has(n), n);
  },

  'the patterns find the icons the app uses'() {
    const names = new Set(used().map(u => u.name));
    // one from each kind of source: index.html, a Settings row, a signals row, an onboarding toggle, a step row, the BA map
    for (const n of ['support', 'ios_share', 'vital_signs', 'edit_note', 'directions_walk', 'task_alt']) assert.ok(names.has(n), `${n} not found`);
    assert.ok(names.size >= 40, `only ${names.size} names found`);
  },

  'every icon name used in the UI is in the bundled subset'() {
    const missing = used().filter(u => !SUBSET.has(u.name)).map(u => `${u.name} (${u.file})`);
    assert.deepStrictEqual([...new Set(missing)], [], 'not in demo/fonts/icon-names.txt, so it would show as text');
  },

  'filled icons have their filled glyph in the subset'() {
    const missing = used().filter(u => u.fill && !SUBSET.has(u.name + '.fill')).map(u => `${u.name}.fill (${u.file})`);
    assert.deepStrictEqual([...new Set(missing)], []);
  },

  'Export to your clinic: the clinic dashboard row has a real icon'() {
    const row = read('js/gui/shell.js').match(/\{ icon: '(\w+)', label: 'Clinic dashboard'/);
    assert.ok(row, 'Clinic dashboard row');
    assert.ok(SUBSET.has(row[1]), row[1]);
  },
};

let failed = 0;
for (const [name, fn] of Object.entries(tests)) {
  try { fn(); console.log('ok  ', name); } catch (e) { failed++; console.log('FAIL', name, '\n     ', e.message.slice(0, 900)); }
}
console.log(`${Object.keys(tests).length - failed} ok, ${failed} failed`);
process.exit(failed ? 1 : 0);
