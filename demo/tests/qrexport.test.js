// Run: node demo/tests/qrexport.test.js
// The dashboard export on the Share tab (demo/js/qrexport.js) reaches the hub the phone is paired with: the address saved
// in Settings, Home hub (main.js stores it as a plain string under afferent.hub) or ?hub=, with its /k/<key> part kept
// on API calls, since the home hub turns away /api requests without it. The screen shows only the bare address (#82).
// The addresses and keys here are test inputs.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'js', 'qrexport.js'), 'utf8');
const UTIL = fs.readFileSync(path.join(__dirname, '..', 'js', 'util.js'), 'utf8');
const flush = async () => { for (let i = 0; i < 20; i++) await new Promise(r => setImmediate(r)); };

const node = () => ({
  textContent: '', hidden: false, disabled: false, href: '', download: '', style: {}, parentElement: { clientWidth: 260 },
  classList: { toggle() {} }, getContext: () => ({ fillRect() {} }),
});

async function load({ search = '', saved = null } = {}) {
  const nodes = {}, urls = [];
  const storage = new Map(saved == null ? [] : [['afferent.hub', saved]]);
  const ctx = {
    console, Math, Date, JSON, Object, Array, Number, String, Promise, Error, URL, URLSearchParams, setTimeout, clearTimeout,
    AbortController, Blob: class { constructor(p) { this.p = p; } }, File: class {},
    location: { search, protocol: 'capacitor:', origin: 'capacitor://localhost', hash: '' },
    localStorage: { getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, String(v)) },
    document: { readyState: 'complete', getElementById: id => (nodes[id] ||= node()) },
    navigator: {}, addEventListener() {},
    fetch: async (url, o) => { urls.push(url); return { ok: false, status: 401, json: async () => ({}) }; },
  };
  ctx.window = ctx;
  ctx.URL.createObjectURL = () => 'blob:x';
  vm.createContext(ctx);
  vm.runInContext(UTIL, ctx, { filename: 'util.js' });
  ctx.A.DashGen = { render: () => '<html></html>' };
  vm.runInContext(SRC, ctx, { filename: 'qrexport.js' });
  await flush();
  return { nodes, urls };
}

const tests = {
  async 'a: the hub saved in Settings (a plain string) is found, with its key'() {
    const p = await load({ saved: 'http://10.0.0.5:8000/k/test-key' });
    assert.strictEqual(p.nodes.qeHub.textContent, 'http://10.0.0.5:8000', 'the key is not shown');
    const hub = p.urls.filter(x => /\/api\//.test(x));
    assert.ok(hub.length, 'the export asks the hub');
    for (const u of hub) assert.ok(u.startsWith('http://10.0.0.5:8000/k/test-key/api/'), u);
  },
  async 'b: ?hub= with a ws address and a key keeps the key'() {
    const p = await load({ search: '?hub=' + encodeURIComponent('ws://10.0.0.5:8000/k/test-key/ws/app') });
    const hub = p.urls.filter(x => /\/api\//.test(x));
    assert.ok(hub.length, 'the export asks the hub');
    for (const u of hub) assert.ok(u.startsWith('http://10.0.0.5:8000/k/test-key/api/'), u);
  },
  async 'c: no hub at all: nothing is fetched from a hub'() {
    const p = await load();
    assert.ok(p.urls.every(u => !/\/api\//.test(u)), p.urls.join());
  },
  'd: one hub-address helper (A.hubApiBase in util.js) for the patient page and the export'() {
    const js = f => fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8');
    for (const f of ['patient.js', 'qrexport.js']) {
      assert.ok(js(f).includes('A.hubApiBase(q)'), f + ' uses the shared helper');
      assert.ok(!/new URL\(s\)|pathname\.match/.test(js(f)), f + ' has no address parsing of its own');
    }
    const ctx = { URL, URLSearchParams, location: { search: '', protocol: 'capacitor:', origin: 'capacitor://localhost' } };
    const saved = new Map();
    ctx.localStorage = { getItem: k => saved.get(k) ?? null };
    ctx.window = ctx;
    vm.createContext(ctx);
    vm.runInContext(UTIL, ctx, { filename: 'util.js' });
    const base = search => ctx.A.hubApiBase(new URLSearchParams(search));
    assert.strictEqual(base(''), null, 'no hub');
    saved.set('afferent.hub', 'http://10.0.0.5:8000/k/test-key');
    assert.strictEqual(base(''), 'http://10.0.0.5:8000/k/test-key', 'the saved one, key kept');
    assert.strictEqual(base('?ws=' + encodeURIComponent('wss://hub.example/k/k2/ws/app')), 'https://hub.example/k/k2');
    assert.strictEqual(base('?hub=http://10.0.0.9:8000/'), 'http://10.0.0.9:8000', '?hub= first');
    saved.clear();
    ctx.location.protocol = 'http:'; ctx.location.origin = 'http://10.0.0.5:8000';
    assert.strictEqual(base(''), 'http://10.0.0.5:8000', 'served by the hub: its own origin');
  },
};

(async () => {
  let failed = 0;
  for (const [name, fn] of Object.entries(tests)) {
    try { await fn(); console.log('ok  ', name); } catch (e) { failed++; console.log('FAIL', name, '\n     ', e.stack.split('\n').slice(0, 4).join('\n      ')); }
  }
  console.log(`${Object.keys(tests).length - failed} ok, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
