// PulseSensor fingertip mount — afferent / Junction 2026
//
// Sensor: PulseSensor Amped / SparkFun SEN-11574 and green-LED clones
//   diameter 0.625" = 15.875 mm, overall thickness 0.125" = 3.175 mm (SparkFun spec)
//   LED + light sensor on the front face, cable leaves from the back near the edge.
//
// part = "clip"  : C-shaped fingertip clip, sensor recessed on the pad side
// part = "strap" : sensor cup with two slots for a velcro / elastic strap
//
// Render one STL per size, e.g.
//   openscad -D 'part="clip"' -D finger_d=16 -o clip_M.stl pulse-sensor-mount.scad
//
// Print: PETG or TPU (95A) recommended for the clip so it flexes without cracking.
// PLA works but use a size up. 0.2 mm layers, no supports, flat bottom on the bed
// (as modelled: finger axis along X, C-opening facing up).

part = "clip";          // "clip" | "strap"

// ── sensor ─────────────────────────────────────────────────────────────
sensor_d = 15.875;      // mm
sensor_t = 3.175;       // mm, PCB + components
fit      = 0.25;        // radial clearance; lower (0.1) for a tighter press fit
protrude = 0.5;         // sensor face sticks this far into the finger space = gentle pressure
cable_w  = 5.0;         // cable / header exit width
cable_h  = 2.6;         // cable exit height

// ── clip ───────────────────────────────────────────────────────────────
finger_d = 16;          // fingertip diameter: S 14, M 16, L 18
wall     = 2.2;         // ring wall
length   = sensor_d + 2 * 2.5;   // along the finger
opening  = 0.62;        // C-opening width as a fraction of finger_d (snap-on)
floor_t  = 1.2;         // material behind the sensor

// ── strap holder ───────────────────────────────────────────────────────
strap_w  = 20;          // strap width (10-25 mm velcro)
strap_t  = 2.5;         // strap thickness + clearance

$fn = 96;
pocket_d = sensor_d + 2 * fit;
eps = 0.01;

module sensor_pocket(top_z, cable_dir = 0) {
    // pocket opening at top_z, sensor face ends up `protrude` above top_z
    translate([0, 0, top_z - (sensor_t - protrude)])
        cylinder(d = pocket_d, h = sensor_t + 5);
    // cable channel from the pocket floor outward (cable_dir: 0 = +X, 90 = +Y)
    rotate([0, 0, cable_dir])
        translate([0, -cable_w / 2, top_z - (sensor_t - protrude)])
            cube([40, cable_w, cable_h]);
}

module clip() {
    r = finger_d / 2;
    boss_z = -(r + sensor_t - protrude + floor_t);   // bottom of the sensor boss
    difference() {
        union() {
            // ring around the finger (axis along X)
            rotate([0, 90, 0]) cylinder(r = r + wall, h = length, center = true);
            // solid lower half: flat base + room for the sensor under the pad.
            // Lower half is a block so the clip prints flat with no supports.
            base_w = max(2 * (r + wall), pocket_d + 2 * wall);
            translate([-length / 2, -base_w / 2, boss_z]) cube([length, base_w, -boss_z]);
        }
        // finger
        rotate([0, 90, 0]) cylinder(r = r, h = length + 2, center = true);
        // C-opening on the nail side
        translate([-length, -finger_d * opening / 2, 0]) cube([2 * length, finger_d * opening, r * 2]);
        // sensor, face up toward the finger pad
        sensor_pocket(-r, 0);
        // flat print bed
        translate([-length, -50, boss_z - 50]) cube([2 * length, 100, 50]);
    }
}

module strap() {
    body_d = pocket_d + 2 * 2.0;
    body_h = sensor_t - protrude + floor_t;
    difference() {
        union() {
            cylinder(d = body_d, h = body_h);
            // strap loops on both sides
            for (s = [-1, 1])
                translate([s * (body_d / 2 + strap_t / 2 + 0.5), 0, (body_h + strap_t + 2) / 2 - eps])
                    difference() {
                        cube([strap_t + 3, strap_w + 4, body_h + strap_t + 2], center = true);
                        translate([0, 0, 0]) cube([strap_t, strap_w, body_h + strap_t + 4], center = true);
                    }
        }
        sensor_pocket(body_h, 90);
    }
}

if (part == "clip") clip();
else if (part == "strap") strap();
