(() => {
  const { clamp, lerp, rgb, mixc } = A;
  const J = A.J, { C, sprite, hap, sfx, rm } = J, E = J.ease;
  const TAU = Math.PI * 2;
  const SNOW = mixc(C.silver300, C.night600, 0.6), SNOW_HI = mixc(C.silver100, C.night600, 0.38), SNOW_LO = mixc(C.silver500, C.night800, 0.55);
  const ROCK = mixc(C.night600, C.violet500, 0.25), ICE = mixc(C.night700, C.tealDeep, 0.14), ICE_HI = mixc(C.silver300, C.night700, 0.55);
  const CLOAK = mixc(mixc(A.hex('#2A2350'), C.violet500, 0.35), C.night700, 0.15), SCARF = mixc(C.amberDeep, C.night900, 0.3);
  const STONE = mixc(C.silver600, C.night700, 0.35), STONE_HI = mixc(C.silver400, C.night700, 0.3), EMBER = mixc(C.silver500, C.ice, 0.3);

  const at = () => J.at;
  const sideOf = (r, path) => (path === 'hard' ? r.hardSide : -r.hardSide);
  const depth = v => lerp(0.8, 1, clamp((v - 0.15) / 0.71, 0, 1));
  const pathLen = (pts, w, h) => pts.slice(1).reduce((L, p, i) => L + Math.hypot((p[0] - pts[i][0]) * w, (p[1] - pts[i][1]) * h), 0);

  const cairnSpot = (s, hard) => {
    const e = A.FORK.pathPts(s, hard).pop();
    return hard ? [e[0] + s * 0.065, e[1] + 0.025] : [e[0] + s * 0.05, e[1] + 0.008];
  };
  const CAIRN_H = 0.07, STONE_S = 24;
  const ORB = [[[0, -17]], [[-9, -14], [9, -14]], [[-15, -9], [0, -19], [15, -9]]];
  const orbAt = (m, i) => ORB[Math.min(3, m) - 1][i] || [0, -17];

  const smooth = (x, pts) => {
    x.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length - 1; i++) x.quadraticCurveTo(pts[i][0], pts[i][1], (pts[i][0] + pts[i + 1][0]) / 2, (pts[i][1] + pts[i + 1][1]) / 2);
    const l = pts[pts.length - 1];
    x.lineTo(l[0], l[1]);
  };

  let seed = 1;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

  const feather = (x, w, h, F) => {
    x.globalCompositeOperation = 'destination-in';
    for (const [x0, y0, x1, y1] of [[0, 0, 0, h], [0, 0, w, 0]]) {
      const L = Math.hypot(x1 - x0, y1 - y0), g = x.createLinearGradient(x0, y0, x1, y1);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(F / L, 'rgba(0,0,0,1)'); g.addColorStop(1 - F / L, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = g; x.fillRect(0, 0, w, h);
    }
    x.globalCompositeOperation = 'source-over';
  };

  const cairnArt = () => A.Art?.has?.('task_fork_cairn');
  const drawCairn = (x, cx, by, H, a = 1) => {
    if (cairnArt()) {
      const w = H * A.Art.aspect('task_fork_cairn');
      return A.Art.draw(x, 'task_fork_cairn', cx - w / 2, by - H, w, H, 0.75, 0.55, a);
    }
    x.save(); x.globalAlpha *= a;
    const st = [[0, 0.12, 0.5, 0.15], [0.03, 0.33, 0.4, 0.13], [-0.03, 0.52, 0.34, 0.12], [0.02, 0.69, 0.26, 0.1]];
    for (const [dx, y, rw, rh] of st) {
      x.fillStyle = rgb(mixc(STONE, C.night900, 0.35)); x.beginPath(); x.ellipse(cx + dx * H, by - y * H, rw * H, rh * H, 0, 0, TAU); x.fill();
      x.fillStyle = rgb(SNOW_HI, 0.55); x.beginPath(); x.ellipse(cx + dx * H - 0.05 * H, by - y * H - rh * H * 0.55, rw * H * 0.6, rh * H * 0.4, 0, 0, TAU); x.fill();
    }
    x.fillStyle = rgb(C.night900); x.beginPath(); x.ellipse(cx, by - 0.86 * H, 0.3 * H, 0.1 * H, 0, 0, Math.PI); x.fill();
    x.fillRect(cx - 0.3 * H, by - 0.9 * H, 0.6 * H, 0.04 * H);
    x.restore();
    return true;
  };

  const cache = new Map();
  const makeLayer = (w, h, dpr, paint) => {
    const c = document.createElement('canvas');
    c.width = Math.ceil(w * dpr); c.height = Math.ceil(h * dpr);
    const x = c.getContext('2d');
    x.setTransform(dpr, 0, 0, dpr, 0, 0);
    paint(x);
    x.setTransform(1, 0, 0, 1, 0, 0);
    feather(x, c.width, c.height, 24 * dpr);
    return c;
  };

  function layers(b, hs, dpr) {
    const art = +!!cairnArt();
    const key = `${Math.round(b.w)}|${Math.round(b.h)}|${hs}|${dpr}|${art}`;
    let L = cache.get(key);
    if (L) return L;
    const { w, h } = b, P = (s, u, v) => [(0.5 + s * (u - 0.5)) * w, v * h];
    const { pathPts } = A.FORK;
    const trail = (x, s, hard) => {
      x.save(); x.strokeStyle = rgb(SNOW_LO, 0.55); x.lineWidth = 5; x.lineCap = 'round'; x.lineJoin = 'round';
      x.beginPath(); smooth(x, pathPts(s, hard).map(([u, v]) => [u * w, v * h + 4])); x.stroke();
      x.strokeStyle = rgb(SNOW_HI, 0.16); x.lineWidth = 1.2; x.setLineDash([2, 6]);
      x.beginPath(); smooth(x, pathPts(s, hard).map(([u, v]) => [u * w, v * h + 2])); x.stroke();
      x.restore();
    };
    const cairn = (x, s, hard) => {
      const [u, v] = cairnSpot(s, hard), cx = u * w, by = v * h, H = CAIRN_H * h;
      sprite(x, 'soft', C.night950, cx, by, H * 0.6, 0.5, false, 1, 0.25);
      drawCairn(x, cx, by, H);
      return [cx, by, H];
    };
    const base = makeLayer(w, h, dpr, x => {
      const g = x.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, rgb(C.night900, 0.96)); g.addColorStop(0.45, rgb(C.night800, 0.96)); g.addColorStop(0.75, rgb(mixc(C.night700, C.violet500, 0.12), 0.97)); g.addColorStop(1, rgb(C.night800, 0.97));
      x.fillStyle = g; x.fillRect(0, 0, w, h);
      seed = 7;
      for (let i = 0; i < 34; i++) {
        const sx = rnd() * w, sy = rnd() * h * 0.55, r = 0.5 + rnd() * 0.9;
        x.fillStyle = rgb(C.silver100, 0.18 + 0.45 * rnd() * (1 - sy / (h * 0.6))); x.beginPath(); x.arc(sx, sy, r, 0, TAU); x.fill();
      }
      sprite(x, 'soft', C.violet300, w * 0.5, h * 0.56, w * 0.7, 0.07, true, 1, 0.3);
      x.fillStyle = rgb(mixc(C.night700, C.night600, 0.5));
      x.beginPath(); smooth(x, [[-10, h * 0.6], [w * 0.15, h * 0.53], [w * 0.32, h * 0.57], [w * 0.5, h * 0.5], [w * 0.68, h * 0.56], [w * 0.86, h * 0.52], [w + 10, h * 0.58]]); x.lineTo(w + 10, h); x.lineTo(-10, h); x.closePath(); x.fill();
      const sg = x.createLinearGradient(0, h * 0.78, 0, h);
      sg.addColorStop(0, rgb(SNOW_HI)); sg.addColorStop(0.35, rgb(SNOW)); sg.addColorStop(1, rgb(SNOW_LO));
      x.fillStyle = sg;
      x.beginPath(); smooth(x, [[w * 0.18, h * 1.02], [w * 0.3, h * 0.9], [w * 0.42, h * 0.845], [w * 0.5, h * 0.835], [w * 0.58, h * 0.845], [w * 0.7, h * 0.9], [w * 0.82, h * 1.02]]); x.closePath(); x.fill();
      sprite(x, 'soft', C.night950, w * 0.5, h * 0.875, w * 0.09, 0.35, false, 1, 0.22);
    });
    const hard = makeLayer(w, h, dpr, x => {
      const s = hs, edge = [[0.44, 1.03], [0.49, 0.9], [0.52, 0.68], [0.545, 0.46], [0.59, 0.3], [0.65, 0.19], [0.7, 0.13], [0.76, 0.1], [0.83, 0.1], [0.9, 0.13], [0.97, 0.19], [1.05, 0.26], [1.05, 1.03]].map(([u, v]) => P(s, u, v));
      x.save();
      x.beginPath(); smooth(x, edge); x.closePath();
      const g = x.createLinearGradient(P(s, 0.5, 0)[0], 0, P(s, 1, 0)[0], 0);
      g.addColorStop(0, rgb(SNOW_HI)); g.addColorStop(0.35, rgb(SNOW)); g.addColorStop(1, rgb(SNOW_LO));
      x.fillStyle = g; x.fill();
      x.clip();
      seed = 11;
      for (let i = 0; i < 7; i++) {
        const v0 = 0.16 + i * 0.12, pts = [[0.5, v0 + 0.1], [0.66, v0 + 0.02], [0.82, v0 + 0.05 + 0.03 * rnd()], [1.06, v0 - 0.02]].map(([u, v]) => P(s, u, v));
        x.strokeStyle = rgb(SNOW_LO, 0.2); x.lineWidth = 6 + 6 * rnd(); x.beginPath(); smooth(x, pts); x.stroke();
        x.strokeStyle = rgb(SNOW_HI, 0.1); x.lineWidth = 1.2; x.beginPath(); smooth(x, pts.map(([a, b2]) => [a, b2 - 4])); x.stroke();
      }
      for (const [u, v, rw] of [[1.0, 0.38, 20], [1.02, 0.66, 24], [0.95, 0.88, 16], [0.6, 0.97, 14]]) {
        const [cx, cy] = P(s, u, v);
        x.fillStyle = rgb(ROCK, 0.55); x.beginPath(); x.ellipse(cx, cy, rw, rw * 0.42, 0, Math.PI, 0); x.fill();
        x.fillStyle = rgb(SNOW_HI, 0.45); x.beginPath(); x.ellipse(cx - s * rw * 0.15, cy - rw * 0.3, rw * 0.6, rw * 0.14, 0, 0, TAU); x.fill();
      }
      const sh = x.createLinearGradient(0, h * 0.35, 0, h);
      sh.addColorStop(0, rgb(C.night800, 0)); sh.addColorStop(1, rgb(C.night800, 0.55));
      x.fillStyle = sh; x.fillRect(0, 0, w, h);
      x.restore();
      x.strokeStyle = rgb(C.silver100, 0.28); x.lineWidth = 1.4;
      x.beginPath(); smooth(x, edge.slice(1, 10)); x.stroke();
      for (const [du, hh] of [[0.12, 0.13], [0.15, 0.1]]) {
        const [bx, by] = P(s, 0.78 + du, 0.105 + du * 0.25), th = hh * h;
        x.strokeStyle = rgb(mixc(C.silver100, C.night700, 0.25)); x.lineWidth = 2.2; x.lineCap = 'round';
        x.beginPath(); x.moveTo(bx, by); x.quadraticCurveTo(bx - s * 2, by - th * 0.5, bx + s * 1.5, by - th); x.stroke();
        x.strokeStyle = rgb(C.night900, 0.7); x.lineWidth = 1;
        for (let k = 0.2; k < 0.9; k += 0.17) { x.beginPath(); x.moveTo(bx - 1, by - th * k); x.lineTo(bx + 1.2, by - th * k - 0.5); x.stroke(); }
        x.strokeStyle = rgb(mixc(C.silver300, C.night700, 0.4), 0.8); x.lineWidth = 0.8;
        for (let k = 0; k < 4; k++) { const y0 = by - th * (0.55 + k * 0.12); x.beginPath(); x.moveTo(bx, y0); x.lineTo(bx + (k % 2 ? s : -s) * 7, y0 - 7); x.stroke(); }
      }
      trail(x, s, true);
      cairn(x, s, true);
    });
    const easy = makeLayer(w, h, dpr, x => {
      const s = -hs;
      const lake = x.createLinearGradient(0, h * 0.57, 0, h);
      lake.addColorStop(0, rgb(ICE_HI, 0.85)); lake.addColorStop(0.12, rgb(ICE)); lake.addColorStop(1, rgb(mixc(ICE, C.night900, 0.5)));
      x.fillStyle = lake;
      const L0 = P(s, 0.42, 0)[0], L1 = P(s, 1.06, 0)[0];
      x.fillRect(Math.min(L0, L1), h * 0.575, Math.abs(L1 - L0), h * 0.5);
      const fadeIn = x.createLinearGradient(L0, 0, P(s, 0.62, 0)[0], 0);
      fadeIn.addColorStop(0, rgb(C.night800, 1)); fadeIn.addColorStop(1, rgb(C.night800, 0));
      x.globalCompositeOperation = 'destination-out'; x.fillStyle = fadeIn; x.fillRect(Math.min(L0, L1), h * 0.5, Math.abs(L1 - L0), h * 0.6); x.globalCompositeOperation = 'source-over';
      x.fillStyle = rgb(mixc(C.night700, C.night900, 0.4));
      x.beginPath(); smooth(x, [[0.5, 0.585], [0.62, 0.55], [0.74, 0.565], [0.86, 0.535], [0.95, 0.55], [1.06, 0.545], [1.06, 0.58], [0.5, 0.585]].map(([u, v]) => P(s, u, v))); x.closePath(); x.fill();
      seed = 23;
      for (let i = 0; i < 7; i++) {
        const [tx, ty] = P(s, 0.62 + i * 0.065 + rnd() * 0.03, 0.56 + rnd() * 0.012), th = 10 + rnd() * 10;
        x.fillStyle = rgb(mixc(C.night800, C.night900, 0.3)); x.beginPath(); x.moveTo(tx - th * 0.22, ty); x.lineTo(tx, ty - th); x.lineTo(tx + th * 0.22, ty); x.closePath(); x.fill();
      }
      for (let i = 0; i < 7; i++) {
        const [tx] = P(s, 0.62 + i * 0.065, 0), th = 6 + (i * 37 % 9);
        x.fillStyle = rgb(C.night900, 0.35); x.beginPath(); x.moveTo(tx - th * 0.22, h * 0.59); x.lineTo(tx, h * 0.59 + th * 0.8); x.lineTo(tx + th * 0.22, h * 0.59); x.closePath(); x.fill();
      }
      seed = 31;
      for (let i = 0; i < 14; i++) {
        const [sx] = P(s, 0.6 + rnd() * 0.45, 0), sy = h * (0.62 + rnd() * 0.36);
        x.fillStyle = rgb(C.silver100, 0.1 + 0.2 * rnd()); x.fillRect(sx - 3, sy, 6 + 6 * rnd(), 0.8);
      }
      x.strokeStyle = rgb(C.silver200, 0.08); x.lineWidth = 1;
      for (let i = 0; i < 6; i++) { const y = h * (0.64 + i * 0.055), [a0] = P(s, 0.58 + (i % 3) * 0.06, 0), [a1] = P(s, 0.9 + (i % 2) * 0.1, 0); x.beginPath(); x.moveTo(a0, y); x.lineTo(a1, y); x.stroke(); }
      const bank = [[0.44, 1.03], [0.5, 0.82], [0.62, 0.77], [0.74, 0.71], [0.83, 0.63], [0.88, 0.585], [0.93, 0.58], [0.975, 0.61], [0.94, 0.65], [0.85, 0.7], [0.76, 0.78], [0.67, 0.86], [0.62, 0.94], [0.6, 1.03]].map(([u, v]) => P(s, u, v));
      const g = x.createLinearGradient(0, h * 0.58, 0, h);
      g.addColorStop(0, rgb(SNOW_HI)); g.addColorStop(0.5, rgb(SNOW)); g.addColorStop(1, rgb(SNOW_LO));
      x.fillStyle = g; x.beginPath(); smooth(x, bank); x.closePath(); x.fill();
      x.strokeStyle = rgb(C.silver100, 0.28); x.lineWidth = 1.4; x.beginPath(); smooth(x, bank.slice(1, 8)); x.stroke();
      trail(x, s, false);
      const [cx, by, H] = cairn(x, s, false);
      x.save(); x.translate(cx, by + 2); x.scale(1, -0.55); x.translate(-cx, -by);
      x.globalAlpha = 0.18; drawCairn(x, cx, by, H); x.restore();
    });
    L = { base, hard, easy };
    cache.set(key, L);
    if (cache.size > 6) cache.delete(cache.keys().next().value);
    return L;
  }

  let marks = null;
  const markSprites = () => {
    if (marks !== null || !A.Art?.has?.('task_fork_waymarker_sheet')) return marks;
    const asp = A.Art.aspect('task_fork_waymarker_sheet'), H = 96, W = Math.round(H * asp);
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    A.Art.draw(c.getContext('2d'), 'task_fork_waymarker_sheet', 0, 0, W, H);
    const half = i => { const o = document.createElement('canvas'); o.width = Math.floor(W / 2); o.height = H; o.getContext('2d').drawImage(c, i * Math.floor(W / 2), 0, Math.floor(W / 2), H, 0, 0, Math.floor(W / 2), H); return o; };
    marks = { cold: half(0), warm: half(1), asp: Math.floor(W / 2) / H };
    return marks;
  };
  A.bus?.on?.('artLoaded', () => { marks = null; cache.clear(); });

  const drawStone = (ctx, x, y, S, warm, a, sy = 1) => {
    if (a <= 0.01) return;
    const m = markSprites(), ga = ctx.globalAlpha;
    ctx.globalAlpha = ga * a;
    sprite(ctx, 'soft', C.night950, x, y + S * 0.05, S * 0.6, 0.45, false, 1, 0.3);
    if (m) {
      const h = S * sy, w = S * m.asp * 1.0;
      ctx.drawImage(m.cold, x - w / 2, y - h, w, h);
      if (warm > 0.01) { ctx.globalAlpha = ga * a * warm; ctx.drawImage(m.warm, x - w / 2, y - h, w, h); }
    } else {
      const h = S * sy;
      ctx.fillStyle = rgb(mixc(STONE, C.amberDeep, 0.25 * warm));
      ctx.beginPath(); ctx.ellipse(x, y - h * 0.18, S * 0.48, h * 0.2, 0, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.ellipse(x, y - h * 0.5, S * 0.4, h * 0.24, 0, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.ellipse(x, y - h * 0.78, S * 0.3, h * 0.18, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = rgb(STONE_HI, 0.6); ctx.beginPath(); ctx.ellipse(x - S * 0.06, y - h * 0.9, S * 0.22, h * 0.07, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = rgb(C.night950, 0.85); ctx.beginPath(); ctx.roundRect(x - S * 0.13, y - h * 0.62, S * 0.26, h * 0.3, S * 0.08); ctx.fill();
    }
    ctx.globalAlpha = ga;
  };
  const niche = (x, y, S) => [x, y - S * 0.47];

  const drawFigure = (ctx, x, y, sc, f, t) => {
    const r = rm(), fl = r ? 0 : Math.sin(t * 2.2) * 1.2 + f.air * 3.5, wind = r ? 0 : Math.sin(t * 0.9) * 0.8;
    sprite(ctx, 'soft', C.night950, x, y + 1, 15 * sc * (1 - 0.4 * f.air), 0.55 * (1 - 0.6 * f.air), false, 1, 0.3);
    ctx.save();
    ctx.translate(x, y - f.lift); ctx.scale(sc * f.face * f.sx, sc * f.sy);
    ctx.lineCap = 'round'; ctx.strokeStyle = rgb(CLOAK); ctx.lineWidth = 3.4;
    const tuck = f.air;
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(s * 1.6, -15); ctx.lineTo(s * 1.6 + tuck * 3, -15 + 14 * (1 - 0.45 * tuck)); ctx.stroke(); }
    const cloak = () => {
      ctx.beginPath();
      ctx.moveTo(-3, -46);
      ctx.bezierCurveTo(-9, -40, -11, -26, -14 - fl - wind, -11 - tuck * 2);
      ctx.quadraticCurveTo(-7, -8 + fl * 0.5, -1, -10);
      ctx.quadraticCurveTo(5, -8 - fl * 0.4, 11 + fl * 0.3, -12 - tuck * 2);
      ctx.bezierCurveTo(10, -24, 8, -36, 6, -44);
      ctx.bezierCurveTo(9.5, -50, 7, -58.5, 0.5, -58.5);
      ctx.bezierCurveTo(-5, -58.5, -8.5, -55, -9.5 - wind * 0.5, -50);
      ctx.quadraticCurveTo(-7, -48, -3, -46);
      ctx.closePath();
    };
    ctx.fillStyle = rgb(mixc(C.glow, C.amber, 0.3), 0.55); ctx.save(); ctx.translate(1.4, -0.4); cloak(); ctx.fill(); ctx.restore();
    ctx.fillStyle = rgb(CLOAK); cloak(); ctx.fill();
    ctx.fillStyle = rgb(C.night950, 0.7); ctx.beginPath(); ctx.moveTo(6.6, -54.2); ctx.bezierCurveTo(4.9, -53, 4.6, -49.8, 5.4, -47.6); ctx.quadraticCurveTo(6.5, -47, 7.3, -47.8); ctx.bezierCurveTo(8.1, -49.8, 8, -52.4, 6.6, -54.2); ctx.fill();
    const bands = f.bands, len = 8 + 4.5 * Math.min(4, bands), lift = 0.25 + 0.5 * f.air, wv = r ? 0 : 1;
    const tail = [];
    for (let i = 0; i <= 7; i++) { const q = i / 7; tail.push([-3 - q * len, -45 + q * 9 * (1 - lift) + Math.sin(t * 3.2 * wv - i * 0.9) * q * (1 + 2 * lift) * wv]); }
    ctx.fillStyle = rgb(SCARF);
    ctx.beginPath(); ctx.moveTo(-4, -47); ctx.quadraticCurveTo(1, -44.5, 6, -46.5); ctx.lineTo(6, -43.5); ctx.quadraticCurveTo(1, -41, -4, -43); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(tail[0][0], tail[0][1] - 1.8);
    for (let i = 1; i < tail.length; i++) ctx.lineTo(tail[i][0], tail[i][1] - 1.8 * (1 - i / 9));
    for (let i = tail.length - 1; i >= 0; i--) ctx.lineTo(tail[i][0], tail[i][1] + 1.8 * (1 - i / 9) + 0.3);
    ctx.closePath(); ctx.fill();
    for (let k = 0; k < Math.min(4, bands); k++) {
      const q = (k + 0.5) / 4, p = tail[Math.min(7, Math.round(q * 7 * Math.min(1, len / 26)))], na = clamp(f.bandAge(k) / 0.25, 0, 1);
      sprite(ctx, 'soft', C.amber, p[0], p[1], 8 * (1 + 0.8 * (1 - na)), 0.85, true);
      ctx.fillStyle = rgb(mixc(C.glow, C.sun, 0.5), 0.95); ctx.beginPath(); ctx.ellipse(p[0], p[1], 2.8, 2.1, 0, 0, TAU); ctx.fill();
    }
    ctx.strokeStyle = rgb(CLOAK); ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(3, -38); ctx.quadraticCurveTo(8, -33, 10, -30); ctx.stroke();
    ctx.strokeStyle = rgb(mixc(C.amberDeep, C.night800, 0.45)); ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(9, -29); ctx.lineTo(19, -40); ctx.stroke();
    ctx.restore();
    const lx = x + (19 * f.face * f.sx) * sc, ly = y - f.lift + (-34 * f.sy) * sc, fs = f.flame, pulse = r ? 1 : 0.93 + 0.07 * Math.sin(t * 7.3) * Math.sin(t * 2.9);
    ctx.strokeStyle = rgb(C.night950, 0.9); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(lx, ly - 6 * sc); ctx.lineTo(lx, ly - 3.5 * sc); ctx.stroke();
    ctx.fillStyle = rgb(C.night950); ctx.fillRect(lx - 3 * sc, ly - 3.8 * sc, 6 * sc, 1.5 * sc); ctx.fillRect(lx - 2.5 * sc, ly + 3.6 * sc, 5 * sc, 1.3 * sc);
    ctx.fillStyle = rgb(mixc(C.glow, C.daylight, 0.4)); ctx.fillRect(lx - 2.2 * sc, ly - 2.3 * sc, 4.4 * sc, 5.9 * sc);
    sprite(ctx, 'glow', C.daylight, lx, ly, 7 * sc * fs * pulse, 0.9, true);
    sprite(ctx, 'glow', mixc(C.glow, C.amber, 0.25), lx, ly, 26 * sc * fs * pulse, 0.5, true);
    J.light(lx, ly, 40 * sc * fs, C.amber, 0.12);
    return [x - 8 * f.face * sc, y - f.lift - 44 * sc];
  };

  const P0 = [0.5, 0.86];

  A.definePresenter('fork', {
    on(g, ev, d, now) {
      if (ev === 'init') {
        J.fx.limit = 40;
        g.bar = () => null;
        g.pv = { fig: { from: P0, to: P0, t0: -9, dur: 0.22, mode: 'hop', pts: null }, face: 1, sx: 1, sy: 1, landAt: -9, choseAt: null, chose: null, hits: 0, lit: new Map(), orbs: [], bands: 0, bandAt: [], ripples: [], pats: [], tap_ms: [], bowlAt: null, trailAt: null, swap: null, lastAt: null, noIn: true };
        const down = g.down;
        g.down = function (u, v, t, dd) {
          const ph = this.round?.phase;
          down.call(this, u, v, t, dd);
          this.pv.noIn = false;
          if (ph === 'reward') { this.pv.pats.push({ u, v, t0: at() }); hap('tick'); sfx('fork_pat'); for (const o of this.pv.orbs) if (o.launch > at()) o.launch = at(); }
        };
        return;
      }
      const pv = g.pv, r = g.round, T = at();
      if (!pv || !r) return;
      if (ev === 'round') {
        if (d.i > 0) {
          const cur = figPos(pv, T);
          pv.fig = { from: [cur[0], cur[1]], to: P0, t0: T, dur: 0.4, mode: 'slide' };
          pv.swap = { t0: T, hs: pv.lastHs };
        }
        Object.assign(pv, { choseAt: null, chose: null, bowlAt: null, trailAt: null, orbs: [], lit: new Map(), roundAt: T });
        pv.lastHs = r.hardSide;
        return;
      }
      if (ev === 'choose') {
        pv.choseAt = T; pv.chose = d.path;
        pv.faceT = d.path === 'none' ? -r.hardSide : sideOf(r, d.path);
        if (d.path === 'none') {
          const pts = A.FORK.pathPts(-r.hardSide, false);
          pv.fig = { from: P0, to: pts[pts.length - 1], t0: T, dur: 0.9, mode: 'walk', pts };
          return;
        }
        pv.stretchAt = T;
        hap('medium');
        sfx('fork_choose', { piano: [4, 0.12] });
        const b = A.session?.box?.();
        if (b && !rm()) J.fx.burst(b.x + b.w * 0.5, b.y + b.h * 0.86, 6, C.silver200, 55, { g: 140, life: 0.45, add: false, size: [1.8, 1], alpha: [0.7, 0] });
        return;
      }
      if (ev === 'light') { pv.lit.set(d.light, { born: T }); return; }
      if (ev === 'hit' || ev === 'expire') {
        const st = pv.lit.get(d.light) || {};
        st[ev === 'hit' ? 'hitAt' : 'goneAt'] = T;
        pv.lit.set(d.light, st);
        hopTo(pv, d.light.p, T);
        if (ev === 'hit') {
          pv.hits++;
          if (d.light.born != null) pv.tap_ms.push(Math.round((d.light.on - d.light.born) * 1000));
          hap('ladder', d.i, d.n);
          sfx('fork_step', { i: d.i, n: d.n, f: d.i / d.n, piano: [3 + Math.round(5 * d.i / d.n), 0.1] });
          const b = A.session?.box?.();
          if (b) { const S = STONE_S * depth(d.light.p[1]), [nx, ny] = niche(b.x + b.w * d.light.p[0], b.y + b.h * d.light.p[1], S); J.bloom(nx, ny, S * 1.4, C.glow, 0.45, 0.12, 0.3); }
          J.border((r.i + d.i / d.n) / 2);
        }
        return;
      }
      if (ev === 'miss') { pv.pats.push({ u: d.u, v: d.v, t0: T }); hap('tick'); sfx('fork_pat'); return; }
      if (ev === 'reward') {
        pv.bowlAt = T; pv.trailAt = r.path === 'none' ? null : T;
        const s = sideOf(r, r.path === 'none' ? 'easy' : r.path), hard = r.path === 'hard', m = d.got;
        const b = A.session?.box?.();
        if (b) { const [u, v] = cairnSpot(s, hard), H = CAIRN_H * b.h; J.bloom(b.x + b.w * u, b.y + b.h * v - H * 0.9, 18 * 2.5, C.glow, 0.5, 0.2, 0.6); }
        sfx('fork_bowl', { got: m, piano: [6 + m, 0.16] });
        const delay = r.path === 'none' ? 0.65 : 0.15;
        pv.orbs = Array.from({ length: m }, (_, k) => ({ k, m, s, hard, launch: T + delay + k * 0.14, landed: false }));
        if (r.path === 'none') for (const o of pv.orbs) o.launch = T + delay;
      }
    },

    extra: g => ({ fork_ui: 'fell_v1', tap_ms: g.pv ? g.pv.tap_ms.slice() : [] }),

    draw(g, ctx, b, now) {
      const r = g.round, pv = g.pv;
      if (!r || !pv) return;
      const T = now, dt = pv.lastAt === null ? 0 : clamp(T - pv.lastAt, 0, 0.05);
      pv.lastAt = T;
      const X = u => b.x + u * b.w, Y = v => b.y + v * b.h, red = rm();
      const dpr = Math.min(window.devicePixelRatio || 1, A.Perf?.cap ?? 2);
      const L = layers(b, r.hardSide, dpr);
      const ga = ctx.globalAlpha;
      let swapK = 1;
      if (pv.swap) {
        swapK = clamp((T - pv.swap.t0) / 0.25, 0, 1);
        if (swapK >= 1 || pv.swap.hs === r.hardSide) { pv.swap = null; swapK = 1; }
      }
      const chosen = pv.chose, cs = chosen ? (chosen === 'none' ? -r.hardSide : sideOf(r, chosen)) : 0;
      const fade = pv.choseAt === null ? 0 : E.outSoft((T - pv.choseAt) / 0.4);
      const sideA = s => (cs === 0 || s === cs ? 1 : lerp(1, 0.25, fade));
      const lift = pv.choseAt === null || chosen === 'none' ? 0 : 0.15 * E.outSoft((T - pv.choseAt) / 0.3);
      ctx.drawImage(L.base, b.x, b.y, b.w, b.h);
      if (pv.swap) {
        const O = layers(b, pv.swap.hs, dpr);
        ctx.globalAlpha = ga * (1 - swapK); ctx.drawImage(O.easy, b.x, b.y, b.w, b.h); ctx.drawImage(O.hard, b.x, b.y, b.w, b.h);
      }
      for (const [img, s] of [[L.easy, -r.hardSide], [L.hard, r.hardSide]]) {
        ctx.globalAlpha = ga * swapK * sideA(s);
        ctx.drawImage(img, b.x, b.y, b.w, b.h);
        if (s === cs && lift > 0.005) {
          ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = ga * lift; ctx.drawImage(img, b.x, b.y, b.w, b.h); ctx.globalCompositeOperation = 'source-over';
        }
      }
      ctx.globalAlpha = ga;

      const { FORK_EASY, FORK_HARD, pathPts, along } = A.FORK;
      if (pv.trailAt !== null && r.path !== 'none') {
        const s = sideOf(r, r.path), hard = r.path === 'hard', pts = pathPts(s, hard);
        const k = clamp((T - pv.trailAt) / 0.3, 0, 1), eq = pathLen(pathPts(1, false), b.w, b.h) / pathLen(pts, b.w, b.h);
        ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = rgb(C.amber, 0.22 * k * eq); ctx.lineWidth = 9;
        ctx.beginPath(); smooth(ctx, pts.map(([u, v]) => [X(u), Y(v) + 2])); ctx.stroke();
        ctx.strokeStyle = rgb(C.glow, 0.55 * k * eq); ctx.lineWidth = 2.2;
        ctx.beginPath(); smooth(ctx, pts.map(([u, v]) => [X(u), Y(v) + 2])); ctx.stroke();
        ctx.restore();
      }

      const flick = red ? 1 : 0.9 + 0.1 * Math.sin(T * 11) * Math.sin(T * 4.3);
      for (const [s, hard] of [[r.hardSide, true], [-r.hardSide, false]]) {
        const a = swapK * sideA(s), active = r.phase !== 'choose' && (chosen === 'hard') === hard && chosen !== 'none';
        if (active) continue;
        const n = hard ? FORK_HARD.lights : FORK_EASY.lights, pts = pathPts(s, hard);
        for (let i = 0; i < n; i++) { const p = along(pts, (i + 1) / n), S = STONE_S * depth(p[1]); drawStone(ctx, X(p[0]), Y(p[1]), S, 0, a); }
      }
      if (r.phase !== 'choose' && chosen !== 'none') {
        r.lights.forEach((l, i) => {
          const x = X(l.p[0]), y = Y(l.p[1]), S = STONE_S * depth(l.p[1]), st = pv.lit.get(l) || {}, [nx, ny] = niche(x, y, S);
          if (l.on != null) {
            const p = clamp((T - (st.hitAt ?? T - 1)) / 0.12, 0, 1), sq = T - (st.hitAt ?? -9) < 0.06 && !red ? 0.9 : 1;
            drawStone(ctx, x, y, S, p, 1, sq);
            sprite(ctx, 'glow', C.amber, nx, ny, S * (0.7 + 0.25 * p) * flick, 0.55 * p, true);
            sprite(ctx, 'glow', C.sun, nx, ny, S * 0.18 * flick, 0.95 * p, true);
            J.light(x, y, S * 1.6, C.amber, 0.08 * p);
          } else if (l.gone) {
            const p = clamp((T - (st.goneAt ?? T - 1)) / 0.3, 0, 1);
            drawStone(ctx, x, y, S, 0, 0.85);
            sprite(ctx, 'glow', mixc(C.glow, EMBER, Math.round(p * 4) / 4), nx, ny, S * lerp(0.35, 0.12, p), lerp(0.8, 0.45, p), true);
          } else if (i === r.cur && l.born != null) {
            const age = T - (st.born ?? T), inn = E.outBack(clamp(age / 0.2, 0, 1)), br = red ? 0.9 : 0.85 + 0.15 * Math.sin(age * TAU * 1.4);
            sprite(ctx, 'soft', C.amber, x, y, S * 1.5 * inn, 0.42 * br, true, 1, 0.32);
            sprite(ctx, 'glow', C.glow, nx, ny, S * 1.7 * inn * br, 0.55 * br, true);
            drawStone(ctx, x, y, S, 0.35 * inn, 1);
            J.ring(ctx, nx, ny, S * (0.95 + 0.08 * br) * inn, C.flame, 0.4 * br * inn, 1.3);
            sprite(ctx, 'glow', C.amber, nx, ny, S * 0.5 * inn * flick, 0.8, true);
            sprite(ctx, 'glow', C.sun, nx, ny, S * 0.22 * inn * flick, 1, true);
            ctx.fillStyle = rgb(C.daylight, 0.95 * inn); ctx.beginPath(); ctx.ellipse(nx, ny - S * 0.04, S * 0.055, S * 0.12 * flick, 0, 0, TAU); ctx.fill();
            if (g.pv.hits === 0 && r.i === 0 && age > 0.7) J.tapCue(ctx, nx, ny + S * 0.1, J.unit(b), T - st.born - 0.7, clamp((age - 0.7) / 0.2, 0, 1) * 0.9);
          } else drawStone(ctx, x, y, S, 0, 0.8);
        });
      }

      const bob = red ? 0 : 3 * Math.sin(T * TAU * 0.5);
      for (const [s, hard] of [[r.hardSide, true], [-r.hardSide, false]]) {
        const a = swapK * sideA(s), [u, v] = cairnSpot(s, hard), cx = X(u), by = Y(v), H = CAIRN_H * b.h, bx = cx, bwy = by - H * 0.9;
        const mine = pv.bowlAt !== null && s === cs;
        if (mine) {
          const p = clamp((T - pv.bowlAt) / 0.25, 0, 1);
          sprite(ctx, 'glow', C.amber, bx, bwy - 3, 22 * p * flick, 0.6 * p, true);
          sprite(ctx, 'glow', C.sun, bx, bwy - 2, 6 * p * flick, 0.95 * p, true);
          ctx.fillStyle = rgb(C.flame, 0.9 * p); ctx.beginPath(); ctx.ellipse(bx, bwy - 4, 2.6 * p, 5.5 * p * flick, 0, 0, TAU); ctx.fill();
          J.light(bx, bwy, 60, C.amber, 0.12 * p);
          if (!hard) sprite(ctx, 'glow', C.amber, bx, by + H * 0.5, 14 * p, 0.25 * p, true);
        }
        const m = hard ? r.reward : 1;
        const flying = mine ? pv.orbs : [];
        for (let i = 0; i < m; i++) {
          if (flying[i] && T >= flying[i].launch) continue;
          const [dx, dy] = orbAt(m, i), ox = bx + dx, oy = bwy + dy + bob;
          orb(ctx, ox, oy, a, T, i);
          if (!hard) orb(ctx, ox, by + (by - oy) * 0.55 + 6, a * 0.22, T, i);
        }
        if (r.phase === 'choose' && pv.noIn && r.t > 2.4 && !red) {
          const q = ((r.t - 2.4) % 1.2) / 1.2;
          J.ring(ctx, bx, bwy - 12, 12 + 20 * E.outSoft(q), C.flame, 0.35 * (1 - q) * clamp((r.t - 2.4) / 0.4, 0, 1), 1.4);
        }
      }

      const F = pv.fig, dx = F.to[0] - F.from[0];
      if (pv.choseAt === null && !(F.mode === 'slide' && T - F.t0 < F.dur)) pv.faceT = ((r.t + 0.35) % 1.5) < 0.75 ? -1 : 1;
      else if (Math.abs(dx) > 0.005 && T - F.t0 < F.dur + 0.1) pv.faceT = Math.sign(dx);
      else if (pv.choseAt !== null && pv.faceT === undefined) pv.faceT = cs || 1;
      pv.face = red ? pv.faceT : pv.face + (pv.faceT - pv.face) * (1 - Math.exp(-dt * 16));
      const [fu, fv, air, fadeA] = figPos(pv, T), sc = 0.82 * depth(fv);
      let sx = 1, sy = 1;
      if (!red) {
        const ts = T - (pv.stretchAt ?? -9), tl = T - pv.landAt;
        if (ts < 0.16) { const q = ts < 0.08 ? 1 : 1 - E.outSoft((ts - 0.08) / 0.08); sx = lerp(1, 0.85, q); sy = lerp(1, 1.15, q); }
        else if (tl < 0.12) { const q = Math.sin(Math.PI * tl / 0.12); sx = lerp(1, 1.12, q); sy = lerp(1, 0.88, q); }
      }
      if (F.mode === 'hop' && F.landed === false && T - F.t0 >= F.dur) {
        pv.fig.landed = true; pv.landAt = T;
        if (!red) J.fx.burst(X(fu), Y(fv), 4, C.silver200, 40, { g: 120, life: 0.4, add: false, size: [1.6, 0.8], alpha: [0.6, 0] });
      }
      const bandsNow = pv.bands;
      ctx.globalAlpha = ga * fadeA;
      const scarf = drawFigure(ctx, X(fu), Y(fv), sc, {
        face: Math.abs(pv.face) < 0.15 ? Math.sign(pv.face || 1) * 0.15 : pv.face, sx, sy, air, lift: air * hopH(pv),
        bands: bandsNow, bandAge: k => T - (pv.bandAt[k] ?? -9), flame: 1 + 0.12 * Math.min(4, bandsNow),
      }, T);
      ctx.globalAlpha = ga;

      for (const o of pv.orbs) {
        if (T < o.launch) continue;
        const [u, v] = cairnSpot(o.s, o.hard), H = CAIRN_H * b.h, [dx, dy] = orbAt(o.m, o.k), hx = X(u) + dx, hy = Y(v) - H * 0.9 + dy;
        const p = clamp((T - o.launch) / 0.45, 0, 1);
        if (p >= 1) {
          if (!o.landed) {
            o.landed = true; pv.bands++; pv.bandAt.push(T);
            pv.ripples.push({ x: scarf[0], y: scarf[1], t0: T });
            J.bloom(scarf[0], scarf[1], 26, C.glow, 0.5, 0.12, 0.4);
            if (!red) J.fx.burst(scarf[0], scarf[1], 5, C.glow, 70, { life: 0.4, size: [2, 0.6] });
            hap('medium'); sfx('fork_orb', { k: o.k, m: o.m });
            A.session?.kick?.(0.22);
            if (A.session) A.session.scarf = Math.min(4, (A.session.scarf || 0) + 1);
            if (g.choices.length === 2 || (r.i === 0 && r.path === 'none')) { if (pv.orbs.every(q => q.landed)) J.spill(0.3 + 0.08 * g.glows); }
          }
          continue;
        }
        if (red) {
          orb(ctx, hx, hy, 1 - p, T, o.k);
          sprite(ctx, 'glow', C.amber, scarf[0], scarf[1], 12, 0.8 * p, true);
          continue;
        }
        const arc = clamp((Math.min(hy, scarf[1]) - b.y - 12) * 0.6, 4, 34), q = E.inOut(p), x = lerp(hx, scarf[0], q), y = lerp(hy, scarf[1], q) - Math.sin(Math.PI * p) * arc;
        orb(ctx, x, y, 1, T, o.k, 1 - 0.35 * p);
        J.fx.trailMote(x, y, C.glow, { life: 0.35, size: [1.6, 0.6] });
      }

      pv.ripples = pv.ripples.filter(rp => T - rp.t0 < 0.5);
      for (const rp of pv.ripples) {
        const q = (T - rp.t0) / 0.5;
        if (red) sprite(ctx, 'glow', C.amber, rp.x, rp.y, 18, 0.5 * (1 - q), true);
        else J.ring(ctx, rp.x, rp.y, 6 + 26 * E.outSoft(q), C.glow, 0.6 * (1 - q), 1.6);
      }
      pv.pats = pv.pats.filter(pt => T - pt.t0 < 0.4);
      for (const pt of pv.pats) {
        const q = (T - pt.t0) / 0.4, x = X(pt.u), y = Y(pt.v);
        if (red) sprite(ctx, 'glow', C.silver200, x, y, 14, 0.35 * (1 - q), false);
        else { J.ring(ctx, x, y, 5 + 20 * E.outSoft(q), C.silver200, 0.5 * (1 - q), 1.3); sprite(ctx, 'soft', C.silver100, x, y, 10, 0.18 * (1 - q), true); }
      }
    },
  });

  function orb(ctx, x, y, a, T, i, sz = 1) {
    if (a <= 0.01) return;
    const k = 0.92 + 0.08 * (rm() ? 1 : Math.sin(T * TAU * 0.5));
    sprite(ctx, 'glow', C.amber, x, y, 20 * sz * k, 0.6 * a, true);
    sprite(ctx, 'glow', C.glow, x, y, 8 * sz, 0.9 * a, true);
    sprite(ctx, 'glow', C.sun, x, y, 3.6 * sz, a, true);
  }

  function hopTo(pv, p, T) {
    const cur = figPos(pv, T), dir = Math.sign(p[0] - cur[0]) || 1;
    pv.fig = { from: [cur[0], cur[1]], to: [p[0] - dir * 0.05, p[1] + 0.012], t0: T, dur: rm() ? 0.15 : 0.22, mode: 'hop', landed: false };
  }

  function hopH(pv) {
    const f = pv.fig;
    return 10 + 120 * Math.hypot(f.to[0] - f.from[0], f.to[1] - f.from[1]);
  }

  function figPos(pv, T) {
    const f = pv.fig, p = clamp((T - f.t0) / f.dur, 0, 1);
    if (f.mode === 'walk') { const q = E.inOut(p), pt = A.FORK.along(f.pts, q); return [pt[0], pt[1], 0, 1]; }
    if (f.mode === 'slide') return p < 0.4 ? [f.from[0], f.from[1], 0, 1 - p / 0.4] : [f.to[0], f.to[1], 0, E.outSoft((p - 0.4) / 0.6)];
    if (rm()) return p < 0.5 ? [f.from[0], f.from[1], 0, 1 - 2 * p] : [f.to[0], f.to[1], 0, 2 * p - 1];
    return [lerp(f.from[0], f.to[0], p), lerp(f.from[1], f.to[1], p), p < 1 ? Math.sin(Math.PI * p) : 0, 1];
  }
})();
