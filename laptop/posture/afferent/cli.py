"""Offline video processing CLI.

  python -m afferent.cli process-video <file> [--db PATH]
      [--target-enroll-seconds N] [--pose-mode MODE]

Runs the same FrameProcessor chain on a video file (no camera), auto-
enrolling the target from the first N seconds when the gallery is empty,
then prints a JSON summary (episodes, gait variables, fps).
"""
from __future__ import annotations

import argparse
import json
import sys
import time

import cv2

from .config import Config
from .pipeline import FrameProcessor, GuidedSession
from .storage import Storage


def process_video(path: str, db_path: str, enroll_seconds: float = 20.0,
                  pose_mode: str | None = None) -> dict:
    cfg = Config.from_env()
    cfg.db_path = db_path
    if pose_mode:
        cfg.pose_mode = pose_mode
    storage = Storage(db_path, site=cfg.site)
    cfg.site = storage.site

    proc = FrameProcessor(cfg, storage)
    proc.session = GuidedSession(proc)

    # models must already be downloaded (python -m afferent.download_models)
    proc.attach_models()

    cap = cv2.VideoCapture(path)
    if not cap.isOpened():
        raise RuntimeError(f"cannot open video {path}")
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0

    # auto-enroll target from the first seconds if the gallery is empty
    auto_enroll = storage.gallery_count() == 0 and enroll_seconds > 0
    if auto_enroll:
        proc.identity.start_enrollment()
        print(f"[cli] gallery empty -> enrolling target for "
              f"{enroll_seconds:.0f}s", file=sys.stderr)

    t_wall0 = time.monotonic()
    t_epoch0 = time.time()
    idx = 0
    enroll_until = enroll_seconds
    # process every frame (offline: no rate limit needed, but keep timing
    # consistent with video timestamps on the epoch clock)
    while True:
        ok, img = cap.read()
        if not ok:
            break
        idx += 1
        t = t_epoch0 + idx / fps
        if auto_enroll and t > enroll_until:
            proc.identity.stop_enrollment()
            auto_enroll = False
            print(f"[cli] enrollment done, gallery={storage.gallery_count()}",
                  file=sys.stderr)
        try:
            proc.process(img, t)
        except Exception as e:
            print(f"[cli] frame {idx} failed: {e}", file=sys.stderr)
    cap.release()
    proc.flush(t)
    wall = time.monotonic() - t_wall0

    # gather summary
    episodes = storage.episodes(since=0.0, limit=1000)
    sessions = storage.sessions()
    gait_vars = []
    for ep in episodes:
        if ep["type"] == "walk" and ep.get("valid"):
            try:
                variables = json.loads(ep["variables"] or "{}")
            except json.JSONDecodeError:
                variables = {}
            if variables:
                gait_vars.append({"episode_start": ep["start"],
                                  **variables})
    summary = {
        "video": path,
        "frames": idx,
        "video_fps": fps,
        "wall_s": round(wall, 2),
        "effective_fps": round(idx / wall, 2) if wall > 0 else None,
        "gallery_size": storage.gallery_count(),
        "episodes": [
            {"type": e["type"], "start": round(e["start"], 2),
             "duration_s": round(e["duration_s"] or 0, 2),
             "orientation": e["orientation"], "valid": bool(e["valid"]),
             "distance_m": e["distance_m"], "n_steps": e["n_steps"]}
            for e in episodes],
        "walk_variables": gait_vars,
        "sessions": sessions,
        "stats": proc.stats(),
        "db": db_path,
    }
    storage.close()
    return summary


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="afferent.cli")
    sub = ap.add_subparsers(dest="cmd", required=True)
    pv = sub.add_parser("process-video", help="run pipeline on a video file")
    pv.add_argument("file")
    pv.add_argument("--db", default="/tmp/afferent_cli.db")
    pv.add_argument("--target-enroll-seconds", type=float, default=20.0)
    pv.add_argument("--pose-mode", default=None,
                    choices=["lightweight", "balanced", "performance"])
    args = ap.parse_args(argv)

    if args.cmd == "process-video":
        summary = process_video(args.file, args.db,
                                args.target_enroll_seconds, args.pose_mode)
        print(json.dumps(summary, indent=2, default=str))
        return 0
    return 1


if __name__ == "__main__":
    sys.exit(main())
