// The soft loading screen (#loader in index.html). It is there only while the app is still loading: the art, the fonts,
// and the first painted frame of the world. main.js hands it what it waits for (A.Loader.when) and tells it each time a
// world frame has been drawn (A.Loader.frame); on the first frame drawn after everything has arrived it crossfades
// into the world. There is no minimum time on screen: ready in 100 ms means gone after 100 ms.
// Whatever happens to the loading, it leaves after CAP_MS, so it never holds the app. ?loader=<seconds> changes that
// limit and ?loader=0 starts without it (for measuring and development).
(() => {
  const el = document.getElementById('loader');
  const FADE_MS = 520, CAP_MS = 8000;
  const param = Number(new URLSearchParams(location.search).get('loader') ?? NaN);
  const cap = Number.isFinite(param) && param >= 0 ? param * 1000 : CAP_MS;
  const now = () => performance.now();
  const mark = n => { try { performance.mark(n); } catch {} };

  let pending = 0, asked = false, state = el ? 'loading' : 'gone';

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
    // A frame of the world has just been drawn (main.js loop, after the WebGL pass). The first one drawn once
    // everything has arrived is what the loading screen fades into.
    frame() { if (state === 'loading' && L.ready) out('ready'); },
    out,
  };
  function done() { pending--; }

  if (!el) return;
  if (cap === 0) { out('off'); gone(); return; }
  setTimeout(() => out('cap'), Math.max(0, cap - now()));
})();
