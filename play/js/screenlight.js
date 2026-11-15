// Screen light for the camera: while the phone camera measures, the screen gets as bright as the face needs for the
// camera pulse, and the person's own brightness comes back afterwards. Settings › Sensors › Screen light for the camera
// (A.config.screenLight, on by default).
//
// The light itself is native (AfferentPulse.screenLight, ios/App/App/AfferentScreenLight.swift, ported from the
// reference app's ios/Afferent/ScreenLight.swift): it starts from how dark the room is and then follows how bright the
// skin is in the camera picture, at most 2 % a second. This file only says when it is wanted:
//  - the setting and the Phone camera switch are on, the app is visible, the camera pulse runs (camLink 'on'), and
//  - a session runs, or the clip check shows its camera step.
// Anything else turns it off, and off brings the person's own brightness back. The native side also restores it by itself
// when the camera stops, when the app leaves the foreground and when the person moves the brightness themselves (then
// it stays theirs until the next start).
// NEW here, not in the reference: at night with Dim light on (Settings › Sound and feel) the light goes no higher than
// 35 %, as the bedside LED keeps to 25 % then; and it never goes below the person's own brightness (native).
(() => {
  const S = A.Sensors;
  const NIGHT_MAX = 0.35;

  const Light = A.ScreenLight = {
    NIGHT_MAX, plugin: null, missing: false, asked: null, busy: false, again: false, level: null,

    // The one camera plugin, as the camera pulse found it (campulse.js).
    available() {
      if (this.missing) return false;
      this.plugin = this.plugin || (A.CamPulse?.available?.() ? A.CamPulse.plugin : null);
      return typeof this.plugin?.screenLight === 'function';
    },

    // Where the camera measures something the light helps: a session that has not ended, or the clip check's camera step.
    measuring() {
      const s = A.session;
      return (!!s && !s.done) || !!A.ClipCheck?.current?.()?.fallback;
    },

    wanted() {
      return A.config?.screenLight !== false && !!A.config?.sensors?.phone_camera && !!S.enabled?.phone_camera
        && !(typeof document !== 'undefined' && document.hidden) && S.camLink?.state === 'on' && this.measuring();
    },

    // The highest level it may reach, 0..1; null: the native limit (85 %).
    max() { return A.night?.() && A.config?.quietNight !== false ? NIGHT_MAX : null; },

    // What to ask the plugin now: { on: false } or { on: true, max? }.
    request() {
      if (!this.wanted()) return { on: false };
      const max = this.max();
      return max == null ? { on: true } : { on: true, max };
    },

    // Asks the plugin only when the answer changes; one call at a time.
    async sync() {
      if (!this.available()) return;
      const want = this.request(), key = JSON.stringify(want);
      if (key === this.asked) return;
      if (this.busy) { this.again = true; return; }
      this.busy = true;
      this.asked = key;
      try {
        const r = await this.plugin.screenLight(want);
        this.level = Number.isFinite(r?.level) ? r.level : null;
      } catch (e) {
        if (e?.code === 'UNIMPLEMENTED') this.missing = true;
        else console.warn('screen light: failed', e);
        this.asked = null;
      }
      this.busy = false;
      if (this.again) { this.again = false; return this.sync(); }
    },

    // The level the native side reports with each camera pulse event (screen_light), for the face debug view.
    seen(level) { this.level = Number.isFinite(level) ? level : null; },
  };

  if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
    document.addEventListener('visibilitychange', () => Light.sync());
    A.bus.on('sessionEnd', () => Light.sync());
    setInterval(() => Light.sync(), 1000);
  }
})();
