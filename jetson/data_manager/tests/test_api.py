import json
import os
import tempfile
import threading
import time
import unittest
from http.server import ThreadingHTTPServer

import _path  # noqa: F401
from app import App, make_handler
from data_manager_client import DataManagerClient, DataManagerError
from store import Store


class TestDispatch(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.store = Store(os.path.join(self.dir.name, "t.db"))
        self.app = App(self.store, token="secret")
        self.auth = {"Authorization": "Bearer secret"}

    def tearDown(self):
        self.store.close()
        self.dir.cleanup()

    def call(self, method, path, query="", body=None, headers=None):
        raw = json.dumps(body).encode() if body is not None else None
        return self.app.dispatch(method, path, query, self.auth if headers is None else headers, raw)

    def test_auth(self):
        self.assertEqual(self.call("GET", "/api/v1/latest", headers={})[0], 401)
        self.assertEqual(self.call("GET", "/health", headers={})[0], 200)   # health stays open
        self.assertEqual(self.call("GET", "/api/v1/latest")[0], 200)

    def test_errors(self):
        self.assertEqual(self.call("GET", "/api/v1/nothing")[0], 404)
        self.assertEqual(self.call("DELETE", "/api/v1/latest")[0], 405)
        code, r = self.app.dispatch("POST", "/api/v1/samples", "", self.auth, b"{not json")
        self.assertEqual(code, 400)
        self.assertEqual(self.call("GET", "/api/v1/series", "metric=env.temperature_c&bucket=7m")[0], 400)
        self.assertEqual(self.call("GET", "/api/v1/samples")[0], 400)             # metric missing
        self.assertEqual(self.call("GET", "/api/v1/samples", "metric=x.y")[0], 400)

    def test_batch_shapes(self):
        one = {"metric": "env.temperature_c", "value": 21, "source": "a"}
        self.assertEqual(self.call("POST", "/api/v1/samples", body=one)[1]["accepted"], 1)
        self.assertEqual(self.call("POST", "/api/v1/samples",
                                   body=[{**one, "ts": time.time() - 5}])[1]["accepted"], 1)
        code, r = self.call("POST", "/api/v1/samples",
                            body={"source": "b", "samples": [{"metric": "env.temperature_c", "value": 22}]})
        self.assertEqual(r["accepted"], 1)
        latest = self.call("GET", "/api/v1/latest")[1]["latest"]
        self.assertEqual({r["source"] for r in latest}, {"a", "b"})

    def test_read_endpoints_answer_on_empty_db(self):
        for path, q in [("/api/v1/metrics", ""), ("/api/v1/daily", "metric=presence.home"),
                        ("/api/v1/stats", "metric=env.co2_ppm"), ("/api/v1/stats", "metric=presence.home"),
                        ("/api/v1/trend", "metric=env.co2_ppm"), ("/api/v1/baseline", "metric=presence.home"),
                        ("/api/v1/profile", "metric=env.co2_ppm"), ("/api/v1/summary", ""),
                        ("/api/v1/correlation", "a=env.co2_ppm&b=vitals.heart_rate_bpm"),
                        ("/api/v1/events", ""), ("/api/v1/info", "")]:
            code, r = self.call("GET", path, q)
            self.assertEqual(code, 200, (path, r))

    def test_event_roundtrip(self):
        now = time.time()
        r = self.call("POST", "/api/v1/events",
                      body={"source": "presence", "events": [{"kind": "presence.home", "start": now - 600}]})[1]
        eid = r["events"][0]["id"]
        evs = self.call("GET", "/api/v1/events", "kind=presence.home")[1]["events"]
        self.assertTrue(evs[0]["ongoing"])
        self.call("POST", "/api/v1/events",
                  body={"source": "presence", "events": [{"kind": "presence.home", "start": now - 600,
                                                          "end": now}]})
        evs = self.call("GET", "/api/v1/events", "kind=presence.home")[1]["events"]
        self.assertEqual(len(evs), 1)
        self.assertFalse(evs[0]["ongoing"])
        self.assertEqual(self.call("DELETE", f"/api/v1/events/{eid}")[0], 200)
        self.assertEqual(self.call("DELETE", f"/api/v1/events/{eid}")[0], 404)


class TestOpenApi(unittest.TestCase):
    def test_spec_matches_routes(self):
        import re
        import openapi
        app = App(Store(":memory:"))
        routes = set()
        for method, pattern, _ in app.routes:
            path = pattern.replace("/?", "").replace(r"\.", ".")
            path = re.sub(r"\(\\d\+\)", "{id}", path)
            routes.add((method, path))
        self.assertEqual(routes, set(openapi.PATHS), "openapi.py and App.routes disagree")
        code, spec = app.dispatch("GET", "/api/v1/openapi.json", "", {}, None)
        self.assertEqual(code, 200)
        self.assertEqual(spec["openapi"], "3.0.3")
        json.dumps(spec)                     # serialisable
        # every $ref resolves
        refs = re.findall(r'"#/components/schemas/(\w+)"', json.dumps(spec))
        self.assertTrue(refs)
        for r in refs:
            self.assertIn(r, spec["components"]["schemas"])


class TestClientOverHttp(unittest.TestCase):
    def test_client_queues_while_down_then_delivers(self):
        d = tempfile.TemporaryDirectory()
        store = Store(os.path.join(d.name, "t.db"))
        server = ThreadingHTTPServer(("127.0.0.1", 0), make_handler(App(store)))
        port = server.server_address[1]
        server.server_close()                       # port known, nobody listening yet
        c = DataManagerClient("test", url=f"http://127.0.0.1:{port}", flush_every_s=0.2)
        c.sample("env.temperature_c", 21.0)
        c.sample("env.temperature_c", 999)          # will be rejected by range check
        c.interval("presence.home", start=time.time() - 60)
        time.sleep(0.5)
        self.assertEqual(c.status()["queued_samples"], 2)
        self.assertIsNotNone(c.last_error)
        server = ThreadingHTTPServer(("127.0.0.1", port), make_handler(App(store)))
        threading.Thread(target=server.serve_forever, daemon=True).start()
        try:
            self.assertTrue(c.flush(5))
            self.assertEqual(c.sent["samples"], 1)
            self.assertEqual(c.sent["rejected"], 1)
            self.assertEqual(c.sent["events"], 1)
            self.assertEqual(len(store.samples("env.temperature_c")), 1)
            # read side of the same client
            latest = c.get("/api/v1/latest")["latest"]
            self.assertEqual(latest[0]["value"], 21.0)
            days = c.get("/api/v1/daily", metric="presence.home", **{"from": "-1d"})["days"]
            self.assertTrue(days)
            with self.assertRaises(DataManagerError) as ctx:
                c.get("/api/v1/samples", metric="nope.metric")
            self.assertEqual(ctx.exception.status, 400)
        finally:
            c.close()
            server.shutdown()
            store.close()
            d.cleanup()


if __name__ == "__main__":
    unittest.main()
