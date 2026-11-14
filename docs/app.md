# The phone app in detail

The detail behind the "What the app does" part of the [README](../README.md). The web layer is `demo/`
(the Capacitor web root); the native plugins are in `ios/App/App/` and
`android/app/src/main/java/fi/junction/afferent/`.

## The demo hub and developer options

`./start.sh --reset` runs the hub (`hub/`) on port 8000 with the bedside simulator and a seeded,
simulated demo roster. It needs Python 3 and creates `hub/.venv` on the first run. `./start.sh --help`
lists the options:

| Option | What |
|---|---|
| `--no-sim` | no bedside simulator (bedside off) |
| `--serial /dev/tty…` | a real UNO Q over USB serial (115200 baud) |
| `--unoq URL` | a real UNO Q over its HTTP API, after `wendy net forward 18081:18080 --device <uno-q>`: `--unoq http://127.0.0.1:18081` |
| `--ws` | the bedside device connects to `/ws/bedside` itself |
| `--sim-pulse` | the bedside simulator also streams a pulse |
| `--reset` | drop the database and reseed the demo roster |
| `--port 8000` | another port (or `AFFERENT_PORT`) |

| URL | What |
|---|---|
| `http://localhost:8000/app/` | the game (touch input is the default) |
| `http://localhost:8000/app/patient.html?patient=anna` | the patient view: Today, Week, Share, Settings |
| `http://localhost:8000/clinic/` | the clinic dashboard: the simulated roster and scanned codes |

Reset the demo data right before going on stage: `./start.sh --reset`, or
`curl -X POST localhost:8000/api/demo/reset` (refused on the home hub).

Game query options: `patient=anna|juha|mikko|leena|sofia|eero`, `input=touch|camera|auto` (`auto` is an
autoplay story for unattended demos, opt-in only, never the default), `clock=morning|night`,
`profile=live|good_day|bad_day`, `stage=1` (60 s stage mode), `dev=1` (show the Developer section in
Settings).

In the native app the same switches are in Settings › Help and about › Developer, which is hidden from
patients: tap the version line at the bottom 7 times (or hold it) to show or hide it. It has Simulated
sensors, Signals during play, Input, Clock, Session and Day profile. Simulated sensors are off by default
on a phone and on in the browser; turn them on there for a demo without the finger clips.

## Real sensors in the app

The two finger clips on the UNO Q feed the app with pulse, per-finger pulse, breathing rate and HRV
(RMSSD), labelled `finger_ppg`. Two paths, same data:

- Phone, direct: the `AfferentFinger` plugin (iOS and Android, same calls and events) reads the UNO Q over
  Bluetooth ("Afferent Finger": Heart Rate Service `180D/2A37` = fused pulse; `AFF0/AFF1` = finger 1,
  finger 2, breaths/min, RMSSD ms, quality, presence, flags; `0` = no reading; RMSSD byte `255` = above
  254 ms, shown as no reading). The bytes are in [`uno-q/SENSORS.md`](../uno-q/SENSORS.md).
- Hub: `./start.sh --unoq http://127.0.0.1:18081` after `wendy net forward 18081:18080 --device <uno-q>`;
  the hub relays `physio` to the phone only. On the Jetson the home hub finds the UNO Q itself
  ([home-hub.md](home-hub.md)).

Nothing live goes to the clinic. The patient hands data over in person (a code that links to their
dashboard, a printed code or a file; see [handover.md](handover.md)).

Rules, the same on both paths:

- A reading counts for 3 s, counted from the age of the value. Presence and contact expire the same way
  when the sensor goes quiet.
- A fused pulse with reported quality below 0.3, or with no reported quality, is not shown, not recorded
  and does not drive the game. Quality is never invented; a missing value stays missing. The camera pulse
  (`rppg`) has the same 3 s rule, is its own number and never drives the game (below).
- With both paths live, the one that has a usable pulse is used, Bluetooth first. A Bluetooth reading
  without usable quality never hides the hub pulse.
- Real and simulated are never mixed inside a session. The session decides at its start: with a live
  sensor it uses real readings only, without one it runs on the simulated pulse to its end and clips put on
  later do not count in it, so put the clips on first. A frame the hub flags `simulated` has
  `source: simulated` on both sides, and anything simulated is marked in `simulated_fields`.
- While the box says two people wear the clips (AFF1 flag, or two clearly different per-clip rhythms), the
  fused pulse and the finger frame stay out of the session.
- The app first asks for Bluetooth when the patient opens Settings, Your signals or the clip check, or
  starts a session with the pulse stone switch on, not at launch.

For a new screen (or a game scene) the whole sensor surface is `A.Finger` in `demo/js/finger.js` and
`livePhysio()`, `pulse()` in `demo/js/sensors.js`; nothing else needs to know where the numbers come from.
Sessions store them in the optional `vitals` blocks of `contracts/session.v3.schema.json`.

### Camera pulse on the phone

The `AfferentPulse` plugin estimates the pulse from the front camera (POS rPPG,
`ios/Afferent/FacePulse.swift` and `PulseEstimator.swift`, the reference app's own files compiled into the
app), labelled `rppg`. It reads the frames of the app's one ARKit face session
(`ios/App/App/FaceSession.swift`), the same session and delegate that give `AfferentEyes` its eyes and the
face measures theirs; the session runs while any of the three wants it. Per frame it reads the skin
patches inside the callback and keeps no frame; the estimate runs once a second off the frame queue. It
runs while the phone camera switch is on and the app is visible (`demo/js/campulse.js`), needs ARKit face
tracking, and sends one `pulse` event a second into `A.Sensors.feedNativePulse` with `source` (`rppg`),
`bpm`, `quality` (the trust score / 100), `trust` {score, label, reasons} and `light` (mean skin luma,
`dark`/`ok`/`bright`, the frame's exposure time). Without a reading `bpm`, `quality` and `trust` are null or
absent, never 0.

- It is its own number ("Pulse, camera estimate" on Your signals, `vitals.camera_pulse` in the session); it
  never feeds `pulse()` and never drives the game. A reading counts for 3 s, and below trust 40 (the app's
  "unreliable") no bpm is shown or recorded.
- Exposure and white balance are locked 2.8 s after a start when the camera offers a lockable device; the
  ARKit face camera never does, so it then measures under auto exposure (`exposure: 'auto'`) and starts its
  window over whenever the exposure moves. A second without new samples sends no bpm instead of the last
  one (`AfferentPulseGate.swift`).
- Every event and `status()` say why there is no camera pulse when there is none (`reason`: `no_face`,
  `exposure_not_locked`, `too_dark`, `too_bright`, `moving`, `warming_up`, `weak_signal`); the web layer
  has it as `A.Sensors.cameraWhy(now)`.
- The camera bpm and trust score are not in `live_metrics`: they reach the home hub only in the session
  document at the end of a session. Frames stay on the phone and are not stored.
- The app needs iOS 17 (A12 or later). Where face tracking is not supported, "Your signals" says "Not
  available on this phone" and the game falls back to touch.
- Tests: `cd ios/App/TeamTests && swift test`.

### Face measures from the phone camera

`A.Face` in `demo/js/face.js` starts them on the same `AfferentPulse` plugin (`faceStart`, `faceStop`,
`faceStatus`; events `faceState`, `face` once a second, `micro` per brief facial movement) while the Phone
camera setting is on and the app is visible. They need a TrueDepth camera; without one the state is
`unavailable` (no Face group, no `vitals.face`), while eyes and camera pulse still run.

- The measures are named by what the face does: smiling, facial movement, blinks, looking away, brief
  facial movements by face region, breathing from head motion. Shares and rates are over tracked seconds
  and null below 30 of them. They show under Face on "Your signals" and are stored per session in the
  optional `vitals.face` block.
- Camera frames, images, face meshes and the raw blendshape stream stay in the native layer; the web layer
  only gets the per-second numbers. The face numbers reach the patient's own home hub in the session
  document, and a doctor only through the QR handover: the hub's clinic routes (`/api/patients/{id}`,
  `/api/sessions/{id}`, the clinic export) leave the face block out. No face number is in a live message,
  and none drives the game.
- Gaze calibration: `calibrationStart`, `calibrationPoint({ x, y, hold_ms })` once per dot,
  `calibrationFinish`, `calibrationStatus`, `calibrationClear`, documented at the top of
  `ios/App/App/FaceMeasures.swift`. A fit that is not good enough is reported and not stored.
- Code: `ios/App/App/FaceMeasures.swift` and the Swift package `ios/App/FaceCore` (ported from
  `ios/Afferent`). Tests: `node demo/tests/face.test.js`, `cd ios/App/FaceCore && swift test`.

### Breathing task

While the clips give a real breathing rate that is at most 3 s old, the task draws a ring around the guide
and one line ("You: 9 breaths a minute · Guide: 6"); without one the task is unchanged, and Settings ›
Sensors › Breathing pace turns it off. The sensor derives the rate from its last 40 s of heart rhythm, so
it describes a pace, not a breath; the average shown after the task, on "Your signals" and in
`tasks[].extra.breathing` covers the task and the 40 s before it. Logic in `demo/js/breathing.js`, tests in
`demo/tests/breathing.test.js`.

### Clip check

`demo/js/clipcheck.js`, `demo/css/clipcheck.css`. Before a session the app says "Put a finger in each
clip", shows a live check of the clips (which clip reads, a signal meter, the pulse) and a clear OK, and
offers the camera pulse when the clips give nothing (no box after 10 s, no reading after 12 s, never a
steady pulse after 25 s, or at once when Bluetooth or the clips are off).

- OK means a real reading through the app's own gate: `A.Breathing.reading` of `A.Sensors.fingerFrame`
  (finger_ppg, not simulated, finger detected, quality reported and at least 0.3, at most 3 s old) with a
  pulse, or a trusted camera pulse from `A.Sensors.cameraPulse`. A simulated frame never passes and no
  reading is not OK. The two pulses are shown side by side, never merged.
- It opens when the lantern is kindled and the clips give no pulse yet (the patient can begin anyway or
  step back; Settings › Sessions › Ask before each session turns the question off), once on first run as an
  offer on the start screen, and from Settings › Sessions › Check the finger clips. It runs before
  `A.startSession` (`main.js`), never inside a session.
- Nothing is sent: this phone keeps only the outcome (`afferent.clipcheck`: OK or not, clips or camera,
  when) for the Settings line. Tests: `node demo/tests/clipcheck.test.js`.

### What the app claims matches the hardware

The "pulse stone" is the two finger clips, the "bedside light" is one small LED, and there is no bed
sensor, so the `presence` switch is always off and never offered (`demo/tests/hardware.test.js`).

### Home and visitors on the phone

`AfferentPresence` plugin with `demo/js/presence-core.js` (ported from `jetson/presence`). Off unless the
patient turns it on. The bedside unit heard over Bluetooth means home; its silence means "could not look",
so leaving home is only decided when the saved home Wi-Fi (two devices or more) is gone too. Learning who
is usually around counts watched time only: app open and Bluetooth on.

## Room climate

The bedside unit's Modulino Thermo measures the bedroom's temperature and humidity. It reaches the phone
through the home hub, not over Bluetooth: the finger clips' packet carries no room climate.

- **Live, to the phone.** The hub turns every `thermo` event from the bedside source (UNO Q `/state`
  `climate`, about once a minute; or the simulator) into a `room` message for the app of the patient the
  unit belongs to: `{ temp_c, humidity_pct, source: "modulino_thermo" | "simulated", simulated, age_s }`,
  and sends the last one right after `hello`. Nothing goes to the clinic socket. On the phone
  `A.Sensors.room(now)` gives `{ celsius, humidity, source, at }` only for a measured reading at most 150 s
  old, never a simulated one (`A.Sensors.roomFrame(now)` includes simulated ones, which "Your signals"
  shows labelled). The live vitals line is `A.Room.line(A.Sensors.room(now))`: "Room 21.5 °C · 40 %".
- **One gentle response.** At night, on the start screen before the wind-down games, a measured room
  warmer than 19.5 °C gets one quiet line: "Your room is 22.5 °C tonight. Sleep often comes more easily a
  little cooler, around 16 to 19 °C." Nothing else changes and nothing is asked of the patient
  (`demo/js/room.js`). The session records the measured room in `context.room_temp_c`.
- **Over the weeks.** The UNO Q hands the data manager one mean per minute (`env.temperature_c`,
  `env.humidity_pct`, source `modulino-hub`). The hub reads them as hourly buckets and takes the night of
  each date, 23:00 to 07:00, when at least 4 of its 8 hours have a reading (`hub/afferent_hub/room.py`).
  Without the data manager, and for the demo roster, the daily records' own `room` fields are used and
  marked simulated where the record says so.
- **Patient view** (Week tab, "At your bedside at night"): each night of the week, the typical night and the
  16 to 19 °C band. **Shared dashboard** (Share, `demo/js/qrexport.js`): a "Bedroom at night (8 weeks)" card
  with the weekly medians of the night temperature and humidity, the nights with a reading and the
  simulated mark, from `GET /api/patients/<id>/room-nights`. The "Show to my doctor" link opens this same
  dashboard, room card included. It is context next to the vitals, not part of the index.

## Android

- Toolchain, before any Gradle or adb command (JDK 21 and the Android SDK from Homebrew;
  `android/local.properties` with `sdk.dir=` also works and is never committed):

  ```sh
  export JAVA_HOME=/opt/homebrew/opt/openjdk@21; export ANDROID_HOME=/opt/homebrew/share/android-commandlinetools
  export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$PATH"
  ```

- After a change in `demo/`, `npm run sync` first, or the APK carries the old web layer.
- Native, with the same plugin names, calls and events as on iOS: `AfferentFinger` (the finger clips over
  Bluetooth) and `AfferentPresence` (Home and visitors), plus `AfferentHaptics`. The morning reminder comes
  from the Capacitor npm plugin. Both Bluetooth plugins stop scanning and let go of the board a few seconds
  after the app leaves the foreground and look again when it is back.
- Not available on Android: ARKit and the TrueDepth camera. Eye input uses the front camera with the
  MediaPipe model bundled in the app (`demo/vendor/mediapipe/`, no network, source `mediapipe`); what it
  cannot measure arrives as "not available" (null), never as zero.
- Tests: `cd android && ./gradlew testDebugUnitTest`. CI builds a debug APK on every app change. Per the
  last notes, the Android app has not yet been run on a phone against the UNO Q.
