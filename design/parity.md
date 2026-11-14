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
