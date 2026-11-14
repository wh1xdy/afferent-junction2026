from fastapi import APIRouter, Body, Request
from fastapi.responses import JSONResponse

from ..service import Hub, HubError

router = APIRouter(prefix="/api")


def hub(request: Request) -> Hub:
    return request.app.state.hub


def _obj(body) -> dict:
    if not isinstance(body, dict):
        raise HubError(400, "bad_request", "Body must be a JSON object")
    return body


@router.get("/health")
async def health(request: Request):
    return await hub(request).health()


@router.get("/patients")
async def patients(request: Request):
    return hub(request).patients_list()


@router.get("/patients/{pid}")
async def patient(pid: str, request: Request):
    return hub(request).patient_detail(pid)


@router.get("/patients/{pid}/analytics")
async def analytics(pid: str, request: Request):
    return hub(request).analytics(pid)


@router.get("/patients/{pid}/patient-view")
async def patient_view(pid: str, request: Request):
    return hub(request).patient_view(pid)


@router.get("/patients/{pid}/summary")
async def summary(pid: str, request: Request, refresh: int = 0):
    return await hub(request).summary(pid, bool(refresh))


@router.post("/patients/{pid}/privacy")
async def privacy(pid: str, request: Request, body=Body(...)):
    return await hub(request).set_privacy(pid, _obj(body))


@router.post("/patients/{pid}/flags/clear")
async def flags_clear(pid: str, request: Request):
    await hub(request).clear_flags(pid)
    return {"ok": True}


@router.get("/sessions/{sid}")
async def session(sid: str, request: Request):
    doc = hub(request).store.session(sid)
    if doc is None:
        raise HubError(404, "unknown_session", f"No session with id {sid!r}")
    return doc


@router.post("/sessions")
async def post_session(request: Request, body=Body(...)):
    return await hub(request).ingest_session(_obj(body))


@router.post("/daily")
async def post_daily(request: Request, body=Body(...)):
    return await hub(request).ingest_daily(_obj(body))


@router.get("/validation")
async def validation(request: Request):
    h = hub(request)
    if h.validation is not None:
        return h.validation
    return JSONResponse({"status": h.validation_status}, status_code=202)


@router.post("/demo/reset")
async def demo_reset(request: Request, body=Body(None)):
    seed = body.get("seed") if isinstance(body, dict) else None
    return await hub(request).reset(seed)


@router.post("/demo/profile")
async def demo_profile(request: Request, body=Body(...)):
    body = _obj(body)
    sent = await hub(request).send_profile(body.get("patient_id") or hub(request).settings.bound_patient,
                                           body.get("profile"))
    return {"ok": True, "sent_to": sent}


@router.get("/bedside/state")
async def bedside_state(request: Request):
    return hub(request).bedside.snapshot()


@router.post("/bedside/light")
async def bedside_light(request: Request, body=Body(...)):
    body = _obj(body)
    b = hub(request).bedside
    light = await b.set_light(body.get("rgb") or "#000000", body.get("level") or 0, body.get("fade_ms", 2000),
                              body.get("reason") or "manual", hold_s=body.get("hold_s", 120))
    return {"ok": True, "light": light}


@router.post("/bedside/camera")
async def bedside_camera(request: Request, body=Body(...)):
    b = hub(request).bedside
    await b.set_camera(bool(_obj(body).get("on")))
    return {"ok": True, "camera_on": b.state["camera_on"]}


@router.post("/bedside/simulate")
async def bedside_simulate(request: Request, body=Body(...)):
    body = _obj(body)
    b = hub(request).bedside
    if not hasattr(b.source, "inject"):
        raise HubError(400, "no_simulator", f"Bedside source is {b.source.name}, not the simulator")
    await b.source.inject(body)
    return {"ok": True, "state": b.snapshot()}


@router.get("/config/{pid}")
async def config(pid: str, request: Request):
    return hub(request).config(pid)
