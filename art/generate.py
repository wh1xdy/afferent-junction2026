import argparse
import base64
import concurrent.futures
import contextlib
import fcntl
import json
import mimetypes
import pathlib
import re
import sys
import threading
import time
import urllib.error
import urllib.request
import uuid

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "art" / "raw"
DRAFT = OUT / "draft"
LEDGER = ROOT / "art" / "spend.json"
LOCK = ROOT / "art" / ".spend.lock"
PLAN = ROOT / "art" / "plan.json"
API = "https://api.openai.com/v1/images/"
CAP_USD = 250.0
WORST_CASE_USD = 0.60
MODEL = "gpt-image-1.5"
LEGACY = ("gpt-image-1", "gpt-image-1-mini", "gpt-image-1.5")
SIZES = ("1024x1024", "1536x1024", "1024x1536")
QUALITIES = ("low", "medium", "high", "xhigh", "max")
FLOOR = {"low": 0.03, "medium": 0.10, "high": 0.30}
PRICE = {"text_in": 5e-6, "image_in": 10e-6, "image_out": 40e-6}
PRICE_NEW = {"text_in": 5e-6, "image_in": 8e-6, "image_out": 30e-6}
FALLBACK = {"1024x1024": 0.167, "1536x1024": 0.25, "1024x1536": 0.25}
FALLBACK_MP = {"low": 0.02, "medium": 0.06, "high": 0.22, "xhigh": 0.35, "max": 0.5}
ISOLATED = (
    "Isolated element on a fully transparent background. Nothing else in the image beyond what is named: "
    "no sky, no backdrop, no frame, no vignette, no border, no extra buildings, islands or water."
)
BACKDROP = "Full-bleed painting that fills the entire frame edge to edge, no frame, no border, no vignette."

def load_key():
    for line in (ROOT / ".env").read_text().splitlines():
        if line.startswith("OPENAI_API_KEY="):
            return line.split("=", 1)[1].strip().strip('"').strip("'")
    sys.exit("OPENAI_API_KEY not found in .env")

def redact(text):
    return re.sub(r"sk-[A-Za-z0-9_\-*.]+", "sk-[redacted]", text)

def legacy(model):
    return model in LEGACY

def size_ok(model, size):
    if legacy(model):
        return size in SIZES
    m = re.fullmatch(r"(\d+)x(\d+)", size)
    if not m:
        return False
    w, h = int(m[1]), int(m[2])
    return w % 16 == 0 and h % 16 == 0 and max(w, h) <= 3840 and max(w, h) <= 3 * min(w, h) and 655360 <= w * h <= 8294400

def refs_of(raw):
    return [r if isinstance(r, dict) else {"path": r} for r in raw or []]

def load_assets(plan_path):
    if not plan_path.exists():
        sys.exit(f"plan not found: {plan_path}")
    plan = json.loads(plan_path.read_text())
    style = plan["style"]
    layout = plan.get("layout", "legacy")
    suffix = {"isolated": plan.get("isolated", ISOLATED), "backdrop": plan.get("backdrop", BACKDROP)}
    suffix.update(plan.get("suffixes", {}))
    assets = [
        dict(
            n=i + 1, name=a["name"], size=a["size"], transparent=a.get("transparent", True),
            prio=a.get("prio", "A"), prompt=a["prompt"], quality=a.get("quality"),
            suffix=a.get("suffix"), raw=a.get("raw", False),
            model=a.get("model", plan.get("model")), variants=a.get("n", plan.get("n", 1)),
            refs=refs_of(a.get("refs", plan.get("refs"))), fidelity=a.get("input_fidelity"),
            complexity=a.get("complexity", plan.get("complexity")),
        )
        for i, a in enumerate(plan.get("assets", []))
        if a.get("action") != "keep"
    ]
    return style, suffix, layout, assets

def build_prompt(a, style, suffix, layout):
    refs = [f"Image {i + 1}: {r['role']}" for i, r in enumerate(a["refs"]) if r.get("role")]
    if a.get("raw"):
        body = [a["prompt"]]
    elif layout == "sections":
        body = [a["prompt"], f"STYLE: {style}", f"CONSTRAINTS: {suffix}"]
    else:
        body = [f"{style} {suffix} {a['prompt']}"]
    return "\n\n".join(([("REFERENCE IMAGES:\n" + "\n".join(refs))] if refs else []) + body)

@contextlib.contextmanager
def locked():
    LOCK.parent.mkdir(parents=True, exist_ok=True)
    with open(LOCK, "a") as fh:
        fcntl.flock(fh, fcntl.LOCK_EX)
        try:
            yield
        finally:
            fcntl.flock(fh, fcntl.LOCK_UN)

def read_ledger():
    return json.loads(LEDGER.read_text()) if LEDGER.exists() else {"total_usd": 0.0, "calls": []}

def record(entry):
    with locked():
        led = read_ledger()
        if entry.get("ok"):
            led["total_usd"] = round(led["total_usd"] + entry["usd"], 4)
        led["calls"].append(entry)
        tmp = LEDGER.with_suffix(".json.tmp")
        tmp.write_text(json.dumps(led, indent=2))
        tmp.replace(LEDGER)
        return led["total_usd"]

def spent():
    with locked():
        return read_ledger()["total_usd"]

def cost(usage, size, quality, model=MODEL, n=1):
    old = legacy(model)
    price = PRICE if old else PRICE_NEW
    w, h = map(int, size.split("x"))
    if old:
        floor = FLOOR.get(quality, FLOOR["high"]) * (1.5 if size != "1024x1024" else 1) * n
        estimate = max(FALLBACK.get(size, 0.25) * n, floor)
    else:
        floor = 0.0
        estimate = FALLBACK_MP[quality] * w * h / 2**20 * n
    if not usage:
        return estimate
    details = usage.get("input_tokens_details") or {}
    text_in = details.get("text_tokens", usage.get("input_tokens", 0))
    image_in = details.get("image_tokens", 0)
    return max(floor, text_in * price["text_in"] + image_in * price["image_in"] + usage.get("output_tokens", 0) * price["image_out"])

class BillingError(Exception):
    pass

def multipart(fields, files):
    boundary = uuid.uuid4().hex
    out = []
    for k, v in fields.items():
        out.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode())
    for p in files:
        mime = mimetypes.guess_type(p.name)[0] or "image/png"
        out += [
            f'--{boundary}\r\nContent-Disposition: form-data; name="image[]"; filename="{p.name}"\r\nContent-Type: {mime}\r\n\r\n'.encode(),
            p.read_bytes(),
            b"\r\n",
        ]
    out.append(f"--{boundary}--\r\n".encode())
    return b"".join(out), f"multipart/form-data; boundary={boundary}"

def post(key, endpoint, data, ctype):
    for attempt in range(5):
        req = urllib.request.Request(API + endpoint, data=data, headers={"Authorization": f"Bearer {key}", "Content-Type": ctype})
        try:
            with urllib.request.urlopen(req, timeout=600) as r:
                return json.loads(r.read())
        except urllib.error.HTTPError as e:
            raw = e.read().decode(errors="replace")
            try:
                err = json.loads(raw).get("error", {})
            except ValueError:
                err = {"message": raw[:300]}
            code, etype, msg = err.get("code") or "", err.get("type") or "", redact(err.get("message") or "")
            billing = e.code in (401, 403) or any(w in f"{code} {etype} {msg}".lower() for w in ("quota", "billing", "credit", "payment", "api_key"))
            if billing:
                raise BillingError(f"HTTP {e.code} {code or etype}: {msg}")
            if (code == "rate_limit_exceeded" or e.code >= 500) and attempt < 4:
                wait = re.search(r"try again in ([\d.]+)s", msg)
                time.sleep((float(wait[1]) if wait else 5) + 2 * attempt + 1)
                continue
            raise RuntimeError(f"HTTP {e.code} {code or etype}: {msg}")

def generate(key, prompt, asset, quality, model, n=1):
    fields = {
        "model": model,
        "prompt": prompt,
        "size": asset["size"],
        "quality": quality,
        "n": n,
        "output_format": "png",
        "background": "transparent" if asset["transparent"] else "opaque",
    }
    if asset.get("complexity") and not legacy(model):
        fields["complexity"] = asset["complexity"]
    refs = [ROOT / r["path"] for r in asset.get("refs") or []]
    if refs:
        if asset.get("fidelity") and legacy(model):
            fields["input_fidelity"] = asset["fidelity"]
        data = post(key, "edits", *multipart(fields, refs))
    else:
        data = post(key, "generations", json.dumps(fields).encode(), "application/json")
    imgs = [base64.b64decode(d["b64_json"]) for d in data["data"]]
    return imgs, cost(data.get("usage"), asset["size"], quality, model, len(imgs))

def outputs(out, a, n):
    return [out / f"{a['name']}.png"] if n == 1 else [out / f"{a['name']}_v{i + 1}.png" for i in range(n)]

def contact_sheet(paths, dest, cell=360, cols=4):
    try:
        from PIL import Image, ImageDraw, ImageFont
    except ImportError:
        sys.exit("--sheet needs Pillow: run with `uv run art/generate.py ...`")
    paths = [p for p in paths if p.exists()]
    if not paths:
        return
    cols = min(cols, len(paths))
    rows = -(-len(paths) // cols)
    label = 28
    sheet = Image.new("RGB", (cols * cell, rows * (cell + label)), "#1E3150")
    tile = Image.new("RGB", (cell, cell), "#C9CED6")
    draw_tile = ImageDraw.Draw(tile)
    for y in range(0, cell, 20):
        for x in range(0, cell, 20):
            if (x // 20 + y // 20) % 2:
                draw_tile.rectangle([x, y, x + 19, y + 19], fill="#E4E7EC")
    font = ImageFont.load_default(size=16)
    draw = ImageDraw.Draw(sheet)
    for i, p in enumerate(paths):
        im = Image.open(p).convert("RGBA")
        im.thumbnail((cell - 8, cell - 8))
        x, y = (i % cols) * cell, (i // cols) * (cell + label)
        bg = tile.copy()
        bg.paste(im, ((cell - im.width) // 2, (cell - im.height) // 2), im)
        sheet.paste(bg, (x, y))
        draw.text((x + 8, y + cell + 5), p.stem[: cell // 9], fill="#F2EEE6", font=font)
    dest.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(dest)
    print(f"sheet  {dest.relative_to(ROOT) if dest.is_relative_to(ROOT) else dest}  ({len(paths)} images)")

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", nargs="*", help="asset names")
    ap.add_argument("--prio", choices=["A", "B"])
    ap.add_argument("--quality", choices=QUALITIES, help="override the per-asset quality")
    ap.add_argument("--draft", action="store_true", help="write to art/raw/draft/ (default quality medium)")
    ap.add_argument("--model", help=f"override the per-asset model (plan 'model', default {MODEL})")
    ap.add_argument("--n", type=int, help="variants per asset, written as <name>_v<i>.png when above 1")
    ap.add_argument("--out", help="output directory (default art/raw, or art/raw/draft with --draft)")
    ap.add_argument("--sheet", nargs="?", const="", help="write a contact sheet of the selected assets (default <out>/_sheet.png)")
    ap.add_argument("--force", action="store_true", help="regenerate existing files")
    ap.add_argument("--jobs", type=int, default=4, help="parallel requests")
    ap.add_argument("--plan", default=str(PLAN))
    ap.add_argument("--list", action="store_true", help="print the resolved assets and exit")
    args = ap.parse_args()

    style, suffix, layout, assets = load_assets(pathlib.Path(args.plan))
    todo = [a for a in assets if (not args.only or a["name"] in args.only) and (not args.prio or a["prio"] == args.prio)]
    if args.only:
        missing = set(args.only) - {a["name"] for a in todo}
        if missing:
            sys.exit(f"unknown assets: {' '.join(sorted(missing))}")
    for a in todo:
        a["model"] = args.model or a.get("model") or MODEL
        a["variants"] = args.n or a.get("variants") or 1
    bad = [f"{a['name']} ({a['size']} on {a['model']})" for a in todo if not size_ok(a["model"], a["size"])]
    if bad:
        sys.exit(f"unsupported size for: {', '.join(bad)}")
    lost = [r["path"] for a in todo for r in a.get("refs") or [] if not (ROOT / r["path"]).exists()]
    if lost:
        sys.exit(f"missing reference images: {' '.join(lost)}")
    if args.list:
        for a in todo:
            print(f"{a['name']:24} {a['size']:10} {'transp' if a['transparent'] else 'opaque'} {a['prio']} {a['quality'] or '-'} "
                  f"{a['model']} n={a['variants']} refs={len(a.get('refs') or [])}")
        return

    out = ROOT / args.out if args.out else DRAFT if args.draft else OUT
    out.mkdir(parents=True, exist_ok=True)
    key = load_key()
    stop = threading.Event()

    def run(a):
        if stop.is_set():
            return
        model, n = a["model"], a["variants"]
        quality = args.quality or ("medium" if args.draft else a["quality"] or "high")
        if legacy(model) and quality not in FLOOR:
            print(f"error  {a['name']}: quality {quality} needs a gpt-image-2.5 or newer model", flush=True)
            return
        paths = outputs(out, a, n)
        if all(p.exists() for p in paths) and not args.force:
            print(f"skip   {a['name']} (exists)", flush=True)
            return
        total = spent()
        if total + WORST_CASE_USD * n > CAP_USD:
            print(f"stop   budget cap reached: ${total:.2f} spent, cap ${CAP_USD:.2f}", flush=True)
            stop.set()
            return
        kind = a.get("suffix") or ("isolated" if a["transparent"] else "backdrop")
        prompt = build_prompt(a, style, suffix.get(kind, ""), layout)
        t = time.time()
        try:
            imgs, usd = generate(key, prompt, a, quality, model, n)
        except BillingError as e:
            stop.set()
            record({"asset": a["name"], "ok": False, "model": model, "error": str(e)})
            print(f"STOP   {a['name']}: {e}", flush=True)
            return "billing"
        except Exception as e:
            record({"asset": a["name"], "ok": False, "model": model, "error": redact(str(e))})
            print(f"error  {a['name']}: {redact(str(e))}", flush=True)
            return
        for p, img in zip(paths, imgs):
            p.write_bytes(img)
        rel = [str(p.relative_to(ROOT)) for p in paths[: len(imgs)]]
        entry = {"asset": a["name"], "ok": True, "usd": round(usd, 4), "size": a["size"], "quality": quality, "model": model, "file": rel[0]}
        if n > 1:
            entry["files"] = rel
        if a.get("refs"):
            entry["refs"] = [r["path"] for r in a["refs"]]
        total = record(entry)
        print(f"ok     {a['name']}  ${usd:.3f}  total ${total:.2f}  {time.time() - t:.0f}s  {' '.join(rel)}", flush=True)

    with concurrent.futures.ThreadPoolExecutor(max_workers=max(1, args.jobs)) as pool:
        results = list(pool.map(run, todo))
    if args.sheet is not None:
        contact_sheet([p for a in todo for p in outputs(out, a, a["variants"])], ROOT / args.sheet if args.sheet else out / "_sheet.png")
    if "billing" in results:
        print("stopped, no retry")
        sys.exit(2)

if __name__ == "__main__":
    main()
