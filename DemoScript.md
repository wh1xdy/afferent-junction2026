# Demo script (v3: three dimensions, one loop)

The story: **Anna finished TMS eight weeks ago. A two-minute game in the morning, a bedside unit that compares her only with herself, and a clinic view that suggests who might need a call.** Sense (everyday plus game), respond (game tasks, bedside light, a suggested call), learn what helps this person.

## Labelling rules

- All patients and their 8-week histories are SIMULATED. The dashboard and the patient view carry the SIMULATED badge; say "simulated" once out loud when the dashboard first appears.
- A vital from the simulator or the debug slider is labelled SIMULATED on screen; say so.
- The summary card shows "Template" unless Gemma runs on the hub. Say "template summary, Gemma when it runs on the Jetson" unless the chip says Gemma.
- Words: supportive, maintenance, early warning, suggests. Never: treats, prevents relapse, diagnoses, detects emotions, HRV, clinically validated.
- The tagline "When the center of gravity moves, someone is there." appears once: the last card of the video and the last sentence of the pitch.

## Before every take or stage run

1. `./start.sh --reset` on the hub laptop or Jetson (or `curl -X POST localhost:8000/api/demo/reset`).
2. Phone app: Settings > Hub address set, "Hub: connected". Clock chip on "clock: morning" for the dawn story.
3. Dashboard open at `/clinic/` on the projector, list view.

## 1. Video, 2:00

| Time | Picture | Sound / caption |
|---|---|---|
| 0:00-0:08 | Dark bedroom, phone glow, bedside unit with the pulse stone | "Weeks of daily TMS. Then the clinic goes quiet." |
| 0:08-0:16 | Anna takes the phone, taps Begin | VO: "Afferent is a two-minute game for home maintenance after TMS. Not treatment. Support." |
| 0:16-0:30 | **Dimension 2, the fixed core:** the lantern glows (rest pulse), Anna picks a mood lantern, taps when the lighthouse flares (5 times) | "Twenty seconds, the same every day: pulse, mood, reaction time." |
| 0:30-0:50 | **Inner loop:** pulse is raised, the island turns to the warm sauna and the breathing circle appears; the clinic inset (live card) shows mode "calm" and the pulse bending down | "High pulse: the game slows down with you." |
| 0:50-1:02 | The Fork (short path or the climb), then Two lanterns | "Two tiny lab tasks: effort and reward sensitivity." |
| 1:02-1:12 | Dawn in the game; the real bedside light fades up to warm amber | "When the game reaches dawn, the room does too." |
| 1:12-1:22 | **Dimension 1:** bedside unit close-up; dashboard "Everyday" card: time in bed, sleep regularity, morning pulse, home-only days (SIMULATED) | "The bedside unit notices sleep and routine with zero effort." |
| 1:22-1:42 | **Dimension 3, the live moment:** dashboard list "Who might need a call"; Anna's row flashes, toast "Anna updated"; open Anna: early-warning index against her own baseline band, state "Consider discussing a booster session", drivers reaction time, sleep regularity, mood | "Compared only with her own first two weeks. It suggests; the clinician decides." |
| 1:42-1:52 | "What helps Anna": Breath with its uncertainty bar; Validation tab, 13 days from simulated onset to a suggested call | "It learns what brings her pulse down, and shows how sure it is." |
| 1:52-2:00 | Black, logos (Jetson, Arduino UNO Q, Gemma) | "When the center of gravity moves, someone is there." |

Real in the video: the game, the director, eye closure (ARKit), the bedside light, the live dashboard update. Simulated: the 8-week histories, the validation cohort, any vital marked SIMULATED.

## 2. Stage pitch, 3:00

Roles: David presents. Alex plays the patient (an actor). Romain runs the dashboard. Vlad stands by the hub and the bedside unit.

Projector: left the phone mirrored, right the dashboard. Use the stage chip ("stage mode (60 s)") in the Settings card if time is tight; otherwise a full session takes about 100 s.

| Time | Action | Live or simulated |
|---|---|---|
| 0:00-0:20 | David with the phone and the glowing unit: "After weeks of daily TMS, patients go home, and nobody sees how they are doing until something goes wrong." | live |
| 0:20-0:35 | "Afferent has three parts: a two-minute game that measures and adapts, a bedside unit that watches everyday rhythm, and a clinic view that compares each person only with themselves." | live |
| 0:35-1:35 | **Live loop:** Alex taps Begin. The dashboard row shows "Playing now" and the live card shows mode, pulse and eye closure. The game picks a calm task while the pulse is high; at dawn the bedside light rises on stage. When the session ends, Anna's row flashes and the toast shows the new index. | live game, SIMULATED history |
| 1:35-2:15 | Open Anna. "Her early-warning index left her own baseline band in week 5. The cumulative sum crossed the call line and then the booster line. Mostly reaction time, sleep regularity and mood. Afferent suggests discussing a booster; the clinician decides." Show "What helps Anna" and the weekly summary. | SIMULATED data |
| 2:15-2:35 | Validation tab: "On 50 simulated relapses the flag came a median of 13 days after onset, while the relapse was still building, with 3 false call episodes across 50 stable patients over six weeks. Simulated and not clinically validated; the pilot is the validation." | SIMULATED |
| 2:35-2:50 | "No emotion detection, no microphone, no video leaves the room; the clinic sees numbers and a stick figure. At night the game lets you sleep. Crisis support is a fixed card with the clinic, 112 and the MIELI helpline, never AI." | live |
| 2:50-3:00 | "When the center of gravity moves, someone is there." | live |

Which story the live session tells: playing well (live or good day) moves Anna's index down a little, because one good morning counts against a bad week. To show a worsening point instead, set the profile to "bad day" (dashboard Demo menu or the "day:" chip): the autoplay then picks the dimmest lanterns but one, reacts slowly and avoids effort, and the index rises a little. Rehearse the one you choose.

### Q&A prepared answers

1. **"Does this predict relapse?"** "No, and we do not claim it. It is an early warning against the person's own baseline. On simulated data the flag comes about two weeks after a gradual relapse starts; real validation is a pilot against routine clinic scales."
2. **"Why combine signals instead of a mood question?"** "Held to the same number of false alarms, mood alone flagged about 3 days later and missed 6 to 14% of simulated relapses that the combined index caught. Simulated, so treat it as a design argument, not evidence."
3. **"Isn't keeping someone awake harmful?"** "Only morning sessions try to wake you. At night, if the eyes stay closed for 30 seconds, the session ends quietly and the light stays off."
4. **"Why would anyone play this in week 8?"** "Under two minutes, nothing to fail, and it is different every time because it follows the body. Saying not today never counts against you."
5. **"A camera in the bedroom?"** "The phone camera gives eye openness and head tilt as numbers; frames never leave the phone. The bedside camera, if on, becomes a stick figure. Every sensor has its own switch."
6. **"What does the bandit learn?"** "Which task moves this person's pulse in the intended direction, with Thompson sampling. In simulation the best calm task is settled after a median of 11 sessions; for wake tasks the dashboard honestly shows it is still uncertain."
7. **"What does Gemma do?"** "A short weekly note for the clinician, rephrasing the computed numbers on the hub. It never advises and never talks to the patient. Without Gemma a fixed template writes the same note."

## 3. Shoot checklist

- iPhone charged, Do Not Disturb, brightness fixed, Hub address set, demo reset.
- Hub, router and UNO Q on; pulse stone tested; dashboard at `/clinic/`.
- Shots: morning session with dawn and room light (3 takes), calm task with raised pulse (3 takes), dashboard live update (screen recording), Anna detail and Validation tab (screen recording), bedside close-ups.
- Record a clean stage-mode run as the stage backup clip.
