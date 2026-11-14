"""FastAPI dashboard + control API for the posture pipeline."""
from __future__ import annotations

import asyncio
import json
import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse, Response, StreamingResponse
from pydantic import BaseModel

from .config import Config
from .pipeline import Pipeline
from .storage import Storage

_log = logging.getLogger("afferent.server")

WEB_DIR = Path(__file__).resolve().parent.parent / "web"


def _pipeline() -> Pipeline:
    return _STATE["pipeline"]


_STATE: dict = {}


@asynccontextmanager
async def lifespan(app: FastAPI):
    cfg = Config.from_env()
    storage = Storage(cfg.db_path, site=cfg.site)
    cfg.site = storage.site  # a persisted active_site wins over SITE env
    pipeline = Pipeline(cfg, storage)
    pipeline.start()
    _STATE["pipeline"] = pipeline
    _STATE["storage"] = storage
    _STATE["cfg"] = cfg
    yield
    pipeline.stop()


app = FastAPI(title="afferent posture", lifespan=lifespan)


# -- pages / stream ------------------------------------------------------------
@app.get("/")
def index():
    return FileResponse(WEB_DIR / "index.html")


@app.get("/stream.mjpg")
def stream():
    async def gen():
        last = None
        while True:
            jpeg = _pipeline().latest_jpeg()
            if jpeg is None:
                jpeg = _blank_jpeg()
            if jpeg is last:
                await asyncio.sleep(0.1)
                continue
            last = jpeg
            yield (b"--frame\r\nContent-Type: image/jpeg\r\n\r\n"
                   + jpeg + b"\r\n")
            await asyncio.sleep(0.066)

    return StreamingResponse(
        gen(), media_type="multipart/x-mixed-replace; boundary=frame")


@app.get("/frame.jpg")
def frame_jpg():
    jpeg = _pipeline().latest_jpeg() or _blank_jpeg()
    return Response(content=jpeg, media_type="image/jpeg",
                    headers={"Cache-Control": "no-store"})


def _blank_jpeg() -> bytes:
    import cv2
    import numpy as np
    img = np.zeros((480, 640, 3), dtype=np.uint8)
    cv2.putText(img, "loading models / no frames yet", (30, 240),
                cv2.FONT_HERSHEY_SIMPLEX, 1, (200, 200, 200), 2)
    ok, buf = cv2.imencode(".jpg", img)
    return buf.tobytes() if ok else b""


# -- status ----------------------------------------------------------------------
@app.get("/api/status")
def status():
    p = _pipeline()
    return JSONResponse(p.status())


# -- site (room) -------------------------------------------------------------------
@app.post("/api/site/{site_id}")
def site_switch(site_id: str):
    """Switch the active site (room). Pending minute buffers are flushed
    under the old site first; the new site's own floor homography and
    upright references take over immediately. Persists across restarts."""
    p = _pipeline()
    try:
        p.proc.set_site(site_id)
    except ValueError as e:
        raise HTTPException(400, str(e))
    return {"ok": True, "site": p.storage.site,
            "floor_calibrated": p.proc.floor.calibrated,
            "ref_trunk_len_px": p.proc.ref_trunk_len_px,
            "ref_shoulder_hip_px": p.proc.ref_shoulder_hip_px}


# -- identity ---------------------------------------------------------------------
@app.post("/api/enroll/start")
def enroll_start():
    p = _pipeline()
    p.proc.identity.start_enrollment()
    return {"ok": True, "state": "enrolling"}


@app.post("/api/enroll/stop")
def enroll_stop():
    p = _pipeline()
    n = p.proc.identity.stop_enrollment()
    return {"ok": True, "collected": n,
            "gallery_size": p.storage.gallery_count()}


@app.post("/api/enroll/face-image")
async def enroll_face_image(request: Request, mode: str = "enroll",
                            face_index: int = 0):
    """Enroll or match an identity from an uploaded face image.

    Alternative enrollment channel that does NOT require the person to
    stand in front of the live camera: POST a photo (head shot /
    selfie / video frame) and its InsightFace embedding is computed
    with the same detector used by the live pipeline, then matched
    against -- or added to -- the SQLite gallery.

    Request
    -------
    * Body: raw image bytes (`image/jpeg`, `image/png`, `image/webp`,
      ... anything cv2.imdecode reads). Content-Length required.
      No multipart needed: `curl --data-binary @face.jpg`.
    * `mode=enroll` (default): add the face embedding to the gallery.
    * `mode=match`: read-only -- return the best cosine similarity
      against the gallery and whether it passes the identity
      threshold, without storing anything. Useful to test a photo
      before enrolling, or to verify cross-device recognition.
    * `face_index=0` (default): which detected face to use, ranked by
      bbox area (0 = largest). Increase to pick another face when the
      photo contains several people.

    Response 200
    ------------
    {
      "ok": true,
      "mode": "enroll" | "match",
      "faces_detected": int,          # all faces found in the image
      "face_index": int,              # which one was used
      "bbox": [x1, y1, x2, y2],       # chosen face, image px
      "det_score": float,             # detector confidence 0..1
      "best_similarity": float|null,  # best cosine vs current gallery
      "threshold": float,             # identity match threshold
      "matched": bool,                # best_similarity >= threshold
      "enrolled": bool,               # mode=enroll only: row inserted
      "duplicate": bool,              # mode=enroll only: rejected as
                                    # near-duplicate (dedupe_cosine)
      "gallery_size": int             # gallery count after the call
    }

    Errors
    ------
    * 400 empty body / undecodable image / bad mode or face_index.
    * 422 no face detected in the image.
    * 503 face models not loaded yet (see `models_error` in /api/status).

    Example
    -------
    curl -X POST "http://localhost:8000/api/enroll/face-image?mode=match" \\
         -H "Content-Type: image/jpeg" --data-binary @selfie.jpg
    """
    import time

    import cv2
    import numpy as np

    from .identity import cosine

    if mode not in ("enroll", "match"):
        raise HTTPException(400, "mode must be 'enroll' or 'match'")
    body = await request.body()
    if not body:
        raise HTTPException(400, "empty body -- send raw image bytes")
    img = cv2.imdecode(np.frombuffer(body, np.uint8), cv2.IMREAD_COLOR)
    if img is None:
        raise HTTPException(400, "undecodable image (jpeg/png/webp expected)")

    p = _pipeline()
    if p.proc.face is None:
        raise HTTPException(
            503, f"face models not ready "
                 f"(models_error={p.models_error!r})")
    faces = p.proc.face.detector.detect(img, t=time.time())
    if not faces:
        raise HTTPException(422, "no face detected in image")
    faces.sort(key=lambda f: (f.bbox[2] - f.bbox[0])
               * (f.bbox[3] - f.bbox[1]), reverse=True)
    if not 0 <= face_index < len(faces):
        raise HTTPException(400, f"face_index {face_index} out of range: "
                                 f"{len(faces)} face(s) detected")
    face = faces[face_index]
    emb = np.asarray(face.embedding, dtype=np.float64)

    best_sim = None
    for blob in p.storage.gallery_embeddings():
        g = np.frombuffer(blob, dtype=np.float32).astype(np.float64)
        s = cosine(emb, g)
        if best_sim is None or s > best_sim:
            best_sim = s
    matched = (best_sim is not None
               and best_sim >= p.proc.identity.threshold)

    enrolled = duplicate = False
    row_id = None
    if mode == "enroll":
        if best_sim is not None \
                and best_sim > p.proc.identity.dedupe_cosine:
            duplicate = True
        else:
            row_id = p.storage.add_gallery(emb, "image_api")
            enrolled = True

    return {
        "ok": True, "mode": mode,
        "faces_detected": len(faces), "face_index": face_index,
        "bbox": [round(v, 1) for v in face.bbox],
        "det_score": round(face.score, 4),
        "best_similarity": (round(best_sim, 4)
                            if best_sim is not None else None),
        "threshold": p.proc.identity.threshold,
        "matched": matched, "enrolled": enrolled, "duplicate": duplicate,
        "row_id": row_id, "gallery_size": p.storage.gallery_count(),
    }


@app.delete("/api/gallery")
def gallery_delete():
    p = _pipeline()
    n = p.storage.clear_gallery()
    p.proc.identity.state = "recherche"
    p.proc.identity.target = None
    return {"ok": True, "deleted": n}


@app.get("/api/gallery")
def gallery_info():
    p = _pipeline()
    return {"count": p.storage.gallery_count()}


# -- calibration -------------------------------------------------------------------
class FloorCalibration(BaseModel):
    img_pts: list[list[float]]   # 4 image points [[x,y],...]
    floor_pts: list[list[float]]  # 4 floor points in metres


@app.post("/api/calibration/floor")
def calibration_floor(body: FloorCalibration):
    p = _pipeline()
    if len(body.img_pts) != 4 or len(body.floor_pts) != 4:
        raise HTTPException(400, "exactly 4 image and 4 floor points required")
    ok = p.proc.set_floor(body.img_pts, body.floor_pts)
    if not ok:
        raise HTTPException(400, "homography failed")
    return {"ok": True, "calibrated": True}


@app.post("/api/calibration/upright")
def calibration_upright():
    p = _pipeline()
    res = p.proc.calibrate_upright()
    if res is None:
        raise HTTPException(409, "not enough recent keypoints — stand in view")
    return {"ok": True, **res}


# -- guided session -----------------------------------------------------------------
class SessionStart(BaseModel):
    simulated: bool = False


@app.post("/api/session/start")
def session_start(body: SessionStart):
    p = _pipeline()
    return p.proc.session.start(simulated=body.simulated)


@app.post("/api/session/stop")
def session_stop():
    return _pipeline().proc.session.stop()


@app.get("/api/sessions")
def sessions():
    return JSONResponse(_STATE["storage"].sessions())


# -- aggregates ----------------------------------------------------------------------
@app.get("/api/minutes")
def minutes(since: float = 0.0, limit: int = 1440):
    rows = _STATE["storage"].minutes_since(int(since * 1000), limit)
    for r in rows:
        for k in ("angles",):
            if isinstance(r.get(k), str):
                try:
                    r[k] = json.loads(r[k])
                except json.JSONDecodeError:
                    pass
    return JSONResponse(rows)


@app.get("/api/days")
def days():
    return JSONResponse(_STATE["storage"].days())


@app.post("/api/days/refresh")
def days_refresh():
    agg = _pipeline().proc.refresh_day()
    return JSONResponse({"ok": agg is not None, "aggregate": agg})


@app.get("/api/episodes")
def episodes(since: float = 0.0, limit: int = 200):
    # `since` is epoch seconds (client clock); rows store epoch ms
    return JSONResponse(_STATE["storage"].episodes(int(since * 1000), limit))


# -- dev recording ---------------------------------------------------------------------
@app.post("/api/record/start")
def record_start():
    return JSONResponse(_pipeline().start_recording())


@app.post("/api/record/stop")
def record_stop():
    return JSONResponse(_pipeline().stop_recording())


def _recordings_dir() -> str:
    return _STATE["cfg"].recordings_dir


def _recording_path(name: str) -> str:
    """Resolve a recording file name inside the recordings dir only."""
    if name != os.path.basename(name) or not name.endswith(".mp4"):
        raise HTTPException(400, "bad recording name")
    return os.path.join(_recordings_dir(), name)


@app.get("/api/recordings")
def list_recordings():
    """List saved dev recordings (name, size, mtime)."""
    out = []
    d = _recordings_dir()
    if os.path.isdir(d):
        for name in sorted(os.listdir(d), reverse=True):
            if not name.endswith(".mp4"):
                continue
            p = os.path.join(d, name)
            try:
                st = os.stat(p)
            except OSError:
                continue
            out.append({"name": name, "size": st.st_size,
                        "mtime": st.st_mtime,
                        "url": f"/api/recordings/{name}"})
    return JSONResponse({"recordings": out})


@app.get("/api/recordings/{name}")
def get_recording(name: str):
    """Download/play a saved recording. Supports HTTP range for <video>."""
    path = _recording_path(name)
    if not os.path.isfile(path):
        raise HTTPException(404, "recording not found")
    return FileResponse(path, media_type="video/mp4", filename=name)


@app.delete("/api/recordings/{name}")
def delete_recording(name: str):
    path = _recording_path(name)
    if not os.path.isfile(path):
        raise HTTPException(404, "recording not found")
    os.remove(path)
    return JSONResponse({"ok": True, "deleted": name})
