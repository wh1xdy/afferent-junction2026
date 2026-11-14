import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from analyzer.transcript import Turn, Window  # noqa: E402


@pytest.fixture
def simple_window() -> Window:
    """6-turn exchange: target answers promptly, then goes quiet."""
    return Window(
        record_id="test:0", persona_id="p001", day="1",
        trajectory="normal", seq=0,
        turns=[
            Turn(0.0, "interlocutor", "How was your day, Maria?"),
            Turn(4.0, "target", "Pretty good — I finally fixed the fence and "
                                "took the dog out for a long walk by the lake."),
            Turn(20.0, "interlocutor", "That sounds lovely. What else did you do?"),
            Turn(24.5, "target", "I called my daughter, we talked for an hour."),
            Turn(40.0, "interlocutor", "How is she doing?"),
            Turn(48.0, "target", "She is well, um, busy with work I think."),
        ],
        labels={"responsiveness": 80, "engagement": 75, "fluency": 85,
                "coherence": 90, "drift_flag": False},
    )


@pytest.fixture
def transcript_file(tmp_path, simple_window) -> Path:
    rec = {
        "persona_id": simple_window.persona_id,
        "day": int(simple_window.day),
        "trajectory": simple_window.trajectory,
        "turns": [{"t": t.t, "speaker": t.speaker, "text": t.text}
                  for t in simple_window.turns],
        "labels": simple_window.labels,
    }
    path = tmp_path / "conv.jsonl"
    path.write_text(json.dumps(rec) + "\n")
    return path
