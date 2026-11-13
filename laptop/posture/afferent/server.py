"""FastAPI dashboard + control API for the posture pipeline."""
from __future__ import annotations

import asyncio
import json
import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
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
    storage = Storage(cfg.db_path)
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
    return JSONResponse(_STATE["storage"].episodes(since, limit))


# -- dev recording ---------------------------------------------------------------------
@app.post("/api/record/start")
def record_start():
    return JSONResponse(_pipeline().start_recording())


@app.post("/api/record/stop")
def record_stop():
    return JSONResponse(_pipeline().stop_recording())
