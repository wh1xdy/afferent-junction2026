(() => {
  const SHOW_AT = 1600, SEEN = 'afferent.quotes.seen.v1';
  const POOLS = { morning: ['morning', 'any', 'after_hard_day'], night: ['night', 'any'] };
  let quotes = [], offered = false, live = false, timer = 0, el = null;

  const read = () => { try { const v = JSON.parse(localStorage.getItem(SEEN)); return Array.isArray(v) ? v : []; } catch { return []; } };
  const write = v => { try { localStorage.setItem(SEEN, JSON.stringify(v)); } catch {} };

  const ready = fetch('data/quotes.json', { cache: 'no-cache' })
    .then(r => r.ok ? r.json() : [])
    .then(d => { quotes = (Array.isArray(d) ? d : d?.quotes ?? []).filter(q => q?.id && q.text).map(q => ({ ...q, id: String(q.id), tags: [].concat(q.tags ?? []) })); })
    .catch(() => { quotes = []; });

  const pick = clock => {
    const tags = POOLS[clock === 'night' ? 'night' : 'morning'];
    const pool = quotes.filter(q => q.tags.some(t => tags.includes(t)));
    if (!pool.length) return null;
    let seen = read().filter(id => quotes.some(q => q.id === id));
    if (seen.length >= quotes.length) seen = [];
    const fresh = pool.filter(q => !seen.includes(q.id));
    const q = fresh.length ? fresh[Math.floor(Math.random() * fresh.length)]
      : pool.reduce((a, b) => seen.indexOf(a.id) <= seen.indexOf(b.id) ? a : b);
    write([...seen.filter(id => id !== q.id), q.id]);
    return q;
  };

  const size = q => {
    const lines = q.text.split('\n').length, n = q.text.length;
    return lines > 4 || n > 120 ? 'long' : lines > 2 || n > 80 ? 'mid' : '';
  };

  const dismiss = () => hide();
  const hide = () => {
    live = false; clearTimeout(timer);
    el?.classList.remove('on');
    document.getElementById('phone')?.removeEventListener('pointerdown', dismiss, { capture: true });
  };
  const show = (q, night) => {
    el.querySelector('p').textContent = q.text;
    const cite = el.querySelector('cite');
    cite.textContent = q.author || 'Morning note';
    el.className = ['quote-line', size(q), night ? 'night' : ''].filter(Boolean).join(' ');
    el.dataset.id = q.id;
    void el.offsetWidth;
    el.classList.add('on');
    document.getElementById('phone')?.addEventListener('pointerdown', dismiss, { capture: true, once: true });
  };

  const mount = () => {
    const end = document.getElementById('endQuote') || document.getElementById('end');
    if (!end) return;
    el = document.createElement('figure');
    el.id = 'quote'; el.className = 'quote-line';
    el.innerHTML = '<blockquote><p></p></blockquote><cite></cite>';
    end.append(el);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();

  A.bus.on('endScreen', () => { offered = false; hide(); });
  A.bus.on('crisisOffer', () => { offered = true; hide(); });
  A.bus.on('home', hide);
  A.bus.on('shine', ({ night }) => {
    hide();
    if (A.Prefs?.get('showLine') === false) return;
    live = true;
    timer = setTimeout(() => ready.then(() => {
      if (!live || offered || !el) return;
      const q = pick(night ? 'night' : 'morning');
      if (q) show(q, night);
    }), SHOW_AT);
  });
  A.bus.on('shineEnd', ({ skipped } = {}) => { if (skipped) hide(); });

  A.Quote = { pick, hide };
})();
