(() => {
  const lantern = (c, g) => `<svg class="lantern-glyph" viewBox="0 0 26 40" aria-hidden="true">
    <circle cx="13" cy="3.5" r="2.2" fill="none" stroke="currentColor" stroke-width="1.4"/>
    <path d="M8 10.5h10l-2-4.2h-6z" fill="currentColor"/>
    <rect x="6.5" y="10.5" width="13" height="20" rx="4.5" fill="${c ? `color-mix(in srgb, ${c} ${Math.round(35 + 50 * g)}%, transparent)` : 'none'}" stroke="currentColor" stroke-width="1.4"/>
    ${c ? `<ellipse cx="13" cy="21.5" rx="2.6" ry="4.2" fill="${c}" opacity="${0.6 + 0.4 * g}"/>` : ''}
    <rect x="8.5" y="30.5" width="9" height="3.2" rx="1.2" fill="currentColor"/>
  </svg>`;
  document.querySelectorAll('[data-lantern]').forEach(el => {
    const c = el.dataset.lantern || null, g = Number(el.dataset.glow || 0);
    if (c) { el.style.setProperty('--c', c); el.style.setProperty('--g', g); }
    el.innerHTML = lantern(c, g);
  });
})();
