import json
import os
import time
import urllib.error
import urllib.request

TAGS_TIMEOUT_S = 2.0
GENERATE_TIMEOUT_S = 20.0
DISCOVERY_TTL_S = 60.0
PREFERENCE = ("gemma3n", "gemma3", "gemma")

_discovery = {"url": None, "at": 0.0, "model": None}


def base_url() -> str:
    return os.environ.get("AFFERENT_OLLAMA_URL", "http://localhost:11434").rstrip("/")


def _request(url, payload=None, timeout=GENERATE_TIMEOUT_S):
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def pick_model(names: list[str]) -> str | None:
    names = [n for n in names if n]
    for prefix in PREFERENCE:
        hits = sorted(n for n in names if n.lower().split(":")[0] == prefix)
        if hits:
            return hits[0]
    gemma = sorted(n for n in names if "gemma" in n.lower() and "embed" not in n.lower())
    return gemma[0] if gemma else None


def discover(force: bool = False) -> str | None:
    override = os.environ.get("AFFERENT_GEMMA_MODEL")
    if override:
        return override
    url = base_url()
    now = time.monotonic()
    if not force and _discovery["url"] == url and now - _discovery["at"] < DISCOVERY_TTL_S:
        return _discovery["model"]
    try:
        tags = _request(f"{url}/api/tags", timeout=TAGS_TIMEOUT_S)
        model = pick_model([m.get("name") or m.get("model") for m in tags.get("models") or []])
    except (OSError, ValueError, urllib.error.URLError):
        model = None
    _discovery.update(url=url, at=now, model=model)
    return model


def generate(model: str, system: str, prompt: str) -> str:
    body = {
        "model": model,
        "system": system,
        "prompt": prompt,
        "stream": False,
        "keep_alive": "30m",
        "options": {"temperature": 0.2, "num_predict": 320},
    }
    return (_request(f"{base_url()}/api/generate", body).get("response") or "").strip()


def reset() -> None:
    _discovery.update(url=None, at=0.0, model=None)
