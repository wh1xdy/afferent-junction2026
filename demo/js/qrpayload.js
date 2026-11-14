(() => {
  const g = typeof globalThis !== 'undefined' ? globalThis : self;
  const node = typeof module !== 'undefined' && module.exports && typeof require === 'function';
  const VENDOR = { qrcode: 'qrcode.js', fflate: 'fflate.js', nobleP256: 'noble-p256.js' };
  const lib = name => {
    if (g[name]) return g[name];
    if (node) return require('../vendor/qr/' + VENDOR[name]);
    throw new Error(`qrpayload: load vendor/qr/${VENDOR[name]} first`);
  };

  const PREFIX = 'AF1';
  const VERSION = 1;
  const SCREEN_TTL = 600;
  const PAPER_TTL = 30 * 86400;
  const CLOCK_SKEW = 600;
  const MAX_VERSION = 22;
  const CAP_CHARS = 1134;
  const MAX_PARTS = 3;
  const MAX_INFLATED = 4096;
  const MAX_TEXT = 4000;
  const HDR_PUB = -65537;
  const CLAIM_BODY = -65601;
  const CAPS = { phq: 8, safety: 8, talk: 10 };
  const SHRINK = [{}, { talk: 5 }, { talk: 5, phq: 4 }];
  const OMIT = ['safety_entries', 'talk_requests', 'phq_totals'];
  const omitNames = o => Object.fromEntries(OMIT.map((k, i) => [k, o[i]]));

  const FEATURES = [
    ['rt_median', 1], ['mood', 10], ['sleep_regularity', 100], ['missed_sessions', 10], ['effort_hard_prop', 100],
    ['morning_pulse', 10], ['home_only_days', 10], ['upright_frac', 100], ['reward_bias', 100],
  ];
  const FKEYS = FEATURES.map(f => f[0]);
  const VITALS = [['pulse_bpm', 10], ['breathing_per_min', 10], ['rmssd_ms', 10]];
  const VITAL_MAX = 65535;
  const STATES = ['stable', 'watch', 'check_in', 'booster'];
  const CONFIDENCE = ['low', 'medium', 'high'];
  const BANDS = ['minimal', 'mild', 'moderate', 'moderately_severe', 'severe'];
  const TIERS = [null, 'low', 'moderate', 'high', 'incomplete', 'not_answered'];
  const SOURCES = ['cssrs', 'item9_fallback'];
  const SCREENS = ['thank_you', 'support', 'crisis', 'saved'];
  const PAUSE_SOURCES = ['patient', 'clinician'];
  const BASE_SOURCES = ['app', 'clinic_import'];
  const LAST_STATUS = [null, 'incomplete', 'stopped'];
  const SENSORS = ['phone_camera', 'pulse_stone', 'bedside_camera', 'bedside_light', 'presence', 'phone_presence', 'phone_motion'];
  const FORBIDDEN = ['phq9', 'phq9_9', 'cssrs', 'items', 'item9', 'display_name', 'patient_id', 'checkins', 'name'];

  class Tag { constructor(tag, value) { this.tag = tag; this.value = value; } }
  const fail = code => { const e = new Error(code); e.code = code; throw e; };
  const te = new TextEncoder();
  const td = new TextDecoder('utf-8', { fatal: true });

  function head(out, major, n) {
    if (!Number.isSafeInteger(n) || n < 0) fail('cbor_range');
    const m = major << 5;
    if (n < 24) out.push(m | n);
    else if (n < 0x100) out.push(m | 24, n);
    else if (n < 0x10000) out.push(m | 25, n >> 8, n & 255);
    else if (n < 0x100000000) out.push(m | 26, n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255);
    else {
      const hi = Math.floor(n / 0x100000000), lo = n >>> 0;
      out.push(m | 27, hi >>> 24, (hi >>> 16) & 255, (hi >>> 8) & 255, hi & 255,
        lo >>> 24, (lo >>> 16) & 255, (lo >>> 8) & 255, lo & 255);
    }
  }
  const pushBytes = (out, b) => { for (let i = 0; i < b.length; i++) out.push(b[i]); };
  const cmpBytes = (a, b) => {
    for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return a[i] - b[i];
    return a.length - b.length;
  };

  function enc(x, out) {
    if (x === null) out.push(0xf6);
    else if (x === false) out.push(0xf4);
    else if (x === true) out.push(0xf5);
    else if (typeof x === 'number') {
      if (!Number.isInteger(x)) fail('cbor_float');
      if (x >= 0) head(out, 0, x); else head(out, 1, -1 - x);
    } else if (typeof x === 'string') { const b = te.encode(x); head(out, 3, b.length); pushBytes(out, b); }
    else if (x instanceof Uint8Array) { head(out, 2, x.length); pushBytes(out, x); }
    else if (Array.isArray(x)) { head(out, 4, x.length); for (const v of x) enc(v, out); }
    else if (x instanceof Map) {
      const items = [...x].map(([k, v]) => [cborEncode(k), v]).sort((a, b) => cmpBytes(a[0], b[0]));
      head(out, 5, items.length);
      for (const [k, v] of items) { pushBytes(out, k); enc(v, out); }
    } else if (x instanceof Tag) { head(out, 6, x.tag); enc(x.value, out); }
    else fail('cbor_type');
  }
  function cborEncode(x) { const out = []; enc(x, out); return Uint8Array.from(out); }

  function cborDecode(bytes, maxDepth = 4) {
    let p = 0;
    const byte = () => { if (p >= bytes.length) fail('cbor_short'); return bytes[p++]; };
    const arg = ai => {
      if (ai < 24) return ai;
      const len = { 24: 1, 25: 2, 26: 4, 27: 8 }[ai];
      if (!len) fail('cbor_head');
      let n = 0;
      for (let i = 0; i < len; i++) n = n * 256 + byte();
      if (!Number.isSafeInteger(n)) fail('cbor_range');
      if (n < { 1: 24, 2: 0x100, 4: 0x10000, 8: 0x100000000 }[len]) fail('cbor_nonminimal');
      return n;
    };
    const take = n => { if (n > bytes.length - p) fail('cbor_short'); const b = bytes.slice(p, p + n); p += n; return b; };
    const item = depth => {
      const b = byte(), major = b >> 5, ai = b & 31;
      if (major === 7) {
        if (ai === 20) return false;
        if (ai === 21) return true;
        if (ai === 22) return null;
        fail('cbor_simple');
      }
      const n = arg(ai);
      if (major === 0) return n;
      if (major === 1) return -1 - n;
      if (major === 2) return take(n);
      if (major === 3) { try { return td.decode(take(n)); } catch { fail('cbor_utf8'); } }
      if (major === 4 || major === 5) {
        if (depth >= maxDepth) fail('cbor_depth');
        if (n > bytes.length - p) fail('cbor_short');
        if (major === 4) { const a = []; for (let i = 0; i < n; i++) a.push(item(depth + 1)); return a; }
        const m = new Map();
        let prev = null;
        for (let i = 0; i < n; i++) {
          const start = p, k = item(maxDepth), raw = bytes.subarray(start, p);
          if (typeof k !== 'number' && typeof k !== 'string') fail('cbor_key');
          if (prev && cmpBytes(prev, raw) >= 0) fail('cbor_order');
          prev = raw;
          m.set(k, item(depth + 1));
        }
        return m;
      }
      if (major === 6) { if (n !== 18 || depth !== 0) fail('cbor_tag'); return new Tag(n, item(depth)); }
      fail('cbor_major');
    };
    const v = item(0);
    if (p !== bytes.length) fail('cbor_trailing');
    return v;
  }

  const B45 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';
  function b45encode(u) {
    let s = '';
    for (let i = 0; i < u.length; i += 2) {
      if (i + 1 < u.length) {
        const x = u[i] * 256 + u[i + 1];
        s += B45[x % 45] + B45[Math.floor(x / 45) % 45] + B45[Math.floor(x / 2025)];
      } else s += B45[u[i] % 45] + B45[Math.floor(u[i] / 45)];
    }
    return s;
  }
  function b45decode(s) {
    if (s.length % 3 === 1) fail('b45_length');
    const out = [];
    const val = c => { const v = B45.indexOf(c); if (v < 0) fail('b45_char'); return v; };
    for (let i = 0; i < s.length; i += 3) {
      if (i + 2 < s.length) {
        const n = val(s[i]) + val(s[i + 1]) * 45 + val(s[i + 2]) * 2025;
        if (n > 0xffff) fail('b45_range');
        out.push(n >> 8, n & 255);
      } else {
        const n = val(s[i]) + val(s[i + 1]) * 45;
        if (n > 0xff) fail('b45_range');
        out.push(n);
      }
    }
    return Uint8Array.from(out);
  }

  const adler32 = u => {
    let a = 1, b = 0;
    for (let i = 0; i < u.length; i++) { a = (a + u[i]) % 65521; b = (b + a) % 65521; }
    return ((b << 16) | a) >>> 0;
  };

  const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  function fingerprint(pub) {
    const h = lib('nobleP256').sha256(pub);
    let bits = 0n;
    for (let i = 0; i < 8; i++) bits = (bits << 8n) | BigInt(h[i]);
    bits >>= 4n;
    let s = '';
    for (let i = 11; i >= 0; i--) s += CROCKFORD[Number((bits >> BigInt(5 * i)) & 31n)];
    return s.match(/.{4}/g).join(' ');
  }
  const hex = u => [...u].map(b => b.toString(16).padStart(2, '0')).join('');
  const randomBytes = n => g.crypto.getRandomValues(new Uint8Array(n));

  const isNum = x => typeof x === 'number' && Number.isFinite(x);
  const qz = (x, q) => (isNum(x) ? Math.round(x * q) : null);
  const dq = (x, q) => (x === null || x === undefined ? null : x / q);
  const qv = (x, q) => { const n = qz(x, q); return n === null || n <= 0 || n > VITAL_MAX ? null : n; };
  const dv = (x, q) => (Number.isInteger(x) && x > 0 && x <= VITAL_MAX ? x / q : null);
  const intOrNull = x => (isNum(x) ? Math.round(x) : null);
  const ix = (list, v) => { const i = list.indexOf(v); return i < 0 ? null : i; };
  const at = (list, i) => (i === null || i === undefined ? null : list[i] === undefined ? fail('body_enum') : list[i]);
  const epochDay = iso => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 864e5;
  const isoDay = n => new Date(n * 864e5).toISOString().slice(0, 10);
  const flat = rows => rows.flat();
  const groups = (a, k) => {
    if (!Array.isArray(a) || a.length % k) fail('body_shape');
    const out = [];
    for (let i = 0; i < a.length; i += k) out.push(a.slice(i, i + k));
    return out;
  };
  const arr = (a, n) => { if (!Array.isArray(a) || (n !== undefined && a.length !== n)) fail('body_shape'); return a; };
  const cleanInitial = s => {
    const v = String(s || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3);
    return v || null;
  };

  function pack(j, opts = {}) {
    const caps = { ...CAPS, ...(opts.caps || {}) };
    const omitted = { ...(j.omitted || {}) };
    const cut = (list, name) => {
      const all = list || [];
      const kept = name === 'phq' ? all.slice(-caps.phq) : all.slice(0, caps[name]);
      const k = OMIT[['safety', 'talk', 'phq'].indexOf(name)];
      omitted[k] = (omitted[k] || 0) + all.length - kept.length;
      return kept;
    };
    const per = j.period || {}, mo = j.mornings || {}, s = j.state || {}, c = j.composite || {};
    const phq = j.phq || {}, cmp = j.complete || {}, sens = j.sensors || {};
    const weekly = j.weekly || {}, base = j.baseline || {};
    const week = (row, q) => {
      const r = row || [];
      return Array.from({ length: 8 }, (_, k) => qz(r[k], q));
    };
    const body = new Map([
      [0, VERSION],
      [1, j.sim !== false],
      [3, [epochDay(per.tms_end_date), intOrNull(per.from_day), intOrNull(per.to_day)]],
      [4, ['lit_total', 'lit', 'rest', 'missed', 'frozen'].map(k => intOrNull(mo[k]) ?? 0)],
      [5, [ix(STATES, s.shown) ?? 0, ix(STATES, s.cusum) ?? 0, ix(STATES, s.phq_state),
        intOrNull(s.since_day), intOrNull(s.first_watch_day), intOrNull(s.first_check_in_day),
        intOrNull(s.first_booster_day), ix(CONFIDENCE, s.confidence) ?? 0]],
      [6, [qz(c.value, 100), qz(c.trend_7d, 100), qz(c.completeness, 100)]],
      [7, flat((j.contrib || []).filter(x => FKEYS.includes(x.key) && isNum(x.contribution))
        .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))
        .map(x => [FKEYS.indexOf(x.key), qz(x.contribution, 1000)]))],
      [8, [qz((j.cusum || {}).value, 100), flat(((j.cusum || {}).history || [])
        .filter(h => isNum(h.day) && STATES.includes(h.state)).map(h => [h.day, STATES.indexOf(h.state)]))]],
      [9, [week(weekly.composite, 100), ...FEATURES.map(([k, q]) => week(weekly[k], q))]],
      [10, flat(FEATURES.map(([k, q]) => (base[k] ? [qz(base[k].median, q), qz(base[k].scale, q)] : [null, null])))],
      [11, [intOrNull(phq.baseline), ix(BASE_SOURCES, phq.baseline_source) ?? 0,
        flat(cut(phq.history, 'phq').map(h => [intOrNull(h.day), intOrNull(h.total), intOrNull(h.phq8_total),
          ix(BANDS, h.band), h.early ? 1 : 0])),
        !!phq.overdue, ix(LAST_STATUS, phq.last_status ?? null) || null]],
      [12, flat(cut(j.safety, 'safety').filter(e => ix(TIERS, e.tier)).map(e => [intOrNull(e.day), intOrNull(e.minute),
        ix(TIERS, e.tier), ix(SOURCES, e.source), ix(SCREENS, e.screen), e.c6_repeat ? 1 : 0]))],
      [13, flat(cut(j.talk, 'talk').map(t => [intOrNull(t.day), intOrNull(t.minute)]))],
      [14, [...['played_days', 'sessions_7d', 'days_7d', 'missed_7d', 'paused_days'].map(k => intOrNull(cmp[k])),
        ...FKEYS.map(k => qz((cmp.by_feature || {})[k], 100))]],
      [15, flat((j.pauses || []).map(p => [intOrNull(p.from_day), intOrNull(p.until_day), ix(PAUSE_SOURCES, p.source) ?? 0]))],
      [16, SENSORS.reduce((m, k, i) => m | (sens[k] ? 1 << i : 0), 0)],
    ]);
    const ini = cleanInitial(opts.initial ?? j.ini);
    if (ini) body.set(2, ini);
    const om = OMIT.map(k => intOrNull(omitted[k]) ?? 0);
    if (om.some(Boolean)) body.set(17, om);
    const vit = j.vitals;
    if (vit && typeof vit === 'object') {
      const rows = VITALS.map(([k, q]) => Array.from({ length: 8 }, (_, i) => qv(((vit.weekly || {})[k] || [])[i], q)));
      const has = rows.map(r => r.some(x => x !== null));
      body.set(18, !has.some(Boolean) ? [] : [
        VITALS.reduce((m, [k], i) => m | (has[i] && (vit.simulated || {})[k] ? 1 << i : 0), 0),
        VITALS.map(([k], i) => (has[i] ? Math.min(56, Math.max(0, intOrNull((vit.days || {})[k]) ?? 0)) : 0)),
        ...rows,
      ]);
    }
    return body;
  }

  function unpack(b) {
    if (!(b instanceof Map)) fail('body_shape');
    const get = k => { if (!b.has(k)) fail('body_shape'); return b.get(k); };
    const per = arr(get(3), 3), mo = arr(get(4), 5), s = arr(get(5), 8), c = arr(get(6), 3);
    const cus = arr(get(8), 2), wk = arr(get(9), 10), base = arr(get(10), 18), phq = arr(get(11), 5);
    const cmp = arr(get(14), 14);
    const out = {
      v: get(0), sim: get(1) === true,
      period: { tms_end_date: isoDay(per[0]), from_day: per[1], to_day: per[2] },
      mornings: { lit_total: mo[0], lit: mo[1], rest: mo[2], missed: mo[3], frozen: mo[4] },
      state: { shown: at(STATES, s[0]), cusum: at(STATES, s[1]), phq_state: at(STATES, s[2]), since_day: s[3],
        first_watch_day: s[4], first_check_in_day: s[5], first_booster_day: s[6], confidence: at(CONFIDENCE, s[7]) },
      composite: { value: dq(c[0], 100), trend_7d: dq(c[1], 100), completeness: dq(c[2], 100) },
      contrib: groups(get(7), 2).map(([i, v]) => ({ key: at(FKEYS, i), contribution: dq(v, 1000) })),
      cusum: { value: dq(cus[0], 100), history: groups(cus[1], 2).map(([day, st]) => ({ day, state: at(STATES, st) })) },
      weekly: Object.fromEntries([['composite', 100], ...FEATURES].map(([k, q], i) => [k, arr(wk[i], 8).map(x => dq(x, q))])),
      baseline: Object.fromEntries(FEATURES.map(([k, q], i) => [k, base[2 * i] === null && base[2 * i + 1] === null ? null
        : { median: dq(base[2 * i], q), scale: dq(base[2 * i + 1], q) }])),
      phq: { baseline: phq[0], baseline_source: at(BASE_SOURCES, phq[1]),
        history: groups(phq[2], 5).map(([day, total, phq8, band, early]) => ({ day, total, phq8_total: phq8,
          band: at(BANDS, band), early: early === 1 })),
        overdue: phq[3] === true, last_status: at(LAST_STATUS, phq[4]) },
      safety: groups(get(12), 6).map(([day, minute, tier, source, screen, c6]) => ({ day, minute,
        tier: at(TIERS, tier), source: at(SOURCES, source), screen: at(SCREENS, screen), c6_repeat: c6 === 1 })),
      talk: groups(get(13), 2).map(([day, minute]) => ({ day, minute })),
      complete: { played_days: cmp[0], sessions_7d: cmp[1], days_7d: cmp[2], missed_7d: cmp[3], paused_days: cmp[4],
        by_feature: Object.fromEntries(FKEYS.map((k, i) => [k, dq(cmp[5 + i], 100)])) },
      pauses: groups(get(15), 3).map(([from_day, until_day, src]) => ({ from_day, until_day, source: at(PAUSE_SOURCES, src) })),
      sensors: Object.fromEntries(SENSORS.map((k, i) => [k, !!(get(16) & (1 << i))])),
    };
    if (b.has(2)) out.ini = b.get(2);
    if (b.has(17)) out.omitted = omitNames(arr(b.get(17), 3));
    if (b.has(18)) {
      const v = arr(b.get(18)), none = v.length === 0;
      if (!none && (v.length !== 2 + VITALS.length || !Number.isInteger(v[0]) || v[0] < 0)) fail('body_shape');
      const days = none ? [] : arr(v[1], VITALS.length);
      const rows = VITALS.map(([, q], i) => (none ? Array(8).fill(null) : arr(v[2 + i], 8).map(x => dv(x, q))));
      const has = rows.map(r => r.some(x => x !== null));
      out.vitals = {
        weekly: Object.fromEntries(VITALS.map(([k], i) => [k, rows[i]])),
        days: Object.fromEntries(VITALS.map(([k], i) => [k, has[i] && Number.isInteger(days[i]) ? Math.min(56, Math.max(0, days[i])) : 0])),
        simulated: Object.fromEntries(VITALS.map(([k], i) => [k, has[i] && !!(v[0] & (1 << i))])),
      };
    }
    if (out.safety.some(e => !e.tier)) fail('body_enum');
    return out;
  }

  function sign(body, key, iat, exp, cti) {
    const { p256 } = lib('nobleP256');
    const prot = cborEncode(new Map([[1, -7], [HDR_PUB, key.public]]));
    const payload = cborEncode(new Map([[4, exp], [6, iat], [7, cti], [CLAIM_BODY, body]]));
    const sig = p256.sign(cborEncode(['Signature1', prot, new Uint8Array(0), payload]), key.secret);
    return cborEncode(new Tag(18, [prot, new Map(), payload, sig]));
  }

  const matrices = new Map();
  function matrix(text, ecl = 'M') {
    const id = ecl + text;
    if (matrices.has(id)) return matrices.get(id);
    const q = lib('qrcode')(0, ecl);
    q.addData(text, 'Alphanumeric');
    q.make();
    const size = q.getModuleCount();
    const m = { text, ecl, size, version: (size - 17) / 4, isDark: (r, c) => q.isDark(r, c) };
    if (matrices.size > 8) matrices.delete(matrices.keys().next().value);
    matrices.set(id, m);
    return m;
  }

  const fitsAt = (text, ecl) => {
    try { return matrix(text, ecl).version <= MAX_VERSION; } catch { return false; }
  };

  function chunk(data, cap) {
    const alnum = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const set = [...randomBytes(4)].map(b => alnum[b % 36]).join('');
    for (let n = 2; n <= MAX_PARTS; n++) {
      const size = 3 * Math.ceil(data.length / n / 3);
      if (size + `${PREFIX}/1/${n}/${set}:`.length > cap) continue;
      return Array.from({ length: n }, (_, i) => `${PREFIX}/${i + 1}/${n}/${set}:` + data.slice(i * size, (i + 1) * size));
    }
    fail('too_large');
  }

  function encode(j, opts = {}) {
    const key = opts.key;
    if (!key || !(key.secret instanceof Uint8Array) || !(key.public instanceof Uint8Array)) fail('no_key');
    const paper = !!opts.paper;
    const iat = Math.floor((opts.now ?? Date.now()) / 1000);
    const exp = iat + (opts.ttl ?? (paper ? PAPER_TTL : SCREEN_TTL));
    const cti = opts.cti || randomBytes(8);
    const cap = opts.maxChars ?? CAP_CHARS;
    const { zlibSync } = lib('fflate');
    let body, text, level = 0;
    for (; level < SHRINK.length; level++) {
      body = pack(j, { initial: opts.initial, caps: { ...CAPS, ...SHRINK[level] } });
      const cose = sign(body, key, iat, exp, cti);
      text = `${PREFIX}:` + b45encode(zlibSync(cose, { level: 9 }));
      if (text.length <= cap && fitsAt(text, 'M')) break;
    }
    if (level === SHRINK.length) level--;
    const whole = text.length <= cap && fitsAt(text, 'M');
    const parts = whole ? [text] : chunk(text.slice(PREFIX.length + 1), cap);
    const ecl = paper && parts.every(p => fitsAt(p, 'Q')) ? 'Q' : 'M';
    const o = body.get(17);
    return {
      text: whole ? text : null, parts, ecl, versions: parts.map(p => matrix(p, ecl).version),
      chars: text.length, shrink: level, fingerprint: fingerprint(key.public), iat, exp, cti: hex(cti),
      omitted: o ? omitNames(o) : null, paper,
    };
  }

  function parse(text) {
    const s = String(text || '').trim();
    if (s.length > MAX_TEXT) return null;
    if (s.startsWith(`${PREFIX}:`)) return { whole: true, data: s.slice(PREFIX.length + 1) };
    const m = /^AF1\/([1-9])\/([1-9])\/([0-9A-Z]{4}):(.*)$/.exec(s);
    if (!m) return null;
    const i = +m[1], n = +m[2];
    if (n < 2 || n > MAX_PARTS || i > n) return null;
    return { whole: false, i, n, set: m[3], data: m[4] };
  }

  class Collector {
    constructor() { this.sets = new Map(); }
    add(text) {
      const p = parse(text);
      if (!p) return { status: 'not_ours' };
      if (p.whole) return { status: 'complete', text: `${PREFIX}:${p.data}` };
      const set = this.sets.get(p.set) || { n: p.n, parts: new Map() };
      if (set.n !== p.n) return { status: 'not_ours' };
      set.parts.set(p.i, p.data);
      this.sets.set(p.set, set);
      if (set.parts.size < set.n) return { status: 'part', have: set.parts.size, n: set.n, set: p.set };
      this.sets.delete(p.set);
      const data = Array.from({ length: set.n }, (_, k) => set.parts.get(k + 1)).join('');
      return { status: 'complete', text: `${PREFIX}:${data}`, n: set.n };
    }
  }

  function decode(input, opts = {}) {
    const text = Array.isArray(input)
      ? (() => { const c = new Collector(); let r; for (const t of input) r = c.add(t); return r && r.status === 'complete' ? r.text : null; })()
      : input;
    const p = text && parse(text);
    if (!p) return { status: 'not_ours', verified: false };
    if (!p.whole) return { status: 'part', verified: false, i: p.i, n: p.n, set: p.set };
    const damaged = code => ({ status: 'damaged', verified: false, reason: code });
    let tag, prot, payload, sig, pub;
    try {
      const z = b45decode(p.data);
      const raw = lib('fflate').unzlibSync(z);
      if (raw.length > MAX_INFLATED) return damaged('inflate_limit');
      if (z.length < 6 || adler32(raw) !== ((z[z.length - 4] << 24) | (z[z.length - 3] << 16) | (z[z.length - 2] << 8) | z[z.length - 1]) >>> 0)
        return damaged('zlib_checksum');
      tag = cborDecode(raw, 2);
      if (!(tag instanceof Tag) || tag.tag !== 18) return damaged('cose_tag');
      const a = arr(tag.value, 4);
      [prot, , payload, sig] = a;
      if (!(prot instanceof Uint8Array) || !(a[1] instanceof Map) || !(payload instanceof Uint8Array)
        || !(sig instanceof Uint8Array) || sig.length !== 64) return damaged('cose_shape');
      const h = cborDecode(prot, 1);
      if (!(h instanceof Map) || h.get(1) !== -7 || !(h.get(HDR_PUB) instanceof Uint8Array) || h.get(HDR_PUB).length !== 33)
        return damaged('cose_header');
      pub = h.get(HDR_PUB);
      const { p256 } = lib('nobleP256');
      p256.Point.fromBytes(pub);
      const ok = p256.verify(sig, cborEncode(['Signature1', prot, new Uint8Array(0), payload]), pub);
      if (!ok) return damaged('signature');
    } catch (e) {
      return damaged(e.code || 'decode');
    }
    let claims;
    try { claims = cborDecode(payload, 4); } catch (e) { return damaged(e.code || 'claims'); }
    const iat = claims instanceof Map ? claims.get(6) : null, exp = claims instanceof Map ? claims.get(4) : null;
    const cti = claims instanceof Map ? claims.get(7) : null, raw = claims instanceof Map ? claims.get(CLAIM_BODY) : null;
    if (!Number.isSafeInteger(iat) || !Number.isSafeInteger(exp) || !(cti instanceof Uint8Array) || !(raw instanceof Map))
      return damaged('claims');
    const meta = { verified: true, fingerprint: fingerprint(pub), publicKey: pub, iat, exp, cti: hex(cti), text };
    if (raw.get(0) !== VERSION) return { ...meta, status: 'newer_version', version: raw.get(0) };
    let body;
    try { body = unpack(raw); } catch (e) { return damaged(e.code || 'body'); }
    const now = Math.floor((opts.now ?? Date.now()) / 1000);
    const status = exp < now ? 'expired' : iat > now + CLOCK_SKEW ? 'future' : 'ok';
    return { ...meta, status, body, packed: raw };
  }

  function newKey() {
    const { p256 } = lib('nobleP256');
    const secret = p256.utils.randomSecretKey();
    return { secret, public: p256.getPublicKey(secret, true), created_iso: new Date().toISOString() };
  }

  const idb = (db, store) => new Promise((resolve, reject) => {
    const r = g.indexedDB.open(db, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(store);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  const idbDo = async (db, store, mode, fn) => {
    const d = await idb(db, store);
    return new Promise((resolve, reject) => {
      const tx = d.transaction(store, mode);
      const req = fn(tx.objectStore(store));
      tx.oncomplete = () => { d.close(); resolve(req && req.result); };
      tx.onerror = () => { d.close(); reject(tx.error); };
    });
  };

  async function deviceKey({ reset = false } = {}) {
    if (!reset) {
      const k = await idbDo('afferent-keys', 'device', 'readonly', s => s.get('device'));
      if (k && k.secret && k.public) return { ...k, secret: new Uint8Array(k.secret), public: new Uint8Array(k.public) };
    }
    const k = newKey();
    await idbDo('afferent-keys', 'device', 'readwrite', s => s.put(k, 'device'));
    return k;
  }
  const cacheBody = json => idbDo('afferent-qr', 'body', 'readwrite', s => s.put({ ...json, cached_iso: new Date().toISOString() }, 'body'));
  const cachedBody = () => idbDo('afferent-qr', 'body', 'readonly', s => s.get('body')).then(x => x || null);

  const QR = {
    PREFIX, VERSION, SCREEN_TTL, PAPER_TTL, MAX_VERSION, CAP_CHARS, CAPS, FEATURES, VITALS, STATES, TIERS, SENSORS, FORBIDDEN,
    encode, decode, pack, unpack, parse, chunk, Collector, matrix, fingerprint, newKey, deviceKey, cacheBody, cachedBody,
    cbor: { encode: cborEncode, decode: cborDecode, Tag }, base45: { encode: b45encode, decode: b45decode },
    sign, isoDay, epochDay, cleanInitial,
  };
  if (node) module.exports = QR;
  else (g.A = g.A || {}).QR = QR;
  g.AfferentQR = QR;
})();
