# /// script
# requires-python = ">=3.10"
# dependencies = ["pillow"]
# ///
import argparse
import json
import pathlib

from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent


def finalise(src, current, clamp=True):
    im = Image.open(src).convert("RGBA")
    cur = Image.open(current) if current.exists() else None
    if cur is not None and cur.mode == "RGB":
        return im.convert("RGB").resize(cur.size, Image.LANCZOS)
    if clamp:
        im.putalpha(im.getchannel("A").point(lambda v: 255 if v >= 248 else v))
    box = im.getchannel("A").point(lambda v: 255 if v > 8 else 0).getbbox()
    if box:
        im = im.crop(box)
    if cur is not None:
        edge = max(cur.size)
        s = edge / max(im.size)
        im = im.resize((max(1, round(im.width * s)), max(1, round(im.height * s))), Image.LANCZOS)
    return im


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("picks", help="JSON list of {name, pick, why}")
    ap.add_argument("--raw", default="art/final2/raw/b1_world")
    ap.add_argument("--out", default="art/final2")
    ap.add_argument("--assets", default="demo/assets")
    a = ap.parse_args()
    for p in json.loads((ROOT / a.picks).read_text()):
        im = finalise(ROOT / a.raw / f"{p['pick']}.png", ROOT / a.assets / f"{p['name']}.png", p.get("clamp", True))
        dest = ROOT / a.out / f"{p['name']}.png"
        im.save(dest, optimize=True)
        print(f"{p['name']:20} {p['pick']:24} {im.size}")
