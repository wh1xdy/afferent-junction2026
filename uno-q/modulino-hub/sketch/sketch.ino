// Modulino-hub: läser Knob + Thermo, styr Buzzer, och pratar med Linux via Bridge.
//  sketch -> Linux:  notify("knob", position, pressed)   vid ändring
//                    notify("climate", celsius, humidity) var 2:a sekund
//                    notify("modulinos", knobOk, thermoOk, buzzerOk) var 5:e sekund
//  Linux -> sketch:  call("buzz", freqHz, ms)

#include <Arduino_RouterBridge.h>
#include <Arduino_Modulino.h>

ModulinoKnob knob;
ModulinoThermo thermo;
ModulinoBuzzer buzzer;

bool knobOk = false, thermoOk = false, buzzerOk = false;

int16_t lastPos = 0;
bool lastPressed = false;
unsigned long lastClimate = 0, lastStatus = 0;

bool buzz(int freq, int ms) {
  if (!buzzerOk) return false;
  if (freq <= 0 || ms <= 0) buzzer.noTone();
  else buzzer.tone(freq, ms);
  return true;
}

void setup() {
  Bridge.begin();
  Modulino.begin();  // UNO Q: Qwiic-bussen (Wire1)
  knobOk = knob.begin();
  thermoOk = thermo.begin();
  buzzerOk = buzzer.begin();
  if (knobOk) lastPos = knob.get();
  // provide_safe: körs i loop-tråden, så I2C-anropet krockar inte med loop()
  Bridge.provide_safe("buzz", buzz);
  if (buzzerOk) buzzer.tone(1760, 80);  // startpip
}

void loop() {
  unsigned long now = millis();

  if (knobOk) {
    int16_t pos = knob.get();
    bool pressed = knob.isPressed();
    if (pos != lastPos || pressed != lastPressed) {
      if (pressed && !lastPressed && buzzerOk) buzzer.tone(1200, 30);  // klick
      lastPos = pos;
      lastPressed = pressed;
      Bridge.notify("knob", (int)pos, pressed);
    }
  }

  if (thermoOk && now - lastClimate >= 2000) {
    lastClimate = now;
    Bridge.notify("climate", thermo.getTemperature(), thermo.getHumidity());
  }

  if (now - lastStatus >= 5000) {
    lastStatus = now;
    Bridge.notify("modulinos", knobOk, thermoOk, buzzerOk);
  }

  delay(20);
}
