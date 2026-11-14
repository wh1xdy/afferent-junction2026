# Sensing integration map: team sensing code vs our hub and app

Status: mapping only. Nothing here is a build plan. Every row cites code. Where the code does not answer something, it is listed as an open question for an owner, never filled with a guess or a default.

## How to read the refs

| Prefix | Means |
|---|---|
| `T:` | Team repo `junction/main` at `c5b4e04` (wh1xdy, 2026-11-14 11:24, "Merge Alex"). Alex is merged into main: `git merge-base --is-ancestor junction/Alex junction/main` is true and both trees are `12e1bb4`. So RSA breathing, 3-byte AFF1 and the primary AFF0 are on main. Line numbers were checked against `git archive c5b4e04`. A team clone still at `eea9238` (10:01) does not contain `c5b4e04` and gives different lines for the files changed after it. |
| `ours:` | This repo, local `main` at `b0a19c8`. That is `junction/afferent-app` (`03d003c`) plus 5 commits (`32361bd`, `4197661`, `fa154e8`, `9097364`, `b0a19c8`). `git diff 03d003c b0a19c8` on every file cited here is empty except `hub/afferent_hub/web/clinic/`, which is not cited. |
| `im:` | Our `junction/ios-merge` at `9c84517` (worktree `../afferent-game-ios`). |

Owner names follow `ours:STATUS.md:26-31` (David, Romain, Alex, Vlad). Git authors differ from those names. `git log c5b4e04 -- <path>` gives wh1xdy as the only author of `jetson/vision`, `uno-q/modulino-hub`, `ios/` and `hardware/`, and lusca-vlad-30322 as the only author of `jetson/presence`. The first commit of `poc/laptop-markers` not on team main is `ec15a98` by Romain Chaumontet. No file says wh1xdy is Alex. The link is only the branch name "Alex" and `ours:STATUS.md:30`, so the first Alex question below asks him to confirm it.

## 1. Our integration points (what a team component would have to meet)

| Our side | What it expects | Ref |
|---|---|---|
| Bedside source selection | `AFFERENT_BEDSIDE` = `sim`, `serial:<port>`, `ws`, `off` | `ours:contracts/api.md:23`; `ours:hub/afferent_hub/service.py:47-55` |
| `BedsideSource` protocol | `start(on_event)`, `send(msg)`, `stop()`, `connected`, `name` | `ours:hub/afferent_hub/bedside/source.py:6-14` |
| Serial transport | USB serial 115200 8N1, ASCII lines | `ours:contracts/api.md:350-352`; `ours:hub/afferent_hub/bedside/unoq.py:15,74` |
| Device to hub lines | `V`, `K turn <0-100>`, `K press`, `P <bpm> <quality> <contact>`, `I <in_bed> <motion>`, `T <temp_c> <humidity_pct>` | `ours:contracts/api.md:354-363`; `ours:hub/afferent_hub/bedside/protocol.py:9-32` |
| Hub to device lines | `L r g b level fade_ms`, `C 0/1`, `S` | `ours:contracts/api.md:365-371`; `ours:hub/afferent_hub/bedside/protocol.py:45-56` |
| `/ws/bedside` JSON | Same events as JSON, plus `pose` with 10 named keypoints, normalised 0-1 | `ours:contracts/api.md:325-340`; `ours:hub/afferent_hub/service.py:607-621` |
| Pulse to phone | `/ws/app` `pulse` {bpm, quality 0-1, contact, source `ky039`/`simulated`}, 1 Hz | `ours:contracts/api.md:272` |
| Phone pulse priority | Pulse stone > rPPG > simulator. A reading is fresh for 3 s and needs quality >= 0.3. The stone source is forced to `ky039` unless it is `simulated` | `ours:demo/js/sensors.js:141-154` |
| Session pulse source | `signal.pulse_source` and `vitals.pulse_source` in {`ky039`, `rppg`, `simulated`, null} | `ours:contracts/session.v3.schema.json:273,280-287,1053,1065-1071` |
| Session eyes source | {`arkit`, `mediapipe`, `simulated`, null} | `ours:contracts/session.v3.schema.json:291-297` |
| Session context | `home` bool or null, `visitors_present` int or null. The game always sends null today | `ours:contracts/session.v3.schema.json:1075-1093`; `ours:demo/js/record.js:176` |
| Daily presence | `presence.home_hours`, `away_hours`, `home_only` (away_hours < 0.5), `visitors_count` (count of unfamiliar nearby devices) | `ours:contracts/daily.v1.schema.json:55-64` |
| Daily sleep | From "the infrared presence sensor at the bed" | `ours:contracts/daily.v1.schema.json:18-36` |
| Live daily record | The hub fills room, knob and restlessness for the bound patient but writes no `presence` block | `ours:hub/afferent_hub/service.py:252-273` |
| Home-only feature | Composite feature `home_only_days` reads `presence.home_only` | `ours:contracts/api.md:401`; `ours:hub/afferent_hub/analytics/features.py:114-115` |
| Privacy switches | `phone_camera`, `pulse_stone`, `bedside_camera` (default false), `bedside_light`, `presence`, `phone_presence`, `phone_motion` | `ours:contracts/api.md:88` |
| Knob press | Toggles `camera_on` and sends `C` to the device | `ours:contracts/api.md:346`; `ours:hub/afferent_hub/bedside/controller.py:187-196` |
| Hub network | `0.0.0.0:8000` on the LAN, no auth | `ours:contracts/api.md:15,30` |
| Session validation | The hub validates sessions with `Draft202012Validator` against our schema | `ours:contracts/api.md:142`; `ours:hub/afferent_hub/service.py:11,39` |

## 2. UNO Q `uno-q/modulino-hub` (git author wh1xdy; `ours:STATUS.md:30` names Alex)

### 2.1 Its real interfaces

| Interface | Transport | Format | Ref |
|---|---|---|---|
| STM32 to Linux | Arduino RouterBridge notify | `knob(position, pressed)` on change; `climate(celsius, humidity)` every 2 s; `modulinos(...)` every 5 s; `ppg(millis, a1, a2)` every loop; `beat(ch, millis, ibiMs, peakSlope, locked)` | `T:uno-q/modulino-hub/sketch/sketch.ino:3-7,160,198,204,212,216` |
| Linux to STM32 | Bridge RPC | `buzz`, `heartbeat_sound`, `led(r,g,b,ms)`, `led_beat`, `pulse_period`, `sensor_power` | `T:uno-q/modulino-hub/sketch/sketch.ino:8-18,174-179` |
| Serial output | none | `Serial` appears 0 times in the sketch | `git show c5b4e04:uno-q/modulino-hub/sketch/sketch.ino \| grep -c Serial` = 0 |
| `GET /` or `/state` | HTTP, container `0.0.0.0:8080` | JSON with knob, climate, modulinos, bridge, beat, fingers, pulse, pulses, finger (fused), breathing, presence, ble | `T:uno-q/modulino-hub/app.py:34,36-37,481-497,558` |
| `GET /ppg?ch=0\|1` | HTTP | `{samples: [[t_ms STM32 millis, raw 14-bit], ...]}`, up to 1500 | `T:uno-q/modulino-hub/app.py:55,498-500`; `T:uno-q/modulino-hub/sketch/sketch.ino:6,212` |
| POST controls | HTTP query string | `/heartbeat?on`, `/presence?auto`, `/sensor?ch&on`, `/led/beat?on`, `/led?r&g&b&ms` (default ms 500), `/buzz?freq&ms`. 503 when the bridge call fails | `T:uno-q/modulino-hub/app.py:504-543` |
| Port mapping | Wendy mesh | host 18080 to container 8080, serviceCIDR 10.99.0.0/16. The team README lists the UNO Q as "mesh, port 18080" | `T:uno-q/modulino-hub/wendy.json:13-24`; `T:README.md:90` |
| mDNS | zeroconf IPv4 | `modulino-hub._http._tcp.local.`, TXT role=modulino-hub, path=/state, port 8080 | `T:uno-q/modulino-hub/app.py:561-574` |
| BLE "Afferent Finger" | GATT via BlueZ | 0x180D/0x2A37 `[0x00, fused bpm]`; 0x2A38 = 0x03; AFF0/AFF1 `[bpm1, bpm2, breaths/min]`, 0 = none | `T:uno-q/modulino-hub/ble.py:3-10,19-24,51-57,72-98`; `T:uno-q/modulino-hub/app.py:253,260` |
| Reachability | Wendy Net only | "reachable only inside Wendy Net"; "Hackathon Wi-Fi isolates clients" | `T:README.md:85-86,99` |

Values in `/state` used below:

- `knob = {position: int, pressed: bool, t}`. Each change overwrites it, with no event history (`T:uno-q/modulino-hub/app.py:41-47`).
- `climate = {celsius: 2 dp, humidity: 1 dp, t}` (`T:uno-q/modulino-hub/app.py:51-52`). No code states the humidity unit. The team README diagram says "Thermo °C / %RH" (`T:README.md:14`).
- `beat.bpm_live` is the fused finger BPM or null (`T:uno-q/modulino-hub/app.py:186-218`).
- Per-channel `bpm_live` is the median of the last 8 locked IBIs, with at least 3 needed, after dropping IBIs outside 0.75-1.35 x the autocorrelation period when that period has quality >= 0.3 (`T:uno-q/modulino-hub/app.py:120-131`).
- `presence = {auto, mode active|idle|probing, since, last_probe_range}` is finger presence, not room presence (`T:uno-q/modulino-hub/app.py:263-273,495`).
- `breathing = {per_minute, snr, channel}` (`T:uno-q/modulino-hub/app.py:357-362,427-444,494`).

### 2.2 Field-by-field against our contract

| Our item (ref) | Their nearest item (ref) | Verdict |
|---|---|---|
| Transport USB serial 115200 (`ours:contracts/api.md:350-352`) | No serial output; Bridge + HTTP + BLE (`T:...sketch.ino`, 0 `Serial`; `T:...app.py:558`; `T:...ble.py:19-24`) | Does not fit |
| `/ws/bedside` JSON client (`ours:contracts/api.md:325-340`) | No WebSocket client in modulino-hub: its imports are stdlib, `http.server`, `arduino.router_bridge`, `zeroconf`, and the local modules `network` (reads an interface IPv4 only) and `ble` (`T:uno-q/modulino-hub/app.py:16-32`; `T:uno-q/modulino-hub/network.py:7-15`), and its requirements are arduino-router-bridge, zeroconf and bless (`T:uno-q/modulino-hub/requirements.txt:1-3`). No file in the team repo contains `ws/bedside`, `:8000` or `afferent_hub` | Does not fit |
| `V <fw>` (`ours:contracts/api.md:358`) | No banner. Manifest version 0.1.0 (`T:uno-q/modulino-hub/wendy.json:3`) | Does not fit |
| `K turn <0-100>` (`ours:hub/afferent_hub/bedside/protocol.py:18-19`) | `knob.position` raw int, no bounds in code (`T:...app.py:47`; `T:...sketch.ino:198`). The Jetson reads it as clicks from 0, 0.40 + 0.01 per position (`T:jetson/vision/hub.py:105-108`; `T:README.md:68`) | Does not fit until the range is known (Alex Q6) |
| `K press` event (`ours:hub/afferent_hub/bedside/protocol.py:20-21`) | `knob.pressed` is a level, not an event (`T:...app.py:47`). A press and release between two polls leaves nothing in `/state`, because `_set` overwrites (`T:...app.py:41-43`) | Adapter needs a rising-edge detector on polled `pressed`, as the Jetson does (`T:jetson/vision/hub.py:109-114`). Not safe to build until it is known whether presses can be missed (Alex Q7) |
| `P <bpm>` (`ours:contracts/api.md:361`) | `beat.bpm_live` int or null (`T:...app.py:217`) | Adapter could use it. It would rely on app.py:186-218: per-finger candidates need a reading under 5 s old and period quality >= 0.2, and with no candidate it falls back to the fused period when its quality >= 0.5 (`T:...app.py:196-212`) |
| `P ... <quality>` 0-1 | `finger.quality` is the quality-weighted fused autocorrelation peak (`T:...app.py:167-180,238-240,493`). `pulses[c].quality` is the autocorrelation at the median IBI, "0..1; below ~0.2 treat as no signal" per its docstring (`T:...app.py:64-69,108`) | Same nominal range, unknown meaning: is it comparable with our 0.3 freshness gate (`ours:demo/js/sensors.js:149`)? (Alex Q8) |
| `P ... <contact>` | No contact field. `presence.mode` active/idle/probing exists (`T:...app.py:273`) | Does not fit until Alex says what stands for contact (Alex Q9) |
| `source: "ky039"` (`ours:hub/afferent_hub/bedside/protocol.py:25`; `ours:demo/js/sensors.js:142`; `ours:contracts/session.v3.schema.json:280-287`) | Hardware is two PulseSensors on A1/A2 (`T:...sketch.ino:1`; `T:README.md:58`) | Disagreement: labelling their reading `ky039` would be false. A new enum value is a contract change (David Q3) |
| `I <in_bed> <motion>` (`ours:contracts/api.md:362`) | No IR presence sensor. The sketch lists Knob, Thermo, two PulseSensors, Buzzer, KY-016 (`T:...sketch.ino:1-2`) | Does not fit. `daily.sleep.*` (`ours:contracts/daily.v1.schema.json:18-36`) and the idle light schedule's `in_bed` gate (`ours:hub/afferent_hub/bedside/controller.py:285-298`) have no real source |
| `T <temp_c> <humidity_pct>` every 60 s (`ours:contracts/api.md:363`) | `climate.celsius`, `climate.humidity`, notified every 2 s (`T:...app.py:52`; `T:...sketch.ino:4,202-205`) | Adapter could map it, relying on app.py:51-52. The %RH unit is in the README only (`T:README.md:14`), not in code (Alex Q10) |
| `L r g b level fade_ms` (`ours:hub/afferent_hub/bedside/protocol.py:45-51`) | `POST /led?r&g&b&ms`: ms is a hold time, ms <= 0 holds, 0,0,0 returns to auto mode. No level, no fade (`T:...app.py:529-532`; `T:...sketch.ino:11-12`) | Does not fit as-is. How level and fade should be expressed is not in code (Alex Q11) |
| `C 0/1` (`ours:contracts/api.md:370`) | No camera-indicator endpoint (`T:...app.py:504-543`) | Does not fit |
| `S` status request (`ours:contracts/api.md:371`) | `GET /state` snapshot (`T:...app.py:481-497`) | Equivalent if HTTP becomes the transport |
| Breathing rate | `breathing.per_minute`, BLE AFF1 byte 3 (`T:...app.py:362,494`; `T:...ble.py:81-90`) | No field in our contracts. The session schema only has breath-task fields (`ours:contracts/session.v3.schema.json:554,660-666`). Does not fit |
| Pulse stone privacy switch `pulse_stone` (`ours:contracts/api.md:88`) | `POST /sensor?ch&on` powers sensors and `/presence?auto` controls auto power (`T:...app.py:513-522`) | No link exists. Whether our switch should drive it is a design decision (David Q5) |

### 2.3 Where our assumptions disagree with their code

1. Transport. Ours is USB serial lines (`ours:contracts/api.md:350`; `ours:STATUS.md:109`). Theirs is RouterBridge plus HTTP on the Wendy mesh plus BLE (`T:uno-q/modulino-hub/sketch/sketch.ino:3-18`; `T:uno-q/modulino-hub/wendy.json:13-28`).
2. Pulse sensor. Ours is a KY-039 (`ours:contracts/api.md:361`; `ours:contracts/daily.v1.schema.json:37`; `ours:STATUS.md:30`). Theirs is two PulseSensors (`T:uno-q/modulino-hub/sketch/sketch.ino:1,33`; `T:README.md:58`).
3. Bed presence. Ours is an IR sensor (`ours:contracts/api.md:362`; `ours:STATUS.md:30`). Theirs has none, and their "presence" means a finger in the clip (`T:uno-q/modulino-hub/app.py:263-273`).
4. Knob. Ours is 0-100 (`ours:contracts/api.md:359`). Theirs is a raw `int(position)` (`T:uno-q/modulino-hub/app.py:47`).
5. LED purpose. Ours is a bedside light with level and fade, used for dawn and the schedule (`ours:hub/afferent_hub/bedside/controller.py:16-22,240-253`). Theirs is an indicator: off by default, optional beat flash, and the README warns that a light flashing at heart rate fakes rPPG (`T:uno-q/modulino-hub/sketch/sketch.ino:11-16`; `T:README.md:43-44`).
6. Knob press. Ours toggles the bedside camera (`ours:hub/afferent_hub/bedside/controller.py:189-196`). On theirs, the Jetson uses the same press to arm or disarm the person-buzzer (`T:jetson/vision/hub.py:90-114`; `T:README.md:69`), and presence counts any knob change as activity (`T:jetson/presence/app.py:157-167`). If all three consumers run together, one press does three things.
7. Thermo cadence. Ours is every 60 s (`ours:contracts/api.md:363`). Theirs notifies every 2 s (`T:uno-q/modulino-hub/sketch/sketch.ino:4`).
8. README vs code inside their repo: `T:README.md:61` says 2A37 carries finger 1, while code sends the fused value (`T:uno-q/modulino-hub/ble.py:8,72-74`; `T:uno-q/modulino-hub/app.py:260`). Not ours to fix. It matters only if we read BLE.

### 2.4 Do not build yet (UNO Q)

- No new serial firmware lines, no change to `parse_line` or `format_line`, and no `UnoQSerial` changes. The transport is not chosen (Alex Q2, David Q1).
- No HTTP-polling `BedsideSource` for `/state`. Reachability from our hub host and the port (8080 vs 18080) are unknown (Alex Q3, Q4).
- No BLE central in the hub or the app.
- No knob scaling, no contact rule, no quality mapping, no LED level/fade mapping (Alex Q6, Q8, Q9, Q11).
- No `pulsesensor` (or other) enum value and no breathing field in the contracts (David Q3, Q4).

## 3. Jetson `jetson/vision` ("afferent-vision"; git author wh1xdy)

### 3.1 Its real interfaces

| Interface | Transport | Format | Ref |
|---|---|---|---|
| `GET /rppg` | HTTP `0.0.0.0:3005`, Wendy mesh | `{camera: {bpm, snr, face, window_s, fps, cam1, cam2, fused: {bpm, sources, trust?}}, finger_bpm}`. No timestamp. Each camera re-estimates every 1 s; the fusion runs on each request. Poll only | `T:jetson/vision/app.py:887-892,1005`; `T:jetson/vision/rppg.py:361-373,445-476` |
| `GET /rppg/frame?cam=` | HTTP | image/jpeg with ROIs drawn, 404 JSON if there is no frame | `T:jetson/vision/app.py:895-902`; `T:jetson/vision/rppg.py:410-420,478-480` |
| `WS /stream` | WebSocket | text detection JSON `{detections, inference_ms, classes, boxes[{x1,y1,x2,y2 px, conf, cls, name}], frame_w, frame_h}`, then a binary JPEG. Accepts `switch_camera` and `confidence` commands | `T:jetson/vision/app.py:791-812,920-956` |
| `GET /hub`, `POST /hub/buzz` | HTTP | UNO Q link status, and a buzz proxied to the UNO Q | `T:jetson/vision/app.py:882-884,905-907`; `T:jetson/vision/hub.py:83-88,127-136` |
| UNO Q discovery | mDNS, then `http://<first IPv4>:<advertised port>` | polls `/state` every 0.25 s | `T:jetson/vision/hub.py:20-24,59-71,90-94` |
| Cameras | V4L2 | cam1 is labelled `/dev/video0` and fed from the YOLO capture; cam2 is `/dev/video2` if it exists, own capture | `T:jetson/vision/rppg.py:426-443`; `T:jetson/vision/app.py:610,832` |
| Always on | headless pseudo-client at startup | capture and YOLO run with no browser connected, and the capture feeds cam1 rPPG | `T:jetson/vision/app.py:610,872-879` |
| Network | Wendy mesh, port 3005 | | `T:jetson/vision/wendy.json:12-23`; `T:README.md:85-86` |

### 3.2 Against our contract

| Our item (ref) | Their nearest item (ref) | Verdict |
|---|---|---|
| `pose` on `/ws/bedside` with 10 named keypoints, normalised, `trunk_angle_deg` (`ours:contracts/api.md:338`) | No keypoint output. YOLOv8n-pose is used inside rppg.py only to find the eyes (`T:jetson/vision/rppg.py:337-358`). Detection JSON has boxes for every YOLO class found, with no keypoints; only `person` triggers the buzzer (`T:jetson/vision/app.py:787-812`; `T:jetson/vision/hub.py:22,117-125`) | Does not fit |
| `hello device: jetson_pose` (`ours:contracts/api.md:333`) | No client of our hub: no file in the team repo contains `ws/bedside`, `:8000` or `afferent_hub` | Does not fit |
| Hub pulse to phone, source `ky039`/`simulated` (`ours:contracts/api.md:272`) | `/rppg` `camera.fused.bpm` (`T:jetson/vision/rppg.py:458-461`) | An adapter would rely on rppg.py:445-476 (fused bpm int; trust score 0-100, `T:jetson/vision/rppg.py:142,469`) and the 1 s per-camera estimate. Blocked by reachability (`T:README.md:85-86`), by `/ws/app` `pulse` having no `rppg` source value (`ours:contracts/api.md:272`), and by not knowing whether anyone wants it (Alex Q12, David Q6) |
| Session `pulse_source: rppg` (`ours:contracts/session.v3.schema.json:280-287`) | Exists as an enum value. On our `main`, nothing calls `setPulse`: its definition is its only occurrence in `demo/js` (`ours:demo/js/sensors.js:146`). On ios-merge the phone plugin calls it (`im:demo/js/sensors.js:156-161`) | Matches as an enum value only. Two rPPG sources would share one label |
| `bedside_camera` privacy switch, default false; knob press toggles it (`ours:contracts/api.md:88,346`) | No on/off endpoint. Capture runs headless from startup (`T:jetson/vision/app.py:872-879`) | Disagreement: our switch cannot turn their camera off |

### 3.3 Disagreements

1. Lighting. Theirs needs a still face at 0.5-1 m, white light, and the ring light for cam2 (`T:README.md:41-44`). Our bedside light is warm or amber by schedule and dawn (`ours:hub/afferent_hub/bedside/controller.py:16-22`), and ios-merge chose "no forced white screen" (`im:Decisions.md:50`, X38). Whether the Jetson rPPG and our light are ever used at the same time is not stated anywhere.
2. Camera ownership. Ours: a privacy-gated, knob-toggled bedside camera that only sends a stick figure, "Never video" (`ours:contracts/api.md:323,346`; `ours:hub/afferent_hub/views.py:11`). Theirs: always-on capture serving JPEG frames on `/stream` and `/rppg/frame` (`T:jetson/vision/app.py:872-879,895-902,920-956`).
3. Ownership. `ours:STATUS.md:29` gives "pulse from face (rPPG)" to Romain. The team rPPG (`jetson/vision/rppg.py`, `ios/Afferent/PulseEstimator.swift`) has wh1xdy as its only git author.

### 3.4 Do not build yet (Jetson vision)

- No `/rppg` poller, no `pose` producer, no Jetson `hello`.
- No camera on/off coupling.
- No light rule tied to Jetson rPPG (Alex Q13, Q14).

## 4. Jetson `jetson/presence` ("afferent-presence"; git author lusca-vlad-30322, linked to Vlad by the handle only)

### 4.1 Its real interfaces

| Interface | Transport | Format | Ref |
|---|---|---|---|
| `GET /` or `/summary` | HTTP `0.0.0.0:8090`, host network | `{presence, guests (+ nearby_devices), profile, health, sim, truth}` | `T:jetson/presence/app.py:46,230-255,313`; `T:jetson/presence/wendy.json:14-22` |
| `GET /presence`, `/guests`, `/health`, `/profile` | HTTP | sub-objects | `T:jetson/presence/app.py:256-265` |
| Presence fields | | `state` home/away/unknown, `since`, `reason`, `absence_min`, `away_today_min` (min, 1 dp), `outings_today`, `days_since_last_outing`, `isolation_alert`, `coverage_today` (0-1), `network_outage_min_today`, `recent_outings`, `recent_network_outages` | `T:jetson/presence/core.py:191-228` |
| Guest fields | | `guests_now`, `visits_today`, `guest_minutes_today`, `days_since_last_visit`, `nearby_unknown_devices`, `baseline`, `recent_visits[{start, end, peak_guests}]` | `T:jetson/presence/core.py:475-502` |
| "Today" | | starts at local midnight of the container clock (`time.localtime`) | `T:jetson/presence/core.py:33-39,192,476` |
| POST controls | HTTP | `/activity`, `/profile?name=`, `/calibrate?minutes=`, `/truth?state=`, `/sim` | `T:jetson/presence/app.py:267-303` |
| Outbound | HTTP to `HUB_URL` (the UNO Q modulino-hub, not our hub) | `GET /state` knob as activity, `POST /buzz` on left/returned/isolation | `T:jetson/presence/app.py:50,147,151-181,206-212` |
| Reachability | same Wi-Fi as the device; `wendy net forward` does not reach it | | `T:jetson/presence/README.md:103-110`; `T:jetson/presence/wendy.json:14-22` |
| Tick | every `SCAN_INTERVAL_S`, 30 s in the manifest | | `T:jetson/presence/wendy.json:11`; `T:jetson/presence/app.py:47,219-226` |

### 4.2 Against our contract

| Our item (ref) | Their nearest item (ref) | Verdict |
|---|---|---|
| Session `context.home` bool or null (`ours:contracts/session.v3.schema.json:1081-1086`) | `presence.state` home/away/unknown (`T:jetson/presence/core.py:29,218`) | Closest match on our side. An adapter would map home to true, away to false, unknown to null, relying on core.py:191-228. Blocked by reachability from the phone or our hub (Vlad Q2) |
| Daily `presence.away_hours` (`ours:contracts/daily.v1.schema.json:60`) | `away_today_min` in minutes (`T:jetson/presence/core.py:193-194,208`) | Unit conversion is clear. The day boundary is not: our record for date D covers the night ending on D's morning plus D's daytime (`ours:contracts/daily.v1.schema.json:5`), theirs runs from local midnight (`T:jetson/presence/core.py:37-39,192`), and which timezone the container uses is not in code (Vlad Q3) |
| Daily `presence.home_hours` (`ours:contracts/daily.v1.schema.json:59`) | No field. `coverage_today` and `network_outage_min_today` show that time can be neither home nor away (`T:jetson/presence/core.py:203-213`) | Does not fit without a rule nobody has given (Vlad Q4) |
| Daily `presence.home_only` = away_hours < 0.5 (`ours:contracts/daily.v1.schema.json:61`) | Derivable from away_today_min, but `outings_today` counts only outings >= 900 s (`T:jetson/presence/core.py:54,195-196`); no profile changes that value (`T:jetson/presence/app.py:56-90`) | Two different "went out" definitions. Which one feeds `home_only_days` (`ours:hub/afferent_hub/analytics/features.py:114-115`) is open (David Q7) |
| Daily `presence.visitors_count`, "count of unfamiliar nearby devices" (`ours:contracts/daily.v1.schema.json:57,62`) | `visits_today` (visits), `guests_now` (unknown devices in excess of the learned baseline), `peak_guests` per visit (`T:jetson/presence/core.py:441-463,475-502`) | Semantics differ (devices vs visits). Does not fit until Vlad says which is meant (Vlad Q5) |
| Session `context.visitors_present` (`ours:contracts/session.v3.schema.json:1087-1089`) | `guests_now` (`T:jetson/presence/core.py:486`) | Possible match. Same reachability block |
| Privacy `phone_presence` (`ours:contracts/api.md:88`; `ours:hub/afferent_hub/views.py:14`) | No off switch in the service except stopping the app (`T:jetson/presence/app.py:267-303`) | Disagreement: our switch has nothing to act on |
| Live daily record presence block | Not written by our hub today (`ours:hub/afferent_hub/service.py:261-273`) | Nothing to replace |

### 4.3 Disagreements

1. Where presence is measured. Ours: "Phone presence via Wi-Fi/BLE at the bedside unit" (`ours:contracts/daily.v1.schema.json:57`). Theirs: a separate WendyOS service on the Jetson, or any WendyOS board with Wi-Fi and Bluetooth (`T:README.md:8`; `T:jetson/presence/README.md:26`).
2. Hub naming. Their `HUB_URL` is the UNO Q (`T:jetson/presence/app.py:50,147,151-181`). Ours is `afferent_hub` on :8000 (`ours:contracts/api.md:15`). Different things with the same word.
3. Heart check-in as activity. Their README says a heart check-in holds HOME via `POST /activity` (`T:jetson/presence/README.md:215`). Nothing in their repo or ours calls `/activity`; their hub poll reads only the knob (`T:jetson/presence/app.py:157-167`).

### 4.4 Do not build yet (presence)

- No presence-to-daily aggregation.
- No `context.home` or `visitors_present` fill.
- No `POST /activity` call from our hub on session start (Vlad Q6).

## 5. iOS: team `ios/Afferent` and our `ios-merge` wrapper

### 5.1 State

| Item | Fact | Ref |
|---|---|---|
| Our plugin | `AfferentPulse` (start/stop/relock) drives the team `PulseCamera` and emits `pulse` and `eyes` | `im:ios/App/App/AfferentPulse.swift:4-12,69-119` |
| `pulse` event | `{source: rppg, t (CACurrentMediaTime), face, locked, window_s, bpm or null, quality = trust.score/100 (0 with no reading), trust, snr, motion, regions_bpm, light}` | `im:ios/App/App/AfferentPulse.swift:99-118` |
| `eyes` event | at most 30 Hz, `{tracked, t, source: vision, blink_l, blink_r, openness, pitch_deg, ambient}` | `im:ios/App/App/AfferentPulse.swift:85-96`; `im:ios/App/App/VisionEyes.swift:95-106` |
| Game wiring | on native iOS tries `vision` first, falls back to `arkit`; elsewhere `mediapipe`. Pulse goes to `setPulse(bpm, quality, 'rppg')` | `im:demo/js/sensors.js:66-95,156-161` |
| Quality gate | rPPG counts only while quality >= 0.3, so trust score >= 30 | `im:demo/js/sensors.js:164-166`; `im:ios/App/App/AfferentPulse.swift:107` |
| Team files in ios-merge | All 7 files in `im:ios/App/App/Team/` are blob-identical to `eea9238:ios/Afferent/*`. At `c5b4e04`, AfferentApp, Expressions, ExpressionView, FingerSensor and PulseCamera differ; CheckInView and PulseEstimator are unchanged | `git rev-parse` of each blob; `git diff --stat eea9238 c5b4e04 -- ios` |
| FingerSensor in ios-merge | compiled (`im:ios/App/App.xcodeproj/project.pbxproj:25,206`) but only `Team/AfferentApp.swift:12` instantiates it, and that file has no build entry (`project.pbxproj:51,112`, file ref only) | Not used by the Capacitor app |
| Team main now | PulseCamera drives screen brightness via ScreenLight (clamped 0.12-0.85); FingerSensor reads AFF1 bytes 0-2 | `T:ios/Afferent/PulseCamera.swift:84,211`; `T:ios/Afferent/ScreenLight.swift:11-52`; `T:ios/Afferent/FingerSensor.swift:103-110` |

### 5.2 Verdicts

| Our item | Their item | Verdict |
|---|---|---|
| `setPulse(bpm, quality, 'rppg')` (`ours:STATUS.md:98`) | `AfferentPulse` `pulse` event | Integrated on ios-merge through copied team code, not through a team service. Device test status is not recorded in the files read here (David Q8) |
| `eyes_source` enum | ios-merge emits `vision` (`im:demo/js/sensors.js:110`) and its schema allows it (`im:contracts/session.v3.schema.json:292-299`). Our main schema does not (`ours:contracts/session.v3.schema.json:291-297`) | Disagreement between our own branches: a hub from `main` validates sessions against its schema (`ours:contracts/api.md:142`; `ours:hub/afferent_hub/service.py:11,39`) and would reject `eyes_source: "vision"` (David Q9) |
| Pulse stone via BLE `FingerSensor` | the AFF1 3-byte format on team main (`T:ios/Afferent/FingerSensor.swift:103-110`) | Does not fit today: not instantiated in ios-merge, and ios-merge holds the older parser that reads 2 bytes and no breathing byte (`im:ios/App/App/Team/FingerSensor.swift:97-100`) (David Q10) |
| X38 "no forced white screen" (`im:Decisions.md:50`) | Team main PulseCamera now calls ScreenLight (`T:ios/Afferent/PulseCamera.swift:84,211`) | Disagreement if ios-merge ever pulls the post-merge PulseCamera (David Q11) |

### 5.3 Do not build yet (iOS)

- Do not re-copy post-merge team Swift files into ios-merge.
- Do not instantiate FingerSensor.
- Do not add a BLE pulse path to sensors.js (David Q10, Q11).

## 6. Posture POC on `poc/laptop-markers` (`5c29681`; commits not on team main: Romain Chaumontet 10, Devin 4, Wameuh 1)

| Our item (ref) | Their item (ref) | Verdict |
|---|---|---|
| `pose` message, 10 named keypoints, normalised (`ours:contracts/api.md:338`) | RTMPose Halpe-26 keypoints inside the pipeline, angles such as `trunk_inclination`, SQLite minute aggregates (`poc/laptop-markers:posture-analysis/posture/README.md:6-10`; `afferent/config.py:82`; `afferent/gait.py:26`). `urllib` appears only in `download_models.py` and `face.py`, and `face.py` uses it for a MediaPipe model URL (`afferent/face.py:9,19`). No WebSocket, `requests` or `httpx` client in `posture-analysis/posture` | Does not fit. No client exists |
| Hub port 8000 (`ours:contracts/api.md:15`) | Posture server defaults to `0.0.0.0:8000` and compose maps 8000:8000 (`poc/laptop-markers:posture-analysis/posture/afferent/__main__.py:8-13`; `posture-analysis/posture/docker-compose.yml:9-10`) | Disagreement: both bind 8000 if they run on the same laptop |
| Bedside camera privacy and "Never video" (`ours:contracts/api.md:323`) | `GET /stream.mjpg` serves annotated frames, and the team's own review says face embeddings are stored in the clear and the API has no access control (`poc/laptop-markers:posture-analysis/posture/afferent/server.py:53-70`; `docs/implementation_review.md:24-31`) | Disagreement |
| Plan | The demo stack runs on the laptop; the Jetson port and the Arduino output come in phase 7, "after validation" (`poc/laptop-markers:docs/plan_posture_depression.md:180,275-283,375`) | Nothing to integrate by the POC's own plan |

Do not build: no pose relay, no port change (Romain Q2, Q3).

## 7. Cross-cutting: network placement

| Fact | Ref |
|---|---|
| Our hub serves phone and dashboard on the LAN, port 8000 | `ours:contracts/api.md:15` |
| Modulino-hub and afferent-vision are mesh-only | `T:README.md:85-86`; `T:uno-q/modulino-hub/wendy.json:13-24`; `T:jetson/vision/wendy.json:12-23` |
| Presence is host-network and needs the same Wi-Fi as the device it runs on | `T:jetson/presence/README.md:103-110`; `T:jetson/presence/wendy.json:14-18` |
| Hackathon Wi-Fi isolates clients | `T:README.md:99` |
| Our docs mention Gemma "on the Jetson" | `ours:STATUS.md:62` |

Where our hub process runs at the demo (laptop or Jetson), and whether that host is a Wendy Net participant, is not in any file. Every adapter above depends on it (David Q2).

## 8. Matches as-is

None on the wire. No team service speaks any of our formats, and none of our code calls a team endpoint (no `/activity`, `8090`, `18080`, `modulino`, `/rppg` or `3005` in our `hub/`, `demo/js/`, `contracts/` or ios-merge `demo/js/` and plugin Swift). The only working link is the ios-merge `AfferentPulse` plugin, which copies the team's Swift code instead of talking to a team service.

## 9. Open questions by owner (each answerable in one line)

### David

1. Do we keep `contracts/api.md` section 4 (USB serial) as the UNO Q contract, or replace it with the team's HTTP `/state` or BLE?
2. Where does `afferent_hub` run at the demo (laptop or Jetson), and is that host a Wendy Net participant?
3. If the UNO Q finger pulse reaches the hub, what `source` value should it carry, since `ky039` is wrong (`ours:contracts/session.v3.schema.json:280-287`)?
4. Do we want a breathing-rate field in session v3 at all (team `breathing.per_minute`)?
5. Should our `pulse_stone` privacy switch power the finger sensors off via `POST /sensor`?
6. Do we want the Jetson camera rPPG in the game, given the phone rPPG on ios-merge already feeds `rppg`?
7. Which "went out" definition feeds `home_only`: total away time >= 30 min a day (ours), or team outings >= 15 min each?
8. Has the ios-merge `AfferentPulse` build been run on the demo iPhone yet?
9. Should our `main` schema accept `eyes_source: "vision"` as ios-merge's does?
10. Should the phone read the finger pulse over BLE (team FingerSensor), or should the hub receive it?
11. Do we stay on the pre-merge team PulseCamera (no ScreenLight) per X38?

### Romain

1. Is "pulse from face (rPPG)" (`ours:STATUS.md:29`) yours or wh1xdy's, now that the team rPPG is in `jetson/vision` and `ios/`?
2. Should the posture POC send `pose` to our `/ws/bedside` for this demo, yes or no?
3. If the POC and our hub share a laptop, which one moves off port 8000?
4. Does the posture POC run during the demo at all, or does it stay a separate showcase?

### Alex (please confirm first)

1. Are you wh1xdy, the author of `uno-q/`, `jetson/vision/` and `ios/`?
2. Will the UNO Q ever print our serial lines (`V/K/P/I/T`), or is HTTP/BLE final?
3. From a non-Wendy laptop on the venue network, can `http://<uno-q>:18080/state` be reached without `wendy net forward`?
4. Which port does a Wendy Net peer actually reach: 8080 (mDNS, `app.py:569`) or 18080 (`wendy.json:19`, `README.md:90`)?
5. Is the UNO Q's USB serial usable by a laptop while the Wendy app holds the MCU via arduino-bridge?
6. What is the min and max of `knob.position`?
7. Can a knob press and release happen between two 0.25 s polls without showing in `/state`?
8. What does `finger.quality` mean in plain terms, and what value means "trust this BPM"?
9. Which `/state` field, if any, means "a finger is on the sensor" (our `contact`)?
10. The README says Thermo gives %RH (`README.md:14`); is that what `climate.humidity` carries? No code says.
11. Should the KY-016 show our bedside light colours at all, and if so, how do we send a level and a fade?
12. Is anything besides `index.html` (`jetson/vision/index.html:307`) meant to read `GET /rppg`?
13. Will the Jetson rPPG be used under our warm bedside light, or only under white or ring light?
14. Can the Jetson camera be switched off on request (for our `bedside_camera` privacy switch)?
15. Is there an IR bed-presence sensor anywhere in the hardware plan, yes or no?
16. Is the C920 always `/dev/video0` and the Arduino camera always `/dev/video2` on the demo Jetson?
17. Do `jetson/vision` and `jetson/presence` run on the same Jetson at the same time?

### Vlad (please confirm first)

1. Are you lusca-vlad-30322, the author of `jetson/presence`?
2. Which component should read `:8090/summary` (our hub, the phone, or none), and is it on the same Wi-Fi as our hub?
3. Which timezone does the presence container use on the demo Jetson? Its "today" starts at local midnight (`core.py:37-39,192`).
4. How should `home_hours` be derived when some time is `unknown` or a network outage?
5. Does our `visitors_count` mean `visits_today`, `guests_now`, or the max `peak_guests` of the day?
6. Should our hub call `POST /activity` when a game session starts?
7. Has the service run on the demo Jetson with real `PHONE_MACS`, and with which `PROFILE`?
8. In the demo setup, is `HUB_URL` set to the UNO Q, and should the left/returned buzzes play?
