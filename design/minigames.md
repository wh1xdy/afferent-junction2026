# Minigames v3: final spec

Status: design spec for the minigame rebuild ("minigames are weak now, use the role model concept to make them sick"). Written by the lead game designer from 2 concepts per task and 3 judge passes (design, clinical and safety, engineering). Nothing here is built yet. Where this file and `GameDesign.md` section 5 differ, this file describes the intended next version; `GameDesign.md` and `References.md` get updated once a task ships.

Location note: `npm run design` copies `design/` into `demo/design/`, so this file is bundled into the app folder as well. It is harmless there (never loaded), but the orchestrator may prefer to move it to `docs/` later.

## 0. Challenge and difficulty (overrides easier numbers below)

Why: David played the build and said "Right now the game still doesn't feel interactive as a player. Just feels like you're watching something. The challenges are way too easy." This section is the challenge contract. Where a task's **Intensity** paragraph in section 3, or a line in "0. Rules for every task", gives easier numbers or forbids grades and combos, this section wins. Everything else stays binding: no fail states, no numbers, scores or words on screen, no red, flash guard and R5, the 3 Hz rule, reduced motion, haptic rate caps, and the logged meaning of `items` and `errors`.

### 0.1 Role models and the exact pattern taken

| Role model | Pattern taken 1:1 | Used for |
|---|---|---|
| Flow channel (Csikszentmihalyi; Jenova Chen, "Flow in Games", 2007) | challenge must track skill: above it is anxiety, below it is boredom; the system keeps the player in the channel without telling them | one level per player per task, adjusted every trial, so every morning starts at the edge of the player's ability |
| Adaptive staircase (Levitt 1971 transformed up-down; Kaernbach 1991 weighted up-down) | step up after a success, down after a miss; the ratio of the two steps sets the success rate it converges to (3-down 1-up gives 79.4%) | the update rule in 0.2, target 75 to 80% |
| Dynamic difficulty adjustment research (Hunicke 2005, Hamlet; Resident Evil 4 hidden rank; Crash Bandicoot's invisible extra help after repeated deaths) | adjust invisibly, in small continuous steps, never announced, no rubber banding the player can notice | no level is ever shown; per-trial steps are small; the assist in 0.6 |
| WarioWare (Touched!, Smooth Moves) | a fixed set of microgames, a speed-up stinger every few games raises the tempo of everything after it, a boss stage closes the set | the three-step ramp inside every task, the boss item, session heat across tasks |
| Tetris (NES gravity table; Guideline 7-bag) | difficulty follows a steep monotonic curve that gets steeper at the top; the bag randomiser rules out unfair droughts and floods | time values interpolate geometrically; all random content is drawn from shuffled bags |
| Threes | new card types enter only once the board passes a threshold, so complexity unlocks in steps | new elements (4th bell, frost motes, hatch, latch, 6x6) join only above fixed `d` thresholds |
| Rhythm Heaven | four judgements (perfect, hit, barely, miss) each with its own reaction; barely plays a harmless off animation; the song never stops | the shared grades in 0.5 |
| osu! (OD and AR) | one difficulty number sets the hit windows (300 window 80 - 6 x OD ms) and the approach time (1200 ms at AR 5 down to 450 ms at AR 10) | beacon windows and ring telegraph as functions of `d` |
| Simon (Milton Bradley) | playback speeds up at fixed chain lengths (tone 0.42 s, then 0.32 s from note 6, 0.22 s from note 14) | bells show gap |
| Flow Free | packs step the grid 5x5, 6x6, 7x7; within a pack puzzles get harder; "perfect" means solved with one move per pair | threads tiers and the perfect bonus |
| Fruit Ninja | 3 or more fruit in one swipe is a combo; Arcade's blitz keeps a chain alive while slices land inside a short window; bombs are the risk | fireflies combo window and frost-mote decoys |
| Guitar Hero | a note streak raises a multiplier in steps (x2, x3, x4 every 10 notes), shown as a brighter highway | combo tiers; changed: a miss drops one tier, never to zero (no fail, kindness) |
| Peggle Extreme Fever; Tiny Wings fever | a rare earned state that pays extra and looks bigger for a few seconds | the tier-3 fever moment |
| Celeste Assist Mode | game speed 70 to 90%, wider tolerances, framed as legitimate, never shames | the bad-morning assist; changed: it switches itself on quietly (no menu, no message) |
| Left 4 Dead AI Director | tracks stress, builds up, peaks, then forces a relax phase before the next build | how the vitals director pushes (0.4) |

### 0.2 Shared adaptive difficulty model (DDA)

**Scope.** The 8 adaptive tasks: breath (calm only), loyly, threads, stars, fireflies, beacon, bells, shutters. Excluded: reaction, fork and lanterns keep their fixed rules exactly (X20), read nothing from this model, write nothing to it and get no `extra.dda`; rest-mode breath is excluded too (rest exists to drift off). Code: `demo/js/skill.js`, namespace `A.Skill` (`level(id)`, `axis(id, name)`, `trial(id, grade)`, `save()`).

**State per player per task:** `L` 0 to 1 (base level), `n` (trials ever), `last` (local date of last play), `best` (highest `L` reached).

**Presented difficulty, per axis:** `d = clamp(L_eff + heat + ramp + boss + D_axis + A, 0, 1)`
- `L_eff = L - rust`, `rust = min(0.06, 0.01 x (days since last - 1))` for gaps over one day (skill fades a little after a break).
- `heat` (WarioWare speed-up across microgames): +0.03 per adaptive task already played this session, at most +0.06.
- `ramp` (WarioWare speed-up inside the task): the task's items split into thirds by count; +0 in the first, +0.06 in the second, +0.12 in the last. Each step plays the wordless speed-up stinger: the panel border breathes once, `seq` light 0, medium 120, and the music gains a layer.
- `boss`: the last item of every task (ferry, final shutter, last comet round, final pour, last pair, last star, last volley, last cycle) gets +0.2 and pays double light.
- `D_axis`: director modulation (0.4). `A`: assist offset (0.6), else 0.
- There is no warm-up below `L_eff`: the first task of the morning already asks for real skill.

**Axis mapping.** Every axis has a value at `d` 0 and `d` 1 (0.3). Times and windows interpolate geometrically, `v0 x (v1 / v0)^d` (Tetris: the curve steepens at the top); counts and sizes interpolate linearly and round. Unlocks (Threes) are step functions at the `d` given in 0.3.

**Trial outcome** `o`: perfect 1, good 0.8, barely 0.4, miss 0. Each task defines its trial and grades in 0.3.

**Update rule (weighted up-down).** After every trial: in-session level `Ls += s x (o - p*)`, persisted level `L += w x s x (o - p*)`. The mean outcome converges to `p*`; for a plain success or miss this is +s(1 - p*) or -s x p*, so at `p*` 0.78 one miss weighs about 3.5 successes. The task presents from `Ls` (it adapts within the task); the next session starts from `L`.
- `p*`: 0.78 for tempo tasks (fireflies, beacon, bells, shutters), 0.75 for puzzles (threads, stars), 0.80 for calm (breath, loyly; calm must feel mostly successful).
- `s`: 0.08 for the first 10 trials of that task ever, 0.04 up to trial 60, 0.025 after (large first steps, as in Levitt). Tasks with 3 or fewer trials per play (breath, loyly, bells) use 2 x `s`.
- `w` (credit weight): 1 when no `D_axis` exceeds 0.05 in size, 0.5 up to 0.15, 0 beyond; 0 while the assist is on; 0 in autoplay, in simulated profiles (`good_day`, `bad_day`) and with `?speed`. So vitals and bad mornings never distort tomorrow's level.
- Persisted `L` moves at most plus or minus 0.12 per task per session.
- Ceiling: `L` and `d` stop at 1.0, and 1.0 is defined per task in 0.3 so that a skilled player lands about 60% perfect there. Tuning target: a regular player plateaus at 0.5 to 0.7 after two weeks; 1.0 is for experts.
- New player: `L = L0` from 0.3. Every `L0` is harder than the old `k` 1 numbers on at least one axis, and its `d` 0 is never easier than the old `k` 0.5.

**Persistence (device).** `localStorage` key `afferent.skill.v1`, JSON `{"v":1,"tasks":{"beacon":{"L":0.42,"n":37,"last":"2026-11-14","best":0.47}},"rt":[412,398],"updated":"<iso>"}`, where `rt` holds the last 14 core `median_ms` values (for the assist trigger in 0.6; the core itself never reads them). Read once at session start, written at session end and on app hide, every access in try/catch like `store` in `main.js`. A failed or empty read uses `L0` and never blocks the session. Per installation (same device as `afferent.device`).

**Session record (extra fields, schema-valid today: top level `additionalProperties: true`, task `extra` is free form).**
- Top level `skill`: `{"v":1,"assist":false,"assist_reasons":[],"heat_max":0.06,"stored":true}` (`stored` false when `w` was 0 all session).
- Each adaptive task `extra.dda`: `{"v":1,"L_start","L_end","Ls_end","d_start","d_mean","d_max","D":{"<axis>":x},"w","trials","o_mean","grades":{"perfect","good","barely","miss"},"combo_max","tier_max","fever","light_share","assist"}`, numbers to 3 decimals.
- `intensity` keeps logging the director's `k` exactly as now. `engine.js` `intensity()` drops its errors-based adjustment (-0.15 / +0.1): that rubber band is replaced by this model, so `k` is pure vitals again.
- Every task whose counts change through 0.3 bumps its `extra.v` by one and gets a Decisions row (`items` and `errors` keep their meaning, only their ranges change).
- `auto()` of every task plays a fixed-skill bot that grades about 15% perfect, 55% good, 10% barely, 20% miss, so the demo shows grades and combos. Test before shipping: 30 simulated sessions with a fixed-skill bot must bring `L` within 0.05 of its true level and `o_mean` into 0.75 to 0.80.

**No watching.** Inside a task no stretch longer than about 2 s passes without a meaningful input. Exceptions: the bells show (capped at 2.2 s per round) and the breath exhale (letting go for 6 s is the calm task's patience challenge).

### 0.3 Per-task axes, start level and range

Notation: value at `d` 0 → value at `d` 1 (value at the start level `L0`). All `L0` = 0.30.

**fireflies (wake), Fruit Ninja.** Trial: each firefly launched. Perfect: caught within 100 ms of its apex; good: caught inside the catchable band; barely: caught in the band's last 120 ms as it falls; miss: falls back uncaught (it is relaunched later).
- volley interval 2 → 1 beats (1.5, quantised to half beats); fireflies per volley 2 to 3 → 4 to 5 (3)
- hang at the apex 0.6 → 0.3 s (0.49); catch radius 0.10 → 0.065 panel units (0.088); catchable band from 30% → 55% of the rise (37%); launch speed x1 → x1.35
- frost motes (decoys, Fruit Ninja bombs without the fail): none below 0.4, 1 per volley from 0.4, 2 from 0.8; brushing one chills the trail silver-blue and drops one combo tier, nothing else
- catches to finish `n` 9 → 16 (11), max 15 s
- combo: blitz window 0.8 → 0.45 s between catches; 3 or more in one stroke jumps one tier

**beacon (wake, fatigue), Rhythm Heaven plus osu!.** Trial: each boat. Perfect, good and barely by window; miss: no tap in the barely window. `items` = boats lit inside the barely window (the logged `window_ms`).
- bpm 84 → 100 (89) before the director; absolute cap 104 (overrides 96; the beam alternates sides, so each light pool stays under 1 Hz)
- windows perfect / good / barely plus or minus 60 / 110 / 170 → 32 / 65 / 110 ms (50 / 94 / 150)
- ring telegraph 2 → 1 beats (1.5); boats per chart 8 → 18 (11), chart about 14 s
- density: one boat per 2 beats; consecutive-beat pairs from 0.25; eighth-note doubles from 0.6; offbeat boats from 0.8. Sides alternate strictly below 0.5, above that they follow a repeating pattern the player can learn (Rhythm Heaven remix)
- combo tiers at 4, 8, 12 good-or-better boats in a row: beam widens, sea shimmer, harmony bell layer; fever: the pier lanterns light two at a time

**bells (wake, fatigue), Simon.** Trial: each round. Perfect: echoed without error at the show tempo (every inter-tap interval within plus or minus 30% of the show gap, from `d` 0.4); good: echoed without error; barely: echoed after a replay; miss: the target shortened (every second error shortens by one, unchanged).
- target chain 4 → 7 (5); always three rounds: target - 2, target - 1, target
- show gap 0.50 → 0.26 s (0.41); Simon speed-up -8% per round from 0.5; show capped at 2.2 s per round
- 4th bell (deep, low left, own size, position and tint) from 0.5
- memory aid: windows stay faintly coloured below 0.25, fade to a ghost from 0.25, are dark before the echo from 0.6
- combo: each clean round in a row lifts the tower wash a step; three clean rounds give the lamp the full chord and a second beam

**shutters (fatigue), WarioWare.** Trial: each window. Each window arrives on a bar line; the light leak breathes on the beat (the only clock, never a countdown). Perfect: opened before the perfect mark; good: within two bars; barely: later or after a wrong-direction first touch; miss: auto-opened at timeout. A window still waits as long as needed.
- windows 6 → 9 (7), max 15 s; transitions 0.5 → 0.22 s (0.39); speed-up stinger every 3 windows
- perfect mark 2 bars → 2 beats after arrival (about 1.3 bars)
- mechanisms: roller blind and hinged pair from 0; top-hung hatch (push up) from 0.4; two-step latch (flick the hook up, then swipe apart) from 0.65; mirrored pairs from 0.8
- direction cue: light leak stays on below 0.3, shows 0.8 s at arrival from 0.3, 0.3 s at 1 (then the shape alone tells the way, as in WarioWare)
- commit threshold 35 → 50% of travel
- combo: perfect opens in a row push the sunrise an extra step per window and stack chord layers

**threads (flow), Flow Free.** Trial: each pair. Perfect: joined in one drag with no cut; good: joined across lifts with no cut; barely: after a cut or a hint; miss: joined by `auto()`.
- grid 5x5, 6x6 from 0.55 (overrides "no 6x6"; only if cells stay at least 46 pt in the panel, otherwise stay 5x5 and add one trap pair)
- pairs 4 → 6: 4 below 0.25, 5 from 0.25 (so 5 at `L0`), 6 from 0.8
- trap pairs (whose naive direct path blocks the solution) 1 → 3 (2)
- hint shimmer after 8 s without progress at 0, 12 s from 0.4, none from 0.7 (auto at max stays); max 16 s on 5x5, 20 s on 6x6
- puzzle bank: 6 tiers x 6 puzzles, each checked for a unique solution by an offline solver, plus 8 symmetries and colour permutation
- combo: perfect pairs in a row harmonise each join chime with the last; a perfect solve (Flow Free perfect: one drag per pair, full fill) adds an extra aurora wave and double light

**stars (flow), Two Dots plus Threes.** Trial: each link. Perfect: in tempo (within the link window of the previous link) with no wrong selection; good: clean but slower; barely: after a lift or a pass over a wrong star; miss: after a wrong selection.
- stars `n` 6 → 10 (7); v1 swan has 7 anchors, so v1 caps `n` at 7 and reaches the ceiling with the other axes; `n` 8 to 10 needs the v2 figures (eagle-owl, 10 anchors)
- neighbour size ratio 1.40 → 1.12 (1.31); hit areas stay at least 44 pt; magnet radius 1.5x → 1.1x (1.38x)
- brightness jitter independent of size, so brightness misleads: 0 below 0.25, plus or minus 10% from 0.25 (so present at `L0`), plus or minus 30% at 1; unsynchronised twinkle under 20% luminance from 0.7
- link window 0.9 → 0.55 s (0.78)
- combo: perfect links keep the thread singing (glass hum one step up per link, world stars one more notch); a miss lets the hum settle back one step

**breath (calm only), Journey plus Apple Breathe.** The clock stays 4 s in, 6 s out (the `breath_sync` reference). Challenge is precision and patience only. Trial: each cycle. Three checks: steady thumb, full hold share, release in the window around the 4.0 s turn. Perfect: all three; good: two; barely: one; miss: none.
- thumb drift allowed before the motes loosen 44 → 14 pt (31); loosened motes drift back out slowly, never scatter
- release window around the turn plus or minus 700 → 200 ms (480); hold share for a full ring 0.60 → 0.95 (0.71)
- reward is positive only (overrides "release timing is never visibly graded" only in this sense): a perfect cycle, a "clear song", lights one extra landmark and sends the ring to the horizon; every other cycle sends the normal ring by the existing rule, never a dimmer one and never a negative cue
- combo: two clear songs in a row and the aurora sends one early ribbon; nothing gets faster or louder

**loyly (calm), Cooking Mama.** Trial: each pour. Perfect: every stone warmed, water lasts to the far end, even speed; good: at least 75% of stones; barely: at least 40%; miss: fewer. `SLOW` (2.0 s, the item threshold) is unchanged.
- water per ladle (Cooking Mama's finite pour) 1.6 → 1.05 bed lengths at target speed (1.4); stalling over one stone for more than 0.6 s pours water there (double hiss, no extra warmth), so a stop-start sweep runs dry before the end
- `bloom_s` 2.6 → 4.5 s (3.1); evenness for a perfect pour, finger speed CV over 150 ms, 0.60 → 0.25 (0.45)
- the stones sit on a gentle arc; the stream must stay within plus or minus 40 → 16 U of it to warm a stone (30)
- stones 8 → 12 (9); pours 2, 3 from 0.6 (the arc reshuffles between pours)
- combo: silk pours in a row step the stove embers up twice and hold the fog longer; no tempo or pitch build (calm)

### 0.4 The vitals director modulates the difficulty (Left 4 Dead pacing)

The director picks the axis that carries the challenge; the mode's character never changes.
- **calm (breath, loyly):** tempo axes stay pinned at their `d` 0 values, never faster. Challenge only through precision and patience. Higher arousal (`k` up) only eases precision, `D` = -0.3 x `k` on steadiness, windows, evenness and line tolerance; patience axes (`bloom_s`, water) may ask a little more stillness, `D` = +0.1 x `k`.
- **wake (fireflies, beacon, bells):** tempo and reaction axes (bpm, volley interval, hang, show gap, telegraph) get `D` = +0.15 x (`k` - 0.5), so a sleepier reading pushes firmer; precision axes (windows, radius) get -0.05: activation, not fiddliness.
- **fatigue (beacon, bells, shutters):** like wake with +0.2 x (`k` - 0.5) on tempo axes and transitions.
- **flow (threads, stars):** no `D` (`k` is a fixed 0.4); load axes (pairs, traps, `n`, ratio) carry all of `d`.
- **Build, peak, relax:** after a peak (a task that ended with `o_mean` above 0.9 or a fever), the next adaptive task runs its first third at `ramp` -0.05 before it builds again, so two peaks never stack.

### 0.5 Grades, combos and light (all adaptive tasks)

- **Grades (Rhythm Heaven), shown only through juice, never words, numbers or a negative colour.** Perfect: the task's normal hit plus one extra glint, a brighter bloom tier and a `tick` 40 ms after the hit haptic (rate caps apply). Good: the normal hit as specified in section 3. Barely: the hit at half the sparks with a softer, lower note; the object wobbles once as it takes. Miss: the existing no-fail answer of the task (drifts home, falls back, springs back).
- **Combo (Guitar Hero tiers, kinder).** Hidden counter `c`: good or perfect +1, barely holds, miss drops `c` to the start of its tier (one miss never returns it to zero; a second miss in a row drops one more tier). Default tiers at 3, 6 and 10 (task overrides in 0.3). Each tier is one diegetic step: warmer trail or beam, one extra harmony layer, the border warms a notch. In tempo tasks the chain also drops a tier when no good hit lands inside the task's combo window (Fruit Ninja blitz).
- **Fever (Peggle, Tiny Wings).** Reaching the top tier, at most once per task: 2 to 3 s in which hits pay double light and look one size bigger, through the flash guard.
- **Light.** Each trial adds grade value x tier multiplier (1, 1.25, 1.5, 2) to the task's light; `light_share` = light / the maximum possible. The payoff plays in three sizes (full at 0.8 or more, medium at 0.5 or more, otherwise small but warm and complete); the boss item and the colour return always happen. A miss costs light and tempo (a lower tier, a thinner layer of music), never ends the task, never shows a failure.
- **Overrides in section 3:** 3.9 "No accuracy words, grades, perfect tier or combo counter, and no streak escalation" now means no words or counters; grades and tiers exist as juice. 3.8 "no combo counter" now means the combo is hidden and diegetic. 3.10 escalation now follows chain position and consecutive clean rounds. "No streaks" in the rules above means no visible in-task counters; the day streak (Duolingo style, at the start) is specified in `coreloop.md`, "Morning ritual". Every **Intensity** paragraph's numbers are replaced by 0.3, and `k` keeps only the role in 0.4.

### 0.6 Bad-morning assist (Celeste Assist Mode, switched on quietly)

- **Trigger**, checked after the core and again at every task start: `mood_start` 1, or any two of: `mood_start` 2; core `lapses` 2 or more, or core `median_ms` at least 1.25 x the player's own 14-day median (needs 5 or more earlier sessions); fatigue `f` at least 0.6 for 20 s; `Ls` fallen 0.15 below `L_start` within the previous task (the Crash Bandicoot rule).
- **Effect**: `A` = -0.15 on every axis (about Celeste's 80% speed on tempo axes); windows, radii and combo windows x 1.25 on top; a miss holds the combo like a barely; hints earlier (threads 5 s); `ramp` capped at +0.06 and `boss` at +0.1; `light_share` floor 0.5, so the payoff is at least medium.
- **Quiet**: nothing on screen, in sound or in haptics says it; no menu, no message, never the words "easy" or "assist". It never switches mid-task; it is re-checked at the next task start and ends by itself when no signal holds.
- **Memory**: `w` = 0 while it is on, so a bad morning never lowers tomorrow's level and an easier morning never inflates it.
- **Log**: `skill.assist`, `skill.assist_reasons` (for example `["mood_1", "rt_slow"]`), `extra.dda.assist`. The assist adjusts play only; it is not a diagnosis and is never described as one.

## 0. Rules for every task

**Role model rule (David).** Every task is anchored in one or two named, established games. Their proven pattern (verb, controls, feedback, pacing, readability) is taken as close to 1:1 as possible. Every deviation names the constraint that forces it. "Among Us task" stays only as the frame (a short modal task in a panel), never as the design of a task.

**Hard constraints (all tasks):** touch only (tap, hold, drag, swipe), one-handed lying in bed, readable without words in about 1 s, no fail states, no scores, no numbers, no streaks (DesignSystem rule 3), no red, no pressuring timers or visible countdowns, nothing flashing above 3 Hz, large-area brightening only as a rise of 300 ms or more, at most +25% over scene luminance in `dark_room` (Decisions R5), calm tasks never excite, wake and fatigue tasks activate through tempo, contrast and rhythm without being harsh, every task logs `items`, `errors`, `extra` with their meaning unchanged, intensity `k` 0 to 1 scales difficulty (calm: `k` rises with arousal, so higher `k` may only ask for more stillness or give more assist, never more precision), a reduced-motion variant, canvas 2D at 60 fps on an iPhone. Sound is out of scope (X28): every task is designed for haptics and visuals and names its sound hooks. Claims policy: supportive, never treats or diagnoses; no task is described as attention, alertness or cognitive training.

**Lighthouse budget.** The lighthouse is the goal on the horizon (Journey). It appears as a task object only in beacon, and is lit as the world's goal at the end of the reaction core. Bells uses a wooden bell tower, breath ends on the horizon aurora, so the lighthouse is not repeated.

**One beat-tap task in wake.** Wake gets three different verbs: fireflies (brush), beacon (tap on a beat), bells (self-paced memory tap). Fatigue: beacon, bells, shutters (drag). Calm: breath (hold), loyly (slow drag). Flow: threads (route drag), stars (chain drag).

## 1. Winners at a glance

| Task | Winner (scores D / C / E) | Runner-up | Role models (primary first) | Verb |
|---|---|---|---|---|
| reaction (core) | **Bite** (8 / 8.5 / 6) | Answer the lighthouse | Animal Crossing NH fishing; Kirby Super Star Samurai Kirby | tap anywhere when the float is pulled under |
| fork (measure) | **Fell or Shore** (7.5 / 7 / 7) | Harbour Lamps | Monument Valley; Journey scarf; Peggle pitch ladder (from runner-up, normalised) | tap a side, then tap each stepping stone light |
| lanterns (measure) | **Lantern Release** (7.5 / 8.5 / 7) | Kindle the Harbour | WarioWare "pick the bigger one"; Peggle Extreme Fever (scheduled reward only) | tap the bigger lantern, it flies |
| breath | **Lantern Song** (8 / 8 / 6) | Swan Feather | Journey song; Apple Watch Breathe | hold to gather light, let go to sing it out |
| loyly | **Silk Pour** (7.5 / 8 / 7) | Long Loyly | Cooking Mama pour; Flower; Stardew charge preview (from runner-up) | lift the ladle and sweep it slowly over the stones |
| threads | **Aurora Loom** (8 / 8 / 4) | Star Chain | Flow Free; Monument Valley solve; Dots line feel (from runner-up) | drag a path from knot to twin knot |
| stars | **Joutsen** (7.5 / 8 / 6) | Kointahti | Two Dots; Okami constellations; Threes intro (sort axis) | drag one thread through the stars, small to large |
| fireflies | **Firefly Fling** (8 / 8 / 8) | Firefly Chorus | Fruit Ninja Zen; Vampire Survivors pickup and vacuum | brush the fireflies at the top of their arc |
| beacon | **Harbour Beat** (7 / 7.5 / 6) | Swell Sweep | Rhythm Heaven; osu! approach circle | tap anywhere on the beat when the beam meets the boat |
| bells | **Tower Chain** (Lighthouse Chain, 7 / 7.5 / 8, tower changed) | Harbour Echo | Simon; Peggle per-hit pitch build | echo a light chain that grows by one note |
| shutters | **Wake the House** (8 / 8.5 / 4) | Shutter Call | WarioWare Touched!; Peggle last peg; Shutter Call's 1:1 drag (Beat Saber direction cue) | drag each shutter open the way its shape says |

Dropped concepts and why: Swan Feather (payoff broken by 1 to 2 cycles, tracking keeps eyes open), Long Loyly (second hold-and-ring in calm), Star Chain (different measurement under the same id), Kointahti (errors collapse into steering clumsiness), Firefly Chorus and Harbour Echo (third and fourth beat-tap task, unison blinking in a dark room), Swell Sweep (same Fruit Ninja verb as fireflies), Shutter Call (row of identical shutters again, ornamental beat), Harbour Lamps (perspective hurts countability), Kindle the Harbour (per-trial slide before every cue), Answer the lighthouse (stimulus far from gaze, bigger luminance step). Good ideas from each runner-up are grafted below and marked "graft".

## 2. Shared juice kit (`demo/js/juice.js`, namespace `A.J`)

One shared module, then one file per task (`demo/js/tasks/<id>.js`). Shared helpers in `minigames.js` (`glow`, `ring`, `disc`, `finger`, `tapCue`, `dragCue`, `dots`, `base`, `finish`, `unit`) move to or are re-exported by `juice.js`. Measurement logic for fork and lanterns stays in `measures.js` and the reaction core logic stays in `engine.js`; their task files only add a presenter (draw plus juice triggered by state edges), so no scoring code is touched.

Reference: "Juice it or lose it" (Jonasson and Purho, 2012): every input gets an immediate response, tweening instead of snapping, squash and stretch, particles, hit-stop, screen-space light, layered sound. Vampire Survivors and Balatro: escalation by stacking small events. Peggle: one oversized moment for the rare event. Here every one of these is bounded by the hard constraints above.

### 2.1 Prerequisites (build once, about 1 to 1.5 h, before any task)

1. **Sprite cache.** `glow()` today calls `createRadialGradient` on every call (`minigames.js:17`), the main 60 fps risk. `A.J.spr(kind, colour, r)` returns a cached offscreen canvas per (kind, colour, radius bucket of 8 px); kinds `glow`, `soft` (flat core), `ring`, `spark` (4-point glint), `mote` (2 to 3 px dot with halo), `streak`. Drawn with `drawImage` and `globalCompositeOperation = 'lighter'`. `world.js` already has an `SPR` cache to copy from (`world.js:21-69`). `glow()` becomes a thin wrapper, so old code speeds up too.
2. **Haptics.** `npm i @capacitor/haptics` and `npx cap sync ios` (package.json has only core, cli, ios; `world.js:208` reads `Capacitor.Plugins.Haptics`, which is undefined today; `navigator.vibrate` does nothing in WKWebView). Replace `session.haptic()` (`engine.js:80`) with `A.J.hap(name)`, see 2.6.
3. **Beat clock.** `A.J.beat` with `bpm`, `t0`, `phase(now)`, `index(now)`, `timeOf(i)`, `onBeat(cb)`. Set at task start by the engine from `MODES[mode].tempo` and the task's own formula. It is separate from `beatPhase` (`engine.js:431`), which keeps driving the fixed 1 Hz lantern pulse (never the live pulse). Later it locks to the AudioContext clock.
4. **Outro hold.** Optional `g.outro` seconds: the engine closes the panel at `finishedAt + max(0.7, g.outro)` instead of 0.7 s (`engine.js:471`). Never more than 2.2 s. The record's `duration_ms` still ends at `finishedAt`; the outro is presentation time.
5. **Animation clock.** `g.at` advances by `dt * g.timeScale`; hit-stop and slow-motion change only `g.timeScale` and everything drawn reads `g.at`. Game logic, `g.t`, `g.max`, trial schedulers and every logged time keep using real time. This is the single rule that keeps measurement clean.
6. **Touch timestamps.** `input.js` passes `e.timeStamp` converted to the `A.now()` timebase as `d.ts` next to `d.t`. Rhythm tasks log offsets from `d.ts`.
7. **Bare panel.** Optional `g.bare`: `drawOverlay` skips the panel fill, frame and clip but keeps `box()` mapping for input (lanterns, and the reaction overlay).
8. **World draw hook.** For `world: true` games (breath), the engine calls `g.drawWorld?.(ctx, now)` from the overlay pass. `A.session.orb` keeps being written so `world.js` stays compatible.
9. **World hooks (all optional, with fallbacks).** `A.World.hooks = { setBreath(b), landmarks(), lightLandmark(i, a), addSkyMark(kind, x, y), flareLighthouse(a), lanternPose(angle) }`. Every task checks `A.World.hooks?.x` and has a panel-local fallback, so no task is blocked on `world.js` work.
10. **Sound hooks.** `A.J.sfx(name, params)` emits `A.bus.emit('sfx', ...)`. Until audio exists it maps to the existing `Au.piano` / `Au.bell` where tasks use them today, so nothing becomes quieter than now. The reaction onset is the exception and stays silent.

### 2.2 Particles

- One pool, `A.J.fx`, global cap 120 live particles, per-task caps given per task. Overflow recycles the oldest.
- Particle: position, velocity, gravity, drag, life, size curve, alpha curve, sprite kind, colour, `lighter` or `source-over`.
- Presets: `burst(x, y, n, colour, speed)` (radial, drag 4/s, life 0.5 s), `rise(x, y, n, colour)` (embers up 30 px, sideways drift, life 0.7 s), `trailMote(x, y)` (life 0.8 s, up 20 px), `drip(x, y)` (gravity, 2 px disc), `puff(x, y)` (steam sprite, grows 30 to 120 U, alpha 0.18, rises 0.12 screen/s with sway), `snow(x, y, n)` (falls, small).
- Colours only from tokens: `lantern-*`, `aurora-*`, `silver-*`, `dawn-gold`, `dawn-sun`, `violet-200`. No red, no coral in the game.

### 2.3 Easing, springs, squash

- `A.J.ease`: `outSoft` (0.22, 1, 0.36, 1), `inOut` (0.65, 0, 0.35, 1), `breath` (0.45, 0, 0.55, 1), `outBack(s = 1.4)`, `outElastic` (damped, 2 wobbles), `inQuad` for magnet flights (accelerating, Vampire Survivors).
- `A.J.spring(state, target, freq, damping, dt)`: semi-implicit, critically damped by default (`damping = 1`), used for followers (ladle, feather-like lag, rubber bands, hop retargeting). Retargeting never queues: a new target replaces the old one.
- `A.J.squash(t, amount, dur)`: returns `[sx, sy]` with volume preservation (`sx = 1 / sqrt(sy)`), shape: compress, overshoot, settle. Standard values: touch-down 0.92 for 60 to 120 ms; impact 0.85 then 1.15; landing `sy 0.8, sx 1.15` for 120 ms.
- `A.J.wobble(t)`: two damped sideways cycles, 3 px, 220 ms. Used for "not this one" (never a colour change).
- `A.J.hitstop(g, ms)`: sets `g.timeScale = 0` for 40 to 120 ms, then eases back. Visual only (2.1 item 5).
- `A.J.slowmo(g, scale, ms)`: 0.3 to 0.4 for at most 500 ms. Visual only.

### 2.4 Bloom and screen-space light

- `A.J.light(x, y, r, colour, a)` queues a light for this frame; all queued lights are drawn after the panel content in one `lighter` pass with cached sprites (a cheap screen-space light map). Used for lit landmarks, light pools on water, light wedges from windows, lantern flares.
- `A.J.bloom(x, y, rMax, colour, rise, fall)`: local bloom ring (rise 120 to 600 ms ease-out, fall 300 to 1000 ms). Small blooms (under 10% of the screen) are free; large ones go through the flash guard.
- `A.J.border(warmth)`: lifts the panel border from 22% towards the 80% done glow by fractions (diegetic progress, no numbers).
- `A.J.spill(a)`: light leaving the panel into the world: calls `A.session.kick(a)` and, if present, `A.World.hooks.flareLighthouse` or the aurora tween. One per task end.

### 2.5 Flash guard (photosensitivity and dark room)

- `A.J.flash.request(area, delta)`: any brightening of more than 10% of the screen, or a step of more than 0.3 alpha over more than 5% of the screen, must pass the guard. It allows at most one such event per 333 ms (3 Hz), forces a rise of at least 120 ms (300 ms if the area is above 25%), and in `dark_room` clamps the peak so scene luminance rises at most 25% (R5).
- Small events (a firefly catch, a bead pop) are capped at 3 per second for their bloom (logic is never delayed, only the visual is merged).
- Nothing blinks on and off rhythmically over a large area. Rhythmic visuals (beat pulses, breathing knots) are luminance swings of at most 20% at 1.8 Hz or below.

### 2.6 Haptic patterns (`A.J.hap`)

| Name | iOS (Capacitor Haptics) | Android fallback (`navigator.vibrate`) | Use |
|---|---|---|---|
| `tick` | `selectionChanged()` | 6 ms | drag steps, ratchets, inhale train, "not this one" |
| `light` | `impact({style: 'LIGHT'})` | 10 ms | catches, links, ordinary hits |
| `medium` | `impact({style: 'MEDIUM'})` | 16 ms | commits, joins, big hits |
| `heavy` | `impact({style: 'HEAVY'})` | 24 ms | snaps, the largest bell, final hits |
| `success` | `notification({type: 'SUCCESS'})` | [10, 70, 14, 70, 22] | task payoff |
| `seq(list)` | schedules names at ms offsets | same | rising swells, ladders |
| `ladder(i, n)` | light for the lower third, medium middle, heavy last step | same | normalised ladders (fork, threads cells) |

Rate caps: `tick` at most one per 70 ms, impacts at most one per 120 ms, any `seq` at most 5 events. No haptic at a measurement stimulus onset (reaction, lanterns cue), because a felt cue would change reaction time. Haptics are the beat carrier until sound exists (GameDesign section 10, sound off row).

### 2.7 Reduced motion policy (`A.J.rm()`)

All helpers degrade on their own: squash returns `[1, 1]`, hit-stop and slow-motion return immediately, wobble becomes a 200 ms dim to 70%, particle counts x 0.4 with speed clamped under 0.2 screen per second, travelling objects (flights, comets, rings) become 200 to 300 ms crossfades in place, expanding rings become in-place fades, parallax pans become crossfades, no screen or panel nudge anywhere. Haptics stay unchanged. Measurement stimuli keep identical luminance and position.

### 2.8 Ghost cues

The existing `tapCue` and `dragCue` stay the wordless tutorial. Rule for every task: the cue appears only if there is no touch by the time given per task, and it shows the real first move (WarioWare's "the screen is the instruction"). Cues are steady or slow (never faster than 1 Hz).

### 2.9 Juice checklist template (each task fills it in)

Response on touch-down frame; tween, never snap; squash and stretch on the touched object; particles on success; a quiet, non-negative answer to every wrong or empty touch; escalation tied to progress, never to streaks; one payoff that changes the world (colour return); haptic on meaning, not on everything; sound hooks named; reduced-motion variant; flash guard used for big events; sprite cache only.

## 3. Tasks

Asset names are `task_<id>_<name>`, transparent PNG, procedural fallback always kept. Full prompt for every image = the ArtBible section 5 shared style prompt, verbatim, followed by a space and the asset prompt given here. The prefix, for convenience:

> STYLE = "Minimal 2D side-view illustration for a calm mobile game, flat layered silhouettes with soft watercolour texture and subtle paper grain, gentle gradients, no outlines, no text, no faces, no logos, calm and hopeful mood, Nordic polar night atmosphere, smooth organic shapes, generous negative space, limited palette of deep cool blues, soft greens and warm amber accents, full colour, isolated element on a transparent background, orthographic side view, even soft light from the left."

Every asset prompt below already ends in "transparent background, no text" where it matters; never ask for red (ArtBible asset 12 "white and red" lighthouse is replaced by slate-blue bands everywhere in this file).

---

### 3.1 reaction (fixed core): Bite

**Why today is weak:** the lantern you already watch brightens for a moment and a tap gives an almost invisible sparkle; there is no object, no cause and effect, early, on-time and missed taps look the same, waits are dead air, there is no progress and no ending, and the stimulus is not constant across sessions (onset piano note follows the sound setting, reduced motion drops the flash to 0.35, fog and dawn change its contrast).

**Role models and the pattern taken**
- Animal Crossing: New Horizons fishing: still bobber on dark water, the bite is one unmistakable event (float yanked under), one button, an instant catch pose with the catch lifted up, then a recast that visibly starts the next wait. Taken 1:1: fixed float position, abrupt plunge, press anywhere, the catch arcs up, recast.
- Kirby Super Star, Samurai Kirby: stillness during the wait, one high-contrast cue at a fixed spot that stays up until you act, a frame-0 response with a short freeze. Taken: stillness, held cue, hit-stop on response.
- Graft from Answer the lighthouse: the warm "someone answers" ending, the horizon lighthouse answers the fifth catch.

**Deviations and constraints**
- No fake nibbles before the bite (timing rules: they would be no-go trials and change what anticipations mean).
- No species, sizes, collection, "it got away" (no scores, wordless, no fail).
- The catch looks and feels identical for every speed (comparability, no grading).
- The fish is made of light, no hook, no struggle; it joins the lantern (supportive tone).
- No opponent, no frame counter, no losing (no scores, no fail). No full-screen white flash (photosensitivity, the stimulus must be a constant local luminance step).
- No tension sting or lean-in build (the core must stay neutral before the director classifies).
- Tap anywhere instead of on the float (lying in bed one-handed; keeps RT free of aiming).

**Screen in the first second:** the check-in panel fades and the camera holds. The figure's lantern pole tips out like a rod (via `lanternPose(angle)` if present; fallback: the line starts from a fixed point near the lantern). A thin silver line drops to a small round float with a warm bead on top at 50% width, 62% height, on a fixed soft dark backplate halo (so local contrast is the same in every session, drawn above fog and darkness layers). A steady ghost finger sits beside the float. A 1.2 s lead-in demo, identical every session and never logged: the float plunges by itself, the ghost presses at that moment, a light fish leaps into the lantern.

**Loop (per trial about 2.5 s, 5 trials)**
1. Recast, 0.3 s: the line flicks out and the float lands with one ripple ring. This marks trial start; taps in the first 250 ms of the foreperiod are ignored, as now, and show nothing.
2. Wait, 1.0 to 2.5 s uniform: stillness. The float bobs at a constant 0.4 Hz with small amplitude and a random phase that is independent of the foreperiod; snow drifts. Nothing builds up.
3. Onset, frame 0, no ramp: the float vanishes and a bite glow (`lantern-flame`, disc 18% of screen width) appears at exactly the float position with the line pulled down. It stays steady until the tap or 1.5 s. The rod tip trembles at 2 Hz (motion only, no luminance change).
4. Tap: the catch.
5. 0.35 s gap, recast.

**Feedback for every touch**
| Touch | Visual | Haptic | Sound hook |
|---|---|---|---|
| Tap after onset (hit or lapse, identical) | 50 ms hit-stop; rod squash 0.85 then whip to 1.15 with one overshoot (250 ms); light fish bursts out of a crown splash: 20 droplets silver to amber with gravity, 2 ripple rings, local bloom 0.3 H fading over 200 ms; fish flies a parabola into the lantern in 0.5 s with eased hang at the apex (Tiny Wings); lantern flares (`kick 0.6`) and gains one of five beads on its frame | `medium` on touch-down, `light` 450 ms later when the fish enters | line zip and water plunk on touch-down; soft bell at the catch, one pentatonic step up per trial, trial 5 on the tonic |
| Tap before onset (anticipation) | float bobs once, one small ripple, rod twitch 5%; no fish, no dimming | `tick` | soft water tap |
| No tap within 1.5 s (miss) | the glow sinks slowly, a light fish swims under the surface to the pier and drifts into the lantern on its own (0.8 s, softer bloom); the bead still lights | none | none |
| Tap in the ignored first 250 ms | nothing (the cast is still landing) | none | none |

All trial animation ends within 1.2 s of the tap, enforced in code, so the screen is clean before the earliest next onset (0.35 + 1.0 s).

**Payoff:** after trial 5 the lantern holds five beads. The figure lifts the rod and the lantern throws one warm beam across the water; the horizon lighthouse answers with one slow pulse and its lamp ignites for the session (`flareLighthouse`, fallback: a lantern bloom, beads dissolve into the glow). The pole swings upright and the walk begins. `success` haptic as the lighthouse ignites. Sound hook: low harmonic swell. No colour group blooms (colour stays reserved for tasks).

**Intensity:** none by design (fixed core). Only post-response decoration may differ, never anything before or at the onset.

**Reduced motion:** no hit-stop, arc, droplets or squash. The onset is the identical luminance step at the identical spot (today's 0.35 branch is removed). The response is a crossfade bloom at the float and the bead lighting on the lantern.

**Measurement (core.rt, unchanged):** 5 trials, foreperiod 1.0 to 2.5 s from trial start (the recast), window 1500 ms, first 250 ms ignored, outcomes anticipation (< 150 ms including taps before onset), hit (150 to 1000), lapse (1000 to 1500), miss (counted as lapse); `trials[]`, `median_ms`, `iqr_ms`, `lapses`, `anticipations`, `hits`, `valid`. RT = touch-down timestamp (`d.ts`) minus onset frame time. Whole screen is the target. Cap stays 24 s: initial delay goes 0.6 to 1.8 s with the demo, worst case 1.8 + 20.0 + 1.4 = 23.2 s. Data-quality fixes: remove `Au.piano(7, 0.16)` at onset (`engine.js:142`), remove the reduced-motion 0.35 flare branch, no onset haptic, one fixed stimulus for everyone tuned once to satisfy R5 in the dark-room case (identical every session, profile and clock). Proposed contract field `core.rt.stimulus = "bite/1"` to mark the baseline break (contract owner decides; until then record the switch in a Decisions row). The demo bite is never logged.

**Haptics summary:** `medium` yank, `light` catch, `tick` anticipation, `success` at the lighthouse. Nothing at onset.

**Juice checklist:** response on the touch-down frame (yes); hit-stop (yes, visual only); squash (rod, fish); particles (crown splash); empty touch answered quietly (anticipation ripple); escalation by progress only (bell steps per trial, beads); world payoff (lighthouse lights); RM variant (yes); flash guard (onset is fixed and local, payoff via guard); sprite cache (glow, droplets).

**Art**
| Asset | Size | Prompt |
|---|---|---|
| `task_reaction_float` | 512x512 | A tiny round wooden fishing float, dark wood lower half, a softly glowing warm amber bead of light on top, side view, centred, transparent background, no text. |
| `task_reaction_light_fish` | 1024x1024 | A small stylised fish made entirely of soft glowing warm amber light, translucent body, smooth rounded shape, a short soft trail of light behind the tail, no eyes, no scales, no hook, side view, transparent background, no text. |
| `task_reaction_splash_sheet` | 1536x512 | Four frames in a row of a small water splash crown made of pale silver and warm amber light droplets, growing from a flat ring to a crown to scattered droplets, side view, evenly spaced, transparent background, no text. |
| `task_reaction_bite_glow` | 1024x1024 | A soft round burst of warm white light resting on dark water with one faint ripple ring around it, centred, fading smoothly to transparent at the edges, no lens flare, transparent background. |
| `task_reaction_figure_rod` (prio B) | 1024x1024 | The same small hooded figure in a long cloak standing at the end of a short wooden pier, seen from the side facing right, holding a long thin wooden pole angled out over the water, a small glowing hand lantern hanging from the pole tip, no face visible, simple rounded shapes, transparent background. |

Code-drawn: line, ripples, beads, backplate halo, beam.

---

### 3.2 fork (measurement, slot 1): Fell or Shore

**Why today is weak:** a diagram, not a moment: two flat violet hill shapes and a draining bar ask you to tap a half of the screen under visible time pressure, then you poke 3 or 8 small dots, and the reward is a couple of 9 px glows sliding into a tray. Effort has no body and reward has no weight.

**Role models and the pattern taken**
- Monument Valley: the path is the plan; the figure steps onto each node and every stone clicks under its feet. Taken 1:1: each tapped light is a stepping stone the hooded figure hops onto, so 3 versus 8 lights are visibly 3 versus 8 steps, low versus steep.
- Journey: collected glyphs fly in arcs into the scarf, which visibly grows. Taken: each glow earned flies into the figure's scarf as one luminous band.
- Graft from Harbour Lamps (Peggle pitch ladder, normalised): step `i` of `n` maps to fraction `i / n`, so both paths climb the same arc and end on the same note and haptic; the 8-step path does not feel more complete.

**Deviations and constraints**
- No draining time bar (no pressuring timers); the 6 s choice window stays, invisible (SessionSchema fork rule).
- Monument Valley lets you pick destinations; here the next stone is fixed and appears on a schedule (contract: sequential lights, fixed gap and life).
- Figure animation never blocks input or delays the next light; hit-stop is not used at all (contract timing, `task_ms` comparability).
- No camera pan up the fell; the art is fitted to `pathPts` and `along()` (frozen hit geometry).
- Journey's scarf enables flight; ours is cosmetic, capped at 4 bands (no score, no visible tally growing without limit).
- No summit-only light shaft and no path-specific bonus of any kind (validity: the payoff may scale only with reward count). Identical cairn and fire bowl at both ends.
- Per-step juice is quiet and uniform (no embers, no sparks), so more taps do not mean more fun (validity: effort must not be intrinsically rewarding).
- No difficulty scaling (X20).

**Screen in the first second:** portrait panel, the figure with lantern at bottom centre (v 0.86) on a snowy fork. One side (random, as now): a low shoreline path along a dark frozen lake with 3 unlit stone waymarkers, ending at a small cairn with an iron fire bowl and 1 warm orb above it. Other side: a steep fell with a switchback of 8 unlit waymarkers up to an identical cairn and bowl with 2 or 3 orbs. Both endpoints are framed equally attractively (shore: a still reflection under the cairn; fell: a quiet birch pair beside it), both skies identical. Orbs bob in the same phase at 0.5 Hz with equal brightness. The figure turns its hood left, pauses, turns right (1.5 s cycle): wordless "which way?". Every informative element is drawn and tappable from frame 1 so `decision_ms` keeps its meaning.

**Loop**
- Tap a side: figure anticipation squash (0.85 x / 1.15 y, 80 ms), turns to that side, the other side fades to 25% silhouette over 0.4 s.
- Lights appear exactly per `FORK_EASY` (gap 0.55 s, life 2.6 s, hit 0.12) or `FORK_HARD` (gap 0.12 s, life 1.7 s, hit 0.1) at `along(pts, k / n)`.
- The current stone shows a small candle flame in its niche, halo breathing at 1.4 Hz. Tap it: the flame catches and the figure hops to it (0.22 s parabola). On the hard path the hop tween always retargets the latest lit stone and never queues.
- Lit stones stay lit, so a warm trail grows behind the figure: progress is height or distance.
- Expired stone: the flame shrinks to a blue-grey ember, the figure still hops on (no fail, error logged as now).
- Last stone: payoff, then round 2 after the same 1.1 s window, figure slides back to the fork (0.4 s), new random sides.
- `none` at 6 s: the figure quietly walks the shore path alone, no lights, the cairn gives its 1 orb, the round ends (X36 unchanged).

**Feedback for every touch**
| Touch | Visual | Haptic | Sound hook |
|---|---|---|---|
| Choose a side | figure squash, 6-particle snow puff at its feet, chosen path brightens 15% over 0.3 s | `medium` | snow crunch |
| Hit a light (both paths identical) | flame catches (0 to full in 120 ms), local bloom 1.4x decaying 300 ms, stone squash 0.9 y for 60 ms, figure lands with squash 1.12 x / 0.88 y and a small snow puff | `ladder(i, n)` | crunch plus soft "fwump", pitch at `i / n` of one shared arc |
| Off-target tap | a soft silver ring expands from the finger (snow dust), no colour change | `tick` | soft snow pat |
| Light expires | flame shrinks to an ember over 300 ms, figure hops on | none | none |

**Payoff (scales with reward count r only):** the walked route equalises into one continuous warm trail of the same total brightness on either path (graft from Harbour Lamps). The fire bowl ignites with one bloom (2.5x, 0.6 s, through the flash guard). Then r orbs lift off 120 ms apart and arc into the figure's scarf; each arrival adds a band, the lantern flame grows a notch, one ripple, one `medium`. So 1, 2 or 3 pulses are readable with eyes closed. The scarf persists on the walking figure for the session if `world.js` reads `A.session.scarf` (capped at 4); fallback: the existing tray. Then the normal colour stage.

**Intensity:** none (X20, `intensity: null`). Lights, gaps, lives, hit radii, geometry and payoff are frozen across sessions and modes.

**Reduced motion:** no hop arc (figure fades to the next stone in 0.15 s), no snow puffs, no squash, orbs fade into the scarf; identical timing and hit logic.

**Measurement (unchanged):** id `fork`, 2 choices, rewards 2 and 3 in random order, hard side random, easy reward 1, 6 s window, `none` gives 1 glow. `choices[]` {choice, path, reward, decision_ms, completed, task_ms}, `hard_prop`, `hard_by_reward`, `reward_slope`, `items` (lit lights), `errors` (off-target taps plus expired lights) exactly as `Record.fork` and `closeTask` compute them. `update()`, `down()`, `reward()` and the 1.1 s window are not touched. `extra` keeps `glows`, `hard_sides` and adds `fork_ui: "fell_v1"` (presentation version; pool only within a version) and optional `tap_ms[]` (light born to tap, a side metric, not scored).

**Juice checklist:** touch-down response (yes); tween (hop, fades); squash (figure, stone); particles (minimal snow only, on purpose); off-target answered quietly (yes); escalation by progress only, normalised (yes); world payoff (scarf, colour stage); RM (yes); flash guard (bowl bloom); sprite cache (yes).

**Art** (side is mirrored in code)
| Asset | Size | Prompt |
|---|---|---|
| `task_fork_fell` | 1024x1536 | A steep snowy fell rising from low ground at the bottom left to a high rounded summit at the top right, a narrow switchback footpath of flat stepping stones zigzagging up the slope, two slender bare birches near the top, deep cool blue snow shadows, nothing else, transparent background, no text. |
| `task_fork_shore` | 1024x1536 | A low gentle snowy shoreline curving beside a dark frozen lake in the lower half of the image, a short footpath of three flat stepping stones, a still faint reflection on the ice near the end of the path, empty sky above, transparent background, no text. |
| `task_fork_cairn` | 512x768 | A small stacked-stone cairn with a shallow iron fire bowl on top, bowl unlit, a little snow on the stones, side view, transparent background, no text. |
| `task_fork_waymarker_sheet` | 1024x512 | Two small Nordic stacked-stone waymarkers side by side, each with a small niche holding a candle, the left one unlit in cold grey-blue stone, the right one lit with a small warm amber flame and a soft glow on the stones, transparent background, no text. |
| `task_fork_figure_hop` (prio B) | 1024x1024 | The same small hooded figure in a long cloak seen from the side, mid-hop with knees tucked and cloak flaring, holding a lantern on a short pole, a short soft scarf trailing, no face visible, transparent background. |

Paths and lights are drawn procedurally at `along()` points; images are backdrop washes only, so hit points never depend on art alignment.

---

### 3.3 lanterns (measurement, slot 3): Lantern Release

**Why today is weak:** the 8% cue flashes for 0.4 s, then two identical static icons sit in a dark card, and a reward is a small glow that barely differs from "trial over". It reads as a lab test, and the one thing that matters, the rare warm reward, has no weight.

**Role models and the pattern taken**
- WarioWare "pick the bigger one" microgames: two objects, one brief cue, one tap, and the tap transforms the object instead of highlighting it. Taken 1:1: two lanterns, tap, the chosen one unclips and flies.
- Peggle Extreme Fever: the rare, scheduled hit gets an oversized celebration (short slow-motion beat, burst, rising swell), ordinary hits stay plain. This matches the sparse 3:1 schedule: 4 big moments in 12 trials.
- Graft from Kindle the Harbour: the ending lights everything regardless of answers, so it can never read as a score.

**Deviations and constraints**
- Panel chrome removed (`g.bare`), hit halves unchanged (v 0.12 to 0.86).
- Peggle's fever lasts 5 s with zoom; ours is 0.75 s, non-blocking, no zoom, no shake (trial timing fixed by contract; calm players must not be excited).
- WarioWare speeds up and uses a fuse; ours has fixed timing and no visible timer (contract, no pressure).
- WarioWare's one-word command becomes a wordless ghost-finger practice pair (no words).
- Reward is light, haptics and a star, never points (no scores, claims policy).
- Response juice is identical for both sides, both colours and correct or incorrect (PRT gives no accuracy feedback except the scheduled reward).

**Screen in the first second:** full-bleed harbour night. A slack rope between two pier posts across the middle; one amber-glass and one silver-glass lantern hang from it at x 0.3 and 0.7, y 0.47 (current positions), one shared sprite tinted in code, identical flame flicker seeds. Open starry sky above. Practice pair (not logged): in the first session, after a gap of more than 7 days, or when the previous session had 3 or more unanswered trials, one pair with a 30% size difference is shown and the ghost finger taps the bigger one, which unclips and floats up. Stored with `localStorage` inside try/catch; if storage fails, show the practice.

**Loop (per trial about 1.45 s, 12 trials, timings from current code)**
1. Ready, 0.32 s: a new pair slides down the rope and lands with an identical bounce (squash 0.94 then 1.0).
2. Cue, 0.4 s: both lanterns "inhale" together and one is scaled uniformly to exactly 1.08 (sprite, glow and flame together, nothing else differs); then both settle equal.
3. Response window up to 2.6 s: touch-down on a half commits; `rt` from touch-down.
4. Feedback: the chosen lantern unclips and floats up; the unchosen one is drawn up off-screen along the rope in the same frame with the same easing. Unrewarded: 0.4 s, the lantern drifts into the upper sky and dims. Scheduled reward: 0.75 s, the fever plays in the upper third.
5. No answer in 2.6 s: the pair is drawn back up unreleased. Three unanswered in a row ends the task (X36).

**Feedback for every touch**
| Touch | Visual | Haptic | Sound hook |
|---|---|---|---|
| Any response (identical every time) | squash 60 ms (1.06 x / 0.9 y), stretch 1.12 y as the hook pops, 6 embers from the hook, rise with ease-out over 1.2 s and slight sway, short flame streak; at most 6 released lanterns stay visible in the sky (older ones fade) | `light` | wooden clip tock plus breath of air, same sample both sides |
| Scheduled reward (3 rich plus 1 lean) | as the lantern passes y 0.3: animation time 0.4x for 250 ms (visual only); flame doubles; one warm bloom ring (`lantern-glow` to `lantern-amber`) grows 600 ms and is under 15% alpha by the next cue onset (1.07 s later); 24 golden embers fall like slow snow; the aurora ripples once; one star near the burst turns warm and stays; `A.session.kick(0.6)` as now | `seq`: `tick` 0, `tick` 90, `tick` 190, `medium` 320 ms | rising 3-note chord plus shimmer |
| Tap outside the halves | nothing (as now) | none | none |

Celebrations stay above y 0.3 and never overlap the cue area (y 0.3 to 0.86). Code-review checklist for the build: one sprite, identical bob phase, cue scales the whole lantern only, no extra particle or sound on the larger lantern, nothing in response juice depends on correctness.

**Payoff:** after trial 12 the released lanterns are tiny drifting lights; all warm stars plus the lantern trails link with thin gold lines into one small constellation over 1.5 s (identical shape and brightness whatever the answers, even with 0 rewards), the sky gains its next colour stage, the aurora rises (+0.3, existing tween). `g.outro = 1.5`.

**Intensity:** none (measurement, `k = null`). Stimulus and celebration are frozen in size, length and haptic pattern for every session and mode.

**Reduced motion:** no slow-motion, no embers; the released lantern crossfades upward (40 px travel); the reward is a slow 800 ms bloom plus the warm star fading in, still clearly different from nothing.

**Measurement (unchanged):** id `lanterns`, slot 3, same trial list and counts (`rich_correct`, `rich_incorrect`, `lean_correct`, `lean_incorrect`, unanswered excluded), `log_b`, `log_d`, `valid` at 10 or more answered, `rewards_rich`, `rewards_lean`. `items` = answered trials, `errors` stays as today (the orchestrator may decide separately to set it to incorrect responses; not part of this spec). `extra` adds `presentation: "release_v1"`, `reduced_motion`, `practice_shown`. Autoplay (`auto()` calls `down()`) unchanged.

**Juice checklist:** touch-down response (squash, pop); tween (rise); particles (hook embers, reward embers); no wrong state exists (by design); escalation only on the scheduled reward; world payoff (constellation, aurora); RM (yes); flash guard (reward bloom); sprite cache (yes).

**Art**
| Asset | Size | Prompt |
|---|---|---|
| `task_lanterns_pier_rope` | 1536x1024 | Two dark weathered wooden pier posts at the left and right edges with a single slack rope hanging in a gentle curve between them across the middle of the image, open empty space above, a calm dark water strip along the bottom, transparent background, no text. |
| `task_lanterns_lantern` | 1024x1024 | A single small hand lantern hanging from a short metal clip hook, rounded rectangular glass body, simple dark metal cap and base, glass rendered neutral pale grey so it can be tinted, no flame, front view, transparent background, no text. |
| `task_lanterns_flame` | 512x512 | A single soft teardrop candle flame, pale cream core fading to warm amber edges, transparent background. |
| `task_lanterns_sky_bloom` | 1024x1024 | A soft circular burst of warm golden light with very faint thin rays, fading smoothly to transparent at the edges, no hard rim, transparent background. |
| `task_lanterns_warm_star` | 256x256 | One small soft four-point star with a warm amber glow halo, transparent background. |

Embers and the practice finger are procedural (`finger()` exists).

---

### 3.4 breath (calm, rest; in the sky): Lantern Song

**Why today is weak:** a thin ring grows and shrinks on its own clock; the finger only nudges a glow alpha; nothing in the world answers your breath; there is no per-breath payoff; the single 15 ms vibrate per cycle does nothing on iPhone.

**Role models and the pattern taken**
- Journey, the song: hold and a ring of light gathers around the character; release and it leaves as an expanding ring that wakes what it passes, and what it woke stays lit. Wordless, readable in one press, never fails.
- Apple Watch Breathe: a flower of translucent petals opens on the inhale and folds on the exhale on a fixed clock, with a train of light taps during the inhale and silence on the exhale, so it works with eyes closed.
- Graft from Swan Feather: in rest, once the eyes are closed for more than 2 s, the game takes over completely (visuals fade towards minimum, the tap train carries the pace), so nothing asks for open eyes.

**Deviations and constraints**
- Journey's song is player-timed; ours runs on a fixed 4 s in / 6 s out clock (6 breaths per minute, `breath_sync` needs a fixed reference).
- Journey's charge keeps growing; ours plateaus at the top (must not invite breath holding).
- Journey's ring wakes creatures that fly; ours lights still landmarks (calm must not excite; reduced motion).
- Journey uses a button; ours is hold anywhere (touch only, one-handed in bed).
- Breathe has no input and no world; we add the held input (measurement contract) and the world reward (colour returns).
- Release timing is never visibly graded (a judged breath is a stress cue); ring size follows held share only.
- Rest dims instead of lights (rest exists to let people drift off).

**Screen in the first second:** the figure stops and lifts its lantern 3 px; the sky darkens about 10% in a soft vignette around it. Six closed petal buds sit folded around the flame. About 16 snow-light motes drift slowly in a loose circle at 3x the lantern radius. The ghost finger presses in the lower third and, as it holds, the motes visibly spiral into the flame and the petals open. Read: hold, and light comes to the lantern.

**Loop**
- Clock fixed: 4 s in, 6 s out, `--af-ease-breath`; 1 or 2 cycles in calm (engine rule unchanged), endless in rest.
- Inhale 0 to 4 s: while held, motes spiral inward, the petals open with the clock, the flame stretches up, `setBreath(b)` drives the figure's shoulders, and a thin amber arc fills with held time. Not holding: petals still open (the pacer is never hostage), motes stay put, flame stays small; nothing is taken away.
- Top at 4.0 s: petals fully open, motes freeze into a halo, one 300 ms soft bloom.
- Exhale 4 to 10 s: on release the petals fold and the song ring leaves the lantern, expanding with the exhale ease over 6 s. Its visible wavefront crosses the scene, and each landmark ignites exactly as the wavefront crosses it (not on a timer). One landmark per exhale stays lit for the rest of the session.
- Ring strength = clamp(held share of the inhale / (0.8 - 0.3k), 0.4, 1): even a sloppy breath sends a visible ring.
- Holding through the exhale: the ring waits, petals fold on the clock anyway, the ring leaves smaller when you let go.
- Landmarks: `A.World.hooks.landmarks()` returns screen points of the visible biome. v1 hard-codes 3 for the sauna biome (sauna window warms, birch frost glints, chimney sparks brighten) and falls back to 3 fixed sky glints elsewhere. v2 adds the lake ice line, shore lantern and harbour rope lights.

**Feedback for every touch**
| Touch | Visual | Haptic | Sound hook |
|---|---|---|---|
| Touch down | soft bloom at the lantern (the finger is a remote, nothing under the thumb), flame squash 0.92 for 120 ms then stretch to 1.25 h / 0.9 w over the inhale | `tick` | breath of wind starts |
| Holding in the inhale | motes spiral in (2 to 3 px `lighter` dots with a 4-frame streak, max 24) | `tick` at 0, 1, 2, 3 s of the inhale (1 Hz, independent of touch, Breathe train) | rising wind pad tied to `Au.padLevel(b)` |
| Top | petal rims brighten 300 ms, motes hold | `light` | one soft low bell |
| Release | ring leaves; landmarks light with a 600 ms ease-in glow, never a flash, within R5 | none (exhale silence) | long chord swell; each landmark one pentatonic chime in its own pitch |
| Release early or late | same ring (only strength from held share); timing logged in `extra` only | none | same |

One bloom event per 10 s cycle, so nothing approaches 3 Hz. Colours: amber flame, flame-white motes, the ring shifts from amber to aurora green as the session's colour returns.

**Payoff:** on the last exhale the ring reaches the horizon and the aurora answers: the existing aurora tween (+0.3) and colour bloom fire as the wavefront arrives, so the colour return is visibly caused by your breath. Lit landmarks stay for the session. `g.outro = 1.2` so the last ring finishes. Rest: the last ring leaves the harbour into starlight, then dawn or `fell_asleep` as now.

**Intensity (assist only, pace never changes):** calm `k` rises with arousal, so higher `k` gives more assist and more to look at: full ring from less hold (formula above), motes 16 + 8k. Logging window for early or late release fixed at plus or minus 1.0 s (extra only). Rest uses `k = 0.5`, motes capped at 16.

**Rest variant (v1):** deep blue ring, scene dims about 8% per cycle to a floor, no landmark lighting. v2: each exhale puts out one lit harbour window and a star appears in its place. Eyes closed for more than 2 s: visuals fade to minimum, tap train continues.

**Reduced motion:** motes 8, drift under 0.2 screen per second, the expanding ring becomes a slow crossfade of the lit region, petals still scale (essential pacer, slow), no streaks.

**Measurement (unchanged):** same id and frame counting. `items` = cycles with held share of inhale frames at least 0.35 (`BREATH_ENGAGED`), `breath_sync` = 0.5 x (held share of inhale + released share of exhale), `eyes_closed_s` from `record.js`, `errors` 0. `engaged()`, `close()`, endless rest and the 1-cycle short version unchanged. `extra` adds `ring_strength_mean`, `early_releases`, `late_releases`, `landmarks_lit`.

**Haptics summary:** inhale train `tick` x 4 per cycle, `light` at the top, silence on the exhale, `tick` on touch-down. Replaces `A.session.haptic()` per cycle.

**Juice checklist:** touch-down response (bloom, squash); tween (petals, ring); particles (motes); no wrong input exists; escalation by the clock and by landmarks lit; world payoff (landmarks, aurora); RM (yes); flash guard (landmark glows in dark room); sprite cache (ring is one cached sprite drawn scaled, motes cached).

**Art**
| Asset | Size | Prompt |
|---|---|---|
| `task_breath_petals_open` | 1024x1024 | Six overlapping translucent watercolour petals arranged in a circle like an opening flower seen from the front, pale warm amber at the centre fading to soft teal at the tips, glowing edges, very soft, transparent background, no text. |
| `task_breath_petals_bud` | 512x512 | Six translucent watercolour petals folded tightly into a small closed bud around a point of warm light, pale amber and soft teal, transparent background. |
| `task_breath_mote` | 64x64 | A tiny soft speck of warm white light with a faint halo, like a snow crystal catching lantern light, transparent background. |
| `task_breath_ring` | 1024x1024 | A thin soft ring of pale gold light painted in watercolour, slightly uneven brush edge, faint inner glow, empty transparent centre, transparent background. |
| `task_breath_ring_night` | 1024x1024 | A thin soft ring of deep night-blue light in watercolour, soft uneven edge, empty transparent centre, transparent background. |
| `task_breath_frost_glints` | 1024x512 | Frost sparkle along the tips of bare birch branches, tiny cold-white glints only, no trunks, transparent background. |
| `task_breath_window_warm` | 512x512 | The warm amber glow of a small square sauna window in a dark log wall, soft bloom spilling outwards, no frame detail, transparent background. |
| `task_breath_harbour_windows` (v2) | 1536x512 | A strip of small harbour house silhouettes at night with small square windows, half of them lit warm amber, half dark, Finnish harbour, transparent background. |

---

### 3.5 loyly (calm): Silk Pour

**Why today is weak:** a progress bar wearing a ladle: a straight-line drag whose only guide is a visible 2 s countdown ring, a hidden speed rule you learn by splashing, one generic steam gradient, no haptics, and `make()` ignores intensity.

**Role models and the pattern taken**
- Cooking Mama pour and drizzle steps: the household gesture is the control, the vessel follows the finger and the stream width is a direct, visible function of hand speed, so the liquid itself teaches "slowly", with no text and no meter.
- Flower: a continuous gesture gets a continuous world response; every target touched blooms and plays the next note; a big bloom follows when the field is done. Nothing can be failed.
- Graft from Long Loyly (Stardew watering-can preview): stones that have warmed stay lit, so the bed itself previews how big the loyly will be.

**Deviations and constraints**
- Cooking Mama's scores, fail flame and timer are removed (no scores, no fail, no pressuring timers); today's countdown ring is removed.
- Flower is steered by tilt; ours is a one-finger drag (touch only, in bed).
- Flower's camera flight and wind are dropped; the bloom is steam and warm fog (60 fps, calm must not excite).
- Flower's ascending scale becomes level or descending notes per stone (calm must not build).
- The fast pour must look duller than the slow pour, never more spectacular (otherwise players splash on purpose and errors fill with play).

**Screen in the first second:** the warm dark-glass panel. Left: a wooden bucket with a ladle standing in it, one slow highlight on the water. Right: the kiuas, 7 to 11 dark round stones on a stove whose embers breathe amber underneath, one thin wisp rising. The ghost finger (after 0.6 s without touch, as now) lifts the ladle and draws a slow dotted arc along the stones.

**Loop**
1. Touch the ladle (70 U hitbox or anywhere near the bucket): it lifts with water sloshing in its bowl.
2. Carry right: the ladle hangs on a critically damped spring 0.08 to 0.16 s behind the finger and leans into the motion (rotation = -velocity x 0.02, clamped 0.15 rad), so it feels heavy and full.
3. Over the bed the bowl tilts and a thin stream falls. Each stone crossed below the speed threshold (bed width / bloom_s, smoothed over 150 ms) hisses and warms and stays warm. Crossed too fast: the stream thins to a quick grey spit, 2 or 3 droplets fall straight down, the stone stays dark.
4. Reaching the far end of the bed ends the pour. Slow pour: the loyly bloom. Rushed pour: a small puff, nothing taken away, the next pour opens sooner.
5. The ladle swings home on its own (0.8 s); a new pour opens when steam is below 0.6. Need: 2 pours at every `k`. Lifting mid-carry cancels with no log (as today); either sweep direction is accepted; the bed spans at most 45% of the panel width.

**Feedback for every touch**
| Touch | Visual | Haptic | Sound hook |
|---|---|---|---|
| Grab | ladle lifts 6 U with squash (0.92, 1.06, 1 over 180 ms), bowl water sloshes 2 damped cycles, one ripple on the bucket | `light` | wood knock plus drip |
| Carry | drips from the bowl lip every 0.4 s with a 3-particle micro splash; spring lag and lean | none | faint slosh |
| Stone crossed slowly | stone lerps from stone grey to ember-lit amber over 0.35 s and stays (a monotonic rise, never on and off); embers flare once under it; 3 steam puffs rise | `tick` (spaced by the player's own slowness, at most about 3 per second) | sizzle plus a note that stays level or steps down |
| Stone crossed fast | thin grey spit, 2 or 3 droplets straight down, no arcs, no darkening | none | short dull tsk |
| Release mid-carry | ladle swings home softly | none | none |

**Payoff:** each slow pour: all puffs merge into one cloud sprite that scales up to fill the panel ceiling, a warm flame-tinted fog rises over the glass to alpha 0.22 over 1.2 s, the stove embers settle one step brighter, `A.session.kick(0.5)` as now, and the world sauna window brightens one step if `lightLandmark` exists. Bloom size scales with pour duration up to bloom_s, so slower is always nicer. Haptic: `medium` then `seq` decaying (`light` 40, `tick` 100, `tick` 180). Final pour: the fog holds 1.5 s and lifts from the bottom like a curtain, revealing every warmed stone glowing; panel closes, warm yellow colour returns. `g.outro = 1.5`. Sound hook: pssshhh plus low pad swell, the hiss tail fading into the calm pad.

**Intensity (calm: more stillness, never more speed):** item threshold stays 2.0 s (`SLOW`, meaning unchanged). bloom_s = 2.0 + 1.5k sets the speed at which stones warm and the size of the full bloom. Bed 7 + round(4k) stones (a slow sweep is physically longer). Ladle lag 0.08 to 0.16 s (a heavier ladle invites a slower hand). Steam decay 0.25 to 0.15 per second. Ghost cue speed matches bloom_s. Need stays 2.

**Reduced motion:** steam becomes opacity-only fades with no sway, no drips, no squash, the ladle follows without lag; every haptic stays.

**Measurement (unchanged meaning):** `items` = completed pours with duration from grab to the end of the bed at least 2.0 s; `errors` = completed pours under 2.0 s; cancelled carries not logged. Duration on the raw finger, never the lagging ladle. Note: a pour now ends at the far edge of the bed instead of at the first stone, so `extra.v = 2` and a Decisions row. `extra`: `v`, `bloom_s`, `pour_s[]`, `stones_warmed[]`, `stones_total`, `finger_speed_cv` (sweep speed variability over a 150 ms window, exploratory). Autoplay: grab, then sweep at bloom_s + 0.4 s.

**Juice checklist:** touch-down response (lift, slosh); tween (spring ladle); squash (ladle); particles (drips, puffs, embers); fast pass answered neutrally and duller (yes); escalation by progress (warm stones) not streaks; world payoff (sauna window, warm yellow); RM (yes); flash guard (fog is a slow rise); sprite cache (puff, fog, glow, replacing per-particle gradients).

**Art**
| Asset | Size | Prompt |
|---|---|---|
| `task_loyly_ladle` | 1024x512 | A traditional Finnish wooden sauna ladle with a long slender birch handle and a deep round carved bowl, warm honey-brown wood, side view tilted slightly towards the viewer, nothing else, transparent background, no text. |
| `task_loyly_bucket` | 1024x1024 | A small wooden sauna bucket with vertical staves and two dark metal bands, filled to the brim with calm dark teal water reflecting one soft highlight, side view, nothing else, transparent background. |
| `task_loyly_kiuas` | 1536x1024 | A low dark iron sauna stove seen from the side, a small open grate with glowing amber embers below, an empty flat top where stones will sit, warm light from below, soft shadows, transparent background, no text. |
| `task_loyly_steam_puff` | 512x512 | A single soft round puff of white steam in watercolour, feathered edges fading to fully transparent, no hard outline, transparent background. |
| `task_loyly_panel_fog` | 1024x1024 | A soft warm condensation fog texture, faint flame-cream colour with tiny scattered droplets, densest at the top and fading to transparent at the bottom, tileable, transparent background. |

Stones are procedural discs (stone grey lerped to amber) in v1; a stone sheet is not needed.

---

### 3.6 threads (flow): Aurora Loom

**Why today is weak:** faint guide ribbons already draw every answer, so threads is three identical straight drags with no decision, `make()` ignores `k`, there is no haptic, and the only payoff is a line getting brighter.

**Role models and the pattern taken**
- Flow Free: 1:1 core. Square grid, pairs of same-coloured endpoints; drag from an endpoint cell by cell (orthogonal only) to draw a fat rounded pipe; pipes may not cross; dragging through another pipe cuts it back at that cell; lifting mid-board leaves the partial pipe so you resume from its loose end; the cell behind a pipe tints in its colour; a pair is done when its pipe reaches the twin; solved when all pairs are joined.
- Monument Valley: the wordless solve. On the last join a resonant click, a settling overshoot, and the whole structure rings with light in sequence.
- Graft from Star Chain (Dots): the line leads slightly ahead of the finger and every new cell steps the start knot's brightness up, so length reads as charge building even with sound off.

**Deviations and constraints**
- No "fill every cell" requirement and no move counter (no fail states, no scores); full coverage is a silent bonus.
- One glyph shape per colour (circle, diamond, four-point star, ring, drop) so it reads colour-blind without letters (wordless).
- 5x5 grid with cells of at least 52 pt (one-handed in bed); no 6x6.
- Hint shimmer after 6 s with zero progress, auto-solve at max (no fail states, session under 2:00).
- No cut flash; a cut recoils and dims (no red, calm feedback).
- Palette limited to tokens: aurora-green, lantern-amber, violet-200, aurora-ice, silver-100.

**Screen in the first second:** the panel shows a birch-frame loom with a 5x5 grid of faint pegs (silver-600 at 25%) and 3 or 4 pairs of glowing knots, each pair one colour and one glyph, breathing slowly (0.4 Hz, scale 1.0 to 1.06). No guide ribbons. At 0.6 s without touch, `dragCue` draws the shortest pair's path cell by cell and the pipe appears behind it.

**Loop:** touch a knot, drag through empty cells to its twin, release; pick the next pair. The decision is routing: which pair first, which way around so the others still fit. Every authored puzzle is built so the naive direct path of at least one pair is wrong (the Flow Free "aha"). 3 pairs take about 6 to 9 s, 4 pairs about 10 to 14 s. A cut pipe recoils and can be redrawn. After 6 s with no progress, the stored solution of one unjoined pair shimmers once along its cells (1 s sweep). Ends when all pairs are joined; at max (16 s) `auto()` plays the stored solutions at 12 cells per second.

**Feedback for every touch**
| Touch | Visual | Haptic | Sound hook |
|---|---|---|---|
| Touch a knot | knot squash 0.85 then spring to 1.3 (120 ms), one soft ripple (300 ms), its cell tints to 18% | `light` | soft pluck |
| Enter a cell | pipe extends with a rounded cap 1 cell ahead of the finger that settles (spring 80 ms); cell tint fades in over 150 ms; start knot 5% brighter per cell | `tick` (rate cap 70 ms) | pluck one pentatonic step up per cell, reset per pipe |
| Cut another pipe | cut part recoils elastically to its own knot (200 ms), that knot dims to 60% for 0.5 s; no shake, no colour shift | `seq`: `tick` 0, `tick` 40 | lower soft double pluck |
| Join the twin | both knots click (1.45 then one overshoot), a bead of light runs the pipe in 300 ms, the pipe gains the triple-stroke glow and a slow shimmer (0.3 Hz luminance travel) | `medium` | two-note chime in that colour |
| Release on an empty cell | loose end keeps a breathing glow inviting continuation | none | none |
| Release on a wrong knot | the pipe end wobbles once and stays, the wrong knot does not react | `tick` | muted pluck |

**Payoff:** on the last join, 250 ms stillness, then each pipe lights end to end in sequence (180 ms stagger, its chime), the loom settles once (scale 1.0 to 1.02 to 1.0 over 600 ms), then the pipes peel off keeping the exact shapes drawn and float up out of the panel top into the sky band, where they fade into the aurora (v1: panel-space animation drawn over the world; v2: `addSkyMark('aurora_strand', ...)` keeps them as that night's strands). Full coverage adds one slow shimmer wave before the lift; no number, no star. Haptic `seq`: `light` 0, `medium` 90, `heavy` 180. Sound hook: chimes resolve into one chord, then the aurora pad. `g.outro = 1.8`.

**Intensity (flow sits at about 0.25 to 0.5):** always 5x5. `k` below 0.35: 3 pairs, short paths. `k` 0.35 and above: 4 pairs. Puzzle bank: 6 hand-made puzzles per pair count (12 in total), each with its full solution stored, randomly rotated or mirrored (8 symmetries) and colour-permuted, so always solvable and never visibly repeated. Hint and auto both replay the stored solution.

**Reduced motion:** no recoil spring (the cut part fades back), no peel-off flight (pipes crossfade into the aurora band), no grid settle, the shimmer becomes a static brighter stroke.

**Measurement:** same id `threads`. `items` = pairs joined (counted once per pair, the first time it connects). `errors` = wrong-end releases plus cuts (the mismatched-connection meaning of today's wrong drop; loose releases are the intended Flow Free style and are not errors, so the engine's errors > 2 rule does not misfire). `extra`: `v: 2`, `loose_releases`, `wrong_end`, `cuts`, `pairs`, `grid`, `puzzle_id`, `path_efficiency` (sum of shortest paths / cells drawn), `fill_ratio`, `first_touch_ms`, `median_cell_ms` (exploratory), `hints_shown`. Decisions row: threads v2 is a task version change for the hub.

**Juice checklist:** touch-down response (knot squash); tween (cap spring, recoil); particles (minimal, light bead); wrong touches answered quietly (wobble, recoil); escalation by progress (knot brightness per cell, pipes joined); world payoff (aurora in the shape you drew); RM (yes); flash guard (sequence light-up is staggered and local); sprite cache (peg layer on an offscreen canvas, knot sprites per colour).

**Art**
| Asset | Size | Prompt |
|---|---|---|
| `task_threads_loom_frame` | 1024x1024 | A square weaving frame made of pale birch wood seen straight from the front, simple rounded corners, a thin inner border, the centre empty and transparent, soft watercolour texture, no pegs, no threads, transparent background, no text. |
| `task_threads_knot_glyphs` | 1536x512 | Five small glowing knots of light in a row, each a different simple shape: circle, diamond, four-point star, ring, droplet, all pure white with a soft glow so they can be tinted in code, evenly spaced, transparent background, no text. |
| `task_threads_aurora_strand` | 1024x256 | One thin flowing ribbon of northern light, horizontal, soft feathered edges, pure white luminous core fading outwards, for tinting in code, transparent background. |

Pegs, pipes and cell tints are procedural.

---

### 3.7 stars (flow): Joutsen (Star Thread)

**Why today is weak:** five static silver dots whose smallest sizes (3 vs 5 px) are hard to tell apart from a pillow, an order you have to guess, a short line and a piano note as the only feedback; the hand feels nothing, nothing escalates, and the constellation never becomes anything.

**Role models and the pattern taken**
- Two Dots: touch a dot and drag; a straight line rubber-bands from the last linked dot to the fingertip, snaps into each valid dot entered, every link pops the dot with a squash and plays the next note of a rising ladder; one continuous drag for the chain.
- Okami constellation sequences: an unfinished constellation hangs in the sky with the faint figure of an animal behind it; completing it draws the line art into a luminous creature that comes alive and leaves the sky.
- Threes (intro): the board deals its pieces in order, which shows the sort axis before the first move. Taken: stars pop in from smallest to largest when the panel opens, so "small to large" is shown, not explained.
- Graft from Kointahti (Flower, "the world answers you"): each link brightens the world stars around the panel one notch.

**Deviations and constraints**
- Two Dots commits or clears on release; here the chain persists across lifts (no fail states; a hand lying in bed slips).
- Grid adjacency and colour rule become free-placed stars ordered by size (measurement: the logged meaning is size order).
- Moves, score and goals removed (no scores, no pressure).
- Two Dots snaps only to valid dots; our magnet leans toward every unlit star equally and the commit decides (assistance must not leak the answer).
- Okami's brush gauge and power reward are dropped; the stars are given, the verb is the connecting drag, the reward is atmospheric (one verb in 1 s; colour as reward).
- Size is never colour-coded (the size judgement must stay the player's).

**Screen in the first second:** the panel opens (area about [1.0, 0.46]) on a deep indigo watercolour sky patch. Stars pop in one by one from smallest to largest (90 ms stagger, each with a tiny squash), with obvious size steps; every hit area at least 44 pt. Behind them, at 8% alpha, the faint gold line drawing of a whooper swan in flight. If nobody touches by 1.0 s, the ghost finger traces star 1 to 2 to 3.

**Loop:** touch near a star. If it is the smallest unlit one it pops alight and a glowing thread is born, ending at the fingertip. Drag: the thread is a rubber band from the last linked star to the finger, brighter and thinner as it stretches. Near any unlit star the end leans toward it (same for all). Entering the hit radius of the correct next star commits the link: snap, lock, new rubber band. Over a wrong star the thread passes through; lifting on it, tapping it, or resting on it for 180 ms or more is a selection: it softly declines (wobble, dim to 70%) and the correct next star breathes one warm glow (0 to 35% to 0 over 0.8 s). Lifting mid-chain: the end recoils into the last linked star (10% overshoot) and you continue with a drag or a tap. Typical run 6 to 10 s.

**Feedback for every touch**
| Touch | Visual | Haptic | Sound hook |
|---|---|---|---|
| Touch down anywhere | soft flame halo under the finger, zero latency | none (haptics are saved for meaning) | none |
| First star lit | squash 0.8, 1.18, 1.0 in 0.25 s, ring ripple 1.5x to 4x radius over 0.4 s, 10 gold sparks with drag | `light` | note 1 of a major pentatonic |
| Dragging | three-stroke glow line (9 / 4 / 1.6 px, `lighter`), about 15 motes per second floating up 20 px | none | glass hum rising with stretch |
| Correct link | end snaps in 60 ms, a light wave runs the new segment in 0.2 s, new star squashes and blooms (glow x3 over 0.3 s), sparks 8 + 2 x link index; ghost swan +15% alpha; world stars one notch brighter | `light` for links 2 and 3, `medium` after | next note up |
| Wrong star selected | wobble and dim, correct star breathes once | none | muted wooden tick, never dissonant |
| Lift mid-chain | elastic recoil into the last star | none | soft pluck |
| Last link | 120 ms hit-stop (visual), lines thicken 1.6 to 3 px, the swan line art draws itself along the stars in 0.9 s, wings beat once | `success` | soft rising chord |

Link blooms are capped at 3 per second (visual only); the completion bloom is the only panel-wide brightening.

**Payoff:** the swan lifts off and flies a 1.6 s ease-in-out arc into the world sky trailing 20 motes, settling as a constellation at 50% alpha (`addSkyMark('swan', x, y)`; fallback: it fades upward out of the panel). Its landing triggers the colour return. `g.outro = 2.0`. Timeout: remaining links draw themselves (0.4 s each), the swan still flies, smaller and dimmer.

**Intensity (flow):** n = 4 + round(3k); neighbour size ratio from 1.6 (k 0) to 1.22 (k 1); magnet radius 1.8x to 1.3x; above k 0.6, 3 to 6 tiny non-interactive background stars (smaller than the smallest interactive star, no hit area). The swan figure has 7 anchor points in priority order; the first n are used, and which anchor gets which size is randomised every session (so positions are never memorised instead of sizes). v2: more figures (eagle-owl, fire fox, Otava bear), rotated per session.

**Calm variant (only if the orchestrator approves a calm arm):** n 5, ratio 1.5, thread lag 0 to 0.18 s with `k`, sparks halved and slower, `light` haptics only, swan glides 2.4 s; errors only on tap or lift, dwell raised to 400 ms.

**Reduced motion:** no flight (the swan fades into its sky position over 0.8 s), no pop-in squash (stars fade in small to large), sparks under 0.2 screen per second, no wobble (dim only), no ripples.

**Measurement (unchanged meaning):** id `stars`. `items` = stars linked in correct ascending size order. `errors` = out-of-order selections (a tap on, a lift on, or a dwell of 180 ms or more on a wrong unlit star; the same star counts again only after the finger has left it). Passing over a wrong star is logged in `extra` only. `extra`: `n_stars`, `size_ratio`, `figure`, `input` (drag, tap, mixed), `link_ms[]`, `first_touch_ms`, `lifts`, `passes`, `wrong_rank_gap[]`. Timeout keeps `completed_by: auto`.

**Juice checklist:** touch-down response (halo); tween (rubber band, recoil); squash (stars); particles (sparks, motes); wrong selection answered quietly; escalation by link index; world payoff (swan constellation); RM (yes); flash guard (bloom cap); sprite cache (yes).

**Art**
| Asset | Size | Prompt |
|---|---|---|
| `task_stars_sky` | 1024x512 | A deep night sky over the tops of a Finnish birch forest, indigo fading to near black, soft watercolour wash, very faint diagonal milky-way haze, no stars, no moon, no text. |
| `task_stars_star` | 256x256 | A single soft star glow, white-silver core fading to transparent, four thin diffraction spikes, gentle watercolour bloom, transparent background. |
| `task_stars_swan_line` | 1024x1024 | One continuous thin glowing gold brush line drawing of a whooper swan in flight, wings fully spread, neck stretched forward, no fill, like a figure on an old hand-drawn star chart, minimal, transparent background, no text. |
| `task_stars_swan_line_b` | 1024x1024 | The same thin glowing gold line drawing of the whooper swan in flight with its wings lowered in a downbeat, same style and scale, transparent background, no text. |

v1 draws the swan as a procedural polyline through its anchors; the images replace it only once the anchors are matched in code.

---

### 3.8 fireflies (wake): Firefly Fling

**Why today is weak:** 5 to 8 small dots ping-pong in straight lines, a tap gives one quiet note and nothing at the finger, a miss vanishes silently, there is no tempo, build-up or climax, and on the iPhone there are no haptics at all.

**Role models and the pattern taken**
- Fruit Ninja, Zen mode: targets are lobbed up in parabolic volleys, decelerate and hang at the apex, then fall back; one stroke leaves a glowing blade trail and anything it crosses reacts instantly; several in one stroke is a combo; Zen has no bombs and no lives. Taken 1:1: lob, hang, fall arcs, volley rhythm, stroke trail, multi-catch, no-bomb rules.
- Vampire Survivors: pickups fly to the collector on an accelerating magnet curve and each landing plays a pitch-stepped chime; the vacuum pulls everything in at once as the big payoff.
- Graft from Firefly Chorus (synchronous fireflies, Photinus carolinus): fireflies in the jar slowly fall into a shared glow rhythm, a steady unison breathing (not blinking) at half the beat with at most 15% luminance swing.

**Deviations and constraints**
- No slicing, splitting or splatter; we gather living lights (tone, claims policy).
- No bombs, lives, combo counter, score or "Critical" text (no fail, no numbers, no words).
- Targets are tossed from the reeds inside the panel, not from off-screen (panel task).
- Catchable only around the apex, visibly dimmer outside it (otherwise one long scribble gathers everything and the task and its errors evaporate).
- No full-screen flash (3 Hz rule); Zen's 90 s becomes 12 to 15 s (session under 2:00).
- Volleys sync to the mode beat, which Fruit Ninja does not do (wake tasks must carry tempo).
- The vacuum haptic is thinned to 4 ticks plus one impact (a 16 Hz buzz would be harsh).

**Screen in the first second:** the panel bottom is a dark band of frosted reeds at the lake edge with an open glass jar in the middle, lid glowing faintly. At 0.25 s the reeds shiver (a 2 px sway wave) and two fireflies are tossed up on crossing arcs; they climb, slow, and hang at about 60% of panel height for 0.8 s, brightest at the apex, then drift back. No touch by 1.2 s: `dragCue` brushes through both apexes.

**Loop:** volleys land on the bar of the beat clock (`bpm = min(96, MODES[mode].tempo + 20k)`, fallback fixed interval). Pattern over 12 to 15 s: 2, 2, 3, 3, 4, 4, alternating left-to-right and right-to-left so the gaze sweeps and lifts. A firefly is catchable from 30% of its rise until it falls below 30% again; outside that band it is dim and the trail passes through it. Untouched fireflies fall back and are re-tossed later. One gesture (down to up) can gather many. Trail speed is capped (beyond the cap the trail lags and thins), so aimed strokes beat scribbles. Finishes on the n-th catch, n = 5 + round(3k), as today. Autoplay: a stroke through the next apex every 0.7 to 1.1 s.

**Feedback for every touch**
| Touch | Visual | Haptic | Sound hook |
|---|---|---|---|
| Any stroke | ribbon of light (12 points, 10 px tapering to 0, flame-white head, fading over 180 ms) | none | soft air whoosh by speed |
| Catch | 40 ms hit-stop on that firefly only, squash 1.4 x / 0.7 y then 1.15 and settle (220 ms), 8 to 12 sparks (aurora green and flame, 350 ms), local bloom 24 to 64 px; sticks to the trail 80 ms, then flies to the jar on a magnet curve (`inQuad`, 0.45 s) | `light` | chime quantised to the 16th grid |
| Each further catch in the same stroke | pitch one step up, trail +3 px and warmer (silver-white to lantern amber) | another `light` 50 ms later (rate-capped) | next step up |
| 3 or more in one stroke | a soft ring wave across the panel (flash guard), the jar lid puffs light | `medium` | jar bowl tone |
| Landing in the jar | jar squash 1.06, one glow step up, border warms a notch | none | glass clink |
| Empty stroke | the trail simply fades | none | none |

Caps: 6 airborne fireflies, 80 particles. Hit tests are segment-to-circle between successive pointer samples.

**Payoff:** on the n-th catch, 120 ms hit-stop on everything, then the vacuum: every firefly still in the air is pulled into the jar in a rising chime cascade. The jar fills to full glow, the lid lifts and a soft column of green-white light rises out of the panel top; the fireflies stream up it into the sky (v1 inside the panel, v2 `addSkyMark('sparks', ...)` over the lake for the session). Then the colour bloom and the wake ice glow. Haptic: `seq` `tick` 0, 60, 120, 180, then `medium` 260. `g.outro = 1.5`.

**Intensity:** k 0: volley every 4 beats, 1 to 2 per volley, apex at 50% height, hang 0.9 s, catch radius 0.13 panel units plus trail width. k 1: volley every 2 beats, 3 to 4, apex up to 78%, hang 0.5 s, staggered launches (second firefly 1 beat later), radius 0.10. Target n unchanged.

**Reduced motion:** arcs at half height and speed (all motion under 0.2 screen per second), no sway wave, trail 4 points, no hit-stop or squash (brightness pop instead), jar flight is a 300 ms crossfade, no ring wave.

**Measurement (unchanged):** id `fireflies`. `items` = fireflies gathered (finish rule unchanged). `errors` = gestures that gathered nothing (today's empty tap is the zero-length case). `extra`: `gestures`, `multi_max`, `catch_latency_ms_median` (launch to catch), `apex_offset_ms_median` (signed), `relaunches`, `volleys`, `passes_dim` (strokes through non-catchable fireflies). Max 12 s may rise to 15 s.

**Mode note:** wake only. Adding fatigue would add a bandit arm and is an orchestrator decision (if added: daylight palette, amber-gold motes with a dark core for contrast, start at the k 0.5 volley rate).

**Juice checklist:** touch-down response (trail); tween (magnet curve); squash (firefly, jar); particles (sparks, stream); empty stroke answered quietly; escalation by multi-catch within a stroke and by jar fill (no cross-stroke streak); world payoff (column, sparks in the sky); RM (yes); flash guard (ring wave, column); sprite cache (glow and spark sprites, replaces per-firefly gradients).

**Art**
| Asset | Size | Prompt |
|---|---|---|
| `task_fireflies_firefly_sheet` | 512x128 | Four frames in a row of a single tiny firefly seen from the side, small soft dark body, two delicate translucent wings in different flutter positions, the tail segment glowing soft yellow-green, no glow halo, evenly spaced, transparent background, no text. |
| `task_fireflies_jar` | 1024x1024 | A small old glass preserving jar with an open wire-bail lid, empty, slightly blue glass with soft highlights on the left, isolated, transparent background, no text. |
| `task_fireflies_reeds` | 1536x512 | A dark strip of frosted reeds and winter grasses with pale frost tips, lake ice just visible behind, horizontally tileable, transparent background. |
| `task_fireflies_light_column` | 512x1536 | A soft vertical column of pale green-white light rising and widening upwards, fading to transparent at the top and edges, transparent background. |

Halo, sparks, trail and rings are procedural.

---

### 3.9 beacon (wake, fatigue): Harbour Beat

**Why today is weak:** a waiting game: three taps in 13 s after 1.5 to 5 s of idle watching each; the beam slides with no tempo, so there is no rhythm, build or anticipation, one bell per hit, and it duplicates the core reaction task.

**Role models and the pattern taken**
- Rhythm Heaven (Karate Man and remix stages): one input on the beat; the object comes in with a telegraph that says exactly when it lands; a count-in starts the stage; every hit plays the same satisfying reaction; a miss plays a harmless alternate and the song never stops. The metronome is part of the scene.
- osu! approach circle: a ring shrinks onto the target and closes exactly at the hit time; readable without words, even with sound off.
- Graft from Swell Sweep (Flower): lit boats sail home in a procession, each lamp reflected as a vertical shimmer, so you literally guide them home.

**Deviations and constraints**
- Tap anywhere instead of on the circle (one-handed, thumb reach); the ring is only a timing cue.
- No accuracy words, grades, perfect tier or combo counter, and no streak escalation; the build is tied to chart position (boats lit so far), never to consecutive hits (no scores, no streaks, wordless).
- A missed cue never plays a failure gag; the boat is guided home softly by the lingering beam (no fail, no red).
- Tempo capped at 96 bpm, windows about twice Rhythm Heaven's (activate without harshness; touchscreen latency).
- The beat is carried by the pendulum and a haptic count-in until sound exists (sound later).
- No double-lamp boats and no in-task chart rewriting (too fiddly lying in bed; scope).
- Landing pools fade instead of flashing; beat visuals at or below 1.6 Hz.

**Screen in the first second:** dark navy sea in the panel. A white lighthouse with two slate-blue bands on a black rock in the centre. Its beam already swings like a pendulum, eased so it lingers at each end, and leaves a soft light pool at the left catch point (u 0.22) and the right catch point (u 0.78) on every beat. Two `light` haptic ticks mark count-in beats 1 and 2. A small dark boat glides in from the right with its lamp dark, and a thin silver ring around the lamp shrinks so it closes on beat 3, exactly when the beam lands on it. Cue only: beam plus ring; the boat stays dark until hit. `tapCue` appears only if the first two boats pass without a tap.

**Loop:** fixed chart of about 14 s generated at `make(k)` as a list of beat indices; each boat is spawned from the beat it must land on. The beam lands left on odd beats, right on even beats. Tap on that beat: the beam catches the boat, its lamp ignites, it turns and motors to the pier below the lighthouse, and one pier lantern lights per boat (diegetic progress replacing dots). An untapped boat is lit softly by the lingering beam and drifts home. The chart always plays to the end, then the ferry.

**Feedback for every touch**
| Touch | Visual | Haptic | Sound hook |
|---|---|---|---|
| Tap inside a boat's window | beam hit-stops on the boat 120 ms (visual), lamp ignites (white core 0 to 1 in 60 ms, amber bloom overshoot 1.25x then 1x over 250 ms), hull squash 1.12 x / 0.88 y for 70 ms, mast whips 6 degrees, 10 to 14 amber sparks along the beam direction (0.5 s), 3 elliptical wake rings, light wake line to the pier; beam warmth and bloom size rise with chart position (boat i of n) | `light` | bell one pentatonic step up per boat in chart order |
| Tap near a boat but outside its window | 3 px beam wobble, light pool dims 20% for 200 ms; never red, never an X | none | soft wooden tok |
| Tap on an empty beat | the light pool under the beam brightens slightly once (a harmless answer) | none | soft tick |
| No tap for a boat | boat lit softly, drifts home | none | none |
| Count-in | pendulum lands, light pools | `light` on beats 1 and 2 | woodblock per beat (the first sound to ship) |

**Payoff:** the last chart item is a small island ferry with a 2-beat telegraph and a larger ring. On the hit: 180 ms hit-stop, the beam widens, the ferry docks, the pier lanterns relight in a left-to-right cascade (110 ms apart, each lamp lights once at a distinct position, no strobe) with shimmering reflections; the lit boats sit in a row at the pier. The horizon lighthouse flares and stays brighter for the session (`flareLighthouse`), then the colour group blooms. Untapped ferry: the beam settles on it and it docks anyway, softer. Haptic `success`. `g.outro = 1.2`.

**Intensity:** bpm = min(96, MODES[mode].tempo + 20k) (wake 76 to 96, fatigue 84 to 96). Boats = 6 + round(4k). One boat every 2 beats at k below 0.5; from k 0.5 some consecutive boats on consecutive beats on alternating sides. Window plus or minus 180 ms at k 0 to 120 ms at k 1. Ring telegraph 2 beats at k 0, 1 beat at k 1. Chart length about 13.5 to 14.5 s at every k (minS 12, max 16).

**Reduced motion:** the pendulum still moves (it is the beat); no hit-stop, wobble, squash or particles; ignition is a 200 ms fade; rings shrink at lower opacity; the cascade runs at 250 ms per lamp.

**Measurement:** id `beacon`. `items` = boats lit by a tap inside the window (same meaning: a timed tap that met the boat). `errors` = taps within half a beat of a boat's landing but outside its window (a tap aimed at a boat that missed its moment, today's meaning); taps on empty beats go to `extra.empty_taps`, so a player tapping along with the pendulum is not punished and the engine's errors > 2 rule does not misfire. `completed` = chart finished; `completed_by` `touch` if any tap landed, else `auto`. `extra`: `v: 2`, `boats`, `missed`, `bpm`, `window_ms`, `offset_median_ms` (signed, from `d.ts`), `offset_iqr_ms`, `empty_taps`. A fixed latency allowance of about 40 ms is used only for juice grading; raw offsets are logged and never claimed. Items per task rise from 3 to 6 to 10 (flagged by `extra.v`, Decisions row). `auto()`: taps on the beat with plus or minus 40 ms jitter and 85% hit rate.

**Juice checklist:** touch-down response (ignition); tween (bloom spring); squash (hull, mast); particles (sparks, wake rings); near-miss answered quietly; escalation by chart position; world payoff (pier lanterns, horizon lighthouse); RM (yes); flash guard (cascade is sequential and local); sprite cache (yes).

**Art**
| Asset | Size | Prompt |
|---|---|---|
| `task_beacon_lighthouse` | 1024x1536 | A slender white Nordic lighthouse with two dark slate-blue bands on a low rounded black rock, side view, glass lamp room with a soft warm amber glow inside, a small railing gallery, full height of the image, no surrounding landscape, transparent background, no text. |
| `task_beacon_boat` | 1024x1024 | A small wooden Nordic fishing boat seen exactly from the side facing right, low dark hull, small square wheelhouse with two tiny dark windows, one short thin mast with an unlit round lantern at the top, simple rounded shapes, dark navy silhouette with a faint cool silver rim light along the top edges, transparent background, no text. |
| `task_beacon_ferry` | 1536x1024 | A small Nordic island ferry seen from the side facing right, pale upper deck with a row of five small dark windows, dark hull, one short funnel without markings, simple rounded shapes, transparent background, no text. |
| `task_beacon_pier_lanterns` | 1536x1024 | A short low wooden pier seen from the side along the bottom of the image, ten thin wooden posts each topped with a small unlit glass lantern, dark water line below, transparent background, no text. |
| `task_beacon_sea` | 1536x1024 | A horizontally tileable strip of calm dark night sea seen from the side, deep navy with a gentle long swell, thin faint silver highlights on the crests, no sky, transparent background. |

Beam, pools, rings, sparks, wake lines and blooms are procedural.

---

### 3.10 bells (wake, fatigue): Tower Chain

**Why today is weak:** Simon without Simon's drive: half of the 16 s is watching three small identical bells blink in a thin strip, no build, a wrong tap silently wipes the whole sequence, no payoff.

**Role models and the pattern taken**
- Simon (Milton Bradley, 1978): cumulative sequence; each round replays the previous sequence plus one new note and you echo the whole chain; playback speeds up as the chain grows; each pad has a fixed pitch and position; a winning flourish lights all pads in turn.
- Peggle: per-hit escalation; each further note rises in pitch and sparks, so the chain sounds and looks like it is climbing; the final hit gets a short slow-motion and an oversized celebration.
- Graft from Harbour Echo: full-column hit zones (the small bell is as easy to hit as the large one), per-bell haptic weight so the pitch is felt, and the eyes-closed re-engage (brighter call plus a felt beat).

**Deviations and constraints**
- Simon's fail buzzer, restart from scratch and input timeout removed; a wrong bell replays only the current round and changes nothing already stored (no fail, no pressuring timer, no visible regression).
- Chain starts at 2 and caps at 4 (bells contract: final length 3 + round(k); 1 s readability).
- Peggle escalation is tied to the note's position in the chain, never to consecutive correctness (no streaks).
- Peggle's score, banners and strobing removed (no numbers, words or red, nothing above 3 Hz).
- The lighthouse tower is replaced by a Finnish wooden church bell tower (lighthouse budget).
- Pattern identity is carried by size, position and tint together, never colour alone (sound later, colour-blind).

**Screen in the first second:** panel area raised to about [1.1, 0.42]. Left two thirds: three bronze bells of clearly different sizes (large low left in amber, medium centre in ice teal, small high right in aurora green), each over a full-height column hit zone. Right third: a slim wooden bell tower with a dark lamp at the top and a column of 4 small unlit windows. At 0.25 s the first bell lights and rings and a spark of its colour flies up into the lowest window; at 0.75 s the second does the same. Then the bells brighten (your turn). `tapCue` on the first bell at 1.0 s only if there is no touch.

**Loop:** round 1 shows 2 notes, echo 2; round 2 replays those plus 1, echo 3; round 3 (when the target is 4) plus 1, echo 4. While the sequence plays each lit bell shoots a coloured comet up the tower into the next window, so the chain is stored as a column of coloured windows. At low k the windows stay faintly coloured during the echo (memory aid); at high k they fade before your turn. During the echo every correct tap rekindles its window in order up the tower. Wrong bell: soft wooden tok, a single `tick`, windows unchanged, the same round replays. Every second error shortens the target by one (today's rule). The echo is self-paced: waiting just keeps the bells breathing at 0.25 Hz. If the eyes stay closed through a show, the round replays with brighter comets and a felt `heavy` on each shown note.

**Feedback for every touch**
| Touch | Visual | Haptic | Sound hook |
|---|---|---|---|
| Correct bell (note k of the chain) | 60 ms squash (0.86 x 1.12) with overshoot spring, pendulum swing, visible clapper hit, additive bloom in the bell's tint; comet rises to its window (220 ms, eased) and pops in a small burst; sparks 6, 9, 12, 15 by position k; a light wash lifts one step up the tower body | bell weight: large `heavy`, medium `medium`, small `light`, plus a `tick` 45 ms later for k at least 3 | bell pitch (today's notes 3, 5, 8) plus a harmony note rising with k |
| Wrong bell | that bell swings softly and dims briefly to silver; nothing else changes | `tick` | dull wood tok |
| Tap during the show | ignored, the bell gives a tiny glint | none | none |

**Payoff:** the last comet of the final round gets 120 ms freeze plus 300 ms of 0.3x animation time with a 1.06 zoom on the rising comet (visual only), then it hits the lamp, which ignites with a slow bloom and throws one beam out of the panel into the world. All windows glow in their chain colours; the bells play Simon's flourish as one eased chase (one bell every 0.35 s, one pass, under 3 Hz) ending in a held chord; embers drift up. Haptic `seq`: `heavy` 0, pause, `success` 420. `g.outro = 1.6`.

**Intensity:** k 0: target 3 (rounds 2, 3), show gap 0.6 s per note, long afterglow, windows stay faintly coloured. k 0.5: target 4 (2, 3, 4), gap 0.52 s, windows fade to a ghost. k 1: target 4, gap 0.42 s shrinking 8% per round (Simon speed-up), short afterglow, windows dark before the echo. Target stays 3 + round(k).

**Reduced motion:** no swing, squash, zoom or slow-motion; comets become a soft fade-in of the window light; the flourish is one simultaneous fade-up; particles under 0.2 screen per second.

**Measurement (unchanged):** id `bells`. `items` = length of the longest sequence echoed fully in order (the final chain length on completion, as today). `errors` = wrong-bell strikes during the echo. Every second error shortens by one. `extra`: `rounds_completed`, `echo_ms[]` per round, `median_inter_tap_ms`, `replays`, `eyes_closed_replays`. `auto()` echoes at 0.45 to 0.65 s intervals.

**Juice checklist:** touch-down response (squash, swing); tween (comets); particles (bursts, embers); wrong bell answered quietly with no regression; escalation by chain position; world payoff (beam, colour); RM (yes); flash guard (lamp bloom, chase timing); sprite cache (yes).

**Art**
| Asset | Size | Prompt |
|---|---|---|
| `task_bells_trio` | 1536x512 | Three bronze hand bells of clearly different sizes in a row, large, medium and small, each hanging from a short leather strap, warm amber bronze with a soft inner highlight, visible clapper, side view, evenly spaced, transparent background, no text. |
| `task_bells_tower` | 512x1536 | A slim traditional Finnish wooden church bell tower seen from the side, dark weathered boards, a small pointed roof, a vertical column of four small square windows all dark, a small dark lamp opening at the top, on a low snowy rock, full height, transparent background, no text. |
| `task_bells_lamp_glow` | 512x512 | Only a soft warm golden lamp glow with a gentle starburst halo fading to transparent, nothing else, transparent background. |
| `task_bells_comet` | 256x512 | A single small glowing spark with a short soft tapering light trail pointing upward, pale gold core, transparent background. |

Window bursts and the beam are procedural.

---

### 3.11 shutters (fatigue): Wake the House

**Why today is weak:** four identical swipes on a 2x2 grid; a tiny flick triggers a canned 0.4 s opening that ignores the finger; `k` is ignored; no tempo; one piano note; it reads as a checklist.

**Role models and the pattern taken**
- WarioWare: Touched!: a chain of short full-screen microgames, each with exactly one stylus verb implied by the object's shape (a cord hangs down, so you pull it), a quick transition between them, a speed-up every few. Novelty every few seconds is the hook; understanding takes under 1 s.
- Peggle (last peg): as the final hit lands, time slows and the view zooms, then a friendly, oversized release.
- Graft from Shutter Call (Beat Saber direction cue, 1:1 drag): the shutter tracks the finger 1:1 with slight resistance until a commit point, the slats cascade with one frame of lag each, and light leaking from the edge that will open shows the direction.

**Deviations and constraints**
- WarioWare's bomb fuse, lives and shouted one-word instruction removed; the object's shape plus the 1.2 s ghost replaces the word, and the speed-up changes only transitions and spring snappiness, never a deadline (wordless, no pressuring timers, no fail).
- WarioWare's absurd tonal jumps become one coherent house-at-sunrise sequence (calm-adjacent world, claims tone).
- Peggle's score tally and rainbow strobe removed; the rays turn slowly and the light rises once (no numbers, 3 Hz rule, no red).
- v1 ships two mechanisms (roller blind, hinged pair); the top-hung hatch and two-step latches come later (scope).

**Screen in the first second:** one big window fills the panel, seen from inside a dim polar-night room: a closed pale linen roller blind with a round wooden pull ring on a short cord, thin blue light leaking at its bottom edge. The ring sways gently. After 1.2 s without touch, the ghost drags the ring down and lets go.

**Loop:** window 1 opens; a 0.4 s parallax slide along the house (facade, birch silhouettes, snow motes) brings the next window with the other mechanism; order randomised per session. Every two windows the transition gets shorter and the house "breathes" bigger for one beat (WarioWare speed-up stinger, without a timer). Each opened window shows a warmer view than the last (polar blue, dawn peach, gold, full daylight), so the speed-up is a visible sunrise. 4 + round(2k) windows, the last is always a hinged double shutter facing the sea. A window waits as long as needed.

**Feedback for every touch**
| Touch | Visual | Haptic | Sound hook |
|---|---|---|---|
| Grab the blind ring | ring squashes, blind fabric tightens | `light` | cord creak |
| Pull the blind down | fabric follows the finger 1:1 (resistance 0.85) and stretches 5% at the ring | `tick` every 25 px (3 to 4 ticks, a ratchet) | ratchet clicks |
| Release past commit | blind whips up, the roll spins 3 turns with streaked stripes, clacks at the top, light floods in | `heavy` | snap clack |
| Grab a hinged pair | leaves squash 4% toward the finger, slat gaps widen, light leak +15% | `light` | latch click |
| Swipe the pair apart | leaves track the finger 1:1, slats cascade with one-frame lag, 6 to 10 frost motes shake off the moving edge | `tick` at the commit point | wood rattle |
| Commit (35% to 45% of travel by k) | leaves swing out with a perspective squish (scaleX by cos of the angle), bounce off the wall with 10% overshoot, snow slides off the ledge | `medium`, then `light` 80 ms later | wood bump |
| Every open | daylight wedge grows over 250 ms and settles at 40% over 600 ms, 12 to 20 gold motes drift in it, a window-shaped warm patch on the wall, `A.session.daylightBoost = items / N` brightens the world live | (above) | one chord layer added per open window |
| Release short of commit | part springs back with a soft wobble | none | wooden tock |
| Wrong direction | part bulges a little that way and rubber-bands back; its light edge brightens once to show the way | `tick` | soft tock |

**Payoff:** the last double shutter: as the finger crosses the commit point, animation time drops to 0.3x and the view zooms 1.15x on the opening for 0.6 s (visual only); then the leaves fly open, the low gold sun sits in the frame, soft rays turn slowly (under 0.1 turns per second), a fountain of warm motes arcs up and settles, and brightness rises once, smoothly, to full daylight (flash guard). Border reaches its done glow, the panel dissolves into the world (`daylightBoost` 1), then the colour bloom. Haptic `success`. Finale 2 s or less (`g.outro = 1.8`). Sound hook: an original rising crescendo resolving the window chord.

**Intensity:** windows 4 + round(2k), capped to fit 15 s. Transitions 0.7 s at k 0 to 0.35 s at k 1. Commit threshold 30% to 45% of travel (a bit more effort, never a gate). Spring snappiness and haptic strength rise slightly with k. Below k 0.3 only roller blinds (vertical); from 0.3 hinged pairs join. Engine error rule unchanged.

**Reduced motion:** no stretch, spin, bounce, zoom or pan; parts slide open with ease-out; windows crossfade; the finale is a 1 s crossfade to full daylight.

**Measurement (unchanged meaning):** id `shutters`. `items` = windows opened by touch. `errors` = drag attempts that started on a closed shutter's handle or leaves and did not open it (released before commit or wrong axis), today's meaning. Touches elsewhere ignored. Timeout: remaining windows open themselves at 0.6 to 0.9 s each, `completed_by: auto`. `daylightBoost = items / N`. `extra`: `n_windows`, `mechanisms[]` (ordered), `open_ms_median` (window arrival to commit), `open_ms_by_mechanism`. Claims wording: "how quickly each window was opened", never alertness. Max 15 s.

**Mode note:** fatigue (day). Adding day-only wake is an orchestrator decision (it adds an arm and a director rule).

**Juice checklist:** touch-down response (squash, gap widen); 1:1 tracking then spring; squash (ring, leaves); particles (frost, motes, snow); short release answered quietly; escalation by window index (sunrise); world payoff (daylight into the world); RM (yes); flash guard (light wedges, finale rise); sprite cache (facade strip and views pre-rendered offscreen, under 40 motes).

**Art**
| Asset | Size | Prompt |
|---|---|---|
| `task_shutters_rollerblind` | 1024x1024 | A single square window with a white wooden frame seen from inside a dim room at polar night, a closed pale linen roller blind with a wooden bottom bar and a round wooden pull ring on a short cord, thin cold blue light leaking at the edges, flat front view, no text. |
| `task_shutters_pair` | 1024x1024 | Seen from outside, a square window with a pair of closed louvred wooden shutters painted pale blue-grey with a small iron hook latch in the middle, snow on the sill and the top ledge, set in pale ochre horizontal board cladding, flat front view, no text. |
| `task_shutters_dawn_view` | 1536x1024 | View through a window opening of a snowy shore and calm sea at winter sunrise, a low pale gold sun on the horizon, peach and pale blue sky, a small distant white lighthouse with slate-blue bands, soft watercolour, no text. |
| `task_shutters_facade` | 2048x768 | A long row of Nordic harbour wooden houses in pale ochre, cream and pale blue with white window frames and snowy roofs, blue-hour light, a few bare birch silhouettes in front, horizontally tileable, no text. |
| `task_shutters_sunburst` | 1024x1024 | Soft wide radiating rays of warm gold and cream light from the centre, gentle edges fading to transparent, no hard lines, transparent background. |
| `task_shutters_roller_parts` | 1024x512 | A sprite row of a rolled-up linen blind cylinder, a wooden pull ring, an iron hook latch and a small heap of loose snow, evenly spaced, transparent background, no text. |

The dawn view is tinted in code from night blue to full daylight per window, so one image serves all. Like every asset these are generated on a transparent background (the STYLE prefix asks for it); the window, view and facade images simply fill the panel and sit on its dark-glass fill.

## 4. Build order

Rationale: shared kit first (every task depends on it); then what every session shows (reaction core, the two measurement tasks); then the highest impact per hour; the riskiest last. Each step ships behind its own task file, so a step that slips leaves the current version running.

| # | Step | Est. | Notes |
|---|---|---|---|
| 0 | Shared kit (2.1 items 1 to 10, particles, easing, light, flash guard, haptics, RM) | 1 to 1.5 h | includes `@capacitor/haptics` install and `cap sync` |
| 1 | reaction: Bite | 1 h | engine timing code untouched apart from removing the onset piano and the RM 0.35 branch |
| 2 | lanterns: Lantern Release | 1 h | `g.bare`, local animation clock, practice flag |
| 3 | fork: Fell or Shore | 1 h | presenter only, logic in `measures.js` untouched |
| 4 | fireflies: Firefly Fling | 1 h | proves trail, segment hits, magnet, vacuum; works on a fixed interval if the beat clock slips |
| 5 | breath: Lantern Song | 1 h plus 30 min landmarks | sauna landmarks hard-coded first |
| 6 | shutters: Wake the House (blind plus pair) | 1.5 to 2 h | fallback: blind only |
| 7 | loyly: Silk Pour | 1 h | |
| 8 | bells: Tower Chain | 1 h | no beat clock needed |
| 9 | beacon: Harbour Beat | 1.25 h | needs the beat clock and `d.ts` |
| 10 | stars: Joutsen (swan only) | 1 h | procedural swan polyline |
| 11 | threads: Aurora Loom | 2 h | puzzle authoring is the cost; fallback: current threads with the guide ribbons removed |

After each step: autoplay a full session, check 60 fps on the iPhone, check reduced motion, check the record JSON for unchanged `items` and `errors` semantics.

## 5. Open decisions for the orchestrator

1. Contract owner: add `core.rt.stimulus` (proposed `"bite/1"`) to `session.v3.schema.json`, or record the switch in Decisions only.
2. Decisions rows for presentation and version changes the hub must know: reaction stimulus, `fork_ui: fell_v1`, lanterns `presentation: release_v1`, threads v2 (errors = wrong ends plus cuts), beacon v2 (items 3 to 6-10, empty taps split out), loyly v2 (pour ends at the far edge of the bed).
3. `package.json` change: `@capacitor/haptics` (without it, no haptics exist on the iPhone and the breath tap train, the shutter ratchet and every count-in vanish).
4. Sound (X28): a single woodblock on the beat for beacon is the cheapest big win for a silent demo video; everything else stays a hook.
5. New bandit arms (each needs a Statistics.md and director change): fireflies in fatigue, stars in calm, shutters in day-only wake. Not part of v1.
6. `world.js` hooks (2.1 item 9): landmarks, sky marks, lighthouse flare, scarf, breath pose. All optional; v1 runs on panel-local fallbacks.
7. Lanterns `errors`: stays as today in this spec; changing it to incorrect responses would be a separate decision.
