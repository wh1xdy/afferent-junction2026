(() => {
  const { clamp, lerp, ema } = A;
  const R = Math.random;
  const rm = () => !!A.config?.reducedMotion;
  const hap = n => A.J?.hap(n);
  const sfx = (n, p) => A.J?.sfx?.(n, p);
  const PI = Math.PI;
  const DT = 1 / 240;
  const AIR_TILT = 0.3, LOOK = 140, G = 520, GA = 640, JV = 250, HOLD_G = 0.55, HOLD_T = 0.22, APEX_V = 55, APEX_G = 0.7, BUF = 0.15, LEAD = 0.25;

  const MODES = {
    calm: { vt: 125, slope: 0.11, A: 22, L: [460, 680], space: 2.9, kinds: { drift: 3, rock: 2, log: 1 } },
    flow: { vt: 155, slope: 0.15, A: 32, L: [380, 600], space: 2.5, kinds: { rock: 3, log: 2, drift: 2, gap: 2 } },
    wake: { vt: 180, slope: 0.19, A: 40, L: [340, 540], space: 2.0, kinds: { rock: 3, log: 2, gap: 3, drift: 1 } },
    fatigue: { vt: 170, slope: 0.17, A: 38, L: [360, 560], space: 2.2, kinds: { rock: 3, log: 3, gap: 2, drift: 1 } },
    rest: { vt: 36, slope: 0, A: 5, L: [520, 680], space: 0, kinds: {} },
  };
  const MODE = (m, k = 0.4) => {
    const id = MODES[m] ? m : 'flow', P = { ...MODES[id], m: id, k };
    if (id === 'wake' || id === 'fatigue') { P.vt += 20 * k; P.space -= 0.4 * k; }
    if (id === 'calm') P.space += 0.6 * k;
    return P;
  };
  const OBS = { rock: { w: 26, h: 18 }, log: { w: 42, h: 13 }, drift: { w: 48, h: 12 }, gap: { w: 56, h: 0 } };

  const COL = {
    violet: '#9C8AD6', amber: '#F2B544', glow: '#FFD9A0', flame: '#F2E6C9', aurora: '#5FE3A1', ice: '#7FC8E8',
    gold: '#FFD27A', daylight: '#FFF3DC', silver: '#E8EEF5', warm: '#FFC98A', night: '#05070F', wood: '#7A5638', hut: '#5A3B28', rock: '#5E6873', snow: '#DDE6EE',
    stone: '#46505B', bark: '#5C4130', cut: '#B08A62', deep: '#0B1224',
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
    const val = (g, x) => {
      const L = g.len, s = (x - g.x0) / L, s2 = s * s, s3 = s2 * s, b = Math.sin(PI * s);
      return (2 * s3 - 3 * s2 + 1) * g.b0 + (s3 - 2 * s2 + s) * L * g.d0 + (3 * s2 - 2 * s3) * g.b1 + (s3 - s2) * L * g.d1 + g.A * b * b;
    };
    const der = (g, x) => {
      const L = g.len, s = (x - g.x0) / L, s2 = s * s;
      return (6 * s2 - 6 * s) * (g.b0 - g.b1) / L + (3 * s2 - 4 * s + 1) * g.d0 + (3 * s2 - 2 * s) * g.d1 + g.A * PI / L * Math.sin(2 * PI * s);
    };
    T.h = x => {
      const g = T.seg(x);
      if (!g) return 0;
      if (x < g.x0) return g.b0 + (x - g.x0) * g.d0;
      if (x > g.x1) return g.b1 + (x - g.x1) * g.d1;
      return val(g, x);
    };
    T.d = x => {
      const g = T.seg(x);
      if (!g) return 0;
      if (x < g.x0) return g.d0;
      if (x > g.x1) return g.d1;
      return der(g, x);
    };
    T.end = () => (T.segs.length ? T.segs[T.segs.length - 1].x1 : 0);
    T.endH = () => (T.segs.length ? T.segs[T.segs.length - 1].b1 : 0);
    T.endD = () => (T.segs.length ? T.segs[T.segs.length - 1].d1 : 0);
    T.add = g => {
      const o = { b0: T.endH(), d0: T.endD(), d1: 0, A: 0, ...g };
      if (o.b1 == null) o.b1 = o.b0;
      o.x0 = o.x0 ?? T.end(); o.x1 = o.x0 + o.len;
      T.segs.push(o);
      return o;
    };
    T.trim = x => { while (T.segs.length > 3 && T.segs[0].x1 < x) { T.segs.shift(); T.i = Math.max(0, T.i - 1); } };
    return T;
  }

  A.Traverse = {
    STATIONS, MODE, OBS, Terrain,
    cur: null,
    create(s) { const t = make(s); A.Traverse.cur = t; return t; },
  };

  function make(s) {
    const V = s.V;
    const T = Terrain(), seed = (Math.random() * 1e9) | 0, TR = A.rng(seed), TO = A.rng(seed + 1);
    const unit = () => { const H = A.World?.size?.().H; return H ? H / 844 : 1; };
    const W0 = () => { const z = A.World?.size?.(); return z?.W ? z.W / unit() : 390; };
    const ahead = () => { const z = A.World?.size?.(); return z?.W ? (z.W - z.fx) / unit() : 0.65 * W0(); };
    const forceMode = () => (['calm', 'flow', 'wake', 'fatigue', 'rest'].includes(A.config?.forceRide) ? A.config.forceRide : null);
    const curMode = () => forceMode() || s.mode || 'flow';
    const kOf = m => (s.intensity ? s.intensity(m) : 0.4);
    const tm = now => (s.tm ? s.tm(now) : Math.round(now * 1000));

    const b = { x: 0, y: 0, v: 0, vx: 0, vy: 0, air: false, ang: 0, airT: 0, apex: 0, ev: null };
    const lv = (() => {
      const t = A.Skill?.task ? A.Skill.task('ride') : { L: 0.3, n: 0 };
      return { t, Ls: t.L, Lsess: t.L, L_start: t.L, n: t.n || 0, ds: [] };
    })();
    const rt = A.RT ? A.RT.log() : null;

    const st = {
      state: 'core', at: A.now(), held: false, botHeld: false, botQ: [], swallow: false,
      pressTs: null, releaseTs: null, kindle: 0, kindleDone: null,
      station: null, plan: null, spray: [], fold: null, P: MODE('flow'),
      crouch: 0, spread: 0, squashAt: -9, squashK: null, sit: 0, lift: 0, speed01: 0, angV: 0, wobbleAt: -9, dipAt: -9,
      cam: { x: 0, y: 0, z: 1 }, camH: 0, nudge: null, dawnT: 0, lastTouch: A.now(), giveTick: 0,
      lastInput: A.now(), idleMax: 0, daylight: 0, sprayAcc: 0,
      obs: [], obsId: 0, nextObsX: 0, jumpReq: null, buffer: null, takeoffAt: null, botJumpAt: null,
      events: [], dropped: 0,
      rec: { seconds: 0, air_s: 0, presses: 0, jumps: 0, restHeld: 0, restN: 0, dawn_hold_s: 0, dawn_s: 0 },
      tally: { n: 0, cleared: 0, hit: 0, by_kind: {} },
      pierEnd: 0, bankX: 0,
    };

    const assist = () => !!A.Skill?.sess && !!A.Skill.checkAssist?.();
    const level = () => {
      const m = curMode(), k = kOf(m);
      const D = m === 'calm' ? -0.3 * k : m === 'wake' ? 0.15 * (k - 0.5) : 0;
      return clamp(lv.Ls + D + (assist() ? -0.15 : 0), 0, 1);
    };

    const log = (now, type, o = {}) => {
      if (st.events.length >= 400) { st.dropped++; return; }
      st.events.push({ t_ms: tm(now), type, ...o });
    };

    const fx = (x, y, n, c, sp, life, size, o = {}) => {
      if (rm() && !o.always) return;
      for (let i = 0; i < n; i++) {
        const a = (o.dir ?? PI / 2) + (R() - 0.5) * (o.spread ?? 1.4), v = sp * (0.4 + 0.6 * R());
        st.spray.push({ x, y, vx: Math.cos(a) * v + (o.vx || 0), vy: Math.sin(a) * v, life: life * (0.7 + 0.6 * R()), age: 0, size: size * (0.7 + 0.6 * R()), c, g: o.g ?? 160 });
      }
      if (st.spray.length > 120) st.spray.splice(0, st.spray.length - 120);
    };

    function biome(m) { return { calm: 'sauna', flow: 'forest', wake: 'lake', fatigue: 'shore', rest: 'harbour' }[m] || 'forest'; }
    function chunk(type, x0, x1) {
      const u = unit(), cs = V.chunks;
      const last = cs[cs.length - 1];
      if (last && last.type === type && Math.abs(last.x1 - x0 * u) < 2) { last.x1 = x1 * u; return; }
      cs.push({ type, x0: x0 * u, x1: x1 * u, seed: Math.floor(TR() * 1e6) });
      while (cs.length > 8 && cs[1].x1 < V.worldX - 400 * u) cs.shift();
    }

    function pickKind(P, d) {
      const w = { ...P.kinds };
      if (d < 0.2) delete w.gap;
      if (w.drift) w.drift *= lerp(1.6, 0.6, d);
      const ks = Object.keys(w), tot = ks.reduce((a, k) => a + w[k], 0);
      let r = TO() * tot;
      for (const k of ks) { r -= w[k]; if (r <= 0) return k; }
      return ks[0];
    }

    function place(g, P) {
      const plan = st.plan;
      if (!P.space || !plan || plan.kind === 'drift' || g.free) return;
      const d = level(), gap = P.space * P.vt * lerp(1.2, 0.8, d), stop = plan.safeX ?? Infinity;
      if (st.nextObsX < g.x0) st.nextObsX = g.x0 + 40;
      while (st.nextObsX < g.x1) {
        const x = st.nextObsX;
        st.nextObsX += gap * (0.85 + 0.3 * TO());
        if (x > stop) continue;
        if (Math.abs(T.d(x)) > 0.45) { st.nextObsX = x + 40; continue; }
        const kind = pickKind(P, d);
        st.obs.push({ id: 'o' + ++st.obsId, kind, x, ...OBS[kind], seed: TO(), cued: null, done: false, jumpT: null, hitAt: null });
      }
    }

    function roll(P, o = {}) {
      const r0 = TR(), r1 = TR(), r2 = TR();
      const len = o.len ?? lerp(P.L[0], P.L[1], r0);
      const A = o.A ?? (P.A * (0.5 + 0.6 * r1) * (r2 < 0.7 ? 1 : -0.6));
      const g = T.add({ len, b1: T.endH() - P.slope * len, d1: -P.slope, A, P, m: P.m, free: !!o.free });
      chunk(biome(P.m), g.x0, g.x1);
      place(g, P);
      return g;
    }

    function gen(horizon) {
      let guard = 0;
      while (T.end() < horizon && guard++ < 40) {
        const m0 = curMode(), m = m0 === 'rest' ? 'calm' : m0, P = MODE(m, kOf(m)), plan = st.plan;
        if (st.state === 'drift' || plan?.kind === 'drift') {
          const R0 = MODE('rest'), g = T.add({ len: 600, b1: T.endH() - 8, d1: 0, A: 5, P: R0, m: 'rest', drift: true });
          chunk('harbour', g.x0, g.x1);
          continue;
        }
        if (plan?.fellDone) return;
        if (plan && T.end() < plan.endX) { const left = plan.endX - T.end(); roll(P, left < P.L[1] + 200 ? { len: Math.max(220, left) } : {}); continue; }
        if (plan?.kind === 'summit') {
          const rise = T.add({ len: 520, b1: T.endH() + 70, d1: 0, P, m, summitRise: true });
          const plat = T.add({ len: 200, P, m, summit: true, station: { id: 'summit', ...STATIONS.summit, kind: 'summit' } });
          T.add({ len: 600, b1: T.endH() - 90, d1: -P.slope, P, m });
          chunk(biome(m), rise.x0, T.end());
          plan.fellDone = true; plan.plateau = plat;
          continue;
        }
        if (plan?.kind === 'task' && !plan.stationDone) {
          const into = T.add({ len: 300, b1: T.endH() - P.slope * 150, d1: 0, P, m });
          const bench = T.add({ len: 260, P, m, station: st.station = { id: null, kind: 'ground', c: null, lit: 0, x: 0 } });
          st.station.seg = bench;
          st.station.x = bench.x1 - 8;
          const out = T.add({ len: 260, b1: T.endH() - 25, d1: -P.slope, P, m, ramp: true });
          chunk(biome(m), into.x0, out.x1);
          plan.commitX = into.x0 - 400;
          plan.stationDone = true;
          continue;
        }
        roll(P, { free: true });
      }
    }

    function setupStart() {
      const W = W0(), u = unit(), P = MODE('flow');
      st.pierEnd = 0.07 * W; st.bankX = 0.31 * W;
      T.segs.length = 0;
      T.add({ x0: -900, len: 900 + st.bankX, b0: 0, d0: 0, P, pier: true });
      T.add({ len: 60, b1: 22, d1: 0, P, bank: true });
      T.add({ len: 420, b1: 22 - P.slope * 420, d1: -P.slope, A: 0, P, m: 'flow' });
      V.chunks = [
        { type: 'harbour', x0: -1100 * u, x1: st.bankX * u, seed: 1, pierEnd: st.pierEnd * u, boatX: (st.pierEnd + st.bankX) / 2 * u },
        { type: 'shore', x0: st.bankX * u, x1: T.end() * u, seed: 7 },
      ];
      b.x = 0; b.y = 0; b.v = 0; b.air = false;
      st.camH = 0;
      V.worldX = 0;
    }

    function syncV(now) {
      const u = unit();
      V.terrain = wx => T.h(wx / u) - st.camH;
      V.worldX = b.x * u;
      const surf = T.h(b.x);
      const P = st.P;
      const sp = b.air ? Math.hypot(b.vx, b.vy) : b.v;
      st.speed01 = clamp((sp - 0.45 * P.vt) / Math.max(1, 1.1 * P.vt), 0, 1);
      const sq = st.squashK ? squashAt(now) : [1, 1];
      const ski = ['ride', 'arrive', 'stage', 'exit'].includes(st.state);
      V.ride = {
        state: st.state, air: b.air ? Math.max(0, b.y - surf) : 0, angle: st.angV,
        crouch: st.crouch, spread: st.spread, squash: sq, sit: st.sit, lift: st.lift, speed01: st.speed01,
        pose: ski ? (b.air ? 'air' : 'ski') : null, dip: dipAt(now),
      };
      V.walking = st.state === 'run';
      V.stride = st.state === 'run' ? 1.8 : 0;
      V.daylightRide = st.daylight;
      V.cam = { x: st.cam.x, y: st.cam.y, z: st.cam.z };
    }

    function squashAt(now) {
      const q = st.squashK, p = (now - st.squashAt) / q[2];
      if (p >= 1 || rm()) { st.squashK = null; return [1, 1]; }
      const e = Math.sin(PI * p);
      return [lerp(1, q[0], e), lerp(1, q[1], e)];
    }
    const squash = (now, sx, sy, dur) => { st.squashAt = now; st.squashK = [sx, sy, dur]; };
    const dipAt = now => { const p = (now - st.dipAt) / 0.45; return p >= 0 && p < 1 ? 7 * Math.sin(PI * p) : 0; };

    const tickHold = now => {
      st.held = s.auto ? st.botHeld : A.Input.holding();
      if (A.Input.holding() && !s.auto) st.lastTouch = now;
    };

    function shiftAfter(seg, dx) {
      if (!dx) return;
      const i = T.segs.indexOf(seg), u = unit(), x0 = seg.x1;
      seg.len += dx; seg.x1 += dx;
      for (let j = i + 1; j < T.segs.length; j++) { const g = T.segs[j]; g.x0 += dx; g.x1 += dx; }
      for (const o of st.obs) if (o.x >= x0) o.x += dx;
      if (st.plan?.endX != null && st.plan.endX >= x0) st.plan.endX += dx;
      if (st.nextObsX >= x0) st.nextObsX += dx;
      for (const c of V.chunks) { if (c.x0 >= x0 * u - 1) c.x0 += dx * u; if (c.x1 >= x0 * u - 1) c.x1 += dx * u; }
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
    }

    function toDrift(now) {
      st.state = 'drift'; st.at = now; st.driftAt = now; st.pendingDrift = false;
      st.plan = { kind: 'drift' };
      st.station = null;
      const cut = T.segs.findIndex(g => g.x0 > b.x + 0.9 * W0());
      if (cut > 0) T.segs.length = cut;
      st.obs = st.obs.filter(o => o.x < b.x);
    }

    function cue(now) {
      const edge = b.x + ahead();
      for (const o of st.obs) {
        if (o.cued != null || o.done || o.x - o.w / 2 > edge) continue;
        o.cued = now;
        rt?.cue(o.id, o.kind, now);
      }
    }

    function press(now, pt) {
      st.rec.presses++;
      st.lastInput = now;
      const o = st.obs.find(q => !q.done && q.cued != null && q.jumpT == null && q.x + q.w / 2 > b.x);
      let ms = null;
      if (o && rt?.pending(o.id)) { o.jumpT = pt; ms = rt.hit(o.id, pt); }
      log(now, 'jump', { kind: o?.kind ?? null, rt_ms: ms, air: b.air });
      if (!b.air) jump(now); else st.buffer = pt;
    }

    function jump(now) {
      const th = Math.atan(T.d(b.x));
      b.air = true; b.vx = b.v * Math.cos(th); b.vy = b.v * Math.sin(th) + JV * (rm() ? 0.9 : 1); b.airT = 0; b.apex = 0;
      st.takeoffAt = now; st.buffer = null; st.rec.jumps++;
      squash(now, 0.92, 1.1, 0.14);
      fx(b.x - 4, b.y, 6, COL.snow, 55, 0.6, 2, { dir: PI * 0.75, spread: 1 });
      hap('light');
      sfx('ride_jump');
    }

    function land(now, impact) {
      const k = clamp(impact / 300, 0, 1);
      squash(now, 1 + 0.1 * k, 1 - 0.14 * k, 0.16);
      fx(b.x, b.y, Math.round(4 + 8 * k), COL.snow, 40 + 50 * k, 0.7, 2.2, { dir: PI / 2, spread: 2.6 });
      sfx('ride_land', { grade: k > 0.5 ? 'perfect' : 'good' });
      if (st.buffer != null && now - st.buffer <= BUF) jump(now);
      st.buffer = null;
    }

    function step(h, P, vmin, hold) {
      b.ev = null;
      if (!b.air) {
        const d = T.d(b.x), th = Math.atan(d), drag = G * Math.sin(Math.atan(P.slope)) / (P.vt * P.vt);
        b.v += (-G * Math.sin(th) - drag * b.v * b.v) * h;
        b.v = clamp(b.v, vmin, 1.6 * P.vt);
        b.x += b.v * Math.cos(th) * h; b.y = T.h(b.x); b.ang = th;
        return;
      }
      b.airT += h;
      let g = GA;
      if (hold && b.vy > 0 && b.airT < HOLD_T) g *= HOLD_G;
      if (Math.abs(b.vy) < APEX_V) g *= APEX_G;
      b.vy -= g * h;
      b.x += b.vx * h; b.y += b.vy * h;
      const gh = T.h(b.x);
      b.apex = Math.max(b.apex, b.y - gh);
      if (b.y <= gh && b.vy <= 0) {
        const d = T.d(b.x), n = Math.hypot(1, d), tx = 1 / n, ty = d / n;
        b.ev = { impact: Math.max(0, -(b.vy * tx - b.vx * ty)) };
        b.air = false; b.y = gh; b.ang = Math.atan(d);
        b.v = clamp(Math.max(b.vx * tx + b.vy * ty, 0) * 0.97, vmin, 1.6 * P.vt);
      }
    }

    function outcome(now, o, hit) {
      o.done = true;
      const t = st.tally, k = t.by_kind[o.kind] || (t.by_kind[o.kind] = { n: 0, cleared: 0, hit: 0 });
      t.n++; k.n++;
      if (hit) { t.hit++; k.hit++; } else { t.cleared++; k.cleared++; }
      const lead = o.jumpT != null && st.takeoffAt != null ? Math.round((now - st.takeoffAt) * 1000) : null;
      if (rt?.pending(o.id)) hit ? rt.lapse(o.id) : rt.drop(o.id);
      log(now, hit ? 'hit' : 'clear', { kind: o.kind, lead_ms: lead });
      const step = lv.n < 10 ? 0.08 : lv.n < 60 ? 0.04 : 0.025, out = hit ? 0 : 1;
      lv.ds.push(level());
      lv.Ls = clamp(lv.Ls + step * (out - 0.8), 0, 1);
      if (A.Skill?.sess?.credit && !assist()) {
        lv.t.L = clamp(clamp(lv.t.L + step * (out - 0.8), lv.Lsess - 0.12, lv.Lsess + 0.12), 0, 1);
        lv.t.n = (lv.t.n || 0) + 1; lv.t.last = new Date().toISOString().slice(0, 10);
        A.Skill.sess.stored = true;
      }
      lv.n++;
    }

    function stumble(now, o) {
      o.hitAt = now;
      const P = st.P, vmin = 0.45 * P.vt;
      if (o.kind === 'drift') {
        b.v = Math.max(vmin, b.v * 0.72);
        fx(o.x, b.y + 4, 14, COL.snow, 70, 0.9, 2.6, { dir: PI * 0.6, spread: 1.6 });
        hap('light'); sfx('ride_bump', { kind: o.kind });
      } else if (o.kind === 'gap') {
        b.v = Math.max(vmin, b.v * 0.65); st.dipAt = now;
        fx(o.x, b.y, 8, COL.snow, 40, 0.7, 2.2, { spread: 2.2 });
        hap('medium'); sfx('ride_bump', { kind: o.kind });
      } else {
        b.v = Math.max(vmin, b.v * 0.6);
        if (!b.air) {
          const th = Math.atan(T.d(b.x));
          b.air = true; b.vx = b.v * Math.cos(th); b.vy = b.v * Math.sin(th) + 120; b.airT = HOLD_T; b.apex = 0;
        } else { b.vx = Math.min(b.vx, b.v); b.vy = Math.max(b.vy, 60); }
        fx(o.x, b.y + 6, 10, COL.snow, 60, 0.8, 2.4, { spread: 2.2 });
        hap('medium'); sfx('ride_bump', { kind: o.kind });
      }
      st.wobbleAt = now;
      squash(now, 1.1, 0.86, 0.22);
    }

    function obstacles(now) {
      for (const o of st.obs) {
        if (o.done) continue;
        const half = o.w / 2;
        if (b.x > o.x + half + 6) { outcome(now, o, false); continue; }
        if (b.x < o.x - half - 5) break;
        const hit = o.kind === 'gap' ? !b.air && b.x > o.x - half + 8 && b.x < o.x + half - 8 : b.y - T.h(o.x) < o.h - 2;
        if (hit) { stumble(now, o); outcome(now, o, true); }
      }
      if (st.obs.length > 40) st.obs = st.obs.filter(o => !o.done || o.x > b.x - 2 * W0());
    }

    function rideUpdate(now, dt) {
      if ((curMode() === 'rest' || st.pendingDrift) && !b.air && !st.plan?.plateau) { toDrift(now); return; }
      const seg = T.seg(b.x), P = seg?.P || MODE(curMode());
      st.P = P;
      const sta = st.station;
      if (sta && !sta.id && st.plan?.commitX != null && b.x >= st.plan.commitX) commit(now);
      cue(now);
      if (st.jumpReq != null) { const pt = st.jumpReq; st.jumpReq = null; press(now, pt); }
      if (st.buffer != null && now - st.buffer > 0.6) st.buffer = null;
      const hold = !s.auto && A.Input.holding(), vmin = P.vt * (seg?.summitRise ? 0.55 : 0.45);
      const n = Math.max(1, Math.ceil(dt / DT - 1e-6)), h = dt / n;
      for (let i = 0; i < n; i++) {
        step(h, P, vmin, hold);
        if (b.ev) land(now, b.ev.impact);
        obstacles(now);
        if (b.air) st.rec.air_s += h;
      }
      if (!b.air && !rm()) {
        st.sprayAcc += dt * (6 + 26 * st.speed01);
        while (st.sprayAcc >= 1) { st.sprayAcc -= 1; fx(b.x - 6, b.y + 1, 1, COL.snow, 30 + 40 * st.speed01, 0.55, 1.7, { dir: PI * 0.82, spread: 0.7 }); }
      }
      if (now - st.lastInput > st.idleMax) st.idleMax = now - st.lastInput;
      if (b.air) return;
      const brake = Math.max(30, b.v * 0.7);
      if (sta && sta.id && (sta.kind === 'sky' ? b.x >= sta.seg.x0 + 12 : b.x >= sta.seg.x0 - 10 && b.x >= sta.seg.x1 - 60 - brake)) arrive(now, sta.kind === 'sky' ? null : sta.seg.x1 - 60);
      else if (st.plan?.plateau && b.x >= st.plan.plateau.x0 + 10 && b.x >= st.plan.plateau.x0 + 110 - brake) { st.summit = true; arrive(now, st.plan.plateau.x0 + 110); }
    }

    function arrive(now, x1) {
      const v = Math.max(30, b.v), dist = x1 == null ? 0 : Math.max(0, x1 - b.x);
      st.state = 'arrive'; st.at = now; st.arr = { x0: b.x, dist, v, dur: x1 == null ? 0.6 : clamp(2 * dist / v, 0.5, 2) };
      fx(b.x, b.y, 10, COL.snow, 60, 0.6, 2.2, { dir: PI * 0.8, spread: 0.8 });
      hap('light');
    }

    function camera(now, dt) {
      const z = A.World?.size?.(), u = unit();
      const W = z?.W || 390, H = z?.H || 844;
      const riding = ['ride', 'run'].includes(st.state);
      const air = b.air ? Math.max(0, b.y - T.h(b.x)) : 0;
      let tx = 0, ty = 0, tz = 1;
      if (riding && !rm()) {
        tx = -(0.04 * W + 0.08 * W * st.speed01);
        ty = clamp((air - 30) * u * 0.7, 0, 0.16 * H);
        tz = 1.05 - 0.05 * clamp((air - 20) / 80, 0, 1);
      }
      const c = st.cam;
      c.x = ema(c.x, tx, dt, 0.7); c.y = ema(c.y, ty, dt, 0.35); c.z = ema(c.z, tz, dt, 0.6);
      st.camH = ema(st.camH, lerp(T.h(b.x), T.h(b.x + LOOK), st.state === 'ride' ? 0.5 : 0), dt, 0.3);
    }

    function pose(now, dt) {
      const ski = ['ride', 'arrive', 'stage', 'exit'].includes(st.state);
      const crouchT = st.state === 'ready' ? 1 : ski ? (b.air ? 0 : 0.12) : st.state === 'core' && st.kindleHeldNow ? 0.3 : 0;
      st.crouch = ema(st.crouch, crouchT, dt, rm() ? 0.06 : 0.05);
      st.spread = ema(st.spread, st.state === 'ride' ? 0.6 : 0.1, dt, 0.08);
      st.sit = ema(st.sit, st.state === 'drift' || st.state === 'sleep' ? 1 : 0, dt, 0.5);
      st.lift = ema(st.lift, st.state === 'give' ? (st.held ? 1 : 0.5) : 0, dt, 0.25);
      let a = 0;
      if (ski) a = b.air ? clamp(Math.atan2(b.vy, b.vx) * 0.45, -0.45, 0.45) + AIR_TILT : b.ang;
      const age = now - st.wobbleAt;
      if (!rm() && age < 0.8) a += 0.28 * Math.sin(age * 20) * Math.exp(-age * 5);
      st.angV = ema(st.angV, a, dt, b.air ? 0.18 : 0.05);
      const hk = A.World?.hooks?.lanternPose;
      if (hk && st.lift > 0.05) { hk(lerp(0.5, 1.45, st.lift)); st.posed = true; }
      else if (hk && st.posed) { hk(null); st.posed = false; }
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
        tickHold(now);
        if (s.phase === 'checkin' && st.kindleDone == null) st.kindleDone = now;
        let rideDt = dt;
        if (st.state === 'run') {
          const runX = t => { const a = Math.min(t, 0.35); return 60 * t + 200 * a * a + 140 * Math.max(0, t - 0.35); };
          const t1 = now - st.at;
          b.v = lerp(60, 200, clamp(t1 / 0.35, 0, 1));
          b.x = Math.min(runX(t1), st.pierEnd); b.y = T.h(b.x);
          if (runX(t1) >= st.pierEnd) {
            let lo = Math.max(0, t1 - dt), hi = t1;
            for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; if (runX(m) >= st.pierEnd) hi = m; else lo = m; }
            rideDt = t1 - hi;
            st.state = 'ride'; st.at = now;
            b.air = true; b.vx = 220; b.vy = 130 * (rm() ? 0.8 : 1); b.airT = HOLD_T; b.apex = 0;
            s.firstPlayAt = s.firstPlayAt ?? now;
            st.lastInput = now;
            squash(now, 0.92, 1.12, 0.12);
            fx(b.x, b.y, 6, COL.snow, 60, 0.6, 2);
            st.plan = null;
            T_.planNext(now);
          }
        }
        if (st.state === 'ride') {
          gen(b.x + 1600);
          if (rideDt > 1e-6) rideUpdate(now, rideDt);
          st.rec.seconds += rideDt;
        } else if (st.state === 'arrive') {
          const a = st.arr, t = (now - st.at) / a.dur, p = clamp(t, 0, 1);
          if (a.dist) { b.x = a.x0 + a.dist * (1 - (1 - p) * (1 - p)); b.v = 2 * a.dist / a.dur * (1 - p); }
          else { b.v = lerp(a.v, 40, 1 - (1 - p) * (1 - p)); b.x += b.v * dt; }
          b.y = T.h(b.x); b.ang = Math.atan(T.d(b.x));
          if (b.v > 30 && !rm()) { st.sprayAcc += dt * 30; while (st.sprayAcc >= 1) { st.sprayAcc -= 1; fx(b.x - 3, b.y + 1, 1, COL.snow, 50, 0.5, 1.8, { dir: PI * 0.8, spread: 0.5 }); } }
          if (t >= 1) {
            if (st.summit) { st.state = 'summitStop'; st.at = now; }
            else { st.state = 'stage'; st.at = now; st.arrivedAt = now; }
          }
        } else if (st.state === 'stage') {
          if (st.station?.kind === 'sky') { b.v = 40; b.x += 40 * dt; b.y = T.h(b.x); b.ang = Math.atan(T.d(b.x)); }
          if (st.nudge) {
            const n = st.nudge, p = clamp((now - n.at) / n.dur, 0, 1), e = A.J?.ease?.inOut ? A.J.ease.inOut(p) : p;
            b.x = n.x0 + n.dx * e; b.y = T.h(b.x);
            if (p >= 1) st.nudge = null;
          }
        } else if (st.state === 'exit') {
          if (now >= st.exitAt && st.exitTap) {
            st.state = 'ride'; st.at = now;
            const P = MODE(curMode(), kOf(curMode()));
            b.air = false; b.v = 0.5 * P.vt;
            st.lastInput = now;
            if (st.prevStation) st.prevStation.lit = now;
            st.prevStation = null;
          }
        } else if (st.state === 'drift') {
          gen(b.x + 1.6 * W0() + 200);
          b.v = ema(b.v || 30, st.held ? 20 : 34, dt, 0.8); b.air = false;
          b.x += b.v * dt; b.y = T.h(b.x); b.ang = Math.atan(T.d(b.x));
          if (st.held) s.kick(0.04);
        } else if (st.state === 'give') {
          if (st.held) { st.rec.dawn_hold_s += dt; if (now - st.giveTick >= 1) { st.giveTick = now; hap('tick'); } }
        }
        if (['ride', 'arrive', 'stage', 'drift'].includes(st.state)) T.trim(b.x - 1.2 * W0() - 200);
        if (s.firstPlayAt != null) st.daylight = 0.2 * clamp((now - s.firstPlayAt) / Math.max(30, s.playS || 60), 0, 1);
        pose(now, dt);
        camera(now, dt);
        for (const p of st.spray) { p.age += dt; p.vy -= p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; }
        st.spray = st.spray.filter(p => p.age < p.life);
        if (st.fold && now - st.fold.at > 0.6) st.fold = null;
        syncV(now);
      },

      planNext(now) {
        const p = s.planNext ? s.planNext(now) : { kind: 'task', seconds: 12 };
        const cut = T.segs.findIndex(g => g.free && g.x0 > b.x + 0.9 * W0());
        if (cut > 0) T.segs.length = cut;
        for (const g of T.segs) g.free = false;
        st.obs = st.obs.filter(o => o.x < T.end());
        st.nextObsX = Math.min(st.nextObsX, T.end());
        st.plan = { ...p };
        if (p.kind === 'drift') {
          if (st.state === 'exit' || st.state === 'stage') toDrift(now);
          else st.pendingDrift = true;
          return;
        }
        const P = MODE(curMode(), kOf(curMode())), from = Math.max(b.x, st.prevStation?.seg?.x1 ?? b.x);
        st.plan.endX = from + Math.max(200, Math.max(4, p.seconds ?? 12) * P.vt - (p.kind === 'summit' ? 720 : 500));
        st.plan.safeX = st.plan.endX - 1.2 * P.vt;
        st.nextObsX = Math.max(st.nextObsX, from + 1.4 * P.vt);
        gen(b.x + 1600);
      },

      handle(type, d) {
        const now = A.now();
        if (type === 'pdown' || type === 'key') { st.pressTs = d?.ts ?? d?.t ?? now; st.lastTouch = now; }
        if (type === 'pup') st.releaseTs = d?.ts ?? d?.t ?? now;
        const ph = s.phase;
        if (ph === 'rest' || ph === 'fadein') return type !== 'exit';
        if (ph === 'walk') {
          if (type === 'pdown' || type === 'key') {
            if (st.state === 'ready') T_.go(now);
            else if (st.state === 'exit') st.exitTap = true;
            else if (st.state === 'ride') st.jumpReq = Math.min(st.pressTs, now);
          }
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
        return false;
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
        const X = z.fx + (px - b.x) * u, Y = z.gy - (T.h(px) - st.camH + (sta?.top || 80)) * u;
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

      auto() {
        const now = A.now(), prof = s.profile;
        let want = false;
        if (s.phase === 'walk' && st.state === 'ready' && now - st.at > 0.5) T_.go(now);
        if (st.state === 'ride' && !b.air) {
          const o = st.obs.find(q => !q.done && q.x + q.w / 2 > b.x);
          if (o && o.cued != null && !o.botTried) {
            o.botJ = o.botJ ?? (R() - 0.5) * (prof === 'bad_day' ? 0.3 : 0.12) + (prof === 'bad_day' ? 0.12 : 0);
            const reach = (o.x - o.w / 2 - b.x) / Math.max(30, b.v);
            if (reach < LEAD + o.botJ) {
              o.botTried = true;
              if (!(prof === 'bad_day' && st.obsId % 4 === 0)) st.jumpReq = now;
            }
          }
        } else if (st.state === 'give') want = true;
        else if (st.state === 'drift' && s.phase === 'dawn') want = true;
        const lag = prof === 'bad_day' ? 0.3 : 0;
        st.botQ.push([now, want]);
        while (st.botQ.length > 1 && st.botQ[1][0] <= now - lag) st.botQ.shift();
        const nh = st.botQ[0][1];
        if (nh && !st.botHeld) st.pressTs = now;
        if (!nh && st.botHeld) st.releaseTs = now;
        st.botHeld = nh;
      },

      drawBack(ctx, env) { drawBack(ctx, env); },
      drawMid(ctx, env) { drawMid(ctx, env); },
      drawFront(ctx, env) { drawFront(ctx, env); },
      drawOver(ctx, now) { drawOver(ctx, now); },

      record() {
        const r = st.rec, t = st.tally, rd = x => Math.round(x * 1000) / 1000;
        return {
          v: 2, seconds: rd(r.seconds), air_s: rd(r.air_s), presses: r.presses, jumps: r.jumps,
          obstacles: { n: t.n, cleared: t.cleared, hit: t.hit, by_kind: JSON.parse(JSON.stringify(t.by_kind)) },
          rt: rt ? rt.summary() : null,
          events: st.events.map(e => ({ ...e })), events_dropped: st.dropped,
          idle_max_s: rd(st.idleMax), rest_hold_ratio: r.restN ? rd(r.restHeld / r.restN) : null, rest_ui: 'kindle_v1',
          dawn_hold_s: rd(r.dawn_hold_s), dawn_s: rd(r.dawn_s),
          dda: { v: 2, L_start: rd(lv.L_start), L_end: rd(lv.t.L), d_mean: lv.ds.length ? rd(lv.ds.reduce((a, x) => a + x, 0) / lv.ds.length) : null, d_max: lv.ds.length ? rd(Math.max(...lv.ds)) : null, assist: assist() },
        };
      },

      debug() {
        return { state: st.state, v: Math.round(b.air ? Math.hypot(b.vx, b.vy) : b.v), alt: Math.round(b.y), air: b.air, x: Math.round(b.x), mode: st.P.m, held: st.held, station: st.station?.id ?? null, plan: st.plan?.kind ?? null, obs: st.obs.filter(o => !o.done).length, cleared: st.tally.cleared, hit: st.tally.hit, jumps: st.rec.jumps, L: lv.Ls };
      },
    };

    const view = env => {
      const u = env.u, ch = st.camH;
      return { X: wx => env.fx + (wx - b.x) * u, Y: h => env.gy - (h - ch) * u, S: x => env.surf ? env.surf(x * u) : env.gy - (T.h(x) - ch) * u };
    };

    function drawBack(ctx, env) {
      const now = A.now(), { X, Y } = view(env);
      for (const g of T.segs) if (g.station?.id || g.summit) drawProp(ctx, env, g.station || { id: 'summit', prop: 'summit' }, g, X, Y, now);
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

    function drawMid(ctx, env) {
      const now = A.now(), { X, S } = view(env), u = env.u;
      for (const o of st.obs) {
        const x = X(o.x);
        if (x < -80 * u || x > env.W + 80 * u) continue;
        const y = S(o.x), ang = Math.atan(T.d(o.x));
        ctx.save(); ctx.translate(x, y); ctx.rotate(-ang); ctx.scale(u, u);
        OBJ[o.kind](ctx, env, o, now);
        ctx.restore();
      }
    }

    const shadow = (ctx, env, w) => { ctx.fillStyle = env.col(COL.deep, 'blue', 0.28); ctx.beginPath(); ctx.ellipse(0, 1.5, w, 3, 0, 0, 2 * PI); ctx.fill(); };
    const OBJ = {
      rock(ctx, env, o) {
        const w = o.w / 2, h = o.h, q = o.seed;
        shadow(ctx, env, w * 1.25);
        ctx.fillStyle = env.col(COL.rock, 'base', 1);
        ctx.beginPath(); ctx.moveTo(-w, 2);
        ctx.bezierCurveTo(-w * 1.05, -h * 0.55, -w * (0.55 + 0.2 * q), -h * 1.05, -w * 0.05, -h);
        ctx.bezierCurveTo(w * 0.55, -h * 0.98, w * 1.05, -h * 0.5, w, 2);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = env.col(COL.stone, 'base', 1);
        ctx.beginPath(); ctx.moveTo(w * 0.1, 2); ctx.bezierCurveTo(w * 0.35, -h * 0.4, w * 0.6, -h * 0.75, w * 0.55, -h * 0.85);
        ctx.bezierCurveTo(w * 0.95, -h * 0.5, w * 1.02, -h * 0.2, w, 2); ctx.closePath(); ctx.fill();
        ctx.fillStyle = env.col(COL.snow, 'base', 0.95);
        ctx.beginPath(); ctx.ellipse(-w * 0.12, -h * 0.9, w * 0.62, h * 0.2, -0.08, PI, 0); ctx.fill();
        ctx.fillStyle = env.col(COL.rock, 'base', 1);
        ctx.beginPath(); ctx.ellipse(-w * 1.15, 1, w * 0.32, h * 0.26, 0, PI, 0); ctx.fill();
        ctx.fillStyle = env.col(COL.snow, 'base', 0.9);
        ctx.beginPath(); ctx.ellipse(-w * 1.15, -h * 0.17, w * 0.24, h * 0.08, 0, PI, 0); ctx.fill();
      },
      log(ctx, env, o) {
        const w = o.w / 2, h = o.h, r = h / 2;
        shadow(ctx, env, w * 1.1);
        ctx.fillStyle = env.col(COL.bark, 'yellow', 1);
        ctx.beginPath(); ctx.roundRect(-w, -h, 2 * w, h, r); ctx.fill();
        ctx.strokeStyle = env.col(COL.hut, 'yellow', 0.8); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(-w + r, -h * 0.4); ctx.lineTo(w * 0.4, -h * 0.45); ctx.moveTo(-w * 0.5, -h * 0.7); ctx.lineTo(w * 0.6, -h * 0.72); ctx.stroke();
        ctx.fillStyle = env.col(COL.cut, 'yellow', 1);
        ctx.beginPath(); ctx.ellipse(w - r * 0.4, -r, r * 0.55, r, 0, 0, 2 * PI); ctx.fill();
        ctx.strokeStyle = env.col(COL.wood, 'yellow', 0.9); ctx.lineWidth = 0.8;
        ctx.beginPath(); ctx.ellipse(w - r * 0.4, -r, r * 0.25, r * 0.5, 0, 0, 2 * PI); ctx.stroke();
        ctx.strokeStyle = env.col(COL.bark, 'yellow', 1); ctx.lineWidth = 2; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(-w * 0.3, -h); ctx.lineTo(-w * 0.42, -h - 6); ctx.stroke();
        ctx.fillStyle = env.col(COL.snow, 'base', 0.95);
        ctx.beginPath(); ctx.roundRect(-w + 2, -h - 2.5, 2 * w - r - 2, 4, 2); ctx.fill();
      },
      drift(ctx, env, o, now) {
        const w = o.w / 2, h = o.h, p = o.hitAt != null ? clamp((now - o.hitAt) / 0.5, 0, 1) : 0, hh = h * (1 - 0.45 * p);
        ctx.fillStyle = env.col(COL.deep, 'blue', 0.18);
        ctx.beginPath(); ctx.ellipse(w * 0.15, 1, w * 1.05, 3.5, 0, 0, 2 * PI); ctx.fill();
        ctx.fillStyle = env.col(COL.snow, 'base', 1);
        ctx.beginPath(); ctx.moveTo(-w * 1.1, 2); ctx.bezierCurveTo(-w * 0.6, -hh * 0.2, -w * 0.4, -hh, w * 0.15, -hh);
        ctx.bezierCurveTo(w * 0.55, -hh, w * 0.7, -hh * 0.5, w * 1.1, 2); ctx.closePath(); ctx.fill();
        ctx.fillStyle = env.col(COL.silver, 'base', 0.9);
        ctx.beginPath(); ctx.moveTo(-w * 0.55, -hh * 0.55); ctx.quadraticCurveTo(-w * 0.1, -hh * 1.12, w * 0.4, -hh * 0.92); ctx.quadraticCurveTo(-w * 0.05, -hh * 0.82, -w * 0.55, -hh * 0.55); ctx.fill();
        ctx.fillStyle = env.col(COL.ice, 'blue', 0.16);
        ctx.beginPath(); ctx.moveTo(w * 0.2, -hh * 0.9); ctx.bezierCurveTo(w * 0.6, -hh * 0.8, w * 0.75, -hh * 0.4, w * 1.1, 2); ctx.lineTo(w * 0.5, 2); ctx.closePath(); ctx.fill();
      },
      gap(ctx, env, o, now) {
        const w = o.w / 2, d = 44, q = o.seed;
        ctx.fillStyle = env.col(COL.deep, 'blue', 1);
        ctx.beginPath(); ctx.moveTo(-w, 0);
        ctx.lineTo(-w * 0.78, d * 0.3); ctx.lineTo(-w * (0.62 + 0.1 * q), d * 0.55); ctx.lineTo(-w * 0.3, d * 0.8); ctx.lineTo(0, d);
        ctx.lineTo(w * 0.28, d * 0.78); ctx.lineTo(w * (0.55 + 0.1 * q), d * 0.5); ctx.lineTo(w * 0.8, d * 0.25); ctx.lineTo(w, 0);
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = env.col(COL.ice, 'blue', 0.55); ctx.lineWidth = 1.4; ctx.lineJoin = 'round';
        ctx.beginPath(); ctx.moveTo(-w, 0); ctx.lineTo(-w * 0.78, d * 0.3); ctx.lineTo(-w * (0.62 + 0.1 * q), d * 0.55);
        ctx.moveTo(w, 0); ctx.lineTo(w * 0.8, d * 0.25); ctx.lineTo(w * (0.55 + 0.1 * q), d * 0.5); ctx.stroke();
        const p = o.hitAt != null ? clamp((now - o.hitAt) / 0.5, 0, 1) : 0, sag = 4 + 5 * Math.sin(PI * p);
        ctx.strokeStyle = env.col(COL.snow, 'base', 0.45); ctx.lineWidth = 2; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(-w + 1, 0.5); ctx.quadraticCurveTo(0, sag, w - 1, 0.5); ctx.stroke();
        ctx.fillStyle = env.col(COL.snow, 'base', 0.95);
        for (const s of [-1, 1]) { ctx.beginPath(); ctx.ellipse(s * (w + 3), -0.5, 7, 2.6, 0, PI, 0); ctx.fill(); }
      },
    };

    function drawFront(ctx, env) {
      const now = A.now(), u = env.u, { X, Y } = view(env);
      const [lx, ly] = A.World.lanternPos();
      for (const p of st.spray) {
        const q = p.age / p.life;
        env.glow(ctx, X(p.x), Y(p.y), p.size * u * (1 - 0.4 * q), p.c, 0.75 * (1 - q) * Math.min(1, q * 8 + 0.3));
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
        const sunX = env.W * 0.72, sunY = env.hy - env.H * 0.06, a = 0.16 * (0.5 + 0.5 * st.lift);
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
      if (st.state === 'ride' && st.rec.jumps < 2 && !b.air) {
        const o = st.obs.find(q => !q.done && q.x > b.x);
        const reach = o ? (o.x - o.w / 2 - b.x) / Math.max(30, b.v) : 9;
        if (reach < 1.1 && reach > 0) { fa = 0.75; press = reach < LEAD + 0.15 ? 1 : 0.5 + 0.5 * Math.sin(PI * clamp((1.1 - reach) / 0.6, 0, 1)); }
      }
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
