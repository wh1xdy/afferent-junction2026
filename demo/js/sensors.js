(() => {
  const { clamp } = A;
  const R = Math.random;

  const PROFILES = A.PROFILES = {
    live: { offset: 0, hold: 0, drowsy: 0, pitch: -8, open: 0.76, visual: null },
    good_day: { offset: 1, hold: 0, drowsy: 0, pitch: -4, open: 0.82, visual: { fog: 0.25, stars: 170, warm: 0.12, aurora: 0.35, exposure: 1.05, sat: 0.18, lanternGain: 1.3 } },
    bad_day: { offset: 14, hold: 25, drowsy: 0.55, pitch: -15, open: 0.6, visual: { fog: 0.8, stars: 35, warm: 0.02, aurora: 0.02, exposure: 0.82, sat: 0.03, lanternGain: 0.7 } },
  };
  A.LIVE_VISUAL = { fog: 0.45, stars: 120, warm: 0.04, aurora: 0.05, exposure: 1, sat: 0.05, lanternGain: 1 };

  const Sim = A.Sim = {
    reset(profile = 'live', now = 0) {
      Object.assign(this, { rest: A.config?.baselinePulse ?? 68, nextBlink: 0, closeUntil: 0, lift: 0 });
      this.applyProfile(profile, now);
    },
    applyProfile(profile, now = 0) {
      const p = PROFILES[profile] || PROFILES.live;
      Object.assign(this, { profile, offset: p.offset, holdUntil: now + p.hold, drowsy: p.drowsy, pitchBase: p.pitch, openBase: p.open });
    },
    pulse(now) { return this.rest + this.offset + 2.5 * Math.sin(now * Math.PI / 5) + 0.6 * (A.noise(now * 0.7) - 0.5); },
    step(dt, s, now) {
      const g = s?.game, mode = s?.gameMode;
      if (now >= this.holdUntil) {
        let tau = 90;
        if (mode === 'calm' || mode === 'rest') tau = g?.id === 'breath' && g.sync > 0.5 ? 9 : 14;
        this.offset += (0 - this.offset) * (1 - Math.exp(-dt / tau));
        if (mode === 'wake' && g && this.offset < 9) this.offset += 0.25 * dt;
      }
      const lift = !g ? this.lift : this.profile === 'bad_day' ? -9 : mode === 'wake' || mode === 'fatigue' ? 9 : mode === 'flow' || mode === 'measure' ? 5 : 2;
      this.lift += (lift - this.lift) * (1 - Math.exp(-dt / 18));
    },
    face(now, dt) {
      if (now >= this.closeUntil) {
        if (R() < this.drowsy * 0.5 * dt) this.closeUntil = now + 0.7 + R() * 1.6;
        else if (now > this.nextBlink) { this.closeUntil = now + 0.12 + R() * 0.1; this.nextBlink = now + 2.5 + R() * 3; }
      }
      const closed = this.eyesShut || now < this.closeUntil;
      const open = closed ? 0.06 : clamp(this.openBase - 0.14 * this.drowsy + 0.04 * (A.noise(now * 0.9) - 0.5), 0.2, 1);
      const blink = 1 - open;
      return {
        t: now, eye_openness: open, blink_l: blink, blink_r: blink, tracked: true,
        head_pitch_deg: this.pitchBase + this.lift + 2.5 * Math.sin(now * 0.31) + 1.2 * (A.noise(now * 0.5 + 9) - 0.5),
        ambient_light: 0.22, quality: 0.95,
      };
    },
  };
  Sim.reset();

  const luma = video => {
    const c = luma.c || (luma.c = Object.assign(document.createElement('canvas'), { width: 16, height: 12 }));
    const x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(video, 0, 0, 16, 12);
    const d = x.getImageData(0, 0, 16, 12).data;
    let s = 0;
    for (let i = 0; i < d.length; i += 4) s += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
    return s / (d.length / 4) / 255;
  };

  const Sensors = A.Sensors = {
    source: 'simulated', ready: true, last: null,
    enabled: { phone_camera: true, pulse_stone: true, simulator: true },
    stone: null, rppg: null, native: null, nativeAt: 0, video: null, landmarker: null, lastVideoT: -1, mp: null, ambient: null, ambientAt: 0,

    async start(source) {
      this.stop();
      if (source === 'arkit') {
        this.plugin = window.Capacitor.registerPlugin('AfferentEyes');
        await this.plugin.start();
        this.listener = await this.plugin.addListener('eyes', d => { this.native = d; this.nativeAt = A.now(); });
      } else if (source === 'mediapipe') {
        const base = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
        const v = await import(`${base}/vision_bundle.mjs`);
        const fileset = await v.FilesetResolver.forVisionTasks(`${base}/wasm`);
        this.landmarker = await v.FaceLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task', delegate: 'GPU' },
          runningMode: 'VIDEO', numFaces: 1, outputFaceBlendshapes: true, outputFacialTransformationMatrixes: true,
        });
        this.video = Object.assign(document.createElement('video'), { playsInline: true, muted: true });
        this.video.srcObject = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: 640, height: 480 }, audio: false });
        await this.video.play();
      }
      this.source = source; this.ready = true;
      return source;
    },

    async startCamera() {
      const native = window.Capacitor?.isNativePlatform?.();
      return this.start(native ? 'arkit' : 'mediapipe');
    },

    stop() {
      this.plugin?.stop(); this.listener?.remove?.(); this.plugin = null; this.listener = null;
      this.video?.srcObject?.getTracks().forEach(t => t.stop()); this.video = null; this.landmarker = null;
      this.source = 'simulated'; this.ready = true;
    },

    camera() { return this.source === 'arkit' || this.source === 'mediapipe'; },

    eyesSource() { return this.camera() ? this.source : this.enabled.simulator ? 'simulated' : null; },

    read(now, dt) {
      let f = null;
      if (this.source === 'arkit') f = this.readArkit(now);
      else if (this.source === 'mediapipe') f = this.readMediapipe(now);
      else if (this.enabled.simulator) f = Sim.face(now, dt);
      return (this.last = f);
    },

    readArkit(now) {
      const d = this.native;
      if (!d || now - this.nativeAt > 0.5) return { t: now, eye_openness: null, blink_l: null, blink_r: null, tracked: false, head_pitch_deg: null, ambient_light: null, quality: 0 };
      const open = d.openness ?? 1 - (d.blink_l + d.blink_r) / 2;
      return {
        t: now, eye_openness: d.tracked ? clamp(open, 0, 1) : null, blink_l: d.blink_l, blink_r: d.blink_r, tracked: !!d.tracked,
        head_pitch_deg: d.tracked ? d.pitch_deg ?? null : null, ambient_light: d.ambient ?? null, quality: d.tracked ? 0.9 : 0,
      };
    },

    readMediapipe(now) {
      const vid = this.video;
      if (!vid || !this.landmarker) return null;
      if (vid.currentTime !== this.lastVideoT) {
        this.lastVideoT = vid.currentTime;
        const res = this.landmarker.detectForVideo(vid, performance.now());
        const bs = res.faceBlendshapes?.[0]?.categories, m = res.facialTransformationMatrixes?.[0]?.data;
        if (now - this.ambientAt > 1) { this.ambientAt = now; try { this.ambient = luma(vid); } catch { this.ambient = null; } }
        if (!bs) this.mp = { t: now, eye_openness: null, blink_l: null, blink_r: null, tracked: false, head_pitch_deg: null, ambient_light: this.ambient, quality: 0 };
        else {
          const get = n => bs.find(c => c.categoryName === n)?.score ?? 0;
          const bl = get('eyeBlinkLeft'), br = get('eyeBlinkRight');
          this.mp = {
            t: now, eye_openness: clamp(1 - (bl + br) / 2, 0, 1), blink_l: bl, blink_r: br, tracked: true,
            head_pitch_deg: m ? Math.atan2(m[9], m[10]) * 180 / Math.PI : null, ambient_light: this.ambient, quality: 0.85,
          };
        }
      }
      return this.mp;
    },

    feedPulse(d) {
      if (d.bpm && d.contact !== false) this.stone = { bpm: d.bpm, quality: d.quality ?? 0.5, source: d.source === 'simulated' ? 'simulated' : 'ky039', at: A.now() };
      else this.stone = null;
    },

    setPulse(bpm, quality, source = 'rppg') { this.rppg = bpm ? { bpm, quality, source, at: A.now() } : null; },

    pulse(now) {
      const fresh = x => x && now - x.at < 3 && x.quality >= 0.3;
      if (this.enabled.pulse_stone && fresh(this.stone)) return this.stone;
      if (this.enabled.phone_camera && fresh(this.rppg)) return this.rppg;
      if (this.enabled.simulator) return { bpm: Sim.pulse(now), quality: 0.9, source: 'simulated' };
      return { bpm: null, quality: 0, source: null };
    },
  };
})();
