(() => {
  const { clamp, lerp, ease, rgb, hex, mixc } = A;
  const { glow } = A.J;
  const Au = A.Audio, calm = A.J.rm;
  const WARM = hex('#F2B544'), GLOW = hex('#FFD9A0'), FLAME = hex('#F2E6C9'), SILVER = hex('#CBD6E2');
  const VIOLET = hex('#5B4B8A'), DEEP = hex('#1E1838'), WHITE = hex('#F3F6FA');
  const tray = (ctx, b, n, c = WARM) => {
    for (let i = 0; i < n; i++) glow(ctx, b.x + b.w * (0.5 + (i - (n - 1) / 2) * 0.07), b.y + b.h * 0.93, 9, c, 0.9);
  };

  A.definePresenter('fork', {
    on(g, ev, d, now) {
      if (ev === 'choose' && d.path !== 'none') Au.piano(d.hard ? 6 : 4, 0.14);
      if (ev === 'hit') Au.piano(3 + (g.items % 6), 0.1);
      if (ev === 'reward') {
        for (let k = 0; k < d.got; k++) g.sparks.push({ born: now + k * 0.12, k, n: d.got });
        Au.piano(7 + d.got, 0.16);
        A.session?.kick(0.35 + 0.15 * d.got);
      }
    },
    extra: () => ({}),
    draw(g, ctx, b, now) {
      const { FORK_EASY, FORK_HARD, pathPts, along } = A.FORK, lantern = A.drawLantern;
      g.sparks = g.sparks.filter(s => now - s.born < 1.1);
      const r = g.round;
      if (!r) return;
      const X = u => b.x + u * b.w, Y = v => b.y + v * b.h, k = Math.min(b.w, b.h);
      const sel = side => r.phase === 'choose' ? 1 : (r.path === 'hard') === (side === r.hardSide) ? 1 : 0.25;
      for (const side of [-1, 1]) {
        const hard = side === r.hardSide, a = sel(side) * (r.phase === 'reward' && !(r.path === 'hard') === hard ? 0.6 : 1);
        const pts = pathPts(side, hard);
        ctx.save();
        const grd = ctx.createLinearGradient(0, Y(hard ? 0.1 : 0.55), 0, Y(0.95));
        grd.addColorStop(0, rgb(VIOLET, 0.75 * a)); grd.addColorStop(0.6, rgb(VIOLET, 0.32 * a)); grd.addColorStop(1, rgb(DEEP, 0.1 * a));
        ctx.fillStyle = grd;
        ctx.beginPath();
        if (hard) {
          ctx.moveTo(X(0.5 + side * 0.0), Y(0.97)); ctx.lineTo(X(0.5 + side * 0.17), Y(0.45)); ctx.lineTo(X(0.5 + side * 0.22), Y(0.38));
          ctx.lineTo(X(0.5 + side * 0.28), Y(0.07)); ctx.lineTo(X(0.5 + side * 0.36), Y(0.24)); ctx.lineTo(X(0.5 + side * 0.41), Y(0.3)); ctx.lineTo(X(0.5 + side * 0.56), Y(0.97));
        } else { ctx.moveTo(X(0.5 + side * 0.02), Y(0.97)); ctx.bezierCurveTo(X(0.5 + side * 0.2), Y(0.62), X(0.5 + side * 0.34), Y(0.52), X(0.5 + side * 0.56), Y(0.66)); ctx.lineTo(X(0.5 + side * 0.56), Y(0.97)); }
        ctx.closePath(); ctx.fill();
        if (hard) {
          ctx.fillStyle = rgb(SILVER, 0.55 * a);
          ctx.beginPath(); ctx.moveTo(X(0.5 + side * 0.28), Y(0.07)); ctx.lineTo(X(0.5 + side * 0.325), Y(0.165)); ctx.lineTo(X(0.5 + side * 0.3), Y(0.15)); ctx.lineTo(X(0.5 + side * 0.28), Y(0.18)); ctx.lineTo(X(0.5 + side * 0.255), Y(0.15)); ctx.lineTo(X(0.5 + side * 0.24), Y(0.16)); ctx.closePath(); ctx.fill();
        } else {
          ctx.strokeStyle = rgb(SILVER, 0.22 * a); ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.moveTo(X(0.5 + side * 0.12), Y(0.74)); ctx.bezierCurveTo(X(0.5 + side * 0.24), Y(0.6), X(0.5 + side * 0.36), Y(0.53), X(0.5 + side * 0.56), Y(0.66)); ctx.stroke();
        }
        ctx.strokeStyle = rgb(FLAME, 0.4 * a); ctx.lineWidth = 2; ctx.setLineDash([1.5, 7]); ctx.lineCap = 'round';
        ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(X(p[0]), Y(p[1])) : ctx.moveTo(X(p[0]), Y(p[1]))); ctx.stroke();
        ctx.setLineDash([]); ctx.restore();
        const n = hard ? FORK_HARD.lights : FORK_EASY.lights, active = r.phase !== 'choose' && (r.path === 'hard') === hard;
        if (!active) for (let i = 0; i < n; i++) { const p = along(pts, (i + 1) / n); glow(ctx, X(p[0]), Y(p[1]), 8, FLAME, 0.45 * a); ctx.fillStyle = rgb(FLAME, 0.6 * a); ctx.beginPath(); ctx.arc(X(p[0]), Y(p[1]), 1.6, 0, 6.28); ctx.fill(); }
        const end = pts[pts.length - 1], m = hard ? r.reward : 1, gone = r.phase === 'reward' && active;
        for (let i = 0; i < m && !gone; i++) {
          const ox = (i - (m - 1) / 2) * k * 0.075, bob = calm() ? 0 : 2 * Math.sin(now * 2 + i);
          const ox2 = X(end[0]) + ox, oy = Y(end[1]) - k * 0.075 + bob;
          glow(ctx, ox2, oy, k * 0.085, WARM, (0.7 + 0.2 * Math.sin(now * 3 + i)) * a);
          glow(ctx, ox2, oy, k * 0.03, GLOW, 0.9 * a);
          ctx.fillStyle = rgb(WHITE, 0.95 * a); ctx.beginPath(); ctx.arc(ox2, oy, k * 0.011, 0, 6.28); ctx.fill();
        }
      }
      lantern(ctx, X(0.5), Y(0.885), k * 0.075, WARM, 0.9, now, 3);
      if (r.phase === 'path' || r.phase === 'reward') {
        r.lights.forEach((l, i) => {
          const x = X(l.p[0]), y = Y(l.p[1]);
          if (l.on) glow(ctx, x, y, 12, WARM, 0.85);
          else if (l.gone) glow(ctx, x, y, 8, FLAME, 0.12);
          else if (i === r.cur) {
            const age = r.t - l.born, pulse = calm() ? 0.9 : 0.75 + 0.25 * Math.sin(age * 9);
            glow(ctx, x, y, k * r.spec.hit * 1.1 * ease(age / 0.2), GLOW, pulse);
            ctx.fillStyle = rgb(WHITE, 0.9); ctx.beginPath(); ctx.arc(x, y, 4, 0, 6.28); ctx.fill();
          } else glow(ctx, x, y, 7, FLAME, 0.22);
        });
      }
      const landed = g.sparks.filter(s => now - s.born < 0.9).length;
      for (const s of g.sparks) {
        const p = clamp((now - s.born) / 0.9, 0, 1);
        if (p <= 0 || p >= 1) continue;
        const hard = r.path === 'hard', end = pathPts(hard ? r.hardSide : -r.hardSide, hard).pop();
        const tx = b.x + b.w * (0.5 + (g.glows - s.n + s.k - (g.glows - 1) / 2) * 0.07), ty = Y(0.93);
        const ox = (s.k - (s.n - 1) / 2) * k * 0.075, sx = X(end[0]) + ox, sy = Y(end[1]) - k * 0.07;
        glow(ctx, lerp(sx, tx, ease(p)), lerp(sy, ty, ease(p)) - Math.sin(p * Math.PI) * 30, 14, WARM, 1 - 0.3 * p);
      }
      tray(ctx, b, g.glows - landed);
    },
  });
})();
