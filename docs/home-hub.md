# The home hub on the Jetson

The hub in `hub/` runs on the Jetson as the Wendy app `afferent-home-hub` (`jetson/home_hub`): the hub, the
real UNO Q as bedside and the data manager all run on the Wendy Net mesh. A phone on the Jetson's Wi-Fi
reaches it through the LAN door (`jetson/home_hub/door`, port 8800); the Mac bridge still works as before
(see "Reaching the hub"). The short version is in the README ("Home hub on the Jetson").

## Deploy

- `jetson/home_hub/deploy.sh` copies the tracked files of `hub/`, `demo/`, `contracts/`, `design/` (without
  test folders) into the git-ignored `stage/` and runs `wendy run`; an untracked file in those folders stops
  it. `./deploy.sh --stage-only` only refreshes `stage/`. The SQLite database is on the volume
  `afferent-home-hub` and survives a redeploy. The image pins its packages
  (`jetson/home_hub/constraints.txt`) and runs the hub as a non-root user.
- The device comes from `WENDY_DEVICE` (the script's default is the Jetson on USB). The other settings are
  read from the shell and listed at the top of `deploy.sh`.
- The LAN door is its own app: `jetson/home_hub/door/deploy.sh` (settings at its top). Its tests, and the
  hub advert's contract with it, run without a device: `cd jetson/home_hub && python3 -m unittest discover tests`
  (the Bonjour tests need zeroconf from `hub/requirements-dev.txt`).

## Pairing token

Every `/api/*` and `/ws/*` route except `/api/health` needs the hub token. The first deploy makes it in
`~/.afferent/home-hub.token` (mode 600) and passes it to the app; it is never in the repo.
`jetson/home_hub/pair.sh` prints the pairing link (it holds the token: open it, do not paste it into a
chat, an issue or a commit). A browser opens the link once and gets a cookie; the phone app keeps the token
in its hub address (`<ip>/k/<token>`; the app adds port 8000 when none is given). Requests from other web
origins and DNS names are refused, and `/ws/bedside` is closed while the bedside is the UNO Q.

## Reaching the hub

The hub runs on the Wendy Net mesh (`network` mode `mesh` in `wendy.json`). Wendy publishes a mesh app's
ports to mesh peers only, never on the Jetson's Wi-Fi or Ethernet: on 15 November the Jetson was on the
venue Wi-Fi (`wlan0`, `Junction2026`, the Mac's subnet) and a host-network app there (`afferent-presence`,
port 8090) answered the Mac, while the hub's 18000 and the data manager's 8100 did not. Moving the hub
itself to host networking would cost it the mesh (the UNO Q, the data manager) and `wendy net forward`.
So a second, tiny app does the relay on the Jetson, and the Mac bridge below stays as it was.

### Phone straight to the Jetson (no Mac)

`jetson/home_hub/door` is the Wendy app `afferent-home-hub-door`: host networking, port **8800** on every
LAN interface, bytes copied unchanged to the hub's mesh port (HTTP, the pairing redirect, the app
WebSocket). The hub's guard still wants the token on every route but `/api/health`; the door holds no
token. It finds the hub at `127.0.0.1:18000` (the mesh port as Wendy publishes it on the host), else by
the hub's own advert (`_http._tcp`, `role=home-hub`, sent when `AFFERENT_HUB_ADVERTISE=1`, which
`wendy.json` sets), and only uses an address whose `/api/health` answers like the hub. It announces
`_afferent-hub._tcp` on the LAN with Bonjour (TXT `role`, `v`: no token, no patient), which the iPhone app's
**Settings › Home hub › Find on this Wi-Fi** browses (`ios/App/App/AfferentHubFinder.swift`,
`demo/js/hubfind.js`). Find keeps the key the phone already has and only swaps the address.

Steps, from the repo root on the Mac (the Mac only deploys; nothing runs on it afterwards):

```sh
JETSON=10.0.32.31:50052     # the Jetson's agent on the venue Wi-Fi (worked on 15 Nov); or its USB address
                            # 169.254.246.159:50052, or the cloud selector from `wendy device list`

# 1. The Jetson must be on the phone's Wi-Fi. Check:
wendy --json device wifi status --device "$JETSON"            # {"connected": true, "ssid": "Junction2026"}
#    Only if the phone is on another network (a home router, a phone hotspot):
read -s WIFI_PW                                                  # not shown, not in the shell history
wendy device wifi connect --ssid "<phone's Wi-Fi>" --password "$WIFI_PW" --device "$JETSON"
#    then find the Jetson again (its address changes): `wendy discover --json --type all --timeout 5s`,
#    or over USB, and set JETSON to it.

# 2. Redeploy the hub, so it announces itself on the mesh (the database is on its volume and stays):
WENDY_DEVICE="$JETSON" jetson/home_hub/deploy.sh

# 3. Deploy the door (once; it keeps running across reboots):
WENDY_DEVICE="$JETSON" jetson/home_hub/door/deploy.sh

# 4. Check from the Mac, no token needed for health:
DOOR=$(WENDY_DEVICE="$JETSON" jetson/home_hub/pair.sh --jetson-address)   # <jetson-ip>:8800, no token
curl -s "http://$DOOR/api/health"                          # {"ok":true,...}; 503 hub_unreachable = see below
wendy device logs --app afferent-home-hub-door --tail 20 --no-follow --device "$JETSON"  # "door: hub found at ..."
```

Pair the phone (it must be on the same Wi-Fi as the Jetson):

- **Already paired through the Mac bridge:** Settings › Home hub › **Find on this Wi-Fi**, then Connect. The
  address becomes `<jetson-ip>:8800/k/<the same key>`. Needs an app build with `AfferentHubFinder` (iPhone;
  the button is hidden on Android and in the browser).
- **Any app build, or Find shows nothing:** `WENDY_DEVICE="$JETSON" jetson/home_hub/pair.sh --jetson` prints the
  phone app's Hub address (`<jetson-ip>:8800/k/<token>`). Copy it on the Mac (Universal Clipboard), then
  Settings › Home hub › Paste, then Connect. `pair.sh <ip>:8800` does the same for an address you already know.

Find needs Bonjour (multicast) to cross the Wi-Fi. Venue and office networks often drop it between
clients: on `Junction2026` the Mac saw no other device's Bonjour adverts at all, while plain connections to
the Jetson worked. There, use `pair.sh --jetson` and Paste; at home Find works on ordinary routers.

If the door answers `503 hub_unreachable`, its log names the addresses it tried. The hub's own log has its
mesh address (`hub advert: ... on <address>:8000`); pin it with
`AFFERENT_DOOR_UPSTREAM=<address>:8000 WENDY_DEVICE="$JETSON" jetson/home_hub/door/deploy.sh` (that address can
change when the hub is redeployed). To go back to the Mac bridge only:
`wendy device apps stop afferent-home-hub-door --device "$JETSON"`.

### Through the Mac

- **Browser on the Mac:** `wendy net forward 18000:18000 --device <jetson>` (keep it running), then open the
  link from `jetson/home_hub/pair.sh`. It lands on the patient view (`/app/patient.html`); the game is
  `/app/`. `/clinic/` shows only the simulated demo roster and scanned codes: the real patient reaches the
  clinic view only through the code she shows. The forward allows about 8 connections at once across all
  forwards, so keep to one browser tab.
- **Phone on the same Wi-Fi as the Mac:** keep the forward above running, and in a second terminal relay
  it on the Mac's Wi-Fi address:

  ```sh
  IP=$(ipconfig getifaddr en0)      # the Mac's Wi-Fi address (en0 on most Macs)
  socat TCP-LISTEN:8000,bind=$IP,fork,reuseaddr TCP:127.0.0.1:18000
  jetson/home_hub/pair.sh $IP       # the Hub address for the app; it must end in /k/<token>
  ```

  In the app: Settings › Home hub › Paste, then Connect.
- **Phone over a USB cable instead:** Personal Hotspot over the cable (mobile data on), so the Mac gets an
  address on the "iPhone USB" port; use that address (`ipconfig getifaddr en8` or the port's own name) in
  place of the Wi-Fi one above.
- Run `wendy auth refresh-certs` before a demo.

## What runs inside

- **Bedside:** `AFFERENT_BEDSIDE=unoq:auto` finds the UNO Q over mDNS (`role=modulino-hub`, `.mesh.local.`
  host names only) and looks it up again when the link is lost. No simulator runs here. The hub reads the
  box's `/state` (pulse, room climate) and sets its LED.
- **Data manager:** `AFFERENT_DATA_MANAGER_URL=auto` finds it the same way (`role=data-manager`); one that
  answers is kept, and only the device in `AFFERENT_DATA_MANAGER_DEVICE` (default: this Jetson) is used,
  since the bearer token goes to it. The token comes from `AFFERENT_DATA_MANAGER_TOKEN` or
  `~/.afferent/data-manager.token` at deploy time. Routes: `/api/sensors/<name>`,
  `/api/patients/<id>/sensors/room`. The data manager itself (`jetson/data_manager`, mesh port 8100,
  token required) is already running on the Jetson; do not deploy a second copy. Its API:
  [`jetson/data_manager/API.md`](../jetson/data_manager/API.md).
- **Real and simulated:** the patient `AFFERENT_BEDSIDE_PATIENT` (default `anna`, the id the app sends)
  starts empty with `simulated: false` and only ever holds what was recorded; before the first session the
  hub reports "Not enough data yet" and no state, also in the QR code. A session the app marks simulated
  marks that day and names the simulated fields. The other demo patients are seeded and marked Simulated.
  `AFFERENT_HOME_DEMO_ROSTER=0` leaves them out, and removes them if an earlier start seeded them; the real
  patient's data stays. `POST /api/demo/reset` and `/api/demo/profile` are refused here.
- **Other values:** `AFFERENT_HOME_PATIENT_NAME`, `AFFERENT_HOME_TMS_END` (YYYY-MM-DD, default the day of
  the first start), `AFFERENT_HUB_ORIGINS`, `AFFERENT_HUB_HOSTS`, `AFFERENT_TZ` (default
  `Europe/Helsinki`), `WENDY_DEVICE`.
- **Teammates' code:** `hub/afferent_hub/team/` holds teammates' hub code copied byte-identical (never edit
  it; source branch, commit and blob per file in `manifest.json`); the glue is in
  `hub/afferent_hub/team_adapters/`, with features switched by `AFFERENT_TEAM_*` and
  `AFFERENT_DATA_MANAGER_URL`. Re-sync: `git fetch junction && (cd hub && .venv/bin/python -m
  afferent_hub.team_adapters.resync alex_hub)` (or `data_manager`), with `junction` as the remote that has
  those branches.

## Talk transcripts

When a Talk conversation ends, the phone sends the transcript to the hub over the app link
(`{type: "transcript"}` on `/ws/app`) and keeps it in a local outbox until the hub acks it
(`demo/js/voice.js`). Audio itself only ever goes to Google while the conversation is open; the transcript
stays on the phone (last 20 conversations) and on the hub. Nothing goes to the clinic or the data manager.

The hub appends each transcript as one JSON line to a rotating log (`hub/afferent_hub/transcripts.py`):

- Directory: `AFFERENT_TRANSCRIPTS_DIR`, default `hub/data/transcripts/`, next to `afferent.db` on the hub's
  disk (`/data` on the Jetson).
- Ring buffer: `transcript-000001.jsonl`, `transcript-000002.jsonl`, …; a new file starts past
  `AFFERENT_TRANSCRIPT_FILE_MB` (10 MB), and once the directory passes `AFFERENT_TRANSCRIPT_TOTAL_MB`
  (500 MB) the oldest files are removed; the current file is never removed.
- A resent `transcript_id` (ack lost on disconnect) is deduplicated in-process and the ack carries
  `duplicate: true`; the id also stays inside each row for dedupe across a hub restart.

```json
{"transcript_id": "3f6b…", "patient_id": "anna",
 "t_iso": "2026-11-14T15:30:00.000Z", "received_iso": "2026-11-14T17:36:43+02:00",
 "turns": [{"role": "user", "text": "I feel a bit tired today"},
           {"role": "agent", "text": "I hear you. Did you sleep alright?"}]}
```

| Field | Meaning |
|---|---|
| `transcript_id` | uuid from the phone; dedupe key |
| `patient_id` | patient the conversation belongs to |
| `t_iso` | when the conversation ended, phone clock (UTC ISO 8601) |
| `received_iso` | when the hub wrote the row, hub clock |
| `turns` | ordered list; `role` is `user` or `agent`, `text` is that turn's full transcript |

## Daily wellbeing read for the voice companion

Once a day the phone asks the hub how its patient seems to be doing (`{type: "voice_context"}` on
`/ws/app`, answered by `{type: "voice_context", ...}`); the same answer is at
`GET /api/patients/{pid}/wellbeing` (`hub/afferent_hub/wellbeing.py`, wired in `service.py`).

```json
{"type": "voice_context", "patient_id": "anna", "date": "2026-11-15",
 "indicator": "bad", "suggest_doctor": true,
 "facts": ["skipped the morning practice on 4 of the last 7 days",
           "went outside on 0 of the last 5 days"]}
```

- `indicator` is `ok`, `watch` or `bad`, from the hub's own data: the analytics state (`check_in`/`booster`
  → bad, `watch` → watch) and the last PHQ-9 band (`moderate` or worse → bad, `mild` → watch, an overdue
  check-in → watch).
- `facts` are short clauses. The hub adds its own (missed practice, the last questionnaire); when the
  indicator is `bad` it also asks the data manager for presence facts (outings, time at home and visitors
  over the last two weeks). Every sensor read is best-effort: a quiet data manager means fewer facts,
  never an error.
- `suggest_doctor` is `indicator == "bad"`.

The phone caches the answer for the day and hands it to the voice relay inside the auth message
(`{auth, context}`); the relay (`voice-relay/main.py`) validates it and appends it to the system
instruction. So on a bad day the companion gently acknowledges that things have not been easy, reminds the
person the app and their care team are there for that, and suggests once, without pushing, that they talk
to their doctor. The conversation design and its limits are in
[`voice-relay/README.md`](../voice-relay/README.md).

## Personal decline alert

The hub compares daily outings, visitor time, HRV and posture against the patient's own reference (the
median of the previous 14 full days versus the mean of the latest 3) and, when one drops below 80 %, adds a
fact to the voice companion's context. The values are provisional placeholders, not clinical thresholds.
Full guide, settings and the demo-only API: [decline_alert.md](decline_alert.md).
