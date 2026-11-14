"""OpenAPI 3.0 description of the data manager API, served at GET /api/v1/openapi.json.

Import it into Postman / Insomnia / Swagger Editor, or generate a client from it.
tests/test_api.py checks that every route in app.App has an entry here and vice versa,
so this file cannot silently drift from the server.
"""
from __future__ import annotations


def _p(name, desc, schema=None, required=False, example=None, where="query"):
    p = {"name": name, "in": where, "required": required, "description": desc,
         "schema": schema or {"type": "string"}}
    if example is not None:
        p["example"] = example
    return p


TIME = ("Epoch seconds, epoch ms (> 1e11), ISO 8601 (`2026-11-14T08:00:00+01:00`), "
        "or relative: `now`, `-30m`, `-24h`, `-7d`.")
DAY = "Local day `YYYY-MM-DD` (TZ_NAME), or any time value as for `from`/`to`."

METRIC = _p("metric", "Metric name from the catalog, e.g. `vitals.heart_rate_bpm`.", required=True,
            example="vitals.heart_rate_bpm")
SOURCE = _p("source", "Only this source, e.g. `modulino-hub/finger1`. Omitted = all sources "
                      "(for daily aggregates: the pooled `*` row).", example="modulino-hub/finger1")
MINQ = _p("min_quality", "Only samples with `quality >=` this value.", {"type": "number"})


def FROM(default):
    return _p("from", f"Range start (default `{default}`). {TIME}", example=default)


def TO(default="now"):
    return _p("to", f"Range end (default `{default}`). {TIME}")


def DFROM(default):
    return _p("from", f"First day (default `{default}`). {DAY}", example=default)


DTO = _p("to", f"Last day (default today). {DAY}")
BUCKET = _p("bucket", "Bucket width.", {"type": "string", "enum": ["1m", "5m", "15m", "30m", "1h", "3h", "6h", "1d"]})
STAT = _p("stat", "Daily value used. Samples: n, mean, std, min, p10, p25, median (default), p75, p90, max. "
                  "Intervals: minutes (default), occurrences, mean_value, max_value.")
MIN_HOURS = _p("min_hours", "Ignore days with fewer observed hours (samples only).", {"type": "number"})


def _obj(props: dict, required=()):
    o = {"type": "object", "properties": props}
    if required:
        o["required"] = list(required)
    return o


S = {"type": "string"}
N = {"type": "number"}
I = {"type": "integer"}
B = {"type": "boolean"}
TSV = {"oneOf": [N, S], "description": TIME.split(", or relative")[0] + "."}
NULLN = {"type": "number", "nullable": True}

SCHEMAS = {
    "Error": _obj({"error": S}, ["error"]),
    "Sample": _obj({
        "metric": {**S, "example": "env.temperature_c"},
        "value": {**N, "example": 21.4},
        "ts": {**TSV, "description": "Measurement time. Default: server time on receipt."},
        "source": {**S, "description": "Overrides the batch source. 1-64 chars [A-Za-z0-9._/:-]."},
        "quality": {**N, "description": "Producer-defined confidence (0..1, SNR …). Stored, filterable."},
        "meta": {"type": "object", "description": "Free JSON object, <= 4 KB."},
    }, ["metric", "value"]),
    "SampleBatch": _obj({
        "source": {**S, "example": "modulino-hub"},
        "samples": {"type": "array", "maxItems": 10000, "items": {"$ref": "#/components/schemas/Sample"}},
    }, ["samples"]),
    "Event": _obj({
        "kind": {**S, "example": "presence.guest_visit"},
        "start": TSV,
        "end": {**TSV, "nullable": True, "description": "null / omitted = still ongoing."},
        "value": {**N, "description": "e.g. number of guests."},
        "id": {**S, "description": "Producer id, 1-128 chars. Re-sending the same (source, kind, id) "
                                  "updates the interval. Default: the start time in ms."},
        "source": S,
        "meta": {"type": "object"},
    }, ["kind", "start"]),
    "EventBatch": _obj({
        "source": {**S, "example": "afferent-presence"},
        "events": {"type": "array", "maxItems": 10000, "items": {"$ref": "#/components/schemas/Event"}},
    }, ["events"]),
    "Rejected": _obj({"index": I, "metric": S, "kind": S, "reason": S}),
    "IngestResult": _obj({
        "accepted": I,
        "rejected": {"type": "array", "items": {"$ref": "#/components/schemas/Rejected"}},
        "events": {"type": "array", "items": _obj({"index": I, "id": I, "ext_id": S}),
                   "description": "POST /events only: internal id of each stored interval."},
        "server_time": {**I, "description": "Server clock, epoch ms: lets producers measure their clock skew."},
    }),
    "MetricDefinition": _obj({
        "name": {**S, "example": "env.pm25_ugm3", "pattern": "^[a-z][a-z0-9_]*(\\.[a-z0-9_]+)+$"},
        "kind": {"type": "string", "enum": ["sample", "interval"], "default": "sample"},
        "unit": {**S, "example": "µg/m³"},
        "min": NULLN, "max": NULLN,
        "description": S,
        "baseline_min_hours": {**N, "default": 4, "minimum": 0, "maximum": 24,
                               "description": "Observed hours a day needs to enter GET /baseline."},
    }, ["name"]),
    "Metric": _obj({"name": S, "kind": S, "unit": S, "min": NULLN, "max": NULLN, "description": S,
                    "builtin": B, "baseline_min_hours": NULLN, "count": I, "first": S, "last": S}),
    "Pooling": _obj({"sources_pooled": {"type": "array", "items": S,
                                        "description": "Only when `source` is omitted (sample metrics)."},
                     "warning": {**S, "description": "Present when more than one source was pooled."}}),
    "Describe": _obj({k: NULLN for k in ("mean", "std", "min", "p10", "p25", "median", "p75", "p90",
                                         "max", "iqr")} | {"n": I}),
    "MannKendall": _obj({"n": I, "s": NULLN, "tau": NULLN, "z": NULLN, "p": NULLN,
                         "trend": {"type": "string",
                                   "enum": ["increasing", "decreasing", "no trend", "insufficient data"]}}),
    "DailySample": _obj({"day": S, "n": I, "mean": N, "std": NULLN, "min": N, "p10": N, "p25": N,
                         "median": N, "p75": N, "p90": N, "max": N,
                         "hours_covered": {**I, "description": "Distinct local hours with >= 1 sample (0-24)."},
                         "first_ts": I, "last_ts": I}),
    "DailyInterval": _obj({"day": S, "occurrences": I, "minutes": N, "share_of_day": NULLN,
                           "partial_day": {**B, "description": "true for today (still running)."},
                           "mean_value": NULLN, "max_value": NULLN}),
}


def _resp(desc, schema=None, example=None):
    content = {"application/json": {"schema": schema or {"type": "object"}}}
    if example is not None:
        content["application/json"]["example"] = example
    return {"description": desc, "content": content}


ERR = {"400": _resp("Invalid parameter, unknown metric, bad JSON", {"$ref": "#/components/schemas/Error"}),
       "401": _resp("Missing or wrong bearer token (only when API_TOKEN is set)",
                    {"$ref": "#/components/schemas/Error"})}


def _op(summary, desc, params=(), body=None, ok=None, tag="read", extra_err=None):
    op = {"summary": summary, "description": desc, "tags": [tag], "parameters": list(params),
          "responses": {"200": ok or _resp("OK"), **ERR, **(extra_err or {})}}
    if body:
        op["requestBody"] = {"required": True, "content": {"application/json": {"schema": body}}}
    return op


def _ref(name):
    return {"$ref": f"#/components/schemas/{name}"}


PATHS = {
    ("GET", "/health"): _op(
        "Liveness", "Always open (no token). Version, uptime, counters since start.", tag="ops",
        ok=_resp("OK", example={"ok": True, "version": "0.2.0", "uptime_s": 42,
                                "ingested_since_start": {"samples": 0, "events": 0, "rejected": 0}})),
    ("GET", "/"): _op("Endpoint index", "Same as GET /api/v1.", tag="ops"),
    ("GET", "/api/v1"): _op("Endpoint index", "List of routes.", tag="ops"),
    ("GET", "/api/v1/openapi.json"): _op("This OpenAPI document", "", tag="ops"),
    ("GET", "/api/v1/info"): _op("Database info", "Path, size, counts, time zone, retention, auth on/off.",
                                 tag="ops"),
    ("GET", "/api/v1/metrics"): _op(
        "Metric catalog", "Every accepted metric with unit, plausible range, count and first/last time.",
        ok=_resp("OK", _obj({"metrics": {"type": "array", "items": _ref("Metric")}}))),
    ("POST", "/api/v1/metrics"): _op(
        "Register a metric", "Declare a new sensor once (e.g. a PM2.5 sensor). Built-ins cannot be redefined; "
        "re-posting an existing custom metric updates its unit/range/description.",
        body=_ref("MetricDefinition"), tag="write"),
    ("POST", "/api/v1/samples"): _op(
        "Store samples",
        "Body: a batch `{source, samples: [...]}`, a bare list, or one sample object. Valid items are stored, "
        "invalid ones are listed in `rejected` with a reason (unknown metric, out of plausible range, NaN, "
        "timestamp > MAX_FUTURE_S in the future or older than the raw retention). Upsert on "
        "(metric, source, ts): re-sending is safe.",
        body={"oneOf": [_ref("SampleBatch"), {"type": "array", "items": _ref("Sample")}, _ref("Sample")]},
        ok=_resp("OK", _ref("IngestResult")), tag="write",
        extra_err={"413": _resp("More than 10 000 items or 2 MB", _ref("Error"))}),
    ("GET", "/api/v1/samples"): _op(
        "Raw samples", "Newest first by default.",
        [METRIC, SOURCE, FROM("-24h"), TO(), _p("limit", "Max rows (default 1000, max 100 000).", I),
         _p("order", "desc (default) or asc.", {"type": "string", "enum": ["desc", "asc"]}), MINQ]),
    ("POST", "/api/v1/events"): _op(
        "Store / update intervals",
        "Open an interval by sending it without `end`; close it by re-sending the same `id` with `end`. "
        "Upsert on (source, kind, id).",
        body={"oneOf": [_ref("EventBatch"), {"type": "array", "items": _ref("Event")}, _ref("Event")]},
        ok=_resp("OK", _ref("IngestResult")), tag="write"),
    ("GET", "/api/v1/events"): _op(
        "Intervals", "Intervals overlapping the range, newest first, with `ongoing` and `duration_min`.",
        [_p("kind", "e.g. presence.guest_visit. Omitted = all kinds."), SOURCE, FROM("-7d"), TO(),
         _p("limit", "Max rows (default 1000).", I)]),
    ("DELETE", "/api/v1/events/{id}"): _op(
        "Delete an interval", "By internal id (from POST /events or GET /events).",
        [_p("id", "Internal event id.", I, required=True, where="path")], tag="write",
        extra_err={"404": _resp("No such event", _ref("Error"))}),
    ("GET", "/api/v1/latest"): _op(
        "Latest values", "Last value of every (metric, source), with `age_s` (now - measurement) and "
        "`lag_s` (receipt - measurement: large and steady = the producer's clock is slow)."),
    ("GET", "/api/v1/series"): _op(
        "Time series", "Per bucket: n, mean, min, max. Buckets are UTC-aligned (use /daily for local days). "
        "At most 20 000 buckets per call.", [METRIC, SOURCE, FROM("-24h"), TO(), BUCKET, MINQ]),
    ("GET", "/api/v1/daily"): _op(
        "Daily aggregates",
        "Samples: one row per local day with n, mean, std, percentiles, hours_covered. "
        "Intervals: minutes covered (union, clipped to the day), occurrences, share_of_day.",
        [METRIC, SOURCE, DFROM("-30d"), DTO],
        ok=_resp("OK", _obj({"metric": S, "kind": S, "unit": S, "tz": S, "days": {"type": "array", "items": {
            "oneOf": [_ref("DailySample"), _ref("DailyInterval")]}}}))),
    ("GET", "/api/v1/stats"): _op(
        "Descriptive statistics",
        "Samples: describe() over raw samples in the range + Mann-Kendall trend of daily medians. "
        "Intervals: describe() of minutes and occurrences per complete day + trend.",
        [METRIC, SOURCE, FROM("-7d (samples) / -30d (intervals)"), TO(), MINQ]),
    ("GET", "/api/v1/trend"): _op(
        "Trend of daily values", "Mann-Kendall test (p < 0.05 => increasing/decreasing) and Theil-Sen slope "
        "per day, plus the daily values used.", [METRIC, SOURCE, DFROM("-30d"), DTO, STAT, MIN_HOURS],
        ok=_resp("OK", _obj({"metric": S, "stat": S, "days": I, "mann_kendall": _ref("MannKendall"),
                             "sen_slope_per_day": NULLN,
                             "daily": {"type": "array", "items": _obj({"day": S, "value": N})}}))),
    ("GET", "/api/v1/baseline"): _op(
        "Deviation from the personal baseline",
        "z = (value of `day` - median of the previous `days` days) / (1.4826 x MAD). |z| >= `z` => "
        "`above usual range` / `below usual range`. Needs >= 5 baseline days. Exploratory, not a diagnosis.",
        [METRIC, SOURCE, _p("day", f"Day to assess (default today). {DAY}"),
         _p("days", "Baseline length in days (default 14).", I), STAT,
         _p("min_hours", "Skip baseline days with fewer observed hours (samples only). Default: the "
                         "metric's baseline_min_hours (4 environment/presence, 1 posture, 0 vitals).", N),
         _p("z", "Flag threshold (default 2).", N)],
        ok=_resp("OK", _obj({"value": NULLN, "min_hours": N, "baseline_n": I, "baseline_median": NULLN,
                             "baseline_spread": NULLN, "z": NULLN,
                             "flat": {**B, "description": "History without any variation: z is null, "
                                                          "the verdict compares with the median."},
                             "verdict": {"type": "string", "enum": [
                                 "within usual range", "above usual range", "below usual range",
                                 "no data for this day", "baseline too short (needs >= 5 days)"]},
                             "sources_pooled": {"type": "array", "items": S}, "warning": S}))),
    ("GET", "/api/v1/profile"): _op(
        "Hour-of-day profile", "Mean per local hour (0-23) over the range: circadian pattern.",
        [METRIC, SOURCE, FROM("-14d"), TO()]),
    ("GET", "/api/v1/correlation"): _op(
        "Correlation of two metrics", "Pearson and Spearman on bucket means of the common buckets, Fisher-z "
        "p-values (descriptive: successive buckets are not independent).",
        [_p("a", "First metric.", required=True), _p("b", "Second metric.", required=True),
         _p("source_a", "Source filter for a."), _p("source_b", "Source filter for b."),
         FROM("-7d"), TO(), BUCKET]),
    ("GET", "/api/v1/summary"): _op(
        "One-day summary", "Daily stats of every sample metric (per source and pooled) and minutes / "
        "occurrences of every interval kind for one local day.", [_p("day", f"Default today. {DAY}")]),
}

# routes outside /api/ need no token
for _open in (("GET", "/health"), ("GET", "/")):
    PATHS[_open]["security"] = []


def spec(version: str) -> dict:
    paths: dict = {}
    for (method, path), op in PATHS.items():
        paths.setdefault(path, {})[method.lower()] = op
    return {
        "openapi": "3.0.3",
        "info": {
            "title": "afferent-data-manager",
            "version": version,
            "description": "Sensor database of the Afferent home system. Producers push samples and "
                           "intervals; consumers query raw data, aggregates and statistics. "
                           "All statistics are exploratory and relative to one person's own history. "
                           "Full guide: jetson/data_manager/API.md.",
        },
        "servers": [{"url": "http://localhost:8100", "description": "wendy net forward 8100:8100"},
                    {"url": "http://{host}:8100", "variables": {"host": {"default": "127.0.0.1"}}}],
        "security": [{"bearer": []}],
        "tags": [{"name": "write"}, {"name": "read"}, {"name": "ops"}],
        "paths": paths,
        "components": {
            "securitySchemes": {"bearer": {"type": "http", "scheme": "bearer",
                                           "description": "Required on every /api/* route. The service "
                                                          "refuses to start without API_TOKEN unless "
                                                          "ALLOW_NO_AUTH=1 (local development)."}},
            "schemas": SCHEMAS,
        },
    }
