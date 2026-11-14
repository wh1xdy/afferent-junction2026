import json
import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from ..service import HubError
from .manager import Client

log = logging.getLogger("afferent.ws")
router = APIRouter()


async def _loop(ws: WebSocket, client: Client, handle):
    hub = ws.app.state.hub
    try:
        while True:
            raw = await ws.receive_text()
            try:
                msg = json.loads(raw)
            except ValueError:
                continue
            if not isinstance(msg, dict):
                continue
            try:
                await handle(client, msg)
            except HubError as e:
                await hub.rooms.send(client, {"type": "error", "error": e.code, "detail": e.detail})
            except Exception:
                log.exception("handler failed for %s message %s", client.room, msg.get("type"))
    except (WebSocketDisconnect, RuntimeError):
        pass
    finally:
        hub.rooms.remove(client)


@router.websocket("/ws/app")
async def ws_app(ws: WebSocket):
    await ws.accept()
    hub = ws.app.state.hub
    client = Client(ws, "app", patient_id=ws.query_params.get("patient"))
    hub.rooms.add(client)
    try:
        await _loop(ws, client, hub.handle_app)
    finally:
        await hub.app_closed(client)


@router.websocket("/ws/clinic")
async def ws_clinic(ws: WebSocket):
    await ws.accept()
    hub = ws.app.state.hub
    client = Client(ws, "clinic")
    hub.rooms.add(client)
    lst = hub.patients_list()
    await hub.rooms.send(client, {"type": "hello", "now_day": lst["now_day"], "patients": lst["patients"]})
    await hub.rooms.send(client, {"type": "bedside_state", **hub.bedside.snapshot()})

    async def handle(c, msg):
        if msg.get("type") == "ping":
            await hub.rooms.send(c, {"type": "pong"})

    await _loop(ws, client, handle)


@router.websocket("/ws/bedside")
async def ws_bedside(ws: WebSocket):
    await ws.accept()
    hub = ws.app.state.hub
    client = Client(ws, "bedside")
    hub.rooms.add(client)
    hub.bedside.ws_devices += 1
    try:
        await _loop(ws, client, hub.handle_bedside)
    finally:
        hub.bedside.ws_devices -= 1
        await hub.bedside.push_state()
