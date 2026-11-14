#!/usr/bin/env python3
"""Minimal MMPose training entry point (the pip wheel does not ship tools/).

Equivalent to `python mmpose/tools/train.py`, single process. Multi-GPU:
`torchrun --nproc_per_node=N scripts/train.py CFG --launcher pytorch`.

Usage (inside the training image):
    python scripts/train.py configs/rtmpose-m_halpe26_finetune.py \
        --work-dir work_dirs/rtmpose-m_halpe26_ft [--amp] [--resume] \
        [--cfg-options train_cfg.max_epochs=30 optim_wrapper.optimizer.lr=2e-4]
    # test only (writes metrics for the best checkpoint):
    python scripts/train.py CFG --test-only --checkpoint work_dirs/.../best_coco_AP_epoch_X.pth
"""
from __future__ import annotations

import argparse
import os
import os.path as osp


def main() -> None:
    from mmengine.config import Config, DictAction
    from mmengine.runner import Runner

    ap = argparse.ArgumentParser()
    ap.add_argument("config")
    ap.add_argument("--work-dir")
    ap.add_argument("--amp", action="store_true", help="fp16 mixed precision (GPU)")
    ap.add_argument("--resume", action="store_true", help="resume from latest ckpt in work-dir")
    ap.add_argument("--test-only", action="store_true")
    ap.add_argument("--checkpoint", help="weights for --test-only")
    ap.add_argument("--launcher", default="none", choices=["none", "pytorch", "slurm", "mpi"])
    ap.add_argument("--local_rank", "--local-rank", type=int, default=0)
    ap.add_argument("--cfg-options", nargs="+", action=DictAction,
                    help="key=value overrides, mmengine syntax")
    args = ap.parse_args()
    os.environ.setdefault("LOCAL_RANK", str(args.local_rank))

    cfg = Config.fromfile(args.config)
    if args.cfg_options:
        cfg.merge_from_dict(args.cfg_options)
    cfg.launcher = args.launcher
    cfg.work_dir = args.work_dir or osp.join(
        "work_dirs", osp.splitext(osp.basename(args.config))[0])
    if args.amp:
        cfg.optim_wrapper.type = "AmpOptimWrapper"
        cfg.optim_wrapper.loss_scale = "dynamic"
    if args.resume:
        cfg.resume = True
        cfg.load_from = None
    if args.test_only:
        if not args.checkpoint:
            raise SystemExit("--test-only needs --checkpoint")
        cfg.load_from = args.checkpoint
        Runner.from_cfg(cfg).test()
        return
    Runner.from_cfg(cfg).train()


if __name__ == "__main__":
    main()
