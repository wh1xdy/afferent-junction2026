# Alex's side: what exists

As of Saturday 14 November, afternoon.

## On main and running

1. **Sensor box (UNO Q)**, `uno-q/modulino-hub`
   - Two finger clips give one fused pulse, pulse per finger, breathing rate (from heart rhythm), HRV (RMSSD), signal quality, and whether a finger is present. Also room temperature and humidity, a knob, one RGB LED, a buzzer.
   - Bluetooth "Afferent Finger": `180D/2A37` = fused pulse. `AFF0/AFF1` = 6 bytes: finger 1 BPM, finger 2 BPM, breaths/min, RMSSD ms, quality % (255 = none), presence (1 idle, 2 probing, 3 active). 0 = no reading.
   - HTTP on the mesh, port 18080: `GET /state`, `POST /led`, `/heartbeat`, `/presence`, `/sensor`, `/buzz`.
   - Sends to the data manager, source `modulino-hub`: `vitals.heart_rate_bpm` (with quality, once a second), `vitals.hrv_rmssd_ms`, `vitals.breathing_rate_per_min`, `env.temperature_c`, `env.humidity_pct`.
   - Deploy needs `DATA_MANAGER_TOKEN` passed at deploy time (Alex has it). Details in `uno-q/SENSORS.md`.

2. **Sensors inside David's app** (PR #7)
   - iOS plugin `AfferentFinger` reads the clips over Bluetooth. Web side: `demo/js/finger.js`, intake in `demo/js/sensors.js`, the "Your signals" sheet.
   - Sessions record the numbers in the optional `vitals` blocks of `contracts/session.v3`.
   - David's hub can use the real box: `./start.sh --unoq <url>` (`hub/afferent_hub/bedside/unoq_http.py`).
   - Home and visitors on the phone: plugin `AfferentPresence` and `demo/js/presence-core.js` (ported from `jetson/presence`).
   - Seen working on an iPhone 14 Pro: pulse, both fingers, breathing, HRV.

3. **Data manager on the Jetson**: Wameuh's code, deployed by us, mesh port 8100, token required. It is receiving rows from the sensor box. Please do not deploy a second copy.

4. **`jetson/hub`**: patient report and FHIR file. The version on the Jetson is newer than main and is about to be replaced by a patient-only version (no doctor login, no chatbot).

5. **`fun/heart-duel`**: two-player pulse game for the demo table. Not yet tried with two people.

## Built, not merged yet (coming as PRs)

- Android: Kotlin versions of `AfferentFinger` and `AfferentPresence`, and the camera path. The APK builds; it has never run on a phone.
- Camera pulse in the app (plugin `AfferentPulse`), and face measures: smiling, facial movement, blinks, looking away, brief movements by face region, breathing from depth.
- HRV and breathing in the QR handover; a breathing circle that reacts to measured breathing; settings text that matches the real hardware; review fixes for #7.
- David's hub packaged to run on the Jetson as the home hub (in progress).

## Rules our code follows (please keep them)

- Nothing is sent or streamed to a doctor. The patient hands data over (QR code or print).
- Finger data is labelled `finger_ppg`. A reading counts for 3 s. Quality below 0.3, or no quality, is not a measurement. Missing stays missing, never 0. No pulse for the first ~5 s after the clips go on.
- Simulated data is never shown or stored as real.
- Hardware that exists: two finger clips, one small LED, a knob, a thermometer, a buzzer, a Jetson with one camera. There is no bed sensor.
