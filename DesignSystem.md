# Afferent design system

One design system for the game, the patient view, the clinician dashboard and the bedside light. Source of truth: `design/tokens.json`. `design/tokens.css` exposes the same values as CSS custom properties (`--af-*`) and loads the bundled fonts. Change both files together (contract agent owns them tonight; ask in STATUS.md if you need a new token).

Use it:

- Game and patient view (`demo/`): `<link rel="stylesheet" href="design/tokens.css">`. Served from the hub at `/app/design/`; inside the Capacitor bundle from `demo/design/` (copied by `npm run design` before `npx cap sync ios`).
- Dashboard: `<link rel="stylesheet" href="/design/tokens.css">`.
- Canvas code (world.js, charts): read colours from `tokens.json` (`fetch('design/tokens.json')`) or from CSS with `getComputedStyle(document.documentElement).getPropertyValue('--af-lantern-amber')`. Do not invent new hex values in code; if you need one, add it here first.
- Bedside light: the hub reads `bedside` from `tokens.json`.

## 1. Feeling

A quiet place in the polar night where light slowly comes back. Gris, Journey and Alto's Odyssey as principles only (never their assets): depth, soft light, colour as reward, no text, no failure. The dashboard is the same world seen by a professional: darker, quieter, precise, readable in 10 seconds.

Rules for everything:

1. Light is the hero. The lantern amber is the one warm light in a cold scene; warmth means "something good happened".
2. Colour returns gradually, never with hard cuts. Every colour change is eased over seconds (`dur-colour-return` 4 s, `dur-mode-style` 2 s).
3. No red, no scores, no fail states, no streaks in the game and patient view. The dashboard uses dawn coral (`state-booster`) as its strongest colour, never red.
4. Space and calm. Few elements, big margins, one accent at a time.
5. Simulated data is always labelled with the `.af-simulated` badge ("SIMULATED").

## 2. Colour

| Token group | Values | Use |
|---|---|---|
| `night-950` to `night-500` | `#05070F` `#070A14` `#0A0E1C` `#0D1326` `#131B36` `#1C2548` `#28335E` | Backgrounds, sky, dashboard surfaces |
| `violet-800` to `violet-200` | `#1E1838` `#2A2350` `#3C3170` `#5B4B8A` `#9C8AD6` `#B79CFF` | Night sky depth, measurement tasks, SIMULATED badge |
| `silver-050` to `silver-700` | `#F3F6FA` ... `#46546A` | Text, cold light, snow, baseline bands |
| `aurora-green`, `aurora-green-deep`, `aurora-teal`, `aurora-teal-deep`, `aurora-ice` | `#5FE3A1` `#2FA37A` `#4FC3D9` `#2A8FA6` `#7FC8E8` | Aurora ribbons, ice, the "stable" state, secondary chart lines |
| `lantern-amber`, `lantern-amber-deep`, `lantern-glow`, `lantern-warm`, `lantern-flame` | `#F2B544` `#D98E2B` `#FFD9A0` `#FFC98A` `#F2E6C9` | Lantern, primary accent, the glowing current-state line |
| `dawn-coral`, `dawn-coral-soft`, `dawn-gold`, `dawn-sun`, `dawn-sky`, `dawn-peach`, `dawn-daylight` | `#FF8A70` `#F49D6E` `#FFD27A` `#FFE8B8` `#9FC3E0` `#F7C59F` `#FFF3DC` | Dawn, morning light, strongest clinic state |

World colour stages (from `ArtBible.md`, `world_stages` in the JSON): night grey (saturation 0.05) -> warm yellow (first task) -> blue (second) -> green aurora (third) -> dawn (full colour). Each step blooms over 1.5 s after a finished task and 5 s after a timeout.

Mood lantern scale (`mood-1` to `mood-5`), ordinal because colour and brightness rise together:

| Value | Hex | Glow alpha |
|---|---|---|
| 1 | `#34476E` cool dim blue | 0.35 |
| 2 | `#5A7CA6` | 0.50 |
| 3 | `#A9A79A` neutral | 0.65 |
| 4 | `#E8B867` | 0.82 |
| 5 | `#FFCB5C` warm bright amber | 1.00 |

The dimmest lantern still glows: there is no "wrong" answer. The same colours make the patient's week ribbon.

Director modes (`mode-*`): calm `#F2B544`, flow `#B9CAD6`, wake `#7FC8E8`, fatigue `#FFF3DC`, rest `#5E6873`, measure `#B79CFF`.

Clinic states (`state-*`): stable `#4FC3D9` teal, watch `#FFD27A` gold, check-in `#F2B544` amber, booster `#FF8A70` coral. Always shown with the text label, never colour alone.

Dashboard surfaces (`clinic-*`): bg `#070A14`, raised `#0B1020`, surface `#0F1529`, surface-2 `#151D38`, hover `#1A2344`, border `rgba(185,202,214,0.10)`, text `#E8EEF5`, muted `#93A3B8`, faint `#5D6B80`. Text contrast: `text` on `surface` is above 14:1, `text-muted` above 6:1; never use `text-faint` for numbers that matter.

## 3. Typography

| Role | Family | Weights | Use |
|---|---|---|---|
| Display | Fraunces (soft optical serif, bundled, OFL) | 300 to 400 | Patient view headings, "Rest well.", dashboard patient name and page title |
| UI | Inter (bundled, OFL) | 400 to 600 | Everything else |
| Mono | JetBrains Mono (bundled, OFL) | 400 to 500 | Debug panel, JSON, protocol lines only |

Numbers in the dashboard use `.af-num` (Inter tabular figures). Scale (`--af-text-*`): 2xs 11, xs 12, sm 13, base 15, md 17, lg 20, xl 24, 2xl 32, 3xl 44, 4xl 60 px. Line height 1.15 for display, 1.5 for text. Small caps labels with `.af-caps` (11 px, 0.08em tracking, uppercase, 600).

Fonts live in `design/fonts/` (latin and latin-ext subsets, variable weight), so everything works offline at the venue.

## 4. Space, radius, depth

- Spacing scale `--af-space-1` to `--af-space-9`: 4, 8, 12, 16, 24, 32, 48, 64, 96 px. Dashboard card padding 24, gap 16; patient view margins 24 to 32 on phone.
- Radius: sm 6 (chips, inputs), md 12 (cards), lg 18 (panels), xl 22 (game task panel), pill.
- Shadows: `--af-shadow-panel` for raised cards, `--af-shadow-glow-amber` and `--af-shadow-glow-teal` for the one highlighted element.
- Game parallax depth (`layer` in the JSON), back to front with scroll factors: sky 0, stars 0.02, aurora 0.04, far mountains 0.1, islands 0.2, far fog 0.3, mid hills with birches 0.5, near fog 0.7, ground 1.0, foreground silhouettes 1.35. At least 5 of these are always visible.

## 5. Motion

| Token | Value | Use |
|---|---|---|
| `--af-ease-out-soft` | `cubic-bezier(0.22, 1, 0.36, 1)` | UI entering, panels opening |
| `--af-ease-in-out` | `cubic-bezier(0.65, 0, 0.35, 1)` | Colour and light transitions |
| `--af-ease-breath` | `cubic-bezier(0.45, 0, 0.55, 1)` | Breath pacer, lantern pulse, fog breathing |
| `--af-dur-fast` / `base` / `slow` | 180 / 320 / 800 ms | Hover, UI, larger UI moves |
| `--af-dur-fade` | 2000 ms | Scene fades, light changes |
| `--af-dur-colour-return` | 4000 ms | Colour returning to the world |
| `--af-dur-dawn` | 4000 ms | Dawn sweep and bedside dawn fade |
| `--af-breath-in` / `out` | 4000 / 6000 ms | 6 breaths per minute, never faster |
| `--af-lantern-pulse` | 1000 ms | Fixed slow lantern rhythm (never the live pulse) |

Ambient motion is always on in the game: drifting snow, breathing fog, flickering lantern, twinkling stars, waving aurora. Reduced motion (`prefers-reduced-motion` or the in-app setting): parallax at half speed, no flashes, particles slower than 0.2 screen per second, fades instead of slides. The dashboard animates only data arriving (a 800 ms soft pulse on the changed value and the new chart point) and never loops.

## 6. Components

Dashboard:

- Patient row: name (Fraunces 20), state chip (state colour dot plus label), composite with 14-day sparkline, top contributors as short text, last session, SIMULATED badge. Sorted by need, top row visually first.
- Chart: dark surface, `clinic-grid` lines, the personal baseline as a soft band (`clinic-baseline-band`, median as a thin `clinic-baseline-line`), the current value as one glowing line (`clinic-line-primary` with a 6 px blur copy in `clinic-line-primary-glow`). Threshold lines dashed in the state colours. Live points pulse once.
- Contribution bars: horizontal, signed, amber for "worse than usual", silver for "better than usual", weights shown as small numbers.
- Stick figure: silver lines on night, joints as small amber dots, never video.

Patient view: the night-to-dawn world as background (static or slow), week ribbon of 7 mood-coloured lanterns, one sentence per item at most, privacy switches as iOS-style toggles.

Game: task panel `rgba(10,12,17,0.86)` with `lantern-glow` border at 22% (done: 80%), radius 22; progress as small glowing dots; hint glyphs, no words.

## 7. Bedside light

`tokens.json -> bedside`: idle `#FFD9A0` 5%; modes calm `#FFC98A` 8%, flow `#FFD9A0` 8%, wake `#DDEBFF` 20%, fatigue `#F4F7FF` 40%, rest off; dawn at night `#FFC98A` at the knob level (default 15, cap 25), dawn in the morning `#FFF3DC` 60%; both fade 4 s, hold 30 s, then fade out. Quiet night caps every level at 25. The day schedule (only while someone is in bed and no session runs): 06-09 morning `#FFF3DC` 30%, 09-18 off, 18-21 evening `#FFD9A0` 12%, 21-23 wind down `#FFC98A` 5%, 23-06 off.

## 8. Voice

English, short, warm, never clinical in the patient view ("Rest well.", "Slow breathing often settles you."). Clinical and precise in the dashboard ("Consider a check-in call. The clinician decides."). Claims policy from `GameDesign.md` section 11 and `contracts/api.md` applies to every string. No em dashes anywhere.
