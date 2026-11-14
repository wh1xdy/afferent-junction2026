import json

import pytest

from analyzer.backend import MockBackend
from analyzer.metrics import extract
from analyzer.scoring import (DIMENSIONS, ScoreError, build_messages,
                              parse_score, score_window)


def test_prompt_contains_metrics_and_transcript(simple_window):
    msgs = build_messages(simple_window, extract(simple_window))
    assert msgs[0]["role"] == "system"
    assert "response_latency_s" in msgs[1]["content"]
    assert "Maria" in msgs[1]["content"]


def test_parse_valid_output():
    raw = json.dumps({
        **{d: {"score": 55, "confidence": 0.7, "evidence": ["ok"]}
           for d in DIMENSIONS},
        "drift_flag": False, "notes": "fine",
    })
    s = parse_score(raw)
    assert s.responsiveness.score == 55
    assert s.drift_flag is False


def test_parse_rejects_garbage():
    with pytest.raises(ScoreError):
        parse_score("not json at all")
    with pytest.raises(ScoreError):
        parse_score(json.dumps({"responsiveness": {"score": 200}}))


def test_score_window_with_mock_backend(simple_window):
    backend = MockBackend({"responsiveness": 42})
    s = score_window(backend, simple_window, extract(simple_window))
    assert s.responsiveness.score == 42
    assert s.engagement.score == 50
    assert backend.calls == 1


def test_retry_on_invalid_output(simple_window):
    class BadThenGood(MockBackend):
        def __init__(self):
            super().__init__()
            self._first = True

        def complete_json(self, messages):
            if self._first:
                self._first = False
                return "broken"
            return super().complete_json(messages)

    s = score_window(BadThenGood(), simple_window,
                     extract(simple_window), retries=1)
    assert s.responsiveness.score == 50
