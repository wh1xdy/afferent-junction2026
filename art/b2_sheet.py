# /// script
# requires-python = ">=3.10"
# dependencies = ["pillow"]
# ///
import pathlib
import sys
from PIL import Image, ImageDraw, ImageFont

ROOT = pathlib.Path(__file__).resolve().parent.parent
RAW = ROOT / "art/final2/raw/b2_keeper_props"
SHEETS = ROOT / "art/final2/sheets"
CUR = ROOT / "demo/assets"

def on(bg, im, cell):
    im = im.copy()
    im.thumbnail((cell - 12, cell - 12))
    tile = Image.new("RGB", (cell, cell), bg)
    tile.paste(im, ((cell - im.width) // 2, (cell - im.height) // 2), im)
    return tile

def sheet(name):
    paths = sorted(RAW.glob(f"{name}_v*.png"))
    cur = CUR / f"{name}.png"
    items = ([("current", cur)] if cur.exists() else []) + [(p.stem.split("_")[-1], p) for p in paths]
    cell = 420
    bgs = ["#0E1A2E", "#9DB9CC"]
    font = ImageFont.load_default(size=18)
    out = Image.new("RGB", (len(items) * cell, len(bgs) * cell + 30), "#1E3150")
    d = ImageDraw.Draw(out)
    for i, (label, p) in enumerate(items):
        im = Image.open(p).convert("RGBA")
        bb = im.getchannel("A").point(lambda a: 255 if a > 8 else 0).getbbox()
        if bb:
            im = im.crop(bb)
        for j, bg in enumerate(bgs):
            out.paste(on(bg, im, cell), (i * cell, j * cell))
        d.text((i * cell + 8, len(bgs) * cell + 6), f"{name} {label}", fill="#F2EEE6", font=font)
    dest = SHEETS / f"{name}.png"
    out.save(dest)
    print(dest)

for n in sys.argv[1:]:
    sheet(n)
