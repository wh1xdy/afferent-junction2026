#!/usr/bin/env python3
"""Split a COCO-keypoints file into train/val/test BY PERSON.

Rule (plan, phase 4): a person never appears in two splits -- never split by
frame or by day, otherwise consecutive near-identical frames leak and the
test score is meaningless.

Person ids of an image come from images[].person_ids (written by
prelabel.py) or, if absent (e.g. after a CVAT round-trip that drops custom
fields), from frames.csv joined on file_name (full relative path, then
basename). Persons that co-occur in an image are merged into one group
(union-find) and a whole group goes to a single split.

Groups are shuffled with a fixed seed, then test and val are filled until
they hold >= round(frac * n_persons) persons (at least 1 each when there are
>= 3 groups); the rest is train. Explicit --test-persons / --val-persons
override the random assignment (e.g. a fixed held-out volunteer panel).

Usage:
    python scripts/split.py --ann data/annotations/corrected.json \
        --frames-csv data/frames/frames.csv --out data/annotations --seed 0
"""
from __future__ import annotations

import argparse
import csv
import json
import os
import random
import sys
from collections import defaultdict
from pathlib import Path

SPLITS = ("train", "val", "test")


def _ids(v) -> list[str]:
    if v is None:
        return []
    if isinstance(v, (list, tuple)):
        return [str(x).strip() for x in v if str(x).strip()]
    return [p.strip() for p in str(v).replace(",", ";").split(";") if p.strip()]


def image_persons(coco: dict, frames_meta: dict[str, dict] | None = None
                  ) -> dict[int, list[str]]:
    """image_id -> list of person ids. Raises if an image has none."""
    meta = frames_meta or {}
    by_base = {os.path.basename(k): v for k, v in meta.items()}
    out, missing = {}, []
    for im in coco["images"]:
        pids = _ids(im.get("person_ids"))
        if not pids:
            row = meta.get(im["file_name"]) or by_base.get(
                os.path.basename(im["file_name"]))
            if row:
                pids = _ids(row.get("person_ids"))
        if not pids:
            missing.append(im["file_name"])
        out[im["id"]] = pids
    if missing:
        raise ValueError(f"{len(missing)} images without person_ids, e.g. "
                         f"{missing[:3]} -- provide --frames-csv")
    return out


def person_groups(img_persons: dict[int, list[str]]) -> list[list[str]]:
    """Union-find over persons co-occurring in an image. Sorted, deterministic."""
    parent: dict[str, str] = {}

    def find(x: str) -> str:
        parent.setdefault(x, x)
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    for pids in img_persons.values():
        for p in pids:
            find(p)
        for p in pids[1:]:
            ra, rb = find(pids[0]), find(p)
            if ra != rb:
                parent[max(ra, rb)] = min(ra, rb)
    groups: dict[str, list[str]] = defaultdict(list)
    for p in parent:
        groups[find(p)].append(p)
    return sorted((sorted(g) for g in groups.values()), key=lambda g: g[0])


def assign_groups(groups: list[list[str]], val_frac: float, test_frac: float,
                  seed: int, val_persons: list[str] | None = None,
                  test_persons: list[str] | None = None) -> dict[str, str]:
    """person -> split. Deterministic for a given (groups, fracs, seed)."""
    val_persons, test_persons = set(val_persons or []), set(test_persons or [])
    if val_persons & test_persons:
        raise ValueError("a person is listed in both --val-persons and --test-persons")
    assign: dict[str, str] = {}
    free = []
    for g in groups:
        forced = {("test" if p in test_persons else "val")
                  for p in g if p in test_persons or p in val_persons}
        if len(forced) > 1:
            raise ValueError(f"group {g} co-occurs but is forced into {forced}")
        if forced:
            s = forced.pop()
            for p in g:
                assign[p] = s
        else:
            free.append(g)

    random.Random(seed).shuffle(free)
    n_persons = sum(len(g) for g in groups)
    want = {"test": round(test_frac * n_persons), "val": round(val_frac * n_persons)}
    if len(groups) >= 3:
        want = {k: max(1, v) if (test_frac if k == "test" else val_frac) > 0 else 0
                for k, v in want.items()}
    have = {s: sum(1 for v in assign.values() if v == s) for s in SPLITS}
    rest = []
    for g in free:
        for s in ("test", "val"):
            if have[s] < want[s]:
                break
        else:
            s = "train"
        if s == "train":
            rest.append(g)
            continue
        for p in g:
            assign[p] = s
        have[s] += len(g)
    for g in rest:
        for p in g:
            assign[p] = "train"
    if not any(v == "train" for v in assign.values()):
        raise ValueError("no person left for train -- lower val/test fractions")
    return assign


def split_coco(coco: dict, img_persons: dict[int, list[str]],
               assign: dict[str, str]) -> dict[str, dict]:
    img_split = {}
    for iid, pids in img_persons.items():
        ss = {assign[p] for p in pids}
        assert len(ss) == 1, f"image {iid} spans splits {ss}"  # union-find guarantees
        img_split[iid] = ss.pop()
    out = {}
    for s in SPLITS:
        imgs = [im for im in coco["images"] if img_split[im["id"]] == s]
        ids = {im["id"] for im in imgs}
        anns = [a for a in coco["annotations"] if a["image_id"] in ids]
        for im in imgs:  # keep person ids on the image for later audits
            im["person_ids"] = ";".join(img_persons[im["id"]])
        out[s] = {k: v for k, v in coco.items() if k not in ("images", "annotations")}
        out[s]["images"], out[s]["annotations"] = imgs, anns
    return out


def load_frames_csv(path: str | None) -> dict[str, dict]:
    if not path or not Path(path).exists():
        return {}
    with open(path, newline="") as f:
        return {r["file_name"]: r for r in csv.DictReader(f)}


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--ann", required=True, help="corrected COCO keypoints json")
    ap.add_argument("--frames-csv", default="data/frames/frames.csv")
    ap.add_argument("--out", default="data/annotations")
    ap.add_argument("--val-frac", type=float, default=0.15)
    ap.add_argument("--test-frac", type=float, default=0.15)
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--val-persons", nargs="*", default=[])
    ap.add_argument("--test-persons", nargs="*", default=[])
    args = ap.parse_args(argv)

    coco = json.loads(Path(args.ann).read_text())
    img_persons = image_persons(coco, load_frames_csv(args.frames_csv))
    groups = person_groups(img_persons)
    assign = assign_groups(groups, args.val_frac, args.test_frac, args.seed,
                           args.val_persons, args.test_persons)
    parts = split_coco(coco, img_persons, assign)
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    report = {"seed": args.seed, "source": str(args.ann), "groups": groups,
              "splits": {}}
    for s, d in parts.items():
        (out / f"{s}.json").write_text(json.dumps(d))
        persons = sorted(p for p, v in assign.items() if v == s)
        report["splits"][s] = {"persons": persons, "images": len(d["images"]),
                               "instances": len(d["annotations"])}
        print(f"{s:5s}: {len(persons):3d} persons {len(d['images']):6d} images "
              f"{len(d['annotations']):6d} instances  {persons}")
    (out / "split_report.json").write_text(json.dumps(report, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
