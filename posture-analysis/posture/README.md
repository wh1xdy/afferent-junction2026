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
cohort study — see `docs/plan_posture_depression.md` at the repo root.

## Layout

- `afferent/` — Python package (pipeline, models adapters, geometry, storage…)
- `web/index.html` — vanilla-JS dashboard (no CDN)
- `tests/` — pytest suite on synthetic keypoints (no models/camera needed)
- `models/`, `data/`, `recordings/` — mounted volumes (gitignored)
- `scripts/link_nvidia_libs.py` — GPU image helper

## Setup

```sh
cd posture-analysis/posture
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

`posture-analysis/training` exports a fine-tuned RTMPose ONNX to
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
| Enroll/check face from a photo | `POST /api/enroll/face-image` — raw image bytes; `?mode=match` tests against the gallery without storing (see `/docs`) |
| Delete all face embeddings | Dashboard "Delete gallery" (or `DELETE /api/gallery`) |
| Upright reference (10 s stand) | Dashboard "Calibrate upright" (or `POST /api/calibration/upright`) |
| Floor plane (4 clicks) | Dashboard "Calibrate floor" (or `POST /api/calibration/floor`) |
| Guided session (normal / simulated slow walk) | Dashboard "Start session" (+ `simulated` checkbox) |
| Dev-only raw recording | `POST /api/record/start` → writes `/recordings/*.mp4` (future fine-tuning data; off by default via `RECORDING_ENABLED=0`) |
| Switch site (room) | Dashboard site input, or `POST /api/site/<id>` |

## Multi-room (sites)

The same camera can be moved between rooms. Each room is a **site** with its
own floor homography, upright references and aggregates — nothing is shared
or mixed across sites.

- Set `SITE=<room>` in `.env` for the initial site (default: `default`).
- Switch at runtime via the dashboard site input or `POST /api/site/<id>`;
  the choice is persisted (`active_site` config key) so a restart keeps it.
- `minute`, `visage_minute`, `episode`, `session` and `jour` rows carry a
  `site` column and are only read back for the active site. Calibration keys
  are stored internally as `site:<id>:<key>`; a pre-site unscoped
  `floor_homography` is migrated into `site:default:*` on first boot.
- After moving the camera, calibrate floor + upright again — each site keeps
  its own values.

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

## GPU variant

```sh
docker compose -f docker-compose.yml -f docker-compose.gpu.yml build
docker compose -f docker-compose.yml -f docker-compose.gpu.yml up -d
```

The NVIDIA container toolkit is installed on this host (RTX 3070 laptop), but
only the **CDI device passthrough** is configured: `docker info` reports CDI
`nvidia.com/gpu=all` while Runtimes stays runc-only. Plain compose `gpus: all`
therefore **does not work** here — the daemon cannot select a device driver
("could not select device driver"). The override passes the CDI device
instead:

```yaml
devices:
  - "nvidia.com/gpu=all"
```

verified with `nvidia-smi` inside a test container. On a host where the
NVIDIA container runtime *is* registered (`sudo nvidia-ctk runtime configure
--runtime=docker` + restart), `gpus: all` would also work; the CDI device line
works in both cases. With `DEVICE=cuda`, `POSE_MODE` defaults to `balanced` and
`DET_EVERY` to 1 (`afferent/config.py`).

## API summary

`GET /` dashboard · `GET /stream.mjpg` annotated preview · `GET /api/status` ·
`POST /api/enroll/start|stop` · `POST /api/enroll/face-image?mode=enroll|match&face_index=N` ·
`DELETE /api/gallery` ·
`POST /api/calibration/floor|upright` · `POST /api/session/start|stop` ·
`POST /api/site/{id}` ·
`GET /api/minutes?since=` · `GET /api/sessions` · `GET /api/days` ·
`POST /api/record/start|stop` · `POST /api/days/refresh`

## Data manager (optional)

Set `DATA_MANAGER_URL` in `.env` (an address reachable from inside the container) to also
push, for every minute row, the runtime's own medians of **trunk vs vertical**
(`trunk_inclination`) and **head vs trunk** (`head_trunk_angle`) to `jetson/data_manager`
— the same `geometry.py` values the minute table stores, with the same per-orientation
validity. Only **standing / walking** minutes are sent (sitting = knee < 120°, hip–ankle
span only as a fallback when the knees are not visible). One source per context:
`posture/<site>/<activity>-<orientation>`. Off by default: nothing leaves the machine.
See `afferent/datasink.py`.

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
