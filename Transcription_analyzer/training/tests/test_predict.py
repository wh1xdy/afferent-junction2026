from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "training"))
sys.path.insert(0, str(ROOT / "analyzer"))

from scripts.predict import parse_prediction


def test_malformed_prediction_is_reported_without_scores():
    scores, error = parse_prediction('{"responsiveness":')

    assert scores is None
    assert error


def test_truncated_flat_prediction_recovers_only_numeric_scores():
    raw = """```json
{
  "responsiveness": 95,
  "engagement": 90,
  "fluency": 92,
  "coherence": 94,
  "drift_flag": false,
  "responsiveness_evidence": [
    "truncated
"""
    scores, error = parse_prediction(raw)

    assert scores is not None
    assert error and "recovered flat numeric fields" in error
    assert scores["responsiveness"]["score"] == 95
    assert scores["responsiveness"]["confidence"] == 0.0
    assert scores["responsiveness"]["evidence"] == []
