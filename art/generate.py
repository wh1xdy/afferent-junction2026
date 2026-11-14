import argparse
import base64
import concurrent.futures
import contextlib
import fcntl
import json
import pathlib
import re
import sys
import threading
import time
import urllib.error
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "art" / "raw"
DRAFT = OUT / "draft"
LEDGER = ROOT / "art" / "spend.json"
LOCK = ROOT / "art" / ".spend.lock"
PLAN = ROOT / "art" / "plan.json"
CAP_USD = 250.0
WORST_CASE_USD = 0.60
MODEL = "gpt-image-1.5"
SIZES = ("1024x1024", "1536x1024", "1024x1536")
FLOOR = {"low": 0.03, "medium": 0.10, "high": 0.30}
PRICE = {"text_in": 5e-6, "image_in": 10e-6, "image_out": 40e-6}
FALLBACK = {"1024x1024": 0.167, "1536x1024": 0.25, "1024x1536": 0.25}
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


def load_assets(plan_path):
    bible = (ROOT / "ArtBible.md").read_text()
    style = re.search(r"^> (.+)$", bible, re.M).group(1).strip()
    suffix = {"isolated": ISOLATED, "backdrop": BACKDROP}
    rows = re.findall(r"^\| (\d+) \| `(\w+)` \| (\d+x\d+) \| (yes|no) \| ([AB]) \| (.+?) \|$", bible, re.M)
    assets = {
        name: dict(n=int(n), name=name, size=size, transparent=t == "yes", prio=p, prompt=pr, quality=None)
        for n, name, size, t, p, pr in rows
    }
    if plan_path.exists():
        plan = json.loads(plan_path.read_text())
        style = plan.get("style", style)
        suffix["isolated"] = plan.get("isolated", ISOLATED)
        suffix["backdrop"] = plan.get("backdrop", BACKDROP)
        for i, a in enumerate(plan.get("assets", [])):
            if a.get("action") == "keep":
                continue
            assets[a["name"]] = dict(
                n=i + 1, name=a["name"], size=a["size"], transparent=a.get("transparent", True),
                prio=a.get("prio", "A"), prompt=a["prompt"], quality=a.get("quality"),
            )
    return style, suffix, list(assets.values())


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


def cost(usage, size, quality):
    floor = FLOOR[quality] * (1.5 if size != "1024x1024" else 1)
    if not usage:
        return max(FALLBACK[size], floor)
    details = usage.get("input_tokens_details") or {}
    text_in = details.get("text_tokens", usage.get("input_tokens", 0))
    image_in = details.get("image_tokens", 0)
    return max(floor, text_in * PRICE["text_in"] + image_in * PRICE["image_in"] + usage.get("output_tokens", 0) * PRICE["image_out"])


class BillingError(Exception):
    pass


def generate(key, prompt, asset, quality, model):
    body = {
        "model": model,
        "prompt": prompt,
        "size": asset["size"],
        "quality": quality,
        "n": 1,
        "output_format": "png",
        "background": "transparent" if asset["transparent"] else "opaque",
    }
    req = urllib.request.Request(
        "https://api.openai.com/v1/images/generations",
        data=json.dumps(body).encode(),
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=300) as r:
            data = json.loads(r.read())
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
        raise RuntimeError(f"HTTP {e.code} {code or etype}: {msg}")
    img = base64.b64decode(data["data"][0]["b64_json"])
    return img, cost(data.get("usage"), asset["size"], quality)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", nargs="*", help="asset names")
    ap.add_argument("--prio", choices=["A", "B"])
    ap.add_argument("--quality", choices=["low", "medium", "high"], help="override the per-asset quality")
    ap.add_argument("--draft", action="store_true", help="write to art/raw/draft/ (default quality medium)")
    ap.add_argument("--model", default=MODEL)
    ap.add_argument("--force", action="store_true", help="regenerate existing files")
    ap.add_argument("--jobs", type=int, default=4, help="parallel requests")
    ap.add_argument("--plan", default=str(PLAN))
    ap.add_argument("--list", action="store_true", help="print the resolved assets and exit")
    args = ap.parse_args()

    style, suffix, assets = load_assets(pathlib.Path(args.plan))
    todo = [a for a in assets if (not args.only or a["name"] in args.only) and (not args.prio or a["prio"] == args.prio)]
    if args.only:
        missing = set(args.only) - {a["name"] for a in todo}
        if missing:
            sys.exit(f"unknown assets: {' '.join(sorted(missing))}")
    bad = [a["name"] for a in todo if a["size"] not in SIZES]
    if bad:
        sys.exit(f"unsupported size for: {' '.join(bad)} (use {', '.join(SIZES)})")
    if args.list:
        for a in todo:
            print(f"{a['name']:24} {a['size']:10} {'transp' if a['transparent'] else 'opaque'} {a['prio']} {a['quality'] or '-'}")
        return

    out = DRAFT if args.draft else OUT
    out.mkdir(parents=True, exist_ok=True)
    key = load_key()
    stop = threading.Event()

    def run(a):
        if stop.is_set():
            return
        quality = args.quality or ("medium" if args.draft else a["quality"] or "high")
        path = out / f"{a['name']}.png"
        if path.exists() and not args.force:
            print(f"skip   {a['name']} (exists)", flush=True)
            return
        total = spent()
        if total + WORST_CASE_USD > CAP_USD:
            print(f"stop   budget cap reached: ${total:.2f} spent, cap ${CAP_USD:.2f}", flush=True)
            stop.set()
            return
        prompt = f"{style} {suffix['isolated'] if a['transparent'] else suffix['backdrop']} {a['prompt']}"
        t = time.time()
        try:
            img, usd = generate(key, prompt, a, quality, args.model)
        except BillingError as e:
            stop.set()
            record({"asset": a["name"], "ok": False, "error": str(e)})
            print(f"STOP   {a['name']}: {e}", flush=True)
            return "billing"
        except Exception as e:
            record({"asset": a["name"], "ok": False, "error": redact(str(e))})
            print(f"error  {a['name']}: {redact(str(e))}", flush=True)
            return
        path.write_bytes(img)
        total = record({"asset": a["name"], "ok": True, "usd": round(usd, 4), "size": a["size"], "quality": quality, "model": args.model, "file": str(path.relative_to(ROOT))})
        print(f"ok     {a['name']}  ${usd:.3f}  total ${total:.2f}  {time.time() - t:.0f}s  {path.relative_to(ROOT)}", flush=True)

    with concurrent.futures.ThreadPoolExecutor(max_workers=max(1, args.jobs)) as pool:
        results = list(pool.map(run, todo))
    if "billing" in results:
        print("stopped, no retry")
        sys.exit(2)


if __name__ == "__main__":
    main()
