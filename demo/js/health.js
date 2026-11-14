// Apple Watch through Apple Health (iOS only). An Apple Watch sends no heart rate over Bluetooth; it saves samples in
// Apple Health, the pulse every few minutes. So this is context, never live: the last heart rate with its age, resting
// heart rate, beat-to-beat variation (SDNN, Apple's measure, not the RMSSD of the finger clips), breathing rate and last
// night's sleep. It is shown with how old it is ("Apple Watch, 12 min ago"), goes into the session record as
// context.health, and never drives the game's pulse, the heartbeat or the flame: a Health sample has no signal quality,
// and without one a pulse is not used (the rule for the finger sensor's first firmware too). Nothing is written to Health.
//
// Plugin AfferentHealth (ios/App/App/AfferentHealth.swift); on Android and in a browser it is not there and this stays off.
//   status()  -> {available, reason: null|'no_healthkit'|'no_entitlement'}
//   request() -> {ok, reason}        the read-only permission sheet (iOS shows it once; it never says what was allowed)
//   read()    -> {heart_rate: {bpm, end_ms, device}|null, heart_rate_recent: [{bpm, end_ms}], resting_hr: {bpm, end_ms, device}|null,
//                 hrv_sdnn: {ms, end_ms, device}|null, respiratory_rate: {per_min, end_ms, device}|null,
//                 sleep: {asleep_min, in_bed_min, start_ms, end_ms, device}|null, t_ms}
(() => {
  const KEY = 'afferent.health', READ_EVERY_MS = 5 * 60e3, MIN = 60e3, HOUR = 60 * MIN, DAY = 24 * HOUR;
  // Older than this, a sample is not shown or recorded: it says nothing about now.
  const MAX_AGE = { heart_rate: 6 * HOUR, resting_hr: 7 * DAY, hrv_sdnn: 7 * DAY, respiratory_rate: 7 * DAY, sleep: 36 * HOUR };
  const RANGE = { bpm: [25, 240], ms: [1, 500], per_min: [3, 60], min: [0, 24 * 60] };
  const inRange = (x, [lo, hi]) => Number.isFinite(x) && x >= lo && x <= hi ? x : null;
  const time = x => Number.isFinite(x) && x > 0 ? x : null;
  const store = {
    get() { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } },
    set(on) { try { on ? localStorage.setItem(KEY, '1') : localStorage.removeItem(KEY); } catch {} },
  };

  // One sample from the plugin, checked: a number outside its range or a missing time is no sample.
  const one = (d, key, range) => {
    if (!d || typeof d !== 'object') return null;
    const v = inRange(d[key], range), end = time(d.end_ms);
    return v == null || end == null ? null : { value: v, end_ms: end, device: typeof d.device === 'string' ? d.device : null };
  };
  const parse = d => {
    if (!d || typeof d !== 'object') return null;
    const s = d.sleep && typeof d.sleep === 'object' ? d.sleep : null, asleep = s ? inRange(s.asleep_min, RANGE.min) : null, end = s ? time(s.end_ms) : null;
    return {
      heart_rate: one(d.heart_rate, 'bpm', RANGE.bpm),
      heart_rate_recent: (Array.isArray(d.heart_rate_recent) ? d.heart_rate_recent : []).map(x => one(x, 'bpm', RANGE.bpm)).filter(Boolean),
      resting_hr: one(d.resting_hr, 'bpm', RANGE.bpm),
      hrv_sdnn: one(d.hrv_sdnn, 'ms', RANGE.ms),
      respiratory_rate: one(d.respiratory_rate, 'per_min', RANGE.per_min),
      sleep: asleep != null && end != null ? { value: asleep, in_bed_min: inRange(s.in_bed_min, RANGE.min), start_ms: time(s.start_ms), end_ms: end, device: typeof s.device === 'string' ? s.device : null } : null,
    };
  };

  const Health = A.Health = {
    plugin: null, available: null, reason: null, on: store.get(), data: null, readAt: 0, reading: null, MAX_AGE,

    // Whether this build can read Apple Health at all. null until asked, then true or false (with a reason).
    async probe() {
      if (this.available !== null) return this.available;
      const p = this.plugin || (this.plugin = A.plug('AfferentHealth') ?? null);
      if (!p) { this.available = false; this.reason = 'no_plugin'; return false; }
      try {
        const r = await p.status();
        this.available = !!r?.available; this.reason = r?.reason ?? null;
      } catch { this.available = false; this.reason = 'no_plugin'; }
      Health.render();
      return this.available;
    },

    async enable() {
      if (!(await this.probe())) return false;
      this.on = true; store.set(true);
      try {
        const r = await this.plugin.request();
        if (r && r.ok === false) { this.reason = r.reason ?? 'denied'; if (r.reason === 'no_entitlement') this.available = false; }
      } catch (e) { console.warn('health: request failed', e); }
      await this.read(true);
      return true;
    },
    disable() { this.on = false; store.set(false); this.data = null; this.readAt = 0; Health.render(); },

    // Reads the latest samples, at most every 5 minutes unless forced.
    async read(force = false) {
      if (!this.on || !(await this.probe())) return null;
      if (!force && Date.now() - this.readAt < READ_EVERY_MS) return this.data;
      if (this.reading) return this.reading;
      this.reading = (async () => {
        try { this.data = parse(await this.plugin.read()); this.readAt = Date.now(); }
        catch (e) { console.warn('health: read failed', e); }
        finally { this.reading = null; }
        Health.render();
        return this.data;
      })();
      return this.reading;
    },

    // The sample of one kind if it is young enough to show, with its age in minutes.
    latest(kind, nowMs = Date.now()) {
      const x = this.on ? this.data?.[kind] : null;
      if (!x || nowMs - x.end_ms > MAX_AGE[kind] || x.end_ms - nowMs > 5 * MIN) return null;
      return { ...x, age_min: Math.max(0, Math.round((nowMs - x.end_ms) / MIN)) };
    },

    // "Apple Watch" when the sample came from one, else "Apple Health" (another app or device that writes to it).
    label(x) { return x?.device && /watch/i.test(x.device) ? 'Apple Watch' : 'Apple Health'; },

    ago(min) {
      if (min == null) return '';
      if (min < 1) return 'just now';
      if (min < 60) return `${min} min ago`;
      const h = Math.round(min / 60);
      return h < 36 ? `${h} h ago` : `${Math.round(h / 24)} days ago`;
    },

    // context.health of the session record: the latest of each kind with its age in seconds, or null when Health is off
    // or has nothing young enough.
    context(nowMs = Date.now()) {
      if (!this.on) return null;
      const k = kind => this.latest(kind, nowMs), s = x => x ? Math.round((nowMs - x.end_ms) / 1000) : null, v = x => x ? Math.round(x.value * 10) / 10 : null;
      const hr = k('heart_rate'), rest = k('resting_hr'), hrv = k('hrv_sdnn'), br = k('respiratory_rate'), sl = k('sleep');
      if (!hr && !rest && !hrv && !br && !sl) return null;
      const watch = [hr, rest, hrv, br, sl].some(x => x && this.label(x) === 'Apple Watch');
      return {
        source: 'healthkit', device: watch ? 'apple_watch' : 'other',
        heart_rate_bpm: v(hr), heart_rate_age_s: s(hr),
        resting_heart_rate_bpm: v(rest), resting_heart_rate_age_s: s(rest),
        hrv_sdnn_ms: v(hrv), hrv_sdnn_age_s: s(hrv),
        respiratory_rate_per_min: v(br), respiratory_rate_age_s: s(br),
        sleep_asleep_min: sl ? Math.round(sl.value) : null, sleep_in_bed_min: sl?.in_bed_min != null ? Math.round(sl.in_bed_min) : null, sleep_end_age_s: s(sl),
      };
    },

    stateText() {
      if (this.available === false) return this.reason === 'no_entitlement' ? 'This build of Afferent cannot read Apple Health yet' : 'Not on this phone';
      if (!this.on) return 'Off';
      const hr = this.latest('heart_rate');
      if (hr) return `${this.label(hr)}: ${Math.round(hr.value)} bpm, ${this.ago(hr.age_min)}`;
      if (!this.readAt) return 'Reading Apple Health…';
      return 'Nothing recent in Apple Health. Allow it in the Health app, Sharing, Apps, Afferent';
    },

    render() {},
  };

  // ── Settings, Sensors: "Apple Watch" (only where the plugin is there) ───────────────────────────────────────────
  const $ = id => typeof document === 'undefined' ? null : document.getElementById(id);
  const ui = {};
  Health.render = () => {
    if (!ui.sw) return;
    // Shown where Apple Health can be read, or where only this build's missing permission stands in the way.
    if (ui.group) ui.group.hidden = !(Health.available === true || Health.reason === 'no_entitlement');
    ui.sw.checked = Health.on && Health.available !== false;
    ui.sw.disabled = Health.available === false;
    const t = Health.stateText();
    if (ui.state.textContent !== t) ui.state.textContent = t;
  };
  const mount = () => {
    const body = $('settingsBody'), after = $('watchGroup') || $('sensorsGroup');
    if (!body || !A.Shell?.group) return;
    const html = A.Shell.group({
      id: 'healthGroup', title: 'Apple Watch',
      hint: 'An Apple Watch does not send its pulse over Bluetooth. Afferent can read what it saved in Apple Health: heart rate, resting heart rate, beat-to-beat variation, breathing rate and sleep. Read only, always shown with how old it is, and never used as your live pulse.',
      rows: [{ icon: 'favorite', label: 'Read from Apple Health', sup: '', supId: 'healthState', sw: 'id="healthSw"' }],
    });
    const t = document.createElement('template');
    t.innerHTML = html.trim();
    after ? after.after(t.content) : body.prepend(t.content);
    Object.assign(ui, { group: $('healthGroup'), sw: $('healthSw'), state: $('healthState') });
    ui.group.hidden = true;                      // shown once the plugin answers
    const info = ui.group.querySelector('[data-hint]');
    if (info) info.onclick = () => A.Shell?.toast?.(info.getAttribute('aria-label'));
    ui.sw.onchange = () => (ui.sw.checked ? Health.enable() : Health.disable());
    A.Shell.settings?.hook?.(() => { Health.render(); Health.read(); });
    Health.probe().then(() => Health.render());
  };

  if (typeof document !== 'undefined' && document.getElementById) {
    mount();
    document.addEventListener?.('click', e => { if (e.target?.closest?.('[data-open="signals"]')) Health.read(); }, true);
    document.addEventListener?.('visibilitychange', () => { if (!document.hidden) Health.read(); });
  }
  if (typeof addEventListener === 'function') addEventListener('load', () => { if (Health.on) Health.read(true); });
  if (typeof setInterval === 'function') setInterval(() => { if (Health.on) Health.read(); }, READ_EVERY_MS);
})();
