# /// script
# requires-python = ">=3.10"
# dependencies = ["pillow"]
# ///
from pathlib import Path
from PIL import Image
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
C = ROOT / "art/raw/concept"
OUT = Path(__file__).resolve().parent

CROPS = {
    "far_shore_start": ("concept_final_start.png", (0, 0.40, 1, 0.53)),
    "keeper_sit_start": ("concept_final_start.png", (0.15, 0.55, 0.48, 0.76)),
    "ledge_start": ("concept_final_start.png", (0, 0.62, 0.85, 0.92)),
    "fells_ride": ("concept_final_ride.png", (0.3, 0.55, 1, 0.80)),
    "birches_ride": ("concept_final_ride.png", (0, 0.50, 0.26, 0.68)),
    "ribbon_ride": ("concept_final_ride.png", (0, 0.76, 0.85, 1.0)),
    "keeper_skis_ride": ("concept_final_ride.png", (0.22, 0.60, 0.56, 0.83)),
    "icehole_bite": ("concept_final_bite.png", (0.42, 0.62, 0.92, 0.79)),
    "keeper_fish_bite": ("concept_final_bite.png", (0.04, 0.40, 0.62, 0.79)),
    "far_bite": ("concept_final_bite.png", (0, 0.28, 1, 0.41)),
    "ice_bite": ("concept_final_bite.png", (0, 0.78, 1, 1.0)),
    "swan_joutsen": ("concept_final_joutsen.png", (0.08, 0.11, 0.87, 0.36)),
    "birch_joutsen": ("concept_final_joutsen.png", (0.80, 0.40, 1, 0.86)),
    "aurora_joutsen": ("concept_final_joutsen.png", (0.35, 0, 1, 0.09)),
    "fells_joutsen": ("concept_final_joutsen.png", (0, 0.50, 1, 0.68)),
    "kiuas_loyly": ("concept_final_loyly.png", (0.14, 0.68, 0.68, 1.0)),
    "ladle_loyly": ("concept_final_loyly.png", (0, 0.43, 0.38, 0.60)),
    "steam_loyly": ("concept_final_loyly.png", (0.36, 0, 1, 0.72)),
    "window_loyly": ("concept_final_loyly.png", (0.05, 0.09, 0.36, 0.31)),
    "sun_dawn": ("concept_final_dawn.png", (0.40, 0.50, 1, 0.80)),
    "keeper_dawn": ("concept_final_dawn.png", (0.15, 0.58, 0.46, 0.79)),
    "lake_end": ("concept_final_end.png", (0.30, 0.50, 1, 0.76)),
    "keeper_end": ("concept_final_end.png", (0.08, 0.52, 0.44, 0.76)),
    "birch_patient": ("concept_final_patient.png", (0, 0, 0.2, 0.75)),
}
SHEETS = {
    "concept_final_keeper_sheet.png": ["keeper_sheet_stand", "keeper_sheet_ride", "keeper_sheet_crouch", "keeper_sheet_sit"],
    "concept_final_props_sheet.png": ["prop_sauna", "prop_birches", "prop_tower", "prop_cairn"],
}

def on_backdrop(im):
    bg = Image.new("RGBA", im.size, (30, 49, 80, 255))
    bg.alpha_composite(im)
    return bg.convert("RGB")

def split(im, names):
    a = np.array(im)[:, :, 3] > 24
    cols = a.any(axis=0)
    runs, s = [], None
    for x, v in enumerate(list(cols) + [False]):
        if v and s is None:
            s = x
        elif not v and s is not None:
            runs.append((s, x))
            s = None
    merged = []
    for r in runs:
        if merged and r[0] - merged[-1][1] < 6:
            merged[-1] = (merged[-1][0], r[1])
        else:
            merged.append(r)
    merged = [r for r in merged if r[1] - r[0] > 30]
    out = []
    for (x0, x1) in merged:
        rows = a[:, x0:x1].any(axis=1)
        ys = np.where(rows)[0]
        out.append((x0, int(ys[0]), x1, int(ys[-1]) + 1))
    return out

def main():
    for name, (src, (x0, y0, x1, y1)) in CROPS.items():
        im = Image.open(C / src).convert("RGB")
        w, h = im.size
        im.crop((round(x0 * w), round(y0 * h), round(x1 * w), round(y1 * h))).save(OUT / f"{name}.png")
    for src, names in SHEETS.items():
        im = Image.open(C / src).convert("RGBA")
        boxes = split(im, names)
        if src.startswith("concept_final_props") and len(boxes) == 3:
            a = boxes[1]
            boxes = [boxes[0], (a[0], a[1], 876, a[3]), (876, a[1], a[2], a[3]), boxes[2]]
        print(src, len(boxes), boxes)
        for name, (x0, y0, x1, y1) in zip(names, boxes):
            pad = 24
            box = (max(0, x0 - pad), max(0, y0 - pad), min(im.width, x1 + pad), min(im.height, y1 + pad))
            on_backdrop(im.crop(box)).save(OUT / f"{name}.png")

if __name__ == "__main__":
    main()
