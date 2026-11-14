import asyncio

from fastapi import APIRouter, Body, Request
from fastapi.responses import HTMLResponse, JSONResponse

from .. import modules, views
from ..service import HubError
from .data_manager import SensorError

router = APIRouter(prefix="/api")


def _ctx(request: Request):
    return request.app.state.hub, request.app.state.team


def _days(days) -> int:
    try:
        return max(1, min(90, int(days)))
    except (TypeError, ValueError):
        raise HubError(400, "bad_request", "days must be a whole number") from None


def _off(setting: str):
    raise HubError(404, "module_disabled", f"Team module is off; set {setting} to enable it")


async def _sensor(call, *args, **kw):
    try:
        return await asyncio.to_thread(call, *args, **kw)
    except SensorError as e:
        status = e.status if e.status in (400, 404) else 502
        raise HubError(status, "data_manager_error", str(e))


def _bound(hub, pid: str) -> dict:
    p = hub.patient(pid)
    if pid != hub.settings.bound_patient:
        raise HubError(404, "not_bound", f"Room sensors belong to {hub.settings.bound_patient!r}, not {pid!r}")
    return p


@router.get("/team/modules")
async def team_modules(request: Request):
    return request.app.state.team.status()


@router.get("/patients/{pid}/fhir")
async def fhir(pid: str, request: Request, days: int = 14):
    hub, team = _ctx(request)
    if not team.settings.team_fhir:
        _off("AFFERENT_TEAM_FHIR=1")
    p, days = hub.patient(pid), _days(days)
    readings = []
    pulse_on = (hub.privacy(pid).get("sensors") or {}).get("pulse_stone", False)
    if team.settings.team_fhir_vitals and team.sensors.enabled and pid == hub.settings.bound_patient and pulse_on:
        readings = await _sensor(team.sensors.finger_readings, days)
    bundle = modules.fn["team_fhir_bundle"](p, hub.store.checkins(pid), days, readings)
    return JSONResponse(bundle, media_type="application/fhir+json")


@router.get("/patients/{pid}/report")
async def report(pid: str, request: Request, days: int = 14, narrative: int = 0):
    hub, team = _ctx(request)
    if not team.settings.team_report:
        _off("AFFERENT_TEAM_REPORT=1")
    p = hub.patient(pid)
    text = (await hub.summary(pid)).get("text") if narrative else None
    return HTMLResponse(modules.fn["team_clinician_report"](p, hub.store.checkins(pid), _days(days), text))


@router.post("/patients/{pid}/ask")
async def ask(pid: str, request: Request, body=Body(...)):
    hub, team = _ctx(request)
    if not team.settings.team_ask_url:
        _off("AFFERENT_TEAM_ASK_URL")
    hub.patient(pid)
    question = str((body or {}).get("question") or "").strip() if isinstance(body, dict) else ""
    if not question:
        raise HubError(400, "bad_request", "Body needs 'question'")
    days = _days(body.get("days", 14))
    try:
        return await asyncio.to_thread(modules.fn["team_ask"], question, hub.store.checkins(pid),
                                       team.settings.team_ask_url, days)
    except OSError as e:
        raise HubError(502, "llm_unreachable", str(e))
    except (KeyError, IndexError, ValueError) as e:
        raise HubError(502, "llm_bad_response", f"{type(e).__name__}: {e}")


@router.get("/sensors/{name}")
async def sensors(name: str, request: Request):
    _, team = _ctx(request)
    if not team.sensors.enabled:
        _off("AFFERENT_DATA_MANAGER_URL")
    return await _sensor(team.sensors.get, name, dict(request.query_params))


@router.get("/patients/{pid}/sensors/room")
async def room(pid: str, request: Request, days: int = 14):
    hub, team = _ctx(request)
    if not team.sensors.enabled:
        _off("AFFERENT_DATA_MANAGER_URL")
    p = _bound(hub, pid)
    out = await _sensor(team.sensors.room_daily, _days(days))
    for d in out["days"]:
        d["day_index"] = views.day_index(p, d["date"])
    return {"patient_id": pid, "source": "data_manager", **out}
