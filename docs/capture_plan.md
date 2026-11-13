# Capture plan — tests and training

13 November 2026 · POC `poc/laptop-markers` · posture/movement/expressiveness tracking
(target person: Romain, P01 — consent signed before any capture)

Two distinct uses, two metadata files:
- **Test sets** (reliability, phases 1 and 3 of the plan): never annotated, used to
  verify the instrument. Named `test_*` — not in `manifests/sessions.yaml`.
- **Training corpus** (phase 4): annotated in CVAT then fine-tuning.
  Declared in `laptop/training/manifests/sessions.yaml` with `consent: true`.

Naming convention: `YYYY-MM-DD_Pxx_situation_xx.mp4`
(`P01` = Romain, `P02`+ = other volunteers; `xx` = capture number).
Metadata recorded at each capture: shoes, clothing, glasses, time of day,
lighting, camera distance, "simulated" flag.

## A. Setup (once per configuration)

| # | Capture | Duration | Use case |
| - | ------- | -------- | -------- |
| A1 | Empty room, fixed background | 30 s | Reference image for the daily background check |
| A2 | Person with measuring tape on the floor, 4 markers + known-length ruler | 60 s | Floor calibration (homography) + distance check ≤5 % |
| A3 | Face at 1.5 m, slow head turn L/R/U/D | 30 s | Enrolment: 10–20 embeddings |
| A4 | Standing upright, front then profile, at 3 m | 10 s | Reference posture, trunk, shoulders |

Total A: 4 captures, ~2 min. Redo if the camera moves.

No measuring tape for A2? Fallback: lay a known A4 sheet (21.0 × 29.7 cm) in
the 4 marker positions, pace the line heel-to-toe (EU shoe size), or use a
phone AR measure app. Whatever the method, the goal stays <5 % error on a
known length.

## B. Instrument reliability (test, phase 1/3)

All on the standard walking line: camera at 1.2 m, line parallel at 3 m,
markers A–B 3 m apart. One "session" = standing → 6 crossings → return.

| # | Capture | Count | Use case |
| - | ------- | ----- | -------- |
| B1 | Timed walk A→B, one person | 20 crossings | Camera speed vs stopwatch (target error <5 %) |
| B2 | Full sessions, same day, spaced ≥1 h | 5 captures | Within-day variability of each variable |
| B3 | Full sessions, 10 stable days, same time | 10 captures | Intraclass correlation, smallest detectable change |
| B4 | Deliberately slow and slumped walk, labelled `simulated:true` | 3 captures | Sensitivity: the 3 captures must stand out from the 15 B2+B3 captures |
| B5 | Repeated chair rise, sit→stand→sit | 10 captures | Rise duration, stopwatch-verified on video |
| B6 | Three people in the field at once (walking + sitting) | 3 captures | Identity error rate (target lock) |
| B7 | Target crossing another person (walk past/behind) | 3 captures | Person-bbox track swap detection (lock must not jump) |

Total B: 54 captures/crossings. B1–B7 = frozen test sets for the evaluator.

## C. Robustness (test, small numbers)

| # | Capture | Count | Variation tested |
| - | ------- | ----- | ---------------- |
| C1 | Normal walk, evening lighting / lamps | 2 | Lighting |
| C2 | Walking in loose clothing (baggy trousers, jacket) | 2 | Masked body shape |
| C3 | Walking with glasses / cap | 2 | Partial face |
| C4 | Walking at 2 m, then 4 m from the camera | 4 | Useful distance limit |
| C5 | Camera moved ~20 cm then recalibrated | 2 | Baseline-break detection |
| C6 | Passive daily life (work, sofa, kitchen) 2×2 h | 4 | Coverage, spontaneous episodes, lock false negatives |
| C7 | Same camera in second room, full A-block re-done there | 3 captures | Per-site calibration + baseline separation |

Total C: 19 captures.

## Two-room deployment

The same camera moves between rooms. Each room is a `site` with its own
A-block (calibration, enrolment is shared) and its own baseline: floor
homography, reference posture and aggregates are stored per site, never
merged across rooms. Switching sites: `SITE` env at startup, or
`POST /api/site/{id}` at runtime (flushes pending buffers under the old site
first). About 20 % of the D corpus is captured in room 2 so the fine-tuned
model is not single-room biased.

## D. Training corpus (annotation → fine-tuning)

Goal: ~800–1,200 images annotated at 26 points (including 6 foot points), drawn from
varied captures. Extraction at ~2 im/s via `make extract`.

| # | Manifest situation | Captures per person | People | Target total images |
| - | ------------------ | ------------------- | ------ | ------------------- |
| D1 | `walk` normal pace | 2 × 30 s | P01 + 3 volunteers | ~240 |
| D2 | `walk` slow / fast | 2 × 30 s | same | ~240 |
| D3 | `sit_to_stand` ×5 repetitions | 1 × 60 s | same | ~120 |
| D4 | `turn` about-turn ×3 | 1 × 30 s | same | ~60 |
| D5 | `seated` varied postures (upright, slumped, side-leaning) | 1 × 60 s | same | ~120 |
| D6 | `posture` standing + back + three-quarter | 1 × 60 s | same | ~120 |

Total D: 36 captures ≈ 900 candidate images (culled after pre-annotation),
of which ~20 % in room 2 (see "Two-room deployment").
Target diversity: age, sex, body shape, glasses, beard — at least 3
volunteers other than P01, written consent before capture.

## E. Hackathon demo (plan section 14)

| # | Capture | Count | Role |
| - | ------- | ----- | ---- |
| E1 | Full normal guided session | 5 | Dashboard baseline |
| E2 | Acted "slowed and slumped" session, `simulated:true` | 3 | Contrast to be separated cleanly |
| E3 | One passive day recorded continuously | 1 (~4 h) | Hourly curves, coverage |

Total E: 9 captures (E1/E2 overlap B2/B4, redo only if the instrument changes).

## Totals

| Block | Captures | Nature |
| ----- | -------- | ------ |
| A Setup | 4 (×2 rooms) | adjustment |
| B Reliability | 54 | frozen test |
| C Robustness | 19 | test |
| D Training | 36 (~900 im, ~20 % room 2) | annotation |
| E Demo | 9 | product |
| **Total** | **~122 captures** | ~1 effective day of shooting |

Recommended order: A → B1–B4 (same day, locks the instrument) →
E → B3 (10 days) → C → D (volunteers, at the end of the POC).
