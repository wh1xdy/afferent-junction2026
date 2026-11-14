# Afferent vitals UX: how the morning answers the body

Status: lead designer spec, 2026-11-14, for the build agents. It answers David: "let an agent work on a concept on how we can actually make user experience changes when vitals change", and the earlier asks: "game uniquely reacts to vitals", "the player must feel it, not just a hidden switch", role models for everything, good and fast, played every morning.

It merges two concept reports (moment to moment, across days), two reviews (clinical, player) and the live audit of the current build. Section 11 lists every conflict with an existing spec and which one wins. Priority for conflicts is the Decisions priority: patient safety and clinical credibility > feasible tonight > wow in the demo > completeness.

Inputs read: `GameDesign.md`, `Statistics.md`, `Decisions.md` (X1 to X36, D1 to D12, V1 to V13), `demo/js/engine.js`, `sensors.js`, `input.js`, `main.js` (presets), the engine in the `afferent-game-mg` worktree, and `design/coreloop.md`, `minigames.md`, `lookdev.md`, `engagement.md`, `mechanics-review.md`, `questions.md`, `rolemodels.md`. `design/gui.md` does not exist (only `gui-tokens.css` and `gui-tokens.json`). `design/concept/` holds image assets only. `demo/js/traverse.js` and `demo/js/fx.js` do not exist yet in either tree (coreloop M3 and lookdev 13.1 plan them). `fxgl.js`, `juice.js` and `skill.js` exist in the `afferent-game-mg` worktree, which is ahead of `main` and is where this work lands.

Source tags: [V] verified this session by me, [R] verified by a reviewer or concept agent this session, [K] prior knowledge, not re-checked. Full list in section 13.

---

## 0. Verdict in 6 lines

1. Today the body already changes the game, but the player cannot tell. The audit found that calm is invisible (sky dE < 3 in 14 s), the director flaps 15 times in 70 s near a threshold, a lost pulse freezes the last value, and the simulator silently takes over in real use.
2. Fix the signals first. Then commit mode changes only at natural breaks, as one short **Answer** across hand (haptics), room (bedside lamp), figure and world, at most 4 per session. One guaranteed **Opening Answer** every morning at the launch, so even a calm, healthy morning shows the player that the island read them.
3. Only good news gets a signature. "Pulse low", "eyes heavy" and "you settled" each get a learnable sting. "Pulse high" gets none: calm arrives as a slow drift, and its felt moment is the settle ("the island exhales"), which also comes on a time floor, so it never has to be earned.
4. Gifts stay. What an Answer gave (slow snow, a lit sauna window, lit crest lanterns, a brighter room) holds for the session. Nothing regresses, nothing judges, the morning room never dims.
5. Measurement is sacred: the core, Fork, Two lanterns and the standard hill before each use one fixed presentation, a fixed room level and no mode haptics. Answers queue to the exit.
6. For the demo, a presenter fires named presets ("Racing heart", "Settling down", "Low and slow", "Groggy eyes") from a phone drawer, the keyboard or the laptop, with a labelled presenter timing that lands every Answer within 10 s.

---

## 1. Principles (5 lines, with role models)

1. **The world answers; the body is never shown.** No number, meter, trace or heartbeat in play. The state lives in the world the way Journey keeps the flight meter on the scarf, with no HUD [V]. Implicit adaptation alone is not felt (Kuikkaniemi et al. CHI 2010: implicit biofeedback had no significant effect on player experience, explicit raised immersion [V]), so the answer must be legible, just diegetic.
2. **Change at breaks, as one felt moment.** The Left 4 Dead AI Director paces build up, peak and relax and acts between encounters, not mid-fight (Booth 2009, "Generate Dramatic Game Pacing" [V]; phase names via Valve's director wiki [V, search result]). Tetris Effect answers the player in music and visuals together, which is what makes it feel alive (Mizuguchi, PC Gamer [V]).
3. **Lead, never mirror; only good news gets a signature.** Nevermind punishes arousal (more stress, more water in the room [V]): the anti-model. False feedback of a heart rate rise raised anxiety in panic patients who believed it (Ehlers et al. 1988 [V]), so nothing may become a learned "your heart is up" cue.
4. **Ratchet with a time floor; gifts stay.** HeartMath style positive-only feedback [K] and Sky's "your light never shrinks" (lookdev 3.2.4). Trying to relax can raise tension (Heide and Borkovec 1983 [R]), so calm effects arrive on time even if the pulse never falls.
5. **Uncertainty means quiet; measurement means still.** Adaptation scales with signal confidence and stays pleasant when wrong (Fairclough 2009 [R]). Compare only with the person's own range (Apple Vitals [R]). Nothing body-driven moves during the fixed core or the two measurement tasks.

---

## 2. The signal layer

All conditioning lives in `engine.js` (director owner) except the capture-side fixes in `sensors.js` and `input.js`. Two timing sets exist: **real** (default, always in real use) and **presenter** (only with `dev=1` or a demo profile, labelled SIMULATED, logged `adaptive.timing: "presenter"`). Presenter values are in brackets.

### 2.1 Per signal

| Signal | Source | Gate (quality) | Smoothing | Confidence | Missing | Simulated |
|---|---|---|---|---|---|---|
| Pulse | Bedside KY-039 at 1 Hz (claimed source); rPPG later | 40 to 150 bpm, and within 25 bpm of the median of the last 5 accepted samples (spike guard). Quality >= 0.3 to enter | Rolling median 10 s [3 s] (removes the breathing swing), then EMA tau 4 s [1.5 s] | `c_p = clamp((quality - 0.3) / 0.4, 0, 1) x fresh`, `fresh` 1 under 3 s old, linear to 0 at 8 s | `c_p < 0.2` for 3 s: `a` decays to 0 with tau 8 s; arousal modes ease to flow at the next break, Drift only, no Answer. Logged `pulse_source: null`, `helped: null` | Real use: `Sensors.pulse()` never falls through to the simulator; `A.config.simulator` defaults to false outside demo builds (fixes audit C). Demo: simulator feeds the director, SIMULATED badge, record `simulated: true` |
| Arousal `a` | `(pulse_s - baseline_src) / 10` | needs `c_p >= 0.5` to drive an Answer; 0.2 to 0.5 Drift only | as above | `c_p` | as above | as above |
| Baseline | Per source (KY-039 and rPPG differ by about 5 bpm, X31). Median of the first 7 valid core rest pulses, then 14-day rolling (V7) | Core rest only, never play data | - | - | Default 68 until 7 sessions; Answers from pulse capped at k 0.6 until then | Simulated sessions never enter the baseline |
| Eye closure | ARKit blink values, MediaPipe fallback | Only tracked frames enter PERCLOS. Untracked frames are skipped, never counted as open (fixes audit E). Frames with head pitch more than 15 deg below rest pitch count at weight 0.5 | `f_fast` = 20 s [8 s] window, EMA 2 s [1 s]. `f_slow` = 40 s [16 s] window | `c_e` = tracked share of the last 20 s | `c_e < 0.5`: `f` holds; after 15 s untracked it decays with tau 30 s. Eyes are unknown, never "open" | Simulator `face()` as today; badge |
| Fatigue `f` | `2 x PERCLOS + 0.12 x long closures` (GameDesign 4.2, unchanged) | needs `c_e >= 0.5` | as above | `c_e` | as above | as above |
| Head pitch | ARKit, MediaPipe matrix | tracked only | median 3 s | `c_e` | ignored | - |
| Ambient light | ARKit ambient or the bedside sensor only. MediaPipe video luma is logged as `ambient_source: "video_luma"` and never used for decisions (auto exposure makes it meaningless) | - | median 5 s | - | default "dim" | - |
| Time since waking | Bedside presence: minutes since leaving the sleep state | - | - | - | unknown = treat as 5 to 15 min | - |
| Habitual wake window `W` | Onboarding wake time, else 14-day median bed exit | - | - | - | unknown = no gate (demo) | - |
| Mood check-in | Core | - | - | - | - | Never an input to anything in play (firewall, mechanics-review M5) |
| Day trends | Hub (`config.day_layer`, section 6) | valid sessions only | hub side | - | offline = 0 | demo preset only |

### 2.2 Mode bands (Schmitt), dwell and commit

| Mode | Enter | Exit | Dwell before a candidate is ready | Notes |
|---|---|---|---|---|
| fatigue (morning, day) | `f_fast >= 0.45` AND `f_slow >= 0.30` | `f_fast <= 0.25` for 8 s [3 s], OR eyes open 12 s in a row [5 s] (fixes audit F: today 23 s or never) | 5 s [2 s] | Priority over arousal modes |
| rest (night) | as fatigue, night clock | unchanged (X35) | 5 s | Night fallback unchanged |
| calm | `a >= 0.8` | `a <= 0.5` | 6 s [2 s] | Entry is Drift only (section 3.3) |
| wake | `a <= -0.35` | `a >= -0.10` | 6 s [2 s] | k capped at 0.6 in the first 5 min after waking (sleep inertia, Hilditch and McHill 2019 [R]) |
| flow | otherwise | - | 8 s [3 s] to return | Never an Answer, except the Opening |

Commit rules (replace the 3 s hysteresis of GameDesign 4.3 and V5):
- A ready candidate commits at the **next break**: the next hill generation (Ride), the start of a walk (today's loop), a task exit slide, or an approach start while the station prop is at least 2 s away.
- Never mid-task, never in the core, never in Fork, Two lanterns or the standard hill before them, never in the 3 s before a measurement panel opens.
- Presenter timing only: an adaptive task (never a measurement task) also counts as a break, so a preset lands within 10 s even while the task panel is up. The task's own haptics are muted for 1 s around the signature. Logged.
- Minimum time in a committed mode: 15 s [5 s]. Fatigue may override after 8 s [3 s].
- **Lean while pending:** from the moment a candidate exists, style blends 30% toward it at Drift speed. Invisible on purpose; it stops the Answer from reading as a hard cut.
- Task mode stays fixed while a task runs (V5). Intensity `k` = mode formula x confidence (`c_p` or `c_e`).

Expected results (audit harness): edge run +8 bpm with a 2.5 bpm sine gives at most 1 commit in 70 s (today 15); pulse lost at `a = 2.2` gives `a < 0.5` within 12 s and zero Answers.

---

## 3. Moment-to-moment mapping (one session)

### 3.1 Two speeds

- **Drift:** continuous and below notice. Hill period change at most 3% per hill (Van Dyck et al. 2015: small tempo shifts go unnoticed yet still entrain cadence [V]; later papers put the window near 2.5% [V, secondary]). Frame luminance change at most 0.02 per 100 ms (lookdev 3.7). Never claimed as a felt reaction.
- **Answer:** a deliberate 2.2 s event across at least 4 channels, only at a break. Felt tempo jumps are at least 10%.

### 3.2 The Answer skeleton (same order every time, so it is learnable, like the L4D cues)

| t (s) | Channel | What happens |
|---|---|---|
| 0.0 | Figure | Reacts first (cause on the figure, coreloop 3) |
| 0.3 | Hand | Haptic signature (`A.J.hap.seq`, at most 5 events). Nothing else buzzes from 1 s before to 1 s after it |
| 0.3 to 1.5 | World | One sweep outward from the lantern (Gris style single-source grade change, lookdev 3.2) |
| 0.5 | Room | Bedside lamp starts its fade (2 to 4 s, at least 1.5 s for any step, never down in the morning) |
| 1.0 | Terrain | The next hill visibly takes the new shape (the far ridge morph of mechanics-review S1 happens only here) |
| 2.2 | Landmark | Optional: a persistent landmark lights (a gift that stays) |

Budget: the Opening Answer plus at most 3 more per session, at least 20 s [8 s] apart. Further transitions are Drift only (2000 ms grade blend). Reduced motion: world parts become crossfades (minigames 2.7); hand and room carry the Answer. No camera shake ever; zoom deltas 0.02 to 0.04, never below 1.00.

### 3.3 Mapping table

| # | Body change | Trigger and timing | Answer or Drift | Hand | Room (bedside) | Figure and world | Terrain and tempo | Role model | Player notices |
|---|---|---|---|---|---|---|---|---|---|
| O | **Opening** (every morning) | At the launch after Bite, mode = first classification at core end | Answer (counts toward the budget). If the first mode is wake or fatigue, that mode's Answer plays instead | `medium` at the lighthouse ignition | Launch step +4 points over 1.5 s (S3 ladder), tint of the first mode | Figure turns to the slope; lighthouse ignites (exists); aurora opens one ribbon (flow and calm variant, the mechanics-review S2 flow front) | First hill in the first mode; then the **standard hill** before Fork | L4D sting; Journey's start | "The island woke with me" |
| 1 | Pulse up, entering calm | `a >= 0.8`, `c_p >= 0.5`, dwell 6 s | **Drift only, no signature** (clinical C1) | none | Tint warms to `#FFC98A`, level unchanged | Warm grade blend 2000 ms; fog only beyond the mid layer (near world stays clear); snow slows x0.8 | Next hill is the calm swell (6.0 s, then the coreloop ramp to 10 s) | Kentucky Route Zero warm pool (lookdev 3.2.2) | The ride gets long and soft; nothing calls attention |
| 2 | **Settle** in calm: "the island exhales" | `s = max(s_pulse, s_time) >= 0.5`, where `s_pulse = clamp((a_entry - a) / max(0.3, a_entry - 0.3), 0, 1)` (ratchet, up only) and `s_time` reaches 0.5 at 25 s and 0.8 at 40 s in calm. Also fires when calm exits because `a <= 0.5` with `c_p >= 0.5` | Answer | `seq`: `medium` 0, `tick` 300, 700, 1300 ms (decelerating, Apple Breathe's fading taps [R]) | Tint to deep amber (lantern-amber-deep token), level unchanged, 4 s | Visible vapour puff, shoulders drop 0.7 u, **lantern stays up** (player review). Snow fall speed x0.5 over 1.5 s (snow dense and foreground in calm so it reads on a dim screen). Lantern pool +25% over 1.2 s. At t 2.2 the sauna window on the far shore lights | Swells keep lengthening (coreloop calm ramp) | HeartMath positive-only [K]; Mightier's visible link without its red zone [R] | "The snow almost hangs. I did that, or it came anyway" |
| 3 | Pulse low, entering wake: "the sky clears" | `a <= -0.35`, `c_p >= 0.5`, dwell 6 s. No Answer and no light step before `W - 15 min` | Answer | `seq` ladder: `light` 0, `light` 120, `medium` 260 ms | Tint cool white `#DDEBFF`, level + 4 points over 2 s (ladder) | Figure stands tall, lantern overhead 500 ms, scarf whips. Wind gust blows snow sideways; stars **sharpen** (crisper, not more: more stars read as "back to night", player review); fog peels from the lantern; one lighthouse beam pass (flash guarded) | Next hill taller, mote arc (coreloop wake 3.2 s at k 0) | Alto's Odyssey clear cold night; mechanics-review S2 wake front | "It got crisp and fast" |
| 4 | Clear in wake | `r = max(r_pulse, r_time) >= 0.7`, `r_pulse = clamp((a - a_entry) / (0 - a_entry), 0, 1)`, `r_time` reaches 0.7 at 30 s | Landmark only (no extra Answer) | `light` once | none | One more lighthouse ladder rung lights and stays | Drift at most 3% per hill | Van Dyck covert tempo [V] | A landmark, not a curve |
| 5 | Eyes heavy, entering fatigue: "the world leans in" | `f_fast >= 0.45` AND `f_slow >= 0.30`, `c_e >= 0.5`, dwell 5 s. Not before `W - 15 min`, not at night | Answer | Count-in: `tick`, `tick`, `light` on the crest beat (3 events, the cap for any rhythmic train) | Daylight `#F4F7FF` to `min(40, M_cap, bipolar_cap)` % over 3 s; within 5 min of waking at most 30%. **Frozen** for the rest of the mode stretch (no escalation loop: brighter light, squint, more light) | Figure turns toward the next crest, lantern forward. Horizon lift gradient strongest at the horizon (lookdev fatigue `liftC`, not flat haze); crest lanterns ahead light one by one; daylight +0.1 | Beat-locked crest lights, 84 + 12k bpm (coreloop fatigue) | Philips Wake-up Light sunrise [R]; Sky's morning lift | The light reaches closed eyes and the hand; the most attributable reaction |
| 6 | Eyes open again, leaving fatigue | Fast exit (2.2) | Drift only | none | Level holds (morning room never dims) | Daylight holds; crest lanterns stay lit | Next hill flow | Philips: morning light only rises | The world stays bright |
| 7 | Single long closure | - | **Nothing** (cut: a per-closure response is a surveillance check, clinical C4) | none | none | none | none | Alarmy "wake up check" is the anti-model | Nothing, by design |
| 8 | Head pitch sinks | > 10 deg below rest for 8 s | Nothing visible; +0.1 weak evidence to `f` | - | - | - | - | - | Never prompted (protects upright time) |
| 9 | Dark room (ambient < 0.15) | ARKit or bedside sensor only | - | - | Lamp leads | Flash guard `dark_room` caps (peak +25%), exposure cap 0.9 | - | minigames 2.5 | No glare |
| 10 | Bright room (> 0.6) | same | - | - | - | Daylight base +0.1, bloom -0.1 | - | Night Shift style slow shift [K] | World matches the room |
| 11 | Pulse lost or low quality | `c_p < 0.2` for 3 s | No Answer; arousal modes ease to flow over about 20 s. **Gifts stay** | none | unchanged | Gifts from earlier Answers stay (player review) | next break flow | - | Nothing, correctly |
| 12 | Face lost | `c_e < 0.5` | Fatigue holds 15 s, then eases out | - | unchanged | - | - | - | Nothing |
| 13 | Minutes since waking < 5 | bedside presence | Wake k cap 0.6, fatigue light cap 30% | - | - | Session starts deeper in pre-dawn | - | Sleep inertia [R] | The morning feels like their own waking |
| 14 | Before `W - 15 min` (early waking) | `W` | Wake and fatigue Answers play without light steps and without the wake haptic; light behaves like rest | - | no step | - | - | Clinical C5 (early-morning awakening) | Nothing pushes them awake |
| 15 | Touch (contrast) | every input | Juice within 300 ms (coreloop 4.5) | per coreloop | - | - | - | Nacke et al. 2011 direct vs indirect [R] | The finger is the direct channel; the body is the indirect one |

Haptic caps (minigames 2.6) hold everywhere. No isochronous haptic train in the heartbeat range (0.8 to 2 Hz) longer than 3 events anywhere in play. That removes the calm `tick` train at 1 Hz while pressing (coreloop 4.5 and 5): calm gets one `tick` at press start and one at the top of each swell. With the Heartline (mechanics-review S1) active, mote pickups give at most one haptic per hill.

The lantern breathes at 6 per minute all session (A.pace) and is never a heart display. Rejected for good: mirroring the live pulse (V15, Nevermind loop), a fake slow heartbeat presented as the player's (EmotionCheck works only through deception, Costa et al. [R]).

---

## 4. Across days (day level, from the hub)

Rules: nothing from day trends acts before Fork ends; the quote, reminder, streak, village, milestones, seasons and the pre-core sunrise never adapt to trends; mood and RT never feed a visible layer.

| # | Signal (valid sessions only) | Threshold, ramp | What changes | Where | Role model | Visible? | Priority |
|---|---|---|---|---|---|---|---|
| D1 | Grogginess `G` = share of morning play seconds in fatigue (tracked, not simulated, not within 3 min of waking), EWMA 0.4, needs 3 of 7 days; short night `N` (bed presence minus 14-day median <= -1.5 h); patient toggle `T` "Gentler mornings (7 days)" | `K_pattern = clamp(max(fG(G), 0.3 [N], 0.6 T), 0, 0.8)`, first step to 0.35, then +0.15 / -0.10 per session (Hades God Mode: a palpable first step, then small steps [R]) | Play budget `PLAY_S` 76 minus 15 K (floor 64); measurement slots always run | engine plan | Oura goal adjusts with Readiness [R] | Felt as "a quick one" | later |
| D2 | `K_pattern` | same | Warm-up and `D_day = -0.06 K` on every axis, credit weight `w` 0.5 | `skill.js` | Celeste Assist, quiet [R] | No | later |
| D3 | `K_pattern >= 0.35` two sessions in a row, **or** a seeded 1 in 5 of all mornings (so the marker is not a bad-week badge, clinical) | per session | **Lit cairns:** 3 small cairn lanterns already burn on the exit slope from the Fork saddle, plus the KIND grade blend over 4 s and a warm lamp glow +4 x K points (cap 20% before dawn), one combined beat | traverse.js, world.js, fx | Death Stranding traces [K]; Animal Crossing overnight change [K] | Yes: "someone lit the way" | should (demo-forced), later (real `K`) |
| D4 | Wake and calm shares | - | Start prior | - | - | - | **cut** (it removes the Opening Answer) |
| D5 | Good weeks | - | New content follows the fixed `day_index` schedule (mechanics-review S14); a groggy week may delay a release by at most 2 days | engine plan | Brain Age schedule [K] | - | later |
| D6 | Clinical state (CUSUM, composite) | - | `K_quiet` | - | - | - | **cut for the pilot** (feeds back into the composite, no plausible benefit below perception, trust risk if discovered; the clinician answers CUSUM, not the game) |
| D7 | Neutral mornings | seeded 1 in 5 eligible days, `K = 0`, logged `neutral_day: true` | Evaluation of the day layer (micro-randomised, Klasnja 2015 [K]) | hub, engine | - | No | later, clinical sign-off |

---

## 5. Measurement safeguards (what never changes during core measurements)

| # | Rule | Applies to | Why |
|---|---|---|---|
| M1 | One fixed presentation, not "frozen at task open": fixed panel scrim, the world behind dimmed to a fixed level, fixed stimulus luminance, size and colour | Core (rest, check-in, Bite), Fork, Two lanterns | Mode-dependent context would vary effort choice and reward bias across days (X5, X20, X21) |
| M2 | RT flare at one fixed luminance in every room; ambient logged as a covariate | Bite | RT falls with stimulus intensity (Piéron's law, Pins and Bonnet 1996 [R]) |
| M3 | Stable window: no Answer, lamp step, sweep or haptic in the 3 s before a measurement panel opens or during it; queued to the exit slide | Fork, Two lanterns | Light adaptation and orienting |
| M4 | Standard hill (mechanics-review S1) is the last hill before Fork and before Two lanterns: no Heartline, no mode shape, no powers | Ride | Same context every morning |
| M5 | Bedside lamp holds at core level `C` from Begin to the end of Bite, and holds still through Fork and Two lanterns; colour-return steps are deterministic: exactly 2 steps before Two lanterns, one per task end (completed or timed out) | Lamp | Constant, not a covariate |
| M6 | No haptics or sounds in the core except the fixed ones; no haptic at a stimulus onset | Core | Redundant-signal effect on RT [K] |
| M7 | Pulse windows exclude 5 s after any Answer, lamp step of 4 points or more, or haptic signature (`post_event_s`) | `helped`, `pulse_start`, time to target | Cardiac orienting response (Graham and Clifton 1966 [R]) |
| M8 | `helped` is null when `c_p < 0.5`; shown to the clinician as "within-session pulse change", never to the patient as an effect | Bandit | Selection and regression to the mean |
| M9 | Upright time computed only over Fork, Two lanterns and the standard hills | Composite feature | Adaptive task mix and length change it (Statistics owner) |
| M10 | The bedside morning pulse reading must be before Begin or 15 min after the session ends (`t_rel_session_s`) | Composite feature (0.75) | A calm Answer and 6/min breathing would contaminate it |
| M11 | The director baseline never updates from play data; a clinician `baseline_reset` event (medication change, booster course) restarts the 7-session window | Director | TCA and SNRI start raises heart rate (NESDA, search summaries [R]) |
| M12 | The pre-wake light profile is fixed per patient from day 0 (S3: 10 min ramp to 12%), versioned `wake_light_profile_v`; never trend-driven | Lamp | It is a stimulus before RT and morning pulse |
| M13 | Mood never drives play or meta output | All | Firewall (engagement section 1, mechanics-review M5) |

---

## 6. The three signature vitals moments (demo video)

All three run in presenter timing with the SIMULATED badge visible. Since the app shows no numbers, the video shows the simulated pulse and eye trace in an overlay **outside** the phone frame (the dev panel on the laptop, or edit graphics). The phone and the real bedside lamp share one frame. t = seconds after the preset press.

### 6.1 "The world leans in" (groggy eyes, preset 4)

| t | Beat |
|---|---|
| 0.0 | Presenter presses "Groggy eyes" (or the actor lets their eyes droop with the real camera). Overlay: eye trace starts closing more often |
| 0 to 3 | Nothing in the world. Honest: confidence is building |
| ~3 | Lean: the horizon starts to warm (30%, subtle) |
| ~5 to 6 | Commit at the next break. **Answer t 0.0:** figure turns to the next crest, lantern forward |
| +0.3 | Hand: `tick`, `tick`, `light`. World: the horizon lift sweeps out from the lantern; crest lanterns ahead light one by one |
| +0.5 | The real lamp starts rising to daylight `#F4F7FF`, 3 s fade |
| +1.0 | Next hill: beat-locked crest with the approach ring |
| ~9.5 | The room is visibly bright. The player rides a beat kick; daylight +0.04 |
| ~20 | Presenter presses "Eyes open" (5). About 5 s later fatigue exits by Drift; the light and the lit crests stay |

### 6.2 "The island exhales" (racing heart, then settling, presets 1 and 2)

| t | Beat |
|---|---|
| 0.0 | "Racing heart" (1). Overlay: pulse +22 |
| ~2 | Lean: warm grade begins |
| ~4 to 5 | Calm commits by Drift: no sting. The next hill is a long swell (4 s to 6 s), snow slows a little, the lamp tint warms, level unchanged |
| ~12 | "Settling down" (2), t' = 0. Overlay: pulse eases toward baseline over 4 s |
| t' ~4 to 6 | **Answer:** vapour puff, shoulders drop, lantern held up |
| +0.3 | Hand: `medium`, then `tick` at 300, 700, 1300 ms (an exhale you feel) |
| +0.3 to 1.8 | Snow slows to almost hanging (x0.5); lantern pool grows 25% |
| +0.5 | The lamp shifts to deep amber over 4 s, same level |
| +2.2 | The sauna window on the far shore lights and stays lit for the session |
| after | Calm eases to flow by Drift; the slow snow and the lit window stay |

Without preset 2, the same Answer arrives on the time floor about 25 s into calm. Say so in the voice-over: "it settles with you, or for you".

### 6.3 "The sky clears" (low pulse, preset 3)

| t | Beat |
|---|---|
| 0.0 | "Low and slow" (3). Overlay: pulse -9 |
| ~2 | Lean: fog begins to thin |
| ~5 to 6 | **Answer:** figure stands tall, lantern overhead, scarf whips |
| +0.3 | Hand: rising ladder `light`, `light`, `medium` |
| +0.3 to 1.5 | Wind blows snow sideways; stars sharpen; fog peels from the lantern; one lighthouse beam sweeps across |
| +0.5 | Lamp tint to cool white, +4 points over 2 s |
| +1.0 | Next hill taller, a mote arc at apex height; hills come at 3.2 s |
| ~15 to 30 | One more lighthouse rung lights (the "clear" landmark) |

Across-days alternate (only if D3 is built): a cut from "Day 3, heavy eyes" to "Day 4": on the exit slope from the Fork saddle three cairn lanterns already burn and the room is warmer. Preset 8 forces it.

---

## 7. Demo presets (dev panel) and how a presenter triggers them

Pressing any preset switches the session to presenter timing, turns off the autoplay story (`engine.js` `story()`, audit H) and logs `presenter_preset` with the name. Presets drive `A.Sim` (honest simulated physics), never the director state directly.

| Key | Name | Sets | First visible | Answer by | What shows |
|---|---|---|---|---|---|
| 1 | Racing heart | `Sim.offset` +22, hold 30 s | ~2 s lean | none by design (Drift ~5 s) | Calm: long swells, warm tint |
| 2 | Settling down | `Sim.offset` eases to +3 over 4 s | at once | ~4 to 6 s | The exhale (6.2) |
| 3 | Low and slow | `Sim.offset` -9, hold 30 s | ~2 s | ~5 to 6 s | The sky clears (6.3) |
| 4 | Groggy eyes | `Sim.drowsy` 0.85 | ~3 s | ~6 to 8 s | The world leans in (6.1) |
| 5 | Eyes open | `Sim.drowsy` 0, `eyesShut` false | - | Drift exit ~5 s | Light and crests stay |
| 6 | Sensor lost | pulse null, face untracked | nothing (correct) | none | Dev panel only: confidence bars fall, `a` decays; the world keeps its gifts |
| 7 | Noisy sensor | rPPG quality 0.35, 15% outliers of 30 to 45 bpm | nothing | none | Dev panel: `c_p` under 0.5, no Answer |
| 8 | Groggy week | day-layer hint `K_pattern` 0.6 (D3) | next Fork exit, or within 4 s if Fork is already past | - | Lit cairns (should) |
| 0 | Reset | offset 0, drowsy 0, presenter timing stays | - | - | - |

Triggers:
- **Phone:** with `dev=1`, a presenter drawer slides up from the bottom edge (two-finger swipe up) with big buttons 1 to 8 and 0, usable at phone width (today's `#panel` is `display: none` under 760 px, audit I). It hides itself after 3 s.
- **Keyboard (desktop or a paired keyboard):** keys 1 to 8 and 0, only with `dev=1`.
- **Laptop remote:** the hub relays `{type: "sim_preset", name}` on `/ws/app` from a small presenter strip on the clinic page (`/clinic?presenter=1`); the app answers through `Hub.on('sim_preset')`. So the presenter films the phone and lamp while pressing on the laptop.
- Presenter rule of thumb: press during a ride or the summit ride; a press during Fork or Two lanterns queues to their exit by design.

---

## 8. What the patient sees, and what the clinician export shows

### 8.1 Patient

| Place | Content | Priority |
|---|---|---|
| Onboarding and Info ("How it works") | "Afferent adapts each morning to your pulse and to signs of tiredness. The island never shows your heart." | must |
| In play | Nothing about the body: no numbers, bars, words or icons. The SIMULATED badge stays in demo builds | must |
| End screen | A wordless **path strip** of today's ride with one small glyph where each Answer happened: ribbon (Opening), hanging snowflake (settle), beam (sky clears), sun band (world leans in). No glyph exists for calm entry ("pulse high"). Today only, no history, no numbers, inside the existing end screen (no extra seconds, engagement R12) | should |
| Patient view | Nothing from the director or the day layer tonight. Later: a pull-only "How the island adapts" page with the line above, the "Gentler mornings (7 days)" toggle (Oura Rest Mode pattern [R]) and at most one weekly line about what the island did, never about the body ("The island started slower and warmer on some mornings this week"), default hidden | later |
| Never | "your heart", "heartbeat", "tap your own heart awake", "you settled your pulse", "heavy-eyed", "short nights", "stress", "anxious", "detected", "fatigue", "easy", "assist", trends, z-scores, CUSUM, `helped` | - |

### 8.2 Clinician (hub session detail and `export.py`)

- New session fields (`SessionSchema.md`, schema allows extra properties): `adaptive.director_v: 2`, `adaptive.timing` (`real` or `presenter`), `adaptive.answers[]` = `{t_ms, kind (opening, settle, clear_sky, lean_in), mode, trigger (pulse, eyes, time_floor, opening), a, f, c_p, c_e, light_before, light_after, haptic}`, `adaptive.signal` = `{pulse_conf_mean, pulse_ok_share, frozen_s, simulated_share, eyes_tracked_share}`, `adaptive.landmarks[]`, `post_event_s` per task, `room_light_core`, `room_light` per measurement task, `presenter_preset[]`, and later `day_layer`.
- Session detail page: a "Director timeline" strip (smoothed pulse with a confidence band, PERCLOS, mode bands, Answer markers, room light level), labelled "exploratory, within-session".
- `export.py`: an `answers.csv` (one row per Answer) beside `sessions.ndjson`, `daily.csv`, `features.csv`, with column docs.
- "What helps" stays as is, relabelled "within-session pulse change" with its uncertainty (M8). The bandit never sees presenter or simulated sessions.

---

## 9. Claims wording

| Element | Approved | Never |
|---|---|---|
| Director | "the game adapts to your pulse and to signs of tiredness" (GameDesign 11) | "reads your emotions", "detects stress", "measures anxiety" |
| Heart | "the island never shows your heart" | "your heartbeat drives the hills", "tap your own heart awake" |
| Settle | "it slows down with you" | "you lowered your pulse", "calms anxiety" |
| Eyes | "notices when your eyes keep closing, like a car's drowsiness alert" | "detects fatigue", "measures alertness" |
| Room light | "morning light at the bedside" | "light therapy" |
| Pitch | "the morning answers you: in your hand, your room and the island" | "biofeedback therapy", "HRV", "diagnoses", "detects relapse", "treats depression", "clinically validated" |
| Clinician | "within-session pulse change, exploratory" | "what calms Anna" as an effect |

---

## 10. Build list (file level, owners, priorities)

Lands in `../afferent-game-mg` (branch `minigames`), where `engine.js` already routes `haptic(name)` to `A.J.hap` and `juice.js` has `hap.seq`. Owners follow coreloop 12 and lookdev 13.1.

### 10.1 Tonight, must

| # | File (owner) | Change |
|---|---|---|
| 1 | `sensors.js` | `pulse(now)` returns `{bpm, quality, source, at, conf}`; spike guard; no simulator fallback unless `A.config.simulator` and a demo build; per-source tag; MediaPipe luma flagged `ambient_source: "video_luma"` |
| 2 | `main.js` line 23 | `simulator` default false outside demo builds (`dev=1`, demo profile, `?demo=1`) |
| 3 | `input.js` (kit builder) | Skip untracked frames in `Eyes.feed`; `Eyes.trackedShare()`; pitch weight; `f_fast` and `f_slow` windows |
| 4 | `engine.js` `director()`, `classify()` (engine owner) | `TIMING.real` and `TIMING.presenter`; median plus EMA; `c_p` decay; Schmitt bands; dwell; candidate and lean; commit at breaks (`onBreak` from `planWalk`, task exit, and later traverse hill generation); minimum dwell; Answer budget; fast fatigue exit; `W - 15 min` and minutes-since-waking gates; `k x confidence`; settle and clear ratchets with time floors; `V.gifts` that persist |
| 5 | `engine.js` `setMode()`, `modeLight()`, `light()` | Emit `answer` on the bus only when allowed; morning ladder: level `max(previous, ladder)`, mode sets tint; fatigue step to `min(40, M_cap, bipolar_cap)` then frozen; core hold at `C`; night unchanged |
| 6 | `moments.js` (new, `A.Answer`, owner of engine.js) | Choreographs the skeleton (3.2) per kind from one `answer` event: figure, haptic with a 1 s quiet window, sweep, lamp, next-hill flag, landmark; reduced-motion variant; Opening at the launch |
| 7 | `juice.js` | Named signatures `exhale`, `ladder3`, `countin` in `hap.seq`; global quiet-window lock |
| 8 | `world.js` | Snow speed from `V.settle`, wind gust and star sharpness from `V.clear`, one beam pass, crest lanterns lit one by one, aurora ribbon for the Opening |
| 9 | `fxgl.js` (today) or `fx.js` (lookdev) | Lean blend 30%; Answer sweep from the lantern; fatigue horizon gradient instead of flat haze; fixed measurement scrim preset (M1) |
| 10 | `engine.js` measurement guard | `this.frozen` during core, Fork, Two lanterns, standard hill and 3 s before a panel; queue Answers to exit; deterministic lamp steps (M5); `post_event_s` |
| 11 | `main.js` presets | Presets 1 to 8 and 0, presenter drawer at phone width, keys, story off on first preset |
| 12 | `record.js`, `SessionSchema.md` | Fields of 8.2 |

### 10.2 Tonight, should

| # | File | Change |
|---|---|---|
| 13 | `world.js` | Sauna window landmark, lighthouse rung landmark, dense foreground snow in calm |
| 14 | `main.js` end screen | Path strip of today's Answers |
| 15 | hub `views.py`, `/ws/app` | `sim_preset` relay and presenter strip on `/clinic?presenter=1` |
| 16 | hub session detail, `export.py` | Director timeline strip, `answers.csv`, "within-session pulse change" label |
| 17 | `traverse.js` (when M3 lands) | `onBreak` at hill generation; next hill from the committed mode; standard hill; calm ticks per breath phase; no per-closure crest call; at most one mote haptic per hill under the Heartline |
| 18 | `world.js`, `traverse.js` | Lit cairns D3, demo-forced by preset 8 |
| 19 | Audit harness (`scratchpad/pw/audit/run.js`) | Acceptance tests 12 |
| 20 | Settings | "Shared bedroom" cap `M` 25%; clinician `light_cap_bipolar` (default 25%, no blue-enriched step) in `config` |

### 10.3 Later

- Day layer: hub `day_layer` in `config_message`, `daylayer.js` (`A.Day`), `K_pattern` (D1, D2), neutral mornings (D7), task-mix tilt with logged covariate.
- Patient view "How the island adapts" and the "Gentler mornings" toggle.
- `baseline_reset` clinician event (M11); per-source baselines.
- Statistics owner: upright time over fixed segments (M9), morning pulse timing (M10), `post_event_s` exclusion (M7).
- rPPG as a pulse source with its own baseline.
- Sound for the Answers when X28 reopens.

---

## 11. Conflicts with existing specs, resolved

| # | Existing spec | This file decides | Who edits |
|---|---|---|---|
| C1 | GameDesign 4.3, Decisions V5: thresholds without bands, 3 s hysteresis, switch any time | Schmitt bands, dwell, commit at breaks, minimum 15 s per mode, Answer budget | orchestrator (Decisions row), GameDesign owner |
| C2 | GameDesign 4.4 and `engine.js` `modeLight()`: per-mode lamp levels (the room dims from wake to calm) | Morning ladder from mechanics-review S3: monotonic level, mode sets tint; only the fatigue Answer may raise the level, then freezes | engine owner |
| C3 | GameDesign 4.1 and 10 "without pulse, fatigue only, otherwise flow" vs code freezing `a` | Spec stands; code fixed by confidence decay | engine owner |
| C4 | `main.js` simulator on by default | Off outside demo builds (X24 still holds in demo) | main.js owner |
| C5 | Concept 1: Answer on entering calm | Calm entry is Drift only; the felt moment is the settle (clinical C1) | - |
| C6 | Concept 1 rows 6 and 7, player review (+8 points per closure), coreloop 5 ("eyes closed 1.5 s: the next crest calls brighter") | Cut: no response to single closures | coreloop owner |
| C7 | mechanics-review S2 frost from eye closures, and its thaw lamp step | Cut as body feedback. Weather fronts stay as the world part of the wake, fatigue and Opening Answers; no front on calm entry | mechanics-review owner, orchestrator |
| C8 | mechanics-review S1 Heartline: mote `tick` per lead beat, "you tap your own heart awake" | Hill tempo lead stays; at most one mote haptic per hill; the wording is struck. Beacon may still inherit `b` (C14 there), since its taps are the player's | coreloop and minigames owners |
| C9 | coreloop 4.5 and 5: calm `tick` train at 1 Hz while pressing | One `tick` at press start and one at the swell top | coreloop owner |
| C10 | Concept 1 wake "stars ignite from the horizon" | Stars sharpen, wind, one beam pass (player review, mechanics-review S2 wake front) | - |
| C11 | Concept 1 calm figure lowers the lantern | Lantern stays up | - |
| C12 | Concept 1 pre-dawn 30 min to 30% vs mechanics-review S3 10 min to 12% | S3, fixed per patient from day 0, versioned (M12) | orchestrator |
| C13 | Concept 1 fatigue lamp 40% vs "Shared bedroom" 25% and the bipolar cap | `min(40, M_cap, bipolar_cap)`; within 5 min of waking 30% | - |
| C14 | Concept 1 R7 "frozen at task open values" | Fixed presentation every session (M1) | - |
| C15 | lookdev 3.2.4 KIND and minigames 0.6 assist triggered by `mood_start` | Triggered by `f` and pulse quality only (already mechanics-review M5) | lookdev and minigames owners |
| C16 | Concept 1 row 16 (day trends set the start level and biome) and concept 2 start prior | Cut; nothing from day trends before Fork ends | - |
| C17 | Concept 2 `K_quiet` (player review: keep as backend) | Cut for the pilot (clinical review wins on safety) | orchestrator |
| C18 | Concept 2 lit cairns only on groggy weeks | Also on a seeded 1 in 5 of all mornings | - |
| C19 | Concept 2 new content only on good weeks | Fixed `day_index` schedule (mechanics-review S14), at most 2 days delay | - |
| C20 | Concept 2 and player review patient-view lines about the body ("heavy-eyed mornings", "short nights") | Pull-only, about what the island did, default hidden, later | patient view owner |
| C21 | Concept 2 "Your mornings" biome strip in the patient view | Cut tonight (sauna tiles would read as an anxious week); the end-screen path strip replaces it, today only | - |
| C22 | Statistics: upright time over all task seconds; morning pulse timing unconstrained; `helped` over the whole task | M7, M9, M10 | Statistics owner |
| C23 | Audit defect G: night dawn light over closed eyes | At night, if the eyes have been closed for more than 10 s when dawn starts, the lamp stays off | engine owner |
| C24 | Auditor: dev sliders unusable at phone width | Presenter drawer and laptop relay (section 7) | main.js owner |
| C25 | Player review: Opening Answer before Fork vs clinical "fixed context before Fork" | Opening at the launch, then the standard hill and the 3 s stable window before Fork; Fork itself uses the fixed presentation | - |

Decisions rows needed: director v2 (bands, dwell, breaks, budget); calm has no entry signature; no per-closure feedback, frost cut; morning lamp ladder and the fatigue step; fixed measurement presentation; `K_quiet` cut for the pilot; presenter timing is demo only and logged.

---

## 12. Acceptance tests (extend the audit harness)

1. Edge run (+8 bpm, 2.5 bpm sine, 70 s): at most 1 commit.
2. Pulse +22 then back to +3: calm commit by Drift with no haptic signature; settle Answer within 8 s [presenter] of the drop, snow speed at most 0.6x within 10 s of it, sauna window lit.
3. Pulse +22 held, flat: settle Answer on the time floor by 25 to 30 s in calm (floor test).
4. Pulse -9: wake Answer within 10 s [presenter], 14 s [real]; lamp tint change plus a level rise of at least 4 points; haptic `ladder3` emitted.
5. Drowsy 0.85: fatigue Answer within 10 s [presenter]; lamp level reached in 3 s and frozen afterwards.
6. Eyes back to normal from fatigue: flow within 12 s [real]; lamp level never decreases.
7. Pulse null at `a = 2.2`: `a < 0.5` within 12 s, zero Answers, gifts unchanged.
8. rPPG at quality 0.35 with outliers: zero Answers.
9. Face lost 20 s in fatigue: `f` within plus or minus 0.05 for 15 s, then decays.
10. Single closures of 1.6 s: no visible, haptic or lamp event within 10 s.
11. Decode test: from a 70 s recording of screen, haptics and lamp, a rater cannot tell "pulse above baseline" better than chance from signatures (no calm-entry sting).
12. No isochronous haptic train of more than 3 events between 0.8 and 2 Hz anywhere in play.
13. Measurement frames (Bite, Fork, Two lanterns): pixel diff of the stimulus area 0 across all modes; lamp constant; no haptic in the stable window.
14. Morning lamp level never decreases from Begin to dawn; flash guard: no full-screen rise over 10% in under 333 ms (WCAG 2.3.1 [R]).
15. Answers per session at most 4 including the Opening, at least 20 s apart [8 s presenter].
16. DOM and canvas: no digits or body words during play except `dev=1` panels and the SIMULATED badge.
17. Real build without `dev=1`: the simulator never feeds the director.

---

## 13. Sources

Verified this session by me [V]:
- Kuikkaniemi K, Laitinen T, Turpeinen M, Saari T, Kosunen I, Ravaja N. The influence of implicit and explicit biofeedback in first-person shooter games. CHI 2010, 859-868, doi 10.1145/1753326.1753453. https://dblp.uni-trier.de/rec/conf/chi/KuikkaniemiLTSKR10.html , https://core.ac.uk/display/102620418 (abstract via search: N = 36; implicit biofeedback no significant effect; explicit more immersion and positive affect).
- Booth M. The AI Systems of Left 4 Dead. Valve 2009. https://steamcdn-a.akamaihd.net/apps/valve/2009/ai_systems_of_l4d_mike_booth.pdf (opened: goals include "Generate Dramatic Game Pacing" and "Promote Replayability" through "Structured Unpredictability").
- Valve Developer Community, L4D2 Director Scripts (build up, sustain peak, relax phases; page returned 403, seen as a search result only): https://developer.valvesoftware.com/wiki/L4D2_Director_Scripts
- Ehlers A, Margraf J, Roth WT, Taylor CB, Birbaumer N. Anxiety induced by false heart rate feedback in patients with panic disorder. Behav Res Ther 1988;26:1-11. https://ora.ox.ac.uk/objects/uuid:54fe1425-c8de-4754-bdee-629f1e0c6ae8
- Nevermind (Flying Mollusk): difficulty rises with measured stress, for example a room fills with more water. https://www.pcgamer.com/nevermind-biofeedback-horror , https://newatlas.com/nevermind-video-game-biofeedback-stress-levels/29728/
- Journey (thatgamecompany 2012): the scarf as the diegetic flight meter, no HUD. https://strategywiki.org/wiki/Journey_(2012) , https://tvtropes.org/pmwiki/pmwiki.php/Videogame/Journey
- Mizuguchi on Tetris Effect: particles react to the music and to what the player does. https://www.pcgamer.com/uk/japan-week-mizuguchi-on-the-magic-of-tetris-effect/
- Van Dyck E et al. Spontaneous entrainment of running cadence to music tempo. Sports Med Open 2015;1:15, doi 10.1186/s40798-015-0025-9 (imperceptible tempo shifts changed cadence; the 2.5% window is from citing papers). https://sportsmedicine-open.springeropen.com/track/pdf/10.1186/s40798-015-0025-9
- Philips Hue Sync (room light follows the screen; reviewers report little latency): https://www.philips-hue.com/en-us/explore-hue/blog/sync-with-tv , https://www.macrumors.com/review/philips-hue-play-hdmi-sync-box

Verified this session by the concept or review agents [R] (their URLs in their reports): Heide and Borkovec 1983 (relaxation-induced anxiety); Gavriloff et al. 2018 (sham sleep feedback nocebo), doi 10.1111/jsr.12726; Sit et al. 2018 (bright light in bipolar depression); WCAG 2.1 SC 2.3.1; Pins and Bonnet 1996 (Piéron's law); Graham and Clifton 1966 (orienting response); Costa et al. EmotionCheck, https://pmc.ncbi.nlm.nih.gov/articles/PMC6435301; Azevedo et al. 2017; Hilditch and McHill 2019 (sleep inertia); Philips Wake-up Light sunrise 20 to 40 min; Apple Vitals typical range; Oura activity goal and Rest Mode; Hades God Mode; Mightier; Apple Breathe taps; Baron et al. 2017 and Rosman et al. 2024 (orthosomnia, wearable anxiety); Fairclough 2009; Denisova and Cairns 2015; Nacke et al. 2011; Licht et al. NESDA (TCA and SNRI heart rate, search summaries only).

Prior knowledge, not re-checked [K]: HeartMath positive-only feedback; Death Stranding traces; Animal Crossing overnight changes; Brain Age schedule; Apple Night Shift; Klasnja et al. 2015 micro-randomised trials; redundant-signals effect on RT.
