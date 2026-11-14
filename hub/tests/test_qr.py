import copy
import datetime as dt
import io
import json
import random
import shutil
import subprocess
import uuid
import zipfile
from pathlib import Path

import pytest

from afferent_hub import qr
from afferent_hub.views import SAFETY_KEYS

ROOT = Path(__file__).resolve().parents[2]
FIXTURE = ROOT / "contracts" / "fixtures" / "qr_body_anna.json"
FINGER_SESSION = ROOT / "contracts" / "fixtures" / "session_finger_example.json"
FORBIDDEN = {"phq9", "phq9_9", "cssrs", "items", "item9", "display_name", "patient_id", "checkins", "name",
             "what_helped", "session_id", "checkin_id"}
TOP = {"v", "sim", "generated_iso", "period", "mornings", "state", "composite", "contrib", "cusum", "weekly",
       "baseline", "phq", "safety", "talk", "complete", "pauses", "sensors", "vitals", "face"}
SAFETY_FIELDS = {"day", "minute", "tier", "source", "screen", "c6_repeat"}
VITAL_KEYS = ["pulse_bpm", "breathing_per_min", "rmssd_ms"]
NO_VITALS = {"weekly": {k: [None] * 8 for k in VITAL_KEYS}, "days": {k: 0 for k in VITAL_KEYS},
             "simulated": {k: False for k in VITAL_KEYS}}
FACE_KEYS = ["smile_share", "blinks_per_min", "gaze_away_share"]
IN_THE_CODE = FACE_KEYS
NO_FACE = {"weekly": {k: [None] * 8 for k in FACE_KEYS}, "days": {k: 0 for k in FACE_KEYS},
           "simulated": {k: False for k in FACE_KEYS}}

def stat(mean, samples=60):
    if mean is None:
        return {"mean": None, "min": None, "max": None, "first": None, "last": None, "samples": 0}
    return {"mean": mean, "min": mean - 2, "max": mean + 2, "first": mean, "last": mean, "samples": samples}

def finger_session(day, pulse=70.0, breathing=12.0, rmssd=40.0, source="finger_ppg", quality=0.7,
                   quality_reported=True, samples=60, status="completed", simulated_fields=(), hour=7,
                   quality_min=None):
    q = stat(quality if quality_reported else None)
    if q["samples"]:
        q.update(min=quality if quality_min is None else quality_min, max=max(quality, 0.9))
    finger = {"source": source, "transport": "ble", "quality_reported": quality_reported, "seconds": 120,
              "pulse_bpm": stat(pulse, samples), "quality": q,
              "finger_1_bpm": stat(pulse), "finger_2_bpm": stat(pulse), "fingers_abs_diff_bpm": 1.0,
              "presence_s": None}
    vitals = {"pulse_mean_bpm": pulse, "pulse_min_bpm": pulse, "pulse_max_bpm": pulse, "pulse_source": source,
              "finger": finger,
              "breathing": None if breathing is None else
              {"source": source, "method": "pulse_rhythm", "rate_per_min": stat(breathing, samples)},
              "hrv": None if rmssd is None else
              {"source": source, "window_s": 60, "rmssd_ms": stat(rmssd, samples), "sdnn_ms": None,
               "rmssd_vs_baseline": None},
              "camera_pulse": None, "series": None}
    return {"session_id": str(uuid.uuid4()), "day_index": day, "status": status,
            "started_iso": f"2026-11-01T{hour:02d}:00:00+02:00", "simulated": bool(simulated_fields),
            "simulated_fields": list(simulated_fields), "vitals": vitals}

def face(smile=0.2, blinks=15.0, away=0.1, micro=2.5, breathing=13.0, tracked=120, breathing_s=60,
         source="arkit_truedepth"):
    return {"source": source, "seconds_tracked": tracked, "smile_share": smile, "movement": stat(0.012),
            "blinks_per_min": blinks, "gaze_away_share": away,
            "micro": None if micro is None else
            {"count": 5, "per_min": micro, "median_duration_ms": 180,
             "by_region": {"brow": 1, "eye": 1, "cheek": 1, "nose": 0, "mouth": 2, "jaw": 0}},
            "breathing_depth": None if breathing is None else
            {"rate_per_min": stat(breathing, breathing_s), "seconds": breathing_s}}

def face_session(day, status="completed", simulated_fields=(), hour=7, **kw):
    return {"session_id": str(uuid.uuid4()), "day_index": day, "status": status,
            "started_iso": f"2026-11-01T{hour:02d}:00:00+02:00", "simulated": bool(simulated_fields),
            "simulated_fields": list(simulated_fields),
            "vitals": {"pulse_mean_bpm": None, "pulse_min_bpm": None, "pulse_max_bpm": None, "pulse_source": None,
                       "finger": None, "breathing": None, "hrv": None, "camera_pulse": None, "series": None,
                       "face": face(**kw)}}

def carried(f):
    return {part: {k: f[part][k] for k in IN_THE_CODE} for part in ("weekly", "days", "simulated")}

def real_finger_doc(**change):
    doc = json.loads(FINGER_SESSION.read_text())
    doc["session_id"] = str(uuid.uuid4())
    doc["simulated"], doc["simulated_fields"] = False, []
    doc["signal"]["pulse_source"] = doc["vitals"]["pulse_source"] = "finger_ppg"
    for block in ("finger", "breathing", "hrv"):
        doc["vitals"][block]["source"] = "finger_ppg"
    doc["vitals"]["finger"]["transport"] = "ble"
    doc.update(change)
    return doc

def through_the_codec(body):
    if shutil.which("node") is None:
        pytest.skip("node is not installed")
    run = subprocess.run(["node", "demo/tests/qr_roundtrip.js"], cwd=ROOT, input=json.dumps(body),
                         capture_output=True, text=True, timeout=60)
    assert run.returncode == 0, run.stderr[-2000:]
    return json.loads(run.stdout)

def keys(obj, top=True):
    if isinstance(obj, dict):
        for k, v in obj.items():
            yield k, top
            yield from keys(v, False)
    elif isinstance(obj, list):
        for v in obj:
            yield from keys(v, False)

def assert_clean(body):
    for k, top in keys(body):
        assert k not in FORBIDDEN, k
        assert top or k not in SAFETY_KEYS, k
    for e in body["safety"]:
        assert set(e) == SAFETY_FIELDS

def iso_on(patient, day, hh=12, mm=0):
    d = dt.date.fromisoformat(patient["tms_end_date"]) + dt.timedelta(days=day)
    return f"{d.isoformat()}T{hh:02d}:{mm:02d}:00+02:00"

def band(total):
    return next(b for cut, b in ((5, "minimal"), (10, "mild"), (15, "moderate"), (20, "moderately_severe"), (28, "severe"))
                if total < cut)

def checkin(patient, day, total, tier="none", source="item9_fallback", screen="thank_you", status="completed",
            item9=0, c6=False, mm=0):
    items = {f"phq9_{i}": 1 for i in range(1, 9)} | {"phq9_9": item9}
    doc = {"schema": "afferent.checkin/1", "checkin_id": str(uuid.uuid4()), "patient_id": patient["id"],
           "device_id": "inst-1", "app_version": "0.3.0", "started_iso": iso_on(patient, day, 12, mm),
           "status": status, "trigger": "schedule", "early": False, "language": "en",
           "phq9": {"items": items, "total": total if status == "completed" else None,
                    "phq8_total": total - item9 if status == "completed" else None,
                    "band": band(total) if status == "completed" else None},
           "cssrs": {"asked": source == "cssrs", "reason": None, "items": {"c1": "yes"}, "tier": None, "c6_repeat": c6},
           "safety": {"tier": tier, "item9": item9, "source": source, "screen": screen, "shared": True}}
    if status == "completed":
        doc["completed_iso"] = iso_on(patient, day, 12, mm + 2)
    else:
        doc["stopped_iso"] = iso_on(patient, day, 12, mm + 2)
    return doc

def test_roster_bodies_have_the_shape(client):
    ids = [p["id"] for p in client.get("/api/patients").json()["patients"]]
    for pid in ids:
        r = client.get(f"/api/patients/{pid}/qr-body")
        assert r.status_code == 200, r.text
        b = r.json()
        assert set(b) - {"omitted"} == TOP
        assert b["v"] == 1 and b["sim"] is True
        p = b["period"]
        assert p["to_day"] - p["from_day"] == 55
        assert set(b["weekly"]) == {"composite", *qr.FEATURE_KEYS}
        assert all(len(row) == 8 for row in b["weekly"].values())
        assert set(b["baseline"]) == set(qr.FEATURE_KEYS)
        assert {c["key"] for c in b["contrib"]} <= set(qr.FEATURE_KEYS)
        assert [abs(c["contribution"]) for c in b["contrib"]] == sorted((abs(c["contribution"]) for c in b["contrib"]), reverse=True)
        assert b["state"]["shown"] in qr.STATES and b["state"]["cusum"] in qr.STATES
        assert set(b["sensors"]) == {"phone_camera", "pulse_stone", "bedside_camera", "bedside_light", "presence",
                                     "phone_presence", "phone_motion"}
        assert b["sensors"]["presence"] is False
        assert len(b["phq"]["history"]) <= qr.CAPS["phq"] and len(b["safety"]) <= qr.CAPS["safety"]
        assert len(b["talk"]) <= qr.CAPS["talk"]
        assert b["vitals"] == NO_VITALS
        assert b["face"] == NO_FACE
        assert_clean(b)
    assert client.get("/api/patients/nobody/qr-body").status_code == 404

def test_old_high_answer_and_todays_talk_request_travel(client):
    hub = client.app.state.hub
    p = hub.patient("anna")
    nd = client.get("/api/patients/anna").json()["patient"]["now_day"]
    old = checkin(p, nd - 140, 18, tier="high", source="cssrs", screen="crisis", item9=3, c6=True)
    assert client.post("/api/checkins", json=old).json()["safety_flag"] == "safety_high"
    hub.store.clear_flags("anna")
    hub.store.add_flag("anna", {"type": "talk_request", "t_iso": iso_on(p, nd, 7, 41), "source": "talk_button"})
    b = client.get("/api/patients/anna/qr-body").json()
    assert b["safety"] == [{"day": nd - 140, "minute": 722, "tier": "high", "source": "cssrs", "screen": "crisis",
                            "c6_repeat": True}]
    assert b["talk"] == [{"day": nd, "minute": 461}]
    assert_clean(b)
    text = json.dumps(b)
    assert '"yes"' not in text and "c1" not in text

def test_caps_and_omitted(client):
    hub = client.app.state.hub
    p = hub.patient("anna")
    nd = client.get("/api/patients/anna").json()["patient"]["now_day"]
    for i in range(11):
        doc = checkin(p, nd - 100 + 9 * i, 6 + i % 3, tier="low", item9=1, screen="support")
        assert client.post("/api/checkins", json=doc).status_code == 200
    client.post("/api/checkins", json=checkin(p, nd, 0, tier="not_answered", status="incomplete", screen=None))
    for i in range(13):
        hub.store.add_flag("anna", {"type": "talk_request", "t_iso": iso_on(p, nd - i, 8), "source": "talk_button"})
    b = client.get("/api/patients/anna/qr-body").json()
    assert len(b["safety"]) == 8 and b["safety"][0]["tier"] == "not_answered"
    assert [e["day"] for e in b["safety"]] == sorted((e["day"] for e in b["safety"]), reverse=True)
    assert len(b["phq"]["history"]) == 8 and b["phq"]["history"][-1]["day"] == nd - 10
    assert b["phq"]["baseline"] == 6 and b["phq"]["baseline_source"] == "app"
    assert b["phq"]["last_status"] == "stopped"
    assert len(b["talk"]) == 10 and b["talk"][0]["day"] == nd
    assert b["omitted"] == {"safety_entries": 4, "talk_requests": 3, "phq_totals": 3}
    assert_clean(b)

def test_phq_state_rules():
    assert qr.phq_state(None, [12]) is None
    assert qr.phq_state(6, []) is None
    assert qr.phq_state(6, [8]) == "stable"
    assert qr.phq_state(2, [7]) == "watch"
    assert qr.phq_state(6, [9, 10]) == "watch"
    assert qr.phq_state(4, [11]) == "check_in"
    assert qr.phq_state(12, [15]) == "check_in"
    assert qr.phq_state(4, [11, 12]) == "booster"
    assert qr.phq_state(18, [20]) == "booster"

def test_phq_raises_the_shown_state(client):
    hub = client.app.state.hub
    p = hub.patient("mikko")
    nd = client.get("/api/patients/mikko").json()["patient"]["now_day"]
    for day, total in ((0, 3), (nd - 14, 11), (nd, 12)):
        assert client.post("/api/checkins", json=checkin(p, day, total)).status_code == 200
    b = client.get("/api/patients/mikko/qr-body").json()
    assert b["state"]["phq_state"] == "booster" and b["state"]["shown"] == "booster"
    assert b["state"]["since_day"] == nd

def test_fixture_matches_the_live_shape(client):
    fx = json.loads(FIXTURE.read_text())
    live = client.get("/api/patients/anna/qr-body").json()
    assert set(fx) - {"omitted"} == set(live) - {"omitted"} == TOP
    for k in ("period", "mornings", "state", "composite", "cusum", "phq", "complete", "sensors", "weekly", "baseline"):
        assert set(fx[k]) == set(live[k]), k
    assert fx["sim"] is True and fx["safety"] and fx["talk"] and fx["phq"]["history"]
    assert fx["vitals"] == live["vitals"] == NO_VITALS
    assert fx["face"] == live["face"] == NO_FACE
    assert_clean(fx)
    fallback = ROOT / "demo" / "js" / "qr_body_fallback.json"
    assert json.loads(fallback.read_text()) == fx

def test_vitals_are_weekly_medians_of_the_recorded_sessions():
    sessions = [
        finger_session(1, 80.0, 15.0, 30.0),
        finger_session(36, 66.0, 11.0, 50.0), finger_session(37, 68.0, 11.6, None),
        finger_session(50, 70.0, 12.0, 40.0), finger_session(51, 74.0, 13.0, 44.0), finger_session(53, 71.0, 12.4, 41.0),
    ]
    v = qr.vitals_block(sessions, 56)
    assert v["weekly"] == {
        "pulse_bpm": [80.0, None, None, None, None, 67.0, None, 71.0],
        "breathing_per_min": [15.0, None, None, None, None, 11.3, None, 12.4],
        "rmssd_ms": [30.0, None, None, None, None, 50.0, None, 41.0],
    }
    assert v["days"] == {"pulse_bpm": 6, "breathing_per_min": 6, "rmssd_ms": 5}
    assert v["simulated"] == {k: False for k in VITAL_KEYS}
    assert list(v["weekly"]) == VITAL_KEYS == qr.VITAL_KEYS
    early = qr.vitals_block([finger_session(0, 61.0), finger_session(3, 63.0)], 3)
    assert early["weekly"]["pulse_bpm"] == [None] * 7 + [62.0]

def test_vitals_take_the_last_usable_session_of_a_day():
    two = [finger_session(50, 70.0, hour=7), finger_session(50, 76.0, hour=19)]
    assert qr.vitals_block(two, 56)["weekly"]["pulse_bpm"][7] == 76.0
    assert qr.vitals_block(list(reversed(two)), 56)["weekly"]["pulse_bpm"][7] == 76.0
    weak_later = [finger_session(50, 70.0, hour=7), finger_session(50, 76.0, hour=19, quality=0.1)]
    assert qr.vitals_block(weak_later, 56)["weekly"]["pulse_bpm"][7] == 70.0
    assert qr.vitals_block(two, 56)["days"]["pulse_bpm"] == 1

def test_a_week_without_usable_clip_data_has_no_value():
    unusable = [
        finger_session(50, quality=0.29), finger_session(51, quality_reported=False), finger_session(52, samples=9),
        finger_session(53, status="declined"), finger_session(54, source="ky039"), finger_session(55, source=None),
        finger_session(56, pulse=None, breathing=None, rmssd=None),
        finger_session(57), finger_session(0), finger_session(-1), finger_session(None),
        {"session_id": "a", "day_index": 49, "status": "completed"},
        {"session_id": "b", "day_index": 49, "status": "completed", "vitals": None},
        {"session_id": "c", "day_index": 49, "status": "completed", "vitals": {"pulse_mean_bpm": 70.0, "pulse_source": "rppg"}},
    ]
    no_finger = finger_session(48)
    no_finger["vitals"]["finger"] = None
    v = qr.vitals_block(unusable + [no_finger], 56)
    assert v == NO_VITALS
    assert all(x is None for row in v["weekly"].values() for x in row)
    edge = qr.vitals_block([finger_session(50, quality=0.3, samples=10)], 56)
    assert edge["weekly"]["pulse_bpm"] == [None] * 7 + [70.0] and edge["days"]["pulse_bpm"] == 1
    partial = qr.vitals_block([finger_session(50, rmssd=None)], 56)
    assert partial["weekly"]["rmssd_ms"] == [None] * 8 and partial["weekly"]["breathing_per_min"][7] == 12.0

def test_a_session_with_a_weak_stretch_carries_no_value():
    # 80 s at 62 bpm with quality 0.9, then 40 s at 170 bpm with quality 0.05, as a recorder that kept every reading
    # stored it: the mean quality passes 0.3, the mean pulse is not a measurement
    mixed = finger_session(50, pulse=98.0, breathing=18.0, rmssd=126.7, quality=0.62, quality_min=0.05)
    assert qr.session_vital(mixed, "finger", "pulse_bpm") is None
    assert qr.vitals_block([mixed], 56) == NO_VITALS
    kept = finger_session(50, pulse=62.0, quality=0.62, quality_min=0.3)
    assert qr.session_vital(kept, "finger", "pulse_bpm") == (62.0, False)
    assert qr.vitals_block([mixed, finger_session(51, pulse=62.0)], 56)["weekly"]["pulse_bpm"] == [None] * 7 + [62.0]
    unknown = finger_session(50)
    unknown["vitals"]["finger"]["quality"]["min"] = None
    assert qr.session_vital(unknown, "finger", "pulse_bpm") is None

def test_simulated_vitals_stay_marked_and_never_mix_with_measured():
    sim = [finger_session(50, 90.0, 20.0, 60.0, source="simulated"), finger_session(44, 92.0, 21.0, 61.0, source="simulated")]
    v = qr.vitals_block(sim, 56)
    assert v["simulated"] == {k: True for k in VITAL_KEYS}
    assert v["weekly"]["pulse_bpm"] == [None] * 6 + [92.0, 90.0]
    mixed = qr.vitals_block(sim + [finger_session(51, 70.0, 12.0, 40.0)], 56)
    assert mixed["simulated"] == {k: False for k in VITAL_KEYS}
    assert mixed["weekly"]["pulse_bpm"] == [None] * 7 + [70.0]
    assert mixed["days"] == {k: 1 for k in VITAL_KEYS}
    named = qr.vitals_block([finger_session(51, 70.0, 12.0, 40.0, simulated_fields=["vitals.hrv"])], 56)
    assert named["simulated"] == {"pulse_bpm": False, "breathing_per_min": False, "rmssd_ms": True}
    for fields in (["*"], ["vitals"], ["vitals.finger"]):
        marked = qr.vitals_block([finger_session(51, simulated_fields=fields)], 56)
        assert marked["simulated"] == {k: True for k in VITAL_KEYS}, fields
    other = qr.vitals_block([finger_session(51, simulated_fields=["core.rt", "signal.eyes_source"])], 56)
    assert other["simulated"] == {k: False for k in VITAL_KEYS}

def test_a_recorded_finger_session_reaches_the_code(client):
    before = client.get("/api/patients/anna/qr-body").json()
    assert before["vitals"] == NO_VITALS
    assert client.post("/api/sessions", json=real_finger_doc()).status_code == 200
    b = client.get("/api/patients/anna/qr-body").json()
    assert b["vitals"]["weekly"] == {"pulse_bpm": [None] * 7 + [73.9], "breathing_per_min": [None] * 7 + [10.9],
                                     "rmssd_ms": [None] * 7 + [41.4]}
    assert b["vitals"]["days"] == {k: 1 for k in VITAL_KEYS}
    assert b["vitals"]["simulated"] == {k: False for k in VITAL_KEYS}
    assert b["sim"] is True
    assert b["weekly"]["morning_pulse"] == before["weekly"]["morning_pulse"]
    assert b["baseline"]["morning_pulse"] == before["baseline"]["morning_pulse"]
    assert_clean(b)

def test_a_simulated_finger_session_marks_the_numbers_and_the_code(client):
    hub = client.app.state.hub
    hub.store.put_patient({**hub.patient("mikko"), "simulated": False})
    doc = json.loads(FINGER_SESSION.read_text())
    doc.update(session_id=str(uuid.uuid4()), patient_id="mikko")
    assert client.post("/api/sessions", json=doc).status_code == 200
    b = client.get("/api/patients/mikko/qr-body").json()
    assert b["vitals"]["simulated"] == {k: True for k in VITAL_KEYS}
    assert b["vitals"]["weekly"]["rmssd_ms"][7] == 41.4
    assert b["sim"] is True

def test_no_reported_quality_keeps_the_numbers_out_of_the_code(client):
    doc = real_finger_doc()
    doc["vitals"]["finger"].update(quality_reported=False, quality=stat(None))
    assert client.post("/api/sessions", json=doc).status_code == 200
    assert client.get("/api/patients/anna/qr-body").json()["vitals"] == NO_VITALS

def test_a_weak_stretch_keeps_the_numbers_out_of_the_code(client):
    doc = real_finger_doc()
    doc["vitals"]["finger"]["quality"].update(mean=0.62, min=0.05)
    assert client.post("/api/sessions", json=doc).status_code == 200
    assert client.get("/api/patients/anna/qr-body").json()["vitals"] == NO_VITALS

def test_the_hub_body_survives_the_phone_codec(client):
    assert client.post("/api/sessions", json=real_finger_doc()).status_code == 200
    body = client.get("/api/patients/anna/qr-body").json()
    out = through_the_codec(body)
    assert out["status"] == "ok" and out["verified"] is True and out["parts"] == 1
    assert out["body"]["vitals"] == body["vitals"]
    assert out["body"]["face"] == carried(NO_FACE)
    assert out["body"]["sim"] is True
    older = through_the_codec({k: v for k, v in body.items() if k not in ("vitals", "face")})
    assert older["status"] == "ok" and "vitals" not in older["body"] and "face" not in older["body"]
    assert set(out["body"]) - {"vitals", "face"} == set(older["body"])

def test_annas_code_holds_every_week_of_varied_finger_and_face_numbers_in_one_piece():
    # anna's own lists, every week of the finger and face numbers filled with varied values in their real range
    for seed in range(8):
        rnd = random.Random(seed)
        body = copy.deepcopy(json.loads(FIXTURE.read_text()))
        span = {"pulse_bpm": (45, 130), "breathing_per_min": (6, 30), "rmssd_ms": (5, 200)}
        body["vitals"] = {"weekly": {k: [round(rnd.uniform(*span[k]), 1) for _ in range(8)] for k in VITAL_KEYS},
                          "days": {k: rnd.randint(1, 56) for k in VITAL_KEYS}, "simulated": {k: True for k in VITAL_KEYS}}
        fspan = {"smile_share": (0, 1), "blinks_per_min": (0, 60), "gaze_away_share": (0, 1)}
        body["face"] = {"weekly": {k: [round(rnd.uniform(*fspan[k]), 3) for _ in range(8)] for k in FACE_KEYS},
                        "days": {k: rnd.randint(1, 56) for k in FACE_KEYS}, "simulated": {k: True for k in FACE_KEYS}}
        out = through_the_codec(body)
        assert out["status"] == "ok" and out["parts"] == 1 and out["shrink"] == 0 and out["face_left_out"] is False, seed
        assert out["chars"] <= out["cap"] and out["versions"][0] <= 22
        assert all(x is not None for row in out["body"]["vitals"]["weekly"].values() for x in row)
        assert list(out["body"]["face"]["weekly"]) == IN_THE_CODE
        assert all(x is not None for row in out["body"]["face"]["weekly"].values() for x in row)
        assert len(out["body"]["safety"]) == len(body["safety"])

def test_face_numbers_are_weekly_medians_of_the_recorded_sessions():
    sessions = [
        face_session(1, smile=0.3, blinks=20.0, away=0.2),
        face_session(36, smile=0.1, blinks=12.0, away=0.05),
        face_session(37, smile=0.0, blinks=14.0, away=0.0),
        face_session(50, smile=0.25, blinks=16.0, away=0.12), face_session(52, smile=0.21, blinks=18.0, away=0.08),
        face_session(53, smile=0.124, blinks=17.0, away=0.1),
    ]
    f = qr.face_block(sessions, 56)
    assert f["weekly"] == {
        "smile_share": [0.3, None, None, None, None, 0.05, None, 0.21],
        "blinks_per_min": [20.0, None, None, None, None, 13.0, None, 17.0],
        "gaze_away_share": [0.2, None, None, None, None, 0.025, None, 0.1],
    }
    assert f["days"] == {k: 6 for k in FACE_KEYS}
    assert f["simulated"] == {k: False for k in FACE_KEYS}
    assert list(f["weekly"]) == FACE_KEYS == qr.FACE_KEYS
    zero = qr.face_block([face_session(50, smile=0.0, blinks=0.0, away=0.0)], 56)
    assert [zero["weekly"][k][7] for k in FACE_KEYS] == [0.0, 0.0, 0.0]
    two = [face_session(50, smile=0.1, hour=7), face_session(50, smile=0.4, hour=19)]
    assert qr.face_block(two, 56)["weekly"]["smile_share"][7] == 0.4
    assert qr.face_block(list(reversed(two)), 56)["weekly"]["smile_share"][7] == 0.4
    assert qr.face_block(two, 56)["days"]["smile_share"] == 1

def test_a_week_without_face_data_has_no_value():
    unusable = [
        face_session(50, tracked=29), face_session(51, tracked=None), face_session(52, source="mediapipe"),
        face_session(53, status="declined"),
        face_session(54, smile=None, blinks=None, away=None, micro=None, breathing=None),
        face_session(55, smile=-0.1, blinks=-1.0, away=1.2, micro=float("nan"), breathing=float("inf")),
        face_session(56, smile=True, blinks="15", away=[0.1], micro=None, breathing=13.0, breathing_s=29),
        face_session(57), face_session(-1), face_session(None),
        {"session_id": "a", "day_index": 49, "status": "completed"},
        {"session_id": "b", "day_index": 49, "status": "completed", "vitals": None},
        {"session_id": "c", "day_index": 49, "status": "completed", "vitals": {"face": None}},
        {"session_id": "d", "day_index": 49, "status": "completed", "vitals": {"face": "x"}},
    ]
    assert qr.face_block(unusable, 56) == NO_FACE
    edge = qr.face_block([face_session(50, tracked=30, breathing_s=30)], 56)
    assert [edge["weekly"][k][7] for k in FACE_KEYS] == [0.2, 15.0, 0.1]
    partial = qr.face_block([face_session(50, blinks=None, micro=None, breathing=None)], 56)
    assert partial["weekly"]["blinks_per_min"] == [None] * 8 and partial["weekly"]["smile_share"][7] == 0.2
    assert partial["days"] == {"smile_share": 1, "blinks_per_min": 0, "gaze_away_share": 1}

def test_the_hub_serves_only_the_three_face_numbers_the_code_carries():
    f = qr.face_block([face_session(50, micro=4.4, breathing=13.3)], 56)
    assert qr.FACE_KEYS == FACE_KEYS
    for part in ("weekly", "days", "simulated"):
        assert list(f[part]) == FACE_KEYS, part
    assert "4.4" not in json.dumps(f) and "13.3" not in json.dumps(f)

def test_simulated_face_numbers_stay_marked_and_never_mix_with_measured():
    sim = [face_session(50, smile=0.5, source="simulated"), face_session(44, smile=0.6, source="simulated")]
    f = qr.face_block(sim, 56)
    assert f["simulated"] == {k: True for k in FACE_KEYS}
    assert f["weekly"]["smile_share"] == [None] * 6 + [0.6, 0.5]
    mixed = qr.face_block(sim + [face_session(51, smile=0.2)], 56)
    assert mixed["simulated"] == {k: False for k in FACE_KEYS}
    assert mixed["weekly"]["smile_share"] == [None] * 7 + [0.2] and mixed["days"]["smile_share"] == 1
    for fields in (["*"], ["vitals"], ["vitals.face"], ["vitals.face.smile_share"]):
        marked = qr.face_block([face_session(51, simulated_fields=fields)], 56)
        assert marked["simulated"] == {k: True for k in FACE_KEYS}, fields
    other = qr.face_block([face_session(51, simulated_fields=["vitals.finger", "core.rt"])], 56)
    assert other["simulated"] == {k: False for k in FACE_KEYS}

def test_a_recorded_face_session_reaches_the_code(client):
    before = client.get("/api/patients/anna/qr-body").json()
    assert before["face"] == NO_FACE
    doc = real_finger_doc()
    doc["vitals"]["face"] = face(smile=0.183, blinks=16.4, away=0.072, micro=2.6, breathing=12.8)
    assert client.post("/api/sessions", json=doc).status_code == 200
    b = client.get("/api/patients/anna/qr-body").json()
    assert b["face"]["weekly"] == {"smile_share": [None] * 7 + [0.183], "blinks_per_min": [None] * 7 + [16.4],
                                   "gaze_away_share": [None] * 7 + [0.072]}
    assert "micro" not in json.dumps(b) and "2.6" not in json.dumps(b["face"]) and "12.8" not in json.dumps(b["face"])
    assert b["face"]["days"] == {k: 1 for k in FACE_KEYS}
    assert b["face"]["simulated"] == {k: False for k in FACE_KEYS}
    assert b["vitals"]["weekly"]["pulse_bpm"] == [None] * 7 + [73.9]
    assert_clean(b)
    out = through_the_codec(b)
    assert out["status"] == "ok" and out["parts"] == 1 and out["face_left_out"] is False
    assert out["body"]["face"] == {"weekly": {"smile_share": [None] * 7 + [0.18], "blinks_per_min": [None] * 7 + [16],
                                              "gaze_away_share": [None] * 7 + [0.07]},
                                   "days": {k: 1 for k in IN_THE_CODE}, "simulated": {k: False for k in IN_THE_CODE}}
    assert "micro_per_min" not in json.dumps(out["body"])
    assert "breathing_per_min" not in json.dumps(out["body"]["face"])

def test_a_simulated_face_session_marks_the_numbers_and_the_code(client):
    hub = client.app.state.hub
    hub.store.put_patient({**hub.patient("mikko"), "simulated": False})
    doc = real_finger_doc(patient_id="mikko", simulated=True, simulated_fields=["vitals.face"])
    doc["vitals"]["face"] = face()
    assert client.post("/api/sessions", json=doc).status_code == 200
    b = client.get("/api/patients/mikko/qr-body").json()
    assert b["face"]["simulated"] == {k: True for k in FACE_KEYS}
    assert b["vitals"]["simulated"] == {k: False for k in VITAL_KEYS}
    assert b["sim"] is True
    out = through_the_codec(b)
    assert out["body"]["face"]["simulated"] == {k: True for k in IN_THE_CODE} and out["body"]["sim"] is True

def test_face_numbers_leave_the_hub_only_through_the_code(client):
    doc = real_finger_doc()
    doc["vitals"]["face"] = face(smile=0.43219, blinks=17.8931, away=0.05677, micro=3.21977, breathing=11.23377)
    assert client.post("/api/sessions", json=doc).status_code == 200
    stored = client.app.state.hub.store.session(doc["session_id"])
    assert stored["vitals"]["face"]["smile_share"] == 0.43219, "the patient's hub keeps the session document whole"
    face_values = ("0.43219", "17.8931", "0.05677", "3.21977", "11.23377")

    def clean(text, what):
        for v in face_values:
            assert v not in text, f"{what}: {v}"
        assert '"face"' not in text and "smile_share" not in text and "gaze_away_share" not in text, what

    detail = client.get("/api/patients/anna").json()
    assert detail["latest_session"]["session_id"] == doc["session_id"]
    assert "face" not in detail["latest_session"]["vitals"] and detail["latest_session"]["vitals"]["finger"]
    assert all("face" not in (s.get("vitals") or {}) for s in detail["sessions"])
    clean(json.dumps(detail), "patient detail")
    one = client.get(f"/api/sessions/{doc['session_id']}").json()
    assert "face" not in one["vitals"] and one["vitals"]["finger"]
    clean(json.dumps(one), "one session")
    z = zipfile.ZipFile(io.BytesIO(client.get("/api/patients/anna/export").content))
    for name in z.namelist():
        if name.endswith((".ndjson", ".csv", ".json", ".txt")) and "schema" not in name:
            clean(z.read(name).decode(), f"export {name}")
    assert any(doc["session_id"] in line for line in z.read("sessions.ndjson").decode().splitlines())
    for path in ("/api/patients", "/api/patients/anna/analytics", "/api/patients/anna/patient-view",
                 "/api/patients/anna/summary"):
        r = client.get(path)
        if r.status_code == 200:
            clean(r.text, path)
    body = client.get("/api/patients/anna/qr-body").json()
    assert body["face"]["weekly"]["smile_share"][7] == 0.432 and body["face"]["weekly"]["blinks_per_min"][7] == 17.9
