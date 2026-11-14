"""POST /api/enroll/face-image: enroll/match from an uploaded photo.

Exercises the endpoint function directly (no httpx needed): a stub
pipeline exposes a fake InsightFace detector + a real Storage gallery,
so dedupe, matching and error paths all run through real code.
"""
import asyncio
from types import SimpleNamespace

import numpy as np
import pytest
from fastapi import HTTPException

from afferent import server
from afferent.config import Config
from afferent.identity import FaceObs, IdentityTracker
from afferent.pipeline import FrameProcessor
from afferent.storage import Storage


class _Req:
    """Minimal stand-in for starlette Request (only .body() is used)."""

    def __init__(self, body: bytes):
        self._b = body

    async def body(self) -> bytes:
        return self._b


def _jpeg() -> bytes:
    import cv2
    ok, buf = cv2.imencode(".jpg", np.full((64, 64, 3), 200, np.uint8))
    assert ok
    return buf.tobytes()


def _emb(seed: int) -> np.ndarray:
    v = np.random.RandomState(seed).randn(512).astype(np.float64)
    return v / np.linalg.norm(v)          # normed, like buffalo_l output


class _Det:
    def __init__(self, faces):
        self._faces = faces

    def detect(self, img, t=0.0):
        return list(self._faces)


@pytest.fixture
def pipe(tmp_path, monkeypatch):
    """Real FrameProcessor + Storage, stubbed face detector + request."""
    st = Storage(str(tmp_path / "s.db"))
    proc = FrameProcessor(Config(), st)

    def use(faces):
        proc.face = SimpleNamespace(detector=_Det(faces))

    p = SimpleNamespace(proc=proc, storage=st, models_error=None)
    monkeypatch.setitem(server._STATE, "pipeline", p)
    yield use
    st.close()


def _call(body: bytes, **kw):
    return asyncio.run(server.enroll_face_image(_Req(body), **kw))


def test_enroll_inserts_embedding(pipe):
    pipe([FaceObs(bbox=(1, 2, 50, 60), embedding=_emb(1))])
    r = _call(_jpeg())
    assert r["enrolled"] and r["ok"] and r["mode"] == "enroll"
    assert r["gallery_size"] == 1 and r["faces_detected"] == 1
    assert r["matched"] is False        # gallery was empty
    assert r["duplicate"] is False


def test_match_against_enrolled_embedding(pipe):
    emb = _emb(7)
    pipe([FaceObs(bbox=(0, 0, 40, 40), embedding=emb)])
    _call(_jpeg())                                   # enroll
    r = _call(_jpeg(), mode="match")                 # same face again
    assert r["mode"] == "match" and r["matched"]
    assert r["best_similarity"] > 0.99
    assert r["enrolled"] is False                    # match writes nothing


def test_match_rejects_other_identity(pipe):
    pipe([FaceObs(bbox=(0, 0, 40, 40), embedding=_emb(7))])
    _call(_jpeg())
    pipe([FaceObs(bbox=(0, 0, 40, 40), embedding=_emb(8))])
    r = _call(_jpeg(), mode="match")
    assert not r["matched"] and r["best_similarity"] < 0.45


def test_enroll_dedupes_identical_embedding(pipe):
    emb = _emb(3)
    pipe([FaceObs(bbox=(0, 0, 40, 40), embedding=emb)])
    _call(_jpeg())
    r = _call(_jpeg())                               # same embedding again
    assert r["duplicate"] and not r["enrolled"]
    assert r["gallery_size"] == 1


def test_picks_largest_face_and_index(pipe):
    big = FaceObs(bbox=(0, 0, 80, 80), embedding=_emb(1))
    small = FaceObs(bbox=(0, 0, 20, 20), embedding=_emb(2))
    pipe([small, big])                               # unsorted on purpose
    r = _call(_jpeg())
    assert r["faces_detected"] == 2 and r["bbox"] == [0.0, 0.0, 80.0, 80.0]
    r = _call(_jpeg(), face_index=1)
    assert r["bbox"] == [0.0, 0.0, 20.0, 20.0]


def test_error_paths(pipe):
    pipe([FaceObs(bbox=(0, 0, 10, 10), embedding=_emb(1))])
    with pytest.raises(HTTPException) as e:
        _call(_jpeg(), mode="bogus")
    assert e.value.status_code == 400
    with pytest.raises(HTTPException) as e:
        _call(b"")
    assert e.value.status_code == 400
    with pytest.raises(HTTPException) as e:
        _call(b"not an image")
    assert e.value.status_code == 400
    with pytest.raises(HTTPException) as e:
        _call(_jpeg(), face_index=5)
    assert e.value.status_code == 400


def test_no_face_detected(pipe):
    pipe([])                                         # detector finds nothing
    with pytest.raises(HTTPException) as e:
        _call(_jpeg())
    assert e.value.status_code == 422


def test_models_not_loaded(tmp_path, monkeypatch):
    st = Storage(str(tmp_path / "s.db"))
    proc = FrameProcessor(Config(), st)
    proc.face = None                                 # still loading
    p = SimpleNamespace(proc=proc, storage=st,
                        models_error="download in progress")
    monkeypatch.setitem(server._STATE, "pipeline", p)
    with pytest.raises(HTTPException) as e:
        _call(_jpeg())
    assert e.value.status_code == 503
    st.close()
