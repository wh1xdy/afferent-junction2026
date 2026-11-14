(() => {
  const q = new URLSearchParams(location.search);
  const root = document.documentElement;
  if (q.get('t')) root.dataset.scheme = { night: 'night', dawn: 'dawn', morning: 'dawn' }[q.get('t')] || root.dataset.scheme;
  if (q.get('motion') === 'reduced') root.dataset.motion = 'reduced';
  root.classList.toggle('dev', q.has('dev'));

  const LANTERN = '<svg class="lantern" viewBox="0 0 40 56" aria-hidden="true"><circle class="frame" cx="20" cy="4.5" r="3"/><path class="cap" d="M11 13.5 14 9h12l3 4.5z"/><rect class="glass" x="9" y="14" width="22" height="30" rx="9"/><path class="flame" d="M20 21c3.5 5 4.5 8.5 4.5 10.5a4.5 4.5 0 0 1-9 0c0-2 1-5.5 4.5-10.5z"/><rect class="cap" x="12" y="45" width="16" height="4" rx="2"/></svg>';
  window.lpLantern = (el, mood) => {
    if (mood) { el.style.setProperty('--c', `var(--lp-mood-${mood})`); el.style.setProperty('--g', `var(--lp-mood-${mood}-g)`); }
    el.insertAdjacentHTML('beforeend', LANTERN);
  };
  document.querySelectorAll('[data-lantern]').forEach(el => lpLantern(el, el.dataset.lantern));

  window.lpWavy = (el, value) => {
    const w = el.clientWidth || Number(el.dataset.w) || 160, h = 12, amp = 3, wl = 20, gap = 6;
    const x1 = Math.max(0, w * value - gap / 2);
    let d = `M2 ${h / 2}`;
    for (let x = 2; x <= x1; x += 1) d += ` L${x} ${(h / 2 + amp * Math.sin((x / wl) * 2 * Math.PI)).toFixed(2)}`;
    el.innerHTML = `<svg class="wavy" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true">
      <path d="${d}" fill="none" stroke="var(--md-sys-color-primary)" stroke-width="4" stroke-linecap="round"/>
      <path d="M${Math.min(w - 2, x1 + gap + 2)} ${h / 2} H${w - 2}" stroke="var(--md-sys-color-secondary-container)" stroke-width="4" stroke-linecap="round"/>
      <circle cx="${w - 2}" cy="${h / 2}" r="2" fill="var(--md-sys-color-primary)"/></svg>`;
  };
  document.querySelectorAll('[data-wavy]').forEach(el => lpWavy(el, Number(el.dataset.wavy)));

  document.addEventListener('pointerdown', e => {
    const el = e.target.closest('.sl');
    if (!el || matchMedia('(prefers-reduced-motion: reduce)').matches || root.dataset.motion === 'reduced') return;
    const r = el.getBoundingClientRect();
    const b = document.createElement('span');
    b.className = 'bloom';
    const d = 2.2 * Math.hypot(Math.max(e.clientX - r.left, r.right - e.clientX), Math.max(e.clientY - r.top, r.bottom - e.clientY));
    b.style.cssText = `--x:${e.clientX - r.left}px;--y:${e.clientY - r.top}px;--d:${d}px`;
    el.prepend(b);
    const end = () => { b.classList.add('out'); setTimeout(() => b.remove(), 500); removeEventListener('pointerup', end); removeEventListener('pointercancel', end); };
    addEventListener('pointerup', end); addEventListener('pointercancel', end);
  });

  document.addEventListener('click', e => {
    const opt = e.target.closest('[role="radio"]');
    if (opt) {
      opt.closest('[role="radiogroup"]').querySelectorAll('[role="radio"]').forEach(o => o.setAttribute('aria-checked', String(o === opt)));
    }
    const tog = e.target.closest('[aria-pressed]');
    if (tog && tog.dataset.toggle !== undefined) tog.setAttribute('aria-pressed', String(tog.getAttribute('aria-pressed') !== 'true'));
  });
})();
