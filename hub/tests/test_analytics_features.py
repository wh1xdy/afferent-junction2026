import copy
import json
from pathlib import Path

import pytest

from afferent_hub.analytics import features as F
from afferent_hub.analytics.stats import log_b

FIX = Path(__file__).resolve().parents[2] / "contracts" / "fixtures"


@pytest.fixture
def session():
    s = json.loads((FIX / "session_example.json").read_text())
    s["day_index"] = 3
    return s


@pytest.fixture
def daily():
    return json.loads((FIX / "daily_example.json").read_text())


def test_feature_set_matches_contract():
    keys = [f["key"] for f in F.FEATURES]
    assert keys == ["rt_median", "mood", "sleep_regularity", "missed_sessions", "effort_hard_prop", "morning_pulse",
                    "home_only_days", "upright_frac", "reward_bias"]
    assert sum(f["weight"] for f in F.FEATURES) == pytest.approx(8.5)
    assert all(f["floor"] > 0 and f["evidence"] in {"established", "plausible", "exploratory"} for f in F.FEATURES)


def test_day_session_takes_last_played(session):
    a, b, c = copy.deepcopy(session), copy.deepcopy(session), copy.deepcopy(session)
    a["started_iso"], b["started_iso"], c["started_iso"] = "2026-11-15T07:00", "2026-11-15T08:00", "2026-11-15T09:00"
    c["status"] = "declined"
    by_day = F.index_sessions([c, b, a], 10)
    assert F.day_session(by_day[3]) is b


def test_rt_valid_and_upright(session):
    assert F.rt_valid(session)
    ups = sum(t["upright_s"] for t in session["tasks"])
    dur = sum(t["duration_ms"] for t in session["tasks"]) / 1000
    assert F.upright_frac(session) == pytest.approx(ups / dur)
    session["core"]["rt"]["valid"] = False
    assert not F.rt_valid(session)
    assert F.upright_frac({"tasks": []}) is None


def test_morning_pulse_prefers_daily_then_morning_session(daily, session):
    assert F.morning_pulse_value(daily, session) == 70.2
    daily["morning_pulse_bpm"] = None
    assert F.morning_pulse_value(daily, session) == 79.4
    session["local_hour"] = 21.0
    assert F.morning_pulse_value(daily, session) is None
    session["local_hour"] = 7.0
    session["core"]["rest"]["pulse_quality"] = 0.3
    assert F.morning_pulse_value(daily, session) is None


def test_window_count_scales_and_needs_four_days():
    flags = [True, False, None, False, True, False, False, False]
    assert F.window_count(flags, 3) is None
    assert F.window_count(flags, 4) == pytest.approx(7 * 2 / 4)
    assert F.window_count(flags, 7) == pytest.approx(7 * 1 / 6)


def test_missed_flag_rules():
    assert F.missed_flag(None) is None
    assert F.missed_flag({"played": True, "missed": False}) is False
    assert F.missed_flag({"declined": True, "missed": False}) is False
    assert F.missed_flag({"day_complete": False, "played": False, "declined": False, "missed": False}) is None
    assert F.missed_flag({"day_complete": True, "played": False, "declined": False, "missed": True}) is True


def test_extract_series_lengths_and_values(session, daily):
    daily["day_index"] = 3
    ex = F.extract([session], [daily], 5)
    assert all(len(v) == 6 for v in ex["values"].values())
    assert ex["values"]["rt_median"][3] == 437
    assert ex["values"]["mood"][3] == 2
    assert ex["values"]["morning_pulse"][3] == 70.2
    assert ex["values"]["effort_hard_prop"][3] is None
    assert ex["values"]["sleep_regularity"][3] is None


def test_pooled_features_over_last_seven_sessions(session):
    sessions = []
    for d in range(9):
        s = copy.deepcopy(session)
        s["day_index"] = d
        s["fork"]["hard_prop"] = 1.0 if d < 2 else 0.0
        sessions.append(s)
    ex = F.extract(sessions, [], 8)
    assert ex["values"]["effort_hard_prop"][1] is None
    assert ex["values"]["effort_hard_prop"][2] == pytest.approx(2 / 3)
    assert ex["values"]["effort_hard_prop"][8] == 0.0
    tl = session["two_lanterns"]
    cells = [tl["rich_correct"], tl["rich_incorrect"], tl["lean_correct"], tl["lean_incorrect"]]
    assert ex["values"]["reward_bias"][8] == pytest.approx(log_b(*[7 * c for c in cells]))


def test_invalid_lanterns_excluded(session):
    session["two_lanterns"]["valid"] = False
    assert F.lantern_cells(session) is None
    session["two_lanterns"] = None
    assert F.lantern_cells(session) is None


def test_sleep_regularity_needs_four_nights(daily):
    recs = []
    for d in range(6):
        r = copy.deepcopy(daily)
        r["day_index"] = d
        recs.append(r)
    ex = F.extract([], recs, 5)
    assert ex["values"]["sleep_regularity"][2] is None
    assert ex["values"]["sleep_regularity"][3] == pytest.approx(1.0)


def test_reward_slope():
    def s(h2, h3):
        return {"fork": {"hard_by_reward": {"2": h2, "3": h3}}}
    assert F.reward_slope([s(0, 1), s(0, 1)]) == 1
    assert F.reward_slope([s(1, 1), s(0, 1), s(None, 0)]) == pytest.approx(2 / 3 - 0.5)
    assert F.reward_slope([s(0, 1)]) is None


def test_context_series(session, daily):
    recs = []
    for d in range(5):
        r = copy.deepcopy(daily)
        r["day_index"] = d
        r["sleep"]["sleep_midpoint_h"] = 4 + d * 0.5
        recs.append(r)
    ex = F.extract([session], recs, 4)
    ctx = F.context_series(ex, 4)
    assert ctx["sleep_midpoint_sd_7d"][2] is None and ctx["sleep_midpoint_sd_7d"][3] > 0
    assert ctx["time_in_bed_h"][0] == 9.8
    assert len(ctx["effort_reward_slope"]) == 5
