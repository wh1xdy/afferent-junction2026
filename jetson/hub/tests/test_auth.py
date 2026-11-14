"""Access control: the hub is the patient's alone. One token, the browser cookie, demo isolation,
and that nothing is left of the clinician token or the chatbot.

The requests go through the real Handler (request bytes in, response bytes out), so no port is
needed; one extra test does the same over a real loopback socket and is skipped where binding a
port is not allowed.

    cd jetson/hub && python3 -m unittest discover tests -v
"""
import contextlib
import http.client
import io
import json
import os
import secrets
import stat
import sys
import tempfile
import threading
import time
import unittest
from http.server import ThreadingHTTPServer

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import app  # noqa: E402
import auth  # noqa: E402
import grounding  # noqa: E402
from store import Store, day  # noqa: E402
from test_hub import DAY  # noqa: E402

READS = [("GET", "/summary"), ("GET", "/report/handover"), ("GET", "/report/patient"), ("GET", "/fhir")]
WRITES = [("POST", "/sessions"), ("POST", "/phq9")]
GONE = [("POST", "/ask"), ("GET", "/report/clinician")]            # the chatbot and the doctor's own page
BODIES = {"/ask": {"question": "Summarise this period"},
          "/sessions": {"summary": {"smileShare": 0.5, "seconds": 60}},
          "/phq9": {"answers": [0, 0, 0, 0, 0, 0, 0, 0, 0]}}
# values that exist only in the "real" database of these tests (the demo patient scores 6 and 11, pulse 60-75)
REAL_MARKERS = (b'"score": 27', b"27/27", b"severe", b'"valueInteger": 27',
                b'"finger_bpm": 111', b"111 BPM", b'"value": 111')
PRINTED_BY = b"printed by the patient from their own device"
SIMULATED = b"SIMULATED DATA"


class _Sock:
    """just enough of a socket for BaseHTTPRequestHandler and HTTPResponse"""

    def __init__(self, data):
        self.inp, self.out = io.BytesIO(data), io.BytesIO()

    def makefile(self, *_, **__):
        return self.inp

    def sendall(self, data):
        self.out.write(data)


class Response:
    def __init__(self, raw):
        r = http.client.HTTPResponse(_Sock(raw))
        r.begin()
        self.status, self.headers, self.body = r.status, r.headers, r.read()

    def json(self):
        return json.loads(self.body)


def call(method, path, token=None, body=None, headers=None):
    headers = dict(headers or {})
    if token is not None:
        headers["Authorization"] = f"Bearer {token}"
    if method == "POST":
        raw = json.dumps(BODIES[path.split("?")[0]] if body is None else body).encode()
        headers["Content-Length"] = str(len(raw))
    else:
        raw = b""
    head = "\r\n".join([f"{method} {path} HTTP/1.1", "Host: hub"] + [f"{k}: {v}" for k, v in headers.items()])
    sock = _Sock(head.encode() + b"\r\n\r\n" + raw)
    app.Handler(sock, ("127.0.0.1", 0), None)
    return Response(sock.out.getvalue())


def real_store():
    s = Store()
    now = time.time()
    s.add_phq9([3] * 9, now - DAY)                               # 27/27, severe
    for k in range(60):
        s.add_reading("finger_bpm", 111, now - 3600 + k * 5)
    return s


def rows(s):
    return {t: s.db.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0] for t in ("readings", "sessions", "phq9")}


class Tripwire:
    """stands in for the real database: any use at all fails the test"""

    def __getattr__(self, name):
        raise AssertionError(f"the real database was touched ({name})")


class HubCase(unittest.TestCase):
    def setUp(self):
        self.saved = (app.store, app.token, grounding._chat)
        self.P = secrets.token_urlsafe(32)
        app.store = real_store()
        app.token = self.P
        self.llm_calls = []
        grounding._chat = lambda url, system, msgs, timeout: self.llm_calls.append(1) or "The data doesn't show that."

    def tearDown(self):
        if isinstance(app.store, Store):
            app.store.db.close()
        app.store, app.token, grounding._chat = self.saved
        self.assertEqual(self.llm_calls, [], "a request reached the language model")

    def assertNoRealData(self, r):
        for m in REAL_MARKERS:
            self.assertNotIn(m, r.body, f"real data leaked: {m!r}")


class PatientOnly(HubCase):
    def test_no_token_is_401_everywhere(self):
        before = rows(app.store)
        for method, path in READS + WRITES:
            r = call(method, path)
            self.assertEqual(r.status, 401, path)
            self.assertEqual(r.headers["WWW-Authenticate"], "Bearer")
            self.assertNoRealData(r)
            if path.startswith("/report/"):
                self.assertTrue(r.headers["Content-Type"].startswith("text/html"))
                self.assertIn(b"Access token needed", r.body)
                self.assertLess(len(r.body), 800)
            else:
                self.assertEqual(r.json(), {"error": "token required"})
        self.assertEqual(rows(app.store), before)

    def test_wrong_token_is_401(self):
        before = rows(app.store)
        wrong = [secrets.token_urlsafe(32), self.P + "x", self.P[:-1], self.P.upper(), "", " "]
        for method, path in READS + WRITES:
            for t in wrong:
                r = call(method, path, token=t)
                self.assertEqual(r.status, 401, (path, t))
                self.assertNoRealData(r)
                if not path.startswith("/report/"):
                    self.assertEqual(r.json(), {"error": "invalid token"})
            for header in (f"Basic {self.P}", self.P, f"Token {self.P}"):      # only the Bearer scheme counts
                self.assertEqual(call(method, path, headers={"Authorization": header}).status, 401, (path, header))
        self.assertEqual(rows(app.store), before)

    def test_a_hub_without_a_token_lets_nobody_in(self):
        app.token = ""
        for t in (None, "", " ", "x"):
            for method, path in READS + WRITES:
                self.assertEqual(call(method, path, token=t).status, 401, (path, t))
        self.assertEqual(call("GET", "/report/handover?token=").status, 401)

    def test_patient_reads_and_writes(self):
        for method, path in READS:
            r = call(method, path, token=self.P)
            self.assertEqual(r.status, 200, path)
            self.assertEqual(r.headers["Cache-Control"], "no-store")
        self.assertEqual(call("GET", "/summary", token=self.P).json()["phq9"][0]["score"], 27)
        self.assertIn(b"27/27", call("GET", "/report/handover", token=self.P).body)
        self.assertIn(b'"valueInteger": 27', call("GET", "/fhir", token=self.P).body)
        before = rows(app.store)
        self.assertEqual(call("POST", "/sessions", token=self.P).status, 201)
        self.assertEqual(call("POST", "/phq9", token=self.P).status, 201)
        after = rows(app.store)
        self.assertEqual((after["sessions"], after["phq9"]), (before["sessions"] + 1, before["phq9"] + 1))
        self.assertEqual(call("POST", "/phq9", token=self.P, body={"answers": [1, 2]}).status, 400)

    def test_scheme_is_case_insensitive(self):
        self.assertEqual(call("GET", "/summary", headers={"Authorization": f"bearer {self.P}"}).status, 200)

    def test_the_chatbot_and_the_clinician_page_are_gone(self):
        for method, path in GONE:
            for token in (None, self.P, "wrong"):
                for suffix in ("", "?demo=1"):
                    r = call(method, path + suffix, token=token)
                    self.assertEqual((r.status, r.json()), (404, {"error": "not found"}), (path, suffix, token))
                    self.assertNoRealData(r)

    def test_handover_report_says_who_shares_it_and_when(self):
        r = call("GET", "/report/handover", token=self.P)
        self.assertEqual(r.status, 200)
        self.assertIn(b"<title>Report for my doctor</title>", r.body)
        self.assertIn(b"<h1>Report for my doctor</h1>", r.body)
        self.assertIn(PRINTED_BY, r.body)
        self.assertIn(b"Shared by the patient", r.body)
        self.assertIn(b"The device sends nothing to anyone", r.body)
        self.assertIn(f"generated {day(time.time())} ".encode(), r.body)
        self.assertIn(b"<b>Summary</b>", r.body)
        self.assertIn(b"PHQ-9 item 9 answered above 0", r.body)
        self.assertNotIn(SIMULATED, r.body)
        self.assertNotIn(b"linician", r.body)
        for interactive in (b"<script", b"<form", b"<button", b"<input"):
            self.assertNotIn(interactive, r.body)

    def test_fhir_is_a_file_the_patient_downloads(self):
        r = call("GET", "/fhir", token=self.P)
        self.assertEqual(r.headers["Content-Disposition"], f'attachment; filename="afferent-fhir-{day(time.time())}.json"')
        self.assertTrue(r.headers["Content-Type"].startswith("application/fhir+json"))
        bundle = r.json()
        self.assertEqual(bundle["timestamp"][:10], day(time.time()))
        self.assertNotIn("meta", bundle)
        self.assertFalse(call("GET", "/summary", token=self.P).json()["simulated"])

    def test_unknown_route_and_bad_input(self):
        self.assertEqual(call("GET", "/nope").status, 404)
        self.assertEqual(call("GET", "/sessions", token=self.P).status, 404)
        self.assertEqual(call("GET", "/summary?days=abc", token=self.P).status, 400)
        self.assertEqual(call("POST", "/sessions", token=self.P, body=[1, 2]).status, 400)


class NoSecondRole(HubCase):
    """a hub that an older version ran on: its token file still names a clinician"""

    def setUp(self):
        super().setUp()
        self.dir = tempfile.TemporaryDirectory()
        self.path = os.path.join(self.dir.name, "hub-tokens.json")
        self.C = secrets.token_urlsafe(32)
        with open(self.path, "w") as f:
            json.dump({"patient": self.P, "clinician": self.C}, f)
        app.token = auth.load_token(self.path, env={}, log=lambda line: None)

    def tearDown(self):
        self.dir.cleanup()
        super().tearDown()

    def test_the_patient_token_still_works(self):
        self.assertEqual(app.token, self.P)
        for method, path in READS:
            self.assertEqual(call(method, path, token=self.P).status, 200, path)
        self.assertEqual(call("POST", "/phq9", token=self.P).status, 201)

    def test_the_old_clinician_token_opens_nothing(self):
        before = rows(app.store)
        for method, path in READS + WRITES + GONE:
            r = call(method, path, token=self.C)
            self.assertIn(r.status, (401, 404), path)
            self.assertEqual(r.status == 404, (method, path) in GONE, path)
            self.assertNoRealData(r)
        for path in ("/report/handover", "/report/patient"):
            r = call("GET", f"{path}?token={self.C}")
            self.assertEqual(r.status, 401, path)
            self.assertIsNone(r.headers["Set-Cookie"])
            cookie = {"Cookie": f"{auth.COOKIE}={auth.session_value(self.C)}"}        # a cookie the old hub gave out
            r = call("GET", path, headers=cookie)
            self.assertEqual(r.status, 401, path)
            self.assertNoRealData(r)
        self.assertEqual(call("GET", "/health", token=self.C).json(), {"ok": True})
        self.assertEqual(rows(app.store), before)

    def test_the_old_entry_is_dropped_from_the_file(self):
        self.assertEqual(json.load(open(self.path)), {"patient": self.P})
        self.assertEqual(stat.S_IMODE(os.stat(self.path).st_mode), 0o600)


class Health(HubCase):
    def test_health_without_the_patient_token_says_only_ok(self):
        app.collector["hub_url"] = "http://10.99.0.7:8080"
        try:
            for r in (call("GET", "/health"), call("GET", "/health", token="wrong"),
                      call("GET", "/health?token=" + self.P),                       # query tokens are for reports only
                      call("GET", "/health", headers={"Cookie": f"{auth.COOKIE}={auth.session_value(self.P)}"})):
                self.assertEqual(r.status, 200)
                self.assertEqual(r.json(), {"ok": True})
            d = call("GET", "/health", token=self.P).json()
            self.assertEqual(d["collector"]["hub_url"], "http://10.99.0.7:8080")
            self.assertEqual(sorted(d), ["collector", "ok"])                        # no language model to report on
        finally:
            app.collector["hub_url"] = None


class BrowserLink(HubCase):
    def cookie_of(self, r):
        return r.headers["Set-Cookie"].split(";")[0]

    def test_token_in_query_becomes_a_cookie_and_a_clean_url(self):
        r = call("GET", f"/report/handover?days=7&token={self.P}")
        self.assertEqual(r.status, 303)
        self.assertEqual(r.headers["Location"], "/report/handover?days=7")
        sc = r.headers["Set-Cookie"]
        self.assertIn("HttpOnly", sc)
        self.assertIn("SameSite=Lax", sc)
        self.assertIn("Path=/report", sc)
        self.assertNotIn(self.P, sc)                                  # the cookie is not the bearer token
        self.assertNotIn(self.P.encode(), r.body)
        self.assertNoRealData(r)
        page = call("GET", r.headers["Location"], headers={"Cookie": self.cookie_of(r)})
        self.assertEqual(page.status, 200)
        self.assertIn(b"27/27", page.body)
        self.assertNotIn(self.P.encode(), page.body)
        r = call("GET", f"/report/patient?token={self.P}")
        self.assertEqual((r.status, r.headers["Location"]), (303, "/report/patient"))

    def test_your_week_links_to_the_handover_report(self):
        cookie = {"Cookie": self.cookie_of(call("GET", f"/report/patient?token={self.P}"))}
        page = call("GET", "/report/patient", headers=cookie)
        self.assertIn(b'<a href="handover">Report for my doctor</a>', page.body)
        self.assertEqual(call("GET", "/report/handover", headers=cookie).status, 200)

    def test_wrong_query_token_is_401_html_without_a_cookie(self):
        for bad in ("nope", "", self.P + "x", f"{self.P}&token={self.P}"):
            r = call("GET", f"/report/handover?token={bad}")
            self.assertEqual(r.status, 401, bad)
            self.assertIsNone(r.headers["Set-Cookie"])
            self.assertIn(b"Access token needed", r.body)
            self.assertNoRealData(r)

    def test_cookie_and_query_token_work_on_the_html_reports_only(self):
        cookie = {"Cookie": self.cookie_of(call("GET", f"/report/handover?token={self.P}"))}
        before = rows(app.store)
        self.assertEqual(call("GET", "/report/patient", headers=cookie).status, 200)
        for method, path in (("GET", "/summary"), ("GET", "/fhir"), ("POST", "/sessions"), ("POST", "/phq9")):
            r = call(method, path, headers=cookie)
            self.assertEqual(r.status, 401, path)                    # a browser session can never write
            self.assertNoRealData(r)
            r = call(method, f"{path}?token={self.P}")
            self.assertEqual(r.status, 401, path)
            self.assertNoRealData(r)
        self.assertEqual(rows(app.store), before)

    def test_forged_or_stale_cookie_is_401(self):
        good = auth.session_value(self.P)
        for value in ("x", self.P, good[:-1] + ("0" if good[-1] != "0" else "1"), ""):
            r = call("GET", "/report/handover", headers={"Cookie": f"{auth.COOKIE}={value}"})
            self.assertEqual(r.status, 401, value)
            self.assertNoRealData(r)
        cookie = {"Cookie": f"{auth.COOKIE}={good}"}
        self.assertEqual(call("GET", "/report/handover", headers=cookie).status, 200)
        app.token = secrets.token_urlsafe(32)                         # token rotated
        self.assertEqual(call("GET", "/report/handover", headers=cookie).status, 401)

    def test_redirect_stays_on_the_hub(self):
        r = call("GET", f"//evil.example/report/handover?token={self.P}")
        if r.status == 303:
            self.assertEqual(r.headers["Location"], "/report/handover")
        else:
            self.assertEqual(r.status, 404)

    def test_nothing_is_written_to_the_access_log(self):
        err = io.StringIO()
        with contextlib.redirect_stderr(err):
            call("GET", f"/report/handover?token={self.P}")
            call("GET", "/summary", token=self.P)
        self.assertEqual(err.getvalue(), "")


class Demo(HubCase):
    def test_demo_reads_need_no_token_and_show_only_the_synthetic_patient(self):
        for method, path in READS:
            r = call(method, path + "?demo=1")
            self.assertEqual(r.status, 200, path)
            self.assertNoRealData(r)
        d = call("GET", "/summary?demo=1&days=14").json()
        self.assertEqual([p["score"] for p in d["phq9"]], [6, 11])
        self.assertIn(b"11/27", call("GET", "/report/handover?demo=1").body)

    def test_the_demo_patient_is_marked_as_simulated_wherever_it_is_shown(self):
        self.assertIs(call("GET", "/summary?demo=1").json()["simulated"], True)
        page = call("GET", "/report/handover?demo=1").body
        self.assertIn(b'<div class="box alert"><b class="flag">SIMULATED DATA.</b>', page)     # not screen-only: printed too
        self.assertIn(b"<title>Report for my doctor (simulated)</title>", page)
        self.assertNotIn(PRINTED_BY, page)                           # nobody's device, nobody's data
        self.assertNotIn(b"Shared by the patient", page)
        self.assertIn(b"PHQ-9 item 9 answered above 0", page)        # item 9 stays visible in the demo as well
        week = call("GET", "/report/patient?demo=1").body
        self.assertIn(SIMULATED, week)
        self.assertIn(b'<a href="handover?demo=1">', week)
        r = call("GET", "/fhir?demo=1")
        self.assertEqual(r.headers["Content-Disposition"],
                         f'attachment; filename="afferent-fhir-SIMULATED-{day(time.time())}.json"')
        bundle = r.json()
        for resource in [bundle] + [e["resource"] for e in bundle["entry"]]:
            self.assertEqual(resource["meta"]["security"][0]["code"], "HTEST", resource["resourceType"])
        self.assertIn("simulated demo patient", bundle["entry"][0]["resource"]["text"]["div"])

    def test_demo_never_touches_the_real_database(self):
        app.store = Tripwire()
        for token in (None, self.P, "wrong"):
            for method, path in READS:
                r = call(method, path + "?demo=1", token=token)
                self.assertEqual(r.status, 200, (path, token))
                self.assertIn(b"imulated", r.body, path)             # a token does not turn the demo into a real report
            for method, path in WRITES:
                self.assertEqual(call(method, path + "?demo=1", token=token).status, 400, (path, token))

    def test_demo_is_read_only_even_with_the_patient_token(self):
        before = rows(app.store)
        for token in (None, self.P):
            for method, path in WRITES:
                r = call(method, path + "?demo=1", token=token)
                self.assertEqual(r.status, 400)
                self.assertEqual(r.json(), {"error": "demo mode is read-only"})
        self.assertEqual(rows(app.store), before)

    def test_anything_but_exactly_demo_1_needs_a_token(self):
        variants = ("demo=0", "demo=true", "demo=01", "demo=1&demo=0", "demo=0&demo=1", "demo=1&demo=1", "DEMO=1",
                    "demo=1%20", "demo", "demo=", "Demo=1", "xdemo=1", "demo%3D1")
        for method, path in READS + WRITES:
            for v in variants:
                r = call(method, f"{path}?{v}")
                self.assertIn(r.status, (400, 401), (path, v))
                self.assertNoRealData(r)
                if (method, path) in READS:
                    self.assertEqual(r.status, 401, (path, v))
        r = call("POST", "/phq9", body={"answers": [0] * 9, "demo": 1})              # no demo switch in the body
        self.assertEqual(r.status, 401)

    def test_demo_link_with_a_token_still_cleans_the_url(self):
        r = call("GET", f"/report/handover?demo=1&token={self.P}")
        self.assertEqual((r.status, r.headers["Location"]), (303, "/report/handover?demo=1"))
        self.assertEqual(call("GET", "/report/handover?demo=1&token=wrong").status, 401)


class Token(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.path = os.path.join(self.dir.name, "hub-tokens.json")
        self.log = []

    def tearDown(self):
        self.dir.cleanup()

    def load(self, env=None):
        return auth.load_token(self.path, env=env or {}, log=self.log.append)

    def printed(self, token):
        return sum(token in line for line in self.log)

    def test_env_token_is_used_and_never_stored_or_printed(self):
        self.assertEqual(self.load({"AFFERENT_PATIENT_TOKEN": "p" * 40}), "p" * 40)
        self.assertFalse(os.path.exists(self.path))
        self.assertEqual(self.printed("p" * 40), 0)

    def test_first_start_generates_stores_600_and_prints_once(self):
        t = self.load()
        self.assertGreaterEqual(len(t), 43)                          # 32 random bytes, url-safe
        self.assertEqual(self.printed(t), 1)
        self.assertEqual(stat.S_IMODE(os.stat(self.path).st_mode), 0o600)
        self.assertEqual(json.load(open(self.path)), {"patient": t})
        self.assertFalse(any("clinician" in line.lower() for line in self.log))
        self.log.clear()
        self.assertEqual(self.load(), t)                             # second start: same token, not printed again
        self.assertEqual(self.printed(t), 0)

    def test_a_clinician_token_in_the_environment_is_ignored(self):
        t = self.load({"AFFERENT_CLINICIAN_TOKEN": "c" * 40})
        self.assertNotEqual(t, "c" * 40)
        self.assertFalse(auth.valid("c" * 40, t))
        self.assertEqual(self.printed("c" * 40), 0)
        self.assertTrue(any("AFFERENT_CLINICIAN_TOKEN is set but no longer used" in line for line in self.log))
        self.assertEqual(json.load(open(self.path)), {"patient": t})
        # the same value for both used to be refused at start; now only the patient's counts
        self.assertEqual(self.load({"AFFERENT_PATIENT_TOKEN": "s" * 40, "AFFERENT_CLINICIAN_TOKEN": "s" * 40}), "s" * 40)

    def test_token_file_of_an_older_hub_keeps_the_patient_and_forgets_the_clinician(self):
        with open(self.path, "w") as f:
            json.dump({"patient": "p" * 43, "clinician": "c" * 43}, f)
        t = self.load()
        self.assertEqual(t, "p" * 43)
        self.assertFalse(auth.valid("c" * 43, t))
        self.assertFalse(auth.valid_session(auth.session_value("c" * 43), t))
        self.assertEqual(json.load(open(self.path)), {"patient": "p" * 43})
        self.assertEqual(stat.S_IMODE(os.stat(self.path).st_mode), 0o600)
        self.assertEqual(self.printed("p" * 43) + self.printed("c" * 43), 0)          # neither is printed again
        self.assertTrue(any("only the patient token is kept" in line for line in self.log))
        self.log.clear()
        self.assertEqual(self.load(), t)                             # the next start has nothing left to drop
        self.assertFalse(any("kept" in line for line in self.log))

    def test_a_file_with_only_a_clinician_token_gives_it_no_second_life(self):
        with open(self.path, "w") as f:
            json.dump({"clinician": "c" * 43}, f)                    # the patient token came from the environment before
        t = self.load()
        self.assertNotEqual(t, "c" * 43)
        self.assertEqual(self.printed(t), 1)
        self.assertEqual(json.load(open(self.path)), {"patient": t})

    def test_loose_file_mode_is_tightened_and_a_broken_file_replaced(self):
        t = self.load()
        os.chmod(self.path, 0o644)
        self.assertEqual(self.load(), t)
        self.assertEqual(stat.S_IMODE(os.stat(self.path).st_mode), 0o600)
        with open(self.path, "w") as f:
            f.write("not json")
        t2 = self.load()
        self.assertNotEqual(t2, t)
        self.assertEqual(stat.S_IMODE(os.stat(self.path).st_mode), 0o600)
        self.assertEqual(self.load(), t2)

    def test_unwritable_volume_still_protects_the_hub(self):
        self.path = os.path.join(self.dir.name, "a-file")
        open(self.path, "w").close()
        self.path = os.path.join(self.path, "hub-tokens.json")       # a directory that cannot exist
        t = self.load()
        self.assertGreaterEqual(len(t), 43)
        self.assertTrue(any("could NOT be stored" in line for line in self.log))

    def test_comparison_is_constant_time(self):
        calls = []
        orig = auth.hmac.compare_digest
        auth.hmac.compare_digest = lambda a, b: calls.append((len(a), len(b))) or orig(a, b)
        try:
            self.assertTrue(auth.valid("p" * 40, "p" * 40))
            self.assertFalse(auth.valid("p", "p" * 40))
            self.assertFalse(auth.valid("p" * 400, "p" * 40))
        finally:
            auth.hmac.compare_digest = orig
        self.assertEqual(calls, [(32, 32)] * 3)                      # always equal-length digests
        self.assertFalse(auth.valid("", "p" * 40))
        self.assertFalse(auth.valid(None, "p" * 40))
        self.assertFalse(auth.valid("p" * 40, ""))
        self.assertFalse(auth.valid("", ""))


class OverTheWire(HubCase):
    """the same rules over a real socket (skipped where a port cannot be opened, e.g. a sandbox)"""

    def test_real_http_round_trip(self):
        try:
            server = ThreadingHTTPServer(("127.0.0.1", 0), app.Handler)
        except OSError as e:
            self.skipTest(f"cannot bind a loopback port here: {e}")
        threading.Thread(target=server.serve_forever, daemon=True).start()
        try:
            def req(method, path, headers=None, body=None):
                c = http.client.HTTPConnection("127.0.0.1", server.server_address[1], timeout=10)
                c.request(method, path, body=json.dumps(body) if body is not None else None, headers=headers or {})
                r = c.getresponse()
                out = (r.status, r.headers, r.read())
                c.close()
                return out
            bearer = {"Authorization": f"Bearer {self.P}"}
            self.assertEqual(json.loads(req("GET", "/health")[2]), {"ok": True})
            self.assertEqual(req("GET", "/summary")[0], 401)
            self.assertEqual(req("GET", "/summary", bearer)[0], 200)
            self.assertEqual(req("POST", "/ask", bearer, {"question": "Summarise this period"})[0], 404)
            big = {"summary": {"seconds": 60}, "frames": ["x" * 1000] * 2000}             # a refused 2 MB upload still gets its answer
            self.assertEqual(req("POST", "/sessions", None, big)[0], 401)
            self.assertEqual(req("POST", "/sessions", bearer, big)[0], 201)
            status, headers, _ = req("GET", f"/report/handover?token={self.P}")
            self.assertEqual((status, headers["Location"]), (303, "/report/handover"))
            status, _, page = req("GET", "/report/handover", {"Cookie": headers["Set-Cookie"].split(";")[0]})
            self.assertEqual(status, 200)
            self.assertIn(b"27/27", page)
            self.assertIn(PRINTED_BY, page)
            status, headers, _ = req("GET", "/fhir", bearer)
            self.assertEqual(status, 200)
            self.assertTrue(headers["Content-Disposition"].startswith('attachment; filename="afferent-fhir-'))
            status, _, page = req("GET", "/report/handover?demo=1")
            self.assertEqual(status, 200)
            self.assertIn(SIMULATED, page)
            self.assertNoRealData(type("R", (), {"body": page}))
        finally:
            server.shutdown()
            server.server_close()


if __name__ == "__main__":
    unittest.main()
