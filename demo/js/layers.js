((root) => {
  const DEPTH = { horizon: 0.15, mid: 0.45, low: 0.45 }, MID_H = 0.13;

  const layout = (W, H, cy = 0, low = 0) => {
    const u = H / 844, gy = H * 0.82 + cy, hy = H * 0.6 + DEPTH.horizon * cy, my = H * 0.82 + DEPTH.mid * cy + DEPTH.low * Math.max(0, low);
    return {
      gy, hy, my,
      layers: [['sky', 0, hy + 2], ['sea', hy, H], ['mid', my + 8 * u - H * MID_H, H], ['ground', gy - 200 * u, H]],
    };
  };

  const covered = (H, layers) => {
    const spans = layers.map(([, a, b]) => [Math.max(0, a), Math.min(H, b)]).sort((p, q) => p[0] - q[0]);
    let reach = 0;
    for (const [a, b] of spans) { if (a > reach + 0.5) return false; reach = Math.max(reach, b); }
    return reach >= H - 0.5;
  };

  const ART = {
    far_mountains: { anchor: 'horizon', density: 2, base: 1, tile: true },
    far_islands: { anchor: 'horizon', density: 2, base: 1, tile: true },
    hills_rolling: { anchor: 'horizon', density: 1, base: 0.173, dy: 52, tile: true, fill: true },
    mid_hills_spruce: { anchor: 'mid', density: 2, base: 0.33, tile: true, fill: true },
    ground_forest: { anchor: 'ground', density: 1, base: 0.1, tile: true },
    ground_shore: { anchor: 'ground', density: 1, base: 0.1, tile: true },
    ground_sauna: { anchor: 'ground', density: 1, base: 0.1, tile: true },
    ground_harbour: { anchor: 'ground', density: 1, base: 0.1, tile: true },
    ground_lake: { anchor: 'ground', density: 1, base: 0.1, tile: true },
  };
  const spec = (name, meta = {}) => ({ density: null, base: 1, dy: 0, tile: false, fill: false, ...ART[name], ...meta });

  // Screen places (CSS px, top = the safe-area inset at the top) that the painted world keeps clear of. The play
  // controls of shell.css: the × at the top left and the wake button at the top right are 48 px squares 8 px under
  // the inset, the SIMULATED badge is centred 20 px under it, and a task's line starts 56 px under it.
  const controls = (W, top = 0) => ({
    close: { x0: 8, x1: 56, y0: top + 8, y1: top + 56 },
    wake: { x0: W - 56, x1: W - 8, y0: top + 8, y1: top + 56 },
    badge: { x0: W / 2 - 52, x1: W / 2 + 52, y0: top + 20, y1: top + 44 },
    line: top + 56,
  });

  // The moon on the screen: upper right, between the badge and the wake button and inside the row of the top
  // controls, so it never sits in the status bar or on a task's line. drift (px) moves it left a little while
  // walking. x, y, r are the sprite's centre and radius; the lit disc is 0.75 r across, 0.3 r up and left of it.
  const moon = (W, H, top = 0, drift = 0) => {
    const r = Math.min(H * 0.022, 20), C = controls(W, top);
    const lo = C.badge.x1 + 6 + 0.45 * r, hi = C.wake.x0 - 6 - 1.05 * r;
    const x = Math.min(hi, Math.max(lo, Math.max(W * 0.72, W * 0.76 - drift)));
    return { x, y: (C.close.y0 + C.close.y1) / 2 + 0.3 * r, r };
  };
  // The lit disc of the moon (where it can be seen), as a box.
  const moonDisc = m => ({ x0: m.x - 1.05 * m.r, x1: m.x + 0.45 * m.r, y0: m.y - 1.05 * m.r, y1: m.y + 0.45 * m.r });

  // The figure's lane: the band of the screen the rider and the walker (with the carried lantern, its touch dot and
  // the ring of light that leaves it) can reach, at any camera height, dip, jump and zoom of a ride. The Live
  // vitals panel stays below it (css/livevitals.css). Measured in headless Chrome over full sessions; ride.test.js
  // and livevitals.test.js hold the numbers.
  const LANE = { top: 0.55, bottom: 0.855 };
  const lane = (W, H) => ({ x0: 0, x1: W, y0: H * LANE.top, y1: H * LANE.bottom });

  const api = { DEPTH, MID_H, ART, spec, layout, covered, controls, moon, moonDisc, LANE, lane };
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root && root.A) root.A.Layers = api;
})(typeof window !== 'undefined' ? window : globalThis);
