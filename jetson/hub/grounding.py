"""Grounded answers for the clinician: a local LLM may only word facts the hub computed.

1. build_facts(summary) turns Store.summary() into short labelled lines ([T:hrv_rmssd] ...).
2. The LLM gets only those lines + the question, and must cite labels.
3. check(answer, facts): every number must appear in the facts its sentence cites, every label must
   exist, and direction words (increased / fell ...) must agree with the numbers. Anything else is reported back as unsupported, so the doctor can see it.
The model never sees the database and never does arithmetic the hub hasn't already done.

The overview ("summarise this period") does not use the model at all: summary_text() is a fixed
template over the same facts, instant and checked by the same check().
"""
import json
import re
import urllib.request

from store import METRICS

LLM_URL = "http://127.0.0.1:8081/v1/chat/completions"

SYSTEM = (
    "You are a clinical data assistant for a physician reviewing one patient's monitoring data.\n"
    "Rules:\n"
    "1. Answer ONLY from the FACTS. End every sentence with the label(s) of the fact(s) it uses, e.g. [T:hrv_rmssd].\n"
    "2. Copy numbers exactly from the fact you cite. Never compute or round new numbers.\n"
    "3. For a specific date, use that day's [D:YYYY-MM-DD] fact.\n"
    "4. State what the data shows. Do NOT interpret physiology or psychology (no 'suggesting', 'indicating', "
    "no causes, no diagnosis, no treatment advice) and no judgement words like 'significant', 'slight', 'normal'.\n"
    "5. If the facts do not contain the answer, say exactly: \"The data doesn't show that.\"\n"
    "   If asked for a diagnosis, say the data cannot diagnose and give the latest PHQ-9 fact.\n"
    "6. At most 100 words.\n"
    "Example: \"Resting pulse rose from 62 BPM to 71 BPM between the two weeks [T:finger_bpm]. "
    "Sensor data covers 14 of 14 days [C].\""
)

NAMES = {m: v[0] for m, v in METRICS.items()}
UNITS = {m: v[1] for m, v in METRICS.items()}


def build_facts(s):
    """[(label, text)] from Store.summary()"""
    f = []
    p, c = s["period"], s["coverage"]
    f.append(("P", f"period {p['from']} to {p['to']} ({p['days']} days)"))
    f.append(("C", f"coverage: {c['days_with_sensor_data']} of {p['days']} days with sensor data, "
                   f"{c['sensor_minutes']} sensor minutes, {c['sessions']} app sessions, {c['phq9_entries']} PHQ-9 entries"))
    f.append(("F", "PHQ-9 item 9 (self-harm thoughts) above 0 in this period: " + ("YES" if s["phq9_item9_flag"] else "no")))
    for i, q in enumerate(s["phq9"], 1):
        f.append((f"Q{i}", f"PHQ-9 on {q['date']}: score {q['score']}/27 ({q['severity']}), item 9 = {q['item9']}"))
    for m, t in s["trends"].items():
        if t:
            pct = f", {t['change_pct']:+d} %" if t["change_pct"] is not None else ""
            f.append((f"T:{m}", f"{NAMES[m]}: previous 7 days {t['previous']:g} {UNITS[m]}, last 7 days {t['recent']:g} {UNITS[m]} "
                                f"(change {t['change']:+g}{pct})"))
        else:
            f.append((f"T:{m}", f"{NAMES[m]}: not enough data for a 7-day trend"))
    for d in s["daily"]:
        parts = [f"{NAMES[m].lower()} {d[m]:g} {UNITS[m]}" for m in METRICS if d.get(m) is not None]
        if parts:
            f.append((f"D:{d['date']}", f"{d['date']}: " + "; ".join(parts) + f"; {d['minutes']:g} min of data"))
    b = s["behaviour"]
    if any(v is not None for v in b.values()):
        def pc(v):
            return "n/a" if v is None else f"{round(v * 100)} %"
        f.append(("B", f"facial behaviour, session averages: smiling {pc(b['smile_share'])}, looking away {pc(b['gaze_away_share'])}, "
                       f"blinks {'n/a' if b['blinks_per_min'] is None else round(b['blinks_per_min'])} /min, "
                       f"micro-expressions {'n/a' if b['micro_expressions_per_session'] is None else b['micro_expressions_per_session']:} per session"))
    return f


def facts_text(facts):
    return "\n".join(f"[{k}] {v}" for k, v in facts)


NUM = re.compile(r"(?<![\w.])[-+]?\d+(?:\.\d+)?")
UP = re.compile(r"\b(increas\w*|ris(e|es|en|ing)|rose|went up|higher|grew|grow\w*|elevat\w*|up)\b", re.I)
DOWN = re.compile(r"\b(decreas\w*|fell|fall\w*|dropp?\w*|declin\w*|lower\w*|reduc\w*|went down|down)\b", re.I)
FROM_TO = re.compile(r"from\s+([-+]?\d+(?:\.\d+)?)\D{0,25}?\s+to\s+([-+]?\d+(?:\.\d+)?)", re.I)
CHANGE = re.compile(r"\(change ([-+]\d+(?:\.\d+)?)")
# judgement words the facts don't support ("significant" reads as statistical significance to a
# clinician). PHQ-9 band names (mild, moderate, severe) are facts and stay allowed.
EVALUATIVE = re.compile(r"\b(significant\w*|slight\w*|dramatic\w*|substantial\w*|marked\w*|concerning|"
                        r"alarming|worrying|notabl\w*|considerabl\w*|sharp\w*|minor|major|normal|abnormal)\b", re.I)


def direction_problem(text, cited_facts):
    """A direction word must agree with the numbers: 'from A to B' -> sign(B - A); otherwise the sign
    of the change in the single trend fact the text cites. Numbers alone can't catch
    'HRV increased from 55.1 to 37.9'."""
    up, down = bool(UP.search(text)), bool(DOWN.search(text))
    if up == down:                      # no direction word, or both (e.g. 'up then down'): nothing to check
        return None
    claimed = 1 if up else -1
    m = FROM_TO.search(text)
    if m:
        a, b = float(m.group(1)), float(m.group(2))
        if a != b and (b - a > 0) != (claimed > 0):
            return f"says {'increase' if up else 'decrease'} but goes from {m.group(1)} to {m.group(2)}"
        return None
    changes = [float(c) for f in cited_facts for c in CHANGE.findall(f)]
    if len(changes) == 1 and changes[0] != 0 and (changes[0] > 0) != (claimed > 0):
        return f"says {'increase' if up else 'decrease'} but the cited change is {changes[0]:+g}"
    return None


def _numbers(text):
    return {float(x) for x in NUM.findall(text)}


def check(answer, facts):
    """Per sentence: every number must appear in the facts that sentence cites; every label must
    exist. (A global check let a daily value pass as a trend value.)"""
    by_label = dict(facts)
    labels = set(by_label)
    unsupported, unknown, used = set(), set(), set()
    directions = []
    evaluative = set()

    def judge(text, cites):
        good = [c for c in cites if c in labels]
        unknown.update(c for c in cites if c not in labels)
        used.update(good)
        allowed = set()
        for c in good:
            allowed |= _numbers(f"{c} {by_label[c]}")
        for x in NUM.findall(text):
            n = float(x)
            if n not in allowed and abs(n) not in allowed:
                unsupported.add(n)
        d = direction_problem(text, [by_label[c] for c in good])
        if d:
            directions.append(d)
        evaluative.update(w.lower() for w in EVALUATIVE.findall(text))

    # each stretch of text is judged against the citation group that follows it (decimals stay intact)
    parts = re.split(r"(\[[^\]]+\])", answer)
    text, cites = "", []
    for part in parts:
        if part.startswith("[") and part.endswith("]"):
            cites += [c.strip() for c in part[1:-1].split(",") if c.strip()]
            continue
        if cites:                       # a citation group just ended: judge the text before it
            judge(text, cites)
            text, cites = "", []
        text += part
    judge(text, cites)                  # trailing text: numbers without a citation are unsupported
    refusal = "doesn't show" in answer
    return {"unsupported_numbers": sorted(unsupported), "unknown_labels": sorted(unknown),
            "wrong_direction": directions, "judgement_words": sorted(evaluative), "sources": sorted(used),
            "grounded": not unsupported and not unknown and not directions and not evaluative and bool(used or refusal)}


def safety_note(summary):
    """Deterministic, never left to the model: PHQ-9 item 9 above 0 is always surfaced first."""
    hits = [q for q in summary["phq9"] if q["item9"] > 0]
    if not hits:
        return None
    labels = [f"Q{summary['phq9'].index(q) + 1}" for q in hits]
    dates = ", ".join(q["date"] for q in hits)
    return (f"Safety: PHQ-9 item 9 (thoughts of being better off dead or of self-harm) was above 0 on {dates} "
            f"[F, {', '.join(labels)}]. Please assess risk.")


TOPICS = {
    "hrv_rmssd": ("hrv", "variability", "rmssd", "parasympathetic", "stress"),
    "finger_bpm": ("pulse", "heart rate", "bpm", "heartbeat"),
    "breathing": ("breath", "respirat"),
}
PHQ_WORDS = ("phq", "mood", "depress", "score", "suicid", "self-harm", "harm", "risk", "item 9", "diagnos")
FACE_WORDS = ("smil", "face", "facial", "expression", "blink", "gaze", "eye", "look")
DATE = re.compile(r"\d{4}-\d{2}-\d{2}")


def select(question, facts):
    """Only the facts this question needs: a 3B model mixes numbers up when given every daily row."""
    q = question.lower()
    keep = {"P", "C", "F"}
    metrics = [m for m, words in TOPICS.items() if any(w in q for w in words)]
    dates = DATE.findall(q)
    wants_phq = any(w in q for w in PHQ_WORDS)
    wants_face = any(w in q for w in FACE_WORDS)
    overview = any(w in q for w in ("summar", "overview", "trend", "physiolog", "overall", "period"))
    general = overview or not (metrics or dates or wants_phq or wants_face)
    for k, v in facts:
        if k.startswith("Q") and (wants_phq or general):
            keep.add(k)
        elif k.startswith("T:") and (general or k[2:] in metrics) and not dates:
            keep.add(k)
        elif k.startswith("D:") and k[2:] in dates:
            keep.add(k)
        elif k == "B" and (wants_face or general):
            keep.add(k)
    return [(k, v) for k, v in facts if k in keep]


OVERVIEW_WORDS = ("summar", "overview", "recap", "sum up", "overall picture", "big picture", "at a glance",
                  "how is the patient doing", "how has the patient been")
GENERAL_WORDS = ("physiolog", "vital", "coverage")


def is_overview(question):
    """A request for the whole picture -> the instant template instead of the LLM. Not when the
    question names a date or exactly one topic (one metric, the PHQ-9 or the face): those stay
    specific questions for the model."""
    q = question.lower()
    if not any(w in q for w in OVERVIEW_WORDS) or DATE.search(q):
        return False
    topics = sum(any(w in q for w in words) for words in (*TOPICS.values(), PHQ_WORDS, FACE_WORDS, GENERAL_WORDS))
    return topics != 1


def _mid(name):
    """metric name inside a sentence: 'Resting pulse' -> 'resting pulse', 'HRV (RMSSD)' stays"""
    return name if name[:2].isupper() else name[0].lower() + name[1:]


def _count(n, one, many):
    return f"{n} {one if n == 1 else many}"


def _template(s):
    """The doctor summary as 3-5 sentences. Every clause is followed by the label(s) of the fact(s) it
    words, with the numbers formatted exactly as in build_facts(). States numbers and direction only."""
    out = []
    # 1. PHQ-9 course: first -> latest entry, and item 9
    phq = s["phq9"]
    if not phq:
        out.append("No PHQ-9 entries in this period [C].")
    else:
        def entry(q):
            return f"{q['score']}/27 ({q['severity']}) on {q['date']}"
        if len(phq) == 1:
            course = f"PHQ-9 was {entry(phq[0])} [Q1]"
        else:
            course = (f"PHQ-9 went from {entry(phq[0])} (first entry) to {entry(phq[-1])} (latest entry) "
                      f"[Q1, Q{len(phq)}]")
        hits = [i for i, q in enumerate(phq, 1) if q["item9"] > 0]
        if hits:
            item9 = (f"item 9 was above 0 on {', '.join(phq[i - 1]['date'] for i in hits)} "
                     f"[F, {', '.join(f'Q{i}' for i in hits)}]")
        else:
            item9 = "item 9 was not above 0 in this period [F]"
        out.append(f"{course}; {item9}.")
    # 2. every 7-day trend that exists
    clauses = []
    for m, t in s["trends"].items():
        if not t:
            continue
        a, b, u = f"{t['previous']:g}", f"{t['recent']:g}", UNITS[m]
        pct = f", {t['change_pct']:+d} %" if t["change_pct"] is not None else ""
        if t["change"] == 0 or a == b:
            move = f"was {a} {u} then {b} {u}"
        else:
            move = f"{'rose' if t['change'] > 0 else 'fell'} from {a} {u} to {b} {u}"
        clauses.append(f"{_mid(NAMES[m])} {move} (change {t['change']:+g}{pct}) [T:{m}]")
    if clauses:
        out.append("Previous 7 days vs last 7 days: " + "; ".join(clauses) + ".")
    # 3. metrics without a trend yet: say so, and give the latest daily value where there is one
    waiting = [m for m, t in s["trends"].items() if not t]
    if waiting:
        names = [_mid(NAMES[m]) for m in waiting]
        listed = names[0] if len(names) == 1 else ", ".join(names[:-1]) + " or " + names[-1]
        text = f"Not enough data for a 7-day trend in {listed} [{', '.join(f'T:{m}' for m in waiting)}]"
        latest = {}
        for m in waiting:
            hit = next((d for d in reversed(s["daily"]) if d.get(m) is not None), None)
            if hit:
                latest.setdefault(hit["date"], []).append(f"{_mid(NAMES[m])} {hit[m]:g} {UNITS[m]}")
        for k, (date, parts) in enumerate(sorted(latest.items(), reverse=True)):
            text += f"; {'latest daily values: ' if k == 0 else ''}{', '.join(parts)} on {date} [D:{date}]"
        out.append(text + ".")
    # 4. facial behaviour, if the app sent sessions
    b = s["behaviour"]
    parts = []
    if b["smile_share"] is not None:
        parts.append(f"smiling {round(b['smile_share'] * 100)} %")
    if b["gaze_away_share"] is not None:
        parts.append(f"looking away {round(b['gaze_away_share'] * 100)} %")
    if b["blinks_per_min"] is not None:
        parts.append(f"blinks {round(b['blinks_per_min'])} /min")
    if b["micro_expressions_per_session"] is not None:
        parts.append(f"micro-expressions {b['micro_expressions_per_session']:g} per session")
    if parts:
        out.append("Facial behaviour, averages over the app sessions: " + ", ".join(parts) + " [B].")
    # 5. data coverage
    p, c = s["period"], s["coverage"]
    out.append(f"Data coverage for {p['from']} to {p['to']} ({p['days']} days): sensor data on "
               f"{c['days_with_sensor_data']} of {p['days']} days, {_count(c['sensor_minutes'], 'sensor minute', 'sensor minutes')}, "
               f"{_count(c['sessions'], 'app session', 'app sessions')}, "
               f"{_count(c['phq9_entries'], 'PHQ-9 entry', 'PHQ-9 entries')} [P, C].")
    return " ".join(out)


def summary_text(summary):
    """Deterministic doctor summary (no LLM): instant, and it passes check() against build_facts().
    Should the template and the facts ever drift apart, the facts themselves are shown instead."""
    facts = build_facts(summary)
    text = _template(summary)
    if not check(text, facts)["grounded"]:
        text = " ".join(f"{v} [{k}]." for k, v in facts if not k.startswith("D:"))
    return text


def _chat(url, system, messages, timeout):
    body = {"messages": [{"role": "system", "content": system}] + messages, "temperature": 0.1, "max_tokens": 300}
    req = urllib.request.Request(url, data=json.dumps(body).encode(), headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read())["choices"][0]["message"]["content"].strip()


def ask(question, summary, url=LLM_URL, timeout=180):
    """Grounded answer: relevant facts only -> LLM -> check -> one corrective retry -> verbatim
    facts as a fallback. An unsupported number never reaches the clinician unmarked.
    Overview / summary requests skip the LLM: mode "template" (summary_text)."""
    facts = select(question, build_facts(summary))
    q = question.lower()
    if any(w in q for w in ("diagnos", "have depression", "is depressed", "does the patient have")):
        # never left to the model: no diagnosis, point to the validated instrument
        phq = [(k, v) for k, v in facts if k.startswith("Q")]
        latest = f" Latest check-in: {phq[-1][1]} [{phq[-1][0]}]." if phq else " There is no PHQ-9 in this period [C]."
        answer = "These data cannot diagnose depression; that is a clinical judgement." + latest
        return _finish(question, answer, "rule", 0, facts, summary)
    if is_overview(question):
        # the whole picture is a fixed template, not the model: instant, and always the same wording
        return _finish(question, summary_text(summary), "template", 0, build_facts(summary), summary)
    system = SYSTEM + "\n\nFACTS:\n" + facts_text(facts)
    msgs = [{"role": "user", "content": question}]
    answer = _chat(url, system, msgs, timeout)
    chk = check(answer, facts)
    attempts = 1
    if not chk["grounded"]:
        problems = []
        if chk["unsupported_numbers"]:
            problems.append("these numbers are not in the facts you cited: " + ", ".join(f"{n:g}" for n in chk["unsupported_numbers"]))
        if chk["unknown_labels"]:
            problems.append("these labels don't exist: " + ", ".join(chk["unknown_labels"]))
        if chk["wrong_direction"]:
            problems.append("wrong direction: " + "; ".join(chk["wrong_direction"]))
        if chk["judgement_words"]:
            problems.append("remove judgement words (" + ", ".join(chk["judgement_words"]) + "); state the numbers only")
        if not problems:
            problems.append("every sentence needs a fact label")
        msgs += [{"role": "assistant", "content": answer},
                 {"role": "user", "content": "Your answer broke the rules: " + "; ".join(problems)
                  + ". Answer again, copying numbers exactly from the fact you cite."}]
        answer = _chat(url, system, msgs, timeout)
        chk = check(answer, facts)
        attempts = 2
    mode = "llm"
    # refused although the question named something we do have (a metric, a date, the face) -> show it.
    # Not for questions about things we don't measure (e.g. sleep): there the refusal is the answer.
    asked_topic = (any(w in q for words in TOPICS.values() for w in words) or DATE.search(q)
                   or any(w in q for w in FACE_WORDS))
    topical = [k for k, _ in facts if k.startswith(("T:", "D:")) or k == "B"]
    if chk["grounded"] and "doesn't show" in answer and topical and asked_topic:
        chk = {**chk, "grounded": False}          # refused although relevant data exists -> show it
    if not chk["grounded"]:
        # fallback: show the relevant facts verbatim instead of an unverified sentence
        rel = [(k, v) for k, v in facts if k not in ("P", "C", "F")] or facts
        answer = "Relevant data: " + " ".join(f"{v} [{k}]." for k, v in rel)
        chk = check(answer, facts)
        mode = "facts"
    return _finish(question, answer, mode, attempts, facts, summary)


def _finish(question, answer, mode, attempts, facts, summary):
    chk = check(answer, facts)
    result = {"question": question, "answer": answer, "mode": mode, "attempts": attempts, **chk}
    note = safety_note(summary)
    if note:
        result["safety"] = note
        result["answer"] = note + "\n\n" + result["answer"]
        result["sources"] = sorted(set(result["sources"]) | {"F"} | set(re.findall(r"Q\d+", note)))
    all_facts = dict(build_facts(summary))
    result["facts"] = [{"label": k, "text": all_facts[k]} for k in result["sources"] if k in all_facts]
    return result

