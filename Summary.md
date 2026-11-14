# Afferent game: breakfast summary

Read this in 3 minutes. Details: `GameDesign.md`, `SessionSchema.md`, `ArtBible.md`, `BuildPlan.md`, `DemoScript.md`, `References.md`, `Decisions.md`.

## What we are building

A two-minute nightly session on the phone: a faceless figure walks by itself, left to right, across a small Finnish island in polar night towards a lighthouse that is always on the horizon. The world starts grey. Each station returns one colour. It ends at dawn in full colour, and the real bedside light rises with the in-game sun. No words, no score, nothing can go wrong. The world reacts to your pulse and eyes the whole time (a high pulse makes it warmer, softer and slower, as if it holds you; wider eyes, more lantern light). That is style, never difficulty.

## The session (max 1:57 good day, 1:59 bad day)

1. **Harbour calibration, 20 s, identical every night:** lantern steady, dims (close eyes), flares (eyes wide), rests.
2. **Lantern check-in:** 5 flame sizes = mood 1 to 5. Head tilt or tap, long blink to confirm.
3. **Birch forest (should):** lift your gaze to the light, the birches turn yellow.
4. **Fork (stretch):** head turn to choose, the summit costs 3 s of wide eyes for a bonus.
5. **Frozen lake (must):** blink at the lighthouse flash, 6 trials, fixed timing, always fits in 24 s. Blue ice.
6. **Sauna (must):** eyes closed, breathe at 6 per minute paced by haptics and sound. Open the eyes: green northern lights. Stay closed 60 s: the session ends quietly as fell asleep, no dawn, no light.
7. **Lighthouse (must):** eyes wide, dawn sweep, bedside light.

Misses just bloom slower, never less colour. Two-finger hold to skip, swipe down to exit. Good day and bad day are demo presets: bad day is foggier, starless, warmer and slower, never darker, and never changes the tasks. Dawn light at night is 15% warm amber so it never wakes a partner.

## Stack and device

Capacitor + PixiJS (David) with a Swift ARKit plugin `AfferentFace` (Romain) behind one `FaceInput` interface with a mock. Demo phone: **Face ID iPhone 12+, iOS 17+**, installed via Xcode, second phone ready by 19:00. **Gate 2 at 12:00:** if ARKit does not stream to the game, swap to MediaPipe behind the same interface by 14:00.

Bedside: Jetson runs the WebSocket server on our own travel router, plus the stick figure from its camera and Gemma's clinician note. UNO Q on serial: KY-039 pulse stone, LED, knob (turn = light level, press = camera off, the stick figure vanishes).

## Today

| | 12:00 | 16:00 | 20:00 |
|---|---|---|---|
| David | 4 must stations greyboxed, on the plugin | art, vitals layer, presets, JSON, demo mode | polished, rehearsed |
| Alex | pulse, LED, knob on UNO Q | enclosure, light follows socket | demo-stable unit |
| Vlad | socket server, router | baseline, trend, clinic view | 2 weeks in 20 s, Gemma note |
| Romain | ARKit plugin streaming | stick figure, camera off | thresholds tuned, rPPG only if green |

Integration: 13:00, 17:00, 19:00 (dress rehearsal, store Alex's calibration for stage mode). Cut first: rPPG, fork, forest. Before sleep: Vlad pulls Gemma, Romain pulls the pose model, check Romain has a Mac with Xcode.

## Decided, do not reopen

- No microphone. No facial expressivity. No wink input.
- Sensors never trigger a crisis message. The crisis card is self-report only, fixed text, clinic + 112 + MIELI.
- Only three things can raise "Suggest review": reaction time, mood check-in, missed nights (2 of 3 drifting for about a week). "Not tonight" never counts as missed.
- Simulated data is always labelled SIMULATED. Profiles are "demo profile".
- Say "blink reaction time", "supportive", "early warning", "compares you only with yourself", "the clinician decides". Never "treats", "prevents relapse", "detects emotions", "diagnoses", "HRV", "alertness".
- Tagline once, at the very end: "When the center of gravity moves, someone is there."
