# Build plan (v2, adaptive game)

Feature freeze Sat 20:00. Video shoot 20:30 to 22:30. Submission locked Sun 09:30 (target upload 08:30).

## 1. What changed and why it is cheaper

- The prototype in `demo/` already is the game: core, director, 8 tasks, world, audio, session JSON v2. It is plain JavaScript on a canvas, so it goes into the Capacitor app almost unchanged. David no longer builds the game from scratch; he ports and polishes it.
- The camera is now only needed for one number (eye closure). The ARKit plugin shrinks from blendshapes, head pose and gaze to `eyeBlinkLeft/Right`, `isTracked` and a timestamp. Much lower risk for Romain.
- The pulse stone becomes the main input of the director, so Alex's KY-039 work moves onto the critical path.

## 2. Stack

- **App:** the demo code inside **Capacitor** (iOS), installed from a Mac through Xcode free provisioning. The canvas renderer stays; PixiJS is not needed.
- **Eyes:** Capacitor plugin `AfferentEyes` (Swift, about 80 lines, Romain): `ARFaceTrackingConfiguration`, emits `{blink_l, blink_r, tracked, t}` at 30 Hz to JS, feeding `A.Eyes.feed()`.
- **Demo device:** Face ID iPhone 12 or newer, iOS 17+, plus a second installed by 19:00.
- **Fallback:** the MediaPipe path already in the demo (`A.Camera`), used if the plugin is not streaming by 12:00. Without any camera the game still runs; only fatigue detection is off.
- **Pulse:** Jetson WebSocket `pulse` messages from the UNO Q. The demo already accepts them with `?ws=`.

## 3. Scope

### Must by 20:00
- App build of the demo on the iPhone, touch tuned for a phone held in one hand.
- Fixed core, director with all five modes, the 8 tasks, colour return, dawn.
- Real pulse from the pulse stone driving the director; eye closure from ARKit (or MediaPipe).
- Bedside light following `light` messages (mode colours, dawn), knob turn and press.
- End-screen lantern check-in (`mood_vas`) - not yet in the demo.
- Stage mode: skips the core and uses a stored baseline (see `DemoScript.md`) - not yet in the demo.
- Messages `mode`, `game`, `core_trial` (the demo sends the others already).
- Dashboard: session v2 ingest, live mode panel, two weeks in 20 s on simulated data labelled SIMULATED, Suggest review card, "what calms this person" panel, Gemma note.
- Stick figure from the Jetson camera, camera off by knob press.

### Should
- Generated art layers with procedural fallback per layer (blocked: the OpenAI key returned 401).
- Preferred calm task per person from the `config` message.

### Stretch
- rPPG from the face during breath tasks.
- Live Wi-Fi/BLE presence (otherwise labelled simulated).

### Cut
- All gesture input (wink, gaze, head turn, eyes wide), facial expressivity, microphone, good-day/bad-day presets.

## 4. Critical path

1. Freeze the message list and schema v2 (`SessionSchema.md`), Vlad signs off.
2. Romain: `AfferentEyes` plugin streaming blink values into the JS console on the demo iPhone. Confirm he has a Mac with Xcode on David's Apple ID team; otherwise fixed build slots on David's Mac.
3. Alex: pulse stone emitting `P bpm quality contact` at 1 Hz with a stable reading within 10 s of finger contact. This is now the director's main input.
4. Vlad: Jetson WebSocket server relaying `pulse` to the phone and `light` to the UNO Q; serves `config` with the baseline.
5. Gemma and the pose model are downloaded onto the Jetson before the venue Wi-Fi is switched off.

### Gate, 12:00
- GO if the app runs on the iPhone with real eye closure and real pulse switching the mode.
- NO-GO on eyes: ship the MediaPipe path and shoot in a lit set. NO-GO on pulse: the director runs on eyes only, and the pulse in the video comes from the dashboard slider, labelled simulated.

## 5. Tasks and checkpoints

| Owner | 12:00 | 16:00 | 20:00 (freeze) |
|---|---|---|---|
| **David** (game, patient view, pitch, video, deck, submission) | Demo wrapped in Capacitor on the iPhone, touch tuned, end-screen check-in, stage mode | Tasks polished on the phone, haptics, sound levels, real eyes and pulse wired in, art if a key works | Full session under 2:00 rehearsed in all modes, stage mode rehearsed, deck outline, shot list |
| **Alex** (bedside unit, sensors, UNO Q, enclosure) | Pulse stone stable at 1 Hz with contact detection, LED and knob on the UNO Q | Enclosure with the stone where a resting hand finds it, light follows WebSocket | Unit demo-stable, stage brightness, spare cables |
| **Vlad** (outer loop, dashboard, light, presence) | WebSocket server with all message types, router with fixed IPs, `config` with baseline | Session v2 ingest, baseline and trend, three alert domains, live mode panel, "what calms this person" | Two weeks in 20 s (SIMULATED label), Gemma note, presence live or labelled |
| **Romain** (vision, event format) | `AfferentEyes` plugin streaming, closed-threshold check with and without glasses | Stick figure from the Jetson camera, camera off by knob | rPPG only if everything else is green, README technical section |

Integration windows (45 min, everyone): 13:00 pulse and eyes into the app, light following modes. 17:00 full chain into the dashboard. 19:00 dress rehearsal of stage mode and the shot list, second iPhone installed.

## 6. After freeze

20:30 to 22:30 shoot. 22:30 to 01:00 David edits; Alex and Vlad finish the deck; Romain writes README and submission text. Sleep. 07:30 claims check (search for every forbidden phrase), upload by 08:30.

## 7. Cut order if behind (cut from the top)

1. rPPG.
2. Generated art (procedural art already works).
3. Live presence (label simulated).
4. Per-person "what calms you" preference (show as dashboard context only).
5. Löyly and constellation (keep 6 tasks).
6. Gemma live generation (pre-generate the note on the Jetson, still labelled on-device).
7. ARKit plugin (use MediaPipe in a lit set).
8. Live WebSocket (replay a recorded session JSON, said so on stage).

Never cut: the fixed core, the director with real pulse, at least two tasks per mode, the bedside light following the mode, dawn, the crisis card, the SIMULATED label on simulated data.
