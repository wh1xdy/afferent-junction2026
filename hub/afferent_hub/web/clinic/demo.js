(() => {
  const C = window.C;
  const FLAG = 'afferent.clinic.demo-seeded';
  const flag = { get() { try { return localStorage.getItem(FLAG) === '1'; } catch { return false; } }, set() { try { localStorage.setItem(FLAG, '1'); } catch {} } };

  async function load() {
    try {
      const r = await fetch('demo-exports.json', { cache: 'no-store' });
      return r.ok ? (await r.json()).exports || [] : [];
    } catch { return []; }
  }

  async function add(list) {
    const known = new Map();
    const sorted = [...list].sort((a, b) => a.received_iso.localeCompare(b.received_iso));
    for (const e of sorted) {
      const col = C.qr.collector();
      let c = null;
      for (const p of e.parts) c = col.add(C.qr.clean(p));
      if (!c || c.status !== 'complete') continue;
      const r = C.qr.decode(c.text, Math.floor(Date.parse(e.received_iso) / 1000));
      if (r.status !== 'ok') continue;
      r.raw = c.text;
      const k = C.codes.key(r.fp) || known.get(r.fp) || (await C.codes.trust(r, e.label, null, e.received_iso));
      known.set(r.fp, k);
      await C.codes.add(r, k, { scanned_iso: e.received_iso, demo: true });
    }
  }

  C.demo = {
    load,
    add,
    async seed() {
      if (flag.get() || C.codes.all().length) return flag.set();
      await add(await load());
      flag.set();
    },
    async reset() {
      await C.codes.clear();
      await add(await load());
      flag.set();
    },
  };
})();
