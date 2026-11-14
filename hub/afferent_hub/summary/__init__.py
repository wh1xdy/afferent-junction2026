import hashlib
import json
import os
from datetime import datetime

from . import guard, ollama, prompt, template
from .numbers import summary_numbers

DISCLAIMER = "Written on the hub from the numbers shown. Rephrasing only: no advice, no diagnosis."

_cache: dict[tuple[str, str], dict] = {}
checks: list = []


def _key(patient_id, numbers):
    return patient_id, hashlib.sha256(json.dumps(numbers, sort_keys=True).encode()).hexdigest()


def _gemma(numbers):
    if os.environ.get("AFFERENT_SUMMARY", "").lower() == "template":
        return None, None, "disabled by AFFERENT_SUMMARY=template"
    model = ollama.discover()
    if not model:
        return None, None, "no Gemma model on Ollama"
    system, user = prompt.build(numbers)
    try:
        text = guard.normalize(ollama.generate(model, system, user))
    except Exception as exc:
        return None, model, f"ollama error: {type(exc).__name__}"
    reason = guard.check(text, numbers) or next((r for c in checks if (r := c(text))), None)
    if reason:
        return None, model, f"rejected: {reason}"
    return text, model, None


def weekly_summary(analytics: dict, patient: dict, refresh: bool = False) -> dict:
    numbers = summary_numbers(analytics, patient)
    patient_id = (analytics or {}).get("patient_id") or ((patient or {}).get("patient") or patient or {}).get("id")
    key = _key(patient_id, numbers)
    if not refresh and key in _cache:
        return dict(_cache[key])

    text, model, reason = _gemma(numbers)
    source = "gemma"
    if text is None:
        text, source, model = template.render(numbers), "template", None
    generated = datetime.now().astimezone().isoformat(timespec="seconds")
    result = {
        "patient_id": patient_id,
        "week_start_day": numbers["week_start_day"],
        "week_end_day": numbers["week_end_day"],
        "generated_iso": generated,
        "text": text,
        "source": source,
        "model": model,
        "numbers": numbers,
        "simulated": numbers["simulated"],
        "disclaimer": DISCLAIMER,
        "fallback_reason": reason,
    }
    if source == "gemma":
        _cache[key] = result
    return dict(result)


def clear_cache() -> None:
    _cache.clear()
    ollama.reset()


__all__ = ["weekly_summary", "summary_numbers", "clear_cache", "checks", "DISCLAIMER"]
