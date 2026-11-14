(() => {
  const SEEN = 'afferent.quotes.seen', HOLD_MS = 8000, GUARD_MS = 600;
  let quotes = null, endShown = false;

  const norm = q => {
    if (typeof q === 'string') return { id: q, text: q, author: '', tags: [] };
    const text = q?.text ?? q?.quote ?? q?.body;
    if (!text) return null;
    const tags = [].concat(q.tags ?? q.tag ?? q.moment ?? []).map(String);
    return { id: String(q.id ?? text), text, author: q.author ?? q.by ?? q.source ?? '', tags };
  };
  const ready = fetch('data/quotes.json', { cache: 'no-cache' })
    .then(r => r.ok ? r.json() : null)
    .then(d => { const list = Array.isArray(d) ? d : d?.quotes; quotes = Array.isArray(list) ? list.map(norm).filter(Boolean) : null; })
    .catch(() => { quotes = null; });

  const seen = () => { try { const s = JSON.parse(localStorage.getItem(SEEN)); return Array.isArray(s) ? s : []; } catch { return []; } };
  const remember = ids => { try { localStorage.setItem(SEEN, JSON.stringify(ids)); } catch {} };

  const tagFor = r => {
    const mood = r.mood_end ?? r.pre_post?.mood?.end, delta = r.pre_post?.mood?.delta;
    if ((mood != null && mood <= 2) || (delta != null && delta < 0) || r.profile === 'bad_day') return 'after_hard_day';
    return r.clock === 'night' ? 'night' : 'morning';
  };

  const pick = tag => {
    if (!quotes?.length) return null;
    const tagged = quotes.filter(q => q.tags.includes(tag));
    const pool = tagged.length ? tagged : quotes.filter(q => !q.tags.length).length ? quotes.filter(q => !q.tags.length) : quotes;
    let s = seen(), fresh = pool.filter(q => !s.includes(q.id));
    if (!fresh.length) { const ids = new Set(pool.map(q => q.id)); s = s.filter(id => !ids.has(id)); fresh = pool; }
    const q = fresh[Math.floor(Math.random() * fresh.length)];
    remember([...s, q.id]);
    return q;
  };

  let screen, timer = 0, shownAt = 0;
  const done = () => {
    if (!screen.classList.contains('on')) return;
    clearTimeout(timer);
    screen.classList.remove('on');
    document.getElementById('phone').classList.remove('quoting');
    A.bus.emit('quoteDone');
  };
  const show = q => {
    screen.querySelector('p').textContent = q.text;
    const cite = screen.querySelector('cite');
    cite.textContent = q.author;
    cite.hidden = !q.author;
    document.getElementById('phone').classList.add('quoting');
    void screen.offsetWidth;
    screen.classList.add('on');
    shownAt = performance.now();
    timer = setTimeout(done, HOLD_MS);
  };

  const mount = () => {
    screen = document.createElement('div');
    screen.id = 'quote'; screen.className = 'quote-screen';
    screen.innerHTML = '<blockquote><p></p><cite></cite></blockquote>';
    screen.addEventListener('pointerdown', e => { e.stopPropagation(); if (performance.now() - shownAt > GUARD_MS) done(); });
    document.getElementById('phone').append(screen);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();

  A.bus.on('endScreen', () => { endShown = true; });
  A.bus.on('sessionEnd', r => {
    const after = endShown && r.status === 'completed';
    endShown = false;
    if (!after) return;
    ready.then(() => { const q = pick(tagFor(r)); q ? show(q) : A.bus.emit('quoteDone'); });
  });

  A.Quote = { pick, done };
})();
