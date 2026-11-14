# Art bible (v2)

v2 note: the world is now built live from biome chunks chosen by the director (sauna, birch forest, frozen lake, bright shore, harbour), and tasks open in a dark-glass panel. Every layer and prop is drawn procedurally in `demo/js/world.js` and `demo/js/minigames.js`; a generated image may replace a layer, but the procedural version always stays as the fallback, so the game runs with any subset of images. Generation status: v1 set (25 images, art/raw/NN_*.png) reviewed and superseded by the v3 plan below; only the two fog bands are kept.

## 1. Style

Minimal 2D side view. Flat layered silhouettes, soft watercolour texture, subtle paper grain, gentle gradients, no outlines, no text, no faces. A small Finnish island in polar night: harbour, birch forest, frozen lake, sauna hut, lighthouse. The mood is calm and hopeful, never bleak. Generous negative space, especially in the sky.

Principles taken (no designs copied): colour as the reward (Gris), the goal always visible on the horizon (Journey), layered silhouettes where the sky carries the mood (Alto's Odyssey), soft responsive nature (Flower). No character, shape language, palette or composition is to be recognisable as any of these games.

**Orientation: portrait.** The bottom 40% of the screen is world (ground, path, figure). The top 60% is sky, where the colour drama happens. The figure stays at x = 35% of the screen width and the world scrolls left. The lighthouse sits at the right edge of the horizon from second 3 and only grows.

**The figure:** small, hooded, cloak to the knees, no face (a soft shadow inside the hood), holding a lantern on a short pole. One pose plus a code-driven walk bob (2 px, 0.5 s period) and a sitting pose for the sauna.

## 2. Colour return system

Every asset is generated **in full colour**. The game removes colour, not the artist. One PixiJS filter on every layer with three uniforms: `saturation` (0 to 1), `tint` (multiply colour), `exposure`. Each finished task animates one colour group over its bloom time (1.5 s after a finished task, 5 s after a timeout). There are no extra assets per state.

The sky is a code-drawn 4-stop vertical gradient, tweened per state, so it can also move continuously with the vitals layer.

| State | Sky top / bottom | Land | Accents | Layers raised |
|---|---|---|---|---|
| Night grey (start) | `#14161B` / `#2A2E36` | `#3A3E46` | lantern `#F2E6C9` (only warm pixel) | all saturation 0.05 |
| + Warm yellow (1st task) | `#14161B` / `#2C2C30` | birch bark `#E8E1D2` | `#F2B544`, `#D98E2B` | lantern, birches, sauna window to saturation 1 |
| + Blue (2nd task) | `#10304D` / `#2A5C80` | ice `#7FC8E8` | `#3A7CA5`, `#1E4E79` | ice, fog, far mountains to 0.8 |
| + Green (3rd task) | `#0F2233` / `#1E3A44` | `#2F4A48` | aurora `#5FE3A1`, `#2FA37A` | aurora layer fades in, sky to 0.6 |
| Dawn, full colour | `#9FC3E0` / `#F7C59F` | sea `#4F86A8`, hills `#6E7F5A` | sun `#FFE8B8`, `#F49D6E` | all saturation 1, exposure +0.4, left to right sweep over 4 s |

Rules:
- Each finished task blooms the next colour group in the order yellow, blue, green.
- Dawn forces saturation 1 on every layer, whatever happened before.
- A miss never lowers saturation. It only slows the bloom (5 s instead of 1.5 s).

### Mode styles (visual side)
- **calm:** warm amber tint +15%, fog 0.6, slow drift, 60 stars, slightly dimmer exposure, sauna window and stove glow.
- **flow:** light warm tint, fog 0.35, 120 stars, faint beam.
- **wake:** no tint, fog 0.15, 200 stars plus lantern sparks, lighthouse beam at 60 to 100%, ice glow.
- **fatigue (day):** daylight blend up to +75% (sky towards pale blue, ground brighter), strong beam, screen border at 25%.
- **rest (night):** fog 0.7, dimmer exposure, no beam.
- Never mirror a racing heart: the lantern pulses at a fixed slow rhythm.

## 3. Parallax layers

Factor = scroll speed relative to the ground.

| Layer | Content | Factor |
|---|---|---|
| L0 | Sky gradient (code) | 0.0 |
| L0b | Lighthouse far silhouette, grows as you approach | 0.02 |
| L1 | Stars and aurora ribbon | 0.03 |
| L2 | Far mountains and distant islands | 0.12 |
| L3 | Fog bands (two copies drifting independently) | 0.25 |
| L4 | Mid: birches, sauna hut, pier, lighthouse near | 0.5 |
| L5 | Ground path, figure, lantern | 1.0 |
| L6 | Foreground silhouettes (reeds, rocks, branch), dark, blurred | 1.5 |

Reduce Motion halves all factors above 0.1.

## 4. Glowing screen border

- A 28 pt inner glow frame. Story-wise it is the lantern's light falling on the player, never a technical fix.
- Colour: fixed warm `#FFD9A0`. At dawn it turns warm amber `#FFC98A`, the same hex sent to the bedside LED (stage mode uses `#FFF3DC`). The dawn screen stays below the brightness of the sauna reveal.
- Opacity: rests at 10%. It rises to max 50% only in the sauna (the player's eyes are closed), only when face luma is below 40/255, only if rPPG is enabled, and never in quiet night mode. ARKit does not need it for tracking.

## 5. Shared style prompt (v3)

`art/generate.py` builds every prompt as: style line + (isolated suffix if transparent, else backdrop suffix) + asset prompt. The first quoted line below is the style; `art/plan.json` holds the same strings and wins when present.

> Hand-painted 2D side-view art for a calm, wordless mobile game set on a small Finnish archipelago island in winter. Soft gouache and watercolour texture with subtle paper grain, simple flat layered shapes with gentle internal gradients, no outlines, no hard cel shading, no glossy highlights, no 3D render look. Clear value structure that still reads in greyscale: light snow tops, mid-value bodies, darker bases. Restrained palette: night blue #1C2548, slate #28335E, violet #5B4B8A, silver #B9CAD6, snow #E8EEF5, birch bark #E8E1D2, moss #4A6B3F, spruce #16323A, ice #7FC8E8, sea #2A5C80, wood #7A5638, amber #D98E2B, coral #F49D6E, gold #FFD27A. Quiet, hopeful, uncluttered, generous negative space. No text, no letters, no numbers, no logos, no signature, no watermark, no faces.

Isolated suffix (all transparent assets):

Isolated element on a fully transparent background, orthographic side view. Paint it in its natural local colours at middle value under soft even overcast daylight: no cast shadows, no light sources, no glow, no night or sunset tint, muted slightly desaturated colours (never neon or lime), because the game adds darkness, light and colour grading in code. Nothing else in the image beyond what is named: no sky, no backdrop, no frame, no vignette, no border, no extra buildings, islands or water.

Backdrop suffix (opaque full scenes):

Full-bleed portrait painting that fills the entire frame edge to edge, lighting painted in, no frame, no border, no vignette.

Why v1 failed review: the old prefix asked for "night atmosphere" and "deep cool blues", so every layer came back night-tinted and stayed blue at dawn (colour return barely visible); the model added little island vignettes, baked suns, lit windows and lit lanterns into isolated elements; strips ended in rounded blobs instead of tiling; the figure was a chunky glossy mascot. v3 rule: **paint local colour at middle value under neutral overcast light, never paint light sources**. Darkness, grading and every glow (lanterns, sauna window, lighthouse lamp, sun) come from code, so light stays the hero and the grey-to-colour change is large. Every transparent asset must still read in greyscale (art.js grey path).

## 6. Asset list (v3, 31 entries)

Model `gpt-image-1.5`, sizes 1024x1024, 1536x1024 or 1024x1536. Asset names never start with `task_` (reserved for the minigame workflow). Files land in `art/raw/<name>.png` (finals) or `art/raw/draft/<name>.png` (`--draft`).

Workflow: `python3 art/generate.py --draft --jobs 6 --prio A` (medium drafts), review in game, then `python3 art/generate.py --jobs 6 --only <accepted>` (per-asset quality from plan.json, high for hero layers). At most one retry per asset. `--list` prints the resolved set. Spend is logged in `art/spend.json` under an exclusive fcntl lock (`art/.spend.lock`); runaway cap 250 USD.

| # | Name | Size | Transp. | Prio | Asset prompt (appended to style + suffix) |
|---|---|---|---|---|---|
| 1 | `far_mountains` | 1536x1024 | yes | A | A long low range of rounded Nordic fells far away, soft silver-blue #B9CAD6 and slate #28335E, pale snow caps, flat bottom edge, occupying only the lower third of the image. It is one long horizontal strip that runs off both the left and right image borders without ending; both ends are cut straight by the border at the same height, so copies tile side by side. |
| 2 | `far_islands` | 1536x1024 | yes | A | A chain of low granite skerries and small islands on a flat sea line, each with a few slim spruce silhouettes, slate and spruce colours with pale snow, lower third of the image. It is one long horizontal strip that runs off both the left and right image borders without ending; both ends are cut straight by the border at the same height, so copies tile side by side. |
| 3 | `sky_dawn_clouds` | 1536x1024 | yes | A | Long thin horizontal stratus cloud bands, painted as if lit warmly from below by a sun just under the horizon: undersides gold #FFD27A and coral #F49D6E, upper edges soft lilac #9C8AD6, the rest transparent. Wispy feathered ends. It is one long horizontal strip that runs off both the left and right image borders without ending; both ends are cut straight by the border at the same height, so copies tile side by side. |
| 4 | `sky_aurora` | 1536x1024 | yes | B | Soft vertical curtains of northern lights in a gentle S curve, green #5FE3A1 at the base fading up to teal #4FC3D9 and faint violet #9C8AD6 tips, fine vertical rays, translucent, the rest transparent, upper half of the image. |
| 5 | `mid_hills_spruce` | 1536x1024 | yes | A | Gently rolling snowy hills covered with a dense band of dark spruce silhouettes #16323A of varied heights, snow #E8EEF5 between the trees, lower half of the image. It is one long horizontal strip that runs off both the left and right image borders without ending; both ends are cut straight by the border at the same height, so copies tile side by side. |
| 6 | `mid_birch_grove` | 1536x1024 | yes | A | A loose row of seven slender Finnish birches of different heights, white bark #E8E1D2 with dark horizontal marks, fine bare branches with a few last golden leaves, trunks reaching the bottom edge, full image height. |
| 7 | `birch_cluster` | 1024x1536 | yes | B | A cluster of three birches, one leaning, white bark #E8E1D2 with dark marks, fine bare branches, a small mound of snow at the base, full image height. |
| 8 | `sauna_hut` | 1024x1024 | yes | A | A small traditional Finnish log sauna hut, warm brown logs #7A5638, thick snow on the roof, short stone chimney, one small square window that is dark and unlit, a tiny porch with a bench and a stack of firewood, standing on a little snow mound. |
| 9 | `lighthouse` | 1024x1536 | yes | A | A slender white Nordic lighthouse with one coral-red band #F49D6E, a black lantern room whose glass is dark and unlit, a small iron balcony, standing on a pile of rounded pink-grey granite rocks with snow, full image height. |
| 10 | `pier_boat` | 1536x1024 | yes | A | A short weathered wooden pier on round posts with a small wooden rowing boat moored beside it, boat painted faded coral #F49D6E inside, a coil of rope, light snow on the planks. |
| 11 | `boathouse` | 1536x1024 | yes | B | A small Finnish red boathouse with a gabled snowy roof standing at the water edge on granite, walls a muted coral #F49D6E deepened toward wood #7A5638, white trim, wide dark doors facing the water. |
| 12 | `lantern_post` | 1024x1024 | yes | B | A short wooden post with a small iron hand lantern hanging from a hook, the lantern glass dark and unlit, a little snow on top of the post. |
| 13 | `ground_sauna` | 1536x1024 | yes | A | A horizontal ground strip seen from the side: packed snow path with a few wooden duckboards, a low snowbank and two small rounded stones. Flat walkable top edge at about the middle of the image. Below the top edge the body is a simple soft gradient of shadowed snow and slate #28335E down to the bottom border: no cutaway, no cross-section, no roots or stones shown underground, no hard band at the bottom. It is one long horizontal strip that runs off both the left and right image borders without ending; both ends are cut straight by the border at the same height, so copies tile side by side. |
| 14 | `ground_forest` | 1536x1024 | yes | A | A horizontal ground strip seen from the side: snowy forest floor with a few soft patches of muted moss #4A6B3F, fallen birch twigs and small half-buried stones. Flat walkable top edge at about the middle of the image. Below the top edge the body is a simple soft gradient of shadowed snow and slate #28335E down to the bottom border: no cutaway, no cross-section, no roots or stones shown underground, no hard band at the bottom. It is one long horizontal strip that runs off both the left and right image borders without ending; both ends are cut straight by the border at the same height, so copies tile side by side. |
| 15 | `ground_lake` | 1536x1024 | yes | A | A horizontal ground strip seen from the side: smooth frozen lake ice #7FC8E8 with faint pale cracks and wind-swept snow streaks, a thin snowy shore lip at the top edge. Flat walkable top edge at about the middle of the image. Below the top edge the body is a simple soft gradient of shadowed snow and slate #28335E down to the bottom border: no cutaway, no cross-section, no roots or stones shown underground, no hard band at the bottom. It is one long horizontal strip that runs off both the left and right image borders without ending; both ends are cut straight by the border at the same height, so copies tile side by side. |
| 16 | `ground_shore` | 1536x1024 | yes | A | A horizontal ground strip seen from the side: deep bright snow over rounded pink-grey granite boulders, a few dry golden grass tufts poking out. Flat walkable top edge at about the middle of the image. Below the top edge the body is a simple soft gradient of shadowed snow and slate #28335E down to the bottom border: no cutaway, no cross-section, no roots or stones shown underground, no hard band at the bottom. It is one long horizontal strip that runs off both the left and right image borders without ending; both ends are cut straight by the border at the same height, so copies tile side by side. |
| 17 | `ground_harbour` | 1536x1024 | yes | A | A horizontal ground strip seen from the side: smooth wide pink-grey granite slabs worn by the sea, thin snow in the cracks, a dark wet edge. Flat walkable top edge at about the middle of the image. Below the top edge the body is a simple soft gradient of shadowed snow and slate #28335E down to the bottom border: no cutaway, no cross-section, no roots or stones shown underground, no hard band at the bottom. It is one long horizontal strip that runs off both the left and right image borders without ending; both ends are cut straight by the border at the same height, so copies tile side by side. |
| 18 | `fg_reeds` | 1536x1024 | yes | A | Close foreground clumps of tall dry reeds and grass along the bottom edge, near-black spruce blue #0D1326 with a hint of slate, soft edges, bottom third of the image only. It is one long horizontal strip that runs off both the left and right image borders without ending; both ends are cut straight by the border at the same height, so copies tile side by side. |
| 19 | `fg_rocks` | 1536x1024 | yes | B | Two large dark rounded boulders with thin snow caps at the bottom edge of the image, near-black slate #131B36, very simple shapes. |
| 20 | `fg_branch` | 1536x1024 | yes | B | A dark spruce bough hanging down into the frame from the top left corner, near-black spruce #0D1326, soft edges, the rest of the image empty. |
| 21 | `figure_walk` | 1024x1024 | yes | A | A small slender hooded wanderer seen exactly from the side walking to the right, ankle-length cloak in deep violet #2A2350, a coral #F49D6E scarf trailing behind, no face visible (only soft shadow inside the hood), holding a short pole forward with a small iron lantern hanging from its tip, lantern glass dark and unlit. Simple elegant silhouette, roughly 1:3 width to height. |
| 22 | `figure_stand` | 1024x1024 | yes | B | The same small slender hooded wanderer standing still seen from the side facing right, deep violet #2A2350 cloak, coral #F49D6E scarf, no face, holding the short pole with the small dark unlit lantern slightly raised. |
| 23 | `figure_sit` | 1024x1024 | yes | A | The same small slender hooded wanderer sitting on a low wooden bench seen from the side facing right, deep violet #2A2350 cloak, coral #F49D6E scarf, no face, hands in lap, the small dark unlit lantern standing on the bench beside it. |
| 24 | `glow_stone` | 1024x1024 | yes | B | A small smooth palm-sized river stone, pale milky white with a faint warm amber translucency inside, resting flat, simple oval silhouette. |
| 25 | `bg_start` | 1024x1536 | no | A | Polar night over a small Finnish archipelago: deep night blue sky #070A14 to #1C2548, sparse soft stars, a faint green aurora veil high up, calm dark sea, low snowy islands with spruces on the horizon at 62% height, a tiny distant lighthouse on the right with one small warm light, a single tiny warm window far away. The bottom 25% is dark calm snow and shore, quiet and empty for buttons. Hopeful, not bleak. |
| 26 | `bg_end_dawn` | 1024x1536 | no | A | The same small Finnish archipelago at dawn: sky from soft lilac-blue #9FC3E0 at the top through peach #F7C59F to gold #FFD27A at the horizon, the sun just below the horizon so there is no white disc, warm light on thin clouds, calm sea reflecting gold and coral streaks, islands with spruces in soft violet-blue, a white lighthouse with a coral band on the right catching the first light. The brightest value is soft gold #FFE8B8, never pure white. Saturated, warm, hopeful. |
| 27 | `bg_end_night` | 1024x1536 | no | A | The same small Finnish archipelago late at night, very calm and dim: indigo sky #0D1326 to #1C2548, a thin crescent moon behind veiled cloud, a few stars, dark still sea with a faint silver moon path, low islands in silhouette, one tiny warm sauna window glowing softly far away on the left. Low brightness overall, no bright areas, sleepy. |
| 28 | `bg_patient` | 1024x1536 | no | B | Early morning over the same archipelago, soft and low contrast: pale blue-grey sky #9FC3E0 fading to faint peach at the horizon at 60% height, calm sea, low islands with spruces, the lighthouse small on the right, a darker quiet upper third for text overlay. |
| 29 | `app_icon` | 1024x1024 | no | A | App icon: a single small white lighthouse with a coral band on a dark rounded island, centred, under a soft green aurora arc on a deep night blue #0D1326 background, one warm amber light in the lantern room. Very simple bold shapes readable at 60 px, no small detail, full-bleed square with no rounded corners and no border. |

Kept from v1 (not regenerated): `fog_band`, `fog_band_b` (deployed in demo/assets).

### Placement (for integration in world.js)

| Name | Action | Layer (parallax) | Colour group | Use |
|---|---|---|---|---|
| `far_mountains` | regenerate | L2 far (0.1) | blue | Tile across the horizon at hy; sat group blue; replaces ridge() far mountains. |
| `far_islands` | regenerate | L2b islands (0.2) | blue | Tile just above the sea line; sat group blue; replaces islands(). |
| `sky_dawn_clouds` | new | L1 sky (0.04) | dawn | Draw only during dawn (alpha = dawn sat), upper 45% of the sky, slow drift; sat group dawn; never under grey. |
| `sky_aurora` | regenerate | L1 sky (0.04) | green | Add with globalCompositeOperation lighter at 0.35 x aurora alpha over the procedural curtain; sat group green. |
| `mid_hills_spruce` | new | L3 mid hills (0.3) | green | Tile behind the ground at about gy - 0.12H; sat group green. |
| `mid_birch_grove` | new | L4 mid (0.5) | yellow | Forest chunk, behind the figure, bottoms on gy; sat group yellow. |
| `birch_cluster` | regenerate | L4 mid (0.5) | yellow | Accent prop in sauna and shore chunks; sat group yellow. |
| `sauna_hut` | regenerate | L4 mid (0.5) | yellow | Drop-in for existing sauna_hut draw; window glow stays procedural (stove), placed over the dark window; sat group yellow. |
| `lighthouse` | regenerate | L4 mid / L0b far | yellow | Far: small at horizon right edge (replaces the striped pip). Near: shore chunk. Lamp glow and beam stay procedural; sat group yellow. |
| `pier_boat` | regenerate | L4 mid (0.5) | yellow | Drop-in for existing pier_boat draw in the harbour chunk; sat group yellow. |
| `boathouse` | new | L4 mid (0.5) | yellow | Harbour chunk background prop; sat group yellow. |
| `lantern_post` | new | L4 mid (0.5) | yellow | Every ~600 world px along the path; procedural glow at the lantern; sat group yellow. |
| `ground_sauna` | new | L5 ground (1.0) | yellow | Ground of the sauna chunk, top edge on gy, stretched per chunk with 10% alpha crossfade at chunk borders (extend art.js feather to names starting with ground_); sat group by biome. |
| `ground_forest` | regenerate | L5 ground (1.0) | green | Ground of the forest chunk, top edge on gy, stretched per chunk with 10% alpha crossfade at chunk borders (extend art.js feather to names starting with ground_); sat group by biome. |
| `ground_lake` | regenerate | L5 ground (1.0) | blue | Ground of the lake chunk, top edge on gy, stretched per chunk with 10% alpha crossfade at chunk borders (extend art.js feather to names starting with ground_); sat group by biome. |
| `ground_shore` | regenerate | L5 ground (1.0) | dawn | Ground of the shore chunk, top edge on gy, stretched per chunk with 10% alpha crossfade at chunk borders (extend art.js feather to names starting with ground_); sat group by biome. |
| `ground_harbour` | regenerate | L5 ground (1.0) | blue | Ground of the harbour chunk, top edge on gy, stretched per chunk with 10% alpha crossfade at chunk borders (extend art.js feather to names starting with ground_); sat group by biome. |
| `fg_reeds` | new | L6 foreground (1.35) | green | Bottom edge, blurred 2px, light 0.6; sat group green. |
| `fg_rocks` | new | L6 foreground (1.35) | blue | Bottom corners, alternating with fg_reeds; sat group blue. |
| `fg_branch` | new | L6 foreground (1.35) | green | Top-left corner in forest and sauna, slow sway; sat group green. |
| `figure_walk` | regenerate | L5 figure (1.0) | yellow | Replaces procedural figure body at fx; code keeps walk bob and adds lantern glow at the lantern tip (lantern at upper right of the sprite); sat group yellow for the scarf. |
| `figure_stand` | new | L5 figure (1.0) | yellow | Shown when not walking; sat group yellow. |
| `figure_sit` | regenerate | L5 figure (1.0) | yellow | Sauna chunk rest and end screen; sat group yellow. |
| `glow_stone` | regenerate | prop / app | yellow | Patient view and deck; code adds the pulse glow. |
| `bg_start` | new | backdrop | - | Start overlay background, cover-fit; fades into the live world on Begin. |
| `bg_end_dawn` | new | backdrop | - | End screen behind 'Good morning.'; also the colour reference for the procedural dawn grade. |
| `bg_end_night` | new | backdrop | - | End screen for night sessions ('Rest well.'). |
| `bg_patient` | new | backdrop | - | Patient view background, cover-fit, dark scrim on top for text. |
| `app_icon` | regenerate | icon | - | iOS and Android app icon, PWA icon. |
| `fog_band` | keep | L3 fog (0.3) | blue | Unchanged. |
| `fog_band_b` | keep | L3 fog near (0.7) | blue | Unchanged. |

### Stays procedural

- **sky_gradient:** Stays procedural (vgrad), tweened per state.
- **stars:** Procedural for twinkle. No image (generated star fields came back as vignette scenes).
- **sun:** Procedural. Fix the blown sun: disc fill #FFE8B8 at max alpha 0.85, never white; halo gold #FFD27A then coral #F49D6E, use 'lighter' only for the small halo; cap global exposure at dawn to 1.1; clip the disc under the far_mountains layer so it rises behind the fells.
- **lantern_and_window_light:** Procedural glows at the unlit lanterns, sauna window and lighthouse lamp in every image. Light is the hero: these are the only bright warm pixels at night.
- **lighthouse_beam:** Procedural (SPR.beam).
- **night_ending:** Code: night sessions end on bg_end_night with exposure <= 0.6 and no white overlay; the current night end brightens to dawn and is blinding.
- **colour_return:** Assets are painted in local colour at middle value, so desaturation to grey and the bloom to colour show a large, visible change. Order yellow (birches, wood, figure scarf), blue (ice, sea, far layers), green (spruce, moss, aurora), dawn (clouds, shore).
- **task_panels_and_breath_orb:** Out of scope here: owned by the minigame workflow (task_ prefix).
