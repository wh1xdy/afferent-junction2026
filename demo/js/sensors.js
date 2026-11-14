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

  const plug = A.plug = n => window.Capacitor?.Plugins?.[n] ?? window.Capacitor?.registerPlugin?.(n);
  // Patient switches. `presence` is bed presence and no bed sensor exists (Alex A9): it is never on, whatever was saved or the hub sends.
  const SWITCHES = { phone_camera: true, pulse_stone: true, bedside_camera: false, bedside_light: true, presence: false, phone_motion: false };
  A.switches = (...changes) => Object.assign({}, SWITCHES, ...changes, { presence: false });
  const PULSE_SOURCES = ['finger_ppg', 'ky039', 'simulated'], PRESENCE = ['idle', 'probing', 'active'];
  const FRESH_S = 3, PRODUCER_S = 10, MIN_QUALITY = 0.3;
  const pos = x => Number.isFinite(x) && x > 0 ? x : null;
  const unit = x => Number.isFinite(x) ? clamp(x, 0, 1) : null;
  const num = x => Number.isFinite(x) ? x : null;
  const age = x => Math.round(x * 10) / 10;
  const NO_PULSE = { bpm: null, quality: null, source: null };
  const NO_PHYSIO = {
    source: null, transport: null, simulated: false, pulse_bpm: null, quality: null, quality_reported: false, contact: null,
    finger_bpm: [null, null], breathing_per_min: null, rmssd_ms: null, sdnn_ms: null, rmssd_vs_baseline: null, presence: null, age_s: null,
  };

  const Sensors = A.Sensors = {
    source: 'simulated', ready: true, last: null,
    enabled: { phone_camera: true, pulse_stone: true, simulator: true },
    stone: null, rppg: null, native: null, nativeAt: 0, video: null, landmarker: null, lastVideoT: -1, mp: null, ambient: null, ambientAt: 0,
    pulseMode: null, droppedPulse: 0, droppedPhysio: 0, realAt: null,
    fingerLink: { state: 'unavailable', name: null }, fingerBle: null, fingerHub: null,
    camPulse: null, light: null,

    async start(source) {
      this.stop();
      if (source === 'arkit') {
        this.plugin = plug('AfferentEyes');
        if (!this.plugin) throw new Error('AfferentEyes plugin is not available in this build');
        await this.plugin.start();
        this.listener = await this.plugin.addListener('eyes', d => { this.native = d; this.nativeAt = A.now(); });
      } else if (source === 'mediapipe') {
        const base = new URL('vendor/mediapipe', document.baseURI).href;
        const v = await import(`${base}/vision_bundle.mjs`);
        const fileset = await v.FilesetResolver.forVisionTasks(`${base}/wasm`);
        this.landmarker = await v.FaceLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: `${base}/face_landmarker.task`, delegate: 'GPU' },
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
      return this.start(native && window.Capacitor.getPlatform() === 'ios' ? 'arkit' : 'mediapipe');
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
      if (!d || now - this.nativeAt > 0.5) return { t: now, eye_openness: null, blink_l: null, blink_r: null, tracked: false, head_pitch_deg: null, ambient_light: null, quality: null };
      const open = d.openness ?? 1 - (d.blink_l + d.blink_r) / 2;
      return {
        t: now, eye_openness: d.tracked ? clamp(open, 0, 1) : null, blink_l: d.blink_l, blink_r: d.blink_r, tracked: !!d.tracked,
        head_pitch_deg: d.tracked ? d.pitch_deg ?? null : null, ambient_light: d.ambient ?? null, quality: null,
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
        if (!bs) this.mp = { t: now, eye_openness: null, blink_l: null, blink_r: null, tracked: false, head_pitch_deg: null, ambient_light: this.ambient, quality: null };
        else {
          const get = n => bs.find(c => c.categoryName === n)?.score ?? 0;
          const bl = get('eyeBlinkLeft'), br = get('eyeBlinkRight');
          this.mp = {
            t: now, eye_openness: clamp(1 - (bl + br) / 2, 0, 1), blink_l: bl, blink_r: br, tracked: true,
            head_pitch_deg: m ? Math.atan2(m[9], m[10]) * 180 / Math.PI : null, ambient_light: this.ambient, quality: null,
          };
        }
      }
      return this.mp;
    },

    feedPulse(d) {
      const source = PULSE_SOURCES.includes(d?.source) ? d.source : null, now = A.now();
      if (!source) { this.droppedPulse++; this.stone = null; return; }
      if (source === 'simulated') { if (this.stone && this.stone.source !== 'simulated' && now - this.stone.at < FRESH_S) return; }
      else if (d.bpm != null || d.contact != null) this.realAt = now;
      if (d.bpm && d.contact !== false) this.stone = { bpm: d.bpm, quality: Number.isFinite(d.quality) ? d.quality : null, source, at: now };
      else this.stone = null;
    },

    setPulse(bpm, quality, source = 'rppg') { this.rppg = bpm ? { bpm, quality, source, at: A.now() } : null; },

    feedNativePulse(d) {
      this.setPulse(d.bpm, d.quality ?? null, 'rppg');
      this.camPulse = { bpm: d.bpm ?? null, trust_score: d.trust?.score ?? null, trust_label: d.trust?.label ?? null, at: A.now() };
      if (d.light) this.light = d.light;
    },

    cameraPulse(now) {
      const c = this.camPulse;
      if (!c || !this.enabled.phone_camera || now - c.at >= FRESH_S) return null;
      return { source: 'rppg', bpm: c.bpm, trust_score: c.trust_score, trust_label: c.trust_label, age_s: age(now - c.at) };
    },

    pulse(now) {
      const fresh = x => x && now - x.at < FRESH_S && x.quality != null && x.quality >= MIN_QUALITY;
      const stone = this.enabled.pulse_stone && fresh(this.stone) ? this.stone : null;
      const rppg = this.enabled.phone_camera && fresh(this.rppg) ? this.rppg : null;
      const measured = stone && stone.source !== 'simulated' ? stone : rppg;
      const sim = () => this.enabled.simulator ? { bpm: Sim.pulse(now), quality: 0.9, source: 'simulated' } : NO_PULSE;
      if (this.pulseMode === 'real') return measured || NO_PULSE;
      if (this.pulseMode === 'simulated') return stone && stone.source === 'simulated' ? stone : sim();
      return stone || rppg || sim();
    },

    realProducer(now) {
      const recent = at => at != null && now - at < PRODUCER_S;
      return this.fingerAttached(now) || (this.enabled.pulse_stone && recent(this.realAt)) || (this.enabled.phone_camera && !!this.rppg && recent(this.rppg.at));
    },

    lockPulse(now) { return (this.pulseMode = this.realProducer(now) || !this.enabled.simulator ? 'real' : 'simulated'); },

    unlockPulse() { this.pulseMode = null; },

    setFingerLink(state, name = null) {
      this.fingerLink = { state: state || 'unavailable', name: name ?? null };
      if (state !== 'connected') { this.fingerBle = null; this.feedPulse({ bpm: null, source: 'finger_ppg' }); }
    },

    feedFingerBle(d) {
      if (!this.enabled.pulse_stone || !d) return;
      if (this.fingerLink.state !== 'connected') { this.droppedPhysio++; return; }
      const now = A.now(), b = this.fingerBle || (this.fingerBle = {});
      if (d.kind === 'hrm') {
        b.pulse_bpm = pos(d.bpm); b.pulseAt = now;
        const contact = b.presence == null ? true : b.presence === 'active';
        const quality = b.affAt != null && now - b.affAt < FRESH_S ? b.quality : null;
        this.feedPulse({ bpm: b.pulse_bpm, quality, contact, source: 'finger_ppg' });
      } else if (d.kind === 'aff1') {
        Object.assign(b, {
          finger_bpm: [pos(d.finger_bpm?.[0]), pos(d.finger_bpm?.[1])], breathing_per_min: pos(d.breathing_per_min), rmssd_ms: pos(d.rmssd_ms),
          quality: unit(d.quality), presence: PRESENCE.includes(d.presence) ? d.presence : null, quality_reported: d.payload_len >= 5, affAt: now,
        });
        if (b.presence && b.presence !== 'active') this.feedPulse({ bpm: null, contact: false, source: 'finger_ppg' });
        else if (b.pulse_bpm && now - b.pulseAt < FRESH_S) {
          this.feedPulse({ bpm: b.pulse_bpm, quality: b.quality, contact: true, source: 'finger_ppg' });
          if (this.stone) this.stone.at = b.pulseAt;
        }
      }
    },

    feedFingerHub(d) {
      if (!this.enabled.pulse_stone || !d) return;
      if (d.source !== 'finger_ppg' && d.source !== 'simulated') { this.droppedPhysio++; return; }
      const stale = Number.isFinite(d.age_s) && d.age_s >= FRESH_S;
      this.fingerHub = {
        source: d.source, transport: 'hub_http', simulated: d.source === 'simulated', pulse_bpm: stale ? null : pos(d.pulse_bpm),
        quality: unit(d.quality), quality_reported: d.quality_reported ?? Number.isFinite(d.quality), contact: d.contact ?? null,
        finger_bpm: [pos(d.finger_bpm?.[0]), pos(d.finger_bpm?.[1])], breathing_per_min: pos(d.breathing_per_min), rmssd_ms: pos(d.rmssd_ms),
        sdnn_ms: pos(d.sdnn_ms), rmssd_vs_baseline: num(d.rmssd_vs_baseline), presence: PRESENCE.includes(d.presence) ? d.presence : null,
        age_s: num(d.age_s) ?? 0, at: A.now(),
      };
      const h = this.fingerHub;
      this.feedPulse({ bpm: h.pulse_bpm, quality: h.quality, contact: h.contact, source: h.source });
    },

    fingerAttached(now) {
      if (!this.enabled.pulse_stone) return false;
      const h = this.fingerHub;
      return this.fingerLink.state === 'connected' || (!!h && now - h.at < PRODUCER_S && h.source !== 'simulated');
    },

    fingerFrame(now) {
      if (!this.enabled.pulse_stone) return null;
      const link = this.fingerLink.state, b = this.fingerBle, h = this.fingerHub;
      if (link === 'connected' && b) {
        const pf = b.pulseAt != null && now - b.pulseAt < FRESH_S, af = b.affAt != null && now - b.affAt < FRESH_S;
        return {
          ...NO_PHYSIO, source: 'finger_ppg', transport: 'ble', pulse_bpm: pf ? b.pulse_bpm : null,
          quality: af ? b.quality : null, quality_reported: !!b.quality_reported,
          contact: b.presence != null ? b.presence === 'active' : pf ? true : null,
          finger_bpm: af && b.finger_bpm ? [...b.finger_bpm] : [null, null], breathing_per_min: af ? b.breathing_per_min : null, rmssd_ms: af ? b.rmssd_ms : null,
          presence: b.presence ?? null, age_s: b.pulseAt == null ? null : age(now - b.pulseAt), link,
        };
      }
      if (h && now - h.at < FRESH_S) { const { at, ...f } = h; return { ...f, finger_bpm: [...f.finger_bpm], age_s: age(f.age_s + now - at), link }; }
      return null;
    },

    livePhysio(now) {
      const f = this.fingerFrame(now), link = this.fingerLink.state;
      if (f) return f;
      return link === 'unavailable' && !this.fingerHub ? null : { ...NO_PHYSIO, finger_bpm: [null, null], link };
    },
  };
})();
