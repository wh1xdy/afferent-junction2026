# Decisions log

Debate: Round 1 proposals (game designer, clinical researcher, patient advocate, vision and signals engineer, art director, producer, pitch strategist), Round 2 critiques plus the game references analyst (added by David's addendum), Round 3 synthesis by the moderator, Round 4 red team (clinical researcher, patient advocate, producer).

Priority used to resolve conflicts: patient safety and clinical credibility > feasible by 20:00 > wow in demo > completeness.

| # | Question | Chosen | Rejected | Reason |
|---|---|---|---|---|
| 1 | Perspective | Side view, portrait, auto-walk, 7 parallax layers | Top-down walkable map | Reads in 2 s on a projector, no steering so every input is a body signal, timing identical every night, cheap layered art |
| 2 | Orientation | Portrait | Landscape | The phone is held before the face for the front camera |
| 3 | Station order | Harbour (calibration, check-in), Forest, Fork, Lake, Sauna, Lighthouse | Draft order with the sauna before the lake | Relaxation before the reaction task would slow reaction time. Calm flows into dawn |
| 4 | Minimum by 20:00 | Harbour, Lake, Sauna, Lighthouse plus bedside light | Producer's Harbour, Sauna, Lighthouse only; pitch's set without the sauna | The lake is the strongest evidence (clinical) and simple to build; the sauna is the hero shot and the most bed-friendly station |
| 5 | Forest | Should tier, reframed as "lift your gaze to the light", head pitch in camera space | "Sit or stand up straighter" | Impossible and invalidating in bed (patient). Camera-space pitch works lying on the side (vision) |
| 6 | Fork | Stretch tier. Head-turn selector plus long blink or tap. Summit costs 3 s eyes wide, same in every profile. Reward size 1 to 3 varies across sessions. One trial per session | Wink as selector; 4 s cost; 3 trials per session; bad-day-specific cost | A wink is a motor skill, not effort (clinical). 3 s is the compromise between patient (max 2 s) and clinical (4 s). Fixed cost keeps the feature comparable |
| 7 | Wink input | Dropped as a required input; accepted silently | Wink as choice, wink check in calibration | Many people cannot wink, a failed wink in calibration repeats every night (patient, references: no proven role model) |
| 8 | Double blink stone | Replaced by long blink or tap on the end screen, stretch | Double blink at any highlight | False triggers, no role model; Before Your Eyes photo blink is the model |
| 9 | Mood check-in | 5 flame sizes, same warm hue, dimmest still glows at 60%, `mood_vas` 1 to 5 | Lantern colour choice; brightness slider with words | Colour is not ordinal (clinical) and implies a right answer (patient); a slider breaks the wordless world (game designer); Apple State of Mind is the model (references) |
| 10 | Miss feedback | Same full colour, slower bloom (5 s instead of 1.5 s) | 60% saturation on a miss | Partial colour reads as a grade (patient) and is barely visible on dark layers (art) |
| 11 | Reaction time timing | Fixed: 6 trials, foreperiod 1.0 to 2.5 s, window 150 to 1500 ms, blooms never delay the next trial, max 24 s, valid only with 6 trials and 4+ hits | Adaptive staircase window | An adaptive window truncates the RT distribution differently each night and hides slowing (clinical) |
| 12 | RT naming | "Blink reaction time", logged with modality and device | Comparing with keypress norms | Blink latency adds 50 to 100 ms; within-person only |
| 13 | Sauna pacing | 4 s in, 6 s out (6 per minute), 3 cycles in both profiles, paced by haptics and sound | Visual pacer only; profile-dependent cycle counts; faster pacing | A visual pacer is invisible with eyes closed (references). Fixed cycles keep pulse delta comparable. Never faster than 6 per minute (clinical) |
| 14 | Falling asleep | The sauna holds while the eyes stay closed; 60 s closed in total fades to black, `status: fell_asleep`, no lighthouse, no dawn, light stays off | Treating it as a failure or as breathing success | Kind to the patient; logged separately for data integrity (clinical) |
| 15 | Lighthouse | Kept as the ending gesture, 2 s cumulative eyes wide | Claiming alertness | Commanded wide eyes measure compliance, not alertness (clinical) |
| 16 | Profiles | Change starting state, pace and visuals only; same stations, calibration, all task targets, RT timing, breathing, summit cost. In the product the starting state follows the last lantern check-in, never the clinic trend | Bad day skipping Forest and Fork; bad day darker | Missing stations on bad days create informative missingness (clinical). Bad day must feel held, not bleak (patient, art) |
| 17 | Calibration | 20 s identical: 6 s open, 3 s closed, 3 s wide (no hold), 8 s rest. No live adaptation | Wink check; hold-wide requirement; live pulse reaction during calibration | Passive and doable on a bad day (patient), comparable every night (clinical) |
| 18 | Vitals-reactive layer | Core pillar: high pulse makes the world warmer, softer and slower (held) in calming segments, rising pulse adds sparkle in activating segments (capped), eyes drive lantern radius, gaze reveals sky. Live heartbeat flicker only with "Show heartbeat" on (off by default, on in the demo build) and never mirrors a racing heart | Vitals only as stretch; biofeedback that changes difficulty | David's explicit request. One pulse direction per segment kept. Nevermind shows punishing biofeedback builds anxiety (references) |
| 19 | Stack | Capacitor + PixiJS web game + native Swift ARKit plugin `AfferentFace` (Romain), behind one `FaceInput` JS interface with a mock | Pure native Swift + SpriteKit; Flutter or React Native/Expo with a vision plugin; Capacitor with MediaPipe only | David builds in web tech; ARKit TrueDepth tracks in the dark at 60 fps; MediaPipe in WKWebView is RGB only and 15 to 25 fps; Flutter/RN is a new framework for everyone and their face plugins are RGB only. Vision engineer owns this decision (addendum); producer conceded in Round 2 |
| 20 | Stack fallback | MediaPipe adapter behind `FaceInput`, separate build, at Gate 2 (12:00) | No fallback; running both at once | ARKit occupies the front camera, so both cannot run together |
| 21 | Demo device | Face ID iPhone 12 or newer, iOS 17+, plus a second installed by 19:00, Xcode free provisioning | Android APK; TestFlight; iPhone SE | TrueDepth required; no review needed; 7-day free certificate covers Sunday |
| 22 | rPPG | Stretch, sauna only, shown only with a lock | Core feature | High risk, needs visible light; KY-039 carries the claimed pulse |
| 23 | Stick figure source | Jetson bedside camera | Phone Vision body pose | At 25 cm the phone sees a face, not a body; the bedside box doing real work is more credible; camera-off becomes a physical action |
| 24 | Transport | WebSocket over our own travel router with fixed IPs, Jetson AP as fallback; UNO Q by USB serial to the Jetson | Venue Wi-Fi; BLE from Capacitor; Jetson AP as primary | Venue Wi-Fi has client isolation risk; BLE is awkward in Capacitor; router is least config risk |
| 25 | Message list | 9 types: hello, session_start, station, light, lake_trial, session_end, privacy, pulse, knob | 9 vision types with 10 Hz signals and pose; producer's 5 | Producer's 5 missed pulse to the phone (needed for the vitals layer) and the privacy sync; 10 Hz signals and pose are not needed over the socket |
| 26 | Knob | Turn sets the bedside light level; press toggles the bedside camera (stick figure vanishes, LED blinks) | Knob starts sessions only | Gives the UNO Q a visible privacy role for the side challenge (pitch) |
| 27 | Bedside light | 5% before, faint station colour during, dawn in warm amber `#FFC98A` at 15% (quiet night, cap 25%), holds 30 s, fades off; stage mode `#FFF3DC` up to 100% | Full brightness at dawn by default | Must not wake a sleeping partner (patient) |
| 28 | Glow border | Rests at 10%; up to 50% only in the sauna, luma under 40, rPPG on, quiet night off | Ramp to 70% whenever dark | ARKit does not need light for tracking; a bright border wakes the partner (patient, vision, art) |
| 29 | Microphone (team deadline 10:00) | No | Breath detection by microphone | Surveillance feeling in the bedroom, noisy venue, extra permission and claim surface. Decided now, not at 10:00 |
| 30 | Facial expressivity | Dropped entirely | Passive measurement; smile-based reward | Invites "so you detect emotions?"; never require smiling; eyes-wide covers the useful part |
| 31 | Sound | Pentatonic solo piano; one added voice per colour (cello forest, glass bell lake, pad and stove crackle sauna, full phrase dawn); no fail sounds; 3 s fade in; silent mode with haptics | Fail sounds; sudden sounds | Any timing sounds right in pentatonic; every returned colour adds a voice (art, game designer) |
| 32 | Safety, in session | No sensor or lantern value pauses or ends a session or shows a message; implausible pulse is a quality flag | Clinical's "Sensor reading unusual, take a break" pause; pitch's end-session on darkest lantern or pulse range | Implausible pulse is almost always sensor error; a mid-session message at night harms (patient); a dark lantern is honesty, not danger |
| 33 | Crisis path | Self-report only (weekly daytime check-in, on by default in the pilot as agreed at discharge, patient can switch it off; or "Talk to someone"); fixed card with clinic, 112, MIELI; self-harm flag to a named clinic contact within one working day, and the card says so; "not an emergency service" stated | Signal-triggered alarms; AI-written support | Fixed and human-written per policy; false alarms at night are harmful |
| 34 | Skip and auto-complete | Hold 1 s skips; station timeouts; touch fallback after 3 s face loss; swipe down exits; all flagged `completed_by` | Hidden skips; "face not found" text | Kind for the patient; only `signal` data enters the trend (clinical) |
| 35 | Trend and booster | Three alert domains only (reaction time, mood, missed nights); baseline first 7 valid sessions, median and MAD with floors; Suggest review when the 7-day rolling median reaches robust z 1.5 in 2 of 3 domains; declined or withheld nights never count as missed | Single-feature trigger; automatic booster scheduling | Clinician decides; phrased as a pilot starting rule |
| 36 | Gemma | Weekly clinician note on the Jetson from summary numbers, shown beside the numbers, labelled on-device | Patient-facing AI; AI in the crisis path | Visible side-challenge role, no advice to patients |
| 37 | Art pipeline | 25 assets, 16 priority A generated overnight from 03:00 with a reference image, 9 B after; retakes 08:30 to 10:00 | 25 at once before sleep | Sequential chaining on a reference takes time; figures drift most |
| 38 | Stage demo | Live 45 s demo mode: lake 3 trials, sauna 2 breaths, lighthouse, dawn plus real light; declared fallbacks | Full live run with calibration; game only on video | Full run is too long and fragile; video-only wastes the best moment and judges trust what reacts live |
| 39 | Profile shown live | Demo profile: bad day, played by Alex | Good day live | Bad day is the case clinicians care about and shows the game is gentle; labelled as demo profile |
| 40 | Tagline | Once: final card of the video and final sentence of the pitch | Deck title, elsewhere | David's rule |
| 41 | Claims | See `GameDesign.md` section 9; new forbidden: "measures alertness", "detects relapse", "reward learning", "clinically validated" | "Six weeks of TMS", "alertness", "fatigue detection" | Strict claims policy, clinical researcher |
| 42 | Role models | Every mechanic anchored in `References.md`; mechanics without a model replaced (wink by head turn plus blink, colour check-in by State of Mind style flame, double blink by photo blink) | Invented mechanics | David's addendum |
| 43 | Process note | The references analyst ran in parallel with Round 2 (the addendum arrived after Round 2 had started); its findings were applied in Round 3 and checked in Round 4 | Restarting Round 2 | Time; no conflicting output was produced |

## Round 4 red-team fixes

| # | Raised by | Showstopper | Fix applied |
|---|---|---|---|
| R1 | Patient, clinical, producer | Falling asleep could never trigger (sauna ended at 32 s) and dawn would wake the sleeper | Sauna holds while eyes stay closed, 60 s total ends as `fell_asleep` with no dawn and no light |
| R2 | Patient | High pulse making the world colder and mirroring a racing heart feeds panic | High pulse now makes the world warmer and held; heartbeat flicker behind a setting, off by default, fixed slow rhythm above resting +10 |
| R3 | Patient, clinical | "Not tonight" or privacy controls counted as missed nights | Declined and withheld nights never count as missed |
| R4 | Patient | 40% dawn light and white border wake a partner | Quiet night dawn 15%, cap 25%, warm amber |
| R5 | Patient | Lake flashes too bright in a dark room | At most +25% over scene luminance in `dark_room`, soft low bell |
| R6 | Patient | Audio starts at daytime volume | Fixed low start level, 25% of system volume |
| R7 | Patient, clinical | Crisis flag implied someone is coming at night; no named receiver | Card states next working day; named clinic contact under a protocol |
| R8 | Patient | Pulse number shown in the patient view in the video | Pulse only in a "clinic view" inset |
| R9 | Clinical | Profiles changed task targets while the trend could choose the profile | Identical task targets; starting state follows the last check-in only |
| R10 | Clinical | Cued gaze-up measures compliance, not downcast gaze | Only `time_to_target_s` kept as context, new approved phrase, "head angle" removed from the pitch unless the forest ships |
| R11 | Clinical, producer | Lake could not fit 6 trials, informative truncation | Foreperiod 1.0 to 2.5 s, non-blocking blooms, 24 s, validity rule, lapses relative to personal baseline |
| R12 | Clinical | Alert rule undefined and used context features | Three alert domains, explicit rolling-median rule, MAD floors |
| R13 | Clinical | "Four in five" success claim contradicts pillar 1 | Q&A now: "There is nothing to fail. Every session reaches dawn." |
| R14 | Clinical | Sauna pulse delta from two samples is breathing noise | Means over lead-in plus cycle 1 and over cycle 3, `pulse_valid` gate |
| R15 | Clinical | Weekly check-in off by default leaves no suicidality screen | On by default in the pilot, agreed at discharge, switchable off |
| R16 | Producer | Stage demo mode skipped calibration | Stored calibration for Alex from the 19:00 rehearsal, `cal.source` |
| R17 | Producer | Live RT on the dashboard had no message | `lake_trial` message added |
| R18 | Producer | Pitch claimed head angle and effort that may not ship | "Reaction time, eye response and pulse", extended only if forest or fork ship |
| R19 | Producer | Jetson models had no setup task | Vlad pulls Gemma, Romain pulls the pose model before sleep; 13:00 joint check; stage note pre-generated at 17:00 |
| R20 | Producer | One Mac is a bottleneck | Confirm Romain's own Mac at 03:00, else fixed build slots |
| R21 | Producer | Stick figure shot in the dark | Wow 1 shot as a separate lit setup first |
| R22 | Moderator | One-finger hold meant both skip and gaze up | Skip is a two-finger hold |
| R23 | Moderator | Fork windows exceeded its 7 s slot | Choice 3 s, summit cost 3 s within 4 s |
| R24 | Moderator | Bad day exceeded 2:00 after the lake fix | Walks 1.6 s good, 2.3 s bad; forest max 6 s; max 1:57 and 1:59 |
