# afferent-data-manager — API guide

How to **send** data to the data manager and how to **query** it: every endpoint, its
parameters, real example responses, errors, and copy-paste recipes for the questions the
team actually asks ("how long was the patient home this week?", "is posture worse than
usual?", "do the finger and the camera agree on heart rate?").

- Machine-readable spec: `GET /api/v1/openapi.json` (OpenAPI 3.0). Import it into
  Postman / Insomnia / Swagger Editor, or generate a client from it.
- Service overview, deployment and storage: [README.md](README.md).
- The examples below come from a real run (21 days of `tools/simulate.py` data,
  `TZ_NAME=Europe/Paris`); long lists are cut with `…`.

---

## 1. Basics

### Base URL

| From | URL |
|---|---|
| An app on Wendy Net (UNO Q, Jetson mesh apps) | discovered over mDNS: `_http._tcp`, TXT `role=data-manager`, `path=/api/v1`, port **8100** |
| `afferent-presence` (Jetson, host networking) | `http://127.0.0.1:8100` |
| A laptop | `wendy net forward 8100:8100 --device "$JETSON"` then `http://localhost:8100` |

In the examples: `DM=http://localhost:8100`.

### Authentication

Every `/api/*` request needs

```
Authorization: Bearer <API_TOKEN>
```

otherwise → `401 {"error": "missing or wrong bearer token"}` (reads, writes and deletes
alike). `/health` is always open. The service **refuses to start without `API_TOKEN`**
(`API_TOKEN is not set …`, exit code 2) unless `ALLOW_NO_AUTH=1`, which opens the whole
API and is for local development only. Generate a token with `openssl rand -hex 16`.

### Conventions

| Topic | Rule |
|---|---|
| Format | JSON in and out (`Content-Type: application/json`), UTF-8. |
| Timestamps (stored) | epoch **milliseconds**, UTC (`ts`, `start`, `end`). Responses also carry ISO strings in the home time zone (`time`, `start_time`, `end_time`). |
| Timestamps (input) | epoch seconds (`1794642860.5`), epoch ms (any number > 1e11), ISO 8601 (`2026-11-14T18:05:00+01:00`, `…Z`, `2026-11-14`), between 1970 and 2100. **Query parameters only** also accept `now`, `-30m`, `-24h`, `-7d`. |
| Days | local calendar days in `TZ_NAME` (`YYYY-MM-DD`), DST-safe. Wherever a `day` is expected you can also pass a time (`-1d` = yesterday). |
| Metric names | `group.name_unit`, lowercase, e.g. `env.co2_ppm`. Only catalog metrics are accepted (§3). |
| Sources | who measured it: 1–64 chars `[A-Za-z0-9._/:-]`, e.g. `modulino-hub`. Use one source per sensor / context. A measurement with a different error profile is a different *metric* (camera heart rate is `vitals.heart_rate_camera_bpm`), not a source. |
| CORS | `Access-Control-Allow-Origin: *`: a browser dashboard can call the API directly. |
| Trailing slash | ignored (`/api/v1/latest/` = `/api/v1/latest`). |
| Versioning | everything is under `/api/v1`. Fields may be **added** within v1; renaming or removing a field means `/api/v2`. Clients should ignore unknown fields. |

### Errors

Every error is `{"error": "<human readable reason>"}`.

| Status | When |
|---|---|
| 400 | missing / invalid parameter, unknown metric, invalid JSON, bad value |
| 401 | token required and missing / wrong |
| 404 | unknown route, or `DELETE` of an event that does not exist |
| 405 | known route, wrong method |
| 413 | body > 2 MB or > 10 000 items |
| 500 | bug — the server keeps running; check the logs |

```sh
curl "$DM/api/v1/series?metric=env.co2_ppm&bucket=7m"
{"error": "bucket must be one of ['1m', '5m', '15m', '30m', '1h', '3h', '6h', '1d']"}
curl "$DM/api/v1/samples?metric=env.co2"
{"error": "unknown metric 'env.co2' (register it with POST /api/v1/metrics)"}
```

**Writes never fail as a whole because of one bad item**: `POST /samples` and
`POST /events` return `200`, store every valid item, and list the others in `rejected`
with their index and reason (§2).

---

## 2. Sending data

### `POST /api/v1/samples` — point measurements

Body: a batch (preferred), a bare list, or one sample.

```json
{
  "source": "modulino-hub",
  "samples": [
    {"metric": "env.temperature_c", "value": 21.4},
    {"metric": "vitals.heart_rate_bpm", "value": 76, "quality": 0.62},
    {"metric": "vitals.heart_rate_bpm", "value": 310},
    {"metric": "env.co2", "value": 600}
  ]
}
```

| Field | Req. | Meaning |
|---|---|---|
| `metric` | yes | catalog name |
| `value` | yes | finite number inside the metric's plausible range |
| `ts` | no | measurement time; default = server time on receipt. Send it whenever you buffer or batch. |
| `source` | yes* | per item, or once for the batch |
| `quality` | no | producer-defined confidence (0..1, SNR in dB …); stored and filterable with `min_quality` |
| `meta` | no | free JSON object, ≤ 4 KB (context, window size, versions …) |

Response (`200`):

```json
{
  "accepted": 2,
  "rejected": [
    {"index": 2, "metric": "vitals.heart_rate_bpm", "reason": "value 310 above plausible maximum 220.0 bpm"},
    {"index": 3, "metric": "env.co2", "reason": "unknown metric 'env.co2' (register it with POST /api/v1/metrics)"}
  ],
  "server_time": 1794655809570
}
```

`accepted` is the number of rows actually written. `server_time` (epoch ms) lets a
producer check its own clock (the Python client does it for you, see §6).

Rejected reasons: unknown metric, sample sent to an interval metric, a field of the wrong
type (a list as `metric` …), value missing / NaN / out of range, bad source, `meta` not an
object or > 4 KB, timestamp unparseable / infinite / outside 1970–2100, more than
`MAX_FUTURE_S` (default 5 min) in the future (fix the producer's clock), older than the raw
retention window (default 180 days). A malformed item never fails the rest of its batch.

**Idempotent**: a sample is keyed by `(metric, source, ts)`. Re-sending it (retry after a
timeout) overwrites, never duplicates. Two items of the **same batch** with the same key are
one row too: the later one is stored and the earlier one is listed in `rejected`. That is
what happens to a batch sent without `ts` (every item gets the receipt time):

```json
{"accepted": 1, "rejected": [{"index": 0, "metric": "env.co2_ppm",
  "reason": "overwritten by item 1: same metric, source and ts (send a distinct ts per sample)"}],
 "server_time": 1794655809585}
```

So: always send `ts` when you batch.

**Rates**: send derived values — a BPM every few seconds, a minute median of an angle,
climate once a minute. Raw waveforms (45 Hz PPG, video) do not belong here.

### `POST /api/v1/events` — intervals

For things with a duration: the patient at home, an outing, a guest visit.

```json
{"source": "afferent-presence",
 "events": [{"kind": "presence.guest_visit", "id": "visit-demo",
             "start": "2026-11-14T09:00:11Z", "value": 2}]}
```

| Field | Req. | Meaning |
|---|---|---|
| `kind` | yes | an interval metric (`presence.home`, `presence.outing`, `presence.guest_visit`) |
| `start` | yes | start time |
| `end` | no | end time; omitted / `null` = **still ongoing** (counted until now) |
| `value` | no | e.g. number of guests; must be inside the metric's range |
| `id` | no | your id, 1–128 chars `[A-Za-z0-9._:/-]`; default = start time in ms |
| `source`, `meta` | | as for samples |

Lifecycle: open the interval without `end`, close it by sending **the same `id`** with
`end`. Upsert on `(source, kind, id)`; a re-send without `value` / `meta` keeps the stored
ones.

```sh
# open
curl -X POST $DM/api/v1/events -H 'Content-Type: application/json' -d '{"source":"afferent-presence",
  "events":[{"kind":"presence.guest_visit","id":"visit-demo","start":"2026-11-14T09:00:11Z","value":2}]}'
{"accepted": 1, "events": [{"index": 0, "id": 87, "ext_id": "visit-demo"}], "rejected": []}
# close (peak went up to 3)
curl -X POST $DM/api/v1/events -H 'Content-Type: application/json' -d '{"source":"afferent-presence",
  "events":[{"kind":"presence.guest_visit","id":"visit-demo","start":"2026-11-14T09:00:11Z",
             "end":"2026-11-14T09:35:11Z","value":3}]}'
{"accepted": 1, "events": [{"index": 0, "id": 87, "ext_id": "visit-demo"}], "rejected": []}
```

`id` in the response (`87`) is the internal id, used by `DELETE`. Responses also carry
`server_time`, as for samples.

### `DELETE /api/v1/events/{id}`

Removes one interval (e.g. a test entry). `200 {"ok": true}` or `404`.

### `POST /api/v1/metrics` — register a new sensor

Unknown metrics are rejected on purpose (a typo never creates a silent new series).
Declare a new one once:

```sh
curl -X POST $DM/api/v1/metrics -H 'Content-Type: application/json' \
  -d '{"name":"env.pm25_ugm3","kind":"sample","unit":"µg/m³","min":0,"max":1000,"description":"Fine particles"}'
{"ok": true, "metric": {"name": "env.pm25_ugm3", "kind": "sample", "unit": "µg/m³", "min": 0.0,
 "max": 1000.0, "description": "Fine particles", "builtin": 0, "created": 1794649211358}}
```

`kind` is `sample` (default) or `interval`; `min`/`max` may be `null` (no range check).
It is stored in the DB and survives restarts. Built-in metrics cannot be redefined;
re-posting a custom one updates its unit / range / description (not its kind).

---

## 3. Catalog

`GET /api/v1/metrics` lists everything accepted, with counts:

```json
{"metrics": [
  {"name": "env.co2_ppm", "kind": "sample", "unit": "ppm", "min": 250.0, "max": 10000.0,
   "description": "Indoor CO2 concentration (planned sensor)", "builtin": true,
   "count": 6176, "first": "2026-10-24T01:00:00+02:00", "last": "2026-11-14T10:35:00+01:00"},
  "…"]}
```

Built-in metrics and who sends them today:

| Metric | Kind | Unit | Range | Sent by (source) |
|---|---|---|---|---|
| `env.temperature_c` | sample | °C | −20…60 | `modulino-hub` (mean / 60 s) |
| `env.humidity_pct` | sample | %RH | 0…100 | `modulino-hub` (mean / 60 s) |
| `env.co2_ppm` | sample | ppm | 250…10000 | future CO2 sensor |
| `vitals.heart_rate_bpm` | sample | bpm | 30…220 | contact sensors: `modulino-hub` (fused finger reading, only while a finger is on the clip) |
| `vitals.heart_rate_camera_bpm` | sample | bpm | 30…220 | `afferent-vision` (fused rPPG, `quality` = trust score / 100) |
| `vitals.hrv_rmssd_ms` | sample | ms | 1…300 | `modulino-hub` |
| `vitals.breathing_rate_per_min` | sample | /min | 3…60 | `modulino-hub` |
| `posture.trunk_inclination_deg` | sample | deg | −90…90 | `posture/<site>/<activity>-<orientation>`, minute medians, standing / walking only |
| `posture.head_trunk_angle_deg` | sample | deg | 0…180 | same as above |
| `presence.home` | interval | | | `afferent-presence` |
| `presence.outing` | interval | | | `afferent-presence` |
| `presence.guest_visit` | interval | guests | 0…50 | `afferent-presence` (`value` = peak guests) |

---

## 4. Reading data

All read endpoints are `GET`. Ranges default to something sensible, so most calls only
need `metric`. `source` omitted = all sources pooled: `/series`, `/daily`, `/stats`,
`/trend` and `/baseline` then list them in `sources_pooled`, and add a `warning` when there
is more than one, because pooling two sensors is rarely what you want:

```json
{"metric": "vitals.heart_rate_bpm", "kind": "sample", "unit": "bpm", "tz": "Europe/Paris",
 "sources_pooled": ["modulino-hub", "sim/finger1"],
 "warning": "2 sources pooled; pass source=<one of sources_pooled> to compare like with like",
 "days": ["…"]}
```

| Endpoint | Question it answers | Main parameters (default) |
|---|---|---|
| [`/latest`](#latest) | what is each sensor saying right now? | – |
| [`/samples`](#samples) | the raw values | `metric`, `source`, `from` (-24h), `to`, `limit` (1000), `order` (desc), `min_quality` |
| [`/series`](#series) | a curve to plot | `metric`, `source`, `from` (-24h), `to`, `bucket` (5m), `min_quality` |
| [`/daily`](#daily) | one row per day | `metric`, `source`, `from` (-30d), `to` (today) |
| [`/summary`](#summary) | everything about one day | `day` (today) |
| [`/stats`](#stats) | distribution over a period | `metric`, `source`, `from` (-7d; -30d for intervals), `to`, `min_quality` |
| [`/trend`](#trend) | is it going up or down over days? | `metric`, `source`, `from` (-30d), `to`, `stat`, `min_hours` (0) |
| [`/baseline`](#baseline) | is this day unusual for this person? | `metric`, `source`, `day` (today), `days` (14), `stat`, `min_hours` (per metric), `z` (2) |
| [`/profile`](#profile) | what does a typical day look like? | `metric`, `source`, `from` (-14d), `to` |
| [`/correlation`](#correlation) | do two signals move together? | `a`, `b`, `source_a`, `source_b`, `from` (-7d), `to`, `bucket` (1h) |
| [`/events`](#events) | list of intervals | `kind`, `source`, `from` (-7d), `to`, `limit` |
| `/info`, `/health`, `/openapi.json` | service state, spec | – |

`stat` = which daily value `/trend` and `/baseline` use. Sample metrics: `median`
(default), `mean`, `p10`, `p25`, `p75`, `p90`, `min`, `max`, `std`, `n`. Interval metrics:
`minutes` (default), `occurrences`, `mean_value`, `max_value`.

<a id="latest"></a>
### `GET /api/v1/latest`

```json
{"latest": [
  {"metric": "env.co2_ppm", "source": "demo", "ts": 1794655809585, "value": 610.0, "quality": null,
   "unit": "ppm", "lag_s": 0.0, "time": "2026-11-14T12:30:09+01:00", "age_s": 0},
  {"metric": "env.co2_ppm", "source": "sim/co2", "ts": 1794655800000, "value": 878.0, "quality": null,
   "unit": "ppm", "lag_s": 9.5, "time": "2026-11-14T12:30:00+01:00", "age_s": 10},
  "…"]}
```

`age_s` (now − measurement) tells you whether a producer has gone quiet. `lag_s` (receipt −
measurement) tells you about its clock: a few seconds is normal batching, a large steady
lag means the producer's clock is slow (a fast clock is rejected outright).

<a id="samples"></a>
### `GET /api/v1/samples`

```sh
curl "$DM/api/v1/samples?metric=vitals.heart_rate_bpm&source=sim/finger1&from=-1h&limit=2"
```
```json
{"metric": "vitals.heart_rate_bpm", "unit": "bpm", "count": 2, "samples": [
  {"ts": 1794648900000, "source": "sim/finger1", "value": 67.0, "quality": 0.75, "meta": null,
   "time": "2026-11-14T10:35:00+01:00"},
  {"ts": 1794648600000, "source": "sim/finger1", "value": 65.0, "quality": 0.63, "meta": null,
   "time": "2026-11-14T10:30:00+01:00"}]}
```

`limit` max 100 000; page through longer ranges with `to` = oldest `ts` − 1 and `order=desc`.
Raw samples older than `RAW_RETENTION_DAYS` are gone: use `/daily` for long periods.

<a id="series"></a>
### `GET /api/v1/series`

Per bucket: `n`, `mean`, `min`, `max`. `bucket`: `1m 5m 15m 30m 1h 3h 6h 1d`, at most
20 000 buckets per call. Buckets are aligned on UTC: for calendar days use `/daily`.
Empty buckets are omitted (gaps = no data).

```sh
curl "$DM/api/v1/series?metric=vitals.heart_rate_bpm&source=sim/finger1&from=-3h&bucket=1h"
```
```json
{"metric": "vitals.heart_rate_bpm", "unit": "bpm", "bucket": "1h",
 "note": "buckets are aligned on UTC; use /daily for local calendar days",
 "series": [
  {"ts": 1794636000000, "n": 4, "mean": 64.5, "min": 61.0, "max": 68.0, "time": "2026-11-14T07:00:00+01:00"},
  {"ts": 1794639600000, "n": 12, "mean": 67.333, "min": 61.0, "max": 71.0, "time": "2026-11-14T08:00:00+01:00"},
  "…"]}
```

<a id="daily"></a>
### `GET /api/v1/daily`

**Sample metric** — full daily statistics, plus `hours_covered` (how many of the 24 local
hours have at least one sample: a median from 2 hours is not comparable with one from 14):

```sh
curl "$DM/api/v1/daily?metric=env.co2_ppm&from=-2d"
```
```json
{"metric": "env.co2_ppm", "kind": "sample", "unit": "ppm", "tz": "Europe/Paris", "days": [
  {"day": "2026-11-12", "n": 288, "mean": 850.371, "std": 127.918, "min": 418.0, "p10": 761.0,
   "p25": 785.0, "median": 816.5, "p75": 977.25, "p90": 1011.9, "max": 1069.0,
   "hours_covered": 24, "first_ts": 1794438000000, "last_ts": 1794524100000},
  "…"]}
```

**Interval metric** — minutes covered and occurrences per day:

```sh
curl "$DM/api/v1/daily?metric=presence.home&from=-2d"
```
```json
{"metric": "presence.home", "kind": "interval", "unit": "", "tz": "Europe/Paris", "days": [
  {"day": "2026-11-12", "occurrences": 2, "minutes": 1377.4, "share_of_day": 0.957,
   "partial_day": false, "mean_value": null, "max_value": null},
  {"day": "2026-11-13", "occurrences": 2, "minutes": 1400.1, "share_of_day": 0.972,
   "partial_day": false, "mean_value": null, "max_value": null},
  {"day": "2026-11-14", "occurrences": 1, "minutes": 639.9, "share_of_day": 1.0,
   "partial_day": true, "mean_value": null, "max_value": null}]}
```

- `minutes` = union of the intervals clipped to the day (overlaps are not counted twice;
  an ongoing interval counts until now). `occurrences` = intervals that **start** that day.
- `share_of_day` = minutes / length of the day; for today (`partial_day: true`) it is
  relative to the time elapsed so far.
- `mean_value` / `max_value` = over the intervals starting that day (guests per visit).
- Days before the kind was first ever reported are absent (no data ≠ 0 minutes).
  A day with the producer down still looks like 0: check `/latest` or the producer's health.
- The running day's sample row may lag the latest writes by up to 5 s.

<a id="summary"></a>
### `GET /api/v1/summary?day=`

Everything for one day: per sample metric, the daily stats per source and pooled (`*`);
per interval kind, its daily row. Good for a "today" screen.

```json
{"day": "2026-11-14", "tz": "Europe/Paris",
 "samples": {"vitals.heart_rate_bpm": {
    "*": {"n": 146, "mean": 63.336, "median": 63.0, "p90": 69.0, "hours_covered": 11, "unit": "bpm", "…": "…"},
    "sim/finger1": {"n": 128, "mean": 62.82, "median": 63.0, "hours_covered": 11, "unit": "bpm", "…": "…"}},
   "…": "…"},
 "intervals": {
   "presence.guest_visit": {"day": "2026-11-14", "occurrences": 1, "minutes": 35.0, "share_of_day": 0.055,
                            "partial_day": true, "mean_value": 3.0, "max_value": 3.0},
   "presence.home": {"day": "2026-11-14", "occurrences": 1, "minutes": 639.9, "share_of_day": 1.0,
                     "partial_day": true, "mean_value": null, "max_value": null}}}
```

<a id="stats"></a>
### `GET /api/v1/stats`

Sample metric: distribution of the raw samples in the range + trend of the daily medians.

```sh
curl "$DM/api/v1/stats?metric=vitals.heart_rate_bpm&source=sim/finger1"
```
```json
{"metric": "vitals.heart_rate_bpm", "kind": "sample", "unit": "bpm", "source": "sim/finger1",
 "from": "2026-11-07T10:39:55+01:00", "to": "2026-11-14T10:39:55+01:00",
 "describe": {"n": 1828, "mean": 68.78, "std": 7.591, "min": 48.0, "p10": 59.0, "p25": 63.0,
              "median": 68.0, "p75": 75.0, "p90": 79.0, "max": 90.0, "iqr": 12.0},
 "capped_at_rows": false, "truncated_by_retention": false,
 "trend_of_daily_median": {"days": 8,
   "mann_kendall": {"n": 8, "s": -18, "tau": -0.643, "z": -2.437, "p": 0.0148, "trend": "decreasing"},
   "sen_slope_per_day": -0.1833}}
```

Interval metric: `minutes_per_day` and `occurrences_per_day` (complete days only), `today`
(the running day's row), `trend_minutes`. `capped_at_rows: true` means more than 1 million
samples matched and only the first million were used: narrow the range.

<a id="trend"></a>
### `GET /api/v1/trend`

Mann–Kendall test on one value per day (non-parametric, outlier-robust, tie-corrected) and
the Theil–Sen slope (units per day). `trend` is `increasing` / `decreasing` when `p < 0.05`,
`no trend` otherwise, `insufficient data` below 4 days; meaningful from about 10 days.
For sample metrics, days without data are skipped (not filled); for interval metrics a
day without intervals is a real 0. The daily values used are returned.

```sh
curl "$DM/api/v1/trend?metric=presence.outing&from=-21d"            # stat=minutes by default
```
```json
{"metric": "presence.outing", "source": "*", "stat": "minutes", "days": 21,
 "mann_kendall": {"n": 21, "s": -22, "tau": -0.105, "z": -0.634, "p": 0.526, "trend": "no trend"},
 "sen_slope_per_day": -3.5, "unit": "", "first_day": "2026-10-24", "last_day": "2026-11-13",
 "daily": [{"day": "2026-10-24", "value": 255.3}, {"day": "2026-10-25", "value": 139.9}, "…"]}
```

For interval metrics the running day is excluded (it is incomplete).

<a id="baseline"></a>
### `GET /api/v1/baseline`

Compares one day with the same person's previous `days` days:
`z = (value − median of the baseline) / (1.4826 × MAD)` (falls back to the SD when the MAD
is 0). `|z| ≥ z` (default 2) → `above usual range` / `below usual range`.

```sh
curl "$DM/api/v1/baseline?metric=posture.trunk_inclination_deg&day=-1d"
```
```json
{"metric": "posture.trunk_inclination_deg", "source": "*", "stat": "median", "day": "2026-11-13",
 "value": 15.7, "unit": "deg", "baseline_days": 14, "min_hours": 1.0, "baseline_n": 14,
 "baseline_median": 8.05, "baseline_spread": 0.815, "z": 9.38, "flat": false, "z_flag": 2.0,
 "verdict": "above usual range",
 "note": "exploratory, relative to this person's own history - not a diagnosis",
 "sources_pooled": ["sim/posture"]}
```

**Flat history**: when every baseline day has the same value (`baseline_spread: 0`), `z` is
`null` and `flat` is `true`; the verdict is still given: `within usual range` if the day
equals it, `above` / `below usual range` otherwise.

**`min_hours`** (days with fewer observed hours are left out of the baseline) defaults per
metric: 4 for environment and presence, 1 for posture (only measured while standing in
view), 0 for spot-check vitals (heart rate, HRV, breathing: a 10-minute finger session is a
valid day). Pass `min_hours` to override; the value used is in the response.

Other `verdict` values: `within usual range`, `no data for this day`,
`baseline too short (needs >= 5 days)`. For an interval metric on **today**, the value is the
partial day so far: compare yesterday (`day=-1d`) for a fair answer.

<a id="profile"></a>
### `GET /api/v1/profile`

Mean per local hour of day (0–23) over the range — the circadian shape.

```json
{"metric": "vitals.heart_rate_bpm", "unit": "bpm", "tz": "Europe/Paris",
 "from": "2026-10-31T10:39:55+01:00", "to": "2026-11-14T10:39:55+01:00",
 "hours": [{"hour": 0, "n": 168, "hours_observed": 14, "mean": 65.554, "min": 54.0, "max": 75.0},
           {"hour": 1, "n": 168, "hours_observed": 14, "mean": 64.44, "min": 57.0, "max": 71.0}, "…"]}
```

`hours_observed` = how many distinct clock hours fed that slot (14 over 14 days = every day).

<a id="correlation"></a>
### `GET /api/v1/correlation`

Pearson and Spearman between two metrics (or two sources of the same metric) on the
buckets where both have data.

```sh
curl "$DM/api/v1/correlation?a=env.co2_ppm&b=vitals.heart_rate_bpm&from=-14d"
```
```json
{"a": "env.co2_ppm", "b": "vitals.heart_rate_bpm", "bucket_ms": 3600000, "n": 320,
 "pearson_r": -0.489, "pearson_p": 0.0, "spearman_rho": -0.561, "spearman_p": 0.0,
 "note": "correlation of bucket means; does not imply causation"}
```

The p-values assume independent buckets, which successive hours are not: read them as
descriptive.

<a id="events"></a>
### `GET /api/v1/events`

Intervals overlapping `[from, to]`, newest first.

```sh
curl "$DM/api/v1/events?kind=presence.guest_visit&from=-1h"
```
```json
{"count": 1, "events": [
  {"id": 87, "kind": "presence.guest_visit", "source": "afferent-presence", "ext_id": "visit-demo",
   "start": 1794646811000, "end": 1794648911000, "value": 3.0, "meta": null,
   "ongoing": false, "duration_min": 35.0,
   "start_time": "2026-11-14T10:00:11+01:00", "end_time": "2026-11-14T10:35:11+01:00"}]}
```

### Service endpoints

```sh
curl $DM/health
{"ok": true, "version": "0.2.0", "uptime_s": 18, "ingested_since_start": {"samples": 29854, "events": 88, "rejected": 3}}
curl $DM/api/v1/info
{"path": "/tmp/dmx/data_manager.db", "tz": "Europe/Paris", "raw_retention_days": 180.0, "size_mb": 3.4,
 "samples": 29854, "events": 87, "daily_rows": 288, "version": "0.2.0", "auth": false, "now": "2026-11-14T10:40:11+01:00"}
```

---

## 5. Recipes

| Question | Call |
|---|---|
| How long was the patient home each day, last 2 weeks? | `/daily?metric=presence.home&from=-14d` → `minutes`, `share_of_day` |
| How many outings, and how long? | `/daily?metric=presence.outing&from=-14d` → `occurrences`, `minutes` |
| Is the patient going out less and less? | `/trend?metric=presence.outing&stat=minutes&from=-30d` |
| Was yesterday unusually isolated? | `/baseline?metric=presence.outing&day=-1d` (low z = fewer minutes out than usual) |
| Visits this month: how many, how long, how many people? | `/daily?metric=presence.guest_visit&from=-30d` → `occurrences`, `minutes`, `max_value`; details: `/events?kind=presence.guest_visit&from=-30d` |
| Heart rate over the last 2 hours (finger clip) | `/series?metric=vitals.heart_rate_bpm&source=modulino-hub&from=-2h&bucket=1m` |
| Do the camera and the finger agree? | `/correlation?a=vitals.heart_rate_bpm&source_a=modulino-hub&b=vitals.heart_rate_camera_bpm&bucket=1m&from=-1d` |
| Only trustworthy camera readings | `/samples?metric=vitals.heart_rate_camera_bpm&min_quality=0.7` |
| Resting heart rate pattern over the day | `/profile?metric=vitals.heart_rate_bpm&source=modulino-hub&from=-28d` |
| Is HRV lower than usual? | `/baseline?metric=vitals.hrv_rmssd_ms&source=modulino-hub&day=-1d` |
| Is standing posture worse than usual? | `/baseline?metric=posture.trunk_inclination_deg&source=posture/<site>/standing-profile&day=-1d` (same for `posture.head_trunk_angle_deg`) |
| Is posture drifting over the month? | `/trend?metric=posture.head_trunk_angle_deg&source=posture/<site>/standing-profile&from=-30d` |
| Is the bedroom stuffy at night? | `/profile?metric=env.co2_ppm&from=-14d` (hours 0–6) |
| "Right now" dashboard tile | `/latest` + `/summary` |
| Is a producer down? | `/latest` → `age_s` per source |
| Is a producer's clock wrong? | `/latest` → `lag_s` per source (large = slow clock); a fast clock shows up as `rejected` "in the future" |

Use a posture source that matches one context (`…/standing-profile`, `…/walking-profile`,
`…/standing-face`): the pooled `source=*` mixes orientations, which are not comparable.
Posture only arrives while the person is standing in view, so its baseline counts any day
with at least 1 observed hour (the metric's default `min_hours`).

---

## 6. Code

### Python (producers and scripts)

Copy [`client/data_manager_client.py`](client/data_manager_client.py) (stdlib only).
Writes are queued and sent by a background thread (never block, never raise); reads are
synchronous and raise `DataManagerError`.

- `sample()` / `interval()` validate at enqueue and return `False` for an item that could
  not be sent (a value that is not a finite number, `meta` that is not JSON-serialisable …):
  it is logged and counted in `status()["dropped"]` instead of blocking the queue. Numpy
  scalars and `Decimal` are converted to `float`.
- Every write response updates `status()["clock_skew_s"]` (server clock − this device's);
  beyond 60 s a warning is logged.
- mDNS: the first `role=data-manager` advert wins, and a working server is never replaced
  by a later advert; another one is only tried after 3 failed connections in a row. When
  you hold a token, pin the server with `DATA_MANAGER_URL` anyway.

```python
from data_manager_client import DataManagerClient, DataManagerError, Downsampler

dm = DataManagerClient(source="my-sensor")          # DATA_MANAGER_URL / DATA_MANAGER_TOKEN, else mDNS

# write
dm.sample("env.co2_ppm", 640)
dm.interval("presence.guest_visit", start=t0, value=2, id="visit-1")              # open
dm.interval("presence.guest_visit", start=t0, end=t1, value=3, id="visit-1")      # close

ds = Downsampler(window_s=60, how="mean")            # 1 value per minute from a fast stream
w = ds.add(reading)
if w:
    dm.sample("env.co2_ppm", w.value, ts=w.ts, meta={"n": w.n})

# read
home = dm.get("/api/v1/daily", metric="presence.home", **{"from": "-14d"})["days"]
b = dm.get("/api/v1/baseline", metric="presence.outing", day="-1d")
print(b["verdict"], b["z"])
try:
    dm.get("/api/v1/samples", metric="nope.metric")
except DataManagerError as e:
    print(e.status, e)                                # 400 unknown metric 'nope.metric' …

print(dm.status())   # url, queued, sent, rejected, dropped, clock_skew_s, last_error
dm.close()           # flush on shutdown
```

`from` is a Python keyword: pass it as `**{"from": "-7d"}`.

### curl

```sh
TOKEN=…   # API_TOKEN of the service
curl -H "Authorization: Bearer $TOKEN" "$DM/api/v1/daily?metric=presence.home&from=-14d"
curl -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
     -X POST $DM/api/v1/samples -d '{"source":"test","samples":[{"metric":"env.co2_ppm","value":640}]}'
```

### JavaScript (browser dashboard, Node ≥ 18)

```js
const DM = "http://localhost:8100", TOKEN = "…";
async function dm(path, params = {}) {
  const r = await fetch(`${DM}${path}?${new URLSearchParams(params)}`,
                        { headers: { Authorization: `Bearer ${TOKEN}` } });
  const body = await r.json();
  if (!r.ok) throw new Error(`${r.status}: ${body.error}`);
  return body;
}
const { series } = await dm("/api/v1/series",
  { metric: "vitals.heart_rate_bpm", source: "modulino-hub", from: "-2h", bucket: "1m" });
const points = series.map(p => ({ x: new Date(p.ts), y: p.mean }));
```

### Swift (iOS app)

```swift
struct Day: Decodable { let day: String; let minutes: Double; let partial_day: Bool }
struct DailyResponse: Decodable { let days: [Day] }

var c = URLComponents(string: "http://<jetson>:8100/api/v1/daily")!
c.queryItems = [.init(name: "metric", value: "presence.home"), .init(name: "from", value: "-14d")]
var req = URLRequest(url: c.url!)
req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
let (data, _) = try await URLSession.shared.data(for: req)
let days = try JSONDecoder().decode(DailyResponse.self, from: data).days
```

(Plain HTTP needs an App Transport Security exception for that host in `Info.plist`.)

---

## 7. Reading the numbers responsibly

- Everything is relative to **one person's own history**. Nothing here is a diagnosis or
  has been clinically validated.
- Check coverage before interpreting a change: `hours_covered` for samples, the producer's
  `age_s` / health for intervals. Fewer observed hours, not a change in the person, is the
  most common cause of an "unusual" day.
- Compare like with like: one source per sensor and, for posture, one context per source.
  A `warning` in a response means several sources were pooled.
- Check the clocks: `lag_s` in `/latest`, `clock_skew_s` in the client. A board without NTP
  puts its data on the wrong day.
- A trend needs about 10 days; a baseline needs at least 5 (14 by default).
