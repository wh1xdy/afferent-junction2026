// Heart Duel: game logic. No DOM, no timers, no clock of its own: every function gets the
// time it needs as an argument. Loaded by node --test (game.test.js) and inlined into
// index.html by build.sh. Edit this file, then run ./build.sh.
//
// Rule that everything here serves: a number is only ever handed to the page when a
// heartbeat packet confirmed it in the last 5 s. 0 means "no reading" and never comes out.
const HeartDuel = (() => {
  'use strict';

  const STALE_MS = 5000;          // no confirming beat for this long -> grey out
  const FORGET_MS = 30000;        // stale this long -> back to "put the clip on"
  const FROZEN_HINT_MS = 20000;   // value identical this long -> ask "clip still on?"
  const SYNC_WINDOW_BPM = 3;
  const SYNC_GOAL_MS = 10000;
  const SYNC_DRAIN = 2;           // out of sync drains the meter twice as fast as it fills
  const CALM_ROUND_MS = 30000;
  const CALM_MIN_COVERAGE = 0.5;  // a player needs a live reading for half the round
  const MAX_STEP_MS = 1000;       // a frame longer than this (hidden tab) is not game time
  const TRACE_MS = 30000;
  const JUMP_SPAN_MS = 5000;      // a "jump" is a rise that happens within this long
  const JUMP_MIN_BPM = 4;
  const GUESS_TOLERANCE_MS = 2000;

  const isBpm = (v) => typeof v === 'number' && Number.isFinite(v) && v > 0;

  // ── sensor packets ────────────────────────────────────────────────────────────────
  // AFF1 is [finger 1 bpm, finger 2 bpm, breaths/min, RMSSD ms]. The hub sends it on every
  // locked heartbeat of either finger and whenever breathing or HRV change, and it keeps a
  // finger's last BPM in the packet after the clip comes off. So a packet arriving is not
  // proof that a given byte is fresh. What is: a notification whose breathing and HRV bytes
  // did not change was caused by a heartbeat. It is credited to the finger whose byte
  // changed, or to both when neither changed (the hub does not say which finger beat).
  function createTracker() {
    const player = () => ({ value: null, beatAt: null, changedAt: null });
    return { prev: null, players: [player(), player()], breath: null, hrv: null, packetAt: null };
  }

  function validPacket(bytes) {
    return Array.isArray(bytes) && bytes.length >= 4 &&
      bytes.slice(0, 4).every((b) => Number.isInteger(b) && b >= 0 && b <= 255);
  }

  // kind: 'notify' (live notification) | 'read' | 'snapshot' (a held value: baseline only).
  function trackerPacket(tr, bytes, nowMs, kind) {
    if (!validPacket(bytes)) return tr;
    const b = bytes.slice(0, 4);
    const prev = tr.prev;
    const beat = kind === 'notify' && prev !== null && b[2] === prev[2] && b[3] === prev[3];
    for (let i = 0; i < 2; i++) {
      const p = tr.players[i];
      if (b[i] === 0) { p.value = null; p.beatAt = null; p.changedAt = null; continue; }
      const changed = prev === null || prev[i] !== b[i];
      const otherChanged = prev !== null && prev[1 - i] !== b[1 - i];
      if (changed || p.changedAt === null) p.changedAt = nowMs;
      p.value = b[i];
      if (beat && (changed || !otherChanged)) p.beatAt = nowMs;
    }
    tr.breath = b[2] === 0 ? null : b[2];
    tr.hrv = b[3] === 0 || b[3] === 255 ? null : b[3];   // 255 = above 254 ms, not a reading
    tr.prev = b;
    tr.packetAt = nowMs;
    return tr;
  }

  // What the page may show for player i (0 or 1). `bpm` is set only in state 'live'.
  //   offline   : no link to the sensor
  //   no-finger : linked, but no heartbeat has confirmed a value (show "put the clip on")
  //   stale     : had a value, no confirming beat for 5 s (lastBpm is for greyed-out display)
  //   live      : confirmed within 5 s
  function playerView(tr, i, nowMs, connected) {
    if (!connected) return { state: 'offline', bpm: null };
    const p = tr.players[i];
    if (p.value === null || p.beatAt === null) return { state: 'no-finger', bpm: null };
    const ageMs = nowMs - p.beatAt;
    if (ageMs > FORGET_MS) return { state: 'no-finger', bpm: null };
    if (ageMs > STALE_MS) return { state: 'stale', bpm: null, lastBpm: p.value, ageMs };
    const unchangedMs = nowMs - p.changedAt;
    return { state: 'live', bpm: p.value, ageMs, unchangedMs, frozen: unchangedMs >= FROZEN_HINT_MS };
  }

  // Breathing rate and HRV: only while linked and at least one pulse is live.
  function extrasView(tr, nowMs, connected) {
    const anyLive = [0, 1].some((i) => playerView(tr, i, nowMs, connected).state === 'live');
    if (!anyLive) return { breath: null, hrv: null };
    return { breath: tr.breath, hrv: tr.hrv };
  }

  // ── heart animation ───────────────────────────────────────────────────────────────
  // phase counts beats (fractional). One call per frame; `beats` is how many whole beats
  // started during the step. No reading -> the heart does not move.
  function advanceBeat(phase, bpm, dtMs) {
    if (!isBpm(bpm) || !(dtMs > 0)) return { phase, beats: 0 };
    const next = phase + (bpm / 60000) * Math.min(dtMs, MAX_STEP_MS);
    return { phase: next, beats: Math.floor(next) - Math.floor(phase) };
  }

  // ── mode 1: SYNC ──────────────────────────────────────────────────────────────────
  function syncCreate() {
    return { progressMs: 0, inSync: false, won: false, diff: null };
  }

  function syncStep(s, bpm1, bpm2, dtMs) {
    if (s.won) return s;
    const dt = Math.max(0, Math.min(dtMs, MAX_STEP_MS));
    const both = isBpm(bpm1) && isBpm(bpm2);
    const diff = both ? Math.abs(bpm1 - bpm2) : null;
    const inSync = both && diff <= SYNC_WINDOW_BPM;
    const progressMs = inSync
      ? Math.min(SYNC_GOAL_MS, s.progressMs + dt)
      : Math.max(0, s.progressMs - dt * SYNC_DRAIN);
    return { progressMs, inSync, won: progressMs >= SYNC_GOAL_MS, diff };
  }

  // ── mode 2: CALM ──────────────────────────────────────────────────────────────────
  function calmCreate() {
    const player = () => ({ bpmMs: 0, liveMs: 0 });
    return { elapsedMs: 0, done: false, players: [player(), player()] };
  }

  function calmStep(c, bpm1, bpm2, dtMs) {
    if (c.done) return c;
    const dt = Math.max(0, Math.min(dtMs, MAX_STEP_MS, CALM_ROUND_MS - c.elapsedMs));
    const players = [bpm1, bpm2].map((bpm, i) => {
      const p = c.players[i];
      return isBpm(bpm) ? { bpmMs: p.bpmMs + bpm * dt, liveMs: p.liveMs + dt } : p;
    });
    const elapsedMs = c.elapsedMs + dt;
    return { elapsedMs, done: elapsedMs >= CALM_ROUND_MS, players };
  }

  // Average so far, whatever the coverage (for the running display); null without data.
  function calmAverage(c, i) {
    const p = c.players[i];
    return p.liveMs > 0 ? p.bpmMs / p.liveMs : null;
  }

  // outcome: 'win' (winner 0|1) | 'tie' | 'no-contest' (only one player had enough data,
  // nobody wins by default) | 'no-data'. Averages are compared at the one decimal shown.
  function calmResult(c) {
    const coverage = c.players.map((p) => p.liveMs / CALM_ROUND_MS);
    const averages = c.players.map((p, i) =>
      coverage[i] >= CALM_MIN_COVERAGE ? Math.round((p.bpmMs / p.liveMs) * 10) / 10 : null);
    const have = averages.map((a) => a !== null);
    let outcome, winner = null;
    if (have[0] && have[1]) {
      if (averages[0] === averages[1]) outcome = 'tie';
      else { outcome = 'win'; winner = averages[0] < averages[1] ? 0 : 1; }
    } else if (have[0] || have[1]) outcome = 'no-contest';
    else outcome = 'no-data';
    return { outcome, winner, averages, coverage };
  }

  // ── mode 3: POKER FACE ────────────────────────────────────────────────────────────
  // samples: [{ t, bpm|null }] in time order. Appends and drops what is older than 30 s.
  function tracePush(samples, t, bpm) {
    samples.push({ t, bpm: isBpm(bpm) ? bpm : null });
    while (samples.length && samples[0].t < t - TRACE_MS - 1000) samples.shift();
    return samples;
  }

  // Y range for a trace: at least 20 BPM tall, padded, on multiples of 5. null if no data.
  function traceRange(samples) {
    let lo = Infinity, hi = -Infinity;
    for (const s of samples) if (s.bpm !== null) { lo = Math.min(lo, s.bpm); hi = Math.max(hi, s.bpm); }
    if (lo === Infinity) return null;
    const mid = (lo + hi) / 2, half = Math.max(10, (hi - lo) / 2 + 3);
    return { min: Math.floor((mid - half) / 5) * 5, max: Math.ceil((mid + half) / 5) * 5 };
  }

  // The largest rise within any 5 s span that has no gap in the data, or null when no rise
  // reaches 4 BPM. fromMs = the low point just before the rise, toMs = its peak.
  function biggestRise(samples, spanMs = JUMP_SPAN_MS, minRise = JUMP_MIN_BPM) {
    let best = null;
    for (let j = 0; j < samples.length; j++) {
      if (samples[j].bpm === null) continue;
      for (let i = j - 1; i >= 0; i--) {
        if (samples[i].bpm === null || samples[j].t - samples[i].t > spanMs) break;
        const rise = samples[j].bpm - samples[i].bpm;
        if (rise >= minRise && (best === null || rise > best.rise)) {
          best = { rise, fromMs: samples[i].t, toMs: samples[j].t, fromBpm: samples[i].bpm, toBpm: samples[j].bpm };
        }
      }
    }
    return best;
  }

  // How far the guess was from the rise: 0 inside it, otherwise the distance to its nearer end.
  function guessVerdict(guessMs, jump, toleranceMs = GUESS_TOLERANCE_MS) {
    if (jump === null || typeof guessMs !== 'number') return null;
    const offMs = guessMs < jump.fromMs ? jump.fromMs - guessMs : guessMs > jump.toMs ? guessMs - jump.toMs : 0;
    return { offMs, hit: offMs <= toleranceMs };
  }

  return {
    STALE_MS, FORGET_MS, FROZEN_HINT_MS, SYNC_WINDOW_BPM, SYNC_GOAL_MS, SYNC_DRAIN, CALM_ROUND_MS,
    CALM_MIN_COVERAGE, MAX_STEP_MS, TRACE_MS, JUMP_SPAN_MS, JUMP_MIN_BPM, GUESS_TOLERANCE_MS,
    isBpm, createTracker, trackerPacket, playerView, extrasView, advanceBeat,
    syncCreate, syncStep, calmCreate, calmStep, calmAverage, calmResult,
    tracePush, traceRange, biggestRise, guessVerdict,
  };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = HeartDuel;
