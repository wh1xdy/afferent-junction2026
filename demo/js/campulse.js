(() => {
  const S = A.Sensors;
  const MAX_AGE_MS = 3000;
  const REJECTED = { unauthorized: 'unauthorized', unsupported: 'unsupported' };

  const CamPulse = A.CamPulse = {
    plugin: null, listener: null, starting: false, interrupted: false,

    available() { return !!(this.plugin || (this.plugin = A.plug('AfferentPulse') ?? null)); },

    wanted() { return !!A.config?.sensors?.phone_camera && this.available() && !(typeof document !== 'undefined' && document.hidden); },

    async start() {
      if (!this.available()) { S.setCameraLink('unavailable'); return; }
      if (this.listener || this.starting) return;
      this.starting = true; this.interrupted = false;
      S.setCameraLink('starting');
      let added = null;
      try {
        added = await this.plugin.addListener('pulse', d => this.onReading(d));
        this.listener = added;
        const r = await this.plugin.start();
        if (this.listener) S.setCameraLink(r?.state === 'off' ? 'off' : 'on');
      } catch (e) {
        try { added?.remove?.(); } catch {}
        this.listener = null;
        S.setCameraLink(REJECTED[e?.code] || 'unavailable');
        console.warn('camera pulse: start failed', e);
      }
      this.starting = false;
      if (this.interrupted) { this.interrupted = false; return this.sync(); }
      if (this.listener && !this.wanted()) await this.stop();
    },

    async stop() {
      const l = this.listener;
      this.listener = null;
      if (this.starting) this.interrupted = true;
      if (l) {
        try { await this.plugin?.stop?.(); } catch (e) { console.warn('camera pulse: stop failed', e); }
        try { l?.remove?.(); } catch {}
      }
      if (!this.starting) S.setCameraLink(this.available() ? 'off' : 'unavailable');
    },

    sync() { return this.wanted() ? this.start() : this.stop(); },

    onReading(d) {
      if (!d || !this.listener) return;
      if (typeof d.t_ms === 'number' && Date.now() - d.t_ms > MAX_AGE_MS) return;
      S.feedNativePulse(d);
    },
  };
})();
