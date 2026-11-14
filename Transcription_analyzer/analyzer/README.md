# analyzer — the edge service

Speech-pattern drift scoring from conversation transcripts. The service keeps
the model off the GPU until an analysis run. Same code runs both deployments;
only config differs:

- **Jetson** (`configs/jetson.yaml`): `llama-server` starts on demand with the
  Qwen3 Q4_K_M model baked into the image and the fine-tuned LoRA adapter.
- **Cloud** (`configs/cloud.yaml`): OpenAI-compatible backend (vLLM, NIM,
  llama-server) serving the merged fine-tuned model.

## Layout

```
analyzer/
  config.py      defaults <- YAML <- ANALYZER_* env
  transcript.py  JSONL loading + window slicing — synthetic schema
                 (../README.md §5.3) AND hub capture rows
                 (feat/voice-transcript, see "Input formats" below)
  metrics.py     deterministic features (latency, MATTR, fillers, initiations)
  scoring.py     JSON contract, prompt, validation + retry
  backend.py     LlamaCppBackend | LlamaServerBackend | OpenAIBackend | MockBackend
  models.py      model readiness + optional Hugging Face fetch
  inbox.py       claim and settle transcript files from the shared hub volume
  store.py       SQLite aggregates + baseline-deviation index
  pipeline.py    batch runner: load -> score -> unload
  scheduler.py   nightly window + vision-idle probe
  service.py     FastAPI surface
  cli.py         `python -m analyzer.cli` — cron/ssh trigger path
tests/
configs/         jetson.yaml | cloud.yaml
```

## Model loading and memory

The service itself holds **no model** at rest. `POST /analyze` acquires the run
lock, starts `llama-server`, waits for its health endpoint, scores pending
windows, writes aggregates, then terminates the server. `POST /models/fetch`
starts a background download when using the `llamaserver` backend if the
container has network egress. The Jetson uses Wendy mesh networking, which has
no internet egress, so its base GGUF is bundled in the image and
`auto_fetch` is disabled there.

The Qwen3-8B Q4_K_M weights are about 5.0 GB. At a 4096-token context, the
Q8 key/value cache is about 0.30 GB; runtime buffers and the OS need additional
headroom. Windows are capped at 120 turns and 9000 rendered characters to fit
the training/inference context. This is why the Jetson config keeps a 5.8 GB
preflight requirement. The Jetson's nightly schedule and vision probes are
disabled; app swaps are explicitly driven from the laptop controller.

### Mutual exclusion with posture

The posture controller is the switch between posture and transcription. As a
second guard, the analyzer probes the configured posture status URL before
model loading; any HTTP response below 500 blocks the batch. It also checks
the posture endpoint at most every 10 seconds during a batch. If posture
becomes reachable, the analyzer aborts the batch and unloads `llama-server`.
An inbox claim stays `.analyzing` while the inbox waits for the controller to
switch modes, then reruns; stored windows are deduplicated. The memory
preflight remains an independent second check.

`/analyze` checks model readiness and available memory synchronously and returns
HTTP 409 with a reason when preflight fails. The batch runner applies the same
preflight for non-HTTP/scheduler callers.

### Jetson image model prerequisite

The Jetson image must contain
`models/Qwen3-8B-Q4_K_M.gguf` before `wendy run`; the build copies this 5 GB
file into its own early image layer so code-only changes do not invalidate the
model layer. Download the public file on a development machine from
`Qwen/Qwen3-8B-GGUF` and copy it into the analyzer project:

```sh
cd Transcription_analyzer/analyzer
uv run --with huggingface_hub python -c \
  'from pathlib import Path; from huggingface_hub import hf_hub_download; print(hf_hub_download(repo_id="Qwen/Qwen3-8B-GGUF", filename="Qwen3-8B-Q4_K_M.gguf", local_dir=Path.home()/".cache/afferent-models"))'
cp ~/.cache/afferent-models/Qwen3-8B-Q4_K_M.gguf models/
wendy json validate
wendy --json run --device jetson --build-type docker --detach --yes
```

The image build expects the model at
`/app/models/Qwen3-8B-Q4_K_M.gguf`; the Jetson config sets `model.path` to
that path and does not attempt a runtime Hugging Face download.

## API

| Method | Path | Returns |
|---|---|---|
| GET | `/` | dashboard (`web/index.html`) |
| GET | `/health` | `{"ok": true}` |
| GET | `/status` | running flag, backend, model fetch state, last batch summary, data-manager status |
| POST | `/analyze` | `202 {"status":"started"}` — `{"rescore": true}` to redo |
| POST | `/models/fetch` | `202` starts a model fetch; `409` if already downloading |
| POST | `/transcripts` | push one JSON row, a JSON list, or JSONL (`text/plain` / `application/x-ndjson`) |
| GET | `/scores?day=&persona=` | mean dimension scores + metrics for one day |
| GET | `/days?persona=` | scored days, newest first |
| GET | `/index?day=&persona=` | z-scores vs rolling baseline + `warning` (default: latest) |

`persona` is optional everywhere: omitted = all personas merged, which is
the right default in the single-patient deployment; pass `patient_id` to
keep per-person series.

## Input formats

`transcripts_dir` is searched recursively for `*.jsonl`; each line is one conversation.
Two shapes are accepted (`transcript.py`):

- **Synthetic** (§5.3 of ../README.md): `{persona_id, day, trajectory,
  turns: [{t, speaker: interlocutor|target, text}], labels}`.
- **Hub captures** (`feat/voice-transcript`): rows appended by
  `hub/afferent_hub/transcripts.py` under `AFFERENT_TRANSCRIPTS_DIR` —
  `{transcript_id, patient_id, t_iso, received_iso, turns: [{role:
  user|agent, text}]}`. Mapping: `user`→`target`, `agent`→`interlocutor`,
  `patient_id`→`persona_id`, `day`←`t_iso`, `transcript_id`→`record_id`
  (the phone's dedupe key — survives resends and file rotation). No
  per-turn timestamps, so the latency channel is simply absent.

The hub can push each row to `POST /transcripts`; valid records are appended
under `transcripts_dir/ingest-YYYY-MM-DD.jsonl` and invalid records are reported
with their input index and reason. Alternatively, mount or copy the hub's
`AFFERENT_TRANSCRIPTS_DIR` under `transcripts_dir`.

A malformed line is skipped and logged, never fatal — rotating hub logs
can end in a partial row after a crash mid-append.

### Jetson hub inbox

On WendyOS, the analyzer mounts the hub app's shared `afferent-home-hub`
persistent volume at `/hub-data`; `configs/jetson.yaml` watches
`/hub-data/transcripts` at startup. This is a shared-volume handoff, not an
HTTP delivery API. A startup inbox run waits for model/memory preflight, then
renames each `transcript-*.jsonl` to a unique `.analyzing` claim before
scoring. A successful file is deleted from the hub volume. A file with parse
or scoring errors is kept as `.failed` for inspection; a claim left by a
crash remains `.analyzing` and is retried on the next analyzer start. The
`inbox` object in `/status` reports its state and file counts. `inbox_settle_s`
allows an in-progress hub append to close before scoring, while
`inbox_retry_s` controls preflight and batch-lock retries.

`ANALYZER_HUB_TRANSCRIPTS_DIR` enables the inbox; it defaults to empty/off.
`ANALYZER_INBOX_SETTLE_S` and `ANALYZER_INBOX_RETRY_S` override the 2-second
settle and 30-second retry defaults. The regular `transcripts_dir` scan and
`POST /analyze` remain separate from the startup inbox.

## Run locally (no GPU, no model)

```sh
pip install -r requirements.txt
python -m pytest tests/

# dry-run the full batch against a synthetic file, mock backend:
mkdir -p /tmp/ta/transcripts
cp ../training/tests_sample/*.jsonl /tmp/ta/transcripts/ 2>/dev/null || true
ANALYZER_MODEL_BACKEND=mock \
ANALYZER_TRANSCRIPTS_DIR=/tmp/ta/transcripts \
ANALYZER_DB_PATH=/tmp/ta/test.db \
python -m analyzer.cli run-once
```

Then `python -m analyzer.cli index` prints the drift index.

`docker compose up --build` uses the generic image and mock backend by default,
serves the dashboard on `http://localhost:3080/`, and mounts the bundled
synthetic corpus read-only at `/data/transcripts/synthetic`. Copy
`.env.example` to `.env` to configure local settings; a real data manager can
be selected with `DATA_MANAGER_URL` and `DATA_MANAGER_TOKEN`.

## Data-manager metrics

The analyzer registers `speech.*` sample metrics with
`baseline_min_hours: 0`. A posture/speech scoring batch may stamp every window
within one short period, so the data manager's usual observed-hours threshold
would otherwise exclude every day from baseline and trend calculations.
Window timestamps use the hub conversation end (`t_iso`) when available;
synthetic ISO-day rows use a stable per-record offset from noon UTC plus the
window sequence number so same-day conversations do not overwrite one another.
Synthetic integer-day records use distinct stamps in the recent receipt-time
window. The data-manager status in `/status` reports sent, rejected, and
dropped samples.

## Build and locally validate the Qwen3 LoRA

The adapter is converted with llama.cpp tag `b5283`, matching the Jetson
runtime. `scripts/build_lora_gguf.sh` creates a dedicated uv environment under
`~/.cache/afferent-build`, installs CPU PyTorch and the converter's local
`gguf-py`, loads only the base model config from Hugging Face, and writes
`models/student-lora-f16.gguf`. The GGUF is a local build artifact and is
gitignored; the Dockerfile requires it at image build time.

```sh
cd analyzer
./scripts/build_lora_gguf.sh
ls -lh models/student-lora-f16.gguf
```

For local real-inference validation, download the public base weights and use
the matching b5283 Ubuntu x64 release binary (or another b5283
`llama-server` build):

```sh
uv run --with huggingface_hub python -c \
  'from pathlib import Path; from huggingface_hub import hf_hub_download; print(hf_hub_download(repo_id="Qwen/Qwen3-8B-GGUF", filename="Qwen3-8B-Q4_K_M.gguf", local_dir=Path.home()/".cache/afferent-models"))'
curl -fL https://github.com/ggml-org/llama.cpp/releases/download/b5283/llama-b5283-bin-ubuntu-x64.zip \
  -o ~/.cache/afferent-build/llama-b5283-bin-ubuntu-x64.zip
unzip -o ~/.cache/afferent-build/llama-b5283-bin-ubuntu-x64.zip \
  -d ~/.cache/afferent-build/llama-server-b5283
```

Use one small legacy conversation and one hub-format record, then run the CLI:

```sh
mkdir -p /tmp/analyzer-real/transcripts
cp ../data/transcripts/p001_maggie_day01_normal.jsonl /tmp/analyzer-real/transcripts/
printf '%s\n' '{"transcript_id":"hub-local-1","patient_id":"anna","t_iso":"2026-11-14T15:30:00Z","received_iso":"2026-11-14T15:31:00Z","turns":[{"role":"user","text":"I went for a walk and called my sister."},{"role":"agent","text":"That sounds nice. What did you talk about?"},{"role":"user","text":"We talked about her new garden."}]}' \
  > /tmp/analyzer-real/transcripts/hub.jsonl
ANALYZER_MODEL_BACKEND=llamaserver \
ANALYZER_MODEL_PATH="$HOME/.cache/afferent-models/Qwen3-8B-Q4_K_M.gguf" \
ANALYZER_LORA_PATH="$PWD/models/student-lora-f16.gguf" \
ANALYZER_SERVER_BIN="$HOME/.cache/afferent-build/llama-server-b5283/build/bin/llama-server" \
ANALYZER_SERVER_ARGS=-fa,-ctk,q8_0,-ctv,q8_0 \
ANALYZER_MODEL_CTX=4096 ANALYZER_TRANSCRIPTS_DIR=/tmp/analyzer-real/transcripts \
ANALYZER_DB_PATH=/tmp/analyzer-real/analyzer.db DATA_MANAGER_URL=off \
LD_LIBRARY_PATH="$HOME/.cache/afferent-build/llama-server-b5283/build/bin" \
python -m analyzer.cli run-once
```

The batch should report at least one scored window and `errors: 0`; query the
local `windows.scores` table to inspect validated dimension scores and evidence.
Use the same `-fa -ctk q8_0 -ctv q8_0` server flags as the Jetson when supported
by the local binary. On a CPU-only build, reduce `ANALYZER_GPU_LAYERS` or omit
flags that the build explicitly reports as unsupported.

## Deploy on the Jetson (wendy)

```sh
wendy --json run --device jetson --detach --wait-ready \
  --readiness-timeout 600s --yes
```

`wendy.json` grants `gpu`, a persistent `/data` volume (downloaded model, DB,
and transcripts), and mesh networking on port 3080. The analyzer fetches the
base weights from Hugging Face into `/data/models` at startup; its LoRA adapter
is included in the image. The analyzer is reached only inside Wendy Net.

## Contract

The model is grammar-constrained to `scoring.SCORE_SCHEMA`:
`{responsiveness, engagement, fluency, coherence}` each
`{score 0-100, confidence 0-1, evidence[]}` + `drift_flag` + `notes`.
Invalid output is retried once (`score_retries`), then counted in
`errors` and logged — a bad window never blocks the batch.
