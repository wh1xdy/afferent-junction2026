(() => {
  const { clamp } = A;

  const Pointer = A.Pointer = { down: false, x: 0, y: 0, key: false };

  const Eyes = A.Eyes = {
    closed: false, closedAt: 0, raw: 0, baseline: 0.1, threshold: 0.5, samples: [], closures: [], tracked: true,

    reset() { Object.assign(this, { closed: false, raw: 0, samples: [], closures: [] }); },
    setBaseline(open) { this.baseline = open; this.threshold = Math.min(0.75, open + 0.35); },

    feed(now, value, tracked = true) {
      this.raw = value; this.tracked = tracked;
      const closed = tracked && value >= this.threshold;
      if (closed && !this.closed) { this.closed = true; this.closedAt = now; }
      if (!closed && this.closed) {
        this.closed = false;
        if (now - this.closedAt > 0.5) this.closures.push({ t: now, dur: now - this.closedAt });
      }
      this.samples.push([now, closed ? 1 : 0]);
      while (this.samples.length && this.samples[0][0] < now - 20) this.samples.shift();
      while (this.closures.length && this.closures[0].t < now - 20) this.closures.shift();
    },

    perclos() { return this.samples.length ? this.samples.reduce((a, s) => a + s[1], 0) / this.samples.length : 0; },
    longClosures() { return this.closures.length + (this.closed && A.now() - this.closedAt > 0.5 ? 1 : 0); },
  };

  A.Input = {
    mode: 'auto',

    init(el) {
      const pos = e => { const r = el.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
      el.addEventListener('pointerdown', e => {
        el.setPointerCapture(e.pointerId);
        [Pointer.x, Pointer.y] = pos(e); Pointer.down = true;
        A.bus.emit('pdown', { x: Pointer.x, y: Pointer.y, t: A.now(), real: true });
      });
      el.addEventListener('pointermove', e => {
        [Pointer.x, Pointer.y] = pos(e);
        if (Pointer.down) A.bus.emit('pmove', { x: Pointer.x, y: Pointer.y, t: A.now(), real: true });
      });
      const up = e => {
        if (!Pointer.down) return;
        [Pointer.x, Pointer.y] = pos(e); Pointer.down = false;
        A.bus.emit('pup', { x: Pointer.x, y: Pointer.y, t: A.now(), real: true });
      };
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
      addEventListener('keydown', e => {
        if (e.code === 'Space' && !e.repeat) { e.preventDefault(); Pointer.key = true; A.bus.emit('key', { t: A.now() }); }
        if (e.code === 'Escape') A.bus.emit('exit');
      });
      addEventListener('keyup', e => { if (e.code === 'Space') Pointer.key = false; });
    },

    holding() { return Pointer.down || Pointer.key; },

    update(now, dt) {
      if (this.mode === 'camera' && A.Camera.ready) {
        const v = A.Camera.poll();
        if (v !== null) Eyes.feed(now, v.blink, v.tracked);
      } else {
        A.Sim.eyes(now, dt);
      }
    },
  };

  A.Camera = {
    ready: false, video: null, landmarker: null, lastT: -1, last: null, native: null, nativeAt: 0, backend: null,

    async start() {
      const cap = window.Capacitor;
      if (cap?.isNativePlatform?.()) {
        this.plugin = cap.registerPlugin('AfferentEyes');
        await this.plugin.start();
        this.plugin.addListener('eyes', d => { this.native = d; this.nativeAt = A.now(); });
        this.backend = 'arkit'; this.ready = true;
        return;
      }
      const v = await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs');
      const fileset = await v.FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm');
      this.landmarker = await v.FaceLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task', delegate: 'GPU' },
        runningMode: 'VIDEO', numFaces: 1, outputFaceBlendshapes: true,
      });
      this.video = document.createElement('video');
      this.video.playsInline = true; this.video.muted = true;
      this.video.srcObject = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: 640, height: 480 }, audio: false });
      await this.video.play();
      this.backend = 'mediapipe'; this.ready = true;
    },

    stop() { this.plugin?.stop(); this.video?.srcObject?.getTracks().forEach(t => t.stop()); this.ready = false; },

    poll() {
      if (this.backend === 'arkit') {
        const d = this.native;
        if (!d || A.now() - this.nativeAt > 0.5) return { blink: 0, tracked: false };
        return { blink: clamp((d.blink_l + d.blink_r) / 2, 0, 1), tracked: d.tracked };
      }
      if (this.video.currentTime === this.lastT) return this.last;
      this.lastT = this.video.currentTime;
      const bs = this.landmarker.detectForVideo(this.video, performance.now()).faceBlendshapes?.[0]?.categories;
      if (!bs) return (this.last = { blink: 0, tracked: false });
      const get = n => bs.find(c => c.categoryName === n)?.score ?? 0;
      return (this.last = { blink: clamp((get('eyeBlinkLeft') + get('eyeBlinkRight')) / 2, 0, 1), tracked: true });
    },
  };
})();
