"""Transcript loading and window slicing.

Input format (see Transcription_analyzer/README.md §5.3): one JSONL record per
conversation —

    {"persona_id": "p017", "day": 23, "trajectory": "normal",
     "turns": [{"t": 0.0, "speaker": "interlocutor", "text": "..."},
               {"t": 4.2, "speaker": "target", "text": "..."}],
     "labels": {...}}

`t` is seconds since conversation start and drives the response-latency
signal; a transcript without usable timestamps still scores, minus latency.
Real captures use ISO dates for `day`; synthetic data uses integers — both
are normalized to str for storage.
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path

DEFAULT_TARGET = "target"


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

    def target_turns(self, target: str = DEFAULT_TARGET) -> list[Turn]:
        return [t for t in self.turns if t.speaker == target]

    @property
    def n_turns(self) -> int:
        return len(self.turns)


def load_jsonl(path: str | Path, target: str = DEFAULT_TARGET) -> list[Window]:
    """One record per line -> one un-sliced Window per record."""
    path = Path(path)
    windows: list[Window] = []
    for i, line in enumerate(path.read_text().splitlines()):
        line = line.strip()
        if not line:
            continue
        rec = json.loads(line)
        turns = [Turn(t=tr.get("t"), speaker=tr["speaker"], text=tr["text"])
                 for tr in rec["turns"]]
        windows.append(Window(
            record_id=f"{path.stem}:{i}",
            persona_id=str(rec.get("persona_id", "unknown")),
            day=str(rec.get("day", "unknown")),
            trajectory=str(rec.get("trajectory", "unknown")),
            seq=0,
            turns=turns,
            labels=rec.get("labels", {}),
        ))
    return windows


def slice_turns(turns: list[Turn], max_turns: int, overlap: int) -> list[list[Turn]]:
    """Split a long conversation into overlapping analysis windows."""
    if len(turns) <= max_turns or max_turns <= 0:
        return [turns]
    if overlap >= max_turns:
        raise ValueError("window_overlap must be < max_window_turns")
    step = max_turns - overlap
    out = []
    for start in range(0, len(turns), step):
        chunk = turns[start:start + max_turns]
        if len(chunk) < 4 and out:      # tail too small to score: merge into prev
            out[-1].extend(chunk)
            break
        out.append(chunk)
        if start + max_turns >= len(turns):
            break
    return out


def expand_windows(record: Window, max_turns: int, overlap: int) -> list[Window]:
    return [Window(record_id=record.record_id, persona_id=record.persona_id,
                   day=record.day, trajectory=record.trajectory, seq=i,
                   turns=t, labels=record.labels)
            for i, t in enumerate(slice_turns(record.turns, max_turns, overlap))]


def format_for_prompt(turns: list[Turn], target: str = DEFAULT_TARGET) -> str:
    """Human-readable window for the LLM: `[t+42s] interlocutor: ...`."""
    lines = []
    t0 = next((t.t for t in turns if t.t is not None), 0.0) or 0.0
    for tr in turns:
        stamp = f"[t+{tr.t - t0:>7.1f}s] " if tr.t is not None else ""
        lines.append(f"{stamp}{tr.speaker}: {tr.text}")
    return "\n".join(lines)
