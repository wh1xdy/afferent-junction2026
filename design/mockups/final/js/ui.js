(() => {
  const q = new URLSearchParams(location.search);
  const root = document.documentElement;
  if (q.get('sky')) root.dataset.sky = q.get('sky');
  if (q.get('room')) root.dataset.room = q.get('room');
  if (q.get('motion')) root.dataset.motion = q.get('motion');
  root.dataset.v = q.get('v') || root.dataset.v || '';
  document.querySelectorAll('[data-show]').forEach(el => {
    const [k, v] = el.dataset.show.split('=');
    const cur = q.get(k) ?? (k === 'v' ? root.dataset.v : null);
    el.hidden = v === undefined ? !cur : v.split('|').indexOf(cur || '') < 0;
  });

  window.lanternSvg = (c, g, missed) => `<svg class="lantern-glyph" viewBox="0 0 26 40" aria-hidden="true">
    <circle cx="13" cy="3.6" r="2.2" fill="none" stroke="currentColor" stroke-width="1.5"/>
    <path d="M8 10.5h10l-2-4.2h-6z" fill="currentColor"/>
    <rect x="6.5" y="10.5" width="13" height="20" rx="4.5" fill="${c === 'flame' ? 'color-mix(in srgb, currentColor 88%, transparent)' : c ? `color-mix(in srgb, ${c} ${Math.round(30 + 50 * g)}%, transparent)` : 'none'}" stroke="currentColor" stroke-width="1.5" ${missed ? 'stroke-dasharray="2.4 2.4"' : ''}/>
    ${c ? `<ellipse cx="13" cy="21.5" rx="2.7" ry="4.3" fill="${c === 'flame' ? 'var(--md-sys-color-primary)' : c}" opacity="${0.55 + 0.45 * g}"/>` : ''}
    <rect x="8.5" y="30.5" width="9" height="3.2" rx="1.2" fill="currentColor"/>
  </svg>`;
  document.querySelectorAll('[data-lantern]').forEach(el => {
    const c = el.dataset.lantern || null, g = Number(el.dataset.glow || 0);
    if (c && c !== 'flame') { el.style.setProperty('--c', c); el.style.setProperty('--g', g); }
    el.innerHTML = window.lanternSvg(c, g, el.hasAttribute('data-missed'));
  });

  document.querySelectorAll('[role="radiogroup"]').forEach(g => {
    g.addEventListener('click', e => {
      const b = e.target.closest('[role="radio"]');
      if (!b) return;
      g.querySelectorAll('[role="radio"]').forEach(x => x.setAttribute('aria-checked', String(x === b)));
    });
  });
})();
