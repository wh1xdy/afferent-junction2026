# analyzer — the edge service

Nightly speech-pattern drift scoring from conversation transcripts.
Same code runs both deployments; only config differs:

- **Jetson** (`configs/jetson.yaml`): llama.cpp backend, GGUF loaded on
  demand inside the nightly window while the vision app is idle.
- **Cloud** (`configs/cloud.yaml`): OpenAI-compatible backend (vLLM, NIM,
  llama-server) serving the merged fine-tuned model — API-triggered.

## Layout

```
analyzer/
  config.py      defaults <- YAML <- ANALYZER_* env
  transcript.py  JSONL loading + window slicing (schema: ../README.md §5.3)
  metrics.py     deterministic features (latency, MATTR, fillers, initiations)
  scoring.py     JSON contract, prompt, validation + retry
  backend.py     LlamaCppBackend | OpenAIBackend | MockBackend
  store.py       SQLite aggregates + baseline-deviation index
  pipeline.py    batch runner: load -> score -> unload
  scheduler.py   nightly window + vision-idle probe
  service.py     FastAPI surface
  cli.py         `python -m analyzer.cli` — cron/ssh trigger path
tests/
configs/         jetson.yaml | cloud.yaml
```

## On-demand model loading

The service holds **no model** at rest. `POST /analyze` (or the scheduler)
acquires the run lock, calls `backend.load()` (mmap the GGUF, fill VRAM),
scores every pending window under `transcripts_dir`, writes aggregates, then
`backend.unload()` releases the ~6 GB for whatever else needs the memory —
the vision app in particular.

Scheduled runs fire only when ALL of these hold:

1. local time inside `schedule.window` (wraps midnight),
2. `once_per_day` not already satisfied today (`meta.last_scheduled_day`),
3. every `vision_probe_urls` endpoint unreachable or inactive — a stopped
   vision app is the green light.

## API

| Method | Path | Returns |
|---|---|---|
| GET | `/health` | `{"ok": true}` |
| GET | `/status` | running flag, backend name, last batch summary |
| POST | `/analyze` | `202 {"status":"started"}` — `{"rescore": true}` to redo |
| GET | `/scores?day=` | mean dimension scores + metrics for one day |
| GET | `/days` | scored days, newest first |
| GET | `/index?day=` | z-scores vs rolling baseline + `warning` (default: latest) |

## Run locally (no GPU, no model)

```sh
pip install -r requirements.txt
python -m pytest tests/                       # 18 tests

# dry-run the full batch against a synthetic file, mock backend:
mkdir -p /tmp/ta/transcripts
cp ../training/tests_sample/*.jsonl /tmp/ta/transcripts/ 2>/dev/null || true
ANALYZER_MODEL_BACKEND=mock \
ANALYZER_TRANSCRIPTS_DIR=/tmp/ta/transcripts \
ANALYZER_DB_PATH=/tmp/ta/test.db \
python -m analyzer.cli run-once
```

Then `python -m analyzer.cli index` prints the drift index.

## Deploy on the Jetson (wendy)

```sh
cd analyzer
# copy the fine-tuned GGUF to the device's /data/models/ first, then:
wendy run --device <jetson> --detach --yes
```

`wendy.json` grants `gpu`, a persistent `/data` volume (model + db +
transcripts) and mesh networking on port 3080 — the API is reachable only
inside Wendy Net, like `afferent-vision` on 3005.

## Contract

The model is grammar-constrained to `scoring.SCORE_SCHEMA`:
`{responsiveness, engagement, fluency, coherence}` each
`{score 0-100, confidence 0-1, evidence[]}` + `drift_flag` + `notes`.
Invalid output is retried once (`score_retries`), then counted in
`errors` and logged — a bad window never blocks the batch.
