# Response to the teammate game review (2026-11-14)

Reviewed: the teammate's "Afferent game: honest review and redesign brief" (sections 1 to 9). Three checks ran against it: a clinical evidence check (literature), a code fact check (all branches, fetched today) and a product check (role models: Elevate, WarioWare, Duolingo, Alto). This file rules on every item. Where it conflicts with the review, this file wins. Where a ruling reverses an existing row in `Decisions.md`, it says so and needs its own new row before anyone builds it.

Current direction (overrides older rules quoted in the review section 8): role models in every dimension, interactive and never watching, short instruction text and positive score-like feedback allowed, morning ritual, intuitive over experimental. Non-negotiable: measurement validity and clinical safety.

Refs: `aa:` = this repo on `main` (b710607, same as `junction/afferent-app`), `mg:` = the `minigames` worktree (6f36e88), `A:` = `junction/Alex` (4d738e8), `M:` = `junction/main` (7e8a369), `IM:` = `junction/ios-merge`.

## 1. Summary

The review finds real problems and proposes the right two directions: make every input answer at once, and add a behavioural-activation (BA) step. Its numbers are mostly quoted correctly. Its main mistakes are in how they are applied:

- **Dose.** Effect sizes from multi-week, therapist-delivered BA (Ekers 2014, SMD 0.74) and from about 20 minutes a day of HRV biofeedback (Pizzoli 2021, g 0.38) are borrowed for a one-tap suggestion and a 60 to 90 s segment. No evidence covers those doses.
- **Trial counts backwards.** Moving fork and two lanterns to a 14-day check with 40 to 60 trials gives fewer data than today. The hub already pools 7 sessions (84 lantern trials, 14 fork choices).
- **Mood loop and demand.** Showing the start lantern at the end and brightening the lantern as tasks finish anchors the end rating and tells the player "you should feel better now". Mood change would then measure compliance.
- **Inputs that do not exist.** Sleep from an IR bed sensor, live HRV feedback, presence and visitors on the phone: none of these reach our game. Several are forbidden by standing decisions (I7, I12, I40, I41).
- **Old code.** The review read `afferent-app` and never saw the `minigames` work (the Ride, persistent per-task levels, grades, combos, the village light), so several "missing" items already exist.

## 2. Rulings

A = accept, M = modify (how), R = reject, D = defer.

### Section 3: weaknesses

| # | Item | Ruling | Reason and refs |
|---|---|---|---|
| 3.1 | Start check-in changes nothing on screen | A (finding) | True in `aa:engine.js:203-205`. Fix as in 7.1, value-neutral. On mg the mood already changes the session (`mg:skill.js:35,43-46` assists on mood 1 or 2), which breaks I29 and must be removed |
| 3.2a | Too many short wordless rules, no mastery | A (finding), fix differs | Fix with a one-line instruction per task (now allowed) and fewer, longer tasks per session (7.5), not by cutting the pool |
| 3.2b | Two lanterns frustrates, 12 trials noisy | M | Frustration is real, but the main cause is no instruction and an opaque rule, not the paradigm (lab PRT is ambiguous by design at 75 to 85% accuracy). Noise is real per session, but the composite pools 84 trials (`features.py:145-156`, `Statistics.md` reward bias row). See 7.4 |
| 3.2c | Fork 2 choices weak | M | The pool of 14 choices exists. The bigger validity issue the review misses: the hard path is a dexterity test (8 lights, 1.7 s), so "easy" can mean expected motor failure, not low motivation. Log hard-path success and keep it in mind for analysis |
| 3.2d | minigames.md "nothing built yet" | Corrected | Outdated: mg has `juice.js`, `skill.js` and 11 task files in `demo/js/tasks/` |
| 3.3a | End screen ignores start, then closes | Corrected | Start choice is not shown (correct, and should stay so). It does not close: a sheet with quote and week row follows (`aa:gui/shell.js:166-190`) |
| 3.3b | `helped` learns noise | A | 2 bpm in 10 to 20 s sits inside the RSA swing (A firmware note: "78<->102 BPM over ~10 s"), start and end are phase-locked to the breath, calm mode is entered when pulse is high (regression to the mean), and in aa the pulse is simulated anyway. Already known (R14). See 7.7 |
| 3.3c | Mood never feeds task selection | A (finding), R (implied fix) | Correct as fact. Feeding self-report into selection creates an incentive to tap low (shorter session) and a measurement confound; I29 forbids it |
| 3.4a | Game ignores most data | R | Most of it does not reach our stack (section 4 below) or is forbidden (I7, I40, I41) |
| 3.4b | Fixed measurement slots eat about 30 s | A (finding) | About 36 s (`MEASURE_EST_S=18` each). Addressed by instruction plus Ride placement (7.4), not removal |
| 3.4c | Wordless abstract rules hard to read | A | One-line WarioWare commands, now allowed |
| 3.4d | Week row only "played or not" | Corrected | Wrong: it is coloured by start mood (`aa:shell.js:158`, `streak.js:92`). That itself breaks I30 and must become lit or unlit with one warm fill |

### Section 4: task table and evidence

| Row | Review verdict | Ruling | Reason and refs |
|---|---|---|---|
| Reaction core | Keep | A | Established measure, fixed and identical. Keep its stimulus luminance fixed (see 7.1) |
| Start and end lanterns | Keep, make visible | M | Keep the scale and anchor screen (`checkin.js:38`). Answer the start tap, never show the start answer at the end (7.1) |
| Fork | Move out of daily | R | Keep daily, inside the Ride as a slope choice (coreloop, mechanics-review L4). The move cuts data and adds a test day |
| Two lanterns | Weekly framed check | M | Keep daily with one instruction line and the practice pair (minigames 3.3). Playtest. If it still frustrates, drop it (weight 0.5, exploratory). No weekly block |
| Breath | Promote to core every session | M | Keep mode-driven (calm, high pulse, night) plus an optional longer "stay and breathe" outside the measured session. No dose evidence for 60 to 90 s (7.2) |
| Löyly | Keep as calm variant | A | Fits calm mode |
| Shutters | Keep as BA rehearsal | M | Keep as a wake task. Drop the "open the curtains, sunlight" link: in kaamos there is no morning daylight in Finland for months |
| Fireflies, Beacon, Bells: keep one | R | Groggy mornings (the most common case) would get the same two tasks for 8 weeks. Elevate keeps a large pool and serves a few per session |
| Threads, Constellation: cut | M | Cut only what fails a playtest even with an instruction line. Constellation ("order by size") is the likeliest |
| BA (missing) | Add | M | Add, scoped (7.3). Expect a small effect, cite no effect size |
| HRV biofeedback with live feedback (missing) | Add | R for now | Firmware sends no RR intervals, RMSSD is tested only on synthetic signals, I7 and I40 forbid the fields. Paced breathing without feedback is not clinically inferior (Laborde 2022) |
| CBM | Optional later | R | Cristea 2015: mostly non-significant in patients, vanishes after outlier and publication-bias adjustment. Do not build |

### Section 6: principles

| # | Principle | Ruling | Reason |
|---|---|---|---|
| 6.1 | Every input visibly changes something within 1 s | A | Role-model baseline. For self-report the answer must be the same for every value |
| 6.2 | Fewer tasks, deeper | M | Fewer per session, longer each, skill persists across days (exists in `mg:skill.js`). Keep the pool |
| 6.3 | Inverse difficulty from low mood, low HRV, home-only days | M | Inverse difficulty only from what the person does and from vitals quality (DDA, eye closure, `skill.js` assist from `f` and pulse quality, I29). Never from self-report, never from HRV or presence |
| 6.4 | Daily cheap measures, effort and reward weekly or 14-day | M | Daily cheap measures yes. Effort and reward stay daily and pooled (7.4) |
| 6.5 | Learn from mood change first | R as written | Same-session mood change is biased by demand. Use next-morning `mood_start`, pooled, with randomised task assignment (7.7) |
| 6.6 | Passive sensing invisible, never accusing | A | Also means BA suggestions are not picked from passive data |

### Section 7: change spec

| # | Item | Ruling | How |
|---|---|---|---|
| 7.1a | Start lantern becomes the figure's lantern (mood colour all session) | R | Anchors the end rating for 2 minutes. Also the figure's lantern is the RT stimulus (`aa:world.js:243`, drawn `:1073-1095`): mood-dependent glow (35% to 100%) changes stimulus contrast and couples RT to mood |
| 7.1b | Answer the start tap | A, modified | Value-neutral kindling: the chosen lantern's spark flies into the figure's lantern within 1 s, same warm flame and same animation for every value |
| 7.1c | Lantern brightens per finished task | M | Brightening follows progress through the world (colour return, dawn), the same for every start mood. Never tied to mood |
| 7.1d | Start lantern shown at the end check-in | R | Anchoring and demand. Upward demand also lowers the sensitivity of the self-report safety paths (X26 mood 1 at both check-ins, I31 low-lantern offer) |
| 7.1e | Week row by end-mood colour | R | I30: lit or unlit, one warm fill. A mood-coloured week shows a bad week and sits in view before tomorrow's `mood_start` (weight 1.5) |
| 7.1f | Timeout gives a neutral lantern, null logged | A | Already the logging rule |
| 7.2a | 60 to 90 s resonance breathing in every non-night session | R | No dose evidence for 60 to 90 s; slow eyes-down pacing works against the wake goal on groggy mornings. Keep breathing mode-driven |
| 7.2b | Optional longer breathing | A (new) | "Stay and breathe" on the done screen, 3 to 5 min, outside the measured session. The only place a dose that could matter fits |
| 7.2c | Pacer, start at 7/min, slow to 6 | M | Keep 4 s in, 6 s out (longer exhale is fine). Start at 7/min allowed in calm mode. Cue gentle, not deep, breaths (lightheadedness) |
| 7.2d | Live HRV feedback | R for now | Needs a firmware change (2A37 RR intervals), a validation against an ECG chest strap in low-HRV users and new Decisions rows reversing I7, I40, I12. If ever built: drive from smoothed instantaneous HR, never RMSSD |
| 7.2e | `vs_baseline` and RMSSD before and after as outcome; `rmssd_*`, `rsa_amplitude` fields | R | Slow breathing raises RMSSD mechanically (measures compliance, not vagal change). `vs_baseline` is the median of the last ~10 min in memory (`A:app.py:438,496-500`), so it contains the segment itself. RMSSD is a 60 s window, so a 60 to 90 s segment has about one independent start and end value |
| 7.2f | Fallback pacer without feedback | A | It is the product, not a fallback |
| 7.3a | One BA step per day, 3 icons, one tap or skip | A, modified | In the end slot after the Shine, inside the 5 s end budget (R12), takes the quote's slot that day. No new screen |
| 7.3b | Icons chosen from passive data | R | Feels like surveillance ("it knows I stayed in"), presence never reaches the phone (I41), visitor data is confounded and forbidden (I40). Instead: a values-based menu the person builds at onboarding (BA standard); 3 rotating icons from it; step size may be smaller on low-mood days (buys nothing, graded task assignment); season-aware (no "sunlight" in kaamos, offer "a walk outside at midday") |
| 7.3c | "Did you?" at next session start | M | Ask it after `mood_start` and after the fixed RT core (D5 logic: nothing that can prime the rating comes first) |
| 7.3d | Disproportionate reward for yes or partly | M | Any answer gets a small warm acknowledgement. Yes and partly add one persistent waymarker that never decreases. Never counts toward streak or village light, never shows misses |
| 7.3e | Passive confirmation (`ba_done_passive`) | R | No live presence input; revisit only with presence in our hub and its own Decisions row |
| 7.3f | Non-completion never negative | A | Also never a clinical or bandit outcome; self-reported completion over-reports |
| 7.3g | Shutters as rehearsal | R | Keep Shutters as a wake task only (season) |
| 7.4a | No fork or two lanterns in daily sessions | R | Pools of 14 and 84 today beat 6 to 8 and 40 to 60 per 14 days. Simulated retest ceiling: 48 trials r 0.46 to 0.68, 84 trials 0.62 to 0.80. A test block on PHQ-9 day concentrates burden and reads as an exam |
| 7.4b | Practice round for two lanterns | A | Practice pair from minigames 3.3 plus one instruction line ("Tap the bigger lantern"). Never reveal the 3:1 schedule |
| 7.4c | Align with the 14-day cadence | R | Keeps the 7-session window, the weekly drift rule and early warning |
| 7.4d | Change feature windows | R | Windows unchanged. Alternating fork and lanterns by day (mechanics-review L3) only with Statistics sign-off on X5 and X16 |
| 7.5a | Pool of 4 | R | See section 4 |
| 7.5b | Skill per task across days, progress in the world | A (exists) | `mg:skill.js`, village light, Shine. Known gap: skill state is localStorage only, lost on reinstall |
| 7.6a | Director inputs: start mood | R | Incentive compatibility and I29 |
| 7.6b | HRV, sleep, home-only, visitors | D | No live source in our stack (section 4) |
| 7.6c | Eyes closing leads to wake first; high pulse leads to calm and breathing; night as today | A (exists) | Keep |
| 7.6d | "PHQ-9 item 9 positive: no game, safety screen (as today)" | Corrected, D | Not "as today": the safety screen shows in the check-in flow, but nothing blocks the game. Whether to hold the game that day is a clinical-owner call; holding a supportive contact back can feel punitive. Until ruled, keep today's behaviour |
| 7.7a | Replace `helped` | A | Stop using it for task selection and for the patient "What helped" card (`gui.md:264`, which still says "past nights"). Hide that card until a real outcome exists |
| 7.7b | End minus start mood as main outcome | R | Demand bias. Main outcome: next-morning `mood_start` (measured before any game exposure), pooled across patients |
| 7.7c | Bandit arms as session shapes or BA suggestions | R | About 56 sessions per patient in 8 weeks and a 5-point outcome will not converge per patient. Within a director mode, pick tasks by randomised rotation with logged assignment probability (micro-randomised logic, Klasnja 2015), so pooled hub analysis can estimate effects |
| 7.7d | RMSSD change, BA completion as outcomes | R | See 7.2e and 7.3f |
| 7.7e | "Association, not causation" on every statement | A | Keep |
| 7.8 | Dashboard later | M | Later, without the RMSSD panel. BA completion shown as engagement, not outcome |

### Section 8: do not change

| Item | Ruling | Reason |
|---|---|---|
| Art, world, figure, transitions, dawn, bedside light | A | |
| No fail states, no streak punishment | A | |
| No score, no visible numbers, wordless play | M (superseded) | Short instruction lines and positive score-like feedback (grades, combos) are allowed. Guard: nothing that goes down across days, no comparison with earlier days, no failing grade |
| Night rule, `fell_asleep` | A | |
| Crisis path self-report only, fixed text, never sensor-triggered | A | |
| Claims policy | A, extended | Patient text also never cites 0.74, 0.38 or any effect size (I46) |
| SIMULATED labels | A | |
| No facial expressions in the game | A | Note: `A:jetson/hub/store.py:60-76` ingests expression sessions; keep that out of our stack (V11, I27) |

## 3. Evidence summary

- **BA.** Ekers 2014 (26 RCTs, N 1524): SMD 0.74 vs controls, low study quality, waitlist controls inflate it. COBRA (Richards 2016, N 440): BA by junior workers non-inferior to CBT. Both are full therapist programmes. App BA works as a full programme (Moodivate, Dahne 2025). A one-tap step is BA-inspired, with an unknown and probably small effect.
- **HRV biofeedback.** Pizzoli 2021 (14 RCTs, N 794): g 0.38, prediction interval -0.19 to 0.96. Multi-week, about 20 min a day. Live feedback adds little over plain paced breathing in a 5 min session (Laborde 2022, Psychophysiology 59:e13952: mostly similar effects, only more positive valence with feedback). No evidence that slow breathing is counterproductive in the morning (Zaccaro 2018 links it with alertness), so the case for keeping it mode-driven is design (wake goal, eyes closing, play budget), not efficacy.
- **PRT reliability.** Lab PRT: 3 x 100 trials, retest about 0.57 to 0.59. Noise-only simulation ceiling for retest r: 12 trials 0.14 to 0.34, 48 trials 0.46 to 0.68, 84 trials 0.62 to 0.80, 200 trials 0.80 to 0.89. A redesigned block is worth the burden only at 100 or more trials. The pooled daily version is the better trade for us.
- **Mood anchoring and demand.** Showing the earlier answer reduces spurious change but suppresses real change and invites confirmation (dependent-interviewing research). Expectancy raises single-session self-reported mood gains. Self-reported change shrinks when demand is controlled (Efendic 2022).
- **CBM.** Cristea 2015 (49 RCTs): small, mostly non-significant in patients, gone after outlier and publication-bias adjustment.
- **PPG HRV.** 45 Hz (about 22 ms) is acceptable for RMSSD only with interpolation and good signal (Beres and Hejjel 2021); error grows at low HRV, the depressed population's case.

Sources: Pizzoli 2021 https://www.nature.com/articles/s41598-021-86149-7 ; Ekers 2014 https://pmc.ncbi.nlm.nih.gov/articles/PMC4061095 ; COBRA https://durham-repository.worktribe.com/output/1377553 ; Laborde 2022 https://eprints.bournemouth.ac.uk/38163 ; PRT https://www.millisecond.com/library/probabilisticrewardtask , https://depressioninstitute.uci.edu/wp-content/uploads/sites/37/Dillon_CP24_withSuppl.pdf ; Cristea 2015 https://www.cambridge.org/core/journals/the-british-journal-of-psychiatry/article/efficacy-of-cognitive-bias-modification-interventions-in-anxietyand-depression-metaanalysis/F277CBE661CF8960AF9C2014B42300AB ; Zaccaro 2018 https://www.frontiersin.org/articles/10.3389/fnhum.2018.00353/full ; Efendic 2022 https://cris.maastrichtuniversity.nl/files/111584793/Efendic_2022_Bias_in_Self_Reports.pdf ; PPG sampling https://www.measurement.sk/2019/msr-2019-0030.pdf ; Klasnja 2015 https://archive.md2k.org/images/papers/jitai/nihms732638_Klasnja.pdf ; Moodivate https://alert.psychnews.org/2025/04/digital-behavioral-activation-app-shows.html

## 4. Corrected facts (review section 5 and code refs)

| Review claim | Fact |
|---|---|
| Finger pulse "real" | Real hardware on A and M, but it does not reach our game: our bedside source is `UnoQSerial`, which the UNO Q does not speak; the hub defaults to `sim`; no BLE path in aa; I12 blocks one before Alex answers |
| HRV RMSSD, SDNN, `vs_baseline` "real" | Only on A, not M. Tested only on synthetic signals. BLE carries only integer RMSSD 0 to 255 (AFF1 byte 4); SDNN and `vs_baseline` are HTTP only. `vs_baseline` is a ~10 min in-memory rolling median, not a personal baseline, reset on restart |
| Live feedback from IBIs possible | No. Per-beat BLE value is `bpm_live`, the median of 8 IBIs, which flattens the RSA wave; 2A37 is sent without RR intervals (`A:ble.py:6`). Needs a firmware change |
| Breathing rate from RSA, real | Correct, and also on M. Missing from the table: TrueDepth head-motion breathing (`M:ios/Afferent/Breathing.swift`, "Experimental") |
| rPPG "1.8 bpm mean error" for iPhone and Jetson | That figure is the Jetson 2-camera pipeline, 1 person, about 35 s, white light. I46 forbids "validated at 1.8 BPM". Our warm bedside light conflicts with the white-light setup. Only IM wires phone rPPG into the game |
| Eyes "sim in browser", 60 Hz | aa uses MediaPipe Face Landmarker on the real webcam, sim only as fallback. IM VisionEyes emits at most 30 Hz |
| Presence, visitors "real" | Real as a team service on M only. Adapter cut (I41), daily presence in our data is synthetic, definitions disagree (outings 15 min vs our home-only 30 min) |
| Sleep from "IR presence at bed" | No IR bed sensor exists on any branch. "Hardware already delivers sleep" is wrong |
| Bedside light, dawn level "real" | The KY-016 is an indicator LED, no level or fade; I16 says no link. In aa it is hub-simulated or in-game |
| Posture 10 fps | Config target; the POC measures about 4 pose-fps on CPU |
| `MOOD_HEX` in `demo/js/main.js:190` | Exists only in ios-merge. In aa mood colours live in `measures.js:7`, `gui/shell.js:130`, `design/tokens.css`, `hub/afferent_hub/views.py:6` |
| Breath pacing 5 s / 5 s | Code is 4 s in, 6 s out (`BREATH_IN=4`, cycle 10 s) |
| Crisis "no game, as today" | Nothing blocks the game on the safety tier today |
| Week row "played or not" | Coloured by start mood, against I30 |
| Two lanterns rich side | Amber is always rich (X21), the side is randomised per session; the learned cue is colour. A salience offset toward amber cancels in within-person drift, which is what the composite uses |
| Hub overlap | Correct: aa `hub/` and `A:jetson/hub/` overlap on PHQ-9 storage, reports and LLM summaries. M merged afferent-app up to abc3e2d today, not Alex's hub |

## 5. Reply to the open questions (review section 9)

1. **Weekly measurement check, or drop two lanterns?** Neither the weekly check nor a blanket drop. Both tasks stay daily and pooled. Two lanterns gets an instruction line and the practice pair, then a playtest; if players still find it frustrating, we drop it (it is exploratory, weight 0.5). Alternating the two tasks by day is the Statistics owner's call after the pilot (X5, X16, mechanics-review L3). Clinic acceptability of any extra test burden: clinical partner.
2. **Is UNO Q HRV good enough for live RSA feedback?** Not today, and neither option in the question is possible yet. The firmware sends no RR intervals (only a median-of-8 bpm), and RMSSD has only been checked on synthetic signals. RMSSD before and after a slow-breathing segment is not a valid outcome anyway. Must answer: **Alex** (add RR intervals to 2A37 or a raw-IBI characteristic; side-by-side check against an ECG chest strap in a low-HRV person). Then a new Decisions row reversing I7, I40 and I12 (David).
3. **Can Jetson presence reach the phone before the morning session?** Not needed and not wanted for BA: suggestions come from the player's own menu, not passive data. Presence is cut for the demo (I41); when built, the reader is our hub, never the phone. Whether it runs on real phone MACs: **Vlad** (sensing-integration Q7).
4. **Which branch is the integration target; merge the hubs?** Partly answered: `junction/main` merged afferent-app (up to abc3e2d) today and has not taken Alex's `jetson/hub`. Our standing rule is one clinician view, ours (I48, K15), no bridge, because `jetson/hub` sends item 9 to the LLM and uses "screening" wording. The final merge is the team decision Q-T1: **the whole team**, with Alex for `jetson/hub`.
