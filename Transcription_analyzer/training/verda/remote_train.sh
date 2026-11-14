#!/usr/bin/env bash
set -euo pipefail

REMOTE_ROOT="${REMOTE_ROOT:-afferent}"
REMOTE_HOME="${REMOTE_HOME:-$HOME/$REMOTE_ROOT}"
TRAIN="$REMOTE_HOME/Transcription_analyzer/training"
ANALYZER="$REMOTE_HOME/Transcription_analyzer/analyzer"
IMAGE="${IMAGE:-afferent-ta-train:cu128}"
BASE_MODEL="${BASE_MODEL:-Qwen/Qwen3-8B}"
MAKE_TARGETS="${MAKE_TARGETS-dataset train}"
PREDICTION_JOBS="${PREDICTION_JOBS:-test:adapter test:base val:adapter val:base}"
REMOTE_MODE="${REMOTE_MODE:-docker}"
EPOCHS="${EPOCHS:-3}"
MAX_LEN="${MAX_LEN:-4096}"
MAX_WINDOW_CHARS="${MAX_WINDOW_CHARS:-9000}"
OUT="${OUT:-work_dirs/run2}"
TOKENIZER="${TOKENIZER:-../models/qwen3-8b-lora-run1}"

cd "$TRAIN"
HF_HOME="$TRAIN/cache/huggingface"
mkdir -p "$HF_HOME"
export HF_HOME HF_HUB_ENABLE_HF_TRANSFER=0

echo "== remote: $(hostname) | requested mode=$REMOTE_MODE =="
if command -v nvidia-smi >/dev/null 2>&1; then
    nvidia-smi || true
fi

prepare_native() {
    command -v python3.12 >/dev/null 2>&1 || {
        echo >&2 "Python 3.12 is required for native training"; return 1;
    }
    if ! command -v uv >/dev/null 2>&1; then
        command -v curl >/dev/null 2>&1 || {
            echo >&2 "curl is required to install uv"; return 1;
        }
        curl -LsSf https://astral.sh/uv/install.sh | sh
        export PATH="$HOME/.local/bin:$HOME/.cargo/bin:$PATH"
    fi
    VENV="$TRAIN/.venv"
    uv venv --python "$(command -v python3.12)" "$VENV"
    PYTHON="$VENV/bin/python"
    uv pip install --python "$PYTHON" \
        --index-url https://download.pytorch.org/whl/cu128 \
        --extra-index-url https://pypi.org/simple "torch==2.8.0"
    uv pip install --python "$PYTHON" \
        --index-url https://pypi.org/simple -r "$TRAIN/requirements-train.txt"
    "$PYTHON" -c 'import torch; assert torch.cuda.is_available(), "torch.cuda.is_available() is false on the instance"; print(torch.cuda.get_device_name(0))'
}

if [ "$REMOTE_MODE" = native ]; then
    prepare_native
elif [ "$REMOTE_MODE" = docker ]; then
    if ! DOCKER_BUILDKIT=1 docker build -t "$IMAGE" "$TRAIN"; then
        echo "Docker build failed; falling back to native mode on this VM"
        REMOTE_MODE=native
        prepare_native
    elif ! docker run --rm --gpus all "$IMAGE" \
            python -c "import torch; assert torch.cuda.is_available(); print(torch.cuda.get_device_name(0))"; then
        echo "Docker GPU check failed; falling back to native mode on this VM"
        REMOTE_MODE=native
        prepare_native
    fi
else
    echo >&2 "REMOTE_MODE must be native or docker, got '$REMOTE_MODE'"
    exit 2
fi

if [ "$REMOTE_MODE" = native ]; then
    run_make() {
        (cd "$TRAIN" && PYTHONPATH="$ANALYZER${PYTHONPATH:+:$PYTHONPATH}" \
            make "$1" PY="$PYTHON" BASE_MODEL="$BASE_MODEL" \
            EPOCHS="$EPOCHS" MAX_LEN="$MAX_LEN" \
            MAX_WINDOW_CHARS="$MAX_WINDOW_CHARS" OUT="$OUT" \
            TOKENIZER="$TOKENIZER" EXTRA="${EXTRA:-}")
    }
    run_predict() {
        local split="$1" variant="$2" adapter="$OUT/adapter"
        [ "$variant" = adapter ] || adapter=none
        (cd "$TRAIN" && PYTHONPATH="$ANALYZER${PYTHONPATH:+:$PYTHONPATH}" \
            "$PYTHON" scripts/predict.py --data-dir data/sft \
            --split "$split" --base-model "$BASE_MODEL" \
            --adapter "$adapter" --output "$OUT/predictions/${split}_${variant}.jsonl")
    }
else
    run_make() {
        docker run --rm --gpus all --shm-size 4g \
            -v "$TRAIN:/workspace/training" \
            -v "$ANALYZER:/workspace/analyzer" \
            -v "$REMOTE_HOME/Transcription_analyzer/models:/workspace/models" \
            -v "$TRAIN/cache/huggingface:/root/.cache/huggingface" \
            -e PYTHONPATH=/workspace/analyzer -e HF_HOME=/root/.cache/huggingface \
            -w /workspace/training "$IMAGE" \
            make "$1" BASE_MODEL="$BASE_MODEL" EPOCHS="$EPOCHS" \
            MAX_LEN="$MAX_LEN" MAX_WINDOW_CHARS="$MAX_WINDOW_CHARS" \
            OUT="$OUT" TOKENIZER="$TOKENIZER" EXTRA="${EXTRA:-}"
    }
    run_predict() {
        local split="$1" variant="$2" adapter="$OUT/adapter"
        [ "$variant" = adapter ] || adapter=none
        docker run --rm --gpus all --shm-size 4g \
            -v "$TRAIN:/workspace/training" \
            -v "$ANALYZER:/workspace/analyzer" \
            -v "$REMOTE_HOME/Transcription_analyzer/models:/workspace/models" \
            -v "$TRAIN/cache/huggingface:/root/.cache/huggingface" \
            -e PYTHONPATH=/workspace/analyzer -e HF_HOME=/root/.cache/huggingface \
            -w /workspace/training "$IMAGE" python scripts/predict.py \
            --data-dir data/sft --split "$split" --base-model "$BASE_MODEL" \
            --adapter "$adapter" --output "$OUT/predictions/${split}_${variant}.jsonl"
    }
fi

if [ "$MAKE_TARGETS" != none ]; then
    for target in $(echo "$MAKE_TARGETS" | tr ',' ' '); do
        echo "== make $target (mode=$REMOTE_MODE, MAX_LEN=$MAX_LEN, EPOCHS=$EPOCHS) =="
        run_make "$target"
    done
fi

for job in $PREDICTION_JOBS; do
    split="${job%%:*}"
    variant="${job#*:}"
    case "$split:$variant" in
        test:adapter|test:base|val:adapter|val:base) ;;
        *) echo >&2 "invalid prediction job '$job'"; exit 2 ;;
    esac
    [ -s "$TRAIN/data/sft/$split.jsonl" ] || continue
    run_predict "$split" "$variant"
done

echo "== remote run done =="
