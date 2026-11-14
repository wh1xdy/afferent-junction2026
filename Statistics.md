# Statistics

Every metric Afferent computes, how it is computed, how much evidence stands behind it, and what role it plays in the early-warning composite. Code: `hub/afferent_hub/analytics/` (engine, features, stats, bandit, validation) and `hub/afferent_hub/synthetic.py`. Synthetic results: `Validation.md`.

Ground rules:

- All numbers are derived on the phone or the local hub. No raw camera frames, audio or images are stored or sent. Facial data means eye openness, PERCLOS, blink rate and head pitch; never emotion.
- Everything is compared with the person's own baseline, never with population norms.
- Afferent is supportive and suggests; a clinician decides. Nothing here diagnoses or treats anything. Wording on screen: "early warning", "suggests", "maintenance".
- `null` means not measured. Missing data lowers completeness and confidence; it is never filled with a default.

Evidence levels used below:

- **established**: the construct and a comparable measure are well supported in published depression or psychophysiology research. Our own short or game-based version is still not validated.
- **plausible**: research supports a link with depression or relapse, but our proxy (for example bed presence instead of polysomnography) adds uncertainty.
- **exploratory**: interesting and cheap to collect, weak or indirect evidence. Low or no weight in the composite.

## Dimension 2: per game session (active, seconds to minutes)

Fields are in `contracts/session.v3.schema.json` and `SessionSchema.md`. Each session has a fixed core (about 25 s, identical every time), two measurement tasks in fixed slots and adaptive tasks chosen by the director.

| Metric | How it is computed | Evidence | Role |
|---|---|---|---|
| Resting pulse (`core.rest.pulse_bpm`) | Median pulse over the 6 s rest, from the bedside KY-039, face rPPG or the labelled simulator, with `pulse_quality` 0 to 1 | established as a measure; plausible as a marker | Director baseline (median of the first 7 valid sessions, then 14-day rolling median). Not used for the morning pulse feature |
| Spontaneous blink rate | Closures of 50 to 500 ms per minute, rest window only (blinks are not game input) | exploratory | Context, director rest baseline. 6 s is noisy, always shown with its quality |
| Eye openness | Median of 1 minus mean(blink_l, blink_r) over the rest | plausible | Context, director rest baseline |
| Head pitch | Median head pitch in camera space, positive is chin up; posture proxy | exploratory | Context, director rest baseline, defines "upright" |
| Ambient light | Camera exposure proxy (ARKit ambient intensity / 2000), `dark_room` below 0.15 | context only | Quality flag |
| Mood check-in (`core.mood_start`, `mood_end`) | 5 lanterns, cool dim blue (1) to warm bright amber (5); ordinal, no words | established (single-item momentary mood ratings); our lantern version not validated | **Composite: "Mood check-in", weight 1.5, worse when low**. Crisis card offered when 1 at start and end (self-report only) |
| Reaction time median (`core.rt.median_ms`) | 5 tap trials to a lighthouse flash, foreperiod 1.0 to 2.5 s; median of taps >= 150 ms; valid with 5 trials and >= 3 taps | established (psychomotor slowing, PVT-type tasks); 5 trials is short | **Composite: "Reaction time", weight 1.5, worse when high** |
| RT variability, lapses, anticipations | IQR (linear interpolation); lapses = taps > 1000 ms plus misses; anticipations < 150 ms | plausible | Shown in the session detail, not in the composite |
| Per-task pulse response | Start (median of first 3 s), min, max, end (median of last 3 s), delta, time to target (first 2 bpm move in the intended direction), recovery slope (least squares, calm and rest only) | exploratory | Input to the bandit and to "immediate effect" |
| `helped` | true if the pulse moved >= 2 bpm in the task's intended direction (calm, rest: fall; wake, fatigue: rise); null if no direction or pulse quality < 0.5 | exploratory (a within-session proxy, not a clinical outcome) | **Bandit outcome** |
| Upright time (`tasks[].upright_s`) | Seconds with head pitch >= rest pitch minus 5 degrees | exploratory | **Composite: "Upright time in play"** = sum of upright seconds / sum of task seconds, weight 0.5, worse when low |
| Eye metrics in tasks | Mean eye openness, PERCLOS (share of tracked frames with eyes closed), long closures (> 0.5 s) | established for drowsiness (PERCLOS); exploratory in depression | Director fatigue mode; context. Not an alertness measure |
| Effort choice (`fork.hard_prop`) | Fork task, 2 choices per session: easy path (3 slow lights, reward 1) or hard path (8 faster lights, reward 2 or 3); share of hard choices, no-choice excluded | plausible (effort-based decision making, EEfRT family); 2 choices per session is very short, so it is pooled | **Composite: "Effort choice (7 sessions)"** = mean hard share over the last 7 sessions that have one (needs 3), weight 1.0, worse when low |
| Effort reward slope | hard(reward 3) minus hard(reward 2) per session; pooled over the last 7 fork sessions as P(hard given 3) minus P(hard given 2), needs 2 choices at each reward | exploratory | `timeline.effort_reward_slope`, context |
| Reward bias (`two_lanterns.log_b`) | Two lanterns task (probabilistic reward task adaptation): 12 trials, pick the larger lantern, rich lantern rewarded 3:1; log b = 0.5 log10(((rc + 0.5)(li + 0.5)) / ((ri + 0.5)(lc + 0.5))) | exploratory (the PRT is established in research; 12 trials per session is far below the original) | **Composite: "Reward bias log b (7 sessions)"**: the four cells are summed over the last 7 valid sessions (needs 3), then the same formula; weight 0.5, worse when low |
| Discriminability (`log_d`) | 0.5 log10(((rc + 0.5)(lc + 0.5)) / ((ri + 0.5)(li + 0.5))) | exploratory | Quality check for the lantern task (a near-zero log d makes log b meaningless) |
| Breathing compliance | `breath_sync` (share of time the hold matched the pacer), `eyes_closed_s` | exploratory, marked as estimates | Context |
| Engagement | Completed, duration, pauses (app backgrounded), skipped tasks, time from reminder to Begin | plausible (falling adherence is itself a signal) | Context; missed days enter the composite through Dimension 1 |
| Pre/post (`pre_post`) | Start = core rest values (and `mood_start`), end = median over the last 6 s of play before dawn (and `mood_end`), delta | exploratory | Headline "how did the game affect you today"; dashboard panel; `pre_post_summary` = median pulse and mood delta over the last 7 played sessions, `settled_share` = share with pulse delta <= -2 bpm |

## Dimension 1: everyday, passive (days to weeks)

Fields are in `contracts/daily.v1.schema.json`: one record per patient and day, built by the hub from bedside and phone events, or by the synthetic generator. Steps are simulated unless the app streams them.

| Metric | How it is computed | Evidence | Role |
|---|---|---|---|
| Time in bed, sleep onset, wake time, sleep midpoint | Infrared presence at the bed: first in-bed period of the night, last exit in the morning; midpoint = (onset + wake) / 2 | plausible (sleep disturbance is a core symptom; bed presence is a proxy for sleep, not sleep) | Context series `timeline.time_in_bed_h`, `sleep_midpoint_h` |
| Sleep regularity: inter-daily stability (IS) | Over the trailing 7 days of `presence_hourly` (24 values per day, fraction of each hour in bed), needs >= 4 days: IS = n * sum_h (mean_h - mean)^2 / (p * sum_i (x_i - mean)^2), n = all hourly values, p = 24. 1 = identical every day, near 0 = no daily pattern | plausible (IS is established in actigraphy research; bed presence instead of activity is our proxy) | **Composite: "Sleep regularity", weight 1.0, worse when low** |
| Intradaily variability (IV) | Same 7-day window: n * sum (x_i - x_{i-1})^2 / ((n - 1) * sum (x_i - mean)^2); high = fragmented | exploratory | Context `timeline.sleep_iv_7d` |
| Midpoint variability | Standard deviation of the sleep midpoint over the trailing 7 days (needs 4) | plausible | Context `timeline.sleep_midpoint_sd_7d` |
| Night-time restlessness | Presence-sensor motion bursts between onset and wake | exploratory | Context `timeline.restlessness` |
| Morning resting pulse | 30 s KY-039 reading after waking (finger on the stone before 11:00), used when quality >= 0.5 or quality unknown; no fallback to the in-game rest pulse, because that reading runs about 5 bpm higher (seated, after getting up) and mixing the two sources would shift the baseline whenever the share of each source changes | plausible (resting heart rate tends to rise in depressive episodes; single readings are noisy) | **Composite: "Morning resting pulse", weight 0.75, worse when high**. Pulse only, Afferent does not compute HRV |
| Home or away hours, home-only day | Phone presence via Wi-Fi/BLE at the bedside unit; home-only = away < 0.5 h | plausible (homestay and mobility from phones correlate with depressive symptoms) | **Composite: "Home-only days (7 d)"** = home-only days in the trailing 7 days, scaled to 7 days when some days are unknown (needs 4 known days), weight 0.75, worse when high |
| Visitors | Count of unfamiliar nearby devices; nobody is identified | exploratory | Context only |
| Steps | Phone accelerometer step-like activity | plausible; SIMULATED tonight | Context only |
| Room temperature, humidity | Modulino thermo | context only | Context |
| Bedside light | Minutes on, knob dawn level, minutes of morning dawn light | exploratory (low-intensity dawn light is not light therapy) | Next-day association "Bedside dawn light" (association, not causation) |
| Played, declined, missed | missed = day complete and not played and not declined. Declined ("Not tonight", sharing paused) never counts as missed | plausible | **Composite: "Missed sessions (7 d)"** = missed days in the trailing 7 days, scaled to 7 known days (needs 4), weight 1.0, worse when high |
| Knob uses, session time, reminder time | From the bedside unit and the app | exploratory | Context |

## Dimension 3: analytics (the brain)

All functions are pure and deterministic (`contracts/api.md` section 5). Output shape: `contracts/fixtures/analytics_anna.json`.

### Day model

`day_index` = days since the end of TMS. Per day, the engine uses the last session with status completed, partial or fell_asleep (for reaction time, the last one with a valid RT block). Repeated live runs on one day overwrite that day instead of stacking.

### 1. Personal baseline

Per feature: values on days 0 to 13; if fewer than 7, extend day by day until 7 values or `now_day`. `median`, raw `mad`, `scale = max(1.4826 * mad, floor)`, `ready = n >= 7`, and the soft band `median +- scale` drawn on the dashboard. z-scores need at least 3 baseline values.

MAD floors (the smallest change we treat as one unit): reaction time 20 ms, mood 1 lantern, sleep regularity 0.05 IS, missed sessions 1 day per week, effort 0.2, morning pulse 2 bpm, home-only days 1 day per week, upright 0.05, reward bias 0.15 log b. Why floors: windowed features (7-day counts, 7-session pools) barely move inside a 14-day baseline, so their raw MAD is far smaller than their real week-to-week spread. Without floors, stable patients produced z-scores of 4 and more. The floors were raised from the first contract draft (mood 0.5, counts 0.75, effort 0.15, reward bias 0.1) after the synthetic validation showed exactly that.

Evidence: established method (robust statistics, n-of-1 baselines).

### 2. Robust z and trend

`z = (x - median) / scale`; `signed_z = z` when higher is worse, `-z` when lower is worse, so positive always means "worse than usual for this person". Trend: EWMA of `signed_z` with lambda 0.3, skipping missing days; it counts as current only within 3 days of the last observation (`stale_days`), so a sensor that stops reporting drops out of the composite instead of freezing it. A 7-day rolling median of each raw value is in `features[].series.rolling_7d`, and a 7-day rolling mean of the composite in `timeline.composite_7d`.

Evidence: established methods.

### 3. Composite early-warning index

Per day: `composite = sum(w_i * clip(ewma_i, -3, 3)) / sum(w_i)` over features with a current EWMA. Each feature's `contribution` is its term, so the contributions add up exactly to the composite and the dashboard can show them as a stacked bar. `share` = |contribution| / sum of |contributions|. `completeness` = available weight / total weight (8.5). `confidence`: high when completeness >= 0.75 and at least 7 baselines are ready, medium when completeness >= 0.5, else low.

| Feature | Weight | Worse | Evidence |
|---|---|---|---|
| Reaction time | 1.5 | high | established |
| Mood check-in | 1.5 | low | established |
| Sleep regularity | 1.0 | low | plausible |
| Missed sessions (7 d) | 1.0 | high | plausible |
| Effort choice (7 sessions) | 1.0 | low | plausible |
| Morning resting pulse | 0.75 | high | plausible |
| Home-only days (7 d) | 0.75 | high | plausible |
| Upright time in play | 0.5 | low | exploratory |
| Reward bias log b (7 sessions) | 0.5 | low | exploratory |

Weights follow the evidence level, they are not fitted. Evidence for the composite as a whole: exploratory (synthetic validation only).

### 4. Change detection: CUSUM

One-sided CUSUM on the composite from day 14: `S_d = max(0, S_{d-1} + composite_d - k)` with **k = 0.35**; days without a composite keep S, and so do days without any new observation (no daily record and no played session): the composite is still shown from the carried EWMA, but it is not fed to the CUSUM again, so S never moves on extrapolation alone. The windowed features (7-day counts, sleep regularity) are only emitted on days with a daily record. States: stable below 1.5, watch from 1.5, "consider a check-in call" from 3.0, "consider discussing a booster session" from 8.0; always stable before day 14. The suggestion text is fixed per state and always ends with "The clinician decides." `reasons` = the labels of the three largest positive contributions.

k was lowered from 0.5 (first contract draft) to 0.35 after the synthetic sensitivity analysis: one day earlier median detection (13 instead of 14 days after onset) for 3 instead of 1 false check-in episodes in 2100 stable patient-days (0.043 instead of 0.014 per patient-month). We accepted that trade for the demo; a real deployment would set k and the thresholds on real follow-up data. See the sensitivity table in `Validation.md`. Evidence: established method (Page's CUSUM), parameters exploratory.

### 5. What helps this person

- **Immediate effect** (`bandit.immediate`): per (mode, task) the median pulse delta with IQR, median recovery slope, median head pitch change and median eye openness, over all runs with pulse quality >= 0.5.
- **Bayesian bandit** (`bandit.arms`): arms are (mode, task) in the modes with an intended direction: calm {Breath, Löyly}, wake {Fireflies, Beacon, Bells}, fatigue {Shutters, Bells, Beacon}, rest {Breath}. Beta(1, 1) prior, `alpha = 1 + helped`, `beta = 1 + not helped`. `p_best` per arm within its mode by Monte Carlo (4000 draws per arm, `numpy.random.default_rng(0)`, so it is deterministic), `ci90` from the 5th and 95th percentile of the same draws. Thompson sampling is expressed as selection probabilities: `w = max(p_best, 0.05)`, renormalised per mode; the hub sends them to the phone in `config`, and the director picks the next task with these weights, under one deliberate variety rule: the task just played is never picked again back to back (game and simulator alike). With two calm tasks, a second calm slot in the same session therefore always gets the other task, which limits how strongly the director can exploit the winner. Flow tasks have no intended direction, so they keep uniform weights.
- **Next-day association** (`bandit.next_day`): for each task (the 4 with the most "with" days, each side needs >= 5 days) and for the bedside dawn light: mean next-day mood check-in and mean next-day composite change, on days with versus without it. Always labelled "association, not causation": tasks are not randomised across days, and the bandit itself makes good tasks more frequent.

Evidence: Thompson sampling is an established method; the "helped" outcome and the associations are exploratory.

### 6. Completeness and data quality

`completeness.overall` (composite weight available today), `sessions_7d`, `days_7d`, `missed_7d`, and `by_feature` (share of the last 7 days with a raw value). Low completeness lowers the confidence label next to the state.

### 7. Validation

`python -m afferent_hub.analytics.validate` runs 50 relapse and 50 stable synthetic patients day by day and reports the days from onset to flag (detection delay), false alarms, a mood-only comparison and bandit convergence. Results and charts: `Validation.md`, served as JSON at `GET /api/validation`. Simulated, set on synthetic data only, not clinically validated.

## Output fields beyond the first contract fixture

The engine returns every key of `contracts/fixtures/analytics_anna.json` and adds, without changing existing keys: `features[].series.rolling_7d`, `bandit.immediate`, and in `timeline`: `composite_7d`, `sleep_regularity`, `time_in_bed_h`, `sleep_midpoint_h`, `sleep_midpoint_sd_7d`, `restlessness`, `sleep_iv_7d`, `effort_reward_slope`. `timeline.live_days` lists days with a session that is not synthetic history (its `simulated_fields` does not contain `"*"`).
