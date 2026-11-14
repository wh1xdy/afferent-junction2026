#!/usr/bin/env python3
"""Export a fine-tuned RTMPose checkpoint to an rtmlib-compatible ONNX.

No mmdeploy: plain torch.onnx.export of backbone + RTMCCHead.forward, i.e.
the same graph mmdeploy produces for rtmlib's onnx_sdk zips:

    input    float32 [batch, 3, 256, 192]   (N, C, H, W); W,H = 192,256
    simcc_x  float32 [batch, 26, 384]       (= 192 * simcc_split_ratio 2.0)
    simcc_y  float32 [batch, 26, 512]       (= 256 * 2.0)
    opset 11, dynamic batch axis

rtmlib.RTMPose does the rest on the host: bbox -> center/scale with padding
1.25, affine warp to 192x256, (img - mean) / std with mean=(123.675, 116.28,
103.53) std=(58.395, 57.12, 57.375), argmax of simcc_x/simcc_y, / 2.0.

BGR caveat: rtmlib feeds the cv2 *BGR* frame normalised with the *RGB*
mean/std (it ignores `to_rgb` from the mmdeploy pipeline.json), while MMPose
trains with bgr_to_rgb=True. By default this script bakes a tiny exact fix
into the graph (de-normalise with the BGR-order stats, swap channels,
re-normalise with RGB stats) so the fine-tuned model sees at runtime exactly
what it saw in training. --no-bgr-fix exports the vanilla graph (identical
semantics to the official ONNX, i.e. same quirk as the baseline).

Usage (inside the training image):
    python scripts/export_onnx.py configs/rtmpose-m_halpe26_finetune.py \
        work_dirs/rtmpose-m_halpe26_ft/best_coco_AP_epoch_40.pth \
        --out work_dirs/export/rtmpose-m_halpe26_ft.onnx
"""
from __future__ import annotations

import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from halpe26 import N_KPTS, RTM_INPUT_WH, RTM_MEAN, RTM_STD  # noqa: E402


def bgr_fix_coeffs(mean=RTM_MEAN, std=RTM_STD):
    """y[c] = x[2-c] * a[c] + b[c] maps rtmlib's input to the training input.

    rtmlib:   x[c] = (BGR[c] - mean[c]) / std[c]          (BGR[0] = blue)
    training: y[c] = (RGB[c] - mean[c]) / std[c],   RGB[c] = BGR[2-c]
              y[c] = (x[2-c]*std[2-c] + mean[2-c] - mean[c]) / std[c]
    """
    a = [std[2 - c] / std[c] for c in range(3)]
    b = [(mean[2 - c] - mean[c]) / std[c] for c in range(3)]
    return a, b


def build_wrapper(model, bgr_fix: bool):
    import torch

    class RTMPoseONNX(torch.nn.Module):
        def __init__(self, m):
            super().__init__()
            self.m = m
            a, b = bgr_fix_coeffs()
            self.bgr_fix = bgr_fix
            self.register_buffer("a", torch.tensor(a).view(1, 3, 1, 1))
            self.register_buffer("b", torch.tensor(b).view(1, 3, 1, 1))

        def forward(self, x):
            if self.bgr_fix:
                x = torch.flip(x, dims=[1]) * self.a + self.b
            feats = self.m.extract_feat(x)
            simcc_x, simcc_y = self.m.head.forward(feats)
            return simcc_x, simcc_y

    return RTMPoseONNX(model).eval()


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("config")
    ap.add_argument("checkpoint")
    ap.add_argument("--out", required=True)
    ap.add_argument("--opset", type=int, default=11)
    ap.add_argument("--no-bgr-fix", action="store_true")
    ap.add_argument("--device", default="cpu")
    args = ap.parse_args(argv)

    import numpy as np
    import torch
    from mmpose.apis import init_model

    model = init_model(args.config, args.checkpoint, device=args.device)
    wrapper = build_wrapper(model, bgr_fix=not args.no_bgr_fix).to(args.device)
    w, h = RTM_INPUT_WH
    dummy = torch.randn(1, 3, h, w, device=args.device)
    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    with torch.no_grad():
        ref_x, ref_y = wrapper(dummy)
        torch.onnx.export(
            wrapper, dummy, args.out, opset_version=args.opset,
            input_names=["input"], output_names=["simcc_x", "simcc_y"],
            dynamic_axes={"input": {0: "batch"}, "simcc_x": {0: "batch"},
                          "simcc_y": {0: "batch"}},
            do_constant_folding=True)

    # Verify: shapes rtmlib expects + numerical parity with torch.
    import onnx
    import onnxruntime as ort
    onnx.checker.check_model(onnx.load(args.out))
    sess = ort.InferenceSession(args.out, providers=["CPUExecutionProvider"])
    ox, oy = sess.run(None, {"input": dummy.cpu().numpy()})
    exp_x, exp_y = (1, N_KPTS, int(w * 2)), (1, N_KPTS, int(h * 2))
    assert ox.shape == exp_x and oy.shape == exp_y, (ox.shape, oy.shape)
    err = max(float(np.abs(ox - ref_x.cpu().numpy()).max()),
              float(np.abs(oy - ref_y.cpu().numpy()).max()))
    meta = {"onnx": args.out, "checkpoint": args.checkpoint,
            "config": args.config, "bgr_fix": not args.no_bgr_fix,
            "input": [1, 3, h, w], "simcc_x": list(ox.shape),
            "simcc_y": list(oy.shape), "max_abs_diff_torch_vs_ort": err,
            "rtmlib": {"pose_input_size": [w, h], "simcc_split_ratio": 2.0}}
    with open(os.path.splitext(args.out)[0] + ".json", "w") as f:
        json.dump(meta, f, indent=2)
    print(json.dumps(meta, indent=2))
    if err > 1e-3:
        print(f"[warn] torch/onnxruntime mismatch {err:.2e}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
