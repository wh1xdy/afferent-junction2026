// Heart Duel screen (Settings, Together): two people wear one finger clip each, both hearts beat live and they play
// "who calms down first". Party mode, outside the therapy session: it never opens during one and closes when one starts.
// The model is duel-core.js. This file only draws it; it keeps nothing after the screen closes and writes nothing anywhere.
(() => {
  const D = A.DuelCore, S = A.Sensors;
  if (typeof document === 'undefined' || !D || !document.getElementById('phone')) return;
  const $ = id => document.getElementById(id);

  const HEART = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>';
  const player = i => `<section class="duel-player" data-p="${i}" data-state="none" aria-labelledby="duelName${i}">
      <h3 id="duelName${i}" class="duel-name t-label">Player ${i + 1}</h3>
      <span class="duel-heart">${HEART}</span>
      <span class="duel-bpm">–</span>
      <span class="duel-line t-body-s"></span>
      <span class="duel-goal t-body-s"></span>
      <span class="duel-hold" aria-hidden="true"><span></span></span>
    </section>`;
  const html = `<div id="duel" class="screen duel hidden" role="dialog" aria-modal="true" aria-labelledby="duelTitle">
    <header class="top-bar app-bar">
      <button class="icon-btn state" data-duel-close type="button" aria-label="Back"><span class="ms">arrow_back</span></button>
      <h2 id="duelTitle" class="title" tabindex="-1">Heart Duel</h2>
      <button class="icon-btn state" data-open="crisis" type="button" aria-label="Talk to someone"><span class="ms">support</span></button>
    </header>
    <div class="duel-body">
      <p class="duel-link t-body-s"><span class="dot" aria-hidden="true"></span><span class="txt"></span><span class="duel-two" hidden><span class="ms fill" aria-hidden="true">favorite</span>Two hearts</span></p>
      <div class="duel-players">${player(0)}${player(1)}</div>
      <section class="duel-game" aria-live="polite">
        <h3 class="duel-phase t-title"></h3>
        <p class="duel-big"><span class="num"></span><span class="unit"></span></p>
        <p class="duel-text t-body-m"></p>
        <div class="duel-result" hidden><p class="duel-win t-headline"></p><p class="duel-why t-body-m"></p></div>
        <div class="duel-meter" aria-hidden="true"><span></span></div>
      </section>
      <p class="duel-foot t-body-s">A party game, not a measurement. Nothing from the duel is saved or sent, and it is not part of your sessions.</p>
    </div>
    <div class="duel-actions"><button class="btn filled block state duel-go" type="button">Start</button></div>
  </div>`;
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  $('phone').append(t.content);

  const el = $('duel'), q = s => el.querySelector(s), cards = [...el.querySelectorAll('.duel-player')];
  const go = q('.duel-go'), hearts = cards.map(c => c.querySelector('.duel-heart'));
  const cache = new Map();
  const put = (node, key, value, apply) => { const k = key; if (cache.get(k) === value) return; cache.set(k, value); apply(node, value); };
  const text = (node, key, value) => put(node, key, value ?? '', (n, v) => { n.textContent = v; });
  const attr = (node, key, name, value) => put(node, key, value, (n, v) => { if (v == null) n.removeAttribute(name); else n.setAttribute(name, v); });
  const hide = (node, key, hidden) => put(node, key, !!hidden, (n, v) => { n.hidden = v; });
  const style = (node, key, prop, value) => put(node, key, value, (n, v) => n.style.setProperty(prop, v));
  const still = () => document.documentElement.dataset.motion === 'reduced' || !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  let m = null, raf = 0, last = null;

  const render = (s, views) => {
    attr(q('.duel-link'), 'link', 'data-ok', s.link.ok ? '1' : null);
    text(q('.duel-link .txt'), 'linkText', s.link.text);
    hide(q('.duel-two'), 'two', !s.two);
    attr(q('.duel-two'), 'twoBy', 'title', s.two === 'box' ? 'The sensor box sees two different heart rhythms' : s.two ? 'The two clips show two different heart rhythms' : null);
    s.players.forEach((p, i) => {
      const c = cards[i];
      attr(c, 'state' + i, 'data-state', p.state);
      text(c.querySelector('.duel-bpm'), 'bpm' + i, p.bpm === null ? '–' : String(p.bpm));
      text(c.querySelector('.duel-line'), 'line' + i, p.line);
      text(c.querySelector('.duel-goal'), 'goal' + i, p.goal);
      hide(c.querySelector('.duel-goal'), 'goalOff' + i, !p.goal);
      hide(c.querySelector('.duel-hold'), 'holdOff' + i, !p.goal);
      style(c.querySelector('.duel-hold > span'), 'hold' + i, '--v', p.held.toFixed(3));
      attr(c, 'label' + i, 'aria-label', `${p.name}: ${p.bpm === null ? 'no reading' : `${p.bpm} beats per minute`}. ${p.line}`);
      const scale = p.bpm !== null && !still() ? D.beatScale(m.phase[i] % 1).toFixed(4) : '1';
      style(hearts[i], 'beat' + i, '--beat', scale);
    });
    attr(el, 'step', 'data-step', m.round.step);
    text(q('.duel-phase'), 'phase', s.phase.title);
    hide(q('.duel-big'), 'bigOff', s.phase.big == null);
    text(q('.duel-big .num'), 'big', s.phase.big);
    text(q('.duel-big .unit'), 'unit', s.phase.unit);
    hide(q('.duel-text'), 'textOff', !s.phase.text);
    text(q('.duel-text'), 'text', s.phase.text);
    hide(q('.duel-meter'), 'meterOff', m.round.step === 'ready');
    style(q('.duel-meter > span'), 'meter', '--v', Math.min(1, s.phase.progress).toFixed(4));
    hide(q('.duel-result'), 'resultOff', !s.result);
    text(q('.duel-win'), 'win', s.result?.title);
    text(q('.duel-why'), 'why', s.result?.text);
    if (s.result) attr(q('.duel-result'), 'winner', 'data-winner', m.round.result.winner == null ? null : String(m.round.result.winner));
    hide(go, 'goOff', !s.button);
    if (s.button) {
      text(go, 'go', s.button.label);
      put(go, 'goDisabled', !s.button.enabled, (n, v) => { n.disabled = v; });
      put(go, 'goKind', s.button.stop ? 'stop' : 'go', (n, v) => { n.classList.toggle('filled', v === 'go'); n.classList.toggle('tonal', v === 'stop'); });
    }
  };

  const frame = () => {
    if (!m) return;
    const now = A.now() * 1000, linked = !!S.enabled.pulse_stone && S.fingerLink.state === 'connected';
    const views = D.step(m, now, linked);
    render(D.screen({ enabled: !!S.enabled.pulse_stone, link: S.fingerLink.state, views, people: m.people, round: m.round }), views);
    raf = requestAnimationFrame(frame);
  };

  const open = () => {
    if (!D.allowed()) { A.Shell?.toast?.('Heart Duel is not available during a session'); return; }
    if (m) return;
    m = D.create(); cache.clear();
    const settings = $('settings');
    if (settings?.dataset.scheme) el.dataset.scheme = settings.dataset.scheme; else delete el.dataset.scheme;
    el.classList.remove('hidden');
    A.Finger?.arm?.();
    last = document.activeElement;
    // focus moves into the screen on its title: on the back button it drew a focus ring after a tap
    q('#duelTitle').focus({ preventScroll: true });
    cancelAnimationFrame(raf);
    frame();
  };

  const close = () => {
    if (!m && el.classList.contains('hidden')) return;
    cancelAnimationFrame(raf);
    m = null; cache.clear();
    el.classList.add('hidden');
    if (last?.isConnected) last.focus?.({ preventScroll: true });
  };

  go.addEventListener('click', () => {
    if (!m) return;
    if (m.round.step === 'settle' || m.round.step === 'race') D.stop(m);
    else D.start(m);
  });
  q('[data-duel-close]').addEventListener('click', close);
  document.querySelectorAll('[data-duel]').forEach(b => b.addEventListener('click', open));
  addEventListener('keydown', e => { if (e.key === 'Escape' && m && $('crisis')?.classList.contains('hidden') !== false) { e.preventDefault(); e.stopPropagation(); close(); } }, true);

  A.bus.on('fingerAff1', d => { if (!m) return; try { D.packet(m, d, A.now() * 1000); } catch (e) { console.warn('heart duel: packet', e); } });
  A.bus.on('ws', x => { if (x?.type === 'session_start') close(); });

  A.Duel = { open, close, isOpen: () => !!m };
})();
