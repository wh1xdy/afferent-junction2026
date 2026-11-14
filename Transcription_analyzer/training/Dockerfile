# syntax=docker/dockerfile:1.6
# QLoRA training image — runs on the Verda VM via verda/remote_train.sh.
# TORCH_VARIANT picks the torch build matching the GPU generation
# (see docs/verda_training.md: V100 needs special care, Blackwell needs cu128+).

ARG BASE_IMAGE=pytorch/pytorch:2.7.0-cuda12.8-cudnn9-runtime
FROM ${BASE_IMAGE}

WORKDIR /workspace/training

# make: the runtime images don't ship it, remote_train.sh drives `make`.
RUN apt-get update && apt-get install -y --no-install-recommends make \
    && rm -rf /var/lib/apt/lists/*

COPY requirements-train.txt /tmp/requirements-train.txt
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install -r /tmp/requirements-train.txt

# The analyzer package is needed by build_dataset.py at dataset-build time;
# sync.sh pushes it alongside this directory (see verda/sync.sh).
COPY . /workspace/training

ENV PYTHONUNBUFFERED=1 HF_HUB_ENABLE_HF_TRANSFER=0

CMD ["bash"]
