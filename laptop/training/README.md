# afferent — pose fine-tuning scaffold (phase 4)

This folder fine-tunes **RTMPose-m Halpe-26 (body + feet)**, the pose model that
`rtmlib.BodyWithFeet(mode="balanced")` runs in `laptop/posture`, on our own
annotated home recordings. It then exports an ONNX that drops into rtmlib
unchanged.

It covers the 8 steps of phase 4 in the plan (collect, annotate, split, train,
evaluate, export, calibrate, loop) and the rules added there:

- annotate the **6 foot points** (big toe, small toe, heel ×2), not only COCO-17;
- collect **walking and sit-to-stand** sequences, not only static postures;
- split **by person**, never by frame or by day;
- judge the model on the **final variables** (walking-speed error...), not only on keypoint error.

```
record ──► extract ──► prelabel ──► correct (CVAT) ──► split ──► train
   ▲                                                              │
   │                                                              ▼
 install-model ◄── evaluate (keypoints + variables) ◄── export ONNX
```

## Layout

| path | what |
|---|---|
| `Dockerfile`, `docker-compose.yml` | MMPose training image (CPU or cu121), plus a `train-gpu` service using `gpus: all` |
| `constraints.txt`, `requirements-train.txt` | pinned training stack |
| `requirements-tools.txt` | light host env for extract/prelabel/split/evaluate (no torch) |
| `configs/rtmpose-m_halpe26_finetune.py` | fine-tune config (inherits the official one) |
| `scripts/extract_frames.py` | video → sampled frames + `frames.csv` (person/session metadata) |
| `scripts/prelabel.py` | rtmlib BodyWithFeet → COCO Halpe-26 JSON + CVAT skeleton label |
| `scripts/split.py` | person-disjoint train/val/test split, with a fixed seed |
| `scripts/train.py` | MMEngine runner entry point (`tools/train.py` equivalent) |
| `scripts/export_onnx.py` | checkpoint → rtmlib ONNX (no mmdeploy), with a parity check |
| `scripts/evaluate.py` | baseline vs fine-tuned ONNX: torso-PCK@0.05, per-keypoint/feet, NME, OKS-AP |
| `scripts/eval_variables.py` | final-variable agreement (MAE, bias, Bland-Altman, within-5 %) |
| `scripts/make_synthetic_dataset.py` | fake data for plumbing smoke tests |
| `scripts/halpe26.py` | keypoint layout, skeleton, sigmas, metric functions |
| `manifests/sessions.example.{yaml,csv}` | recording manifest template |
| `tests/` | pytest: split leakage/determinism, PCK/OKS on synthetic data, helpers |

## Version set

| component | version | why |
|---|---|---|
| Python | 3.10 | mmcv 2.1.0 wheels exist for cp38–cp311 |
| torch / torchvision | 2.1.2 / 0.16.2 (`cu121` or `cpu` index) | mmcv 2.1.0 prebuilt for `torch2.1.0` (and 2.1.x) |
| mmcv | 2.1.0 | mmdet 3.x asserts `mmcv < 2.2.0`; prebuilt at `download.openmmlab.com/mmcv/dist/{cu121,cpu}/torch2.1.0/` |
| mmengine | 0.10.4 | mmpose needs `<1.0.0` |
| mmdet | 3.2.0 | `mmpose/requirements/mminstall.txt`: `mmdet>=3.0.0,<3.3.0` (the config uses `mmdet.CSPNeXt` and `mmdet.PipelineSwitchHook`) |
| mmpose | 1.3.2 | `mmcv>=2.0.0,<3.0.0`; the wheel ships configs under `mmpose/.mim/configs` |
| numpy | 1.26.4 | the compiled OpenMMLab extensions are built against NumPy 1.x |
| albumentations | 1.3.1 | the RTMPose pipeline uses the pre-2.0 `CoarseDropout(max_holes=...)` API |
| onnx / onnxruntime | 1.16.2 / 1.18.1 | export + parity check |

Sources: mmpose v1.3.2 `mmpose/__init__.py` and `requirements/mminstall.txt`,
mmdet v3.3.0 `mmdet/__init__.py` (`mmcv_maximum_version = '2.2.0'`), the mmcv
wheel index pages above, and the mmcv install docs.

`mmpose` is installed with `--no-deps` because its `chumpy` dependency has a
setup.py that breaks on modern pip. chumpy is only used for SMPL tooling. The
other dependencies are listed in `requirements-train.txt`.

## Build and run

```bash
cd laptop/training
# CPU image (local; verified on the dev laptop)
docker build -t afferent-train:cpu --build-arg TORCH_VARIANT=cpu .
# or: docker compose build train

# GPU image (default arg). Needs only an NVIDIA driver >= 525 on the host:
# torch cu121 wheels ship their own CUDA runtime and cuDNN.
docker build -t afferent-train:cu121 .
docker compose --profile gpu run --rm train-gpu make train AMP=1   # needs nvidia-container-toolkit
```

The dev laptop (RTX 3070) has **no nvidia-container-toolkit**, so GPU-in-Docker
is untested there. Two options:

- run without Docker: make a py3.10 venv, run the same `pip install` lines as the
  Dockerfile, then `make train`; or
- run on remote GPUs:
  - **Modal:** `modal.Image.from_dockerfile("laptop/training/Dockerfile")` (default
    `TORCH_VARIANT=cu121`), then mount a Volume holding `data/`.
  - **Verda / any VM with Docker and the toolkit:** `docker compose --profile gpu`.

  In both cases, ship only `data/annotations` and `data/frames` of
  consenting participants, over an encrypted transport. Delete them afterwards.

Every script also runs on the host with `pip install -r requirements-tools.txt`,
except `train.py` and `export_onnx.py`, which need the training image.

## The loop (`make help`)

```bash
# 0. record: walking, sit-to-stand, turn, seated, standing posture, ideally
#    several people (age, sex, body type, skin tone, glasses, beard). Save to
#    laptop/posture/recordings/*.mp4 and describe each file in
#    manifests/sessions.yaml (copy the example). Use pseudonymous ids only.
#    Frames are extracted only for entries with consent: true.
make extract  FPS=2                 # -> data/frames/<session>/*.jpg + frames.csv
make prelabel DEVICE=cpu            # -> data/annotations/prelabel.json + cvat_skeleton.json
# 1. correct in CVAT (below)        # -> data/annotations/corrected.json
make split SEED=0                   # -> data/annotations/{train,val,test}.json + split_report.json
make train AMP=1                    # in the image, GPU -> work_dirs/rtmpose-m_halpe26_ft/best_coco_AP_*.pth
make test                           # mmpose CocoMetric AP + bbox-PCK on test
make export                         # -> work_dirs/export/rtmpose-m_halpe26_ft.onnx (+ .json)
make evaluate                       # baseline (stock rtmlib) vs fine-tuned ONNX on test
python scripts/eval_variables.py --csv work_dirs/eval/variables.csv   # final-variable criterion
make install-model                  # -> laptop/posture/models/custom/rtmpose-m_halpe26_ft.onnx
```

Then loop: pre-label the next batch with the fine-tuned model
(`prelabel.py --pose-onnx ...`), correct it, and retrain.

### Correcting in CVAT (COCO Keypoints 1.0)

1. Create a project. In the **Raw** label editor, paste
   `data/annotations/cvat_skeleton.json`. It defines a skeleton `person` with the 26
   Halpe points in Halpe order. Check it once in the constructor.
2. Create a task. Upload `data/frames` as a zip that keeps the
   `<session_id>/<file>.jpg` paths, so names match `images[].file_name`.
3. *Actions → Upload annotations → COCO Keypoints 1.0* → `prelabel.json`.
   Keypoints with `v=1` are low-confidence pre-labels: check every one, and every foot point.
4. *Export task dataset → COCO Keypoints 1.0*. Save
   `annotations/person_keypoints_default.json` as `data/annotations/corrected.json`.
   CVAT drops the custom `person_ids` field, so `split.py` joins back on
   `frames.csv` (full path, then basename).

Label Studio works too: use its COCO keypoints import via
`label-studio-converter`. The exported COCO JSON just needs the same 26-point order.

Annotation guidelines:

- Annotate every person in a frame. Visitors appear in the person list of the session.
- `v=1` means occluded but inferable. `v=0` means not inferable.
- Heel and toe points go on the shoe when shod.

### Splitting rules

`split.py` merges people who appear together in any frame into one group
(union-find). Each group goes into exactly one split, and the seed fixes the
assignment. Use `--test-persons P07 P08` to hold out a fixed panel across
iterations: **keep the test panel frozen** so successive models stay comparable.
`split_report.json` lists the persons per split. Never tune on `test`; use `val`.

## Model I/O contract with rtmlib

Checked against `Tau-J/rtmlib` (`tools/solution/body_with_feet.py`,
`tools/pose_estimation/rtmpose.py`, `tools/base.py`) and the official
`onnx_sdk` zip (`detail.json`):

- **input** `input`: float32 `[batch, 3, 256, 192]` (NCHW). rtmlib's
  `pose_input_size=(192, 256)` is (W, H).
- **outputs** `simcc_x`: `[batch, 26, 384]` and `simcc_y`: `[batch, 26, 512]`
  (input size × `simcc_split_ratio=2.0`). opset 11, dynamic batch axis.
- **rtmlib post-processing:**
  - bbox → center/scale with padding 1.25, then affine warp;
  - `(img - mean) / std` with mean (123.675, 116.28, 103.53) and std (58.395, 57.12, 57.375);
  - argmax over each simcc axis, then `/ 2.0`, then back to image coordinates.
  - score = the max simcc value.
- **BGR quirk:** rtmlib feeds the cv2 **BGR** frame, normalised with RGB-order
  statistics. It ignores `to_rgb` in `pipeline.json`. MMPose trains with
  `bgr_to_rgb=True`, so `export_onnx.py` by default bakes an exact BGR→RGB
  re-normalisation into the graph: a flip plus a per-channel affine, tested in
  `tests/test_cli_helpers.py`. `--no-bgr-fix` gives the vanilla graph.
  - Re-exporting the official `.pth` with `--no-bgr-fix` matches the official
    ONNX to 1.5e-7 (max abs diff).
  - The fixed graph moves predictions on real images by about 1 % of torso length.

To use the model, call
`BodyWithFeet(pose="<models>/custom/rtmpose-m_halpe26_ft.onnx", pose_input_size=(192, 256), mode="balanced")`.
`laptop/posture/afferent/pose.py` does not yet accept a custom pose path;
that hook belongs to the runtime code.

## Evaluation criteria

- **Keypoints** (`evaluate.py`):
  - Measured on the test split with ground-truth boxes, so detector errors don't count.
  - Metrics: torso-normalised PCK@0.05, overall / body-17 / feet, per keypoint;
    NME; OKS-AP with Halpe-26 sigmas; per-situation breakdown.
  - Pass condition: the fine-tuned model is ≥ baseline on PCK_feet and PCK_overall.
- **Final variables** (`eval_variables.py`, plan item 53): walking speed, cadence,
  step length, sit-to-stand time...
  - Reference sequences: person-disjoint, with external ground truth (stopwatch
    over marked distance, goniometer).
  - Run the posture pipeline once per pose model and write
    `sequence_id,person_id,variable,ground_truth,model,value`.
  - Reports MAE, bias, Bland-Altman limits, and the fraction within 5 %.
  - A model passes only if its MAE ≤ baseline on every retained variable. A
    keypoint gain that does not show up there is not a gain.
- **Calibrate:** after installing a new model, redo the phase-3 checks (ICC,
  smallest detectable change) before comparing against older days. A model
  change is a measurement-instrument change, so log the model version with
  every measurement.

## Licensing notes

- **Code and models:**
  - MMPose / RTMPose code and configs: Apache-2.0.
  - rtmlib: Apache-2.0.
  - YOLOX: Apache-2.0.
  - Our fine-tuned weights are a derivative of the official checkpoint.
- **Training data behind the pretrained weights:** COCO (annotations CC BY 4.0,
  images under Flickr terms), AIC, CrowdPose, MPII, JHMDB, Halpe, PoseTrack18.
  Several of these, including Halpe-FullBody, are released for
  **non-commercial research**. The "commercial stack" in the plan must get the
  weights' licensing checked by a lawyer (deferred item 12). If you mix
  public Halpe/COCO data into fine-tuning, the same terms apply. Don't
  redistribute those images.
- **Annotation tools:** CVAT Community is MIT. Label Studio Community is Apache-2.0.
- **Runtime models** (for the record): InsightFace `buffalo_l` weights are
  non-commercial research only. HSEmotion code is Apache-2.0, but its models are
  trained on AffectNet (research-only licence).

## Privacy

- Record only **consenting** adults. The consent covers face, health data and
  retention (phase 0). `extract_frames.py` skips manifest entries without
  `consent: true`.
- **Never commit images, videos, checkpoints or ONNX files.**
  - `.gitignore` excludes `data/`, `work_dirs/`, `cache/`, `*.pth`, `*.onnx`,
    `*.mp4`, `*.jpg`...
  - `.dockerignore` keeps them out of image builds.
- Manifests and annotations use pseudonymous ids (`P01`) only, with no names.
  Keep the id-to-person key outside the repo.
- Remote training: upload the minimum (frames + annotations), encrypted at
  rest, then delete them after the run. Don't use public datasets/hubs for our data.
- Withdrawal: drop the person's sessions from the manifest, delete their frames,
  re-split and retrain. Any model trained on their data counts as derived data.

## Later (stubs and notes only)

### Face-expression classifier on our own data (HSEmotion)

- The runtime uses `hsemotion-onnx`, an EfficientNet trained on AffectNet.
- Fine-tuning plan:
  - Take face crops from MediaPipe / InsightFace boxes on the same recordings.
    Label short clips (neutral / positive / negative / flat affect), not single
    frames, with two annotators and report Cohen's κ.
  - Start from the PyTorch `hsemotion` `enet_b0_8_best_vgaf` checkpoint.
    Replace the head, freeze the backbone first, and evaluate with the same
    person-wise split (`split.py` works unchanged on a COCO-like image list).
  - Export with `torch.onnx.export` (224×224 or 260×260 depending on the
    model), keeping the hsemotion-onnx preprocessing.
- More useful for the plan than discrete emotions: regress the
  **expressivity variables** directly from MediaPipe blendshapes. That needs no
  CNN fine-tuning.

### Per-person daily index model

- Inputs: the daily aggregates of the frozen reliable variables (phase 3),
  each z-scored against **the person's own baseline**, plus coverage and
  context covariates.
- Model: a regularised linear model (ridge / elastic-net, or a mixed model with
  a per-person intercept). Target: PHQ-9 or its change.
- Validation:
  - Across people: **leave-one-person-out CV**.
  - Within a person: forward-chaining CV by time, never random day shuffling,
    with a gap of ≥ 7 days between train and test to avoid autocorrelation leakage.
- Report calibration and the per-variable coefficient stability across folds.
  No alerting from the model (plan scope).

## Tests

```bash
uv venv /tmp/trainvenv && VIRTUAL_ENV=/tmp/trainvenv uv pip install numpy pytest pyyaml
/tmp/trainvenv/bin/python -m pytest -q tests
# inside the image: docker compose run --rm train make tests
```

Smoke test of the whole training path on fake data (inside the image, CPU, about 2 min):

```bash
python scripts/make_synthetic_dataset.py --out /cache/synth --n 16
AFFERENT_DATA_ROOT=/cache/synth/ python scripts/train.py configs/rtmpose-m_halpe26_finetune.py \
  --work-dir /cache/synth_work --cfg-options train_cfg.max_epochs=1 train_cfg.val_interval=1 \
  train_dataloader.batch_size=4 train_dataloader.num_workers=0 train_dataloader.persistent_workers=False \
  val_dataloader.num_workers=0 val_dataloader.persistent_workers=False
python scripts/export_onnx.py configs/rtmpose-m_halpe26_finetune.py /cache/synth_work/epoch_1.pth --out /cache/synth_work/ft.onnx
```
