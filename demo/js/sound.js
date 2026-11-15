// Room sound level: how loud the room around the patient is, so we can see whether it is a calm place to play.
// Opt-in (Settings, Sensors, "Room sound level", A.config.roomSound), off by default on the phone and in the browser,
// where turning it on asks for the microphone.
//
// Numbers only. The microphone is opened for a short window (WINDOW_S) now and then, never continuously: once soon
// after the switch is turned on or the app opens, at the session's rest moment, then every few minutes. Each window
// gives one A-weighted level per 100 ms block, computed on the phone as the samples arrive (native plugin
// AfferentSoundLevel on iOS and Android, getUserMedia in a browser). No sample leaves the analysis, nothing is
// recorded, stored, logged or sent; only the block levels in dB are kept, and only in memory.
//
// How it measures: AVAudioEngine input on iOS (ios/App/App/AfferentSoundLevel.swift), AudioRecord on Android
// (AfferentSoundLevelPlugin.kt), both with the same A-weighting filter as aweight() below. The music and ambience play
// in the web view's own audio session ('ambient'; Talk switches it to 'play-and-record', music.js), and the native
// window never touches it: it uses the app's own session, mixable, speaker kept, Bluetooth kept, and puts it back as
// it was. Talk owns the microphone while a conversation is open: no window starts then, and one that runs is stopped.
//
// What the microphone hears includes Afferent's own sound when it plays out of the phone's speaker, which would read
// as a loud room. So a window only counts when the phone's own sound cannot reach the microphone: headphones, the
// speaker with echo-cancelled input (iPhones from 2024 on), or Afferent quiet (Sound off, or audio not running).
//
// The level is approximate. Phone microphones are not calibrated, so dB here is A-weighted dBFS plus a fixed offset per
// platform (OFFSET): Android from the CDD's voice recognition sensitivity (90 dB SPL at 1 kHz gives an RMS of 2500 of
// 32767, -22.4 dBFS), iOS from typical built-in microphone levels in the default mode (a quiet bedroom around 30 to 35,
// talking at arm's length around 60), within about ±6 dB. To calibrate one phone, put it next to a sound level meter in a
// steady sound of 50 to 60 dB (a fan), compare the two and save the corrected offset as localStorage
// 'afferent.sound.offset_db'. The bands are wide on purpose: quiet below 40, normal 40 to 55, lively 55 to 65, loud above.
(() => {
  const BANDS = [[40, 'quiet'], [55, 'normal'], [65, 'lively'], [Infinity, 'loud']];
  const LOUD_DB = 55, VERY_LOUD_DB = 65;
  const WINDOW_S = 4, BLOCK_S = 0.1, MIN_BLOCKS = 20, SILENT_DBFS = -100, FLOOR_DBFS = -120;
  const HOME_EVERY_S = 300, PLAY_EVERY_S = 240, RETRY_S = 120, FRESH_S = 600, LEQ_S = 60, PRE_S = 120, KEEP = 60, CHECK_MS = 5000;
  const OFFSET = { ios: 95, android: 112.4, web: 100 };
  const OFFSET_KEY = 'afferent.sound.offset_db';
  const PLUGIN = 'AfferentSoundLevel';
  const r1 = x => Math.round(x * 10) / 10, r2 = x => Math.round(x * 100) / 100;
  const clock = () => typeof A.now === 'function' ? A.now() : 0;

  // A-weighting, near enough: the IEC 61672 poles (20.6 Hz twice, 107.7 Hz, 737.9 Hz, 12194 Hz twice) as first-order
  // sections, each prewarped through the bilinear transform so its corner lands where it should, and the whole made
  // 0 dB at 1 kHz. The 12194 Hz sections are left out when the sample rate cannot hold them. The native meters use the
  // same sections (AfferentSoundLevelMeter.swift, SoundLevelMeter.kt).
  const POLES = [['hp', 20.598997], ['hp', 20.598997], ['hp', 107.65265], ['hp', 737.86223], ['lp', 12194.217], ['lp', 12194.217]];
  const section = (kind, f, fs) => {
    const K = 2 * fs, w = K * Math.tan(Math.PI * f / fs), d = K + w;
    return kind === 'hp' ? { b0: K / d, b1: -K / d, a1: (w - K) / d } : { b0: w / d, b1: w / d, a1: (w - K) / d };
  };
  const response = (secs, f, fs) => {
    const o = 2 * Math.PI * f / fs, c = Math.cos(o), s = Math.sin(o);
    return secs.reduce((g, { b0, b1, a1 }) => g * Math.hypot(b0 + b1 * c, -b1 * s) / Math.hypot(1 + a1 * c, -a1 * s), 1);
  };
  const aweight = fs => {
    const secs = POLES.filter(([k, f]) => k === 'hp' || f < 0.45 * fs).map(([k, f]) => section(k, f, fs));
    const gain = 1 / response(secs, 1000, fs);
    return {
      sections: secs, gain,
      // samples in, weighted samples out; the filter state carries over from one call to the next
      process(xs) {
        const out = new Float64Array(xs.length);
        this.state ||= secs.map(() => ({ x1: 0, y1: 0 }));
        for (let i = 0; i < xs.length; i++) {
          let v = xs[i];
          for (let k = 0; k < secs.length; k++) {
            const q = secs[k], z = this.state[k], y = q.b0 * v + q.b1 * z.x1 - q.a1 * z.y1;
            z.x1 = v; z.y1 = y; v = y;
          }
          out[i] = v * gain;
        }
        return out;
      },
    };
  };
  const dbfs = meanSquare => meanSquare > 0 ? Math.max(FLOOR_DBFS, 10 * Math.log10(meanSquare)) : FLOOR_DBFS;
  const meanSquare = (xs, from = 0) => { let s = 0; for (let i = from; i < xs.length; i++) s += xs[i] * xs[i]; return xs.length > from ? s / (xs.length - from) : 0; };
  // A-weighted dBFS per block of samples (what the native meters return): one filter over the whole window.
  const blocks = (xs, fs, blockS = BLOCK_S) => {
    const w = aweight(fs).process(xs), n = Math.max(1, Math.round(fs * blockS)), out = [];
    for (let i = 0; i + n <= w.length; i += n) out.push(dbfs(meanSquare(w.subarray(i, i + n))));
    return out;
  };
  // One block from a snapshot of samples (the browser's analyser): a fresh filter, its first 10 ms left out.
  const snapshot = (xs, fs) => dbfs(meanSquare(aweight(fs).process(xs), Math.min(xs.length - 1, Math.round(fs * 0.01))));
  // The equivalent level: the level of the mean energy, not the mean of the levels.
  const leq = dbs => dbs.length ? 10 * Math.log10(dbs.reduce((a, d) => a + 10 ** (d / 10), 0) / dbs.length) : null;
  const band = db => db == null ? null : BANDS.find(([top]) => db < top)[1];
  const share = (dbs, over) => dbs.length ? dbs.filter(d => d >= over).length / dbs.length : null;

  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  };
  const platform = () => {
    const p = window.Capacitor?.getPlatform?.();
    return window.Capacitor?.isNativePlatform?.() && (p === 'ios' || p === 'android') ? p : 'web';
  };
  const offset = () => {
    const saved = Number(store.get(OFFSET_KEY));
    return store.get(OFFSET_KEY) != null && Number.isFinite(saved) ? saved : OFFSET[platform()];
  };
  const plugin = () => platform() === 'web' ? null : (A.plug ? A.plug(PLUGIN) : window.Capacitor?.Plugins?.[PLUGIN]) || null;
  const enabled = () => A.config?.roomSound === true;
  const hidden = () => typeof document !== 'undefined' && document.hidden === true;
  const LIVE = ['connecting', 'listening', 'speaking'];
  const talking = () => !!A.Voice?.s || LIVE.includes(A.Voice?.state);
  // Afferent makes no sound right now: Sound is off, or its audio is not running.
  const quiet = () => {
    if (A.Audio?.on === false) return true;
    const ctx = A.Music?.ctx || A.Audio?.ctx;
    return !ctx || ctx.state !== 'running';
  };

  const R = {
    BANDS, LOUD_DB, VERY_LOUD_DB, WINDOW_S, BLOCK_S, FRESH_S, LEQ_S, OFFSET, OFFSET_KEY,
    math: { section, response, aweight, dbfs, meanSquare, blocks, snapshot, leq, band, share },
    // off, waiting, measuring, own_sound, paused (Talk), denied, unsupported, error
    status: 'off', windows: [], run: null, nextAt: 0, attempts: 0,

    // A finished window of A-weighted dBFS blocks, as the meters give them, into a kept reading in dB (approx.).
    // Digitally silent blocks (a muted or interrupted input) are no measurement; too few real blocks, no window.
    accept(dbfsBlocks, now = clock()) {
      const off = offset();
      const dbs = (Array.isArray(dbfsBlocks) ? dbfsBlocks : []).filter(d => Number.isFinite(d) && d > SILENT_DBFS && d <= 0).map(d => r1(d + off));
      if (dbs.length < MIN_BLOCKS) return null;
      const w = { at: now, db: r1(leq(dbs)), dbs };
      this.windows = [...this.windows, w].slice(-KEEP);
      return w;
    },

    // The reading now: the equivalent level over the measured blocks of the last minute before the newest window,
    // while that window is at most FRESH_S old. null without one.
    reading(now = clock()) {
      if (!enabled()) return null;
      const last = this.windows[this.windows.length - 1];
      if (!last || now - last.at > FRESH_S || last.at > now + 1) return null;
      const dbs = this.windows.filter(w => w.at >= last.at - LEQ_S).flatMap(w => w.dbs), db = Math.round(leq(dbs));
      return { db, band: band(db), at: last.at };
    },
    loud(now) { return (this.reading(now)?.db ?? -Infinity) >= LOUD_DB; },
    veryLoud(now) { return (this.reading(now)?.db ?? -Infinity) >= VERY_LOUD_DB; },

    // "Room sound approx. 38 dB · quiet", the live vitals row. null when off or without a reading.
    line(now) {
      const r = this.reading(now);
      return r ? `Room sound approx. ${r.db} dB · ${r.band}` : null;
    },

    // The row under "Your room" in the signals sheet (vitals.js). None while switched off.
    rows(now = clock()) {
      if (!enabled()) return [];
      const r = this.reading(now);
      if (r) return [{ icon: 'volume_up', label: 'Room sound', value: String(r.db), lines: [`approx. dB · ${r.band}`, 'Phone microphone, nothing recorded'] }];
      const why = {
        measuring: 'Measuring for a few seconds', own_sound: 'Measured when Afferent is quiet or with headphones',
        paused: 'Paused while you talk', denied: 'Microphone is off for Afferent in Settings', unsupported: 'Not available on this phone',
      }[this.status] || 'No reading yet';
      return [{ icon: 'volume_up', label: 'Room sound', value: null, lines: [why] }];
    },

    // For the session record (record.js, context.room_sound): the windows from shortly before the start to now, as
    // numbers only. median_db is the median of the 100 ms block levels (L50), share_loud the share of them at 55 dB or more.
    session(t0, now = clock()) {
      if (!enabled()) return null;
      const ws = this.windows.filter(w => w.at >= t0 - PRE_S && w.at <= now + 1), dbs = ws.flatMap(w => w.dbs);
      if (!dbs.length) return null;
      return { median_db: Math.round(A.median(dbs)), share_loud: r2(share(dbs, LOUD_DB)), windows: ws.length };
    },

    // Switched on or off (main.js), or the app opened: on, a first window soon; off, the microphone closes and every
    // reading is forgotten.
    sync(now = clock()) {
      if (!enabled()) { this.abort(); this.windows = []; this.status = 'off'; return; }
      if (this.status === 'off' || this.status === 'denied' || this.status === 'unsupported') this.status = 'waiting';
      this.nextAt = Math.min(this.nextAt || Infinity, now + 1);
    },

    // Asked every few seconds: one window when it is due and nothing stands in the way.
    tick(now = clock()) {
      if (!enabled() || this.run || hidden() || talking() || now < this.nextAt) return null;
      return this.measure(now);
    },

    // Shortly before a session's rest moment: a fresh window if the last one is older than a minute.
    soon(now = clock()) {
      const last = this.windows[this.windows.length - 1];
      if (enabled() && (!last || now - last.at > LEQ_S) && !['denied', 'unsupported'].includes(this.status)) this.nextAt = Math.min(this.nextAt, now);
    },

    // Stop the window that runs, at once (Talk, the app hidden, switched off). Nothing of it is kept.
    abort(why) {
      if (why === 'talk' && enabled()) this.status = 'paused';
      const run = this.run;
      if (!run) return;
      run.aborted = true;
      this.run = null;
      try { run.cancel?.(); } catch {}
      if (run.native) { try { plugin()?.stop?.()?.catch?.(() => {}); } catch {} }
      if (this.status === 'measuring') this.status = 'waiting';
      this.nextAt = Math.max(this.nextAt, clock() + 10);
    },

    async measure(now = clock()) {
      const run = this.run = { aborted: false, native: false };
      this.status = 'measuring';
      this.attempts++;
      let out;
      try { out = await (plugin() ? this.nativeWindow(run) : this.webWindow(run)); }
      catch (e) { out = { status: e?.code === 'UNIMPLEMENTED' ? 'unsupported' : 'error' }; }
      if (run.aborted || this.run !== run) return null;
      this.run = null;
      const t = clock(), every = A.session && !A.session.done ? PLAY_EVERY_S : HOME_EVERY_S;
      if (out?.blocks) {
        const w = this.accept(out.blocks, t);
        this.status = w ? 'waiting' : 'error';
        this.nextAt = t + every;
        return w;
      }
      this.status = out?.status || 'error';
      this.nextAt = this.status === 'own_sound' ? t + RETRY_S : this.status === 'denied' || this.status === 'unsupported' ? Infinity : t + every;
      return null;
    },

    // A window on the phone. The plugin opens the microphone only when it cannot hear Afferent: headphones, Afferent quiet,
    // or the speaker with echo-cancelled input; otherwise it answers `skipped` with the microphone left closed.
    async nativeWindow(run) {
      const P = plugin();
      const st = await P.status();
      if (run.aborted) return null;
      if (st?.permission === 'denied') return { status: 'denied' };
      const wasQuiet = quiet();
      if (st?.route === 'external' && !wasQuiet) return { status: 'own_sound' };
      const ctx = A.Music?.ctx || A.Audio?.ctx, woke = () => { if (ctx?.state === 'running') run.loudened = true; };
      ctx?.addEventListener?.('statechange', woke);
      run.native = true;
      let r;
      try { r = await P.measure({ seconds: WINDOW_S, blockMs: BLOCK_S * 1000, quiet: wasQuiet }); }
      finally { ctx?.removeEventListener?.('statechange', woke); }
      if (run.aborted || r?.aborted) return null;
      if (r?.permission === 'denied') return { status: 'denied' };
      if (r?.skipped) return { status: 'own_sound' };
      if (r?.error || !Array.isArray(r?.blocks)) return { status: 'error' };
      // Afferent began to sound during the window (a tap starts the audio) and only its quiet kept the reading clean
      const shielded = r.route === 'headphones' || (r.route === 'speaker' && r.echo_cancelled === true);
      if (!shielded && (!wasQuiet || !quiet() || run.loudened)) return { status: 'own_sound' };
      return { blocks: r.blocks };
    },

    // A window in a browser: getUserMedia with no noise suppression or gain control, an analyser read every 100 ms.
    // Safari runs the page's music and its microphone in one audio session, so a window there waits for Afferent to be
    // quiet rather than switch that session over; elsewhere the browser's echo cancellation keeps the page's own sound out.
    async webWindow(run) {
      const md = typeof navigator !== 'undefined' && navigator.mediaDevices;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!md?.getUserMedia || !AC) return { status: 'unsupported' };
      if (navigator.audioSession && !quiet()) return { status: 'own_sound' };
      let stream;
      try { stream = await md.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: false, autoGainControl: false } }); }
      catch (e) { return { status: e?.name === 'NotAllowedError' || e?.name === 'SecurityError' ? 'denied' : 'unsupported' }; }
      const tracks = stream.getTracks(), set = tracks[0]?.getSettings?.() || {};
      let ctx = null, src = null;
      try {
        if (run.aborted) return null;
        if (set.echoCancellation !== true && !quiet()) return { status: 'own_sound' };
        ctx = new AC();
        ctx.resume?.().catch(() => {});
        src = ctx.createMediaStreamSource(stream);
        const an = ctx.createAnalyser();
        an.fftSize = 4096;
        src.connect(an);
        const buf = new Float32Array(an.fftSize), out = [], n = Math.round(WINDOW_S / BLOCK_S);
        await new Promise(done => {
          const iv = setInterval(() => {
            if (run.aborted || out.length >= n) { clearInterval(iv); done(); return; }
            an.getFloatTimeDomainData(buf);
            out.push(snapshot(buf, ctx.sampleRate));
          }, BLOCK_S * 1000);
          run.cancel = () => { clearInterval(iv); done(); };
        });
        buf.fill(0);
        return run.aborted ? null : { blocks: out };
      } finally {
        tracks.forEach(t => { try { t.stop(); } catch {} });
        try { src?.disconnect(); } catch {}
        try { ctx?.close(); } catch {}
      }
    },
  };
  A.RoomSound = R;

  // Talk owns the microphone: a window that runs stops, and none starts until the conversation is over.
  A.bus?.on('voice', ({ state } = {}) => {
    if (LIVE.includes(state)) R.abort('talk');
    else if (R.status === 'paused') { R.status = 'waiting'; R.nextAt = Math.max(R.nextAt, clock() + 10); }
  });
  A.bus?.on('segment', id => { if (id === 'rest') { R.soon(); R.tick(); } });
  if (typeof document !== 'undefined' && document.addEventListener) {
    document.addEventListener('visibilitychange', () => { if (document.hidden) R.abort(); else R.soon(); });
    if (typeof setInterval === 'function') setInterval(() => { if (typeof A.now === 'function') R.tick(); }, CHECK_MS);
    if (typeof addEventListener === 'function') addEventListener('load', () => { if (typeof A.now === 'function') R.sync(); });
  }
})();
