(() => {
  const { clamp, lerp, ema } = A;
  const R = Math.random, GULLIES = false;
  const rm =() => !!A.config?.reducedMotion;
  const hap = n => A.J?.hap(n);
  const sfx = (n, p) => A.J?.sfx?.(n, p);
  const PI = Math.PI;
  const DT = 1 / 120;

  const MODE = (m, k = 0.4) => {
    const P = {
      calm: { L: 1100, A: 110, c: 0.45, g: 160, hold: 1.5, dive: 1.6, glide: 45, sink: 30, boost: 0.08, vmin: 55, vmax: 150, silk: 22, bonus: 0, motes: 4, cam: 1.2, sph: 10, Lk: 110 },
      flow: { L: 760, A: 110, c: 0.5, g: 300, hold: 2.0, dive: 2.4, glide: 130, sink: 100, boost: 0.3, vmin: 110, vmax: 280, silk: 14, bonus: 0.1, motes: 6, cam: 2.2, sph: 3.6 },
      wake: { L: 700 + 100 * (1 - k), A: 150 + 40 * k, c: 0.5, g: 380, hold: 2.8, dive: 3.0, glide: 160, sink: 170, boost: 0.44 + 0.15 * k, vmin: 160, vmax: 440, silk: 11, bonus: 0.15, motes: Math.round(8 + 6 * k), cam: 3.0, sph: 2.6 },
      fatigue: { L: 700, A: 110, c: 0.5, g: 350, hold: 2.0, dive: 2.6, glide: 160, sink: 160, boost: 0.3, vmin: 150, vmax: 330, silk: 13, bonus: 0.12, motes: 6, cam: 2.6, sph: 2.9 },
      rest: { L: 900, A: 10, c: 0.5, g: 60, hold: 1, dive: 1, glide: 40, sink: 30, boost: 0, vmin: 20, vmax: 40, silk: 30, bonus: 0, motes: 0, cam: 1.0, sph: 30 },
    }[m] || null;
    return { ...(P || MODE('flow', k)), m: P ? m : 'flow', k };
  };
  const BENCH = 60;
  const ORBS = false; // ride orbs removed: none are drawn or collected
  const RIDE_HILLS = { calm: 1, flow: 1, wake: 2, fatigue: 2, rest: 1 };
  const SEC_HILL = { calm: 9.5, flow: 4.2, wake: 2.8, fatigue: 2.9, rest: 20 };

  const COL = {
    violet: '#9C8AD6', amber: '#F2B544', glow: '#FFD9A0', flame: '#F2E6C9', aurora: '#5FE3A1', ice: '#7FC8E8',
    gold: '#FFD27A', daylight: '#FFF3DC', silver: '#E8EEF5', warm: '#FFC98A', night: '#05070F', wood: '#7A5638', hut: '#5A3B28', rock: '#5E6873', snow: '#DDE6EE',
  };
  const STATIONS = {
    fork: { kind: 'ground', prop: 'cairn', art: 'task_fork_cairn', aw: 70, c: COL.violet },
    lanterns: { kind: 'ground', prop: 'pier', art: 'task_lanterns_pier_rope', aw: 200, c: COL.violet },
    breath: { kind: 'world', prop: 'hut', c: COL.amber },
    loyly: { kind: 'ground', prop: 'hut', c: COL.amber },
    threads: { kind: 'ground', prop: 'loom', art: 'task_threads_loom_frame', aw: 150, c: COL.aurora },
    stars: { kind: 'sky', prop: 'clearing', c: COL.silver, cruiseS: 34 },
    fireflies: { kind: 'ground', prop: 'reeds', art: 'task_fireflies_jar', aw: 54, c: COL.gold },
    beacon: { kind: 'ground', prop: 'lighthouse', art: 'task_beacon_lighthouse', aw: 74, c: COL.ice },
    bells: { kind: 'ground', prop: 'tower', art: 'task_bells_tower', aw: 76, c: COL.glow },
    shutters: { kind: 'ground', prop: 'houses', art: 'task_shutters_facade', aw: 230, c: COL.daylight },
    windows: { kind: 'ground', prop: 'houses', c: COL.warm },
    vihta: { kind: 'ground', prop: 'hut', c: COL.amber },
    birds: { kind: 'ground', prop: 'reeds', c: COL.gold },
    swans: { kind: 'ground', prop: 'pier', c: COL.ice },
    faces: { kind: 'ground', prop: 'houses', c: COL.violet },
    owls: { kind: 'ground', prop: 'cairn', c: COL.aurora },
    seals: { kind: 'ground', prop: 'pier', c: COL.ice },
    reindeer: { kind: 'ground', prop: 'cairn', c: COL.warm },
    ferry: { kind: 'ground', prop: 'lighthouse', c: COL.glow },
    drips: { kind: 'ground', prop: 'hut', c: COL.ice },
    buoys: { kind: 'ground', prop: 'pier', c: COL.amber },
    steps: { kind: 'ground', prop: 'cairn', c: COL.silver },
    glance: { kind: 'ground', prop: 'lighthouse', c: COL.violet },
    signpost: { kind: 'ground', prop: 'cairn', c: COL.amber },
    runes: { kind: 'ground', prop: 'clearing', c: COL.ice },
    fog: { kind: 'ground', prop: 'houses', c: COL.silver },
    summit: { kind: 'summit', prop: 'summit', c: COL.glow },
  };

  function Terrain() {
    const T = { segs: [], i: 0 };
    T.seg = x => {
      const s = T.segs;
      if (!s.length) return null;
      let i = clamp(T.i, 0, s.length - 1);
      while (i > 0 && x < s[i].x0) i--;
      while (i < s.length - 1 && x >= s[i].x1) i++;
      T.i = i;
      return s[i];
    };
    T.h = x => {
      const g = T.seg(x);
      if (!g) return 0;
      if (x >= g.x1) return g.kind === 'hill' ? g.b1 : g.kind === 'ease' ? g.b1 : g.b0;
      if (x < g.x0) return g.b0;
      const s = (x - g.x0) / (g.x1 - g.x0);
      if (g.kind === 'flat') return g.b0;
      if (g.kind === 'ease') return g.b0 + (g.b1 - g.b0) * (1 - Math.cos(PI * s)) / 2;
      if (g.kind === 'swell') return g.b0 + (g.b1 - g.b0) * s + g.A * Math.sin(2 * PI * s * g.n);
      return s < g.c ? g.b0 + (g.A - g.b0) * (1 - Math.cos(PI * s / g.c)) / 2 : g.b1 + (g.A - g.b1) * (1 + Math.cos(PI * (s - g.c) / (1 - g.c))) / 2;
    };
    T.d = x => T.h(x + 0.5) - T.h(x - 0.5);
    T.d2 = x => T.h(x + 1) - 2 * T.h(x) + T.h(x - 1);
    T.end = () => (T.segs.length ? T.segs[T.segs.length - 1].x1 : 0);
    T.endH = () => { const g = T.segs[T.segs.length - 1]; return g ? (g.kind === 'flat' ? g.b0 : g.b1) : 0; };
    T.add = g => { g.x1 = g.x0 + g.len; T.segs.push(g); return g; };
    T.trim = x => { while (T.segs.length > 3 && T.segs[0].x1 < x) { T.segs.shift(); T.i = Math.max(0, T.i - 1); } };
    return T;
  }

  function stepBody(b, hold, P, T, dt, o = {}) {
    const vmax = P.vmax * (o.fever ? 1.12 : 1), vmin = o.vmin ?? P.vmin;
    b.ev = null;
    if (!b.air) {
      const d = T.d(b.x), th = Math.atan(d), g = P.g * (hold ? P.hold : 1);
      b.v += -g * Math.sin(th) * dt;
      if (b.v < vmin) b.v = vmin;
      if (b.v > vmax) b.v -= (b.v - vmax) * 1.5 * dt;
      const kap = T.d2(b.x) / Math.pow(1 + d * d, 1.5);
      const can = !o.noLaunch && d > -0.02 && d < (P.ld ?? 0.25) && -kap * b.v * b.v > P.glide * Math.cos(th);
      b.can = can;
      if (can && !hold) {
        const boost = (P.boost + (o.extra || 0)) * (rm() ? 0.5 : 1);
        b.air = true; b.vx = b.v * Math.cos(th); b.vy = b.v * Math.sin(th) + boost * b.v; b.apex = b.y; b.from = b.x; b.airT = 0;
        b.ev = 'launch';
      } else { b.x += b.v * Math.cos(th) * dt; b.y = T.h(b.x); }
      b.ang = th;
      return b;
    }
    b.airT += dt;
    b.vy -= (hold || o.force ? P.g * P.dive * (o.force ? 1.6 : 1) : P.glide) * dt;
    if (!hold && !o.force) b.vy = Math.max(b.vy, -P.sink);
    if (o.cap != null && b.y > o.cap) b.vy = Math.min(b.vy, 0);
    b.vx = Math.max(b.vx, 0.8 * vmin);
    const sp = Math.hypot(b.vx, b.vy), cap = 1.2 * vmax;
    if (sp > cap) { b.vx *= cap / sp; b.vy *= cap / sp; }
    b.x += b.vx * dt; b.y += b.vy * dt;
    b.apex = Math.max(b.apex, b.y);
    b.ang = Math.atan2(b.vy, b.vx);
    const h = T.h(b.x);
    if (b.y <= h) {
      const s = T.d(b.x), n = Math.hypot(1, s), tx = 1 / n, ty = s / n, spd = Math.hypot(b.vx, b.vy);
      const ang = Math.acos(clamp((b.vx * tx + b.vy * ty) / Math.max(1e-6, spd), -1, 1)) * 180 / PI;
      b.air = false; b.y = h; b.land = { ang, spd, along: Math.max(b.vx * tx + b.vy * ty, 0), airT: b.airT };
      b.v = Math.max(b.land.along, vmin);
      b.ev = 'land';
    }
    return b;
  }

  function predictLand(b, T, P, diveT) {
    let x = b.x, y = b.y, vx = b.vx, vy = b.vy;
    const dt = 0.04;
    for (let i = 0; i < 70; i++) {
      const hold = i * dt < diveT;
      vy -= (hold ? P.g * P.dive : P.glide) * dt;
      if (!hold) vy = Math.max(vy, -P.sink);
      x += vx * dt; y += vy * dt;
      const h = T.h(x);
      if (y <= h) {
        const s = T.d(x), ang = Math.abs(Math.atan2(vy, vx) - Math.atan(s)) * 180 / PI;
        return { x, ang, up: s > 0.02 };
      }
    }
    return { x, ang: 90, up: true };
  }

  function botHold(b, T, P, hill, tap = 0.35) {
    if (!b.air) {
      b.botDive = false;
      if (P.m === 'fatigue' && hill?.crestX != null && b.x < hill.crestX) {
        const left = (hill.crestX - b.x) / Math.max(30, b.v * Math.cos(b.ang));
        if (left < tap && left > 0) return true;
      }
      return T.d(b.x) < -0.03;
    }
    if (b.vy > 0) { b.botLast = false; return false; }
    b.botN = (b.botN || 0) + 1;
    if (b.botN % 3 && b.botLast != null) return b.botLast;
    const score = q => q.ang + (q.up ? 40 : 0);
    let best = 0, bs = score(predictLand(b, T, P, 0));
    for (const d of [0.08, 0.16, 0.28, 0.45, 0.7]) { const sc = score(predictLand(b, T, P, d)); if (sc + 2 < bs) { bs = sc; best = d; } }
    b.botLast = best > 0;
    return b.botLast;
  }

  const SK = { L0: 0.3, CAP: 0.12 };
  const lerpG = (a, b, d) => a * Math.pow(b / a, d);

  A.Traverse = {
    STATIONS, MODE, Terrain, stepBody, botHold, predictLand,
    cur: null,
    create(s) { const t = make(s); A.Traverse.cur = t; return t; },
  };

  function make(s) {
    const V = s.V;
    const T = Terrain();
    const unit = () => { const H = A.World?.size?.().H; return H ? H / 844 : 1; };
    const W0 = () => { const z = A.World?.size?.(); return z?.W ? z.W / unit() : 390; };
    const forceMode = () => (['calm', 'flow', 'wake', 'fatigue', 'rest'].includes(A.config?.forceRide) ? A.config.forceRide : null);
    const curMode = () => forceMode() || s.mode || 'flow';
    const kOf = m => (s.intensity ? s.intensity(m) : 0.4);

    const b = { x: 0, y: 0, v: 0, vx: 0, vy: 0, air: false, ang: 0, apex: 0, airT: 0 };
    const ghost = { x: 0, y: 0, v: 0, vx: 0, vy: 0, air: false, ang: 0, apex: 0, airT: 0 };
    const lv = (() => {
      const t = A.Skill?.task ? A.Skill.task('ride') : { L: SK.L0, n: 0 };
      return { t, Ls: t.L, Lsess: t.L, L_start: t.L, n: t.n || 0 };
    })();

    const st = {
      state: 'core', at: A.now(), held: false, prevHeld: false, botHeld: false, botQ: [], swallow: false, rideSwallow: false,
      pressTs: null, releaseTs: null, kindle: 0, kindleDone: null,
      station: null, plan: null, freeHills: 0, segHill: 0, motes: [], spray: [], trail: [], light: 0, fold: null,
      crouch: 0, spread: 0, squash: [1, 1], squashAt: -9, squashK: null, sit: 0, lift: 0, speed01: 0,
      cam: { x: 0, y: 0, z: 1, vx: 0, vy: 0 }, nudge: null, dawnT: 0, dawnHeld: 0, lastTouch: A.now(), giveTick: 0,
      chain: { n: 0, tier: 0, at: 0, max: 0, tierMax: 0 }, fever: 0, perfRun: 0, popGrade: null, popBonus: 0,
      lastDecision: null, gapMax: 0, gaps: 0, lastInput: A.now(), idleMax: 0, hill: null, hillGrades: [], noTouchHills: 0, ghostAt: -9, tut: true,
      daylight: 0, kick: null, eyesBright: false, tickAt: 0, calmPressAt: null, moteStep: 0, moteHapAt: 0, crestSeen: null,
      rec: { seconds: 0, holds: 0, hold_s: 0, air_s: 0, motes: 0, silk: 0, kicks: 0, restHeld: 0, restN: 0, dawn_hold_s: 0, dawn_s: 0, launches: 0 },
      dda: { hills: 0, oSum: 0, ds: [], grades: { perfect: 0, good: 0, barely: 0, missed: 0 }, rough: 0, pops: 0, highLines: 0, gullyClear: 0, gullyDip: 0, fevers: 0 },
      lastSeg: null, pierEnd: 0, bankX: 0, firstDown: null,
    };

    const assist = () => !!A.Skill?.sess && !!A.Skill.checkAssist?.();
    const ddaD = (cat) => {
      const m = st.hill?.m || curMode(), k = st.hill?.k ?? kOf(m);
      const D = m === 'calm' ? -0.3 * k : m === 'wake' && cat === 'tempo' ? 0.15 * (k - 0.5) : m === 'fatigue' && cat === 'tempo' ? 0.2 * (k - 0.5) : 0;
      const ramp = st.hill ? st.hill.ramp : 0;
      return clamp(lv.Ls + ramp + D + (assist() ? -0.15 : 0), 0, 1);
    };
    const AX = {
      silkF: () => lerpG(1.3, 0.55, ddaD('precision')) * (assist() ? 1.3 : 1),
      popW: () => lerpG(0.18, 0.06, ddaD('tempo')) * (assist() ? 1.25 : 1),
      radius: () => lerp(22, 15, ddaD('precision')),
      chainW: () => lerpG(3.0, 1.8, ddaD('tempo')) + (assist() ? 1 : 0),
      highF: d => lerp(1.0, 1.25, d),
      kick: () => { const d = ddaD('tempo'), a = assist() ? 1.25 : 1; return [lerpG(0.06, 0.035, d) * a, lerpG(0.12, 0.07, d) * a, lerpG(0.18, 0.11, d) * a]; },
      calmW: () => lerpG(0.8, 0.25, ddaD('precision')) * (assist() ? 1.25 : 1),
    };

    const decision = (now, kind) => {
      if (st.lastDecision != null && st.state === 'ride' && (st.hill?.m || curMode()) !== 'calm') {
        const gap = now - st.lastDecision;
        if (gap > st.gapMax) st.gapMax = gap;
        if (gap > 2) st.gaps++;
      }
      st.lastDecision = now;
      st.lastKind = kind;
    };

    const chainStep = (now, n = 1) => {
      const c = st.chain;
      if (c.n && now - c.at > AX.chainW()) chainDrop();
      c.n += n; c.at = now;
      const tier = c.n >= 10 ? 3 : c.n >= 6 ? 2 : c.n >= 3 ? 1 : 0;
      if (tier > c.tier) { A.J?.stinger?.(); }
      c.tier = tier; c.max = Math.max(c.max, c.n); c.tierMax = Math.max(c.tierMax, tier);
    };
    const chainDrop = () => {
      const c = st.chain, floors = [0, 3, 6, 10];
      c.n = floors[Math.max(0, c.tier - 1)]; c.tier = Math.max(0, c.tier - 1);
    };
    const grade = (now, g, kind) => {
      const o = { perfect: 1, good: 0.8, barely: 0.4, missed: 0 }[g];
      st.hillGrades.push(o);
      st.dda.grades[g]++;
      decision(now, kind);
      if (g === 'perfect' || g === 'good') chainStep(now);
      return o;
    };

    const fx = (x, y, n, c, sp, life, size, o = {}) => {
      if (rm() && !o.always) return;
      for (let i = 0; i < n; i++) {
        const a = (o.dir ?? PI / 2) + (R() - 0.5) * (o.spread ?? 1.4), v = sp * (0.4 + 0.6 * R());
        st.spray.push({ x, y, vx: Math.cos(a) * v + (o.vx || 0), vy: Math.sin(a) * v, life, age: 0, size, c, g: o.g ?? 160 });
      }
      if (st.spray.length > 90) st.spray.splice(0, st.spray.length - 90);
    };

    function newHill(P, o = {}) {
      const x0 = T.end(), irr = o.irr || 0, bag = () => (R() * 2 - 1);
      let L = P.L * (1 + irr * 0.25 * bag()), Ah = P.A * (1 + irr * 0.3 * bag());
      if (P.m === 'calm') {
        const per = [6, 7.5, 9, 10][Math.min(3, st.calmIdx || 0)] + (P.k > 0.6 ? 1 : 0);
        st.calmIdx = (st.calmIdx || 0) + 1;
        L = Math.min(1300, per * P.Lk);
      }
      if (P.m === 'wake') L *= 1 - 0.15 * clamp(lv.Ls, 0, 1);
      if (o.fell) Ah = P.A * 1.6;
      if (o.low) Ah *= 0.6;
      const g = T.add({ kind: 'hill', x0, len: L, b0: T.endH(), A: Ah, b1: o.b1 ?? 0, c: P.c, P, m: P.m, k: P.k, ramp: o.ramp || 0, approach: !!o.approach, motes: [], crestX: x0 + L * P.c, crestH: Ah, idx: st.hillN = (st.hillN || 0) + 1 });
      if (P.m === 'fatigue') g.post = true;
      return g;
    }

    function biome(m) { return { calm: 'sauna', flow: 'forest', wake: 'lake', fatigue: 'shore', rest: 'harbour' }[m] || 'forest'; }
    function chunk(type, x0, x1) {
      const u = unit(), cs = V.chunks;
      const last = cs[cs.length - 1];
      if (last && last.type === type && Math.abs(last.x1 - x0 * u) < 2) { last.x1 = x1 * u; return; }
      cs.push({ type, x0: x0 * u, x1: x1 * u, seed: Math.floor(R() * 1e6) });
      while (cs.length > 8 && cs[1].x1 < V.worldX - 400 * u) cs.shift();
    }

    function runGhost(seg) {
      const P = seg.P || MODE(curMode());
      const path = [];
      let guard = 0, airStart = null;
      const flights = [];
      while (ghost.x < seg.x1 && guard++ < 6000) {
        stepBody(ghost, botHold(ghost, T, P), P, T, DT, { noLaunch: true });
        if (ghost.ev === 'launch') airStart = { x: ghost.x, t: guard };
        if (ghost.ev === 'land' && airStart) { flights.push({ x0: airStart.x, x1: ghost.x, dur: (guard - airStart.t) * DT, apex: ghost.apex }); airStart = null; }
        if (!path.length || ghost.x - path[path.length - 1][0] >= 4) path.push([ghost.x, ghost.y, ghost.air]);
      }
      return { path, flights };
    }

    function placeMotes(seg, gp) {
      if (!seg.P || seg.P.m === 'rest' || seg.kind !== 'hill' || seg.fell || seg.gully) return;
      seg.motes = seg.motes || [];
      // the rider never launches, so orbs sit on the ground path only (skip the ghost's air arc and a landing margin after it)
      let lastAir = -Infinity;
      const P = seg.P, n = P.motes, lantern = 20, path = gp.path.filter(p => { if (p[2]) { lastAir = p[0]; return false; } return p[0] - lastAir > 60; }).map(p => [p[0], T.h(p[0]), false]);
      if (path.length < 4) return;
      const along = [0];
      for (let i = 1; i < path.length; i++) along.push(along[i - 1] + Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]));
      const at = d => { let i = 1; while (i < along.length - 1 && along[i] < d) i++; const q = (d - along[i - 1]) / Math.max(1e-6, along[i] - along[i - 1]); return [lerp(path[i - 1][0], path[i][0], q), lerp(path[i - 1][1], path[i][1], q), path[i][2]]; };
      const idxX = x => { let i = 0; while (i < path.length - 1 && path[i][0] < x) i++; return along[i]; };
      const lines = [];
      const fl = gp.flights[0];
      const c = seg.approach && st.station?.c ? st.station.c : null;
      if (fl && fl.dur > 0.35) {
        const mid = (idxX(fl.x0) + idxX(fl.x1)) / 2;
        lines.push([mid, Math.ceil(n / 2)]);
        lines.push([idxX(seg.x0 + (seg.x1 - seg.x0) * 0.08), Math.floor(n / 2)]);
      } else {
        lines.push([idxX(seg.crestX + (seg.x1 - seg.crestX) * 0.4), Math.ceil(n / 2)]);
        lines.push([idxX(seg.x0 + (seg.crestX - seg.x0) * 0.55), Math.floor(n / 2)]);
      }
      seg.lineN = 0;
      for (const [centre, k] of lines) {
        const id = ++st.lineId;
        for (let i = 0; i < k; i++) {
          const [x, y, air] = at(clamp(centre + (i - (k - 1) / 2) * 28, 0, along[along.length - 1]));
          seg.motes.push({ x, y: y + lantern - (air ? 0 : (T.d(x) < -0.02 ? 3 : 0)), w: 1, line: id, c, got: false, gone: 0 });
        }
        seg.lineN++;
      }
      if (fl && fl.dur > 2) {
        const [x, y] = at((idxX(fl.x0) + idxX(fl.x1)) / 2);
        const id = ++st.lineId;
        for (let i = 0; i < 3; i++) seg.motes.push({ x: x + (i - 1) * 24, y: y + lantern - 46, w: 1, line: id, cluster: true, got: false, gone: 0 });
        const id2 = ++st.lineId;
        for (let i = 0; i < 3; i++) seg.motes.push({ x: x + (i - 1) * 24, y: y + lantern + 36, w: 1.5, line: id2, cluster: true, got: false, gone: 0 });
      }
      if (fl && seg.high) {
        const crest = seg.crestH, hf = AX.highF(ddaD('precision')), apex = Math.max(fl.apex, crest + 20), xa = gp.path.find(p => p[1] >= fl.apex - 0.5)?.[0] ?? (fl.x0 + fl.x1) / 2;
        const id = ++st.lineId, nH = 4;
        for (let i = 0; i < nH; i++) {
          const dx = (i - (nH - 1) / 2) * 26, q = dx / Math.max(60, (fl.x1 - fl.x0) / 2);
          seg.motes.push({ x: xa + dx, y: crest + (apex - crest) * hf * 1.12 * (1 - 0.5 * q * q) + lantern, w: 3, line: id, high: true, got: false, gone: 0 });
        }
        seg.highLine = id;
      }
      const ids = new Set(seg.motes.map(m => m.line));
      seg.lines = Object.fromEntries([...ids].map(id => [id, seg.motes.filter(m => m.line === id).length]));
    }

    function gen(horizon) {
      let guard = 0;
      while (T.end() < horizon && guard++ < 20) {
        const m0 = curMode(), m = m0 === 'rest' ? 'calm' : m0, k = kOf(m), P = MODE(m, k), plan = st.plan;
        if (st.state === 'drift' || plan?.kind === 'drift') {
          const g = T.add({ kind: 'swell', x0: T.end(), len: 600, b0: T.endH(), b1: T.endH() - 12, A: 5, n: 2, P: MODE('rest'), m: 'rest', drift: true });
          chunk('harbour', g.x0, g.x1);
          continue;
        }
        if (plan?.kind === 'summit' && plan.hills <= 0 && !plan.fellDone) {
          const fell = newHill(P, { fell: true });
          fell.kind = 'ease'; fell.b1 = fell.A; fell.len = clamp(fell.len * 0.5, 280, 420); fell.x1 = fell.x0 + fell.len; fell.fell = true; fell.crestX = fell.x1;
          ghostRun(fell);
          const lid = ++st.lineId;
          fell.motes = [];
          for (let x = fell.x0 + 50; x < fell.x1 - 20; x += 34) fell.motes.push({ x, y: T.h(x) + 22, w: 1, line: lid, c: COL.gold, got: false, gone: 0 });
          fell.lines = { [lid]: fell.motes.length };
          const plat = T.add({ kind: 'flat', x0: T.end(), len: 160, b0: fell.A, P, m, summit: true, station: { id: 'summit', ...STATIONS.summit, kind: 'summit' } });
          T.add({ kind: 'ease', x0: T.end(), len: 900, b0: fell.A, b1: fell.A - 260, P, m });
          chunk(biome(m), fell.x0, T.end());
          plan.fellDone = true; plan.plateau = plat;
          continue;
        }
        if (plan?.fellDone) return;
        if (plan && plan.hills > 0) {
          plan.hills--;
          const last = plan.hills === 0;
          const approach = last && plan.kind === 'task';
          const ramp = Math.min(0.12, 0.04 * (plan.done || 0)) + (plan.kind === 'summit' && plan.hills < 2 ? 0.2 : 0);
          plan.done = (plan.done || 0) + 1;
          const d = clamp(lv.Ls + ramp, 0, 1);
          const g = newHill(P, { irr: m === 'calm' ? 0 : lerp(0, 1, d), approach, ramp, b1: approach ? BENCH : 0, low: approach && m === 'wake' });
          g.high = m !== 'calm' && !approach && ((m === 'wake') || (m === 'flow' && d >= 0.25 && g.idx % 2 === 0) || (m === 'fatigue' && g.idx % 3 === 0) || (plan.kind === 'summit' && plan.hills === 0));
          ghostRun(g);
          chunk(biome(m), g.x0, g.x1);
          if (GULLIES && !approach && m !== 'calm' && m !== 'rest' && !assist() && d >=(m === 'fatigue' ? 0.6 : 0.4) && (d >= 0.8 ? g.idx % 2 === 0 : !plan.gully)) {
            plan.gully = true;
            const w = lerp(60, 140, clamp((d - 0.4) / 0.6, 0, 1));
            const gl = T.add({ kind: 'hill', x0: T.end(), len: w, b0: 0, A: -26, b1: 0, c: 0.5, P, m, gully: true });
            ghostRun(gl);
            chunk(biome(m), gl.x0, gl.x1);
          }
          continue;
        }
        if (plan && plan.kind === 'task' && plan.hills === 0 && !plan.stationDone) {
          const bench = T.add({ kind: 'flat', x0: T.end(), len: 260, b0: BENCH, P, m, station: st.station = { id: null, kind: 'ground', c: null, lit: 0, x: 0 } });
          st.station.seg = bench;
          st.station.x = bench.x1 - 8;
          const rmp = T.add({ kind: 'ease', x0: T.end(), len: 280, b0: BENCH, b1: 0, P, m, ramp: true });
          chunk(biome(m), bench.x0, rmp.x1);
          ghost.x = rmp.x0; ghost.y = BENCH; ghost.v = 0.6 * P.vmin; ghost.air = false;
          ghostRun(rmp);
          const lid = ++st.lineId;
          rmp.motes = [];
          for (let x = rmp.x0 + 60; x < rmp.x1 - 30; x += 40) rmp.motes.push({ x, y: T.h(x) + 17, w: 1, line: lid, got: false, gone: 0 });
          rmp.lines = { [lid]: rmp.motes.length };
          plan.stationDone = true; st.freeHills = 0;
          continue;
        }
        if (st.freeHills >= 1) return;
        st.freeHills++;
        const g = newHill(P, { irr: m === 'calm' ? 0 : lv.Ls, free: true });
        g.free = true;
        ghostRun(g);
        chunk(biome(m), g.x0, g.x1);
      }
    }

    function ghostRun(seg) {
      if (ghost.x < seg.x0 - 1 || ghost.x > seg.x0 + 1) { ghost.x = seg.x0; ghost.y = T.h(seg.x0); ghost.air = false; ghost.v = Math.max(ghost.v, (seg.P || MODE('flow')).vmin * 1.3); }
      const gp = runGhost(seg);
      seg.ghostFlights = gp.flights;
      placeMotes(seg, gp);
    }

    function setupStart() {
      const W = W0(), u = unit();
      st.pierEnd = 0.07 * W; st.bankX = 0.31 * W;
      T.segs.length = 0;
      T.add({ kind: 'flat', x0: -900, len: 900 + st.bankX, b0: 0, P: MODE('flow'), pier: true });
      T.add({ kind: 'ease', x0: T.end(), len: 50, b0: 0, b1: 60, P: MODE('flow'), bank: true });
      const down = T.add({ kind: 'ease', x0: T.end(), len: 420, b0: 60, b1: 0, P: MODE('flow'), firstDown: true });
      st.firstDown = down;
      V.chunks = [
        { type: 'harbour', x0: -1100 * u, x1: st.bankX * u, seed: 1, pierEnd: st.pierEnd * u, boatX: (st.pierEnd + st.bankX) / 2 * u },
        { type: 'shore', x0: st.bankX * u, x1: T.end() * u, seed: 7 },
      ];
      ghost.x = down.x0; ghost.y = 60; ghost.v = 150; ghost.air = false;
      st.lineId = 0;
      const gp = runGhost(down);
      const P = MODE('flow');
      down.P = P; down.motes = [];
      for (let i = 0; i < 6; i++) { const x = down.x0 + 60 + i * 28; down.motes.push({ x, y: T.h(x) + 18, w: 1, line: 0, got: false, gone: 0 }); }
      down.lines = { 0: 6 };
      b.x = 0; b.y = 0; b.v = 0; b.air = false;
      V.worldX = 0;
    }

    function syncV(now) {
      const u = unit();
      V.terrain = wx => T.h(wx / u);
      V.worldX = b.x * u;
      const surf = T.h(b.x);
      const P = st.lastSeg?.P || MODE(curMode());
      st.speed01 = clamp(((b.air ? Math.hypot(b.vx, b.vy) : b.v) - P.vmin) / Math.max(1, P.vmax - P.vmin), 0, 1);
      const sq = st.squashK ? squashAt(now) : [1, 1];
      V.ride = {
        state: st.state, air: b.air ? Math.max(0, b.y - surf) : 0, angle: b.air ? clamp(b.ang, -0.7, 0.7) * 0.7 : b.ang,
        crouch: st.crouch, spread: st.spread, squash: sq, sit: st.sit, lift: st.lift, speed01: st.speed01,
      };
      V.walking = st.state === 'run';
      V.stride = st.state === 'run' ? 1.8 : 0;
      V.daylightRide = st.daylight;
      V.cam = { x: st.cam.x, y: st.cam.y, z: 1 };
    }

    function squashAt(now) {
      const q = st.squashK, p = (now - st.squashAt) / q[2];
      if (p >= 1 || rm()) { st.squashK = null; return [1, 1]; }
      const e = Math.sin(PI * p);
      return [lerp(1, q[0], e), lerp(1, q[1], e)];
    }
    const squash = (now, sx, sy, dur) => { st.squashAt = now; st.squashK = [sx, sy, dur]; };

    const lanternW = () => {
      const u = unit(), z = A.World?.size?.(), [lx, ly] = A.World?.lanternPos?.() || [0, 0];
      if (!z?.W) return [b.x + 12, b.y + 20];
      return [b.x + (lx - z.fx) / u, (z.gy - ly) / u];
    };

    function collect(now, seg) {
      if (!ORBS || !seg?.motes?.length) return;
      const [lx, ly] = lanternW(), r = AX.radius() * (st.state === 'ride' ? 1 : 1.6);
      for (const m of seg.motes) {
        if (m.got || m.missed) continue;
        if (m.x < lx - 60) { m.missed = true; m.gone = now; continue; }
        if (Math.hypot(m.x - lx, m.y - ly) <= r) {
          m.got = now; m.from = [m.x, m.y];
          const w = m.w * (st.fever > now ? 2 : 1);
          st.light += w; st.rec.motes++;
          seg.gotLine = seg.gotLine || {};
          seg.gotLine[m.line] = (seg.gotLine[m.line] || 0) + 1;
          if (now - st.moteHapAt > 0.14) { hap('tick'); st.moteHapAt = now; }
          sfx('ride_mote', { step: st.moteStep++ });
          s.kick(0.12 + 0.05 * Math.min(4, st.chain.tier));
          decision(now, 'mote');
          if (seg.gotLine[m.line] === seg.lines?.[m.line]) {
            if (m.high) { st.dda.highLines++; chainStep(now); hap('light'); }
            else chainStep(now);
            if (seg.approach) st.carry = true;
          }
        }
      }
    }

    const tickHold = (now, dt) => {
      st.held = s.auto ? st.botHeld : (A.Input.holding() && !st.rideSwallow);
      if (st.rideSwallow && !A.Input.holding()) st.rideSwallow = false;
      if (A.Input.holding() && !s.auto) st.lastTouch = now;
    };

    function edges(now) {
      const down = st.held && !st.prevHeld, up = !st.held && st.prevHeld;
      st.prevHeld = st.held;
      const pt = st.pressTs != null && now - st.pressTs < 0.08 ? st.pressTs : now, rt = st.releaseTs != null && now - st.releaseTs < 0.08 ? st.releaseTs : now;
      if (down || up) { st.lastInput = now; st.noTouchHills = 0; }
      return { down, up, pt, rt };
    }

    function rideHill(now) {
      const seg = T.seg(b.x);
      if (seg?.kind === 'hill' && !seg.gully && seg !== st.hill) {
        if (st.hill && st.hill.kind === 'hill') endHill(now);
        st.hill = seg; st.hillGrades = []; st.crestSeen = null; st.popGrade = null; st.popBonus = 0; st.moteStep = 0; st.pressGraded = false; st.launchedHill = false;
        st.valleyAt = b.air ? null : now;
        if (!st.touchedHill) st.noTouchHills++;
        st.touchedHill = false;
      }
      if (st.hill?.approach && st.station && !st.station.id) commit(now);
      return seg;
    }

    function endHill(now) {
      const h = st.hill;
      if (!h || h.ended || h.P?.m === 'rest') return;
      h.ended = true;
      const gs = st.hillGrades;
      if (!gs.length) return;
      const o = gs.reduce((a, x) => a + x, 0) / gs.length, p = h.m === 'calm' ? 0.8 : 0.78;
      const step = lv.n < 10 ? 0.08 : lv.n < 60 ? 0.04 : 0.025;
      st.dda.ds.push(clamp(lv.Ls + (h.ramp || 0), 0, 1));
      lv.Ls = clamp(lv.Ls + step * (o - p), 0, 1);
      const credit = A.Skill?.sess?.credit && !assist();
      if (credit) {
        lv.t.L = clamp(clamp(lv.t.L + step * (o - p), lv.Lsess - SK.CAP, lv.Lsess + SK.CAP), 0, 1);
        lv.t.n = (lv.t.n || 0) + 1; lv.t.last = new Date().toISOString().slice(0, 10);
        if (A.Skill.sess) A.Skill.sess.stored = true;
      }
      lv.n++;
      st.dda.hills++; st.dda.oSum += o;
    }

    function shiftAfter(seg, dx) {
      if (!dx) return;
      const i = T.segs.indexOf(seg), u = unit(), x0 = seg.x1;
      seg.len += dx; seg.x1 += dx;
      for (let j = i + 1; j < T.segs.length; j++) { const g = T.segs[j]; g.x0 += dx; g.x1 += dx; if (g.crestX != null) g.crestX += dx; for (const m of g.motes || []) m.x += dx; }
      for (const c of V.chunks) { if (c.x0 >= x0 * u - 1) c.x0 += dx * u; if (c.x1 >= x0 * u - 1) c.x1 += dx * u; }
      if (ghost.x >= x0) ghost.x += dx;
    }

    function commit(now) {
      const plan = s.planTask ? s.planTask(now) : null;
      const id = plan?.id || 'breath', def = STATIONS[id] || STATIONS.bells;
      const sta = st.station;
      Object.assign(sta, { id, kind: def.kind, prop: def.prop, art: def.art, aw: def.aw, c: def.c, committedAt: now });
      if (def.kind === 'sky') {
        const extra = 40 * def.cruiseS - (sta.seg.x1 - sta.seg.x0);
        if (extra > 0) shiftAfter(sta.seg, extra);
      }
      for (const m of st.hill?.motes || []) if (!m.cluster && !m.high) m.c = def.c;
    }

    function landGrade(now, land, P) {
      const silk = P.silk * AX.silkF();
      let g;
      if (land.ang <= 0.5 * silk) g = 'perfect';
      else if (land.ang <= silk) g = 'good';
      else if (land.ang <= 1.6 * silk) g = 'barely';
      else g = 'rough';
      const [lx, ly] = lanternW();
      if (g === 'perfect' || g === 'good') {
        b.v = land.spd * (1 + P.bonus);
        st.rec.silk++;
        squash(now, 1.15, 0.8, 0.12);
        st.streak = { at: now, x: b.x };
        hap(P.m === 'calm' ? 'tick' : 'light');
        if (g === 'perfect') { hap('tick'); st.perfRun++; fx(b.x, b.y + 4, 4, COL.glow, 60, 0.5, 2, { g: 0 }); } else st.perfRun = 0;
        sfx('ride_silk', { grade: g });
        if (st.perfRun >= 3 && st.fever < now) { st.fever = now + 4; st.dda.fevers++; st.perfRun = 0; hap('medium'); A.J?.stinger?.(); }
      } else {
        st.perfRun = 0;
        if (st.fever > now) st.fever = now;
        squash(now, 1.06, 0.9, 0.14);
        fx(b.x, b.y, g === 'rough' ? 8 : 4, COL.snow, 50, 0.6, 2.4, { spread: 2.4 });
        sfx('ride_land', { grade: g });
        if (g === 'rough') { b.v = Math.max(b.v * (assist() ? 0.9 : 0.75), P.vmin); st.dda.rough++; chainDrop(); }
      }
      grade(now, g === 'rough' ? 'missed' : g, 'land');
      return g;
    }

    function toDrift(now) {
      st.state = 'drift'; st.at = now; st.driftAt = now; st.pendingDrift = false;
      st.plan = { kind: 'drift', hills: 0 };
      st.station = null;
      const cut = T.segs.findIndex(g => g.x0 > b.x + 0.9 * W0());
      if (cut > 0) T.segs.length = cut;
      endHill(now);
    }

    function rideUpdate(now, dt, ed) {
      if ((curMode() === 'rest' || st.pendingDrift) && !b.air && !st.plan?.plateau) { toDrift(now); return; }
      const seg = rideHill(now) || T.seg(b.x);
      const hillP = (st.hill || seg)?.P || MODE(curMode());
      const P = seg?.P && seg.kind !== 'flat' ? seg.P : hillP;
      st.lastSeg = seg;
      const m = P.m;
      const sta = st.station;
      const nearStation = sta && sta.seg && b.x > sta.seg.x0 - 30;
      if (st.held) { st.touchedHill = true; }
      if (ed.down) {
        st.rec.holds++;
        if (!b.air) { hap('tick'); sfx('ride_press'); } else { hap('tick'); }
        if (m === 'calm') st.calmPressAt = ed.pt;
      }
      if (ed.up) sfx('ride_release');

      if (m === 'calm' && st.held && now - st.tickAt >= 1) { st.tickAt = now; hap('tick'); s.kick(0.08); }
      if (ed.up) st.lastRelease = ed.rt;
      if (ed.down) st.lastPress = ed.pt;

      const crestX = st.hill?.crestX, Wd = m === 'calm' ? AX.calmW() : AX.popW();
      const win = off => { const a = Math.abs(off); return a <= Wd / 2 ? 'perfect' : a <= Wd ? 'good' : a <= 2 * Wd ? 'barely' : 'missed'; };
      if (st.hill && m !== 'fatigue' && m !== 'rest' && st.valleyAt != null && st.popGrade == null) {
        let gg = null;
        if (!st.held) { const off = (st.lastRelease ?? -99) - st.valleyAt; gg = win(off); if (gg === 'missed') gg = 'barely'; }
        else if (crestX != null && b.x >= crestX - 5) gg = 'missed';
        if (gg) {
          st.popGrade = gg; grade(now, gg, m === 'calm' ? 'calm_release' : 'pop'); st.dda.pops++;
          if (gg === 'perfect' || gg === 'good') { if (m === 'calm') s.kick(0.3); else st.popBonus = 0.06; }
        }
      }
      if (st.hill && !b.air && crestX != null && st.crestSeen == null && b.x >= crestX) st.crestSeen = now;
      if (st.crestSeen != null && !st.pressGraded && !st.launchedHill && m !== 'rest') {
        const lp = st.lastPress ?? -99;
        if (st.held && lp >= st.crestSeen - 2 * Wd) { st.pressGraded = true; const gg = win(lp - st.crestSeen); grade(now, gg, 'press'); if (m === 'calm' && gg !== 'missed') s.kick(0.3); }
        else if (now - st.crestSeen > 2 * Wd) { st.pressGraded = true; grade(now, 'missed', 'press'); }
      }

      if (m === 'fatigue' && st.hill && crestX != null) fatigueBeat(now, ed, P);

      const o = { fever: st.fever > now && m !== 'calm', noLaunch: true, extra: st.popBonus + (st.kickBoost || 0), vmin: seg?.fell || seg?.summit ? Math.max(P.vmin, 110) : undefined };
      if (rm()) o.cap = (st.hill?.crestH ?? 0) + 120;
      if (nearStation && b.air) o.force = true;
      const steps = Math.max(1, Math.round(dt / DT)), h = dt / steps;
      let launched = false, landed = null;
      for (let i = 0; i < steps; i++) {
        stepBody(b, st.held, P, T, h, o);
        if (b.ev === 'launch') launched = true;
        if (b.ev === 'land') landed = { ...b.land };
        if (st.held) st.rec.hold_s += h;
        if (b.air) st.rec.air_s += h;
      }
      if (launched) {
        st.rec.launches++; st.launchedHill = true;
        st.kickBoost = 0;
        squash(now, 0.92, 1.12, 0.1);
        fx(b.x, b.y, 6, COL.snow, 70, 0.7, 2, { dir: PI / 2 + 0.4 });
        sfx('ride_launch');
        st.flightFrom = now;
      }
      if (landed) {
        landGrade(now, landed, P);
      }
      if (b.air && P.m === 'wake' && b.y - (st.hill?.crestH ?? 0) > 150 && !st.bigHap) { st.bigHap = true; hap('medium'); }
      if (!b.air) st.bigHap = false;

      const gseg = T.segs.find(g => g.gully && b.x >= g.x0 && b.x < g.x1);
      if (gseg && !gseg.judged) {
        if (b.x > gseg.x0 + (gseg.x1 - gseg.x0) / 2) {
          gseg.judged = true;
          if (b.air) { st.dda.gullyClear++; chainStep(now); decision(now, 'gully'); fx(b.x, T.h(b.x) + 2, 8, COL.ice, 50, 0.8, 1.8, { g: 0 }); }
          else { st.dda.gullyDip++; fx(b.x, b.y, 6, COL.snow, 40, 0.7, 2.4); }
        }
      }

      for (const g of T.segs) if (g.motes?.length && g.x1 > b.x - 100 && g.x0 < b.x + 100) collect(now, g);

      if (!b.air && st.held && st.speed01 > 0.35 && !rm() && R() < 0.5) fx(b.x - 4, b.y + 1, 1, COL.snow, 40, 0.5, 1.6, { dir: PI * 0.85, spread: 0.6 });

      if (st.chain.n && now - st.chain.at > AX.chainW()) { chainDrop(); st.chain.at = now; }

      const stopX = sta?.seg ? sta.seg.x1 - 60 : 0;
      if (sta && sta.id && !b.air && b.x >= sta.seg.x0 - 10 && (sta.kind === 'sky' ? b.x >= sta.seg.x0 + 12 : b.x >= stopX - b.v * 0.2)) {
        st.state = 'arrive'; st.at = now; st.arriveV = b.v; st.arriveX = b.x;
        st.tgtV = sta.kind === 'sky' ? 40 : 0;
        fx(b.x, b.y, 8, COL.snow, 60, 0.6, 2.2, { dir: PI * 0.8, spread: 0.8 });
        hap('light');
        endHill(now);
      }
      if (st.plan?.plateau && b.x >= st.plan.plateau.x0 + 10 && !b.air) {
        st.state = 'arrive'; st.at = now; st.arriveV = b.v; st.arriveX = b.x; st.tgtV = 0; st.summit = true;
        hap('light'); endHill(now);
      }
    }

    function fatigueBeat(now, ed, P) {
      const h = st.hill, bpm = 84 + 12 * (h.k ?? 0), beat = 60 / bpm, vx = b.air ? b.vx : b.v * Math.cos(b.ang);
      if (h.kickDone) return;
      const tp = now + (h.crestX - b.x) / Math.max(30, vx);
      h.tp = h.tp == null ? tp : lerp(h.tp, tp, 0.2);
      if (Eyes() && !h.bright) { h.bright = true; }
      for (const n of [2, 1]) {
        if (!h['ci' + n] && now >= h.tp - n * beat && b.x < h.crestX) { h['ci' + n] = true; hap(h.bright ? 'medium' : 'tick'); decision(now, 'countin'); }
      }
      const [wp, wg, wb] = AX.kick();
      if (ed.up && Math.abs(ed.rt - h.tp) <= wb && !h.kickDone) {
        const off = Math.abs(ed.rt - h.tp), gg = off <= wp ? 'perfect' : off <= wg ? 'good' : 'barely';
        h.kickDone = true; h.kickAt = now; h.kickGrade = gg;
        st.rec.kicks++;
        grade(now, gg, 'kick');
        st.daylight = Math.min(0.25, st.daylight + 0.04);
        hap('light'); sfx('ride_kick', { grade: gg });
        if (b.air) b.vy += 0.25 * b.v * (rm() ? 0.5 : 1); else st.kickBoost = 0.25;
        const gate = A.J?.flash?.request(0.06, 0.5);
        h.bloom = gate?.ok !== false ? now : null;
      } else if (b.x > h.crestX + Math.max(30, vx) * 0.2 && !h.kickDone) {
        h.kickDone = true; grade(now, 'missed', 'kick');
      }
    }
    const Eyes = () => !!A.Eyes?.closed && A.now() - A.Eyes.closedAt >= 1.5;

    function camera(now, dt) {
      const z = A.World?.size?.(), u = unit();
      const W = z?.W || 390, H = z?.H || 844;
      let tx = 0, ty = 0;
      const riding = ['ride', 'run', 'ready'].includes(st.state);
      if (riding && !rm()) {
        tx = -(0.05 * W + 0.07 * W * st.speed01);
        const alt = b.y * u;
        ty = clamp(alt - 0.22 * H, 0, 0.28 * H);
      }
      if (st.state === 'give' || st.state === 'summitStop') { tx = 0; ty = rm() ? 0 : clamp(b.y * u - 0.22 * H, 0, 0.28 * H) + 0.0 * H; }
      const w = riding ? (st.lastSeg?.P?.cam || 2.2) : st.state === 'arrive' || st.state === 'stage' ? 2.6 : 1.4;
      const c = st.cam;
      const kx = 1 - Math.exp(-w * dt * 1.6);
      c.x += (tx - c.x) * kx; c.y += (ty - c.y) * (1 - Math.exp(-w * dt * 2.2));
      if (rm()) { c.x = 0; c.y = 0; }
    }

    function pose(now, dt) {
      const ground = !b.air && ['ride', 'arrive'].includes(st.state);
      const crouchT = 0; // the character no longer crouches when the screen is pressed
      st.crouch = rm() ? ema(st.crouch, crouchT, dt, 0.06) : ema(st.crouch, crouchT, dt, crouchT > st.crouch ? 0.03 : 0.05);
      const spreadT = (st.state === 'ride' || st.state === 'run') && !st.held ? (b.air ? 1 : 0.55 + 0.4 * st.speed01) : 0.1;
      st.spread = ema(st.spread, spreadT, dt, 0.08);
      st.sit = ema(st.sit, st.state === 'drift' || st.state === 'sleep' ? 1 : 0, dt, 0.5);
      const liftT = st.state === 'give' ? (st.held ? 1 : 0.5) : 0;
      st.lift = ema(st.lift, liftT, dt, 0.25);
      const hk = A.World?.hooks?.lanternPose;
      if (hk && st.lift > 0.05) { hk(lerp(0.5, 1.45, st.lift)); st.posed = true; }
      else if (hk && st.posed) { hk(null); st.posed = false; }
    }

    function trail(now) {
      const [lx, ly] = lanternW(), tr = st.trail;
      if (!tr.length || Math.hypot(lx - tr[0][0], ly - tr[0][1]) > 6) tr.unshift([lx, ly]);
      const len = 40 + 160 * (1 - Math.exp(-st.light / 30)) * (1 + 0.15 * st.chain.tier);
      let acc = 0, i = 1;
      for (; i < tr.length; i++) { acc += Math.hypot(tr[i][0] - tr[i - 1][0], tr[i][1] - tr[i - 1][1]); if (acc > len) break; }
      tr.length = Math.min(tr.length, i + 1, 48);
    }

    const T_ = {
      T, b, st, lv,
      get state() { return st.state; },

      coreKindle(now, dt) {
        const held = s.auto ? true : A.Input.holding();
        st.kindleHeldNow = held;
        st.rec.restN++; if (held) st.rec.restHeld++;
        st.kindle = Math.min(1, st.kindle + dt / 6 * (held ? 1 : 0.5));
      },

      launch(now) {
        st.state = 'ready'; st.at = now;
        st.readyFrom = Math.max(now, s.coreHoldUntil || now);
        st.kindleDone = st.kindleDone ?? now;
      },

      go(now) {
        if (st.state !== 'ready') return;
        st.state = 'run'; st.at = now;
        hap('light');
        sfx('ride_go');
      },

      update(now, dt) {
        tickHold(now, dt);
        const ed = edges(now);
        if (st.state === 'core' && s.phase === 'rest' && !st.kindleStarted) st.kindleStarted = now;
        if (s.phase === 'checkin' && st.kindleDone == null) { st.kindleDone = now; }
        if (st.state === 'ready') {
          if (ed.down) T_.go(now);
        }
        if (st.state === 'run') {
          const t = now - st.at, P = MODE('flow');
          b.v = lerp(60, 200, clamp(t / 0.35, 0, 1));
          b.x += b.v * dt;
          if (b.x >= st.pierEnd) {
            st.state = 'ride'; st.at = now;
            b.air = true; b.vx = 240; b.vy = 135 * (rm() ? 0.8 : 1); b.y = 0; b.apex = 0; b.airT = 0;
            s.firstPlayAt = s.firstPlayAt ?? now;
            st.lastDecision = now; st.lastInput = now;
            squash(now, 0.92, 1.12, 0.12);
            fx(b.x, b.y, 6, COL.snow, 60, 0.6, 2);
            st.plan = null;
            T_.planNext(now);
            st.leapAt = now;
          }
        }
        if (st.state === 'ride') {
          gen(b.x + 1400);
          if (st.leapAt && b.air && b.x < st.bankX + 50) st.held = false;
          rideUpdate(now, dt, ed);
          st.rec.seconds += dt;
          if (now - st.lastInput > st.idleMax) st.idleMax = now - st.lastInput;
        } else if (st.state === 'arrive') {
          const t = (now - st.at) / 0.6, e = 1 - Math.pow(1 - clamp(t, 0, 1), 2);
          b.v = lerp(st.arriveV, st.tgtV, e);
          const sp = b.v;
          b.x += sp * dt; b.y = T.h(b.x); b.ang = Math.atan(T.d(b.x));
          if (sp > 30 && !rm() && R() < 0.6) fx(b.x - 3, b.y + 1, 1, COL.snow, 50, 0.5, 1.8, { dir: PI * 0.8, spread: 0.5 });
          if (t >= 1) {
            if (st.summit) { st.state = 'summitStop'; st.at = now; }
            else { st.state = 'stage'; st.at = now; st.arrivedAt = now; }
          }
        } else if (st.state === 'stage') {
          const sky = st.station?.kind === 'sky';
          if (sky) { b.v = 40; b.x += 40 * dt; b.y = T.h(b.x); }
          if (st.nudge) {
            const n = st.nudge, p = clamp((now - n.at) / n.dur, 0, 1), e = A.J?.ease?.inOut ? A.J.ease.inOut(p) : p;
            b.x = n.x0 + n.dx * e; b.y = T.h(b.x);
            if (p >= 1) st.nudge = null;
          }
          b.ang = ema(b.ang, 0, dt, 0.2);
        } else if (st.state === 'exit') {
          if (now >= st.exitAt && st.exitTap) {
            st.state = 'ride'; st.at = now;
            const P = MODE(curMode(), kOf(curMode()));
            b.air = false; b.v = 0.6 * P.vmin;
            if (A.Input.holding()) st.rideSwallow = true;
            st.lastDecision = now; st.lastInput = now;
            if (st.prevStation) st.prevStation.lit = now;
            st.prevStation = null;
          }
        } else if (st.state === 'drift') {
          gen(b.x + 1.6 * W0() + 200);
          const v = st.held ? 20 : 34;
          b.v = ema(b.v || 30, v, dt, 0.8); b.air = false;
          b.x += b.v * dt; b.y = T.h(b.x); b.ang = Math.atan(T.d(b.x));
          if (st.held) s.kick(0.04);
        } else if (st.state === 'give') {
          if (st.held) { st.rec.dawn_hold_s += dt; if (now - st.giveTick >= 1) { st.giveTick = now; hap('tick'); } }
        }
        if (['ride', 'arrive', 'stage', 'drift'].includes(st.state)) T.trim(b.x - 1.2 * W0() - 200);
        pose(now, dt);
        camera(now, dt);
        trail(now);
        for (const p of st.spray) { p.age += dt; p.vy -= p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; }
        st.spray = st.spray.filter(p => p.age < p.life);
        if (st.fold && now - st.fold.at > 0.6) st.fold = null;
        syncV(now);
      },

      planNext(now) {
        const p = s.planNext ? s.planNext(now) : { kind: 'task', hills: 1 };
        const cut = T.segs.findIndex(g => g.free && g.x0 > b.x + 0.9 * W0());
        if (cut > 0) T.segs.length = cut;
        const free = T.segs.filter(g => g.free && g.x0 > b.x);
        st.freeHills = 0;
        st.plan = { ...p, done: 0 };
        if (p.kind === 'summit') {
          st.plan.hills = Math.max(0, Math.round(clamp(p.seconds, 4, 12) / (SEC_HILL[curMode()] || 4)) - 1 - free.length);
          for (const g of free) g.free = false;
        } else if (p.kind === 'drift') {
          st.plan.hills = 0;
          if (st.state === 'exit' || st.state === 'stage') toDrift(now);
          else st.pendingDrift = true;
        } else {
          st.plan.hills = Math.max(0, (p.hills ?? 1) - free.length);
          for (const g of free) g.free = false;
          if (st.plan.hills === 0) {
            const g = free[free.length - 1], h0 = (g.motes || []).map(m => T.h(m.x));
            g.approach = true; g.b1 = BENCH; g.high = false;
            // raising the hill's end lifts the ground under its orbs; move them with it so riding still collects them
            (g.motes || []).forEach((m, i) => { m.y += T.h(m.x) - h0[i]; });
          }
        }
        gen(b.x + 1400);
      },

      handle(type, d) {
        const now = A.now();
        if (type === 'pdown' || type === 'key') { st.pressTs = d?.ts ?? d?.t ?? now; st.lastTouch = now; }
        if (type === 'pup') st.releaseTs = d?.ts ?? d?.t ?? now;
        const ph = s.phase;
        if (ph === 'rest' || ph === 'fadein') return type !== 'exit';
        if (ph === 'walk') {
          if (st.state === 'ready' && (type === 'pdown' || type === 'key')) T_.go(now);
          if (st.state === 'exit' && (type === 'pdown' || type === 'key')) st.exitTap = true;
          return true;
        }
        if (ph === 'dawn') return true;
        if (ph === 'game') {
          if (st.swallow) {
            if (type === 'pup') st.swallow = false;
            return true;
          }
          return false;
        }
        return false;
      },

      taskStart(g, now) {
        st.swallow = !s.auto && A.Input.holding();
        st.taskG = g;
        if (g.mode === 'rest' && st.state !== 'drift') toDrift(now);
        const carry = st.carry && g.kind === 'adaptive';
        st.carry = false;
        return carry;
      },

      arrived() {
        if (st.state === 'stage' && st.station?.id && !st.station.started) { st.station.started = true; return true; }
        if (st.state === 'drift' && st.plan?.kind === 'drift' && !st.plan.started && A.now() - st.driftAt > 1.4) { st.plan.started = true; return true; }
        return false;
      },

      atSummit() { return st.state === 'summitStop' && !st.dawnStarted; },

      stageOrigin() {
        const z = A.World?.size?.(), u = unit(), sta = st.station;
        if (!z?.W) return null;
        const px = sta?.seg ? sta.x : b.x + 120;
        const X = z.fx + (px - b.x) * u, Y = z.gy - (T.h(px) + (sta?.top || 80)) * u;
        return [clamp(X, 0, z.W), clamp(Y, 0, z.H)];
      },

      drawStage(ctx, box, g, alpha) {
        const J = A.J;
        if (!J?.sprite) return;
        const cx = box.x + box.w / 2, cy = box.y + box.h / 2, r = Math.max(box.w, box.h) * 0.62;
        J.sprite(ctx, 'soft', COL.night, cx, cy, r * 1.15, 0.7 * alpha, false, 1.05, 0.95);
      },

      resume(now, g, at) {
        st.state = 'exit'; st.exitAt = at; st.at = now; st.exitTap = s.auto;
        st.taskG = null;
        const z = A.World?.size?.();
        if (z) st.fold = { at: Math.max(now, at - 0.05), from: [z.W / 2, z.H * 0.35], c: st.station?.c || COL.glow };
        st.prevStation = st.station; st.station = null;
        const ps = st.prevStation;
        if (ps?.kind === 'sky' && ps.seg) shiftAfter(ps.seg, Math.min(0, b.x + 30 - ps.seg.x1));
        T_.planNext(now);
      },

      planSummit(now, seconds) { st.plan = { kind: 'summit', seconds, hills: Math.max(0, Math.round(clamp(seconds, 4, 12) / (SEC_HILL[curMode()] || 4)) - 1), done: 0 }; },

      dawn(now, dt) {
        if (!st.dawnStarted) {
          st.dawnStarted = now; st.dawnT = 0; st.state = st.state === 'drift' ? 'drift' : 'give'; st.giveFrom = now;
          if (st.state === 'drift') st.driftGive = true;
        }
        const idle = now - st.lastTouch;
        const held = s.auto ? st.botHeld : A.Input.holding();
        const rate = held ? 1 : idle > 3 ? 0.85 : 0.7;
        st.dawnT += dt * rate;
        st.rec.dawn_s += dt;
        if (held && st.state === 'drift') st.rec.dawn_hold_s += dt;
        return st.dawnT;
      },

      sleep() { st.state = 'sleep'; },
      nudge(dx, dur = 0.6) { st.nudge = { at: A.now(), dur, dx, x0: b.x }; },

      auto(dt) {
        const now = A.now(), prof = s.profile;
        let want = false;
        const P = st.lastSeg?.P || MODE(curMode());
        if (s.phase === 'walk' && st.state === 'ready' && now - st.at > 0.5) T_.go(now);
        let direct = null;
        if (st.state === 'ride') {
          want = botHold(b, T, P, null);
          const h = st.hill;
          if (P.m === 'fatigue' && h?.crestX != null && !b.air && !h.kickDone && h.tp != null) {
            h.botJ = h.botJ ?? (R() - 0.5) * (prof === 'bad_day' ? 0.24 : 0.12);
            const left = h.tp - now;
            if (left < 0.35 && left > -0.2) direct = prof === 'bad_day' && h.idx % 3 === 0 ? false : left > h.botJ;
          }
        } else if (st.state === 'give') want = true;
        else if (st.state === 'drift' && s.phase === 'dawn') want = true;
        const lag = prof === 'bad_day' ? 0.3 : 0;
        st.botQ.push([now, want]);
        while (st.botQ.length > 1 && st.botQ[1][0] <= now - lag) st.botQ.shift();
        const nh = direct ?? st.botQ[0][1];
        if (nh && !st.botHeld) st.pressTs = now;
        if (!nh && st.botHeld) st.releaseTs = now;
        st.botHeld = nh;
      },

      drawBack(ctx, env) { drawBack(ctx, env); },
      drawFront(ctx, env) { drawFront(ctx, env); },
      drawOver(ctx, now) { drawOver(ctx, now); },

      record() {
        const r = st.rec, d = st.dda, rd = x => Math.round(x * 1000) / 1000;
        return {
          v: 1, seconds: rd(r.seconds), holds: r.holds, hold_s: rd(r.hold_s), air_s: rd(r.air_s), motes: r.motes, silk_landings: r.silk, beat_kicks: r.kicks,
          gaps_over_2s: st.gaps, idle_max_s: rd(st.idleMax), rest_hold_ratio: r.restN ? rd(r.restHeld / r.restN) : null, rest_ui: 'kindle_v1',
          dawn_hold_s: rd(r.dawn_hold_s), dawn_s: rd(r.dawn_s),
          dda: {
            v: 1, L_start: rd(lv.L_start), L_end: rd(lv.t.L), d_mean: d.ds.length ? rd(d.ds.reduce((a, x) => a + x, 0) / d.ds.length) : null, d_max: d.ds.length ? rd(Math.max(...d.ds)) : null,
            hills: d.hills, o_mean: d.hills ? rd(d.oSum / d.hills) : null, grades: { ...d.grades }, rough_landings: d.rough, crest_pops: d.pops, high_lines: d.highLines,
            gullies_cleared: d.gullyClear, gullies_dipped: d.gullyDip, chain_max: st.chain.max, tier_max: st.chain.tierMax, fevers: d.fevers, decision_gap_max_s: rd(st.gapMax), assist: assist(),
          },
        };
      },

      debug() {
        return { state: st.state, v: Math.round(b.air ? Math.hypot(b.vx, b.vy) : b.v), alt: Math.round(b.y), air: b.air, x: Math.round(b.x), hill: st.hill?.idx ?? null, mode: st.lastSeg?.P?.m || curMode(), light: st.light, gaps: st.gaps, gapMax: Math.round(st.gapMax * 100) / 100, chain: st.chain.n, tier: st.chain.tier, held: st.held, station: st.station?.id ?? null, plan: st.plan?.kind ?? null, L: lv.Ls };
      },
    };

    function drawBack(ctx, env) {
      const now = A.now(), u = env.u;
      const X = wx => env.fx + (wx - b.x) * u, Y = h => env.gy - h * u;
      for (const g of T.segs) {
        if (g.post && g.crestX != null) {
          const x = X(g.crestX), y = Y(g.crestH);
          if (x < -40 || x > env.W + 40) continue;
          ctx.fillStyle = env.col(COL.wood, 'yellow', 1);
          ctx.fillRect(x - 1.8 * u, y - 40 * u, 3.6 * u, 42 * u);
          ctx.fillRect(x - 6 * u, y - 42 * u, 12 * u, 2.5 * u);
          const lit = g.kickAt ? clamp(1 - (now - g.kickAt) / 2.5, 0.5, 1) : g.bright ? 0.8 : 0.55;
          ctx.fillStyle = env.rgb([255, 243, 220], 0.85 * lit); ctx.fillRect(x - 3.5 * u, y - 52 * u, 7 * u, 9 * u);
          env.glow(ctx, x, y - 48 * u, 34 * u * (g.bright ? 1.3 : 1), COL.daylight, 0.4 * lit, 'soft');
          env.glow(ctx, x, y - 48 * u, 8 * u, COL.daylight, 0.95 * lit);
        }
        if (g.gully) {
          const x0 = X(g.x0), x1 = X(g.x1);
          if (x1 < -20 || x0 > env.W + 20) continue;
          ctx.fillStyle = env.col(COL.ice, 'blue', 0.55);
          ctx.beginPath(); ctx.moveTo(x0, Y(0));
          for (let x = g.x0; x <= g.x1; x += 4) ctx.lineTo(X(x), Y(T.h(x)) + 2 * u);
          ctx.lineTo(x1, Y(0)); ctx.closePath(); ctx.fill();
        }
        if (g.station?.id || g.summit) drawProp(ctx, env, g.station || { id: 'summit', prop: 'summit' }, g, X, Y, now);
      }
    }

    function drawProp(ctx, env, sta, g, X, Y, now) {
      const u = env.u, x = X(sta.x || (g.x0 + g.x1) / 2), y = Y(g.b0), lit = sta.lit ? clamp((now - sta.lit) / 1.2, 0, 1) : sta.started ? 0.5 : 0;
      if (x < -260 * u || x > env.W + 260 * u) return;
      const warm = 0.25 + 0.75 * lit;
      const glow = env.glow, col = env.col;
      const art = name => A.Art?.has?.(name);
      const drawArt = (name, w, dy = 0) => { const h = w / A.Art.aspect(name); env.art(name, x - w / 2, y - h + dy, w, h); return h; };
      sta.top = 90;
      const p = sta.prop;
      if (p === 'tower') {
        if (art(sta.art)) { const h = drawArt(sta.art, 80 * u, 6 * u); sta.top = h / u - 20; glow(ctx, x, y - h * 0.72, 40 * u, COL.amber, 0.25 + 0.4 * lit, 'soft'); return; }
        ctx.fillStyle = col(COL.wood, 'yellow', 1); ctx.fillRect(x - 12 * u, y - 120 * u, 24 * u, 120 * u);
        ctx.beginPath(); ctx.moveTo(x - 18 * u, y - 120 * u); ctx.lineTo(x, y - 150 * u); ctx.lineTo(x + 18 * u, y - 120 * u); ctx.fill();
        glow(ctx, x, y - 104 * u, 24 * u, COL.amber, 0.3 + 0.5 * lit, 'soft'); glow(ctx, x, y - 104 * u, 5 * u, COL.glow, 0.8 * warm);
        sta.top = 110; return;
      }
      if (p === 'lighthouse') {
        if (art(sta.art)) { const h = drawArt(sta.art, 74 * u, 6 * u); sta.top = h / u - 20; glow(ctx, x, y - h * 0.86, 60 * u, COL.glow, 0.3 + 0.5 * lit, 'soft'); return; }
        ctx.fillStyle = col(COL.silver, 'base', 1); ctx.beginPath(); ctx.moveTo(x - 12 * u, y); ctx.lineTo(x - 7 * u, y - 110 * u); ctx.lineTo(x + 7 * u, y - 110 * u); ctx.lineTo(x + 12 * u, y); ctx.fill();
        glow(ctx, x, y - 116 * u, 50 * u, COL.glow, 0.35 + 0.5 * lit, 'soft'); glow(ctx, x, y - 116 * u, 6 * u, COL.daylight, 0.9);
        sta.top = 110; return;
      }
      if (p === 'cairn' || p === 'summit') {
        if (p === 'cairn' && art(sta.art)) { const h = drawArt(sta.art, 46 * u, 4 * u); sta.top = h / u + 30; }
        else {
          ctx.fillStyle = col(COL.rock, 'base', 1);
          for (let i = 0; i < 4; i++) { const r = (11 - i * 2) * u; ctx.beginPath(); ctx.ellipse(x + (i % 2 ? 1 : -1) * u, y - 2 * u - i * 8 * u - r * 0.3, r * 1.2, r * 0.7, 0, 0, 6.283); ctx.fill(); }
          ctx.fillStyle = col(COL.snow, 'base', 0.9); ctx.beginPath(); ctx.ellipse(x, y - 30 * u, 5 * u, 2 * u, 0, PI, 0); ctx.fill();
        }
        if (p === 'cairn') {
          for (const [dx, hh, c] of [[-26, 46, COL.violet], [28, 40, COL.ice]]) {
            ctx.fillStyle = col(COL.wood, 'yellow', 1); ctx.fillRect(x + dx * u, y - hh * u, 2.4 * u, hh * u);
            glow(ctx, x + dx * u, y - hh * u, 10 * u, c, 0.5 * warm);
          }
          ctx.strokeStyle = col(COL.violet, 'base', 0.25 + 0.3 * warm); ctx.setLineDash([2 * u, 6 * u]); ctx.lineWidth = 1.5 * u;
          ctx.beginPath(); ctx.moveTo(x + 10 * u, y - 2 * u); ctx.quadraticCurveTo(x + 90 * u, y - 10 * u, x + 160 * u, y - 70 * u); ctx.moveTo(x + 10 * u, y + 2 * u); ctx.lineTo(x + 170 * u, y + 4 * u); ctx.stroke(); ctx.setLineDash([]);
          sta.top = Math.max(sta.top, 80);
        } else {
          glow(ctx, x, y - 34 * u, 30 * u, COL.glow, 0.25 + 0.5 * (st.dawnStarted ? 1 : 0), 'soft');
        }
        return;
      }
      if (p === 'pier') {
        if (art(sta.art)) { const h = drawArt(sta.art, 200 * u, 10 * u); sta.top = h / u + 20; }
        else {
          ctx.fillStyle = col(COL.wood, 'yellow', 1);
          ctx.fillRect(x - 70 * u, y - 4 * u, 140 * u, 5 * u);
          for (const dx of [-60, 60]) ctx.fillRect(x + dx * u - 2 * u, y - 46 * u, 4 * u, 46 * u);
          ctx.strokeStyle = col(COL.wood, 'yellow', 0.8); ctx.lineWidth = 1.2 * u; ctx.beginPath(); ctx.moveTo(x - 58 * u, y - 44 * u); ctx.quadraticCurveTo(x, y - 24 * u, x + 58 * u, y - 44 * u); ctx.stroke();
          sta.top = 70;
        }
        for (const dx of [-22, 22]) { glow(ctx, x + dx * u, y - 30 * u, 14 * u, COL.amber, 0.15 + 0.6 * lit, 'soft'); }
        return;
      }
      if (p === 'hut') {
        const w = 90 * u, h = 50 * u, stv = 0.4 + 0.6 * warm;
        glow(ctx, x - w * 0.22, y - h * 0.58, 80 * u, COL.amber, 0.22 * stv, 'soft');
        ctx.fillStyle = col(COL.hut, 'yellow'); ctx.fillRect(x - w / 2, y - h, w, h);
        ctx.fillStyle = col(COL.snow, 'base'); ctx.beginPath(); ctx.moveTo(x - w / 2 - 12 * u, y - h + 3 * u); ctx.quadraticCurveTo(x, y - h - 30 * u, x + w / 2 + 12 * u, y - h + 3 * u); ctx.closePath(); ctx.fill();
        ctx.fillStyle = col(COL.rock, 'base'); ctx.fillRect(x + w * 0.22, y - h - 32 * u, 9 * u, 24 * u);
        ctx.fillStyle = env.rgb(env.mix([60, 52, 46], [242, 181, 68], stv)); ctx.fillRect(x - w * 0.32, y - h * 0.7, w * 0.2, h * 0.24);
        ctx.fillStyle = env.rgb(env.mix([30, 26, 24], [255, 201, 138], 0.5 * stv)); ctx.fillRect(x + w * 0.1, y - h * 0.7, w * 0.18, h * 0.7);
        glow(ctx, x - w * 0.22, y - h * 0.58, 30 * u, COL.glow, 0.5 * stv);
        for (let i = 0; i < 5; i++) { const q = ((now * (rm() ? 0.08 : 0.16) + i / 5) % 1), r = (6 + q * 16) * u; env.soft(ctx, x + w * 0.26 + q * 22 * u, y - h - 36 * u - q * 60 * u, r, COL.silver, 0.3 * (1 - q) * Math.min(1, q * 5)); }
        sta.top = 100; return;
      }
      if (p === 'loom') {
        ctx.fillStyle = col('#E8E1D2', 'yellow', 1);
        for (const dx of [-56, 56]) ctx.fillRect(x + dx * u - 3 * u, y - 140 * u, 6 * u, 140 * u);
        if (art(sta.art)) { const h = drawArt(sta.art, 110 * u, 4 * u); sta.top = h / u + 20; }
        else { ctx.strokeStyle = col(COL.wood, 'yellow', 1); ctx.lineWidth = 3 * u; ctx.strokeRect(x - 42 * u, y - 92 * u, 84 * u, 70 * u); }
        ctx.lineWidth = 1.4 * u;
        for (let i = 0; i < 4; i++) { ctx.strokeStyle = col(COL.aurora, 'green', 0.15 + 0.4 * lit); ctx.beginPath(); ctx.moveTo(x - 36 * u + i * 24 * u, y - 90 * u); ctx.quadraticCurveTo(x - 30 * u + i * 20 * u, y - 140 * u - 30 * u * lit, x - 20 * u + i * 18 * u, y - 190 * u); ctx.stroke(); }
        sta.top = Math.max(sta.top, 100); return;
      }
      if (p === 'reeds') {
        ctx.strokeStyle = col('#16323A', 'green', 0.9); ctx.lineWidth = 1.4 * u; ctx.beginPath();
        for (let i = 0; i < 18; i++) { const rx = x - 80 * u + i * 9 * u, hh = (20 + 18 * Math.abs(Math.sin(i * 2.3))) * u; ctx.moveTo(rx, y); ctx.quadraticCurveTo(rx + 2 * u, y - hh * 0.6, rx + Math.sin(now + i) * 3 * u, y - hh); }
        ctx.stroke();
        if (art(sta.art)) { drawArt(sta.art, 44 * u, 2 * u); }
        else { ctx.fillStyle = col(COL.wood, 'yellow'); ctx.fillRect(x + 30 * u, y - 14 * u, 22 * u, 14 * u); ctx.fillStyle = env.rgb([180, 200, 220], 0.4); ctx.fillRect(x + 34 * u, y - 34 * u, 14 * u, 20 * u); }
        for (let i = 0; i < 6; i++) { const t = now * 0.7 + i * 1.7; glow(ctx, x - 40 * u + 20 * u * i + Math.sin(t) * 8 * u, y - 30 * u - 18 * u * Math.abs(Math.sin(t * 0.6 + i)), 8 * u, COL.gold, 0.5); }
        sta.top = 80; return;
      }
      if (p === 'houses') {
        if (art(sta.art)) { const h = drawArt(sta.art, 230 * u, 6 * u); sta.top = h / u; }
        else {
          for (let i = 0; i < 3; i++) {
            const hx = x - 90 * u + i * 66 * u, hw = 56 * u, hh = (54 + 10 * (i % 2)) * u;
            ctx.fillStyle = col(['#5A3B28', '#46546A', '#7A5638'][i], 'yellow'); ctx.fillRect(hx, y - hh, hw, hh);
            ctx.fillStyle = col(COL.snow, 'base'); ctx.beginPath(); ctx.moveTo(hx - 6 * u, y - hh); ctx.lineTo(hx + hw / 2, y - hh - 22 * u); ctx.lineTo(hx + hw + 6 * u, y - hh); ctx.fill();
            ctx.fillStyle = env.rgb(lit > 0 ? [255, 201, 138] : [40, 44, 56], lit > 0 ? 0.6 + 0.4 * lit : 1); ctx.fillRect(hx + hw * 0.3, y - hh * 0.65, hw * 0.4, hh * 0.3);
          }
          sta.top = 90;
        }
        return;
      }
      if (p === 'clearing') {
        for (let i = 0; i < 5; i++) { const sx = x - 60 * u + i * 30 * u, sy = y - (200 + 30 * Math.sin(i * 1.3)) * u; glow(ctx, sx, sy, 10 * u, COL.silver, 0.35 + 0.4 * lit, 'soft'); glow(ctx, sx, sy, 2.4 * u, COL.daylight, 0.9); }
        sta.top = 190; return;
      }
    }

    function drawFront(ctx, env) {
      const now = A.now(), u = env.u, at = A.J?.at ?? now;
      const X = wx => env.fx + (wx - b.x) * u, Y = h => env.gy - h * u;
      const [lx, ly] = A.World.lanternPos();
      const tier = st.chain.tier, fever = st.fever > now;
      const tc = fever ? COL.gold : tier >= 2 ? COL.amber : COL.glow;
      if (st.trail.length > 2) {
        const tr = st.trail, n = tr.length;
        for (let i = 1; i < n; i++) {
          const q = i / n, x = X(tr[i][0]), y = Y(tr[i][1]);
          env.glow(ctx, x, y, (rm() ? 8 : 10 - 6 * q) * u * (1 + 0.2 * tier), tc, (0.22 + 0.1 * tier) * (1 - q), 'soft');
        }
      }
      if (st.state === 'ride' && !b.air && st.crouch > 0.05) {
        const fy = Y(T.h(b.x));
        env.glow(ctx, env.fx + 4 * u, fy, 30 * u, COL.amber, 0.22 * st.crouch, 'soft');
        env.glow(ctx, env.fx + 4 * u, fy, 9 * u, COL.glow, 0.25 * st.crouch);
      }
      for (const g of T.segs) {
        if (!ORBS || !g.motes?.length || X(g.x1) < -40 || X(g.x0) > env.W + 40) continue;
        for (const m of g.motes) {
          if (m.got) {
            const p = clamp((now - m.got) / 0.25, 0, 1);
            if (p >= 1) continue;
            if (rm()) { env.glow(ctx, X(m.x), Y(m.y), 8 * u, m.c || COL.flame, 0.8 * (1 - p)); continue; }
            const e = p * p, x = lerp(X(m.from[0]), lx, e), y = lerp(Y(m.from[1]), ly, e) - Math.sin(PI * p) * 14 * u;
            env.glow(ctx, x, y, 7 * u, m.c || COL.flame, 0.9 * (1 - 0.5 * p));
            continue;
          }
          const x = X(m.x), y = Y(m.y) + (rm() ? 0 : Math.sin(at * 2.4 + m.x * 0.05) * 1.5 * u);
          if (x < -20 || x > env.W + 20) continue;
          const fade = m.missed ? clamp(1 - (now - m.gone) / 1.2, 0, 1) : 1;
          if (fade <= 0) continue;
          const c = m.high ? COL.gold : m.c || (env.night ? COL.warm : COL.flame), big = m.high ? 1.5 : m.cluster ? 1.15 : 1;
          env.glow(ctx, x, y, 12 * u * big, c, 0.3 * fade, 'soft');
          env.glow(ctx, x, y, 4 * u * big, c, 0.95 * fade);
        }
      }
      if (st.hill?.post && st.state === 'ride' && !st.hill.kickDone && st.hill.tp != null) {
        const h = st.hill, bpm = 84 + 12 * (h.k ?? 0), beat = 60 / bpm, left = h.tp - now;
        if (left < 2 * beat && left > -0.15) {
          const x = X(h.crestX), y = Y(h.crestH) - 48 * u, p = clamp(1 - left / (2 * beat), 0, 1);
          if (rm()) env.glow(ctx, x, y, 20 * u, COL.daylight, 0.5 * p, 'soft');
          else { ctx.strokeStyle = env.rgb([255, 243, 220], 0.35 + 0.5 * p); ctx.lineWidth = 2 * u; ctx.beginPath(); ctx.arc(x, y, (8 + 40 * (1 - p)) * u, 0, 6.283); ctx.stroke(); }
        }
      }
      for (const g of T.segs) if (g.kickAt && now - g.kickAt < 0.8 && g.bloom != null) {
        const p = (now - g.kickAt) / 0.8, x = X(g.crestX), y = Y(g.crestH) - 48 * u;
        env.glow(ctx, x, y, (40 + 60 * p) * u, COL.daylight, 0.45 * (1 - p), 'soft');
      }
      if (st.streak && now - st.streak.at < 0.4 && !rm()) {
        const p = (now - st.streak.at) / 0.4;
        for (let i = 0; i < 6; i++) { const wx = st.streak.x - i * 10; env.glow(ctx, X(wx), Y(T.h(wx)) - 1 * u, 7 * u, COL.amber, 0.35 * (1 - p) * (1 - i / 6), 'soft'); }
      }
      if (!rm() && st.state === 'ride' && st.speed01 > 0.7) {
        const a = (st.speed01 - 0.7) / 0.3 * 0.18;
        ctx.strokeStyle = env.rgb([232, 238, 245], a); ctx.lineWidth = 1 * u; ctx.beginPath();
        for (let i = 0; i < 4; i++) { const yy = ly - 20 * u + i * 12 * u, xx = lx - 30 * u - ((now * 400 + i * 97) % 120) * u; ctx.moveTo(xx, yy); ctx.lineTo(xx - 40 * u, yy); }
        ctx.stroke();
      }
      for (const p of st.spray) {
        const q = p.age / p.life;
        env.glow(ctx, X(p.x), Y(p.y), p.size * u * (1 - 0.5 * q), p.c, 0.8 * (1 - q));
      }
      if (st.state === 'core' || (st.state === 'ready' && st.kindle > 0)) {
        const k = s.phase === 'rest' ? st.kindle : st.kindleDone ? clamp(1 - (now - st.kindleDone) / 0.6, 0, 1) : 0;
        if (k > 0.001) {
          const r = 34 * u;
          ctx.strokeStyle = env.rgb([255, 217, 160], 0.55 * (s.phase === 'rest' ? 1 : k)); ctx.lineWidth = 2 * u; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.arc(lx, ly, r, -PI / 2, -PI / 2 + 2 * PI * (s.phase === 'rest' ? k : 1)); ctx.stroke();
          env.glow(ctx, lx, ly, r * 1.6, COL.amber, 0.08 + 0.1 * (s.phase === 'rest' ? k : 0), 'soft');
        }
      }
      if (st.state === 'give' || (st.driftGive && s.phase === 'dawn')) {
        const sunX = env.W * 0.72, sunY = env.hy - env.H * 0.06, a = Math.min(0.25, 0.08 + 0.17 * (1 - Math.exp(-st.light / 30))) * (0.5 + 0.5 * st.lift);
        for (let i = 0; i <= 14; i++) { const q = i / 14, x = lerp(lx, sunX, q), y = lerp(ly, sunY, q) - Math.sin(PI * q) * 40 * u; env.glow(ctx, x, y, (10 + 8 * q) * u, COL.gold, a * (1 - 0.6 * q) * (st.held || s.auto ? 1 : 0.5), 'soft'); }
      }
    }

    function drawOver(ctx, now) {
      const z = A.World?.size?.(), J = A.J;
      if (!z?.W || !J) return;
      const [lx, ly] = A.World.lanternPos(), U = z.H / 844;
      if (st.fold && now >= st.fold.at) {
        const p = clamp((now - st.fold.at) / 0.55, 0, 1), e = p * p, x = lerp(st.fold.from[0], lx, e), y = lerp(st.fold.from[1], ly, e) - Math.sin(PI * p) * 40 * U;
        J.sprite(ctx, 'glow', st.fold.c, x, y, 16 * U * (1 - 0.5 * p), 0.9 * (1 - 0.3 * p), true);
        J.sprite(ctx, 'soft', st.fold.c, x, y, 40 * U, 0.3 * (1 - p), true);
      }
      if (s.auto) return;
      let fa = 0, press = 0;
      if (s.phase === 'rest' && !A.Input.holding()) { fa = 0.7; press = 1; }
      const waitFrom = s.phase !== 'walk' ? null : st.state === 'ready' ? st.readyFrom : st.state === 'exit' && !st.exitTap ? st.exitAt : null;
      if (waitFrom != null && now >= waitFrom) { fa = 0.8; press = 0.5 + 0.5 * Math.sin(PI * clamp((now - waitFrom) / 0.9, 0, 1)); }
      if (s.phase === 'rt' && !s.rtArmed) { fa = 0.8; press = 1; }
      if (st.state === 'ride' && (st.tut || st.noTouchHills >= 2) && now - st.lastInput > 0.6 && !b.air) {
        const want = T.d(b.x) < -0.03;
        fa = 0.75; press = want ? 1 : 0;
        if (st.ghostHold !== want && now - st.ghostAt < 0.5) press = st.ghostHold ? 1 : 0; else if (st.ghostHold !== want) { st.ghostHold = want; st.ghostAt = now; }
      }
      if (st.state === 'ride' && st.tut && (st.rec.holds > 1 || now - st.at > 14)) st.tut = false;
      if (s.phase === 'dawn' && !A.Input.holding() && now - st.lastTouch > 1.2) { fa = 0.6; press = 1; }
      if (fa > 0) {
        const fx0 = s.phase === 'fadein' || s.phase === 'rest' ? lx + 6 * U : z.W * 0.6, fy0 = s.phase === 'fadein' || s.phase === 'rest' ? ly + 4 * U : z.H * 0.7;
        if (press > 0.5) J.sprite(ctx, 'glow', J.C.flame, fx0, fy0, 22 * U, 0.35 * fa * press, true);
        J.touch(ctx, fx0, fy0, U, fa, press);
      }
    }

    setupStart();
    syncV(A.now());
    return T_;
  }
})();
