# Sensor API (UNO Q `modulino-hub`)

What the sensor side delivers, for building the app against. Two ways in: **Bluetooth LE**
(phone, no network needed) and **HTTP** (other Wendy Net apps, e.g. the Jetson).

Hardware: two PulseSensors in printed fingertip clips — finger 1 on **A1** (power **D2**),
finger 2 on **A2** (power **D3**); Modulino Knob/Thermo/Buzzer on Qwiic; KY-016 RGB LED on D9–D11.
The sensor LEDs are **off until a finger is detected** (2.5 s probe flashes every ~4 s), so expect
"no reading" (0 / `null`) whenever nobody is wearing a clip.

## Bluetooth LE

Advertises as **`Afferent Finger`** with the Heart Rate Service, so it is found by a scan for `180D`.

The board sends a second advertisement from the same Bluetooth address: Wendy Net's (service
`7565E9EB-4C20-4B67-9272-D708B397B631`, name `wendyos-uno-q`). A Wendy Net peer that connects by
address can land on ours, and while that link lasts ours is off the air (seen 2026-11-14: only
Wendy Net's left, the phone stayed at "scanning"). Both share one GATT server, so the phone
plugins (`ios/App/App/AfferentFinger.swift`, Android `AfferentFingerLink.kt`) scan for `180D`
**and** Wendy Net's service. They connect to a device named exactly `Afferent Finger`, or one
with Wendy Net's service named exactly `wendyos-uno-q`, and trust it only once it has the `AFF0`
service; anything else is never connected (another team's WendyOS UNO Q without `AFF0` gets one
service check and is then left alone for the session).

| Service | Characteristic | Props | Bytes | Meaning |
|---|---|---|---|---|
| `180D` Heart Rate | `2A37` Heart Rate Measurement | notify, read | `[flags=0x00, bpm]` | **the** finger pulse: both sensors fused (one value). Standard format, any heart-rate app understands it |
| `180D` | `2A38` Body Sensor Location | read | `[3]` | finger |
| `AFF0` (custom, primary) | `AFF1` | notify, read | `[f1, f2, breath, rmssd]` | finger 1 BPM, finger 2 BPM, breaths/min, HRV RMSSD in ms. **0 = no reading** |

- `2A37` is notified about once a second while a finger is detected; `AFF1` on every heartbeat
  and whenever breathing / HRV change.
- Values older than ~5 s should be treated as stale (finger removed, sensor off).
- iOS reference implementation: `ios/Afferent/FingerSensor.swift`.

### AFF1 v2 and v3 (in the repository, not yet deployed to the board)

The board runs the 4-byte payload above until someone redeploys `modulino-hub`. The code in this
repository sends 7 bytes (v3); the first four are unchanged, so a client that reads only those
(`ios/Afferent/FingerSensor.swift`) keeps working.

| Byte | Field | Values |
|---|---|---|
| 0 | finger 1 BPM | 1–255, **0 = no reading** |
| 1 | finger 2 BPM | 1–255, **0 = no reading** |
| 2 | breaths/min | 1–255, **0 = no reading** |
| 3 | HRV RMSSD, ms (rounded) | 1–254, **0 = no reading**, **255 = above 254 ms** |
| 4 | `quality_pct` = fused rhythm quality × 100 (the same number as `finger.quality` in `/state`) | 0–100, **255 = not available** (no finger, or sensors still warming up) |
| 5 | `presence_code` (`presence.mode` in `/state`) | 1 idle · 2 probing · 3 active · 0 unknown |
| 6 | flags (v3, see below) | bit 0 = two people on the clips (`finger.two_hearts`); the other bits are 0 |

- A client tells the versions apart by the length: 4 bytes = v1 (no quality, no presence),
  6 bytes = v2, 7 bytes = v3 (v2 plus the flags byte; bytes 0–5 are unchanged, so a v2 client
  keeps working). Below 30 % (`quality_pct < 30`) the pulse is unreliable even if a BPM is present;
  with a v1 payload the quality is unknown, not good.
- **RMSSD above 254 ms** does not fit in the byte. `255` is a marker for that, not a reading of
  255 ms: a client shows no value (`hrv.rmssd_ms` in `/state` has the number). The phone app, its
  iOS parser and Heart Duel treat `255` this way, also with firmware that still clamps to 255.
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
| `hrv.rmssd_ms` | float | HRV: RMSSD of successive beat intervals over the last 60 s, in ms |
| `hrv.sdnn_ms`, `hrv.mean_bpm` | float, int | SDNN and mean pulse over the same window |
| `hrv.vs_baseline` | float | RMSSD relative to the sensor's running median of its last 10 min of readings (after ≥ 2 min), e.g. `-0.3` = 30 % below. Not per person: the sensor does not know who wears the clip |
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
  (the sensor's running median, not per person) is kept.

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
| Finger pulse | ~10 s after a finger is detected: 4 s warm-up, then 6 s steady (pulse guard below) (+ up to ~4 s until the next probe) | fingers agree within ±5 BPM; matches a smartwatch |
| Breathing | 25–40 s of steady beats | 6 / 10 / 18 per min recovered exactly (synthetic); 6/min paced breathing on a real person |
| HRV (RMSSD) | ~60 s | synthetic 14 / 47 / 86 ms → 20 / 48 / 93 ms (45 Hz sampling: small positive bias at low HRV — prefer `vs_baseline`) |

Logic is covered by offline tests: `cd uno-q/modulino-hub && python3 -m unittest discover tests`.
They also cover the AFF1 v2 payload, the keepalive, the cleared bytes, the idle reset, `now` and
the quiet defaults; none of that has been run on the board yet.

## Pulse guard: a settling finger and double counting

Seen in the data manager on 2026-11-14: 164 BPM four times (19:08:25–29, quality 0.36–0.38)
right after a finger went on, and a single 171 at 19:20:36, with nothing stored for minutes
around them. Most likely beats counted twice while the finger settled into the clip. The
quality limit cannot catch it: a doubled rhythm is a clean rhythm. So the number is held back
(`PulseGuard` in `modulino-hub/app.py`):

- **New wearing:** after a finger is detected (or 10 s without a trusted value) nothing is known
  yet. A pulse goes out once it has stayed steady (within 12 %) for **6 s**, counting only values
  that are measurements (quality ≥ 0.3, a live finger behind it).
- **Jump to about double or half** (ratio within 15 % of 2) of the last value that went out: held
  the same way. A return to the old value goes out at once.
- **Everything else goes out at once**, and a held value that stays steady goes out after 6 s, so a
  real change is delayed by a few seconds at most, never blocked. A real rise to double over
  tens of seconds is never held (each step is small).
- It applies to the fused pulse everywhere it leaves the box: `2A37`, `/state` `finger.bpm` and
  `beat.bpm_live`, and the data manager. Each finger's own number has its own guard: AFF1 bytes 0–1
  and `/state` `finger.fingers` are 0 / `null` while that finger is held (the byte goes to 0 once).
  `fingers[c].bpm_live` in `/state` stays the detector's own number, unguarded.
- `/state` `finger.held` says what is held and why: `{"bpm", "reason": "settling"|"double"|"half",
  "steady_s"}`, `null` when nothing is.
- The limit: from the first contact the box has no other reference, so a doubled pulse that stays
  steady for more than 6 s goes out like a real one, and the real value after it waits 6 s.

Tested offline with the stored values of that day and with a synthetic finger run through the
hub end to end (a port of the STM32 beat detector, the real autocorrelation, fusion, Bluetooth
payloads and data manager hand-over): `tests/test_pulse_guard.py`.

## Two people on the two clips (Heart Duel)

In the repository, not yet deployed to the board.

The fusion assumes both clips sit on one person. When both fingers show a clear rhythm
(quality >= 0.3) and the rhythms stay more than 12 % apart for 3 s (a ratio near 2 is treated
as one heart with a double-counting sensor), `GET /state` reports `finger.two_hearts: true` and:

- each beat detector keeps its own rhythm (never the combined one),
- the Jetson hub stops storing pulse, HRV and breathing as the patient's data,
- the fused pulse, HRV and breathing are still sent, but they belong to one of the two people.

- AFF1 byte 6 bit 0 (v3) is set, so the phone knows too: the app keeps the fused pulse and the
  finger frame out of a session while the flag is set, and Heart Duel (Settings, Together) shows
  "Two hearts". The flag is set only while the hub is sensing, and it goes with the next status
  notification (at most 2 s). In the repository, not yet deployed: the board needs a redeploy of
  `modulino-hub` before a phone sees the 7-byte packet. Without it the phone app tells two people
  apart itself from two clearly different per-clip rhythms (the same 12 % / 3 s rule).

Independent of that, a finger's BPM leaves the Bluetooth packet (byte becomes 0) when its own
detector has had no locked beat for 4 s, so a clip that came off no longer shows its last number
while the other clip is still worn. Finger 1 still decides when the sensors switch on, so
player 1 puts the clip on first. None of this has been run with two real people yet.


## Readings to the data manager on the Jetson

In the repository, not yet deployed to the board. Checked on a laptop against the data manager
of branch `data_manager` (commit c4301f8) with made-up numbers; never run between the real
UNO Q and the real Jetson.

Once a second the hub hands its readings to `afferent-data-manager` (`jetson/data_manager`).
They go from the UNO Q to the Jetson over Wendy Net and stay in the patient's home.

| Metric | Value | When | Extra |
|---|---|---|---|
| `vitals.heart_rate_bpm` | the fused finger pulse, BPM | every second while a reading exists | `quality` = `finger.quality` (0–1), `meta.sensor` = `finger_ppg` |
| `vitals.hrv_rmssd_ms` | RMSSD over the last 60 s, ms | at most every 10 s | no quality (there is none), `meta.window_s` = 60 |
| `vitals.breathing_rate_per_min` | breaths per minute, from the heart rhythm | at most every 10 s | no quality, `meta.method` = `pulse_rhythm` |
| `env.temperature_c`, `env.humidity_pct` | mean of the Modulino Thermo readings over one minute | at most once a minute, with or without a finger | `meta.n` = readings in the mean; stamped at the middle of that minute |

All with source `modulino-hub`. Pulse, HRV and breathing are handed over only when all of this holds:

- the hub is sensing (`presence.mode` = `active` and the 4 s warm-up is over),
- samples arrived from the STM32 in the last 3 s (when the stream stops, the buffers keep their
  last seconds and the hub's own `finger.bpm` can stay on the old rhythm; that is not sent),
- the value exists: a missing reading is not sent, never as 0 and never as an older number,
- the finger(s) the number was computed from had a locked beat in the last 3 s (HRV and
  breathing are computed from stored beats and would otherwise outlive a clip that came off),
- the clips are on one person: nothing while `finger.two_hearts` is true, nothing in a second
  where the two fingers show two different clear rhythms (how two people look during the 3 s
  before `two_hearts` is decided), and HRV and breathing wait 60 s after two people, until
  their windows hold one person's beats again.

Code: `modulino-hub/data_manager_push.py` (the rules above) and `data_manager_client.py`
(an unchanged copy of `jetson/data_manager/client/data_manager_client.py`; it queues up to
50 000 values and sends them from its own thread, so the sensor loop never waits for the network).

### Token and address

Both come from the environment of the container, nothing is stored in `wendy.json` or in the
repository:

| Variable | Meaning |
|---|---|
| `DATA_MANAGER_TOKEN` | the data manager's `API_TOKEN` (it answers 401 without it) |
| `DATA_MANAGER_URL` | `http://<address of the data manager>:8100`. Not set: found over mDNS (`role=data-manager`) on the mesh interface. `off`: nothing is sent |

Pass them when deploying, with `--env` of `wendy run` (`--env KEY=VALUE`, repeatable; flag
checked in `wendy run --help`, CLI 2026.11.13):

```sh
cd uno-q/modulino-hub
read -s DATA_MANAGER_TOKEN        # paste the token; it is not shown and not in the shell history
wendy run --device "$UNOQ" --detach --yes \
  --env "DATA_MANAGER_URL=http://<data manager address>:8100" \
  --env "DATA_MANAGER_TOKEN=$DATA_MANAGER_TOKEN"
```

Give `DATA_MANAGER_URL` when a token is used: with mDNS the client sends the token to the first
host that advertises `role=data-manager`. The address is in the data manager's start log
(`advertising … at <address>:8100`). Not verified: whether the two values survive a later
`wendy run` without `--env`; pass them on every deploy.

### Checking it, and what happens without it

`GET /state` has a `data_manager` block: `url` (and `url_from_mdns`), `queued_samples`,
`sent.samples`, `sent.rejected`, `last_error` (e.g. `HTTP 401` = wrong or missing token),
`clock_skew_s`, and `push_error` (a problem on the hub's side). The token is never in it.

- Data manager not running or not reachable: values wait in the queue and are sent with their
  own measurement times when it is back. The hub, Bluetooth and `/state` work as before.
  The queue is in memory: stopping the hub waits at most 1 s for it to be sent, what is still
  queued then is lost.
- No token or a wrong one: the same, `last_error` says `HTTP 401`.
- Client file missing from the image or failing to start: one log line
  (`data manager: … (the hub goes on without it)`), nothing is sent, everything else works.
