(() => {
  const { clamp, lerp, rgb, mixc, median } = A;
  const J = A.J, { C, sprite, unit, dragCue, base, finish, fx, hap, sfx, rm } = J;
  const E = J.ease, R = Math.random, ID = 'threads', TAU = Math.PI * 2;
  const AUTO_RATE = 12, MIN_CELL = 46;

  A.Skill?.define(ID, {
    grid: { steps: [[0, 5], [0.55, 6]], cat: 'load' },
    pairs: { steps: [[0, 4], [0.25, 5], [0.8, 6]], cat: 'load' },
    traps: { v0: 1, v1: 3, int: true, cat: 'load' },
    hint: { steps: [[0, 8], [0.4, 12], [0.7, 0]], cat: 'load' },
  });
  const ax = (name, fb) => (A.Skill ? A.Skill.axis(ID, name, fb) : fb);

  const BANK = [
    [5, 4, 1, [
      '6bgfk lmhcdi noje9438 72105a/0102',
      '6bghid 8349ej onml kfa50127c/0102',
      'mlkfa50123 49876b ghcd ejoni/2001',
      'a50123498 dejo nihmlk fgbc76/2011',
      'gbafk lmhc76 501238di noje94/1020',
      'chm lkfgb678 din oje9432105a/0102',
    ]],
    [5, 5, 1, [
      'oje94 321056 78d cbafkl ghmni/01021',
      '4321 05afkl gb6789edi jon mhc/00200',
      '650 12349ejonm lkf abc78 dihg/02000',
      'cba501 6723 498d ejonmlkf ghi/20000',
      'ihgb cdejonmlk fa5012 349 876/02000',
      'a50127cd 834 9ejonih mlk fgb6/20100',
    ]],
    [5, 5, 2, [
      '49edi jonmhc7 83216b glk fa50/02200',
      '678dih mnoje943 210 5afk lgbc/22000',
      'onmhcd 876 bglkf a501 2349eji/20102',
      '678 dchmlkf gba5012 349ej oni/02200',
      '87650 12349ed ijo nmlg hcbafk/02002',
      '8dihgb61 05a fklmnoje 943 27c/20200',
    ]],
    [6, 5, 2, [
      '06cijp ouvwqk lrxyzt smnhb543217def ga98/02200',
      'smga 9flrqpj ke82345bh ntzyxwvuo icd7106/02221',
      'yztsrxwvuoi c601 782345bag hnmlk qpjdef9/10202',
      'b54 a93287 106ciouvwxyz tsrqpjdefg hnmlk/01220',
      'ijkl rqpo uvwxyztsmnhb5439 agfe87 dc6012/00202',
      'ghb 54a9321 06ciouvwxrs yztnmlfe8 7djkqp/01221',
    ]],
    [6, 5, 3, [
      '7djkqpo uvwxyz tnhb5439 agmsr lfe82106ci/10202',
      'xwvuoicde8 76012 39fg a45bhntzysrqpj klm/21020',
      'uoicd jpvwxr qklmga9 fe8760 12345bhntzys/02202',
      'efghn mlkjd789a b5432106ciou vpq rstzyxw/02201',
      'smlf987d ekjp oic6012 345ba ghntzyxrqwvu/20012',
      'qrxwvuoic6 01782345ba 9fghntzy smlke djp/21200',
    ]],
    [6, 6, 3, [
      'qpj iouvwxrs yztnmlke fghb543 2106cd7 89a/002210',
      'wqk lfe 87djpvuo ic60 1239agmsrx yztnhb54/001022',
      'pjkl f934 5ba ghnmstzyx rqwvuoic67 de8210/000122',
      '328 7106ciouvw xrqpjde klf9a4 5bhgm syztn/022001',
      'a987djpq kefgh b543 2106ciouvwx yzt nmlrs/200201',
      '345bhg a9fed 78210 6ciouvwqp jklrs mntzyx/201102',
    ]],
  ];

  const COLS = [C.green, C.amber, C.violet200, C.ice, C.silver100, C.peach];

  const symCell = (c, n, s) => {
    let x = c % n, y = (c / n) | 0;
    if (s & 4) [x, y] = [y, x];
    if (s & 1) x = n - 1 - x;
    if (s & 2) y = n - 1 - y;
    return y * n + x;
  };
  const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = (R() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };

  const recent = [];
  const pick = (n, k, traps) => {
    let pool = BANK.filter(t => t[0] === n && t[1] === k);
    if (!pool.length) pool = BANK.filter(t => t[0] === 5 && t[1] === Math.min(k, 5));
    if (!pool.length) pool = BANK;
    const tier = pool.reduce((a, t) => (Math.abs(t[2] - traps) < Math.abs(a[2] - traps) ? t : a), pool[0]);
    const fresh = tier[3].map((_, i) => i).filter(i => !recent.includes(`${tier[0]}${tier[1]}${tier[2]}#${i}`));
    const idx = fresh.length ? fresh[(R() * fresh.length) | 0] : (R() * tier[3].length) | 0, sym = (R() * 8) | 0, [paths, tr] = tier[3][idx].split('/');
    const cols = shuffle([0, 1, 2, 3, 4].concat(tier[1] > 5 ? [5] : []));
    const sol = paths.split(' ').map(p => [...p].map(ch => symCell(parseInt(ch, 36), tier[0], sym)));
    recent.push(`${tier[0]}${tier[1]}${tier[2]}#${idx}`);
    if (recent.length > 4) recent.shift();
    return { n: tier[0], sol, trap: [...tr].map(Number), cols, id: `${tier[0]}x${tier[0]}p${tier[1]}t${tier[2]}#${idx}`, sym };
  };

  const glyphPath = (x, i, r) => {
    x.beginPath();
    if (i === 0) x.arc(0, 0, r * 0.92, 0, TAU);
    else if (i === 1) { const q = r * 1.08; x.moveTo(0, -q); x.lineTo(q, 0); x.lineTo(0, q); x.lineTo(-q, 0); x.closePath(); }
    else if (i === 2) {
      const q = r * 1.15, w = r * 0.32;
      x.moveTo(0, -q); x.quadraticCurveTo(w, -w, q, 0); x.quadraticCurveTo(w, w, 0, q); x.quadraticCurveTo(-w, w, -q, 0); x.quadraticCurveTo(-w, -w, 0, -q); x.closePath();
    } else if (i === 3) { x.arc(0, 0, r * 0.95, 0, TAU); x.moveTo(r * 0.52, 0); x.arc(0, 0, r * 0.52, 0, TAU, true); x.moveTo(r * 0.28, 0); x.arc(0, 0, r * 0.28, 0, TAU); }
    else if (i === 4) { x.moveTo(0, -r * 1.12); x.bezierCurveTo(r * 0.5, -r * 0.45, r * 0.9, 0, r * 0.9, r * 0.32); x.arc(0, r * 0.32, r * 0.9, 0, Math.PI); x.bezierCurveTo(-r * 0.9, 0, -r * 0.5, -r * 0.45, 0, -r * 1.12); x.closePath(); }
    else { const q = r * 1.05; x.moveTo(0, -q); x.lineTo(q * 0.95, q * 0.62); x.lineTo(-q * 0.95, q * 0.62); x.closePath(); }
  };

  let slices = null;
  const artSlices = () => {
    if (slices !== null) return slices;
    if (!A.Art?.has('task_threads_knot_glyphs')) return null;
    slices = false;
    try {
      const h = 96, w = Math.round(h * A.Art.aspect('task_threads_knot_glyphs')), cv = document.createElement('canvas');
      cv.width = w; cv.height = h;
      const x = cv.getContext('2d', { willReadFrequently: true });
      A.Art.draw(x, 'task_threads_knot_glyphs', 0, 0, w, h);
      const d = x.getImageData(0, 0, w, h).data, col = new Float32Array(w), runs = [];
      for (let i = 0; i < w; i++) for (let y = 0; y < h; y += 2) col[i] += d[(y * w + i) * 4 + 3];
      let s0 = -1;
      for (let i = 0; i <= w; i++) {
        const on = i < w && col[i] > 255;
        if (on && s0 < 0) s0 = i;
        if (!on && s0 >= 0) { if (i - s0 > 6) runs.push([s0, i]); s0 = -1; }
      }
      if (runs.length === 5) slices = { cv, h, runs };
    } catch { slices = false; }
    return slices;
  };

  const knotCache = new Map();
  const knotSprite = (gi, c, r) => {
    const S = Math.max(8, Math.round(r / 2) * 2), key = gi + '|' + c.join() + '|' + S;
    let cv = knotCache.get(key);
    if (cv) return cv;
    cv = document.createElement('canvas'); cv.width = cv.height = S * 4;
    const x = cv.getContext('2d'), sl = gi < 5 ? artSlices() : null;
    x.translate(S * 2, S * 2);
    if (sl) {
      const [a, b] = sl.runs[gi], sw = b - a, k = (S * 2.3) / Math.max(sw, sl.h);
      glyphPath(x, gi, S * 0.82); x.fillStyle = rgb(mixc(c, C.night900, 0.25), 0.95); x.fill('evenodd');
      const tmp = document.createElement('canvas'); tmp.width = tmp.height = S * 4;
      const t = tmp.getContext('2d');
      t.drawImage(sl.cv, a, 0, sw, sl.h, S * 2 - (sw * k) / 2, S * 2 - (sl.h * k) / 2, sw * k, sl.h * k);
      t.globalCompositeOperation = 'source-in'; t.fillStyle = rgb(mixc(c, C.silver050, 0.35)); t.fillRect(0, 0, S * 4, S * 4);
      x.drawImage(tmp, -S * 2, -S * 2);
    } else {
      glyphPath(x, gi, S); x.fillStyle = rgb(c); x.fill('evenodd');
      x.lineWidth = S * 0.16; x.lineJoin = 'round'; x.strokeStyle = rgb(mixc(c, C.silver050, 0.5), 0.9); x.stroke();
    }
    knotCache.set(key, cv);
    if (knotCache.size > 60) knotCache.delete(knotCache.keys().next().value);
    return cv;
  };

  const pegCache = { key: '', cv: null };
  const pegLayer = L => {
    const key = L.n + '|' + Math.round(L.cs);
    if (pegCache.key === key) return pegCache.cv;
    const dpr = Math.min(2, window.devicePixelRatio || 1), cv = document.createElement('canvas'), s = L.side;
    cv.width = cv.height = Math.ceil(s * dpr);
    const x = cv.getContext('2d');
    x.scale(dpr, dpr);
    x.strokeStyle = rgb(C.silver600, 0.1); x.lineWidth = 1;
    for (let i = 1; i < L.n; i++) {
      const p = Math.round(i * L.cs) + 0.5;
      x.beginPath(); x.moveTo(p, 4); x.lineTo(p, s - 4); x.moveTo(4, p); x.lineTo(s - 4, p); x.stroke();
    }
    x.strokeStyle = rgb(C.silver300, 0.05); x.lineWidth = 0.8;
    for (let i = 0; i < L.n; i++) { const p = (i + 0.5) * L.cs; x.beginPath(); x.moveTo(p, 2); x.lineTo(p, s - 2); x.stroke(); }
    x.fillStyle = rgb(C.silver600, 0.25);
    for (let i = 0; i < L.n * L.n; i++) { x.beginPath(); x.arc((i % L.n + 0.5) * L.cs, (((i / L.n) | 0) + 0.5) * L.cs, Math.max(1.6, L.cs * 0.055), 0, TAU); x.fill(); }
    pegCache.key = key; pegCache.cv = cv;
    return cv;
  };

  const frame = (ctx, L, warm, a) => {
    const pad = L.side * 0.085, x = L.gx - pad, y = L.gy - pad, s = L.side + 2 * pad;
    ctx.fillStyle = rgb(C.night950, 0.62 * a);
    ctx.beginPath(); ctx.roundRect(L.gx - 4, L.gy - 4, L.side + 8, L.side + 8, L.cs * 0.18); ctx.fill();
    if (A.Art?.has('task_threads_loom_frame')) {
      const fp = L.side * 0.12, fs = L.side + 2 * fp;
      ctx.save(); ctx.globalAlpha *= a;
      A.Art.draw(ctx, 'task_threads_loom_frame', L.gx - fp, L.gy - fp, fs, fs, lerp(0.45, 0.8, warm), lerp(0.2, 0.42, warm), 1);
      ctx.restore();
      return;
    }
    ctx.lineJoin = 'round';
    ctx.strokeStyle = rgb(mixc(C.woodL, C.flame, 0.25 * warm), 0.9 * a); ctx.lineWidth = pad * 0.9;
    ctx.beginPath(); ctx.roundRect(x + pad * 0.45, y + pad * 0.45, s - pad * 0.9, s - pad * 0.9, pad * 1.2); ctx.stroke();
    ctx.strokeStyle = rgb(C.flame, (0.1 + 0.2 * warm) * a); ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.roundRect(x + pad * 0.12, y + pad * 0.12, s - pad * 0.24, s - pad * 0.24, pad * 1.4); ctx.stroke();
  };

  const popScale = t => {
    if (t < 0 || t > 0.5) return 1;
    if (t < 0.1) return 1 + 0.45 * E.outSoft(t / 0.1);
    const q = t - 0.1;
    return 1 + 0.45 * Math.exp(-q * 14) * Math.cos(q * 22);
  };
  const touchPop = t => {
    if (t < 0 || t > 0.4) return 1;
    if (t < 0.05) return 1 - 0.15 * (t / 0.05);
    const q = t - 0.05;
    return 1 + 0.3 * Math.sin(Math.min(1, q / 0.07) * Math.PI / 2) * Math.exp(-Math.max(0, q - 0.07) * 14);
  };
  const strokePath = (ctx, pts, w, c, a) => {
    if (pts.length < 2 || a <= 0.003) return;
    ctx.strokeStyle = rgb(c, a); ctx.lineWidth = w;
    ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.stroke();
  };
  const along = (pts, m) => {
    if (pts.length < 2) return pts[0] || [0, 0];
    const f = clamp(m, 0, 1) * (pts.length - 1), i = Math.min(pts.length - 2, f | 0), q = f - i;
    return [lerp(pts[i][0], pts[i + 1][0], q), lerp(pts[i][1], pts[i + 1][1], q)];
  };

  A.defineTask(ID, {
    modes: ['flow'], role: 'Flow Free; Monument Valley solve; Dots line feel',
    make(k) {
      let n = ax('grid', 5), np = ax('pairs', k < 0.35 ? 4 : 5), traps = ax('traps', 1);
      const W = A.World?.size?.() || { W: 390, H: 844 }, bx = A.session?.box?.() || { w: W.W * 0.86, h: W.H * 0.46 };
      if (n === 6 && Math.min(bx.w, bx.h) / 1.2 / 6 < MIN_CELL) { n = 5; np = Math.min(np, 5); traps = 2; }
      const left = A.session?.playLeft ? A.session.playLeft(A.now()) + 3 : Infinity;
      if (left < 14) { n = 5; np = 4; traps = 1; }
      const P = pick(n, np, traps), N = P.n, assisted = !!A.Skill?.assisted?.();
      const hintAx = ax('hint', 8), hintS = assisted ? 5 : hintAx > 0 ? hintAx : Infinity;
      const pairs = P.sol.map((sol, i) => ({
        i, sol, a: sol[0], b: sol[sol.length - 1], c: COLS[P.cols[i]], gi: P.cols[i], trap: P.trap[i] || 0,
        pipe: [], joined: false, ever: false, drags: 0, cut: false, hinted: false, wrong: false, auto: false, grade: null,
        sq: -9, pop: -9, dimAt: -9, wobAt: -9, beadAt: -9, joinAt: -9, head: null, tint: new Map(),
      }));
      const knot = new Int8Array(N * N).fill(-1);
      for (const p of pairs) { knot[p.a] = p.i; knot[p.b] = p.i; }
      const man = (a, b) => Math.abs((a % N) - (b % N)) + Math.abs(((a / N) | 0) - ((b / N) | 0));
      const cue = pairs.filter(p => !p.trap).sort((x, y) => x.sol.length - y.sol.length)[0] || pairs[0];
      const fresh = (A.Skill?.task?.(ID)?.n ?? 0) < 10;

      const g = base(ID, N === 6 ? 20 : 16, {
        n: N, pairs, knot, puzzle: P, cueP: cue, cueAt: fresh ? 0.6 : 2.4, hintS,
        drag: null, b: null, fing: null, ghosts: [], hint: null, lastProg: 0, autoPhase: false, autoQ: [], anim: null,
        first: null, cells: 0, cellMs: [], lastCellT: null, loose: 0, wrongEnd: 0, cuts: 0, hints: 0, autoJoined: 0,
        tier: 0, feverUntil: -9, perfRun: 0, doneAt: null, pay: null, bot: null, outro: 1.8, rippleAt: -9, ripple: null, rtId: null,

        layout(b) {
          b = b || this.b || A.session?.box?.();
          const side = Math.min(b.w / 1.2, b.h / 1.2), cs = side / N;
          const gx = b.x + (b.w - side) / 2, gy = b.y + (b.h - side) / 2;
          return { n: N, side, cs, gx, gy, U: unit(b), b, X: c => gx + ((c % N) + 0.5) * cs, Y: c => gy + (((c / N) | 0) + 0.5) * cs };
        },
        cellAt(L, x, y, clampIt) {
          let cx = Math.floor((x - L.gx) / L.cs), cy = Math.floor((y - L.gy) / L.cs);
          if (!clampIt && (cx < 0 || cy < 0 || cx >= N || cy >= N)) return -1;
          cx = clamp(cx, 0, N - 1); cy = clamp(cy, 0, N - 1);
          return cy * N + cx;
        },
        xy(u, v) { const b = this.b || A.session?.box?.(); return [b.x + u * b.w, b.y + v * b.h]; },
        other(p, c) { return c === p.a ? p.b : p.a; },
        owner(c) {
          if (knot[c] >= 0) return knot[c];
          for (const p of pairs) if (p.pipe.includes(c)) return p.i;
          return -1;
        },
        arm(now) { this.rt?.drop(this.rtId); this.rtId = (this.rtId ?? -1) + 1; this.rt?.cue(this.rtId, 'choice', now); },
        complete(p) { return p.pipe.length >= 2 && p.pipe[p.pipe.length - 1] === this.other(p, p.pipe[0]); },

        setPipe(p, cells, now) {
          const old = p.pipe;
          for (const c of cells) if (!p.tint.has(c)) p.tint.set(c, this.at ?? J.at);
          for (const c of [...p.tint.keys()]) if (!cells.includes(c)) p.tint.delete(c);
          p.pipe = cells;
          if (cells.length < old.length && old.length > 1 && !(cells.length && old[0] !== cells[0])) return old.slice(Math.max(0, cells.length - 1));
          return null;
        },

        applyCuts(p, snap, now, sys) {
          const mine = new Set(p.pipe);
          for (const q of pairs) {
            if (q === p) continue;
            const src = snap ? snap[q.i] : q.pipe;
            let idx = -1;
            for (let i = 1; i < src.length; i++) if (mine.has(src[i])) { idx = i; break; }
            const next = idx < 0 ? src.slice() : src.slice(0, idx), before = q.pipe.length;
            if (next.length === before && next.every((c, i) => c === q.pipe[i])) continue;
            const removed = this.setPipe(q, next, now);
            if (next.length < before) {
              if (removed) this.ghosts.push({ pts: removed, c: q.c, at: this.at, w: q.joined ? 1 : 0.8 });
              q.dimAt = this.at;
              if (!sys) { hap.seq([['tick', 0], ['tick', 40]]); sfx('threads_cut', { pair: q.i }); }
              if (this.drag && this.drag.p === q) this.drag = null;
            }
            const was = q.joined;
            q.joined = this.complete(q);
            if (was && !q.joined) q.beadAt = -9;
          }
        },

        stepTo(p, target, now, ts) {
          let guard = N * 3;
          while (guard-- > 0) {
            if (!this.drag || this.drag.p !== p || this.done) return;
            const head = p.pipe[p.pipe.length - 1];
            if (head === target) return;
            const hx = head % N, hy = (head / N) | 0, tx = target % N, ty = (target / N) | 0, dx = tx - hx, dy = ty - hy;
            const opts = [];
            const hor = dx ? head + Math.sign(dx) : -1, ver = dy ? head + Math.sign(dy) * N : -1;
            if (Math.abs(dx) >= Math.abs(dy)) opts.push(hor, ver); else opts.push(ver, hor);
            let moved = false;
            for (const c of opts) if (c >= 0 && this.enter(p, c, now, ts)) { moved = true; break; }
            if (!moved) return;
          }
        },

        enter(p, c, now, ts) {
          const D = this.drag, at = p.pipe.indexOf(c);
          if (at >= 0) { this.setPipe(p, p.pipe.slice(0, at + 1), now); this.applyCuts(p, D.snap, now); p.joined = this.complete(p); return true; }
          if (this.complete(p)) return false;
          const twin = this.other(p, p.pipe[0]);
          if (knot[c] >= 0 && c !== twin) { D.over = c; return false; }
          this.setPipe(p, p.pipe.concat(c), now);
          this.applyCuts(p, D.snap, now);
          D.cells++;
          if (!D.sys) {
            this.cells++;
            const t = ts ?? now;
            if (this.lastCellT != null && D.cells > 1) this.cellMs.push(Math.round((t - this.lastCellT) * 1000));
            this.lastCellT = t;
            hap('tick');
            sfx('threads_pluck', { step: Math.min(12, p.pipe.length - 1), pair: p.i });
          }
          if (c === twin) this.join(p, now, !!D.sys);
          return true;
        },

        join(p, now, sys) {
          p.joined = true; p.joinAt = this.at; p.beadAt = this.at; p.pop = this.at;
          const L = this.layout(), first = !p.ever;
          let grade = null, res = null;
          if (first) {
            p.ever = true;
            if (sys) { grade = 'miss'; this.autoJoined++; p.auto = true; }
            else {
              this.items++;
              const drags = p.drags + 1;
              grade = p.cut || p.hinted || p.wrong ? 'barely' : drags <= 1 ? 'perfect' : 'good';
            }
            p.grade = grade;
            this.lastProg = this.t;
            res = A.Skill?.trial(ID, grade) || null;
            if (res) { this.tier = res.tier; if (res.fever) this.feverUntil = this.t + 2.5; }
            const joinedFirst = pairs.filter(q => q.ever).length;
            if (A.Skill?.progress(ID, joinedFirst, pairs.length)) J.stinger();
            this.perfRun = grade === 'perfect' ? this.perfRun + 1 : 0;
          }
          const all = pairs.every(q => q.joined);
          const x = L.X(p.pipe[p.pipe.length - 1]), y = L.Y(p.pipe[p.pipe.length - 1]), fever = this.t < this.feverUntil;
          const sparks = (grade === 'barely' ? 5 : grade === 'miss' ? 3 : 10) * (fever ? 1.6 : 1);
          fx.burst(x, y, Math.round(sparks), mixc(p.c, C.silver050, 0.4), 150 * L.U, { life: 0.45, size: [2.6 * L.U, 0.6 * L.U] });
          if (grade !== 'miss') J.bloom(x, y, L.cs * (grade === 'perfect' ? 1.3 : 1) * (fever ? 1.2 : 1), p.c, grade === 'perfect' ? 0.5 : 0.36, 0.14, 0.5);
          if (grade === 'perfect') fx.add({ x, y: y - L.cs * 0.1, kind: 'spark', c: C.silver050, life: 0.45, size: [L.cs * 0.55, L.cs * 0.1], alpha: [1, 0] });
          if (grade === 'barely') p.wobAt = this.at;
          if (!all) {
            if (!sys) hap.seq(grade === 'perfect' ? [['medium', 0], ['tick', 40]] : [['medium', 0]]);
            sfx('threads_join', { pair: p.i, harmony: this.perfRun, piano: [5 + 2 * Math.min(6, pairs.filter(q => q.joined).length), 0.15] });
          }
          this.sync();
          if (all) this.win(now);
          else if (!sys) this.arm(now);
        },

        win(now) {
          if (this.done) return;
          const covered = new Set();
          for (const p of pairs) for (const c of p.pipe) covered.add(c);
          const full = covered.size === N * N, perfect = full && pairs.every(p => p.grade === 'perfect');
          const share = A.Skill?.cur?.id === ID ? A.Skill.lightShare(A.Skill.cur) : this.items / pairs.length;
          this.pay = { full, perfect, size: share >= 0.8 ? 2 : share >= 0.5 ? 1 : 0, share, marked: false };
          this.doneAt = this.at;
          this.drag = null; this.hint = null;
          finish(this, now);
          J.hitstop(this, 100);
          hap.seq([['light', 250], ['medium', 340], ['heavy', 430]]);
          sfx('threads_chord', { piano: [7, 0.18] });
          J.border(1);
          this.sync();
        },

        startDrag(p, cells, now, sys) {
          const snap = pairs.map(q => q.pipe.slice());
          this.setPipe(p, cells, now);
          p.joined = this.complete(p);
          this.applyCuts(p, snap, now, sys);
          this.drag = { p, snap, cells: 0, over: -1, sys, t0: now };
          this.lastCellT = null;
          p.sq = this.at;
        },

        down(u, v, t, d) {
          if (this.done) return;
          const now = d?.t ?? t ?? A.now();
          this.lastIn = this.t;
          if (this.first === null) this.first = Math.round((now - (this.startAt ?? now)) * 1000);
          if (this.rtId === null) this.arm(this.startAt ?? now);
          const L = this.layout(), [x, y] = this.xy(u, v), c = this.cellAt(L, x, y);
          this.fing = [x, y];
          if (c < 0) { this.ripple = [x, y]; this.rippleAt = this.at; return; }
          const ki = knot[c];
          if (ki >= 0) {
            const p = pairs[ki];
            if (p.anim) return;
            this.rt?.hit(this.rtId, now);
            this.startDrag(p, [c], now);
            hap('light');
            sfx('threads_pluck', { step: 0, pair: p.i });
          } else {
            const oi = this.owner(c);
            if (oi < 0 || pairs[oi].anim) { this.ripple = [x, y]; this.rippleAt = this.at; return; }
            const p = pairs[oi];
            this.rt?.hit(this.rtId, now);
            this.startDrag(p, p.pipe.slice(0, p.pipe.indexOf(c) + 1), now);
            hap('tick');
          }
          this.sync();
        },

        move(u, v, t, d) {
          const [x, y] = this.xy(u, v);
          this.fing = [x, y];
          const D = this.drag;
          if (!D || this.done) return;
          const L = this.layout(), c = this.cellAt(L, x, y, true);
          D.over = -1;
          this.stepTo(D.p, c, d?.t ?? t ?? A.now(), d?.ts);
          if (knot[c] >= 0 && knot[c] !== D.p.i) D.over = c;
        },

        up(u, v, t, d) {
          const D = this.drag;
          this.fing = null;
          if (!D) return;
          const now = d?.t ?? t ?? A.now(), p = D.p;
          if (u !== undefined) {
            const L = this.layout(), [x, y] = this.xy(u, v), c = this.cellAt(L, x, y);
            if (c >= 0 && knot[c] >= 0 && knot[c] !== p.i) D.over = c;
          }
          this.drag = null;
          if (D.cells > 0 || D.over >= 0) p.drags++;
          for (const q of pairs) if (q !== p && q.pipe.length < D.snap[q.i].length) { this.cuts++; this.errors++; q.cut = true; p.cut = true; }
          if (!this.complete(p) && !this.done) {
            if (D.over >= 0 && knot[D.over] !== p.i) {
              this.wrongEnd++; this.errors++; p.wrong = true; p.wobAt = this.at;
              hap('tick'); sfx('threads_muted', { pair: p.i });
            } else if (p.pipe.length > 1) this.loose++;
          }
          this.sync();
        },

        autoJoin(p) {
          if (p.anim || p.joined) return;
          p.anim = { i: 1, f: 0 };
          if (this.drag?.p === p) this.drag = null;
          const start = p.sol[0];
          this.setPipe(p, [start], A.now());
          this.applyCuts(p, null, A.now(), true);
        },

        stepAnim(p, dt, now) {
          const a = p.anim;
          a.f += dt * AUTO_RATE;
          while (a.f >= 1 && a.i < p.sol.length) {
            a.f -= 1;
            const c = p.sol[a.i++];
            this.setPipe(p, p.sol.slice(0, a.i), now);
            this.applyCuts(p, null, now, true);
            if (this.drag && this.drag.p !== p) {
              const D = this.drag;
              D.snap = pairs.map(q => q.pipe.slice());
            }
            if (c === p.sol[p.sol.length - 1]) { p.anim = null; this.join(p, now, true); return; }
          }
        },

        need() {
          const rest = pairs.filter(p => !p.joined && !p.anim);
          if (rest.length <= 1) return 0;
          const sorted = rest.slice().sort((a, b) => a.sol.length - b.sol.length), keep = sorted[0];
          return rest.filter(p => p !== keep).reduce((s, p) => s + p.sol.length / AUTO_RATE + 0.3, 0) + 2.6;
        },

        update(dt, now) {
          this.tick(dt, now);
          if (this.done) return;
          if (this.rtId === null) this.arm(this.startAt ?? now);
          if (this.t >= this.max && !this.drag) this.rt?.lapse(this.rtId);
          for (const p of pairs) if (p.anim) this.stepAnim(p, dt, now);
          if (this.done) return;
          if (!this.autoPhase && this.t >= this.max - this.need()) {
            this.autoPhase = true;
            const rest = pairs.filter(p => !p.joined && !p.anim);
            const keep = (this.drag && rest.includes(this.drag.p)) ? this.drag.p : rest.slice().sort((a, b) => a.sol.length - b.sol.length)[0];
            this.autoQ = rest.filter(p => p !== keep);
          }
          if (this.autoPhase && !pairs.some(p => p.anim)) {
            const nx = this.autoQ.shift();
            if (nx && !nx.joined && pairs.filter(q => !q.joined).length > 1) this.autoJoin(nx);
          }
          if (!this.drag && !this.hint && this.t - this.lastProg >= this.hintS && this.t > 1) {
            const open = pairs.filter(p => !p.joined && !p.anim);
            const p = open.find(q => q.trap) || open[0];
            if (p) { this.hint = { p, at: this.at }; p.hinted = true; this.hints++; this.lastProg = this.t; this.sync(); }
          }
          if (this.hint && this.at - this.hint.at > 1.3) this.hint = null;
        },

        outroUpdate(dt, now) { this.tick(dt, now); },

        tick(dt, now) {
          const joined = pairs.filter(p => p.joined).length;
          J.border(this.done ? 1 : 0.8 * joined / pairs.length + 0.05 * this.tier);
          if (this.pay && !this.pay.marked && this.at - this.doneAt > 1.25) {
            this.pay.marked = true;
            J.spill(clamp(0.35 + 0.5 * this.pay.share + (this.pay.perfect ? 0.3 : 0), 0, 1));
            const L = this.layout();
            A.World?.hooks?.addSkyMark?.('aurora', clamp((L.gx + L.side / 2) / (A.World.size?.().W || 390), 0, 1), 0.08 + 0.04 * R());
          }
        },

        sync() {
          const short = pairs.reduce((s, p) => s + (p.ever && !p.auto ? this.manh(p) + 1 : 0), 0), covered = new Set();
          for (const p of pairs) for (const c of p.pipe) covered.add(c);
          this.extra = {
            v: 2, pairs: pairs.length, grid: N, puzzle_id: this.puzzle.id, sym: this.puzzle.sym, traps: pairs.filter(p => p.trap === 2).length,
            loose_releases: this.loose, wrong_end: this.wrongEnd, cuts: this.cuts,
            path_efficiency: this.cells && short ? Math.round((short / this.cells) * 1000) / 1000 : null,
            fill_ratio: Math.round((covered.size / (N * N)) * 1000) / 1000,
            first_touch_ms: this.first, median_cell_ms: this.cellMs.length ? median(this.cellMs) : null,
            hints_shown: this.hints, auto_joined: this.autoJoined,
          };
        },
        manh(p) { return man(p.a, p.b); },

        auto(dt, now) {
          if (this.done) return;
          let B = this.bot;
          if (!B) {
            const bag = shuffle(['perfect', 'perfect', 'good', 'good', 'good', 'good', 'good', 'good', 'good', 'good', 'good', 'barely', 'barely', 'miss', 'miss', 'miss', 'miss', 'perfect', 'good', 'miss']);
            B = this.bot = { bag, wait: 0.55 + 0.3 * R(), g: null, order: shuffle(pairs.slice()) };
          }
          if (B.g) { this.botStep(B, dt, now); return; }
          B.wait -= dt;
          if (B.wait > 0 || pairs.some(p => p.anim)) return;
          const p = B.order.find(q => !q.joined && !q.anim && !this.autoQ.includes(q));
          if (!p) return;
          const last = pairs.filter(q => !q.joined).length === 1;
          let gr = p.ever ? 'redo' : B.bag.pop() || 'good';
          if (last && gr === 'miss') gr = 'good';
          if (gr === 'miss') { this.autoJoin(p); B.wait = 0.5 + 0.3 * R(); return; }
          const L = this.layout(), pt = c => [(L.X(c) - L.b.x) / L.b.w, (L.Y(c) - L.b.y) / L.b.h];
          const sol = p.sol, pre = this.prefix(p), rate = 6 + 3 * R(), seq = [];
          if (gr === 'good') {
            const mid = Math.max(pre + 1, Math.floor(sol.length / 2));
            seq.push({ pts: sol.slice(pre, mid + 1).map(pt), rate });
            seq.push({ pause: 0.3 + 0.25 * R() });
            seq.push({ pts: sol.slice(mid).map(pt), rate });
          } else if (gr === 'barely') {
            const mid = Math.max(pre + 1, Math.floor(sol.length / 2)), ko = pairs.filter(q => q !== p).map(q => q.a);
            const near = ko.sort((a, b) => man(a, sol[mid]) - man(b, sol[mid]))[0];
            seq.push({ pts: sol.slice(pre, mid + 1).map(pt).concat([pt(near)]), rate });
            seq.push({ pause: 0.35 });
            seq.push({ resume: true, rate });
          } else seq.push({ pts: sol.slice(pre).map(pt), rate });
          B.g = { p, seq, cur: null };
        },

        prefix(p) {
          if (!p.pipe.length || p.pipe[0] !== p.sol[0]) return 0;
          let i = 0;
          while (i + 1 < p.pipe.length && p.pipe[i + 1] === p.sol[i + 1]) i++;
          return i;
        },

        botStep(B, dt, now) {
          const G = B.g;
          if (!G.cur) {
            const s = G.seq.shift();
            if (!s) { B.g = null; B.wait = 0.35 + 0.35 * R(); return; }
            if (s.resume) {
              const L = this.layout(), pt = c => [(L.X(c) - L.b.x) / L.b.w, (L.Y(c) - L.b.y) / L.b.h], pre = this.prefix(G.p);
              G.cur = { pts: G.p.sol.slice(pre).map(pt), rate: s.rate, f: 0, on: false };
            } else G.cur = s.pause ? { pause: s.pause } : { ...s, f: 0, on: false };
          }
          const c = G.cur;
          if (c.pause !== undefined) { c.pause -= dt; if (c.pause <= 0) G.cur = null; return; }
          if (!c.on) { c.on = true; this.down(c.pts[0][0], c.pts[0][1], now, { t: now }); if (!this.drag) { G.cur = null; G.seq = []; return; } }
          c.f = Math.min(c.pts.length - 1, c.f + dt * c.rate);
          const [u, v] = along(c.pts, c.f / Math.max(1, c.pts.length - 1));
          this.move(u, v, now, { t: now });
          if (c.f >= c.pts.length - 1 || this.done) {
            const e = c.pts[c.pts.length - 1];
            this.up(e[0], e[1], now, { t: now });
            G.cur = null;
          }
        },

        draw(ctx, b, at) {
          this.b = b;
          const L = this.layout(b), U = L.U, cs = L.cs, still = rm();
          const pay = this.done && this.doneAt != null ? at - this.doneAt : -1;
          const settle = pay > 0.2 && !still ? 0.02 * Math.sin(Math.PI * clamp((pay - 0.2) / 0.6, 0, 1)) : 0;
          const warm = this.done ? 1 : pairs.filter(p => p.joined).length / pairs.length;
          ctx.save();
          if (settle) { const cx = L.gx + L.side / 2, cy = L.gy + L.side / 2; ctx.translate(cx, cy); ctx.scale(1 + settle, 1 + settle); ctx.translate(-cx, -cy); }
          frame(ctx, L, warm, 1);
          ctx.drawImage(pegLayer(L), L.gx, L.gy, L.side, L.side);

          const nP = pairs.length, stp = Math.min(0.09, 0.32 / nP), full = !!this.pay?.full, lift0 = 0.2 + (nP - 1) * stp + 0.16 + (full ? 0.18 : 0);
          const PS = pairs.map((p, i) => {
            if (pay < 0) return { lp: 0, lit: 0, e: 0, la: 1 };
            const lp = clamp((pay - 0.2 - i * stp) / 0.25, 0, 1), q = clamp((pay - lift0 - i * 0.035) / 0.7, 0, 1);
            return { lp, lit: lp, e: still ? 0 : E.inOut(q), la: still ? 1 - E.inOut(q) : 1 - clamp((q - 0.55) / 0.45, 0, 1), q };
          });

          const r = cs * 0.5, inset = cs * 0.06;
          for (const p of pairs) {
            const fade = pay >= 0 ? 1 - 0.7 * (still ? 1 - PS[p.i].la : PS[p.i].e) : 1;
            for (const [c, t0] of p.tint) {
              const a = 0.18 * clamp((at - t0) / 0.15, 0, 1) * (p.joined ? 1.15 : 1) * fade;
              ctx.fillStyle = rgb(p.c, a);
              ctx.beginPath(); ctx.roundRect(L.X(c) - r + inset, L.Y(c) - r + inset, cs - 2 * inset, cs - 2 * inset, cs * 0.16); ctx.fill();
            }
          }

          ctx.lineCap = 'round'; ctx.lineJoin = 'round';
          const gcx = L.gx + L.side / 2, rise = L.gy + L.side - b.y + b.h * 0.12;
          for (const p of pairs) {
            if (p.pipe.length < 1) continue;
            let pts = p.pipe.map(c => [L.X(c), L.Y(c)]);
            if (p.pipe.length >= 2) {
              const hs = p.head || (p.head = { x: { x: pts[pts.length - 1][0] }, y: { x: pts[pts.length - 1][1] } });
              const tx = pts[pts.length - 1][0], ty = pts[pts.length - 1][1];
              if (still) { hs.x.x = tx; hs.y.x = ty; hs.x.v = hs.y.v = 0; }
              else { J.spring(hs.x, tx, 9, 0.75, 1 / 60); J.spring(hs.y, ty, 9, 0.75, 1 / 60); }
              pts[pts.length - 1] = [hs.x.x, hs.y.x];
            } else p.head = null;
            const S = PS[p.i], e = S.e, la = S.la, lit = S.lit;
            if (e > 0) {
              const ym = pts.reduce((a, q) => a + q[1], 0) / pts.length;
              pts = pts.map(([x, y]) => [gcx + (x - gcx) * (1 + 0.4 * e), ym + (y - ym) * (1 - 0.55 * e) - rise * e]);
            }
            const cc = e > 0 ? mixc(p.c, C.green, 0.55 * e) : p.c;
            const fever = this.t < this.feverUntil && p.joined ? 1.12 : 1, wide = 1 + 0.8 * e;
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            strokePath(ctx, pts, cs * 0.66 * fever * wide, cc, (0.07 + 0.06 * this.tier / 3 + (p.joined ? 0.06 : 0) + 0.14 * lit) * la);
            ctx.restore();
            strokePath(ctx, pts, cs * 0.34 * fever * (1 - 0.3 * e), mixc(cc, C.night900, 0.12), 0.92 * la * (1 - 0.4 * e));
            strokePath(ctx, pts, cs * 0.13, mixc(cc, C.silver050, 0.55 + 0.35 * lit), (p.joined ? 0.9 : 0.68) * la);
            if (S.lp > 0 && S.lp < 1 && pts.length > 1) {
              const n2 = pts.length - 1, f = S.lp * n2, part = pts.slice(0, Math.floor(f) + 1).concat([along(pts, S.lp)]);
              strokePath(ctx, part, cs * 0.2, mixc(p.c, C.silver050, 0.75), still ? 0.5 * S.lp : 0.85);
              if (!still) { const [lx, ly] = along(pts, S.lp); sprite(ctx, 'glow', mixc(p.c, C.silver050, 0.5), lx, ly, cs * 0.7, 0.9, true); }
            }
            if (p.joined && pay < 0 && pts.length > 1) {
              if (still) strokePath(ctx, pts, cs * 0.2, mixc(p.c, C.silver050, 0.6), 0.25);
              else {
                const m = ((at - p.joinAt) * 0.3 + p.i * 0.17) % 1, [sx, sy] = along(pts, m);
                sprite(ctx, 'soft', mixc(p.c, C.silver050, 0.5), sx, sy, cs * 0.55, 0.35, true);
              }
            }
            const bp = (at - p.beadAt) / 0.3;
            if (bp >= 0 && bp < 1 && pts.length > 1 && pay < 0) {
              if (still) strokePath(ctx, pts, cs * 0.22, C.silver050, 0.35 * (1 - bp));
              else { const [bx2, by2] = along(pts, E.outSoft(bp)); sprite(ctx, 'glow', C.silver050, bx2, by2, cs * 0.42, 0.9, true); }
            }
            if (!p.joined && this.drag?.p !== p && p.pipe.length > 1 && pay < 0) {
              const [hx, hy] = pts[pts.length - 1], wb = J.wobble(at - p.wobAt);
              sprite(ctx, 'glow', p.c, hx + wb[0], hy, cs * 0.42, (0.22 + 0.14 * Math.sin(at * TAU * 0.5 + p.i)) * wb[1], true);
              ctx.fillStyle = rgb(mixc(p.c, C.silver050, 0.3), 0.9 * wb[1]);
              ctx.beginPath(); ctx.arc(hx + wb[0], hy, cs * 0.13, 0, TAU); ctx.fill();
            }
          }
          if (pay > 0) {
            const top = PS.reduce((a, S) => Math.max(a, S.q ? Math.sin(Math.PI * clamp(S.q * 1.2 - 0.2, 0, 1)) : 0), 0);
            if (top > 0) sprite(ctx, 'soft', C.green, gcx, b.y - b.h * 0.02, b.w * 0.55, 0.22 * top * (0.6 + 0.4 * (this.pay?.size ?? 1) / 2), true, 1.6, 0.45);
          }
          if (full && pay > 0 && !still) {
            const q = clamp((pay - 0.2 - (nP - 1) * stp) / 0.35, 0, 1);
            if (q > 0 && q < 1) { const d = q * 2 * L.side; sprite(ctx, 'soft', C.silver050, L.gx + d * 0.5, L.gy + d * 0.5, L.side * 0.35, 0.18 * Math.sin(Math.PI * q), true); }
          }

          for (const gh of this.ghosts) {
            const q = (at - gh.at) / 0.32;
            if (q >= 1) continue;
            const pts = gh.pts.map(c => [L.X(c), L.Y(c)]);
            if (still) { strokePath(ctx, pts, cs * 0.3, gh.c, 0.6 * (1 - q)); continue; }
            const keep = Math.max(0, 1 - E.outElastic(Math.min(1, q * 1.4))), m = Math.max(0.001, keep);
            const n2 = pts.length - 1, f = m * n2, cut = [];
            for (let i = 0; i <= Math.floor(f); i++) cut.push(pts[i]);
            if (f % 1 > 0 && Math.ceil(f) <= n2) cut.push(along(pts, f / n2));
            strokePath(ctx, cut, cs * 0.3, gh.c, 0.7 * (1 - q * 0.6));
          }
          this.ghosts = this.ghosts.filter(gh => at - gh.at < 0.32);

          if (this.hint) {
            const q = (at - this.hint.at) / 1.0, p = this.hint.p, pts = p.sol.map(c => [L.X(c), L.Y(c)]), env = Math.sin(Math.PI * clamp(q, 0, 1));
            if (q < 1) {
              strokePath(ctx, pts, cs * 0.2, mixc(p.c, C.silver050, 0.3), 0.32 * env);
              if (!still) {
                const m = E.inOut(clamp(q, 0, 1)), [hx, hy] = along(pts, m), n2 = pts.length - 1, f = m * n2;
                strokePath(ctx, pts.slice(0, Math.floor(f) + 1).concat([[hx, hy]]), cs * 0.14, mixc(p.c, C.silver050, 0.6), 0.5 * env);
                sprite(ctx, 'glow', mixc(p.c, C.silver050, 0.5), hx, hy, cs * 0.55, 0.9 * env, true);
              } else strokePath(ctx, pts, cs * 0.26, p.c, 0.22 * env);
            }
          }

          for (const p of pairs) {
            const startC = p.pipe[0];
            for (const c of [p.a, p.b]) {
              const x = L.X(c), y = L.Y(c), isStart = c === startC && p.pipe.length > 0;
              const dim = at - p.dimAt < 0.5 ? 0.6 + 0.4 * E.inOut((at - p.dimAt) / 0.5) : 1;
              const charge = isStart && !p.joined ? Math.min(0.5, 0.05 * (p.pipe.length - 1)) : 0;
              let s = 1 + (still ? 0 : 0.03 * (1 + Math.sin(at * TAU * 0.4 + p.i * 1.3)));
              const sq = still ? 1 : touchPop(at - p.sq);
              const pp = at - p.pop;
              if (!still) s *= popScale(pp);
              const wb = J.wobble(at - p.wobAt), glowA = (p.joined ? 0.55 : 0.32 + (still ? 0.1 * Math.sin(at * TAU * 0.4 + p.i) : 0)) + charge;
              sprite(ctx, 'glow', p.c, x + wb[0], y, cs * (0.62 + 0.5 * charge) * s, glowA * dim * wb[1], true);
              const kr = cs * 0.27 * s, img = knotSprite(p.gi, p.c, Math.round(cs * 0.27));
              ctx.save();
              ctx.globalAlpha *= dim * wb[1] * (0.82 + 0.18 * (p.joined ? 1 : charge * 2));
              ctx.translate(x + wb[0], y); ctx.scale(sq, sq);
              ctx.drawImage(img, -kr * 2, -kr * 2, kr * 4, kr * 4);
              ctx.restore();
              if (pp >= 0 && pp < 0.3 && !still) {
                ctx.lineWidth = 2 * U; ctx.strokeStyle = rgb(mixc(p.c, C.silver050, 0.4), 0.6 * (1 - pp / 0.3));
                ctx.beginPath(); ctx.arc(x, y, cs * (0.3 + 0.35 * E.outSoft(pp / 0.3)), 0, TAU); ctx.stroke();
              }
              if (isStart && at - p.sq < 0.3 && !still) {
                const q = (at - p.sq) / 0.3;
                ctx.lineWidth = 1.6 * U; ctx.strokeStyle = rgb(p.c, 0.5 * (1 - q));
                ctx.beginPath(); ctx.arc(x, y, cs * (0.3 + 0.5 * E.outSoft(q)), 0, TAU); ctx.stroke();
              }
            }
          }
          ctx.restore();

          if (this.fing && this.drag && !this.done) {
            const p = this.drag.p;
            sprite(ctx, 'glow', mixc(p.c, C.flame, 0.3), this.fing[0], this.fing[1], cs * 0.62, 0.3, true);
          }
          if (this.ripple && at - this.rippleAt < 0.35) {
            const q = (at - this.rippleAt) / 0.35;
            ctx.lineWidth = 1.4 * U; ctx.strokeStyle = rgb(C.silver300, 0.35 * (1 - q));
            ctx.beginPath(); ctx.arc(this.ripple[0], this.ripple[1], (8 + (still ? 6 : 22 * E.outSoft(q))) * U, 0, TAU); ctx.stroke();
          }

          const noTouch = this.first === null && !this.done;
          const lastOne = this.autoPhase && !this.done && pairs.filter(p => !p.joined && !p.anim).length === 1 && !this.autoQ.length && !pairs.some(p => p.anim) && !this.drag;
          if ((noTouch && this.t > this.cueAt && !this.autoPhase) || lastOne) {
            const p = lastOne ? pairs.find(q => !q.joined) : this.cueP, pts = p.sol.map(c => [L.X(c), L.Y(c)]);
            const a = clamp((this.t - (lastOne ? 0 : this.cueAt)) / 0.4, 0, 1);
            dragCue(ctx, m => along(pts, m), U, at, lastOne ? 1 : a, 0.6 + p.sol.length * 0.28);
          }
        },
      });
      g.sync();
      return g;
    },
  });
})();
