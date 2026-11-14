(() => {
  const FADE_IN = 700, HOLD = 2500, FADE_OUT = 600, SKIP = 250;
  const el = document.getElementById('splash');
  if (!el) return;
  const calm = () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || document.documentElement.dataset.motion === 'reduced';
  let timer = 0, leaving = false;

  const finish = () => {
    clearTimeout(timer);
    document.removeEventListener('keydown', onKey);
    el.remove();
  };
  const leave = ms => {
    if (leaving) return;
    leaving = true;
    clearTimeout(timer);
    if (!ms) return finish();
    el.style.setProperty('--splash-out', ms + 'ms');
    el.classList.add('out');
    timer = setTimeout(finish, ms);
  };
  const skip = e => {
    e.preventDefault();
    e.stopPropagation();
    leave(calm() ? 0 : SKIP);
  };
  const onKey = e => { if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') skip(e); };

  el.addEventListener('click', skip);
  document.addEventListener('keydown', onKey);
  timer = setTimeout(() => leave(calm() ? 0 : FADE_OUT), calm() ? HOLD : FADE_IN + HOLD);
})();
