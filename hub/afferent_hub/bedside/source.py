from typing import Awaitable, Callable, Protocol

OnEvent = Callable[[dict], Awaitable[None]]


class BedsideSource(Protocol):
    connected: bool
    name: str

    async def start(self, on_event: OnEvent) -> None: ...

    async def send(self, msg: dict) -> None: ...

    async def stop(self) -> None: ...


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
