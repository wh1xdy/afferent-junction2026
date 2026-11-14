# Afferent role-model map (whole app)

Rule (David): every screen, feature and mechanic is anchored in a named, established product or study. The exact pattern is taken as close to 1:1 as possible. Every deviation names the concrete constraint that forces it.

This map reuses the role models already chosen in `design/minigames.md` (tasks, DDA, juice) and `design/lookdev.md` (world, light, camera, moments), and `References.md` (v2 frame). Engagement mechanics come from `design/engagement.md`. `design/coreloop.md` and `design/gui.md` do not exist. GUI role models come from the three mockup directions in `design/mockups/` and from `GameDesign.md` 0.6 and 9.

Status column:
- **built**: in `demo/` or `hub/` now
- **spec**: specified, not built
- **new**: introduced by `engagement.md`

[K] marks role-model details nobody could re-verify this session, because the shared web search budget ran out. Check them against footage or docs before quoting.

## 1. Entry, habit and prompts

| Element | Role model | Exact pattern taken | Deviations (constraint) | Lives in | Status |
|---|---|---|---|---|---|
| Onboarding | Duolingo onboarding goal picker and "Commit to my goal" (Lenny's Newsletter); Fogg Tiny Habits recipe; Gollwitzer and Sheeran 2006 implementation intentions; Nunes and Dreze 2006 endowed progress | One screen: pick a small goal ("a week"), a usual time, a button to start. The first session counts | Pledge replaced by an if-then line the patient completes (a broken pledge invites self-blame). No notification permission (Android guide: not at first launch). Day 1 is a real clinic session, never fake stamps (honesty) | `engagement.md` 6.8; to build: `demo/index.html` `#onboard`, `demo/js/main.js` | new |
| Start screen | Monument Valley and Alba (the title is the place); Alto's Odyssey Zen Mode (low-stakes choice); Pixel Clock Bedtime mode (the `bedtime-instrument` mockup: dim, calm, few controls) | The live world is the menu; two equal buttons "Begin" and "Not today"; icons only for the rest | No greeting. The streak number is small and absent below 2 (Silverman and Barasch). Nothing new before `mood_start` (pre/post validity) | `demo/index.html` `#start`, `main.js` `morningText()`, lookdev 10, `engagement.md` 3 | built (world-as-menu: spec) |
| Day streak | Duolingo streak after Nov 2020 (blog.duolingo.com/improving-the-streak) | One unit of the behaviour extends the streak; the count sits on the home screen; it ticks up at the end of the session | The unit is "fixed core with input", not a lesson (aligns with measurement). Never 0, never a flame, hidden 21:00 to 06:00 (night rule). Not in the patient view or pushes | `hub/afferent_hub/views.py` `streak()`, `contracts/api.md` patient-view; to build `demo/js/streak.js`; `engagement.md` 6 | built in hub (old rules), UI new |
| Streak Freeze | Duolingo Streak Freeze (blog.duolingo.com/how-duolingo-streak-builds-habit) | Up to 2 held, used automatically on a missed day, the day shown differently, the count does not grow | 2 given at onboarding; earned 1 per 7 mornings lit instead of bought (no economy beside Fork and Two lanterns). No "freeze used" interstitial (reminds of the miss). Frost-rim glyph, not ice blue (mood-1 collision) | `views.py` `FREEZE_EVERY`, `FREEZE_MAX`; `engagement.md` 6.4 | built (hub: starts at 0, earned on streak days; to change) |
| Not today | Apple watchOS 11 Pause Rings "For today" (9to5mac.com 2024); Alto's Zen Mode | One tap rests today without breaking the streak | Unlimited; logged `declined`, never missed (Decisions #35) | `main.js` `$('decline').onclick`, `A.declinedRecord`; `daily.declined` | built |
| Planned pause | Apple watchOS 11 Pause Rings (imore.com) | Menu "Today / Until Monday / Until next month / Custom date"; awards and streaks survive | Patient pause capped at 14 days per pause, renewable; clinician pause uncapped (relapse signal). Separate from the sharing pause (privacy is not rest) | `engagement.md` 6.4; to build `#settings` | new |
| Repair | Duolingo "earn back" (Shuttleworth, Lenny's Podcast); Finch repair hammer (Mobbin); Silverman and Barasch 2023 | A broken streak can be restored by doing the behaviour again soon | Free, automatic, no task, no monthly cap, history unchanged (self-blame; truthfulness) | `engagement.md` 6.4 | new |
| Mornings lit total | Ten Percent Happier "Mindful Days" (support.tenpercent.com); Strava lifetime totals [K] | A cumulative count that never decreases | Shown in the patient view only; the village is its wordless form | `engagement.md` 6.2; to build `patient.js` | new |
| Streak hide toggle | Headspace Run Streak eye toggle (help.headspace.com) | A profile switch hides the streak | None | `engagement.md` 6.6; to build `#settings` | new |
| Milestones | Duolingo streak milestone animation (+1.7% D7); Kivetz, Urminsky and Zheng 2006 goal gradient | Celebrate at fixed counts, front-loaded in week 1 | Counted on mornings lit, not the streak (a break never delays one). Played in the world after the check-in, no modal, no share button | `engagement.md` 4, 5.2; to build `world.js` `village()` | new |
| Morning reminder | Duolingo practice reminder (Yancey and Settles, KDD 2020); Apple HIG "Managing notifications"; Android 13 notification permission guide | One per day; template rotation with a recency penalty; stop after silence; ask permission in context after a few launches | Fixed send rule, not learned timing or a bandit (keeps missed sessions clean). Passive level only. World-only copy (lock-screen privacy). Back-off after 3, not 8, with no escalation (guilt) | `engagement.md` 7; to build `demo/js/remind.js`, `demo/data/reminders.json` | new |
| Notification actions | watchOS per-notification "Mute 1 Hour" | Act on the notification without opening the app | "Not today" and "Pause 7 days" instead of mute | `engagement.md` 7.3 | new |
| Bedside sunrise | Philips Wake-up Light [K]; Hatch Restore (wareable.com review); `References.md` sunrise alarm clocks | Light rises before waking; one physical action ends the routine | 60% `#FFF3DC` cap; push off when it is on (one cue); never "light therapy" (claims) | `GameDesign.md` 6, 8; `engine.js` `this.light(...)` dawn; `POST /api/bedside/light`; timed routine later | built at dawn, timed routine later |
| Widget | Anti-model: Duolingo widget ("increasingly panicked", blog.duolingo.com/widget-feature) | One-tap entry from the home screen | Static lantern, no number, never changes with time or a missed day (no nagging, lock-screen privacy) | `engagement.md` 7.4 | later |

## 2. The session

| Element | Role model | Exact pattern taken | Deviations (constraint) | Lives in | Status |
|---|---|---|---|---|---|
| Begin, "the lantern catches" | Inside and Limbo cold open; Journey opening reveal | Light reveals the world; camera dollies out to the goal | Identical every session (measurement) | lookdev 8.1 | spec |
| Fixed core: rest and start check-in | Driver drowsiness systems (PERCLOS); Daylio five-point one-tap mood (en.wikipedia.org/wiki/Daylio); van Berkel 2017 gamified ESM | 6 s of stillness; one tap on an ordinal 5-point scale | Lanterns instead of faces, wordless (claims, no emotion words); no question text (lookdev 15 #21) | `engine.js`, `measures.js`, X3, X4 | built |
| Reaction core "Bite" | Animal Crossing: New Horizons fishing; Kirby Super Star Samurai Kirby | Still float, one unmistakable plunge, press anywhere, catch arc, recast; stillness and a held cue | No fake nibbles, no species or sizes, catch identical for every speed, tap anywhere (RT validity, no scores, one hand in bed) | minigames 3.1 | spec |
| Core loop traversal | Alto's Odyssey one-touch auto-run (`References.md`); Among Us task panels (frame only); Journey goal on the horizon | The figure walks by itself; a short modal task opens; close and continue; the lighthouse is always visible | Walk 2.4 to 3.6 s, one biome tableau per task (lookdev 15 #9); Among Us is the frame, never the task design (minigames 0) | `engine.js`, `world.js`, lookdev 6.3 | built |
| Camera | Alto's Odyssey depth camera; Monument Valley composed stillness; Journey restraint | Dolly by depth, never shake | No camera in reduced motion | lookdev 6 | spec |
| Director | Left 4 Dead AI Director (Booth, GDC 2009); anti-model Nevermind | Estimate intensity, cycle build-up, peak and relax | Intensity is the body (pulse vs baseline, PERCLOS). It moves the player towards calm or awake, never harder under stress. Optimises wellbeing signals only, never return (EU AI Act Art. 5(1)(b)) | `engine.js` mode selection, `GameDesign.md` 4, minigames 0.4 | built |
| Shared difficulty (DDA) | Levitt 1971 and Kaernbach 1991 staircases; Hunicke 2005 Hamlet; Resident Evil 4 rank; Crash Bandicoot help; Flow (Chen 2007) | Weighted up-down, invisible small steps | Miss-share guard of 15% (10% calm) and a morning warm-up (sleep inertia, Hilditch and McHill 2019); `engagement.md` 5.3 | minigames 0.2, 0.3; `demo/js/skill.js` (spec) | spec |
| Ramp, heat, boss | WarioWare Touched!, Smooth Moves | Speed-up stinger, boss stage closes the set | Wordless stinger; boss pays double light, which stays inside the task | minigames 0.2 | spec |
| Curves and bags | Tetris NES gravity table, Guideline 7-bag; Threes unlock thresholds | Steepening curve; shuffled bags; step unlocks | None | minigames 0.1 | spec |
| Grades | Rhythm Heaven | Perfect, hit, barely, miss, each with its own reaction; the song never stops | Juice only, never words or a negative colour; "barely" keeps the "good" pitch (negative-feedback sensitivity, Elliott 1997) | minigames 0.5; `engagement.md` 5.3 | spec |
| Combo tiers | Guitar Hero multiplier; Fruit Ninja blitz | Streak of hits raises a tier | Hidden; a miss drops one tier, never to zero; the tier holds 1 s then fades; no blitz decay in the first task or under assist | minigames 0.5; `engagement.md` 5.3 | spec |
| Fever | Peggle Extreme Fever; Tiny Wings fever | Rare earned state, bigger and pays extra | Once per task at most, through the flash guard | minigames 0.5 | spec |
| Bad-morning assist | Celeste Assist Mode | Slower game speed, wider tolerances | Switches itself on quietly, no menu; `w` = 0; one general line in the consent text (transparency) | minigames 0.6 | spec |
| Fork (slot 1, measurement) "Fell or Shore" | Monument Valley; Journey scarf; Peggle pitch ladder; Treadway EEfRT | Two paths, fixed effort cost, fixed reward 1 vs 2 or 3 glows | No DDA, grades, combo, fever or assist ever; no path-specific juice; any presentation change bumps `fork_ui` | minigames 3.2, X20 | built (old look), spec |
| Two lanterns (slot 3, measurement) "Lantern Release" | WarioWare "pick the bigger one"; Peggle Extreme Fever (scheduled reward only); Pizzagalli PRT [K] | Tap the bigger of two; 3:1 rich to lean reward | Celebration only on the 4 scheduled rewards; response juice identical for both sides and for correct or incorrect; bump `extra.v` (reward salience changes the task) | minigames 3.3, X21 | built (old look), spec |
| Breath "Lantern Song" | Journey song; Apple Watch Breathe | Hold to gather, let go to sing; 4 s in, 6 s out | Positive-only grading; rest-mode breath excluded from DDA (rest exists to drift off) | minigames 3.4 | spec |
| Loyly "Silk Pour" | Cooking Mama pour; Flower; Stardew charge preview | A finite pour that must be slow and even | Calm: no tempo or pitch build | minigames 3.5 | spec |
| Threads "Aurora Loom" | Flow Free; Monument Valley solve; Dots line feel | Connect pairs on a grid, perfect = one drag per pair | 6x6 only if cells stay at least 46 pt (touch in bed) | minigames 3.6 | spec |
| Stars "Joutsen" | Two Dots; Okami constellations; Threes intro | One drag chains the stars, small to large | Brightness jitter independent of size; hit areas at least 44 pt | minigames 3.7 | spec |
| Fireflies "Firefly Fling" | Fruit Ninja Zen; Vampire Survivors pickup | Brush targets at the apex; multi-hit combos; bombs | Frost motes cost one tier only, never on the first task of the morning | minigames 3.8 | spec |
| Beacon "Harbour Beat" | Rhythm Heaven; osu! approach circle (OD, AR) | Tap on the beat when the ring meets; one difficulty number sets windows | bpm cap 104, each light pool under 1 Hz (photosensitivity) | minigames 3.9 | spec |
| Bells "Tower Chain" | Simon; Peggle per-hit pitch build | Echo a growing chain; speed-up at fixed lengths | Show capped at 2.2 s per round; every second error shortens the chain | minigames 3.10 | spec |
| Shutters "Wake the House" | WarioWare Touched!; Peggle last peg; Beat Saber direction cue | Read the shape, swipe the way it says | A window waits as long as needed (no fail) | minigames 3.11 | spec |
| Juice kit | Vlambeer-style juice [K]; the per-task models above | Particles, squash, hit-stop, bloom, haptics | Flash guard, 3 Hz rule, R5 dark-room cap, reduced motion | minigames 2 (`demo/js/juice.js`) | spec |
| Colour return | Gris (colour returns); Ori (spirit light travels to the hero) | A mote flies to the lantern, colour floods outward from it | Timeout returns colour too, just slower (no punishment) | lookdev 7.4, 8.2; `GameDesign.md` 6 | built (old sweep), spec |
| Lighthouse ladder | Journey (goal grows brighter); Monument Valley (the structure completes) | Each step of progress brightens the goal | Never inside the rest measurement | lookdev 4.5 | spec |
| Peak-end rule | Kahneman et al. 1993; Redelmeier and Kahneman 1996 | Improve the ending | Never lengthen it; no task may overrun play; quiet assist on the last boss item after misses; not the top bandit arm (position bias) | `engagement.md` 5.4; `engine.js`; `GameDesign.md` 0.1 (amend the 3 s overrun) | new |
| Dawn | Alto's Odyssey sunrise; Journey summit; Old Man's Journey; Craske PAT savouring | The sun crests a ridge, the sky ignites outward, linger | 8 s, identical every session (constant pre/post effect); no milestone or visitor before the check-in | lookdev 8.3; `engine.js` dawn phase | built (4 s), spec |
| Night end, falling asleep | Inside and Limbo (the last light is the hero's); Kentucky Route Zero tableau | Hold a quiet tableau as the light goes down | 30 s eyes closed ends it (X35); no dawn light | lookdev 7.6, 8.3 night | built (fade), spec |
| End screen, done state | Wordle one per day; Instagram "You're All Caught Up" (about.instagram.com 2018); Ring Fit "take a break" | An explicit finished state; nothing more today | "Good morning." / "Rest well."; replay only from Settings or demo, never counted (X25) | `index.html` `#end`, `main.js` `goHome()`; `engagement.md` 3 | built (no "play again"), "See you tomorrow" new |
| Shine | Fogg celebration; Duolingo end-of-lesson streak count-up; Sky placed candle | Celebrate right after the behaviour; the count ticks up | After the check-in (pre/post validity), under 2 s, identical whatever the mood; no number at night | `engagement.md` 3 step 8; lookdev 8.3 mote | new |
| Village of lanterns | Sky: Children of the Light placed candles; Animal Crossing (the town remembers) | One permanent light per session, never removed | Never counted on screen; lit by the same rule as the streak (core with input) | lookdev 4.6, 9; `localStorage` `afferent.world`; `moments.js` | spec |
| Dawn visitor | Pokemon Sleep (guaranteed minimum each morning, varied); Neko Atsume (visitors and mementos) | Something guaranteed is there each morning, which one varies | Only species already met; new ones on a fixed schedule; no rarity; after the check-in; max 2 s; anti-model Pokemon Sleep's long review | `engagement.md` 3 step 9, 4 | later |
| Tomorrow hint | Stardew Valley crops tomorrow [K]; Ovsiankina resumption | A visible thing that will be further along tomorrow | A boat nearer the jetty, never a countdown | `engagement.md` 3 step 12 | new |
| Seasons towards spring | Animal Crossing real-time clock (Eguchi, gamedeveloper.com) | The world follows a clock, not play | The clock is `day_index` (treatment arc), not the real calendar, because the real north gets darker for weeks | lookdev 9 NICE; `engagement.md` 4 | later |
| Quote | Calm "Daily Calm" [K]; Wordle shared daily item | One item per date, the same for everyone | After the check-in; curated, at least 365 lines, no repeat within a year; replaced by the crisis offer; content rules (no affirmations, Wood et al. 2009 [K]) | `engagement.md` 5.5; to build `demo/data/quotes.json` | new |
| Exit | Among Us panels (close and come back) | One close button, no confirmation | Saved as partial | `index.html` `#closeBtn`, `GameDesign.md` 9 | built |

## 3. Questions and safety

| Element | Role model | Exact pattern taken | Deviations (constraint) | Lives in | Status |
|---|---|---|---|---|---|
| Mood check-ins (start, end) | Daylio five-point scale; `DesignSystem.md` mood lanterns | One tap, ordinal 5 points, no wrong answer | Colour and brightness rise together (ordinal); null is fine | X3; `measures.js`; `main.js` `#moodEnd` | built |
| Weekly check-in | PHQ-2 plus PHQ-9 item 9 wording (Kroenke 2003 [K]); Apple HIG (no interruption) | Validated item wording, four standard options | A start-screen pill, not a push (interruption budget); "Later" snoozes 24 h | `main.js` `WEEKLY_ITEMS`, `weeklyPill()`, `#weekly` | built |
| Harm check (every 4 weeks) | NICE ESF Standard 2 acceptability | One item in the existing weekly check-in | Needs clinical sign-off; a "pressure" answer suggests the hide toggle, no push | `engagement.md` 10 | later |
| Talk to someone, crisis card | SPARX (Merry et al., BMJ 2012); `References.md` 3 | Crisis is a referral matter outside play: a fixed card | Self-report triggers only, never signals or missed sessions (X26); replaces the quote when offered | `main.js` `crisis()`, `index.html` `#crisis`, `patient.js` `CRISIS` | built |
| Crisis offer after mood 1 twice | SPARX; X26 | Offered, never forced | None | `engine.js` `crisisOffer`, `main.js` `#offer` | built |

## 4. Settings

| Element | Role model | Exact pattern taken | Deviations (constraint) | Lives in | Status |
|---|---|---|---|---|---|
| Sensor switches | Apple Health per-app data access toggles [K]; iOS-style toggles (`DesignSystem.md`) | One switch per data source | "Never camera images, sound or messages" stated beside them | `index.html` `#settings` `[data-sensor]`, `main.js` `toggles()` | built |
| Clinic sees: summary / nothing tonight / pause 7 days | Find My "Stop sharing my location" [K] | Pause sharing without leaving the service | Withheld days never count as missed (SessionSchema) | `#sharingSeg`, `main.js` `applyPrivacy()` | built |
| Morning reminder and wake window | Apple HIG (in-app setting required) | A switch plus a time | Hidden until permission is granted | `engagement.md` 7.1 | new |
| Pause menu | Apple Pause Rings | As in section 1 | As in section 1 | `engagement.md` 6.4 | new |
| Show the morning count | Headspace eye toggle | As in section 1 | None | `engagement.md` 6.6 | new |
| Show a line after the session | Calm Daily Calm opt-out [K] | Turn the daily item off | None | `engagement.md` 3 step 10 | new |
| Sound, quiet night, reduced motion | Apple accessibility settings; `prefers-reduced-motion` | System-style switches | Sound starts at 25%; quiet night caps light at 25% | `#soundSw`, `#quietSw`, `#motionSw` | built |

## 5. Patient view

| Element | Role model | Exact pattern taken | Deviations (constraint) | Lives in | Status |
|---|---|---|---|---|---|
| Today (arc) | Apple Fitness Summary, today first, then trends [K] | Today's result on top | Warmth through the session as a curve, no numbers (no pulse, z or state) | `patient.html` `#today` `#arc`, `views.py` `_arc()` | built |
| Week as lanterns | Duolingo streak calendar (frozen days drawn distinctly); Brain Age stamp calendar (trustedreviews.com); Pokemon Sleep weekly reset | One mark per day, a fresh row each week | Shape glyphs (frost rim, set-down lantern, unlit lantern), never X, grey or a hue for freeze; no perfect-week badge | `patient.js` `renderWeek()`, `views.py` `patient_view()` `week` | built (mood ribbon), glyphs new |
| Mornings lit | Ten Percent Happier Mindful Days | Cumulative count | Never decreases | `engagement.md` 6.2 | new |
| What helped | Daylio activity-mood correlations (en.wikipedia.org/wiki/Daylio); behavioural activation activity-mood diary (Dimidjian 2006); Moodivate [K] | Show which activity went with feeling better | Positive associations only, hedged ("seemed to help on 4 of 5 mornings"), fixed templates, full uncertainty for the clinic (X9) | `views.py` `what_helped()`, `patient.html` `#helped` | built |
| Visitor book | Neko Atsume Catbook; Pokemon Sleep Sleep Style Dex | A book of what visited | Only those met; no silhouettes, totals or "new!" badges (completion compulsion) | `engagement.md` 4 | later |
| What the clinic sees | Supportive Accountability (Mohr 2011) | One named, trustworthy human with clear expectations | "Your clinic sees your weekly summary, nothing more"; a "seen" mark only on a real view event | `views.py` `CLINIC_SEES`, `patient.js` | built (text), mark later |

## 6. Clinic

| Element | Role model | Exact pattern taken | Deviations (constraint) | Lives in | Status |
|---|---|---|---|---|---|
| "Who might need a call" list | NEWS2 (Royal College of Physicians, rcp.ac.uk NEWS2 charts 2 and 4) | An aggregate weighted score with banded thresholds, each tied to a named clinical response; a single strong parameter can trigger on its own; thresholds can be adapted per patient after assessment | Scores are robust z against the patient's own 14-day baseline, not population norms (X15). States are suggestions ("consider a check-in call"), the clinician decides. Strongest colour is dawn coral, never red (DesignSystem rule 3) | `hub/afferent_hub/web/clinic/views.js` `V.list`, `V.row`; `views.py` `patient_row()`, `sort_rows()` | built |
| Composite index and contributions | NEWS2 aggregate; weighted feature contributions | Show the total and what drives it | Weights follow the evidence level (X16) | `views.js` `V.contrib`, `compositeBand()`; `analytics/engine.py` | built |
| CUSUM states | Page's CUSUM [K]; CUSUM monitoring of surgical outcomes (Spiegelhalter et al., after the Bristol inquiry) [K] | A one-sided cumulative sum against a reference with stepped thresholds | States stable, watch, check-in, booster; k 0.5 from day 14 (X17); only on days with data (X30) | `analytics/stats.py`, `views.js` `V.detail` history | built |
| Timeline with baseline band | Tufte sparklines with a normal band [K] | One series against its normal range | Per feature, own baseline | `views.js` `V.drawTimeline`, `web/clinic/charts.js` | built |
| What helps (clinic) | Thompson sampling (X9) | P(best) with uncertainty | Headline is sessions until P(best) stays at least 0.8 (X32) | `analytics/bandit.py`, dashboard tile | built |
| Weekly summary | Apple Health highlights, template sentences from computed numbers [K] | Short sentences that restate numbers | Gemma rephrases computed numbers only, template fallback, labelled "generated on device", never patient-facing (X13) | `hub/afferent_hub/summary/` | built |
| Live panel with stick figure | MediaPipe Pose landmark overlay | Skeleton drawn from landmarks | Frames stay in memory, never stored; knob press hides it | `GameDesign.md` 8; `views.js` live panel | built |
| Crisis and talk flags | NEWS2 "escalation" plus a named responder | A flag goes to a named person with a response time | Reviewed within one working day; not monitored around the clock | `contracts/api.md` flags, `views.js` `flag-chip` | built |
| Engagement context | Duolingo internal streak analytics (Lenny's Newsletter) | Track streak state per user | Freeze, repair and pause bands; `reminders_paused`; never used as a target | `engagement.md` 6.7, 10 | new |
| Data export | Apple Health "Export All Health Data" (one action, one zip) [K]; HL7 FHIR Bulk Data `$export` (NDJSON per resource type) [K] | One action exports everything, one file per record type | Zip with sessions NDJSON, daily CSV, features CSV and a codebook from `SessionSchema.md`; no FHIR server tonight; SIMULATED flags kept | `engagement.md` 11 S7; to build `api/routes.py` `GET /api/patients/{id}/export`, `views.js` | new (only the per-session JSON download in the demo panel exists: `main.js` `$('download')`) |

## 7. World and look (summary; details in lookdev)

| Element | Role model | Exact pattern taken | Lives in |
|---|---|---|---|
| You carry the only light | Limbo, Inside; Kentucky Route Zero | Light reveals the world; pools on clean dark | lookdev 1, 3.1 |
| Grade, bloom, rays | Gris paper grain; Alto's sunrise | Static grain, emitter bloom, a ray fan | lookdev 3 |
| Figure | Journey (faceless, scarf) | Silhouette, pendulum lantern | lookdev 5 |
| Birds and life | Alba (wildlife returns); Alto's flocks | One flock after the blue wave, one at dawn | lookdev 4.7 |
| Bad day | lookdev 3.2.4 (kind, held, not darkened) | Same reactions, gentler world | lookdev 3.2.4 |

## 8. Conflicts flagged

| # | Conflict | Where | Resolution |
|---|---|---|---|
| C1 | Task role models: Among Us per task (v2) vs new primary role models (Among Us as the frame only) | `GameDesign.md` 5, `References.md` 2 vs minigames 0 and 1 | minigames.md wins; update `References.md` 2 and `GameDesign.md` 5 when the tasks ship |
| C2 | "No streak" | `GameDesign.md` pillar 3 and 9, `DesignSystem.md` rule 3, lookdev 9, minigames 0 rules vs `views.py` `streak()`, `contracts/api.md`, the brief | engagement D1: start screen and end tick only; Decisions row needed |
| C3 | Missing specs | minigames 0.5 points to `coreloop.md` "Morning ritual"; `gui.md` absent; three GUI mockup directions with no choice recorded | Point to `engagement.md`; record the GUI direction in Decisions |
| C4 | Hub streak rules | `views.py`: freezes start at 0, earned at every 7th streak day, only `completed` and `fell_asleep` count, drops to 0, pause derived from sharing | engagement D2 to D4, build item M2 (tests in `hub/tests/test_api.py` assert the old rules) |
| C5 | What lights the village | lookdev 9 (`completed`, or `partial` with at least 1 task) vs ethics E1 (core with input) | engagement D3: one rule, core with input |
| C6 | Freeze colour | Researchers' ice-blue lantern vs mood 1 `#34476E` in the week ribbon | Frost-rim shape glyph (R15) |
| C7 | Difficulty | minigames 0.2 "no warm-up below `L_eff`", `p*` 0.75 to 0.80; 0.5 barely "softer, lower note"; blitz decay everywhere | engagement 5.3 (warm-up, miss-share guard, same pitch, silent combo loss); D6 |
| C8 | Overrun | `GameDesign.md` 0.1 "a task never runs past the end of play by more than 3 s" | No overrun (peak-end, engagement 5.4) |
| C9 | Visitor and milestone timing | Annoyance (at dawn, overnight on the start screen) vs ethics (after the check-in) | After the check-in, inside the Shine (D5) |
| C10 | Two lanterns celebration | minigames 3.3 Peggle reward celebration changes reward salience | Bump `extra.v`, pool log b within a version (X21) |
| C11 | Weekly check-in channel | `GameDesign.md` 9 "weekly daytime check-in" (read as a push) vs the 1-notification budget | Start-screen pill, as built (D12) |
| C12 | Sharing pause vs rest | `views.py` treats sharing `paused` and `nothing_tonight` as streak-neutral days | Separate streak pause; sharing stays privacy (D4) |
| C13 | Day boundary | X25 (calendar day, last valid session counts) vs the 04:00 boundary | Stats agent applies 04:00 to X25 and sleep regularity |
| C14 | Quote | The brief says a quote follows each session; none is in `demo/` | Build item M6 |
| C15 | Dawn length | `engine.js` dawn 4 s vs lookdev 8 s | lookdev wins when its build lands; the end budget (5 s after the check-in) fits both |
