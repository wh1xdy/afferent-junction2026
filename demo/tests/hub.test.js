// Run: node demo/tests/hub.test.js
// The phone's link to the home hub (demo/js/hub.js). A talk request (type crisis: the talk button, the lowest lantern
// twice, the talk screen) becomes a flag for the clinic; made while the hub is out of reach it waits on the phone and goes
// as soon as the link is back, like a session does. The hub address and the messages here are test inputs.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { JS } = require('./harness');

const page = (storage = new Map()) => {
  const sockets = [], timers = [];
  class WS {
    constructor(url) { this.url = url; this.readyState = 0; this.sent = []; sockets.push(this); }
    send(s) { this.sent.push(JSON.parse(s)); }
    open() { this.readyState = 1; this.onopen?.(); }
    close() { this.readyState = 3; this.onclose?.(); }
  }
  const ctx = {
    console, Math, Date, JSON, Object, Array, Number, String, URLSearchParams, WebSocket: WS,
    location: { search: '?hub=' + encodeURIComponent('http://10.0.0.5:8000/k/test-key'), protocol: 'file:', pathname: '/' },
    localStorage: { getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, String(v)), removeItem: k => storage.delete(k) },
    setTimeout: f => { timers.push(f); return timers.length; }, clearTimeout() {},
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(JS, 'util.js'), 'utf8'), ctx, { filename: 'util.js' });
  vm.runInContext(`A.config = { patientId: 'test', deviceId: 'test', appVersion: 'test' };`, ctx);
  vm.runInContext(fs.readFileSync(path.join(JS, 'hub.js'), 'utf8'), ctx, { filename: 'hub.js' });
  const { A } = ctx;
  A.Hub.connect({ patientId: 'test' });
  const retry = () => { const t = timers.splice(0); t.forEach(f => f()); };
  return { A, sockets, retry, storage };
};
const crisis = { type: 'crisis', patient_id: 'test', source: 'talk_button', t_iso: '2026-01-01T07:00:00+02:00' };
const sentOf = (ws, type) => ws.sent.filter(m => m.type === type);

const tests = {
  'a: a talk request while connected goes at once, once'() {
    const p = page();
    p.sockets[0].open();
    p.A.bus.emit('ws', { ...crisis });
    assert.strictEqual(sentOf(p.sockets[0], 'crisis').length, 1);
    p.sockets[0].close(); p.retry(); p.sockets[1].open();
    assert.strictEqual(sentOf(p.sockets[1], 'crisis').length, 0, 'not sent again on the next link');
  },

  'b: a talk request before the link is up goes when it opens'() {
    const p = page();
    p.A.bus.emit('ws', { ...crisis });
    p.sockets[0].open();
    assert.deepStrictEqual(sentOf(p.sockets[0], 'crisis').map(m => m.source), ['talk_button']);
  },

  'c: a talk request while the hub is out of reach waits, also over an app restart, and goes when the hub is back'() {
    const storage = new Map();
    let p = page(storage);
    p.sockets[0].open(); p.sockets[0].close();
    p.A.bus.emit('ws', { ...crisis, source: 'mood' });
    p = page(storage); // the app is closed and opened again
    p.sockets[0].open();
    const got = sentOf(p.sockets[0], 'crisis');
    assert.deepStrictEqual(got.map(m => [m.source, m.t_iso]), [['mood', crisis.t_iso]], 'the original time is kept');
    p.sockets[0].close(); p.retry(); p.sockets[1].open();
    assert.strictEqual(sentOf(p.sockets[1], 'crisis').length, 0, 'sent once');
  },
};

let failed = 0;
for (const [name, fn] of Object.entries(tests)) {
  try { fn(); console.log('ok  ', name); } catch (e) { failed++; console.log('FAIL', name, '\n     ', e.stack.split('\n').slice(0, 4).join('\n      ')); }
}
console.log(`${Object.keys(tests).length - failed} ok, ${failed} failed`);
process.exit(failed ? 1 : 0);
