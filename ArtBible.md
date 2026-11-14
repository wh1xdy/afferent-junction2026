# Art bible

## 1. Style

Minimal 2D side view. Flat layered silhouettes, soft watercolour texture, subtle paper grain, gentle gradients, no outlines, no text, no faces. A small Finnish island in polar night: harbour, birch forest, frozen lake, sauna hut, lighthouse. The mood is calm and hopeful, never bleak. Generous negative space, especially in the sky.

Principles taken (no designs copied): colour as the reward (Gris), the goal always visible on the horizon (Journey), layered silhouettes where the sky carries the mood (Alto's Odyssey), soft responsive nature (Flower). No character, shape language, palette or composition is to be recognisable as any of these games.

**Orientation: portrait.** The bottom 40% of the screen is world (ground, path, figure). The top 60% is sky, where the colour drama happens. The figure stays at x = 35% of the screen width and the world scrolls left. The lighthouse sits at the right edge of the horizon from second 3 and only grows.

**The figure:** small, hooded, cloak to the knees, no face (a soft shadow inside the hood), holding a lantern on a short pole. One pose plus a code-driven walk bob (2 px, 0.5 s period) and a sitting pose for the sauna.

## 2. Colour return system

Every asset is generated **in full colour**. The game removes colour, not the artist. One PixiJS filter on every layer with three uniforms: `saturation` (0 to 1), `tint` (multiply colour), `exposure`. Each station animates its own layers over its bloom time (1.5 s after success, 5 s after a timeout or miss). There are no extra assets per state.

The sky is a code-drawn 4-stop vertical gradient, tweened per state, so it can also move continuously with the vitals layer.

| State | Sky top / bottom | Land | Accents | Layers raised |
|---|---|---|---|---|
| Night grey (start) | `#14161B` / `#2A2E36` | `#3A3E46` | lantern `#F2E6C9` (only warm pixel) | all saturation 0.05 |
| + Warm yellow (forest) | `#14161B` / `#2C2C30` | birch bark `#E8E1D2` | `#F2B544`, `#D98E2B` | lantern, birches, sauna window to saturation 1 |
| + Blue (lake) | `#10304D` / `#2A5C80` | ice `#7FC8E8` | `#3A7CA5`, `#1E4E79` | ice, fog, far mountains to 0.8 |
| + Green (sauna) | `#0F2233` / `#1E3A44` | `#2F4A48` | aurora `#5FE3A1`, `#2FA37A` | aurora layer fades in, sky to 0.6 |
| Dawn, full colour | `#9FC3E0` / `#F7C59F` | sea `#4F86A8`, hills `#6E7F5A` | sun `#FFE8B8`, `#F49D6E` | all saturation 1, exposure +0.4, left to right sweep over 4 s |

Rules:
- Each colour is bound to its station, not to its position. A skipped station becomes a 3 s walk-through and its colour returns as the figure passes.
- Dawn forces saturation 1 on every layer, whatever happened before.
- A miss never lowers saturation. It only slows the bloom (5 s instead of 1.5 s).

### Vitals layer (visual side)
- Pulse above resting +10 bpm in calming segments: the world is held, never colder. Warm amber tint (`#D98E2B`) rises up to +15%, fog drift 0.6x, lantern glow widens 10%.
- Pulse rising in activating segments: lantern sparkle (small particle burst per beat, max 6 particles), up to 40 extra stars. Capped at +15 bpm.
- Heartbeat (only with "Show heartbeat" on): lantern flame scales 1.0 to 1.06 and back on each beat, 180 ms. Above resting +10 bpm, or with the setting off, it glows at a fixed slow 60 bpm instead.

### Profiles (visual side)
- Good day: thin fog (density 0.3), 180 stars, faint aurora hint at 10%, neutral night grey.
- Bad day: dense low fog (0.8), no stars, slower fog drift (0.6x), warm amber tint +12%, lantern 1.3x. Never darker than good day.

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

## 5. Shared style prompt

Use this verbatim as the prefix of every generation call, then add the asset prompt:

> Minimal 2D side-view illustration for a calm mobile game, flat layered silhouettes with soft watercolour texture and subtle paper grain, gentle gradients, no outlines, no text, no faces, no logos, calm and hopeful mood, small Nordic archipelago island in polar night, smooth organic shapes, generous negative space, limited palette of deep cool blues, soft greens and warm amber accents, full colour, isolated element on a transparent background, orthographic side view, even soft light from the left.

Reference image: the first accepted `far_mountains` asset, attached to every later call. Model: OpenAI image generation, `background: transparent`, quality high. API key only in the `OPENAI_API_KEY` environment variable, never in the repo; the generation script and outputs live outside version control except accepted PNGs.

## 6. Asset list (25)

Priority A (16, needed for the 20:00 build) is generated first. Priority B (9) only after all A assets are accepted. Budget: about 3 attempts each, around 75 calls, roughly $15 to $20 at high quality, well under the $50 limit.

| # | Name | Size | Transp. | Prio | Asset prompt (appended to the style prompt) |
|---|---|---|---|---|---|
| 1 | `far_mountains` | 1536x1024 | yes | A | Low rounded distant mountains and hills on a far shoreline, horizontally tileable, soft blue silhouette, bottom third of the image only. |
| 2 | `fog_band` | 1536x1024 | yes | A | A long soft horizontal band of low sea fog, semi-transparent, wispy edges, horizontally tileable. |
| 3 | `aurora_ribbon` | 1536x1024 | yes | A | A wide flowing ribbon of green northern lights with faint teal and violet edges, soft vertical curtains, upper half of the image. |
| 4 | `stars_overlay` | 1024x1024 | yes | A | Sparse small soft stars of varying brightness scattered across the frame, no moon. |
| 5 | `ground_harbour` | 1536x1024 | yes | A | A narrow wooden pier and rocky shore strip along the bottom of the image, calm dark water edge, horizontally tileable ground line. |
| 6 | `ground_forest` | 1536x1024 | yes | A | A mossy forest floor path strip along the bottom of the image with roots and small stones, horizontally tileable. |
| 7 | `ground_lake_ice` | 1536x1024 | yes | A | A flat frozen lake surface strip along the bottom of the image, smooth ice with faint cracks and light snow dusting, horizontally tileable. |
| 8 | `ground_shore_lighthouse` | 1536x1024 | yes | A | A snowy rocky shore strip along the bottom of the image rising gently to the right where a lighthouse would stand, horizontally tileable on the left edge. |
| 9 | `birch_cluster` | 1024x1536 | yes | A | A cluster of four slender birch trees with white bark and dark marks, bare winter branches, full height of the image. |
| 10 | `sauna_hut` | 1024x1024 | yes | A | A small traditional Finnish log sauna hut with a snowy roof, a short chimney and one small square window, the window dark. |
| 11 | `sauna_window_glow` | 1024x1024 | yes | A | Only a soft warm amber glow shaped like a small square window with light spilling outwards, nothing else in the image. |
| 12 | `lighthouse` | 1024x1536 | yes | A | A slender white and red Nordic lighthouse on rocks, lamp room dark, full height of the image, no surrounding landscape. |
| 13 | `lighthouse_beam` | 1536x1024 | yes | A | A single soft wide cone of warm light beam radiating horizontally from the left edge, fading to transparent. |
| 14 | `figure` | 1024x1024 | yes | A | A small hooded figure in a long cloak seen from the side walking right, no face visible inside the hood, holding a lantern on a short pole in front, simple rounded shapes. |
| 15 | `figure_sit` | 1024x1024 | yes | A | The same small hooded figure in a long cloak sitting on a low wooden bench seen from the side, hands in lap, no face visible, lantern standing beside it. |
| 16 | `sun_disc_dawn_glow` | 1024x1024 | yes | A | A soft low rising sun disc with a large warm peach and gold glow halo fading to transparent. |
| 17 | `lantern_sheet` | 1024x1024 | yes | B | Five small hand lanterns in a row from smallest dimmest flame to largest brightest flame, warm amber light, same lantern design. |
| 18 | `pier_boat` | 1536x1024 | yes | B | A small wooden rowing boat moored beside a short pier with two posts, calm. |
| 19 | `islands_distant` | 1536x1024 | yes | B | Three low distant rocky islands with a few pine silhouettes on the horizon, horizontally tileable. |
| 20 | `fog_band_b` | 1536x1024 | yes | B | A thinner higher band of drifting mist, very soft, horizontally tileable. |
| 21 | `birch_cluster_b` | 1024x1536 | yes | B | Two birch trees and one young birch leaning slightly, white bark, bare branches, full height. |
| 22 | `foreground_reeds_rocks` | 1536x1024 | yes | B | Dark close foreground silhouettes of tall reeds and two rounded rocks along the bottom edge, slightly blurred. |
| 23 | `fork_signpost` | 1536x1024 | yes | B | A path splitting in two, one flat path along the shore and one climbing a small hill, a simple wooden post without any text at the split. |
| 24 | `glowing_stone` | 1024x1024 | yes | B | A small smooth round pebble glowing softly from inside with warm golden light. |
| 25 | `app_icon` | 1024x1024 | no | B | A tiny lighthouse on a dark blue island under a green aurora with one warm lantern light, centred, simple, readable at small size. |

## 7. Production pipeline

1. 03:00 David starts the script with asset 1, checks it, accepts it as the reference image, then runs assets 2 to 16 unattended overnight (sequential, each call attaches the reference).
2. 08:30 to 10:00 retakes: check tileable edges, transparency and style drift. Figure assets are the most likely to drift, so regenerate those first.
3. Assets are trimmed and exported as PNG and WebP, max 2048 px width per layer for phone memory.
4. Fallback if generation fails: flat-colour silhouettes drawn in code with the same palette (cut order item 7 in `BuildPlan.md`).
