# Bug burn-down: devices (uno-q, voice-relay, jetson, posture-analysis)

Branch `burndown/devices` (from `fix/bug-burndown` @ 4daecf6). Python 3 venv on Windows 11.
Windows shim for the Linux-only suites (not in the repo): a `sitecustomize.py` on `PYTHONPATH` that sets
`TemporaryDirectory(ignore_cleanup_errors=True)` and a no-op `os.fchmod`, so `jetson/data_manager` and
`jetson/hub` could be run here at all.

| # | Bug | Area | Severity | Status |
|---|-----|------|----------|--------|
| D1 | `SIM=1` presence mirrors simulated home periods / outings / visits into the real data manager as `afferent-presence` | jetson/presence | Critical | Fixed |
| D2 | Offline video (`afferent.cli process-video`, or `CAMERA=<file>`) pushes replayed posture minutes to the data manager as measurements of now | posture-analysis | Critical | Fixed |
| D3 | STM32 `millis()` going back (49.7-day wrap, MCU reset) leaves presence stuck in `probing` forever and mixes two clocks in the PPG / beat buffers | uno-q | Medium | Fixed |
| D4 | data_manager_client: a 200 answer that is not a JSON object drops the batch (non-JSON) or kills the sender thread (JSON list / string) | jetson/data_manager client (+4 copies) | Medium | Fixed |
| D5 | presence: a restart after leaving home can lose the home interval's close; the data manager then counts `home-<start>` as home until now, every day | jetson/presence | Medium | Fixed |

## D1. SIM mode stores simulated presence as the patient's — Critical — Fixed
- **Reproduce:** `tests/test_improvements.py::Profiles::test_sim_mode_sends_nothing_to_the_data_manager`
  (imports `app` with `SIM=1`): `app.dm.enabled` is True, intervals are queued for `http://127.0.0.1:8100`.
- **Root cause:** `app.py` built the client from `DATA_MANAGER_URL` (default the local data manager) regardless of `SIM`.
  The README tells users to run `SIM=1 wendy run` on the Jetson when no phone is reachable, i.e. next to the real data manager.
- **Fix:** `url="off" if SIM else DATA_MANAGER_URL`; README env table says so.
- **Verification:** `cd jetson/presence && python -m pytest -q` → 42 passed (test failed before the fix).

## D2. Replayed video minutes pushed as live posture — Critical — Fixed
- **Reproduce:** `tests/test_datasink.py::test_a_video_file_is_never_pushed`, `::test_offline_cli_never_pushes`.
  `cli.process_video` uses `Config.from_env()`; on the device `wendy.json` sets `DATA_MANAGER_URL`, so `FrameProcessor`
  gets a `DataSink`. Frames are stamped `start + idx/fps` (processing time), so the clip's minutes (whoever is in it)
  were stored as `posture/<site>/standing-*` measurements of now (up to 5 min ahead accepted by the data manager).
- **Root cause:** `DataSink.from_config` only looked at the URL, not at whether the frame source is live.
- **Fix:** `DataSink.from_config` returns None for a file source (`capture._is_file_source(cfg.camera)`); the CLI sets
  `cfg.camera = path`.
- **Verification:** `cd posture-analysis/posture && python -m pytest -q` → 101 passed (both tests failed before).

## D3. STM32 clock going back stalls finger detection — Medium — Fixed
- **Reproduce:** `tests/test_ble_payload.py::AppWiring::test_stm32_clock_going_back_does_not_stall_finger_detection`
  and `::test_beats_from_before_a_clock_reset_are_dropped`. Before the fix: presence stays `probing` with a finger on
  (`'probing' != 'active'`), PPG buffer holds both clocks, beats of the old clock are kept.
- **Root cause:** sample/beat times are the STM32's `millis()` (uint32, wraps every 49.7 days, restarts on an MCU reset).
  `presence_loop` waited for `_last_t() >= t_on + 3.55 s` with `t_on` from the old clock (never reached), and every window
  `t >= newest - window` took all old-clock samples. A wrap while idle hits a probe window roughly half the time.
- **Fix:** `clock_went_back()`; `on_ppg` clears the PPG buffers and `on_beat` that finger's beats when time goes back;
  `presence_loop` restarts a probe on the new clock when `_last_t() < t_on`.
- **Verification:** `cd uno-q/modulino-hub && python -m pytest -q` → 154 passed (baseline 152 + 2 new). The presence test
  was re-run with only the presence part disabled and fails, so both parts are needed.

## D4. Client drops / stops on an answer that is not the data manager's — Medium — Fixed
- **Reproduce:** `jetson/data_manager/tests/test_review_fixes.py::ClientRobustness::test_an_answer_that_is_not_the_data_manager_keeps_the_queue_and_the_sender`
  (local server answering 200 with `<html>`, `[]`, `"ok"`). Before: HTML → batch dropped as "unsendable" (`dropped` += n);
  `[]` → `AttributeError` out of `_send_queue`, which in `_loop` ends the sender thread for good (all later values lost).
- **Root cause:** response decoding happened inside the `except (TypeError, ValueError)` meant for request serialisation,
  and a non-dict JSON answer was used as a dict.
- **Fix:** `_post` raises `OSError` when the answer is not a JSON object, so the batch is re-queued (resends are idempotent
  upserts) and the failure counts toward mDNS failover. Copied byte-identically to `uno-q/modulino-hub`, `jetson/presence`,
  `jetson/vision`, `posture-analysis/posture/afferent` (all blob 4e38c4e); `data_manager_push.py` docstring updated.
- **Vendored copy:** `hub/afferent_hub/team/data_manager/client/data_manager_client.py` (older version, not edited) re-queues
  non-JSON but still dies on a non-dict JSON answer (`res.get` at its line 266). Needs a manifest re-pin by the hub owner.
- **Verification:** `cd jetson/data_manager && python -m pytest -q` (with the Windows shim) → 48 passed, 1 failed:
  `test_client_queues_while_down_then_delivers`, the known Windows-only slow-RST failure (also fails on the baseline).

## D5. Home interval left open after a restart — Medium — Fixed
- **Reproduce:** `tests/test_datasync.py::Sync::test_restart_after_leaving_closes_the_home_interval_again`.
- **Root cause:** the close of `home-<start>` lives only in the client's memory queue until delivered; after a restart in
  AWAY/UNKNOWN, `PresenceSync.restore` only resumed a HOME period, so the close was never sent again and the data manager
  counts the open interval (ongoing = until now) as time at home on every later day.
- **Fix:** `PresenceSync.to_dict()` (start of the last home period) is saved with the trackers; `restore(presence, saved)`
  re-sends the close at `presence.since` (the moment HOME ended) when not home. Upsert on the same id: harmless when it was delivered.
- **Verification:** `cd jetson/presence && python -m pytest -q` → 42 passed.

## Reviewed, no Critical/High/Medium found
- uno-q: PulseGuard, fuse/guard_pulse, clip trust, two-hearts, rsa_breathing, HRV, data_manager_push (quality gate, two-people
  hold, climate mean), ble.py payload, sketch beat detector.
- voice-relay: auth (`hmac.compare_digest`, refused without RELAY_CODE), audio-only upstream, context sanitising.
- jetson/data_manager: store ingest/rollup/daily/events_daily, stats, timeutil, auth in dispatch.
- jetson/hub: auth/cookie, store_state gating, store aggregations, demo marked simulated in reports and FHIR.
- jetson/presence core trackers. posture-analysis datasink/aggregator.
- Not reviewed: jetson/vision (rppg, app), jetson/home_hub scripts, posture training scripts.

## Low / unproven (not fixed)
- voice-relay: a lone-surrogate auth string (`.encode()` → UnicodeEncodeError) or a binary first frame ends that one
  connection with a server error instead of 4400/4401. No bypass. No rate limit on access-code attempts (by design?).
- uno-q `bridge_loop` returns after the first connect; whether `arduino.router_bridge` reconnects by itself is not verifiable here.
- uno-q `/ppg?ch=x`, `/sensor?ch=x` with a non-number: exception, no HTTP answer.
- data_manager: a sample that arrives for a day already partly pruned (~180 days old) re-rolls that day from the remaining raw rows.
- data_manager_client `_requeue` on a full queue drops the newest items, not the oldest as documented.
- presence `hub_poll_activity`: a modulino-hub restart (knob None) counts as one in-home activity.

## Suites
| Suite | Result |
|---|---|
| uno-q/modulino-hub | 154 passed |
| jetson/presence | 42 passed |
| posture-analysis/posture | 101 passed (opencv-python-headless, numpy, fastapi; no models needed) |
| posture-analysis/training | 14 passed |
| voice-relay | 7 passed |
| jetson/data_manager (Windows shim) | 48 passed, 1 failed (Windows-only, baseline) |
| jetson/hub (Windows shim) | 116 passed, 5 failed (file mode 0o600 checks, Windows-only, baseline) |
