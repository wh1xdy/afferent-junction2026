"""Transcript loading and window slicing.

Two JSONL record shapes are accepted, one record (conversation) per line:

Synthetic / generator format (see Transcription_analyzer/README.md §5.3):

    {"persona_id": "p017", "day": 23, "trajectory": "normal",
     "turns": [{"t": 0.0, "speaker": "interlocutor", "text": "..."},
               {"t": 4.2, "speaker": "target", "text": "..."}],
     "labels": {...}}

Hub capture format (feat/voice-transcript — rows appended by
hub/afferent_hub/transcripts.py under AFFERENT_TRANSCRIPTS_DIR):

    {"transcript_id": "3f6b…", "patient_id": "anna",
     "t_iso": "2026-11-14T15:30:00.000Z",
     "received_iso": "2026-11-14T17:36:43+02:00",
     "turns": [{"role": "user", "text": "..."},
               {"role": "agent", "text": "..."}]}

Hub roles map to speaker labels via ROLE_TO_SPEAKER (`user` is the tracked
person → `target`, `agent` → `interlocutor`), `patient_id` becomes
`persona_id`, `day` falls back to the ISO date of `t_iso`/`received_iso`,
and `transcript_id` becomes `record_id` — the phone's dedupe key, more
robust than file:line across resends and rotating files.

`t` is seconds since conversation start and drives the response-latency
signal; hub rows carry no per-turn timestamps and still score, minus
latency. Real captures use ISO dates for `day`; synthetic data uses
integers — both are normalized to str for storage.
"""
from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass, field
from pathlib import Path

logger = logging.getLogger(__name__)

DEFAULT_TARGET = "target"

# feat/voice-transcript row roles -> analyzer speaker labels. Unknown roles
# keep their raw value (never scored as the target unless configured so).
ROLE_TO_SPEAKER = {"user": DEFAULT_TARGET, "agent": "interlocutor"}

_DAY_RE = re.compile(r"^\d{4}-\d{2}-\d{2}")


@dataclass
class Turn:
    t: float | None
    speaker: str
    text: str


@dataclass
class Window:
    record_id: str
    persona_id: str
    day: str
    trajectory: str
    seq: int                       # window index inside the record
    turns: list[Turn]
    labels: dict = field(default_factory=dict)
    ts_iso: str | None = None      # conversation end (hub t_iso) — sample stamp

    def target_turns(self, target: str = DEFAULT_TARGET) -> list[Turn]:
        return [t for t in self.turns if t.speaker == target]

    @property
    def n_turns(self) -> int:
        return len(self.turns)


def _iso_day(rec: dict) -> str | None:
    """YYYY-MM-DD from `day` when already ISO, else from t_iso/received_iso."""
    for k in ("day", "t_iso", "received_iso"):
        v = rec.get(k)
        if isinstance(v, str):
            m = _DAY_RE.match(v)
            if m:
                return m.group(0)
    return None


def _turns(rec: dict) -> list[Turn]:
    """`speaker` synthetic rows, `role` hub rows — never mixed in one record."""
    out: list[Turn] = []
    for j, tr in enumerate(rec["turns"]):
        if not isinstance(tr, dict):
            raise ValueError(f"turn {j} must be an object")
        if "speaker" in tr:
            speaker = str(tr["speaker"])
        elif "role" in tr:
            speaker = ROLE_TO_SPEAKER.get(tr["role"], str(tr["role"]))
        else:
            raise ValueError(f"turn {j} has neither speaker nor role")
        text = tr.get("text")
        if not isinstance(text, str):
            raise ValueError(f"turn {j} text must be a string")
        if not text.strip():
            logger.debug("skipping empty turn %d", j)
            continue
        out.append(Turn(t=tr.get("t"), speaker=speaker, text=text))
    if not out:
        raise ValueError("record has no non-empty turns")
    return out


def _window(rec: dict, path: Path, i: int) -> Window:
    if not isinstance(rec, dict):
        raise ValueError("record must be an object")
    if not isinstance(rec.get("turns"), list) or not rec["turns"]:
        raise ValueError("record must contain a non-empty turns list")
    hub_row = "transcript_id" in rec or (
        rec.get("turns") and "role" in rec["turns"][0])
    day = rec.get("day")
    return Window(
        record_id=str(rec.get("transcript_id") or f"{path.stem}:{i}"),
        persona_id=str(rec.get("persona_id") or rec.get("patient_id")
                       or "unknown"),
        day=str(day if day is not None else (_iso_day(rec) or "unknown")),
        trajectory=str(rec.get("trajectory")
                       or ("real" if hub_row else "unknown")),
        seq=0,
        turns=_turns(rec),
        labels=rec.get("labels", {}),
        ts_iso=rec.get("t_iso") if isinstance(rec.get("t_iso"), str) else None,
    )


def parse_record(rec: dict, index: int = 0) -> Window:
    """Validate one synthetic or hub record with the same parser as JSONL."""
    return _window(rec, Path("ingest.jsonl"), index)


def load_jsonl(path: str | Path, target: str = DEFAULT_TARGET,
               strict: bool = False) -> list[Window]:
    """One record per line -> one un-sliced Window per record.

    A bad line is skipped (logged) rather than poisoning the whole file —
    rotating hub logs can end in a partial row after a crash mid-append.
    """
    path = Path(path)
    windows: list[Window] = []
    for i, line in enumerate(path.read_text().splitlines()):
        line = line.strip()
        if not line:
            continue
        try:
            rec = json.loads(line)
            windows.append(_window(rec, path, i))
        except Exception as e:
            if strict:
                raise ValueError(
                    f"invalid transcript record in {path.name}:{i}: {e}") from e
            logger.warning("skipping bad record %s:%d: %s", path.name, i, e)
    return windows


def expand_windows(record: Window, max_turns: int, overlap: int,
                   max_chars: int | None = None) -> list[Window]:
    """Slice records by turn count and rendered prompt characters."""
    if max_turns <= 0:
        raise ValueError("max_turns must be positive")
    if overlap < 0 or overlap >= max_turns:
        raise ValueError("overlap must be non-negative and < max_turns")
    if max_chars is not None and max_chars <= 0:
        raise ValueError("max_chars must be positive")

    chunks: list[list[Turn]] = []
    start = 0
    while start < len(record.turns):
        end = start
        while end < len(record.turns) and end - start < max_turns:
            candidate = record.turns[start:end + 1]
            too_long = (max_chars is not None
                        and len(format_for_prompt(candidate)) > max_chars)
            if too_long and end > start:
                break
            end += 1
            if too_long:
                break
        chunk = record.turns[start:end]
        chunks.append(chunk)
        if end >= len(record.turns):
            break
        overlap_turns = min(overlap, len(chunk) - 1)
        start = max(start + 1, end - overlap_turns)

    return [Window(record_id=record.record_id, persona_id=record.persona_id,
                   day=record.day, trajectory=record.trajectory, seq=i,
                   turns=t, labels=record.labels, ts_iso=record.ts_iso)
            for i, t in enumerate(chunks)]


def slice_turns(turns: list[Turn], max_turns: int,
                overlap: int) -> list[list[Turn]]:
    record = Window("", "", "", "", 0, turns)
    return [window.turns for window in expand_windows(
        record, max_turns, overlap)]


def format_for_prompt(turns: list[Turn], target: str = DEFAULT_TARGET) -> str:
    """Human-readable window for the LLM: `[t+42s] interlocutor: ...`."""
    lines = []
    t0 = next((t.t for t in turns if t.t is not None), 0.0) or 0.0
    for tr in turns:
        stamp = f"[t+{tr.t - t0:>7.1f}s] " if tr.t is not None else ""
        lines.append(f"{stamp}{tr.speaker}: {tr.text}")
    return "\n".join(lines)
