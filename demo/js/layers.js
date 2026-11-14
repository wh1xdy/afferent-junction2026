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

  const api = { DEPTH, MID_H, ART, spec, layout, covered };
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root && root.A) root.A.Layers = api;
})(typeof window !== 'undefined' ? window : globalThis);
