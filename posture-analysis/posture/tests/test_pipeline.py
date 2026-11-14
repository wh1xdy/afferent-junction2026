"""Pipeline-level units: StepDetector scaling + FrameProcessor init."""
import math

import numpy as np

from afferent.config import Config
from afferent.identity import FaceObs, STATE_LOCKED
from afferent.pipeline import FrameProcessor, StepDetector
from afferent.storage import Storage

from conftest import make_kpts


def test_frame_processor_init_last_had_persons(tmp_path):
    """process() reads _last_had_persons on the very first frame — it must
    exist before any detection ran (was an AttributeError swallowed by the
    pipeline's except)."""
    st = Storage(str(tmp_path / "s.db"))
    proc = FrameProcessor(Config(), st)
    assert proc._last_had_persons is False
    st.close()


def test_step_detector_counts_bounce_scaled_to_trunk():
    """The same 4 px bounce counts steps when the person is far away
    (small trunk) but is below the range floor when they are close."""
    sd_far = StepDetector()
    steps_far = 0
    for i in range(90):  # 3 s @30fps, sine amp 2 px -> range ~4 px
        t = i / 30.0
        hip_y = 300.0 + 2.0 * math.sin(2 * math.pi * 1.8 * t)
        steps_far += sd_far.update(t, hip_y, trunk_len_px=50.0)
    assert steps_far >= 2  # min_range = max(1.5, 0.02*50) = 1.5 < 4

    sd_near = StepDetector()
    steps_near = 0
    for i in range(90):
        t = i / 30.0
        hip_y = 300.0 + 2.0 * math.sin(2 * math.pi * 1.8 * t)
        steps_near += sd_near.update(t, hip_y, trunk_len_px=400.0)
    assert steps_near == 0  # min_range = 0.02*400 = 8 > 4


def test_step_detector_no_trunk_falls_back_to_fixed_floor():
    """Without trunk lengths the old 2 px floor applies."""
    sd = StepDetector()
    steps = 0
    for i in range(90):
        t = i / 30.0
        hip_y = 300.0 + 2.0 * math.sin(2 * math.pi * 1.8 * t)
        steps += sd.update(t, hip_y)  # range ~4 > 2 -> steps
    assert steps >= 2


def _emb(seed: int, dim: int = 128) -> np.ndarray:
    rng = np.random.default_rng(seed)
    v = rng.normal(size=dim)
    return v / np.linalg.norm(v)


def test_pipeline_locked_target_produces_angles(tmp_path):
    """Full pipeline path: SEARCH -> LOCKED produces valid angles.

    Regression test for the target['kpts'] / target.kpts bug: without the
    fix, a TypeError is raised during process() when the identity locks.
    """
    st = Storage(str(tmp_path / "pipe.db"))
    proc = FrameProcessor(Config(), st)

    # Stub pose estimator: returns one person with known keypoints.
    kpts = make_kpts(facing="profile")
    person_bbox = (250, 50, 400, 440)

    class _FakePose:
        def __call__(self, image, force_detect=False):
            return [{"bbox": person_bbox, "kpts": kpts.copy()}]

    proc.pose = _FakePose()
    proc.face = None  # bypass face module; inject faces directly

    # Enroll a target embedding in the gallery.
    target_emb = _emb(42)
    st.add_gallery(target_emb, "enrolement")

    # First frame: inject a matching face and process.
    face = FaceObs(
        bbox=(300, 60, 380, 130),
        embedding=target_emb + 0.01 * _emb(43),
        score=0.95, t=0.0,
    )
    proc.identity.set_faces([face])
    image = np.zeros((480, 640, 3), dtype=np.uint8)
    res = proc.process(image, 0.0)

    assert res["identity"] == STATE_LOCKED, f"expected LOCKED, got {res['identity']}"
    assert res["target"] is True
    # Profile view: trunk_inclination and neck_flexion should be computed.
    assert res["angles"].get("trunk_inclination") is not None or \
        res["angles"].get("neck_flexion") is not None
    assert res.get("kpts") is not None
    assert res.get("bbox") is not None

    st.close()
