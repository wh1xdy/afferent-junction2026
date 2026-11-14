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


def _face_in(bbox, emb, t: float = 0.0):
    # face center inside upper part of person bbox
    return FaceObs(bbox=bbox, embedding=emb, score=0.9, t=t)


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

    # re-acquire -> LOCKED again (fresh face obs at the new time)
    it.set_faces([_face_in((330, 80, 390, 140),
                           target_emb + 0.01 * _emb(11), t=2.5)])
    t3 = it.update(2.5, [_person()])
    assert it.state == STATE_LOCKED and t3 is not None

    # state transitions were logged
    log = st.identite_log()
    states = [r["state"] for r in log]
    assert STATE_LOCKED in states and STATE_LOST in states
    st.close()


def test_brief_occlusion_keeps_last_track(tmp_path):
    """During a short detection gap the previous PersonTrack is still
    returned so the smoother is not reset every frame."""
    st = _storage(tmp_path)
    st.add_gallery(_emb(10), "enrolement")
    it = IdentityTracker(st, threshold=0.4, lost_after_s=1.0)
    it.set_faces([_face_in((330, 80, 390, 140), _emb(10), t=0.0)])
    target = it.update(0.0, [_person()])
    assert it.state == STATE_LOCKED and target is not None

    # detection drops for < lost_after_s: still LOCKED, same track kept
    kept = it.update(0.4, [])
    assert it.state == STATE_LOCKED
    assert kept is not None and kept.track_id == target.track_id

    # beyond lost_after_s -> LOST and no track
    assert it.update(2.0, []) is None
    assert it.state == STATE_LOST
    st.close()


def test_persistent_mismatch_unlocks(tmp_path):
    """Fresh faces inside the target bbox that mismatch the gallery for
    MISMATCH_UNLOCK_S cumulative seconds de-lock the target -> LOST."""
    st = _storage(tmp_path)
    st.add_gallery(_emb(10), "enrolement")
    it = IdentityTracker(st, threshold=0.5, lost_after_s=30.0,
                         mismatch_unlock_s=2.0)
    it.set_faces([_face_in((330, 80, 390, 140), _emb(10), t=0.0)])
    assert it.update(0.0, [_person()]) is not None
    assert it.state == STATE_LOCKED

    wrong = _emb(99)  # cosine ~0 vs gallery -> << 0.8 * threshold
    for i in range(1, 6):  # t=0.5 .. 2.5 -> 2.0 s of mismatch
        t = 0.5 * i
        it.set_faces([_face_in((330, 80, 390, 140), wrong, t=t)])
        out = it.update(t, [_person()])
        if t < 2.5:
            assert it.state == STATE_LOCKED and out is not None, t
    assert it.state == STATE_LOST and out is None
    st.close()


def test_brief_mismatch_does_not_unlock(tmp_path):
    """A short mismatch burst below MISMATCH_UNLOCK_S keeps the lock."""
    st = _storage(tmp_path)
    st.add_gallery(_emb(10), "enrolement")
    it = IdentityTracker(st, threshold=0.5, lost_after_s=30.0,
                         mismatch_unlock_s=5.0)
    it.set_faces([_face_in((330, 80, 390, 140), _emb(10), t=0.0)])
    it.update(0.0, [_person()])
    for i in range(1, 5):  # ~2 s of wrong face < 5 s needed
        t = 0.5 * i
        it.set_faces([_face_in((330, 80, 390, 140), _emb(99), t=t)])
        assert it.update(t, [_person()]) is not None
        assert it.state == STATE_LOCKED
    # a matching face clears the accumulated mismatch time
    it.set_faces([_face_in((330, 80, 390, 140), _emb(10), t=3.0)])
    it.update(3.0, [_person()])
    for i in range(6, 10):  # another 2 s -> would exceed 5 s if kept
        t = 0.5 * i
        it.set_faces([_face_in((330, 80, 390, 140), _emb(99), t=t)])
        assert it.update(t, [_person()]) is not None
        assert it.state == STATE_LOCKED
    st.close()


def test_stale_faces_not_associated(tmp_path):
    """Face obs older than face_max_age_s are ignored: no lock on stale
    detections, lock again on a fresh one."""
    st = _storage(tmp_path)
    st.add_gallery(_emb(10), "enrolement")
    it = IdentityTracker(st, threshold=0.4, face_max_age_s=0.5)
    # detection ran at t=0 but the frame is processed at t=5 -> stale
    it.set_faces([_face_in((330, 80, 390, 140), _emb(10), t=0.0)])
    assert it.update(5.0, [_person()]) is None
    assert it.state == STATE_SEARCH
    # fresh obs at t=5 -> locks
    it.set_faces([_face_in((330, 80, 390, 140), _emb(10), t=5.0)])
    assert it.update(5.0, [_person()]) is not None
    assert it.state == STATE_LOCKED
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
        it.set_faces([_face_in((330, 80, 390, 140), emb + 0.001 * _emb(i),
                               t=float(i))])
        it.update(float(i), [_person()])
    # now varied embeddings
    for i in range(20, 30):
        it.set_faces([_face_in((330, 80, 390, 140), _emb(i), t=10.0 + i)])
        it.update(10.0 + i, [_person()])
    n = it.stop_enrollment()
    assert n >= 3
    # gallery may also hold 'adaptative' rows added while locked; count only
    # enrollment rows
    rows = st.query("SELECT type FROM galerie")
    assert sum(1 for r in rows if r["type"] == "enrolement") == n
    assert st.gallery_count() >= n
    st.close()
