(() => {
  const store = {};
  const MODES = ['colour', 'grey', 'shade'];

  const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, w | 0); c.height = Math.max(1, h | 0); return c; };

  const feather = (x, w, h, e = 0.18) => {
    x.globalCompositeOperation = 'destination-in';
    const g = x.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(e, 'rgba(0,0,0,1)'); g.addColorStop(1 - e, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    x.globalCompositeOperation = 'source-over';
  };

  function prepare(img, name) {
    const c = canvas(img.naturalWidth, img.naturalHeight);
    const x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(img, 0, 0);
    if (name.startsWith('bg_')) return { colour: c, w: c.width, h: c.height };
    if (name.startsWith('fog')) feather(x, c.width, c.height);
    const d = x.getImageData(0, 0, c.width, c.height).data;
    let x0 = c.width, y0 = c.height, x1 = 0, y1 = 0;
    for (let y = 0; y < c.height; y += 2) for (let i = 0; i < c.width; i += 2) {
      if (d[(y * c.width + i) * 4 + 3] > 12) { if (i < x0) x0 = i; if (i > x1) x1 = i; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
    if (x1 <= x0 || y1 <= y0) return null;
    const w = Math.min(c.width - x0, x1 - x0 + 2), h = Math.min(c.height - y0, y1 - y0 + 2);
    const make = mode => {
      const o = canvas(w, h), ox = o.getContext('2d');
      ox.drawImage(c, x0, y0, w, h, 0, 0, w, h);
      if (mode === 'colour') return o;
      const im = ox.getImageData(0, 0, w, h), p = im.data;
      for (let i = 0; i < p.length; i += 4) {
        if (mode === 'grey') { const l = 0.3 * p[i] + 0.59 * p[i + 1] + 0.11 * p[i + 2]; p[i] = p[i + 1] = p[i + 2] = l; }
        else { p[i] = p[i + 1] = p[i + 2] = 6; }
      }
      ox.putImageData(im, 0, 0);
      return o;
    };
    return { colour: make('colour'), grey: make('grey'), shade: make('shade'), w, h };
  }

  A.Art = {
    async load(base = 'assets/') {
      let names = [];
      try { names = await (await fetch(base + 'manifest.json')).json(); } catch { return; }
      await Promise.all(names.map(n => new Promise(res => {
        const img = new Image();
        let tries = 0;
        img.onload = () => { try { const a = prepare(img, n); if (a) store[n] = a; } catch {} res(); };
        img.onerror = () => (tries++ < 2 ? setTimeout(() => { img.src = base + n + '.png?r=' + tries; }, 400 * tries) : res());
        img.src = base + n + '.png';
      })));
      A.bus?.emit?.('artLoaded', Object.keys(store));
    },

    has: n => !!store[n],
    aspect: n => store[n].w / store[n].h,

    bake(key, src, w, h, paint) {
      const s = store[src];
      if (!s) return false;
      if (store[key]) return true;
      const out = { w, h };
      for (const m of MODES) {
        if (!s[m]) continue;
        const c = canvas(w, h), x = c.getContext('2d');
        paint(x, s[m], s.w, s.h);
        out[m] = c;
      }
      store[key] = out;
      return true;
    },
    drop(prefix) { for (const k of Object.keys(store)) if (k.startsWith(prefix)) delete store[k]; },
    feather,

    draw(ctx, n, x, y, w, h, sat = 1, light = 1, alpha = 1) {
      const a = store[n];
      if (!a) return false;
      const g = ctx.globalAlpha, add = ctx.globalCompositeOperation === 'lighter';
      const k = add ? alpha * light : alpha;
      if (sat < 0.99 && a.grey) { ctx.globalAlpha = g * k * (add ? 1 - sat : 1); ctx.drawImage(a.grey, x, y, w, h); }
      if (sat > 0.01 || !a.grey) { ctx.globalAlpha = g * k * (sat < 0.99 && a.grey ? sat : 1); ctx.drawImage(a.colour, x, y, w, h); }
      if (!add && light < 0.99 && a.shade) { ctx.globalAlpha = g * alpha * (1 - light); ctx.drawImage(a.shade, x, y, w, h); }
      ctx.globalAlpha = g;
      return true;
    },
  };
})();
