# afferent-data-manager — one database for every Afferent sensor

Long-running service on the Jetson. Every app or board that measures something
(UNO Q `modulino-hub`, `afferent-presence`, `afferent-vision`, the posture
pipeline, a future CO2 sensor …) **pushes** its values here over HTTP. The data
manager validates them, stores them in SQLite, keeps daily aggregates forever and
answers queries: raw data, time series, daily summaries, trends, deviation from
the person's own baseline, circadian profiles and correlations.

```
 modulino-hub (UNO Q) ─┐  temperature, humidity, finger BPM
 afferent-presence ────┤  presence.home / presence.outing / presence.guest_visit
 afferent-vision ──────┼──► POST /api/v1/samples|events ──► SQLite (/data) ──► GET /api/v1/…
 posture pipeline ─────┤  trunk vs vertical, head vs trunk (standing)
 CO2 sensor (later) ───┘  env.co2_ppm
```

Stdlib-only Python (sqlite3 + http.server, statistics implemented in `stats.py`), like
`jetson/presence`: small image, fast boot, nothing to break on a device that runs for months.

All outputs are **exploratory descriptors relative to one person's own history**,
not a diagnosis and not clinically validated.

## Data model

Two kinds of data, both declared in a catalog (`catalog.py`):

| Kind | Shape | Examples |
|---|---|---|
| `sample` | `(ts, value)` + optional `quality`, `meta` | temperature, heart rate, CO2, angles |
| `interval` | `(start, end, value)`; `end = null` while ongoing | patient at home, outing, guest visit (`value` = number of guests) |

Built-in metrics:

| Name | Kind | Unit | Plausible range |
|---|---|---|---|
| `env.temperature_c` | sample | °C | −20 … 60 |
| `env.humidity_pct` | sample | %RH | 0 … 100 |
| `env.co2_ppm` | sample | ppm | 250 … 10000 |
| `vitals.heart_rate_bpm` | sample | bpm | 30 … 220 (contact sensors: finger clip, strap, watch) |
| `vitals.heart_rate_camera_bpm` | sample | bpm | 30 … 220 (contact-free camera rPPG) |
| `vitals.hrv_rmssd_ms` | sample | ms | 1 … 300 (heart-rate variability, RMSSD) |
| `vitals.breathing_rate_per_min` | sample | /min | 3 … 60 |
| `posture.trunk_inclination_deg` | sample | deg | −90 … 90 (trunk vs vertical, 0 = upright) |
| `posture.head_trunk_angle_deg` | sample | deg | 0 … 180 (head vs trunk, 0 = head stacked on the trunk) |
| `presence.home` | interval | | |
| `presence.outing` | interval | | |
| `presence.guest_visit` | interval | guests | 0 … 50 |

Rules that keep the statistics clean:

- **Unknown metric → rejected.** A typo in a producer never creates a silent new series.
  New sensors are registered once: `POST /api/v1/metrics`.
- **Out-of-range value → rejected** (sensor fault, not a measurement), as are NaN,
  malformed fields (a list as `metric`, an infinite `ts` …), timestamps outside 1970–2100,
  more than `MAX_FUTURE_S` in the future (wrong clock) or older than the raw retention
  window. A batch is never rejected as a whole: the response lists each bad item with its
  reason, the rest is stored, and `accepted` is the number of rows actually written.
- **`source` tells sensors apart**, e.g. `modulino-hub` and `polar-h10` for
  `vitals.heart_rate_bpm`. Daily aggregates exist per source and pooled (`source=*`);
  every read that pools several sources lists them in `sources_pooled` and adds a
  `warning`. Measurements with a different error profile get their own metric instead of a
  source (the camera estimate is `vitals.heart_rate_camera_bpm`, not a heart-rate source).
- **Idempotent writes.** A sample is keyed by `(metric, source, ts)` and an interval by
  `(source, kind, id)`: re-sending after a timeout overwrites instead of duplicating.
  Within one batch, two samples with the same key are one row (the later wins, the earlier
  is listed in `rejected`): always send `ts` when batching.
  An interval is opened by sending it without `end`, and closed by re-sending the same `id`
  with its `end` (`id` defaults to the start time).
- **Time.** Stored as epoch ms (UTC), like `posture-analysis`. Days are local calendar days
  in `TZ_NAME` (DST-safe: 23 h and 25 h days are handled). Inputs accept epoch seconds,
  epoch ms or ISO 8601; query parameters also accept `now`, `-30m`, `-24h`, `-7d`.

Storage tiers: raw samples are kept `RAW_RETENTION_DAYS` (default 180); the `daily` table
(n, mean, SD, p10/p25/median/p75/p90, min/max, **hours covered**) is kept forever and is
recomputed automatically when late data arrives for a past day. Intervals are kept forever.

## API

**Full guide with every parameter, real responses, errors, recipes and client code
(Python, curl, JavaScript, Swift): [API.md](API.md).** Machine-readable:
`GET /api/v1/openapi.json` (OpenAPI 3.0). Quick reference below.

All `/api/*` routes require `Authorization: Bearer <API_TOKEN>`. The service refuses to
start without `API_TOKEN` unless `ALLOW_NO_AUTH=1` (local development only). `/health` is
always open. Responses are JSON; `time` fields are ISO strings in `TZ_NAME`.

### Write

```sh
# samples: a batch (preferred), a bare list, or a single object
curl -X POST $DM/api/v1/samples -H 'Content-Type: application/json' -d '{
  "source": "modulino-hub",
  "samples": [
    {"metric": "env.temperature_c", "value": 21.4},
    {"metric": "env.humidity_pct",  "value": 43.0, "ts": 1794642860},
    {"metric": "vitals.heart_rate_bpm", "value": 76, "quality": 0.62, "source": "modulino-hub/finger1"}
  ]}'
# -> {"accepted": 3, "rejected": []}

# intervals: open, then close with the same id
curl -X POST $DM/api/v1/events -d '{"source":"afferent-presence","events":[
  {"kind":"presence.guest_visit","id":"visit-42","start":"2026-11-14T18:05:00+01:00","value":2}]}'
curl -X POST $DM/api/v1/events -d '{"source":"afferent-presence","events":[
  {"kind":"presence.guest_visit","id":"visit-42","start":"2026-11-14T18:05:00+01:00","end":"2026-11-14T19:40:00+01:00","value":2}]}'

curl -X DELETE $DM/api/v1/events/17                       # by internal id

# a new sensor
curl -X POST $DM/api/v1/metrics -d '{"name":"env.pm25_ugm3","kind":"sample","unit":"µg/m³","min":0,"max":1000,
                                     "description":"Fine particles"}'
```

Limits: 10 000 items and 2 MB per request. Send **derived values** (one BPM every few
seconds, a minute median of an angle), not raw waveforms: the 45 Hz PPG stays on the UNO Q.

### Read

| Endpoint | Parameters (defaults) | Returns |
|---|---|---|
| `GET /api/v1/metrics` | | catalog + count, first, last per metric |
| `GET /api/v1/latest` | | last value of every (metric, source) with its age |
| `GET /api/v1/samples` | `metric`, `source`, `from` (-24h), `to`, `limit` (1000, max 100k), `order` (desc), `min_quality` | raw samples |
| `GET /api/v1/series` | `metric`, `source`, `from` (-24h), `to`, `bucket` (5m: 1m 5m 15m 30m 1h 3h 6h 1d), `min_quality` | n / mean / min / max per bucket (UTC-aligned) |
| `GET /api/v1/daily` | `metric`, `source` (*), `from` (-30d), `to` (today) | samples: daily stats + `hours_covered`; intervals: `minutes`, `occurrences`, `share_of_day`, mean/max value |
| `GET /api/v1/stats` | `metric`, `source`, `from` (-7d), `to`, `min_quality` | full descriptive stats + trend of daily medians; for intervals: stats of minutes and occurrences per day |
| `GET /api/v1/trend` | `metric`, `source`, `from` (-30d), `to`, `stat` (median / minutes), `min_hours` (0) | Mann–Kendall test + Theil–Sen slope per day, with the daily values used |
| `GET /api/v1/baseline` | `metric`, `source`, `day` (today), `days` (14), `stat`, `min_hours` (per metric), `z` (2) | that day vs the previous N days: robust z-score and `verdict` (within / above / below usual range) |
| `GET /api/v1/profile` | `metric`, `source`, `from` (-14d), `to` | mean per local hour of day (circadian profile) |
| `GET /api/v1/correlation` | `a`, `b`, `source_a`, `source_b`, `from` (-7d), `to`, `bucket` (1h) | Pearson and Spearman on bucket means, with p-values |
| `GET /api/v1/events` | `kind`, `source`, `from` (-7d), `to`, `limit` | intervals overlapping the range, with `ongoing` and `duration_min` |
| `GET /api/v1/summary` | `day` (today) | every metric's daily stats and every interval kind's minutes for one day |
| `GET /api/v1/info`, `/health` | | DB size and counts / liveness |
| `GET /api/v1/openapi.json` | | OpenAPI 3.0 description of all of the above |

`stat` for sample metrics: `n mean std min p10 p25 median p75 p90 max`; for intervals:
`minutes occurrences mean_value max_value`.

Examples:

```sh
curl "$DM/api/v1/daily?metric=presence.home&from=-14d"            # time at home per day
curl "$DM/api/v1/daily?metric=presence.guest_visit&from=-30d"     # visits and guest minutes per day
curl "$DM/api/v1/trend?metric=presence.outing&stat=minutes&from=-60d"
curl "$DM/api/v1/baseline?metric=posture.head_trunk_angle_deg&source=posture/default/standing-profile&days=14"
curl "$DM/api/v1/series?metric=vitals.heart_rate_bpm&source=modulino-hub&bucket=1m&from=-2h"
curl "$DM/api/v1/correlation?a=env.co2_ppm&b=vitals.heart_rate_bpm&from=-14d"
curl "$DM/api/v1/profile?metric=vitals.heart_rate_bpm&from=-28d"
```

### The statistics, and how to read them

- **Daily stats** use percentiles (median, p10/p90), robust to the outliers camera and
  finger sensors produce. `hours_covered` (0–24) says how much of the day was actually
  observed: a median from 2 hours is not comparable with one from 14.
  `baseline` ignores days with fewer observed hours than `min_hours`, whose default is
  per metric: 4 for environment and presence, 1 for posture, 0 for spot-check vitals
  (a 10-minute finger session is a valid day).
- **Trend**: Mann–Kendall (non-parametric, no normality assumption, tie-corrected) on one
  value per day, plus the Theil–Sen slope (median of pairwise slopes, robust to outlier
  days). `p < 0.05` → `increasing` / `decreasing`. Needs ≥ 4 days; meaningful from ~10.
- **Baseline**: `z = (value − median of previous N days) / (1.4826 × MAD)`. |z| ≥ 2 →
  above / below usual range. Needs ≥ 5 baseline days. A history with no variation at all
  (`flat: true`, `z: null`) still counts: any value different from it is above / below.
  Today is a partial day: compare intervals (minutes at home) on complete days with
  `day=-1d`.
- **Clocks**: a producer clock more than `MAX_FUTURE_S` ahead is rejected with a reason; a
  slow clock cannot be rejected (old data is legitimate), so it is made visible instead:
  every POST response carries `server_time`, the client reports its `clock_skew_s` in
  `status()` and logs a warning beyond 60 s, and `GET /latest` shows `lag_s` (receipt −
  measurement time) per source. A few seconds is normal batching; a large steady lag is a
  slow clock. Check NTP (`timedatectl`) on every board.
- **Intervals**: minutes are the union of intervals clipped to the day (overlaps are not
  counted twice; an ongoing interval runs until now). Days before a kind was first ever
  reported are absent, not zeros. A day with the presence app down looks like a day with
  0 minutes: check the producer's health before trusting a low value.
- **Correlation** is computed on bucket means over the same time buckets; it is not
  causation, and the p-value (Fisher z) assumes independent buckets, which successive
  hours are not — treat it as descriptive.

## Who sends what

Every producer carries a copy of [`client/data_manager_client.py`](client/data_manager_client.py)
(one stdlib file: each Wendy app is built from its own directory; keep the copies in sync).
It never blocks and never raises: values are queued (up to 50 000) and sent in batches by a
background thread, with retries and backoff while the data manager is unreachable. It finds
the server with `DATA_MANAGER_URL`, or over mDNS (`role=data-manager`) when `zeroconf` is
installed; `DATA_MANAGER_URL=off` disables it. `DATA_MANAGER_TOKEN` carries the API token.
`Downsampler` turns a high-rate signal into one mean/median per window. `dm.get(path, **params)` reads any endpoint (see [API.md](API.md#6-code)).

| Producer | What | Metric / source | Rate |
|---|---|---|---|
| `uno-q/modulino-hub` | Thermo | `env.temperature_c`, `env.humidity_pct` / `modulino-hub` | mean over 60 s |
| | **fused** finger reading (only while a finger is on the clip), HRV, breathing | `vitals.heart_rate_bpm`, `vitals.hrv_rmssd_ms`, `vitals.breathing_rate_per_min` / `modulino-hub` | per reading |
| `jetson/presence` | home periods, outings, guest visits (`datasync.py`) | `presence.home`, `presence.outing`, `presence.guest_visit` (value = peak guests) / `afferent-presence` | on change |
| `jetson/vision` | fused camera pulse, trust score ≥ `RPPG_MIN_TRUST` (40) | `vitals.heart_rate_camera_bpm` / `afferent-vision`; `quality` = trust / 100 | every 10 s, new readings only |
| `posture-analysis/posture` | minute medians per context, **standing / walking only** (`afferent/datasink.py`), **opt-in** | `posture.trunk_inclination_deg`, `posture.head_trunk_angle_deg` / `posture/<site>/<activity>-<orientation>`; p10/p90/n in `meta` | per minute |
| CO2 sensor | not built yet | `env.co2_ppm` | every 30–60 s |

How each one finds the data manager:

- **modulino-hub** (UNO Q, mesh) and **vision** (Jetson, mesh): mDNS on their mesh
  interface, nothing to configure. Override with `DATA_MANAGER_URL=… wendy run …`.
- **presence** (Jetson, host networking): defaults to `http://127.0.0.1:8100`, the mesh
  port published on the host. If that is not reachable on the device, pass the
  data manager's mesh address in `DATA_MANAGER_URL`.
- **posture** (laptop POC): off unless `DATA_MANAGER_URL` is set in `.env`, so nothing
  leaves the laptop by default.

Each app reports the client state: `GET /state` → `data_manager` (modulino-hub),
`GET /health` → `data_manager` (presence), `GET /rppg` → `data_manager` (vision):
URL found, items queued / sent / rejected, last error.

Posture: the angles are the pipeline's own `geometry.py` values, exactly what the runtime
computes and stores in its minute rows (no parallel implementation), including its
per-orientation validity (trunk: profile, ~3/4; head vs trunk: face, profile, ~3/4).
Only standing and walking minutes are sent: the runtime's sitting rule is knee < 120°,
with the hip–ankle span test only as a fallback when the knees are not visible.
One source per (room, activity, orientation), so daily aggregates never mix contexts
(`docs/implementation_review.md`, P1); query one with
`source=posture/<site>/standing-profile`. The pooled `source=*` mixes contexts.

## Deploy

```sh
cd jetson/data_manager
export API_TOKEN=$(openssl rand -hex 16)
echo "API_TOKEN=$API_TOKEN"    # keep it (password manager): producers need it as DATA_MANAGER_TOKEN
TZ_NAME=Europe/Paris wendy run --device "$JETSON" --detach --yes
wendy --device "$JETSON" device logs --app afferent-data-manager --tail 20 --no-follow
```

Without `API_TOKEN` the app exits at start with `API_TOKEN is not set …` (on purpose: this is
health data). `ALLOW_NO_AUTH=1` opens it, for local development only.

Expect `data manager on :8100 (db=/data/data_manager.db, tz=…)` and `advertising
data-manager._http._tcp.local.`. The DB lives on the persistent volume
`afferent-data-manager` (`/data`), so it survives restarts and redeploys.

Networking is `mesh` (like `afferent-vision`): producers on Wendy Net reach it on port
8100 or discover it over mDNS. From a laptop:

```sh
wendy net forward 8100:8100 --device "$JETSON"     # keep running
curl localhost:8100/api/v1/latest
```

`afferent-presence` runs with host networking on the same Jetson; point it at
`DATA_MANAGER_URL=http://127.0.0.1:8100` (the mesh port is published on the host) — to be
confirmed on the device.

| Env | Default | Meaning |
|---|---|---|
| `PORT` | 8100 | |
| `DATA_DIR` | /data | SQLite file `data_manager.db` |
| `TZ_NAME` | UTC | IANA zone of the home, defines "a day" |
| `RAW_RETENTION_DAYS` | 180 | raw samples older than this are pruned hourly (daily rows stay); 0 = keep forever |
| `API_TOKEN` | – | **required** bearer token for every `/api` route; ≥ 16 random characters |
| `ALLOW_NO_AUTH` | – | `1` = start without a token, API open to anyone on the network (local development only) |
| `MAX_FUTURE_S` | 300 | reject timestamps further in the future (producer clock skew) |
| `ROLLUP_INTERVAL_S` | 300 | background daily rollup period |
| `MDNS` | 1 | advertise `_http._tcp` with TXT `role=data-manager`, `auth=1` |

Back up by copying `/data/data_manager.db` (SQLite in WAL mode: use
`sqlite3 data_manager.db ".backup backup.db"` for a consistent copy while it runs).

## Run locally

```sh
cd jetson/data_manager
DATA_DIR=./data TZ_NAME=Europe/Paris MDNS=0 ALLOW_NO_AUTH=1 python3 app.py
python3 tools/simulate.py --url http://localhost:8100 --days 21 --withdrawal 5   # synthetic history
curl "localhost:8100/api/v1/trend?metric=posture.trunk_inclination_deg&from=-21d"
python3 -m unittest discover -s tests -v                                        # 48 tests
```

Measured on a laptop: a 200-sample batch is stored in ~2 ms; `/daily` ~2 ms, `/stats`
over 7 days (~50 k rows) ~30 ms.

## Privacy

This database holds health-related data about identifiable people at home. The API is
closed by default (`API_TOKEN` required), keep the port on Wendy Net (never expose it to
the internet), and treat backups like medical records. Producers that hold the token should
pin `DATA_MANAGER_URL` rather than rely on mDNS: the client takes the first advert it sees
and never switches away from a working server, but any host on the mesh can advertise. There is no video, no images and no face data here.
