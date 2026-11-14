"""Situation classification + episode segmentation tests."""
import numpy as np

from afferent.situation import (EpisodeTracker, FrameSituation,
                                SituationTracker)

from conftest import make_kpts, sitting_kpts


def test_standing_still():
    tr = SituationTracker()
    k = make_kpts()
    acts = []
    for i in range(90):  # 3 s @30fps
        fs = tr.update(i / 30.0, k)
        acts.append(fs.activity)
    assert acts[-1] == "standing"


def test_sitting_bent_knees():
    tr = SituationTracker()
    k = sitting_kpts()
    acts = []
    for i in range(90):
        fs = tr.update(i / 30.0, k)
        acts.append(fs.activity)
    assert acts[-1] == "sitting"


def test_walking_fast_floor():
    tr = SituationTracker()
    k = make_kpts()
    acts = []
    for i in range(60):
        t = i / 30.0
        fs = tr.update(t, k, floor_pos=(0.8 * t, 0.0), calibrated=True)
        acts.append(fs.activity)
    assert acts[-1] == "walking"


def test_transition_sit_to_stand():
    tr = SituationTracker()
    sit, stand = sitting_kpts(), make_kpts()
    seq = [(sit, 60), (stand, 90)]  # 2 s sit then 3 s stand
    acts = []
    t = 0.0
    for kpts, n in seq:
        for _ in range(n):
            fs = tr.update(t, kpts)
            acts.append(fs.activity)
            t += 1 / 30
    # a transition should appear around the switch
    assert "transition" in acts or acts[-1] == "standing"


def test_episode_walk_min_distance():
    eps = []
    tr = EpisodeTracker(on_episode=eps.append)
    t = 0.0
    # 4 s walking covering ~3.2 m -> valid walk episode
    for i in range(120):
        tr.update(FrameSituation(t=t, activity="walking",
                                 orientation="profile",
                                 floor_pos=(0.8 * t, 0.0)))
        t += 1 / 30
    tr.update(FrameSituation(t=t, activity="standing",
                             orientation="face"))
    tr.finalize(t + 1)
    walks = [e for e in eps if e["type"] == "walk"]
    assert len(walks) == 1
    assert walks[0]["valid"] is True
    assert walks[0]["distance_m"] == pytest_approx(3.2, 0.3)


def test_episode_short_walk_invalid():
    eps = []
    tr = EpisodeTracker(on_episode=eps.append)
    t = 0.0
    for i in range(30):  # 1 s, 0.8 m -> below 2 m and <3 steps
        tr.update(FrameSituation(t=t, activity="walking",
                                 orientation="profile",
                                 floor_pos=(0.8 * t, 0.0)))
        t += 1 / 30
    tr.update(FrameSituation(t=t, activity="standing", orientation="face"))
    tr.finalize(t + 1)
    walks = [e for e in eps if e["type"] == "walk"]
    assert len(walks) == 1
    assert walks[0]["valid"] is False


def test_episode_sit_needs_30s():
    eps = []
    tr = EpisodeTracker(on_episode=eps.append)
    t = 0.0
    for i in range(60):  # only 2 s sitting -> below 30 s threshold
        tr.update(FrameSituation(t=t, activity="sitting",
                                 orientation="face"))
        t += 1 / 30
    tr.finalize(t + 1)
    assert not [e for e in eps if e["type"] == "sit"]

    eps2 = []
    tr2 = EpisodeTracker(on_episode=eps2.append)
    t = 0.0
    for i in range(1000):  # ~33 s
        tr2.update(FrameSituation(t=t, activity="sitting",
                                  orientation="face"))
        t += 1 / 30
    tr2.finalize(t + 1)
    sits = [e for e in eps2 if e["type"] == "sit"]
    assert len(sits) == 1 and sits[0]["valid"] is True


def pytest_approx(v, tol):
    class A:
        def __eq__(self, o): return abs(o - v) <= tol
    return A()
