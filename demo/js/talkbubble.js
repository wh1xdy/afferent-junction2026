// The talk bubble on the start screen: the figure on the bench asks "Hey, how are you feeling?", and a tap opens Talk
// (main.js binds it as a [data-open] button).
//
// Where: just above the figure's head (A.World.figureTop), its tail pointing down at it, inside the gutters and clear of
// the kindle. What stands in the dock above the kindle (the room hint, the check-in chip, the clip offer) moves up to make
// room, through a spacer of its own before the kindle, so nothing lies under the bubble.
// One shape: body and tail are one path. The glass under the text is clipped to it, so its fill, sheen and blur run on
// into the tail, and one SVG draws the same path's edge and its shadow (outside the shape only).
//
// When: only on the plain start screen. What covers it is read from the page itself (a MutationObserver), not from any one
// way of closing, so it comes back after every way a sheet, page or dialog goes: its button, the scrim, Escape, a swipe
// down, a swipe back from the edge. It goes at once when anything opens, for a session, the check-in, onboarding and
// while the loading screen is up, and fades in a moment after the start screen is plain again.
(() => {
  const b = document.getElementById('talkBubble'), phone = document.getElementById('phone'), start = document.getElementById('start');
  if (!b || !phone || !start) return;
  const T = {
    first: 1400,  // ms on the plain start screen before it first fades in (after the loading screen is gone)
    again: 350,   // ms after whatever covered it has gone
    tail: 12,     // px from the body to the tail's tip
    r: 20,        // px corner radius of the body
    gap: 6,       // px between the tail's tip and the top of the head
    clear: 10,    // px kept free around it: the kindle, the dock above it, the top bar
  };
  const OVER = ['.layer:not(.hidden)', '.screen.settings:not(.hidden)', '.screen.talk:not(.hidden)', '.screen.voice:not(.hidden)',
    '.ci:not(.hidden)', '.onboard', '.qx', '[aria-modal="true"]:not(.hidden):not([hidden])', '[role="menu"]:not(.hidden):not([hidden])'].join(', ');
  // Only what shows counts: a menu left open inside a closed page does not hide the bubble.
  const over = () => [...document.querySelectorAll(OVER)].some(el => !el.parentNode?.closest?.('.hidden, [hidden]'));
  const covered = () => start.classList.contains('off') || !!A.session || phone.classList.contains('onboarding') || !!document.getElementById('loader') || over();

  // ── the shape ───────────────────────────────────────────────────────
  const NS = 'http://www.w3.org/2000/svg';
  const glass = document.createElement('span'), art = document.createElementNS ? document.createElementNS(NS, 'svg') : null;
  glass.className = 'tb-glass'; glass.setAttribute('aria-hidden', 'true');
  b.prepend(glass);
  if (art) {
    art.setAttribute('class', 'tb-art'); art.setAttribute('aria-hidden', 'true'); art.setAttribute('focusable', 'false');
    b.prepend(art);
  }
  // Body w x h with rounded corners; the tail leaves its bottom edge and ends at (p, h + tail), under the body's left part.
  const path = (w, h, p) => {
    const r = Math.min(T.r, h / 2), t = T.tail, f = n => Math.round(n * 10) / 10;
    return `M${r} 0H${f(w - r)}A${r} ${r} 0 0 1 ${f(w)} ${r}V${f(h - r)}A${r} ${r} 0 0 1 ${f(w - r)} ${f(h)}H${f(p + 20)}`
      + `C${f(p + 12)} ${f(h)} ${f(p + 4)} ${f(h + t * 0.45)} ${f(p)} ${f(h + t)}C${f(p + 5)} ${f(h + t * 0.75)} ${f(p + 8)} ${f(h + t * 0.35)} ${f(p + 6)} ${f(h)}`
      + `H${r}A${r} ${r} 0 0 1 0 ${f(h - r)}V${r}A${r} ${r} 0 0 1 ${r} 0Z`;
  };
  let drawn = '';
  const draw = (w, h, p) => {
    const key = `${w} ${h} ${p}`;
    if (key === drawn) return;
    drawn = key;
    const d = path(w, h, p), H = h + T.tail;
    glass.style.clipPath = glass.style.webkitClipPath = `path("${d}")`;
    glass.style.setProperty('--tb-body', h + 'px');
    if (!art) return;
    art.setAttribute('width', w); art.setAttribute('height', H); art.setAttribute('viewBox', `0 0 ${w} ${H}`);
    // the shadow is masked out of the shape, so it never darkens the glass it lies under
    art.innerHTML = `<defs><mask id="tbOut" maskUnits="userSpaceOnUse" x="-40" y="-40" width="${w + 80}" height="${H + 90}">`
      + `<rect x="-40" y="-40" width="${w + 80}" height="${H + 90}" fill="#fff"/><path d="${d}" fill="#000"/></mask>`
      + `<filter id="tbSoft" x="-40%" y="-60%" width="180%" height="240%"><feGaussianBlur stdDeviation="7"/></filter></defs>`
      + `<g mask="url(#tbOut)"><path class="tb-shade" d="${d}" transform="translate(0 4)" filter="url(#tbSoft)"/></g>`
      + `<path class="tb-edge" d="${d}"/>`;
  };

  // ── the place ───────────────────────────────────────────────────────
  // A spacer before the kindle: the dock items above it move up by its height.
  const begin = document.getElementById('begin');
  const room = document.createElement('span');
  room.className = 'tb-room'; room.setAttribute('aria-hidden', 'true');
  begin?.before?.(room);
  const box = el => el?.getBoundingClientRect?.();
  const shows = el => !!el && !el.hidden && !el.classList.contains('hidden') && (box(el)?.height || 0) > 0;
  const place = () => {
    const head = A.World?.figureTop?.(), canvas = document.getElementById('game'), size = A.World?.size?.();
    const cr = box(canvas), sr = box(start);
    if (!head || !cr || !sr || !size?.W || !cr.width) return false;
    const hx = cr.left - sr.left + head[0] * cr.width / size.W, hy = cr.top - sr.top + head[1] * cr.height / size.H;
    const w = b.offsetWidth, h = b.offsetHeight - T.tail;
    if (!w || !h) return false;
    const cs = getComputedStyle(start), side = parseFloat(cs.getPropertyValue('--af-gutter')) || 16;
    const left = Math.round(Math.max(side, Math.min(sr.width - side - w, hx - 30)));
    const p = Math.round(Math.max(T.r - 5, Math.min(w - T.r - 21, hx - left)));
    // above the head, and wholly above the kindle (its glow may run under it)
    const kb = box(begin), ky = kb ? kb.top - sr.top - T.clear : Infinity;
    const top = Math.round(Math.min(hy - T.gap - T.tail, ky) - h);
    b.style.setProperty('--tb-x', left + 'px');
    b.style.setProperty('--tb-y', top + 'px');
    b.style.setProperty('--tb-tip', p + 'px');
    draw(w, h, p);
    // make room: the lowest thing shown above the kindle ends T.clear above the bubble
    const dock = begin?.parentNode, items = dock ? [...dock.children].filter(c => c !== room && c !== begin && c.compareDocumentPosition?.(begin) & 4 && shows(c)) : [];
    const low = items.length ? Math.max(...items.map(c => box(c).bottom - sr.top)) : -Infinity;
    const now = parseFloat(room.style.height) || 0;
    const need = Math.max(0, Math.ceil(now + low + T.clear - top));
    if (Math.abs(need - now) > 1) room.style.height = need + 'px';
    return true;
  };

  // ── showing ─────────────────────────────────────────────────────────
  let timer = 0, seen = false;
  const sync = () => {
    if (covered()) {
      clearTimeout(timer); timer = 0;
      // only on a change: the observer hears every write of the class, even one that changes nothing
      if (!b.classList.contains('away')) b.classList.add('away');
      return;
    }
    // the room hint, the check-in chip or the clip offer may have come or gone: keep the dock clear of it
    place();
    if (!b.classList.contains('away') || timer) return;
    timer = setTimeout(() => {
      timer = 0;
      if (covered()) return;
      place();
      b.classList.remove('away');
      seen = true;
    }, seen ? T.again : T.first);
  };
  // The figure settles onto the bench and the world can shift under it: follow it, slowly, while the bubble is out.
  setInterval(() => { if (!b.classList.contains('away') && !covered()) place(); }, 1000);
  if (!b.classList.contains('away')) b.classList.add('away');
  let queued = false;
  const soon = () => { if (queued) return; queued = true; Promise.resolve().then(() => { queued = false; sync(); }); };
  if (typeof MutationObserver === 'function') {
    new MutationObserver(soon).observe(document.body || phone, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'hidden'] });
  }
  A.bus?.on?.('home', soon);
  addEventListener?.('resize', () => { drawn = ''; place(); });
  document.fonts?.ready?.then?.(() => { drawn = ''; place(); });
  sync();

  A.TalkBubble = { covered, sync, place, path, T, get shown() { return !b.classList.contains('away'); } };
})();
