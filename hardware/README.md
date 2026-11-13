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
