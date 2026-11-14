// Run: node demo/tests/handover.test.js
// "Show to my doctor" hands over a link (demo/js/handover.js): the dashboard is locked on the phone and only the
// locked bytes go to the relay; the key travels in the link's fragment and is never sent. Then the viewer
// (voice-relay/viewer.html) unlocks it in the doctor's browser. Fallbacks: relay, then the paired hub, then a file.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const ROOT = path.join(__dirname, '..', '..');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'js', 'handover.js'), 'utf8');
const VIEWER = fs.readFileSync(path.join(ROOT, 'voice-relay', 'viewer.html'), 'utf8');
const RELAY = 'https://afferent-voice-test.a.run.app';
const HUB = 'http://192.168.1.20:8000/k/pairing-token-123';
const MARK = 'PATIENT-DASHBOARD-MARKER-7f3a';
const HTML = `<!doctype html><html><body><main id="app"><h1>Afferent summary</h1><p>${MARK}</p></main></body></html>`;
const ID = 'AbCdEfGhIjKlMnOpQrStUv';

const results = [];
const test = async (name, fn) => {
  try { await fn(); results.push(['ok', name]); } catch (e) { results.push(['FAIL', name, e]); }
};

const bytesOf = b => (b instanceof Uint8Array ? b : typeof b === 'string' ? new TextEncoder().encode(b) : new Uint8Array(0));
const latin1 = b => Buffer.from(bytesOf(b)).toString('latin1');
const has = (hay, needle) => latin1(hay).includes(needle);

// A fetch that answers per URL and keeps every request as the network would see it.
function network(routes) {
  const sent = [];
  const fetch = async (url, opts = {}) => {
    const req = { url: String(url), method: opts.method || 'GET', headers: { ...(opts.headers || {}) }, body: opts.body, credentials: opts.credentials };
    sent.push(req);
    for (const [match, answer] of routes) {
      if (match.test(req.url) && (!answer.method || answer.method === req.method)) {
        if (answer.throws) throw Object.assign(new Error(answer.throws), { name: answer.throws });
        const status = answer.status ?? 200;
        const reply = typeof answer.reply === 'function' ? answer.reply(req) : answer.reply;
        return { ok: status >= 200 && status < 300, status, json: async () => reply, headers: { get: () => null } };
      }
    }
    throw new TypeError('Failed to fetch');
  };
  return { fetch, sent };
}

function load({ relay = { url: RELAY, code: 'relay-code' }, typed = null, routes = [], crypto = globalThis.crypto } = {}) {
  const net = network(routes);
  const storage = new Map(typed ? [['afferent.voice.relay', JSON.stringify(typed)]] : []);
  const ctx = {
    console, Math, Date, JSON, Object, Array, Number, String, Promise, Error, TypeError, URL, Uint8Array,
    TextEncoder, TextDecoder, btoa, atob, AbortController, setTimeout, clearTimeout, crypto,
    localStorage: { getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v) },
    AFFERENT_VOICE: relay, fetch: net.fetch,
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx, { filename: 'handover.js' });
  return { H: ctx.A.Handover, sent: net.sent };
}

const relayOk = { method: 'POST', status: 201, reply: { id: ID, expires: '2026-11-21T20:00:00Z', revoke: 'revoke-token-xyz' } };
const hubOk = { method: 'POST', reply: { ok: true, url: '/api/export/dashboard', share_url: '/shared/HubShareId1234567890ab', expires_iso: '2026-11-21T22:00:00+02:00' } };

// The viewer's own script, run on a page at /d/<id>#<key> with the given /blob answer.
async function view({ pathname = `/d/${ID}`, hash, blob, status = 200, expires = '2026-11-21T20:00:00Z', subtle = true }) {
  const script = VIEWER.match(/<script>([\s\S]*?)<\/script>/)[1];
  const made = [];
  const el = tag => {
    const n = { tag, attrs: {}, children: [], textContent: '', className: '', setAttribute(k, v) { this.attrs[k] = v; }, append(...k) { this.children.push(...k); }, replaceChildren(...k) { this.children = k; } };
    made.push(n);
    return n;
  };
  const main = el('main'), until = el('span');
  const asked = [];
  const ctx = {
    TextEncoder, TextDecoder, atob, Uint8Array, JSON, Date, Error, isNaN,
    crypto: subtle ? globalThis.crypto : {},
    location: { pathname, hash, reload() {} },
    document: { createElement: el, getElementById: id => (id === 'main' ? main : id === 'until' ? until : null), title: '' },
    fetch: async (url, opts) => {
      asked.push({ url, opts });
      return { ok: status === 200, status, arrayBuffer: async () => blob.buffer.slice(blob.byteOffset, blob.byteOffset + blob.byteLength), headers: { get: k => (k === 'X-Expires' ? expires : null) } };
    },
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(script, ctx, { filename: 'viewer.html' });
  for (let i = 0; i < 50; i++) await new Promise(r => setImmediate(r));
  const shown = main.children[0] || {};
  const text = n => [n.textContent, ...(n.children || []).map(text)].join(' ').trim();
  return { asked, frame: shown.tag === 'iframe' ? shown : null, text: text(shown), until: until.textContent };
}

(async () => {
  await test('the dashboard is locked: format byte, nonce, ciphertext; the key is 256 random bits, base64url', async () => {
    const { H } = load();
    const env = H.envelope(HTML, { sim: true });
    const a = await H.seal(env), b = await H.seal(env);
    assert.strictEqual(a.body[0], 1);
    assert.match(a.key, /^[A-Za-z0-9_-]{43}$/);
    assert.strictEqual(H.unb64url(a.key).length, 32);
    assert.notStrictEqual(a.key, b.key, 'a fresh key every time');
    assert.ok(!Buffer.from(a.body.subarray(1, 13)).equals(Buffer.from(b.body.subarray(1, 13))), 'a fresh nonce every time');
    assert.strictEqual(a.body.length, 1 + 12 + new TextEncoder().encode(JSON.stringify(env)).length + 16);
    assert.ok(!has(a.body, MARK) && !has(a.body, 'Afferent summary') && !has(a.body, 'afferent.dashboard'), 'nothing readable');
    const back = await H.unseal(a.body, a.key);
    assert.deepStrictEqual([back.kind, back.v, back.html, back.sim], ['afferent.dashboard', 1, HTML, true]);
    await assert.rejects(H.unseal(a.body, b.key), 'another key does not open it');
  });

  await test('upload: only ciphertext goes to the relay, and the key never leaves the phone', async () => {
    const { H, sent } = load({ routes: [[/\/share$/, relayOk]] });
    const out = await H.share({ html: HTML, pid: 'anna', hub: HUB });
    assert.strictEqual(out.kind, 'relay');
    assert.strictEqual(sent.length, 1, 'one request, and none to the hub');
    const [req] = sent;
    assert.deepStrictEqual([req.method, req.url], ['POST', `${RELAY}/share`]);
    const key = out.link.split('#')[1];
    assert.match(key, /^[A-Za-z0-9_-]{43}$/);
    assert.strictEqual(out.link, `${RELAY}/d/${ID}#${key}`);
    assert.ok(!req.url.includes('#') && !req.url.includes(key), 'the fragment is not part of any request');
    assert.deepStrictEqual(Object.keys(req.headers).sort(), ['Content-Type', 'X-Afferent-Code']);
    assert.strictEqual(req.headers['X-Afferent-Code'], 'relay-code');
    assert.ok(!JSON.stringify(req.headers).includes(key));
    const raw = Buffer.from(H.unb64url(key));
    assert.ok(req.body instanceof Uint8Array && req.body[0] === 1, 'the body is the locked bytes');
    assert.ok(!has(req.body, key) && !Buffer.from(req.body).includes(raw), 'the key is not in the body, as text or as bytes');
    assert.ok(!has(req.body, MARK) && !has(req.body, '<html') && !has(req.body, 'anna'), 'no dashboard text, no patient id');
    assert.strictEqual(req.credentials, 'omit', 'no cookies to the relay');
    const back = await H.unseal(req.body, key);
    assert.strictEqual(back.html, HTML, 'what went up is the dashboard, locked with the key in the link');
    assert.deepStrictEqual([out.id, out.revoke, out.base, out.expires], [ID, 'revoke-token-xyz', RELAY, '2026-11-21T20:00:00Z']);
  });

  await test('the viewer unlocks the uploaded bytes and shows the dashboard in a sandboxed frame', async () => {
    const { H, sent } = load({ routes: [[/\/share$/, relayOk]] });
    const out = await H.share({ html: HTML });
    const key = out.link.split('#')[1];
    const v = await view({ hash: '#' + key, blob: sent[0].body });
    assert.ok(v.frame, v.text);
    assert.strictEqual(v.frame.attrs.sandbox, 'allow-scripts', 'scripts only: no same origin, no top navigation, no popups');
    assert.strictEqual(v.frame.srcdoc, HTML);
    assert.strictEqual(v.until, 'Open until Sat 21 Nov');
    assert.deepStrictEqual(v.asked.map(a => a.url), [`/d/${ID}/blob`]);
    assert.ok(!JSON.stringify(v.asked).includes(key), 'the viewer never sends the key');
    assert.deepStrictEqual([v.asked[0].opts.credentials, v.asked[0].opts.referrerPolicy], ['omit', 'no-referrer']);
  });

  await test('the viewer says so when the key is wrong or missing, the share has ended, or the server is away', async () => {
    const { H, sent } = load({ routes: [[/\/share$/, relayOk]] });
    await H.share({ html: HTML });
    const other = (await H.seal(H.envelope('x'))).key;
    const wrong = await view({ hash: '#' + other, blob: sent[0].body });
    assert.ok(!wrong.frame && /does not open the dashboard/.test(wrong.text), wrong.text);
    const cut = await view({ hash: '#' + other.slice(0, 30), blob: sent[0].body });
    assert.ok(!cut.frame && /not complete/.test(cut.text) && cut.asked.length === 0, 'a cut key is not even fetched for');
    const none = await view({ hash: '', blob: sent[0].body });
    assert.ok(/not complete/.test(none.text));
    const gone = await view({ hash: '#' + other, blob: new Uint8Array(0), status: 404 });
    assert.ok(/no longer shared/.test(gone.text) && /7 days/.test(gone.text), gone.text);
    const busy = await view({ hash: '#' + other, blob: new Uint8Array(0), status: 503 });
    assert.ok(/Could not open/.test(busy.text) && /Try again/.test(busy.text), busy.text);
    const plain = await view({ hash: '#' + other, blob: new TextEncoder().encode(JSON.stringify({ kind: 'afferent.dashboard', html: HTML })) });
    assert.ok(!plain.frame, 'bytes that are not locked are never shown');
  });

  await test('fallback order: relay, then the hub, then a file', async () => {
    const relayDown = [/\/share$/, { throws: 'TypeError' }];
    const hub = [/\/api\/export\/publish$/, hubOk];

    let n = load({ routes: [[/\/share$/, relayOk], hub] });
    assert.strictEqual((await n.H.share({ html: HTML, hub: HUB })).kind, 'relay');

    n = load({ routes: [relayDown, hub] });
    let out = await n.H.share({ html: HTML, pid: 'anna', hub: HUB });
    assert.strictEqual(out.kind, 'hub');
    assert.deepStrictEqual(n.sent.map(r => r.url), [`${RELAY}/share`, `${HUB}/api/export/publish`]);
    assert.strictEqual(out.link, 'http://192.168.1.20:8000/shared/HubShareId1234567890ab');
    assert.ok(!out.link.includes('pairing-token-123') && !out.link.includes('/k/'), 'the pairing token stays out of the link');
    assert.deepStrictEqual(JSON.parse(n.sent[1].body), { patient_id: 'anna', html: HTML });
    assert.strictEqual(n.sent[1].credentials, 'same-origin');

    n = load({ routes: [[/\/share$/, { status: 401, reply: { error: 'wrong_code' } }], hub] });
    assert.strictEqual((await n.H.share({ html: HTML, hub: HUB })).kind, 'hub', 'a refused upload falls back too');

    n = load({ routes: [relayDown, [/\/api\/export\/publish$/, { status: 401, reply: {} }]] });
    out = await n.H.share({ html: HTML, hub: HUB });
    assert.strictEqual(out.kind, 'file');
    assert.strictEqual(out.tried.length, 2);

    n = load({ routes: [relayDown] });
    assert.strictEqual((await n.H.share({ html: HTML, hub: null })).kind, 'file');
  });

  await test('no relay set up: straight to the hub; no WebCrypto: nothing goes to the relay unlocked', async () => {
    let n = load({ relay: { url: '', code: '' }, routes: [[/\/api\/export\/publish$/, hubOk]] });
    assert.strictEqual((await n.H.share({ html: HTML, hub: HUB })).kind, 'hub');
    assert.ok(n.sent.every(r => !r.url.includes('/share')), 'the relay is not asked');

    n = load({ crypto: {}, routes: [[/\/share$/, relayOk], [/\/api\/export\/publish$/, hubOk]] });
    const out = await n.H.share({ html: HTML, hub: HUB });
    assert.strictEqual(out.kind, 'hub');
    assert.ok(n.sent.every(r => !r.url.includes('/share')), 'a page without WebCrypto never uploads');
    assert.match(out.tried[0], /WebCrypto/);
  });

  await test('an older hub without share_url: its own path, still without the token', async () => {
    const n = load({ relay: null, routes: [[/\/api\/export\/publish$/, { method: 'POST', reply: { ok: true, url: '/api/export/dashboard' } }]] });
    const out = await n.H.share({ html: HTML, hub: HUB });
    assert.strictEqual(out.link, 'http://192.168.1.20:8000/api/export/dashboard');
    const bad = load({ relay: null, routes: [[/\/api\/export\/publish$/, { method: 'POST', reply: { url: '/k/pairing-token-123/x' } }]] });
    assert.strictEqual((await bad.H.share({ html: HTML, hub: HUB })).kind, 'file', 'a link with a token in it is never shown');
  });

  await test('take back: DELETE with the revoke token, nothing else', async () => {
    const n = load({ routes: [[new RegExp(`/d/${ID}$`), { method: 'DELETE', status: 204, reply: null }]] });
    const entry = { kind: 'relay', id: ID, base: RELAY, revoke: 'revoke-token-xyz' };
    assert.strictEqual(await n.H.revoke(entry), true);
    assert.deepStrictEqual([n.sent[0].method, n.sent[0].url, n.sent[0].headers], ['DELETE', `${RELAY}/d/${ID}`, { 'X-Revoke-Token': 'revoke-token-xyz' }]);
    const ended = load({ routes: [[/\/d\//, { method: 'DELETE', status: 404, reply: {} }]] });
    assert.strictEqual(await ended.H.revoke(entry), true, 'already ended counts as taken back');
    const down = load({ routes: [[/\/d\//, { method: 'DELETE', status: 503, reply: {} }]] });
    assert.strictEqual(await down.H.revoke(entry), false);
    assert.strictEqual(await down.H.revoke({ kind: 'hub' }), false);
  });

  await test('the relay address is the voice companion\'s, typed on the phone or built in', async () => {
    const { H } = load();
    assert.strictEqual(H.relayBase('wss://afferent-voice-x.a.run.app/live'), 'https://afferent-voice-x.a.run.app');
    assert.strictEqual(H.relayBase('afferent-voice-x.a.run.app/'), 'https://afferent-voice-x.a.run.app');
    assert.strictEqual(H.relayBase('http://127.0.0.1:8787'), 'http://127.0.0.1:8787');
    assert.strictEqual(H.relayBase(''), null);
    assert.deepStrictEqual(JSON.parse(JSON.stringify(H.relay())), { base: RELAY, code: 'relay-code' });
    const typed = load({ typed: { url: 'ws://10.0.0.5:8080', code: 'typed' } });
    assert.deepStrictEqual(JSON.parse(JSON.stringify(typed.H.relay())), { base: 'http://10.0.0.5:8080', code: 'typed' });
    assert.strictEqual(load({ relay: { url: RELAY, code: '' } }).H.relay(), null, 'no code, no relay');
    assert.strictEqual(load({ relay: null }).H.relay(), null, 'no voice-config.js');
  });

  for (const [s, name, e] of results) console.log(`${s} ${name}${e ? '\n  ' + (e.stack || e) : ''}`);
  const failed = results.filter(r => r[0] === 'FAIL').length;
  console.log(`${results.length - failed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
