# syntax=docker/dockerfile:1.6
#
# afferent posture POC — CPU by default. Build the GPU variant with:
#   docker compose -f docker-compose.yml -f docker-compose.gpu.yml build
# Requires the NVIDIA container toolkit on the host (CDI device
# nvidia.com/gpu=all; plain `--gpus` needs the nvidia runtime registered).

FROM python:3.11-slim-bookworm

ARG ORT=cpu

# libgl1/libglib2.0-0: required by opencv-python (non-headless, needed by
# mediapipe's opencv-contrib-python dependency). libegl1/libgles2: mediapipe
# tasks native lib. libgomp1: onnxruntime OpenMP.
# build-essential + v4l-utils: insightface cython ext / camera debugging.
RUN apt-get update && apt-get install -y --no-install-recommends \
      libgl1 \
      libglib2.0-0 \
      libegl1 \
      libgles2 \
      libgomp1 \
      build-essential \
      v4l-utils \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt ./
COPY scripts/link_nvidia_libs.py /tmp/link_nvidia_libs.py
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install --no-cache-dir -r requirements.txt

# GPU variant: insightface/rtmlib pull the CPU onnxruntime wheel, so after the
# main install we swap it for onnxruntime-gpu plus the CUDA/cuDNN pip wheels
# its extras declare, then link every nvidia .so into /usr/local/lib so the
# loader finds them without a toolkit install inside the image.
RUN if [ "$ORT" = "gpu" ]; then \
      pip uninstall -y onnxruntime && \
      pip install --no-cache-dir "onnxruntime-gpu[cuda,cudnn]==1.31.0" && \
      python /tmp/link_nvidia_libs.py \
    ; fi

COPY afferent/ ./afferent/
COPY web/ ./web/
COPY tests/ ./tests/
COPY pytest.ini ./

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    MODELS_DIR=/models \
    DB_PATH=/data/afferent.db \
    # GPU variant: link_nvidia_libs.py symlinks the pip-shipped CUDA/cuDNN
    # .so files into /usr/local/lib/nvidia; that dir is not in ld.so.conf,
    # so expose it to the loader (harmless no-op in the CPU image).
    LD_LIBRARY_PATH=/usr/local/lib/nvidia

EXPOSE 8000

CMD ["python", "-m", "afferent"]
