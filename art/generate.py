import argparse
import base64
import json
import pathlib
import re
import sys
import time
import urllib.error
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "art" / "raw"
LEDGER = ROOT / "art" / "spend.json"
CAP_USD = 45.0
WORST_CASE_USD = 0.60
MODEL = "gpt-image-1.5"
FLOOR = {"low": 0.03, "medium": 0.10, "high": 0.30}
PRICE = {"text_in": 5e-6, "image_in": 10e-6, "image_out": 40e-6}
FALLBACK = {"1024x1024": 0.167, "1536x1024": 0.25, "1024x1536": 0.25}


def load_key():
    for line in (ROOT / ".env").read_text().splitlines():
        if line.startswith("OPENAI_API_KEY="):
            return line.split("=", 1)[1].strip().strip('"').strip("'")
    sys.exit("OPENAI_API_KEY not found in .env")


def redact(text):
    return re.sub(r"sk-[A-Za-z0-9_\-*.]+", "sk-[redacted]", text)


def load_assets():
    bible = (ROOT / "ArtBible.md").read_text()
    style = re.search(r"^> (.+)$", bible, re.M).group(1).strip()
    rows = re.findall(r"^\| (\d+) \| `(\w+)` \| (\d+x\d+) \| (yes|no) \| ([AB]) \| (.+?) \|$", bible, re.M)
    assets = [dict(n=int(n), name=name, size=size, transparent=t == "yes", prio=p, prompt=pr) for n, name, size, t, p, pr in rows]
    return style, assets


def ledger():
    return json.loads(LEDGER.read_text()) if LEDGER.exists() else {"total_usd": 0.0, "calls": []}


def save_ledger(led):
    LEDGER.write_text(json.dumps(led, indent=2))


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


def generate(key, style, asset, quality, model):
    body = {
        "model": model,
        "prompt": f"{style} {asset['prompt']} Show only this element and nothing else: no extra buildings, no water, no lighthouse, no island unless named above.",
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
    ap.add_argument("--quality", default="high", choices=["low", "medium", "high"])
    ap.add_argument("--model", default=MODEL)
    ap.add_argument("--force", action="store_true", help="regenerate existing files")
    args = ap.parse_args()

    key = load_key()
    style, assets = load_assets()
    todo = [a for a in assets if (not args.only or a["name"] in args.only) and (not args.prio or a["prio"] == args.prio)]
    OUT.mkdir(parents=True, exist_ok=True)
    led = ledger()

    for a in todo:
        path = OUT / f"{a['n']:02d}_{a['name']}.png"
        if path.exists() and not args.force:
            print(f"skip   {a['name']} (exists)")
            continue
        if led["total_usd"] + WORST_CASE_USD > CAP_USD:
            print(f"stop   budget cap reached: ${led['total_usd']:.2f} spent, cap ${CAP_USD:.2f}")
            break
        t = time.time()
        try:
            img, usd = generate(key, style, a, args.quality, args.model)
        except BillingError as e:
            led["calls"].append({"asset": a["name"], "ok": False, "error": str(e)})
            save_ledger(led)
            print(f"STOP   {a['name']}: {e}")
            print("stopped, no retry")
            sys.exit(2)
        except Exception as e:
            led["calls"].append({"asset": a["name"], "ok": False, "error": redact(str(e))})
            save_ledger(led)
            print(f"error  {a['name']}: {redact(str(e))}")
            continue
        path.write_bytes(img)
        led["total_usd"] = round(led["total_usd"] + usd, 4)
        led["calls"].append({"asset": a["name"], "ok": True, "usd": round(usd, 4), "size": a["size"], "quality": args.quality, "model": args.model})
        save_ledger(led)
        print(f"ok     {a['name']}  ${usd:.3f}  total ${led['total_usd']:.2f}  {time.time() - t:.0f}s")


if __name__ == "__main__":
    main()
