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

## Timing and accuracy (measured)

| | Time to first value | Accuracy |
|---|---|---|
| Finger pulse | ~4 s after a finger is detected (+ up to ~4 s until the next probe) | fingers agree within ±5 BPM; matches a smartwatch |
| Breathing | 25–40 s of steady beats | 6 / 10 / 18 per min recovered exactly (synthetic); 6/min paced breathing on a real person |
| HRV (RMSSD) | ~60 s | synthetic 14 / 47 / 86 ms → 20 / 48 / 93 ms (45 Hz sampling: small positive bias at low HRV — prefer `vs_baseline`) |

Logic is covered by offline tests: `cd uno-q/modulino-hub && python3 -m unittest discover tests`.
