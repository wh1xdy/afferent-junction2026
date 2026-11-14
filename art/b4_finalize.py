# /// script
# requires-python = ">=3.10"
# dependencies = ["pillow"]
# ///
import argparse
import json
import pathlib

from PIL import Image, ImageDraw, ImageFont, ImageOps

ROOT = pathlib.Path(__file__).resolve().parent.parent
RAW = ROOT / "art" / "final2" / "raw" / "b4_backdrops_keyart"
FINAL = ROOT / "art" / "final2"
SHEETS = FINAL / "sheets"
HIRES = FINAL / "hires"
CURRENT = [ROOT / "demo" / "assets", ROOT.parent / "afferent-game-mg" / "demo" / "assets"]
PLAN = ROOT / "art" / "plan_v5.json"

def candidates(name):
    return sorted(p for p in RAW.rglob(f"{name}*.png") if p.stem == name or p.stem.startswith(name + "_"))

def sheet(name):
    paths = candidates(name)
    if not paths:
        return
    cell = 520
    label = 30
    ims = []
    for p in paths:
        im = Image.open(p).convert("RGB")
        im.thumbnail((cell, cell))
        ims.append((p, im))
    cols = min(4, len(ims))
    rows = -(-len(ims) // cols)
    out = Image.new("RGB", (cols * cell, rows * (cell + label)), "#0E1A2E")
    draw = ImageDraw.Draw(out)
    font = ImageFont.load_default(size=18)
    for i, (p, im) in enumerate(ims):
        x, y = (i % cols) * cell, (i // cols) * (cell + label)
        out.paste(im, (x + (cell - im.width) // 2, y + (cell - im.height) // 2))
        draw.text((x + 8, y + cell + 6), str(p.relative_to(RAW)), fill="#F2EEE6", font=font)
    SHEETS.mkdir(parents=True, exist_ok=True)
    out.save(SHEETS / f"{name}.png")
    print("sheet", SHEETS / f"{name}.png", len(ims))

def target_size(name, im):
    for d in CURRENT:
        cur = d / f"{name}.png"
        if cur.exists():
            return Image.open(cur).size
    plan = json.loads(PLAN.read_text())
    edge = next(a.get("final_max_edge", 2560) for a in plan["assets"] if a["name"] == name)
    s = edge / max(im.size)
    return (round(im.width * min(1, s)), round(im.height * min(1, s)))

def stage(name, src):
    im = Image.open(src)
    if im.mode == "RGBA":
        a = im.getchannel("A").point(lambda v: 255 if v >= 248 else v)
        im.putalpha(a)
        box = a.getbbox()
        if box:
            im = im.crop(box)
    else:
        im = im.convert("RGB")
    HIRES.mkdir(parents=True, exist_ok=True)
    im.save(HIRES / f"{name}.png", optimize=True)
    size = target_size(name, im)
    ImageOps.fit(im, size, Image.LANCZOS).save(FINAL / f"{name}.png", optimize=True)
    print("staged", name, src.relative_to(RAW), "->", size)

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--sheet", nargs="*", default=[])
    ap.add_argument("--stage", nargs=2, action="append", metavar=("NAME", "RAWFILE"), default=[])
    args = ap.parse_args()
    for n in args.sheet:
        sheet(n)
    for n, f in args.stage:
        stage(n, RAW / f)
