(() => {
  const { clamp, lerp, ease, rgb, hex, mixc } = A;
  const { glow } = A.J;
  const Au = A.Audio, calm = A.J.rm;
  const WARM = hex('#F2B544'), GLOW = hex('#FFD9A0'), FLAME = hex('#F2E6C9'), SILVER = hex('#CBD6E2');
  const VIOLET = hex('#5B4B8A'), DEEP = hex('#1E1838'), WHITE = hex('#F3F6FA');

  A.definePresenter('lanterns', {
    on(g, ev, d, now) {
      if (ev !== 'respond') return;
      if (d.rewarded) {
        g.sparks.push({ born: now, side: d.side });
        Au.piano(8, 0.16);
        A.session?.kick(0.6);
      } else if (d.resp !== null) Au.piano(2, 0.06);
    },
    extra: () => ({}),
    draw(g, ctx, b, now) {
      const lantern = A.drawLantern;
      g.sparks = g.sparks.filter(s => now - s.born < 1);
      const tr = g.tr, X = u => b.x + u * b.w, Y = v => b.y + v * b.h, s0 = Math.min(b.w * 0.2, b.h * 0.3);
      for (const side of ['left', 'right']) {
        const rich = tr ? (tr.richSide === side) : side === 'left', c = rich ? WARM : SILVER;
        let scale = 1, a = 0.5;
        if (tr) {
          const isLarger = (tr.L === 'rich') === rich;
          if (tr.phase === 'ready') a = 0.4 + 0.15 * ease(tr.t / 0.32);
          if (tr.phase === 'cue') {
            const ct = tr.t - tr.cueT, on = ct < 0.4;
            a = on ? 1 : 0.6 + (calm() ? 0 : 0.08 * Math.sin(now * 3));
            if (on && isLarger) scale = 1.08;
          }
          if (tr.phase === 'fb') {
            const ft = tr.t - tr.fbT, chosen = tr.resp === side;
            a = chosen ? (tr.rewarded ? 1.25 - 0.3 * ease(ft / 0.75) : 0.85 - 0.3 * ease(ft / 0.4)) : 0.35;
          }
        }
        lantern(ctx, X(side === 'left' ? 0.3 : 0.7), Y(0.47), s0 * scale, c, a, now, side === 'left' ? 1 : 4);
      }
      for (const sp of g.sparks) {
        const p = clamp((now - sp.born) / 0.85, 0, 1), sx = X(sp.side === 'left' ? 0.3 : 0.7);
        glow(ctx, sx, Y(0.47), s0 * (1.2 + 1.5 * ease(p)), WARM, 0.5 * (1 - p));
        for (let k = 0; k < 6; k++) glow(ctx, sx + Math.sin(k * 2.1) * s0 * 0.6 * p, Y(0.4) - p * s0 * (0.8 + 0.25 * k), 5, GLOW, 1 - p);
      }
      const done = g.trials.length;
      for (let i = 0; i < 12; i++) glow(ctx, b.x + b.w * (0.5 + (i - 5.5) * 0.045), b.y + b.h * 0.93, 5, FLAME, i < done ? 0.75 : 0.12);
    },
  });
})();
