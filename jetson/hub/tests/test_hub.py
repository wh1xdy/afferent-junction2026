"""Offline tests: synthetic 14 days of data -> aggregations, trends, PHQ-9 flag, reports.

    cd jetson/hub && python3 -m unittest discover tests -v
"""
import os
import random
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from store import Store, severity  # noqa: E402
import report  # noqa: E402

NOW = 1_800_000_000.0     # fixed "now" so day boundaries are deterministic
DAY = 86400


def fill(store, rnd, hrv_first=55, hrv_second=38, bpm_first=64, bpm_second=72):
    """14 days, 10 minutes of readings (every 5 s) per day; physiology worsens in week 2"""
    for d in range(14):
        t0 = NOW - (14 - d) * DAY + 3600 * 9
        second = d >= 7
        for k in range(120):
            ts = t0 + k * 5
            store.add_reading("finger_bpm", (bpm_second if second else bpm_first) + rnd.gauss(0, 4) + abs(rnd.gauss(0, 6)), ts)
            store.add_reading("hrv_rmssd", (hrv_second if second else hrv_first) + rnd.gauss(0, 5), ts)
            store.add_reading("breathing", (16 if second else 13) + rnd.gauss(0, 1), ts)


class Aggregation(unittest.TestCase):
    def setUp(self):
        self.s = Store()
        fill(self.s, random.Random(1))

    def test_daily_has_every_day(self):
        d = self.s.daily(14, NOW)
        self.assertEqual(len(d), 14)
        self.assertTrue(all(r["minutes"] == 10 for r in d))

    def test_trend_detects_the_change(self):
        t = self.s.trend("hrv_rmssd", 14, NOW)
        self.assertAlmostEqual(t["previous"], 55, delta=2)
        self.assertAlmostEqual(t["recent"], 38, delta=2)
        self.assertLess(t["change_pct"], -25)
        bpm = self.s.trend("finger_bpm", 14, NOW)
        self.assertGreater(bpm["change"], 5)       # resting pulse up

    def test_trend_needs_three_days_each(self):
        s = Store()
        for d in (1, 2, 10, 11):                    # only 2 days per window
            for k in range(20):
                s.add_reading("hrv_rmssd", 40, NOW - (14 - d) * DAY + k * 5)
        self.assertIsNone(s.trend("hrv_rmssd", 14, NOW))


class PHQ9(unittest.TestCase):
    def test_scoring_and_item9_flag(self):
        s = Store()
        s.add_phq9([1, 1, 1, 1, 1, 0, 0, 0, 0], NOW - 10 * DAY)
        s.add_phq9([2, 2, 2, 2, 2, 1, 1, 1, 1], NOW - 2 * DAY)
        sm = s.summary(14, NOW)
        self.assertEqual([p["score"] for p in sm["phq9"]], [5, 14])
        self.assertEqual(sm["phq9"][1]["severity"], "moderate")
        self.assertTrue(sm["phq9_item9_flag"])
        self.assertEqual(severity(22), "severe")

    def test_rejects_bad_answers(self):
        with self.assertRaises(ValueError):
            Store().add_phq9([1, 2, 3])


class Reports(unittest.TestCase):
    def setUp(self):
        self.s = Store()
        fill(self.s, random.Random(2))
        self.s.add_phq9([2, 2, 1, 2, 1, 1, 1, 0, 1], NOW - 1 * DAY)
        self.s.add_session({"summary": {"smileShare": 0.08, "expressivity": 0.05, "blinksPerMinute": 14,
                                        "gazeAwayShare": 0.2, "seconds": 60},
                            "cameraPulse": {"bpm": 71, "trust": 78}, "events": [{"duration": 0.3}]}, NOW - DAY)

    def test_handover_report_shows_flag_trends_and_coverage(self):
        h = report.handover(self.s.summary(14, NOW), "Patient A", now=NOW)
        self.assertIn("item 9 answered above 0", h)
        for measure in ("Resting pulse", "HRV (RMSSD)", "Breathing rate"):
            self.assertIn(f"<tr><td>{measure}</td>", h)
        self.assertIn("<svg", h)
        self.assertIn("14 / 14", h)                 # days with sensor data
        self.assertIn("not a diagnostic device", h)

    def test_handover_report_is_the_patients_own_document(self):
        h = report.handover(self.s.summary(14, NOW), "Patient A", now=NOW)
        self.assertIn("<title>Report for my doctor</title>", h)
        self.assertIn("<h1>Report for my doctor</h1>", h)
        self.assertIn("Patient A · 2027-01-01 to 2027-01-15 (14 days) · generated 2027-01-15 08:00 UTC · "
                      "printed by the patient from their own device", h)
        self.assertIn("<b>Shared by the patient.</b>", h)
        self.assertIn("The device sends nothing to anyone and gives no one else access to the data.", h)
        self.assertNotIn("SIMULATED", h)
        for word in ("clinician", "stress", "strain"):              # HRV is a number in ms, never "stress"
            self.assertNotIn(word, h.lower())

    def test_handover_report_prints_well_and_needs_no_interaction(self):
        h = report.handover(self.s.summary(14, NOW), now=NOW)
        css = h.split("<style>")[1].split("</style>")[0]
        for rule in ("@page { margin:15mm }", "@media print", ".screen { display:none }", "break-inside:avoid",
                     "print-color-adjust:exact"):
            self.assertIn(rule, css)
        for tag in ("<script", "<form", "<button", "<input", "<a ", "onclick"):
            self.assertNotIn(tag, h)
        # what is only for the patient at the screen stays off the paper; the item-9 box is printed
        self.assertIn('<div class="box screen"><b>This is your report to hand over.</b>', h)
        self.assertIn('<div class="box alert screen">You mentioned thoughts of hurting yourself.', h)
        self.assertIn('<div class="box alert"><b class="flag">PHQ-9 item 9 answered above 0</b>', h)

    def test_simulated_data_is_marked_in_both_reports_and_not_called_the_patients(self):
        summ = {**self.s.summary(14, NOW), "simulated": True}
        h = report.handover(summ, now=NOW)
        self.assertIn('<div class="box alert"><b class="flag">SIMULATED DATA.</b>', h)
        self.assertIn("generated 2027-01-15 08:00 UTC · simulated demo data", h)
        self.assertNotIn("printed by the patient", h)
        self.assertNotIn("Shared by the patient", h)
        self.assertIn("item 9 answered above 0", h)
        week = report.patient(summ)
        self.assertIn("SIMULATED DATA.", week)
        self.assertIn('<a href="handover?demo=1">', week)

    def test_patient_report_is_plain_and_has_support(self):
        h = report.patient(self.s.summary(14, NOW))
        self.assertIn("lower than the week before.", h)
        self.assertIn("Your resting pulse was around", h)
        self.assertIn("Your breathing rate was around", h)
        self.assertIn("90101", h)
        self.assertIn('<a href="handover">Report for my doctor</a>', h)
        self.assertNotIn("SIMULATED", h)
        for word in ("stress", "strain", "illness", "sign of"):     # numbers only: no reading of what HRV means
            self.assertNotIn(word, h.lower())


class Grounding(unittest.TestCase):
    def setUp(self):
        import grounding
        self.g = grounding
        s = Store()
        fill(s, random.Random(4))
        s.add_phq9([2, 2, 1, 2, 1, 1, 1, 0, 1], NOW - DAY)
        self.facts = grounding.build_facts(s.summary(14, NOW))
        self.text = grounding.facts_text(self.facts)

    def test_facts_cover_the_report(self):
        labels = [k for k, _ in self.facts]
        for want in ("P", "C", "F", "Q1", "T:hrv_rmssd", "T:finger_bpm", "T:breathing"):
            self.assertIn(want, labels)
        self.assertIn("YES", dict(self.facts)["F"])

    def test_grounded_answer_passes(self):
        hrv = dict(self.facts)["T:hrv_rmssd"]
        prev, last = hrv.split("previous 7 days ")[1].split(" ")[0], hrv.split("last 7 days ")[1].split(" ")[0]
        ans = f"HRV fell from {prev} ms to {last} ms [T:hrv_rmssd]. PHQ-9 item 9 was above 0 [F]."
        r = self.g.check(ans, self.facts)
        self.assertTrue(r["grounded"], r)
        self.assertEqual(r["sources"], ["F", "T:hrv_rmssd"])

    def test_invented_number_and_label_are_flagged(self):
        r = self.g.check("HRV fell by 42.7 ms [T:hrv_rmssd], see also [X:made_up].", self.facts)
        self.assertFalse(r["grounded"])
        self.assertIn(42.7, r["unsupported_numbers"])
        self.assertEqual(r["unknown_labels"], ["X:made_up"])

    def test_refusal_counts_as_grounded(self):
        self.assertTrue(self.g.check("The data doesn't show that.", self.facts)["grounded"])


    def test_number_from_another_fact_is_flagged(self):
        daily = [v for k, v in self.facts if k.startswith("D:")][3]
        some_daily_hrv = daily.split("hrv (rmssd) ")[1].split(" ")[0]
        r = self.g.check(f"HRV fell to {some_daily_hrv} ms [T:hrv_rmssd].", self.facts)
        if some_daily_hrv not in dict(self.facts)["T:hrv_rmssd"]:
            self.assertFalse(r["grounded"], "a daily value cited as the trend must be flagged")

    def test_item9_is_surfaced_deterministically(self):
        s = Store()
        s.add_phq9([2, 2, 1, 2, 1, 1, 1, 0, 1], NOW - DAY)
        note = self.g.safety_note(s.summary(14, NOW))
        self.assertIn("item 9", note)
        self.assertIn("[F, Q1]", note)
        self.assertIsNone(self.g.safety_note(Store().summary(14, NOW)))


    def test_unmeasured_topic_keeps_the_refusal(self):
        """'How did the patient sleep?' must stay 'doesn't show', not dump every fact (seen on the Jetson)"""
        import json as _j
        calls = []
        orig = self.g._chat
        self.g._chat = lambda url, system, msgs, timeout: calls.append(1) or "The data doesn't show that."
        try:
            s = Store()
            fill(s, random.Random(5))
            r = self.g.ask("How did the patient sleep?", s.summary(14, NOW))
            self.assertEqual(r["mode"], "llm")
            self.assertIn("doesn't show", r["answer"])
            r2 = self.g.ask("How much did the patient smile?", s.summary(14, NOW))
            self.assertEqual(len(calls), 2)
        finally:
            self.g._chat = orig


    def test_wrong_direction_is_flagged(self):
        hrv = dict(self.facts)["T:hrv_rmssd"]
        prev, last = hrv.split("previous 7 days ")[1].split(" ")[0], hrv.split("last 7 days ")[1].split(" ")[0]
        bad = self.g.check(f"HRV increased from {prev} ms to {last} ms [T:hrv_rmssd].", self.facts)
        self.assertFalse(bad["grounded"])
        self.assertTrue(bad["wrong_direction"])
        good = self.g.check(f"HRV decreased from {prev} ms to {last} ms [T:hrv_rmssd].", self.facts)
        self.assertTrue(good["grounded"], good)
        # without 'from..to': judged against the sign of the cited trend
        self.assertFalse(self.g.check("HRV went up over the period [T:hrv_rmssd].", self.facts)["grounded"])
        self.assertTrue(self.g.check("HRV went down over the period [T:hrv_rmssd].", self.facts)["grounded"])
        self.assertTrue(self.g.check("Resting pulse rose [T:finger_bpm].", self.facts)["grounded"])


    def test_judgement_words_are_flagged(self):
        r = self.g.check("Resting pulse showed a significant increase [T:finger_bpm].", self.facts)
        self.assertFalse(r["grounded"])
        self.assertEqual(r["judgement_words"], ["significant"])
        q = dict(self.facts)["Q1"]
        self.assertTrue(self.g.check(f"{q} [Q1].", self.facts)["grounded"])   # PHQ-9 bands are facts


    def test_single_day_still_shows_latest_values(self):
        s = Store()
        for k in range(100):
            s.add_reading("finger_bpm", 72, NOW - 3600 + k * 5)
            s.add_reading("hrv_rmssd", 45.5, NOW - 3600 + k * 5)
        h = report.handover(s.summary(7, NOW))
        self.assertIn("72 BPM", h)
        self.assertIn("45.5 ms", h)


class FHIR(unittest.TestCase):
    def test_bundle_structure_and_codes(self):
        import fhir
        s = Store()
        fill(s, random.Random(6))
        s.add_phq9([2, 2, 1, 2, 1, 1, 1, 0, 1], NOW - DAY)
        b = fhir.bundle(s.summary(14, NOW))
        self.assertEqual(b["resourceType"], "Bundle")
        self.assertEqual(b["type"], "collection")
        res = [e["resource"] for e in b["entry"]]
        self.assertEqual(res[0]["resourceType"], "Patient")
        refs = {e["fullUrl"] for e in b["entry"]}
        codes = {}
        for r in res:
            if r["resourceType"] != "Observation":
                continue
            self.assertIn(r["subject"]["reference"], refs)          # every reference resolves in the bundle
            c = r["code"]["coding"][0]["code"]
            codes[c] = codes.get(c, 0) + 1
        self.assertEqual(codes["40443-4"], 14)                       # resting HR, one per day
        self.assertEqual(codes["9279-1"], 14)                        # respiratory rate
        self.assertEqual(codes["hrv-rmssd"], 14)
        phq = [r for r in res if r.get("code", {}).get("coding", [{}])[0].get("code") == "44261-6"]
        self.assertEqual(phq[0]["valueInteger"], 11)
        self.assertEqual(len(phq[0]["component"]), 9)
        self.assertEqual(phq[0]["component"][8]["code"]["coding"][0]["code"], "44260-8")
        self.assertIn("assess risk", phq[0]["note"][0]["text"])
        self.assertFalse(any("meta" in r for r in [b] + res))        # a real person's data carries no test label

    def test_simulated_bundle_is_labelled_as_test_data_on_every_resource(self):
        import fhir
        s = Store()
        fill(s, random.Random(6))
        s.add_phq9([2, 2, 1, 2, 1, 1, 1, 0, 1], NOW - DAY)
        b = fhir.bundle({**s.summary(14, NOW), "simulated": True})
        res = [e["resource"] for e in b["entry"]]
        self.assertEqual(len(res), 2 + 3 * 14 + 1)
        for r in [b] + res:
            self.assertEqual(r["meta"]["security"], [{"system": "http://terminology.hl7.org/CodeSystem/v3-ActReason",
                                                      "code": "HTEST", "display": "test health data"}], r["resourceType"])
        self.assertIn("simulated demo patient, not a real person", res[0]["text"]["div"])


if __name__ == "__main__":
    unittest.main()
