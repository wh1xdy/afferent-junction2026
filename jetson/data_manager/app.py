"""afferent-data-manager: one place where every Afferent app stores its measurements.

Producers (UNO Q modulino-hub, afferent-presence, afferent-vision, posture …) push
samples and intervals over HTTP; anyone can then query raw data, time series,
daily aggregates, trends and baseline deviations.

Write
  POST   /api/v1/samples          {"source": "...", "samples": [{"metric", "value", "ts"?, "quality"?, "meta"?}]}
  POST   /api/v1/events           {"source": "...", "events": [{"kind", "start", "end"?, "value"?, "id"?, "meta"?}]}
  DELETE /api/v1/events/<id>
  POST   /api/v1/metrics          {"name", "kind": "sample"|"interval", "unit", "min", "max", "description"}
Read
  GET /api/v1/metrics             catalog + counts
  GET /api/v1/latest              last value of every (metric, source)
  GET /api/v1/samples             raw       ?metric&source&from&to&limit&order&min_quality
  GET /api/v1/series              buckets   ?metric&source&from&to&bucket=1m|5m|15m|30m|1h|3h|6h|1d
  GET /api/v1/daily               per local day (samples: n/mean/percentiles; intervals: minutes/occurrences)
  GET /api/v1/stats               descriptive stats over a range + trend of the daily values
  GET /api/v1/trend               Mann-Kendall + Sen slope on daily values ?stat=median|mean|p90|minutes|occurrences
  GET /api/v1/baseline            one day vs the person's previous N days (robust z-score)
  GET /api/v1/profile             mean per local hour of day (circadian profile)
  GET /api/v1/correlation         ?a=<metric>&b=<metric>&bucket=1h
  GET /api/v1/events              intervals ?kind&source&from&to
  GET /api/v1/summary?day=        everything for one day
  GET /api/v1/info, /health
  GET /api/v1/openapi.json        OpenAPI 3 description (full guide: API.md)

Config (env): PORT (8100), DATA_DIR (/data), TZ_NAME (UTC), RAW_RETENTION_DAYS (180, 0 = forever),
API_TOKEN (optional bearer token for every /api route), MAX_FUTURE_S (300), ROLLUP_INTERVAL_S (300),
MDNS (1 = advertise _http._tcp role=data-manager).
"""
from __future__ import annotations

import json
import logging
import os
import re
import signal
import socket
import threading
import time
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

import catalog
import openapi
import stats
import timeutil as tu
from store import IngestError, Store

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("data_manager")

VERSION = "0.1.0"
MAX_BODY = 2_000_000
MAX_BATCH = 10_000


def env_f(name, default):
    try:
        return float(os.environ.get(name) or default)
    except ValueError:
        return float(default)


class ApiError(Exception):
    def __init__(self, code: int, msg: str, **extra):
        super().__init__(msg)
        self.code, self.msg, self.extra = code, msg, extra


# ── request helpers ─────────────────────────────────────────────────────────
class Params:
    def __init__(self, query: str, tz):
        self.q = {k: v[-1] for k, v in parse_qs(query).items()}
        self.tz = tz

    def str(self, k, default=None, required=False):
        v = self.q.get(k, default)
        if required and not v:
            raise ApiError(400, f"missing query parameter '{k}'")
        return v

    def num(self, k, default=None):
        v = self.q.get(k)
        if v is None or v == "":
            return default
        try:
            return float(v)
        except ValueError:
            raise ApiError(400, f"'{k}' must be a number") from None

    def ts(self, k, default=None):
        v = self.q.get(k)
        if v is None or v == "":
            return None if default is None else tu.parse_ts(default, allow_relative=True)
        try:
            return tu.parse_ts(v, allow_relative=True)
        except ValueError as e:
            raise ApiError(400, f"'{k}': {e}") from None

    def day(self, k, default=None):
        """YYYY-MM-DD, or any timestamp / relative time -> local day."""
        v = self.q.get(k) or default
        if v is None:
            return None
        if re.fullmatch(r"\d{4}-\d{2}-\d{2}", str(v)):
            return v
        try:
            return tu.day_of(tu.parse_ts(v, allow_relative=True), self.tz)
        except ValueError as e:
            raise ApiError(400, f"'{k}': {e}") from None


def _batch(body, key: str) -> tuple[list, str | None]:
    """Accept {"source": s, key: [...]}, a bare list, or a single object."""
    if isinstance(body, list):
        items, src = body, None
    elif isinstance(body, dict) and key in body:
        items, src = body[key], body.get("source")
        if not isinstance(items, list):
            raise ApiError(400, f"'{key}' must be a list")
    elif isinstance(body, dict):
        items, src = [body], None
    else:
        raise ApiError(400, "body must be a JSON object or list")
    if len(items) > MAX_BATCH:
        raise ApiError(413, f"at most {MAX_BATCH} items per request")
    return items, src


# ── application ─────────────────────────────────────────────────────────────
class App:
    def __init__(self, store: Store, token: str | None = None):
        self.store = store
        self.token = token or None
        self.started = time.time()
        self.ingested = {"samples": 0, "events": 0, "rejected": 0}
        self.routes = [
            ("GET", r"/health", self.health),
            ("GET", r"/", self.index),
            ("GET", r"/api/v1/?", self.index),
            ("GET", r"/api/v1/info", self.info),
            ("GET", r"/api/v1/openapi\.json", self.openapi),
            ("GET", r"/api/v1/metrics", self.get_metrics),
            ("POST", r"/api/v1/metrics", self.post_metric),
            ("POST", r"/api/v1/samples", self.post_samples),
            ("GET", r"/api/v1/samples", self.get_samples),
            ("POST", r"/api/v1/events", self.post_events),
            ("GET", r"/api/v1/events", self.get_events),
            ("DELETE", r"/api/v1/events/(\d+)", self.delete_event),
            ("GET", r"/api/v1/latest", self.get_latest),
            ("GET", r"/api/v1/series", self.get_series),
            ("GET", r"/api/v1/daily", self.get_daily),
            ("GET", r"/api/v1/stats", self.get_stats),
            ("GET", r"/api/v1/trend", self.get_trend),
            ("GET", r"/api/v1/baseline", self.get_baseline),
            ("GET", r"/api/v1/profile", self.get_profile),
            ("GET", r"/api/v1/correlation", self.get_correlation),
            ("GET", r"/api/v1/summary", self.get_summary),
        ]
        self._compiled = [(m, re.compile(p + r"$"), h) for m, p, h in self.routes]

    def dispatch(self, method: str, path: str, query: str, headers, body: bytes | None):
        """Returns (status, payload). Pure function of the request: easy to test."""
        try:
            for m, rx, handler in self._compiled:
                match = rx.match(path)
                if match and m == method:
                    if path.startswith("/api/") and self.token:
                        auth = headers.get("Authorization", "") if headers else ""
                        if auth != f"Bearer {self.token}":
                            raise ApiError(401, "missing or wrong bearer token")
                    params = Params(query, self.store.tz)
                    data = None
                    if method in ("POST", "PUT"):
                        try:
                            data = json.loads(body or b"null")
                        except json.JSONDecodeError as e:
                            raise ApiError(400, f"invalid JSON: {e}") from None
                    return 200, handler(params, data, *match.groups())
            if any(rx.match(path) for _, rx, _ in self._compiled):
                raise ApiError(405, "method not allowed")
            raise ApiError(404, "not found")
        except ApiError as e:
            return e.code, {"error": e.msg, **e.extra}
        except IngestError as e:
            return 400, {"error": str(e)}
        except ValueError as e:
            return 400, {"error": str(e)}
        except Exception as e:  # never kill the server for one bad request
            log.exception("request failed: %s %s", method, path)
            return 500, {"error": f"internal error: {e}"}

    # helpers
    def _tz(self):
        return self.store.tz

    def _kind(self, metric):
        return self.store.metric(metric)["kind"]

    def _with_time(self, rows, key="ts"):
        for r in rows:
            r["time"] = tu.iso(r[key], self._tz())
        return rows

    # ── handlers ────────────────────────────────────────────────────────────
    def health(self, p, _):
        return {"ok": True, "version": VERSION, "uptime_s": round(time.time() - self.started),
                "ingested_since_start": self.ingested}

    def index(self, p, _):
        return {"app": "afferent-data-manager", "version": VERSION,
                "endpoints": [f"{m} {pat}" for m, pat, _ in self.routes],
                "docs": "jetson/data_manager/API.md", "openapi": "/api/v1/openapi.json"}

    def openapi(self, p, _):
        return openapi.spec(VERSION)

    def info(self, p, _):
        return {**self.store.db_info(), "version": VERSION, "auth": bool(self.token),
                "now": tu.iso(tu.now_ms(), self._tz())}

    def get_metrics(self, p, _):
        counts = self.store.counts()
        out = []
        for name, m in self.store.metrics().items():
            c = counts.get(name, {})
            out.append({"name": name, "kind": m["kind"], "unit": m["unit"], "min": m["min"],
                        "max": m["max"], "description": m["description"], "builtin": bool(m["builtin"]),
                        "count": c.get("n", 0), "first": tu.iso(c.get("first_ts"), self._tz()),
                        "last": tu.iso(c.get("last_ts"), self._tz())})
        return {"metrics": out}

    def post_metric(self, p, body):
        if not isinstance(body, dict) or "name" not in body:
            raise ApiError(400, "body must be an object with at least 'name'")
        m = self.store.register_metric(body["name"], body)
        log.info("metric registered: %s (%s)", m["name"], m["kind"])
        return {"ok": True, "metric": m}

    def post_samples(self, p, body):
        items, src = _batch(body, "samples")
        res = self.store.add_samples(items, src)
        self.ingested["samples"] += res["accepted"]
        self.ingested["rejected"] += len(res["rejected"])
        if res["rejected"]:
            log.warning("%d/%d samples rejected from %s: %s", len(res["rejected"]), len(items),
                        src or "?", res["rejected"][0]["reason"])
        return res

    def post_events(self, p, body):
        items, src = _batch(body, "events")
        res = self.store.upsert_events(items, src)
        self.ingested["events"] += res["accepted"]
        self.ingested["rejected"] += len(res["rejected"])
        return res

    def delete_event(self, p, _, event_id):
        if not self.store.delete_event(int(event_id)):
            raise ApiError(404, "no such event")
        return {"ok": True}

    def get_samples(self, p, _):
        metric = p.str("metric", required=True)
        rows = self.store.samples(metric, p.str("source"), p.ts("from", "-24h"), p.ts("to"),
                                  limit=p.num("limit", 1000), order=p.str("order", "desc"),
                                  min_quality=p.num("min_quality"))
        return {"metric": metric, "unit": self.store.metric(metric)["unit"], "count": len(rows),
                "samples": self._with_time(rows)}

    def get_events(self, p, _):
        rows = self.store.events(p.str("kind"), p.str("source"), p.ts("from", "-7d"), p.ts("to"),
                                 limit=p.num("limit", 1000))
        for r in rows:
            r["start_time"] = tu.iso(r["start"], self._tz())
            r["end_time"] = tu.iso(r["end"], self._tz())
        return {"count": len(rows), "events": rows}

    def get_latest(self, p, _):
        now = tu.now_ms()
        rows = self._with_time(self.store.latest())
        for r in rows:
            r["age_s"] = round((now - r["ts"]) / 1000)
        return {"latest": rows}

    def get_series(self, p, _):
        metric = p.str("metric", required=True)
        bucket = p.str("bucket", "5m")
        if bucket not in tu.BUCKETS:
            raise ApiError(400, f"bucket must be one of {list(tu.BUCKETS)}")
        frm, to = p.ts("from", "-24h"), p.ts("to", "now")
        if (to - frm) / tu.BUCKETS[bucket] > 20_000:
            raise ApiError(400, "too many buckets: widen 'bucket' or narrow the range")
        rows = self.store.series(metric, p.str("source"), frm, to, tu.BUCKETS[bucket],
                                 p.num("min_quality"))
        for r in rows:
            r["mean"] = round(r["mean"], 3)
        return {"metric": metric, "unit": self.store.metric(metric)["unit"], "bucket": bucket,
                "note": "buckets are aligned on UTC; use /daily for local calendar days",
                "series": self._with_time(rows)}

    def _day_range(self, p, default_from="-30d"):
        return p.day("from", default_from), p.day("to", "now")

    def get_daily(self, p, _):
        metric = p.str("metric", required=True)
        frm, to = self._day_range(p)
        if self._kind(metric) == catalog.INTERVAL:
            rows = self.store.events_daily(metric, p.str("source"), frm, to)
        else:
            rows = self.store.daily(metric, p.str("source"), frm, to)
        return {"metric": metric, "kind": self._kind(metric), "unit": self.store.metric(metric)["unit"],
                "tz": self.store.tz_name, "days": rows}

    def get_stats(self, p, _):
        metric = p.str("metric", required=True)
        m = self.store.metric(metric)
        src = p.str("source")
        if m["kind"] == catalog.INTERVAL:
            frm, to = self._day_range(p)
            rows = self.store.events_daily(metric, src, frm, to)
            full = [r for r in rows if not r["partial_day"]]
            return {"metric": metric, "kind": m["kind"], "from": frm, "to": to,
                    "minutes_per_day": stats.describe([r["minutes"] for r in full]),
                    "occurrences_per_day": stats.describe([r["occurrences"] for r in full]),
                    "today": rows[-1] if rows and rows[-1]["partial_day"] else None,
                    "trend_minutes": self.store.trend(metric, src, frm, to, "minutes")["mann_kendall"]}
        frm, to = p.ts("from", "-7d"), p.ts("to", "now")
        vals, capped = self.store.values(metric, src, frm, to, p.num("min_quality"))
        tr = self.store.trend(metric, src, tu.day_of(frm, self._tz()), tu.day_of(to, self._tz()))
        retention = self.store.retention_cutoff()
        return {"metric": metric, "kind": m["kind"], "unit": m["unit"], "source": src or "*",
                "from": tu.iso(frm, self._tz()), "to": tu.iso(to, self._tz()),
                "describe": stats.describe(vals), "capped_at_rows": capped,
                "truncated_by_retention": bool(retention and frm < retention),
                "trend_of_daily_median": {k: tr[k] for k in ("days", "mann_kendall", "sen_slope_per_day")}}

    def get_trend(self, p, _):
        metric = p.str("metric", required=True)
        frm, to = self._day_range(p, "-30d")
        return self.store.trend(metric, p.str("source"), frm, to, p.str("stat"),
                                p.num("min_hours", 0))

    def get_baseline(self, p, _):
        metric = p.str("metric", required=True)
        return self.store.baseline(metric, p.str("source"), p.day("day", "now"),
                                   days=int(p.num("days", 14)), stat=p.str("stat"),
                                   min_hours=p.num("min_hours", 4), z_flag=p.num("z", 2.0))

    def get_profile(self, p, _):
        metric = p.str("metric", required=True)
        frm, to = p.ts("from", "-14d"), p.ts("to", "now")
        return {"metric": metric, "unit": self.store.metric(metric)["unit"], "tz": self.store.tz_name,
                "from": tu.iso(frm, self._tz()), "to": tu.iso(to, self._tz()),
                "hours": self.store.hour_profile(metric, p.str("source"), frm, to)}

    def get_correlation(self, p, _):
        bucket = p.str("bucket", "1h")
        if bucket not in tu.BUCKETS:
            raise ApiError(400, f"bucket must be one of {list(tu.BUCKETS)}")
        return self.store.correlate(p.str("a", required=True), p.str("b", required=True),
                                    p.str("source_a"), p.str("source_b"),
                                    p.ts("from", "-7d"), p.ts("to", "now"), tu.BUCKETS[bucket])

    def get_summary(self, p, _):
        return self.store.day_summary(p.day("day", "now"))


# ── HTTP plumbing ───────────────────────────────────────────────────────────
def make_handler(app: App):
    class Handler(BaseHTTPRequestHandler):
        protocol_version = "HTTP/1.1"

        def _go(self, method):
            u = urlparse(self.path)
            body = None
            n = int(self.headers.get("Content-Length") or 0)
            if n > MAX_BODY:
                self._send(413, {"error": f"body larger than {MAX_BODY} bytes"})
                self.close_connection = True
                return
            if n:
                body = self.rfile.read(n)
            code, payload = app.dispatch(method, u.path.rstrip("/") or "/", u.query, self.headers, body)
            self._send(code, payload)

        def _send(self, code, payload):
            data = json.dumps(payload, ensure_ascii=False, default=str).encode()
            self.send_response(code)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(data)

        def do_GET(self):
            self._go("GET")

        def do_POST(self):
            self._go("POST")

        def do_DELETE(self):
            self._go("DELETE")

        def do_OPTIONS(self):
            self.send_response(204)
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
            self.send_header("Content-Length", "0")
            self.end_headers()

        def log_message(self, *a):
            pass

    return Handler


def maintenance_loop(store: Store, stopped: threading.Event, every_s: float):
    last_prune = 0.0
    while not stopped.wait(every_s):
        try:
            n = store.rollup_dirty()
            if n:
                log.debug("rolled up %d metric-days", n)
            if time.time() - last_prune > 3600:
                store.prune()
                last_prune = time.time()
        except Exception:
            log.exception("maintenance failed")


def advertise(port: int):
    """mDNS on Wendy Net, same scheme as modulino-hub (TXT role=...)."""
    try:
        from zeroconf import IPVersion, ServiceInfo, Zeroconf
        from network import interface_ipv4
        address = interface_ipv4()
        zc = Zeroconf(interfaces=[address], ip_version=IPVersion.V4Only)
        info = ServiceInfo("_http._tcp.local.", "data-manager._http._tcp.local.",
                           addresses=[socket.inet_aton(address)], port=port,
                           properties={"role": "data-manager", "path": "/api/v1", "version": VERSION},
                           server=f"data-manager-{uuid.uuid4().hex[:6]}.local.")
        zc.register_service(info, allow_name_change=True)
        log.info("advertising %s at %s:%d", info.name, address, port)
        return zc, info
    except Exception as e:
        log.info("mDNS disabled: %s", e)
        return None, None


def main():
    port = int(os.environ.get("PORT", "8100"))
    data_dir = os.environ.get("DATA_DIR", "/data")
    store = Store(os.path.join(data_dir, "data_manager.db"),
                  tz_name=os.environ.get("TZ_NAME") or "UTC",
                  retention_days=env_f("RAW_RETENTION_DAYS", 180),
                  max_future_s=env_f("MAX_FUTURE_S", 300))
    app = App(store, os.environ.get("API_TOKEN"))
    stopped = threading.Event()
    for sig in (signal.SIGINT, signal.SIGTERM):
        signal.signal(sig, lambda *_: stopped.set())

    threading.Thread(target=maintenance_loop, args=(store, stopped, env_f("ROLLUP_INTERVAL_S", 300)),
                     daemon=True).start()
    server = ThreadingHTTPServer(("0.0.0.0", port), make_handler(app))
    server.daemon_threads = True
    threading.Thread(target=server.serve_forever, daemon=True).start()
    zc, info = advertise(port) if os.environ.get("MDNS", "1") not in ("0", "false") else (None, None)
    log.info("data manager on :%d (db=%s, tz=%s, retention=%sd, auth=%s)", port, store.path,
             store.tz_name, store.retention_days, bool(app.token))
    try:
        stopped.wait()
    finally:
        log.info("shutting down")
        if zc:
            zc.unregister_service(info)
            zc.close()
        server.shutdown()
        store.rollup_dirty()
        store.close()


if __name__ == "__main__":
    main()
