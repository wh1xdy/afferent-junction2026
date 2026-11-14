import datetime as dt
import json
import math
from pathlib import Path

import numpy as np
import pytest
from jsonschema import Draft202012Validator

from afferent_hub.analytics.stats import log_b, log_d
from afferent_hub.synthetic import GAME_RT, demo_roster, generate_patient

CONTRACTS = Path(__file__).resolve().parents[2] / "contracts"
TODAY = dt.date(2026, 11, 15)


@pytest.fixture(scope="module")
def validators():
    return (Draft202012Validator(json.loads((CONTRACTS / "session.v3.schema.json").read_text())),
            Draft202012Validator(json.loads((CONTRACTS / "daily.v1.schema.json").read_text())))


@pytest.fixture(scope="module")
def roster():
    return demo_roster(7, TODAY)


@pytest.fixture(scope="module")
def relapse():
    return generate_patient("relapse", 56, seed=3, start_date=dt.date(2026, 9, 1))


def test_roster_ids_and_days(roster):
    assert [p["patient"]["id"] for p in roster] == ["anna", "mikko", "juha", "leena", "sofia", "eero"]
    for p in roster:
        assert p["patient"]["simulated"] and p["patient"]["now_day"] == 56
        assert p["patient"]["tms_end_date"] == "2026-09-20"
        assert [r["day_index"] for r in p["daily"]] == list(range(56))
        assert p["daily"][-1]["date"] == "2026-11-14"


def test_all_documents_valid(roster, validators):
    sv, dv = validators
    for p in roster:
        for s in p["sessions"]:
            assert not list(sv.iter_errors(s)), s["session_id"]
        for r in p["daily"]:
            assert not list(dv.iter_errors(r)), (p["patient"]["id"], r["day_index"])


def test_everything_flagged_simulated(roster):
    for p in roster:
        assert all(s["simulated"] and s["simulated_fields"] == ["*"] and s["profile"] == "live" for s in p["sessions"])
        assert all(r["simulated"] and r["day_complete"] for r in p["daily"])
        assert p["truth"]["simulated"]


def test_session_ids_and_daily_links(roster):
    for p in roster:
        pid = p["patient"]["id"]
        by_day = {s["day_index"]: s for s in p["sessions"]}
        assert all(s["session_id"] == f"sim-{pid}-d{s['day_index']}" for s in p["sessions"])
        for r in p["daily"]:
            s = by_day.get(r["day_index"])
            assert r["missed"] == (not r["played"] and not r["declined"])
            assert r["played"] == (s is not None and s["status"] != "declined")
            assert r["declined"] == (s is not None and s["status"] == "declined")


def test_deterministic():
    a = generate_patient("stable", 20, seed=11, start_date=dt.date(2026, 1, 1))
    b = generate_patient("stable", 20, seed=11, start_date=dt.date(2026, 1, 1))
    c = generate_patient("stable", 20, seed=12, start_date=dt.date(2026, 1, 1))
    assert json.dumps(a) == json.dumps(b) and json.dumps(a) != json.dumps(c)


def test_default_start_date_ends_yesterday():
    p = generate_patient("stable", 5, seed=1)
    assert p["daily"][-1]["date"] == (dt.date.today() - dt.timedelta(days=1)).isoformat()


def test_derived_numbers_consistent(relapse):
    for s in relapse["sessions"]:
        if s["status"] == "declined":
            continue
        rt = s["core"]["rt"]
        taps = sorted(t["rt_ms"] for t in rt["trials"] if t["rt_ms"] is not None and t["rt_ms"] >= 150)
        if taps:
            assert rt["median_ms"] == math.floor(float(np.median(taps)) + 0.5)
        assert rt["valid"] == (len(rt["trials"]) == 5 and len(taps) >= 3)
        tl = s.get("two_lanterns")
        if tl:
            cells = (tl["rich_correct"], tl["rich_incorrect"], tl["lean_correct"], tl["lean_incorrect"])
            assert sum(cells) == sum(1 for t in tl["trials"] if t["response"] is not None)
            assert tl["log_b"] == round(log_b(*cells), 3) and tl["log_d"] == round(log_d(*cells), 3)
            assert tl["rewards_rich"] <= 3 and tl["rewards_lean"] <= 1
        for t in s["tasks"]:
            d = t["intended_direction"]
            if d == "none" or t["helped"] is None:
                continue
            delta = t["pulse"]["delta_bpm"]
            assert t["helped"] == (delta <= -2 if d == "fall" else delta >= 2)
        assert {t["slot"] for t in s["tasks"] if t["id"] == "fork"} <= {1}
        assert {t["slot"] for t in s["tasks"] if t["id"] == "lanterns"} <= {3}


def test_relapse_ramp_and_truth(relapse):
    sev = relapse["truth"]["severity"]
    assert sev[27] == 0 and sev[28] == 0 and sev[49] == 1 and 0 < sev[38] < 1
    assert relapse["truth"]["best_arm"]["calm"] == "breath"
    rates = relapse["truth"]["arm_rates"]
    assert rates["calm/breath"] - rates["calm/loyly"] >= 0.2 - 1e-9


def test_relapse_moves_the_signals():
    early, late = {"rt": [], "mood": [], "miss": [], "pulse": []}, {"rt": [], "mood": [], "miss": [], "pulse": []}
    for seed in range(8):
        p = generate_patient("relapse", 56, seed=seed, start_date=dt.date(2026, 9, 1))
        for s in p["sessions"]:
            if s["status"] == "declined":
                continue
            bucket = early if s["day_index"] < 28 else late if s["day_index"] >= 45 else None
            if bucket is None:
                continue
            if s["core"]["rt"]["median_ms"]:
                bucket["rt"].append(s["core"]["rt"]["median_ms"])
            if s["core"]["mood_start"]:
                bucket["mood"].append(s["core"]["mood_start"])
        for r in p["daily"]:
            bucket = early if r["day_index"] < 28 else late if r["day_index"] >= 45 else None
            if bucket is not None:
                bucket["miss"].append(r["missed"])
                if r["morning_pulse_bpm"]:
                    bucket["pulse"].append(r["morning_pulse_bpm"])
    assert np.mean(late["rt"]) > np.mean(early["rt"]) + 40
    assert np.mean(late["mood"]) < np.mean(early["mood"]) - 1
    assert np.mean(late["miss"]) > np.mean(early["miss"]) + 0.1
    assert np.mean(late["pulse"]) > np.mean(early["pulse"]) + 3


def test_realistic_missingness(roster):
    daily = [r for p in roster for r in p["daily"]]
    missed = np.mean([r["missed"] for p in roster if p["patient"]["kind"] == "stable" for r in p["daily"]])
    assert 0.05 < missed < 0.25
    mp_missing = np.mean([r["morning_pulse_bpm"] is None for r in daily])
    assert 0.15 < mp_missing < 0.45
    assert any(r["sleep"]["presence_hourly"] is None for r in daily)
    assert any(s["status"] == "declined" for p in roster for s in p["sessions"])


def test_weekend_sleep_later(roster):
    wk, we = [], []
    for p in roster:
        for r in p["daily"]:
            if r["sleep"]["wake_time_h"] is not None and p["patient"]["kind"] == "stable":
                (we if r["weekday"] >= 5 else wk).append(r["sleep"]["wake_time_h"])
    assert np.mean(we) > np.mean(wk) + 0.5


def test_physiological_ranges(roster):
    for p in roster:
        for r in p["daily"]:
            if r["morning_pulse_bpm"] is not None:
                assert 40 < r["morning_pulse_bpm"] < 110
            if r["sleep"]["time_in_bed_h"] is not None:
                assert 3 < r["sleep"]["time_in_bed_h"] < 16
        for s in p["sessions"]:
            if s["status"] != "declined" and s["core"]["rest"]["pulse_bpm"] is not None:
                assert 40 < s["core"]["rest"]["pulse_bpm"] < 130


def test_night_patient_skips_measurements_in_rest_mode(roster):
    leena = next(p for p in roster if p["patient"]["id"] == "leena")
    clocks = [s["clock"] for s in leena["sessions"] if s["status"] != "declined"]
    assert clocks.count("night") / len(clocks) > 0.7
    skipped = [t for s in leena["sessions"] for t in s.get("tasks") or [] if t.get("skip_reason") == "rest_mode"]
    assert skipped and all(t["id"] in ("fork", "lanterns") for t in skipped)


def test_bandit_closed_loop_prefers_breath():
    p = generate_patient("stable", 56, seed=5, start_date=dt.date(2026, 9, 1))
    calm = [(s["day_index"], t["id"]) for s in p["sessions"] if s["status"] != "declined"
            for t in s["tasks"] if t["kind"] == "adaptive" and t["mode"] == "calm"]
    late = [tid for d, tid in calm if d >= 28]
    assert late.count("breath") / len(late) > 0.6


def test_game_rt_extra(roster):
    tasks = [t for p in roster for s in p["sessions"] for t in s.get("tasks") or []]
    for t in tasks:
        extra = t.get("extra") or {}
        if t["kind"] != "adaptive" or not t["completed"]:
            assert not extra
            continue
        assert ("dda" in extra) == (t["mode"] != "rest")
        if "dda" in extra:
            assert extra["dda"]["d_start"] <= extra["dda"]["d_mean"] == t["intensity"] <= extra["dda"]["d_max"]
        assert ("rt" in extra) == (t["id"] not in ("breath", "loyly"))
        rt = extra.get("rt")
        if rt and rt["median_ms"] is not None:
            assert 150 <= rt["median_ms"] <= 2500 and rt["n"] >= 1
            assert sum(k["n"] for k in rt["by_kind"].values()) == rt["n"]


def test_game_rt_slows_mildly_in_relapse(roster):
    anna = next(p for p in roster if p["patient"]["id"] == "anna")
    base = {k: v[1] for k, v in GAME_RT.items()}

    def mean_ratio(lo, hi):
        return np.mean([t["extra"]["rt"]["median_ms"] / base[t["id"]] for s in anna["sessions"]
                        if s["status"] != "declined" and lo <= s["day_index"] < hi for t in s["tasks"]
                        if (t.get("extra") or {}).get("rt", {}).get("median_ms")])

    assert 1.03 < mean_ratio(45, 56) / mean_ratio(0, 28) < 1.3
