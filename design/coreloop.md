# Afferent core loop v1: the Ride

Status: build spec. Written by the core loop designer for David's highest priority: "you have to make the game actually playable. I don't get why it's always not doing anything for a very long time. The user has to actually do something, not just watch. Make it fun." Owned in the build by ONE traversal builder (section 12). It replaces the auto-walk, the passive core and the passive dawn. It does not change any task content (`design/minigames.md` owns that) or the look (`design/lookdev.md` owns light, grade, figure art and camera mechanics); section 13 lists every point where this file and lookdev meet.

Rule for everyone, from the orchestrator: outside deliberate, clearly signalled holds (where the player keeps a finger down), the player is never without something to do for more than about 2 s.

## Morning ritual

David: "the idea is you play this every morning." Afferent is a daily morning ritual, not a bedtime game.

- **When and where.** Played in bed right after waking, about 2 minutes, one hand. The reminder comes in the morning.
- **The arc is the waking up.** The in-game polar night to dawn is the player's own waking: the session starts in the dark harbour, the player kindles the lantern, rides it through the hills and carries the light up the fell into the morning. Dawn is the payoff of waking up, not a send-off to sleep.
- **The bedside light is a wake-up light.** Role model: Philips Wake-up Light sunrise simulation. The light rises with the in-game dawn, from a dim warm glow while the world is dark to full warm daylight when the sun is up on the summit (8.2), so the room wakes with the player.
- **The director's common morning cases.** Most common: morning grogginess, eyes keep closing (fatigue mode: wake them gently and get them engaged, never harsh). Next: low pulse after sleep (wake mode: more tempo, more lift). Then: an anxious high pulse before the day (calm mode: slow swells, breathing down). Flow is the good morning.
- **Same time every morning is a strength for the analytics.** Measuring at the same point of the day, right after waking and before coffee and the commute, makes resting pulse and reaction time comparable day to day, so trends mean something.
- **Night is a fallback, not the main path.** Playing at night still works: rest mode, the drift, and falling asleep is allowed (6.5, Night fallback section). In the morning, eyes closing means fatigue, the player is helped awake.

## 0. Verdict

Today the player is a passenger. The figure walks by itself, tasks pop up in a card, the rest, the fades and the dawn are watched. The Ride makes the whole session one continuous, one-finger traversal: the hooded figure slides standing on the snow (Journey), over rolling hills, hold to press down into the slope, let go to lift off and glide (Tiny Wings, Sky). It never stops, never crashes and never fails (Alto's Odyssey Zen mode, Canabalt's endless run without its death). The director shapes the hills: calm becomes long swells timed to slow breathing, wake becomes short steep hills with big flights, fatigue adds beat-locked crest lights and daylight, rest flattens into a drift on the harbour ice. Tasks are places the world brings to you on the path (the bell tower rises on the next crest, the slope forks at a cairn), and their result flies home into your lantern while you are already sliding again. The session opens with "hold to kindle the lantern" and ends with "hold to give the light to the sun" on the summit: the player carries the light up into the morning, and the bedside light rises with that dawn.

## 1. What I measured in today's game

Method: headless Chrome, 390x844, `http://localhost:8000/app/?dev=1`, sampled every frame, every input logged (`scratchpad/pw/coreloop_probe.js`, outputs `cl_good.txt`, `cl_bad.txt`, `cl_night.txt` and `coreloop_*.json` in the same folder). Autoplay is a best case: it taps the instant a target is ready, so a human has more dead time, not less.

| Run | Length | Taps | Gaps over 2 s without any input | Time inside those gaps | Longest gaps |
|---|---|---|---|---|---|
| good day, morning, autoplay | 107 s | 64 | 15 | 65 s (61%) | 10.1 s at the start, 7.9 s dawn plus end, 5.4 s fork end to threads |
| bad day, morning, autoplay | 106 s | 40 | 16 | 74 s (70%) | 10.3 s start, 8.4 s fork end to bells, 8.0 s dawn, 6.6 s beacon |
| live, night, autoplay | 109 s | 39 | 14 | 81 s (75%) | 21.7 s breath to the end, 10.4 s start, 8.7 s fork to loyly |
| live, morning, touch, nobody touches | 133 s | 0 | the whole session | 100% | it plays itself to dawn: walks continue, every task times out (threads 14 s, stars 12 s) |

Second by second (good day): 0 to 8 s nothing (fade 2 s, rest 6 s); 8 to 10 the check-in; 11 to 24 one tap every 2.5 to 3.5 s (reaction); then the pattern walk 2 to 3 s, task, outro 0.7 s, walk, repeated 6 times; 100 to 104 dawn, watched; 104 to 106 end check-in. 33 of 107 seconds have nothing to do at all, 11 more are waiting for a stimulus.

Root causes:

1. **The app defaults to autoplay.** `main.js` line 33: `input` falls back to `'auto'` (the "input: autoplay story" chip) when the URL has no `input=`. Opening `/app/` plays the session by itself, check-in, taps and all. This alone explains "it's always not doing anything for a very long time". Fix in section 12 (default `touch`).
2. The figure moves on its own (`engine.js` 427 to 429, `planWalk`), 6 to 8 walks of 2 to 3 s each.
3. Rest (6 s), fade in (2 s), dawn (4 s), task outros (0.7 s each), the fork reward (1.1 s per round) and lantern feedback are watched.
4. Nothing ever requires you: every task times out into an auto finish and the next walk starts anyway.

## 2. Role models and the exact pattern taken

| Game | Pattern taken 1:1 | Changed, and the constraint that forces it |
|---|---|---|
| **Tiny Wings** (Illiger 2011) | The verb: hold makes you heavy (press into the slope, dive in the air), release makes you light (fly off the crest). Rolling hills; speed comes from pressing on the down slope and letting go on the up slope; a landing tangent to a down slope is the "great slide" and keeps speed. The hill rhythm is the game | No night timer or end of the day (no pressuring timers). No stall: a hard speed floor (no fail). Camera follows height by tilting, not by zooming out (lookdev 6.1: zoom never below 1.00) |
| **Alto's Odyssey, Zen mode** | Endless one-touch flow with no score and no crash, ambient music. Coin lines in the air teach the jump arc wordlessly: our light motes lie on the ideal arc. The world sends props at you, never a menu | No backflips or grinds (one verb only, lying in bed). No falls, ever |
| **Sky: Children of the Light** | Hold to light a candle: a ring of light fills while you hold (session start: kindle the lantern). Collected light shows as glow on the character, never as a number. Cape glide: when you let go in the air you sink slowly | No flight energy that runs out (no fail). Glide is only on release, so the verb stays Tiny Wings |
| **Journey** | Sand surfing: the robed figure slides standing on its feet, cloak and scarf streaming. The final ascent: you carry your light to the summit and walk into the sunrise. The goal is always on the horizon (the lighthouse) | Snow instead of sand. The summit is a short hold, not a long climb (session under 2:00) |
| **Canabalt** | One button, the run never pauses, the world is generated ahead of you and announces the next thing at the right edge in time to react | No death, no crates, no speed-up to failure |
| **Florence** | The scene narrows into an interaction and the object you approach becomes the frame; the interaction is the story beat, then the world opens again | Lookdev's mote-plus-scale envelope is reused (lookdev 7.2, decision 18); only its origin moves to the station prop |
| **Apple Watch Breathe** | A felt train of light ticks at 1 Hz while you breathe in, silence while you breathe out (calm swells) | Only in calm; the swell clock is the hill, not a fixed screen ring |
| **Rhythm Heaven, osu!** | The approach ring that closes exactly when the beat lands, and a count-in on the beats before it (fatigue crest lights) | Same visual language as the beacon task, so nothing new to learn |

## 3. Input verbs (one finger, anywhere on the screen, lying in bed)

| Verb | Where | Meaning in the Ride |
|---|---|---|
| **Hold** | anywhere | Heavy: on the ground the figure crouches and presses into the slope (accelerates downhill, slows uphill, never leaves the ground); in the air it tucks the cloak and dives |
| **Release** | lift the finger | Light: on the ground it stands tall and opens the cloak, and an up slope throws it into the air at the crest; in the air the cloak spreads and it glides with a slow sink |
| **Tap** | anywhere | A short hold (no separate meaning); taps inside tasks belong to the task |
| **Hold to kindle** | session start (rest) | Keep a finger down, stay still: the lantern gathers light |
| **Hold to give** | summit (dawn) | Keep a finger down: the figure lifts the lantern and the sun rises with your hold |

Space on a keyboard is the same as a finger. No swipe, no second finger, no tilt. The whole screen is the button, so the thumb can rest anywhere (bed, one hand).

**Readable in 1 s without words.** The first time the ride starts (the leap off the pier, 6.3), a ghost finger presses on the lower third if there is no touch 0.6 s after landing on the first down slope; the figure visibly crouches with the ghost press, speeds up with a soft streak, the ghost lifts at the valley, the figure stands and flies over the crest through a line of motes. The ghost repeats only after 2 hills without any touch, never faster than 1 Hz, and is steady (no flashing). Crouch while pressed and cloak open while released are the permanent feedback, so the cause is always on the figure.

## 4. Physics (traverse.js)

Units: `u` = CSS px at `H = 844` (`u = H / 844`). World `x` to the right, height `h` up from the baseline. The baseline is lookdev's ground line `gy` (`0.82H`); valleys sit on it, hills rise above it. Fixed substeps of 1/120 s. Speeds are along the surface on the ground.

### 4.1 Terrain

- A hill is one segment `[x0, x0 + L]`, valley to crest to valley, height `A`, crest at fraction `c`: `s = (x - x0) / L`; `h = A (1 - cos(pi s / c)) / 2` for `s < c`, else `h = A (1 + cos(pi (s - c) / (1 - c))) / 2`. C1-continuous, flat at every valley and crest.
- Hills are generated one at a time, at least 1.5 screen widths ahead, from the director's mode and intensity at generation time (a mode change shows on the next hill, never under the figure).
- A **station** is a flat bench at valley height (`h` 0 to 20 u), 180 u long, where the figure arrives for a task. Stations are always at valley height so the figure stands at about `0.82H`, under the task stage (`box()` ends at `0.58H`).
- **Rest drift** terrain: no hills, a gentle down slope of 2% onto the harbour ice with 10 u swells.
- **Summit**: the final hill is the fell, `A` x1.6, crest flattened into a 140 u plateau with a cairn.
- `V.terrain(wx)` returns `h` in u, so world.js and traverse.js draw and collide with the same function.

### 4.2 Motion

```
ground:  theta = atan(h'(x)); g_eff = g * (hold ? HOLD : 1)
         v += -g_eff * sin(theta) * dt
         v = max(v, VMIN)                               // hard floor: the wind at your back, never stalls
         if v > VMAX: v -= (v - VMAX) * 1.5 * dt
         kappa = h''(x) / (1 + h'^2)^1.5
         if !hold and h'(x) > -0.02 and -kappa * v^2 > GLIDE * cos(theta): launch
         else x += v * cos(theta) * dt
launch:  vx = v cos(theta); vy = v sin(theta) + BOOST * v
air:     vy -= (hold ? g * DIVE : GLIDE) * dt
         if !hold: vy = max(vy, -SINK)                  // cloak glide (Sky)
         vx = max(vx, 0.8 * VMIN); speed capped at 1.2 * VMAX
         x += vx dt; y += vy dt
landing: when y <= h(x): angle between velocity and the surface tangent
         if angle <= SILK: v = |vel| * (1 + SILK_BONUS)  // great slide
         else v = max(dot(vel, tangent), VMIN)           // soft landing, a snow puff, never a stop
```

The launch test uses the light glide gravity `GLIDE` instead of `g`: once you let go, the cloak catches the air. This is what makes "release on the up slope" throw you.

### 4.3 Starting constants and targets

Starting values come from a 60 s simulation per mode with three bots (`scratchpad/ride_sim.js`, run with `M` set to the constants as JSON, see `tune.sh` beside it): a good player (hold on down slopes, release on up slopes, dive when descending over a down slope), nobody touching, and a finger that never lifts. Tune the constants until the **targets** hold; the targets are the spec, the constants are a start.

| Constant (u, s) | calm | flow | wake (k 0 to 1) | fatigue (k 0 to 1) | rest drift |
|---|---|---|---|---|---|
| hill `L` | 1000 to 1200 | 760 | 640 + 120 (1 - k) | 600 | none |
| hill `A` | 110 | 140 | 150 + 40k | 130 | 10 |
| crest `c` | 0.30 to 0.36 (long down slope) | 0.5 | 0.5 | 0.5 | |
| `g` | 160 | 300 | 440 | 420 | |
| `HOLD` (ground) | 1.8 | 2.0 | 2.2 | 2.0 | |
| `DIVE` (air) | 1.6 | 2.4 | 3.0 | 2.6 | |
| `GLIDE` | 45 | 130 | 200 | 220 | |
| `SINK` | 30 | 100 | 170 | 160 | |
| `BOOST` | 0.08 | 0.16 | 0.24 + 0.08k | 0.18 (+0.25 on a beat kick) | 0 |
| `VMIN` / `VMAX` | 70 / 150 | 110 / 280 | 160 / 380 | 150 / 330 | 20 / 40 |
| `SILK` / bonus | 22 deg / 0 | 14 deg / +10% | 11 deg / +15% | 13 deg / +12% | |

Simulation of these constants (good bot / nobody / always holding):

| | s per hill | hold, release median | air share | apex over the crest |
|---|---|---|---|---|
| calm | 8.6 / 10.0 / 8.6 | 4.3 s, 4.5 s | 0 | none (grounded swells) |
| flow | 3.2 / 4.3 / 4.3 | 1.1 s, 1.9 s | 35% | 22 u |
| wake | 1.8 / 2.7 / 2.5 | 0.9 s, 2.8 s | 73% | 194 u |
| fatigue | 2.7 / 2.9 / 2.6 | 0.5 s, 2.3 s | 32% | 53 u |

Targets the builder must hit with the in-game bot (section 11), median over 30 s per mode:

| Target | calm | flow | wake | fatigue |
|---|---|---|---|---|
| seconds per hill, good bot | 9 to 10.5 | 3.5 to 4.8 | 2.4 to 3.2 | 2.6 to 3.1 (4 beats) |
| hold / release median, good bot | 4.0 / 6.0 (plus or minus 0.6) | 1.4 / 2.4 | 0.9 / 1.8 | 1.2 / 1.7 |
| good bot faster than nobody by | 0 to 10% (calm never rewards speed) | 20 to 40% | 25 to 50% | 20 to 40% |
| apex over the crest, good bot | 0 to 40 u | 40 to 110 u | 110 to 260 u | 60 to 150 u |
| silk landings, good bot | 60%+ | 40 to 70% | 30 to 60% | 40 to 70% |

Nobody touching, in every mode: the figure keeps moving, never drops below `VMIN` and reaches every station.

The current constants miss three targets (calm release 4.5 s instead of 6, wake hills too fast for the good bot, no silk landings yet because the bot dives late); these are tuning items, not design changes.

### 4.4 Light motes (pickups)

- Motes are 3 u warm dots with a soft halo (`A.J.spr('mote')`, colour `lantern-flame`, at night `lantern-warm` at 60%). They lie on the good bot's trajectory, simulated when the hill is generated, every 28 u (Alto's coin lines): grounded parts of the line sit at crouch height on down slopes and at standing height on up slopes, so pressing on the way down and letting go on the way up gathers all of them; airborne parts trace the ideal arc.
- Collect radius 22 u around the lantern. A collected mote flies into the lantern on an accelerating curve (`inQuad`, 0.25 s), the flame grows a notch, and the **trail** behind the figure gets longer (a 24-point ribbon of light from the lantern, length `40 + 160 * (1 - exp(-light / 30))` u). No number exists anywhere. Missed motes drift away slowly; nothing is lost.
- Per hill: calm 4, flow 6, wake `8 + 6k` (plus one cluster of 5 at apex height), fatigue 6, rest 0.
- The trail persists through tasks and is what you carry to the summit (8.2).

### 4.5 Feedback for every input (juice)

| Event | Visual | Haptic (`A.J.hap`, fallback `navigator.vibrate`) | Sound hook (silent, `A.J.sfx`) |
|---|---|---|---|
| Press on the ground | crouch 0.88 y over 80 ms, cloak tightens, a warm press glow on the snow under the feet, snow spray from the heels at speed | `tick` (calm: `tick` train at 1 Hz while held, Breathe) | `ride_press` |
| Release on the ground | stand tall over 120 ms, cloak opens | none | `ride_release` |
| Launch | stretch 1.12 y for 100 ms, scarf whips, 6 snow motes off the crest | wake apex over 150 u: `medium` | `ride_launch` |
| Glide | cloak spread 1.0, scarf flowing, sink visibly slow | none | wind |
| Dive in the air | cloak tucked, slight forward pitch | `tick` on press | |
| Silk landing | land squash `sy 0.8, sx 1.15` for 120 ms, a warm streak along the slope for 0.4 s | `light` (calm: `tick`) | `ride_silk` |
| Soft landing | small snow puff, squash 0.9 | none | soft thump |
| Mote | the mote's flight into the lantern, flame notch | `tick`, at most one per 140 ms | pentatonic step per mote within a hill, reset per hill |
| Beat kick (fatigue) | warm burst at the crest light, extra lift | `light` | `ride_kick` |

Never a negative event. Rate caps from minigames 2.6 apply. Flash guard (minigames 2.5) for every bloom over 10% of the screen.

## 5. The director shapes the Ride

The ride reads the live mode and intensity `k` (engine `classify`, `intensity`) when it generates each hill. Mode identity in light and grade stays with lookdev 3.2.2.

| Mode | Feel | What changes |
|---|---|---|
| **calm** (high pulse, anxious before the day) | Slow, low, grounded swells; the rhythm pulls the breathing down | Hill period ramps per hill 6.0, 7.5, 9.0, then 10.0 s (good bot), so the press (4 s, down the long slope) and the release (6 s, up and over) settle at 6 per minute. Higher `k` (more aroused) starts the ramp at 7.0 s and widens the silk window to 26 deg (more assist, never more precision). No speed reward for skill, no launches, `tick` train at 1 Hz while pressing, silence while released, the lantern swells on press and ebbs on release. Motes slow, 4 per hill |
| **flow** (a good morning) | Neutral, light, playful | Middle constants. Nothing extra |
| **wake** (low pulse, common right after sleep) | Faster tempo, more pickups, more lift | Hill period 3.2 s at k 0 to 2.5 s at k 1, taller hills, bigger launches (`BOOST` up to 0.32), more motes and a sky cluster at apex height, camera rises with you (6.1). `medium` on big flights. Sparks per lookdev wake identity |
| **fatigue** (eyes keep closing, day; morning grogginess, the most common case) | Rhythm prompts and brightness that wake gently and pull the player in | Every crest carries a small lantern on a post. The ride's beat is locked to the predicted time the figure passes the crest: an approach ring (osu) shrinks to close exactly then; `tick` haptics on the two beats before it (count-in, tempo `84 + 12k` bpm as the hill target). Releasing within 180 ms of the pass is a **beat kick**: the crest lantern blooms, extra lift, `light` haptic, and world daylight rises 0.04 (cap +0.25 per session, through `daylightBoost`'s ride share). Eyes closed for 1.5 s during the ride: the next crest calls brighter (+30% glow, still under the flash guard) with `medium` on its count-in. Hill period about 2.9 s |
| **rest** (night fallback, tired) | A drift where doing less is right; eyes closed allowed | The swells flatten onto the harbour ice. The figure sits down on its cloak and drifts at 20 to 40 u/s whatever you do. Holding is optional and only slows the drift and warms the lantern (it follows the breath task's inhale if it runs). No motes, no prompts, no ghost cues. The 2 s rule does not apply in rest |

Mode changes mid ride: the hill under the figure finishes as generated; the next hill uses the new mode. Rest wins over everything at night: a planned station keeps its prop as scenery and the ride turns into the drift (6.5).

## Challenge in the traversal

David after playing: "Right now the game still doesn't feel interactive as a player. Just feels like you're watching something. The challenges are way too easy." The Ride must be a skill game in its own right, not a moving backdrop between tasks. This section adds timing, lines and risk and reward on top of sections 4 and 5 and uses the shared difficulty model of `design/minigames.md` section "0. Challenge and difficulty" (update rule, persistence, grades, combo tiers, bad-morning assist). Never a fail: no crash, no stop, no lost light, nothing shown as a failure; a mistake costs speed (tempo) or a chain tier (light), and the figure always rides on.

### Role models and the exact pattern taken

| Game | Pattern taken | Here |
|---|---|---|
| Tiny Wings | the perfect slide: land tangent to a down slope and keep all speed; three perfect slides in a row start fever (the bird glows, extra speed) until the next bad landing | landing grades and the fever |
| Alto's Odyssey | chains: every trick or grind landed within a short window keeps the chain and multiplies it, a bad landing or a pause ends it; coin lines show the line to take, high coin arcs reward a risky jump | ride chain, high lines |
| Canabalt | the world announces the next obstacle at the right edge in time to react; reading the terrain is the skill | gullies and irregular hills announced one hill ahead |
| Rhythm Heaven, osu! | graded timing windows around a beat with an approach ring | fatigue beat kicks graded perfect, good, barely |
| WarioWare | speed-up stingers inside a set and a boss stage at the end | hill ramp inside each ride segment, the summit as boss |

### Graded decisions on every hill

Every hill asks for at least three timed inputs, each graded perfect, good, barely or missed (minigames 0.5 grades, shown only through juice and haptics, never words or numbers):

1. **Press point.** Press on the crest as the down slope begins, hold all the way down. A late press loses the slope's acceleration (the natural cost, already in 4.2).
2. **Crest pop.** Release inside the window just before the launch point (4.2 launch test). Perfect or good adds +0.06 `BOOST` and a chain step; releasing earlier gives a lower flight (natural cost); releasing late means no launch, a grounded roll over the crest (costs flight and the high line).
3. **Landing (Tiny Wings slide).** Graded by the angle between velocity and the surface tangent against `SILK_eff`: perfect up to 0.5 x `SILK_eff` (great slide, the `SILK_bonus`, warm streak, `light` plus a `tick` glint); good up to `SILK_eff` (great slide, no glint); barely up to 1.6 x `SILK_eff` (today's soft landing, no chain step); rough beyond that (snow puff, speed x 0.75 but never below `VMIN`, chain drops one tier). Diving (hold in the air) too early lands on the up slope; too late lands steep: both are rough, so the dive is a real timing call.

Plus per hill, by `d`: the mote line (collect radius shrinks, so the line must be ridden, not brushed), a high line or a gully (below), and in fatigue the beat kick.

**No watching.** Every hill must offer a graded decision at least every 2.0 s at the player's current speed. When a flight would run longer than 2.0 s without one, the generator puts an air cluster at two heights mid-flight: hold to dive through the low one, glide to take the high one (both pay; the high one pays more and lands steeper). Signalled holds (kindle, give, the calm press), the Bite foreperiod and the rest drift stay the only exceptions (11.1).

### Lines, risk and reward

- **High line (Alto's high coin arc).** 3 to 5 gold motes at 1.0 → 1.25 x the good bot's apex height above a crest, worth 3 normal motes and one chain step. Reachable only with a press from the very top of the down slope and a perfect crest pop. The risk: the long flight lands farther down on a steeper part, so the landing is harder to grade well. Frequency: every second crest from `d` 0.25 in flow, every crest in wake, every third in fatigue, never in calm or rest.
- **Gully (Canabalt gap without the death).** A frozen stream across a valley, announced one hill ahead. Cleared by the flight from the previous crest: one chain step and a light spray of ice glitter. Not cleared: the figure dips into the gully and climbs out at `VMIN` (about 0.8 s of tempo lost, a soft snow puff, no stop). From `d` 0.4: one per ride segment, 60 u wide; at `d` 1: every second valley, 140 u. Never in calm or rest.
- **Irregular hills (Tiny Wings islands).** At `d` 0 hills follow section 4.3 exactly. With rising `d`, hill `L` varies up to plus or minus 25% and `A` up to plus or minus 30% from hill to hill, drawn from a shuffled bag (no unfair runs), so the release point must be read, not memorised. From `d` 0.6 some hills get a small false crest before the real one (an early pop gives a low hop instead of a flight).
- **Approach line carry (Alto chain carry).** The mote line into a station is in the task's colour. Ride all of it and an **adaptive** task starts with its first combo tier already lit. Never for fork or lanterns (measurement validity), never for reaction.

### Chain and fever

- **Chain (Alto).** A chain step is any perfect or good landing, crest pop, full mote line, high line, cleared gully or beat kick. Steps must follow within the chain window. Tiers at 3, 6 and 10 steps (minigames 0.5): the trail warms and lengthens, the scarf streams longer, one music layer per tier, the border warms a notch. A rough landing or an elapsed window drops one tier (never straight to zero; that is the kinder change from Alto). The chain carries across hills and pauses during tasks (frozen at its tier, resumes on the exit slide).
- **Fever (Tiny Wings).** Three perfect landings in a row: for 4 s the trail burns gold, speed may run to 1.12 x `VMAX`, motes count double. It ends on the first landing worse than good or after 4 s. In calm the fever is only a warmer lantern swell, never speed.

### Adaptive level for the ride

- One extra level `ride` in the same store (`afferent.skill.v1`, `tasks.ride`), the same update rule, step sizes and credit weight `w` as minigames 0.2, `p*` 0.78 (calm 0.80), start `L0` 0.30. Trial = one hill; its outcome `o` = the mean grade of that hill's graded decisions (perfect 1, good 0.8, barely 0.4, missed or rough 0).
- `d` = `L_eff` + ramp + `D` + assist, as in minigames 0.2. Ramp per ride segment: +0 on its first hill, +0.04 per further hill, at most +0.12. The summit ride is the boss: its last two hills +0.2 and the fell carries the session's highest high line; a perfect launch onto the plateau lights the cairn (the dawn itself stays identical, 8.2).
- What `d` moves, value at `d` 0 → `d` 1 (value at `L0`); times and windows interpolate geometrically, the rest linearly, as in minigames 0.2:

| Axis | `d` 0 → `d` 1 (`L0`) |
|---|---|
| `SILK_eff` = mode `SILK` x factor | factor 1.3 → 0.55 (1.0, so `L0` is exactly the 4.3 table) |
| crest pop window before the launch point | 180 → 60 ms (129) |
| mote collect radius | 22 → 15 u (20) |
| chain window between steps | 3.0 → 1.8 s (2.6) |
| high line height over the good bot's apex | x 1.0 → x 1.25 (1.08) |
| hill irregularity | 0 → plus or minus 25% `L`, 30% `A` (8%, 9%); false crests from 0.6 |
| gullies | none below 0.4 → every second valley, 60 → 140 u wide |
| fatigue beat kick windows perfect / good / barely | plus or minus 60 / 120 / 180 → 35 / 70 / 110 ms (51 / 102 / 154); outside barely it is today's "missed, nothing lost" |
| wake hill period | mode table → 15% shorter at `d` 1 (tempo) |

- `d` never changes `g`, `HOLD`, `DIVE`, `GLIDE`, `SINK`, `VMIN` or `VMAX`: the feel of each mode stays the director's. The 4.3 targets are checked at `d` = `L0` with irregularity off; section 11 adds one run at `d` 0.8.

### The director chooses where the challenge lives (section 5)

- **calm:** no launches, no high lines, no gullies, no speed reward (4.3: good bot only 0 to 10% faster). The challenge is precision and patience: press within the window of the crest (the start of the long down slope) and release within the window of the valley, in time with the swell. Window plus or minus 800 → 250 ms (560). Reward is positive only: a swell ridden in time makes the lantern swell brighter and the `tick` train softer; an off-time swell simply rides on. Higher arousal (`k`) widens the window, `D` = -0.3 x `k`. `SILK` stays 22 to 26 deg (5).
- **flow:** lines and risk carry the challenge (high lines, gullies, irregular hills); no `D`.
- **wake:** tempo and reaction: hill period, crest pop window and air clusters get `D` = +0.15 x (`k` - 0.5); high line on every crest.
- **fatigue:** the beat kick is the main graded event (windows above), tempo `D` = +0.2 x (`k` - 0.5); eyes closed for 1.5 s still makes the next crest call brighter (5). Gullies only from `d` 0.6, so a groggy player is woken by rhythm, not by obstacles.
- **rest:** none of this. No grades, no chain, no level updates; the drift stays as in 5.

### Bad morning

The minigames 0.6 trigger and quiet rules apply unchanged (nothing on screen says it). On the ride: assist `A` = -0.15, `SILK_eff` x 1.3, every timing window x 1.25, no gullies, a rough landing costs 10% speed instead of 25%, chain window +1 s, `w` = 0 (tomorrow's level is untouched). Beat kicks and swell timing stay; they only get wider.

### Record (extends the optional `ride` object of section 9)

`ride.dda`: `{v: 1, L_start, L_end, d_mean, d_max, hills, o_mean, grades: {perfect, good, barely, missed}, rough_landings, crest_pops, high_lines, gullies_cleared, gullies_dipped, chain_max, tier_max, fevers, decision_gap_max_s, assist}`. Engagement and QA only, never claimed, never read by the hub index. `decision_gap_max_s` is the longest stretch without a graded decision outside the listed holds and waits; acceptance (section 11): at most 2.0 s in the good, bad and night bot runs, and the 30-session fixed-skill bot test of minigames 0.2 also converges for `ride`.

## 6. Session flow

Engine phases keep their names (`fadein`, `rest`, `checkin`, `rt`, `walk`, `game`, `dawn`, `end`, `asleep`); `walk` now means "riding" so the hub, `contracts/api.md` and `live_metrics` stay valid. Traverse.js keeps its own sub-state: `kindle`, `launch`, `ride`, `approach`, `arrive`, `stage`, `exit`, `summit`, `drift`, `give`.

### 6.1 Camera (ride shot, written into lookdev's `V.cam = {x, y, z}`)

| Shot | x (lead) | y (cam.y > 0 moves the world down) | z | Spring w |
|---|---|---|---|---|
| ride | `-(0.05W + 0.07W * clamp((v - VMIN) / (VMAX - VMIN), 0, 1))`, so the figure sits at 0.23W to 0.30W and sees ahead | `clamp(alt - 0.22H, 0, 0.28H)` where `alt` = figure height above the baseline in px | `1.04` easing to `1.00` at `VMAX` (never below 1.00) | calm 1.2, flow 2.2, wake 3.0, fatigue 2.6, rest 1.0 |
| arrive (task) | spring to 0 | spring to 0 | lookdev "task open" | 900 ms soft (calm, rest 1400 io) |
| summit | 0 | `+0.08H` | 1.00 | lookdev dawn (8.3) |

Core shots (rest pull-back 1.30 to 1.04, static during the reaction core) stay exactly as lookdev 8.1. Reduced motion: identity camera (lookdev 11), apex capped (section 10).

### 6.2 The fixed core, made active and still valid

| Segment | What the player does | What stays fixed for measurement |
|---|---|---|
| Fade in (0 to 2 s, lookdev 8.1 "the lantern catches") | Watches the flame catch for 0.6 s; from 1.0 s a steady ghost finger rests on the lantern (no pulse faster than 1 Hz). Touching already starts the kindle | Unchanged |
| **Rest: Kindle** (2.0 to 8.0 s) | Keeps a finger down and still. A thin ring of warm light fills around the lantern (Sky candle), the flame steadies and grows one notch. Lifting the finger only slows the fill to half speed; nothing resets. At 8.0 s the ring closes in a soft 300 ms bloom (identical every session, whatever happened) | The window starts at 2.0 s and lasts 6 s exactly as today (`REST_S`), independent of touch. The ring is local (radius at most 3x the lantern glow), adds at most +10% local luminance, rises monotonically, and its curve depends only on hold time, so the scene is the same for the same behaviour. A held, still finger also steadies the phone (head pitch). Lookdev's camera pull-back and "nothing new appears" hold everywhere else |
| Mood check-in (8.0 s, up to 10 s) | One tap on one of five lanterns (lookdev 8.1: envelope, no words, the mood mote flies into the lantern and tints the flame) | Unchanged: same five colours and glows in the same row, `mood_start`, `mood_start_ms`, null when skipped |
| Reaction: Bite (minigames 3.1) | Fishing from the pier: wait for the bite, tap anywhere | Unchanged: 5 trials, foreperiod 1.0 to 2.5 s, window 1.5 s, stimulus `bite/1`. The foreperiod wait is a deliberate, signalled wait (the bobbing float) and is the only core wait above 2 s |
| **Launch** (after the 5th catch) | The lighthouse ignites (1.6 s, lookdev). The figure turns to the slope and crouches, ready. **Press to go**: two running strides along the pier, then a leap over the channel; hold in the air to dive, let go to glide. No press within 1.2 s: it goes by itself (no fail) | Nothing measured. Play time (`firstPlayAt`) starts at the leap |

Start tableau requirement for world.js: the start chunk is the harbour; the pier ends at about 0.42W, a water channel lies from 0.42W to 0.66W (where the Bite float sits), and a snow bank rises from 0.66W to a lip at pier height, followed by the first down slope. The leap lands on that down slope.

### 6.3 Ride, stations and tasks

The loop after the core is: ride, station, task, exit, ride, ..., summit.

- **Next station planning.** When a ride segment starts, the traversal asks the engine for the next plan: task or summit (6.6). The engine commits the task (slot, id, mode, `k`, weight) at the **approach start** (the beginning of the last hill before the station, about 3 s before arrival), so the station's prop can rise ahead. `director_mode` is the mode at that moment; `t_start_ms` is panel open as in lookdev 7.2.
- **Ride length between stations** (good bot): calm 1 hill (6 to 10 s), flow 1 hill plus the approach slope (about 4 s), wake 2 hills (about 5 s), fatigue 2 hills (about 5.5 s). When the time budget is short, any ride shortens to 1 hill. The summit ride absorbs leftover time (6.6).
- **Approach (about 3 s, while riding).** The station's prop appears at the right edge and grows with parallax (Canabalt's lead time, Journey's goal on the horizon). The last slope before the bench carries a line of motes in the task's colour leading into it. The player keeps riding; nothing is taken over.
- **Arrive (0.6 s).** On the bench the figure brakes with a heel spray and a 0.6 s ease out to a stop (ground stations) or to the cruise speed (sky stations, below). Camera eases to the task shot.
- **Open (0.45 s, lookdev 7.2).** The lantern sends a mote to the prop; the stage opens out of the **prop's screen point** (scale 0.86 to 1 about that point, alpha 0 to 1). Input, `g.startAt`, task timers and the record start at panel open.
- **Input hand-off.** A finger still down from riding is swallowed: the task receives events only after a pointer up followed by a new pointer down. So a held ride press can never become a fork decision, a lantern answer or any task tap.
- **Stage.** Every task runs with `g.bare = true` (no panel chrome, no frame, no progress bar). Behind the task content the traversal draws a soft dark radial plate (night-950, 0.55 alpha at the centre to 0 at the box edge, 24u feather), so contrast stays constant and the world stays visible around it. Tasks whose spec paints an interior or a scene (loyly, threads, shutters, fork) keep painting it inside `box()`; the plate's feather turns its edge into a vignette instead of a card.
- **Figure during the task.** Ground stations: standing, breathing, looking up at the stage (lookdev 5.6). Sky stations: the figure keeps sliding at a cruise speed of 40 u/s on a long flat stretch generated for the task's maximum duration, so the world keeps moving under the task. Task input never steers the figure.
- **Exit.** At `finishedAt + max(0.7, g.outro)` the stage folds into a mote (lookdev 7.3) that arcs into the **moving** lantern. The ride resumes at fold start: the bench ends in a lip and a down slope, and the figure is already sliding off it at `0.6 * VMIN` without input. The first press after the fold is the player's (a finger still down from the task is ignored until lifted). `lightHome`, the colour wave and the lighthouse step fire when the mote lands, as lookdev specifies. Dead time from task done to the first meaningful ride input is the task's outro (at most 2.2 s; please keep it at most 1.8 s).
- **Unengaged player.** Nobody touching: the figure still rides at the floor speed, every station still arrives, tasks still time out as today, dawn still comes (8.2). The session is `partial` (X36) exactly as today.

### 6.4 Every task in the world

| Task | What the world brings (approach prop) | Station type | Stage opens from | Exit into the world (persists) |
|---|---|---|---|---|
| reaction (Bite) | the pier and channel of the start tableau | core, still | (core) | lighthouse ignites; the launch (6.2) |
| fork (Fell or Shore) | the path visibly splits ahead: a low branch along the shore, a high branch switchbacking up a fell, a cairn with two waymarkers at the split | ground, stop on the saddle | the cairn | the scarf bands stay on the figure (lookdev scarf); the figure slides off the saddle |
| lanterns (Lantern Release) | a harbour pier with two posts and a slack rope, two dark lanterns hanging | ground, stop on the pier | the rope's midpoint | released lanterns stay as small drifting lights in the world sky for the session; a ramp at the pier end |
| breath (Lantern Song, calm) | the sauna hut with lit window, birches and chimney on a broad snowfield (its 3 landmarks, minigames 3.4) | world task, stop; figure lifts the lantern | (no stage, world task) | lit landmarks stay; the aurora answers; the next swell begins |
| breath (rest) | the harbour ice | drift: the figure drifts seated, the breath runs over it endlessly | (world task) | dawn (night end) or `fell_asleep` |
| loyly (Silk Pour) | a sauna hut on the slope, steam from the chimney, door glowing | ground, stop at the porch | the door | the sauna window glows one step warmer for the session |
| threads (Aurora Loom) | a birch-frame loom standing in the snow between two birches, faint aurora strands above | ground, stop | the loom frame | the woven strands rise into the aurora (minigames payoff), the loom keeps faint colour |
| stars (Joutsen) | the birches open into a clearing; the swan's line faint in the sky ahead | sky, cruise | the swan's anchor star | the swan constellation stays in the sky |
| fireflies (Firefly Fling) | reeds at the lake edge; fireflies rise out of them along the path ahead; a jar on a stump | ground, stop | the jar | the light column and the fireflies stay over the lake |
| beacon (Harbour Beat) | a headland with the near lighthouse; the horizon lighthouse is the same one | ground, stop on the headland | the lighthouse lamp | the lighthouse stays brighter (`flareLighthouse`), lit boats on the world sea |
| bells (Tower Chain) | the wooden bell tower rises on the next crest | ground, stop at the tower foot | the tower windows | the lamp's beam lays a warm light lane down the next slope; the ride starts down that lit lane |
| shutters (Wake the House) | a row of harbour houses with shuttered windows along the path | ground, slow cruise along the facade (the task's own window-to-window slide also nudges the world 140 u per window via `A.Traverse.nudge`) | the first window | the house row keeps lit windows; daylight stays up |
| summit (dawn) | the fell with a cairn on top, the sky lightening behind | summit plateau | (no stage) | section 8 |

Props are drawn by traverse.js procedurally as silhouettes graded like the world, using the task's art when it is loaded (`A.Art`, names from minigames section 3, for example `task_bells_tower`, `task_beacon_lighthouse`, `task_threads_loom_frame`), always with a procedural fallback. Lighthouse budget (minigames 0) holds: the near lighthouse is the beacon task's and the horizon lighthouse is the same light.

### 6.5 Rest and the night rule

Night play is the fallback (Morning ritual). These rules apply only on the night clock; in the morning, closing eyes is fatigue and the ride helps the player awake.

- If the director is in rest when a ride segment is planned, the ride becomes the drift and the next plan is the endless breath (rest) exactly as today: measurement slots in rest are skipped and logged `skip_reason: rest_mode`.
- If rest arrives during an approach, the committed task is discarded before it starts: the engine re-plans the same slot in rest (`this.slot = this.next.slot - 1; planTask(now)`), so the record matches today's rule. The prop stays as scenery.
- 30 s of continuously closed eyes at night ends the session as `fell_asleep` (X35), during the drift or anywhere else, with lookdev's sit and ember.

### 6.6 Play budget and the summit decision

- `SESSION_PLAY_END_S` 106 becomes **102** (as lookdev decision 3, so the played dawn of up to 10 s still ends before 2:00). `PLAY_S` 76 and `PLAY_MIN_S` 60 unchanged.
- Measurement slots always run (fork slot 1, lanterns slot 3) unless rest; never dropped for time.
- After each task: plan another adaptive task only if `playLeft - ride(1 hill) - 18 s per pending measurement - 5 s summit >= 10 s`; adaptive tasks keep the engine's cap `g.max <= playLeft + 3`. Otherwise plan the **summit ride**: hills until play time runs out, at least 4 s, at most 12 s, the last hill is the fell.
- Expect per session: fork, one or two adaptive tasks, lanterns, then the summit ride. Today's walks of 2 to 3 s plus the longer v3 tasks would give the same count; the bandit sees about 1.5 adaptive arms per session instead of 2 to 4 (note for the Statistics owner). In exchange, the director's mode now acts during every second of play, not only inside tasks.

## 7. Second-by-second timelines (morning sessions)

Both timelines are the main path: a morning session in bed right after waking, with the bedside light working as the wake-up light. The night timeline is in the Night fallback section after section 8. Times in seconds from Begin. "Gap" is the longest stretch in that row without something to do; "hold" marks a deliberate signalled hold, "wait" the Bite foreperiod, "drift" rest.

### 7.1 Good morning (morning session after waking, `good_day`, director flow)

| t | What happens | The player | Gap |
|---|---|---|---|
| 0.0 to 0.6 | Begin (just woke up, in bed); start UI fades; ember sparks; flame catches at 0.6; bedside light at a dim warm glow | already touching or not | 0.6 |
| 0.6 to 2.0 | light reveals the harbour; ghost finger on the lantern from 1.0 | puts a finger down | 1.0 |
| 2.0 to 8.0 | **Kindle** (rest window): ring of light fills, flame steadies, camera pulls back 1.30 to 1.04 | holds still | hold |
| 8.0 to 10.1 | check-in envelope opens, five lanterns | taps lantern 4 at 10.1 | 2.1 |
| 10.1 to 10.6 | mood mote flies into the flame | | 0.5 |
| 10.6 to 11.8 | Bite lead-in demo (never logged) | watches the ghost catch one | 1.2 |
| 11.8 to 24.5 | 5 bites, about 2.5 s each: recast, float bobs, bite, catch arcs into the lantern | taps each bite (RT about 300 ms) | wait (1.0 to 2.5) |
| 24.5 to 26.1 | five beads; lighthouse ignites; figure turns and crouches | | 1.6 |
| 26.1 | | **presses: run and leap** | |
| 26.5 to 27.4 | leap over the channel, cloak spreads | lets go to glide, presses to land | 0.9 |
| 27.4 to 28.6 | first down slope, motes at crouch height | holds | |
| 28.6 to 29.6 | up slope, stands tall | releases | 1.0 |
| 29.6 to 30.8 | flight over the crest through a mote arc; **the path splits at a cairn on the right edge** | presses to dive onto the down slope at 30.6 | 1.0 |
| 30.8 to 32.2 | silk landing, last slope into the saddle, violet motes lead in | holds, then releases | 1.2 |
| 32.2 to 32.8 | arrive: heel spray, stop on the saddle | | 0.6 |
| 32.8 to 33.25 | mote to the cairn, fork vista opens out of it | | 0.45 |
| 33.25 to 50.6 | **Fork**, two rounds: choose (about 1.5 s), 8 stepping stones (6 s), reward 1.1 s, twice | taps a side, taps every stone | 1.1 (reward) |
| 50.6 to 51.0 | orbs into the scarf, fold begins, figure slides off the saddle | | 0.4 |
| 51.0 to 54.5 | ride, 1 hill; a birch loom rises ahead at 52.0 | press, release, flight, dive | 1.5 |
| 54.5 to 55.6 | arrive at the loom, mote, open | | 1.1 |
| 55.6 to 66.0 | **Threads** (4 pairs, routing) | drags | per task spec |
| 66.0 to 67.8 | strands peel up into the aurora (outro 1.8) | | 1.8 |
| 67.8 to 71.5 | ride, 1 hill, flow; pier and rope appear at 69.0; mote home at 68.4 starts the blue wave | press, release | 1.5 |
| 71.5 to 72.6 | arrive on the pier, mote, open | | 1.1 |
| 72.6 to 91.0 | **Lanterns**, 12 trials of 1.45 s, payoff constellation 1.5 s | taps the bigger lantern 12 times | 1.5 (payoff) |
| 91.0 to 91.4 | fold, the pier ramp | | 0.4 |
| 91.4 to 102.0 | **summit ride** (playLeft 10.6 s, no room for slot 4): 2 flow hills, then the fell; the trail of gathered light streams behind | press, release, flights | 1.5 |
| 102.0 | lands on the summit plateau; dawn starts; the bedside wake-up light starts its 4 s sunrise fade | | |
| 102.0 to 110.0 | **Give** (8.2): holds, the lantern lifts, the sun rises with the hold, the trail flows into the sky; the room is in full warm light as the sun clears the horizon | holds | hold |
| 110.0 to 112.5 | end screen; "Good morning." at 110.6; five lanterns | taps lantern 5 at 112.5 | 2.5 |
| 112.5 to 114.1 | village mote; session closes 1.2 s after the tap | | |

Total about 1:54. Longest gap outside holds and waits: 2.5 s at the end check-in (a decision).

### 7.2 Groggy bad morning (morning session after waking, `bad_day`, director fatigue: eyes keep closing)

The most common director case: the player is still half asleep. Fatigue wakes them gently (beat lights, daylight per kick, a brighter call when the eyes close) instead of letting them drift off; there is no rest or `fell_asleep` path in the morning.

| t | What happens | The player | Gap |
|---|---|---|---|
| 0.0 to 2.0 | flame catches (bad-day kindness per lookdev 3.2.4) | | 1.0 |
| 2.0 to 8.0 | Kindle | holds loosely, lifts at 5.0, holds again at 6.2 (ring fills at half speed in between) | hold |
| 8.0 to 11.5 | check-in | taps lantern 2 at 11.5 | 3.5 (decision) |
| 11.5 to 13.2 | mote, Bite lead-in | | 1.7 |
| 13.2 to 27.6 | 5 bites; one lapse (1.2 s), one miss (the fish swims home by itself) | taps 4 times | wait |
| 27.6 to 29.2 | lighthouse ignites; figure ready | | 1.6 |
| 29.2 to 30.4 | no press yet: at 30.4 the figure goes by itself; the player presses at 30.6 mid-leap (dive) | presses late | 1.2 |
| 30.4 to 36.2 | ride, fatigue, 2 hills of about 2.9 s: crest lantern, ring closing, `tick` count-in on 2 beats | releases on the beat at 32.5 (kick, daylight +0.04), misses the second (soft, nothing lost) | 1.3 |
| 33.5 | the path splits ahead (fork) | | |
| 36.2 to 37.25 | arrive, open | | 1.05 |
| 37.25 to 49.0 | **Fork**, easy path twice: 3 stones each | taps | 1.1 (reward) |
| 49.0 to 49.4 | fold, slide off | | 0.4 |
| 49.4 to 55.2 | ride, 2 fatigue hills; the bell tower rises on the second crest at 52.5; eyes closed 1.6 s at 53: the next crest calls brighter with `medium` | presses, releases on the call | 1.3 |
| 55.2 to 56.3 | arrive at the tower foot, open from the windows | | 1.1 |
| 56.3 to 66.0 | **Bells** (target 3, one replay) | watches 2 notes, echoes | per task (show about 1.5) |
| 66.0 to 67.6 | lamp throws a beam down the next slope (outro 1.6) | | 1.6 |
| 67.6 to 73.4 | ride down the lit lane, 2 hills, daylight now +0.08 | press, release, one kick | 1.3 |
| 73.4 to 74.5 | arrive on the pier, open | | 1.1 |
| 74.5 to 93.0 | **Lanterns** | 12 taps (two unanswered) | 2.6 (no answer) |
| 93.0 to 102.0 | summit ride, fatigue, 3 hills, the fell last; full daylight rises with each kick | press, release | 1.3 |
| 102.0 to 111.0 | Give: holds for part of it (dawn clock 1.0 while held, 0.7 while not); the bedside wake-up light rises to full with the sun | holds 5 s of 9 | hold |
| 111.0 to 114.2 | end screen, "Good morning."; mood 2 | taps at 114.2 | 3.2 (decision) |
| 115.4 | closes | | |

Total about 1:55.

## 8. Dawn and the end, played

### 8.1 Summit ride

The last ride segment ends on the fell: a longer up slope (the trail streaming), the crest flattening into the summit plateau with a cairn. A release on that up slope launches the figure onto the plateau; nobody touching, it slides up at the floor speed. Landing on the plateau starts `dawn` (`startDawn`, bedside light 4000 ms fade, unchanged contract). In the morning this fade is the wake-up light's sunrise (Philips Wake-up Light as the role model): warm, rising, reaching full as the sun clears the horizon. A dim warm pre-dawn glow that rises with the lighthouse steps and daylight during the ride is a request for the light owner, not a contract change.

### 8.2 Give the light (dawn)

- Role model: Sky (hold to offer light at a shrine, a ring fills while you hold) and Journey (the summit walk into the light).
- Meaning: this is the payoff of waking up. The player has carried the light through the dark and now carries it up into the morning; the sun, the world and the bedside light rise together with the hold.
- Lookdev 8.3's 8 s visual script runs on a dawn clock `V.dawnT` that advances at rate **1.0 while held and 0.7 while not** (0.85 after 3 s without any touch, so it never stalls). Holding throughout: 8.0 s. Never touching: about 10.5 s. Lookdev's beats (look up at 0.6, ignite 1.0 to 3.5, crest 2.5 to 5.5, handover 3.0 to 6.0, hold 5.0 to 8.0) are positions on that clock.
- While held: the figure lifts the lantern overhead (lookdev 5.6 lift pose, held), the gathered trail flows from the lantern toward the sun as a soft ribbon (alpha at most 0.25, through the flash guard), `tick` at 1 Hz. On release the lantern lowers halfway and the ribbon thins; the sun keeps rising at the slower rate.
- At `V.dawnT = 8` the end screen appears (lookdev 8.3 owns the text timing, the village mote and the warm settle).
- Night end (night fallback: night clock or rest): the same clock drives lookdev's night variant; holding sets the lantern down and lights the harbour windows one by one. Quiet: luminance rises at most 0.03 per 0.5 s (lookdev night pass criteria).
- The dawn is identical whatever was gathered; only the ribbon width scales with the trail (so nothing reads as a score).

### 8.3 End

End check-in (five lanterns, the same as today, DOM by the UI owner) is the last action. Session closes 1.2 s after the tap as today.

## Night fallback

Not the main path (Morning ritual). If someone plays at night, the game still works: the night clock caps the bedside light, the director may go to rest, the ride becomes the drift, falling asleep is allowed (6.5), and the session ends with the played night end (8.2) or `fell_asleep`. The bedside light stays quiet (cap 25%), no sunrise simulation in the room.

### Night timeline (night clock, starts calm, eyes close, rest, then night end or asleep)

| t | What happens | The player | Gap |
|---|---|---|---|
| 0.0 to 2.0 | flame catches; quiet night caps the bedside light at 25% | | 1.0 |
| 2.0 to 8.0 | Kindle | holds | hold |
| 8.0 to 10.8 | check-in | taps lantern 3 | 2.8 (decision) |
| 10.8 to 25.6 | mote, lead-in, 5 bites | taps | wait |
| 25.6 to 27.2 | lighthouse ignites (night ladder) | | 1.6 |
| 27.2 to 28.0 | presses, leap | | |
| 28.0 to 34.0 | calm swell 1 (period 6.0 s): long down slope | holds 2.4 s (`tick` at 1 Hz), releases 3.6 s up and over | release 3.6 (calm exhale) |
| 31.0 | the path splits ahead (fork) | | |
| 34.0 to 35.1 | arrive on the saddle, open | | 1.1 |
| 35.1 to 50.0 | **Fork** (hard once, easy once) | taps | 1.1 |
| 50.0 to 57.5 | calm swell 2 (7.5 s): press 3 s, release 4.5 s; the sauna rises ahead at 54 (loyly committed at 54.0, mode calm) | holds, releases | release 4.5 |
| 55.0 | eyes start closing; fatigue passes 0.45 at 56.5; rest after 3 s hysteresis at 59.5 | | |
| 57.5 to 59.5 | still calm on the bench approach; at 59.5 the director switches to rest before arrival: loyly is discarded, slot 2 is re-planned as endless breath (rest), the sauna stays as scenery | | |
| 59.5 to 61.0 | the slope flattens onto the harbour ice, the figure sits on its cloak | | drift |
| 61.0 to 102.0 | **Drift + Lantern Song (rest)**, endless: ring on each exhale, the scene dims a little per cycle; lanterns (slot 3) logged skipped `rest_mode` | holds with the inhale when awake, or nothing; eyes may close | drift |
| 64.0 to 94.0 | (variant A) eyes stay closed 30 s: at 94.0 sit, ember, fade to black, `fell_asleep`, no dawn, no light | | |
| 102.0 to 110.0 | (variant B, awake) **night end, played**: the drift reaches the harbour pier; holding sets the lantern down and its light walks into the harbour windows one by one; bedside light rises to the knob level (15%, cap 25) | holds | hold |
| 110.0 | "Rest well."; dim begins at end + 4 s (lookdev night) | taps a lantern or nothing | |

## 9. Measurement contract (SessionSchema.md stays valid)

Morning sessions at the same time every day give comparable resting pulse and reaction time (Morning ritual); nothing below changes for that, it is why the fixed core stays fixed.

| Item | Status |
|---|---|
| Rest window | Unchanged: 2.0 to 8.0 s, `REST_S` 6, every field and quality value as today. The kindle visual is local, monotonic and identical for an identical hold |
| `core.mood_start`, `mood_start_ms` | Unchanged (lookdev owns the presentation) |
| `core.rt` | Unchanged (minigames Bite, `core.rt.stimulus = "bite/1"` per the owner decision) |
| `tasks[]` | Unchanged meaning for every field. `t_start_ms` is panel open (lookdev 7.2). `director_mode` is the mode when the task was committed at approach start. A ride press is never delivered to a task (hand-off rule, 6.3) |
| Rest-mode skips, `fell_asleep`, `partial` (X36) | Unchanged |
| `pre_post` end window | Unchanged definition: median over the last 6 s of play before dawn, which is now the summit ride (phases `walk` and `game` as today) |
| `adaptive.mode_seconds`, `transitions` | Unchanged; the director runs in `walk` and `game` as today |
| `phase` values in `live_metrics` and `api.md` | Unchanged; `walk` now means riding. Optional: the hub label "Walking" becomes "Riding" |
| New, optional, exploratory: top-level `ride` object (top level allows additional properties) | `{v: 1, seconds, holds, hold_s, air_s, motes, silk_landings, beat_kicks, gaps_over_2s, idle_max_s, rest_hold_ratio, rest_ui: "kindle_v1", dawn_hold_s, dawn_s}`. Engagement and QA only; never claimed, never used by the director or the hub index. Add one row to `SessionSchema.md` and the JSON schema when the contract owner agrees |
| Decisions rows (orchestrator) | "Ride replaces the auto-walk (core loop v1)", "rest presentation kindle_v1", "dawn is hold-driven, 8 to 10.5 s", "`SESSION_PLAY_END_S` 102", "default input touch" |

Claims: the ride is "a calm one-finger journey that follows your pulse". Never "trains", "treats" or "measures attention". The calm swell is "slow paced at about six breaths a minute", not breath measurement.

## 10. Reduced motion

| System | Reduced-motion behaviour |
|---|---|
| Camera | Identity (lookdev 11) |
| Height | Launch boost x0.5 and apex capped at 120 u, so flights stay in frame without a camera |
| Parallax | x0.5 as today |
| Figure | No squash or stretch; crouch and cloak open are 150 ms fades between two poses; no heel spray |
| Motes | Fade into the lantern in place (200 ms) instead of flying; at most 0.2 screen per second |
| Trail | Static soft glow behind the lantern, length still grows |
| Speed streaks, snow puffs, landing streaks | Off |
| Stations | Lookdev's 600 ms crossfades instead of the mote flights |
| Fatigue crest ring | Fades in place over the last beat instead of shrinking |
| Kindle and give | Same rings and timing, no bloom pulse (a 300 ms fade instead) |

Physics, timing, stations and everything measured are identical.

## 11. Autoplay bot and acceptance tests

- `A.Traverse.auto(dt)` (used when `input === 'auto'`): on the ground, hold when `h'(x) < -0.03`; in the air, hold when descending and the ground 0.25 s ahead slopes down; fatigue releases at the predicted crest pass with 60 ms jitter. Profile `bad_day` reacts 300 ms late and misses every third beat. Launch press after 0.5 s.
- Dev hooks: `?ride=calm|flow|wake|fatigue|rest` forces the ride mode (director still logs); `?task=<id>` forces the next station (reuse the kit's dev hook if it exists); `A.Traverse.debug()` returns `{state, v, alt, hill, mode, light, gaps}`.
- Pass criteria (headless, 390x844, `?dev=1`, using a probe like `scratchpad/pw/coreloop_probe.js`):
  1. Autoplay good morning, groggy bad morning and night fallback: no stretch over 2.0 s without an input opportunity, except kindle and give holds, Bite foreperiods, calm releases (at most 6.5 s), rest drift and decisions waiting for the player. Report the gap list.
  2. Nobody touching (touch mode): the session reaches dawn and the end screen in under 2:00 of play, `status: partial`.
  3. Bot medians per mode inside the 4.3 targets.
  4. The record validates against `contracts/session.v3.schema.json`; `tasks[].items` and `errors` meanings unchanged for every task (compare one autoplay record before and after); `core.rest.duration_ms` 6000 plus or minus one frame.
  5. No ride press reaches a task: hold through an arrival in a scripted run and check that no task receives a `down` before a new pointer down.
  6. 60 fps: p95 frame time under 16.7 ms on desktop headless at 390x844, and on the demo iPhone with `?perf=1` (lookdev budget).
  7. Reduced motion run: identical timeline, no camera movement, apex under 120 u.

## 12. File plan (one traversal builder; the 11 task builders never touch these)

The traversal builder works in the worktree `../afferent-game-mg` (branch `minigames`) and owns: `demo/js/traverse.js` (new), `demo/js/engine.js`, `demo/js/world.js`, `demo/js/main.js`, `demo/index.html`. Task builders own `demo/js/tasks/<id>.js` only; the kit builder owns `demo/js/juice.js` and `demo/js/input.js`. Any engine.js need of a task builder goes to the traversal builder.

### 12.1 traverse.js (new, `A.Traverse`)

```
A.Traverse = {
  STATIONS,                          // per task id: {prop, kind: 'ground'|'sky'|'world'|'drift', cruise, biome}; table 6.4
  create(session) -> T,
}
T = {
  coreKindle(now, dt),               // rest ring from Input.holding(); visual only
  launch(now),                       // ready pose, waits for a press or 1.2 s, plans the opening ride
  update(now, dt),                   // physics (4.2), hill generation, motes, approach, arrive, exit, summit, drift, camera shot (6.1)
  handle(type, d) -> bool,           // consumes pdown, pup, key in kindle, launch, ride, give; swallow rule for tasks
  arrived() -> bool,                 // true once the arrive brake ends on a station bench
  stageOrigin() -> [x, y],           // screen point of the prop, for the panel envelope
  drawStage(ctx, box, g, alpha),     // the soft plate behind bare tasks
  resume(now, g),                    // fold started: slide off the bench, plan the next segment
  planSummit(now, seconds),
  atSummit() -> bool,
  dawn(now, dt) -> dawnT,            // hold-driven dawn clock (8.2)
  sleep(),                           // night: sit, ember
  nudge(dx, dur),                    // optional world motion for tasks (shutters)
  auto(dt),                          // bot (11)
  drawBack(ctx, env), drawFront(ctx, env),   // props behind the path; motes, trail, spray, crest lights in front of the figure
  record() -> ride object (9),
  debug(),
}
```

V fields written by traverse.js and read by world.js (and later lookdev's figure.js):

| Field | Meaning |
|---|---|
| `V.terrain` | `wx -> h` in u |
| `V.worldX` | figure x (as today) |
| `V.ride` | `{state, air (u above the surface), angle (rad, surface or flight pitch), crouch 0..1, spread 0..1, squash [sx, sy], sit 0..1, lift 0..1, speed01}` |
| `V.cam` | `{x, y, z}` ride shot (6.1), only when lookdev's `A.Cam` is absent; with `A.Cam` present traverse calls `A.Cam.shot('ride', {x, y, z})` |
| `V.walking` | true while grounded and moving (keeps footprint and step code working) |
| `V.daylightRide` | fatigue kick share of daylight (5) |

### 12.2 engine.js (exact changes)

Land as one early commit ("engine step 0"), together with the minigames kit's engine items so no task builder edits engine.js:

| Where | Change |
|---|---|
| constants | `SESSION_PLAY_END_S = 102` |
| `A.makeVisual` | defaults `ride`, `terrain: null` |
| `startSession` | `s.T = A.Traverse.create(s)` |
| `updateRest` | add `this.T.coreKindle(now, dt)`; nothing else changes |
| `updateRt` | minigames 3.1 data fixes: remove `Au.piano(7, 0.16)` at onset and the reduced-motion `0.35` flash branch; RT from `d.ts` (kit item 6) |
| `finishCore` | replace `this.setPhase('walk'); this.planWalk(now)` with `this.setPhase('walk'); this.T.launch(now)`; `firstPlayAt` set at the leap |
| `planWalk` | deleted; the traversal plans terrain |
| new `planTask(now)` | the first half of today's `startGame`: `slot++`, rest-mode measurement skips, pick (`pick`, weights), `intensity`, store `this.next = {slot, id, mode, k, weight, measure}`. Called by traverse at approach start |
| `startGame(now)` | builds the task from `this.next` (re-plan when rest arrived meanwhile, 6.5), sets `g.bare ??= true`, then the rest as today (track, `Au.pad`, bus, ws) |
| `endGame` | replace `this.setPhase('walk'); this.planWalk(now)` with `this.setPhase('walk'); this.T.resume(now, g)`; replace `startDawn` there with `this.T.planSummit(now, this.playLeft(now))` when the 6.6 rule says summit; rest mode at play end: `planSummit` turns the drift toward the harbour pier |
| `update` | delete the auto-walk (lines 427 to 429); call `this.T.update(now, dt)` every frame after `fadein`; `if (this.auto) this.T.auto(dt)`; replace `this.phase === 'walk' && !V.walking && now > outroUntil` with `this.phase === 'walk' && this.T.arrived()`; add `if (this.phase === 'walk' && this.T.atSummit()) this.startDawn(now)`; panel close at `finishedAt + max(0.7, g.outro)` (kit item 4) |
| `style` | drop `this.speed` and `V.stride` (the ride owns speed); keep the rest |
| `startDawn`, dawn branch | `V.dawnT = this.T.dawn(now, dt)`; `V.sweep = V.dawnT / 8`; end at `V.dawnT >= 8`; light call unchanged |
| `fallAsleep` | add `this.T.sleep()` |
| `handle` | first: count inputs as today; then `if (this.T.handle(type, d)) return;` before the task routing |
| `drawOverlay` | for `g.bare`: `this.T.drawStage(ctx, b, g, show)` before `g.draw`; no frame, no progress bar; envelope origin `this.T.stageOrigin()` |
| `finish` | `doc.ride = this.T?.record()` before emitting `session_end` |
| `haptic` | `A.J?.hap('light') ?? navigator.vibrate?.(15)` (kit item 2) |
| `sample`, `director`, `classify`, `intensity`, record building | unchanged |

### 12.3 world.js (exact changes)

| Where | Change |
|---|---|
| `gyAt(wx)` | `gy - (S.terrain ? S.terrain(wx) * u : 0) + 3u noise - 2u` |
| `ground()` | the surface path, the 16 colour stops and the snow streak lines follow `gyAt`; fill closes at `1.35H` |
| props (`pier`, `birches`, `hut`, `shore`, `lakeShore`, `footprints`, lantern pool in `lanternLight`) | anchor at `gyAt(their wx)` instead of `gy` |
| `rig()`, `figure()` | figure origin `(fx, gyAt(S.worldX) - S.ride.air * u)`, rotate by `S.ride.angle * 0.6` about the feet; crouch scales y by `1 - 0.12 * crouch`; cloak hem and scarf lift with `spread`; squash from `S.ride.squash`; sit pose from `S.ride.sit`. Without `S.ride`: today's walk |
| camera | lookdev 6.1 `band()` and `toScreen()` verbatim (translation and zoom per depth); if time is short, translation only (`cam.y`, `cam.x`) with the same depth table |
| `scene()` | `A.Traverse?.drawBack?.(ctx, env)` after `props(ctx, true)`; `A.Traverse?.drawFront?.(ctx, env)` after `lantern(ctx)` |
| `A.World.hooks` | minigames 2.1 item 9 stubs with fallbacks: `setBreath`, `landmarks()` (returns the current station's prop points, the sauna's 3 for breath), `lightLandmark`, `addSkyMark`, `flareLighthouse`, `lanternPose` |
| start chunk | harbour tableau of 6.2 (pier end 0.42W, channel, bank, lip) |

### 12.4 main.js and index.html

- `main.js` line 33: default `input` becomes `'touch'`; autoplay only with `?input=auto` or the dev chip.
- `index.html`: `<script src="js/traverse.js">` after `world.js` and before `engine.js`.

## 13. Alignment with lookdev.md

Lookdev is being built in the main repo by its own engineers; the Ride is built in the `minigames` worktree. Same interfaces, so the merge is mechanical:

| Lookdev | The Ride |
|---|---|
| 6.1 camera contract `V.cam`, bands, sign convention, zoom never below 1.00 | Used as is; the ride is one more shot (6.1 here) |
| 6.3 walk motion (trapezoid walks, chunk 420, walk times) | **Superseded**: there is no walk. Chunks follow hills |
| 7.2 task in (mote, scale 0.86 to 1, timers at open) | Used; origin = station prop instead of the panel centre |
| 7.3 task out (fold, mote home, `lightHome`, colour wave) | Used; the mote targets the moving lantern; the ride resumes at fold start instead of 1.1 s after the close |
| 8.1 the lantern catches, rest stillness | Used; adds the local kindle ring (flagged below) |
| 8.3 dawn 8 s, `SESSION_PLAY_END_S` 102 | Same script on a hold-driven clock (8.2 here) |
| 5.x figure (pendulum, scarf, poses) | figure.js must read `V.ride` (crouch, spread, angle, air, squash, sit). Until then world.js rotates and squashes today's figure |
| 9 village, 10 end, 11 reduced motion | Unchanged |

Flags for the orchestrator:

1. Lookdev 8.1 says "nothing new appears" during the rest. The kindle ring is new but local, monotonic, at most +10% local luminance and identical for an identical hold. If the clinical side rejects it, keep only the steadier flame and a `tick` at 2, 4 and 6 s.
2. Lookdev assigns engine.js to its engineer C and world.js to D in the main repo; here both belong to the traversal builder in the worktree. Whoever merges second takes the Ride's versions of `planWalk` (deleted), the walk branch of `update`, `startDawn` and the dawn branch, and keeps lookdev's camera, moments and figure calls.
3. The play budget gives 1 to 2 adaptive tasks per session instead of 2 to 4 (6.6). Statistics owner should know.
4. Default input changes to touch: anyone filming the autoplay story must add `?input=auto`.

## 14. Build order (traversal builder, about 6 h)

| # | Step | Est. |
|---|---|---|
| 0 | engine step 0 (12.2) with stubs: `T.update` moves the figure on flat ground at `VMIN` so the game runs exactly like a walk; default input touch | 45 min |
| 1 | terrain function, world.js ground and props on terrain, figure angle and crouch | 1 h |
| 2 | physics (4.2), input verbs, bot, camera ride shot | 1 h |
| 3 | stations: approach props (procedural), arrive, swallow rule, bare plate, exit and resume, planTask split | 1 h |
| 4 | modes (5): calm ramp and ticks, wake lift, fatigue crest lights and kicks, rest drift | 45 min |
| 5 | core: kindle ring, launch leap and the start tableau | 30 min |
| 6 | summit ride and give (hold-driven dawn clock) | 30 min |
| 7 | motes and trail, juice table 4.5, reduced motion | 45 min |
| 8 | acceptance runs (11), record `ride` object | 30 min |

Fallbacks if time runs out: step 7 motes before trail; fatigue crest rings without the count-in haptics; props as plain silhouettes; flat stations without the plate (bare only).
