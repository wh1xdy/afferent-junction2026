(() => {
  const { clamp, ema, median } = A;

  const raw = A.raw = { blinkL: 0.05, blinkR: 0.05, wideL: 0.05, wideR: 0.05, pitch: 0, yaw: 0, roll: 0, lookY: 0, tracked: true };

  const Face = A.Face = {
    O: [0.35, 0.35], C: [0.55, 0.55], Ow: 0, W: 0.35, pitch0: 0, lookY0: 0, calibrated: false, rangeLow: true,
    n: [0, 0], w: 0, pitchRel: 0, yaw: 0, roll: 0, lookRel: 0, tracked: true,
    closed: false, closedAt: 0, lostSince: null, lostEvents: 0, onsetArmed: true,

    setCalibration(c) {
      Object.assign(this, c, { calibrated: true });
      const range = Math.min(c.C[0] - c.O[0], c.C[1] - c.O[1]);
      this.rangeLow = !(range >= 0.25);
      if (this.rangeLow) { this.O = [0.35, 0.35]; this.C = [0.55, 0.55]; }
      if (!(c.W - c.Ow >= 0.15)) { this.Ow = 0; this.W = 0.35; }
    },

    update(now, dt) {
      const nl = clamp((raw.blinkL - this.O[0]) / (this.C[0] - this.O[0]), 0, 1);
      const nr = clamp((raw.blinkR - this.O[1]) / (this.C[1] - this.O[1]), 0, 1);
      this.n = [nl, nr];
      const wideRaw = (raw.wideL + raw.wideR) / 2;
      this.w = ema(this.w, clamp((wideRaw - this.Ow) / (this.W - this.Ow), 0, 1.2), dt, 0.15);
      this.pitchRel = ema(this.pitchRel, raw.pitch - this.pitch0, dt, 0.15);
      this.yaw = ema(this.yaw, raw.yaw, dt, 0.1);
      this.roll = ema(this.roll, raw.roll, dt, 0.1);
      this.lookRel = ema(this.lookRel, raw.lookY - this.lookY0, dt, 0.15);

      if (raw.tracked) {
        this.lostSince = null;
      } else if (this.lostSince === null) {
        this.lostSince = now;
        this.lostEvents++;
      }
      this.tracked = raw.tracked || (now - this.lostSince) < 0.5;

      const both = Math.min(nl, nr), either = Math.max(nl, nr);
      if (this.onsetArmed && both >= 0.5 && raw.tracked) {
        this.onsetArmed = false;
        A.bus.emit('blinkOnset', { t: now });
      }
      if (either <= 0.35) this.onsetArmed = true;

      if (!this.closed && both >= 0.6) {
        this.closed = true; this.closedAt = now;
        A.bus.emit('closeStart', { t: now });
      } else if (this.closed && either <= 0.35) {
        this.closed = false;
        const dur = now - this.closedAt;
        A.bus.emit('closeEnd', { t: now, dur });
        if (dur < 0.3) A.bus.emit('blink', { t: now, dur });
        else if (dur >= 0.4 && dur <= 1.5) A.bus.emit('longBlink', { t: now, dur });
      }
    },

    closedFor(now) { return this.closed ? now - this.closedAt : 0; },
    wide(threshold = 0.6) { return this.w >= threshold; },
    gazeUp() { return this.pitchRel >= 8 || this.lookRel >= 0.15; },
    faceLostFor(now) { return this.lostSince === null ? 0 : now - this.lostSince; },
  };

  const Touch = A.Touch = { hold: false, holdStart: 0, pointers: new Map(), twoFingerSince: null };

  A.Input = {
    mode: 'auto',
    keys: new Set(),

    init(el) {
      addEventListener('keydown', e => {
        if (e.repeat) return;
        this.keys.add(e.code);
        if (e.code === 'Space') { e.preventDefault(); A.bus.emit('keyResponse', { t: A.now() }); }
        if (e.code === 'KeyS') A.bus.emit('skip');
        if (e.code === 'Escape') A.bus.emit('exit');
        if (e.code === 'KeyT') this.forceLost = !this.forceLost;
        if (e.code === 'KeyH') A.bus.emit('pulseBoost');
        if (e.code === 'ArrowLeft') A.bus.emit('step', -1);
        if (e.code === 'ArrowRight') A.bus.emit('step', 1);
        if (e.code === 'Enter') A.bus.emit('confirm', 'key');
      });
      addEventListener('keyup', e => this.keys.delete(e.code));

      el.addEventListener('pointerdown', e => {
        Touch.pointers.set(e.pointerId, { t: A.now(), x: e.offsetX / el.clientWidth, y: e.offsetY / el.clientHeight });
        if (Touch.pointers.size === 1) { Touch.holdStart = A.now(); }
        if (Touch.pointers.size >= 2) Touch.twoFingerSince = A.now();
      });
      const up = e => {
        const p = Touch.pointers.get(e.pointerId);
        Touch.pointers.delete(e.pointerId);
        if (Touch.pointers.size < 2) Touch.twoFingerSince = null;
        if (!p) return;
        const dur = A.now() - p.t, dy = e.offsetY / el.clientHeight - p.y;
        if (dy > 0.25) { A.bus.emit('exit'); return; }
        if (dur < 0.3) {
          const zone = p.x < 0.33 ? 'left' : p.x > 0.67 ? 'right' : 'center';
          A.bus.emit('tap', { t: p.t, zone });
        }
      };
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
    },

    update(now, dt) {
      Touch.hold = Touch.pointers.size === 1 && now - Touch.holdStart > 0.3;
      if (Touch.twoFingerSince !== null && now - Touch.twoFingerSince > 1) {
        Touch.twoFingerSince = null;
        A.bus.emit('skip');
      }
      if (this.mode === 'keys') {
        const closed = this.keys.has('Space') ? 0.95 : 0.05;
        raw.blinkL = raw.blinkR = closed;
        raw.wideL = raw.wideR = this.keys.has('KeyW') ? 0.6 : 0.05;
        raw.pitch = ema(raw.pitch, this.keys.has('ArrowUp') ? 14 : 0, dt, 0.15);
        raw.yaw = ema(raw.yaw, this.keys.has('KeyA') ? -16 : this.keys.has('KeyD') ? 16 : 0, dt, 0.1);
        raw.roll = raw.yaw;
        raw.tracked = !this.forceLost;
      } else if (this.mode === 'auto') {
        A.Auto.drive(now, dt);
        raw.tracked = !this.forceLost;
      } else if (this.mode === 'camera') {
        A.Camera.poll(now);
        if (this.forceLost) raw.tracked = false;
      }
      Face.update(now, dt);
    },
  };

  A.Camera = {
    ready: false, video: null, landmarker: null, lastT: -1,

    async start() {
      const v = await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs');
      const fileset = await v.FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm');
      this.landmarker = await v.FaceLandmarker.createFromOptions(fileset, {
        baseOptions: {
          modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
          delegate: 'GPU',
        },
        runningMode: 'VIDEO', numFaces: 1,
        outputFaceBlendshapes: true, outputFacialTransformationMatrixes: true,
      });
      this.video = document.createElement('video');
      this.video.playsInline = true; this.video.muted = true;
      this.video.srcObject = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: 640, height: 480 }, audio: false });
      await this.video.play();
      this.ready = true;
    },

    stop() {
      this.video?.srcObject?.getTracks().forEach(t => t.stop());
      this.ready = false;
    },

    poll(now) {
      if (!this.ready || this.video.currentTime === this.lastT) return;
      this.lastT = this.video.currentTime;
      const r = this.landmarker.detectForVideo(this.video, performance.now());
      const bs = r.faceBlendshapes?.[0]?.categories;
      if (!bs) { raw.tracked = false; return; }
      const get = name => bs.find(c => c.categoryName === name)?.score ?? 0;
      raw.tracked = true;
      raw.blinkL = get('eyeBlinkLeft'); raw.blinkR = get('eyeBlinkRight');
      raw.wideL = get('eyeWideLeft'); raw.wideR = get('eyeWideRight');
      raw.lookY = (get('eyeLookUpLeft') + get('eyeLookUpRight') - get('eyeLookDownLeft') - get('eyeLookDownRight')) / 2;
      const m = r.facialTransformationMatrixes?.[0]?.data;
      if (m) {
        const deg = 180 / Math.PI, sign = A.config.pitchSign;
        raw.pitch = sign * Math.atan2(m[6], m[10]) * deg;
        raw.yaw = -Math.asin(clamp(-m[2], -1, 1)) * deg;
        raw.roll = Math.atan2(m[1], m[0]) * deg;
      }
    },
  };

  A.Auto = {
    plan: {},
    reset() { this.plan = { nextBlink: 2 + Math.random() * 3 }; },

    drive(now, dt) {
      const s = A.session;
      const seg = s?.seg, t = seg ? now - seg.start : 0, bad = s?.profile.id === 'bad_day';
      let closed = false, wide = false, pitch = 0, yaw = 0;
      const p = this.plan;

      if (p.blinkUntil && now < p.blinkUntil) closed = true;
      if (now > p.nextBlink && !p.blinkUntil) {
        p.blinkUntil = now + 0.15;
        p.nextBlink = now + 2.5 + Math.random() * 3;
      }
      if (p.blinkUntil && now >= p.blinkUntil) p.blinkUntil = 0;

      const id = seg?.id;
      if (id === 'calibration') {
        if (t > 6.4 && t < 8.8) closed = true;
        if (t > 9.4 && t < 11.8) wide = true;
      } else if (id === 'checkin') {
        if (t > 1.2 && t < 1.8) yaw = bad ? -16 : 16;
        if (t > 3.0 && t < 3.6) closed = true;
      } else if (id === 'forest') {
        if (t > (bad ? 1.6 : 0.9)) pitch = 13;
      } else if (id === 'fork') {
        if (s.fork.phase === 'choose') {
          if (t > 1.0 && t < 1.6) yaw = bad ? -16 : 16;
          if (t > 1.9 && t < 2.5) closed = true;
        }
        if (s.fork.phase === 'climb') wide = true;
      } else if (id === 'lake') {
        const tr = s.lake.trial;
        if (tr && tr.onset !== null && !tr.done) {
          if (p.trialId !== tr) {
            p.trialId = tr;
            const miss = bad && s.lake.trials.length === 2;
            p.respondAt = miss ? Infinity : tr.onset + (bad ? 0.52 : 0.38) + (Math.random() - 0.5) * (bad ? 0.16 : 0.1);
          }
          if (now >= p.respondAt && now < p.respondAt + 0.18) closed = true;
        }
        if (closed && tr && tr.onset === null) closed = false;
      } else if (id === 'sauna') {
        if (s.sa?.arrived && t > 2.6 && t < 2.3 + 10 * s.sa.cycles) closed = true;
      } else if (id === 'lighthouse') {
        if (t > 0.8) wide = true;
      }

      const c = closed ? 0.92 : 0.06;
      raw.blinkL = ema(raw.blinkL, c, dt, 0.03);
      raw.blinkR = ema(raw.blinkR, c, dt, 0.03);
      raw.wideL = raw.wideR = ema(raw.wideL, wide ? 0.62 : 0.06, dt, 0.08);
      raw.pitch = ema(raw.pitch, pitch, dt, 0.25);
      raw.yaw = raw.roll = ema(raw.yaw, yaw, dt, 0.1);
      raw.lookY = 0;
    },
  };

  A.median = median;
})();
