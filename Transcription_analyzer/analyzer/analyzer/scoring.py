"""The LLM scoring contract: prompt building, JSON schema, response validation.

The schema below is the single source of truth — it is sent to llama.cpp as a
grammar constraint, to OpenAI-compatible servers as `json_schema`, and is
mirrored by the pydantic models that validate whatever comes back.
"""
from __future__ import annotations

import json
from typing import Any

from pydantic import BaseModel, Field

from .transcript import Window, format_for_prompt, DEFAULT_TARGET

_DIM = {
    "type": "object",
    "properties": {
        "score": {"type": "integer", "minimum": 0, "maximum": 100},
        "confidence": {"type": "number", "minimum": 0, "maximum": 1},
        "evidence": {
            "type": "array",
            "items": {"type": "string", "maxLength": 200},
            "maxItems": 3,
        },
    },
    "required": ["score", "confidence", "evidence"],
    "additionalProperties": False,
}

DIMENSIONS = ("responsiveness", "engagement", "fluency", "coherence")

SCORE_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        **{d: _DIM for d in DIMENSIONS},
        "drift_flag": {"type": "boolean"},
        "notes": {"type": "string", "maxLength": 400},
    },
    "required": [*DIMENSIONS, "drift_flag", "notes"],
    "additionalProperties": False,
}


class DimScore(BaseModel):
    score: int = Field(ge=0, le=100)
    confidence: float = Field(ge=0.0, le=1.0)
    evidence: list[str] = Field(default_factory=list, max_length=3)


class WindowScore(BaseModel):
    responsiveness: DimScore
    engagement: DimScore
    fluency: DimScore
    coherence: DimScore
    drift_flag: bool
    notes: str = ""


class ScoreError(ValueError):
    """Model output did not parse to a valid WindowScore."""


SYSTEM_PROMPT = """\
You are a careful analyst of conversation transcripts. You score how the
speaker labelled "%(target)s" communicates INSIDE THIS WINDOW — how they
talk, not what they talk about, and never a diagnosis.

Score each dimension from 0 (very degraded) to 100 (very good):
- responsiveness : how readily and promptly they answer — short or absent
  replies, long silences, needing repeated prompts all lower the score.
- engagement     : willingness to take part — initiating topics, asking
  questions back, elaborating beyond minimal answers.
- fluency        : ease of expression — hesitation markers, abandoned or
  repeated phrases, fillers lower the score.
- coherence      : staying on topic — tangential or confused replies lower it.

Rules:
- Judge this window on its own; do not assume a baseline you cannot see.
- Quote up to 3 short verbatim spans as evidence per dimension.
- drift_flag is true only if this window is CLEARLY degraded on several
  dimensions at once.
- Output ONLY the JSON object matching the required schema.
""" % {"target": DEFAULT_TARGET}


def build_messages(win: Window, metrics: dict,
                   target: str = DEFAULT_TARGET) -> list[dict[str, str]]:
    user = (
        "Extracted metrics for this window (deterministic, ground truth for "
        "counts — do not re-derive them):\n"
        f"```json\n{json.dumps(metrics, ensure_ascii=False)}\n```\n\n"
        "Transcript window:\n"
        f"```\n{format_for_prompt(win.turns, target)}\n```"
    )
    return [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": user},
    ]


def parse_score(raw: str) -> WindowScore:
    """Parse raw model output; raises ScoreError with a repairable message."""
    text = raw.strip()
    # tolerate a fenced block even though the prompt forbids it
    if text.startswith("```"):
        text = text.split("\n", 1)[-1].rsplit("```", 1)[0].strip()
    try:
        data = json.loads(text)
    except json.JSONDecodeError as e:
        raise ScoreError(f"output is not JSON: {e}") from e
    try:
        return WindowScore.model_validate(data)
    except Exception as e:
        raise ScoreError(f"JSON does not match schema: {e}") from e


def score_window(backend, win: Window, metrics: dict,
                 target: str = DEFAULT_TARGET, retries: int = 1) -> WindowScore:
    """Prompt -> generate -> validate, with a limited repair retry."""
    messages = build_messages(win, metrics, target)
    for attempt in range(retries + 1):
        raw = backend.complete_json(messages)
        try:
            return parse_score(raw)
        except ScoreError as e:
            if attempt >= retries:
                raise
            messages = [*messages,
                        {"role": "assistant", "content": raw},
                        {"role": "user",
                         "content": f"Invalid output ({e}). Return ONLY the "
                                    "valid JSON object, nothing else."}]
    raise AssertionError("unreachable")
