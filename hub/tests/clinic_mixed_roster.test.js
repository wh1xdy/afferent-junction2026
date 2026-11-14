// Run: node hub/tests/clinic_mixed_roster.test.js
// The patient list on a hub that holds a real patient next to the generated demo roster (the home hub, afferent_hub/home.py):
// "All patients on this hub are simulated" may only be said when it is true, and each generated row then carries its own badge.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const ROOT = path.join(__dirname, '..', '..');
const WEB = path.join(ROOT, 'hub', 'afferent_hub', 'web', 'clinic');
const read = (dir, f) => fs.readFileSync(path.join(dir, f), 'utf8');
const list = () => JSON.parse(read(path.join(ROOT, 'contracts', 'fixtures'), 'patients_list.json'));
const count = (s, sub) => s.split(sub).length - 1;
const BADGE = '<span class="sim-badge small">Simulated</span>';

const ctx = { Math, JSON, Number, String, Array, Object, Date, console };
ctx.window = ctx;
ctx.document = { documentElement: {}, getElementById: () => null };
ctx.getComputedStyle = () => ({ getPropertyValue: () => '#123456' });
vm.createContext(ctx);
for (const f of ['charts.js', 'signals.js', 'views.js']) vm.runInContext(read(WEB, f), ctx);
const V = ctx.C.views;
const state = (L) => ({ fixtures: false, list: L, analytics: {}, detail: {}, live: {}, missing: {}, bedside: null, bedsideAt: null, ui: { feature: null } });

// the laptop hub: every patient is generated, one statement for the whole list, no badge per row
const all = list();
assert.ok(all.simulated && all.patients.length > 1 && all.patients.every((p) => p.simulated));
assert.strictEqual(V.allSim(all), true);
let html = V.list(state(all), null);
assert.ok(html.includes('All patients on this hub are simulated.'));
assert.strictEqual(count(html, 'sim-badge'), 0);

// the home hub: one real patient, the rest generated
const mixed = list();
mixed.patients[0].simulated = false;
assert.strictEqual(V.allSim(mixed), false);
html = V.list(state(mixed), null);
assert.ok(!html.includes('All patients on this hub are simulated.'));
assert.ok(html.includes('Patients marked Simulated are generated demo data.'));
assert.strictEqual(count(html, BADGE), mixed.patients.length - 1, 'one badge per generated row');
const realRow = html.split('<a class="prow"').find((r) => r.includes(`data-id="${mixed.patients[0].id}"`));
assert.ok(realRow && !realRow.includes('sim-badge'), 'the real patient carries no badge');

// only real patients: nothing is said and nothing is marked
const real = list();
real.simulated = false;
real.patients.forEach((p) => { p.simulated = false; });
assert.strictEqual(V.allSim(real), false);
html = V.list(state(real), null);
assert.ok(!html.includes('simulated') && !html.includes('sim-badge'));
assert.strictEqual(V.allSim(null), false);

// the top-bar badge follows the same rule
assert.ok(read(WEB, 'clinic.js').includes("$('#global-sim').hidden = !V.allSim(S.list);"));

console.log('clinic mixed roster: ok');
