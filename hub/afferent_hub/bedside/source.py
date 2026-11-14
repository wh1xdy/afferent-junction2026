from typing import Awaitable, Callable

OnEvent = Callable[[dict], Awaitable[None]]


class NullSource:
    def __init__(self, name: str = "off"):
        self.name = name
        self.connected = False

    async def start(self, on_event: OnEvent) -> None:
        return None

    async def send(self, msg: dict) -> None:
        return None

    async def stop(self) -> None:
        return None
