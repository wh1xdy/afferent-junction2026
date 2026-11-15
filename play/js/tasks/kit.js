(() => {
  // Small shared pieces for the trial-based minigames (windows, vihta, birds, swans, faces, owls).
  const { clamp, rgb, mixc } = A;
  const R = Math.random;
  const r3 = x => (x == null || !Number.isFinite(x) ? null : Math.round(x * 1000) / 1000);
  const ms = s => (s == null || !Number.isFinite(s) ? null : Math.round(s * 1000));
  const median = xs => (xs.length ? A.median(xs) : null);
  const quant = (xs, q) => {
    if (!xs.length) return null;
    const s = [...xs].sort((a, b) => a - b), i = (s.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i);
    return s[lo] + (s[hi] - s[lo]) * (i - lo);
  };
  const iqr = xs => (xs.length >= 4 ? quant(xs, 0.75) - quant(xs, 0.25) : null);
  const mean = xs => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  const cv = xs => {
    const m = mean(xs);
    if (!m || xs.length < 3) return null;
    return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1)) / m;
  };
  const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  // Slope of y on x (least squares); null when x has no spread.
  const slope = pts => {
    if (pts.length < 2) return null;
    const mx = mean(pts.map(p => p[0])), my = mean(pts.map(p => p[1]));
    let num = 0, den = 0;
    for (const [x, y] of pts) { num += (x - mx) * (y - my); den += (x - mx) ** 2; }
    return den > 0 ? num / den : null;
  };
  // Inverse standard normal CDF (Acklam), for d prime.
  const zinv = p => {
    const a = [-39.6968302866538, 220.946098424521, -275.928510446969, 138.357751867269, -30.6647980661472, 2.50662827745924];
    const b = [-54.4760987982241, 161.585836858041, -155.698979859887, 66.8013118877197, -13.2806815528857];
    const c = [-0.00778489400243029, -0.322396458041136, -2.40075827716184, -2.54973253934373, 4.37466414146497, 2.93816398269878];
    const d = [0.00778469570904146, 0.32246712907004, 2.445134137143, 3.75440866190742];
    const pl = 0.02425;
    if (p < pl) { const q = Math.sqrt(-2 * Math.log(p)); return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
    if (p > 1 - pl) { const q = Math.sqrt(-2 * Math.log(1 - p)); return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
    const q = p - 0.5, r = q * q;
    return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  };
  // Log-linear corrected d prime (Hautus 1995).
  const dprime = (hits, misses, fas, crs) => {
    const s = hits + misses, n = fas + crs;
    if (!s || !n) return null;
    return zinv((hits + 0.5) / (s + 1)) - zinv((fas + 0.5) / (n + 1));
  };

  // Rounded scene card inside the task box.
  const card = (ctx, b, top, bottom, rad = 22) => {
    const g = ctx.createLinearGradient(0, b.y, 0, b.y + b.h);
    g.addColorStop(0, rgb(top)); g.addColorStop(1, rgb(bottom));
    ctx.save();
    ctx.fillStyle = g; ctx.beginPath(); ctx.roundRect(b.x, b.y, b.w, b.h, rad); ctx.fill();
    ctx.restore();
  };
  const clip = (ctx, b, rad = 22) => { ctx.save(); ctx.beginPath(); ctx.roundRect(b.x, b.y, b.w, b.h, rad); ctx.clip(); };

  // Trial progress dots along the bottom of the card.
  const progress = (ctx, b, n, done, U) => A.J.dots(ctx, b.x + b.w / 2, b.y + b.h - 16 * U, Math.min(n, 20), Math.round(done * Math.min(n, 20) / Math.max(1, n)), U * (n > 12 ? 0.62 : 0.8));

  const star = (ctx, b, seed, U, at, n = 24, a = 0.6) => {
    const rng = A.rng(seed);
    for (let i = 0; i < n; i++) {
      const x = b.x + rng() * b.w, y = b.y + rng() * b.h * 0.45, tw = 0.6 + 0.4 * Math.sin(at * (0.6 + rng()) + i);
      A.J.disc(ctx, x, y, (0.5 + rng() * 0.8) * U, A.J.C.silver050, a * tw);
    }
  };

  A.TaskKit = { r3, ms, median, quant, iqr, mean, cv, shuffle, slope, zinv, dprime, card, clip, progress, star, mixc, clamp };
})();
