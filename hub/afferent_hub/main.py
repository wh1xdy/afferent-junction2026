import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException as StarletteHTTPException

from .api.routes import router as api_router
from .service import VERSION, Hub, HubError
from .settings import HUB, ROOT, Settings
from .team_adapters import Team
from .team_adapters.routes import router as team_router
from .ws.routes import router as ws_router

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")

CLINIC = HUB / "afferent_hub" / "web" / "clinic"

def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings.from_env()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        app.state.hub = Hub(settings)
        app.state.team = Team(settings)
        app.state.hub.sensors = app.state.team.sensors
        await app.state.hub.start()
        yield
        await app.state.hub.stop()
        app.state.team.close()

    app = FastAPI(title="Afferent hub", version=VERSION, lifespan=lifespan)
    app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

    @app.exception_handler(HubError)
    async def hub_error(request: Request, e: HubError):
        return JSONResponse({"error": e.code, "detail": e.detail}, status_code=e.status)

    @app.exception_handler(RequestValidationError)
    async def bad_request(request: Request, e: RequestValidationError):
        return JSONResponse({"error": "bad_request", "detail": str(e.errors()[:3])}, status_code=400)

    @app.exception_handler(StarletteHTTPException)
    async def http_error(request: Request, e: StarletteHTTPException):
        code = {404: "not_found", 405: "method_not_allowed"}.get(e.status_code, "http_error")
        return JSONResponse({"error": code, "detail": str(e.detail)}, status_code=e.status_code)

    app.include_router(api_router)
    app.include_router(team_router)
    app.include_router(ws_router)

    @app.get("/", include_in_schema=False)
    async def root():
        return RedirectResponse("/clinic/")

    app.mount("/app/design", StaticFiles(directory=ROOT / "design"), name="app-design")
    app.mount("/app", StaticFiles(directory=ROOT / "demo", html=True), name="app")
    app.mount("/contracts", StaticFiles(directory=ROOT / "contracts"), name="contracts")
    app.mount("/clinic", StaticFiles(directory=CLINIC, html=True), name="clinic")
    return app

app = create_app()
