# Personal decline alert

The core loop of Afferent: the home sensors feed the data manager, the hub watches how each
indicator drifts away from the person's **own** usual level, and when one drops too far the
voice companion is told that things are not going well, so it can gently acknowledge it and
suggest talking to the doctor.

```
sensors ──► data manager (Jetson, :8100) ──► hub decline analyzer ──► voice_context ──► phone ──► voice relay ──► Gemini Live
            daily aggregates                 hub/afferent_hub/decline.py   (ws push)    cache     prompt context
```

Code: `hub/afferent_hub/decline.py` (analysis, scenarios), `hub/afferent_hub/service.py`
(`Hub.decline`, `voice_context`, `push_voice_context`, `_run_decline`), routes in
`hub/afferent_hub/api/routes.py`. Tests: `hub/tests/test_decline.py`.

> The indicators, thresholds and windows below are **provisional placeholders** chosen for
> the prototype. They are not clinical thresholds and must be tuned on real data.

## What is analysed

| Key | Data manager metric | Daily value | Better when |
|---|---|---|---|
| `outings` | `presence.outing` | `minutes` outside | higher |
| `visits` | `presence.guest_visit` | `minutes` with visitors | higher |
| `hrv` | `vitals.hrv_rmssd_ms` | daily `median` | higher |
| `posture` | `posture.head_trunk_angle_deg` | daily `median` | lower |

For each indicator the hub reads `GET /api/v1/daily` from the data manager and:

1. drops today's partial day and days without a value;
2. **reference** = median of the 14 full days before the recent window;
3. **current** = mean of the latest 3 full days;
4. **score** = `current / reference` (higher-is-better) or `reference / current` (posture);
5. score `< 0.8` → indicator `low`. Any `low` indicator makes the report `level: "low"`.

Fewer than 5 reference days, no recent day or a reference of 0 gives `not_enough_data`; a
metric the data manager cannot serve gives `no_data`. Neither raises an alert. Every read is
best-effort: a data manager that is down never breaks the phone or the companion.

To add an indicator, add a row to `INDICATORS` (and a base value to `BASES` for the synthetic
scenarios) in `decline.py`.

## What the companion receives

When the report is `low`, the hub's daily `voice_context` (see the *Voice companion* section
of the main README) becomes `indicator: "bad"`, the decline facts come first, and
`suggest_doctor` is true:

```json
{"type": "voice_context", "patient_id": "anna", "date": "2026-11-14", "indicator": "bad",
 "facts": ["heart-rate variability is at 70% of their usual level over the last 3 days",
           "stayed home nearly all day on 3 of the last 7 days"],
 "suggest_doctor": true,
 "decline": [{"key": "hrv", "score": 0.697, "forced": false}]}
```

The phone caches it and sends it to the voice relay in the auth message; the relay validates
it (`clean_context`) and appends it to the system prompt. No change was needed on the phone or
the relay. The companion only sees facts, never raw sensor values or a diagnosis.

## How it runs

The analyzer is not a separate script or cron job: it runs **inside the hub process**.

- **On demand**, every time one of these happens:
  - `GET /api/patients/{pid}/decline`;
  - a `voice_context` request (ws `{type: "voice_context"}` or `GET /api/patients/{pid}/wellbeing`);
  - the app connects (`hello` on `/ws/app`): if an alert is active, the app is sent a fresh
    `voice_context` straight away, even if it already asked today.
- **Automatically**: a background task of the hub checks the bound patient every
  `AFFERENT_DECLINE_INTERVAL_S` seconds (default one hour). When the level changes
  (`ok` ↔ `low`), or on the first check if it is already `low`, it pushes a fresh
  `voice_context` to the patient's app. The task waits quietly while the data manager is not
  reachable, so it also works with `AFFERENT_DATA_MANAGER_URL=auto` on the Jetson, where the
  data manager is found over mDNS after startup.

The companion uses the context at the **start** of the next Talk conversation; a conversation
already in progress is not changed.

Measured analysis only applies to the bound patient (`AFFERENT_BEDSIDE_PATIENT`, default
`anna`): the data manager holds that one home's sensors.

### Configuration

| Environment variable | Default | Meaning |
|---|---:|---|
| `AFFERENT_DATA_MANAGER_URL` | empty (off) | Data manager URL; `auto` on the Jetson home hub |
| `AFFERENT_DATA_MANAGER_TOKEN` | — | Bearer token of the data manager |
| `AFFERENT_DECLINE_THRESHOLD` | `0.8` | Score below which an indicator is low |
| `AFFERENT_DECLINE_REF_DAYS` | `14` | Full days in the personal reference |
| `AFFERENT_DECLINE_RECENT_DAYS` | `3` | Latest full days compared with the reference |
| `AFFERENT_DECLINE_INTERVAL_S` | `3600` | Background check interval; `0` disables it |

### Reading the analysis

```sh
HUB=http://localhost:8000          # ./start.sh default; add the hub token on the Jetson
curl "$HUB/api/patients/anna/decline"
```

```json
{"level": "low", "threshold": 0.8, "ref_days": 14, "recent_days": 3, "forced": false,
 "source": "data_manager", "scenario": null, "patient_id": "anna",
 "checked_iso": "2026-11-14T19:27:15+02:00",
 "indicators": [
   {"key": "outings", "metric": "presence.outing", "label": "time spent outside",
    "better": "higher", "reference": 170.25, "current": 96.3, "score": 0.566,
    "status": "low", "days_reference": 14, "days_recent": 3},
   "…"]}
```

`source` is `data_manager` (measured), `synthetic` (demo scenario) or `none` (no data manager,
or not the bound patient). `forced` is true whenever the demo API is involved.

## Demo API: demos and testing only

> **Not part of the product.** These routes exist to show the alert during a demo without
> waiting for two weeks of real decline. They override what the companion is told, live in
> the hub's memory only (lost on restart), and **never write** to the data manager or the hub
> database. Always `DELETE` after a demo. On the home hub they sit behind the hub token like
> every other route.

Three modes, one at a time per patient (setting one clears the other):

1. **Scenario**: a named synthetic dataset, generated on the fly (17 days per indicator,
   deterministic ±3 % noise) and run through the **real** analyzer. Use it to show that the
   detection itself works.
2. **Scores**: impose a score per indicator directly on top of the measured report.
3. **Empty body**: the default preset, `outings` 0.55 and `visits` 0.4.

| Scenario | Data | Expected result |
|---|---|---|
| `stable` | everything at the usual level | `ok` |
| `withdrawal` | outings 50 %, visits 30 % | `low` (outings, visits) |
| `stress` | HRV 70 % | `low` (hrv) |
| `slumped` | posture 70 % (head angle up) | `low` (posture) |
| `global_decline` | every indicator 60 % | `low` (all four) |
| `borderline` | outings and visits 88 % | `ok`: down, but above the 80 % threshold |
| `recovering` | every indicator 115 % | `ok` |

```sh
# list the scenarios
curl "$HUB/api/demo/decline/scenarios"

# synthetic dataset through the real analyzer
curl -X POST "$HUB/api/demo/decline" -H 'Content-Type: application/json' \
  -d '{"scenario": "withdrawal"}'

# impose scores (keys: outings, visits, hrv, posture; values 0..2)
curl -X POST "$HUB/api/demo/decline" -H 'Content-Type: application/json' \
  -d '{"scores": {"outings": 0.55, "hrv": 0.7}}'

# default preset
curl -X POST "$HUB/api/demo/decline" -H 'Content-Type: application/json' -d '{}'

# back to measured data
curl -X DELETE "$HUB/api/demo/decline"
```

`POST` and `DELETE` accept `patient_id` (body / query, default the bound patient). Both return
`{"ok": true, "mode": ..., "decline": <report>, "voice_context": <message>}` and push the new
`voice_context` to the connected app at once. Errors: `400 unknown_scenario`,
`400 bad_decline_scores` (unknown key or value outside 0..2), `400 bad_request` (scenario and
scores together), `404 unknown_patient`.

### Demo script

1. Start the hub (`./start.sh`) and open the app connected to it.
2. `POST /api/demo/decline {"scenario": "withdrawal"}`: the app receives the bad-day context.
3. Open **Talk**: the companion gently acknowledges that things have been hard and suggests
   contacting the doctor once.
4. `DELETE /api/demo/decline` when done.

## What the doctor sees

Today the decline alert goes to the companion only. The doctor's channel, the QR code
("Show to my doctor"), is built from the sessions sent by the phone and contains no
data-manager values. Showing the decline report to the clinician is a separate, still open
decision.

## Tests

```sh
cd hub && .venv/bin/python -m pytest -q tests/test_decline.py tests/test_wellbeing.py tests/test_home_hub.py
```

They cover the score maths (higher and lower is better, partial day, too few days, a failing
read), every scenario's expected result, overrides, the demo routes, the push to a connected
app, the push on `hello`, and the sensor wiring on the home hub.
