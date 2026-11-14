# Bug burn-down: native (android/app/src, ios/App/App, ios/Afferent, capacitor.config.json)

Branch `burndown/native`, from `fix/bug-burndown` @ 4daecf6.

## Toolchain

- **Android:** JDK 25 (Temurin) is installed; **no Android SDK** (`ANDROID_HOME` unset, no `local.properties`,
  no SDK under `%LOCALAPPDATA%\Android`), so `./gradlew testDebugUnitTest` cannot run. The tests that need no Android or
  Capacitor class were compiled and run instead with the Kotlin compiler bundled with IntelliJ IDEA and JUnit 4.12 from `~/.m2`:

  ```
  kotlinc -cp junit-4.12.jar;hamcrest-core-1.3.jar -d out \
    main/.../AfferentFingerParser.kt AfferentFingerLink.kt ScanBudget.kt HapticShapes.kt \
    test/.../AfferentFingerLinkTest.kt HapticShapesTest.kt
  java -cp out;junit;hamcrest;kotlin-stdlib.jar org.junit.runner.JUnitCore \
    fi.junction.afferent.AfferentFingerLinkTest fi.junction.afferent.HapticShapesTest
  ```
  Result: **OK (63 tests)** (no Android file was changed). `AfferentFingerParserTest`, `AfferentPresenceCoreTest`,
  `PluginSetupTest` and `CameraPathTest` need `org.json` / Capacitor jars, which are not on this machine: not run.
- **iOS:** no Xcode on Windows. Every iOS fix below is **statically verified only** (traced against the CoreBluetooth /
  Core Haptics / AVFoundation contracts, the Android twin and the JS caller).
- `node demo/tests/haptics.test.js`: 13 ok, 0 failed (before and after).

## Summary

| # | Bug | File | Severity | Status |
|---|-----|------|----------|--------|
| 1 | `AfferentEyes.start()` resolves with the camera denied: camera input runs with no eyes and no touch fallback | ios/App/App/AfferentEyes.swift | High | Fixed (static only) |
| 2 | iOS finger: a refused `setNotifyValue` leaves the link "connected" with no readings forever | ios/App/App/AfferentFinger.swift | Medium | Fixed (static only) |
| 3 | Core Haptics `resetHandler` / `stoppedHandler` write main-queue state from an internal queue | ios/App/App/AfferentHaptics.swift | Medium | Fixed (static only) |
| 4 | Prototype `FingerSensor` reads stored values and ignores errors, stamping old values as fresh | ios/Afferent/FingerSensor.swift | Medium | Fixed (static only) |

## Details

### 1. AfferentEyes ignores the camera permission (High, fixed)
- **Reproduce (traced):** iOS, camera denied for the app (Settings > Afferent > Camera off). Start a session with input
  "camera": `main.js begin()` -> `Sensors.startCamera()` -> `start('arkit')` -> `AfferentEyes.start`. The plugin only checked
  `FaceSession.supported`, held the face session and resolved. ARKit then fails (`cameraUnauthorized`),
  `FaceSession.session(_:didFailWithError:)` retries three times and gives up; no `eyes` event ever comes. Because `start()`
  resolved, the `catch` in `begin()` that switches to touch input (`A.Input.mode = 'touch'`) never runs: the session runs in
  camera mode with `tracked: false` for its whole length. The same happens when the person refuses the first camera prompt
  (ARKit showed it after `start()` had already resolved).
- **Root cause:** unlike `AfferentPulse.start` and `FaceMeasures.start`, `AfferentEyes.start` never looked at
  `AVCaptureDevice.authorizationStatus`.
- **Fix:** the same flow as `AfferentPulse.start`: authorized -> hold and resolve; not determined -> `requestAccess`, then hold
  and resolve, or reject `'unauthorized'` (a `stop()` during the prompt is respected through `wanted`); denied/restricted ->
  reject `'unauthorized'`. The web layer's existing catch then falls back to touch.
- **Verification:** static only (no Xcode).

### 2. iOS finger: refused notification subscription is never handled (Medium, fixed)
- **Reproduce (traced):** after `didDiscoverCharacteristicsFor`, the plugin calls `setNotifyValue(true)` on 2A37 and AFF1.
  If the board answers the CCCD write with an error, CoreBluetooth reports it only through
  `peripheral(_:didUpdateNotificationStateFor:error:)`, which the plugin did not implement. State stays `"connected"`,
  no `reading` event comes, and nothing disconnects or times out (the connect timeout was cancelled at service discovery),
  so the link never recovers until the board drops the connection. The Android twin handles the same case
  (`AfferentFingerLink.onSubscribed(false)` -> `drop()`; covered by `aRefusedNotificationRequestStartsOver`).
- **Root cause:** missing delegate method. Also `discoveryFailures` was cleared as soon as services were found, so with only a
  drop added, a board that always refuses would be reconnected in a tight loop with no limit.
- **Fix:** implement `didUpdateNotificationStateFor`: an error on 2A37/AFF1 -> `drop(p, ignore: false)` (cancel, counted, look
  again); success with `isNotifying` -> clear the failure count. The count is no longer cleared at service discovery, so it is
  cleared when the link is actually set up, as on Android (`subscribeNext` clears `setupFailures` after the last subscription).
  Three failed setups in a row -> ignored until `stop()`, the existing iOS rule.
- **Verification:** static only.

### 3. Core Haptics handlers race the main queue (Medium, fixed)
- **Reproduce (traced):** `CHHapticEngine.resetHandler` and `stoppedHandler` are called by Core Haptics on its own internal
  queue (after an audio-session interruption, a media-server reset, or the idle auto-shutdown enabled by
  `isAutoShutdownEnabled = true`). Both wrote `hold` and `drag`, which every plugin method reads and writes on the main queue
  (`beat` checks `hold == nil`, `dragMove` uses `drag`): unsynchronized read/write of Swift class references, a data race
  that can crash on a released player or leave `hold` set so `beat` refuses.
- **Root cause:** handler bodies not hopped to the main queue (the breath player's `completionHandler` already does it).
- **Fix:** both handlers dispatch their body to `DispatchQueue.main`.
- **Verification:** static only; `node demo/tests/haptics.test.js` still 13 ok.

### 4. Prototype FingerSensor stamps stored values as fresh (Medium, fixed)
- **Reproduce (traced):** `ios/Afferent/FingerSensor.swift` called `p.readValue(for:)` on 2A37 and AFF1 after subscribing.
  Both are readable on the board (uno-q/SENSORS.md). The read returns the stored value, the last one the board set
  (minutes old if the sensor stream stopped), and `didUpdateValueFor` stamps it `lastUpdate = Date()` / `sensorsUpdate = Date()`,
  so `freshBpm` / `freshSensors` / `freshBreathing` show it as a live reading for 5 to 10 s. `didUpdateValueFor` also ignored
  `error`, in which case `ch.value` is the old cached value.
- **Root cause:** read plus notify instead of notify only (the rule the Capacitor plugin and its Android twin keep).
- **Fix:** no `readValue`; values that come with an error are ignored.
- **Verification:** static only.

## Reviewed, no bug found

- **BLE parsers** (`AfferentFingerParser.kt` / `.swift`): 2A37 flags bit 0 (uint8 vs little-endian uint16, short payload -> null,
  0 -> null), AFF1 v1/v2/v3 lengths, RMSSD 255 marker, quality 255/>100, presence codes, two-hearts flag. Kotlin and Swift agree
  byte for byte, and with `uno-q/modulino-hub/ble.py`. RR intervals are not parsed anywhere (the board sends flags = 0x00, no RR),
  so there is no 1/1024 s conversion to get wrong.
- **Event contract** (`AfferentFingerEvents.kt`, `aff1Event`/`hrmEvent`) vs `demo/js/finger.js` / `sensors.js feedFingerBle`:
  method names (start/stop/status), events (`state`, `reading`), field names and nulls match on both platforms.
- **AfferentFingerLink / AfferentFingerPlugin (Android):** single-thread discipline (every callback hops to the main looper),
  stale-callback guards (`g !== gatt`, `scan !== this`, `attempt` tokens), connect/subscribe timeouts, backoff, rest after
  3 failures, scan budget, background grace, receiver unregistered in `shutDown`, permission flow (every waiting `start()` is
  resolved; denial -> `unauthorized`), API checks (S for permissions, TIRAMISU for `writeDescriptor`/`onCharacteristicChanged`).
- **AfferentHapticsPlugin.kt / HapticShapes.kt:** API-level guards (26 waveform/amplitude, 30/31 primitives), every call resolved,
  drag watchdog and resume timers cancelled; words and methods match iOS and `haptics.js`.
- **AfferentPresencePlugin.kt / AfferentPresenceCore.kt:** advert TLV walk, UUID endianness and spelling, permission plans per
  API level, receiver / network callback / NSD listeners released on stop.
- **AndroidManifest.xml:** BLUETOOTH_SCAN (neverForLocation) + CONNECT for 31+, BLUETOOTH/ADMIN/FINE_LOCATION maxSdk 30, CAMERA,
  RECORD_AUDIO, VIBRATE, hardware features optional.
- **Info.plist:** NSBluetoothAlwaysUsageDescription, NSCameraUsageDescription, NSMicrophoneUsageDescription,
  NSLocalNetworkUsageDescription, NSBonjourServices (the same 18 types as both presence plugins).
- **AfferentPulse.swift / AfferentPulseGate.swift / FaceSession.swift / FaceMeasures.swift / FacePulse.swift:** permission
  handling, queue use (lock-protected flags, frame queue vs work queue vs main), every call resolved, full-range YCbCr; `pulse` /
  `face` payloads vs `campulse.js`, `face.js`, `sensors.js feedNativePulse`.
- **AfferentPresence.swift:** all work on its own queue; central and path monitor released on stop.
- **capacitor.config.json:** `androidScheme: http` keeps `http://localhost` (a secure context for getUserMedia).

## Suspicions, not proven / not changed

- iOS finger ignores a board **for the rest of the session** after three failed setups; Android rests it 60 s ("the patient has
  no way to clear a lockout"). The iOS comment documents this as intended, so left as is; a candidate for alignment.
- iOS finger has no notification-level timeout: if the board never answers `setNotifyValue` at all (no callback), the link stays
  "connected" without readings. Android has `SUBSCRIBE_TIMEOUT_MS` for this. Not seen; CoreBluetooth normally answers or disconnects.
- Android 11 and below with the Location switch off: the finger scan delivers nothing and the state stays `scanning` (logged, documented).
- Fix 3 leaves a small ordering window: a `stoppedHandler` queued just before a new `holdStart` block runs could clear the new
  player reference (then `beat` may play over that hold). Narrower than the unsynchronized write before.
- `ios/App/FingerTests` and `TeamTests` use symlinks; on this Windows checkout (`core.symlinks=false`) they are plain text files,
  so those Swift packages would not build from a Windows checkout. Fine on macOS.
- `ios/Afferent/FingerSensor.swift` connects to any heart-rate peripheral when nothing else is connected (documented prototype behaviour).
