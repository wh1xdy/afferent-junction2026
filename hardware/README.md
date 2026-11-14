# Hardware — bill of materials (low estimate)

Low-end BOM for the full setup: one Jetson node (vision + data manager) and one
UNO Q sensor node (climate + pulse). Prices checked 2026-11-14; cheapest
legitimate listing kept, high estimates ignored.

## Jetson node

| Item | Low price | Source |
|---|---:|---|
| Jetson Orin Nano **8 GB** Super Dev Kit (67 TOPS, PSU + Wi-Fi included) | **$249** MSRP (~€235) / **€333** TTC in the EU | [Seeed Studio](https://relshop.seeedstudio.com/NVIDIAr-Jetson-Orintm-Nano-Developer-Kit-p-5617.html) · [reichelt](https://www.reichelt.com/fr/fr/shop/produit/kit_nvidia_jetson_orin_nano_super_dev_67_tops_8_go_ddr5-395185) |
| microSD 128 GB (the dev kit has no eMMC) | ~€12 | generic A2 card |
| Logitech **C920** (cam1: YOLO + rPPG) | ~€60 | [comparateur-gamer.fr](https://www.comparateur-gamer.fr/webcam?marque=LOGITECH) — Logitech lists €69.99, street ~€59 |
| Arduino USB Camera (cam2, 720p — second rPPG view, optional) | **$34 / €35** | [Arduino Store](https://store.arduino.cc/products/usb-camera) · [store-usa](https://store-usa.arduino.cc/products/usb-camera) |

Subtotal: **~€340–450** (Jetson at MSRP, without cam2) — **~€470–540** with EU
street pricing and the second camera.

## UNO Q sensor node (`uno-q/modulino-hub`)

| Item | Low price | Source |
|---|---:|---|
| Arduino **UNO Q 2 GB** (Dragonwing MPU + STM32U585) | **$59** | [Arduino Store US](https://store-usa.arduino.cc/products/uno-q) — raised from $44 in July 2026 ([pricing notice](https://blog.arduino.cc/2026/06/26/a-heads-up-on-the-arduino-uno-q-board-pricing-straight-from-marcello-majonchi/)) |
| Modulino **Thermo** (temperature + humidity, Qwiic) | **€9.00** / $8.30 | [Arduino Store](https://store.arduino.cc/products/modulino-thermo) |
| Modulino **Knob** (rotary + push, Qwiic) | **€9.00** / $8.99 | [Arduino Store](https://store.arduino.cc/products/modulino-knob) · [Micro Center](https://www.microcenter.com/product/707363/arduino-modulino-knob) |
| Modulino **Buzzer** (Qwiic) | **€7.30** / $6.50 | [Arduino Store](https://store-usa.arduino.cc/products/modulino-buzzer) |
| 2× **PulseSensor** green-LED clones (A1, A2 — SparkFun SEN-11574 compatible) | ~€6 for both | clones ~€3; official SEN-11574 is [$29.95 each](https://www.sparkfun.com/pulse-sensor.html) |
| KY-016 RGB LED module | ~€2 | generic |
| Jumper wires + USB-C cable | ~€4 | generic |

Subtotal: **~€95–105** (UNO Q ≈ €60 street, clone pulse sensors) —
**~€150** with genuine SparkFun PulseSensors.

## Total (low estimate)

| Configuration | Total |
|---|---:|
| Minimal working setup (1 camera, clone sensors, Jetson at MSRP) | **~€440** |
| Full setup as wired today (cam1 + cam2, EU street prices) | **~€560–640** |

Not included: 3D-printed fingertip mounts (filament < €1, STL files below),
tripod/mount for the C920 (~€10–15 if needed), shipping.

---

# PulseSensor fingertip mount

For the PulseSensor (SparkFun SEN-11574 / green-LED clones): Ø 15.875 mm, 3.175 mm thick
([SparkFun spec](https://www.sparkfun.com/pulse-sensor.html)). The sensor sits face-up in a
recess, 0.5 mm proud of the surface so the finger rests on it with a light, repeatable pressure,
and the housing blocks room light. The cable exits through a channel in the side.

| File | What |
|---|---|
| `stl/pulse-clip-S-14mm.stl` | snap-on fingertip clip, finger Ø 14 mm |
| `stl/pulse-clip-M-16mm.stl` | … Ø 16 mm (most adult index fingers) |
| `stl/pulse-clip-L-18mm.stl` | … Ø 18 mm |
| `stl/pulse-strap-holder.stl` | sensor cup with slots for a 20 mm velcro/elastic strap |
| `pulse-sensor-mount.scad` | parametric source (OpenSCAD) |

**Print:** PETG or TPU 95A for the clip (it has to flex); PLA works one size up. 0.2 mm layers,
no supports, flat side down as exported. Print S/M/L once and keep the one that fits snugly
without squeezing — too tight blocks blood flow and flattens the pulse.

**Fit:** if the sensor is loose, re-export with `-D fit=0.1`; if it doesn't go in, `-D fit=0.35`.

```sh
openscad -D 'part="clip"' -D finger_d=16 -D fit=0.25 -o clip.stl pulse-sensor-mount.scad
openscad -D 'part="strap"' -D strap_w=20 -o strap.stl pulse-sensor-mount.scad
```
