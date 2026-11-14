// The touch of the whole app: one small vocabulary, one router, one switch (Settings, "Vibration").
// Every vibration goes through A.Haptics, which picks the best way there is on this device:
//   1. AfferentHaptics, the app's own plugin: Core Haptics on iOS (ios/App/App/AfferentHaptics.swift),
//      VibrationEffect on Android (AfferentHapticsPlugin.kt), with the patterns designed for each word below,
//   2. the Capacitor Haptics plugin (impact, selection, notification), only when the own plugin is missing,
//   3. navigator.vibrate (Android browsers; iOS has none), 4. nothing.
// No other file vibrates on its own; demo/tests/haptics.test.js keeps it that way.
//
// The vocabulary, one word per kind of moment:
//   touch     a soft round tap              finger down, a grab, a neutral answer, a tap that only acknowledges
//   tick      a quiet crisp detent          a step, a count, a ratchet, a choice in a list
//   hit       crisp but light               a catch, a match, a correct answer
//   bright    a hit with a small sparkle    a perfect catch or landing
//   miss      soft and dull                 a wrong tap, a rough landing; never a punishment
//   land      a rounder, fuller thud        a landing, a deep bell, a shutter thrown open, an orb arriving
//   rise      a short swell into a tap      a step up in skill, a fever, light coming back to the world
//   success   the kindle's reward           a round, a pair or a pour done; the lantern lit
//   complete  a fuller success that builds  the end of a game, the dawn
//   rhythm    a soft round beat             count-ins and the beats of rhythm games
//   heart     a lub-dub                     the live heartbeat (heartbeat.js), through AfferentHaptics.beat
// Continuous: hold (the kindle's swell), drag (a soft hum that follows progress while pulling or pouring),
// breath (a slow swell over the inhale, a fade over the exhale, timed by the breath guide).
// Calm mode and night play softer and rounder, wake and fatigue a little crisper, reduced motion softer and fewer.
(() => {
  const clamp = A.clamp;
  const VOCAB = {
    touch: { feel: 'a soft round tap', lane: 'tap', prio: 1, cap: [['impact', 'LIGHT']], vib: [7] },
    tick: { feel: 'a quiet crisp detent', lane: 'tick', prio: 0, cap: [['select']], vib: [5] },
    hit: { feel: 'crisp but light', lane: 'impact', prio: 2, cap: [['impact', 'MEDIUM']], vib: [12] },
    bright: { feel: 'a hit with a small sparkle', lane: 'impact', prio: 2, cap: [['impact', 'MEDIUM'], ['select', null, 45]], vib: [12, 40, 5] },
    miss: { feel: 'soft and dull, never a punishment', lane: 'impact', prio: 2, cap: [['impact', 'LIGHT']], vib: [9] },
    land: { feel: 'a rounder, fuller thud', lane: 'impact', prio: 2, cap: [['impact', 'HEAVY']], vib: [20] },
    rise: { feel: 'a short swell into a tap', lane: 'reward', prio: 3, hush: 0.25, cap: [['impact', 'LIGHT'], ['impact', 'MEDIUM', 140]], vib: [6, 50, 9, 50, 14] },
    success: { feel: 'a tap, a warm bloom, a brighter tap (the kindle)', lane: 'reward', prio: 3, hush: 0.35, cap: [['note', 'SUCCESS']], vib: [10, 70, 14, 70, 22] },
    complete: { feel: 'a swell that builds, then a fuller success and an afterglow', lane: 'reward', prio: 4, hush: 1.1, cap: [['impact', 'LIGHT'], ['note', 'SUCCESS', 180]], vib: [6, 60, 10, 60, 14, 90, 24] },
    rhythm: { feel: 'a soft round beat', lane: 'rhythm', prio: 1, cap: [['impact', 'LIGHT']], vib: [8] },
    heart: { feel: 'a soft lub-dub', lane: 'heart', prio: 1, cap: [['impact', 'LIGHT'], ['impact', 'LIGHT', 150]], vib: [8, 140, 5] },
  };
  // Older names, kept so a branch that still uses them is not silent. The code in this repo uses the words above.
  const ALIAS = { light: 'touch', medium: 'hit', heavy: 'land' };
  // Shortest gap between two of the same lane (s), and at most BURST one-shots in BURST_S whatever the lane:
  // a fast drag over many cells or a run of taps stays a texture, never a buzz.
  const GAP = { tap: 0.05, tick: 0.055, impact: 0.08, reward: 0.2, rhythm: 0.1, heart: 0.25 };
  const BURST = 8, BURST_S = 0.5, KEY = 'afferent.haptics';
  const q = x => Math.round(x * 20) / 20;
  const rm = () => !!A.config?.reducedMotion;

  const read = () => { try { const v = localStorage.getItem(KEY); return v == null || JSON.parse(v) !== false; } catch { return true; } };
  const st = { on: read(), last: {}, burst: [], hushPrio: -1, hushUntil: -9, timers: new Set(), sel: false, selEnd: 0, drag: null, warm: false, caps: { asked: false, ok: null, continuous: null } };
  const H = {};

  const plugins = () => { const C = window.Capacitor; return C?.isNativePlatform?.() ? C.Plugins || null : null; };
  // The app's own plugin, unless it has answered that the hardware cannot play it (an iPad has no Core Haptics).
  // It is asked once, the first time it is found, so the answer is there before the first hold.
  const own = () => {
    const P = plugins()?.AfferentHaptics;
    if (!P || typeof P.play !== 'function') return null;
    probe(P);
    return st.caps.ok !== false ? P : null;
  };
  function probe(P) {
    if (st.caps.asked) return;
    st.caps.asked = true;
    Promise.resolve(P.available?.()).then(r => {
      if (r && r.haptics === false) st.caps.ok = false;
      st.caps.continuous = r ? (r.continuous ?? r.haptics ?? null) : null;
    }).catch(() => {});
  }
  const backend = () => own() ? 'afferent' : plugins()?.Haptics ? 'capacitor' : typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function' ? 'vibrate' : 'none';
  // Continuous patterns need the own plugin; on Android also a motor with amplitude control.
  const smooth = () => { const P = own(); return !!P && typeof P.dragStart === 'function' && st.caps.continuous !== false; };

  // Softer in calm and at night, a little crisper when waking. gain scales intensity, sharp shifts sharpness (-1..1).
  const context = () => {
    const s = A.session, cfg = A.config || {}, live = !!s && !s.done;
    const mode = live ? (s.gameMode || s.mode) : null, night = live ? !!s.night : !!A.night?.();
    let gain = 0.9, sharp = 0;
    if (mode === 'calm' || mode === 'rest') { gain *= 0.78; sharp -= 0.1; }
    else if (mode === 'wake' || mode === 'fatigue') { gain *= 1.12; sharp += 0.08; }
    if (night) { gain *= cfg.quietNight === false ? 0.85 : 0.72; sharp -= 0.08; }
    if (rm()) { gain *= 0.85; sharp -= 0.06; }
    return { gain: clamp(gain, 0.3, 1), sharp: clamp(sharp, -0.3, 0.15) };
  };

  const later = (fn, ms) => {
    const id = setTimeout(() => { st.timers.delete(id); fn(); }, ms);
    st.timers.add(id);
  };
  const quiet = p => Promise.resolve(p).catch(() => {});

  const STYLE = ['LIGHT', 'MEDIUM', 'HEAVY'];
  const capPlay = (name, gain) => {
    const Hp = plugins()?.Haptics;
    if (!Hp) return;
    const down = gain < 0.7 ? 1 : 0;
    const one = ([kind, arg]) => {
      if (kind === 'select') {
        if (!st.sel) { st.sel = true; quiet(Hp.selectionStart?.()); }
        quiet(Hp.selectionChanged?.());
        clearTimeout(st.selEnd); st.selEnd = setTimeout(() => { st.sel = false; quiet(Hp.selectionEnd?.()); }, 400);
      } else if (kind === 'note') quiet(Hp.notification?.({ type: arg }));
      else quiet(Hp.impact?.({ style: STYLE[Math.max(0, STYLE.indexOf(arg) - down)] }));
    };
    for (const step of VOCAB[name].cap) step[2] > 0 ? later(() => one(step), step[2]) : one(step);
  };
  const vibPlay = (name, gain) => {
    try { navigator.vibrate(VOCAB[name].vib.map((ms, i) => i % 2 ? ms : Math.max(3, Math.round(ms * (0.5 + 0.5 * gain))))); } catch {}
  };

  const send = (name, k, sharp0) => {
    const c = context(), gain = q(clamp(c.gain * k, 0.1, 1)), sharp = q(clamp(c.sharp + sharp0, -0.5, 0.5)), b = backend();
    if (b === 'afferent') {
      const P = own();
      if (name === 'heart') {
        // The heartbeat's own pattern when the plugin has it; it may refuse during a hold, and then nothing plays.
        if (typeof P.beat === 'function') quiet(P.beat({ strength: clamp(0.6 * gain / 0.9, 0.1, 1) }));
        else capPlay(name, gain);
        return;
      }
      Promise.resolve(P.play({ name, gain, sharp })).then(r => { if (r && r.played === false) capPlay(name, gain); }, () => capPlay(name, gain));
    } else if (b === 'capacitor') capPlay(name, gain);
    else if (b === 'vibrate') vibPlay(name, gain);
  };

  // One word of the vocabulary. opt: a strength (0..1.2) or { k, sharp }. Returns whether it played.
  const play = (name, opt) => {
    name = ALIAS[name] || name;
    const v = VOCAB[name];
    if (!v || !st.on) return false;
    const t = H.clock(), k = typeof opt === 'number' ? opt : opt?.k ?? 1, sharp = typeof opt === 'object' && opt ? opt.sharp || 0 : 0;
    const gap = GAP[v.lane] * (rm() && v.lane === 'tick' ? 2 : 1);
    if (t - (st.last[v.lane] ?? -9) < gap) return false;
    if (v.prio < st.hushPrio && t < st.hushUntil) return false;
    st.burst = st.burst.filter(x => t - x < BURST_S);
    if (st.burst.length >= BURST && v.prio < 3) return false;
    st.last[v.lane] = t; st.burst.push(t);
    if (v.hush) { st.hushPrio = v.prio; st.hushUntil = t + v.hush; }
    A.bus.emit('haptic', name);
    try { send(name, k, sharp); } catch {}
    return true;
  };
  // A few words in time: [[name, ms, strength?], ...].
  const seq = list => { for (const [n, ms, k] of list.slice(0, 6)) ms > 0 ? later(() => play(n, k), ms) : play(n, k); };
  // Steps along a path: each step a little fuller, the last one lands.
  const ladder = (i, n) => play(i >= n ? 'land' : 'hit', 0.55 + 0.4 * clamp(i / Math.max(1, n), 0, 1));

  // A soft hum while pulling, pouring or lifting; level (0..1) is the progress and sets its strength. null ends it.
  // Without continuous haptics (or with reduced motion) it is a tick at every eighth (quarter) of the way.
  const drag = level => {
    if (level == null || level === false) { endDrag(); return; }
    if (!st.on) return;
    level = clamp(level, 0, 1);
    const t = H.clock(), P = smooth() && !rm() ? own() : null, steps = rm() ? 4 : 8, step = Math.floor(level * steps + 1e-6);
    let d = st.drag;
    if (!d) {
      d = st.drag = { level, step, sentAt: t, native: !!P };
      if (P) {
        const c = context();
        A.bus.emit('haptic', 'drag');
        Promise.resolve(P.dragStart({ level, gain: q(c.gain), sharp: q(c.sharp) })).then(r => { if (r && r.played === false && st.drag === d) d.native = false; }, () => { if (st.drag === d) d.native = false; });
      }
      return;
    }
    if (d.native && P) {
      if (Math.abs(level - d.level) >= 0.02 && t - d.sentAt >= 0.05) { d.level = level; d.sentAt = t; quiet(P.dragMove({ level })); }
    } else if (step !== d.step) { d.step = step; play('tick', 0.8); }
  };
  const endDrag = () => {
    const d = st.drag;
    st.drag = null;
    if (d?.native) quiet(own()?.dragStop?.());
  };

  // The breath guide: 'in' swells over the inhale, 'out' fades at the turn. seconds is how long that half lasts.
  // Without continuous haptics: a tick for every second of the inhale, a touch at the turn.
  const breath = (phase, seconds) => {
    if (!st.on) return;
    const P = smooth() ? own() : null, c = context();
    if (P && typeof P.breath === 'function') {
      A.bus.emit('haptic', 'breath');
      // Always as soft as calm mode, wherever the breathing happens.
      quiet(P.breath({ phase, durationMs: Math.round(seconds * 1000), gain: q(Math.min(c.gain, 0.7)), sharp: q(Math.min(c.sharp, -0.1)) }));
      return;
    }
    if (phase === 'in') for (let i = 0; i < Math.min(6, Math.floor(seconds)); i++) i ? later(() => play('tick'), i * 1000) : play('tick');
    else play('touch', 0.8);
  };

  // The kindle (gui/shell.js): its own tuned swell and success, played exactly as they were designed.
  const hold = (ms, from) => {
    const P = own();
    if (!st.on || !P || typeof P.holdStart !== 'function') return false;
    warm(true);
    A.bus.emit('haptic', 'hold');
    quiet(P.holdStart({ durationMs: ms, from }));
    return true;
  };
  const release = () => { quiet(own()?.holdStop?.()); };
  const lit = () => {
    if (!st.on) return false;
    const P = own();
    if (!P || typeof P.success !== 'function') return play('success');
    A.bus.emit('haptic', 'success');
    Promise.resolve(P.success()).catch(() => capPlay('success', 1));
    return true;
  };

  // Keeps the Core Haptics engine running during a session, so the first tap of a game is not late.
  const warm = on => {
    if (on === st.warm) return;
    st.warm = on;
    quiet(own()?.warm?.({ on }));
  };
  const stopContinuous = () => { endDrag(); quiet(own()?.stopAll?.()); };
  const stop = () => { for (const id of st.timers) clearTimeout(id); st.timers.clear(); stopContinuous(); };
  const setEnabled = on => {
    st.on = !!on;
    try { localStorage.setItem(KEY, JSON.stringify(st.on)); } catch {}
    if (!st.on) stop();
  };

  // Every continuous pattern belongs to one phase of a session: a new phase ends it.
  A.bus.on('segment', () => { warm(true); stopContinuous(); });
  A.bus.on('sessionEnd', () => { stop(); warm(false); });
  A.bus.on('home', () => { stop(); warm(false); });
  if (typeof document !== 'undefined') document.addEventListener?.('visibilitychange', () => { if (document.hidden) stop(); });

  // The short form the games use (J.hap): hap('hit'), hap.seq([...]), hap.drag(level), hap.breath('in', 4).
  const hap = (name, ...a) => (name === 'seq' ? seq(...a) : name === 'ladder' ? ladder(...a) : play(name, ...a));
  Object.assign(hap, { play, seq, ladder, drag, breath, stop });

  A.Haptics = Object.assign(H, {
    VOCAB, ALIAS, GAP, hap, play, seq, ladder, drag, breath, hold, release, lit, stop, warm, backend, smooth, context, setEnabled,
    clock: () => (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000,
    // For the tests: forget lanes, hush and the plugin's answer.
    reset() { st.last = {}; st.burst = []; st.hushPrio = -1; st.hushUntil = -9; st.drag = null; st.warm = false; st.caps = { asked: false, ok: null, continuous: null }; },
  });
  // The Settings switch ("Vibration"), on unless it was turned off; it is kept on this phone only.
  Object.defineProperty(H, 'on', { get: () => st.on, enumerable: true });
  own();
})();
