(() => {
  const q = new URLSearchParams(location.search);
  const FRAMES = 'assets/lab/concept_';
  const WORLD = {
    night: { src: FRAMES + '01_start.jpg', lx: 137, ly: 592 },
    mid: { src: FRAMES + '02_ride.jpg', lx: 187, ly: 630 },
    dawn: { src: FRAMES + '06_dawn.jpg', lx: 123, ly: 565 },
  };
  const img = src => { const i = new Image(); i.src = src; return i; };
  for (const k in WORLD) WORLD[k].img = img(WORLD[k].src);
  const pick = s => (s.tod > 0.6 ? 'dawn' : s.ret > 0.25 ? 'mid' : 'night');

  const controls = (el, defs, P) => {
    const box = document.createElement('div');
    box.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px 14px;max-width:390px';
    for (const [k, label, min, max, step] of defs) {
      const l = document.createElement('label');
      l.innerHTML = `${label} <input type="range" min="${min}" max="${max}" step="${step}" value="${P[k]}"><output>${P[k]}</output>`;
      l.querySelector('input').addEventListener('input', e => { P[k] = +e.target.value; l.querySelector('output').value = P[k]; });
      box.appendChild(l);
    }
    el.parentNode.appendChild(box);
  };
  const num = (k, d) => (q.has(k) ? +q.get(k) : d);

  const sauna = (W, H, dpr) => {
    const c = document.createElement('canvas'); c.width = W * dpr; c.height = H * dpr;
    const x = c.getContext('2d'); x.scale(dpr, dpr);
    let g = x.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#16285A'); g.addColorStop(0.55, '#2A4C86'); g.addColorStop(0.62, '#3E5E96'); g.addColorStop(1, '#1B3160');
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    const ax = 25, aw = 340, top = 145, bot = 770, r = aw / 2;
    const arch = () => { x.beginPath(); x.moveTo(ax, bot); x.lineTo(ax, top + r); x.arc(ax + r, top + r, r, Math.PI, 0); x.lineTo(ax + aw, bot); x.closePath(); };
    arch(); x.fillStyle = '#B48E5C'; x.fill();
    x.save(); x.translate(W / 2, (top + bot) / 2); x.scale(0.985, 0.99); x.translate(-W / 2, -(top + bot) / 2); arch(); x.restore();
    x.save(); x.beginPath(); x.moveTo(ax + 5, bot); x.lineTo(ax + 5, top + r); x.arc(ax + r, top + r, r - 5, Math.PI, 0); x.lineTo(ax + aw - 5, bot); x.closePath(); x.clip();
    g = x.createLinearGradient(0, top, 0, bot);
    g.addColorStop(0, '#F0E2C4'); g.addColorStop(0.6, '#EAD5AE'); g.addColorStop(1, '#E2C79C');
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    let s = 7; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 90; i++) { const px = ax + rnd() * aw; x.fillStyle = `rgba(180,142,92,${0.04 + 0.05 * rnd()})`; x.fillRect(px, top, 0.6 + rnd(), bot - top); }
    x.beginPath(); x.arc(ax + 72, top + 115, 46, 0, 6.283); x.fillStyle = '#B48E5C'; x.fill();
    x.beginPath(); x.arc(ax + 74, top + 116, 42, 0, 6.283); x.fillStyle = '#26467E'; x.fill();
    x.fillStyle = '#F2EEE6'; x.fillRect(ax + 82, top + 100, 1.6, 1.6);
    const by = 640;
    x.fillStyle = '#E2C79C'; x.beginPath(); x.moveTo(ax, by); x.quadraticCurveTo(W / 2, by - 16, ax + aw, by); x.lineTo(ax + aw, by + 22); x.quadraticCurveTo(W / 2, by + 6, ax, by + 22); x.closePath(); x.fill();
    ['#F2EEE6', '#B48E5C', '#9C7448'].forEach((col, i) => { x.strokeStyle = col; x.lineWidth = 1.5; x.beginPath(); x.moveTo(ax, by + 6 + i * 5); x.quadraticCurveTo(W / 2, by - 10 + i * 5, ax + aw, by + 6 + i * 5); x.stroke(); });
    const sx = 165, sw = 150, st = 600;
    g = x.createLinearGradient(sx - sw / 2, 0, sx + sw / 2, 0);
    g.addColorStop(0, '#2A2A2E'); g.addColorStop(0.5, '#3A3A3F'); g.addColorStop(1, '#232327');
    x.fillStyle = g; x.fillRect(sx - sw / 2, st, sw, bot - st);
    x.beginPath(); x.ellipse(sx, st, sw / 2, 16, 0, 0, 6.283); x.fillStyle = '#1C1C20'; x.fill();
    const ember = x.createRadialGradient(sx, 720, 0, sx, 720, 50);
    ember.addColorStop(0, 'rgba(255,181,74,0.55)'); ember.addColorStop(1, 'rgba(255,181,74,0)');
    x.fillStyle = '#141418'; x.fillRect(sx - 28, 700, 56, 34); x.fillStyle = ember; x.fillRect(sx - 28, 700, 56, 34);
    for (let i = 0; i < 13; i++) {
      const a = i / 13 * 6.283, rr = i < 6 ? 0.45 : 0.85, ex = sx + Math.cos(a * 1.7) * sw * 0.36 * rr, ey = st - 6 + Math.sin(a) * 9 * rr - (i < 6 ? 6 : 0);
      x.beginPath(); x.ellipse(ex, ey, 17, 11, 0, 0, 6.283); x.fillStyle = '#3B3C42'; x.fill();
      x.beginPath(); x.ellipse(ex - 3, ey - 4, 9, 4, 0, 0, 6.283); x.fillStyle = 'rgba(138,143,156,0.35)'; x.fill();
    }
    x.restore();
    return c;
  };

  Lab.add('particles-steam', {
    title: 'particles-steam: snow layers, lantern-lit flakes, mote and firefly trails',
    build(el, W, H, dpr) {
      const cv = document.createElement('canvas'); el.appendChild(cv);
      const M = A.Shaders['particles-steam'].create(), ok = M.init(cv);
      if (ok) M.resize(W, H, dpr);
      const P = { snow: num('ps_snow', 1), mote: num('ps_mote', 1), ff: num('ps_ff', 0) };
      controls(el, [['snow', 'snow', 0, 1, 0.01], ['mote', 'mote flight', 0, 1, 1], ['ff', 'fireflies', 0, 24, 1]], P);
      const touches = [];
      let clock = 0;
      cv.addEventListener('pointerdown', e => { const r = cv.getBoundingClientRect(); touches.push({ x: e.clientX - r.left, y: e.clientY - r.top, t: clock }); if (touches.length > 4) touches.shift(); });
      return {
        label: () => (ok ? 'WebGL ok, tap for a gust' : 'GL failed, Canvas 2D fallback'),
        frame(t, s) {
          if (!ok) return 0;
          clock = t;
          const B = WORLD[pick(s)];
          if (!B.img.complete) return 0;
          const st = { tod: s.tod, ret: s.ret, mode: s.mode, rm: s.rm, core: s.core, lx: B.lx, ly: B.ly, snow: P.snow, touches, backdrop: B.img };
          if (P.ff > 0) st.fireflies = { n: P.ff, rect: [W * 0.08, H * 0.28, W * 0.84, H * 0.3], amt: 1 };
          if (P.mote > 0) {
            const k = (t % 3.4) / 1.15;
            if (k < 1) {
              const e = k * k * (3 - 2 * k), p0 = [W * 0.55, H * 0.3], p1 = [B.lx, B.ly - 8], cp = [(p0[0] + p1[0]) / 2 + W * 0.28, Math.min(p0[1], p1[1]) - H * 0.1];
              const bz = i => (1 - e) * (1 - e) * p0[i] + 2 * (1 - e) * e * cp[i] + e * e * p1[i];
              st.motes = [{ id: 'home', x: bz(0), y: bz(1), r: 4.2 }];
            }
          }
          const t0 = performance.now();
          M.render(t, st);
          return performance.now() - t0;
        },
      };
    },
  });

  Lab.add('particles-steam-loyly', {
    title: 'particles-steam: löyly strands, billows, warm fog, heat haze',
    build(el, W, H, dpr) {
      const cv = document.createElement('canvas'); el.appendChild(cv);
      const M = A.Shaders['particles-steam'].create(), ok = M.init(cv);
      if (ok) M.resize(W, H, dpr);
      const bd = sauna(W, H, dpr);
      const P = { steam: num('ps_steam', 1), fog: num('ps_fog', 0.4), haze: num('ps_haze', 1), strands: num('ps_strands', 7), lift: 0, every: num('ps_pour', 4) };
      controls(el, [['steam', 'steam', 0, 1, 0.01], ['fog', 'warm fog', 0, 1, 0.01], ['lift', 'fog lift', 0, 1, 0.01], ['haze', 'heat haze', 0, 1, 0.01], ['strands', 'strands', 6, 8, 1], ['every', 'pour every s (0 off)', 0, 8, 0.5]], P);
      let pour = null, clock = 0;
      cv.addEventListener('pointerdown', () => { pour = clock; });
      return {
        label: () => (ok ? 'WebGL ok, tap to pour' : 'GL failed, Canvas 2D fallback'),
        frame(t, s) {
          if (!ok) return 0;
          clock = t;
          if (P.every > 0) { const k = Math.floor(t / P.every) * P.every; if (pour === null || k > pour) pour = k; }
          const st = {
            tod: s.tod, ret: 1, mode: 'calm', rm: s.rm, core: s.core, snow: 0, backdrop: bd, backdropVersion: 1,
            steam: [{ x: 172, y: 594, rect: [40, 160, 300, 440], amt: P.steam, lean: 0.62, strands: P.strands, pour, seed: 1.7, fog: P.fog, lift: P.lift, haze: P.haze, hy: 596, hw: 150, hh: 150 }],
          };
          const t0 = performance.now();
          M.render(t, st);
          return performance.now() - t0;
        },
      };
    },
  });

  Lab.add('particles-steam-ref', {
    title: 'reference: concept frame 05 (löyly)',
    build(el) {
      const i = img(FRAMES + '05_task_loyly.jpg');
      i.style.cssText = 'position:absolute;inset:0;width:100%;height:100%';
      el.appendChild(i);
      return { label: () => 'concept 05 (assets/lab/concept_05_task_loyly.jpg)', frame: () => 0 };
    },
  });
})();
