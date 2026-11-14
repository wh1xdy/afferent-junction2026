# afferent — Junction 2026

Two WendyOS boards working together over Wendy Net:

| Board | App | Role |
|---|---|---|
| NVIDIA Jetson Orin Nano | [`jetson/vision`](jetson/vision) | Logitech C920 + YOLOv8n on the GPU. Finds `modulino-hub` on the mesh, beeps when a person enters the frame. |
| NVIDIA Jetson Orin Nano | [`jetson/presence`](jetson/presence) | Wi-Fi (ARP) + BLE: is the patient home, outings, isolation alert, guest visits — mobility and social-withdrawal markers. See its README for deploy + test steps. |
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

## Heart-rate variability (HRV)

Full sensor API for the app: [`uno-q/SENSORS.md`](uno-q/SENSORS.md).


The UNO Q computes **RMSSD** (and SDNN, mean BPM) over the last 60 s of finger beats — the standard
short-term HRV / stress marker; lower than your own baseline = more stressed. Beats are re-timed at
the steepest point of each upstroke with sub-sample interpolation (the ADC runs at ~45 Hz, so a raw
beat time is only ±11 ms), and artefacts are dropped (off-period intervals, > 30 % off the local median = missed/double beats).
Synthetic check: true 14 / 47 / 86 ms → 20 / 48 / 93 ms. After 2 min it
also reports `vs_baseline` (relative to the median of your own readings). `GET /state` → `hrv`.

## Finger pulse over Bluetooth

Two PulseSensors: finger 1 on **A1**, finger 2 on **A2** (each `+` 3.3V, `-` GND), each with its
own beat detector (beep 880 Hz / 660 Hz, LED red / blue when `led_beat` is on).
The UNO Q advertises **"Afferent Finger"** with the standard BLE Heart Rate Service (0x180D,
measurement 0x2A37 = finger 1, body location = finger) plus a custom service `AFF0`/`AFF1`
carrying `[bpm finger 1, bpm finger 2, breaths/min, RMSSD ms]`, notified on every locked beat. The iPhone app
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

## HTTP

- UNO Q `modulino-hub` (mesh, port 18080): `GET /state` (knob, climate, `beat.bpm_live`, `pulse`),
  `GET /ppg` (raw 30 s), `POST /buzz?freq=880&ms=200`, `POST /heartbeat?on=0|1`,
  `POST /led?r=0&g=255&b=0&ms=500`
- Jetson `afferent-vision` (mesh, port 3005): web UI `/`, `GET /rppg` (camera + finger BPM), `GET /hub`, `POST /hub/buzz`

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

## Health-data hub (`jetson/hub`) — the patient's own

**The hub never talks to a doctor.** It sends nothing to anyone, and nobody but the patient can read it:
no clinician login, token, live view or chatbot. What a doctor sees is what the patient hands over in
person — the printed handover report, or the FHIR file the patient downloaded.

Local SQLite on the Jetson (persistent volume `afferent-data`); nothing leaves the hardware.
Collects the finger readings from the UNO Q over Wendy Net (pulse, HRV as RMSSD, breathing rate — only
while a finger is detected, and not while the two clips are on two different people), takes expression
sessions and PHQ-9 check-ins from the app, and shows the patient:

- `GET /report/handover?days=14` — **"Report for my doctor"**: the document the patient prints (or saves
  as a PDF from the print dialog) and hands over. PHQ-9 with item 9 flagged at the top, a short written
  summary, data coverage, daily trends (resting pulse, HRV, breathing rate) with last-7-vs-previous-7
  days, facial behaviour averages, and how every number is computed. No diagnosis. It says when it was
  generated, that it was "printed by the patient from their own device" and that the device sends
  nothing. Print CSS, no scripts, nothing to click; hints for the patient show on screen only.
- `GET /report/patient?days=7` — "Your week": the same period in plain words (numbers only, no reading of
  what they mean), with support lines if item 9 > 0 and a link to the handover report.
- `GET /fhir?days=14` — FHIR R4 Bundle as a **download** (`Content-Disposition: attachment`,
  `afferent-fhir-YYYY-MM-DD.json`) the patient can hand to a clinic: daily resting heart rate (LOINC
  40443-4), respiratory rate (9279-1), HRV RMSSD (local code — no LOINC exists), PHQ-9 total (44261-6)
  with the nine items as components and an item-9 risk note. Pseudonymous Patient, Device = finger clip.
- `GET /summary` (all numbers as JSON) · `POST /sessions` (exported session) · `POST /phq9 {"answers": [...]}`

**One access token, the patient's** — every route with patient data needs it (`jetson/hub/auth.py`).
On first start the hub generates it, stores it in the volume (`/data/hub-tokens.json`, mode 600) and
prints it to its log that one time. To choose it yourself, deploy with `--env AFFERENT_PATIENT_TOKEN=…`.
There is no second role. A token file from an older hub that still has a `clinician` entry keeps working
for the patient token; the clinician entry opens nothing and is dropped from the file at the next start.
`AFFERENT_CLINICIAN_TOKEN` is ignored (one log line says so).

```sh
wendy device logs afferent-hub --tail 200 --no-follow --device <jetson>    # the token, right after the first start
wendy net forward 8090:18090 --device <jetson>
curl -H "Authorization: Bearer $PATIENT" localhost:8090/summary
open "http://localhost:8090/report/handover?token=$PATIENT"                # browser: token → HttpOnly cookie → clean URL
curl -H "Authorization: Bearer $PATIENT" -OJ localhost:8090/fhir           # saves afferent-fhir-<date>.json
curl -H "Authorization: Bearer $PATIENT" -d '{"answers":[1,0,2,1,0,0,1,0,0]}' localhost:8090/phq9
```

APIs take `Authorization: Bearer <token>`. Only the two HTML reports also take `?token=`: the hub answers
with a cookie (12 h, report pages only, not the token itself) and redirects to the same URL without the
token. Missing or wrong token → 401. `/health` answers `{"ok": true}` to anyone, collector details with
the token. The hub speaks plain HTTP, so keep it on the mesh / a `wendy net forward`.

`?demo=1` (synthetic 14-day patient, built in memory per request) needs no token, is read-only and never
opens the real database. It is marked as simulated wherever it shows: a "SIMULATED DATA" box on both
reports (printed too, and without the "printed by the patient" line), `"simulated": true` in `/summary`,
`SIMULATED` in the FHIR file name and the HL7 test-data label `HTEST` on every resource in the bundle.

**Input rules** — a write can never break the reads. `ts` (optional) is unix time in **seconds**, at most
a day ahead of the hub's clock; milliseconds, strings and far-future times get a 400. `NaN`, `Infinity`
and `1e999` are not JSON here (400). In a session, `summary` / `cameraPulse` / `breathing` must be objects
and `events` a list of objects (400 otherwise); a single metric that is not a number is stored as missing.
PHQ-9 answers are nine integers 0–3. Entries an older hub stored with an unreadable timestamp are left
out of the numbers and counted in `summary.unreadable`; the handover report says so, and item 9 above 0
in such an entry is still raised. Anything else that fails inside the hub is answered with a 500 and one
log line (route, exception class, file:line — never the request's contents).

**Collector** — every 5 s the hub reads the UNO Q's `/state` (`store_state()` in `app.py`). While
`finger.two_hearts` is true (the two clips are on two different people, the Heart Duel party game) only
the room temperature is stored: that pulse, HRV and breathing are not the patient's. The skipped polls are
counted in `collector.skipped_two_people` (`/health` with the token). Firmware without the flag is stored
as before.

Tests: `cd jetson/hub && python3 -m unittest discover tests -v`.

**Summary in the handover report** — a fixed template, not a language model: PHQ-9 first → latest with
band and item 9, each 7-day trend with change and %, latest values where there is no trend yet,
facial-behaviour averages, coverage. Every statement carries its fact label and the text passes the
grounding check (every number must be in the fact it cites, direction words must agree with the numbers,
no judgement words). About 2 ms on a laptop (not yet timed on the Jetson).

**No chatbot** — there is no `POST /ask` any more (404), and the container no longer starts `llama-server`:
the image is `python:3.12-slim` + zeroconf and carries no model. That drops the Qwen2.5-3B file (2.10 GB)
and the llama.cpp base image (292 MB compressed for arm64) from the image, and at run time the loaded
model and the 4 of 6 CPU cores it was given. The new image has not been built or measured yet.
`grounding.py` stays in the hub as a module: the report uses `summary_text()`, and its other public
functions (`ask`, `check`, `build_facts`, `facts_text`, `direction_problem`, `safety_note`, `EVALUATIVE`)
are unchanged for code that imports it, but nothing in the hub reaches `ask()`.

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
