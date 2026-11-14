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


// Settings as gui/shell.js builds it, on the fake DOM (fakedom.js) with its HTML parsed: the #settings page of index.html,
// then shell.js and swipe.js. Reduced motion, so a page leaves in one timer. The clock and the timers are manual.
const { makeDocument, El } = require('./fakedom');
const parseInto = (doc, parent, src) => {
  const stack = [parent], VOID = new Set(['INPUT', 'BR', 'IMG', 'HR']);
  for (const m of src.matchAll(/<!--[\s\S]*?-->|<\/([\w-]+)\s*>|<([\w-]+)((?:\s+[\w:-]+(?:="[^"]*")?)*)\s*\/?>|([^<]+)/g)) {
    if (m[1]) { while (stack.length > 1 && stack.pop().tagName !== m[1].toUpperCase()); continue; }
    if (m[2]) {
      const e = doc.createElement(m[2]);
      for (const a of m[3].matchAll(/([\w:-]+)(?:="([^"]*)")?/g)) e.setAttribute(a[1], a[2] ?? '');
      stack[stack.length - 1].append(e);
      if (!VOID.has(e.tagName)) stack.push(e);
    } else if (m[4]?.trim()) stack[stack.length - 1].append(m[4].trim());
  }
  return parent;
};
const settingsPage = () => {
  const doc = makeDocument(), timers = [];
  Object.defineProperty(El.prototype, 'content', { configurable: true, get() { return parseInto(doc, doc.createDocumentFragment(), this.html); } });
  Object.assign(El.prototype, {
    focus() { doc.activeElement = this; },
    contains(n) { for (; n; n = n.parentNode) if (n === this) return true; return false; },
    removeEventListener() {},
    getBoundingClientRect() { return { left: 0, top: 0, width: 390, height: 844 }; },
  });
  Object.defineProperty(El.prototype, 'isConnected', { configurable: true, get() { let n = this; while (n.parentNode) n = n.parentNode; return n === doc.documentElement; } });
  const html = fs.readFileSync(path.join(JS, '..', 'index.html'), 'utf8');
  const at = html.indexOf('<div id="settings"'), end = html.indexOf('<div id="voice"');
  doc.body.replaceChildren(parseInto(doc, doc.createElement('section'), html.slice(at, end)));
  doc.body.children[0].id = 'phone';
  doc.documentElement.dataset.motion = 'reduced';
  // a click goes up through the parents to the document, as in a browser
  doc.listeners.click = [];
  El.prototype.click = function () {
    const e = { type: 'click', target: this, preventDefault() {}, stopPropagation() {} };
    for (let n = this; n; n = n.parentNode) n.dispatchEvent(e);
    for (const f of doc.listeners.click) f(e);
  };
  const ctx = { console, URLSearchParams, location: { search: '' }, navigator: {}, document: doc, performance: { now: () => 0 }, matchMedia: () => ({ matches: false }),
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} }, addEventListener() {}, requestAnimationFrame: () => 0, cancelAnimationFrame() {},
    setTimeout: f => { timers.push(f); return timers.length; }, clearTimeout: id => { timers[id - 1] = null; }, setInterval: () => 0 };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(read('util.js'), ctx, { filename: 'util.js' });
  ctx.A.Theme = { scheme: 'kaamos', local: () => 'kaamos' };
  for (const f of ['gui/lantern.js', 'gui/shell.js', 'gui/swipe.js']) vm.runInContext(read(f), ctx, { filename: f });
  const $ = id => doc.getElementById(id);
  // a switch changed by hand: its own handler, then the change goes up to Settings
  const change = el => { for (let n = el; n; n = n.parentNode) n.dispatchEvent({ type: 'change', target: el }); };
  return { doc, $, A: ctx.A, change, runTimers: () => { for (const f of timers.splice(0)) f?.(); } };
};
const shown = el => !!el && !el.classList.contains('hidden');

// Every control Settings had before it was split into pages, by how main.js, clipcheck.js, duel.js, onboard.js and
// presence.js find it.
const CONTROLS = ['id="soundSw"', 'id="hapticSw"', 'id="beatSeg"', 'id="quietSw"', 'id="motionSw"',
  'data-sensor="phone_camera"', 'data-sensor="pulse_stone"', 'id="fingerState"', 'id="breathSw"', 'data-sensor="bedside_light"', 'data-sensor="bedside_camera"', 'data-sensor="phone_motion"',
  'id="vitalsSw"', 'id="clipCheckRow"', 'id="clipState"', 'id="clipAskSw"', 'data-duel', 'id="morningsGroup"', 'id="checkinSw"',
  'id="qrBtn"', 'id="exportBtn"', 'id="sharingState"', 'id="hubForm"', 'id="hubAddr"', 'id="hubState"',
  'data-open="info"', 'data-open="signals"', 'data-anchor', 'id="weekBtn"', 'id="devGroup"', 'id="simSw"', 'id="sigSw"',
  'data-dev="input"', 'data-dev="clock"', 'data-dev="stage"', 'data-dev="profile"', 'id="appVersion"', 'id="sensorsGroup"'];
const count = (html, attr) => html.split(attr).length - 1;

// main.js's hub state, cut out of main.js as it is, on a page with only the address field.
const hubStatus = ({ typed = '', saved = '', url = null, connected = false, retry = 0 } = {}) => {
  const main = read('main.js');
  const norm = main.match(/\n  const normHub = [\s\S]*?\n  \};\n/)[0], status = main.match(/\n  const hubHasKey = [\s\S]*?\n  \};\n/)[0];
  const A = { Hub: { url, connected, retry, httpBase() { return url ? url.replace(/^ws/, 'http').replace(/\/ws\/app$/, '') : null; } } };
  return [...vm.runInNewContext(`${norm}\nconst savedHub = ${JSON.stringify(saved)};${status}\nhubStatus();`, { A, $: () => ({ value: typed }) })];
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
    const group = shell.slice(shell.indexOf("title: 'Export to your clinic'"), shell.indexOf("page: 'hub'"));
    assert.ok(!/role="radiogroup"|sharingSeg|class="seg/.test(group), 'no segmented control');
    assert.ok(/label: 'What is in an export', sup: 'A summary: [^']+', supId: 'sharingState', static: true/.test(group));
    assert.ok(!main.includes('sharingSeg'), 'main.js no longer drives the old control');
    assert.ok(/\$\('sharingState'\)\.textContent = /.test(main));
  },

  'f: Settings opens on a short list of categories, and every control it had is on exactly one of their pages'() {
    const vmCtx = { console, URLSearchParams, setTimeout: () => 0, clearTimeout: () => {}, location: { search: '' }, navigator: {},
      document: { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], addEventListener: () => {} } };
    vmCtx.window = vmCtx;
    vm.createContext(vmCtx);
    for (const f of ['util.js', 'gui/lantern.js', 'gui/shell.js']) vm.runInContext(read(f), vmCtx, { filename: f });
    const S = vmCtx.A.Shell.settings, { top, pages } = S.html();
    assert.ok(S.pages.length >= 5 && S.pages.length <= 7, `${S.pages.length} categories`);
    assert.strictEqual(count(top, 'class="li state two set-cat"'), S.pages.length, 'one row per category');
    for (const p of S.pages) assert.ok(top.includes(`data-page="${p.id}"`) && top.includes(`id="setSum-${p.id}"`), `${p.id}: a row with its own line`);
    // each page: from its section to the next page's
    const each = {}, starts = S.pages.map(p => [p.id, pages.indexOf(`<section id="setPage-${p.id}"`)]);
    starts.forEach(([id, i], k) => { each[id] = pages.slice(i, k + 1 < starts.length ? starts[k + 1][1] : pages.length); });
    for (const c of CONTROLS) {
      const on = Object.entries(each).filter(([, h]) => h.includes(c)).map(([id]) => id);
      assert.strictEqual(on.length, 1, `${c}: on ${on.length} pages (${on.join(', ')})`);
      assert.strictEqual(count(pages, c), 1, `${c}: once`);
      assert.strictEqual(count(top, c), 0, `${c}: not on the list itself`);
    }
    assert.ok(each.about.includes('id="devGroup"') && each.about.includes('id="appVersion"'), 'Developer and the version line are in Help and about');
    for (const p of S.pages) assert.ok(each[p.id].includes('data-page-back') && each[p.id].includes(`>${p.title}</h2>`), `${p.id}: a back arrow and its title`);
  },

  'g: the line under each category follows its switches as they change'() {
    const p = settingsPage(), { $, A } = p;
    $('soundSw').checked = true; $('hapticSw').checked = true;
    const level = v => $('beatSeg').querySelectorAll('button').forEach(b => b.setAttribute('aria-checked', String(b.dataset.v === v)));
    level('soft');
    A.Shell.settings.refresh();
    assert.strictEqual($('setSum-sound').textContent, 'Sound on · Heartbeat: Soft');
    level('strong'); A.Shell.settings.refresh();
    assert.strictEqual($('setSum-sound').textContent, 'Sound on · Heartbeat: Strong', 'the Heartbeat touch level');
    level('off'); A.Shell.settings.refresh();
    assert.strictEqual($('setSum-sound').textContent, 'Sound on · Heartbeat: Off');
    $('hapticSw').checked = false; p.change($('hapticSw'));
    assert.strictEqual($('setSum-sound').textContent, 'Sound on · Vibration off', 'a change inside Settings redraws the lines');
    assert.deepStrictEqual($('beatSeg').querySelectorAll('button').map(b => [b.dataset.v, b.getAttribute('role')]),
      [['off', 'radio'], ['soft', 'radio'], ['medium', 'radio'], ['strong', 'radio']], 'Off · Soft · Medium · Strong');
    assert.strictEqual($('beatSeg').getAttribute('role'), 'radiogroup');
    const stone = p.doc.querySelector('#setPage-sensors [data-sensor="pulse_stone"]');
    stone.checked = true; A.Sensors = { fingerLink: { state: 'scanning' } }; p.change(stone);
    assert.strictEqual($('setSum-sensors').textContent, 'Finger clips not connected');
    A.Sensors.fingerLink.state = 'connected'; A.Shell.settings.refresh();
    assert.strictEqual($('setSum-sensors').textContent, 'Finger clips connected');
    stone.checked = false; p.change(stone);
    assert.strictEqual($('setSum-sensors').textContent, 'Finger clips off');
    $('hubState').textContent = 'Key missing'; A.Shell.settings.refresh();
    assert.strictEqual($('setSum-hub').textContent, 'Key missing', 'Home hub says what its page says');
    // a hook (main.js's hub line) runs before the lines are read
    A.Shell.settings.hook(() => { $('hubState').textContent = 'Connected'; });
    A.Shell.settings.refresh();
    assert.strictEqual($('setSum-hub').textContent, 'Connected');
  },

  'h: a category slides its page in; the back arrow and Escape go back to the list, and Settings opens on the list again'() {
    const p = settingsPage(), { $, doc } = p, row = doc.querySelector('.set-cat[data-page="sound"]');
    $('settings').classList.remove('hidden');
    row.focus();
    row.click();
    assert.ok(shown($('setPage-sound')), 'the page is open');
    assert.ok(!$('setPage-sound').classList.contains('instant'), 'and slides in (pageIn)');
    assert.strictEqual(doc.activeElement, $('setTitle-sound'), 'focus on its title');
    $('setPage-sound').querySelector('[data-page-back]').click();
    assert.ok(shown($('setPage-sound')) && p.A.Swipe.leaving($('setPage-sound')), 'leaving, not gone at once');
    p.runTimers();
    assert.ok(!shown($('setPage-sound')), 'gone after its slide');
    assert.strictEqual(doc.activeElement, row, 'focus back on the category');
    assert.ok(shown($('settings')), 'Settings itself stays open');
    // Escape: the page first, then Settings
    doc.querySelector('.set-cat[data-page="hub"]').click();
    const esc = { key: 'Escape', preventDefault() {} };
    let closed = 0;
    $('settings').querySelector('[data-close="settings"]').onclick = () => { closed++; };
    for (const f of doc.listeners.keydown) f(esc);
    p.runTimers();
    assert.ok(!shown($('setPage-hub')) && closed === 0, 'Escape closed the page, not Settings');
    for (const f of doc.listeners.keydown) f(esc);
    assert.strictEqual(closed, 1, 'then Settings');
    // opened again with a page left open: back on the list; a button can name a page to open on
    doc.querySelector('.set-cat[data-page="clinic"]').click();
    const open = doc.createElement('button'); open.setAttribute('data-open', 'settings');
    $('phone').append(open);
    open.click();
    assert.ok(!shown($('setPage-clinic')), 'opens on the list');
    open.setAttribute('data-settings-page', 'sensors');
    open.click();
    assert.ok(shown($('setPage-sensors')) && $('setPage-sensors').classList.contains('instant'), 'the camera badge opens straight on Sensors');
  },

  'i: Home hub: "Key missing" for an address without /k/<code>, and the other states'() {
    assert.deepStrictEqual(hubStatus(), ['none', 'Not set']);
    assert.deepStrictEqual(hubStatus({ typed: '192.168.50.20:8000' }), ['warn', 'Key missing']);
    assert.deepStrictEqual(hubStatus({ typed: '192.168.50.20:8000/k/' }), ['warn', 'Key missing'], 'a key needs its code');
    const full = 'http://192.168.50.20:8000/k/abcdefghijklmnopqrstuvwxyz0123456789ABCDE';
    assert.deepStrictEqual(hubStatus({ typed: full }), ['none', 'Not connected yet. Tap Connect'], 'pasted, not saved yet');
    const url = 'ws://192.168.50.20:8000/k/abcdefghijklmnopqrstuvwxyz0123456789ABCDE/ws/app';
    assert.deepStrictEqual(hubStatus({ typed: full, saved: full, url }), ['none', 'Connecting…']);
    assert.deepStrictEqual(hubStatus({ typed: full, saved: full, url, retry: 1 }), ['warn', "Can't reach the hub"]);
    assert.deepStrictEqual(hubStatus({ typed: full, saved: full, url, connected: true }), ['on', 'Connected']);
    assert.deepStrictEqual(hubStatus({ typed: '', url: 'ws://10.0.0.5:8000/ws/app' }), ['warn', 'Key missing'], 'a hub from ?hub= without a key');
    // the field, its Paste button and the state line are on the Home hub page, under the address
    const p = settingsPage(), page = p.$('setPage-hub');
    for (const id of ['hubForm', 'hubAddr', 'hubPaste', 'hubState']) assert.ok(page.contains(p.$(id)), id);
    const main = read('main.js');
    assert.ok(/navigator\.clipboard\.readText\(\)/.test(main) && /\$\('hubPaste'\)\.onclick = /.test(main), 'Paste reads the clipboard (iOS shows its Paste bubble)');
    assert.ok(!read('../index.html').includes('hubDialog') && !main.includes('hubDialog'), 'the old hub dialog is gone');
  },
};

let failed = 0;
for (const [name, fn] of Object.entries(tests)) {
  try { fn(); console.log('ok  ', name); } catch (e) { failed++; console.log('FAIL', name, '\n     ', e.message.slice(0, 900)); }
}
console.log(`${Object.keys(tests).length - failed} ok, ${failed} failed`);
process.exit(failed ? 1 : 0);
