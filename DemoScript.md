# Demo script (v2, adaptive game)

The story to show: **the same game becomes a different game depending on the body.** A raised pulse brings calm tasks, eyes that keep closing bring a wake-up, a flat pulse brings lively tasks, and the bedside light follows.

## Labelling rules

- Two weeks of dashboard data are **simulated**; a "SIMULATED DATA" label stays in a fixed corner whenever they are on screen.
- If a vital comes from the dashboard slider instead of the sensor, the pulse readout says "simulated" and the presenter says so.
- The tagline "When the center of gravity moves, someone is there." appears exactly once in each product: the last card of the video and the last sentence of the pitch.

## 1. Video, 2:00

Set: bedroom in morning twilight, bedside unit with the pulse stone, actor plays the patient. Phone screen recorded in parallel and composited. Dashboard inset captioned "clinic view" whenever vitals are shown; no numbers in the patient view.

| Time | Picture | Sound / caption |
|---|---|---|
| 0:00-0:08 | Dark room, phone glow, a fingertip resting on the glowing stone | "Weeks of daily TMS. Then the clinic goes quiet." |
| 0:08-0:18 | Days passing at home | VO: "Afferent is a two-minute game for home maintenance after TMS. Not treatment. Support." |
| 0:18-0:28 | **Wow 1:** the bedside camera image dissolves into a stick figure (lit setup) | "Frames never stored. Never sent." |
| 0:28-0:36 | The fixed core: the lantern flares, the thumb taps | "Twenty seconds, the same every day: start pulse and reaction time." |
| 0:36-0:58 | **Wow 2, calm:** the actor has just come up the stairs; clinic inset shows the pulse high; the island turns to the warm sauna, the breathing circle appears, the thumb holds and releases, the pulse curve in the inset bends down | "High pulse: the game slows down with you." |
| 0:58-1:16 | **Wow 3, tired:** eyes keep falling shut; the shore turns bright, shutters swipe open, the real bedside light rises to daylight | "Eyes keep closing in the morning: a gentle wake-up." |
| 1:16-1:30 | **Flat:** fireflies and the lighthouse beam, faster music; split-screen strip of three sessions showing three different islands | "Low pulse: it brings you up. No two sessions are the same." |
| 1:30-1:36 | Dawn, full colour, the room light rises | Piano phrase |
| 1:36-1:52 | **Wow 4:** dashboard, two weeks in 20 s (SIMULATED DATA); reaction time and mood drift from the personal band; "Suggest review"; panel "what brings this person's pulse down: breath, löyly"; Gemma note "generated on device" | VO: "When two of three measures drift for about a week, the care team gets a note. The clinician decides." |
| 1:52-1:56 | Knob press, LED blinks, the stick figure vanishes | "Every sensor is the patient's to switch off." |
| 1:56-2:00 | Black, logos (Jetson, Arduino UNO Q, Gemma on device) | "When the center of gravity moves, someone is there." |

Real in the video: the game, the director, the pulse stone (if the 12:00 gate passed), eye closure, bedside light, stick figure, Gemma generation. Simulated: the 14-day dataset; any vital marked simulated.

## 2. Stage pitch, 3:00

Roles: David presents. Alex plays (an actor, not a patient). Romain runs the dashboard. Vlad stands by the router and unit.

Projector: left the phone mirrored, right the dashboard with the live mode panel (mode, pulse curve, fatigue) and the stick figure.

**Stage mode** (build flag): skips the core, loads Alex's stored baseline from the 19:00 rehearsal, plays about 60 s. Before walking on stage, Alex does 20 squats so the pulse is really raised.

| Time | Action | Live / simulated |
|---|---|---|
| 0:00-0:20 | David with the phone and the glowing unit: "After weeks of daily TMS, patients go home, and nobody sees how they are doing until something goes wrong." | live |
| 0:20-0:40 | "Afferent is a two-minute game that adapts to your body, and a bedside unit that compares you only with yourself. We measure reaction time, pulse and signs of tiredness, based on established lab paradigms. Everything stays on device." | live |
| 0:40-1:05 | **Live, calm:** Alex's finger on the stone, pulse high from the squats. The game opens the breathing task; the dashboard shows mode "calm" and the pulse curve. | live (fallback: slider, said "simulated") |
| 1:05-1:30 | **Live, tired:** Alex closes the eyes a few times on purpose. Within seconds the shore turns bright, the shutters task opens, the bedside light rises on stage. "Same game, different body, different game." | live |
| 1:30-1:45 | Knob press: the stick figure vanishes. "The patient owns every sensor." | live |
| 1:45-2:20 | Dashboard, two weeks in 20 s (SIMULATED DATA), Suggest review, "what calms this person", Gemma note generated offline. "If two of three measures drift from your own baseline for about a week, the care team gets a note. Saying not tonight never counts against you. The clinician decides; Afferent never books TMS. A starting rule for a pilot." | simulated data, live generation |
| 2:20-2:50 | "No emotion detection, no microphone, no video leaves the room. At night the game never fights tiredness; it lets you sleep. Crisis support is a fixed card with the clinic and 112, never AI, and not an emergency service." Next step: a pilot with TMS responders against routine clinic scales. | live |
| 2:50-3:00 | "When the center of gravity moves, someone is there." | live |

### Q&A prepared answers

1. **"Is there evidence this predicts relapse?"** "No, and we do not claim it. Reaction time and mood have established associations with depression in lab settings. We compare each person with their own baseline and give the clinician an early warning. Validation is the pilot."
2. **"Is the adaptation itself therapeutic?"** "We claim support, not treatment. Slow breathing at six per minute has moderate evidence, morning light has good evidence. What we can show is the person's own response: the dashboard records which tasks bring this person's pulse down."
3. **"Isn't keeping someone awake harmful?"** "Only in the morning. At night the game never fights tiredness; if the eyes stay closed for 30 seconds it ends quietly and the light stays off."
4. **"Why would anyone play this in week 8?"** "Under two minutes, nothing to fail, and it is different every time because it follows your body."
5. **"A camera in the bedroom?"** "The phone camera reads one number, whether the eyes are closed. Frames never leave the device, and every sensor has its own switch."
6. **"What does Gemma do?"** "A short weekly note for the clinician from the numbers, offline on the Jetson, shown beside the numbers. It never talks to the patient."

## 3. Shoot checklist

- Both iPhones charged, Do Not Disturb, brightness fixed.
- Router, Jetson and UNO Q on; pulse stone tested with the actor's finger; dashboard seeded with the simulated dataset.
- Shots: lit setup first (stick figure, knob press), then twilight: calm after stairs (3 takes), tired with eyes closing (3 takes), fireflies, dawn plus room light (5 takes), three-session split strip (screen recordings), dashboard capture.
- Record a clean stage-mode run as the stage backup clip.
