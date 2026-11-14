#!/usr/bin/env bash
# push.sh — upload the dataset + rtmlib ONNX cache into the Modal volume.
#
#   posture-analysis/training/data/              -> $MODAL_VOLUME:/data/
#     (frames/ + annotations/ produced by make extract / split — consenting
#      sessions only, enforced by extract_frames.py)
#   posture-analysis/posture/models/rtmlib cache -> $MODAL_VOLUME:/models/torch/hub/checkpoints/
#     (pretrained ONNX for `make evaluate` / prelabel — offline-friendly)
#
# Usage: modal/push.sh
# Env: MODAL_VOLUME (config.env). Prereq: `modal token new` + `make extract split`.
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/_common.sh"

load_config
check_modal

cd "$TRAINING_DIR"
log "uploading dataset + rtmlib cache -> volume '$MODAL_VOLUME'"
run_modal run modal_app.py::push
