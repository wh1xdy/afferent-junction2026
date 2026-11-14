window.A = {};

A.clamp = (x, a, b) => Math.max(a, Math.min(b, x));
A.lerp = (a, b, t) => a + (b - a) * t;
A.ease = t => { t = A.clamp(t, 0, 1); return t * t * (3 - 2 * t); };
A.ema = (prev, x, dt, tau) => prev + (x - prev) * (1 - Math.exp(-dt / tau));

A.hex = h => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
A.toHex = c => '#' + c.map(v => Math.round(A.clamp(v, 0, 255)).toString(16).padStart(2, '0')).join('').toUpperCase();
A.rgb = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
A.mixc = (a, b, t) => [A.lerp(a[0], b[0], t), A.lerp(a[1], b[1], t), A.lerp(a[2], b[2], t)];
A.desat = (c, s) => {
  const l = 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2];
  return [A.lerp(l, c[0], s), A.lerp(l, c[1], s), A.lerp(l, c[2], s)];
};

A.rng = seed => () => {
  seed |= 0; seed = seed + 0x6D2B79F5 | 0;
  let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
  t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
  return ((t ^ t >>> 14) >>> 0) / 4294967296;
};

A.noise = (() => {
  const h = i => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
  return x => { const i = Math.floor(x), f = x - i; return A.lerp(h(i), h(i + 1), f * f * (3 - 2 * f)); };
})();

A.median = xs => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

A.uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
  const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16);
}));

A.bus = (() => {
  const ls = {};
  return {
    on: (e, f) => (ls[e] = ls[e] || []).push(f),
    emit: (e, d) => (ls[e] || []).forEach(f => f(d)),
  };
})();
