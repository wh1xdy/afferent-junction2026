# Build plan

Now: Sat ~03:00. Feature freeze Sat 20:00. Video shoot 20:30 to 22:30. Submission locked Sun 09:30 (target upload 08:30).

## 1. Stack (decided)

- **App:** web game in **PixiJS** inside **Capacitor** (iOS), built and installed from David's Mac with Xcode free provisioning. No App Store, no TestFlight. Re-sign Sunday morning as a precaution.
- **Face input:** native Capacitor plugin **`AfferentFace`** (Swift, about 200 lines, Romain). Runs `ARFaceTrackingConfiguration` on the TrueDepth camera and pushes normalised blendshapes, head pose, `lookAtPoint`, `isTracked` and frame timestamps to JS at 60 Hz.
- **One JS interface `FaceInput`** (`blink_l`, `blink_r`, `wide_l`, `wide_r`, `pitch`, `yaw`, `roll`, `look_y`, `tracked`, `t`) plus derived events (`long_blink`, `closed`, `opened`, `wide`). David codes against a keyboard and touch mock from minute one and never waits on Swift.
- **Demo device:** iPhone with Face ID (TrueDepth), iPhone 12 or newer, iOS 17+. A second Face ID iPhone installed and tested by 19:00 as backup. No iPhone SE, no iPad without Face ID.
- **Fallback:** a MediaPipe Face Landmarker adapter behind the same `FaceInput` interface (separate build, because ARKit occupies the front camera). Used only if Gate 2 fails. Then we shoot in a lit set and name ARKit as the production path.

## 2. Scope

### Must by 20:00
- Start screen (Begin / Not tonight, camera icon, Talk to someone), settings with per-sensor switches (switches may be UI-only for presence), end screen.
- Harbour calibration (20 s) and lantern check-in.
- Frozen lake (6 trials, blink reaction time, fixed timing).
- Sauna (haptic and sound pacing, eyes closed, aurora on opening, KY-039 pulse if available).
- Lighthouse and dawn sweep.
- Vitals-reactive layer: heartbeat lantern flicker and the high-pulse cool shift (needs only the `pulse` message) plus eye openness to lantern radius.
- Good day and bad day presets, selectable on a hidden long press of the start-screen lantern.
- Session JSON emitted and sent over WebSocket; bedside light follows `light` and `station` messages; dawn brightens the real LED.
- Stage demo mode (see `DemoScript.md`): lake 3 trials, sauna 2 breaths, lighthouse, dawn. Hidden dawn trigger (three-finger tap) as a declared fallback.
- Bedside: KY-039 pulse, knob turn (light level) and press (camera off), LED, live stick figure from the Jetson camera on the dashboard.
- Dashboard: two weeks in 20 s on simulated data (labelled SIMULATED in the corner the whole time), "Suggest review" card, Gemma weekly clinician note generated on the Jetson.

### Should (only after the 16:00 checkpoint is green)
- Birch forest (gaze up, yellow).
- Full art set A (16 assets) in place of greybox.

### Stretch (only after Should is done)
- Fork with effort choice.
- Keep the moment (glowing stone).
- rPPG from the face in the sauna (shown only with a lock).
- Live Wi-Fi/BLE presence (otherwise shown as simulated).

### Cut
- Facial expressivity, microphone, wink input, double blink, phone body pose, art set B beyond the app icon.

## 3. Critical path and dependencies

1. **03:00 (all, 20 min):** read `Summary.md`. Freeze the WebSocket message list and session schema v1 (`SessionSchema.md`), Vlad signs off. Freeze the `FaceInput` interface, Romain signs off.
2. **03:00 David:** start the art generation script (asset 1, accept as reference, then 2 to 16 unattended).
3. **03:00 Romain (max 30 min, then sleep):** Capacitor shell installed on the demo iPhone through Xcode. **Gate 1:** ARKit blendshape values appear in the JS console. If not, sleep anyway and retry at 08:30. First confirm Romain has his own Mac with Xcode, signed into David's Apple ID team. If not, he gets fixed build slots on David's Mac (03:00, 10:30, 12:30), because that Mac also runs the art script, signs both iPhones, mirrors the phone on stage and edits the video.
4. **03:00 Vlad and Romain (before sleep, while venue Wi-Fi is still in use):** Vlad pulls Gemma and its runtime onto the Jetson. Romain pulls the pose model. The 13:00 integration checks pose, Gemma and the WebSocket server running together on the Jetson.
5. **03:30 to 08:30: everyone sleeps.** No exceptions.
6. Game depends on: `FaceInput` mock (David, immediate), plugin (Romain, by 11:00), `pulse` and `light` messages (Vlad's WebSocket server, by 12:00).
7. Dashboard depends on: session schema (frozen at 03:00), simulated week generator (Vlad), stick figure stream (Romain, after Gate 2), `lake_trial` messages for the live stage panel.
8. Bedside light depends on: UNO Q serial protocol (Alex), Jetson WebSocket bridge (Vlad).
9. Stage demo mode depends on: a stored calibration for Alex, recorded at the 19:00 rehearsal.

### Gate 2, 12:00 go / no-go
- GO if: the plugin streams blink, wide, pitch to the game at 30 Hz or more on the demo iPhone, and Harbour, Lake, Sauna, Lighthouse play end to end in a dark room.
- NO-GO: Romain swaps in the MediaPipe adapter behind `FaceInput` by 14:00. The game does not change. Shoot in a lit set.

## 4. Tasks and checkpoints

| Owner | 12:00 | 16:00 | 20:00 (freeze) |
|---|---|---|---|
| **David** (game UI, patient view, pitch, video, deck, submission) | Greybox Harbour (calibration, check-in), Lake, Sauna, Lighthouse, dawn on the `FaceInput` mock, then on the plugin. Start, end, settings screens. Art retakes 08:30 to 10:00 | Art A integrated, colour filter, vitals layer, presets, session JSON sent, demo mode. Forest if green | Polished run under 2:00 in both profiles, stage demo mode rehearsed, deck outline, shot list final |
| **Alex** (bedside unit, IR sensor, UNO Q, enclosure, breathing demo) | KY-039 pulse, LED and Modulino knob on the UNO Q, serial lines `L`, `K`, `P` to the Jetson | Enclosure with pulse stone, light follows WebSocket commands, dawn fade correct, thermo logged | Bedside unit demo-stable, stage mode brightness, spare cables, breathing demo on the unit (pulse feedback at the bedside) |
| **Vlad** (outer loop, baseline, trend, clinic view, knob, LED, presence) | WebSocket server on the Jetson (message list in `SessionSchema.md`), mock event generator, travel router configured with fixed IPs | Baseline and robust z-scores on a simulated 14-day dataset, three alert domains, clinic view, Suggest-review rule, ingest of real session JSON, live `lake_trial` panel. 17:00: pre-generate the stage Gemma note as the default | Dashboard "two weeks in 20 s" with SIMULATED label, Gemma clinician note on the Jetson, presence live or labelled simulated |
| **Romain** (vision, pose, face, pulse from face, event format) | `AfferentFace` plugin streaming to JS (target 11:00), thresholds table implemented in `FaceInput` events, reaction-time timestamps from display link | Stick figure from the Jetson camera on the dashboard, camera off by knob press removes it at once | Thresholds tuned on 2 people incl. one with glasses, rPPG only if both gates passed (after 17:00), README technical section |

### Integration windows (45 min, everyone present)
- **13:00:** phone to WebSocket to bedside light, plus `pulse` into the game, on real hardware.
- **17:00:** full chain: real session JSON into the dashboard, stick figure and camera-off live.
- **19:00:** dress rehearsal of the stage demo and the video shot list. Second iPhone installed. Record and store Alex's calibration for stage demo mode.

Naps: 30 minutes in pairs between 14:00 and 16:00.

## 5. After freeze

- 20:30 to 22:30 video shoot (dark room set, see `DemoScript.md`).
- 22:30 to 01:00 David edits the video. Alex and Vlad finish the deck. Romain writes README and submission text.
- 01:00 to 07:30 sleep.
- 07:30 to 08:30 final check, claims check (search the submission for every forbidden phrase), upload by 08:30. Lock 09:30.

## 6. Cut order if behind (cut from the top)

1. rPPG from the face (KY-039 carries pulse).
2. Fork and keep the moment.
3. Birch forest.
4. Live Wi-Fi/BLE presence (show as simulated).
5. "Learns which parts help this person" (show as a labelled concept in the dashboard, simulated).
6. Gemma live generation (pre-generate the note on the Jetson and show it, still labelled on-device).
7. Generated art (flat code-drawn silhouettes in the same palette).
8. Live WebSocket link (replay a pre-recorded session JSON, said so on stage).

**Never cut:** calibration, lantern check-in, lake, sauna, lighthouse dawn, the real bedside light, stick figure and camera-off, simulated trend with label, crisis card and "Talk to someone".
