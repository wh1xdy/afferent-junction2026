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
- Game: http://localhost:8000/app/
- Patient view: http://localhost:8000/app/patient.html?patient=anna
- `?input=auto` (opt-in, never the default): autoplay story, only for unattended demos

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
- A fused pulse with reported quality below 0.3, or with no reported quality, is not shown, not recorded and does not drive the game. Quality is never invented; a missing value stays missing. The camera pulse (`rppg`) has the same 3 s rule, is its own number and never drives the game (below).
- With both paths live, the one that has a usable pulse is used, Bluetooth first. A Bluetooth reading without usable quality never hides the hub pulse.
- Real and simulated are never mixed inside a session. The session decides at its start: with a live sensor it uses real readings only, without one it runs on the simulated pulse to its end and clips put on later do not count in it, so put the clips on first. A frame the hub flags `simulated` has `source: simulated` on both sides, and anything simulated is marked in `simulated_fields`.
- The app first asks for Bluetooth when the patient opens Settings or Your signals or starts a session with the pulse stone switch on, not at launch.

For a new screen (or a Phaser scene) the whole sensor surface is `A.Finger` in `demo/js/finger.js` and `livePhysio()`, `pulse()` in `demo/js/sensors.js`; nothing else needs to know where the numbers come from. Sessions store them in the optional `vitals` blocks of `contracts/session.v3.schema.json`.

Camera pulse on the phone: the `AfferentPulse` plugin estimates the pulse from the front camera (POS rPPG, `ios/Afferent/FacePulse.swift` and `PulseEstimator.swift`, the reference app's own files compiled into the app), labelled `rppg`. It reads the frames of the app's one ARKit face session (`ios/App/App/FaceSession.swift`), the same session and the same delegate that give `AfferentEyes` its eyes and the face measures theirs; the session runs while any of the three wants it. Per frame it reads the skin patches inside the callback and keeps no frame; the estimate runs once a second off the frame queue. It runs while the phone camera switch is on and the app is visible (`demo/js/campulse.js`), needs ARKit face tracking, and sends one `pulse` event a second into `A.Sensors.feedNativePulse` with `source` (`rppg`), `bpm`, `quality` (the trust score / 100), `trust` {score, label, reasons} from the estimator unchanged, and `light` (mean skin luma, `dark`/`ok`/`bright`, the frame's exposure time; `iso` is null because ARKit does not give it). Without a reading `bpm`, `quality` and `trust` are null or absent, never 0. Rules: it is its own number ("Pulse, camera estimate" on Your signals, `vitals.camera_pulse` in the session), it never feeds `pulse()` and never drives the game, a reading counts for 3 s, and below trust 40 (the app's "unreliable") no bpm is shown or recorded. Exposure and white balance are locked 2.8 s after a start when the camera offers a lockable device; the ARKit face camera never does, so it then measures under auto exposure (`exposure: 'auto'` in the event) and starts its window over whenever the exposure time or offset moves. A second in which no new samples came in (face blown out, for example) sends no bpm instead of the last one (`AfferentPulseGate.swift`). Every event and `status()` say why there is no camera pulse when there is none (`reason`: `no_face`, `exposure_not_locked`, `too_dark`, `too_bright`, `moving`, `warming_up`, `weak_signal`, with `warmup_s_left` while waiting); the web layer has it as `A.Sensors.cameraWhy(now)`. The camera bpm and trust score are not in `live_metrics`: they reach the home hub only in the session document at the end of a session. Frames stay on the phone and are not stored. Estimator and gate tests: `cd ios/App/TeamTests && swift test`. There is one camera plugin, `AfferentPulse`, for the pulse and the face measures, and no second capture session. The app needs iOS 17, so every iPhone it runs on has an A12 chip or later, and Apple documents ARKit face tracking on those with or without a TrueDepth camera. Where face tracking is not supported (an iPad without a Neural Engine) "Your signals" says "Not available on this phone" for the camera pulse and the game falls back to touch.

Face measures from the phone camera: `A.Face` in `demo/js/face.js` starts them on the same `AfferentPulse` plugin (`faceStart`, `faceStop`, `faceStatus`; events `faceState`, `face` once a second, `micro` per brief facial movement) while the Phone camera setting is on and the app is visible. Pulse and face measures start and stop on their own. They need a TrueDepth camera: ARKit tracks faces without one, but the session says `arkit_truedepth`, so on such a phone the state is `unavailable`: no Face group and no `vitals.face`, while eyes and camera pulse still run. The measures are named by what the face does: smiling, facial movement, blinks, looking away, brief facial movements by face region, breathing from head motion. They are shown under Face on "Your signals" and stored per session in the optional `vitals.face` block; shares and rates are over tracked seconds and null below 30 of them. Camera frames, images, face meshes and the raw blendshape stream stay in the native layer; the web layer only gets the per-second numbers. The face numbers go to the patient's own home hub in the session document at the end of a session, like every other vitals block, and from there to a doctor only through the QR handover: the hub keeps them in its store, and its clinic routes (`/api/patients/{id}`, `/api/sessions/{id}`, the clinic export) leave the face block out. No face number is in a live message, and none drives the game. Without the plugin the app shows and stores nothing about faces. Tests: `node demo/tests/face.test.js`. The plugin's face half is `ios/App/App/FaceMeasures.swift`; the measures are the Swift package `ios/App/FaceCore` (`cd ios/App/FaceCore && swift test`), ported from `ios/Afferent`. Gaze calibration: `calibrationStart`, `calibrationPoint({ x, y, hold_ms })` once per dot, `calibrationFinish`, `calibrationStatus`, `calibrationClear`, documented at the top of `FaceMeasures.swift`. The fit is the reference app's (gain and offset per axis, stored under `afferent.gazeCalibration`), run on dots whose place on the glass is known: the screen's size comes from the panel's pixel count and the pixel density of the hardware model, not from an assumed size. A fit that is not good enough is reported and not stored.

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
- Size: at their largest the three rows add about 135 characters; the worst case is one code of about 1055 of 1134 characters, version 22, with no shrinking (`node demo/tests/qrpayload.test.js` prints the numbers). Per-finger pulse is not in the code: two more rows would bring the worst case to about 1125 of 1134. It is in the session documents and the export file.
- The printed page lists the same weekly numbers under the code.

### Talk transcripts on the hub

When a Talk conversation ends, the phone sends the transcript to the hub over the app link
(`{type: "transcript"}` on `/ws/app`) and keeps it in a local outbox until the hub acks it
(`demo/js/voice.js`). Audio itself only ever goes to Google while the conversation is open;
the transcript stays on the phone (last 20 conversations) and on the hub — nothing goes to
the clinic or the data manager.

The hub appends each transcript as **one JSON line** to a rotating log
(`hub/afferent_hub/transcripts.py`):

- Directory: `AFFERENT_TRANSCRIPTS_DIR`, default `hub/data/transcripts/` — next to
  `afferent.db` on the hub's disk (the Jetson when the hub runs there).
- Ring buffer: `transcript-000001.jsonl`, `transcript-000002.jsonl`, …; a new file starts
  past `AFFERENT_TRANSCRIPT_FILE_MB` (10 MB), and once the directory passes
  `AFFERENT_TRANSCRIPT_TOTAL_MB` (500 MB) the oldest files are removed — the current file
  is never removed.
- A resent `transcript_id` (ack lost on disconnect) is deduplicated in-process and the ack
  carries `duplicate: true`; the id also stays inside each row for post-hoc dedupe across
  a hub restart.

Each line is a self-contained record:

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

### Daily wellbeing read for the voice companion

Once a day the phone asks the hub how its patient seems to be doing — `{type: "voice_context"}`
on `/ws/app`, answered by `{type: "voice_context", ...}` — and anyone on the hub can read the
same thing at `GET /api/patients/{pid}/wellbeing` (`hub/afferent_hub/wellbeing.py`, wired in
`service.py`).

The answer:

```json
{"type": "voice_context", "patient_id": "anna", "date": "2026-11-15",
 "indicator": "bad", "suggest_doctor": true,
 "facts": ["skipped the morning practice on 4 of the last 7 days",
           "went outside on 0 of the last 5 days"]}
```

- `indicator` is `ok`, `watch` or `bad`, from the hub's own data: the analytics state
  (`check_in`/`booster` → bad, `watch` → watch) and the last PHQ-9 band (`moderate` or worse
  → bad, `mild` → watch, an overdue check-in → watch).
- `facts` are short clauses. The hub adds its own (missed practice, the last questionnaire);
  when the indicator is `bad` it also asks the data manager (`AFFERENT_DATA_MANAGER_URL`)
  for presence facts — outings, time at home and visitors over the last two weeks. Every
  sensor read is best-effort: a quiet data manager means fewer facts, never an error.
- `suggest_doctor` is `indicator == "bad"`.

The phone caches the answer for the day (`demo/js/voice.js`) and hands it to the voice relay
inside the auth message (`{auth, context}`); the relay (`voice-relay/main.py`) validates it
and appends it to the system instruction. So on a bad day the companion gently acknowledges
that things have not been easy, reminds the person the app and their care team are there
exactly for that, and suggests — once, without pushing — that they talk to their doctor.

### Home hub on the Jetson

The same hub as the Wendy app `afferent-home-hub` (`jetson/home_hub`): the hub, the real UNO Q as bedside and the data manager all run on the mesh. The Mac is needed only as the doorway for a browser or the phone (below).

- Deploy: `jetson/home_hub/deploy.sh`. It copies the tracked files of `hub/`, `demo/`, `contracts/`, `design/` (without test folders) into the git-ignored `stage/` and runs `wendy run`; an untracked file in those folders stops it. The SQLite database is on the volume `afferent-home-hub` and survives a redeploy. The image pins its packages (`jetson/home_hub/constraints.txt`) and runs the hub as a non-root user.
- Pairing token: every `/api/*` and `/ws/*` route except `/api/health` needs the hub token. The first deploy makes it in `~/.afferent/home-hub.token` (mode 600) and passes it to the app; it is never in the repo. `jetson/home_hub/pair.sh` prints the pairing link (it holds the token; open it, do not paste it anywhere). A browser opens the link once and gets a cookie; the phone app keeps the token in its hub address (`<ip>/k/<token>`). Requests from other web origins and DNS names are refused, and `/ws/bedside` is closed while the bedside is the UNO Q.
- Browser on the Mac: `wendy net forward 18000:18000 --device 169.254.246.159:50052` (keep it running), then open the link from `jetson/home_hub/pair.sh`: it lands on the patient view (`/app/patient.html`); the game is `/app/`. `/clinic/` shows only the simulated demo roster and scanned codes: the real patient reaches the clinic view only through the QR code she shows. The forward allows about 8 connections at once across all forwards, so keep to one browser tab.
- Phone: Personal Hotspot over the USB cable (mobile data on), so the Mac gets an address on the "iPhone USB" port. Terminal 1: the forward above. Terminal 2: `IP=$(ipconfig getifaddr en8); echo $IP; socat TCP-LISTEN:8000,bind=$IP,fork,reuseaddr TCP:127.0.0.1:18000`. Then `jetson/home_hub/pair.sh $IP` gives the Hub address for the app's Settings. The relay listens only on the cable link. Not yet tried end to end with the phone. Run `wendy auth refresh-certs` before a demo.
- Bedside: `AFFERENT_BEDSIDE=unoq:auto` finds the UNO Q over mDNS (`role=modulino-hub`, `.mesh.local.` host names only) and looks it up again when the link is lost. No simulator runs here.
- Data manager: `AFFERENT_DATA_MANAGER_URL=auto` finds it the same way (`role=data-manager`); one that answers is kept, and only the device in `AFFERENT_DATA_MANAGER_DEVICE` (default: this Jetson) is used, since the bearer token goes to it. The token comes from `AFFERENT_DATA_MANAGER_TOKEN` or `~/.afferent/data-manager.token` at deploy time. Routes: `/api/sensors/<name>`, `/api/patients/<id>/sensors/room`.
- Real and simulated: the patient `AFFERENT_BEDSIDE_PATIENT` (default `anna`, the id the app sends) starts empty with `simulated: false` and only ever holds what was recorded; before the first session the hub reports "Not enough data yet" and no state, also in the QR code. A session the app marks simulated marks that day and names the simulated fields. The other demo patients are seeded and marked Simulated. `AFFERENT_HOME_DEMO_ROSTER=0` leaves them out, and removes them if an earlier start seeded them; the real patient's data stays. `POST /api/demo/reset` and `/api/demo/profile` are refused here.
- Other values: `AFFERENT_HOME_PATIENT_NAME`, `AFFERENT_HOME_TMS_END` (YYYY-MM-DD, default the day of the first start), `AFFERENT_HUB_ORIGINS`, `AFFERENT_HUB_HOSTS`, `AFFERENT_TZ` (default `Europe/Helsinki`), `WENDY_DEVICE`.

### Layout

- `demo/` the game and patient view (Capacitor web root)
- `hub/` FastAPI hub: API, analytics, clinic dashboard, bedside link
- `hub/afferent_hub/team/` teammates' hub code, copied byte-identical (never edit; source branch, commit and blob per file in `manifest.json`); glue in `hub/afferent_hub/team_adapters/`, features switched by `AFFERENT_TEAM_*` and `AFFERENT_DATA_MANAGER_URL`. Re-sync: `git fetch junction && (cd hub && .venv/bin/python -m afferent_hub.team_adapters.resync alex_hub)` (or `data_manager`)
- `contracts/` JSON schemas and fixtures shared by game and hub
- `design/` tokens, fonts and the final concept art
- `art/` image and music generation plans and `generate.py`
- `ios/App/`, `android/` Capacitor native projects (separate from the native `ios/Afferent` app)
