# Review of the Afferent implementation

**Date:** 14 November 2026  
**Scope:** comparison of the [`plan_posture_depression.md`](plan_posture_depression.md) plan against the `posture-analysis/posture` POC, and against the Afferent repository as a whole.  
**Review type:** static reading of code and documentation. No tests or deployments were run for this review.

## Summary

The laptop POC is already a substantial technical base: video capture, Halpe-26 pose estimation with feet, identity lock, smoothing, activity/orientation classification, geometry, gait variables, facial expressivity, aggregated SQLite storage, API and dashboard. The documentation correctly presents the system as an exploratory measurement instrument, not a diagnostic tool.

However, the implementation does not yet realise the mood/depression tracking project defined in the plan. It has neither ground truth (PHQ-9, mood, energy, sleep, confounding factors), nor a questionnaire flow, nor an index relative to a baseline, nor a reliability/validity protocol and results. These absences are consistent with an extraction POC, but they rule out any clinical conclusion or any validation of the announced link.

**Assessment:** a solid demonstration and exploratory-extraction base; not ready for a single-person health pilot or a validity study. The priorities are separating contexts during aggregation, protecting biometric data, and implementing the scientific protocol before any longitudinal collection.

## Priority findings

### P1 — Aggregates mix incompatible situations

The plan explicitly requires comparing a variable to itself within the same activity and the same orientation ([plan, §16–17](plan_posture_depression.md)). Yet `MinuteAggregator` keeps a single majority-voted activity and orientation per minute, then aggregates the angular values of all valid samples in that minute ([`aggregator.py`](../posture-analysis/posture/afferent/aggregator.py#L33)). The primary key of `minute` is only the timestamp ([`storage.py`](../posture-analysis/posture/afferent/storage.py#L22)). A minute mixing, for example, profile-view sitting and front-view walking therefore becomes a single row; its angles may come from several contexts while the displayed label describes only the majority context.

**Consequence:** the per-situation daily trends promised by the plan cannot be faithfully reconstructed from the current data.  
**To do:** aggregate by key `(minute, activity, orientation)` (or by episode/context), keep per-group sample counts, then compute trends and coverage separately within each context.

### P1 — Biometric data stored in clear text and an API with no access control

The identity gallery stores face embeddings in SQLite as BLOBs with no application-level encryption ([`storage.py`](../posture-analysis/posture/afferent/storage.py#L47), written at [`storage.py`](../posture-analysis/posture/afferent/storage.py#L196)). The server exposes gallery, measurement, session and video endpoints with no visible authentication ([`server.py`](../posture-analysis/posture/afferent/server.py#L43), [`server.py`](../posture-analysis/posture/afferent/server.py#L89)). Server startup binds `0.0.0.0` by default ([`__main__.py`](../posture-analysis/posture/afferent/__main__.py#L8)). The README describes the SQLite and model volumes, with no encryption mechanism ([`README.md`](../posture-analysis/posture/README.md#L78)).

The plan, however, classifies the gallery as biometric data that must be protected, and provides for encryption, deletion and arbitration on synchronisation (§6, §16). The gallery-deletion API exists, but it only clears embeddings, not the associated aggregates. The preview video is also served by the API; explicit recording is disabled by default, which is a good safeguard, but it does not replace access control.

**Consequence:** do not expose this server on the shared network, and do not put real sensitive data in it as it stands.  
**To do:** decide on a strictly local mode or add authentication, protected transport where needed, at-rest encryption/key management, a retention policy and a full-erasure procedure (gallery, database, backups and recordings).

### P1 — The scientific plan and the prerequisite safeguards are not materialised

Plan §4, §7, §9 and §10 provide for consent, informing other occupants, a clinical contact, pre-registered hypotheses, the PHQ-9 questionnaire, daily mood/energy, sleep and confounding factors. No matching schema, endpoint or screen appears in the POC. The `session`, `jour` and `config` tables do not contain questionnaire answers or confounding factors ([`storage.py`](../posture-analysis/posture/afferent/storage.py#L72)). The code computes no tracking score relative to a baseline.

The README acknowledges that validation would require ground truth and repeated measures. That is a well-formulated limitation, but the intended phase-0 status is not reached. Moreover, the plan requires both a daily standardised task (§7 and §15) and states further on that the system must work without a daily task, with only an initial calibration and an optional reminder (§17–18). This methodological decision must be harmonised before the protocol is frozen.

**Consequence:** the POC can observe computed markers, not link those markers to mood or depression.  
**To do:** resolve the protocol contradiction, document the ethical/clinical and legal framework and have it reviewed before any cohort collection, then integrate a ground-truth source and the chosen covariates.

### P1 — The observed frame rate does not demonstrate the plan's capture criteria

The configuration provides for 10 frames/s continuous and 30 frames/s in bursts, but the pipeline does not use `continuous_fps` or `burst_fps` to regulate its capture/inference ([`config.py`](../posture-analysis/posture/afferent/config.py#L33), loop in [`pipeline.py`](../posture-analysis/posture/afferent/pipeline.py#L495)). The README reports about 4 pose-fps on CPU at 1080p. The plan requires at least 25 frames/s for the standardised task (§15), and 25–30 for gait/face measurements. The current guided session collects a standing reference then a free-walking phase, with no instructions or course control, minimum quality of 12 steps, distance or real cadence ([`pipeline.py`](../posture-analysis/posture/afferent/pipeline.py#L382)).

**Consequence:** the protocol and the measurement performance described by the plan are not yet demonstrated; blink frequencies and gait variables may be under-sampled.  
**To do:** measure the actually processed frame rate and the losses on the target configuration; display/record quality per session and invalidate variables when minimum conditions are not met. Present the current session only as an exploratory collection.

## Plan coverage

| Plan area | Observed state | Comment |
|---|---|---|
| 26-point/feet pose, identity, smoothing | **Present** | Pipeline and model adapters available; the InsightFace stack is flagged as research-only in the README. |
| Geometry and orientation | **Partial** | Angles and orientation classes computed; empirical validation and robustness across distance/lighting not established. |
| Floor calibration | **Present, to validate** | Four-point homography and conversion to ground units; the <5 % error criterion remains a goal, not a recorded result. |
| Gait and transitions | **Partial** | Cadence, speed, step length and arm swing exist; no validation against stopwatch/reference and no reported test-retest. Steps are approximated by hip bounce. |
| Face / expressivity | **Partial** | Blendshapes, head pose, emotions and aggregates are provided for in the code. Several plan variables are missing (duration/intensity and usable face-time denominator); emotion outputs are not validated. |
| Minute/day aggregates and coverage | **Partial** | Aggregates and the day endpoint exist, but the aggregate is incorrectly grouped by context and coverage corresponds to the share of minutes with a row, not to the duration actually observed. |
| Questionnaire, mood, journal | **Absent** | No visible form, storage or API. |
| Baseline-relative index | **Absent** | No longitudinal normalisation, uncertainty interval or decisional coverage threshold. |
| Security, ethics, compliance | **Not materialised** | No consent, access/retention/encryption policy or clinical procedure in the application. |
| Reliability and validity | **Not demonstrated** | The repository contains synthetic tests, but no results on real sessions, test-retest, ICC, smallest detectable change or cohort. |
| Global Afferent deployment | **Other scope** | `jetson/vision` and `uno-q/modulino-hub` implement a person-detection and buzzer demo; they are not the laptop mood/depression tracking pipeline. |

## Other technical limitations to track

1. **Daily aggregate insufficient for the plan.** `daily_aggregate` computes a median of minute medians and a coverage of `row count / 1440` ([`aggregator.py`](../posture-analysis/posture/afferent/aggregator.py#L193)). It does not distinguish 30-minute slots, does not measure the minutes actually observed and provides no per-slot minimum threshold as requested in §16.
2. **Temporal breaks and incomplete context.** The schema does not record the planned context factors (distance, lighting, additional people, day type) or versions/calibrations per complete segment. This complicates the interpretation of observed changes.
3. **Session persistence potentially misaligned with capture time.** Timestamps are in seconds/epoch in several tables and in milliseconds in the minute tables; this difference is manageable but deserves a documented convention and explicit timezone handling in day aggregation.
4. **Model validation to be distinguished from clinical validation.** The training/evaluation scripts and synthetic tests are useful for pose and variables, but they do not constitute a validation of the "mood/depression" construct.

## Recommended work order

1. **Fix aggregate granularity** to preserve activity × orientation and recompute coverage metrics from actually valid measurements.
2. **Freeze the protocol**: daily task or passive measurement, primary variables, quality conditions, questionnaires and covariates. Align plan sections §7/§15 and §17/§18.
3. **Lock down data protection before real use**: local access, encryption, retention and full erasure; separately check video exposure and development recordings.
4. **Instrument capture quality**: real frame rate, number of valid samples per variable/context, rejection conditions, calibrations and model versions.
5. **Achieve measurement reliability** per the plan (§3), and only then start longitudinal collection with questionnaires and pre-registered analysis.
6. **Produce no depression indicator** until validity has been studied on an appropriate cohort; keep the output as individual exploratory markers.

## Conclusion

The implementation is a credible POC for exploring a local pose and extraction pipeline. It covers several technical building blocks of the plan, but not yet the research protocol, the contextual comparability of aggregates, the expected protection of biometric data, or the validation of a mood/depression indicator. The next realistic milestone is to make the aggregates and the collection framework reliable, then evaluate measurement reproducibility before any clinical interpretation.
