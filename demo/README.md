# Afferent adaptive demo

Browser prototype of the adaptive Afferent session. The player uses touch only. Pulse and eye closure are read passively and decide what the game offers next. No build step, no dependencies.

```
cd afferent-game/demo
python3 -m http.server 8080
```

Open http://localhost:8080 and press Begin. Serve over http(s), not `file://`, so the camera works.

## Session

1. Fixed core (about 20 s, identical every time): rest while the lantern glows, then tap when it flares, 5 times. Gives start pulse and reaction time.
2. Adaptive play (about 85 s): the figure walks to the next spot and a short task opens, like an Among Us task. The director picks the mode from pulse (relative to the personal baseline) and eye closure over the last 20 s:

| Mode | Trigger | World | Tasks |
|---|---|---|---|
| calm | pulse 8+ bpm over baseline | sauna, warm, fog, slow music | breath (hold while the circle grows), löyly (pour water slowly) |
| flow | in between | birch forest | aurora threads (wiring), constellation (tap stars small to large) |
| wake | pulse 3+ bpm under baseline | frozen lake, beams, faster music | fireflies (tap), beacon (tap when the beam hits the boat), bells (repeat the sequence) |
| fatigue | eyes keep closing, morning | bright shore, daylight | shutters (swipe up), bells, beacon |
| rest | eyes keep closing, night | harbour, dim | breathing only; 30 s of closed eyes ends the session quietly |

Task difficulty follows the mode intensity and the errors in the previous task. A task never fails: it times out and the session goes on. Each finished task returns one colour; the session ends at dawn.

## Start screen

- `input`: autoplay story (a simulated player; the vitals go stressed, then calm, tired, flat), touch (vitals from the sliders), touch + camera (eye closure from the camera via MediaPipe, frames stay in the tab).
- `clock`: morning or night (night turns fatigue into rest and keeps the bedside light dim).

## Side panel

Simulated bedside unit, vitals sliders and presets (stressed, flat, tired, normal), the director state, a timeline of pulse (yellow), fatigue (dashed) and mode, the event log and the session JSON (`afferent.session/2`).

URL parameters: `?input=auto|touch|camera`, `?clock=morning|night`, `?ws=ws://192.168.8.10:8765` (send messages to the bedside unit and take `pulse` and `knob` from it).
