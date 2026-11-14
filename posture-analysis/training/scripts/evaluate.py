#!/usr/bin/env python3
"""Compare pose ONNX models on the held-out (person-disjoint) test split.

Inference goes through rtmlib.RTMPose -- the exact pre/post-processing the
runtime (posture-analysis/posture) uses -- with ground-truth boxes, so the comparison
isolates the pose model from the detector.

Metrics, per model:
  - PCK@thr (default 0.05) normalised by GT torso length (mid-shoulder to
    mid-hip, fallback neck-hip), overall / COCO-17 body / 6 feet points /
    per keypoint
  - NME: mean torso-normalised error
  - OKS AP (GT boxes -> one prediction per instance; equals COCO AP without
    false positives) with the Halpe-26 sigmas
  - optional breakdown by situation (walk, sit_to_stand...) via frames.csv

Keypoint error is necessary but not sufficient: the phase-4 pass criterion
is on final variables (walking speed, cadence, sit-to-stand time...). See
scripts/eval_variables.py.

Usage:
    python scripts/evaluate.py --ann data/annotations/test.json --img-root data/frames \
        --model baseline=balanced \
        --model ft=work_dirs/export/rtmpose-m_halpe26_ft.onnx \
        --out work_dirs/eval/test_report.json
  `balanced` / `lightweight` / `performance` = rtmlib's stock BodyWithFeet
  Halpe-26 pose model for that mode (downloaded/cached by rtmlib).
"""
from __future__ import annotations

import argparse
import csv
import json
import os
import sys
from collections import defaultdict
from pathlib import Path

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from halpe26 import KP_NAMES, N_KPTS, RTM_INPUT_WH, oks, oks_ap, pck  # noqa: E402

STOCK = {
    "lightweight": ("https://download.openmmlab.com/mmpose/v1/projects/rtmposev1/onnx_sdk/"
                    "rtmpose-s_simcc-body7_pt-body7-halpe26_700e-256x192-7f134165_20230605.zip",
                    (192, 256)),
    "balanced": ("https://download.openmmlab.com/mmpose/v1/projects/rtmposev1/onnx_sdk/"
                 "rtmpose-m_simcc-body7_pt-body7-halpe26_700e-256x192-4d3e73dd_20230605.zip",
                 (192, 256)),
    "performance": ("https://download.openmmlab.com/mmpose/v1/projects/rtmposev1/onnx_sdk/"
                    "rtmpose-x_simcc-body7_pt-body7-halpe26_700e-384x288-7fb6e239_20230606.zip",
                    (288, 384)),
}


def load_gt(coco: dict):
    """-> list of (image, [ann...]) with only annotations having keypoints."""
    by_img = defaultdict(list)
    for a in coco["annotations"]:
        if a.get("iscrowd", 0) or "keypoints" not in a:
            continue
        k = np.asarray(a["keypoints"], float).reshape(-1, 3)
        if k.shape[0] != N_KPTS or (k[:, 2] > 0).sum() == 0:
            continue
        by_img[a["image_id"]].append(a)
    return [(im, by_img[im["id"]]) for im in coco["images"] if by_img[im["id"]]]


def summarise(pred, gt, vis, areas, thr):
    r = pck(pred, gt, vis, thr)
    o = np.array([oks(pred[i], gt[i], vis[i], areas[i]) for i in range(len(gt))])
    return {
        "n_instances": int(len(gt)),
        "pck": r["overall"], "pck_body17": r["body17"], "pck_feet": r["feet"],
        "nme": r["nme"], "oks_ap": oks_ap(o), "skipped_no_torso": r["skipped"],
        "pck_per_kpt": {n: (None if np.isnan(v) else float(v))
                        for n, v in zip(KP_NAMES, r["per_kpt"])},
    }


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--ann", required=True)
    ap.add_argument("--img-root", default="data/frames")
    ap.add_argument("--model", action="append", required=True,
                    help="name=path.onnx | name=balanced|lightweight|performance")
    ap.add_argument("--input-size", default="192x256", help="WxH for custom ONNX")
    ap.add_argument("--thr", type=float, default=0.05)
    ap.add_argument("--device", default="cpu")
    ap.add_argument("--frames-csv", default=None,
                    help="adds a per-situation breakdown")
    ap.add_argument("--out", default=None)
    args = ap.parse_args(argv)

    import cv2
    from rtmlib import RTMPose

    custom_wh = tuple(int(v) for v in args.input_size.lower().split("x"))
    models = {}
    for spec in args.model:
        name, _, path = spec.partition("=")
        url, wh = STOCK.get(path, (path, custom_wh))
        models[name] = RTMPose(url, model_input_size=wh, backend="onnxruntime",
                               device=args.device)
    if custom_wh != RTM_INPUT_WH:
        print(f"[warn] custom input size {custom_wh} != runtime {RTM_INPUT_WH}")

    situation = {}
    if args.frames_csv and Path(args.frames_csv).exists():
        with open(args.frames_csv, newline="") as f:
            for r in csv.DictReader(f):
                situation[r["file_name"]] = r.get("situation") or "unknown"
                situation[os.path.basename(r["file_name"])] = situation[r["file_name"]]

    items = load_gt(json.loads(Path(args.ann).read_text()))
    gts, viss, areas, sits = [], [], [], []
    preds = {n: [] for n in models}
    for im, anns in items:
        img = cv2.imread(str(Path(args.img_root) / im["file_name"]))
        if img is None:
            print(f"[warn] missing image {im['file_name']}", file=sys.stderr)
            continue
        boxes = []
        for a in anns:
            x, y, w, h = a["bbox"]
            boxes.append([x, y, x + w, y + h])
            k = np.asarray(a["keypoints"], float).reshape(-1, 3)
            gts.append(k[:, :2])
            viss.append(k[:, 2] > 0)
            areas.append(float(a.get("area") or w * h))
            sits.append(situation.get(im["file_name"],
                                      situation.get(os.path.basename(im["file_name"]),
                                                    "all")))
        for n, m in models.items():
            kp, _ = m(img, bboxes=boxes)
            preds[n].extend(kp[:, :, :2])
    if not gts:
        raise SystemExit("no evaluable instance")
    gt, vis, areas, sits = np.stack(gts), np.stack(viss), np.array(areas), np.array(sits)

    report = {"ann": args.ann, "thr": args.thr, "models": {}}
    for n in models:
        p = np.stack(preds[n])
        rep = summarise(p, gt, vis, areas, args.thr)
        if len(set(sits)) > 1:
            rep["by_situation"] = {
                s: {k: v for k, v in summarise(p[sits == s], gt[sits == s],
                                              vis[sits == s], areas[sits == s],
                                              args.thr).items()
                    if k != "pck_per_kpt"}
                for s in sorted(set(sits))}
        report["models"][n] = rep

    names = list(models)
    cw = max(10, *(len(n) for n in names)) + 2
    print(f"\n{len(gt)} instances | PCK@{args.thr} (torso-normalised)")
    print(f"{'metric':18s}" + "".join(f"{n:>{cw}s}" for n in names))
    for key in ("pck", "pck_body17", "pck_feet", "nme", "oks_ap"):
        print(f"{key:18s}" + "".join(f"{report['models'][n][key]:{cw}.4f}" for n in names))
    print("-- per keypoint PCK --")
    for kn in KP_NAMES:
        vals = [report["models"][n]["pck_per_kpt"][kn] for n in names]
        print(f"{kn:18s}" + "".join(f"{'n/a':>{cw}s}" if v is None else f"{v:{cw}.4f}"
                                    for v in vals))
    if args.out:
        Path(args.out).parent.mkdir(parents=True, exist_ok=True)
        Path(args.out).write_text(json.dumps(report, indent=2))
        print(f"report -> {args.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
