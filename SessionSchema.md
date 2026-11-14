# Session schema v3

Version `afferent.session/3`. One JSON document per session attempt (completed, partial, declined, fell asleep). The phone builds it and sends it as `session_end` on `/ws/app` (or `POST /api/sessions`). Machine-readable schema: `contracts/session.v3.schema.json` (JSON Schema 2020-12). Full example: `contracts/fixtures/session_example.json`. The daily passive record (Dimension 1) is `contracts/daily.v1.schema.json`; transport, hub API and analytics are in `contracts/api.md`.

v3 extends v2 (`afferent.session/2`, still in git history): v2's `core.rt_trials`, `adaptive.minigames` and `mood_vas` are replaced by `core.rt`, `tasks[]` and `core.mood_start` / `mood_end`. `adaptive.mode_seconds`, `adaptive.transitions`, `vitals`, `context` stay.

## 1. Rules

- Derived numbers only. No images, no audio, no raw camera frames, no identifiers of other people.
- Times are milliseconds from session start unless named `*_iso`, `*_s` or `*_h`. Local time with offset in `*_iso`.
- `null` means not measured. Never substitute a default.
- Every measured value has a quality value (0 unusable to 1 clean) next to it or in `signal`.
- `simulated: true` if any value is simulated; `simulated_fields` lists which. Screens label such data SIMULATED.
- `profile`: `live` in real use; `good_day` and `bad_day` are demo presets (simulated starting vitals and world state).
- `day_index` is `null` from the phone; the hub fills it (days since TMS end).
- A declined session contains only `schema`, `session_id`, `patient_id`, `device_id`, `started_iso`, `local_hour`, `status: "declined"`, `profile`, `simulated`, `sharing`. Declined and withheld days never count as missed.
- Lit morning (streak, village and week lantern alike): status `completed` or `fell_asleep`, or `partial` with a finished `core` (5 trials) and the player's own input (a start mood or any tap). Mood values, reaction times, the Fork choice and Two lanterns outcomes never change it.
- The hub adds streak context to each daily record (`contracts/daily.v1.schema.json`): `streak_protection` (`freeze`, `repair` or null; the day stays missed), `pause_source` (`patient` or `clinician`), `pause_until`, `streak_len`, `freezes_held`, `repair_active`. A streak pause is separate from `sharing`, which stays a privacy control.

## 2. Session structure (under 2:00)

| Segment | Time | Measured |
|---|---|---|
| Fade in | 0 to 2 s | |
| Core: rest | 6 s | resting pulse, spontaneous blink rate, eye openness, head pitch, ambient light |
| Core: mood check-in | up to 6 s | `core.mood_start` (5 lanterns, cool dim blue 1 to warm bright amber 5) |
| Core: reaction | 5 trials | foreperiod 1.0 to 2.5 s, window 1500 ms; median, IQR, lapses, anticipations |
| Slot 1: Fork | about 15 s | effort-based choice, 2 choices |
| Slot 2: adaptive task | director | per-task response |
| Slot 3: Two lanterns | about 18 s | probabilistic reward task adaptation, 12 trials |
| Slot 4+: adaptive tasks | until about 75 s of play | per-task response |
| Dawn | 4 s | bedside light rises |
| End check-in | up to 10 s | `mood_end` |

Fork and Two lanterns are skipped (never replaced) when the director is in rest mode (night rule). At night, 30 s of closed eyes ends the session as `fell_asleep`.

## 3. Fields

### Top level

| Field | Type | Description |
|---|---|---|
| `schema` | const | `"afferent.session/3"` |
| `session_id` | string | UUID v4 |
| `patient_id` | string | Hub patient id (`anna` on the demo phone) |
| `device_id`, `app_version` | string | Random install id, semver |
| `started_iso`, `local_hour`, `clock` | | Start time; `clock` is `night` from 21:00 to 06:00 |
| `day_index` | int/null | Filled by the hub |
| `status` | enum | `completed`, `partial`, `declined`, `fell_asleep` |
| `profile` | enum | `live`, `good_day`, `bad_day` |
| `simulated`, `simulated_fields` | bool, string[] | See rules |
| `input_backend` | enum | `arkit`, `mediapipe`, `simulated`, `none` |
| `duration_ms` | int | |
| `sharing` | enum | `summary`, `nothing_tonight`, `paused` |
| `sensors` | object | Switch state at start: `phone_camera`, `pulse_stone`, `bedside_camera`, `bedside_light`, `presence`, `phone_motion` |
| `signal` | object | `pulse_source` (`ky039`, `finger_ppg`, `rppg`, `simulated`, null; `finger_ppg` is the bedside finger sensor, `ky039` stays for stored rows; one session's pulse is all real or all simulated), `pulse_quality_mean`, `eyes_source`, `face_tracked_ratio`, `ambient_light` (0 to 1, camera exposure proxy), `dark_room` (ambient < 0.15), `pulse_implausible` (any sample outside 40 to 150 bpm) |

### core

| Field | Description |
|---|---|
| `source` | `measured`, or `stored` in stage mode (core skipped) |
| `baseline_pulse_bpm` | Personal baseline the director used (from `config`) |
| `rest.pulse_bpm`, `rest.pulse_quality` | Median pulse over the 6 s rest |
| `rest.blink_rate_per_min`, `rest.blink_count`, `rest.blink_quality` | Spontaneous blinks (closures 50 to 500 ms) during rest only, because blinks are not used as input but taps during tasks change blinking |
| `rest.eye_openness`, `rest.eye_quality`, `rest.eyes_tracked_ratio` | Median `1 - mean(blink_l, blink_r)` |
| `rest.head_pitch_deg`, `rest.head_pitch_quality` | Median head pitch in camera space, positive is chin up (posture proxy) |
| `rest.ambient_light` | 0 dark to 1 bright |
| `mood_start`, `mood_start_ms` | Start lantern 1 to 5 (null if skipped), decision time |
| `rt.trials[]` | `{trial, foreperiod_ms, rt_ms, outcome, modality: touch}`; outcome `anticipation` (rt < 150 ms, including taps before the flash), `hit` (150 to 1000), `lapse` (1000 to 1500), `miss` (no tap within 1500, counted as a lapse) |
| `rt.median_ms`, `rt.iqr_ms` | Over taps with rt >= 150 (hits and lapses); IQR by linear interpolation; rounded to integers |
| `rt.lapses`, `rt.anticipations`, `rt.hits` | Counts (lapses include misses) |
| `rt.valid` | 5 trials and at least 3 taps with rt >= 150 |

### tasks[] (every task, adaptive and measurement)

| Field | Description |
|---|---|
| `id` | `breath`, `loyly`, `threads`, `stars`, `fireflies`, `beacon`, `bells`, `shutters`, `fork`, `lanterns` |
| `slot`, `kind` | 1-based order in the adaptive part; `adaptive` or `measurement` (fork is always slot 1, lanterns slot 3) |
| `mode`, `director_mode` | Task mode (fixed while the task runs; `measure` for measurement tasks) and the director mode at its start |
| `intensity`, `weight_used` | Difficulty 0 to 1; the bandit weight used to pick it |
| `t_start_ms`, `duration_ms`, `completed_by`, `completed`, `skip_reason` | `completed_by` is `touch`, `auto` (timeout) or `skipped` |
| `items`, `errors` | Task-specific counts |
| `intended_direction` | calm, rest: `fall`; wake, fatigue: `rise`; flow, measure: `none` |
| `pulse` | `start_bpm` (median of the first 3 s), `min_bpm`, `max_bpm`, `end_bpm` (median of the last 3 s), `delta_bpm` (end - start), `time_to_target_s` (first time the 3 s median moved 2 bpm in the intended direction), `recovery_slope_bpm_per_min` (least-squares slope, calm and rest only), `quality` |
| `helped` | true if `delta_bpm` moved >= 2 bpm in the intended direction, false if not, null when direction is `none` or pulse quality < 0.5. The bandit outcome |
| `head_pitch_start_deg`, `head_pitch_delta_deg`, `upright_s` | Posture response; upright = pitch >= rest pitch - 5 degrees |
| `eye_openness_mean`, `perclos`, `long_closures` | Eye response; PERCLOS = share of tracked frames closed; long closure > 0.5 s |
| `breath_sync`, `eyes_closed_s` | Breath only: pacer compliance and eyes-closed seconds (both estimates) |
| `extra` | Free-form task numbers, except the documented keys below |
| `extra.rt` | Optional in-game reaction times from the shared app module `A.RT`: `{n, median_ms, iqr_ms, lapses, anticipations, by_kind: {<kind>: {n, median_ms}}}`. Kinds are per task (for example `tap_target`, `catch`, `beat`, `choice`). Same conventions as `core.rt` (median and IQR over responses >= 150 ms, lapses and anticipations as counts); every number may be `null`; older sessions without it stay valid. Exploratory, see `Statistics.md` |
| `extra.dda` | Adaptive difficulty summary of the task (minigames spec); the hub reads only `d_mean` (presented difficulty 0 to 1) as a covariate for `extra.rt` |

### fork (effort-based choice)

Two choices per session; the hard path offers reward 2 on one and 3 on the other (random order); the easy path always gives 1 glow. Easy task: tap 3 slow lights. Hard task: tap 8 faster lights. 6 s to choose; no choice takes the easy path and logs `path: "none"`.

`choices[]`: `{choice, path: easy/hard/none, reward, decision_ms, completed, task_ms}`. `hard_prop` = hard / (easy + hard), `hard_by_reward` = `{"2": 0/1/null, "3": 0/1/null}`, `reward_slope` = hard(3) - hard(2). The hub pools over sessions.

### two_lanterns (probabilistic reward task adaptation, exploratory)

12 trials, two lanterns side by side, amber (rich) and silver (lean), one 8% larger; the player taps the larger one. 6 rich-larger and 6 lean-larger trials in random order. Correct rich responses are rewarded 3 times, correct lean responses once per session (a scheduled reward on an incorrect trial moves to the next correct trial of that type). Rewards are a warm glow, never words or points.

Counts: `rich_correct` (rich larger, tapped rich), `rich_incorrect` (rich larger, tapped lean), `lean_correct`, `lean_incorrect`. Unanswered trials are excluded.

- `log_b = 0.5 * log10(((rc + 0.5) * (li + 0.5)) / ((ri + 0.5) * (lc + 0.5)))`, positive = bias towards the rich lantern.
- `log_d = 0.5 * log10(((rc + 0.5) * (lc + 0.5)) / ((ri + 0.5) * (li + 0.5)))`, discriminability.
- `valid`: at least 10 of 12 trials answered. The hub also pools the cells over the last 7 sessions.

### adaptive (v2 director summary)

`mode_seconds`, `transitions[]` (`{t_ms, from, to, arousal, fatigue}`), `perclos_mean`, `touch_errors`, `config_received`.

### pre_post (headline result)

`{pulse, head_pitch, eye_openness, mood}`, each `{start, end, delta}`. Start = core rest values (mood: `mood_start`); end = median over the last 6 s of play before dawn (mood: `mood_end`).

### engagement

`completed`, `duration_ms`, `pauses` (app backgrounded), `skipped_tasks`, `tasks_completed`, `tasks_total`, `reminder_iso`, `time_to_start_s` (reminder to Begin, null without reminder).

### vitals, context

`vitals`: `pulse_mean_bpm`, `pulse_min_bpm`, `pulse_max_bpm`, `pulse_source` (the pulse the game used; same enum as `signal.pulse_source`). `context`: `room_temp_c`, `home`, `visitors_present`, `bedside_light_level`.

#### Sensor blocks in vitals (Decisions I53)

Five optional blocks hold what the finger sensor and the phone camera measured during the session. Each is `null` or absent when the sensor gave nothing; sessions without them stay valid. A statistic (`stat`) is `{mean, min, max, first, last, samples}` over the 1 Hz ticks that had a current reading (at most 3 s old); the five numbers are `null` when `samples` is 0. Example with all five blocks (simulated, a shape example and never a measurement): `contracts/fixtures/session_finger_example.json`. Transport, live objects and rules: `contracts/api.md` section 3.5.

| Field | Unit | Description |
|---|---|---|
| `vitals.finger.source` | | `finger_ppg` (the UNO Q finger sensor) or `simulated` |
| `vitals.finger.transport` | | `ble` (Bluetooth to the phone) or `hub_http` (the hub polled the sensor over HTTP) |
| `vitals.finger.quality_reported` | bool | false when the sensor firmware sends no quality byte; such readings are recorded but never drive the game or the `helped` flag |
| `vitals.finger.seconds` | s | 1 Hz ticks in the session |
| `vitals.finger.pulse_bpm` | bpm, stat | Fused finger pulse (both fingers, one value) |
| `vitals.finger.quality` | 0 to 1, stat | Signal quality from the sensor; below 0.3 is unreliable. `samples` is 0 when `quality_reported` is false |
| `vitals.finger.finger_1_bpm`, `finger_2_bpm` | bpm, stat | Pulse per finger |
| `vitals.finger.fingers_abs_diff_bpm` | bpm | Mean absolute difference between the two fingers on ticks where both read; null when they never both read |
| `vitals.finger.presence_s` | s | `{idle, probing, active}`: seconds per finger-detection state of the sensor (LEDs off, checking for a finger, measuring); null when the transport does not report it. Finger detection, never bed presence |
| `vitals.breathing.source`, `method` | | `finger_ppg` or `simulated`; `pulse_rhythm` (derived on the sensor from the heart-rate rhythm) |
| `vitals.breathing.rate_per_min` | per min, stat | Breaths per minute |
| `vitals.hrv.source`, `window_s` | | `finger_ppg` or `simulated`; 60 |
| `vitals.hrv.rmssd_ms` | ms, stat | RMSSD over the last 60 s |
| `vitals.hrv.sdnn_ms` | ms, stat or null | SDNN over the same window; null over Bluetooth (HTTP path only) |
| `vitals.hrv.rmssd_vs_baseline` | fraction, stat or null | RMSSD relative to the sensor's running median of its last 10 minutes of readings (at least 2 minutes of them; kept on the sensor, not per person) (-0.3 is 30% below); null over Bluetooth (HTTP path only) |
| `vitals.camera_pulse.source` | | `rppg` (the phone camera) |
| `vitals.camera_pulse.pulse_bpm` | bpm, stat | Camera pulse |
| `vitals.camera_pulse.trust_score` | 0 to 100, stat | Trust score of the camera pulse |
| `vitals.camera_pulse.trust_label_s` | s | `{reliable, uncertain, unreliable}`: seconds per trust label |
| `vitals.series` | | One point every 5 s for the clinic view: `step_s` (5), `t_s`, `pulse_bpm`, `breathing_per_min`, `rmssd_ms`; four arrays of the same length, at most 240 points, `null` where there was no current reading |

- HRV is a measured number. It is never called a stress level, it is not part of the composite, and it is never the basis of a diagnosis or a treatment decision.
- A simulated block has `source: "simulated"` (finger, breathing, hrv) and its dotted name (`vitals.finger`, ...) in `simulated_fields`. A real finger session has `signal.pulse_source: "finger_ppg"` and no pulse entry in `simulated_fields`; one session's pulse is all real or all simulated.
- None of these blocks is read by the analytics engine, `daily.v1` or the patient view.

## 4. How the hub uses it

The analytics engine (`contracts/api.md` section 5.1) turns sessions and daily records into per-day features, robust z-scores against the person's own 14-day baseline, EWMA trends, the composite early-warning index with visible contributions, a CUSUM state (stable, watch, consider a check-in call, consider discussing a booster session) and the per-person bandit ("What helps"). In-game reaction times (`tasks[].extra.rt`) become exploratory secondary features outside the composite; `core.rt` stays the reaction-time input of the index. The clinician decides; the system only suggests.
