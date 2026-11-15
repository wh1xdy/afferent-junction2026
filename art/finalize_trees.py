# /// script
# requires-python = ">=3.10"
# dependencies = ["pillow"]
# ///
"""Turns the picked tree variants in art/raw/ into the one shipped tree atlas, demo/assets/trees.webp.

For every asset in art/plan.json with a "pick": alpha below 10 (the faint haze the model leaves around the twigs) goes
to 0 and alpha from 248 up to 255, the tree is trimmed to what is left and scaled so its longer edge is
final_max_edge. The trees then sit side by side in one image, bottoms on its bottom edge, with a transparent gap
between them, written as a lossy WebP with lossless alpha. One image instead of six keeps the start of the app as
fast as before: art.js loads and prepares every image of the manifest before the loading screen leaves.

Where each tree is goes into the "trees" entry of demo/assets/manifest.json as fractions of the image that art.js
keeps after trimming its transparent border (the same scan as art.js prepare(), on the decoded file):
    frames[name] = {"s": [u0, u1] slice to draw (gap middles), "b": [u0, u1, v0, v1] the tree's own box}
    uv run art/finalize_trees.py
"""
import io
import json
import pathlib

from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
RAW = ROOT / "art" / "raw"
ASSETS = ROOT / "demo" / "assets"
PLAN = ROOT / "art" / "plan.json"
MANIFEST = ASSETS / "manifest.json"
FLOOR, CEIL, GAP, NAME = 10, 248, 6, "trees"


def tree(a):
    im = Image.open(RAW / f"{a['name']}_{a['pick']}.png").convert("RGBA")
    alpha = im.getchannel("A").point(lambda v: 0 if v < FLOOR else 255 if v >= CEIL else v)
    im.putalpha(alpha)
    im = im.crop(alpha.getbbox())
    s = min(1, a["final_max_edge"] / max(im.size))
    im = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
    alpha = im.getchannel("A").point(lambda v: 0 if v < FLOOR else v)
    im.putalpha(alpha)
    return im.crop(alpha.getbbox())


def art_js_trim(im):
    """The border art.js prepare() cuts: the bounding box of alpha > 12 over every second row and column."""
    a = im.getchannel("A").load()
    w, h = im.size
    x0, y0, x1, y1 = w, h, 0, 0
    for y in range(0, h, 2):
        for x in range(0, w, 2):
            if a[x, y] > 12:
                x0, x1, y0, y1 = min(x0, x), max(x1, x), min(y0, y), max(y1, y)
    return x0, y0, min(w - x0, x1 - x0 + 2), min(h - y0, y1 - y0 + 2)


def main():
    plan = json.loads(PLAN.read_text())
    picks = [a for a in plan["assets"] if a.get("pick")]
    trees = [(a["name"], tree(a)) for a in picks]
    W = sum(t.width for _, t in trees) + GAP * (len(trees) - 1)
    H = max(t.height for _, t in trees)
    atlas = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    at, x = {}, 0
    for name, t in trees:
        atlas.paste(t, (x, H - t.height))
        at[name] = (x, x + t.width)
        x += t.width + GAP
    buf = io.BytesIO()
    atlas.save(buf, "WEBP", quality=88, alpha_quality=100, method=6)
    out = ASSETS / f"{NAME}.webp"
    out.write_bytes(buf.getvalue())
    dec = Image.open(io.BytesIO(buf.getvalue())).convert("RGBA")
    ox, oy, w, h = art_js_trim(dec)
    alpha = dec.getchannel("A")
    frames, r = {}, lambda v: round(v, 5)
    for name, (a0, a1) in at.items():
        bx0, by0, bx1, by1 = alpha.crop((a0, 0, a1, H)).getbbox()
        s0, s1 = max(ox, a0 - GAP / 2), min(ox + w, a1 + GAP / 2)
        frames[name] = {"s": [r((s0 - ox) / w), r((s1 - ox) / w)],
                        "b": [r((a0 + bx0 - ox) / w), r((a0 + bx1 - ox) / w), r((by0 - oy) / h), r((by1 - oy) / h)]}
        print(f"{name:16} {bx1 - bx0}x{by1 - by0}")
    raw = MANIFEST.read_text()
    manifest = json.loads(raw)
    entry = {"name": NAME, "ext": "webp", "frames": frames}
    names = [e if isinstance(e, str) else e["name"] for e in manifest]
    if NAME in names:
        manifest[names.index(NAME)] = entry
    else:
        manifest.append(entry)
    MANIFEST.write_text(json.dumps(manifest, indent=1) + ("\n" if raw.endswith("\n") else ""))
    print(f"{out.relative_to(ROOT)} {W}x{H} {len(buf.getvalue()) / 1024:.0f} KB, prepared as {w}x{h} from ({ox}, {oy})")


if __name__ == "__main__":
    main()
