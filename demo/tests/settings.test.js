// Run: node demo/tests/settings.test.js
// Settings for a patient: simulated sensors are off on a phone (on in the browser demo), the Developer section is hidden
// unless asked for, and the export row says what is shared instead of offering a control with one option.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { JS } = require('./harness');

const read = f => fs.readFileSync(path.join(JS, f), 'utf8');

// The two lines of main.js that pick the default, run on their own with a given platform and saved settings.
const simulatorDefault = (nativeApp, saved) => {
  const main = read('main.js');
  const lines = main.split('\n').filter(l => /^\s+const (native|simDefault) = /.test(l));
  assert.strictEqual(lines.length, 2, 'main.js: the native and simDefault lines');
  const ctx = { window: { Capacitor: nativeApp == null ? undefined : { isNativePlatform: () => nativeApp } }, saved };
  return vm.runInNewContext(lines.join('\n') + '\nsimDefault;', ctx);
};

const tests = {
  'a: simulated sensors default to off on a phone and on in the browser demo'() {
    assert.strictEqual(simulatorDefault(true, {}), false, 'phone, first launch');
    assert.strictEqual(simulatorDefault(null, {}), true, 'browser, first launch');
    assert.strictEqual(simulatorDefault(false, {}), true, 'Capacitor present but not native (the web build)');
  },

  'b: on a phone, an "on" saved by the old default does not count; one chosen in Developer settings does'() {
    assert.strictEqual(simulatorDefault(true, { simulator: true }), false, 'saved before the change, never chosen');
    assert.strictEqual(simulatorDefault(true, { simulator: true, simulatorChosen: true }), true, 'turned on in Developer settings');
    assert.strictEqual(simulatorDefault(true, { simulator: false, simulatorChosen: true }), false);
    assert.strictEqual(simulatorDefault(null, { simulator: false }), false, 'the browser keeps a saved choice');
  },

  'c: the switch records the choice and the choice is saved'() {
    const main = read('main.js');
    assert.ok(/\$\('simSw'\)\.onchange = e => \{ A\.config\.simulator = e\.target\.checked; A\.config\.simulatorChosen = true;/.test(main), 'simSw marks the choice');
    assert.ok(/store\.set\('afferent\.settings', \{[^}]*simulatorChosen: A\.config\.simulatorChosen/.test(main), 'saveSettings keeps it');
    assert.ok(/simulator: simDefault,/.test(main) && /simulatorChosen: !!saved\.simulatorChosen,/.test(main));
    // the sensors still start from the simulator flag of A.config (syncSensors), so the "simulated" labels follow it
    assert.ok(main.includes('simulator: A.config.simulator });'), 'syncSensors passes the flag on');
  },

  'd: the Developer section is hidden unless ?dev is set or it was turned on from the version line'() {
    const shell = read('gui/shell.js');
    assert.ok(/const dev = q\.has\('dev'\);/.test(shell));
    assert.ok(/let devShown = dev \|\| /.test(shell) && shell.includes("localStorage.getItem(DEV_KEY) === '1'"), 'shown with ?dev or the saved unlock');
    assert.ok(shell.includes("${devShown ? '' : ' hidden'}"), 'the group gets the hidden attribute otherwise');
    assert.ok(/if \(taps >= 7\) \{ taps = 0; showDev\(!devShown\); \}/.test(shell), '7 taps on the version line');
    assert.ok(/hold = setTimeout\(\(\) => \{[^}]*showDev\(!devShown\); \}, 800\)/.test(shell), 'or a long press');
    assert.ok(shell.includes('class="app-version t-body-s muted" id="appVersion"'), 'the version line is in Settings');
  },

  'e: Export to your clinic says what is shared, with no one-option control'() {
    const shell = read('gui/shell.js'), main = read('main.js');
    const group = shell.slice(shell.indexOf("title: 'Export to your clinic'"), shell.indexOf("title: 'Check-in'"));
    assert.ok(!/role="radiogroup"|sharingSeg|class="seg/.test(group), 'no segmented control');
    assert.ok(/label: 'What is in an export', sup: 'A summary: [^']+', supId: 'sharingState', static: true/.test(group));
    assert.ok(!main.includes('sharingSeg'), 'main.js no longer drives the old control');
    assert.ok(/\$\('sharingState'\)\.textContent = /.test(main));
  },
};

let failed = 0;
for (const [name, fn] of Object.entries(tests)) {
  try { fn(); console.log('ok  ', name); } catch (e) { failed++; console.log('FAIL', name, '\n     ', e.message.slice(0, 900)); }
}
console.log(`${Object.keys(tests).length - failed} ok, ${failed} failed`);
process.exit(failed ? 1 : 0);
