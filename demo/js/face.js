(() => {
  const S = A.Sensors;
  const MAX_AGE_MS = 3000;
  const old = d => typeof d.t_ms === 'number' && Date.now() - d.t_ms > MAX_AGE_MS;

  const Face = A.Face = {
    plugin: null, listeners: null, starting: false, missing: false,

    available() {
      if (this.missing) return false;
      this.plugin = this.plugin || (A.plug('AfferentPulse') ?? null);
      return typeof this.plugin?.faceStart === 'function';
    },

    wanted() { return !!A.config?.sensors?.phone_camera && !(typeof document !== 'undefined' && document.hidden); },

    async start() {
      if (!this.available()) { S.setFaceState('unavailable'); return; }
      if (this.listeners || this.starting) return;
      this.starting = true;
      const added = [];
      let told = false;
      try {
        added.push(await this.plugin.addListener('faceState', d => { told = true; this.onState(d); }));
        added.push(await this.plugin.addListener('face', d => this.onFace(d)));
        added.push(await this.plugin.addListener('micro', d => this.onMicro(d)));
        this.listeners = added;
        const r = await this.plugin.faceStart();
        if (r?.state && this.listeners && !told) await this.onState(r);
      } catch (e) {
        for (const l of added) { try { l?.remove?.(); } catch {} }
        this.listeners = null;
        S.setFaceState('unavailable');
        if (e?.code === 'UNIMPLEMENTED') this.missing = true;
        else console.warn('face: start failed', e);
      }
      this.starting = false;
      if (this.listeners && !(this.wanted() && this.available())) await this.stop();
    },

    async stop() {
      const ls = this.listeners;
      this.listeners = null;
      if (ls) {
        try { await this.plugin?.faceStop?.(); } catch (e) { console.warn('face: stop failed', e); }
        for (const l of ls) { try { l?.remove?.(); } catch {} }
      }
      S.setFaceState(this.available() ? 'off' : 'unavailable');
    },

    sync() { return this.wanted() && this.available() ? this.start() : this.stop(); },

    onState(d) {
      if (d?.state !== 'unavailable') { S.setFaceState(d?.state); return; }
      this.missing = true;
      S.setFaceState('unavailable');
      return this.stop();
    },

    onFace(d) { if (d && !old(d)) S.feedFace(d); },

    onMicro(d) { if (d && !old(d)) S.feedFaceMicro(d); },
  };

  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => Face.sync());
})();
