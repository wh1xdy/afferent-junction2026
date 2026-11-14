# Bug burn-down: phone app core (`demo/`)

Branch `burndown/app-core` (from `fix/bug-burndown` @ 4daecf6). Scope: `demo/js` core (main, sensors, finger, campulse,
face, breathing, heartbeat, record, hub, qrpayload, qrexport, qrshow, checkin, clipcheck, onboard, remind, streak, stay,
patient, livevitals, dashboard_gen, room, presence*, voice, input, perf, gui/*), `demo/index.html`, `demo/patient.html`,
`demo/css/*` and their tests.

Baseline: every `demo/tests/*.test.js` passed once the worktree was re-checked-out with LF endings (`.gitattributes`
from 4daecf6). `hub/tests/test_session_js_contract.py` and `test_contracts.py` (they run the JS recorder against
`contracts/session.v3.schema.json`) passed: 178 passed.

## Summary

| # | Bug | File | Severity | Status |
|---|-----|------|----------|--------|
| 1 | Licensed C-SSRS: positive PHQ-9 item 9 then a negative screener ends on "Thank you", with no helplines | demo/js/checkin.js `build()` | High | Fixed |
| 2 | Licensed C-SSRS: item 9 at 2 or 3, screener left unfinished, gets the support screen instead of the crisis screen | demo/js/checkin.js `build()` | High | Fixed |
| 3 | Talk requests (`crisis` messages) made while the hub is out of reach are dropped; the clinic never gets the flag | demo/js/hub.js `send()` | Medium | Fixed |
| 4 | Dashboard export cannot find the paired hub: reads the saved address with `JSON.parse` and drops its `/k/<key>` | demo/js/qrexport.js | Medium | Fixed |
| 5 | Dashboard dates parse `tms_end_date` as UTC midnight, one day early west of UTC | demo/js/dashboard_gen.js | Low | Not fixed |
| 6 | Stay and breathe: the 4 s "rest" timer of a finished run can close a run reopened within those 4 s | demo/js/stay.js | Low | Not fixed |
| 7 | Hub address without a port gets `:8000` also for `https://` | demo/js/main.js `normHub` | Low | Not fixed |

## Details

### 1. Positive item 9, negative C-SSRS: no helplines — High — Fixed
- **Reproduce:** new test `i` in `demo/tests/checkin.test.js`: with `?cssrs=1` (the screener licensed), answer items 1 to 8
  with 0 and item 9 with 1, continue into the screener and answer c1, c2 and c6 "no". Before the fix the check-in ends on
  `ci-info ci-thanks` with `safety.screen = 'thank_you'`; no contact numbers are shown.
- **Root cause:** in `build()` the C-SSRS branch chose the screen from the screener tier alone
  (`tier === 'none' ? 'thank_you'`). The unlicensed branch and the plan (docs/plan_posture_depression.md: "any positive
  response [to item 9] immediately displays help resources") show the helplines for any item 9 above 0.
- **Fix:** the screen in the C-SSRS branch is now the more cautious of the screener's screen and a floor from item 9
  (`support` for item 9 >= 1). The safety tier and the C-SSRS tier sent to the clinic are unchanged.
- **Verification:** `node demo/tests/checkin.test.js` → `10 ok, 0 failed` (test `i` failed before the fix).

### 2. Item 9 at 2 or 3, C-SSRS unfinished: support instead of crisis — High — Fixed
- **Reproduce:** new test `j`: with `?cssrs=1`, answer item 9 with 2 or 3 and press stop before the screener starts.
  Before the fix: `safety.tier = 'incomplete'`, `screen = 'support'` (the unlicensed app shows `crisis`, with
  "If you might act on these thoughts, call 112 now." and 112 as the main contact).
- **Root cause:** same branch: an `incomplete` tier always mapped to `support`, ignoring item 9, so turning the licensed
  screener on made a stopped check-in show less than the app without it.
- **Fix:** for an incomplete screener the floor is the item 9 fallback screen (`crisis` for 2 or 3). Same edit as #1.
- **Verification:** `node demo/tests/checkin.test.js` → `10 ok, 0 failed` (test `j` failed before the fix).

### 3. Talk requests lost while offline — Medium — Fixed
- **Reproduce:** new `demo/tests/hub.test.js`: emit a `crisis` message on the bus before the WebSocket is open, or after it
  closed (and across an app restart). Before the fix nothing reaches the hub when the link comes back (tests `b`, `c`
  failed).
- **Root cause:** `Hub.send()` keeps only `session_end` in an outbox; every other message goes to `raw()`, which drops it
  when the socket is not open. The hub turns a `crisis` message into a `talk_request` flag for the clinic, so a talk
  request made with the hub unreachable never showed up. (`patient.js` already queues its own `crisis` messages.)
- **Fix:** an unsent `crisis` message is kept under `afferent.outbox.talk` (max 20) and sent once on the next open, with
  its original `t_iso`. The hub has no ack for these, so they are cleared when sent.
- **Verification:** `node demo/tests/hub.test.js` → `3 ok, 0 failed`.

### 4. Dashboard export does not reach the paired hub — Medium — Fixed
- **Reproduce:** new `demo/tests/qrexport.test.js`: with `afferent.hub` saved as Settings saves it
  (`http://10.0.0.5:8000/k/test-key`, a plain string), the Share tab says "No hub" (test `a`); with
  `?hub=ws://…/k/test-key/ws/app` it fetches `http://10.0.0.5:8000/api/...` without the key (test `b`).
- **Root cause:** `qrexport.js` read the address with a `JSON.parse` store (main.js writes it raw, so the parse throws and
  gives null), and its `norm()` returned `u.origin`, dropping the `/k/<token>` prefix the home hub requires on `/api`
  and `/ws` (hub/afferent_hub/home_guard.py). `patient.js` already kept it. Room nights, the direct `qr-body` fetch, the
  publish to `/api/export/publish` and the `/ws/clinic` refresh all used this address.
- **Fix:** read `afferent.hub` raw and normalize as `patient.js` does, keeping the key.
- **Verification:** `node demo/tests/qrexport.test.js` → `3 ok, 0 failed` (a and b failed before the fix).

### 5–7. Low, not fixed
- **5:** `new Date('YYYY-MM-DD')` is UTC midnight; with a negative UTC offset every `dayDate()` on the generated
  dashboard is a day early. Target devices are in Finland (UTC+2/+3), where it is correct.
- **6:** `finish()` schedules `close()` 4 s later without a handle; Done, then reopening within 4 s, closes the new run.
- **7:** `normHub` appends `:8000` to any address without a port, including `https://`; the hub addresses in use are
  `http://` with a port.

## Reviewed and found clean
- `checkin.js` beyond #1/#2: skip logic (`nextOf`, `cssrsPath`), tiers, totals and bands, outbox/ack, draft restore on
  launch, stop/talk/swipe paths, `pagehide`; contract fields against `contracts/checkin.v1.schema.json`.
- `record.js` (session document; the contract tests pass), `isoLocal` offsets (also half-hour and negative).
- `qrpayload.js` (CBOR, base45, COSE sign/verify, pack/unpack), `qrshow.js` (period, TTLs, build).
- `sensors.js`, `finger.js`, `campulse.js`, `face.js`: start/stop races (listeners removed, stop during start),
  freshness and quality gates, simulated vs real separation, two-people flag.
- `breathing.js`, `heartbeat.js` (per-session reset on a new session object), `livevitals.js`, `room.js`.
- `main.js`: session begin/end/home, per-session resets (timeline, guide memory, end screen), card focus, hub wiring,
  privacy from the hub; ids it looks up exist in `index.html` or are made by `gui/shell.js`.
- `streak.js` (listener order before `hub.js`, so `extra.streak` is in the stored and sent document), `remind.js`,
  `onboard.js`, `stay.js` (except #6), `clipcheck.js`, `voice.js` (stop during start, outbox), `presence.js`,
  `presence-core.js`, `input.js`, `perf.js`, `patient.js`, `dashboard_gen.js` (except #5), `gui/*`.
- Checked and not a bug: a check-in rejected by the hub (ack with `ok: false`) leaves the outbox; the hub only rejects
  schema-invalid documents, which a resend would not fix.
