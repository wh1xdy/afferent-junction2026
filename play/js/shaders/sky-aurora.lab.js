(() => {
  const Lab = window.Lab;
  if (!Lab) return;
  const q = new URLSearchParams(location.search);
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const ss = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const load = src => new Promise(res => { const s = document.createElement('script'); s.src = src; s.onload = () => res(true); s.onerror = () => res(false); document.body.appendChild(s); });
  const inject = async src => {
    const code = (await (await fetch(src)).text()).replace(/^window\.A = \{\};/m, 'window.A = window.A || {};');
    const s = document.createElement('script'); s.textContent = code + `\n//# sourceURL=${src}`; document.body.appendChild(s);
  };
  let worldOk = false;
  (async () => {
    if (!(window.A && A.World)) { await inject('js/util.js'); await load('js/art.js'); await load('js/world.js'); }
    worldOk = !!(window.A && A.World);
  })().catch(e => console.warn('sky-aurora lab: world.js unavailable', e));

  const mkV = () => ({
    t: 0, worldX: 0, walking: false, stride: 1, chunks: [{ type: 'harbour', x0: -700, x1: 420, seed: 1 }],
    sat: { yellow: 0, blue: 0, green: 0, dawn: 0 }, sweep: 0, aurora: 0.05, fog: 0.45, fogDrift: 1, stars: 120, warm: 0.04, sparkle: 0, daylight: 0,
    flame: 1, lanternRadius: 70, lanternBright: 1, lanternGain: 1, sparks: [], iceGlow: 0, stove: 0, beam: 0,
    orb: { b: 0, hold: 0, sync: 0, alpha: 0 }, tapHint: 0, flash: 0, exposure: 1, sunP: 0, border: 0.1, borderColor: [255, 217, 160], black: 0, profile: 'live',
  });
  const fill = (V, t, s) => {
    const g = clamp(s.ret * 3 - 2, 0, 1);
    V.t = t; V.sat.yellow = clamp(s.ret * 3, 0, 1); V.sat.blue = clamp(s.ret * 3 - 1, 0, 1); V.sat.green = g; V.sat.dawn = ss(0.5, 0.85, s.tod);
    V.sunP = s.night ? 0 : clamp((s.tod - 0.62) / 0.3, 0, 1); V.fog = s.fog; V.night = s.night; V.mode = s.mode; V.aurora = 0.05 + 0.55 * g;
    V.worldX = +(q.get('wx') || 0);
    A.config = Object.assign(A.config || {}, { reducedMotion: !!s.rm });
  };
  const DRAW = new Set(['fillRect', 'drawImage', 'fill', 'stroke', 'strokeRect', 'fillText', 'strokeText', 'putImageData']);
  const skyless = (ctx, H) => {
    const f = { skip: true };
    const p = new Proxy(ctx, {
      get(o, k) {
        const v = o[k];
        if (typeof v !== 'function') return v;
        return (...a) => { if (f.skip && k === 'moveTo' && a[1] === H) f.skip = false; if (f.skip && DRAW.has(k)) return undefined; return v.apply(o, a); };
      },
      set(o, k, v) { o[k] = v; return true; },
    });
    return [p, f];
  };
  const canvas = (el, W, H, dpr) => { const c = document.createElement('canvas'); c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); el.appendChild(c); return c; };
  const toggle = (el, text, on, cb) => {
    let d = el.nextElementSibling;
    if (!d || !d.classList.contains('tools')) { d = document.createElement('div'); d.className = 'tools'; d.style.cssText = 'display:flex;gap:6px'; el.after(d); }
    const b = document.createElement('button'); b.textContent = text; b.classList.toggle('on', on);
    b.addEventListener('click', () => { on = !on; b.classList.toggle('on', on); cb(on); });
    d.appendChild(b);
  };

  Lab.add('sky-aurora', {
    title: 'sky-aurora: kaamos sky and veneer aurora (shader, world.js on top)',
    build(el, W, H, dpr) {
      const glC = canvas(el, W, H, dpr), topC = canvas(el, W, H, dpr), tx = topC.getContext('2d');
      const sky = A.Shaders['sky-aurora'].create(), V = mkV();
      let ok = sky.init(glC, { preserve: true, webgl1: q.get('webgl1') === '1' }), showWorld = q.get('sky') !== 'bare', proxy = null, flag = null;
      if (ok) sky.resize(W, H, dpr);
      sky.onfail = () => { ok = false; glC.style.display = 'none'; };
      if (!ok) glC.style.display = 'none';
      toggle(el, 'World', showWorld, v => (showWorld = v));
      Lab.sky = sky;
      return {
        label: () => (ok ? (sky.webgl2 ? 'WebGL2' : 'WebGL1') : 'GL failed, Canvas 2D fallback'),
        frame(t, s) {
          fill(V, t, s);
          tx.setTransform(dpr, 0, 0, dpr, 0, 0); tx.clearRect(0, 0, W, H);
          if (worldOk && (showWorld || !ok)) {
            if (!proxy) [proxy, flag] = skyless(tx, H);
            flag.skip = ok;
            A.World.draw(ok ? proxy : tx, W, H, V);
          }
          if (!ok) return 0;
          const [lx, ly] = worldOk ? A.World.lanternPos() : [s.lx * W, s.ly * H];
          const t0 = performance.now();
          sky.render(t, { ...V, rm: s.rm, core: s.core, lx, ly, layers: Lab.skyLayers });
          if (q.get('sync') === '1') sky.finish();
          return performance.now() - t0;
        },
      };
    },
  });

  Lab.add('sky-aurora-2d', {
    title: 'sky-aurora reference: Canvas 2D sky today (world.js)',
    build(el, W, H, dpr) {
      const c = canvas(el, W, H, dpr), x = c.getContext('2d'), V = mkV();
      return {
        label: () => 'Canvas 2D',
        frame(t, s) {
          if (!worldOk) return 0;
          fill(V, t, s);
          x.setTransform(dpr, 0, 0, dpr, 0, 0);
          const t0 = performance.now();
          A.World.draw(x, W, H, V);
          return performance.now() - t0;
        },
      };
    },
  });
})();
