# Afferent soundscape: the sound of Layers of Light

Status: soundscape spec and asset map, written 14 Nov 2026 by the soundscape designer after David reopened sound ("we want really nice atmosphere, that best-experience-with-headphones style"; Decisions X28 was "out of scope tonight"). It covers ambience and sound effects only. The adaptive music (Suno) is a separate brief; section 9 is the contract between the two. Nothing in the code was changed: `demo/js/audio.js` is still the procedural piano. This file says what the audio owner wires up and how.

Assets: 16 loops in `demo/audio/ambience/`, 45 one-shots in `demo/audio/sfx/`, each as `.m4a` (AAC, iOS) and `.ogg` (Opus, Android and Chrome), 24 MB in total. Loop points, loudness and starting gains are in `demo/audio/manifest.json`. Every file's source, author, license and changes are in `demo/audio/CREDITS.md` (all CC0 or public domain).

## 0. Verdict in 6 lines

1. **The world is the instrument.** Every biome has one stereo bed, one or two point sources and a pool of rare events. Colour returns, and so does sound: kaamos starts with only air and snow, every returned colour adds a layer, and dawn brings the birds back (Decision 31 stays: "every returned colour adds a voice").
2. **Real Finland where it counts.** The sauna stove and the loyly hiss are recordings from a Finnish sauna; the great tit, chaffinch, blackbird, redstart and willow warbler were recorded in Southern Finland and are public domain. Common cranes calling once at dawn mark the spring.
3. **Made for headphones, safe on a speaker.** Beds are wide and low-contrast, point sources sit in an HRTF space around the player, nothing is hard-panned into one ear, the low end stays mono, and the mix still works on a phone speaker (the Sky team tested on earbuds and device speakers [S3]).
4. **Measurement is sacred.** During the core (Kindle, check-in, Bite), Fork and Two lanterns the bed holds still and no event fires; nothing ever plays at a stimulus onset (vitals-ux M3, M6).
5. **No sudden sounds, no fail sounds** (Decision 31). Every event fades in or sits far away, nothing jumps more than 6 LU above the bed, and the ice booms and the foghorn never play in calm or rest.
6. **Supportive only.** Ambience is atmosphere. No binaural beats, no frequencies that "do" something, no claim that any sound calms, treats or helps (vitals-ux 9).

## 1. Role models and the exact pattern taken

| Role model | Pattern taken | Where it lands |
|---|---|---|
| Alto's Odyssey (Todd Baker, sound and main theme) | Sound design and music blur into one soundscape that follows the biome, the time of day and the weather; the core loop (the glide) has its own continuous sound [S1] | The ride glide loop follows speed (section 4.3); biome beds crossfade with the hills; the colour return is a layer, not a cue |
| Journey (Steve Johnson, sound design) | Big forms get two layers: a washed-out distant layer and a brighter, rumblier layer up close; foley from real materials (sand in a box, jeans on stone) [S2] | Every point source has a far version (lowpass, reverb send, less gain) and a near version (dry, bright); real snow, real ice, real sauna |
| Sky: Children of the Light (Vincent Diamante, Ritsu Mizutani) | Mixes tested on consumer headphones, earbuds and the device speaker, because that is how players hear it [S3] | Acceptance test A4 (section 11): every mix change is checked on AirPods, wired earbuds and the phone speaker |
| Animal Crossing: New Horizons | Wind sits in the trees at their real positions on the island; weather changes how the same wind sounds; music changes every hour [S4] | Point sources at their prop positions (rope, stove, bells, reeds); snowfall and wind change the same bed instead of replacing it |
| Endel | One soundscape adapts continuously to time of day and to body inputs such as heart rate, without the listener doing anything [S5] | The director mode moves filter, density and width of the same beds (section 6). Endel's health claims are its own marketing and are not taken [S5] |
| Calm and Headspace soundscapes | Long, unobtrusive nature loops with no sudden events, layered at low level under voice or music (pattern from the apps themselves; not cited, see section 13) | Beds are 40 to 60 s loops at -23 LUFS, events are rare and soft |
| L4D AI Director (already the director's role model) | Build, peak, relax | Event density rises in a task, falls in the exit ride |

## 2. Rules for every sound

1. **Fade, never cut.** Beds fade in over 3 s at Begin (Decision 31) and crossfade over 2 to 4 s between biomes; one-shots start with at least 2 ms of fade (built into the files).
2. **No sudden sounds.** Event short-term loudness at most bed + 6 LU at the listener. Ice booms, foghorn and church bell only in flow, wake and fatigue, never in calm and rest, never in the first 30 s after waking.
3. **Measurement windows are silent of events** (vitals-ux M3, M6): from Begin to the end of Bite, and from 3 s before Fork or Two lanterns open until they fold, the bed stack is frozen at its current gains and the event scheduler is paused. Fixed task sounds (the same sound for the same action in every session) are allowed; nothing sounds at a stimulus onset (the bite flare stays silent; a catch sound after the tap is fine).
4. **Pulse windows:** any event louder than the bed by more than 3 LU is logged like a haptic signature so `post_event_s` can exclude it (vitals-ux M7).
5. **Headphone comfort:** no point source beyond 70 degrees left or right (no one-ear sounds), nothing directly behind the head, bed low end below 120 Hz summed to mono, no hard stereo ping-pong. Total mix true peak at most -1 dBTP.
6. **Sound off:** everything here is optional. Haptics carry pacing and feedback (GameDesign: "Sound off: Haptics carry the breath pacing and task feedback").
7. **Claims:** the sound is "the island around you". Never "binaural", "frequency", "calming sound", "sleep sound", "therapy".

## 3. The mix (buses, levels, space)

### 3.1 Buses

```
point sources (PannerNode HRTF) ─┐
one-shots ───────────────────────┼─► amb bus ─► mode filter ─► ┐
beds (stereo, gain only) ────────┘                             ├─► master (limiter -1 dBTP) ─► out
music (Suno, separate brief) ─────────────────► music bus ────┘
ui taps (dry, centre) ──────────────────────────► ui bus ─────┘
                 reverb send (one shared convolver, 3 s) ◄── far sources
```

- `amb bus` carries beds, point loops and world events. The **mode filter** is one lowpass plus one high shelf on that bus (section 6).
- One shared reverb (the current `makeReverb()` 3 s noise tail is fine, or a short real IR later) for distance. Near sources send 0 to 10%, far sources 40 to 70%.
- `ui bus` is dry, centre, never filtered by mode, so taps stay crisp.

### 3.2 Loudness targets

| Layer | File level | Starting gain (manifest `gainDb`) | Result at the listener |
|---|---|---|---|
| Beds | -23 LUFS (EBU R128) | -2 to -20 dB per bed | 2 to 3 beds together about -24 to -26 LUFS |
| Point loops | -23 LUFS (rope -26.8, peak-limited) | -10 to -20 dB | felt more than heard |
| One-shots | aim -18 LUFS, never limited, peak -1.5 dBTP (short transients therefore measure lower, see 10) | -2 to -16 dB | events about -28 to -32 LUFS short-term |
| Music (Suno) | master to -18 LUFS | music bus -4 dB | about -22 LUFS |
| **Whole mix** | | | **-20 LUFS integrated (plus or minus 2), true peak -1 dBTP** |

Why -20: Sony's guidance for portable platforms is -18 LUFS plus or minus 2 [S6] and GANG's mobile figure is -16 LUFS [S7]; this game is played in bed in the first minutes after waking, so it sits at the quiet end of that range, and the session already starts at 25% of system volume (Decisions R6).

### 3.3 Space for headphones

- **Beds** are stereo files played without a panner; width set per bed (manifest `spatial`): open beds 100%, pier water 60%, ride ski 50% (mid-side or a simple `ChannelSplitter` blend).
- **Point sources** use `PannerNode` with `panningModel = "HRTF"` [S8], `distanceModel = "inverse"`, `refDistance` 2, `rolloffFactor` 1, positioned from the prop's screen point: x from the screen x (-1 to 1 mapped to -60 to +60 degrees), y up for birds and chimes, a little below for water and ice, z in front. At most 6 HRTF panners at once (CPU); beyond that use `StereoPannerNode`.
- **Distance (Journey's two layers):** far = gain down, lowpass 1.5 to 4 kHz, reverb send up; near = dry and bright. The same file serves both.
- **The lantern is the centre.** Centre is reserved for the lantern, the Keeper's steps and the ride, and the UI. World events never sit dead centre.
- **Birds sit above and around**, 15 to 50 m, left or right, never behind, never two from the same side in a row.

### 3.4 Memory and loading (important on phones)

`decodeAudioData` gives 32-bit float PCM: one 50 s stereo bed at 48 kHz is about 19 MB in memory, all 16 beds about 270 MB. So:
- Keep at most 5 beds decoded. Decode the next biome's bed during the ride before a station (the approach is 3 s plus the hill) and drop the reference to beds no longer used.
- One-shots are small (all 45 together about 37 MB decoded); decode the current stage's pool at session start.
- Pick the format once: `.m4a` if `new Audio().canPlayType('audio/mp4; codecs="mp4a.40.2"')`, else `.ogg` (Opus).
- Loops: `src.loop = true; src.loopStart = m.loopStart; src.loopEnd = m.loopEnd; src.start(t, m.loopStart)`. The 0.5 s circular padding on both sides makes the loop seamless whether or not the decoder trims AAC priming (checked on both formats, CREDITS step 7).

## 4. The soundscape map

### 4.1 Per biome and station (coreloop 6.4)

| Biome / station | Bed (stereo) | Point loops | Event pool (rare, scheduled) | Placement |
|---|---|---|---|---|
| **Harbour** (start tableau, Bite, Lanterns pier, Beacon headland, Shutters houses) | `amb_night_air` + `amb_lake_lapping` (pier water, 60% width) | `amb_harbour_rope` (3 m front left), `amb_boat_far` (40 m right, far layer) | `sfx_foghorn_far` (once per session at most, never calm or rest), `sfx_chime_single`, `amb_wind_chimes` near the houses (Shutters) | water low front, rope left, boat far right, horn far left |
| **Fell, saddle, summit** (Fork cairn, summit ride) | `amb_wind_fell` (gain and brightness follow height) over `amb_night_air` | none | `sfx_ice_crack_*` far, `sfx_icicle_tinkle_*` | wide; wind opens as the figure climbs |
| **Shore** (Fork low branch, dawn coast) | `amb_shore_waves` | none | `sfx_ice_ping` (shore ice), `sfx_crane_call` at dawn | waves wider than the screen, slightly below |
| **Sauna** (Lantern Song in calm, Silk Pour) | outside: `amb_snowfall` + `amb_forest_birch`; inside the task: `amb_sauna_stove` | `amb_fire_crackle` (the stove, 1.5 m front low) | `sfx_loyly_hiss_*` (task driven), `sfx_stove_door` at open | interior is close and warm, the outside fades to -12 dB under it |
| **Birch forest and loom** (Aurora Loom, Joutsen clearing) | `amb_forest_birch` | none | `sfx_bird_great_tit_01` from stage s1 (it sings in a birch in Finland), `sfx_mote_twinkle_*` | birds up left or right |
| **Lake** (Firefly Fling reeds, harbour ice drift in rest) | `amb_lake_ice_night`, under it `amb_lake_under_ice` (-9) | none | `sfx_ice_ping`, `sfx_ice_crack_*`, `sfx_ice_boom_*` (never calm, rest) | ice below the horizon, booms far and low |
| **Bell tower** (Tower Chain) | `amb_wind_fell` at -14 + `amb_night_air` | none | `sfx_bell_church_far` once on approach as the far layer of the tower | tower front right, far, then the three task bells near |
| **Ride, everywhere** | `amb_ride_ski` (speed driven), `amb_ride_drag` when slow or braking | the Keeper, centre | `sfx_step_snow_*` (launch strides, porch), `sfx_ski_swish` (leap, dive, fast crest), `sfx_land_snow` (landing) | centre, close, dry |

### 4.2 Per stage of the colour return (concept 3.4)

Each stage adds one layer. Nothing is removed until dawn replaces the night stack.

| Stage | Adds | Stack at that moment (typical, harbour to fell) |
|---|---|---|
| s0 kaamos | only air, snow and water: `amb_night_air`, `amb_snowfall` (-8), the biome bed | air, snow, pier water; the lantern flame (`amb_fire_crackle` lowpassed to 900 Hz at -22, centre) |
| s1 first light (yellow) | warmth and wood: the sauna crackle as a point, the first single great tit far away (late winter song, it already sings in kaamos) | plus one bird phrase every 20 to 40 s |
| s2 blue hour (blue) | open water: `amb_shore_waves` or `amb_lake_lapping` rises, `sfx_ice_ping` and the far boat | plus water at full |
| s3 first green (green) | the forest: `amb_forest_birch`, chaffinch and blackbird phrases, `sfx_mote_twinkle` under the aurora | plus birds every 10 to 20 s |
| Kevat dawn | `amb_dawn_woodland` (robin, wind in woodland) crossfades in over 8 s under the sun; the bird scheduler goes to 4 to 8 s between phrases with all five Finnish species; `sfx_crane_call` once, far and high; `sfx_colour_swell` on the sun crest | night beds fall to -12, dawn bed and birds carry |

The colour wave (lookdev 7.3, mote home) plays `sfx_mote_gleam` at the lantern and a short `sfx_colour_swell` at -12 (the full swell is reserved for dawn).

## 5. Per task (minigames section 3)

| Task (mode) | Open | During | Hit / grade juice | Payoff and exit | Measurement rule |
|---|---|---|---|---|---|
| Kindle (core rest) | `sfx_flame_whoosh` at the flame catch (0.6 s), fixed | bed only, frozen | none | ring closes: `sfx_mote_gleam` at -16, identical every session | fixed sounds only |
| Check-in | none | bed frozen | `sfx_ui_tap_wood_01` on the tap | none | fixed |
| Bite (reaction core) | none | `amb_lake_lapping` frozen | catch: `sfx_ui_tap_wood_02` after the tap (never at the bite onset) | lighthouse ignites: `sfx_flame_whoosh` | fixed, no event scheduler |
| Launch | | | `sfx_step_snow_*` two strides, `sfx_ski_swish` on the leap, `sfx_land_snow` on landing | | |
| Fork (measurement) | `sfx_ui_tap_soft` | bed frozen | each stone: `sfx_ui_tap_wood_*` cycled in fixed order | reward: `sfx_mote_gleam` | fixed; same sounds both branches |
| Lanterns (measurement) | none | `amb_harbour_rope` frozen | tap: `sfx_ui_tap_wood_01` for both answers (no right or wrong sound) | constellation: `sfx_mote_twinkle_02` | fixed; no feedback sound may differ by answer |
| Breath, Lantern Song (calm) | `sfx_stove_door` at -16 | `amb_sauna_stove`; inhale: the stove bed rises 3 dB and opens to 5 kHz over 4 s; exhale: falls over 6 s (6 per minute, Decision 13) | a landmark lights: `sfx_chime_single` | `sfx_colour_swell` at -12 | the pacing follows the fixed 4 s in, 6 s out |
| Breath (rest, drift) | none | `amb_lake_ice_night` lowpassed 2.5 kHz, `amb_shore_waves` at -14; each exhale ring: nothing new, the bed breathes 2 dB | none | night end: `sfx_mote_gleam` per lit window at -18 | no events at all in rest |
| Loyly, Silk Pour (calm) | `sfx_stove_door` | `amb_sauna_stove` + `amb_fire_crackle` | pour on a stone: `sfx_loyly_hiss_01` or `_02` at -6, panned to the stone; perfect pour: `sfx_loyly_hiss_long`; stall: a second hiss at -12 | the sauna window glows: the stove bed stays 2 dB up for the session (an Answer that stays) | |
| Threads, Aurora Loom (flow) | | `amb_forest_birch` | strand connects: `sfx_mote_twinkle_*` | strands rise: `sfx_colour_swell` at -12 | |
| Stars, Joutsen (flow) | | `amb_forest_birch` at -8, `amb_night_air` | star linked: `sfx_icicle_tinkle_*` at -14, pitch up a step per star via `playbackRate` | swan complete: `sfx_mote_twinkle_02` | |
| Fireflies, Firefly Fling (wake) | | `amb_lake_ice_night` | catch: `sfx_mote_twinkle_01` at the jar; combo tiers add `sfx_icicle_tinkle` | light column: `sfx_colour_swell` at -10 | |
| Beacon, Harbour Beat (wake, fatigue) | | harbour stack | on-beat hit: `sfx_ice_ping` (bright, short) at -10; perfect adds `sfx_chime_single` | `sfx_foghorn_far` answers from the horizon once | the beat itself belongs to the music brief |
| Bells, Tower Chain (wake, fatigue) | `sfx_bell_church_far` on approach | wind | the three bells are `sfx_bell_hand_1` to `_3` (left, centre, right). Pitches were not measured: tune them by ear to three notes of the music's pentatonic scale with `playbackRate` | lit lane: `sfx_colour_swell` | no wrong-bell sound: a wrong tap replays the sequence (GameDesign) |
| Shutters, Wake the House (fatigue) | | harbour + `amb_wind_chimes` at -20 | window opens: `sfx_ui_tap_wood_03` plus one bird phrase from that window | daylight: `sfx_colour_swell` | |
| Give the light (dawn) | | dawn stack (4.2) | while held: the dawn bed rises 1 dB per second up to its target | sun clears the fell: `sfx_colour_swell` full, `sfx_crane_call` 2 s later | |
| End | | dawn stack falls 6 dB | `sfx_ui_tap_wood_01` on the lantern tap | fade all over 3 s | |

## 6. Per director mode (the same beds, moved like Endel)

The mode never changes the biome's sound, it changes how it is heard: one lowpass and one high shelf on the amb bus, the event density, and the bed width. Changes glide over 4 to 8 s and are committed with the director's Answer (vitals-ux 3.2), never mid-measurement.

| Mode | Bus lowpass | High shelf (8 kHz) | Event density | Width | Extra layer | Never |
|---|---|---|---|---|---|---|
| calm (high pulse) | 6 kHz | -3 dB | half; birds only far | 100% | `amb_sauna_stove` or `amb_fire_crackle` warmth at -14 even outside the sauna; slower swells in the beds (gain LFO 0.1 Hz, 1.5 dB) | ice booms, foghorn, church bell, fast transients |
| flow (neutral) | 12 kHz | 0 | normal | 100% | none | |
| wake (low pulse) | 16 kHz (open) | +2 dB | 1.5x; ice pings and chimes brighter and nearer | 110% | `amb_wind_fell` gust layer at -14 | loud events in the first 30 s |
| fatigue (eyes closing) | 16 kHz | +3 dB | 2x birds (the dawn chorus starts early, a daylight lift from the horizon) | 110% | `amb_dawn_woodland` at -14 before dawn, rising | sudden events: still only bed + 6 LU |
| rest (night fallback) | 2.5 kHz | -6 dB | none | 80% | `amb_shore_waves` far, `amb_night_air` only | every event; birds (it is night) |

## 7. Second-by-second cue sheet (good morning, coreloop 7.1)

| t (s) | Cue |
|---|---|
| 0.0 | amb bus fades from 0 over 3 s to: `amb_night_air` -2, `amb_lake_lapping` -10, `amb_harbour_rope` -14, `amb_snowfall` -8 |
| 0.6 | `sfx_flame_whoosh` -12 (flame catches), lantern flame point starts (fire crackle lowpassed, -22, centre) |
| 2.0 to 24.5 | stack frozen (Kindle, check-in, Bite); catch taps only |
| 24.5 | `sfx_flame_whoosh` -8 at the lighthouse |
| 26.1 to 27.4 | two `sfx_step_snow`, `sfx_ski_swish`, `sfx_land_snow`; `amb_ride_ski` starts with speed |
| 29.0 to 32.2 | harbour beds crossfade to `amb_wind_fell` over 3 s as the slope rises |
| 30.2 to 50.6 | stack frozen (3 s before Fork to its fold) |
| 51.0 | ride; scheduler resumes; at 52.0 the loom rises: `amb_forest_birch` fades in |
| 55.6 to 66.0 | Threads in the birch bed |
| 68.4 | mote home: `sfx_mote_gleam`, blue wave: water layer rises |
| 69.6 to 91.4 | frozen from 3 s before Lanterns to its fold; pier water and rope |
| 91.4 to 102.0 | summit ride, `amb_wind_fell` rising with height |
| 102.0 to 110.0 | dawn stack (4.2): `amb_dawn_woodland` over 8 s, birds 4 to 8 s apart, `sfx_colour_swell` on the crest, `sfx_crane_call` once |
| 110.0 to 114.1 | end, everything falls 6 dB, then fades over 3 s at close |

Night (coreloop night timeline): no birds, no dawn bed; the drift sits on `amb_lake_ice_night` (lowpassed) and far waves; the night end lights windows with `sfx_mote_gleam` at -18; `fell_asleep` fades everything over 8 s.

## 8. Level table (starting values, tune on headphones)

All values are in `demo/audio/manifest.json` (`lufs`, `truePeak`, `gainDb`). Files measured after processing.

| File | Kind | Ch | Length s | File LUFS | Start gain dB |
|---|---|---|---|---|---|
| amb_night_air | loop | 2 | 45.0 | -23.0 | -2 |
| amb_snowfall | loop | 2 | 50.0 | -23.1 | -8 |
| amb_wind_fell | loop | 2 | 50.0 | -23.0 | -10 (up to -4 on the summit) |
| amb_forest_birch | loop | 2 | 50.0 | -23.0 | -4 |
| amb_lake_ice_night | loop | 2 | 50.0 | -23.0 | -6 |
| amb_lake_under_ice | loop | 2 | 60.0 | -23.0 | -9 |
| amb_shore_waves | loop | 2 | 60.0 | -23.0 | -5 |
| amb_lake_lapping | loop | 2 | 50.0 | -23.0 | -10 |
| amb_harbour_rope | point loop | 1 | 62.0 | -26.8 | -14 |
| amb_boat_far | point loop | 1 | 40.0 | -23.0 | -20 |
| amb_sauna_stove | loop | 2 | 50.0 | -23.0 | -3 |
| amb_fire_crackle | point loop | 1 | 45.0 | -23.2 | -10 (lantern use -22) |
| amb_dawn_woodland | loop | 2 | 60.0 | -23.0 | -3 |
| amb_ride_ski | loop | 2 | 40.0 | -23.0 | -18 at rest to -6 at top speed |
| amb_ride_drag | point loop | 1 | 8.5 | -23.0 | -14 |
| amb_wind_chimes | loop | 2 | 50.0 | -23.1 | -20 |
| sfx_step_snow_01 to 04 | one-shot | 1 | 0.65 | -18.8 to -22.4 | -10 |
| sfx_ski_swish | one-shot | 2 | 2.4 | -18.0 | -8 |
| sfx_land_snow | one-shot | 1 | 0.86 | -33.1 | -2 |
| sfx_ice_ping | one-shot | 1 | 0.89 | -38.0 | -4 |
| sfx_ice_crack_01 to 03 | one-shot | 1 | 1.8 | -22.3 to -25.5 | -10 |
| sfx_ice_boom_01, 02 | one-shot | 1 | 3.0, 2.5 | -18.0 | -14 |
| sfx_icicle_tinkle_01, 02 | one-shot | 1 | 2.2, 2.4 | -23.5, -30.4 | -10 |
| sfx_loyly_hiss_01, 02 | one-shot | 1 | 7.5, 8.0 | -18.8, -24.5 | -4 |
| sfx_loyly_hiss_long | one-shot | 1 | 16.0 | -18.0 | -6 |
| sfx_stove_door | one-shot | 1 | 7.6 | -24.1 | -12 |
| sfx_bell_hand_1 to 3 | one-shot | 1 | 6.2 to 7.4 | -18.8 to -27.0 | -6 (balance by ear) |
| sfx_bell_church_far | one-shot | 1 | 6.2 | -23.0 | -10 |
| sfx_chime_single | one-shot | 1 | 3.4 | -19.7 | -12 |
| sfx_mote_twinkle_01, 02 | one-shot | 1 | 6.0 | -27.9, -23.8 | -10 |
| sfx_mote_gleam | one-shot | 1 | 3.6 | -18.4 | -12 |
| sfx_colour_swell | one-shot | 2 | 10.0 | -18.0 | -6 (dawn), -12 (colour wave) |
| sfx_flame_whoosh | one-shot | 2 | 4.0 | -18.9 | -8 |
| sfx_foghorn_far | one-shot | 1 | 7.2 | -18.0 | -16 |
| sfx_crane_call | one-shot | 1 | 11.8 | -18.6 | -12 |
| sfx_ui_tap_soft | one-shot | 1 | 0.2 | -22.4 | -14 |
| sfx_ui_confirm | one-shot | 1 | 1.7 | -31.7 | -10 |
| sfx_ui_tap_wood_01 to 03 | one-shot | 1 | 0.36 | -23.8 to -25.9 | -8 |
| sfx_bird_great_tit_01, 02 | one-shot | 1 | 2.8, 2.6 | -18.0 | -12 |
| sfx_bird_chaffinch_01, 02 | one-shot | 1 | 3.0, 3.1 | -18.0 | -12 |
| sfx_bird_blackbird_01 to 03 | one-shot | 1 | 2.2 to 2.6 | -18.0 | -14 |
| sfx_bird_redstart_01, 02 | one-shot | 1 | 2.5, 1.8 | -18.0 | -14 |
| sfx_bird_willow_warbler | one-shot | 1 | 8.4 | -18.0 | -14 |

Short transients (steps, taps, pings, cracks) measure low in LUFS because their gain stops at -1.5 dBTP instead of being limited; they still sound present because loudness meters average over 400 ms. Mix them by ear, not by the LUFS column.

Variation: every one-shot plays with a random `playbackRate` of 0.94 to 1.06 and a random gain of plus or minus 1.5 dB, and no file repeats twice in a row (Tetris bag from minigames 0.1), so a 2-minute ritual never sounds copied.

## 9. Contract with the music (Suno) brief

- **Frequency split:** music owns the warm middle (pads, piano, low strings 150 Hz to 4 kHz); ambience owns the edges (air above 4 kHz, water and wind wide, birds above). When music plays, the amb bus gets a gentle 2 dB dip at 300 to 2,000 Hz (a peaking filter, not a ducker), so nothing pumps.
- **Space split:** music is centred and narrow to medium; ambience is wide and around. Neither uses hard pans.
- **Who leads when:** core and measurement windows: ambience only or music at a steady level, no changes. Ride: music leads, ambience supports. Calm and rest: ambience leads, music thins or stops. Dawn: both rise; the birds and the crane are the payoff, so the music leaves room at 3 to 6 kHz there.
- **Key:** tune the handbells to the music's pentatonic scale (D major pentatonic in today's `audio.js`); all ambience is unpitched or sits outside the key centre, so it never clashes.
- **Levels:** music mastered to -18 LUFS, played on the music bus at -4 dB; ambience as in section 8; whole mix -20 LUFS.

## 10. What is still missing (with exact search links)

| Gap | Why it matters | Where to look (CC0 first; check each license) |
|---|---|---|
| **Redwing (Turdus iliacus)** song, Nordic species asked for | Freesound has no CC0 redwing (its "redwing" hits are the American red-winged blackbird). Commons has redwing only under CC BY-SA (for example https://commons.wikimedia.org/wiki/File:Turdus_iliacus_-_Redwing_XC538936.mp3); xeno-canto is mostly BY-NC-SA, which is excluded | https://freesound.org/search/?q=Turdus+iliacus&f=license%3A%22Creative+Commons+0%22 and https://freesound.org/search/?q=rodvingetrast ; if David accepts CC BY-SA for one bird, the Commons file above needs attribution and share-alike on that one file |
| **Original-quality files** | All Freesound files here are built from 192 kbps previews; the quiet recordings got +15 to +28 dB | Log in to Freesound and download each original from the URLs in `CREDITS.md`, then re-run the recipe |
| **Lantern flame flutter loop** (a close, soft, steady flame) | The CC0 candle found (freesound 680476) measured -64 LUFS, mostly noise; today the fire crackle lowpassed stands in | https://freesound.org/search/?q=oil+lamp+flame&f=license%3A%22Creative+Commons+0%22 , https://freesound.org/search/?q=torch+flame+loop&f=license%3A%22Creative+Commons+0%22 , https://pixabay.com/sound-effects/search/flame/ |
| **Bite catch sound** (small water plip, float) | Today the catch uses a wooden tap; a water plip fits the pier better (after the tap only, never at the bite onset) | https://freesound.org/search/?q=water+drop+plip&f=license%3A%22Creative+Commons+0%22 , https://pixabay.com/sound-effects/search/water%20drop/ |
| **Boat hull or pier knock** (wood against water) | The harbour has rope and a far motor, not the knock of moored boats | https://freesound.org/search/?q=boat+hull+knocking&f=license%3A%22Creative+Commons+0%22 |
| **Snow falling from branches** (soft flump) | A lovely rare event for the birch forest and fell | https://freesound.org/search/?q=snow+falling+from+tree&f=license%3A%22Creative+Commons+0%22 |
| **A Finnish wooden bell tower or church bell** (kellotapuli) | The church bell here is Dutch (Enkhuizen); a single Finnish strike would be truer | https://freesound.org/search/?q=church+bell+Finland&f=license%3A%22Creative+Commons+0%22 , https://freesound.org/search/?q=kirkonkello |
| **Reeds and dry grass in wind** for the fireflies station | The lake beds have ice and water, not reeds | https://freesound.org/search/?q=reeds+wind&f=license%3A%22Creative+Commons+0%22 |
| **Sonniss GDC bundles** | Royalty-free, very high quality, but tens of GB, so not downloaded; check the license text in each year's zip (the newest ones forbid AI training) [S9] | https://gdc.sonniss.com/ (pick nature, winter, fire, water and UI packs) |
| **Pixabay sound effects** | Allowed by the Pixabay Content License (no attribution, no standalone redistribution) [S10]; its download page needs a browser, so nothing was taken from it | https://pixabay.com/sound-effects/search/sauna/ , https://pixabay.com/sound-effects/search/snow%20footsteps/ , https://pixabay.com/sound-effects/search/frozen%20lake/ |
| **Listening pass** | Files were chosen from ratings, tags, loudness profiles and seam checks, not by ear. Audition each on headphones; replace any with traffic, voices or hum | the 61 entries in `CREDITS.md` |
| **Bell pitches** | Not measured; tune by ear (section 5) | |

## 11. Acceptance tests

- **A1 Seams:** every loop played for 3 minutes on iPhone (m4a) and Android (ogg) has no click or gap (CREDITS step 7 already passes offline).
- **A2 Measurement:** in an autoplay run, no event starts between Begin and the end of Bite, and none from 3 s before Fork or Two lanterns until their fold. Log every event with `t`, file and level.
- **A3 Loudness:** a 2-minute capture of the good-morning session measures -20 plus or minus 2 LUFS integrated, true peak at most -1 dBTP; no event exceeds the bed by more than 6 LU short-term.
- **A4 Devices (Sky):** listen on AirPods, wired earbuds and the phone speaker. On the speaker, birds and water must still read; on headphones nothing may sit in one ear only.
- **A5 Rest:** in rest, zero events fire and the bus lowpass is at 2.5 kHz.
- **A6 Memory:** at most 5 beds decoded at once; heap stays under 150 MB of audio on an iPhone 12.

## 12. Changes needed elsewhere (for the orchestrator)

- `demo/js/audio.js` (audio owner): add a sample layer (buses in 3.1, manifest loader, loop points, HRTF point sources, event scheduler with the pause rule). Keep the current procedural piano as the fallback when files fail to load.
- `Decisions.md`: X28 reopened by David on 14 Nov 2026; Decision 31 holds (no fail sounds, no sudden sounds, a voice per colour) and is extended by this file.
- `GameDesign.md` 0.1 timeline "One piano note, sound fades in to a fixed low level": now the bed fades in with the piano note.

## 13. Sources

- [S1] Alto's Odyssey sound: The Next Web, "How Alto's Odyssey transports players to a whole new world" (5 Mar 2018), https://thenextweb.com/news/how-altos-odyssey-transports-players-to-a-whole-new-world ; The Ongaku on Todd Baker's audio video series, https://www.theongaku.com/posts/altos-odyssey-the-lost-city-original-game-soundtrack ; Todd Baker on interactive audio as a whole (Monument Valley 2), https://blog.audiokinetic.com/behind-the-beautiful-sound-of-monument-valley-2-with-todd-baker/
- [S2] Steve Johnson, "The sound design of Journey", Game Developer, https://gamedeveloper.com/audio/the-sound-design-of-i-journey-i- ; Designing Sound Q and A with the Journey audio team, https://designingsound.org/2012/02/28/qa-with-the-audio-team-of-journey/
- [S3] FMOD, Sky: Children of the Light interview (Vincent Diamante, Ritsu Mizutani), https://www.fmod.com/blog/sky-children-of-the-light-interview
- [S4] Audiokinetic, "Rain and Terrain: How Animal Crossing New Horizon's Audio Design helps even the Totally Blind", https://www.audiokinetic.com/en/blog/animal-crossing-is-playable-by-the-totally-blind
- [S5] Endel technology page, https://endel.io/technology ; Endel help, Daily Energy Cycles, https://endel.zendesk.com/hc/articles/360014891500 (company claims, not independently verified)
- [S6] Designing Sound, "Video games and loudness standards: interview with Sony's Garry Taylor" (2012), https://designingsound.org/2012/07/30/video-games-and-loudness-standards-interview-with-sonys-garry-taylor/ ; Audiokinetic, "Mastering a game with Wwise, part 1", https://audiokinetic.com/en/mastering-a-game-with-wwise-part1
- [S7] GANG IESD Mix Reference Levels v03.02, https://www.audiogang.org/wp-content/uploads/2015/04/IESD-Mix-Ref-Levels-v03.02.pdf
- [S8] MDN, PannerNode.panningModel, https://developer.mozilla.org/docs/Web/API/PannerNode/panningModel ; MDN, Web audio spatialization basics, https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Web_audio_spatialization_basics
- [S9] Sonniss GDC bundle coverage: https://gamefromscratch.com/sonniss-27-5gb-sound-effect-giveaway-at-gdc-2024/ , https://rekkerd.org/sonniss-releases-gdc-2026-game-audio-bundle/
- [S10] Pixabay Content License summary, https://pixabay.com/service/license-summary/
- Freesound terms (license applies per sound), https://freesound.org/help/tos_web/
- Calm and Headspace: no source was fetched (the session's web search budget ran out); the pattern in section 1 comes from the apps themselves and should be checked before it goes into a pitch.
