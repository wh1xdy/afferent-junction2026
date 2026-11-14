import copy
import csv
import io
import json
from pathlib import Path

import pytest
from jsonschema import Draft202012Validator

from afferent_hub import export
from afferent_hub.analytics import engine, game_rt
from afferent_hub.analytics.features import FEATURES

CONTRACTS = Path(__file__).resolve().parents[2] / "contracts"
FIX = CONTRACTS / "fixtures"
PARAMS = engine.PARAMS


def task(tid, kinds=None, median=None, n=None, d=None, **rt):
    extra = {"rt": {"n": n, "median_ms": median, "iqr_ms": None, "lapses": 0, "anticipations": 0,
                    "by_kind": kinds, **rt}}
    if d is not None:
        extra["dda"] = {"v": 1, "d_mean": d}
    return {"id": tid, "extra": extra}


def session(day, *tasks):
    return {"day_index": day, "status": "completed", "started_iso": f"2026-11-{1 + day:02d}T08:00", "tasks": list(tasks)}


def main_series(sessions, now_day):
    by_day = {s["day_index"]: s for s in sessions}
    return [by_day.get(d) for d in range(now_day + 1)]


def block(blocks, key):
    return next(b for b in blocks if b["key"] == key)


def test_secondary_specs_stay_out_of_composite():
    assert [f["key"] for f in game_rt.SECONDARY] == ["game_rt_norm", "game_rt_median"]
    assert all(f["evidence"] == "exploratory" and f["weight"] == 0 and f["in_composite"] is False
               for f in game_rt.SECONDARY)
    assert not {f["key"] for f in game_rt.SECONDARY} & {f["key"] for f in FEATURES}
    assert sum(f["weight"] for f in FEATURES) == pytest.approx(8.5)


def test_cells_prefer_kinds_and_fall_back_to_task():
    t = task("fireflies", {"catch": {"n": 5, "median_ms": 420}, "tap_target": {"n": 2, "median_ms": 300}},
             median=410, n=7)
    assert game_rt.task_cells(t) == [("fireflies:catch", 420.0, 5.0)]
    t = task("bells", {"beat": {"n": 1, "median_ms": 300}}, median=350, n=4)
    assert game_rt.task_cells(t) == [("bells:all", 350.0, 4.0)]
    assert game_rt.task_cells(task("stars", None, median=None, n=None)) == []
    assert game_rt.task_cells({"id": "breath", "extra": {}}) == []
    assert game_rt.task_cells(task("beacon", None, median=500, n=True)) == []


def test_normalisation_removes_task_difficulty_offsets():
    now = 27
    sessions = []
    for d in range(now + 1):
        slow = 60 if d >= 21 else 0
        jitter = (d % 3 - 1) * 10
        a = task("fireflies", {"catch": {"n": 6, "median_ms": 350 + jitter + slow}}, median=350 + jitter + slow, n=6)
        b = task("threads", {"choice": {"n": 4, "median_ms": 900 + jitter + slow}}, median=900 + jitter + slow, n=4)
        sessions.append(session(d, a, b) if d % 2 else session(d, a))
    blocks = game_rt.blocks(main_series(sessions, now), now, PARAMS)
    norm, raw = block(blocks, "game_rt_norm"), block(blocks, "game_rt_median")
    before = [v for v in norm["series"]["value"][:21] if v is not None]
    after = [v for v in norm["series"]["value"][21:] if v is not None]
    assert max(abs(v) for v in before) <= 1.0
    assert min(after) >= 2.0
    raw_before = [v for v in raw["series"]["value"][:21] if v is not None]
    assert max(raw_before) - min(raw_before) > 200
    assert norm["baseline"]["ready"] and norm["latest"]["day"] == now
    assert {c["cell"] for c in norm["cells"]} == {"fireflies:catch", "threads:choice"}
    assert norm["series"]["n_cells"][1] == 2 and norm["series"]["n_cells"][2] == 1


def test_difficulty_covariate_adjusts_harder_days():
    now = 20
    sessions = []
    for d in range(now + 1):
        diff = 0.2 + 0.05 * (d % 7)
        sessions.append(session(d, task("beacon", {"tap_target": {"n": 8, "median_ms": 300 + 400 * diff}},
                                        median=300 + 400 * diff, n=8, d=diff)))
    norm = block(game_rt.blocks(main_series(sessions, now), now, PARAMS), "game_rt_norm")
    cell = norm["cells"][0]
    assert cell["difficulty_slope_ms"] == pytest.approx(400, abs=1)
    assert all(v == pytest.approx(0, abs=0.01) for v in norm["series"]["value"])
    raw = block(game_rt.blocks(main_series(sessions, now), now, PARAMS), "game_rt_median")
    assert raw["series"]["dda_d_mean"][0] == pytest.approx(0.2)


def test_no_covariate_without_spread():
    now = 14
    sessions = [session(d, task("beacon", None, median=400 + (d % 2) * 30, n=5, d=0.5)) for d in range(now + 1)]
    norm = block(game_rt.blocks(main_series(sessions, now), now, PARAMS), "game_rt_norm")
    assert norm["cells"][0]["difficulty_slope_ms"] is None
    assert norm["cells"][0]["cell"] == "beacon:all"


def test_nulls_and_missing_rt_give_empty_series():
    now = 9
    sessions = [session(d, task("bells", {"beat": {"n": None, "median_ms": None}}, median=None, n=None))
                for d in range(now + 1)] + [session(3, {"id": "breath"})]
    blocks = game_rt.blocks(main_series(sessions, now), now, PARAMS)
    for b in blocks:
        assert len(b["series"]["value"]) == now + 1
        assert all(v is None for v in b["series"]["value"])
        assert b["latest"]["value"] is None and b["baseline"]["n"] == 0
    assert game_rt.blocks([None] * 3, 2, PARAMS)[0]["cells"] == []


def test_engine_composite_ignores_game_rt():
    s = json.loads((FIX / "session_example.json").read_text())
    sessions = []
    for d in range(20):
        a = copy.deepcopy(s)
        a["day_index"], a["started_iso"] = d, f"2026-11-{1 + d:02d}T08:00:00+02:00"
        sessions.append(a)
    plain = engine.analyze_patient(sessions, [], 19)
    for d, a in enumerate(sessions):
        a["tasks"][0].setdefault("extra", {})["rt"] = {"n": 6, "median_ms": 400 + 40 * d, "iqr_ms": 50, "lapses": 0,
                                                       "anticipations": 0, "by_kind": {"tap_target": {"n": 6, "median_ms": 400 + 40 * d}}}
    with_rt = engine.analyze_patient(sessions, [], 19)
    assert with_rt["composite"] == plain["composite"] and with_rt["cusum"] == plain["cusum"]
    assert [f["key"] for f in with_rt["features"]] == [f["key"] for f in FEATURES]
    norm = block(with_rt["secondary_features"], "game_rt_norm")
    assert norm["latest"]["value"] > 2 and norm["in_composite"] is False
    assert all(len(v) == 20 for b in with_rt["secondary_features"] for k, v in b["series"].items())


def test_export_rows_and_codebook():
    now = 3
    sessions = [session(d, task("fireflies", None, median=400, n=5, d=0.4)) for d in range(now + 1)]
    analytics = {"timeline": {"days": list(range(now + 1)), "dates": [None] * (now + 1)}, "features": [],
                 "secondary_features": game_rt.blocks(main_series(sessions, now), now, PARAMS)}
    rows = export.feature_rows(analytics, [], sessions)
    assert rows[0]["game_rt_median.value"] == 400 and rows[0]["game_rt_median.dda_d_mean"] == 0.4
    cols = list(dict.fromkeys(c for r in rows for c in r))
    assert {"game_rt_norm.value", "game_rt_norm.ewma", "game_rt_norm.n_cells", "game_rt_median.n_trials"} <= set(cols)
    book = {r["column"]: r for r in csv.DictReader(io.StringIO(export.codebook([], cols, [])))
            if r["file"] == "features.csv"}
    assert all(c in book and book[c]["description"] for c in cols)
    assert "Exploratory, not in the composite" in book["game_rt_norm.value"]["description"]
    assert book["game_rt_median.value"]["unit"] == "ms"


@pytest.fixture(scope="module")
def validator():
    schema = json.loads((CONTRACTS / "session.v3.schema.json").read_text())
    Draft202012Validator.check_schema(schema)
    return Draft202012Validator(schema)


def with_rt(rt):
    doc = json.loads((FIX / "session_example.json").read_text())
    doc["tasks"][0].setdefault("extra", {})["rt"] = rt
    return doc


def test_schema_accepts_extra_rt(validator):
    full = {"n": 6, "median_ms": 412.5, "iqr_ms": 80, "lapses": 1, "anticipations": 0,
            "by_kind": {"catch": {"n": 4, "median_ms": 430}, "tap_target": {"n": 2, "median_ms": None}}}
    assert list(validator.iter_errors(with_rt(full))) == []
    nulls = {"n": None, "median_ms": None, "iqr_ms": None, "lapses": None, "anticipations": None, "by_kind": None}
    assert list(validator.iter_errors(with_rt(nulls))) == []
    assert list(validator.iter_errors(with_rt(None))) == []
    assert list(validator.iter_errors(with_rt({"n": 3, "future_key": "x"}))) == []
    assert list(validator.iter_errors(json.loads((FIX / "session_example.json").read_text()))) == []


@pytest.mark.parametrize("bad", [{"n": -1}, {"n": 2.5}, {"median_ms": "400"}, {"lapses": -2},
                                 {"by_kind": {"catch": {"median_ms": -5}}}, {"by_kind": {"beat": 3}}, {"by_kind": []}])
def test_schema_rejects_malformed_extra_rt(validator, bad):
    assert list(validator.iter_errors(with_rt(bad)))
