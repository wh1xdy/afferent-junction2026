import json

import pytest

import split


def _coco(frames):
    """frames: list of person-id lists, one image (with 1 ann) per entry."""
    images, anns = [], []
    for i, pids in enumerate(frames, start=1):
        images.append({"id": i, "file_name": f"S{i % 7}/img_{i:04d}.jpg",
                       "width": 640, "height": 480, "person_ids": ";".join(pids)})
        anns.append({"id": i, "image_id": i, "category_id": 1,
                     "bbox": [0, 0, 10, 10], "area": 100, "iscrowd": 0,
                     "keypoints": [1.0, 1.0, 2] * 26, "num_keypoints": 26})
    return {"images": images, "annotations": anns,
            "categories": [{"id": 1, "name": "person"}]}


FRAMES = ([["P%02d" % (i % 10)] for i in range(200)]
          + [["P01", "P02"]] * 3 + [["P07", "P08"]] * 2)


def _run(coco, seed=0, **kw):
    ip = split.image_persons(coco)
    groups = split.person_groups(ip)
    assign = split.assign_groups(groups, kw.get("val", 0.2), kw.get("test", 0.2),
                                 seed, kw.get("vp"), kw.get("tp"))
    return ip, assign, split.split_coco(json.loads(json.dumps(coco)), ip, assign)


def _persons(part):
    return {p for im in part["images"] for p in im["person_ids"].split(";")}


def test_no_person_leakage():
    coco = _coco(FRAMES)
    for seed in range(20):
        _, assign, parts = _run(coco, seed)
        ps = {s: _persons(parts[s]) for s in split.SPLITS}
        assert not ps["train"] & ps["val"]
        assert not ps["train"] & ps["test"]
        assert not ps["val"] & ps["test"]
        assert all(ps[s] for s in split.SPLITS), ps
        # every image/annotation lands in exactly one split
        assert sum(len(p["images"]) for p in parts.values()) == len(coco["images"])
        assert sum(len(p["annotations"]) for p in parts.values()) == len(coco["annotations"])
        for p in parts.values():
            ids = {im["id"] for im in p["images"]}
            assert all(a["image_id"] in ids for a in p["annotations"])


def test_cooccurring_persons_same_split():
    _, assign, _ = _run(_coco(FRAMES), seed=3)
    assert assign["P01"] == assign["P02"]
    assert assign["P07"] == assign["P08"]


def test_deterministic_and_seed_sensitive():
    coco = _coco(FRAMES)
    a1 = _run(coco, seed=42)[1]
    a2 = _run(coco, seed=42)[1]
    assert a1 == a2
    # input order must not matter either
    rev = dict(coco, images=list(reversed(coco["images"])))
    assert _run(rev, seed=42)[1] == a1
    assert any(_run(coco, seed=s)[1] != a1 for s in range(10))


def test_forced_persons_and_conflicts():
    coco = _coco(FRAMES)
    _, assign, _ = _run(coco, tp=["P05"], vp=["P06"])
    assert assign["P05"] == "test" and assign["P06"] == "val"
    with pytest.raises(ValueError):
        _run(coco, tp=["P01"], vp=["P02"])  # co-occur -> cannot be separated


def test_frames_csv_fallback_by_basename():
    coco = _coco([["P01"], ["P02"]])
    for im in coco["images"]:
        im.pop("person_ids")
    meta = {"other_dir/" + im["file_name"].split("/")[-1]: {"person_ids": "PX"}
            for im in coco["images"]}
    assert set(sum(split.image_persons(coco, meta).values(), [])) == {"PX"}
    with pytest.raises(ValueError):
        split.image_persons(coco, {})
