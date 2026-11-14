# The boards, the camera app and the reference iPhone app

How the two WendyOS boards were first set up, the Jetson camera app (`jetson/vision`), the patient's own
health-data hub (`jetson/hub`) and the native reference iPhone app (`ios/Afferent`). This was the
README's first part. For what the sensor box sends today, [`uno-q/SENSORS.md`](../uno-q/SENSORS.md) is
the reference: it supersedes the Bluetooth layout and the beep defaults below.

## Two boards over Wendy Net

| Board | App | Role |
|---|---|---|
| NVIDIA Jetson Orin Nano | [`jetson/vision`](../jetson/vision) | Logitech C920 + YOLOv8n on the GPU. Finds `modulino-hub` on the mesh, beeps when a person enters the frame. Camera pulse (rPPG). |
| NVIDIA Jetson Orin Nano | [`jetson/presence`](../jetson/presence) | Wi-Fi (ARP) + BLE: is the patient home, outings, isolation alert, guest visits (mobility and social-withdrawal markers). Deploy and test steps in its README. |
| NVIDIA Jetson Orin Nano | [`jetson/data_manager`](../jetson/data_manager) | Long-running SQLite store for every sensor: apps push samples and intervals over HTTP; the API serves raw data, daily aggregates, trends and baseline deviations. [API guide](../jetson/data_manager/API.md). |
| Arduino UNO Q | [`uno-q/modulino-hub`](../uno-q/modulino-hub) | STM32 sketch reads Modulino Knob + Thermo and two PulseSensors (A1, A2), drives the Buzzer and a KY-016 RGB LED; the Linux side bridges them to an HTTP service on the mesh and to Bluetooth. |

```
 C920 ─► Jetson: YOLO ──"person"──► Wendy Net (BLE / USB via Mac) ──► UNO Q Linux ──Bridge──► STM32 ──Qwiic──► Buzzer
                   ▲                                                       │
                   └──── knob position → confidence, knob press → arm ─────┘  (+ Thermo °C / %RH)
```

Both boards are enrolled in the same Wendy Cloud org with Wendy Net enabled
(`wendy net configure --participate=true --ethernet=true --infrastructure-wifi=true --ble=true`).

```sh
# UNO Q: compiles + flashes the STM32 sketch, then deploys the Linux app
cd uno-q/modulino-hub && wendy run --device <uno-q> --detach --yes

# Jetson camera app
cd jetson/vision && wendy run --device <jetson> --detach --yes
```

The apps use `"mode": "mesh"` networking, so their ports are reachable only inside Wendy Net (use
`wendy net forward` from a laptop). The sensor box needs the data manager's address and token at deploy
time; see the README ("Sensor box").

### Team access

Both boards are enrolled in our Wendy Cloud org, so any org member can reach them from anywhere, with no
USB cable or shared Wi-Fi:

```sh
curl -fsSL https://install.wendy.dev/cli.sh | bash   # install the CLI
wendy auth login                                     # sign in with your invited account
wendy cloud discover                                 # lists `jetson` and `uno-q` with cloud:// selectors

JETSON='cloud://api.wendy.dev:443/tenant/e064d3cd-1e43-45af-adf2-37b0afe5e3da/asset/149628ce-6c13-44b8-9b2a-ec527e20caf7'
UNOQ='cloud://api.wendy.dev:443/tenant/e064d3cd-1e43-45af-adf2-37b0afe5e3da/asset/a933500b-ab5a-4086-a2cc-a68ec015719a'

wendy --device "$UNOQ" device apps list
```

When plugged in over USB-C, `wendy discover` finds the boards directly (faster deploys).

### Notes

- Modulinos sit on the STM32's Qwiic bus; Linux reaches them only through `arduino-bridge`.
- The sketch profile in `sketch.yaml` must list every library dependency explicitly.
- Hackathon Wi-Fi isolates clients, so the boards talk over BLE (or USB through the laptop).
- `jetson/vision` is based on Wendy's `camera-feed-yolo` template (JetPack 7 CUDA fix included).

## Heartbeat on the UNO Q

PulseSensor on A1 (`+` 3.3V, `-` GND; never 5V, the output would exceed the ADC input), the second on A2.
In the printed fingertip clip: firm enough not to move, not so tight it blocks blood flow.

- The STM32 samples at ~45 Hz (14-bit) and detects each beat from the steep upstroke.
- Linux computes the pulse period by autocorrelation every second and sends it back; the sketch ignores the
  dicrotic second bump (half a period) and only beeps or flashes once the period is reliable, so it stays
  silent without a finger.
- The KY-016 LED (`R` D9, `G` D10, `B` D11, `-` GND) can flash per beat (`POST /led/beat?on=1`). The
  heartbeat beep is off by default in the current sketch (`POST /heartbeat?on=1` turns it on). Verified
  against a smartwatch (75–85 vs 72–76 BPM).

## Camera pulse on the Jetson (rPPG)

The Jetson estimates heart rate contact-free from the C920 (`cam1`, also used for YOLO), with an optional
second camera (the Arduino USB Camera, `cam2`, `/dev/video2`, 1280x720). Per camera: YOLOv8n-pose finds the
eyes, forehead + cheeks are averaged (skin pixels only) at 20 Hz, and POS (Wang et al. 2017) on the last
10 s gives the dominant frequency in 45–180 BPM. With two cameras the spectra are fused, weighted by each
camera's SNR. Auto exposure, white balance and focus are locked (50 Hz mains), and gain follows the face
brightness (no clipping).

Validated against the finger sensor (same person, ~35 s, 12 readings): fused camera 76–83 BPM vs finger
76–84 BPM, mean absolute difference 1.8 BPM, max 4 BPM.

Requirements: a still face, 0.5–1 m away, lit by white light. Coloured (purple) stage lighting has almost
no green, where the pulse signal lives. `snr` below 0 dB means "don't trust it". Keep the heartbeat LED
off (`POST /led/beat?on=0`, the default): a light flashing at heart rate on the face fakes the result.

Diagnostics: `GET /rppg` (per-camera skin pixels, brightness, clipping, gain) and
`GET /rppg/frame?cam=cam1|cam2` (latest frame with the measured skin regions drawn).

Open the UI (no display needed):

```sh
wendy net forward 3005:3005 --device <jetson>   # keep running
open http://localhost:3005
```

### Knob controls (first setup)

The knob may be unplugged inside the newer case.

- Turn the knob: YOLO confidence threshold (0.40 at position 0, ±0.01 per click).
- Press the knob: arm or disarm the person alarm (high beep = armed, low beep = disarmed).
- A person entering the frame while armed → 988 Hz beep (3 s cooldown).

## HTTP on the mesh

- UNO Q `modulino-hub` (port 18080): `GET /state`, `GET /ppg`, `POST /buzz?freq=880&ms=200`,
  `POST /heartbeat?on=0|1`, `POST /led?r=0&g=255&b=0&ms=500`, more in
  [`uno-q/SENSORS.md`](../uno-q/SENSORS.md).
- Jetson `afferent-vision` (port 3005): web UI `/`, `GET /rppg` (camera + finger BPM), `GET /hub`,
  `POST /hub/buzz`.
- Jetson `afferent-data-manager` (port 8100): `POST /api/v1/samples`, `POST /api/v1/events`,
  `GET /api/v1/latest|daily|stats|trend|baseline|…`; see [its API guide](../jetson/data_manager/API.md).
- Jetson `afferent-home-hub` (port 18000): see [home-hub.md](home-hub.md).

## Health-data hub (`jetson/hub`), the patient's own

**This hub never talks to a doctor.** It sends nothing to anyone and only the patient can read it: no
clinician login, token, live view or chatbot. A doctor sees what the patient hands over in person, the
printed handover report or the FHIR file the patient downloaded. Its report and FHIR code are also used
by the home hub (`hub/afferent_hub/team/alex_hub`, see [home-hub.md](home-hub.md)).

Local SQLite on the Jetson (persistent volume `afferent-data`). It collects the finger readings from the
UNO Q over Wendy Net and takes expression sessions and PHQ-9 check-ins from the app.

- `GET /report/handover?days=14`: "Report for my doctor", the page the patient prints. PHQ-9 with item 9 at
  the top, a fixed-template summary (no language model), coverage, daily trends for resting pulse, HRV
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

Collector (`store_state()` in `app.py`), every 5 s from the UNO Q's `/state`. Only what was measured on the
patient just now is stored, labelled `finger_ppg`; the rest stays missing, never 0:

- pulse: presence `active`, quality reported and at least 0.3, newest beat at most 3 s old. Otherwise it
  is counted in `collector.skipped_low_quality` or `skipped_stale` and not stored.
- HRV and breathing rate: only after 6 s of presence `active`.
- nothing from the fingers while the two clips are on two different people (`finger.two_hearts`).

Tests: `cd jetson/hub && python3 -m unittest discover tests`. The collector rules have run in tests only,
not against the UNO Q.

## Reference iPhone app (`ios/Afferent`)

A native SwiftUI app, separate from the Capacitor app in `ios/App`. On-device, nothing leaves the phone.
Setup in [`ios/README.md`](../ios/README.md). Three tabs:

- **Pulse:** camera pulse (POS + trust score) with the screen as a variable light, plus the finger reading
  from the UNO Q over Bluetooth (fused value, per-sensor detail, Δ to the camera).
- **Expressions:** 60 s ARKit/TrueDepth session: 52 blendshapes at 60 Hz → smile, sadness, frown/anger,
  disgust, surprise, contempt as FACS-style composites; micro-expressions (40–500 ms) against the person's
  own baseline; blinks, gaze shifts, looking away (with per-person gaze calibration); camera pulse pinned
  to the 3D face mesh; breathing rate (from the finger sensors, else TrueDepth head motion). Sessions
  export as JSON → `ios/tools/analyze_session.py`.
- **Check-in:** PHQ-9 with crisis resources. Support for follow-up, not a diagnosis.

Tuned on recorded sessions: real ARKit names are `mouthSmile_L/_R`; a slight smile is only +0.05–0.09;
looking away read 5–65°; paced breathing at 6/min was recovered by both breathing sources. Its pulse
estimator and face code were later ported into the Capacitor app ([app.md](app.md)).

## Laptop posture POC

[`posture-analysis/posture`](../posture-analysis/posture): Dockerised webcam pipeline for posture, gait and
facial-expressivity markers (SQLite aggregates, FastAPI dashboard). See its README for setup; the project
plan is in [plan_posture_depression.md](plan_posture_depression.md).
