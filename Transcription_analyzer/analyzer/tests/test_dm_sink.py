"""Data-manager sink: what leaves the analyzer, what stays local."""
import json
import urllib.request

import pytest

from analyzer.config import Config
from analyzer.dm_sink import (DataManagerSink, SPEECH_METRICS, _day_ts,
                              _sample_ts, _source)
from analyzer.scoring import DimScore, WindowScore
from analyzer.transcript import Turn, Window


class FakeClient:
    """Stands in for DataManagerClient — records calls, never touches net."""

    def __init__(self, source, url=None, token=None):
        self.source, self.url, self.token = source, url, token
        self.enabled = url != "off"
        self.timeout_s = 5.0
        self.samples: list[dict] = []
        self.closed = False

    def sample(self, metric, value, ts=None, quality=None, meta=None, source=None):
        self.samples.append({"metric": metric, "value": value, "ts": ts,
                             "quality": quality, "meta": meta,
                             "source": source or self.source})
        return True

    def status(self):
        return {"enabled": self.enabled, "n": len(self.samples)}

    def close(self):
        self.closed = True


@pytest.fixture
def cfg() -> Config:
    c = Config()
    c.data_manager.url = "off"          # enabled check exercised separately
    return c


def _scores(drift: bool = False) -> WindowScore:
    return WindowScore(
        responsiveness=DimScore(score=72, confidence=0.8,
                                evidence=["she answered quickly"]),
        engagement=DimScore(score=60, confidence=0.6, evidence=["asked back"]),
        fluency=DimScore(score=80, confidence=0.9, evidence=["no fillers"]),
        coherence=DimScore(score=90, confidence=0.95, evidence=["on topic"]),
        drift_flag=drift, notes="fine")


def _sink(cfg: Config, monkeypatch, url="http://dm:8100"):
    made = {}

    def factory(source, url=None, token=None):
        made["client"] = FakeClient(source, url, token)
        return made["client"]

    monkeypatch.setattr("analyzer.dm_sink.DataManagerClient", factory)
    c = Config()
    c.data_manager.url = url
    c.data_manager.token = "tok"
    sink = DataManagerSink(c)
    sink.register = False               # registration tested separately
    return sink, made


def test_push_window_sends_five_samples(cfg, simple_window, monkeypatch):
    sink, made = _sink(cfg, monkeypatch)
    sink.push_window(simple_window, _scores())
    got = {s["metric"]: s for s in made["client"].samples}
    for d in ("responsiveness", "engagement", "fluency", "coherence"):
        assert f"speech.{d}_score" in got
        assert 0 <= got[f"speech.{d}_score"]["value"] <= 100
        assert got[f"speech.{d}_score"]["quality"] is not None
    assert got["speech.drift_flag"]["value"] == 0.0
    # one series per person
    assert got["speech.fluency_score"]["source"] == "transcription-analyzer/p001"


def test_push_window_privacy(cfg, simple_window, monkeypatch):
    """Evidence spans / transcript text must never reach the shared store."""
    sink, made = _sink(cfg, monkeypatch)
    sink.push_window(simple_window, _scores())
    blob = json.dumps(made["client"].samples)
    assert "she answered quickly" not in blob
    assert "fixed the fence" not in blob          # verbatim turn text
    meta = made["client"].samples[0]["meta"]
    assert meta["record_id"] == "test:0" and meta["seq"] == 0


def test_push_day_index(cfg, monkeypatch):
    sink, made = _sink(cfg, monkeypatch)
    sink.push_day({"day": "2026-11-14", "composite_z": -2.1,
                   "warning": "elevated", "baseline_days": 28}, "anna")
    s = made["client"].samples[0]
    assert s["metric"] == "speech.drift_index" and s["value"] == -2.1
    assert s["ts"] == "2026-11-14T12:00:00Z"
    assert s["source"] == "transcription-analyzer/anna"   # same series as windows
    sink.push_day({"day": "2026-11-14", "composite_z": None}, "anna")
    assert len(made["client"].samples) == 1       # insufficient baseline: skip


def test_disabled_is_noop(simple_window, monkeypatch):
    sink, made = _sink(Config(), monkeypatch, url="off")
    sink.push_window(simple_window, _scores())
    sink.push_day({"day": "1", "composite_z": -1.0}, "anna")
    assert made["client"].samples == []


def test_registration_posts_metrics(monkeypatch):
    posts = []

    class Resp:
        def read(self):
            return b'{"ok": true}'

        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

    def fake_urlopen(req, timeout=None):
        posts.append(json.loads(req.data.decode()))
        return Resp()

    monkeypatch.setattr(urllib.request, "urlopen", fake_urlopen)
    sink, made = _sink(Config(), monkeypatch)
    sink.register = True
    with sink:
        pass
    names = {p["name"] for p in posts}
    assert names == set(SPEECH_METRICS)
    assert posts[0]["kind"] == "sample"
    # nightly-batch metrics have no intra-day coverage: without this the
    # manager's /baseline (4 observed hours/day default) skips every day
    assert all(p["baseline_min_hours"] == 0 for p in posts)


def test_helpers():
    assert _source("transcription-analyzer", "p001") == "transcription-analyzer/p001"
    assert _day_ts("2026-11-14") == "2026-11-14T12:00:00Z"
    assert _day_ts("1").endswith("Z")
    assert _day_ts("1") != _day_ts("2")


def _win(**kw) -> Window:
    base = dict(record_id="r", persona_id="p", day="1", trajectory="t",
                seq=0, turns=[Turn(None, "target", "hi")])
    return Window(**{**base, **kw})


def test_sample_ts_distinct_per_window():
    """The manager dedupes on (metric, source, ts): same-day windows must
    not share a stamp or all but the last would be overwritten."""
    w0, w1 = _win(day="2026-11-14", seq=0), _win(day="2026-11-14", seq=1)
    assert _sample_ts(w0).startswith("2026-11-14T")
    assert _sample_ts(w1).startswith("2026-11-14T")
    assert _sample_ts(w0) != _sample_ts(w1)
    assert _sample_ts(w0) == _sample_ts(w0)


def test_sample_ts_prefers_real_conversation_end():
    """Hub captures carry t_iso — the real timestamp, not a synthetic noon."""
    w = _win(day="2026-11-14", ts_iso="2026-11-14T15:30:00.000Z")
    assert _sample_ts(w) == "2026-11-14T15:30:00Z"
    assert _sample_ts(_win(day="2026-11-14", ts_iso=w.ts_iso, seq=1)) \
        == "2026-11-14T15:30:01Z"


def test_sample_ts_synthetic_int_day():
    w0, w1 = _win(day="1", record_id="r0"), _win(day="1", record_id="r1")
    assert _sample_ts(w0).endswith("Z")
    assert _sample_ts(w0) != _sample_ts(w1)
