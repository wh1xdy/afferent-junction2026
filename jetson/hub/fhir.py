"""FHIR R4 export: a file the patient downloads and can hand to a clinic, whose record system can
import it. The hub sends it to no one.

GET /fhir?days=14 -> a FHIR Bundle (type "collection") with:
  Patient       pseudonymous (no name/identifier is stored on the hub)
  Device        the finger PulseSensor clip on the Arduino UNO Q
  Observation   one per day and measure (daily aggregates, method text says how; effectivePeriod is
                the 24 hours the value was computed over, see Store.daily):
                resting heart rate  LOINC 40443-4   /min
                respiratory rate    LOINC 9279-1    /min
                HRV RMSSD           no LOINC code exists for RMSSD; a local code + text is used
  Observation   PHQ-9 per check-in: total LOINC 44261-6 (valueInteger, severity band as
                interpretation text), the nine items as components (LOINC 44250-9 ... 44260-8)

Codes for vital signs carry the "vital-signs" category. Not validated against the official HL7
validator (offline hackathon environment) - checked structurally in tests/test_hub.py.

A summary marked "simulated" (the ?demo=1 patient) gives a bundle in which every resource carries
the HL7 security label HTEST (test health data), so it cannot pass as a real person's record.
"""
import html
import uuid
from datetime import datetime, timedelta, timezone

LOINC = "http://loinc.org"
UCUM = "http://unitsofmeasure.org"
LOCAL = "urn:afferent:codes"
CAT = "http://terminology.hl7.org/CodeSystem/observation-category"
TEST_DATA = {"security": [{"system": "http://terminology.hl7.org/CodeSystem/v3-ActReason", "code": "HTEST",
                           "display": "test health data"}]}

# PHQ-9 items, in questionnaire order
PHQ9_ITEMS = [("44250-9", "Little interest or pleasure in doing things"),
              ("44255-8", "Feeling down, depressed, or hopeless"),
              ("44259-0", "Trouble falling or staying asleep, or sleeping too much"),
              ("44254-1", "Feeling tired or having little energy"),
              ("44251-7", "Poor appetite or overeating"),
              ("44258-2", "Feeling bad about yourself"),
              ("44252-5", "Trouble concentrating on things"),
              ("44253-3", "Moving or speaking slowly, or being fidgety or restless"),
              ("44260-8", "Thoughts that you would be better off dead or of hurting yourself")]

DAILY = {
    "finger_bpm": {"system": LOINC, "code": "40443-4", "display": "Heart rate --resting", "unit": "/min",
                   "category": "vital-signs",
                   "method": "10th percentile of finger-PulseSensor heart rate that day (resting proxy)"},
    "breathing": {"system": LOINC, "code": "9279-1", "display": "Respiratory rate", "unit": "/min",
                  "category": "vital-signs",
                  "method": "median breathing rate that day, from respiratory sinus arrhythmia in beat intervals"},
    "hrv_rmssd": {"system": LOCAL, "code": "hrv-rmssd", "display": "Heart rate variability, RMSSD", "unit": "ms",
                  "category": "vital-signs",
                  "method": "median of 60-s RMSSD windows that day (finger PulseSensor, sub-sample beat timing)"},
}


def _ref(resource):
    return f"urn:uuid:{resource['id']}"


def _entry(resource):
    return {"fullUrl": _ref(resource), "resource": resource}


def bundle(summary, patient_label="Patient", now=None):
    now = now or datetime.now(timezone.utc)
    pid, did = str(uuid.uuid4()), str(uuid.uuid4())
    simulated = bool(summary.get("simulated"))
    who = "simulated demo patient, not a real person" if simulated else "pseudonymous"
    patient = {"resourceType": "Patient", "id": pid,
               "text": {"status": "generated", "div": f"<div xmlns=\"http://www.w3.org/1999/xhtml\">{html.escape(str(patient_label))} ({who})</div>"}}
    device = {"resourceType": "Device", "id": did,
              "deviceName": [{"name": "Afferent finger PulseSensor clip (Arduino UNO Q)", "type": "user-friendly-name"}]}
    entries = [_entry(patient), _entry(device)]

    for d in summary["daily"]:
        if d.get("from_ts") is not None and d.get("to_ts") is not None:
            # the 24 hours the value was computed over (Store.daily), not the calendar day of d["date"]
            period = {"start": datetime.fromtimestamp(d["from_ts"], timezone.utc).isoformat(),
                      "end": datetime.fromtimestamp(d["to_ts"], timezone.utc).isoformat()}
        else:
            start = datetime.fromisoformat(d["date"]).replace(tzinfo=timezone.utc)
            period = {"start": start.isoformat(), "end": (start + timedelta(days=1)).isoformat()}
        for metric, spec in DAILY.items():
            v = d.get(metric)
            if v is None:
                continue
            obs = {"resourceType": "Observation", "id": str(uuid.uuid4()), "status": "final",
                   "category": [{"coding": [{"system": CAT, "code": spec["category"]}]}],
                   "code": {"coding": [{"system": spec["system"], "code": spec["code"], "display": spec["display"]}],
                            "text": spec["display"]},
                   "subject": {"reference": _ref(patient)}, "device": {"reference": _ref(device)},
                   "effectivePeriod": period,
                   "valueQuantity": {"value": v, "unit": spec["unit"], "system": UCUM, "code": spec["unit"]},
                   "method": {"text": spec["method"]},
                   "note": [{"text": f"{d['minutes']:g} minutes of sensor data that day"}]}
            entries.append(_entry(obs))

    for q in summary["phq9"]:
        when = datetime.fromtimestamp(q["ts"], timezone.utc).isoformat()
        obs = {"resourceType": "Observation", "id": str(uuid.uuid4()), "status": "final",
               "category": [{"coding": [{"system": CAT, "code": "survey"}]}],
               "code": {"coding": [{"system": LOINC, "code": "44261-6",
                                    "display": "Patient Health Questionnaire 9 item (PHQ-9) total score [Reported]"}],
                        "text": "PHQ-9 total score"},
               "subject": {"reference": _ref(patient)}, "effectiveDateTime": when,
               "valueInteger": q["score"],
               "interpretation": [{"text": f"{q['severity']} (PHQ-9 band)"}],
               "component": [{"code": {"coding": [{"system": LOINC, "code": code, "display": text}]},
                              "valueInteger": a} for (code, text), a in zip(PHQ9_ITEMS, q["answers"])]}
        if q["item9"] > 0:
            obs["note"] = [{"text": "Item 9 (thoughts of being better off dead or of self-harm) answered above 0 - assess risk."}]
        entries.append(_entry(obs))

    out = {"resourceType": "Bundle", "id": str(uuid.uuid4()), "type": "collection",
           "timestamp": now.isoformat(), "entry": entries}
    if simulated:                       # on the bundle and on every resource: an importer may split them up
        for resource in [out] + [e["resource"] for e in entries]:
            resource["meta"] = TEST_DATA
    return out
