#!/usr/bin/env python3
"""Write a tiny fake dataset (noise images + random skeletons) to smoke-test
the train / test / export / evaluate plumbing without any personal data.

    python scripts/make_synthetic_dataset.py --out /tmp/synth --n 24
    AFFERENT_DATA_ROOT=/tmp/synth/ python scripts/train.py configs/rtmpose-m_halpe26_finetune.py \
        --work-dir /tmp/synth_work --cfg-options train_cfg.max_epochs=1 train_cfg.val_interval=1 \
        train_dataloader.batch_size=4 train_dataloader.num_workers=0 \
        train_dataloader.persistent_workers=False val_dataloader.num_workers=0 \
        val_dataloader.persistent_workers=False

Numbers produced on it are meaningless; only "does it run" matters.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from halpe26 import N_KPTS, coco_category  # noqa: E402


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    ap.add_argument("--n", type=int, default=24, help="images per split")
    ap.add_argument("--seed", type=int, default=0)
    args = ap.parse_args()
    import cv2

    rng = np.random.default_rng(args.seed)
    root = Path(args.out)
    for split_i, split in enumerate(("train", "val", "test")):
        images, anns = [], []
        sess = f"SYN{split_i}"
        (root / "frames" / sess).mkdir(parents=True, exist_ok=True)
        for i in range(args.n):
            h, w = 480, 640
            img = rng.integers(0, 255, (h, w, 3), dtype=np.uint8)
            x0, y0 = rng.uniform(50, 300), rng.uniform(20, 100)
            bw, bh = rng.uniform(120, 250), rng.uniform(250, 360)
            k = np.zeros((N_KPTS, 3))
            k[:, 0] = x0 + rng.uniform(0, bw, N_KPTS)
            k[:, 1] = y0 + rng.uniform(0, bh, N_KPTS)
            k[:, 2] = 2
            for (x, y, _) in k:
                cv2.circle(img, (int(x), int(y)), 4, (255, 255, 255), -1)
            name = f"{sess}/{sess}_f{i:06d}.jpg"
            cv2.imwrite(str(root / "frames" / name), img)
            iid = i + 1
            images.append({"id": iid, "file_name": name, "width": w, "height": h,
                           "session_id": sess, "person_ids": f"SYNP{split_i}"})
            anns.append({"id": iid, "image_id": iid, "category_id": 1,
                         "bbox": [x0, y0, bw, bh], "area": bw * bh, "iscrowd": 0,
                         "num_keypoints": N_KPTS,
                         "keypoints": [round(float(v), 2) for v in k.ravel()]})
        (root / "annotations").mkdir(parents=True, exist_ok=True)
        (root / "annotations" / f"{split}.json").write_text(json.dumps(
            {"images": images, "annotations": anns,
             "categories": [coco_category()]}))
    print(f"synthetic dataset -> {root}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
