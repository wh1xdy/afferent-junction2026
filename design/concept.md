# Afferent design concept: Layers of Light

Status: master design concept and single source of truth for look and feel (game, GUI, patient view, clinician dashboard, bedside light, icon, store and pitch). Written by the lead creative director on 14 Nov 2026 from three concept boards, three judge panels and three research reports. Where this file and `ArtBible.md`, `DesignSystem.md`, `design/lookdev.md`, `design/tokens.json`, `design/gui-tokens.json` or the mockups disagree on look and feel, this file wins; section 15 is the change list that brings them in line. It does not change mechanics, measurement, claims or the session timeline (`coreloop.md`, `minigames.md`, `engagement.md`, `questions.md` keep those).

Deliverables next to this file:

| What | Where |
|---|---|
| Final style frames (390x844 at 2x, dashboard 1440x900 at 2x) | `design/concept/final/concept_final_01_start.png` to `concept_final_10_clinic_dashboard.png` |
| Composed board | `design/concept/final/board.png` (source `board.html`) |
| App icon (vector master) and monochrome mark | `design/concept/final/concept_final_icon.svg`, `concept_final_mark.svg` |
| Generated plates (opaque, 1024x1536 high) | `art/raw/concept/concept_final_{start,ride,bite,joutsen,loyly,dawn,end}.png`, `concept_final_patient.png` (1536x1024) |
| Sprite pipeline proof (transparent, high) | `art/raw/concept/concept_final_keeper_sheet.png`, `concept_final_props_sheet.png` |
| Generated icon variant (not chosen) | `art/raw/concept/concept_final_icon.png` |
| Plans used | `design/concept/final/plan_final.json`, `plan_sprites.json`, `plan_icon.json` |
| M3 schemes (generated, with contrast report) | `design/concept/final/theme.json` (script `theme.mjs`) |
| Asset regeneration list (a valid `art/generate.py` plan) | `design/concept/final/regen.json` |

## 0. Decision

**Winner: Aalto Light**, average judge score 8.33 (8.5, 8.5, 8.0), ahead of Raita (7.0) and Lantern Myth (6.83). It has the strongest reason for every choice (a real Finnish design story about healing, built for the exact posture the game is played in), the cleanest Material 3 GUI, the only ownable figure-free mark, and a flat style the procedural world can match at 60 fps.

Renamed for the product: **Layers of Light**. "Aalto", "Paimio", "Artek" and the Aalto Foundation never appear in product-facing branding and nothing implies endorsement; the heritage is the pitch story only. The product name stays `afferent`.

Grafted from the others:

| From | Graft | Where it lands |
|---|---|---|
| Raita | The Disc: tasks open out of the world, the world stays visible | Section 9, "the Opening" (an arch, not a circle, to keep one perfect circle for the sun) |
| Raita | Flat procedural-friendly primitives, banded sky re-ink, 2 px registration settle | Sections 6 and 10 |
| Raita | The bedside light steps one notch warmer per finished task | Section 10 |
| Lantern Myth | Cyanotype night: kaamos is blue monochrome, colour spreads outward from the lantern | Sections 3 and 6 (already lookdev 7.4, now the look) |
| Lantern Myth | The five beats Ember, Way, Rites, Handover, Shore (pitch storyboard and video) | Section 13 |
| Lantern Myth | Lights on the far shore that never go out (lookdev 9 village) as the long-term picture | Section 12 |
| Lantern Myth | The constellation drawn as one continuous curve (Joutsen) | Frame 04 |
| Lantern Myth | M3 schemes generated with Material Color Utilities, error remapped away from red | Section 3.3 |
| Lantern Myth | The bedside lamp is the lantern in the room | Sections 1 and 10 |
| Teardown | One rendering rule for everything, a measurable value contract, no lighthouse with a red band, no scarf | Sections 3.6, 6, 7 |
| Heritage scout | Design for the supine body, no glare, silent transitions, functional colour | Section 2 |
| Brand analyst | Category colour plus glyph per director mode, three motion signatures, store panorama | Sections 3.5, 10, 13 |

Every judge must-fix and how it is resolved:

| Must-fix | Resolution |
|---|---|
| Put the material into the world, not just the icon | Ply lines on every landform edge, in the STYLE prompt and drawn in code (6.3). Visible in all final plates |
| Sky banding and scanlines in `concept_aalto_hero_hi` | STYLE demands perfectly smooth skies; no banding in the final plates. Code skies keep the static dither (lookdev 3.3) |
| `concept_aalto_start` was a 3D toy figure and bench | Replaced by `concept_final_start` (flat, Keeper sitting on a laminated mound) |
| Sprite pipeline unproven (props came back as 3D plush) | Proven: `concept_final_keeper_sheet` and `concept_final_props_sheet` are flat, matte, transparent, neutral light, using the v3 isolated suffix |
| Icon reads as "bacon and egg" or a banana at small sizes | Rebuilt as vector: birch-white ribbon with three frost ply lines, sun at 46% of the width, no tan. Reads at 29 px (frame 09) |
| Never use "Aalto" in product branding | Section 0 and 11 |
| Task window hides the traversal | The Opening (9.3): an arch grown from the lantern, world visible under a 50 to 62% scrim |
| One yellow per screen (scarf, lantern and Begin were all yellow) | No scarf. The Keeper is undyed birch-ply wool. Sun yellow is only the lantern flame and the one primary control |
| Drop the beds-on-the-shore transition | `concept_aalto_transition.png` is retired |
| Night art was saturated ultramarine, not "saturation 0.05" | Committed to a blue night (kaamos), not grey. Tokens and lookdev stage 0 change accordingly (15.2, 15.4) |
| Long-term world change over weeks | Far-shore lights (lookdev 9) plus the strata in the patient view; NICE: the sun stands higher each lit morning (12.4) |
| Two type families if possible | Two for the interface (Jost, Google Sans Flex); Fraunces only for the quote line |
| Streak conflict with "no streaks" | Already decided by `engagement.md` section 6 (D1); this concept only styles it (section 12) |
| Character must not read as Journey, a reaper, a wizard, a gnome or a ghost | The Keeper (section 7): child scale, dome hood, bell cloak in warm undyed wool, hand lantern, no staff, no point, no scarf, never white with a dark hole |

## 1. Name and story

**Concept name:** Layers of Light. **Product:** afferent (lowercase wordmark).

**One line:** Two minutes in bed that bring the morning to you.

**Story (consumer, wordless in the game):** You wake in kaamos, the blue polar night, holding the only warm light. You kindle it, ride it over the hills, and each small task bends one more layer of light into the land, until the sun comes over the fell and your bedside lamp rises with it. Mornings stack up the way bent birch does: strong because the layers are laminated together, not because any single morning was.

**Pitch story (jury and clinic, never in the app):** In 1933 Alvar Aalto finished the Paimio Sanatorium for patients who spent their days lying in bed. He coloured the ceilings because that is where they looked, kept the lamps out of their eyes, and turned the rooms toward the sun. Afferent is used in exactly that position: on your back, phone above your face, minutes after waking, in the months after TMS. "Designed for the person lying down." The Aalto Works sites, Paimio among them, are on the UNESCO World Heritage List (Alvar Aalto Foundation; the inscription date is not verified here).

**The name:** afferent signals travel inward to the brain; light is the first signal of the day. Pitch only.

**Claims:** a supportive morning ritual. It does not treat, diagnose or replace care. Every string follows `GameDesign.md` section 11 and `contracts/api.md`.

## 2. Six principles, each with its role models

| # | Principle | Rule you can check | Role models (pattern taken) |
|---|---|---|---|
| 1 | **Designed for lying down** | Content in the upper two thirds where the eyes rest; every primary control in the lower third thumb arc; nothing important in the top 15% at first wake; light sources enter from the side, never at the centre of gaze; no screen brighter than its scene; transitions silent, haptics before sound | Paimio Sanatorium (ceiling colour, lamps outside the lying patient's sight line, silent basins); Philips Wake-up Light |
| 2 | **One light per screen** | Sun yellow `#F2C230` marks the single thing that matters now (the lantern flame, Hold to kindle, today's day). A night frame is about 70% blue and about 1% sun | Ori (the spirit is the brightest pixel), Kentucky Route Zero (one lit pocket), Headspace (one warm colour) |
| 3 | **One curve per screen** | The free wave appears once per screen: a shoreline, a sheet's top edge, the streak glyph, the ribbon in the mark. Everything else is plain Material 3 geometry | Aalto's free curve (Viipuri ceiling, as a principle), Alto's Odyssey (one horizon line carries the frame) |
| 4 | **Layers, not scores** | Mornings add layers; a missed day "rests the wood". No counter breaks, no 0 or 1 shown, no red, no fail state, no "in a row" | Finch, Sky: Children of the Light (your light never shrinks), Duolingo streak mechanics with `engagement.md` kindness |
| 5 | **Colour is earned** | Kaamos is blue monochrome; colour spreads outward from the lantern in the fixed order yellow, blue, green, dawn, and never goes back | Gris (colour as the reward), Journey (palette follows the arc), Lantern Myth's lantern-radius mask |
| 6 | **Matte and honest** | Birch, plaster, wool, glass-free. Flat shapes, ply-line edges, smooth skies. No gloss, no neon, no photoreal, no generated glow (light comes from code) | Monument Valley (one rendering language), Kaj Franck reduction (principle only) |

Brand-in-one-frame test: with the logo removed, a frame reads as Afferent through four things: kaamos blue, exactly one warm sun-yellow light, the Keeper or the ply-line edge, and one free curve.

## 3. Colour

### 3.1 Pigments (art and UI)

| Token (new) | Hex | Role |
|---|---|---|
| `fjord` | `#0E1A2E` | Night base, dark surfaces, sky top in kaamos |
| `kaamos` | `#1E3150` | Brand colour and M3 seed, icon field, the world before colour |
| `frost` | `#9DB9CC` | Cold light, far fells, muted text on night, the freeze rim |
| `lilac` | `#B4A6CE` | Blue hour band, measure tasks |
| `birch` | `#F2EEE6` | Snow, text on night; the brightest value at night |
| `ply` | `#E2C79C` | Lamination, the Keeper's cloak, frames, Kevät secondary |
| `ply-edge` | `#B48E5C` | Lamination lines, dividers on warm surfaces |
| `sun` | `#F2C230` | The one light: lantern flame core in UI, primary action, today |
| `honey` | `#FFD58A` | Glow, the dawn sun disc, glaze light (replaces `dawn-gold` as a light) |
| `apricot` | `#F3A57A` | Dawn horizon, gentle attention, M3 error role in the game (never red) |
| `ice` | `#8FC6E0` | Blue group (ice, sea), wake mode |
| `spring` | `#9DBE8C` | Spring, tertiary, "steady" |
| `spruce` | `#2F4A48` | Green group (spruce, moss) |
| `ceiling` | `#C8D6BE` | Calm wash for breath and löyly, calm mode |
| `granite` | `#8A8F9C` | Stones, cairn, tower base |

Retired as colours anyone draws with: `dawn-coral #FF8A70`, `dawn-coral-soft #F49D6E` (close to red; was the scarf, lighthouse band, boat stripe, boathouse), `violet-*` as a world colour (the cloak is gone), `lantern-flame #F2E6C9` as "the only warm pixel" (the flame is now a light, 3.2).

### 3.2 Lights (emissive, code only, never painted into transparent art)

| Token | Hex | Use |
|---|---|---|
| `light-ember` | `#FFB54A` | Lantern at idle (`V.ignite 0.15`), far-shore lights core |
| `light-flame` | `#FFE3A6` | Lantern flame core; the brightest value at night |
| `light-glow` | `#FFD58A` | Lantern pool, bloom, mote trails (honey) |
| `light-aurora` | `#5FE3A1` to `#8FC6E0` | Aurora hem to tips (additive) |
| `light-sun` | `#FFD58A` disc, `#FFE3A6` limb | Dawn sun; never white, never `#FFFFFF` |
| `light-daylight` | `#FFF0D2` | Bedside at full dawn, fatigue daylight lift |

Every warm light is honey or amber; nothing in the orange-red range is ever emitted.

### 3.3 Material 3 schemes

Generated with Material Color Utilities (tonal palettes from the seeds, tones fixed per role); script `design/concept/final/theme.mjs`, output with the measured contrast pairs in `design/concept/final/theme.json` (port it into `design/mockups/final/tools/gen-gui-tokens.mjs`, 15.5). Primary seed `sun`, neutrals from `kaamos` hue (dark) and `ply` hue (light), tertiary from `spring`, error from `apricot` at hue 55. All pairs below were measured.

**Kaamos (dark):** game, start, check-in, Ride, tasks, dawn. Night and morning before the handover.

| Role | Hex | Role | Hex |
|---|---|---|---|
| primary | `#F2C230` (sun, pinned) | on-primary | `#3E2E00` (7.9:1) |
| primary-container | `#594400` | on-primary-container | `#FFDF91` |
| secondary | `#B6C7EA` | secondary-container | `#374764` |
| tertiary | `#B0D09F` | tertiary-container | `#334D28` |
| error (attention) | `#FFB783` | error-container | `#703801` |
| surface | `#0D182A` | surface-container low / / high / highest | `#111C2E` `#172234` `#202A3D` `#2A3548` |
| on-surface | `#E8EEFF` (15.3:1) | on-surface-variant | `#B3C1E0` (9.8:1) |
| outline | `#7E8CA9` | outline-variant | `#394761` |

**Kaamos dark-room variant** (first minutes after waking, `quiet` setting): on-surface `#B1BCD4` (9.3:1), primary `#CFA62E` (tone 70), outline `#5A6884`. Keeps `gui-tokens.json` `darkRoom` logic.

**Kevät (light):** end screen after the handover, patient view, settings by day, clinician dashboard.

| Role | Hex | Role | Hex |
|---|---|---|---|
| primary | `#1F467E` (kaamos at tone 30) | on-primary | `#FFFFFF` (9.4:1) |
| primary-container | `#D6E3FF` | secondary | `#745A2A` (ply) |
| secondary-container | `#FFDEA8` | tertiary / container | `#4A663E` / `#CCECB9` |
| error (attention) | `#8D4E18` | error-container | `#FFDCC5` |
| surface | `#FFF8F3` (birch paper) | containers low / / high / highest | `#FCF2E7` `#F6ECE1` `#F0E7DC` `#EBE1D6` |
| on-surface | `#1F1B14` (16.3:1) | on-surface-variant | `#544A39` (8.3:1) |
| outline | `#827563` | outline-variant | `#D9CAB4` |

**Sun fixed roles (both schemes):** `sun #F2C230`, `on-sun #3E2E00`, `sun-container #FFDF91`, `on-sun-container #241A00`. In Kevät the primary action is kaamos blue; sun marks only "today" and the newest layer.

**The interface wakes up.** The UI scheme follows the session: Kaamos from start to the handover, a 2 s crossfade to Kevät when the sun clears the fell (dawn + 6 s), Kevät for the end sheet and everything after. Night sessions never switch (they end on Kaamos dark-room).

### 3.4 World stages (colour return)

Order and timing unchanged (ArtBible 2, lookdev 3.2 and 7.4). What changes is the start: kaamos blue, not grey.

| Stage | Sky top / horizon | Land | What gets its colour | Grade intent |
|---|---|---|---|---|
| s0 kaamos | `#0E1A2E` / `#1E3150` | snow `#5A6E93` in shadow | nothing; lantern pool only | Cyanotype: luma mapped onto fjord, kaamos, `#3E5478`, frost, birch; base saturation 0.12 |
| s1 first light (yellow) | `#1E3150` / `#3E4D72` | birch `#F2EEE6` | birches, wood, the Keeper's cloak, sauna window, ply lines | Warm pool reaches the ply edges first |
| s2 blue hour (blue) | `#22375A` / `#B4A6CE` | ice `#8FC6E0` | ice, sea, far fells | Lilac band appears at the horizon |
| s3 first green (green) | `#1B2F52` / `#8E9FC8` | spruce `#2F4A48` | spruce, moss, aurora | Aurora veneer lines unfurl from the lantern x |
| kevät dawn | `#6E8FC4` / `#F3A57A` | snow `#F2EEE6`, sun `#FFD58A` | everything | Honey, apricot, lilac shadows; never white |

### 3.5 Director modes: one colour plus one glyph each (Apple Health logic)

| Mode | Colour | Glyph (Material Symbols Rounded) | Grade identity (lookdev 3.2.2 stays, with these token swaps) | Bedside |
|---|---|---|---|---|
| calm | `ceiling #C8D6BE` | `spa` | Warm interior pool (sauna), low contrast, slow | `#FFC266` 8% |
| flow | `frost #9DB9CC` | `animation` | Neutral clear night | `#FFD58A` 8% |
| wake | `ice #8FC6E0` | `light_mode` | Crisp cold night, stars, faster swells | `#FFE3A6` 20% (was `#DDEBFF`: no blue light in the bedroom) |
| fatigue | `#FFF0D2` daylight | `wb_twilight` | Daylight lift from the horizon, hoarfrost from corners when eyes close | `#FFF0D2` 40% |
| rest (night) | `#6E6590` dusk lilac | `bedtime` | Dim, quiet, cold lilac | off |
| measure | `lilac #B4A6CE` | `touch_app` | Unchanged world; the Opening uses the full scrim (0.62) | unchanged |

### 3.6 Value contract (measurable)

Measured with the teardown method (luma fifths, darkest first; warm pocket = pixels above 0.7 luma that are warm). Applies to rendered game frames at 390x844; the generated plates are reference, not the contract.

| Frame | Contract | Final plate measured |
|---|---|---|
| Night (s0, start, Bite) | darkest two bands at least 50%; warm pocket 1 to 3%; warm share under 10% | start 11/40/30/15/3, pocket 1.0%, warm 3%; Bite 13/43/36/7/1, pocket 2.8% |
| Mid-session (s1 to s3) | one hue family plus one accent; warm pocket at most 8% | Ride pocket 4.0%; Joutsen 8.2% |
| Dawn and end | lightest two bands at least 70%; no channel at 255 outside the sun disc; mean luminance at most 0.75 | dawn 0/5/21/53/21 (74%), end 0/1/15/51/32 (83%) |

In game the darkness comes from the light buffer (lookdev 3.1), so the s0 frame will be darker than the key art; keep the start screen inside the night contract and above mean luminance 0.18 so a groggy patient sees a world, not black.

### 3.7 Mood, week and clinic states

- Mood lanterns `mood-1` to `mood-5` stay exactly as in `tokens.json` (ordinal, the dimmest still glows). They also colour the week row (12.1).
- Clinic states, Kevät dashboard, always icon plus label, never colour alone, never red:

| State | Dot / text | Container | On-container | Icon |
|---|---|---|---|---|
| Stable | `#3F8C4E` | `#D9F0D6` | `#123B1A` | `check` |
| Watch | `#3D6DB8` | `#DCE7FB` | `#0F2B56` | `insights` |
| Check-in | `#AD8500` | `#FFEDB8` | `#3A2C00` | `call` |
| Booster review | `#B95F28` | `#FFE2CF` | `#4A2100` | `medical_services` |
| Simulated badge | outline `#9DB9CC`, text `#4F5F7D` | none | | text "SIMULATED" |

Validated with the dataviz validator: lightness band and chroma pass; check-in versus booster review are close (normal-vision Delta E 13.8), which is acceptable only because every state ships with its icon and label and rows are also sorted by need.

## 4. Typography

Two interface families plus one voice, all OFL and bundled (files in `design/concept/aalto-light/fonts/`):

| Role | Family | Use | Never |
|---|---|---|---|
| Brand | **Jost** 300 and 400 (Futura-lineage 1930s geometry, the decade of functionalism) | Wordmark `afferent` (300, lowercase, +1% tracking), "Good morning.", headlines, the streak numeral, patient view and dashboard page titles | Body text, buttons, below 22 px |
| Interface | **Google Sans Flex**, ROND 100, 400 to 600, tabular figures for numbers | Every control, label, body line, chart label and number; the M3 type scale | Display sizes above 32 px |
| Voice | **Fraunces** 300, opsz 48 | The quote after the session only (one line, one element per session) | Anything else |

Dropped: Inter (UI moves to Google Sans Flex, which the final mockups already use), Fraunces as the general display face. JetBrains Mono stays for the dev panel and protocol lines only.

M3 scale (px, size/line height): Display L 57/64, M 45/52, S 36/44 (Jost 300); Headline L 32/40, M 28/36, S 24/32 (Jost 400); Title L 22/28, M 16/24, S 14/20 (Sans 500); Body L 17/26, M 15/22, S 13/18 (Sans 400); Label L 15/20, M 13/16, S 11/16 (Sans 600). Quote 21/31 (Fraunces 300). Body L is 17 px, one step above M3 default, because the phone is held above the face at arm's length.

## 5. Shape language

Five signature shapes, each with one meaning. Controls stay pure M3.

| Shape | Meaning | Where | Rule |
|---|---|---|---|
| **Free wave** | "the land", the curve per screen | Shorelines, the top edge of the end sheet and patient header, the streak glyph, the icon ribbon | Asymmetric: low on the left, a dip, rising to the right; about 18 to 34 px tall on a phone; once per screen |
| **Ply lines** (laminate) | "made of layers", material | Every landform edge in the world, the Opening frame, the strata, the Keeper's hem, the icon | 2 to 4 parallel offset lines; birch, ply, ply-edge; never decorative on controls |
| **Sun** (the only perfect circle) | "the one light", progress, a day | Lantern control ring, progress suns, the week row, the sun | Never used as a generic container or avatar |
| **The Opening** (arch) | "the world opens to a task" | Every minigame stage (9.3) | Rectangle with a semicircular top, radius = half the width, 7 px ply frame with an outer ply-edge line and an inner birch line |
| **Dome** | "the Keeper" | The character's hood and bell cloak | Round top, never pointed |

M3 corner scale: 8 (chips), 12, 16 (cards on dashboard), 24 (cards on phone), 28 (sheets), full (buttons, pills). Minimum touch target 48 dp; the primary hold control is 84 dp. No sharp corners, no zigzags, no drop shadows on phone UI (depth comes from value and scrim); the dashboard uses M3 elevation 1 only for the detail pane.

## 6. Illustration style

### 6.1 The rule

Flat, matte Finnish-functionalist picture-book illustration. Large plaster-like colour fields, each with at most one soft gradient. Every landform is one long smooth free curve with ply lines along its edge. Smooth skies. A small figure in a large world. One rendering language for backdrops, props, the figure, task art and key art: no gouache, no watercolour grain, no glossy 3D icons, no photoreal props, no neon line art (the five languages the teardown found are reduced to one).

### 6.2 Final STYLE prompt (the `style` field of `regen.json` and `plan_final.json`)

> Calm flat 2D illustration for a wordless Finnish mobile game, in the spirit of 1930s Finnish functionalist design: free-form wave curves and bent laminated birch plywood (inspiration only, no real buildings, furniture or products). Every landform, shoreline, snowdrift, fell and path is one long, smooth, asymmetric free-form curve drawn in a single unhurried gesture: no zigzags, no jagged edges, no hard corners. Every landform is laminated: along its curved top edge run two to four thin parallel offset lines in pale birch tones that follow the curve exactly, like the cut edge of bent birch plywood. Shapes are large, flat and matte like smooth painted plaster, each with at most one very soft smooth tonal gradient. Any sky is a perfectly smooth continuous gradient: no banding, no stripes, no scanlines, no noise, no speckle, no grain. No outlines, no brush texture, no paper grain, no 3D render look, no glossy or plastic highlights, no clay or plush look, no photorealism. Strong clear silhouettes, very few elements. Palette: deep fjord #0E1A2E, kaamos blue #1E3150, frost #9DB9CC, lilac haze #B4A6CE, birch white #F2EEE6, birch ply #E2C79C, ply edge #B48E5C, sun yellow #F2C230, honey #FFD58A, dawn apricot #F3A57A, ice #8FC6E0, spring green #9DBE8C, spruce #2F4A48, granite #8A8F9C, ceiling green #C8D6BE. Warm light is sun yellow and honey only, never orange-red, never pink, never coral, never red. Quiet, hopeful, gentle. No text, no letters, no numbers, no logos, no signature, no watermark, no faces.

Suffixes (generate.py appends one):

- **Isolated** (every transparent game asset): the ArtBible v3 suffix unchanged: local colour at middle value under soft even overcast daylight, no cast shadows, no light sources, no glow, nothing else in the image. Proven by `concept_final_keeper_sheet` and `concept_final_props_sheet`.
- **Plate** (key art and backdrops): "Full-bleed portrait illustration that fills the entire frame edge to edge, lighting painted in, a big calm empty sky, a small figure in a large world, no frame, no border, no vignette."
- `sky` and `additive` suffixes from `art/plan.json` stay.
- Every prompt that contains the figure appends the KEEPER text (section 7).

Lessons from generation (keep them in the prompt): "no grain, no speckle" fixed the noisy skies of the Lantern Myth set; "no clay or plush look" plus the isolated suffix fixed the Aalto props; naming the hood "perfectly round on top (no point, no tip, no ears, no pompom, no fur trim)" kept the Keeper off gnome and witch hats; "turned away, so no face is ever visible" kept faces out.

### 6.3 Lamination drawn in code (world.js)

The generator supplies ply lines on images, but the procedural world must show them too, so the fallback matches:

- After filling any landform path (`mountains()`, `islands()`, `midHills()`, `ground()` top edge, snow mounds), stroke 3 copies of its top edge translated down by `2.5u`, `5u`, `7.5u` (`u = H/844`): `birch` at alpha 0.55, `ply` at 0.45, `ply-edge` at 0.35, line width `1u` (ground `1.5u`), clipped to the landform. Vertical translation is enough for these gentle curves; true offset curves are used only for the streak glyph, the strata and the icon.
- The lines belong to the yellow colour group: at s0 they are graded to kaamos, and they are the first thing the yellow wave warms (lookdev 7.4 "warmth returns").
- Aurora: draw the curtain as 18 to 30 thin vertical lines that share one wave displacement (bent veneer), not a soft blob.
- Steam (löyly, sauna chimney): 3 to 5 parallel curved lines in `ceiling` and `birch`, drifting, never puffs.
- Hoarfrost (mechanics S2, eyes closed): nested parallel arcs in `birch` growing from the corners, 1.2 px, glint at most 0.2 Hz.

### 6.4 Composition

Portrait. Horizon at 55 to 62%. At least 40% open sky. The Keeper on the left third, facing right, 1/8 to 1/5 of the frame height in play (lookdev 5.1 scale stays). The goal (the day-mark tower, then the sun) on the right horizon. No text in art, ever.

## 7. The Keeper (character)

**KEEPER text (append verbatim):** "The Keeper, the only character: a small, round, child-sized figure about half as wide as it is tall, in a felted wool cloak the colour of birch plywood #E2C79C with a soft kaamos-blue #1E3150 shadow side; a smooth dome-shaped hood that is perfectly round on top (no point, no tip, no ears, no pompom, no fur trim) flowing straight into a cloak that flares gently into a bell shape down to the ground; a hem band of two thin darker ply lines #B48E5C near the bottom of the cloak; no scarf, no staff, no pole. Seen exactly from the side facing right with the hood opening turned away, so no face is ever visible. One small mitten holds a small round lantern on a short handle at hip height, lantern glass dark and unlit."

Why this figure:

- **Not Journey:** no red, no pointed cone, no scarf. Not Lantern Myth's reaper or wizard: no staff, no adult robe, no void hood. Not a ghost: never white with a dark opening.
- **Warm undyed wool:** in kaamos it greys to a mid blue, and it is the first thing the yellow wave warms, so the player sees their own figure come back to colour.
- **The hem band is the Keeper's laminate:** fork choices (coreloop 6.4, previously "scarf bands") add one thin line to the hem in the chosen side's colour, so the figure carries the session's layers.
- **Silhouette test:** reads as a 32 px black shape (dome plus bell) and as a 32 px ply shape on kaamos blue.

Rig changes (figure.js): delete the scarf Verlet chain (lookdev 5.5) and use its budget for the hem spring and hem band; the lantern hangs from the hand at hip height (pendulum length 5 units, not 8); add `figure_ride` and `figure_crouch` poses for the Ride (coreloop 3). The procedural rig remains the animated figure in play (lookdev 5.9); its shapes are the dome and bell above.

## 8. Iconography

- **Material Symbols Rounded**, weight 300, optical size 24, grade -25 on dark and 0 on light, outline by default, `FILL 1` only when selected. Subset already bundled in `design/mockups/final/fonts/`.
- **Mode glyphs** (3.5) are used in the dashboard legend, the dev panel and settings; never in play.
- **Custom glyphs** on the same 24 px grid, 1.5 px stroke, round caps: the laminate (three offset waves, top one sun when it marks today), the lantern flame (inside the kindle ring), the sun-on-horizon (hold to give), the arch (the Opening, settings entry for task style). Drawn in SVG, coloured with role tokens.
- **Talk to someone** is the Material `support` glyph in a 44 px tonal circle at top right on every non-question screen (`questions.md` rule 5), quiet but always there.
- No flame icon for the streak (engagement 6.2), no badges, no red dots.

## 9. UI theme

### 9.1 How it sits on Material 3

Material 3 is the structure: roles, type scale, shape scale, components (filled, tonal and text buttons, chips, cards, lists, navigation bar and rail, sheets, switches), state layers and motion tokens. Layers of Light changes only five things on top:

1. The colour roles (3.3), generated from the concept seeds, error remapped to apricot.
2. Two type faces with fixed jobs (4).
3. One free-wave edge per screen, on a sheet or header, never on a control (5).
4. The Opening frame for tasks (9.3).
5. The scheme follows the sky: Kaamos in the dark, Kevät once the sun is up (3.3).

**Relation to `design/gui.md`:** that file does not exist yet. The current GUI direction lives in `design/mockups/final/` (M3, Google Sans Flex, sky-seeded schemes, generated `design/gui-tokens.json`). This concept keeps that direction (it is the "material-you-sky" line) and re-seeds it. When `gui.md` is written it should reference this file for colour, type, shape and motion, and own only screen inventory, flows and component behaviour. Section 15.5 lists the exact changes to the final mockups and the token generator.

### 9.2 Screens (style frames)

| Frame | Scheme | Layout rules |
|---|---|---|
| 01 Start | Kaamos | The live world is the menu (lookdev 10). Streak chip on the bay in the eye zone (12.1). Hold to kindle: an 84 dp ring in the lower third, sun ring fills while held; "Not today" as a frost text button below. Talk to someone top right. Dev chips never in production frames |
| 02 Ride | Kaamos | Zero chrome. A dashed ghost-finger ring only when the coreloop hint fires. Hoarfrost lines from a corner when the eyes close |
| 03 to 05 Tasks | Kaamos | The Opening (9.3), three progress suns above or below it, a dashed gesture glyph as the only hint, no words |
| 06 Dawn | Kaamos | The hold-to-give ring (sun-on-horizon glyph) in the thumb zone; nothing else |
| 07 End | Kevät | Wave-edged birch-paper sheet over the lower 47%, never over the sun. "Good morning." Jost 300 40/48, the quote, the week row and "13 mornings", Done as a filled primary pill. Mood check-in stays on its own screen (`questions.md` rule 1) |
| 08 Patient view | Kevät | Header crop of the world with a wave bottom edge, "Your mornings", "N mornings lit since <date>", This week card, Your layers card (12.3), What helped list, M3 navigation bar (Today, Week, Settings) |
| 09 Icon | - | Section 11 |
| 10 Clinician dashboard | Kevät | Navigation rail, top app bar with wordmark and SIMULATED badge, patient table sorted by need (state chip, 14-day sparkline on a baseline band, top contributor as plain text, last session), detail pane with one series against the personal baseline band, a dashed threshold in the state colour, "What moved" bars, "Consider a check-in call. The clinician decides." |

The dashboard moves from the dark night scheme to Kevät light by default: clinicians work in daylight offices, and Google-like clarity reads better light. Dark stays available as a setting (Kaamos scheme, same roles).

### 9.3 The Opening (tasks)

Replaces the dark-glass task panel (`DesignSystem.md` 6, `rgba(10,12,17,0.86)`, radius 22).

- Shape: an arch, width 330 to 342 px on a 390 px screen (16 to 30 px side margin), height 390 to 620 px, top radius half the width. Ground tasks sit low (bottom at 790 to 800 px, inside the thumb arc); sky tasks (Joutsen, breath in the sky) sit high (top at 60 to 70 px, bottom closed with the same frame).
- Frame: 7 px `ply`, an outer 1.5 px `ply-edge` line 5 px out, an inner 1.2 px `birch` line 5 px in (three laminations).
- Outside the arch the live world stays visible under a scrim `#0A1322`: 0.50 for play tasks, 0.62 for measurement tasks (Bite, Fork, Lanterns), so measurement keeps a calm, constant field.
- Inside: the task's own stage. Stations that "open from" a prop (coreloop 6.4: the sauna door, the loom frame, the cairn) grow the arch from that prop; all others grow from the lantern.
- Envelope (lookdev 7.2 and 7.3 unchanged in timing): the mote leaves the lantern (600 ms), the arch grows from the mote point, scale 0.86 to 1 (420 ms, M3 emphasized decelerate), and at the end folds back into a mote that arcs home (380 plus 650 ms).
- Progress: three sun dots (10 px; done = filled sun with a 10 px glow; to do = 1.5 px ply ring).
- World tasks that need no stage (breath, rest drift) keep no frame at all.

## 10. Motion

Three signatures, all on one breath pacer (4 s in, 6 s out, 6 per minute; never the live pulse):

| Signature | What | Timing |
|---|---|---|
| **Bend** | Things travel on curves, never straight lines: the mote, the Opening's grow and fold, a new layer pressing into the streak glyph with a 2 px settle (Raita's registration snap, softened) | Spring damping 0.82, stiffness 260; settle 140 ms |
| **Breathe** | Lantern, aurora, fog, the Keeper's cloak and the hold rings follow the pacer | `cubic-bezier(0.45, 0, 0.55, 1)`, 4000 / 6000 ms |
| **Sweep** | Colour returns as light travelling outward from the lantern (lookdev 7.4); dawn ignites outward from the sun; sky bands re-ink top to bottom, 90 ms stagger, 600 ms each | Wave 2.4 s (calm 3.5, wake 1.8); dawn 8 s |

UI motion is M3: emphasized decelerate `cubic-bezier(0.05, 0.7, 0.1, 1)` 450 ms for entering, emphasized accelerate `cubic-bezier(0.3, 0, 0.8, 0.15)` 250 ms for leaving, standard `cubic-bezier(0.2, 0, 0, 1)` 300 ms for state changes. Things enter from below, nothing bounces in calm or rest, the streak numeral changes once (no count-up). Scheme handover: Kaamos to Kevät crossfade 2000 ms at dawn + 6 s; the end sheet rises 450 ms at dawn + 8.6 s at the earliest (lookdev 8.3).

**Bedside light (the lantern in the room).** Warm only, never blue, never a flash:

| Moment | Colour and level |
|---|---|
| Wake ramp before the alarm (30 min, SHOULD, needs the hub schedule) | `#FFB54A` 2%, `#FFC266` 15%, `#FFD58A` 40%, `#FFF0D2` 70% at the alarm |
| Kindle (session start) | `#FFB54A` at the knob level, 600 ms rise |
| Each finished task (Raita graft) | one step warmer and +5 points, 1200 ms, capped at 40% before dawn |
| Dawn (morning) | `#FFF0D2` 70% over the 8 s dawn, hold 30 s (replaces `#FFF3DC` 60%) |
| Night end | unchanged: `#FFC98A` at the knob level, cap 25 |

Reduced motion: crossfades instead of paths and springs, parallax x0.5, particles under 0.2 screen per second, no settle, the Opening fades in at full size. Flash guard: nothing above 3 Hz, any large brightening rises over at least 300 ms (minigames 2.5).

## 11. Logo and app icon

- **Mark:** a half-risen sun cradled by one bent birch ribbon with three ply lines. It joins the morning, the material and the free curve in one figure-free shape. Master: `design/concept/final/concept_final_mark.svg` (monochrome, `currentColor`), used for themed and tinted icons, favicon, notification icon, the dashboard rail and the engraving on the bedside unit.
- **App icon:** `design/concept/final/concept_final_icon.svg` (1024, vector master): kaamos field `#253C63` to `#14243F`, a soft `#2B4570` halo, the sun `#F2C230` at 46% of the width, a birch-white `#F2EEE6` ribbon with three `#9DB9CC` ply lines. Checked at 360, 200, 60, 40 and 29 px (frame 09). The generated painted variant (`art/raw/concept/concept_final_icon.png`) is rejected: its sun drifts to orange and the ribbon is too thin.
- **Wordmark:** `afferent`, lowercase Jost 300, +1% tracking, set in code; lockup with the mark at 1:1 cap height, mark left. Never "Afferent" in a serif, never with the heritage names.
- The lighthouse is no longer the icon. In the world it becomes a plain day-mark tower (no bands), and its lamp stays the horizon goal (lookdev 4.5).

## 12. The streak and the quote

The rules are `engagement.md` section 6 (D1 to D4); this section only gives them a look.

### 12.1 Start screen streak chip (from a streak of 2, 06:00 to 21:00)

- A pill on the bay in the eye zone: 8 px vertical padding, kaamos at 42% with a blur, the laminate glyph (three offset waves, top one sun), the numeral in Jost 300 28 px birch, "mornings" in Sans 500 13 px. No flame, no 0 or 1, no freeze count, never "in a row".
- Position change from engagement 6.2 ("under the lantern"): the chip sits above the figure at about 27% from the top, because on the lying body the eye rests there and the thumb zone stays free for Hold to kindle. Size and quietness are unchanged.

### 12.2 End screen (morning)

- On the Kevät sheet, below the quote: the week row (7 day lights, 16 px) and "13 mornings" (numeral Jost 400 26 px). The numeral ticks once, 600 ms after the sheet settles. Today's light is a filled sun with a 3 px `sun-container` ring.
- Day light states, shape not hue (engagement 6.3, R15): lit = filled in that day's mood colour (no answer: `light-glow`); missed = the same circle unlit, a 1.5 px outline (never an X, never a gap); frozen = unlit with a frost rim; today, not yet = a sun ring with an ember dot; paused = the circle set 5 px lower and smaller (set down).

### 12.3 Patient view: Your layers

- The long-term keepsake: a strata card where every morning lit is one thin bent ply line in a single wave stack (true offset curves), newest on top in sun, older lines in ply with every fifth in ply-edge. It only grows; missed days add nothing and remove nothing; no dates, no gaps. With "Mornings lit" (lifetime) above it, it replaces any chart-like history.
- The far-shore lights (lookdev 9) stay the in-world picture of the same count.

### 12.4 Kept light in the world (NICE after the demo)

The dawn sun crests 0.4% of H higher for every morning lit (cap +12%), the way the first sun returns after kaamos. Never lower after a missed day.

### 12.5 The quote

- After dawn, on the Kevät sheet, under "Good morning.": Fraunces 300 21/31, `#3A3226`, one or two lines, left aligned, max 32 characters per line on a phone. A small source line in Sans 500 12 px ("Morning note", or the attribution the clinic team approves).
- Fades in 600 ms at dawn + 8.6 s with the sheet, never over the sun, never animated per word.
- Pool and rules are `engagement.md` 5.5 (curated, same line for everyone on a date, never chosen by mood, pending clinical review). No quote at night: "Rest well." in Jost 300 on Kaamos dark-room.

## 13. Store and pitch visuals

- **Store screenshots (5 portrait, no UI, one composition):** the same bay from kaamos to kevät (start, Ride at first light, blue hour with Joutsen, first green, dawn), so the page performs the colour return; captions set in code in Jost 300 on the sky, claims-safe: "Two minutes in bed." / "One finger. No words." / "Your world answers your body." / "Keep the light." / "Your lamp brings the morning." Plates: `concept_final_start`, `ride`, `joutsen`, `dawn`, `end`; regenerate a matched set from one prompt with only the stage changing when the store page is built.
- **Header and feature graphic:** a landscape version of `concept_final_end` with the Keeper under 5% of the frame and the sun as the focal light; the wordmark set in code.
- **App preview video (15 s):** Ember, Way, Rites, Handover, Shore (Lantern Myth beats): kindle, ride, Bite in the Opening, dawn, and a cut to the real bedside lamp reaching daylight in a dark room.
- **Pitch deck:** the deck performs the colour return: slide 1 in kaamos blue with one sun-yellow word, one colour group added per section, the last slide at dawn with the physical lamp lit on stage. Story slide: "Designed for the person lying down" with Paimio as the precedent (pitch only).
- **Board for the jury:** `design/concept/final/board.png`.

## 14. Final style frames

| # | File | Plate |
|---|---|---|
| 01 | `concept_final_01_start.png` | `concept_final_start` |
| 02 | `concept_final_02_ride.png` | `concept_final_ride` |
| 03 | `concept_final_03_task_bite.png` | `concept_final_bite` |
| 04 | `concept_final_04_task_joutsen.png` | `concept_final_joutsen` |
| 05 | `concept_final_05_task_loyly.png` | `concept_final_loyly` inside the arch, `concept_final_start` outside |
| 06 | `concept_final_06_dawn.png` | `concept_final_dawn` |
| 07 | `concept_final_07_end_quote.png` | `concept_final_end` |
| 08 | `concept_final_08_patient.png` | `concept_final_patient` |
| 09 | `concept_final_09_app_icon.png` | vector icon and mark |
| 10 | `concept_final_10_clinic_dashboard.png` | none (UI only, simulated data) |

UI type and controls in every frame are set in HTML, not baked into art. Spend for this role: 11 images (10 at high 1024x1536 or 1536x1024, 1 at high 1024x1024), 4.80 USD; ledger total after these calls 47.20 USD; no quota, billing or auth errors.

Known imperfections, acceptable for key art, to watch in production: the Keeper renders slightly soft-3D at close range (Bite); the Ride plate shows the colour boundary less clearly than the code wave will; the lilac band in dawn plates is strong and should be held at the `lilac` token, never pinker.

## 15. Reconciliation: what stays, what changes, and exactly how

Owner notes: `tokens.json` and `tokens.css` change together (contract owner, `DesignSystem.md` header). `gui-tokens.*` are generated, never hand-edited. Image changes go through `regen.json`.

### 15.1 `ArtBible.md`

Stays: portrait orientation and the 40/60 world/sky split; colour return by code filter, order yellow, blue, green, dawn; "a miss never lowers saturation"; parallax table (section 3); the isolated suffix and "never paint light sources" (v3 rule); asset names; stays-procedural list.

Changes:

1. Section 1 Style: replace "Flat layered silhouettes, soft watercolour texture, subtle paper grain" with "Flat matte plaster shapes, one free curve per landform with 2 to 4 ply lines along its edge, perfectly smooth skies, no grain" and add "Layers of Light, design/concept.md" as the source. Replace "A small Finnish island in polar night: harbour, birch forest, frozen lake, sauna hut, lighthouse" with "... sauna hut, a plain day-mark tower".
2. Section 1 figure paragraph: replace with the KEEPER text (section 7) and "lantern held in the hand at hip height".
3. Section 2 table: rename "Night grey (start)" to "Kaamos (start)" with sky `#0E1A2E` / `#1E3150`, land `#5A6E93`, accent `light-flame #FFE3A6`, base saturation 0.12; dawn row sun `#FFD58A`, horizon `#F3A57A`. Remove `#F49D6E` from the dawn accents.
4. Section 4 border: colour `light-glow #FFD58A`, dawn `#FFF0D2`.
5. Section 5: replace the quoted style line with section 6.2's STYLE; keep the isolated suffix; replace the backdrop suffix with the Plate suffix. Delete "coral #F49D6E" and "violet #5B4B8A" from any palette list.
6. Section 6 table: replace every prompt with `regen.json` (or point to it). Delete `boathouse` coral, `pier_boat` coral stripe, `lighthouse` coral band, `figure_*` violet cloak and coral scarf. Add `figure_ride`, `figure_crouch`.
7. Principles line: add "Paimio (designing for the person lying down)"; keep "no character, palette or composition recognisable as any of these games"; add Old Man's Journey to the list of games not to resemble (lighthouse on harbour rocks).

### 15.2 `design/tokens.json` (and `tokens.css` together)

Add:

```
color.pigment: { fjord #0E1A2E, kaamos #1E3150, frost #9DB9CC, lilac #B4A6CE, birch #F2EEE6, ply #E2C79C, ply_edge #B48E5C,
                 sun #F2C230, honey #FFD58A, apricot #F3A57A, ice #8FC6E0, spring #9DBE8C, spruce #2F4A48, ceiling #C8D6BE, granite #8A8F9C }
color.light:   { ember #FFB54A, flame #FFE3A6, glow #FFD58A, aurora_hem #5FE3A1, aurora_tip #8FC6E0, sun_disc #FFD58A, sun_limb #FFE3A6, daylight #FFF0D2 }
color.world_stages: kaamos (rename night_grey) { sky_top #0E1A2E, sky_bottom #1E3150, land #5A6E93, accent #FFE3A6, saturation 0.12 },
                    warm_yellow { sky_top #1E3150, sky_bottom #3E4D72, land #F2EEE6, accent #F2C230 },
                    blue { sky_top #22375A, sky_bottom #B4A6CE, land #8FC6E0, accent #8FC6E0 },
                    green { sky_top #1B2F52, sky_bottom #8E9FC8, land #2F4A48, accent #5FE3A1 },
                    dawn { sky_top #6E8FC4, sky_bottom #F3A57A, land #F2EEE6, accent #FFD58A }
color.mode:   calm #C8D6BE, flow #9DB9CC, wake #8FC6E0, fatigue #FFF0D2, rest #6E6590, measure #B4A6CE  (+ mode_glyph: spa, animation, light_mode, wb_twilight, bedtime, touch_app)
color.state:  stable #3F8C4E, watch #3D6DB8, check_in #AD8500, booster #B95F28 (+ _container and on_ values from 3.7)
font.brand "Jost", font.ui "Google Sans Flex" (ROND 100), font.voice "Fraunces"; files from design/concept/aalto-light/fonts/ copied to design/fonts/
shape: { opening_frame_px 7, wave_edge_px 18-34, radius sm 8, md 12, card 24, sheet 28, pill 999 }
motion: emphasized_decelerate cubic-bezier(0.05,0.7,0.1,1) 450, emphasized_accelerate cubic-bezier(0.3,0,0.8,0.15) 250, standard cubic-bezier(0.2,0,0,1) 300,
        bend_spring {damping 0.82, stiffness 260}, settle_ms 140, scheme_handover_ms 2000, band_reink {stagger 90, each 600}
```

Change: `lantern.amber` to `#F2B544` stays (halo); `lantern.flame` to `#FFE3A6`; `lantern.glow` to `#FFD58A`; `bedside.mode.wake` to `#FFE3A6` 20; `bedside.mode.calm` `#FFC266` 8; `bedside.mode.flow` `#FFD58A` 8; `bedside.mode.fatigue` `#FFF0D2` 40; `bedside.dawn_morning` to `#FFF0D2` level 70 fade 8000; add `bedside.task_step {level +5, warmer one step, cap 40, fade_ms 1200}` and `bedside.wake_ramp` (10); `day_schedule` morning `#FFF0D2` 30; `patient.*` and `clinic.*` replaced by the Kevät roles (3.3) with a `clinic_dark` copy of Kaamos.

Deprecate (keep the keys for one build so old code does not break, then delete): `dawn.coral`, `dawn.coral_soft`, `violet.*`, `silver.*` (map: silver-300 to frost, silver-100 to birch), `aurora.teal*`, `night.*` (map: night-950/900/850 to fjord, night-600/500 to kaamos).

`mood.*`, `space.*`, `layer.*`, `breath_*`, `lantern_pulse_ms`: unchanged.

### 15.3 `DesignSystem.md`

1. Section 1 Feeling: replace the first paragraph with section 1's story line and add "Designed for the person lying down" with the six principles of section 2 as the rules; rule 3 already matches engagement D1, keep it and add "styled as in concept 12".
2. Section 2 Colour: replace the table with 3.1 and 3.2; the clinic-states and mode lines with 3.5 and 3.7; delete "dawn coral as strongest colour".
3. Section 3 Type: Jost, Google Sans Flex, Fraunces as in section 4; drop Inter.
4. Section 4: radius scale from section 5; remove the game task panel radius 22.
5. Section 6 Components: "Game: task panel rgba(10,12,17,0.86)..." becomes "Game: the Opening (concept 9.3)". Dashboard: Kevät light by default, chart line `#1F467E`, baseline band `#E9E1D6`, threshold dashed in the state colour.
6. Section 7 Bedside: from section 10.

### 15.4 `design/lookdev.md`

Stays: everything about the render pipeline, light buffer, bloom, flicker and flash rules, camera, timings of the three signature moments, daily continuity (village), reduced motion and performance.

Changes:

1. 1 Vision line 1: "falls to clean blue-violet dark" becomes "falls to kaamos blue (cyanotype)".
2. 3.2.1 s0: `mulTop` mix(white, frost, 0.45), `mulBot` mix(white, `#3E5478`, 0.35), `slTop` kaamos 0.18, `slBot` fjord 0.18, `liftC` fjord. `satOf('base')` minimum stays 0.12. Replace every `silver-300` with `frost`, `night-500/600` with `kaamos`, `night-800/950` with `fjord`, `violet-500/600/800` in the night end with `#6E6590` (rest), `lantern-warm` with `light-glow`.
3. 3.2.3 Dawn: `slTop` honey 0.25, `mulBot` mix(white, apricot, 0.20) (replaces coral-soft rose shadows), `vigC` `#6E6590`. Delete the sentence about `dawn-coral-soft`.
4. 4.1: sun disc `light-sun #FFD58A` at alpha at most 0.85; ridge rim honey.
5. 4.2 Aurora: draw as veneer lines (6.3).
6. 4.5 Lighthouse ladder: unchanged mechanics; the drawn tower is the day-mark tower (no bands).
7. New 4.9 Lamination: section 6.3 of this file (MUST; about 20 lines in world.js).
8. 5 Figure: role model line becomes "Monument Valley's Ida (one readable shape), Journey only for cloth motion". 5.5 Scarf: delete; Hem becomes MUST with the hem band (section 7). 5.3 pendulum `L = 5`. 5.9: `figure_sit` is the Keeper sprite.
9. 7.2 and 7.3: "panel" becomes "the Opening" (9.3); envelope and timing unchanged.
10. 8.3 Dawn: add the scheme handover at dawn + 6 s and the bedside `#FFF0D2` 70%.
11. 10 Start: streak chip position as in 12.1.

### 15.5 GUI: `design/gui.md` (absent), `design/mockups/final/`, `design/gui-tokens.*`

`gui.md` does not exist; nothing to edit. When written, it references this file (9.1).

1. `design/mockups/final/tools/seeds.json`: `lantern` to `#F2C230` (rename key `sun`), `aurora` to `#9DBE8C` (rename `spring`), add `ply #E2C79C` and `apricot #F3A57A`; skies: night hue from the new rendered kaamos sky (expected about 255 to 262, re-quantize after the lamination and grade changes land), dawn from the rendered dawn; `clinic` seed to `#1E3150`; states to section 3.7.
2. `gen-gui-tokens.mjs`: pin `primary` to `#F2C230` in dark schemes; light schemes (`day`, `clinic`) take primary from the kaamos hue at chroma 40 tone 30 and secondary from the ply hue; error palette hue 55 (unchanged, already apricot-like); add the four `sun` fixed roles; clinic becomes a light scheme (`dark: false`) with a `clinic-dark` sibling; keep `darkRoom`. Rerun; never hand-edit `gui-tokens.json`.
3. `css/fonts.css`: add Jost and Fraunces faces; `css/m3.css`: display and headline roles to Jost, the `.quote` class to Fraunces 300 opsz 48.
4. `start.html`: the streak chip (12.1), the 84 dp kindle ring; `end.html` and `done.html`: the Kevät wave-edged sheet, quote, week row; remove the dark-glass task panel styles; add the Opening as an SVG component (`opening.js`: arch path, three frame strokes, scrim mask).
5. Settings and question screens keep their M3 layout; they only receive the new roles and fonts.

### 15.6 `design/engagement.md`

One wording change for whoever owns it: 6.2 "One small number under the lantern" becomes "One small chip (laminate glyph, numeral, 'mornings') above the figure in the eye zone (concept 12.1)". All rules stay.

### 15.7 The image set (`art/raw`, `art/plan.json`, `art/tasks_plan.json`)

- `design/concept/final/regen.json` is a valid plan for `art/generate.py` with the final STYLE, the isolated, plate, sky and additive suffixes, and 29 assets to regenerate or add from `art/plan.json` (all far, mid, ground, foreground layers, sauna, tower, pier, boathouse, lantern post, three Keeper poses plus `figure_ride` and `figure_crouch`, glow stone, `bg_end_night`, aurora, dawn clouds, both fog bands). Run drafts with `--draft --only`, finals with `--force --only`; acceptance checks are in the file.
- No generation: `bg_start`, `bg_end_dawn`, `bg_patient` are promoted from the final plates (copy); `app_icon` is rasterised from `concept_final_icon.svg`.
- Keep nothing from the v3 set as is: every v3 asset is gouache with grain and would break the one-rendering rule. Until replacements land, the procedural fallback (now with lamination) is closer to the concept than the v3 images, so the build may switch v3 images off rather than mix languages.
- Task art (owned by the minigame workflow, listed in `regen.json` `task_assets`): 31 to regenerate in the flat style, 21 to replace with code light or code lines (glows, sunbursts, stars, swan lines, rings, steam puffs, panel fog), 2 to drop (lotus petals). `task_beacon_lighthouse` is replaced by the world tower: one tower design.
- Concept images from the other boards (`concept_aalto_*`, `concept_lm_*`, `concept_ng_*`, `concept_birch_*`, `concept_icon_*`, `concept_keeper_bell`, `concept_figure_silhouettes`, `concept_keyvisual_panorama`) are references only and never ship.

## 16. Open decisions (need David)

1. **Keeper:** adopt the birch-ply wool Keeper (no scarf) and delete the scarf rig? Recommended yes; the fork result moves to the hem band.
2. **Lighthouse:** keep a plain day-mark tower (recommended) or replace the horizon goal with a cairn on the fell?
3. **Dashboard light by default** (Kevät) with dark as a setting? Recommended yes.
4. **Bedside levels:** dawn `#FFF0D2` 70% and the per-task steps conflict with the older 60% and night caps documented elsewhere (mechanics review item 9); the bedside owner should confirm the hardware can reach 70% without glare from the lying position.
5. **Switch off v3 images** until the regenerated set lands, so the demo never mixes rendering languages? Recommended yes.
