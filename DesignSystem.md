# Afferent design system

One design system for the game, the patient view, the clinician dashboard and the bedside light. Look and feel come from `design/concept.md` ("Layers of Light"), which wins wherever this file is unclear. Source of truth for values: `design/tokens.json`. `design/tokens.css` exposes the same values as CSS custom properties (`--af-*`) and loads the bundled fonts. Change both files together (contract agent owns them; ask in STATUS.md if you need a new token). The GUI system roles (`--md-sys-color-*`) are generated into `design/gui-tokens.*` and never hand-edited (`design/gui.md` 3.3).

Use it:

- Game and patient view (`demo/`): `<link rel="stylesheet" href="design/tokens.css">`. Served from the hub at `/app/design/`; inside the Capacitor bundle from `demo/design/` (copied by `npm run design` before `npx cap sync ios`).
- Dashboard: `<link rel="stylesheet" href="/design/tokens.css">`. Light (Kevät) by default; the dark setting sets `data-clinic-scheme="dark"` on `<html>`, which swaps every `--af-clinic-*` value to Kaamos.
- Canvas code (world.js, charts): read colours from `tokens.json` (`fetch('design/tokens.json')`) or from CSS with `getComputedStyle(document.documentElement).getPropertyValue('--af-light-glow')`. Do not invent new hex values in code; if you need one, add it here first.
- Bedside light: the hub reads `bedside` from `tokens.json`.

## 1. Feeling

Two minutes in bed that bring the morning to you. You wake in kaamos, the blue polar night, holding the only warm light; each small task bends one more layer of light into the land until the sun comes over the fell and the bedside lamp rises with it. Mornings stack up the way bent birch does. The dashboard is the same world seen by a professional in daylight: light, quiet, precise, readable in 10 seconds.

**Designed for the person lying down.** The six principles (concept section 2) are the rules for everything:

1. **Designed for lying down.** Content in the upper two thirds, every primary control in the lower third thumb arc, nothing important in the top 15% at first wake, light sources enter from the side, no screen brighter than its scene, transitions silent, haptics before sound.
2. **One light per screen.** Sun yellow `#F2C230` marks the single thing that matters now (the lantern flame, the hold control, today). A night frame is about 70% blue and about 1% sun.
3. **One curve per screen.** The free wave appears once per screen (a shoreline, a sheet's top edge, the streak glyph, the ribbon in the mark); everything else is plain Material 3 geometry.
4. **Layers, not scores.** No red, no scores, no fail states, no 0 or 1, no "in a row". No streak number in the game or the patient view (the patient view shows "Mornings lit"); the only streak number is the small mornings chip on the start screen (06:00 to 21:00, from 2) and its end-screen tick (Decisions D1, `design/engagement.md` section 6), styled as in concept 12.
5. **Colour is earned.** Kaamos is blue monochrome; colour spreads outward from the lantern in the fixed order yellow, blue, green, dawn, eased over seconds (`dur-colour-return` 4 s, `dur-mode-style` 2 s), and never goes back.
6. **Matte and honest.** Birch, plaster, wool. Flat shapes, ply-line edges, smooth skies. No gloss, no neon, no photoreal, no generated glow (light comes from code).

Simulated data is always labelled with the `.af-simulated` badge ("SIMULATED").

## 2. Colour

Pigments (`color.pigment`, CSS `--af-<name>`), the only colours anyone draws with:

| Token | Hex | Role |
|---|---|---|
| `fjord` | `#0E1A2E` | Night base, dark surfaces, sky top in kaamos |
| `kaamos` | `#1E3150` | Brand colour and M3 seed, icon field, the world before colour |
| `frost` | `#9DB9CC` | Cold light, far fells, muted text on night, the freeze rim |
| `lilac` | `#B4A6CE` | Blue hour band, measure tasks |
| `birch` | `#F2EEE6` | Snow, text on night; the brightest value at night |
| `ply` | `#E2C79C` | Lamination, the Keeper's cloak, frames, Kevät secondary |
| `ply-edge` | `#B48E5C` | Lamination lines, dividers on warm surfaces |
| `sun` | `#F2C230` | The one light: lantern flame core in UI, primary action, today |
| `honey` | `#FFD58A` | Glow, the dawn sun disc, glaze light |
| `apricot` | `#F3A57A` | Dawn horizon, gentle attention, M3 error role in the game (never red) |
| `ice` | `#8FC6E0` | Blue group (ice, sea), wake mode |
| `spring` | `#9DBE8C` | Spring, tertiary, "steady" |
| `spruce` | `#2F4A48` | Green group (spruce, moss) |
| `ceiling` | `#C8D6BE` | Calm wash for breath and löyly, calm mode |
| `granite` | `#8A8F9C` | Stones, cairn, tower base |

Lights (`color.light`, CSS `--af-light-*`), emissive, drawn in code only and never painted into transparent art:

| Token | Hex | Use |
|---|---|---|
| `light-ember` | `#FFB54A` | Lantern at idle (`V.ignite 0.15`), far-shore lights core |
| `light-flame` | `#FFE3A6` | Lantern flame core; the brightest value at night |
| `light-glow` | `#FFD58A` | Lantern pool, bloom, mote trails |
| `light-aurora-hem`, `light-aurora-tip` | `#5FE3A1`, `#8FC6E0` | Aurora hem to tips (additive) |
| `light-sun-disc`, `light-sun-limb` | `#FFD58A`, `#FFE3A6` | Dawn sun; never white |
| `light-daylight` | `#FFF0D2` | Bedside at full dawn, fatigue daylight lift |

Every warm light is honey or amber; nothing in the orange-red range is ever emitted. Retired (kept in the JSON for one build, then deleted): `dawn-coral`, `dawn-coral-soft`, `violet-*`, `silver-*` (silver-300 to frost, silver-100 to birch), `aurora-teal*`, `night-*` (950/900/850 to fjord, 600/500 to kaamos). `lantern-flame` and `lantern-glow` now carry the light values.

Material 3 schemes (`color.kaamos`, `color.kevat`, CSS `--af-kaamos-*`, `--af-kevat-*`; full sets and measured contrast in `design/concept/final/theme.json`): **Kaamos** (dark, surface `#0D182A`, on-surface `#E8EEFF`, primary sun `#F2C230` on `#3E2E00`) from the start screen to the dawn handover; **Kevät** (light, birch paper `#FFF8F3`, on-surface `#1F1B14`, primary kaamos `#1F467E`) for the end sheet, the patient view, settings by day and the dashboard. The interface wakes up: a 2 s crossfade from Kaamos to Kevät at dawn + 6 s; night sessions stay on Kaamos dark-room. Sun fixed roles in both: `sun #F2C230`, `on-sun #3E2E00`, `sun-container #FFDF91`, `on-sun-container #241A00`.

World colour stages (`world_stages`, from `ArtBible.md` 2): kaamos (base saturation 0.12, sky `#0E1A2E` to `#1E3150`) -> warm yellow (first task) -> blue (second) -> green aurora (third) -> dawn (sky `#6E8FC4` to `#F3A57A`, sun `#FFD58A`). Each step blooms over 1.5 s after a finished task and 5 s after a timeout.

Mood lantern scale (`mood-1` to `mood-5`), ordinal because colour and brightness rise together:

| Value | Hex | Glow alpha |
|---|---|---|
| 1 | `#34476E` cool dim blue | 0.35 |
| 2 | `#5A7CA6` | 0.50 |
| 3 | `#A9A79A` neutral | 0.65 |
| 4 | `#E8B867` | 0.82 |
| 5 | `#FFCB5C` warm bright amber | 1.00 |

The dimmest lantern still glows: there is no "wrong" answer. The same colours fill the week row (concept 12.2).

Director modes (`mode-*`), one colour plus one Material Symbols Rounded glyph each, used in the dashboard legend, the dev panel and settings, never in play: calm `#C8D6BE` `spa`, flow `#9DB9CC` `animation`, wake `#8FC6E0` `light_mode`, fatigue `#FFF0D2` `wb_twilight`, rest `#6E6590` `bedtime`, measure `#B4A6CE` `touch_app`.

Clinic states (`state-*`, on the Kevät dashboard), always icon plus label, never colour alone, never red, rows also sorted by need:

| State | Dot / text | Container | On-container | Icon |
|---|---|---|---|---|
| Stable | `#3F8C4E` | `#D9F0D6` | `#123B1A` | `check` |
| Watch | `#3D6DB8` | `#DCE7FB` | `#0F2B56` | `insights` |
| Check-in | `#AD8500` | `#FFEDB8` | `#3A2C00` | `call` |
| Booster review | `#B95F28` | `#FFE2CF` | `#4A2100` | `medical_services` |
| Simulated badge | outline `#9DB9CC`, text `#4F5F7D` | none | | text "SIMULATED" |

Dashboard surfaces (`clinic-*`) carry the Kevät roles: bg `#FFF8F3`, raised `#FCF2E7`, surface `#F6ECE1`, surface-2 `#F0E7DC`, hover `#EBE1D6`, border `#D9CAB4`, text `#1F1B14` (16.3:1), muted `#544A39` (8.3:1), faint `#827563` (never for numbers that matter). `clinic_dark` holds the Kaamos values under the same keys.

## 3. Typography

| Role | Family | Weights | Use |
|---|---|---|---|
| Brand | **Jost** (bundled, OFL) | 300, 400 | Wordmark `afferent` (300, lowercase, +1% tracking, `.af-wordmark`), "Good morning.", "Rest well.", headlines, the streak numeral, patient view and dashboard page titles. Never body text, buttons or below 22 px |
| Interface | **Google Sans Flex** (bundled, OFL), ROND 100 | 400 to 600 | Every control, label, body line, chart label and number; the M3 type scale. Never display sizes above 32 px |
| Voice | **Fraunces** (bundled, OFL), opsz 48 | 300 | The quote after the session only (`.af-quote`, 21/31) |
| Mono | JetBrains Mono (bundled, OFL) | 400 to 500 | Dev panel, JSON, protocol lines only |

Inter is dropped from the interface (files stay for one build). `--af-font-display` is now an alias of the brand face. Numbers use `.af-num` (Google Sans Flex tabular figures).

M3 scale (`type.scale`, px size/line height): Display L 57/64, M 45/52, S 36/44 (Jost 300); Headline L 32/40, M 28/36, S 24/32 (Jost 400); Title L 22/28, M 16/24, S 14/20 (Sans 500); Body L 17/26, M 15/22, S 13/18 (Sans 400); Label L 15/20, M 13/16, S 11/16 (Sans 600); Quote 21/31 (Fraunces 300). Body L is one step above the M3 default because the phone is held above the face. The older `--af-text-*` steps stay for existing code. Small caps labels with `.af-caps`.

Fonts live in `design/fonts/` (latin and latin-ext subsets, variable weight, OFL licences beside them), so everything works offline at the venue.

## 4. Space, shape, depth

- Spacing scale `--af-space-1` to `--af-space-9`: 4, 8, 12, 16, 24, 32, 48, 64, 96 px. Dashboard card padding 24, gap 16; phone side gutter 16, patient view margins 24.
- Radius: sm 8 (chips), md 12, dashboard card 16, card 24 (cards on phone), sheet 28, pill (buttons). No sharp corners, no zigzags. The game task panel radius 22 is gone (the Opening replaces it).
- Signature shapes (concept 5): the free wave (once per screen, 18 to 34 px tall), ply lines (2 to 4 offset lines in birch, ply, ply-edge, never on controls), the sun (the only perfect circle, never a generic container), the Opening arch, the Keeper's dome.
- Touch targets at least 48 px; the primary hold control is 84 px.
- No drop shadows on phone UI: depth comes from value and scrim. The dashboard uses M3 elevation 1 (`--af-shadow-elevation-1`) only for the detail pane.
- Game parallax depth (`layer` in the JSON), back to front with scroll factors: sky 0, stars 0.02, aurora 0.04, far mountains 0.1, islands 0.2, far fog 0.3, mid hills with birches 0.5, near fog 0.7, ground 1.0, foreground silhouettes 1.35. At least 5 of these are always visible.

## 5. Motion

Three signatures on one breath pacer (4 s in, 6 s out): **Bend** (things travel on curves; spring damping 0.82, stiffness 260; a new layer settles 2 px in 140 ms), **Breathe** (lantern, aurora, fog, cloak and hold rings follow the pacer), **Sweep** (colour returns outward from the lantern, dawn ignites outward from the sun, sky bands re-ink top to bottom with 90 ms stagger, 600 ms each).

| Token | Value | Use |
|---|---|---|
| `--af-ease-emphasized-decelerate` | `cubic-bezier(0.05, 0.7, 0.1, 1)`, 450 ms | UI entering (from below) |
| `--af-ease-emphasized-accelerate` | `cubic-bezier(0.3, 0, 0.8, 0.15)`, 250 ms | UI leaving |
| `--af-ease-standard` | `cubic-bezier(0.2, 0, 0, 1)`, 300 ms | State changes |
| `--af-ease-breath` | `cubic-bezier(0.45, 0, 0.55, 1)` | Breath pacer, lantern pulse, fog breathing |
| `--af-dur-settle` | 140 ms | Layer press settle |
| `--af-dur-scheme-handover` | 2000 ms | Kaamos to Kevät crossfade at dawn + 6 s |
| `--af-dur-fade` | 2000 ms | Scene fades, light changes |
| `--af-dur-colour-return` | 4000 ms | Colour returning to the world |
| `--af-dur-dawn` | 8000 ms | Dawn and the bedside dawn fade |
| `--af-breath-in` / `out` | 4000 / 6000 ms | 6 breaths per minute, never faster |
| `--af-lantern-pulse` | 1000 ms | Fixed slow lantern rhythm (never the live pulse) |

The older `--af-ease-out-soft`, `--af-ease-in-out` and `--af-dur-fast/base/slow` stay for existing code. Nothing bounces in calm or rest; the streak numeral changes once (no count-up). Reduced motion (`prefers-reduced-motion` or the in-app setting): crossfades instead of paths and springs, parallax x0.5, particles under 0.2 screen per second, no settle, the Opening fades in at full size, nothing above 3 Hz. The dashboard animates only data arriving (a soft pulse on the changed value and the new chart point) and never loops.

## 6. Components

Dashboard (Kevät light by default, dark as a setting; concept 9.2 frame 10):

- Navigation rail with the mark, top app bar with the wordmark and the SIMULATED badge.
- Patient row: name, state chip (icon plus label on the state container), 14-day sparkline on a baseline band, top contributor as plain text, last session. Sorted by need, top row visually first.
- Detail pane (elevation 1): one series against the personal baseline band (`clinic-baseline-band` `#E9E1D6`, median as `clinic-baseline-line`), chart line `#1F467E` (`clinic-line-primary`), threshold dashed in the state colour, "What moved" bars, "Consider a check-in call. The clinician decides." Live points pulse once.
- Stick figure: kaamos lines on birch paper, joints as small sun dots, never video.

Patient view (Kevät, concept 12.3): header crop of the world with a wave bottom edge, "Your mornings", the week row (7 mood-coloured day lights; shape, not hue, carries missed, frozen and paused), the Your layers strata card, What helped, M3 navigation bar. One sentence per item at most, privacy switches as M3 switches.

Game: the Opening (concept 9.3): an arch with a 7 px `ply` frame, an outer 1.5 px `ply-edge` line and an inner 1.2 px `birch` line, the live world visible outside under `#0A1322` at 0.50 (play) or 0.62 (measurement); progress as three 10 px sun dots; hint glyphs, no words. Start screen: the mornings chip in the eye zone (about 27% from the top) and the 84 px hold-to-kindle ring in the thumb zone.

## 7. Bedside light

The lantern in the room. Warm only, never blue, never a flash. `tokens.json -> bedside`: idle `#FFD9A0` 5%; modes calm `#FFC266` 8%, flow `#FFD58A` 8%, wake `#FFE3A6` 20%, fatigue `#FFF0D2` 40%, rest off. Kindle (session start) `#FFB54A` at the knob level, 600 ms rise. Each finished task steps one notch warmer along `#FFB54A`, `#FFC266`, `#FFD58A`, `#FFF0D2` and +5 points over 1200 ms, capped at 40% before dawn. Dawn in the morning `#FFF0D2` at 60% over the 8 s dawn, hold 30 s, then fade out; the concept proposes 70%, which waits for the bedside hardware owner to confirm it is glare-free from the lying position (Decisions L5). Dawn at night unchanged: `#FFC98A` at the knob level (default 15, cap 25). Quiet night caps every level at 25. SHOULD (needs the hub schedule): a 30 min wake ramp before the alarm, `#FFB54A` 2%, `#FFC266` 15%, `#FFD58A` 40%, `#FFF0D2` 60%. The day schedule (only while someone is in bed and no session runs): 06-09 morning `#FFF0D2` 30%, 09-18 off, 18-21 evening `#FFD9A0` 12%, 21-23 wind down `#FFC98A` 5%, 23-06 off.

## 8. Voice

English, short, warm, never clinical in the patient view ("Good morning.", "Rest well.", "Slow breathing often settles you."). Morning first: the product is a morning ritual, so default copy speaks of today and mornings ("Not today", "13 mornings"); night wording ("Not tonight", "Rest well.") is only the fallback for night sessions. Clinical and precise in the dashboard ("Consider a check-in call. The clinician decides."). Claims policy from `GameDesign.md` section 11 and `contracts/api.md` applies to every string. "Aalto", "Paimio" and "Artek" never appear in the product. No em dashes anywhere.
