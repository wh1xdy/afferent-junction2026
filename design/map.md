# Afferent world map and progression (role model: Gris)

Status: research and mapping, 14 Nov 2026. David: "also take Gris as a reference in terms of the map." Rule: copy what Gris does, do not improvise; where unsure, do what Gris does. Deviations are listed with the reason (section 5). Build instructions live in `design/parity.md` (minigames worktree), section "World map and progression (role model: Gris)". This file does not change measurement, claims, the session timeline or the colour order; `coreloop.md`, `engagement.md`, `concept.md` and `lookdev.md` keep those.

## 0. Verdict in five lines

1. Gris is a hub and spokes: a central temple with a tower, four regions opened one at a time, a return to the hub after each, and a final ascent from the hub into the sky. Copy that shape.
2. Afferent's hub is the **harbour with the lighthouse at the foot of the fell**. Every morning starts there (it already must: the Bite core lives on the pier) and every morning ends on the fell summit above it, looking down on the hub at dawn.
3. One morning is one Gris playthrough in miniature: grey hub, out along a spoke, three colours come home at stations, final ascent, all colours at dawn.
4. The 8 weeks are Gris's returns to the hub: each morning's start screen shows the hub changed overnight (a new village light, a lit landmark in a region's direction, the season).
5. Gris's abilities, locked regions, collectibles, puzzles, chase and monster do not transfer (section 5).

## 1. Sources

| # | Source | What it is used for |
|---|---|---|
| S1 | Wikipedia, "Gris": https://en.wikipedia.org/wiki/Gris | Central tower, four regions, statues restore colour, final power is singing, no fail states, camera and readability tweaks, "a mix of Journey and Ori" |
| S2 | Emma Stone, "Game Narrative Review: GRIS", NYU, Dec 2019, GDC Vault: https://media.gdcvault.com/gdc2020/GameNarrativeReview/Emma%20Stone.pdf | Opening camera, stars as stepping stones that rise into a sky path, colour per stage, ability per stage, statue becoming whole, the late return to the start ruins, the ending |
| S3 | Gamer Walkthroughs, GRIS walkthrough, index https://gamerwalkthroughs.com/gris/ and the pages `prologue`, `windswept-desert`, `windmill-caverns`, `forest-friend`, `black-bird`, `underground-tunnels`, `turtle-of-light`, `light-will-guide-the-way`, `stars-and-fowls` (at https://gamerwalkthroughs.com/stars-and-fowls/), `the-ending` | Chapter order, where each ability and colour is gained, the temple hub, exits from the hub, what changes in the hub |
| S4 | Analog Stick Gaming review, 15 Dec 2018: https://www.analogstickgaming.com/nintendo-reviews/2018/12/15/gris | "always moving forward", "very linear", camera pulls back for scale and zooms in for personal moments, about 3 hours |
| S5 | Gameluster review: https://gameluster.com/review-gris-a-charming-beautifully-designed-little-platformer/ | "mostly linear, with each level having a set path", statues near the end of levels grant colour, a few hours long, one getting-lost case |
| S6 | Game Informer review: https://gameinformer.com/review/gris/not-all-who-wander-are-lost | Exploration "without sowing confusion", backtracking feels new, camera movements |
| S7 | MCV, "50 shades of Gris": https://www.mcvuk.com/development/50-shades-of-gris-how-nomada-studio-created-a-game-that-evolves-visually-not-only-mechanically | Cuevas: "a game that evolved visually, not only mechanically"; Albano: music changes when you pass a zone again with new elements |
| S8 | Gamereactor, "What does Gris mean?": https://www.gamereactor.eu/what-does-gris-mean-we-talk-to-nomada-studio/ | Cuevas: "one of the mechanics had to be to discover colours, unlocking colours" |

Gaps, said plainly: I found no GDC talk by Nomada Studio on level design or the map (the GDC Vault item S2 is a student narrative review, not a developer talk). The fan wiki (gris.fandom.com), TV Tropes, TrueAchievements and Neoseeker refused automated access, and the session's web search budget ran out, so several details rest on one walkthrough (S3) plus S2. Items marked **(uncertain)** below are inferred or single-sourced.

## 2. How Gris's world works (research)

### 2.1 Structure: hub, spokes, final ascent

- **Prologue, grey.** Gris wakes in the hand of a giant crumbling statue, cannot sing, falls (S1, S2). The camera "moves further and further away from her until she is barely visible, a speck in the center of the screen" during the credits (S2). At first she can barely stand and cannot jump; "something is wrong with this girl" (S1, S2). She collects stars that act as bridges over gaps; a large gap needs three stars (S3 prologue). She climbs into the statue's hand and **red** returns; then "climb the long stairway to the right to reach the temple" (S3 prologue).
- **The hub.** Wikipedia calls it "a central tower" (S1); the walkthrough calls it "the temple": "This temple serves as a hub and you'll be back here between levels" (S3). Its walls carry one symbol per level and circles for the mementos found (S3). On the first visit "the only way to go is to continue to the right" (S3).
- **Four regions, opened one at a time** (S1: "a desert filled with windmills, a lush forest, underwater caverns, and a world with buildings made of light"; S4: "As you reclaim each of the colors; Red, Green, Blue, and Yellow, each will take you to an entirely new and distinct location").

| Part | Region | Painted in | Ability, where | Ends with | Back to the hub |
|---|---|---|---|---|---|
| Prologue (denial) | Grey ruins, broken statue | grey | Walk, later jump and run; stars as bridges | Red, at the statue's hand | Long stairway up to the temple; only exit right (S3) |
| Desert (anger) | Windswept desert, then windmill caverns | red | **Heavy** (stone block: stand in sandstorms, ground-pound, break floors), at a tower where two stars "rise into a square" (S2, S3) | Green, at the hand, carried there by a windmill (S3) | Vine slide back to the temple. "In the center a square tree has grown where before there was only a pot and tree trunk" (S3) |
| Forest (bargaining) | Forest; exit from the temple to the left, "until you fall down into the forest" (S3) | green | **Double jump**, at a forest temple after two stars; the Forest Friend runs ahead and opens paths (S2, S3) | Blue, after a star bridge and "the long staircase" (S3) | Across the water back to the temple (S3) |
| Water (depression) | From the temple's lower area, pools to the left, past a turtle symbol, down into underground tunnels and underwater caverns (S3) | blue | **Swim and dive** (manta-ray dress), gained at a temple after collecting its stars (S2, S3) | Yellow, at a hand up a waterfall, partway through (S3); then the eel chase and the turtle (S2) | "swim your way up ... the waterfall back to the central temple. Once Gris releases the stars into the sky the level will be complete" (S3) |
| Light (towards acceptance) | Upside-down world, a palace "high up in the night sky" (S4); reached by red birds flying up (S3) | yellow, gold | **Sing**, after two stars brought back to the temple area (S3). S2 places this back in "the ruins she has explored thrice before" **(uncertain whether at the central temple itself)** | "The worlds will spin around and Gris will fall back to the main temple" (S3) | From the temple's right side, birds up to the tower, then onto the temple roof (S3) |
| Ending (acceptance) | The star bridge at the top of the tower; the black sea; the statue | all | Sing heals the statue | "Colors, red, blue, green, yellow, erupt from their bodies"; the statue is whole; Gris walks up the star path into the sky (S1, S2) | None |

- **Order is fixed.** Each colour returns at the end of a region and then paints the next region (red returned at the end of the prologue paints the desert, and so on) (S3, S2). The region you are in is always in the last colour you earned.
- **Linear inside, branching only at the hub.** "mostly linear, with each level having a set path to follow" (S5); "a very linear experience that still allows a measured approach to its freedom of exploration" (S4); "you are always moving forward" (S4). Side areas hold mementos and return a collectible "or pushes you in the direction of your next puzzle" (S4).
- **Verticality.** The prologue climbs to the temple; the forest is entered by falling down from the hub; the water lies below the hub; the light palace lies above it; the ending climbs a tower above the hub into the sky (S3, S4). The game ends higher than it starts.

### 2.2 Stars, the sky path and the statue

- Stars are collected per level as stepping stones; "once that level's worth of stars outlive their use and the gap is crossed, they rise into the sky, forming a part of what looks like a constellation" (S2).
- "Every star Gris collected has flown up to become part of an unreachable path in the sky ... Now that it's complete" she can reach it (S2). The stars are released into the sky at the central temple at the end of the water chapter (S3). That this sky path visibly grows above the hub after every chapter is **(uncertain)**: both sources imply it; neither states it for every chapter.
- The statue stands at the end of each level with its hand outstretched; it "gradually becomes whole again with each stage cleared" (S2). Its hand is where each colour returns (S1, S5).

### 2.3 Knowing where to go without a map or text

- No map screen, no text, no UI (S1, S2). Reviewers rarely got lost: exploration "without sowing confusion, frustration, or leaving you lost" (S6); "Apart from one specific area in the game, I was never at a loss at what to do" (S4).
- The tools, from the walkthrough and reviews: one open exit from the hub at a time (S3); the next region's gate is a visible structure (stairway, vine, birds, waterfall) (S3); a guide that runs ahead (the Forest Friend, S3); a star that runs away and is followed (water, S3); red birds that lift the player to the next height (S3); stars lighting the gaps they bridge (S2, S3).
- The failure case: "the next path I needed to take was past a white pillar" that looked like scenery (S5). Lesson: the way on must never look like decoration.
- Music changes per zone and changes again "if you pass through a zone and then you pass again with new elements" (S7).

### 2.4 Camera

- The camera "pulls back to allow these areas to showcase their scale" and is "fully zoomed in" for personal moments (S4). The opening pulls back until Gris is a speck (S2).
- Readability drove "several level design and camera angle tweaks"; a dress that changed colour with each region was dropped "partly to the camera angles" (S1).
- Exact zoom values and whether the central tower stays visible from inside the regions: **(uncertain)**, not found.

### 2.5 How returning to the hub shows progress, and how the end ties the map together

- Each return changes the hub: the square tree grown in its centre after the desert (S3); the temple wall symbols and memento circles (S3); the stars released into the sky (S3).
- Late in the game Gris goes "back above ground to the ruins she has explored thrice before ... the gray buildings and red caves from earlier become unrecognizable. There is water here to dive into. There are red moths that allow her to double-jump ... Every part of her journey thus far is manifested here, right where she started" (S2). "The way the game presents the same area in different ways is incredibly smart" (S2).
- The ending climbs from the hub to the sky path that every star built, heals the statue, and all four colours return at once (S1, S2). Hub, statue, stars and colours meet in one place.
- Length: "around 3 hours" (S4), "a few hours" (S5).

## 3. The island as a Gris hub world

### 3.1 The map

```
                              N
          forest (green)            lake (blue)
          spruce, moss, loom        reeds, ice, fireflies
                    \                  /
                     \    THE FELL    /
                      \  cairn, sun  /         far shore:
  shore (blue) -------  rises here  -------    village of lights
  headland, houses       |    |       sauna (yellow)     (one per morning lit)
                         |    |       birches, sauna hut
                    HUB: harbour  (start of every morning)
               pier . Bite channel . jetty . LIGHTHOUSE
                    ~~~~~~~~~~ the bay ~~~~~~~~~~
```

- **Hub: the harbour with the lighthouse, at the foot of the fell.** Gris's hub is where every chapter starts, where you return, and where the final ascent begins (2.1, 2.5). In Afferent the harbour is already where every morning starts (coreloop 6.2 start tableau, the Bite on the pier) and the lighthouse is already the always-visible goal that brightens with progress (lookdev 4.5, like Gris's statue becoming whole). The central peak, the fell, rises directly behind the hub, so the summit ride at the end of every morning is Gris's final ascent from the hub. The lighthouse stays the central landmark; the fell is its tower.
- **Spokes: four regions around the fell**, one per director mode, exactly the biomes `traverse.js` already uses: sauna (calm), forest (flow), lake (wake), shore (fatigue). Rest drifts on the harbour ice, so a resting player stays in the hub.
- **Verticality.** Harbour at sea level, regions on the fell's flanks, summit on top: every morning ends higher than it starts, as Gris does (2.1). `traverse.js` already ramps terrain with tasks done (`plan.done`); keep it.
- **Far shore across the bay: the village of lights** (lookdev 9), Afferent's version of Gris's sky path made of every star collected (2.2). It faces the hub, so the start screen always shows it.

### 3.2 Colour per region

Gris paints each region in one colour, each colour with its own transformation (2.1). Afferent's colour order is fixed by `concept.md` 3.4 (yellow, blue, green, dawn; no red ever). Each colour gets the region whose things it colours in concept 3.4 and lookdev 7.4:

| Colour (stage) | Its region | Named change (lookdev 7.4, unchanged) | Its landmark, seen from wherever you are |
|---|---|---|---|
| Kaamos (s0) | Hub, harbour | Lantern pool only | The lighthouse (lamp level per lookdev 4.5) |
| Yellow (s1) | Sauna | Warmth returns: birches pop, windows light | The sauna window across the snow lights |
| Blue (s2) | Lake and shore | The water wakes: mirrored sky, glints | Ice glints sweep the lake, the shore line catches the sky |
| Green (s3) | Forest | The sky opens: aurora unfurls | The aurora stands over the forest |
| Dawn | The fell | Everything | The sun rises behind the cairn |

The director still chooses which region today's ride passes through (coreloop 5); the colour that comes home at each station is still the fixed next one. What is added, copied from Gris's "each colour takes you to a new location" (S4): when a colour comes home, its region's landmark lights on the far layer, wherever the player is, so the colour visibly reaches its place on the island.

### 3.3 Seeing where you are going

Copying Gris's tools (2.3), in Afferent terms:

| Gris | Afferent |
|---|---|
| One open exit from the hub at a time | One route each morning: harbour, then the director's region, then the fell. The fork (measurement slot 1) is the only branch, as Gris branches only at the hub |
| The goal structure is visible (stairway, tower, sky path) | The fell with its cairn is on the far layer from the start screen to the summit, the tallest silhouette there, drifting closer as play time runs out. The sun will rise behind it |
| The way on is a visible structure, never scenery (white pillar failure) | Each station's prop rises ahead with its line of motes (coreloop 6.3, unchanged). Region borders get the next region's landmark on the far layer one hill ahead |
| A guide runs ahead (Forest Friend), a star runs away | The mote line ahead of each station; the lantern's mote flies to the prop at arrival (lookdev 7.2) |
| The hub tower and statue brighten with progress | The lighthouse ladder steps up per task (lookdev 4.5), seen behind you on leaving the hub and on the headland of the beacon task |

### 3.4 Camera

Gris pulls back for scale and comes close for personal moments (2.4). Afferent keeps coreloop 6.1 bounds (ride z never below 1.00): close at the start screen (z 1.30, the sitting figure, the personal moment), a short pull-back reveal at the leap out of the hub and at each region border (z eases to 1.00, y lifted a little), task shots close as today, and the widest frame at dawn on the summit with the hub below. No speck-sized figure: the phone is above a face in bed.

### 3.5 One morning (about 2 minutes) as one Gris playthrough

```
0:00   HUB (prologue, grey)   lantern catches, rest, check-in, Bite on the pier      kaamos s0
0:30   leave the hub          lighthouse ignites, leap over the channel, reveal       fell on the horizon
       spoke (director)       station 1: fork at the cairn (low shore / high fell)    yellow -> sauna window lights
       spoke (director)       station 2: adaptive task                                blue   -> lake and shore wake
       spoke (director)       station 3: lanterns on a pier (slot 3)                  green  -> aurora over the forest
       spoke (director)       station 4 if time: adaptive task                        lighthouse ladder steps only
1:42   final ascent           summit ride up the fell above the hub
       dawn (8 s, fixed)      sun behind the cairn, the hub, bay and village below   all colours
       Shine                  today's light settles in the village across the bay
```

Gris's chapter count (four regions) becomes the stations of one morning; its hub and final ascent stay the first and last thing of every morning.

### 3.6 Across days: the returns to the hub

Gris changes the hub after every chapter (2.5). Afferent's start screen is the hub, seen every morning:

- **The village** gains one light per morning lit (lookdev 9, engagement 6.1): the sky path of Gris, built one star a day.
- **Milestone landmarks** (engagement 4, days and visitors unchanged) each light in their region's direction, seen from the hub: 3 jetty lantern (hub), 7 the cabin window is the sauna cabin's (sauna spoke), 14 the boat sails in along the shore to the jetty (shore spoke), 30 the second lighthouse lamp (the hub's tower grows, like Gris's square tree), 50 the sauna chimney smokes. A new landmark lights only when the Shine mote lands (engagement step 8), never at dawn.
- **Seasons** (engagement 4 calendar, by `day_index`, never by play) reshape the regions as seen from the hub: snow thins on the near birches, ice edges darken on the lake, open water at the shore, moss under the snow.
- **BA waymarkers** (parity Feedback 5) stand as small cairns along the path from the harbour up the fell, so over weeks they make a visible way up from the hub, like the star path.
- **The end of the arc (week 8)** is Gris's late return to the start ruins (2.5): the start screen shows every region's landmark lit, the village full along the far shore, open water and moss. The same place, unrecognisable from day 0.

## 4. What transfers from Gris

| Gris pattern | Transfers as | Why it fits |
|---|---|---|
| Hub where every chapter starts and the final ascent begins | Harbour and lighthouse start every morning; the summit ride climbs the fell above it | Required anyway by the fixed core; gives every morning a known first and last place |
| One exit open at a time, chosen by the game | The director picks the region; the player never picks a route except the fork | One finger, no menus; the director already owns this lever |
| Mostly linear, always moving forward | The ride always runs on; no backtracking | 2-minute budget; no dead ends |
| One colour per region with its own transformation | Lookdev 7.4 named changes plus the region landmark lighting | Already half built; makes the colour find its place |
| Colour returned at a giant landmark at the end of each section | Each station's light comes home and the colour wave fires | Same beat, one per task |
| Stars become a sky path above the hub | The village of lights across the bay, one per morning | Already the long-term picture (concept 12) |
| The hub changes after each chapter | The start screen shows the overnight change | The "world remembers" goal of engagement 4 |
| The statue grows whole | The lighthouse ladder per session, the second lamp at 30 | Already in lookdev 4.5 and engagement 4 |
| Camera wide for scale, close for the person | Reveal at leaving the hub and at region borders; dawn panorama | Inside coreloop 6.1 bounds |
| No map, no text; guides, visible gates | Fell on the horizon, props with mote lines, region landmarks ahead | Lying down, half awake: nothing to read |
| No fail state | Unchanged | Already a rule |
| The end returns to the start, transformed | Dawn from the summit shows the hub below; week 8 hub shows everything lit | Ties the map together daily and over the arc |

## 5. What does not transfer, and why

| Gris pattern | Not taken because | What we do instead |
|---|---|---|
| A new traversal ability per colour (heavy, double jump, swim, sing) | One-finger input in bed is fixed (coreloop 3); new verbs every week mean new learning for a groggy player; withholding movement conflicts with "nothing is withheld" (engagement 4) | Colour changes the world, never the verbs (lookdev 7.4) |
| Regions locked until the previous one is done | The director needs all four modes from morning one; locking would hold back calm for someone who needs it | All regions open from day 0; Gris's sequence survives as the fixed colour order each morning and the fixed milestone order |
| Red, and the order red, green, blue, yellow | `concept.md` 3.1 and 3.4: no red ever emitted, order yellow, blue, green, dawn | Afferent's order; the region pairing follows concept 3.4 |
| Colour that stays for the rest of the game | Every morning must start from the same kaamos core (measurement) and the daily colour return is the reward | Permanence lives in lights and landmarks (village, milestones, waymarkers), not in the grade |
| Collectibles, mementos, memento circles on the hub wall | No counts in the world (lookdev 9), no completionism, no "missed" anything | Nothing to collect; the village is the only record |
| Backtracking to old regions | No replay is counted (engagement step 11); 2 minutes | The hub view shows old regions changed instead |
| Puzzle zones, getting stuck, invisible walls | Maximum gap rules; tasks are the challenge and are adaptive | Stations are the only stops |
| The monster, the eel chase, the black sea | Threat and chase do not belong in aftercare for depression; a bad day is held, not darkened (lookdev 3.2.4) | None |
| Upside-down and gravity sections | Motion sickness lying down; reduced motion | None |
| Credits pull-back until the figure is a speck; 3-hour pacing | Phone above the face; coreloop 6.1 keeps ride z at 1.00 or more | Short reveals, widest at dawn |
| Starting the next day where yesterday ended (lookdev 9 NICE `lastBiome`) | Gris always starts from the hub, and the core needs the harbour | Drop the `lastBiome` start; the hub view shows yesterday instead |

## 6. Open points

- Statistics: the region landmark lighting and reveal pull-backs happen only during the ride, never in the core or a measurement slot; confirm no stimulus is affected.
- Engagement owner: the milestone landmark positions in 3.6 change only where each sits, not when or what.
- Art: one far-layer silhouette per region landmark (sauna window, lake ice, forest aurora anchor, shore headland) and the named fell with its cairn.
