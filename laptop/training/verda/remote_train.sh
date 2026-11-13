#!/usr/bin/env bash
# remote_train.sh — runs ON the Verda instance (invoked by verda/train.sh,
# uploaded earlier by verda/sync.sh as part of laptop/training/).
#
#   nvidia-smi
#   docker build -t afferent-train:cu121 --build-arg TORCH_VARIANT=cu121 .
#   docker run --rm --gpus all ... make <target>   (one run per MAKE_TARGETS)
#
# Layout on the instance (mirrors the repo, see sync.sh):
#   ~/$REMOTE_ROOT/laptop/training              code + data/ + work_dirs/
#   ~/$REMOTE_ROOT/laptop/posture/models/rtmlib pretrained ONNX cache
#
# Data root: the training dir is mounted at /workspace/training, so
# `make train` resolves AFFERENT_DATA_ROOT=$(abspath data)=/workspace/training/data
# which is exactly where sync.sh puts the dataset. No path juggling needed.
#
# rtmlib baseline for `make evaluate`: rtmlib looks up
# $TORCH_HOME/hub/checkpoints/<url-basename>.onnx and skips the download when
# present. The image sets TORCH_HOME=/cache/torch and we bind-mount
# training/cache there, so seeding cache/torch/hub/checkpoints from the
# synced rtmlib dir makes the baseline offline-friendly (harmless if names
# differ -- rtmlib then just downloads, which works since the VM is online).
#
# Env: REMOTE_ROOT IMAGE TORCH_VARIANT MAKE_TARGETS (comma- or space-separated)
#      AMP (1 -> AMP=1 on the make command line) DEVICE (make var, cpu here --
#      the image ships onnxruntime CPU, so `evaluate` stays on CPU)
set -euo pipefail

REMOTE_ROOT="${REMOTE_ROOT:-afferent}"
REMOTE_HOME="${REMOTE_HOME:-$HOME/$REMOTE_ROOT}"
TRAIN="$REMOTE_HOME/laptop/training"
RTMLIB="$REMOTE_HOME/laptop/posture/models/rtmlib"
IMAGE="${IMAGE:-afferent-train:cu121}"
TORCH_VARIANT="${TORCH_VARIANT:-cu121}"
AMP="${AMP:-}"
DEVICE="${DEVICE:-cpu}"
MAKE_TARGETS="${MAKE_TARGETS:-train test}"

cd "$TRAIN"

echo "== remote: $(hostname) | user $(whoami) =="
nvidia-smi

# ---------------------------------------------------------------- build
DOCKER_BUILDKIT=1 docker build \
    -t "$IMAGE" --build-arg "TORCH_VARIANT=$TORCH_VARIANT" "$TRAIN"

# fail fast if the GPU is not visible inside containers
docker run --rm --gpus all "$IMAGE" \
    python -c "import torch;print('cuda:',torch.cuda.is_available(),torch.cuda.get_device_name(0))" \
    || { echo >&2 "GPU not visible in docker -- install nvidia-container-toolkit
         on the instance (the cuda-*-docker OS images normally ship it)."; exit 1; }

# ------------------------------------------------- seed the rtmlib ONNX cache
CKPT_DIR="$TRAIN/cache/torch/hub/checkpoints"
mkdir -p "$CKPT_DIR"
if [ -d "$RTMLIB/hub/checkpoints" ]; then
    cp -n "$RTMLIB/hub/checkpoints/"*.onnx "$CKPT_DIR/" 2>/dev/null || true
fi

# ------------------------------------------------------------------- run
# One `docker run` + one `make` invocation per target: `make train test` in a
# single make call would resolve CKPT (the best_*.pth glob) BEFORE training
# produced it, so targets must stay separate.
# shellcheck disable=SC2086
for t in $(echo "$MAKE_TARGETS" | tr ',' ' '); do
    echo "== make $t (AMP=${AMP:-0} DEVICE=$DEVICE) =="
    docker run --rm --gpus all --shm-size 4g \
        -v "$TRAIN:/workspace/training" \
        -v "$TRAIN/cache:/cache" \
        -w /workspace/training \
        "$IMAGE" make "$t" AMP="$AMP" DEVICE="$DEVICE" \
        EXTRA="${EXTRA:-}"
done

echo "== remote run done; pull results with verda/pull.sh =="
