# Role-model parity spec

## Amendments from the teammate review (round 2+)

Source: `design/review-response.md` on `main` (rulings on the teammate's game review). Only accepted and modified items appear here. Each item names its measurement guard (M) and safety guard (S). Anything rejected there (live HRV feedback, RMSSD fields, mood-coloured lantern or week row, start lantern shown at the end, weekly test block, cutting the pool to 4, passive BA tailoring, mood-driven session length) must not be built.

### Flow

1. **No self-report changes session length or effort.** Remove `mood_1` and `mood_2` from `checkAssist` in `demo/js/skill.js`; assist only from `f`, pulse quality, RT lapses or slowing, fatigue and skill drop, as I29 says. M: `mood_start` (weight 1.5) stays free of any incentive to tap low. S: the I31 low-lantern offer and the X26 crisis offer are unchanged.
2. **Director shapes stay as today:** eyes closing leads to wake first, high pulse leads to calm and breathing, night rule unchanged. No sleep, presence, visitor or HRV inputs. M: no undefined or simulated input changes the session. S: night rule and `fell_asleep` unchanged.
3. **Task choice within a mode is a randomised rotation.** Replace the `helped` bandit's selection with rotation for variety, with a random draw among eligible tasks and the assignment probability logged per task. DDA sets the level. M: pooled hub analysis of next-morning `mood_start` by task can then be causal; `helped` stays logged if Statistics wants it, but nothing reads it for selection. S: none new.
4. **BA step in the end slot.** After the Shine, inside the 5 s end budget, on BA days it takes the quote's slot: 3 rotating icons from a menu the player built at onboarding (values-based: a person to message, a place to walk, a small task). One tap or skip. Season-aware: no "sunlight" or "open the curtains" options in kaamos; offer "a walk outside at midday" instead. A smaller step may be shown on low-mood days. M: shown only after `mood_end`, so it cannot colour the end rating. S: no passive data picks or confirms icons; no patient text cites any effect size.
5. **BA follow-up the next morning** ("did you?": yes, partly, no) comes after `mood_start` and after the fixed RT core, never before. M: a "no" cannot prime the mood rating or the RT context. S: no answer is ever negative toward the player.
6. **Optional "stay and breathe"** on the done screen: 3 to 5 min, outside the measured session. Not offered at night, where breathing is already the rest. M: not part of the session record's measures. S: gentle-breath cue (see Teach).

### Teach

1. **One short instruction line per task** at first sight (WarioWare command style), for example "Tap the bigger lantern", "Ring them in order". Keep the ghost-finger demo. M: the line is identical every session and never changes during measured trials. S: no line implies success or failure ("good", "bad", "wrong").
2. **Two lanterns:** one line ("Tap the bigger lantern") plus the practice pair of minigames 3.3 (first session, after 7 days away, or after 3 or more unanswered trials). Never reveal or hint the 3:1 reward schedule. M: practice is never logged; amber stays the rich lantern (X21); the 12 trials and pooling stay as they are. S: if a playtest shows it still frustrates, raise it for a drop, do not tweak the schedule.
3. **Breathing pacer:** keep 4 s in, 6 s out; in calm mode it may start at about 7/min and slow to 6. Cue "gentle breaths", never "deep". M: `breath_sync` stays an estimate. S: avoids over-breathing and lightheadedness.

### Tasks

1. **Keep the pool; serve fewer, longer tasks per session:** 2 to 3 adaptive tasks of about 20 to 25 s instead of 4 to 6 short ones. Persistent per-task levels as in `skill.js`. M: the fixed RT core and the two measurement slots are untouched. S: none new.
2. **Cuts only by playtest** (readability with the instruction line, completion, replay), never by an evidence column. Constellation is the first candidate. M: none. S: none.
3. **Fork stays daily, placed in the Ride** as the slope choice (mechanics-review L4). Log hard-path success per choice. M: same 2 choices and rewards (X5), so `effort_hard_prop` and its 7-session window stay comparable; Statistics needs to sign off the new placement as the same measure. S: none.
4. **Shutters stays a wake task**, not framed as BA rehearsal. M: none. S: no daylight claim in kaamos.

### Walk

1. **The figure's lantern never carries the mood colour.** It looks the same for every start mood. M: the figure's lantern is the RT stimulus in aa (`world.js:243`); if any lantern brightening is kept during the Ride, the RT flare must use a fixed-luminance stimulus on a fixed backplate (as the mg Bite reaction already does). Check that every measured stimulus has the same luminance in every session. S: no visual tells the player how they are expected to feel.
2. **Brightening follows progress, not mood:** colour return per task, the lighthouse ladder and dawn, identical for every start mood. M: no demand cue before `mood_end`. S: none new.

### Feedback

1. **The start tap answers within 1 s, value-neutral:** the chosen lantern's spark flies into the figure's lantern and kindles it, same flame and animation for every value, then the figure's lantern looks neutral. M: no anchor carried to the end check-in. S: same response for 1 and 5, so a low answer is never "punished" or "fixed" on screen.
2. **End check-in shows the five lanterns only**, never the start answer. M: no anchoring of `mood_end`. S: keeps X26 and I31 sensitive.
3. **Week row: lit or unlit, one warm fill** (`#FFD58A` per lit day, today `#F2C230`), as I30. Remove the `--af-mood-N` colouring in `demo/js/gui/shell.js` (week row) and stop showing stored day moods there. M: no bad-week view before tomorrow's `mood_start`. S: no meta output that reads mood.
4. **Positive score-like feedback is allowed** (grades, combos, fever). M: never based on the fixed core or measurement slots. S: nothing goes down across days, no comparison with earlier days, no failing grade.
5. **BA reward:** any answer gets a small warm acknowledgement; yes and partly add one persistent waymarker on the island that only grows. M: never counted toward the streak or the village light (those stay "showing up only"); BA completion is engagement data, never an outcome. S: no count of misses anywhere.
6. **Hide the patient "What helped" card** (gui.md section 2, patient view) until a real outcome exists. M: `helped` is breath-phase noise. S: no unsupported claim on a patient screen.

## World map and progression (role model: Gris)

Source: `design/map.md` on `main` (Gris research with sources, the island map, the diagram, and the full lists of what transfers and what does not). Rule: copy what Gris does; where unsure, do what Gris does. Gris is a hub and spokes: a central temple with a tower, regions opened from it, a return to the hub after each, and a final ascent from the hub into the sky. Afferent: the hub is the harbour with the lighthouse at the foot of the fell; every morning starts there and ends on the fell summit above it. Nothing here changes the fixed core, the measurement slots, the colour order (yellow, blue, green, dawn) or the session timeline. Must not be built: traversal abilities unlocked by colour or by days, regions locked until earlier ones are done, collectibles or counts in the world, a map screen, text guidance, backtracking, a chase or monster, upside-down or gravity sections, red.

### Walk

1. **Every morning starts at the hub.** The start chunk stays the harbour (coreloop 6.2). Drop the lookdev 9 NICE "start where yesterday ended" (`lastBiome`); Gris always starts a chapter from the hub. Rest keeps drifting on the harbour ice, inside the hub. M: the core tableau stays identical in every session. S: none new.
2. **The fell is the goal on the horizon.** `world.js` draws one named fell with a cairn on the far band, the tallest silhouette there, from the start screen to the summit. Its screen x eases from 0.80W at the leap to 0.55W at the start of the summit ride, driven by play time used (`firstPlayAt` to `SESSION_PLAY_END_S`), never by score. The summit ride arrives at it and the dawn sun rises behind its cairn. Static during the core. M: same position at the same play time in every session; static in the core, so it adds nothing to the RT scene. S: none new.
3. **Regions are spokes; the director still picks them.** Keep `biome(m)` in `traverse.js` (calm sauna, flow forest, wake lake, fatigue shore). When the next chunk's biome differs, `traverse.js` publishes `S.nextRegion = {type, x}` one hill before the border, and `world.js` draws that region's landmark silhouette on the far band from then on (sauna hut with lit-able window, lake ice with reeds, forest spruce stand under the aurora anchor, shore headland with houses). Draw lookdev 7.5's border occluder as the fell's shoulder. M: ride only, never in the core or a measurement stage. S: none new.
4. **Reveal camera at the leap and at each region border** (Gris pulls back for scale): only in the ride state, never during approach, arrive or a stage. `V.cam.z` eases to 1.00 and `V.cam.y` lifts 0.04H over 1.2 s, holds 1.0 s, returns over 1.2 s; calm amplitude x0.5; skipped in rest; reduced motion: none. Stays inside coreloop 6.1 (ride z never below 1.00). M: nothing measured during the ride. S: no fast or large camera moves lying down.
5. **The morning ends higher than it starts.** Keep the terrain ramp with tasks done (`plan.done` in `traverse.js`) and keep the summit the highest point of the session. M: none. S: none.
6. **Dawn looks down on the hub.** The summit and dawn shot uses one fixed composition: the harbour, the lighthouse at its `V.lhLevel`, the bay and the village of lights below. Nothing appears during the 8 s hold; today's route is not traced; a milestone landmark due today stays unlit until the Shine. M: dawn stays identical apart from persistent world state that is already visible there (village count), so its effect on the pre/post pair stays constant. S: no milestone, visitor or number at dawn (engagement R10).

### Flow

1. **One morning is one Gris playthrough:** hub core (grey, kaamos), leap out of the hub, the director's region with stations, summit ride, dawn, Shine. The fork (slot 1) is the only branch, as Gris branches only at the hub; nothing else offers a route choice. M: fork placement and rewards as in Tasks 3. S: none new.
2. **Each colour finds its region.** On `lightHome`, when colour g returns, `world.js` lights g's region landmark on the far band as the wave front passes its x (at once if it is off screen): yellow the sauna window, blue the lake ice glint and the shore line, green the aurora over the forest, dawn the sun behind the fell's cairn. A fourth station after green steps the lighthouse ladder only (lookdev 4.5). M: same order and timing as the colour return; no change to `V.sat` values or wave durations. S: a miss only slows the bloom, never removes a light.
3. **All regions are open from morning one.** No region, verb or ability is unlocked by progress or by days; Gris's chapter sequence survives only as the fixed colour order each morning and the fixed milestone order. M: the director keeps every mode from session 1. S: nothing is withheld (engagement 4).
4. **The start screen is Gris's return to the hub.** Show what changed overnight there (and at the Shine), nowhere else: the village light, milestone landmarks placed in their regions' directions (3 jetty lantern in the hub, 7 the sauna cabin's window, 14 the boat coming along the shore to the jetty, 30 the second lighthouse lamp, 50 the sauna chimney smoke; days and visitors exactly as engagement 4), and the season per region by `day_index` (snow thins on near birches, lake ice edges darken, open water at the shore, moss). M: season dressing only, as engagement step 4 allows; the core tableau is otherwise unchanged. S: nothing goes back; a missed day changes nothing.

### Feedback

1. **The village is Gris's sky path.** One light per morning lit (lookdev 9, unchanged); the Shine mote flies from the summit across the bay to its slot. M: same lit-morning rule as the streak (D3). S: never decremented, no count in the world.
2. **BA waymarkers make a way up from the hub** (places the waymarker of Feedback 5): small cairns at deterministic slots (`rng(2000 + i)`) along the path from the harbour up the fell, cap 40, visible on the start screen, only growing. M: never counted toward the streak or the village. S: no count of misses; an empty path looks like a path, not a gap.
3. **Week 8 is the late return to the start ruins:** the start screen simply shows every landmark lit, the village full along the far shore, and spring. No "complete" message, no event. M: none. S: never link spring to recovery (engagement 4).

## Sound engine hooks (keep; owners: flow for engine.js and settings, walk for traverse.js, tasks for task sfx, feedback for record)

### Flow

1. `engine.js`: guard `Au.tick`, `Au.pad` and `Au.dawnPhrase` with `!A.Music.owns(mode)`.
2. `engine.js`: drop the `20*k` term from the `Au.tick` tempo in `style()`.
3. `engine.js`: `fell_asleep` uses `fadeOut` 6 s instead of 4.
4. `engine.js`: call `A.Music.intensity(k)` and `A.Music.dawnT(V.dawnT)` each frame.
5. `engine.js`: emit a `'bloom'` bus event with the colour group when a colour returns.
6. `engine.js`: emit `'candidate'` or call `A.Music.candidate(mode)`.
7. `engine.js`: commit modes with `A.Music.setMode(m, {answer})`, tagging Answer versus Drift.
8. `engine.js`: call `A.Music.stinger('st_settle')` from the Answer moment.
9. Settings: a Headphones row under Sound calling `A.Music.setRoute('headphones'|'speaker')`.

### Walk

1. `traverse.js`: call `A.Music.measure(true)` and `A.Ambience.measure(true, id)` at the standard hill 3 s before Fork or Lanterns, and `false` after.
2. `traverse.js`: call `A.Music.tier(n)` for the chain tier.
3. `traverse.js`: read `A.Music.grid()` for the fatigue beat lock.
4. `traverse.js`: pass ride speed to the ambience ski layer.

### Tasks

1. Check-in and end lantern: sfx names for the check-in tap and the end lantern tap via `A.J.sfx`.
2. Night end: `A.Ambience.window()` for night-end windows.

### Feedback

1. Record: optionally add `audio: A.Music.status()` and `A.Ambience.log` event times.
