# Lantern Myth: design concept for Afferent

Status: concept proposal (creative director, 14 Nov 2026). Nothing here overrides `ArtBible.md`, `DesignSystem.md` or `design/lookdev.md` until the orchestrator adopts it. Board: `board.html` / `board.png` in this folder. Images: `art/raw/concept/concept_lm_*.png`. Generation plan with every prompt: `plan.json` (run with `python3 art/generate.py --plan design/concept/lantern-myth/plan.json --only <name>`).

## 1. Story (told without words)

Every winter the sun sinks behind the fells and stays down for weeks. The islanders say it does not die. It sleeps, and a little of it is kept. Each morning a small hooded Keeper wakes in the dark with a lantern that holds one ember of the sleeping sun.

You are the Keeper. You walk the island once. At each waystone (an old coastal cairn) you give a little of the ember away, and the birches take its gold, the ice its blue, the sky its green. At the end you lift the lantern to the horizon and the sun answers. You set one small lantern on the far shore. Spring does not come in one morning. It comes in many.

Five beats per session: **Ember** (wake, the lantern catches), **Way** (the walk, the tower on the horizon), **Rites** (the minigames), **Handover** (dawn: the flame hands its job to the sun and to the bedside lamp), **Shore** (quote, mood, a lantern placed; this is the streak). Over weeks the sun climbs higher and the shore fills: the arc of the months after TMS, told as light coming back in many mornings. Claims: a gentle morning ritual, supportive, never a treatment.

## 2. Principles

1. **You carry the only light.** The unlit world is cyanotype blue; only what the lantern or sun touches has warm, true colour.
2. **Give light, get colour.** Each finished rite sends light out and the world keeps it. A miss only slows the glaze.
3. **Myth, not menu.** The painting is the interface. UI is quiet type over open sky; rites play inside a circle of lantern light, not in a panel.
4. **Small figure, big world.** One warm focal point, at least 40% open sky in portrait, Keeper at 1/6 to 1/12 of frame height.
5. **Slow is sacred.** Breath speed (4 s in, 6 s out), nothing above 3 Hz, no brightness jumps, dawn earned and never blinding.
6. **Every morning is kept.** Shore lanterns never go out; the streak has no loss state, no guilt, no red.
7. **Google-clean on top.** Material 3 roles, one UI family, 8 dp grid, 48 dp targets, 4.5:1 text contrast.
8. **Supportive, never clinical.** No scores, diagnoses, faces or words in art.

## 3. Palette and roles

| Group | Name | Hex | Role |
|---|---|---|---|
| Night | Abyss | `#0B1A33` | Deepest sky, silhouettes, icon ground |
| Night | Prussian | `#14294D` | Night sky body; M3 night neutral seed |
| Night | Cyanotype | `#2B4C7E` | Far fells, night land mid-value |
| Night | Dusk blue | `#6F8FB8` | Fog, distant islands; M3 secondary seed |
| Night | Frost | `#D6E2F0` | Snow caps, starlight, text on art |
| Light | Ember | `#F4B740` | The flame; M3 primary seed; Begin, streak, progress |
| Light | Honey | `#FFD58A` | Glaze light, halos, colour-return front |
| Light | Glow | `#FFE3A6` | Sun limb, lantern core; value ceiling (never white) |
| Light | Apricot | `#F6A77A` | Dawn rims; replaces M3 error (no red); ember keep |
| Light | Keeper indigo | `#1E2A55` | The cloak; the mark on light grounds |
| Returned | Birch cream | `#EFE6D2` | 1st rite (yellow group); M3 dawn neutral seed |
| Returned | Ice | `#9FD3EA` | 2nd rite (blue group) |
| Returned | Aurora teal | `#4FD1C5` | 3rd rite (green group); M3 tertiary seed |
| Returned | Lichen | `#8FB08A` | 3rd rite (green group): moss, lit spruce |

**Cyanotype grade** (the signature): night is not grey. One gradient-map pass maps luminance onto Abyss to Frost (`#0B1A33 #14294D #2B4C7E #6F8FB8 #D6E2F0`) and is mixed with the painted local colour per colour group; the mix mask is the lantern's light radius, so colour spreads from the flame. It slots into the existing grade pass in `lookdev.md` 3.3 (stage 0 uses the duotone instead of saturation 0.05). Night frame: about 90% blue, at most 7% warm.

## 4. Typography (OFL, bundled in `fonts/`)

- **Cormorant Garamond** (OFL, Cormorant Project): the myth voice. "Good morning.", "Rest well.", the streak numeral (500, lining figures), the quote after a session (italic 400), patient-view headlines, the wordmark. Only at 24 px and above, never on a control.
- **Google Sans Flex** (OFL, the Material 3 face): every button, label, body line and UI number. M3 scale: title-l 22/28, title-m 16/24 500, body-l 16/24, body-m 14/20, label-l 14/20 500, label-s 11/16 600 caps.
- JetBrains Mono (existing) only for clinician tables and debug.

## 5. Shape language

Ember drop (flame, hood, mote, progress mark), the Keeper (an ember drop on a bell, the only moving vertical), horizon arc (long, low, calm), ring of light (halos, ripples, approach rings, rite frames), cairn (stacked round stones that keep a light once lit). UI radii: chip 8, card 16, sheet 28, buttons full pill. No hard angles, spikes, bevels or outlines; borders 1 px at 12% Frost. Forbidden: red, faces, words or runes in art, glossy 3D, neon.

## 6. Illustration

Matte gouache with oil pastel on toned paper, two lights per frame. Key art paints light in; in-game layers keep the ArtBible v3 rule (local colour at middle value, no light sources) and get the cyanotype grade and lantern pool in code. Value: night frame mean luminance under 0.18, lantern pool 0.5 to 0.7, Glow is the ceiling. Composition: horizon at 55 to 65% in portrait, Keeper on a third, the tower on the right horizon. World: granite fells, Bronze Age coastal cairns (hiidenkiuas), birch, lake ice, sauna, harbour, the tower; no borrowed sacred motifs.

Reusable STYLE prompt and KEEPER description: `plan.json` keys `style` and `keeper` (v3; `style_v1`, `keeper_v1`, `keeper_v2` kept for the record). Lesson: "soft tip that droops backward" (v2) produced gnome hats; "a deep, close-fitting hood like a monk's cowl that rises to a short, soft rounded point" (v3) fixed it. Speckle grain in v1 skies was fixed by "skies are smooth, softly blended gradients".

## 7. UI theme on Material 3

Two schemes from `material-color-utilities` DynamicScheme (tonal spot): primary from Ember (chroma 56), secondary from Dusk blue (22), tertiary from Aurora teal (34), neutrals from Prussian (night, chroma 14) and Birch cream (dawn, chroma 8); the error palette is remapped to Apricot so no red exists. Files: `m3-theme.css` (all `--md-sys-color-*` roles for `[data-scheme="night"]` and `[data-scheme="dawn"]`), `m3-scheme.json` (roles plus tonal palettes).

- **Night** is the default (dark room): start, check-in, rites. Key roles: primary `#ffba29`, on-primary `#422c00`, surface `#0d1321`, surface-container `#19202d`, on-surface `#dce2f5`.
- **Dawn** takes over at the handover: end screen, quote, patient view. Primary `#7d5800`, surface `#fff8ef`, surface-container `#f6edda`, on-surface `#1f1b10`.
- The UI itself turns from night to dawn (2 s crossfade after the sun crests).
- Components: filled pill Begin (56 dp), text button Not today in the same row, streak block in the open sky (numeral, label, week row), assist chip "13 mornings kept", mood lanterns (5 ordinal circles, existing mood tokens), quote card, M3 navigation bar in the patient view (Today, Week, Settings), segmented session length. Icons: Material Symbols Rounded, weight 300, filled only when selected. Text over art sits on a gradient veil (Abyss 0 to 85%), never in a box over the sky.

## 8. Motion

M3 easing for UI (emphasized `0.2, 0, 0, 1`; emphasized decelerate `0.05, 0.7, 0.1, 1`; accelerate `0.3, 0, 0.8, 0.15`) plus five signature moves, matching `lookdev.md` timings:

| Move | Timing | What |
|---|---|---|
| Strike | 600 ms, back-out 1.15 | The ember catches, 6 sparks, one light haptic; the world is revealed by the light radius |
| Send and home | 650 ms decelerate; fold 380 ms | A mote leaves the lantern to open a rite; at the end the rite folds into a mote and arcs home |
| Glaze | 2400 ms, `0.65, 0, 0.35, 1` | Colour returns as a radial wave from the flame, honey front at 10%, never a ring outline |
| Breath | 4 s in, 6 s out | Aurora, fog and the Keeper on one pacer |
| Handover | 8 s | Sun crests; flame to 35%; UI scheme night to dawn over 2 s; bedside lamp follows |

Streak count-up rolls the digit in 600 ms (emphasized). Reduced motion: fades instead of travel, parallax halved, particles under 0.2 screen per second. Session timeline (about 2 min): Ember 0 to 8 s, check-in, catch (core rite), way and three rites (gold, blue, green), handover 8 s, shore.

## 9. Streak: "Mornings kept" (Duolingo, made kind)

Taken from Duolingo: the count on the home screen, a week row, a freeze, milestones, a perfect-week ring, a daily reminder (the bedside light is the reminder). Changed: the freeze is an **ember keep**, earned by three mornings in a week and used silently (that day shows an apricot ember dot); a broken streak shows no loss screen, the number restarts at 1 and the shore keeps every lantern; milestones 3, 7, 14, 30, 60, 100 light a landmark on the far shore (cairn fire, birch grove lanterns, the tower) instead of a badge. **Conflict:** `DesignSystem.md` rule 3 and `minigames.md` still say "no streaks"; this concept assumes the new request wins and needs an orchestrator decision.

## 10. Logo and app icon

- **Mark** (`concept_lm_mark.svg`): the Keeper glyph, an ember-drop hood flowing into a bell cloak, a hood opening in deep shadow (`--hood-shadow`, never a face), a staff and one Ember lantern dot. One colour plus the dot; favicon, notification icon, bedside-lamp engraving.
- **Wordmark**: "Afferent" in Cormorant Garamond 500, tracking +2%, mark to the left.
- **App icon** (`concept_lm_icon.svg`, production, flat vector): Abyss to Cyanotype field, a Glow to Apricot dawn half-disc rising behind a dark hill arc, the Keeper silhouette on the hill, the lantern as the single brightest pixel. Holds at 29 px. Painted variant `concept_lm_icon_b.png` for store art and splash.

## 11. Bedside light

The lamp is the Keeper's lantern in the room. Wake-up dawn starts 20 min before the wake time: 1% Ember, then Ember 8% (-12 min), Honey 25% (-5 min), Glow to daylight `#FFF3DC` 60% at wake. At the in-game handover the lamp follows the game sun (existing `bedside.dawn_morning`).

## 12. What makes it unique

A cyanotype night with one gold flame, where colour literally spreads from the lantern; rites inside a circle of lantern light instead of panels; a myth of the kept ember that mirrors the slow months after TMS; a streak that is a shore of lanterns that never go out; a UI that itself turns from night to dawn; a Keeper glyph that is a flame and a figure at once.

## 13. Image set

| File | Quality | Verdict |
|---|---|---|
| `concept_lm_hero_hi2.png` (1536x1024) | high | Hero key art. Best image. Tower lamp came out lit (asked dark): acceptable as "the tower answers" |
| `concept_lm_dawn_hi2.png` (1024x1536) | high | Night-to-dawn handover. Strong diagonal colour front, sun is a honey arc |
| `concept_lm_start_b.png` (1024x1536) | medium, regen 1 | Start style frame, empty sky and ground for UI, row of shore lanterns. Still a little ultramarine |
| `concept_lm_game_stars.png` (1024x1536) | medium | Joutsen rite: gold thread, swan constellation. Keeper slightly large |
| `concept_lm_game_breath.png` (1024x1536) | medium | Lantern Song rite: ring of light waking the ice |
| `concept_lm_keeper_sheet_b.png` (1536x1024) | medium, regen 1 | Keeper turnaround on toned paper (hood still a bit pointed: use v3 keeper text for production) |
| `concept_lm_icon_b.png` (1024x1024) | medium, regen 1 | Painted icon variant (disc still slightly orange) |
| Rejected: `concept_lm_hero`, `_dawn`, `_start`, `_icon`, `_keeper_sheet` (v1), `_hero_hi`, `_dawn_hi` (gnome-hat hood) | | Kept for the record |
