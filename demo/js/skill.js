(() => {
  const { clamp } = A;
  const KEY = 'afferent.skill.v1', L0 = 0.3, CAP = 0.12;
  const GRADE = { perfect: 1, good: 0.8, barely: 0.4, miss: 0 }, MULT = [1, 1.25, 1.5, 2];
  const PSTAR = { tempo: 0.78, puzzle: 0.75, calm: 0.8 };
  const KIND = { fireflies: 'tempo', beacon: 'tempo', bells: 'tempo', shutters: 'tempo', threads: 'puzzle', stars: 'puzzle', breath: 'calm', loyly: 'calm' };
  const FEW = new Set(['breath', 'loyly', 'bells']);
  const r3 = x => (x == null || Number.isNaN(x) ? null : Math.round(x * 1000) / 1000);
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);

  const store = {
    read() { try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; } },
    write(v) { try { localStorage.setItem(KEY, JSON.stringify(v)); return true; } catch { return false; } },
  };

  const S = A.Skill = {
    GRADE, L0,
    defs: {}, data: { v: 1, tasks: {}, rt: [] }, sess: null, cur: null,

    define(id, axes) { S.defs[id] = { ...S.defs[id], ...axes }; return S; },

    begin(s) {
      const raw = store.read();
      S.data = raw?.v === 1 && raw.tasks ? { v: 1, tasks: raw.tasks, rt: Array.isArray(raw.rt) ? raw.rt : [] } : { v: 1, tasks: {}, rt: [] };
      const speed = Number(new URLSearchParams(location.search).get('speed')) || 1;
      S.sess = { s, credit: !s.auto && s.profile === 'live' && speed === 1, played: 0, heatMax: 0, Ls: {}, Lsess: {}, assist: false, reasons: [], stored: false, fatS: 0, lastPeak: false, lastDrop: false, coreRt: null };
      S.cur = null;
    },

    coreDone(core) {
      const x = S.sess;
      if (!x || !core?.rt) return;
      x.coreRt = core.rt;
      x.mood = core.mood_start ?? null;
      if (x.credit && core.rt.valid && core.rt.median_ms != null) S.data.rt = [...S.data.rt, core.rt.median_ms].slice(-14);
    },

    tick(fat, dt) { const x = S.sess; if (x) x.fatS = fat >= 0.6 ? x.fatS + dt : 0; },

    checkAssist() {
      const x = S.sess, why = [];
      if (!x) return false;
      if (x.mood === 1) why.push('mood_1');
      else {
        if (x.mood === 2) why.push('mood_2');
        const rt = x.coreRt, hist = S.data.rt.slice(0, -1);
        if (rt?.lapses >= 2) why.push('rt_lapses');
        else if (rt?.median_ms != null && hist.length >= 5 && rt.median_ms >= 1.25 * A.median(hist)) why.push('rt_slow');
        if (x.fatS >= 20) why.push('fatigue');
        if (x.lastDrop) why.push('skill_drop');
        if (why.length < 2) why.length = 0;
      }
      x.assist = why.length > 0;
      if (x.assist) x.reasons = [...new Set([...x.reasons, ...why])];
      return x.assist;
    },

    task(id) {
      const t = S.data.tasks[id] || (S.data.tasks[id] = { L: L0, n: 0, last: null, best: L0 });
      return t;
    },

    start(id, mode, k) {
      const x = S.sess;
      if (!x || !KIND[id] || mode === 'rest') { S.cur = null; return null; }
      const t = S.task(id), gap = t.last ? daysBetween(t.last, today()) : 0, rust = gap > 1 ? Math.min(0.06, 0.01 * (gap - 1)) : 0;
      if (x.Lsess[id] === undefined) x.Lsess[id] = t.L;
      if (x.Ls[id] === undefined) x.Ls[id] = t.L - rust;
      const assist = S.checkAssist(), heat = Math.min(0.06, 0.03 * x.played);
      x.heatMax = Math.max(x.heatMax, heat);
      S.cur = {
        id, mode, k: k ?? 0, rust, heat, assist, relax: x.lastPeak, i: 0, n: 1, L_start: t.L, Ls_start: x.Ls[id], D: {}, ds: [], d_start: null,
        grades: { perfect: 0, good: 0, barely: 0, miss: 0 }, trials: 0, oSum: 0, c: 0, tier: 0, tierMax: 0, cMax: 0, missRun: 0, fever: false, light: 0, lightMax: 0, pc: 0,
        tiers: S.defs[id]?.tiers || [3, 6, 10],
      };
      x.played++;
      return S.cur;
    },

    active(id) { return S.cur && S.cur.id === id ? S.cur : null; },
    level(id) { const c = S.active(id); return c ? S.sess.Ls[id] : S.task(id).L; },
    assisted() { return !!S.cur?.assist; },

    progress(id, i, n) {
      const c = S.active(id);
      if (!c) return 0;
      const before = S.third(c);
      c.i = Math.max(0, i); c.n = Math.max(1, n);
      return S.third(c) > before ? S.third(c) : 0;
    },
    third(c) { return Math.min(2, Math.floor(3 * c.i / c.n)); },

    base(id) {
      const c = S.active(id);
      if (!c) return S.task(id).L;
      const t = S.third(c), boss = c.i >= c.n - 1 && c.n > 1 ? (c.assist ? 0.1 : 0.2) : 0;
      let ramp = [0, 0.06, 0.12][t];
      if (c.relax && t === 0) ramp = -0.05;
      if (c.assist) ramp = Math.min(ramp, 0.06);
      return clamp(S.sess.Ls[id] + c.heat + ramp + boss + (c.assist ? -0.15 : 0), 0, 1);
    },

    dAxis(c, cat) {
      const k = c.k;
      if (c.mode === 'calm') return cat === 'precision' ? -0.3 * k : cat === 'patience' ? 0.1 * k : 0;
      if (c.mode === 'wake') return cat === 'tempo' ? 0.15 * (k - 0.5) : cat === 'precision' ? -0.05 : 0;
      if (c.mode === 'fatigue') return cat === 'tempo' ? 0.2 * (k - 0.5) : cat === 'precision' ? -0.05 : 0;
      return 0;
    },

    d(id, name) {
      const c = S.active(id), ax = S.defs[id]?.[name];
      const b = S.base(id);
      if (!c || !ax) return b;
      if (c.mode === 'calm' && ax.cat === 'tempo') { c.D[name] = 0; return 0; }
      const D = S.dAxis(c, ax.cat);
      c.D[name] = D;
      return clamp(b + D, 0, 1);
    },

    axis(id, name, fallback) {
      const ax = S.defs[id]?.[name];
      if (!ax) return fallback;
      const d = S.d(id, name), c = S.active(id);
      if (c && c.d_start === null) c.d_start = S.base(id);
      let v;
      if (ax.steps) { v = ax.steps[0][1]; for (const [at, val] of ax.steps) if (d >= at) v = val; }
      else if (ax.geo) v = ax.v0 * Math.pow(ax.v1 / ax.v0, d);
      else v = ax.v0 + (ax.v1 - ax.v0) * d;
      if (ax.int) v = Math.round(v);
      if (c?.assist && ax.cat === 'precision' && ax.wider !== false) v *= 1.25;
      return v;
    },

    tierOf(c, n) { let t = 0; for (const x of c.tiers) if (n >= x) t++; return t; },

    trial(id, grade) {
      const c = S.active(id), x = S.sess, o = GRADE[grade];
      if (!c || o === undefined) return null;
      const t = S.task(id), p = PSTAR[KIND[id]], step = (t.n < 10 ? 0.08 : t.n < 60 ? 0.04 : 0.025) * (FEW.has(id) ? 2 : 1);
      c.ds.push(S.base(id));
      x.Ls[id] = clamp(x.Ls[id] + step * (o - p), 0, 1);
      const w = S.weight(c);
      if (w > 0) {
        const lo = x.Lsess[id] - CAP, hi = x.Lsess[id] + CAP;
        t.L = clamp(clamp(t.L + w * step * (o - p), lo, hi), 0, 1);
        t.best = Math.max(t.best ?? L0, t.L);
        x.stored = true;
      }
      t.n++; t.last = today();
      c.grades[grade]++; c.trials++; c.oSum += o;
      const prevTier = c.tier;
      if (grade === 'perfect' || grade === 'good') { c.c++; c.missRun = 0; }
      else if (grade === 'barely') c.missRun = 0;
      else if (grade === 'miss') {
        c.missRun++;
        if (c.assist) c.missRun = 0;
        else {
          const floor = [0, ...c.tiers][S.tierOf(c, c.c)] ?? 0;
          c.c = c.missRun >= 2 ? ([0, ...c.tiers][Math.max(0, S.tierOf(c, c.c) - 1)] ?? 0) : floor;
        }
      }
      c.tier = S.tierOf(c, c.c);
      c.cMax = Math.max(c.cMax, c.c); c.tierMax = Math.max(c.tierMax, c.tier);
      const fever = c.tier === c.tiers.length && !c.fever;
      if (fever) c.fever = true;
      c.light += o * MULT[c.tier];
      c.pc++; c.lightMax += MULT[S.tierOf(c, c.pc)];
      return { o, tier: c.tier, up: c.tier > prevTier, down: c.tier < prevTier, combo: c.c, fever, light: S.lightShare(c) };
    },

    drop(id) {
      const c = S.active(id);
      if (!c) return 0;
      c.c = [0, ...c.tiers][Math.max(0, S.tierOf(c, c.c) - 1)] ?? 0;
      c.tier = S.tierOf(c, c.c);
      return c.tier;
    },

    weight(c) {
      if (!S.sess.credit || c.assist) return 0;
      const m = Math.max(0, ...Object.values(c.D).map(Math.abs));
      return m <= 0.05 ? 1 : m <= 0.15 ? 0.5 : 0;
    },

    lightShare(c) { const v = c.lightMax ? c.light / c.lightMax : 0; return c.assist ? Math.max(0.5, v) : v; },

    finish(id) {
      const c = S.active(id), x = S.sess;
      if (!c) return null;
      const t = S.task(id), ds = c.ds.length ? c.ds : [S.base(id)], oMean = c.trials ? c.oSum / c.trials : null;
      x.lastPeak = (oMean ?? 0) > 0.9 || c.fever;
      x.lastDrop = x.Ls[id] <= c.Ls_start - 0.15;
      S.cur = null;
      return {
        v: 1, L_start: r3(c.L_start), L_end: r3(t.L), Ls_end: r3(x.Ls[id]), d_start: r3(c.d_start ?? ds[0]), d_mean: r3(ds.reduce((a, b) => a + b, 0) / ds.length), d_max: r3(Math.max(...ds)),
        D: Object.fromEntries(Object.entries(c.D).map(([k, v]) => [k, r3(v)])), w: S.weight(c), trials: c.trials, o_mean: r3(oMean),
        grades: { ...c.grades }, combo_max: c.cMax, tier_max: c.tierMax, fever: c.fever, light_share: r3(S.lightShare(c)), assist: c.assist,
      };
    },

    record() {
      const x = S.sess;
      return x ? { v: 1, assist: x.reasons.length > 0, assist_reasons: [...x.reasons], heat_max: r3(x.heatMax), stored: x.stored } : null;
    },

    save() {
      if (!S.sess?.credit) return false;
      return store.write({ v: 1, tasks: S.data.tasks, rt: S.data.rt, updated: new Date().toISOString() });
    },
  };
})();
