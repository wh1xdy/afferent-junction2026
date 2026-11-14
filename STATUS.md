# Status (overnight build, Sat 14 to Sun 15 Nov 2026)

Updated after every milestone. If you read this in the morning, the newest section at the bottom of "Milestones" tells you where the night stopped.

Requirements: `contracts/BRIEF.md`. Contracts: `contracts/api.md`, `contracts/session.v3.schema.json`, `contracts/daily.v1.schema.json`, `contracts/fixtures/`. Decisions: `Decisions.md` (section "v3 decisions"). Design: `DesignSystem.md`, `design/`.

## Ownership map (who edits what tonight)

Only edit files inside your own area. If you need something changed elsewhere, write it under "Requests" below. Nobody commits except the integrator. Files written by humans are never overwritten; extend them through adapters or new files and note it here.

| Agent | Owns |
|---|---|
| contract (docs) | root `*.md` (except `Validation.md`, `Statistics.md`), `contracts/`, `design/`, `package.json` scripts, `.gitignore` |
| hub | `hub/` except the paths owned below: `hub/afferent_hub/main.py`, `db.py`, `api/`, `ws/`, `bedside/`, `demo.py`, `hub/tests/` (except the test files owned below), `hub/requirements.txt`, `hub/pytest.ini`, `start.sh` |
| analytics | `hub/afferent_hub/analytics/`, `hub/afferent_hub/synthetic.py`, `hub/tests/test_analytics*.py`, `hub/tests/test_synthetic*.py`, `Validation.md`, `Statistics.md` |
| dashboard | `hub/afferent_hub/web/clinic/` |
| gemma | `hub/afferent_hub/summary/`, `hub/tests/test_summary*.py` |
| game | `demo/index.html`, `demo/js/engine.js`, `demo/js/minigames.js`, `demo/js/input.js`, `demo/js/main.js`, new `demo/js/hub.js`, new `demo/js/sensors.js` |
| atmosphere | `demo/js/world.js`, `demo/js/audio.js` (keep working, do not tune: sound is out of scope), `demo/js/art.js`, `demo/style.css`, `demo/assets/` |
| patient | `demo/patient.html`, `demo/js/patient.js`, `demo/css/patient.css` (and `demo/js/patient_fallback.json`) |

`demo/js/util.js` and `ios/` are not assigned tonight: ask under "Requests". `hub/tests/test_contracts.py` belongs to the hub agent from now on (written by the contract agent so the schema has tests from the start).

## Team owners in the morning

| Person | Owns |
|---|---|
| David | Game UI, patient view, pitch, video |
| Romain | Vision: pose, face (eye openness, PERCLOS, blink rate, head pitch), pulse from face (rPPG) |
| Alex | Bedside unit hardware: infrared presence, UNO Q, KY-039, thermo, enclosure |
| Vlad | Outer loop, data pipeline, baseline, trend, clinician view, knob, LED, Wi-Fi/BLE |

## What works

- Contracts, schemas, fixtures, design tokens and fonts (contract agent, 04:31 to about 05:15).
- `hub/.venv` on Python 3.14.7 with `hub/requirements.txt` installed (`pip check` clean).
- `cd hub && .venv/bin/python -m pytest -q`: 9 contract tests pass (schemas valid, fixtures valid, derived numbers consistent, list sorted by need, no em dashes in contracts).

- Hub (hub agent, about 05:15): `./start.sh` serves `/clinic/`, `/app/`, `/design/`, `/contracts/`, all REST endpoints and the three WebSockets of `contracts/api.md`, seeds the six SIMULATED patients from `afferent_hub.synthetic`, recomputes analytics with `afferent_hub.analytics.engine` after every session or daily record, sends `config` with bandit task weights at `hello`, `session_start` and after every ack, relays live data to the dashboard, routes the bedside light and runs the bedside simulator. `GET /api/validation` is computed once in a worker process and cached in `hub/data/validation_cache.json`. `cd hub && .venv/bin/python -m pytest -q tests/test_api.py`: 16 hub tests pass. A real game session played in headless Chrome against the running hub was stored as Anna day 56 and acked.

- Analytics (analytics agent): `afferent_hub.analytics.engine.analyze_patient` (baseline, robust z, EWMA, composite, CUSUM states stable/watch/check_in/booster, Thompson bandit, sleep metrics), `afferent_hub.synthetic` (demo roster and cohorts), validation on 50 relapse plus 50 stable SIMULATED patients (`Validation.md`, `docs/validation/*.svg`, `Statistics.md`).
- Weekly summary (gemma agent): `afferent_hub.summary.weekly_summary`, Gemma via Ollama when a model is installed, otherwise a guarded template. Only the template has run here (no Ollama on this Mac).
- Clinician dashboard (dashboard agent): `/clinic/` list "Who might need a call", patient detail (timeline, drivers, what helps, summary, sessions, everyday, live panel with stick figure, crisis banner), validation tab, live updates over `/ws/clinic`, fixture fallback (`?fixtures`).
- Game (game agent): v3 session end to end (fixed core, Fork slot 1, Two lanterns slot 3, bandit-weighted adaptive tasks, dawn, end lanterns), hub client with outbox, sensors interface (ARKit, MediaPipe, simulator), profiles, settings, crisis card. World renderer rewritten (atmosphere agent).
- Patient view (patient agent): `/app/patient.html` from `GET /api/patients/{id}/patient-view`, offline fallback `demo/data/patient_view_anna.json`, privacy switches over `/ws/app`, fixed crisis text.

Integration check (integrator, about 05:45 to 06:00):

- `./start.sh --reset` on a fresh `hub/.venv` (old one moved aside, new one created by start.sh): venv created, requirements installed, hub healthy on :8000 within seconds.
- `cd hub && .venv/bin/python -m pytest -q`: 135 passed.
- `NODE_PATH=<dir with node_modules/playwright-core> node hub/tests/e2e_live_demo.js` against `./start.sh`: 13 of 13 checks pass. It opens `/clinic/` and `/app/?input=auto`, plays one autoplay session (about 103 s), and checks: the game sent `session_end`, the hub acked it, `GET /api/patients/anna` shows it as the newest session (day 56), the dashboard received `session_started`, `live`, `session_added` and `analytics_updated` and updated Anna's row in place without a reload (index 2.19 to 1.69, still booster), the game sent the dawn light and the bedside state changed to it (`#000000/0` to `#FFC98A/15`, reason `dawn`), and neither page logged an error. Options: `HUB=`, `CLOCK=morning|night`, `TIMEOUT_S=`, `SHOTS=<dir>`.
- Patient view on the hub: `/app/patient.html?patient=anna` fetched `patient-view` (200), showed "You reached dawn." for the session just played, no "Saved copy" footer, no page errors.
- iOS: `npm run sync` (design copy plus `npx cap sync ios`) and `xcodebuild -project App.xcodeproj -scheme App -sdk iphonesimulator -configuration Debug CODE_SIGNING_ALLOWED=NO build`: BUILD SUCCEEDED. Not run on a phone.

## What is simulated

- All six demo patients (Anna, Juha, Mikko, Leena, Sofia, Eero) and their 8-week histories.
- Bedside unit (until Alex plugs in the UNO Q), step counts, phone presence and visitors.
- Pulse on the phone unless a KY-039 or rPPG source is live. Every such value carries `simulated: true` and is labelled SIMULATED on screen.
- Eye openness, PERCLOS and head pitch in the browser autoplay (`?input=auto`) and whenever no ARKit or MediaPipe face is tracked.
- The validation cohort (50 relapse, 50 stable patients) and every number in `Validation.md`. Parameters were tuned on the same generator; nothing is clinically validated.
- The weekly summary text is the template, not Gemma, until Ollama with a Gemma model runs on the Jetson.

## Known issues

- No authentication on the hub (local network only).
- The analytics fixture numbers come from a throwaway prototype, not from the real engine; the real engine replaces them (same shape).
- Contract text lags the code: `api.md` 5.1 and `Decisions.md` X15/X17 still say CUSUM k = 0.5 and the old MAD floors (code uses 0.35 and raised floors); `crisis_flag` uses `flag_type`; the patient fallback path is `demo/data/patient_view_anna.json`; the additive hub endpoints and messages are undocumented (see Requests).
- Each e2e or demo session adds a real day-56 session for Anna. Reset before the demo: `curl -X POST localhost:8000/api/demo/reset` or `./start.sh --reset`.
- Untested on hardware: the UNO Q (pseudo-terminal only), ARKit on a phone (head pitch sign unverified), Gemma on the Jetson, GPU cost of the world renderer on the demo iPhone.
- iOS has no haptics (no Capacitor Haptics plugin; WKWebView has no `navigator.vibrate`).
- good_day vs bad_day differ only mildly on screen (game agent request to atmosphere agent still open).
- The hub recomputes validation in a worker at first start (about 9 s, `GET /api/validation` returns 202 meanwhile) instead of serving `analytics/validation_results.json`.
- `demo/README.md` still describes v2. `measures.js`, `record.js`, `css/game-ui.css` are not in the ownership map yet.
- Before about 06:00 the game defaults to the night clock (rest mode, light capped at level 25); use `&clock=morning` for the morning story.

## Handover per person

### David (game UI, patient view, pitch, video)

Game (game agent): the session follows the v3 contract end to end (fixed core with rest, start lanterns and 5 reaction trials, Fork at slot 1, Two lanterns at slot 3, adaptive tasks with hub bandit weights, dawn, end lanterns), about 95 to 105 s. Demo URLs: autoplay story `/app/?input=auto`, touch `?input=touch`, camera `?input=camera`, profiles `&profile=good_day|bad_day` (chip "day:" on the start screen, or `POST /api/demo/profile` from the dashboard), `&clock=morning|night`, `&hub=http://<hub-ip>:8000` when the app is not served by the hub. Settings (sliders icon): per-sensor switches (sent to the hub as `privacy`), simulated sensors on/off, reduced motion. "Your week" icon opens `patient.html` with the same query.

To be filled by the atmosphere and patient agents.

### Romain (vision)

Ready (game agent):

- `demo/js/sensors.js`: `A.Sensors.read(now, dt)` returns `{t, eye_openness, blink_l, blink_r, tracked, head_pitch_deg, ambient_light, quality}` from the active source: `arkit` (iOS app), `mediapipe` (browser, `?input=camera`), or the labelled simulator. `A.Sensors.pulse(now)` returns `{bpm, quality, source}` with priority pulse stone (hub `pulse` message) > rPPG > simulator.
- rPPG plug-in: call `A.Sensors.setPulse(bpm, quality, 'rppg')` about once per second (stale after 3 s). The session JSON then reports `signal.pulse_source: "rppg"` and drops the pulse entries from `simulated_fields`.
- ARKit: `ios/App/App/AfferentEyes.swift` now sends `blink_l`, `blink_r`, `openness` (1 - mean blink, no eyeWide), `tracked`, `pitch_deg` and `ambient` (lightEstimate.ambientIntensity / 2000). `pitch_deg` is camera-space, portrait: `atan2(-forward.x, forward.z)` of the face anchor forward axis relative to the camera, positive = chin up. The sign and zero point are untested on a device: check on the phone (look up, value should rise) and flip the sign in `pitchDegrees` if needed.
- MediaPipe: pitch from `facialTransformationMatrixes` as `atan2(m[9], m[10])` (also untested with a real face, check the sign), ambient from the mean luma of a 16x12 copy of the frame, computed in memory and never stored.
- Test: `cd demo && python3 -m http.server 8080`, open `http://localhost:8080/?input=camera`, Begin; the debug panel line "eyes mediapipe open 0.xx pitch -x" shows live values. iOS: `npm run sync`, then run from Xcode on the iPhone, chip "input: touch + camera".

Stick figure: send `pose` messages to `/ws/bedside` (`contracts/api.md` section 3.3).

### Alex (bedside hardware)

Ready (hub agent): `hub/afferent_hub/bedside/` with `protocol.py` (`parse_line`, `format_line`), `simulator.py`, `unoq.py` (pyserial reader thread, reconnects every 2 s) and `controller.py` (light routing, knob, camera toggle, idle day schedule, state at `GET /api/bedside/state`). The serial path is tested over a pseudo-terminal (`test_unoq_serial_over_pty`).

- Real UNO Q: `./start.sh --serial /dev/tty.usbmodemXXXX` (same as `AFFERENT_BEDSIDE=serial:/dev/...`). Find the port with `ls /dev/tty.usbmodem*`. Firmware must speak `contracts/api.md` section 4: send `V <fw>`, `P <bpm> <q> <contact>`, `K turn <0-100>`, `K press`, `I <in_bed> <motion>`, `T <temp> <hum>`; read `L r g b level fade_ms`, `C 0/1`, `S` (the hub sends `S` right after connecting).
- Watch it: `curl localhost:8000/api/bedside/state`, `curl localhost:8000/api/health` (`bedside.connected`).
- Drive the LED without the game: `curl -X POST localhost:8000/api/bedside/light -H 'content-type: application/json' -d '{"rgb":"#FFC98A","level":15,"fade_ms":2000}'`.
- Device on Wi-Fi instead of USB: `./start.sh --ws` and connect to `ws://<hub>:8000/ws/bedside`, send the JSON forms (`{"type":"pulse",...}`).
- Without hardware: the simulator runs by default. Poke it: `curl -X POST localhost:8000/api/bedside/simulate -H 'content-type: application/json' -d '{"finger":true}'` (also `{"knob":40}`, `{"press":true}`, `{"in_bed":true}`, `{"motion":true}`). `--sim-pulse` makes it stream pulse during sessions too. `--no-sim` turns it off.
- Tests: `cd hub && .venv/bin/python -m pytest -q tests/test_api.py -k "protocol or simulator or unoq"`.

### Vlad (outer loop, dashboard, knob, LED, Wi-Fi/BLE)

Hub (hub agent): `./start.sh` (options `--reset`, `--no-sim`, `--serial PORT`, `--ws`, `--sim-pulse`, `--port`). Code: `hub/afferent_hub/main.py` (app, static mounts, errors), `service.py` (ingest, recompute, broadcast, WebSocket handlers), `views.py` (patient rows, config, patient view), `db.py` (SQLite, `hub/data/afferent.db`), `api/routes.py`, `ws/`, `bedside/`. Reset the demo: `curl -X POST localhost:8000/api/demo/reset`. Post a session by hand: `curl -X POST localhost:8000/api/sessions -H 'content-type: application/json' -d @contracts/fixtures/session_example.json` (change `session_id` to post it twice). Tests: `cd hub && .venv/bin/python -m pytest -q`.

To be filled further by the analytics and dashboard agents.

## Requests (cross-area changes)

- Hub agent to contract and dashboard agents: `crisis_flag` on `/ws/clinic` carries the flag kind as `flag_type` (`talk_request` or `low_mood_twice`), because `type` is already the message type. Please note it in `contracts/api.md` section 3.2.
- Hub agent to contract agent, additive hub endpoints and messages to document: `POST /api/bedside/simulate` (simulator pokes: `finger`, `knob`, `press`, `in_bed`, `motion`), `POST /api/bedside/camera` (`{"on": true}`), `/ws/clinic` messages `pulse`, `knob`, `presence`, `thermo` (raw bedside events next to `bedside_state`), `daily_added` and `session_interrupted` (the phone socket closed during a session). `pose` from `/ws/bedside` reaches the dashboard only while `camera_on` is true (knob press, privacy switch `bedside_camera`, or `POST /api/bedside/camera`). App lights are capped at the quiet night level 25 between 21:00 and 06:00.

- Patient agent to contract agent: the patient view offline fallback lives at `demo/data/patient_view_anna.json` (copy of the fixture), not `demo/js/patient_fallback.json`; please update `contracts/api.md` section 8 and the ownership row.
- Analytics agent to contract agent: please update `contracts/api.md` section 5.1 and `Decisions.md` (X15, X17): CUSUM `k` is now 0.35 (was 0.5) and the MAD floors are mood 1.0, missed sessions 1.0, home-only days 1.0, effort 0.2, reward bias 0.15 (others unchanged). Reasons and the sensitivity table are in `Statistics.md` and `Validation.md`. Additive output fields (all fixture keys unchanged): `features[].series.rolling_7d`, `bandit.immediate`, and `timeline.composite_7d`, `sleep_regularity`, `time_in_bed_h`, `sleep_midpoint_h`, `sleep_midpoint_sd_7d`, `restlessness`, `sleep_iv_7d`, `effort_reward_slope`. `run_validation()` output adds `params`, `sensitivity`, `relapse.mood_only_at_matched_false_alarms`, `relapse.per_seed_*`, `bandit.by_mode`, and `curves` when called with `include_curves=True`. The demo roster seeds are picked (in `synthetic.ROSTER`) so Anna ends at booster, Juha at check-in and the four controls stable for any `today`, with `AFFERENT_SEED=7`.
- Analytics agent to hub agent: a precomputed `hub/afferent_hub/analytics/validation_results.json` (50 seeds, with `curves`) is written by `python -m afferent_hub.analytics.validate`; `GET /api/validation` can serve it directly instead of recomputing at startup (recomputing takes about 9 s).
- Patient agent to game agent: the "your week" icon on the start screen should link to `patient.html` (pass `location.search` through so `?hub=` and `?patient=` survive). The patient view links back to `index.html` the same way.
- Atmosphere agent to game agent (bug, visible): dawn is skipped. `endGame()` calls `startDawn()` inside the same `update()`, then the `if (this.phase === 'dawn')` block runs with the stale `t` computed at the top of `update()` (engine.js, `const t = now - this.phaseAt`), so `t >= 4` and the session jumps to `end` in one frame (events log shows `phase dawn` and `phase end` at the same time). Fix: use `now - this.phaseAt` inside the dawn block, or `return` after `startDawn()`. The world now eases the sun and dawn colour itself, so it no longer pops, but the 4 s sunrise and the bedside fade only play once this is fixed.
- Atmosphere agent to game agent (bug, blocks the idle screen): `main.js` `panel()` calls `A.Sim.offset.toFixed` and `A.Sim.drowsy.toFixed` before the first session, when they are still undefined; the exception stops the `requestAnimationFrame` loop on the start screen (desktop layout). Use `(A.Sim.offset ?? 0)` or call `A.Sim.reset('live')` at boot.
- Atmosphere agent to game agent (optional polish): `A.World.panel(ctx, box, { done, measure })` draws the task panel frame in the world style (soft shadow, night gradient, top light, amber or violet edge, glow when done). In `drawOverlay` it can replace the `fillStyle`/`roundRect`/`fill`/`stroke` lines; keep your own clip and `g.draw`.
- Atmosphere agent, for everyone: `world.js` reads `A.config.reducedMotion` (and the OS `prefers-reduced-motion`) every frame: half parallax, 40 instead of 120 snowflakes, slower sway, no flash or grain, fades instead of the expanding colour-return ring. Haptics: `navigator.vibrate([12, 110, 18])` (or Capacitor Haptics if the plugin is installed) when a colour group returns and at dawn.

- Game agent to atmosphere agent: the profile presets now reach the renderer only through `V` (`fog`, `stars`, `warm`, `aurora`, `exposure`, `sat.*`, plus `lanternRadius` and `lanternBright`, scaled by a new `V.lanternGain` of 1.3 on good_day and 0.7 on bad_day). In screenshots bad_day vs good_day still differ only mildly (fog 0.8 and exposure 0.82 read weakly). If you can, make high `fog` and low `exposure` clearly heavier (denser low fog bands over the mid hills, dimmer sky) so the switch reads in a video within 10 s. `A.config.reducedMotion` is set from the settings toggle (and defaults to `prefers-reduced-motion`).
- Game agent to contract agent: `demo/js/measures.js` (Fork, Two lanterns, start check-in panel) and `demo/js/record.js` (session v3 document builder and statistics) are new game-agent files; please add them to the ownership row. `design/` is linked from `demo/index.html` as `design/tokens.css`, so `npm run design` must run before `npx cap sync ios`.

## Milestones

1. Contracts written (contract agent).
2. Builders done (hub, analytics, dashboard, game, atmosphere, patient, gemma), about 05:40.
3. Integration (integrator, about 06:00): fresh-venv start, 135 Python tests, live end-to-end test `hub/tests/e2e_live_demo.js` (13 of 13), patient view on the hub, iOS sync and simulator build all pass. Cross-boundary edits by the integrator: `.gitignore` (logs, `.env.*`, database files), `hub/tests/test_contracts.py` (literal em dash in an assert replaced by `\u2014`), removed `hub/afferent_hub/web/clinic/.gitkeep`, new `hub/tests/e2e_live_demo.js`.
