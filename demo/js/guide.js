// The words around play. Greetings and the check-in question follow the real time of day (night mode still decides
// how the session looks and behaves), and line() says what to do now in the one line at the top of the screen.
// Pure functions of the clock and the session, so the node tests can read them without a page.
(() => {
  const ASK = { morning: 'How are you this morning?', afternoon: 'How are you this afternoon?', evening: 'How are you this evening?', night: 'How are you tonight?' };
  const HELLO = { morning: 'Good morning.', afternoon: 'Good afternoon.', evening: 'Good evening.', night: 'Good night.' };
  const NOTE = { morning: 'Morning note', afternoon: 'Afternoon note', evening: 'Evening note', night: 'Night note' };
  const LINE = {
    rest: 'Rest a moment with the lantern',
    dot: 'Tap the light to go on',
    lanternsRest: 'Let’s leave the lanterns for today.',
  };
  // the autoplay story nobody touches shows a task's line for AUTO_S, as before
  const DOT_AFTER_S = 1.2, IDLE_AGAIN_S = 6, NOTE_S = 5, AUTO_S = 3.5;

  const partOfDay = (d = new Date()) => {
    const h = d.getHours();
    return h >= 5 && h < 12 ? 'morning' : h >= 12 && h < 18 ? 'afternoon' : h >= 18 && h < 21 ? 'evening' : 'night';
  };

  // mem keeps what the line needs from earlier frames (main.js passes the same object every frame).
  const line = (s, now, mem = {}) => {
    if (!s || s.done) return null;
    if (s.phase === 'rest') return { text: LINE.rest, kind: 'line' };
    if (s.phase === 'checkin') return { text: ASK[mem.part || partOfDay()] };
    const g = s.game;
    if (s.phase === 'game' && g) {
      // three unanswered lanterns end that task early; say so kindly instead of leaving the player to wonder
      if (g.id === 'lanterns' && g.done && g.missedRun >= 3 && mem.noteFor !== g) { mem.noteFor = g; mem.noteUntil = now + NOTE_S; }
      if (g.done) return mem.noteFor === g && now < mem.noteUntil ? { text: LINE.lanternsRest, kind: 'line' } : null;
      const text = A.LINES?.[g.id];
      if (!text) return null;
      // the size cue is short, so the Lanterns keep their line for the whole task; the rest show it until the first
      // touch and again after a while without one
      if (g.id === 'lanterns') return { text, kind: 'line' };
      if (s.auto) return now - (g.startAt ?? now) < AUTO_S ? { text, kind: 'line' } : null;
      const touched = s.inputs > (g.inputs0 ?? 0), last = s.T?.st?.lastTouch ?? -Infinity;
      return !touched || now - Math.max(last, g.startAt ?? -Infinity) >= IDLE_AGAIN_S ? { text, kind: 'line' } : null;
    }
    if (s.phase === 'walk') {
      if (mem.noteFor && now < mem.noteUntil) return { text: LINE.lanternsRest, kind: 'line' };
      const w = s.T?.waiting?.(now);
      if (w != null && w >= DOT_AFTER_S) return { text: LINE.dot, kind: 'line' };
    }
    return null;
  };

  A.Guide = {
    ASK, HELLO, LINE, partOfDay, line,
    ask: (part = partOfDay()) => ASK[part],
    hello: (part = partOfDay()) => HELLO[part],
    note: (part = partOfDay()) => NOTE[part],
  };
})();
