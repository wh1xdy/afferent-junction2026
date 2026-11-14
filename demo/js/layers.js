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
    far_mountains: { anchor: 'horizon', density: 2.03, base: 1, dy: 3 },
    far_islands: { anchor: 'horizon', density: 2.79, base: 1, dy: 6.75 },
    mid_hills_spruce: { anchor: 'mid', density: 1.97, base: 1, dy: 8, fill: true },
    ground_forest: { anchor: 'ground', base: 0.36 },
    ground_shore: { anchor: 'ground', base: 0.16 },
    ground_sauna: { anchor: 'ground', base: 0.06 },
    ground_harbour: { anchor: 'ground', base: 0.03 },
    ground_lake: { anchor: 'ground', base: 0.03 },
  };
  const spec = (name, meta = {}) => ({ density: null, base: 1, dy: 0, tile: false, fill: false, ...ART[name], ...meta });

  const api = { DEPTH, MID_H, ART, spec, layout, covered };
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root && root.A) root.A.Layers = api;
})(typeof window !== 'undefined' ? window : globalThis);
