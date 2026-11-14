"""The doctor summary is a fixed template: instant, no LLM, and it passes the grounding check.

    cd jetson/hub && python3 -m unittest discover tests -v
"""
import os
import random
import re
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import demo  # noqa: E402
import grounding  # noqa: E402
import report  # noqa: E402
from store import Store  # noqa: E402
from test_hub import DAY, NOW, fill  # noqa: E402

NARRATIVE_Q = ("Summarise this period for the physician in 3 sentences: PHQ-9 course, physiological trends, "
               "and data coverage. Cite labels.")


def single_day():
    s = Store()
    for k in range(100):
        s.add_reading("finger_bpm", 72, NOW - 3600 + k * 5)
        s.add_reading("hrv_rmssd", 45.5, NOW - 3600 + k * 5)
    return s


def sentences(text):
    """the template ends every sentence with a citation group and a full stop"""
    return [p for p in re.split(r"(?<=\])\.(?:\s+|$)", text) if p]


class SummaryTemplate(unittest.TestCase):
    def grounded(self, summ):
        """the rules every summary must keep; returns the text"""
        text = grounding.summary_text(summ)
        chk = grounding.check(text, grounding.build_facts(summ))
        self.assertTrue(chk["grounded"], (text, chk))
        self.assertEqual(chk["unsupported_numbers"], [])
        self.assertEqual(chk["judgement_words"], [])
        self.assertIsNone(grounding.EVALUATIVE.search(text), text)
        parts = sentences(text)
        self.assertTrue(3 <= len(parts) <= 5, (len(parts), text))
        for p in parts:
            self.assertTrue(p.endswith("]"), f"sentence without a fact label: {p!r}")
        self.assertTrue(text.endswith("]."), text)
        for word in ("suggest", "indicat", "likely", "because", "due to", "diagnos", "depress", "should"):
            self.assertNotIn(word, text.lower())
        return text

    def test_demo_store(self):
        summ = demo.demo_store(NOW).summary(14, NOW)
        text = self.grounded(summ)
        t = summ["trends"]["hrv_rmssd"]
        self.assertIn(f"HRV (RMSSD) fell from {t['previous']:g} ms to {t['recent']:g} ms "
                      f"(change {t['change']:+g}, {t['change_pct']:+d} %) [T:hrv_rmssd]", text)
        self.assertIn("resting pulse rose from", text)
        self.assertIn("PHQ-9 went from 6/27 (mild) on", text)
        self.assertIn("to 11/27 (moderate) on", text)
        self.assertIn("item 9 was above 0 on", text)
        self.assertIn("[F, Q2]", text)
        self.assertIn("smiling 8 %", text)
        self.assertIn("sensor data on 14 of 14 days", text)
        self.assertEqual(text, grounding.summary_text(summ))            # same input, same words

    def test_empty_store(self):
        text = self.grounded(Store().summary(14, NOW))
        self.assertIn("No PHQ-9 entries in this period [C].", text)
        self.assertIn("Not enough data for a 7-day trend in resting pulse, HRV (RMSSD) or breathing rate", text)
        self.assertIn("sensor data on 0 of 14 days", text)
        self.assertNotIn("Facial behaviour", text)

    def test_single_day_of_data(self):
        text = self.grounded(single_day().summary(7, NOW))
        self.assertIn("latest daily values: resting pulse 72 BPM, HRV (RMSSD) 45.5 ms on", text)
        self.assertIn("sensor data on 1 of 7 days", text)

    def test_item9_zero_and_single_entry(self):
        s = Store()
        s.add_phq9([1, 1, 1, 1, 0, 0, 0, 0, 0], NOW - DAY)
        text = self.grounded(s.summary(14, NOW))
        self.assertIn("PHQ-9 was 4/27 (minimal) on", text)
        self.assertIn("item 9 was not above 0 in this period [F]", text)
        self.assertIn("1 PHQ-9 entry [P, C]", text)

    def test_no_change_gets_no_direction_word(self):
        s = Store()
        for d in range(14):
            for k in range(20):
                s.add_reading("hrv_rmssd", 40, NOW - (14 - d) * DAY + 3600 + k * 5)
        text = self.grounded(s.summary(14, NOW))
        self.assertIn("HRV (RMSSD) was 40 ms then 40 ms (change +0, +0 %) [T:hrv_rmssd]", text)
        self.assertIsNone(grounding.UP.search(text))
        self.assertIsNone(grounding.DOWN.search(text))

    def test_trend_for_one_metric_latest_values_for_the_others(self):
        s = Store()
        for d in range(14):
            for k in range(20):
                s.add_reading("hrv_rmssd", 50 if d < 7 else 60, NOW - (14 - d) * DAY + 3600 + k * 5)
        for k in range(20):
            s.add_reading("finger_bpm", 66, NOW - 3 * DAY + 3600 + k * 5)
            s.add_reading("breathing", 14, NOW - 5 * DAY + 3600 + k * 5)
        s.add_session({"summary": {"smileShare": 0.1, "blinksPerMinute": 12, "seconds": 60}}, NOW - DAY)
        text = self.grounded(s.summary(14, NOW))
        self.assertEqual(len(sentences(text)), 5)
        self.assertIn("HRV (RMSSD) rose from 50 ms to 60 ms (change +10, +20 %) [T:hrv_rmssd]", text)
        self.assertIn("Not enough data for a 7-day trend in resting pulse or breathing rate [T:finger_bpm, T:breathing]", text)
        self.assertIn("resting pulse 66 BPM on", text)
        self.assertIn("breathing rate 14 /min on", text)
        self.assertNotIn("looking away", text)                           # not measured in that session

    def test_random_stores_always_pass_the_check(self):
        rnd = random.Random(11)
        for _ in range(60):
            s = Store()
            for d in range(14):
                for metric, base in (("finger_bpm", 60), ("hrv_rmssd", 45), ("breathing", 14)):
                    if rnd.random() < 0.6:
                        level = base + rnd.uniform(-15, 15)
                        for k in range(rnd.choice((4, 12, 30))):
                            s.add_reading(metric, level + rnd.gauss(0, 2), NOW - (14 - d) * DAY + 3600 + k * 5)
            for _ in range(rnd.randrange(4)):
                s.add_phq9([rnd.randrange(4) for _ in range(9)], NOW - rnd.uniform(0, 14) * DAY)
            for _ in range(rnd.randrange(3)):
                s.add_session({"summary": {"smileShare": rnd.random(), "blinksPerMinute": rnd.uniform(5, 30),
                                           "gazeAwayShare": rnd.random()},
                               "events": [{"duration": 0.2}] * rnd.randrange(4)}, NOW - rnd.uniform(0, 14) * DAY)
            self.grounded(s.summary(rnd.choice((7, 14, 30)), NOW))
            s.db.close()

    def test_drift_between_template_and_facts_shows_the_facts(self):
        summ = demo.demo_store(NOW).summary(14, NOW)
        orig = grounding._template
        grounding._template = lambda s: "HRV was 99 ms, a significant drop [T:hrv_rmssd]."
        try:
            text = grounding.summary_text(summ)
        finally:
            grounding._template = orig
        self.assertNotIn("99", text)
        self.assertIn(dict(grounding.build_facts(summ))["T:hrv_rmssd"], text)
        self.assertTrue(grounding.check(text, grounding.build_facts(summ))["grounded"])


class SummaryInUse(unittest.TestCase):
    def setUp(self):
        self.calls = []
        self.orig = grounding._chat
        grounding._chat = lambda url, system, msgs, timeout: self.calls.append(msgs) or "The data doesn't show that."

    def tearDown(self):
        grounding._chat = self.orig

    def test_overview_question_is_answered_by_the_template_without_the_llm(self):
        summ = demo.demo_store(NOW).summary(14, NOW)
        for q in (NARRATIVE_Q, "Give me an overview", "Can you summarize the last two weeks?", "How is the patient doing?"):
            r = grounding.ask(q, summ)
            self.assertEqual(r["mode"], "template", q)
            self.assertEqual(r["attempts"], 0)
            self.assertTrue(r["grounded"], r)
            self.assertTrue(r["answer"].startswith("Safety: PHQ-9 item 9"), r["answer"])    # item 9 still comes first
            self.assertTrue(r["answer"].endswith(grounding.summary_text(summ)))
            self.assertIn("T:hrv_rmssd", r["sources"])
        self.assertEqual(self.calls, [])

    def test_overview_on_an_empty_store(self):
        r = grounding.ask("Summarise this period", Store().summary(14, NOW))
        self.assertEqual(r["mode"], "template")
        self.assertTrue(r["grounded"], r)
        self.assertNotIn("safety", r)
        self.assertEqual(self.calls, [])

    def test_specific_questions_still_go_to_the_llm(self):
        summ = demo.demo_store(NOW).summary(14, NOW)
        for q in ("How did the patient sleep?", "Summarise the HRV trend", "Give me a summary of 2027-01-10",
                  "What was the resting pulse?"):
            self.assertFalse(grounding.is_overview(q), q)
        r = grounding.ask("How did the patient sleep?", summ)
        self.assertEqual(r["mode"], "llm")
        self.assertEqual(len(self.calls), 1)

    def test_diagnosis_rule_wins_over_the_template(self):
        r = grounding.ask("Summarise: does the patient have depression?", demo.demo_store(NOW).summary(14, NOW))
        self.assertEqual(r["mode"], "rule")
        self.assertIn("cannot diagnose", r["answer"])

    def test_clinician_report_always_has_the_summary_box(self):
        for st, days in ((demo.demo_store(NOW), 14), (Store(), 14), (single_day(), 7)):
            summ = st.summary(days, NOW)
            h = report.clinician(summ)
            self.assertIn("<b>Summary</b>", h)
            self.assertIn("without a language model", h)
            plain = re.sub(r"<[^>]+>", "", h).replace("&gt;", ">")
            self.assertIn(grounding.summary_text(summ), plain)
        self.assertEqual(self.calls, [])


class TrendWindow(unittest.TestCase):
    def test_trend_is_always_the_final_14_days(self):
        s = Store()
        fill(s, random.Random(8))                                    # final 14 days: HRV 55 -> 38
        for d in range(16):                                          # 16 older days at a very different level
            for k in range(20):
                s.add_reading("hrv_rmssd", 90, NOW - (30 - d) * DAY + 3600 + k * 5)
        t30, t14 = s.trend("hrv_rmssd", 30, NOW), s.trend("hrv_rmssd", 14, NOW)
        self.assertEqual(t30, t14)
        self.assertAlmostEqual(t30["previous"], 55, delta=2)
        self.assertIsNone(s.trend("hrv_rmssd", 10, NOW))             # shorter than two 7-day windows


if __name__ == "__main__":
    unittest.main()
