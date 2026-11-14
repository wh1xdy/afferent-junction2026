# /// script
# requires-python = ">=3.10"
# dependencies = ["pillow"]
# ///
import json
import pathlib
import sys

from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
RAW = ROOT / "art" / "final2" / "raw" / "b3_tasks"
DEST = ROOT / "art" / "final2" / "b3_tasks"
CURRENT = ROOT / "demo" / "assets"
SHEETS = {"task_fireflies_firefly_sheet", "task_fork_waymarker_sheet", "task_reaction_splash_sheet"}


def stage(name, variant):
    im = Image.open(RAW / f"{name}_{variant}.png").convert("RGBA")
    cur = Image.open(CURRENT / f"{name}.png")
    opaque = cur.mode == "RGB" and im.getchannel("A").getextrema()[0] == 255
    if opaque:
        out = im.convert("RGB").resize(cur.size, Image.LANCZOS) if abs(im.width / im.height - cur.width / cur.height) < 0.02 else fit_cover(im.convert("RGB"), cur.size)
    else:
        a = im.getchannel("A").point(lambda v: 255 if v >= 248 else (0 if v < 3 else v))
        im.putalpha(a)
        l, t, r, b = a.getbbox()
        if name in SHEETS:
            l, r = 0, im.width
        im = im.crop((l, t, r, b))
        edge = max(cur.size)
        k = edge / max(im.size)
        out = im.resize((max(1, round(im.width * k)), max(1, round(im.height * k))), Image.LANCZOS)
    DEST.mkdir(parents=True, exist_ok=True)
    out.save(DEST / f"{name}.png", optimize=True)
    return out.size, cur.size


def fit_cover(im, size):
    W, H = size
    k = max(W / im.width, H / im.height)
    im = im.resize((round(im.width * k), round(im.height * k)), Image.LANCZOS)
    x, y = (im.width - W) // 2, (im.height - H) // 2
    return im.crop((x, y, x + W, y + H))


picks = json.loads(pathlib.Path(sys.argv[1]).read_text())
for p in picks:
    got, cur = stage(p["name"], p["pick"])
    print(f"{p['name']:30} {p['pick']}  staged {got}  current {cur}")
