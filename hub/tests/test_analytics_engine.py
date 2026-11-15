import copy
import datetime as dt
import json
from pathlib import Path

import pytest

from afferent_hub.analytics import engine, stats
from afferent_hub.synthetic import demo_roster

FIX = Path(__file__).resolve().parents[2] / "contracts" / "fixtures"
TODAY = dt.date(2026, 11, 15)

@pytest.fixture(scope="module")
def roster():
    return {p["patient"]["id"]: p for p in demo_roster(7, TODAY)}

@pytest.fixture(scope="module")
def anna(roster):
    p = roster["anna"]
    return engine.analyze_patient(p["sessions"], p["daily"], 56)

@pytest.fixture(scope="module")
def fixture():
    return json.loads((FIX / "analytics_anna.json").read_text())

def keys_cover(got, want, path="$"):
    if isinstance(want, dict):
        assert isinstance(got, dict), path
        missing = set(want) - set(got)
        assert not missing, f"{path}: missing {missing}"
        for k in want:
            if want[k] is not None and got[k] is not None:
                keys_cover(got[k], want[k], f"{path}.{k}")
    elif isinstance(want, list) and want and isinstance(want[0], dict):
        assert isinstance(got, list) and got, path
        keys_cover(got[0], want[0], f"{path}[0]")

def test_shape_matches_fixture(anna, fixture):
    keys_cover(anna, fixture)
    assert set(anna) == set(fixture) | {"secondary_features"}
    assert anna["schema"] == "afferent.analytics/1"
    assert [f["key"] for f in anna["features"]] == [f["key"] for f in fixture["features"]]

def test_contract_invariants(anna):
    n = anna["now_day"] + 1
    assert len(anna["timeline"]["days"]) == n
    for key, series in anna["timeline"].items():
        if key != "live_days":
            assert len(series) == n, key
    for f in anna["features"]:
        assert all(len(v) == n for v in f["series"].values())
    total = sum(c["contribution"] or 0 for c in anna["composite"]["contributions"])
    assert abs(total - anna["composite"]["value"]) < 0.01
    for mode, w in anna["bandit"]["weights"].items():
        assert abs(sum(w.values()) - 1) < 0.01, mode
    shares = [c["share"] for c in anna["composite"]["contributions"] if c["share"] is not None]
    assert sum(shares) == pytest.approx(1, abs=0.01)

def test_anna_story(anna):
    assert anna["state"] == "booster"
    assert anna["state_label"] == "Consider discussing a booster session"
    assert 36 <= anna["cusum"]["first_check_in_day"] <= 46
    assert anna["cusum"]["first_watch_day"] >= 30
    assert anna["composite"]["confidence"] == "high"
    assert anna["bandit"]["headline"]["task_id"] == "breath"
    assert anna["suggestion"]["text"].endswith("The clinician decides.")
    assert len(anna["suggestion"]["reasons"]) == 3
    assert anna["simulated"] is True and anna["date"] == "2026-11-15"

def test_roster_states(roster):
    states = {pid: engine.analyze_patient(p["sessions"], p["daily"], 56)["state"] for pid, p in roster.items()}
    assert states["anna"] == "booster"
    assert states["juha"] == "check_in"
    assert all(states[p] == "stable" for p in ("mikko", "leena", "sofia", "eero"))

def test_empty_input_does_not_raise():
    a = engine.analyze_patient([], [], 0)
    assert a["state"] == "stable" and a["composite"]["value"] is None
    assert a["composite"]["confidence"] == "low"
    a = engine.analyze_patient([], [], 10)
    assert len(a["timeline"]["days"]) == 11 and a["director"]["baseline_pulse_bpm"] == 68.0

def test_deterministic(roster):
    p = roster["mikko"]
    a = engine.analyze_patient(p["sessions"], p["daily"], 56)
    b = engine.analyze_patient(list(reversed(p["sessions"])), list(reversed(p["daily"])), 56)
    assert json.dumps(a, sort_keys=True) == json.dumps(b, sort_keys=True)

def test_causal_day_by_day_equals_full_run(roster):
    p = roster["anna"]
    full = engine.score(p["sessions"], p["daily"], 55)
    for d in (14, 30, 40, 45, 55):
        part = engine.score(p["sessions"], p["daily"], d)
        assert part["states"][d] == full["states"][d]
        assert part["composite"][d] == pytest.approx(full["composite"][d])

def test_live_session_lands_on_today(roster):
    p = roster["anna"]
    live = json.loads((FIX / "session_example.json").read_text())
    live["day_index"] = 56
    a = engine.analyze_patient(p["sessions"] + [live], p["daily"], 56)
    assert a["timeline"]["live_days"] == [56]
    assert a["features"][0]["latest"]["day"] == 56 and a["features"][0]["latest"]["value"] == 437
    assert a["pre_post"][-1]["session_id"] == live["session_id"]
    assert a["timeline"]["played"][56] is True

def test_repeated_live_runs_overwrite_today(roster):
    p = roster["anna"]
    first = json.loads((FIX / "session_example.json").read_text())
    first["day_index"] = 56
    second = copy.deepcopy(first)
    second["session_id"] = "second-run-xyz"
    second["started_iso"] = "2026-11-15T08:30:00+02:00"
    second["core"]["mood_start"] = 4
    a = engine.analyze_patient(p["sessions"] + [first, second], p["daily"], 56)
    assert a["features"][1]["series"]["value"][56] == 4

def test_director_baseline():
    def s(day, bpm, q=0.9):
        return {"day_index": day, "status": "completed", "started_iso": f"d{day:02d}",
                "core": {"rest": {"pulse_bpm": bpm, "pulse_quality": q, "eye_openness": 0.6, "head_pitch_deg": -8,
                                  "blink_rate_per_min": 15}}}
    first = [s(d, 60 + d) for d in range(5)]
    assert engine.director(first, 10)["baseline_pulse_bpm"] == 62.0
    many = [s(d, 60) for d in range(10)] + [s(d, 70) for d in range(30, 40)]
    assert engine.director(many, 40)["baseline_pulse_bpm"] == 70.0
    assert engine.director([s(0, 90, q=0.2)], 1)["baseline_pulse_bpm"] == 68.0
    assert engine.director(first, 10)["rest_baseline"] == {"eye_openness": 0.6, "head_pitch_deg": -8.0,
                                                           "blink_rate_per_min": 15.0}

def test_pre_post_summary(anna):
    assert 1 <= len(anna["pre_post"]) <= 7
    days = [r["day"] for r in anna["pre_post"]]
    assert days == sorted(days)
    s = anna["pre_post_summary"]
    assert s["n"] == len(anna["pre_post"]) and 0 <= s["settled_share"] <= 1

def test_completeness_and_confidence(anna):
    c = anna["completeness"]
    assert 0 <= c["overall"] <= 1 and c["days_7d"] == 6
    assert set(c["by_feature"]) == {f["key"] for f in anna["features"]}

def test_cusum_history_lists_changes_only(anna):
    h = anna["cusum"]["history"]
    assert h[0]["day"] == 0 and h[0]["state"] == "stable"
    assert all(a["state"] != b["state"] for a, b in zip(h, h[1:]))
    assert anna["cusum"]["since_day"] == h[-1]["day"]

def test_stale_feature_drops_out():
    sessions = [{"day_index": d, "status": "completed", "started_iso": f"d{d:02d}", "local_hour": 8,
                 "core": {"mood_start": 3, "rt": {"valid": True, "median_ms": 400}}, "tasks": []} for d in range(15)]
    a = engine.analyze_patient(sessions, [], 25)
    rt = a["features"][0]
    assert rt["latest"]["day"] == 14 and rt["latest"]["stale"] is True and rt["latest"]["ewma_z"] is None
    assert a["composite"]["value"] is None

def test_forbidden_claims_absent(anna):
    text = json.dumps(anna).lower()
    for phrase in ("treats", "prevents relapse", "diagnos", "detects emotion", "hrv", "clinically validated", "\u2014"):
        assert phrase not in text

def test_cusum_does_not_move_without_data(roster):
    for p in roster.values():
        last = max(max(s["day_index"] for s in p["sessions"]), max(r["day_index"] for r in p["daily"]))
        a = engine.score(p["sessions"], p["daily"], last)
        b = engine.score(p["sessions"], p["daily"], last + 3)
        assert b["cusum"][last + 3] == a["cusum"][last]
        assert b["states"][last + 3] == a["states"][last]

# Expressiveness: lower than the patient's own first weeks raises the index, a little; no face numbers add nothing.

def face_sessions(days, smile, movement=0.03, face_from=0, face_until=None):
    """One plain session a day (reaction time about 400 ms, mood 3), with vitals.face from face_from on."""
    out = []
    for d in range(days):
        s = {"day_index": d, "status": "completed", "started_iso": f"2026-10-{1 + d:02d}T08:00:00+02:00",
             "core": {"mood_start": 3, "rt": {"valid": True, "median_ms": 400 + (d % 3) * 10}}, "tasks": [],
             "vitals": {"pulse_source": "simulated"}}
        if face_from <= d < (face_until if face_until is not None else days):
            sm = smile(d) if callable(smile) else smile
            s["vitals"]["face"] = {"source": "arkit_truedepth", "seconds_tracked": 90, "smile_share": sm,
                                   "movement": {"mean": movement * (1 + 0.05 * (d % 2)), "min": 0.01, "max": 0.09,
                                                "first": 0.02, "last": 0.02, "samples": 90},
                                   "blinks_per_min": 14.0, "gaze_away_share": 0.1, "micro": None, "breathing_depth": None}
        out.append(s)
    return out

def expr(a):
    return next(f for f in a["features"] if f["key"] == "expressiveness")

def contribution(a, key="expressiveness"):
    return next(c for c in a["composite"]["contributions"] if c["key"] == key)

def test_expressiveness_below_own_baseline_raises_the_index():
    usual = lambda d: 0.2 + 0.01 * (d % 3)
    flat = engine.analyze_patient(face_sessions(30, usual), [], 29)
    fewer = engine.analyze_patient(face_sessions(30, lambda d: usual(d) if d < 20 else 0.08), [], 29)
    more = engine.analyze_patient(face_sessions(30, lambda d: usual(d) if d < 20 else 0.35), [], 29)
    e = expr(fewer)
    assert e["baseline"]["ready"] and e["baseline"]["median"] == pytest.approx(1.0, abs=0.05)
    assert e["latest"]["value"] < 0.8 and e["latest"]["z"] < 0 and e["latest"]["ewma_z"] > 0, "low is worse: signed z up"
    assert contribution(fewer)["contribution"] > 0 > contribution(more)["contribution"]
    assert fewer["composite"]["value"] > flat["composite"]["value"] > more["composite"]["value"]
    # modest: at most its weight 0.5 times the clipped z, over the weight with data (reaction time, mood, itself)
    assert contribution(fewer)["contribution"] <= 0.5 * engine.PARAMS["z_clip"] / (1.5 + 1.5 + 0.5) + 1e-9
    assert contribution(fewer)["weight"] == 0.5 and fewer["composite"]["weights"]["expressiveness"] == 0.5

def test_no_face_numbers_add_nothing_and_do_not_count_as_low():
    a = engine.analyze_patient(face_sessions(30, 0.2, face_from=99), [], 29)
    e = expr(a)
    assert all(v is None for v in e["series"]["value"]) and e["latest"]["contribution"] is None
    assert contribution(a)["contribution"] is None and contribution(a)["share"] is None
    assert "Expressiveness" not in a["suggestion"]["reasons"]
    # the index is exactly what the other drivers make of it
    others = [c for c in a["composite"]["contributions"] if c["contribution"] is not None]
    assert {c["key"] for c in others} == {"rt_median", "mood"}
    assert a["composite"]["value"] == pytest.approx(sum(c["contribution"] for c in others), abs=1e-3)
    # completeness (here reaction time and mood of the 8.5 weight of the other drivers): a patient without the TrueDepth
    # camera is not counted as missing it
    assert a["completeness"]["overall"] == pytest.approx(3.0 / 8.5, abs=0.005)
    assert engine.analyze_patient(face_sessions(30, 0.2), [], 29)["completeness"]["overall"] == \
        pytest.approx(3.5 / 9.0, abs=0.005)

def test_face_numbers_that_stop_drop_out_and_then_count_as_missing():
    a = engine.analyze_patient(face_sessions(30, 0.2, face_until=20), [], 29)
    e = expr(a)
    assert e["latest"]["day"] == 19 and e["latest"]["stale"] is True and e["latest"]["ewma_z"] is None
    assert contribution(a)["contribution"] is None
    # once a patient has had face numbers, days without them are missing data, and completeness says so
    assert a["completeness"]["overall"] == pytest.approx(3.0 / 9.0, abs=0.005)
    # the camera switched on later: it counts from its first value on, not before
    late = engine.score(face_sessions(30, 0.2, face_from=10), [], 29)
    assert late["completeness"][9] == pytest.approx(3.0 / 8.5) and late["completeness"][29] == pytest.approx(3.5 / 9.0)

def test_roster_expressiveness_story(roster):
    # Anna's smiling and facial movement fall a little with her relapse; the stable patients' stay near their own level
    weekly = {}
    for pid, p in roster.items():
        v = expr(engine.analyze_patient(p["sessions"], p["daily"], 56))["series"]["value"]
        weekly[pid] = (stats.median(v[0:7]), stats.median(v[49:56]))
    first, last = weekly["anna"]
    assert first == pytest.approx(1.0, abs=0.08) and 0.6 < last < 0.85
    for pid in ("mikko", "leena", "sofia", "eero"):
        assert weekly[pid][1] == pytest.approx(1.0, abs=0.15), pid
