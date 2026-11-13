// modulino-hub: reads Knob + Thermo + two PulseSensors (A1, A2), drives Buzzer + KY-016,
// talks to Linux via Bridge.
//  sketch -> Linux:  notify("knob", position, pressed)          on change
//                    notify("climate", celsius, humidity)        every 2 s
//                    notify("modulinos", knobOk, thermoOk, buzzerOk) every 5 s
//                    notify("ppg", millis, a1, a2)               every loop (~45 Hz, 14-bit)
//                    notify("beat", ch, millis, ibiMs, peakSlope, locked) on every detected beat (ch 0 = A1, 1 = A2)
//  Linux -> sketch:  call("buzz", freqHz, ms)
//                    call("heartbeat_sound", on)                 beep on every heartbeat (default on)
//                    call("pulse_period", ch, ms, quality100)    Linux autocorrelation of the last 6 s, every 1 s
//                    call("led", r, g, b, ms)                    show a colour on the KY-016 for ms
//                                                                (ms <= 0: hold until the next call; 0,0,0 = back to auto)
// KY-016 RGB LED (common cathode): - GND, R D9, G D10, B D11.
//   auto mode: off by default. call("led_beat", true) flashes on every heartbeat:
//   red = finger 1 (A1), blue = finger 2 (A2). Keep it off when the Jetson camera measures pulse from a face:
//   a light flashing at heart rate on the face fakes the camera reading.
//                    call("led_beat", on)

#include <Arduino_RouterBridge.h>
#include <Arduino_Modulino.h>

ModulinoKnob knob;
ModulinoThermo thermo;
ModulinoBuzzer buzzer;

bool knobOk = false, thermoOk = false, buzzerOk = false;

int16_t lastPos = 0;
bool lastPressed = false;
unsigned long lastClimate = 0, lastStatus = 0;

// ── Heartbeat detection (PulseSensors on A1 and A2: + 3.3V, - GND) ─────────
// Slope-based: a beat is the steep upstroke at the start of each pulse, so small
// and large beats are caught alike (peak height varies 2x between beats).
//   d       = rise over the last 2 samples (~45 ms); 0 while the ADC is railed
//   peak    = tracked upstroke slope, decays slowly (~3 s half-life)
//   beat    = d > SLOPE_FRAC * peak, re-armed once d falls back below 10 %,
//             at least max(300 ms, period / 2) after the last one; period comes from
//             Linux (autocorrelation), so the dicrotic second bump ~0.3 s after each
//             beat is skipped without the detector locking onto its own mistakes
//   locked  = Linux reports a period with autocorrelation quality >= 0.20; only then
//             does it beep/flash, so noise without a finger stays silent
// Tuned offline on recorded data (taped fingertip, 85 BPM on a watch -> 88 BPM).
const float SLOPE_FRAC = 0.3f;
const float MIN_PEAK = 400.0f;       // 14-bit counts per 2 samples; no-finger noise peaks ~300
const unsigned long REFRACTORY_MS = 300;
const int RAIL_LO = 200, RAIL_HI = 13500;   // sensor amplifier saturated: ignore
bool heartbeatSound = true;

struct Channel {
  int pin;
  int tone;                               // beep pitch tells the two fingers apart
  int hist[3];
  int histN;
  float peak;
  unsigned long periodMs;                 // from Linux; 0 = unknown
  int periodQ;                            // autocorrelation quality * 100
  unsigned long periodAt;
  bool armed;
  unsigned long lastBeat;
  float glow;                             // LED: 1.0 on a locked beat, fades
};
Channel ch[2] = {
  {A1, 880, {0, 0, 0}, 0, 0, 0, 0, 0, true, 0, 0},
  {A2, 660, {0, 0, 0}, 0, 0, 0, 0, 0, true, 0, 0},
};

// ── KY-016 RGB LED ──────────────────────────────────────────────────────────
const int PIN_R = 9, PIN_G = 10, PIN_B = 11;
bool ledOverride = false;
bool ledBeat = false;
int ovR = 0, ovG = 0, ovB = 0;
unsigned long ovUntil = 0;                // 0 = hold
unsigned long lastAnyBeat = 0;            // any detected beat, locked or not

void writeLed(int r, int g, int b) {
  analogWrite(PIN_R, constrain(r, 0, 255));
  analogWrite(PIN_G, constrain(g, 0, 255));
  analogWrite(PIN_B, constrain(b, 0, 255));
}

bool setLedBeat(bool on) {
  ledBeat = on;
  return ledBeat;
}

bool setLed(int r, int g, int b, int ms) {
  if (r == 0 && g == 0 && b == 0) { ledOverride = false; return true; }
  ledOverride = true;
  ovR = r; ovG = g; ovB = b;
  ovUntil = ms > 0 ? millis() + (unsigned long)ms : 0;
  return true;
}

void updateLed(unsigned long now) {
  if (ledOverride && ovUntil && now > ovUntil) ledOverride = false;
  if (ledOverride) { writeLed(ovR, ovG, ovB); return; }
  ch[0].glow *= 0.80f;                    // ~250 ms fade at ~45 Hz
  ch[1].glow *= 0.80f;
  if (!ledBeat) { writeLed(0, 0, 0); return; }
  writeLed((int)(255 * ch[0].glow), 0, (int)(255 * ch[1].glow));
}

bool buzz(int freq, int ms) {
  if (!buzzerOk) return false;
  if (freq <= 0 || ms <= 0) buzzer.noTone();
  else buzzer.tone(freq, ms);
  return true;
}

bool setPulsePeriod(int c, int ms, int q100) {
  if (c < 0 || c > 1) return false;
  ch[c].periodMs = ms > 0 ? (unsigned long)ms : 0;
  ch[c].periodQ = q100;
  ch[c].periodAt = millis();
  return true;
}

bool setHeartbeatSound(bool on) {
  heartbeatSound = on;
  return heartbeatSound;
}

void detectBeat(int idx, int raw, unsigned long now) {
  Channel &c = ch[idx];
  c.hist[0] = c.hist[1]; c.hist[1] = c.hist[2]; c.hist[2] = raw;
  if (c.histN < 3) { c.histN++; return; }
  float d = (raw > RAIL_LO && raw < RAIL_HI) ? (float)(c.hist[2] - c.hist[0]) : 0.0f;

  c.peak *= 0.995f;
  if (d < 0.1f * c.peak) c.armed = true;
  bool periodOk = c.periodMs >= 333 && c.periodMs <= 1800 && c.periodQ >= 20 && now - c.periodAt < 3000;
  unsigned long refractory = periodOk ? max(REFRACTORY_MS, c.periodMs / 2) : REFRACTORY_MS;
  if (c.armed && c.peak > MIN_PEAK && d > SLOPE_FRAC * c.peak && now - c.lastBeat > refractory) {
    unsigned long ibi = c.lastBeat ? now - c.lastBeat : 0;
    c.lastBeat = now;
    c.armed = false;
    bool locked = periodOk;
    lastAnyBeat = now;
    if (locked) c.glow = 1.0f;
    if (locked && heartbeatSound && buzzerOk) buzzer.tone(c.tone, 40);
    Bridge.notify("beat", idx, (uint32_t)now, (uint32_t)ibi, (int)c.peak, locked);
  }
  if (d > c.peak) c.peak = (c.peak == 0) ? d : c.peak + (d - c.peak) * 0.3f;
}

void setup() {
  Bridge.begin();
  analogReadResolution(14);  // STM32U585: 14-bit ADC
  Modulino.begin();          // UNO Q: Qwiic bus (Wire1)
  knobOk = knob.begin();
  thermoOk = thermo.begin();
  buzzerOk = buzzer.begin();
  if (knobOk) lastPos = knob.get();
  // provide_safe: runs on the loop thread, so the I2C calls never race loop()
  Bridge.provide_safe("buzz", buzz);
  Bridge.provide_safe("heartbeat_sound", setHeartbeatSound);
  Bridge.provide_safe("led", setLed);
  Bridge.provide_safe("led_beat", setLedBeat);
  Bridge.provide_safe("pulse_period", setPulsePeriod);
  pinMode(PIN_R, OUTPUT); pinMode(PIN_G, OUTPUT); pinMode(PIN_B, OUTPUT);
  writeLed(0, 40, 0);                     // green blink at startup
  delay(150);
  writeLed(0, 0, 0);
  if (buzzerOk) buzzer.tone(1760, 80);  // startup beep
}

void loop() {
  unsigned long now = millis();

  if (knobOk) {
    int16_t pos = knob.get();
    bool pressed = knob.isPressed();
    if (pos != lastPos || pressed != lastPressed) {
      if (pressed && !lastPressed && buzzerOk) buzzer.tone(1200, 30);  // click
      lastPos = pos;
      lastPressed = pressed;
      Bridge.notify("knob", (int)pos, pressed);
    }
  }

  if (thermoOk && now - lastClimate >= 2000) {
    lastClimate = now;
    Bridge.notify("climate", thermo.getTemperature(), thermo.getHumidity());
  }

  int raw1 = analogRead(ch[0].pin);
  int raw2 = analogRead(ch[1].pin);
  detectBeat(0, raw1, now);
  detectBeat(1, raw2, now);
  updateLed(now);
  Bridge.notify("ppg", (uint32_t)now, raw1, raw2);

  if (now - lastStatus >= 5000) {
    lastStatus = now;
    Bridge.notify("modulinos", knobOk, thermoOk, buzzerOk);
  }

  delay(20);
}
