(() => {
  const q = new URLSearchParams(location.search);
  const OUTBOX = 'afferent.outbox';
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch {} },
  };

  const toWs = base => {
    base = base.trim().replace(/\/+$/, '');
    if (/^wss?:\/\//.test(base)) return /\/ws\/app$/.test(base) ? base : base + '/ws/app';
    if (!/^https?:\/\//.test(base)) base = 'http://' + base;
    return base.replace(/^http/, 'ws') + '/ws/app';
  };

  const resolve = () => {
    const hub = q.get('hub') || q.get('ws') || store.get('afferent.hub');
    if (hub) return toWs(hub);
    if (/^https?:$/.test(location.protocol) && location.pathname.startsWith('/app')) return toWs(location.origin);
    return null;
  };

  const listeners = {};
  const Hub = A.Hub = {
    url: null, ws: null, connected: false, config: null, patientId: 'anna', role: 'game', retry: 0, hello: {},

    httpBase() { return this.url ? this.url.replace(/^ws/, 'http').replace(/\/ws\/app$/, '') : null; },

    connect({ patientId, url, role = 'game', hello = {} } = {}) {
      this.patientId = patientId || this.patientId; this.role = role; this.hello = hello;
      this.url = url || resolve();
      if (!this.url || typeof WebSocket === 'undefined') return false;
      this.open();
      return true;
    },

    open() {
      let ws;
      try { ws = new WebSocket(this.url); } catch { return this.later(); }
      this.ws = ws;
      ws.onopen = () => {
        this.connected = true; this.retry = 0;
        this.raw({ type: 'hello', device_id: A.config.deviceId, app_version: A.config.appVersion, patient_id: this.patientId, role: this.role, ...this.hello });
        for (const doc of this.outbox()) this.raw({ type: 'session_end', session: doc });
        this.emit('connected', true);
      };
      ws.onmessage = m => {
        let d;
        try { d = JSON.parse(m.data); } catch { return; }
        if (!d || typeof d.type !== 'string') return;
        if (d.type === 'config') { this.config = d; A.bus.emit('hubConfig', d); }
        if (d.type === 'ack' && d.session_id && (d.ok || d.duplicate)) this.dropOutbox(d.session_id);
        this.emit(d.type, d);
      };
      ws.onclose = () => {
        const was = this.connected;
        this.connected = false; this.ws = null;
        if (was) this.emit('connected', false);
        this.later();
      };
      ws.onerror = () => {};
    },

    later() {
      const wait = Math.min(10, 2 ** this.retry++);
      setTimeout(() => this.open(), wait * 1000);
    },

    raw(msg) { if (this.ws?.readyState === 1) { this.ws.send(JSON.stringify(msg)); return true; } return false; },

    send(msg) {
      if (msg.type === 'session_end' && this.url) this.pushOutbox(msg.session);
      return this.raw(msg);
    },

    on(type, fn) { (listeners[type] = listeners[type] || []).push(fn); },
    emit(type, d) { (listeners[type] || []).forEach(f => { try { f(d); } catch (e) { console.warn(e); } }); },

    outbox() { try { return JSON.parse(store.get(OUTBOX) || '[]'); } catch { return []; } },
    pushOutbox(doc) {
      const box = this.outbox().filter(d => d.session_id !== doc.session_id);
      box.push(doc);
      store.set(OUTBOX, JSON.stringify(box.slice(-20)));
    },
    dropOutbox(id) { store.set(OUTBOX, JSON.stringify(this.outbox().filter(d => d.session_id !== id))); },
  };

  A.bus.on('ws', msg => Hub.send(msg));
})();
