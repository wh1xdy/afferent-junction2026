// The fire follows the body. Logic only: world.js and the breathing task draw what this leaves in the visual state.
// Live heartbeat: the lantern flame and the light around it beat at a real pulse, from the finger clips through the gate
// of breathing.js (live, not simulated, a finger in the clip, quality 0.3 or more) or from a trusted camera pulse with a
// quality of 0.3 or more. The fire takes up a pulse whenever one appears, also mid-session (clips put on late, back on
// after a pause, or the camera pulse becoming trusted): the first beats are stronger and one ring of light leaves the
// lantern. When the reading goes, the beat stops within a second. Without a real pulse the flame only breathes slowly and
// never beats on a guess. In a simulation (a Developer day profile or the autoplay story) the simulated pulse may move the
// flame, but it never counts as a reading here.
// The display follows the body even in a session whose pulse is locked to the simulator; the record never does (engine.js
// keeps such a session simulated to its end, one source per session).
// Calm response: in calm mode and in the breathing task the aurora and the lantern glow grow as the measured breathing
// pace nears the guide and as RMSSD rises above this session's own start value, never against a fixed number, and the
// flame steadies as the pulse falls below the session's start. The finger sensor's breathing value covers its last 40 s,
// so it is smoothed slowly and treated as a pace. Visual only: no numbers, no words, nothing recorded, nothing sent.
// A soft heartbeat vibration (Settings, "Heartbeat touch": Off, Soft, Medium, Strong) plays with a real pulse in calm
// moments, and more softly on the plain start screen while nothing is over it (homeTouch below).
(() => {
  const { clamp, ema, median } = A;
  const MIN_QUALITY = 0.3, GUIDE = 6, LOST_S = 3, START_N = 5, GREET_S = 5, SWELL_S = 2.6, OTHER_HAP_S = 0.3;
  // "Heartbeat touch" in Settings (A.config.heartLevel, main.js): the strength of AfferentHaptics.beat on the start screen
  // and in a session, each level one step of 0.2 above the last, the start screen one step below a session. Strong is the
  // plugin's full beat (lub 0.9, dub 0.6): clearly felt, still one low soft thud and a quieter one, never a buzz.
  // The router makes each a quarter softer at night. Above FAST_BPM only every other beat is felt.
  const LEVELS = { off: null, soft: { home: 0.55, session: 0.75 }, medium: { home: 0.75, session: 0.9 }, strong: { home: 0.95, session: 1 } };
  const FAST_BPM = 140;
  const level = () => LEVELS[A.config?.heartLevel] === undefined ? LEVELS.soft : LEVELS[A.config.heartLevel];
  const RATE_TAU = 8, RMSSD_TAU = 8, PULSE_TAU = 6, GLOW_TAU = 2.5, HRV_SPAN = 0.3, SETTLE_SPAN = 6, BREATHE_S = 10;
  const pos = x => Number.isFinite(x) && x > 0 ? x : null;
  const plausible = bpm => bpm != null && bpm >= 40 && bpm <= 150;
  const rm = () => !!A.config?.reducedMotion;
  const smooth = x => x * x * (3 - 2 * x);

  // The pulse of one heartbeat: a quick rise, a soft fall, and a smaller second sound (lub-dub).
  const bump = x => x < 0 ? 0 : x < 0.06 ? smooth(x / 0.06) : Math.exp(-(x - 0.06) / 0.14);
  const lubDub = (since, bpm) => clamp(bump(since) + 0.5 * bump(since - Math.min(0.26, 0.4 * 60 / bpm)), 0, 1);

  // A session that is a simulation on purpose. The simulator switch is on by default, so it alone is not one.
  const simulation = s => !!s && !s.done && (s.profile !== 'live' || !!s.auto);
  // Calm mode and the breathing task (also the endless one at night). Measurement tasks are never calm moments.
  const calmMoment = s => !!s && !s.done && (s.phase === 'walk' || s.phase === 'game')
    && (s.game?.id === 'breath' || s.gameMode === 'calm' || (s.phase === 'walk' && s.mode === 'calm'));

  // The finger frame through the gate of breathing.js. Display only, so it is read whatever the session's pulse lock.
  const finger = now => {
    const B = A.Breathing, f = B ? A.Sensors.fingerFrame(now) : null, r = f ? B.reading(f) : null;
    return r ? { rate: r.rate, pulse: plausible(r.pulse) ? r.pulse : null, rmssd: pos(f.rmssd_ms) } : null;
  };
  const camera = now => {
    const c = A.Sensors?.cameraPulse?.(now);
    return c && plausible(c.bpm) && c.quality != null && c.quality >= MIN_QUALITY ? c.bpm : null;
  };

  const st = {
    s: undefined, bpm: null, phase: 0, lubAt: -9, amp: 0, real: false, sim: false, lastRealAt: -Infinity, greetAt: -Infinity, ring: false, had: false,
    rate: null, rmssd: null, pulse: null, starts: { rmssd: [], pulse: [] }, rmssd0: null, pulse0: null, next: -Infinity,
    level: null, glow: 0, settle: 0, k: 0, beat: 0, breathe: 0, swell: 0, lubs: 0, otherHapAt: -9, own: false,
  };
  const live = A.Biofeedback = { level: null, beat: false, calm: false };

  const reset = s => {
    Object.assign(st, { s, rate: null, rmssd: null, pulse: null, starts: { rmssd: [], pulse: [] }, rmssd0: null, pulse0: null, next: -Infinity, level: null });
  };

  // Every other vibration of the app; the heartbeat keeps out of their way.
  A.bus.on('haptic', () => { if (!st.own) st.otherHapAt = A.now(); });
  // One heartbeat, the "heart" word of the haptics router (haptics.js): AfferentHaptics.beat, one pattern on iOS and on
  // Android so the two halves never drift apart (a lub and a quieter dub); a short soft lub-dub where the plugin is missing.
  // strength is the plugin's (the router's heart is HEART * k). Returns whether it played.
  const vibrate = strength => {
    st.own = true;
    try { return !!A.Haptics?.play('heart', strength / (A.Haptics.HEART || 0.6)); } catch { return false; } finally { st.own = false; }
  };

  // The plain start screen: nothing over it (a sheet, a page, a menu, the check-in, the QR sheets, onboarding, the clip
  // check), the kindle neither held nor lit (its own swell plays then), no text field in use, the app in front. Read from
  // the page at each beat, so no other file has to report it, and the touch comes back by itself once it is plain again.
  // Only what shows counts: a menu left open inside a closed page does not hold the touch back.
  const BUSY = ['#start.off', '#phone.card-open', '[aria-modal="true"]:not(.hidden):not([hidden])', '[role="menu"]:not(.hidden):not([hidden])',
    '.ci:not(.hidden)', '.qx', '#begin.holding', '#begin.lit'].join(', ');
  const NOT_TEXT = /^(checkbox|radio|range|button|submit|reset|color|file|image|hidden)$/i;
  const typing = el => !!el && (el.isContentEditable || el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && !NOT_TEXT.test(el.type || '')));
  const plainHome = () => {
    const d = typeof document !== 'undefined' ? document : null;
    if (!d) return true;
    if (d.hidden || typing(d.activeElement)) return false;
    try { return ![...(d.querySelectorAll?.(BUSY) || [])].some(el => !el.closest?.('.hidden, [hidden]')); } catch { return false; }
  };
  const homeTouch = () => !A.session && plainHome() && !(st.bpm > FAST_BPM && st.lubs % 2);

  const sample = (list, x) => { if (x != null && list.length < START_N) list.push(x); return list.length >= START_N ? median(list) : null; };
  const follow = (cur, x, dt, tau) => x == null ? null : cur == null ? x : ema(cur, x, dt, tau);

  const Heartbeat = A.Heartbeat = {
    st, lubDub, simulation, calmMoment, plainHome, GUIDE, LEVELS, FAST_BPM,

    // Once a frame, in a session (engine.js) or on the home screen (main.js, s = null). Returns whether a beat landed now.
    step(now, dt, s = null) {
      if (s !== st.s) reset(s);
      const fr = finger(now), cam = camera(now), real = fr?.pulse ?? cam;
      const p = real == null && simulation(s) ? A.Sensors.pulse(now) : null, sim = p?.source === 'simulated' && plausible(p.bpm) ? p.bpm : null;
      const bpm = real ?? sim;
      if (real != null) {
        if (now - st.lastRealAt > LOST_S) { st.greetAt = now; st.ring = true; }
        st.lastRealAt = now;
      }
      st.real = real != null; st.sim = real == null && sim != null;

      // A pulse that appears, or comes back, beats at once. While there is none no new beat starts; the last one fades.
      let lub = false;
      if (bpm != null && !st.had) st.phase = 1;
      st.had = bpm != null;
      if (bpm != null) st.bpm = st.bpm == null ? bpm : ema(st.bpm, bpm, dt, 1.5);
      st.amp = ema(st.amp, bpm != null ? 1 : 0, dt, bpm != null ? 0.35 : 0.4);
      if (bpm == null && st.amp < 0.005) { st.amp = 0; st.bpm = null; }
      if (bpm != null) {
        st.phase += dt * st.bpm / 60;
        if (st.phase >= 1) { st.phase -= Math.floor(st.phase); lub = true; st.lubAt = now; st.lubs++; }
      }
      const g = clamp((now - st.greetAt) / GREET_S, 0, 1), sw = clamp((now - st.greetAt) / SWELL_S, 0, 1);
      st.k = st.amp * (1 + (1 - g) * (1 - g)) * (rm() ? 0.5 : 1);
      st.beat = st.bpm != null && st.k > 0 ? st.k * lubDub(now - st.lubAt, st.bpm) : 0;
      st.breathe = (1 - st.amp) * (0.5 - 0.5 * Math.cos(2 * Math.PI * now / BREATHE_S)) * (rm() ? 0.5 : 1);
      st.swell = sw < 1 ? Math.sin(Math.PI * sw) : 0;
      if (lub && st.real && st.ring) { st.ring = false; st.greetAt = now; A.World?.hooks?.heartRing?.(1); }

      // The calm response, from real readings only.
      // The setting "Breathing pace" off: the measured breathing does not move the scene either.
      const rate = A.config?.breathFeedback !== false ? fr?.rate ?? null : null, rmssd = fr?.rmssd ?? null;
      st.rate = follow(st.rate, rate, dt, RATE_TAU);
      st.rmssd = follow(st.rmssd, rmssd, dt, RMSSD_TAU);
      st.pulse = follow(st.pulse, real, dt, PULSE_TAU);
      if (now >= st.next) {
        st.next = now + 1;
        st.rmssd0 ??= sample(st.starts.rmssd, rmssd);
        st.pulse0 ??= sample(st.starts.pulse, real);
      }
      const guide = pos(s?.game?.fb?.guide) ?? GUIDE;
      const near = st.rate == null ? null : A.Breathing.closeness(st.rate, guide);
      const hrv = st.rmssd == null || st.rmssd0 == null ? null : clamp((st.rmssd / st.rmssd0 - 1) / HRV_SPAN, 0, 1);
      const settle = st.pulse == null || st.pulse0 == null ? null : clamp((st.pulse0 - st.pulse) / SETTLE_SPAN, 0, 1);
      const target = near == null && hrv == null ? null : clamp(0.65 * (near ?? 0) + 0.55 * (hrv ?? 0), 0, 1);
      st.level = target == null ? null : st.level == null ? target : ema(st.level, target, dt, GLOW_TAU);
      const calm = calmMoment(s);
      st.glow = ema(st.glow, calm ? st.level ?? 0 : 0, dt, GLOW_TAU);
      st.settle = ema(st.settle, calm ? settle ?? 0 : 0, dt, GLOW_TAU);
      if (st.glow < 1e-4 && !(calm && st.level)) st.glow = 0;
      if (st.settle < 1e-4 && !(calm && settle)) st.settle = 0;

      live.beat = st.real; live.calm = calm && target != null;
      live.level = target == null ? null : calm ? st.glow : 0;

      // The touch: one lub-dub per real beat, never a simulated one; in a session in calm moments (in the breathing task on the
      // exhale), on the start screen more softly while it is plain. Gated by "Heartbeat touch" here and "Vibration" in the router.
      const lv = level();
      if (lub && st.real && lv && now - st.otherHapAt > OTHER_HAP_S) {
        if (s ? calm && !(s.game?.id === 'breath' && s.orb?.inhale !== false) : homeTouch()) vibrate(s ? lv.session : lv.home);
      }
      return { lub, beating: st.bpm != null };
    },

    // One beat at the level just picked in Settings, as the start screen will play it (main.js, on a tap). Nothing when it is
    // Off or Vibration is off. Returns whether it played.
    sample() { const lv = level(); return !!lv && vibrate(lv.home); },

    // Writes the beat, the slow breath and the calm glow onto the visual state; `flame` is the flame without them.
    paint(V, flame = 1) {
      const b = st.beat, br = st.breathe, g = st.glow, sw = st.swell, still = !rm();
      V.flame = flame * (1 + 0.28 * b + 0.05 * br) * (1 - 0.06 * st.settle);
      V.lanternBright *= 1 + 0.6 * b + 0.06 * br + 0.35 * g + 0.35 * sw;
      V.lanternRadius *= 1 + (still ? 0.12 * b + 0.35 * sw : 0) + 0.04 * br + 0.45 * g;
      V.bodyGlow = g; V.settle = st.settle;
    },
  };
})();
