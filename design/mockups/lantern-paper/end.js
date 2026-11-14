(() => {
  const q = new URLSearchParams(location.search);
  if (q.has('asleep')) document.body.classList.add('asleep');
  const sel = q.get('sel');
  if (sel) document.querySelector(`.mood-pick [data-lantern="${sel}"]`)?.setAttribute('aria-checked', 'true');
})();
