# Hub bug burn-down (branch `burndown/hub`)

Regression tests: `hub/tests/test_bugburn_hub.py`.

| ID | Bug | Severity | Status |
|---|---|---|---|
| BH-1 | Data-manager (bound home) facts sent in another patient's `voice_context` | Critical | Fixed |
| BH-2 | App socket with no patient yet gets every patient's targeted messages | High | Fixed |
| BH-3 | QR talk request stamped in UTC lands on the wrong day/minute | Medium | Fixed |

## BH-1: sensor facts leak to non-bound patients (Critical)
- **Bug:** `Hub.voice_context` (`hub/afferent_hub/service.py`) added `wellbeing.sensor_facts(self.sensors.get)` for any patient whose level was `bad`. The data manager only holds the bound patient's home (docs/decline_alert.md; `decline()`, the FHIR vitals route and `_bound()` all check `pid == bound_patient`). So a second patient's companion was told "stayed home nearly all day…" from the first patient's sensors.
- **Root cause:** the bound-patient check was missing from the sensor-facts branch.
- **Fix:** only read sensor facts when `pid == self.settings.bound_patient`.
- **Verification:** `test_sensor_facts_only_for_the_bound_patient` failed before the fix (facts list held "stayed home…", "no visitors…") and passes after it.

## BH-2: unidentified app sockets get other patients' messages (High)
- **Bug:** `Rooms.broadcast(room, msg, patient_id=X)` (`hub/afferent_hub/ws/manager.py`) sent to clients whose `patient_id` was X **or None**. `/ws/app` without `?patient=` stays None until `hello`, and a socket that never sends `hello` stays None for good. Such a socket received every patient's `voice_context` (facts, decline), `privacy` and `pause`.
- **Root cause:** None was treated as "any patient". `Hub.handle_app` treats None as the bound patient.
- **Fix:** `Rooms.default_patient` is set by `Hub` to `bound_patient`, and the filter is `(c.patient_id or default_patient) == patient_id`. Bound-patient bedside messages still reach a socket that has not said hello yet. Broadcasts with no patient (demo_reset) still go to everyone.
- **Verification:** `test_broadcast_does_not_reach_unidentified_app_for_another_patient` and `test_unidentified_app_socket_gets_no_privacy_of_another_patient` failed before the fix (2 recipients, and `privacy` arrived where `pong` was expected) and pass after it.

## BH-3: QR talk-request day/minute from UTC stamps (Medium)
- **Bug:** `qr._talk` took the day from `t_iso[:10]`, and `qr._minute` took the wall-clock fields as written. `demo/js/patient.js` sends crisis `t_iso` as `new Date().toISOString()` (UTC `Z`). A talk request at 01:30 local (+02:00) was shown to the clinician on the previous day at 23:30.
- **Root cause:** UTC stamps were read as if they were local wall-clock time.
- **Fix:** new `qr._local()`. A stamp whose offset is 0 is converted to the hub's local clock (the clock `day_index` counts by). Local stamps with their offset (the app's `isoLocal`) are kept as written, so offset changes across DST in old check-ins do not shift the time.
- **Verification:** `test_qr_talk_request_uses_local_day_and_minute` failed before the fix (`{'day': 9, 'minute': 1410}`) and passes after it. `tests/test_qr.py` passes.

## Full verification
- `<venv>/python -m pytest -q` (from hub/): **480 passed, 2 failed**. Both failures are baseline and Windows-only: `test_api.py::test_unoq_serial_over_pty` (no `termios` on Windows) and `test_team_modules.py::test_their_tests_pass_on_copied_code[data_manager]` (vendored).
- `node hub/tests/clinic_imported_state.test.js`, `clinic_scan.test.js`, `clinic_signals.test.js`: all pass.
- Note: this worktree's checkout had CRLF files left over from before the `.gitattributes` LF fix, which made `test_vendored_files_match_manifest` fail. A fresh re-checkout to LF fixed it. No content changed.

## Reviewed, no bug proven
- `decline.py` maths and windows, compared with docs/decline_alert.md; `_run_decline` exception handling.
- `db.py` SQL: parameterised, per-patient filters.
- `home_guard.py`: token, prefix and origin handling.
- `room.py` night windows; `export.py`.
- Clinic HTML (`imported.js`, `scan.js`, `views.js`): patient strings go through `esc()`, and the numeric fields come from the type-checked QR unpack.
- bedside controller and source loops (exceptions are caught).
- `summary` cache keys per patient.

## Suspicions not proven or not fixed (budget)
- `ingest_session` gives a session with a null `day_index` the hub's current `now_day`, even when the phone's outbox replays it days later (`demo/js/hub.js`). The session lands on the wrong day. The contract states this behaviour and the tests rely on it, so it is left as a design question.
- `handle_app` honours `msg.patient_id` over the socket's own patient (privacy, crisis, voice_context for another patient). There is no per-patient auth, so `hello` can rebind anyway.
- `set_pause` reads the patient outside the per-patient lock (a lost-update race between two concurrent pauses).
- `refresh_room` uses today's fixed UTC offset for 8 weeks of nights, so nights before a DST change are shifted by one hour.
- `decline.analyze` sets status from the score rounded to 3 decimals (0.7996 counts as ok).
