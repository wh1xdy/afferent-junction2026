# Afferent lookdev: world and session feel

Status: build spec for tonight (Sun 15 Nov 2026). Creative director synthesis of three director reports (light and rendering, motion and camera, session arc). Owns how the world and the session feel: rendering, light, colour grading, atmosphere, motion, figure, camera, transitions and the big moments. It does not own the image set (image workflow), the minigame contents and their juice kit (`design/minigames.md`), audio, the end-screen DOM or the patient-view DOM.

Where this file and `ArtBible.md` or `GameDesign.md` differ on look and feel, this file wins tonight; the decisions are logged in section 15 so `Decisions.md` can be updated after the build.

Evidence (headless Chrome, 390x844): contact sheets in `scratchpad/light/` (`s-good.png`, `s-bad.png`, `s-cwn.png`, `s-gdawn.png`, `s-ndawn.png`), `.../scratchpad/mcd/` (`sheet-live.png`, `sheet-walk.png`, `sheet-dawn.png`) and `.../scratchpad/hook/` (`sheet-live.png`, `sheet-good.png`, `sheet-bad.png`, `sheet-night.png`).

Priorities: **MUST** ships tonight, **SHOULD** ships tonight if the MUSTs are green by the halfway mark, **NICE** is after the demo. Every item names its role model and the exact technique taken.

## 0. Verdict in one paragraph

Today the world reads as a prototype: a flat 72% black overlay turns night into grey-blue murk, nothing blooms, the colour return is a 2 px dot change plus a thin debug-looking ring, the modes differ only by the lighthouse beam, the bad day is milk, the figure is a paper doll on a conveyor belt with a sine-wave lantern, the camera never moves, and the payoff (dawn) is a 4 s global crossfade that is buried under text and 80% black after about 3 s. The fixes below are mostly light, grading and timing: they reuse the existing procedural world and the incoming image set, and they cost about 2 net full-screen composites.

## 1. Vision (5 lines)

1. **You carry the only light.** Outside the lantern the world falls to kaamos blue (cyanotype), inside it the snow keeps its real colour (Limbo and Inside: light is the only thing that reveals the world; Kentucky Route Zero: theatrical pools on clean dark planes).
2. **Each task sends the light home, and the world keeps the colour.** A mote flies into the lantern and colour floods outward from it (Gris: colour washes outward from the heroine; Ori: spirit light travels to the character).
3. **The world breathes at 6 per minute and the camera moves like a held breath.** One pacer drives figure, aurora and fog; the camera dollies by depth and never shakes (Journey's restraint, Alto's Odyssey depth camera, Monument Valley's composed stillness).
4. **Dawn is earned, slow and never blinding.** The sun crests the fell, rays fan through the birches, the lantern hands over to the sun (Alto's Odyssey sunrise, Journey summit, Old Man's Journey lingering).
5. **Your lights stay.** One warm light per finished session settles on the far shore, never counted, never missing (Sky: Children of the Light placed candles).

## 2. Render pipeline

### 2.1 Pass order (one frame of `A.World.draw`)

Units: `u = H/844`, CSS px. `q4` means a buffer of `W/4 x H/4` CSS px (98x211 at 390x844). Bands are camera bands (section 6); "screen" means drawn after the camera transform is restored.

| # | Pass | Owner file | Space / buffer | Composite | Notes |
|---|---|---|---|---|---|
| 0 | `A.FX.begin(ctx, info)` | fx.js | - | - | Blends the grade preset, clears the lamp list, resizes buffers |
| 1 | `step()`, `A.Figure.update()` | world.js, figure.js | - | - | Figure writes `st.lx/st.ly` (world) and world converts to `st.slx/st.sly` (screen) |
| 2 | `sky()` | world.js | band sky | source-over | Fill starts at `y = -0.3H` (tilt overscan) |
| 3 | `stars()`, `moon()` | world.js | band stars | lighter | Dawn star fade front (8.3) |
| 4 | `aurora()` | world.js | q4 aurora buffer, band aurora | lighter | Existing buffer |
| 5 | `sun()` | world.js | band sun | source-over + lighter halo | Drawn before the ridges so they occlude the limb |
| 6 | `mountains()` (+ dawn ridge rim) | world.js | band far | source-over | Sun saddle (8.3) |
| 7 | `sea()`, `islands()`, `lighthouse()`, `village()`, birds | world.js | band islands | source-over | |
| 8 | far fog | world.js | band fogFar | source-over | |
| 9 | `midHills()`, back props, far snow | world.js | band mid | source-over | Paths close at `y = 1.35H` |
| 10 | `ground()`, footprints, front props, glints | world.js | band ground | source-over | |
| 11 | near fog | world.js | band ground | source-over | |
| 12 | **LIGHT** `A.FX.light(ctx)` (replaces `darkness()`) | fx.js | q4 light buffer, screen | multiply | 3.1 |
| 13 | `lanternLight()` at 60% alpha | world.js | band ground | lighter | Multiply cannot brighten, so the warm air stays additive |
| 14 | figure shadow, figure, lantern | figure.js | band ground | source-over / lighter | After the multiply: the hero is never muddied (Limbo) |
| 15 | touch blooms, colour wave front band | world.js | screen | lighter | 7.4 |
| 16 | mid and near snow | world.js | screen | source-over | Lantern-lit (4.4) |
| 17 | `foreground()` | world.js | band fore | source-over | |
| 18 | **RAYS** (dawn only) | fx.js | q4 ping-pong or sprite fan, screen | screen | 3.5 |
| 19 | **BLOOM** | fx.js | q4 bloom buffer, screen | screen | 3.4 |
| 20 | **GRADE** | fx.js | screen | saturation, multiply, soft-light, screen | 3.3 |
| 21 | `overlays()` remainder: fatigue border, `V.black` | world.js | screen | lighter / source-over | Vignette, grain, warm and exposure move into GRADE |
| 22 | panel and task (engine `drawOverlay`) | engine.js, minigames | screen | - | Never graded or bloomed, so UI stays crisp |
| 23 | motes (task in and out, village) | moments.js | screen | lighter | `A.Moments.drawOverlay(ctx, now)` from the main loop |

### 2.2 Buffers (all created in `A.FX.resize()`, CSS px, rebuilt on size change)

| Buffer | Size | Use |
|---|---|---|
| `light` + `lights` | q4 each | ambient gradient + light sprites, then multiply onto main |
| `bloom` | q4 | emitter sprites, screen onto main |
| `rayA`, `rayB` | q4 | dawn rays ping-pong (tier 2 only) |
| `mulBake` | W/2 x H/2 | multiply tint gradient x vignette x static grain x exposure; re-baked at most every 4th frame and only when the preset moved by more than 2% |
| `auroraC` | q4 | existing |

### 2.3 Budgets

- **Fill:** at most 7 full-screen-equivalent composites (FSE) per frame at dpr 2, 8 during dawn. Today about 5 to 9 (darkness, vignette, grain, exposure, warm soft-light, border, black). New typical night frame: light 1, bloom 1, multiply bake 1, soft-light 1, screen lift 1, saturation 1 (skipped when `sat >= 0.98`), border only in fatigue, black only when above 0. Removed: darkness, vignette, grain, exposure, warm. Net +1 to +2 FSE.
- **CPU:** all new FX at most 1.5 ms per frame on an iPhone 12; `A.World.draw` p95 at most 10 ms at 4x CPU throttle on desktop (today 8.2 to 9.9 ms).
- **No main-canvas readback** except the tier-2 dawn rays (one `drawImage(ctx.canvas)` per frame, dawn only). Readback forces a GPU flush on iOS; the measured cost was +10% frame time per readback.
- **No `ctx.filter`.** Its support in iOS WKWebView is not reliable. Softness comes from small buffers upscaled and from the soft sprites.
- Blend ops used: multiply, screen, soft-light, saturation, lighter, destination-out, destination-in. All are supported in WebKit canvas 2D.

## 3. Light and colour grading

### 3.1 Light buffer (replaces `darkness()`) - MUST

Role model: Limbo and Inside (light is the only thing that reveals the world) and Kentucky Route Zero (outside the pool everything falls to clean dark planes, never grey).

Each frame, in the q4 `light` buffer:

1. Fill a vertical gradient (cached via `vgrad`): `y < hy - 0.2H` white (sky untouched), `hy - 0.2H .. hy` lerp to `ambFar`, `hy .. gy` `ambMid`, `gy .. H` `ambGnd`. Rows use the camera-transformed `hy` and `gy` of their bands (`toScreen(0, hy, 0.25)`, `toScreen(0, gy, 1)`).
2. Clear the `lights` buffer, draw every queued `A.FX.lamp(..., {light: 1})` with `lighter` using `tint('soft', c)`, then cut shadow wedges (3.6, SHOULD) with `destination-out`.
3. Draw `lights` onto `light` with `lighter`, then draw `light` onto main with `multiply` at `(0, 0, W, H)`.

Ambient values are the `amb*` fields of the blended preset (3.2) as `mix(base, white, amount)`. Lights queued every frame:

| Light | Queued by | Colour token | Radius | Alpha |
|---|---|---|---|---|
| Lantern air | figure.js | `lantern-glow` | `3.2 * Rl` | `0.9 * br` |
| Lantern ground pool (ellipse, rx 2.4 Rl, ry 0.45 Rl at `gy`) | figure.js | `light-glow` | - | `0.6 * br` |
| Sauna window | world.js `hut()` | `lantern-amber` | `60u` | `0.5 * (0.55 + 0.45 stove)` |
| Lighthouse lamp | world.js | `lantern-flame` | `0.03H * (0.6 + lamp)` | `0.6 * lamp` |
| Moon path on water | world.js `sea()` | `frost` | `0.06W` | `0.15 * nightA` |
| Sun wash (dawn) | world.js `sun()` | `honey` | `0.9W` at `(SUN_X, hy)` | `0.9 * sunP` |
| Touch bloom | world.js | `lantern-glow` | `22u` | `0.25 -> 0` over 500 ms |

`Rl = max(V.lanternRadius, 70) * u * (1 + 0.4 * flare) * (1 + 0.15 * V.kind) * igniteR`, where `igniteR` is the ignite curve (8.1). `br = V.lanternBright`. The flare coupling (`1 + 0.4 * flare`) is identical to today's `darkness()` so the reaction-core stimulus does not change.

### 3.2 Grade preset model - MUST

Role models: Gris (every restored colour changes the grade of the whole world, not one prop) and Alto's Odyssey (cool clear nights, violet-rose shadows at dawn, every biome its own light).

A preset is a struct of numbers and token colours. Colours are token mixes only (DesignSystem rule: no invented hex). `white` is `#FFFFFF` as the neutral of multiply.

| Field | Meaning |
|---|---|
| `sat` | global saturation (1 = off), `saturation` composite of `#808080` at alpha `1 - sat` |
| `mulTop`, `mulBot` | multiply tint gradient, sky top to land bottom, mid stop at `hy` is their mix |
| `exp` | exposure folded into the multiply bake (`S.exposure`, capped per preset) |
| `vig`, `vigC` | vignette strength and colour, centred on the lantern |
| `slTop`, `slTopA`, `slBot`, `slBotA` | soft-light split tone, top half and bottom half |
| `liftC`, `liftA` | screen lift: a coloured toe, so shadows never go pure black and never go milk |
| `bloom` | bloom gain |
| `ambFar`, `ambMid`, `ambGnd` | light buffer ambient, as `mix(kaamos, white, x)` |

Composition every frame:

```
P = stage(sg)                       // sg = colour stages returned, 0..3, fractional while a wave runs
P = blend(P, MODE[mode], mw)        // mw eases 0..1 over dur-mode-style 2000 ms (ema tau 0.7 s)
P = blend(P, KIND, V.kind)          // bad day kindness, 3.2.4
P = blend(P, DAWN or NIGHT_END, d)  // d = ds.dawn (morning) or V.nightEnd (night)
during fadein, rest, checkin, rt:   P = CORE (stage 0 + flow, kind 0), fixed
```

Stage changes blend over `dur-colour-return` 4000 ms, but spatially through the wave (7.4), not as a global fade.

#### 3.2.1 Colour-return stages (base, night)

| Field | s0 kaamos | s1 + yellow | s2 + blue | s3 + green |
|---|---|---|---|---|
| `sat` | 1.0 | 1.0 | 1.0 | 1.0 |
| `mulTop` | mix(white, frost, 0.45) | mix(white, frost, 0.30) | mix(white, ice, 0.18) | same as s2 |
| `mulBot` | mix(white, `#3E5478`, 0.35) | mix(white, lilac, 0.18) | same as s1 | same as s1 |
| `slTop`, `slTopA` | kaamos, 0.18 | kaamos, 0.12 | ice, 0.10 | light-aurora-hem, 0.08 |
| `slBot`, `slBotA` | fjord, 0.18 | light-glow, 0.10 | light-glow, 0.10 | light-glow, 0.10 |
| `liftC`, `liftA` | fjord, 1.0 | fjord, 1.0 | fjord, 1.0 | fjord, 0.8 |
| `vig`, `vigC` | 0.50, fjord | 0.48 | 0.46 | 0.42 |
| `bloom` | 0.55 | 0.55 | 0.58 | 0.60 |
| `ambFar` (on kaamos) | 0.70 | 0.74 | 0.78 | 0.82 |
| `ambMid` (on kaamos) | 0.45 | 0.52 | 0.59 | 0.66 |
| `ambGnd` (on kaamos) | 0.30 | 0.37 | 0.44 | 0.51 |

The per-group local saturation stays in world.js `grade()` (yellow: birches, wood, the Keeper's cloak, ply lines; blue: ice, sea, far layers; green: spruce, moss, aurora). The preset is the mood on top. The minimum land saturation in `satOf('base')` stays 0.12 at stage 0 (kaamos blue, not grey; concept 3.4). Token names here follow `design/tokens.json` v2: frost, kaamos, fjord, lilac, ice, honey, apricot, `light-*`; the retired `silver-*`, `night-*`, `violet-*`, `aurora-teal` and `dawn-coral*` are not used.

#### 3.2.2 Mode identities (blended over 2000 ms)

| Mode, biome | Role model and technique | Overrides |
|---|---|---|
| calm, sauna | Kentucky Route Zero: one warm interior pool in a cold night, low contrast | `sat` 0.92, `slBot` lantern-amber `slBotA` +0.10, `vig` 0.55, `bloom` 0.45, `ambGnd` +0.04, `liftC` mix(fjord, lantern-amber-deep, 0.15) |
| flow, forest | Alto's Odyssey neutral night | stage base unchanged, `vig` 0.45, `bloom` 0.50 |
| wake, lake | Alto's Odyssey clear cold night, crisp stars | `mulBot` mix(stage mulBot, kaamos, 0.10), `slBot` ice 0.12, `vig` 0.35, `bloom` 0.60 |
| fatigue, shore | Sky: Children of the Light morning lift, sunrise-alarm ramp | `sat` 0.95, `liftC` mix(light-daylight, ice, 0.30), `liftA` 0.18 as a gradient strongest at the horizon and fading upward, `vig` 0.30, `bloom` 0.2 + 0.3 * (1 - daylight), ambient + 0.5 * daylight. world.js halves the flat `daylight` haze in `sky()`, `ground()` and `fogBank()` (this is the milk fix) |
| rest, harbour | Inside: dim, quiet, cold lilac | `sat` 0.65, `slTop` and `slBot` rest `#6E6590` 0.20, `vig` 0.65, `bloom` 0.35, ambient -0.05. Exposure stays the engine's 0.7 |

Calm and rest never excite: no sparks, no lighthouse beam motion, wave 3.5 s, camera ease-in-out only, bumps at most +0.012 zoom, no birds in rest, no shooting star.

#### 3.2.3 Dawn and night end

| Field | DAWN (morning) | NIGHT_END |
|---|---|---|
| `sat` | 1.0 | 0.8 |
| `mulTop` | mix(white, dawn-peach, 0.12) | mix(white, `#6E6590`, 0.18) |
| `mulBot` | mix(white, apricot, 0.20) (apricot shadows) | mix(white, kaamos, 0.35) |
| `slTop` | honey 0.25 | `#6E6590` 0.12 |
| `slBot` | dawn-peach 0.12 | kaamos 0.10 |
| `liftC`, `liftA` | fjord, 1.0 | fjord, 1.0 |
| `vig`, `vigC` | 0.25, `#6E6590` (never black) | 0.60, fjord |
| `bloom` | 0.70 | 0.50 |
| ambient | all to 1.0 (white) | `ambGnd` to 0.20 |
| exposure cap | 1.0, and frame mean luminance at most 0.70 | 0.35 at the end hold |

Every warm light is honey or amber; nothing in the orange-red range is emitted or graded. No red anywhere.

#### 3.2.4 Bad day is held, not darkened (KIND) - MUST

Role models: Gris grief chapters (muted but clean and beautiful, never ugly) and Sky: Children of the Light (your light never shrinks).

`V.kind` tweens 0 to 1 over 4 s at the first walk when `profile === 'bad_day'` or `mood_start <= 2`. Values:

- Lantern: radius x1.15 (`Rl`), `lanternGain` floor 1.0 (world floors `max(V.lanternRadius, 70)`), figure warm rim alpha floor 0.6.
- Grade: `sat` x0.85, `ambGnd` +0.05, `slBot` light-glow +0.08, `liftC` fjord (clean dark), `vig` -0.05, `bloom` +0.05.
- World caps: fog at most 0.45, `fogBank` heavy x0.5 and only below `gy`, exposure floor 0.90, daylight haze x0.5.
- Camera: base zoom +0.06 (closer, a smaller and warmer world), every tilt amplitude x0.5.
- Reactions to results are identical to a good day. The first wave lands at the same time as on a good day.

Good day: aurora +0.2 alpha, star density +20%. Nothing else.

### 3.3 Grade pass - MUST

In order, each skipped when its strength is under 0.01:

1. `saturation`: fill `#808080` at alpha `1 - sat`.
2. `multiply`: `mulBake` (tint gradient times vignette centred on the lantern screen position, times static grain, times exposure) drawn at `(0, 0, W, H)`. The vignette centre moves with the lantern, so re-bake when the lantern moves more than 8 px or the preset moves more than 2%, at most every 4th frame; otherwise draw the vignette part as a separate cached sprite (decide by profiling, keep the FSE count).
3. `soft-light`: top half `slTop` at `slTopA`, bottom half `slBot` at `slBotA` (one cached gradient). The engine's `S.warm` adds light-glow at `0.3 * warm` to the bottom half here (replaces the old warm soft-light overlay).
4. `screen`: `liftC` at `liftA` (fatigue: cached vertical gradient).

Grain: one 128 px tile baked once into `mulBake` (multiply 0.97 to 1.0, static). Role model: Gris static watercolour paper. Static grain also dithers sky banding (Inside's rendering talk uses dither against banding). The per-frame `Math.random` offset is deleted (it was a 60 Hz shimmer).

### 3.4 Bloom (emitter buffer) - MUST

Role models: Journey (light glows into the air and never clips hard) and Ori (soft emissive halo on every light source).

- Emitters are the lamps queued with `{bloom: 1}`: lantern (r `22k * fl`, a `0.9 * br`, lantern-glow), lantern core (r `7k`, a 1.0, light-flame), sauna window (r `34u`, lantern-amber), lighthouse lamp (r `0.03H * (0.6 + lamp)`, lantern-flame), sun (r `0.06H`, a `0.9 * sunP`, light-sun-disc), village lights (r `6u`, a 0.35, light-ember), sparks and touch blooms (r `10u`, a 0.6). Cap 48 emitters per frame.
- Draw each emitter into the q4 `bloom` buffer twice with `lighter`: `tint('soft', c)` at radius `2.2r`, alpha `0.6a`, and at radius `5r`, alpha `0.25a`. SHOULD: also draw `auroraC` into it at alpha `0.35 * auroraAlpha` so the aurora hem blooms.
- Composite onto main with `screen` at alpha `P.bloom` (x0.7 while a panel is open). `screen`, never `lighter`, so it cannot blind.
- Cost: about 100 small drawImages into a 20k px buffer plus 1 FSE. No readback.

### 3.5 Rays at dawn - MUST (fan), SHOULD (occluded)

Role models: Journey summit shafts and Alto's Odyssey sun shafts over the ridge line. Technique for tier 2: GPU Gems 3 chapter 13 light scattering as a post-process, ported to drawImage.

- **Tier 0 and 1 (build first, 30 min):** 7 wedges of `SPR.beam` tinted honey, additive, fanned from the sun centre between 200 and 340 degrees, alpha `0.10 * raysA`, the fan rotating plus or minus 2 degrees over 8 s.
- **Tier 2:** copy main to `rayA` (q4), multiply it by itself twice (x^4: dark silhouettes become 0, so occlusion is free), `destination-in` a radial gradient at the sun (radius 0.35H), then 3 ping-pong passes, each drawing the source 4 times with `lighter` at alpha 0.3 scaled about the sun by `1 + k * 0.05 * (pass + 1)`, k = 0..3 (64 taps). Composite with `screen` at `0.5 * raysA`. Sample centre drifts by plus or minus 1% over 8 s.
- `raysA` ramps 0 to 1 from sun limb contact over 2 s (8.3). Dawn only; fatigue gets no rays.

### 3.6 Lantern shadows - SHOULD

Role model: Limbo and Inside: a moving light gives moving shadows, which makes the world physical.

In the `lights` buffer, after the lantern sprites: for each birch with `|x - slx| < 2.5 Rl` (at most 5) and for the figure, `destination-out` a quad from the trunk edges (x plus or minus w/2 at base and top) extended away from the lantern to `3 Rl`, filled with a linear gradient alpha 0.8 to 0. The q4 upscale gives the soft penumbra. world.js passes trunk screen rects with `A.FX.occluder(x0, y0, x1, y1)`.

### 3.7 Flicker and flash rules - MUST

Role model: Journey and Sky: steady, breathing light that never strobes.

- Lantern flicker: replace `noise(t*7)` and `noise(t*19)` with `0.06 * noise(t*1.6) + 0.04 * noise(t*0.5)`; `lanternLight()` `noise(t*5)` becomes `noise(t*1.2)`; hut `noise(t*4.5)` becomes `noise(t*1.2)`. Every flicker component at or below 2 Hz.
- Star twinkle at or below 1.5 Hz and at most 30% amplitude; village twinkle at or below 0.2 Hz.
- Any full-screen luminance rise of more than 10% takes at least 333 ms; glows rise over at least 120 ms and decay over at least 300 ms. In calm and rest, frame mean luminance changes by at most 0.02 per 100 ms.
- The reaction-core flare is owned by the minigames workflow (Bite) and is not touched here; the FX preset is fixed during the core so the stimulus looks identical every session.
- Nothing shakes, ever.

## 4. Atmosphere systems (world.js)

### 4.1 Sky, sun, stars - MUST

- `SUN_X = 0.70W` (exported as `A.FX.SUN_X` so sky, sea, rays and light buffer agree). Sun y lerps from `hy + 0.03H` to `hy - 0.14H` with `EASE.io` over dawn 2.5 to 5.5 s. Disc fill `light-sun` `#FFD58A` (limb `#FFE3A6`) at alpha at most 0.85, never white.
- **Saddle:** far ridge amplitude multiplied by `1 - 0.55 * exp(-((x - SUN_X) / (0.14W))^2)`, always on (the ridge scrolls at 0.1 parallax, so the morph is invisible). The limb is occluded by the ridge between dawn 2.5 and about 3.2 s, and the disc is fully clear by 5.0 s. Alto's sun crests the ridge; the session director's "sun must be seen" holds.
- Dawn ridge rim: after `mountains()`, re-stroke the far ridge path with honey, lineWidth `1.5u`, alpha `0.8 * sunP`.
- Night first light: horizon band alpha cap 0.12 (the `nd` sprites at 0.42 and 0.36 drop to 0.12 and 0.10). No pink smear.
- Milky Way: drop the 26 soft blobs (they read as a lens smudge), keep the 420-dot band.
- Stars at dawn go out from the horizon upward: starfield layers drawn clipped to `y < frontY` with `frontY = hy - (hy + 0.1H) * EASE.io(dawnT / 3)`; the 16 glint stars fade individually by y.

### 4.2 Aurora - MUST (breathe, unfurl, stage 0), SHOULD (third ribbon, hem, reflection)

Role models: Sky: Children of the Light (ribbons with bright hems), Gris (the world answers the character).

- Drawn as bent veneer (concept 6.3): the curtain is 18 to 30 thin vertical lines that share one wave displacement, not a soft blob; colour `light-aurora-hem` to `light-aurora-tip`.
- Breathes with the pacer all session: `a *= 0.88 + 0.24 * A.pace(t)`. While the breath task runs (orb alpha above 0.1): `a *= 0.75 + 0.5 * orb.b`, `hh *= 0.9 + 0.2 * orb.b`. Reduced motion: plus or minus 5%.
- Unfurls on the green wave: per column `fa *= 1 - smoothstep(r - 40u, r, |px - slx|)` (columns inside the wave radius are lit), curtain height grows from 0.5 to 1.0 during the wave.
- Stage 0: no grey curtain (it read as grey scratches). Draw one soft dim glow band (`tint('soft', frost)`, alpha 0.06) until `ds.green > 0.22`.
- SHOULD: third ribbon (`k = 2`), a bright 1 px hem row per column at `alpha * 1.4` in light-aurora-hem, a travelling brightness wave `alpha *= 0.75 + 0.25 * sin(wx * 0.01 - t * 0.7)` (0.11 Hz), and the reflection on lake and harbour water (`auroraC` drawn with `scale(1, -0.4)` below `hy` at `0.25 * a`, clipped to the water band).

### 4.3 Fog and depth - MUST (value ladder, caps), SHOULD (feathered tiles)

Role models: Alto's Odyssey (every layer hazed toward the sky's horizon colour by depth, so changing the sky changes the world) and Inside (fog is the main depth cue, capped so lights punch through).

- Haze per layer from depth toward `skyLow` (the horizon stop in `sky()`), not toward `mix(skyBot, skyMid)`: far 0.6, islands 0.45, mid 0.28, ground 0.1, foreground 0. The luma ordering far > islands > mid > ground holds in every biome.
- Fog alpha cap 0.55 for any band (Inside cap); bad-day caps from 3.2.4.
- SHOULD: feather the procedural fog sprite edges with the art.js `feather()` mask so bands never show a step.
- NICE: lit fog buffer (fog drawn into q4, lantern glow `source-atop`).

### 4.4 Snow - MUST (lantern-lit), SHOULD (push, depth layers)

Role models: Inside (particles lit by the flashlight) and Journey (snow and sand react around the character).

- Flakes within `R = 1.5 * Rl` of the lantern: `n = 1 - d / R`, `alpha *= 1 + 1.6n`, and when `n > 0.25` draw `tint('dot', light-glow)` at `alpha * n`. The lantern visibly warms the air.
- SHOULD: each flake gets `vx, vy`; near the lantern `vx += (dx / d) * 22u * n * dt`, `vy -= 14u * n * dt`, damping `pow(0.92, dt * 60)`. A touch within `90u` gives one outward impulse `60u/s * (1 - d / 90u)`.
- SHOULD: three depth layers: far (1 px, drawn in band mid before `midHills`), mid (today), near (4 to 6 bokeh discs, 12 to 28 px, alpha 0.08 to 0.15, `SPR.bokeh` with a +15% rim at 0.85 radius, parallax 1.6). Alto's blurred foreground for scale.
- Dawn: snow speed eases to 30% over 1.5 s, near flakes turn into honey motes drifting in the shafts.
- Reduced motion: 40 mid flakes, glow only, no push.

### 4.5 Lighthouse ladder - MUST

Role model: Journey (the goal is always visible and grows brighter as you near it); Monument Valley (the structure completes).

`V.lhLevel` (0 to 1) set by moments.js: 0.30 at the end of the reaction core (the minigames Bite payoff calls `A.World.hooks.flareLighthouse(a)`; fallback: moments.js sets it at core end), then each task after green steps it to 0.55, 0.80, 1.0 over 1.6 s `EASE.io`. In `lighthouse()`: `lamp = max(lamp, lhLevel)`, bloom emitter scales with `1 + 0.08 * lift()`, beam `max(beam, 0.5 * lhLevel) * (1 - day)` with a slow 8 s sweep in wake and fatigue only; calm and rest get the lamp, never beam motion. Every completed task now has a visible world payoff, also after green. The drawn structure is the plain day-mark tower (birch-white, gently tapering, no stripes, no bands, small round lamp room; Decisions L3); `lighthouse()`, `V.lhLevel` and the hook names stay.

### 4.6 Village of lanterns - MUST

See section 9. Drawn by `village(ctx)` in band islands after `islands()`.

### 4.7 Life - SHOULD (birds), NICE (boat)

- Birds (Alba: wildlife returns as you restore the world; Alto's flocks for scale): none in the polar night. After the blue wave one loose flock of 5 crosses once, high; at dawn a flock of 7 rises from the treeline at 0.8 s and crosses the sun path. Bird i: `x = lerp(-0.1W, 1.1W, (t - t0) / 14)` + `i * 14u * cos(i)`, `y = y0 + i * 6u + 3u * sin(0.7t + i)`, band islands. Wings: an "m" polyline, half-span `5u`, wing angle `0.5 * sin(phi)`, flapping at 3 Hz for 1.2 s then gliding 1.8 s (shape motion, not a luminance flash). Colour `grade(fjord)`. Never in rest. Speed 0.08 screen/s.
- NICE: distant boat with one warm masthead light (Kentucky Route Zero: tiny distant lights that imply other lives).

### 4.8 Remove debug-looking circles - MUST

- `rings()` is deleted; the colour wave front (7.4) replaces it.
- `orb()`: delete the 1.5 px stroked circle. While the minigames breath task (`g.drawWorld`) is present, `orb()` draws nothing; otherwise it draws only the soft glow plus `SPR.halo` at alpha 0.12.

### 4.9 Lamination - MUST

Role model: bent birch plywood (concept 6.3); about 20 lines in world.js, so the procedural fallback matches the images.

- After filling any landform path (`mountains()`, `islands()`, `midHills()`, `ground()` top edge, snow mounds), stroke 3 copies of its top edge translated down by `2.5u`, `5u`, `7.5u` (`u = H/844`): `birch` at alpha 0.55, `ply` at 0.45, `ply-edge` at 0.35, line width `1u` (ground `1.5u`), clipped to the landform. Vertical translation is enough for these gentle curves; true offset curves are used only for the streak glyph, the strata and the icon.
- The lines belong to the yellow colour group: at s0 they are graded to kaamos, and they are the first thing the yellow wave warms (7.4 "warmth returns").
- Steam (löyly, sauna chimney): 3 to 5 parallel curved lines in `ceiling` and `birch`, drifting, never puffs.
- Hoarfrost (eyes closed): nested parallel arcs in `birch` growing from the corners, 1.2 px, glint at most 0.2 Hz.

## 5. Figure (figure.js)

The figure is the Keeper (concept section 7): dome hood, bell cloak in undyed birch-ply wool `ply` with a kaamos shadow side, a hem band of two `ply-edge` lines, the lantern in the mitten at hip height, no scarf, no staff, no face (Decisions L2). Role models: Monument Valley's Ida (one readable shape), Journey only for cloth motion.

### 5.1 Scale and rig - MUST

- Figure unit `k = H * 0.103 / 60` (1.2x today's 0.086), so the lantern reads in a video. Origin at the feet, 60 units tall.
- `A.Figure.update()` replaces `rig()`. It writes `st.fig` and the lantern position `st.lx, st.ly` (world, band ground). It reads `st.dx` (world px moved this frame), `st.walk`, `S.t`, `V.lift`, `V.look`, `V.sit`, `V.dawnT`, `V.orb`.
- Port today's `figure()` and `lantern()` first (30 min) so world.js can drop its copies once figure.js renders identically.

### 5.2 Walk cycle - MUST

- Stride-locked phase: `phase += PI * |dx| / (stride)` with `stride = 0.7 * 60k` (one step is 0.7 of the figure height). Cadence falls out of the speed (section 6.3), feet never slide.
- Four key poses: leg s in {-1, +1} angle `s * 0.42 * sin(ph) * walk` about the hip at y -15; swing-foot lift `2.4 * max(0, s * cos ph)^1.5 * walk`; feet drawn as 3.2 x 1.4 ellipses, not stroke caps. Hip bob `1.6 * (1 - |sin(ph - 0.25)|) * walk` (lowest just after contact). Body lean `0.06 rad * walk * v / vmax` about the feet. Hood y `+= 0.6 * bob(ph - 0.5)` (head lags). Cloak hem control points x offset `-1.5 * sin(ph) * walk`.
- Start: 150 ms anticipation lean back 0.03 rad, then forward. Stop: settles with the pendulum and hem.

### 5.3 Lantern pendulum - MUST

`theta'' = -w0^2 sin(theta) - 2 zeta w0 theta' - (ax / L) cos(theta) - (ay / L) sin(theta)`, `w0 = 5.71 rad/s` (1.1 s period, heavy and calm), `zeta = 0.18` (calm and rest 0.30, reduced motion 0.50), `L = 5` units (the lantern hangs from the hand at hip height), `ax = d2(worldX)/dt2 / k`, `ay` from the hip bob. Clamp to plus or minus 0.6 rad. Semi-implicit Euler, substeps of at most 1/60 s. Idle wind `0.04 * noise(0.3t)`. The lantern light, shadows and the light buffer follow it.

### 5.4 Breath at 6 per minute - MUST

`breath = A.pace(t) * (1 - walk)`: cloak scaleY `1 + 0.02 * breath` about the feet, hood and shoulders y `-0.7 * breath`, lantern hand y `-0.4 * breath`. During the breath task use `V.orb.b` (or `hooks.setBreath(b)`) at amplitude x2, so the figure breathes with the player. Today's `sin(t * 1.6)` (15 per minute) is deleted. SHOULD: exhale vapour puff at each in-to-out crossing (`tint('soft', birch)`, radius 3 to 9 units, rise 10, alpha 0.16 to 0 over 1600 ms, at most 2 alive).

### 5.5 Hem and hem band - MUST

- No scarf: the Verlet chain is deleted and its budget goes to the hem.
- Hem: underdamped spring `v += (w^2 (target - x) - 2 zeta w v) dt`, `w = 9`, `zeta = 0.35`, target `-0.08 * v / k` plus the walk swing.
- Hem band: two thin `ply-edge` lines near the bottom of the cloak that follow the hem spring. Each fork choice adds one thin line in the chosen side's colour (coreloop 6.4, previously "scarf bands"), so the figure carries the session's layers. Group yellow.
- Poses: `figure_ride` (released, cloak open) and `figure_crouch` (held, cloak tucked) for the Ride (coreloop 3).

### 5.6 Reactions (one positive vocabulary) - MUST

Role models: Journey's shout (a held release that answers with light) and Sky's candle lift.

| Trigger | Pose | Timing |
|---|---|---|
| Tap anywhere in a task | nod 0.05 rad | 180 ms |
| Task panel open (`phase === 'game' && !g.world`) | look up at the panel, hood -0.12 rad | 800 ms `EASE.io` |
| Wrong input | head tilt 0.08 rad sideways, nothing else | 320 ms |
| `lightHome` (task done, touch) | lantern lifted overhead: hand (11, -25) to (6, -62) | up 500 ms soft, hold 500, down 900 io |
| `lightHome` (timeout) | same lift at amp 0.6 | same |
| Colour wave | hood tilts 0.07 rad toward the wave | follows wave |
| Green wave | look up, hood -0.25 rad | 1200 in, 800 hold, 1200 out |
| Dawn | look up -0.32 rad at 0.6 s (2 s io), lower lantern to the hip 1.2 s io, back lean 0.05 rad | 8.3 |

No sad or negative pose exists. A bad day uses the same values.

### 5.7 Rims and shadow - MUST (rims), SHOULD (cast shadow)

- Warm rim on the lantern side (today's clip draw, alpha floor 0.6 on a bad day). Cool rim on the back: cloak offset (-0.9, -0.6) in `grade(frost)` at `0.35 * (1 - dawn)`. Dawn: back rim mix(honey, light-sun-limb) at `0.8 * sun`.
- Ground shadow: `ctx.transform(1, 0, -1.6, -0.22, fx, gy)`, fill the cloak path in fjord at `0.32 * lanternBright`, cast away from the lantern. At dawn a second shadow stretches 3x the figure height away from the sun at `0.35 * sunP` (Old Man's Journey long shadows).
- Image figure: if the image workflow's `figure_*` sprites are used, the rim is art.js `shade` tinted the rim colour, offset 1.5 px toward the light, under the sprite.

### 5.8 Sit - SHOULD

`V.sit` 0 to 1 (900 ms io down, 700 ms up). Hip y -15 to -6, legs to 1.35 rad forward, cloak bottom +6, lantern set on the ground at `(fx + 12k, gy - 4k)` along a parabola peaking 6 units above. Used on the start screen and at the night end. NICE: sitting at the sauna during calm breath.

### 5.9 Image figure policy

The procedural rig stays the animated figure during play: a static PNG cannot carry the stride, pendulum, hem, breath or reactions; its shapes are the Keeper's dome and bell. The image workflow's `figure_sit` is the Keeper sprite, used only when `V.sit === 1` (start screen, night end), crossfaded over 200 ms, with the procedural lantern drawn on top. `figure_stand` and `figure_walk` are not used in play tonight.

## 6. Camera (camera.js computes, world.js applies)

Role models: Alto's Odyssey and Ori (2.5D camera: zoom and pan scale per parallax depth, so a push-in is a dolly, not a flat scale), Monument Valley (calm composed holds), Florence (the scene narrows when an interaction starts).

### 6.1 Contract - MUST

- engine.js calls `A.Cam.update(now, dt, session)` every frame; it writes `V.cam = {x, y, z}`. Patient view and anything without `V.cam` gets the identity. Reduced motion: always identity.
- Sign convention: `cam.y > 0` moves the world down on screen (looking up, more sky). `cam.x > 0` moves the world right.
- world.js `band(ctx, d)`: `s = 1 + (z - 1) * d; translate(px + x * d, py + y * d); scale(s, s); translate(-px, -py)` with pivot `(fx, gy - 30k)` (the figure's waist). `toScreen(x, y, d)` applies the same transform. `st.slx, st.sly = toScreen(st.lx, st.ly, 1)` feed the light pass, snow, touch blooms and `A.World.lanternPos()`.
- Depth per band: sky 0.10, stars 0.12, aurora 0.15, sun 0.18, far 0.22, islands 0.32, fogFar 0.45, mid 0.62, ground 1.0, fogNear 1.0, fore 1.35.
- Overscan: sky fill starts at `-0.3H`; every filled path (`sea`, `midHills`, `ground`, fog banks) closes at `y = 1.35H`, so a tilt never exposes an edge. Zoom never goes below 1.00.
- Nothing shakes. Camera motion uses springs (`A.spring`, critically damped, implicit, stable at any dt) or token easings.

### 6.2 Shots

| Shot | z | y | x | Duration, easing | Priority |
|---|---|---|---|---|---|
| Start screen hold | 1.30 | 0 | 0 | static, drift plus or minus 2 px at 0.05 Hz | MUST |
| Rest pull-back (8.1) | 1.30 to 1.04 | 0 | 0 | 6000 ms io, starts at rest | MUST |
| Play base | 1.04 (kind 1.10) | 0 | lead | spring | MUST |
| Walk lead | - | - | `-LEAD[mode]` | spring, w per mode (6.3) | SHOULD |
| Task open | 1.10 (calm, rest 1.08; kind +0.04, cap 1.16) | 0 | 0 | 900 ms soft (calm, rest 1400 ms io) | MUST |
| Breath task (world task) | 1.06 | +0.05H | 0 | 1400 ms io | MUST |
| Task done (from `lightHome`) | back to base | 0 | - | 1400 ms io | MUST |
| Result bump | +0.02 (calm, rest +0.012) | - | - | 1200 ms sine envelope | MUST |
| Green wave | - | +0.10H (calm, rest +0.06H) | - | 1200 in, 800 hold, 1200 out, io | SHOULD |
| Dawn (8.3) | to 1.00 | +0.08H | 0 | 4000 ms io | MUST |
| End hold (morning) | 1.00 to 1.012 | - | +6 px | 12 s linear, plus pacer ripple 0.002 | MUST |
| Night end | +0.03 | -0.02H | 0 | 4000 ms io | MUST |
| Per-biome framing | sauna +0.06, lake -0.04 | forest +0.02H, lake +0.04H | - | 2000 ms | NICE |

While a panel is open, `V.focus` (0 to 1 over 600 ms) adds `haze += 0.18 * focus` to layers with depth under 0.5 and multiplies bloom by 0.7. This replaces the light director's snapshot blur (cut).

### 6.3 Walk motion (engine.js) - MUST

Role model: Old Man's Journey and Alba: speed is stride times cadence, start and stop are eased.

- Chunk width 560 becomes 420, and `targetX = c.x0 + 0.45 * (c.x1 - c.x0)`. A walk is then 420 px, about one screen, so each task gets its own biome tableau (Monument Valley) and the walk can be slower without lengthening play. Coordinate with the image workflow: props are placed relative to the chunk, the pier image is anchored so its right end sits at `c.x1 - 40`.
- Walk time per mode: rest 3.6 s, calm 3.4, flow 3.0, fatigue 2.8, wake 2.6; before a measurement slot 2.4.
- Trapezoid profile, closed form in `update()` (no integration): accelerate 0.6 s, decelerate 0.8 s, `vmax = D / (T - 0.7)`. Flow: about 160 px/s peak, 2.6 steps/s.
- Lead (SHOULD): `LEAD` calm 0.025W, flow 0.035W, wake 0.05W, fatigue 0.04W, rest 0.02W; spring `w` 1.6, 2.2, 3.0, 2.6, 1.2.
- Fix the harbour start: the figure must not walk past the pier end onto water (procedural pier spans to `c.x1`).

## 7. Transitions

### 7.1 Begin - MUST

No black dip (delete the `0.35 * sin` dip in `fadein`). Begin fades the start UI over 320 ms, and the world wakes from the ember: the lantern catches (8.1). From a cold start (no idle visual) the same timeline runs from black with `V.black = 0` and the ambient at 0.04. Role model: Journey's opening (no cut from menu into play) and Inside/Limbo cold open (the light defines the world).

### 7.2 Task in: the lantern sends a light - MUST

"Panel" in 7.2 and 7.3 means the Opening (concept 9.3): an arch with a 7 px ply frame, the live world visible outside under a `#0A1322` scrim (0.50 play, 0.62 measurement). Stations that open from a prop (sauna door, loom frame, cairn) grow it from that prop; all others from the lantern. Envelope and timing unchanged.

Role model: Ori: spirit light travels as a mote along a curve and connects the character to its target.

- 0 ms: phase `game`. The figure stops (pendulum swings forward), looks up. A mote (r `10u` glow plus 6 trail samples at `0.5^i`) leaves the lantern on a quadratic bezier: control `(slx + 0.15W, (sly + panelCy) / 2 - 0.08H)`, to the Opening's centre, 600 ms `EASE.soft`. Camera starts the task-open shot.
- 450 ms: the Opening grows out of that point: scale 0.86 to 1 about its centre (420 ms, M3 emphasized decelerate), alpha 0 to 1 (320 ms). Input, `g.startAt`, the task timers and the record's start all begin when the Opening is open, so the 450 ms are never counted against the task.
- Reduced motion: no mote, the Opening fades in at full size over 600 ms, input from 200 ms.
- The minigames workflow owns the Opening's contents, `g.bare` and `g.outro`. This spec owns only the open and close envelope, via `A.Moments.panelEnv(g, now, box)`.

### 7.3 Task out: the light comes home - MUST

Role model: Gris (colour returns from the character into the world, so the result feels earned and physical).

- The engine closes the task at `finishedAt + max(0.7, g.outro)` (minigames rule, at most 2.2 s).
- Fold: the Opening scales 1 to 0.9 and folds over 380 ms `EASE.io` into a mote at its centre.
- The mote arcs into the lantern: 650 ms `EASE.io` (calm and rest 1.0 s, timeout +0.4 s). Bezier P0 box centre, control `(mid x, min(y0, sly) - 0.15H)`, P1 lantern.
- Arrival emits `A.bus.emit('lightHome', {group, by, mode})`: lantern swell (flame x1.3, 120 ms rise, 800 ms decay), figure lift, haptic, `Au.note`, camera result bump and pull-out, the colour wave (7.4), lighthouse step after green.
- Walk starts 1.1 s after the close (`outroUntil = now + 1.1`), while the camera pulls out.
- `bloom(group)` is no longer called in `endGame`; it is queued and fired on `lightHome`. The `ring()` and haptic in world.js `step()` on the sat threshold edge are removed.

### 7.4 Colour wave - MUST

Role models: Gris (colour floods outward from the heroine as a soft watercolour front) and Ori (lights ignite in a travelling cascade).

- moments.js sets `V.wave = {g, t0, dur, from, to}` on `lightHome` and tweens `V.sat[g]` over `dur`. `dur`: touch 2.4 s (calm and rest 3.5 s, wake 1.8 s); timeout 4.0 s (calm 5.0 s). A miss only slows the bloom; it never lowers saturation.
- world.js: `r = EASE.soft(p) * hypot(W, H)`, edge `60u`, centre `(slx, sly)`. `satOf(g, x, y)` returns `lerp(from, to, smoothstep(r, r - edge, dist))` for the wave group; other groups never decrease.
- Positional where it matters: sky and sea (fill the old gradient, then `save(); arc(slx, sly, r); clip();` fill the new gradient), the 16 ground colour stops (each at its x on `gy`), birches, leaves, hut, pier and shore props (their own x, y), aurora (per column). Everything else uses the covered fraction as a global ramp.
- Front band: one feathered additive band at radius r, at least 0.12H wide, alpha at most 0.10, tinted the group colour (yellow mix(honey, sun, 0.5), blue ice, green light-aurora-hem). Never a thin line.
- Per colour, one named change (Gris: each colour has its own transformation):
  - **Yellow, warmth returns:** birch leaves pop as the front passes (scale 0 to 1.25 to 1 over 350 ms, stagger by distance, leaf size 2.5x today), sauna and hut windows light, footprints turn faint amber.
  - **Blue, the water wakes:** sea and ice get a mirrored sky (`sky` gradient flipped into the sea band at `0.35 * ds.blue`, SHOULD), ripples 2x alpha, ice and sea glints sweep outward, lighthouse reflection becomes a streak, one flock of 5 birds (SHOULD).
  - **Green, the sky opens:** the aurora unfurls from the lantern x outward over 3 s, camera tilt and figure look-up (SHOULD), shooting star in flow and wake only (NICE).
- Calm and rest: amplitude x0.5, no sparks. Reduced motion: a 4 s crossfade through the same `satOf` (no front).

### 7.5 Mode and biome changes

- Mode: grade blend over 2000 ms (3.2.2), camera spring constants blend, walk speed changes at the next walk only.
- Biome: today's 70 px ground colour blend stays. NICE: one large blurred foreground occluder passing at parallax 1.6 at each chunk border (Inside and Limbo foreground occluders, Alto's near silhouettes).

### 7.6 Dawn, night end, falling asleep, exit

See 8.3 for dawn and night end. Falling asleep (night, 30 s eyes closed): `V.sit` to 1, lantern to an ember (flame 0.3 over 3 s), camera z -0.03, the existing 3 s fade to black runs; `V.sit` reaches 1 before `V.black` passes 0.7 (Kentucky Route Zero: scenes end by holding a quiet tableau as the lights go down). Exit (close button): unchanged curtain.

## 8. The three signature moments

These are the three shots for the demo video. Times are seconds from the trigger.

### 8.1 "The lantern catches" (Begin to the end of the core)

Role models: Inside and Limbo cold open, Journey's opening reveal (the camera dollies out to the mountain).

| t (s) | Beat |
|---|---|
| before | Start screen is the live world: figure sits (or stands with lowered lantern if sit is not built), lantern an ember (`V.ignite = 0.15`), camera z 1.30, village lights on the far shore, aurora breathing faintly, snow drifting |
| 0.00 | Tap Begin. Start UI fades out over 320 ms. Figure stands (700 ms io) if it was sitting |
| 0.30 | Strike: 6 ember sparks rise from the lantern (life 0.7 s), one light haptic |
| 0.60 | Flame catches: `V.ignite` 0.15 to 1 with `easeOutBack` overshoot 1.15 at 0.80 s, settles at 1.0 by 1.20 s (reduced motion: linear 0.6 s, no overshoot) |
| 0.60 to 2.00 | Light radius grows from 0 to `Rl` (`EASE.soft`); the light buffer ambient rises from 0.04 to the stage-0 values by 2.40 s. The world is revealed by the lantern, not faded up |
| 2.00 | Rest begins. Camera pull-back 1.30 to 1.04 over 6 s `EASE.io`, identical every session (no camera in reduced motion) |
| 2.00 to 8.00 | Stillness (measurement): snow, pacer-breathing aurora and figure, nothing new appears. No lighthouse event here |
| 8.00 | Check-in panel opens with the 7.2 envelope. No question text (the `checkin` cue is removed). SHOULD: on the pick, a mote in the mood colour flies into the lantern, the flame takes that tint for 4 s and eases back to amber over 8 s, so a low pick never leaves the world cold |
| ~18 to ~30 | Reaction core (minigames Bite). FX preset fixed (CORE), camera static at 1.04 |
| core end | The lighthouse ignites to `lhLevel` 0.30 over 1.6 s `EASE.io` (Bite payoff via `flareLighthouse`), then the first walk; `V.kind` starts its 4 s tween if it applies |

Pass criteria: at t = 0.8 s more than 90% of pixels outside a circle of `1.5 Rl` around the lantern are below luma 0.08; at t = 2.5 s the frame matches a normal stage-0 frame; the camera z curve is monotonic with no step above 2% per frame.

### 8.2 "Colour comes home" (the first completed task, yellow)

Role models: Ori (mote to character), Gris (outward wave), Journey (the character answers with light).

| t (s) from task close | Beat |
|---|---|
| 0.00 to 0.38 | Panel folds into a mote at its centre |
| 0.38 to 1.03 | Mote arcs to the lantern with a 6-sample trail; the figure's hood follows it |
| 1.03 | Arrival: `lightHome`. Lantern swell (x1.3), lift begins (up 500 ms), haptic, note, camera bump +0.02 and pull-out to 1.04 (1.4 s) |
| 1.03 to 3.43 | Yellow wave from the lantern (2.4 s): the sky low band and the ground warm under the front, birch leaves pop ring by ring, sauna windows light as the front reaches them, soft gold front band at alpha 0.10 |
| 1.10 | Walk starts (pendulum swings back, hem trails) |
| 1.53 to 2.03 | Lift holds overhead, then lowers over 900 ms while walking |
| 3.43 to 5.0 | Stage-1 grade settles (`dur-colour-return` 4 s from arrival) |

Pass criteria: the wave never starts before the mote lands; 0.7 s after arrival the new tint is inside a circle around the lantern and not at the screen corners; mean chroma inside the front is at least 2x the chroma outside at p = 0.5; no thin ring outline is visible.

### 8.3 "Dawn and the village" (morning), plus the night variant

Role models: Alto's Odyssey sunrise (the sun crests a ridge, the sky ignites outward from it, silhouettes get warm rims), Journey summit (the walk into the light, a whiteout capped far below white), Old Man's Journey (linger, do not cut), Sky (the candle you place stays).

Dawn is 8 s (was 4 s). `SESSION_PLAY_END_S` goes from 106 to 102, so the end screen still appears at about 1:50. The bedside light rises to `#FFF0D2` over the 8 s dawn from dawn 0 and holds 30 s; level 60% until the bedside hardware owner confirms 70% without glare from the lying position (Decisions L5, `tokens.json` `bedside.dawn_morning`).

| t (s) | Beat (morning) |
|---|---|
| 0.0 | `startDawn`: `Au.dawnPhrase()`, bedside light starts. Camera y 0 to +0.08H and z to 1.00 over 4 s io (foreground tufts slide off the bottom, the frame opens). Snow slows to 50% over 1.5 s. Stars start going out from the horizon upward |
| 0.6 | Figure looks up toward the sun (2 s io), then lowers the lantern to the hip (1.2 s io) |
| 0.8 | SHOULD: a flock of 7 rises from the treeline and crosses the sun path |
| 1.0 to 3.5 | Ignite: the dawn grade and `satOf('dawn')` spread as a radial wipe from `(SUN_X, hy)`, radius 0 to 1.3H (`EASE.io`), replacing today's left-to-right sweep. The sky gains chroma bottom-up: `bot` to honey at full strength, `low` to apricot at 0.8, `top` to the dawn sky top `#6E8FC4` without a violet mix; the lilac band is held at the `lilac` token, never pinker. Moon fades with `st.sun` |
| 2.5 to 5.5 | Crest: the sun rises from `hy + 0.03H` to `hy - 0.14H`; the ridge hides the limb until about 3.2 s; rays start at limb contact (0 to 1 over 2 s); honey ridge rim; honey back rim on the figure; long shadow 3x the figure height away from the sun |
| 3.0 to 6.0 | Handover (the story beat): flame 1 to 0.35 (`EASE.io`), the light buffer's lantern pool fades while the sun wash rises, lighthouse lamp dims to day |
| 6.0 | Scheme handover: the UI crossfades from Kaamos to Kevät over 2000 ms (concept 3.3; `--af-dur-scheme-handover`) |
| 5.0 to 8.0 | Hold: full colour, bloom 0.70, near snow as honey motes in the shafts |
| 8.0 | `endScreen`. Requirement for the UI owner: "Good morning." starts fading in no earlier than 8.6 s, over clear sky, never over the sun disc |
| 8.0 + | End hold: Ken Burns z 1.00 to 1.012 and x +6 px over 12 s, pacer ripple |
| mood tap (or 20 s idle) | One warm mote leaves the figure's lantern and arcs 1.6 s to the next village slot on the far shore, where it settles as a light-glow light (always warm, whatever the mood; no answer still places it) |
| dim | Warm settle, never black: starts at `max(moodAt + 3, endAt + 7)` or 20 s idle, `V.black` to 0.45 over 3.5 s, vignette tint `#6E6590` |

Pass criteria: at dawn+6 s no mountain pixel lies within the sun disc radius; frame mean luminance below 0.70 throughout and no channel at 255 outside the disc; the lantern pool radius at 7 s is under 40% of its 1 s value; at dawn+5 s a horizontal luminance profile 15% of H above the ground alternates between shadowed and lit bands with at least 6% contrast (tier 2 rays); the world is still visible (`V.black < 0.05`) at end+6.5 s.

Night variant (night clock or rest mode), role models Inside and Limbo (the last light in the frame is the hero's) and Old Man's Journey (unhurried endings):

| t (s) | Beat (night) |
|---|---|
| 0.0 | No sun, no rays. A lilac first-light line on the horizon at alpha at most 0.12, stars stay, aurora softens to 0.6. Camera z +0.03 and y -0.02H over 4 s io (closing in) |
| 0.5 | Figure sits (SHOULD; otherwise lowers the lantern) and sets the lantern down |
| 0 to 6 | Flame 1 to 0.25 (`EASE.breath`), light buffer `ambGnd` to 0.20, exposure eases to 0.35 |
| 8.0 | `endScreen` ("Rest well."). Dim starts at end+4 s: `V.black` to 0.92 over 6 s, and the ember is drawn after the black at alpha 0.6, so it is the last visible pixel |

Night pass criteria: frame mean luminance never rises by more than 0.03 between consecutive 0.5 s captures; the brightest pixel at 6 s is the lantern.

## 9. Daily continuity

Role models: Sky: Children of the Light (persistent candles), Animal Crossing (the town remembers).

- **Village of lanterns - MUST.** `localStorage['afferent.world'] = {v: 1, lanterns: n, lastBiome, updatedISO}`, wrapped in try/catch (falls back to 0). `n` increments once per lit morning: a session whose fixed core finished with the player's own input (`completed`, `fell_asleep`, or `partial` with `core` present and not unengaged; Decisions D3, `design/engagement.md` 6.1, the same rule as the streak and the week lanterns). Never decremented, no dates shown, no gaps, no count in the world: a missed day changes nothing. The day streak lives outside the world, as the small mornings chip on the start screen (Decisions D1, `design/engagement.md` section 6, styled in concept 12.1). moments.js owns the storage (`A.Continuity.village()`, `.record(status, tasks)`); world.js draws.
- Drawing: n warm lights (cap 60) on the far islands band at deterministic slots: `rng(1000 + i)` picks the island, x within it and the height. Each is a `tint('dot', light-ember)` core of `2.2u` plus a bloom emitter (r `6u`, a 0.35). Twinkle at most 0.2 Hz, 15% amplitude. At dawn alpha x0.6. Visible on the start screen, during play and at dawn. The newest light is placed by the end-screen mote (8.3).
- Demo: `?village=N` forces n (film the dawn shot with 30).
- NICE (after the demo): seasons toward spring over 8 weeks (snow to moss, ice opens, higher sun), starting where yesterday ended (`lastBiome` and faint old footprints), hub mirror of `n` via `day_index`.

## 10. Start, end and patient view

- **Start screen - SHOULD:** the world is the menu (Monument Valley and Alba: the title is the place). `A.Moments.idle(V)` sets `V.ignite = 0.15`, `V.sit = 1`, `V.cam = {x: 0, y: 0, z: 1.30}`. Village lights visible. The hold-to-kindle ring and "Not today" stay low in the thumb zone (UI owner). The mornings chip (from a streak of 2, 06:00 to 21:00) sits above the figure at about 27% from the top, in the eye zone, never in the thumb zone (concept 12.1). `bg_start` from the image workflow is used only before the first canvas frame or when the world cannot render; it must not cover the live world. NICE: "Not today" covers the ember (ignite 0.15 to 0.05) and dims to `V.black` 0.6 over 2.5 s; the village stays lit.
- **End screen:** 8.3. The end-screen DOM and CSS (`css/game-ui.css`, `css/flow-ui.css`) belong to the UI owner; the requirements are the text timing (not before dawn+8.6 s, never over the sun), and that the world stays visible (warm settle, not black) in the morning.
- **Patient view - SHOULD:** `patient.html` loads fx.js and figure.js. `patient.js` passes `V.fxTier = 1` and a `V.preset = 'patient'` hint (stage 2 grade, flow mode, bloom on, no rays, no camera). The village lights show the person's own lanterns. After 4 s, freeze the canvas to one image to save battery (it already caps at 30 fps). The week ribbon and its stagger animation stay with the patient-view owner.

## 11. Reduced motion

`prefers-reduced-motion` or `A.config.reducedMotion`:

| System | Reduced-motion behaviour |
|---|---|
| Camera | Identity always: no zoom, tilt, lead, drift, bump |
| Begin | Lantern ignite linear 0.6 s, no overshoot, no sparks |
| Task in and out | 600 ms crossfades, no mote flight (the mote fades in place at the lantern) |
| Colour wave | 4 s crossfade through the same `satOf`, no front band, no leaf pop scale |
| Dawn | Sun rises at half speed, static ray fan (no rotation, no tier-2 rays), no birds, crossfade grade |
| Figure | Walk cycle stays with bob x0.5, pendulum zeta 0.5, hem amplitude x0.4, no vapour |
| Aurora | Speed x0.3, breathing amplitude plus or minus 5%, no unfurl (alpha fade) |
| Snow | 40 mid flakes, slow, glow only, no push, no bokeh |
| Stars | Twinkle off |
| Grain | Static (always) |
| Parallax | x0.5 as today |
| Particles | Slower than 0.2 screen per second |

## 12. Performance budget and measurement

| Metric | Budget | How |
|---|---|---|
| `A.World.draw` JS p50 / p95, desktop, no throttle | at most 2.5 / 4 ms | `perf.js` overlay or the Playwright perf script |
| `A.World.draw` JS p95 at 4x CPU throttle, DSF 3 | at most 10 ms (walk, game), 11 ms (dawn) | `scratchpad/light/perf2.js` with args `all 4 3` (base, bloom, grade, all) |
| New FX CPU on iPhone 12 | at most 1.5 ms | `?perf=1`, compare `?fx=0` and `?fx=2` |
| iPhone frame time p95 over a full session | at most 18 ms, no auto step to scale 1.5 on iPhone 12 or newer | `?perf=1` overlay, three runs: live morning, bad_day, night |
| Fill | at most 7 FSE (8 at dawn) at dpr 2 | count composites in `A.FX.debug().fse` |
| Main-canvas readbacks | 0 per frame (1 during tier-2 dawn) | `A.FX.debug().readbacks` |

**Quality tiers** (Sky: Children of the Light ships per-device graphics tiers so the same art holds frame rate on old phones). `A.Perf.fx` 2, 1, 0; `?fx=` forces it. perf.js steps the tier down one level when p95 stays above 20 ms for two 3 s windows after the existing render-scale step. The overlay gets a line `fx tier N`.

| Tier | Contents |
|---|---|
| 2 | everything, tier-2 occluded rays, shadow wedges, bokeh, aurora in bloom |
| 1 | light buffer at q6, ray fan, no wedges, no bokeh, no aurora bloom, grade without `saturation` |
| 0 | light buffer, bloom with one radius only, ray fan, grade = multiply bake and lift only, aurora 2 ribbons, snow 60 |

## 13. File plan and hooks (3 to 4 engineers in parallel, no shared files)

### 13.1 Owners

| Engineer | Owns (only these files) | Scope |
|---|---|---|
| **A, light and post** | `demo/js/fx.js` (new), `demo/js/perf.js` | 3.1 to 3.7, presets, tiers, debug |
| **B, figure** | `demo/js/figure.js` (new) | section 5 |
| **C, camera and session** | `demo/js/camera.js` (new), `demo/js/moments.js` (new), `demo/js/engine.js` | sections 6, 7.1 to 7.3, 8 timelines, 9 storage |
| **D, world and hooks** | `demo/js/world.js`, `demo/js/util.js`, `demo/index.html`, `demo/patient.html`, two lines in `demo/js/main.js` | step 0, section 4, 7.4 drawing, village drawing, World hooks |

Step 0 lands first (D, about 45 min). It inserts every call site below, guarded so the game renders exactly as today while fx.js, figure.js, camera.js and moments.js are empty stubs. After step 0 nobody edits another engineer's file.

### 13.2 Step 0 (engineer D)

1. `index.html`: `<script src="js/fx.js">`, `figure.js`, `camera.js` after `art.js` and before `world.js`; `moments.js` after `engine.js`. `patient.html`: `fx.js`, `figure.js` after `art.js`.
2. `util.js`: `A.bez(x1, y1, x2, y2)` (cubic-bezier evaluator, 5 Newton steps, cached), `A.EASE = {soft: A.bez(0.22, 1, 0.36, 1), io: A.bez(0.65, 0, 0.35, 1), breath: A.bez(0.45, 0, 0.55, 1)}`, `A.pace(t)` (0 to 1, 4000 ms in, 6000 ms out with `EASE.breath`, anchored at `A.paceT0`, set on session start, page load otherwise), `A.spring(s, target, w, dt, zeta = 1)` (implicit, `s = {x, v}`), `A.smooth(e0, e1, x)`, `A.easeOutBack(x, s = 1.7)`.
3. `world.js` `draw()`: after `step()`: `A.FX?.begin(ctx, info())`; `A.Figure ? A.Figure.update(st, S, env()) : rig()`; then `[st.slx, st.sly] = toScreen(st.lx, st.ly, 1)`.
4. `world.js`: `band(ctx, d)` and `toScreen(x, y, d)` helpers reading `S.cam` (identity when absent or `rm`); wrap the scene groups in `save(); band(); ...; restore()` with the depths of 6.1; extend path closures to `1.35H` and the sky fill to `-0.3H`.
5. `scene()`: `A.FX ? A.FX.light(ctx) : darkness(ctx)` (screen space). Figure draws: `A.Figure ? (A.Figure.drawShadow(ctx), A.Figure.draw(ctx), A.Figure.drawLantern(ctx)) : (figure(ctx), lantern(ctx))`. After `foreground()`: `A.FX?.post(ctx)`.
6. `overlays()`: when `A.FX` is present skip warm, vignette, grain and exposure; keep the border and `V.black`.
7. `A.World.debug = () => ({cam: S.cam, fig: st.fig, slx: st.slx, sly: st.sly, wave: S.wave, lh: S.lhLevel, ds: st.ds, sun: st.sun, fx: A.FX?.debug(), fig2: A.Figure?.debug()})`.
8. `A.World.hooks` with working stubs for the minigames workflow: `setBreath(b)` (stores `st.breath`), `landmarks()` (returns `[]` until 4.x lands), `lightLandmark(i, a)`, `addSkyMark(kind, x, y)` (no-op), `flareLighthouse(a)` (sets `S.lhLevel = max(S.lhLevel, a)`), `lanternPose(angle)` (calls `A.Figure?.react('pose', angle)`).
9. `A.World.lanternPos()` returns the screen position `(st.slx, st.sly)`.
10. `main.js`: after `s?.drawOverlay(ctx, now)` add `A.Moments?.drawOverlay(ctx, now)`; after both `idle = A.makeVisual(...)` lines add `A.Moments?.idle(idle)`. Remove the `checkin` question text from `cue()` (wordless rule; coordinate with the UI owner).

### 13.3 Interfaces

`A.FX` (fx.js, engineer A):

```
A.FX = {
  SUN_X,                                   // fraction of W, 0.70
  tier,                                    // 2 | 1 | 0
  begin(ctx, info),                        // info: {W, H, hy, gy, rm, t, dt, night, phase, mode, ds, sunP, sun, daylight,
                                           //        exposure, warm, kind, focus, nightEnd, slx, sly, flare, preset, fxTier}
  lamp(x, y, r, colour, a, o = {light: 1, bloom: 1}),   // screen coords, queued for this frame
  occluder(x0, y0, x1, y1),                // screen rect for shadow wedges (SHOULD)
  light(ctx),                              // pass 12
  post(ctx),                               // passes 18 to 20
  preset(),                                // blended preset, for tests
  debug(),                                 // {fse, readbacks, lamps, tier, preset}
}
```

`A.Figure` (figure.js, engineer B):

```
A.Figure = {
  update(st, S, env),          // env: {W, H, fx, gy, u, k, rm, dt, t, night, phase, mode, sun, dawn, sunX, sunY}
                               // writes st.fig, st.lx, st.ly, st.phase (stride-locked), queues lantern lamps via A.FX.lamp
  drawShadow(ctx), draw(ctx), drawLantern(ctx),
  react(kind, data),           // 'nod' | 'tilt' | 'pose' (angle) | 'look' ({x, y, dur}) ; lift, sit and dawn come from V fields
  debug(),                     // {pend: {a, v}, hood, hand, breath, hemTip}
}
```

`A.Cam` (camera.js) and `A.Moments`, `A.Continuity` (moments.js), engineer C:

```
A.Cam = { update(now, dt, session), shot(name, opts), base() }   // writes session.V.cam
A.Moments = {
  idle(V), start(session), update(now, dt, session),
  panelEnv(g, now, box) -> {alpha, scale, cx, cy, input},       // used by engine drawOverlay
  sendLight(from, to, opts), drawOverlay(ctx, now),               // motes
}
A.Continuity = { village(), record(status, tasksDone), lastBiome() }
```

Visual-state fields (written by engine.js and moments.js, read by world, figure and fx). Defaults go into `A.makeVisual`:

| Field | Type | Meaning |
|---|---|---|
| `V.cam` | `{x, y, z}` or absent | camera |
| `V.ignite` | 0 to 1.15 | lantern ignite curve (1 = normal) |
| `V.wave` | `{g, t0, dur, from, to}` or null | colour wave in `V.t` time |
| `V.lhLevel` | 0 to 1 | lighthouse ladder |
| `V.touches` | `[{x, y, t}]`, last 6 | touch blooms and snow gusts |
| `V.lift` | `{t0, amp}` or null | figure lantern lift |
| `V.look` | `{x, y, t0, dur}` or null | figure look target (screen) |
| `V.sit` | 0 to 1 | sit pose |
| `V.dawnT` | seconds since dawn start or null | dawn timeline |
| `V.nightEnd` | 0 to 1 | night ending blend |
| `V.kind` | 0 to 1 | bad-day kindness |
| `V.focus` | 0 to 1 | panel open |
| `V.flameTint` | `{c, t0}` or null | check-in mote tint (SHOULD) |
| `V.fxTier`, `V.preset` | patient view hints | |

### 13.4 engine.js changes (engineer C)

engine.js is also edited by the minigames workflow (`g.outro`, `g.bare`, `g.drawWorld`, haptics, beat clock, input timestamps). C confines edits to the functions below and lands them as one early commit; the two overlaps (`drawOverlay` envelope, the `g.done` close line in `update`) are merged by whoever lands second.

| Function | Change |
|---|---|
| `A.makeVisual` | defaults for every field in 13.3 |
| `startSession` | `A.paceT0 = t0`, `A.Moments.start(s)` |
| `update` | `A.Cam.update`, `A.Moments.update`; walking position from the trapezoid profile (6.3) |
| `fadein` branch | delete the black dip; drive `V.ignite` (8.1) |
| `startRest` | camera shot `rest` |
| `finishCore` | lighthouse fallback to 0.30, `V.kind` tween |
| `planWalk` | chunk 420, `targetX` at 0.45, walk times per mode |
| `startGame` | `V.focus`, panel open at +0.45 s: `g.startAt`, timers and `A.Record.track` start at open |
| `endGame` | no immediate `bloom`; `A.Moments.sendLight(panel, lantern)` and on arrival `lightHome` (wave, lift, bump, lighthouse step after green); `outroUntil = now + 1.1` |
| `startDawn`, dawn branch | 8 s (`V.sweep = t / 8`, `V.dawnT`), `SESSION_PLAY_END_S` 102 |
| `dimEnd` | morning: start at `max(moodAt + 3, endAt + 7)` or 20 s idle, `V.black` max 0.45 over 3.5 s; night: start at end+4 s, 0.92 over 6 s |
| `fallAsleep` | `V.sit` to 1, flame to 0.3 over 3 s, camera z -0.03 |
| `handle` | first line: push `{x, y, t}` to `V.touches` on `pdown` |
| `setMood` (end) | `A.Moments.sendLight(lantern, villageSlot)`, `A.Continuity.record` on `sessionEnd` |
| `drawOverlay` | `show` and `sc` come from `A.Moments.panelEnv` |

### 13.5 Order of work tonight

| Hour | A (fx.js) | B (figure.js) | C (camera, moments, engine) | D (world.js) |
|---|---|---|---|---|
| 0 to 0.75 | stub + preset tables | port figure and lantern verbatim | stub camera, walk profile | **step 0** |
| 0.75 to 2 | light pass, grade stack | scale 1.2, stride lock, 4 poses, pendulum | camera core, rest pull-back, task shots | flicker fixes, sun saddle and rise, first-light caps, remove rings and orb ring |
| 2 to 3 | emitter bloom, static grain bake | breath, hem band, reactions | panel envelope, motes, `lightHome`, wave trigger | positional colour wave, leaf pop, front band |
| 3 to 4 | ray fan, tiers, perf overlay line | rims, dawn pose, ground shadow | dawn 8 s, end dim, night end, ignite | aurora breathe and unfurl, lantern-lit snow, lighthouse ladder, village, kindness caps, value ladder |
| 4 to 5 | SHOULD: tier-2 rays, shadow wedges | SHOULD: sit, hem, vapour | SHOULD: lead, green tilt, check-in mote, idle start | SHOULD: birds, aurora hem and reflection, snow layers and push, water mirror |
| 5 | joint test pass (section 14) and iPhone perf | | | |

## 14. Test checklist

Harness: Playwright at `scratchpad/pw` (`chromium.launch({channel: 'chrome', headless: true})`, viewport 390x844, DSF 2), hub at `http://localhost:8000/app/?dev=1`. Reuse the director scripts: `.../scratchpad/light/play.js` (args: tag profile clock force times), `.../scratchpad/light/dawn.js`, `.../scratchpad/light/perf2.js`, `.../scratchpad/mcd/seq.js`, `.../scratchpad/hook/hook_log.js`. Numeric checks read `A.World.debug()` instead of pixels where possible. Store shots under `screenshots/lookdev/`.

### 14.1 Screenshots to take (each before and after, same seed and time)

| # | Name | Setup | Look for |
|---|---|---|---|
| 1 | `ld-01-start` | idle, morning | live world, ember lantern, village lights, z 1.30 |
| 2 | `ld-02-ignite-0.8` | Begin, t = 0.8 s | black except the lantern circle |
| 3 | `ld-03-rest-2.5` and `ld-03b-rest-7.5` | t = 2.5 s, 7.5 s | pull-back progress, stage-0 night read |
| 4 | `ld-04-night-s0` | first walk, live morning | deep blue dark outside the pool, warm snow inside |
| 5 | `ld-05-panel-0.3` and `ld-05b-panel-0.8` | 0.3 s and 0.8 s after phase `game` | mote in flight, then panel open, figure looking up, z 1.10 |
| 6 | `ld-06-home-1.0` | first lightHome + 0.0 s | mote at lantern, lift starting |
| 7 | `ld-07-wave-0.7`, `-1.4`, `-2.4` | after lightHome | yellow front around the lantern, leaves popping |
| 8 | `ld-08-blue`, `ld-08b-green` | 3 s after each wave | water woken; aurora unfurled |
| 9 | `ld-09-modes` | forced calm (`Sim.offset +18`), wake (`-12`), flow, fatigue, rest at the same worldX | five distinct grades |
| 10 | `ld-10-bad-50` | bad_day, t = 50 s | no milk, figure readable |
| 11 | `ld-11-dawn-1`, `-3`, `-5`, `-7` | dawn + 1, 3, 5, 7 s, morning | crest, rays, handover, hold |
| 12 | `ld-12-end-6.5` | end + 6.5 s | world visible, warm settle, text not on the sun |
| 13 | `ld-13-village-30` | `?village=30`, dawn + 7 s | lit village on the far shore |
| 14 | `ld-14-night-end-0`, `-3`, `-6`, `-10` | night clock | ember is the last light, no pink smear |
| 15 | `ld-15-rm-dawn`, `ld-15b-rm-wave` | reduced motion | crossfades, static rays, no camera |
| 16 | `ld-16-patient` | `patient.html` | world header with village lights |
| 17 | `ld-17-walk-strip` | 10 frames at 50 ms during a walk, figure crop | four distinct poses, planted feet |

### 14.2 Pass criteria

| Area | Check |
|---|---|
| Light | Night stage 0: mean luminance of a 40x40 px patch 150 px left of the figure below 0.15; snow under the lantern above 0.50 with amber hue |
| Modes | Ground-band mean hue, saturation or luminance differs by at least 8% between any two of calm, flow, wake, fatigue, rest |
| Bad day | Ground luminance std dev at least 0.08 (no milk); figure core vs 6 px ring contrast at least 3:1; first colour time within 5 s of good_day; lantern radius at least the live value |
| Value ladder | Luma order far > islands > mid > ground in all 5 biomes |
| Bloom | 1.5 sun radii from the sun centre at least 15% brighter than with bloom off; no channel at 255 outside the disc |
| Wave | Never starts before the mote lands; chroma inside at least 2x outside at p = 0.5; no group's colour ever decreases; no thin ring |
| Lighthouse | Every completed task is followed within 3 s by a change in `V.sat` or `V.lhLevel` |
| Flicker | Lantern core luminance sampled at 60 fps for 5 s: no FFT component above 3 Hz with amplitude over 2% |
| Calm | In calm and rest, frame mean luminance changes by at most 0.02 per 100 ms |
| Figure | Hood y idle FFT peak at 0.1 Hz (plus or minus 0.01), none at 0.25 Hz; after a stop the pendulum overshoots 0.15 to 0.35 rad and is within 0.05 rad after 2.0 s; planted-foot drift under 1 px over 3 steps; figure height at least 0.10H |
| Camera | Identity camera gives a pixel diff of 0 against the same frame with `V.cam` absent; at z 1.1 the figure screen position is unchanged and the mountains move less than 1% while the ground moves 10%; `V.cam.z` reaches 1.10 plus or minus 0.005 900 ms after game start in flow; the velocity sign changes at most once per shot |
| Envelope | Panel alpha 0 for the first 450 ms of `game`, 1 by 770 ms; one mote ending within 4 px of the panel centre; record `duration_ms` unchanged in meaning (starts at open) |
| Dawn | Section 8.3 criteria |
| Night end | Section 8.3 night criteria |
| Village | `n` lights shown exactly; a session with mood 1, 5 or none each adds one; a missed day changes nothing |
| Session length | End screen at about 1:50 in live morning, good_day and bad_day; play 60 to 76 s |
| Words | No text visible during the check-in phase |
| Perf | Section 12 budgets, including three iPhone runs |

## 15. Decisions (conflicts between the directors, resolved)

| # | Topic | Options on the table | Decision | Why |
|---|---|---|---|---|
| 1 | Bloom technique | Mip chain from a main-canvas readback (light) vs emitter light buffer (session) | Emitter bloom into q4 | No GPU readback stall on iOS, no snow false positives at dawn, cheaper. The sprites are already blurred |
| 2 | Grain | Cycle 4 tiles at 12 fps (light) vs static (session) | Static, baked into the multiply grade | Gris paper; calm; saves 1 FSE; still dithers |
| 3 | Dawn length | 8 s (light, session) vs 4 s plus hold (motion) | 8 s, play end 106 to 102 | Room for crest and handover; end screen stays at about 1:50 |
| 4 | Sun position | Crest behind the ridge (light) vs visible beside the lighthouse (session) | `SUN_X` 0.70W plus a permanent ridge saddle | Both: the limb is hidden until about 3.2 s, the disc is clear by 5 s |
| 5 | Colour wave | Soft-light post layer clipped radially (light) vs positional `satOf` (session) | Positional `satOf` on the big surfaces, global ramp elsewhere, soft front band | True colour, not a tint; no regression flash of earlier groups |
| 6 | Wave timing | 1.5 s / 5 s (light, motion) vs 2.4 s (session) | 2.4 s touch (calm 3.5, wake 1.8), 4.0 s timeout, after the mote | Readable spread; timeout still slower but never punishing; anchored on `dur-colour-return` |
| 7 | Rest pull-back | 1.9x to 1.0 (session) | 1.30 to 1.04 | Image layers and the procedural world soften beyond about 1.3x; the reveal still reads |
| 8 | Lighthouse answer | Swell during rest at 7.5 s (session) | Cut from rest; ignition at core end (minigames Bite) and ladder after green | No new stimulus inside the rest measurement; one owner for the lighthouse beat |
| 9 | Walk | Chunk 240 and slow speeds (motion) vs keep geometry | Chunk 420, trapezoid profile, stride lock, 2.4 to 3.6 s walks | One biome tableau per task, believable cadence, props still fit |
| 10 | Figure size | 1.35x (session) | 1.2x | Lantern legible in video without crowding the panel or the image layers |
| 11 | Figure art | Image figure (image workflow) vs procedural rig (motion) | Procedural in play, `figure_sit` only at full sit | A static PNG cannot walk, swing or breathe |
| 12 | Pendulum | 1.1 s period, zeta 0.18 (motion) vs 0.71 s, zeta 0.25 (session) | 1.1 s | Heavier and calmer |
| 13 | Bad day | Several value sets | Merged set in 3.2.4 | Kind, not darker; reactions identical |
| 14 | Core visual lock | Freeze profiles during the core (session K0) vs profiles visible within 10 s (GameDesign 0.4) | FX preset and camera fixed during the core; profile fog and exposure unchanged | The Bite float carries its own fixed backplate, which protects the stimulus region |
| 15 | RT flare cap | Lower the flare glow (light item 7) | Not touched | The minigames workflow owns the reaction stimulus |
| 16 | End dim | Black 0.65 (motion), 0.5 (session), warm settle (light) | Morning 0.45 warm settle with a violet vignette, never black; night 0.92 with the ember on top | The best frame of the session stays on screen |
| 17 | Focus under panels | Snapshot blur strip (light) vs depth haze (motion) | Depth haze plus bloom x0.7 | Free, no extra FSE |
| 18 | Panel open | Iris from the lantern (session) vs mote plus scale (motion) | Mote plus scale | Works with the minigames `g.bare` panels, no clip conflicts |
| 19 | Rays | Occluded radial blur (light) vs pre-baked sprite (motion) | Sprite fan first (tiers 0 and 1), occluded at tier 2 if time | Ships tonight either way |
| 20 | Camera tilt sign | Horizon up (light) vs world down (motion) | `cam.y > 0` moves the world down (looking up, more sky) | One convention for all shots |
| 21 | Check-in words | "How are you this morning?" | Removed | The game is wordless (GameDesign 0.6) |

## 16. Cut list (not tonight)

Seasons over 8 weeks, start where yesterday ended, reindeer, distant boat, biome foreground occluders, shooting star, per-biome framing, sitting at the sauna during calm tasks, lit fog buffer, focus snapshot blur, Milky Way rebuild, the pentatonic chord per colour (hand to the audio owner: one note per `lightHome`, the dawn chord from the notes earned), patient-view lantern stagger (patient owner), hub mirror of the village count.

## 17. Coordination with the parallel workflows

- **Image workflow:** every image layer is drawn inside the camera band of its depth (6.1). Sky and backdrop images need about 6% overscan plus `0.3H` of headroom for the tilts. Near layers (ground, props, figure) must hold up at 1.30x near the figure. The far-mountain image needs a low saddle around `x = 0.70W` or the code saddle is applied to the procedural ridge only and the image is drawn below it at dawn. `sun_disc_dawn_glow` is drawn in `sun()` before the ridges so ridge and ray occlusion still work. Ground and prop placement must survive chunk width 420. `figure_sit` pivot at the feet, lantern not baked in. `bg_start` must not cover the live world. Grading, light, bloom and rays apply to all `A.Art.draw` sprites automatically.
- **Minigames workflow:** they own panel contents, juice, `g.outro`, `g.bare`, `g.drawWorld`, the Bite reaction stimulus and their `A.J.light` panel light map. This spec owns the panel open and close envelope, the mote, `lightHome`, the colour wave, the lighthouse ladder and `A.World.hooks` (stubs in step 0). Their juice never shakes the screen and never draws outside the panel box, so it does not fight the camera. They emit one `done` moment per task and do not add their own world-wide colour change, so the two payoffs do not double up. Their `spill` and `flareLighthouse` calls feed `V.lhLevel`.
- **UI owner (end screen, start screen DOM, CSS):** "Good morning." not before dawn+8.6 s and never over the sun; the morning end never goes to black; chips only with `?dev=1`; the check-in cue text removed.
- **Open question for the orchestrator (outside this scope):** the light director's autoplay reached the end screen 65 to 72 s after Begin with only 3 play tasks, while GameDesign 0.1 says about 110 s. Check the play length or the hub config before the demo.
