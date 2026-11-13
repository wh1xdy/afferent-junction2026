"""Identity state machine tests with fake embeddings (no models)."""
import numpy as np

from afferent.identity import (FaceObs, IdentityTracker, STATE_LOCKED,
                               STATE_LOST, STATE_SEARCH, cosine, iou)
from afferent.storage import Storage


def _emb(seed: int, dim: int = 128) -> np.ndarray:
    rng = np.random.default_rng(seed)
    v = rng.normal(size=dim)
    return v / np.linalg.norm(v)


def _person(bbox=(300, 50, 500, 400), kpts=None):
    if kpts is None:
        kpts = np.zeros((26, 3))
    return {"bbox": bbox, "kpts": kpts}


def _face_in(bbox, emb):
    # face center inside upper part of person bbox
    return FaceObs(bbox=bbox, embedding=emb, score=0.9, t=0.0)


def _storage(tmp_path):
    return Storage(str(tmp_path / "test.db"))


def test_cosine_and_iou():
    a, b = _emb(1), _emb(1)
    assert cosine(a, b) == 1.0
    c = _emb(2)
    assert abs(cosine(a, c)) < 0.5
    assert iou((0, 0, 10, 10), (5, 5, 15, 15)) == 25 / 175
    assert iou((0, 0, 10, 10), (20, 20, 30, 30)) == 0.0


def test_search_to_locked_to_lost(tmp_path):
    st = _storage(tmp_path)
    target_emb = _emb(10)
    st.add_gallery(target_emb, "enrolement")
    it = IdentityTracker(st, threshold=0.4, lost_after_s=1.0)

    # face inside person bbox, matching gallery -> LOCKED
    face = _face_in((330, 80, 390, 140), target_emb + 0.01 * _emb(11))
    it.set_faces([face])
    t = it.update(0.0, [_person()])
    assert it.state == STATE_LOCKED and t is not None

    # no persons for > lost_after_s -> LOST
    t2 = it.update(2.0, [])
    assert it.state == STATE_LOST and t2 is None

    # re-acquire -> LOCKED again
    it.set_faces([face])
    t3 = it.update(2.5, [_person()])
    assert it.state == STATE_LOCKED and t3 is not None

    # state transitions were logged
    log = st.identite_log()
    states = [r["state"] for r in log]
    assert STATE_LOCKED in states and STATE_LOST in states
    st.close()


def test_no_lock_without_gallery(tmp_path):
    st = _storage(tmp_path)
    it = IdentityTracker(st, threshold=0.4)
    face = _face_in((330, 80, 390, 140), _emb(10))
    it.set_faces([face])
    t = it.update(0.0, [_person()])
    assert it.state == STATE_SEARCH and t is None
    st.close()


def test_face_outside_person_not_locked(tmp_path):
    st = _storage(tmp_path)
    emb = _emb(10)
    st.add_gallery(emb, "enrolement")
    it = IdentityTracker(st, threshold=0.4)
    # matching face but far outside the person bbox
    it.set_faces([_face_in((600, 300, 660, 360), emb)])
    t = it.update(0.0, [_person(bbox=(300, 50, 500, 400))])
    assert t is None and it.state == STATE_SEARCH
    st.close()


def test_enrollment_collects_and_dedupes(tmp_path):
    st = _storage(tmp_path)
    it = IdentityTracker(st, threshold=0.4, enroll_min=3, enroll_max=5,
                         dedupe_cosine=0.98)
    it.start_enrollment()
    emb = _emb(20)
    # feed the same face 10 times -> only ~1 stored (near-duplicates rejected)
    for i in range(10):
        it.set_faces([_face_in((330, 80, 390, 140), emb + 0.001 * _emb(i))])
        it.update(float(i), [_person()])
    # now varied embeddings
    for i in range(20, 30):
        it.set_faces([_face_in((330, 80, 390, 140), _emb(i))])
        it.update(10.0 + i, [_person()])
    n = it.stop_enrollment()
    assert n >= 3
    # gallery may also hold 'adaptative' rows added while locked; count only
    # enrollment rows
    rows = st.query("SELECT type FROM galerie")
    assert sum(1 for r in rows if r["type"] == "enrolement") == n
    assert st.gallery_count() >= n
    st.close()
