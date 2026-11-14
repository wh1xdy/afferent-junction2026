# /// script
# requires-python = ">=3.10"
# dependencies = ["pillow"]
# ///
import pathlib
import sys

from PIL import Image, ImageDraw, ImageFont

ROOT = pathlib.Path(__file__).resolve().parent.parent
RAW = ROOT / "art" / "final2" / "raw" / "b3_tasks"
SHEETS = ROOT / "art" / "final2" / "sheets"
CURRENT = ROOT / "demo" / "assets"


def tile(im, w, h, bg):
    t = Image.new("RGB", (w, h), bg)
    im = im.convert("RGBA")
    im.thumbnail((w - 12, h - 12))
    t.paste(im, ((w - im.width) // 2, (h - im.height) // 2), im)
    return t


def sheet(name):
    cur = CURRENT / f"{name}.png"
    vs = sorted(RAW.glob(f"{name}_v*.png"))
    items = ([("current", Image.open(cur))] if cur.exists() else []) + [(p.stem.rsplit("_", 1)[1], Image.open(p)) for p in vs]
    if not items:
        return
    a = items[-1][1].width / items[-1][1].height
    cw = 520 if a >= 1 else int(520 * max(a, 0.4))
    ch = int(cw / a) if a >= 1 else 520
    ch = max(ch, 160)
    label = 26
    font = ImageFont.load_default(size=16)
    out = Image.new("RGB", (cw * len(items), (ch + label) * 2), "#0E1A2E")
    d = ImageDraw.Draw(out)
    for i, (lab, im) in enumerate(items):
        out.paste(tile(im, cw, ch, "#0E1A2E"), (i * cw, 0))
        out.paste(tile(im, cw, ch, "#8A8F9C"), (i * cw, ch + label))
        d.text((i * cw + 8, ch + 4), lab, fill="#F2EEE6", font=font)
    SHEETS.mkdir(parents=True, exist_ok=True)
    out.save(SHEETS / f"{name}.png")
    print(SHEETS / f"{name}.png")


for n in sys.argv[1:]:
    sheet(n)
