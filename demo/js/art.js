(() => {
  const store = {};

  const feather = (x, w, h) => {
    x.globalCompositeOperation = 'destination-in';
    const g = x.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.18, 'rgba(0,0,0,1)'); g.addColorStop(0.82, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    x.globalCompositeOperation = 'source-over';
  };

  function prepare(img, name) {
    const c = document.createElement('canvas');
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    const x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(img, 0, 0);
    if (name.startsWith('fog')) feather(x, c.width, c.height);
    const d = x.getImageData(0, 0, c.width, c.height).data;
    let x0 = c.width, y0 = c.height, x1 = 0, y1 = 0;
    for (let y = 0; y < c.height; y += 2) for (let i = 0; i < c.width; i += 2) {
      if (d[(y * c.width + i) * 4 + 3] > 12) { if (i < x0) x0 = i; if (i > x1) x1 = i; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
    if (x1 <= x0 || y1 <= y0) return null;
    const w = x1 - x0 + 2, h = y1 - y0 + 2;
    const make = mode => {
      const o = document.createElement('canvas'); o.width = w; o.height = h;
      const ox = o.getContext('2d');
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
        img.onload = () => { try { const a = prepare(img, n); if (a) store[n] = a; } catch {} res(); };
        img.onerror = res;
        img.src = base + n + '.png';
      })));
      A.bus.emit('artLoaded', Object.keys(store));
    },

    has: n => !!store[n],
    aspect: n => store[n].w / store[n].h,

    draw(ctx, n, x, y, w, h, sat = 1, light = 1, alpha = 1) {
      const a = store[n];
      if (!a) return false;
      const g = ctx.globalAlpha;
      ctx.globalAlpha = g * alpha;
      if (sat < 0.99) ctx.drawImage(a.grey, x, y, w, h);
      if (sat > 0.01) { ctx.globalAlpha = g * alpha * (sat < 0.99 ? sat : 1); ctx.drawImage(a.colour, x, y, w, h); }
      if (light < 0.99) { ctx.globalAlpha = g * alpha * (1 - light); ctx.drawImage(a.shade, x, y, w, h); }
      ctx.globalAlpha = g;
      return true;
    },
  };
})();
