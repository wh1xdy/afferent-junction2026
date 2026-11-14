#!/usr/bin/env python3
"""Sample frames from dev recordings for annotation.

Reads a manifest (YAML or CSV) describing each recording, samples frames at a
fixed rate, optionally drops near-duplicate frames (static scenes), and writes

    <out>/<session_id>/<session_id>_f<frame:06d>.jpg
    <out>/frames.csv        one row per written frame (metadata for split.py)

Manifest fields (one entry per video):
    video       path to the .mp4, relative to --videos-dir (or absolute)
    session_id  unique id of the recording session
    person_ids  person id(s) visible in the session; ';'-separated in CSV,
                list in YAML. Pseudonymous ids only (e.g. P01), never names.
    consent     must be true -- recordings of consenting people only
    situation   optional: walk | sit_to_stand | turn | seated | posture | ...
    date        optional ISO date
    camera      optional camera id / placement

Example (YAML): see manifests/sessions.example.yaml.

Usage:
    python scripts/extract_frames.py --manifest manifests/sessions.yaml \
        --videos-dir ../posture/recordings --out data/frames --fps 2
"""
from __future__ import annotations

import argparse
import csv
import os
import sys
from pathlib import Path

FRAME_FIELDS = ["file_name", "session_id", "person_ids", "video", "frame_idx",
                "t_sec", "situation", "date", "camera", "width", "height"]


def _as_list(v) -> list[str]:
    if v is None:
        return []
    if isinstance(v, (list, tuple)):
        return [str(x).strip() for x in v if str(x).strip()]
    return [p.strip() for p in str(v).replace(",", ";").split(";") if p.strip()]


def _truthy(v) -> bool:
    return str(v).strip().lower() in {"1", "true", "yes", "y", "oui"}


def load_manifest(path: str | os.PathLike) -> list[dict]:
    """Load a YAML (list or {sessions: [...]}) or CSV manifest, normalised."""
    path = Path(path)
    if path.suffix.lower() in {".yaml", ".yml"}:
        import yaml
        data = yaml.safe_load(path.read_text()) or []
        if isinstance(data, dict):
            data = data.get("sessions", [])
    else:
        with path.open(newline="") as f:
            data = list(csv.DictReader(f))
    out = []
    for i, row in enumerate(data):
        if "video" not in row or "session_id" not in row:
            raise ValueError(f"manifest entry {i}: 'video' and 'session_id' required")
        persons = _as_list(row.get("person_ids", row.get("person_id")))
        if not persons:
            raise ValueError(f"manifest entry {i}: person_ids required")
        out.append({
            "video": str(row["video"]),
            "session_id": str(row["session_id"]),
            "person_ids": persons,
            "consent": _truthy(row.get("consent", False)),
            "situation": str(row.get("situation", "") or ""),
            "date": str(row.get("date", "") or ""),
            "camera": str(row.get("camera", "") or ""),
        })
    ids = [r["session_id"] for r in out]
    if len(ids) != len(set(ids)):
        raise ValueError("duplicate session_id in manifest")
    return out


def extract_session(entry: dict, videos_dir: Path, out_dir: Path, fps: float,
                    min_diff: float, max_frames: int | None,
                    jpeg_quality: int) -> list[dict]:
    import cv2
    import numpy as np

    vpath = Path(entry["video"])
    if not vpath.is_absolute():
        vpath = videos_dir / vpath
    cap = cv2.VideoCapture(str(vpath))
    if not cap.isOpened():
        raise FileNotFoundError(f"cannot open video {vpath}")
    src_fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    step = max(1, round(src_fps / fps)) if fps > 0 else 1
    sess_dir = out_dir / entry["session_id"]
    sess_dir.mkdir(parents=True, exist_ok=True)

    rows, prev, idx = [], None, -1
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        idx += 1
        if idx % step:
            continue
        if min_diff > 0:
            small = cv2.cvtColor(cv2.resize(frame, (64, 36)),
                                 cv2.COLOR_BGR2GRAY).astype(np.float32)
            if prev is not None and float(np.abs(small - prev).mean()) < min_diff:
                continue
            prev = small
        name = f"{entry['session_id']}_f{idx:06d}.jpg"
        cv2.imwrite(str(sess_dir / name), frame,
                    [cv2.IMWRITE_JPEG_QUALITY, jpeg_quality])
        h, w = frame.shape[:2]
        rows.append({
            "file_name": f"{entry['session_id']}/{name}",
            "session_id": entry["session_id"],
            "person_ids": ";".join(entry["person_ids"]),
            "video": vpath.name,
            "frame_idx": idx,
            "t_sec": round(idx / src_fps, 3),
            "situation": entry["situation"],
            "date": entry["date"],
            "camera": entry["camera"],
            "width": w,
            "height": h,
        })
        if max_frames and len(rows) >= max_frames:
            break
    cap.release()
    return rows


def write_frames_csv(rows: list[dict], path: Path, append: bool) -> None:
    existing: dict[str, dict] = {}
    if append and path.exists():
        with path.open(newline="") as f:
            existing = {r["file_name"]: r for r in csv.DictReader(f)}
    for r in rows:
        existing[r["file_name"]] = r
    with path.open("w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=FRAME_FIELDS)
        w.writeheader()
        for r in sorted(existing.values(), key=lambda r: r["file_name"]):
            w.writerow({k: r.get(k, "") for k in FRAME_FIELDS})


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--manifest", required=True)
    ap.add_argument("--videos-dir", default="../posture/recordings")
    ap.add_argument("--out", default="data/frames")
    ap.add_argument("--fps", type=float, default=2.0,
                    help="target sampling rate (frames per second of video)")
    ap.add_argument("--min-diff", type=float, default=2.0,
                    help="skip frames whose mean abs grey diff to the last kept "
                         "frame (64x36) is below this (0 disables)")
    ap.add_argument("--max-frames", type=int, default=None,
                    help="cap per session")
    ap.add_argument("--jpeg-quality", type=int, default=95)
    ap.add_argument("--sessions", nargs="*", help="only these session ids")
    ap.add_argument("--no-append", action="store_true",
                    help="overwrite frames.csv instead of merging")
    args = ap.parse_args(argv)

    entries = load_manifest(args.manifest)
    if args.sessions:
        entries = [e for e in entries if e["session_id"] in set(args.sessions)]
    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    all_rows: list[dict] = []
    for e in entries:
        if not e["consent"]:
            print(f"[skip] {e['session_id']}: consent is not true", file=sys.stderr)
            continue
        rows = extract_session(e, Path(args.videos_dir), out_dir, args.fps,
                               args.min_diff, args.max_frames, args.jpeg_quality)
        print(f"{e['session_id']}: {len(rows)} frames ({','.join(e['person_ids'])})")
        all_rows.extend(rows)
    write_frames_csv(all_rows, out_dir / "frames.csv", append=not args.no_append)
    print(f"wrote {len(all_rows)} frames -> {out_dir}/frames.csv")
    return 0


if __name__ == "__main__":
    sys.exit(main())
