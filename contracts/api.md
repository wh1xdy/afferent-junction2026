# Afferent contracts v3: hub API, WebSockets, module interfaces

Source of truth for every builder tonight. If code and this file disagree, this file wins until the contract agent changes it. Requirements behind it: `contracts/BRIEF.md`, `Decisions.md` (section "v3 decisions"). Schemas: `contracts/session.v3.schema.json`, `contracts/daily.v1.schema.json`. Fixtures: `contracts/fixtures/`.

Conventions:

- JSON everywhere, UTF-8, `snake_case` keys. `null` means not measured, never a default.
- Day model: `day_index` = days since the patient's TMS end date (`tms_end_date`, day 0). The hub's `now_day` for a patient = (hub local date - `tms_end_date`) in days. The demo seeds every patient so that `now_day = 56`: synthetic history covers days 0 to 55 (complete days), and today (day 56) is where live sessions land.
- Several sessions on one day: analytics uses the last session of that day with `status` in `completed`, `partial`, `fell_asleep` (and `core.rt.valid` for the reaction-time feature). Repeated live demo runs therefore overwrite "today" instead of stacking days.
- Everything simulated carries `simulated: true`. Every screen that shows simulated data shows the word `SIMULATED` (dashboard: a small badge per patient and on charts; app: a chip on the debug panel and patient view).
- Claims: "supportive", "maintenance", "early warning", "suggests". Never "treats", "prevents relapse", "diagnoses", "detects emotions", "measures alertness", "clinically validated". HRV values (RMSSD, SDNN) are shown as measured numbers with source and unit; never called a stress level, strain, or used for a diagnosis or a treatment decision (Decisions I53; section 3.5). Facial data is eye openness, PERCLOS, blink rate and head pitch, never emotion.

## 1. Running

- One command: `./start.sh` in the repo root (hub agent writes it). It creates `hub/.venv` if missing, installs `hub/requirements.txt`, and runs `uvicorn afferent_hub.main:app --host 0.0.0.0 --port 8000` from `hub/`. It prints the LAN URLs for the phone and the dashboard.
- FastAPI app object: `afferent_hub.main:app`.
- Environment variables (all optional):

| Variable | Default | Meaning |
|---|---|---|
| `AFFERENT_PORT` | `8000` | HTTP and WebSocket port |
| `AFFERENT_DB` | `hub/data/afferent.db` | SQLite file (gitignored) |
| `AFFERENT_BEDSIDE` | `sim` | `sim` (hardware simulator), `unoq:<base url>` (UNO Q over HTTP, for example `unoq:http://127.0.0.1:18081` behind `wendy net forward 18081:18080 --device <uno-q>`; needs the wendy CLI and Alex's org login on the hub host; `./start.sh --unoq URL`; section 3.5), `serial:/dev/ttyACM0` (UNO Q over USB serial; not implemented by current hardware, section 4), `ws` (device connects to `/ws/bedside` itself, no simulator), `off` |
| `AFFERENT_SIM_PULSE` | `0` | `1` makes the bedside simulator also stream pulse. Off by default, so the phone's own vitals simulator (profiles, sliders) stays in control |
| `AFFERENT_OLLAMA_URL` | `http://127.0.0.1:11434` | Local Ollama for Gemma |
| `AFFERENT_GEMMA_MODEL` | unset | Force a model name; otherwise the first installed model whose name starts with `gemma3n`, then `gemma3`, then `gemma` |
| `AFFERENT_SEED` | `7` | Seed for the demo roster |

- On startup, if the database has no patients, the hub seeds the demo roster (section 6.2). `POST /api/demo/reset` does the same on demand.
- CORS: allow all origins (the Capacitor app runs on `capacitor://localhost`). No auth tonight (local network only; logged as a known gap).

### 1.1 Static mounts

| Path | Serves | Notes |
|---|---|---|
| `/` | redirect to `/clinic/` | |
| `/clinic/` | `hub/afferent_hub/web/clinic/` (`index.html`) | Clinician dashboard |
| `/app/` | `demo/` (`index.html`) | Game. `/app/patient.html` is the patient view |
| `/app/design/` and `/design/` | `design/` | Shared tokens and fonts. Mount `/app/design` before `/app` |
| `/contracts/` | `contracts/` | Read-only, handy for builders |

Pages reference the tokens relatively: the game and patient view use `design/tokens.css` (resolves to `/app/design/tokens.css` on the hub and to `demo/design/tokens.css` inside the Capacitor bundle); the dashboard uses `/design/tokens.css`. Before `npx cap sync ios`, run `npm run design` (copies `design/` to `demo/design/`, which is gitignored). The hub agent adds that script to `package.json`.

## 2. REST endpoints

All under `/api`. Errors: `{"error": "<code>", "detail": "<text>"}` with HTTP 400, 404 or 422.

### GET /api/health

```json
{"ok": true, "version": "0.3.0", "now_iso": "2026-11-15T07:43:12+02:00", "patients": 6, "bedside": {"source": "simulator", "connected": true}, "gemma": {"available": false, "model": null}}
```

### GET /api/patients

Patient list sorted by need: state severity (`booster` > `check_in` > `watch` > `stable`), then composite descending. Example: `fixtures/patients_list.json`.

```json
{
  "now_day": 56, "date": "2026-11-15", "simulated": true,
  "patients": [
    {
      "id": "anna", "display_name": "Anna", "kind": "relapse", "simulated": true,
      "day_index": 56, "weeks_since_tms": 8.0,
      "state": "booster", "state_label": "Consider discussing a booster session", "state_since_day": 45,
      "composite": 2.453, "composite_trend_7d": 0.237, "cusum": 28.34,
      "top_contributors": [{"key": "rt_median", "label": "Reaction time", "contribution": 0.529}],
      "last_session_day": 56, "last_session_iso": "2026-11-15T07:46:00+02:00", "live_now": false,
      "missed_7d": 1, "completeness": 1.0, "confidence": "high",
      "sparkline": [1.9, 2.0, 2.1],
      "flags": [],
      "need_rank": 1
    }
  ]
}
```

- `sparkline`: composite for the last 14 days (`null` gaps allowed).
- `live_now`: true while a session for that patient is running on `/ws/app`.
- `flags`: `[{"type": "safety_high" | "safety_moderate" | "safety_incomplete" | "safety_low" | "talk_request", "t_iso": "...", "source": "checkin" | "talk_button" | "mood", "checkin_id": "...", "screen": "support" | "crisis", "label": "..."}]`, sorted `safety_high`, `safety_moderate`, `safety_incomplete`, `safety_low`, `talk_request`, newest first within a type, cleared by the clinician (`POST /api/patients/{id}/flags/clear`). `checkin_id` and `screen` only on safety flags. `label` only on `safety_moderate`: "C-SSRS not asked; tier from item 9" (`safety.source = item9_fallback`) or "known lifetime behaviour, unchanged since last check-in" (`cssrs.c6_repeat`). The dashboard list sorts flagged patients first in the same order.

### GET /api/patients/{id}

```json
{
  "patient": {"id": "anna", "display_name": "Anna", "kind": "relapse", "simulated": true, "tms_end_date": "2026-09-20", "now_day": 56,
              "clinic_contact": {"name": "Your clinic", "number": "09 000 0000", "hours": "office hours"}},
  "privacy": {"sharing": "summary", "sensors": {"phone_camera": true, "pulse_stone": true, "bedside_camera": false, "bedside_light": true, "presence": true, "phone_presence": true, "phone_motion": true}},
  "latest_session": {"...": "full session v3 document"},
  "sessions": [{"session_id": "...", "day_index": 56, "started_iso": "...", "status": "completed", "profile": "live", "simulated": true,
                "duration_ms": 109800, "rt_median_ms": 437, "mood_start": 2, "mood_end": 3, "pre_post": {"...": "as in the session"}}],
  "daily": [{"...": "daily v1 records, oldest first"}],
  "checkins": [{"...": "afferent.checkin/1 documents, newest first, plus day_index and received_iso"}],
  "phq": {"total": 12, "phq8_total": 11, "band": "moderate", "date": "2026-11-15", "checkin_id": "...",
          "history": [{"checkin_id": "...", "date": "2026-11-15", "completed_iso": "...", "day_index": 56,
                       "total": 12, "phq8_total": 11, "band": "moderate", "early": false}],
          "days_since": 0, "overdue": false,
          "last_attempt": {"checkin_id": "...", "status": "completed", "started_iso": "...", "safety_tier": "none"}}
}
```

`phq` holds the latest completed check-in (`total`, `phq8_total`, `band`, all null before the first) and `history`, completed check-ins only, oldest first. Incomplete check-ins give no total. `overdue` is true 17 days or more after the last completed one. `last_attempt` is the newest check-in of any status. The dashboard detail shows it as the "PHQ-9 check-in" card (totals, PHQ-8, band, history bars, the last 5 check-ins with their safety tier).

`sessions` is compact and oldest first, all of them (56 days is small). `GET /api/sessions/{session_id}` returns one full session document.

### GET /api/patients/{id}/analytics

Exactly the output of `analyze_patient` (section 5.1). Shape: `fixtures/analytics_anna.json`. Recomputed after every new session or daily record and cached.

### GET /api/patients/{id}/patient-view

Gentle, wordless-where-possible data for `demo/patient.html`. Shape: `fixtures/patient_view_anna.json`. Rules: no pulse numbers, no composite, no state label, no z-scores. `today.arc` is 2 to 12 values in 0 to 1 (warmth through today's session, for drawing). `week` is the last 7 days ending today. `what_helped` comes from the bandit (top arm per mode with `p_best >= 0.5`, max 3, plus the dawn light association when its `mood_diff > 0`); texts are fixed templates per task id, never generated. `crisis` is fixed text (section 7).

Streak (`design/engagement.md` section 6), computed by `views.streak()`:

- Top level: `mornings_lit` (int, lifetime, never decreases; the number the patient view shows), `streak` (int, or `null` below 2: the app never shows 0 or 1, and the patient view never shows it at all), `freezes` (0 to 2), `pause` (`{"source": "patient" | "clinician", "until": "YYYY-MM-DD"}` or `null`).
- `week[].state`: `lit` (lantern in that day's mood colour), `missed` (same lantern, unlit), `frozen` (unlit with a frost rim), `rest` (lantern set down: Not today, a streak pause, or a session that did not light), `today` (outline with an ember, not yet lit). `week[].missed` and `week[].frozen` follow `state`.
- A **lit morning** is a session with status `completed` or `fell_asleep`, or `partial` with a finished core (5 trials) and the player's own input (start mood or any tap). Mood, reaction time, Fork and Two lanterns values never change it (firewall test in `hub/tests/test_api.py`).
- The walk starts at the first day with any data. 2 freezes are held at the start; 1 more is earned at every 7th morning lit (cumulative, not streak days), cap 2.
- Today never breaks anything. Rest days (daily `declined`, a `declined` session, a streak pause, or a past day with only a non-lit session) hold the streak without growing it and use no freeze.
- Any other past day is missed. With a streak running and a freeze held, the freeze is used automatically (`frozen`). Without a freeze, up to 3 unprotected missed days are silently repaired by the next lit morning: the streak continues, the days stay `missed` (history is not rewritten, `streak_protection: "repair"` in the daily record). A 4th unprotected day ends the streak; `streak` is then `null` until a new streak reaches 2.
- Sharing (`summary`, `nothing_tonight`, `paused`) is a privacy setting and no longer touches the streak. Withheld days arrive as `declined` daily records.

### GET /api/patients/{id}/summary

Weekly clinician summary. `?refresh=1` regenerates. Shape: `fixtures/summary_example.json`.

```json
{"patient_id": "anna", "week_start_day": 50, "week_end_day": 56, "generated_iso": "...",
 "text": "Anna (simulated), week 9 after TMS. ...", "source": "template", "model": null,
 "numbers": {"state": "booster", "composite": 2.453, "...": "exactly the numbers the text was written from"},
 "simulated": true,
 "disclaimer": "Written on the hub from the numbers shown. Rephrasing only: no advice, no diagnosis."}
```

The dashboard shows `source` as a small label: "Gemma on the hub (model name)" or "Template".

### POST /api/sessions

Body: a session v3 document (`afferent.session/3`). The phone normally sends it over `/ws/app` as `session_end`; this endpoint is the HTTP fallback and the test entry.

- Validates against `contracts/session.v3.schema.json`; 422 with the first errors on failure.
- Fills `day_index = now_day` of that patient when it is `null`.
- Idempotent on `session_id`: a repeat returns 200 with `"duplicate": true` and changes nothing.
- Updates today's daily record (`played`, `session_time_h`, `session_ids`; `declined` for declined sessions), recomputes analytics, broadcasts `session_added` and `analytics_updated` on `/ws/clinic`, and returns:

```json
{"ok": true, "duplicate": false, "session_id": "b7d0a0e6-...", "patient_id": "anna", "day_index": 56,
 "state": "booster", "composite": 2.45, "composite_before": 2.41}
```

### POST /api/checkins

Body: an `afferent.checkin/1` document (`contracts/checkin.v1.schema.json`). HTTP fallback of the `checkin` WebSocket message, same handling: 422 on schema errors, 404 for an unknown patient, idempotent on `checkin_id`. Response `{"ok": true, "duplicate": false, "checkin_id": "...", "patient_id": "anna", "safety_flag": "safety_low" | null}`.

### POST /api/daily

Body: a daily v1 record. Upserts on (`patient_id`, `day_index`). Same recompute and broadcast as sessions. Used by the bedside aggregation and by tests.

### GET /api/validation

The output of `run_validation()` (section 5.6), computed once at startup in a background task and cached; `{"status": "computing"}` with HTTP 202 until ready. Shape: `fixtures/validation_example.json`.

### POST /api/demo/reset

Body (optional): `{"seed": 7}`. Drops all data, reseeds the demo roster, resets the bedside simulator, broadcasts `demo_reset` and then `analytics_updated` for every patient. Response: `{"ok": true, "patients": ["anna", "mikko", "juha", "leena", "sofia", "eero"], "now_day": 56}`.

### POST /api/demo/profile

Body: `{"profile": "good_day" | "bad_day" | "live", "patient_id": "anna"}`. Sends `profile` to every connected app of that patient (the phone applies it within one frame). Lets the presenter switch the day from the dashboard. Response `{"ok": true, "sent_to": 1}`.

### GET /api/bedside/state

```json
{"source": "simulator", "connected": true, "simulated": true, "updated_iso": "2026-11-15T07:43:10+02:00",
 "light": {"rgb": "#FFF3DC", "level": 60, "fade_ms": 4000, "reason": "dawn"},
 "knob": {"level": 15, "last_press_iso": null},
 "pulse": {"bpm": null, "quality": 0, "contact": false, "source": null},
 "presence": {"in_bed": true, "since_iso": "2026-11-14T23:24:00+02:00", "motion_events_tonight": 14},
 "thermo": {"temp_c": 20.8, "humidity_pct": 31},
 "physio": null,
 "camera_on": false}
```

- `source` is the name of the running bedside source: `simulator`, `unoq_http` (UNO Q over HTTP, `AFFERENT_BEDSIDE=unoq:<base url>`), `unoq` (USB serial) or `ws`. `simulated` is true only for the simulator.
- `pulse.source` is `ky039`, `finger_ppg`, `simulated` or `null`.
- `physio` is the last physio object from the bedside source (section 3.5), or `null` when the source gives none (simulator, serial, `ws` without a `physio` message) or has not delivered one yet. With `unoq_http` it looks like this:

```json
{"source": "finger_ppg", "transport": "hub_http", "simulated": false,
 "pulse_bpm": 72, "quality": 0.62, "quality_reported": true, "contact": true,
 "finger_bpm": [72, 74], "finger_sources": [0, 1],
 "breathing_per_min": 12, "breathing_snr_db": 4.1,
 "rmssd_ms": 41.5, "sdnn_ms": 46.0, "rmssd_vs_baseline": -0.08, "rmssd_baseline_ms": 45.1,
 "presence": "active", "age_s": 0.4}
```

The numbers in this example show the shape only; they are not a measurement.

### POST /api/bedside/light

Body `{"rgb": "#FFC98A", "level": 15, "fade_ms": 2000, "reason": "manual"}`. Sends it to the bedside unit. For the dashboard demo controls and Alex's tests.

### POST /api/patients/{id}/privacy

Body `{"sensor": "phone_camera", "on": false}` or `{"sharing": "paused"}`. Stores it, broadcasts `privacy` on `/ws/clinic` and sends `privacy` to the app. Response: the new `privacy` object.

### POST /api/patients/{id}/pause

Streak pause, the Apple Pause Rings menu (Today, Until Monday, Until next month, Custom date). Body `{"source": "patient" | "clinician", "until": "YYYY-MM-DD", "from": "YYYY-MM-DD"}`; `from` defaults to today, `until: null` ends the current pause of that source from `from` on. A patient pause is capped at 14 days per pause (the hub clamps `until`) and can be renewed; a clinician pause has no cap. Paused days hold the streak, are `rest` in the week and are left out of the missed-session window. Stored on the patient document as `pauses: [{"source", "from_day", "until_day", "set_iso"}]`. Broadcasts `pause` on `/ws/clinic` and to the app, then `analytics_updated`. Response: `{"ok": true, "pause": {"source": "patient", "until": "2026-11-16"} | null, "pauses": [{"source", "from", "until"}]}`. The app may send the same as a `pause` WebSocket message (always `source: "patient"`).

### GET /api/patients/{id}/export

Clinic data export, one action and one zip (Apple Health "Export All Health Data", HL7 FHIR Bulk Data NDJSON per record type). `Content-Disposition: attachment; filename="SIMULATED_afferent_anna_2026-11-15.zip"` (the prefix only when any data is simulated). Contents:

| File | Holds |
|---|---|
| `README.txt` | Starts with "SIMULATED DATA." when any data is simulated |
| `manifest.json` | `patient_id`, `simulated`, `tms_end_date`, `now_day`, `date`, `generated_iso`, schema versions, counts, `pauses` |
| `sessions.ndjson` | Every full session v3 document, one per line, `simulated` kept |
| `daily.csv` | Every daily v1 record flattened to dotted columns, including `streak_protection`, `pause_source`, `pause_until`, `streak_len`, `freezes_held`, `repair_active`, `reminder_h` and `simulated`; lists joined with `;` |
| `features.csv` | Per day: `simulated`, every composite feature as `<key>.value`, `<key>.z`, `<key>.ewma_z`, plus `composite`, `cusum`, `state`, `completeness` |
| `checkins.ndjson` | Every `afferent.checkin/1` document, oldest first, with `day_index` and `received_iso`: PHQ-9 items and totals, C-SSRS answers (`not_asked` where the skip logic skipped an item), `c6_repeat`, the safety tier, item 9, the screen shown, timestamps |
| `checkins.csv` | The same check-ins flattened to dotted columns (`phq9.items.phq9_1`, `cssrs.items.c1`, `safety.tier`, ...) |
| `checkin.v1.schema.json` | The check-in schema |
| `codebook.csv` | `file`, `column`, `description`, `unit` for every column, from the daily schema, the check-in schema and the feature table |
| `SessionSchema.md` | The session field reference |

The dashboard patient detail has an "Export data" button that downloads it.

### POST /api/patients/{id}/flags/clear

Clears `flags` after the clinician has seen them. Response `{"ok": true}`.

### GET /api/config/{patient_id}

The same body as the `config` WebSocket message (section 3.1), for clients that start before the socket is up.

## 3. WebSockets

Every message is one JSON object with a `type` field; other fields sit flat next to it. Unknown types are ignored, never an error. Clients reconnect with backoff (1 s, 2 s, 4 s, max 10 s). The game never waits on the socket; the session summary is buffered (localStorage key `afferent.outbox`) and resent on reconnect (the hub is idempotent on `session_id`).

### 3.1 /ws/app (phone game and patient view)

Phone to hub:

| type | fields | when |
|---|---|---|
| `hello` | `device_id`, `app_version`, `patient_id`, `profile`, `role` (`game` or `patient_view`) | on connect |
| `session_start` | `session_id`, `patient_id`, `clock`, `profile`, `simulated`, `sensors`, `t_iso` | Begin pressed |
| `live_metrics` | see below | 2 Hz during a session |
| `mode` | `session_id`, `mode`, `arousal`, `fatigue`, `t_ms` | director mode change |
| `game` | `session_id`, `id`, `slot`, `kind`, `mode`, `intensity`, `weight_used`, `t_ms` | task starts (v2 name kept) |
| `task_end` | `session_id`, `task` (one `tasks[]` entry of the schema) | task ends |
| `core_trial` | `session_id`, `trial` (1 to 5), `foreperiod_ms`, `rt_ms`, `outcome` | each reaction trial |
| `mood` | `session_id`, `which` (`start` or `end`), `value` (1 to 5 or null) | each check-in |
| `light` | `rgb`, `level` (0 to 100), `fade_ms`, `reason` (`mode`, `dawn`, `asleep`, `idle`) | game wants the bedside light changed |
| `session_end` | `session`: the full session v3 document | session over (any status, including declined) |
| `privacy` | `patient_id`, `sensor` or `sharing`, `on` | patient changes a switch |
| `pause` | `patient_id`, `until` (`YYYY-MM-DD` or null to end), optional `from` | patient sets or ends a streak pause in Settings or from the "Pause 7 days" notification action |
| `crisis` | `patient_id`, `source` (`talk_button`, `mood`), `session_id` (optional), `t_iso` | the support card was opened; the hub stores a `talk_request` flag whatever the source (a low lantern is a low-mood marker, never a safety flag) |
| `checkin` | `patient_id`, `checkin`: one `afferent.checkin/1` document (`contracts/checkin.v1.schema.json`) | a check-in attempt ended (completed, stopped, or recovered after the app was closed); resent from the outbox `afferent.checkin.outbox` until acked |

`checkin` handling: the hub validates the document, drops a repeat `checkin_id` (ack with `duplicate: true`), stores it in its own `checkins` table and raises one flag from `safety.tier`: `high` to `safety_high`, `moderate` to `safety_moderate`, `incomplete` to `safety_incomplete`, `low` to `safety_low`; `none` and `not_answered` raise nothing (`not_answered` shows in the export as "check-in stopped before the safety item"). Safety flags ignore `sharing = paused`: safety answers always reach the hub while the check-in is on. `phq9_9`, `cssrs` and `safety` never reach Gemma or the summary template (`summary_numbers`, `weekly_summary`); the hub strips them before the summary call. The old `weekly_checkin` message and the `low_mood_twice` and `weekly_checkin` flag types are gone; the hub ignores `weekly_checkin`.

The hub also accepts the v2 form of `session_end` (document spread at top level) by removing `type`.

`live_metrics` (2 Hz, every value nullable):

```json
{"type": "live_metrics", "session_id": "b7d0a0e6-...", "patient_id": "anna", "t_ms": 51200, "phase": "game",
 "mode": "calm", "task_id": "breath", "slot": 2,
 "pulse_bpm": 74.1, "pulse_quality": 0.9, "pulse_source": "simulated",
 "eye_openness": 0.58, "perclos": 0.21, "blink": false, "head_pitch_deg": -8.4, "face_tracked": true,
 "arousal": 0.62, "fatigue": 0.18, "ambient_light": 0.22,
 "physio": null, "camera_pulse": null,
 "profile": "live", "simulated": true}
```

`phase` is one of `fadein`, `rest`, `checkin`, `rt`, `walk`, `game`, `dawn`, `end`, `asleep`.

`pulse_bpm`, `pulse_quality` and `pulse_source` describe the pulse the game uses (`ky039`, `finger_ppg`, `rppg`, `simulated` or `null`). `physio` and `camera_pulse` carry the sensor readings themselves, whether or not the game uses them; both are `null` when the phone has no such reading (section 3.5 has every field and the rules):

```json
{"physio": {"source": "finger_ppg", "transport": "ble", "simulated": false,
            "pulse_bpm": 72, "quality": null, "quality_reported": false, "contact": true,
            "finger_bpm": [72, 74], "breathing_per_min": 12,
            "rmssd_ms": 41, "sdnn_ms": null, "rmssd_vs_baseline": null,
            "presence": null, "age_s": 0.6, "link": "connected"},
 "camera_pulse": {"source": "rppg", "bpm": 74.5, "trust_score": 82, "trust_label": "reliable", "age_s": 0.9}}
```

The numbers in this example show the shape only; they are not a measurement.

Hub to phone:

| type | fields | when |
|---|---|---|
| `config` | see below | after `hello`, after every `session_end` ack |
| `ack` | `session_id`, `ok`, `duplicate`, `day_index`, `error` | after `session_end` |
| `ack` | `checkin_id`, `ok`, `duplicate`, `error` | after `checkin` (`ok: false` with `error` on a schema error or unknown patient) |
| `pulse` | `bpm`, `quality` (0 to 1), `contact`, `source` (`ky039`, `finger_ppg`, `simulated`) | 1 Hz from the bedside unit (only when it really has a pulse or `AFFERENT_SIM_PULSE=1`). A `pulse` without one of these three sources is dropped by the phone, never relabelled |
| `physio` | the physio object (section 3.5) | 1 Hz from the bedside unit when the source provides it (`unoq_http`); not sent while the patient's `pulse_stone` switch is off |
| `knob` | `level` (0 to 100) or `press: true` | knob events |
| `profile` | `profile` (`good_day`, `bad_day`, `live`) | `POST /api/demo/profile` |
| `privacy` | `privacy` object as in `GET /api/patients/{id}` | after a change from any client |
| `pause` | `pause` (`{"source", "until"}` or null) | after a streak pause change |
| `demo_reset` | none | after `POST /api/demo/reset` |

`config`:

```json
{"type": "config", "patient_id": "anna", "display_name": "Anna", "simulated_patient": true, "now_day": 56,
 "baseline_pulse_bpm": 66.0,
 "rest_baseline": {"eye_openness": 0.64, "head_pitch_deg": -8.0, "blink_rate_per_min": 16.0},
 "task_weights": {"calm": {"breath": 0.95, "loyly": 0.05}, "flow": {"threads": 0.5, "stars": 0.5},
                  "wake": {"fireflies": 0.681, "beacon": 0.097, "bells": 0.222},
                  "fatigue": {"shutters": 0.536, "bells": 0.174, "beacon": 0.29}, "rest": {"breath": 1.0}},
 "measurement_slots": {"fork": 1, "lanterns": 3},
 "dawn_level": 15, "night_hours": [21, 6],
 "privacy": {"sharing": "summary", "sensors": {"phone_camera": true, "pulse_stone": true, "bedside_camera": false, "bedside_light": true, "presence": true, "phone_presence": true, "phone_motion": true}},
 "server_time_iso": "2026-11-15T07:41:00+02:00",
 "checkin": {"enabled": true, "cadence_days": 14, "always_ask_cssrs": false, "cssrs_licensed": false,
             "protocol_signed": false, "early_request": false, "reminder_local_time": "12:00", "language": "en"},
 "clinic_contact": {"name": "Your clinic", "number": "09 000 0000", "hours": "office hours"}}
```

`checkin` comes from the patient record's `checkin` object (set at discharge), each field falling back to the default shown. `cssrs_licensed` stays false until the written C-SSRS licence confirmation; `protocol_signed` switches the app's "next working day" wording; `early_request` is a clinician-requested early check-in (at least 7 days after the last one). `clinic_contact` comes from the patient record's `clinic_contact` (`name`, `number`, `hours`), with the placeholder above as the fallback.

The director picks the task for a slot with probability proportional to `task_weights[mode][id]` among the tasks allowed in that mode, excluding the previous task id when another one has weight > 0. Without config it uses uniform weights and `baseline_pulse_bpm = 68`.

### 3.2 /ws/clinic (dashboard)

Hub to dashboard:

| type | fields | when |
|---|---|---|
| `hello` | `now_day`, `patients` (same list as `GET /api/patients`) | on connect |
| `session_started` | `patient_id`, `session_id`, `profile`, `simulated`, `t_iso` | phone `session_start` |
| `live` | the phone's `live_metrics` fields (with `patient_id`), including `physio` and `camera_pulse` | relayed at 2 Hz |
| `mode`, `game`, `task_end`, `core_trial`, `mood` | relayed phone messages, plus `patient_id` | live panel |
| `session_added` | `patient_id`, `session_id`, `day_index`, `status`, `profile`, `simulated`, `pre_post`, `rt_median_ms`, `mood_start`, `mood_end` | stored |
| `analytics_updated` | `patient_id`, `row` (one `patients[]` row), `analytics` (full analytics object) | after recompute |
| `bedside_state` | the `GET /api/bedside/state` object (with `physio` and `patient_id`, the patient bound to the bedside unit) | on every change, max 4 Hz |
| `physio` | the physio object (section 3.5) | raw bedside event next to `bedside_state`, 1 Hz when the source provides it |
| `pulse` | `bpm`, `quality`, `contact`, `source` (`ky039`, `finger_ppg`, `simulated`) | raw bedside event next to `bedside_state`, 1 Hz while the bedside unit has a pulse |
| `pose` | `patient_id`, `keypoints`, `trunk_angle_deg`, `quality`, `simulated` | relayed from `/ws/bedside` (stick figure) |
| `crisis_flag` | `patient_id`, `flag_type`, `source`, `t_iso`, plus `checkin_id`, `screen`, `label` on safety flags | phone `crisis` or a check-in with a safety tier |
| `checkin_added` | `patient_id`, `checkin_id`, `status`, `phq9_total` | a new check-in was stored (the dashboard refetches the detail) |
| `privacy` | `patient_id`, `privacy` | change |
| `pause` | `patient_id`, `pause` (`{"source", "until"}` or null) | streak pause change |
| `demo_reset` | none | reset |

Dashboard to hub: `{"type": "ping"}` (hub answers `{"type": "pong"}`). Nothing else is required.

If no `pose` arrives, the dashboard draws the stick figure from the live `head_pitch_deg` (head tilt only, torso upright) and labels it `SIMULATED POSE` when `simulated` is true. Never video.

### 3.3 /ws/bedside (bedside unit, simulator, or the Jetson camera process)

JSON equivalents of the serial lines (section 4), for a bedside device on Wi-Fi.

Device to hub:

| type | fields |
|---|---|
| `hello` | `device` (`unoq`, `simulator`, `jetson_pose`), `fw` |
| `pulse` | `bpm` (number or null), `quality` (0 to 1), `contact` (bool), `source` (`ky039`, `finger_ppg` or `simulated`) |
| `physio` | the physio object (section 3.5); the hub stores the last one in `bedside_state.physio` and relays it to the phone and the dashboard |
| `knob` | `level` (0 to 100) or `press: true` |
| `presence` | `in_bed` (bool), `motion` (bool) |
| `thermo` | `temp_c`, `humidity_pct` |
| `pose` | `keypoints` (`{"head": [x, y], "neck": [...], "l_shoulder", "r_shoulder", "l_elbow", "r_elbow", "l_wrist", "r_wrist", "l_hip", "r_hip"}`, normalised 0 to 1, image y down), `trunk_angle_deg`, `quality`, `simulated` |

Hub to device: `light` (`rgb`, `level`, `fade_ms`, `reason`) and `camera` (`on`).

### 3.4 Light routing (hub)

- The phone's `light` messages go to the bedside unit unchanged, unless the patient switched `bedside_light` off.
- Knob turn: sets `dawn_level` (sent to the phone as `knob` and in the next `config`) and shows the level for 2 s on the LED in lantern amber, then returns to the previous light.
- Knob press: toggles the bedside camera (`camera_on`), the LED blinks once (two 150 ms pulses at 30%), broadcasts `bedside_state`.
- No session running: the day schedule in `design/tokens.json` (`bedside.day_schedule`) sets the idle light by local hour, only while `presence.in_bed` is true; otherwise off.
- After a session ends with `fell_asleep`, the light stays off until morning.

What the current hardware does with this (Decisions I13, I53; Alex A6, A12):

- "level 0 to 100" is the hub-side scale. The UNO Q knob is a relative count (`knob.position`, unbounded); the hub maps a change of the count to the level by a fixed step. Counts per turn are not measured (A12), so no turn-to-level ratio is claimed.
- The HTTP source (`unoq_http`) forwards knob turns only, never presses.
- The light is one KY-016, a small indicator LED on D9 to D11. It has no fade: `fade_ms` is ignored on this path, the hub scales the RGB value by `level` and sends at most a few `POST /led` calls per second (the call goes through the Arduino Bridge). It does not light a room and no text may say it does.

### 3.5 Sensor data (I53)

Decisions I53 (Alex and David, 2026-11-14) makes the physiological data of the UNO Q finger sensor first-class data in the app: fused finger pulse, pulse per finger, breathing rate, HRV (RMSSD, plus SDNN and the value against the sensor's recent median where the HTTP path gives them), the finger-detection state, and the phone camera pulse with its trust score. This section is the contract for it. Every number in the examples of this file and in `fixtures/session_finger_example.json` shows the shape only and is never a measurement.

#### Two paths, one object

| | Path | Needs | Gives |
|---|---|---|---|
| 1 (primary) | UNO Q Bluetooth LE to the phone: Capacitor plugin `AfferentFinger`, then `demo/js/finger.js`, then `A.Sensors` | No network. The UNO Q advertises as `Afferent Finger` | Fused pulse, pulse per finger, breathing rate, RMSSD; quality and finger detection only with AFF1 v2 |
| 2 (second) | UNO Q HTTP to the hub: `AFFERENT_BEDSIDE=unoq:<base url>`, source `unoq_http` (section 5.5) | The UNO Q HTTP API is published only on the Wendy Net mesh (port 18080). The hub host needs the wendy CLI, Alex's org login and `wendy net forward <local>:18080 --device <uno-q>`; a direct connection to the device port is refused | Everything of path 1 plus quality, SDNN, RMSSD against the sensor's recent median, breathing SNR, finger detection, knob turns, thermo, and the KY-016 through `POST /led` |

Both paths produce the same physio object, so the game, the recorder, the phone screens and the clinic view have one shape and one set of rules.

#### Bluetooth GATT (UNO Q, `uno-q/modulino-hub/ble.py`)

| Service | Characteristic | Props | Bytes | Meaning |
|---|---|---|---|---|
| `180D` Heart Rate | `2A37` Heart Rate Measurement | notify, read | `[flags, bpm]`, flags `0x00` (uint8 bpm) | The fused finger pulse (both sensors, one value). Notified only while a finger is detected; the characteristic keeps its last value, so a read alone says nothing about age |
| `AFF0` (custom, primary) | `AFF1` v1 | notify, read | 4 bytes `[f1, f2, breaths/min, RMSSD ms]` | Pulse of finger 1 and finger 2 in bpm, breathing rate, RMSSD rounded to whole ms. `0` = no reading |
| `AFF0` | `AFF1` v2 | notify, read | 6 bytes: v1 plus `quality_pct`, `presence_code` | `quality_pct` 0 to 100, `255` = not available. `presence_code`: `1` idle, `2` probing, `3` active, `0` unknown |

- A client reads the length: 4 bytes is v1, 6 or more is v2 (later bytes are ignored). A v1 client reading a v2 value uses the first 4 bytes and keeps working.
- With v1 there is no quality and no finger-detection state on this path: `quality` is `null`, `quality_reported` is `false`, `presence` is `null`.
- The firmware on the UNO Q today sends v1. v2 ships with the next deploy of `uno-q/modulino-hub`; until then the phone shows and records the finger data, and the game does not use that pulse (rule 2 below).

#### Capacitor plugin `AfferentFinger` (`ios/App/App`)

Methods `start`, `stop`, `status`. Events `state` (the Bluetooth link changed; the values of `link` below) and `reading` (one decoded notification of `2A37` or `AFF1`). `demo/js/finger.js` is the only caller; it turns the events into the physio object and feeds the fused pulse into the stone slot with `A.Sensors.feedPulse` (never `setPulse`), labelled `finger_ppg`. The plugin is in the iOS app only; in a browser there is no plugin, `link` is `unavailable` and `live_metrics.physio` stays `null` unless the hub sends `physio`. `unsupported` is the plugin's own state on a device without Bluetooth LE. The native app `ios/Afferent` holds the same Bluetooth connection while it is open, and a second central at the same time is untested (Alex A8), so one of the two apps runs at a time.

#### The physio object

The hub WebSocket message `physio` (to the phone, to the dashboard and from a device on `/ws/bedside`), the key `physio` in `GET /api/bedside/state` and `bedside_state`, and the key `physio` in the phone's `live_metrics` and the relayed `live`:

| Field | Type | Meaning |
|---|---|---|
| `source` | `finger_ppg` or `simulated` | What produced the values |
| `transport` | `ble` or `hub_http` | Path 1 or path 2 |
| `simulated` | bool | true exactly when `source` is `simulated`; the screen then shows the Simulated badge |
| `pulse_bpm` | number or null | Fused finger pulse, beats per minute |
| `quality` | number or null, 0 to 1 | Signal quality from the sensor (rhythm strength); null when not reported, never filled in by a receiver |
| `quality_reported` | bool | false when the sensor sent no quality (AFF1 v1) |
| `contact` | bool or null | A finger is on the sensor; null when unknown |
| `finger_bpm` | `[number or null, number or null]` | Finger 1 and finger 2, beats per minute |
| `breathing_per_min` | number or null | Breaths per minute, derived on the sensor from the heart-rate rhythm |
| `rmssd_ms` | number or null | HRV: RMSSD over the last 60 s, ms |
| `sdnn_ms` | number or null | HRV: SDNN over the same window, ms. HTTP only, null over Bluetooth |
| `rmssd_vs_baseline` | number or null | RMSSD relative to the sensor's running median of its last 10 minutes of readings (at least 2 minutes of them; kept on the sensor, not per person), as a fraction (`-0.3` is 30% below). HTTP only, null over Bluetooth |
| `presence` | `idle`, `probing`, `active` or null | Finger detection of the sensor: LEDs off, checking for a finger, measuring. Never bed presence |
| `age_s` | number or null | Age of the newest value in the object when it was sent, seconds |

Optional extras: the hub adds `finger_sources` (`[int]`, which fingers went into the fused value), `breathing_snr_db` and `rmssd_baseline_ms`; the phone adds `link` (`off`, `unauthorized`, `unsupported`, `scanning`, `connecting`, `connected`, `unavailable`). Receivers ignore keys they do not know.

#### The camera pulse object

The key `camera_pulse` in `live_metrics` and the relayed `live`; `null` when the phone camera gives no pulse:

```json
{"source": "rppg", "bpm": 74.5, "trust_score": 82, "trust_label": "reliable", "age_s": 0.9}
```

`bpm` number or null; `trust_score` integer 0 to 100 or null; `trust_label` `reliable`, `uncertain`, `unreliable` or null; `age_s` number or null. The slot, the recording, the phone row and the clinic row exist and are tested with a fake producer; the native producer (`AfferentPulse`) is not on this branch yet.

#### Rules (every consumer)

1. A value counts only if it is at most 3 s old. Older values are shown as "no current reading" and are not recorded as a reading. The clinic view allows 5 s, because its data crosses the relay first.
2. A finger pulse drives the game only with `quality_reported` true and `quality` at least 0.3 (Alex A7: below 0.3 the reading is unreliable even when bpm is not null). Without a reported quality it is shown and recorded, and never drives the game or a task's `helped` flag. Quality is never invented.
3. The pulse of one session is all real or all simulated, fixed at session start. No mixing and no silent switch (Decisions I5).
4. A pulse without a known source is dropped, never relabelled.
5. `presence` is the sensor's finger detection. The sensor LEDs stay off until a finger is detected, so "no reading" is the normal state when nobody wears the clip. It says nothing about a bed.
6. `POST /presence?auto=0` is not sent at session start: it switches the finger detection off and with it the contact signal.

#### In the session document

`signal.pulse_source` and `vitals.pulse_source` gain `finger_ppg` (`ky039` stays for stored rows). `vitals` gains five optional blocks, each `null` or absent when the sensor gave nothing (`session.v3.schema.json`, `SessionSchema.md`):

| Block | Holds |
|---|---|
| `vitals.finger` | `source`, `transport`, `quality_reported`, `seconds`, and statistics (mean, min, max, first, last, samples) of `pulse_bpm`, `quality`, `finger_1_bpm`, `finger_2_bpm`; `fingers_abs_diff_bpm`; `presence_s` (seconds idle, probing, active, or null) |
| `vitals.breathing` | `source`, `method` (`pulse_rhythm`), statistics of `rate_per_min` |
| `vitals.hrv` | `source`, `window_s` (60), statistics of `rmssd_ms`, and of `sdnn_ms` and `rmssd_vs_baseline` (both null over Bluetooth) |
| `vitals.camera_pulse` | `source` (`rppg`), statistics of `pulse_bpm` and `trust_score`, `trust_label_s` (seconds per label) |
| `vitals.series` | One point every 5 s: `t_s`, `pulse_bpm`, `breathing_per_min`, `rmssd_ms` (same length, at most 240 points) |

A block whose values are simulated says so: `source: "simulated"` in `finger`, `breathing` and `hrv`, and its dotted name (`vitals.finger`, ...) in `simulated_fields`. `fixtures/session_finger_example.json` has all five blocks, all simulated. `hub/tests/test_session_js_contract.py` validates a document built by the real JS recorder (`demo/tests/emit_session.js`) against the schema.

The compact session rows of `GET /api/patients/{id}` (`sessions[]`) gain `vitals`, `pulse_source` and `simulated_fields`, so the clinic view can show the last session's sensor summary.

#### The `pulse_stone` switch

It covers the whole finger sensor (pulse, breathing rate, HRV). Off: the phone stops Bluetooth and drops finger data; the hub drops `pulse` and `physio` from the bedside unit; on the HTTP path the finger sensors are powered down. Nothing of the finger sensor is shown, recorded or relayed while it is off. The camera pulse is governed by `phone_camera`, not by this switch.

#### Wording

- Phone, outside play only (the "Your signals" sheet from the start screen and Settings): calm, plain numbers with their unit. Nothing about the body during play (`design/vitals-ux.md`); an in-play overlay exists only behind a Developer switch, default off.
- Clinic view, section "Signals": every value with its source, unit and age. Source texts: "finger sensor (PPG), Bluetooth via the phone", "finger sensor (PPG), hub HTTP", "phone camera (rPPG)". Simulated values carry the Simulated badge and never the word live.
- HRV is "HRV (RMSSD)" in the clinic view and plain words for the patient (the privacy row of the pulse stone says "beat-to-beat variation"). It is a measured number. It is never called a stress level or strain and never used for a diagnosis or a treatment decision.
- Monitoring and follow-up support, never a diagnosis.

#### Unchanged

The composite and the CUSUM (section 5.1), `daily.v1`, `morning_pulse_bpm` (stays `null` for the live bound patient, Decisions X31 and I12) and the patient view (`GET /api/patients/{id}/patient-view`: still no pulse numbers) do not read any of this. Emotion and facial-expression labels are not part of I53 (Decisions X2 stays).

## 4. Bedside serial protocol (UNO Q <-> hub)

Not implemented by current hardware: the UNO Q never prints these lines (Alex A13). Kept for the simulator and the pty test. (Decisions I13.) The real UNO Q is reached over Bluetooth from the phone or over HTTP from the hub, section 3.5.

USB serial, 115200 baud, 8N1, ASCII lines ending in `\n` (accept `\r\n`). Fields separated by one space, decimal point `.`. Lines starting with `#` are logs and ignored. Unknown lines are ignored.

Device to hub:

| Line | Meaning | Rate |
|---|---|---|
| `V <fw>` | boot banner, e.g. `V afferent-unoq-0.1` | once |
| `K turn <0-100>` | knob position | on change, max 10 Hz |
| `K press` | knob pressed | on press |
| `P <bpm> <quality> <contact>` | pulse from KY-039: bpm float (0 when unknown), quality 0 to 1, contact 0 or 1 | 1 Hz while contact, one `P 0 0 0` on release |
| `I <in_bed> <motion>` | IR presence: in_bed 0/1, motion 0/1 (1 = a motion burst in the last 10 s) | on change and every 30 s |
| `T <temp_c> <humidity_pct>` | Modulino thermo | every 60 s |

Hub to device:

| Line | Meaning |
|---|---|
| `L <r> <g> <b> <level> <fade_ms>` | RGB LED: r g b 0 to 255 (the hex colour), level 0 to 100, linear fade in ms (0 to 60000). Example: `L 255 243 220 60 4000` |
| `C <0/1>` | bedside camera state indicator (LED ring or status pixel) |
| `S` | status request; device answers with one `K turn`, `I` and `T` line |

`afferent_hub.bedside.protocol.parse_line("P 72.5 0.9 1")` returns `{"type": "pulse", "bpm": 72.5, "quality": 0.9, "contact": true, "source": "ky039"}`; the dicts are exactly the `/ws/bedside` messages, so serial, simulator and Wi-Fi share one code path.

Daily aggregation (hub): presence, thermo, knob and light events are aggregated per day into the daily v1 record of the patient bound to the bedside unit (`anna` in the demo). For the seeded history the generator writes daily records directly.

## 5. Python module interfaces

Package `hub/afferent_hub/`. Python 3.14, numpy allowed, no other numeric libraries. All analytics functions are pure (no IO, no clock, no globals that change), deterministic for a given input, and must accept empty input without raising.

### 5.1 afferent_hub.analytics.engine

```python
def analyze_patient(sessions: list[dict], daily: list[dict], now_day: int) -> dict
```

- `sessions`: session v3 documents of one patient with `day_index` filled. `daily`: daily v1 records of the same patient. Any order.
- Returns exactly the shape of `fixtures/analytics_anna.json` (`"schema": "afferent.analytics/1"`). Top-level keys: `schema`, `patient_id`, `now_day`, `date`, `generated_iso` (the only non-deterministic field; may be `null` in tests), `simulated`, `params`, `state`, `state_label`, `suggestion`, `director`, `features`, `secondary_features`, `composite`, `cusum`, `bandit`, `pre_post`, `pre_post_summary`, `completeness`, `timeline`.
- Series arrays in `features[].series`, `secondary_features[].series` and `timeline` have length `now_day + 1` (index = day), `null` where not available.

Feature set (the composite), documented in `Statistics.md` by the analytics agent:

| key | label | source | per-day value | worse | weight | MAD floor | evidence |
|---|---|---|---|---|---|---|---|
| `rt_median` | Reaction time | session | `core.rt.median_ms` of the day's session, only if `core.rt.valid` | high | 1.5 | 20 ms | established |
| `mood` | Mood check-in | session | `core.mood_start` | low | 1.5 | 0.5 | established |
| `sleep_regularity` | Sleep regularity | daily | inter-daily stability (IS) over the trailing 7 days of `sleep.presence_hourly` (needs at least 4 days) | low | 1.0 | 0.05 | plausible |
| `missed_sessions` | Missed sessions (7 d) | daily | count of `missed` in the trailing 7 days | high | 1.0 | 0.75 | plausible |
| `effort_hard_prop` | Effort choice (7 sessions) | session | mean `fork.hard_prop` over the last 7 sessions that have one | low | 1.0 | 0.15 | plausible |
| `morning_pulse` | Morning resting pulse | daily, fallback session | `morning_pulse_bpm`, else `core.rest.pulse_bpm` if the session is before 11:00 and quality >= 0.5 | high | 0.75 | 2 bpm | plausible |
| `home_only_days` | Home-only days (7 d) | daily | count of `presence.home_only` in the trailing 7 days | high | 0.75 | 0.75 | plausible |
| `upright_frac` | Upright time in play | session | sum of `tasks[].upright_s` / sum of `tasks[].duration_ms`/1000 | low | 0.5 | 0.05 | exploratory |
| `reward_bias` | Reward bias log b (7 sessions) | session | pooled log b over the last 7 sessions with a valid `two_lanterns` block (sum the four cells, then the 0.5-corrected formula) | low | 0.5 | 0.1 | exploratory |

Secondary features (`secondary_features[]`, exploratory, never in the composite, the CUSUM, the state or the suggestion; module `afferent_hub.analytics.game_rt`, method in `Statistics.md` section 3b):

| key | label | unit | per-day value | worse | weight | MAD floor | evidence |
|---|---|---|---|---|---|---|---|
| `game_rt_norm` | In-game reaction time, normalised | z vs own usual per task kind | median over the day's cells (task id and stimulus kind from `tasks[].extra.rt.by_kind`, else `<task>:all`) of each cell's robust z against its own baseline, after moving the cell to its median baseline difficulty `extra.dda.d_mean` | high | 0 | 0.5 | exploratory |
| `game_rt_median` | In-game reaction time | ms | median of the task-level `tasks[].extra.rt.median_ms` over tasks with `n >= 3`, raw and unadjusted | high | 0 | 20 ms | exploratory |

- Built from the day's main session only. A cell value needs `n >= 3` and a positive `median_ms`; two runs of one task on a day are averaged weighted by `n`.
- Block shape: `key`, `label`, `unit`, `source` (`session`), `worse`, `weight` (always 0), `in_composite` (always false), `evidence`, `covariate` (`"extra.dda.d_mean"`), `baseline` (as in `features[]`: `median`, `mad`, `scale`, `n`, `first_day`, `last_day`, `ready`, `band_lo`, `band_hi`), `latest` (`day`, `value`, `ewma`, `stale`), `completeness_7d`, and `series` with `value`, `ewma` (EWMA of the value itself, not of a signed z) and `rolling_7d` (7-day rolling median, at least 3 values).
- Extra series: `game_rt_norm.series.n_cells` (cells behind the day's value); `game_rt_median.series.n_tasks`, `n_trials` and `dda_d_mean` (mean `d_mean` of those tasks). `game_rt_norm` also carries `cells[]`: `{"cell", "n_days", "baseline_n", "baseline_median_ms", "baseline_scale_ms", "difficulty_slope_ms"}` (`difficulty_slope_ms` is the Theil-Sen slope of median RT on `d_mean`, `null` without 5 baseline days spanning at least 0.1).
- Always present with both keys; without any `extra.rt` every value is `null`. Sessions without `extra` stay valid. The clinic detail draws `game_rt_norm` as a small trend labelled exploratory; the export adds both to `features.csv` and `codebook.csv`.

Algorithm (defaults in `params`, the analytics agent may tune them but must update `params`, `Statistics.md` and `Validation.md` together):

1. Baseline per feature: values on days 0 to 13; if fewer than 7 values, extend day by day until 7 values or `now_day`. `median`, `mad` (raw median absolute deviation), `scale = max(1.4826 * mad, floor)`, `n`, `ready = n >= 7`, `band_lo = median - scale`, `band_hi = median + scale` (the soft band on the chart).
2. `z = (x - median) / scale`; `signed_z = z` if worse is high else `-z` (positive always means "worse than usual").
3. EWMA of `signed_z` per feature, lambda 0.3, skipping missing days; the EWMA counts as available only within `stale_days = 3` of the last observation. `series.ewma_z` holds it.
4. Composite per day: `sum(w_i * clip(ewma_i, -3, 3)) / sum(w_i)` over available features. `contribution_i` is the term `w_i * clip(ewma_i) / sum(w_available)`, so the contributions add up to the composite. `completeness = sum(w_available) / sum(w_all)`. `confidence`: `high` if completeness >= 0.75 and at least 7 features have `baseline.ready`, `medium` if completeness >= 0.5, else `low`.
5. CUSUM: from day 14, `S_d = max(0, S_{d-1} + composite_d - k)` with `k = 0.5`; days without a composite keep `S`. State by threshold: `watch` at 1.5, `check_in` at 3.0, `booster` at 8.0, else `stable`; always `stable` before day 14. `history` lists state changes only. `state_label`: `Stable`, `Watch`, `Consider a check-in call`, `Consider discussing a booster session`.
6. `suggestion.text` is a fixed sentence per state (see the fixture), `reasons` = labels of the top 3 positive contributions. The clinician decides; no text ever says the system decided.
7. `director`: `{"baseline_pulse_bpm": median core.rest.pulse_bpm over the first 7 valid sessions, then the 14-day rolling median, default 68; "rest_baseline": {"eye_openness", "head_pitch_deg", "blink_rate_per_min"} medians over the last 14 sessions}`. The hub copies it into `config`.
8. `bandit`: as `task_weights` (5.2) plus `arms`, `by_mode`, `headline`, and `next_day` associations: for each task id and the stimulus `dawn_light` (daily `bedside_light.morning_light_min > 0`), mean next-day `core.mood_start` and mean next-day composite change on days with vs without it, with counts, `note: "association, not causation"`.
9. `pre_post`: the `pre_post` blocks of the last 7 played sessions, oldest first, with `session_id`, `day`, `date`, `profile`, `simulated`, `status`. `pre_post_summary`: medians and `settled_share` (share with pulse delta <= -2).
10. `completeness`: `overall`, `sessions_7d`, `days_7d`, `missed_7d`, `by_feature` (share of the last 7 days with a value).

### 5.2 afferent_hub.analytics.bandit

```python
def task_weights(sessions: list[dict]) -> dict[str, dict[str, float]]
def arms(sessions: list[dict]) -> list[dict]
```

- Arms are (mode, task id) for the adaptive tasks in modes with an intended direction: calm {breath, loyly}, wake {fireflies, beacon, bells}, fatigue {shutters, bells, beacon}, rest {breath}. Flow {threads, stars} has no direction and always gets uniform weights.
- Outcome per task instance: `helped` (true: moved >= 2 bpm in the intended direction, false: did not, null: skipped). Prior Beta(1, 1); `alpha = 1 + helped`, `beta = 1 + not helped`.
- `p_best` per arm within its mode: Monte Carlo with 4000 draws per arm, `numpy.random.default_rng(0)` (deterministic). `ci90` from the 5th and 95th percentile of the same draws. `mean = alpha / (alpha + beta)`.
- Weights (Thompson sampling expressed as selection probabilities): `w = max(p_best, 0.05)`, renormalised to sum 1 per mode. Returned for all five modes (keys `calm`, `flow`, `wake`, `fatigue`, `rest`).
- Arm dict: `{"mode", "task_id", "label", "alpha", "beta", "n", "helped", "mean", "ci90": [lo, hi], "p_best"}`.

Task labels: breath "Breath", loyly "Löyly", threads "Aurora threads", stars "Constellation", fireflies "Fireflies", beacon "Beacon", bells "Bells", shutters "Shutters", fork "Fork", lanterns "Two lanterns".

### 5.3 afferent_hub.synthetic

```python
def generate_patient(kind: Literal["relapse", "stable"], days: int = 56, seed: int = 0, *,
                     patient_id: str | None = None, display_name: str | None = None,
                     onset_day: int | None = None, start_date: datetime.date | None = None) -> dict
def demo_roster(seed: int = 7, today: datetime.date | None = None) -> list[dict]
```

- Returns `{"patient": {...}, "sessions": [...], "daily": [...], "truth": {...}}`. `patient` as in `GET /api/patients/{id}` (`simulated: true`). `sessions` are valid session v3 documents (`profile: "live"`, `simulated: true`, `simulated_fields: ["*"]`, `day_index` filled, ids `sim-<patient>-d<day>`); `daily` are valid daily v1 records for days 0 to `days - 1`, all `day_complete: true`, `simulated: true`. `truth`: `{"kind", "onset_day", "severity": [per day 0 to 1], "best_arm": {"calm": "breath", ...}, "arm_rates": {"calm/breath": 0.75, ...}}`.
- `start_date` default: today minus `days` (so the last generated day is yesterday and today is `now_day = days`).
- Realism: personal baselines drawn per patient, day-to-day noise, weekends (later sleep, more home-only days), about 10 to 15% missed days at baseline, missing sensor values (morning pulse about 25% missing), and for `relapse` a gradual severity ramp from `onset_day` (default 28, week 5) to full over 21 days that slows reaction time, lowers mood, effort, reward bias and upright time, raises morning pulse, lowers sleep regularity, increases home-only and missed days. Task `helped` outcomes are drawn from per-arm true rates (breath best in calm). Completed adaptive tasks carry `extra.dda` (`v`, `d_start`, `d_mean` = `intensity`, `d_max`; not for rest-mode breath) and, for tasks with discrete stimuli, `extra.rt` with one stimulus kind each (threads and stars `choice`, fireflies `catch`, beacon `beat`, bells `choice`, shutters `tap_target`): plausible medians per kind, a difficulty effect, anticipations, lapses, half the trials on `auto` completion, and the patient's day-level core RT trend at a damped exponent (0.6), so a relapse slows them mildly. Breath and loyly have no `extra.rt`; skipped tasks and declined days have no `extra`. These fields come from a separate random stream, so every other generated value is unchanged. Values stay in plausible physiological ranges.
- `demo_roster`: anna (relapse, onset 28), mikko (stable control), juha (relapse, onset 43, should end near `check_in`), leena, sofia, eero (stable). All `simulated: true`. Today is `now_day = 56` for all.

### 5.4 afferent_hub.summary

```python
def weekly_summary(analytics: dict, patient: dict) -> dict   # {"text": str, "source": "gemma" | "template", "model": str | None}
def summary_numbers(analytics: dict, patient: dict) -> dict  # the "numbers" object of the endpoint
```

- Gemma via the local Ollama HTTP API (`POST {AFFERENT_OLLAMA_URL}/api/generate`, `stream: false`, temperature 0.2, timeout 20 s). Model discovery via `GET /api/tags`. The prompt contains only `summary_numbers` as JSON and instructions to rephrase them in 3 to 5 plain sentences for a clinician, without advice, diagnosis, causes or crisis guidance.
- Guard: if the output is empty, longer than 900 characters, contains a forbidden phrase (the claims list above plus "should", "recommend", "suicid", "diagnos", "treat"), or contains a number that cannot be traced to `summary_numbers` (a number is traceable if it equals a value there rounded to 0, 1 or 2 decimals, or that value times 100 as a percent; integers 0 to 10 are always allowed), fall back to the template. `summary_numbers` includes `week_since_tms` (1-based week) so the text may name the week. The template produces the same interface with `source: "template"`, `model: null`.
- Cache per (patient id, hash of `summary_numbers`). Never called in the crisis path. Never patient-facing.

### 5.5 afferent_hub.bedside

```python
# protocol.py
def parse_line(line: str) -> dict | None
def format_line(msg: dict) -> str | None          # light -> "L r g b level fade_ms", camera -> "C 1"

# source.py
class BedsideSource(Protocol):
    async def start(self, on_event: Callable[[dict], Awaitable[None]]) -> None
    async def send(self, msg: dict) -> None        # msg is a hub-to-device JSON message
    async def stop(self) -> None
    connected: bool
    name: str                                      # "simulator" | "unoq" | "unoq_http" | "ws"

# simulator.py
class BedsideSimulator(BedsideSource):
    def __init__(self, seed: int = 0, speed: float = 1.0, pulse: bool = False): ...
    def set_session_active(self, active: bool) -> None

# unoq.py
class UnoQSerial(BedsideSource):
    def __init__(self, port: str, baud: int = 115200): ...

# unoq_http.py
class UnoQHttp(BedsideSource):                     # name = "unoq_http", AFFERENT_BEDSIDE=unoq:<base url>
    def set_session_active(self, active: bool) -> None    # optional hook
    async def set_enabled(self, on: bool) -> None         # optional hook: the patient's pulse_stone switch
```

- `UnoQHttp` polls `GET <base url>/state` at 1 Hz and emits the existing `pulse`, `knob` (turns only) and `thermo` events plus one `physio` event per poll (section 3.5). `send` turns a `light` message into `POST /led` (section 3.4). It mutes the heartbeat beep (`POST /heartbeat?on=0`). `set_enabled(False)` stops the events and powers the finger sensors down (Decisions I14); `set_enabled(True)` resumes. Both hooks are optional on a `BedsideSource`: the controller calls them only when the source has them.

- The simulator produces its events as protocol lines and runs them through `parse_line`, so the parser is exercised. Realistic streams: presence in bed in the evening and night with motion bursts, thermo every 60 s (19 to 22 C), occasional knob turns, pulse only when `pulse=True` (around 66 bpm, quality 0.85 to 0.95, contact during sessions and a 30 s morning reading). It echoes `light` commands into its state (the dashboard's bedside panel shows it).
- `UnoQSerial` reads lines in a thread (pyserial) and reconnects every 2 s when unplugged; `connected` reflects it.

### 5.6 afferent_hub.analytics.validation

```python
def run_validation(n_seeds: int = 50) -> dict
```

Shape: `fixtures/validation_example.json`. For each seed: one relapse patient (onset 28) and one stable patient via `generate_patient`, run `analyze_patient` day by day (`now_day` = 14 to 55). Report: days from onset to the first `watch`, `check_in`, `booster` (median and IQR), detected share, a mood-only comparison rule and the difference in days to flag against it, false `check_in` episodes and rate per patient-month on stable patients, and sessions until the bandit's `p_best` for the true best calm arm reaches 0.8 and stays there to day 55 (`sessions_to_p_best_0_8`; the first crossing is `sessions_to_first_p_best_0_8`, and `wrong_arm_crossed_first_share` counts patients where another arm crossed first). `relapse.mood_only_at_matched_false_alarms` compares mood alone at equal false alarms, at the composite's k and with a k sweep (`best_k`, `k_sweep`). The CUSUM only advances on days with a daily record or a played session. `example` holds the series for the dashboard chart. Always `simulated: true`, `untuned: true` and the disclaimer.

## 6. Data storage and seeding

### 6.1 SQLite (hub agent)

Tables: `patients(id primary key, json)`, `sessions(session_id primary key, patient_id, day_index, started_iso, json)`, `daily(patient_id, day_index, json, primary key(patient_id, day_index))`, `privacy(patient_id primary key, json)`, `flags(id integer primary key, patient_id, json)`, `checkins(checkin_id primary key, patient_id, started_iso, json)`, `analytics_cache(patient_id primary key, json)`. An older `checkins` table without `checkin_id` (weekly check-in era) is dropped on start. Store the documents as JSON text; no other schema is needed tonight.

### 6.2 Demo roster

Seeded from `demo_roster(seed=AFFERENT_SEED)`. The live phone always plays as `anna` unless `?patient=` says otherwise.

## 7. Fixed texts (never generated)

All safety text is fixed and human-written; no AI text anywhere in this flow (design/questions.md section 5).

Contacts, tap-to-call, in this order, each labelled with language and hours:

1. Emergency, 112
2. MIELI Crisis Helpline, in Finnish, 24 h, 09 2525 0111
3. Medical Helpline, 24 h, 116117
4. Your clinic, office hours, from `clinic_contact` in `config` (placeholder 09 000 0000 until filled)

Check-in screens:

- Thank-you screen: "Thank you." [Close]
- Support screen: title "If today is heavy, you do not have to carry it alone."; line "Your clinic will see your answers. If you need someone now, call 112 or a helpline below." ("will see your answers on the next working day" only once `protocol_signed` is true); the four contacts; footer "Afferent is not an emergency service and is not watched around the clock."; [Close].
- Crisis screen: the support screen with one fixed line above the title, "If you might act on these thoughts, call 112 now."; 112 first and visually primary. It never promises a call.
- Stopped before item 9: "Saved."

Support card (`patient_view.crisis`, the Talk icon): title "If today is heavy, you do not have to carry it alone."; text "If you need someone now, call 112 or a helpline below. Afferent is not an emergency service and is not watched around the clock."; the four contacts above (the clinic entry from the patient's `clinic_contact` when it is set).

Safety flags come only from the check-in's `safety.tier` (self-report). The Talk icon sends `crisis` and adds a `talk_request` flag. A lantern at 1 is a low-mood marker and an offer, never a safety flag. Pulse, eyes, tasks or missed days never raise a flag.

## 8. Front-end interfaces (demo/)

The game is plain scripts sharing the global `A` (see `demo/js/util.js`). New modules:

- `demo/js/hub.js` (game agent): `A.Hub.connect({patientId, url})`, `A.Hub.send(msg)`, `A.Hub.on(type, fn)`, `A.Hub.connected`, `A.Hub.config` (last `config`). URL resolution: `?hub=` query (http base, e.g. `http://192.168.8.10:8000`), then `?ws=` (v2, full ws URL), then localStorage `afferent.hub`, then the page origin when it is served over http(s) from the hub, else offline. WebSocket path `/ws/app`. Outbox for `session_end` in localStorage `afferent.outbox`.
- `demo/js/sensors.js` (game agent): `A.Sensors` with `start(source)` where source is `arkit`, `mediapipe` or `simulated`, and `read()` returning `{t, eye_openness, blink_l, blink_r, tracked, head_pitch_deg, ambient_light, quality}`. ARKit: the `AfferentEyes` plugin `eyes` event gains `pitch_deg` (from the face anchor transform, positive chin up) and `ambient` (ARKit `lightEstimate.ambientIntensity / 2000`, clamped to 1); until Romain ships that, these are `null`. The simulator honours the profiles.
- `demo/js/finger.js` (Decisions I53): the only caller of the `AfferentFinger` plugin. It builds the physio object of section 3.5 from the Bluetooth readings (or takes the hub's `physio` message), feeds the fused pulse into the stone slot with `A.Sensors.feedPulse` labelled `finger_ppg`, and hands the finger frame to the recorder, the "Your signals" sheet and `live_metrics.physio`.
- `demo/js/patient.js` (patient agent) reads `GET /api/patients/{id}/patient-view` through the same URL resolution, falls back to `contracts/fixtures/patient_view_anna.json` copied as `demo/js/patient_fallback.json` when offline, and labels simulated data.

Demo profiles (applied at Begin and on a `profile` message, visibly different within 10 s; real use is `live`):

| profile | simulated vitals | starting world state (fields of `A.makeVisual()`) |
|---|---|---|
| `good_day` | pulse offset +1 bpm, drowsy 0, mood preset none | `fog 0.25, stars 170, warm 0.12, aurora 0.35, exposure 1.05`, all `sat` groups 0.18 |
| `bad_day` | pulse offset +14 bpm for 25 s then decays, drowsy 0.55 | `fog 0.8, stars 35, warm 0.02, aurora 0.02, exposure 0.82`, all `sat` groups 0.03 |
| `live` | real sensors, simulator only where a sensor is missing (`simulated_fields` lists them) | v2 defaults |

Bus events other modules may rely on: `light`, `mode`, `game`, `segment`, `mood`, `endScreen`, `sessionEnd`, plus new `profile` (profile name) and `hubConfig` (config object).
