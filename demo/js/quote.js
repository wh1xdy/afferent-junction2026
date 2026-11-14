(() => {
  const SHOW_AT = 1600;
  let quotes = null, offered = false, live = false, timer = 0, el = null;

  const norm = q => {
    if (typeof q === 'string') return { id: q, text: q, author: '', tags: [], date: null };
    const text = q?.text ?? q?.quote ?? q?.body;
    if (!text) return null;
    const tags = [].concat(q.tags ?? q.tag ?? q.moment ?? []).map(String);
    const by = q.author ?? q.by ?? (typeof q.source === 'string' ? q.source : q.source?.author) ?? '';
    return { id: String(q.id ?? text), text, author: by, tags, date: q.date ?? null };
  };
  const ready = fetch('data/quotes.json', { cache: 'no-cache' })
    .then(r => r.ok ? r.json() : null)
    .then(d => { const list = Array.isArray(d) ? d : d?.quotes; quotes = Array.isArray(list) ? list.map(norm).filter(Boolean) : null; })
    .catch(() => { quotes = null; });

  const pick = (key = A.Streak?.today?.() || new Date().toISOString().slice(0, 10)) => {
    if (!quotes?.length) return null;
    const [y, m, d] = key.split('-').map(Number);
    const dated = quotes.find(q => q.date === key || q.date === key.slice(5));
    if (dated) return dated;
    const day = Math.round((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 1)) / 864e5);
    const morning = quotes.filter(q => !q.tags.includes('night'));
    const pool = morning.length ? morning : quotes;
    return pool[day % pool.length];
  };

  const hide = () => { live = false; clearTimeout(timer); el?.classList.remove('on'); };
  const show = q => {
    el.querySelector('p').textContent = q.text;
    const cite = el.querySelector('cite');
    cite.textContent = q.author;
    cite.hidden = !q.author;
    void el.offsetWidth;
    el.classList.add('on');
  };

  const mount = () => {
    const end = document.getElementById('end');
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
    if (night || A.Prefs?.get('showLine') === false) return;
    live = true;
    timer = setTimeout(() => ready.then(() => { const q = live && !offered && pick(); if (q) show(q); }), SHOW_AT);
  });
  A.bus.on('shineEnd', hide);

  A.Quote = { pick, hide };
})();
