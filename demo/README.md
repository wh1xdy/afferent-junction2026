# Afferent session demo

A browser prototype of one Afferent session (`../GameDesign.md`): calibration, lantern check-in, birch forest, fork, frozen lake, sauna, lighthouse, dawn. A full session takes under 2 minutes, stage demo mode about 50 s. No build step, no dependencies.

```
cd afferent-game/demo
python3 -m http.server 8080
```

Open http://localhost:8080. Serve over http(s), not `file://`, so the camera works.

## Start screen

- `demo profile`: bad day or good day.
- `input`: autoplay (a simulated player runs the session), keyboard / touch, or camera (MediaPipe Face Landmarker, loaded from jsDelivr; frames stay in the tab and are never drawn).
- `full session` or `stage demo` (lake 3 trials, sauna 2 breaths, lighthouse, dawn).
- The info icon lists the keys. The speech bubble opens the fixed crisis card.

## URL parameters

`?profile=good_day|bad_day`, `?input=auto|keys|camera`, `?stage=1`, `?heartbeat=0` (setting "Show heartbeat" off), `?pitchSign=-1` (flip camera pitch if looking up reads as down), `?ws=ws://192.168.8.10:8765` (send the messages from `../SessionSchema.md` to the bedside unit and take `pulse` and `knob` from it).

## What is simulated

The bedside panel (LED, pulse, dawn level) is simulated unless `?ws=` connects to the Jetson. Pulse is simulated by default. Press `H` to raise it and watch the world turn warmer and slower. The session JSON follows `afferent.session/1` and can be downloaded at the end. This is a web prototype; the product app is Capacitor plus the ARKit plugin (`../BuildPlan.md`).
