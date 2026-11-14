(() => {
  const WAVE = 'M2 10.5C5.5 7 9 6.5 12 8.5S18.5 11 22 6.5';

  const laminate = (top = 'var(--md-sys-color-sun)') => `<svg class="laminate" viewBox="0 0 24 20" aria-hidden="true" fill="none" stroke-linecap="round" stroke-width="2">
    <path d="${WAVE}" stroke="${top}"/>
    <path d="${WAVE}" transform="translate(0 4)" stroke="var(--af-ply)"/>
    <path d="${WAVE}" transform="translate(0 8)" stroke="var(--af-ply-edge)"/>
  </svg>`;

  const flame = () => `<svg class="flame-glyph" viewBox="0 0 24 32" aria-hidden="true">
    <path d="M12 2.5C9.4 7 5 11.6 5 18.6a7 7 0 0 0 14 0C19 11.6 14.6 7 12 2.5z" fill="currentColor"/>
    <path d="M12 14c-1.2 2.1-3 3.9-3 6.4a3 3 0 0 0 6 0c0-2.5-1.8-4.3-3-6.4z" fill="#FFE3A6"/>
  </svg>`;

  const lantern = (fill, glow = 1, missed = false) => `<svg class="lantern-glyph" viewBox="0 0 26 40" aria-hidden="true">
    <circle cx="13" cy="3.6" r="2.2" fill="none" stroke="currentColor" stroke-width="1.5"/>
    <path d="M8 10.5h10l-2-4.2h-6z" fill="currentColor"/>
    <rect x="6.5" y="10.5" width="13" height="20" rx="4.5" fill="${fill ? `color-mix(in srgb, ${fill} ${Math.round(30 + 50 * glow)}%, transparent)` : 'none'}" stroke="currentColor" stroke-width="1.5"${missed ? ' stroke-dasharray="2.4 2.4"' : ''}/>
    ${fill ? `<ellipse cx="13" cy="21.5" rx="2.7" ry="4.3" fill="${fill}" opacity="${(0.55 + 0.45 * glow).toFixed(2)}"/>` : ''}
    <rect x="8.5" y="30.5" width="9" height="3.2" rx="1.2" fill="currentColor"/>
  </svg>`;

  const wave = () => `<svg class="wave-edge" viewBox="0 0 390 34" preserveAspectRatio="none" aria-hidden="true">
    <path d="M0 26C40 22 70 16.5 110 16.5S190 26 240 25.2 340 12 390 3V35H0Z"/>
  </svg>`;

  const ring = r => {
    const c = 2 * Math.PI * r;
    return `<svg class="kindle-ring" viewBox="0 0 100 100" aria-hidden="true">
      <circle class="track" cx="50" cy="50" r="${r}"/>
      <circle class="fill" cx="50" cy="50" r="${r}" stroke-dasharray="${c.toFixed(2)}" stroke-dashoffset="${c.toFixed(2)}" transform="rotate(-90 50 50)"/>
      <circle class="tip" cx="50" cy="${50 - r}" r="2.6"/>
    </svg>`;
  };

  A.Glyph = { laminate, flame, lantern, wave, ring };
})();
