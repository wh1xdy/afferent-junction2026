#!/usr/bin/env bash
# remote_train.sh — runs ON the Verda instance (invoked by verda/train.sh,
# uploaded earlier by verda/sync.sh).
#
#   nvidia-smi
#   docker build -t afferent-ta-train:cu128 .
#   docker run --rm --gpus all ... make <target>   (one run per MAKE_TARGETS)
#
# Layout on the instance (mirrors the repo, see sync.sh):
#   ~/$REMOTE_ROOT/Transcription_analyzer/training   code + data/ + work_dirs/
#   ~/$REMOTE_ROOT/Transcription_analyzer/analyzer   analyzer package (imported
#                                                    by build_dataset.py)
#
# Env: REMOTE_ROOT IMAGE BASE_MODEL EXTRA MAKE_TARGETS (comma- or space-sep)
set -euo pipefail

REMOTE_ROOT="${REMOTE_ROOT:-afferent}"
REMOTE_HOME="${REMOTE_HOME:-$HOME/$REMOTE_ROOT}"
TRAIN="$REMOTE_HOME/Transcription_analyzer/training"
ANALYZER="$REMOTE_HOME/Transcription_analyzer/analyzer"
IMAGE="${IMAGE:-afferent-ta-train:cu128}"
BASE_MODEL="${BASE_MODEL:-Qwen/Qwen3-8B}"
MAKE_TARGETS="${MAKE_TARGETS:-dataset train}"

cd "$TRAIN"

echo "== remote: $(hostname) | user $(whoami) =="
nvidia-smi

# ---------------------------------------------------------------- build
DOCKER_BUILDKIT=1 docker build -t "$IMAGE" "$TRAIN"

docker run --rm --gpus all "$IMAGE" \
    python -c "import torch;print('cuda:',torch.cuda.is_available(),torch.cuda.get_device_name(0))" \
    || { echo >&2 "GPU not visible in docker -- install nvidia-container-toolkit
         on the instance (the cuda-*-docker OS images normally ship it)."; exit 1; }

# ------------------------------------------------------------------- run
# Both the training dir and the analyzer package are mounted; PYTHONPATH lets
# scripts/build_dataset.py import analyzer.metrics without an install.
for t in $(echo "$MAKE_TARGETS" | tr ',' ' '); do
    echo "== make $t (BASE_MODEL=$BASE_MODEL) =="
    docker run --rm --gpus all --shm-size 4g \
        -v "$TRAIN:/workspace/training" \
        -v "$ANALYZER:/workspace/analyzer" \
        -e PYTHONPATH=/workspace/analyzer \
        -e BASE_MODEL="$BASE_MODEL" \
        -w /workspace/training \
        "$IMAGE" make "$t" BASE_MODEL="$BASE_MODEL" EXTRA="${EXTRA:-}"
done

echo "== remote run done; pull results with verda/pull.sh =="
