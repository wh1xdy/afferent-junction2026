# afferent-presence — Wi-Fi / BLE home presence & guest detection

Passive digital-phenotyping service for the "Beyond the Clinic" system. It answers:

| Question | Clinical marker | How |
|---|---|---|
| Is the patient home or out? How often / how long do they leave? | behavioural withdrawal, psychomotor retardation, anhedonia | patient's phone on the home Wi-Fi (ARP), optional BLE token, in-home activity |
| Do they get visitors? | social withdrawal | count of extra BLE devices in the flat, over a learned baseline |

Vision fusion (camera occupancy) is intentionally out of scope here; the
`/presence` output exposes `reason` and `last_seen_by` so it can be fused later.

## Run

```sh
cd jetson/presence
PHONE_MACS=aa:bb:cc:dd:ee:ff wendy run --device <jetson> --detach --yes
# demo without a reachable phone (e.g. hackathon Wi-Fi with client isolation):
SIM=1 wendy run --device <jetson> --detach --yes
```

`wendy.json` uses **host networking** (needed to see the LAN's ARP table),
`bluetooth` (BlueZ via filtered D-Bus) and a `persist` volume at `/data`.
Because it is not on the `mesh` network, set `HUB_URL=http://<uno-q-ip>:18080`
explicitly if you want knob activity / buzzer alerts from the UNO Q.

Locally (no device): `SIM=1 DATA_DIR=./data python app.py`, then `curl localhost:8090/summary`.

### Profiles (switch live, no redeploy)

| Profile | Away after | BLE range (RSSI floor) | Guest dwell | Counts | Use |
|---|---|---|---|---|---|
| `home` (default) | 10 min (45 at night) | −65 dBm ≈ one room | 10 min | phones only | real flat |
| `demo` | 2 min | −55 dBm ≈ at the table (1–2 m) | 2 min | phones only | stage / hackathon hall |
| `classic` | 10 min | −75 dBm ≈ whole flat+ | 10 min | every BLE device | original v0.1 tuning |

```sh
PROFILE=demo PHONE_MACS=... wendy run --device <jetson> --detach --yes   # start in demo
curl -X POST 'http://<jetson>:8090/profile?name=demo'                     # or switch live
curl -X POST 'http://<jetson>:8090/calibrate'                              # relearn background after a switch
```

Why a tighter BLE range: RSSI falls with distance, so the floor decides how far the
"flat" reaches. −75 dBm picks up neighbours and, in a hall, hundreds of devices
(measured at Junction: 438 devices in 15 s, 34 above −75). −55 keeps roughly
what is within arm's reach of the Jetson, so one guest sitting down is a clear +1.
RSSI is noisy (bodies, walls, phone in a pocket), so treat these as rough distances
and check `nearby_devices` in `/guests` to see what is being counted.

Phones-only counting uses the maker data in each BLE advert (Apple Continuity
message type, Samsung/Google/Xiaomi/Huawei company IDs, Google Nearby service
UUIDs) to drop earbuds, laptops, watches, AirTags and beacons. It is a heuristic:
some Android phones advertise nothing identifying and are then not counted.

### Configuration (env, see `wendy.json`)

| Var | Default | Meaning |
|---|---|---|
| `PROFILE` | home | `home` / `demo` / `classic` (values below override it) |
| `PHONE_MACS` | – | Wi-Fi MAC(s) of the patient's phone, comma separated |
| `PATIENT_BLE_ADDRS` | – | fixed BLE address of a patient-owned watch/band/tag (2nd token) |
| `AWAY_AFTER_MIN` / `NIGHT_AWAY_AFTER_MIN` | 10 / 45 | silence needed before AWAY (day / 00–06) |
| `ISOLATION_DAYS` | 2 | no outing ≥ 15 min for this long → `isolation_alert` |
| `GUEST_RSSI_MIN` | -75 | weaker BLE devices are outside the flat |
| `GUEST_DWELL_MIN` | 10 | extra devices must stay this long to count as a visit |
| `SCAN_INTERVAL_S` | 30 | |
| `HUB_URL` | – | UNO Q modulino-hub, for activity + buzzer |

**Phone setup (important):** on the phone, set the home network's private Wi-Fi
address to *Fixed* (iOS: Wi-Fi → (i) → Private Wi-Fi Address → Fixed; Android:
Wi-Fi → network → Privacy → *Use randomized MAC* is per-network and stable unless
"non-persistent" is chosen). Read the MAC shown there into `PHONE_MACS`.

### API

| | |
|---|---|
| `GET /summary` | everything below + probe health |
| `GET /presence` | `state` home/away/unknown, `reason`, `away_today_min`, `outings_today`, `days_since_last_outing`, `isolation_alert`, `coverage_today`, recent outings |
| `GET /guests` | `guests_now`, `visits_today`, `guest_minutes_today`, `days_since_last_visit`, baseline |
| `POST /activity` | an in-home interaction happened (proves "home" when the phone is dead) |
| `POST /calibrate?minutes=60` | learn household devices + background BLE level — patient alone at home |
| `POST /truth?state=home\|away` | ground-truth marker for testing (only logged) |
| `POST /sim` | SIM mode: `{"phone_wifi": true/false/null, "patient_ble": …, "guests": 2, "neighbours": 5}` |

## Edge cases and how they are handled

| Edge case | Risk | Handling (code) |
|---|---|---|
| Phone Wi-Fi power-save / Android doze | false "left home" every few minutes | ARP sweep (sleeping phones still answer L2), 2 rounds per scan, AWAY only after 10 min of continuous silence (`away_after_s`) |
| Deeper sleep at night | false outings at night | separate 45 min night threshold |
| Stale ARP cache | phone looks home after leaving | only `REACHABLE` neighbour entries count — not `STALE`, `DELAY` or `PROBE` (found on the Jetson: those kept a phone "home" ~1 min too long) |
| Hotspot / router drops out | blind time hidden | `network_lost` / `network_restored` events, `recent_network_outages` and `network_outage_min_today` in `/presence` |
| Earbuds, laptops, watches, AirTags | inflate guest count | phones-only counting (BLE maker data) |
| Dead battery / phone off / left in a drawer while patient is home | false "away" | knob turn / heart check-in (`POST /activity`, UNO Q poll) holds HOME 30 min; optional BLE wearable as a second token |
| Router reboot, Wi-Fi down, Bluetooth stack crash | false "away" | probe returns *could not look* (gateway not answering) → absence is not counted; after 10 min state is UNKNOWN; `coverage_today` reports blind time |
| Jetson reboot / app restart | gap counted as absence | state saved atomically to `/data`; tick gaps > 3 min are not counted |
| Flapping at the edge of Wi-Fi range | many tiny outings | hysteresis: one sighting = HOME, long silence = AWAY |
| Outing detected 10 min late | wrong outing duration | outing start back-dated to the last sighting — but never into a window where the probes were blind |
| Taking the bins out (2–5 min) | resets isolation | outings < 15 min don't reset `days_since_last_outing` |
| Phone MAC randomisation (Wi-Fi) | phone never recognised | setup step: fixed per-network address; multiple MACs allowed |
| BLE MAC rotation (~15 min) | one guest counted as many | guests = *concurrent* unknown devices in a 5 min window, with a min-filter that removes the rotation double-count |
| Neighbours' phones through walls | permanent fake guests | RSSI floor + calibrated background level |
| TV, speaker, laptop, smart bulbs | permanent fake guests | calibration learns fixed-address household devices and ignores them |
| Delivery driver / passer-by | fake visit | a visit needs 10 min of continuous extra devices |
| Guest's locked phone advertises in bursts | one visit split into several | devices stay "nearby" 5 min after their last advert; visit ends after 10 min quiet |
| Devices present while the patient is out | fake social contact | visits only counted while the patient is HOME |
| Hackathon Wi-Fi isolates clients | Wi-Fi probe cannot see the phone | reported as unhealthy (not "away"); use `SIM=1` or a phone hotspot for demos |

Known limitations: a phone left at home while the patient goes out looks like
"home" (this is what the vision fusion is for); BLE guest counting is an
estimate (guests without a phone, or with Bluetooth off, are invisible); iPhone
BLE addresses could be resolved exactly with the IRK from a pairing — not done.

## Testing

```sh
python -m unittest discover -s tests -v      # 37 scenario tests, every edge case above
```

See **Reliability test plan** below for real-world testing.

## Reliability test plan

Goal: measure how often the system is right, not just that it runs.

**0. Bench check (10 min).** Deploy with your own phone's MAC. `curl /summary`:
`health.wifi` must be `ok`, `state` home. Turn phone Wi-Fi off → after
`AWAY_AFTER_MIN` state is `away`; on again → `home` within one scan
(30 s). Unplug the router → state must go `unknown`, never `away`.

**1. Phone sleep soak (one night + one day, phone left at home, screen off).**
Expected: 0 outings. Any outing = false positive; if you see some, look at
`ticks.jsonl` for the silence length and raise `AWAY_AFTER_MIN` /
`NIGHT_AWAY_AFTER_MIN`. Repeat with iPhone *and* Android, and with Low Power
Mode / battery saver on — these are the worst cases.

**2. Scripted outings (one afternoon, ≥ 10 outings).** Mark ground truth at the
door (`curl -X POST .../truth?state=away` / `home`, or write a diary CSV). Mix
durations: 3 min (bins), 15 min, 1 h; leave through different exits; stand
just outside the door for 5 min (edge of range). Then:

```sh
python tools/score.py ticks.jsonl diary.csv --lag-min 10
```

Targets: outing recall ≥ 95 % for outings ≥ 15 min, precision ≥ 95 %,
return time error ≤ 1 min, start error ≤ 1 scan after back-dating (check
`/presence` `recent_outings`, not the live tick state).

**3. Failure injection.** During a home period: reboot router (expect
`unknown`, no outing), restart the app with `wendy run` (no outing, state
restored), stop Bluetooth (`health.ble` error, Wi-Fi still works), kill the
phone (no activity → away after the threshold = known limitation; turn the UNO
Q knob every 15 min → must stay `home`).

**4. Guests.** Run `POST /calibrate?minutes=60` with the patient alone at home
(neighbours' devices present as usual). Then: 1, 2 and 3 visitors with phones,
30 min each, in different rooms; a 3 min "delivery" at the door; one visitor
with a locked phone. Expect visits for the 30 min sessions with the right
`peak_guests` (±1), none for the delivery. Leave it running 24 h alone to
measure false visits per day (target: ≤ 1/week).

**5. Long run (≥ 7 days, real life).** Keep a simple diary of outings and
visits. Score weekly: daily `away_today_min` vs diary, `coverage_today`
should be ≥ 95 %. This is the number to quote: "X % tick accuracy, Y % outing
recall over N days".
