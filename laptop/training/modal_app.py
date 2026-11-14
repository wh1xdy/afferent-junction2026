# modal_app.py — run the afferent fine-tuning loop on a Modal GPU.
#
# Serverless counterpart of the verda/ scripts: no VM lifecycle, no ssh,
# billing only while a function runs. The pip stack mirrors Dockerfile
# exactly (torch 2.1.2 cu121, mmcv 2.1.0, mmpose 1.3.2, numpy 1.26.4).
#
# Remote layout (single Modal volume, mounted at /vol, symlinked so the
# Makefile runs UNCHANGED):
#   /vol/data          -> /workspace/training/data          (dataset in)
#   /vol/work          -> /workspace/training/work_dirs     (checkpoints out)
#   /vol/models/torch  -> /cache/torch   (TORCH_HOME, rtmlib ONNX cache)
#
# Usage (from laptop/training/, after `modal token new` once):
#   modal run modal_app.py::push            # upload data/ + rtmlib cache
#   modal run modal_app.py::main            # image build + `make train test`
#   modal run modal_app.py::main --targets "train" --no-amp
#   modal run modal_app.py::pull            # download work_dirs/ back
#   modal run modal_app.py::ls              # show volume contents
# or via the modal/*.sh wrappers / `make modal-push modal-train modal-pull`.
#
# Env knobs (or modal/config.env via the wrappers):
#   MODAL_GPU       GPU type [A10]            (T4 cheaper, L40S faster)
#   MODAL_VOLUME    volume name [afferent-train]
#   MODAL_TIMEOUT   remote fn timeout s [86400]

import os
import shlex
from pathlib import Path, PurePosixPath

import modal

TRAIN_DIR = Path(__file__).resolve().parent        # laptop/training
LAPTOP_DIR = TRAIN_DIR.parent                       # laptop
RTMLIB_DIR = LAPTOP_DIR / "posture" / "models" / "rtmlib"

GPU = os.environ.get("MODAL_GPU", "A10")
VOLUME_NAME = os.environ.get("MODAL_VOLUME", "afferent-train")
TIMEOUT_S = int(os.environ.get("MODAL_TIMEOUT", str(24 * 3600)))

app = modal.App("afferent-train")
vol = modal.Volume.from_name(VOLUME_NAME, create_if_missing=True, version=2)

# --------------------------------------------------------------------------
# Image — native Modal chain mirroring Dockerfile layer for layer.
# (from_dockerfile exists but the Dockerfile's `RUN --mount=type=cache` and
# ARG passthrough are not guaranteed compatible; this is the documented path.)
# --------------------------------------------------------------------------
VERIFY = (
    "import torch,mmcv,mmengine,mmdet,mmpose,numpy,cv2,onnxruntime;"
    "from mmcv.ops import nms;"
    "import mmpose.apis,rtmlib,os.path as osp;"
    "cfg=osp.join(osp.dirname(mmpose.__file__),'.mim','configs','body_2d_keypoint',"
    "'rtmpose','body8','rtmpose-m_8xb512-700e_body8-halpe26-256x192.py');"
    "assert osp.isfile(cfg),cfg;"
    "print('torch',torch.__version__,'cuda',torch.version.cuda,'| mmcv',mmcv.__version__,"
    "'| mmengine',mmengine.__version__,'| mmdet',mmdet.__version__,'| mmpose',"
    "mmpose.__version__,'| numpy',numpy.__version__,'| cv2',cv2.__version__,"
    "'| ort',onnxruntime.__version__)"
)

train_image = (
    modal.Image.debian_slim(python_version="3.10")
    .apt_install("libgl1", "libglib2.0-0", "libgomp1", "build-essential", "git")
    # constraints.txt must exist as a build layer before the pip steps below;
    # it caps numpy<2 / opencv for the mmcv/mmpose wheels (see constraints.txt).
    .add_local_file(
        TRAIN_DIR / "constraints.txt",
        "/workspace/training/constraints.txt",
        copy=True,
    )
    .env(
        {
            "PIP_CONSTRAINT": "/workspace/training/constraints.txt",
            "PIP_DISABLE_PIP_VERSION_CHECK": "1",
            "PYTHONUNBUFFERED": "1",
            "PYTHONDONTWRITEBYTECODE": "1",
        }
    )
    # pip==24.2 upgrade from the Dockerfile is skipped: Modal's build pip is
    # modern and handles the PEP 625 metadata on download.pytorch.org fine.
    .pip_install(
        "torch==2.1.2",
        "torchvision==0.16.2",
        index_url="https://download.pytorch.org/whl/cu121",
    )
    .pip_install("numpy==1.26.4", "openmim==0.3.9")
    .pip_install(
        "mmcv==2.1.0",
        find_links="https://download.openmmlab.com/mmcv/dist/cu121/torch2.1.0/index.html",
        extra_options="--only-binary mmcv",
    )
    .pip_install_from_requirements(
        str(TRAIN_DIR / "requirements-train.txt"),
        extra_options="-c /workspace/training/constraints.txt",
    )
    # mmpose/rtmlib without deps: chumpy's setup.py is broken on modern pip and
    # only needed for SMPL tooling; runtime deps are in requirements-train.txt.
    .pip_install("mmpose==1.3.2", "rtmlib==0.0.16", extra_options="--no-deps")
    .run_commands(f"python -c {shlex.quote(VERIFY)}")
    .env({"TORCH_HOME": "/cache/torch", "AFFERENT_DATA_ROOT": "/vol/data/"})
    # Code layer: added at container start (not baked), so edits to scripts/
    # or configs/ redeploy in seconds without rebuilding the pip layers.
    .add_local_dir(TRAIN_DIR / "scripts", remote_path="/workspace/training/scripts")
    .add_local_dir(TRAIN_DIR / "configs", remote_path="/workspace/training/configs")
    .add_local_dir(TRAIN_DIR / "manifests", remote_path="/workspace/training/manifests")
    .add_local_dir(TRAIN_DIR / "tests", remote_path="/workspace/training/tests")
    .add_local_file(TRAIN_DIR / "Makefile", remote_path="/workspace/training/Makefile")
)

# Symlink map: volume subdir -> the path the Makefile expects locally.
VOL_LINKS = {
    "/vol/data": "/workspace/training/data",
    "/vol/work": "/workspace/training/work_dirs",
    "/vol/models/torch": "/cache/torch",
}


@app.function(
    image=train_image,
    gpu=GPU,
    volumes={"/vol": vol},
    timeout=TIMEOUT_S,
)
def run_make(targets: str, amp: bool, device: str, extra: str) -> None:
    """Run `make <targets>` inside the training image on the Modal GPU."""
    import os
    import subprocess
    import threading
    import time

    for src, dst in VOL_LINKS.items():
        os.makedirs(src, exist_ok=True)
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        if not os.path.lexists(dst):
            os.symlink(src, dst)

    # Commit volume writes periodically: if the run is killed at the timeout
    # (or preempted), checkpoints written so far survive.
    def _commit_loop() -> None:
        while True:
            time.sleep(300)
            try:
                vol.commit()
            except Exception:
                pass

    threading.Thread(target=_commit_loop, daemon=True).start()

    for t in targets.replace(",", " ").split():
        cmd = ["make", t, f"AMP={'1' if amp else ''}", f"DEVICE={device}"]
        if extra:
            cmd.append(f"EXTRA={extra}")
        print(f"== remote: {' '.join(cmd)} ==", flush=True)
        subprocess.run(cmd, cwd="/workspace/training", check=True)
        vol.commit()

    vol.commit()
    print("== remote run done; fetch artifacts with modal/pull.sh ==")


# --------------------------------------------------------------------------
# Local entrypoints — `modal run modal_app.py[::name]`.
# --------------------------------------------------------------------------
@app.local_entrypoint()
def main(
    targets: str = "train test",
    amp: bool = True,
    device: str = "cpu",
    extra: str = "",
) -> None:
    """Build the image and run `make <targets>` on a Modal GPU.

    `device` only affects make targets that take it (e.g. evaluate stays cpu:
    the image ships onnxruntime CPU). Output lands in the volume under /work.
    """
    print(f"gpu={GPU} volume={VOLUME_NAME} targets={targets!r} amp={amp}")
    run_make.remote(targets, amp, device, extra)


@app.local_entrypoint()
def push() -> None:
    """Upload data/ (frames + annotations) and the rtmlib ONNX cache to /vol."""
    data = TRAIN_DIR / "data"
    if not data.is_dir():
        raise SystemExit(
            f"no dataset at {data} -- run 'make extract split' first "
            "(only consenting recordings reach this point)."
        )

    with vol.batch_upload() as batch:
        batch.put_directory(data, "/data")
        # rtmlib ONNX cache -> TORCH_HOME layout (/vol/models/torch/hub/checkpoints)
        ckpts = RTMLIB_DIR / "hub" / "checkpoints"
        n_models = 0
        if ckpts.is_dir():
            for p in sorted(ckpts.glob("*.onnx")):
                batch.put_file(p, f"/models/torch/hub/checkpoints/{p.name}")
                n_models += 1

    print(f"pushed {data} -> {VOLUME_NAME}:/data")
    print(f"pushed {n_models} rtmlib ONNX -> {VOLUME_NAME}:/models/torch/hub/checkpoints")
    top = [e.path for e in vol.listdir("/data")]
    print("volume /data now contains:", ", ".join(top[:10]))


@app.local_entrypoint()
def pull(remote_dir: str = "/work", local_dir: str = "work_dirs") -> None:
    """Download remote_dir from the volume into local_dir (default work_dirs/)."""
    local_root = Path(local_dir)
    local_root.mkdir(parents=True, exist_ok=True)

    entries = vol.listdir(remote_dir, recursive=True)
    files = [e for e in entries if e.type != modal.volume.FileEntryType.DIRECTORY]
    if not files:
        print(f"nothing under {VOLUME_NAME}:{remote_dir} yet.")
        return

    for e in files:
        rel = PurePosixPath(e.path).relative_to(remote_dir)
        dest = local_root / rel
        dest.parent.mkdir(parents=True, exist_ok=True)
        with open(dest, "wb") as f:
            for chunk in vol.read_file(e.path):
                f.write(chunk)
    print(f"pulled {len(files)} files: {VOLUME_NAME}:{remote_dir} -> {local_root}/")


@app.local_entrypoint()
def ls(path: str = "/") -> None:
    """List the volume contents (recursive)."""
    for e in vol.listdir(path, recursive=True):
        print(e.path)
