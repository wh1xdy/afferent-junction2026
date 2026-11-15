# syntax=docker/dockerfile:1.6
#
# Base image is selected at `wendy run` time via the WENDY_PLATFORM build arg
# that the wendy CLI injects after querying the target device:
#   - nvidia-jetson -> dustynv/llama_cpp (llama.cpp + CUDA/JetPack, jetson-containers)
#   - generic       -> python:3.11-slim-bookworm (CPU / dev / openai-backend mode)

ARG WENDY_PLATFORM=generic

# ── NVIDIA Jetson base ──────────────────────────────────────────────────────
FROM dustynv/llama_cpp:b5283-r36.4-cu128-24.04 AS base-nvidia-jetson

# dustynv installs pip packages into /opt/venv — keep its bin dir on PATH.
ENV PATH="/opt/venv/bin:${PATH}"

RUN --mount=type=cache,target=/root/.cache/pip \
    pip3 install --index-url https://pypi.org/simple/ \
    fastapi 'uvicorn[standard]' httpx pydantic pyyaml zeroconf huggingface_hub

# JetPack 7 / WendyOS GPU fix: keep the image's CUDA-12 runtime libraries,
# but let the host inject the CUDA-13 driver instead of the image compat driver.
RUN mkdir -p /opt/cuda12/lib \
 && find /usr/local/cuda/targets/*/lib /usr/lib/aarch64-linux-gnu -maxdepth 1 \( \
        -name 'libcudart.so*'  -o -name 'libcublas*.so*'   -o -name 'libcufft*.so*'   \
     -o -name 'libcurand.so*'  -o -name 'libcusolver*.so*' -o -name 'libcusparse.so*' \
     -o -name 'libnvrtc*.so*'  -o -name 'libnpp*.so*'      -o -name 'libcudnn*.so*'   \
   \) ! -name 'libcuda.so*' -exec ln -sf {} /opt/cuda12/lib/ \; 2>/dev/null \
 && echo /opt/cuda12/lib > /etc/ld.so.conf.d/000-cuda12.conf \
 && ldconfig
ENV LD_LIBRARY_PATH=/opt/cuda12/lib
RUN test -n "$(ls /opt/cuda12/lib/libcudart.so* 2>/dev/null)"

RUN server="$(command -v llama-server || \
              find / -type f -name llama-server -perm /111 -print -quit 2>/dev/null)" \
 && test -n "$server" \
 && { test "$server" = /usr/local/bin/llama-server || \
      ln -sf "$server" /usr/local/bin/llama-server; } \
 && command -v llama-server

# Models are Jetson-only (mesh apps have no internet egress, so nothing can be
# fetched at runtime). The 5 GB base GGUF gets its own early layer: code and
# adapter changes never re-send it. See README "Jetson image model prerequisite".
COPY models/Qwen3-8B-Q4_K_M.gguf /app/models/
COPY models/student-lora-*.gguf /app/models/
RUN test -f /app/models/Qwen3-8B-Q4_K_M.gguf


# ── Generic CPU base (dev laptop, cloud instance, RPi) ──────────────────────
FROM python:3.11-slim-bookworm AS base-generic

COPY requirements.txt /tmp/requirements.txt
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install -r /tmp/requirements.txt


# ── Final stage ─────────────────────────────────────────────────────────────
FROM base-${WENDY_PLATFORM} AS final

WORKDIR /app

ARG WENDY_PLATFORM=generic
ARG WENDY_DEVICE_TYPE=""
ARG WENDY_HAS_CUDA=""
ARG WENDY_GPU_VENDOR=""
ENV WENDY_PLATFORM=${WENDY_PLATFORM} \
    WENDY_DEVICE_TYPE=${WENDY_DEVICE_TYPE} \
    WENDY_HAS_CUDA=${WENDY_HAS_CUDA} \
    WENDY_GPU_VENDOR=${WENDY_GPU_VENDOR}

COPY analyzer/ ./analyzer/
COPY configs/ ./configs/
COPY web/ ./web/

ENV PYTHONUNBUFFERED=1
# Runtime config via ANALYZER_CONFIG or ANALYZER_* env vars; /data is the
# wendy `persist` volume (model + db + transcripts live there).
ENV ANALYZER_CONFIG=/app/configs/jetson.yaml
ENV HF_HOME=/data/models/huggingface

EXPOSE 3080

CMD ["uvicorn", "analyzer.service:app", "--host", "0.0.0.0", "--port", "3080"]
