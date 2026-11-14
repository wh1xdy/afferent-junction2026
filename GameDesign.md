# Afferent game design spec

Version 1.0, Sat 14 Nov 2026, ~03:00. Outcome of the multi-agent design debate (see `Decisions.md`). Role models per mechanic are in `References.md`.

The game has no name of its own. It is the Afferent session.

## 1. Experience pillars

1. **Nothing can go wrong.** No fail state, no score, no streak, no "4 of 5". A miss only delays a reward, it never shrinks it. Every session reaches full-colour dawn.
2. **The body is the controller, gently.** The figure walks by itself. The player only looks, lifts their gaze, closes and opens their eyes and breathes. Every action is possible lying on your side in bed, with or without glasses.
3. **The world breathes with you.** The world reacts live and visibly to pulse, eyes and head in every segment except calibration. It is style, not judgement. A pulse above your own resting level makes the world warmer, softer and slower around you, as if it holds you. It is never harder and never colder (the Nevermind lesson inverted).
4. **Light comes back.** Polar night to morning in under two minutes. Each station returns one colour. At dawn the real bedside light rises with the in-game sun.
5. **Same ritual, honest data.** An identical 20-second calibration and fixed task timing every night, so the outer loop compares you only with yourself.

## 2. Perspective, look and core loop

- **Side view, portrait orientation, layered parallax** (7 layers, see `ArtBible.md`). The phone is held in front of the face so the front camera sees it. Portrait fits that grip.
- **Auto-walk left to right.** The faceless hooded figure walks at constant speed between stations and stops at each station. There is no steering. The lighthouse is visible at the right edge of the horizon from second 3 and grows as you approach.
- **Colour return.** Everything starts at saturation 0.05 (night grey, the lantern is the only warm pixel). Station colours: birch forest returns warm yellow, frozen lake returns blue, sauna returns green (northern lights), lighthouse brings dawn and full colour. Each colour belongs to its station, not to a position. A skipped station becomes a 3 s walk-through and its colour still returns. Dawn forces saturation 1 on all layers.
- **No words in the game.** Cues are image, light, sound and haptics only. Each calibration phase has a tiny eye glyph plus a sound cue. Words exist only on the start screen, end screen, settings and the crisis card.
- **Core loop per station:** arrive, the station invites one body action through light and sound, the world responds continuously while you do it, the colour blooms (1.5 s after success, 5 s after a timeout or miss, always to full colour), walk on.

### 2.1 Vitals-reactive layer ("the world breathes with you")

Runs from the end of calibration to the end of the session. Inputs are smoothed with a 1 s EMA (pulse) or 150 ms EMA (eyes, head).

| Input | Mapping (style only) | Where |
|---|---|---|
| Pulse, as delta from this session's calibration resting pulse (KY-039, or rPPG if locked) | Above resting +10 bpm: the world is held. Warm amber tint rises up to +15% (like the bad-day tint), fog drift slows to 0.6x, the lantern glow widens 10%, music tempo eases by up to 8%, reverb tail lengthens. At or below resting: standard palette. | Walks, check-in, sauna (calming segments) |
| Heartbeat (setting "Show heartbeat", off by default, on in the demo build) | Lantern flame pulses once per heartbeat. Above resting +10 bpm it switches to a fixed slow 60 bpm glow, so a racing heart is never mirrored back. When the setting is off, the flame glows at a fixed slow rhythm. | Everywhere after calibration |
| Pulse rising (activating segments) | Adds sparkle to the lantern and a few extra stars, capped at +15 bpm over resting. Above the cap nothing more happens. | Forest, fork, lake, lighthouse |
| Pulse falling (sauna) | Aurora intensity builds during each exhale, proportional to the fall, floor at a gentle default so a flat pulse still gets aurora. | Sauna |
| Eye openness | Lantern light radius (wider eyes, larger circle of light). | Everywhere after calibration |
| Head pitch up | More sky revealed, stars brighten. | Everywhere after calibration |

Rules: one pulse direction per segment, never both. Calibration has no live reaction at all. If no pulse source is available the pulse rows are off and the world reacts to eyes and head only. Nothing in this layer ever blocks progress.

## 3. Session timeline (good day, maximum durations)

Stations end early when the action succeeds, so typical runs are 10 to 20 s shorter.

| Time | Segment | Pulse direction |
|---|---|---|
| 0:00-0:02 | Fade in from black, one piano note, 3 s volume fade to a fixed low level | none |
| 0:02-0:22 | **Calibration at the harbour** (identical every session) | none, measured only |
| 0:22-0:29 | Lantern check-in | calming |
| 0:29-0:31 | Walk (1.6 s) | calming |
| 0:31-0:37 | Birch forest: lift your gaze | activating |
| 0:37-0:44 | Fork in the path (stretch scope) | activating |
| 0:44-0:46 | Walk (1.6 s) | calming |
| 0:46-1:10 | Frozen lake: blink at the flash (6 trials always fit) | activating |
| 1:10-1:12 | Walk (1.6 s) | calming |
| 1:12-1:44 | Sauna hut: eyes closed, slow breathing (extends only while eyes stay closed) | calming |
| 1:44-1:50 | Lighthouse: open your eyes wide | activating |
| 1:50-1:54 | Dawn sweep, bedside light rises | none |
| 1:54-1:58 | End screen "Rest well." then self-dims | none |

Maximum 1:57 good day (walks 1.6 s each). Bad day walks at 0.7x (2.3 s each), maximum 1:59. Without the fork (if cut) both lose 7 s. The only way past 2:00 is keeping the eyes closed in the sauna, which ends the session as `fell_asleep`.

Order rationale: reaction time comes before the sauna so that relaxation and drowsiness do not slow it. The sauna leads into dawn so the calm peak flows into the payoff.

## 4. Stations

Thresholds use per-person calibrated values. Definitions are in 4.0.

### 4.0 Signal definitions and thresholds (owned by Romain, one table)

- Source: ARKit `ARFaceTrackingConfiguration` blendshapes at 60 Hz through the `AfferentFace` plugin (`FaceInput` JS interface). Fallback build uses MediaPipe Face Landmarker blendshapes with the same normalisation.
- Per eye closure `n = clamp((v - O) / (C - O), 0, 1)`, where O and C are the calibration medians for `eyeBlinkLeft/Right` open and closed.
- If `C - O < 0.25` (glasses, low range, or the player did not close the eyes): use raw defaults, closed at `v >= 0.55`, open at `v <= 0.35`, and set `quality.eye_range_low = true`.
- **Closed**: both eyes `n >= 0.6`. **Open again**: `n <= 0.35` (hysteresis).
- **Spontaneous blink**: closed for under 300 ms. Never used as input. Counted only in calibration windows.
- **Long blink (confirm action)**: both eyes closed 400 to 1500 ms. 300 to 400 ms is a dead band and ignored.
- **Eyes closed (sauna)**: closed for 1.5 s or more.
- **Eyes wide**: `w = (eyeWide - Ow) / (W - Ow)`, trigger at `w >= 0.6` held 300 ms. If `W - Ow < 0.15`, use raw `eyeWide >= 0.35`. Also drives lantern radius continuously.
- **Head pitch**: face anchor transform in camera space (inverse camera transform times anchor transform) minus the calibration neutral. Independent of gravity, so it works lying on the side. **Gaze up**: pitch up 8 degrees or more, or `lookAtPoint.y` above the calibration neutral by 0.15.
- **Head turn (choice)**: yaw 12 degrees or more, held 300 ms, highlights that side. Confirmed with a long blink. Wink is accepted silently but never required or taught.
- **Blink reaction**: from the display-link timestamp of the flash frame to the ARFrame timestamp where `n` first crosses 0.5. Valid window 150 to 1500 ms. Under 150 ms is an anticipation, excluded. Accuracy about plus or minus 17 ms, adequate within person.
- **Tracked**: `ARFaceAnchor.isTracked`. Face lost means not tracked for more than 500 ms.

### 4.1 Harbour: calibration (0:02-0:22, always identical)

- **Role model:** Before Your Eyes (per-person blink calibration at the start) and Journey (teaching without text).
- **Sees and hears:** night harbour in grey, a moored boat, the figure on the pier holding the lantern, the lighthouse a tiny point on the horizon. Sparse single piano notes.
- **Sequence:**
  - 0 to 6 s: the lantern glows steadily. Player looks normally. Measures O (open), head neutral, ambient luma, blink count, pulse warm-up.
  - 6 to 9 s: the lantern dims to an ember, low tone, one soft haptic. Invites eyes closed. Measures C.
  - 9 to 12 s: the lantern flares gently, rising tone. Invites eyes wide. Measures W. No hold requirement.
  - 12 to 20 s: lantern settles, player rests. Blink count continues, resting pulse is computed over 12 to 20 s.
- **Input:** none required. Nothing waits for the player. If the player does not close or widen the eyes, defaults are used and flagged.
- **No wink check** (removed after patient advocate critique; a failed wink on night one would repeat every night).
- **Live adaptation:** none. Calibration is identical in both profiles and every session.
- **Logged:** `cal.eye_open_O`, `cal.eye_closed_C`, `cal.eye_wide_W` per eye, `cal.head_pitch_neutral_deg`, `cal.blink_rate_per_min` (windows 0 to 6 s and 12 to 20 s, 14 s total), `cal.eye_aperture_mean` (eye openness over the same windows), `cal.resting_pulse_bpm`, `cal.pulse_quality`, `cal.ambient_luma`, `cal.tracked_ratio`. All calibration values are normalisation parameters or context. None of them feeds the alert rule.
- **Ends:** always at 20 s.

### 4.2 Harbour: lantern check-in (0:22-0:29)

- **Role model:** Apple Health "State of Mind" (a single-item mood slider users already know), staged as a lantern.
- **Sees and hears:** the lantern flame grows and shrinks through 5 sizes. The smallest still glows warm at 60% brightness and looks beautiful. All five are the same warm hue.
- **Input:** head tilt (roll) left or right, or tap the left or right half of the screen, steps the flame size. Long blink or tap in the centre confirms. Starts at step 3.
- **Meaning:** explained once in words during onboarding ("Each night, set the lantern to how bright tonight feels"). Never explained in the game.
- **Live adaptation:** pulse calming layer active.
- **Fallback:** no confirmation within 7 s keeps the current flame, logged `mood_vas: null` (not 3).
- **Logged:** `mood_vas` 1 to 5 or null, `completed_by`.
- **Never** triggers anything on its own (no crisis card, no session end). Only the clinic trend sees it.
- **Ends:** on confirm or at 7 s. The figure walks on, lantern at the chosen size. The lantern size does not change the brightness of the world.

### 4.3 Birch forest: lift your gaze (0:31-0:41), returns warm yellow

- **Role model:** Flower (a gentle body tilt steers something soft) and Sky: Children of the Light (carried light pushes back the dark).
- **Sees and hears:** birch trunks in grey. High in the canopy at the top of the screen, a faint warm light. Cello enters softly.
- **Input:** gaze up (pitch up 8 degrees or more, or `lookAtPoint` up). Lantern radius grows continuously with pitch, and the birches turn warm yellow from the roots upward as cumulative gaze-up time builds.
- **Target:** 3 s cumulative gaze up, identical in both profiles.
- **Framing:** never mention posture. It is "lift your gaze to the light".
- **Live adaptation:** activating pulse layer (sparkle). Lantern radius EMA 200 ms.
- **Fallback:** face lost, see section 8. Touch and hold also counts as gaze up.
- **Logged:** `forest.gaze_up_seconds`, `forest.max_pitch_up_deg`, `forest.time_to_target_s`, `completed_by`. Because the player is cued to look up, this measures how quickly a cue is followed, not spontaneous downcast gaze. Only `time_to_target_s` is kept, as context, never in the alert rule.
- **Ends:** at target (bloom 1.5 s) or at 6 s max (bloom 5 s). Always yellow.

### 4.4 Fork in the path (0:41-0:48), stretch scope

- **Role model:** Celeste strawberries (an optional harder route for a reward with no mechanical value), Before Your Eyes "look, then blink" selection.
- **Paradigm:** a single-trial effort choice in the spirit of the EEfRT. Claim only "effort choice", never "reward learning".
- **Sees and hears:** the path splits. The flat shore path is lit and lovely. The summit path climbs a small hill. A glint over the hill hints at the bonus.
- **Input:** turn the head towards a path (yaw 12 degrees, 300 ms; right = summit, left = shore), it glows. Long blink or a tap on that half of the screen confirms. Choice window 3 s. **Summit cost:** while climbing, eyes wide for 3 s cumulative within 4 s. The same cost in every profile and every session (comparability).
- **Reward:** summit adds a shooting star over the lake and a denser aurora later. Reward size varies across sessions (1, 2 or 3 shooting stars, shown as glints at the fork), logged. The flat path gets full colour and the same ending.
- **No comment on the choice**, ever.
- **Fallback:** no choice in 3 s, the figure takes the flat path, logged `choice: none`. If the summit cost is not met in 4 s, the figure still reaches the top without the bonus, logged `effort_completed: false`.
- **Logged:** `fork.reward_level`, `fork.choice` (summit/flat/none), `fork.effort_completed`, `completed_by`.
- **If cut:** 2 s walk past a signpost. Do not mention effort-based decision making anywhere in the pitch.

### 4.5 Frozen lake: blink at the flash (0:50-1:10), returns blue

- **Role model:** Animal Crossing fishing (a random wait, then a clear cue, react, a miss just means you cast again).
- **Paradigm:** simple reaction time, measured as blink reaction time. Psychomotor slowing has one of the most robust associations with depression.
- **Sees and hears:** the figure stands on dark ice. The lighthouse beam sweeps. Each trial, the beam sweeps across the ice as a soft warm flash (never white, no strobing) with a soft, low glass bell on the same frame. Flash brightness: at most +25% over the current scene luminance in a dark room (`dark_room`), otherwise at most 50% screen luminance.
- **Input:** blink when the flash appears. A tap counts as a separate modality.
- **Timing (fixed in every profile, never adaptive):** 6 trials, foreperiod uniform random 1.0 to 2.5 s, response window 150 to 1500 ms. The next foreperiod starts at the response (or at window end). Blooms run in parallel and never delay the next trial, so 6 trials always fit in 24 s.
- **Feedback:** a valid blink sends cracks of blue light through the ice from the figure's feet (1.5 s bloom). A miss or anticipation: the ice glows softly anyway, 5 s slower bloom, no sound change, the next trial follows. The patient never sees numbers or any sign of adaptation.
- **Live adaptation:** none on timing. Activating pulse layer only.
- **Logged:** `lake.trials[]` (foreperiod_ms, rt_ms or null, outcome hit/miss/anticipation, modality blink/tap), `lake.rt_median_ms` (hits only), `lake.misses`, `lake.anticipations`, `lake.modality`, `lake.trials_completed`, `lake.valid` (true only if 6 trials completed and at least 4 hits). Lapses are computed by the outer loop as RT above the personal baseline median plus 3 MAD, not by a fixed 500 ms cut-off.
- **Ends:** after 6 trials (max 24 s). The whole lake glows blue.

### 4.6 Sauna hut: eyes closed, slow breathing (1:12-1:44), returns green

- **Role models:** Apple Watch Breathe (paced breathing with haptic taps), Celeste chapter 4 feather (breathing as a mechanic), DEEP (slow breath moves the world), Before Your Eyes (the world changes while your eyes are shut).
- **Paradigm:** slow paced breathing at 6 per minute (4 s in, 6 s out). Never faster.
- **Sees and hears:** the figure sits on the sauna bench by the stove. The stove glow swells and recedes for one lead-in cycle, then the screen dims to 10% exposure and audio goes low-pass. Pacing continues in **haptics and sound** (a pad swells on inhale, falls on exhale, soft rising haptic taps on inhale), because a visual pacer is invisible with closed eyes. Stove crackle.
- **Input:** eyes closed (1.5 s or more) invited by the dimming. Eyes may open at any time with no penalty, the guide simply continues. Optional: fingertip on the bedside pulse stone (KY-039).
- **Duration:** 2 s lead-in plus 3 cycles of 10 s (30 s) in both profiles.
- **Live adaptation:** calming pulse layer. Pulse falling builds aurora intensity during each exhale (with a non-zero floor). Pulse rising does nothing visible here except the warm held tint.
- **The reveal:** when the eyes open after the third cycle (or at any open after the second), the screen returns to full exposure and the green northern lights fill the sky on the same frame as the pad resolves.
- **Falling asleep:** if the eyes are still closed when cycle 3 ends, the hut holds quietly (pacing stops, the pad fades slowly) until the eyes open (then the reveal) or until 60 s of closed eyes in total. Then the game fades to black and the session is saved as `status: fell_asleep`. Lighthouse, dawn and the bedside light rise are skipped, so nobody is woken. It is a kind ending, logged separately from breathing completion.
- **Fallback:** no pulse, aurora at default intensity. Eyes cannot or do not close, breathing guide still runs, logged `eyes_closed_ratio`. If the eyes never closed, the reveal happens at 32 s.
- **Logged:** `sauna.eyes_closed_ratio`, `sauna.pulse_start_bpm` (mean over lead-in plus cycle 1), `sauna.pulse_end_bpm` (mean over cycle 3), `sauna.pulse_delta_bpm`, `sauna.pulse_source`, `sauna.pulse_quality`, `sauna.pulse_valid` (true only with quality 0.7 or more and contact throughout; single samples are dominated by breathing-related heart rate swings at 6 per minute), `completed_by`.
- **Ends:** on eye opening after cycle 3, at 32 s if the eyes are open, or as `fell_asleep`. Always green.

### 4.7 Lighthouse: open your eyes wide (1:44-1:50), brings dawn

- **Role models:** Journey's final ascent (the emotional template), Before Your Eyes keep-your-eyes-open moments, Gris colour sweep.
- **Sees and hears:** the figure at the foot of the lighthouse. Its lamp is dark. The lantern light climbs up the tower.
- **Input:** eyes wide, 2 s cumulative, identical in both profiles. The wide threshold halves after 3 s (strain guard). Touch and hold also works.
- **Framing:** an ending gesture. Never "alertness".
- **Live adaptation:** activating pulse layer, eye openness drives the beam swell.
- **Logged:** `lighthouse.time_to_target_s`, `completed_by`.
- **Ends:** at target or 6 s. The beam swells into the dawn sweep.

### 4.8 Dawn (1:50-1:54) and keeping the moment

- **Role model:** Gris colour return sweep, Journey summit.
- **Sees and hears:** colour washes left to right through all layers in 4 s, sun disc rises, full piano phrase in the home key. The screen glow border turns warm amber `#FFC98A`. The dawn screen stays below the brightness of the sauna reveal.
- **Bedside light:** the phone sends `light` with the same hex, the bedside LED rises over 4 s to the knob level (quiet night default 15%, cap 25%), holds 30 s, then fades off. Stage mode uses `#FFF3DC` at up to 100%.
- **Keep the moment (stretch):** on the end screen, one long blink or a tap keeps tonight's dawn as a glowing stone. **Role model:** Before Your Eyes (blink to take a photo), Alba (photographing moments). Replaces the double-blink idea, which would false-trigger. Stones are never counted or shown as a collection.

## 5. Good day and bad day profiles (demo presets)

Profiles change starting state, pace and visuals only. They never change calibration, the station set, any task target, RT timing, the summit cost or the breathing pace. In the product the starting state follows the most recent lantern check-in only, never the clinic trend, and never changes a task parameter. In the demo they are labelled "demo profile".

| Parameter | Good day | Bad day |
|---|---|---|
| Starting fog | thin, density 0.3, drift 1.0x | dense low fog, density 0.8, drift 0.6x |
| Stars at start | yes (180) | none |
| Faint aurora hint at start | yes, 10% | no |
| Starting tint | neutral night grey | warm amber tint +12% (held, never darker) |
| Lantern base size | 1.0x | 1.3x (more light around you) |
| Walk speed | 1.0x (walks 1.6 s) | 0.7x (walks 2.3 s) |
| Music | 72 bpm, arpeggiated piano | 60 bpm, sparse single notes, longer reverb |
| Task targets | identical | identical |
| Bloom on success | 1.5 s | 1.5 s |
| Max total | 1:57 | 1:59 |

The 10-second test: in a split screen the bad day is visibly foggier, starless, warmer, slower and sparser within 3 s of fade-in. Both arrive at full dawn.

## 6. Bedside device during a session

- **Bedside light (RGB LED):** before the session, dim warm `#FFD9A0` at 5%. During the session it mirrors the current station colour at 5 to 10% (faint yellow in the forest, blue at the lake, green in the sauna). At dawn it rises over 4 s to the knob level in warm amber `#FFC98A`, holds 30 s, fades off over 10 s. "Quiet night" (default on) sets dawn to 15% and caps it at 25%. Stage mode uses `#FFF3DC` and allows 100%. After `fell_asleep` the light stays off.
- **Knob (Modulino):** turning sets the bedside light level (dawn target). Pressing toggles the bedside camera on/off. When off, the stick figure on the dashboard disappears at once and the LED gives one short dim blink to confirm.
- **Pulse stone (KY-039 on the UNO Q):** an optional fingertip rest on the enclosure. Contact is auto-detected. The pulse streams to the phone at 1 Hz for the vitals layer. It is the pulse we claim.
- **Thermo module:** room temperature and humidity logged once per session as context.
- **Bedside camera (Jetson):** pose estimation for the stick figure on the clinic dashboard. Frames are processed in memory and never stored or sent. The phone never streams video.
- **Gemma (on Jetson, offline):** writes a short weekly clinician note from the session summary numbers, shown next to those numbers and labelled "generated on device". Never patient-facing, never in the crisis path, never advice.
- **Transport:** see `SessionSchema.md` section 3 (WebSocket over a local travel router).
- **If the bedside device is offline:** the game runs fully standalone. Light events are dropped. The session summary is buffered and sent on reconnect.

## 7. Screens outside the game

### Start screen
- **Role model:** Alto's Odyssey Zen Mode (the player chooses low stakes).
- Dark, one warm lantern. Two equally sized buttons: "Begin" and "Not tonight".
- No greeting by name, no "how are you", no day count, no streak. The patient's own camera image is never shown.
- Top corners: a small eye icon showing camera state (tap to toggle), a settings icon, and a "Talk to someone" icon (always visible).
- "Not tonight" logs a neutral `declined` record and closes. No follow-up notification that night. At most one gentle reminder per day at a time the patient chooses, off by default.
- Onboarding says in one sentence: "Saying not tonight, or not sharing tonight, is an answer. It never counts as a missed night."

### End screen
- **Role model:** Journey's ending (no score, credits with no numbers).
- Full-colour dawn, the figure rests on the shore. One line: "Rest well." No numbers, no comparison with yesterday.
- "Talk to someone" icon visible. Optional keep-the-moment (stretch). After 4 s the screen dims itself to black and the app closes the camera session.

### Settings (one tap from the start screen)
- Per-sensor switches, each on/off, remembered: Phone camera, Pulse stone, Bedside camera, Bedside light, Presence (home/away and visitors count).
- Camera off means the game is fully playable by touch: tap equals blink, hold equals eyes wide or gaze up, tap halves equal head turn.
- "Clinic sees": summary (default) / nothing tonight / pause sharing 7 days.
- Sound: on / silent (haptics only). Remembered. Every session starts at a fixed low level (25% of system volume, adjustable and remembered), never at the daytime media volume.
- Show heartbeat: off (default) / on.
- Quiet night: on (default) / off.
- Weekly check-in: on by default in the pilot, agreed with the clinician at discharge, daytime slot only, skippable, and the patient can switch it off.
- "Talk to someone": clinic number, emergency number 112, MIELI Crisis Helpline (09 2525 0111, verify before submission).

### Crisis path (fixed, never AI)
- **Triggers:** only self-report. The weekly check-in (outside the game, daytime, one screen, skippable): two PHQ-2 style items plus one item on thoughts of self-harm. A positive self-harm answer, or the patient tapping "Talk to someone".
- **Never triggers:** lantern level, pulse, eye or head signals, missed sessions. These only feed the clinic trend.
- **Response:** a fixed, human-written card, shown immediately from the check-in or from "Talk to someone": "If tonight is heavy, you do not have to carry it alone." Buttons: call the clinic, call 112, MIELI Crisis Helpline. If a self-harm answer created a flag, the card says plainly: "Your clinic will see this on the next working day. If you need someone now, call 112 or MIELI."
- **Receiver:** a self-harm flag goes to a named clinic contact under a protocol agreed at discharge, reviewed within one working day.
- **Stated plainly in onboarding and the pitch:** Afferent is not monitored 24/7 and is not an emergency service.

## 8. Accessibility and failure handling

| Situation | Behaviour |
|---|---|
| Glasses | ARKit tracks through most glasses. If eye range is low after calibration, raw default thresholds and `quality.eye_range_low`. Glasses are never required to be removed. |
| Dark room | ARKit TrueDepth tracks in the dark. Glow border rests at 10%. It rises to max 50% only in the sauna and only if luma is below 40/255, rPPG is enabled and quiet night is off (the player's eyes are closed there). rPPG and body pose are off below that luma. |
| Cannot wink | Wink is never required. Choices use head turn plus long blink, or tap. |
| Eyes or face not detected | After 500 ms the world holds in soft fog, nothing fails. After 3 s a soft glow pulses under the thumb area (no text) and touch input takes over for the rest of that station. Station timers keep running. |
| No pulse lock | Pulse rows of the vitals layer off. Aurora at default. `pulse_bpm: null`, quality 0. Never stalls. |
| Implausible pulse (under 40 or over 150 bpm) | Logged as low quality, excluded from features. No message, no pause, game continues. |
| Skip | Two-finger touch and hold for 1 s skips the current station (one-finger hold is reserved for gaze up and eyes wide). Its colour returns through a 3 s walk-through. |
| Exit | Swipe down exits immediately, no "are you sure". Saved as partial. |
| Falls asleep | Eyes closed 60 s in total in the sauna, fade to black, saved as `status: fell_asleep`, no dawn and no light. |
| Sound off | Silent mode: haptics replace cues (flash, breathing). |
| Motion sensitivity | Parallax amplitude halves with iOS Reduce Motion. Flashes never strobe and stay under 70% luminance. |
| Every auto, tap or skip | Flagged per station `completed_by: signal / tap / auto / skip`. Only `signal` data enters the trend for that feature. |

## 9. Approved claims per mechanic

General: "supportive home maintenance after TMS", "early warning for the care team", "compares you only with yourself", "suggests the clinic take a look, the clinician decides", "based on established lab paradigms".

| Mechanic | Approved phrase | Never say |
|---|---|---|
| Calibration | "a 20-second identical ritual so nights are comparable" | "baseline diagnosis" |
| Blink rate, eye aperture | "we log blink rate and eye openness as context" | "dopamine", "fatigue detection", "alertness" |
| Lantern check-in | "a one-tap mood check-in, like a mood slider" | "detects mood" |
| Gaze up | "how quickly you follow a cue to look up, logged as context" | "fixes posture", "measures downcast gaze" |
| Fork | "an effort choice inspired by lab effort tasks" | "reward learning", "motivation score" |
| Lake | "blink reaction time; psychomotor slowing is one of the most robust lab findings in depression" | "detects relapse", comparison with keypress norms |
| Sauna | "slow paced breathing at six breaths a minute with pulse feedback" | "HRV", "treats anxiety" |
| Pulse | "pulse from the bedside sensor" | "HRV", "stress detection" |
| Lighthouse | "the ending gesture" | "alertness" |
| Vitals layer | "the world responds to your pulse and eyes" | "reads your emotions" |
| Trend | "if two of three measures (reaction time, mood check-in, missed nights) drift from your own baseline for about a week, the care team gets a note; a starting rule for a pilot" | "predicts relapse", "clinically validated" |
| Booster | "a booster is one option the clinician may consider" | "books TMS", "prevents relapse" |

Always forbidden: "treats depression", "prevents relapse", "detects emotions", "diagnoses", "HRV", "measures alertness", "detects relapse", "reward learning", "clinically validated".
