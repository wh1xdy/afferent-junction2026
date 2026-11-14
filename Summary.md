# Afferent game: breakfast summary (v2)

Read this in 3 minutes. Details: `GameDesign.md`, `SessionSchema.md`, `BuildPlan.md`, `DemoScript.md`, `ArtBible.md`, `References.md`, `Decisions.md`. Try it: `cd demo && python3 -m http.server 8080`, open localhost:8080, press Begin.

## What changed overnight

We dropped "the game reacts to eye and head movements". Now **you play with one finger, and your body steers the game in the background.** Pulse and eye closure are stimulation values that decide what the game offers next.

## How a session works (under 2 minutes)

1. **Fixed core, about 20 s, the same every time:** rest while the lantern glows (start pulse), then tap whenever it flares, 5 times (reaction time).
2. **Adaptive play, about 85 s:** the figure walks to the next spot and a short Among Us style task opens. The director picks it from your state:

| Your state | The game | Tasks |
|---|---|---|
| Pulse high (8+ over your baseline) | calm: sauna, warm, slow | breathing circle, pour löyly slowly |
| In between | flow: birch forest | connect aurora threads, tap a constellation |
| Pulse low (3+ under baseline) | wake: frozen lake, beams, faster music | fireflies, lighthouse beacon, bells |
| Eyes keep closing, morning | fatigue: bright shore, daylight lamp | swipe shutters open, bells, beacon |
| Eyes keep closing, night | rest: lets you sleep | breathing only; 30 s eyes closed ends quietly |

3. **Dawn:** every finished task returns a colour; the session ends at sunrise and the real bedside light rises. Optional one-tap mood check-in on the end screen.

Nothing can be failed: tasks time out, and mistakes make the next task easier.

## Stack and roles

The browser demo already is the game; David wraps it in Capacitor for the iPhone (Face ID iPhone 12+). Romain's ARKit plugin now only sends eye-closure values. Alex's pulse stone is the main input and on the critical path. Vlad's Jetson relays pulse and light, serves the personal baseline and runs the dashboard. **Gate at 12:00:** app on the iPhone with real pulse and real eye closure switching the mode.

| | 12:00 | 16:00 | 20:00 |
|---|---|---|---|
| David | demo in Capacitor, check-in, stage mode | polish on phone, real sensors wired | rehearsed, deck outline |
| Alex | pulse stone stable at 1 Hz, LED, knob | enclosure, light follows socket | demo-stable unit |
| Vlad | socket server, router, baseline config | ingest, trend, live mode panel | 2 weeks in 20 s, Gemma note |
| Romain | eye plugin streaming | stick figure, camera off | thresholds tuned |

## Decided, do not reopen

- Touch only; the camera reads only whether the eyes are closed. No microphone, no expressions.
- At night the game never fights tiredness.
- Sensors never trigger a crisis message; the crisis card is self-report only.
- Only reaction time, mood check-in and missed nights can raise "Suggest review". "Not tonight" never counts as missed.
- Simulated data and simulated vitals are always labelled.
- Tagline once, at the very end: "When the center of gravity moves, someone is there."
