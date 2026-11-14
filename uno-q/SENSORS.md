# Sensor API (UNO Q `modulino-hub`)

What the sensor side delivers, for building the app against. Two ways in: **Bluetooth LE**
(phone, no network needed) and **HTTP** (other Wendy Net apps, e.g. the Jetson).

Hardware: two PulseSensors in printed fingertip clips — finger 1 on **A1** (power **D2**),
finger 2 on **A2** (power **D3**); Modulino Knob/Thermo/Buzzer on Qwiic; KY-016 RGB LED on D9–D11.
The sensor LEDs are **off until a finger is detected** (2.5 s probe flashes every ~4 s), so expect
"no reading" (0 / `null`) whenever nobody is wearing a clip.

## Bluetooth LE

Advertises as **`Afferent Finger`** with the Heart Rate Service, so it is found by a scan for `180D`.

| Service | Characteristic | Props | Bytes | Meaning |
|---|---|---|---|---|
| `180D` Heart Rate | `2A37` Heart Rate Measurement | notify, read | `[flags=0x00, bpm]` | **the** finger pulse: both sensors fused (one value). Standard format, any heart-rate app understands it |
| `180D` | `2A38` Body Sensor Location | read | `[3]` | finger |
| `AFF0` (custom, primary) | `AFF1` | notify, read | `[f1, f2, breath, rmssd]` | finger 1 BPM, finger 2 BPM, breaths/min, HRV RMSSD in ms. **0 = no reading** |

- `2A37` is notified about once a second while a finger is detected; `AFF1` on every heartbeat
  and whenever breathing / HRV change.
- Values older than ~5 s should be treated as stale (finger removed, sensor off).
- iOS reference implementation: `ios/Afferent/FingerSensor.swift`.

### AFF1 v2 (in the repository, not yet deployed to the board)

The board runs the 4-byte payload above until someone redeploys `modulino-hub`. The code in this
repository sends 6 bytes; the first four are unchanged, so a client that reads only those
(`ios/Afferent/FingerSensor.swift`) keeps working.

| Byte | Field | Values |
|---|---|---|
| 0 | finger 1 BPM | 1–255, **0 = no reading** |
| 1 | finger 2 BPM | 1–255, **0 = no reading** |
| 2 | breaths/min | 1–255, **0 = no reading** |
| 3 | HRV RMSSD, ms (rounded) | 1–255, **0 = no reading** |
| 4 | `quality_pct` = fused rhythm quality × 100 (the same number as `finger.quality` in `/state`) | 0–100, **255 = not available** (no finger, or sensors still warming up) |
| 5 | `presence_code` (`presence.mode` in `/state`) | 1 idle · 2 probing · 3 active · 0 unknown |

- A client tells the versions apart by the length: 4 bytes = v1 (no quality, no presence),
  6 bytes = v2. Below 30 % (`quality_pct < 30`) the pulse is unreliable even if a BPM is present;
  with a v1 payload the quality is unknown, not good.
- **Keepalive:** `AFF1` is notified at least every 2 s, also while idle and while nothing
  changes. A client can therefore tell "link alive, no finger" (notifications keep coming,
  presence idle) from "link lost" (no notification for a few seconds).
- **Cleared bytes:** when the finger leaves (and again when a new finger is detected) bytes 0–3
  go to 0 and one notification is sent. Before, the per-finger bytes kept their last numbers after
  the finger was gone. The stored `2A37` value is set to `[0x00, 0]` at the same time without a
  notification, so a client that *reads* `2A37` afterwards gets "no reading", not the last pulse.
- `2A37` is unchanged: `[0x00, bpm]`, notified about once a second only while a finger is
  detected and a fused BPM exists. No notification = no pulse.
- Capacitor plugin for the game app: `ios/App/App/AfferentFinger.swift` (connects only to a
  peripheral named `Afferent Finger`, subscribes without reading, so every value it reports is a
  fresh notification).
- Android twin with the same JavaScript interface:
  `android/app/src/main/java/fi/junction/afferent/AfferentFingerPlugin.kt` (rules in
  `AfferentFingerLink.kt`, bytes in `AfferentFingerParser.kt`). Its logic is unit-tested on the
  build machine; it has not been run on a phone or against the board yet.

## HTTP (Wendy Net, port 18080 on the mesh; 8080 inside the container)

`GET /state` — JSON, all fields may be `null` when there is no reading:

| Field | Type | Meaning |
|---|---|---|
| `finger.bpm` | int | **the** finger pulse (both sensors fused) |
| `finger.sources` | [int] | which sensors contributed (`[0, 1]` = both agree) |
| `finger.quality` | 0–1 | rhythm strength (autocorrelation); < 0.3 = unreliable |
| `fingers[0..1]` | object | per sensor: `bpm_live`, `locked`, `ibi_ms`, `t` |
| `breathing.per_minute` | int | breathing rate from the heart-rate rhythm (respiratory sinus arrhythmia) |
| `breathing.snr` | dB | > 0 = clear; values are only set when > 0 |
| `hrv.rmssd_ms` | float | HRV: RMSSD over the last 60 s (standard short-term stress marker; lower = more stressed) |
| `hrv.sdnn_ms`, `hrv.mean_bpm` | float, int | SDNN and mean pulse over the same window |
| `hrv.vs_baseline` | float | RMSSD relative to this person's own median (after ≥ 2 min), e.g. `-0.3` = 30 % below |
| `presence.mode` | str | `idle` (LEDs off) · `probing` (checking for a finger) · `active` (measuring) |
| `climate.celsius`, `climate.humidity` | float | Modulino Thermo |
| `knob.position`, `knob.pressed` | int, bool | Modulino Knob |

Other endpoints: `GET /ppg?ch=0|1` (raw 30–70 s signal, debugging) · `POST /buzz?freq=&ms=` ·
`POST /led?r=&g=&b=&ms=` · `POST /led/beat?on=0|1` · `POST /heartbeat?on=0|1` (beep per beat) ·
`POST /presence?auto=0|1` · `POST /sensor?ch=&on=` (manual sensor power).

### `/state` changes (in the repository, not yet deployed to the board)

| Field | Type | Meaning |
|---|---|---|
| `now` | float, s | the board's own clock when the document was built. Every `t` / `since` in the document is on the same clock, so a consumer judges staleness as `now - t` without comparing its clock to the board's |

- **Idle reset:** when `presence.mode` goes to `idle`, `breathing.per_minute`, `breathing.snr`,
  `breathing.channel`, `hrv.rmssd_ms`, `hrv.sdnn_ms`, `hrv.mean_bpm`, `hrv.channel` and
  `hrv.vs_baseline` become `null` (`hrv.pairs` = 0) and `finger.fingers` becomes `[null, null]`.
  Before, they kept the last numbers for as long as nobody wore the clip. `hrv.baseline_rmssd_ms`
  (the personal median) is kept.

## Sounds (in the repository, not yet deployed to the board)

The unit is quiet by default: it is a silent bedside unit for the morning session.

- **Heartbeat beep: off by default** (`bool heartbeatSound = false;` in `sketch/sketch.ino`).
  `POST /heartbeat?on=1` switches it on, `on=0` off again; the setting is lost at a restart.
  On the board as deployed today the beep is still **on** by default; `POST /heartbeat?on=0` mutes it.
- **`UI_SOUNDS`** (`const bool UI_SOUNDS = false;` in the sketch) gates the 1760 Hz startup beep
  and the 1200 Hz knob click. It is a compile-time switch: set it to `true` and reflash to get
  them back. `POST /buzz` is not gated; a caller that asks for a tone still gets it.

## Timing and accuracy (measured)

| | Time to first value | Accuracy |
|---|---|---|
| Finger pulse | ~4 s after a finger is detected (+ up to ~4 s until the next probe) | fingers agree within ±5 BPM; matches a smartwatch |
| Breathing | 25–40 s of steady beats | 6 / 10 / 18 per min recovered exactly (synthetic); 6/min paced breathing on a real person |
| HRV (RMSSD) | ~60 s | synthetic 14 / 47 / 86 ms → 20 / 48 / 93 ms (45 Hz sampling: small positive bias at low HRV — prefer `vs_baseline`) |

Logic is covered by offline tests: `cd uno-q/modulino-hub && python3 -m unittest discover tests`.
They also cover the AFF1 v2 payload, the keepalive, the cleared bytes, the idle reset, `now` and
the quiet defaults; none of that has been run on the board yet.
