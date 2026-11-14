// Microphone capture for A.Voice: resamples the context rate to 16 kHz mono, 16-bit PCM,
// and posts 40 ms chunks plus their RMS level.
const TARGET = 16000, CHUNK = 640;

class VoiceCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.step = sampleRate / TARGET;
    this.acc = 0; this.n = 0; this.pos = 0;
    this.out = new Int16Array(CHUNK); this.len = 0; this.sq = 0;
  }

  push(v) {
    v = Math.max(-1, Math.min(1, v));
    this.out[this.len++] = v < 0 ? v * 0x8000 : v * 0x7fff;
    this.sq += v * v;
    if (this.len < CHUNK) return;
    const pcm = this.out.buffer;
    this.port.postMessage({ pcm, level: Math.sqrt(this.sq / CHUNK) }, [pcm]);
    this.out = new Int16Array(CHUNK); this.len = 0; this.sq = 0;
  }

  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch) return true;
    for (let i = 0; i < ch.length; i++) {
      this.acc += ch[i]; this.n++; this.pos++;
      if (this.pos >= this.step) { this.pos -= this.step; this.push(this.acc / this.n); this.acc = 0; this.n = 0; }
    }
    return true;
  }
}

registerProcessor('voice-capture', VoiceCapture);
