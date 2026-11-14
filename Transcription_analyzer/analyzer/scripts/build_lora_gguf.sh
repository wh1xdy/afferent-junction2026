#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CACHE="${XDG_CACHE_HOME:-$HOME/.cache}/afferent-build"
LLAMA_CPP="$CACHE/llama.cpp"
VENV="$CACHE/lora-converter-py312"
PYTHON="$VENV/bin/python"
LORA="${LORA_DIR:-$ROOT/../models/qwen3-8b-lora-run1}"
OUTPUT="${OUTPUT_PATH:-$ROOT/models/student-lora-f16.gguf}"

if [[ ! -f "$LLAMA_CPP/convert_lora_to_gguf.py" ]]; then
  git clone --depth 1 --branch b5283 \
    https://github.com/ggml-org/llama.cpp.git "$LLAMA_CPP"
fi

if [[ ! -x "$PYTHON" ]]; then
  uv venv --python 3.12 "$VENV"
fi

uv pip install --python "$PYTHON" torch \
  --index-url https://download.pytorch.org/whl/cpu
uv pip install --python "$PYTHON" \
  -e "$LLAMA_CPP/gguf-py" transformers safetensors sentencepiece numpy

test -f "$LORA/adapter_config.json"
test -f "$LORA/adapter_model.safetensors"
mkdir -p "$ROOT/models"
"$PYTHON" "$LLAMA_CPP/convert_lora_to_gguf.py" \
  --base-model-id Qwen/Qwen3-8B \
  --outtype f16 \
  --outfile "$OUTPUT" \
  "$LORA"
