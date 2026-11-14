# Demo script

Two products: the 2:00 video (shot Sat 20:30 to 22:30) and the 3:00 live stage pitch (plus 3:00 Q&A).

## Labelling rules

- The two-week dashboard data is **simulated**. A "SIMULATED DATA" label stays in a fixed corner whenever it is on screen, in the video and on stage.
- Good day and bad day are **"demo profile: good day"** and **"demo profile: bad day"**, shown as a small caption. Never "a patient's bad day".
- If the stage demo uses the hidden dawn trigger or the backup clip, the presenter says so in one sentence.
- Presence (visitors) is labelled simulated unless it runs live.
- The tagline "When the center of gravity moves, someone is there." appears exactly once in each product: the final card of the video and the final sentence of the stage pitch. Nowhere else, not in the deck title.

## 1. Video, 2:00

Set: a dark bedroom set (bed, bedside table with the Afferent unit), one dim practical lamp off-frame for exposure. Actor plays the patient. Phone screen recorded in parallel (QuickTime over cable) and composited.

| Time | Picture | Sound / caption |
|---|---|---|
| 0:00-0:08 | Dark bedroom, phone glow on a face. The bedside unit glows dim warm | Caption: "Weeks of daily TMS. Then the clinic goes quiet." |
| 0:08-0:20 | The patient at home, days passing (window light changes) | VO: "After a TMS course, nobody sees how someone is doing at home. Afferent is supportive home maintenance. Not treatment." |
| 0:20-0:32 | **Wow 1:** the bedside camera image of the patient dissolves into a stick figure on the dashboard. Shot as its own lit setup (practical lamp at full) before the dark shots, because body pose needs light | Caption: "Frames never stored. Never sent." |
| 0:32-0:42 | Split screen, the first 10 s of the session: "demo profile: good day" left, "demo profile: bad day" right. Fog, stars, warmth and pace visibly differ | Caption: "Same ritual every night. The world adapts to the day." |
| 0:42-1:05 | Bad-day session sped up 2x with real-time inserts: calibration lantern, lantern check-in, lake flash and blink (the ice cracks with blue light), the world warming when the pulse rises. A small dashboard inset captioned "clinic view" shows the pulse from the bedside stone. No numbers in the patient view | Caption on the lake: "Blink reaction time. Compared only with yourself." |
| 1:05-1:20 | Sauna in real time: eyes close, the screen dims, haptic and pad pacing. Eyes open, green northern lights fill the sky | Soft piano, pad resolves on the frame the eyes open |
| 1:20-1:32 | **Wow 2:** lighthouse, eyes wide, dawn sweep. In the room, the real bedside light rises in the same colour. Side shot of the face lit by the screen | Full piano phrase |
| 1:32-1:50 | **Wow 3:** clinic dashboard, two weeks in 20 s compressed to 18 s, SIMULATED DATA label. Trend lines (reaction time, mood, missed nights) drift from the personal baseline band. "Suggest review" card. The Gemma note "generated on device" beside its source numbers | VO: "When two of three measures drift from their own baseline for about a week, the care team gets a note. The clinician decides." |
| 1:50-1:56 | **Wow 4:** the patient presses the knob. The LED blinks once, the stick figure vanishes from the dashboard | Caption: "Every sensor is the patient's to switch off." |
| 1:56-2:00 | Final card on black, then the logos (Jetson, Arduino UNO Q, Gemma on device) | "When the center of gravity moves, someone is there." |

Simulated in the video: the 14-day dataset, the passing days montage. Real: the game, ARKit input, KY-039 pulse, bedside light, stick figure, camera off, Gemma note generation.

## 2. Stage pitch, 3:00

Roles: David presents. Alex plays the demo profile on stage (an actor, not a patient). Romain runs the dashboard laptop. Vlad stands by the router and bedside unit.

Screen layout on the projector: left, the phone mirrored (cable to laptop). Right, the clinic dashboard with the live stick figure and a "UNO Q" panel (live pulse, sensor states).

Stage demo mode: a build flag that starts the session at the lake with 3 trials, then sauna with 2 breaths, then lighthouse and dawn. It uses the live face input and live pulse. It loads a stored calibration for Alex (eyes and resting pulse), saved at the 19:00 rehearsal, logged as `cal.source: stored`; raw defaults if it is missing. About 45 s. "Stage mode" allows the bedside light at full brightness. Lake trials reach the dashboard through the `lake_trial` message.

| Time | Action | Live / recorded / simulated |
|---|---|---|
| 0:00-0:20 | David holds the phone, the bedside unit glows dim beside him. "After weeks of daily TMS, patients go home. And then nobody sees how they are doing until something goes wrong." | live |
| 0:20-0:45 | The approach in one breath: "Afferent is a two-minute game that reacts to your body, and a bedside unit that compares you only with yourself. We measure reaction time, eye response and pulse, based on established lab paradigms. Everything stays on device." Add "head angle" only if the forest ships at 16:00, and "effort choices" only if the fork ships. | live |
| 0:45-1:30 | **Live demo mode** (Alex, demo profile: bad day): 3 lake flashes, blink reaction time appears in ms on the dashboard panel (clinic side only), sauna with 2 breaths and eyes closed, aurora on opening, lighthouse, dawn. The real bedside light comes up on stage. | live (declared fallback: hidden dawn trigger, then the backup clip) |
| 1:30-1:50 | The live stick figure of Alex on the dashboard from the bedside camera. Romain or Alex presses the knob: LED blinks, the figure vanishes. "The patient owns every sensor." | live |
| 1:50-2:25 | Dashboard, two weeks in 20 s, SIMULATED DATA label. "If two of three measures, reaction time, the mood check-in and missed nights, drift from your own baseline for about a week, the care team gets a note to take a look. Saying not tonight never counts against you. A booster session is one option. The clinician decides. Afferent never books TMS. This is a starting rule for a pilot, not a validated cut-off." The Gemma note, generated offline on the Jetson. | simulated data, live generation |
| 2:25-2:50 | Safety and privacy: "No emotion detection, no microphone, no video leaves the room. Crisis support is a fixed card with the clinic and 112, never AI, and it is not an emergency service." Next step: "a pilot with TMS responders, against routine clinic scales." | live |
| 2:50-3:00 | "When the center of gravity moves, someone is there." | live |

### Q&A prepared answers

1. **"Is there evidence this predicts relapse?"** "No, and we do not claim it. Each signal has an established association with depression in lab settings. We compare only with the person's own baseline and give the clinician an early warning. Validation is the pilot."
2. **"Why would anyone play this in week 8?"** "Under two minutes, optional, and there is nothing to fail. Every session reaches dawn. Not playing is also data the trend sees, and it never triggers a reminder storm."
3. **"A camera in the bedroom, really?"** "Frames never leave the phone or the box. The clinic sees a stick figure and numbers, and every sensor has its own off switch. You just watched one."
4. **"Blink reaction time is not a standard RT measure."** "Correct. It includes blink latency, so we only compare it within the same person, device and input. We log the modality for exactly that reason."
5. **"What does Gemma do?"** "It writes a short weekly note for the clinician from the numbers, offline on the Jetson, shown next to those numbers. It never talks to the patient and never gives advice."
6. **"What if someone is in crisis?"** "Only the patient's own answers trigger the crisis card, which is fixed text with the clinic, 112 and the MIELI Crisis Helpline. A self-harm answer goes to a named clinic contact, reviewed within one working day, and the card says so plainly. Sensors never trigger alarms, because a false alarm at night is harmful too."

## 3. Shoot checklist (20:30)

- Both iPhones charged, Do Not Disturb on, brightness fixed, Reduce Motion off.
- Travel router up, Jetson and UNO Q on, light at stage mode for the video's dawn shot only.
- Dashboard seeded with the simulated 14-day dataset, label visible.
- Shots in order: lit setup first (stick figure dissolve, knob press and vanish), then dark setup: dawn plus bedside light (hero, 5 takes), sauna eyes close and open (3 takes), split-screen captures of both profiles (screen recording), lake inserts, bedroom establishing shots, dashboard screen capture.
- Record a clean full stage-mode run as the stage backup clip.
