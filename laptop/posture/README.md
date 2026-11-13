# afferent posture — laptop POC

Dockerised local pipeline that turns a webcam feed into **psychomotor activity
and expressivity markers** relative to the person's own baseline:

```
webcam → RTMPose+feet (rtmlib) → InsightFace identity lock → One-Euro smoothing
→ situation (activity × orientation) → posture angles + gait + facial expressivity
→ SQLite minute aggregates (no images/keypoints on disk) → FastAPI dashboard
```

This is a *measurement* POC, not a diagnosis tool. Validating any link to
depression requires ground truth, repeated measures, reliability testing and a
cohort study — see `docs/plan_ameliore_posture_depression.md` at the repo root.

## Layout

- `afferent/` — Python package (pipeline, models adapters, geometry, storage…)
- `web/index.html` — vanilla-JS dashboard (no CDN)
- `tests/` — pytest suite on synthetic keypoints (no models/camera needed)
- `models/`, `data/`, `recordings/` — mounted volumes (gitignored)
- `scripts/link_nvidia_libs.py` — GPU image helper

## Setup

```sh
cd laptop/posture
cp .env.example .env          # adjust CAMERA / VIDEO_DEVICE / POSE_MODE …
docker compose build          # CPU onnxruntime (default)
```

Cameras: `/dev/video0..3` exist on the dev laptop; only `VIDEO_DEVICE` is passed
into the container, so inside it the camera is always index `0` unless you point
`CAMERA` at a device path or a video file for replay.

### Performance knobs (CPU)

- `POSE_MODE` — leave empty for the device default: **lightweight on CPU**
  (~4 pose-fps @1080p measured), balanced on CUDA. `balanced` CPU is ~1.1 fps.
- `DET_EVERY` — the YOLOX detector runs every N processed frames (default 5 on
  CPU, 1 on CUDA); between runs the last boxes are reused, expanded 10 %. A
  fresh detection is forced whenever the target is not locked or no person was
  found. `DET_EVERY=1` disables skipping.
- `FACE_EVERY` / `EMOTION_EVERY` — MediaPipe landmarker cadence (blendshapes +
  head pose) vs the heavier HSEmotion pass on the target crop.

### Custom fine-tuned pose model

`laptop/training` exports a fine-tuned RTMPose ONNX to
`models/custom/rtmpose-m_halpe26_ft.onnx`. Point the runtime at it:

```sh
POSE_MODEL_PATH=/models/custom/rtmpose-m_halpe26_ft.onnx docker compose up -d
```

The filename is appended to `model_version` on every DB row, so measurements
stay attributable to the instrument that produced them.

## Download models (once)

```sh
docker compose run --rm posture python -m afferent.download_models
```

Downloads into the `./models` mount (rtmlib ONNX zips for `balanced` +
`lightweight`, InsightFace `buffalo_l`, MediaPipe `face_landmarker.task`,
optional HSEmotion weights). The server auto-runs the same step at startup if
something is missing, but the explicit step keeps first boot predictable.

## Run

```sh
docker compose up -d          # dashboard on http://localhost:8000
docker compose logs -f posture
```

| Action | How |
|---|---|
| Enroll target face | Dashboard "Enroll target" (or `POST /api/enroll/start` then `/stop`) |
| Delete all face embeddings | Dashboard "Delete gallery" (or `DELETE /api/gallery`) |
| Upright reference (10 s stand) | Dashboard "Calibrate upright" (or `POST /api/calibration/upright`) |
| Floor plane (4 clicks) | Dashboard "Calibrate floor" (or `POST /api/calibration/floor`) |
| Guided session (normal / simulated slow walk) | Dashboard "Start session" (+ `simulated` checkbox) |
| Dev-only raw recording | `POST /api/record/start` → writes `/recordings/*.mp4` (future fine-tuning data; off by default via `RECORDING_ENABLED=0`) |

## Offline video

```sh
docker compose run --rm -v "$PWD/recordings:/recordings" posture \
  python -m afferent.cli process-video /recordings/clip.mp4 \
  --db /data/offline.db --target-enroll-seconds 10
```

Prints a JSON summary (episodes, gait variables, fps). Enrolls from the first N
seconds when the gallery is empty.

## Tests

```sh
docker compose run --rm posture pytest -q
```

Synthetic-data tests only — no models or camera required.

## GPU variant (untested here)

```sh
docker compose -f docker-compose.yml -f docker-compose.gpu.yml build
docker compose -f docker-compose.yml -f docker-compose.gpu.yml up -d
```

Requires the NVIDIA container toolkit on the host:

```sh
sudo apt install nvidia-container-toolkit
sudo nvidia-ctk runtime configure --runtime=docker
sudo systemctl restart docker
```

This machine has an RTX 3070 laptop GPU but **no container toolkit** (runc only),
so the GPU path is provided best-effort and was verified only to the extent that
the Dockerfile builds the `gpu` target — runtime behaviour is untested.

## API summary

`GET /` dashboard · `GET /stream.mjpg` annotated preview · `GET /api/status` ·
`POST /api/enroll/start|stop` · `DELETE /api/gallery` ·
`POST /api/calibration/floor|upright` · `POST /api/session/start|stop` ·
`GET /api/minutes?since=` · `GET /api/sessions` · `GET /api/days` ·
`POST /api/record/start|stop` · `POST /api/days/refresh`

## Privacy / storage defaults

- Raw frames, keypoints and embeddings-in-flight live only in memory.
- SQLite keeps **minute aggregates**, session/episode summaries and the target
  face **embeddings** (`galerie` table) — `DELETE /api/gallery` wipes them.
- No video is written unless dev recording is explicitly started.

## Licenses

| Component | License / restriction |
|---|---|
| rtmlib / RTMPose (body+feet pose) | Apache-2.0 code; COCO/Halpe training data caveats apply |
| InsightFace `buffalo_l/s` models | **Non-commercial research only** — demo stack, not for product |
| MediaPipe Face Landmarker | Apache-2.0 |
| HSEmotion (`enet_b0_8_va_mtl`) | Apache-2.0 code; AffectNet-trained weights → research use |
