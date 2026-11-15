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
                    "home_only_days", "upright_frac", "reward_bias", "expressiveness"]
    assert sum(f["weight"] for f in F.FEATURES) == pytest.approx(9.0)
    assert all(f["floor"] > 0 and f["evidence"] in {"established", "plausible", "exploratory"} for f in F.FEATURES)
    ex = F.FEATURES[-1]
    assert (ex["label"], ex["worse"], ex["weight"], ex["evidence"], ex["optional"]) == \
        ("Expressiveness", "low", 0.5, "exploratory", True)
    assert [f["key"] for f in F.FEATURES if f.get("optional")] == ["expressiveness"]
    assert ex["weight"] == min(f["weight"] for f in F.FEATURES), "weighted no more than the other exploratory drivers"


# Expressiveness: smiling and facial movement from vitals.face, against the patient's own first weeks.

def face(smile=0.15, movement=0.03, seconds=96, source="arkit_truedepth"):
    return {"source": source, "seconds_tracked": seconds, "smile_share": smile,
            "movement": None if movement is None else {"mean": movement, "min": movement / 3, "max": movement * 3,
                                                       "first": movement, "last": movement, "samples": seconds},
            "blinks_per_min": 14.0, "gaze_away_share": 0.08, "micro": None, "breathing_depth": None}

def with_face(session, day, **kw):
    s = copy.deepcopy(session)
    s["day_index"] = day
    s["session_id"] = f"s{day}"
    s["vitals"]["face"] = face(**kw)
    return s

def test_face_parts_reads_only_usable_face_numbers(session):
    assert F.face_parts(session) is None, "no face block: no value"
    assert F.face_parts(with_face(session, 3)) == (0.15, 0.03)
    assert F.face_parts(with_face(session, 3, smile=None)) == (None, 0.03)
    assert F.face_parts(with_face(session, 3, movement=None)) == (0.15, None)
    assert F.face_parts(with_face(session, 3, smile=1.5)) == (None, 0.03), "an impossible share is dropped, not clipped"
    for kw in ({"smile": None, "movement": None}, {"seconds": 29}, {"source": "mediapipe"}, {"smile": 1.5, "movement": None},
               {"smile": -0.1, "movement": None}, {"smile": float("nan"), "movement": None}, {"smile": True, "movement": None},
               {"smile": None, "movement": -0.01}):
        assert F.face_parts(with_face(session, 3, **kw)) is None, kw
    s = with_face(session, 3)
    s["vitals"]["face"] = None
    assert F.face_parts(s) is None
    s["vitals"] = None
    assert F.face_parts(s) is None
    assert F.face_parts(None) is None

def test_expressiveness_is_the_mean_of_both_parts_against_the_own_first_weeks():
    # 14 baseline days at smile 0.2 and movement 0.04, then a day at 0.1 and 0.04: half the smiling, the same movement
    parts = [(0.2, 0.04)] * 14 + [(0.1, 0.04), (0.2, 0.02), None, (None, 0.03), (0.3, None)]
    v = F.expressiveness(parts, len(parts) - 1)
    assert v[:14] == [pytest.approx(1.0)] * 14
    assert v[14] == pytest.approx((0.5 + 1.0) / 2)
    assert v[15] == pytest.approx((1.0 + 0.5) / 2)
    assert v[16] is None, "a day without face numbers is missing, not low"
    assert v[17] == pytest.approx(0.75), "one part alone"
    assert v[18] == pytest.approx(1.5)

def test_expressiveness_own_level_from_the_baseline_window_only():
    # the own level is the median of days 0 to 13; a later drop does not move it
    parts = [(0.2, 0.04)] * 14 + [(0.05, 0.01)] * 20
    v = F.expressiveness(parts, len(parts) - 1)
    assert v[-1] == pytest.approx((0.25 + 0.25) / 2)
    # with face numbers only from day 10 on, the window grows until 7 values (as the index's baseline)
    late = [None] * 10 + [(0.2, 0.04)] * 7 + [(0.1, 0.02)] * 5
    assert F.expressiveness(late, len(late) - 1)[-1] == pytest.approx(0.5)
    # never past now_day: on day 12 the level is the three days seen so far
    assert F.expressiveness(late, 12)[12] == pytest.approx(1.0)
    # under 3 values there is no own level yet, so no value
    assert F.expressiveness([(0.2, 0.04), (0.1, 0.02)], 1) == [None, None]

def test_expressiveness_floors_a_tiny_own_level():
    # a patient who hardly smiled in the first weeks: a later smile is measured against 0.02, not against 0.001
    parts = [(0.001, 0.03)] * 14 + [(0.04, 0.03)]
    assert F.expressiveness(parts, 14)[14] == pytest.approx((0.04 / 0.02 + 1.0) / 2)

def test_extract_expressiveness_from_the_days_sessions(session):
    sessions = [with_face(session, d, smile=0.2, movement=0.04) for d in range(14)]
    sessions.append(with_face(session, 14, smile=0.1, movement=0.03))
    later = with_face(session, 14, smile=None, movement=None, seconds=10)   # a later session of day 14 without numbers
    later["started_iso"] = "2026-11-15T23:00:00+02:00"
    no_face = copy.deepcopy(session)
    no_face["day_index"] = 15
    ex = F.extract(sessions + [later, no_face], [], 15)
    v = ex["values"]["expressiveness"]
    assert v[13] == pytest.approx(1.0)
    assert v[14] == pytest.approx((0.5 + 0.75) / 2), "the day's last session with face numbers"
    assert v[15] is None
    assert F.extract([no_face], [], 15)["values"]["expressiveness"] == [None] * 16

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

def test_morning_pulse_uses_bedside_reading_only(daily, session):
    assert F.morning_pulse_value(daily) == 70.2
    daily["morning_pulse_quality"] = 0.3
    assert F.morning_pulse_value(daily) is None
    daily["morning_pulse_bpm"] = None
    daily["morning_pulse_quality"] = None
    assert F.morning_pulse_value(daily) is None

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
