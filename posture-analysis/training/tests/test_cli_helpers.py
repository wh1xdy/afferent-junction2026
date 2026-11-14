import json

import extract_frames
import prelabel
import numpy as np
from export_onnx import bgr_fix_coeffs
from halpe26 import KP_NAMES, RTM_MEAN, RTM_STD


def test_manifest_yaml_and_csv(tmp_path):
    y = tmp_path / "m.yaml"
    y.write_text("sessions:\n  - {video: a.mp4, session_id: S1, person_ids: [P1, P2], consent: true}\n")
    c = tmp_path / "m.csv"
    c.write_text("video,session_id,person_ids,consent\na.mp4,S1,P1;P2,yes\nb.mp4,S2,P3,no\n")
    ey, ec = extract_frames.load_manifest(y), extract_frames.load_manifest(c)
    assert ey[0]["person_ids"] == ec[0]["person_ids"] == ["P1", "P2"]
    assert ey[0]["consent"] and ec[0]["consent"] and not ec[1]["consent"]


def test_prelabel_coco_conversion():
    kpts = np.tile(np.arange(26, dtype=float)[:, None], (1, 2))[None]
    scores = np.linspace(0, 1, 26)[None]
    anns = prelabel.detections_to_coco(kpts, scores, [[10, 20, 110, 220]], 7, 1,
                                       kpt_thr=0.5, low_thr=0.2, min_kpts=1)
    a = anns[0]
    v = a["keypoints"][2::3]
    assert len(a["keypoints"]) == 78 and a["bbox"] == [10, 20, 100, 200]
    assert set(v) == {0, 1, 2} and a["num_keypoints"] == sum(x > 0 for x in v)
    lab = prelabel.cvat_skeleton_label()[0]
    assert [s["name"] for s in lab["sublabels"]] == list(KP_NAMES)
    json.dumps(lab)


def test_bgr_fix_is_exact():
    rng = np.random.default_rng(0)
    bgr = rng.uniform(0, 255, size=(3, 4, 4))
    m, s = np.array(RTM_MEAN)[:, None, None], np.array(RTM_STD)[:, None, None]
    x = (bgr - m) / s                      # what rtmlib feeds
    want = (bgr[::-1] - m) / s             # what training saw (RGB)
    a, b = bgr_fix_coeffs()
    got = x[::-1] * np.array(a)[:, None, None] + np.array(b)[:, None, None]
    assert np.allclose(got, want)
