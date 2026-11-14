# Afferent game design spec

Version 3.0, Sun 15 Nov 2026 (overnight build). Section 0 describes the game as built in `demo/` and overrides sections 1 to 11 wherever they differ. Sections 1 to 11 are the v2.0 spec (Sat 14 Nov), which replaced the v1 concept (eye and head gestures as controls). Decisions and the reasons for each change are in `Decisions.md` (v3 rows X1 to X36); role models per element are in `References.md`.

The game has no name of its own. It is the Afferent session.

## 0. v3: the game as built

Everything in sections 1 to 11 still holds (touch-only play, vitals-driven director, Among Us style tasks, night rule, crisis path) except the points below.

### 0.1 Session timeline (v3)

| Time | Segment | What happens |
|---|---|---|
| 0:00-0:02 | Fade in | The world fades up from black |
| 0:02-0:08 | **Rest** (fixed core) | 6 s of stillness: resting pulse, spontaneous blink rate, eye openness, head pitch, ambient light. The lantern glows at a fixed slow rhythm |
| 0:08-0:18 max | **Start check-in** (fixed core) | Five lanterns in a panel; one tap picks the one that fits today. 10 s at most; no answer is fine and logged as null |
| ~0:18-0:30 | **Reaction trials** (fixed core) | The lantern flares 5 times (foreperiod 1.0 to 2.5 s, window 1500 ms); the player taps each time. Lapse over 1000 ms, anticipation under 150 ms. A tap glyph pulses for the first 3 s. Capped at 24 s |
| ~0:30-1:46 | **Play** | Walk, task, walk, task, in fixed slots (0.2). Play ends about 106 s after the start, with at least 60 s and at most 76 s of play. A task never runs past the end of play by more than 3 s |
| ~1:46-1:50 | Dawn | Colour sweeps left to right, the sun rises, the bedside light rises |
| ~1:50 | End screen | "Good morning." in the morning, "Rest well." at night, the end check-in (the same five lanterns), "Talk to someone". The screen dims 1.2 s after the tap, or after 20 s without one |

Stage mode (demo chip "stage mode (60 s)") keeps the same order with 60 s of play. A night session in rest mode can still end early as `fell_asleep` (30 s of closed eyes, X35).

### 0.2 Task slots

| Slot | Task | Notes |
|---|---|---|
| 1 | **Fork** (measurement, X5, X20) | Two choices, 6 s each to decide. Short path: tap 3 slow lights (about 2.5 s), reward 1 glow. Climb: tap 8 faster lights (about 6 s), reward 2 or 3 glows. Identical every session. No choice takes the short path and logs `none` |
| 2 | Adaptive task | Picked by the director from the current mode, weighted by the hub's bandit weights (X9); flow tasks are uniform (X18) |
| 3 | **Two lanterns** (measurement, X5, X21) | 12 trials: two lanterns flare, one 8% larger; tap the larger one. Amber is the rich lantern, silver the lean one, 3 rich and 1 lean reward per session (3:1). Gives response bias (log b with 0.5 correction), exploratory |
| 4+ | Adaptive tasks | Until play time runs out |

In practice a morning session has **4 to 6 tasks**, usually 5 or 6: Fork, one adaptive task, Two lanterns, then one to three adaptive tasks until play time runs out (fewer when a long breath task comes up; breath drops to one cycle when time is short). The adaptive task set is the eight tasks of section 5.

At night in rest mode, Fork and Two lanterns are skipped, not replaced, and logged with `skip_reason: rest_mode` (X19). Rest mode plays one breath task without end until play time runs out, then dawn (or `fell_asleep`).

An unengaged session (no tap or key, not autoplay) is stored as `partial`; Fork ends after one round and Two lanterns after 3 unanswered trials when nobody responds (X36).

### 0.3 Mood check-in (v3, X3)

Two check-ins per session, at the start (inside the fixed core) and on the end screen, feeding `pre_post.mood` (1 to 5). Five lanterns of the same shape, from cool and dim to warm and bright, so colour and brightness rise together and the scale stays ordinal:

| Value | 1 | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|
| Colour | `#34476E` | `#5A7CA6` | `#A9A79A` | `#E8B867` | `#FFCB5C` |
| Glow | 35% | 50% | 65% | 82% | 100% |

This replaces the v2 "five flame sizes" end-only check-in. Mood 1 at both check-ins of one session offers the crisis card (offered, never forced; X26).

### 0.4 Profiles (demo, X8)

The demo chip "day:" switches between `live` (adaptive, the default), `good_day` and `bad_day`. The two presets set the simulated starting vitals and the starting world (fog, stars, warmth), so the difference is visible within 10 s; they are labelled SIMULATED. Real use is always adaptive.

### 0.5 What each task records (X6)

Every task logs the stimulus and the body response: pulse at start, minimum, maximum, end and delta, intended direction, `helped` (at least 2 bpm in the intended direction), time to target, recovery slope (calm), head pitch delta, eye openness, PERCLOS, errors and completion. `helped` feeds the hub's Thompson sampling, shown on the dashboard as "What helps Anna" with its uncertainty.

### 0.6 Words on screen

Start screen: "Begin" and "Not today" ("Not tonight" at night), plus icons for sound, camera, settings, info, "Your week" and "Talk to someone". End screen: "Good morning." or "Rest well.". The game itself stays wordless.

### 0.7 Render scale

The world canvas renders at the device pixel ratio, capped at 2. On touch devices it steps down once to 1.5 when the 95th percentile frame time stays above 20 ms for two 3 s windows during a session. `?scale=1.5` forces a scale; `?perf=1`, a three-finger tap or Shift+F toggles a hidden frame-time overlay (fps, frame and draw p50/p95, render scale, tint cache), for measuring on the demo phone.

## 1. Experience pillars

1. **Touch to play, the body steers in the background.** The player only taps, drags and holds, like in any phone game. Pulse and eye closure are read passively and act as stimulation values: they decide what the game offers next. Nobody has to perform with their face.
2. **Every session is different.** A director (modelled on the Left 4 Dead AI Director) reads the vitals live and chooses mode, world, music, light, task and difficulty. High pulse leads to calm, low pulse to activation, eyes that keep closing to a gentle wake-up (in the morning) or to rest (at night).
3. **Nothing can go wrong.** No score, no streak, no failure. Every task times out gracefully, mistakes make the next task easier, and every session reaches dawn.
4. **Light comes back.** Polar night to morning in under two minutes. Each finished task returns one colour. At dawn the real bedside light rises.
5. **One short fixed core, then freedom.** About 20 seconds that are identical every time (start pulse and reaction time), so the clinic can compare nights. Everything after the core is adaptive.

## 2. Perspective, look and core loop

- **Side view, portrait, layered parallax**, faceless hooded figure with a lantern, small Finnish island in polar night (see `ArtBible.md`).
- **The world is built live from biome chunks.** Each new stretch of path is chosen by the current mode: sauna (calm), birch forest (flow), frozen lake (wake), bright shore (fatigue), quiet harbour (rest). The lighthouse is always on the horizon.
- **Core loop:** the figure walks for about 3 seconds to the next spot, a task panel opens (3 to 20 seconds, like an Among Us task), the task finishes or times out, one colour returns, walk on. After about 85 seconds of play the next walk leads into dawn.
- **No words in the game.** Tasks explain themselves through layout, motion and a small hint glyph. Words appear only on the start screen, end screen, settings and crisis card.

## 3. Session timeline

| Time | Segment | What happens |
|---|---|---|
| 0:00-0:02 | Fade in | One piano note, sound fades in to a fixed low level |
| 0:02-0:24 max | **Fixed core** | 0 to 7 s: the lantern glows, the player rests (start pulse, eye-open baseline). Then the lantern flares 5 times at random intervals (1.0 to 2.0 s); the player taps each time (reaction time). A pulsing tap glyph appears at 5 s. Ends after the 5th trial, at most 22 s |
| ~0:24-1:49 | **Adaptive play** | Walk, task, walk, task. Usually 6 to 9 tasks. The director picks each task when the walk starts |
| ~1:49-1:53 | Dawn | Colour sweeps left to right, the sun rises, the bedside light rises |
| ~1:53-1:59 | End screen | "Rest well." Optional one-tap lantern check-in (mood 1 to 5). Then the screen dims |

Total under 2:00. The only exception is a night session where the player falls asleep, which ends quietly and early.

## 4. The director

### 4.1 Inputs (all passive)

- **Pulse** from the bedside pulse stone (KY-039 on the UNO Q, fingertip of the free hand) at 1 Hz. rPPG from the face is a stretch goal. Without pulse the director uses fatigue only and otherwise stays in flow.
- **Personal baseline pulse**: median of the start pulse over the first 7 valid sessions, then rolling. Not tonight's value, so a stressed evening is recognised as stressed.
- **Eye closure** from the front camera: only the blink value (ARKit `eyeBlinkLeft/Right`, or MediaPipe Face Landmarker in the fallback build). No gestures, no expressions. A frame counts as closed when the mean blink value is above the eye-open baseline plus 0.35 (capped at 0.75). Without camera, fatigue detection is off.
- **Clock**: night is 21:00 to 06:00 local time.

### 4.2 Signals

- **Arousal** `a = EMA_3s((pulse - baseline) / 10)`.
- **Fatigue** `f = EMA_2s(clamp(2 * PERCLOS_20s + 0.12 * long_closures_20s, 0, 1))`, where PERCLOS is the share of closed frames in the last 20 s and a long closure lasts more than 0.5 s. This is the measure driver drowsiness systems use.

### 4.3 Mode selection

| Rule (first match wins) | Mode |
|---|---|
| `f >= 0.45`, morning or day | **fatigue** (gentle wake-up) |
| `f >= 0.45`, night | **rest** (let them sleep) |
| `a >= 0.8` (about 8 bpm over baseline) | **calm** |
| `a <= -0.3` (about 3 bpm under baseline) | **wake** |
| otherwise | **flow** |

- A new reading must hold for 3 s before the mode switches (hysteresis). The first mode is set directly when the core ends.
- The **style** (light, music, fog, speed) follows the current mode continuously. The **task** is chosen at the start of each walk and keeps its mode until it ends, so each task has one pulse direction: calm and rest want the pulse to fall, wake and fatigue want it to rise, flow has none.
- **Intensity** `k` (0 to 1) per mode: calm `(a - 0.5) / 1.5`, wake `-a`, fatigue `f`, flow 0.4, rest 0.5. Then adjusted by the previous task: more than 2 errors lowers `k` by 0.15, no errors raises it by 0.1.
- **Night rule:** at night the game never fights tiredness. If the eyes stay closed for 30 s in a row, the game fades to black, saves `status: fell_asleep`, and skips dawn and the light rise.

### 4.4 Modes

| Mode | World | Music | Bedside light | Walk speed | Tasks |
|---|---|---|---|---|---|
| calm | sauna, warm tint, fog, slow drift, few stars | 54 bpm, sparse, pad | warm amber `#FFC98A`, 8% | 0.6x | breath, löyly |
| flow | birch forest | 66 bpm | warm `#FFD9A0`, 8% | 1.0x | aurora threads, constellation |
| wake | frozen lake, lighthouse beams, many stars, sparks | 76 to 96 bpm with `k`, arpeggios | cool white `#DDEBFF`, 20% | 1.35x+ | fireflies, beacon, bells |
| fatigue (day) | bright shore, daylight rising, strong beam | 84 bpm, bright | daylight `#F4F7FF`, 40% | 1.2x | shutters, bells, beacon |
| rest (night) | quiet harbour, dim, fog | 50 bpm, very sparse | off | 0.4x | breath without end |

## 5. Tasks (minigames)

All tasks happen in a panel over the world (except breath, which happens in the sky), take one finger, cannot fail, show progress as small glowing dots, and log `items`, `errors`, `duration_ms`, `completed_by` (`touch` or `auto` on timeout), `intensity` and `pulse_delta_bpm` (pulse at the end minus pulse at the start).

| Task | Mode | Role model | What the player does | Intensity changes | Timeout |
|---|---|---|---|---|---|
| **Breath** | calm, rest | Apple Watch Breathe, Celeste feather | A circle in the sky grows for 4 s and shrinks for 6 s (6 breaths per minute). Hold a finger (or Space) while it grows, let go while it shrinks. Haptic tap at each inhale. 2 cycles | none (pace is fixed at 6 per minute) | 20 s |
| **Löyly** | calm | Among Us: Swipe Card | Drag the ladle slowly from the bucket to the sauna stones. A pour that takes 2 s or longer makes a big soft steam cloud; a faster one only splashes. 2 pours | none | 20 s |
| **Aurora threads** | flow | Among Us: Fix Wiring | Drag three coloured threads of northern light from the left to the matching colour on the right | none | 14 s |
| **Constellation** | flow | Among Us: Unlock Manifolds | Tap five stars from smallest to largest; lines connect them | none | 12 s |
| **Fireflies** | wake | Among Us: Clear Asteroids | Tap 5 to 8 fireflies flying around the panel; they fly into a jar that glows brighter | count and speed rise with `k` | 12 s |
| **Beacon** | wake, fatigue | Among Us: Calibrate Distributor | A lighthouse beam rotates; tap when it touches the boat. 3 hits | rotation speed rises with `k` | 13 s |
| **Bells** | wake, fatigue | Among Us: Start Reactor | Three bells ring a sequence; repeat it by tapping. After two mistakes the sequence gets shorter | sequence length 3 to 4, tempo | 16 s |
| **Shutters** | fatigue | Among Us: Swipe Card | Swipe up four wooden shutters; morning light floods the panel and the world | none | 12 s |

Mistakes are never shown as failure: a wrong bell replays the sequence, a missed tap dims the beam for a moment, a wrong thread snaps back.

## 6. Colour return and dawn

- Each finished task blooms the next colour group: warm yellow, then blue, then green (bloom 1.5 s after a finished task, 5 s after a timeout).
- Dawn always forces full colour on every layer, whatever happened before.
- Dawn light: in the morning the bedside light rises to 60% `#FFF3DC` (a sunrise alarm clock effect). At night it rises to the knob level in warm amber `#FFC98A` (quiet night default 15%, cap 25%). It holds 30 s and fades out.

## 7. Vitals-reactive style (always on during play)

- Never mirror a racing heart: the lantern pulses at a fixed slow rhythm, never at the live pulse.
- High pulse makes the world warmer, foggier and slower (calm style). Low pulse makes it clearer, starrier and faster (wake style). Fatigue brings daylight and a stronger beam; at night it brings dimness instead.
- Nothing in the style layer ever blocks progress or makes a task harder.

## 8. Bedside device during a session

- **Bedside light:** 5% warm before the session, then follows the mode (section 4.4), then dawn (section 6). After `fell_asleep` it stays off.
- **Pulse stone (KY-039):** the free hand's fingertip rests on it; contact is detected; pulse streams to the phone at 1 Hz. This is the pulse we claim.
- **Knob:** turning sets the night dawn level; pressing toggles the bedside camera (the stick figure on the dashboard vanishes, the LED blinks once).
- **Bedside camera (Jetson):** pose for the stick figure on the clinic dashboard. Frames stay in memory, never stored or sent.
- **Gemma (on the Jetson, offline):** writes a short weekly clinician note from the session numbers, shown beside them, labelled "generated on device". Never patient-facing.
- **Offline:** the game runs fully on the phone; light messages are dropped and the summary is sent on reconnect.

## 9. Screens outside the game

- **Start screen:** lantern, two equal buttons "Begin" and "Not tonight", icons for sound, camera state, info and "Talk to someone". No greeting, no streak, never the camera image.
- **During the session:** one small close button (top left). Closing saves the session as partial, no confirmation.
- **End screen:** dawn, "Rest well.", the optional lantern check-in (five flame sizes, one tap; not answering is fine and logged as null), "Talk to someone".
- **Settings:** per-sensor switches (phone camera, pulse stone, bedside camera, bedside light, presence), "Clinic sees: summary / nothing tonight / pause sharing 7 days", sound on or off (session always starts at 25% of system volume), quiet night on (default), weekly check-in (on by default in the pilot, agreed at discharge, switchable off).
- **Without camera** the game plays normally; only fatigue detection is off. **Without pulse** the director runs on fatigue only.

### Crisis path (fixed, never AI)

- Triggered only by self-report: the weekly daytime check-in (PHQ-2 style items plus one self-harm item) or tapping "Talk to someone". Never by pulse, eyes, tasks or missed sessions.
- Fixed card: "If tonight is heavy, you do not have to carry it alone." Call the clinic, call 112, MIELI Crisis Helpline (09 2525 0111, verify before submission). After a self-harm answer: "Your clinic will see this on the next working day. If you need someone now, call 112 or MIELI." The flag goes to a named clinic contact, reviewed within one working day.
- Stated in onboarding and pitch: not monitored around the clock, not an emergency service.

## 10. Accessibility and failure handling

| Situation | Behaviour |
|---|---|
| Face not visible, glasses, dark room | Fatigue is simply not detected for that stretch (ARKit tracks in the dark; MediaPipe needs light). The game is unaffected |
| No pulse contact | Director uses fatigue only, otherwise flow. Logged `pulse_source: null` |
| Implausible pulse (under 40 or over 150) | Ignored by the director, logged as low quality, no message |
| Too hard | Tasks time out gracefully; the next task gets easier |
| One hand only | Every task works with one finger; the pulse stone is optional |
| Sound off | Haptics carry the breath pacing and task feedback |
| Reduce Motion | Parallax halves, no screen flashes |
| Exit | Close button, saved as partial |
| Falls asleep (night) | 30 s eyes closed, fade to black, no dawn, no light |

## 11. Claims per element

General: "supportive home maintenance after TMS", "early warning for the care team", "compares you only with yourself", "the clinician decides".

| Element | Approved phrase | Never say |
|---|---|---|
| Director | "the game adapts to your pulse and to signs of tiredness" | "reads your emotions", "detects stress", "measures anxiety" |
| Pulse | "pulse from the bedside sensor, compared with your own baseline" | "HRV", "stress detection" |
| Eyes | "notices when your eyes keep closing, like a car's drowsiness alert" | "detects fatigue disorders", "measures alertness", "dopamine" |
| Core reaction task | "reaction time; psychomotor slowing is one of the most robust lab findings in depression" | "detects relapse" |
| Calm tasks | "slow paced breathing at six breaths a minute" | "treats anxiety" |
| Wake tasks | "short activating tasks when your pulse is low" | "treats fatigue", "antidepressant effect" |
| Morning light | "morning light at the bedside" | "light therapy" (unless dosed and validated) |
| Per-person learning | "learns which tasks bring your pulse down" | "learns what cures you" |
| Trend | "an early-warning index compares nine measures with your own first two weeks; when it drifts for long enough, the clinic sees a suggestion to consider a call; the clinician decides" | "predicts relapse", "clinically validated" |

Always forbidden: "treats depression", "prevents relapse", "detects emotions", "diagnoses", "HRV", "measures alertness", "detects relapse", "reward learning", "clinically validated".
