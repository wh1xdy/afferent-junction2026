import re

MAX_CHARS = 900
MIN_SENTENCES = 3
MAX_SENTENCES = 6

FORBIDDEN = (
    "treats", "treat", "prevents relapse", "prevent", "diagnos", "detects emotion", "emotion",
    "hrv", "heart rate variability", "measures alertness", "alertness", "clinically validated",
    "validated", "should", "recommend", "advise", "advice", "suggest that you", "must", "need to",
    "suicid", "self-harm", "self harm", "crisis", "emergency", "helpline", "hotline",
    "medication", "prescri", "dose", "relapse", "depress", "disorder", "symptom", "because",
    "caused", "due to", "\u2014",
)

_NUMBER = re.compile(r"(?<![\w.])[-+\u2212]?\d+(?:\.\d+)?")
_THOUSANDS = re.compile(r"(?<=\d),(?=\d{3}\b)")
_SENTENCE_END = re.compile(r"(?<=[.!?])\s+(?=[A-Z(])")


def _collect(value, out):
    if isinstance(value, bool) or value is None:
        return
    if isinstance(value, (int, float)):
        out.append(float(value))
    elif isinstance(value, str):
        out.extend(float(m) for m in re.findall(r"\d+(?:\.\d+)?", value))
    elif isinstance(value, dict):
        for v in value.values():
            _collect(v, out)
    elif isinstance(value, (list, tuple)):
        for v in value:
            _collect(v, out)


def allowed_numbers(numbers: dict) -> set[float]:
    raw = []
    _collect(numbers, raw)
    allowed = {float(i) for i in range(11)}
    for v in raw:
        a = abs(v)
        for d in (0, 1, 2):
            allowed.add(round(a, d))
            allowed.add(round(a * 100, d))
    return allowed


def extract_numbers(text: str) -> list[float]:
    clean = _THOUSANDS.sub("", text)
    return [abs(float(m.replace("\u2212", "-"))) for m in _NUMBER.findall(clean)]


def untraceable_numbers(text: str, numbers: dict) -> list[float]:
    allowed = allowed_numbers(numbers)
    return [x for x in extract_numbers(text) if not any(abs(x - a) < 1e-9 for a in allowed)]


def forbidden_phrases(text: str) -> list[str]:
    low = text.lower()
    found = [p for p in FORBIDDEN if p in low]
    if re.search(r"\b112\b", low):
        found.append("112")
    return found


def sentences(text: str) -> list[str]:
    return [s for s in _SENTENCE_END.split(text.strip()) if s]


def normalize(text: str) -> str:
    text = (text or "").strip()
    text = re.sub(r"[*_#`>]+", "", text)
    text = re.sub(r"^\s*[-\u2022]\s+", "", text, flags=re.M)
    text = re.sub(r"\s*\u2014\s*", ", ", text)
    text = re.sub(r"\s*\u2013\s*", " to ", text)
    text = re.sub(r"\s+", " ", text).strip()
    if text.startswith('"') and text.endswith('"'):
        text = text[1:-1].strip()
    return text


def check(text: str, numbers: dict) -> str | None:
    if not text:
        return "empty"
    if len(text) > MAX_CHARS:
        return f"too long ({len(text)} chars)"
    n = len(sentences(text))
    if not MIN_SENTENCES <= n <= MAX_SENTENCES:
        return f"{n} sentences"
    bad = forbidden_phrases(text)
    if bad:
        return "forbidden phrase: " + ", ".join(bad)
    stray = untraceable_numbers(text, numbers)
    if stray:
        return "untraceable number: " + ", ".join(f"{x:g}" for x in stray)
    name = str(numbers.get("display_name") or "")
    if name and name.lower() not in text.lower():
        return "patient name missing"
    if numbers.get("simulated") and "simulated" not in text.lower():
        return "simulated label missing"
    return None
