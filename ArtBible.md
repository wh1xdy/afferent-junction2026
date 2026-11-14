# Art bible (v4, Layers of Light)

Source: `design/concept.md` ("Layers of Light"), the master design concept; where this file and the concept disagree on look and feel, the concept wins. The world is built live from biome chunks chosen by the director (sauna, birch forest, frozen lake, bright shore, harbour), and tasks open in the Opening (an arch, concept 9.3). Every layer and prop is drawn procedurally in `demo/js/world.js` and `demo/js/minigames.js`; a generated image may replace a layer, but the procedural version always stays as the fallback, so the game runs with any subset of images. Generation status: the v3 set (gouache) is superseded by the flat set in `design/concept/final/regen.json`. The whole image set swaps in one change once the new set passes review; v3 and flat images are never mixed on screen (Decisions L6).

## 1. Style

Minimal 2D side view. Flat matte plaster shapes, one free curve per landform with 2 to 4 ply lines along its edge, perfectly smooth skies, no grain, no outlines, no text, no faces (source: Layers of Light, `design/concept.md` section 6). A small Finnish island in kaamos, the blue polar night: harbour, birch forest, frozen lake, sauna hut, a plain day-mark tower. The mood is calm and hopeful, never bleak. Generous negative space, especially in the sky.

Principles taken (no designs copied): colour as the reward (Gris), the goal always visible on the horizon (Journey), layered silhouettes where the sky carries the mood (Alto's Odyssey), soft responsive nature (Flower), Paimio (designing for the person lying down). No character, shape language, palette or composition is to be recognisable as any of these games, nor as Old Man's Journey (no lighthouse on harbour rocks).

**Orientation: portrait.** The bottom 40% of the screen is world (ground, path, figure). The top 60% is sky, where the colour drama happens. The figure stays at x = 35% of the screen width and the world scrolls left. The day-mark tower sits at the right edge of the horizon from second 3 and only grows.

**The figure (the Keeper):** "The Keeper, the only character: a small, round, child-sized figure about half as wide as it is tall, in a felted wool cloak the colour of birch plywood #E2C79C with a soft kaamos-blue #1E3150 shadow side; a smooth dome-shaped hood that is perfectly round on top (no point, no tip, no ears, no pompom, no fur trim) flowing straight into a cloak that flares gently into a bell shape down to the ground; a hem band of two thin darker ply lines #B48E5C near the bottom of the cloak; no scarf, no staff, no pole. Seen exactly from the side facing right with the hood opening turned away, so no face is ever visible. One small mitten holds a small round lantern on a short handle at hip height, lantern glass dark and unlit." The lantern is held in the hand at hip height. Fork choices add one thin line to the hem band in the chosen side's colour (Decisions L2). One pose plus a code-driven walk bob (2 px, 0.5 s period), a sitting pose for the sauna and start screen, and `figure_ride` and `figure_crouch` for the Ride.

## 2. Colour return system

Every asset is generated **in full colour**. The game removes colour, not the artist. One PixiJS filter on every layer with three uniforms: `saturation` (0 to 1), `tint` (multiply colour), `exposure`. Each finished task animates one colour group over its bloom time (1.5 s after a finished task, 5 s after a timeout). There are no extra assets per state.

The sky is a code-drawn 4-stop vertical gradient, tweened per state, so it can also move continuously with the vitals layer.

| State | Sky top / bottom | Land | Accents | Layers raised |
|---|---|---|---|---|
| Kaamos (start) | `#0E1A2E` / `#1E3150` | snow `#5A6E93` in shadow | `light-flame #FFE3A6` (lantern only) | all at base saturation 0.12 (cyanotype: luma mapped onto fjord, kaamos, `#3E5478`, frost, birch) |
| + Warm yellow (1st task) | `#1E3150` / `#3E4D72` | birch `#F2EEE6` | `sun #F2C230`, `ply #E2C79C` | lantern, birches, wood, the Keeper's cloak, sauna window, ply lines to saturation 1 |
| + Blue (2nd task) | `#22375A` / `#B4A6CE` | ice `#8FC6E0` | `ice #8FC6E0`, lilac band at the horizon | ice, sea, fog, far fells to 0.8 |
| + Green (3rd task) | `#1B2F52` / `#8E9FC8` | spruce `#2F4A48` | aurora `#5FE3A1` to `#8FC6E0` | spruce, moss, aurora (veneer lines unfurl from the lantern x), sky to 0.6 |
| Dawn, full colour | `#6E8FC4` / `#F3A57A` | snow `#F2EEE6` | sun `#FFD58A`, horizon `#F3A57A`, lilac shadows | all saturation 1, exposure +0.4, ignites outward from the sun over 8 s; never white |

Rules:
- Each finished task blooms the next colour group in the order yellow, blue, green.
- Dawn forces saturation 1 on every layer, whatever happened before.
- A miss never lowers saturation. It only slows the bloom (5 s instead of 1.5 s).

### Mode styles (visual side)
- **calm:** warm interior pool (sauna), `ceiling` wash, fog 0.6, slow drift, 60 stars, slightly dimmer exposure, sauna window and stove glow.
- **flow:** neutral clear night, fog 0.35, 120 stars, faint tower beam.
- **wake:** crisp cold night, fog 0.15, 200 stars plus lantern sparks, tower beam at 60 to 100%, ice glow.
- **fatigue (day):** daylight lift from the horizon (`light-daylight #FFF0D2`), up to +75% (sky towards pale blue, ground brighter), strong beam, screen border at 25%, hoarfrost from the corners when the eyes close.
- **rest (night):** dim, quiet, cold lilac `#6E6590`, fog 0.7, dimmer exposure, no beam.
- Never mirror a racing heart: the lantern pulses at a fixed slow rhythm.

## 3. Parallax layers

Factor = scroll speed relative to the ground.

| Layer | Content | Factor |
|---|---|---|
| L0 | Sky gradient (code) | 0.0 |
| L0b | Day-mark tower far silhouette, grows as you approach | 0.02 |
| L1 | Stars and aurora | 0.03 |
| L2 | Far mountains and distant islands | 0.12 |
| L3 | Fog bands (two copies drifting independently) | 0.25 |
| L4 | Mid: birches, sauna hut, pier, tower near | 0.5 |
| L5 | Ground path, figure, lantern | 1.0 |
| L6 | Foreground silhouettes (reeds, rocks, branch), dark, blurred | 1.5 |

Reduce Motion halves all factors above 0.1.

## 4. Glowing screen border

- A 28 pt inner glow frame. Story-wise it is the lantern's light falling on the player, never a technical fix.
- Colour: fixed `light-glow #FFD58A`. At dawn it turns `light-daylight #FFF0D2`, the same hex sent to the bedside LED. The dawn screen stays below the brightness of the sauna reveal.
- Opacity: rests at 10%. It rises to max 50% only in the sauna (the player's eyes are closed), only when face luma is below 40/255, only if rPPG is enabled, and never in quiet night mode. ARKit does not need it for tracking.

## 5. Shared style prompt (v4)

`art/generate.py` builds every prompt as: style line + one suffix (isolated if transparent, plate for opaque key art and backdrops, or the named `sky` or `additive` suffix) + asset prompt, plus the KEEPER text (section 1) for every prompt that contains the figure. `design/concept/final/regen.json` holds the same strings and wins when present; pass it with `--plan`.

> Calm flat 2D illustration for a wordless Finnish mobile game, in the spirit of 1930s Finnish functionalist design: free-form wave curves and bent laminated birch plywood (inspiration only, no real buildings, furniture or products). Every landform, shoreline, snowdrift, fell and path is one long, smooth, asymmetric free-form curve drawn in a single unhurried gesture: no zigzags, no jagged edges, no hard corners. Every landform is laminated: along its curved top edge run two to four thin parallel offset lines in pale birch tones that follow the curve exactly, like the cut edge of bent birch plywood. Shapes are large, flat and matte like smooth painted plaster, each with at most one very soft smooth tonal gradient. Any sky is a perfectly smooth continuous gradient: no banding, no stripes, no scanlines, no noise, no speckle, no grain. No outlines, no brush texture, no paper grain, no 3D render look, no glossy or plastic highlights, no clay or plush look, no photorealism. Strong clear silhouettes, very few elements. Palette: deep fjord #0E1A2E, kaamos blue #1E3150, frost #9DB9CC, lilac haze #B4A6CE, birch white #F2EEE6, birch ply #E2C79C, ply edge #B48E5C, sun yellow #F2C230, honey #FFD58A, dawn apricot #F3A57A, ice #8FC6E0, spring green #9DBE8C, spruce #2F4A48, granite #8A8F9C, ceiling green #C8D6BE. Warm light is sun yellow and honey only, never orange-red, never pink, never coral, never red. Quiet, hopeful, gentle. No text, no letters, no numbers, no logos, no signature, no watermark, no faces.

Isolated suffix (all transparent game assets, unchanged from v3):

Isolated element on a fully transparent background, orthographic side view. Paint it in its natural local colours at middle value under soft even overcast daylight: no cast shadows, no light sources, no glow, no night or sunset tint, muted slightly desaturated colours (never neon or lime), because the game adds darkness, light and colour grading in code. Nothing else in the image beyond what is named: no sky, no backdrop, no frame, no vignette, no border, no extra buildings, islands or water.

Plate suffix (opaque key art and backdrops):

Full-bleed portrait illustration that fills the entire frame edge to edge, lighting painted in, a big calm empty sky, a small figure in a large world, no frame, no border, no vignette.

The `sky` and `additive` suffixes are in `regen.json` `suffixes`.

Rule since v3, still binding: **paint local colour at middle value under neutral overcast light, never paint light sources**. Darkness, grading and every glow (lanterns, sauna window, tower lamp, sun) come from code, so light stays the hero and the kaamos-to-colour change is large. Every transparent asset must still read in greyscale (art.js grey path). Lessons from generation, kept in the prompts: "no grain, no speckle" fixes noisy skies; "no clay or plush look" plus the isolated suffix fixes 3D props; naming the hood "perfectly round on top (no point, no tip, no ears, no pompom, no fur trim)" keeps the Keeper off gnome and witch hats; "turned away, so no face is ever visible" keeps faces out.

## 6. Asset list (v4, 29 generated plus 4 without generation)

Prompts live in `design/concept/final/regen.json` (one source, not repeated here). Model `gpt-image-1.5`, sizes 1024x1024, 1536x1024 or 1024x1536. Asset names never start with `task_` (reserved for the minigame workflow). Files land in `art/raw/<name>.png` (finals) or `art/raw/draft/<name>.png` (`--draft`).

Workflow: always pass `--only`. Drafts: `python3 art/generate.py --plan design/concept/final/regen.json --draft --jobs 6 --only <names>`. Finals: `python3 art/generate.py --plan design/concept/final/regen.json --force --jobs 6 --only <accepted names>` (`--force` because the names exist). Order: the four Keeper poses side by side first, then `ground_*` and `far_*`, then `sauna_hut`, `lighthouse`, `mid_birch_grove`, `mid_hills_spruce`, then the rest. At most one retry per asset. Spend is logged in `art/spend.json` under an exclusive fcntl lock (`art/.spend.lock`); runaway cap 250 USD.

Acceptance: the silhouette reads as a 32 px black shape; the greyscale value read holds (light tops, mid bodies, darker bases); no warm pixel except where the prompt names it and no light painted into transparent assets; visible ply lines on every landform edge; no grain, no brush texture, no 3D or plush look; the Keeper has a round dome hood, no point, no scarf, no staff, no face.

| # | Name | Size | Transp. | Prio | Group | Action | Suffix | Why |
|---|---|---|---|---|---|---|---|---|
| 1 | `far_mountains` | 1536x1024 | yes | A | blue | regenerate | isolated | Flat plaster fells with laminated crests |
| 2 | `far_islands` | 1536x1024 | yes | A | blue | regenerate | isolated | Flat skerries with ply lines; the village of lanterns sits on this band |
| 3 | `sky_dawn_clouds` | 1536x1024 | yes | A | dawn | regenerate | sky | Old undersides were coral (close to red) |
| 4 | `sky_aurora` | 1536x1024 | no | B | green | regenerate | additive | Laminated-veneer aurora, the signature sky element |
| 5 | `mid_hills_spruce` | 1536x1024 | yes | A | green | regenerate | isolated | Flat tapered spruces and a laminated crest |
| 6 | `mid_birch_grove` | 1536x1024 | yes | A | yellow | regenerate | isolated | Flat language and ply mounds |
| 7 | `birch_cluster` | 1024x1536 | yes | B | yellow | regenerate | isolated | Flat language |
| 8 | `sauna_hut` | 1024x1024 | yes | A | yellow | regenerate | isolated | Proven in `concept_final_props_sheet` |
| 9 | `lighthouse` | 1024x1536 | yes | A | yellow | regenerate | isolated | Now the plain day-mark tower, no bands (Decisions L3); name kept so world.js needs no change; also replaces `task_beacon_lighthouse` |
| 10 | `pier_boat` | 1536x1024 | yes | A | yellow | regenerate | isolated | Coral gunwale stripe removed |
| 11 | `boathouse` | 1536x1024 | yes | B | yellow | regenerate | isolated | Old walls were coral; now muted ochre ply |
| 12 | `lantern_post` | 1024x1024 | yes | B | yellow | regenerate | isolated | v3 came back render-like |
| 13 | `ground_sauna` | 1536x1024 | yes | A | yellow | regenerate | isolated | Laminated ground edge on every Ride frame |
| 14 | `ground_forest` | 1536x1024 | yes | A | green | regenerate | isolated | As above |
| 15 | `ground_lake` | 1536x1024 | yes | A | blue | regenerate | isolated | As above |
| 16 | `ground_shore` | 1536x1024 | yes | A | dawn | regenerate | isolated | As above |
| 17 | `ground_harbour` | 1536x1024 | yes | A | blue | regenerate | isolated | As above |
| 18 | `fg_reeds` | 1536x1024 | yes | A | green | regenerate | isolated | Flat language |
| 19 | `fg_rocks` | 1536x1024 | yes | B | blue | regenerate | isolated | Rounded stones, no hard corners |
| 20 | `fg_branch` | 1536x1024 | yes | B | green | regenerate | isolated | Flat language |
| 21 | `figure_walk` | 1024x1024 | yes | A | yellow | regenerate | isolated | The Keeper replaces the violet wanderer with the coral scarf and pole |
| 22 | `figure_stand` | 1024x1024 | yes | B | yellow | regenerate | isolated | Keeper |
| 23 | `figure_sit` | 1024x1024 | yes | A | yellow | regenerate | isolated | Keeper; start screen and sauna rest |
| 24 | `figure_ride` | 1024x1024 | yes | A | yellow | new | isolated | Ride release pose (cloak open) |
| 25 | `figure_crouch` | 1024x1024 | yes | A | yellow | new | isolated | Ride hold pose (press into the slope) |
| 26 | `glow_stone` | 1024x1024 | yes | B | yellow | regenerate | isolated | Pulse stone; gouache retries looked like soap or bread |
| 27 | `bg_end_night` | 1024x1536 | no | A | - | regenerate | plate | Night fallback end in the final style |
| 28 | `fog_band` | 1536x1024 | yes | B | blue | regenerate | isolated | v1 watercolour fog carries grain |
| 29 | `fog_band_b` | 1536x1024 | yes | B | blue | regenerate | isolated | As `fog_band` |

Without generation (never pass these names to `--only`):

| Name | Action | Use |
|---|---|---|
| `bg_start` | Promote `art/raw/concept/concept_final_start.png` (copy) | Fallback only before the first canvas frame (lookdev 10) |
| `bg_end_dawn` | Promote `art/raw/concept/concept_final_end.png` (copy) | End screen backdrop and colour reference for the procedural dawn grade |
| `bg_patient` | Promote `art/raw/concept/concept_final_patient.png` (copy, landscape) | Patient view header crop (250 px) with a wave bottom edge |
| `app_icon` | Rasterise `design/concept/final/concept_final_icon.svg` at 1024; themed icon from `concept_final_mark.svg` | iOS, Android, PWA |

Task art (`regen.json` `task_assets`) is owned by the minigame workflow: regenerate in the flat style, replace glows, sunbursts, stars, rings and steam puffs with code light or code lines, drop the lotus petals.

### Placement (for integration in world.js)

| Name | Layer (parallax) | Colour group | Use |
|---|---|---|---|
| `far_mountains` | L2 far (0.1) | blue | Tile across the horizon at hy; replaces ridge() far mountains. |
| `far_islands` | L2b islands (0.2) | blue | Tile just above the sea line; replaces islands(). |
| `sky_dawn_clouds` | L1 sky (0.04) | dawn | Draw only during dawn (alpha = dawn sat), upper 45% of the sky, slow drift; never under kaamos. Streaks stop short of the borders, so draw spaced copies, not a seamless tile. |
| `sky_aurora` | L1 sky (0.04) | green | Opaque on pure black: draw with globalCompositeOperation lighter at 0.35 x aurora alpha over the procedural veneer curtain. Prio B: drop and keep procedural if it does not read. |
| `mid_hills_spruce` | L3 mid hills (0.3) | green | Tile behind the ground at about gy - 0.12H. |
| `mid_birch_grove` | L4 mid (0.5) | yellow | Forest chunk, behind the figure, bottoms on gy. |
| `birch_cluster` | L4 mid (0.5) | yellow | Accent prop in sauna and shore chunks. |
| `sauna_hut` | L4 mid (0.5) | yellow | Drop-in for existing sauna_hut draw; window glow stays procedural (stove), placed over the dark window. |
| `lighthouse` (day-mark tower) | L4 mid / L0b far | yellow | Far: small at horizon right edge. Near: shore chunk. Lamp glow and beam stay procedural. |
| `pier_boat` | L4 mid (0.5) | yellow | Drop-in for existing pier_boat draw in the harbour chunk. |
| `boathouse` | L4 mid (0.5) | yellow | Harbour chunk background prop. |
| `lantern_post` | L4 mid (0.5) | yellow | Every ~600 world px along the path; procedural glow at the lantern. |
| `ground_*` | L5 ground (1.0) | by biome | Top edge on gy, stretched per chunk with 10% alpha crossfade at chunk borders (art.js feather for names starting with ground_). |
| `fg_reeds`, `fg_rocks`, `fg_branch` | L6 foreground (1.35) | green, blue, green | Bottom edge blurred 2px (reeds), bottom corners (rocks), top-left corner in forest and sauna with slow sway (branch). |
| `figure_walk`, `figure_stand` | L5 figure (1.0) | yellow | Lantern anchor at the hand at hip height (right, 55% of sprite height), not a pole tip; group yellow covers the whole cloak, so the Keeper is the first thing to warm. |
| `figure_sit` | L5 figure (1.0) | yellow | Start screen, sauna rest, night end; the lantern sits on the ground to the right. |
| `figure_ride`, `figure_crouch` | L5 figure (1.0) | yellow | Ride released and Ride held. |
| `glow_stone` | prop / app | yellow | Patient view and deck; code adds the pulse glow. |
| `bg_start`, `bg_end_dawn`, `bg_end_night`, `bg_patient` | backdrop | - | As in the table above; `bg_start` must never cover the live world. |
| `app_icon` | icon | - | Vector master, see above. |
| `fog_band`, `fog_band_b` | L3 fog (0.3), fog near (0.7) | blue | Unchanged placement. |

### Stays procedural

- **sky_gradient:** Procedural (vgrad), tweened per state; code skies keep the static dither (lookdev 3.3), no banding.
- **lamination:** Ply lines along every procedural landform top edge (lookdev 4.9, concept 6.3), so the fallback matches the images.
- **stars:** Procedural for twinkle. No image.
- **sun:** Procedural. Disc `light-sun-disc #FFD58A` at max alpha 0.85, limb `#FFE3A6`, never white; halo honey, use 'lighter' only for the small halo; cap global exposure at dawn to 1.1; clip the disc under the far_mountains layer so it rises behind the fells.
- **lantern_and_window_light:** Procedural glows at the unlit lanterns, sauna window and tower lamp in every image. Light is the hero: these are the only bright warm pixels at night.
- **tower_beam:** Procedural (SPR.beam).
- **aurora, steam, hoarfrost:** Drawn as parallel lines in code (veneer curtain, 3 to 5 curved steam lines, nested frost arcs), never puffs or blobs.
- **night_ending:** Code: night sessions end on bg_end_night with exposure <= 0.6 and no white overlay.
- **colour_return:** Assets are painted in local colour at middle value, so the kaamos grade and the bloom to colour show a large, visible change. Order yellow (birches, wood, the Keeper's cloak, ply lines), blue (ice, sea, far layers), green (spruce, moss, aurora), dawn (clouds, shore).
- **task stages and breath orb:** Owned by the minigame workflow (task_ prefix); the Opening frame is UI code (concept 9.3).
