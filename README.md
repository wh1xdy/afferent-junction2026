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
  Screening support, not a diagnosis.

Tuned on recorded sessions: real ARKit names are `mouthSmile_L/_R` (the first build read 0 for every
left/right shape); a slight smile is only +0.05–0.09; looking away read 5–65°; paced breathing at
6/min was recovered by both breathing sources.

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

### Real sensors in the app

The two finger clips on the UNO Q feed the app with pulse, breathing rate and HRV (RMSSD), labelled `finger_ppg`. Two paths, same data:

- Phone, direct: the `AfferentFinger` plugin reads the UNO Q over Bluetooth ("Afferent Finger": Heart Rate Service `180D/2A37` = fused pulse; `AFF0/AFF1` = finger 1, finger 2, breaths/min, RMSSD ms, quality, presence; `0` = no reading).
- Hub: `./start.sh --unoq http://127.0.0.1:18081` after `wendy net forward 18081:18080 --device <uno-q>`; the hub relays `physio` to the phone and the clinic view.

Rules: a reading counts for 3 s, quality is never invented, real and simulated are never mixed inside a session, and anything simulated is marked in `simulated_fields`. For a new screen (or a Phaser scene) the whole sensor surface is `A.Finger` in `demo/js/finger.js` and `livePhysio()`, `pulse()` in `demo/js/sensors.js`; nothing else needs to know where the numbers come from. Sessions store them in the optional `vitals` blocks of `contracts/session.v3.schema.json`; the clinic view shows them under Signals.

Camera pulse on the phone: the `AfferentPulse` plugin estimates the pulse from the front camera (POS rPPG, `ios/App/App/Team/FacePulse.swift` and `PulseEstimator.swift`, copies of `ios/Afferent`), labelled `rppg`. It reads the frames of the ARKit face session: the one `AfferentEyes` runs during a camera session, or its own when the eyes are off, so both work at the same time. It runs while the phone camera switch is on and the app is visible (`demo/js/campulse.js`), needs a TrueDepth camera, and sends one event a second with `bpm` and the trust score 0 to 100 from the estimator, unchanged. Rules: it is its own number ("Pulse, camera estimate" on Your signals, `vitals.camera_pulse` in the session), it never feeds `pulse()` and never drives the game, a reading counts for 3 s, and below trust 40 (the app's "unreliable") no bpm is shown or recorded. Frames stay on the phone and are not stored. Estimator tests: `cd ios/App/TeamTests && swift test`.

Home and visitors on the phone: `AfferentPresence` plugin with `demo/js/presence-core.js` (ported from `jetson/presence`).

### Layout

- `demo/` the game and patient view (Capacitor web root)
- `hub/` FastAPI hub: API, analytics, clinic dashboard, bedside link
- `hub/afferent_hub/team/` teammates' hub code, copied byte-identical (never edit; source branch, commit and blob per file in `manifest.json`); glue in `hub/afferent_hub/team_adapters/`, features switched by `AFFERENT_TEAM_*` and `AFFERENT_DATA_MANAGER_URL`. Re-sync: `git fetch junction && (cd hub && .venv/bin/python -m afferent_hub.team_adapters.resync alex_hub)` (or `data_manager`)
- `contracts/` JSON schemas and fixtures shared by game and hub
- `design/` tokens, fonts and the final concept art
- `art/` image and music generation plans and `generate.py`
- `ios/App/`, `android/` Capacitor native projects (separate from the native `ios/Afferent` app)
