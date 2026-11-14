# posture-controller — laptop control room for the Jetson posture app

Local Flask site that drives `afferent-posture` and
`afferent-transcription-analyzer` on the Jetson. The Jetson apps are reached
through `wendy net forward` (cloud tunnel), which handles short HTTP requests
but chokes on continuous streams — so this controller does **no live streaming**:

- **Start/Stop recording** on the Jetson (`POST /api/record/*`)
- After stop, the finished mp4 is **pulled automatically** as soon as it
  is final (recording flag off + size stable), size-verified, written
  atomically, then **deleted on the Jetson** — recordings don't stay there
- FMP4 files are transcoded to H.264 (`ffmpeg`) so browsers can play them
- **Enroll face** by uploading a video: frames are sampled and POSTed to
  `/api/enroll/face-image` on the Jetson
- Status + single-frame snapshot on demand
- **GPU mode**: stop posture, start the analyzer, optionally run a batch, then
  restore posture; the panel also shows analyzer status/index and uploads JSONL
  transcripts to the analyzer

## Run

```bash
wendy net forward 8000:8000 --device <jetson-selector>
wendy net forward 3080:3080 --device <jetson-selector>
pip install -r requirements.txt   # flask, opencv (enroll), ffmpeg binary for transcode
JETSON_URL=http://localhost:8000 ANALYZER_URL=http://localhost:3080 \
  WENDY_DEVICE=<jetson-selector> python controller.py
# open http://localhost:8099
```

Downloaded videos land in `jetson_downloads/` (gitignored).

## GPU mode and app swapping

The Orin Nano has 8 GB of unified memory. The posture camera pipeline and the
Qwen3-8B analyzer must never compute at the same time. The controller is the
mode switch and serializes the swap:

1. Stop `afferent-posture` and wait until Wendy reports it is no longer running.
2. Start `afferent-transcription-analyzer` and wait for `/health`. If
   `/status` reports the shared-volume inbox enabled, the analyzer claims and
   analyzes hub transcripts automatically; the controller waits for the inbox
   state to become `done` or `error`. Otherwise, a batch waits for model
   readiness and uses `POST /analyze`.
3. An optional rescore runs the regular `POST /analyze` batch after the inbox
   finishes.
4. Stop the analyzer and start posture again. Failures also attempt to restore
   posture unless the request explicitly asks to stay in transcription mode.

The hub writes JSONL files into its `afferent-home-hub` Wendy persistent
volume. The analyzer mounts that same volume at `/hub-data`; no transcript
HTTP upload is needed for this flow. Claimed files end in `.analyzing`. After
successful analysis the source file is deleted from the hub volume; files
with parse or scoring errors are renamed `.failed` for inspection. Claims
left by a crash are retried on the next analyzer start.

The Jetson image includes the Qwen3-8B base GGUF because Wendy mesh-mode apps
have no internet egress. Before deploying, download
`Qwen/Qwen3-8B-GGUF:Qwen3-8B-Q4_K_M.gguf` on a development machine and copy it
to `Transcription_analyzer/analyzer/models/`; see the analyzer README for the
exact command. Runtime model fetching is disabled in the Jetson config.

The analyzer also probes the posture status API before loading its model and
at most every 10 seconds during a batch. Any HTTP response below 500 blocks
computation; an in-progress batch aborts and unloads the model, leaving inbox
claims for retry after the controller switches to transcription. The 5.8 GB
memory preflight is an independent guard, not the mutual-exclusion mechanism.

The dashboard's **Run transcription analysis** button runs the full sequence
and returns to posture. **Switch to transcription (stay)** starts the analyzer
without a batch and leaves it running. **Back to posture** switches back.

| Environment variable | Default | Purpose |
|---|---|---|
| `WENDY_DEVICE` | the configured Wendy Cloud selector | Device used by `wendy device apps` |
| `WENDY_BIN` | `wendy` | Wendy CLI executable |
| `JETSON_URL` | `http://localhost:8000` | Posture API (`8000:8000` forward) |
| `ANALYZER_URL` | `http://localhost:3080` | Analyzer API (`3080:3080` forward) |
| `POSTURE_APP` | `afferent-posture` | Wendy posture app ID |
| `ANALYZER_APP` | `afferent-transcription-analyzer` | Wendy analyzer app ID |
| `ANALYZER_MODEL_TIMEOUT_S` | `3600` | Maximum wait for model download/readiness |
| `ANALYZER_RUN_TIMEOUT_S` | `3600` | Maximum wait for an analysis batch |
| `MODE_POLL_S` | `2` | Poll interval while waiting for app transitions |

The mode job and app states are available from `GET /api/mode`. Analyzer
proxies are `GET /api/analyzer/status`, `GET /api/analyzer/index`, and
`POST /api/analyzer/transcripts`. App control requests are serialized; a second
mode change receives HTTP 409 until the current job finishes.
