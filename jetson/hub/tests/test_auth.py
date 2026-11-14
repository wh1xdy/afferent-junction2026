"""Access control: who may read and write, tokens, the browser cookie, and demo isolation.

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
import unittest
from http.server import ThreadingHTTPServer

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import app  # noqa: E402
import auth  # noqa: E402
import grounding  # noqa: E402
from store import Store  # noqa: E402
from test_hub import DAY  # noqa: E402

READS = [("GET", "/summary"), ("GET", "/report/clinician"), ("GET", "/report/patient"), ("GET", "/fhir"), ("POST", "/ask")]
WRITES = [("POST", "/sessions"), ("POST", "/phq9")]
BODIES = {"/ask": {"question": "How did the patient sleep?"},
          "/sessions": {"summary": {"smileShare": 0.5, "seconds": 60}},
          "/phq9": {"answers": [0, 0, 0, 0, 0, 0, 0, 0, 0]}}
# values that exist only in the "real" database of these tests (the demo patient scores 6 and 11, pulse 60-75)
REAL_MARKERS = (b'"score": 27', b"27/27", b"severe", b'"valueInteger": 27',
                b'"finger_bpm": 111', b"111 BPM", b'"value": 111')


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
    import time
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
        self.saved = (app.store, app.tokens, grounding._chat)
        self.P, self.C = secrets.token_urlsafe(32), secrets.token_urlsafe(32)
        app.store = real_store()
        app.tokens = {auth.PATIENT: self.P, auth.CLINICIAN: self.C}
        self.llm_calls = []
        grounding._chat = lambda url, system, msgs, timeout: self.llm_calls.append(1) or "The data doesn't show that."

    def tearDown(self):
        if isinstance(app.store, Store):
            app.store.db.close()
        app.store, app.tokens, grounding._chat = self.saved

    def assertNoRealData(self, r):
        for m in REAL_MARKERS:
            self.assertNotIn(m, r.body, f"real data leaked: {m!r}")


class Roles(HubCase):
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
        self.assertEqual(self.llm_calls, [])

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

    def test_clinician_reads_everything(self):
        for method, path in READS:
            r = call(method, path, token=self.C)
            self.assertEqual(r.status, 200, path)
            self.assertEqual(r.headers["Cache-Control"], "no-store")
        self.assertEqual(call("GET", "/summary", token=self.C).json()["phq9"][0]["score"], 27)
        self.assertIn(b"27/27", call("GET", "/report/clinician", token=self.C).body)
        self.assertIn(b'"valueInteger": 27', call("GET", "/fhir", token=self.C).body)

    def test_clinician_writing_is_403_and_stores_nothing(self):
        before = rows(app.store)
        for method, path in WRITES:
            r = call(method, path, token=self.C)
            self.assertEqual(r.status, 403, path)
            self.assertEqual(r.json(), {"error": "the clinician token is read-only"})
        self.assertEqual(rows(app.store), before)

    def test_patient_reads_and_writes(self):
        for method, path in READS:
            self.assertEqual(call(method, path, token=self.P).status, 200, path)
        before = rows(app.store)
        self.assertEqual(call("POST", "/sessions", token=self.P).status, 201)
        self.assertEqual(call("POST", "/phq9", token=self.P).status, 201)
        after = rows(app.store)
        self.assertEqual((after["sessions"], after["phq9"]), (before["sessions"] + 1, before["phq9"] + 1))
        self.assertEqual(call("POST", "/phq9", token=self.P, body={"answers": [1, 2]}).status, 400)

    def test_scheme_is_case_insensitive(self):
        self.assertEqual(call("GET", "/summary", headers={"Authorization": f"bearer {self.C}"}).status, 200)

    def test_overview_is_the_instant_template_and_specific_questions_use_the_llm(self):
        r = call("POST", "/ask", token=self.C, body={"question": "Summarise this period for the physician"})
        self.assertEqual(r.status, 200)
        self.assertEqual(r.json()["mode"], "template")
        self.assertTrue(r.json()["grounded"])
        self.assertEqual(self.llm_calls, [])
        self.assertEqual(call("POST", "/ask", token=self.C).json()["mode"], "llm")
        self.assertEqual(len(self.llm_calls), 1)

    def test_clinician_report_shows_the_summary_and_ignores_narrative(self):
        r = call("GET", "/report/clinician?narrative=1", token=self.C)
        self.assertEqual(r.status, 200)
        self.assertIn(b"<b>Summary</b>", r.body)
        self.assertEqual(self.llm_calls, [])

    def test_unknown_route_and_bad_input(self):
        self.assertEqual(call("GET", "/nope").status, 404)
        self.assertEqual(call("GET", "/sessions", token=self.P).status, 404)
        self.assertEqual(call("GET", "/summary?days=abc", token=self.C).status, 400)
        self.assertEqual(call("POST", "/ask", token=self.C, body=[1, 2]).status, 400)


class Health(HubCase):
    def test_health_without_a_valid_token_says_only_ok(self):
        app.collector["hub_url"] = "http://10.99.0.7:8080"
        try:
            for r in (call("GET", "/health"), call("GET", "/health", token="wrong"),
                      call("GET", "/health?token=" + self.P),                       # query tokens are for reports only
                      call("GET", "/health", headers={"Cookie": f"{auth.COOKIE}={auth.session_value(auth.PATIENT, app.tokens)}"})):
                self.assertEqual(r.status, 200)
                self.assertEqual(r.json(), {"ok": True})
            for t in (self.P, self.C):
                d = call("GET", "/health", token=t).json()
                self.assertEqual(d["collector"]["hub_url"], "http://10.99.0.7:8080")
                self.assertIn("llm", d)
        finally:
            app.collector["hub_url"] = None


class BrowserLink(HubCase):
    def cookie_of(self, r):
        return r.headers["Set-Cookie"].split(";")[0]

    def test_token_in_query_becomes_a_cookie_and_a_clean_url(self):
        for t in (self.P, self.C):
            r = call("GET", f"/report/clinician?days=7&token={t}")
            self.assertEqual(r.status, 303)
            self.assertEqual(r.headers["Location"], "/report/clinician?days=7")
            sc = r.headers["Set-Cookie"]
            self.assertIn("HttpOnly", sc)
            self.assertIn("SameSite=Lax", sc)
            self.assertIn("Path=/report", sc)
            self.assertNotIn(t, sc)                                   # the cookie is not the bearer token
            self.assertNotIn(t.encode(), r.body)
            self.assertNoRealData(r)
            page = call("GET", r.headers["Location"], headers={"Cookie": self.cookie_of(r)})
            self.assertEqual(page.status, 200)
            self.assertIn(b"27/27", page.body)
            self.assertNotIn(t.encode(), page.body)
        r = call("GET", f"/report/patient?token={self.P}")
        self.assertEqual((r.status, r.headers["Location"]), (303, "/report/patient"))

    def test_wrong_query_token_is_401_html_without_a_cookie(self):
        for bad in ("nope", "", self.P + "x", f"{self.P}&token={self.C}"):
            r = call("GET", f"/report/clinician?token={bad}")
            self.assertEqual(r.status, 401, bad)
            self.assertIsNone(r.headers["Set-Cookie"])
            self.assertIn(b"Access token needed", r.body)
            self.assertNoRealData(r)

    def test_cookie_and_query_token_work_on_the_html_reports_only(self):
        cookie = {"Cookie": self.cookie_of(call("GET", f"/report/clinician?token={self.P}"))}
        before = rows(app.store)
        self.assertEqual(call("GET", "/report/patient", headers=cookie).status, 200)
        for method, path in (("GET", "/summary"), ("GET", "/fhir"), ("POST", "/ask"), ("POST", "/sessions"), ("POST", "/phq9")):
            r = call(method, path, headers=cookie)
            self.assertEqual(r.status, 401, path)                    # a browser session can never write
            self.assertNoRealData(r)
            r = call(method, f"{path}?token={self.P}")
            self.assertEqual(r.status, 401, path)
            self.assertNoRealData(r)
        self.assertEqual(rows(app.store), before)

    def test_forged_or_stale_cookie_is_401(self):
        good = auth.session_value(auth.CLINICIAN, app.tokens)
        for value in ("x", self.C, good[:-1] + ("0" if good[-1] != "0" else "1"), ""):
            r = call("GET", "/report/clinician", headers={"Cookie": f"{auth.COOKIE}={value}"})
            self.assertEqual(r.status, 401, value)
            self.assertNoRealData(r)
        cookie = {"Cookie": f"{auth.COOKIE}={good}"}
        self.assertEqual(call("GET", "/report/clinician", headers=cookie).status, 200)
        app.tokens = {auth.PATIENT: self.P, auth.CLINICIAN: secrets.token_urlsafe(32)}      # token rotated
        self.assertEqual(call("GET", "/report/clinician", headers=cookie).status, 401)

    def test_redirect_stays_on_the_hub(self):
        r = call("GET", f"//evil.example/report/clinician?token={self.P}")
        if r.status == 303:
            self.assertEqual(r.headers["Location"], "/report/clinician")
        else:
            self.assertEqual(r.status, 404)

    def test_nothing_is_written_to_the_access_log(self):
        err = io.StringIO()
        with contextlib.redirect_stderr(err):
            call("GET", f"/report/clinician?token={self.P}")
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
        self.assertIn(b"11/27", call("GET", "/report/clinician?demo=1").body)
        r = call("POST", "/ask?demo=1", body={"question": "Give me an overview"})
        self.assertEqual(r.json()["mode"], "template")
        self.assertIn("11/27 (moderate)", r.json()["answer"])

    def test_demo_never_touches_the_real_database(self):
        app.store = Tripwire()
        for token in (None, self.C, self.P, "wrong"):
            for method, path in READS:
                self.assertEqual(call(method, path + "?demo=1", token=token).status, 200, (path, token))
            for method, path in WRITES:
                self.assertEqual(call(method, path + "?demo=1", token=token).status, 400, (path, token))
        self.assertEqual(call("POST", "/ask?demo=1").json()["mode"], "llm")

    def test_demo_is_read_only_even_with_the_patient_token(self):
        before = rows(app.store)
        for token in (None, self.C, self.P):
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
        r = call("POST", "/ask", body={"question": "overview", "demo": 1})          # no demo switch in the body
        self.assertEqual(r.status, 401)

    def test_demo_link_with_a_token_still_cleans_the_url(self):
        r = call("GET", f"/report/clinician?demo=1&token={self.C}")
        self.assertEqual((r.status, r.headers["Location"]), (303, "/report/clinician?demo=1"))
        self.assertEqual(call("GET", "/report/clinician?demo=1&token=wrong").status, 401)


class Tokens(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.path = os.path.join(self.dir.name, "hub-tokens.json")
        self.log = []

    def tearDown(self):
        self.dir.cleanup()

    def load(self, env=None):
        return auth.load_tokens(self.path, env=env or {}, log=self.log.append)

    def printed(self, token):
        return sum(token in line for line in self.log)

    def test_env_tokens_are_used_and_never_stored_or_printed(self):
        env = {"AFFERENT_PATIENT_TOKEN": "p" * 40, "AFFERENT_CLINICIAN_TOKEN": "c" * 40}
        self.assertEqual(self.load(env), {"patient": "p" * 40, "clinician": "c" * 40})
        self.assertFalse(os.path.exists(self.path))
        self.assertEqual(self.printed("p" * 40) + self.printed("c" * 40), 0)

    def test_first_start_generates_stores_600_and_prints_once(self):
        t = self.load()
        self.assertNotEqual(t["patient"], t["clinician"])
        for token in t.values():
            self.assertGreaterEqual(len(token), 43)                  # 32 random bytes, url-safe
            self.assertEqual(self.printed(token), 1)
        self.assertEqual(stat.S_IMODE(os.stat(self.path).st_mode), 0o600)
        self.assertEqual(json.load(open(self.path)), t)
        self.log.clear()
        self.assertEqual(self.load(), t)                             # second start: same tokens, not printed again
        for token in t.values():
            self.assertEqual(self.printed(token), 0)

    def test_one_from_env_one_generated(self):
        t = self.load({"AFFERENT_CLINICIAN_TOKEN": "c" * 40})
        self.assertEqual(t["clinician"], "c" * 40)
        self.assertEqual(self.printed(t["patient"]), 1)
        self.assertEqual(self.printed("c" * 40), 0)
        self.assertEqual(json.load(open(self.path)), {"patient": t["patient"]})
        self.assertEqual(self.load({"AFFERENT_CLINICIAN_TOKEN": "c" * 40}), t)

    def test_equal_tokens_are_refused(self):
        with self.assertRaises(ValueError):
            self.load({"AFFERENT_PATIENT_TOKEN": "s" * 40, "AFFERENT_CLINICIAN_TOKEN": "s" * 40})

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
        self.assertGreaterEqual(len(t["patient"]), 43)
        self.assertTrue(any("could NOT be stored" in line for line in self.log))

    def test_comparison_is_constant_time_and_checks_both_roles(self):
        tokens = {"patient": "p" * 40, "clinician": "c" * 40}
        calls = []
        orig = auth.hmac.compare_digest
        auth.hmac.compare_digest = lambda a, b: calls.append((len(a), len(b))) or orig(a, b)
        try:
            self.assertEqual(auth.role_for("p" * 40, tokens), "patient")
            self.assertEqual(auth.role_for("c" * 40, tokens), "clinician")
            self.assertIsNone(auth.role_for("p", tokens))
        finally:
            auth.hmac.compare_digest = orig
        self.assertEqual(calls, [(32, 32)] * 6)                      # always both roles, always equal-length digests
        self.assertIsNone(auth.role_for("", tokens))
        self.assertIsNone(auth.role_for(None, tokens))
        self.assertIsNone(auth.role_for("p" * 40, {}))


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
            bearer = {"Authorization": f"Bearer {self.C}"}
            self.assertEqual(json.loads(req("GET", "/health")[2]), {"ok": True})
            self.assertEqual(req("GET", "/summary")[0], 401)
            self.assertEqual(req("GET", "/summary", bearer)[0], 200)
            self.assertEqual(req("POST", "/phq9", bearer, {"answers": [0] * 9})[0], 403)
            big = {"summary": {"seconds": 60}, "frames": ["x" * 1000] * 2000}             # a refused 2 MB upload still gets its answer
            self.assertEqual(req("POST", "/sessions", None, big)[0], 401)
            self.assertEqual(req("POST", "/sessions", {"Authorization": f"Bearer {self.P}"}, big)[0], 201)
            status, headers, _ = req("GET", f"/report/clinician?token={self.C}")
            self.assertEqual((status, headers["Location"]), (303, "/report/clinician"))
            status, _, page = req("GET", "/report/clinician", {"Cookie": headers["Set-Cookie"].split(";")[0]})
            self.assertEqual(status, 200)
            self.assertIn(b"27/27", page)
            status, _, page = req("GET", "/report/clinician?demo=1")
            self.assertEqual(status, 200)
            self.assertNoRealData(type("R", (), {"body": page}))
        finally:
            server.shutdown()
            server.server_close()


if __name__ == "__main__":
    unittest.main()
