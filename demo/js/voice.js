// Voice companion: speech-to-speech conversation with Gemini Live on Vertex AI, with a live transcript.
// The phone talks to our relay (voice-relay/, on Cloud Run), which holds the Google Cloud identity,
// the model and the system prompt. Audio goes to Google while a conversation is open; the transcript
// is kept on this device only.
(() => {
  const IN_RATE = 16000, OUT_RATE = 24000, KEEP = 20, KEY = 'afferent.voice.relay';

  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} },
  };

  const b64 = bytes => {
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  };
  const unb64 = str => {
    const s = atob(str), out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  };
  const pcmToFloat = bytes => {
    const n = bytes.length >> 1, dv = new DataView(bytes.buffer, bytes.byteOffset, n * 2), f = new Float32Array(n);
    for (let i = 0; i < n; i++) f[i] = dv.getInt16(i * 2, true) / 32768;
    return f;
  };
  const wsUrl = url => url.trim().replace(/\/+$/, '').replace(/^http/, 'ws').replace(/^(?!wss?:\/\/)/, 'wss://') + '/live';

  // Transcript chunks arrive per role and can interleave (the user's words may land after the
  // reply has started), so one turn stays open per role until the model's turn completes.
  const transcript = () => {
    const turns = [], open = {};
    return {
      turns,
      add(role, text) {
        if (!text) return null;
        if (!open[role]) turns.push(open[role] = { role, text: '' });
        open[role].text += text;
        return open[role];
      },
      close() { delete open.user; delete open.agent; },
    };
  };

  const fail = (code, msg) => Object.assign(new Error(msg || code), { code });
  // Relay address and access code: typed in the app, else baked in at build time (js/voice-config.js, `npm run voiceconfig`).
  const relay = () => {
    let typed = null;
    try { typed = JSON.parse(store.get(KEY)); } catch {}
    const r = typed?.url && typed?.code ? typed : window.AFFERENT_VOICE;
    if (!r?.url || !r?.code) throw fail('no_relay');
    return r;
  };

  const V = A.Voice = {
    state: 'idle', log: null, level: 0,
    _: { b64, unb64, pcmToFloat, wsUrl, transcript },

    set(state, detail) { this.state = state; A.bus.emit('voice', { state, detail }); },

    async start() {
      if (this.state !== 'idle' && this.state !== 'error') return;
      this.set('connecting');
      const AC = window.AudioContext || window.webkitAudioContext;
      const s = this.s = { playing: new Set(), nextT: 0, ready: false };
      this.log = transcript();
      try {
        if (!AC || !navigator.mediaDevices?.getUserMedia || typeof AudioWorkletNode === 'undefined') throw fail('unsupported');
        // Contexts are created before any await so they start inside the tap that opened the conversation.
        try { s.inCtx = new AC({ sampleRate: IN_RATE }); } catch { s.inCtx = new AC(); }
        try { s.outCtx = new AC({ sampleRate: OUT_RATE }); } catch { s.outCtx = new AC(); }
        s.inCtx.resume(); s.outCtx.resume();

        const r = relay();
        try {
          s.stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
        } catch { throw fail('mic'); }
        await s.inCtx.audioWorklet.addModule('js/voice-worklet.js');
        if (this.s !== s) return;

        const src = s.inCtx.createMediaStreamSource(s.stream), mute = s.inCtx.createGain();
        s.node = new AudioWorkletNode(s.inCtx, 'voice-capture');
        mute.gain.value = 0;
        src.connect(s.node); s.node.connect(mute); mute.connect(s.inCtx.destination);
        s.node.port.onmessage = e => {
          this.level = e.data.level;
          if (s.ready && s.ws.readyState === 1) s.ws.send(JSON.stringify({ realtimeInput: { audio: { data: b64(new Uint8Array(e.data.pcm)), mimeType: 'audio/pcm;rate=' + IN_RATE } } }));
        };

        const ws = s.ws = new WebSocket(wsUrl(r.url));
        ws.binaryType = 'arraybuffer';
        ws.onopen = () => ws.send(JSON.stringify({ auth: r.code }));
        ws.onmessage = e => {
          let m;
          try { m = JSON.parse(typeof e.data === 'string' ? e.data : new TextDecoder().decode(e.data)); } catch { return; }
          if (this.s === s) this.onServer(m);
        };
        ws.onclose = e => { if (this.s === s) this.stop(e.code === 4401 ? 'code' : s.ready ? 'closed' : 'refused', e.reason); };
        ws.onerror = () => {};
      } catch (e) {
        if (this.s === s) this.stop(e.code || 'failed', e.message);
      }
    },

    onServer(m) {
      const s = this.s;
      if (m.setupComplete) { s.ready = true; this.set('listening'); return; }
      const c = m.serverContent;
      if (!c) return;
      if (c.interrupted) this.flush();
      for (const p of c.modelTurn?.parts || []) if (p.inlineData?.data) this.play(unb64(p.inlineData.data));
      const said = this.log.add('user', c.inputTranscription?.text), reply = this.log.add('agent', c.outputTranscription?.text);
      if (said) A.bus.emit('voiceText', said);
      if (reply) A.bus.emit('voiceText', reply);
      if (c.turnComplete || c.interrupted) this.log.close();
    },

    play(bytes) {
      const s = this.s, f = pcmToFloat(bytes);
      if (!f.length) return;
      const buf = s.outCtx.createBuffer(1, f.length, OUT_RATE), src = s.outCtx.createBufferSource();
      buf.copyToChannel(f, 0);
      src.buffer = buf; src.connect(s.outCtx.destination);
      const t = Math.max(s.outCtx.currentTime + 0.03, s.nextT);
      src.start(t); s.nextT = t + buf.duration;
      s.playing.add(src);
      src.onended = () => { s.playing.delete(src); if (!s.playing.size && this.s === s && this.state === 'speaking') this.set('listening'); };
      if (this.state !== 'speaking') this.set('speaking');
    },

    flush() {
      const s = this.s;
      s.playing.forEach(n => { n.onended = null; try { n.stop(); } catch {} });
      s.playing.clear(); s.nextT = 0;
      if (this.state === 'speaking') this.set('listening');
    },

    stop(reason, detail) {
      const s = this.s;
      if (!s) return;
      this.s = null; this.level = 0;
      try { s.ws && (s.ws.onclose = null, s.ws.close()); } catch {}
      s.stream?.getTracks().forEach(t => t.stop());
      s.playing.forEach(n => { try { n.stop(); } catch {} });
      try { s.inCtx?.close(); s.outCtx?.close(); } catch {}
      this.save();
      if (reason) this.set('error', { code: reason, text: detail }); else this.set('idle');
    },

    histKey: () => 'afferent.voice.' + (A.config?.patientId || 'anna'),
    history() { try { return JSON.parse(store.get(this.histKey())) || []; } catch { return []; } },
    save() {
      const turns = (this.log?.turns || []).map(t => ({ role: t.role, text: t.text.trim() })).filter(t => t.text);
      if (!turns.length) return;
      store.set(this.histKey(), JSON.stringify([...this.history(), { t_iso: new Date().toISOString(), turns }].slice(-KEEP)));
    },
    setRelay(url, code) { store.set(KEY, url && code ? JSON.stringify({ url: url.trim(), code: code.trim() }) : null); },
  };

  if (typeof document === 'undefined') return;
  const $ = id => document.getElementById(id);
  const el = $('voice');
  if (!el) return;

  const STATUS = { idle: '', connecting: 'Connecting', listening: 'Listening', speaking: 'Speaking' };
  const ERRORS = {
    no_relay: 'Voice is not set up on this phone yet. Enter the relay address and access code.',
    code: 'The access code was not accepted. Check it and try again.',
    mic: 'The microphone is blocked. Allow it in the phone settings, then try again.',
    unsupported: 'This phone cannot run the voice companion.',
    refused: 'The voice service could not be reached. Check the address and the network.',
    closed: 'The conversation ended. Start again when you are ready.',
    failed: 'Voice could not start. Check the network and try again.',
  };
  const rows = new Map();
  const render = turn => {
    let li = rows.get(turn);
    if (!li) {
      li = document.createElement('li');
      li.className = 'voice-turn ' + turn.role;
      rows.set(turn, li); $('voiceLog').append(li);
    }
    li.textContent = turn.text.trim();
    $('voiceLog').scrollTop = $('voiceLog').scrollHeight;
  };

  el.querySelector('.voice-core').innerHTML = A.Glyph?.lantern('var(--md-sys-color-sun)', 1) || '';
  let raf = 0;
  const pulse = () => {
    $('voiceOrb').style.setProperty('--lvl', Math.min(1, V.level * 6).toFixed(3));
    raf = V.s ? requestAnimationFrame(pulse) : 0;
  };

  A.bus.on('voiceText', render);
  A.bus.on('voice', ({ state, detail }) => {
    el.dataset.state = state;
    const live = state !== 'idle' && state !== 'error';
    $('voiceStart').classList.toggle('hidden', live);
    $('voiceEnd').classList.toggle('hidden', !live);
    $('voiceStatus').textContent = state === 'error' ? ERRORS[detail?.code] || ERRORS.failed : STATUS[state];
    $('voiceKeyForm').classList.toggle('hidden', !(state === 'error' && ['no_relay', 'code', 'refused'].includes(detail?.code)));
    if (state === 'connecting') { rows.clear(); $('voiceLog').textContent = ''; }
    el.classList.toggle('talked', live || rows.size > 0);
    if (live && !raf) raf = requestAnimationFrame(pulse);
  });

  $('voiceStart').onclick = () => V.start();
  $('voiceEnd').onclick = () => V.stop();
  $('voiceKeyForm').onsubmit = e => {
    e.preventDefault();
    V.setRelay($('voiceUrl').value, $('voiceCode').value);
    $('voiceCode').value = '';
    V.start();
  };
  el.querySelector('[data-close="voice"]').addEventListener('click', () => V.stop());
  A.bus.on('ws', m => { if (m?.type === 'crisis') V.stop(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) V.stop(); });
})();
