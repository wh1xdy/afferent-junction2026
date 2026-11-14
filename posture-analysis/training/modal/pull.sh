#!/usr/bin/env bash
# pull.sh — download training artifacts from the Modal volume.
#
#   $MODAL_VOLUME:/work/  ->  posture-analysis/training/work_dirs/
#     (checkpoints best_*.pth, exported ONNX + .json, eval reports, logs)
#
# Usage: modal/pull.sh
# Env: MODAL_VOLUME, PULL_DIR (local destination dir, default work_dirs),
#      REMOTE_DIR (volume path, default /work).
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/_common.sh"

load_config
check_modal

cd "$TRAINING_DIR"
log "pulling $MODAL_VOLUME:${REMOTE_DIR:-/work} -> $PULL_DIR/"
run_modal run modal_app.py::pull --remote-dir "${REMOTE_DIR:-/work}" --local-dir "$PULL_DIR"
