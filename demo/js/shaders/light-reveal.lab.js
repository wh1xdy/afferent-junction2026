(() => {
  const Lab = window.Lab;
  if (!Lab) return;
  const PLATES = {
    night: { src: 'assets/bg_start.png', lantern: [0.3956, 0.7072], hero: [0.269, 0.6576, 0.128, 0.097], ground: 0.725, horizon: 0.49, sun: [0.75, 0.5], sunR: 30, dark: 0.32, predawn: 0 },
    dawn: { src: 'assets/bg_end_dawn.png', lantern: [0.2967, 0.6872], hero: [0.2067, 0.64, 0.1066, 0.097], ground: 0.71, horizon: 0.545, sun: [0.7515, 0.5373], sunR: 32.5, dark: 0, predawn: 0.7 },
  };
  const img = src => new Promise(res => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });

  Lab.add('light-reveal', {
    title: 'Light and reveal: lantern, colour return, dawn rays',
    build(stage, W, H, dpr) {
      const mod = A.Shaders['light-reveal'].create();
      const cv = document.createElement('canvas');
      stage.appendChild(cv);
      const flat = document.createElement('canvas');
      flat.width = Math.round(W * dpr); flat.height = Math.round(H * dpr); flat.style.display = 'none';
      stage.appendChild(flat);
      const fx = flat.getContext('2d');
      const bar = document.createElement('div');
      bar.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;align-items:center';
      bar.innerHTML = `<select data-k="plate"><option value="auto">plate: auto</option><option value="night">plate: night</option><option value="dawn">plate: dawn</option><option value="live">live world</option></select>
        <button data-k="wave">Play colour return</button><button data-k="sunrise">Play dawn</button><label><input type="checkbox" data-k="bypass"> bypass</label>`;
      stage.parentNode.insertBefore(bar, stage);
      const q = new URLSearchParams(location.search);
      const opt = { plate: q.get('plate') || 'auto', bypass: q.get('bypass') === '1', lb: q.has('lb') ? +q.get('lb') : 1 };
      bar.querySelector('[data-k=plate]').value = opt.plate;
      bar.querySelector('[data-k=plate]').addEventListener('change', e => { opt.plate = e.target.value; });
      bar.querySelector('[data-k=bypass]').checked = opt.bypass;
      bar.querySelector('[data-k=bypass]').addEventListener('change', e => { opt.bypass = e.target.checked; });
      let anim = null;
      const play = k => { anim = { k, t0: null }; };
      bar.querySelector('[data-k=wave]').addEventListener('click', () => play('wave'));
      bar.querySelector('[data-k=sunrise]').addEventListener('click', () => play('dawn'));
      window.LR = { mod, opt, start: () => play(q.get('play') || 'wave') };

      const ok = mod.init(cv);
      mod.resize(W, H, dpr);
      const plates = {}, pc = {};
      for (const [k, p] of Object.entries(PLATES)) img(p.src).then(i => {
        if (!i) return;
        const c = document.createElement('canvas'); c.width = Math.round(W * dpr); c.height = Math.round(H * dpr);
        const x = c.getContext('2d'), s = Math.max(c.width / i.naturalWidth, c.height / i.naturalHeight), dw = i.naturalWidth * s, dh = i.naturalHeight * s;
        const ox = (c.width - dw) / 2, oy = (c.height - dh) / 2;
        x.drawImage(i, ox, oy, dw, dh);
        const map = ([u, v]) => [(u * dw + ox) / c.width, (v * dh + oy) / c.height];
        const [hx, hy] = map(p.hero);
        plates[k] = c;
        pc[k] = { ...p, lantern: map(p.lantern), sun: map(p.sun), ground: map([0, p.ground])[1], horizon: map([0, p.horizon])[1], hero: [hx, hy, p.hero[2] * dw / c.width, p.hero[3] * dh / c.height], sunR: p.sunR * dh / dpr / 844 };
      });

      let live = null;
      const liveWorld = async () => {
        if (live) return live;
        live = { pending: true };
        const keep = window.A, load = src => new Promise(r => { const s = document.createElement('script'); s.src = src; s.onload = r; s.onerror = r; document.body.appendChild(s); });
        await load('js/util.js');
        for (const k of Object.keys(keep)) if (!(k in window.A)) window.A[k] = keep[k];
        await load('js/art.js'); await load('js/world.js');
        window.A.Art?.load?.();
        const c = document.createElement('canvas'); c.width = Math.round(W * dpr); c.height = Math.round(H * dpr);
        const V = {
          t: 0, worldX: 0, walking: false, stride: 1, chunks: [{ type: 'harbour', x0: -700, x1: 420, seed: 1 }],
          sat: { yellow: 1, blue: 1, green: 1, dawn: 0 }, sweep: 0, aurora: 0.6, fog: 0.45, fogDrift: 1, stars: 120, warm: 0.04, sparkle: 0, daylight: 0,
          flame: 1, lanternRadius: 70, lanternBright: 1, lanternGain: 1, sparks: [], iceGlow: 0, stove: 0, beam: 0,
          orb: { b: 0, hold: 0, sync: 0, alpha: 0 }, tapHint: 0, flash: 0, exposure: 1, sunP: 0, border: 0, black: 0, profile: 'live',
        };
        live = { c, x: c.getContext('2d'), V };
        return live;
      };

      const ease = p => p < 0.5 ? 4 * p ** 3 : 1 - (-2 * p + 2) ** 3 / 2;
      const label = ok ? 'WebGL' + (mod.gl instanceof (window.WebGL2RenderingContext || Object) ? '2' : '1') : 'no WebGL, Canvas 2D fallback';

      return {
        mod,
        label: () => `${label}, passes ${mod.stats.passes || 0},`,
        frame(t, S, dt) {
          if (anim) {
            if (anim.t0 === null) anim.t0 = t;
            const a = t - anim.t0;
            if (anim.k === 'wave') {
              const g = Math.floor(a / 3.6), f = Math.min(1, (a - g * 3.6) / 2.4);
              S.ret = Math.min(1, (g + f) / 3); S.tod = 0; if (g >= 3) anim = null;
            } else { S.tod = Math.min(1, 0.5 + a / 16); S.ret = 1; if (a >= 8) anim = null; }
          }
          const key = opt.plate === 'auto' ? (S.tod >= 0.5 && !S.night ? 'dawn' : 'night') : opt.plate;
          let scene = plates[key], P = pc[key], sceneLive = false;
          const st = { tod: S.tod, ret: S.ret, mode: S.mode, night: S.night, rm: S.rm, core: S.core > 0.5 ? 1 : 0, dt: S.fixedDt };
          if (key === 'live') {
            if (!live) liveWorld();
            if (!live || live.pending || !window.A.World) return 0;
            const V = live.V; V.t = t; V.night = S.night; V.mode = S.mode;
            const dawnP = Math.max(0, Math.min(1, (S.tod - 0.5) / 0.5));
            V.sunP = S.night ? 0 : Math.max(0, Math.min(1, (dawnP * 8 - 2.5) / 3)); V.sat.dawn = S.night ? 0 : ease(Math.max(0, Math.min(1, (dawnP * 8 - 1) / 2.5)));
            V.flame = 1 - 0.65 * ease(Math.max(0, Math.min(1, (dawnP * 8 - 3) / 3)));
            live.x.setTransform(dpr, 0, 0, dpr, 0, 0);
            A.World.draw(live.x, W, H, V);
            const [lx, ly] = A.World.lanternPos();
            scene = live.c; sceneLive = true;
            P = { lantern: [lx / W, ly / H], ground: 0.82, horizon: 0.6, sun: [0.72, 0.6 - 0.1 * V.sunP], dark: 0, predawn: 0 };
            st.air = 0.55; st.auroraTint = 0;
          }
          if (!scene || !P) return 0;
          const dawnP = Math.max(0, Math.min(1, (S.tod - 0.5) / 0.5));
          const hand = 1 - 0.65 * ease(Math.max(0, Math.min(1, (dawnP * 8 - 3) / 3)));
          Object.assign(st, {
            scene, sceneKey: key, sceneLive, horizonY: P.horizon, groundY: P.ground, sun: { x: P.sun[0], y: P.sun[1], r: P.sunR },
            lantern: { x: P.lantern[0], y: P.lantern[1], r: 70, bright: (S.night ? hand * 0.9 : hand) * opt.lb },
            hero: P.hero && { x: P.hero[0], y: P.hero[1], rx: P.hero[2], ry: P.hero[3] },
            dark: P.dark * (1 - ease(dawnP)), predawn: P.predawn,
          });
          flat.style.display = opt.bypass || !mod.ok ? 'block' : 'none';
          if (opt.bypass || !mod.ok) { fx.drawImage(scene, 0, 0); return 0; }
          const t0 = performance.now();
          mod.render(t, st);
          return performance.now() - t0;
        },
      };
    },
  });
})();
