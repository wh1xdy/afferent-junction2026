// "Show to my doctor" hands over a link to the patient's dashboard, not the numbers themselves.
// In this order:
// 1. Relay (voice-relay/main.py, POST /share): the dashboard is locked on this phone with AES-GCM under a
//    fresh random 256-bit key, and only the locked bytes go up. The link is <relay>/d/<id>#<key>. A browser
//    never sends what follows '#', so the relay never sees the key or anything it could read. The link
//    lasts 7 days and the patient can take it back (DELETE with the revoke token kept on this phone).
// 2. The paired home hub (POST /api/export/publish): it serves the dashboard at a link that opens on the
//    home network only. The hub's pairing token is used to publish and never goes into the link.
// 3. Neither: the patient saves the dashboard as a file or shares it from the phone.
// The relay address and access code are the voice companion's (js/voice-config.js, or typed on the phone).
(() => {
  const g = typeof globalThis !== 'undefined' ? globalThis : self;
  const VOICE = 'afferent.voice.relay', AAD = 'afferent.dashboard/1', FORMAT = 1, TIMEOUT_MS = 8000;
  const enc = new TextEncoder();

  const b64url = bytes => {
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  };
  const unb64url = s => {
    const bin = atob(String(s).replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((String(s).length + 3) % 4));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  };

  const subtle = () => g.crypto?.subtle || null;

  // The relay's https base from what the voice code stores (it may be written as wss://…/live or without a scheme).
  const relayBase = url => {
    let u = String(url || '').trim().replace(/\/+$/, '').replace(/\/live$/, '');
    if (!u) return null;
    u = u.replace(/^ws(s?):\/\//i, 'http$1://');
    if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
    try { const p = new URL(u); return p.origin + p.pathname.replace(/\/+$/, ''); } catch { return null; }
  };

  function relay() {
    let typed = null;
    try { typed = JSON.parse(g.localStorage?.getItem(VOICE)); } catch {}
    const r = typed?.url && typed?.code ? typed : g.AFFERENT_VOICE;
    const base = r?.code ? relayBase(r.url) : null;
    return base ? { base, code: String(r.code) } : null;
  }

  // The hub address without its pairing token (/k/<token>): what a link may show.
  const hubOrigin = hub => { try { return new URL(hub).origin; } catch { return null; } };

  // The relay gets no cookies; the hub gets its own (a page the hub served carries the pairing cookie).
  async function timed(url, opts, ms = TIMEOUT_MS) {
    const ac = new AbortController(), t = setTimeout(() => ac.abort(), ms);
    try { return await fetch(url, { credentials: 'omit', ...opts, signal: ac.signal, cache: 'no-store', referrerPolicy: 'no-referrer' }); }
    finally { clearTimeout(t); }
  }

  // Locked form: [FORMAT][12-byte nonce][AES-GCM ciphertext and tag] of the JSON envelope.
  async function seal(envelope) {
    const c = subtle();
    if (!c) throw new Error('no_webcrypto');
    const raw = g.crypto.getRandomValues(new Uint8Array(32)), iv = g.crypto.getRandomValues(new Uint8Array(12));
    const key = await c.importKey('raw', raw, 'AES-GCM', false, ['encrypt']);
    const ct = new Uint8Array(await c.encrypt({ name: 'AES-GCM', iv, additionalData: enc.encode(AAD) }, key, enc.encode(JSON.stringify(envelope))));
    const body = new Uint8Array(1 + iv.length + ct.length);
    body[0] = FORMAT; body.set(iv, 1); body.set(ct, 1 + iv.length);
    const text = b64url(raw);
    raw.fill(0);
    return { body, key: text };
  }

  // The viewer (voice-relay/viewer.html) does the same; kept here for the tests.
  async function unseal(body, key) {
    const c = subtle();
    const k = await c.importKey('raw', unb64url(key), 'AES-GCM', false, ['decrypt']);
    const plain = await c.decrypt({ name: 'AES-GCM', iv: body.subarray(1, 13), additionalData: enc.encode(AAD) }, k, body.subarray(13));
    return JSON.parse(new TextDecoder().decode(plain));
  }

  async function viaRelay(r, envelope) {
    const { body, key } = await seal(envelope);
    const res = await timed(`${r.base}/share`, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream', 'X-Afferent-Code': r.code }, body });
    if (!res.ok) throw Object.assign(new Error('relay ' + res.status), { status: res.status });
    const out = await res.json();
    if (!out?.id || !/^[A-Za-z0-9_-]{22}$/.test(out.id) || !out.revoke) throw new Error('relay answer');
    return { kind: 'relay', link: `${r.base}/d/${out.id}#${key}`, id: out.id, base: r.base, revoke: out.revoke, expires: out.expires || null };
  }

  async function viaHub(hub, html, pid) {
    const origin = hubOrigin(hub);
    if (!origin) throw new Error('no hub');
    const res = await timed(`${hub.replace(/\/+$/, '')}/api/export/publish`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ patient_id: pid, html }), credentials: 'same-origin',
    }, 6000);
    if (!res.ok) throw Object.assign(new Error('hub ' + res.status), { status: res.status });
    const out = await res.json();
    const path = out?.share_url || out?.url;
    if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('/k/')) throw new Error('hub answer');
    return { kind: 'hub', link: origin + path, expires: out.expires_iso || null };
  }

  // Relay first, then the hub, then a file. `tried` says why each step was passed over, for the tests and the console.
  async function share({ html, envelope, pid = 'anna', hub = null }) {
    const tried = [];
    const r = relay();
    if (!r) tried.push('relay: not set up');
    else if (!subtle()) tried.push('relay: this page cannot lock (no WebCrypto)');
    else {
      try { return { ...(await viaRelay(r, envelope || { kind: 'afferent.dashboard', v: 1, html })), tried }; }
      catch (e) { tried.push('relay: ' + (e.status || e.name || e.message)); }
    }
    if (!hub) tried.push('hub: not paired');
    else {
      try { return { ...(await viaHub(hub, html, pid)), tried }; }
      catch (e) { tried.push('hub: ' + (e.status || e.name || e.message)); }
    }
    return { kind: 'file', tried };
  }

  // Takes a relay share back. True when the relay has dropped it (or it had already ended).
  async function revoke(entry) {
    if (entry?.kind !== 'relay' || !entry.id || !entry.revoke || !entry.base) return false;
    const res = await timed(`${entry.base}/d/${entry.id}`, { method: 'DELETE', headers: { 'X-Revoke-Token': entry.revoke } });
    return res.status === 204 || res.status === 404;
  }

  const envelope = (html, extra = {}) => ({ kind: 'afferent.dashboard', v: 1, html, made_iso: new Date().toISOString(), ...extra });

  const Handover = { relay, relayBase, hubOrigin, seal, unseal, viaRelay, viaHub, share, revoke, envelope, b64url, unb64url };
  if (typeof module !== 'undefined' && module.exports) module.exports = Handover;
  (g.A = g.A || {}).Handover = Handover;
})();
