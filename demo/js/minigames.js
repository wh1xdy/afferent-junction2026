(() => {
  const R = Math.random;
  const GAMES = A.MINIGAMES = {};
  const PRESENT = A.PRESENT = {};

  A.defineTask = (id, def) => { GAMES[id] = def; return def; };
  A.definePresenter = (id, p) => { PRESENT[id] = p; return p; };
  A.present = (id, g, ev, data, now) => PRESENT[id]?.on?.(g, ev, data ?? {}, now);

  const playLeft = () => A.session?.playLeft ? A.session.playLeft(A.now()) : Infinity;

  A.pickGame = (mode, last, weights) => {
    const left = playLeft() + 3;
    const all = Object.keys(GAMES).filter(id => GAMES[id].modes.includes(mode));
    const fits = all.filter(id => (GAMES[id].minS ?? 0) <= left);
    const w = id => weights ? Math.max(0, weights[id] ?? 0) : 1;
    let pool = fits.filter(id => id !== last && w(id) > 0);
    if (!pool.length) pool = fits.filter(id => w(id) > 0);
    if (!pool.length) pool = fits.length ? fits : all;
    const total = pool.reduce((a, id) => a + (w(id) || 1), 0);
    let x = R() * total;
    for (const id of pool) { x -= w(id) || 1; if (x <= 0) return { id, weight: weights ? weights[id] ?? null : null }; }
    const id = pool[pool.length - 1] || 'breath';
    return { id, weight: weights ? weights[id] ?? null : null };
  };
})();
