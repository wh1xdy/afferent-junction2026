import asyncio
import json
import logging
from dataclasses import dataclass, field

from fastapi import WebSocket

log = logging.getLogger("afferent.ws")


@dataclass(eq=False)
class Client:
    ws: WebSocket
    room: str
    patient_id: str | None = None
    role: str | None = None
    device_id: str | None = None
    session_id: str | None = None
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)


class Rooms:
    def __init__(self):
        self.clients: dict[str, set[Client]] = {"app": set(), "clinic": set(), "bedside": set()}

    def add(self, client: Client):
        self.clients[client.room].add(client)

    def remove(self, client: Client):
        self.clients[client.room].discard(client)

    def count(self, room: str, patient_id: str | None = None) -> int:
        return sum(1 for c in self.clients[room] if patient_id is None or c.patient_id == patient_id)

    async def send(self, client: Client, msg: dict) -> bool:
        try:
            async with client.lock:
                await asyncio.wait_for(client.ws.send_text(json.dumps(msg)), 5)
            return True
        except Exception as e:
            log.info("dropping %s client: %s", client.room, e)
            self.remove(client)
            return False

    async def broadcast(self, room: str, msg: dict, patient_id: str | None = None, role: str | None = None) -> int:
        targets = [c for c in list(self.clients[room])
                   if (patient_id is None or c.patient_id in (patient_id, None))
                   and (role is None or c.role in (role, None))]
        if not targets:
            return 0
        results = await asyncio.gather(*(self.send(c, msg) for c in targets))
        return sum(results)
