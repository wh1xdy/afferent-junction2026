((root) => {
  const MIN_MS = 150;

  const quantile = (xs, q) => {
    const s = [...xs].sort((a, b) => a - b), p = (s.length - 1) * q, i = Math.floor(p);
    return i + 1 < s.length ? s[i] + (s[i + 1] - s[i]) * (p - i) : s[i];
  };

  const log = () => {
    const open = new Map(), rts = [], kinds = new Map();
    let lapses = 0, anticipations = 0, seen = false;
    const add = (kind, ms) => {
      rts.push(ms);
      if (!kinds.has(kind)) kinds.set(kind, []);
      kinds.get(kind).push(ms);
    };
    return {
      cue(id, kind, t) {
        seen = true;
        if (!open.has(id)) open.set(id, { kind, t });
      },
      hit(id, t) {
        const c = open.get(id);
        if (!c) return null;
        open.delete(id);
        const ms = Math.round((t - c.t) * 1000);
        if (ms < MIN_MS) { anticipations++; return null; }
        add(c.kind, ms);
        return ms;
      },
      lapse(id) {
        if (!open.delete(id)) return;
        lapses++;
      },
      early() { seen = true; anticipations++; },
      drop(id) { open.delete(id); },
      pending(id) { return open.has(id); },
      summary() {
        if (!seen) return null;
        const med = xs => xs.length ? Math.round(quantile(xs, 0.5)) : null;
        return {
          n: rts.length,
          median_ms: med(rts),
          iqr_ms: rts.length >= 2 ? Math.round(quantile(rts, 0.75) - quantile(rts, 0.25)) : null,
          lapses,
          anticipations,
          by_kind: Object.fromEntries([...kinds].map(([k, xs]) => [k, { n: xs.length, median_ms: med(xs) }])),
        };
      },
    };
  };

  const api = { log, MIN_MS };
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root && root.A) root.A.RT = api;
})(typeof window !== 'undefined' ? window : globalThis);
