# Session schema (for Vlad's outer loop)

Version `afferent.session/1`. One JSON document per session attempt, including declined sessions and partial sessions. The phone builds it and sends it as the `session_end` message. Nothing in it contains images, audio or identifiers of other people.

## 1. Rules

- All times are milliseconds from `session_start` unless named `*_iso`.
- `null` means not measured or not available. Never substitute a default for a missing measurement.
- Each station carries `completed_by`: `signal` (the body action succeeded), `tap` (touch fallback), `auto` (timeout), `skip` (patient skipped). **Only `signal` data enters the trend for that station's features.**
- `quality` flags decide whether a feature is usable. Drop a feature from the trend when its flag fails.
- **Alert domains (only these three can raise "Suggest review"):** psychomotor (`lake.rt_median_ms`, only sessions with `lake.valid`), mood (`mood_vas`), engagement (missed nights).
- **Context features (shown to the clinician, never alerting):** everything else, including all `cal.*` values, blink rate, eye openness, `sauna.pulse_delta_bpm` (only with `pulse_valid`), `forest.time_to_target_s`, `fork.*`, home/away, visitors present, room climate.
- **Missed night:** a night with no app opened at all. A `declined` session, `sharing: nothing_tonight` or `sharing: paused` counts as answered or withheld, never as missed, and never triggers Suggest review.
- **Baseline:** the first 7 valid sessions, median and MAD, with MAD floors of 20 ms for reaction time and 0.5 for mood. Each value is a robust z-score against the person's own baseline. Log local time because reaction time and mood vary over the day. Lapses are computed here: a trial with RT above baseline median plus 3 MAD.
- **Suggest-review rule (pilot starting point, not validated):** the 7-day rolling median reaches robust z of 1.5 or more in the worse direction in at least 2 of the 3 alert domains. The output is a "Suggest review" card for the clinician, who decides. The system never schedules TMS.

## 2. Fields

| Field | Type | Description |
|---|---|---|
| `schema` | string | `"afferent.session/1"` |
| `session_id` | string | UUID v4 |
| `device_id` | string | Random install ID, not the phone's hardware ID |
| `app_version` | string | Semver |
| `input_backend` | enum | `arkit` / `mediapipe` / `touch_only` |
| `device_model` | string | For example `iPhone14,5`. Compare reaction time only within the same device and backend. |
| `started_iso` | string | ISO 8601 with local offset |
| `local_hour` | number | 0 to 23.99 |
| `status` | enum | `completed` / `partial` / `declined` / `fell_asleep` |
| `profile` | enum | `good_day` / `bad_day` / `auto`. Demo presets are labelled. |
| `duration_ms` | int | Total session time |
| `sensors` | object | Each sensor's switch state at start: `phone_camera`, `pulse_stone`, `bedside_camera`, `bedside_light`, `presence` (bool) |
| `sharing` | enum | `summary` / `nothing_tonight` / `paused`. If not `summary`, the bedside unit keeps the record locally and the clinic view shows only "not shared". |
| `cal.eye_open_O` | [float, float] | Left, right blink blendshape median, eyes open |
| `cal.eye_closed_C` | [float, float] | Left, right, eyes closed (null if not closed) |
| `cal.eye_wide_W` | [float, float] | Left, right eyeWide median during flare (null if not widened) |
| `cal.head_pitch_neutral_deg` | float | Neutral pitch in camera space |
| `cal.blink_rate_per_min` | float | Spontaneous blinks in the 0 to 6 s and 12 to 20 s windows, per minute. Context only, never claimed. |
| `cal.eye_aperture_mean` | float | Mean normalised openness in the same windows (1 = open) |
| `cal.resting_pulse_bpm` | float/null | Median over 12 to 20 s |
| `cal.pulse_source` | enum/null | `ky039` / `rppg` |
| `cal.pulse_quality` | float | 0 to 1 |
| `cal.source` | enum | `live` / `stored` (stage demo mode loads a stored calibration) |
| `cal.ambient_luma` | float | Mean camera luma 0 to 255 |
| `cal.tracked_ratio` | float | Share of frames with face tracked |
| `mood_vas` | int/null | Lantern check-in 1 (dimmest) to 5 (brightest) |
| `stations` | array | One object per station, see below |
| `vitals` | object | `pulse_mean_bpm`, `pulse_min_bpm`, `pulse_max_bpm`, `pulse_valid_ratio`, `tracked_ratio` over the whole session |
| `context` | object | `room_temp_c`, `room_humidity_pct` (thermo module), `home` (bool), `visitors_present` (int, device count bucket 0 / 1 / 2+) |
| `quality` | object | `eye_range_low`, `pulse_implausible`, `dark_room` (luma under 40), `face_lost_events` (int) |
| `keep_moment` | bool | Patient kept tonight's dawn (stretch) |

### Station objects

Common fields: `name` (`forest` / `fork` / `lake` / `sauna` / `lighthouse`), `t_start_ms`, `t_end_ms`, `completed_by`.

| Station | Extra fields |
|---|---|
| `forest` | `gaze_up_seconds`, `max_pitch_up_deg`, `time_to_target_s` (null if not reached) |
| `fork` | `reward_level` (1 to 3), `choice` (`summit` / `flat` / `none`), `effort_completed` (bool/null) |
| `lake` | `trials` array of `{foreperiod_ms, rt_ms, outcome: hit/miss/anticipation, modality: blink/tap}`, `trials_completed`, `rt_median_ms` (hits only), `misses`, `anticipations`, `modality` (`blink` / `tap` / `mixed`), `valid` (6 trials completed and at least 4 hits) |
| `sauna` | `eyes_closed_ratio`, `pulse_start_bpm` (mean over lead-in plus cycle 1), `pulse_end_bpm` (mean over cycle 3), `pulse_delta_bpm`, `pulse_source`, `pulse_quality` (0 to 1), `pulse_valid` (quality 0.7 or more and contact throughout) |
| `lighthouse` | `time_to_target_s` |

A declined session contains only `schema`, `session_id`, `device_id`, `started_iso`, `local_hour`, `status: "declined"`, `sensors`, `sharing`, `context`.

## 3. Transport: phone to bedside

- Network: our own travel router with fixed IPs (Jetson `192.168.8.10`, demo iPhone DHCP reserved). Fallback: Jetson access point `afferent-bedside`, `10.42.0.1`. Venue Wi-Fi is never used.
- Jetson runs one WebSocket server on `ws://192.168.8.10:8765`. The Capacitor app needs `NSLocalNetworkUsageDescription` and an ATS exception for `ws://`, added on day one.
- UNO Q connects to the Jetson by USB serial. Line protocol: `L r g b level fade_ms\n` (light), `K turn <0-100>\n` and `K press\n` (knob), `P bpm quality\n` (pulse, 1 Hz). Alex may switch to network if the UNO Q Linux side is easier.
- The game never waits on the socket. If it fails, the summary is buffered on the phone and sent on reconnect.

### Messages (JSON, one `type` field each)

| Direction | `type` | Payload |
|---|---|---|
| phone to Jetson | `hello` | `device_id`, `app_version` |
| phone to Jetson | `session_start` | `session_id`, `profile`, `sensors` |
| phone to Jetson | `station` | `session_id`, `name`, `colour` (hex), `t_ms` |
| phone to Jetson | `light` | `rgb` (hex), `level` (0 to 100), `fade_ms` |
| phone to Jetson | `lake_trial` | `session_id`, `trial` (1 to 6), `rt_ms`, `outcome`. Clinic side only, for the live stage panel |
| phone to Jetson | `session_end` | full session JSON |
| phone to Jetson | `privacy` | `sensor`, `on` (bool), sent when a switch changes |
| Jetson to phone | `pulse` | `bpm`, `quality` (0 to 1), `contact` (bool), 1 Hz |
| Jetson to phone | `knob` | `level` (0 to 100) or `press: true` |

The stick figure (pose from the Jetson camera) stays on the Jetson and goes straight to the dashboard. It never travels over this socket.

## 4. Example

```json
{
  "schema": "afferent.session/1",
  "session_id": "6f1d2c3e-8a41-4c7e-9f0b-2d5e8a1b7c90",
  "device_id": "inst-4b7e19",
  "app_version": "0.3.0",
  "input_backend": "arkit",
  "device_model": "iPhone14,5",
  "started_iso": "2026-11-14T23:41:07+02:00",
  "local_hour": 23.69,
  "status": "completed",
  "profile": "bad_day",
  "duration_ms": 104800,
  "sensors": {"phone_camera": true, "pulse_stone": true, "bedside_camera": true, "bedside_light": true, "presence": true},
  "sharing": "summary",
  "cal": {
    "eye_open_O": [0.08, 0.07],
    "eye_closed_C": [0.86, 0.84],
    "eye_wide_W": [0.41, 0.39],
    "head_pitch_neutral_deg": -6.2,
    "blink_rate_per_min": 17.1,
    "eye_aperture_mean": 0.91,
    "resting_pulse_bpm": 71.0,
    "pulse_source": "ky039",
    "pulse_quality": 0.85,
    "source": "live",
    "ambient_luma": 22.5,
    "tracked_ratio": 0.99
  },
  "mood_vas": 2,
  "stations": [
    {"name": "forest", "t_start_ms": 31300, "t_end_ms": 36000, "completed_by": "signal", "gaze_up_seconds": 3.0, "max_pitch_up_deg": 11.4, "time_to_target_s": 4.7},
    {"name": "fork", "t_start_ms": 36000, "t_end_ms": 40200, "completed_by": "signal", "reward_level": 2, "choice": "flat", "effort_completed": null},
    {"name": "lake", "t_start_ms": 42500, "t_end_ms": 58900, "completed_by": "signal",
     "trials": [
       {"foreperiod_ms": 2210, "rt_ms": 512, "outcome": "hit", "modality": "blink"},
       {"foreperiod_ms": 1340, "rt_ms": 468, "outcome": "hit", "modality": "blink"},
       {"foreperiod_ms": 1720, "rt_ms": null, "outcome": "miss", "modality": "blink"},
       {"foreperiod_ms": 2390, "rt_ms": 547, "outcome": "hit", "modality": "blink"},
       {"foreperiod_ms": 1080, "rt_ms": 121, "outcome": "anticipation", "modality": "blink"},
       {"foreperiod_ms": 2050, "rt_ms": 490, "outcome": "hit", "modality": "blink"}
     ],
     "trials_completed": 6, "rt_median_ms": 501, "misses": 1, "anticipations": 1, "modality": "blink", "valid": true},
    {"name": "sauna", "t_start_ms": 61200, "t_end_ms": 93400, "completed_by": "signal", "eyes_closed_ratio": 0.83, "pulse_start_bpm": 73.0, "pulse_end_bpm": 67.5, "pulse_delta_bpm": -5.5, "pulse_source": "ky039", "pulse_quality": 0.8, "pulse_valid": true},
    {"name": "lighthouse", "t_start_ms": 93400, "t_end_ms": 96800, "completed_by": "signal", "time_to_target_s": 3.4}
  ],
  "vitals": {"pulse_mean_bpm": 70.2, "pulse_min_bpm": 66.0, "pulse_max_bpm": 76.0, "pulse_valid_ratio": 0.88, "tracked_ratio": 0.97},
  "context": {"room_temp_c": 20.5, "room_humidity_pct": 34, "home": true, "visitors_present": 0},
  "quality": {"eye_range_low": false, "pulse_implausible": false, "dark_room": true, "face_lost_events": 0},
  "keep_moment": false
}
```
