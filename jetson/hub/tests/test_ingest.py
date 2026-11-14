"""Nothing a client writes, and nothing already stored, may take the clinician's reads down.

Three layers, each tested here through the real Handler (see test_auth.py):
  1. ingest   bad values are refused (400) or stored as missing, so they never reach a report
  2. read     rows an older hub already stored (bad timestamp, non-numeric metric) are left out and
              counted, instead of raising inside Store.summary()
  3. handler  whatever still goes wrong is answered with a 500, never with a dropped connection

    cd jetson/hub && python3 -m unittest discover tests -v
"""
import contextlib
import http.client
import io
import json
import os
import sqlite3
import sys
import threading
import time
import unittest
from http.server import ThreadingHTTPServer

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import app  # noqa: E402
from store import Store  # noqa: E402
from test_auth import READS, HubCase, Response, _Sock, call, rows  # noqa: E402
from test_hub import DAY, NOW  # noqa: E402

ALERT = b"PHQ-9 item 9 answered above 0"            # the item-9 box in the clinician report
ZEROS = [0] * 9


def send(method, target, token=None, raw=b"", headers=None):
    """like test_auth.call, but with the request target and the body exactly as given"""
    headers = dict(headers or {})
    if token is not None:
        headers["Authorization"] = f"Bearer {token}"
    if method == "POST":
        headers.setdefault("Content-Length", str(len(raw)))
    head = "\r\n".join([f"{method} {target} HTTP/1.1", "Host: hub"] + [f"{k}: {v}" for k, v in headers.items()])
    sock = _Sock(head.encode() + b"\r\n\r\n" + raw)
    app.Handler(sock, ("127.0.0.1", 0), None)
    return Response(sock.out.getvalue())


def strict(body):
    """parse as JSON the way a strict client does: NaN / Infinity are not JSON"""
    def refuse(name):
        raise AssertionError(f"{name} in a JSON answer")
    return json.loads(body, parse_constant=refuse)


class ReadsCase(HubCase):
    def assertReadsWork(self):
        """every clinician read answers, the 27/27 entry with item 9 = 3 from real_store() is still
        there with its alert, and the JSON answers are strict JSON"""
        for method, path in READS:
            r = call(method, path, token=self.C)
            self.assertEqual(r.status, 200, path)
        page = call("GET", "/report/clinician", token=self.C).body
        self.assertIn(ALERT, page)
        self.assertIn(b"27/27", page)
        summ = strict(call("GET", "/summary", token=self.C).body)
        self.assertTrue(summ["phq9_item9_flag"])
        strict(call("GET", "/fhir", token=self.C).body)
        ask = call("POST", "/ask", token=self.C, body={"question": "Summarise this period"})
        self.assertEqual(ask.status, 200)
        self.assertIn("item 9", strict(ask.body)["safety"])
        return summ


class BadWrites(ReadsCase):
    """the reviewer's cases: each used to be stored with 201 and then break every read"""

    def test_nan_and_infinity_are_not_json(self):
        before = rows(app.store)
        for raw in (b'{"summary":{"smileShare":NaN}}', b'{"summary":{"smileShare":Infinity}}',
                    b'{"summary":{"smileShare":-Infinity}}', b'{"summary":{"smileShare":1e999}}',
                    b'{"summary":{"seconds":60},"ts":NaN}', b'{"summary":{"seconds":60},"ts":1e999}',
                    b'{"summary":{"seconds":60},"note":[1,{"x":-1e999}]}'):
            r = send("POST", "/sessions", self.P, raw)
            self.assertEqual((r.status, r.json()), (400, {"error": "invalid JSON"}), raw)
        r = send("POST", "/phq9", self.P, b'{"answers":[0,0,0,0,0,0,0,0,0],"ts":Infinity}')
        self.assertEqual(r.status, 400)
        for raw in (b'{"question":"Summarise this period","days":1e999}', b'{"question":"Summarise this period","days":NaN}'):
            self.assertEqual(send("POST", "/ask", self.C, raw).status, 400, raw)
        self.assertEqual(rows(app.store), before)
        self.assertReadsWork()

    def test_metric_that_is_not_a_usable_number_is_stored_as_missing(self):
        bad = ["0.4", [0.4], {"v": 0.4}, True, None, 1e300, -1e300, 10 ** 400]
        for v in bad:
            r = call("POST", "/sessions", token=self.P,
                     body={"summary": {"smileShare": v, "expressivity": 0.2, "blinksPerMinute": v, "seconds": 60},
                           "cameraPulse": {"bpm": v, "trust": v}, "breathing": {"perMinute": 14, "snr": v},
                           "events": [{"duration": v}, {"duration": 0.3}, {}]})
            self.assertEqual(r.status, 201, repr(v)[:20])
        stored = app.store.sessions()
        self.assertEqual(len(stored), len(bad))
        for s in stored:
            self.assertIsNone(s["smileShare"])
            self.assertIsNone(s["blinksPerMinute"])
            self.assertIsNone(s["camera_bpm"])
            self.assertIsNone(s["camera_trust"])
            self.assertIsNone(s["breathing_head"])
            self.assertEqual(s["expressivity"], 0.2)
            self.assertEqual(s["micro_expressions"], 1)             # only the event with a usable duration <= 0.5 s
        summ = self.assertReadsWork()
        self.assertIsNone(summ["behaviour"]["smile_share"])
        self.assertEqual(summ["behaviour"]["expressivity"], 0.2)
        self.assertEqual(summ["coverage"]["sessions"], len(bad))

    def test_good_values_are_still_stored_as_sent(self):
        r = call("POST", "/sessions", token=self.P,
                 body={"summary": {"smileShare": 0.25, "expressivity": 0, "blinksPerMinute": 12, "seconds": 60.5},
                       "cameraPulse": {"bpm": 71, "trust": 78}, "breathing": {"perMinute": 14.5, "snr": 2}})
        self.assertEqual(r.status, 201)
        s = app.store.sessions()[0]
        self.assertEqual((s["smileShare"], s["expressivity"], s["blinksPerMinute"], s["seconds"]), (0.25, 0, 12, 60.5))
        self.assertEqual((s["camera_bpm"], s["camera_trust"], s["breathing_head"]), (71, 78, 14.5))

    def test_timestamp_must_be_unix_seconds_and_not_in_the_future(self):
        now = time.time()
        before = rows(app.store)
        bad = [now * 1000, int(now * 1000), str(now), "yesterday", [now], {"t": now}, True, False, 0, -5, -now,
               now + 2 * DAY, 4102444800, 10 ** 400]
        for path, body in (("/sessions", {"summary": {"seconds": 60}}), ("/phq9", {"answers": ZEROS})):
            for ts in bad:
                r = call("POST", path, token=self.P, body={**body, "ts": ts})
                self.assertEqual(r.status, 400, (path, repr(ts)[:30]))
                self.assertIn("ts ", r.json()["error"])
        self.assertEqual(rows(app.store), before)
        self.assertReadsWork()
        for ts in (now - 3600, int(now) - 7200, now + 3600, None):         # a phone clock a little ahead is fine
            self.assertEqual(call("POST", "/sessions", token=self.P, body={"summary": {"seconds": 60}, "ts": ts}).status, 201)
            self.assertEqual(call("POST", "/phq9", token=self.P, body={"answers": ZEROS, "ts": ts}).status, 201)
        after = rows(app.store)
        self.assertEqual((after["sessions"], after["phq9"]), (before["sessions"] + 4, before["phq9"] + 4))
        self.assertEqual(self.assertReadsWork()["coverage"]["phq9_entries"], 5)

    def test_wrong_shapes_are_refused(self):
        before = rows(app.store)
        for body in ({"summary": "x"}, {"summary": [1]}, {"summary": 5}, {"events": [1]}, {"events": ["x"]},
                     {"events": "x"}, {"events": {"duration": 0.3}}, {"events": [{"duration": 0.3}, None]},
                     {"cameraPulse": "x"}, {"cameraPulse": [71]}, {"breathing": [1]}, {"breathing": 14}):
            r = call("POST", "/sessions", token=self.P, body=body)
            self.assertEqual(r.status, 400, body)
            self.assertIn("must be", r.json()["error"])
        for answers in (5, None, "000000000", {"a": 1}, [True] * 9, [1.0] * 9, [[0]] * 9, ["1"] * 9, [0] * 8, [0] * 10,
                        [0] * 8 + [4], [0] * 8 + [-1]):
            r = call("POST", "/phq9", token=self.P, body={"answers": answers})
            self.assertEqual((r.status, r.json()), (400, {"error": "PHQ-9 needs 9 answers in 0..3"}), answers)
        self.assertEqual(call("POST", "/phq9", token=self.P, body={}).status, 400)
        for raw in (b"[1]", b'"x"', b"5", b"null", b"{", b"\xff\xfe", b'{"a":' + b"[" * 100000):
            self.assertEqual(send("POST", "/sessions", self.P, raw).status, 400, raw[:12])
        self.assertEqual(rows(app.store), before)
        self.assertReadsWork()

    def test_absent_or_null_parts_are_fine(self):
        for body in ({}, {"summary": None}, {"summary": {}}, {"events": None, "cameraPulse": None, "breathing": None},
                     {"smileShare": 0.5, "seconds": 60}):                   # the last one: a bare summary
            self.assertEqual(call("POST", "/sessions", token=self.P, body=body).status, 201, body)
        self.assertEqual(app.store.sessions()[-1]["smileShare"], 0.5)
        self.assertReadsWork()

    def test_days_must_be_a_number(self):
        for days in ("abc", [1], {"d": 1}, None):
            r = call("POST", "/ask", token=self.C, body={"question": "Summarise this period", "days": days})
            self.assertEqual((r.status, r.json()), (400, {"error": "days must be a number"}), days)
        for days in (7, "7", 7.9, 0, -3, 10 ** 30):                          # clamped to 1..90 as before
            r = call("POST", "/ask", token=self.C, body={"question": "Summarise this period", "days": days})
            self.assertEqual(r.status, 200, days)
        for q in ("nan", "inf", "1e999", "", "9" * 5000, "%5B1%5D"):
            self.assertEqual(call("GET", f"/summary?days={q}", token=self.C).status, 400, q[:10])


class StoredBefore(ReadsCase):
    """rows as the hub stored them before `ts` and the metrics were validated; there is no delete
    route, so the reads have to live with them"""

    def setUp(self):
        super().setUp()
        now = time.time()
        db = app.store.db
        ok = json.dumps({"smileShare": 0.5, "expressivity": 0.1, "micro_expressions": 2})
        odd = ('{"smileShare": NaN, "expressivity": Infinity, "blinksPerMinute": "12", "gazeAwayShare": [1], '
               '"micro_expressions": true, "seconds": 1e300}')
        for ts, metrics in ((now * 1000, ok), ("yesterday", ok), (float("inf"), ok), (now - 3600, odd), (now - 7200, ok)):
            db.execute("INSERT INTO sessions (ts, kind, metrics, raw) VALUES (?,?,?,?)", (ts, "expressions", metrics, "{}"))
        for ts in (now * 1000, "yesterday"):
            db.execute("INSERT INTO phq9 (ts, answers, score, item9) VALUES (?,?,?,?)", (ts, json.dumps([1] * 9), 9, 1))
        db.commit()

    def test_reads_survive_and_say_what_was_left_out(self):
        summ = self.assertReadsWork()
        self.assertEqual(summ["coverage"]["sessions"], 2)                 # the two with a readable timestamp
        self.assertEqual(summ["coverage"]["phq9_entries"], 1)
        self.assertEqual(summ["unreadable"], {"sessions": 3, "phq9": 2, "phq9_item9": 2})
        self.assertEqual(summ["behaviour"]["smile_share"], 0.5)           # NaN left out of the average
        self.assertEqual(summ["behaviour"]["expressivity"], 0.1)
        self.assertIsNone(summ["behaviour"]["blinks_per_min"])
        self.assertIsNone(summ["behaviour"]["gaze_away_share"])
        self.assertEqual(summ["behaviour"]["micro_expressions_per_session"], 2)
        page = call("GET", "/report/clinician", token=self.C).body
        self.assertIn(b"5 stored entries have a timestamp that cannot be read", page)
        self.assertIn(b"app sessions 3, PHQ-9 entries 2", page)
        self.assertIn(b"PHQ-9 item 9 is above 0 in 2 of those PHQ-9 entries", page)
        for days in (1, 90):
            self.assertEqual(call("GET", f"/report/clinician?days={days}", token=self.C).status, 200)

    def test_item9_in_an_entry_without_a_readable_date_is_still_raised(self):
        """the only item 9 above 0 is in an entry that no period contains: nobody may miss it"""
        app.store.db.execute("DELETE FROM phq9 WHERE typeof(ts)='real' AND ts < 4102444800")       # drop the dated 27/27
        app.store.db.commit()
        summ = strict(call("GET", "/summary", token=self.C).body)
        self.assertEqual((summ["phq9"], summ["phq9_item9_flag"]), ([], False))
        self.assertEqual(summ["unreadable"]["phq9_item9"], 2)
        page = call("GET", "/report/clinician", token=self.C).body
        self.assertNotIn(ALERT, page)
        self.assertIn(b'<div class="box alert"><b>5 stored entries have a timestamp that cannot be read</b>', page)
        self.assertIn(b"Please assess risk", page)
        for question in ("Summarise this period", "How did the patient sleep?", "Does the patient have depression?"):
            answer = call("POST", "/ask", token=self.C, body={"question": question}).json()
            self.assertIn("item 9 is above 0 in 2 stored PHQ-9 entries whose date cannot be read", answer["safety"])
            self.assertTrue(answer["answer"].startswith("Safety:"))
        self.assertIn(b"You don't have to handle this alone", call("GET", "/report/patient", token=self.P).body)

    def test_a_clean_store_reports_nothing_left_out(self):
        app.store.db.close()
        app.store = Store()
        summ = strict(call("GET", "/summary", token=self.C).body)
        self.assertEqual(summ["unreadable"], {"sessions": 0, "phq9": 0, "phq9_item9": 0})
        self.assertNotIn(b"cannot be read", call("GET", "/report/clinician", token=self.C).body)
        self.assertNotIn("safety", call("POST", "/ask", token=self.C, body={"question": "Summarise this period"}).json())
        self.assertNotIn(b"handle this alone", call("GET", "/report/patient", token=self.P).body)


class StoreIngest(unittest.TestCase):
    def test_readings_that_are_not_usable_numbers_are_dropped(self):
        s = Store()
        for v in (float("nan"), float("inf"), float("-inf"), 1e300, None, "x", [70], {"bpm": 70}, 10 ** 400):
            s.add_reading("finger_bpm", v, NOW - 3600)
        self.assertEqual(s.readings("finger_bpm"), [])
        for k in range(12):
            s.add_reading("finger_bpm", 70 + k, NOW - 3600 + k * 5)
        self.assertEqual(s.summary(14, NOW)["daily"][-1]["finger_bpm"], 70)

    def test_stored_infinite_reading_does_not_break_the_day(self):
        s = Store()
        for k in range(12):
            s.add_reading("finger_bpm", 70, NOW - 3600 + k * 5)
        s.db.execute("INSERT INTO readings VALUES (?,?,?,?)", (NOW - 1800, "finger_bpm", float("inf"), "uno-q"))
        s.db.execute("INSERT INTO readings VALUES (?,?,?,?)", (NOW - 1700, "finger_bpm", float("-inf"), "uno-q"))
        s.db.commit()
        self.assertEqual(s.summary(14, NOW)["daily"][-1]["finger_bpm"], 70)

    def test_store_refuses_what_the_api_refuses(self):
        s = Store()
        for ts in (NOW * 1000, "x", [NOW], True, 0, -1, float("nan"), float("inf")):
            with self.assertRaises(ValueError):
                s.add_phq9(ZEROS, ts)
            with self.assertRaises(ValueError):
                s.add_session({"summary": {"seconds": 60}}, ts)
        for doc in ({"summary": "x"}, {"events": [1]}, {"cameraPulse": "x"}, "x", None, [1]):
            with self.assertRaises(ValueError):
                s.add_session(doc)
        for answers in ([True] * 9, [1.0] * 9, 5, None):
            with self.assertRaises(ValueError):
                s.add_phq9(answers)
        self.assertEqual(rows(s), {"readings": 0, "sessions": 0, "phq9": 0})
        s.add_phq9(tuple(ZEROS), NOW - DAY)                                  # a fixed test clock ahead of today is fine here
        s.add_session({"summary": {"smileShare": float("nan"), "seconds": 60}}, NOW - DAY)
        self.assertIsNone(s.sessions()[0]["smileShare"])


class LastResort(HubCase):
    """a failure nobody foresaw is answered, logged without the request's contents, and stores nothing"""

    def setUp(self):
        super().setUp()

        def boom(*_, **__):
            raise RuntimeError("row 17: secret-detail")
        self.boom = boom

    def logged(self, fn):
        out, err = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            r = fn()
        return r, out.getvalue() + err.getvalue()

    def test_failing_read_is_a_500_not_a_dropped_connection(self):
        app.store.summary = self.boom
        for method, path in READS:
            r, log = self.logged(lambda: call(method, path + "?days=14&x=query-marker", token=self.C,
                                               body={"question": "Summarise this period"}))
            self.assertEqual(r.status, 500, path)
            self.assertNotIn(b"secret-detail", r.body)
            if path.startswith("/report/"):
                self.assertTrue(r.headers["Content-Type"].startswith("text/html"))
                self.assertIn(b"could not be built", r.body)
            else:
                self.assertEqual(r.json(), {"error": "internal error"})
            self.assertEqual(r.headers["Cache-Control"], "no-store")
            self.assertIn(f"{method} {path}: RuntimeError", log)
            for secret in ("secret-detail", "query-marker", self.C):
                self.assertNotIn(secret, log)

    def test_failing_write_is_a_500(self):
        def locked(*_, **__):
            raise sqlite3.OperationalError("database is locked")
        app.store.add_session = app.store.add_phq9 = locked
        for path in ("/sessions", "/phq9"):
            r, log = self.logged(lambda: call("POST", path, token=self.P))
            self.assertEqual((r.status, r.json()), (500, {"error": "internal error"}), path)
            self.assertIn("OperationalError", log)
            self.assertNotIn(self.P, log)

    def test_internal_type_error_is_not_reported_as_bad_input(self):
        def broken(*_, **__):
            raise TypeError("unsupported operand: secret-detail")
        app.store.summary = broken
        r, _ = self.logged(lambda: call("POST", "/ask", token=self.C, body={"question": "Summarise this period"}))
        self.assertEqual((r.status, r.json()), (500, {"error": "internal error"}))

    def test_failure_before_the_token_check_gives_nothing_away(self):
        saved = app.auth.role_for
        app.auth.role_for = self.boom
        try:
            r, _ = self.logged(lambda: call("GET", "/summary", token=self.C))
        finally:
            app.auth.role_for = saved
        self.assertEqual((r.status, r.json()), (500, {"error": "internal error"}))
        self.assertNoRealData(r)

    def test_unparseable_target_and_content_length(self):
        for target in ("//[", "//[::1/summary", "/summary?x=[", "http://[", "http://[/summary"):
            r = send("GET", target)                                              # no token: used to drop the connection
            self.assertIn(r.status, (400, 401, 404), target)
        self.assertEqual(send("GET", "http://[/summary").json(), {"error": "bad request"})
        self.assertEqual(send("POST", "/sessions", self.P, b"{}", {"Content-Length": "-1"}).status, 400)
        self.assertEqual(send("POST", "/sessions", self.P, b"{}", {"Content-Length": "x"}).status, 400)
        self.assertEqual(rows(app.store)["sessions"], 0)


class OverTheWire(ReadsCase):
    """the same over a real socket (skipped where a port cannot be opened, e.g. a sandbox)"""

    def test_bad_writes_and_internal_failures_are_answered(self):
        try:
            server = ThreadingHTTPServer(("127.0.0.1", 0), app.Handler)
        except OSError as e:
            self.skipTest(f"cannot bind a loopback port here: {e}")
        threading.Thread(target=server.serve_forever, daemon=True).start()
        try:
            def req(method, path, token, raw=None):
                c = http.client.HTTPConnection("127.0.0.1", server.server_address[1], timeout=10)
                c.request(method, path, body=raw, headers={"Authorization": f"Bearer {token}"})
                r = c.getresponse()
                out = (r.status, r.read())
                c.close()
                return out
            ms = str(time.time() * 1000).encode()
            for path, raw in (("/sessions", b'{"summary":{"smileShare":NaN}}'), ("/sessions", b'{"summary":{"smileShare":1e999}}'),
                              ("/sessions", b'{"summary":{"seconds":60},"ts":' + ms + b"}"), ("/sessions", b'{"summary":"x"}'),
                              ("/phq9", b'{"answers":[0,0,0,0,0,0,0,0,1],"ts":"yesterday"}'),
                              ("/phq9", b'{"answers":[0,0,0,0,0,0,0,0,1],"ts":' + ms + b"}")):
                self.assertEqual(req("POST", path, self.P, raw)[0], 400, raw)
            self.assertEqual(req("POST", "/sessions", self.P, b'{"summary":{"smileShare":"0.4","seconds":60}}')[0], 201)
            for path in ("/summary", "/report/clinician", "/report/patient", "/fhir"):
                self.assertEqual(req("GET", path, self.C)[0], 200, path)
            status, page = req("GET", "/report/clinician", self.C)
            self.assertIn(ALERT, page)

            def boom(*_, **__):
                raise RuntimeError("secret-detail")
            app.store.summary = boom
            with contextlib.redirect_stdout(io.StringIO()):
                for path in ("/summary", "/report/clinician", "/fhir"):
                    status, body = req("GET", path, self.C)
                    self.assertEqual(status, 500, path)
                    self.assertNotIn(b"secret-detail", body)
                status, body = req("POST", "/ask", self.C, json.dumps({"question": "Summarise", "pad": "x" * 2_000_000}).encode())
                self.assertEqual((status, json.loads(body)), (500, {"error": "internal error"}))
                saved, app.auth.role_for = app.auth.role_for, boom            # fails before the 2 MB body is read
                try:
                    status, body = req("POST", "/sessions", self.P, json.dumps({"frames": ["x" * 1000] * 2000}).encode())
                finally:
                    app.auth.role_for = saved
                self.assertEqual((status, json.loads(body)), (500, {"error": "internal error"}))
        finally:
            server.shutdown()
            server.server_close()


if __name__ == "__main__":
    unittest.main()
