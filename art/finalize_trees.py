# /// script
# requires-python = ">=3.10"
# dependencies = ["pillow"]
# ///
"""Turns the picked tree variants in art/raw/ into the shipped sprites in demo/assets/.

For every asset in art/plan.json with a "pick": alpha below 10 (the faint haze the model leaves around the twigs) goes
to 0 and alpha from 248 up to 255, the sprite is trimmed to what is left, its base stays flush with the bottom edge,
it is scaled so its longer edge is final_max_edge, and it is written as a lossy WebP with lossless-quality alpha.
    uv run art/finalize_trees.py [names...]
"""
import json
import pathlib
import sys

from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
RAW = ROOT / "art" / "raw"
ASSETS = ROOT / "demo" / "assets"
PLAN = ROOT / "art" / "plan.json"
FLOOR, CEIL = 10, 248


def finalize(a):
    src = RAW / f"{a['name']}_{a['pick']}.png"
    im = Image.open(src).convert("RGBA")
    alpha = im.getchannel("A").point(lambda v: 0 if v < FLOOR else 255 if v >= CEIL else v)
    im.putalpha(alpha)
    x0, y0, x1, y1 = alpha.getbbox()
    pad = 2
    im = im.crop((max(0, x0 - pad), max(0, y0 - pad), min(im.width, x1 + pad), y1))
    s = min(1, a["final_max_edge"] / max(im.size))
    im = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
    out = ASSETS / f"{a['name']}.webp"
    im.save(out, "WEBP", quality=88, alpha_quality=100, method=6)
    print(f"{a['name']:16} {src.name} -> {out.relative_to(ROOT)} {im.width}x{im.height} {out.stat().st_size / 1024:.0f} KB")


def main():
    plan = json.loads(PLAN.read_text())
    only = set(sys.argv[1:])
    for a in plan["assets"]:
        if a.get("pick") and (not only or a["name"] in only):
            finalize(a)


if __name__ == "__main__":
    main()
