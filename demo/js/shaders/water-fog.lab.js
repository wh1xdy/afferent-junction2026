(() => {
  const hex = h => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const mix = (a, b, t) => a.map((x, i) => x + (b[i] - x) * t);
  const rgb = (c, a = 1) => `rgba(${c.map(Math.round).join(',')},${a})`;
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const ss = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const SKY = {
    kaamos: ['#122858', '#27498A', '#4F74B8', '#86A4DA'], yellow: ['#1B3260', '#2C4680', '#4E62A0', '#8A88B0'],
    blue: ['#1F3A6E', '#33558F', '#7A86C0', '#B4A6CE'], green: ['#1A3262', '#2A4C86', '#5A7AB8', '#8EA4D2'],
    dawn: ['#6F86D6', '#B0A6E6', '#F3A57A', '#FFD58A'], nightEnd: ['#121A33', '#28294E', '#4A4470', '#6E6590'],
  };
  for (const k in SKY) SKY[k] = SKY[k].map(hex);
  const AT = [0, 0.5, 0.84, 1], BANDS = [0, 0.16, 0.32, 0.48, 0.62, 0.76, 0.88, 1];
  const at = (pal, p) => { let i = 1; while (i < 3 && p > AT[i]) i++; return mix(pal[i - 1], pal[i], clamp((p - AT[i - 1]) / (AT[i] - AT[i - 1]), 0, 1)); };
  const stage = s => {
    const y = clamp(s.ret * 3, 0, 1), b = clamp(s.ret * 3 - 1, 0, 1), g = clamp(s.ret * 3 - 2, 0, 1), dawn = ss(0.5, 0.85, s.tod);
    return { y, b, g, dawn, md: s.night ? 0 : dawn, nd: s.night ? dawn : 0, sunP: s.night ? 0 : clamp((s.tod - 0.62) / 0.3, 0, 1) };
  };
  const skyCol = (p, k) => {
    let c = at(SKY.kaamos, p);
    c = mix(c, at(SKY.yellow, p), k.y); c = mix(c, at(SKY.blue, p), k.b); c = mix(c, at(SKY.green, p), k.g);
    c = mix(c, at(SKY.dawn, p), ss(0, 1, clamp(k.md * 1.4 - (1 - p) * 0.4, 0, 1)));
    return mix(c, at(SKY.nightEnd, p), 0.6 * k.nd);
  };
  let rs = 5;
  const rnd = () => ((rs = (rs * 16807) % 2147483647) / 2147483647);
  const STARS = Array.from({ length: 140 }, () => [rnd(), Math.pow(rnd(), 1.3) * 0.92, 0.5 + rnd() * 1.1, rnd() * 6.28]);
  const SHORE = [0.08, 0.17, 0.26, 0.47, 0.55, 0.63, 0.78, 0.9].map((x, i) => [x, 4 + (i % 3) * 2]);

  let moonC = null;
  const MOON = () => {
    if (moonC) return moonC;
    moonC = document.createElement('canvas'); moonC.width = moonC.height = 96;
    const m = moonC.getContext('2d');
    m.fillStyle = '#F2EEE6'; m.beginPath(); m.arc(48, 48, 46, 0, 6.283); m.fill();
    m.globalCompositeOperation = 'destination-out'; m.beginPath(); m.arc(68, 36, 42, 0, 6.283); m.fill();
    return moonC;
  };

  function hills(x, W, H, hy, base, amp, f, ph) {
    const s = x / W;
    return hy - H * base - H * amp * (0.55 * Math.sin(s * 6.28 * f + ph) + 0.3 * Math.sin(s * 6.28 * f * 2.3 + ph * 1.7) + 0.15 * Math.sin(s * 6.28 * f * 5.1 + ph * 0.3));
  }

  function drawSky(x, W, H, hy, s, k, t) {
    const g = x.createLinearGradient(0, 0, 0, hy);
    for (const p of BANDS) g.addColorStop(p, rgb(skyCol(p, k)));
    x.fillStyle = g; x.fillRect(0, 0, W, hy + 2);
    const night = (1 - k.dawn) * (s.mode === 'fatigue' ? 0.3 : 1);
    if (night > 0.02) {
      for (const [sx, sy, r, ph] of STARS) {
        const a = night * (0.45 + 0.35 * Math.sin(t * (s.rm ? 0 : 0.9) + ph)) * (1 - ss(0.8, 1, sy));
        x.fillStyle = `rgba(235,240,255,${a.toFixed(3)})`; x.fillRect(sx * W, sy * hy, r, r);
      }
      const mx = W * 0.34, my = H * 0.09, mr = H * 0.022;
      const mg = x.createRadialGradient(mx, my, 0, mx, my, mr * 9);
      mg.addColorStop(0, `rgba(196,211,223,${0.22 * night})`); mg.addColorStop(1, 'rgba(196,211,223,0)');
      x.fillStyle = mg; x.fillRect(mx - mr * 9, my - mr * 9, mr * 18, mr * 18);
      x.globalAlpha = night;
      x.drawImage(MOON(), mx - mr, my - mr, 2 * mr, 2 * mr);
      x.globalAlpha = 1;
      const ag = k.g * (1 - k.dawn);
      if (ag > 0.02) {
        x.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 26; i++) {
          const px = (i + 0.5) / 26 * W, y0 = H * (0.2 + 0.03 * Math.sin(px * 0.012 + t * 0.15)), hh = H * (0.08 + 0.04 * Math.sin(i * 1.7 + t * 0.2));
          const lg = x.createLinearGradient(0, y0, 0, y0 - hh);
          lg.addColorStop(0, 'rgba(95,227,161,0)'); lg.addColorStop(0.08, `rgba(95,227,161,${0.5 * ag})`); lg.addColorStop(1, 'rgba(143,198,224,0)');
          x.fillStyle = lg; x.fillRect(px - 1.2, y0 - hh, 2.4, hh);
        }
        x.globalCompositeOperation = 'source-over';
      }
    }
    if (k.sunP > 0.003) {
      const sx = W * 0.72, sy = hy + H * 0.03 - H * 0.13 * ss(0, 1, k.sunP), r = H * 0.03;
      const sg = x.createRadialGradient(sx, sy, 0, sx, sy, H * 0.3);
      sg.addColorStop(0, `rgba(255,213,138,${0.55 * k.sunP})`); sg.addColorStop(0.25, `rgba(255,213,138,${0.18 * k.sunP})`); sg.addColorStop(1, 'rgba(243,165,122,0)');
      x.fillStyle = sg; x.fillRect(0, 0, W, hy);
      x.fillStyle = `rgba(255,227,166,${Math.min(0.95, k.sunP * 1.6)})`; x.beginPath(); x.arc(sx, sy, r, 0, 6.283); x.fill();
    }
    const hz = skyCol(1, k), lay = [
      [0.055, 0.03, 1.1, 0.4, mix(hz, [62, 84, 120], 0.35)],
      [0.032, 0.025, 1.7, 2.1, mix(hz, [46, 66, 104], 0.55)],
      [0.012, 0.016, 2.6, 4.2, mix(hz, [30, 48, 84], 0.7)],
    ];
    lay.forEach(([b, a, f, ph, c], li) => {
      const col = mix(c, mix([150, 140, 200], [255, 213, 160], 0.5), 0.35 * k.md);
      x.beginPath(); x.moveTo(0, hy + 1);
      const pts = [];
      for (let px = 0; px < W + 4; px += 4) { const py = hills(px, W, H, hy, b, a, f, ph); pts.push([px, py]); x.lineTo(px, py); }
      x.lineTo(W, hy + 1); x.closePath(); x.fillStyle = rgb(col); x.fill();
      if (false) {
        x.save(); x.clip();
        [[2, [242, 238, 230], 0.35], [4, [226, 199, 156], 0.28], [6, [180, 142, 92], 0.22]].forEach(([o, lc, la]) => {
          x.beginPath(); pts.forEach(([px, py], i) => (i ? x.lineTo(px, py + o) : x.moveTo(px, py + o)));
          x.strokeStyle = rgb(mix(mix(lc, [90, 110, 150], 0.6 * (1 - k.y)), lc, k.md), la); x.lineWidth = 1; x.stroke();
        });
        x.restore();
      }
    });
    const ln = (1 - 0.7 * k.sunP);
    for (const [sxp, o] of SHORE) {
      const lx = sxp * W, ly = hy - o;
      const lg = x.createRadialGradient(lx, ly, 0, lx, ly, 7);
      lg.addColorStop(0, `rgba(255,213,138,${0.9 * ln})`); lg.addColorStop(0.3, `rgba(255,181,74,${0.35 * ln})`); lg.addColorStop(1, 'rgba(255,181,74,0)');
      x.fillStyle = lg; x.fillRect(lx - 7, ly - 7, 14, 14);
    }
  }

  function drawLand(x, W, H, s, k, t) {
    x.clearRect(0, 0, W, H);
    const top = px => H * 0.745 + H * 0.05 * Math.pow(px / (W * 0.82), 2.2) - H * 0.012 * Math.sin(px / W * 3.1);
    const night = mix([90, 110, 147], [150, 170, 210], 0.4 * k.b), snow = mix(night, [242, 238, 230], Math.max(k.md, 0.35 * k.y));
    const shade = mix([40, 58, 96], [176, 160, 206], k.md);
    const pts = [];
    x.beginPath(); x.moveTo(0, H);
    for (let px = 0; px <= W * 0.86; px += 3) { const py = top(px); pts.push([px, py]); x.lineTo(px, py); }
    x.bezierCurveTo(W * 0.92, H * 0.83, W * 0.95, H * 0.86, W, H * 0.9); x.lineTo(W, H); x.closePath();
    const g = x.createLinearGradient(0, H * 0.74, 0, H);
    g.addColorStop(0, rgb(snow)); g.addColorStop(1, rgb(mix(snow, shade, 0.55)));
    x.fillStyle = g; x.fill();
    x.save(); x.clip();
    [[3, [242, 238, 230], 0.5], [6, [226, 199, 156], 0.42], [9, [180, 142, 92], 0.34]].forEach(([o, lc, la]) => {
      x.beginPath(); pts.forEach(([px, py], i) => (i ? x.lineTo(px, py + o) : x.moveTo(px, py + o)));
      x.strokeStyle = rgb(mix(mix(lc, [70, 92, 140], 0.65 * (1 - Math.max(k.y, k.md))), lc, 0), la); x.lineWidth = 1.5; x.stroke();
    });
    x.restore();
    const lx = s.lx * W, ly = s.ly * H;
    const kx = W * 0.19, ky = top(kx) + 3, warm = Math.max(0.55, k.y, k.md);
    const cloak = mix([120, 128, 160], [226, 199, 156], warm), cs = mix(cloak, [30, 49, 80], 0.42), hem = mix(cs, [180, 142, 92], warm);
    x.beginPath(); x.moveTo(kx - 38, ky); x.bezierCurveTo(kx - 34, ky - 40, kx - 22, ky - 62, kx - 4, ky - 70); x.lineTo(kx + 14, ky - 66);
    x.bezierCurveTo(kx + 28, ky - 46, kx + 36, ky - 20, kx + 40, ky); x.closePath();
    const cg = x.createLinearGradient(kx - 38, 0, kx + 40, 0); cg.addColorStop(0, rgb(cs)); cg.addColorStop(0.75, rgb(cloak)); cg.addColorStop(1, rgb(mix(cloak, [255, 227, 166], 0.25)));
    x.fillStyle = cg; x.fill();
    x.beginPath(); x.ellipse(kx, ky - 82, 27, 25, -0.2, 0, 6.283);
    const hg = x.createLinearGradient(kx - 27, 0, kx + 27, 0); hg.addColorStop(0, rgb(cs)); hg.addColorStop(0.7, rgb(cloak)); hg.addColorStop(1, rgb(mix(cloak, [255, 227, 166], 0.2)));
    x.fillStyle = hg; x.fill();
    x.beginPath(); x.ellipse(kx + 21, ky - 80, 7, 17, -0.15, 0, 6.283); x.fillStyle = rgb(mix(cs, [14, 26, 46], 0.6)); x.fill();
    for (const [o, w] of [[12, 2.5], [18, 1.5]]) { x.beginPath(); x.moveTo(kx - 37, ky - o); x.quadraticCurveTo(kx, ky - o + 5, kx + 39, ky - o - 1); x.lineWidth = w; x.strokeStyle = rgb(hem); x.stroke(); }
    const gl = x.createRadialGradient(lx, ly, 0, lx, ly, 90);
    gl.addColorStop(0, 'rgba(255,227,166,0.55)'); gl.addColorStop(0.15, 'rgba(255,213,138,0.22)'); gl.addColorStop(1, 'rgba(255,213,138,0)');
    x.globalCompositeOperation = 'lighter'; x.fillStyle = gl; x.fillRect(lx - 90, ly - 90, 180, 180); x.globalCompositeOperation = 'source-over';
    x.fillStyle = '#1E3150'; x.fillRect(lx - 8, ly - 12, 16, 22);
    x.fillStyle = '#FFE3A6'; x.fillRect(lx - 5, ly - 8, 10, 14);
  }

  Lab.add('water-fog', {
    title: 'water-fog: mirror bay and laminated fog',
    build(el, W, H, dpr) {
      const mk = () => { const c = document.createElement('canvas'); c.width = W * dpr; c.height = H * dpr; el.appendChild(c); return c; };
      const skyC = mk(), sx = skyC.getContext('2d');
      const waterC = mk(), landC = mk(), lx2 = landC.getContext('2d'), fogC = mk();
      const reflC = document.createElement('canvas'), rx = reflC.getContext('2d');
      const SH = A.Shaders['water-fog'], water = SH.create(), fog = SH.create();
      const ok = water.init(waterC) && fog.init(fogC);
      if (ok) { water.resize(W, H, dpr); fog.resize(W, H, dpr); }
      sx.scale(dpr, dpr); lx2.scale(dpr, dpr);
      const hy = 0.6 * H;
      reflC.width = Math.round(W / 2); reflC.height = Math.round(hy / 2);
      return {
        label: () => (ok ? (water.webgl2 ? 'WebGL2' : 'WebGL1') : 'GL failed, Canvas 2D fallback'),
        frame(t, s) {
          const k = stage(s);
          drawSky(sx, W, H, hy, s, k, t);
          drawLand(lx2, W, H, s, k, t);
          if (!ok) return 0;
          rx.drawImage(skyC, 0, 0, W * dpr, hy * dpr, 0, 0, reflC.width, reflC.height);
          const lights = SHORE.map(([x, o]) => ({ x: x * W, y: hy - o, s: 2.4, a: 0.75 * (1 - 0.7 * k.sunP), c: '#FFD58A' }));
          const st = { tod: s.tod, ret: s.ret, night: s.night, mode: s.mode, rm: s.rm, core: s.core, fog: s.fog, lx: s.lx * W, ly: s.ly * H, hy: 0.6, gy: 0.82, lights, reflect: reflC, reflectH: 0.6, hole: { x: W * 0.19, y: H * 0.7, rx: 46, ry: 70 } };
          if (new URLSearchParams(location.search).get('full') === '1') st.full = true;
          const wq = new URLSearchParams(location.search).get('wave');
          if (wq !== null) st.wave = { x: s.lx * W, y: s.ly * H, r: +wq * H, a: 1 };
          const t0 = performance.now();
          water.render(t, { ...st, pass: 'water' });
          fog.render(t, { ...st, pass: 'fog' });
          if (new URLSearchParams(location.search).get('sync') === '1') { water.finish?.(); fog.finish?.(); }
          return performance.now() - t0;
        },
      };
    },
  });
})();
