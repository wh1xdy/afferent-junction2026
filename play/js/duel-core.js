// Heart Duel in the app: the model behind the screen in duel.js. No DOM, no clock of its own (every function gets the time in ms).
// A party game for two people, one finger clip each, outside the therapy session. Nothing here is stored, sent or put in a session:
// it reads the finger packets as they arrive (A.Sensors.feedFingerBle emits 'fingerAff1') and keeps them in memory while the screen is open.
// The game logic is fun/heart-duel/game.js (copied to heartduel-game.js): the per-clip tracker, the heart beat and the 30 s round.
(() => {
  const G = typeof HeartDuel !== 'undefined' ? HeartDuel : null;
  const V3 = 7;   // AFF1 v3 (7 bytes): the box drops a clip within 4 s and says when two people wear the clips (byte 6)

  // ── two people? ───────────────────────────────────────────────────────────────────────────────────────────────
  // With the v3 flag the box decides. Without it the app uses the box's own rule on the two per-clip readings
  // (uno-q/modulino-hub/app.py periods_apart / update_two_hearts): more than 12 % apart and not half or double
  // (one heart counted twice) for 3 s means two people; 3 s the same, or 10 s without two readings, means not.
  const TWO = { APART: 0.12, HARMONIC: 0.15, ON_MS: 3000, OFF_MS: 3000, UNKNOWN_MS: 10000, FLAG_MS: 5000 };

  const apart = (a, b) => {
    if (!G.isBpm(a) || !G.isBpm(b)) return null;
    const r = Math.max(a, b) / Math.min(a, b);
    if (r <= 1 + TWO.APART) return false;
    return Math.abs(r - 2) > 2 * TWO.HARMONIC;
  };

  const peopleCreate = () => ({ on: false, by: null, apartMs: 0, sameMs: 0, unknownMs: 0 });

  // One call per frame. flag = the box's last word (true/false) or null; bpm = the two live readings (null = none).
  const peopleStep = (p, flag, bpm, dtMs) => {
    if (flag === true || flag === false) return { ...peopleCreate(), on: flag, by: 'box' };
    const a = apart(bpm[0], bpm[1]), dt = Math.max(0, dtMs);
    const n = a === true ? { apartMs: p.apartMs + dt, sameMs: 0, unknownMs: 0 }
      : a === false ? { apartMs: 0, sameMs: p.sameMs + dt, unknownMs: 0 }
        : { apartMs: 0, sameMs: 0, unknownMs: p.unknownMs + dt };
    let on = p.by === 'app' && p.on;
    if (n.apartMs >= TWO.ON_MS) on = true;
    if (n.sameMs >= TWO.OFF_MS || n.unknownMs >= TWO.UNKNOWN_MS) on = false;
    return { ...n, on, by: 'app' };
  };

  // ── the two clips ─────────────────────────────────────────────────────────────────────────────────────────────
  // Every AFF1 notification goes to the tracker of game.js, which only credits a value that a heartbeat confirmed in the last 5 s.
  // A v1/v2 box keeps a removed clip's last number in the packet, so there a value that has not moved for 20 s is not shown either.
  const byte = x => Number.isFinite(x) && x > 0 ? Math.min(255, Math.round(x)) : 0;

  const clipsCreate = () => ({ tr: G.createTracker(), len: null, flag: null, flagAt: null, packets: 0 });

  const clipsPacket = (c, d, nowMs) => {
    if (!d || d.kind !== 'aff1') return c;
    const f = Array.isArray(d.finger_bpm) ? d.finger_bpm : [];
    G.trackerPacket(c.tr, [byte(f[0]), byte(f[1]), byte(d.breathing_per_min), byte(d.rmssd_ms)], nowMs, 'notify');
    c.len = Number.isInteger(d.payload_len) ? d.payload_len : null;
    if (typeof d.two_hearts === 'boolean') { c.flag = d.two_hearts; c.flagAt = nowMs; }
    c.packets++;
    return c;
  };

  // state: off (no link) | none (put the clip on) | lost (had a reading, none for 5 s) | still (v1/v2: same number for 20 s) | live
  // bpm is a number only in state live. Nothing else ever carries a number: no reading means nothing shown.
  const clipView = (c, i, nowMs, linked) => {
    const v = G.playerView(c.tr, i, nowMs, linked);
    if (v.state === 'offline') return { state: 'off', bpm: null };
    if (v.state === 'no-finger') return { state: 'none', bpm: null };
    if (v.state === 'stale') return { state: 'lost', bpm: null };
    if (v.frozen && !(c.len >= V3)) return { state: 'still', bpm: null };
    return { state: 'live', bpm: v.bpm };
  };

  const boxFlag = (c, nowMs) => c.flag !== null && c.flagAt !== null && nowMs - c.flagAt < TWO.FLAG_MS ? c.flag : null;

  // ── the round: who calms down first? ──────────────────────────────────────────────────────────────────────────
  // settle: 10 s to measure where each player starts (the average of their live readings, which must cover half of it).
  // race:   the 30 s CALM round of game.js. The first to stay DROP below their own start for HOLD wins. Starting from your
  //         own pulse keeps it fair between a resting 58 and a resting 84. Nobody there in 30 s: the bigger average drop wins,
  //         counted only for a player with a reading for half the round (game.js calmResult).
  const ROUND = { SETTLE_MS: 10000, DROP_BPM: 4, HOLD_MS: 5000, RACE_MS: G ? G.CALM_ROUND_MS : 30000, MIN_COVERAGE: G ? G.CALM_MIN_COVERAGE : 0.5 };
  const one = x => Math.round(x * 10) / 10;

  const roundCreate = () => ({ step: 'ready', settleMs: 0, settle: null, start: [null, null], race: null, held: [0, 0], result: null, lost: null });

  const roundBegin = () => ({ ...roundCreate(), step: 'settle', settle: G.calmCreate() });

  const raceResult = r => {
    const c = G.calmResult(r.race);
    const drops = c.averages.map((avg, i) => avg === null ? null : one(r.start[i] - avg));
    const have = drops.map(d => d !== null);
    if (have[0] && have[1]) {
      if (drops[0] === drops[1]) return { outcome: 'tie', winner: null, drops, coverage: c.coverage };
      return { outcome: 'most', winner: drops[0] > drops[1] ? 0 : 1, drops, coverage: c.coverage };
    }
    return { outcome: have[0] || have[1] ? 'no-contest' : 'no-data', winner: have[0] ? 0 : have[1] ? 1 : null, drops, coverage: c.coverage };
  };

  // One call per frame with the two live readings (null = no reading) and the frame time.
  const roundStep = (r, bpm, dtMs) => {
    if (r.step !== 'settle' && r.step !== 'race') return r;
    const dt = Math.max(0, Math.min(dtMs, G.MAX_STEP_MS));
    if (r.step === 'settle') {
      const d = Math.min(dt, ROUND.SETTLE_MS - r.settleMs), settle = G.calmStep(r.settle, bpm[0], bpm[1], d), settleMs = r.settleMs + d;
      if (settleMs < ROUND.SETTLE_MS) return { ...r, settle, settleMs };
      const ok = settle.players.map(p => p.liveMs / ROUND.SETTLE_MS >= ROUND.MIN_COVERAGE);
      if (!ok[0] || !ok[1]) return { ...roundCreate(), lost: ok.map(x => !x) };
      return { ...r, settle, settleMs, step: 'race', start: [0, 1].map(i => one(G.calmAverage(settle, i))), race: G.calmCreate(), held: [0, 0] };
    }
    const d = Math.min(dt, ROUND.RACE_MS - r.race.elapsedMs), race = G.calmStep(r.race, bpm[0], bpm[1], d);
    const below = i => G.isBpm(bpm[i]) && bpm[i] <= r.start[i] - ROUND.DROP_BPM;
    const held = [0, 1].map(i => below(i) ? r.held[i] + d : 0);
    const next = { ...r, race, held };
    const there = held.map(h => h >= ROUND.HOLD_MS);
    if (there[0] || there[1]) {
      const drop = i => one(r.start[i] - bpm[i]);
      let winner = there[0] ? 0 : 1, outcome = 'first';
      if (there[0] && there[1]) { if (drop(0) === drop(1)) { winner = null; outcome = 'tie'; } else winner = drop(0) > drop(1) ? 0 : 1; }
      return { ...next, step: 'done', result: { outcome, winner, atMs: race.elapsedMs, drops: [0, 1].map(i => there[i] ? drop(i) : null) } };
    }
    if (race.done) return { ...next, step: 'done', result: raceResult(next) };
    return next;
  };

  // ── what the screen says ──────────────────────────────────────────────────────────────────────────────────────
  const LINK = {
    unavailable: 'No finger sensor on this device', unsupported: 'No finger sensor on this device', off: 'Not connected',
    scanning: 'Looking for the finger sensor', connecting: 'Looking for the finger sensor', unauthorized: 'Bluetooth is off for Afferent in Settings',
  };
  const NAME = ['Player 1', 'Player 2'];
  const secs = ms => Math.max(0, Math.ceil(ms / 1000));
  const fix1 = x => x.toFixed(1).replace(/\.0$/, '');
  const fromStart = drop => drop > 0 ? `${fix1(drop)} below your start` : drop < 0 ? `${fix1(-drop)} above your start` : 'At your start';

  // Clip 1 wakes the sensor box (it switches both sensors on), so player 1 goes first.
  const clipLine = (v, i, other) => ({
    off: 'No reading',
    none: i === 0 ? 'Put on clip 1 first' : other.state === 'live' ? 'Put on clip 2' : 'Then clip 2',
    lost: 'No reading right now',
    still: 'Is the clip still on?',
    live: 'beats per minute',
  })[v.state];

  // The whole screen as plain data: duel.js only draws it. link: { ok, text }; players: [{ name, state, bpm, line, goal, held }];
  // two: 'box' | 'app' (who says two people wear the clips) | null; phase: { title, big, unit, text, progress };
  // button: { label, enabled, stop? } | null; result: { title, text } | null.
  const screen = ({ enabled, link, views, people, round }) => {
    const connected = enabled && link === 'connected';
    const linkText = !enabled ? 'The pulse stone is switched off in Settings' : connected ? 'Finger sensor connected' : LINK[link] || LINK.unavailable;
    const live = views.map(v => v.state === 'live');
    const r = round, racing = r.step === 'race' || r.step === 'done';
    const players = views.map((v, i) => {
      const p = { name: NAME[i], state: v.state, bpm: v.bpm, line: clipLine(v, i, views[1 - i]), goal: null, held: 0 };
      if (racing && r.start[i] !== null) {
        p.goal = `Start ${fix1(r.start[i])} · goal ${fix1(r.start[i] - ROUND.DROP_BPM)}`;
        if (v.bpm !== null) p.line = fromStart(one(r.start[i] - v.bpm));
        p.held = Math.min(1, r.held[i] / ROUND.HOLD_MS);
      }
      return p;
    });
    let phase, button = null, result = null;
    if (r.step === 'settle' || r.step === 'race') button = { label: 'Stop', enabled: true, stop: true };
    if (r.step === 'settle') {
      phase = { title: 'Measuring where you start', big: String(secs(ROUND.SETTLE_MS - r.settleMs)), unit: 'seconds', text: 'Sit back and breathe as you usually do.', progress: r.settleMs / ROUND.SETTLE_MS };
    } else if (r.step === 'race') {
      phase = { title: 'Slow your hearts', big: String(secs(ROUND.RACE_MS - r.race.elapsedMs)), unit: 'seconds left', text: `Breathe out slowly. Stay ${ROUND.DROP_BPM} below your start for ${ROUND.HOLD_MS / 1000} seconds.`, progress: r.race.elapsedMs / ROUND.RACE_MS };
    } else if (r.step === 'done') {
      phase = { title: 'Round over', big: null, unit: null, text: null, progress: 1 };
      result = resultText(r);
      button = { label: 'Play again', enabled: connected && live[0] && live[1] };
    } else {
      const lost = r.lost ? `${r.lost[0] && r.lost[1] ? 'Both clips' : `Clip ${r.lost[0] ? 1 : 2}`} lost the reading while measuring the start. Try again when both hearts beat.` : '';
      phase = {
        title: 'Who calms down first?', big: null, unit: null, progress: 0,
        text: lost || `First the app measures where each of you starts. Then the first to stay ${ROUND.DROP_BPM} beats per minute below their own start for ${ROUND.HOLD_MS / 1000} seconds wins. ${ROUND.RACE_MS / 1000} seconds.`,
      };
      button = live[0] && live[1] && connected ? { label: 'Start', enabled: true } : { label: !connected ? 'Waiting for the sensor' : `Waiting for ${live[0] || live[1] ? 'the other heart' : 'both hearts'}`, enabled: false };
    }
    return { link: { ok: connected, text: linkText }, two: !!people.on && connected ? people.by : null, players, phase, button, result };
  };

  const resultText = r => {
    const x = r.result, n = i => NAME[i];
    if (x.outcome === 'first') {
      return { title: `${n(x.winner)} calmed down first`, text: `${fix1(x.drops[x.winner])} below their start after ${secs(x.atMs)} seconds, and stayed there. Nicely done, both of you.` };
    }
    const rel = d => d > 0 ? `${fix1(d)} below` : d < 0 ? `${fix1(-d)} above` : 'level with';
    if (x.outcome === 'most') {
      const w = x.winner, dw = x.drops[w], dl = x.drops[1 - w];
      return {
        title: dw > 0 ? `${n(w)} calmed down the most` : `${n(w)} stayed the calmest`,
        text: `On average ${n(w)} was ${rel(dw)} their start, ${n(1 - w)} ${rel(dl)} theirs. Nobody held ${ROUND.DROP_BPM} below for ${ROUND.HOLD_MS / 1000} seconds this time.`,
      };
    }
    if (x.outcome === 'tie') {
      return x.atMs != null
        ? { title: 'A tie', text: `You both got there in the same moment, ${fix1(x.drops[0])} below your starts. Nicely done, both of you.` }
        : { title: 'A tie', text: `On average you were both ${rel(x.drops[0])} your start.` };
    }
    if (x.outcome === 'no-contest') {
      const miss = 1 - x.winner;
      return { title: 'No winner this round', text: `Clip ${miss + 1} had a reading for only ${Math.round(x.coverage[miss] * ROUND.RACE_MS / 1000)} of ${ROUND.RACE_MS / 1000} seconds. A snug clip and a still hand help.` };
    }
    return { title: 'No winner this round', text: 'Neither clip had a reading for half the round. A snug clip and a still hand help.' };
  };

  // ── one duel ─────────────────────────────────────────────────────────────────────────────────────────────────
  // The state of one open screen: created on open, dropped on close. Never written anywhere.
  const create = () => ({ clips: clipsCreate(), people: peopleCreate(), round: roundCreate(), at: null, phase: [0, 0], heartAt: -Infinity, touch: [] });

  const packet = (m, d, nowMs) => { clipsPacket(m.clips, d, nowMs); return m; };

  // One call per frame. linked = the finger sensor is on and connected. Returns what the screen shows.
  const step = (m, nowMs, linked) => {
    const dt = m.at === null ? 0 : Math.max(0, nowMs - m.at);
    m.at = nowMs;
    if (!linked && m.clips.packets) m.clips = clipsCreate();
    const views = [0, 1].map(i => clipView(m.clips, i, nowMs, linked));
    const bpm = views.map(v => v.bpm);
    m.people = peopleStep(m.people, linked ? boxFlag(m.clips, nowMs) : null, bpm, dt);
    const before = m.round, beats = [0, 0];
    m.round = roundStep(m.round, bpm, dt);
    m.phase = m.phase.map((ph, i) => { const b = G.advanceBeat(ph, bpm[i], dt); beats[i] = b.beats; return b.phase; });
    m.touch = touches(m, before, views, beats, nowMs);
    return views;
  };

  // ── the touch ─────────────────────────────────────────────────────────────────────────────────────────────────
  // The haptic words one frame earns, as [word, ms, strength?]; duel.js plays them through A.Haptics, which keeps the
  // Vibration switch. A quiet tick for the last seconds of measuring and of the race; success when someone wins and
  // complete as the round closes (complete alone when nobody wins); and a soft heart on a player's beat, only with a
  // live reading and at most one every HEART_GAP_MS, so two hearts stay a pulse and never become a buzz.
  const TOUCH = { COUNT_S: 3, CLOSE_MS: 800, HEART_GAP_MS: 900, HEART_K: 0.45 };
  const left = r => r.step === 'settle' ? secs(ROUND.SETTLE_MS - r.settleMs) : r.step === 'race' ? secs(ROUND.RACE_MS - r.race.elapsedMs) : null;
  const touches = (m, before, views, beats, nowMs) => {
    const r = m.round;
    if (before.step !== 'done' && r.step === 'done') {
      const won = r.result?.outcome === 'first' || r.result?.outcome === 'most';
      return won ? [['success', 0], ['complete', TOUCH.CLOSE_MS]] : [['complete', 0]];
    }
    const s = left(r);
    if (before.step === r.step && s !== null && s !== left(before) && s > 0 && s <= TOUCH.COUNT_S) return [['tick', 0]];
    if (beats.some((n, i) => n > 0 && views[i].state === 'live') && nowMs - m.heartAt >= TOUCH.HEART_GAP_MS) {
      m.heartAt = nowMs;
      return [['heart', 0, TOUCH.HEART_K]];
    }
    return [];
  };

  const start = m => {
    if (m.round.step === 'settle' || m.round.step === 'race') return m;
    m.round = roundBegin();
    return m;
  };

  const stop = m => { m.round = roundCreate(); return m; };

  // A duel never runs inside a therapy session.
  const allowed = () => !(A.session && !A.session.done);

  // Lub-dub: two bumps per beat (the heart of game.js's page).
  const bump = (p, c, w) => Math.exp(-(((p - c) / w) ** 2));
  const beatScale = p => 1 + 0.16 * (bump(p, 0.07, 0.055) + bump(p - 1, 0.07, 0.055)) + 0.07 * bump(p, 0.29, 0.07);

  A.DuelCore = {
    V3, TWO, ROUND, TOUCH, apart, peopleCreate, peopleStep, clipsCreate, clipsPacket, clipView, boxFlag,
    roundCreate, roundBegin, roundStep, screen, create, packet, step, touches, start, stop, allowed, beatScale,
  };
})();
