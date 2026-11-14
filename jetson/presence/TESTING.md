# Field test: phone hotspot + teammate's phone as patient

Setup:

| Role | Device |
|---|---|
| Router | **your phone** (hotspot). It stays next to the Jetson for the whole test |
| Patient | **teammate's phone**. It joins the hotspot, then "leaves home" by walking out of range |
| Observer | your laptop, also on the hotspot, running the commands below in **Git Bash** |
| Guest (BLE test only) | a **third phone** (another teammate). Laptops, earbuds and watches are not counted |

All commands are for Git Bash, run from `jetson/presence`.

---

## 0. Prep (once)

**Hotspot (your phone):** **5 GHz** (this Jetson can't hear 2.4 GHz networks: it only listed 5 GHz ones and never saw a 2.4 GHz-only hotspot; check the antenna leads on its Wi-Fi card). Android: Band → 5 GHz; iPhone: "Maximize Compatibility" **off**. WPA2, mobile data on, charger plugged in, battery saver off, and "turn off hotspot automatically" off.

**Patient phone (teammate):** join the hotspot. Then set the Wi-Fi address to *fixed*:
- iPhone: Wi-Fi → ⓘ → Private Wi-Fi Address → **Fixed**
- Android: Wi-Fi → network → Privacy → **Use device MAC**

Copy the Wi-Fi MAC. On an Android hotspot you can also read it under Hotspot → Connected devices, which shows the Jetson's IP too.

```bash
export PATH="$HOME/.local/bin:$PATH"
DEV='cloud://api.wendy.dev:443/tenant/e064d3cd-1e43-45af-adf2-37b0afe5e3da/asset/149628ce-6c13-44b8-9b2a-ec527e20caf7'
wendy auth status || wendy auth login
```

## 1. Move the Jetson onto the hotspot

```bash
wendy --device "$DEV" device wifi list
wendy --device "$DEV" device wifi connect --ssid "<HOTSPOT_SSID>" --password "<PASSWORD>"
```

This command often hangs. Press Ctrl+C after about 30 s, then check:

```bash
wendy --device "$DEV" device wifi status
wendy --device "$DEV" device info
```

`ssid` should show your hotspot. Note the Jetson's IP (or read it from the hotspot's device list):

```bash
IP=<jetson-ip>
```

## 2. Deploy with the patient's MAC (demo profile = 2 min away delay)

```bash
PROFILE=demo PHONE_MACS='<teammate-mac>' wendy run --device "$DEV" --detach --yes
wendy --device "$DEV" device apps list
```

`afferent-presence` should show **RUNNING**.

## 3. Watching it yourself

**Live log** (terminal 1, leave it open; it is also saved to `presence.log`):

```bash
wendy --device "$DEV" device logs --app afferent-presence | tee -a presence.log
```

Show only the important lines (events, warnings, startup):

```bash
wendy --device "$DEV" device logs --app afferent-presence | grep --line-buffered -E "event:|WARNING|presence on|BLE|restored"
```

Show the last log lines and exit (handy after a hotspot drop ends the stream with `EOF`):

```bash
wendy --device "$DEV" device logs --app afferent-presence --tail 200 --no-follow
```

**Live state** (terminal 2): prints one line every 15 s.

```bash
while true; do curl -s -m 5 "http://$IP:8090/summary" | python -c "import sys,json,time;d=json.load(sys.stdin);p=d['presence'];g=d['guests'];print(time.strftime('%H:%M:%S'),p['state'],'|',p.get('reason'),'| outings',p.get('outings_today'),'| guests',g.get('guests_now'),'| health',d['health'])" || echo "$(date +%T) no reply"; sleep 15; done
```

Full detail at any moment:

```bash
curl -s "http://$IP:8090/summary"
curl -s "http://$IP:8090/presence"
curl -s "http://$IP:8090/guests"
```

**Health check before you start:** `health.wifi` = `ok`, `health.ble` = `ok`, and `state` = `home` (the teammate's phone is on the hotspot).

## 4. Wi-Fi tests (patient leaving/returning)

Mark the ground truth **at the moment it happens**. That lets the scorer measure accuracy.

| # | Do | Mark | Expect |
|---|---|---|---|
| W1 | Teammate walks out of hotspot range (or switches Wi-Fi off) for **5 min** | `away` when they leave, `home` when back | `event: left_home` ~2 min after leaving; `returned_home` within ~30 s of reconnecting; one outing in `/presence` → `recent_outings` with `start` ≈ the real leave time |
| W2 | Short drop: Wi-Fi off for **1 min** | none | stays `home`, no outing |
| W3 | Patient phone **screen off, idle 30 min** next to the Jetson | none | stays `home` the whole time (tests phone sleep / power-save) |
| W4 | Repeat W1 **5×** with mixed lengths (3, 5, 10 min) | each leave/return | 5 outings, none extra |
| W5 | **Turn your hotspot off** for 3 min, then back on | none | state `unknown` (never `away`), log `network_lost` / `network_restored`; the log stream ends with `EOF`, so rerun it. `network_outage_min_today` goes up |
| W6 | Restart the app: `wendy --device "$DEV" device apps stop afferent-presence` then `start` | none | log `restored state: …`, outings kept |

Truth markers:

```bash
curl -X POST "http://$IP:8090/truth?state=away"    # patient just left
curl -X POST "http://$IP:8090/truth?state=home"    # patient just came back
```

## 5. Bluetooth tests (guests)

Keep **your hotspot phone and the patient phone where they will stay**, with nobody else nearby. Then calibrate. Both phones advertise BLE, so they must be part of the learned background.

```bash
curl -X POST "http://$IP:8090/calibrate"           # 5 min in demo profile; don't move anything
curl -s "http://$IP:8090/guests"                    # after 5 min (log: event: calibrated): guests_now 0
```

| # | Do | Expect |
|---|---|---|
| B1 | Third phone (unlocked, Bluetooth on) **next to the Jetson** (within ~5 m) for 4 min | `guests_now: 1`, a visit appears after ~2 min, `event: guest_arrived`, then `guest_left` ~2 min after it goes |
| B2 | Same phone held **at 8–10 m** for 4 min | probably not counted (−65 dBm ≈ 5 m); check its RSSI in `nearby_devices` |
| B3 | "Delivery": third phone near the Jetson for **1 min** | no visit |
| B4 | Third phone **locked, in a pocket** next to the Jetson for 4 min | ideally counted; locked phones advertise less, so note what happens |
| B5 | Earbuds / laptop / watch near the Jetson | listed in `nearby_devices` with `counted: false` |
| B6 | Patient phone leaves (W1) while the third phone stays | no new visit while the patient is `away` |
| B7 | Bluetooth broken: check `health.ble` stays `ok` all test long | an error there means BLE scanning stopped, while Wi-Fi should keep working |

See what BLE is counting:

```bash
curl -s "http://$IP:8090/guests" | python -c "import sys,json;[print(d) for d in json.load(sys.stdin)['nearby_devices']]"
```

## 6. Score it

Download the per-scan log (one line per 30 s scan) and compare it with your truth markers:

```bash
curl -s "http://$IP:8090/ticks" > ticks.jsonl
python tools/score.py ticks.jsonl --lag-min 2
```

`--lag-min 2` matches the demo profile's 2 min away delay. Ticks from before you started marking truth are ignored.

**Pass criteria for "reliable":**
- tick accuracy ≥ 95 %
- outing recall and precision 100 % on the scripted outings (W1/W4)
- no false outings in W2/W3/W5
- `unknown` only during W5
- guest count right ±1 in B1, no visit in B3/B6

Optional: write a diary as `diary.csv` instead of (or as well as) the curl markers:

```
start,end,state
2026-11-14T15:02,2026-11-14T15:07,away
```

```bash
python tools/score.py ticks.jsonl diary.csv --lag-min 2
```

## Troubleshooting

| You see | Do |
|---|---|
| `curl` times out | laptop not on the hotspot, or wrong `IP` |
| `health.wifi`: `PHONE_MACS not set` | redeploy with `PHONE_MACS=…` |
| always `away` while teammate is there | MAC wrong or private/random. Check the phone's Wi-Fi address vs `PHONE_MACS` (lowercase, colons) |
| `health.wifi`: `gateway … not reachable` | Jetson dropped off the hotspot → `wendy … device wifi status` |
| `is offline or unavailable` | hotspot mobile data off / hotspot slept; the Jetson reconnects within ~1 min |
| `guests_now` ≥ 1 with nobody extra | not calibrated, or a phone moved after calibration → `POST /calibrate` again |
| logs end with `EOF` | device connection blipped; rerun the logs command |
