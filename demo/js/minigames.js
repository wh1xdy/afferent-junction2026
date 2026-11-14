(() => {
  const R = Math.random;
  const GAMES = A.MINIGAMES = {};
  const PRESENT = A.PRESENT = {};

  A.defineTask = (id, def) => { GAMES[id] = def; return def; };
  A.definePresenter = (id, p) => { PRESENT[id] = p; return p; };
  A.present = (id, g, ev, data, now) => PRESENT[id]?.on?.(g, ev, data ?? {}, now);

  A.LINES = {
    fork: 'Pick a path, then tap its lights',
    lanterns: 'Tap the bigger lantern',
    breath: 'Gentle breaths. Hold while the light grows',
    loyly: 'Drag slowly to pour on the stones',
    shutters: 'Swipe to open each shutter',
    fireflies: 'Sweep to gather the fireflies',
    beacon: 'Tap as each boat meets the beam',
    bells: 'Listen, then ring them in order',
    threads: 'Draw a thread between matching lights',
    stars: 'Join the stars, smallest to biggest',
  };

  const playLeft =() => A.session?.playLeft ? A.session.playLeft(A.now()) : Infinity;

  A.pickGame = (mode, last, played) => {
    const left = playLeft() + 3;
    const all = Object.keys(GAMES).filter(id => GAMES[id].modes.includes(mode));
    const fits = all.filter(id => (GAMES[id].minS ?? 0) <= left);
    const base = fits.length ? fits : all;
    let pool = base.filter(id => id !== last && !played?.has(id));
    if (!pool.length) pool = base.filter(id => id !== last);
    if (!pool.length) pool = base;
    if (!pool.length) return { id: 'breath', p: 1 };
    return { id: pool[Math.floor(R() * pool.length)], p: 1 / pool.length };
  };
})();
