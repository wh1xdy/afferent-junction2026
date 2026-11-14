// Run: node demo/tests/hub.test.js
// The phone's link to the home hub (demo/js/hub.js). A talk request (type crisis: the talk button, the lowest lantern
// twice, the talk screen) becomes a flag for the clinic. Like a session it stays on the phone until the hub acks it (by
// its talk_id): made while the hub is out of reach, or sent on a link that drops before the ack, it goes again on the
// next link. The hub address and the messages here are test inputs.
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
    ack(talk_id) { this.onmessage?.({ data: JSON.stringify({ type: 'ack', talk_id, ok: true, error: null }) }); }
  }
  const ctx = {
    console, Math, Date, JSON, Object, Array, Number, String, URLSearchParams, WebSocket: WS, crypto: require('crypto').webcrypto,
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
  'a: a talk request while connected goes at once, and not again once the hub has acked it'() {
    const p = page();
    p.sockets[0].open();
    p.A.bus.emit('ws', { ...crisis });
    const [sent] = sentOf(p.sockets[0], 'crisis');
    assert.ok(sent && typeof sent.talk_id === 'string' && sent.talk_id, 'it carries a talk_id for the ack');
    p.sockets[0].ack(sent.talk_id);
    p.sockets[0].close(); p.retry(); p.sockets[1].open();
    assert.strictEqual(sentOf(p.sockets[1], 'crisis').length, 0, 'not sent again on the next link');
    assert.strictEqual(p.storage.get('afferent.outbox.talk'), '[]');
  },

  'a2: sent, but the link dropped before the hub acked: it goes again, with the same talk_id'() {
    const p = page();
    p.sockets[0].open();
    p.A.bus.emit('ws', { ...crisis });
    const [first] = sentOf(p.sockets[0], 'crisis');
    p.sockets[0].close(); p.retry(); p.sockets[1].open();
    const again = sentOf(p.sockets[1], 'crisis');
    assert.deepStrictEqual(again.map(m => m.talk_id), [first.talk_id], 'the hub can tell it is the same request');
    p.sockets[1].ack('another-id');
    p.sockets[1].close(); p.retry(); p.sockets[2].open();
    assert.strictEqual(sentOf(p.sockets[2], 'crisis').length, 1, 'an ack for another request does not clear it');
    p.sockets[2].ack(first.talk_id);
    p.sockets[2].close(); p.retry(); p.sockets[3].open();
    assert.strictEqual(sentOf(p.sockets[3], 'crisis').length, 0);
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
    p.sockets[0].ack(got[0].talk_id);
    p.sockets[0].close(); p.retry(); p.sockets[1].open();
    assert.strictEqual(sentOf(p.sockets[1], 'crisis').length, 0, 'sent until acked, then not again');
  },

  'd: a request queued by an earlier build without a talk_id gets one and goes'() {
    const storage = new Map([['afferent.outbox.talk', JSON.stringify([{ ...crisis, source: 'old' }, null, 'junk'])]]);
    const p = page(storage);
    p.sockets[0].open();
    const got = sentOf(p.sockets[0], 'crisis');
    assert.deepStrictEqual(got.map(m => m.source), ['old']);
    assert.ok(got[0].talk_id);
    p.sockets[0].close(); p.retry(); p.sockets[1].open();
    assert.deepStrictEqual(sentOf(p.sockets[1], 'crisis').map(m => m.talk_id), [got[0].talk_id], 'the id it got is kept');
  },
};

let failed = 0;
for (const [name, fn] of Object.entries(tests)) {
  try { fn(); console.log('ok  ', name); } catch (e) { failed++; console.log('FAIL', name, '\n     ', e.stack.split('\n').slice(0, 4).join('\n      ')); }
}
console.log(`${Object.keys(tests).length - failed} ok, ${failed} failed`);
process.exit(failed ? 1 : 0);
