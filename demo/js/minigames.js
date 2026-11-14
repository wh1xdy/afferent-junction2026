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
    windows: 'Tap the warm windows, never the frosted',
    vihta: 'Tap the whisk as fast as you can',
    birds: 'Tap when a bird matches the one before',
    swans: 'Swipe the way the middle swan swims',
    faces: 'Tap the light as soon as it shows',
    owls: 'Find the owl with open eyes',
    seals: 'Tap the seal before it dives',
    reindeer: 'Watch the bell reindeer, then tap them',
    ferry: 'Tap when the ferry reaches the pier',
    drips: 'Tap with the drips, then keep the beat',
    buoys: 'Join the buoys in number order',
    steps: 'Watch the steps, then tap them in order',
    glance: 'Tap the boat whose sail changed',
    signpost: 'Swipe the way the arrow points',
    runes: 'Same rune, or a mirror?',
    fog: 'Swipe up if happy, down if sad',
  };

  const playLeft =() => A.session?.playLeft ? A.session.playLeft(A.now()) : Infinity;

  // Games picked in recent sessions, newest last. Kept on this device only, so tomorrow's
  // draw leans toward games not seen lately instead of repeating yesterday's set.
  const RECENT_KEY = 'afferent.recentGames.v1', RECENT_N = 6;
  const recent = {
    read() { try { const v = JSON.parse(localStorage.getItem(RECENT_KEY)); return Array.isArray(v) ? v : []; } catch { return []; } },
    add(id) { try { localStorage.setItem(RECENT_KEY, JSON.stringify([...this.read().filter(x => x !== id), id].slice(-RECENT_N))); } catch {} },
  };
  A.recentGames = recent;

  // Uniform random draw among the games that suit the mode and fit the time left,
  // skipping this session's games and, while enough remain, the ones seen recently.
  A.pickGame = (mode, last, played) => {
    const left = playLeft() + 3;
    const all = Object.keys(GAMES).filter(id => GAMES[id].modes.includes(mode));
    const fits = all.filter(id => (GAMES[id].minS ?? 0) <= left);
    const base = fits.length ? fits : all;
    let pool = base.filter(id => id !== last && !played?.has(id));
    if (!pool.length) pool = base.filter(id => id !== last);
    if (!pool.length) pool = base;
    if (!pool.length) return { id: 'breath', p: 1 };
    const seen = new Set(recent.read()), fresh = pool.filter(id => !seen.has(id));
    if (fresh.length >= 2) pool = fresh;
    const id = pool[Math.floor(R() * pool.length)];
    recent.add(id);
    return { id, p: 1 / pool.length };
  };
})();
