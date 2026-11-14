# syntax=docker/dockerfile:1.6
#
# afferent — MMPose fine-tuning image for RTMPose-m Halpe-26 (body + feet).
#
# Version set (mutually compatible, all prebuilt wheels, no source builds):
#   python 3.10 | torch 2.1.2 + torchvision 0.16.2 (cu121 or cpu)
#   mmcv 2.1.0 (prebuilt from download.openmmlab.com/mmcv/dist/<variant>/torch2.1.0)
#   mmengine 0.10.4 | mmdet 3.2.0 | mmpose 1.3.2 | numpy 1.26.4
# Constraints that drive this choice:
#   - mmpose 1.3.2 requirements/mminstall.txt: mmcv>=2.0.0,<3.0.0 ; mmdet>=3.0.0,<3.3.0
#   - mmdet 3.x asserts mmcv < 2.2.0          -> mmcv 2.1.0
#   - mmcv 2.1.0 wheels exist for torch2.1.0 x {cu121, cpu} x cp38-cp311
#
# Build (CPU, for local smoke tests / laptop without nvidia-container-toolkit):
#   docker build -t afferent-train:cpu --build-arg TORCH_VARIANT=cpu .
# Build (GPU, default; runs on any CUDA 12.x driver >= 525):
#   docker build -t afferent-train:cu121 .
# The image does NOT need a CUDA base image: torch cu121 wheels ship their own
# CUDA runtime/cuDNN as pip packages; only the host driver is required.

FROM python:3.10-slim-bookworm

ARG TORCH_VARIANT=cu121
ARG TORCH_VERSION=2.1.2
ARG TORCHVISION_VERSION=0.16.2
ARG MMCV_VERSION=2.1.0

# libgl1/libglib2.0-0: opencv-python. libgomp1: onnxruntime/torch OpenMP.
# build-essential: fallback if any small dep has no wheel. git: mim/model-index.
RUN apt-get update && apt-get install -y --no-install-recommends \
        libgl1 libglib2.0-0 libgomp1 build-essential git \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /workspace/training

COPY constraints.txt requirements-train.txt ./
ENV PIP_CONSTRAINT=/workspace/training/constraints.txt \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

# 1) torch first (picks CUDA or CPU wheels). The base image's pip 23.0 chokes
#    on PEP 625 metadata names served by download.pytorch.org -> upgrade first.
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install "pip==24.2" "setuptools==70.3.0" "wheel==0.44.0" \
    && pip install "torch==${TORCH_VERSION}" "torchvision==${TORCHVISION_VERSION}" \
        --index-url "https://download.pytorch.org/whl/${TORCH_VARIANT}" \
    && pip install numpy==1.26.4 openmim==0.3.9

# 2) mmcv from the OpenMMLab prebuilt index. Equivalent to `mim install
#    mmcv==2.1.0` but explicit, so the build fails loudly instead of silently
#    compiling mmcv from source (which takes ~30 min) if a wheel is missing.
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install "mmcv==${MMCV_VERSION}" --only-binary mmcv \
        -f "https://download.openmmlab.com/mmcv/dist/${TORCH_VARIANT}/torch2.1.0/index.html"

# 3) mmengine/mmdet + mmpose runtime deps, then mmpose without chumpy.
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install -r requirements-train.txt \
    && pip install --no-deps mmpose==1.3.2 \
    && pip install --no-deps rtmlib==0.0.16

# Fail the build early if the stack is inconsistent.
RUN python - <<'EOF'
import torch, mmcv, mmengine, mmdet, mmpose, numpy, cv2, onnxruntime
from mmcv.ops import nms  # compiled op -> proves the mmcv wheel matches torch
import mmpose.apis, rtmlib
import os.path as osp
cfg = osp.join(osp.dirname(mmpose.__file__), '.mim', 'configs', 'body_2d_keypoint',
               'rtmpose', 'body8', 'rtmpose-m_8xb512-700e_body8-halpe26-256x192.py')
assert osp.isfile(cfg), cfg
print('torch', torch.__version__, 'cuda', torch.version.cuda,
      '| mmcv', mmcv.__version__, '| mmengine', mmengine.__version__,
      '| mmdet', mmdet.__version__, '| mmpose', mmpose.__version__,
      '| numpy', numpy.__version__, '| cv2', cv2.__version__,
      '| ort', onnxruntime.__version__)
EOF

COPY . .

# Checkpoints / rtmlib ONNX downloads are cached under /cache (mount a volume).
ENV TORCH_HOME=/cache/torch \
    AFFERENT_DATA_ROOT=/workspace/training/data/

CMD ["bash"]
