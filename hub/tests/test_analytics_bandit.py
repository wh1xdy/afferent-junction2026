import pytest

from afferent_hub.analytics import bandit

def task(mode, tid, helped, delta=-3.0, kind="adaptive", completed_by="touch"):
    return {"id": tid, "mode": mode, "kind": kind, "helped": helped, "completed_by": completed_by,
            "pulse": {"delta_bpm": delta, "quality": 0.9, "recovery_slope_bpm_per_min": -5.0},
            "head_pitch_delta_deg": 1.0, "eye_openness_mean": 0.6}

def session(day, tasks, status="completed", mood=3):
    return {"day_index": day, "started_iso": f"2026-10-{day + 1:02d}T07:00", "status": status, "tasks": tasks,
            "core": {"mood_start": mood}}

def test_counts_only_adaptive_with_outcome():
    s = [session(0, [task("calm", "breath", True), task("calm", "breath", False), task("calm", "loyly", None),
                     task("measure", "fork", None, kind="measurement"), task("flow", "threads", None)]),
         session(1, [task("calm", "breath", True)], status="declined")]
    c = bandit.counts(s)
    assert c[("calm", "breath")] == [1, 1] and c[("calm", "loyly")] == [0, 0]

def test_arms_shape_and_posterior():
    s = [session(d, [task("calm", "breath", True), task("calm", "loyly", d % 2 == 0)]) for d in range(10)]
    arms = {(a["mode"], a["task_id"]): a for a in bandit.arms(s)}
    assert len(arms) == sum(len(v) for v in bandit.MODE_ARMS.values())
    b = arms[("calm", "breath")]
    assert set(b) == {"mode", "task_id", "label", "alpha", "beta", "n", "helped", "mean", "ci90", "p_best"}
    assert (b["alpha"], b["beta"], b["n"], b["helped"]) == (11, 1, 10, 10)
    assert b["mean"] == pytest.approx(11 / 12, abs=1e-3)
    assert b["ci90"][0] < b["mean"] < b["ci90"][1]
    assert b["p_best"] > 0.5 and b["p_best"] == max(a["p_best"] for (m, _), a in arms.items() if m == "calm")
    assert arms[("rest", "breath")]["p_best"] == 1.0

def test_p_best_deterministic_and_sums_to_one():
    p1, _ = bandit.p_best_from_counts([3, 2, 5], [4, 4, 1])
    p2, _ = bandit.p_best_from_counts([3, 2, 5], [4, 4, 1])
    assert list(p1) == list(p2)
    assert sum(p1) == pytest.approx(1)
    assert p1.argmax() == 2

def test_weights_floor_and_normalise():
    s = [session(d, [task("calm", "breath", True), task("calm", "loyly", False)]) for d in range(15)]
    w = bandit.task_weights(s)
    assert set(w) == {"calm", "flow", "wake", "fatigue", "rest"}
    for mode, ws in w.items():
        assert sum(ws.values()) == pytest.approx(1, abs=0.01)
    assert w["calm"]["loyly"] == pytest.approx(0.05 / 1.05, abs=0.01)
    assert set(w["flow"]) == set(bandit.FLOW) and len(set(w["flow"].values())) == 1
    assert w["rest"] == {"breath": 1.0}

def test_empty_history_gives_uniformish_weights():
    w = bandit.task_weights([])
    assert w["calm"]["breath"] == pytest.approx(1 / len(bandit.MODE_ARMS["calm"]), abs=0.05)
    assert set(w["fatigue"]) == set(bandit.MODE_ARMS["fatigue"]) and {"shutters", "windows", "vihta"} <= set(w["fatigue"])
    assert set(w["wake"]) == set(bandit.MODE_ARMS["wake"]) and "stars" in w["calm"]
    assert sum(w["wake"].values()) == pytest.approx(1, abs=0.01)
    assert bandit.headline(bandit.arms([]))["task_id"] is None

def test_headline_and_by_mode():
    s = [session(d, [task("calm", "breath", d % 4 != 0), task("calm", "loyly", d % 3 == 0)]) for d in range(20)]
    arms = bandit.arms(s)
    h = bandit.headline(arms)
    assert h["task_id"] == "breath" and "15 of 20 calm runs" in h["text"]
    bm = bandit.by_mode(arms)
    assert bm["calm"]["best"] == "breath" and bm["calm"]["n"] == 40

def test_immediate_effect_medians():
    s = [session(d, [task("calm", "breath", True, delta=-4.0 - d)]) for d in range(5)]
    rows = {(r["mode"], r["task_id"]): r for r in bandit.immediate(s)}
    r = rows[("calm", "breath")]
    assert r["n"] == 5 and r["pulse_delta_median"] == -6.0 and r["pulse_delta_iqr"] == [-7.0, -5.0]

def test_next_day_association():
    main = []
    for d in range(20):
        tasks = [task("calm", "breath", True)] if d % 2 == 0 else [task("calm", "loyly", True)]
        main.append(session(d, tasks, mood=4 if d % 2 == 1 else 2))
    daily = {d: {"bedside_light": {"morning_light_min": 5 if d % 2 == 0 else 0}} for d in range(20)}
    comp = [0.1 * d for d in range(20)]
    rows = {r["id"]: r for r in bandit.next_day(main, daily, comp, 19)}
    assert rows["breath"]["next_mood_with"] == 4 and rows["breath"]["next_mood_without"] == 2
    assert rows["breath"]["mood_diff"] == 2 and rows["breath"]["note"] == "association, not causation"
    assert rows["dawn_light"]["kind"] == "stimulus" and rows["dawn_light"]["mood_diff"] == 2
    assert rows["breath"]["composite_diff"] == 0

def test_build_has_contract_keys():
    b = bandit.build([], [None] * 3, {}, [None] * 3, 2)
    assert set(b) >= {"outcome", "prior", "method", "arms", "by_mode", "weights", "next_day", "headline"}
    assert b["method"] == "thompson_beta_bernoulli"
