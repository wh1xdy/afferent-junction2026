(() => {
  const root = document.documentElement;
  const DYNAMIC = {
    'surface': '#0D182A', 'surface-dim': '#081325', 'surface-bright': '#2F394D',
    'surface-container-lowest': '#040E20', 'surface-container-low': '#111C2E', 'surface-container': '#172234',
    'surface-container-high': '#202A3D', 'surface-container-highest': '#2A3548',
    'on-surface-variant': '#B3C1E0', 'outline': '#7E8CA9', 'outline-variant': '#394761',
    'secondary': '#B6C7EA', 'secondary-container': '#374764', 'on-secondary-container': '#D6E3FF',
  };
  const MAX_SHIFT = 40, STEP = 5;

  const lin = v => (v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  const oklab = (r, g, b) => {
    r = lin(r); g = lin(g); b = lin(b);
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
  };
  const lch = hex => {
    const n = parseInt(hex.slice(1), 16), [L, a, b] = oklab(n >> 16 & 255, n >> 8 & 255, n & 255);
    return [L, Math.hypot(a, b), (Math.atan2(b, a) * 180 / Math.PI + 360) % 360];
  };
  const BASE = Object.fromEntries(Object.entries(DYNAMIC).map(([k, v]) => [k, lch(v)]));
  const OK_HUE = lch('#1E3150')[2];

  let scheme = 'kaamos', hue = null, timer = 0;
  const night = () => typeof A.night === 'function' && A.night();

  const clearDynamic = () => Object.keys(DYNAMIC).forEach(k => root.style.removeProperty('--md-sys-color-' + k));
  const applyHue = h => {
    if (scheme !== 'kaamos' || h === hue) return;
    hue = h;
    if (h == null) { clearDynamic(); return; }
    const shift = h - OK_HUE;
    for (const [k, [L, C, H]] of Object.entries(BASE)) root.style.setProperty('--md-sys-color-' + k, `oklch(${L.toFixed(4)} ${C.toFixed(4)} ${((H + shift + 360) % 360).toFixed(1)})`);
  };

  const probe = document.createElement('canvas');
  probe.width = 32; probe.height = 20;
  let pending = false;
  const seed = () => { pending = scheme === 'kaamos'; };
  const frame = src => {
    if (!pending) return;
    pending = false;
    if (!src || !src.width || scheme !== 'kaamos') return;
    try {
      const c = probe.getContext('2d', { willReadFrequently: true });
      c.drawImage(src, 0, 0, src.width, src.height * 0.6, 0, 0, 32, 20);
      const d = c.getImageData(0, 0, 32, 20).data;
      let sa = 0, sb = 0, n = 0;
      for (let i = 0; i < d.length; i += 4) { const [, a, b] = oklab(d[i], d[i + 1], d[i + 2]); sa += a; sb += b; n++; }
      const chroma = Math.hypot(sa, sb) / n;
      if (chroma < 0.012) return applyHue(null);
      let h = (Math.atan2(sb, sa) * 180 / Math.PI + 360) % 360;
      const delta = Math.max(-MAX_SHIFT, Math.min(MAX_SHIFT, ((h - OK_HUE + 540) % 360) - 180));
      h = Math.round((OK_HUE + delta) / STEP) * STEP;
      applyHue(h);
    } catch { applyHue(null); }
  };

  const set = (name, { fade = 2000 } = {}) => {
    root.style.setProperty('--af-scheme-fade', fade + 'ms');
    if (name !== 'kaamos') { hue = undefined; clearDynamic(); }
    scheme = name;
    root.dataset.sky = name;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = name === 'kevat' ? '#FFF8F3' : '#0D182A';
    if (name === 'kaamos') seed();
  };
  const room = () => { root.dataset.room = A.config?.quietNight && night() ? 'dark' : ''; };
  const motion = () => { root.dataset.motion = A.config?.reducedMotion ? 'reduced' : ''; };
  const local = () => { const h = new Date().getHours(); return h >= 10 && h < 17 && !night() ? 'kevat' : 'kaamos'; };
  const sync = () => { room(); motion(); };

  const watch = () => {
    clearInterval(timer);
    timer = setInterval(() => { root.style.setProperty('--af-scheme-fade', '4000ms'); seed(); }, 8000);
  };
  A.bus.on('segment', () => { root.style.setProperty('--af-scheme-fade', '4000ms'); seed(); });
  A.bus.on('home', () => setTimeout(() => { root.style.setProperty('--af-scheme-fade', '0ms'); seed(); }, 400));
  watch();

  A.Theme = { set, sync, room, motion, seed, frame, local, get scheme() { return scheme; } };
  set('kaamos', { fade: 0 });
})();
