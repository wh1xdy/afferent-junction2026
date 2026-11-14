import argparse
import pathlib

from PIL import Image, ImageDraw, ImageFont

ROOT = pathlib.Path(__file__).resolve().parent.parent
BACKS = ("#0E1A2E", "#9DB9CC")

def clamp(im):
    a = im.getchannel("A").point(lambda v: 255 if v >= 248 else v)
    im.putalpha(a)
    return im

def sheet(name, raw, dest, current, cell=640):
    paths = sorted(raw.glob(f"{name}_v*.png"))
    if current.exists():
        paths = [current] + paths
    font = ImageFont.load_default(size=18)
    rows = []
    for p in paths:
        im = clamp(Image.open(p).convert("RGBA"))
        im.thumbnail((cell, cell))
        row = Image.new("RGB", (cell * 2 + 24, im.height + 34), "#151515")
        for i, c in enumerate(BACKS):
            bg = Image.new("RGBA", im.size, c)
            bg.alpha_composite(im)
            row.paste(bg.convert("RGB"), (8 + i * (cell + 8), 30))
        ImageDraw.Draw(row).text((8, 6), "current" if p == current else p.stem, fill="#F2EEE6", font=font)
        rows.append(row)
    out = Image.new("RGB", (max(r.width for r in rows), sum(r.height for r in rows)), "#151515")
    y = 0
    for r in rows:
        out.paste(r, (0, y))
        y += r.height
    dest.parent.mkdir(parents=True, exist_ok=True)
    out.save(dest)
    print(dest)

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("names", nargs="+")
    ap.add_argument("--raw", default="art/final2/raw/b1_world")
    ap.add_argument("--out", default="art/final2/sheets")
    ap.add_argument("--assets", default="demo/assets")
    a = ap.parse_args()
    for n in a.names:
        sheet(n, ROOT / a.raw, ROOT / a.out / f"{n}.png", ROOT / a.assets / f"{n}.png")
