# afferent — Junction 2026

Two WendyOS boards working together over Wendy Net:

| Board | App | Role |
|---|---|---|
| NVIDIA Jetson Orin Nano | [`jetson/vision`](jetson/vision) | Logitech C920 + YOLOv8n on the GPU. Finds `modulino-hub` on the mesh, beeps when a person enters the frame. |
| Arduino UNO Q | [`uno-q/modulino-hub`](uno-q/modulino-hub) | STM32 sketch reads Modulino **Knob** + **Thermo**, a **PulseSensor** on A1, drives **Buzzer** and a **KY-016 RGB LED**; the Linux side bridges them to an HTTP service on the mesh. |

```
 C920 ─► Jetson: YOLO ──"person"──► Wendy Net (BLE / USB via Mac) ──► UNO Q Linux ──Bridge──► STM32 ──Qwiic──► Buzzer
                   ▲                                                       │
                   └──── knob position → confidence, knob press → arm ─────┘  (+ Thermo °C / %RH)
```

## Heartbeat

PulseSensor on A1 (`+` 3.3V, `-` GND — never 5V, the output would exceed the ADC input).
Tape it to a fingertip: firm enough not to move, not so tight it blocks blood flow.

- The STM32 samples A1 at ~45 Hz (14-bit) and detects each beat from the steep upstroke.
- Linux computes the pulse period by autocorrelation every second and sends it back;
  the sketch ignores the dicrotic second bump (half a period) and only beeps/flashes once
  the period is reliable, so it stays silent without a finger.
- Every beat: 880 Hz beep + red flash on the KY-016 (`R` D9, `G` D10, `B` D11, `-` GND).
  Dim blue = searching for a rhythm. Verified against a smartwatch (75–85 vs 72–76 BPM).

## Camera pulse (rPPG)

The Jetson also estimates heart rate contact-free from **two cameras**: the C920 (`cam1`, also
used for YOLO) and the Arduino USB Camera (`cam2`, `/dev/video2`, 1280x720). Per camera:
YOLOv8n-pose finds the eyes, forehead + cheeks are averaged (skin pixels only) at 20 Hz, and
POS (Wang et al. 2017) on the last 10 s gives the dominant frequency in 45–180 BPM. The two
spectra are fused, weighted by each camera's SNR. Auto exposure / white balance / focus are
locked (50 Hz mains), and gain follows the *face* brightness (no clipping).

Requirements, honestly: a still face, 0.5–1 m away, lit by **white** light. Coloured (purple)
stage lighting has almost no green, where the pulse signal lives — use the Arduino camera's
ring light. `snr` below 0 dB means "don't trust it". Keep the heartbeat LED off
(`POST /led/beat?on=0`, the default): a light flashing at heart rate on the face fakes the result.

Diagnostics: `GET /rppg` (per-camera skin pixels, brightness, clipping, gain) and
`GET /rppg/frame?cam=cam1|cam2` (latest frame with the measured skin regions drawn).

## Open the UI (no display needed)

```sh
wendy net forward 3005:3005 --device <jetson>   # keep running
open http://localhost:3005
```

## Controls

- **Turn the knob**: YOLO confidence threshold (0.40 at position 0, ±0.01 per click).
- **Press the knob**: arm / disarm the person alarm (high beep = armed, low beep = disarmed).
- A person entering the frame while armed → 988 Hz beep (3 s cooldown).

## Deploy

Both boards are enrolled in the same Wendy Cloud org with Wendy Net enabled
(`wendy net configure --participate=true --ethernet=true --infrastructure-wifi=true --ble=true`).

```sh
# UNO Q: compiles + flashes the STM32 sketch, then deploys the Linux app
cd uno-q/modulino-hub && wendy run --device <uno-q> --detach --yes

# Jetson
cd jetson/vision && wendy run --device <jetson> --detach --yes
```

Both apps use `"mode": "mesh"` networking, so their ports are reachable only inside
Wendy Net (use `wendy net forward` to open the Jetson UI on port 3005 from a laptop).

## HTTP

- UNO Q `modulino-hub` (mesh, port 18080): `GET /state` (knob, climate, `beat.bpm_live`, `pulse`),
  `GET /ppg` (raw 30 s), `POST /buzz?freq=880&ms=200`, `POST /heartbeat?on=0|1`,
  `POST /led?r=0&g=255&b=0&ms=500`
- Jetson `afferent-vision` (mesh, port 3005): web UI `/`, `GET /rppg` (camera + finger BPM), `GET /hub`, `POST /hub/buzz`

## Notes

- Modulinos sit on the STM32's Qwiic bus; Linux reaches them only through `arduino-bridge`.
- The sketch profile in `sketch.yaml` must list every library dependency explicitly.
- Hackathon Wi-Fi isolates clients, so the boards talk over BLE (or USB through the laptop).
- `jetson/vision` is based on Wendy's `camera-feed-yolo` template (JetPack 7 CUDA fix included).

## Team access

Both boards are enrolled in our Wendy Cloud org, so any org member can reach them from
anywhere — no USB cable or shared Wi-Fi needed:

```sh
curl -fsSL https://install.wendy.dev/cli.sh | bash   # install the CLI
wendy auth login                                     # sign in with your invited account
wendy cloud discover                                 # lists `jetson` and `uno-q` with cloud:// selectors

JETSON='cloud://api.wendy.dev:443/tenant/e064d3cd-1e43-45af-adf2-37b0afe5e3da/asset/149628ce-6c13-44b8-9b2a-ec527e20caf7'
UNOQ='cloud://api.wendy.dev:443/tenant/e064d3cd-1e43-45af-adf2-37b0afe5e3da/asset/a933500b-ab5a-4086-a2cc-a68ec015719a'

wendy --device "$UNOQ" device apps list
cd uno-q/modulino-hub && wendy run --device "$UNOQ" --detach --yes
```

When plugged in over USB-C, `wendy discover` finds the boards directly (faster deploys).
