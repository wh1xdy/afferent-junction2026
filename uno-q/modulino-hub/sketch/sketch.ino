// modulino-hub: reads Knob + Thermo + a PulseSensor, drives Buzzer, talks to Linux via Bridge.
//  sketch -> Linux:  notify("knob", position, pressed)          on change
//                    notify("climate", celsius, humidity)        every 2 s
//                    notify("modulinos", knobOk, thermoOk, buzzerOk) every 5 s
//                    notify("ppg", millis, value)                every loop (~45 Hz, A1, 14-bit)
//                    notify("beat", millis, ibiMs, peakSlope, locked) on every detected beat
//  Linux -> sketch:  call("buzz", freqHz, ms)
//                    call("heartbeat_sound", on)                 beep on every heartbeat (default on)
//                    call("led", r, g, b, ms)                    show a colour on the KY-016 for ms
//                                                                (ms <= 0: hold until the next call; 0,0,0 = back to auto)
// KY-016 RGB LED (common cathode): - GND, R D9, G D10, B D11.
//   auto mode: red flash on every heartbeat, dim blue while searching for a rhythm, off without a finger

#include <Arduino_RouterBridge.h>
#include <Arduino_Modulino.h>

ModulinoKnob knob;
ModulinoThermo thermo;
ModulinoBuzzer buzzer;

bool knobOk = false, thermoOk = false, buzzerOk = false;

int16_t lastPos = 0;
bool lastPressed = false;
unsigned long lastClimate = 0, lastStatus = 0;

// ── Heartbeat detection (PulseSensor on A1: + 3.3V, - GND) ─────────────────
// Slope-based: a beat is the steep upstroke at the start of each pulse, so small
// and large beats are caught alike (peak height varies 2x between beats).
//   d       = rise over the last 2 samples (~45 ms); 0 while the ADC is railed
//   peak    = tracked upstroke slope, decays slowly (~3 s half-life)
//   beat    = d > SLOPE_FRAC * peak, re-armed once d falls back below 10 %,
//             at least REFRACTORY_MS after the last one (fixed: an adaptive window
//             locked onto every other beat)
//   locked  = the last 3 inter-beat intervals are 333-1500 ms and within 35 % of
//             each other; only then does it beep, so noise without a finger stays silent
// Tuned offline on recorded data: 0 false beeps without a finger.
const float SLOPE_FRAC = 0.3f;
const float MIN_PEAK = 400.0f;       // 14-bit counts per 2 samples; no-finger noise peaks ~300
const unsigned long REFRACTORY_MS = 300;
const int RAIL_LO = 200, RAIL_HI = 13500;   // sensor amplifier saturated: ignore
bool heartbeatSound = true;
int hist[3] = {0, 0, 0};
int histN = 0;
float peak = 0;
unsigned long ibis[3] = {0, 0, 0};
bool armedForBeat = true;
unsigned long lastBeat = 0;

// ── KY-016 RGB LED ──────────────────────────────────────────────────────────
const int PIN_R = 9, PIN_G = 10, PIN_B = 11;
float beatGlow = 0;                       // 1.0 on a beat, fades to 0
bool ledOverride = false;
int ovR = 0, ovG = 0, ovB = 0;
unsigned long ovUntil = 0;                // 0 = hold
unsigned long lastAnyBeat = 0;            // any detected beat, locked or not

void writeLed(int r, int g, int b) {
  analogWrite(PIN_R, constrain(r, 0, 255));
  analogWrite(PIN_G, constrain(g, 0, 255));
  analogWrite(PIN_B, constrain(b, 0, 255));
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
  beatGlow *= 0.80f;                      // ~250 ms fade at ~45 Hz
  bool searching = lastAnyBeat && now - lastAnyBeat < 3000 && beatGlow < 0.05f;
  writeLed((int)(255 * beatGlow), 0, searching ? 12 : 0);
}

bool buzz(int freq, int ms) {
  if (!buzzerOk) return false;
  if (freq <= 0 || ms <= 0) buzzer.noTone();
  else buzzer.tone(freq, ms);
  return true;
}

bool setHeartbeatSound(bool on) {
  heartbeatSound = on;
  return heartbeatSound;
}

void detectBeat(int raw, unsigned long now) {
  hist[0] = hist[1]; hist[1] = hist[2]; hist[2] = raw;
  if (histN < 3) { histN++; return; }
  float d = (raw > RAIL_LO && raw < RAIL_HI) ? (float)(hist[2] - hist[0]) : 0.0f;

  peak *= 0.995f;
  if (d < 0.1f * peak) armedForBeat = true;
  if (armedForBeat && peak > MIN_PEAK && d > SLOPE_FRAC * peak && now - lastBeat > REFRACTORY_MS) {
    unsigned long ibi = lastBeat ? now - lastBeat : 0;
    ibis[0] = ibis[1]; ibis[1] = ibis[2]; ibis[2] = ibi;
    lastBeat = now;
    armedForBeat = false;
    unsigned long lo = min(ibis[0], min(ibis[1], ibis[2]));
    unsigned long hi = max(ibis[0], max(ibis[1], ibis[2]));
    bool locked = lo >= 333 && hi <= 1500 && hi * 100 < lo * 135;
    lastAnyBeat = now;
    if (locked) beatGlow = 1.0f;
    if (locked && heartbeatSound && buzzerOk) buzzer.tone(880, 40);
    Bridge.notify("beat", (uint32_t)now, (uint32_t)ibi, (int)peak, locked);
  }
  if (d > peak) peak = (peak == 0) ? d : peak + (d - peak) * 0.3f;
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

  int raw = analogRead(A1);
  detectBeat(raw, now);
  updateLed(now);
  Bridge.notify("ppg", (uint32_t)now, raw);

  if (now - lastStatus >= 5000) {
    lastStatus = now;
    Bridge.notify("modulinos", knobOk, thermoOk, buzzerOk);
  }

  delay(20);
}
