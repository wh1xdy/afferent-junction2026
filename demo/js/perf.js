(() => {
  const q = new URLSearchParams(location.search);
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch {} },
  };
  const forced = Number(q.get('scale'));
  const phone = !!window.matchMedia?.('(pointer: coarse)').matches;
  const P = A.Perf = { cap: forced >= 1 && forced <= 3 ? forced : 2, auto: !(forced >= 1) && phone, stepped: false };

  const WIN = 3000, BUDGET = 20, LOW = 1.5;
  const frames = [], draws = [];
  let lastStart = 0, nextCheck = 0, bad = 0, box = null, nextPaint = 0;
  let on = q.get('perf') === '1' || (q.get('perf') !== '0' && store.get('afferent.perf') === '1');

  const trim = (a, now) => { while (a.length && a[0][0] < now - WIN) a.shift(); };
  const pct = (a, p) => {
    if (!a.length) return null;
    const s = a.map(x => x[1]).sort((x, y) => x - y);
    return s[Math.min(s.length - 1, Math.floor(s.length * p))];
  };
  const f1 = v => (v == null ? '-' : v.toFixed(1));

  const paint = now => {
    if (!box) {
      box = document.createElement('div');
      box.setAttribute('aria-hidden', 'true');
      Object.assign(box.style, {
        position: 'fixed', bottom: 'calc(env(safe-area-inset-bottom, 0px) + 8px)', left: '8px', zIndex: 9999, pointerEvents: 'none',
        font: '10px/1.35 var(--af-font-mono, ui-monospace, Menlo, monospace)', color: '#CBD6E2', background: 'rgba(5,7,15,0.72)',
        padding: '6px 8px', borderRadius: '8px', whiteSpace: 'pre',
      });
      document.body.appendChild(box);
    }
    box.style.display = on ? 'block' : 'none';
    if (!on) return;
    const p50 = pct(frames, 0.5), ts = A.World.tintStats?.();
    box.textContent = [
      `fps ${p50 ? Math.round(1000 / p50) : '-'}  scale ${Math.min(devicePixelRatio || 1, P.cap).toFixed(1)}${P.stepped ? ' (auto)' : ''}`,
      `frame p50 ${f1(p50)}  p95 ${f1(pct(frames, 0.95))} ms`,
      `draw  p50 ${f1(pct(draws, 0.5))}  p95 ${f1(pct(draws, 0.95))} ms`,
      ts ? `tints ${ts.size} cached  ${ts.made} made` : '',
    ].join('\n');
  };

  const check = now => {
    const s = A.session;
    if (!P.auto || P.stepped || (devicePixelRatio || 1) <= LOW || !s || s.done || document.hidden) { bad = 0; return; }
    if (frames.length < 60) return;
    bad = pct(frames, 0.95) > BUDGET ? bad + 1 : 0;
    if (bad >= 2) {
      P.cap = LOW; P.stepped = true;
      dispatchEvent(new Event('resize'));
    }
  };

  const draw = A.World.draw;
  A.World.draw = function (...args) {
    const t = performance.now();
    draw.apply(this, args);
    const d = performance.now() - t;
    if (lastStart && t - lastStart < 250) frames.push([t, t - lastStart]);
    lastStart = t;
    draws.push([t, d]);
    trim(frames, t); trim(draws, t);
    if (t >= nextCheck) { nextCheck = t + WIN; check(t); }
    if ((on || box) && t >= nextPaint) { nextPaint = t + 500; paint(t); }
  };

  const toggle = () => { on = !on; store.set('afferent.perf', on ? '1' : '0'); paint(performance.now()); };
  document.addEventListener('touchstart', e => { if (e.touches.length === 3) toggle(); }, { passive: true });
  document.addEventListener('keydown', e => { if (e.key === 'F' && e.shiftKey && !e.metaKey && !e.ctrlKey) toggle(); });
  document.addEventListener('visibilitychange', () => { lastStart = 0; });
})();
