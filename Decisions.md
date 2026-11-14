# Decisions log

Debate: Round 1 proposals (game designer, clinical researcher, patient advocate, vision and signals engineer, art director, producer, pitch strategist), Round 2 critiques plus the game references analyst (added by David's addendum), Round 3 synthesis by the moderator, Round 4 red team (clinical researcher, patient advocate, producer).

Priority used to resolve conflicts: patient safety and clinical credibility > feasible by 20:00 > wow in demo > completeness.

## v3 decisions (overnight build)

Overnight build from `contracts/BRIEF.md` (three dimensions, full statistics). These override v2 and v1 wherever they differ. "Orch" rows were fixed by the overnight orchestrator; "Contract" rows were decided by the contract agent while writing `contracts/`.

| # | Question | Chosen | Rejected | Reason | Overrides |
|---|---|---|---|---|---|
| X1 | Game core (Orch) | Keep the v2 core: touch-only play, vitals-driven director (calm, flow, wake, fatigue, rest), Among Us style tasks, night rule. "Game reacts live to the body" is the director | Bringing body gestures back as controls | David chose touch play explicitly twice | none (confirms V1, V2, V5, V6) |
| X2 | Face data (Orch) | Passive measurement only: eye openness, PERCLOS, spontaneous blink rate (core rest only), head pitch as posture proxy, signal quality. From ARKit, MediaPipe, or the labelled simulator | Expressivity, emotion, smiles | Brief asks for posture and eye metrics; claims policy forbids emotion | V11 partly, v1 #30 stays |
| X3 | Mood check-in (Orch) | At the start (inside the fixed core) and at the end. 5 lanterns from cool dim blue to warm bright amber, colour and brightness co-vary so the scale stays ordinal. Feeds `pre_post.mood` | End only (V8); brightness only (v1 #9) | A pre/post pair is the headline "how did the game affect you today" | V8, v1 #9 |
| X4 | Fixed core (Orch) | About 25 s, identical every session: rest 6 s (resting pulse, blink rate, eye openness, head pitch, ambient light), mood check-in, 5 tap reaction trials (foreperiod 1.0 to 2.5 s, window 1500 ms, lapse > 1000 ms, anticipation < 150 ms; median, IQR, lapses, anticipations) | v2 core of 7 s rest plus 5 trials with a 1000 ms window | Standardised measurement per the brief | V3 (extends), v1 #11 timing |
| X5 | Measurement tasks (Orch) | Two standardised tasks, once per session, fixed slots: slot 1 Fork (effort-based choice, 2 choices, easy reward 1 vs hard reward 2 or 3), slot 3 Two lanterns (probabilistic reward task adaptation, 12 trials, 3:1 rich vs lean reward, log b with 0.5 correction, exploratory) | Free placement by the director | Fixed slots keep them comparable across sessions | v1 #6 (fork returns in a new form) |
| X6 | Per-task response (Orch) | Every task records stimulus and body response: pulse start, min, max, end, delta, intended direction, helped (>= 2 bpm in the intended direction), time to target, recovery slope (calm), head pitch delta, eye openness, PERCLOS, errors, completion | v2 `pulse_delta_bpm` only | The bandit and "What helps" need a defined outcome | V10 (replaced by the bandit) |
| X7 | Session length (Orch) | Under 2:00: core about 25 s, adaptive play about 75 s, dawn, end check-in | | Daily use must stay tiny | |
| X8 | Profiles (Orch) | "Good day" and "bad day" return as demo presets that set the simulated starting vitals and the starting world state (fog, stars, warmth), visibly different within 10 s; real use is adaptive | Presets removed (V14) | The demo needs a visible contrast in seconds | V14 partly |
| X9 | Learning (Orch) | Thompson sampling, Beta(1,1) per (mode, task id) on the helped flag; next-day association reported separately; the hub sends task weights in `config`, the director samples with them; shown as "What helps Anna" with uncertainty | Median pulse change per task (V10) | Explicit uncertainty and exploration | V10 |
| X10 | Hub (Orch) | Python FastAPI + SQLite + WebSocket in `hub/`, `./start.sh`, port 8000; `/app`, `/clinic`, `/app/patient.html`, `/api`, `/ws/app`, `/ws/clinic`, `/ws/bedside`; no cloud | v2 bare WebSocket on port 8765 | One process for the whole demo | v2 transport section, v1 #24 port |
| X11 | Demo patients (Orch) | All SIMULATED: Anna (8 weeks after TMS, gradual relapse from week 5) and Mikko (stable control); a live phone session is appended to Anna as today | | Brief section 4 | |
| X12 | Alert logic (Orch) | Composite early-warning index (weighted signed robust z-scores, weights and contributions shown) plus one-sided CUSUM with states stable, watch, consider a check-in call, consider discussing a booster session; the clinician decides | 2 of 3 alert domains rule (V9, v1 #35) | Brief section 3, Dimension 3 | V9, v1 #35 |
| X13 | Gemma (Orch) | Weekly summary via local Ollama (gemma3n, gemma3, gemma), template fallback with the identical interface; rephrases computed numbers only | | Gemma side challenge, safe | v1 #36 (extends) |
| X14 | Design system (Orch) | `design/tokens.css` + `design/tokens.json`, documented in `DesignSystem.md`, served at `/design/` | Per-surface palettes | One product feel across app, dashboard, light | |
| X15 | Baseline window (Contract) | Days 0 to 13 per feature, extended until 7 values exist; median and MAD x 1.4826 with per-feature floors | First 7 valid sessions (V7, v1 #35) | Brief says 14 days; the floor keeps tiny MADs from exploding z | V7 for analytics (the director baseline pulse keeps the V7 rule) |
| X16 | Composite features (Contract) | 9 features: reaction time 1.5, mood 1.5, sleep regularity 1.0, missed sessions 1.0, effort choice 1.0, morning pulse 0.75, home-only days 0.75, upright time 0.5, reward bias 0.5 (exploratory features get the lowest weights) | Equal weights | Weight follows the evidence level | |
| X17 | CUSUM parameters (Contract) | Start day 14, k 0.5, thresholds watch 1.5, check-in 3.0, booster 8.0. On the prototype data: Anna (onset day 28) reaches check-in on day 41, stable patients never leave stable | k 0.25 with lower thresholds | k 0.25 produced watch states before onset on a later-onset patient | |
| X18 | Flow tasks in the bandit (Contract) | Flow tasks have no intended direction, so no bandit arm; uniform weights. Arms only in calm, wake, fatigue, rest | A pseudo outcome for flow | Honest: no direction means no "helped" | |
| X19 | Measurement tasks at night (Contract) | Fork and Two lanterns are skipped (not replaced) when the director is in rest mode; logged with `skip_reason: rest_mode` | Forcing them at night | The night rule wins over measurement | |
| X20 | Fork tasks (Contract) | Easy path: tap 3 slow lights (about 2.5 s), hard path: tap 8 faster lights (about 6 s), identical every session; 6 s to choose, no choice takes the easy path and logs `none` | Re-using adaptive minigames | Fixed effort cost keeps the metric comparable (v1 #6 principle) | |
| X21 | Two lanterns details (Contract) | Amber lantern = rich, silver = lean, size difference 8%, 6 rich-larger and 6 lean-larger trials in random order, 3 rich and 1 lean reward per session | Colour-free version | Mirrors the PRT 3:1 schedule within 12 trials | |
| X22 | Session end message (Contract) | `session_end` carries the document in a `session` field; the hub still accepts the v2 spread form | Spread form only | Avoids a `type` key inside the stored document | v2 message table |
| X23 | Demo roster (Contract) | Six SIMULATED patients: Anna (booster), Juha (relapse from day 43, check-in), Mikko (stable control), Leena, Sofia, Eero (stable) | Two patients | A "who might need a call" list with two rows does not read as a list | |
| X24 | Bedside pulse source (Contract) | The bedside simulator does not stream pulse by default (`AFFERENT_SIM_PULSE=0`), so the phone's vitals simulator (profiles, sliders) stays in control; a real KY-039 overrides it | Simulated bedside pulse always on | Two simulators fighting over the pulse would break the profile demo | |
| X25 | Day model (Contract) | `day_index` = days since TMS end; seeded history days 0 to 55, today = day 56; the last valid session of a day counts | Session-indexed timelines | Daily features and sessions share one axis; repeated demo runs overwrite today | |
| X26 | Crisis triggers (Contract) | Self-report only: "Talk to someone", or mood 1 at both check-ins of one session (offered, not forced); fixed card with 112, MIELI 09 2525 0111 and the clinic; hub raises a clinic flag | Signal-based triggers | Keeps v1 #33; the brief allows the mood check-in as a sign | v1 #33 extends |
| X27 | Fonts (Contract) | Fraunces (display), Inter (UI), JetBrains Mono (debug), bundled as woff2 in `design/fonts/` (OFL) | Google Fonts at runtime | The venue network may be offline | |
| X28 | Sound (David) | Out of scope tonight; `audio.js` stays as it is | Tuning audio | David | v1 #31 on hold |
| X29 | Tokens in the Capacitor bundle (Contract) | Pages link `design/tokens.css` relatively; the hub mounts `/app/design`, and `npm run design` copies `design/` into `demo/design/` (gitignored) before `npx cap sync ios` | Duplicating tokens in demo/ | One source of truth, works on both | |

## v2 decisions (Sat, after testing the v1 demo)

These override v1 wherever they differ. Rows marked "David" were decided by David directly; the others follow from them.

| # | Question | Chosen | Rejected | Reason |
|---|---|---|---|---|
| V1 | Core idea (David) | Vitals are passive stimulation values; the game adapts what it offers: high pulse leads to calm, low pulse to activation, eyes that keep closing to fighting tiredness. Fully adaptive levels | v1: the game is controlled by eye and head gestures | v1 was hard to understand and to play; gestures felt like performing with the face |
| V2 | Player input (David) | Touch only, one finger | Touch plus eye moments; no input at all | Playable lying down, known from every phone game |
| V3 | Comparability (David) | A short fixed core (about 20 s: start pulse plus 5 tap reaction trials), then everything adaptive | Fully adaptive with no fixed part | Keeps reaction time and start pulse comparable for the clinic trend |
| V4 | Gameplay (David) | Short Among Us style tasks in the island theme: breath, löyly, aurora threads, constellation, fireflies, beacon, bells, shutters | v1 stations with body actions; catching lights while walking | Known, short, varied, and easy to map to calm or activating |
| V5 | Director | Left 4 Dead style director: arousal from pulse against the personal baseline, fatigue from PERCLOS and long closures; modes calm, flow, wake, fatigue, rest; 3 s hysteresis; task mode fixed while a task runs | Continuous switching inside tasks | One pulse direction per task stays intact (v1 rule) |
| V6 | Night versus morning | Fatigue mode only in the morning or by day; at night it becomes rest, and 30 s of closed eyes ends the session as fell asleep | Fighting tiredness at any time | Sleep matters in depression; keeping someone awake at night would harm |
| V7 | Baseline pulse | Personal baseline from the first 7 sessions (rolling), sent by the Jetson | Tonight's first seconds | A stressed evening would otherwise read as normal |
| V8 | Mood check-in | Kept as an optional one-tap lantern check-in on the end screen | Dropped with the v1 stations | Mood is one of the three alert domains; one tap after play costs nothing |
| V9 | Alert rule | Unchanged: reaction time (now from the core), mood, missed nights; 2 of 3 drifting for about a week | Using mode seconds or pulse response as alerts | Adaptive features vary by design; they are context only |
| V10 | Per-person learning | Median pulse change per calm task across sessions; the director may prefer what calms this person | No learning | Concrete, honest version of "learns which parts help this person" |
| V11 | Camera role | Only eye closure (blink value); no gestures, no expressions; optional | Full face tracking | Less to build, less to explain, less privacy surface |
| V12 | ARKit plugin | Shrinks to blink values plus tracked flag (`AfferentEyes`), MediaPipe fallback already in the demo | Full blendshape and head-pose plugin | Lower risk by 12:00 |
| V13 | App code | Wrap the demo code in Capacitor instead of rebuilding in PixiJS | Separate app codebase | The demo already is the game |
| V14 | Good day / bad day presets | Replaced by live adaptation; the demo has vitals sliders and presets (stressed, flat, tired, normal), labelled simulated | Two fixed presets | The game is now variable by design; the change shows within seconds |
| V15 | Lantern and heart | The lantern pulses at a fixed slow rhythm, never at the live pulse | Showing the heartbeat | Never mirror a racing heart back (v1 red-team finding) |
| V16 | Morning dawn light | 60% daylight `#FFF3DC` in the morning; night keeps the quiet-night rules (15% amber, cap 25%) | One level for both | Sunrise alarm clock effect by day; partner protection by night |
| V17 | Messages | Add `mode`, `game`, `core_trial`, `config`; drop `station`, `lake_trial` | v1 list | Live clinic panel and baseline delivery |
| V18 | Stage demo | Alex really raises the pulse with squats before going on stage, then closes the eyes on purpose to show fatigue mode; slider fallback labelled simulated | Fully simulated vitals | Live and honest is more credible to clinicians |
| V19 | Art | Procedural art is the baseline; generated images may replace layers with per-layer fallback | Generated art as a requirement | The OpenAI test request returned 401 invalid_api_key; nothing generated, nothing spent |

## v1 decisions (superseded where v2 differs)

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
