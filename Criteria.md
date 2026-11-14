# Judging criteria mapping

Challenge "Beyond the Clinic" (Aalto, brain stimulation group). Four criteria, 25% each. Every feature maps to at least one. All patient data shown in the demo is SIMULATED and labelled so on screen; validation numbers are from synthetic data, not clinically validated.

## 1. Usefulness: could it really help people stay well at home?

| What we built | Where to see it in the demo | Pitch sentence |
|---|---|---|
| Personal baseline per feature (first 14 days, median and MAD), robust z-scores, EWMA, composite early-warning index with visible weights and contributions | Dashboard > Anna: index chart with baseline band, "Mostly" drivers, contributions panel | "Afferent compares each person only with their own first two weeks after TMS." |
| One-sided CUSUM with four states: stable, watch, consider a check-in call, consider discussing a booster session | Dashboard list "Who might need a call", sorted by need; state chip and "since day" on each row | "It suggests who might need a call this week; the clinician decides." |
| Synthetic validation: 50 relapse and 50 stable simulated patients, flag a median of 13 days after a gradual relapse starts, 100% flagged, 0.043 false calls per patient-month | Dashboard > Validation tab; `Validation.md` | "On simulated patients the flag arrives while the relapse is still building, with about one false call per two patient-years." |
| Live loop: a session played on the phone updates the dashboard row, index and timeline within seconds | Phone plays, dashboard toast "Anna updated", row flashes, "Playing now" pill | "Two minutes on the phone in the morning, and the clinic sees it before the coffee is done." |
| Fixed crisis path: dimmest lantern twice or "Talk to someone" shows a fixed card (clinic, 112, MIELI 09 2525 0111) and a note for the clinic | Speech bubble icon in the game; red banner on the patient's detail page | "Crisis support is a fixed card with real numbers, never AI." |
| Weekly summary for the clinician (Gemma on the hub when installed, guarded template otherwise) | Dashboard > patient > summary card ("Template" or "Gemma" chip) | "A short weekly note, written from the numbers, on the hub, never in the cloud." |

## 2. Ease of use: would someone recovering from depression use it every day?

| What we built | Where to see it in the demo | Pitch sentence |
|---|---|---|
| Wordless game under two minutes, one finger, nothing to fail, no scores, no red | Phone: Begin, lantern check-in, short tasks, dawn | "Under two minutes, nothing to fail, different every day." |
| "Not tonight" / "Not today" is one tap and never counts against the patient | Start screen | "Saying not today is data, never a failure." |
| Night mode never fights tiredness: eyes closed for 30 s ends the session quietly, light stays off | Desktop panel preset "eyes closed" with `clock=night`, or the camera | "At night the game lets you sleep." |
| Patient view: week as a ribbon of colours, what helped, per-sensor privacy switches, what the clinic sees | `patient.html?patient=anna` | "Every sensor is the patient's to switch off." |
| Reduced motion setting, offline outbox, labelled simulator when a sensor is missing | Settings card | "It still works when the Wi-Fi or a sensor does not." |

## 3. Smart sensing: clever use of home measurements, learning what works per person

| What we built | Where to see it in the demo | Pitch sentence |
|---|---|---|
| Standardised core each session: resting pulse, blink rate, eye openness, head pitch, ambient light, lantern mood, 5 reaction-time trials | Phone, first 20 s; dashboard "Recent sessions" start-to-end table | "Every session starts with the same 20-second measurement, so days are comparable." |
| Measurement tasks from lab paradigms: effort choice at the Fork, reward bias (signal-detection log b) in Two lanterns | Phone slots 1 and 3; dashboard drivers "Effort choice", "Reward bias" | "Two tiny lab tasks hidden in a game: effort and reward sensitivity." |
| Inner loop: the director reads pulse and eye closure (ARKit on iPhone, MediaPipe in the browser) and picks calm, wake or lively tasks; bedside light follows | Phone with the debug panel or dashboard live card (mode, pulse, PERCLOS, stick figure) | "Same game, different body, different game." |
| Everyday signals from the bedside unit and phone: time in bed, sleep regularity (inter-daily stability), morning pulse, home-only days, missed sessions | Dashboard "Everyday" card | "The bedside unit notices sleep and routine drift with zero effort from the patient." |
| Thompson-sampling bandit per person on a "helped" outcome (pulse moved 2 bpm in the intended direction); weights sent to the phone at every session | Dashboard "What helps Anna" with uncertainty; Validation tab bandit chart | "It learns which tasks bring this person's pulse down, and shows how sure it is." |

## 4. Creativity: how original and delightful is the idea?

| What we built | Where to see it in the demo | Pitch sentence |
|---|---|---|
| Polar night to dawn world with parallax layers, lantern light, colour returning task by task | Phone, full session; `screenshots/` | "Each session walks from polar night to dawn." |
| Bedside light that rises with the in-game dawn and follows the day | Bedside unit (or the simulated orb on the dashboard live card) | "When the game reaches dawn, the room does too." |
| Clinician dashboard in the same palette: quiet, readable in 10 seconds | `/clinic/` | "The clinic view is the same calm world, made precise." |
| Privacy by design: the clinician sees numbers and a stick figure, never video; frames never leave the phone | Dashboard live card "Never video" | "No video, no microphone, no emotion detection." |
