# Session schema (for Vlad's outer loop)

Version `afferent.session/2` (adaptive game). One JSON document per session attempt, including declined and partial sessions. The phone builds it and sends it as `session_end`. No images, no audio, no identifiers of other people. The demo in `demo/` emits this format.

## 1. Rules

- Times are milliseconds from session start unless named `*_iso`.
- `null` means not measured. Never substitute a default.
- **Alert domains (only these three can raise "Suggest review"):**
  - psychomotor: `core.rt_median_ms`, only sessions with `core.valid`;
  - mood: `mood_vas` from the end-screen check-in;
  - engagement: missed nights (a night with no app opened at all). `declined`, `sharing: nothing_tonight` and `sharing: paused` count as answered or withheld, never as missed.
- **Context features (shown to the clinician, never alerting):** start pulse, mode seconds, transitions, per-task pulse response, PERCLOS, task errors, home/away, visitors, room climate.
- **Baseline:** first 7 valid sessions, median and MAD, MAD floors 20 ms (RT) and 0.5 (mood). Robust z-scores against the person's own baseline. Log local time.
- **Suggest-review rule (pilot starting point, not validated):** the 7-day rolling median reaches robust z 1.5 or more in the worse direction in at least 2 of the 3 alert domains. The clinician decides; the system never schedules TMS.
- **Per-person learning ("which tasks help this person"):** for each task id, the median `pulse_delta_bpm` in calm and rest mode across sessions. The director may prefer the calm task that lowers this person's pulse most. Shown to the clinician as context.
- **Personal baseline pulse for the director:** median `core.start_pulse_bpm` over the first 7 valid sessions, then a 14-day rolling median. Sent to the phone at session start.

## 2. Fields

| Field | Type | Description |
|---|---|---|
| `schema` | string | `"afferent.session/2"` |
| `session_id` | string | UUID v4 |
| `device_id` | string | Random install ID |
| `app_version` | string | Semver |
| `started_iso` | string | ISO 8601 with local offset |
| `local_hour` | number | 0 to 23.99 |
| `clock` | enum | `morning` / `night` (night is 21:00 to 06:00) |
| `status` | enum | `completed` / `partial` / `declined` / `fell_asleep` |
| `input_backend` | enum | `arkit` / `mediapipe` / `none` (no camera) |
| `duration_ms` | int | Total session time |
| `sensors` | object | Switch state at start: `phone_camera`, `pulse_stone`, `bedside_camera`, `bedside_light`, `presence` |
| `sharing` | enum | `summary` / `nothing_tonight` / `paused` |
| `core.start_pulse_bpm` | float/null | Median pulse over the first 7 s |
| `core.baseline_pulse_bpm` | float/null | The personal baseline the director used |
| `core.pulse_source` | enum/null | `ky039` / `rppg` / `simulated` |
| `core.eye_open_baseline` | float/null | Median blink value with eyes open (sets the closed threshold) |
| `core.rt_trials` | array | `{foreperiod_ms, rt_ms, outcome: hit/miss/anticipation, modality: touch}`; window 150 to 1000 ms |
| `core.rt_median_ms` | int/null | Hits only |
| `core.valid` | bool | 5 trials and at least 3 hits |
| `adaptive.mode_seconds` | object | Seconds in `calm`, `flow`, `wake`, `fatigue`, `rest` |
| `adaptive.transitions` | array | `{t_ms, from, to, arousal, fatigue}`; the first entry has `from: null` |
| `adaptive.minigames` | array | `{id, mode, intensity, t_start_ms, duration_ms, completed_by: touch/auto, items, errors, pulse_delta_bpm, breath_sync?}` |
| `adaptive.calm_pulse_delta_bpm` | float/null | Sum of `pulse_delta_bpm` over calm and rest tasks |
| `adaptive.wake_pulse_delta_bpm` | float/null | Sum over wake tasks |
| `adaptive.perclos_mean` | float/null | Mean PERCLOS during play |
| `adaptive.touch_errors` | int | Sum of task errors |
| `mood_vas` | int/null | End-screen lantern check-in 1 to 5, null if skipped |
| `vitals` | object | `pulse_mean_bpm`, `pulse_min_bpm`, `pulse_max_bpm`, `pulse_source` |
| `context` | object | `room_temp_c`, `room_humidity_pct`, `home`, `visitors_present` |
| `quality` | object | `pulse_implausible`, `dark_room`, `face_tracked_ratio` |

A declined session contains only `schema`, `session_id`, `device_id`, `started_iso`, `local_hour`, `status: "declined"`, `sharing`.

## 3. Transport: phone to bedside

- Our own travel router with fixed IPs (Jetson `192.168.8.10`), Jetson access point as fallback. Venue Wi-Fi is never used.
- WebSocket server on the Jetson at `ws://192.168.8.10:8765`. The Capacitor app needs `NSLocalNetworkUsageDescription` and an ATS exception for `ws://`.
- UNO Q to Jetson by USB serial: `L r g b level fade_ms` (light), `K turn <0-100>` and `K press` (knob), `P bpm quality contact` (pulse, 1 Hz).
- The game never waits on the socket; the summary is buffered and sent on reconnect.

| Direction | `type` | Payload |
|---|---|---|
| phone to Jetson | `hello` | `device_id`, `app_version` |
| phone to Jetson | `session_start` | `session_id`, `clock`, `sensors` |
| phone to Jetson | `mode` | `session_id`, `mode`, `arousal`, `fatigue`, `t_ms` (clinic live panel) |
| phone to Jetson | `game` | `session_id`, `id`, `mode`, `intensity`, `t_ms` |
| phone to Jetson | `core_trial` | `session_id`, `trial` (1 to 5), `rt_ms`, `outcome` |
| phone to Jetson | `light` | `rgb`, `level` (0 to 100), `fade_ms` |
| phone to Jetson | `session_end` | full session JSON |
| phone to Jetson | `privacy` | `sensor`, `on` |
| Jetson to phone | `config` | `baseline_pulse_bpm`, preferred calm task ids |
| Jetson to phone | `pulse` | `bpm`, `quality` (0 to 1), `contact`, 1 Hz |
| Jetson to phone | `knob` | `level` or `press: true` |

## 4. Example

```json
{
  "schema": "afferent.session/2",
  "session_id": "b7d0a0e6-3f0c-4f43-9a4e-2c1f8f0b9d21",
  "device_id": "inst-4b7e19",
  "app_version": "0.2.0",
  "started_iso": "2026-11-15T07:41:07+02:00",
  "local_hour": 7.68,
  "clock": "morning",
  "status": "completed",
  "input_backend": "arkit",
  "duration_ms": 112600,
  "sensors": {"phone_camera": true, "pulse_stone": true, "bedside_camera": true, "bedside_light": true, "presence": true},
  "sharing": "summary",
  "core": {
    "start_pulse_bpm": 85.4, "baseline_pulse_bpm": 68, "pulse_source": "ky039", "eye_open_baseline": 0.08,
    "rt_trials": [
      {"foreperiod_ms": 1642, "rt_ms": 418, "outcome": "hit", "modality": "touch"},
      {"foreperiod_ms": 1214, "rt_ms": 334, "outcome": "hit", "modality": "touch"},
      {"foreperiod_ms": 1636, "rt_ms": 400, "outcome": "hit", "modality": "touch"},
      {"foreperiod_ms": 1868, "rt_ms": 350, "outcome": "hit", "modality": "touch"},
      {"foreperiod_ms": 1633, "rt_ms": 333, "outcome": "hit", "modality": "touch"}
    ],
    "rt_median_ms": 350, "valid": true
  },
  "adaptive": {
    "mode_seconds": {"calm": 19.7, "flow": 14.1, "wake": 22.1, "fatigue": 31.7, "rest": 0},
    "transitions": [
      {"t_ms": 18960, "from": null, "to": "calm", "arousal": 1.737, "fatigue": 0},
      {"t_ms": 38693, "from": "calm", "to": "flow", "arousal": 0.45, "fatigue": 0.079},
      {"t_ms": 51459, "from": "flow", "to": "fatigue", "arousal": 0.199, "fatigue": 0.585},
      {"t_ms": 83141, "from": "fatigue", "to": "wake", "arousal": -0.645, "fatigue": 0.167}
    ],
    "minigames": [
      {"id": "breath", "mode": "calm", "intensity": 0.693, "t_start_ms": 26293, "duration_ms": 20700, "completed_by": "touch", "items": 2, "errors": 0, "pulse_delta_bpm": -13.5, "breath_sync": 0.903},
      {"id": "stars", "mode": "flow", "intensity": 0.5, "t_start_ms": 50741, "duration_ms": 4035, "completed_by": "touch", "items": 5, "errors": 0, "pulse_delta_bpm": -2.8},
      {"id": "shutters", "mode": "fatigue", "intensity": 1, "t_start_ms": 63808, "duration_ms": 3934, "completed_by": "touch", "items": 4, "errors": 0, "pulse_delta_bpm": 1.2},
      {"id": "fireflies", "mode": "wake", "intensity": 0.795, "t_start_ms": 85374, "duration_ms": 6550, "completed_by": "touch", "items": 7, "errors": 0, "pulse_delta_bpm": 6.1}
    ],
    "calm_pulse_delta_bpm": -13.5, "wake_pulse_delta_bpm": 6.1, "perclos_mean": 0.148, "touch_errors": 0
  },
  "mood_vas": 3,
  "vitals": {"pulse_mean_bpm": 71.9, "pulse_min_bpm": 58.7, "pulse_max_bpm": 90.3, "pulse_source": "ky039"},
  "context": {"room_temp_c": 20.5, "room_humidity_pct": 34, "home": true, "visitors_present": 0},
  "quality": {"pulse_implausible": false, "dark_room": false, "face_tracked_ratio": 0.97}
}
```
