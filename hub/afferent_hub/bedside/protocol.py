def _num(s):
    return float(s)

def _bool(s):
    return s.strip() not in ("0", "", "false")

def parse_line(line: str) -> dict | None:
    line = (line or "").strip()
    if not line or line.startswith("#"):
        return None
    parts = line.split()
    head, args = parts[0], parts[1:]
    try:
        if head == "V":
            return {"type": "hello", "device": "unoq", "fw": " ".join(args) or None}
        if head == "K" and args[:1] == ["turn"] and len(args) >= 2:
            return {"type": "knob", "level": max(0, min(100, int(round(_num(args[1])))))}
        if head == "K" and args[:1] == ["press"]:
            return {"type": "knob", "press": True}
        if head == "P" and len(args) >= 3:
            bpm, quality, contact = _num(args[0]), _num(args[1]), _bool(args[2])
            return {"type": "pulse", "bpm": bpm if bpm > 0 and contact else None,
                    "quality": max(0.0, min(1.0, quality)), "contact": contact, "source": "ky039"}
        if head == "I" and len(args) >= 2:
            return {"type": "presence", "in_bed": _bool(args[0]), "motion": _bool(args[1])}
        if head == "T" and len(args) >= 2:
            return {"type": "thermo", "temp_c": _num(args[0]), "humidity_pct": _num(args[1])}
    except ValueError:
        return None
    return None

def hex_rgb(hex_str: str) -> tuple[int, int, int]:
    h = (hex_str or "#000000").lstrip("#")
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    try:
        return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)
    except (ValueError, IndexError):
        return 0, 0, 0

def format_line(msg: dict) -> str | None:
    t = msg.get("type")
    if t == "light":
        r, g, b = hex_rgb(msg.get("rgb"))
        level = max(0, min(100, int(round(msg.get("level") or 0))))
        fade = max(0, min(60000, int(msg.get("fade_ms") or 0)))
        return f"L {r} {g} {b} {level} {fade}"
    if t == "camera":
        return f"C {1 if msg.get('on') else 0}"
    if t == "status":
        return "S"
    return None
