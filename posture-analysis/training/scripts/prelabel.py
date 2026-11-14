#!/usr/bin/env python3
"""Pre-annotate extracted frames with the current runtime model.

Runs rtmlib BodyWithFeet (YOLOX + RTMPose Halpe-26, same as
posture-analysis/posture/afferent/pose.py) on every frame in frames.csv and writes a
COCO-keypoints JSON with 26 Halpe keypoints per person, ready to be corrected
in CVAT (or Label Studio). Humans then only *fix* points, which is ~5x faster
than clicking 26 points from scratch -- but beware of anchoring bias: the
correction pass must look at every foot point, not just glance.

Keypoint visibility written:
    v=2  score >= --kpt-thr          (confident)
    v=1  --low-thr <= score < thr    (kept, flagged as "occluded" so the
                                      annotator checks it)
    v=0  below --low-thr             (x=y=0, annotator adds it if visible)

Extra fields (ignored by CVAT, used by split.py): images[].session_id,
images[].person_ids, annotations[].score, annotations[].kpt_scores.

Usage:
    python scripts/prelabel.py --frames data/frames --out data/annotations/prelabel.json \
        --mode balanced --device cpu --cvat-label data/annotations/cvat_skeleton.json

CVAT import path (CVAT >= 2.3, skeleton support):
    1. Create a project; in "Raw" label editor paste the content of
       --cvat-label (a skeleton label 'person' with the 26 Halpe point names).
    2. Create a task in that project, upload the images from data/frames
       keeping the <session_id>/<file>.jpg structure (zip the frames dir), so
       file names match images[].file_name.
    3. Task -> Actions -> Upload annotations -> format "COCO Keypoints 1.0"
       -> select prelabel.json.
    4. Correct; then Export task dataset -> "COCO Keypoints 1.0" -> unzip the
       annotations/person_keypoints_default.json to data/annotations/corrected.json.
"""
from __future__ import annotations

import argparse
import csv
import json
import os
import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from halpe26 import KP_NAMES, N_KPTS, SKELETON_0, coco_category  # noqa: E402

# Rough T-pose template (0-100 canvas) for the CVAT skeleton editor.
_TEMPLATE_XY = {
    "nose": (50, 10), "left_eye": (53, 8), "right_eye": (47, 8),
    "left_ear": (56, 9), "right_ear": (44, 9), "head": (50, 3), "neck": (50, 17),
    "left_shoulder": (60, 20), "right_shoulder": (40, 20),
    "left_elbow": (68, 32), "right_elbow": (32, 32),
    "left_wrist": (74, 44), "right_wrist": (26, 44),
    "hip": (50, 48), "left_hip": (56, 50), "right_hip": (44, 50),
    "left_knee": (57, 68), "right_knee": (43, 68),
    "left_ankle": (58, 86), "right_ankle": (42, 86),
    "left_heel": (59, 90), "right_heel": (41, 90),
    "left_big_toe": (64, 94), "right_big_toe": (36, 94),
    "left_small_toe": (67, 92), "right_small_toe": (33, 92),
}


def cvat_skeleton_label() -> list[dict]:
    """CVAT 'Raw' label definition for a Halpe-26 skeleton.

    Node ids are 1-based in keypoint order, so CVAT's COCO-keypoints
    importer/exporter keeps the Halpe order. Best effort: verify once in the
    CVAT label constructor after pasting.
    """
    parts = []
    for a, b in SKELETON_0:
        (x1, y1), (x2, y2) = _TEMPLATE_XY[KP_NAMES[a]], _TEMPLATE_XY[KP_NAMES[b]]
        parts.append(
            f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="black" '
            f'data-type="edge" data-node-from="{a + 1}" stroke-width="0.5" '
            f'data-node-to="{b + 1}"></line>')
    for i, name in enumerate(KP_NAMES):
        x, y = _TEMPLATE_XY[name]
        parts.append(
            f'<circle r="0.75" cx="{x}" cy="{y}" stroke-width="0.1" '
            f'data-type="element node" data-element-id="{i + 1}" '
            f'data-node-id="{i + 1}" data-label-name="{name}"></circle>')
    return [{
        "name": "person",
        "type": "skeleton",
        "attributes": [],
        "sublabels": [{"name": n, "type": "points", "attributes": []}
                      for n in KP_NAMES],
        "svg": "".join(parts),
    }]


def detections_to_coco(kpts, scores, bboxes, image_id: int, ann_start: int,
                       kpt_thr: float, low_thr: float, min_kpts: int) -> list[dict]:
    """Convert rtmlib outputs for one image into COCO annotations."""
    anns = []
    for i in range(min(len(bboxes), len(kpts))):
        x1, y1, x2, y2 = (float(v) for v in bboxes[i][:4])
        flat, n_vis = [], 0
        for (x, y), s in zip(kpts[i], scores[i]):
            s = float(s)
            if s >= kpt_thr:
                v = 2
            elif s >= low_thr:
                v = 1
            else:
                v = 0
            if v:
                n_vis += 1
                flat += [round(float(x), 2), round(float(y), 2), v]
            else:
                flat += [0.0, 0.0, 0]
        if n_vis < min_kpts:
            continue
        w, h = max(0.0, x2 - x1), max(0.0, y2 - y1)
        anns.append({
            "id": ann_start + len(anns),
            "image_id": image_id,
            "category_id": 1,
            "bbox": [round(x1, 2), round(y1, 2), round(w, 2), round(h, 2)],
            "area": round(w * h, 2),
            "iscrowd": 0,
            "num_keypoints": n_vis,
            "keypoints": flat,
            "score": round(float(sum(scores[i]) / len(scores[i])), 4),
            "kpt_scores": [round(float(s), 4) for s in scores[i]],
        })
    return anns


def read_frames_csv(frames_dir: Path) -> list[dict]:
    p = frames_dir / "frames.csv"
    if not p.exists():
        raise FileNotFoundError(f"{p} not found -- run extract_frames.py first")
    with p.open(newline="") as f:
        return list(csv.DictReader(f))


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--frames", default="data/frames")
    ap.add_argument("--out", default="data/annotations/prelabel.json")
    ap.add_argument("--mode", default="balanced",
                    choices=["lightweight", "balanced", "performance"],
                    help="rtmlib BodyWithFeet mode (balanced = RTMPose-m, the "
                         "model being fine-tuned)")
    ap.add_argument("--pose-onnx", default=None,
                    help="override pose ONNX (e.g. a previous fine-tune) for "
                         "iterative pre-labelling")
    ap.add_argument("--device", default="cpu")
    ap.add_argument("--kpt-thr", type=float, default=0.5)
    ap.add_argument("--low-thr", type=float, default=0.2)
    ap.add_argument("--min-kpts", type=int, default=5,
                    help="drop detections with fewer kept keypoints")
    ap.add_argument("--limit", type=int, default=None)
    ap.add_argument("--cvat-label", default=None,
                    help="also write the CVAT raw skeleton label JSON here")
    args = ap.parse_args(argv)

    import cv2
    from rtmlib import BodyWithFeet

    frames_dir = Path(args.frames)
    rows = read_frames_csv(frames_dir)[: args.limit]
    kw = dict(mode=args.mode, backend="onnxruntime", device=args.device)
    if args.pose_onnx:
        kw.update(pose=args.pose_onnx, pose_input_size=(192, 256))
    model = BodyWithFeet(**kw)

    images, annotations = [], []
    try:
        from tqdm import tqdm
        it = tqdm(rows, desc="prelabel")
    except ImportError:
        it = rows
    for img_id, row in enumerate(it, start=1):
        img = cv2.imread(str(frames_dir / row["file_name"]))
        if img is None:
            print(f"[warn] unreadable {row['file_name']}", file=sys.stderr)
            continue
        h, w = img.shape[:2]
        images.append({
            "id": img_id, "file_name": row["file_name"], "width": w, "height": h,
            "session_id": row.get("session_id", ""),
            "person_ids": row.get("person_ids", ""),
        })
        bboxes = model.det_model(img)
        if bboxes is None or len(bboxes) == 0:
            continue
        kpts, scores = model.pose_model(img, bboxes=bboxes)
        annotations += detections_to_coco(kpts, scores, bboxes, img_id,
                                          len(annotations) + 1, args.kpt_thr,
                                          args.low_thr, args.min_kpts)

    coco = {
        "info": {"description": "afferent prelabels (rtmlib BodyWithFeet "
                                f"{args.mode}) -- to be human-corrected",
                 "date_created": date.today().isoformat(), "version": "0"},
        "licenses": [],
        "categories": [coco_category()],
        "images": images,
        "annotations": annotations,
    }
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(coco))
    print(f"{len(images)} images, {len(annotations)} persons, "
          f"{N_KPTS} kpts -> {out}")
    if args.cvat_label:
        Path(args.cvat_label).write_text(json.dumps(cvat_skeleton_label(), indent=2))
        print(f"CVAT skeleton label -> {args.cvat_label}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
