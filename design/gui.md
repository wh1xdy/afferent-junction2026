# Afferent GUI: Lantern Material

Status: final GUI spec, 2026-11-14. It replaces every GUI style in `demo/` and `hub/afferent_hub/web/clinic/`. Look and feel (colour, type, shape, motion, the scheme handover) come from `design/concept.md` ("Layers of Light"); this file owns screen inventory, flows and component behaviour, and where the two differ on look and feel the concept wins. Game rendering, world, mood and bedside colours stay in `design/tokens.json` and `ArtBible.md`. Question content, order, timing and crisis texts are owned by `design/questions.md`; where this file and `questions.md` differ, `questions.md` wins.

Files that belong to this spec:
- `design/gui-tokens.css`, `design/gui-tokens.json`: generated system tokens (do not edit by hand).
- `design/mockups/final/`: final mockups of every screen, the generator (`tools/gen-gui-tokens.mjs`, `tools/seeds.json`), the screenshot script (`tools/shoot.js`), bundled fonts and icons.
- `design/mockups/final/shots/`: screenshots (phone 390x844 at 2x, clinic and overview 1440 wide).

## 1. Principles

1. **Material 3, close to 1:1.** M3 type scale, shape scale, tonal surfaces, state layers, motion, components and 48 dp targets. Role models: Pixel Clock Bedtime mode (start, end, fell asleep), Android 16 Settings (grouped lists), Digital Wellbeing (privacy, export, download my data), Google Fit and Pixel Weather (patient week and hero), M3 list-detail with navigation rail (clinic).
2. **The scheme follows the sky, one light per screen.** Kaamos (dark) while it is night in the world, Kevät (light) once the sun is up (concept 3.3). Sun yellow `#F2C230` marks the single thing that matters now: the primary control in Kaamos, today and the newest layer in Kevät. The only glow in the UI is lantern light.
3. **Nothing to read.** Text is left out wherever it can be. Unavoidable hints live behind an info icon (its aria-label is the hint). One question per screen with nothing else on it.
4. **Made for the person lying down.** Content in the upper two thirds, controls in the lower third thumb arc, Kaamos bedtime tones in the dark, low-glare switches, no clock, no scores, never red, dark-room mode, reduced motion honoured everywhere. The only streak surface is the mornings chip and its end tick (Decisions D1, concept 12).
5. **Export, not surveillance.** The clinic reads a daily export. No word in the product says or implies that anyone watches live.

## 2. Decision record (synthesis)

Winning direction: **bedtime-instrument** (judge scores 8, 8, 8.5; material-you-sky 7, 6.5, 7.5; lantern-paper 6, 7, 6). It was the calmest, most minimal, and the only one with a real M3 list-detail clinic. Since 14 Nov its colour, type and schemes are re-seeded by the Layers of Light concept (`design/concept.md` 9.1, Decisions L1): sections 3, 4 and the screen schemes below follow it; the rows in this record are kept as history.

Grafted from material-you-sky: the deterministic Material Color Utilities pipeline kept in the repo with seeds and a contrast report; the error palette moved to amber-orange so the system has no red; pure black fell-asleep screen with a faint moon; the info bottom sheet; the export wording on safety notes.

Grafted from lantern-paper: crisis rows with a phone icon on every call button; morning-first decline wording ("Not today", with "Not tonight" only as the night fallback); low-glare switches by default; Material Symbols licence corrected to Apache-2.0. Paper grain and the bloom ripple were not taken: two of three judges found them fidgety at night, and they add GPU cost on old phones.

Must-fixes applied (all judges):

| Must-fix | Resolution |
|---|---|
| Big clock on start and fell-asleep invites clock-watching | Removed. No clock anywhere in the patient app. |
| Crisis: three filled call buttons, no priority | Exactly one filled call button per screen (section 13). |
| Check-in chip out of thumb reach | In the bottom dock, directly above Begin, 48 dp tall. |
| `view_week` icon is cryptic | The lantern glyph is the "Your week" icon. |
| Bright wake button on pure black | Dim surface (#121212) with 50% white icon, shown only after a touch. |
| Begin is an unlabelled circle on night one | Visible "Begin" label under the lantern for the first 3 sessions, aria-label always. |
| No info entry on start | Info icon in the start top bar opens the How it works sheet. |
| End morning: dark sheet hides the dawn | Kevät birch-paper sheet with a wave top edge over the lower 47% only, never over the sun (concept 9.2 frame 07). |
| Question screens in brown-black | Kevät (light) for the daytime check-in; Kaamos only if the OS is in dark mode. |
| Booster reads rust or red | Booster hue clamped to HCT 55 to 62 (orange). Always icon plus label. |
| Generator lived in a scratchpad | `design/mockups/final/tools/gen-gui-tokens.mjs`, deterministic, seeds rounded to 5 degrees of hue. |
| Font too large (740 KB) | Google Sans Flex instanced to opsz, wght 200 to 700 and ROND (wdth 100, GRAD 0 pinned): 156 KB latin plus 6 KB latin-ext. |
| 40 px icon buttons and chips | All icon buttons 48x48; chips and 32 dp controls get a 48 dp `::before` hit area; switch input is 64x48. |
| `role="switch"` missing | Every switch input has `role="switch"`. |
| Bright primary switch tracks at night | Kaamos switch: primary-container track, lantern thumb, check icon. Full primary track only in Kevät (day, patient view, clinic). |
| Selected answer gradient | Flat primary-container, no gradient. |
| Sensor tip open by default | Collapsed behind the section info icon. |
| Start dock with three rows of choices | One Begin control, "Not today" as a text button, nothing else (plus the Check-in chip when due). Sound and camera live in Settings; a camera privacy pill appears only while the camera is on. |
| Begin and Not today equal size | Begin is the 84 dp kindle ring (was a 104 dp lantern); Not today is a text button. |
| Clinic "Live", "Playing now" | Gone. Header shows "Export of Sat 14 Nov, 07:12"; rows show "Played Fri 07:52". Dev value "Live" renamed "Today". |
| Clinic KPI strip plus wide table | M3 list-detail: grouped list pane plus detail pane with chart, drivers, PHQ-9, facts. |
| Anna delta sign | "+0.50 in 7 d" with `trending_up` on a rising line. |
| Crisis lead wording | Fixed text "If today is heavy, you do not have to carry it alone." on every variant. |

Where `questions.md` overrides the judges: question screens have **no** close icon, progress bar, info icon, back or skip control (judges had proposed them); they advance 600 ms after a tap; back is a left-edge swipe and stop is a swipe down. The crisis contacts are four, in the order 112, MIELI, 116117, clinic. On the crisis screen 112 is the one filled button.

## 3. Colour system

### 3.1 Schemes

Two schemes, each a full `--md-sys-color-*` role set, plus the dark-room variant of Kaamos. Values are generated with Material Color Utilities from the concept seeds (`design/concept/final/theme.mjs`, output and measured contrast in `theme.json`, concept 3.3). Chosen with `data-scheme` on `<html>`.

| Scheme | Mode | Used for | ROND |
|---|---|---|---|
| `kaamos` | dark | start, Ride, tasks, dawn until the handover, settings and info at night, end night ("Rest well."), Talk at night, check-in questions when the OS is in dark mode | 100 |
| `kaamos` + `data-room="dark"` | dark | first minutes after waking and every night session with Quiet night (section 17) | 100 |
| `kevat` | light | end sheet after the dawn handover, patient view, settings and info by day, daytime check-in (intro, questions, thank-you, support, crisis) | 100 |
| `clinic` | light | clinician dashboard, Kevät roles (default) | 100 |
| `clinic-dark` | dark | clinician dashboard dark setting, Kaamos roles | 100 |

Key values (full sets in `design/concept/final/theme.json`, later in `gui-tokens.json`):

| Role | kaamos | kevat (also clinic) |
|---|---|---|
| surface | #0D182A | #FFF8F3 (birch paper) |
| surface-container low / / high / highest | #111C2E #172234 #202A3D #2A3548 | #FCF2E7 #F6ECE1 #F0E7DC #EBE1D6 |
| on-surface | #E8EEFF | #1F1B14 |
| on-surface-variant | #B3C1E0 | #544A39 |
| primary | #F2C230 (sun, pinned) | #1F467E (kaamos at tone 30) |
| on-primary | #3E2E00 | #FFFFFF |
| primary-container / on | #594400 / #FFDF91 | #D6E3FF / #001B3E |
| secondary / container | #B6C7EA / #374764 | #745A2A (ply) / #FFDEA8 |
| tertiary / container | #B0D09F / #334D28 | #4A663E / #CCECB9 |
| error (attention, never red) / container | #FFB783 / #703801 | #8D4E18 / #FFDCC5 |
| outline / variant | #7E8CA9 / #394761 | #827563 / #D9CAB4 |

Sun fixed roles in both schemes: `sun #F2C230`, `on-sun #3E2E00`, `sun-container #FFDF91`, `on-sun-container #241A00`. In Kevät the primary action is kaamos blue; sun marks only today and the newest layer.

Extra roles beyond M3: `lantern-glow` (`light-glow #FFD58A`) for glows; `lantern-flame` (`light-flame #FFE3A6`) for the lit flame glyph inside the kindle ring.

Custom colour quads (colour, on, container, on-container): `stable` `#3F8C4E` (`check`), `watch` `#3D6DB8` (`insights`), `call` `#AD8500` (`call`), `booster` `#B95F28` (`medical_services`), with the containers from concept 3.7; `simulated` is an outline badge (`#9DB9CC` outline, `#4F5F7D` text). Always icon plus label; rows are also sorted by need. Mood colours `--af-mood-1..5` stay fixed data colours from `tokens.json` and are never harmonised.

### 3.2 Bedtime tones

Kaamos already is the bedtime scheme: surface tone about 9 on the kaamos hue, on-surface 15.3:1. The dark-room variant (`data-room="dark"`) lowers on-surface to `#B1BCD4` (9.3:1), primary to `#CFA62E` (tone 70) and outline to `#5A6884`. Kevät is never used between 21:00 and 06:00.

### 3.3 Generation (build time)

`node design/mockups/final/tools/gen-gui-tokens.mjs` with `MCU=<path to @material/material-color-utilities index.js>` (Apache-2.0). It ports `design/concept/final/theme.mjs` (concept 15.5). Inputs in `tools/seeds.json`:
- `sun #F2C230`: primary, pinned to `#F2C230` in dark schemes.
- `kaamos #1E3150`: neutrals in dark schemes; in light schemes (`kevat`, `clinic`) the primary comes from the kaamos hue at chroma 40, tone 30.
- `ply #E2C79C`: neutrals and secondary in light schemes.
- `spring #9DBE8C`: tertiary. `apricot #F3A57A`: error palette at hue 55 (never red).
- Sky seeds: the rendered kaamos sky (expected hue about 255 to 262) and the rendered dawn, re-quantized with `QuantizerCelebi(128)` and `Score` once the lamination and grade changes land; used only for the runtime refinement (3.4).
- Output: `design/gui-tokens.css` and `design/gui-tokens.json` (roles, palettes, the four `sun` fixed roles, `darkRoom`, contrast report). Never hand-edit them; the script fails loudly if any contrast pair drops below its minimum. Until it is rerun, `gui-tokens.*` still carry the old lantern-amber schemes.

### 3.4 The interface wakes up (scheme at runtime)

1. The scheme follows the session, not the OS: Kaamos from the start screen to the handover; a 2000 ms crossfade (`--af-dur-scheme-handover`) to Kevät when the sun clears the fell, at dawn + 6 s (lookdev 8.3); Kevät for the end sheet and everything after.
2. Night sessions never switch: they end on Kaamos dark-room with "Rest well.".
3. Outside a session: the patient view, settings by day and the daytime check-in use Kevät; at night (21:00 to 06:00) everything uses Kaamos. The check-in uses Kaamos when `prefers-color-scheme: dark`.
4. The clinic uses Kevät light by default; the dark setting sets `clinic-dark` (Kaamos roles) and is remembered per browser (Decisions L4).
5. Optional refinement from the live sky: on each world-stage change, quantize the top 60% of a 32x32 sky draw and rebuild only neutral, neutral variant and secondary (shared module `demo/js/gui/theme.js`). Primary, tertiary, error, sun and custom colours never change. Roles are registered with `@property ... syntax "<color>"`, so they cross-fade over 4000 ms with the world's colour return.
6. If anything fails (no canvas, old WebView), the static scheme from `gui-tokens.css` stays.

### 3.5 Contrast (WCAG 2.2, from `design/concept/final/theme.json`)

| Pair | kaamos | kaamos dark-room | kevat |
|---|---|---|---|
| on-surface / surface | 15.33 | 9.32 | 16.30 |
| on-surface-variant / surface | 9.84 | 5.98 | 8.27 |
| on-primary / primary | 7.86 | 5.73 | 9.39 |
| on-sun / sun | 7.86 | 7.86 | 7.86 |
| outline / surface (non-text, 3:1) | 5.26 | 3.17 | 4.27 |

Every on-container pair is at least 7.2:1 in Kaamos and 13.2:1 in Kevät. Clinic states pass the lightness band and chroma checks; check-in versus booster are close (Delta E 13.8), acceptable only with icon, label and sort order.

## 4. Type

Two interface families plus one voice, all OFL and bundled in `design/fonts/` (concept 4):

| Role | Family | Use | Never |
|---|---|---|---|
| Brand | **Jost** 300 and 400 | Wordmark `afferent` (300, lowercase, +1% tracking), "Good morning.", "Rest well.", Display and Headline roles, the mornings numeral, patient view and dashboard page titles | Body text, buttons, below 22 px |
| Interface | **Google Sans Flex**, ROND 100, 400 to 600, tabular figures | Every control, label, body line, chart label and number; Title, Body and Label roles | Display sizes above 32 px |
| Voice | **Fraunces** 300, opsz 48 | The quote on the end sheet only (one line, one element per session), `.quote` | Anything else |

- Files: `Jost-latin.woff2`, `Jost-latin-ext.woff2`, `GoogleSansFlex-latin-rond.woff2`, `GoogleSansFlex-latin-ext-rond.woff2`, `Fraunces-latin.woff2`, `Fraunces-latin-ext.woff2`, licences `OFL-*.txt` beside them. The mockups keep their own Google Sans Flex instance in `design/mockups/final/fonts/`. `font-display: block` for local files.
- Inter leaves the interface. JetBrains Mono stays for the dev panel and JSON only.
- M3 scale (size/line height): Display L 57/64, M 45/52, S 36/44 (Jost 300); Headline L 32/40, M 28/36, S 24/32 (Jost 400); Title L 22/28, M 16/24, S 14/20 (Sans 500); Body L 17/26, M 15/22, S 13/18 (Sans 400); Label L 15/20, M 13/16, S 11/16 (Sans 600); Quote 21/31 (Fraunces 300). Body L is one step above the M3 default because the phone is held above the face at arm's length.
- ROND 100 on Google Sans Flex in every scheme, the clinic included.
- Numbers use tabular figures everywhere. No custom off-scale sizes: question items use Headline M, falling back to Title L for items over 120 characters and Body L for items over 230 characters (C-SSRS 5 and 6) so a question never scrolls. Question items set in Headline roles use Jost 400; if a long item reads worse in Jost, it falls back to Title L in Google Sans Flex.

## 5. Shape

M3 Expressive scale: none 0, extra-small 4, small 8, medium 12, large 16, large-increased 20, extra-large 28, extra-large-increased 32, extra-extra-large 48, full.
- Grouped lists (Android 16): 28 outer corners, 4 inner corners, 2 px gaps.
- Answer lists: 28 outer, 8 inner; the chosen answer morphs to full.
- Buttons: full, morph to medium (12) while pressed. The kindle ring (Begin) is a perfect circle and never morphs: the sun is the only perfect circle (concept 5).
- Connected button group (export choice): 8 inner, full outer; the selected segment morphs to full.
- Cards on phone 24, sheets 28 (the end sheet and patient header carry the one free-wave edge per screen, never a control); clinic cards and panels 16 (concept 5).

## 6. Elevation

Tonal only, no drop shadows: level 0 surface, 1 surface-container-low, 2 surface-container, 3 surface-container-high, 4 surface-container-highest, 5 surface-bright. Scrims use `scrim` at 50%. The only "light" is the lantern glow: `box-shadow: 0 0 calc(44px * var(--af-glow-strength)) primary 30%` on Begin, a 10 px glow on switch thumbs, the glowing chart line in the clinic. `--af-glow-strength` is 1, and 0.5 in dark-room mode.

## 7. State layers and focus

- Layer colour = the content colour (`currentColor`), opacity hover 0.08, focus 0.10, pressed 0.10, dragged 0.16. Disabled content 0.38, disabled container 0.12.
- No ripple. The pressed layer fades in over 150 ms (standard easing); the shape morph carries the press feedback.
- Focus ring: 3 px `secondary`, offset 2 px, on `:focus-visible` only.
- Selected states are never colour only: check icon (segments, switches, answers), filled icon (rail), or position (switch thumb).

## 8. Motion

| Token | Value | Use |
|---|---|---|
| easing standard | cubic-bezier(0.2, 0, 0, 1) | state layers, switches, chips (150 to 300 ms) |
| emphasized decelerate | cubic-bezier(0.05, 0.7, 0.1, 1) | sheets, dialogs and the next question entering (400 ms) |
| emphasized accelerate | cubic-bezier(0.3, 0, 0.8, 0.15) | exits (200 ms) |
| spring standard spatial | damping 0.9, stiffness 700 (fast 1400) | shape morphs; no bounce anywhere |
| sky | 4000 ms, breath easing | colour roles cross-fade on stage change |
| scheme handover | 2000 ms at dawn + 6 s | Kaamos to Kevät (3.4); the end sheet rises 450 ms emphasized decelerate at dawn + 8.6 s at the earliest |
| glow loop | 10 s (4 s in, 6 s out) | Begin breathes at the game's breath rate; the only loop |
| question advance | 600 ms | after an answer tap; a new tap restarts it |
| lantern timeout | 10 s | mood lantern skipped (in-game) |

Question transition: shared axis X, 24 dp travel plus fade, 400 ms in, 200 ms out. Reduced motion (OS setting, or Settings > Reduced motion which sets `data-motion="reduced"`): all short and medium durations 0 ms, long 150 ms, fades only, glow loop off (static glow), sky fade kept.

## 9. Icons

- Material Symbols Rounded (Apache-2.0), bundled subset `MaterialSymbolsRounded-subset.woff2` (143 KB, 98 icons plus filled variants, list in `fonts/icon-names.txt`), ligatures (`<span class="ms">settings</span>`), weight 300, opsz 24, GRAD -25 on Kaamos and 0 on Kevät (concept 8). Outlined by default; filled only for the active rail destination, call buttons and the camera privacy pill.
- Custom **lantern glyph** (24 x 40 grid, 1.5 stroke, rounded): app mark, "Your week" icon, Begin, the lit tiles on info, crisis and thank-you, the week of lanterns (fill = mood colour, glow = mood glow; a missed night is a dashed outline). SVG source in `design/mockups/final/js/ui.js` (`lanternSvg`).
- Custom glyphs on the same 24 px grid, 1.5 px stroke, round caps (concept 8): the laminate (three offset waves, top one sun when it marks today; the mornings chip), the lantern flame (inside the kindle ring), the sun-on-horizon (hold to give), the arch (the Opening). No flame icon for the streak, no badges, no red dots.
- Icon map: Talk to someone `support` (concept 8); How it works `info`; Settings `settings`; Back `arrow_back`; Close `close`; call `call`; Phone camera `videocam`; Pulse stone `ecg_heart`; Bedside light `wb_incandescent`; Bedside camera `accessibility_new`; Presence sensor `sensors`; Phone movement `mobile_vibrate`; Sound `volume_up`; Quiet night `nightlight`; Reduced motion `motion_photos_off`; Check-in `checklist`; Language `edit_note`; Next export `schedule`; Home hub `router`; What is in an export `description`; Download my data `download`; Kept on your hub `lock`; Safety `shield`; Swipe to stop `swipe`; Still learning `hourglass_empty`; clinic rail `group`, `insights`, `upload_file`, `settings`; export stamp `file_save`; booster `medical_services`; watch `schedule`; stable `check`; trend `trending_up` / `trending_down`; mark as seen `done_all`; developer `code`.

## 10. Components

All sizes in dp (CSS px). Classes refer to `design/mockups/final/css/m3.css`, which is the reference implementation.

| Component | Spec |
|---|---|
| Icon button `.icon-btn` | 48x48, full shape, on-surface-variant. Variants: `tonal` (surface-container-high), `scrim` (lowest at 45 to 50%, over the world on light skies). |
| Button `.btn` | 56 tall (48 `small`), full shape, Label L/Title M. Variants: `filled` (primary), `lit` (primary-container plus soft glow), `tonal` (secondary-container), `outlined`, `text`. Press morphs to 12. |
| Begin, the kindle ring `.lantern-btn` | 84 circle in the lower third (concept 9.2 frame 01): a sun ring that fills while held, the lantern-flame glyph inside, breathing glow on the pacer. Label "Begin" below for the first 3 sessions. |
| Switch `.switch` | 52x32 visual, input 64x48 with `role="switch"`. Off: outline thumb 16 on surface-container-highest with 2 px outline. On (Kaamos): primary-container track, 24 sun thumb with check icon and glow. On (Kevät, clinic): stock M3, primary track, on-primary thumb. |
| Grouped list `.group` + `.li` | Items 56 (one line) or 72 (two lines), 20 side padding, leading 24 icon in on-surface-variant, trailing switch, value or chevron. Whole row is the target. |
| Section header `.subhead` | Title S in primary, 48 tall, optional trailing info icon button (hint in aria-label and tooltip). |
| Connected button group `.seg` | Three 48-tall segments with 2 px gaps, selected = secondary-container with check icon, `role="radiogroup"`. |
| Chip `.chip` | 32 visual with 48 hit area. `sel` = secondary-container. `lit` = 48-tall full chip with a lantern dot (Check-in). |
| Bottom sheet `.sheet` | surface-container-low, 28 top corners, 32x4 handle, scrim 50%. Enter 400 ms emphasized decelerate. |
| Dialog `.dialog` | surface-container-high, 28 corners, icon, Headline S, content, text plus filled actions. |
| Text field `.field` | Outlined, 56 tall, label in primary when focused, supporting text Body S. |
| Answer `.answer` | Min 72 tall, full width, surface-container, Title M text, leading frequency glyph (0 to 3 filled dots, PHQ only), trailing check when chosen. `role="radio"` in a `radiogroup`, aria-label read by screen readers. Chosen = primary-container, shape full. |
| Contact row `.contact` | 80 tall, label Title M plus number and hours Body M, trailing 56 call button (`call` icon filled). The primary row has a 1 px primary outline and a filled primary call button; the rest are secondary-container. Whole row is a `tel:` link. |
| Week of lanterns `.week` | 7 cells, each a 48+ wide button (lantern 24x37 with mood glow, day letter in a 32x24 pill; today in secondary-container). |
| Camera privacy pill `.privacy` | 24 visual, 48 hit, tertiary-container with filled `videocam`; visible only while the camera runs; opens Sensors. |
| Simulated badge `.sim-badge` | 24 tall, simulated-container, Label S caps "SIMULATED"; every simulated value, patient and screen. |
| Navigation rail (clinic) | 96 wide, 56 lantern mark, destinations 80x64 with 56x32 indicator pill. |
| Search bar (clinic) | 56 tall, full shape, surface-container-high. |
| State chip (clinic) `.st` | 32 visual (row is the target), icon plus label, custom container colours; safety uses inverse-surface. |

## 11. Screens

Phone frame 390x844; 16 side gutter; safe-area top 44 in mockups (`env(safe-area-inset-top)` in code). Every non-question screen carries the Talk to someone icon.

### 11.1 Start (`start.html`)
- Full-bleed live world, shifted up so the figure and lantern stand above the dock; scrim to surface-container-lowest at the bottom 110 to 320.
- Top bar: Talk (left); camera pill (only while on), info, week (lantern glyph), settings (right). On light skies the icons get the scrim style.
- Scheme Kaamos (concept 9.2 frame 01).
- Eye zone: the mornings chip (from a streak of 2, 06:00 to 21:00, concept 12.1) sits on the bay above the figure at about 27% from the top: a pill with 8 px vertical padding, kaamos at 42% with a blur, the laminate glyph, the numeral in Jost 300 28 px birch, "mornings" in Sans 500 13 px. No flame, no 0 or 1, no freeze count, never "in a row". Never in the thumb zone.
- Dock (thumb zone): Check-in chip (only when due, daytime only, 06:00 to 21:00), Begin as the 84 dp kindle ring (sun ring, flame glyph inside), then "Not today" as a frost text button. Morning first: "Not today" is the default wording; "Not tonight" is only the fallback when the session will run as a night session (night clock, 21:00 to 06:00).
- States: default; first 3 sessions (Begin label); mornings chip (streak 2 and up, daytime); camera on (pill); check-in due (chip); dark-room (section 17); night fallback ("Not tonight"). Dev chips never show here.
- Shots: `start-night`, `start-first-night`, `start-day-checkin`, `start-dark-room`.

### 11.2 How it works (`info.html`)
Modal bottom sheet over the start screen: title, Talk icon, six rows (tile plus one line), the required research line, actions "The lanterns" (opens the anchor) and "Got it". Shot `info`.

### 11.3 The lanterns (`anchor.html`)
Onboarding anchor from `questions.md` section 2, verbatim, on its own screen, never with lanterns. Headline M first sentence, Body L for the rest, "Got it". Reopened from Settings > The lanterns and from the info sheet. Shot `anchor`.

### 11.4 Settings (`settings.html`)
Top app bar (back, "Settings", Talk). Groups:
1. Sensors (info: "Only numbers leave the phone, never camera images."): Phone camera, Pulse stone, Bedside light, Bedside camera, Presence sensor, Phone movement.
2. Export to your clinic (info: "One export a day, at 07:00. Nobody watches live."): segments Summary / Skip today / Pause 7 days; when paused, a line with a shield icon "Safety answers from the check-in are still shared."; Next export (value); Home hub (address, status dot tertiary = connected, outline = offline; opens the hub dialog); What is in an export.
3. Check-in (info: "Nine short questions every 14 days, in the daytime. Your clinic will see your answers."): Check-in switch ("Every 14 days"), Second lantern after play, Language (official versions only).
4. Night: Sound, Quiet night ("Light at most 25%"), Reduced motion.
5. Help: How it works, The lanterns, Download my data.
6. Developer, only with `?dev=1`: SIMULATED badge, Simulated sensors, Input, Clock, Session, Day profile (values "Today", "Good day", "Bad day"; never "Live").
Footer: required research line. Hub dialog: router icon, "Home hub", outlined field "Hub address", supporting "Shown on the hub screen.", Cancel / Connect; errors use the amber error role ("Hub not found"). Shots `settings`, `settings-full-dev`, `settings-hub-dialog`.

### 11.5 Check-in intro (`checkin-intro.html`)
Day scheme. Talk icon; checklist tile; "Check-in."; four icon lines carrying the fixed intro text from `questions.md` (the paused line appears only when sharing is paused); filled "Start" and text "Later" (24 h snooze, only here). The C-SSRS transition screen (`?v=cssrs`) uses the same template: fixed text, single filled "Continue". Shots `checkin-intro`, `checkin-intro-paused`, `cssrs-intro`.

### 11.6 Question template (`question.html`), see section 12.

### 11.7 Thank you and Saved (`done.html`)
Talk icon, lit lantern tile, Display S "Thank you." or "Saved.", tonal "Close". Shots `thanks`, `saved`.

### 11.8 Talk, support and crisis (`crisis.html`), see section 13.

### 11.9 End screens (`end.html`)
`mood_end` (second lantern) is its own in-game screen before this one, never on it.
- Night: Kaamos dark-room, world dimmed to 55%, moon icon and "Rest well." in Jost 300 in on-surface-variant, no quote, centred high; text button "Done"; Talk icon. Bedtime mode dim.
- Morning: Kevät after the handover. A wave-edged birch-paper sheet over the lower 47%, never over the sun, rising at dawn + 8.6 s at the earliest: "Good morning." (Jost 300 40/48), the quote (Fraunces 300 21/31, `#3A3226`, at most 32 characters per line, a small source line in Sans 500 12 px), the week row (7 day lights, 16 px; today a filled sun with a 3 px `sun-container` ring) and "13 mornings" (numeral Jost 400 26 px, ticks once 600 ms after the sheet settles), Done as a filled primary pill. Talk icon top right (concept 9.2 frame 07, 12.2, 12.5).
- Low-lantern offer (either lantern was 1, at most once a day): a surface-container card above Done, "Would you like someone to talk to?", "Not now" (text) and "Yes" (tonal, opens Talk). Same for every other answer: no feedback depends on the lantern chosen.
- Fell asleep: pure black, `bedtime` moon at 14% white, no text. A touch shows a dim close button (top right, #121212, 50% white icon) for 5 s; tapping it wakes the app.
- Shots `end-night`, `end-night-offer`, `end-morning`, `end-asleep`, `end-asleep-touched`.

### 11.10 Patient view (`patient.html`)
Kevät by day, Kaamos at night (21:00 to 06:00). Layout follows concept 9.2 frame 08: a header crop of the world with a wave bottom edge, "Your mornings", "N mornings lit since <date>", This week card, Your layers card (concept 12.3: one bent ply line per morning lit, newest on top in sun, it only grows), What helped, M3 navigation bar (Today, Week, Settings). SIMULATED badge when simulated, Talk icon.
- Header (wave bottom edge, today's world crop, concept 9.2 frame 08) with the page title in Jost; the today card below it (24 corners): start lantern, dotted light path, end lantern (mood colours, no numbers), Headline S "You reached dawn." (or "Rest well." after a night ending, "You fell asleep." after falling asleep), "Today · 07:42".
- This week (info: "The lantern you picked each morning. An unlit circle means no play that day."): the week row of 7 day lights in the mood colours (concept 12.2: lit, missed as an unlit outline, frozen with a frost rim, paused set lower; today a sun ring). No streak number.
- Your layers: the strata card (concept 12.3) under "Mornings lit" (lifetime); it only grows, no dates, no gaps.
- What helped (info: "What seemed to calm you on past nights. Afferent keeps learning."): up to 3 one-line items with tonal icon tiles; an hourglass marks "Still learning".
- Privacy and export (info: "One export a day to your clinic. Nobody watches live."): export segments, Next export, What is in an export ("Lanterns, play times, sensor numbers"), Sensors ("5 of 6 on"), Download my data.
- Footer: lock "Kept on your home hub" and the research line.
- Shots `patient`, `patient-full`.

### 11.11 Clinician dashboard (`clinic.html`)
Desktop 1440x900, `clinic` scheme (Kevät light) by default, `clinic-dark` (Kaamos) as a setting (Decisions L4). Top app bar with the wordmark and the SIMULATED badge; states use the concept 3.7 colours with icon and label. Readable in 10 s: who (list), what to consider (banner), why (chart and drivers).
- Rail: lantern mark, Patients, Validation, Exports; Settings at the bottom.
- Header: Headline S "Who might need a call"; stamp with `file_save` "Export of Sat 14 Nov, 07:12 · 6 patients after TMS"; search bar; SIMULATED DATA badge; overflow menu with the demo tools (send profile, reset demo data).
- List pane (612 wide): filter chips with counts (All, Safety, Need a call, Watch, Stable); sections in this order: Safety answers (sorted high, moderate, incomplete, low per `questions.md`), Might need a call (booster before call), Watch, Stable. Row 72 tall: avatar in state colour, name, "Played Fri 07:52" or the check-in or overdue note, 14-day sparkline over the usual-range band, index and "+0.50 in 7 d", state chip with icon and label. The selected row uses surface-container-high.
- Detail pane: avatar, name, SIMULATED, "Week 9 · 6 of 7 days played", "Weekly summary" (outlined) and "Mark as seen" (tonal icon button). Banner: booster container ("Consider a booster discussion", "Above the booster line for 3 days. The clinician decides.", tag "Asked to talk") or safety in inverse-surface (shield, "Safety answer: moderate", the fixed facts: check-in time, item 9 answer, C-SSRS status, which screen was shown; tag "Follow your clinic protocol"). Early-warning index panel: Display S value, trend, 28-day chart with usual band, dashed Call 1.0 and Booster 1.5 lines, glowing lantern line. Bottom trio: Main drivers (signed bars, positive amber, negative teal), PHQ-9 (last four totals, "+N from discharge", PHQ-8 and next due date; bands are labelled severity bands, never diagnoses), facts (Last session, Data complete, Last export).
- Safety rows never come from lanterns, pulse, eyes, tasks or missed sessions. Safety uses inverse-surface, not a warning colour, so it is the most salient element without red.
- Validation keeps its existing charts restyled with clinic roles; Exports lists import and export runs.
- Shots `clinic`, `clinic-safety`.

## 12. Question screen template and flow

Binding rules from `questions.md` section 1, as layout:
- **Only** the stem (Title M, on-surface-variant; PHQ-9 stem on every item, C-SSRS header "In the past month:" on items 1 to 5) and the item (Headline M, Title L or Body L 17 by length), then the options anchored to the bottom (thumb zone). Nothing else: no app bar, no Talk icon, no progress, no close, no info, no HUD, no moving scene. Background is the plain scheme surface.
- Options: vertical list, top to bottom in form order (PHQ: Not at all, Several days, More than half the days, Nearly every day; C-SSRS: Yes, No). PHQ options carry the 0 to 3 dot glyph so the scale can be read without reading. Nothing is pre-selected.
- Tap: the option turns primary-container with a check and morphs to full (300 ms); 600 ms after the tap the next screen enters (shared axis X). A tap on another option within 600 ms replaces the answer and restarts the timer. Every option gets identical feedback (no sound or haptic that depends on the answer).
- Back: swipe from the left 16 dp edge returns to the previous item with its answer shown (built inside the WKWebView on iOS; system back on Android). Stop: swipe down, closing the app, or the VoiceOver escape gesture; the intro says this once.
- Accessibility: each option is a `role="radio"` button with an aria-label ("Several days, 1 of 3"); the screen root is `aria-live="polite"` and focus moves to the item heading on each new screen.
- Scheme: `kevat`, or `kaamos` when the OS is in dark mode. Never at night (06:00 to 21:00 only).
- Data model (`demo/js/gui/questions-data.js`): `{ stem, dots, options: [{v, label, aria}], items: [{key, header, text}], next(n, v, ctx) }`. The two sets are `phq9` and `cssrs`; wording is verbatim from `questions.md` sections 3 and 4. In code, PHQ-9 items 6 and 8 use the official long dash (U+2014) as `questions.md` requires; this spec and the mockups write it as " - " because the design docs carry no long dashes.
- Flow: start Check-in chip > intro (Start / Later) > PHQ-9 1 to 9 > branch per `questions.md` 5.3 > C-SSRS transition (Continue) > C-SSRS items with skip logic (2 = No jumps to 6; 6b only after 6 = Yes) > thank-you, support or crisis screen. Stopping before item 9 shows "Saved.".
- Shots `question`, `question-selected`, `question-long`, `question-dark`, `cssrs-question`.

## 13. Talk, support and crisis screens

One template (`crisis.html?v=talk|support|crisis`), no world behind it, scheme of the moment (Kaamos at night; Kevät after a daytime check-in; surface, not the white lowest surface, in Kevät).
- Lantern tile (primary-container), title Headline S: "If today is heavy, you do not have to carry it alone." (fixed, every variant).
- Crisis only: a primary-container banner with a call icon above the title: "If you might act on these thoughts, call 112 now."
- Support and crisis only: "Your clinic will see your answers. If you need someone now, call 112 or a helpline below." (becomes "...will see your answers on the next working day." only once a signed clinic protocol exists).
- Contacts, always this order, connected group of 80 dp rows, every row with a 56 dp call button and `tel:` link:
  1. Emergency, 112
  2. MIELI Crisis Helpline, 09 2525 0111 · in Finnish, 24 h
  3. Medical Helpline, 116117 · 24 h
  4. Your clinic, number from `clinic_contact` · office hours (placeholder 09 000 0000 until filled)
- Exactly one filled call button: **crisis = 112**; **support and talk = MIELI** (open 24 h, the gentlest first call). The others are tonal. The support and talk choice needs clinical sign-off; if the clinic prefers, switch it to their own line in office hours.
- Footer Body S: "Afferent is not an emergency service and is not watched around the clock."
- Tonal "Close" at the bottom. The screen never promises a call back.
- Shots `talk`, `support`, `crisis`.

## 14. Copy

Rules:
- Leave text out. If a hint is unavoidable, it goes into an info icon's aria-label and tooltip.
- Sentence case, no exclamation marks, no scores, no streaks, no praise for answers, no "great" or "well done".
- Morning first: "today" and "mornings" by default; "tonight" only as the fallback for night sessions (21:00 to 06:00). Fixed texts never change.
- Never "sees", "watching", "live", "monitoring", "playing now", "diagnose", "detect", "predict", "validated" (about lanterns or the index), "24/7".
- Claims follow `questions.md` section 7.
- No long dashes in UI strings, except the two official PHQ-9 items.

Full UI string list (patient app):

| Screen | Strings |
|---|---|
| Start | Begin · Not today · Not tonight (night fallback) · {n} mornings · Check-in · aria: Talk to someone, How it works, Your week, Settings, Camera on. Open sensors |
| How it works | How it works · Pick the lantern that fits right now. · Tap, hold or drag to guide the light. · Hold while the circle grows. · Falling asleep is fine. · Dawn ends the night. · Only numbers leave the phone. · Research prototype. Not a CE-marked medical device. Not for clinical use. · The lanterns · Got it |
| The lanterns | Each time you play, you will see five lanterns. Tap the one that matches how you feel right now. The dimmest, coolest lantern is the lowest you feel. The brightest, warmest lantern is the best you feel. There is no wrong answer, and you can skip by waiting. · Got it |
| Settings | Settings · Sensors · Phone camera · Pulse stone · Bedside light · Bedside camera · Presence sensor · Phone movement · Export to your clinic · Summary · Skip today · Pause 7 days · Safety answers from the check-in are still shared. · Next export · Home hub · What is in an export · Check-in · Every 14 days · Second lantern after play · Language · English · Night · Sound · Quiet night · Light at most 25% · Reduced motion · Help · How it works · The lanterns · Download my data · Research prototype. Not a CE-marked medical device. Not for clinical use. |
| Settings hints (aria) | Only numbers leave the phone, never camera images. · One export a day, at 07:00. Nobody watches live. · Nine short questions every 14 days, in the daytime. Your clinic will see your answers. |
| Hub dialog | Home hub · Hub address · Shown on the hub screen. · Cancel · Connect · Connected · Offline · Hub not found |
| Developer (dev only) | Developer · SIMULATED · Simulated sensors · Input · Autoplay story · Touch · Clock · Night · Morning · Session · Full · Short · Day profile · Today · Good day · Bad day |
| Check-in intro (fixed) | Check-in. · Nine short questions about the last 2 weeks. · Your clinic will see your answers. This is not watched around the clock. · Sharing is paused, but answers about your safety still reach your clinic. · You can stop at any time by swiping down. · Start · Later |
| Questions (fixed) | PHQ-9 stem, items and options, C-SSRS transition ("A few more questions, so your clinic can understand. Answer yes or no." · Continue), headers and items, Yes, No: all verbatim from `questions.md` |
| Done | Thank you. · Saved. · Close |
| Talk, support, crisis (fixed) | If you might act on these thoughts, call 112 now. · If today is heavy, you do not have to carry it alone. · Your clinic will see your answers. If you need someone now, call 112 or a helpline below. · Emergency · MIELI Crisis Helpline · in Finnish, 24 h · Medical Helpline · 24 h · Your clinic · office hours · Afferent is not an emergency service and is not watched around the clock. · Close · aria: Call 112, Call MIELI Crisis Helpline, Call Medical Helpline, Call your clinic |
| End | Rest well. · Good morning. · {n} mornings · Morning note · Would you like someone to talk to? · Not now · Yes · Done · aria: Fell asleep. Tap to wake, Close |
| Patient view | Your mornings · {n} mornings lit since {date} · This week · Your layers · Mornings lit · Your week · You reached dawn. · You fell asleep. · Today · What helped · Still learning · Privacy and export · Summary · Skip today · Pause 7 days · Next export · What is in an export · Lanterns, play times, sensor numbers · Sensors · 5 of 6 on · Download my data · Kept on your home hub · Research prototype. Not a CE-marked medical device. Not for clinical use. · SIMULATED |
| Patient hints (aria) | The lantern you picked each morning. An unlit circle means no play that day. · What seemed to calm you on past nights. Afferent keeps learning. · One export a day to your clinic. Nobody watches live. |
| Notification (fixed) | Your check-in is ready when you are. |

Clinic strings: Who might need a call · Export of {date}, {time} · {n} patients after TMS · Search patients · SIMULATED DATA · Patients · Validation · Exports · Settings · All · Safety · Need a call · Watch · Stable · Safety answers · Might need a call · Played {day} {time} · Check-in {day} {time} · Check-in overdue · {delta} in 7 d · Safety: high / moderate / incomplete / low · Booster talk · Consider a call · Week {n} · {k} of 7 days played · Weekly summary · Mark as seen · Consider a booster discussion · Above the booster line for {n} days. The clinician decides. · Asked to talk · Safety answer: {tier} · Follow your clinic protocol · C-SSRS not asked; tier from item 9 · known lifetime behaviour, unchanged since last check-in · check-in stopped before the safety item · Early-warning index · 28 days · Usual range · Call 1.0 · Booster 1.5 · Main drivers · PHQ-9 · {n} from discharge · PHQ-8 · due {date} · residual symptoms at discharge · Last session · Data complete · Last export · Send profile to Anna's phone · Good day · Bad day · Today · Reset demo data · Research prototype. Not a CE-marked medical device. Not for clinical use.

## 15. Export wording

The clinic never watches; it receives a daily export (07:00, from the home hub). Replace every "Your clinic sees", "Clinic sees", "Live", "Live now", "Playing now":

| Old | New |
|---|---|
| Your clinic sees (settings, patient) | Export to your clinic / Privacy and export |
| Not tonight (export choice) | Skip today (value `nothing_tonight` unchanged) |
| Pause 7 days | Pause 7 days (value `paused`; safety answers still shared) |
| Your clinic sees a note on the next working day | Your clinic will see your answers. (fixed text from `questions.md`) |
| Your clinic will see this on the next working day (self-harm note) | removed; the support or crisis screen carries the fixed line |
| Live / Live now / Playing now (clinic) | Export of {date}, {time} / Played {day} {time} |
| Live sensors (demo profile) | Today |
| Hub: offline | Offline (status dot outline) |

## 16. Accessibility

- Touch targets 48x48 minimum everywhere (Begin 84, answers 72, contacts 80 with 56 call buttons, primary buttons 56). 32 dp chips and the 24 dp privacy pill get a 48 dp `::before` hit area.
- WCAG 2.2 AA: all text pairs at least 4.5:1 (most above 7:1), non-text outlines at least 3:1 (section 3.5). The generator enforces it.
- No colour-only meaning: icons and labels on every state, check icons on selected controls, dashed outline for a missed night, dot glyphs on PHQ options.
- Never red: no red hue in any role; error is amber-orange; booster orange is clamped above hue 55; safety uses inverse surface.
- Screen readers: every icon button has an aria-label (the info hints live there); switches are `role="switch"`; answers are radios with spoken labels; the lantern options read "Lantern 1 of 5, lowest" to "Lantern 5 of 5, highest" (in-game). Dynamic screens use `aria-live="polite"` and move focus to the heading.
- Reduced motion: OS setting or the in-app switch (section 8).
- Text scaling: layouts reflow to 200%; question items switch to the next smaller scale step before ever scrolling; fixed texts wrap, never truncate. Clinic rows may truncate the secondary line with an ellipsis and full text in the title attribute.
- Gestures always have an alternative: system back, VoiceOver escape and Switch Control (per `questions.md` open risk 10).
- Lantern order must hold in grayscale and under Night Shift; brightness is the primary cue.

## 17. Dark-room mode

For lying in bed at night with the brightness low:
- On automatically between 21:00 and 06:00 when Quiet night is on, or always at night when the ambient light sensor (if available) reads under 5 lux. Set as `data-room="dark"` on `<html>`.
- Effects (Kaamos dark-room, concept 3.3): on-surface `#B1BCD4` (9.3:1), primary `#CFA62E` (tone 70), outline `#5A6884`, glow strength halved, the world drawn at 60% brightness. All text pairs stay AA (on-surface-variant 5.98:1).
- Never a light surface at night; Kevät is not used between 21:00 and 06:00. Lowest surfaces are near black (tone 1 to 3), never pure white glyphs on pure black except the fell-asleep moon at 14%.
- Shot `start-dark-room`.

## 18. Implementation file plan (3 engineers, no shared files)

Shared, read-only for everyone: `design/gui-tokens.css`, `design/gui-tokens.json`, `design/questions.md`, this file. Regenerate tokens only through the generator (owner: engineer A).

**Engineer A: system and app shell** (start, info, anchor, settings, end, theme)
- New: `demo/fonts/` (copy `design/mockups/final/fonts/*` plus JetBrains Mono), `demo/css/gui/fonts.css`, `demo/css/gui/m3.css` (components from the mockup), `demo/css/gui/shell.css` (start, sheet, settings, end), `demo/js/gui/theme.js` (runtime dynamic colour, section 3.4, dark-room and motion attributes), `demo/js/gui/lantern.js` (glyph), `demo/js/gui/shell.js` (start dock states, info sheet, anchor, settings incl. hub dialog and dev group, end screens and fell asleep).
- Edits: `demo/index.html` (replace the `#start`, `#end`, `#info`, `#settings` markup, link `design/gui-tokens.css` and the new CSS, add empty mount points `#checkin-root` and `#support-root` for engineer B), `demo/js/main.js` (wire screens, remove dev chips from start, call `theme.js` on stage change), retire `demo/css/flow-ui.css` and the GUI parts of `demo/style.css` and `demo/css/game-ui.css`.
- Also owns `design/mockups/final/tools/gen-gui-tokens.mjs` and token regeneration.

**Engineer B: check-in, safety screens and patient view**
- New: `demo/js/gui/questions-data.js` (sets from `questions.md`, verbatim), `demo/js/gui/checkin.js` (intro, question template, 600 ms advance, edge swipe back, swipe-down stop, C-SSRS skip logic, thank-you and saved, renders into `#checkin-root`), `demo/js/gui/support.js` (talk, support, crisis template, contacts from config, renders into `#support-root`, exposes `openSupport(variant)` for engineer A's Talk icons), `demo/css/gui/checkin.css`, `demo/css/gui/support.css`.
- Edits: `demo/patient.html`, `demo/js/patient.js`, `demo/css/patient.css` (full rewrite to section 11.10).
- Contract with A: A calls `window.AfferentCheckin.open()` from the Check-in chip and `window.AfferentSupport.open('talk')` from every Talk icon; B never edits `index.html` or `main.js`.

**Engineer C: clinician dashboard**
- Edits: `hub/afferent_hub/web/clinic/index.html` (rail, header, list-detail shell, link `/design/gui-tokens.css` and fonts from `/app/fonts/` or a copy under the clinic folder), `clinic.css` (rewrite from `design/mockups/final/css/clinic.css`), `views.js` (list grouped by safety, need, watch, stable; detail pane; export stamp; remove "Live" and "Playing now"), `charts.js` (sparkline with band, 28-day chart with thresholds and glow, signed driver bars, PHQ-9 bars), `clinic.js` (selection by `?p=` or hash, filters, overflow demo menu).
- New: `hub/afferent_hub/web/clinic/fonts.css` if the hub cannot serve `demo/fonts`.
- Never touches `demo/`.

Order: A lands `m3.css`, fonts and `theme.js` first (day 1); B and C work against the mockup CSS until then. Each engineer runs `design/mockups/final/tools/shoot.js` against their screens for a visual diff against `shots/`.

## 19. Open points

1. Clinical sign-off: which contact is filled on the support and talk screens (MIELI proposed), the clinic number, and "next working day" wording once a protocol exists.
2. Dark-room auto trigger by ambient light needs a native plugin on iOS; until then Quiet night drives it.
3. The per-stage sky refinement (3.4 step 5) is optional: Kaamos and Kevät alone carry the story; measure the re-quantized kaamos hue before enabling it.
4. Call (amber) and booster (orange) containers are close in hue; icon and label carry the difference. Re-test with deuteranopia simulation in the pilot.
5. The C-SSRS licence gate (`questions.md` section 4) applies before any real patient sees the Yes/No screens; the mockup shows them on simulated data only.
6. The end-screen hero texts on the patient view ("You fell asleep.") are new copy and need the same review as other strings.
7. Icon reconciliation with concept 8 is partial: the Talk glyph moves to `support` and the laminate, flame, sun-on-horizon and arch glyphs are specified; the lantern glyph's remaining uses (Your week, thank-you tiles) and the 44 px Talk circle versus 48 dp targets need a mockup pass.
8. `gui-tokens.*`, `css/fonts.css`, `css/m3.css`, `start.html`, `end.html`, `done.html` and `opening.js` still need the concept 15.5 changes; until the generator is rerun the mockups show the old amber schemes.
