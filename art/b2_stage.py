# /// script
# requires-python = ">=3.10"
# dependencies = ["pillow"]
# ///
import json
import pathlib
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
RAW = ROOT / "art/final2/raw/b2_keeper_props"
OUT = ROOT / "art/final2"
HI = OUT / "hires"
CUR = ROOT / "demo/assets"
PLAN = {a["name"]: a for a in json.loads((ROOT / "art/plan_v5.json").read_text())["assets"]}
PICKS = json.loads((ROOT / "art/final2/b2_keeper_props_picks.json").read_text())

HI.mkdir(parents=True, exist_ok=True)
for p in PICKS:
    name = p["name"]
    im = Image.open(RAW / f"{name}_{p['variant']}.png").convert("RGBA")
    a = im.getchannel("A").point(lambda v: 255 if v >= 248 else (0 if v < 4 else v))
    im.putalpha(a)
    im = im.crop(a.getbbox())
    cw, ch = Image.open(CUR / f"{name}.png").size
    s = cw / im.width if cw >= ch else ch / im.height
    im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS).save(OUT / f"{name}.png", optimize=True)
    m = PLAN[name].get("final_max_edge", 1024)
    h = min(1.0, m / max(im.size))
    im.resize((round(im.width * h), round(im.height * h)), Image.LANCZOS).save(HI / f"{name}.png", optimize=True)
    print(name, p["variant"], "current", (cw, ch), "staged", Image.open(OUT / f"{name}.png").size, "hires", Image.open(HI / f"{name}.png").size)
