# Overnight build: Afferent, three dimensions, full statistics

You have full autonomy for the rest of the night. Do not ask me questions. Build continuously until about 08:30 Helsinki time (David later extended this to 10:00). Decide open questions yourself and log them in `afferent-game/Decisions.md`. Write everything in English. Never use em dashes in any output (code comments, docs, UI text); use hyphens, commas, parentheses or separate sentences.

Before you start, re-read everything already in `~/code/afferent-game/` (GameDesign.md, SessionSchema.md, ArtBible.md, BuildPlan.md, DemoScript.md, References.md, Decisions.md, Summary.md, the demo folder and any code). Build on it. Do not throw away decisions from the design debate unless this prompt overrides them, and log any override.

## 1. Why this matters: the judging criteria (just published, read carefully)

Challenge "Beyond the Clinic" by Aalto University (Prof. Risto Ilmoniemi and Prof. Pantelis Lioumis' group, brain stimulation). Four criteria, 25% each:

1. Usefulness: could it really help people stay well at home?
2. Ease of use: would someone recovering from depression actually use it every day?
3. Smart sensing: does it make clever use of what can be measured at home, AND learn what works for each person?
4. Creativity: how original and delightful is the idea?

Key phrases from the brief: home "maintenance" after TMS; "closed-loop": sense how someone is doing, respond with something that helps, learn what works best for that person. Target users: people after TMS, people at risk of depression, and clinicians who want to follow patients between visits "without adding to their workload". Product directions they explicitly want: everyday companion that notices changes over time, sensory experience (music, light) adapting to the day, a daily game supporting mood, smart home light, social, and a clinician view showing "who might need a call". They mention phone sensing (movement, facial expression, sleep, daily routines), wearables (HRV, sleep, autonomic nervous system), and the game by Soihtu and Meru Health as inspiration.

Evidence on what wins hackathons (analysis of 73,632 Devpost projects): technical ambition and wow, hardware, a full team, a demo video and completeness are the strongest predictors of grand prizes. So: ambitious, working end to end, hardware visibly in the loop, nothing half-finished on screen.

Every feature you build must map to at least one criterion. Write the mapping in `afferent-game/Criteria.md` (criterion, what we built, where to see it in the demo, one sentence for the pitch).

## 2. The concept: three dimensions, one closed loop

Afferent is one product with three dimensions that feed each other:

Dimension 1: Everyday (days to weeks, passive). The bedside device and the phone quietly observe daily life with almost no effort for the patient. They build a personal baseline and detect drift.

Dimension 2: Game (seconds to minutes, active). A short, calm, wordless mobile game (Gris-like, polar night to morning, under 2 minutes) that stimulates and at the same time measures vital signs and behavioural responses in a standardised way. Every session is a small, repeatable measurement, and the game reacts live to the body (inner loop).

Dimension 3: Analytics (the brain of the system). Combines 1 and 2 into personal trends, an early-warning signal, and a per-person model of which game segments and stimuli actually help. Shows it to the patient (gentle, encouraging) and to the clinician (precise, actionable: who might need a call, when a booster TMS session could be discussed).

The loop: sense (D1 + D2) -> respond (game segments, bedside light, suggestion to call) -> learn what works for this person (D3) -> adapt the next session and the next suggestion.

## 3. What to measure: the full statistics

All metrics are computed on device or on the local hub. Raw camera frames are never stored or sent. Store only derived numbers plus a signal-quality value for each.

### Dimension 2: per game session (the core: vital signs and reaction to the game)

Calibration segment (first ~20 s, identical every time, so sessions stay comparable):
- Resting pulse (rPPG from face, plus KY-039 on the bedside unit when the finger is on it), with signal quality index.
- Spontaneous blink rate (only here, because deliberate blinks are game input later).
- Baseline eye openness, head pitch, posture angle.
- Mood check-in via lantern colour choice (ordinal scale, no words).
- Ambient light level (camera exposure as proxy) and time of day.

Per segment, always record both the stimulus and the body's response:
- Pulse response: pulse at segment start, minimum or maximum during, at end; delta; recovery slope after a calming segment; time to reach target. Each segment has exactly one intended direction (calming: falling is good; activating: rising is good).
- Posture and gaze response: head pitch and trunk angle change from segment start to end; seconds spent upright; gaze up time.
- Eye metrics: eye openness, PERCLOS-style closed fraction, eyes-wide events, long deliberate blinks.
- Reaction time: blink or tap to the lighthouse flash: median, variability (IQR), lapses (> 1 s), anticipations (< 150 ms).
- Effort-based choice: proportion of high-effort choices at the fork, and how it shifts with reward size.
- Reward learning: two lanterns with unequal reward rates; compute response bias as in the probabilistic reward task (signal-detection log b) across trials.
- Breathing: paced breathing compliance (eyes-closed duration, motion or rPPG-derived respiration if feasible; mark as estimate).
- Engagement: completion, duration, pauses, skipped segments, time to start after notification.

Session summary (one JSON per session, extend `SessionSchema.md`): all the above plus `pre_post` block (pulse, posture, eye openness, mood at start vs end) as the headline "how did the game affect you today" result.

### Dimension 1: everyday, passive (bedside device + phone)

- Rest and sleep pattern from the infrared presence sensor at the bed: time in bed, estimated sleep onset and wake time, night-time restlessness events, regularity of the daily rhythm (inter-daily stability, simple version).
- Morning resting pulse from KY-039 when the person touches the sensor (optional, 30 s).
- Room conditions: temperature (Modulino thermo), light at bedside.
- Home or away hours from the phone's presence via Wi-Fi/BLE; visitors present as a count of unfamiliar nearby devices (never identify anyone).
- Interaction: knob use, whether the game was played, at what time, and missed days (not playing is also data).
- Phone movement (accelerometer step-like activity) if feasible in the app; otherwise simulate and label as simulated.

### Dimension 3: analytics (make this genuinely smart and explainable)

1. Personal baseline: first 14 days (or the first N valid observations) per feature: median and MAD. Everything afterwards is a robust z-score against the person's own baseline, never against population norms.
2. Trend: EWMA per feature, plus a 7-day rolling view.
3. Composite early-warning index: weighted sum of signed robust z-scores of a small, documented feature set (for example sleep regularity, morning pulse, psychomotor speed, effort choice, reward bias, upright time, home-only days, mood choice, missed sessions). Show the weights, show each feature's contribution, show data completeness and a confidence level. Never a black box.
4. Change detection: one-sided CUSUM on the composite index. States: stable, watch, consider a check-in call, consider discussing a booster session. A clinician decides, the system only suggests.
5. What works for this person: for each game segment and bedside stimulus, estimate its immediate effect (within-session pre/post response) and its next-day association. Use a Bayesian bandit (Thompson sampling on a "helped" outcome per segment) to choose the order and emphasis of segments in the next session. Show this as "What helps Anna" with uncertainty.
6. Validation on synthetic data: build a generator for an 8-week patient timeline after TMS with realistic noise, weekends, missing data, and an injected gradual relapse starting in week 5. Report detection lead time (days between relapse onset and "consider check-in call"), false alarms on a stable control patient, and how fast the bandit finds the most helpful segment. Put the numbers in `afferent-game/Validation.md` and a chart in the dashboard. State clearly that these are simulated, untuned, and not clinically validated.
7. Natural-language summary with Gemma (on device): weekly summary for the clinician generated by a small Gemma model running locally on the hub (we target the "Best use of Gemma" side challenge). The model only rephrases the computed numbers and contributions; it never gives advice, diagnoses or crisis guidance. If Gemma is not available on the machine, use a template fallback and keep the interface identical.

## 4. What to build tonight (architecture)

- Mobile app (phone): the game plus live sensing, as decided in Decisions.md (keep the chosen stack). It streams live metrics and the session summary to the hub. Must run on a real phone for the video. If live sensing is not ready, provide a clearly labelled sensor simulator so the whole loop still runs.
- Local hub (runs on the Jetson Orin Nano, develop on a laptop): Python, FastAPI, SQLite, WebSocket. Receives sessions and bedside events, computes all analytics, serves the dashboards. One command to start. No cloud, no patient data leaves the hub.
- Bedside device interface: a small protocol module for the Arduino UNO Q (knob, RGB LED, KY-039, infrared presence, thermo) with a hardware simulator that produces realistic event streams, so software never blocks on hardware. The bedside light reacts to the game (brightens at in-game dawn) and to the day.
- Patient view (in the app): gentle and wordless where possible: today's arc, a "your week" ribbon of colours, what helped, privacy switches per sensor, and what the clinic can see.
- Clinician dashboard (web, served by the hub): patient list sorted by need ("who might need a call"), per-patient timeline with baseline band, composite index with feature contributions, CUSUM state, last sessions' pre/post responses, "What helps" bandit panel, weekly Gemma summary, data completeness. Fast to read in 10 seconds. It must look excellent: this is what judges will screenshot.
- Live demo mode: seeded with the synthetic 8-week patient "Anna" and a stable control patient. When a session is played live on the phone, the new data point appears in the dashboard in real time, the composite updates, and the bedside light reacts. Profiles "good day" and "bad day" switch the game's starting state visibly within 10 seconds.
- Safety path: crisis signs (defined conservatively, mostly from the mood check-in and explicit patient action) show a fixed screen with clinic and emergency contacts. No AI text in that path, ever.

## 4b. Atmosphere and design (high priority, as important as the statistics)

Judges score "Creativity: how original and delightful" and "Ease of use", and the video lives or dies on how it looks and feels. Treat visual and sound design as a first-class milestone, not polish at the end. If a frontend or design skill is available, load it before you design.

The game must feel like a quiet, beautiful place, in the spirit of Gris, Journey and Alto's Odyssey (principles only, never copy their assets):
- Depth: at least 5 parallax layers (far sky, aurora, distant mountains, mid hills with birches, fog bands, foreground silhouettes). Slow ambient motion everywhere: drifting snow, breathing fog, flickering lantern, twinkling stars, waving aurora ribbons.
- Light is the hero: the lantern is the main light source with a soft radial glow; the world is lit by it. Colour returns station by station from near-monochrome blue-grey to warm full colour at dawn, with smooth eased transitions over several seconds, never hard cuts.
- Palette: deep polar-night blues and violets, cold silver, aurora green and teal, lantern amber, dawn coral and gold. Define it once as tokens and reuse it everywhere.
- Character: small, faceless figure with a lantern, simple silhouette, gentle idle animation.
- Sound: soft ambient pad and sparse piano notes, wind, crunching snow, a warm chime when colour returns. Sound reacts to the body (calmer pulse = softer, slower). Synthesise in code if there are no audio assets; no copyrighted music. Respect the phone's mute switch.
- Haptics: gentle taps for heartbeat and colour return if the stack allows.
- No text in the game except where safety requires it. No scores, no fail states, no red.
- Smooth 60 fps on the demo phone is required; check frame rate. Provide a reduced-motion setting.

Carry the same atmosphere into everything else:
- Patient view: the same night-to-dawn world as background, the week as a ribbon of colours, calm typography, lots of space.
- Clinician dashboard: same palette and typography in a darker, quieter, professional version. Readable in 10 seconds, clearly the same product. Charts with the baseline as a soft band and the current state as one glowing line.
- Bedside light: colours follow the same palette and the in-game time of day.
- One shared design system (colours, type, spacing, motion curves) used by app, dashboard and bedside light, documented in afferent-game/DesignSystem.md.

Quality bar: after every visual milestone, take screenshots and a short screen recording, look at them critically as an art director would, and iterate until it looks like a finished indie game, not a prototype. Put the best stills in afferent-game/screenshots/ for the deck and video.

## 5. Team boundaries (important)

The team works on this in the morning. Do not overwrite code or files written by humans; if something exists that you did not write, extend it through adapters or new files and note it in STATUS.md. Owners: David (game UI, patient view, pitch, video), Romain (vision: pose, face, pulse from face), Alex (bedside unit hardware, infrared, UNO Q, enclosure), Vlad (outer loop, data pipeline, baseline, trend, clinician view, knob, LED, Wi-Fi/BLE). Build clean interfaces and simulators so each person can plug in real parts in the morning. Write a section per person in STATUS.md: what is ready for you, what to plug in where, and the exact command to test it.

## 6. Working rules for the night

- Always shippable: work in small milestones. After each milestone the full demo must still start with one command and run end to end. Commit to git after each milestone with a clear message. Never leave the main branch broken.
- Order of milestones: (1) data schema and hub with SQLite and the synthetic generator; (2) analytics engine with tests (baseline, z-scores, EWMA, composite, CUSUM, bandit) and Validation.md; (3) clinician dashboard on synthetic data; (4) game session pipeline into the hub, live updates; (5) game atmosphere per section 4b (layers, light, colour return, sound); (6) bedside simulator and light reactions; (7) patient view; (8) Gemma summary; (9) polish, Criteria.md, screenshots. If time is short, cut from the end, never from the middle.
- Tests: unit tests for every analytics function and the session schema. Run them before every commit.
- Verify visually: take screenshots of the dashboard and app screens and look at them. Fix anything ugly, broken, empty or confusing.
- Images: the OpenAI key in `~/code/afferent-game/.env` was replaced with a new, verified working key. Reload it from the file and discard any value loaded earlier. Never print it, never copy it elsewhere, never commit .env. Make one test image first; if it fails, report the exact error and continue procedurally. Then generate assets per ArtBible.md and section 4b, smallest sensible size first, running cost estimate, hard cap 50 USD. Procedural art must always work as a fallback.
- Claims: "supportive", "maintenance", "early warning", "suggests". Never "treats", "prevents relapse", "diagnoses", "detects emotions". Facial data is expressivity and eye openness, never emotion. Label all simulated data as simulated on screen.
- Privacy on screen: the clinician sees numbers and a stick figure, never video.

## 7. Deliverables by 10:00

1. Working system: app build, hub, clinician dashboard, bedside simulator, demo mode, one-command start (`README.md` with exact steps, including how to put the app on the demo phone).
2. `afferent-game/Statistics.md`: every metric, how it is computed, its evidence level (established, plausible, exploratory), and its role in the composite.
3. `afferent-game/Validation.md`: synthetic validation results with charts.
4. `afferent-game/Criteria.md`: judging criteria mapping and pitch sentences.
5. Updated `DemoScript.md` showing all three dimensions in under 2 minutes, with the live moment where playing on the phone updates the clinician dashboard.
6. `STATUS.md`: what works, what is simulated, known issues, and the per-person handover. Keep it updated after every milestone, so it is correct even if you are stopped early.
7. Screenshots in `afferent-game/screenshots/`.

When you finish (at 10:00), print in the terminal: what works end to end, the 3 strongest demo moments, the 3 biggest risks, and the first task for each team member.

---

David's later instruction: work until 10:00 (not 08:30).
