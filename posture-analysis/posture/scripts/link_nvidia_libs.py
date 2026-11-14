"""Link every nvidia-*-cu* wheel .so into /usr/local/lib/nvidia and ldconfig.

Used only by the GPU image variant (ORT=gpu) so onnxruntime-gpu finds the
CUDA/cuDNN runtime libs shipped as pip wheels, without a CUDA toolkit in
the image. Best-effort: the GPU path is untested in the dev environment.
"""
import glob
import os
import site
import subprocess

DEST = "/usr/local/lib/nvidia"
os.makedirs(DEST, exist_ok=True)
count = 0
for sp in site.getsitepackages():
    for pattern in ("nvidia/*/lib/*.so*", "nvidia/*/lib64/*.so*"):
        for lib in glob.glob(os.path.join(sp, pattern)):
            dst = os.path.join(DEST, os.path.basename(lib))
            if not os.path.exists(dst):
                os.symlink(lib, dst)
                count += 1
print(f"linked {count} nvidia libraries into {DEST}")
subprocess.run(["ldconfig"], check=True)
