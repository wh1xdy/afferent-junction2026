# Team modules

Code copied byte-identical from team branches. Never edit these files; all glue lives in
`hub/afferent_hub/team_adapters/`. `manifest.json` is the machine-readable record (full blob ids);
`hub/tests/test_team_modules.py` fails if a file differs from its recorded blob or is not listed.

## Re-sync

From the repo root, one line per module (refreshes the files and manifest.json from the branch ref):

- alex_hub: `git fetch junction && (cd hub && .venv/bin/python -m afferent_hub.team_adapters.resync alex_hub)`
- data_manager: `git fetch junction && (cd hub && .venv/bin/python -m afferent_hub.team_adapters.resync data_manager)`

Then run their tests on the copy (`cd hub/afferent_hub/team/<module> && python -m unittest discover tests`)
and ours (`cd hub && .venv/bin/python -m pytest -q`). The venv lives in the main working tree.

## Files

| Copied file | Source branch | Source path | Last commit touching it | Branch tip at copy | Blob |
|---|---|---|---|---|---|
| alex_hub/store.py | junction/Alex | jetson/hub/store.py | 2416007 | 4d738e8 | fe37ebb1005d |
| alex_hub/fhir.py | junction/Alex | jetson/hub/fhir.py | 8e76aa2 | 4d738e8 | 1d2c296ef0bb |
| alex_hub/report.py | junction/Alex | jetson/hub/report.py | 4d738e8 | 4d738e8 | dff3f04de972 |
| alex_hub/grounding.py | junction/Alex | jetson/hub/grounding.py | cef6c9b | 4d738e8 | 6af60c96d5e6 |
| alex_hub/tests/test_hub.py | junction/Alex | jetson/hub/tests/test_hub.py | 4d738e8 | 4d738e8 | 66c7a34f395f |
| data_manager/app.py | junction/data_manager | jetson/data_manager/app.py | 838d466 | 838d466 | 476085579d09 |
| data_manager/store.py | junction/data_manager | jetson/data_manager/store.py | 838d466 | 838d466 | f43fbf5617a5 |
| data_manager/stats.py | junction/data_manager | jetson/data_manager/stats.py | 838d466 | 838d466 | e21a865ec439 |
| data_manager/catalog.py | junction/data_manager | jetson/data_manager/catalog.py | 838d466 | 838d466 | 2ed42e7b95f0 |
| data_manager/timeutil.py | junction/data_manager | jetson/data_manager/timeutil.py | 838d466 | 838d466 | b14b3035e8e9 |
| data_manager/network.py | junction/data_manager | jetson/data_manager/network.py | 838d466 | 838d466 | df7cdcbef22e |
| data_manager/openapi.py | junction/data_manager | jetson/data_manager/openapi.py | 838d466 | 838d466 | 4beb618047d2 |
| data_manager/client/data_manager_client.py | junction/data_manager | jetson/data_manager/client/data_manager_client.py | 838d466 | 838d466 | 9731fbfd410b |
| data_manager/tests/_path.py | junction/data_manager | jetson/data_manager/tests/_path.py | 838d466 | 838d466 | 51e2006b3f2f |
| data_manager/tests/test_api.py | junction/data_manager | jetson/data_manager/tests/test_api.py | 838d466 | 838d466 | 7069c91e0e22 |
| data_manager/tests/test_store.py | junction/data_manager | jetson/data_manager/tests/test_store.py | 838d466 | 838d466 | c2f7281deae4 |
| data_manager/tests/test_stats.py | junction/data_manager | jetson/data_manager/tests/test_stats.py | 838d466 | 838d466 | d1c4cfa5823f |

The data_manager files have the same blob ids on junction/feat/data-manager (fc3d71a).

## Not copied

- jetson/hub: app.py (duplicate server and UNO Q collector), demo.py, network.py, Dockerfile, start.sh, wendy.json.
- jetson/data_manager: API.md, README.md, openapi docs, tools/simulate.py, Dockerfile, wendy.json, requirements.txt.

## How each copy is used

| Module | Adapter | Endpoint | Setting (default) |
|---|---|---|---|
| alex_hub/fhir.py | team_adapters/alex.py `fhir_bundle` | GET /api/patients/{pid}/fhir?days=14 | AFFERENT_TEAM_FHIR (on) |
| alex_hub/fhir.py vitals | team_adapters/data_manager.py `finger_readings` | same | AFFERENT_TEAM_FHIR_VITALS (off), needs the data manager |
| alex_hub/report.py `clinician` | team_adapters/alex.py `clinician_report` | GET /api/patients/{pid}/report?days=14&narrative=0 | AFFERENT_TEAM_REPORT (off) |
| alex_hub/grounding.py `ask` | team_adapters/alex.py `ask` | POST /api/patients/{pid}/ask | AFFERENT_TEAM_ASK_URL (empty = off) |
| alex_hub/grounding.py `direction_problem`, `EVALUATIVE` | team_adapters/alex.py `guard_check` | extra check on Gemma summary text | AFFERENT_TEAM_GUARD (off) |
| alex_hub/store.py | in-memory `Store(":memory:")` per request, fed from our check-ins | none | none |
| data_manager service | run as its own process (`PORT=8101 DATA_DIR=... MDNS=0 python app.py`) | none | none |
| data_manager client | team_adapters/data_manager.py `SensorSource` (reads only) | GET /api/sensors/{endpoint}, GET /api/patients/{pid}/sensors/room | AFFERENT_DATA_MANAGER_URL (empty = off), AFFERENT_DATA_MANAGER_TOKEN |

GET /api/team/modules lists which modules are on.

The Alex modules import `store` by its bare name (report.py:9, grounding.py:13), and the data manager has its
own top-level `store.py`. `team_adapters/loader.py` loads Alex's files by path and removes the bare `store`
entry from sys.modules afterwards; the data manager service never runs inside the hub process.
