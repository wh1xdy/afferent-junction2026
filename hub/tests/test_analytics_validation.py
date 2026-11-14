import datetime as dt
import json
from pathlib import Path

import pytest

from afferent_hub.analytics import validate, validation

ROOT = Path(__file__).resolve().parents[2]
FIX = ROOT / "contracts" / "fixtures"


@pytest.fixture(scope="module")
def small():
    return validation.run_validation(4, today=dt.date(2026, 11, 15), include_curves=True)


def test_shape_covers_fixture(small):
    want = json.loads((FIX / "validation_example.json").read_text())
    for key in want:
        assert key in small, key
    for block in ("relapse", "stable", "bandit"):
        assert set(want[block]) <= set(small[block]), block
    assert set(want["example"]) <= set(small["example"])
    assert small["simulated"] is True and small["untuned"] is True
    assert "not clinically validated" in small["disclaimer"]


def test_numbers_are_sane(small):
    rel, st = small["relapse"], small["stable"]
    assert 0 <= rel["detected_share"] <= 1
    assert st["patient_days"] == 4 * 42
    assert st["false_alarms_per_patient_month"] >= 0
    assert len(rel["per_seed_days_onset_to_check_in"]) == 4
    assert small["bandit"]["true_best"] == {"mode": "calm", "task_id": "breath"}
    assert any(row["current"] for row in small["sensitivity"])


def test_helpers():
    states = ["stable"] * 14 + ["watch", "check_in", "check_in", "stable", "check_in"]
    assert validation.first_at_least(states, "check_in") == 15
    assert validation.first_at_least(states, "booster") is None
    assert validation.episodes(states, "check_in") == 2
    assert validation.episodes(states, "watch") == 2
    s = validation.summary([1, 2, 3, None])
    assert s == {"median": 2.0, "iqr": [1.5, 2.5], "n": 3}
    assert validation.summary([None])["median"] is None


def test_example_series_for_dashboard(small):
    anna = small["example"]["anna"]
    assert len(anna["days"]) == len(anna["composite"]) == len(anna["cusum"]) == 57
    assert anna["onset_day"] == 28
    bp = small["example"]["bandit_p_best"]
    assert len(bp["sessions"]) == len(bp["breath"]) > 10


def test_report_and_charts_render(small, tmp_path, monkeypatch):
    monkeypatch.setattr(validate, "DOCS", tmp_path)
    names = validate.write_charts(small)
    assert len(names) == 6
    for n in names:
        svg = (tmp_path / n).read_text()
        assert svg.startswith("<svg") and "SIMULATED" in svg and "\u2014" not in svg
    text = validate.report(small)
    assert "SIMULATED" in text and "not clinically validated" in text.lower() and "\u2014" not in text


def test_committed_results_file():
    path = validate.RESULTS
    if not path.exists():
        pytest.skip("run python -m afferent_hub.analytics.validate first")
    r = json.loads(path.read_text())
    assert r["schema"] == "afferent.validation/1" and r["simulated"] and r["n_seeds"] >= 50
    assert (ROOT / "Validation.md").exists()
