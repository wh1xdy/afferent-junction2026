import json
import math
from pathlib import Path

import pytest
from jsonschema import Draft202012Validator

ROOT = Path(__file__).resolve().parents[2]
CONTRACTS = ROOT / "contracts"
FIX = CONTRACTS / "fixtures"


def load(path):
    return json.loads(Path(path).read_text())


@pytest.fixture(scope="module")
def session_schema():
    schema = load(CONTRACTS / "session.v3.schema.json")
    Draft202012Validator.check_schema(schema)
    return Draft202012Validator(schema)


@pytest.fixture(scope="module")
def daily_schema():
    schema = load(CONTRACTS / "daily.v1.schema.json")
    Draft202012Validator.check_schema(schema)
    return Draft202012Validator(schema)


def errors(validator, doc):
    return [f"{e.json_path}: {e.message}" for e in validator.iter_errors(doc)]


def test_session_example_valid(session_schema):
    assert errors(session_schema, load(FIX / "session_example.json")) == []


def test_daily_example_valid(daily_schema):
    assert errors(daily_schema, load(FIX / "daily_example.json")) == []


def test_declined_minimal_valid(session_schema):
    doc = {"schema": "afferent.session/3", "session_id": "0b3c9c52-1111-4c3e-9a1e-2f1e8b0c9d22", "patient_id": "anna",
           "device_id": "inst-1", "started_iso": "2026-11-15T22:10:00+02:00", "local_hour": 22.17, "status": "declined",
           "profile": "live", "simulated": False, "sharing": "summary"}
    assert errors(session_schema, doc) == []
    assert errors(session_schema, {**doc, "status": "completed"})


def test_wrong_schema_version_rejected(session_schema):
    doc = load(FIX / "session_example.json")
    doc["schema"] = "afferent.session/2"
    assert errors(session_schema, doc)


def test_stored_core_needs_no_rest(session_schema):
    doc = load(FIX / "session_example.json")
    doc["core"] = {"source": "stored", "baseline_pulse_bpm": 66.0}
    assert errors(session_schema, doc) == []
    doc["core"] = {"source": "measured", "baseline_pulse_bpm": 66.0}
    assert errors(session_schema, doc)


def test_example_derived_numbers_consistent():
    s = load(FIX / "session_example.json")
    taps = sorted(t["rt_ms"] for t in s["core"]["rt"]["trials"] if t["rt_ms"] is not None and t["rt_ms"] >= 150)
    n = len(taps)
    med = (taps[n // 2 - 1] + taps[n // 2]) / 2 if n % 2 == 0 else taps[n // 2]
    assert s["core"]["rt"]["median_ms"] == math.floor(med + 0.5)
    tl = s["two_lanterns"]
    rc, ri, lc, li = tl["rich_correct"], tl["rich_incorrect"], tl["lean_correct"], tl["lean_incorrect"]
    assert rc + ri + lc + li == sum(1 for t in tl["trials"] if t["response"] is not None)
    log_b = 0.5 * math.log10(((rc + 0.5) * (li + 0.5)) / ((ri + 0.5) * (lc + 0.5)))
    assert abs(tl["log_b"] - log_b) < 0.001
    for t in s["tasks"]:
        d, p = t["intended_direction"], t["pulse"]
        if d == "none":
            assert t["helped"] is None
        else:
            want = p["delta_bpm"] <= -2 if d == "fall" else p["delta_bpm"] >= 2
            assert t["helped"] == want
    assert [t["id"] for t in s["tasks"] if t["kind"] == "measurement"] == ["fork", "lanterns"]
    assert {t["slot"] for t in s["tasks"] if t["id"] == "fork"} == {1}
    assert {t["slot"] for t in s["tasks"] if t["id"] == "lanterns"} == {3}


def test_analytics_fixture_shape():
    a = load(FIX / "analytics_anna.json")
    for key in ["schema", "patient_id", "now_day", "simulated", "params", "state", "state_label", "suggestion", "director",
                "features", "composite", "cusum", "bandit", "pre_post", "pre_post_summary", "completeness", "timeline"]:
        assert key in a, key
    n = a["now_day"] + 1
    assert len(a["timeline"]["days"]) == n
    for f in a["features"]:
        assert len(f["series"]["value"]) == n
    total = sum(c["contribution"] or 0 for c in a["composite"]["contributions"])
    assert abs(total - a["composite"]["value"]) < 0.01
    assert a["state"] in {"stable", "watch", "check_in", "booster"}
    for mode, w in a["bandit"]["weights"].items():
        assert abs(sum(w.values()) - 1) < 0.01, mode


def test_patients_list_sorted_by_need():
    rank = {"booster": 3, "check_in": 2, "watch": 1, "stable": 0}
    rows = load(FIX / "patients_list.json")["patients"]
    keys = [(-rank[r["state"]], -(r["composite"] or 0)) for r in rows]
    assert keys == sorted(keys)
    assert all(r["simulated"] for r in rows)


def test_no_em_dash_in_contracts():
    for path in list(CONTRACTS.rglob("*.json")) + list(CONTRACTS.rglob("*.md")):
        assert "\u2014" not in path.read_text(), path


# Sensor data in session.v3 (Decisions I53): source finger_ppg and the optional vitals blocks
# finger, breathing, hrv, camera_pulse and series.

VITALS_BLOCKS = ("finger", "breathing", "hrv", "camera_pulse", "series")
EMPTY_STAT = {"mean": None, "min": None, "max": None, "first": None, "last": None, "samples": 0}


def finger_doc():
    return load(FIX / "session_finger_example.json")


def with_vitals(block, change):
    doc = finger_doc()
    change(doc["vitals"][block])
    return doc


def test_session_finger_example_valid(session_schema):
    doc = finger_doc()
    assert errors(session_schema, doc) == []
    assert all(doc["vitals"][k] is not None for k in VITALS_BLOCKS)
    assert doc["session_id"] != load(FIX / "session_example.json")["session_id"]


def test_session_finger_example_is_labelled_simulated():
    doc = finger_doc()
    assert doc["simulated"] is True
    for block in ("finger", "breathing", "hrv"):
        assert doc["vitals"][block]["source"] == "simulated"
    for block in VITALS_BLOCKS:
        assert f"vitals.{block}" in doc["simulated_fields"], block


def test_session_example_has_no_sensor_blocks(session_schema):
    doc = load(FIX / "session_example.json")
    assert errors(session_schema, doc) == []
    assert set(doc["vitals"]) == {"pulse_mean_bpm", "pulse_min_bpm", "pulse_max_bpm", "pulse_source"}
    assert doc["simulated_fields"] == ["signal.pulse_source"]


@pytest.mark.parametrize("where", ["signal", "vitals"])
def test_pulse_source_finger_ppg(session_schema, where):
    doc = load(FIX / "session_example.json")
    for known in ("finger_ppg", "ky039", "rppg", "simulated", None):
        doc[where]["pulse_source"] = known
        assert errors(session_schema, doc) == [], known
    for unknown in ("finger", "vision", "unoq_http"):
        doc[where]["pulse_source"] = unknown
        assert errors(session_schema, doc), unknown


def test_vitals_sensor_blocks_optional_and_nullable(session_schema):
    doc = finger_doc()
    for block in VITALS_BLOCKS:
        doc["vitals"][block] = None
    assert errors(session_schema, doc) == []
    for block in VITALS_BLOCKS:
        del doc["vitals"][block]
    assert errors(session_schema, doc) == []
    for block in VITALS_BLOCKS:
        one = finger_doc()
        for other in VITALS_BLOCKS:
            if other != block:
                del one["vitals"][other]
        assert errors(session_schema, one) == [], block


@pytest.mark.parametrize("block", VITALS_BLOCKS)
def test_vitals_block_rejects_unknown_key(session_schema, block):
    assert errors(session_schema, with_vitals(block, lambda b: b.update(stress_level=3)))


@pytest.mark.parametrize("block,key", [
    ("finger", "source"), ("finger", "transport"), ("finger", "quality_reported"), ("finger", "seconds"),
    ("finger", "pulse_bpm"), ("finger", "quality"), ("finger", "finger_1_bpm"), ("finger", "finger_2_bpm"),
    ("finger", "fingers_abs_diff_bpm"), ("finger", "presence_s"),
    ("breathing", "source"), ("breathing", "method"), ("breathing", "rate_per_min"),
    ("hrv", "source"), ("hrv", "window_s"), ("hrv", "rmssd_ms"), ("hrv", "sdnn_ms"), ("hrv", "rmssd_vs_baseline"),
    ("camera_pulse", "source"), ("camera_pulse", "pulse_bpm"), ("camera_pulse", "trust_score"),
    ("camera_pulse", "trust_label_s"),
    ("series", "step_s"), ("series", "t_s"), ("series", "pulse_bpm"), ("series", "breathing_per_min"),
    ("series", "rmssd_ms"),
])
def test_vitals_block_rejects_missing_required_key(session_schema, block, key):
    assert errors(session_schema, with_vitals(block, lambda b: b.pop(key)))


@pytest.mark.parametrize("block,key,value", [
    ("finger", "transport", "usb"),
    ("finger", "source", "ky039"),
    ("finger", "source", "rppg"),
    ("finger", "quality_reported", None),
    ("finger", "seconds", -1),
    ("finger", "seconds", 12.5),
    ("finger", "fingers_abs_diff_bpm", "2.1"),
    ("finger", "presence_s", {"idle": 0, "probing": 6}),
    ("finger", "presence_s", {"idle": 0, "probing": 6, "active": 104, "in_bed": 1}),
    ("finger", "presence_s", {"idle": 0, "probing": 6, "active": -1}),
    ("breathing", "source", "ky039"),
    ("breathing", "method", "chest_band"),
    ("hrv", "source", "rppg"),
    ("hrv", "window_s", 30),
    ("hrv", "rmssd_ms", None),
    ("camera_pulse", "source", "finger_ppg"),
    ("camera_pulse", "source", "simulated"),
    ("camera_pulse", "trust_label_s", {"reliable": 61, "uncertain": 19}),
    ("camera_pulse", "trust_label_s", {"reliable": 61, "uncertain": 19, "unreliable": -8}),
    ("series", "step_s", 1),
    ("series", "t_s", [0, None]),
    ("series", "pulse_bpm", ["79"]),
    ("series", "rmssd_ms", [40.0] * 241),
])
def test_vitals_block_rejects_wrong_value(session_schema, block, key, value):
    assert errors(session_schema, with_vitals(block, lambda b: b.update({key: value})))


@pytest.mark.parametrize("block,key", [
    ("finger", "pulse_bpm"), ("finger", "quality"), ("finger", "finger_1_bpm"), ("finger", "finger_2_bpm"),
    ("breathing", "rate_per_min"), ("hrv", "rmssd_ms"), ("hrv", "sdnn_ms"), ("hrv", "rmssd_vs_baseline"),
    ("camera_pulse", "pulse_bpm"), ("camera_pulse", "trust_score"),
])
def test_stat_shape(session_schema, block, key):
    assert errors(session_schema, with_vitals(block, lambda b: b[key].pop("samples")))
    assert errors(session_schema, with_vitals(block, lambda b: b[key].pop("mean")))
    assert errors(session_schema, with_vitals(block, lambda b: b[key].update(median=70)))
    assert errors(session_schema, with_vitals(block, lambda b: b[key].update(samples=-1)))
    assert errors(session_schema, with_vitals(block, lambda b: b.update({key: dict(EMPTY_STAT)}))) == []


def test_finger_over_ble_without_quality_or_presence(session_schema):
    def ble(b):
        b.update(source="finger_ppg", transport="ble", quality_reported=False, presence_s=None,
                 quality=dict(EMPTY_STAT))

    assert errors(session_schema, with_vitals("finger", ble)) == []


def test_hrv_over_ble_has_no_sdnn_or_baseline(session_schema):
    doc = with_vitals("hrv", lambda b: b.update(source="finger_ppg", sdnn_ms=None, rmssd_vs_baseline=None))
    assert errors(session_schema, doc) == []


def test_finger_fixture_series_and_counts_consistent():
    v = finger_doc()["vitals"]
    s = v["series"]
    n = len(s["t_s"])
    assert n > 0
    for key in ("pulse_bpm", "breathing_per_min", "rmssd_ms"):
        assert len(s[key]) == n, key
    assert s["t_s"] == [i * s["step_s"] for i in range(n)]
    f = v["finger"]
    assert sum(f["presence_s"].values()) == f["seconds"]
    for key in ("pulse_bpm", "quality", "finger_1_bpm", "finger_2_bpm"):
        st = f[key]
        assert st["samples"] <= f["seconds"] and st["min"] <= st["mean"] <= st["max"], key
    pulse = [x for x in s["pulse_bpm"] if x is not None]
    assert min(pulse) >= f["pulse_bpm"]["min"] and max(pulse) <= f["pulse_bpm"]["max"]
    assert 0 <= f["quality"]["min"] and f["quality"]["max"] <= 1
    c = v["camera_pulse"]
    assert sum(c["trust_label_s"].values()) == c["trust_score"]["samples"]
    assert 0 <= c["trust_score"]["min"] and c["trust_score"]["max"] <= 100


def test_sensor_data_stays_out_of_daily_and_the_patient_view():
    daily = json.dumps(load(CONTRACTS / "daily.v1.schema.json")).lower()
    for word in ("rmssd", "sdnn", "hrv", "breathing", "finger_ppg"):
        assert word not in daily, word
    view = load(FIX / "patient_view_anna.json")
    text = json.dumps(view).lower()
    for word in ("rmssd", "sdnn", "hrv", "stress", "pulse_bpm"):
        assert word not in text, word
    stone = next(s for s in view["privacy"]["sensors"] if s["id"] == "pulse_stone")
    assert stone["label"] == "Pulse stone"
    assert stone["shares"] == "Pulse, breathing rate and beat-to-beat variation as numbers from the finger sensor."


# The breathing task's measured rate, tasks[].extra.breathing (Decisions I53): written only from real finger
# readings, so the block has no simulated source.

TASK_BREATHING = {
    "source": "finger_ppg", "method": "pulse_rhythm", "guide_per_min": 6, "seconds": 20,
    "rate_per_min": {"mean": 8.4, "min": 7, "max": 11, "first": 11, "last": 7, "samples": 16},
    "pulse_bpm": {"mean": 71.2, "min": 69, "max": 74, "first": 74, "last": 70, "samples": 20},
}


def with_task_breathing(change=None):
    doc = load(FIX / "session_example.json")
    task = next(t for t in doc["tasks"] if t["id"] == "breath")
    task["extra"] = {"breathing": json.loads(json.dumps(TASK_BREATHING))}
    if change:
        change(task["extra"]["breathing"])
    return doc


def test_task_breathing_valid_and_optional(session_schema):
    assert errors(session_schema, with_task_breathing()) == []
    assert errors(session_schema, with_task_breathing(lambda b: b.update(pulse_bpm=dict(EMPTY_STAT)))) == []
    doc = load(FIX / "session_example.json")
    assert all("breathing" not in (t.get("extra") or {}) for t in doc["tasks"])
    assert errors(session_schema, doc) == []


@pytest.mark.parametrize("key", sorted(TASK_BREATHING))
def test_task_breathing_rejects_missing_required_key(session_schema, key):
    assert errors(session_schema, with_task_breathing(lambda b: b.pop(key)))


@pytest.mark.parametrize("key,value", [
    ("source", "simulated"), ("source", "ky039"), ("source", "rppg"), ("source", None),
    ("method", "chest_band"), ("guide_per_min", 0), ("guide_per_min", None), ("seconds", -1), ("seconds", 20.5),
    ("rate_per_min", 8.4), ("rate_per_min", None), ("pulse_bpm", None),
])
def test_task_breathing_rejects_wrong_value(session_schema, key, value):
    assert errors(session_schema, with_task_breathing(lambda b: b.update({key: value})))


def test_task_breathing_rejects_unknown_key_and_loose_stat(session_schema):
    assert errors(session_schema, with_task_breathing(lambda b: b.update(stress_level=3)))
    assert errors(session_schema, with_task_breathing(lambda b: b.update(score=80)))
    assert errors(session_schema, with_task_breathing(lambda b: b["rate_per_min"].pop("samples")))
    assert errors(session_schema, with_task_breathing(lambda b: b["rate_per_min"].update(median=8)))
