// The soft loading screen (#loader in index.html). It is there only while the app is still loading: the art, the fonts,
// and the first painted frame of the world. main.js hands it what it waits for (A.Loader.when) and tells it each time a
// world frame has been drawn (A.Loader.frame); once everything has arrived it crossfades into the world on the next
// smooth frame. There is no minimum time on screen: ready in 100 ms means gone after 100 ms.
// Smooth: WebKit dates a transition from the start of the frame in which it begins, and the next frame reaches the
// screen only 50-60 ms later (measured on the iOS simulator), so the first 70-80 ms of the fade are never seen; after
// a heavy frame (the first one drawn with the art can be, the art is baked into its layers then) it was up to 200 ms,
// and the crossfade looked like a cut. So the fade starts at the end of the first frame whose drawing took less than
// SMOOTH_MS, at most WAIT_MS after the first frame drawn with everything in (while a heavy frame is drawn the world
// cannot move anyway), and its curve is the breath easing, which changes almost nothing in its first 80 ms.
// Whatever happens to the loading, it leaves after CAP_MS, so it never holds the app. ?loader=<seconds> changes that
// limit and ?loader=0 starts without it (for measuring and development).
(() => {
  const el = document.getElementById('loader');
  const FADE_MS = 520, CAP_MS = 8000, SMOOTH_MS = 50, WAIT_MS = 500;
  const param = Number(new URLSearchParams(location.search).get('loader') ?? NaN);
  const cap = Number.isFinite(param) && param >= 0 ? param * 1000 : CAP_MS;
  const now = () => performance.now();
  const mark = n => { try { performance.mark(n); } catch {} };

  let pending = 0, asked = false, state = el ? 'loading' : 'gone', readyAt = null;

  const gone = () => {
    if (state === 'gone') return;
    state = 'gone';
    el?.remove();
    mark('af-loader-gone');
  };
  const out = why => {
    if (state !== 'loading') return;
    state = 'leaving';
    L.why = why;
    mark('af-loader-out');
    el.classList.add('out');
    el.addEventListener('transitionend', e => { if (e.target === el) gone(); });
    setTimeout(gone, FADE_MS + 200);
  };

  const L = A.Loader = {
    why: null,
    get state() { return state; },
    get ready() { return asked && pending === 0; },
    // Waits for these promises (settled either way: art that fails to load leaves the procedural world).
    when(...ps) {
      asked = true;
      for (const p of ps) {
        if (!p || typeof p.then !== 'function') continue;
        pending++;
        Promise.resolve(p).then(done, done);
      }
    },
    // A frame of the world has just been drawn (main.js loop, after the WebGL pass); start is when its drawing began.
    frame(start) {
      if (state !== 'loading' || !L.ready) return;
      const t = now(), smooth = !(start <= t) || t - start < SMOOTH_MS;
      readyAt ??= t;
      if (smooth || t - readyAt >= WAIT_MS) out('ready');
    },
    out,
  };
  function done() { pending--; }

  if (!el) return;
  // Reduced motion: the app's own setting wins over the system's (the rule of A.config.reducedMotion in main.js).
  // The CSS already follows the system's from the first paint; this settles it either way.
  let still = !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  try { const s = JSON.parse(localStorage.getItem('afferent.settings')); if (typeof s?.reducedMotion === 'boolean') still = s.reducedMotion; } catch {}
  document.documentElement.classList.add(still ? 'af-still' : 'af-moving');
  if (cap === 0) { out('off'); gone(); return; }
  setTimeout(() => out('cap'), Math.max(0, cap - now()));
})();
