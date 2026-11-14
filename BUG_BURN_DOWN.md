# Bug burn-down

Branch: `fix/bug-burndown` (from `main` @ 1a1c537). Per-area audits run in parallel on their own branches
(`burndown/<area>`) and merged here; each area's working log is in `docs/bugburn/<area>.md`.

Severity: **Critical** = crash/data loss/safety on the main path · **High** = a core feature wrong or broken ·
**Medium** = wrong behaviour in a real but narrower case, or a test suite that cannot run · **Low** = cosmetic,
platform-only for a non-target platform, or out of scope (vendored code).

## Summary

| # | Bug | Area | Severity | Status |
|---|-----|------|----------|--------|
| 1 | Working tree checks out CRLF on Windows; 20 node tests fail | repo | Medium | Fixed |
| 2 | `test_room.py` cannot be collected without a system tz database | hub | Medium | Fixed |
| 3 | `no_network` guard blocks asyncio's loopback self-pipe on Windows (27 tests) | hub tests | Medium | Fixed |
| 4 | Vendored-manifest test compares `\`-paths with `/`-paths on Windows | hub tests | Low | Fixed |
| 5 | Vendored data_manager tests fail on Windows (SQLite not closed, slow RST) | hub/team, jetson/data_manager | Low | Won't fix (vendored, Linux target) |
| 6 | `jetson/hub` auth uses POSIX-only `os.fchmod` | jetson/hub | Low | Won't fix (Linux-only service) |

## Details

### 1. CRLF working tree breaks source-reading tests — Medium — Fixed
- **Reproduce:** on Windows (`core.autocrlf=true`), `node demo/tests/swipe.test.js` → 19 failed; `sensors.test.js` → 1 failed.
  The same files exported with `core.autocrlf=false` pass 21/21 and 31/31.
- **Root cause:** no `.gitattributes`, so source files check out as CRLF on Windows; the tests cut `show()` out of
  `main.js` and check `begin()` with regexes containing `\n`, which never match `\r\n`.
- **Fix:** `.gitattributes`: `* text=auto eol=lf` (`*.bat`/`*.cmd` stay CRLF), working tree re-checked-out.
- **Verification:** every `demo/tests/*.test.js` and `hub/tests/*.test.js` passes (0 failed).

### 2. tz database missing → hub test collection error — Medium — Fixed
- **Reproduce:** `pytest` in `hub/` on Windows → `ZoneInfoNotFoundError: Europe/Helsinki` collecting `tests/test_room.py`; whole run interrupted.
- **Root cause:** `zoneinfo` needs the system tz database or the `tzdata` package; neither Windows nor
  `python:3.12-slim` (trixie) ships one. The app code falls back (synthetic data to a fixed UTC+2 with no DST), the test does not.
- **Fix:** `tzdata` added to `hub/requirements.txt` (pure Python; also gives the synthetic data real DST in the slim image).
- **Verification:** `tests/test_room.py` collects and passes.

### 3. Network guard breaks the event loop on Windows — Medium — Fixed
- **Reproduce:** `pytest tests/test_unoq_http.py tests/test_unoq_auto.py` → 25 failed, 2 errors, `ProactorEventLoop has no attribute _ssock`.
- **Root cause:** the autouse `no_network` fixture replaced every `socket.connect`; on Windows `socket.socketpair()`
  (asyncio's self-pipe) is emulated with a loopback connect, so no event loop could be created.
- **Fix:** the guard lets through only the connect made inside `socket.socketpair()` and still refuses anything else,
  loopback included; `test_unoq_auto.py` reuses it instead of its own copy. (Review follow-up: the first version let
  every loopback connect through.)
- **Verification:** both files pass.

### 4. Manifest test path separators — Low — Fixed
- **Root cause:** `str(Path.relative_to())` uses `\` on Windows; the manifest lists `/` paths. **Fix:** `.as_posix()`. **Verification:** test passes.

### 5. Vendored data_manager tests on Windows — Low — Won't fix
- `hub/afferent_hub/team/data_manager` is copied verbatim (blob-hash pinned by `test_vendored_files_match_manifest`).
  Its tests fail on Windows only: the store's SQLite file is still open at `TemporaryDirectory` cleanup, and a connect to a
  closed loopback port takes ~2 s to fail on Windows (test waits 0.5 s). Passes on Linux (its target, and CI).

### 6. `jetson/hub` auth on Windows — Low — Won't fix
- `os.fchmod` does not exist on Windows; the service is Linux/Jetson-only.

## Area audits (parallel agents, merged here)

Full root cause / fix / verification per bug: `docs/bugburn/{app-core,games,hub,devices,native}.md`.

| # | Bug | Area | Severity | Status |
|---|-----|------|----------|--------|
| 7 | Voice companion of any patient got the bound patient's home facts (`service.py voice_context`) | hub | Critical | Fixed |
| 8 | `SIM=1` presence wrote simulated home/away periods to the real data manager | jetson/presence | Critical | Fixed |
| 9 | Processing a video file pushed its posture minutes as live measurements | posture-analysis | Critical | Fixed |
| 10 | Check-in: item 9 > 0 + screener all "no" ended on "Thank you" with no helplines | app (checkin.js) | High | Fixed |
| 11 | Check-in: item 9 at 2–3 + screener stopped early showed support, not crisis screen | app (checkin.js) | High | Fixed |
| 12 | App sockets without a patient got every patient's broadcasts (`ws/manager.py`) | hub | High | Fixed |
| 13 | iOS `AfferentEyes.start` resolved with camera permission denied (no touch fallback) | iOS | High | Fixed (static only, no Xcode) |
| 14 | Talk requests made while the hub is unreachable were dropped (`hub.js`) | app | Medium | Fixed |
| 15 | Dashboard export could not reach the paired hub (`qrexport.js`) | app | Medium | Fixed |
| 16 | Vihta tapping run cut short after a late first tap; taps/s under-reported | games | Medium | Fixed |
| 17 | owls/runes/faces/swans/signpost closed before a slow player's last trials | games | Medium | Fixed |
| 18 | Bio-music: a stalled tick threw on every tick and stopped `Music.tick` | games | Medium | Fixed |
| 19 | UTC talk-request stamps read as local in the doctor's QR (`qr.py`) | hub | Medium | Fixed |
| 20 | STM32 clock reset/wrap stalled finger probing and mixed buffers | uno-q | Medium | Fixed |
| 21 | Data manager client dropped batches / thread died on a non-object 200 reply | devices (4 copies) | Medium | Fixed |
| 22 | Home interval close lost across a presence restart | jetson/presence | Medium | Fixed |
| 23 | iOS finger link stuck "connected" when notifications were refused | iOS | Medium | Fixed (static only) |
| 24 | iOS haptics handlers wrote main-queue players from Core Haptics' queue | iOS | Medium | Fixed (static only) |
| 25 | iOS prototype app treated stored/errored BLE values as fresh | iOS prototype | Medium | Fixed (static only) |
| 26 | Vendored hub copy of the data manager client still dies on a non-dict JSON reply | hub/team (vendored) | Medium | **Open** (needs manifest re-pin) |

## Open / unproven (from the audits, not fixed)

Candidates the agents flagged but could not prove or left as design questions; each needs a decision before it is
called a bug: hub `handle_app` trusts the message's `patient_id` (no per-patient auth); `set_pause` read outside the
per-patient lock; `refresh_room` uses today's UTC offset for nights across DST; replayed sessions without a day index land
on today; voice-relay has no rate limit on access-code attempts; iOS has no timeout for an unanswered `setNotifyValue`.
Lows (dates west of UTC, stay.js rest timer, `normHub` adding :8000 to https, frame-clock RT in Lanterns/Fork, etc.) are in the area logs.

## Final verification

See the PR description for the final run of every suite. The final re-audit was a review of the merged diff, not a second
full sweep (budget); it does **not** establish that no Medium bugs remain: #26 and the candidates above are still open.
