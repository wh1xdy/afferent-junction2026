import datetime as dt
import time

from ..summary import guard
from .loader import alex

def phq9_answers(checkin: dict) -> list[int] | None:
    items = (checkin.get("phq9") or {}).get("items") or {}
    answers = [items.get(f"phq9_{i}") for i in range(1, 10)]
    return answers if all(type(a) is int for a in answers) else None

def _ts(checkin: dict) -> float | None:
    iso = checkin.get("completed_iso") or checkin.get("started_iso")
    try:
        return dt.datetime.fromisoformat(iso).timestamp()
    except (TypeError, ValueError):
        return None

def team_summary(checkins: list[dict], days: int = 14, now: float | None = None, readings=()) -> dict:
    store = alex()["store"].Store(":memory:")
    for c in checkins:
        answers, ts = phq9_answers(c), _ts(c)
        if answers is not None and ts is not None:
            store.add_phq9(answers, ts)
    for metric, value, ts, source in readings:
        store.add_reading(metric, value, ts, source)
    return store.summary(days, now or time.time())

def fhir_bundle(patient: dict, checkins: list[dict], days: int = 14, readings=()) -> dict:
    return alex()["fhir"].bundle(team_summary(checkins, days, readings=readings), patient_label=patient["id"])

def clinician_report(patient: dict, checkins: list[dict], days: int = 14, narrative: str | None = None) -> str:
    label = patient.get("display_name") or patient["id"]
    return alex()["report"].clinician(team_summary(checkins, days), patient_label=label, narrative=narrative)

def ask(question: str, checkins: list[dict], url: str, days: int = 14) -> dict:
    return alex()["grounding"].ask(question[:500], team_summary(checkins, days), url=url)

def guard_check(text: str) -> str | None:
    g = alex()["grounding"]
    for s in guard.sentences(text):
        problem = g.direction_problem(s, [])
        if problem:
            return f"direction: {problem}"
    words = sorted({w.lower() for w in g.EVALUATIVE.findall(text)})
    return "judgement words: " + ", ".join(words) if words else None
