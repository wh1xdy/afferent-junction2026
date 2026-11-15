(() => {
  const q = new URLSearchParams(location.search);
  const forced = Number(q.get('scale'));
  const phone = !!window.matchMedia?.('(pointer: coarse)').matches;
  const P = A.Perf = { cap: forced >= 1 && forced <= 3 ? forced : 2, auto: !(forced >= 1) && phone, stepped: false };

  const WIN = 3000, BUDGET = 20, LOW = 1.5;
  const frames = [];
  let lastStart = 0, nextCheck = 0, bad = 0;

  const trim = (a, now) => { while (a.length && a[0][0] < now - WIN) a.shift(); };
  const pct = (a, p) => {
    if (!a.length) return null;
    const s = a.map(x => x[1]).sort((x, y) => x - y);
    return s[Math.min(s.length - 1, Math.floor(s.length * p))];
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
    if (lastStart && t - lastStart < 250) frames.push([t, t - lastStart]);
    lastStart = t;
    trim(frames, t);
    if (t >= nextCheck) { nextCheck = t + WIN; check(t); }
  };

  document.addEventListener('visibilitychange', () => { lastStart = 0; });
})();
