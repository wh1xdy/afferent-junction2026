#!/usr/bin/env bash
# train.sh — build the Modal image and run `make $MAKE_TARGETS` on a GPU.
#
#   modal/train.sh                          # `make train test` on an A10
#   MODAL_GPU=T4 modal/train.sh             # cheaper GPU
#   MAKE_TARGETS="train test export evaluate" modal/train.sh
#
# The function runs remotely; this script blocks until it finishes and streams
# its logs. Checkpoints land in the volume (committed every 5 min and after
# each make target) — fetch them with modal/pull.sh.
#
# Env: MODAL_GPU MODAL_VOLUME MODAL_TIMEOUT MAKE_TARGETS AMP DEVICE EXTRA.
# Prereq: `modal token new` + modal/push.sh.
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/_common.sh"

load_config
check_modal

cd "$TRAINING_DIR"
AMP_FLAG="--amp"; [ "${AMP:-0}" = "1" ] || AMP_FLAG="--no-amp"

log "modal run: gpu=$MODAL_GPU volume=$MODAL_VOLUME targets='$MAKE_TARGETS' amp=$AMP"
run_modal run modal_app.py::main \
    --targets "$MAKE_TARGETS" \
    "$AMP_FLAG" \
    --device "$DEVICE" \
    --extra "$EXTRA"
