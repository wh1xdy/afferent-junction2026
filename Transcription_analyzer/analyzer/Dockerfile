# syntax=docker/dockerfile:1.6
#
# Base image is selected at `wendy run` time via the WENDY_PLATFORM build arg
# that the wendy CLI injects after querying the target device:
#   - nvidia-jetson -> dustynv/llama_cpp (llama.cpp + CUDA/JetPack, jetson-containers)
#   - generic       -> python:3.11-slim-bookworm (CPU / dev / openai-backend mode)
#
# PENDING REAL-BOARD VALIDATION (P2 benchmark): if the JetPack-7 CUDA-13 host
# driver hits the same compat-shadowing bug fixed in jetson/vision/Dockerfile
# (cuInit Error 801), copy the /opt/cuda12 shim RUN block from there — the
# dustynv llama_cpp base has the same layout.

ARG WENDY_PLATFORM=generic

# ── NVIDIA Jetson base ──────────────────────────────────────────────────────
FROM dustynv/llama_cpp:r36.4.0 AS base-nvidia-jetson

# dustynv installs pip packages into /opt/venv — keep its bin dir on PATH.
ENV PATH="/opt/venv/bin:${PATH}"

RUN --mount=type=cache,target=/root/.cache/pip \
    pip3 install --index-url https://pypi.org/simple/ \
    fastapi 'uvicorn[standard]' httpx pydantic pyyaml


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

ENV PYTHONUNBUFFERED=1
# Runtime config via ANALYZER_CONFIG or ANALYZER_* env vars; /data is the
# wendy `persist` volume (model + db + transcripts live there).
ENV ANALYZER_CONFIG=/app/configs/jetson.yaml

EXPOSE 3080

CMD ["uvicorn", "analyzer.service:app", "--host", "0.0.0.0", "--port", "3080"]
