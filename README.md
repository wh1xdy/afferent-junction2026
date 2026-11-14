# afferent — Junction 2026

Two WendyOS boards working together over Wendy Net:

| Board | App | Role |
|---|---|---|
| NVIDIA Jetson Orin Nano | [`jetson/vision`](jetson/vision) | Logitech C920 + YOLOv8n on the GPU. Finds `modulino-hub` on the mesh, beeps when a person enters the frame. |
| NVIDIA Jetson Orin Nano | [`jetson/presence`](jetson/presence) | Wi-Fi (ARP) + BLE: is the patient home, outings, isolation alert, guest visits — mobility and social-withdrawal markers. See its README for deploy + test steps. |
| NVIDIA Jetson Orin Nano | [`jetson/data_manager`](jetson/data_manager) | Long-running SQLite store for every sensor (climate, CO2, heart rate, posture, presence, guest visits): apps push samples/intervals over HTTP, the API serves raw data, daily aggregates, trends and baseline deviations. See its [API guide](jetson/data_manager/API.md). |
| Arduino UNO Q | [`uno-q/modulino-hub`](uno-q/modulino-hub) | STM32 sketch reads Modulino **Knob** + **Thermo**, a **PulseSensor** on A1, drives **Buzzer** and a **KY-016 RGB LED**; the Linux side bridges them to an HTTP service on the mesh. |

```
 C920 ─► Jetson: YOLO ──"person"──► Wendy Net (BLE / USB via Mac) ──► UNO Q Linux ──Bridge──► STM32 ──Qwiic──► Buzzer
                   ▲                                                       │
                   └──── knob position → confidence, knob press → arm ─────┘  (+ Thermo °C / %RH)
```

## Heartbeat

PulseSensor on A1 (`+` 3.3V, `-` GND — never 5V, the output would exceed the ADC input).
Tape it to a fingertip: firm enough not to move, not so tight it blocks blood flow.

- The STM32 samples A1 at ~45 Hz (14-bit) and detects each beat from the steep upstroke.
- Linux computes the pulse period by autocorrelation every second and sends it back;
  the sketch ignores the dicrotic second bump (half a period) and only beeps/flashes once
  the period is reliable, so it stays silent without a finger.
- Every beat: 880 Hz beep + red flash on the KY-016 (`R` D9, `G` D10, `B` D11, `-` GND).
  Dim blue = searching for a rhythm. Verified against a smartwatch (75–85 vs 72–76 BPM).

## Camera pulse (rPPG)

The Jetson also estimates heart rate contact-free from **two cameras**: the C920 (`cam1`, also
used for YOLO) and the Arduino USB Camera (`cam2`, `/dev/video2`, 1280x720). Per camera:
YOLOv8n-pose finds the eyes, forehead + cheeks are averaged (skin pixels only) at 20 Hz, and
POS (Wang et al. 2017) on the last 10 s gives the dominant frequency in 45–180 BPM. The two
spectra are fused, weighted by each camera's SNR. Auto exposure / white balance / focus are
locked (50 Hz mains), and gain follows the *face* brightness (no clipping).

Validated against the finger sensor (same person, ~35 s, 12 readings): fused camera
76–83 BPM vs finger 76–84 BPM, mean absolute difference 1.8 BPM, max 4 BPM.

Requirements, honestly: a still face, 0.5–1 m away, lit by **white** light. Coloured (purple)
stage lighting has almost no green, where the pulse signal lives — use the Arduino camera's
ring light. `snr` below 0 dB means "don't trust it". Keep the heartbeat LED off
(`POST /led/beat?on=0`, the default): a light flashing at heart rate on the face fakes the result.

Diagnostics: `GET /rppg` (per-camera skin pixels, brightness, clipping, gain) and
`GET /rppg/frame?cam=cam1|cam2` (latest frame with the measured skin regions drawn).

## Open the UI (no display needed)

```sh
wendy net forward 3005:3005 --device <jetson>   # keep running
open http://localhost:3005
```

## Finger pulse over Bluetooth

Two PulseSensors: finger 1 on **A1**, finger 2 on **A2** (each `+` 3.3V, `-` GND), each with its
own beat detector (beep 880 Hz / 660 Hz, LED red / blue when `led_beat` is on).
The UNO Q advertises **"Afferent Finger"** with the standard BLE Heart Rate Service (0x180D,
measurement 0x2A37 = finger 1, body location = finger) plus a custom service `AFF0`/`AFF1`
carrying `[bpm finger 1, bpm finger 2]`, notified on every locked beat. The iPhone app
(`ios/`) connects automatically and shows `Finger 83 · Δ 1` under the camera reading.
Any heart-rate app that talks to chest straps can read it too.

## Controls

- **Turn the knob**: YOLO confidence threshold (0.40 at position 0, ±0.01 per click).
- **Press the knob**: arm / disarm the person alarm (high beep = armed, low beep = disarmed).
- A person entering the frame while armed → 988 Hz beep (3 s cooldown).

## Deploy

Both boards are enrolled in the same Wendy Cloud org with Wendy Net enabled
(`wendy net configure --participate=true --ethernet=true --infrastructure-wifi=true --ble=true`).

```sh
# UNO Q: compiles + flashes the STM32 sketch, then deploys the Linux app
cd uno-q/modulino-hub && wendy run --device <uno-q> --detach --yes

# Jetson
cd jetson/vision && wendy run --device <jetson> --detach --yes
```

Both apps use `"mode": "mesh"` networking, so their ports are reachable only inside
Wendy Net (use `wendy net forward` to open the Jetson UI on port 3005 from a laptop).

## Laptop POC

[`posture-analysis/posture`](posture-analysis/posture) — Dockerised webcam pipeline for posture, gait
and facial-expressivity markers (SQLite aggregates, FastAPI dashboard). See its
README for setup; the project plan is in [`docs/plan_posture_depression.md`](docs/plan_posture_depression.md).

## HTTP

- UNO Q `modulino-hub` (mesh, port 18080): `GET /state` (knob, climate, `beat.bpm_live`, `pulse`),
  `GET /ppg` (raw 30 s), `POST /buzz?freq=880&ms=200`, `POST /heartbeat?on=0|1`,
  `POST /led?r=0&g=255&b=0&ms=500`
- Jetson `afferent-vision` (mesh, port 3005): web UI `/`, `GET /rppg` (camera + finger BPM), `GET /hub`, `POST /hub/buzz`
- Jetson `afferent-data-manager` (mesh, port 8100): `POST /api/v1/samples`, `POST /api/v1/events`, `GET /api/v1/latest|daily|stats|trend|baseline|…` — see [its API guide](jetson/data_manager/API.md)

## Notes

- Modulinos sit on the STM32's Qwiic bus; Linux reaches them only through `arduino-bridge`.
- The sketch profile in `sketch.yaml` must list every library dependency explicitly.
- Hackathon Wi-Fi isolates clients, so the boards talk over BLE (or USB through the laptop).
- `jetson/vision` is based on Wendy's `camera-feed-yolo` template (JetPack 7 CUDA fix included).

## iPhone app (`ios/`)

On-device, nothing leaves the phone. Three tabs:

- **Pulse** — camera pulse (POS + trust score) with the screen as a variable light (starts from the
  room's darkness, then a slow ≤2 %/s loop keeps the face lit), plus the finger reading from the UNO Q
  over Bluetooth (fused value, per-sensor detail, Δ to the camera).
- **Expressions** — 60 s ARKit/TrueDepth session: 52 blendshapes at 60 Hz → smile, sadness,
  frown/anger, disgust, surprise, contempt as FACS-style composites; micro-expressions (40–500 ms)
  against the person's own baseline; one facial action = one event (overlap resolution); no onsets
  while looking > 25° away. Eyes: blinks, gaze shifts, looking away (per-person gaze calibration
  corrects ARKit's under-estimated eye rotation). Camera pulse pinned to the 3D face mesh, breathing
  rate (heart-rate rhythm from the finger sensors, else TrueDepth head motion — the clearer one is
  shown), distance coaching, activation score. Debug mode: face mesh, eye arrows, pulse regions,
  raw blendshapes. Sessions export as JSON → `ios/tools/analyze_session.py`.
- **Check-in** — PHQ-9 with crisis resources (112, Mieli 09 2525 0111, Självmordslinjen 90101, 1177).
  Support for follow-up, not a diagnosis.

Tuned on recorded sessions: real ARKit names are `mouthSmile_L/_R` (the first build read 0 for every
left/right shape); a slight smile is only +0.05–0.09; looking away read 5–65°; paced breathing at
6/min was recovered by both breathing sources.

## Health-data hub (`jetson/hub`), the patient's own

**The hub never talks to a doctor.** It sends nothing to anyone and only the patient can read it: no
clinician login, token, live view or chatbot. A doctor sees what the patient hands over in person, the
printed handover report or the FHIR file the patient downloaded.

Local SQLite on the Jetson (persistent volume `afferent-data`). It collects the finger readings from the
UNO Q over Wendy Net and takes expression sessions and PHQ-9 check-ins from the app.

- `GET /report/handover?days=14`: "Report for my doctor", the page the patient prints. PHQ-9 with item 9
  at the top, a fixed-template summary (no language model), coverage, daily trends for resting pulse, HRV
  (RMSSD) and breathing rate, and how every number is computed. No diagnosis.
- `GET /report/patient?days=7`: "Your week", the same period in plain words.
- `GET /fhir?days=14`: FHIR R4 Bundle as a download the patient can hand to a clinic.
- `GET /summary` (all numbers as JSON), `POST /sessions` (a session marked simulated is refused),
  `POST /phq9 {"answers": [...]}`.
- `?demo=1`: a synthetic 14-day patient, no token, read-only, marked SIMULATED on every output.

One access token, the patient's (`jetson/hub/auth.py`). The hub generates it on first start, keeps it in
the volume and prints it to its log that one time; `--env AFFERENT_PATIENT_TOKEN=…` sets it instead. APIs
take `Authorization: Bearer <token>`; the two HTML reports also take `?token=` and swap it for a 12 h
cookie. `/health` answers `{"ok": true}` to anyone and adds the collector counters with the token.

```sh
wendy device logs afferent-hub --tail 200 --no-follow --device <jetson>    # the token, after the first start
wendy net forward 8090:18090 --device <jetson>
open "http://localhost:8090/report/handover?token=$PATIENT"
curl -H "Authorization: Bearer $PATIENT" -OJ localhost:8090/fhir
```

Collector (`store_state()` in `app.py`), every 5 s from the UNO Q's `/state`. Only what was measured on
the patient just now is stored, labelled `finger_ppg`; the rest stays missing, never 0:

- pulse: presence `active`, quality reported and at least 0.3, newest beat at most 3 s old. Otherwise it
  is counted in `collector.skipped_low_quality` or `skipped_stale` and not stored.
- HRV and breathing rate: only after 6 s of presence `active`.
- nothing from the fingers while the two clips are on two different people (`finger.two_hearts`).

Tests: `cd jetson/hub && python3 -m unittest discover tests`. The collector rules have run in tests only,
not against the UNO Q.

## Team access

Both boards are enrolled in our Wendy Cloud org, so any org member can reach them from
anywhere — no USB cable or shared Wi-Fi needed:

```sh
curl -fsSL https://install.wendy.dev/cli.sh | bash   # install the CLI
wendy auth login                                     # sign in with your invited account
wendy cloud discover                                 # lists `jetson` and `uno-q` with cloud:// selectors

JETSON='cloud://api.wendy.dev:443/tenant/e064d3cd-1e43-45af-adf2-37b0afe5e3da/asset/149628ce-6c13-44b8-9b2a-ec527e20caf7'
UNOQ='cloud://api.wendy.dev:443/tenant/e064d3cd-1e43-45af-adf2-37b0afe5e3da/asset/a933500b-ab5a-4086-a2cc-a68ec015719a'

wendy --device "$UNOQ" device apps list
cd uno-q/modulino-hub && wendy run --device "$UNOQ" --detach --yes
```

When plugged in over USB-C, `wendy discover` finds the boards directly (faster deploys).

## Contributing

All repo content — code, comments, docs, commit messages — is in English.

## Afferent app, hub and design (afferent-app)

Home maintenance companion after TMS for depression (Junction 2026, Aalto "Beyond the Clinic").
A two-minute wordless morning game that measures and adapts to the body, a bedside unit and phone that observe everyday life, and local analytics with a clinician dashboard.
Supportive, not a treatment. All patient data in the demo is SIMULATED.

Live demo: https://afferent-demo.david-noel-vinu.workers.dev

### Run

```
./start.sh --reset
```

Needs Python 3. Creates `hub/.venv` on first run and prints the LAN addresses for the phone.

- Clinic dashboard: http://localhost:8000/clinic/
- Game: http://localhost:8000/app/?input=auto&clock=morning
- Patient view: http://localhost:8000/app/patient.html?patient=anna

`./start.sh --help` lists the options. Reset the demo data with `curl -X POST localhost:8000/api/demo/reset`.

Tests:

```
cd hub && .venv/bin/python -m pytest -q
cd hub && .venv/bin/python -m afferent_hub.analytics.validate
```

### iPhone app (Capacitor)

```
npm install
npm run sync
npm run open
```

In Xcode select the iPhone, set the signing team, Run. In the app, Settings > Hub address: the LAN address from `./start.sh`, same Wi-Fi as the hub.

### Android app

```
npm install
npm run build:android
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

`npm run open:android` opens the project in Android Studio instead.

Toolchain, before any Gradle or adb command (JDK 21 and the Android SDK from Homebrew; `android/local.properties` with `sdk.dir=` also works and is never committed):

```
export JAVA_HOME=/opt/homebrew/opt/openjdk@21; export ANDROID_HOME=/opt/homebrew/share/android-commandlinetools
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$PATH"
```

- Tests: `cd android && ./gradlew testDebugUnitTest`. After a change in `demo/`, `npm run sync` first, or the APK carries the old web layer.
- Native, with the same plugin names, calls and events as on iOS: `AfferentFinger` (the finger clips over Bluetooth: pulse, per-finger pulse, breathing rate, RMSSD) and `AfferentPresence` (Home and visitors). Haptics and the morning reminder come from the Capacitor npm plugins. Both Bluetooth plugins stop scanning and let go of the board a few seconds after the app leaves the foreground (as iOS does by suspending the app) and look again when it is back.
- Not available on Android: ARKit and the TrueDepth camera. Eye input uses the front camera with the MediaPipe model bundled in the app (no network, source `mediapipe`); what it cannot measure arrives as "not available" (null), never as zero.
- State: builds and passes its unit tests. Not yet run on an Android phone or against the UNO Q.

### Real sensors in the app

The two finger clips on the UNO Q feed the app with pulse, per-finger pulse, breathing rate and HRV (RMSSD), labelled `finger_ppg`. Two paths, same data:

- Phone, direct: the `AfferentFinger` plugin (iOS and Android, same calls and events) reads the UNO Q over Bluetooth ("Afferent Finger": Heart Rate Service `180D/2A37` = fused pulse; `AFF0/AFF1` = finger 1, finger 2, breaths/min, RMSSD ms, quality, presence; `0` = no reading; RMSSD byte `255` = above 254 ms, shown as no reading).
- Hub: `./start.sh --unoq http://127.0.0.1:18081` after `wendy net forward 18081:18080 --device <uno-q>`; the hub relays `physio` to the phone only.

Nothing live goes to the clinic. The patient hands data over in person (signed QR code, printed report or file). The Jetson hub (`jetson/hub`, above) stores the finger readings for the patient's own report and serves only the patient.

Rules, the same on both paths:

- A reading counts for 3 s, counted from the age of the value. Presence and contact expire the same way when the sensor goes quiet.
- A fused pulse with reported quality below 0.3, or with no reported quality, is not shown, not recorded and does not drive the game. Quality is never invented; a missing value stays missing. The face pulse from the iPhone camera (`rppg`) has the same 3 s and 0.3 rules.
- With both paths live, the one that has a usable pulse is used, Bluetooth first. A Bluetooth reading without usable quality never hides the hub pulse.
- Real and simulated are never mixed inside a session. The session decides at its start: with a live sensor it uses real readings only, without one it runs on the simulated pulse to its end and clips put on later do not count in it, so put the clips on first. A frame the hub flags `simulated` has `source: simulated` on both sides, and anything simulated is marked in `simulated_fields`.
- The app first asks for Bluetooth when the patient opens Settings or Your signals or starts a session with the pulse stone switch on, not at launch.

For a new screen (or a Phaser scene) the whole sensor surface is `A.Finger` in `demo/js/finger.js` and `livePhysio()`, `pulse()` in `demo/js/sensors.js`; nothing else needs to know where the numbers come from. Sessions store them in the optional `vitals` blocks of `contracts/session.v3.schema.json`.

Breathing task: while the clips give a real breathing rate that is at most 3 s old, the task draws a ring around the guide and one line ("You: 9 breaths a minute · Guide: 6"); without one the task is unchanged, and Settings > Sensors > Breathing pace turns it off. The sensor derives the rate from its last 40 s of heart rhythm, so it describes a pace, not a breath; the average shown after the task, on the "Your signals" sheet and in `tasks[].extra.breathing` covers the task and the 40 s before it. Logic in `demo/js/breathing.js`, tests in `demo/tests/breathing.test.js`.

What the app claims matches the hardware: the "pulse stone" is the two finger clips, the "bedside light" is one small LED, and there is no bed sensor, so the `presence` switch is always off and never offered (`demo/tests/hardware.test.js`).

Home and visitors on the phone: `AfferentPresence` plugin with `demo/js/presence-core.js` (ported from `jetson/presence`). Off unless the patient turns it on. The bedside unit heard over Bluetooth means home; its silence means "could not look", so leaving home is only decided when the saved home Wi-Fi (two devices or more) is gone too. Learning who is usually around counts watched time only: app open and Bluetooth on.

### Sensor numbers in the handover

No sensor number is sent or streamed to the clinic page. Its socket only says which stored document changed (`session_added`: ids, day, status; `analytics_updated`: the list row). The page has two inputs: the stored session documents on the patient's own hub, which it reads over HTTP and re-reads when a session has been stored (Signals in the patient detail), and the code the patient shows or prints (Signals in the imported view).

This holds for the clinic page, not for the hub's network. `GET /api/bedside/state` gives the current pulse and `physio` to the hub's own machine only, but `/ws/app` relays the current readings to any client that connects as the phone, and the stored documents have no login. Closing that needs a pairing token for the phone: not decided yet.

The code ("Show to my doctor", `demo/js/qrpayload.js`) carries three weekly numbers from the finger clips for its 8 weeks: pulse (bpm), breathing rate (per minute) and HRV as RMSSD (ms).

- Built in `hub/afferent_hub/qr.py` (`vitals_block`) from the `vitals` blocks of the stored sessions: per day the last played session, per week the median, as for the other measures. The pulse is the session mean of the fused finger pulse, with the clips on during play. It is not `morning_pulse`, which is the bedside morning reading of `daily.v1` and has no real source today.
- The recorder (`demo/js/record.js`) keeps a finger reading only when its reported quality is 0.3 or more; a weaker stretch is a gap. A session counts only when its finger block reports quality, that quality never fell below 0.3, and it has at least 10 s of readings; the clinic's Signals section applies the same rule to a stored session. A week without such a session has no value (never 0). Simulated sessions are used only when there is no measured one, and the number is then marked simulated.
- In the code they are map key 18, and the version stays 1. A code made before this still decodes (no key 18: "carries no finger sensor numbers"). A code made after it decodes in an older reader, which shows everything else and ignores key 18; the signature covers the whole body either way. New numbers go into a new key, never into `FEATURES`, whose fixed lengths older readers check.
- Size: at their largest the three rows add about 125 characters (the size of the whole code is under Face numbers below). Per-finger pulse is not in the code: two more rows would bring a code with every list at its cap past the cap. It is in the session documents and the export file.
- The printed page lists the same weekly numbers under the code.

### Face numbers in the handover

The code also carries three weekly face numbers for its 8 weeks: smiling (share of the time), blinks per minute and looking away (share of the time). Each is named by what the face did, never by a feeling.

- Built in `hub/afferent_hub/qr.py` (`face_block`) from the `vitals.face` block of the stored sessions, the same way as the finger numbers: per day the last played session with a value, per week the median. A session counts when it has at least 30 tracked seconds. The hub reads these three numbers from the face block and nothing else.
- Camera frames, images, face meshes and raw blendshape streams never leave the phone. The face numbers reach the patient's own hub only inside the session document at the end of a session, never in a live message. From the hub they leave only through this code: the patient detail (`GET /api/patients/{pid}`, `latest_session` and `sessions`), `GET /api/sessions/{sid}` and the Export file (`sessions.ndjson`) all leave `vitals.face` out (`views.without_face`, checked in `hub/tests/test_qr.py`).
- A week without a usable reading has no value: null, never 0 (a share of 0 is a value). Simulated sessions are used only when there is no measured one, and the number is then marked simulated.
- In the code they are map key 19, and the version stays 1. A code made before it still decodes ("carries no face numbers"). A code made after it decodes in the readers from before keys 18 and 19, which ignore them: `demo/tests/fixtures/` holds both older readers byte for byte, and `node demo/tests/qrpayload.test.js` decodes new codes with them, whole, in parts and with the face numbers left out.
- Size: with anna's lists the code with finger and face numbers is about 860 characters, version 19. With every list at its cap it is close to the cap of 1134 characters: about 1100 with anna's values, 1065 to 1134 with every field varied. A code over the cap leaves the face numbers out first, in about 1 of 60 varied codes in the test (how often depends on the values). The finger numbers, safety answers, talk requests and PHQ totals still fit in one code at version 22. Only a code that is still over the cap then cuts talk requests and PHQ totals, as before; safety answers are never dropped. `node demo/tests/qrpayload.test.js` prints the numbers.
- The sheet on the phone lists the face numbers before the code is made. When the code had no room for them, the code view, the printed page and the clinic say they were left out.

### Layout

- `demo/` the game and patient view (Capacitor web root)
- `hub/` FastAPI hub: API, analytics, clinic dashboard, bedside link
- `hub/afferent_hub/team/` teammates' hub code, copied byte-identical (never edit; source branch, commit and blob per file in `manifest.json`); glue in `hub/afferent_hub/team_adapters/`, features switched by `AFFERENT_TEAM_*` and `AFFERENT_DATA_MANAGER_URL`. Re-sync: `git fetch junction && (cd hub && .venv/bin/python -m afferent_hub.team_adapters.resync alex_hub)` (or `data_manager`)
- `contracts/` JSON schemas and fixtures shared by game and hub
- `design/` tokens, fonts and the final concept art
- `art/` image and music generation plans and `generate.py`
- `ios/App/`, `android/` Capacitor native projects (separate from the native `ios/Afferent` app)
