# Afferent mechanics review: creative director decision

Status: decision document from the creative director, written on 2026-11-14 for the build agents. It answers David's "And also mechanics reviewing. Also please make app more unique". It is built on three reviews (mechanics critic, systems coherence, market and uniqueness scout) and the player judge's scores. Where this file and an older spec disagree, section 4 says which one wins. The Decisions rows it needs are listed in 4.2 for the orchestrator to log.

Inputs read: `GameDesign.md`, `References.md`, `Decisions.md` (v3 rows X1 to X36, v1 #27, red team R1 to R5), `design/coreloop.md` (including "Morning ritual" and "Challenge in the traversal"), `design/minigames.md` (section 0), `design/engagement.md`, `design/lookdev.md`, `design/questions.md`, and `demo/js/engine.js`, `main.js`, `streak.js`, `quote.js`, `sensors.js`. `design/gui.md`, `quotes.md` and `rolemodels.md` did not exist when I wrote this.

Build state that this file assumes (checked in code):
- `demo/js/traverse.js` and `demo/js/skill.js` do not exist yet. So the Ride and the whole of minigames section 0 are spec only, and the game still plays the old walk-and-panel loop.
- `main.js` line 33 defaults `input` to `auto`, which `main.js` line 60 labels "autoplay story". So any playtest without `?input=touch` was partly watching a bot.
- `engine.js` `modeLight()` sets the room light by mode (calm 8%, flow 8%, wake 20%, fatigue 40%), so the bedroom dims on every switch from wake to calm.
- `quote.js` `tagFor()` chooses an `after_hard_day` quote when `mood_end <= 2` or the mood delta is negative. That is answer-dependent feedback.
- `streak.js` counts only `completed` and `fell_asleep`.

Citation markers: **[K]** means product knowledge from memory that nobody could re-check this session, because the shared web search budget ran out after one query. Check every [K] item before it goes on a pitch slide.

---

## 1. Verdict in 10 lines

1. **Nothing in the build is yet a game.** The right core verb (the Tiny Wings Ride) and the right challenge contract (minigames section 0, coreloop "Challenge in the traversal") exist only on paper, and the app ships with autoplay on. "It feels like watching" is mostly literal.
2. **The whole has no signature.** Alto plus Tiny Wings, then Fruit Ninja, Flow Free, Simon and Rhythm Heaven as stations, in a Journey and Gris look. Every part is anchored, but the sum reads as "a well made reskin compilation" (player judge, market scout).
3. **The only things nobody else has are invisible:** the pulse, the eye closures, the bedside light and the knob. The director acts, but the player can never see that it acted.
4. **The measurement block is the most repeated content.** Rest, check-in, Bite, Fork and Lanterns take about 55 to 60 s of a 108 s session, identically every day. The 8 adaptive tasks share about 1.5 slots per session.
5. **Decisions are rare.** Only Fork, Threads, Fireflies (decoys) and the Ride's high line ask the player to choose. Everything else is execution.
6. **Redundant pairs in the same mode:** calm swells and breath, fatigue crest kicks and beacon, threads and stars (both drag-to-connect in flow).
7. **Light is five currencies with no sink:** motes, fork orbs, firefly jar, Bite beads and task light. Nothing is spent, so none of it matters.
8. **Colour return and dawn are fixed presentation.** Yellow, blue, green, dawn, in the same order every morning, with no decision and no variance.
9. **The wake-up light is not a wake-up light.** It dims on mode changes, rises only at 1:45, and the docs give three incompatible caps (15/25% night, 60% engagement, "full daylight" coreloop).
10. **The meta layer leaks game into measurement in two places:** the assist and `V.kind` read the mood answer, and `quote.js` picks quotes by mood. Engagement.md's streak spec is good and should be adopted as is.

---

## 2. The three signature mechanics

One line for the pitch: **"Your heart draws the hills, your eyes bring the frost, and your room is the sunrise."** Each signature uses one channel that only Afferent has: the pulse (S1), the eyes (S2) and the bedside unit (S3). None adds a new verb. All three ride on the existing one-finger hold and release.

### S1. The Heartline: the hills are paced from your pulse and lead it

**Role models and the exact pattern taken**

| Product | Pattern taken | Used for |
|---|---|---|
| Audiosurf (Dylan Fitterer 2008) [K] | the track is generated from the input signal: steep and fast where the song is intense, flat and slow where it is calm | hill period and shape come from the player's own pulse |
| Tiny Wings (Andreas Illiger 2011) | hold to get heavy on the down slope, release to fly; the rhythm of the hills is the rhythm of play | the verb stays exactly as in coreloop 3 and 4 |
| Mightier (Boston Children's spin-off), mightier.com/how-it-works | the game reacts visibly to heart rate, so the player learns the link | the far ridge reshapes within 1 s when the director's target changes |
| HeartMath Inner Balance [K] | positive-only feedback: the visual grows when the body moves toward the target, and nothing punishes moving away | calm swells warm one step when the pulse falls toward the lead tempo |
| Canabalt | the world announces what is coming at the right edge | the next 3 hills are always drawn on the far ridge |
| Anti-model: Nevermind (Flying Mollusk) | the game gets harder as arousal rises | never: a high pulse makes hills longer and softer, never faster |

**How it plays, second by second (good morning, wake mode, resting pulse 58)**

- **Core (0 to about 30 s):** unchanged. The Kindle rest measures `p0`, the median pulse over the 6 s window. Nothing in the core reads the Heartline.
- **Launch, 0.0 s:** the engine sets the lead tempo `b = p0` (58) and the target `b* ` from the mode: calm `p0 - 6` (floor 52), flow `p0`, wake `p0 + 8`, fatigue `p0 + 10`. All are capped at 104 (minigames 0.3 beacon cap).
- **Every hill:** hill period `T = clamp(N_mode x 60 / b, Tmin_mode, Tmax_mode)` with `N` calm 9, flow 5, wake 3, fatigue 3. The clamps are the coreloop 4.3 ranges, so the feel stays in the tested envelope. Motes on the ideal line sit one per lead beat. A perfect ride collects them on the beat, and each pickup gives a `tick` haptic, so the beat is felt even with sound off (at most 1.73 Hz, under the 3 Hz rule).
- **0 to 3 s:** the player rides hill 1 at 58 bpm: 3.1 s per hill, motes every 1.03 s.
- **Each new hill:** `b` moves toward `b*` by at most 1 bpm per hill (pacing then leading, never a jump). By hill 6 the hills come at 64 bpm, 2.8 s each, and motes come faster. The player feels the morning pick up speed under their finger.
- **The far ridge (always on):** a silhouette band at 0.18H above the horizon shows the next 3 hills as generated. When the director changes mode (3 s hysteresis, engine.js `director()`), the ridge morphs to the new shape over 1.0 s: softer and longer for calm, sharper for wake. That is the visible "the game noticed me" moment.
- **Calm (anxious high pulse, 92):** `b` starts at 92 and leads down to 86. Hills get longer as `b` falls. When the measured pulse drops 2 bpm toward `b`, the lantern swell warms one notch (HeartMath, positive only). A rise does nothing. Warm sauna fog rolls in along the valleys (R2: high pulse makes the world warmer and held).
- **Harbour Beat inherits `b`:** when beacon is the station, its bpm starts at the current `b` rather than the minigames 0.3 base, then follows its own `d` axis upward in wake and fatigue. That is "you tap your own heart awake" (player judge). The DDA bpm axis becomes an offset on top of `b`: `bpm = clamp(b + (bpm_d - 84), 60, 104)`.

**Why only Afferent can do it:** it needs a live pulse, a same-time-every-morning resting baseline (`p0`), and a director that has a direction in both ways. Every biofeedback game on the market only calms (Mightier, MindLight, DEEP, Flowy) or only punishes arousal (Nevermind). The Heartline also wakes. I found no product that does this (market scout, absence unverified).

**Measurement safeguards**
- The core is untouched, and `p0` is read from the existing rest window.
- **Standard hill:** the last hill before Fork and before Lanterns is a fixed standard hill, identical every session and mode: `L` 520 u, `A` 90 u, no Heartline, no high line, no colour power, approach carry off. So the context the measurement tasks start from is the same every morning (X20 intent).
- **No mirror (R2):** there is no heartbeat flicker, no number and no pulse trace on screen. The player sees hills and a ridge, never their heart. A rising pulse never speeds anything up in calm.
- **Bandit confound:** log per ride segment `ride.heartline: [{mode, p0, b_start, b_end, pulse_start, pulse_end, quality_mean}]`, and per task `pre_ride_pulse_delta`, so Statistics can separate ride carry-over from the task's own `helped` (X6, X9).
- **Signal loss:** if pulse quality stays under 0.4 for 3 s, `b` freezes and the hills fall back to the coreloop 4.3 mode table without any visible change. Log `heartline_fallback`.
- `d` (ride DDA) still sets windows, lines and irregularity. The Heartline sets only period and mote spacing, so skill `L` and vitals `k` stay separate (minigames 0.2).

**Files:** `demo/js/traverse.js` (new, coreloop 12.1: hill generator takes `b`), `demo/js/engine.js` (`leadBpm` state next to `director()`, `p0` from the rest window), `demo/js/sensors.js` (read only, `pulse(now)` with quality), `demo/js/world.js` (far ridge band), `demo/js/minigames.js` beacon (bpm from `A.session.leadBpm`), coreloop sections 4.3, 5 and 9 (record), minigames 3.9 and 0.3 beacon.

### S2. Frost and weather: your eyes and the director, made visible

**Role models and the exact pattern taken**

| Product | Pattern taken | Used for |
|---|---|---|
| Frostpunk (11 bit studios 2018): ice grips the screen edges as the cold sets in, with an ice-forming crackle (kotaku.com/new-city-building-game-frostpunk-is-great-for-those-of-1825499161, corrosionhour.com/frostpunk-review/) | a body-like state shown as frost creeping in from the screen edges | eye closures grow frost from the corners |
| Left 4 Dead AI Director (Booth, AIIDE 2009) | the director's state becomes legible through a signature cue: players learn that the music sting means the horde is coming | one weather front per director mode, within 1 s of the switch |
| Alarmy "Wake Up Check" (alar.my/en/blog/alarmy-wake-up-mission) | the app checks that you stayed awake after the alarm | kind version: no fail and no alarm, only a thaw to earn |
| Tiny Wings fever and Peggle last peg | a short earned bright state | the sun-break after a full thaw |

**How it plays, second by second (groggy morning, fatigue mode)**

- **Eyes close 1.5 s in the Ride:** coreloop 5 already makes the next crest call brighter. In addition, hoarfrost ferns start growing from the four screen corners at 4% of the short edge per second while the eyes stay closed. Depth is capped at 18% of the short edge, so the centre 64% (where tasks and the figure live) never frosts. The frost is drawn white-silver with slow glints (at most 0.2 Hz), never dark and never blue-grey.
- **Eyes open, 0.0 s:** the frost stays and glints, and a soft ice crackle haptic plays (`light`, once).
- **0.0 to 3.0 s:** every graded input thaws it. Good: one third of the frost melts in a ring from the lantern, with a warm drip and one `tick`. Perfect: half. An on-beat crest kick: half. A fever melts all of it.
- **Full thaw:** a sun-break. The scene grade warms one notch for 2 s (rise of at least 300 ms, at most +10% luminance, through the flash guard), and the bedside lamp takes one step (S3). Opening your eyes and playing is the reward.
- **Weather fronts on every mode switch** (the far ridge of S1 morphs at the same time):
  - calm: warm sauna fog rolls along the valleys;
  - wake: a clear cold wind, the stars sharpen, snow blows sideways;
  - fatigue: a sun-band brightens on the horizon (the warmth the frost is waiting for);
  - flow: the aurora opens one ribbon.
  Each front is fully in within 1.0 s and is the same every time, so players learn it the way L4D players learn the stings.

**Why only Afferent can do it:** it needs eye openness from the phone camera (PERCLOS, X2) during play, in a game that is played right after waking. No game shows your own eye closures as weather, and no wake-up product reacts to whether you are actually awake without punishing you.

**Measurement safeguards**
- **Never in the core:** no frost and no fronts during the rest, the check-in or Bite. The rest blink rate stays spontaneous.
- **Never in measurement tasks:** at Fork and Lanterns panel open, frost fades out over 600 ms and does not grow until the exit. Fronts wait until the exit.
- **Never at night or in rest:** in rest, eyes closing is allowed (6.5, X35).
- **Logging:** in-play PERCLOS is not a composite feature (X16), but the frost is feedback on it. Log `frost: [{t_ms, depth, thaw_by}]` in the ride record and set `perclos_feedback: true`, so in-play eye closure is never reused as a clean measure.
- **Kind rules:** the frost never touches the lantern, the figure, the village or anything persistent. Nothing is lost while it is there. On a bad morning (minigames 0.6 assist on), the depth cap is 12% and growth is halved. Clinical flag: the patient advocate checks that frost does not read as a failure.
- No camera, or camera off: there is no frost, only the fronts (driven by pulse and the simulator). In demo profiles the simulator drives it and the record says `source: simulated`.
- Reduced motion: frost appears in 3 static alpha steps, and the thaw is a 300 ms fade.

**Files:** `demo/js/world.js` (frost layer and fronts, after lookdev 3.3 grade pass), `demo/js/traverse.js` (thaw on graded inputs, frost suspend at measurement stations), `demo/js/engine.js` (`setMode()` emits `front`, the PERCLOS feed it already computes), `demo/js/fxgl.js` (frost texture if the canvas path is too slow), coreloop sections 5 and 9, lookdev 3.2.2 (mode identities gain the front), lookdev 3.7 (flicker rules).

### S3. Carry the sunrise: the room is the last level

**Role models and the exact pattern taken**

| Product | Pattern taken | Used for |
|---|---|---|
| Philips Wake-up Light [K]; Hatch Restore 2 (help.hatch.co Restore 2 Alarm Guide) | sunrise simulation: the light ramps up before the wake time | only a "first light" ramp before waking; the rest is earned in play |
| Philips Hue Sync and Ambilight [K] | the room light follows what is on screen in real time | every colour return and the Give hold drive the real lamp live |
| Sky: Children of the Light (thatgamecompany) | hold to offer light at a shrine while a ring fills | the Give hold on the summit (coreloop 8.2), now driving the lamp |
| Journey (thatgamecompany) | the summit walk into the light, the same ending for everyone | the dawn stays identical whatever was gathered |
| Peggle (PopCap) | the last peg is a celebration beat | each colour return is a lamp beat |
| Playdate crank (Panic) [K] | a physical dial as a game input | the knob sets tomorrow's sunrise on the end screen |

**How it plays, second by second (morning, bedside unit present)**

- **W - 10 min:** "first light". The lamp ramps from 0 to 12% `#FFC98A` over 10 min (engagement 3 step 1, cap changed from 60% to 12%). It stays there until the player opens the app, at most 45 min, then fades off. No sound and no push when this routine is on.
- **Begin to the end of Bite:** the lamp holds exactly at the core level `C` = 12% `#FFC98A`. If no ramp ran, it goes to `C` over 2 s at Begin. So the room is the same during every core.
- **Launch (lighthouse ignites):** +4% over 1.5 s.
- **Each colour return (lookdev 7.3 mote lands):** +8% over 1.5 s, and the white point warms toward daylight in steps: yellow `#FFD9A0`, blue `#FFE9C8`, green `#FFF3DC`. The lamp is the "Peggle last peg" of every task, played in the room.
- **Shutters (Wake the House):** each window opened +1.5% (inside its colour step budget, so the total never exceeds the ladder).
- **Full thaw (S2):** +2%.
- **Fork and Lanterns:** the lamp holds still for the whole task. It steps only at the task's own colour return after the panel closes. The level is logged per task as `room_light`.
- **Summit, Give:** `V.dawnT` (coreloop 8.2) drives the lamp live from the level reached `Ls` to the morning cap `M`: `level = Ls + (M - Ls) x easeInOut(dawnT / 8)`, sent as small fades (`fade_ms` 250, at most 4 messages per second). Holding raises the room faster (rate 1.0 versus 0.7 untouched). The player literally holds the sun up in their own bedroom. `M` defaults to 60% `#FFF3DC`; the "Shared bedroom" setting sets `M` to 25%.
- **End:** after the end check-in, the Shine and the quote (engagement R10, R12), the lamp holds `M` for 10 min, then fades off over 2 min.
- **Set tomorrow (end screen, morning only, bedside knob present):** one line "Tomorrow's first light" with the time `W`. Turning the knob moves `W` in 10 min steps, and the lamp answers each step with a 1 s preview glow. Pressing the knob or doing nothing keeps the time. This closes the daily loop with an implementation intention (engagement 6.8, Gollwitzer and Sheeran 2006) instead of a passive end screen. It counts toward the 5 s end budget only if touched.
- **Monotonic morning room:** during a morning session the room never dims. `level = max(previous level, ladder level)`. A mode change changes the tint only, never the level. That replaces `engine.js` `modeLight()` levels.
- **Phone only (no bedside unit):** the screen border glow (DesignSystem) plays the same ladder, so the mechanic still reads.

**Why only Afferent can do it:** no wake-up light reacts to the person, and no game controls the room. The demo hero shot is the phone and the lamp in one frame, the room brightening as the player holds the lantern up on the summit (player judge, 9 of 10).

**Measurement safeguards**
- The core ambient light is fixed at `C` every session, which makes the RT stimulus contrast and the eye measures comparable. Log `room_light_core`.
- Fork and Lanterns run at a held level. `room_light` per task goes to Statistics as a covariate. It varies with how many tasks came before (0 or 1 colour step before Fork, 1 to 3 before Lanterns).
- **Night (21:00 to 06:00, or rest mode):** Decisions #27 and R4 are unchanged (5% before, quiet dawn 15% amber, cap 25%, no steps during play, no knob prompt).
- Claims: "morning light at the bedside", never "light therapy". The levels are far below the 250 to 300 lux of the dawn simulation trials (AJP 2005 meta-analysis, as cited by the market scout).
- Rate: at most 4 light messages per second, every step at least 1.5 s long, so the room never flickers (lookdev 3.7).

**Files:** `demo/js/engine.js` (`light()`, replace `modeLight()` levels with the ladder, `startDawn()` driven by `V.dawnT`, new reason codes), `demo/js/traverse.js` (Give clock), `demo/js/main.js` (end-screen "Tomorrow's first light", wake window setting, "Shared bedroom" setting, `Hub.on('knob')` routed to `W` on the end screen instead of `setDawn`), `demo/js/minigames.js` shutters (step hook), `contracts/api.md` (`light` reasons: `first_light`, `core`, `step`, `give`, `hold`, `fade`; new `bedside_schedule` message), `hub/afferent_hub/bedside/` (first-light scheduler, later), coreloop "Morning ritual" and 8.1 to 8.3, engagement 3 step 1.

---

## 3. Ranked change list for the existing mechanics

Priorities: **M** = tonight, must. **S** = tonight, should. **L** = later. Rows are in build order inside each priority. Each row can be applied by a build agent as written; the spec column names the section that must be edited to match.

### 3.1 Tonight, must

| # | Mechanic | Role model (pattern) | Change | Files and spec |
|---|---|---|---|---|
| M1 | Input default | Alto's Odyssey (the player always has the finger) | Default `input` to `touch`. Autoplay only with `?input=auto` or the dev chip. The chip label stays. | `demo/js/main.js` line 33; coreloop 11 |
| M2 | Haptics | Rhythm Heaven (the grade lives in the feedback) | Install `@capacitor/haptics`, `npx cap sync ios`, route `session.haptic()` to `A.J.hap()`. Without it, grades and S1's beat are invisible on iPhone. | `package.json`, `demo/js/engine.js:80`, minigames 2.1 item 2 |
| M3 | Traversal (the Ride) | Tiny Wings, Alto chains, Canabalt | Build `traverse.js` exactly as coreloop 3 to 6 and "Challenge in the traversal" (graded press, pop and landing, high lines, gullies, chain, fever, ride DDA). Do not re-specify: the critic's "add fever and high line" is already in that section. Add the standard hill before Fork and Lanterns (S1 safeguards). | `demo/js/traverse.js` (new), coreloop 12.1, 12.2 |
| M4 | Shared DDA | Levitt staircase, WarioWare ramp, Celeste assist | Build `skill.js` once (minigames 0.2). Apply engagement 5.3 (miss-share guard, morning warm-up, silent combo loss, same-pitch barely). | `demo/js/skill.js` (new), minigames 0.2, 0.5, 0.6 |
| M5 | Assist trigger | Crash Bandicoot (invisible help after repeated failure) | Remove `mood_start` and core RT from the assist trigger. Triggers left: fatigue `f >= 0.6` for 20 s, the `Ls` drop rule, and the Ride's own 2-of-3 misses. Same for lookdev `V.kind`: drive it from `f` and pulse quality, never from the mood answer. | minigames 0.6, lookdev 3.2.4, `engine.js` |
| M6 | Quote choice | Calm "Daily Calm" (one line per date, the same for everyone) [K] | Delete the mood-contingent `after_hard_day` tag in `tagFor()`. Pick by day of year from the morning pool (night pool at night). The crisis card still replaces it (X26). | `demo/js/quote.js` `tagFor()`, `pick()`; engagement 5.5; questions.md rule 6 |
| M7 | Director, room light | Philips Wake-up Light (monotonic ramp) | S3 core rules only tonight: hold `C` during the core, a colour-return ladder, no dimming on mode change, the Give hold drives the lamp. First light schedule and knob are later. | `engine.js` `modeLight()`, `light()`, `startDawn()` |
| M8 | S1 Heartline, minimal | Audiosurf, Tiny Wings | Hill period and mote spacing from `b` (S1), far ridge morph on mode change, fallback on low quality, record fields. Beacon reads `b`. | `traverse.js`, `engine.js`, `world.js`, `minigames.js` beacon |
| M9 | Fireflies | Tetris 7-bag, Vampire Survivors vacuum | Volley sizes from a shuffled bag (replaces 3.8's fixed 2,2,3,3,4,4). Caught fireflies stream visibly into the lantern, and the next 2 hills' motes glow brighter (the task feeds the Ride). | `minigames.js` fireflies, minigames 3.8 and 0.3 |
| M10 | Threads | Flow Free (hand-made first pack) | Ship 6 hand-made 5x5 puzzles per tier for tiers 0 to 2 before any solver. 6x6 waits. Flow mode only, never on fatigue mornings. | `minigames.js` threads, `demo/data/threads.json` (new), minigames 3.6 |
| M11 | Streak | Duolingo streak and freeze, Apple Pause Rings | Adopt engagement.md section 6 as is (M2 to M7 of its build list). Fix `streak.js` to count a lit morning as engagement 6.1 says (`partial` with a finished core and player input also counts). Day boundary 04:00. | `demo/js/streak.js` `COUNTS`, engagement 6 and 11 |
| M12 | End order | Fogg "Shine"; Wordle (finite) | One canonical order: Give, dawn, end check-in (identical acknowledgement for every answer), Shine (village mote plus streak tick), quote, settle, then "Tomorrow's first light" when a knob is present. At most 5 s after the check-in, one tap skips. | `main.js` `A.bus.on('mood')`, `endScreen`; coreloop 8.3; engagement R10, R12; lookdev 8.3 |

### 3.2 Tonight, should

| # | Mechanic | Role model (pattern) | Change | Files and spec |
|---|---|---|---|---|
| S1 | S2 Frost and weather | Frostpunk edge frost, L4D stings | As section 2, S2. Fronts first (cheap), frost second. | `world.js`, `traverse.js`, `engine.js` `setMode()` |
| S2 | One light per session | Journey (light carried to the summit, the same ending for everyone) | Motes, firefly catches, task `light_share` and fevers all go into one lantern pool for this session. At Give the pool sets only the ribbon width and the length of the sunrise flock. Nothing carries over, nothing is a currency, the dawn is otherwise identical. The Bite beads and the Fork orbs stay outside the pool (measurement). | `traverse.js`, coreloop 4.4 and 8.2, minigames 0.5 |
| S3 | Fork | Journey scarf (Fell or Shore) | Uncap the scarf to 6 bands (2 hard choices at reward 3 = 6), so `hard_by_reward` is not truncated visually. The orbs never enter the light pool. Present the split on the Ride (coreloop 6.4 already) but keep the stones task and X20 timings frozen. Bump `fork_ui`. | minigames 3.2, `world.js` scarf, Decisions row |
| S4 | Bells | Patapon (Sony 2007): 4-beat calls echoed on the beat [K] | Call and response, continuous. Bar 1: the tower calls 2 to 7 notes on the beat at `b` (S1). Bar 2: the player echoes on the same beats. The next call starts at once, so the show is music, not dead time. `items` = longest call echoed fully in order, `errors` unchanged. Bump `extra.v`. | `minigames.js` bells, minigames 3.10 and 0.3 bells |
| S5 | Stars | One Touch Drawing / Hitokaki one-stroke puzzles [K]; Okami constellations | Replace size sorting with a one-stroke trace: draw every line of the constellation in one drag without retracing (an Euler path), so the decision is where to start. Flow has no bandit arm (X18), so the risk is low. `items` = links drawn, `errors` = retrace attempts, bump `extra.v`. The size-ratio and jitter axes are replaced by figure size (5 to 10 anchors) and number of odd-degree stars. | `minigames.js` stars, minigames 3.7 and 0.3 stars |
| S6 | Beacon | Rhythm Heaven | When beacon is the committed station, the approach hills drop their crest kick rings, so the ring is new when the task opens. | `traverse.js`, coreloop "director chooses" fatigue |
| S7 | Breath (calm) | Apple Watch Breathe, Journey | When breath is the committed calm station, the approach hills are plain long glides without the 4/6 swell ticks, so the breath is not done twice. The real lamp breathes with the ring (plus or minus 2% at 4 s in, 6 s out; under 0.17 Hz). | `traverse.js`, `engine.js` light, minigames 3.4 |
| S8 | Shutters | WarioWare Touched! | Draw mechanism x direction x steps from a bag, so the 3 mechanisms in v1 do not repeat in order. From `d` 0.4, two windows are offered side by side, and only the one with light leaking opens (a reading decision). Each window steps the lamp (S3). | `minigames.js` shutters, minigames 3.11 and 0.3 shutters |
| S9 | Loyly | Cooking Mama pour | Keep 0.3 as is. The sauna is Afferent's Finnish hero: the steam bloom warms the lamp tint one step for the rest of the session. The ghost hand shows the speed once on the first pour of a player's life. | `minigames.js` loyly, minigames 3.5 |
| S10 | Bite | Animal Crossing NH fishing | After each response only (spec 3.1 allows post-response decoration), the catch arcs into the lantern in the world instead of a panel bead. Identical for every trial and every RT. Nothing before onset changes. | `measures.js`, minigames 3.1 |
| S11 | Lanterns | Peggle scheduled fever; Journey | The 12 released lanterns rise and stay in the sky, then join the dawn as the last lights to fade at sunrise. Always 12, so it is identical every session. | `minigames.js` lanterns, `world.js`, coreloop 6.4 |
| S12 | Colour return | Gris (each colour grants an ability) [K] | Each returned colour adds one Ride property for the rest of the session. Yellow: mote magnet radius x1.4. Blue: frozen lake stretches where a held press glides 30% further. Green: one aurora updraft per hill (a second lift on release in the air; in calm it is a longer warm glide). Powers are off on the standard hill. The stage order stays yellow, blue, green (lookdev 3.2.1). | `traverse.js`, `engine.js` `bloom()`, lookdev 3.2.1 |
| S13 | Director arc | Left 4 Dead build, peak, relax | One fixed macro arc per session: build (the Ride ramps), peak (the last adaptive task's boss item), relax (the summit ride, fewer graded events, then Give). The director sets amplitude only. Keep the 3 s hysteresis. | `engine.js` plan, coreloop 6.6, minigames 0.4 |
| S14 | Task unlocks | Brain Age (Nintendo 2005) new exercises over the first days [K]; Threes new cards | New players meet tasks on a fixed schedule by `day_index`, never by performance. Day 0: fireflies, loyly, beacon. Then one more every 2 days (shutters, bells, breath calm, threads, stars), all 8 by day 14. Day 1 session: Bite, Ride, one task, plus the measurement slots. A one-time wordless reveal the first time each task appears. The bandit samples only unlocked arms and logs `unlocked`. `?unlock=all` and `dev=1` show all. | `engine.js` plan filter, `skill.js`, Statistics note for X9 |
| S15 | Sound | Rhythm Heaven, Guitar Hero (the grade lives in the sound) | Ask David to reopen X28 for 8 samples only: hit, perfect, tier up, soft miss, woodblock beat, thaw drip, colour return, give. Follows the silent switch. Without them, perfect and good are hard to tell apart. | `demo/js/audio.js`, Decisions X28 |

### 3.3 Later

| # | Mechanic | Role model (pattern) | Change | Files and spec |
|---|---|---|---|---|
| L1 | First light and knob (rest of S3) | Philips Wake-up Light, Playdate crank | Bedside first-light scheduler at `W - 10 min`, end-screen knob sets `W`. | `hub/afferent_hub/bedside/`, `main.js`, `contracts/api.md` |
| L2 | Seasons (kaamos to first sun) | Animal Crossing real-time seasons | `day_index` drives the polar night lifting over 8 weeks (engagement L2, lookdev 9 NICE). Never by mood or play, never backwards. | `world.js`, `fxgl.js` grade presets |
| L3 | Measurement rotation | Elevate and Lumosity daily workout [K] | Fork and Lanterns on alternate days would free about 18 s a day. Rejected for tonight: X5 and X16 need daily values. Statistics decides after the pilot. | `Statistics.md`, X5 |
| L4 | Lanterns in the Ride | WarioWare | The pair hangs over a paused cruise stretch. Needs `extra.v` and a new baseline. | minigames 3.3 |
| L5 | Discounted bandit | Raj and Kalyani 2017, non-stationary Thompson sampling [K] | Persisted `L` drifts, so `helped` per arm drifts. Statistics owner. | X9, `hub/afferent_hub/analytics/` |
| L6 | Dawn visitors, milestones | Pokemon Sleep, Neko Atsume | As engagement 4 and L1. | engagement 11 |
| L7 | Peer lights | Journey and Sky companions, Death Stranding traces | Anonymous lanterns of the clinic's aftercare cohort on the far shore, opt-in. Privacy review first. | none yet |
| L8 | Out of bed | Alarmy photo mission, made kind | The last village light completes when the presence sensor sees the player leave the bed, with no prompt and no fail. Clinical sign-off first. | `hub/afferent_hub/bedside/`, `world.js` |
| L9 | Finnish quote lines | sananlaskut (Finnish proverbs, public domain) | Add nature proverbs that pass engagement 5.5 to the pool. Moomin lines need rights clearance (Moomin Characters). | `demo/data/quotes.json` |

### 3.4 Rejected, with the reason

- **Bite creature collection** (critic D3): a variable post-response reveal in the core changes motivation inside the RT measure and breaks engagement R1 (no chance payoff). Rejected.
- **Morning reveal before Begin** (critic C7): something new before `mood_start` breaks engagement R10 and D5. Visitors stay after the check-in.
- **Mountain range as the streak** (critic C5): it duplicates the village, which already is the landscape of mornings lit. Rejected.
- **Showing the live pulse as lantern flicker** (player judge): breaks Decisions R2. The Heartline shows the led rhythm in the terrain instead.
- **Station choice on the Ride** (critic D4e): a choice-confounded bandit arm for 1.5 arms per session. Later at best.

---

## 4. Conflicts with existing specs and how to resolve them

### 4.1 Conflict table

| # | Conflict | Resolution (this file decides) | Who edits |
|---|---|---|---|
| C1 | Streak: `GameDesign.md` pillar 3 and section 9, `DesignSystem.md` rule 3, lookdev 9 and minigames "0. Rules for every task" forbid it; engagement.md specifies it; minigames 0.5 points to a coreloop streak spec that does not exist | Engagement.md D1 wins: one small number on the start screen (06:00 to 21:00) and the end tick only; no number in the game, the village or the patient view. Change minigames 0.5's pointer to `design/engagement.md` section 6 | orchestrator (Decisions), spec owners |
| C2 | Self-report drives play: minigames 0.6 (assist on `mood_start`), lookdev 3.2.4 (`V.kind` on mood <= 2), `quote.js` (mood-tagged quote) versus questions.md rule 6 and engagement's firewall | The firewall wins: no game or meta output reads the mood answer or the core RT. Changes M5 and M6 | build agents |
| C3 | Bedside light caps: coreloop "full warm daylight", engagement "at most 60%" first ramp, Decisions #27 and R4 (15%, cap 25%) | Two regimes. Morning: first light 12%, core 12%, ladder, Give to `M` 60% (25% with "Shared bedroom"), monotonic. Night: #27 and R4 unchanged | orchestrator (Decisions), coreloop owner |
| C4 | `engine.js` `modeLight()` dims the room on mode change | Replaced by the S3 ladder; mode changes the tint only | engine owner |
| C5 | Single light pool (critics) versus engagement 5.2 "no light as currency" | Compatible as specified in S2 of 3.2: one pool per session, no exchange, no carry-over, sets only the ribbon and the flock. Fork orbs and Bite beads stay outside | none beyond 3.2 |
| C6 | Coreloop approach-line carry and mode-shaped ride before Fork and Lanterns versus X20 (fixed measurement context) | The standard hill (S1 safeguards) before both measurement stations. Carry was already off for them | coreloop owner (6.3, "Lines, risk and reward") |
| C7 | Minigames 0.2 "no warm-up below `L_eff`" versus engagement 5.3 morning warm-up | Engagement 5.3 wins (as it already says) | minigames owner |
| C8 | Engagement 3 step 5 still describes "Walk, task, walk" and Alto's auto-walk | Stale: coreloop's Ride supersedes | engagement owner |
| C9 | Day boundary: engagement 04:00, systems review 05:00, X25 "last valid session of a day" without a rollover | 04:00 local for the streak, the village, X25 and the sleep-regularity feature | Statistics owner |
| C10 | `streak.js` counts `completed` and `fell_asleep` only; engagement 6.1 and lookdev 9 define the lit morning differently | Engagement 6.1 (core finished with player input) for streak, village and week. Lookdev 9's rule changes to match | engagement and lookdev owners |
| C11 | Night-first rows (X19, X35, lookdev 8.3) versus coreloop "Morning ritual" | Morning is the primary path; night rules stay as the fallback, unchanged | orchestrator (Decisions) |
| C12 | Frost (S2) versus engagement R2 "nothing decays" | Frost removes nothing, never touches anything persistent, and the thaw is the reward. Patient advocate checks it before the pilot | clinical owner |
| C13 | Heartline (S1) versus Decisions R2 "never mirror a racing heart" | No beat on screen; high pulse makes hills longer and the world warmer, never faster | none beyond S1 |
| C14 | Beacon bpm from minigames 0.3 versus `b` from S1 | `bpm = clamp(b + (bpm_d - 84), 60, 104)`; the DDA axis becomes an offset | minigames owner (3.9, 0.3) |
| C15 | Gris powers versus "the dawn is identical whatever was gathered" (coreloop 8.2) and calm "no launches" | Powers act on the Ride only, never on the dawn; green becomes a longer glide in calm; all powers off on the standard hill | coreloop owner |
| C16 | Task unlock schedule versus minigames "11 tasks" and the bandit (X9) | Fixed by `day_index`, logged `unlocked`; demo flags show all. Statistics confirms the arm prior | Statistics owner |
| C17 | Fork scarf cap 4 (minigames 3.2) versus the reward range 2 to 6 | Uncap to 6 | minigames owner |
| C18 | Bells and stars presentation changes versus fixed `items` and `errors` meaning | `extra.v` bump and a Decisions row each; `items` and `errors` keep their names with the meanings in 3.2 | orchestrator (Decisions) |
| C19 | X28 (sound out of scope) versus readable grades on a silent phone | Ask David to allow 8 samples (S15); haptics (M2) are the must either way | David |
| C20 | `References.md` v2 still anchors tasks in Among Us | Replace the task table with the minigames section 1 winners and add S1 to S3 role models | references owner |

### 4.2 Decisions rows needed (for the orchestrator to log)

1. Morning ritual is the primary session; night is the fallback (C11).
2. Streak scope per engagement D1 (C1).
3. Measurement firewall: no game or meta output reads mood or core RT (C2).
4. Bedside light morning regime: 12% first light, 12% core, ladder, `M` 60% or 25% shared, monotonic; night unchanged (C3, C4).
5. Signature S1 Heartline, with the standard hill before Fork and Lanterns (C6, C13, C14).
6. Signature S2 Frost and weather, never in the core, the measurement tasks or rest (C12).
7. Signature S3 Carry the sunrise, including the knob setting tomorrow (later part).
8. Day boundary 04:00 shared by streak and X25 (C9).
9. Scarf uncapped to 6, `fork_ui` bump (C17).
10. Bells v2 (call and response) and stars v2 (one stroke), `extra.v` bumps (C18).
11. Task unlocks by `day_index` (C16).
12. Input default `touch` (M1).
13. X28 reopened for 8 samples, if David agrees (C19).

### 4.3 Sources

- Frostpunk frost at the screen edges: kotaku.com/new-city-building-game-frostpunk-is-great-for-those-of-1825499161 ; corrosionhour.com/frostpunk-review/
- Mightier: mightier.com/how-it-works
- Alarmy Wake Up Check: alar.my/en/blog/alarmy-wake-up-mission
- Hatch Restore 2: help.hatch.co/hc/en-us/articles/27313612195223-Restore-2-Alarm-Guide
- Left 4 Dead AI Director: Booth, AIIDE 2009, steamcdn-a.akamaihd.net/apps/valve/2009/ai_systems_of_l4d_mike_booth.pdf
- Duolingo streak changes: blog.duolingo.com/improving-the-streak (via engagement.md)
- Dawn simulation evidence: ajp.psychiatryonline.org/doi/abs/10.1176/appi.ajp.162.4.656 (via the market scout)
- [K], from memory: Audiosurf, Philips Wake-up Light, Philips Hue Sync and Ambilight, Patapon, One Touch Drawing, Brain Age, Gris abilities, HeartMath Inner Balance, Playdate crank, Elevate and Lumosity, Raj and Kalyani 2017
