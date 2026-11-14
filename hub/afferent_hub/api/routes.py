import ipaddress

from fastapi import APIRouter, Body, Request
from fastapi.responses import JSONResponse, Response

from .. import decline as decline_analyzer, views
from ..service import Hub, HubError

router = APIRouter(prefix="/api")

def hub(request: Request) -> Hub:
    return request.app.state.hub

def _same_machine(request: Request) -> bool:
    try:
        ip = ipaddress.ip_address(request.client.host)
    except (AttributeError, ValueError):
        return False
    return (getattr(ip, "ipv4_mapped", None) or ip).is_loopback

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

@router.get("/patients/{pid}/wellbeing")
async def wellbeing(pid: str, request: Request):
    return await hub(request).voice_context(pid)

@router.get("/patients/{pid}/decline")
async def patient_decline(pid: str, request: Request):
    return await hub(request).decline(pid)

@router.get("/patients/{pid}/patient-view")
async def patient_view(pid: str, request: Request):
    h = hub(request)
    await h.refresh_room(pid)
    return h.patient_view(pid)

@router.get("/patients/{pid}/qr-body")
async def qr_body(pid: str, request: Request):
    h = hub(request)
    await h.refresh_room(pid)
    return h.qr_body(pid)

@router.get("/patients/{pid}/summary")
async def summary(pid: str, request: Request, refresh: int = 0):
    return await hub(request).summary(pid, bool(refresh))

@router.post("/patients/{pid}/privacy")
async def privacy(pid: str, request: Request, body=Body(...)):
    return await hub(request).set_privacy(pid, _obj(body))

@router.post("/patients/{pid}/pause")
async def pause(pid: str, request: Request, body=Body(...)):
    return await hub(request).set_pause(pid, _obj(body))

@router.get("/patients/{pid}/export")
async def export(pid: str, request: Request):
    name, data = hub(request).export(pid)
    return Response(data, media_type="application/zip", headers={"Content-Disposition": f'attachment; filename="{name}"'})

@router.post("/export/publish")
async def export_publish(request: Request, body=Body(...)):
    return hub(request).export_publish(_obj(body))

@router.get("/export/dashboard")
async def export_dashboard(request: Request):
    return Response(hub(request).export_dashboard(), media_type="text/html")

@router.post("/patients/{pid}/flags/clear")
async def flags_clear(pid: str, request: Request):
    await hub(request).clear_flags(pid)
    return {"ok": True}

@router.get("/sessions/{sid}")
async def session(sid: str, request: Request):
    doc = hub(request).store.session(sid)
    if doc is None:
        raise HubError(404, "unknown_session", f"No session with id {sid!r}")
    return views.without_face(doc)

@router.post("/sessions")
async def post_session(request: Request, body=Body(...)):
    return await hub(request).ingest_session(_obj(body))

@router.post("/checkins")
async def post_checkin(request: Request, body=Body(...)):
    return await hub(request).ingest_checkin(_obj(body))

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

@router.get("/demo/decline/scenarios")
async def decline_scenarios():
    return {"scenarios": [
        {"name": name, "description": scenario["description"],
         "ratios": {key: scenario["ratios"].get(key, 1.0) for key in decline_analyzer.INDICATORS}}
        for name, scenario in decline_analyzer.SCENARIOS.items()
    ]}

@router.post("/demo/decline")
async def demo_decline(request: Request, body=Body(None)):
    h = hub(request)
    body = {} if body is None else _obj(body)
    pid = body.get("patient_id") or h.settings.bound_patient
    if not isinstance(pid, str):
        raise HubError(400, "bad_request", "patient_id must be a string")
    h.patient(pid)
    scenario = body.get("scenario")
    if scenario is not None:
        if "scores" in body:
            raise HubError(400, "bad_request", "Specify either scenario or scores, not both")
        if not isinstance(scenario, str) or scenario not in decline_analyzer.SCENARIOS:
            raise HubError(400, "unknown_scenario", f"Unknown decline scenario {scenario!r}")
        h.decline_scenario[pid] = scenario
        h.decline_override.pop(pid, None)
        mode = "scenario"
    else:
        scores = body.get("scores")
        if scores is None or scores == {}:
            scores = decline_analyzer.DEMO_SCORES
        try:
            decline_analyzer.apply_override(
                decline_analyzer.empty_report(h.settings.decline_threshold, h.settings.decline_ref_days,
                                              h.settings.decline_recent_days),
                scores,
            )
        except ValueError as e:
            raise HubError(400, "bad_decline_scores", str(e)) from None
        h.decline_override[pid] = dict(scores)
        h.decline_scenario.pop(pid, None)
        mode = "scores"
    voice_context = await h.push_voice_context(pid)
    return {"ok": True, "mode": mode, "decline": await h.decline(pid), "voice_context": voice_context}

@router.delete("/demo/decline")
async def demo_decline_clear(request: Request, patient_id: str | None = None):
    h = hub(request)
    pid = patient_id or h.settings.bound_patient
    h.patient(pid)
    h.decline_override.pop(pid, None)
    h.decline_scenario.pop(pid, None)
    voice_context = await h.push_voice_context(pid)
    return {"ok": True, "decline": await h.decline(pid), "voice_context": voice_context}

@router.get("/bedside/state")
async def bedside_state(request: Request):
    snap = hub(request).bedside.snapshot()
    if not _same_machine(request):
        snap.pop("pulse", None)
        snap.pop("physio", None)
    return snap

@router.post("/bedside/camera")
async def bedside_camera(request: Request, body=Body(...)):
    b = hub(request).bedside
    await b.set_camera(bool(_obj(body).get("on")))
    return {"ok": True, "camera_on": b.state["camera_on"]}

@router.get("/config/{pid}")
async def config(pid: str, request: Request):
    return hub(request).config(pid)
