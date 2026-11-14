(() => {
  const S = A.Sensors;
  const MAX_AGE_MS = 3000;

  const Finger = A.Finger = {
    plugin: null, listeners: null, starting: false,

    available() { return !!(this.plugin || (this.plugin = A.plug('AfferentFinger') ?? null)); },

    async start() {
      if (!this.available()) { S.setFingerLink('unavailable'); return; }
      if (this.listeners || this.starting) return;
      this.starting = true;
      const added = [];
      try {
        added.push(await this.plugin.addListener('state', d => S.setFingerLink(d?.state, d?.name)));
        added.push(await this.plugin.addListener('reading', d => this.onReading(d)));
        this.listeners = added;
        const r = await this.plugin.start();
        if (r?.state && this.listeners) S.setFingerLink(r.state, r.name);
      } catch (e) {
        for (const l of added) { try { l?.remove?.(); } catch {} }
        this.listeners = null;
        S.setFingerLink('unavailable');
        console.warn('finger sensor: start failed', e);
      }
      this.starting = false;
      if (this.listeners && !A.config?.sensors?.pulse_stone) await this.stop();
    },

    async stop() {
      const ls = this.listeners;
      this.listeners = null;
      if (ls) {
        try { await this.plugin?.stop?.(); } catch (e) { console.warn('finger sensor: stop failed', e); }
        for (const l of ls) { try { l?.remove?.(); } catch {} }
      }
      S.setFingerLink(this.available() ? 'off' : 'unavailable');
    },

    sync() { return A.config?.sensors?.pulse_stone && this.available() ? this.start() : this.stop(); },

    onReading(d) {
      if (!d) return;
      if (typeof d.t_ms === 'number' && Date.now() - d.t_ms > MAX_AGE_MS) return;
      S.feedFingerBle(d);
    },
  };
})();
