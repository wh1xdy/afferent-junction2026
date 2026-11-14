# Improved plan — Posture, movement and expressions as a depression indicator

13 November 2026 · Review and extension of the "Design plan — Posture tracking of a targeted person (Jetson + laptop)"

## 1. Verdict in one page

The original plan is solid on engineering (ONNX, two model stacks, licences, face-based identity, deployment). It has a fundamental flaw: **the final goal, a depression indicator, appears nowhere in it.** There is no ground truth, no variables chosen for their link with depression, and no validation step. As it stands, the project will produce reliable posture angles, but no way of knowing whether they say anything about mood.

The eight main changes:

1. **Add ground truth from phase 0.** PHQ-9 questionnaire every two weeks, daily mood in two questions, a log of confounding factors. Without it, nothing can be validated.
2. **Move from static posture to movement.** The literature links depression to psychomotor slowing: walking speed, gesture amplitude, trunk and head mobility — more than to a neck angle.
3. **Add a daily 60-second standardised task.** Stand up, walk 3 m, come back, sit down, then 30 seconds facing the camera. This is what makes days comparable.
4. **Raise the frame rate in bursts.** 5 to 10 frames per second is enough for seated posture, not for walking or the face. Aim for 25 to 30 frames per second during the standardised task and the walking sequences.
5. **Refocus the face module on expressiveness dynamics.** Smile frequency and duration, head mobility, eye opening. The "joy / sadness" label adds little and is costly in legal terms.
6. **Validate in two stages.** First the reliability of the measurement (one person, POC), then the link with depression (a cohort with varied PHQ-9 scores). A single person cannot validate a depression indicator.
7. **Name the output honestly.** "Index of psychomotor activity and expressiveness, relative to the person's baseline", never a "depression score" nor a diagnosis.
8. **Handle the change in regulatory status.** Targeting depression shifts the project into health data, potentially a medical device and research involving human subjects.

## 2. What the literature says, and what it does not say

| Signal | What is established | Limit | Source |
| --- | --- | --- | --- |
| Posture, balance, gait | A systematic review of 33 studies associates adult depression with alterations in posture, balance and gait | Study quality rated low to medium. In older people, physical illness and cognition are mixed with mood | [Belvederi Murri et al., 2020](https://iris.unimore.it/handle/11380/1208435) |
| Gait in monocular video | 83.3% accuracy at detecting psychomotor slowing and R² of 0.64 on severity (Hamilton scale) | Only 42 hospitalised patients, a standardised "stand-up-and-walk" type task, 3D body reconstruction | [Boutaleb et al., 2026](https://arxiv.org/abs/2601.19526) |
| Face in natural conditions | Eye opening, head gestures, smile and a few action units signal depressive episodes (AUROC 81%), mean error of 3.08 points on the PHQ-9 | Smartphone capture, face close and frontal, not a webcam at 3 m | [FacePsy, Stevens Institute](https://neurosciencenews.com/ai-depression-facial-cue-eyes-27735/) |
| Face in clinical interview | 79% accuracy with automatic facial analysis, 88% with manual coding | Clinical sample in a structured interview, not daily life | [Cohn et al.](https://www3.cs.stonybrook.edu/~minhhoai/papers/acii-paper_final.pdf) |
| Digital phenotyping in general | The PHQ-9 is the most used reference measure; physical activity and sleep are the most frequent parameters | Most studies replicate poorly and miss clinically useful events | [JMIR mHealth, 2026](https://mhealth.jmir.org/2026/1/e70840/PDF), [npj Digital Medicine, 2024](https://medrxiv.org/content/10.1101/2022.10.12.22281007v3.full.pdf) |

Three consequences for the design:

- **Good results come from standardised tasks**, not from passive observation of daily life. Hence the daily 60-second task.
- **Published sample sizes are small.** A result on 42 hospitalised patients does not transfer to one person at home with mild depression.
- **Tracking a person against themselves is more realistic than screening.** Detecting a change in a known person is more accessible than classifying a stranger.

What the indicator will not be able to do: give a diagnosis, distinguish depression from fatigue, pain, flu, a medication effect or a neurological illness. At best it can flag a change worth exploring.

## 3. Weaknesses of the original plan

| # | Finding | Correction |
| --- | --- | --- |
| 1 | The "depression" goal is absent | Section 4: define the target, the output and the ground truth |
| 2 | Only static indicators (4 angles and activity) | Section 5: add movement and rhythm variables |
| 3 | 17 COCO keypoints: no feet, coarse face | 26-keypoint skeleton (feet) or 133-keypoint whole body; licence and data to be checked |
| 4 | 5 to 10 frames per second | Two regimes: 10 continuously, 25 to 30 in bursts |
| 5 | Emotion module centred on categories | Level-1 expressiveness dynamics, categories optional |
| 6 | Purely technical success criteria (angle error, throughput) | Test-retest reliability criteria, then validity against the PHQ-9 |
| 7 | Passive capture only, non-comparable situations | Daily standardised task |
| 8 | "No cloud subcontractor in production" contradicted by the syncing of measurements to the VPS | Measurements become health data: end-to-end encryption or no sync |
| 9 | No handling of confounding factors | Daily log and control variables |
| 10 | No safety protocol for the tracked person | Section 9 |
| 11 | Legal review postponed to commercialisation | Qualification to be done before cohort data collection |
| 12 | One-week baseline | Four weeks minimum, with a day-of-week effect |

## 4. Defining the target

### 4.1 What we are trying to estimate

- **Primary target.** The change in a person's PHQ-9 score relative to their own baseline.
- **Secondary target.** Self-reported daily mood (scale from 0 to 10).
- **Exploratory target.** Psychomotor slowing alone, closer to what the camera actually sees.

### 4.2 Ground truth to collect

| Measurement | Frequency | Duration | Role |
| --- | --- | --- | --- |
| PHQ-9 | Every 2 weeks (its reference period) | 3 min | Primary target |
| Mood and energy, 2 sliders | Every evening | 20 s | Secondary target, daily resolution |
| Sleep: bedtime, wake time, quality | Every morning | 20 s | Confounding factor and covariate |
| Log: illness, pain, alcohol, exercise, medication, remote work, significant event | Every evening, checkboxes | 30 s | Confounding factors |
| Clinician-completed scale (Hamilton or MADRS) | Start and end, cohort only | 20 min | Reference independent of self-report |

The terms of use of the PHQ-9 and of its validated French translation are to be checked before use.

### 4.3 Shape of the output

- A continuous index, expressed as a deviation from the person's baseline, with an uncertainty interval.
- Three separately readable sub-indices: movement, posture, expressiveness.
- A coverage indicator: share of the day actually measured. No index if coverage is too low.
- No "depressed / not depressed" label in the POC phase.

## 5. Variables to extract

### 5.1 Movement and psychomotor function (priority 1)

| Variable | Computation | Source |
| --- | --- | --- |
| Walking speed | Pelvis displacement in m/s, after floor calibration | Standardised task, spontaneous walking |
| Step length and cadence | Foot-contact detection from the foot keypoints | Standardised task |
| Arm swing | Shoulder–wrist angular amplitude during walking | Standardised task |
| Chair-rise duration | Time between stable sitting and stable standing | Standardised task, spontaneous transitions |
| About-turn duration | Time for a 180° trunk rotation | Standardised task |
| Amount of movement | Approximate kinetic energy of the keypoints, per minute | Continuous |
| Seated micro-movements | Variance of upper-body keypoints excluding displacements | Continuous |
| Head mobility | Angular speed and amplitude of the head | Continuous and facing camera |
| Sedentary time, number of transitions | Durations per activity, sitting ↔ standing count | Continuous |
| Daily rhythm | Time of first appearance, hourly distribution of activity | Continuous |

### 5.2 Posture (priority 2)

The four angles of the original plan are kept. Added to them:

- Slumping: ratio between shoulder–hip height and the reference resting trunk length.
- Head tilted downward (pitch), measured from the face landmarks when it is visible.
- Postural variability: number of posture changes per seated hour.
- Share of time spent in each posture class, rather than only the median.

### 5.3 Facial expressiveness (priority 2, level 1 of the original plan)

- Smiles: frequency per hour of visible face, duration, intensity, share of smiles with eye crinkling.
- Brow frowning and lowered mouth corners: share of time.
- Overall expressiveness: variance of the expression coefficients over 10-second windows.
- Eye opening and blink rate (requires 25 to 30 frames per second).
- Downward gaze and head direction: share of time.

Level 2 (inferred emotion) remains an optional output. It does not enter the index until level 1 has shown its value.

### 5.4 Context and quality

- Presence of other people in the field (count only, no identity).
- Scene brightness, target distance, body orientation.
- Mean keypoint confidence score, share of rejected frames.
- Day type inferred from the log: work, rest, sick.

## 6. Revised architecture

### 6.1 Two capture modes

| | Continuous mode | Standardised-task mode |
| --- | --- | --- |
| Trigger | Permanent when the target is locked | Once a day, at a fixed time, started by the person |
| Frame rate | 10 frames per second | 25 to 30 frames per second |
| Duration | All day | 60 to 90 seconds |
| Content | Daily life | Rise, 3 m walk, about-turn, return, sitting, 30 s facing camera |
| Variables | Amount of movement, posture, rhythm, spontaneous smiles | Gait, chair rise, frontal expressiveness |
| Day-to-day comparability | Low, depends on what the person does | High |

### 6.2 Building blocks added to the pipeline

1. **Floor calibration.** A calibration target or four floor points measured once, to convert pixels to metres. Without it, no walking speed.
2. **Enriched skeleton.** Foot keypoints are essential for steps. A 26-keypoint model or whole body; licence of the code and of the training data to be checked as for the rest of the stack.
3. **3D lifting (option, later phase).** The reference gait study reconstructs the body in 3D. Models of this kind are often under a research licence: to be checked before any commercial use. The second camera planned for version 2 remains the other route.
4. **Episode segmenter.** Cuts the stream into episodes: walking, rise, stable sitting, facing camera. Variables are computed per episode, then aggregated.
5. **Variable store.** SQLite table per episode, then a daily table. Versioned schema; each row carries the model and extractor version.
6. **Data-entry application.** Local web page on Wendy Net or on the laptop for the PHQ-9, mood and log. Stored in the same database, encrypted.
7. **Index module.** Normalisation by the baseline, combination, uncertainty. Separate from the real-time pipeline, run once a day.

### 6.3 What does not change

Face-based identity and its three states, model stack and licences, ONNX as the single source, Docker images, VPS role for training, no video storage in production.

Decision of 13 November 2026: raw keypoints are not kept. Only angles and derived quantities are written (section 16). Trade-off: a change of formula cannot be applied to past days.

## 7. Detailed roadmap

No phase begins until the criterion of the previous one is met.

### Phase 0 — Scientific and ethical framing (2 to 3 weeks)

1. Write the intended use in one sentence: "track the change of psychomotor indices of a consenting adult, at home, relative to their own baseline".
2. List what the system does not do: diagnosis, screening of third parties, automatic alert to a third party.
3. Choose the targets (section 4.1) and freeze them in writing.
4. Write the list of hypotheses before seeing the data: for example "walking speed drops when the PHQ-9 rises".
5. Limit this list to 5 to 8 primary variables; the others are exploratory.
6. Set the success thresholds of each phase (see criteria below).
7. Check the terms of use of the PHQ-9 and choose its validated French version.
8. Write the consent of the target person: face, health data, questionnaires, retention period, right of withdrawal.
9. Write the information for the other occupants and visitors.
10. Write the safety protocol (section 9).
11. Find a clinical adviser (psychiatrist or psychologist) to review the protocol.
12. *(Postponed until after the POC.)* Have the project qualified by a lawyer: health data, AI Act, medical device, research on human subjects.
13. *(Postponed until after the POC.)* Carry out the data protection impact assessment.
14. Decide the fate of measurements on the VPS: laptop-side encryption or no sync.
15. Open the repository, push the jetson/vision folder and this plan to it.

**Pass criterion:** written protocol, signed consents, hypotheses dated in the repository.

### Phase 1 — Pipeline demo (2 to 3 weeks)

16. Set up the original plan's pipeline with the demo stack, in Docker on the laptop.
17. Enrol the target person: 10 to 20 face embeddings.
18. Measure the actual throughput at 10 and at 30 frames per second.
19. Measure the identity error rate on a sequence with two or three people.
20. Add the skeleton with feet and visually check foot-contact detection.
21. Calibrate the floor and verify a known distance within 5%.
22. Write the SQLite table per frame, then per episode.
23. Implement filtering, One-Euro smoothing and situation classification.
24. Implement the daily background check.
25. Record three reference sequences for the automated tests.

**Pass criterion:** correct identity on the test sequences, 30 frames per second sustained for 90 seconds.

### Phase 2 — Variable extraction (3 to 4 weeks)

26. Write the episode segmenter: walking, rise, sitting, facing camera.
27. Implement the gait variables: speed, cadence, step length, arm swing.
28. Implement the chair rise and the about-turn.
29. Implement the amount of movement and the seated micro-movements.
30. Implement the extended posture variables (section 5.2).
31. Integrate MediaPipe Face Landmarker and extract the expression coefficients.
32. Implement the expressiveness variables (section 5.3).
33. Implement the rhythm and context variables.
34. Write a unit test per variable, on synthetic data with a known result.
35. Define the standardised-task protocol: floor marks, fixed chair, written instructions.
36. Write the interface that guides the task and checks that it is complete.
37. Write the questionnaire data-entry application.
38. Write the daily aggregation and the coverage indicator.
39. Document each variable: definition, unit, validity conditions.

**Pass criterion:** all primary variables computed end to end on a real day.

### Phase 3 — Measurement reliability (3 to 4 weeks)

This is the phase most missing from the original plan: knowing whether the instrument measures the same thing twice.

40. Compare walking speed to a stopwatch over 20 passes.
41. Compare angles to a goniometer or a second camera on a subset.
42. Repeat the standardised task 5 times the same day: compute within-day variability.
43. Repeat over 10 stable days: compute the intraclass correlation of each variable.
44. Compute the smallest detectable change of each variable.
45. Test sensitivity: deliberately slow walking, deliberately slumped posture, neutral versus expressive face.
46. Test robustness: evening lighting, loose clothing, glasses, slight camera movement.
47. Test at 2 m, 3 m and 4 m; set the maximum useful distance for the face.
48. Discard the variables whose reliability is insufficient (intraclass correlation below 0.7 for example).
49. Freeze version 1 of the extractor and the list of retained variables.

**Pass criterion:** at least five reliable variables, including two movement variables, with their smallest detectable change known.

### Phase 4 — Data and model fine-tuning (6 to 9 weeks, in parallel with phase 3)

50. Repeat the eight steps of the original plan: collect, annotate, split, train, evaluate, export, calibrate, iterate.
51. Add walking and chair-rise sequences to the collection, not just postures.
52. Annotate the feet in addition to the 17 keypoints.
53. Add criteria on the final variables to the test set: error on walking speed, not only on keypoints.
54. Diversify the volunteers: age, sex, body shape, skin colour, glasses, beard.
55. Rerun phase 3 with the commercial stack and verify that reliability is preserved.

**Pass criterion:** commercial stack at least as reliable as the demo stack on the retained variables.

### Phase 5 — Pilot on one person (8 to 12 weeks)

56. Four weeks of baseline: continuous capture, daily task, questionnaires.
57. Check adherence each week: tasks done, questionnaires filled in, coverage.
58. Compute the baseline per day of the week and per day type.
59. Continue 4 to 8 weeks of tracking.
60. Compute within-person correlations between variables and daily mood.
61. Correct for multiple comparisons and series autocorrelation.
62. Compare to a simple reference model: yesterday's mood predicts today's mood.
63. Check each confounding factor of the log: does the variable move on sick days, on poor-sleep days?
64. Collect the person's feedback: discomfort, behaviour change due to the camera.
65. Write a pilot report, negative results included.

**Pass criterion:** stable measurement over time, adherence above 80%. This pilot establishes feasibility, not validity: one person, especially if their mood varies little, proves nothing about depression.

### Phase 6 — Cohort validation study (6 to 12 months)

66. Obtain the opinion of the competent ethics committee before any recruitment.
67. Compute the sample size with a statistician; starting order of magnitude: 40 to 80 people, at least half with depressive symptoms.
68. Recruit with a clinical partner.
69. Define the exclusion criteria: neurological or motor disorders, for example.
70. Record medications: several psychotropic drugs modify motor function and expression.
71. Follow each person 8 to 12 weeks with the same protocol.
72. Administer a clinician scale at the start and at the end.
73. Register the analysis plan before unblinding the data.
74. Train the index model: regularised regression first, richer models only if they do better.
75. Validate per person: no person in both the training and the test sets.
76. Report the error on the PHQ-9, the sensitivity to change and the calibration of uncertainty.
77. Compare to two references: the baseline alone, and self-reported mood alone.
78. Analyse performance by subgroup: age, sex, skin colour, treatment.
79. Analyse false positives: which situations trigger the index without depression?
80. Decide: continue, restrict use to within-person tracking, or stop.

**Pass criterion:** the index beats both references on people never seen, with no marked gap between subgroups.

### Phase 7 — Jetson port and product (after validation)

81. Port to the Jetson: TensorRT engines, WendyOS app, equivalence test.
82. Verify that the variables, not just the keypoints, are equivalent between laptop and Jetson.
83. Sustain both frame-rate regimes on the Jetson; measure memory.
84. Design the feedback to the person: trends, uncertainty, no anxiety-inducing number.
85. Connect the Arduino output to posture only, never to the mood index.
86. Close the regulatory qualification and the licence review.
87. Set up post-deployment monitoring: drift of variables, model updates, complaints.

## 8. Statistical analysis and pitfalls

- **Between-person leakage.** With repeated measures, a random per-day split inflates the results. Always split per person.
- **Multiple comparisons.** Dozens of variables against one target: some will correlate by chance. Hence the short list of hypotheses written in advance.
- **Autocorrelation.** One day's mood and movement resemble the previous day's. Use mixed models or block permutation tests.
- **Camera effect.** Knowing one is filmed changes behaviour, especially in the first weeks. Discard or mark the habituation period.
- **Coverage selection bias.** On bad days, the person may stay in bed, out of frame. Absence is itself information: treat it as a variable, not as missing data.
- **Instrument drift.** Camera moved, model update, furniture change. Each break is logged and creates a new baseline segment.
- **Seasonality.** Light and clothing change with the season and affect both the measurement and mood.
- **Over-interpretation.** A correlation of 0.3 in one person is a research signal, not a usable indicator.

## 9. Safety of the tracked person

- **No real-time feedback of the index** to the person during the pilot: it is not validated and can worry or reassure wrongly.
- **PHQ-9 item 9** (suicidal thoughts): any positive response immediately displays help resources and the instruction to contact a professional. In France, 3114 is the national suicide prevention number.
- **PHQ-9 threshold**: beyond a score defined with the clinical adviser, a written recommendation to consult.
- **No automatic alert to a third party** (family, employer, insurer) without the person's explicit and revocable consent.
- **Right to pause**: a physical or software button that cuts the capture, with no justification needed.
- **Real consent.** The system must never be used to assess someone's mental state without their knowledge. Voluntary face enrolment is both a technical feature and the guarantee of this principle.

## 10. Compliance: what the "depression" goal changes

The original plan dealt with posture and, optionally, emotions. Targeting depression modifies four points. I am not a lawyer: each is to be settled by one.

| Subject | What changes | Action |
| --- | --- | --- |
| Health data | An index linked to depression is health data, not just "posture trends". The PHQ-9 responses are too | Dedicated explicit consent, encryption, no cleartext sync to the VPS |
| Medical device | European guidance MDCG 2019-11 gives, as an example of medical-device software, a program that computes a depression score; applications that monitor disorders such as depression can be qualified that way. The stated purpose and the commercial claims are decisive. Software that influences a diagnosis generally falls under at least class IIa | Write the intended purpose with care. Document the qualification decision, even if the answer is "wellness" ([OpenRegulatory](https://openregulatory.com/mdcg/mdcg-2019-11), [Sanolabs](https://www.sanolabs.eu/blog/wellness-app-vs-medical-device-eu-mdr/), [Mason Hayes & Curran](https://www.mhc.ie/latest/insights/is-your-mental-wellbeing-app-a-medical-device), [Osborne Clarke](https://www.osborneclarke.com/insights/eu-confirms-app-stores-and-developers-are-subject-medical-device-laws)) |
| AI Act | AI-based medical-device software may combine the obligations of the medical device regulation and those of high-risk systems. The boundary between "physical state", "emotion" and "mental health state" inferred from the face is uncertain | Explicit question to the lawyer, before phase 6 |
| Human-subject research | A cohort study with mental-health questionnaires very likely falls under an ethics committee | Protocol submission before any recruitment |

Two possible product positions, to be chosen early because they do not require the same evidence:

- **Wellness tool.** "Track your activity level and posture." No mention of depression, no mood score. Simpler, but no longer the announced goal.
- **Clinical tracking tool.** An asserted depression indicator, used with a health professional. Requires the phase-6 validation and, probably, medical device marking.

Presenting a product as wellness while selling a depression indicator is the riskiest position.

**Decision of 13 November 2026: clinical tracking tool.** During the POC (phases 0 to 5), this table triggers no action: steps 12 and 13 of phase 0 are postponed. It applies from phase 6, whose ethics committee and clinical partner are the longest lead times.

## 11. Added risks

| Risk | Effect | Mitigation |
| --- | --- | --- |
| No measurable link with depression | Project without purpose | Inexpensive phases 3 and 5 before the cohort; written stop criterion |
| False positive | Worry, stigmatisation | No feedback before validation, uncertainty displayed, never a diagnosis |
| False negative | False reassurance, delayed care | Permanent note: the tool does not replace a clinical evaluation |
| Confounding factors (fatigue, pain, illness, medication) | Index tracking something other than mood | Daily log, dedicated analysis, exclusions in the cohort |
| Between-group bias | Index less reliable for some people | Cohort diversity, subgroup analysis |
| Abandonment of the daily task | Loss of the most reliable variables | 60-second task, reminder, fallback on spontaneous transitions |
| Misuse (surveillance of a relative, of an employee) | Serious harm to persons, practice prohibited in the workplace | Mandatory voluntary enrolment, lock by site type, no third-party access by default |
| Data leak | Exposure of a mental-health state | Encryption, minimisation, short retention period |
| Effect of surveillance on the person | Anxiety, excessive self-monitoring | Regular interview, right to pause, unconditional stop |

## 12. Decisions to take now

- [x] Product position: **clinical tracking** (decided on 13 November 2026). The regulatory side is postponed until after the POC; it becomes blocking again before phase 6.
- [x] Target person of the pilot: Romain himself. No clinical adviser during the hackathon (step 11 postponed).
- [x] Main mode: **passive capture**, the person goes about their business in the room (section 17). The only standardised sequence is the **initial calibration** (section 18), possibly redone once a week without the system depending on it. The daily task of section 15 is abandoned; its protocol remains as a reference for the gait computations.
- [x] Retention: **angles and derived quantities, enrolled face embeddings, expression and emotion scores**. No images, no video, no raw keypoints. Schema in section 16.
- [x] VPS: no measurement is sent to it. All processing and all data stay local; the VPS is used for development and for launching Modal and Verda training runs.
- [x] Frame: hackathon, demonstration without a patient. Reduced scope in section 14.
- [ ] Clinical partner for phase 6: to be identified from phase 0, it is the longest lead time.
- [ ] Stop criterion: which phase-5 result would make us give up phase 6?

## 13. Sources

Pages consulted on 13 November 2026. The technical elements taken from the original plan keep their original sources.

- [Belvederi Murri et al., "Instrumental assessment of balance and gait in depression: A systematic review", Psychiatry Research, 2020](https://iris.unimore.it/handle/11380/1208435): abstract
- [Boutaleb et al., "A Non-Invasive 3D Gait Analysis Framework for Quantifying Psychomotor Retardation in Major Depressive Disorder", 2026](https://arxiv.org/abs/2601.19526): abstract and excerpts
- [Neuroscience News, presentation of FacePsy and PupilSense (Stevens Institute of Technology)](https://neurosciencenews.com/ai-depression-facial-cue-eyes-27735/)
- [Cohn et al., "Detecting Depression from Facial Actions and Vocal Prosody"](https://www3.cs.stonybrook.edu/~minhhoai/papers/acii-paper_final.pdf)
- [Busshart et al., scoping review on the digital phenotyping of depression, JMIR mHealth and uHealth, 2026](https://mhealth.jmir.org/2026/1/e70840/PDF)
- [Digital phenotyping and individualised mood-prediction study, npj Digital Medicine, 2024 (preprint)](https://medrxiv.org/content/10.1101/2022.10.12.22281007v3.full.pdf)
- [OpenRegulatory, MDCG 2019-11 explained](https://openregulatory.com/mdcg/mdcg-2019-11)
- [Sanolabs, wellness app or medical device](https://www.sanolabs.eu/blog/wellness-app-vs-medical-device-eu-mdr/)
- [Mason Hayes & Curran, "Is your mental wellbeing app a medical device?"](https://www.mhc.ie/latest/insights/is-your-mental-wellbeing-app-a-medical-device)
- [Osborne Clarke, 2025 MDCG guidelines](https://www.osborneclarke.com/insights/eu-confirms-app-stores-and-developers-are-subject-medical-device-laws)

The sources were read in search-engine excerpts, not in full text. The orders of magnitude for sample sizes, durations and thresholds (intraclass correlation of 0.7, adherence of 80%, 40 to 80 participants) are my starting estimates, to be confirmed by a statistician and a clinician.

## 14. Hackathon framing

Decisions of 13 November 2026: feasibility demonstration, no patient, with Romain as the target person, all local.

What the demo shows: the system repeatably measures the gait and posture markers that the literature associates with depression. What it does not show: that these markers follow someone's mood. The honest phrasing for the jury is "we measure the psychomotor markers described in the literature", not "we detect depression".

### Minimal scope

1. Demo stack on the laptop, 1080p at 30 frames per second during the task.
2. Face enrolment and target lock (already planned).
3. Initial guided on-screen calibration (section 18), then passive capture (section 17).
4. Six variables: speed, cadence, vertical bounce, trunk inclination, arm swing, slumping index.
5. Local SQLite base: one row per session.
6. Dashboard: the day's session compared to the personal baseline.
7. Continuous mode: posture angles through the day, Arduino buzzer optional.
8. Emotions: observable expressions (level 1) and inferred emotion (level 2) of the target person, with the demo stack, in continuous mode and during step 5 of the task.

### Sensitivity demonstration

Without a patient, the only possible evidence is the acted contrast:

- 5 sessions of habitual walking, to establish the baseline and variability.
- 3 sessions of "slowed and slumped" walking, deliberately acted and labelled as simulated.
- The dashboard must separate the two groups cleanly, beyond the variability of the normal sessions.

This reference animation helps act out the contrast: [BioMotion Lab, demonstration of depressive gait](http://biomotionlab.ca/Demos/BMLdepression.html) (link cited by Adolph et al., unverified).

### Postponed until after the hackathon

Fine-tuning, commercial stack, PHQ-9, cohort, Jetson port, emotion classifier trained on own data, the whole regulatory side.

## 15. Daily standardised task — detailed protocol

> **Abandoned as a daily routine** (decision of 13 November 2026). Replaced by the calibration of section 18. The variable definitions below remain valid for spontaneous walking episodes.

### Why these measurements

The reference study (Michalak et al., 2009, 3D motion capture) describes the gait associated with sadness and depression through five traits: reduced speed, reduced arm swing, reduced vertical head movements, increased lateral upper-body sway, more slumped posture. An everyday-life study (Adolph et al., 2021) finds the reduced speed, reduced vertical bounce and slumped posture. The idea of looking at the vertical axis and at slumping therefore matches exactly the best-documented markers.

One point of vigilance: vertical bounce depends on speed. A slower walk bounces less, even without a change of mood. Both must always be displayed, and bounce relative to speed must also be tracked.

### Setup, once and for all

- Fixed camera at about 1.2 m high, horizontal, at 1080p and 30 frames per second.
- Walking line **parallel to the image plane**, 3 m from the camera: the person is seen in profile and keeps the same size on screen. Walking toward the camera would distort the vertical measurement through a perspective effect.
- Floor markers A and B, 3 m apart on this line (at 3 m, the C920 covers about 4 m wide). Marker C in the middle. Marker D at 1.5 m from the camera, facing it.
- Armless chair on marker A, facing B.
- Constant and sufficient lighting; webcam exposure fixed manually to limit motion blur.
- Calibration: standing upright on C, in profile then facing, 5 seconds. It gives the person's height in pixels and their "upright" reference posture.

All lengths are divided by this pixel height. The variables are therefore unitless and do not require floor calibration. The known A–B distance (3 m) is enough to convert speed to m/s.

### Sequence (about 80 seconds)

| Step | Duration | Instruction | View | What is measured |
| --- | --- | --- | --- | --- |
| 1. Seated | 5 s | Sit on the chair at A, as usual, without straightening up on purpose | Profile | Seated slumping, neck flexion |
| 2. Rising | 3 s | On the beep, stand up without using hands | Profile | Rise duration |
| 3. Walking | 25 s | Six crossings A→B→A…, at usual pace, arms free | Profile | Speed, cadence, vertical bounce, trunk inclination, head, arms |
| 4. Standing | 10 s | Stop at C, facing the camera, still | Front | Shoulder asymmetry, lateral head tilt, sway |
| 5. Face | 20 s | Move to D, look at the camera, read aloud a displayed neutral sentence | Front, at 1.5 m | Expressiveness, head tilt, eye opening |
| 6. Mood | 15 s | Two on-screen sliders: mood and energy, 0 to 10 | — | Day label |

Comparability rules: same time each day, same shoes or barefoot, nothing in the hands, no phone, identical instruction. An incomplete or disturbed session is marked and excluded.

### Variable computation

The **central 2 m** of each crossing are kept, and the starts and about-turns are discarded. Six crossings give about 15 to 18 usable steps.

| Variable | Computation | Expected direction if slowing |
| --- | --- | --- |
| Speed | Horizontal displacement of the hip midpoint over the central 2 m, divided by time | Decrease |
| Cadence | Dominant frequency of the vertical signal of the hip midpoint (one cycle per step); no foot keypoint needed | Decrease |
| Step length | Speed divided by cadence | Decrease |
| Vertical bounce | Vertical signal of the hip midpoint, trend removed; median peak-to-peak amplitude per step, divided by height. Same computation on the head | Decrease |
| Bounce relative to speed | Bounce divided by step length | Decrease, independently of speed |
| Trunk inclination | Mean angle between the vertical and the segment hip midpoint → shoulder midpoint | Increase (leaning forward) |
| Head forward | Mean angle between the vertical and the segment shoulder → ear | Increase |
| Arm swing | Amplitude of the shoulder → wrist angle relative to the trunk, median per cycle | Decrease |
| Slumping index | Vertical shoulder–hip distance divided by the same distance in the upright reference posture; seated (step 1) and standing (step 4) | Drop below 1 |
| Lateral sway | Step 4 only: standard deviation of the horizontal position of the shoulder midpoint, divided by shoulder width | Increase |

Order of magnitude to check that the signal is measurable: the vertical bounce of normal walking is a few centimetres, i.e. about twenty pixels at 3 m in 1080p, for a keypoint jitter of 3 to 4 pixels. It is measurable after smoothing, but without much margin: this is my estimate, to be confirmed at the first session. If the signal is too noisy, use the centre of the torso bounding box, more stable than a single keypoint.

### Per-session quality checks

- Target locked by the face before step 1.
- At least 12 usable steps and mean keypoint confidence above threshold.
- Trajectory stayed on the A–B line (apparent size stable within 5%).
- Actual throughput of at least 25 frames per second.

### Limits to keep in mind

- **Subject and designer are the same person.** Knowing the hypothesis is enough to modify one's gait. Acceptable for a demo, not for evidence.
- **Lateral sway during walking not measured.** It requires walking toward the camera or a second camera; step 4 gives only a standing substitute.
- **One camera, hence 2D.** A trunk rotation or a step off the line reads as an angle change.

### Added sources

- [Michalak et al., "Embodiment of Sadness and Depression — Gait Patterns Associated With Dysphoric Mood", Psychosomatic Medicine, 2009](https://mediatum.ub.tum.de/977218): abstract
- [Adolph et al., "Gait Patterns and Mood in Everyday Life", Cognitive Therapy and Research, 2021](https://link.springer.com/article/10.1007/s10608-021-10215-7)

## 16. Continuous tracking: changes within the day and over time

Two readings complement the standardised task: how posture and expressions change from morning to evening, and how they change day to day. Only aggregated measurements are kept, plus the enrolled face embeddings.

### What is kept

Keypoints are computed in memory, converted to angles, then discarded. The disk receives only one row per minute.

| Table | One row per | Columns |
| --- | --- | --- |
| `minute` | Minute where the target is locked | Timestamp, activity (seated, standing, walking), orientation (front, profile, back), number of valid frames, and for each angle: median, 10th and 90th percentiles |
| `visage_minute` | Minute where the target's face is usable | Timestamp, number of valid frames, mean and standard deviation of the retained expression coefficients (smile, frown, mouth corners, eye opening), head pitch angle, share of time per emotion category, mean valence and arousal |
| `galerie` | Enrolled face embedding | Encrypted embedding vector, date, type (enrolment or adaptive). No photo |
| `identite` | State change | Timestamp, state (searching, locked, lost), match score |
| `session` | Standardised task | Date, speed, cadence, step length, bounce, mean walking angles, slumping indices, mood, energy, "simulated" flag, quality flag |
| `jour` | Day | Daily aggregates, coverage, "framing changed" flag |
| `config` | Change | Extractor version, calibration, camera position |

Angles tracked continuously: neck flexion, trunk inclination, shoulder asymmetry, lateral head tilt, plus the slumping index (a ratio, not an angle). About 1,000 rows per day: a few megabytes per year.

Other people's embeddings are compared in memory then discarded, as in the original plan. The target's embeddings are the only biometric data on disk: they cannot reconstruct a photo usable by eye, but they identify the person — hence an encrypted base and deletion in one command.

A minute is written only if it contains enough valid frames. An angle is filled in only in the orientation where it is valid (table of the original plan); otherwise the cell stays empty.

### Changes within the day

| Indicator | Computation | Reading |
| --- | --- | --- |
| Hourly curve | Median of each angle per 30-minute slot, in seated position | Shape of the day |
| Daily drift | Slope of neck flexion and of the slumping index between the first and the last seated hour | Progressive slumping through the hours |
| Morning–evening gap | Median of the last 2 hours minus median of the first 2 | A single number per day, easy to track |
| Per-seating drift | Slope of slumping from the start of each continuous seated period | Postural fatigue, reset after a break |
| Continuous seated duration | Time since the last rise | Context of the drift |
| Postural variability | Number of posture changes per seated hour | Immobility or restlessness |
| Time beyond threshold | Share of minutes beyond the alert threshold | Feeds the buzzer |

### Expressions and emotions within the day

| Indicator | Computation | Reading |
| --- | --- | --- |
| Smiles per hour | Number of episodes where the smile coefficient exceeds a threshold, relative to visible-face time | Best-documented marker |
| Expressiveness | Standard deviation of the expression coefficients per minute, averaged per 30-minute slot | Frozen or mobile face |
| Frown, lowered mouth corners | Share of time above a threshold | Tension, apparent sadness |
| Head down | Share of time where pitch exceeds a threshold | Cross-checks neck flexion |
| Emotion distribution | Share of time per category, per hourly slot | Level-2 view |
| Valence | Mean per 30-minute slot | Apparent-mood curve |

These indicators feed the same long-term views as posture: 7-day trend, hour × day map, typical profile.

Three precautions:

- **Level 2 is the least reliable.** In front of a screen, almost everyone has a neutral face: the "neutral" category dominates, and a concentrated face easily reads as sad or angry. Show the observable expressions first, the inferred emotion second.
- **Visible-face time varies.** Always relate the counts to the time the face was usable, and display that time.
- **The face is measured only at times.** It must be roughly frontal and at least 60 to 80 pixels, i.e. about 3 m from the camera. Expressions are therefore an opportunistic sample of the day, not a continuous tracking (section 17).

### Changes over time

| Indicator | Computation |
| --- | --- |
| Trend | Daily median of each angle, smoothed over 7 days |
| Hour × day map | One cell per hourly slot and per day, coloured by the slumping index |
| Typical profile | Mean hourly curve of the last 4 weeks, with its variability band; the current day is overlaid on it |
| Drift evolution | Morning–evening gap tracked day by day: is posture degrading faster than before? |
| Week and weekend | Same indicators separated by day type |
| Link with the task | Speed and bounce of the morning session against the posture of the rest of the day |
| Posture and expressions | Slumping and expressiveness on the same chart, per day: do they move together? |
| Measured and self-reported | Measured valence against the day's mood and energy sliders |

### Conditions for these curves to be meaningful

- **Compare like with like.** Only seated, in the same orientation, at the same workstation. Otherwise the curve reflects a change of activity, not posture.
- **Classify each measurement by orientation.** The person is seen now from the front, now in profile or from the back: each angle is computed only in the orientation where it is valid, and compared only to itself in that orientation (section 17).
- **Require a minimal coverage.** No point on the curve for a 30-minute slot with fewer than 10 valid minutes.
- **Mark breaks.** Camera moved, chair or desk changed: new baseline segment.

### For the demo

Half a day of recording is enough to show the hourly curve and the per-seating drift. The hour × day map and the trends need at least one to two weeks: start recording as early as possible, or present them as the target view.

## 17. Passive capture in free conditions

Decision of 13 November 2026: the person goes about their business in the room. They are seen now from the front, now in profile or from the back, at varying distances. The system asks nothing of them.

### Principle: measure what is valid, when it is valid

No measurement is valid all the time. The pipeline classifies each instant (activity, orientation, distance), computes only the variables valid in that situation, and compares a variable only to itself in the same situation. The original plan already provided a baseline per activity × orientation pair: this logic becomes the core of the system.

### Estimating body orientation

From the 17 keypoints, with no extra model:

- **Visible face keypoints.** Nose and two eyes: front. One ear only: profile. Ears without nose or eyes: back.
- **Left–right order of the shoulders in the image.** It reverses between front and back.
- **Apparent shoulder width relative to trunk length.** Maximum in front or back view, close to zero in profile. It gives a continuous angle.

Four classes are kept: front, three-quarter, profile, back. Ambiguous instants are rejected.

### What can be measured in each situation

| Variable | Front | Three-quarter | Profile | Back |
| --- | --- | --- | --- | --- |
| Neck flexion, head forward | No | Approximate | Yes | No |
| Forward trunk inclination | No | Approximate | Yes | No |
| Shoulder asymmetry, lateral trunk inclination | Yes | No | No | Yes |
| Lateral head tilt | Yes | No | No | No |
| Lateral sway during walking | Yes | No | No | Yes |
| Arm swing during walking | No | Approximate | Yes | No |
| Expressions and emotions | Yes, if the face is large enough | Degraded | No | No |
| Walking speed, cadence | Yes | Yes | Yes | Yes |
| Amount of movement, transitions, seated time | Yes | Yes | Yes | Yes |
| Relative height (standing slumping) | Yes | Yes | Yes | Yes |

The last four rows do not depend on orientation: they form the foundation of passive tracking. Angles are a complement, available intermittently.

### Making measurements independent of distance and direction

1. **Floor calibration, once.** Four floor points of known positions give the image → room-plane correspondence. The position of the ankles becomes a position in metres: walking speed can be computed in any direction.
2. **Normalisation by apparent height.** Any length in pixels is divided by the trunk length at the same instant.
3. **Cadence from vertical bounce.** The frequency of the vertical hip movement gives the cadence in all directions. Bounce amplitude is comparable only after normalisation, and remains more reliable in profile.
4. **Relative height.** During the first week, the system learns the person's expected apparent standing height as a function of their feet position in the image. Then the ratio observed height / expected height measures straightening or slumping, at any angle. This is my own idea, simple to code but to be validated on the first data.

### Cutting the day into episodes

- **Walking.** Continuous displacement of at least 2 m or 3 steps, with no obstacle hiding the legs. Starts, stops and turns are discarded.
- **Standing still.** At least 3 seconds without displacement.
- **Stable sitting.** At least 30 seconds, hips visible or not (the upper body is enough for some angles).
- **Transition.** Rising or sitting down, with its duration.
- **Usable face.** Frontal face within 30 to 40° and at least 60 to 80 pixels.

Each episode produces a row: type, orientation, duration, valid variables. The per-minute tables of section 16 are its aggregate.

### Option: monocular 3D pose

A model that reconstructs the skeleton in 3D from a single image makes it possible to compute angles in the body frame, whatever the orientation. This is the fundamental answer to the problem, and the reference gait study proceeds this way. Two reservations: the depth precision of a single camera remains middling, and the licences of these models are often non-commercial. For the demo, the non-commercial stack is enough; to be tested if time permits, keeping the 2D per-orientation angles as the base.

### Camera placement

- High up, around 2 m, in a corner of the room, slightly tilted down: fewer occlusions by furniture, more floor visible for paths.
- Oriented so as to see the front of the place the person looks at most often, to maximise usable-face time.
- Usual paths (door, desk, sofa) in the field and within 4 m.
- Do not touch it again: the downward tilt distorts angles by a constant value, with no effect on tracking relative to oneself as long as the camera does not move.

### What the passive approach costs

- **Uneven coverage.** Some days, little profile walking or little face. Each indicator is displayed with its episode count; below a minimum, no point on the curve.
- **Situation bias.** The face is seen frontally only in certain activities, always the same. A variation may reflect a change of habits, not of state.
- **More noise.** More days are needed to see a trend than with a standardised task.
- **Slower demonstration to build.** Curves take shape only after several days of recording.

The standardised sequence is therefore limited to the calibration of section 18.

## 18. Initial calibration and optional weekly reminder

Decision of 13 November 2026: the person is asked for a standardised sequence only at the start. A weekly reminder is possible, but the system must work without it.

### Room calibration (without the person, once)

1. Fix the camera and record the reference image of the background.
2. Place four floor markers at measured positions and point them out in the image: image → room-plane correspondence.
3. Verify on a known distance (target error: less than 5%).
4. Trace the useful zone: where ankles are visible and the body within 4 m.

### Person calibration (about 4 minutes, guided on screen)

| Step | Duration | Instruction | What the system gets from it |
| --- | --- | --- | --- |
| 1. Face | 30 s | At 1.5 m, look at the camera, slowly turn the head left, right, up, down | Enrolment gallery: 10 to 20 embeddings |
| 2. Neutral face | 10 s | Face at rest | Resting values of the expression coefficients, specific to the person |
| 3. Range | 20 s | Big smile, brows frowned, brows raised, mouth open | Personal range of each coefficient, to normalise expressiveness |
| 4. Standing upright | 10 s | Standing straight, facing the camera, at 3 m | Reference posture, body proportions (trunk, legs, shoulder width) |
| 5. Full turn | 20 s | Slowly turn in place, one full turn | Relationship between apparent shoulder width and orientation |
| 6. Usual standing | 10 s | Stand as usual, in profile | Gap between usual posture and upright posture |
| 7. Seated | 30 s | Sit at the usual spot, upright for 10 s, then as usual for 20 s | Seated references, duration of a rise |
| 8. Route | 60 s | Walk at usual pace along the room's usual paths, in both directions | Reference speed and cadence, map of expected apparent height by position |
| 9. Profile walking | 30 s | Four crossings parallel to the image | Reference vertical bounce, arm swing and trunk inclination |

At the end, the screen displays a check: number of embeddings, number of usable steps, coverage of the height map. An insufficient step is redone.

These values are used to **parameterise** the computations (proportions, face at rest, orientation). They are not the baseline: it is built over the first weeks of passive capture, situation by situation.

### Weekly reminder (optional, 90 seconds)

Steps 2, 4, 8 and 9 only. Its role is to check the instrument, not to produce a series of measurements:

- Verify that the reference measurements have not drifted (camera moved, model update).
- Provide a few clean points to cross-check the passive trends.

If it is missing, nothing stops. Three mechanisms replace it:

- **Self-adjusted height map.** Recomputed continuously from the moments when the person is seen standing, keeping the high values.
- **Adaptive face gallery.** Already planned in the original plan.
- **Daily background check.** It flags a camera displacement and then asks for a recalibration.

### Limit to be aware of

A calibration done while knowing oneself observed is often more "composed" than the natural. The upright references serve as an upper bound; the real usual posture will be read in the passive data, not in step 6.
