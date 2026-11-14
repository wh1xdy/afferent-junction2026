# Teaching v1: one obvious move, one visible reason

Status: design spec by the lead UX designer, for the minigame branch (`afferent-game-mg`). Nothing here is built yet. It answers two things David said after playing: "I don't understand at all what I have to do. The figure just seems to randomly move. I have no idea where to click. It has to be self explanatory" and "Most of the mini games I don't get at all, what I should do and what their purpose is."

Inputs: the level-design, mobile-onboarding and research-UX reports and the first-time-player audit (all relayed by the orchestrator), `design/coreloop.md`, `design/minigames.md`, `design/concept.md`, and the code in `demo/js` (read only).

Where this file and `minigames.md` or `coreloop.md` disagree about teaching, hints, ghosts, gates or the first encounter, this file wins. Everything else in them stays binding, in particular the measurement contracts (rest window, reaction core, fork, lanterns, check-in), no fail states, no numbers or scores, no red, the 3 Hz rule, the flash guard, haptic caps and reduced motion.

Source markers: [P] primary source (developer talk, commentary or article), [S] secondary analysis, [M] known from play, not verified in this run. Keys in brackets point to the source list at the end.

---

## 1. The five principles

1. **The need comes first.** A still frame of every opening shows what is wrong, who wants it fixed, and where the light will go. Role models: Okami's cursed zones that bloom back [Okami, S], Cut the Rope's Om Nom under the candy [CutTheRope, P], Journey's mountain [Journey, S].
2. **The world waits for your first touch, and the first try can't fail.** Nothing you control moves by itself before you touch. The first item comes to you and is wide open. Role models: Flappy Bird's "Get Ready" freeze [M], Mario 1-1's first Goomba [Miyamoto, P], Hayashida's safe first step [Hayashida, S].
3. **Show it once with its real result, then let go.** A ghost finger performs the exact move on the real object, the world reacts, then the ghost gives the turn to you. It comes back only after idle time or a fumble. Role models: WarioWare's "I'll show you how it's done" [WarioWare, P], Material hint motion [Material, P], Pudding Monsters' idle hand [Pudding, S], the Super Guide in New Super Mario Bros. [NSMB, S].
4. **One "touch me" language, used for nothing else.** A sun-yellow breathing ring sits only on the live touch target, and that target is the brightest thing on screen. Role models: Monument Valley's handles [MV, S], Portal's visual hot spots [Portal, P], and Journey, where brighter walls than triggers sent players the wrong way [Journey, S].
5. **Every touch answers twice, and only your touch pays.** Each touch answers at the finger within one frame and at the beneficiary within 300 ms. Payoffs (lit windows, boats home, warmed stones) fire only when the player acts. Role models: Salen and Zimmerman's "discernable and integrated" [SZ, S], Limbo's arms-out cue [Limbo, P], Okami's bloom [Okami, S].

---

## 2. The purpose spine: why the Keeper does anything

The story stays wordless (concept.md section 1). You wake in kaamos holding the only warm light, and you carry it to things that are waiting for it. Every task is the Keeper **giving light to one beneficiary**. That beneficiary is visible, dark and in the frame from the first frame.

The pattern comes from Stardew Valley's Community Center: each bundle you finish visibly repairs a named part of the town, such as a bridge or the greenhouse [Stardew, S]. Animal Crossing's museum does the same, where each donation fills a visible empty case [M]. Journey adds the ever-visible goal [Journey, S], and A Short Hike keeps the peak as the one goal everything points to [ShortHike, S].

**The beneficiary rule (every task, every station):**

| Beat | What the player sees | Pattern |
|---|---|---|
| Want (approach and the first 0.5 s of the open) | The beneficiary is dark and still: dark windows, boats on black water, cold stones, a torn aurora, a swan of dim points. Its **lit state is pre-drawn at 12% alpha** over the dark state as a goal preview | Okami's problem first; Stardew's empty bundle slots; stars already does the faint figure |
| Line | A faint dotted light line (sun token at 0.25 alpha, 2u dots every 9u) runs from the touch target to the beneficiary. It draws in over 0.3 s | Where's My Water's pipe to Swampy [CutTheRope, S]; Portal's shadows that point at the box [Portal, P] |
| Each success | A mote leaves the touch point, runs the line in 250 to 300 ms and lands. The beneficiary visibly steps one notch toward its lit state (one window lights, one boat turns home, one stone glows), with a `light` haptic on landing | Okami's per-stroke bloom; Florence's interaction as meaning [Florence, P] |
| Exit | The beneficiary stays changed in the world for the session (coreloop 6.4 already lists what persists). The task's light folds into the lantern. The lantern gains a notch, and the day-mark on the horizon gains one step | Gris's colour return [Gris, S]; Stardew's room reward |

**One anchor for the whole session.** The day-mark stands on the right horizon in every shot: first the dark lighthouse at the harbour, then the fell with the sun's glow under it. Every exit mote that lands on the lantern sends one thin ray from the lantern toward the day-mark. This is Journey's mountain and A Short Hike's peak. Rule: if one task's own purpose is unclear, the player still knows the big one ("I'm bringing light back for the dawn").

**One object, one place.** The audit found floating dioramas that duplicate a world prop: two lighthouses, two towers, two jars, a stove in the sky, and a purple figure inside the fork stage next to the beige Keeper. Rules:
- When a task's arch shows the station prop (lighthouse, tower, jar, stove, loom), traverse hides that prop in the world while the stage is open. The arch grows out of the prop's screen point, so the prop "opens up". Pattern: Monument Valley's single rendering language [MV, S].
- There is one figure design everywhere: the Keeper from concept.md section 7. A task that draws the figure uses the shared Keeper drawing or sprite, never its own colours.
- A payoff that "goes into the world" leaves the arch visibly and lands on a world object in view. The audit found one moment where this worked: the beam from the lantern to the lighthouse after the last Bite. Every task gets an exit like that.

---

## 3. Shared teaching kit: `demo/js/teach.js`, namespace `A.Teach`

One file, one builder. Tasks only declare where their target is and report touches. The kit draws the ghost, the ring, the line and the info icon, keeps the timers and stores what each player knows.

### 3.1 Teaching levels per player and per item

Every teachable item has an id: the 11 task ids plus `kindle`, `checkin`, `bite_practice`, `ride` and `give`. Its level is decided once at the item's start.

| Level | When | What the player gets |
|---|---|---|
| `first` | the item has never had a **clean success** on this device | want beat, gate (the world waits), the demo with its real result, a breathing ring, a spotlight (everything else in the arch dims to 80%), the idle ladder, the fumble replay. Challenge layers are off (3.6) |
| `refresh` | it had a clean success before, but the last play was more than 7 days ago, or the last play needed forgiving input or auto-help | demo once, a breathing ring on the first item only, the idle ladder. No gate, no spotlight. Challenge layers on |
| `known` | a clean success in an earlier session, played within 7 days, unhelped | **No hints at all** except the idle ladder from 3 s. The permanent signifiers (the object's own shape, its sun ring while live) stay, because they are the game, not a hint |

A **clean success** means at least 2 items completed by the player's own touches in one play, with the first of them done without forgiving input, auto-help or a ghost shown for that item. One accidental hit does not count as learned (Ultraleap: "hints disappear after two or more successful actions" [Ultraleap, P]). Measurement items count a clean success as: rest held for at least 3 of its 6 s (`kindle`), one practice bite caught by touch (`bite_practice`), the practice path walked by touch (`fork`), and the second practice pair answered by touch (`lanterns`).

So day 1 teaches, and **day 2 shows no hints** to a player who succeeded on day 1. Only idle time brings a ghost back. This is the "teach once, then take the hint away" ratio from Cut the Rope pack 1 [CutTheRope, S].

### 3.2 Storage (per player = per installation, like `afferent.skill.v1`)

- Key `afferent.teach.v1`. JSON: `{"v":1,"items":{"shutters":{"seen":3,"clean":2,"last":"2026-11-14","helped":false,"ghosts":1}},"updated":"<iso>"}`.
- Read once at session start and written at every item end and on app hide. Every access goes through try/catch, as `store` in `main.js` does.
- A failed or empty read treats every item as `first` for that session and never blocks the session. The session record says `teach.stored: false`, so analysis can see it.
- `?teach=first` (forces `first` for all items), `?teach=known` (forces `known`) and `?teach=reset` (clears the key) are dev parameters read in `main.js`, for testing with `&task=<id>`.
- Autoplay (`s.auto`), simulated profiles and `?speed` ignore the store and never write to it. They run as `known` with no gates, so the bots and the acceptance tests keep their timing.

### 3.3 The ghost finger (one look, every gesture)

The current `finger()` in `juice.js` draws silver at 0.95 alpha with a drop shadow, so it reads as a solid object. NN/g found that polished overlays get tapped as if they were real [NNg, P].

- **Look:** a birch `#F2EEE6` hand at 0.6 alpha with no shadow, a 1.2u ply-edge `#B48E5C` outline at 0.5 and a soft white halo (18u, 0.25). It is 32u in size, with the fingertip at the hotspot and the palm below and to the right, so the hand never covers the target. The colour is used for nothing else in the game.
- **Never captures input.** Touches pass through it.
- **Hidden while the player holds** (`A.Input.holding()`). This fixes the ride ghost that showed mid-hold (audit point 4).
- **On a real touch-down:** the ghost freezes for 150 ms, then fades over 200 ms ("pause then disappear", Material [Material, P]). It does not return until the idle ladder restarts.
- **Gestures,** each shown on the real target with the real result:

| Gesture | Ghost motion | What the task shows at the same time |
|---|---|---|
| `tap` | moves in 0.25 s, presses 120 ms (12u dip), and a ring flies out from the fingertip | the real reaction of the object and the mote to the beneficiary |
| `hold` | presses and stays down; a sun ring fills around the fingertip over the hold time; then it lifts | the object charging (petals opening, the Keeper crouching) |
| `release` | lifts 14u and fades while the object reacts | the object releasing (the cloak opening, the ring of light leaving) |
| `drag` | presses at the start, travels the path with a dotted trail at the finger's speed, lifts at the end | the object following the finger 1:1 |
| `trace` | a drag through ordered points, pausing 80 ms at each | each point lights as the hand passes |
| `wait` | hovers raised 16u above the target, does not press, breathes slowly (0.5 Hz); presses only when the event happens | the event (the float plunges) |

- **Loop rules:** a period of at least 1.3 s and at least 1.0 s of rest between loops. No more than 3 loops per item before auto-help. Never faster than 1 Hz, well inside WCAG 2.3.1's 3 flashes per second [WCAG, P].

### 3.4 The touch ring, the spotlight and the goal preview

- **Touch ring** (principle 4): sun yellow `#F2C230`. Its radius is the hit radius plus 6u, its stroke 2.5u. It breathes at 0.5 Hz: scale 1.00 to 1.06, alpha 0.55 to 0.85. Only one ring is live at a time, only on the current target and never on decoration, motes, bloom or fever. The rest of the arch must not have anything brighter than it. Fireflies' decoy frost motes and fever must stay silver or cool. Pattern: Monument Valley's one touchable colour [MV, S]; Inside's fridge, picked out by its contrast [Inside, S].
- **Spotlight** (`first` only, until the first success): non-interactive layers inside the arch are drawn at 80% brightness. Portal: "unnecessary objects scattered all over the place distracted players" [Portal, P]. Sleep inertia impairs visual search in the first 15 to 30 minutes after waking [Hilditch, P].
- **Goal preview:** each task draws its beneficiary's lit state at `tc.preview` alpha (0.12 for `first` and `refresh`, 0.08 for `known`) and fills it in with progress. The kit only provides the alpha and the line.

### 3.5 Gate, idle ladder, fumbles, forgiving input, auto-help

Times count from the moment the target becomes live, or from the last real touch, whichever is later.

| Time | `first` | `refresh` and `known` |
|---|---|---|
| 0 to 0.5 s | want beat: the beneficiary and the line are shown, input is accepted, no cue yet | input accepted |
| 0.6 s | **demo** (1.2 to 1.6 s): the ghost performs item 1 and the task plays the real consequence; then the item resets to wide open for the player | `refresh`: the same demo, once; `known`: nothing |
| 1.5 s after the demo | the ring brightens (+0.15 alpha) | |
| **3 s idle** | ghost loop once on the current target (the "3 s rule", the same everywhere) | ghost loop once on the current target |
| 6 s idle | ghost again, and **forgiving input** turns on: any touch anywhere counts as the verb on the current target (P3 of the UX report) | ghost again |
| 9 s idle | ghost again | forgiving input on |
| 12 s idle | **auto-help**: the task performs one item itself, softly (its existing auto-solve for one item), then the ladder restarts for the next item from 3 s | task timeouts as in minigames.md |

- **Gate** (`first` only): `tc.waiting()` is true from the open until the first real touch on the target or the 12 s auto-help. While it is true the engine does not advance `g.t` (so no timeout runs), and the task does not advance its schedule (no next volley, no next boat, no beat count-in). Animation keeps running on `J.at`. Pattern: the Flappy Bird freeze [M]; Monument Valley, where Ida walks only when you tap [MV, S]; Limbo's "stick you there until you learn" [Limbo, P]. The gate never applies during eyes-closed fatigue at night (the director's rest rules win) or in autoplay.
- **Fumble replay:** 2 off-target or wrong touches before the item's first success replay the ghost at once, once per item (the Super Guide's failure count [NSMB, S]). An off-target touch always gets a soft answer: a silver ring and a `tick`, never silence and never anything negative.
- **Cap the dead time:** a gate plus its demo never adds more than 14 s to a task. Session budget: see 4.3.

### 3.6 Challenge layers wait for a clean first encounter

This conflicts with minigames.md 0.2 ("no warm-up below `L_eff`") and resolves it (P9 of the level-design report; Portal, chamber 08 was split for "too many new concepts at once" [Portal, P]).

- On a `first` play, `A.Skill` presents the task at `d = min(L_eff, 0.30)` with `heat`, `ramp` and `boss` at 0, unlock steps (frost motes, 4th bell, mirror blind, latch) off, and the speed-up stingers silent. The play gets credit weight `w = 0`, so learning does not move the stored level.
- `refresh` and `known` plays run the full challenge contract from minigames.md section 0.
- A twist (the boss item) never brings a new verb; it is the same verb with more pressure (Inside [Inside, S]; Hayashida [Hayashida, S]).

### 3.7 Reduced motion (`A.J.rm()`)

- The ghost does not travel. A drag or trace shows the hand at the start (0.4 s), the dotted path drawing in, then the hand at the end (0.4 s), as crossfades. A tap is a static hand with one ring that fades in and out. A hold is a static pressed hand with the ring filling, which is not motion.
- The touch ring does not scale. Its alpha breathes 0.6 to 0.8 at 0.5 Hz.
- Motes crossfade from the target to the beneficiary in 300 ms instead of flying.
- The spotlight, the gate, the ladder and the timings stay the same, because they are not motion.

### 3.8 The info icon (David's allowance, kept as a fallback)

- A 20u "i" glyph inside a 44pt hit area in the arch's top right corner, on ply at 0.35 alpha. It brightens to 0.7 from the second ghost loop of an item. It is not drawn in measured windows (the rest window, the reaction trials, the fork choice, the lantern trials).
- A tap pauses the task (gate semantics) and opens a **wordless 4-panel loop** for the current task, 0.8 s per panel: (1) the need (the dark beneficiary), (2) the move (the ghost on the target), (3) the result (the mote landing), (4) the world (the beneficiary lit in the landscape). A tap anywhere closes it.
- Andersen et al. found an on-demand help button hurt the simple game Refraction (-15% play time) [Andersen, P]. So the icon is a fallback, never the fix; the fix is sections 2 and 3.1 to 3.6.

### 3.9 API (what tasks and the engine call)

```
A.Teach.start(id, g) -> tc
tc.level
tc.preview
tc.target({ kind, x, y, r, path, dur, hold })
tc.recipient(x, y, r)
tc.touch(onTarget)
tc.success()
tc.waiting()
tc.forgiving()
tc.autoHelp()
tc.demo()
tc.challenge()
A.Teach.send(from, to, colour, onLand)
A.Teach.ghost(ctx, kind, x, y, at, opts)
A.Teach.draw(ctx, now)
A.Teach.record(g)
A.Teach.level(id)
A.Teach.done(id, outcome)
```

- `tc.target` is called every frame by the task while a target is live (`kind` is one of the gestures in 3.3). `path` is a function `m -> [x, y]` for `drag` and `trace`.
- `tc.demo()` returns `{ on, p }` while the demo plays, so the task can play its real consequence for the demonstrated item and then reset it.
- `tc.autoHelp()` is true for one frame when the task should solve one item itself.
- `tc.challenge()` is false on `first` plays (3.6).
- `A.Teach.record(g)` returns `{ v: 1, level, gate_ms, demo, first_touch_ms, ghosts, fumbles, forgiving, auto_help, info_opened }`. The engine writes it to `extra.teach` of each task; the top level gets `teach: { v: 1, stored, levels: { id: level } }`. Both are schema-valid today (task `extra` is free form, top level `additionalProperties: true`, minigames.md 0.2).
- `first_touch_ms` gets logged for every task. Later, set the `known` idle delay at the 75th to 80th percentile of returning players' first touch, as Roblox's onboarding guide does [Roblox, P].

---

## 4. The very first session, second by second

The one core verb is **hold** (kindle, the ride, give). Tap is the second verb (Bite, tasks). The safe moment for hold is **before** the rest window. The safe moment for tap is a practice bite **before** reaction trial 1. Nothing measured moves.

### 4.1 Measurement guards (must stay true)

- **Rest:** the 6 s window (`REST_S`) keeps its length and its rules (coreloop 6.2). The ring curve depends only on hold time, is local, adds at most +10% luminance and closes with the same bloom. The only change is **when it starts**: at the first still hold (finger down for 0.5 s), at the earliest 2.0 s after Begin, and at the latest 8.0 s after Begin, whatever happens. Recommended for **every** session, not only the first, so the window always begins with a still, held phone. Log `rest_gate_ms`. This is a contract change for the orchestrator (decision D1 in section 8).
- **Check-in:** no ghost ever presses a lantern (that would suggest a mood). The hint is symmetric.
- **Reaction:** the practice bite comes before trial 1, unlogged, on `first` only. The 5 trials, the 1.0 to 2.5 s foreperiods, the 1.5 s window and the `bite/1` stimulus are untouched. No ghost and no ring during measured trials.
- **Fork and lanterns:** practice before the first logged round or trial. No ghost presses a side or a lantern in logged trials.

### 4.2 Timeline (first session, every item `first`, a typical player)

| t (s) | What the world does | What teaches | What the player does |
|---|---|---|---|
| start screen | The Keeper sits on the mound with a dark lantern. One sun-yellow button with a ring and **one word: "Hold"** (the existing "Hold to kindle" label shortened; section 6). The onboarding text wall moves behind the (i) | The word plus the ring that fills while held (WarioWare's single verb [WarioWare, P]) | presses and holds |
| 0.0 | the start UI fades **under the held finger**; ember sparks; the hold carries straight into the kindle, so there is no second kindle prompt (audit point 10) | | keeps holding |
| 0.0 to 0.6 | the flame catches | | |
| 0.6 to 2.0 | the light reveals the harbour: the Keeper on the pier, the water channel, and **the dark lighthouse on the right horizon with its lit state at 12%** (the day's first need). While held, a thin ring gathers around the lantern for display only (gate gather, not logged) | the cause is on the lantern: hold, and light gathers | holds |
| (no finger) | the world waits: the flame stays small, the Keeper sits still | ghost `hold` on the lantern from 1.0 s, the sun ring on the lantern; at 3 s idle another ghost loop | puts a finger down |
| 2.0 (or first still hold + 0.5 s; at the latest 8.0) | **rest window starts** (6 s, unchanged) | | holds still |
| 2.0 to 8.0 | the kindle ring fills, the flame steadies and grows a notch, and the warm pool reaches the Keeper's cloak (s1 yellow first touches the cloak, concept 3.4) | lifting shows the ghost on the lantern again after 1.0 s (existing rule) | holds |
| 8.0 | the ring closes in its bloom; one thin ray goes from the lantern toward the dark lighthouse and stops halfway: "more light is needed" | **lesson 1 learned: hold = the light grows** (Sky's candle [M]) | |
| 8.0 to 10.0 | check-in: five lanterns slide in one by one, equal brightness | at 3 s idle a raised ghost hand sweeps slowly over all five without pressing (symmetric, no suggestion) | taps one |
| ~10.0 | the tapped lantern's mote **flies into the flame** and tints it (today it just vanishes; audit point 10) | the answer has a visible destination | |
| 10.5 to 12.0 | **practice bite 1 (demo, unlogged):** the Keeper casts and the float bobs. The ghost hovers **raised** above the float (`wait`). The float plunges with a splash; on the same frame the ghost presses the float; a fish of light arcs into the lantern, the lantern brightens, and the dark lighthouse gains one glint | the demo shows wait, then tap, and why (Animal Crossing's still bobber and single bite [M]) | watches 1.5 s |
| 12.0 to ~15.0 | **practice bite 2 (the player's, unlogged):** recast, float bobs about 1.5 s, plunge. The bite **stays up** (held cue, Samurai Kirby [M]) until a tap, up to 6 s. A tap before the plunge: a small ripple and the float stays (teaches "wait for it"). At 3 s after the plunge the ghost presses; at 6 s an auto-catch | the safe rep: Mario's first Goomba [Miyamoto, P] | taps on the plunge; fish into the lantern; glint 2 on the lighthouse |
| ~15.0 | five empty bead sockets appear under the lantern (the trials to come); the existing 1.2 s lead-in demo is skipped today because the practice replaced it | the progress is the world's: five catches light the lighthouse | |
| ~15.5 to ~28 | **5 measured bites** exactly as today; each catch adds a bead and one step of light on the lighthouse | no ghost, no ring | taps each bite |
| ~28 to 29.6 | the fifth bead: the lighthouse ignites (1.6 s); the beam crosses to the Keeper | the purpose of the fishing is visible: the lighthouse is lit | |
| ~29.6 | **ride gate:** the Keeper turns to the slope and crouches. A **sun ring at the first touch point (0.5W, 0.72H)** breathes. There is no auto-go at 1.2 s on `first` (cap 8 s) | ghost `hold` on the touch point at 0.6 s; the Keeper's crouch deepens **with the ghost press**, and the ghost lifts | presses: run, leap |
| ~30 onward | see 4.4 | | |

### 4.3 Session budget on day 1

The gates cost at most about 6 s (rest) + 6 s (bite) + 8 s (ride) + 14 s (one task), but a typical player loses about 8 s. The existing planner (coreloop 6.6) already turns leftover time into fewer adaptive tasks, so day 1 plays fork, at most **one** adaptive task, lanterns and the summit. That is right for a first session: one new idea per encounter (Portal chamber 08 [Portal, P]; Monument Valley, "we only added a level if we had something new to say" [MV, P]).

On day 1, the engine picks that one adaptive task from the most physical, least rule-based tasks: shutters, then fireflies, then loyly. Bells and stars, with their memory and ordering demands, come from day 3 on, introducing at most one new task per day. The reason is sleep inertia, which impairs memory and decisions most in the first 15 to 30 minutes after waking [Hilditch, P].

### 4.4 The first ride (seconds about 30 to 45)

| Moment | World | Teaching |
|---|---|---|
| leap | two strides and a leap over the channel; the cloak spreads | the cloak shape is the feedback for "released" |
| first down slope (`first`) | the **training hill**: long and gentle, with a line of motes at crouch height, the next crest fully in view, speed starting at VMIN (Canabalt's slow start and full lookahead [Canabalt, P]) | ghost `hold` at the touch point 0.6 s after landing if no finger. **Without a hold the Keeper slows to a walk in the valley** (on the first 2 hills of a `first` ride only: floor 0.35 VMIN, the wind visibly dies, the cloak hangs) and waits; with a hold the wind returns at once |
| hold | on the same frame: a **25% crouch** (not 12%), the hood leaning forward, the cloak tucked, snow spray from the feet and a speed streak; the wind sound rises with speed; a `light` tick. Crouch-height motes are caught only while crouched | Limbo's pose as the cue [Limbo, P]; Tiny Wings' visible squash [M]. A bystander can tell press from release from the Keeper alone |
| up slope | the ghost lifts just before the crest (anticipation 0.3 s) | `release` gesture |
| release at the crest | the cloak opens wide and the Keeper is thrown through an arc of motes above the crest; each mote chimes and flies into the lantern | the "light" verb pays in the air |
| no release | the Keeper presses over the crest without leaving the ground; the arc motes pass overhead with a soft plink | the lesson is the missed arc, not a punishment |
| after 3 good holds | the touch ring dissolves into "anywhere"; the ghost now appears only after 3 s without input on the ground | P5 of the level-design report |

---

## 5. Per item: purpose, verb, first-time teaching, feedback, 3 s idle

Every block has the same fields. "Arch" means the Opening (concept 9.3); "world" means outside it. Every ghost uses 3.3, every ring 3.4, every ladder 3.5. Each item names its role model and the pattern taken.

### 5.0 Ride (traverse.js)

- **Purpose:** the Keeper carries the only warm light over the hills to the things waiting for it, and finally to the fell where the sun is waiting. Motes are scattered light; gathering them makes the lantern bigger, and a bigger lantern gives more at each station and at dawn.
- **Seen before the first press:** the day-mark on the right horizon (the lighthouse, later the fell with a glow under it); the next station's prop at the right edge in its **want** state (dark windows, boats on black water, a frosted sauna window, a torn aurora), drawn by traverse in the prop's dark grade with its lit state at 12%.
- **Role model:** Journey's mountain [Journey, S]; Tiny Wings' race to the next island before the sun sets [M]; A Short Hike's peak [ShortHike, S].
- **Verb:** hold (heavy) and release (light).
- **First time:** 4.2 and 4.4 (the ride gate, the training hill, the touch ring at 0.5W, 0.72H, the slow-to-walk on 2 hills).
- **Success feedback:** the 25% crouch, the forward lean and the spray on hold; the open cloak and the throw on release; motes chime into the lantern; a silk landing gives a puff and a speed burst.
- **3 s idle (on the ground):** a ghost on the touch point that presses on down slopes and lifts on up slopes (the current `want` logic plus a 0.3 s anticipation). Hidden while holding. Never in the air (the audit found input made no visible difference; the air is not where to teach).
- **Station arrival:** the bench stop is the cue that the ride pauses; the arch opens from the prop.

### 5.1 reaction (Bite, fixed core)

- **Purpose:** the Keeper fishes light out of the dark water to fill the lantern, so the lighthouse can be lit and the day can begin. Each catch is visibly one step of the lighthouse's light (a glint, then a window, then the lamp room), and five light it.
- **Before starting:** the dark lighthouse on the horizon with its lit state at 12%, and five empty bead sockets under the lantern after the practice.
- **Role model:** Animal Crossing fishing (still bobber, one unmistakable bite, catch lifted up) [M]; Okami's step-by-step restoration [Okami, S].
- **Verdict:** keep. This is the best purpose in the game today (the audit's one clear moment).
- **Verb:** wait, then tap when the float plunges (anywhere).
- **First time:** two practice bites (4.2). The ghost is the `wait` gesture: raised, never pressing during the wait (today it sits beside the hole and says "tap now"; audit point 4). There is no ring on the float during the wait; the splash itself is the brightest thing on the plunge.
- **Success feedback:** a frame-0 catch pose with a short freeze (Samurai Kirby [M]), the fish arcing into the lantern, a bead, the lighthouse step, `medium`.
- **3 s idle:** only during practice bite 2, 3 s after the plunge: the ghost presses. During measured trials: **nothing** (measurement).
- **Day 2+ (`known`):** the existing 1.2 s lead-in demo as specified, no practice.

### 5.2 fork (Fell or Shore, measurement slot 1)

- **Purpose:** two dark waymark fires mark the way home in the polar night, a low one on the shore and a high one on the fell. The Keeper climbs to one and lights it. The higher fire holds more light, its orbs visible from frame 1 (2 or 3 against 1). Every lit waymarker you pass is a candle you light on the way. The light goes into the Keeper's hem band and the lantern (concept 7).
- **Before starting:** both cairns with dark bowls and their orbs bobbing above (already specified). The waymarkers must read as **candle niches in stone**, unlit grey, never as igloos or beehives (audit point 7).
- **Role model:** Monument Valley's path of stepping nodes [MV, S]; Journey's glyphs into the scarf [Journey, S].
- **Verdict:** keep (measurement). Retheme the stones only.
- **Verb:** tap a side to choose, then tap each candle as it lights.
- **First time (`first`): practice path, unlogged, before round 1's choose phase.** One short path in the middle (2 candles, no choice and no orbs): the ghost taps the first candle, the flame catches, and the Keeper hops onto it. Then the player taps the second (gate, ring on the candle, ghost at 3 s idle). A tiny bowl at its end lights, and the Keeper hops back to the split. Then round 1 starts exactly per contract, so `decision_ms` is untouched. Effort-task protocols use practice trials too (EEfRT, Treadway et al. 2009 [M]).
- **In the logged choice phase:** the Keeper's hood turns left and right (already specified); both path regions get an **equal** soft edge glow. At 3 s idle a raised ghost sweeps once over both sides without pressing, starting on a random side, and that side is logged. Nothing presses a side. The 6 s `none` rule is unchanged.
- **In the logged candle phase:** the current candle gets the sun ring (it already has a halo). The ghost only on the first candle of round 1 on `first` (the current `tapCue` when `hits === 0`), never afterwards.
- **Success feedback:** as specified (the flame catches, the Keeper hops, the bowl ignites, orbs into the hem), with a uniform pitch arc so that both paths feel equal.
- **3 s idle:** the choice gets the symmetric sweep (above); candles get nothing beyond the ring (the lights have a fixed life by contract).

### 5.3 lanterns (Lantern Release, measurement slot 3)

- **Purpose:** the harbour sky is empty. The Keeper releases sky lanterns, and each one rises to become a star. **The lantern that swells is the one that has filled with warm air and is ready to fly**, which turns the abstract "pick the bigger one" into a physical reason (a sky lantern inflates before it rises).
- **Before starting:** the **outline of the payoff constellation at 8% alpha** in the sky above the rope, with empty star sockets. Its shape and brightness are the same whatever the answers, so the payoff never becomes accuracy feedback.
- **Role model:** WarioWare's "pick the bigger one" [WarioWare, S]; Animal Crossing's museum, where empty cases fill one by one [M].
- **Verdict:** keep (measurement). Change the theme to "fill the empty sky", and use the swell as warm air.
- **Verb:** tap the lantern that swelled.
- **First time:** the practice pair already exists. Fix: the ghost appears **only once the lanterns hang** and presses the bigger one at the swell. Today it points at empty space before they arrive, and there is no hand when they can be chosen (audit point 4). Add a **second practice pair** that the player answers: no 2.6 s timeout, a ring on both lanterns equally, a ghost at 3 s idle on the bigger one. Choosing the smaller one makes it wobble, and the bigger one swells once more (practice only). Both pairs are unlogged, and `practice_shown` is already in `extra`.
- **Logged trials:** the response juice is identical for both sides and for correctness (contract). Each released lantern rises into **the next empty socket**, whichever side was tapped, so the sky fills with responses, not with correct answers. The scheduled reward keeps its warm star.
- **3 s idle:** logged trials get nothing (the 2.6 s window and X36 rule stand); practice gets the ghost.

### 5.4 breath (Lantern Song, calm; rest mode excluded)

- **Purpose:** the Keeper sings light into three dark landmarks (the sauna window, the birches, the chimney). Each breath in gathers light around the lantern, and each breath out sends it as a ring that wakes the next landmark, which stays lit.
- **Before starting:** the three landmarks dark in the world, with their lit states at 12%, and the dotted line from the lantern to the first.
- **Role model:** Journey's song (hold, a ring gathers, release, it wakes what it passes) [Journey, S]; Apple Watch Breathe (petals and a tap train on the inhale) [AppleBreathe, S]; Sky's candle [M].
- **Verdict:** keep.
- **Verb:** hold while the flower opens (4 s), let go while it closes (6 s).
- **First time:** gate: the flower stays closed and still until the first hold. `breath_sync` gets its fixed 4/6 clock from that moment, which keeps its reference fixed. The touch target is **the flower around the lantern**, not the bottom of the screen (audit point 4); the sun ring sits on the flower. Demo: ghost `hold` on the flower with the petals opening and the ring filling, ghost `release`, the ring flies out, and the sauna window lights.
- **Success feedback:** the petals open with the inhale tap train (`tick` at 1.5 Hz at most) while held; on release the ring leaves and the landmark lights within 300 ms; `light`.
- **Payoff only on action:** a breath without at least 1.0 s of hold during the inhale sends only a faint wisp that dies, and the landmark stays dark until the next breath. No song ring and no new stars fire without holds (today they fire anyway; audit point 2).
- **3 s idle:** at the next inhale onset the ghost shows `hold`. After 2 missed cycles, forgiving input: any touch anywhere during the inhale counts.

### 5.5 loyly (Silk Pour, calm)

- **Purpose:** the sauna is cold, with grey stones and frost on the inside of the window. The Keeper pours water on the stones so the steam warms the sauna. Each good pour melts one band of frost from the window and the stones glow orange. At the exit the sauna window in the world glows warm for the session.
- **Before starting:** the arch grows **out of the sauna door** into the interior (the stove, the bucket, the ladle, the frosted window). The world stove floating in the sky is removed (audit point 3). The warm stones and the clear window are drawn at 12%.
- **Role model:** Cooking Mama's pour (the stream width shows the hand speed) [M]; Florence's household act as meaning [Florence, P]; Stardew's watering-can preview [M].
- **Verdict:** keep.
- **Verb:** drag the ladle from the bucket over the stones slowly.
- **First time:** the sun ring on the ladle handle. Demo, the full pour, not the short dip shown today (audit point 9): press on the ladle in the bucket, carry it over the stones, a slow 1.2 s sweep with a fine silk stream, the stones glow, the hiss, steam rises, one frost band melts. The ghost trail shows the speed (an even, slow trail).
- **Success feedback:** the stream width follows the finger speed (a thin silk stream when slow, a splash when fast); the stones warm only under the stream; the frost melts per pour; `light` per stone, `medium` on the window.
- **Payoff only on action:** the stones never warm by themselves (today they do; audit point 2).
- **3 s idle:** a ghost pour from wherever the ladle is now; a fast splash counts as a fumble (2 fumbles replay the ghost at once, showing slow).

### 5.6 threads (Aurora Loom, flow)

- **Purpose:** the aurora above the Keeper is torn: dark gaps, each in one colour. The loom mends it. Each joined pair becomes a strand that flies up and closes the gap of its colour at once. At the exit the woven aurora stays in the world sky (coreloop 6.4).
- **Before starting:** the top 30% of the arch shows the **aurora with its gaps** and their colour glyphs; the loom grid sits below; each knot pair has a dotted line up to its gap. The world aurora is visible above the arch.
- **Role model:** Flow Free (the core) [M]; Okami's brush restoration [Okami, S]; Florence's puzzle pieces as the story [Florence, P].
- **Verdict:** keep, with the gaps in view from frame 1. If the 3-second screenshot test (section 7) still fails, reframe it as mending a fishing net on the pier with the same grid, which is a more household act (Florence's bar).
- **Verb:** drag from a knot to its twin.
- **First time:** the first board is **one pair** (`first` only), then the specified board. Gate: nothing auto-solves while waiting (today it auto-solves; audit point 2). The ghost animates the **whole** drag along the solution path at finger speed (today it is a static hand on a knot, which reads as a tap; audit point 4), and the strand rises into its gap.
- **Success feedback:** the pipe fills cells with the start knot brightening; on join, a click, the strand peels up and the gap closes with a shimmer; `medium`.
- **3 s idle:** the ghost drags the **next** unjoined pair (today only the first; audit point 5).

### 5.7 stars (Joutsen, flow)

- **Purpose:** the swan, the bird that brings back the light of spring, is lost in the dark sky as dim scattered points. The Keeper draws its line star to star so it can fly home; when it is whole it spreads its wings and flies toward the fell (the day-mark).
- **Before starting:** the swan's **faint outline at 12%** (already in the spec, "a faint bird") with the dotted line running through the stars **in the order they must be linked**.
- **Role model:** Okami's constellations (the faint animal behind the stars comes alive when drawn) [Okami, S]; Two Dots' rubber-band line [M].
- **Verdict:** keep, but **replace the hidden "small to large" rule with the visible line**. The stars are laid out along the swan's outline so that the path order equals the size order. The logged meaning (size order, `wrong_rank_gap`) stays valid, and the size is a visible extra cue, not a secret rule (UX report P6; Cut the Rope's controls you find out yourself [CutTheRope, P]).
- **Verb:** trace the swan's line from the smallest star.
- **First time:** the sun ring on the first star; the demo traces the first two links, and those segments of the swan light. Today the ghost shows one link and then leaves the player alone for 8 s (audit point 5).
- **Success feedback:** each link snaps with a squash and a rising note, and that segment of the swan lights in the sky; `light`.
- **Payoff only on action:** a timeout lights only the traced part; the untraced part stays a faint outline and the swan does not fly. Nothing is taken away, it is just not finished. Today the full swan appears anyway (audit point 2).
- **3 s idle:** the ghost traces from the current star to the next.

### 5.8 fireflies (Firefly Fling, wake)

- **Purpose:** the path ahead into the forest is dark. The Keeper gathers fireflies into the jar, and the jar becomes a lamp: each catch lights one stone of the path ahead. At the exit the light column stays over the lake.
- **Before starting:** the jar on its stump in the arch, empty, and a **dark path of 6 to 8 stones** leading off to the right in the arch's lower band, each stone's lit state at 12%.
- **Role model:** Fruit Ninja Zen (lob, hang, stroke) [M]; Vampire Survivors' magnet pull into the collector [M].
- **Verdict:** keep.
- **Verb:** swipe through the fireflies at the top of their arc.
- **First time:** the first volley is 2 slow fireflies (already specified) that **hang at the apex until the first swipe** (the gate). There is a sun ring around the pair (one ring for the volley), and the demo stroke goes through both (the current `dragCue`), which then fly into the jar, and two path stones light.
- **Success feedback:** the trail, the catch spark, the magnet flight into the jar, the jar brightening, a path stone lighting; `light` per catch.
- **3 s idle:** a ghost stroke through the currently hanging fireflies (today the hint stops after the first volley; audit point 5).
- **Decoys:** frost motes stay silver-blue, never sun-coloured, and are off on `first` (3.6).

### 5.9 beacon (Harbour Beat, wake and fatigue)

- **Purpose:** boats are out on the black water and cannot find the harbour. The Keeper flashes the lighthouse lamp on the beat. Each boat caught by the flash lights its own lamp, turns its bow and **sails out of the arch's bottom edge into the world harbour** next to the Keeper, where it stays moored and lit.
- **Before starting:** dark boats in the arch; the dotted line from each boat to an empty berth in the world harbour below. The arch shows the lamp room, and the world lighthouse prop is hidden while the arch is open (audit point 3).
- **Role model:** Rhythm Heaven (a count-in, a telegraph, the same reaction on every hit) [M]; osu!'s approach circle [M].
- **Verdict:** keep.
- **Verb:** tap when the ring closes on the boat (anywhere).
- **First time:** the count-in starts only after the first touch on the screen (gate). The first boat's ring closes slowly and **holds closed** until a tap (a held cue on `first`, the first boat only). The demo taps exactly on the closing. The sun ring is the approach ring itself (it is the touch-timing signifier).
- **Success feedback:** the beam flashes to the boat, its lamp lights, it turns and glides home into the world; `medium` on the beat.
- **Payoff only on action:** a missed boat stays dark, circles and returns later as a new cue, as missed fireflies are relaunched. Pier lamps never light by themselves (audit point 2). At the timeout, unlit boats stay out on the water, dark and calm, with no penalty shown.
- **3 s idle:** a ghost taps on the next closing ring. Fix the hang found in the audit (point 8): the gate caps at 12 s and then auto-helps.

### 5.10 bells (Tower Chain, wake and fatigue)

- **Purpose:** the village in the valley sleeps. The tower calls a melody, and the Keeper answers it on the bells. Each echoed note lights one house window down in the valley, and at the end the tower lamp lays a light lane down the next slope (coreloop 6.4).
- **Before starting:** the arch shows the belfry with 3 bells, and through its lower arches the dark valley windows (lit states at 12%), one dotted line from each bell to its window.
- **Role model:** Simon, where the call plays on the same pads you answer on [M]; Rhythm Heaven's call and response [M]; Stardew's restoration [Stardew, S].
- **Verdict:** keep, but **move the call onto the bells**. Today the call is shown in the tower windows and the ghost points at a bell for 14 s, so copying it scored 0 (audit point 4). In the call, each bell swings and glows as it sounds; then all bells settle and their ropes brighten together ("your turn"), with a `tick`. Simon's grammar 1:1.
- **Verb:** tap the bells in the order they rang.
- **First time:** round 1 is **one note** (`first`): the bell swings by itself, and the ghost taps the same bell, which swings and lights its window. Then the player's round with 1 note, then 2. The sun ring appears on all three bells during "your turn" only (all three are valid targets, so the ring must not give the answer).
- **Success feedback:** the bell swings with the tap, its note sounds, the window lights within 300 ms; on a full chain all windows pulse once in order; per-bell haptic weight.
- **Wrong bell:** a soft dull clunk, a silver ring and a replay of the current round (already specified).
- **3 s idle (your turn):** the ghost taps the **next correct bell** of the chain (a replay hint, logged as a hint).
- **Session placement:** not on day 1 or 2 (4.3); memory is what sleep inertia hits hardest [Hilditch, P].

### 5.11 shutters (Wake the House, fatigue)

- **Purpose:** the house is shut and dark. The Keeper opens the blinds and shutters so the lantern's morning light gets in. Each opened window floods a room, and **the plant on the sill lifts its head toward the light**. The Keeper stays the only character (concept 7), so the plant is the sign of life. At the exit the house row in the world keeps lit windows.
- **Before starting:** the facade in the arch, the dark room behind the current window (its lit state at 12%), and a thin line of light leaking at the edge that will open (already specified, the direction cue).
- **Role model:** WarioWare: Touched! (the verb implied by the object: a cord means pull) [WarioWare, S]; Florence's household acts [Florence, P].
- **Verdict:** keep. The clearest task today (copying the hint completed it 3 times out of 3).
- **Verb:** pull the cord or handle the way the light leaks.
- **First time:** the first window is a blind with a big pull ring; the sun ring sits on the pull ring; the demo pulls the full travel; light floods in and the plant lifts.
- **Success feedback:** 1:1 tracking with resistance to the commit point, the slats cascading, the light spilling into the room and out onto the snow in front; `medium` at commit.
- **3 s idle:** the ghost pulls on the current window (already the case; keep it on every window).

### 5.12 kindle, check-in, give (the other holds)

- **kindle:** 4.2. The purpose is the lantern itself, and the pull toward the dark lighthouse.
- **check-in:** 4.2. A symmetric hint, and the mote flies into the flame.
- **give (dawn):** the sun sits under the fell; the dotted line goes from the lantern to the sun. On `first`, a ghost `hold` on the lantern at 1.2 s without a touch (existing). While held, the lantern lifts and the sun rises with the hold. Pattern: Journey's ending light [Journey, S]. Finishing at dawn is the session's whole purpose made visible.

---

## 6. Minimal text policy

The default is **no words in play**. Every case below is the exception, following WarioWare's rule that every instruction fits in one word [WarioWare, P].

| Allowed | Where | Rule |
|---|---|---|
| One word on the one primary control | the start button: **"Hold"** (today "Hold to kindle") | It is a real control, not a hint, so it stays every day. Night: same word |
| Icons | the ghost hand, the sun ring, the (i) glyph | no other glyphs |
| (i) panel | 3.8 | wordless 4-panel loop |
| Fallback verb (off by default, flag `teach_words`) | only if a task fails the silent observer test (section 7) after the visual fixes | **one imperative verb**, shown once for 1.0 s at the moment of need on `first` only, in the label style above the target, then never again: Hold, Pull, Pour, Join, Trace, Catch, Echo. Never in reaction or lantern trials, never on the check-in, never numbers |
| Settings and accessibility labels | outside play | as today |

The onboarding text wall on the start screen moves behind the (i) or into settings. **"Not today" must not sit where "Got it" was**: a second tap at the same spot ended the session in the audit (point 10). Put "Not today" as a text button above the fold line of the start screen, away from the bottom sheet's action row.

---

## 7. Acceptance tests (run on a phone, lying down)

1. **3-second screenshot test** per task: a frozen first frame shown to someone new: "What would you touch, and what is it for?" Pass when 4 of 5 name the move **and** the beneficiary. Ken Wong tested Monument Valley levels on strangers without giving them any hints or help [MV, P].
2. **Silent observer test:** a first-time player in bed makes the correct first touch within 3 s of the open (unprompted or after the demo) and can say afterwards what it did for the world ("I woke the house"). Portal's commentary shows most chamber fixes came from watching testers [Portal, P].
3. **Avatar legibility test:** someone watching only the Keeper can tell press from release every time.
4. **No-input test** (`?teach=first`, zero touches): nothing pays off by itself. No lamps, swan, stones, aurora or constellation come from waiting. Each gate auto-helps at its cap, and the session still ends with dawn before 2:00 (the planner drops tasks).
5. **Day-2 test** (play once cleanly, then reload with the next date): no demo, no gate, no spotlight; the first ghost appears only after 3 s idle.
6. **Measurement regression:** with `?teach=first`, the rest window is 6 s and starts at `rest_gate_ms`; there are 5 reaction trials with unchanged fields; `fork.choices[]` and `lanterns` trial counts match the contract; practice fields appear only in `extra`.
7. **Autoplay:** the bots run with teach as `known` (no gates) and keep their timelines from coreloop section 7.

---

## 8. Decisions for the orchestrator

- **D1 Rest start gate** (4.1): the rest window starts at the first still hold (2.0 to 8.0 s after Begin) in every session, with the same 6 s length; log `rest_gate_ms`. Alternative: `first` sessions only. Recommended: every session.
- **D2 Challenge layers wait for a clean first play** (3.6), overriding minigames.md 0.2 "no warm-up". Recommended yes.
- **D3 Payoff only on action** (principle 5): today's unconditional payoffs in beacon, lanterns (constellation), stars, breath, loyly and threads become partial. Lanterns' constellation stays answer-independent (it fills per response, 5.3). Recommended yes; it is the core of "purpose".
- **D4 Stars rule** (5.7): the order becomes the visible outline, with stars placed so that path order equals size order. The stars builder checks that `wrong_rank_gap` keeps its meaning; bump `extra.v`.
- **D5 Bells call on the bells** (5.10), with no bells and stars before day 3 (4.3).
- **D6 The traversal floor on the first ride** (4.4): 0.35 VMIN without a hold on the first 2 hills of a `first` ride only, overriding coreloop's "never stalls" floor for that stretch.
- **D7 One figure:** every task that draws a figure uses the shared Keeper.

---

## 9. Build list by file (one owner per file, no overlap)

Order: the teach builder first (about 3 h); then traverse and the tasks in parallel. Tasks can ship against a stub `A.Teach` that returns `known` while teach.js is in progress.

### Teach builder: `teach.js` (new), `index.html`, `engine.js`, `skill.js`, `checkin.js`, `main.js`

- `demo/js/teach.js` (new): everything in section 3: the store (3.2), the levels (3.1), the ghost drawing and gestures (3.3), the ring, spotlight and preview alpha (3.4), the gate, ladder, fumbles, forgiving input and auto-help (3.5), reduced motion (3.7), the (i) icon and its 4-panel loop (3.8), the API (3.9), `A.Teach.send` motes. `A.J.finger` and `tapCue` and `dragCue` stay for compatibility but call the new look.
- `demo/index.html`: `<script src="js/teach.js"></script>` after `juice.js`, before `skill.js`. Start label "Hold" (section 6). Move "Not today" away from the "Got it" spot.
- `demo/js/engine.js`:
  - `startGame`: `g.teach = A.Teach.start(id, g)`.
  - game loop: advance `g.t` only when `!g.teach?.waiting()`.
  - `closeTask`: `extra.teach = A.Teach.record(g)`, plus the top-level `teach` summary.
  - `fadein`: start rest at the gate (D1) instead of at a fixed 2 s; log `rest_gate_ms`.
  - `updateRt`: do not create a trial while `RP().practice?.(this, now)` is true.
  - `drawOverlay`: call `A.Teach.draw(ctx, now)` after the task draw, before `T.drawOver`.
  - `planTask`: on day 1 at most one adaptive task, from shutters, fireflies, loyly; bells and stars from day 3 (4.3).
- `demo/js/skill.js`: when `A.Teach.level(id) === 'first'`, set `heat`, `ramp` and `boss` to 0, keep unlocks off, cap `d` at 0.30 and set `w = 0` (3.6).
- `demo/js/checkin.js`: the symmetric idle sweep; the tapped lantern's mote flies into the flame.
- `demo/js/main.js`: `?teach=first|known|reset` into `A.config.teach`; the start hold carries into the kindle without a second kindle prompt.

### Traverse builder: `traverse.js`

- The ride gate (no auto-go at 1.2 s on `first`, 8 s cap), the touch ring at (0.5W, 0.72H) that dissolves after 3 good holds, the training hill and the 0.35 VMIN slow-to-walk (D6).
- A 25% crouch with a forward lean, spray and streak on hold, and crouch-height motes that only count while crouched.
- The ride ghost through `A.Teach.ghost`, hidden while holding, shown only on the ground after 3 s idle, with 0.3 s anticipation (replaces the current `drawOver` finger block).
- The day-mark always on the right horizon, with an exit ray from the lantern toward it.
- Station props in their want state with lit states at 12%; hide the world prop while the arch is open when the task definition has `stageProp: true`; persisted lit states at the exit (coreloop 6.4).
- The dawn give ghost through `A.Teach.ghost`.

### Task builders: one per `demo/js/tasks/<id>.js`

Each task: declare `stageProp` when the arch shows the station prop; call `tc.target` every frame for the live target, `tc.recipient` for the beneficiary, `tc.touch` on every touch-down and `tc.success` on every item; draw the beneficiary's lit state at `tc.preview`; send a mote with `A.Teach.send` on every success; respect `tc.waiting()` (do not advance the schedule), `tc.forgiving()` (accept any touch as the verb on the current target) and `tc.autoHelp()` (solve one item); play the real consequence during `tc.demo()`. Remove the task's own `tapCue` or `dragCue` timers, because the kit's ladder replaces them. Task-specific changes:

| File | Changes |
|---|---|
| `reaction.js` | two practice bites on `first` (4.2), `practice()` for the engine hook, the `wait` ghost, lighthouse steps per catch |
| `fork.js` (plus the fork block in `measures.js`, one hold line before round 0) | the practice path, the candle-niche waymarkers, the symmetric choice glow and sweep, the shared Keeper drawing (D7) |
| `lanterns.js` | the ghost only once the lanterns hang, a second interactive practice pair, constellation sockets filling per response, the 8% outline |
| `breath.js` | the gate, the target on the flower, landmarks lighting only on held breaths, the forgiving inhale after 2 missed cycles |
| `loyly.js` | the interior from the door, `stageProp`, the full-pour demo, stones warming only under the stream, frost bands melting |
| `threads.js` | the aurora gaps in the arch, a one-pair first board, no auto-solve during the gate, an animated full-path ghost, the ghost on the next pair |
| `stars.js` | stars along the outline in size order (D4), a ghost over two links and then one link per idle, a partial swan on timeout |
| `fireflies.js` | the dark path stones, the apex hold on the first volley, the ghost on every hanging volley, silver decoys |
| `beacon.js` | `stageProp`, the count-in after the first touch, the held first ring, boats sailing to world berths, missed boats returning, the gate cap (fixes the hang) |
| `bells.js` | the call on the bells, valley windows, a one-note first round, rings on all bells during "your turn", a next-bell ghost |
| `shutters.js` | the sill plant, a pull-ring target, the ghost on every window |

---

## Sources

- [Andersen] Andersen et al., "The impact of tutorials on games of varying complexity", CHI 2012: https://grail.cs.washington.edu/projects/game-abtesting/chi2012/
- [AppleBreathe] https://www.macrumors.com/2016/06/20/watchos-3-apple-watch-breathe-app/
- [Canabalt] Adam Saltsman, "Tuning Canabalt": https://www.gamedeveloper.com/design/tuning-canabalt
- [CutTheRope] Efim Voinov interview: https://www.pocketgamer.biz/zeptolab-cto-efim-voinov-on-how-its-million-selling-cut-the-rope-was-inspired-by-a-yo-yo-ninja/ ; first-time flow: https://deconstructoroffun.com/blog//2012/05/5-points-for-killer-first-time-flow.html
- [Florence] https://www.gamedeveloper.com/audio/designing-i-florence-i-to-convey-the-ineffable-feeling-of-being-in-love ; GDC 2019: https://gdcvault.com/play/1025694/Letting-Go-A-Florence
- [Gris] https://en.wikipedia.org/wiki/Gris
- [Hayashida] https://www.engadget.com/2015/03/17/super-mario-3d-world-design/ ; https://www.nintendolife.com/news/2012/04/super_mario_3d_land_director_shares_level_design_inspirations
- [Hilditch] Hilditch and McHill 2019, "Sleep inertia: current insights": https://www.dovepress.com/sleep-inertia-current-insights-peer-reviewed-fulltext-article-NSS
- [Inside] https://www.gamedeveloper.com/design/inside-teaching-through-level-design
- [Journey] GDC 2013 "Designing Journey": https://gdcvault.com/play/1017700/Designing ; Narrative Review: https://media.gdcvault.com/gdc2013/GameNarrativeReview/Glenn%20Winters_JourneyNarrativeReviewFinal_GJW.pdf ; Kellee Santiago: https://gamesbeat.com/kellee-santiago-describes-the-making-of-thatgamecompanys-journey/
- [Limbo] Jeppe Carlsen, GDC Europe 2010: https://www.gamedeveloper.com/game-platforms/gdc-europe-i-limbo-i-s-carlsen-on-making-players-your-worst-enemy-and-your-best-friend
- [Material] Material Design gesture education: https://m1.material.io/growth-communications/gesture-education.html
- [Miyamoto] https://www.gamedeveloper.com/design/how-miyamoto-built-i-super-mario-bros-i-legendary-world-1-1
- [MV] https://www.gamedeveloper.com/design/building-context-toy-like-interfaces-in-games ; https://www.gamedeveloper.com/design/designing-the-surprise-mobile-game-hit-i-monument-valley-i- ; GDC Europe 2014: https://gdcvault.com/play/1020878/Designing-Monument-Valley-Less-Game
- [NNg] https://www.nngroup.com/articles/mobile-instructional-overlay/ ; https://www.nngroup.com/articles/mobile-tutorials/
- [NSMB] https://mariowiki.com/Super_Guide_Block
- [Okami] https://www.pcgamer.com/why-i-love-restoring-nature-in-okami
- [Portal] Valve developer commentary: https://theportalwiki.com/wiki/Portal_developer_commentary
- [Pudding] https://uxplanet.org/how-to-communicate-hidden-gestures-in-mobile-app-e55397f4006b
- [Roblox] https://create.roblox.com/docs/production/game-design/onboarding-techniques
- [ShortHike] https://en.wikipedia.org/wiki/A_Short_Hike
- [Stardew] Community Center: https://wiki.stardewvalley.net/Community_Centre
- [SZ] Salen and Zimmerman, meaningful play: https://en.wikipedia.org/wiki/Meaningful_play
- [Ultraleap] https://docs.ultraleap.com/xr-guidelines/Getting%20started/tutorials_hints_tip.html
- [WarioWare] Iwata Asks, Smooth Moves: https://iwataasks.nintendo.com/interviews/wii/warioware_smooth_moves/0/2 ; Goro Abe: https://www.nintendolife.com/features/butt-movements-pitches-and-9-volts-retro-microgames-we-speak-with-wariowares-chief-director ; https://en.wikipedia.org/wiki/WarioWare
- [WCAG] 2.3.1: https://www.w3.org/WAI/WCAG21/Understanding/three-flashes-or-below-threshold.html
- [M] items (Animal Crossing fishing and museum, Sky's candle, Flappy Bird's "Get Ready", Tiny Wings, Samurai Kirby, Cooking Mama, Simon, Rhythm Heaven, osu!, Fruit Ninja, Two Dots, Flow Free, Vampire Survivors, EEfRT practice trials in Treadway et al. 2009) are from play or reading knowledge and were not fetched in this run.
