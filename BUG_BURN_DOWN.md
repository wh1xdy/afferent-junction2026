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
- **Fix:** the guard lets loopback through and still refuses anything else; `test_unoq_auto.py` reuses it instead of its own copy.
- **Verification:** both files pass.

### 4. Manifest test path separators — Low — Fixed
- **Root cause:** `str(Path.relative_to())` uses `\` on Windows; the manifest lists `/` paths. **Fix:** `.as_posix()`. **Verification:** test passes.

### 5. Vendored data_manager tests on Windows — Low — Won't fix
- `hub/afferent_hub/team/data_manager` is copied verbatim (blob-hash pinned by `test_vendored_files_match_manifest`).
  Its tests fail on Windows only: the store's SQLite file is still open at `TemporaryDirectory` cleanup, and a connect to a
  closed loopback port takes ~2 s to fail on Windows (test waits 0.5 s). Passes on Linux (its target, and CI).

### 6. `jetson/hub` auth on Windows — Low — Won't fix
- `os.fchmod` does not exist on Windows; the service is Linux/Jetson-only.
