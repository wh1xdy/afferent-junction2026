# Afferent engagement model

Status: design spec from the lead designer. It synthesises four researcher reports (theory, daily games, mental health, not-annoying) and two reviews (clinical ethics, player annoyance). Only mechanics that survived both reviews, or their changed versions, are in this file. Where the reviewers disagreed, section 12 records the decision and the reason. The per-element role-model map for the whole app is in `design/rolemodels.md`.

This file is the "Morning ritual" spec that `design/minigames.md` 0.5 points to as `coreloop.md`. That file does not exist; the pointer should be changed to this file.

Source markers: sources without a marker were fetched by a researcher in this session. **[K]** marks established literature or product knowledge that nobody could re-check this session, because the shared web search budget ran out. Check every [K] item before it goes on a pitch slide.

Needs a Decisions row before it ships (section 12, D1). It overrides "no streak" in `GameDesign.md` pillar 3 and section 9, in `DesignSystem.md` rule 3 and in `design/lookdev.md` section 9, but only for the start screen and the end-screen tick. The game itself, the village and the patient view stay free of a streak number.

## 0. What "as addicted as possible" becomes

David's goal is a patient who does the ritual every morning for their own sake. The evidence says the way to get there for depressed users is a habit they would endorse, with no friction and no shame. Compulsion does not get there:

- Duolingo got its biggest streak gain by *lowering* the bar. Once one lesson was enough to extend the streak, D14 retention rose 3.3% and 7+ day streaks rose more than 40% (blog.duolingo.com/improving-the-streak).
- A visibly broken streak lowers later behaviour below baseline. The effect is stronger when people blame themselves and weaker when the streak can be repaired (Silverman and Barasch 2023, JCR 49(6)). Self-blame is the typical attribution style in depression.
- Reminders bring small gains: +0.5% DAU for Duolingo's bandit (Yancey and Settles, KDD 2020) and RR 1.039 for a tailored push (Bidargaddi 2018). Guilt costs a lot in this group.
- Afferent's own early-warning index needs play to be voluntary. Missed sessions (weight 1.0) only signal a relapse if nobody forces the patient to play (X16).
- Regulation and evidence point the same way. EU AI Act Art. 5(1)(b) bars AI that exploits a vulnerability due to disability. Yardley 2016 argues for "effective engagement": the smallest amount of use that gives the benefit.

So the target is **as sticky as Duolingo, as forgiving as Apple Pause Rings, as finite as Wordle**.

**How other games do it without annoying the player.** The products people praise share eight traits:
1. A tiny daily bar (Duolingo, one lesson).
2. A session that ends (Wordle, Monument Valley).
3. A world that only grows (Sky candles, Finch, Neko Atsume).
4. Slack built in (Duolingo Streak Freeze, Apple Pause Rings).
5. A total that never resets (Ten Percent Happier, Mindful Days).
6. Guaranteed rewards with varied content (Pokemon Sleep).
7. Skill-based juice with invisible help (Celeste, Rhythm Heaven, Crash Bandicoot).
8. One quiet reminder that stops itself (Duolingo mechanics, Apple's Passive level).

Everything players complain about is on our never list (section 9): guilt mascots, decay, FOMO events, leagues, wagers, paid repair and endless modes.

## 1. The engagement model in 5 lines

1. **One lit morning is the whole bar.** It is earned by finishing the fixed core with your own input, anchored to waking, and lit by the bedside light (Duolingo one-lesson streak, Fogg anchor, Philips Wake-up Light).
2. **The session ends, and the day is done.** Dawn, one check-in, a small celebration, one line, "See you tomorrow". There is no "play again" (Wordle, Instagram "You're All Caught Up", Ring Fit).
3. **The world only grows.** Each lit morning leaves a permanent light in the village. Milestones add landmarks and a visitor comes every morning. Nothing decays, ever (Sky candles, Neko Atsume, Finch).
4. **Slack is built in and a loss is never shown.** Two freezes, "Not today", a planned pause and a silent repair. No 0, no broken flame, no "you missed" (Duolingo freeze, Apple Pause Rings, Silverman and Barasch).
5. **One quiet prompt that stops itself, and a real person for real lapses.** The bedside sunrise or one Passive notification, which back off after 3 silent days. After that the care team takes over through the CUSUM (Duolingo reminder mechanics, Supportive Accountability, Mohr 2011).

Binding firewall: nothing persistent (streak, village, visitor, milestones, quote, freeze) may depend on core reaction time, the Fork choice, Two lanterns outcomes, the mood value, vitals or in-task light. Nothing celebratory may appear between Begin and the end check-in except the existing in-task juice and dawn.

## 2. Binding rules

| # | Rule | Source |
|---|---|---|
| R1 | No variable-ratio or chance-based payoff. Every reward is guaranteed or earned by skill. No rarity tiers, no "chance of a rare one" | Zendle and Cairns 2018, 2019 (PLOS ONE); Halahakoon 2020 (reinforcement learning impaired in depression) |
| R2 | No loss framing, guilt or shame anywhere: game, meta layer, notifications. Nothing decays, dies, wilts, leaves or counts down. No copy attributes a gap to the person | Silverman and Barasch 2023; Marlatt (abstinence violation effect); Elliott 1997; Eshel and Roiser 2010; Project Horseshoe "Coziness" 2017 |
| R3 | No social comparison: no leaderboards, leagues, friend streaks or sharing | Borghouts 2021; Feinstein 2013 [K] |
| R4 | One counted session per day. No "play again", no bonus mode, no time-limited events | Wordle (Wardle, Time 2022); Instagram 2018; Zagal, Bjork and Lewis 2013 [K] |
| R5 | Measurement firewall (section 1). Any presentation change to the core, Fork or Two lanterns bumps the version (`fork_ui`, `extra.v`) and starts a new within-version baseline | X5, X20, X21; minigames 3.2 |
| R6 | Adaptive systems (director, DDA, assist, Thompson bandit) optimise wellbeing signals only, never "returned next day", session count or session length. The bandit reward stays `helped` (X9) | EU AI Act Art. 5(1)(b); Eyal Manipulation Matrix |
| R7 | The night rule wins. From 21:00 to 06:00 there is no streak number, no notification, no milestone and no "save your streak" | V6, X19; Pokemon Sleep dropped content that kept users in bed (corporate.pokemon.co.jp) |
| R8 | Honesty. "Your clinic saw this" is shown only if a clinician really opened it. The endowed day 1 is a real session. The clinic sees freezes and pauses as what they are | Mohr 2011; NICE ESF Standard 2 |
| R9 | Bad-day test. Check every mechanic against "mood 1, slow RT, 3 days missed". If it adds pressure or a failure signal on that morning, change or drop it | Ethics G9 |
| R10 | Pre/post mood validity. The end order is dawn, then the end check-in, then the celebration, then the quote. Before `mood_start`, the start screen shows only stable content | Ethics G10 |
| R11 | **Interruption budget:** at most 1 OS notification per day across all features | Annoyance A2; Fitz 2019; Apple HIG |
| R12 | **End-sequence budget:** at most 5 s of extra content after the end check-in. One tap anywhere skips it. Nothing ever blocks closing the app | Annoyance A2; Pokemon Sleep long morning review as the anti-model |
| R13 | **Start-screen budget:** Begin, Not today, the live world with the village, one small streak number, and the existing icons. Freeze, pause and repair state is shown by glyph in the patient view only, never as a banner or popup | Annoyance A2 |
| R14 | **Lock-screen privacy:** push copy never mentions a clinic, mood, care, health, a streak or a missed day | Iwaya et al. (arXiv 2201.09006): the link to a mental-health app can reveal a condition |
| R15 | **Shape, not hue:** freeze and rest states use shape glyphs. Ice blue would read as mood 1 (`#34476E`) in the mood-coloured week ribbon | Annoyance A3 |

## 3. The daily loop, from trigger to the next morning

Times are relative to the patient's chosen wake window start (`W`, set at onboarding, default 07:00).

| # | Step | When | What happens | Role model (pattern taken) | Rules | Lives in |
|---|---|---|---|---|---|---|
| 1 | Sunrise cue (primary prompt, opt-in) | W - 10 min to W | The bedside light rises over 10 min to at most 60% `#FFF3DC`. When this routine is on, the push is off by default, so there is one cue, not two | Philips Wake-up Light and Hatch Restore (light first, then wake; one button ends it) [K for Philips], Fogg anchor (the prompt sits on waking) | Off on paused days. A brightness cap for shared bedrooms. Claims: "morning light at the bedside", never "light therapy" | Later: hub bedside scheduler (`hub/afferent_hub/bedside/`), `POST /api/bedside/light` |
| 2 | Reminder (fallback prompt, opt-in) | W + 30 min, only if no session yet today and no sunrise routine | One Passive local notification, a world-only line (section 7) | Duolingo practice reminder (one a day, rotating templates), Apple HIG Passive level | R11, R14, never 21:00-06:00 | Should: `demo/js/remind.js` (new), Capacitor Local Notifications |
| 3 | Start screen | Opening the app | The live world is the menu. Figure sitting, lantern an ember, village lights on the far shore. "Begin" and "Not today" are equal in size and weight. One small mornings chip sits above the figure in the eye zone from a streak of 2 upwards (6.2). It is absent, never 0, below that | Monument Valley and Alba (the title is the place, lookdev 10), Alto's Zen Mode (two equal low-stakes choices), Duolingo home streak counter (small number) | R7, R10, R13. Nothing new or day-specific before `mood_start` | `demo/index.html` `#start`, `demo/js/main.js` `morningText()`, `demo/css/flow-ui.css` |
| 3b | "Not today" | Tap | Logged as `declined` (neutral, never missed, Decisions #35). It holds the streak without growing it and uses no freeze. The ember covers itself and the village stays lit | Apple Pause Rings "For today" | Unlimited, never questioned, no copy | `main.js` `$('decline').onclick`, `A.declinedRecord` |
| 4 | Begin, fixed core | 0:00 to about 0:30 | Lantern catches, 6 s rest, start check-in, Bite reaction core. Identical every session | lookdev 8.1 (Inside, Journey opening); minigames 3.1 (Animal Crossing fishing) | R5. World dressing may vary by season and weather only, never by stimulus or by visitor | `demo/js/engine.js`, `demo/js/measures.js` |
| 5 | Play | about 0:30 to 1:42 | Walk, task, walk, task. Fork in slot 1, Two lanterns in slot 3, adaptive tasks with DDA. The first adaptive task of a morning has a sleep-inertia warm-up (section 5.3) | Alto's auto-walk, Among Us task frame, Left 4 Dead director, WarioWare ramp | Firewall. No overlay of any kind inside play (Apple HIG ratings rule) | `engine.js`, `demo/js/minigames.js`, minigames 0.2 to 0.6 |
| 6 | Dawn (the peak) | 8 s | Sun crests the ridge, rays, the lantern hands over to the sun, full-colour hold. Identical in every session, so its effect on the pre/post pair is a constant | Alto's Odyssey sunrise, Journey summit, Old Man's Journey (linger), Craske PAT savouring (hold before rating) | No milestone, visitor or number here (R10). The last task never overruns play (section 5.4) | lookdev 8.3, `engine.js` dawn phase |
| 7 | End check-in | Dawn + 8.6 s | "Good morning." over clear sky and the five lanterns. Auto-dismiss after 20 s | Daylio five-point one-tap mood (en.wikipedia.org/wiki/Daylio); van Berkel 2017 (the check-in is part of play) | Unchanged (X3) | `main.js` `#moodEnd`, `index.html` `#end` |
| 8 | Shine (celebration) | After the tap, under 2 s | One warm mote leaves the lantern and settles as today's light in the village (lookdev 8.3). The streak number, if shown, ticks up once beside "Good morning.". On a milestone morning the new landmark lights as the mote lands | Fogg "Shine" (celebrate right after the behaviour); Duolingo end-of-lesson streak count-up; Sky placed candle | Identical whatever the mood or performance. Always warm. No number at night | `main.js` `A.bus.on('mood')`, lookdev 8.3 mote, `demo/js/streak.js` (new) |
| 9 | Visitor (later) | Same 2 s, in parallel | One dawn visitor walks onto the jetty by the new light | Pokemon Sleep (a guaranteed minimum every morning, which one varies), Neko Atsume | R1: picked only among species already met. New species follow a fixed schedule (section 4) | Later: `demo/js/world.js`, `demo/js/visitors.js` (new) |
| 10 | Quote | After the Shine, about 3 s, one tap dismisses | One curated line for today's date, low over the warm settled world, never over the sun. The crisis offer replaces it when mood is 1 at both check-ins (X26) | Calm "Daily Calm" (one per date, the same for everyone) [K], Wordle (one shared daily item) | Content rules in section 5.5. Settings switch "Show a line after the session". Total of steps 8 to 10 is at most 5 s (R12) | Must: `demo/data/quotes.json` (new), `main.js`, `index.html` `#end` |
| 11 | Done for today | Then | Warm settle (morning `V.black` 0.45, never black). "Back" returns to a start screen with today's light lit and the line "See you tomorrow." in place of nothing new. A replay is possible from Settings or demo mode only, never counted twice (X25) | Wordle (one a day), Instagram "You're All Caught Up" (explicit done state), Ring Fit "take a break" | R4. No "play again" | `main.js` `goHome()`, `#again` |
| 12 | Investment that carries to tomorrow | Overnight | The village light is permanent. The DDA level `L` is saved (minigames 0.2). The visitor book gains an entry (later). A diegetic hint at tomorrow: the distant boat sits a little nearer the jetty each lit morning and docks at the next milestone. Never a countdown | Hooked "investment" step (only this step is taken, not variable reward); Animal Crossing (the town remembers); Ovsiankina resumption, which is robust (Ghibellini and Meier 2025 found Zeigarnik unreliable) | Nothing is lost by not coming back | `localStorage` `afferent.world` (lookdev 9), `afferent.skill.v1` |

Night variant (21:00 to 06:00 or rest mode): no streak number, no Shine tick, no milestone, no quote by default (the line is allowed only if the patient turned it on, and night lines are drawn from a separate rest pool). The village light is still placed. "Rest well." The session still counts as a lit day (section 6.1).

## 4. The long arc over 8 weeks

The clock is `day_index` (days since TMS end, X25), not sessions played. Seasons, the world and new species follow time and cumulative mornings, so nobody falls behind and nothing is withheld for missing days.

| Weeks | Days since TMS end | What grows (cumulative mornings lit) | What the world does (calendar) | What unlocks | What the patient sees |
|---|---|---|---|---|---|
| Discharge | 0 | Mornings lit 1. The onboarding session at the clinic is a real session and counts (Nunes and Dreze 2006, endowed progress; honest, R8) | Deep polar night, lighthouse unlit at the start | 2 freezes given. First visitor met: Siberian jay | Onboarding screen (section 6.8); one light in the village |
| 1 | 1 to 7 | Milestones at 3 and 7 mornings lit (front-loaded, because Duolingo found the first week the most fragile and Lally found early repetitions carry the largest gains) | Polar night, blue noon hour | 3: the jetty lantern lights and the mountain hare arrives. 7: a cabin window lights and the red squirrel arrives | Streak number appears from 2. Week row of lanterns |
| 2 | 8 to 14 | Milestone at 14 | Stars thin a little at the horizon | 14: the distant boat reaches the jetty and the reindeer arrives | Freeze refill at 7 and 14 mornings lit (cap 2) |
| 3 to 4 | 15 to 30 | Milestone at 30 | First grey-pink light on the horizon line at the start | 30: the second lighthouse lamp lights and a pair of whooper swans arrives | "What helped" becomes reliable (bandit n of at least 5 per arm, `views.py` `what_helped`) |
| 5 to 7 | 31 to 49 | Village fills along the far shore | Snow thins on the near birches, ice edges darken | none on a fixed date | The clinic sees the composite and CUSUM from day 14 (X17) |
| 8 | 50 to 56 | Milestone at 50 | First open water at the shore, moss under the snow (lookdev 9 NICE) | 50: the sauna chimney smokes in the start screen world and the Saimaa ringed seal arrives | The patient view shows how many mornings are lit in total |
| After | 57+ | Milestones at 100, then every 50 | Spring holds; the real calendar takes over after day 56 | 100: eagle-owl (also the v2 constellation figure in minigames 3.7) | The same ritual. The streak stays where it is; the patient can hide it (section 6.6) |

Rules for the arc:
- **What grows is permanent.** Village lights (capped at 60 drawn, lookdev 9), landmarks and the visitor book never go back.
- **How the world remembers the player.** By the village, by landmarks, by the visitor book (later) and, later, by starting where yesterday ended (`lastBiome` and faint old footprints, lookdev 9 NICE). The world never remembers an absence.
- **Seasons towards spring** follow `day_index`. Role model: Animal Crossing's real-time clock. Deviation: the clock is the treatment arc, not the real Finnish calendar. The constraint is that in November and December the real north gets darker for weeks, which would turn the arc backwards. The seasons are cosmetic and never contingent on play or mood, so a patient who is doing badly still sees spring arrive. That is deliberate (no punishment), and the claims never link spring to recovery.
- **Milestone basis** is cumulative mornings lit, never the streak, so a break never delays a milestone (Silverman and Barasch).
- **No numeric countdown** to the next milestone (countdowns are banned in minigames.md). The boat's distance to the jetty is the only hint.
- **Never lecture "66 days".** Lally's range is 18 to 254 days. A patient who feels no automaticity at day 66 would read it as failure. If a line is needed, use the patient view: "For many people it gets easier after a couple of months."
- **Scaffolding does not fade by itself.** Taking away a number people like is a loss (the Wordle streak resets after the NYT move angered players). Milestones simply get sparse after 100.

## 5. Rewards that fit anhedonia

What the evidence says about reward in depression:
- People with depression are less willing to spend effort for a reward, especially an uncertain one. That is the "wanting" deficit (Treadway, EEfRT).
- Anticipatory pleasure is blunted more than consummatory pleasure (Sherdell 2012).
- Reinforcement learning is impaired, so sparse random payouts teach poorly (Halahakoon 2020).
- People with depression are hypo-responsive to reward and hyper-reactive to punishment (Eshel and Roiser 2010). Abnormal responses to negative feedback persist after remission (Elliott 1997).
- Expected tangible rewards undermine intrinsic motivation, while informational feedback does not (Deci, Koestner and Ryan 1999). Points and badges raise output quantity only, not intrinsic motivation (Mekler 2017).

### 5.1 Principles

1. **Guaranteed, immediate, the same size every day.** Every reward arrives every time the behaviour happens. None scales with mood, vitals or performance.
2. **No cost to start.** One tap from lying down, then 6 s of rest that needs no input. Ability is the bottleneck in anhedonia (Fogg B = MAP).
3. **Feed anticipation without pressure.** The diegetic tomorrow hint (the boat) and the known daily visitor give something to look forward to. Never a timer.
4. **Savour the payoff.** Dawn holds full colour for 3 to 5 s before anything asks a question (Craske PAT).
5. **Surprise, not a contract.** Never "play to get X". Landmarks and new species arrive unannounced. That is the unexpected-reward condition in Lepper, Greene and Nisbett 1973.
6. **Informational, never controlling.** "What helped" reports a hedged association. Never "good job".
7. **Outside the measurement.** Nothing in the reward layer touches Fork (effort choice) or Two lanterns (reward bias). Any reward economy beside those tasks would contaminate them.

### 5.2 The reward set

| Reward | When | Contingent on | Why it fits | Role model |
|---|---|---|---|---|
| In-task juice: grades, hidden combo tiers, fever | Inside adaptive tasks | Skill (deterministic) | Competence (SDT). Never words or numbers | Rhythm Heaven, Guitar Hero, Peggle (minigames 0.5) |
| Colour return | After every finished task | Finishing (a timeout also returns colour, more slowly) | Immediate and consistent | Gris, Ori mote (lookdev 8.2) |
| Lighthouse ladder | Core end, then after each task | Session progress | A visible goal that brightens | Journey, Monument Valley (lookdev 4.5) |
| Dawn | Every session | Reaching the end (always) | The peak of every session, identical | Alto's sunrise, Journey summit |
| Village light | Every lit morning | Showing up only | Permanent, never counted on screen | Sky placed candles |
| Streak tick | Every lit morning, 06:00 to 21:00 | Showing up only | A small count-up. Slack keeps it safe | Duolingo |
| Milestone landmark | 3, 7, 14, 30, 50, 100, then every 50 mornings lit | Cumulative showing up | Goal gradient without a reset to zero | Duolingo milestone animation (+1.7% D7, Duolingo blog), Kivetz 2006 |
| Dawn visitor (later) | Every lit morning | Showing up only. The species is chosen at random among those already met | Variable content with a fixed reward. Not variable ratio | Pokemon Sleep, Neko Atsume |
| Quote | Every session, after the check-in | Nothing | A calm closing line | Calm Daily Calm [K] |
| "What helped" | Patient view, any time | The bandit's evidence | Behavioural activation: activity linked to change (Dimidjian 2006) | Daylio activity-mood correlations (en.wikipedia.org/wiki/Daylio), Moodivate [K] |

In-task light (`light_share`) is within-task feedback only. It never accumulates across sessions, is never summed or shown as a number, and never feeds the village, visitors, streak or milestones (minigames 0.5, ethics P7, annoyance G7). Fork orbs keep their own visual currency (scarf bands) that adaptive light never uses.

### 5.3 Difficulty without a daily diet of failure

David's brief is a real challenge ("way too easy"). The ethics review worried that a target of 0.78 means about 22% misses every morning. In fact the DDA target applies to *graded* outcomes (perfect 1, good 0.8, barely 0.4, miss 0). At `o_mean` 0.78 a typical mix is about 30% perfect, 55% good, 5% barely and 10% misses. Both reviews are satisfied by keeping `p*` as specified and adding a guard:

- **Miss-share guard:** the share of `miss` grades per task, over a player's rolling last 30 trials, stays at or below 15% in tempo and puzzle tasks and at or below 10% in calm tasks. That is the "Eighty Five Percent Rule" for learning (Wilson, Shenhav et al. 2019, Nat Commun [K]). If the guard is exceeded, that task's `p*` rises by 0.03, up to at most 0.85. The 30-session bot test in minigames 0.2 must also report the miss share.
- **Morning warm-up (sleep inertia):** the first adaptive task of a morning session runs its first third at `L_eff - 0.08` and its middle third at `L_eff - 0.04`, then the normal ramp applies. The credit weight is `w` 0.5 during the warm-up. No frost motes and no blitz-window decay in that task. Reason: performance is impaired for 15 to 60 min after waking, and speed suffers more than accuracy (Hilditch and McHill 2019, pmc.ncbi.nlm.nih.gov/articles/PMC6710480). WarioWare's own first microgames are trivial, and Ring Fit opens with a warm-up [K]. This amends minigames 0.2 "no warm-up below `L_eff`".
- **Silent combo loss:** after a miss the tier holds for 1 s, then the extra layer fades over 1.5 s. Never a cut and never a drop sound. Blitz-window decay is off in the first task and whenever the assist is on.
- **"Barely" keeps the same pitch as "good"**, with fewer sparks and a softer volume. A falling pitch is a learned negative signal (amends minigames 0.5).
- **Transparency without singling anyone out:** one line in the info and consent text, "The game adjusts to how you are each morning." Never per session and never the word "easy" (ethics P9).

### 5.4 Peak-end

- Before starting the **last** adaptive task, check that it can finish before play ends. This replaces "a task may run past the end of play by 3 s" (GameDesign 0.1).
- If the player missed 2 of the last 3 trials, the last task's boss item gets the quiet assist offset, so the final input of the session is very likely a success. The last task is **not** forced to be the easiest overall, and **not** drawn from the top "What helps" arm. That arm would otherwise always sit in the slot before dawn and the check-in, and inflate its own `helped` estimate. Log `slot` as a covariate.
- Never lengthen the ending to raise remembered pleasure (Kahneman's own caveat, Kahneman et al. 1993).

### 5.5 Quote rules

- **Pool.** Curated by the clinic team, never generated live (X13, claims policy). At least 365 lines before the pilot, no repeat within a year, the same line for everyone on a date (index = day of year). Tonight: a starter pool of about 30 lines, marked "pending clinical review".
- **Every line must be acceptable to read on the worst morning:**
  - descriptive and nature-anchored;
  - no imperatives ("you must"), no comparisons, no toxic positivity;
  - no first-person affirmations ("I am worthy"). Wood, Perunovic and Lee 2009 found that affirmations made people with low self-esteem feel worse [K];
  - nothing about death, darkness as an ending, effort or willpower;
  - nothing about performance or streaks;
  - nothing factually false for the season (for example, no "the days are getting longer" before 21 December).
- **No mood-contingent selection**, so the quote never becomes a reward signal.
- **Examples** (pending review):
  - "Even in polar night, the sky turns blue for a while at noon."
  - "A sauna stone keeps its warmth long after the fire is out."
  - "Birches bend under the snow and stand up again in spring."
  - "Under the snow, the moss stays green."
  - "Whooper swans come back to the same lakes each spring."

## 6. The streak, with freeze and kind lapse handling

### 6.1 What counts

- **A lit morning** is a session in which the fixed core finished with the player's own input. That means status `completed` or `fell_asleep`, or `partial` with `core` present and not unengaged (X36). Duration, quality, tasks finished and the mood value never count. Reason (ethics E1): the clinically essential data sits in the core, so rewarding exactly that aligns the habit with the measurement. Gaming the streak with minimal sessions then costs no data.
- **One rule for everything.** The same rule lights the village (amends lookdev 9, which uses "`completed`, or `partial` with at least one finished task"), extends the streak and lights the week lantern. The patient never sees them disagree (annoyance M1).
- **Day boundary 04:00 local** (Habitica Custom Day Start [K]). A session between 00:00 and 04:00 counts for the previous day and is a night session, so no streak UI shows. The stats agent must apply the same boundary to X25 and to the sleep-regularity feature.
- Night sessions count as lit days. The night rule hides only the UI.

### 6.2 What the patient sees

| Surface | Shows | Never shows |
|---|---|---|
| Start screen, 06:00 to 21:00 | One small chip (laminate glyph, numeral, "mornings") above the figure in the eye zone, from a streak of 2 (`design/concept.md` 12.1). The village is the wordless, visually dominant total | 0, 1, a flame icon, a broken or extinguished icon, freeze count, "at risk", red |
| Start screen, 21:00 to 06:00 | Nothing about the streak | Any number |
| End screen, morning | The number ticks once beside "Good morning." after the check-in | A count-up animation over 2 s, "streak extended" words |
| Patient view | "Mornings lit" (lifetime, never decreasing, Ten Percent Happier "Mindful Days") and the week of lanterns | The streak number, "max streak", missed-day counts |
| Notifications | Nothing about the streak (R14) | |

**Why no "max streak":** a past high shown beside a low current value is a loss reminder (annoyance M5).

### 6.3 Week of lanterns (patient view)

The row starts fresh every Monday while the streak carries on (Dai, Milkman and Riis 2014, fresh start; Pokemon Sleep's weekly reset). One lantern per day:

| Day state | Glyph |
|---|---|
| Lit | Lantern lit in that day's mood colour (`mood_start`, as now). No mood answer: lantern-warm |
| Today, not yet | Lantern outline with a faint ember |
| Missed | The same lantern shape, unlit. Never an X, a gap or grey |
| Frozen | Unlit lantern with a frost rim (shape, not hue, R15) |
| Not today or paused | The lantern set down on the ground (Apple Pause Rings "rest" idea) |

No "Perfect Week" badge (the all-or-nothing Apple awards before watchOS 11 are the anti-model).

### 6.4 Slack, in order of use

1. **Not today** (section 3b). Holds without growing. Unlimited.
2. **Pause**, in Settings. The menu is taken 1:1 from Apple watchOS 11 Pause Rings: "Today", "Until Monday", "Until next month", "Custom date" (9to5mac.com 2024, imore.com).
   - Deviation: a patient-set pause is capped at 14 days per pause and can be renewed. The constraint: a long silent pause during relapse onset would hide the missed-session signal.
   - A clinician can set a pause (booster TMS course, admission, travel) with no cap.
   - Paused days hold the streak and reminders are off. The sunrise light is off by default.
   - The "Pause 7 days" notification action is a pause.
   - Not the same as **sharing** paused. That is a privacy setting and must not be read as rest (section 12, D4).
3. **Streak Freeze.** Duolingo 1:1:
   - Up to 2 held, used automatically on a missed day, so the streak survives and the count does not grow.
   - Deviations:
     - 2 are given at onboarding. The first week is the most fragile (Lenny's Newsletter, Duolingo).
     - 1 more is earned per 7 *mornings lit* (cumulative, not streak days), cap 2. A 3rd freeze "trained users to take more time off" (Shuttleworth).
     - No gems, shop or currency. A currency beside Fork and Two lanterns contaminates the effort and reward measures.
     - No "Streak Freeze used" interstitial. It reminds the player of the miss. The frost rim in the patient view is the only trace.
4. **Silent repair.**
   - When the freezes are gone, up to 3 unprotected missed days are repaired by the next lit morning. The streak continues as if unbroken.
   - No task, no quest, no prompt and no monthly cap.
   - History is not rewritten: the missed lanterns stay unlit (R8).
   - Role models: Duolingo "earn back", where users preferred earning over paying (Shuttleworth); Finch's hammer on a missed day (Mobbin); Silverman and Barasch (repair weakens the harm, and the cheaper the repair the better).
   - Deviation: free and automatic instead of a few lessons in one sitting. The constraint is the self-blame risk in depression. A repair quest is a second streak to worry about (annoyance). A once-per-30-days cap creates a second failure point in exactly the hardest month (ethics).
5. **Beyond that**, the streak number is simply absent until a new streak reaches 2. "Mornings lit", the village, the visitors and the milestones are untouched.

### 6.5 Worked example (2 freezes held)

| Day | Event | Freezes | Unprotected gap | Streak shown | Mornings lit |
|---|---|---|---|---|---|
| 0 | Onboarding session at the clinic | 2 | 0 | (1, hidden) | 1 |
| 1 | Lit | 2 | 0 | 2 | 2 |
| 2 | Not today | 2 | 0 | 2 | 2 |
| 3 | No session | 1 (used) | 0 | 2 | 2 |
| 4 | Lit | 1 | 0 | 3 | 3 (milestone: jetty lantern) |
| 5 | No session | 0 (used) | 0 | 3 | 3 |
| 6, 7 | No session | 0 | 2 | 3 (nothing changes on screen) | 3 |
| 8 | Lit, so the repair applies | 0 | 0 | 4 | 4 |
| 9 to 11 | Lit | 0 | 0 | 7 | 7 (milestone; +1 freeze) |
| 12 to 16 | No session | 1 used, then 0 | 4 | absent | 7 |
| 17 | Lit | 0 | 0 | (1, hidden) | 8 |

### 6.6 Hide toggle

In Settings, "Show the morning count". It is the Headspace Run Streak eye toggle taken 1:1 (help.headspace.com). Default on. Hiding never resets anything. The every-4-weeks harm item (section 10) suggests it when the answer is "a pressure".

### 6.7 What the clinic sees

- A frozen day is still a missed day in the hub (`missed_sessions` is unchanged, X16), logged with `streak_protection: "freeze"`.
- Repaired days stay missed, logged with `streak_protection: "repair"`.
- Not today stays `declined` (never missed, as now).
- A patient pause is excluded from the missed-session denominator and drawn as a "paused by patient" band (context, not an alert). A clinician pause is excluded entirely. The stats agent confirms the denominator.
- Covariates for the stats agent: `streak_len`, `freezes_held`, `repair_active`, `reminder_sent`. Check whether `missed_sessions` loses sensitivity in patients with long streaks, because streak pressure can keep people playing into relapse onset (Headspace users fast-forward sessions to keep the streak).

### 6.8 Onboarding (one screen, at discharge)

Played with the clinician present, after the first real session (which is day 1):
1. An implementation intention the patient completes: "When I wake up and pick up my phone, I light the lantern." Role models: Gollwitzer and Sheeran 2006 (d = 0.65, bias-corrected 0.15 to 0.35), Fogg Tiny Habits recipe, Stawarz 2015 (event cues beat reminders for automaticity).
2. A usual wake window (default 07:00).
3. "Aim for a week of mornings" (default 7, can be skipped). Nothing is ever said if it is missed. When it is reached, the next aim is offered silently at dawn.
4. One line: "Your clinic sees your weekly summary, nothing more. Most mornings is plenty."
5. A button: "Let's begin".

Deviation from Duolingo's "Commit to my goal": no pledge, because a broken explicit commitment invites self-blame. No notification permission here (section 7.1).

## 7. Notifications

### 7.1 Opt-in

- Never at first launch and never at onboarding (Android 13+ permission guide: "let them familiarize themselves with your app", ask "from a user action", around the 3rd or 4th launch; Apple HIG).
- After the 3rd lit morning, below the quote, one quiet line with a button: "Remind me in the morning". A tap opens the system prompt. If the patient declines, the app does not ask again. Settings holds the switch "Morning reminder" and the wake window (Apple HIG requires an in-app setting).
- If the sunrise light routine is on, the reminder is off by default.

### 7.2 Timing and frequency

- **At most 1 per day (R11).** Sent at `W + 30 min` only if no session has been played or declined today. Never between 21:00 and 06:00. No 10 PM "streak saver". No email, ever.
- **A fixed rule instead of Duolingo's learned timing** (23.5 h after the last session). An adaptive send policy confounds missed sessions as a signal (R6). The Bidargaddi effect size says a fixed rule gives up little.
- **Interruption level Passive** on iOS (`UNNotificationInterruptionLevel.passive`). On Android, one channel "Morning reminder" at `IMPORTANCE_LOW`. Never Time Sensitive or Critical (Apple HIG: "accurately represent the urgency").
- **Thinning:** once 7 of the last 10 lit mornings started without a reminder, the reminder goes to every other day (Stawarz 2015: reminders add repetition but hinder automaticity). It goes back to daily after 2 reminder days with no session.
- **Back-off:** after 3 reminder days in a row with no session, one last line and then silence: "Reminders are paused. The lantern is here whenever you want it." Reminders resume by themselves after the next lit morning. No win-back and no seasonal pushes. Role model: Duolingo's "These reminders don't seem to be working. We'll stop sending them for now." Deviation: 3 instead of about 8, with no escalation in between. The constraint is the guilt escalation Duolingo used by day 3 (Growth Dives teardown). No clinic mention in the push (R14). The hub gets a `reminders_paused` event, and re-engagement belongs to the care team through the CUSUM.

### 7.3 Copy

- **The pool.** Eight world-only lines, chosen oldest-used first, none repeated within 7 days (Duolingo's recency penalty, KDD 2020: fresh templates convert better; reuse desensitises).
  1. "First light on the island."
  2. "The lantern is ready."
  3. "Snow on the jetty this morning."
  4. "The lighthouse is lit."
  5. "A quiet morning on the shore."
  6. "The aurora is still out."
  7. "Morning on the island."
  8. "The sauna stones are warm."
- **What the copy never does:**
  - no "you" (except the final back-off line);
  - no mascot emotion and no imperative;
  - no streak, missed day, clinic, mood or health;
  - no bandit on open rate.
- **Actions.** Two notification actions:
  - "Not today" logs `declined` and holds the streak;
  - "Pause 7 days" is a streak and reminder pause (watchOS "Mute 1 Hour" per-notification action pattern).

### 7.4 What else is not a notification

- The weekly check-in stays a pill on the start screen (`#weeklyBtn`, already built in `main.js` `weeklyPill()`), not a push. It respects R11.
- Milestones, freezes, visitors and quotes never trigger a notification.
- Rating prompt: none during the pilot. Later, only after day 14, after a session whose end mood is at least its start mood, at least 14 days after the last ask, and never inside play (Apple HIG).
- Widget (later): a static lantern that opens the session in one tap. It never changes with the time of day or a missed day and shows no number on the lock screen. Anti-model: Duolingo's widget, where Duo grows "increasingly panicked" (blog.duolingo.com/widget-feature), and its "sick Duo" icon backlash. No Live Activities.

### 7.5 Logging

`reminder_sent_at`, `template_id`, `reminder_thinned`, `reminders_paused`, and the existing session fields `reminder_iso` and `time_to_start_s` (SessionSchema.md). A reminder converts if Begin follows within 2 h (Duolingo's definition).

## 8. Welcome back after a lapse

The best return is one that looks like any other morning (Dai, Milkman and Riis: landmarks "make people feel disconnected from their past imperfections").

| Moment | What happens | Role model | Never |
|---|---|---|---|
| Start screen | Identical to any morning. The village is lit. The streak number is restored silently (repair) or simply absent | Animal Crossing "a world with endless forgiveness" (Killscreen) | "Welcome back", a count of days away, a full-screen return screen (Duolingo "Am I dreaming?", with no exit, is the anti-model) |
| Play | `rust` eases the level slightly (up to 0.06) and the morning warm-up applies (5.3). Returning feels manageable, not humbling | Minigames 0.2 rust; Crash Bandicoot invisible help | Any sign that help is on |
| End | The dawn visitor is already waiting on the jetty when the mote lands, instead of walking in. It is the visitor met last time (recognition). Gaps of 2 days and 20 days get the same extra | Milkman et al. 2021, gym megastudy: a bonus for returning was the best of 54 interventions [K]; Animal Crossing villagers glad to see you | A bigger bonus for a longer gap, which would reward absence |
| Week view | A new week is a clean row every Monday | Fresh start effect | Gaps drawn as X, grey or red |
| Reminders | Resume by themselves after this session | Duolingo resume pattern | A "we missed you" push |
| Care team | Missed sessions drift the composite. The CUSUM can reach "consider a check-in call" and the clinician decides (X12, X17) | Supportive Accountability (Mohr 2011); Efficiency Model of Support (Schueller 2017) | The app escalating to the patient |

Lapses split into people who feel guilty and people who are done; prompts help the first group and feel judgmental to the second (Epstein 2016). That is why return prompts stop after 3 reminders and the human handles real lapses.

## 9. What we never do

| Never | Why | Source |
|---|---|---|
| Show 0, a broken or extinguished flame, red, a loss animation, "you lost your streak", "you missed" | A visible broken streak lowers later behaviour, more so with self-blame | Silverman and Barasch 2023; hopelessness theory [K] |
| Guilt mascot or emotional copy ("you're scaring me") | Guilt escalation; dark pattern "emotional steering and nagging" | Growth Dives Duolingo teardown; Melbourne Mental Health Apps Report 2023 |
| The streak in a push, an evening "streak saver", any push 21:00 to 06:00 | Loss framing; sleep harm; the night rule | V6; Duolingo 10 PM reminder (Shuttleworth) |
| Time Sensitive or Critical notification levels, email, more than 1 notification a day | Misrepresents urgency; notification load | Apple HIG; Fitz 2019 |
| Clinic, health, mood or missed-day words on the lock screen | Reveals psychiatric care to anyone nearby | Iwaya et al. arXiv 2201.09006 |
| Streak Wager (+14% D7 at Duolingo) | The strongest loss-aversion frame; a lost bet confirms hopelessness | Duolingo blog; Tversky and Kahneman 1992 [K] |
| Gems, currency, shop, paid or gem-priced freeze or repair | Economy contaminates effort and reward measures; partial care for those who cannot pay | Finch paywall critique (Pratt IXD); Duolingo 400-gem refill |
| "Perfect week" or "perfect streak" badge, "max streak" stat | Ranks frozen days as worse; shows a past high as a loss | Apple pre-watchOS 11; annoyance M5 |
| Leaderboards, leagues, friend streaks, share grids, public posting | Social comparison harms; sharing reveals a diagnosis | Borghouts 2021; ethics H3 |
| Loot, rarity tiers, "chance of a rare visitor", empty silhouettes, "12/40" collection counts, "new!" badges | Variable ratio and completion compulsion are the core of gacha | Zendle and Cairns 2018; Octalysis black hat (Chou) |
| Time-limited events, missable seasonal exclusives, expiring rewards | FOMO | Project Horseshoe "Coziness" (lostgarden.com 2018); BeReal DAU collapse (15M to 6M) |
| Decay while away: weeds, cockroaches, leaving villagers, dying trees, HP damage, a sad pet | Guilt keeps players from returning | Killscreen, Destructoid on Animal Crossing; Habitica [K]; Forest |
| "Play again", endless or bonus mode in the morning, content that keeps people in bed | One a day is the hook; staying in bed harms | Wordle; Pokemon Sleep dropped video concepts |
| Any overlay inside play (permission, toast, quote, rating) | Interrupting a task | Apple HIG ratings guideline |
| Rewards contingent on mood, vitals, RT, Fork choice or Two lanterns outcome; light as a currency | Contaminates the measures; overjustification | Treadway EEfRT; Deci 1999; Mekler 2017 |
| Director, DDA or bandit optimised for return, session count or length | Exploiting a vulnerability | EU AI Act Art. 5(1)(b) |
| Learned send-time bandit | Confounds missed sessions as a signal | Ethics N3 |
| A fake "your clinic saw your week" | Deception erodes the trust Supportive Accountability depends on | Mohr 2011 |
| "66 days to form a habit" on screen | The range is 18 to 254; reads as failure | Lally 2010 |
| Removing the streak automatically after the habit forms | Taking away a liked number is a loss | Wordle NYT reset backlash |
| A second goal system ("5 of 7" mode), a "one small thing" to-do after dawn | Clutter; an undone to-do is a guilt source | Annoyance cuts (B, M26) |
| Pledges, affirmations, imperatives, mood-contingent quotes | Broken pledges and affirmations backfire at low self-esteem | Wood et al. 2009 [K] |
| Panicked or sick widget, Live Activities | Persistent nagging presence | Duolingo widget and icon backlash |
| A longer ending to raise remembered pleasure | Peak-end ethics | Kahneman et al. 1993 |

## 10. Metrics to watch

These are pilot metrics on the hub. We report them; we never optimise for DAU or minutes.

| Metric | Definition | Proposed target or reading | Reference |
|---|---|---|---|
| Lit mornings per week | Share of non-paused days with a lit morning | Median at least 5 of 7 in weeks 1 to 8 | Lally: misses one at a time do not matter |
| D7, D14, D30 retention | Lit morning on day 7 / 14 / 30 after discharge | Far above the mental-health app median of 3.9% at D15 and 3.3% at D30 | Baumel 2019 |
| First-week survival | Patients with at least 5 lit mornings in days 1 to 7 | Watch closely: the most fragile week | Duolingo |
| Reminder conversion | Begin within 2 h of a reminder (`time_to_start_s`) | Descriptive only; never fed back into timing | Yancey and Settles 2020 |
| Back-off events | `reminders_paused` per patient-month | Each one should line up with a CUSUM review, not a push | Section 7.2 |
| Not today rate | Declined days / days | Context for the clinician; a rising rate is information, never a target | Decisions #35 |
| Freeze, repair and pause use | Counts per patient-month | Descriptive; check against the missed-sessions sensitivity | Section 6.7 |
| Replays and night sessions | Same-day replays, sessions 00:00 to 04:00 | Shown as context (insomnia, compulsive use), never an alert | Ethics S1 |
| Session length | Median duration | Must not drift up over weeks | X7 |
| End skip rate | Share of end sequences skipped by tap | High rates mean the 5 s budget is too long | R12 |
| Harm check | Every 4 weeks in the weekly check-in: "Afferent feels like: a help / neither / a pressure" (needs clinical sign-off) | "A pressure" under 10% of answers; every such answer suggests the hide toggle in the patient view | NICE ESF Standard 2 |
| Mood validity | `mood_end - mood_start` on milestone days vs other days | No difference expected; a difference means the celebration leaked before the check-in | R10 |
| Measurement guard | `missed_sessions` sensitivity in long-streak vs short-streak patients; core RT practice drift; DDA miss share; assist rate | Stats agent | Ethics A3, P14 |

## 11. Build list

Owners follow `design/lookdev.md` 13.1 where files overlap. `demo/js/streak.js` is new and owned by the engagement engineer; `moments.js` (lookdev) calls it.

### Tonight, must

| # | Item | Files |
|---|---|---|
| M1 | Decisions rows D1 to D8 (section 12). Fix the "no streak" lines and the `coreloop.md` pointer | `Decisions.md`, `GameDesign.md` (pillar 3, section 9), `DesignSystem.md` rule 3, `design/lookdev.md` section 9, `design/minigames.md` 0.5 and section 0 rules |
| M2 | Hub streak rules to section 6:<br>- lit morning = core with input;<br>- 2 freezes at start, earned per 7 mornings lit, cap 2;<br>- 3-day silent repair;<br>- no drop to a shown 0 (`streak` null below 2);<br>- streak pause separate from sharing;<br>- `mornings_lit` and `week[].state` (`lit`, `missed`, `frozen`, `rest`, `today`) in the patient view | `hub/afferent_hub/views.py` `streak()`, `patient_view()`; `contracts/api.md` patient-view section; `contracts/fixtures/patient_view_anna.json`; `demo/data/patient_view_anna.json`; `hub/tests/test_api.py` `test_streak_and_freezes` (update the asserts: today 0 freezes at start and resets to 1 after a gap) |
| M3 | Phone-side streak, computed offline with the same rules, so it works with sharing off. Day log `afferent.days.v1` in `localStorage` (try/catch), 04:00 boundary | `demo/js/streak.js` (new, `A.Streak`), `demo/index.html` script tag |
| M4 | Start screen mornings chip: small, above the figure in the eye zone (6.2), 06:00 to 21:00, from 2, absent otherwise. "See you tomorrow." once today is lit | `demo/index.html` `#start`, `demo/js/main.js` `morningText()`, `goHome()`, `demo/css/flow-ui.css` |
| M5 | End order and Shine:<br>- dawn;<br>- check-in;<br>- tick plus the village mote (lookdev 8.3);<br>- quote;<br>- settle.<br>At most 5 s after the check-in, a tap anywhere skips, no number at night | `demo/js/main.js` (`A.bus.on('mood')`, `endScreen`), `demo/index.html` `#end`, `demo/css/game-ui.css`, `demo/css/flow-ui.css` |
| M6 | Quote: a starter pool of about 30 lines marked pending review, chosen by date, replaced by the crisis offer. A quote after each session was not found in `demo/` at the time of writing | `demo/data/quotes.json` (new), `demo/js/main.js`, `demo/index.html` `#end` |
| M7 | Patient view: "Mornings lit" number plus week glyphs (frost rim, set-down lantern, unlit lantern). No streak number | `demo/js/patient.js` `renderWeek()`, `demo/css/patient.css`, `demo/patient.html` |
| M8 | Gameplay safety in the spec, applied when `skill.js` lands: miss-share guard, morning warm-up, silent combo loss, same-pitch "barely", no blitz decay in the first task | `design/minigames.md` 0.2, 0.5, 0.6; later `demo/js/skill.js`, `demo/js/juice.js` |
| M9 | Firewall test: `streak()` and the village output are identical for the same statuses whatever the mood, RT, Fork or Two lanterns values | `hub/tests/test_api.py` |

### Tonight, should

| # | Item | Files |
|---|---|---|
| S1 | Log freezes, repairs and pauses: `streak_protection`, `pause_source` (patient or clinician), `pause_until`; patient pause excluded from the missed denominator, clinician pause excluded (stats agent confirms) | `contracts/daily.v1.schema.json`, `SessionSchema.md`, `hub/afferent_hub/analytics/features.py` `missed_flag()`, `Statistics.md` |
| S2 | Settings:<br>- "Show the morning count" (hide toggle);<br>- "Show a line after the session";<br>- Pause menu (Today, Until Monday, Until next month, Custom date, capped at 14 days);<br>- "Morning reminder" switch and wake window | `demo/index.html` `#settings`, `demo/js/main.js` `saveSettings()`, `toggles()` |
| S3 | Onboarding screen (section 6.8), `?onboard=1` for the demo | `demo/index.html` (new `#onboard` card), `demo/js/main.js` |
| S4 | Milestone landmarks at 3, 7, 14, 30, 50 and 100 mornings lit, lit on the Shine; the boat's distance to the jetty as the tomorrow hint; `?village=N` already planned | `demo/js/world.js` `village()`, `demo/js/moments.js` (lookdev), `demo/js/streak.js` |
| S5 | Peak-end: no-overrun check before the last task, quiet assist on the final boss item after 2 of the last 3 trials missed, `slot` covariate | `demo/js/engine.js`, `GameDesign.md` 0.1 |
| S6 | Morning reminder through Capacitor Local Notifications:<br>- Passive level;<br>- 8-line pool, oldest used first;<br>- thinning, back-off and resume;<br>- actions "Not today" and "Pause 7 days";<br>- logging.<br>Check whether the plugin exposes the iOS interruption level; otherwise set it natively | `package.json` (`@capacitor/local-notifications`), `demo/js/remind.js` (new), `demo/data/reminders.json` (new), `ios/App/`, `capacitor.config.json` |
| S7 | Clinic data export: one zip (sessions NDJSON, daily CSV, features CSV, codebook), including `streak_protection`, reminder fields and SIMULATED flags | `hub/afferent_hub/api/routes.py` (`GET /api/patients/{id}/export`), `hub/afferent_hub/service.py`, `hub/afferent_hub/web/clinic/views.js` (button in `V.detail`), `contracts/api.md` |

### Later

| # | Item | Files |
|---|---|---|
| L1 | Dawn visitors and visitor book (only those met, no blanks, no counts, patient view only). Species schedule from section 4; return-morning variant (section 8) | `demo/js/visitors.js` (new), `demo/js/world.js`, `demo/js/patient.js`, `demo/patient.html`, art assets per `ArtBible.md` |
| L2 | Seasons towards spring keyed to `day_index`; start where yesterday ended | `demo/js/world.js`, `demo/js/fx.js` grade presets, lookdev 9 NICE |
| L3 | Bedside sunrise routine at the wake time; push off when it is on; brightness cap | `hub/afferent_hub/bedside/`, `hub/afferent_hub/settings.py`, `demo/js/main.js` settings |
| L4 | Static lantern widget (no number, no mood change) | `ios/App/` (WidgetKit extension) |
| L5 | Harm-check item every 4 weeks (clinical sign-off first) | `demo/js/main.js` `WEEKLY_ITEMS`, `contracts/api.md` weekly check-in |
| L6 | "Your clinic saw your week" mark, only on a real clinician view event | `hub/afferent_hub/ws/`, `hub/afferent_hub/views.py`, `demo/js/patient.js` |
| L7 | Morning sound follows the silent switch, haptics carry the cues (X28 puts sound out of scope tonight) | `demo/js/audio.js` |
| L8 | Quote pool to 365 lines, clinician curation workflow | `demo/data/quotes.json` |
| L9 | Light buddy (opt-in, sees only lit days, never misses); privacy review first | none yet |

## 12. Decisions to log and conflicts resolved

| # | Topic | Options | Decision | Reason |
|---|---|---|---|---|
| D1 | Streak scope | No streak anywhere (GameDesign, DesignSystem rule 3, lookdev 9, minigames) vs a Duolingo streak (brief, `views.py`) | A streak number on the start screen (06:00 to 21:00) and the end-screen tick only. The game, the village and the patient view have no streak number. The patient view shows "mornings lit" | Keeps the brief's Duolingo streak and keeps the patient view calm (ethics E4 and annoyance A4 both satisfied) |
| D2 | Repair | 3 of the next 4 mornings, once per 30 days (theory) / 3 mornings within 7 days, no cap (ethics) / the next session relights up to 3 days, once per 30 days (annoyance) | The next lit morning repairs up to 3 unprotected days. Silent, no cap, history unchanged | Cheapest repair (annoyance, Silverman); no second failure point (ethics); truthful week (ethics G8) |
| D3 | What counts | Fixed core with input (ethics E1) vs completed or partial with at least 1 task (annoyance M1, lookdev 9) | Fixed core with input, for the streak, the village and the week alike | Aligns the habit with the measurement (ethics). One rule so nothing disagrees (annoyance) |
| D4 | Pause | `views.py` treats sharing `paused` and `nothing_tonight` as streak-neutral | A separate streak pause (Apple menu, patient cap 14 days, clinician no cap). Sharing stays a privacy control. With sharing off the phone keeps the streak locally | Privacy and rest are different decisions; the hub cannot see a withheld day anyway |
| D5 | Visitor and milestone timing | At dawn (annoyance) vs after the end check-in (ethics), overnight arrival on the start screen (daily-games) | After the end check-in, inside the Shine, within the 5 s budget. Dawn identical in every session. No overnight arrival before `mood_start` | Pre/post mood validity (R10) without adding cards or time (R12) |
| D6 | DDA target | Raise `p*` to 0.85 and 0.90 (ethics) vs keep 0.75 to 0.80 (annoyance) | Keep `p*`; add a miss-share guard (15% tempo and puzzle, 10% calm) and the morning warm-up | Graded outcomes mean 0.78 is about 10% misses, not 22%; challenge stays, failure stays rare |
| D7 | Milestones | 3, 7, 14, 30, 66, 100 (theory, ethics) vs 3, 7, 14, 30, 50, 100 (annoyance), on streak or mornings | Mornings lit: 3, 7, 14, 30, 50, 100, then every 50 | No 66-day lecture; a break never delays one |
| D8 | Reminder timing | Behaviour-timed 23.5 h (annoyance, daily-games) vs a fixed rule from the wake window (ethics) | Fixed rule (W + 30 min), thinned and backed off by fixed, logged rules | Keeps missed sessions clean as a signal |
| D9 | Permission ask | At onboarding with the clinician present (ethics) vs after the 3rd lit morning (annoyance, not-annoying) | After the 3rd lit morning only | The stricter version survives both reviews |
| D10 | Fade after day 66 | Offer once to move the count (ethics E15) vs cut (annoyance M23) | Cut. The hide toggle plus the 4-weekly harm item cover it | One fewer ask; no loss of a liked number |
| D11 | Weekly "5 of 7" goal mode, "one small thing", Wordle share grid, light buddy | Adopted by some researchers | Cut or deferred | Annoyance (two goal systems, a to-do in a done state) and ethics (sharing reveals a diagnosis) |
| D12 | Weekly check-in delivery | A push (GameDesign 9) vs a start-screen card (annoyance M27 option 1) | Start-screen pill, as already built | The interruption budget (R11) |

Open questions for other agents:
- **Stats:** the pause denominator, the 04:00 boundary against X25, the streak covariates, the RT practice drift.
- **Clinical:** the quote pool, the harm item, the end order (check-in before the celebration), the onboarding copy.
- **Producer:** whether the UNO Q can run a timed sunrise without the phone; the Capacitor plugin and the iOS interruption level.
