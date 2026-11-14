"""Pipeline-level units: StepDetector scaling + FrameProcessor init."""
import math

from afferent.config import Config
from afferent.pipeline import FrameProcessor, StepDetector
from afferent.storage import Storage


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
