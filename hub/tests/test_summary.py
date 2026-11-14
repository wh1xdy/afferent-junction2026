import copy
import json
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

import pytest

from afferent_hub import summary
from afferent_hub.summary import guard, ollama, prompt, summary_numbers, weekly_summary

ROOT = Path(__file__).resolve().parents[2]
FIX = ROOT / "contracts" / "fixtures"
PATIENT = {"id": "anna", "display_name": "Anna", "kind": "relapse", "simulated": True, "now_day": 56}

GOOD_GEMMA = (
    "Anna (simulated), week 9 after TMS. The system state is Consider discussing a booster session, "
    "since day 45. The early-warning index is 2.45, up 0.24 over the week, with 100% completeness and high confidence. "
    "Reaction time (z 3.48), sleep regularity (z 5.37) and missed sessions (z 2.48) are furthest above the personal baseline. "
    "Breath was followed by a settling pulse in 15 of 20 calm sessions, P(best) 0.95."
)

@pytest.fixture
def analytics():
    return json.loads((FIX / "analytics_anna.json").read_text())

@pytest.fixture(autouse=True)
def isolated(monkeypatch):
    monkeypatch.setenv("AFFERENT_OLLAMA_URL", "http://127.0.0.1:9")
    monkeypatch.delenv("AFFERENT_GEMMA_MODEL", raising=False)
    monkeypatch.delenv("AFFERENT_SUMMARY", raising=False)
    summary.clear_cache()
    yield
    summary.clear_cache()

class FakeOllama:
    def __init__(self, models, response):
        self.models = models
        self.response = response
        self.calls = []
        outer = self

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *args):
                pass

            def _send(self, body):
                raw = json.dumps(body).encode()
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(raw)))
                self.end_headers()
                self.wfile.write(raw)

            def do_GET(self):
                self._send({"models": [{"name": m} for m in outer.models]})

            def do_POST(self):
                body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
                outer.calls.append(body)
                self._send({"model": body["model"], "response": outer.response, "done": True})

        self.server = HTTPServer(("127.0.0.1", 0), Handler)
        self.url = f"http://127.0.0.1:{self.server.server_address[1]}"
        threading.Thread(target=self.server.serve_forever, daemon=True).start()

    def close(self):
        self.server.shutdown()
        self.server.server_close()

@pytest.fixture
def fake(monkeypatch):
    servers = []

    def make(response=GOOD_GEMMA, models=("llama3:8b", "gemma3:1b", "gemma3n:e2b")):
        s = FakeOllama(list(models), response)
        servers.append(s)
        monkeypatch.setenv("AFFERENT_OLLAMA_URL", s.url)
        ollama.reset()
        return s

    yield make
    for s in servers:
        s.close()

def stable_variant(a):
    a = copy.deepcopy(a)
    a["patient_id"] = "mikko"
    a["state"] = "stable"
    a["state_label"] = "Stable"
    a["cusum"].update(state="stable", state_label="Stable", since_day=None)
    a["composite"].update(value=-0.214, trend_7d=-0.003)
    for c in a["composite"]["contributions"]:
        c["contribution"] = -abs(c["contribution"])
        c["signed_z"] = -abs(c["signed_z"])
    return a

def assert_clean(text, numbers):
    assert guard.check(text, numbers) is None, guard.check(text, numbers)
    assert "\u2014" not in text and "\u2013" not in text
    assert 4 <= len(guard.sentences(text)) <= 6
    assert len(text) <= guard.MAX_CHARS

def test_numbers_match_contract_fixture(analytics):
    numbers = summary_numbers(analytics, PATIENT)
    expected = json.loads((FIX / "summary_example.json").read_text())["numbers"]
    for key, value in expected.items():
        if key == "top_contributors":
            got = [{"label": c["label"], "signed_z": c["signed_z"]} for c in numbers[key]]
            assert got == value
        else:
            assert numbers[key] == value, key

def test_template_output_on_fixture(analytics):
    r = weekly_summary(analytics, PATIENT)
    assert r["source"] == "template" and r["model"] is None
    assert r["fallback_reason"] == "no Gemma model on Ollama"
    assert r["generated_iso"]
    assert r["patient_id"] == "anna" and (r["week_start_day"], r["week_end_day"]) == (50, 56)
    assert r["simulated"] is True and "no diagnosis" in r["disclaimer"]
    t = r["text"]
    assert t.startswith("Anna (simulated), week 9 after TMS")
    for piece in ("booster session since day 45", "+2.45", "up 0.24", "100% of features available",
                  "reaction time (+3.5)", "sleep regularity (+5.4)", "-1.7 bpm", "15 of 20", "P(best) 0.95"):
        assert piece in t, piece
    assert_clean(t, r["numbers"])

def test_template_stable_patient(analytics):
    a = stable_variant(analytics)
    r = weekly_summary(a, {"id": "mikko", "display_name": "Mikko", "simulated": True})
    t = r["text"]
    assert "Status: stable," in t and "since day" not in t
    assert "-0.21" in t and "unchanged over 7 days" in t
    assert "No feature is above the personal baseline" in t
    assert_clean(t, r["numbers"])

def test_template_sparse_analytics_does_not_crash():
    a = {"patient_id": "new", "now_day": 3, "simulated": True, "state": "stable", "state_label": "Stable",
         "composite": {"value": None, "completeness": 0.25, "confidence": "low", "contributions": []}}
    r = weekly_summary(a, {"display_name": "Eero", "simulated": True})
    assert r["source"] == "template"
    assert "not available yet" in r["text"] and "25% of features available" in r["text"]
    assert guard.check(r["text"], r["numbers"]) is None
    assert r["numbers"]["week_since_tms"] == 1 and r["numbers"]["week_start_day"] == 0

def test_daily_records_add_sleep_and_activity(analytics):
    daily = []
    for day in range(57):
        steps = 6000 if day < 14 else (5000 if day < 50 else 2100)
        bed = 8.0 if day < 14 else 9.6
        daily.append({"day_index": day, "steps": steps, "sleep": {"time_in_bed_h": bed},
                      "simulated": True, "simulated_fields": ["steps", "sleep"]})
    r = weekly_summary(analytics, {"patient": PATIENT, "daily": daily})
    n = r["numbers"]
    assert (n["steps_week_mean"], n["steps_baseline_mean"], n["steps_delta"]) == (2100, 6000, -3900)
    assert (n["time_in_bed_h_week"], n["time_in_bed_h_baseline"]) == (9.6, 8.0)
    assert "2100 steps a day (baseline 6000)" in r["text"]
    assert "time in bed 9.6 h a night (baseline 8.0 h)" in r["text"]
    assert_clean(r["text"], n)

@pytest.mark.parametrize("state,label", [("watch", "Watch"), ("check_in", "Consider a check-in call"),
                                         ("booster", "Consider discussing a booster session")])
def test_template_passes_guard_in_every_state(analytics, state, label):
    a = copy.deepcopy(analytics)
    a["state"], a["state_label"] = state, label
    r = weekly_summary(a, PATIENT)
    assert label.lower() in r["text"].lower()
    assert_clean(r["text"], r["numbers"])

@pytest.mark.parametrize("phrase", [
    "Afferent treats her depression.", "This prevents relapse.", "The pattern suggests a diagnosis.",
    "HRV dropped.", "It measures alertness well.", "The method is clinically validated.",
    "The team should call her.", "We recommend a booster.", "No suicidal content.",
    "The camera detects emotions.", "Call 112 now.", "This is a crisis.", "Sleep fell because of stress.",
    "Index rose \u2014 sharply.",
])
def test_forbidden_phrase_guard(analytics, phrase):
    numbers = summary_numbers(analytics, PATIENT)
    text = f"Anna (simulated), week 9 after TMS. Status is booster. Index 2.45. {phrase}"
    assert guard.check(text, numbers).startswith("forbidden phrase")

def test_number_consistency_guard(analytics):
    numbers = summary_numbers(analytics, PATIENT)
    ok = "Anna (simulated), week 9 after TMS. Index 2.45, 2.5 or 2. Completeness 100%. Pulse -1.7 bpm, 29% settled."
    assert guard.check(ok, numbers) is None
    assert guard.untraceable_numbers("Index 42.7 and pulse 81 bpm.", numbers) == [42.7, 81.0]
    assert guard.untraceable_numbers("2,100 steps", {"steps": 2100}) == []
    assert guard.untraceable_numbers("2,100 steps", {"steps": 2000}) == [2100.0]
    assert guard.untraceable_numbers("in 3 of 7 days, 10 sessions", {}) == []
    assert guard.untraceable_numbers("11 sessions", {}) == [11.0]
    bad = ok.replace("2.45", "2.61")
    assert guard.check(bad, numbers) == "untraceable number: 2.61"

def test_structure_guard(analytics):
    numbers = summary_numbers(analytics, PATIENT)
    assert guard.check("", numbers) == "empty"
    assert guard.check("Anna (simulated). " * 60, numbers).startswith("too long")
    assert guard.check("Anna (simulated), week 9 after TMS. Index 2.45.", numbers) == "2 sentences"
    assert guard.check("Week 9 after TMS. Index 2.45. Status booster.", numbers) == "patient name missing"
    assert guard.check("Anna, week 9 after TMS. Index 2.45. Status booster.", numbers) == "simulated label missing"

def test_normalize_strips_markdown_and_dashes():
    assert guard.normalize('"**Anna** \u2014 week 9.\n- Index 2.45."') == "Anna, week 9. Index 2.45."
    assert guard.normalize("days 50\u201356") == "days 50 to 56"

def test_model_preference():
    assert ollama.pick_model(["gemma3:4b", "gemma3n:e4b", "gemma3n:e2b"]) == "gemma3n:e2b"
    assert ollama.pick_model(["llama3", "gemma3:1b", "gemma2:2b"]) == "gemma3:1b"
    assert ollama.pick_model(["gemma2:2b", "embeddinggemma:300m"]) == "gemma2:2b"
    assert ollama.pick_model(["llama3", "embeddinggemma:300m"]) is None
    assert ollama.pick_model([]) is None

def test_prompt_contains_only_numbers_and_rules(analytics):
    numbers = summary_numbers(analytics, PATIENT)
    system, user = prompt.build(numbers)
    assert 'Begin with exactly: "Anna (simulated), week 9 after TMS."' in system
    assert "Never use the words should, recommend" in system
    payload = json.loads(user.split("Numbers (JSON):\n", 1)[1].rsplit("\n\nWrite", 1)[0])
    assert payload["composite"] == 2.453 and "features" not in payload and "timeline" not in payload
    assert all("key" not in c for c in payload["top_contributors"])
    assert numbers["top_contributors"][0]["key"] == "rt_median"

def test_gemma_path_accepts_clean_output(analytics, fake):
    server = fake()
    r = weekly_summary(analytics, PATIENT)
    assert r["source"] == "gemma" and r["model"] == "gemma3n:e2b" and r["fallback_reason"] is None
    assert r["text"] == GOOD_GEMMA
    call = server.calls[0]
    assert call["stream"] is False and call["options"]["temperature"] == 0.2
    assert weekly_summary(analytics, PATIENT)["text"] == GOOD_GEMMA
    assert len(server.calls) == 1
    weekly_summary(analytics, PATIENT, refresh=True)
    assert len(server.calls) == 2

@pytest.mark.parametrize("response,reason", [
    (GOOD_GEMMA + " The team should call her.", "rejected: forbidden phrase"),
    (GOOD_GEMMA.replace("2.45", "3.12"), "rejected: untraceable number: 3.12"),
    (GOOD_GEMMA + " Extra." * 120, "rejected: too long"),
    ("", "rejected: empty"),
])
def test_gemma_output_rejected_falls_back(analytics, fake, response, reason):
    fake(response=response)
    r = weekly_summary(analytics, PATIENT)
    assert r["source"] == "template" and r["model"] is None
    assert r["fallback_reason"].startswith(reason)
    assert_clean(r["text"], r["numbers"])

def test_no_gemma_model_installed(analytics, fake):
    server = fake(models=["llama3:8b"])
    r = weekly_summary(analytics, PATIENT)
    assert r["source"] == "template" and r["fallback_reason"] == "no Gemma model on Ollama"
    assert server.calls == []

def test_template_forced_by_env(analytics, fake, monkeypatch):
    server = fake()
    monkeypatch.setenv("AFFERENT_SUMMARY", "template")
    assert weekly_summary(analytics, PATIENT)["source"] == "template"
    assert server.calls == []

def test_summary_sources_have_no_em_dash():
    src = ROOT / "hub" / "afferent_hub" / "summary"
    for path in src.glob("*.py"):
        assert "\u2014" not in path.read_text(encoding="utf-8"), path

def test_template_worst_case_length(analytics):
    contributions = analytics["composite"]["contributions"]
    contributions.sort(key=lambda c: -len(c["label"]))
    for i, c in enumerate(contributions):
        c["contribution"] = 1 - i * 0.1
    daily = [{"day_index": d, "steps": 16000 if d < 14 else 12100,
              "sleep": {"time_in_bed_h": 10.25 if d < 14 else 11.65}, "simulated": True} for d in range(57)]
    patient = {"patient": {"id": "anna", "display_name": "Annabelle-Marie", "simulated": True}, "daily": daily}
    r = weekly_summary(analytics, patient)
    assert_clean(r["text"], r["numbers"])
