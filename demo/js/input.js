(() => {
  const Pointer = A.Pointer = { down: false, x: 0, y: 0, key: false };

  const Eyes = A.Eyes = {
    closed: false, closedAt: 0, raw: 0, baseline: 0.1, threshold: 0.5, samples: [], closures: [], blinks: [], log: [], tracked: true,

    reset() { Object.assign(this, { closed: false, raw: 0, baseline: 0.1, threshold: 0.5, samples: [], closures: [], blinks: [], log: [] }); },
    setBaseline(closedness) { this.baseline = closedness; this.threshold = Math.min(0.75, closedness + 0.35); },

    feed(now, value, tracked = true) {
      this.raw = value; this.tracked = tracked;
      const closed = tracked && value >= this.threshold;
      if (closed && !this.closed) { this.closed = true; this.closedAt = now; }
      if (!closed && this.closed) {
        this.closed = false;
        const dur = now - this.closedAt;
        if (dur > 0.5) { this.closures.push({ t: now, dur }); this.log.push({ t: now, dur }); }
        else if (dur >= 0.05) this.blinks.push(now);
      }
      this.samples.push([now, closed ? 1 : 0]);
      while (this.samples.length && this.samples[0][0] < now - 20) this.samples.shift();
      while (this.closures.length && this.closures[0].t < now - 20) this.closures.shift();
      while (this.blinks.length && this.blinks[0] < now - 60) this.blinks.shift();
    },

    perclos() { return this.samples.length ? this.samples.reduce((a, s) => a + s[1], 0) / this.samples.length : 0; },
    longClosures() { return this.closures.length + (this.closed && A.now() - this.closedAt > 0.5 ? 1 : 0); },
  };

  A.Input = {
    mode: 'touch',
    MODES: ['auto', 'touch', 'camera'],

    parse(value) { return this.MODES.includes(value) ? value : 'touch'; },

    init(el) {
      const pos = e => { const r = el.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
      const stamp = e => { const t = A.now(), ts = A.fromPerf && e.timeStamp > 0 ? A.fromPerf(e.timeStamp) : t; return { t, ts: ts <= t + 0.001 && ts > t - 1 ? Math.min(ts, t) : t }; };
      el.addEventListener('pointerdown', e => {
        el.setPointerCapture(e.pointerId);
        [Pointer.x, Pointer.y] = pos(e); Pointer.down = true;
        A.bus.emit('pdown', { x: Pointer.x, y: Pointer.y, ...stamp(e), real: true });
      });
      el.addEventListener('pointermove', e => {
        [Pointer.x, Pointer.y] = pos(e);
        if (Pointer.down) A.bus.emit('pmove', { x: Pointer.x, y: Pointer.y, ...stamp(e), real: true });
      });
      const up = e => {
        if (!Pointer.down) return;
        [Pointer.x, Pointer.y] = pos(e); Pointer.down = false;
        A.bus.emit('pup', { x: Pointer.x, y: Pointer.y, ...stamp(e), real: true });
      };
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
      addEventListener('keydown', e => {
        if (e.code === 'Space' && !e.repeat) { e.preventDefault(); Pointer.key = true; A.bus.emit('key', stamp(e)); }
        if (e.code === 'Escape') A.bus.emit('exit');
      });
      addEventListener('keyup', e => { if (e.code === 'Space') Pointer.key = false; });
    },

    holding() { return Pointer.down || Pointer.key; },

    update(now, dt) {
      const f = A.Sensors.read(now, dt);
      if (f && f.tracked && f.eye_openness !== null) Eyes.feed(now, 1 - f.eye_openness, true);
      else Eyes.feed(now, 0, false);
    },
  };
})();
