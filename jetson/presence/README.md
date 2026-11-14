# afferent-presence — Wi-Fi / BLE home presence & guest detection

Passive "digital phenotyping" service for the *Beyond the Clinic* system: after a
patient with depression leaves hospital, it watches two everyday behaviours —
**do they leave the house** and **do they see people** — without cameras,
microphones or any action from the patient beyond carrying their phone.

## Why this matters

Depression shows up in behaviour before patients report it.

| Signal | What we measure | Clinical meaning |
|---|---|---|
| **Mobility** | patient's phone on the home Wi-Fi → home/away, outings per day, minutes out, days since last real outing, isolation alert | Reduced time outside the home is one of the strongest digital markers of depression severity (behavioural withdrawal, low energy, anhedonia, psychomotor retardation). |
| **Social contact** | extra phones near the device over Bluetooth → visits, guest minutes, days since last visit | Social withdrawal is a hallmark of relapse and worsens rumination. Long stretches with no visitors are a warning sign. |

The output is a few simple daily numbers. Compared against the patient's *own*
normal pattern, a sustained drop (e.g. 3 days without leaving, a week without
visitors) is the trigger to prompt the patient (UNO Q light/buzzer) or alert the
care team. These are indicators to watch, **not a diagnosis**.

---

## Deploy on any WendyOS device (from any laptop)

Works on any WendyOS board with Wi-Fi + Bluetooth (Jetson, Raspberry Pi, …).
Commands are for **Git Bash on Windows**, macOS Terminal or Linux.

### 1. One-time setup on the laptop

| Need | How |
|---|---|
| Wendy CLI | `curl -fsSL https://install.wendy.dev/cli.sh \| bash` — on Windows run it in **Git Bash**; if it fails with *Permission denied* on `/usr/local`, use `curl -fsSL https://install.wendy.dev/cli.sh \| bash -s -- -d "$HOME/.local/bin"` and add `export PATH="$HOME/.local/bin:$PATH"` to `~/.bashrc` |
| Docker Desktop | install from docker.com and **start it** — `wendy run` builds the container image on the laptop (the boards have no image builder). Only needed while deploying. |
| Wendy account | `wendy auth login` (opens the browser; you must be invited to the team's Wendy Cloud org). Sign-in lasts ~1 day; run it again when commands say `auth_required`. |
| This repo | `git clone https://github.com/wh1xdy/afferent-junction2026 && cd afferent-junction2026/jetson/presence` |

Check: `wendy --version`, `docker info` (no error), `wendy auth status`.

### 2. Pick the device

```sh
wendy cloud discover        # every board in the org, with its cloud:// selector
wendy discover              # boards on USB / the same LAN (faster deploys)
DEV='cloud://api.wendy.dev:443/tenant/<tenant>/asset/<asset>'   # paste the selector
```

The Junction Jetson is
`cloud://api.wendy.dev:443/tenant/e064d3cd-1e43-45af-adf2-37b0afe5e3da/asset/149628ce-6c13-44b8-9b2a-ec527e20caf7`.

### 3. Put the device and the patient's phone on the same Wi-Fi

The device must be on **the same Wi-Fi network as the patient's phone** — that is
what it watches. Use a small network that roughly covers one home: a home router,
a travel router or a **phone hotspot**. Big shared networks (office, campus,
hackathon, apartment-building Wi-Fi) usually block devices from seeing each other
and cover far more than one home.

If you use a phone hotspot: 2.4 GHz, WPA2-Personal, **mobile data on** (the
device reaches Wendy Cloud through it), charger plugged in, battery saver and
"turn hotspot off automatically" **off**.

```sh
wendy --device "$DEV" device wifi list                     # is the network visible?
wendy --device "$DEV" device wifi list > /dev/null && \
  wendy --device "$DEV" device wifi connect --ssid "<SSID>" --password "<password>"
```

The connect command often **hangs** — that is the device leaving its old network
mid-reply. Press Ctrl+C after ~30 s and check:

```sh
wendy --device "$DEV" device wifi status                   # → "ssid": "<SSID>"
```

### 4. Get the patient phone's Wi-Fi MAC

Connect the phone to that network, then:
- **iPhone:** Settings → Wi-Fi → ⓘ next to the network → *Private Wi-Fi Address* = **Fixed** (or Off) → copy *Wi-Fi Address*.
- **Android:** Settings → Wi-Fi → network → ⚙ → Privacy → **Use device MAC** (or randomized but *not* re-randomized) → copy the MAC.

### 5. Deploy

```sh
cd jetson/presence
PROFILE=demo PHONE_MACS='aa:bb:cc:dd:ee:ff' wendy run --device "$DEV" --detach --yes
```

- `PROFILE`: `demo` for testing / on stage, `home` for real use (see *Profiles*).
- The first build takes ~5–10 min (the image is built for ARM under emulation, then uploaded ~80 MB). Later builds are faster.
- Optional: `HUB_URL=http://<uno-q-ip>:18080` (knob = proof of being home, buzzer alerts), `PATIENT_BLE_ADDRS=<watch/tag BLE address>` (backup when the phone dies).
- No reachable phone at all? `SIM=1 wendy run …` runs it with a simulated phone (drive it with `POST /sim`).

### 6. Check it works

```sh
wendy --device "$DEV" device apps list                      # afferent-presence → RUNNING
wendy --device "$DEV" device logs --app afferent-presence   # live events, Ctrl+C to stop
```

The log should show `presence on :8090 (… phone macs=1 …)` and `BLE scan running`.

**Status in a browser:** connect the laptop to the **same Wi-Fi** as the device
and open `http://<device-ip>:8090/summary` (device IP: `wendy --device "$DEV" device info`,
or the hotspot's list of connected devices). Expect `"state": "home"` and
`"health": {"wifi": "ok", "ble": "ok"}`.

The app runs on the device's own network (needed to see the phone), so
`wendy net forward` does **not** reach it; use the browser on the same Wi-Fi, or
ask an assistant with the Wendy MCP tools to read `/summary` inside the container.

### 7. Test it (≈ 10 min, one phone is enough)

With `PROFILE=demo`:

1. `/presence` → `home`.
2. Turn the patient phone's **Wi-Fi off**. After ~2 min → `away`; a new item appears in `recent_outings`, its `start` back-dated to the last sighting. Log: `event: left_home`.
3. Wi-Fi **on** → `home` within ~30 s, the outing gets an `end`. Log: `event: returned_home`.
4. Short drop (Wi-Fi off < 2 min) → stays `home`, no outing.
5. Bluetooth: `curl -X POST http://<device-ip>:8090/calibrate` (5 min, nobody extra near the device). Then hold a *different* phone right next to the device for 3 min → `/guests` shows `guests_now: 1` and a visit; `nearby_devices` shows what is counted (earbuds/laptops are listed but `counted: false`).

Longer, real-world reliability testing: see *Reliability test plan* below.

### Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `docker daemon is not running` | start Docker Desktop, rerun |
| `has no BuildKit daemon` | you passed `--build-host`; leave it out (build on the laptop) |
| `auth_required` / `not logged in` | `wendy auth login` |
| `is offline or unavailable` | the device lost internet — usually the hotspot dropped or mobile data is off; it reconnects by itself within a minute once the network is back |
| `wifi connect`: *No network with SSID … found* | run `wifi list` first (refreshes the scan), keep the hotspot screen on, 2.4 GHz + WPA2 |
| Logs end with `EOF` | the device's connection dropped (hotspot); rerun the logs command |
| Browser times out on `:8090` | the laptop is not on the same Wi-Fi as the device |
| `health.wifi`: *gateway … not reachable* | the device lost the Wi-Fi network; state goes `unknown`, never `away` |
| Phone never seen, router is | network blocks client-to-client traffic (shared Wi-Fi) → use a hotspot/own router |
| `guests_now` far too high | not calibrated, or a crowded room → `POST /calibrate`, use `PROFILE=demo` (shorter range) |

### Run locally without a device

```sh
pip install bleak                       # only needed for real BLE; SIM mode works without it
SIM=1 PROFILE=demo DATA_DIR=./data python app.py
curl localhost:8090/summary
curl -X POST localhost:8090/sim -d '{"phone_wifi": false}'   # phone leaves
curl -X POST localhost:8090/sim -d '{"guests": 1, "gadgets": 2}'
python -m unittest discover -s tests -v                      # 37 scenario tests
```

---

## Profiles (switch live, no redeploy)

| Profile | Away after | BLE range (RSSI floor) | Guest dwell | Counts | Use |
|---|---|---|---|---|---|
| `home` (default) | 10 min (45 at night) | −65 dBm ≈ one room | 10 min | phones only | real flat |
| `demo` | 2 min | −65 dBm ≈ same room (~5 m) | 2 min | phones only | stage / testing |
| `classic` | 10 min | −75 dBm ≈ whole flat+ | 10 min | every BLE device | original v0.1 tuning |

```sh
curl -X POST 'http://<device-ip>:8090/profile?name=demo'   # switch live
curl -X POST 'http://<device-ip>:8090/calibrate'            # relearn BLE background after a switch
```

Why a tighter BLE range: RSSI falls with distance, so the floor decides how far the
"home" reaches. −75 dBm picks up neighbours and, in a hall, hundreds of devices
(measured at Junction: 438 devices in 15 s, 34 above −75). −55 keeps roughly what
is within arm's reach, so one guest sitting down is a clear +1; the demo profile uses
−65 (≈ 5 m, the same room), which reaches further but picks up more passers-by in a crowd. RSSI is noisy
(bodies, walls, pockets): treat these as rough distances and check `nearby_devices`.

Phones-only counting uses the maker data in each BLE advert (Apple Continuity
message type, Samsung/Google/Xiaomi/Huawei company IDs, Google Nearby service
UUIDs) to drop earbuds, laptops, watches, AirTags and beacons. It is a heuristic:
some Android phones advertise nothing identifying and are then not counted.

## Configuration (env, see `wendy.json`)

| Var | Default | Meaning |
|---|---|---|
| `PROFILE` | home | `home` / `demo` / `classic` (values below override it) |
| `PHONE_MACS` | – | Wi-Fi MAC(s) of the patient's phone, comma separated |
| `PATIENT_BLE_ADDRS` | – | fixed BLE address of a patient-owned watch/band/tag (backup token) |
| `AWAY_AFTER_MIN` / `NIGHT_AWAY_AFTER_MIN` | from profile | silence needed before AWAY (day / 00–06) |
| `ISOLATION_DAYS` | 2 | no outing ≥ 15 min for this long → `isolation_alert` |
| `GUEST_RSSI_MIN` / `GUEST_DWELL_MIN` / `GUEST_PHONES_ONLY` | from profile | BLE range, visit length, phones-only |
| `SCAN_INTERVAL_S` | 30 | |
| `HUB_URL` | – | UNO Q modulino-hub, for activity + buzzer |
| `SIM` | – | `1` = simulated phone/guests |

`wendy.json` grants **host networking** (to read the LAN's ARP table),
**bluetooth** (BlueZ via filtered D-Bus) and a **persistent volume** at `/data`
(state + `ticks.jsonl` survive restarts and redeploys).

## API

| | |
|---|---|
| `GET /summary` | everything below + probe health + active profile |
| `GET /presence` | `state` home/away/unknown, `reason`, `away_today_min`, `outings_today`, `days_since_last_outing`, `isolation_alert`, `coverage_today`, `network_outage_min_today`, recent outings and network outages |
| `GET /guests` | `guests_now`, `visits_today`, `guest_minutes_today`, `days_since_last_visit`, baseline, `nearby_devices` |
| `GET /profile`, `POST /profile?name=…` | show / switch tuning |
| `POST /activity` | an in-home interaction happened (proves "home" when the phone is dead) |
| `POST /calibrate[?minutes=N]` | learn household devices + background BLE level — nobody extra around |
| `POST /truth?state=home\|away` | ground-truth marker for testing (only logged) |
| `POST /sim` | SIM mode: `{"phone_wifi": true/false/null, "guests": 2, "neighbours": 5, "gadgets": 3}` |

## Edge cases and how they are handled

| Edge case | Risk | Handling (code) |
|---|---|---|
| Phone Wi-Fi power-save / Android doze | false "left home" every few minutes | ARP sweep (sleeping phones still answer L2), 2 rounds per scan, AWAY only after continuous silence |
| Deeper sleep at night | false outings at night | separate 45 min night threshold |
| Stale ARP cache | phone looks home after leaving | only `REACHABLE` neighbour entries count — not `STALE`, `DELAY` or `PROBE` (found on the Jetson: those kept a phone "home" ~1 min too long) |
| Hotspot / router drops out | false "away", hidden blind time | probe reports *could not look* → absence not counted, state `unknown`; `network_lost`/`network_restored` events and `network_outage_min_today` |
| Dead battery / phone off while patient is home | false "away" | knob turn / heart check-in (`POST /activity`, UNO Q poll) holds HOME 30 min; optional BLE wearable as backup token |
| Device reboot / app restart | gap counted as absence | state saved atomically to `/data`; tick gaps > 3 min are not counted |
| Flapping at the edge of Wi-Fi range | many tiny outings | hysteresis: one sighting = HOME, long silence = AWAY |
| Outing detected late | wrong outing duration | outing start back-dated to the last sighting — never into a blind window |
| Taking the bins out (2–5 min) | resets isolation | outings < 15 min don't reset `days_since_last_outing` |
| Phone MAC randomisation (Wi-Fi) | phone never recognised | setup step: fixed per-network address; multiple MACs allowed |
| BLE MAC rotation (~15 min) | one guest counted as many | guests = *concurrent* devices in a short window + min-filter that removes the rotation double-count |
| Earbuds, laptops, watches, AirTags | inflate guest count | phones-only counting (BLE maker data) |
| Neighbours' phones through walls | permanent fake guests | RSSI floor + calibrated background level |
| TV, speaker, laptop, smart bulbs | permanent fake guests | calibration learns fixed-address household devices and ignores them |
| Delivery driver / passer-by | fake visit | a visit needs continuous extra devices for the dwell time |
| Guest's locked phone advertises in bursts | one visit split into several | devices stay "nearby" for the window after their last advert |
| Devices present while the patient is out | fake social contact | visits only counted while the patient is HOME |
| Shared Wi-Fi isolates clients | phone never visible | reported as unhealthy (not "away"); use a hotspot / own router, or `SIM=1` |

Known limitations: a phone left at home while the patient goes out looks like
"home" (camera fusion is meant to cover this); BLE guest counting is an estimate
(guests without a phone, or with Bluetooth off, are invisible).

## Reliability test plan

Goal: measure how often the system is right, not just that it runs. Every scan
is logged to `/data/ticks.jsonl`; `tools/score.py` compares it with ground truth.

**0. Bench check (10 min).** Step 7 above. Also unplug the router / stop the
hotspot → state must go `unknown`, never `away`.

**1. Phone sleep soak (one night + one day, phone at home, screen off).**
Expected: 0 outings. Repeat with iPhone *and* Android, with Low Power Mode /
battery saver on. False outings → raise `AWAY_AFTER_MIN` / `NIGHT_AWAY_AFTER_MIN`.

**2. Scripted outings (one afternoon, ≥ 10 outings, `PROFILE=home`).** Mark ground
truth at the door (`curl -X POST .../truth?state=away` / `home`, or a diary CSV
`start,end,state`). Mix 3 min, 15 min and 1 h outings; stand just outside the door
for 5 min. Then:

```sh
python tools/score.py ticks.jsonl diary.csv --lag-min 10
```

Targets: outing recall ≥ 95 % (outings ≥ 15 min), precision ≥ 95 %, return
error ≤ 1 min.

**3. Failure injection.** Router reboot (→ `unknown`, no outing), app restart
(state restored), Bluetooth off (`health.ble` error, Wi-Fi still works), phone
dies while home (UNO Q knob every 15 min → stays `home`).

**4. Guests.** Calibrate with nobody extra around, then 1, 2, 3 visitors with
phones for 30 min each, a 3 min "delivery" at the door, one visitor with a locked
phone. Expect visits with the right `peak_guests` (±1), none for the delivery;
24 h alone → ≤ 1 false visit per week.

**5. Long run (≥ 7 days, real life).** Keep a simple diary. Score weekly:
`away_today_min` vs diary, `coverage_today` ≥ 95 %. Quote: "X % accuracy, Y %
outing recall over N days".
